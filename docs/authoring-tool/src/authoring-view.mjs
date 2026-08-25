const GROUPS = Object.freeze([
  { id: "identifiers", kinds: ["name"] },
  { id: "tuning-keys", kinds: ["tunable", "constant"] },
  { id: "collections", kinds: ["collection", "collection-record"] },
  { id: "descriptors", kinds: ["descriptor"] },
  { id: "palettes", kinds: ["palette"] }
]);

const physicalIdentity = definition => `${definition.kind}\0${definition.file}\0${definition.range.start.line}\0${definition.range.start.character}`;
const stableIdentity = (kind, name, file) => `${kind}\0${name}\0${file}`;
const copyValue = value => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [copyValue(key), copyValue(item)]));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  return value;
};
const copyPosition = position => ({ line: position.line, character: position.character });
const copyRange = range => ({ start: copyPosition(range.start), end: copyPosition(range.end) });
const wordCount = text => text.trim() ? text.trim().split(/\s+/u).length : 0;

// No analysis-owned object, array, Map, range, or value is shared with the
// returned structuredClone-able view; consumers may treat it as isolated data.
export function buildAuthoringView(analysis, revisionFor = () => undefined, files = []) {
  const definitionsByName = new Map();
  const completionNames = [];
  for (const named of analysis?.nameIndex ?? []) {
    const definitions = (named.definitions ?? []).map(copyValue);
    const current = definitionsByName.get(named.name) ?? [];
    definitionsByName.set(named.name, [...current, ...definitions]);
    completionNames.push({ name: named.name, definitions: definitions.map(copyValue) });
  }
  const byPhysicalIdentity = new Map();
  for (const named of analysis?.nameIndex ?? []) {
    for (const definition of named.definitions ?? []) {
      if (!GROUPS.some(group => group.kinds.includes(definition.kind))) continue;
      const physical = physicalIdentity(definition);
      const current = byPhysicalIdentity.get(physical);
      if (!current || named.name.length < current.name.length) {
        byPhysicalIdentity.set(physical, {
          identity: stableIdentity(definition.kind, named.name, definition.kind === "collection" ? `collections/${named.name}/` : definition.file),
          kind: definition.kind,
          kindTag: definition.kind === "tunable" || definition.kind === "constant" || definition.kind === "collection" ? definition.kind : "",
          name: named.name,
          file: definition.file,
          range: copyRange(definition.range),
          revision: revisionFor(definition.file),
          citations: []
        });
      }
    }
  }

  const entries = [...byPhysicalIdentity.values()].sort((left, right) => left.name.localeCompare(right.name)
    || left.file.localeCompare(right.file) || left.range.start.line - right.range.start.line);

  const citationOrdinals = new Map();
  for (const anchor of analysis?.anchors ?? []) {
    const targets = (anchor.definitions ?? []).map(definition => byPhysicalIdentity.get(physicalIdentity(definition))).filter(Boolean);
    for (const entry of targets) {
      const ordinalKey = `${entry.identity}\0${anchor.name}\0${anchor.file}`;
      const ordinal = citationOrdinals.get(ordinalKey) ?? 0;
      citationOrdinals.set(ordinalKey, ordinal + 1);
      const identity = `${ordinalKey}\0${ordinal}`;
      if (entry.citations.some(citation => citation.identity === identity)) continue;
      entry.citations.push({
        identity,
        name: anchor.name,
        file: anchor.file,
        range: copyRange(anchor.range),
        revision: revisionFor(anchor.file)
      });
    }
  }

  const fileList = [...files];
  return {
    definitionsByName,
    anchors: (analysis?.anchors ?? []).map(copyValue),
    nameCount: completionNames.length,
    declarationCount: completionNames.reduce((total, entry) => total + entry.definitions.length, 0),
    wordCounts: analysis?.wordCounts
      ? copyValue(analysis.wordCounts)
      : Object.fromEntries(fileList.map(file => [file, wordCount(analysis?.documents?.get?.(file) ?? "")])),
    completionNames,
    manifest: copyValue(analysis?.manifest ?? null),
    revisions: Object.fromEntries(fileList.map(file => [file, revisionFor(file)])),
    groups: GROUPS.map(group => {
      if (group.id !== "collections") return {
        id: group.id,
        entries: entries.filter(entry => group.kinds.includes(entry.kind)).map(copyValue)
      };
      const records = entries.filter(entry => entry.kind === "collection-record");
      return {
        id: group.id,
        entries: entries.filter(entry => entry.kind === "collection")
          .sort((left, right) => left.name.localeCompare(right.name))
          .map(collection => {
            const prefix = `collections/${collection.name}/`;
            const children = records.filter(record => record.file.startsWith(prefix))
              .sort((left, right) => left.name.localeCompare(right.name) || left.file.localeCompare(right.file))
              .map(copyValue);
            return {
              ...copyValue(collection),
              location: prefix,
              count: children.length,
              children
            };
          })
      };
    })
  };
}
