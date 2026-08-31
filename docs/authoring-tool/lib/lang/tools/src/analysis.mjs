import { isObject, markdownSlug, unfencedLines } from "../../../opengdd/conformance/package-syntax.mjs";

const DOTTED_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const FILE_ANCHOR = /^(?:[^`\s#]+\/)*[^`\s#]+\.(?:json|md|txt|csv|tsv|ya?ml)(?:#[A-Za-z0-9._-]+)?$/i;
const ID_ANCHOR = /^(?:AT-\d+|RULE-[A-Za-z0-9._-]+|INV-[A-Za-z0-9._-]+)$/i;
const SECTION_ANCHOR = /^#[A-Za-z0-9._-]+$/;

function zeroRange(line = 0, start = 0, length = 1) {
  return {
    start: { line, character: start },
    end: { line, character: start + Math.max(length, 1) }
  };
}

function jsonKeyRange(text, key, from = 0) {
  const needle = JSON.stringify(key);
  const index = text.indexOf(needle, from);
  if (index < 0) return zeroRange();
  const prefix = text.slice(0, index);
  const line = (prefix.match(/\n/g) ?? []).length;
  const lastBreak = prefix.lastIndexOf("\n");
  const character = index - lastBreak;
  return zeroRange(line, character, key.length);
}

function nameIndexAdd(definition) {
  const current = this.byName.get(definition.name) ?? [];
  const identity = `${definition.kind}\0${definition.file}\0${definition.range.start.line}\0${definition.range.start.character}`;
  if (!current.some(item => item.identity === identity)) {
    current.push({ ...definition, identity });
    this.byName.set(definition.name, current);
  }
}

function nameIndexEntries() {
  return [...this.byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, definitions]) => ({
      name,
      definitions: definitions.map(({ identity, ...definition }) => definition)
    }));
}

function makeNameIndex() {
  return { byName: new Map(), add: nameIndexAdd, entries: nameIndexEntries };
}

function addJsonNames(index, relative, text, document, problems) {
  if (!isObject(document)) return;
  if (isObject(document.values)) {
    let cursor = text.indexOf('"values"');
    for (const [name, value] of Object.entries(document.values)) {
      const range = jsonKeyRange(text, name, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(name), Math.max(cursor, 0)) + 1;
      index.add({ name, kind: "value", value, file: relative, range, detail: `values.${name}` });
    }
  }
  if (isObject(document.rules)) {
    let cursor = text.indexOf('"rules"');
    for (const [name, value] of Object.entries(document.rules)) {
      const range = jsonKeyRange(text, name, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(name), Math.max(cursor, 0)) + 1;
      index.add({ name, kind: "rule", value, file: relative, range, detail: "tuning rule" });
    }
  }
  if (problems && !isObject(document.values)) {
    problems.push({ file: relative, message: "tuning.json has no values object", range: zeroRange() });
  }
}


// SPEC §3/§4 — the `direction.json` palette map.
//
// The names added mirror conformance/validate-core.mjs's resolvePaletteReference
// exactly: `palette.<key>` names a palette, `palette.<key>.<name>` names one
// color in one, and the two-pass order tries the whole reference text as a
// palette key BEFORE splitting its last segment off as a color name. Palette
// keys are dotted (a package may declare `floor.lit`), so the order is what
// keeps `palette.floor.lit` naming the palette instead of a `lit` color of a
// `floor` palette. Every palette key is therefore indexed first, and a color
// name is skipped when `<key>.<name>` is itself a declared key — the validator
// forbids that collision at declare time, but the editor must not invent an
// ambiguity where resolution has a fixed answer.
function addPaletteNames(index, text, direction) {
  if (!isObject(direction?.palette)) return;
  const palettes = Object.entries(direction.palette).filter(([, entries]) => Array.isArray(entries));
  const declaredKeys = new Set(palettes.map(([key]) => key));
  let cursor = Math.max(text.indexOf('"palette"'), 0);
  for (const [key, entries] of palettes) {
    const keyRange = jsonKeyRange(text, key, Math.max(cursor, 0));
    cursor = text.indexOf(JSON.stringify(key), Math.max(cursor, 0)) + 1;
    index.add({
      name: `palette.${key}`,
      kind: "palette",
      value: entries,
      file: "direction.json",
      range: keyRange,
      detail: "direction palette"
    });
    const named = new Set();
    for (const entry of entries) {
      // A bare hex string is read, not pointed at: only a one-key object names
      // a color, and only a named color is citable.
      if (!isObject(entry)) continue;
      const keys = Object.keys(entry);
      if (keys.length !== 1) continue;
      const [name] = keys;
      if (typeof entry[name] !== "string") continue;
      if (named.has(name)) continue;
      named.add(name);
      if (declaredKeys.has(`${key}.${name}`)) continue;
      const range = jsonKeyRange(text, name, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(name), Math.max(cursor, 0)) + 1;
      index.add({
        name: `palette.${key}.${name}`,
        kind: "color",
        value: entry[name],
        file: "direction.json",
        range,
        detail: `palette.${key} color`
      });
    }
  }
}

