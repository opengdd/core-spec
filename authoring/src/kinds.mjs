const row = (kind, singular, plural, mechanism, entity, colorClass, selection = true, display = "full", mechanismOwned = false) => Object.freeze({
  kind,
  labels: Object.freeze({ singular, plural }),
  mechanism,
  entity,
  colorClass,
  selection,
  display,
  mechanismOwned
});

// One vocabulary for analysis declarations, outline routing, editor colour,
// creation copy, and panel selection. A kind can belong to a mechanism
// without being an outline entity: those declarations remain selectable and
// citable, while their inspector-owning entity (or mechanism) owns the row.
export const KIND_TAXONOMY = Object.freeze([
  row("collection", "collection", "collections", "collections", true, "collection"),
  row("collection-record", "collection record", "collection records", "collections", false, "collection-record"),
  row("contract", "contract", "contracts", "contracts", true, "contract", true, "bare"),
  row("contract-value", "contract value", "contract values", "contracts", false, "contract"),
  row("value", "value", "values", "tuning", true, "value"),
  row("rule", "rule", "rules", "tuning", true, "rule"),
  row("runtime", "runtime value", "runtime values", "time", false, "runtime", true, "full", true),
  row("clock", "clock", "clocks", "time", true, "clock", true, "bare"),
  row("section", "section", "sections", "sections", true, "section"),
  row("ruleset", "ruleset", "rulesets", "sections", false, "ruleset"),
  row("mood", "mood", "moods", "direction", true, "mood", true, "bare"),
  row("palette", "palette", "palettes", "direction", true, "palette", true, "bare"),
  row("color", "colour", "colours", "direction", false, "color"),
  row("colors", "colour promise", "colour promises", "direction", true, "colors", true, "bare"),
  row("contrast", "contrast promise", "contrast promises", "direction", true, "contrast", true, "bare"),
  row("timing", "timing promise", "timing promises", "direction", true, "timing", true, "bare"),
  row("pillars", "pillar", "pillars", "direction", false, "pillars", true, "full", true),
  row("anti", "anti-reference", "anti-references", "direction", false, "anti", true, "full", true),
  row("must_keep", "what-must-stay entry", "what-must-stay entries", "direction", false, "must_keep", true, "full", true),
  row("viewing", "viewing condition", "viewing conditions", "direction", false, "", true, "full", true),
  row("acceptance-test", "acceptance test", "acceptance tests", "acceptance-tests", true, "acceptance-test"),
  row("question", "question", "questions", "personalization", true, "question"),
  row("mechanism", "mechanism", "mechanisms", "", false, "", true),
  row("file", "file", "files", "", false, "file"),
  row("name", "name", "names", "", false, "name", false),
  row("identifier", "identifier", "identifiers", "", false, "name"),
  row("folder", "folder", "folders", "", false, "file")
]);

const mechanism = (id, entityKinds, kernel, file, create) => Object.freeze({
  id,
  entityKinds: Object.freeze(entityKinds),
  kernel,
  file,
  create
});

export const MECHANISMS = Object.freeze([
  mechanism("collections", ["collection"], true, "", "Collection"),
  mechanism("contracts", ["contract"], false, "", "Contract"),
  mechanism("tuning", ["value", "rule"], true, "tuning.json", "Value"),
  mechanism("time", ["clock"], false, "clocks.json", "Clock"),
  mechanism("direction", ["mood", "palette", "colors", "contrast", "timing"], false, "direction.json", "Mood"),
  mechanism("sections", ["section"], true, "", "Chapter"),
  mechanism("acceptance-tests", ["acceptance-test"], true, "", "Acceptance test"),
  mechanism("personalization", ["question"], false, "personalization.json", "Question")
]);

const KIND_BY_NAME = new Map(KIND_TAXONOMY.map(item => [item.kind, item]));
const MECHANISM_BY_ID = new Map(MECHANISMS.map(item => [item.id, item]));

export const KIND_LABELS = Object.freeze(Object.fromEntries(
  KIND_TAXONOMY.map(item => [item.kind, item.labels.singular])
));

export const SELECTION_KINDS = Object.freeze(KIND_TAXONOMY
  .filter(item => item.selection)
  .map(item => item.kind));

export function kindDefinition(kind) {
  return KIND_BY_NAME.get(kind) ?? KIND_BY_NAME.get("name");
}

export function kindColorClass(kind) {
  return KIND_BY_NAME.get(kind)?.colorClass ?? "";
}

export function kindClass(kind) {
  return kindColorClass(kind) || kindDefinition("name").colorClass;
}

export function kindDisplayName(kind, name) {
  return KIND_BY_NAME.get(kind)?.display === "bare" && name.includes(".") ? name.slice(name.indexOf(".") + 1) : name;
}

export function mechanismDefinition(id) {
  return MECHANISM_BY_ID.get(id);
}

export function mechanismForDefinition(definition) {
  return kindDefinition(definition.kind).mechanism;
}

export function entityKindsForMechanism(id) {
  return MECHANISM_BY_ID.get(id)?.entityKinds ?? Object.freeze([]);
}
