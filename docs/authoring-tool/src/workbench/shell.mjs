import { mountAuthoringTool } from "../tool.mjs";
import { loadConformanceSchemas, requestJson } from "../loaders.mjs";
import { SUPPORTED_OPENGDD_VERSION } from "../package.mjs";
import { WORKBENCH_COPY } from "../copy/workbench-copy.mjs";
import { AUTHORING_TOOL_VERSION } from "opengdd-authoring-version";

const THEME_KEY = "opengdd-workbench-theme";
const LAYOUT_KEY = "opengdd-workbench-layout";
const STORAGE_KEY = "opengdd-workbench-storage-protected";
const COLUMN_ORDER = ["inspector", "explorer", "outline"];
const SIDE_COLUMNS = ["explorer", "outline", "inspector"];
const DEFAULT_WIDTHS = { explorer: 256, outline: 256, inspector: 288 };
const WIDE_BREAKPOINT_REM = 64;

function readLocal(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function readLayout() {
  try {
    const value = JSON.parse(readLocal(LAYOUT_KEY, "{}"));
    return {
      widths: { ...DEFAULT_WIDTHS, ...value.widths },
      userCollapsed: value.userCollapsed?.filter(name => SIDE_COLUMNS.includes(name)) ?? [],
      fitCollapsed: value.fitCollapsed?.filter(name => SIDE_COLUMNS.includes(name)) ?? [],
      collectionCollapsed: Array.isArray(value.collectionCollapsed)
        ? value.collectionCollapsed.filter(name => typeof name === "string")
        : []
    };
  } catch {
    return { widths: { ...DEFAULT_WIDTHS }, userCollapsed: [], fitCollapsed: [], collectionCollapsed: [] };
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
        <h2>${label}</h2>
        ${name === "prose" ? "" : `<button type="button" class="opengdd-workbench-collapse" data-collapse="${name}" aria-label="${WORKBENCH_COPY.collapsePanel(label)}">×</button>`}
      </header>
      ${["explorer", "prose", "outline", "inspector"].includes(name) ? `<div class="opengdd-workbench-author-region" data-author-region="${name}"></div>${name === "explorer" ? '<div class="opengdd-workbench-author-context" data-author-region="context"></div>' : ""}` : `<div class="opengdd-workbench-empty">
        <p><strong>${title}</strong></p>
        <button type="button" disabled>${action}</button>
      </div>`}
    </section>`;
}

function shellMarkup() {
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
        <fieldset class="opengdd-workbench-theme">
          <legend>${WORKBENCH_COPY.theme}</legend>
          ${WORKBENCH_COPY.themes.map(theme => `<label><input type="radio" name="workbench-theme" value="${theme}"> ${theme}</label>`).join("")}
        </fieldset>
      </header>
      <main class="opengdd-workbench-grid">
        ${panelMarkup("explorer", WORKBENCH_COPY.explorer, WORKBENCH_COPY.noPackageFiles, WORKBENCH_COPY.createMinimalPackage)}
        <div class="opengdd-workbench-resizer" data-resize="explorer" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.explorer)}" aria-orientation="vertical" tabindex="0"></div>
        <section id="workbench-prose" class="opengdd-workbench-panel opengdd-workbench-panel--prose" data-panel="prose" aria-label="${WORKBENCH_COPY.prose}" tabindex="0">
          <header class="opengdd-workbench-panel-header"><h2>${WORKBENCH_COPY.prose}</h2></header>
          <div class="opengdd-workbench-author-region" data-author-region="prose"></div>
        </section>
        <div class="opengdd-workbench-resizer" data-resize="outline" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.outline)}" aria-orientation="vertical" tabindex="0"></div>
        ${panelMarkup("outline", WORKBENCH_COPY.outline, WORKBENCH_COPY.nothingDeclared, WORKBENCH_COPY.createIdentifier)}
        <div class="opengdd-workbench-resizer" data-resize="inspector" role="separator" aria-label="${WORKBENCH_COPY.resizePanel(WORKBENCH_COPY.inspector)}" aria-orientation="vertical" tabindex="0"></div>
        ${panelMarkup("inspector", WORKBENCH_COPY.inspector, WORKBENCH_COPY.nothingSelected, WORKBENCH_COPY.chooseOutlineItem)}
      </main>
      <footer class="opengdd-workbench-status" aria-label="${WORKBENCH_COPY.packageStatus}" tabindex="0">
        <div class="opengdd-workbench-component-status" data-author-region="status">
          <span>${WORKBENCH_COPY.errorsPending}</span><span>${WORKBENCH_COPY.warningsPending}</span><span>${WORKBENCH_COPY.words(0)}</span><span>${WORKBENCH_COPY.declarations(0)}</span>
          <span>${WORKBENCH_COPY.checkingInWorker}</span><span>${WORKBENCH_COPY.validationStatus(WORKBENCH_COPY.validationChecking)}</span><span>${WORKBENCH_COPY.notSaved}</span>
        </div>
        <span data-storage-status>${WORKBENCH_COPY.storageStatus(WORKBENCH_COPY.storageMayBeCleared)}</span>
        <span class="opengdd-workbench-version">${WORKBENCH_COPY.version(AUTHORING_TOOL_VERSION, SUPPORTED_OPENGDD_VERSION)}</span>
      </footer>
    </div>
    <main class="opengdd-workbench-narrow">
      <h1>${WORKBENCH_COPY.narrowTitle}</h1>
      <p>${WORKBENCH_COPY.narrowAction}</p>
    </main>`;
}

export function mountWorkbenchShell(target, { panels } = {}) {
  if (!(target instanceof Element)) throw new TypeError("A workbench host element is required");
  target.innerHTML = shellMarkup();

  const state = readLayout();
  function saveLayout() { writeLocal(LAYOUT_KEY, JSON.stringify(state)); }
  const grid = target.querySelector(".opengdd-workbench-grid");
  const storageStatus = target.querySelector("[data-storage-status]");
  const storageNotice = target.querySelector(".opengdd-workbench-storage-notice");
  const regions = {
    explorer: target.querySelector('[data-author-region="explorer"]'),
    context: target.querySelector('[data-author-region="context"]'),
    prose: target.querySelector('[data-author-region="prose"]'),
    outline: target.querySelector('[data-author-region="outline"]'),
    inspector: target.querySelector('[data-author-region="inspector"]'),
    status: target.querySelector('[data-author-region="status"]'),
    undo: target.querySelector('[data-author-region="undo"]')
  };
  const encodePath = value => value.split("/").map(encodeURIComponent).join("/");
  let schemaRequest;
  let exampleRequest;
  const loadSchemas = () => schemaRequest ??= loadConformanceSchemas()
    .catch(error => { schemaRequest = undefined; throw error; });
  const loadExample = () => exampleRequest ??= requestJson("/api/authoring/package?package=tic-tac-toe")
    .catch(error => { exampleRequest = undefined; throw error; });
  const authoring = mountAuthoringTool(target.querySelector("[data-author-root]"), {
    schemas: loadSchemas,
    defaultPackageId: "tic-tac-toe",
    regions,
    capabilities: {
      protectedFiles: true,
      workbenchLabels: true,
      hostUndo: true,
      delete: true,
      coldStart: true
    },
    panels,
    outlineCollections: {
      collapsed: () => [...state.collectionCollapsed],
      setCollapsed: names => {
        state.collectionCollapsed = [...names];
        saveLayout();
      }
    },
    listPackages() {
      return [{ id: "tic-tac-toe", title: "Tic-Tac-Toe" }];
    },
    loadPackage(id) {
      if (id !== "tic-tac-toe") throw new Error(`Unknown package: ${id}`);
      return loadExample();
    },
    readerUrl(packagePath, file) {
      return `/read/${encodePath(`${packagePath}${file}`)}`;
    }
  });
  let savedEditorState = null;
  const saveEditorState = () => { savedEditorState = authoring.editorState() ?? savedEditorState; };
  const restoreEditorState = () => {
    return authoring.restoreEditorState(savedEditorState);
  };
  for (const type of ["focusin", "focusout", "select", "input", "keyup", "pointerup", "scroll"]) {
    target.addEventListener(type, saveEditorState, true);
  }
  let drawer = null;
  let drawerButton = null;
  let inspectorObserver;
  let layoutObserver;
  const filterOutlineFromStatus = event => {
    if (event.target instanceof HTMLButtonElement) authoring.outlineProblemsOnly(true);
  };
  regions.status.addEventListener("click", filterOutlineFromStatus);

  const collapsed = name => state.userCollapsed.includes(name) || state.fitCollapsed.includes(name);
  const isWideMode = () => {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return target.querySelector(".opengdd-workbench-supported").getBoundingClientRect().width >= WIDE_BREAKPOINT_REM * rootSize;
  };
  let wideMode = isWideMode();

  function clearDrawer() {
    drawer = null;
    drawerButton = null;
  }

  function closeDrawer(returnFocus = false) {
    if (!drawer) return;
    const invokingButton = drawerButton;
    clearDrawer();
    renderLayout();
    if (returnFocus) invokingButton?.focus();
  }

  function renderLayout() {
    const columns = [];
    for (const name of ["explorer", "prose", "outline", "inspector"]) {
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
    for (const handle of target.querySelectorAll("[data-resize]")) {
      const name = handle.dataset.resize;
      handle.hidden = collapsed(name) || (!wideMode && drawer === name);
    }
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

  const savedTheme = readLocal(THEME_KEY, WORKBENCH_COPY.themes[2]);
  const selectedTheme = WORKBENCH_COPY.themes.includes(savedTheme) ? savedTheme : WORKBENCH_COPY.themes[2];
  for (const input of target.querySelectorAll("[name=workbench-theme]")) {
    input.checked = input.value === selectedTheme;
    input.addEventListener("change", () => applyTheme(input.value));
  }
  applyTheme(selectedTheme);

  for (const button of target.querySelectorAll("[data-open]")) {
    button.addEventListener("click", () => {
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
      if (!state.userCollapsed.includes(name)) state.userCollapsed.push(name);
      closeDrawer();
      renderLayout();
      saveLayout();
      target.querySelector(`[data-open=${name}]`)?.focus();
      fitColumns();
    });
  }

  target.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    // A component surface that already handled this Escape (the delete
    // confirmation returning focus to its trigger) owns the focus outcome.
    if (event.defaultPrevented) return;
    if (event.target.closest('[data-author-region="prose"]')) return;
    event.preventDefault();
    if (drawer) closeDrawer(false);
    if (!restoreEditorState()) authoring.focusEditor();
  });

  for (const handle of target.querySelectorAll("[data-resize]")) {
    handle.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const name = handle.dataset.resize;
      const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const direction = name === "explorer" ? 1 : -1;
      const delta = event.key === "ArrowRight" ? 16 : -16;
      state.widths[name] = Math.max(12 * rootSize, state.widths[name] + direction * delta);
      renderLayout();
      saveLayout();
      fitColumns();
    });
    handle.addEventListener("pointerdown", event => {
      const name = handle.dataset.resize;
      const startX = event.clientX;
      const startWidth = state.widths[name];
      handle.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const direction = name === "explorer" ? 1 : -1;
        state.widths[name] = Math.max(12 * parseFloat(getComputedStyle(document.documentElement).fontSize), startWidth + direction * (moveEvent.clientX - startX));
        renderLayout();
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        saveLayout();
        fitColumns();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up, { once: true });
      handle.addEventListener("pointercancel", up, { once: true });
    });
  }

  const measureInspector = () => {
    const inspector = target.querySelector("[data-panel=inspector]");
    if (inspector.hidden || inspector.classList.contains("opengdd-workbench-is-drawer")) return;
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const box = inspector.getBoundingClientRect();
    if (box.width < 16 * rootSize || box.height < 12 * rootSize) {
      if (!state.fitCollapsed.includes("inspector")) state.fitCollapsed.unshift("inspector");
      renderLayout();
      saveLayout();
    }
  };
  if ("ResizeObserver" in window) {
    inspectorObserver = new ResizeObserver(measureInspector);
    inspectorObserver.observe(target.querySelector("[data-panel=inspector]"));
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
  requestPersistentStorage();
  if ("ResizeObserver" in window) {
    layoutObserver = new ResizeObserver(reconcileLayoutMode);
    layoutObserver.observe(target.querySelector(".opengdd-workbench-supported"));
  } else {
    window.addEventListener("resize", reconcileLayoutMode);
  }
  // Test hook, not API: resize observers never fire in hidden tabs, so the
  // browser harness reconciles the layout mode itself after resizing.
  const testHooks = { reconcileLayoutMode };

  return { testHooks, destroy() {
    authoring.destroy();
    for (const type of ["focusin", "focusout", "select", "input", "keyup", "pointerup", "scroll"]) {
      target.removeEventListener(type, saveEditorState, true);
    }
    regions.status.removeEventListener("click", filterOutlineFromStatus);
    inspectorObserver?.disconnect();
    layoutObserver?.disconnect();
    window.removeEventListener("resize", reconcileLayoutMode);
    window.removeEventListener("resize", measureInspector);
  } };
}