function addDirectionNames(index, text, direction) {
  if (!isObject(direction)) return;
  const addEntries = (prefix, entries) => {
    if (!isObject(entries)) return;
    let cursor = text.indexOf(JSON.stringify(prefix[0]));
    for (const key of Object.keys(entries)) {
      const range = jsonKeyRange(text, key, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(key), Math.max(cursor, 0)) + 1;
      index.add({
        name: [...prefix, key].join("."),
        kind: prefix[0],
        file: "direction.json",
        range,
        detail: "direction claim"
      });
    }
  };
  for (const section of ["pillars", "mood", "anti", "must_keep", "colors", "contrast", "timing"]) {
    addEntries([section], direction[section]);
  }
}

function basename(relative) {
  return relative.slice(relative.lastIndexOf("/") + 1);
}

function addMarkdownNames(index, relative, text) {
  const numberedChapter = !relative.includes("/") && /^\d\d-[^/]+\.md$/i.test(relative);
  for (const item of unfencedLines(text)) {
    if (numberedChapter) {
      for (const match of item.text.matchAll(/`(runtime\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)*)`/g)) {
        if (!index.byName.has(match[1])) index.add({ name: match[1], kind: "runtime", file: relative, range: zeroRange(item.line - 1, match.index + 1, match[1].length), detail: "runtime value declared by use" });
      }
      const ruleset = /^\s*>\s*RULESET:\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+\(initial\))?\s*$/.exec(item.text);
      if (ruleset && ruleset[1] !== "all") {
        const start = item.text.indexOf(ruleset[1]);
        if (!index.byName.has(ruleset[1])) index.add({ name: ruleset[1], kind: "ruleset", file: relative, range: zeroRange(item.line - 1, start, ruleset[1].length), detail: item.text.includes("(initial)") ? "initial ruleset" : "ruleset" });
      }
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(item.text);
    if (!heading) continue;
    const rawTitle = heading[2];
    const explicit = /\s*\{#([A-Za-z0-9._-]+)\}\s*$/.exec(rawTitle);
    const title = explicit ? rawTitle.slice(0, explicit.index).trim() : rawTitle;
    const slug = explicit?.[1] ?? markdownSlug(title);
    const titleStart = item.text.indexOf(rawTitle);
    const range = zeroRange(item.line - 1, titleStart, rawTitle.length);
    const detail = title;
    const names = [`#${slug}`, `${relative}#${slug}`];
    if (relative.includes("/")) names.push(`${basename(relative)}#${slug}`);
    for (const name of names) {
      index.add({ name, kind: "section", value: title, file: relative, range, detail });
    }
    if (explicit) index.add({ name: explicit[1], kind: "section", value: title, file: relative, range, detail });
    const at = /\b(AT-\d+)\b/i.exec(title);
    if (at) {
      const atStart = item.text.indexOf(at[1]);
      index.add({ name: at[1].toUpperCase(), kind: "acceptance-test", value: title, file: relative, range: zeroRange(item.line - 1, atStart, at[1].length), detail });
    }
    const rule = /\b((?:RULE|INV)-[A-Za-z0-9._-]+)\b/i.exec(title);
    if (rule) {
      const ruleStart = item.text.indexOf(rule[1]);
      index.add({ name: rule[1], kind: "rule", value: title, file: relative, range: zeroRange(item.line - 1, ruleStart, rule[1].length), detail });
    }
  }
}

function addClockNames(index, text, clocks) {
  if (!isObject(clocks)) return;
  let cursor = 0;
  for (const [name, clock] of Object.entries(clocks)) {
    if (!isObject(clock)) continue;
    const range = jsonKeyRange(text, name, cursor);
    cursor = text.indexOf(JSON.stringify(name), cursor) + 1;
    index.add({ name: `clocks.${name}`, kind: "clock", value: clock, file: "clocks.json", range, detail: "clock" });
    let addressCursor = Math.max(cursor, 0);
    for (const address of Array.isArray(clock.advances) ? clock.advances : []) {
      if (typeof address !== "string" || index.byName.has(address)) continue;
      const addressRange = jsonKeyRange(text, address, addressCursor);
      addressCursor = text.indexOf(JSON.stringify(address), addressCursor) + 1;
      index.add({ name: address, kind: "runtime", file: "clocks.json", range: addressRange, detail: `runtime value declared by clocks.${name}` });
    }
  }
}

function parseJson(relative, text, problems) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    problems.push({ file: relative, message: `invalid JSON: ${cause.message}`, range: zeroRange() });
    return undefined;
  }
}

