import { MECHANISMS, kindDefinition, kindDisplayName, mechanismForDefinition } from "./kinds.mjs";

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
const positionAt = (text, offset) => {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, character: lines.at(-1).length };
};
const regexpEscape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const designerFile = file => typeof file === "string" && !file.startsWith("panels/");

function headingLineRange(text, range) {
  if (typeof text !== "string" || !Number.isInteger(range?.start?.line)) return undefined;
  const line = text.split(/\r?\n/u)[range.start.line];
  if (line === undefined) return undefined;
  return { start: { line: range.start.line, character: 0 }, end: { line: range.start.line, character: line.length } };
}

function headingExtent(text, range) {
  if (typeof text !== "string" || !Number.isInteger(range?.start?.line)) return undefined;
  const lines = text.split(/\r?\n/u);
  const startLine = range.start.line;
  const heading = /^(#{1,6})\s+/u.exec(lines[startLine] ?? "");
  if (!heading) return undefined;
  let endLine = lines.length - 1;
  for (let index = startLine + 1; index < lines.length; index += 1) {
    const next = /^(#{1,6})\s+/u.exec(lines[index]);
    if (next && next[1].length <= heading[1].length) { endLine = index - 1; break; }
  }
  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine, character: (lines[endLine] ?? "").length }
  };
}

function viewingRoutables(text, viewing, revision) {
  if (!text || !viewing || Array.isArray(viewing) || typeof viewing !== "object") return [];
  const section = new RegExp(`${regexpEscape(JSON.stringify("viewing"))}\\s*:\\s*\\{`, "u").exec(text);
  if (!section) return [];
  let cursor = section.index + section[0].length;
  return Object.keys(viewing).flatMap(name => {
    const quoted = JSON.stringify(name);
    const key = new RegExp(`${regexpEscape(quoted)}\\s*:`, "gu");
    key.lastIndex = cursor;
    const match = key.exec(text);
    if (!match) return [];
    cursor = match.index + match[0].length;
    const startOffset = match.index + 1;
    const endOffset = match.index + quoted.length - 1;
    return [{
      identity: stableIdentity("viewing", `viewing.${name}`, "direction.json"),
      kind: "viewing",
      mechanism: "direction",
      entity: false,
      name: `viewing.${name}`,
      display: `viewing.${name}`,
      file: "direction.json",
      range: { start: positionAt(text, startOffset), end: positionAt(text, endOffset) },
      revision,
      citations: [],
      rangeTag: ""
    }];
  });
}

