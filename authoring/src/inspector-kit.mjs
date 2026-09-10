import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";
import { removeEntity, renameEntity } from "./entity-lifecycle.mjs";
import { walkJsonDocument } from "./edits-json.mjs";
import { packageFiles } from "./json-path.mjs";
import { pointerAtLine, pointerRange } from "./json-pointer-lines.mjs";
// The read-only group helpers live apart so field modules can import them
// without pulling the rename and remove lifecycle (and its validator) along.
export { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const fieldBoxes = form => [...form.element.querySelectorAll("[data-form-field]")];
const fieldBox = (form, key) => fieldBoxes(form).find(node => node.dataset.formField === key);
const fieldControls = box => [...box.querySelectorAll("input, textarea, select, button, [tabindex]")]
  .filter(control => !control.disabled);

// The default structured-edit guard is for JSON files only; a prose entity
// (a section, an acceptance test with its own hook) is never JSON-parsed.
const jsonEntity = entity => /.json$/iu.test(String(entity?.file ?? ""));

export function structuredEditBlocked(text) {
  try { walkJsonDocument(text); return undefined; }
  catch (error) { return error.message; }
}

export function openInEditor(context, entity) {
  return context.services.selection.select({
    kind: "file", name: entity.file, file: entity.file, range: entity.range
  }, { reveal: true, focus: true });
}

export function entityHeader({ document, context, entity, actions = [] }) {
  const header = element(document, "header", undefined, "opengdd-author-entity-header");
  header.dataset.entityHeader = entity.id;
  const title = element(document, "h2", entity.title ?? entity.id);
  if (entity.titleIsProse !== true) title.classList.add("opengdd-author-identifier");
  header.append(title);
  if (entity.kindLabel) header.append(element(document, "p", entity.kindLabel, "opengdd-author-classification"));
  const controls = element(document, "div", undefined, "opengdd-author-entity-actions");
  const error = element(document, "p", "", "opengdd-author-form-error");
  error.hidden = true;
  error.setAttribute("aria-live", "polite");
  for (const action of actions) {
    if (!action) continue;
    const button = element(document, "button", action.label);
    button.type = "button";
    if (action.dataset) button.dataset[action.dataset] = "";
    button.addEventListener("click", () => Promise.resolve(action.run(button)).catch(failure => {
      button.title = failure.message;
      const message = String(failure.message ?? failure);
      error.textContent = message;
      error.hidden = !message;
    }));
    controls.append(button);
  }
  header.append(controls, error);
  return header;
}

export function attachFindings(form, routes = {}) {
  const { context, entity, route, header, targets = new Map(), files = [] } = routes;
  if (!context?.services?.validation) throw new TypeError("attachFindings requires validation context.");
  const document = form.element.ownerDocument;
  const fields = form.fields ?? [];
  const headerHost = header ?? element(document, "div");
  const findingFiles = [...new Set([entity.file, ...files].filter(Boolean))];
  let destroyed = false;

  const fieldKeyFor = finding => {
    const routed = route?.(finding, entity);
    if (routed === false) return false;
    if (routed === "header") return undefined;
    if (typeof routed === "string" && (fields.some(field => field.key === routed) || fieldBox(form, routed)
      || targets.has(routed))) return routed;
    if (finding.file !== entity.file || !Number.isInteger(finding.line)) return undefined;
    const text = context.package.read(entity.file);
    if (typeof text !== "string") return undefined;
    for (const field of fields) {
      if (field.binding?.file !== entity.file) continue;
      try {
        const range = pointerRange(text, field.binding.pointer);
        if (finding.line >= range.start.line + 1 && finding.line <= range.end.line + 1) return field.key;
      } catch {}
    }
    return undefined;
  };

  const clear = () => {
    for (const box of fieldBoxes(form)) {
      box.querySelectorAll(".opengdd-author-form-finding").forEach(node => node.remove());
      for (const control of fieldControls(box)) {
        if (control.dataset.findingDescribedBase !== undefined) {
          control.setAttribute("aria-describedby", control.dataset.findingDescribedBase);
          delete control.dataset.findingDescribedBase;
        }
      }
    }
    for (const target of targets.values()) {
      target.querySelectorAll?.(".opengdd-author-form-finding").forEach(node => node.remove());
      if (target.dataset.findingDescribedBase !== undefined) {
        target.setAttribute("aria-describedby", target.dataset.findingDescribedBase);
        delete target.dataset.findingDescribedBase;
      }
    }
    headerHost.replaceChildren();
  };

  const refresh = () => {
    if (destroyed) return;
    clear();
    const findings = findingFiles.flatMap(file => context.services.validation.forFile(file)?.findings ?? []);
    const atFields = new Map();
    const atHeader = [];
    for (const finding of findings) {
      const key = fieldKeyFor(finding);
      if (key === false) continue;
      if (key) atFields.set(key, [...(atFields.get(key) ?? []), finding]);
      else atHeader.push(finding);
    }
    for (const [key, items] of atFields) {
      const box = fieldBox(form, key);
      const control = fieldControls(box ?? element(document, "div"))[0];
      const target = targets.get(key);
      if ((!box || !control) && !target) { atHeader.push(...items); continue; }
      if (target && (!box || !control)) {
        const finding = element(document, "p", items.map(item => item.message).join(" "), "opengdd-author-form-finding");
        finding.id = `opengdd-inspector-${key}-finding`;
        target.append(finding);
        target.dataset.findingDescribedBase = target.getAttribute("aria-describedby") ?? "";
        target.setAttribute("aria-describedby", [target.dataset.findingDescribedBase, finding.id].filter(Boolean).join(" "));
        continue;
      }
      if (!control.id) control.id = `opengdd-inspector-${key}`;
      const finding = element(document, "p", items.map(item => item.message).join(" "), "opengdd-author-form-finding");
      finding.id = `${control.id}-finding`;
      box.append(finding);
      control.dataset.findingDescribedBase = control.getAttribute("aria-describedby") ?? "";
      control.setAttribute("aria-describedby", [control.dataset.findingDescribedBase, finding.id].filter(Boolean).join(" "));
    }
    if (atHeader.length) {
      headerHost.append(element(document, "h3", INSPECTOR_COPY.findings));
      const list = element(document, "ul");
      list.dataset.inspectorFindings = "";
      for (const finding of atHeader) {
        const item = element(document, "li");
        const button = element(document, "button", finding.message);
        button.type = "button";
        button.addEventListener("click", () => context.services.validation.reveal(finding));
        item.append(button);
        list.append(item);
      }
      headerHost.append(list);
    }
  };
  const cancel = context.services.validation.subscribe(refresh);
  refresh();
  return Object.freeze({
    fieldKeyFor,
    refresh,
    focusField(key) {
      const control = fieldControls(fieldBox(form, key) ?? element(document, "div"))[0];
      const target = control ?? targets.get(key);
      if (!target) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: "nearest" });
      return true;
    },
    destroy() { destroyed = true; cancel?.(); clear(); }
  });
}

