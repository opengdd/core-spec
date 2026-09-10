import { mountAuthoringTool } from "../tool.mjs";
import { loadConformanceSchemas, requestJson } from "../loaders.mjs";
import { SUPPORTED_OPENGDD_VERSION } from "../package.mjs";
import { WORKBENCH_COPY } from "../copy/workbench-copy.mjs";
import { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";

const THEME_KEY = "opengdd-workbench-theme";
const LAYOUT_KEY = "opengdd-workbench-layout";
const STORAGE_KEY = "opengdd-workbench-storage-protected";
const LAYOUT_VERSION = 2;
const COLUMN_ORDER = ["explorer", "outline"];
const SIDE_COLUMNS = ["explorer", "outline"];
const COLLAPSIBLE_REGIONS = [...SIDE_COLUMNS, "inspector"];
const DEFAULT_WIDTHS = { explorer: 256, outline: 384 };
const WIDE_BREAKPOINT_REM = 64;
const INSPECTOR_FLOOR_REM = 14;
const EDITOR_FLOOR_REM = 8;
const SHEET_AUTO_OPEN_SURFACES = new Set(["sidebar", "panel"]);
const DEFAULT_EXAMPLES = Object.freeze([
  Object.freeze({ id: "tic-tac-toe", title: "Tic-Tac-Toe", revision: "opengdd-0.8" })
]);

function readLocal(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function readLayout() {
  try {
    const value = JSON.parse(readLocal(LAYOUT_KEY, "{}"));
    const inspectorHeight = Number(value.inspectorHeight);
    const savedWidth = name => Number.isFinite(Number(value.widths?.[name])) ? Number(value.widths[name]) : null;
    const outlineWidth = savedWidth("outline");
    return {
      layoutVersion: LAYOUT_VERSION,
      widths: {
        explorer: savedWidth("explorer") ?? DEFAULT_WIDTHS.explorer,
        outline: outlineWidth === null ? DEFAULT_WIDTHS.outline
          : Number(value.layoutVersion) >= LAYOUT_VERSION ? outlineWidth : outlineWidth * 1.5
      },
      inspectorHeight: Number.isFinite(inspectorHeight) && inspectorHeight > 0 ? inspectorHeight : null,
      userCollapsed: value.userCollapsed?.filter(name => COLLAPSIBLE_REGIONS.includes(name)) ?? [],
      fitCollapsed: value.fitCollapsed?.filter(name => SIDE_COLUMNS.includes(name)) ?? [],
      outlineFolds: (Array.isArray(value.outlineFolds) ? value.outlineFolds : value.collectionCollapsed)
        ?.filter(name => typeof name === "string") ?? []
    };
  } catch {
    return { layoutVersion: LAYOUT_VERSION, widths: { ...DEFAULT_WIDTHS }, inspectorHeight: null, userCollapsed: [], fitCollapsed: [], outlineFolds: [] };
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.workbenchTheme = theme.toLowerCase();
  root.style.colorScheme = theme === WORKBENCH_COPY.themes[2] ? "light dark" : theme.toLowerCase();
  root.classList.toggle("opengdd-author-theme--light", theme === WORKBENCH_COPY.themes[0]);
  root.classList.toggle("opengdd-author-theme--dark", theme === WORKBENCH_COPY.themes[1]);
  for (const name of [...root.style]) {
    if (name.startsWith("--opengdd-author-")) root.style.removeProperty(name);
  }
  writeLocal(THEME_KEY, theme);
}

function panelMarkup(name, label, title, action) {
  return `
    <section class="opengdd-workbench-panel opengdd-workbench-panel--${name}" data-panel="${name}" aria-label="${label}">
      <header class="opengdd-workbench-panel-header">
        <div class="opengdd-workbench-panel-heading"><h2>${label}</h2><div class="opengdd-workbench-panel-header-content" data-author-header-region="${name}"></div></div>
        ${name === "prose" ? "" : `<button type="button" class="opengdd-workbench-collapse" data-collapse="${name}" aria-label="${WORKBENCH_COPY.collapsePanel(label)}"></button>`}
      </header>
      ${["explorer", "prose", "outline", "inspector"].includes(name) ? `<div class="opengdd-workbench-author-region" data-author-region="${name}"></div>${name === "explorer" ? '<div class="opengdd-workbench-author-context" data-author-region="context"><div class="opengdd-workbench-panel-sidebar" data-panel-sidebar></div></div>' : ""}` : `<div class="opengdd-workbench-empty">
        <p><strong>${title}</strong></p>
        <button type="button" disabled>${action}</button>
      </div>`}
    </section>`;
}

function shellMarkup(showTheme) {
  return `
    <div class="opengdd-workbench-supported">
      <header class="opengdd-workbench-header" tabindex="0">
        <div class="opengdd-workbench-author-root" data-author-root></div>
        <div class="opengdd-workbench-tools-info">
          <div class="opengdd-workbench-drawer-buttons" aria-label="${WORKBENCH_COPY.collapsedColumns}">
            <button type="button" data-open="explorer" hidden>${WORKBENCH_COPY.openExplorer}</button>
            <button type="button" data-open="outline" hidden>${WORKBENCH_COPY.openOutline}</button>
            <button type="button" data-open="inspector" hidden>${WORKBENCH_COPY.openInspector}</button>
          </div>
          <aside class="opengdd-workbench-storage-notice" hidden>
            <span>${WORKBENCH_COPY.persistenceDenied}</span>
          </aside>
          <aside class="opengdd-workbench-undo" data-author-region="undo"></aside>
        </div>
        ${showTheme ? `<fieldset class="opengdd-workbench-theme">
          <legend>${WORKBENCH_COPY.theme}</legend>
          ${WORKBENCH_COPY.themes.map(theme => `<label><input type="radio" name="workbench-theme" value="${theme}"> ${theme}</label>`).join("")}
        </fieldset>` : ""}
      </header>
      <div class="opengdd-workbench-grid">
        ${panelMarkup("explorer", WORKBENCH_COPY.explorer, WORKBENCH_COPY.noPackageFiles, WORKBENCH_COPY.createMinimalPackage)}
        <div class="opengdd-workbench-resizer" data-resize="explorer" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.explorer)}" aria-orientation="vertical" tabindex="0"></div>
        <section id="workbench-prose" class="opengdd-workbench-panel opengdd-workbench-panel--prose" data-panel="prose" aria-label="${WORKBENCH_COPY.prose}" tabindex="0">
          <header class="opengdd-workbench-panel-header"><div class="opengdd-workbench-panel-heading"><h2>${WORKBENCH_COPY.prose}</h2><div class="opengdd-workbench-panel-header-content" data-author-header-region="prose"></div></div></header>
          <div class="opengdd-workbench-prose-content" data-prose-content>
            <div class="opengdd-workbench-prose-editor"><div class="opengdd-workbench-author-region" data-author-region="prose"></div></div>
            <section class="opengdd-workbench-inspector-band" data-inspector-band aria-label="${WORKBENCH_COPY.inspector}">
              <div class="opengdd-workbench-resizer opengdd-workbench-resizer--horizontal" data-resize="inspector" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.inspector)}" aria-orientation="horizontal" tabindex="0"></div>
              <header class="opengdd-workbench-panel-header opengdd-workbench-inspector-band-header" data-inspector-strip tabindex="-1">
                <div class="opengdd-workbench-panel-heading"><h2>${WORKBENCH_COPY.inspector}</h2><div class="opengdd-workbench-panel-header-content" data-author-header-region="inspector"></div></div>
                <button type="button" class="opengdd-workbench-collapse" data-collapse="inspector" aria-label="${WORKBENCH_COPY.collapsePanel(WORKBENCH_COPY.inspector)}"></button>
              </header>
        <div class="opengdd-workbench-author-region" data-author-region="inspector"></div>
            </section>
            <section class="opengdd-workbench-inspector-sheet" data-inspector-sheet aria-label="${WORKBENCH_COPY.inspector}" hidden>
              <header class="opengdd-workbench-panel-header opengdd-workbench-inspector-sheet-header">
                <button type="button" data-inspector-back>${WORKBENCH_COPY.backToText}</button>
                <h2>${WORKBENCH_COPY.inspector}</h2>
              </header>
            </section>
            <section class="opengdd-workbench-validation-band" data-validation-band>
              <div class="opengdd-workbench-author-region" data-author-region="validation"></div>
            </section>
          </div>
        </section>
        <div class="opengdd-workbench-resizer" data-resize="outline" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.outline)}" aria-orientation="vertical" tabindex="0"></div>
        ${panelMarkup("outline", WORKBENCH_COPY.outline, WORKBENCH_COPY.nothingDeclared, WORKBENCH_COPY.createIdentifier)}
      </div>
      <footer class="opengdd-workbench-status" aria-label="${WORKBENCH_COPY.packageStatus}" tabindex="0">
        <div class="opengdd-workbench-component-status" data-author-region="status">
          <span>${WORKBENCH_COPY.errorsPending}</span><span>${WORKBENCH_COPY.warningsPending}</span><span>${WORKBENCH_COPY.words(0)}</span><span>${WORKBENCH_COPY.declarations(0)}</span>
          <span>${WORKBENCH_COPY.checkingInWorker}</span><span>${WORKBENCH_COPY.validationStatus(WORKBENCH_COPY.validationChecking)}</span><span>${WORKBENCH_COPY.notSaved}</span>
        </div>
        <span data-storage-status>${WORKBENCH_COPY.storageStatus(WORKBENCH_COPY.storageMayBeCleared)}</span>
        <span class="opengdd-workbench-version">${WORKBENCH_COPY.version(AUTHORING_TOOL_VERSION, SUPPORTED_OPENGDD_VERSION)}</span>
      </footer>
    </div>
    <div class="opengdd-workbench-narrow">
      <h1>${WORKBENCH_COPY.narrowTitle}</h1>
      <p>${WORKBENCH_COPY.narrowAction}</p>
    </div>`;
}

export function mountWorkbenchShell(target, options = {}) {
  if (!(target instanceof Element)) throw new TypeError("A workbench host element is required");
  const {
    panels,
    preparedConventionsUrl,
    schemas,
    packages: suppliedPackages,
    examples: legacyExamples,
    listPackages: suppliedListPackages,
    loadPackage: suppliedLoadPackage,
    defaultPackageId,
    readerUrl: suppliedReaderUrl,
    initialContract,
    contractsCatalogueUrl,
    links = [],
    showTheme = true,
    ...unknownOptions
  } = options;
  const warnings = target.ownerDocument.defaultView?.console;
  for (const name of Object.keys(unknownOptions)) {
    warnings?.warn?.(`mountWorkbenchShell: ignoring unknown option "${name}"`);
  }
  if (legacyExamples !== undefined) {
    warnings?.warn?.('mountWorkbenchShell: "examples" is deprecated; use "packages".');
  }
  target.innerHTML = shellMarkup(showTheme);
  const anchor = (href, text, className) => {
    const link = target.ownerDocument.createElement("a");
    link.href = href;
    link.textContent = text;
    link.className = className;
    return link;
  };
  if (preparedConventionsUrl) {
    target.querySelector(".opengdd-workbench-tools-info")
      .prepend(anchor(preparedConventionsUrl, "Prepared game mechanics", "opengdd-workbench-conventions"));
  }
  target.querySelector(".opengdd-workbench-status")
    .append(...links.map(({ href, label }) => anchor(href, label, "opengdd-workbench-link")));

  const state = readLayout();
  function saveLayout() { writeLocal(LAYOUT_KEY, JSON.stringify(state)); }
  const grid = target.querySelector(".opengdd-workbench-grid");
  const proseContent = target.querySelector("[data-prose-content]");
  const proseEditor = target.querySelector(".opengdd-workbench-prose-editor");
  const inspectorBand = target.querySelector("[data-inspector-band]");
  const inspectorSheet = target.querySelector("[data-inspector-sheet]");
  const inspectorStrip = target.querySelector("[data-inspector-strip]");
  const inspectorCollapse = target.querySelector('[data-collapse="inspector"]');
  const inspectorBack = target.querySelector("[data-inspector-back]");
  const inspectorOpen = target.querySelector('[data-open="inspector"]');
  const inspectorResize = target.querySelector('[data-resize="inspector"]');
  const validationBand = target.querySelector("[data-validation-band]");
  const storageStatus = target.querySelector("[data-storage-status]");
  const storageNotice = target.querySelector(".opengdd-workbench-storage-notice");
  const regions = {
    explorer: target.querySelector('[data-author-region="explorer"]'),
    context: target.querySelector('[data-author-region="context"]'),
    prose: target.querySelector('[data-author-region="prose"]'),
    outline: target.querySelector('[data-author-region="outline"]'),
    inspector: target.querySelector('[data-author-region="inspector"]'),
    validation: target.querySelector('[data-author-region="validation"]'),
    status: target.querySelector('[data-author-region="status"]'),
    undo: target.querySelector('[data-author-region="undo"]'),
    proseHeader: target.querySelector('[data-author-header-region="prose"]'),
    outlineHeader: target.querySelector('[data-author-header-region="outline"]')
  };
  let authoring;
  let savedEditorState = null;
  let inspectorMode = "band";
  let validationCompact = false;
  let sheetOpen = false;
  let inspectorSelection = null;
  let bandHeaderRatio = 0;
  let bandHeaderHeight = 0;
  let bandHeight = 0;
  let drawer = null;
  let drawerButton = null;
  let inspectorObserver;
  let layoutObserver;
  let selectionCancel = () => {};

  const collapsed = name => state.userCollapsed.includes(name) || state.fitCollapsed.includes(name);
  const inspectorCollapsed = () => state.userCollapsed.includes("inspector");
  const rootSize = () => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const hasInspectorSelection = () => authoring?.inspectorMatches(inspectorSelection) ?? false;
  const selectionOpensSheet = selection => SHEET_AUTO_OPEN_SURFACES.has(selection?.origin?.surface);
  const saveEditorState = () => { savedEditorState = authoring?.editorState() ?? savedEditorState; };
  const restoreEditorState = () => authoring?.restoreEditorState(savedEditorState) ?? false;

  function measureBandHeader(currentRootSize = rootSize()) {
    const measured = inspectorStrip.getBoundingClientRect().height;
    if (measured > 0) bandHeaderRatio = measured / currentRootSize;
    bandHeaderHeight = (bandHeaderRatio || 2.7) * currentRootSize;
    inspectorBand.style.setProperty("--opengdd-workbench-inspector-header-height", `${bandHeaderHeight}px`);
    return bandHeaderHeight;
  }

  // The validation band's two heights, read from the stylesheet's properties
  // rather than the box: `open` is what it takes on its own, `row` its
  // summary row, the least it can be compacted to. Measuring the box would
  // make each inspector mode argue for the other forever, since the modes
  // themselves compact it.
  function validationHeights(currentRootSize) {
    const style = getComputedStyle(validationBand);
    const rem = name => Number.parseFloat(style.getPropertyValue(name)) * currentRootSize;
    return { open: rem("--opengdd-workbench-validation-height"), row: rem("--opengdd-workbench-validation-row") };
  }

  function inspectorLimits() {
    const currentRootSize = rootSize();
    const headerHeight = measureBandHeader(currentRootSize);
    return {
      floor: INSPECTOR_FLOOR_REM * currentRootSize + headerHeight,
      ceiling: proseContent.getBoundingClientRect().height - validationHeights(currentRootSize).row - EDITOR_FLOOR_REM * currentRootSize
    };
  }

  measureBandHeader();
  bandHeight = INSPECTOR_FLOOR_REM * rootSize() + bandHeaderHeight;

  function clearDrawer() {
    drawer = null;
    drawerButton = null;
  }

  function renderInspectorLayout() {
    const selectionPresent = hasInspectorSelection();
    const collapsedBand = inspectorMode === "band" && inspectorCollapsed();
    validationBand.classList.toggle("opengdd-workbench-validation-band--compact", inspectorMode === "sheet" || validationCompact);
    inspectorOpen.hidden = !(collapsedBand || (inspectorMode === "sheet" && !sheetOpen && selectionPresent));

    if (inspectorMode === "band") {
      sheetOpen = false;
      inspectorSheet.hidden = true;
      proseEditor.hidden = false;
      inspectorBand.hidden = false;
      if (regions.inspector.parentElement !== inspectorBand) inspectorBand.append(regions.inspector);
      inspectorBand.classList.toggle("opengdd-workbench-inspector-band--collapsed", collapsedBand);
      inspectorBand.style.height = collapsedBand ? "" : `${bandHeight}px`;
      inspectorResize.hidden = collapsedBand;
      inspectorStrip.tabIndex = collapsedBand ? 0 : -1;
      if (collapsedBand) {
        inspectorStrip.setAttribute("role", "button");
        inspectorStrip.setAttribute("aria-label", WORKBENCH_COPY.openInspector);
        inspectorStrip.setAttribute("aria-expanded", "false");
      } else {
        inspectorStrip.removeAttribute("role");
        inspectorStrip.removeAttribute("aria-label");
        inspectorStrip.removeAttribute("aria-expanded");
      }
      inspectorCollapse.hidden = collapsedBand;
      inspectorCollapse.setAttribute("aria-expanded", String(!collapsedBand));
      regions.inspector.hidden = collapsedBand;
      return;
    }

    inspectorBand.hidden = true;
    if (sheetOpen && selectionPresent) {
      proseEditor.hidden = true;
      inspectorSheet.hidden = false;
      if (regions.inspector.parentElement !== inspectorSheet) inspectorSheet.append(regions.inspector);
      regions.inspector.hidden = false;
    } else {
      sheetOpen = false;
      proseEditor.hidden = false;
      inspectorSheet.hidden = true;
      if (regions.inspector.parentElement !== inspectorBand) inspectorBand.append(regions.inspector);
      regions.inspector.hidden = true;
    }
  }

  function closeDrawer(returnFocus = false) {
    if (!drawer) return;
    const invokingButton = drawerButton;
    clearDrawer();
    renderLayout();
    if (returnFocus) invokingButton?.focus();
  }

  function openInspector() {
    if (inspectorMode === "band") {
      state.userCollapsed = state.userCollapsed.filter(name => name !== "inspector");
      renderInspectorLayout();
      saveLayout();
      target.querySelector('[data-collapse="inspector"]')?.focus();
      return;
    }
    if (!hasInspectorSelection()) return;
    saveEditorState();
    if (drawer) closeDrawer(false);
    sheetOpen = true;
    renderInspectorLayout();
    inspectorBack.focus();
  }

  function closeSheet(returnFocus = true) {
    if (inspectorMode !== "sheet" || !sheetOpen) return;
    sheetOpen = false;
    renderInspectorLayout();
    if (returnFocus && !restoreEditorState()) authoring.focusEditor();
  }

  function selectionChanged(selection) {
    inspectorSelection = selection;
    if (inspectorMode === "sheet") {
      if (!hasInspectorSelection()) {
        sheetOpen = false;
      // The sheet auto-opens only from the outline or an inspector panel.
      // Explorer navigation asks for the editor, just like prose selection.
      } else if (!sheetOpen && selectionOpensSheet(selection)) {
        saveEditorState();
        if (drawer) closeDrawer(false);
        sheetOpen = true;
      }
    }
    renderInspectorLayout();
  }

  const encodePath = value => value.split("/").map(encodeURIComponent).join("/");
  let schemaRequest;
  const packageRequests = new Map();
  const packages = suppliedPackages ?? legacyExamples ?? DEFAULT_EXAMPLES;
  const loadSchemas = () => schemaRequest ??= loadConformanceSchemas()
    .catch(error => { schemaRequest = undefined; throw error; });
  const loadExample = id => {
    if (suppliedListPackages === undefined && !packages.some(item => item.id === id)) throw new Error(`Unknown package: ${id}`);
    if (!packageRequests.has(id)) {
      const request = suppliedLoadPackage === undefined
        ? requestJson(`/api/authoring/package?package=${encodeURIComponent(id)}`)
        : suppliedLoadPackage(id);
      packageRequests.set(id, Promise.resolve(request)
        .catch(error => { packageRequests.delete(id); throw error; }));
    }
    return packageRequests.get(id);
  };
  const packageReaderUrl = suppliedReaderUrl === undefined
    ? (packagePath, file) => `/read/${encodePath(`${packagePath}${file}`)}`
    : suppliedReaderUrl;
  authoring = mountAuthoringTool(target.querySelector("[data-author-root]"), {
    schemas: schemas === undefined ? loadSchemas : schemas,
    defaultPackageId,
    initialContract,
    contractsCatalogueUrl,
    regions,
    capabilities: {
      protectedFiles: true,
      workbenchLabels: true,
      hostUndo: true,
      delete: true,
      coldStart: true
    },
    panels,
    outlineFolds: {
      collapsed: () => [...state.outlineFolds],
      setCollapsed: names => {
        state.outlineFolds = [...names];
        saveLayout();
      }
    },
    enterOutlineInspector: () => {
      if (inspectorMode === "band" && !inspectorCollapsed()) return;
      openInspector();
    },
    returnToOutlineFromInspector: () => {
      closeSheet(false);
      if (!collapsed("outline")) return;
      closeDrawer(false);
      drawer = "outline";
      drawerButton = target.querySelector('[data-open="outline"]');
      renderLayout();
    },
    listPackages() {
      return suppliedListPackages === undefined ? packages : suppliedListPackages();
    },
    loadPackage(id) {
      return loadExample(id);
    },
    readerUrl: packageReaderUrl
  });
  selectionCancel = authoring.selection.subscribe(selectionChanged);
  selectionChanged(authoring.selection.current());
  for (const type of ["focusin", "focusout", "select", "input", "keyup", "pointerup", "scroll"]) {
    target.addEventListener(type, saveEditorState, true);
  }
  const filterOutlineFromStatus = event => {
    if (event.target instanceof HTMLButtonElement) authoring.outlineProblemsOnly(true);
  };
  regions.status.addEventListener("click", filterOutlineFromStatus);

  const isWideMode = () => {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return target.querySelector(".opengdd-workbench-supported").getBoundingClientRect().width >= WIDE_BREAKPOINT_REM * rootSize;
  };
  let wideMode = isWideMode();

  function renderLayout() {
    const columns = [];
    for (const name of ["explorer", "prose", "outline"]) {
      const panel = target.querySelector(`[data-panel=${name}]`);
      const shownAsDrawer = !wideMode && drawer === name;
      const shown = name === "prose" || !collapsed(name) || shownAsDrawer;
      panel.hidden = !shown;
      panel.classList.toggle("opengdd-workbench-is-drawer", shownAsDrawer);
      if (!collapsed(name) && name !== "prose") {
        columns.push(name === "explorer" ? `${state.widths[name]}px 0.35rem` : `0.35rem ${state.widths[name]}px`);
      } else if (name === "prose") {
        columns.push(wideMode ? "minmax(0, 1fr)" : "minmax(38rem, 1fr)");
      }
      target.querySelector(`[data-open=${name}]`)?.toggleAttribute("hidden", !collapsed(name));
    }
    grid.dataset.layoutMode = wideMode ? "wide" : "narrow";
    grid.style.gridTemplateColumns = columns.join(" ");
    for (const handle of target.querySelectorAll('[data-resize]:not([data-resize="inspector"])')) {
      const name = handle.dataset.resize;
      handle.hidden = collapsed(name) || (!wideMode && drawer === name);
    }
    renderInspectorLayout();
  }

  function fitColumns() {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const available = grid.getBoundingClientRect().width;
    const userVisible = SIDE_COLUMNS.filter(name => !state.userCollapsed.includes(name));
    const next = [];
    if (!wideMode) {
      let required = 38 * rootSize + userVisible.reduce((sum, name) => sum + state.widths[name] + 6, 0);
      for (const name of COLUMN_ORDER) {
        if (required <= available) break;
        if (!userVisible.includes(name)) continue;
        next.push(name);
        required -= state.widths[name] + 6;
      }
    }
    if (next.join() !== state.fitCollapsed.join()) {
      state.fitCollapsed = next;
      if (drawer && !collapsed(drawer)) clearDrawer();
      renderLayout();
      saveLayout();
    }
  }

  function reconcileLayoutMode() {
    const nextWideMode = isWideMode();
    if (nextWideMode === wideMode) {
      fitColumns();
      return;
    }
    if (nextWideMode) {
      const openDrawer = drawer;
      for (const name of SIDE_COLUMNS) {
        if (collapsed(name) && name !== openDrawer && !state.userCollapsed.includes(name)) state.userCollapsed.push(name);
      }
      if (openDrawer) state.userCollapsed = state.userCollapsed.filter(name => name !== openDrawer);
      state.fitCollapsed = [];
      clearDrawer();
    } else {
      clearDrawer();
    }
    wideMode = nextWideMode;
    renderLayout();
    fitColumns();
    saveLayout();
  }

  if (showTheme) {
    const savedTheme = readLocal(THEME_KEY, WORKBENCH_COPY.themes[2]);
    const selectedTheme = WORKBENCH_COPY.themes.includes(savedTheme) ? savedTheme : WORKBENCH_COPY.themes[2];
    for (const input of target.querySelectorAll("[name=workbench-theme]")) {
      input.checked = input.value === selectedTheme;
      input.addEventListener("change", () => applyTheme(input.value));
    }
    applyTheme(selectedTheme);
  }

  for (const button of target.querySelectorAll("[data-open]")) {
    button.addEventListener("click", () => {
      if (button.dataset.open === "inspector") {
        openInspector();
        return;
      }
      if (wideMode) {
        const name = button.dataset.open;
        state.userCollapsed = state.userCollapsed.filter(column => column !== name);
        state.fitCollapsed = state.fitCollapsed.filter(column => column !== name);
        renderLayout();
        saveLayout();
        fitColumns();
        target.querySelector(`[data-collapse=${name}]`)?.focus();
        return;
      }
      closeDrawer();
      drawer = button.dataset.open;
      drawerButton = button;
      renderLayout();
      target.querySelector(`[data-collapse=${drawer}]`)?.focus();
    });
  }

  for (const button of target.querySelectorAll("[data-collapse]")) {
    button.addEventListener("click", () => {
      const name = button.dataset.collapse;
      if (name === "inspector") {
        if (!state.userCollapsed.includes(name)) state.userCollapsed.push(name);
        renderInspectorLayout();
        saveLayout();
        inspectorOpen.focus();
        return;
      }
      if (!state.userCollapsed.includes(name)) state.userCollapsed.push(name);
      closeDrawer();
      renderLayout();
      saveLayout();
      target.querySelector(`[data-open=${name}]`)?.focus();
      fitColumns();
    });
  }

  inspectorStrip.addEventListener("click", event => {
    if (!inspectorCollapsed() || event.target.closest("button")) return;
    openInspector();
  });
  inspectorStrip.addEventListener("keydown", event => {
    if (!inspectorCollapsed() || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openInspector();
  });
  inspectorBack.addEventListener("click", () => closeSheet(true));

  // Named so destroy() can remove it: a destroyed shell's Escape handler left
  // on the host would preventDefault first and the live shell would then
  // ignore the key (found by the harness's destroy-and-remount case).
  const onEscape = event => {
    if (event.key !== "Escape") return;
    // A component surface that already handled this Escape (the delete
    // confirmation returning focus to its trigger) owns the focus outcome.
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-author-region="prose"]')) return;
    event.preventDefault();
    if (sheetOpen) {
      if (drawer) closeDrawer(false);
      inspectorBack.click();
      return;
    }
    if (drawer) closeDrawer(false);
    if (!restoreEditorState()) authoring.focusEditor();
  };
  target.addEventListener("keydown", onEscape);

  for (const handle of target.querySelectorAll("[data-resize]")) {
    handle.addEventListener("keydown", event => {
      const horizontal = handle.dataset.resize === "inspector";
      if (!(horizontal ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]).includes(event.key)) return;
      event.preventDefault();
      const name = handle.dataset.resize;
      const currentRootSize = rootSize();
      if (horizontal) {
        const delta = event.key === "ArrowUp" ? 16 : -16;
        const { floor, ceiling } = inspectorLimits();
        state.inspectorHeight = Math.min(
          ceiling,
          Math.max(floor, bandHeight + delta)
        );
        bandHeight = state.inspectorHeight;
        renderInspectorLayout();
        saveLayout();
        return;
      }
      const direction = name === "explorer" ? 1 : -1;
      const delta = event.key === "ArrowRight" ? 16 : -16;
      state.widths[name] = Math.max(12 * currentRootSize, state.widths[name] + direction * delta);
      renderLayout();
      saveLayout();
      fitColumns();
    });
    handle.addEventListener("pointerdown", event => {
      const name = handle.dataset.resize;
      const horizontal = name === "inspector";
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = horizontal ? bandHeight : state.widths[name];
      try { handle.setPointerCapture(event.pointerId); } catch {}
      const move = moveEvent => {
        if (horizontal) {
          const { floor, ceiling } = inspectorLimits();
          state.inspectorHeight = Math.min(
            ceiling,
            Math.max(floor, startSize - (moveEvent.clientY - startY))
          );
          bandHeight = state.inspectorHeight;
          renderInspectorLayout();
          return;
        }
        const direction = name === "explorer" ? 1 : -1;
        state.widths[name] = Math.max(12 * parseFloat(getComputedStyle(document.documentElement).fontSize), startSize + direction * (moveEvent.clientX - startX));
        renderLayout();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        saveLayout();
        if (!horizontal) fitColumns();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up, { once: true });
      handle.addEventListener("pointercancel", up, { once: true });
    });
  }

  const measureInspector = () => {
    const currentRootSize = rootSize();
    const contentHeight = proseContent.getBoundingClientRect().height;
    if (contentHeight <= 0) return;
    // The band gets the room the validation band can give up: the editor
    // keeps its floor, validation keeps at least its summary row, and it
    // reopens whenever the band leaves it space.
    const validation = validationHeights(currentRootSize);
    const availableHeight = contentHeight - validation.row;
    const headerHeight = measureBandHeader(currentRootSize);
    const defaultPanelHeight = Math.max(INSPECTOR_FLOOR_REM * currentRootSize, availableHeight * 0.4);
    const defaultHeight = defaultPanelHeight + headerHeight;
    const floor = INSPECTOR_FLOOR_REM * currentRootSize + headerHeight;
    const editorFloor = EDITOR_FLOOR_REM * currentRootSize;
    const editorClearsFloor = availableHeight - defaultHeight >= editorFloor;
    const nextMode = editorClearsFloor ? "band" : "sheet";
    const modeChanged = nextMode !== inspectorMode;
    inspectorMode = nextMode;
    if (inspectorMode === "band") {
      bandHeight = Math.min(availableHeight - editorFloor, Math.max(floor, state.inspectorHeight ?? defaultHeight));
      validationCompact = contentHeight - validation.open - bandHeight < editorFloor;
      sheetOpen = false;
    } else if (modeChanged) {
      sheetOpen = hasInspectorSelection() && selectionOpensSheet(inspectorSelection);
      if (sheetOpen && drawer) closeDrawer(false);
    }
    renderInspectorLayout();
  };
  if ("ResizeObserver" in window) {
    inspectorObserver = new ResizeObserver(measureInspector);
    inspectorObserver.observe(proseContent);
    inspectorObserver.observe(validationBand);
    inspectorObserver.observe(document.documentElement);
  } else {
    window.addEventListener("resize", measureInspector);
  }

  async function requestPersistentStorage() {
    let protectedStorage = readLocal(STORAGE_KEY);
    if (protectedStorage === null) {
      try {
        protectedStorage = String(Boolean(await navigator.storage?.persist?.()));
      } catch {
        protectedStorage = "false";
      }
      writeLocal(STORAGE_KEY, protectedStorage);
    }
    const protectedDraft = protectedStorage === "true";
    storageStatus.textContent = WORKBENCH_COPY.storageStatus(protectedDraft ? WORKBENCH_COPY.storageProtected : WORKBENCH_COPY.storageMayBeCleared);
    storageNotice.hidden = protectedDraft;
  }

  renderLayout();
  fitColumns();
  measureInspector();
  requestPersistentStorage();
  if ("ResizeObserver" in window) {
    layoutObserver = new ResizeObserver(reconcileLayoutMode);
    layoutObserver.observe(target.querySelector(".opengdd-workbench-supported"));
  } else {
    window.addEventListener("resize", reconcileLayoutMode);
  }
  // Test hook, not API: resize observers never fire in hidden tabs, so the
  // browser harness reconciles the layout mode itself after resizing.
  const testHooks = {
    openPackage: authoring.openPackage,
    reconcileLayoutMode,
    resize() { reconcileLayoutMode(); measureInspector(); }
  };

  return { testHooks, destroy() {
    selectionCancel();
    authoring.destroy();
    for (const type of ["focusin", "focusout", "select", "input", "keyup", "pointerup", "scroll"]) {
      target.removeEventListener(type, saveEditorState, true);
    }
    regions.status.removeEventListener("click", filterOutlineFromStatus);
    target.removeEventListener("keydown", onEscape);
    inspectorObserver?.disconnect();
    layoutObserver?.disconnect();
    window.removeEventListener("resize", reconcileLayoutMode);
    window.removeEventListener("resize", measureInspector);
  } };
}
