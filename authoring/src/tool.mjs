import { resolveAnchor } from "opengdd-analysis";
import { createFileMapHost } from "opengdd-file-map-host";
import { validatePackage } from "opengdd-validation";
import { createAnalysisSession } from "./analysis-session.mjs";
import {
  BUILT_IN_CREATION_KINDS, chapterCreation, classifyCreation, collectionNameTaken, collectionRecordNameTaken,
  collectionRecordText, kebabName, linkOffers, measuredPromiseCreation, nextChapterNumber, parseJsonScalar, questionCreation,
  rankCollectionCreationActions
} from "./creation.mjs";
import { createEditorSurface } from "./editor-surface.mjs";
import { minimalTextChange } from "./edits.mjs";
import { clampedPositionToOffset, lineBounds, offsetToPosition } from "./text-coordinates.mjs";
import { createScaffoldPackage, nextAvailablePackageId, packageIdFromTitle } from "./package.mjs";
import { createPackageSession } from "./package-session.mjs";
import { createPanelHost } from "./panel-host.mjs";
import { createForms } from "./forms.mjs";
import { createReferences } from "./references.mjs";
import { openRenameDialog } from "./rename-dialog.mjs";
import {
  classifyContractText, collectContractSources, contractPackFilename, contractSourceName,
  findContractUpdateTargets, findPackageDefinition, prepareContractAddition, prepareContractUpdate
} from "./contracts.mjs";
import { createSelectionBus } from "./selection.mjs";
import { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";
import { CONFORMANCE_SCHEMA_NAMES } from "./loaders.mjs";
import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { COLLECTION_COPY } from "./copy/collection-copy.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { isContractDependentFinding } from "./contracts.mjs";
import { RECORD_FORM_COPY } from "./copy/record-form-copy.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { WORKBENCH_COPY } from "./copy/workbench-copy.mjs";
import { createOutlineRenderer } from "./outline-render.mjs";
import { buildOutlineModel } from "./outline-view.mjs";
import { withExplicitFolders } from "./folder-aware-host.mjs";
import { readZip } from "./zip.mjs";
import { mountPreparedContracts } from "./prepared-contract-editor.mjs";
import { matchesPreparedAdoption } from "./prepared-contract.mjs";
import { kindDefinition } from "./kinds.mjs";
import { anchoredConfirmation } from "./dom.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { findingAccessibleName, findingLocation } from "./findings.mjs";

export { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";

const SCHEMA_NAMES = CONFORMANCE_SCHEMA_NAMES;
const MAX_WRAPPED_TEXT_CHARS = 200_000;
const REGION_OWNERS = new WeakMap();
const CAPABILITY_NAMES = Object.freeze([
  "protectedFiles", "workbenchLabels", "hostUndo", "delete", "coldStart"
]);
const PROTECTED_PACKAGE_FILES = new Set([
  "manifest.json", "tuning.json", "01-overview.md", "02-mechanics.md",
  "03-content.md", "04-presentation.md", "05-build-plan.md",
  "direction.json", "personalization.json", "clocks.json"
]);
const OPTIONAL_MECHANISM_FILES = new Set(Object.keys(WIDGET_COPY.protectedDeleteConfirm));

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const inlineCodeHtml = (value = "") => String(value).split("`")
  .map((part, index) => index % 2 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part))
  .join("");

const parentPath = path => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const basename = path => path.slice(path.lastIndexOf("/") + 1);
function normalizePath(value) {
  const path = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  if (!path || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) {
    throw new Error(WIDGET_COPY.packageRelativePath);
  }
  return path;
}

const syntaxFinding = finding => /(?:^|_)JSON$/.test(finding.code);

export function mountAuthoringTool(rootElement, host = {}) {
  const document = rootElement?.ownerDocument;
  const view = document?.defaultView;
  if (!view || !(rootElement instanceof view.Element)) throw new TypeError("mountAuthoringTool requires a root element.");
  const headingLevel = Number.isInteger(host.headingLevel) && host.headingLevel >= 1 && host.headingLevel <= 6
    ? host.headingLevel
    : 1;
  const headingTag = `h${headingLevel}`;
  // A host supplies its available catalogue; local maintained material is not
  // implicitly exposed by the published authoring embed.
  const contractsCatalogueUrl = typeof host.contractsCatalogueUrl === "string" && host.contractsCatalogueUrl
    ? host.contractsCatalogueUrl : "";
  // Preserve earlier hosts while maintained hosts use the supported name.
  // Recipes remain trusted host configuration, not package data.
  const preparedStartingPoints = host.preparedStartingPoints ?? host.experimentalStartingPoints;
  if (preparedStartingPoints !== undefined && !Array.isArray(preparedStartingPoints)) {
    throw new TypeError("host.preparedStartingPoints must be an array when supplied.");
  }
  const listeners = new view.AbortController();
  const on = (element, type, listener, options = {}) => element.addEventListener(type, listener, { ...options, signal: listeners.signal });
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
    if (regions.validation !== undefined && !(regions.validation instanceof view.Element)) {
      throw new TypeError("host.regions.validation must be an Element when supplied.");
    }
    if (regions.validation) namedRegions.push(["validation", regions.validation]);
    if (regions.undo !== undefined && !(regions.undo instanceof view.Element)) {
      throw new TypeError("host.regions.undo must be an Element when supplied.");
    }
    if (regions.undo) namedRegions.push(["undo", regions.undo]);
    for (const name of ["proseHeader", "outlineHeader"]) {
      if (regions[name] !== undefined && !(regions[name] instanceof view.Element)) {
        throw new TypeError(`host.regions.${name} must be an Element when supplied.`);
      }
      if (regions[name]) namedRegions.push([name, regions[name]]);
    }
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
          <button type="button" data-action="rename">${WIDGET_COPY.explorerActions.rename}</button>
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
        <p class="opengdd-author-file-notice" data-role="file-notice" hidden></p>
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
        <section class="opengdd-author-panel-inspector" data-role="panel-inspector"></section>
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
  const fileHeading = editorPanel.querySelector(".opengdd-author-file-heading");
  const inspector = workspace.querySelector(".opengdd-author-inspector");
  const diagnosticsPanel = inspector.querySelector(".opengdd-author-diagnostics");
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
  const regionalElements = regions ? [regions.explorer, regions.prose, regions.outline, regions.context, regions.inspector, regions.validation, regions.status, regions.undo, regions.proseHeader, regions.outlineHeader].filter(Boolean) : [];
  let outlineControls = null;
  if (regions) {
    regions.explorer.replaceChildren(treePanel);
    if (regions.proseHeader) regions.proseHeader.replaceChildren(fileHeading);
    if (regions.outlineHeader) {
      outlineControls = document.createElement("div");
      outlineControls.className = "opengdd-author-outline-controls opengdd-author-outline-controls--header";
      regions.outlineHeader.replaceChildren(outlineControls);
    }
    diagnosticsPanel.classList.add("opengdd-author-diagnostics--regional");
    const panelInspector = inspector.firstElementChild;
    if (regions.inspector) regions.inspector.replaceChildren(panelInspector);
    else if (regions.context) regions.context.replaceChildren(panelInspector);
    if (regions.validation) {
      regions.validation.replaceChildren(diagnosticsPanel);
      regions.prose.replaceChildren(editorPanel, ...(regions.inspector || regions.context ? [] : [inspector]));
    } else {
      regions.prose.replaceChildren(editorPanel, inspector);
    }
    if (regions.outline) regions.outline.innerHTML = `<nav class="opengdd-author-outline" aria-label="${WIDGET_COPY.outlineLabel}"></nav>`;
    regions.status.replaceChildren(status);
    if (regions.undo && capabilities.hostUndo) {
      regions.undo.innerHTML = `<div class="opengdd-author-history" aria-label="${WORKBENCH_COPY.undoHistory}">
        <button type="button" data-action="undo" title="${WORKBENCH_COPY.undoHelp}" disabled>${WORKBENCH_COPY.nothingToUndo}</button>
      </div>`;
    }
    workspace.remove();
    for (const element of regionalElements) element.classList.add("opengdd-authoring", "opengdd-author-region");
  }
  if (!regions && capabilities.hostUndo) {
    const history = document.createElement("div");
    history.className = "opengdd-author-history";
    history.setAttribute("aria-label", WORKBENCH_COPY.undoHistory);
    history.innerHTML = `<button type="button" data-action="undo" title="${WORKBENCH_COPY.undoHelp}" disabled>${WORKBENCH_COPY.nothingToUndo}</button>`;
    rootElement.querySelector(".opengdd-author-loaders").append(history);
  }
  // A host with a dedicated inspector can use `context` for companion panels
  // beneath the explorer. Compatibility hosts that still place the inspector
  // in `context`, and the ordinary widget, keep those panels inside the file
  // explorer itself.
  const panelSidebar = regions?.inspector && regions.context ? regions.context : treePanel;
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
    treeInput: find("tree-input"), path: find("path"), reader: find("reader"), mode: find("mode"), fileNotice: find("file-notice"), editor: find("editor"),
    highlight: find("highlight"), textarea: find("textarea"), json: find("json"), empty: find("empty"),
    mirror: find("mirror"), completions: find("completions"), quickfix: find("quickfix"), panelInspector: find("panel-inspector"), status: find("status"), zip: find("zip"),
    diagnostics: find("diagnostics"), diagnosticSummary: find("diagnostic-summary"), collectionDialog: null,
    outline: (regions?.outline ?? internalOutlineRegion)?.querySelector(".opengdd-author-outline") ?? null,
    outlineControls,
    rename: findAction("rename"), delete: findAction("delete"), undo: findAction("undo"),
    editorPanel, fileHeading, migrationPanel: null, migrationBody: null,
    coldStart: null
  };
  if (capabilities.coldStart) {
    ui.coldStart = document.createElement("div");
    ui.coldStart.className = "opengdd-workbench-cold-start";
    ui.coldStart.hidden = true;
    ui.coldStart.innerHTML = `<button type="button" data-action="cold-new">${WORKBENCH_COPY.coldNew}</button>
      <button type="button" data-action="cold-package" disabled>${WORKBENCH_COPY.coldPackage()}</button>`;
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
    outlineFolds: new Set((host.outlineFolds ?? host.outlineCollections)?.collapsed?.() ?? []),
    outlineInspectorReturn: "",
    outlineAnnouncement: "",
    migration: { status: "idle", report: null, changes: [], hiddenNoOp: false, manualAfter: null, notice: null }
  };
  let editController;
  let editSaveAnnouncements = [];
  let editorSurface;
  let editorBeforeInput = null;
  let composingProse = false;
  let proseCommitQueue = Promise.resolve();
  let historyQueue = Promise.resolve();
  let redoLabels = [];
  let outlineView;
  const renderOutline = () => outlineView?.render();
  const scheduleOutlineRender = () => outlineView?.schedule();
  let collectionDialog = null;
  const selectionBus = createSelectionBus();
  const packageListeners = new Set();
  const validationListeners = new Set();
  const panelAdvice = new Map();
  const pendingContractDuplicateChecks = new Set();
  const pendingContractUpdateNotices = new Map();
  const pendingInspectorFocus = new Map();
  let contractDuplicateWarnings = [];
  let validationRevision = 0;
  let renderedDiagnostics = "";
  let noticePriority = 0;
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

  function report(message, error = false, { priority = "normal" } = {}) {
    if (destroyed) return;
    // A persistent notice outlasts routine messages, never an error.
    const nextPriority = priority === "persistent" ? 1 : 0;
    if (nextPriority < noticePriority && !error) return;
    noticePriority = nextPriority;
    ui.notice.textContent = message;
    ui.notice.classList.toggle("opengdd-author-is-error", error);
  }

  function dismissPersistentNotice() {
    if (!noticePriority) return;
    noticePriority = 0;
    ui.notice.textContent = "";
    ui.notice.classList.remove("opengdd-author-is-error");
  }

  let packageConfirmReturnFocus = null;
  let protectedDeletePath = "";
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
  // Input commits enter the shared edit layer before the browser can process a
  // later reload. Flush its pending draft as soon as the page is leaving or is
  // hidden, instead of depending only on the ordinary autosave delay.
  on(view, "pagehide", () => packageSession.flush());
  on(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") packageSession.flush();
  });
  Object.assign(state, packageSession.state());
  editController = state.editController;

  const packageService = {};
  Object.defineProperties(packageService, {
    id: { enumerable: true, get: () => state.package.id },
    title: { enumerable: true, get: () => state.package.title },
    packageRevision: { enumerable: true, get: () => `${state.revision}:${editController.revision()}` }
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
    contribute(findings, panelId, panelTitle = panelId) {
      if (!Array.isArray(findings) || findings.some(finding => !finding || !["warning", "info"].includes(finding.severity))) {
        throw new Error("Panel advice must be an array of warning or info findings.");
      }
      panelAdvice.set(panelId, findings.map(finding => ({
        ...finding, severity: "warning", panel: panelId, panelTitle
      })));
      validationRevision += 1;
      const current = this.current();
      queueMicrotask(() => { for (const listener of [...validationListeners]) listener(current); });
      renderDiagnostics();
      renderStatus();
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
  const formsService = createForms({
    package: packageService,
    edits: panelEdits,
    validatePackage: validateStagedTransaction,
    copy: RECORD_FORM_COPY
  });
  const referencesService = createReferences({
    package: packageService,
    analysis: {
      current: () => state.authoringView,
      refresh: () => analyzeNow()
    },
    edits: panelEdits,
    validatePackage: validateStagedTransaction
  });
  const recordPanelInternal = Object.freeze({
    validatePackage: validateStagedTransaction,
    openCollectionRecord({ anchor, collection, prefill = "", sourceFile, undo, selectCreated = true } = {}) {
      return openCollectionDialog(anchor, "record", collection, {
        awaitResult: true, prefill, sourceFile, undo, selectCreated
      });
    }
  });
  // Collection paste creates several record files in one undo. That is a
  // host-owned operation, so the internal panel gets the validated edit door
  // without widening the public panel service's reserved-root boundary.
  const collectionPanelInternal = Object.freeze({
    validatePackage: validateStagedTransaction,
    edits: Object.freeze({ begin: (...args) => panelEdits.begin(...args) }),
    begin: (...args) => panelEdits.begin(...args),
    view: () => state.authoringView,
    openLocation: location => openOutlineLocation(location),
    revealLocation: location => revealLocation(location),
    acceptLinkOffer,
    openCollectionRecord({ anchor, collection, prefill = "", sourceFile, undo, selectCreated = true } = {}) {
      return openCollectionDialog(anchor, "record", collection, {
        awaitResult: true, prefill, sourceFile, undo, selectCreated
      });
    }
  });
  // The contract worksheet needs the validator's rendered-test field and the
  // introduced-finding set. Both stay on its named host-private channel: the
  // public validation and edit services keep their revision-1 shape.
  const contractPanelInternal = Object.freeze({
    openStartingPoint(file) {
      const adoption = JSON.parse(state.package.files.get(file));
      const recipe = preparedStartingPoints?.find(item => matchesPreparedAdoption(adoption, state.package.files, item));
      if (!recipe) return false;
      preparedEditor.open(recipe, file);
      return true;
    },
    hasStartingPoint(adoption) {
      return preparedStartingPoints?.some(item => matchesPreparedAdoption(adoption, state.package.files, item)) ?? false;
    },
    begin: (...args) => panelEdits.begin(...args),
    revision: file => editController.revision(file),
    stage: transaction => stagedValidation(transaction),
    run: () => state.validation.run,
    view: () => state.authoringView,
    openLocation: location => openOutlineLocation(location),
    revealLocation: location => revealLocation(location),
    subscribe: listener => validationService.subscribe(listener),
    rename: (anchor, file) => openContractRenameFromPanel(anchor, file),
    consumeDuplicateCheck(file) {
      if (!pendingContractDuplicateChecks.has(file)) return false;
      pendingContractDuplicateChecks.delete(file);
      return true;
    },
    takeUpdateNotice(file) {
      const notice = pendingContractUpdateNotices.get(file);
      pendingContractUpdateNotices.delete(file);
      return notice;
    },
    showTuningValue(key, contractFile) {
      const selected = authoringEntries().find(entry => entry.kind === "value" && entry.name === key && entry.file === "tuning.json");
      if (!selected || !openOutlineLocation(selected)) return false;
      state.outlineSelection = selected.identity;
      const adoption = /^contracts\/([^/]+)\.json$/u.exec(contractFile)?.[1];
      selectionBus.select({ kind: "contract", name: `contracts.${adoption}`, file: contractFile }, { origin: { surface: "panel" } });
      outlineView.invalidate();
      renderOutline();
      return true;
    },
    setDuplicateWarnings(warnings) {
      contractDuplicateWarnings = Array.isArray(warnings) ? warnings.map(warning => ({ ...warning })) : [];
      if (state.authoringView) state.authoringView.sameNumberWarnings = contractDuplicateWarnings.map(warning => ({ ...warning }));
      outlineView?.invalidate();
      scheduleOutlineRender();
    }
  });
  const panelSelectionService = Object.freeze({
    current: selectionBus.current,
    subscribe: selectionBus.subscribe,
    select(next, options) { dismissPersistentNotice(); return selectionBus.select(next, options); },
    clear(origin) { dismissPersistentNotice(); return selectionBus.clear(origin); }
  });
  const panelServices = Object.freeze({
    selection: panelSelectionService,
    edits: panelEdits,
    validation: validationService,
    references: referencesService,
    forms: formsService,
    grid: undefined,
    assets: undefined
  });
  const inContextPanelInternal = Object.freeze({
    mechanism(id) {
      return state.authoringView?.mechanisms?.find(mechanism => mechanism.id === id);
    },
    entry() {
      const selection = selectionBus.current();
      return authoringEntries().find(entry => entry.kind === selection?.kind && entry.name === selection?.name
        && (entry.file === selection?.file || entry.location?.replace(/\/$/, "") === selection?.file));
    },
    mechanismDeclarations(id) {
      const entries = authoringEntries();
      const selected = id === "tuning"
        ? entries.filter(entry => entry.kind === "value" && !entry.rangeTag)
        : entries.filter(entry => entry.mechanism === id && kindDefinition(entry.kind).mechanismOwned);
      return selected.map(entry => ({ entry }));
    },
    openLocation: location => openOutlineLocation(location),
    revealLocation: location => revealLocation(location),
    openFile: file => state.package.files.has(file) ? (openFile(file), true) : false,
    create: (item, anchor) => createFromOutline(item, anchor)
  });
  const mechanismPanelInternal = Object.freeze({
    begin: (...args) => panelEdits.begin(...args),
    validatePackage: validateStagedTransaction,
    renameEntity({ anchor, address, initial, onApplied, onCancel }) {
      return openRenameDialog({ document, anchor, references: referencesService,
        name: address, initial, onApplied, onCancel });
    },
    mechanism: inContextPanelInternal.mechanism,
    mechanismDeclarations: inContextPanelInternal.mechanismDeclarations,
    entry: inContextPanelInternal.entry,
    view: () => state.authoringView,
    openLocation: location => openOutlineLocation(location),
    revealLocation: location => revealLocation(location),
    create: (item, anchor, name) => createFromOutline(item, anchor, name),
    takeFocusField(file) {
      const pending = pendingInspectorFocus.get(file);
      pendingInspectorFocus.delete(file);
      return pending;
    },
    focusField(file, target) {
      pendingInspectorFocus.set(file, target);
      return panelHost?.refreshSelected() ?? false;
    }
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
      if (direction === "undo" && label === WIDGET_COPY.migrationUndo) state.migration.manualAfter = null;
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
  async function suppliedSchemas() {
    const schemas = await (typeof host.schemas === "function" ? host.schemas() : host.schemas);
    const missing = SCHEMA_NAMES.filter(name => !(schemas instanceof Map ? schemas.get(name) : schemas?.[name]));
    if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
    return schemas;
  }

  const analysisSession = createAnalysisSession({
    Worker: view.Worker,
    revisionFor: path => editController.revision(path),
    folders: () => state.package?.folders ?? [],
    analysisDelay: () => ui.textarea.value.length > MAX_WRAPPED_TEXT_CHARS ? 300 : 150,
    schemas: suppliedSchemas
  });

  const findingIdentity = finding => JSON.stringify([
    finding.severity, finding.code, finding.file, finding.line, finding.message
  ]);
  async function stagedValidation(transaction) {
    let schemas;
    try { schemas = await suppliedSchemas(); }
    catch { throw new Error(WIDGET_COPY.stagedWriteUnavailable); }
    const run = packageValue => validatePackage(withExplicitFolders(
      createFileMapHost(packageValue.files, { schemas, bytes: false }), packageValue.folders
    ), "/package");
    const beforeRun = run(state.package);
    const staged = await transaction.preview();
    const remaining = new Map();
    for (const finding of beforeRun.findings.filter(candidate => candidate.severity === "error")) {
      const identity = findingIdentity(finding);
      remaining.set(identity, (remaining.get(identity) ?? 0) + 1);
    }
    const stagedRun = run(staged);
    const introduced = stagedRun.findings.filter(finding => {
      if (finding.severity !== "error") return false;
      const identity = findingIdentity(finding);
      const count = remaining.get(identity) ?? 0;
      if (!count) return true;
      remaining.set(identity, count - 1);
      return false;
    });
    return { run: stagedRun, introduced, staged };
  }

  async function validateStagedTransaction(transaction, { collectIntroduced = false } = {}) {
    const staged = await stagedValidation(transaction);
    if (collectIntroduced) return staged;
    if (staged.introduced[0]) throw new Error(staged.introduced[0].message);
    return staged.run;
  }

  async function measureContractAddition(addition) {
    const packageRevision = editController.revision();
    const transaction = editController.begin(CONTRACT_COPY.undo.add);
    transaction.file(addition.path).create(addition.adoptionText);
    if (addition.pack?.create) transaction.file(addition.pack.path).create(addition.pack.value);
    try {
      const { introduced } = await stagedValidation(transaction);
      const codes = introduced.map(finding => finding.code);
      // The validator's marker is the same signal the outline folds under the badge.
      const consequences = introduced.filter(isContractDependentFinding).length;
      return { consequences, codes, packageRevision };
    } finally {
      transaction.abort();
    }
  }

  function stageContractUpdate(transaction, update) {
    const current = state.package.files.get(update.path);
    transaction.text(update.path).replace({
      start: { line: 0, character: 0 }, end: offsetToPosition(current, current.length),
      revision: editController.revision(update.path)
    }, update.text);
    if (update.pack?.create) transaction.file(update.pack.path).create(update.pack.value);
  }

  async function measureContractUpdate(update) {
    const transaction = editController.begin(CONTRACT_COPY.undo.update);
    stageContractUpdate(transaction, update);
    try {
      const { introduced, staged } = await stagedValidation(transaction);
      const accounted = new Set();
      const forAdoption = finding => finding.file === update.path;
      const answerFindings = introduced.filter(finding => forAdoption(finding)
        && finding.code === "CONTRACT_ANSWER_MISSING");
      const namesFinding = (finding, names) => names.some(name => finding.message?.includes(JSON.stringify(name)));
      const freshFindings = answerFindings.filter(finding => namesFinding(finding, update.freshAnswers));
      const addedFindings = answerFindings.filter(finding => namesFinding(finding, update.addedQuestions));
      for (const finding of [...freshFindings, ...addedFindings]) accounted.add(finding);
      const rangeFindings = introduced.filter(finding => forAdoption(finding) && finding.code === "CONTRACT_VALUE_RANGE");
      for (const finding of rangeFindings) accounted.add(finding);
      const inputFindings = introduced.filter(finding => forAdoption(finding) && finding.code === "CONTRACT_REFERENCE"
        && /#\/verification\/[^ ]+ is missing required input /u.test(finding.message ?? ""));
      for (const finding of inputFindings) accounted.add(finding);
      const orphanFindings = introduced.filter(finding => finding.code === "CONTRACT_PACK_ORPHAN");
      for (const finding of orphanFindings) accounted.add(finding);
      const before = classifyContractText(state.package.files.get(update.path));
      const after = classifyContractText(staged.files.get(update.path));
      const beforePack = before.kind === "adoption"
        ? staged.files.has(`contracts/${contractPackFilename(before.value)}`) : false;
      const afterPack = after.kind === "adoption"
        ? staged.files.has(`contracts/${contractPackFilename(after.value)}`) : false;
      const promised = beforePack && !afterPack;
      const otherFindings = introduced.filter(finding => !accounted.has(finding)).length;
      const outOfRange = rangeFindings.length;
      return {
        outOfRange, addedToAnswer: addedFindings.length,
        validatorFindings: introduced.length,
        codes: introduced.map(finding => finding.code),
        line: CONTRACT_COPY.updateLine(update.counts.kept, update.counts.dropped, addedFindings.length, outOfRange, {
          droppedInputs: update.counts.droppedVerification,
          testInputs: inputFindings.length,
          orphanedPacks: orphanFindings.length,
          promised,
          otherFindings
        }),
        targetRevision: editController.revision(update.path)
      };
    } finally { transaction.abort(); }
  }
  analysisSession.subscribe(delivery => {
    if (delivery.type === "worker") {
      workerActive = delivery.active;
      if (!workerActive) report(WIDGET_COPY.checkingOnPageFallback);
      renderStatus();
      return;
    }
    if (delivery.type === "view") {
      if (!delivery.view) return;
      state.authoringView = delivery.view;
      editorSurface.analysisChanged();
      scheduleOutlineRender();
      renderDiagnostics();
      renderStatus();
      if (delivery.complete) editorSurface.offerCompletions();
      return;
    }
    if (delivery.type === "validation") {
      const pending = delivery.validation.status === "pending";
      state.validation = pending && state.validation.run
        ? { ...delivery.validation, run: state.validation.run }
        : delivery.validation;
      validationRevision += 1;
      const current = validationService.current();
      queueMicrotask(() => {
        for (const listener of [...validationListeners]) listener(current);
      });
      renderDiagnostics();
      if (!pending) scheduleOutlineRender();
      renderStatus();
    }
  });

  // Structural changes need a view synchronously for the render that follows.
  function analyzeNow() {
    state.authoringView = analysisSession.fileChanged({ immediate: true, publish: false });
    if (state.authoringView) state.authoringView.sameNumberWarnings = contractDuplicateWarnings.map(warning => ({ ...warning }));
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
        const operationValue = action.needsValue
          ? (action.parseValue ? action.parseValue(value) : parseJsonScalar(value))
          : undefined;
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
      if (action.selected) {
        analyzeNow();
        validationChanged();
        renderAll();
        const selected = authoringEntries().find(candidate => candidate.kind === action.selected.kind
          && candidate.name === action.selected.name && candidate.file === action.selected.file);
        if (selected) {
          state.outlineSelection = selected.identity;
          selectionBus.select({ kind: selected.kind, name: selected.name, file: selected.file,
            range: selected.range, extent: selected.extent }, { origin: { surface: "prose" } });
          outlineView.invalidate();
          renderOutline();
        }
      }
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
    publishSelection: next => {
      dismissPersistentNotice();
      return selectionBus.select(next, { origin: { surface: "prose" } });
    }
  });

  panelHost = createPanelHost({
    document,
    view,
    panels: host.panels,
    inspector: ui.panelInspector,
    sidebar: panelSidebar,
    services: panelServices,
    packageService,
    hostInfo,
    builtInCreationKinds: new Set(BUILT_IN_CREATION_KINDS),
    internal: {
      "opengdd.contract": contractPanelInternal,
      "opengdd.collection": collectionPanelInternal,
      "opengdd.record-form": recordPanelInternal,
      "opengdd.mechanism": mechanismPanelInternal,
      "opengdd.palette": mechanismPanelInternal,
      "opengdd.mood": mechanismPanelInternal,
      "opengdd.direction-promise": mechanismPanelInternal,
      "opengdd.tuning-value": mechanismPanelInternal,
      "opengdd.tuning-rule": mechanismPanelInternal,
      "opengdd.clock": mechanismPanelInternal,
      "opengdd.question": mechanismPanelInternal,
      "opengdd.acceptance-test": mechanismPanelInternal,
      "opengdd.section": mechanismPanelInternal,
      "opengdd.in-context": inContextPanelInternal
    },
    report
  });

  // In the workbench, migration is a durable companion beneath extension
  // panels instead of competing with validation findings for a short region.
  // Compatibility hosts without a dedicated companion sidebar keep the
  // migration flow in Validation.
  if (regions?.context && panelSidebar === regions.context && regions.context.querySelector("[data-panel-sidebar]")) {
    ui.migrationPanel = document.createElement("section");
    ui.migrationPanel.className = "opengdd-author-panel-group opengdd-author-migration-panel";
    ui.migrationPanel.hidden = true;
    ui.migrationPanel.setAttribute("role", "group");
    ui.migrationPanel.setAttribute("aria-label", WIDGET_COPY.migrationTitle);
    ui.migrationPanel.innerHTML = `<h3 class="opengdd-author-sidebar-panel-header">${WIDGET_COPY.migrationTitle}</h3><div class="opengdd-author-migration-panel-body" data-role="migration"></div>`;
    ui.migrationBody = ui.migrationPanel.querySelector('[data-role="migration"]');
    regions.context.append(ui.migrationPanel);
    ownedChildren.get(regions.context).add(ui.migrationPanel);
  }

  outlineView = createOutlineRenderer({
    element: ui.outline,
    controlsElement: ui.outlineControls,
    document,
    view,
    state,
    hidden: () => Boolean(widgetDrawer && widgetDrawer.outline.hidden),
    panelHost,
    entries: authoringEntries,
    beforeOpen: async () => { await proseCommitQueue; analyzeNow(); },
    openLocation: openOutlineLocation,
    report,
    select: selection => {
      dismissPersistentNotice();
      return selectionBus.select(selection, { origin: { surface: "sidebar" } });
    },
    syncFolds: () => (host.outlineFolds ?? host.outlineCollections)?.setCollapsed?.([...state.outlineFolds]),
    createFromOutline,
    enterInspector: enterOutlineInspector,
    announceSelection: announceOutlineSelection,
    openFinding
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
    state.validation = { status: "pending", run: null };
    state.outlineSelection = "";
    state.outlineInspectorReturn = "";
    state.outlineAnnouncement = "";
    renderedDiagnostics = "";
    state.migration = { status: "idle", report: null, changes: [], hiddenNoOp: false, manualAfter: null, notice: null };
    panelAdvice.clear();
    pendingContractDuplicateChecks.clear();
    pendingContractUpdateNotices.clear();
    pendingInspectorFocus.clear();
    contractDuplicateWarnings = [];
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
    ui.fileHeading.hidden = false;
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
    // Panel-owned working data is exported with the package, but belongs in
    // the panel that created it rather than among the designer's source files.
    for (const folder of state.package.folders) if (folder !== "panels" && !folder.startsWith("panels/")) folderNode(folder);
    for (const path of state.package.files.keys()) if (!path.startsWith("panels/")) folderNode(parentPath(path)).files.push(basename(path));
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
    const protectedDelete = protectedFile && !OPTIONAL_MECHANISM_FILES.has(state.selected.path);
    const renameReason = protectedFile ? WIDGET_COPY.protectedRename(state.selected.path) : "";
    const deleteReason = protectedDelete ? WIDGET_COPY.protectedDelete(state.selected.path) : "";
    const setActionAvailability = (button, unavailable, reason) => {
      if (!button) return;
      // The workbench keeps protected actions focusable so their explanation
      // can be announced, but a shipped disabled attribute must never survive
      // once an ordinary selection makes the action available.
      // An unavailable action with a reason stays focusable so the reason can
      // be announced; one with nothing to explain (no selection) is disabled.
      button.disabled = unavailable && (!capabilities.protectedFiles || !reason);
      if (!capabilities.protectedFiles) {
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
    setActionAvailability(ui.delete, !state.selected || protectedDelete, deleteReason);
  }

  function openFile(path, published = { kind: "file", file: path }, origin = { surface: "explorer" }) {
    if (!state.package.files.has(path)) return;
    state.openPath = path;
    state.selected = { type: "file", path };
    if (published !== null) selectionBus.select(published, { origin });
    editorSurface.closePopups(false);
    renderTree();
    renderEditor();
    renderStatus();
  }

  selectionBus.subscribe(selected => {
    if (selected?.kind !== "file" || selected.origin?.surface !== "panel" || !state.package.files.has(selected.file)) return;
    const focus = selected.origin.focus === true;
    const range = selected.range;
    // The inspector now shows the file, not the row: the outline highlight
    // follows the selection, so the next click on that row selects it again.
    if (state.outlineSelection) {
      state.outlineSelection = "";
      outlineView?.invalidate();
      scheduleOutlineRender();
    }
    openFile(selected.file, { kind: "file", file: selected.file, range }, { surface: "explorer" });
    if (range?.start && !ui.textarea.hidden) {
      const text = ui.textarea.value;
      const start = clampedPositionToOffset(text, range.start);
      const end = Math.max(start, clampedPositionToOffset(text, range.end ?? range.start));
      const line = lineBounds(text, range.start.line);
      ui.textarea.setSelectionRange(start, end);
      editorSurface.scrollToEditorLine(line.index);
    } else if (range?.start && !ui.json.hidden) selectPreLine(range.start.line + 1, false);
    if (focus) {
      if (!ui.textarea.hidden) ui.textarea.focus();
      else ui.json.focus();
    }
  });

  function scrollToLine(element, index) {
    const style = view.getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    element.scrollTop = Math.max(0, index * lineHeight - element.clientHeight / 3);
  }

  function selectPreLine(line, focus = true) {
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
    scrollToLine(ui.json, bounds.index);
    if (focus) ui.json.focus({ preventScroll: true });
  }

  // `source` skips the owner routing: the outline's problem rows go to the
  // file and line the validator named, whoever owns the finding.
  function openFinding(index, { source = false } = {}) {
    const finding = state.validation.run?.findings[index];
    if (!finding || !state.package.files.has(finding.file)) return;
    const selected = selectionBus.current();
    if (!source && selected?.file === finding.file && selected.kind !== "file" && panelHost?.inspectorMatches(selected)) {
      pendingInspectorFocus.set(finding.file, finding);
      if (panelHost.refreshSelected()) return finding;
      pendingInspectorFocus.delete(finding.file);
    }
    // A syntax finding names a file no inspector can read; it always opens the editor at its line.
    const outline = syntaxFinding(finding) || source ? undefined : buildOutlineModel({
      authoringView: state.authoringView,
      validation: state.validation,
      problemsOnly: state.outlineProblemsOnly,
      menuOpen: state.outlineMenuOpen,
      selection: state.outlineSelection,
      folds: state.outlineFolds
    });
    const mechanismOwner = outline?.mechanisms.find(mechanism => mechanism.findings.some(item => item.index === index));
    // A finding may badge several rows (two clocks sharing an address). Following
    // it opens the selected owner when it is one, else the owner the validator's
    // sentence names first.
    const entityOwners = (outline?.mechanisms.flatMap(mechanism => mechanism.entities) ?? [])
      .filter(entity => entity.findings.includes(index));
    const namedAt = entity => {
      const positions = [entity.name, entity.name.split(".").pop()]
        .map(name => finding.message.indexOf(`"${name}"`)).filter(at => at >= 0);
      return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
    };
    const entityOwner = entityOwners.find(entity => entity.identity === state.outlineSelection)
      ?? [...entityOwners].sort((left, right) => namedAt(left) - namedAt(right))[0];
    const owner = entityOwner ?? mechanismOwner;
    if (owner) {
      const next = mechanismOwner ? { kind: "mechanism", name: owner.id, file: owner.file } : {
        kind: owner.kind,
        name: owner.name,
        file: owner.kind === "collection" ? owner.location.replace(/\/$/, "") : owner.file,
        range: owner.range,
        extent: owner.extent
      };
      if (mechanismOwner || openOutlineLocation(owner, { focus: false })) {
        state.outlineSelection = owner.identity;
        pendingInspectorFocus.set(finding.file, finding);
        selectionBus.select(next, { origin: { surface: "sidebar" } });
        announceOutlineSelection(owner.label ?? owner.display ?? owner.name, next);
        outlineView.invalidate();
        renderOutline();
        return finding;
      }
    }
    openFile(finding.file);
    if (!Number.isInteger(finding.line) || finding.line < 1) return finding;
    if (!ui.textarea.hidden) {
      const bounds = lineBounds(ui.textarea.value, finding.line - 1);
      ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(bounds.start, bounds.end);
      editorSurface.scrollToEditorLine(bounds.index);
    } else if (!ui.json.hidden) selectPreLine(finding.line);
    return finding;
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
      ui.fileHeading.hidden = true;
      return;
    }
    ui.fileHeading.hidden = false;
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
    const contractNotice = /^contracts\/[^/]+\.json$/.test(path)
      ? (path.endsWith(".pack.json") ? CONTRACT_COPY.packNotice : CONTRACT_COPY.adoptionNotice)
      : "";
    ui.fileNotice.hidden = !contractNotice;
    ui.fileNotice.textContent = contractNotice;
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

  const copyPackageFiles = files => new Map([...files].map(([path, value]) => [path, value instanceof Uint8Array ? value.slice() : value]));
  const samePackageFiles = (left, right) => left.size === right.size && [...left].every(([path, value]) => {
    const other = right.get(path);
    if (typeof value === "string" || typeof other === "string") return value === other;
    return value instanceof Uint8Array && other instanceof Uint8Array && value.length === other.length
      && value.every((byte, index) => byte === other[index]);
  });

  async function currentMigrationReport() {
    const controller = editController;
    const before = copyPackageFiles(state.package.files);
    const migration = await analysisSession.previewMigration();
    if (controller !== editController || !samePackageFiles(before, state.package.files)) {
      throw new Error(WIDGET_COPY.migrationChanged);
    }
    return { migration, before };
  }

  function migrationChanges(report, before) {
    return [...new Map((report.outputs ?? []).map(output => [output.relative, {
      relative: output.relative,
      action: before.has(output.relative) ? WIDGET_COPY.migrationRewritten : WIDGET_COPY.migrationCreated
    }])).values()];
  }

  function sameMigrationOutputs(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    const fresh = new Map();
    for (const output of right) {
      if (fresh.has(output.relative)) return false;
      fresh.set(output.relative, output.text);
    }
    if (fresh.size !== left.length) return false;
    const previewed = new Set();
    return left.every(output => {
      if (previewed.has(output.relative)) return false;
      previewed.add(output.relative);
      return fresh.has(output.relative) && fresh.get(output.relative) === output.text;
    });
  }

  function migrationManualParts(item) {
    const match = /^([^:]{1,80}):\s+([\s\S]+)$/.exec(item);
    return match ? { source: match[1], message: match[2] } : { source: "", message: item };
  }

  function migrationJsonPayload(message) {
    const closing = { "[": "]", "{": "}" };
    for (let start = 0; start < message.length; start += 1) {
      if (!closing[message[start]]) continue;
      const stack = [];
      let quoted = false;
      let escaped = false;
      for (let index = start; index < message.length; index += 1) {
        const character = message[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quoted = false;
          continue;
        }
        if (character === '"') { quoted = true; continue; }
        if (closing[character]) stack.push(closing[character]);
        else if (character === "]" || character === "}") {
          if (stack.pop() !== character) break;
          if (!stack.length) {
            const text = message.slice(start, index + 1);
            try {
              const value = JSON.parse(text);
              if (text.length < 48 || !value || typeof value !== "object") break;
              return {
                before: message.slice(0, start).trim(),
                payload: JSON.stringify(value, null, 2),
                after: message.slice(index + 1).replace(/^\s*;?\s*/, "").trim()
              };
            } catch { break; }
          }
        }
      }
    }
    return null;
  }

  function migrationManualMarkup(item) {
    const { source, message } = migrationManualParts(item);
    const json = migrationJsonPayload(message);
    const paragraph = text => text ? `<p>${escapeHtml(text)}</p>` : "";
    return `<li class="opengdd-author-migration-decision" data-migration-manual>${source ? `<code class="opengdd-author-migration-source">${escapeHtml(source)}</code>` : ""}${json
      ? `${paragraph(json.before)}<pre class="opengdd-author-migration-payload"><code>${escapeHtml(json.payload)}</code></pre>${paragraph(json.after)}`
      : paragraph(message)}</li>`;
  }

  function migrationPreviewState(migration, before, notice = null) {
    if (migration.unavailable) {
      return { ...state.migration, status: "unavailable", report: migration, changes: [], notice };
    }
    if (migration.noOp) {
      return { ...state.migration, status: "no-op", report: migration, changes: [], hiddenNoOp: false, notice };
    }
    return { ...state.migration, status: "preview", report: migration, changes: migrationChanges(migration, before), notice };
  }

  async function previewMigration() {
    if (state.migration.status === "pending") return;
    const controller = editController;
    state.migration = { ...state.migration, status: "pending", report: null, changes: [], notice: null };
    renderDiagnostics();
    try {
      const { migration, before } = await currentMigrationReport();
      if (controller !== editController) return;
      state.migration = migrationPreviewState(migration, before);
    } catch (error) {
      if (controller !== editController) return;
      state.migration = { ...state.migration, status: "error", report: null, changes: [], message: error.message, notice: null };
    }
    renderDiagnostics();
  }

  async function applyMigration() {
    if (state.migration.status === "pending") return;
    const requestedController = editController;
    const previewedOutputs = state.migration.report?.outputs;
    state.migration = { ...state.migration, status: "pending" };
    renderDiagnostics();
    try {
      const controller = editController;
      const { migration, before } = await currentMigrationReport();
      if (requestedController !== editController) return;
      if (migration.unavailable) {
        state.migration = migrationPreviewState(migration, before);
        renderDiagnostics();
        return;
      }
      if (!sameMigrationOutputs(previewedOutputs, migration.outputs)) {
        state.migration = migrationPreviewState(migration, before, WIDGET_COPY.migrationStale);
        renderDiagnostics();
        return;
      }
      if (migration.noOp || migration.refused) {
        state.migration = migrationPreviewState(migration, before);
        renderDiagnostics();
        return;
      }
      const outputs = migration.outputs ?? [];
      if (!outputs.length) throw new Error(WIDGET_COPY.migrationNoOutputs);
      const seen = new Set();
      const transaction = controller.begin(WIDGET_COPY.migrationUndo);
      for (const output of outputs) {
        const relative = normalizePath(output.relative);
        if (relative !== output.relative || output.file !== `/package/${relative}` || typeof output.text !== "string" || seen.has(relative)) {
          transaction.abort();
          throw new Error(WIDGET_COPY.migrationUnsafeOutput);
        }
        seen.add(relative);
        const current = state.package.files.get(relative);
        if (current === undefined) transaction.file(relative).create(output.text);
        else {
          if (typeof current !== "string") {
            transaction.abort();
            throw new Error(WIDGET_COPY.migrationBinaryOutput(relative));
          }
          transaction.text(relative).replace({
            start: { line: 0, character: 0 },
            end: offsetToPosition(current, current.length),
            revision: controller.revision(relative)
          }, output.text);
        }
      }
      await applyEdit(() => transaction.commit());
      if (controller !== editController) return;
      state.migration = {
        status: "idle", report: null, changes: [], hiddenNoOp: false,
        manualAfter: [...migration.manual], notice: null
      };
      analyzeNow();
      renderAll();
      validationChanged();
    } catch (error) {
      if (requestedController !== editController) return;
      state.migration = { ...state.migration, status: "error", report: null, changes: [], message: error.message, notice: null };
      renderDiagnostics();
    }
  }

  function migrationMarkup() {
    const migration = state.migration;
    const manualAfter = migration.manualAfter?.length
      ? `<section class="opengdd-author-migration opengdd-author-migration--after"><h3>${WIDGET_COPY.migrationAfter}</h3><ul class="opengdd-author-migration-decisions">${migration.manualAfter.map(migrationManualMarkup).join("")}</ul><button type="button" data-action="migration-dismiss-manual">${WIDGET_COPY.dismissMigrationManual}</button></section>`
      : "";
    const needsMigration = ["0.6", "0.7"].includes(state.authoringView?.manifest?.opengdd);
    if (migration.status === "no-op") {
      const notice = migration.notice ? `<p>${migration.notice}</p>` : "";
      return `<section class="opengdd-author-migration">${notice}<p>${WIDGET_COPY.migrationNoOp}</p><button type="button" data-action="migration-dismiss-no-op">${WIDGET_COPY.dismissMigrationNoOp}</button></section>${manualAfter}`;
    }
    if (!needsMigration || migration.hiddenNoOp) return manualAfter;
    const introduction = `<p>${WIDGET_COPY.migrationBanner}</p>`;
    if (migration.status === "pending") {
      return `<section class="opengdd-author-migration">${introduction}<p>${WIDGET_COPY.preparingMigration}</p></section>${manualAfter}`;
    }
    if (migration.status === "unavailable") {
      return `<section class="opengdd-author-migration"><p>${WIDGET_COPY.migrationSchemaUnavailable}</p></section>${manualAfter}`;
    }
    if (migration.status === "error") {
      return `<section class="opengdd-author-migration">${introduction}<p>${WIDGET_COPY.migrationPreviewFailed}</p><p class="opengdd-author-migration-detail"><small>${escapeHtml(migration.message || WIDGET_COPY.unknownError)}</small></p><button type="button" data-action="migration-preview">${WIDGET_COPY.previewMigration}</button></section>${manualAfter}`;
    }
    if (migration.status === "preview" && migration.report) {
      const notice = migration.notice ? `<p>${migration.notice}</p>` : "";
      const changes = migration.changes.length
        ? `<details class="opengdd-author-migration-details" open><summary>${WIDGET_COPY.migrationChanges} <span>${migration.changes.length}</span></summary><ul>${migration.changes.map(change => `<li data-migration-change><code>${escapeHtml(change.relative)}</code> — ${change.action}</li>`).join("")}</ul></details>`
        : "";
      const manual = migration.report.manual.length
        ? `<details class="opengdd-author-migration-details"><summary>${WIDGET_COPY.migrationManual} <span>(${migration.report.manual.length})</span></summary><ul class="opengdd-author-migration-decisions">${migration.report.manual.map(migrationManualMarkup).join("")}</ul></details>`
        : "";
      const refusal = migration.report.refused ? `<p>${WIDGET_COPY.migrationRefused}</p>` : "";
      const apply = migration.report.refused ? "" : `<button type="button" data-action="migration-apply">${WIDGET_COPY.applyMigration}</button>`;
      return `<section class="opengdd-author-migration"><div class="opengdd-author-migration-actions">${apply}<button type="button" data-action="migration-not-now">${WIDGET_COPY.notNow}</button></div>${introduction}${notice}${refusal}${changes}${manual}</section>${manualAfter}`;
    }
    return `<section class="opengdd-author-migration">${introduction}<button type="button" data-action="migration-preview">${WIDGET_COPY.previewMigration}</button></section>${manualAfter}`;
  }

  function renderMigration() {
    if (!ui.migrationPanel) return;
    const markup = migrationMarkup();
    ui.migrationPanel.hidden = !markup;
    if (!markup || ui.migrationBody.innerHTML === markup) return;
    const scroll = { top: ui.migrationBody.scrollTop, left: ui.migrationBody.scrollLeft };
    ui.migrationBody.innerHTML = markup;
    ui.migrationBody.scrollTop = scroll.top;
    ui.migrationBody.scrollLeft = scroll.left;
  }

  function renderDiagnostics() {
    const { status, run, message } = state.validation;
    renderMigration();
    const migration = ui.migrationPanel ? "" : migrationMarkup();
    const setDiagnosticSummary = text => {
      if (ui.diagnosticSummary.textContent !== text) ui.diagnosticSummary.textContent = text;
      if (capabilities.workbenchLabels) ui.diagnosticSummary.parentElement.setAttribute("aria-label", WIDGET_COPY.validationAccessible(text));
    };
    const replaceDiagnostics = markup => {
      if (markup === renderedDiagnostics) return;
      const scroll = { top: ui.diagnostics.scrollTop, left: ui.diagnostics.scrollLeft };
      renderedDiagnostics = markup;
      ui.diagnostics.innerHTML = markup;
      ui.diagnostics.scrollTop = scroll.top;
      ui.diagnostics.scrollLeft = scroll.left;
    };
    if (capabilities.workbenchLabels) ui.diagnosticSummary.classList.remove("opengdd-author-verdict--pass", "opengdd-author-verdict--warnings", "opengdd-author-verdict--fail");
    if (status === "pending") {
      setDiagnosticSummary(WIDGET_COPY.checkingEllipsis);
      if (!run) {
        replaceDiagnostics(`${migration}<p class="opengdd-author-muted">${WIDGET_COPY.checkingPackage}</p>`);
        return;
      }
    }
    if (status === "unavailable") {
      setDiagnosticSummary(WIDGET_COPY.unavailable);
      replaceDiagnostics(`${migration}<p class="opengdd-author-validation-unavailable">${WIDGET_COPY.validationUnavailable}</p>`);
      return;
    }
    if (status === "crashed") {
      setDiagnosticSummary(WIDGET_COPY.crashed);
      replaceDiagnostics(`${migration}<p class="opengdd-author-validation-unavailable">${WIDGET_COPY.validationCrashed(escapeHtml(message || WIDGET_COPY.unknownError))}</p>`);
      return;
    }

    const advice = validationService.current().advice;
    const summary = { errors: run.summary.errors, warnings: run.summary.warnings + advice.length };
    const verdict = summary.errors ? WIDGET_COPY.fail : summary.warnings ? WIDGET_COPY.passWithWarnings : WIDGET_COPY.pass;
    const verdictClass = summary.errors ? "fail" : summary.warnings ? "warnings" : "pass";
    if (status !== "pending") {
      setDiagnosticSummary(capabilities.workbenchLabels
        ? WIDGET_COPY.validationSummaryFull(verdict, summary.errors, summary.warnings)
        : WIDGET_COPY.validationSummary(verdict, summary.errors, summary.warnings));
      if (capabilities.workbenchLabels) {
        ui.diagnosticSummary.classList.add(`opengdd-author-verdict--${verdictClass}`);
      }
    }
    const findingRows = run.findings.map((finding, index) => ({ finding, index })).sort((left, right) => {
      const severity = Number(left.finding.severity === "warning") - Number(right.finding.severity === "warning");
      if (severity) return severity;
      return Number(syntaxFinding(right.finding)) - Number(syntaxFinding(left.finding));
    });
    const findingList = findingRows.length
      ? `<ul class="opengdd-author-diagnostic-list">${findingRows.map(({ finding, index }) => {
        const location = findingLocation(finding);
        const severity = finding.severity;
        const accessible = findingAccessibleName(finding);
        const code = capabilities.workbenchLabels ? "" : `<code>${escapeHtml(finding.code)}</code>`;
        return `<li><button type="button" class="opengdd-author-diagnostic-line" data-finding="${index}" aria-label="${escapeHtml(accessible)}" title="${escapeHtml(finding.message)}"><span class="opengdd-author-diagnostic-severity opengdd-author-diagnostic-severity--${severity}" aria-hidden="true">${severity}</span>${code}<span class="opengdd-author-diagnostic-message">${escapeHtml(finding.message)}</span><span class="opengdd-author-diagnostic-location">${escapeHtml(location)}</span></button></li>`;
      }).join("")}</ul>`
      : "";
    const adviceList = advice.length
      ? `<ul class="opengdd-author-diagnostic-list opengdd-author-panel-advice">${advice.map(finding => {
        const location = findingLocation(finding);
        return `<li><div class="opengdd-author-diagnostic-line"><span class="opengdd-author-diagnostic-severity opengdd-author-diagnostic-severity--warning" aria-hidden="true">warning</span><span class="opengdd-author-diagnostic-panel">${escapeHtml(finding.panelTitle)}</span><span class="opengdd-author-diagnostic-message">${escapeHtml(finding.message)}</span><span class="opengdd-author-diagnostic-location">${escapeHtml(location)}</span></div></li>`;
      }).join("")}</ul>` : "";
    const empty = run.findings.length || advice.length ? "" : `<p class="opengdd-author-validation-empty">${WIDGET_COPY.noFindings}</p>`;
    const skipped = run.skipped.length
      ? `<p class="opengdd-author-validation-skipped">${WIDGET_COPY.skippedMediaChecks}</p>`
      : "";
    const verdictLine = capabilities.workbenchLabels ? "" : `<p class="opengdd-author-verdict opengdd-author-verdict--${verdictClass}">${WIDGET_COPY.validationSummaryFull(verdict, summary.errors, summary.warnings)}</p>`;
    replaceDiagnostics(`${migration}${verdictLine}${empty}${findingList}${adviceList}${skipped}`);
  }

  function openContractRenameFromPanel(anchor, file) {
    const artifact = authoringEntries().find(entry => entry.kind === "contract" && entry.file === file);
    if (!artifact) return false;
    openRenameDialog({
      document,
      anchor,
      references: referencesService,
      name: artifact.name,
      initial: artifact.display,
      onApplied: next => {
        if (state.openPath === artifact.file) state.openPath = `contracts/${next}.json`;
        state.selected = { type: "file", path: `contracts/${next}.json` };
        analyzeNow(); validationChanged(); renderAll();
      }
    });
    return true;
  }

  function enterOutlineInspector(focusKey) {
    state.outlineInspectorReturn = focusKey;
    if (widgetDrawer) openWidgetDrawer("inspector");
    else host.enterOutlineInspector?.();
    view.queueMicrotask(() => {
      const region = regions?.inspector ?? widgetDrawer?.inspector ?? ui.panelInspector;
      region?.querySelector('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    });
  }

  function announceOutlineSelection(name, selection) {
    state.outlineAnnouncement = WIDGET_COPY.outlineSelected(name, panelHost.titleFor(selection) || WIDGET_COPY.contextAndValidation);
    renderStatus();
  }

  function openOutlineLocation(location, { focus = true } = {}) {
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
      if (focus) ui.textarea.focus({ preventScroll: true });
      ui.textarea.setSelectionRange(start, end);
      editorSurface.scrollToEditorLine(line.index);
    }
    return true;
  }

  function revealLocation(location) {
    if (!state.package.files.has(location.file) || editController.revision(location.file) !== location.revision) return false;
    openFile(location.file, null);
    if (!ui.textarea.hidden) {
      const text = ui.textarea.value;
      const line = lineBounds(text, location.range.start.line);
      const start = clampedPositionToOffset(text, location.range.start);
      const end = Math.max(start, clampedPositionToOffset(text, location.range.end));
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

  function authoringEntries() {
    const entities = (state.authoringView?.mechanisms ?? []).flatMap(mechanism => mechanism.entities);
    const enriched = new Map(entities.map(entry => [entry.identity, entry]));
    return (state.authoringView?.routables ?? []).map(entry => {
      const artifact = enriched.get(entry.identity) ?? entry;
      if (artifact.kind !== "value") return artifact;
      return {
        ...artifact,
        sameNumberWarnings: (state.authoringView?.sameNumberWarnings ?? [])
          .filter(warning => artifact.file === "tuning.json" && artifact.name === warning.key)
          .map(warning => ({ ...warning }))
      };
    });
  }

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
    if (collectionDialog.mode === "contract") {
      const source = collectionDialog.contractSources[collectionDialog.contractIndex];
      const name = kebabName(collectionDialog.contractName);
      let prepared;
      if (source && name) {
        try {
          prepared = prepareContractAddition({ files: state.package.files, definitionText: source.text, packText: source.pack, name,
            sourceFilename: source.sourceFilename, startUnanswered: collectionDialog.contractStartUnanswered });
        } catch (error) {
          prepared = { ok: false, reason: error.message };
        }
      }
      const measureRevision = ++collectionDialog.contractMeasureRevision;
      collectionDialog.prepared = prepared;
      collectionDialog.contractUpdates = new Map();
      const todo = ui.collectionDialog.querySelector("[data-contract-todo]");
      const error = ui.collectionDialog.querySelector("[data-contract-error]");
      const confirm = ui.collectionDialog.querySelector("[data-collection-confirm]");
      if (todo) todo.textContent = "";
      if (error) error.textContent = collectionDialog.sourceError || (prepared && !prepared.ok ? prepared.reason : "");
      if (confirm) {
        confirm.textContent = collectionDialog.contractUpdateFile ? CONTRACT_COPY.update : CONTRACT_COPY.add;
        confirm.disabled = true;
      }
      if (source) for (const target of findContractUpdateTargets(state.package.files, source.text)) {
        let update;
        try {
          update = prepareContractUpdate({ files: state.package.files, definitionText: source.text,
            packText: source.pack, adoptionFile: target.file });
        } catch (cause) { update = { ok: false, reason: cause.message }; }
        collectionDialog.contractUpdates.set(target.file, update);
        const input = [...ui.collectionDialog.querySelectorAll("[data-contract-update]")]
          .find(candidate => candidate.dataset.contractUpdate === target.file);
        const line = [...ui.collectionDialog.querySelectorAll("[data-contract-update-line]")]
          .find(candidate => candidate.dataset.contractUpdateLine === target.file);
        if (input) input.disabled = true;
        if (line) line.textContent = update.ok ? "" : update.reason;
        if (!update.ok) continue;
        measureContractUpdate(update).then(measured => {
          if (!collectionDialog || collectionDialog.contractMeasureRevision !== measureRevision) return;
          const ready = Object.freeze({ ...update, ...measured });
          collectionDialog.contractUpdates.set(target.file, ready);
          if (line) line.textContent = measured.line;
          if (input) input.disabled = false;
          if (confirm && collectionDialog.contractUpdateFile === target.file) confirm.disabled = false;
        }).catch(cause => {
          if (!collectionDialog || collectionDialog.contractMeasureRevision !== measureRevision) return;
          collectionDialog.contractUpdates.set(target.file, { ok: false, reason: cause.message });
          if (line) line.textContent = cause.message;
        });
      }
      if (prepared?.ok) measureContractAddition(prepared).then(measured => {
        if (!collectionDialog || collectionDialog.contractMeasureRevision !== measureRevision) return;
        collectionDialog.prepared = Object.freeze({ ...prepared, ...measured });
        if (todo) todo.textContent = prepared.preservesAdoption
          ? CONTRACT_COPY.copiedAdoption(measured.codes.length) : "";
        if (confirm && !collectionDialog.contractUpdateFile) confirm.disabled = false;
      }).catch(cause => {
        if (!collectionDialog || collectionDialog.contractMeasureRevision !== measureRevision) return;
        collectionDialog.prepared = { ok: false, reason: cause.message };
        if (error) error.textContent = cause.message;
      });
      return;
    }
    const copy = CREATION_COPY.collectionDialog;
    if (collectionDialog.mode === "chapter") {
      const stem = kebabName(collectionDialog.chapterValue);
      const number = nextChapterNumber(state.package.files);
      const preview = ui.collectionDialog.querySelector("[data-chapter-preview]");
      if (preview) preview.innerHTML = stem ? inlineCodeHtml(CREATION_COPY.chapterDialog.preview(number, stem)) : "";
      ui.collectionDialog.querySelector("[data-collection-confirm]").disabled = !stem;
      return;
    }
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
    if (collectionDialog.mode === "contract") {
      const source = collectionDialog.contractSources[collectionDialog.contractIndex];
      let details = "";
      if (source) {
        const existing = findPackageDefinition(state.package.files, source.value.contract, source.value.version);
        const keepingAdoption = source.kind === "adoption" && !collectionDialog.contractStartUnanswered;
        const definition = keepingAdoption ? source.value : existing?.value ?? source.value;
        const sequence = collectionDialog.contractSources.length > 1
          ? `<p class="opengdd-author-create-sequence">${escapeHtml(CONTRACT_COPY.sequence(collectionDialog.contractIndex + 1, collectionDialog.contractSources.length, definition.summary))}</p>`
          : `<p class="opengdd-author-create-sequence">${escapeHtml(definition.summary)}</p>`;
        const reused = existing && !keepingAdoption ? `<p>${escapeHtml(CONTRACT_COPY.sameDefinition)}</p>` : "";
        const start = source.kind === "adoption" ? `<label for="opengdd-contract-start">${CONTRACT_COPY.adoptionStart}</label><select id="opengdd-contract-start" data-contract-start${collectionDialog.contractUpdateFile ? " disabled" : ""}><option value="supplied"${keepingAdoption ? " selected" : ""}>${CONTRACT_COPY.useSupplied}</option><option value="unanswered"${keepingAdoption ? "" : " selected"}>${CONTRACT_COPY.startUnanswered}</option></select>${keepingAdoption && !source.sourceFilename ? `<p>${escapeHtml(CONTRACT_COPY.unknownSourceName)}</p>` : ""}` : "";
        const pack = source.pack ? `<p class="opengdd-author-create-help">${CONTRACT_COPY.packIncluded}</p>` : "";
        const updateTargets = findContractUpdateTargets(state.package.files, source.text);
        const updates = updateTargets.length ? `<fieldset class="opengdd-author-contract-updates"><legend>${CONTRACT_COPY.updateLegend}</legend><p>${escapeHtml(CONTRACT_COPY.updateBoundary)}</p>${updateTargets.map(target => `<label><input type="checkbox" data-contract-update="${escapeHtml(target.file)}"${collectionDialog.contractUpdateFile === target.file ? " checked" : ""}> <span>${inlineCodeHtml(CONTRACT_COPY.updateOffer(target.adoption, source.value.version))}</span></label><p data-contract-update-line="${escapeHtml(target.file)}"></p>`).join("")}</fieldset>` : "";
        const skip = collectionDialog.contractSources.length > 1
          ? `<button type="button" class="opengdd-author-create-skip" data-collection-skip>${CONTRACT_COPY.skip}</button>` : "";
        details = `${sequence}${reused}${updates}<label for="opengdd-contract-name">${CONTRACT_COPY.nameQuestion}</label><p class="opengdd-author-create-help">${escapeHtml(CONTRACT_COPY.nameHelp)}</p><input id="opengdd-contract-name" data-contract-name autocomplete="off" value="${escapeHtml(collectionDialog.contractName)}"${collectionDialog.contractUpdateFile ? " disabled" : ""}>${start}${pack}<p data-contract-todo></p>${skip}`;
      }
      ui.collectionDialog.setAttribute("aria-labelledby", "opengdd-collection-dialog-title");
      const sourcePicker = `<label class="opengdd-author-contract-drop">${CONTRACT_COPY.drop}<input data-contract-file type="file" accept=".json,.zip,application/json,application/zip" multiple></label><textarea data-contract-paste aria-label="${CONTRACT_COPY.pastePlaceholder}" placeholder="${CONTRACT_COPY.pastePlaceholder}">${escapeHtml(collectionDialog.pasteValue)}</textarea>${contractsCatalogueUrl ? `<p>${escapeHtml(CONTRACT_COPY.catalogue)} <a href="${escapeHtml(contractsCatalogueUrl)}">${escapeHtml(contractsCatalogueUrl)}</a>.</p>` : ""}`;
      const title = source ? CONTRACT_COPY.addTitle(source.value.contract, source.value.version) : CONTRACT_COPY.title;
      const picker = !source ? sourcePicker : collectionDialog.contractOffered ? "" : `<details><summary>Choose a different file</summary>${sourcePicker}</details>`;
      ui.collectionDialog.innerHTML = `<h3 id="opengdd-collection-dialog-title">${escapeHtml(title)}</h3>${source ? details + picker : picker}<p class="opengdd-author-create-error" data-contract-error aria-live="polite"></p><div class="opengdd-author-create-actions"><button type="button" data-collection-confirm>${CONTRACT_COPY.add}</button><button type="button" data-collection-cancel>${CONTRACT_COPY.cancel}</button></div>`;
      ui.collectionDialog.hidden = false;
      updateCollectionDialog();
      positionCollectionDialog();
      if (focus) ui.collectionDialog.querySelector(source ? "[data-contract-name]" : "[data-contract-paste]")?.focus({ preventScroll: true });
      return;
    }
    if (collectionDialog.mode === "chapter") {
      const chapter = CREATION_COPY.chapterDialog;
      ui.collectionDialog.setAttribute("aria-labelledby", "opengdd-collection-dialog-title");
      ui.collectionDialog.innerHTML = `<h3 id="opengdd-collection-dialog-title">${chapter.title}</h3><label for="opengdd-chapter-name">${chapter.question}</label><p class="opengdd-author-create-help">${escapeHtml(chapter.help)}</p><input id="opengdd-chapter-name" data-chapter-name autocomplete="off" value="${escapeHtml(collectionDialog.chapterValue)}"><p class="opengdd-author-create-preview" data-chapter-preview></p><div class="opengdd-author-create-actions"><button type="button" data-collection-confirm>${chapter.create}</button><button type="button" data-collection-cancel>${chapter.cancel}</button></div>`;
      ui.collectionDialog.hidden = false;
      updateCollectionDialog();
      positionCollectionDialog();
      if (focus) ui.collectionDialog.querySelector("[data-chapter-name]")?.focus({ preventScroll: true });
      return;
    }
    const collectionQuestion = collectionDialog.mode === "collection" ? `<label for="opengdd-collection-name">${copy.collectionQuestion}</label><p class="opengdd-author-create-help">${escapeHtml(copy.collectionHelp)}</p><input id="opengdd-collection-name" data-collection-name autocomplete="off" value="${escapeHtml(collectionDialog.collectionValue)}"><p class="opengdd-author-create-preview" data-collection-preview></p><p class="opengdd-author-create-error" data-collection-error aria-live="polite"></p>` : "";
    const recordQuestion = collectionDialog.mode === "collection" ? copy.firstRecordQuestion : copy.recordQuestion;
    const skip = collectionDialog.mode === "collection" ? `<button type="button" class="opengdd-author-create-skip" data-collection-skip>${copy.skipFirstRecord}</button>` : "";
    ui.collectionDialog.setAttribute("aria-labelledby", "opengdd-collection-dialog-title");
    ui.collectionDialog.innerHTML = `<h3 id="opengdd-collection-dialog-title">${collectionDialog.mode === "collection" ? copy.title : WIDGET_COPY.addRecord}</h3>${collectionQuestion}<label for="opengdd-record-name">${recordQuestion}</label><p class="opengdd-author-create-help">${escapeHtml(copy.recordHelp)}</p><input id="opengdd-record-name" data-record-name autocomplete="off" value="${escapeHtml(collectionDialog.recordValue)}"><p class="opengdd-author-create-preview" data-record-preview></p><p class="opengdd-author-create-error" data-record-error aria-live="polite"></p>${skip}<div class="opengdd-author-create-actions"><button type="button" data-collection-confirm>${copy.create}</button><button type="button" data-collection-cancel>${copy.cancel}</button></div>`;
    ui.collectionDialog.hidden = false;
    updateCollectionDialog();
    positionCollectionDialog();
    if (focus) {
      const input = ui.collectionDialog.querySelector(collectionDialog.mode === "collection" ? "[data-collection-name]" : "[data-record-name]");
      input?.focus({ preventScroll: true });
      if (collectionDialog.prefill && input?.select) input.select();
    }
  }

  async function loadContractFiles(inputFiles) {
    collectionDialog.contractUpdateFile = "";
    const files = new Map();
    let hadZip = false;
    for (const file of inputFiles) {
      if (/\.zip$/i.test(file.name)) {
        hadZip = true;
        const archive = await readZip(file, { preserveTextBytes: true });
        for (const [path, value] of archive.files) files.set(`${file.name}/${path}`, value);
      } else if (/\.json$/i.test(file.name)) {
        // Keep the received bytes until classification has distinguished a
        // definition from a pack; pack hashes and writes must use those bytes.
        files.set(file.name, new Uint8Array(await file.arrayBuffer()));
      }
    }
    const sources = collectContractSources(files);
    if (!sources.length) throw new Error(hadZip ? CONTRACT_COPY.zipRefusal : CONTRACT_COPY.refusal);
    collectionDialog.contractSources = sources;
    collectionDialog.contractIndex = 0;
    collectionDialog.contractName = sources[0]?.kind === "adoption" ? contractSourceName(sources[0].sourceFilename) : "";
    collectionDialog.contractStartUnanswered = false;
    collectionDialog.pasteValue = "";
    collectionDialog.sourceError = "";
    renderCollectionDialog();
  }

  // A host may arrive with a contract already chosen (a catalogue deep link).
  // The offer opens the ordinary Add-a-contract dialog with that source loaded,
  // after the initial package is open so the dialog measures the right files.
  async function offerInitialContract() {
    if (typeof host.initialContract !== "function") return;
    const revision = state.revision;
    try {
      const offer = await host.initialContract();
      if (destroyed || revision !== state.revision || !offer) return;
      const files = new Map([[offer.sourceFilename || "", offer.definitionText]]);
      if (offer.packText !== undefined && offer.packText !== null) files.set("offered.pack.json", offer.packText);
      const sources = collectContractSources(files);
      if (!sources.length) throw new Error(CONTRACT_COPY.refusal);
      const anchor = ui.outline?.querySelector('[data-action="outline-menu"]') ?? ui.tree ?? rootElement;
      openCollectionDialog(anchor, "contract");
      collectionDialog.contractSources = sources;
      collectionDialog.contractOffered = true;
      collectionDialog.contractName = sources[0]?.kind === "adoption" ? contractSourceName(sources[0].sourceFilename) : "";
      renderCollectionDialog();
    } catch (error) {
      report(error.message, true);
    }
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
      if (event.target.matches("[data-chapter-name]")) collectionDialog.chapterValue = event.target.value;
      if (event.target.matches("[data-contract-name]")) collectionDialog.contractName = event.target.value;
      if (event.target.matches("[data-contract-paste]")) {
        collectionDialog.contractUpdateFile = "";
        collectionDialog.pasteValue = event.target.value;
        const sources = collectContractSources(new Map([["", event.target.value]]));
        collectionDialog.contractSources = sources;
        collectionDialog.contractIndex = 0;
        collectionDialog.sourceError = sources.length ? "" : CONTRACT_COPY.refusal;
        collectionDialog.contractName = "";
        collectionDialog.contractStartUnanswered = false;
        renderCollectionDialog(false);
        return;
      }
      updateCollectionDialog();
    });
    on(ui.collectionDialog, "change", event => {
      if (event.target.matches("[data-contract-start]") && collectionDialog?.mode === "contract") {
        collectionDialog.contractStartUnanswered = event.target.value === "unanswered";
        renderCollectionDialog(false);
        ui.collectionDialog.querySelector("[data-contract-start]")?.focus();
        return;
      }
      if (event.target.matches("[data-contract-update]") && collectionDialog?.mode === "contract") {
        const file = event.target.dataset.contractUpdate;
        collectionDialog.contractUpdateFile = event.target.checked ? file : "";
        for (const input of ui.collectionDialog.querySelectorAll("[data-contract-update]")) {
          if (input !== event.target) input.checked = false;
        }
        renderCollectionDialog(false);
        return;
      }
      if (!event.target.matches("[data-contract-file]") || !collectionDialog) return;
      loadContractFiles([...event.target.files]).catch(error => {
        collectionDialog.sourceError = error.message;
        renderCollectionDialog(false);
      });
    });
    on(ui.collectionDialog, "dragover", event => {
      if (collectionDialog?.mode === "contract") event.preventDefault();
    });
    on(ui.collectionDialog, "drop", event => {
      if (collectionDialog?.mode !== "contract") return;
      event.preventDefault();
      loadContractFiles([...(event.dataTransfer?.files ?? [])]).catch(error => {
        collectionDialog.sourceError = error.message;
        renderCollectionDialog(false);
      });
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
        const focusable = [...ui.collectionDialog.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])")];
        const current = focusable.indexOf(document.activeElement);
        if (!focusable.length || (!event.shiftKey && current < focusable.length - 1) || (event.shiftKey && current > 0)) return;
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
      }
    });
  }

  function openCollectionDialog(anchor, mode = "collection", collection = "", options = {}) {
    ensureCollectionDialog();
    let resolve;
    const result = options.awaitResult ? new Promise(settle => { resolve = settle; }) : undefined;
    collectionDialog = {
      anchor,
      returnFocus: anchor,
      mode,
      collection,
      prefill: options.prefill ?? "",
      sourceFile: options.sourceFile,
      undo: options.undo,
      selectCreated: options.selectCreated !== false,
      resolve,
      settled: false,
      collectionValue: "",
      recordValue: options.prefill ?? "",
      chapterValue: "",
      contractSources: [], contractIndex: 0, contractName: "", pasteValue: "", sourceError: "", prepared: null,
      contractStartUnanswered: false,
      contractUpdateFile: "", contractUpdates: new Map(),
      contractMeasureRevision: 0
    };
    renderCollectionDialog();
    return result;
  }

  function hideCollectionDialog(restoreFocus = false) {
    const returnFocus = collectionDialog?.returnFocus;
    if (collectionDialog?.resolve && !collectionDialog.settled) collectionDialog.resolve(null);
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
    if (pending.mode === "contract") {
      if (skip) {
        pending.contractIndex += 1;
        pending.contractName = pending.contractSources[pending.contractIndex]?.kind === "adoption" ? contractSourceName(pending.contractSources[pending.contractIndex].sourceFilename) : "";
        pending.contractStartUnanswered = false;
        pending.contractUpdateFile = "";
        if (pending.contractIndex >= pending.contractSources.length) { hideCollectionDialog(true); return; }
        renderCollectionDialog();
        return;
      }
      if (pending.contractUpdateFile) {
        const update = pending.contractUpdates.get(pending.contractUpdateFile);
        if (!update?.ok || !Number.isInteger(update.outOfRange) || !Number.isInteger(update.validatorFindings)) return;
        if (editController.revision(update.path) !== update.targetRevision) {
          renderCollectionDialog(false);
          return;
        }
        const transaction = editController.begin(CONTRACT_COPY.undo.update);
        stageContractUpdate(transaction, update);
        await applyEdit(() => transaction.commit());
        pendingContractDuplicateChecks.add(update.path);
        pendingContractUpdateNotices.set(update.path, { changelog: update.changelog });
        state.outlineMenuOpen = false;
        const hasNext = pending.contractIndex + 1 < pending.contractSources.length;
        if (hasNext) {
          pending.contractIndex += 1;
          pending.contractName = pending.contractSources[pending.contractIndex]?.kind === "adoption" ? contractSourceName(pending.contractSources[pending.contractIndex].sourceFilename) : "";
          pending.contractStartUnanswered = false;
          pending.contractUpdateFile = "";
          pending.sourceError = "";
          analyzeNow(); validationChanged(); renderAll(); renderCollectionDialog();
          return;
        }
        hideCollectionDialog(false);
        analyzeNow(); validationChanged(); renderAll();
        const selected = authoringEntries().find(entry => entry.kind === "contract" && entry.file === update.path);
        if (selected) {
          openOutlineLocation(selected);
          state.outlineSelection = selected.identity;
          selectionBus.select({ kind: selected.kind, name: selected.name, file: selected.file,
            range: selected.range, extent: selected.extent }, { origin: { surface: "sidebar" } });
          outlineView.invalidate(); renderOutline();
        }
        return;
      }
      const addition = pending.prepared;
      if (!addition?.ok || !Number.isInteger(addition.consequences)) return;
      if (addition.packageRevision !== editController.revision()) {
        renderCollectionDialog(false);
        return;
      }
      const transaction = editController.begin(CONTRACT_COPY.undo.add);
      transaction.file(addition.path).create(addition.adoptionText);
      if (addition.pack?.create) transaction.file(addition.pack.path).create(addition.pack.value);
      await applyEdit(() => transaction.commit());
      pendingContractDuplicateChecks.add(addition.path);
      state.outlineMenuOpen = false;
      const hasNext = pending.contractIndex + 1 < pending.contractSources.length;
      if (hasNext) {
        pending.contractIndex += 1;
        pending.contractName = pending.contractSources[pending.contractIndex]?.kind === "adoption" ? contractSourceName(pending.contractSources[pending.contractIndex].sourceFilename) : "";
        pending.contractStartUnanswered = false;
        pending.contractUpdateFile = "";
        pending.sourceError = "";
        analyzeNow(); validationChanged(); renderAll(); renderCollectionDialog();
        return;
      }
      hideCollectionDialog(false);
      analyzeNow(); validationChanged(); renderAll();
      const selected = authoringEntries().find(entry => entry.kind === "contract" && entry.file === addition.path);
      if (selected) {
        openOutlineLocation(selected);
        state.outlineSelection = selected.identity;
        selectionBus.select({ kind: selected.kind, name: selected.name, file: selected.file,
          range: selected.range, extent: selected.extent }, { origin: { surface: "sidebar" } });
        outlineView.invalidate(); renderOutline();
      }
      return;
    }
    if (pending.mode === "chapter") {
      const chapter = chapterCreation(state.package.files, pending.chapterValue);
      const transaction = editController.begin(CREATION_COPY.chapterDialog.createUndo);
      transaction.file(chapter.path).create(chapter.text);
      await applyEdit(() => transaction.commit());
      state.outlineMenuOpen = false;
      hideCollectionDialog(false);
      analyzeNow();
      validationChanged();
      renderAll();
      openFile(chapter.path);
      const selected = authoringEntries().find(entry => entry.kind === "section" && entry.file === chapter.path);
      if (selected) {
        state.outlineSelection = selected.identity;
        selectionBus.select({ kind: selected.kind, name: selected.name, file: selected.file,
          range: selected.range, extent: selected.extent }, { origin: { surface: "sidebar" } });
        outlineView.invalidate();
        renderOutline();
      }
      return;
    }
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
    const label = pending.undo ?? (pending.mode === "collection"
      ? CREATION_COPY.collectionDialog.createUndo
      : CREATION_COPY.collectionDialog.addRecordUndo);
    const transaction = editController.begin(label);
    if (pending.mode === "collection") transaction.folder(`collections/${collection}`).create();
    if (!skip) {
      const source = pending.sourceFile ? state.package.files.get(pending.sourceFile) : undefined;
      if (pending.sourceFile && source === undefined) throw new Error(`The source record ${pending.sourceFile} no longer exists.`);
      transaction.file(`collections/${collection}/${record}.json`).create(source ?? collectionRecordText(state.package.files, collection));
    }
    await applyEdit(() => transaction.commit());
    state.outlineMenuOpen = false;
    pending.settled = true;
    hideCollectionDialog(false);
    pending.resolve?.(skip ? null : record);
    analyzeNow();
    validationChanged();
    renderAll();
    // A form's create-and-fill door must keep its source form mounted until
    // the returned id has been written; ordinary record creation still selects.
    if (!pending.selectCreated) return;
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
      range: selected.range,
      extent: selected.extent
    }, { origin: { surface: "sidebar" } });
    outlineView.invalidate();
    renderOutline();
  }

  async function createFromOutline(item, sourceElement, requestedName) {
    state.outlineMenuOpen = false;
    if (item === "Collection" || item === "Chapter" || item === "Contract") {
      const focus = sourceElement?.dataset.outlineFocus;
      renderOutline();
      const outlineRoots = [ui.outlineControls, ui.outline].filter(Boolean);
      const anchor = outlineRoots.flatMap(root => [...root.querySelectorAll("[data-outline-focus]")])
        .find(element => element.dataset.outlineFocus === focus)
        ?? outlineRoots.map(root => root.querySelector('[data-action="outline-menu"]')).find(Boolean);
      openCollectionDialog(anchor, item === "Chapter" ? "chapter" : item === "Contract" ? "contract" : "collection");
      return;
    }
    if (item === "Acceptance test") {
      const plan = state.package.files.get("05-build-plan.md");
      if (typeof plan !== "string") throw new Error(CREATION_COPY.cannotAddNoPlan("acceptance test"));
      const numbers = [...plan.matchAll(/^#{1,6}\s+AT-(\d+)\b/gim)].map(match => Number(match[1]));
      openFile("05-build-plan.md");
      editorSurface.openCreation(`AT-${Math.max(0, ...numbers) + 1}`);
      return;
    }
    if (item === "Rule") {
      const tuning = parsedObject("tuning.json");
      if (!tuning) throw new Error(CREATION_COPY.cannotAddNoTuning("rule"));
      const requestedKey = kebabName(String(requestedName ?? "").replace(/^rules\./, ""));
      const key = availableKey(tuning.rules, requestedKey || "new-rule");
      openFile("05-build-plan.md");
      editorSurface.openCreation(`rules.${key}`);
      return;
    }
    let promiseRequest;
    if (item === "Measured promise") {
      promiseRequest = requestedName && typeof requestedName === "object" ? requestedName : { name: requestedName };
      if (!promiseRequest.type) {
        const anchor = sourceElement ?? ui.outlineControls?.querySelector('[data-action="outline-menu"]')
          ?? ui.outline?.querySelector('[data-action="outline-menu"]') ?? rootElement;
        const type = await anchoredConfirmation({
          document,
          anchor,
          question: INSPECTOR_COPY.measuredPromiseTypeQuestion,
          actions: [
            { label: INSPECTOR_COPY.measuredPromiseColorChoice, value: "colors" },
            { label: INSPECTOR_COPY.measuredPromiseContrastChoice, value: "contrast" },
            { label: INSPECTOR_COPY.measuredPromiseTimingChoice, value: "timing" },
            { label: INSPECTOR_COPY.cancel, value: undefined }
          ],
          datasetKey: "measuredPromiseType"
        });
        if (!type) return false;
        promiseRequest = { ...promiseRequest, type };
      }
    }
    if (!["Value", "Clock", "Mood", "Palette", "Pillar", "Measured promise", "Question"].includes(item)) return false;
    const promiseAction = item === "Measured promise"
      ? measuredPromiseCreation(state.package.files, promiseRequest.type, promiseRequest.name)
      : undefined;
    const transaction = editController.begin(CREATION_COPY.createNamed(item));
    let selected;
    const insert = (path, pointer, key, value) => transaction.json(path).insert(pointer, key, value);
    const insertRoot = (path, key, value) => insert(path, "", key, value);

    if (item === "Measured promise") {
      if (typeof promiseAction.create === "string") transaction.file(promiseAction.target).create(promiseAction.create);
      else for (const operation of promiseAction.operations()) {
        if (operation.type !== "insert") throw new Error(CREATION_COPY.unsupportedOperation(operation.type));
        transaction.json(promiseAction.target).insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
      }
      selected = promiseAction.selected;
    } else if (item === "Value") {
      const tuning = parsedObject("tuning.json");
      const requestedKey = String(requestedName ?? "").split(".").map(kebabName).filter(Boolean).join(".");
      const key = availableKey(tuning?.values, requestedKey || "new.tuning_key");
      if (!tuning) transaction.file("tuning.json").create(`${JSON.stringify({ values: { [key]: 0 } }, null, 2)}\n`);
      else if (tuning.values && !Array.isArray(tuning.values) && typeof tuning.values === "object") insert("tuning.json", "/values", key, 0);
      else if (tuning.values === undefined) insertRoot("tuning.json", "values", { [key]: 0 });
      else throw new Error(CREATION_COPY.outlineErrors.tuningObject);
      selected = { kind: "value", name: key, file: "tuning.json" };
    } else if (item === "Clock") {
      const clocks = parsedObject("clocks.json");
      const requestedKey = kebabName(String(requestedName ?? "").replace(/^clocks\./u, ""));
      const key = availableKey(clocks, requestedKey || "new-clock");
      const action = classifyCreation(`clocks.${key}`, {
        files: state.package.files,
        folders: state.package.folders,
        manifest: state.authoringView?.manifest,
        openPath: state.openPath
      }).actions[0];
      if (!action) throw new Error(CREATION_COPY.cannotCreateHere(`clocks.${key}`));
      if (typeof action.create === "string") transaction.file(action.target).create(action.create);
      else for (const operation of action.operations()) {
        if (operation.type !== "insert") throw new Error(CREATION_COPY.unsupportedOperation(operation.type));
        transaction.json(action.target).insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
      }
      selected = action.selected;
    } else if (item === "Mood") {
      const direction = parsedObject("direction.json");
      if (!direction && state.package.files.has("direction.json")) throw new Error(CREATION_COPY.outlineErrors.moodDirection);
      if (direction?.mood !== undefined && (!direction.mood || Array.isArray(direction.mood) || typeof direction.mood !== "object")) throw new Error(CREATION_COPY.outlineErrors.moodsObject);
      const requestedId = kebabName(String(requestedName ?? "").replace(/^mood\./, ""));
      const id = availableKey(direction?.mood, requestedId || "new-mood");
      const stub = { intent: "Describe the intended mood.", anti: ["Not yet specified."] };
      if (!direction) transaction.file("direction.json").create(`${JSON.stringify({ mood: { [id]: stub } }, null, 2)}\n`);
      else if (direction.mood === undefined) insertRoot("direction.json", "mood", { [id]: stub });
      else insert("direction.json", "/mood", id, stub);
      selected = { kind: "mood", name: `mood.${id}`, file: "direction.json" };
    } else if (item === "Palette") {
      const direction = parsedObject("direction.json");
      if (!direction && state.package.files.has("direction.json")) throw new Error(CREATION_COPY.outlineErrors.paletteDirection);
      if (direction?.palette !== undefined && (!direction.palette || Array.isArray(direction.palette) || typeof direction.palette !== "object")) throw new Error(CREATION_COPY.outlineErrors.paletteObject);
      const requestedKey = String(requestedName ?? "").replace(/^palette\./, "")
        .split(".").map(kebabName).filter(Boolean).join(".");
      const key = availableKey(direction?.palette, requestedKey || "new-palette");
      const stub = [{ "new-color": "#000000" }];
      if (!direction) transaction.file("direction.json").create(`${JSON.stringify({ palette: { [key]: stub } }, null, 2)}\n`);
      else if (direction.palette === undefined) insertRoot("direction.json", "palette", { [key]: stub });
      else insert("direction.json", "/palette", key, stub);
      selected = { kind: "palette", name: `palette.${key}`, file: "direction.json" };
    } else if (item === "Pillar") {
      const direction = parsedObject("direction.json");
      let pillar;
      if (!direction) {
        pillar = "new-pillar";
        transaction.file("direction.json").create(`${JSON.stringify({
          pillars: { [pillar]: "Describe this design pillar." }
        }, null, 2)}\n`);
      } else {
        if (direction.pillars !== undefined && (!direction.pillars || Array.isArray(direction.pillars) || typeof direction.pillars !== "object")) throw new Error(CREATION_COPY.outlineErrors.pillarsObject);
        pillar = availableKey(direction.pillars, "new-pillar");
        if (direction.pillars === undefined) insertRoot("direction.json", "pillars", { [pillar]: "Describe this design pillar." });
        else insert("direction.json", "/pillars", pillar, "Describe this design pillar.");
      }
      selected = { kind: "pillars", name: `pillars.${pillar}`, file: "direction.json" };
    } else if (item === "Question") {
      const action = questionCreation(state.package.files, requestedName);
      if (typeof action.create === "string") transaction.file(action.target).create(action.create);
      else for (const operation of action.operations()) {
        transaction.json(action.target).insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
      }
      selected = action.selected;
    }

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
    selectionBus.select({ kind: entry.kind, name: entry.name, file: entry.file, range: entry.range },
      { origin: { surface: "sidebar" } });
    outlineView.invalidate();
    renderOutline();
  }

  async function acceptLinkOffer(artifact, offered) {
    const offer = linkOffers(state.package.files).find(candidate => candidate.drawer === offered.drawer && candidate.field === offered.field);
    if (!offer || offer.refused) return;
    const definition = offer.definition ?? { type: "link", to: offer.to, ...(offer.many ? { many: true } : {}) };
    const transaction = editController.begin(WIDGET_COPY.describeLinkUndo(offer.field));
    const label = parsedObject(offer.path);
    if (!label) transaction.file(offer.path).create(`${JSON.stringify({ record: offer.record ?? { [offer.field]: definition } }, null, 2)}\n`);
    else if (label.record === undefined) transaction.json(offer.path).insert("", "record", { [offer.field]: definition });
    else if (label.record && !Array.isArray(label.record) && typeof label.record === "object") transaction.json(offer.path).insert("/record", offer.field, definition);
    else throw new Error(WIDGET_COPY.jsonObjectRequired(offer.path));
    try { await validateStagedTransaction(transaction); }
    catch (error) { transaction.abort(); throw error; }
    await applyEdit(() => transaction.commit());
    analyzeNow();
    validationChanged();
    renderAll();
    const selected = authoringEntries().find(entry => entry.kind === "collection" && entry.name === artifact.name);
    if (selected) {
      state.outlineSelection = selected.identity;
      selectionBus.select({ kind: selected.kind, name: selected.name, file: selected.location.replace(/\/$/, ""),
        range: selected.range, extent: selected.extent }, { origin: { surface: "sidebar" } });
      outlineView.invalidate();
      renderOutline();
    }
  }

  function renderStatus() {
    const anchors = ui.textarea.hidden || !editorSurface ? [] : editorSurface.anchors();
    const count = classification => anchors.filter(anchor => anchor.classification === classification).length;
    const tally = (kind, total) => `<span class="${total ? `opengdd-author-status-${kind}` : ""}">${WIDGET_COPY.classifiedCount(total, kind)}</span>`;
    const validation = state.validation.run
      ? tally("errors", state.validation.run.summary.errors) + tally("warnings", state.validation.run.summary.warnings)
      : `<span>${state.validation.status === "pending" ? WIDGET_COPY.validationPending : WIDGET_COPY.validationUnavailableStatus}</span>`;
    const outlineAnnouncement = `<span class="opengdd-author-sr-only" data-outline-status>${escapeHtml(state.outlineAnnouncement)}</span>`;
    if (!capabilities.workbenchLabels) {
      ui.status.innerHTML = `<span>${escapeHtml(state.package.title)}</span><span>${WIDGET_COPY.fileCount(state.package.files.size)}</span><span>${WIDGET_COPY.nameCount(state.authoringView?.nameCount ?? 0)}</span><span class="opengdd-author-status-known">${WIDGET_COPY.classifiedCount(count("known"), "known")}</span><span class="opengdd-author-status-unknown">${WIDGET_COPY.classifiedCount(count("unknown"), "unknown")}</span><span class="opengdd-author-status-ambiguous">${WIDGET_COPY.classifiedCount(count("ambiguous"), "ambiguous")}</span>${validation}${outlineAnnouncement}`;
      return;
    }
    const coreSummary = state.validation.run?.summary;
    const summary = coreSummary ? { ...coreSummary, warnings: coreSummary.warnings + validationService.current().advice.length } : undefined;
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
    ui.status.innerHTML = `<button type="button" data-outline-problems>${WORKBENCH_COPY.errors(errors)}</button><button type="button" data-outline-problems>${WORKBENCH_COPY.warnings(warnings)}</button><span>${WORKBENCH_COPY.words(words)}</span><span>${WORKBENCH_COPY.declarations(declarations)}</span><span>${workerActive ? WORKBENCH_COPY.checkingInWorker : WORKBENCH_COPY.checkingOnPage}</span><span>${WORKBENCH_COPY.validationStatus(validationState)}</span><span>${escapeHtml(state.saveStatus)}</span>${outlineAnnouncement}`;
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

  function confirmExplorerReferenceRename(plan) {
    return new Promise(resolve => {
      ui.treeForm.parentElement?.querySelector?.("[data-reference-rename-confirmation]")?.remove();
      const box = document.createElement("section");
      box.dataset.referenceRenameConfirmation = "";
      box.className = "opengdd-author-confirmation";
      box.setAttribute("role", "dialog");
      const question = document.createElement("p");
      // Backticked names render as code, as the outline's confirmation does.
      String(plan.reason ?? "").split("`").forEach((part, index) => {
        if (!part) return;
        if (index % 2) { const code = document.createElement("code"); code.textContent = part; question.append(code); }
        else question.append(part);
      });
      const rename = document.createElement("button");
      rename.type = "button";
      rename.textContent = plan.family === "contract" ? CONTRACT_COPY.renameButton : COLLECTION_COPY.rename;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = COLLECTION_COPY.cancel;
      const settle = value => { box.remove(); resolve(value); };
      on(rename, "click", () => settle(true));
      on(cancel, "click", () => settle(false));
      box.append(question, rename, cancel);
      ui.treeForm.after(box);
      rename.focus();
    });
  }

  async function renameCollectionReference(type, from, to) {
    const record = type === "file" ? /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(from) : undefined;
    const collection = type === "folder" ? /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(from) : undefined;
    if (!record && !collection) return false;
    const recordTarget = record ? /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(to) : undefined;
    const collectionTarget = collection ? /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(to) : undefined;
    // Only a record filename changing inside its current collection, or a
    // collection name changing directly under collections/, is a reference
    // rename. Every other explorer target keeps the ordinary move behavior.
    if (record && (!recordTarget || recordTarget[1] !== record[1])) return false;
    if (collection && !collectionTarget) return false;
    const next = record ? recordTarget[2] : collectionTarget[1];
    const name = record ? `collections.${record[1]}.${record[2]}` : `collections.${collection[1]}`;
    const plan = referencesService.planRename(name, next ?? "");
    if (plan.safety === "refused") { report(plan.reason, true); return true; }
    if (!await confirmExplorerReferenceRename(plan)) {
      ui.treeForm.hidden = true;
      return true;
    }
    const result = await referencesService.applyRename(plan);
    if (!result.applied) { report(result.reason, true); return true; }
    if (type === "file" && state.openPath === from) state.openPath = to;
    else if (type === "folder" && state.openPath.startsWith(`${from}/`)) state.openPath = `${to}${state.openPath.slice(from.length)}`;
    state.selected = { type, path: to };
    ui.treeForm.hidden = true;
    analyzeNow();
    renderAll();
    validationChanged();
    return true;
  }

  async function renameContractReference(type, from, to) {
    if (type === "file" && /^contracts\/[^/]+\.pack\.json$/.test(from)) {
      report(CONTRACT_COPY.packRenameRefused, true);
      return true;
    }
    const adoption = type === "file" && /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(from);
    if (!adoption || from.endsWith(".pack.json")) return false;
    const target = /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(to);
    if (!target) {
      report(CONTRACT_COPY.moveRefused, true);
      return true;
    }
    if (from === to) {
      ui.treeForm.hidden = true;
      return true;
    }
    const plan = referencesService.planRename(`contracts.${adoption[1]}`, target[1]);
    if (plan.safety === "refused") { report(plan.reason, true); return true; }
    if (!await confirmExplorerReferenceRename(plan)) {
      ui.treeForm.hidden = true;
      return true;
    }
    const result = await referencesService.applyRename(plan);
    if (!result.applied) { report(result.reason, true); return true; }
    if (state.openPath === from) state.openPath = to;
    state.selected = { type, path: to };
    ui.treeForm.hidden = true;
    analyzeNow(); renderAll(); validationChanged();
    return true;
  }

  async function dropCollectionReference(type, from, to) {
    const record = type === "file" && /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(from);
    const collection = type === "folder" && /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(from);
    if (!record && !collection) return false;
    if (from === to) return true;
    if (record) {
      const target = /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(to);
      if (target?.[1] === record[1]) return renameCollectionReference(type, from, to);
      report(COLLECTION_COPY.recordMoveRefused, true);
      return true;
    }
    if (/^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.test(to)) return renameCollectionReference(type, from, to);
    report(COLLECTION_COPY.collectionMoveRefused, true);
    return true;
  }

  async function dropContractReference(type, from, to) {
    if (!(type === "file" && /^contracts\/[^/]+\.json$/.test(from))) return false;
    return renameContractReference(type, from, to);
  }

  async function deleteTreeSelection(confirmedPath = "") {
    const selected = confirmedPath ? { type: "file", path: confirmedPath } : state.selected;
    if (!selected) return false;
    const { type, path } = selected;
    if (confirmedPath && !state.package.files.has(path)) return false;
    const contract = type === "file" && !path.endsWith(".pack.json")
      ? /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(path) : null;
    if (contract && capabilities.protectedFiles && confirmedPath !== path) {
      const sites = referencesService.usages(`contracts.${contract[1]}`);
      const prose = sites.filter(site => site.channel === "prose").length;
      let adoption;
      try { adoption = JSON.parse(state.package.files.get(path)); } catch {}
      const pack = adoption && state.package.files.has(`contracts/${adoption.contract}-${adoption.version}.pack.json`)
        && ![...state.package.files].some(([candidate, text]) => {
          if (candidate === path || !/^contracts\/[^/]+\.json$/.test(candidate) || candidate.endsWith(".pack.json")) return false;
          try {
            const other = JSON.parse(text);
            return other.contract === adoption.contract && other.version === adoption.version;
          } catch { return false; }
        }) ? `${adoption.contract}-${adoption.version}.pack.json` : "";
      const question = CONTRACT_COPY.remove(contract[1], prose, pack);
      protectedDeletePath = path;
      packageConfirmReturnFocus = document.activeElement;
      ui.packageConfirm.setAttribute("aria-label", question.replaceAll("`", ""));
      ui.packageConfirm.hidden = false;
      ui.packageConfirm.innerHTML = `<p>${inlineCodeHtml(question)}</p><div class="opengdd-author-draft-confirm-actions"><button type="button" data-action="protected-delete-confirm-yes">${WIDGET_COPY.yesDelete}</button><button type="button" data-action="protected-delete-confirm-no">${WIDGET_COPY.cancel}</button></div>`;
      ui.packageConfirm.querySelector('[data-action="protected-delete-confirm-no"]').focus();
      return false;
    }
    const protectedFile = capabilities.protectedFiles && type === "file" && PROTECTED_PACKAGE_FILES.has(path);
    if (protectedFile && !OPTIONAL_MECHANISM_FILES.has(path)) {
      report(WIDGET_COPY.protectedDelete(path));
      return false;
    }
    if (protectedFile && confirmedPath !== path) {
      protectedDeletePath = path;
      packageConfirmReturnFocus = document.activeElement;
      ui.packageConfirm.setAttribute("aria-label", WIDGET_COPY.deleteQuestion(path));
      ui.packageConfirm.hidden = false;
      ui.packageConfirm.innerHTML = `<p>${escapeHtml(WIDGET_COPY.protectedDeleteConfirm[path])}</p><div class="opengdd-author-draft-confirm-actions"><button type="button" data-action="protected-delete-confirm-yes">${WIDGET_COPY.yesDelete}</button><button type="button" data-action="protected-delete-confirm-no">${WIDGET_COPY.cancel}</button></div>`;
      ui.packageConfirm.querySelector('[data-action="protected-delete-confirm-no"]').focus();
      return false;
    }
    const transaction = editController.begin(contract ? CONTRACT_COPY.undo.remove : WIDGET_COPY.deletePathAction(path));
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
      if (await renameContractReference(state.selected.type, state.selected.path, path)) return;
      if (await renameCollectionReference(state.selected.type, state.selected.path, path)) return;
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
    // Package confirmation handlers update the session first; its synchronous
    // cancellation delivery clears that pinned target before this DOM-only hide
    // restores focus to the control that opened either confirmation.
    ui.packageConfirm.hidden = true;
    ui.packageConfirm.replaceChildren();
    const returnFocus = packageConfirmReturnFocus;
    packageConfirmReturnFocus = null;
    protectedDeletePath = "";
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
    // With nothing open the select must not claim the first listed package as
    // the open one; a disabled placeholder holds the slot until one opens.
    const listed = entries.some(item => item.id === preferredId);
    const placeholder = entries.length && !listed ? `<option value="" disabled>${WIDGET_COPY.choosePackage}</option>` : "";
    ui.packageSelect.innerHTML = entries.length
      ? placeholder + entries.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")
      : `<option value="">${WIDGET_COPY.noPackages}</option>`;
    ui.packageSelect.disabled = !entries.length;
    const selected = listed ? preferredId : "";
    ui.packageSelect.value = selected;
    const coldPackage = ui.coldStart?.querySelector('[data-action="cold-package"]');
    if (coldPackage) {
      const preferred = state.builtins.find(item => item.id === host.defaultPackageId) ?? state.builtins[0];
      coldPackage.textContent = WORKBENCH_COPY.coldPackage(preferred?.title);
      coldPackage.disabled = !preferred;
    }
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
    // Only a click the outline owns may wait on it: awaiting for every click
    // would land the explorer, export, and dialog handlers one microtask late.
    if (outlineView.owns(event.target)) {
      try { if (await outlineView.handleClick(event)) return; }
      catch (error) { report(error.message, true); return; }
    }
    const finding = event.target.closest("[data-finding]");
    if (finding) {
      dismissPersistentNotice();
      safelyOpenFinding(Number(finding.dataset.finding));
      return;
    }
    const treeItem = event.target.closest("[data-tree-type]");
    if (treeItem) {
      dismissPersistentNotice();
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
      if (action === "widget-outline") openWidgetDrawer("outline");
      else if (action === "widget-inspector") openWidgetDrawer("inspector");
      else if (action === "migration-preview") await previewMigration();
      else if (action === "migration-apply") await applyMigration();
      else if (action === "migration-not-now") {
        state.migration = { ...state.migration, status: "idle", report: null, changes: [], notice: null };
        renderDiagnostics();
      } else if (action === "migration-dismiss-no-op") {
        state.migration = { ...state.migration, status: "idle", report: null, changes: [], hiddenNoOp: true, notice: null };
        renderDiagnostics();
      } else if (action === "migration-dismiss-manual") {
        state.migration = { ...state.migration, manualAfter: null };
        renderDiagnostics();
      }
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
      } else if (action === "protected-delete-confirm-yes" && protectedDeletePath) {
        const path = protectedDeletePath;
        hidePackageConfirmation();
        await deleteTreeSelection(path);
      } else if (action === "protected-delete-confirm-no") {
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
      } else if (action === "cold-package") {
        dismissPersistentNotice();
        await builtinDiscovery;
        if (builtinDiscoveryError) throw new Error(WIDGET_COPY.exampleUnavailable(builtinDiscoveryError.message));
        const packageId = host.defaultPackageId ?? state.builtins[0]?.id;
        if (!packageId) throw new Error(WIDGET_COPY.exampleUnavailable(WIDGET_COPY.noPackages));
        try { await packageSession.open(packageId); }
        catch (error) { throw new Error(WIDGET_COPY.exampleUnavailable(error.message)); }
      }
      else if (action === "tree-cancel") ui.treeForm.hidden = true;
      else if (action === "package-cancel") ui.packageForm.hidden = true;
    } catch (error) { report(error.message, true); }
  }

  on(rootElement, "click", handleClick);
  for (const element of regionalElements) on(element, "click", handleClick);
  const handleInspectorEscape = event => {
    if (event.defaultPrevented || event.key !== "Escape" || !state.outlineInspectorReturn || !ui.panelInspector.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const focusKey = state.outlineInspectorReturn;
    state.outlineInspectorReturn = "";
    if (widgetDrawer) openWidgetDrawer("outline");
    else host.returnToOutlineFromInspector?.();
    view.queueMicrotask(() => outlineView.focusKey(focusKey));
  };
  on(rootElement, "keydown", handleInspectorEscape);
  for (const element of regionalElements) on(element, "keydown", handleInspectorEscape);
  if (widgetDrawer) {
    on(rootElement, "keydown", event => {
      if (event.defaultPrevented || event.key !== "Escape" || !widgetDrawer.open) return;
      event.preventDefault();
      event.stopPropagation();
      closeWidgetDrawer(true);
    });
  }
  if (ui.outline) {
    on(ui.outline, "keydown", event => outlineView.handleKeydown(event));
  }
  if (ui.outlineControls) {
    on(ui.outlineControls, "keydown", event => outlineView.handleKeydown(event));
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
    if (event.key === "Escape" && (state.pendingDelete || protectedDeletePath)) {
      event.preventDefault();
      if (state.pendingDelete) packageSession.deleteDraft({ cancel: true });
      hidePackageConfirmation(true);
    }
  });

  on(ui.packageSelect, "change", async () => {
    // Captured before anything runs: cancelling a pending delete publishes,
    // and that render re-syncs the select to the still-open package.
    const selected = ui.packageSelect.value;
    dismissPersistentNotice();
    packageSession.deleteDraft({ cancel: true });
    hidePackageConfirmation();
    // A built-in may already have a local draft, making its open path fully
    // synchronous. Commit the visible editor first so that fast path cannot
    // detach the old controller before its last input reaches draft storage.
    await proseCommitQueue;
    if (destroyed) return;
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
    try {
      if (!await dropContractReference(state.dragged.type, state.dragged.path, destination)
        && !await dropCollectionReference(state.dragged.type, state.dragged.path, destination)) {
        await movePath(state.dragged.type, state.dragged.path, destination);
      }
    }
    catch (error) { report(error.message, true); }
    state.dragged = null;
  });

  const preparedEditor = preparedStartingPoints?.length ? mountPreparedContracts({
    root: rootElement, recipes: preparedStartingPoints,
    snapshot: () => new Map(state.package.files), internal: contractPanelInternal,
    revision: () => packageService.packageRevision,
    subscribe: listener => packageService.subscribe(listener),
    packageInfo: () => ({id:state.package.id,title:state.package.title}),
    previewReady: () => !destroyed && !composingProse && (ui.textarea.hidden
      || typeof state.package.files.get(state.openPath) !== 'string'
      || ui.textarea.value === state.package.files.get(state.openPath)),
    undo: () => applyEdit(() => editController.undo()).then(() => { analyzeNow(); renderAll(); validationChanged(); })
  }) : undefined;
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
        await builtinDiscovery;
        if (destroyed || revision !== state.revision) return;
        const preferredId = host.defaultPackageId ?? state.builtins[0]?.id;
        const availableIds = new Set([...state.builtins, ...state.drafts].map(item => item.id));
        const selected = availableIds.has(preferredId) ? preferredId : state.drafts[0].id;
        renderPackageOptions(selected);
        try { await packageSession.open(selected); }
        catch (error) { report(WIDGET_COPY.selectedPackageOpenFailure(error.message), true); return; }
        await offerInitialContract();
        return;
      }
      // A first visit with no draft opens the example: the first screen is the
      // tool at work, not a choice. The two choices remain the fallback for an
      // example that cannot be listed or loaded (ruled 2026-09-03).
      await builtinDiscovery;
      if (destroyed || revision !== state.revision) return;
      const exampleId = host.defaultPackageId ?? state.builtins[0]?.id;
      let exampleFailure = builtinDiscoveryError;
      if (!exampleFailure && exampleId && state.builtins.some(item => item.id === exampleId)) {
        renderPackageOptions(exampleId);
        try {
          await packageSession.open(exampleId);
          await offerInitialContract();
          return;
        } catch (error) {
          if (destroyed) return;
          exampleFailure = error;
        }
      }
      packageSession.open({ id: "", title: WIDGET_COPY.noPackageSelected, files: [] });
      state.coldStart = true;
      ui.coldStart.hidden = false;
      ui.editorPanel.hidden = true;
      ui.fileHeading.hidden = true;
      renderPackageOptions("");
      renderStatus();
      if (exampleFailure) report(WIDGET_COPY.exampleUnavailable(exampleFailure.message), true);
      else report(WORKBENCH_COPY.chooseHowToBegin);
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
      catch (error) { report(WIDGET_COPY.selectedPackageOpenFailure(error.message), true); return; }
      await offerInitialContract();
    } else {
      packageSession.open({ id: "", title: WIDGET_COPY.noPackageSelected, files: [] });
      report(WIDGET_COPY.createOrImport);
    }
  })();

  return {
    openPackage: packageSession.open,
    references: referencesService,
    selection: Object.freeze({
      current: selectionBus.current,
      subscribe: selectionBus.subscribe
    }),
    inspectorMatches(selection) {
      return !destroyed && panelHost.inspectorMatches(selection);
    },
    testHooks: Object.freeze({
      analysisView() { return state.authoringView; },
      // The harness reaches records and contract values the outline no longer
      // lists; the same door a panel uses, never a public selection writer.
      select(selection) { if (!destroyed) selectionBus.select(selection, { origin: { surface: "sidebar" } }); },
      // Prepared reviews and hosts share the same package history path.
      undo() { return destroyed ? undefined : takeHistory("undo"); },
      canUndo() { return !destroyed && editController.history.canUndo; },
      editorRevision(path = state.openPath) { return editController.revision(path); },
      packageFiles() { return copyPackageFiles(state.package.files); },
      validationStatus() { return state.validation.status; },
      panelDescriptors() { return panelHost.descriptors(); },
      createFromOutline(item) { return destroyed ? false : createFromOutline(item); },
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
      preparedEditor?.destroy();
      panelHost.destroy();
      panelPackageCancel();
      packageSession.close();
      analysisSession.destroy();
      editorSurface.destroy();
      outlineView.destroy();
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