export function compactSections(context, sections, strategy = "summary") {
  const root = element(context.document, "div", undefined, "opengdd-author-inspector-sections");
  let current = [...sections];
  let header = current[0];
  let actions = header?.querySelector?.(".opengdd-author-entity-actions");
  const details = element(context.document, "details", undefined, "opengdd-author-inspector-summary");
  details.dataset.inspectorSummary = "";
  const summary = element(context.document, "summary", INSPECTOR_COPY.more);
  const reconcile = (parent, nodes) => {
    for (const [index, node] of nodes.entries()) {
      if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
    }
    while (parent.children.length > nodes.length) parent.lastElementChild.remove();
  };
  const render = () => {
    const notCompact = context.host.size !== "compact" || strategy === "reflow" || current.length < 2;
    root.classList.toggle("opengdd-author-inspector-sections--split",
      notCompact && current.some(section => section.dataset.inspectorAside !== undefined));
    if (notCompact) {
      if (actions) current[0].append(actions);
      reconcile(root, current);
      return;
    }
    reconcile(details, [summary, ...(actions ? [actions] : []), ...current.slice(1)]);
    reconcile(root, [current[0], details]);
  };
  const cancel = context.host.subscribe(render);
  render();
  return Object.freeze({
    element: root,
    refresh(next) {
      if (Array.isArray(next)) {
        current = [...next];
        if (current[0] !== header) {
          header = current[0];
          actions = header?.querySelector?.(".opengdd-author-entity-actions");
        }
      }
      render();
    },
    destroy: () => cancel?.()
  });
}

