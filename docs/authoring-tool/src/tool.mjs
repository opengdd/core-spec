import { analyzePackage, resolveAnchor } from "opengdd-analysis";
import { unfencedLines } from "opengdd-syntax";
import { createFileMapHost } from "opengdd-file-map-host";
import { validatePackage } from "opengdd-validation";
import { classifyCreation, insertJsonValue, parseJsonScalar } from "./creation.mjs";
import { deleteDraft, draftNeedsExampleUpdate, listDrafts, saveDraft } from "./drafts.mjs";
import { createScaffoldPackage, packageIdFromTitle } from "./package.mjs";
import { readZip } from "./zip.mjs";
import { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";
import { writeZip } from "./zip-write.mjs";

export { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";

const SCHEMA_NAMES = ["manifest.schema.json", "tuning.schema.json", "personalization.schema.json", "direction.schema.json", "opengdd-build.schema.json"];
const HIDDEN_LEGACY_DRAFTS = new Set(["lantern-demo"]);
const MAX_WRAPPED_TEXT_CHARS = 200_000;

// Lines rendered beyond the viewport in the large-file, unwrapped fallback.
const OVERLAY_MARGIN = 60;

const KIND_LABELS = {
  tunable: "tunable",
  constant: "constant",
  section: "section",
  "acceptance-test": "acceptance test",
  descriptor: "descriptor",
  question: "personalization question",
  name: "name",
  "collection-record": "collection record",
  file: "file",
  rule: "rule"
};

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const parentPath = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const basename = path => path.slice(path.lastIndexOf("/") + 1);
const debounce = (action, delay) => {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), typeof delay === "function" ? delay() : delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

function normalizePath(value) {
  const path = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  if (!path || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) {
    throw new Error("Use a package-relative path without . or .. segments.");
  }
  return path;
}

function foldersFor(files, explicit = new Set()) {
  const folders = new Set(explicit);
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  return folders;
}

function packageFrom(value, decodeBinary) {
  // Accepted file shapes: a Map, entry pairs (the browser-draft wire shape),
  // or {path, text|base64} objects (the serialized wire shape).
  const files = value.files instanceof Map
    ? new Map(value.files)
    : new Map((value.files ?? []).map(file => Array.isArray(file) ? [file[0], file[1]] : [file.path,
      typeof file.text === "string" ? file.text : typeof file.base64 === "string" ? decodeBinary(file.base64) : null
    ]));
  return {
    id: value.id,
    title: value.title ?? value.name ?? value.id,
    // Built-in drafts retain the exact example revision they forked from.
    // A missing value is intentionally preserved for pre-revision drafts so
    // the UI can warn instead of silently treating them as current.
    baseRevision: typeof value.baseRevision === "string" ? value.baseRevision : null,
    repositoryPath: value.path ?? null,
    // Reader links point at repository files, so only paths that came from the
    // repository may offer one — a file created or moved here has no such twin.
    repositoryFiles: new Set(value.path ? files.keys() : []),
    files,
    folders: foldersFor(files, new Set(value.folders ?? []))
  };
}

// The engine's kinds are a closed set, but the tool is embeddable and may meet
// a newer engine; an unrecognised kind falls back to the layer-1 vocabulary.
function kindClass(kind) {
  return ["tunable", "constant", "section", "acceptance-test", "descriptor", "question", "collection-record", "rule", "file"].includes(kind)
    ? kind
    : "name";
}

function anchorClass(anchor) {
  const kind = anchor.classification === "known" ? kindClass(anchor.definitions[0]?.kind) : anchor.classification;
  return `opengdd-author-anchor opengdd-author-anchor--${anchor.classification} opengdd-author-kind--${kind}`;
}

function anchorsByLine(anchors) {
  const byLine = new Map();
  for (const anchor of anchors) {
    const line = anchor.range.start.line;
    const current = byLine.get(line) ?? [];
    current.push(anchor);
    byLine.set(line, current);
  }
  for (const line of byLine.values()) line.sort((left, right) => left.range.start.character - right.range.start.character);
  return byLine;
}

function renderOverlayLine(line, anchors) {
  if (!anchors) return escapeHtml(line);
  let cursor = 0;
  let output = "";
  for (const anchor of anchors) {
    const start = anchor.range.start.character;
    const end = anchor.range.end.character;
    if (start < cursor) continue;
    output += escapeHtml(line.slice(cursor, start));
    output += `<span class="${anchorClass(anchor)}" data-anchor-name="${escapeHtml(anchor.name)}">${escapeHtml(line.slice(start, end))}</span>`;
    cursor = end;
  }
  return output + escapeHtml(line.slice(cursor));
}

function lineStartsFor(text) {
  const starts = [0];
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
  return starts;
}

function lineAt(text, starts, index) {
  const end = index + 1 < starts.length ? starts[index + 1] - 1 : text.length;
  return text.slice(starts[index], end);
}

function updateLineStarts(starts, previous, next, selection) {
  if (!starts.length || !selection) return lineStartsFor(next);
  const { start, end } = selection;
  const insertedLength = next.length - previous.length + end - start;
  if (insertedLength < 0
    || previous.slice(start, end).includes("\n")
    || next.slice(start, start + insertedLength).includes("\n")) return lineStartsFor(next);
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= start) low = middle; else high = middle - 1;
  }
  const delta = insertedLength - (end - start);
  for (let index = low + 1; index < starts.length; index += 1) starts[index] += delta;
  return starts;
}

function textRange(text, index, length) {
  const before = text.slice(0, index);
  const line = (before.match(/\n/g) ?? []).length;
  const character = index - before.lastIndexOf("\n") - 1;
  return {
    start: { line, character },
    end: { line, character: character + length }
  };
}

// Unknown names the engine does not yet index — the raw material of a
// quick-fix. Fence handling comes from the shared syntax helper so this can
// never drift from what the engine and the validator consider prose.
function creationMentions(text, definitionsByName, file) {
  const anchors = [];
  for (const item of unfencedLines(text)) {
    for (const match of item.text.matchAll(/`([^`\r\n]+)`/g)) {
      const resolution = resolveAnchor(definitionsByName, match[1]);
      if (resolution.classification !== "unknown") continue;
      const character = match.index + 1;
      anchors.push({
        ...resolution,
        file,
        range: { start: { line: item.line - 1, character }, end: { line: item.line - 1, character: character + match[1].length } }
      });
    }
  }
  return anchors;
}

// Scanned backwards from the caret rather than over the text before it: this
// runs on every keystroke, and a whole chapter must not be copied to find out
// that the word under the caret is not a name.
function completionContext(textarea) {
  const value = textarea.value;
  const caret = textarea.selectionStart ?? value.length;
  for (let index = caret - 1; index >= 0; index -= 1) {
    if (value[index] === "`") return { backtick: index, caret, prefix: value.slice(index + 1, caret) };
    if (/\s/.test(value[index])) return null;
  }
  return null;
}

function valueText(value) {
  if (value === undefined) return "";
  const rendered = JSON.stringify(value);
  return rendered === undefined ? String(value) : rendered;
}

