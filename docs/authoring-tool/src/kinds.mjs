const group = (id, order) => Object.freeze({ id, order });
const row = (kind, singular, plural, outlineGroups, colorClass, selection = true) => Object.freeze({
  kind,
  labels: Object.freeze({ singular, plural }),
  outlineGroups: Object.freeze(outlineGroups),
  colorClass,
  selection
});

// One vocabulary for analysis declarations, outline routing, editor colour,
// creation copy, and panel selection.
export const KIND_TAXONOMY = Object.freeze([
  row("pillars", "pillar", "pillars", [group("pillars", 0)], "pillars"),
  row("anti", "anti-reference", "anti-references", [group("anti", 1)], "anti"),
  row("must_keep", "what-must-stay entry", "what-must-stay entries", [group("must_keep", 2)], "must_keep"),
  row("mood", "mood", "moods", [group("mood", 3)], "mood"),
  row("palette", "palette", "palettes", [group("palette", 4)], "palette"),
  row("color", "colour", "colours", [group("palette", 4)], "color"),
  row("colors", "colour promise", "colour promises", [group("colors", 5)], "colors"),
  row("contrast", "contrast promise", "contrast promises", [group("contrast", 6)], "contrast"),
  row("timing", "timing promise", "timing promises", [group("timing", 7)], "timing"),
  row("value", "value", "values", [group("values", 8)], "value"),
  row("rule", "rule", "rules", [group("rules", 9)], "rule"),
  row("runtime", "runtime value", "runtime values", [group("runtime", 10)], "runtime"),
  row("clock", "clock", "clocks", [group("clocks", 11)], "clock"),
  row("ruleset", "ruleset", "rulesets", [group("rulesets", 12)], "ruleset"),
  row("section", "section", "sections", [group("sections", 13)], "section"),
  row("acceptance-test", "acceptance test", "acceptance tests", [group("acceptance-tests", 14)], "acceptance-test"),
  row("collection", "collection", "collections", [group("collections", 15)], "collection"),
  row("collection-record", "collection record", "collection records", [group("collections", 15)], "collection-record"),
  row("contract", "contract", "contracts", [group("contracts", 16)], "contract"),
  row("contract-value", "contract value", "contract values", [group("contracts", 16)], "contract"),
  row("question", "personalization question", "personalization questions", [group("questions", 17)], "question"),
  row("file", "file", "files", [], "file"),
  row("name", "name", "names", [], "name", false),
  row("identifier", "identifier", "identifiers", [], "name"),
  row("folder", "folder", "folders", [], "file")
]);

const KIND_BY_NAME = new Map(KIND_TAXONOMY.map(item => [item.kind, item]));
const GROUPS = new Map();
for (const item of KIND_TAXONOMY) {
  for (const outlineGroup of item.outlineGroups) {
    const current = GROUPS.get(outlineGroup.id) ?? { id: outlineGroup.id, order: outlineGroup.order, kinds: [] };
    current.kinds.push(item.kind);
    GROUPS.set(outlineGroup.id, current);
  }
}

export const OUTLINE_KIND_GROUPS = Object.freeze([...GROUPS.values()]
  .sort((left, right) => left.order - right.order)
  .map(item => Object.freeze({ id: item.id, kinds: Object.freeze(item.kinds) })));

export const KIND_LABELS = Object.freeze(Object.fromEntries(
  KIND_TAXONOMY.map(item => [item.kind, item.labels.singular])
));

export const SELECTION_KINDS = Object.freeze(KIND_TAXONOMY
  .filter(item => item.selection)
  .map(item => item.kind));

export function kindDefinition(kind) {
  return KIND_BY_NAME.get(kind) ?? KIND_BY_NAME.get("name");
}

export function kindClass(kind) {
  return kindDefinition(kind).colorClass;
}

export function kindsForOutlineGroup(id) {
  return OUTLINE_KIND_GROUPS.find(item => item.id === id)?.kinds ?? Object.freeze([]);
}

export function outlineGroupForDefinition(definition) {
  return kindDefinition(definition.kind).outlineGroups[0]?.id ?? "";
}