export function createEntityInspector(context, shape) {
  const body = element(context.document, "div", undefined, "opengdd-author-entity-inspector");
  body.dataset.entityInspector = shape.id;
  context.element.append(body);
  let form;
  let findings;
  let compact;
  let activeEntity;
  let returnFocus;
  let escapeArmed = false;
  let activeBlocked = false;
  let activeEmptyState = false;
  let activeHeader;
  let activeFormHost;
  let activeHeaderFindings;
  let activeShapeSections = [];
  let activeFields = [];
  let activeFieldLayout = "";
  let activeHasFormHost = false;
  const fieldSignature = fields => fields.map(field => `${field.key}\0${field.binding?.file ?? ""}\0${field.binding?.pointer ?? ""}`).join("\u0001");
  const fieldLayout = groups => (groups ?? []).map(group => group.key).join("\u0001");
  const findingTargets = sections => new Map((sections ?? []).flatMap(section => {
    const nodes = [section, ...[...(section?.querySelectorAll?.("[data-inspector-finding-target]") ?? [])]];
    return nodes.flatMap(node => {
      const key = node?.dataset?.inspectorFindingTarget;
      return key ? [[key, node]] : [];
    });
  }));
  // A shape names the extra files whose findings it routes either as a list
  // or as a function of the entity.
  const findingFiles = entity => {
    const files = shape.findings?.files;
    return typeof files === "function" ? files(context, entity) ?? [] : files ?? [];
  };
  const shapeFields = entity => {
    const groups = shape.fieldGroups?.(context, entity) ?? [];
    return { groups, fields: groups.length ? groups.flatMap(group => group.fields) : shape.fields?.(context, entity) ?? [] };
  };

  const focusField = key => {
    const previous = context.document.activeElement;
    const focused = findings?.focusField(key) ?? false;
    if (focused) {
      returnFocus = previous;
      escapeArmed = true;
    }
    return focused;
  };
  const escape = event => {
    if (!escapeArmed || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    escapeArmed = false;
    returnFocus?.focus?.();
  };
  body.addEventListener("keydown", escape);
  const destroyActive = () => {
    escapeArmed = false;
    findings?.destroy(); findings = undefined;
    form?.destroy(); form = undefined;
    compact?.destroy(); compact = undefined;
  };
  const render = () => {
    destroyActive();
    body.replaceChildren();
    const selection = context.services.selection.current();
    const entity = shape.match(selection, packageFiles(context));
    activeEntity = entity;
    activeEmptyState = Boolean(entity?.emptyState);
    context.surface.empty(!entity);
    if (!entity) return;
    const text = context.package.read(entity.file);
    const create = typeof shape.create === "function" ? shape.create(context, entity) : shape.create;
    const actions = [];
    for (const item of Array.isArray(create) ? create : create ? [create] : []) {
      actions.push({ label: item.label, dataset: item.dataset ?? "entityCreate", run: anchor => item.run(context, { anchor }) });
    }
    if (shape.renameAction) actions.push({ label: INSPECTOR_COPY.rename, dataset: "entityRename",
      run: anchor => shape.renameAction(context, entity, anchor) });
    else if (shape.rename) actions.push({ label: INSPECTOR_COPY.rename, dataset: "entityRename", run: anchor => renameEntity({
      context, anchor, address: shape.rename(entity), initial: entity.id, normalize: shape.normalizeRename,
      onApplied: next => shape.onRenamed?.(context, entity, next)
    }) });
    if (shape.remove) actions.push({ label: INSPECTOR_COPY.remove, dataset: "entityRemove", run: anchor => removeEntity({
      context, anchor, address: entity.address, file: entity.file, label: entity.title ?? entity.id, ...shape.remove(entity)
    }) });
    if (typeof text === "string") actions.push({ label: INSPECTOR_COPY.showInFile(entity.file), dataset: "openInEditor", run: () => openInEditor(context, entity) });
    if (entity.emptyState) {
      const header = entityHeader({ document: context.document, context, entity,
        actions: actions.filter(action => action.dataset === "openInEditor") });
      header.append(element(context.document, "p", entity.emptyState, "opengdd-author-form-help"));
      compact = compactSections(context, [header], shape.compact);
      body.append(compact.element);
      activeBlocked = false;
      return;
    }
    const blocked = typeof shape.blocked === "function"
      ? shape.blocked(context, entity, text)
      : jsonEntity(entity) && typeof text === "string" ? structuredEditBlocked(text) : undefined;
    activeBlocked = Boolean(blocked);
    const visibleActions = blocked ? actions.filter(action => action.dataset === "openInEditor") : actions;
    const header = entityHeader({ document: context.document, context, entity, actions: visibleActions });
    if (shape.headerHelp) header.append(element(context.document, "p",
      typeof shape.headerHelp === "function" ? shape.headerHelp(entity) : shape.headerHelp,
      "opengdd-author-form-help"));
    const headerFindings = element(context.document, "section");
    headerFindings.dataset.entityFindings = "";
    activeHeader = header;
    activeHeaderFindings = headerFindings;
    if (blocked) {
      header.append(element(context.document, "p", blocked || INSPECTOR_COPY.unreadable, "opengdd-author-form-error"));
      compact = compactSections(context, [header], shape.compact);
      body.append(compact.element);
      return;
    }
    const { groups, fields } = shapeFields(entity);
    const formHost = element(context.document, "div");
    activeFields = fields;
    activeFieldLayout = fieldLayout(groups);
    activeHasFormHost = Boolean(groups.length || fields.length);
    activeFormHost = formHost;
    if (groups.length) {
      const mountedForms = [];
      for (const group of groups) {
        const groupFormHost = element(context.document, "div");
        const groupContent = group.element.querySelector?.(".opengdd-author-reference-content") ?? group.element;
        const groupAction = [...groupContent.children].find(node => node.classList?.contains("opengdd-author-reference-action"));
        groupContent.insertBefore(groupFormHost, groupAction ?? null);
        if (group.after) groupContent.append(group.after);
        formHost.append(group.element);
        mountedForms.push(context.services.forms.create(groupFormHost, {
          fields: group.fields,
          labels: { change: INSPECTOR_COPY.changeField },
          onChange: () => findings?.refresh()
        }));
      }
      form = Object.freeze({
        element: formHost, fields: Object.freeze([...fields]),
        refresh() { for (const mounted of mountedForms) mounted.refresh(); },
        destroy() { for (const mounted of mountedForms) mounted.destroy(); formHost.replaceChildren(); }
      });
    } else form = context.services.forms.create(formHost, {
      fields,
      labels: { change: INSPECTOR_COPY.changeField },
      onChange: () => findings?.refresh()
    });
    const sections = [header];
    if (activeHasFormHost) sections.push(formHost);
    activeShapeSections = shape.sections?.(context, entity) ?? [];
    findings = attachFindings(form, { context, entity, route: shape.findings?.route,
      header: headerFindings, targets: findingTargets([formHost, ...activeShapeSections]), files: findingFiles(entity) });
    sections.push(...activeShapeSections, headerFindings);
    compact = compactSections(context, sections, shape.compact);
    body.append(compact.element);
    const pending = context.internal?.takeFocusField?.(entity.file);
    if (pending) {
      const key = typeof pending === "string" ? pending : findings.fieldKeyFor(pending)
        ?? (Number.isInteger(pending.line) ? fields.find(field => field.binding?.pointer === pointerAtLine(text, pending.line))?.key : undefined);
      if (key) {
        queueMicrotask(() => focusField(key));
        return true;
      }
    }
    return false;
  };
  const sameEntity = (left, right) => Boolean(left && right
    && left.id === right.id && left.address === right.address && left.file === right.file && left.title === right.title);
  const refreshPackage = () => {
    const selection = context.services.selection.current();
    const entity = shape.match(selection, packageFiles(context));
    const text = entity?.file ? context.package.read(entity.file) : undefined;
    // A shape's blocked hook is only asked about an entity it matched; with no
    // entity the inspector shows its empty state and nothing is blocked.
    const blocked = !entity ? false : typeof shape.blocked === "function"
      ? Boolean(shape.blocked(context, entity, text))
      : jsonEntity(entity) && typeof text === "string" && Boolean(structuredEditBlocked(text));
    const emptyState = Boolean(entity?.emptyState);
    const next = !blocked && entity && !emptyState ? shapeFields(entity) : { groups: [], fields: [] };
    const nextFields = next.fields;
    if (!sameEntity(activeEntity, entity) || activeBlocked !== blocked || activeEmptyState !== emptyState
      || (!form && !blocked && !emptyState)
      || activeFieldLayout !== fieldLayout(next.groups)
      || fieldSignature(activeFields) !== fieldSignature(nextFields)) return render();
    if (blocked) return false;
    activeEntity = entity;
    form.refresh();
    activeShapeSections = shape.sections?.(context, entity) ?? [];
    findings?.destroy();
    findings = attachFindings(form, { context, entity, route: shape.findings?.route,
      header: activeHeaderFindings, targets: findingTargets([activeFormHost, ...activeShapeSections]), files: findingFiles(entity) });
    compact.refresh([
      activeHeader,
      ...(activeHasFormHost ? [activeFormHost] : []),
      ...activeShapeSections,
      activeHeaderFindings
    ]);
    return false;
  };
  const cancelSelection = context.services.selection.subscribe(render);
  const cancelPackage = context.package.subscribe(refreshPackage);
  render();
  return Object.freeze({
    focusField,
    refresh: render,
    destroy() {
      body.removeEventListener("keydown", escape);
      destroyActive(); cancelSelection(); cancelPackage(); body.remove();
    },
    get entity() { return activeEntity; }
  });
}
