import { OUTLINE_KIND_GROUPS, outlineGroupForDefinition } from "./kinds.mjs";

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
export function buildAuthoringView(analysis, revisionFor = () => undefined, files, detectedLinkOffers = [], rangeRefusalFor = () => undefined) {
  if (!(files instanceof Map)) throw new TypeError("buildAuthoringView requires the package files Map");
  const fileEntries = [...files];
  const fileList = fileEntries.map(([file]) => file);
  const fileSet = new Set(fileList);
  const fileText = new Map(fileEntries);
  let tuningRanges = {};
  let tuningRulesPresent = false;
  try {
    const tuning = JSON.parse(fileText.get("tuning.json"));
    if (tuning?.ranges && !Array.isArray(tuning.ranges) && typeof tuning.ranges === "object") tuningRanges = tuning.ranges;
    tuningRulesPresent = Boolean(tuning?.rules && !Array.isArray(tuning.rules)
      && typeof tuning.rules === "object" && Object.keys(tuning.rules).length);
  } catch {}
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
      const outlineGroup = outlineGroupForDefinition(definition);
      if (!outlineGroup) continue;
      const display = outlineGroup === "rules" && !named.name.startsWith("rules.")
        ? `rules.${named.name}`
        : named.name;
      const physical = physicalIdentity(definition);
      const current = byPhysicalIdentity.get(physical);
      if (!current || named.name.length < current.name.length) {
        byPhysicalIdentity.set(physical, {
          identity: stableIdentity(definition.kind, named.name, definition.kind === "collection" ? `collections/${named.name}/` : definition.file),
          kind: definition.kind,
          kindTag: ["collection", "contract"].includes(definition.kind) ? definition.kind : "",
          rangeTag: definition.kind === "value" && Array.isArray(tuningRanges[named.name])
            ? `[${tuningRanges[named.name].join(", ")}]`
            : "",
          rangeRefusal: definition.kind === "value" && Array.isArray(tuningRanges[named.name])
            ? rangeRefusalFor(named.name)
            : undefined,
          outlineGroup,
          name: named.name,
          display: definition.kind === "contract" ? named.name.slice("contracts.".length) : display,
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

  const entriesFor = id => entries.filter(entry => entry.outlineGroup === id);
  const hasKind = kind => entries.some(entry => entry.kind === kind);
  const groupPresent = id => {
    if (["sections", "values", "collections", "contracts", "acceptance-tests"].includes(id)) return true;
    if (["pillars", "anti", "must_keep", "mood", "palette", "colors", "contrast", "timing"].includes(id)) {
      return fileSet.has("direction.json");
    }
    if (id === "runtime" || id === "clocks") return fileSet.has("clocks.json") || hasKind("runtime");
    if (id === "rulesets") return hasKind("ruleset");
    if (id === "questions") return fileSet.has("personalization.json");
    if (id === "rules") return tuningRulesPresent;
    return entriesFor(id).length > 0;
  };
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
    groups: OUTLINE_KIND_GROUPS.filter(group => groupPresent(group.id)).map(group => {
      if (group.id === "palette") {
        const colors = entriesFor(group.id).filter(entry => entry.kind === "color");
        return {
          id: group.id,
          entries: entriesFor(group.id).filter(entry => entry.kind === "palette").map(palette => ({
            ...copyValue(palette),
            children: colors.filter(color => color.name.startsWith(`${palette.name}.`)).map(copyValue)
          }))
        };
      }
      if (group.id === "contracts") {
        const values = entriesFor(group.id).filter(entry => entry.kind === "contract-value");
        return {
          id: group.id,
          entries: entriesFor(group.id).filter(entry => entry.kind === "contract")
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(contract => {
              let adoption;
              try { adoption = JSON.parse(fileText.get(contract.file)); } catch {}
              const packPath = /^sha256:[0-9a-f]{64}$/.test(adoption?.pack ?? "")
                ? `contracts/${adoption.contract}-${adoption.version}.pack.json` : "";
              const checked = Boolean(packPath && fileSet.has(packPath));
              return {
                ...copyValue(contract),
                location: contract.file,
                packPath,
                mode: checked ? "checked" : "promised",
                children: values.filter(value => value.file === contract.file)
                  .sort((left, right) => left.range.start.line - right.range.start.line || left.name.localeCompare(right.name)).map(copyValue)
              };
            })
        };
      }
      if (group.id !== "collections") return { id: group.id, entries: entriesFor(group.id).map(copyValue) };
      const records = entries.filter(entry => entry.kind === "collection-record");
      return {
        id: group.id,
        entries: entriesFor(group.id).filter(entry => entry.kind === "collection")
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
              linkOffers: detectedLinkOffers.filter(offer => offer.drawer === collection.name).map(copyValue),
              children
            };
          })
      };
    })
  };
}