export function mountAuthoringTool(rootElement, host = {}) {
  const document = rootElement?.ownerDocument;
  const view = document?.defaultView;
  if (!view || !(rootElement instanceof view.Element)) throw new TypeError("mountAuthoringTool requires a root element.");
  const headingLevel = Number.isInteger(host.headingLevel) && host.headingLevel >= 1 && host.headingLevel <= 6
    ? host.headingLevel
    : 1;
  const headingTag = `h${headingLevel}`;
  const listeners = new view.AbortController();
  const on = (element, type, listener) => element.addEventListener(type, listener, { signal: listeners.signal });
  const decodeBinary = encoded => Uint8Array.from(view.atob(encoded), character => character.charCodeAt(0));
  let destroyed = false;
  rootElement.classList.add("opengdd-authoring");
  rootElement.innerHTML = `
    <header class="opengdd-author-topbar">
      <div class="opengdd-author-identity"><p class="opengdd-author-kicker">OpenGDD</p><div class="opengdd-author-heading"><${headingTag} class="opengdd-author-title">Authoring tool</${headingTag}><span class="opengdd-author-version">Preview · v${AUTHORING_TOOL_VERSION}</span></div></div>
      <div class="opengdd-author-loaders" aria-label="Package controls">
        <div class="opengdd-author-source">
          <p class="opengdd-author-source-label">Package</p>
          <div class="opengdd-author-source-row">
            <select data-role="package" aria-label="Package" disabled><option value="">Loading packages…</option></select>
            <button type="button" data-action="new-package">New package</button>
            <button type="button" data-action="package-delete" data-role="package-delete" hidden>Delete</button>
          </div>
        </div>
        <div class="opengdd-author-source">
          <p class="opengdd-author-source-label">Package file</p>
          <div class="opengdd-author-source-row">
            <label class="opengdd-author-import">Import ZIP<input data-role="zip" type="file" accept=".zip,application/zip"></label>
            <button type="button" data-action="export">Export ZIP</button>
          </div>
        </div>
        <div class="opengdd-author-draft-confirm" data-role="package-confirm" role="alertdialog" aria-label="Confirm package action" hidden></div>
      </div>
      <form class="opengdd-author-package-form" data-role="package-form" hidden>
        <label>Package title<input data-role="package-title" required autocomplete="off"></label>
        <label>Package id<input data-role="package-id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autocomplete="off"></label>
        <button type="submit">Create package</button><button type="button" data-action="package-cancel">Cancel</button>
      </form>
      <p class="opengdd-author-notice" data-role="notice" aria-live="polite"></p>
    </header>
    <div class="opengdd-author-workspace">
      <aside class="opengdd-author-tree-panel" aria-label="Package files">
        <header><div><p class="opengdd-author-kicker">Package</p><h2 data-role="title"></h2></div></header>
        <div class="opengdd-author-tree-actions">
          <button type="button" data-action="new-file">+ File</button>
          <button type="button" data-action="new-folder">+ Folder</button>
          <button type="button" data-action="rename" disabled>Rename</button>
        </div>
        <form class="opengdd-author-inline-form" data-role="tree-form" hidden>
          <label><span data-role="tree-prompt"></span><input data-role="tree-input" autocomplete="off"></label>
          <button type="submit">Save</button><button type="button" data-action="tree-cancel">Cancel</button>
        </form>
        <div class="opengdd-author-tree" data-role="tree" tabindex="0"><p>Loading package…</p></div>
        <p class="opengdd-author-drop-note">Drop a zip here, or drag an item onto a folder to move it.</p>
      </aside>
      <section class="opengdd-author-editor-panel" aria-label="File editor">
        <header class="opengdd-author-file-heading"><span class="opengdd-author-file-path" data-role="path"></span><span class="opengdd-author-file-meta"><a data-role="reader" hidden>Open in reader</a><span data-role="mode"></span></span></header>
        <div class="opengdd-author-editor" data-role="editor">
          <pre class="opengdd-author-highlight" data-role="highlight" aria-hidden="true"></pre>
          <textarea data-role="textarea" aria-label="Markdown source" wrap="soft" spellcheck="false"></textarea>
          <pre class="opengdd-author-json" data-role="json" tabindex="0"></pre>
          <div class="opengdd-author-empty" data-role="empty"></div>
          <div class="opengdd-author-caret-mirror" data-role="mirror" aria-hidden="true"></div>
          <ul class="opengdd-author-completions" data-role="completions" aria-label="Completion results"></ul>
          <div class="opengdd-author-quickfix" data-role="quickfix" role="dialog" hidden></div>
        </div>
      </section>
      <aside class="opengdd-author-inspector" aria-label="Context and validation">
        <section>
          <p class="opengdd-author-kicker">In context</p>
          <div data-role="hover" aria-live="polite"><p class="opengdd-author-muted">Hover a colored name, or move the caret into one.</p></div>
        </section>
        <details class="opengdd-author-diagnostics" open>
          <summary><span>Validation</span><span data-role="diagnostic-summary">Checking…</span></summary>
          <div data-role="diagnostics" aria-live="polite"><p class="opengdd-author-muted">Checking package conformance…</p></div>
        </details>
      </aside>
    </div>
    <footer class="opengdd-author-status" data-role="status" aria-live="polite"></footer>`;

  const find = role => rootElement.querySelector(`[data-role="${role}"]`);
  const ui = {
    packageSelect: find("package"), packageDelete: find("package-delete"), packageConfirm: find("package-confirm"), notice: find("notice"),
    packageForm: find("package-form"), packageTitle: find("package-title"), packageId: find("package-id"),
    title: find("title"), tree: find("tree"), treeForm: find("tree-form"), treePrompt: find("tree-prompt"),
    treeInput: find("tree-input"), path: find("path"), reader: find("reader"), mode: find("mode"), editor: find("editor"),
    highlight: find("highlight"), textarea: find("textarea"), json: find("json"), empty: find("empty"),
    mirror: find("mirror"), completions: find("completions"), quickfix: find("quickfix"), hover: find("hover"), status: find("status"), zip: find("zip"),
    diagnostics: find("diagnostics"), diagnosticSummary: find("diagnostic-summary")
  };
  const initialPackage = packageFrom({ id: "", title: "Loading package…", files: [] }, decodeBinary);
  const state = {
    package: initialPackage,
    analysis: analyzePackage(initialPackage.files),
    openPath: "",
    selected: null,
    collapsed: new Set(),
    completion: -1,
    formAction: null,
    pendingDelete: null,
    builtins: [],
    drafts: [],
    packageRevision: 0,
    dragged: null,
    hoverName: "",
    quickfix: null,
    validation: { status: "pending", run: null }
  };

  // One span per logical line keeps wrapping identical to the textarea while
  // allowing a keystroke to replace only the line that changed. The full file
  // remains in the overlay, so wrapped lines contribute their real height.
  const overlay = {
    lines: [], elements: [], markup: [], analysisLines: [], byLine: new Map(),
    lineStarts: [], first: 0, last: -1, dirty: true
  };
  const overlayWidth = document.createElement("span");
  overlayWidth.className = "opengdd-author-overlay-width";
  let overlayFrame = 0;
  let completionsPending = false;
  let editorTextRevision = 0;
  let editorAnchorCache = { analysis: null, path: "", revision: -1, anchors: [] };
  let editorBeforeInput = null;

  function report(message, error = false) {
    if (destroyed) return;
    ui.notice.textContent = message;
    ui.notice.classList.toggle("opengdd-author-is-error", error);
  }

  // The pending package is captured at schedule time so a package switch
  // cannot retarget an in-flight save to the wrong draft.
  let pendingSave = null;
  let packageConfirmReturnFocus = null;
  const persistDraft = debounce(async (announce = true) => {
    const pending = pendingSave;
    pendingSave = null;
    if (!pending) return;
    try {
      await saveDraft(pending);
      if (announce) report("Working copy saved in this browser.");
      await refreshPackages(state.package.id);
    } catch (error) {
      report(`Browser draft could not be saved: ${error.message}`, true);
    }
  }, 450);
  function saveWorkingCopy(announce = true) {
    if (!state.package.id) return;
    pendingSave = state.package;
    persistDraft(announce);
  }
  // Fires a pending save immediately (package switch, destroy) so the last
  // edits of the previous package are never dropped.
  function flushWorkingCopy() {
    if (!pendingSave) return;
    persistDraft.cancel();
    const pending = pendingSave;
    pendingSave = null;
    saveDraft(pending).then(() => refreshPackages(state.package.id)).catch(() => {});
  }

  // Analysis and validation run in a worker so that neither can stand in
  // front of a keystroke. A worker gets no import map, so the page resolves
  // the module names and the worker imports the same three files. Where a
  // browser will not give us one, everything runs here exactly as before.
  const workerFiles = new Map();
  let worker = null;
  let postedSchemas = null;
  try {
    if (typeof view.Worker === "function" && typeof import.meta.resolve === "function") {
      const workerUrl = new URL("./worker.mjs", import.meta.url);
      workerUrl.search = new URL(import.meta.url).search;
      worker = new view.Worker(workerUrl, { type: "module" });
      on(worker, "message", event => receiveFromWorker(event.data));
      on(worker, "error", () => stopWorker("it could not start"));
      on(worker, "messageerror", () => stopWorker("a result could not be read"));
      // Posted raw, not through postToWorker: this runs during the mount, and
      // the catch below is the right handler for it — the fallback the rest of
      // the mount then follows.
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
    // Nothing has been asked of it yet, so there is nothing to recover: the
    // main-thread path below is the whole fallback.
    worker?.terminate();
    worker = null;
  }

  // A post that throws — a package the structured clone cannot carry, a
  // worker already gone — must hand the work back to the page rather than
  // leave the designer looking at a verdict that never arrives.
  function postToWorker(message) {
    try {
      worker.postMessage(message);
      return true;
    } catch (error) {
      stopWorker(error.message);
      return false;
    }
  }

  // Only what changed crosses the boundary: the worker keeps its own copy of
  // the package between jobs.
  function sendPackageToWorker() {
    const set = [];
    const removed = [];
    for (const [path, value] of state.package.files) {
      if (workerFiles.get(path) !== value) set.push([path, value]);
    }
    for (const path of workerFiles.keys()) {
      if (!state.package.files.has(path)) removed.push(path);
    }
    if (!set.length && !removed.length) return true;
    // The mirror only moves once the worker has the change, so a post that
    // fails cannot make the next delta skip it.
    if (!postToWorker({ type: "files", set, removed })) return false;
    for (const [path, value] of set) workerFiles.set(path, value);
    for (const path of removed) workerFiles.delete(path);
    return true;
  }

  function stopWorker(reason) {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    report(`Background checking is running in the page instead (${reason}).`);
    // Through applyAnalysis, so the fallback leaves the designer with the same
    // colors, counts and completions the worker would have.
    completeAfterAnalysis = true;
    applyAnalysis(analyzePackage(state.package.files), ++analysisRevision);
    validationChanged();
  }

  let analysisRevision = 0;

  function applyAnalysis(analysis, revision) {
    if (destroyed || revision !== analysisRevision) return;
    state.analysis = analysis;
    state.hoverName = "";
    renderEditorAnalysis();
    renderStatus();
    // Completions are offered from the analysis they belong to, so they wait
    // for it rather than repeating the previous one.
    if (completeAfterAnalysis) complete();
  }

  // A structural change — a new package, a move, a new file — re-analyzes here
  // and now: it happens once, the render that follows reads the result, and
  // any worker result still in flight belongs to the package before it.
  function analyzeNow() {
    analysisRevision += 1;
    state.analysis = analyzePackage(state.package.files);
  }

  let completeAfterAnalysis = true;

  const analyzeSoon = debounce((showCompletion = true) => {
    completeAfterAnalysis = showCompletion;
    const revision = ++analysisRevision;
    if (!worker) {
      applyAnalysis(analyzePackage(state.package.files), revision);
      return;
    }
    if (sendPackageToWorker()) postToWorker({ type: "analyze", revision });
  }, () => ui.textarea.value.length > MAX_WRAPPED_TEXT_CHARS ? 300 : 150);

  function receiveFromWorker(message) {
    if (message.type === "analysis") {
      applyAnalysis(message.analysis, message.revision);
      return;
    }
    if (message.type === "validation") {
      if (destroyed || message.revision !== validationRevision) return;
      state.validation = message.run
        ? { status: "ready", run: message.run }
        : { status: "crashed", run: null, message: message.message };
      renderDiagnostics();
      renderStatus();
      return;
    }
    stopWorker(message.message);
  }

  let validationRevision = 0;

  async function suppliedSchemas() {
    const schemas = await (typeof host.schemas === "function" ? host.schemas() : host.schemas);
    const missing = SCHEMA_NAMES.filter(name => !(schemas instanceof Map ? schemas.get(name) : schemas?.[name]));
    if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
    return schemas;
  }

  async function validate(version) {
    let schemas;
    try {
      schemas = await suppliedSchemas();
    } catch {
      if (version !== validationRevision) return;
      state.validation = { status: "unavailable", run: null };
      renderDiagnostics();
      renderStatus();
      return;
    }
    if (destroyed || version !== validationRevision) return;
    if (worker) {
      // Hosts may replace their schemas — a failed load that later succeeds,
      // a host that swaps them — so the worker follows whatever this run got.
      if (postedSchemas !== schemas && !postToWorker({ type: "schemas", schemas })) return;
      postedSchemas = schemas;
      if (sendPackageToWorker()) postToWorker({ type: "validate", revision: version });
      return;
    }
    try {
      const run = validatePackage(createFileMapHost(state.package.files, { schemas, bytes: false }), "/package");
      if (version !== validationRevision) return;
      state.validation = { status: "ready", run };
    } catch (error) {
      state.validation = { status: "crashed", run: null, message: error.message };
    }
    renderDiagnostics();
    renderStatus();
  }

  const validateSoon = debounce(validate, 400);

  function validationChanged() {
    const version = ++validationRevision;
    const renderPending = state.validation.status !== "pending";
    state.validation = { status: "pending", run: null };
    if (renderPending) {
      renderDiagnostics();
      renderStatus();
    }
    validateSoon(version);
  }

  function setPackage(value) {
    if (destroyed) return;
    flushWorkingCopy();
    dismissQuickfix(false);
    state.packageRevision += 1;
    state.package = packageFrom(value, decodeBinary);
    analyzeNow();
    state.openPath = [...state.package.files.keys()].find(path => /\.md$/i.test(path)) ?? [...state.package.files.keys()][0] ?? "";
    state.selected = state.openPath ? { type: "file", path: state.openPath } : null;
    state.collapsed.clear();
    ui.packageForm.hidden = true;
    report(`Opened ${state.package.title}.`);
    syncPackageControls();
    renderAll();
    validationChanged();
  }

  function beginPackage() {
    ui.packageTitle.value = "Untitled Game";
    ui.packageId.value = packageIdFromTitle(ui.packageTitle.value);
    ui.packageForm.hidden = false;
    ui.packageTitle.focus();
    ui.packageTitle.select();
  }

  function exportPackage() {
    const id = state.analysis.manifest?.id ?? state.package.id;
    const name = `${packageIdFromTitle(id)}.zip`;
    const bytes = writeZip(state.package.files, state.package.folders);
    if (typeof host.downloadPackage === "function") {
      host.downloadPackage({ name, bytes, type: "application/zip" });
    } else {
      const url = view.URL.createObjectURL(new view.Blob([bytes], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      rootElement.append(link);
      link.click();
      link.remove();
      view.URL.revokeObjectURL(url);
    }
    report(`Exported ${name}.`);
  }

  function treeData() {
    const root = { folders: new Map(), files: [] };
    const folderNode = path => {
      let node = root;
      for (const part of path.split("/").filter(Boolean)) {
        if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
        node = node.folders.get(part);
      }
      return node;
    };
    for (const folder of state.package.folders) folderNode(folder);
    for (const path of state.package.files.keys()) folderNode(parentPath(path)).files.push(basename(path));
    return root;
  }

  function renderTreeNode(node, prefix = "") {
    const entries = [
      ...[...node.folders].map(([name, child]) => ({ name, child, type: "folder" })),
      ...node.files.map(name => ({ name, type: "file" }))
    ].sort((left, right) => left.name.localeCompare(right.name));
    return `<ul>${entries.map(entry => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const selected = state.selected?.type === entry.type && state.selected.path === path;
      if (entry.type === "folder") {
        const collapsed = state.collapsed.has(path);
        return `<li><button type="button" class="opengdd-author-tree-item opengdd-author-tree-folder${selected ? " opengdd-author-is-selected" : ""}" data-tree-type="folder" data-path="${escapeHtml(path)}" draggable="true" aria-expanded="${!collapsed}"><span>${collapsed ? "▸" : "▾"}</span>${escapeHtml(entry.name)}/</button>${collapsed ? "" : renderTreeNode(entry.child, path)}</li>`;
      }
      return `<li><button type="button" class="opengdd-author-tree-item${selected ? " opengdd-author-is-selected" : ""}${state.openPath === path ? " opengdd-author-is-open" : ""}" data-tree-type="file" data-path="${escapeHtml(path)}" draggable="true">${escapeHtml(entry.name)}</button></li>`;
    }).join("")}</ul>`;
  }

  function renderTree() {
    ui.tree.innerHTML = renderTreeNode(treeData());
    rootElement.querySelector('[data-action="rename"]').disabled = !state.selected;
  }

  function openFile(path) {
    if (!state.package.files.has(path)) return;
    state.openPath = path;
    state.selected = { type: "file", path };
    state.completion = -1;
    ui.completions.replaceChildren();
    dismissQuickfix(false);
    renderTree();
    renderEditor();
    renderStatus();
  }

  function lineBounds(text, line) {
    const lines = text.split("\n");
    const index = Math.max(0, Math.min(lines.length - 1, line - 1));
    let start = 0;
    for (let current = 0; current < index; current += 1) start += lines[current].length + 1;
    return { index, start, end: start + lines[index].length };
  }

  function scrollToLine(element, index) {
    const style = view.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    element.scrollTop = Math.max(0, index * lineHeight - element.clientHeight / 3);
  }

  function scrollEditorToLine(index) {
    const wrappedLine = ui.editor.classList.contains("opengdd-author-editor--wrapped") ? overlay.elements[index] : null;
    if (wrappedLine) ui.textarea.scrollTop = Math.max(0, wrappedLine.offsetTop - ui.textarea.clientHeight / 3);
    else scrollToLine(ui.textarea, index);
  }

  function selectPreLine(line) {
    const bounds = lineBounds(ui.json.textContent, line);
    const walker = document.createTreeWalker(ui.json, view.NodeFilter.SHOW_TEXT);
    const points = [];
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      points.push({ node, start: offset, end: offset + node.data.length });
      offset += node.data.length;
    }
    const point = target => {
      const item = points.find(entry => target <= entry.end) ?? points.at(-1);
      return item ? [item.node, Math.max(0, Math.min(item.node.data.length, target - item.start))] : [ui.json, 0];
    };
    const range = document.createRange();
    range.setStart(...point(bounds.start));
    range.setEnd(...point(bounds.end));
    const selection = document.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
    ui.json.focus({ preventScroll: true });
    scrollToLine(ui.json, bounds.index);
  }

  function openFinding(index) {
    const finding = state.validation.run?.findings[index];
    if (!finding || !state.package.files.has(finding.file)) return;
    openFile(finding.file);
    if (!Number.isInteger(finding.line) || finding.line < 1) return;
    if (!ui.textarea.hidden) {
      const bounds = lineBounds(ui.textarea.value, finding.line);
      ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(bounds.start, bounds.end);
      scrollEditorToLine(bounds.index);
      ui.highlight.scrollTop = ui.textarea.scrollTop;
    } else if (!ui.json.hidden) selectPreLine(finding.line);
  }

  function renderEditor() {
    const path = state.openPath;
    const text = state.package.files.get(path);
    const markdown = /\.md$/i.test(path);
    const json = /\.json$/i.test(path);
    const wrapped = (markdown || json) && typeof text === "string" && text.length <= MAX_WRAPPED_TEXT_CHARS;
    ui.path.textContent = path || "No file open";
    const readerUrl = path && /\.md$/i.test(path) && state.package.repositoryFiles.has(path) && typeof host.readerUrl === "function"
      ? host.readerUrl(state.package.repositoryPath, path)
      : "";
    ui.reader.hidden = !readerUrl;
    if (readerUrl) ui.reader.href = readerUrl; else ui.reader.removeAttribute("href");
    ui.textarea.hidden = true;
    ui.highlight.hidden = true;
    ui.json.hidden = true;
    ui.empty.hidden = true;
    ui.editor.classList.toggle("opengdd-author-editor--wrapped", wrapped);
    ui.textarea.setAttribute("wrap", wrapped ? "soft" : "off");
    resetOverlay();
    if (!path) {
      ui.mode.textContent = "";
      ui.empty.hidden = false;
      ui.empty.textContent = "Create or import a file to begin.";
      return;
    }
    if (typeof text !== "string") {
      ui.mode.textContent = "binary asset";
      ui.empty.hidden = false;
      ui.empty.textContent = "Binary assets are kept in the package but are not previewed here.";
      return;
    }
    if (markdown) {
      ui.mode.textContent = wrapped ? "Markdown · editing" : "Markdown · editing · wrap off for large file";
      ui.textarea.setAttribute("aria-label", "Markdown source");
      ui.textarea.hidden = false;
      ui.highlight.hidden = false;
      ui.textarea.value = text;
      editorTextRevision += 1;
      ui.textarea.scrollTop = ui.highlight.scrollTop = 0;
      ui.textarea.scrollLeft = ui.highlight.scrollLeft = 0;
      renderEditorAnalysis();
      return;
    }
    ui.json.hidden = false;
    if (json) {
      ui.mode.textContent = wrapped ? "JSON · editing" : "JSON · editing · wrap off for large file";
      ui.json.hidden = true;
      ui.textarea.hidden = false;
      ui.highlight.hidden = false;
      ui.textarea.setAttribute("aria-label", "JSON source");
      ui.textarea.value = text;
      editorTextRevision += 1;
      ui.textarea.scrollTop = ui.highlight.scrollTop = 0;
      ui.textarea.scrollLeft = ui.highlight.scrollLeft = 0;
      renderEditorAnalysis();
    } else {
      ui.mode.textContent = "text · read only";
      ui.json.textContent = text;
    }
  }

  function resetOverlay() {
    overlay.lines = [];
    overlay.elements = [];
    overlay.markup = [];
    overlay.analysisLines = [];
    overlay.byLine = new Map();
    overlay.lineStarts = [];
    overlay.first = 0;
    overlay.last = -1;
    overlay.dirty = true;
    ui.highlight.replaceChildren();
  }

  function overlayElement(markup) {
    const element = document.createElement("span");
    element.className = "opengdd-author-overlay-line";
    element.innerHTML = markup;
    return element;
  }

  // The highlight layer is the text the designer sees — the textarea's own
  // glyphs are transparent — so it follows every keystroke. Unchanged line
  // nodes stay in place; changed lines render plain until analysis returns.
  function reconcileOverlay(lines) {
    const previous = overlay.lines;
    let first = 0;
    while (first < previous.length && first < lines.length && previous[first] === lines[first]) first += 1;
    let tail = 0;
    while (tail < previous.length - first && tail < lines.length - first
      && previous[previous.length - 1 - tail] === lines[lines.length - 1 - tail]) tail += 1;
    if (first === previous.length && first === lines.length) return;

    const oldEnd = previous.length - tail;
    const newEnd = lines.length - tail;
    const reference = overlay.elements[oldEnd] ?? null;
    for (const element of overlay.elements.slice(first, oldEnd)) {
      const newline = element.nextSibling;
      element.remove();
      newline?.remove();
    }

    const fragment = document.createDocumentFragment();
    const elements = [];
    const markup = [];
    for (let index = first; index < newEnd; index += 1) {
      const rendered = escapeHtml(lines[index]);
      const element = overlayElement(rendered);
      fragment.append(element, document.createTextNode("\n"));
      elements.push(element);
      markup.push(rendered);
    }
    ui.highlight.insertBefore(fragment, reference);
    overlay.elements = [...overlay.elements.slice(0, first), ...elements, ...overlay.elements.slice(oldEnd)];
    overlay.markup = [...overlay.markup.slice(0, first), ...markup, ...overlay.markup.slice(oldEnd)];
    overlay.lines = lines;
  }

  function paintOverlay() {
    if (ui.textarea.hidden) return;
    if (ui.editor.classList.contains("opengdd-author-editor--wrapped")) {
      reconcileOverlay(ui.textarea.value.split("\n"));
    } else {
      const text = ui.textarea.value;
      if (!overlay.lineStarts.length) overlay.lineStarts = lineStartsFor(text);
      const starts = overlay.lineStarts;
      const style = view.getComputedStyle(ui.textarea);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      const top = Math.floor(ui.textarea.scrollTop / lineHeight);
      const last = Math.min(starts.length - 1, top + Math.ceil(ui.textarea.clientHeight / lineHeight) + OVERLAY_MARGIN);
      const first = Math.min(Math.max(0, top - OVERLAY_MARGIN), last);
      if (overlay.dirty || first < overlay.first || last > overlay.last) {
        const width = ui.textarea.scrollWidth;
        const shift = starts.length - overlay.analysisLines.length;
        let output = "\n".repeat(first);
        for (let index = first; index <= last; index += 1) {
          const line = lineAt(text, starts, index);
          const source = overlay.analysisLines[index] === line
            ? index
            : overlay.analysisLines[index - shift] === line ? index - shift : -1;
          if (index > first) output += "\n";
          output += renderOverlayLine(line, source < 0 ? null : overlay.byLine.get(source));
        }
        const tail = starts.length - 1 - last;
        overlayWidth.style.width = first === 0 && tail === 0 ? "0" : `${width}px`;
        ui.highlight.innerHTML = `${output}${"\n".repeat(tail)}`;
        ui.highlight.append(overlayWidth, document.createTextNode("\n"));
        overlay.first = first;
        overlay.last = last;
        overlay.dirty = false;
      }
    }
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
  }

  // The character goes up first; the completion list follows in the same
  // frame. Offering completions reads layout back out of the DOM, and doing
  // that from the input handler makes the browser lay out the whole file
  // before it can paint a single keystroke.
  function paintSoon({ changed = false, completions = false } = {}) {
    overlay.dirty ||= changed;
    completionsPending ||= completions;
    if (overlayFrame || destroyed) return;
    overlayFrame = view.requestAnimationFrame(() => {
      overlayFrame = 0;
      paintOverlay();
      completeNow();
    });
  }

  // A key that acts on the list — accept, move, dismiss — must act on the
  // list the text deserves, not the one left over from the keystroke before
  // it. Typing never comes through here, so the keystroke path stays clear.
  function completeNow() {
    if (!completionsPending) return;
    completionsPending = false;
    complete();
  }

  function renderEditorAnalysis() {
    if (ui.textarea.hidden) return;
    const lines = ui.textarea.value.split("\n");
    const byLine = anchorsByLine(editorAnchors());
    if (ui.editor.classList.contains("opengdd-author-editor--wrapped")) {
      reconcileOverlay(lines);
      for (let index = 0; index < lines.length; index += 1) {
        const markup = renderOverlayLine(lines[index], byLine.get(index));
        if (markup === overlay.markup[index]) continue;
        overlay.elements[index].innerHTML = markup;
        overlay.markup[index] = markup;
      }
    } else {
      overlay.analysisLines = lines;
      overlay.byLine = byLine;
      overlay.lineStarts = lineStartsFor(ui.textarea.value);
      overlay.dirty = true;
      paintOverlay();
    }
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
  }

  function editorAnchors() {
    if (editorAnchorCache.analysis === state.analysis
      && editorAnchorCache.path === state.openPath
      && editorAnchorCache.revision === editorTextRevision) return editorAnchorCache.anchors;
    let anchors;
    if (/\.md$/i.test(state.openPath)) {
      const analyzed = state.analysis.anchors.filter(anchor => anchor.file === state.openPath);
      const keys = new Set(analyzed.map(anchor => `${anchor.range.start.line}:${anchor.range.start.character}`));
      const mentions = creationMentions(ui.textarea.value, state.analysis.definitionsByName, state.openPath)
        .filter(anchor => !keys.has(`${anchor.range.start.line}:${anchor.range.start.character}`));
      anchors = [...analyzed, ...mentions];
    } else if (/\.json$/i.test(state.openPath)) {
      try { JSON.parse(ui.textarea.value); } catch {
        anchors = [];
      }
      if (!anchors) {
        anchors = [];
        for (const match of ui.textarea.value.matchAll(/"(?:\\.|[^"\\])*"/g)) {
          let name;
          try { name = JSON.parse(match[0]); } catch { continue; }
          const resolution = resolveAnchor(state.analysis.definitionsByName, name);
          if (resolution.classification !== "unknown") {
            anchors.push({ ...resolution, file: state.openPath, range: textRange(ui.textarea.value, match.index, match[0].length) });
          }
        }
      }
    } else anchors = [];
    editorAnchorCache = { analysis: state.analysis, path: state.openPath, revision: editorTextRevision, anchors };
    return anchors;
  }

  function renderDiagnostics() {
    const { status, run, message } = state.validation;
    if (status === "pending") {
      ui.diagnosticSummary.textContent = "Checking…";
      ui.diagnostics.innerHTML = '<p class="opengdd-author-muted">Checking package conformance…</p>';
      return;
    }
    if (status === "unavailable") {
      ui.diagnosticSummary.textContent = "Unavailable";
      ui.diagnostics.innerHTML = '<p class="opengdd-author-validation-unavailable">Validation unavailable — the conformance schemas could not be loaded.</p>';
      return;
    }
    if (status === "crashed") {
      ui.diagnosticSummary.textContent = "Crashed";
      ui.diagnostics.innerHTML = `<p class="opengdd-author-validation-unavailable">Validation crashed: ${escapeHtml(message || "unknown error")}. The editor is still available.</p>`;
      return;
    }

    const verdict = run.summary.errors ? "FAIL" : run.summary.warnings ? "PASS WITH WARNINGS" : "PASS";
    const verdictClass = run.summary.errors ? "fail" : run.summary.warnings ? "warnings" : "pass";
    ui.diagnosticSummary.textContent = `${verdict} · ${run.summary.errors}E ${run.summary.warnings}W`;
    const groups = [
      ["error", "Errors"],
      ["warning", "Warnings"]
    ].map(([severity, label]) => {
      const findings = run.findings.map((finding, index) => ({ finding, index })).filter(item => item.finding.severity === severity);
      if (!findings.length) return "";
      return `<section class="opengdd-author-diagnostic-group"><h3>${label} (${findings.length})</h3><ul>${findings.map(({ finding, index }) => {
        const location = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
        return `<li><button type="button" data-finding="${index}"><span class="opengdd-author-diagnostic-severity opengdd-author-diagnostic-severity--${severity}">${severity}</span><code>${escapeHtml(finding.code)}</code><span class="opengdd-author-diagnostic-location">${escapeHtml(location)}</span><span class="opengdd-author-diagnostic-message">${escapeHtml(finding.message)}</span></button></li>`;
      }).join("")}</ul></section>`;
    }).join("");
    const empty = run.findings.length ? "" : '<p class="opengdd-author-validation-empty">No findings. This package passes conformance validation.</p>';
    const skipped = run.skipped.length
      ? '<p class="opengdd-author-validation-skipped">Some byte-level media evidence checks were skipped in this browser; the CLI checks them.</p>'
      : "";
    ui.diagnostics.innerHTML = `<p class="opengdd-author-verdict opengdd-author-verdict--${verdictClass}">${verdict} — ${run.summary.errors} error(s), ${run.summary.warnings} warning(s)</p>${empty}${groups}${skipped}`;
  }

  function renderStatus() {
    const anchors = ui.textarea.hidden ? [] : editorAnchors();
    const count = classification => anchors.filter(anchor => anchor.classification === classification).length;
    // A zero count is good news and must not be dressed as an alarm.
    const tally = (kind, total) => `<span class="${total ? `opengdd-author-status-${kind}` : ""}">${total} ${kind}</span>`;
    const validation = state.validation.run
      ? tally("errors", state.validation.run.summary.errors) + tally("warnings", state.validation.run.summary.warnings)
      : `<span>${state.validation.status === "pending" ? "validation pending" : "validation unavailable"}</span>`;
    ui.status.innerHTML = `<span>${escapeHtml(state.package.title)}</span><span>${state.package.files.size} files</span><span>${state.analysis.nameIndex.length} names</span><span class="opengdd-author-status-known">${count("known")} known</span><span class="opengdd-author-status-unknown">${count("unknown")} unknown</span><span class="opengdd-author-status-ambiguous">${count("ambiguous")} ambiguous</span>${validation}`;
  }

  function renderAll() {
    ui.title.textContent = state.package.title;
    renderTree();
    renderEditor();
    renderDiagnostics();
    renderStatus();
  }

  function showHover(name) {
    if (!name || state.hoverName === name) return;
    state.hoverName = name;
    const resolution = resolveAnchor(state.analysis.definitionsByName, name);
    const definitions = resolution.definitions.map(definition => {
      const value = valueText(definition.value);
      return `<li><strong>${escapeHtml(KIND_LABELS[definition.kind] ?? "name")}</strong><span>${escapeHtml(definition.detail)}</span><span>${escapeHtml(definition.file)} · line ${definition.range.start.line + 1}</span>${value ? `<span class="opengdd-author-definition-value"><span>Value</span><code>${escapeHtml(value)}</code></span>` : ""}</li>`;
    }).join("");
    ui.hover.innerHTML = `<h2><code>${escapeHtml(name)}</code></h2><p class="opengdd-author-classification opengdd-author-classification--${resolution.classification}">${resolution.classification}</p>${definitions ? `<ul>${definitions}</ul>` : '<p class="opengdd-author-muted">No definition is present in this package.</p>'}`;
  }

  function anchorAt(line, character) {
    return editorAnchors().find(anchor => anchor.file === state.openPath
      && anchor.range.start.line === line
      && character >= anchor.range.start.character
      && character <= anchor.range.end.character);
  }

  function anchorNameAtPoint(x, y) {
    for (const anchor of ui.highlight.querySelectorAll("[data-anchor-name]")) {
      for (const rect of anchor.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return anchor.dataset.anchorName;
      }
    }
    return "";
  }

  function showCaretAnchor() {
    const before = ui.textarea.value.slice(0, ui.textarea.selectionStart ?? 0).split("\n");
    const anchor = anchorAt(before.length - 1, before.at(-1).length);
    if (anchor) showHover(anchor.name);
    return anchor;
  }

  function completionButtons() {
    return [...ui.completions.querySelectorAll("[data-completion]")];
  }

  function activateCompletion(index) {
    const buttons = completionButtons();
    if (!buttons.length) { state.completion = -1; return; }
    state.completion = (index + buttons.length) % buttons.length;
    buttons.forEach((button, position) => button.classList.toggle("opengdd-author-is-active", position === state.completion));
    buttons[state.completion].scrollIntoView({ block: "nearest" });
  }

  function positionPopup(element) {
    const style = view.getComputedStyle(ui.textarea);
    for (const property of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding", "borderWidth", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize"]) {
      ui.mirror.style[property] = style[property];
    }
    ui.mirror.style.width = `${ui.textarea.clientWidth}px`;
    const value = ui.textarea.value;
    const caret = ui.textarea.selectionStart ?? value.length;
    const wrapped = ui.editor.classList.contains("opengdd-author-editor--wrapped");
    let line = 0;
    if (wrapped) ui.mirror.textContent = value.slice(0, caret);
    else {
      // The unwrapped large-file fallback can use a cheap one-line mirror.
      for (let index = value.indexOf("\n"); index >= 0 && index < caret; index = value.indexOf("\n", index + 1)) line += 1;
      ui.mirror.textContent = value.slice(value.lastIndexOf("\n", caret - 1) + 1, caret);
    }
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    ui.mirror.appendChild(marker);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const top = marker.offsetTop + (wrapped ? lineHeight : (line + 1) * lineHeight) - ui.textarea.scrollTop;
    const maxLeft = ui.textarea.clientWidth - element.offsetWidth;
    const left = Math.max(0, Math.min(marker.offsetLeft - ui.textarea.scrollLeft, maxLeft));
    element.style.top = `${Math.max(0, Math.min(top, ui.textarea.clientHeight))}px`;
    element.style.left = `${left}px`;
  }

  const positionCompletions = () => positionPopup(ui.completions);

  // Matching is case-insensitive, so the folded names are kept for as long as
  // the analysis they came from lasts, rather than rebuilt per keystroke.
  let folded = { analysis: null, names: [] };
  function lowercaseNames() {
    if (folded.analysis !== state.analysis) {
      folded = { analysis: state.analysis, names: state.analysis.nameIndex.map(entry => entry.name.toLowerCase()) };
    }
    return folded.names;
  }

  function complete() {
    const context = completionContext(ui.textarea);
    if (!context || ui.textarea.hidden || !/\.md$/i.test(state.openPath)) {
      ui.completions.replaceChildren();
      state.completion = -1;
      return;
    }
    const prefix = context.prefix.toLowerCase();
  // The name index already arrives in name order, so keeping the two
    // groups in table order gives the same list a sort would — without
    // comparing every name against every other on every keystroke.
    const table = state.analysis.nameIndex;
    const names = lowercaseNames();
    const opening = [];
    const containing = [];
    for (let index = 0; index < table.length; index += 1) {
      const at = names[index].indexOf(prefix);
      if (at === 0) opening.push(table[index]);
      else if (at > 0) containing.push(table[index]);
    }
    const matches = opening.concat(containing);
    const visible = matches.slice(0, 60);
    const countLine = visible.length
      ? `<li class="opengdd-author-completion-count">${visible.length < matches.length ? `${visible.length} of ${matches.length} matches — keep typing to narrow` : `${matches.length} match${matches.length === 1 ? "" : "es"}`}</li>`
      : "";
    ui.completions.innerHTML = countLine + visible.map(entry => {
      const definition = entry.definitions[0] ?? {};
      const label = KIND_LABELS[definition.kind] ?? "name";
      const detail = definition.kind === "section" ? definition.detail : `${label} · ${definition.detail ?? "package name"}`;
      return `<li><button type="button" data-completion="${escapeHtml(entry.name)}"><code>${escapeHtml(entry.name)}</code><span>${escapeHtml(detail)}</span></button></li>`;
    }).join("");
    if (visible.length) {
      positionCompletions();
      activateCompletion(0);
    } else state.completion = -1;
  }

  function acceptCompletion(name) {
    const context = completionContext(ui.textarea);
    if (!context) return;
    const after = ui.textarea.value.slice(context.caret);
    const value = `${ui.textarea.value.slice(0, context.backtick + 1)}${name}\`${after}`;
    const caret = context.backtick + name.length + 2;
    ui.textarea.value = value;
    editorTextRevision += 1;
    overlay.lineStarts = [];
    state.package.files.set(state.openPath, value);
    paintSoon({ changed: true });
    ui.textarea.focus();
    ui.textarea.setSelectionRange(caret, caret);
    ui.completions.replaceChildren();
    state.completion = -1;
    analyzeSoon();
    validationChanged();
    saveWorkingCopy();
  }

  function restoreEditor(snapshot) {
    if (!snapshot || snapshot.path !== state.openPath || ui.textarea.hidden) return;
    const start = Math.min(snapshot.start, ui.textarea.value.length);
    const end = Math.min(snapshot.end, ui.textarea.value.length);
    ui.textarea.focus({ preventScroll: true });
    ui.textarea.setSelectionRange(start, end);
    ui.textarea.scrollTop = snapshot.scrollTop;
    ui.textarea.scrollLeft = snapshot.scrollLeft;
    ui.highlight.scrollTop = snapshot.scrollTop;
    ui.highlight.scrollLeft = snapshot.scrollLeft;
  }

  function dismissQuickfix(restore = true) {
    const snapshot = state.quickfix?.selection;
    state.quickfix = null;
    ui.quickfix.hidden = true;
    ui.quickfix.replaceChildren();
    if (restore) restoreEditor(snapshot);
  }

  function renderQuickfix(focus = false) {
    const quickfix = state.quickfix;
    if (!quickfix) return;
    const selected = quickfix.actions[quickfix.index];
    const actions = quickfix.actions.map((action, index) => `<button type="button" data-quickfix-action="${index}" class="${index === quickfix.index ? "opengdd-author-is-active" : ""}">${escapeHtml(action.label)}</button>`).join("");
    const value = selected.needsValue
      ? `<label>JSON value<input data-role="quickfix-value" value="${escapeHtml(quickfix.value)}" autocomplete="off" spellcheck="false"></label>`
      : "";
    ui.quickfix.innerHTML = `<p>Create <code>${escapeHtml(quickfix.name)}</code></p><div class="opengdd-author-quickfix-actions">${actions}</div>${value}<p class="opengdd-author-quickfix-error">${escapeHtml(quickfix.error)}</p><p class="opengdd-author-quickfix-hint">↑↓ choose · Enter create · Esc dismiss</p>`;
    ui.quickfix.setAttribute("aria-label", `Create ${quickfix.name}`);
    ui.quickfix.hidden = false;
    positionPopup(ui.quickfix);
    if (!focus) return;
    const target = selected.needsValue ? ui.quickfix.querySelector('[data-role="quickfix-value"]') : ui.quickfix.querySelector(`[data-quickfix-action="${quickfix.index}"]`);
    target?.focus({ preventScroll: true });
  }

  function activateQuickfix(index) {
    if (!state.quickfix) return;
    const input = ui.quickfix.querySelector('[data-role="quickfix-value"]');
    if (input) state.quickfix.value = input.value;
    state.quickfix.index = (index + state.quickfix.actions.length) % state.quickfix.actions.length;
    state.quickfix.error = "";
    renderQuickfix(true);
  }

  function openQuickfix(anchor) {
    if (!anchor || anchor.classification !== "unknown" || !/\.md$/i.test(state.openPath)) return;
    dismissQuickfix(false);
    const proposal = classifyCreation(anchor.name, {
      files: state.package.files,
      manifest: state.analysis.manifest,
      openPath: state.openPath
    });
    if (!proposal.actions.length) { report(proposal.reason || `Cannot create ${anchor.name} here.`, true); return; }
    ui.completions.replaceChildren();
    state.completion = -1;
    state.quickfix = {
      name: anchor.name,
      actions: proposal.actions,
      index: 0,
      value: "",
      error: "",
      selection: {
        path: state.openPath,
        start: ui.textarea.selectionStart ?? 0,
        end: ui.textarea.selectionEnd ?? 0,
        scrollTop: ui.textarea.scrollTop,
        scrollLeft: ui.textarea.scrollLeft
      }
    };
    renderQuickfix(true);
  }

  function commitQuickfix() {
    const quickfix = state.quickfix;
    if (!quickfix) return;
    const action = quickfix.actions[quickfix.index];
    try {
      const current = state.package.files.get(action.target);
      if (typeof current !== "string") throw new Error(`${action.target} is not writable text.`);
      let next;
      if (action.needsValue) {
        const input = ui.quickfix.querySelector('[data-role="quickfix-value"]');
        quickfix.value = input?.value ?? quickfix.value;
        const value = parseJsonScalar(quickfix.value);
        const targetText = action.createContainer
          ? insertJsonValue(current, null, { key: action.container, value: {} })
          : current;
        next = insertJsonValue(targetText, action.container, { key: quickfix.name, value });
      } else if (action.record) {
        next = insertJsonValue(current, action.container, { value: action.record });
      } else next = action.apply(current);
      state.package.files.set(action.target, next);
      if (action.target === state.openPath) {
        ui.textarea.value = next;
        editorTextRevision += 1;
        overlay.lineStarts = [];
        paintSoon({ changed: true });
      }
      const snapshot = quickfix.selection;
      dismissQuickfix(false);
      analyzeSoon(false);
      validationChanged();
      saveWorkingCopy(false);
      report(action.notice);
      restoreEditor(snapshot);
    } catch (error) {
      quickfix.error = error.message;
      renderQuickfix(true);
    }
  }

  function targetFolder() {
    if (!state.selected) return "";
    return state.selected.type === "folder" ? state.selected.path : parentPath(state.selected.path);
  }

  function beginTreeAction(action) {
    state.formAction = action;
    const current = state.selected?.path ?? "";
    ui.treePrompt.textContent = action === "new-file" ? "New file path" : action === "new-folder" ? "New folder path" : "New path";
    ui.treeInput.value = action === "rename" ? current : action === "new-file" ? "notes.md" : "folder";
    ui.treeForm.hidden = false;
    ui.treeInput.focus();
    ui.treeInput.select();
  }

  // Case-insensitively: an export would extract `Foo.md` and `foo.md` over each
  // other on Windows and macOS, losing one of them.
  function claimPath(path, except) {
    const key = path.toLowerCase();
    const taken = [...state.package.files.keys(), ...state.package.folders]
      .find(existing => existing !== except && existing.toLowerCase() === key);
    if (taken) throw new Error(`A package item already exists at ${taken}.`);
  }

  function movePath(type, from, requested) {
    const to = normalizePath(requested);
    if (from === to) return;
    dismissQuickfix(false);
    if (type === "file") {
      claimPath(to, from);
      const text = state.package.files.get(from);
      state.package.files.delete(from);
      state.package.files.set(to, text);
      if (state.openPath === from) state.openPath = to;
    } else {
      if (to.startsWith(`${from}/`)) throw new Error("A folder cannot be moved inside itself.");
      const affectedFiles = [...state.package.files].filter(([path]) => path.startsWith(`${from}/`));
      const affectedFolders = [...state.package.folders].filter(path => path === from || path.startsWith(`${from}/`));
      const destinationExists = state.package.folders.has(to) && !affectedFolders.includes(to);
      if (destinationExists || [...state.package.files.keys()].some(path => path === to || path.startsWith(`${to}/`))) {
        throw new Error(`The destination ${to} is not empty.`);
      }
      for (const [path] of affectedFiles) state.package.files.delete(path);
      for (const folder of affectedFolders) state.package.folders.delete(folder);
      for (const [path, text] of affectedFiles) state.package.files.set(`${to}${path.slice(from.length)}`, text);
      for (const folder of affectedFolders) state.package.folders.add(`${to}${folder.slice(from.length)}`);
      if (state.openPath.startsWith(`${from}/`)) state.openPath = `${to}${state.openPath.slice(from.length)}`;
    }
    state.package.folders = foldersFor(state.package.files, state.package.folders);
    state.selected = { type, path: to };
    analyzeNow();
    renderAll();
    validationChanged();
    saveWorkingCopy();
  }

  function submitTreeAction() {
    const action = state.formAction;
    let path = normalizePath(ui.treeInput.value);
    if (action !== "rename" && !ui.treeInput.value.includes("/")) {
      const folder = targetFolder();
      path = folder ? `${folder}/${path}` : path;
    }
    if (action === "new-file") {
      claimPath(path);
      state.package.files.set(path, "");
      state.package.folders = foldersFor(state.package.files, state.package.folders);
      state.openPath = path;
      state.selected = { type: "file", path };
    } else if (action === "new-folder") {
      claimPath(path);
      state.package.folders.add(path);
      state.selected = { type: "folder", path };
    } else if (state.selected) {
      movePath(state.selected.type, state.selected.path, path);
      ui.treeForm.hidden = true;
      return;
    }
    ui.treeForm.hidden = true;
    analyzeNow();
    renderAll();
    validationChanged();
    saveWorkingCopy();
  }

  function builtinFor(id) {
    return state.builtins.find(item => item.id === id);
  }

  function draftFor(id) {
    return state.drafts.find(item => item.id === id);
  }

  function closePackageConfirmation(restoreFocus = false) {
    state.pendingDelete = null;
    ui.packageConfirm.hidden = true;
    ui.packageConfirm.replaceChildren();
    const returnFocus = packageConfirmReturnFocus;
    packageConfirmReturnFocus = null;
    if (restoreFocus && returnFocus?.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
  }

  function syncPackageControls() {
    const id = state.package.id;
    if ([...ui.packageSelect.options].some(option => option.value === id)) ui.packageSelect.value = id;
    const hasDraft = Boolean(draftFor(id));
    const isBuiltin = Boolean(builtinFor(id));
    ui.packageDelete.disabled = !hasDraft;
    ui.packageDelete.hidden = !hasDraft;
    ui.packageDelete.textContent = hasDraft && isBuiltin ? "Reset example" : "Delete";
    ui.packageDelete.setAttribute("aria-label", isBuiltin ? "Reset example to its original files" : "Delete local package");
  }

  async function refreshPackages(preferredId = state.package.id) {
    const drafts = await listDrafts();
    if (destroyed) return "";
    state.drafts = drafts.filter(draft => !HIDDEN_LEGACY_DRAFTS.has(draft.id));
    const builtinIds = new Set(state.builtins.map(item => item.id));
    const entries = [
      ...state.builtins.map(item => {
        const draft = draftFor(item.id);
        const update = draftNeedsExampleUpdate(draft, item) ? " · update available" : "";
        return { id: item.id, label: `${draft?.title ?? item.title} — ${draft ? "local draft" : "example"}${update}` };
      }),
      ...state.drafts.filter(draft => !builtinIds.has(draft.id)).map(draft => ({ id: draft.id, label: `${draft.title} — local draft` }))
    ];
    ui.packageSelect.innerHTML = entries.length
      ? entries.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")
      : '<option value="">No packages yet</option>';
    ui.packageSelect.disabled = !entries.length;
    const selected = entries.some(item => item.id === preferredId) ? preferredId : entries[0]?.id ?? "";
    ui.packageSelect.value = selected;
    syncPackageControls();
    return selected;
  }

  let packageRequest = 0;
  async function choosePackage(id) {
    if (!id) return;
    const request = ++packageRequest;
    flushWorkingCopy();
    const draft = draftFor(id);
    const builtin = builtinFor(id);
    if (!draft && !builtin) throw new Error(`Unknown package: ${id}`);
    const value = draft ?? { ...await host.loadPackage(id), baseRevision: builtin?.revision ?? null };
    if (destroyed || request !== packageRequest) return;
    setPackage(value);
    if (draftNeedsExampleUpdate(draft, builtin)) {
      report("This local draft predates the current example. Export it before Reset example if you want to keep its changes.");
    }
  }

  async function importZip(file) {
    if (!file) return;
    try {
      const imported = await readZip(file);
      if (draftFor(imported.id)) throw new Error(`A local package already uses the id ${imported.id}. Delete it first, or change the imported manifest id.`);
      setPackage(imported);
      await saveDraft(state.package);
      await refreshPackages(state.package.id);
      report(`Imported ${state.package.title} and saved it in this browser.`);
    }
    catch (error) { report(error.message, true); }
    ui.zip.value = "";
  }

  async function handleClick(event) {
    // Any click outside the editor and the panel means the designer has moved
    // on; a decision about text they are no longer looking at must not linger.
    if (state.quickfix && !ui.quickfix.contains(event.target) && event.target !== ui.textarea) dismissQuickfix(false);
    const finding = event.target.closest("[data-finding]");
    if (finding) {
      try { openFinding(Number(finding.dataset.finding)); } catch { /* A diagnostic must never interrupt editing. */ }
      return;
    }
    const treeItem = event.target.closest("[data-tree-type]");
    if (treeItem) {
      const type = treeItem.dataset.treeType;
      const path = treeItem.dataset.path;
      state.selected = { type, path };
      if (type === "folder") {
        if (state.collapsed.has(path)) state.collapsed.delete(path); else state.collapsed.add(path);
        renderTree();
      } else openFile(path);
      return;
    }
    const completion = event.target.closest("[data-completion]");
    if (completion) { acceptCompletion(completion.dataset.completion); return; }
    const quickfixAction = event.target.closest("[data-quickfix-action]");
    if (quickfixAction && state.quickfix) {
      activateQuickfix(Number(quickfixAction.dataset.quickfixAction));
      if (!state.quickfix.actions[state.quickfix.index].needsValue) commitQuickfix();
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    try {
      if (action === "new-package") beginPackage();
      else if (action === "export") exportPackage();
      else if (action === "package-delete" && draftFor(state.package.id)) {
        // Pin the package being shown: autosave can refresh the selector while
        // the confirmation is open, and must not retarget the deletion.
        const reset = Boolean(builtinFor(state.package.id));
        state.pendingDelete = { id: state.package.id, title: state.package.title, reset };
        packageConfirmReturnFocus = document.activeElement;
        ui.packageConfirm.setAttribute("aria-label", `${reset ? "Reset example" : "Delete package"}: ${state.package.title}`);
        ui.packageConfirm.hidden = false;
        ui.packageConfirm.innerHTML = `${reset ? "Reset" : "Delete"} ${escapeHtml(state.pendingDelete.title)}? <button type="button" data-action="package-confirm-yes">Yes, ${reset ? "reset" : "delete"}</button> <button type="button" data-action="package-confirm-no">Cancel</button>`;
        ui.packageConfirm.querySelector('[data-action="package-confirm-no"]').focus();
      } else if (action === "package-confirm-yes" && state.pendingDelete) {
        const removed = state.pendingDelete;
        if (pendingSave?.id === removed.id) {
          persistDraft.cancel();
          pendingSave = null;
        }
        await deleteDraft(removed.id);
        closePackageConfirmation();
        const selected = await refreshPackages(removed.reset ? removed.id : state.builtins[0]?.id);
        if (selected) await choosePackage(selected);
        else setPackage({ id: "", title: "No package selected", files: [] });
        report(removed.reset ? "Example reset to its original files." : "Local package deleted.");
        ui.packageSelect.focus();
      } else if (action === "package-confirm-no") {
        closePackageConfirmation(true);
      } else if (["new-file", "new-folder", "rename"].includes(action)) beginTreeAction(action);
      else if (action === "tree-cancel") ui.treeForm.hidden = true;
      else if (action === "package-cancel") ui.packageForm.hidden = true;
    } catch (error) { report(error.message, true); }
  }

  on(rootElement, "click", handleClick);

  on(ui.packageConfirm, "keydown", event => {
    if (event.key === "Escape" && state.pendingDelete) {
      event.preventDefault();
      closePackageConfirmation(true);
    }
  });

  on(ui.packageSelect, "change", async () => {
    closePackageConfirmation();
    try { await choosePackage(ui.packageSelect.value); }
    catch (error) {
      report(error.message, true);
      syncPackageControls();
    }
  });
  on(ui.packageTitle, "input", () => { ui.packageId.value = packageIdFromTitle(ui.packageTitle.value); });
  on(ui.packageForm, "submit", async event => {
    event.preventDefault();
    const title = ui.packageTitle.value.trim();
    const id = ui.packageId.value.trim();
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      report("Enter a title and a kebab-case package id.", true);
      return;
    }
    // Drafts are keyed by package id and this browser is the only copy, so a
    // reused id would silently overwrite someone's work. Refuse instead.
    const drafts = await listDrafts().catch(() => []);
    if (drafts.some(draft => draft.id === id) || builtinFor(id)) {
      report(`A package already uses the id ${id}. Choose another id, or delete the local package first.`, true);
      ui.packageId.focus();
      ui.packageId.select();
      return;
    }
    if (destroyed) return;
    setPackage(createScaffoldPackage(id, title));
    ui.packageForm.hidden = true;
    try {
      await saveDraft(state.package);
      await refreshPackages(id);
      report(`Created ${title} and saved it in this browser.`);
    } catch (error) {
      report(`The package was created but could not be saved: ${error.message}`, true);
    }
  });
  on(ui.treeForm, "submit", event => {
    event.preventDefault();
    try { submitTreeAction(); } catch (error) { report(error.message, true); }
  });
  on(ui.textarea, "beforeinput", () => {
    editorBeforeInput = { path: state.openPath, start: ui.textarea.selectionStart ?? 0, end: ui.textarea.selectionEnd ?? 0 };
  });
  on(ui.textarea, "input", () => {
    const previous = state.package.files.get(state.openPath);
    if (!ui.editor.classList.contains("opengdd-author-editor--wrapped") && typeof previous === "string") {
      const selection = editorBeforeInput?.path === state.openPath ? editorBeforeInput : null;
      overlay.lineStarts = updateLineStarts(overlay.lineStarts, previous, ui.textarea.value, selection);
    }
    editorBeforeInput = null;
    editorTextRevision += 1;
    state.package.files.set(state.openPath, ui.textarea.value);
    paintSoon({ changed: true, completions: true });
    analyzeSoon();
    validationChanged();
    saveWorkingCopy();
  });
  on(ui.textarea, "scroll", () => {
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
    paintSoon();
    if (completionButtons().length) positionCompletions();
    if (state.quickfix) positionPopup(ui.quickfix);
  });
  on(ui.textarea, "keydown", event => {
    if (["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) completeNow();
    if ((event.ctrlKey && event.key === ".") || (event.altKey && event.key === "Enter")) {
      const anchor = showCaretAnchor();
      if (anchor?.classification === "unknown") {
        event.preventDefault();
        openQuickfix(anchor);
      }
      return;
    }
    const buttons = completionButtons();
    if (!buttons.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activateCompletion(state.completion + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); activateCompletion(state.completion - 1); }
    else if (event.key === "Enter" && state.completion >= 0) {
      event.preventDefault();
      acceptCompletion(buttons[state.completion].dataset.completion);
    } else if (event.key === "Escape") {
      ui.completions.replaceChildren();
      state.completion = -1;
    }
  });
  on(ui.textarea, "keyup", showCaretAnchor);
  on(ui.textarea, "click", () => {
    const anchor = showCaretAnchor();
    if (anchor?.classification === "unknown") openQuickfix(anchor);
    // The click already placed the caret; restoring the snapshot would drag it
    // back to the mention the designer just left.
    else if (state.quickfix) dismissQuickfix(false);
  });
  on(ui.quickfix, "keydown", event => {
    if (!state.quickfix) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activateQuickfix(state.quickfix.index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); activateQuickfix(state.quickfix.index - 1); }
    else if (event.key === "Enter") { event.preventDefault(); commitQuickfix(); }
    else if (event.key === "Escape") { event.preventDefault(); dismissQuickfix(); }
  });
  on(ui.textarea, "mousemove", event => {
    const name = anchorNameAtPoint(event.clientX, event.clientY);
    if (name) showHover(name);
  });
  // A resize changes wrapping in both stacked layers; a frame keeps their
  // scroll positions and any open popup aligned after layout settles.
  const editorResize = new view.ResizeObserver(() => paintSoon({ changed: true }));
  editorResize.observe(ui.editor);
  on(ui.zip, "change", () => importZip(ui.zip.files[0]));
  on(ui.tree, "dragstart", event => {
    const item = event.target.closest("[data-tree-type]");
    if (item) state.dragged = { type: item.dataset.treeType, path: item.dataset.path };
  });
  on(ui.tree, "dragover", event => event.preventDefault());
  on(ui.tree, "drop", event => {
    event.preventDefault();
    const zip = [...(event.dataTransfer?.files ?? [])].find(file => /\.zip$/i.test(file.name));
    if (zip) { importZip(zip); return; }
    if (!state.dragged) return;
    const folder = event.target.closest('[data-tree-type="folder"]')?.dataset.path ?? "";
    const destination = folder ? `${folder}/${basename(state.dragged.path)}` : basename(state.dragged.path);
    try { movePath(state.dragged.type, state.dragged.path, destination); }
    catch (error) { report(error.message, true); }
    state.dragged = null;
  });

  renderAll();
  (async () => {
    const revision = state.packageRevision;
    if (typeof host.listPackages === "function") {
      try { state.builtins = await host.listPackages(); }
      catch (error) { report(`The example package is unavailable: ${error.message}`, true); }
    }
    let selected = "";
    try { selected = await refreshPackages(host.defaultPackageId ?? state.builtins[0]?.id); }
    catch (error) { report(`Browser packages are unavailable: ${error.message}`, true); }
    if (destroyed || revision !== state.packageRevision) return;
    if (selected) {
      try { await choosePackage(selected); }
      catch (error) { report(`The selected package could not be opened: ${error.message}`, true); }
    } else {
      state.package = packageFrom({ id: "", title: "No package selected", files: [] }, decodeBinary);
      state.analysis = analyzePackage(state.package.files);
      renderAll();
      report("Create a package or import a ZIP to begin.");
    }
  })();

  return {
    openPackage: setPackage,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      flushWorkingCopy();
      worker?.terminate();
      editorResize.disconnect();
      view.cancelAnimationFrame(overlayFrame);
      analyzeSoon.cancel();
      validateSoon.cancel();
      validationRevision += 1;
      persistDraft.cancel();
      listeners.abort();
      rootElement.replaceChildren();
      rootElement.classList.remove("opengdd-authoring");
    }
  };
}
