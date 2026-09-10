// Package analysis and conformance validation run here, off the thread that
// paints keystrokes. The tool ships as static files with no build step, and a
// worker gets no import map, so the page resolves the four module names and
// posts the resolved URLs; everything else this worker uses is imported by
// relative path, which needs no map.

import { createPackageSha256, sha256Hex } from "./package-hashes.mjs";

let analyzePackage;
let validatePackage;
let createFileMapHost;
let migratePackage;
let schemas = null;
const files = new Map();
let folders = [];
let withExplicitFolders;
let collectionDrawerFolders;

async function loadModules(urls) {
  const [analysis, validation, host, migration, folderHost] = await Promise.all([
    import(urls.analysis),
    import(urls.validation),
    import(urls.fileMapHost),
    import(urls.migration),
    import("./folder-aware-host.mjs")
  ]);
  analyzePackage = analysis.analyzePackage;
  validatePackage = validation.validatePackage;
  createFileMapHost = host.createFileMapHost;
  migratePackage = migration.migratePackage;
  withExplicitFolders = folderHost.withExplicitFolders;
  collectionDrawerFolders = folderHost.collectionDrawerFolders;
}

// The full documents map would send the package text over the worker boundary
// again, while the page only needs one count per file.
function analysisFor(revision) {
  const result = analyzePackage(files, { folders: collectionDrawerFolders(folders) });
  return {
    type: "analysis",
    revision,
    analysis: {
      // Keep this rule aligned with authoring-view's on-page fallback.
      wordCounts: Object.fromEntries([...result.documents].map(([file, text]) => [file, text.trim() ? text.trim().split(/\s+/u).length : 0])),
      definitionsByName: result.definitionsByName,
      nameIndex: result.nameIndex,
      anchors: result.anchors,
      manifest: result.manifest
    }
  };
}

async function handle(message) {
  if (message.type === "modules") return loadModules(message.urls);
  if (message.type === "files") {
    for (const path of message.removed) files.delete(path);
    for (const [path, value] of message.set) files.set(path, value);
    folders = message.folders ?? [];
    return;
  }
  if (message.type === "schemas") {
    schemas = message.schemas;
    return;
  }
  if (message.type === "analyze") return postMessage(analysisFor(message.revision));
  if (message.type === "validate") {
    try {
      const sha256 = await createPackageSha256(files);
      const host = withExplicitFolders(createFileMapHost(files, { schemas, bytes: false, sha256 }), folders);
      const run = validatePackage(host, "/package");
      postMessage({ type: "validation", revision: message.revision, run });
    } catch (error) {
      // A validator crash is the page's to report, not this worker's to die of.
      postMessage({ type: "validation", revision: message.revision, message: error.message });
    }
  }
  if (message.type === "migrate") {
    try {
      const host = withExplicitFolders(createFileMapHost(files, { schemas, bytes: true, sha256: sha256Hex }), folders);
      const report = migratePackage(host, "/package", { dryRun: true, collectOutputs: true });
      postMessage({ type: "migration", request: message.request, report });
    } catch (error) {
      postMessage({ type: "migration", request: message.request, message: error.message });
    }
  }
}

// Strictly in order: a file update must never overtake the job it belongs to,
// and the module load must finish before the first job runs.
let queue = Promise.resolve();
addEventListener("message", event => {
  queue = queue
    .then(() => handle(event.data))
    .catch(error => postMessage({ type: "failed", message: error.message }));
});
