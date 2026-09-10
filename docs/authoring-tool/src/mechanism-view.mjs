import { MECHANISMS } from "./kinds.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { entityChips, referenceGroup } from "./inspector-groups.mjs";

export function mechanismEntity(context, selection) {
  if (selection?.kind !== "mechanism") return null;
  const copy = WIDGET_COPY.outlineMechanisms[selection.name];
  return {
    id: selection.name,
    address: null,
    kindLabel: INSPECTOR_COPY.mechanismKind,
    title: copy?.label ?? selection.name, titleIsProse: true,
    file: selection.file,
    range: selection.range
  };
}

export function mechanismCreate(context, entity) {
  if (entity.id === "tuning") return undefined;
  const mechanism = MECHANISMS.find(candidate => candidate.id === entity.id);
  const copy = WIDGET_COPY.outlineMechanisms[entity.id];
  if (!mechanism?.create || !copy?.action) return undefined;
  return {
    kind: mechanism.entityKinds[0],
    label: copy.action,
    run(_context, request = {}) {
      return context.internal.create(mechanism.create, request.anchor);
    }
  };
}

export function mechanismSections(context, entity) {
  const mechanismView = context.internal.mechanism(entity.id);
  const declarations = entity.file ? context.internal.mechanismDeclarations(entity.id) : [];
  const copy = WIDGET_COPY.outlineMechanisms[entity.id];
  const rows = declarations.length ? entityChips(context, declarations.map(declaration => ({
    name: declaration.entry.display || declaration.entry.name, kind: declaration.entry.kind,
    detail: declaration.detail, dataset: { mechanismDeclaration: declaration.entry.name },
    selection: { kind: declaration.entry.kind, name: declaration.entry.name,
      file: declaration.entry.file, range: declaration.entry.range }
  }))) : undefined;
  const emptyHelp = !mechanismView?.entities.length && copy?.empty ? copy.empty : INSPECTOR_COPY.mechanismNoDeclarations;
  const section = referenceGroup(context, { label: INSPECTOR_COPY.mechanismDeclarations,
    help: declarations.length ? INSPECTOR_COPY.mechanismDeclarationsHelp : emptyHelp,
    rows: rows ? [rows] : [] });
  section.dataset.mechanismDeclarations = entity.id;
  return [section];
}
