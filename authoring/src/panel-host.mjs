import { WORKBENCH_COPY } from "./copy/workbench-copy.mjs";
import { plainObject } from "./json-path.mjs";

export const PANEL_API_REVISION = 1;

const SERVICES = Object.freeze(["selection", "edits", "validation", "references", "forms", "grid", "assets"]);
const CAPABILITIES = Object.freeze({
  selection: ["current", "subscribe", "select", "clear"],
  edits: ["begin"],
  validation: ["current", "subscribe", "forFile", "reveal", "contribute"],
  references: ["families", "resolve", "usages", "planRename", "applyRename",
    "planUseContractValue", "applyUseContractValue"],
  forms: ["create"], grid: ["create"], assets: ["list", "pick", "add", "url"]
});
const SURFACES = new Set(["inspector", "sidebar"]);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const panelName = panel => typeof panel?.id === "string" && panel.id ? panel.id : "unknown panel";
const fail = (panel, field, detail) => { throw new Error(`Panel ${panelName(panel)} has an invalid ${field}${detail ? `: ${detail}` : "."}`); };

function validateNeeds(panel, needs, field) {
  if (needs === undefined) return [];
  if (!Array.isArray(needs) || needs.some(value => typeof value !== "string" || !value)) fail(panel, field);
  for (const need of needs) {
    const [service, capability, ...rest] = need.split(".");
    if (!SERVICES.includes(service) || rest.length || (capability && !CAPABILITIES[service].includes(capability))) {
      fail(panel, field, `${need} is not part of revision ${PANEL_API_REVISION}.`);
    }
  }
  return [...needs];
}

export function validatePanelDescriptor(panel, ids = new Set()) {
  if (!plainObject(panel)) fail(panel, "descriptor");
  if (panel.api !== PANEL_API_REVISION) fail(panel, "api", `revision ${PANEL_API_REVISION} is required; the panel declared ${String(panel.api)}.`);
  if (typeof panel.id !== "string" || !ID.test(panel.id)) fail(panel, "id");
  if (ids.has(panel.id)) fail(panel, "id", "it is already registered.");
  if (typeof panel.title !== "string" || !panel.title.trim()) fail(panel, "title");
  if (panel.placement !== undefined && panel.placement !== "companion") fail(panel, "placement");
  if (!Array.isArray(panel.surfaces) || !panel.surfaces.length || panel.surfaces.some(value => !SURFACES.has(value)) || new Set(panel.surfaces).size !== panel.surfaces.length) fail(panel, "surfaces");
  if (!plainObject(panel.inspects)) fail(panel, "inspects");
  const kinds = panel.inspects.kinds;
  const files = panel.inspects.files;
  if (kinds !== undefined && (!Array.isArray(kinds) || kinds.some(value => typeof value !== "string" || !value))) fail(panel, "inspects.kinds");
  if (files !== undefined && (!Array.isArray(files) || files.some(value => typeof value !== "string" || (!/^\*\.[^*/]+$/.test(value) && (value.startsWith("/") || value.includes("*")))))) fail(panel, "inspects.files");
  if (!(kinds?.length || files?.length)) fail(panel, "inspects", "it cannot match anything.");
  if (!plainObject(panel.empty) || typeof panel.empty.title !== "string" || !panel.empty.title.trim()) fail(panel, "empty");
  if (panel.empty.action !== undefined && (!plainObject(panel.empty.action) || typeof panel.empty.action.label !== "string" || typeof panel.empty.action.run !== "function")) fail(panel, "empty.action");
  if (typeof panel.create !== "function") fail(panel, "create");
  if (panel.styles !== undefined) {
    let url;
    try { url = panel.styles instanceof URL ? panel.styles : new URL(panel.styles); } catch { fail(panel, "styles", "use an absolute URL."); }
    if (!url.protocol || typeof panel.styles === "string" && !/^[a-z][a-z0-9+.-]*:/i.test(panel.styles)) fail(panel, "styles", "use an absolute URL.");
  }
  const needs = validateNeeds(panel, panel.needs, "needs");
  const creates = panel.creates ?? [];
  if (!Array.isArray(creates)) fail(panel, "creates");
  for (const [index, creator] of creates.entries()) {
    if (!plainObject(creator) || typeof creator.kind !== "string" || typeof creator.label !== "string" || typeof creator.help !== "string" || typeof creator.run !== "function") fail(panel, `creates[${index}]`);
    validateNeeds(panel, creator.needs, `creates[${index}].needs`);
    if (creator.requires !== undefined && (!Array.isArray(creator.requires) || creator.requires.some(value => !["name", "file", "position"].includes(value)))) fail(panel, `creates[${index}].requires`);
  }
  ids.add(panel.id);
  return Object.freeze({ descriptor: panel, needs, order: ids.size - 1, instances: new Map(), failed: false });
}