function parsedDocument(documents, relative) {
  const text = documents.get(relative);
  if (text === undefined) return undefined;
  try { return { text, value: JSON.parse(text) }; }
  catch { return undefined; }
}

// Decision 32: collections declare by presence. Each collections/<drawer>/
// subdirectory is one collection, each record is one JSON file, and the
// filename minus .json is the record's id — so a record name's definition
// site is its own file, at the top, and no manifest is consulted.
function addCollectionNames(index, documents, folders) {
  const recordPattern = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
  const labelPattern = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/_collection\.json$/;
  const folderPattern = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
  const drawerFiles = new Map();
  const drawersWithRecords = new Set();
  for (const relative of [...documents.keys()].sort()) {
    const label = labelPattern.exec(relative);
    if (label) {
      drawerFiles.set(label[1], relative);
      continue;
    }
    const record = recordPattern.exec(relative);
    if (!record) continue;
    drawersWithRecords.add(record[1]);
    if (!drawerFiles.has(record[1])) drawerFiles.set(record[1], relative);
    index.add({
      name: record[2],
      kind: "collection-record",
      file: relative,
      range: zeroRange(),
      detail: `${record[1]} record`
    });
    index.add({
      name: `collections.${record[1]}.${record[2]}`,
      kind: "collection-record",
      file: relative,
      range: zeroRange(),
      detail: `${record[1]} record`
    });
  }
  for (const folder of [...folders].map(String).sort()) {
    const match = folderPattern.exec(folder.replaceAll("\\", "/"));
    if (!match || drawersWithRecords.has(match[1])) continue;
    drawerFiles.set(match[1], `collections/${match[1]}/`);
  }
  for (const [drawer, file] of drawerFiles) {
    const range = file.endsWith("/")
      ? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
      : zeroRange();
    index.add({ name: drawer, kind: "collection", file, range, detail: "collection drawer" });
    index.add({ name: `collections.${drawer}`, kind: "collection", file, range, detail: "collection drawer" });
  }
}

function firstSentence(value) {
  if (typeof value !== "string") return "contract value";
  const sentence = /^.*?(?:[.!?](?=\s|$)|$)/u.exec(value.trim())?.[0]?.trim();
  return sentence || "contract value";
}

// SPEC §10.6: an adoption filename supplies the middle address segment. Packs
// deliberately add no names; only filled forms can be cited by a package.
export function addContractNames(index, documents) {
  const adoptionPattern = /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
  for (const relative of [...documents.keys()].sort()) {
    const match = adoptionPattern.exec(relative);
    if (!match || relative.endsWith(".pack.json")) continue;
    const parsed = parsedDocument(documents, relative);
    const adoption = parsed?.value;
    if (!isObject(adoption) || typeof adoption.contract !== "string"
      || !Number.isInteger(adoption.version) || !isObject(adoption.questions)) continue;
    const name = `contracts.${match[1]}`;
    index.add({ name, kind: "contract", file: relative, range: zeroRange(), detail: adoption.summary ?? "contract adoption" });
    const values = adoption.declares?.values;
    if (!isObject(values)) continue;
    let cursor = Math.max(parsed.text.indexOf('"values"'), 0);
    for (const [valueName, declaration] of Object.entries(values)) {
      const range = jsonKeyRange(parsed.text, valueName, cursor);
      cursor = parsed.text.indexOf(JSON.stringify(valueName), cursor) + 1;
      index.add({
        name: `${name}.${valueName}`,
        kind: "contract-value",
        file: relative,
        range,
        detail: firstSentence(declaration?.description)
      });
    }
  }
}

function addPersonalizationNames(index, documents) {
  const parsed = parsedDocument(documents, "personalization.json");
  if (!parsed || !Array.isArray(parsed.value?.questions)) return;
  let cursor = parsed.text.indexOf('"questions"');
  for (const question of parsed.value.questions) {
    if (!isObject(question) || typeof question.id !== "string") continue;
    const range = jsonKeyRange(parsed.text, question.id, Math.max(cursor, 0));
    cursor = parsed.text.indexOf(JSON.stringify(question.id), Math.max(cursor, 0)) + 1;
    index.add({
      name: question.id,
      kind: "question",
      file: "personalization.json",
      range,
      detail: "personalization question"
    });
  }
}

