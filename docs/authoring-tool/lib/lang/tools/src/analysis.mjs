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
  for (const [role, kind] of [["tunables", "tunable"], ["constants", "constant"]]) {
    const entries = document[role];
    if (!isObject(entries)) continue;
    let cursor = text.indexOf(JSON.stringify(role));
    for (const [name, value] of Object.entries(entries)) {
      const range = jsonKeyRange(text, name, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(name), Math.max(cursor, 0)) + 1;
      index.add({ name, kind, value, file: relative, range, detail: `${role}.${name}` });
    }
  }
  if (Array.isArray(document.invariants)) {
    let cursor = text.indexOf('"invariants"');
    for (const invariant of document.invariants) {
      if (!isObject(invariant) || typeof invariant.id !== "string") continue;
      const range = jsonKeyRange(text, invariant.id, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(invariant.id), Math.max(cursor, 0)) + 1;
      index.add({ name: invariant.id, kind: "rule", value: invariant, file: relative, range, detail: "tuning invariant" });
    }
  }
  if (problems && !isObject(document.tunables)) {
    problems.push({ file: relative, message: "tuning.json has no tunables object", range: zeroRange() });
  }
}

function addManifestNames(index, text, manifest) {
  if (isObject(manifest?.ruleset_state) && Array.isArray(manifest.ruleset_state.rulesets)) {
    let cursor = text.indexOf('"rulesets"');
    for (const ruleset of manifest.ruleset_state.rulesets) {
      if (!isObject(ruleset) || typeof ruleset.id !== "string") continue;
      const range = jsonKeyRange(text, ruleset.id, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(ruleset.id), Math.max(cursor, 0)) + 1;
      index.add({ name: ruleset.id, kind: "rule", value: ruleset, file: "manifest.json", range, detail: "manifest ruleset" });
    }
  }
  if (!isObject(manifest?.descriptors)) return;
  let cursor = text.indexOf('"descriptors"');
  for (const [family, descriptors] of Object.entries(manifest.descriptors)) {
    if (!Array.isArray(descriptors)) continue;
    for (const descriptor of descriptors) {
      if (!isObject(descriptor) || typeof descriptor.id !== "string") continue;
      const range = jsonKeyRange(text, descriptor.id, Math.max(cursor, 0));
      cursor = text.indexOf(JSON.stringify(descriptor.id), Math.max(cursor, 0)) + 1;
      const definition = {
        kind: "descriptor",
        file: "manifest.json",
        range,
        detail: `${family} descriptor`
      };
      index.add({ ...definition, name: descriptor.id });
      index.add({ ...definition, name: `descriptor:${family}:${descriptor.id}` });
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
        kind: "name",
        file: "direction.json",
        range,
        detail: "direction claim"
      });
    }
  };
  for (const section of ["pillars", "anti", "invariants", "motion", "mood", "viewing", "references"]) {
    addEntries([section], direction[section]);
  }
  if (isObject(direction.constraints)) {
    for (const [group, entries] of Object.entries(direction.constraints)) addEntries(["constraints", group], entries);
  }
}

function basename(relative) {
  return relative.slice(relative.lastIndexOf("/") + 1);
}

function addMarkdownNames(index, relative, text) {
  for (const item of unfencedLines(text)) {
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

function addCollectionRecord(index, collection, relative, text, record, cursor) {
  const id = record[collection.id_member];
  if (typeof id !== "string") return cursor;
  const range = jsonKeyRange(text, id, Math.max(cursor, 0));
  index.add({
    name: id,
    kind: "collection-record",
    file: relative,
    range,
    detail: `${collection.id} record`
  });
  return text.indexOf(JSON.stringify(id), Math.max(cursor, 0)) + 1;
}

function addCollectionNames(index, documents, manifest) {
  if (!Array.isArray(manifest?.content)) return;
  for (const collection of manifest.content) {
    if (!isObject(collection) || typeof collection.id !== "string" || typeof collection.id_member !== "string" || !isObject(collection.source)) continue;
    if (collection.source.kind === "catalog" && typeof collection.source.file === "string") {
      const relative = collection.source.file;
      const parsed = parsedDocument(documents, relative);
      if (!parsed || !isObject(parsed.value)) continue;
      let cursor = 0;
      for (const [member, records] of Object.entries(parsed.value)) {
        if (!Array.isArray(records)) continue;
        cursor = parsed.text.indexOf(JSON.stringify(member), Math.max(cursor, 0));
        for (const record of records) {
          if (isObject(record)) cursor = addCollectionRecord(index, collection, relative, parsed.text, record, cursor);
        }
      }
      continue;
    }
    if (collection.source.kind !== "items" || typeof collection.source.directory !== "string" || !Array.isArray(collection.source.members)) continue;
    const directory = collection.source.directory.replace(/\/+$/, "");
    for (const member of collection.source.members) {
      if (typeof member !== "string") continue;
      const relative = directory ? `${directory}/${member}` : member;
      const parsed = parsedDocument(documents, relative);
      if (!parsed || !isObject(parsed.value)) continue;
      addCollectionRecord(index, collection, relative, parsed.text, parsed.value, 0);
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
  const definitions = definitionsByName.get(name) ?? [];
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
  for (const item of unfencedLines(text)) {
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

export function analyzePackage(fileMap) {
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
  if (manifestText !== undefined) addManifestNames(index, manifestText, manifest);
  const directionText = documents.get("direction.json");
  if (directionText !== undefined) addDirectionNames(index, directionText, parseJson("direction.json", directionText, problems));
  addCollectionNames(index, documents, manifest);
  addPersonalizationNames(index, documents);

  const namespaces = new Set();
  for (const { name, definitions } of index.entries()) {
    if (definitions.some(item => item.kind === "tunable" || item.kind === "constant")) namespaces.add(name.split(".", 1)[0]);
  }
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