function matchScore(panel, selection) {
  if (!selection) return 0;
  if (panel.descriptor.inspects.files?.includes(selection.file)) return 3;
  if (panel.descriptor.inspects.files?.some(pattern => pattern.startsWith("*.") && selection.file?.toLowerCase().endsWith(pattern.slice(1).toLowerCase()))) return 2;
  if (panel.descriptor.inspects.kinds?.includes(selection.kind)) return 1;
  return 0;
}

export function createPanelHost({ document, view, panels, inspector, sidebar, services, packageService, hostInfo,
  builtInCreationKinds = new Set(), internal = {}, report }) {
  const registered = [];
  const ids = new Set();
  const links = [];
  const sidebarGroups = [];
  const subscriptionCancels = new Set();
  const reportedTies = new Set();
  let destroyed = false;
  let fit = true;

  inspector.innerHTML = `<header class="opengdd-author-panel-header"><p class="opengdd-author-kicker" data-panel-title></p></header><div class="opengdd-author-panel-stage" data-panel-stage></div>`;
  const title = inspector.querySelector("[data-panel-title]");
  const stage = inspector.querySelector("[data-panel-stage]");
  const syncInspectorTitle = () => {
    title.hidden = Boolean(stage.querySelector(".opengdd-author-entity-header"));
  };
  const titleObserver = typeof view.MutationObserver === "function"
    ? new view.MutationObserver(syncInspectorTitle) : null;
  titleObserver?.observe(stage, { childList: true, subtree: true });
  syncInspectorTitle();

  const serviceAvailable = need => {
    const [service, capability] = need.split(".");
    return Boolean(services[service] && (!capability || typeof services[service][capability] === "function"));
  };

  const boundary = (panel, instance, callback) => (...args) => {
    if (destroyed || instance.failed) return;
    try {
      const value = callback(...args);
      if (value && typeof value.then === "function") value.catch(error => failInstance(panel, instance, error));
      return value;
    } catch (error) { failInstance(panel, instance, error); }
  };

  function failInstance(panel, instance, error) {
    if (instance.failed) return;
    instance.failed = true;
    instance.controller.abort();
    for (const cancel of instance.cancels) cancel();
    instance.cancels.clear();
    instance.element.hidden = true;
    instance.state.hidden = false;
    instance.state.innerHTML = `<strong>${panel.descriptor.title}</strong><p>${panel.descriptor.title} stopped working.</p>`;
    if (instance.surface === "inspector") panel.instances.delete(instance.key);
    report(`${panel.descriptor.title} stopped working: ${error?.message ?? String(error)}`, true);
  }

  function scopedServices(panel, instance, { creator = false } = {}) {
    const result = { ...services };
    for (const [name, service] of Object.entries(result)) {
      if (!service || typeof service !== "object") continue;
      result[name] = { ...service };
      if (typeof service.subscribe === "function") {
        result[name].subscribe = callback => {
          const cancel = service.subscribe(boundary(panel, instance, callback));
          instance.cancels.add(cancel);
          return () => { instance.cancels.delete(cancel); cancel(); };
        };
      }
    }
    result.selection = result.selection && {
      ...result.selection,
      select(next, options) {
        return services.selection.select(next, { ...options, origin: {
          surface: "panel", panel: { id: panel.descriptor.id, surface: instance.surface },
          focus: options?.focus === true, reveal: options?.reveal === true
        } });
      },
      clear() {
        return services.selection.clear({
          surface: "panel", panel: { id: panel.descriptor.id, surface: instance.surface }
        });
      }
    };
    if (result.edits && !creator) {
      const begin = result.edits.begin;
      result.edits.begin = (...args) => {
        const transaction = begin(...args);
        const root = `panels/${panel.descriptor.id}/`;
        const requireRoot = path => {
          if (typeof path !== "string" || !path.startsWith(root)) throw new Error(`Panel ${panel.descriptor.id} must create files under ${root}`);
        };
        const file = transaction.file.bind(transaction);
        transaction.file = path => {
          const operations = file(path);
          return {
            create(value) { requireRoot(path); return operations.create(value); },
            move(nextPath) { requireRoot(nextPath); return operations.move(nextPath); },
            remove: operations.remove
          };
        };
        const folder = transaction.folder.bind(transaction);
        transaction.folder = path => {
          const operations = folder(path);
          return {
            create() { requireRoot(`${path}/`); return operations.create(); },
            move(nextPath) { requireRoot(`${nextPath}/`); return operations.move(nextPath); },
            remove: operations.remove
          };
        };
        return transaction;
      };
    }
    if (result.validation) {
      result.validation.contribute = findings => services.validation.contribute(
        findings, panel.descriptor.id, panel.descriptor.title);
    }
    return Object.freeze(result);
  }

  function renderEmpty(panel, instance, empty) {
    instance.element.hidden = empty;
    instance.state.hidden = !empty;
    if (!empty) return;
    instance.state.replaceChildren();
    const line = document.createElement("p");
    line.textContent = panel.descriptor.empty.title;
    instance.state.append(line);
    if (panel.descriptor.empty.action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = panel.descriptor.empty.action.label;
      button.addEventListener("click", boundary(panel, instance, () => panel.descriptor.empty.action.run(instance.context)), { signal: instance.controller.signal });
      instance.state.append(button);
    }
  }

  function mount(panel, surface, parent, badge, { actionOnly = false } = {}) {
    const instanceKey = actionOnly ? `action:${surface}` : surface;
    if (panel.instances.has(instanceKey)) {
      const existing = panel.instances.get(instanceKey);
      parent.append(existing.element, existing.state);
      return existing;
    }
    const controller = new view.AbortController();
    const element = document.createElement("div");
    element.dataset.panel = panel.descriptor.id;
    element.dataset.size = hostInfo.size;
    const state = document.createElement("div");
    state.className = "opengdd-author-panel-state";
    state.hidden = true;
    parent.append(element, state);
    const instance = { key: instanceKey, surface, controller, element, state, badge, cancels: new Set(), failed: false, handle: undefined, empty: false };
    panel.instances.set(instanceKey, instance);
    const missing = panel.needs.filter(need => !serviceAvailable(need));
    const packageContext = {};
    Object.defineProperties(packageContext, {
      id: { enumerable: true, get: () => packageService.id },
      title: { enumerable: true, get: () => packageService.title },
      packageRevision: { enumerable: true, get: () => packageService.packageRevision }
    });
    Object.assign(packageContext, {
      list: packageService.list,
      read: packageService.read,
      revision: packageService.revision,
      subscribe(callback) {
        const cancel = packageService.subscribe(boundary(panel, instance, callback));
        instance.cancels.add(cancel);
        return () => { instance.cancels.delete(cancel); cancel(); };
      }
    });
    const hostContext = {
      get kind() { return hostInfo.kind; },
      get size() { return hostInfo.size; },
      subscribe(callback) {
        const cancel = hostInfo.subscribe(boundary(panel, instance, callback));
        instance.cancels.add(cancel);
        return () => { instance.cancels.delete(cancel); cancel(); };
      }
    };
    const context = {
      panel: Object.freeze({ id: panel.descriptor.id, surface }), element, document,
      signal: controller.signal, host: Object.freeze(hostContext), package: Object.freeze(packageContext),
      surface: Object.freeze({
        setBadge({ count } = {}) {
          if (surface !== "sidebar") return;
          if (instance.badge) {
            instance.badge.textContent = Number.isFinite(count) ? String(count) : "";
            instance.badge.hidden = !Number.isFinite(count);
          }
        },
        empty(value) { instance.empty = Boolean(value); renderEmpty(panel, instance, instance.empty); }
      }),
      api: Object.freeze({ revision: PANEL_API_REVISION, provisional: false }),
      // Own-property lookup only: a panel id such as "constructor" must not
      // reach the host-private channel through Object.prototype.
      internal: Object.hasOwn(internal, panel.descriptor.id) ? internal[panel.descriptor.id] : undefined,
      services: null
    };
    instance.context = context;
    context.services = scopedServices(panel, instance, { creator: actionOnly });
    Object.freeze(context);
    if (surface === "sidebar") renderEmpty(panel, instance, true);
    if (missing.length) {
      state.hidden = false;
      state.innerHTML = `<strong>${panel.descriptor.title}</strong><p>${panel.descriptor.title} needs ${missing.join(", ")}, which is not available in this host.</p>`;
      return instance;
    }
    if (actionOnly) return instance;
    try {
      instance.handle = panel.descriptor.create(context);
      if (surface === "inspector") syncInspectorTitle();
      if (instance.handle && typeof instance.handle.then === "function") {
        instance.handle.then(handle => {
          instance.handle = handle;
          if (surface === "inspector") syncInspectorTitle();
        }).catch(error => failInstance(panel, instance, error));
      }
    } catch (error) { failInstance(panel, instance, error); }
    return instance;
  }

  function renderSidebarPanel(panel) {
    if (!sidebar) return;
    const group = document.createElement("section");
    group.className = "opengdd-author-panel-group";
    group.dataset.panelGroup = panel.descriptor.id;
    group.setAttribute("role", "group");
    const heading = document.createElement("h3");
    heading.className = "opengdd-author-sidebar-panel-header";
    heading.textContent = panel.descriptor.title;
    const badge = document.createElement("span");
    badge.className = "opengdd-author-panel-badge";
    badge.hidden = true;
    heading.append(badge);
    const body = document.createElement("div");
    group.append(heading, body);
    sidebarGroups.push(group);
    (sidebar.querySelector("[data-panel-sidebar]") ?? sidebar).append(group);
    const instance = mount(panel, "sidebar", body, badge);
    if (!instance.failed && !instance.state.hidden) return;
    if (!instance.failed) renderEmpty(panel, instance, true);
  }

  function inspectorMatches(selection, placement) {
    return registered.filter(panel => panel.descriptor.surfaces.includes("inspector")
      && (panel.descriptor.placement ?? "exclusive") === placement && matchScore(panel, selection) > 0)
      .sort((left, right) => matchScore(right, selection) - matchScore(left, selection) || left.order - right.order);
  }

  function chooseInspector(selection) {
    const matches = inspectorMatches(selection, "exclusive");
    if (!matches.length) return undefined;
    const chosen = selection?.kind === "contract-value"
      ? matches.find(panel => panel.descriptor.id === "opengdd.in-context") ?? matches[0]
      : matches[0];
    const score = matchScore(chosen, selection);
    // The In context panel matches every kind as the host's own fallback; a
    // tie with it is the design, not a competition worth telling the designer.
    const contested = panel => panel !== chosen && panel.descriptor.id !== "opengdd.in-context"
      && chosen.descriptor.id !== "opengdd.in-context" && matchScore(panel, selection) === score;
    for (const loser of matches.filter(contested)) {
      const key = `${selection.kind}\0${chosen.descriptor.id}\0${loser.descriptor.id}`;
      if (reportedTies.has(key)) continue;
      reportedTies.add(key);
      const message = `${loser.descriptor.id} also matches ${selection.kind}; ${chosen.descriptor.id} shows`;
      report(message);
      view.console?.warn?.(message);
    }
    return chosen;
  }

  function mountCompanions(selection) {
    for (const panel of inspectorMatches(selection, "companion")) {
      const section = document.createElement("section");
      section.className = "opengdd-author-panel-companion";
      section.dataset.panelCompanion = panel.descriptor.id;
      const heading = document.createElement("h3");
      heading.textContent = panel.descriptor.title;
      const body = document.createElement("div");
      section.append(heading, body);
      stage.append(section);
      mount(panel, "inspector", body);
    }
  }

  function renderInspector() {
    const box = (inspector.parentElement ?? inspector).getBoundingClientRect();
    const rootSize = parseFloat(view.getComputedStyle(document.documentElement).fontSize) || 16;
    if (box.width > 0 && box.height > 0) fit = hostInfo.kind === "workbench"
      ? true : box.width >= 16 * rootSize && box.height >= 12 * rootSize;
    inspector.hidden = !fit;
    if (!fit) return;
    const selection = services.selection.current();
    const chosen = chooseInspector(selection);
    if (!chosen) {
      title.textContent = "";
      title.hidden = false;
      stage.replaceChildren();
      const placeholder = document.createElement("p");
      placeholder.className = "opengdd-author-muted";
      placeholder.textContent = WORKBENCH_COPY.nothingSelected;
      stage.append(placeholder);
      // A companion may match a kind no exclusive panel claims.
      mountCompanions(selection);
      return;
    }
    // One exclusive inspector wins. Matching companion panels follow it as
    // titled sections and never enter the exclusive score.
    title.textContent = chosen.descriptor.title;
    stage.replaceChildren();
    mount(chosen, "inspector", stage);
    mountCompanions(selection);
    syncInspectorTitle();
  }

  const selectionCancel = services.selection.subscribe(renderInspector);
  subscriptionCancels.add(selectionCancel);

  async function registerAll(source) {
    let values;
    try { values = typeof source === "function" ? await source() : await source; }
    catch (error) { report(`Panel not loaded — Panels could not be loaded: ${error.message}`, true, { priority: "persistent" }); return; }
    if (destroyed) return;
    if (values === undefined) values = [];
    if (!Array.isArray(values)) { report("Panel not loaded — host.panels must provide an array of panel descriptors.", true, { priority: "persistent" }); return; }
    for (const descriptor of values) {
      try {
        const panel = validatePanelDescriptor(descriptor, ids);
        registered.push(panel);
        if (descriptor.styles) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = String(descriptor.styles);
          link.dataset.panelStyle = descriptor.id;
          document.head.append(link);
          links.push(link);
        }
        if (descriptor.surfaces.includes("sidebar")) renderSidebarPanel(panel);
      } catch (error) { report(`Panel not loaded — ${error.message}`, true, { priority: "persistent" }); }
    }
    renderInspector();
  }

  registerAll(panels);
  // Re-render only when the region crosses the floor: a panel whose own
  // content changes height (a worksheet re-rendering its tests) would
  // otherwise be re-mounted on every change and lose the designer's focus.
  const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(() => {
    const box = (inspector.parentElement ?? inspector).getBoundingClientRect();
    const rootSize = parseFloat(view.getComputedStyle(document.documentElement).fontSize) || 16;
    const nextFit = box.width > 0 && box.height > 0 ? hostInfo.kind === "workbench"
      || box.width >= 16 * rootSize && box.height >= 12 * rootSize : fit;
    if (nextFit !== fit) renderInspector();
  }) : null;
  // The region itself changes from zero-sized to fit when a workbench band is
  // expanded. Observing it makes that transition render the current selection
  // even when the selection arrived while the region was hidden.
  observer?.observe(inspector);
  observer?.observe(inspector.parentElement ?? inspector);
  observer?.observe(document.documentElement);
  return {
    refresh: renderInspector,
    refreshSelected() {
      const chosen = chooseInspector(services.selection.current());
      const instance = chosen?.instances.get("inspector");
      if (typeof instance?.handle?.refresh !== "function") return false;
      return boundary(chosen, instance, () => instance.handle.refresh())() === true;
    },
    refreshSidebar() {
      const target = sidebar?.querySelector("[data-panel-sidebar]");
      if (target) target.append(...sidebarGroups);
    },
    packageOpened: renderInspector,
    hostSizeChanged(size) {
      for (const panel of registered) for (const instance of panel.instances.values()) instance.element.dataset.size = size;
    },
    descriptors: () => registered.map(panel => panel.descriptor),
    inspectorMatches(selection) {
      return inspectorMatches(selection, "exclusive").length > 0;
    },
    titleFor(selection) {
      return chooseInspector(selection)?.descriptor.title ?? "";
    },
    creators(request = {}, { menu = false } = {}) {
      return registered.flatMap(panel => (panel.descriptor.creates ?? []).map((creator, index) => ({ panel, creator, index })))
        .filter(({ creator }) => !builtInCreationKinds.has(creator.kind))
        .filter(({ creator }) => (creator.needs ?? []).every(serviceAvailable))
        .filter(({ creator }) => !menu || !(creator.requires ?? []).includes("position"))
        .filter(({ creator }) => !menu || !(creator.requires ?? []).includes("file") || Boolean(request.file))
        .map(({ panel, creator, index }) => ({
          id: `${panel.descriptor.id}:${index}`,
          kind: creator.kind,
          label: creator.label,
          help: creator.help,
          requires: [...(creator.requires ?? [])]
        }));
    },
    async runCreator(id, request, surface = "sidebar") {
      const separator = id.lastIndexOf(":");
      const panel = registered.find(candidate => candidate.descriptor.id === id.slice(0, separator));
      const creator = panel?.descriptor.creates?.[Number(id.slice(separator + 1))];
      if (!panel || !creator) throw new Error("This creation action is no longer available.");
      const missing = (creator.requires ?? []).filter(field => request[field] === undefined || request[field] === "");
      if (missing.length) throw new Error(`${creator.label} needs ${missing.join(", ")}.`);
      const parent = document.createDocumentFragment();
      const instance = mount(panel, surface, parent, undefined, { actionOnly: true });
      if (instance.failed) throw new Error(`${panel.descriptor.title} stopped working.`);
      try {
        const outcome = await creator.run(instance.context, request);
        if (outcome?.select) instance.context.services.selection.select(outcome.select);
        return outcome;
      } catch (error) {
        failInstance(panel, instance, error);
        throw error;
      }
    },
    destroy() {
      destroyed = true;
      titleObserver?.disconnect();
      observer?.disconnect();
      for (const cancel of subscriptionCancels) cancel();
      for (const panel of registered) for (const instance of panel.instances.values()) {
        try { instance.handle?.destroy?.(); } catch (error) { report(`${panel.descriptor.title} stopped working: ${error.message}`, true); }
        instance.controller.abort();
        for (const cancel of instance.cancels) cancel();
      }
      for (const group of sidebarGroups) group.remove();
      for (const link of links) link.remove();
    }
  };
}