export function resolveAnchor(definitionsByName, name) {
  // SPEC §1b lets prose cite into record fields without making fields a
  // separate name kind. The stable address is the record, so longer
  // collection citations deliberately stop at their three-segment prefix.
  const segments = name.split(".");
  let resolvedName = name;
  if (segments[0] === "collections" && segments.length >= 4
    && definitionsByName.has(segments.slice(0, 3).join("."))) {
    resolvedName = segments.slice(0, 3).join(".");
  } else if (segments[0] === "contracts" && segments.length >= 4
    && definitionsByName.has(segments.slice(0, 3).join("."))) {
    // Contract addresses are closed at the declared value, but editor tokens
    // may continue (for example punctuation-adjacent dotted prose). Resolve as
    // far as the longest declared contract prefix, matching §10.6.
    resolvedName = segments.slice(0, 3).join(".");
  }
  const definitions = definitionsByName.get(resolvedName) ?? [];
  if (definitions.length === 0) return { classification: "unknown", name, definitions: [] };
  if (definitions.length === 1) {
    const { identity, ...definition } = definitions[0];
    return { classification: "known", name, definitions: [definition] };
  }
  return {
    classification: "ambiguous",
    name,
    definitions: definitions.map(({ identity, ...definition }) => definition)
  };
}

function isAnchorCandidate(name, definitionsByName, namespaces) {
  if (definitionsByName.has(name)) return true;
  if (ID_ANCHOR.test(name) || SECTION_ANCHOR.test(name) || FILE_ANCHOR.test(name)) return true;
  if (!DOTTED_KEY.test(name)) return false;
  return namespaces.has(name.split(".", 1)[0]);
}

function collectAnchors(relative, text, definitionsByName, namespaces) {
  const anchors = [];
  const proseLines = [...unfencedLines(text)];
  for (const item of proseLines) {
    for (const match of item.text.matchAll(/`([^`\r\n]+)`/g)) {
      const name = match[1];
      if (!isAnchorCandidate(name, definitionsByName, namespaces)) continue;
      const resolution = resolveAnchor(definitionsByName, name);
      anchors.push({
        ...resolution,
        file: relative,
        range: zeroRange(item.line - 1, match.index + 1, name.length)
      });
    }
  }
  return anchors;
}

export function analyzePackage(fileMap, { folders = [] } = {}) {
  const problems = [];
  const index = makeNameIndex();
  const files = [...fileMap.keys()].sort((left, right) => left.localeCompare(right));
  const documents = new Map();

  for (const relative of files) {
    const range = zeroRange();
    index.add({ name: relative, kind: "file", file: relative, range, detail: "package file" });
    index.add({ name: basename(relative), kind: "file", file: relative, range, detail: "package file" });
    const text = fileMap.get(relative);
    if (typeof text !== "string" || !/\.(?:md|json)$/i.test(relative)) continue;
    documents.set(relative, text);
    if (/\.md$/i.test(relative)) addMarkdownNames(index, relative, text);
  }

  const tuningText = documents.get("tuning.json");
  if (tuningText !== undefined) addJsonNames(index, "tuning.json", tuningText, parseJson("tuning.json", tuningText, problems), problems);
  const manifestText = documents.get("manifest.json");
  const manifest = manifestText === undefined ? undefined : parseJson("manifest.json", manifestText, problems);
  const clocksText = documents.get("clocks.json");
  if (clocksText !== undefined) addClockNames(index, clocksText, parseJson("clocks.json", clocksText, problems));
  const directionText = documents.get("direction.json");
  if (directionText !== undefined) {
    const direction = parseJson("direction.json", directionText, problems);
    addDirectionNames(index, directionText, direction);
    addPaletteNames(index, directionText, direction);
  }
  addCollectionNames(index, documents, folders);
  addContractNames(index, documents);
  addPersonalizationNames(index, documents);

  const namespaces = new Set();
  for (const { name, definitions } of index.entries()) {
    if (definitions.some(item => item.kind === "value")) namespaces.add(name.split(".", 1)[0]);
  }
  // `palette` is a reserved first segment format-wide (SPEC §4), not a namespace
  // a package opts into by declaring one. A `palette.*` citation is therefore
  // always an anchor: it resolves against the manifest map or it dangles, which
  // is the verdict the core validator reports for the same token.
  namespaces.add("palette");
  // Like palette, collections is reserved format-wide: a dangling prose
  // citation must be collected so the language tools can report it.
  namespaces.add("collections");
  namespaces.add("contracts");
  namespaces.add("runtime");
  namespaces.add("clocks");
  const anchors = [];
  for (const [relative, text] of documents) {
    if (/\.md$/i.test(relative)) anchors.push(...collectAnchors(relative, text, index.byName, namespaces));
  }

  return {
    files,
    documents,
    definitionsByName: index.byName,
    nameIndex: index.entries(),
    anchors,
    problems,
    manifest
  };
}
