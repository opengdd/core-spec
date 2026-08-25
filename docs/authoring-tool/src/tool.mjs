import { resolveAnchor } from "opengdd-analysis";
import { createAnalysisSession } from "./analysis-session.mjs";
import {
  classifyCreation, collectionNameTaken, collectionRecordNameTaken,
  collectionRecordText, kebabName, parseJsonScalar, rankCollectionCreationActions
} from "./creation.mjs";
import { createEditorSurface } from "./editor-surface.mjs";
import { minimalTextChange } from "./edits.mjs";
import { clampedPositionToOffset, lineBounds, offsetToPosition } from "./text-coordinates.mjs";
import { createScaffoldPackage, nextAvailablePackageId, packageIdFromTitle } from "./package.mjs";
import { createPackageSession } from "./package-session.mjs";
import { createPanelHost } from "./panel-host.mjs";
import { createSelectionBus } from "./selection.mjs";
import { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";
import { CONFORMANCE_SCHEMA_NAMES } from "./loaders.mjs";
import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { WORKBENCH_COPY } from "./copy/workbench-copy.mjs";
import { rollUpCollectionFindings } from "./outline.mjs";

export { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";

const SCHEMA_NAMES = CONFORMANCE_SCHEMA_NAMES;
const MAX_WRAPPED_TEXT_CHARS = 200_000;
const REGION_OWNERS = new WeakMap();
const CAPABILITY_NAMES = Object.freeze([
  "protectedFiles", "workbenchLabels", "hostUndo", "delete", "coldStart"
]);
const PROTECTED_PACKAGE_FILES = new Set([
  "manifest.json", "tuning.json", "01-overview.md", "02-mechanics.md",
  "03-content.md", "04-presentation.md", "05-build-plan.md"
]);
const OUTLINE_GROUPS = WIDGET_COPY.outlineGroups;
const OUTLINE_CREATE_ITEMS = CREATION_COPY.outlineItems;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const parentPath = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const basename = path => path.slice(path.lastIndexOf("/") + 1);
function normalizePath(value) {
  const path = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  if (!path || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) {
    throw new Error(WIDGET_COPY.packageRelativePath);
  }
  return path;
}

function outlineIcon(group) {
  const common = `class="opengdd-author-outline-icon" data-outline-icon="${group.id}" aria-hidden="true" focusable="false" viewBox="0 0 16 16"`;
  if (group.id === "identifiers") return `<svg ${common}><text x="8" y="12" text-anchor="middle">@</text></svg>`;
  if (group.id === "tuning-keys") return `<svg ${common}><path d="M2 4h5m3 0h4M2 8h1m3 0h8M2 12h7m3 0h2M7 2v4M3 6v4m6 0v4"/></svg>`;
  if (group.id === "collections") return `<svg ${common}><path d="M2 3h12v10H2zM2 7h12M6 3v10m4-10v10"/></svg>`;
  if (group.id === "descriptors") return `<svg ${common}><path d="M8 2l6 6-6 6-6-6z"/></svg>`;
  if (group.id === "palettes") return `<svg ${common}><path d="M2 3h8v8H2zM6 7h8v6H6z"/></svg>`;
  return "";
}

function severityIcon(label) {
  return `<svg class="opengdd-author-outline-severity-icon" role="img" aria-label="${label}" viewBox="0 0 16 16"><path d="M8 2l6 12H2L8 2zm0 4v4m0 2v.5"/></svg>`;
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
  const regions = host.regions;
  if (host.capabilities !== undefined && (host.capabilities === null || typeof host.capabilities !== "object" || Array.isArray(host.capabilities))) {
    throw new TypeError("host.capabilities must be an object when supplied.");
  }
  const suppliedCapabilities = host.capabilities;
  if (suppliedCapabilities) {
    for (const name of Object.keys(suppliedCapabilities)) {
      if (!CAPABILITY_NAMES.includes(name)) throw new TypeError(`host.capabilities.${name} is not supported.`);
      if (typeof suppliedCapabilities[name] !== "boolean") throw new TypeError(`host.capabilities.${name} must be a boolean.`);
    }
  }
  const capabilityDefault = suppliedCapabilities === undefined && Boolean(regions);
  const capabilities = Object.freeze(Object.fromEntries(CAPABILITY_NAMES.map(name => [
    name, suppliedCapabilities ? suppliedCapabilities[name] === true : capabilityDefault
  ])));
  const regionOwner = {};
  const namedRegions = [];
  if (regions) {
    for (const name of ["explorer", "prose", "status"]) {
      if (!(regions[name] instanceof view.Element)) throw new TypeError(`host.regions.${name} must be an Element.`);
      namedRegions.push([name, regions[name]]);
    }
    if (regions.outline !== undefined && !(regions.outline instanceof view.Element)) {
      throw new TypeError("host.regions.outline must be an Element when supplied.");
    }
    if (regions.outline) namedRegions.push(["outline", regions.outline]);
    if (regions.context !== undefined && !(regions.context instanceof view.Element)) {
      throw new TypeError("host.regions.context must be an Element when supplied.");
    }
    if (regions.context) namedRegions.push(["context", regions.context]);
    if (regions.inspector !== undefined && !(regions.inspector instanceof view.Element)) {
      throw new TypeError("host.regions.inspector must be an Element when supplied.");
    }
    if (regions.inspector) namedRegions.push(["inspector", regions.inspector]);
    if (regions.undo !== undefined && !(regions.undo instanceof view.Element)) {
      throw new TypeError("host.regions.undo must be an Element when supplied.");
    }
    if (regions.undo) namedRegions.push(["undo", regions.undo]);
    const regionNames = new Map();
    for (const [name, element] of namedRegions) {
      const conflict = regionNames.get(element);
      if (conflict) throw new Error(`host.regions.${name} conflicts with host.regions.${conflict}.`);
      regionNames.set(element, name);
    }
    for (const [name, element] of namedRegions) {
      if (REGION_OWNERS.has(element)) throw new Error(`host.regions.${name} is already owned by another authoring instance.`);
    }
    for (const [, element] of namedRegions) REGION_OWNERS.set(element, regionOwner);
  }
  let destroyed = false;
  const ownedChildren = new Map();
  rootElement.classList.add("opengdd-authoring");
  rootElement.innerHTML = `
    <header class="opengdd-author-topbar">
      <div class="opengdd-author-identity"><p class="opengdd-author-kicker">${WIDGET_COPY.brand}</p><div class="opengdd-author-heading"><${headingTag} class="opengdd-author-title">${WIDGET_COPY.title}</${headingTag}><span class="opengdd-author-version">${WIDGET_COPY.previewVersion(AUTHORING_TOOL_VERSION)}</span></div></div>
      <div class="opengdd-author-loaders" aria-label="${WIDGET_COPY.packageControls}">
        <div class="opengdd-author-source">
          <p class="opengdd-author-source-label">${WIDGET_COPY.package}</p>
          <div class="opengdd-author-source-row">
            <select data-role="package" aria-label="${WIDGET_COPY.package}" disabled><option value="">${WIDGET_COPY.loadingPackages}</option></select>
            <button type="button" data-action="new-package">${WIDGET_COPY.newPackage}</button>
            <span class="opengdd-author-delete-anchor">
              <button type="button" data-action="package-delete" data-role="package-delete" hidden>${WIDGET_COPY.delete}</button>
              <div class="opengdd-author-draft-confirm" data-role="package-confirm" role="alertdialog" aria-label="${WIDGET_COPY.confirmPackageAction}" hidden></div>
            </span>
          </div>
        </div>
        <div class="opengdd-author-source">
          <p class="opengdd-author-source-label">${WIDGET_COPY.packageFile}</p>
          <div class="opengdd-author-source-row">
            <label class="opengdd-author-import">${WIDGET_COPY.importZip}<input data-role="zip" type="file" accept=".zip,application/zip"></label>
            <button type="button" data-action="export">${WIDGET_COPY.exportZip}</button>
          </div>
        </div>
        ${regions ? "" : `<div class="opengdd-author-widget-drawer-controls">
          <button type="button" data-action="widget-outline" aria-expanded="false">${WORKBENCH_COPY.openOutline}</button>
          <button type="button" data-action="widget-inspector" aria-expanded="false">${WORKBENCH_COPY.openInspector}</button>
        </div>`}
      </div>
      <form class="opengdd-author-package-form" data-role="package-form" hidden>
        <label>${WIDGET_COPY.packageTitle}<input data-role="package-title" required autocomplete="off"></label>
        <label>${WIDGET_COPY.packageId}<input data-role="package-id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autocomplete="off"></label>
        <button type="submit">${WIDGET_COPY.createPackage}</button><button type="button" data-action="package-cancel">${WIDGET_COPY.cancel}</button>
      </form>
      <p class="opengdd-author-notice" data-role="notice" aria-live="polite"></p>
    </header>
    <div class="opengdd-author-workspace">
      <aside class="opengdd-author-tree-panel" aria-label="${WIDGET_COPY.packageFiles}">
        <header><div><p class="opengdd-author-kicker">${WIDGET_COPY.package}</p><h2 data-role="title"></h2></div></header>
        <div class="opengdd-author-tree-actions">
          <button type="button" data-action="new-file">${capabilities.workbenchLabels ? WORKBENCH_COPY.newFile : WIDGET_COPY.explorerActions.newFile}</button>
          <button type="button" data-action="new-folder">${capabilities.workbenchLabels ? WORKBENCH_COPY.newFolder : WIDGET_COPY.explorerActions.newFolder}</button>
          <button type="button" data-action="rename" disabled>${WIDGET_COPY.explorerActions.rename}</button>
        </div>
        <form class="opengdd-author-inline-form" data-role="tree-form" hidden>
          <label><span data-role="tree-prompt"></span><input data-role="tree-input" autocomplete="off"></label>
          <button type="submit">${WIDGET_COPY.explorerActions.save}</button><button type="button" data-action="tree-cancel">${WIDGET_COPY.cancel}</button>
        </form>
        <div class="opengdd-author-tree" data-role="tree" tabindex="0"><p>${WIDGET_COPY.loadingPackage}</p></div>
        <p class="opengdd-author-drop-note">${WIDGET_COPY.dropZip}</p>
      </aside>
      <section class="opengdd-author-editor-panel" aria-label="${WIDGET_COPY.fileEditor}">
        <header class="opengdd-author-file-heading"><span class="opengdd-author-file-path" data-role="path"></span><span class="opengdd-author-file-meta"><a data-role="reader" hidden>${WIDGET_COPY.openInReader}</a><span data-role="mode"></span></span></header>
        <div class="opengdd-author-editor" data-role="editor">
          <pre class="opengdd-author-highlight" data-role="highlight" aria-hidden="true"></pre>
          <textarea data-role="textarea" aria-label="${WIDGET_COPY.markdownSource}" wrap="soft" spellcheck="false"></textarea>
          <pre class="opengdd-author-json" data-role="json" tabindex="0"></pre>
          <div class="opengdd-author-empty" data-role="empty"></div>
          <div class="opengdd-author-caret-mirror" data-role="mirror" aria-hidden="true"></div>
          <ul class="opengdd-author-completions" data-role="completions" aria-label="${WIDGET_COPY.completionResults}"></ul>
          <div class="opengdd-author-quickfix" data-role="quickfix" role="dialog" hidden></div>
        </div>
      </section>
      ${regions ? "" : `<div class="opengdd-author-widget-inspector-slot" data-widget-drawer="inspector">`}
      <aside class="opengdd-author-inspector" aria-label="${WIDGET_COPY.contextAndValidation}">
        <section class="opengdd-author-panel-inspector" data-role="panel-inspector" aria-live="polite"></section>
        <details class="opengdd-author-diagnostics" open>
          <summary><span>${WIDGET_COPY.validation}</span><span data-role="diagnostic-summary">${WIDGET_COPY.checkingEllipsis}</span></summary>
          <div data-role="diagnostics" aria-live="polite"><p class="opengdd-author-muted">${WIDGET_COPY.checkingPackage}</p></div>
        </details>
      </aside>
      ${regions ? "" : `</div>`}
      ${regions ? "" : `<aside class="opengdd-author-widget-drawer opengdd-author-widget-drawer--outline" data-widget-drawer="outline" hidden>
        <div data-widget-region="outline"></div>
      </aside>`}
    </div>
    <footer class="opengdd-author-status" data-role="status" aria-live="polite"></footer>`;

  const workspace = rootElement.querySelector(".opengdd-author-workspace");
  const treePanel = workspace.querySelector(".opengdd-author-tree-panel");
  const editorPanel = workspace.querySelector(".opengdd-author-editor-panel");
  const inspector = workspace.querySelector(".opengdd-author-inspector");
  const internalOutlineRegion = regions ? null : workspace.querySelector('[data-widget-region="outline"]');
  const internalInspectorDrawer = regions ? null : workspace.querySelector('[data-widget-drawer="inspector"]');
  const status = rootElement.querySelector('[data-role="status"]');
  if (capabilities.delete) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.textContent = WIDGET_COPY.deleteAction;
    treePanel.querySelector(".opengdd-author-tree-actions").append(deleteButton);
  }
  const regionalElements = regions ? [regions.explorer, regions.prose, regions.outline, regions.context, regions.inspector, regions.status, regions.undo].filter(Boolean) : [];
  if (regions) {
    regions.explorer.replaceChildren(treePanel);
    inspector.querySelector(".opengdd-author-diagnostics").classList.add("opengdd-author-diagnostics--regional");
    const panelInspector = inspector.firstElementChild;
    if (regions.inspector) regions.inspector.replaceChildren(panelInspector);
    else if (regions.context) regions.context.replaceChildren(panelInspector);
    regions.prose.replaceChildren(editorPanel, inspector);
    if (regions.outline) regions.outline.innerHTML = `<nav class="opengdd-author-outline" aria-label="${WIDGET_COPY.outlineLabel}"></nav>`;
    regions.status.replaceChildren(status);
    if (regions.undo && capabilities.hostUndo) {
      regions.undo.innerHTML = `<div class="opengdd-author-history" aria-label="${WORKBENCH_COPY.undoHistory}">
        <button type="button" data-action="undo" disabled>${WORKBENCH_COPY.nothingToUndo}</button>
        <span>${WORKBENCH_COPY.undoHelp}</span>
      </div>`;
    }
    workspace.remove();
    for (const element of regionalElements) element.classList.add("opengdd-authoring", "opengdd-author-region");
  }
  if (internalOutlineRegion) internalOutlineRegion.innerHTML = `<nav class="opengdd-author-outline" aria-label="${WIDGET_COPY.outlineLabel}"></nav>`;
  ownedChildren.set(rootElement, new Set(rootElement.childNodes));
  for (const element of regionalElements) ownedChildren.set(element, new Set(element.childNodes));

  const mountElements = [rootElement, ...regionalElements];
  let workbenchScope = rootElement;
  while (regions && workbenchScope && !mountElements.every(element => workbenchScope.contains(element))) {
    workbenchScope = workbenchScope.parentElement;
  }
  const find = role => mountElements.map(element => element.querySelector(`[data-role="${role}"]`)).find(Boolean);
  const findAction = action => mountElements.map(element => element.querySelector(`[data-action="${action}"]`)).find(Boolean);
  const ui = {
    packageSelect: find("package"), packageDelete: find("package-delete"), packageConfirm: find("package-confirm"), notice: find("notice"),
    packageForm: find("package-form"), packageTitle: find("package-title"), packageId: find("package-id"),
    title: find("title"), tree: find("tree"), treeForm: find("tree-form"), treePrompt: find("tree-prompt"), treeParent: null,
    treeInput: find("tree-input"), path: find("path"), reader: find("reader"), mode: find("mode"), editor: find("editor"),
    highlight: find("highlight"), textarea: find("textarea"), json: find("json"), empty: find("empty"),
    mirror: find("mirror"), completions: find("completions"), quickfix: find("quickfix"), panelInspector: find("panel-inspector"), status: find("status"), zip: find("zip"),
    diagnostics: find("diagnostics"), diagnosticSummary: find("diagnostic-summary"), collectionDialog: null,
    outline: (regions?.outline ?? internalOutlineRegion)?.querySelector(".opengdd-author-outline") ?? null,
    rename: findAction("rename"), delete: findAction("delete"), undo: findAction("undo"),
    editorPanel,
    coldStart: null
  };
  if (capabilities.coldStart) {
    ui.coldStart = document.createElement("div");
    ui.coldStart.className = "opengdd-workbench-cold-start";
    ui.coldStart.hidden = true;
    ui.coldStart.innerHTML = `<button type="button" data-action="cold-new">${WORKBENCH_COPY.coldNew}</button>
      <button type="button" data-action="cold-example">${WORKBENCH_COPY.coldExample}</button>`;
    const coldStartParent = regions?.prose ?? rootElement;
    coldStartParent.prepend(ui.coldStart);
    ownedChildren.get(coldStartParent).add(ui.coldStart);
  }
  const state = {
    package: null,
    authoringView: null,
    openPath: "",
    selected: null,
    collapsed: new Set(),
    formAction: null,
    pendingDelete: null,
    builtins: [],
    drafts: [],
    options: [],
    hasDraft: false,
    isBuiltin: false,
    dragged: null,
    validation: { status: "pending", run: null },
    coldStart: false,
    saveStatus: WORKBENCH_COPY.notSaved,
    outlineProblemsOnly: false,
    outlineMenuOpen: false,
    panelCreatorPrompt: "",
    panelCreatorError: "",
    outlineSelection: "",
    outlineFallbackOpen: new Set(),
    outlineCollectionCollapsed: new Set(host.outlineCollections?.collapsed?.() ?? [])
  };
  let editController;
  let editSaveAnnouncements = [];
  let editorSurface;
  let editorBeforeInput = null;
  let composingProse = false;
  let proseCommitQueue = Promise.resolve();
  let historyQueue = Promise.resolve();
  let redoLabels = [];
  let outlineFrame = 0;
  let renderedOutlineModel = "";
  let collectionDialog = null;
  const selectionBus = createSelectionBus();
  const packageListeners = new Set();
  const validationListeners = new Set();
  const panelAdvice = new Map();
  let validationRevision = 0;
  let panelPackageCancel = () => {};
  let panelHost;
  const widgetDrawer = regions ? null : {
    open: "",
    editorState: null,
    outline: workspace.querySelector('[data-widget-drawer="outline"]'),
    inspector: internalInspectorDrawer,
    outlineToggle: rootElement.querySelector('[data-action="widget-outline"]'),
    inspectorToggle: rootElement.querySelector('[data-action="widget-inspector"]')
  };

  function captureWidgetEditorState() {
    if (ui.textarea.hidden) return null;
    return {
      selection: {
        start: ui.textarea.selectionStart ?? 0,
        end: ui.textarea.selectionEnd ?? 0,
        direction: ui.textarea.selectionDirection
      },
      scroll: { top: ui.textarea.scrollTop, left: ui.textarea.scrollLeft }
    };
  }

  function restoreWidgetEditorState(snapshot) {
    if (ui.textarea.hidden || !snapshot?.selection || !snapshot?.scroll) return;
    const start = Math.min(Math.max(0, snapshot.selection.start), ui.textarea.value.length);
    const end = Math.min(Math.max(0, snapshot.selection.end), ui.textarea.value.length);
    const direction = ["forward", "backward", "none"].includes(snapshot.selection.direction) ? snapshot.selection.direction : "none";
    ui.textarea.setSelectionRange(start, end, direction);
    ui.textarea.scrollTop = snapshot.scroll.top;
    ui.textarea.scrollLeft = snapshot.scroll.left;
    editorSurface.scrollChanged();
  }

  function closeWidgetDrawer(returnFocus = false) {
    if (!widgetDrawer?.open) return;
    const name = widgetDrawer.open;
    const toggle = name === "outline" ? widgetDrawer.outlineToggle : widgetDrawer.inspectorToggle;
    widgetDrawer.outline.hidden = true;
    widgetDrawer.inspector.classList.remove("opengdd-author-widget-drawer--open");
    widgetDrawer.outlineToggle.setAttribute("aria-expanded", "false");
    widgetDrawer.inspectorToggle.setAttribute("aria-expanded", "false");
    widgetDrawer.open = "";
    restoreWidgetEditorState(widgetDrawer.editorState);
    widgetDrawer.editorState = null;
    if (returnFocus) toggle.focus({ preventScroll: true });
  }

  function openWidgetDrawer(name) {
    if (!widgetDrawer) return;
    if (widgetDrawer.open === name) {
      closeWidgetDrawer(true);
      return;
    }
    if (!widgetDrawer.open) widgetDrawer.editorState = captureWidgetEditorState();
    widgetDrawer.open = name;
    widgetDrawer.outline.hidden = name !== "outline";
    widgetDrawer.inspector.classList.toggle("opengdd-author-widget-drawer--open", name === "inspector");
    widgetDrawer.outlineToggle.setAttribute("aria-expanded", String(name === "outline"));
    widgetDrawer.inspectorToggle.setAttribute("aria-expanded", String(name === "inspector"));
    if (name === "outline") {
      renderOutline();
      widgetDrawer.outline.querySelector("button, input, summary, [tabindex]")?.focus({ preventScroll: true });
    } else widgetDrawer.inspector.querySelector("button, input, summary, [tabindex]")?.focus({ preventScroll: true });
  }

  function report(message, error = false) {
    if (destroyed) return;
    ui.notice.textContent = message;
    ui.notice.classList.toggle("opengdd-author-is-error", error);
  }

  let packageConfirmReturnFocus = null;
  const packageSession = createPackageSession({
    decodeBinary,
    listBuiltins: typeof host.listPackages === "function" ? () => host.listPackages() : undefined,
    loadBuiltin: id => host.loadPackage(id),
    report,
    isClosed: () => destroyed,
    onEdit: () => {
      if (destroyed) return;
      packageSession.save({ announce: editSaveAnnouncements.shift()?.announce ?? true });
      renderHistory();
    }
  });
  Object.assign(state, packageSession.state());
  editController = state.editController;

  const packageService = {};
  Object.defineProperties(packageService, {
    id: { enumerable: true, get: () => state.package.id },
    title: { enumerable: true, get: () => state.package.title }
  });
  Object.assign(packageService, {
    list: () => [...state.package.folders, ...state.package.files.keys()],
    read: path => {
      const value = state.package.files.get(path);
      return value instanceof Uint8Array ? value.slice() : value;
    },
    revision: path => editController.revision(path),
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A package subscriber must be a function.");
      packageListeners.add(listener);
      return () => packageListeners.delete(listener);
    }
  });

  const validationService = {
    current() {
      const run = state.validation.run;
      return {
        status: state.validation.status,
        findings: run?.findings ?? [], advice: [...panelAdvice.values()].flat(), summary: run?.summary,
        packageRevision: run?.packageRevision ?? 0, validationRevision
      };
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A validation subscriber must be a function.");
      validationListeners.add(listener);
      return () => validationListeners.delete(listener);
    },
    forFile(path) {
      const current = this.current();
      return { findings: current.findings.filter(finding => finding.file === path), advice: current.advice.filter(finding => finding.file === path) };
    },
    reveal(finding) {
      const index = state.validation.run?.findings.indexOf(finding) ?? -1;
      if (index >= 0) openFinding(index);
    },
    contribute(findings, panelId) {
      if (!Array.isArray(findings) || findings.some(finding => !finding || !["warning", "info"].includes(finding.severity))) {
        throw new Error("Panel advice must be an array of warning or info findings.");
      }
      panelAdvice.set(panelId, findings.map(finding => ({ ...finding, panel: panelId })));
      validationRevision += 1;
      const current = this.current();
      queueMicrotask(() => { for (const listener of [...validationListeners]) listener(current); });
    }
  };

  const panelEdits = {
    begin(...args) {
      const controller = editController;
      const transaction = controller.begin(...args);
      const commit = transaction.commit.bind(transaction);
      transaction.commit = () => applyEdit(commit).then(value => {
        if (controller === editController) {
          analyzeNow();
          renderAll();
          validationChanged();
        }
        return value;
      });
      return transaction;
    }
  };
  const panelServices = Object.freeze({
    selection: selectionBus,
    edits: panelEdits,
    validation: validationService,
    references: undefined,
    forms: undefined,
    grid: undefined,
    assets: undefined
  });
  const hostSubscribers = new Set();
  const hostInfo = Object.freeze({
    kind: regions ? "workbench" : "widget",
    size: regions ? "full" : "compact",
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A host subscriber must be a function.");
      hostSubscribers.add(listener);
      return () => hostSubscribers.delete(listener);
    }
  });

  function bindPanelPackageController() {
    panelPackageCancel();
    panelPackageCancel = editController.subscribe(event => {
      for (const listener of [...packageListeners]) listener(event);
    });
  }
  bindPanelPackageController();

  async function applyEdit(action, announce = true, preserveRedo = false) {
    // Edit-controller notifications run in a microtask: this queue entry must
    // exist before commit so the session-side edit handler consumes the matching
    // announcement when it schedules autosave.
    const pending = { announce };
    editSaveAnnouncements.push(pending);
    try {
      const changed = await action();
      if (changed === false) {
        const index = editSaveAnnouncements.indexOf(pending);
        if (index >= 0) editSaveAnnouncements.splice(index, 1);
      }
      if (!preserveRedo) {
        redoLabels = [];
        renderHistory();
      }
      return changed;
    } catch (error) {
      const index = editSaveAnnouncements.indexOf(pending);
      if (index >= 0) editSaveAnnouncements.splice(index, 1);
      throw error;
    }
  }

  function replaceText(controller, label, path, next, { coalesce, announce = true } = {}) {
    const previous = state.package.files.get(path);
    if (typeof previous !== "string") throw new Error(WIDGET_COPY.notWritableText(path));
    if (previous === next) return Promise.resolve(false);
    const change = minimalTextChange(previous, next);
    const transaction = controller.begin(label, coalesce ? { coalesce } : undefined);
    transaction.text(path).replace({
      start: offsetToPosition(previous, change.start),
      end: offsetToPosition(previous, change.previousEnd),
      revision: controller.revision(path)
    }, next.slice(change.start, change.nextEnd));
    return applyEdit(() => transaction.commit(), announce).then(() => true);
  }

  function queueProseEdit(path, value) {
    const controller = editController;
    proseCommitQueue = proseCommitQueue.then(async () => {
      if (controller !== editController || !state.package.files.has(path)) return;
      await replaceText(controller, WIDGET_COPY.editProse, path, value, { coalesce: `prose/${path}` });
      if (controller !== editController) return;
      analyzeSoon();
      validationChanged();
    }).catch(error => {
      if (controller === editController) {
        report(error.message, true);
        renderEditor();
      }
    });
    return proseCommitQueue;
  }

  function takeHistory(direction) {
    const controller = editController;
    historyQueue = historyQueue.then(() => proseCommitQueue).then(async () => {
      if (controller !== editController) return;
      const openPath = state.openPath;
      const previous = !ui.textarea.hidden && typeof ui.textarea.value === "string" ? ui.textarea.value : undefined;
      const label = direction === "undo" ? controller.history.label : redoLabels.at(-1);
      const result = await applyEdit(() => controller[direction](), true, true);
      if (!result || controller !== editController) return;
      if (direction === "undo" && label) redoLabels.push(label);
      else if (direction === "redo") redoLabels.pop();
      editorSurface.closeDialog(false);
      if (!state.package.files.has(state.openPath)) {
        const movedPath = result.moves.find(move => move.from === openPath)?.to;
        state.openPath = movedPath ?? [...state.package.files.keys()].find(path => /\.md$/i.test(path)) ?? [...state.package.files.keys()][0] ?? "";
        state.selected = state.openPath ? { type: "file", path: state.openPath } : null;
      }
      analyzeNow();
      renderAll();
      renderHistory();
      validationChanged();
      if (state.openPath === openPath && typeof previous === "string") {
        const next = state.package.files.get(openPath);
        if (typeof next === "string" && next !== previous && !ui.textarea.hidden) {
          const change = minimalTextChange(previous, next);
          ui.textarea.focus({ preventScroll: true });
          ui.textarea.setSelectionRange(change.nextEnd, change.nextEnd);
        }
      }
    }).catch(error => report(error.message, true));
    return historyQueue;
  }

  function renderHistory() {
    if (!ui.undo) return;
    const undoLabel = editController.history.label;
    ui.undo.disabled = !editController.history.canUndo;
    ui.undo.textContent = undoLabel ? WORKBENCH_COPY.undoAction(undoLabel) : WORKBENCH_COPY.nothingToUndo;
  }

  // Analysis and validation live behind one framework-free session. Its
  // deliveries contain only the promised authoring view or validation state.
  let workerActive = false;
  const analysisSession = createAnalysisSession({
    Worker: view.Worker,
    revisionFor: path => editController.revision(path),
    folders: () => state.package?.folders ?? [],
    analysisDelay: () => ui.textarea.value.length > MAX_WRAPPED_TEXT_CHARS ? 300 : 150,
    schemas: async () => {
      const schemas = await (typeof host.schemas === "function" ? host.schemas() : host.schemas);
      const missing = SCHEMA_NAMES.filter(name => !(schemas instanceof Map ? schemas.get(name) : schemas?.[name]));
      if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
      return schemas;
    }
  });
  analysisSession.subscribe(delivery => {
    if (delivery.type === "worker") {
      workerActive = delivery.active;
      if (!workerActive) report(WIDGET_COPY.checkingOnPageFallback);
      renderStatus();
      return;
    }
    if (delivery.type === "view") {
      state.authoringView = delivery.view;
      if (!delivery.view) return;
      editorSurface.analysisChanged();
      scheduleOutlineRender();
      renderStatus();
      if (delivery.complete) editorSurface.offerCompletions();
      return;
    }
    if (delivery.type === "validation") {
      const renderPending = delivery.validation.status !== "pending" || state.validation.status !== "pending";
      state.validation = delivery.validation;
      validationRevision += 1;
      const current = validationService.current();
      queueMicrotask(() => {
        for (const listener of [...validationListeners]) listener(current);
      });
      if (renderPending) {
        renderDiagnostics();
        scheduleOutlineRender();
        renderStatus();
      }
    }
  });

  // Structural changes need a view synchronously for the render that follows.
  function analyzeNow() {
    state.authoringView = analysisSession.fileChanged({ immediate: true, publish: false });
    return state.authoringView;
  }

  function analyzeSoon(showCompletion = true) {
    analysisSession.fileChanged({ complete: showCompletion });
  }

  function validationChanged() {
    analysisSession.validateNow();
  }

  function creationProposal(name, path, currentView) {
    const core = classifyCreation(name, {
      files: state.package.files,
      folders: state.package.folders,
      manifest: currentView?.manifest,
      openPath: path
    });
    const coreActions = rankCollectionCreationActions(core.actions, state.package.files, file => editController.revision(file));
    const contributed = (panelHost?.creators({ name, file: path, position: { line: 0, character: 0 } }) ?? []).map(creator => ({
      kind: creator.kind,
      label: creator.label,
      choice: creator.label,
      target: path,
      panelCreator: creator.id
    }));
    return { ...core, actions: [...coreActions, ...contributed] };
  }

  editorSurface = createEditorSurface({
    document,
    view,
    elements: ui,
    on,
    viewSupplier: () => state.authoringView,
    pathSupplier: () => state.openPath,
    revisionSupplier: path => editController.revision(path),
    textSupplier: path => state.package.files.get(path),
    queueEdit: ({ label, path, text }) => replaceText(editController, label, path, text),
    proposeCreation: ({ name, path, view: currentView }) => creationProposal(name, path, currentView),
    confirmCreation: async ({ name, choice, value, selection, isCurrent }) => {
      await proseCommitQueue;
      if (!isCurrent()) return null;
      const currentView = analysisSession.fileChanged({ immediate: true, publish: false, supersede: false });
      const currentResolution = resolveAnchor(currentView.definitionsByName, name);
      if (currentResolution.classification !== "unknown") return { notice: CREATION_COPY.alreadyDeclared(name) };
      const proposal = creationProposal(name, selection.path, currentView);
      const action = proposal.actions.flatMap(candidate => candidate.revealActions ?? candidate).find(candidate => candidate.choice === choice);
      if (!action) throw new Error(proposal.reason || CREATION_COPY.cannotCreateHere(name));
      if (action.panelCreator) {
        await panelHost.runCreator(action.panelCreator, {
          name,
          file: selection.path,
          position: offsetToPosition(state.package.files.get(selection.path), selection.start)
        }, "inspector");
        return { changed: true, showCompletion: false };
      }
      const current = state.package.files.get(action.target);
      if (action.create === undefined && typeof current !== "string") throw new Error(WIDGET_COPY.notWritableText(action.target));
      const transaction = editController.begin(CREATION_COPY.createNamed(name));
      if (typeof action.create === "string") {
        transaction.file(action.target).create(action.create);
      } else if (action.operations) {
        const operationValue = action.needsValue ? parseJsonScalar(value) : undefined;
        for (const operation of action.operations(operationValue)) {
          if (operation.type !== "insert") throw new Error(CREATION_COPY.unsupportedOperation(operation.type));
          transaction.json(action.target).insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
        }
      } else {
        const next = action.apply(current);
        const change = minimalTextChange(current, next);
        transaction.text(action.target).replace({
          start: offsetToPosition(current, change.start),
          end: offsetToPosition(current, change.previousEnd),
          revision: editController.revision(action.target)
        }, next.slice(change.start, change.nextEnd));
      }
      await applyEdit(() => transaction.commit(), false);
      const next = state.package.files.get(action.target);
      return {
        changed: true,
        showCompletion: false,
        notice: action.notice,
        editorText: action.target === state.openPath ? next : undefined
      };
    },
    creationApplied: outcome => {
      if (outcome.changed) {
        analyzeSoon(outcome.showCompletion);
        validationChanged();
      }
      if (outcome.notice) report(outcome.notice);
    },
    report,
    isDestroyed: () => destroyed,
    publishSelection: next => selectionBus.select(next, { origin: { surface: "prose" } })
  });

  panelHost = createPanelHost({
    document,
    view,
    panels: host.panels,
    inspector: ui.panelInspector,
    sidebar: ui.outline,
    services: panelServices,
    packageService,
    hostInfo,
    report
  });

  // Package deliveries are synchronous: the session swaps controllers before
  // this composition-side render, so editor and analysis handlers never see
  // the new package paired with the previous package's history.
  packageSession.subscribe(delivery => {
    const changed = delivery.editController !== editController;
    Object.assign(state, delivery);
    editController = delivery.editController;
    if (!changed) {
      renderPackageOptions(state.package.id);
      renderStatus();
      return;
    }
    bindPanelPackageController();
    editorSurface.closeDialog(false);
    hideCollectionDialog(false);
    state.authoringView = null;
    panelAdvice.clear();
    redoLabels = [];
    editSaveAnnouncements = [];
    state.openPath = [...state.package.files.keys()].find(path => /\.md$/i.test(path)) ?? [...state.package.files.keys()][0] ?? "";
    state.selected = state.openPath ? { type: "file", path: state.openPath } : null;
    for (const listener of [...packageListeners]) queueMicrotask(() => listener({ type: "opened" }));
    selectionBus.clear({ surface: "explorer" });
    if (state.openPath) selectionBus.select({ kind: "file", file: state.openPath }, { origin: { surface: "explorer" } });
    state.collapsed.clear();
    state.coldStart = false;
    if (ui.coldStart) ui.coldStart.hidden = true;
    if (ui.editorPanel) ui.editorPanel.hidden = false;
    ui.packageForm.hidden = true;
    report(WIDGET_COPY.openedPackage(state.package.title));
    syncPackageControls();
    renderAll();
    analysisSession.openPackage(state.package.files);
    panelHost.packageOpened();
  });

  function beginPackage() {
    ui.packageTitle.value = WIDGET_COPY.untitledGame;
    ui.packageId.value = packageIdFromTitle(ui.packageTitle.value);
    ui.packageForm.hidden = false;
    ui.packageTitle.focus();
    ui.packageTitle.select();
  }

  function downloadPackage() {
    const id = state.authoringView?.manifest?.id ?? state.package.id;
    // A synthetic input followed by export in the same JavaScript turn can
    // precede the controller's serialized commit microtask. The visible
    // editor is still the designer's latest value, so the export snapshot
    // includes it without mutating the working package outside the layer.
    // The export click depends on snapshot construction being synchronous so
    // download dispatch remains in the initiating user-activation turn.
    const snapshot = packageSession.exportSnapshot({
      id,
      path: !ui.textarea.hidden ? state.openPath : "",
      text: ui.textarea.value
    });
    if (typeof host.downloadPackage === "function") {
      host.downloadPackage(snapshot);
    } else {
      const url = view.URL.createObjectURL(new view.Blob([snapshot.bytes], { type: snapshot.type }));
      const link = document.createElement("a");
      link.href = url;
      link.download = snapshot.name;
      rootElement.append(link);
      link.click();
      link.remove();
      view.URL.revokeObjectURL(url);
    }
    report(WIDGET_COPY.exportedPackage(snapshot.name));
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
      const draggable = !capabilities.protectedFiles || !PROTECTED_PACKAGE_FILES.has(path);
      return `<li><button type="button" class="opengdd-author-tree-item${selected ? " opengdd-author-is-selected" : ""}${state.openPath === path ? " opengdd-author-is-open" : ""}" data-tree-type="file" data-path="${escapeHtml(path)}" draggable="${draggable}">${escapeHtml(entry.name)}</button></li>`;
    }).join("")}</ul>`;
  }

  function renderTree() {
    ui.tree.innerHTML = renderTreeNode(treeData());
    const protectedFile = Boolean(capabilities.protectedFiles && state.selected?.type === "file" && PROTECTED_PACKAGE_FILES.has(state.selected.path));
    const renameReason = protectedFile ? WIDGET_COPY.protectedRename(state.selected.path) : "";
    const deleteReason = protectedFile ? WIDGET_COPY.protectedDelete(state.selected.path) : "";
    const setActionAvailability = (button, unavailable, reason) => {
      if (!button) return;
      if (!capabilities.protectedFiles) {
        button.disabled = unavailable;
        return;
      }
      button.setAttribute("aria-disabled", String(unavailable));
      if (reason) {
        button.setAttribute("aria-description", reason);
        button.title = reason;
      } else {
        button.removeAttribute("aria-description");
        button.removeAttribute("title");
      }
    };
    setActionAvailability(ui.rename, !state.selected || protectedFile, renameReason);
    setActionAvailability(ui.delete, !state.selected || protectedFile, deleteReason);
  }

  function openFile(path) {
    if (!state.package.files.has(path)) return;
    state.openPath = path;
    state.selected = { type: "file", path };
    selectionBus.select({ kind: "file", file: path }, { origin: { surface: "explorer" } });
    editorSurface.closePopups(false);
    renderTree();
    renderEditor();
    renderStatus();
  }

  function scrollToLine(element, index) {
    const style = view.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    element.scrollTop = Math.max(0, index * lineHeight - element.clientHeight / 3);
  }

  function selectPreLine(line) {
    const bounds = lineBounds(ui.json.textContent, line - 1);
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
      const bounds = lineBounds(ui.textarea.value, finding.line - 1);
      ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(bounds.start, bounds.end);
      editorSurface.scrollToEditorLine(bounds.index);
    } else if (!ui.json.hidden) selectPreLine(finding.line);
  }

  function safelyOpenFinding(index) {
    try {
      openFinding(index);
      return true;
    } catch {
      return false;
    }
  }

  function renderEditor() {
    if (state.coldStart) {
      ui.coldStart.hidden = false;
      ui.editorPanel.hidden = true;
      return;
    }
    const path = state.openPath;
    const text = state.package.files.get(path);
    const markdown = /\.md$/i.test(path);
    const json = /\.json$/i.test(path);
    const wrapped = (markdown || json) && typeof text === "string" && text.length <= MAX_WRAPPED_TEXT_CHARS;
    ui.path.textContent = path || WIDGET_COPY.noFileOpen;
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
    editorSurface.reset();
    if (!path) {
      ui.mode.textContent = "";
      ui.empty.hidden = false;
      ui.empty.textContent = WIDGET_COPY.noFileBody;
      return;
    }
    if (typeof text !== "string") {
      ui.mode.textContent = WIDGET_COPY.binaryAsset;
      ui.empty.hidden = false;
      ui.empty.textContent = WIDGET_COPY.binaryAssetBody;
      return;
    }
    if (markdown) {
      ui.mode.textContent = wrapped ? WIDGET_COPY.markdownEditing : WIDGET_COPY.markdownEditingLarge;
      ui.textarea.setAttribute("aria-label", WIDGET_COPY.markdownSource);
      ui.textarea.hidden = false;
      ui.highlight.hidden = false;
      editorSurface.loadText(text);
      return;
    }
    ui.json.hidden = false;
    if (json) {
      ui.mode.textContent = wrapped ? WIDGET_COPY.jsonEditing : WIDGET_COPY.jsonEditingLarge;
      ui.json.hidden = true;
      ui.textarea.hidden = false;
      ui.highlight.hidden = false;
      ui.textarea.setAttribute("aria-label", WIDGET_COPY.jsonSource);
      editorSurface.loadText(text);
    } else {
      ui.mode.textContent = WIDGET_COPY.textReadOnly;
      ui.json.textContent = text;
    }
  }

  function renderDiagnostics() {
    const { status, run, message } = state.validation;
    const setDiagnosticSummary = text => {
      ui.diagnosticSummary.textContent = text;
      if (capabilities.workbenchLabels) ui.diagnosticSummary.parentElement.setAttribute("aria-label", WIDGET_COPY.validationAccessible(text));
    };
    if (capabilities.workbenchLabels) ui.diagnosticSummary.classList.remove("opengdd-author-verdict--pass", "opengdd-author-verdict--warnings", "opengdd-author-verdict--fail");
    if (status === "pending") {
      setDiagnosticSummary(WIDGET_COPY.checkingEllipsis);
      ui.diagnostics.innerHTML = `<p class="opengdd-author-muted">${WIDGET_COPY.checkingPackage}</p>`;
      return;
    }
    if (status === "unavailable") {
      setDiagnosticSummary(WIDGET_COPY.unavailable);
      ui.diagnostics.innerHTML = `<p class="opengdd-author-validation-unavailable">${WIDGET_COPY.validationUnavailable}</p>`;
      return;
    }
    if (status === "crashed") {
      setDiagnosticSummary(WIDGET_COPY.crashed);
      ui.diagnostics.innerHTML = `<p class="opengdd-author-validation-unavailable">${WIDGET_COPY.validationCrashed(escapeHtml(message || WIDGET_COPY.unknownError))}</p>`;
      return;
    }

    const verdict = run.summary.errors ? WIDGET_COPY.fail : run.summary.warnings ? WIDGET_COPY.passWithWarnings : WIDGET_COPY.pass;
    const verdictClass = run.summary.errors ? "fail" : run.summary.warnings ? "warnings" : "pass";
    setDiagnosticSummary(capabilities.workbenchLabels
      ? WIDGET_COPY.validationSummaryFull(verdict, run.summary.errors, run.summary.warnings)
      : WIDGET_COPY.validationSummary(verdict, run.summary.errors, run.summary.warnings));
    if (capabilities.workbenchLabels) {
      ui.diagnosticSummary.classList.add(`opengdd-author-verdict--${verdictClass}`);
    }
    const groups = [
      ["error", WIDGET_COPY.errors],
      ["warning", WIDGET_COPY.warnings]
    ].map(([severity, label]) => {
      const findings = run.findings.map((finding, index) => ({ finding, index })).filter(item => item.finding.severity === severity);
      if (!findings.length) return "";
      return `<section class="opengdd-author-diagnostic-group"><h3>${label} (${findings.length})</h3><ul>${findings.map(({ finding, index }) => {
        const location = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
        if (capabilities.workbenchLabels) {
          const accessible = `${severity}: ${finding.message} (${finding.code}) ${location}`;
          return `<li><button type="button" class="opengdd-author-diagnostic-line" data-finding="${index}" aria-label="${escapeHtml(accessible)}" title="${escapeHtml(finding.message)}"><span class="opengdd-author-diagnostic-severity opengdd-author-diagnostic-severity--${severity}" aria-hidden="true">${severity}</span><span class="opengdd-author-diagnostic-message">${escapeHtml(finding.message)}</span><span class="opengdd-author-diagnostic-location">${escapeHtml(location)}</span></button></li>`;
        }
        return `<li><button type="button" data-finding="${index}"><span class="opengdd-author-diagnostic-severity opengdd-author-diagnostic-severity--${severity}">${severity}</span><code>${escapeHtml(finding.code)}</code><span class="opengdd-author-diagnostic-location">${escapeHtml(location)}</span><span class="opengdd-author-diagnostic-message">${escapeHtml(finding.message)}</span></button></li>`;
      }).join("")}</ul></section>`;
    }).join("");
    const empty = run.findings.length ? "" : `<p class="opengdd-author-validation-empty">${WIDGET_COPY.noFindings}</p>`;
    const skipped = run.skipped.length
      ? `<p class="opengdd-author-validation-skipped">${WIDGET_COPY.skippedMediaChecks}</p>`
      : "";
    const verdictLine = capabilities.workbenchLabels ? "" : `<p class="opengdd-author-verdict opengdd-author-verdict--${verdictClass}">${WIDGET_COPY.validationSummaryFull(verdict, run.summary.errors, run.summary.warnings)}</p>`;
    ui.diagnostics.innerHTML = `${verdictLine}${empty}${groups}${skipped}`;
  }

  function outlineModel() {
    const viewGroups = state.authoringView?.groups ?? [];
    const copyArtifact = (entry, parentIdentity = "") => ({
      ...entry,
      parentIdentity,
      citations: entry.citations.map(citation => ({ ...citation })),
      findings: [],
      children: (entry.children ?? []).map(child => copyArtifact(child, entry.identity)),
      expanded: entry.kind === "collection" ? !state.outlineCollectionCollapsed.has(entry.name) : undefined
    });
    const artifacts = viewGroups.flatMap(group => group.entries).map(entry => copyArtifact(entry));
    const flatArtifacts = artifacts.flatMap(artifact => [artifact, ...(artifact.children ?? [])]);
    const fallback = new Map(OUTLINE_GROUPS.map(group => [group.id, []]));
    for (const [index, finding] of (state.validation.run?.findings ?? []).entries()) {
      if (finding.code === "COLLECTION_UNCITED") {
        const collection = flatArtifacts.find(artifact => artifact.kind === "collection" && artifact.location === finding.file);
        if (collection) {
          collection.findings.push(index);
          continue;
        }
      }
      const line = Number.isInteger(finding.line) ? finding.line - 1 : null;
      const inRange = flatArtifacts.filter(artifact => artifact.kind !== "collection" && artifact.file === finding.file && line !== null
        && line >= artifact.range.start.line && line <= artifact.range.end.line);
      if (inRange.length) {
        inRange.sort((left, right) => (left.range.end.line - left.range.start.line) - (right.range.end.line - right.range.start.line));
        inRange[0].findings.push(index);
        continue;
      }
      const fileArtifacts = flatArtifacts.filter(artifact => (artifact.kind !== "collection" && artifact.file === finding.file)
        || artifact.citations.some(citation => citation.file === finding.file));
      if (!fileArtifacts.length) continue;
      const nearestLine = artifact => {
        const locations = artifact.file === finding.file ? [artifact.range.start.line]
          : artifact.citations.filter(citation => citation.file === finding.file).map(citation => citation.range.start.line);
        return line === null ? 0 : Math.min(...locations.map(location => Math.abs(location - line)));
      };
      fileArtifacts.sort((left, right) => nearestLine(left) - nearestLine(right));
      const group = OUTLINE_GROUPS.find(item => item.kinds.includes(fileArtifacts[0].kind));
      if (group) fallback.get(group.id).push(index);
    }
    // A child problem also belongs to its collection for filtering and the
    // parent badge, while the record keeps its own normal problem behavior.
    rollUpCollectionFindings(flatArtifacts);
    return {
      problemsOnly: state.outlineProblemsOnly,
      menuOpen: state.outlineMenuOpen,
      selection: state.outlineSelection,
      noProblems: state.outlineProblemsOnly && state.validation.status === "ready" && !(state.validation.run?.findings.length),
      groups: OUTLINE_GROUPS.map(group => ({
        ...group,
        kinds: group.kinds,
        artifacts: artifacts.filter(artifact => group.kinds.includes(artifact.kind)),
        fallback: fallback.get(group.id),
        fallbackOpen: state.outlineFallbackOpen.has(group.id)
      }))
    };
  }

  function findingBadge(findingIndexes, target = "") {
    if (!findingIndexes.length) return "";
    const uncited = findingIndexes.filter(index => state.validation.run.findings[index].code === "COLLECTION_UNCITED");
    const ordinary = findingIndexes.filter(index => !uncited.includes(index));
    const uncitedBadge = uncited.map(index => `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--warning opengdd-author-outline-badge--sentence" data-outline-finding="${index}" aria-label="${escapeHtml(WIDGET_COPY.collectionUnmentioned)}">${severityIcon("warning")}<span>${escapeHtml(WIDGET_COPY.collectionUnmentioned)}</span></button>`).join("");
    if (!ordinary.length) return uncitedBadge;
    const findings = ordinary.map(index => state.validation.run.findings[index]);
    const errors = findings.filter(finding => finding.severity === "error").length;
    const warnings = findings.filter(finding => finding.severity === "warning").length;
    const severity = errors ? "error" : "warning";
    const label = WIDGET_COPY.problemCounts(ordinary.length, errors, warnings);
    const attribute = target ? ` data-outline-finding="${ordinary[0]}"` : "";
    const tag = target ? "button" : "span";
    const type = target ? ' type="button"' : "";
    return `${uncitedBadge}<${tag}${type} class="opengdd-author-outline-badge opengdd-author-outline-badge--${severity}"${attribute} aria-label="${label}">${severityIcon(severity)}<span>${ordinary.length}</span></${tag}>`;
  }

  const outlineData = value => encodeURIComponent(value);
  const findingBadgeLabel = findingIndexes => {
    const findings = findingIndexes.map(index => state.validation.run.findings[index]);
    const errors = findings.filter(finding => finding.severity === "error").length;
    const warnings = findings.filter(finding => finding.severity === "warning").length;
    return WIDGET_COPY.problemCounts(findingIndexes.length, errors, warnings);
  };

  function renderOutline() {
    if (!ui.outline || (widgetDrawer && widgetDrawer.outline.hidden)) return;
    const model = outlineModel();
    const serialized = JSON.stringify(model);
    if (serialized === renderedOutlineModel) return;
    renderedOutlineModel = serialized;
    const active = ui.outline.contains(document.activeElement) ? document.activeElement.dataset.outlineFocus : "";
    const groups = model.groups.map(group => {
      const all = group.artifacts;
      const shown = state.outlineProblemsOnly ? all.filter(artifact => artifact.findings.length).map(artifact => ({
        ...artifact,
        children: artifact.children.filter(child => child.findings.length)
      })) : all;
      const groupFallback = group.fallback;
      if (state.outlineProblemsOnly && !shown.length && !groupFallback.length) return "";
      const visibleTreeIdentities = group.id === "collections" ? shown.flatMap(artifact => [
        artifact.identity,
        ...(artifact.expanded ? artifact.children.map(child => child.identity) : [])
      ]) : [];
      const treeTabStop = visibleTreeIdentities.includes(state.outlineSelection)
        ? state.outlineSelection
        : visibleTreeIdentities[0];
      const renderArtifact = (artifact, level = 1) => {
        const kind = artifact.kind;
        const entryKey = outlineData(artifact.identity);
        const citations = artifact.citations.length ? `<details class="opengdd-author-outline-citations"><summary>${WIDGET_COPY.citations(artifact.citations.length)}</summary><ul role="list">${artifact.citations.map(citation => `<li><button type="button" data-outline-entry="${entryKey}" data-outline-citation="${outlineData(citation.identity)}" data-outline-focus="citation-${outlineData(citation.identity)}">${escapeHtml(citation.file)} · ${WIDGET_COPY.line(citation.range.start.line + 1)}</button></li>`).join("")}</ul></details>` : "";
        const kindTagValue = artifact.kind === "collection" ? WIDGET_COPY.collectionKind : artifact.kindTag;
        const kindTag = kindTagValue ? `<span class="opengdd-author-outline-kind-tag">${kindTagValue}</span>` : "";
        const accessibleKind = kindTagValue ? `, ${kindTagValue}` : "";
        if (kind === "collection") {
          const count = artifact.count ? WIDGET_COPY.collectionCount(artifact.count) : WIDGET_COPY.collectionEmptyCount;
          const location = WIDGET_COPY.collectionLocation(artifact.name);
          const children = artifact.expanded && artifact.children.length
            ? `<ul class="opengdd-author-outline-children" role="group">${artifact.children.map(child => renderArtifact(child, 2)).join("")}</ul>`
            : "";
          return `<li role="treeitem" aria-level="1" aria-expanded="${artifact.expanded}" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--collection${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" class="opengdd-author-outline-toggle" data-outline-toggle="${entryKey}" data-outline-focus="toggle-${entryKey}" aria-label="${escapeHtml(artifact.expanded ? WIDGET_COPY.collapseCollection(artifact.name) : WIDGET_COPY.expandCollection(artifact.name))}" aria-expanded="${artifact.expanded}">${artifact.expanded ? "▾" : "▸"}</button><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--collection" aria-label="${escapeHtml(`${artifact.name}${accessibleKind}, ${count}, ${location}`)}"><span class="opengdd-author-outline-name">${escapeHtml(artifact.name)}</span>${kindTag}<span class="opengdd-author-outline-count">${escapeHtml(count)}</span><span class="opengdd-author-outline-location">${escapeHtml(location)}</span></button>${findingBadge(artifact.findings, "finding")}<button type="button" class="opengdd-author-outline-add-record" data-outline-add-record="${escapeHtml(artifact.name)}" data-outline-focus="add-${entryKey}">${WIDGET_COPY.addRecord}</button></div>${citations}${children}</li>`;
        }
        if (level === 2) return `<li role="treeitem" aria-level="2" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-parent="${outlineData(artifact.parentIdentity)}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--child${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--${kind}" aria-label="${escapeHtml(`${artifact.name}${accessibleKind}, ${artifact.file}, ${WIDGET_COPY.line(artifact.range.start.line + 1)}`)}"><span class="opengdd-author-outline-name">${escapeHtml(artifact.name)}</span>${kindTag}<span class="opengdd-author-outline-location">${escapeHtml(artifact.file)} · ${WIDGET_COPY.line(artifact.range.start.line + 1)}</span></button>${findingBadge(artifact.findings, "finding")}</div>${citations}</li>`;
        return `<li class="opengdd-author-outline-entry${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div><button type="button" class="opengdd-author-outline-jump opengdd-author-kind--${kind}" data-outline-entry="${entryKey}" data-outline-focus="entry-${entryKey}" aria-label="${escapeHtml(`${artifact.name}${accessibleKind}, ${artifact.file}, ${WIDGET_COPY.line(artifact.range.start.line + 1)}`)}"><span class="opengdd-author-outline-name">${escapeHtml(artifact.name)}</span>${kindTag}<span class="opengdd-author-outline-location">${escapeHtml(artifact.file)} · ${WIDGET_COPY.line(artifact.range.start.line + 1)}</span></button>${findingBadge(artifact.findings, "finding")}</div>${citations}</li>`;
      };
      const entries = shown.map(artifact => renderArtifact(artifact)).join("");
      const empty = shown.length ? "" : state.outlineProblemsOnly ? "" : `<div class="opengdd-author-outline-empty"><p>${group.empty}</p><button type="button" data-outline-create="${group.create}" data-outline-focus="create-${outlineData(group.create)}">${group.action}</button></div>`;
      const severity = groupFallback.some(index => state.validation.run.findings[index].severity === "error") ? "error" : "warning";
      const fallbackId = `opengdd-outline-${group.id}-fallback`;
      const disclosure = groupFallback.length ? `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--${severity}" data-outline-disclosure="${group.id}" data-outline-focus="fallback-${group.id}" aria-expanded="${group.fallbackOpen}" aria-controls="${fallbackId}" aria-label="${findingBadgeLabel(groupFallback)}">${severityIcon(severity)}<span>${groupFallback.length}</span></button>` : "";
      const fallbackList = group.fallbackOpen && groupFallback.length ? `<ul class="opengdd-author-outline-fallback" id="${fallbackId}" role="list">${groupFallback.map(index => {
        const finding = state.validation.run.findings[index];
        return `<li><button type="button" data-outline-finding="${index}" data-outline-focus="fallback-${group.id}-${index}"><span>${escapeHtml(finding.message)}</span><span>${escapeHtml(finding.file)}${finding.line ? ` · ${WIDGET_COPY.line(finding.line)}` : ""}</span></button></li>`;
      }).join("")}</ul>` : "";
      const headerCreate = group.id === "collections" ? `<button type="button" class="opengdd-author-outline-group-create" data-outline-create="Collection" data-outline-focus="group-create-collections">${group.action}</button>` : "";
      const entryList = group.id === "collections" ? `<ul role="tree">${entries}</ul>` : `<ul role="list">${entries}</ul>`;
      return `<section class="opengdd-author-outline-group opengdd-author-kind--${group.kinds[0] === "name" ? "name" : group.kinds[0]}" role="group" aria-labelledby="opengdd-outline-${group.id}"><h3 id="opengdd-outline-${group.id}">${outlineIcon(group)}<span>${group.label}</span>${headerCreate}${disclosure}</h3>${fallbackList}${entries ? entryList : empty}</section>`;
    }).join("");
    const artifacts = model.groups.flatMap(group => group.artifacts);
    const nothing = artifacts.length || state.outlineProblemsOnly ? "" : `<p class="opengdd-author-outline-nothing"><strong>${WIDGET_COPY.outlineNothing}</strong><span>${WIDGET_COPY.outlineNothingAction}</span></p>`;
    const noProblems = model.noProblems ? `<p class="opengdd-author-outline-nothing" role="status">${WIDGET_COPY.noValidationProblems}</p>` : "";
    const selectedFile = state.selected?.type === "file" ? state.selected.path : "";
    const panelCreators = panelHost?.creators({ file: selectedFile }, { menu: true }) ?? [];
    const promptedCreator = panelCreators.find(creator => creator.id === state.panelCreatorPrompt);
    const panelCreatorMarkup = panelCreators.map(creator => `<button type="button" role="menuitem" tabindex="-1" data-panel-creator="${escapeHtml(creator.id)}" data-outline-focus="panel-creator-${outlineData(creator.id)}">${escapeHtml(creator.label)}</button>`).join("");
    const creatorError = state.panelCreatorError ? `<p class="opengdd-author-quickfix-error" aria-live="polite">${escapeHtml(state.panelCreatorError)}</p>` : "";
    const promptMarkup = promptedCreator ? `<div class="opengdd-author-panel-creator-prompt"><strong>${escapeHtml(promptedCreator.label)}</strong><p>${escapeHtml(promptedCreator.help)}</p><input data-panel-creator-name autocomplete="off"><button type="button" data-panel-creator-confirm="${escapeHtml(promptedCreator.id)}">${WIDGET_COPY.create}</button>${creatorError}</div>` : creatorError;
    ui.outline.innerHTML = `<div class="opengdd-author-outline-controls"><div class="opengdd-author-outline-create"><button type="button" data-action="outline-menu" data-outline-focus="menu" aria-label="${WIDGET_COPY.create}" aria-haspopup="menu" aria-expanded="${state.outlineMenuOpen}">+</button>${state.outlineMenuOpen ? `<div role="menu" aria-label="${WIDGET_COPY.create}"><span>${WIDGET_COPY.create}</span>${OUTLINE_CREATE_ITEMS.map((item, index) => `<button type="button" role="menuitem" tabindex="${index ? -1 : 0}" data-outline-create="${item}" data-outline-focus="menuitem-${outlineData(item)}">${item}</button>`).join("")}${panelCreatorMarkup}${promptMarkup}</div>` : ""}</div><label><input type="checkbox" data-outline-filter data-outline-focus="filter"${state.outlineProblemsOnly ? " checked" : ""}> ${WIDGET_COPY.problemsOnly}</label></div>${noProblems}${nothing}${groups}<div data-panel-sidebar></div>`;
    panelHost?.refreshSidebar();
    if (active) [...ui.outline.querySelectorAll("[data-outline-focus]")].find(element => element.dataset.outlineFocus === active)?.focus({ preventScroll: true });
  }

  function scheduleOutlineRender() {
    if (!ui.outline || outlineFrame) return;
    outlineFrame = view.requestAnimationFrame(() => {
      outlineFrame = 0;
      renderOutline();
    });
  }

  function openOutlineLocation(location) {
    if (location.kind === "collection") {
      const path = location.location.replace(/\/$/, "");
      const exists = state.package.folders.has(path) || [...state.package.files.keys()].some(file => file.startsWith(`${path}/`));
      if (!exists) return false;
      state.selected = { type: "folder", path };
      const parts = path.split("/");
      for (let index = 1; index <= parts.length; index += 1) state.collapsed.delete(parts.slice(0, index).join("/"));
      renderTree();
      return true;
    }
    if (!state.package.files.has(location.file) || editController.revision(location.file) !== location.revision) return false;
    openFile(location.file);
    if (!ui.textarea.hidden) {
      const text = ui.textarea.value;
      const line = lineBounds(text, location.range.start.line);
      const start = clampedPositionToOffset(text, location.range.start);
      const end = Math.max(start, clampedPositionToOffset(text, location.range.end));
      ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(start, end);
      editorSurface.scrollToEditorLine(line.index);
    }
    return true;
  }

  const parsedObject = path => {
    const text = state.package.files.get(path);
    if (typeof text !== "string") return null;
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(WIDGET_COPY.jsonObjectRequired(path));
    return value;
  };
  const availableKey = (object, base) => {
    if (!Object.hasOwn(object ?? {}, base)) return base;
    for (let suffix = 2; ; suffix += 1) if (!Object.hasOwn(object, `${base}-${suffix}`)) return `${base}-${suffix}`;
  };

  const authoringEntries = () => (state.authoringView?.groups ?? []).flatMap(group => group.entries)
    .flatMap(entry => [entry, ...(entry.children ?? [])]);

  function positionCollectionDialog() {
    if (!collectionDialog || ui.collectionDialog.hidden) return;
    const rectangle = collectionDialog.anchor?.getBoundingClientRect();
    if (!rectangle) return;
    const box = ui.collectionDialog.getBoundingClientRect();
    const gap = 6;
    const top = rectangle.bottom + gap + box.height <= view.innerHeight - gap
      ? rectangle.bottom + gap
      : Math.max(gap, rectangle.top - box.height - gap);
    const left = Math.min(Math.max(gap, rectangle.left), Math.max(gap, view.innerWidth - box.width - gap));
    ui.collectionDialog.style.top = `${top}px`;
    ui.collectionDialog.style.left = `${left}px`;
  }

  function updateCollectionDialog() {
    if (!collectionDialog) return;
    const copy = CREATION_COPY.collectionDialog;
    const collectionName = collectionDialog.mode === "collection"
      ? kebabName(collectionDialog.collectionValue)
      : collectionDialog.collection;
    const recordName = kebabName(collectionDialog.recordValue);
    const collectionTaken = collectionDialog.mode === "collection"
      && collectionNameTaken(state.package.files, state.package.folders, collectionName);
    const recordTaken = recordName && collectionRecordNameTaken(
      state.package.files, state.package.folders, collectionName, recordName
    );
    const collectionPreview = ui.collectionDialog.querySelector("[data-collection-preview]");
    const recordPreview = ui.collectionDialog.querySelector("[data-record-preview]");
    const collectionError = ui.collectionDialog.querySelector("[data-collection-error]");
    const recordError = ui.collectionDialog.querySelector("[data-record-error]");
    if (collectionPreview) collectionPreview.textContent = copy.collectionPreview(collectionName);
    if (recordPreview) recordPreview.textContent = copy.recordPreview(recordName);
    if (collectionError) collectionError.textContent = collectionTaken ? copy.collectionTaken(collectionName) : "";
    if (recordError) recordError.textContent = recordTaken ? copy.recordTaken(recordName, collectionName) : "";
    const create = ui.collectionDialog.querySelector("[data-collection-confirm]");
    create.disabled = !collectionName || collectionTaken || !recordName || recordTaken;
  }

  function renderCollectionDialog(focus = true) {
    if (!collectionDialog) return;
    const copy = CREATION_COPY.collectionDialog;
    const collectionQuestion = collectionDialog.mode === "collection" ? `<label for="opengdd-collection-name">${copy.collectionQuestion}</label><p class="opengdd-author-create-help">${escapeHtml(copy.collectionHelp)}</p><input id="opengdd-collection-name" data-collection-name autocomplete="off" value="${escapeHtml(collectionDialog.collectionValue)}"><p class="opengdd-author-create-preview" data-collection-preview></p><p class="opengdd-author-create-error" data-collection-error aria-live="polite"></p>` : "";
    const recordQuestion = collectionDialog.mode === "collection" ? copy.firstRecordQuestion : copy.recordQuestion;
    const skip = collectionDialog.mode === "collection" ? `<button type="button" class="opengdd-author-create-skip" data-collection-skip>${copy.skipFirstRecord}</button>` : "";
    ui.collectionDialog.setAttribute("aria-labelledby", "opengdd-collection-dialog-title");
    ui.collectionDialog.innerHTML = `<h3 id="opengdd-collection-dialog-title">${collectionDialog.mode === "collection" ? copy.title : WIDGET_COPY.addRecord}</h3>${collectionQuestion}<label for="opengdd-record-name">${recordQuestion}</label><p class="opengdd-author-create-help">${escapeHtml(copy.recordHelp)}</p><input id="opengdd-record-name" data-record-name autocomplete="off" value="${escapeHtml(collectionDialog.recordValue)}"><p class="opengdd-author-create-preview" data-record-preview></p><p class="opengdd-author-create-error" data-record-error aria-live="polite"></p>${skip}<div class="opengdd-author-create-actions"><button type="button" data-collection-confirm>${copy.create}</button><button type="button" data-collection-cancel>${copy.cancel}</button></div>`;
    ui.collectionDialog.hidden = false;
    updateCollectionDialog();
    positionCollectionDialog();
    if (focus) ui.collectionDialog.querySelector(collectionDialog.mode === "collection" ? "[data-collection-name]" : "[data-record-name]")?.focus({ preventScroll: true });
  }

  function ensureCollectionDialog() {
    if (ui.collectionDialog) return;
    ui.collectionDialog = document.createElement("div");
    ui.collectionDialog.className = "opengdd-author-create-dialog";
    ui.collectionDialog.dataset.role = "collection-dialog";
    ui.collectionDialog.setAttribute("role", "dialog");
    ui.collectionDialog.hidden = true;
    rootElement.append(ui.collectionDialog);
    ownedChildren.get(rootElement).add(ui.collectionDialog);
    on(ui.collectionDialog, "input", event => {
      if (!collectionDialog) return;
      if (event.target.matches("[data-collection-name]")) collectionDialog.collectionValue = event.target.value;
      if (event.target.matches("[data-record-name]")) collectionDialog.recordValue = event.target.value;
      updateCollectionDialog();
    });
    on(ui.collectionDialog, "click", event => {
      event.stopPropagation();
      if (!collectionDialog) return;
      if (event.target.closest("[data-collection-skip]")) {
        commitCollectionDialog({ skip: true }).catch(error => report(error.message, true));
      } else if (event.target.closest("[data-collection-confirm]")) {
        commitCollectionDialog().catch(error => report(error.message, true));
      } else if (event.target.closest("[data-collection-cancel]")) hideCollectionDialog(true);
    });
    on(ui.collectionDialog, "keydown", event => {
      if (!collectionDialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        hideCollectionDialog(true);
      } else if (event.key === "Enter" && event.target.matches("input")) {
        event.preventDefault();
        commitCollectionDialog().catch(error => report(error.message, true));
      } else if (event.key === "Tab") {
        const focusable = [...ui.collectionDialog.querySelectorAll("button:not([disabled]), input:not([disabled])")];
        const current = focusable.indexOf(document.activeElement);
        if (!focusable.length || (!event.shiftKey && current < focusable.length - 1) || (event.shiftKey && current > 0)) return;
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
      }
    });
  }

  function openCollectionDialog(anchor, mode = "collection", collection = "") {
    ensureCollectionDialog();
    collectionDialog = {
      anchor,
      returnFocus: anchor,
      mode,
      collection,
      collectionValue: "",
      recordValue: ""
    };
    renderCollectionDialog();
  }

  function hideCollectionDialog(restoreFocus = false) {
    const returnFocus = collectionDialog?.returnFocus;
    collectionDialog = null;
    if (ui.collectionDialog) {
      ui.collectionDialog.hidden = true;
      ui.collectionDialog.replaceChildren();
    }
    if (!restoreFocus || !returnFocus) return;
    // The outline re-renders wholesale whenever analysis publishes, so the
    // opener captured at open time may be a detached node by the time the
    // dialog closes; its focus key names the surviving control.
    const key = returnFocus.dataset?.outlineFocus;
    const target = (key && [...ui.outline.querySelectorAll("[data-outline-focus]")].find(element => element.dataset.outlineFocus === key))
      ?? (returnFocus.isConnected ? returnFocus : null);
    target?.focus({ preventScroll: true });
  }

  async function commitCollectionDialog({ skip = false } = {}) {
    if (!collectionDialog) return;
    const pending = collectionDialog;
    const collection = pending.mode === "collection" ? kebabName(pending.collectionValue) : pending.collection;
    const record = kebabName(pending.recordValue);
    if (!collection || collectionNameTaken(state.package.files, state.package.folders, pending.mode === "collection" ? collection : "")) {
      updateCollectionDialog();
      return;
    }
    if (!skip && (!record || collectionRecordNameTaken(state.package.files, state.package.folders, collection, record))) {
      updateCollectionDialog();
      return;
    }
    const label = pending.mode === "collection"
      ? CREATION_COPY.collectionDialog.createUndo
      : CREATION_COPY.collectionDialog.addRecordUndo;
    const transaction = editController.begin(label);
    if (pending.mode === "collection") transaction.folder(`collections/${collection}`).create();
    if (!skip) transaction.file(`collections/${collection}/${record}.json`).create(collectionRecordText(state.package.files, collection));
    await applyEdit(() => transaction.commit());
    state.outlineCollectionCollapsed.delete(collection);
    host.outlineCollections?.setCollapsed?.([...state.outlineCollectionCollapsed]);
    state.outlineMenuOpen = false;
    hideCollectionDialog(false);
    analyzeNow();
    validationChanged();
    renderAll();
    const selected = authoringEntries().find(entry => entry.kind === (skip ? "collection" : "collection-record")
      && entry.name === (skip ? collection : record)
      && (skip || entry.file === `collections/${collection}/${record}.json`));
    if (!selected || !openOutlineLocation(selected)) {
      report(WIDGET_COPY.declarationGone(skip ? collection : record), true);
      return;
    }
    state.outlineSelection = selected.identity;
    selectionBus.select({
      kind: selected.kind,
      name: selected.name,
      file: selected.kind === "collection" ? selected.location.replace(/\/$/, "") : selected.file,
      range: selected.range
    }, { origin: { surface: "sidebar" } });
    renderedOutlineModel = "";
    renderOutline();
  }

  async function createFromOutline(item) {
    state.outlineMenuOpen = false;
    const transaction = editController.begin(CREATION_COPY.createNamed(item));
    let selected;
    const insert = (path, pointer, key, value) => transaction.json(path).insert(pointer, key, value);
    const replaceInTransaction = (path, next) => {
      const previous = state.package.files.get(path);
      const change = minimalTextChange(previous, next);
      transaction.text(path).replace({
        start: offsetToPosition(previous, change.start),
        end: offsetToPosition(previous, change.previousEnd),
        revision: editController.revision(path)
      }, next.slice(change.start, change.nextEnd));
    };
    const insertRoot = (path, key, value) => insert(path, "", key, value);

    if (item === "Tuning key") {
      const tuning = parsedObject("tuning.json");
      const key = availableKey(tuning?.tunables, "new.tuning_key");
      if (!tuning) transaction.file("tuning.json").create(`${JSON.stringify({ tunables: { [key]: 0 } }, null, 2)}\n`);
      else if (tuning.tunables && !Array.isArray(tuning.tunables) && typeof tuning.tunables === "object") insert("tuning.json", "/tunables", key, 0);
      else if (tuning.tunables === undefined) insertRoot("tuning.json", "tunables", { [key]: 0 });
      else throw new Error(CREATION_COPY.outlineErrors.tuningObject);
      selected = { kind: "tunable", name: key, file: "tuning.json" };
    } else if (item === "Descriptor") {
      const manifest = parsedObject("manifest.json");
      if (!manifest) throw new Error(CREATION_COPY.outlineErrors.descriptorManifest);
      const descriptors = manifest.descriptors;
      const moods = Array.isArray(descriptors?.mood) ? descriptors.mood : [];
      if (descriptors !== undefined && (!descriptors || Array.isArray(descriptors) || typeof descriptors !== "object")) throw new Error(CREATION_COPY.outlineErrors.descriptorsObject);
      if (descriptors?.mood !== undefined && !Array.isArray(descriptors.mood)) throw new Error(CREATION_COPY.outlineErrors.descriptorMoodsArray);
      const ids = Object.fromEntries(moods.map(entry => [entry?.id, true]));
      const id = availableKey(ids, "new-mood");
      const stub = { id, intent: "Describe the intended mood.", anti: [{ description: "Not yet specified." }] };
      if (descriptors === undefined) insertRoot("manifest.json", "descriptors", { mood: [stub] });
      else if (descriptors.mood === undefined) insert("manifest.json", "/descriptors", "mood", [stub]);
      else insert("manifest.json", "/descriptors/mood", "-", stub);
      selected = { kind: "descriptor", name: id, file: "manifest.json" };
    } else if (item === "Palette") {
      const manifest = parsedObject("manifest.json");
      if (!manifest) throw new Error(CREATION_COPY.outlineErrors.paletteManifest);
      if (manifest.palette !== undefined && (!manifest.palette || Array.isArray(manifest.palette) || typeof manifest.palette !== "object")) throw new Error(CREATION_COPY.outlineErrors.paletteObject);
      const key = availableKey(manifest.palette, "new-palette");
      const stub = [{ "new-color": "#000000" }];
      if (manifest.palette === undefined) insertRoot("manifest.json", "palette", { [key]: stub });
      else insert("manifest.json", "/palette", key, stub);
      selected = { kind: "palette", name: `palette.${key}`, file: "manifest.json" };
    } else if (item === "Identifier") {
      const manifest = parsedObject("manifest.json");
      if (!manifest) throw new Error(CREATION_COPY.outlineErrors.identifierManifest);
      const direction = parsedObject("direction.json");
      const viewingStub = { speed_and_size: "Normal play view.", calibration: "Standard display.", hide_builder_name: true };
      let pillar;
      let viewingName = "outline-view";
      if (!direction) {
        pillar = "new-pillar";
        transaction.file("direction.json").create(`${JSON.stringify({
          pillars: {
            [pillar]: { statement: "Describe this design pillar.", viewing: "outline-view" },
            "supporting-pillar": { statement: "Describe the supporting design pillar.", viewing: "outline-view" }
          },
          viewing: { "outline-view": viewingStub }
        }, null, 2)}\n`);
      } else {
        if (direction.viewing !== undefined && (!direction.viewing || Array.isArray(direction.viewing) || typeof direction.viewing !== "object")) throw new Error(CREATION_COPY.outlineErrors.viewingObject);
        const viewing = Object.keys(direction.viewing ?? {})[0] ?? "outline-view";
        viewingName = viewing;
        if (direction.pillars !== undefined && (!direction.pillars || Array.isArray(direction.pillars) || typeof direction.pillars !== "object")) throw new Error(CREATION_COPY.outlineErrors.pillarsObject);
        pillar = availableKey(direction.pillars, "new-pillar");
        const stub = { statement: "Describe this design pillar.", viewing };
        const count = Object.keys(direction.pillars ?? {}).length;
        if (direction.viewing === undefined || direction.pillars === undefined) {
          const nextDirection = JSON.parse(JSON.stringify(direction));
          nextDirection.viewing ??= { [viewing]: viewingStub };
          nextDirection.pillars ??= {
            [pillar]: stub,
            "supporting-pillar": { statement: "Describe the supporting design pillar.", viewing }
          };
          if (direction.pillars !== undefined) {
            nextDirection.pillars[pillar] = stub;
            if (count === 0) nextDirection.pillars["supporting-pillar"] = { statement: "Describe the supporting design pillar.", viewing };
          }
          replaceInTransaction("direction.json", `${JSON.stringify(nextDirection, null, 2)}\n`);
        } else {
          insert("direction.json", "/pillars", pillar, stub);
          if (count === 0) insert("direction.json", "/pillars", availableKey({ [pillar]: true }, "supporting-pillar"), { statement: "Describe the supporting design pillar.", viewing });
        }
      }
      if (!manifest.build?.direction) insert("manifest.json", "/build", "direction", "direction.json");
      const presentationPath = "04-presentation.md";
      const presentation = state.package.files.get(presentationPath);
      const directionFence = `\n\n\`\`\`direction\n> DELEGATED: presentation-direction\n\nPILLARS:\n- \`pillars.${pillar}\`\n  Describe this design pillar.\n${direction ? "" : "- `pillars.supporting-pillar`\n  Describe the supporting design pillar.\n"}\nVIEWING:\n- \`viewing.${viewingName}\`\n  Normal play view on a standard display.\n\`\`\`\n`;
      if (typeof presentation !== "string") {
        transaction.file(presentationPath).create(`# Presentation${directionFence}`);
        if (!manifest.build?.chapters?.includes(presentationPath)) insert("manifest.json", "/build/chapters", "-", presentationPath);
      } else if (!presentation.includes("```direction")) {
        transaction.text(presentationPath).append(directionFence);
      } else {
        const fenceStart = presentation.indexOf("```direction");
        const pillarsAt = presentation.indexOf("PILLARS:", fenceStart);
        const nextSection = pillarsAt < 0 ? -1 : presentation.slice(pillarsAt + 8).search(/\n(?:[A-Z][A-Z-]*:|```)/);
        if (pillarsAt < 0 || nextSection < 0) throw new Error(CREATION_COPY.outlineErrors.pillarsSection);
        const at = pillarsAt + 8 + nextSection;
        const block = `\n- \`pillars.${pillar}\`\n  Describe this design pillar.`;
        transaction.text(presentationPath).replace({
          start: offsetToPosition(presentation, at),
          end: offsetToPosition(presentation, at),
          revision: editController.revision(presentationPath)
        }, block);
      }
      selected = { kind: "name", name: `pillars.${pillar}`, file: "direction.json" };
    } else return;

    await applyEdit(() => transaction.commit());
    analyzeNow();
    validationChanged();
    renderAll();
    const entry = authoringEntries().find(candidate => candidate.kind === selected.kind
      && candidate.name === selected.name && candidate.file === selected.file);
    if (!entry || !openOutlineLocation(entry)) {
      report(WIDGET_COPY.declarationGone(selected.name), true);
      return;
    }
    state.outlineSelection = entry.identity;
    renderedOutlineModel = "";
    renderOutline();
  }

  function renderStatus() {
    const anchors = ui.textarea.hidden || !editorSurface ? [] : editorSurface.anchors();
    const count = classification => anchors.filter(anchor => anchor.classification === classification).length;
    const tally = (kind, total) => `<span class="${total ? `opengdd-author-status-${kind}` : ""}">${WIDGET_COPY.classifiedCount(total, kind)}</span>`;
    const validation = state.validation.run
      ? tally("errors", state.validation.run.summary.errors) + tally("warnings", state.validation.run.summary.warnings)
      : `<span>${state.validation.status === "pending" ? WIDGET_COPY.validationPending : WIDGET_COPY.validationUnavailableStatus}</span>`;
    if (!capabilities.workbenchLabels) {
      ui.status.innerHTML = `<span>${escapeHtml(state.package.title)}</span><span>${WIDGET_COPY.fileCount(state.package.files.size)}</span><span>${WIDGET_COPY.nameCount(state.authoringView?.nameCount ?? 0)}</span><span class="opengdd-author-status-known">${WIDGET_COPY.classifiedCount(count("known"), "known")}</span><span class="opengdd-author-status-unknown">${WIDGET_COPY.classifiedCount(count("unknown"), "unknown")}</span><span class="opengdd-author-status-ambiguous">${WIDGET_COPY.classifiedCount(count("ambiguous"), "ambiguous")}</span>${validation}`;
      return;
    }
    const summary = state.validation.run?.summary;
    const words = state.authoringView?.wordCounts?.[state.openPath] ?? 0;
    const declarations = state.authoringView?.declarationCount ?? 0;
    const validationState = {
      pending: WORKBENCH_COPY.validationChecking,
      unavailable: WORKBENCH_COPY.validationUnavailable,
      crashed: WORKBENCH_COPY.validationStopped,
      ready: WORKBENCH_COPY.validationDone
    }[state.validation.status];
    const errors = summary ? summary.errors : "—";
    const warnings = summary ? summary.warnings : "—";
    ui.status.innerHTML = `<button type="button" data-outline-problems>${WORKBENCH_COPY.errors(errors)}</button><button type="button" data-outline-problems>${WORKBENCH_COPY.warnings(warnings)}</button><span>${WORKBENCH_COPY.words(words)}</span><span>${WORKBENCH_COPY.declarations(declarations)}</span><span>${workerActive ? WORKBENCH_COPY.checkingInWorker : WORKBENCH_COPY.checkingOnPage}</span><span>${WORKBENCH_COPY.validationStatus(validationState)}</span><span>${escapeHtml(state.saveStatus)}</span>`;
  }

  function renderAll() {
    ui.title.textContent = state.package.title;
    renderTree();
    renderEditor();
    renderDiagnostics();
    renderOutline();
    renderStatus();
    renderHistory();
  }

  function targetFolder() {
    if (!state.selected) return "";
    return state.selected.type === "folder" ? state.selected.path : parentPath(state.selected.path);
  }

  function beginTreeAction(action) {
    if (capabilities.protectedFiles && action === "rename" && state.selected?.type === "file" && PROTECTED_PACKAGE_FILES.has(state.selected.path)) {
      report(WIDGET_COPY.protectedRename(state.selected.path));
      return;
    }
    state.formAction = action;
    const current = state.selected?.path ?? "";
    ui.treePrompt.textContent = action === "new-file" ? WIDGET_COPY.newFilePath : action === "new-folder" ? WIDGET_COPY.newFolderPath : WIDGET_COPY.newPath;
    const renameParent = action === "rename" ? parentPath(current) : "";
    if (!ui.treeParent) {
      ui.treeParent = document.createElement("span");
      ui.treeParent.className = "opengdd-author-tree-parent";
      ui.treeInput.before(ui.treeParent);
    }
    ui.treeParent.hidden = !renameParent;
    ui.treeParent.textContent = renameParent ? `${renameParent}/` : "";
    ui.treeInput.value = action === "rename" ? basename(current) : action === "new-file" ? WIDGET_COPY.defaultFilePath : WIDGET_COPY.defaultFolderPath;
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
    if (taken) throw new Error(WIDGET_COPY.pathExists(taken));
  }

  async function movePath(type, from, requested, label = WIDGET_COPY.moveAction(from)) {
    if (capabilities.protectedFiles && type === "file" && PROTECTED_PACKAGE_FILES.has(from)) {
      report(WIDGET_COPY.protectedRename(from));
      return false;
    }
    const to = normalizePath(requested);
    if (from === to) return;
    editorSurface.closeDialog(false);
    const transaction = editController.begin(label);
    if (type === "file") {
      claimPath(to, from);
      transaction.file(from).move(to);
    } else {
      if (to.startsWith(`${from}/`)) throw new Error(WIDGET_COPY.folderInsideItself);
      const affectedFiles = [...state.package.files].filter(([path]) => path.startsWith(`${from}/`));
      const affectedFolders = [...state.package.folders].filter(path => path === from || path.startsWith(`${from}/`));
      const destinationExists = state.package.folders.has(to) && !affectedFolders.includes(to);
      if (destinationExists || [...state.package.files.keys()].some(path => path === to || path.startsWith(`${to}/`))) {
        throw new Error(WIDGET_COPY.destinationNotEmpty(to));
      }
      transaction.folder(from).move(to);
    }
    await applyEdit(() => transaction.commit());
    if (type === "file" && state.openPath === from) state.openPath = to;
    else if (type === "folder" && state.openPath.startsWith(`${from}/`)) state.openPath = `${to}${state.openPath.slice(from.length)}`;
    state.selected = { type, path: to };
    analyzeNow();
    renderAll();
    validationChanged();
    return true;
  }

  async function deleteTreeSelection() {
    if (!state.selected) return false;
    const { type, path } = state.selected;
    if (capabilities.protectedFiles && type === "file" && PROTECTED_PACKAGE_FILES.has(path)) {
      report(WIDGET_COPY.protectedDelete(path));
      return false;
    }
    const transaction = editController.begin(WIDGET_COPY.deletePathAction(path));
    if (type === "file") transaction.file(path).remove();
    else transaction.folder(path).remove();
    await applyEdit(() => transaction.commit());
    if (type === "file" ? state.openPath === path : state.openPath.startsWith(`${path}/`)) {
      state.openPath = [...state.package.files.keys()].find(item => /\.md$/i.test(item)) ?? [...state.package.files.keys()][0] ?? "";
    }
    state.selected = state.openPath ? { type: "file", path: state.openPath } : null;
    analyzeNow();
    renderAll();
    validationChanged();
    return true;
  }

  async function submitTreeAction() {
    const action = state.formAction;
    let path = normalizePath(ui.treeInput.value);
    if (action === "rename" && state.selected) {
      if (/[\\/]/.test(ui.treeInput.value)) throw new Error(WIDGET_COPY.renameLeafOnly);
      const folder = parentPath(state.selected.path);
      path = folder ? `${folder}/${path}` : path;
    } else if (!ui.treeInput.value.includes("/")) {
      const folder = targetFolder();
      path = folder ? `${folder}/${path}` : path;
    }
    if (action === "new-file") {
      claimPath(path);
      const transaction = editController.begin(WIDGET_COPY.createPathAction(path));
      transaction.file(path).create("");
      await applyEdit(() => transaction.commit());
      state.openPath = path;
      state.selected = { type: "file", path };
    } else if (action === "new-folder") {
      claimPath(path);
      const transaction = editController.begin(WIDGET_COPY.createPathAction(path));
      transaction.folder(path).create();
      await applyEdit(() => transaction.commit());
      state.selected = { type: "folder", path };
    } else if (state.selected) {
      await movePath(state.selected.type, state.selected.path, path, WIDGET_COPY.renamePathAction(state.selected.path));
      ui.treeForm.hidden = true;
      return;
    }
    ui.treeForm.hidden = true;
    analyzeNow();
    renderAll();
    validationChanged();
  }

  function hidePackageConfirmation(restoreFocus = false) {
    // Confirmation key/click handlers update the session first; its synchronous
    // cancellation delivery clears the pinned target before this DOM-only hide
    // restores focus to the control that opened the dialog.
    ui.packageConfirm.hidden = true;
    ui.packageConfirm.replaceChildren();
    const returnFocus = packageConfirmReturnFocus;
    packageConfirmReturnFocus = null;
    if (restoreFocus && returnFocus?.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
  }

  function syncPackageControls() {
    const id = state.package.id;
    if ([...ui.packageSelect.options].some(option => option.value === id)) ui.packageSelect.value = id;
    ui.packageDelete.disabled = !state.hasDraft;
    ui.packageDelete.hidden = !state.hasDraft;
    ui.packageDelete.textContent = state.hasDraft && state.isBuiltin ? WIDGET_COPY.resetExample : WIDGET_COPY.delete;
    ui.packageDelete.setAttribute("aria-label", state.isBuiltin ? WIDGET_COPY.resetExampleLabel : WIDGET_COPY.deleteLocalPackage);
  }

  function renderPackageOptions(preferredId = state.package.id) {
    const entries = state.options;
    ui.packageSelect.innerHTML = entries.length
      ? entries.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")
      : `<option value="">${WIDGET_COPY.noPackages}</option>`;
    ui.packageSelect.disabled = !entries.length;
    const selected = entries.some(item => item.id === preferredId) ? preferredId : entries[0]?.id ?? "";
    ui.packageSelect.value = selected;
    syncPackageControls();
    return selected;
  }

  let builtinDiscovery = Promise.resolve([]);
  let builtinDiscoveryError = null;
  async function handleZipImport(file) {
    if (!file) return;
    try {
      // Both ZIP input and tree-drop handlers enter here. Session import
      // publishes the opened package before its save settles, so this report
      // reads the imported title only after the composition render has run.
      await packageSession.importZip(file);
      report(WIDGET_COPY.importedPackage(state.package.title));
    }
    catch (error) { report(error.message, true); }
    ui.zip.value = "";
  }

  async function handleClick(event) {
    // Any click outside the editor and the panel means the designer has moved
    // on; a decision about text they are no longer looking at must not linger.
    // A detached target is a dialog control the surface re-rendered mid-click
    // (kind selection), never an outside click.
    if (editorSurface.dialogOpen() && event.target.isConnected && !editorSurface.dialogContains(event.target) && event.target !== ui.textarea) editorSurface.closeDialog(false);
    const finding = event.target.closest("[data-finding]");
    if (finding) {
      safelyOpenFinding(Number(finding.dataset.finding));
      return;
    }
    const outlineFinding = event.target.closest("[data-outline-finding]");
    if (outlineFinding) {
      openFinding(Number(outlineFinding.dataset.outlineFinding));
      return;
    }
    const outlineToggle = event.target.closest("[data-outline-toggle]");
    if (outlineToggle) {
      const identity = decodeURIComponent(outlineToggle.dataset.outlineToggle);
      const collection = authoringEntries().find(entry => entry.identity === identity && entry.kind === "collection");
      if (!collection) return;
      if (state.outlineCollectionCollapsed.has(collection.name)) state.outlineCollectionCollapsed.delete(collection.name);
      else state.outlineCollectionCollapsed.add(collection.name);
      host.outlineCollections?.setCollapsed?.([...state.outlineCollectionCollapsed]);
      renderOutline();
      return;
    }
    const addRecord = event.target.closest("[data-outline-add-record]");
    if (addRecord) {
      openCollectionDialog(addRecord, "record", addRecord.dataset.outlineAddRecord);
      return;
    }
    const outlineEntry = event.target.closest("[data-outline-entry]");
    if (outlineEntry) {
      await proseCommitQueue;
      analyzeNow();
      const identity = decodeURIComponent(outlineEntry.dataset.outlineEntry);
      const artifact = authoringEntries().find(entry => entry.identity === identity);
      const citationIdentity = outlineEntry.dataset.outlineCitation === undefined ? "" : decodeURIComponent(outlineEntry.dataset.outlineCitation);
      const location = citationIdentity ? artifact?.citations.find(citation => citation.identity === citationIdentity) : artifact;
      if (!artifact || !location || !openOutlineLocation(location)) {
        const name = artifact?.name ?? identity.split("\0")[1] ?? WIDGET_COPY.thisDeclaration;
        report(WIDGET_COPY.declarationGone(name), true);
        renderedOutlineModel = "";
        renderOutline();
        return;
      }
      state.outlineSelection = artifact.identity;
      selectionBus.select({
        kind: artifact.kind === "name" ? "identifier" : artifact.kind,
        name: artifact.name,
        file: artifact.kind === "collection" && !citationIdentity ? artifact.location.replace(/\/$/, "") : location.file,
        range: location.range
      }, { origin: { surface: "sidebar" } });
      renderOutline();
      return;
    }
    const outlineDisclosure = event.target.closest("[data-outline-disclosure]");
    if (outlineDisclosure) {
      const group = outlineDisclosure.dataset.outlineDisclosure;
      if (state.outlineFallbackOpen.has(group)) state.outlineFallbackOpen.delete(group);
      else state.outlineFallbackOpen.add(group);
      renderOutline();
      return;
    }
    const outlineCreate = event.target.closest("[data-outline-create]");
    if (outlineCreate) {
      if (outlineCreate.dataset.outlineCreate === "Collection") {
        const focus = outlineCreate.dataset.outlineFocus;
        state.outlineMenuOpen = false;
        renderOutline();
        const anchor = [...ui.outline.querySelectorAll("[data-outline-focus]")]
          .find(element => element.dataset.outlineFocus === focus)
          ?? ui.outline.querySelector('[data-action="outline-menu"]');
        openCollectionDialog(anchor);
        return;
      }
      await createFromOutline(outlineCreate.dataset.outlineCreate);
      renderOutline();
      return;
    }
    const panelCreator = event.target.closest("[data-panel-creator]");
    if (panelCreator) {
      const creator = panelHost.creators({ file: state.selected?.type === "file" ? state.selected.path : "" }, { menu: true })
        .find(candidate => candidate.id === panelCreator.dataset.panelCreator);
      if (!creator) return;
      if (creator.requires.includes("name")) {
        state.panelCreatorPrompt = creator.id;
        state.panelCreatorError = "";
        renderedOutlineModel = "";
        renderOutline();
        ui.outline.querySelector("[data-panel-creator-name]")?.focus();
      } else {
        try {
          await panelHost.runCreator(creator.id, { file: state.selected?.type === "file" ? state.selected.path : undefined }, "sidebar");
          state.outlineMenuOpen = false;
          state.panelCreatorError = "";
        } catch (error) { state.panelCreatorError = error.message; }
        renderedOutlineModel = "";
        renderOutline();
        ui.outline.querySelector('[data-action="outline-menu"]')?.focus({ preventScroll: true });
      }
      return;
    }
    const panelCreatorConfirm = event.target.closest("[data-panel-creator-confirm]");
    if (panelCreatorConfirm) {
      const name = ui.outline.querySelector("[data-panel-creator-name]")?.value ?? "";
      try {
        await panelHost.runCreator(panelCreatorConfirm.dataset.panelCreatorConfirm, {
          name,
          file: state.selected?.type === "file" ? state.selected.path : undefined
        }, "sidebar");
        state.panelCreatorPrompt = "";
        state.outlineMenuOpen = false;
        state.panelCreatorError = "";
      } catch (error) { state.panelCreatorError = error.message; }
      renderedOutlineModel = "";
      renderOutline();
      (state.panelCreatorPrompt ? ui.outline.querySelector("[data-panel-creator-name]") : ui.outline.querySelector('[data-action="outline-menu"]'))?.focus({ preventScroll: true });
      return;
    }
    const treeItem = event.target.closest("[data-tree-type]");
    if (treeItem) {
      const type = treeItem.dataset.treeType;
      const path = treeItem.dataset.path;
      state.selected = { type, path };
      if (type === "folder") {
        selectionBus.select({ kind: "folder", file: path }, { origin: { surface: "explorer" } });
        if (state.collapsed.has(path)) state.collapsed.delete(path); else state.collapsed.add(path);
        renderTree();
      } else openFile(path);
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const actionControl = event.target.closest("[data-action]");
    if (actionControl.getAttribute("aria-disabled") === "true") {
      const reason = actionControl.getAttribute("aria-description");
      if (reason) report(reason, true);
      return;
    }
    try {
      if (action === "outline-menu") {
        state.outlineMenuOpen = !state.outlineMenuOpen;
        if (!state.outlineMenuOpen) {
          state.panelCreatorPrompt = "";
          state.panelCreatorError = "";
        }
        renderOutline();
        if (state.outlineMenuOpen) ui.outline.querySelector('[role="menu"] [role="menuitem"]')?.focus();
      } else if (action === "widget-outline") openWidgetDrawer("outline");
      else if (action === "widget-inspector") openWidgetDrawer("inspector");
      else if (action === "new-package") beginPackage();
      else if (action === "export") downloadPackage();
      else if (action === "package-delete" && state.hasDraft) {
        // Pin the package being shown: autosave can refresh the selector while
        // the confirmation is open. The session publishes its pinned target
        // synchronously before this click handler renders the dialog from it.
        await packageSession.deleteDraft({ request: true });
        const reset = state.pendingDelete.reset;
        packageConfirmReturnFocus = document.activeElement;
        ui.packageConfirm.setAttribute("aria-label", reset ? WIDGET_COPY.resetPackageLabel(state.package.title) : WIDGET_COPY.deletePackageLabel(state.package.title));
        ui.packageConfirm.hidden = false;
        ui.packageConfirm.innerHTML = `<p>${reset ? WIDGET_COPY.resetQuestion(escapeHtml(state.pendingDelete.title)) : WIDGET_COPY.deleteQuestion(escapeHtml(state.pendingDelete.title))}</p><div class="opengdd-author-draft-confirm-actions"><button type="button" data-action="package-confirm-yes">${reset ? WIDGET_COPY.yesReset : WIDGET_COPY.yesDelete}</button><button type="button" data-action="package-confirm-no">${WIDGET_COPY.cancel}</button></div>`;
        ui.packageConfirm.querySelector('[data-action="package-confirm-no"]').focus();
      } else if (action === "package-confirm-yes" && state.pendingDelete) {
        const removed = await packageSession.deleteDraft({ confirm: true });
        hidePackageConfirmation();
        report(removed.reset ? WIDGET_COPY.exampleReset : WIDGET_COPY.localPackageDeleted);
        ui.packageSelect.focus();
      } else if (action === "package-confirm-no") {
        await packageSession.deleteDraft({ cancel: true });
        hidePackageConfirmation(true);
      } else if (["new-file", "new-folder", "rename"].includes(action)) beginTreeAction(action);
      else if (action === "delete") await deleteTreeSelection();
      else if (action === "undo" || action === "redo") takeHistory(action);
      else if (action === "cold-new") {
        await packageSession.list({ publish: false });
        if (destroyed) return;
        const available = packageSession.state();
        const id = nextAvailablePackageId("untitled-game", [
          ...available.drafts.map(draft => draft.id),
          ...available.builtins.map(item => item.id)
        ]);
        // The session publishes open synchronously; the click handler depends
        // on that render before locating and selecting the starter sentence.
        packageSession.open(createScaffoldPackage(id, WIDGET_COPY.untitledGameTitle));
        const starter = "You are an explorer charting a pocket world that rearranges itself as you walk.";
        const starterAt = ui.textarea.value.indexOf(starter);
        if (starterAt >= 0) {
          ui.textarea.focus({ preventScroll: true });
          ui.textarea.setSelectionRange(starterAt, starterAt + starter.length);
        }
        await packageSession.save({ immediate: true, markSaved: true });
      } else if (action === "cold-example") {
        await builtinDiscovery;
        if (builtinDiscoveryError) throw new Error(WIDGET_COPY.exampleUnavailable(builtinDiscoveryError.message));
        try { await packageSession.open("tic-tac-toe"); }
        catch (error) { throw new Error(WIDGET_COPY.exampleUnavailable(error.message)); }
      }
      else if (action === "tree-cancel") ui.treeForm.hidden = true;
      else if (action === "package-cancel") ui.packageForm.hidden = true;
    } catch (error) { report(error.message, true); }
  }

  on(rootElement, "click", handleClick);
  for (const element of regionalElements) on(element, "click", handleClick);
  if (widgetDrawer) {
    on(rootElement, "keydown", event => {
      if (event.key !== "Escape" || !widgetDrawer.open) return;
      event.preventDefault();
      event.stopPropagation();
      closeWidgetDrawer(true);
    });
  }
  if (ui.outline) {
    on(ui.outline, "change", event => {
      if (!event.target.matches("[data-outline-filter]")) return;
      state.outlineProblemsOnly = event.target.checked;
      renderOutline();
    });
    on(ui.outline, "keydown", event => {
      const menuItem = event.target.closest('[role="menuitem"]');
      if (menuItem && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...ui.outline.querySelectorAll('[role="menuitem"]')];
        const current = items.indexOf(menuItem);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((item, index) => { item.tabIndex = index === next ? 0 : -1; });
        items[next].focus();
        return;
      }
      if (event.key === "Escape" && state.outlineMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        state.outlineMenuOpen = false;
        renderOutline();
        ui.outline.querySelector('[data-action="outline-menu"]')?.focus();
        return;
      }
      const tree = event.target.closest('[role="tree"]');
      const treeItem = event.target.closest("[data-outline-treeitem]");
      if (!tree || !treeItem || !tree.contains(treeItem)) return;
      const focusTreeItem = identity => {
        const liveTree = ui.outline.querySelector('[role="tree"]');
        const item = liveTree?.querySelector(`[data-outline-treeitem="${outlineData(identity)}"]`);
        for (const candidate of liveTree?.querySelectorAll("[data-outline-treeitem]") ?? []) candidate.tabIndex = candidate === item ? 0 : -1;
        item?.focus({ preventScroll: true });
      };
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...tree.querySelectorAll("[data-outline-treeitem]")];
        const current = items.indexOf(treeItem);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
        focusTreeItem(decodeURIComponent(items[next].dataset.outlineTreeitem));
      } else if (event.key === "ArrowLeft") {
        const identity = decodeURIComponent(treeItem.dataset.outlineTreeitem);
        const collection = authoringEntries().find(entry => entry.identity === identity && entry.kind === "collection");
        if (collection && !state.outlineCollectionCollapsed.has(collection.name)) {
          event.preventDefault();
          state.outlineCollectionCollapsed.add(collection.name);
          host.outlineCollections?.setCollapsed?.([...state.outlineCollectionCollapsed]);
          renderOutline();
          focusTreeItem(identity);
        } else if (treeItem.dataset.outlineParent) {
          event.preventDefault();
          focusTreeItem(decodeURIComponent(treeItem.dataset.outlineParent));
        }
      } else if (event.key === "ArrowRight") {
        const identity = decodeURIComponent(treeItem.dataset.outlineTreeitem);
        const collection = authoringEntries().find(entry => entry.identity === identity && entry.kind === "collection");
        if (!collection) return;
        if (state.outlineCollectionCollapsed.has(collection.name)) {
          event.preventDefault();
          state.outlineCollectionCollapsed.delete(collection.name);
          host.outlineCollections?.setCollapsed?.([...state.outlineCollectionCollapsed]);
          renderOutline();
          focusTreeItem(identity);
        } else {
          const child = ui.outline.querySelector(`[data-outline-treeitem][data-outline-parent="${outlineData(identity)}"]`);
          if (child) {
            event.preventDefault();
            focusTreeItem(decodeURIComponent(child.dataset.outlineTreeitem));
          }
        }
      }
    });
  }

  if (capabilities.hostUndo && workbenchScope) {
    on(workbenchScope, "keydown", event => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || event.altKey || (key !== "z" && key !== "y")) return;
      if (event.target.closest('[data-role="package-form"], [data-role="tree-form"]')) return;
      event.preventDefault();
      takeHistory(key === "y" || event.shiftKey ? "redo" : "undo");
    });
  }

  on(ui.packageConfirm, "keydown", event => {
    if (event.key === "Escape" && state.pendingDelete) {
      event.preventDefault();
      packageSession.deleteDraft({ cancel: true });
      hidePackageConfirmation(true);
    }
  });

  on(ui.packageSelect, "change", async () => {
    // Captured before anything runs: cancelling a pending delete publishes,
    // and that render re-syncs the select to the still-open package.
    const selected = ui.packageSelect.value;
    packageSession.deleteDraft({ cancel: true });
    hidePackageConfirmation();
    // The change handler awaits the session open; its synchronous package
    // delivery completes the composition-side render before this handler can
    // report an error or restore selector controls.
    try { await packageSession.open(selected); }
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
      report(WIDGET_COPY.enterPackageIdentity, true);
      return;
    }
    // Drafts are keyed by package id and this browser is the only copy, so a
    // reused id would silently overwrite someone's work. Refuse instead.
    const drafts = await packageSession.list({ publish: false })
      .then(() => packageSession.state().drafts).catch(() => []);
    if (drafts.some(draft => draft.id === id) || state.builtins.some(item => item.id === id)) {
      report(WIDGET_COPY.duplicatePackageId(id), true);
      ui.packageId.focus();
      ui.packageId.select();
      return;
    }
    if (destroyed) return;
    // The session open delivery is synchronous, so the submit handler can hide
    // the form and persist only after the new controller and package are live.
    packageSession.open(createScaffoldPackage(id, title));
    ui.packageForm.hidden = true;
    try {
      await packageSession.save({ immediate: true });
      report(WIDGET_COPY.createdPackage(title));
    } catch (error) {
      report(WIDGET_COPY.packageSaveFailure(error.message), true);
    }
  });
  on(ui.treeForm, "submit", async event => {
    event.preventDefault();
    try { await submitTreeAction(); } catch (error) { report(error.message, true); }
  });
  on(ui.textarea, "beforeinput", event => {
    if (capabilities.hostUndo && (event.inputType === "historyUndo" || event.inputType === "historyRedo")) {
      if (event.cancelable) {
        event.preventDefault();
        takeHistory(event.inputType === "historyUndo" ? "undo" : "redo");
      }
      return;
    }
    editorBeforeInput = { path: state.openPath, start: ui.textarea.selectionStart ?? 0, end: ui.textarea.selectionEnd ?? 0 };
  });
  on(ui.textarea, "compositionstart", () => {
    composingProse = true;
  });
  on(ui.textarea, "compositionend", () => {
    composingProse = false;
    editorBeforeInput = null;
    editorSurface.invalidateInput();
    queueProseEdit(state.openPath, ui.textarea.value);
  });
  on(ui.textarea, "input", event => {
    const previous = state.package.files.get(state.openPath);
    if (capabilities.hostUndo && (event.inputType === "historyUndo" || event.inputType === "historyRedo")) {
      editorBeforeInput = null;
      if (typeof previous === "string") ui.textarea.value = previous;
      editorSurface.invalidateInput();
      editorSurface.inputChanged(previous, null, false);
      takeHistory(event.inputType === "historyUndo" ? "undo" : "redo");
      return;
    }
    const selection = editorBeforeInput?.path === state.openPath ? editorBeforeInput : null;
    editorBeforeInput = null;
    editorSurface.inputChanged(previous, selection, !composingProse && !event.isComposing);
    if (!composingProse && !event.isComposing) queueProseEdit(state.openPath, ui.textarea.value);
  });
  on(ui.zip, "change", () => handleZipImport(ui.zip.files[0]));
  on(ui.tree, "dragstart", event => {
    const item = event.target.closest("[data-tree-type]");
    if (!item) return;
    if (capabilities.protectedFiles && item.dataset.treeType === "file" && PROTECTED_PACKAGE_FILES.has(item.dataset.path)) {
      event.preventDefault();
      state.dragged = null;
      return;
    }
    state.dragged = { type: item.dataset.treeType, path: item.dataset.path };
  });
  on(ui.tree, "dragover", event => event.preventDefault());
  if (capabilities.delete) {
    on(ui.tree, "keydown", event => {
      if (event.key !== "Delete") return;
      event.preventDefault();
      if (ui.delete?.getAttribute("aria-disabled") === "true") {
        const reason = ui.delete.getAttribute("aria-description");
        if (reason) report(reason, true);
        return;
      }
      deleteTreeSelection().catch(error => report(error.message, true));
    });
  }
  on(ui.tree, "drop", async event => {
    event.preventDefault();
    const zip = [...(event.dataTransfer?.files ?? [])].find(file => /\.zip$/i.test(file.name));
    if (zip) { handleZipImport(zip); return; }
    if (!state.dragged) return;
    const folder = event.target.closest('[data-tree-type="folder"]')?.dataset.path ?? "";
    const destination = folder ? `${folder}/${basename(state.dragged.path)}` : basename(state.dragged.path);
    try { await movePath(state.dragged.type, state.dragged.path, destination); }
    catch (error) { report(error.message, true); }
    state.dragged = null;
  });

  renderAll();
  (async () => {
    const revision = state.revision;
    if (capabilities.coldStart) {
      const draftDiscovery = packageSession.list();
      builtinDiscovery = packageSession.discoverBuiltins().catch(error => {
        builtinDiscoveryError = error;
        return [];
      });
      try {
        await draftDiscovery;
        if (destroyed || revision !== state.revision) return;
        renderPackageOptions(state.drafts[0]?.id ?? "");
      } catch (error) {
        if (!destroyed) report(WIDGET_COPY.browserPackagesUnavailable(error.message), true);
        return;
      }
      if (state.drafts.length) {
        try { await packageSession.open(state.drafts[0].id); }
        catch (error) { report(WIDGET_COPY.selectedPackageOpenFailure(error.message), true); }
        return;
      }
      packageSession.open({ id: "", title: WIDGET_COPY.noPackageSelected, files: [] });
      state.coldStart = true;
      ui.coldStart.hidden = false;
      ui.editorPanel.hidden = true;
      renderStatus();
      report(WORKBENCH_COPY.chooseHowToBegin);
      return;
    }
    if (typeof host.listPackages === "function") {
      try { await packageSession.discoverBuiltins(); }
      catch (error) { report(WIDGET_COPY.exampleUnavailable(error.message), true); }
    }
    let selected = "";
    try { selected = await packageSession.list({ preferredId: host.defaultPackageId ?? state.builtins[0]?.id }); }
    catch (error) { report(WIDGET_COPY.browserPackagesUnavailable(error.message), true); }
    if (destroyed || revision !== state.revision) return;
    if (selected) {
      try { await packageSession.open(selected); }
      catch (error) { report(WIDGET_COPY.selectedPackageOpenFailure(error.message), true); }
    } else {
      packageSession.open({ id: "", title: WIDGET_COPY.noPackageSelected, files: [] });
      report(WIDGET_COPY.createOrImport);
    }
  })();

  return {
    openPackage: packageSession.open,
    testHooks: Object.freeze({
      analysisView() { return state.authoringView; },
      editorRevision(path = state.openPath) { return editController.revision(path); },
      panelDescriptors() { return panelHost.descriptors(); },
      selection() { return selectionBus.current(); }
    }),
    editorState() {
      if (destroyed || ui.textarea.hidden) return null;
      return {
        selection: {
          start: ui.textarea.selectionStart ?? 0,
          end: ui.textarea.selectionEnd ?? 0,
          direction: ui.textarea.selectionDirection
        },
        scroll: { top: ui.textarea.scrollTop, left: ui.textarea.scrollLeft }
      };
    },
    restoreEditorState(snapshot) {
      if (destroyed || ui.textarea.hidden || !snapshot?.selection || !snapshot?.scroll) return false;
      const start = Number.isFinite(snapshot.selection.start) ? snapshot.selection.start : 0;
      const end = Number.isFinite(snapshot.selection.end) ? snapshot.selection.end : start;
      const direction = ["forward", "backward", "none"].includes(snapshot.selection.direction)
        ? snapshot.selection.direction
        : "none";
      ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(
        Math.min(Math.max(0, start), ui.textarea.value.length),
        Math.min(Math.max(0, end), ui.textarea.value.length),
        direction
      );
      ui.textarea.scrollTop = Number.isFinite(snapshot.scroll.top) ? snapshot.scroll.top : 0;
      ui.textarea.scrollLeft = Number.isFinite(snapshot.scroll.left) ? snapshot.scroll.left : 0;
      editorSurface.scrollChanged();
      return true;
    },
    focusEditor() {
      if (destroyed || ui.textarea.hidden) return false;
      ui.textarea.focus({ preventScroll: true });
      return true;
    },
    outlineProblemsOnly(value) {
      if (arguments.length === 0) return state.outlineProblemsOnly;
      state.outlineProblemsOnly = Boolean(value);
      renderOutline();
      return state.outlineProblemsOnly;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      panelHost.destroy();
      panelPackageCancel();
      packageSession.close();
      analysisSession.destroy();
      editorSurface.destroy();
      view.cancelAnimationFrame(outlineFrame);
      listeners.abort();
      for (const child of ownedChildren.get(rootElement) ?? []) {
        if (child.parentNode === rootElement) child.remove();
      }
      rootElement.classList.remove("opengdd-authoring");
      for (const element of regionalElements) {
        if (REGION_OWNERS.get(element) !== regionOwner) continue;
        for (const child of ownedChildren.get(element) ?? []) {
          if (child.parentNode === element) child.remove();
        }
        REGION_OWNERS.delete(element);
        element.classList.remove("opengdd-authoring", "opengdd-author-region");
      }
    }
  };
}
