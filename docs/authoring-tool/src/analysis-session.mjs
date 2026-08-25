import { analyzePackage } from "opengdd-analysis";
import { createFileMapHost } from "opengdd-file-map-host";
import { validatePackage } from "opengdd-validation";
import { buildAuthoringView } from "./authoring-view.mjs";
import { collectionDrawerFolders, withExplicitFolders } from "./folder-aware-host.mjs";

const debounce = (action, delay) => {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), typeof delay === "function" ? delay() : delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

export function createAnalysisSession({
  schemas,
  revisionFor = () => undefined,
  folders = () => [],
  Worker,
  analysisDelay = 150,
  validationDelay = 400
} = {}) {
  const subscribers = new Set();
  const workerFiles = new Map();
  let workerFolders = [];
  let files = new Map();
  let worker = null;
  let postedSchemas = null;
  let analysisRevision = 0;
  let validationRevision = 0;
  let completeAfterAnalysis = true;
  let destroyed = false;

  const publish = delivery => {
    if (destroyed) return;
    for (const subscriber of subscribers) subscriber(delivery);
  };

  function applyAnalysis(analysis, revision, shouldPublish = true) {
    if (destroyed || revision !== analysisRevision) return null;
    const authoringView = buildAuthoringView(analysis, revisionFor, files.keys());
    if (shouldPublish) publish({ type: "view", view: authoringView, complete: completeAfterAnalysis });
    return authoringView;
  }

  function postToWorker(message) {
    try {
      worker.postMessage(message);
      return true;
    } catch {
      stopWorker();
      return false;
    }
  }

  function sendPackageToWorker() {
    const set = [];
    const removed = [];
    const currentFolders = [...folders()].map(String).sort((left, right) => left.localeCompare(right));
    for (const [path, value] of files) {
      if (workerFiles.get(path) !== value) set.push([path, value]);
    }
    for (const path of workerFiles.keys()) {
      if (!files.has(path)) removed.push(path);
    }
    const foldersChanged = currentFolders.length !== workerFolders.length
      || currentFolders.some((folder, index) => folder !== workerFolders[index]);
    if (!set.length && !removed.length && !foldersChanged) return true;
    if (!postToWorker({ type: "files", set, removed, folders: currentFolders })) return false;
    for (const [path, value] of set) workerFiles.set(path, value);
    for (const path of removed) workerFiles.delete(path);
    workerFolders = currentFolders;
    return true;
  }

  function stopWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    publish({ type: "worker", active: false });
    completeAfterAnalysis = true;
    applyAnalysis(analyzePackage(files, { folders: collectionDrawerFolders(folders()) }), ++analysisRevision);
    validateNow();
  }

  function receiveFromWorker(message) {
    if (message.type === "analysis") {
      applyAnalysis(message.analysis, message.revision);
      return;
    }
    if (message.type === "validation") {
      if (destroyed || message.revision !== validationRevision) return;
      publish({
        type: "validation",
        validation: message.run
          ? { status: "ready", run: message.run }
          : { status: "crashed", run: null, message: message.message }
      });
      return;
    }
    stopWorker();
  }

  try {
    if (typeof Worker === "function" && typeof import.meta.resolve === "function") {
      const workerUrl = new URL("./worker.mjs", import.meta.url);
      workerUrl.search = new URL(import.meta.url).search;
      worker = new Worker(workerUrl, { type: "module" });
      worker.addEventListener("message", event => receiveFromWorker(event.data));
      worker.addEventListener("error", stopWorker);
      worker.addEventListener("messageerror", stopWorker);
      worker.postMessage({
        type: "modules",
        urls: {
          analysis: import.meta.resolve("opengdd-analysis"),
          validation: import.meta.resolve("opengdd-validation"),
          fileMapHost: import.meta.resolve("opengdd-file-map-host")
        }
      });
    }
  } catch {
    worker?.terminate();
    worker = null;
    queueMicrotask(() => publish({ type: "worker", active: false }));
  }

  const deliverAnalysis = debounce(revision => {
    if (revision !== analysisRevision) return;
    if (!worker) {
      applyAnalysis(analyzePackage(files, { folders: collectionDrawerFolders(folders()) }), revision);
      return;
    }
    if (sendPackageToWorker()) postToWorker({ type: "analyze", revision });
  }, analysisDelay);

  async function suppliedSchemas() {
    return typeof schemas === "function" ? schemas() : schemas;
  }

  async function validate(version) {
    let available;
    try {
      available = await suppliedSchemas();
    } catch {
      if (version === validationRevision) publish({ type: "validation", validation: { status: "unavailable", run: null } });
      return;
    }
    if (destroyed || version !== validationRevision) return;
    if (worker) {
      if (postedSchemas !== available && !postToWorker({ type: "schemas", schemas: available })) return;
      postedSchemas = available;
      if (sendPackageToWorker()) postToWorker({ type: "validate", revision: version });
      return;
    }
    try {
      const host = withExplicitFolders(createFileMapHost(files, { schemas: available, bytes: false }), folders());
      const run = validatePackage(host, "/package");
      if (version === validationRevision) publish({ type: "validation", validation: { status: "ready", run } });
    } catch (error) {
      if (version === validationRevision) publish({ type: "validation", validation: { status: "crashed", run: null, message: error.message } });
    }
  }

  const validateSoon = debounce(validate, validationDelay);

  function validateNow() {
    const version = ++validationRevision;
    publish({ type: "validation", validation: { status: "pending", run: null } });
    validateSoon(version);
  }

  function fileChanged({ immediate = false, complete = true, publish: shouldPublish = true, supersede = true } = {}) {
    if (immediate && !supersede) return buildAuthoringView(analyzePackage(files, { folders: collectionDrawerFolders(folders()) }), revisionFor, files.keys());
    if (!immediate || shouldPublish) completeAfterAnalysis = complete;
    const revision = ++analysisRevision;
    if (immediate) {
      deliverAnalysis.cancel();
      return applyAnalysis(analyzePackage(files, { folders: collectionDrawerFolders(folders()) }), revision, shouldPublish);
    }
    if (shouldPublish) publish({ type: "view", view: null, complete });
    deliverAnalysis(revision);
    return null;
  }

  function openPackage(nextFiles) {
    files = nextFiles;
    postedSchemas = null;
    fileChanged({ complete: false });
    validateNow();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    worker?.terminate();
    worker = null;
    deliverAnalysis.cancel();
    validateSoon.cancel();
    analysisRevision += 1;
    validationRevision += 1;
    subscribers.clear();
  }

  return Object.freeze({
    openPackage,
    fileChanged,
    validateNow,
    destroy,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      subscriber({ type: "worker", active: Boolean(worker) });
      return () => subscribers.delete(subscriber);
    }
  });
}