// No analysis-owned object, array, Map, range, or value is shared with the
// returned structuredClone-able view; consumers may treat it as isolated data.
export function buildAuthoringView(analysis, revisionFor = () => undefined, files, detectedLinkOffers = [], rangeRefusalFor = () => undefined) {
  if (!(files instanceof Map)) throw new TypeError("buildAuthoringView requires the package files Map");
  const fileEntries = [...files];
  const fileList = fileEntries.map(([file]) => file);
  const fileSet = new Set(fileList);
  const fileText = new Map(fileEntries);
  let tuningRanges = {};
  try {
    const tuning = JSON.parse(fileText.get("tuning.json"));
    if (tuning?.ranges && !Array.isArray(tuning.ranges) && typeof tuning.ranges === "object") tuningRanges = tuning.ranges;
  } catch {}
  const questionIndexesById = new Map();
  try {
    const personalization = JSON.parse(fileText.get("personalization.json"));
    for (const [index, question] of (personalization?.questions ?? []).entries()) {
      if (typeof question?.id !== "string") continue;
      questionIndexesById.set(question.id, [...(questionIndexesById.get(question.id) ?? []), index]);
    }
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
    let questionOccurrence = 0;
    for (const definition of named.definitions ?? []) {
      const mechanism = mechanismForDefinition(definition);
      if (!mechanism) continue;
      const physical = physicalIdentity(definition);
      const declaredIndex = definition.kind === "question"
        ? (Number.isInteger(definition.index) && definition.index >= 0
          ? definition.index : questionIndexesById.get(named.name)?.[questionOccurrence])
        : undefined;
      if (definition.kind === "question") questionOccurrence += 1;
      const current = byPhysicalIdentity.get(physical);
      if (!current || named.name.length < current.name.length) {
        const kind = kindDefinition(definition.kind);
        const identityFile = definition.kind === "collection" ? `collections/${named.name}/` : definition.file;
        // A section's range is its whole heading line, as the documented
        // selection promises; the analysis records only the title span.
        const range = definition.kind === "section"
          ? headingLineRange(fileText.get(definition.file), definition.range) ?? copyRange(definition.range)
          : copyRange(definition.range);
        byPhysicalIdentity.set(physical, {
          identity: stableIdentity(definition.kind, named.name, identityFile),
          kind: definition.kind,
          mechanism,
          entity: kind.entity,
          name: named.name,
          display: kindDisplayName(definition.kind, named.name),
          file: definition.file,
          range,
          ...(definition.kind === "section" ? { extent: headingExtent(fileText.get(definition.file), range) } : {}),
          revision: revisionFor(definition.file),
          citations: [],
          ...(definition.kind === "question" ? { declaredIndex } : {}),
          rangeTag: definition.kind === "value" && Array.isArray(tuningRanges[named.name])
            ? `[${tuningRanges[named.name].join(", ")}]`
            : "",
          rangeRefusal: definition.kind === "value" && Array.isArray(tuningRanges[named.name])
            ? rangeRefusalFor(named.name)
            : undefined
        });
      }
    }
  }

  const directionText = fileText.get("direction.json");
  if (typeof directionText === "string") {
    let direction;
    try { direction = JSON.parse(directionText); } catch {}
    for (const entry of viewingRoutables(directionText, direction?.viewing, revisionFor("direction.json"))) {
      byPhysicalIdentity.set(`${entry.kind}\0${entry.file}\0${entry.range.start.line}\0${entry.range.start.character}`, entry);
    }
  }

  const routables = [...byPhysicalIdentity.values()].sort((left, right) => left.name.localeCompare(right.name)
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

  const hasKind = kind => routables.some(entry => entry.kind === kind);
  const mechanismPresent = definition => {
    if (definition.kernel || definition.id === "contracts") return true;
    if (definition.id === "direction") return fileSet.has("direction.json");
    if (definition.id === "time") return fileSet.has("clocks.json") || hasKind("runtime");
    if (definition.id === "personalization") return fileSet.has("personalization.json");
    return routables.some(entry => entry.mechanism === definition.id);
  };

  const entitiesFor = id => routables.filter(entry => entry.mechanism === id && entry.entity).map(entity => {
    if (entity.kind === "collection") {
      const prefix = `collections/${entity.name}/`;
      const records = routables.filter(entry => entry.kind === "collection-record" && entry.file.startsWith(prefix));
      return {
        ...copyValue(entity),
        location: prefix,
        count: records.length,
        linkOffers: detectedLinkOffers.filter(offer => offer.drawer === entity.name).map(copyValue)
      };
    }
    if (entity.kind === "contract") {
      let adoption;
      try { adoption = JSON.parse(fileText.get(entity.file)); } catch {}
      const packPath = /^sha256:[0-9a-f]{64}$/.test(adoption?.pack ?? "")
        ? `contracts/${adoption.contract}-${adoption.version}.pack.json` : "";
      return {
        ...copyValue(entity),
        location: entity.file,
        packPath,
        mode: packPath && fileSet.has(packPath) ? "checked" : "promised"
      };
    }
    return copyValue(entity);
  }).sort((left, right) => left.name.localeCompare(right.name)
    || left.file.localeCompare(right.file) || left.range.start.line - right.range.start.line);

  return {
    definitionsByName,
    anchors: (analysis?.anchors ?? []).map(copyValue),
    nameCount: completionNames.length,
    declarationCount: completionNames.reduce((total, entry) => total
      + entry.definitions.filter(definition => designerFile(definition.file)).length, 0),
    wordCounts: analysis?.wordCounts
      ? Object.fromEntries(Object.entries(copyValue(analysis.wordCounts)).filter(([file]) => designerFile(file)))
      : Object.fromEntries(fileList.filter(designerFile)
        .map(file => [file, wordCount(analysis?.documents?.get?.(file) ?? "")])),
    completionNames,
    manifest: copyValue(analysis?.manifest ?? null),
    revisions: Object.fromEntries(fileList.map(file => [file, revisionFor(file)])),
    routables: routables.map(copyValue),
    mechanisms: MECHANISMS.filter(mechanismPresent).map(definition => ({
      id: definition.id,
      file: definition.file,
      entities: entitiesFor(definition.id)
    }))
  };
}
