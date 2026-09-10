import { COLLECTION_COPY } from "./copy/collection-copy.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { packageFiles, parseJson, plainObject, pointer, pointerSegment } from "./json-path.mjs";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;
const RECORD = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const COLLECTION = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const FIELD_REFERENCE = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)#(.+)$/;
const CONTRACT = /^contracts\.([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
// Keep this spelling aligned with validate-core's TUNING_KEY_PATTERN/PREFIX.
// Hyphens inside a key are names; a leading minus is always an operator.
const TUNING_KEY_SOURCE = "[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)+";
const DOTTED_KEY = new RegExp(`^${TUNING_KEY_SOURCE}$`, "u");
const RULE_KEY_PREFIX = new RegExp(`^${TUNING_KEY_SOURCE}`, "u");
const RULE_NUMBER_PREFIX = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
const CLOCK_KEY = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/u;
const RUNTIME_ADDRESS = /^runtime\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)*$/u;
const SECTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const unfencedLines = text => {
  const lines = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((value, index) => {
    if (/^\s*```/.test(value)) { fenced = !fenced; return; }
    if (!fenced) lines.push({ line: index + 1, text: value });
  });
  return lines;
};
const copyRange = range => ({
  start: { line: range.start.line, character: range.start.character },
  end: { line: range.end.line, character: range.end.character }
});

function schemas(files) {
  return [...files].flatMap(([file, text]) => {
    const match = /^collections\/([^/]+)\/_collection\.json$/.exec(file);
    const record = match ? parseJson(text)?.record : undefined;
    return match && plainObject(record) ? [{ collection: match[1], file, record }] : [];
  });
}

function recordEntries(files) {
  return [...files].flatMap(([file, text]) => {
    const match = /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(file);
    const record = match ? parseJson(text) : undefined;
    return match && plainObject(record) ? [{ collection: match[1], id: match[2], file, record }] : [];
  });
}

function currentAnalysis(analysis) {
  return typeof analysis === "function" ? analysis() : analysis?.current?.() ?? analysis;
}

function familyFor(name, files, view) {
  const contract = CONTRACT.exec(name);
  if (contract) {
    const definitions = view?.definitionsByName?.get?.(name) ?? [];
    const expectedKind = contract[2] ? "contract-value" : "contract";
    if (definitions.some(definition => definition.kind === expectedKind)) {
      return { family: "contract", adoption: contract[1], value: contract[2], address: name,
        file: `contracts/${contract[1]}.json` };
    }
  }
  const field = FIELD_REFERENCE.exec(name);
  if (field) {
    const parts = field[2].split(".");
    const fieldName = parts.at(-1);
    const parentPath = parts.slice(0, -1);
    const schema = schemas(files).find(item => item.collection === field[1])?.record;
    let level = schema;
    for (const parent of parentPath) level = level?.[parent]?.type === "list" ? level[parent].of : undefined;
    if (plainObject(level) && Object.hasOwn(level, fieldName)) {
      return { family: "collection-field", collection: field[1], field: fieldName, parentPath };
    }
    return undefined;
  }
  const definitions = view?.definitionsByName?.get?.(name) ?? [];
  const kinds = new Set(definitions.map(definition => definition.kind));
  const section = definitions.find(definition => definition.kind === "section");
  if (section) {
    const text = files.get(section.file);
    const line = typeof text === "string" ? text.split(/\r?\n/u)[section.range.start.line] ?? "" : "";
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
    const explicit = heading ? /\s*\{#([A-Za-z0-9._-]+)\}\s*$/u.exec(heading[2]) : undefined;
    const slug = /#([^#]+)$/u.exec(name)?.[1] ?? explicit?.[1] ?? name.replace(/^#/u, "");
    return {
      family: "section", address: `${section.file}#${slug}`, file: section.file, slug,
      line: section.range.start.line, explicit: explicit?.[1], definition: section
    };
  }
  const record = RECORD.exec(name);
  if (record && kinds.has("collection-record")) {
    return { family: "collection-record", collection: record[1], record: record[2] };
  }
  const collection = COLLECTION.exec(name);
  if (collection && kinds.has("collection")) return { family: "collection", collection: collection[1] };
  return genericFamilyFor(name, files, view);
}

function genericFamilyFor(name, files, view) {
  const direction = parseJson(files.get("direction.json"));
  const tuning = parseJson(files.get("tuning.json"));
  const clocks = parseJson(files.get("clocks.json"));
  const personalization = parseJson(files.get("personalization.json"));
  const definitions = view?.definitionsByName?.get?.(name) ?? [];
  const hasKind = kind => definitions.some(definition => definition.kind === kind);
  let match = /^mood\.([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(name);
  if (match && plainObject(direction?.mood) && Object.hasOwn(direction.mood, match[1])) return { family: "mood", key: match[1], address: name };
  match = /^(pillars|anti|must_keep)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(name);
  if (match && plainObject(direction?.[match[1]]) && Object.hasOwn(direction[match[1]], match[2])) {
    return { family: match[1], kind: match[1], key: match[2], address: name };
  }
  match = /^palette\.((?=[a-z0-9.-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/u.exec(name);
  if (match && plainObject(direction?.palette)) {
    const paletteText = match[1];
    if (Object.hasOwn(direction.palette, paletteText)) return { family: "palette", key: paletteText, address: name };
    const cut = paletteText.lastIndexOf(".");
    if (cut > 0) {
      const palette = paletteText.slice(0, cut);
      const key = paletteText.slice(cut + 1);
      if (Array.isArray(direction.palette[palette])
        && direction.palette[palette].some(item => plainObject(item) && Object.hasOwn(item, key))) {
        return { family: "color", palette, key, address: name };
      }
    }
  }
  match = /^(colors|contrast|timing)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(name);
  if (match && plainObject(direction?.[match[1]]) && Object.hasOwn(direction[match[1]], match[2])) {
    return { family: "direction-promise", kind: match[1], key: match[2], address: name };
  }
  if (plainObject(tuning?.values) && Object.hasOwn(tuning.values, name) && (hasKind("value") || DOTTED_KEY.test(name))) {
    return { family: "tuning-value", key: name, address: name };
  }
  if (plainObject(tuning?.rules) && Object.hasOwn(tuning.rules, name) && (hasKind("rule") || KEBAB.test(name))) {
    return { family: "tuning-rule", key: name, address: name };
  }
  match = /^clocks\.(.+)$/u.exec(name);
  if (match && !CLOCK_KEY.test(match[1])) match = null;
  if (match && plainObject(clocks) && Object.hasOwn(clocks, match[1])) return { family: "clock", key: match[1], address: name };
  if (RUNTIME_ADDRESS.test(name) && hasKind("runtime")) {
    return { family: "runtime", key: name.slice("runtime.".length), address: name };
  }
  const question = (Array.isArray(personalization?.questions) ? personalization.questions : []).findIndex(item => item?.id === name);
  if (question >= 0) return { family: "question", key: name, index: question, address: name };
  return undefined;
}

export function planQuestionOptionRename(source, questionId, optionId, next, location = {}) {
  const files = source instanceof Map ? source : packageFiles(source);
  const personalization = parseJson(files.get("personalization.json"));
  const questions = Array.isArray(personalization?.questions) ? personalization.questions : [];
  const questionIndex = Number.isInteger(location.questionIndex)
    ? location.questionIndex : questions.findIndex(question => question?.id === questionId);
  const question = questions[questionIndex];
  const options = Array.isArray(question?.options) ? question.options : [];
  const optionIndex = Number.isInteger(location.optionIndex)
    ? location.optionIndex : options.findIndex(option => option?.id === optionId);
  if (!KEBAB.test(next)) return { safety: "refused", reason: INSPECTOR_COPY.questionOptionIdInvalid };
  if (!question || question.id !== questionId || !options[optionIndex] || options[optionIndex].id !== optionId) {
    return { safety: "refused", reason: INSPECTOR_COPY.questionOptionTargetGone };
  }
  if (options.some((option, index) => index !== optionIndex && option?.id === next)) {
    return { safety: "refused", reason: INSPECTOR_COPY.questionOptionTaken(next) };
  }
  const base = pointer(["questions", questionIndex]);
  return Object.freeze({
    safety: "complete", family: "question-option", questionId, optionId, next, questionIndex, optionIndex,
    operations: Object.freeze([
      Object.freeze({ type: "set", pointer: `${base}/options/${optionIndex}/id`, value: next }),
      ...(question.default === optionId
        ? [Object.freeze({ type: "set", pointer: `${base}/default`, value: next })] : [])
    ])
  });
}

function walkShapes(level, parts, visit) {
  if (!plainObject(level)) return;
  for (const [field, shape] of Object.entries(level)) {
    if (!plainObject(shape)) continue;
    visit(field, shape, [...parts, field]);
    if (shape.type === "list" && plainObject(shape.of)) walkShapes(shape.of, [...parts, field, "of"], visit);
  }
}

function walkRecordLinks(value, level, parts, visit) {
  if (!plainObject(value) || !plainObject(level)) return;
  for (const [field, shape] of Object.entries(level)) {
    if (!plainObject(shape) || !Object.hasOwn(value, field)) continue;
    const fieldParts = [...parts, field];
    const current = value[field];
    if (shape.type === "link") {
      if (shape.many === true && Array.isArray(current)) current.forEach((item, index) => visit(item, shape, [...fieldParts, index]));
      else visit(current, shape, fieldParts);
    } else if (shape.type === "list" && Array.isArray(current) && plainObject(shape.of)) {
      current.forEach((line, index) => walkRecordLinks(line, shape.of, [...fieldParts, index], visit));
    }
  }
}

function walkFieldRecords(value, parentPath, field, parts, visit) {
  if (!plainObject(value)) return;
  if (!parentPath.length) {
    if (Object.hasOwn(value, field)) visit([...parts, field]);
    return;
  }
  const [parent, ...rest] = parentPath;
  const lines = value[parent];
  if (!Array.isArray(lines)) return;
  lines.forEach((line, index) => walkFieldRecords(line, rest, field, [...parts, parent, index], visit));
}

function walkJsonStrings(value, parts, visit) {
  if (typeof value === "string") { visit(value, parts); return; }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJsonStrings(item, [...parts, index], visit));
    return;
  }
  if (plainObject(value)) for (const [key, item] of Object.entries(value)) walkJsonStrings(item, [...parts, key], visit);
}

function site(packageService, file, values) {
  return { file, ...values, revision: packageService.revision(file) };
}

function proseSites(packageService, files, view, name) {
  const found = [];
  const seen = new Set();
  const add = (file, range) => {
    const key = `${file}\0${range.start.line}\0${range.start.character}\0${range.end.character}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(site(packageService, file, { range, channel: "prose", kind: "citation" }));
  };
  for (const anchor of view?.anchors ?? []) {
    if (anchor.name !== name && !anchor.name.startsWith(`${name}.`)) continue;
    const range = copyRange(anchor.range);
    range.end = { line: range.start.line, character: range.start.character + name.length };
    add(anchor.file, range);
  }
  // The validator trims the contents of inline-code spans. The language view
  // predates that detail, so enumerate the same unfenced spans here and give a
  // padded citation its exact editable range instead of claiming false safety.
  for (const [file, text] of files) {
    if (!/\.md$/i.test(file) || typeof text !== "string") continue;
    for (const item of unfencedLines(text)) for (const match of item.text.matchAll(/`([^`\r\n]+)`/g)) {
      const raw = match[1];
      const token = raw.trim();
      if (token !== name && !token.startsWith(`${name}.`)) continue;
      const leading = raw.length - raw.trimStart().length;
      const start = match.index + 1 + leading;
      add(file, {
        start: { line: item.line - 1, character: start },
        end: { line: item.line - 1, character: start + name.length }
      });
    }
  }
  return found;
}

function sectionSites(packageService, files, view, target) {
  const found = [];
  const text = files.get(target.file);
  const headingLine = typeof text === "string" ? text.split(/\r?\n/u)[target.line] ?? "" : "";
  if (target.explicit) {
    const marker = `{#${target.explicit}}`;
    const markerStart = headingLine.lastIndexOf(marker);
    if (markerStart >= 0) found.push(site(packageService, target.file, {
      range: {
        start: { line: target.line, character: markerStart + 2 },
        end: { line: target.line, character: markerStart + 2 + target.explicit.length }
      },
      channel: "prose", kind: "section-declaration", operation: "text"
    }));
  }
  const sameDefinition = definition => definition.kind === "section" && definition.file === target.file
    && definition.range?.start?.line === target.line;
  for (const anchor of view?.anchors ?? []) {
    if (!(anchor.definitions ?? []).some(sameDefinition)) continue;
    const raw = anchor.name;
    let prefix;
    if (raw === target.slug) prefix = "";
    else if (raw === `#${target.slug}`) prefix = "#";
    else if (raw.endsWith(`#${target.slug}`)) prefix = raw.slice(0, -target.slug.length);
    else continue;
    found.push(site(packageService, anchor.file, {
      range: copyRange(anchor.range), channel: "prose", kind: "section-citation", operation: "text", prefix
    }));
  }
  return uniqueSites(found);
}

function jsonSites(packageService, files, target) {
  const found = [];
  const allSchemas = schemas(files);
  if (target.family === "contract") {
    for (const [file, text] of files) {
      // A pack's exact bytes are its identity. Contract renames may rewrite
      // adoption-owned citations, never text that happens to occur in a pack.
      if (!/\.json$/i.test(file) || /\.pack\.json$/i.test(file) || typeof text !== "string") continue;
      const value = parseJson(text);
      walkJsonStrings(value, [], (current, parts) => {
        if (current === target.address || current.startsWith(`${target.address}.`)) {
          found.push(site(packageService, file, { pointer: pointer(parts), channel: "json", kind: "contract-citation", current }));
        }
      });
    }
  } else if (target.family === "collection-record") {
    for (const entry of recordEntries(files)) {
      const schema = allSchemas.find(item => item.collection === entry.collection)?.record;
      walkRecordLinks(entry.record, schema, [], (value, shape, parts) => {
        if (shape.to === target.collection && value === target.record) {
          found.push(site(packageService, entry.file, { pointer: pointer(parts), channel: "json", kind: "link-value" }));
        }
      });
    }
  } else if (target.family === "collection") {
    for (const schema of allSchemas) walkShapes(schema.record, ["record"], (_field, shape, parts) => {
      if (shape.type === "link" && shape.to === target.collection) {
        found.push(site(packageService, schema.file, { pointer: pointer([...parts, "to"]), channel: "json", kind: "collection-to" }));
      }
    });
  } else if (target.family === "collection-field") {
    const own = allSchemas.find(item => item.collection === target.collection);
    const levelParts = ["record", ...target.parentPath.flatMap(part => [part, "of"] )];
    if (own) {
      found.push(site(packageService, own.file, {
        pointer: pointer([...levelParts, target.field]), channel: "json", kind: "field-schema-key"
      }));
      let level = own.record;
      for (const parent of target.parentPath) level = level?.[parent]?.of;
      if (plainObject(level)) for (const [field, shape] of Object.entries(level)) {
        if (plainObject(shape?.when?.row) && Object.hasOwn(shape.when.row, target.field)) {
          found.push(site(packageService, own.file, {
            pointer: pointer([...levelParts, field, "when", "row", target.field]),
            ownerField: field, channel: "json", kind: "when-row"
          }));
        }
      }
    }
    for (const entry of recordEntries(files).filter(item => item.collection === target.collection)) {
      walkFieldRecords(entry.record, target.parentPath, target.field, [], parts => {
        found.push(site(packageService, entry.file, { pointer: pointer(parts), channel: "json", kind: "record-key" }));
      });
    }
    if (!target.parentPath.length) for (const schema of allSchemas) walkShapes(schema.record, ["record"], (_field, shape, parts) => {
      if (shape.type === "link" && shape.to === target.collection && shape.mirrored_by === target.field) {
        found.push(site(packageService, schema.file, {
          pointer: pointer([...parts, "mirrored_by"]), channel: "json", kind: "mirrored-by"
        }));
      }
    });
  } else found.push(...genericJsonSites(packageService, files, target));
  return found;
}

function genericJsonSites(packageService, files, target) {
  const found = [];
  const add = (file, values) => found.push(site(packageService, file, { channel: "json", ...values }));
  const direction = parseJson(files.get("direction.json"));
  if (target.family === "mood") add("direction.json", { pointer: pointer(["mood", target.key]), kind: "declaration-key", operation: "rename-key" });
  if (["pillars", "anti", "must_keep"].includes(target.family)) add("direction.json", {
    pointer: pointer([target.kind, target.key]), kind: "declaration-key", operation: "rename-key"
  });
  if (target.family === "palette") {
    add("direction.json", { pointer: pointer(["palette", target.key]), kind: "declaration-key", operation: "rename-key" });
    for (const [mood, value] of Object.entries(plainObject(direction?.mood) ? direction.mood : {})) {
      if (value?.palette === target.address) add("direction.json", { pointer: pointer(["mood", mood, "palette"]), kind: "mood-palette", operation: "set" });
    }
  }
  if (target.family === "color") {
    const entries = direction?.palette?.[target.palette];
    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      if (plainObject(entry) && Object.hasOwn(entry, target.key)) add("direction.json", {
        pointer: pointer(["palette", target.palette, index, target.key]), kind: "declaration-key", operation: "rename-key"
      });
    });
    for (const [name, value] of Object.entries(plainObject(direction?.colors) ? direction.colors : {})) {
      if (value?.is === target.address) add("direction.json", { pointer: pointer(["colors", name, "is"]), kind: "color-is", operation: "set" });
    }
    for (const [name, value] of Object.entries(plainObject(direction?.contrast) ? direction.contrast : {})) {
      (Array.isArray(value?.colors) ? value.colors : []).forEach((address, index) => {
        if (address === target.address) add("direction.json", { pointer: pointer(["contrast", name, "colors", index]), kind: "contrast-color", operation: "set" });
      });
      if (value?.against === target.address) add("direction.json", { pointer: pointer(["contrast", name, "against"]), kind: "contrast-against", operation: "set" });
    }
  }
  if (target.family === "direction-promise") {
    add("direction.json", {
      pointer: pointer([target.kind, target.key]), kind: "declaration-key", operation: "rename-key"
    });
    for (const [file, text] of files) {
      if (!/\.md$/iu.test(file) || typeof text !== "string") continue;
      for (const match of text.matchAll(/```test\r?\n([\s\S]*?)^```/gmu)) {
        const parsed = parseJson(match[1]);
        if (!Array.isArray(parsed?.direction_claims) || !parsed.direction_claims.includes(target.address)) continue;
        const quoted = JSON.stringify(target.address);
        for (const token of match[1].matchAll(new RegExp(quoted.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu"))) {
          const startOffset = match.index + match[0].indexOf(match[1]) + token.index + 1;
          add(file, { range: {
            start: offsetPosition(text, startOffset), end: offsetPosition(text, startOffset + target.address.length),
            revision: packageService.revision(file)
          }, kind: "direction-claim", operation: "text" });
        }
      }
    }
  }
  const tuning = parseJson(files.get("tuning.json"));
  if (target.family === "tuning-value") {
    add("tuning.json", { pointer: pointer(["values", target.key]), kind: "declaration-key", operation: "rename-key" });
    if (plainObject(tuning?.ranges) && Object.hasOwn(tuning.ranges, target.key)) add("tuning.json", {
      pointer: pointer(["ranges", target.key]), kind: "tuning-range", operation: "rename-key"
    });
    for (const [name, source] of Object.entries(plainObject(tuning?.rules) ? tuning.rules : {})) {
      if (ruleNames(source).includes(target.key)) add("tuning.json", {
        pointer: pointer(["rules", name]), kind: "tuning-rule", operation: "rule-source", current: source
      });
    }
    const personalization = parseJson(files.get("personalization.json"));
    (Array.isArray(personalization?.questions) ? personalization.questions : []).forEach((question, index) => {
      if (question?.sets === target.key) add("personalization.json", { pointer: pointer(["questions", index, "sets"]), kind: "question-sets", operation: "set" });
      (Array.isArray(question?.options) ? question.options : []).forEach((option, optionIndex) => {
        if (plainObject(option?.sets) && Object.hasOwn(option.sets, target.key)) add("personalization.json", {
          pointer: pointer(["questions", index, "options", optionIndex, "sets", target.key]), kind: "option-sets", operation: "rename-key"
        });
      });
    });
    for (const [name, value] of Object.entries(plainObject(direction?.timing) ? direction.timing : {})) {
      if (value?.key === target.key) add("direction.json", { pointer: pointer(["timing", name, "key"]), kind: "timing-key", operation: "set" });
    }
    for (const [file, text] of files) {
      if (!/^contracts\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(file)) continue;
      const adoption = parseJson(text);
      if (!plainObject(adoption) || typeof adoption.contract !== "string" || !Number.isInteger(adoption.version)) continue;
      // Only declared citation positions read tuning. Definition prose, answers,
      // untyped strings and immutable pack bytes are not reference sites.
      for (const [name, declaration] of Object.entries(plainObject(adoption.declares?.values) ? adoption.declares.values : {})) {
        if (name.startsWith("_") || !Array.isArray(declaration?.forms) || !declaration.forms.includes("citation")
          || !declaration.forms.every(form => form === "number" || form === "citation")) continue;
        if (adoption.values?.[name] === target.key) add(file, {
          pointer: pointer(["values", name]), kind: "contract-value-citation", operation: "set", current: target.key
        });
      }
      for (const [name, declaration] of Object.entries(plainObject(adoption.declares?.rows) ? adoption.declares.rows : {})) {
        if (name.startsWith("_") || !Array.isArray(adoption.rows?.[name]) || !plainObject(declaration?.record)) continue;
        adoption.rows[name].forEach((row, index) => {
          if (!plainObject(row)) return;
          for (const [field, shape] of Object.entries(declaration.record)) {
            if (!field.startsWith("_") && shape?.type === "citation" && row[field] === target.key) add(file, {
              pointer: pointer(["rows", name, index, field]), kind: "contract-row-citation", operation: "set", current: target.key
            });
          }
        });
      }
    }
  }
  if (target.family === "tuning-rule") add("tuning.json", { pointer: pointer(["rules", target.key]), kind: "declaration-key", operation: "rename-key" });
  if (target.family === "clock") add("clocks.json", { pointer: pointer(target.key), kind: "declaration-key", operation: "rename-key" });
  if (target.family === "runtime") {
    const clocks = parseJson(files.get("clocks.json"));
    for (const [name, clock] of Object.entries(plainObject(clocks) ? clocks : {})) {
      (Array.isArray(clock?.advances) ? clock.advances : []).forEach((address, index) => {
        if (address === target.address) add("clocks.json", { pointer: pointer([name, "advances", index]), kind: "clock-advances", operation: "set" });
      });
    }
    for (const [file, text] of files) {
      if (!/\.md$/iu.test(file) || typeof text !== "string") continue;
      for (const match of text.matchAll(/```test\r?\n([\s\S]*?)^```/gmu)) {
        const parsed = parseJson(match[1]);
        if (!Array.isArray(parsed?.unchanged?.values) || !parsed.unchanged.values.includes(target.address)) continue;
        for (const token of match[1].matchAll(new RegExp(JSON.stringify(target.address).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "gu"))) {
          const startOffset = match.index + match[0].indexOf(match[1]) + token.index + 1;
          add(file, { range: {
            start: offsetPosition(text, startOffset), end: offsetPosition(text, startOffset + target.address.length),
            revision: packageService.revision(file)
          }, kind: "acceptance-unchanged", operation: "text" });
        }
      }
    }
  }
  if (target.family === "question") add("personalization.json", {
    pointer: pointer(["questions", target.index, "id"]), kind: "question-id", operation: "set"
  });
  return found;
}

function offsetPosition(text, offset) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1).length };
}

function refusal(packageRevision, reason, values = {}) {
  return { safety: "refused", sites: [], unreachable: [], packageRevision, reason, ...values };
}

function uniqueSites(sites) {
  const seen = new Set();
  return sites.filter(item => {
    const key = item.pointer ? `${item.file}\0${item.pointer}`
      : `${item.file}\0${item.range?.start.line}\0${item.range?.start.character}\0${item.range?.end.line}\0${item.range?.end.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ruleKeyTokens(source) {
  if (typeof source !== "string") return [];
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const key = RULE_KEY_PREFIX.exec(rest)?.[0];
    const number = RULE_NUMBER_PREFIX.exec(rest)?.[0];
    // Match tokenizeRule's longest key/number choice. In particular, 1.2e+3
    // is one number, not a reference to the otherwise legal key 1.2e.
    if (key && (!number || key.length > number.length)) {
      tokens.push({ name: key, index });
      index += key.length;
    } else if (number) index += number.length;
    else index += /^[A-Za-z_][A-Za-z0-9_-]*/u.exec(rest)?.[0].length ?? 1;
  }
  return tokens;
}
const ruleNames = source => ruleKeyTokens(source).map(token => token.name);

function genericAddress(target, next) {
  if (target.family === "mood") return `mood.${next}`;
  if (["pillars", "anti", "must_keep"].includes(target.family)) return `${target.kind}.${next}`;
  if (target.family === "palette") return `palette.${next}`;
  if (target.family === "color") return `palette.${target.palette}.${next}`;
  if (target.family === "direction-promise") return `${target.kind}.${next}`;
  if (target.family === "clock") return `clocks.${next}`;
  if (target.family === "runtime") return next.startsWith("runtime.") ? next : `runtime.${next}`;
  return next;
}

function genericLocalName(target, address) {
  if (target.family === "palette") return address.slice("palette.".length);
  if (target.family === "tuning-value" || target.family === "tuning-rule" || target.family === "question") return address;
  return address.split(".").at(-1);
}

function replaceRuleName(source, before, after) {
  let result = String(source);
  for (const token of ruleKeyTokens(source).filter(token => token.name === before).reverse()) {
    result = result.slice(0, token.index) + after + result.slice(token.index + token.name.length);
  }
  return result;
}

export function collectionFieldReference(collection, field, parentPath = []) {
  return `collections.${collection}#${[...parentPath, field].join(".")}`;
}

export function createReferences({ package: packageService, analysis, edits, validatePackage } = {}) {
  if (!packageService || packageService.packageRevision === undefined || !edits || typeof validatePackage !== "function") {
    throw new TypeError("createReferences requires package, edits, validatePackage, and packageRevision.");
  }
  const packageRevision = () => packageService.packageRevision;
  const view = () => currentAnalysis(analysis);
  const files = () => packageFiles(packageService);

  const service = {
    families() {
      return ["collection", "collection-record", "collection-field", "contract", "mood", "pillars", "anti", "must_keep", "palette", "color",
        "direction-promise", "tuning-value", "tuning-rule", "clock", "runtime", "section", "question"].map(family => Object.freeze({
        id: family, family, channels: Object.freeze({
          prose: Object.freeze({ enumerable: family !== "runtime" }),
          json: Object.freeze({ enumerable: true })
        })
      }));
    },
    resolve(name) {
      const definitionsByName = view()?.definitionsByName;
      let definitions = definitionsByName?.get?.(name) ?? [];
      const segments = String(name).split(".");
      if (!definitions.length && segments[0] === "collections" && segments.length >= 4) {
        definitions = definitionsByName?.get?.(segments.slice(0, 3).join(".")) ?? [];
      }
      if (definitions.length === 1) return "known";
      if (definitions.length > 1) return "ambiguous";
      return familyFor(name, files(), view()) ? "known" : "unknown";
    },
    usages(name) {
      const currentFiles = files();
      const target = familyFor(name, currentFiles, view());
      if (!target) return [];
      if (target.family === "section") return sectionSites(packageService, currentFiles, view(), target)
        .filter(item => item.kind !== "section-declaration");
      const generic = target.family && !["collection", "collection-record", "collection-field", "contract"].includes(target.family);
      const json = jsonSites(packageService, currentFiles, target).filter(item => !generic
        || !["declaration-key", "question-id", "tuning-range"].includes(item.kind));
      const proseName = target.family === "tuning-rule" ? `rules.${target.key}` : name;
      const prose = proseSites(packageService, currentFiles, view(), proseName);
      return uniqueSites(generic ? [...json, ...prose] : [...prose, ...json]);
    },
    // The contract family also owns the one-way move from an old tuning
    // address to a contract value. It is a complete reference plan because
    // removing the key without every prose rewrite would create dangling text.
    planUseContractValue(key, contractAddress) {
      const revision = packageRevision();
      const currentFiles = files();
      const tuning = parseJson(currentFiles.get("tuning.json"));
      const target = familyFor(contractAddress, currentFiles, view());
      if (!plainObject(tuning?.values) || !Object.hasOwn(tuning.values, key)
        || target?.family !== "contract" || !target.value) {
        return refusal(revision, CONTRACT_COPY.transactionRefused, { family: "contract", key, contractAddress });
      }
      const prose = proseSites(packageService, currentFiles, view(), key);
      const range = plainObject(tuning.ranges) && Object.hasOwn(tuning.ranges, key)
        ? [site(packageService, "tuning.json", { pointer: pointer(["ranges", key]), channel: "json", kind: "tuning-range" })]
        : [];
      const rules = Object.entries(plainObject(tuning.rules) ? tuning.rules : {})
        .filter(([, source]) => ruleNames(source).includes(key))
        .map(([name, source]) => site(packageService, "tuning.json", {
          pointer: pointer(["rules", name]), channel: "json", kind: "tuning-rule", name, source
        }));
      // A personalization question that sets the key is a site the plan
      // cannot rewrite honestly (a question sets a tuning key, not a
      // contract value), so it refuses in the designer's words, as a rule does.
      const personalization = parseJson(currentFiles.get("personalization.json"));
      const sets = (Array.isArray(personalization?.questions) ? personalization.questions : []).flatMap((question, index) => {
        const found = [];
        if (question?.sets === key) found.push(pointer(["questions", index, "sets"]));
        (Array.isArray(question?.options) ? question.options : []).forEach((option, optionIndex) => {
          if (plainObject(option?.sets) && Object.hasOwn(option.sets, key)) found.push(pointer(["questions", index, "options", optionIndex, "sets", key]));
        });
        return found.map(at => site(packageService, "personalization.json", { pointer: at, channel: "json", kind: "personalization-set", question: question?.id }));
      });
      const sites = [...prose, ...range, ...rules, ...sets];
      const counts = { prose: prose.length, ranges: range.length, rules: rules.length, sets: sets.length };
      if (rules.length) return refusal(revision, CONTRACT_COPY.moveRuleRefused(key, rules[0].source), {
        family: "contract", job: "use-contract-value", sites, unreachable: rules,
        key, contractAddress, target, counts
      });
      if (sets.length) return refusal(revision, CONTRACT_COPY.moveSetRefused(key, sets[0].question), {
        family: "contract", job: "use-contract-value", sites, unreachable: sets,
        key, contractAddress, target, counts
      });
      return {
        safety: "complete", family: "contract", job: "use-contract-value", sites, unreachable: [],
        packageRevision: revision, key, contractAddress, target,
        counts, reason: CONTRACT_COPY.moveConfirmation(key, prose.length, range.length > 0)
      };
    },
    async applyUseContractValue(plan) {
      const stale = () => plan?.packageRevision !== packageRevision()
        || plan?.sites?.some(item => packageService.revision(item.file) !== item.revision);
      if (!plan || plan.safety !== "complete" || plan.job !== "use-contract-value") {
        return plan ?? refusal(packageRevision(), CONTRACT_COPY.transactionRefused);
      }
      if (stale()) return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
        family: "contract", key: plan.key, contractAddress: plan.contractAddress
      });
      const transaction = edits.begin(CONTRACT_COPY.undo.useContractNumber);
      for (const item of plan.sites.filter(site => site.channel === "prose").sort((left, right) => right.file.localeCompare(left.file)
        || right.range.start.line - left.range.start.line || right.range.start.character - left.range.start.character)) {
        transaction.text(item.file).replace({ ...item.range, revision: item.revision }, plan.contractAddress);
      }
      if (plan.sites.some(site => site.kind === "tuning-range")) {
        transaction.json("tuning.json").remove(pointer(["ranges", plan.key]));
      }
      transaction.json("tuning.json").remove(pointer(["values", plan.key]));
      if (stale()) { transaction.abort(); return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
        family: "contract", key: plan.key, contractAddress: plan.contractAddress
      }); }
      try {
        await validatePackage(transaction);
        if (stale()) { transaction.abort(); return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
          family: "contract", key: plan.key, contractAddress: plan.contractAddress
        }); }
        await transaction.commit();
      } catch (error) {
        transaction.abort();
        return refusal(packageRevision(), CONTRACT_COPY.validationRefused(error.message), {
          family: "contract", key: plan.key, contractAddress: plan.contractAddress
        });
      }
      await analysis?.refresh?.();
      return { ...plan, applied: true };
    },
    planRename(name, next) {
      const revision = packageRevision();
      const currentFiles = files();
      const currentView = view();
      const target = familyFor(name, currentFiles, currentView);
      if (!target) return refusal(revision, COLLECTION_COPY.renameUnknown(name), { name, next });
      if (target.family === "contract" && target.value) return refusal(revision, CONTRACT_COPY.valueRenameRefused(name), { name, next });
      const generic = !["collection", "collection-record", "collection-field", "contract"].includes(target.family);
      const nextAddress = target.family === "section" ? `${target.file}#${next}` : generic ? genericAddress(target, next) : next;
      const legal = target.family === "collection-field" ? FIELD.test(next)
        : target.family === "tuning-value" ? DOTTED_KEY.test(next)
          : target.family === "runtime" ? RUNTIME_ADDRESS.test(nextAddress)
            : target.family === "clock" ? CLOCK_KEY.test(next)
              : target.family === "section" ? SECTION_SLUG.test(next)
              : target.family === "palette" ? /^(?=[a-z0-9.-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/u.test(next)
              : KEBAB.test(next);
      if (!legal) return refusal(revision, target.family === "collection-field"
        ? COLLECTION_COPY.renameFieldName : generic ? INSPECTOR_COPY.renameName : COLLECTION_COPY.renameKebab, { name, next, family: target.family });
      if (generic) {
        const taken = target.family === "section"
          ? (currentView?.definitionsByName?.get?.(nextAddress) ?? []).some(definition => definition.kind === "section"
            && (definition.file !== target.file || definition.range?.start?.line !== target.line))
          : genericFamilyFor(nextAddress, currentFiles, currentView);
        if (taken && nextAddress !== name) return refusal(revision, INSPECTOR_COPY.renameTaken(nextAddress), { name, next, family: target.family });
        const proseName = target.family === "tuning-rule" ? `rules.${target.key}` : name;
        const sites = target.family === "section"
          ? sectionSites(packageService, currentFiles, currentView, target)
          : uniqueSites([...jsonSites(packageService, currentFiles, target), ...proseSites(packageService, currentFiles, currentView, proseName)]);
        const counts = {
          prose: sites.filter(item => item.channel === "prose").length,
          json: sites.filter(item => item.channel === "json").length
        };
        const partial = target.family === "runtime";
        return {
          safety: partial ? "partial" : "complete", sites, unreachable: [], packageRevision: revision,
          reason: partial ? INSPECTOR_COPY.renamePartial(name, counts.prose, counts.json)
            : target.family === "section" ? INSPECTOR_COPY.renameSection(target.slug, next,
              sites.filter(item => item.kind === "section-citation").length)
            : INSPECTOR_COPY.renameComplete(name, nextAddress, counts.prose, counts.json),
          family: target.family, name, next: target.family === "section" ? next : nextAddress, target, counts
        };
      }
      let taken = false;
      if (target.family === "contract") taken = currentFiles.has(`contracts/${next}.json`);
      else if (target.family === "collection") taken = packageService.list().some(path => path === `collections/${next}`
        || path.startsWith(`collections/${next}/`));
      else if (target.family === "collection-record") taken = currentFiles.has(`collections/${target.collection}/${next}.json`);
      else {
        const own = schemas(currentFiles).find(item => item.collection === target.collection)?.record;
        let level = own;
        for (const parent of target.parentPath) level = level?.[parent]?.of;
        taken = plainObject(level) && Object.hasOwn(level, next);
      }
      if (taken) return refusal(revision, COLLECTION_COPY.renameTaken(next), { name, next, family: target.family });
      const sites = [...proseSites(packageService, currentFiles, currentView, name), ...jsonSites(packageService, currentFiles, target)];
      const counts = {
        prose: sites.filter(item => item.channel === "prose").length,
        json: sites.filter(item => item.channel === "json").length
      };
      let reason;
      let bareWords = 0;
      if (target.family === "contract") {
        reason = CONTRACT_COPY.rename(target.adoption, next, counts.prose, counts.json);
      } else if (target.family === "collection-record") {
        const definitionFile = `collections/${target.collection}/${target.record}.json`;
        bareWords = (currentView?.anchors ?? []).filter(anchor => anchor.name === target.record
          && anchor.classification === "known" && anchor.definitions?.length === 1
          && anchor.definitions[0].kind === "collection-record" && anchor.definitions[0].file === definitionFile).length;
        reason = COLLECTION_COPY.renameRecord(target.record, next, counts.prose,
          sites.filter(item => item.kind === "link-value").length);
      } else if (target.family === "collection") {
        const records = recordEntries(currentFiles).filter(item => item.collection === target.collection).length;
        reason = COLLECTION_COPY.renameCollection(target.collection, next, records, counts.prose,
          sites.filter(item => item.kind === "collection-to").length);
        counts.records = records;
      } else {
        const records = new Set(sites.filter(item => item.kind === "record-key").map(item => item.file)).size;
        const schemaNames = new Set(sites.filter(item => ["mirrored-by", "when-row"].includes(item.kind)).map(item => item.file)).size;
        reason = COLLECTION_COPY.renameField(target.field, next, records, schemaNames);
        counts.records = records;
        counts.schemas = schemaNames;
      }
      if (bareWords) reason += ` ${COLLECTION_COPY.bareMentions(bareWords, target.record)}`;
      return {
        safety: "complete", sites, unreachable: [], packageRevision: revision, reason,
        family: target.family, name, next, target, counts, bareWords
      };
    },
    async applyRename(plan) {
      const changedReason = () => COLLECTION_COPY.renameChanged;
      const stale = () => plan?.packageRevision !== packageRevision()
        || plan?.sites?.some(item => packageService.revision(item.file) !== item.revision);
      if (!plan || plan.safety !== "complete") return plan ?? refusal(packageRevision(), COLLECTION_COPY.renameUnknown(""));
      const headingEdits = plan.headingEdit?.edits;
      const headingEditAccepted = !plan.headingEdit || plan.family === "section"
        && plan.headingEdit.address === plan.target?.address
        && plan.headingEdit.file === plan.target?.file
        && Array.isArray(headingEdits) && headingEdits.length > 0
        && headingEdits.every(edit => edit && typeof edit.text === "string"
          && edit.range?.start?.line === plan.target?.line && edit.range?.end?.line === plan.target?.line);
      if (!headingEditAccepted) return refusal(packageRevision(), INSPECTOR_COPY.renameHeadingEditRefused, {
        name: plan.name, next: plan.next, family: plan.family
      });
      if (stale()) return refusal(packageRevision(), changedReason(), {
        name: plan.name, next: plan.next, family: plan.family
      });
      const generic = !["collection", "collection-record", "collection-field", "contract"].includes(plan.family);
      const label = generic ? INSPECTOR_COPY.undoRename : plan.family === "contract" ? CONTRACT_COPY.undo.rename : COLLECTION_COPY.undo[plan.family === "collection-record" ? "renameRecord"
        : plan.family === "collection" ? "renameCollection" : "renameField"];
      const transaction = edits.begin(label);
      const prose = plan.sites.filter(item => item.channel === "prose").sort((left, right) =>
        right.file.localeCompare(left.file) || right.range.start.line - left.range.start.line
        || right.range.start.character - left.range.start.character);
      for (const item of prose) {
        if (plan.family === "section" && item.kind === "section-declaration" && plan.headingEdit) continue;
        const replacement = plan.family === "section"
          ? item.kind === "section-citation" ? `${item.prefix}${plan.next}` : plan.next
          : generic ? plan.family === "tuning-rule" ? `rules.${plan.next}` : plan.next
            : plan.family === "contract" ? `contracts.${plan.next}`
              : plan.family === "collection" ? `collections.${plan.next}`
                : plan.family === "collection-record" ? `collections.${plan.target.collection}.${plan.next}` : plan.next;
        transaction.text(item.file).replace({ ...item.range, revision: item.revision }, replacement);
      }
      const json = plan.sites.filter(item => item.channel === "json");
      if (generic) {
        for (const item of json) {
          if (item.range) transaction.text(item.file).replace(item.range, plan.next);
          else if (item.operation === "rename-key") transaction.json(item.file).renameKey(item.pointer, genericLocalName(plan.target, plan.next));
          else if (item.operation === "rule-source") transaction.json(item.file).set(item.pointer, replaceRuleName(item.current, plan.name, plan.next));
          else transaction.json(item.file).set(item.pointer, plan.next);
        }
      } else if (plan.family === "contract") {
        for (const item of json) transaction.json(item.file).set(item.pointer,
          `contracts.${plan.next}${item.current.slice(`contracts.${plan.target.adoption}`.length)}`);
        transaction.file(plan.target.file).move(`contracts/${plan.next}.json`);
      } else if (plan.family === "collection-record") {
        for (const item of json) transaction.json(item.file).set(item.pointer, plan.next);
        transaction.file(`collections/${plan.target.collection}/${plan.target.record}.json`)
          .move(`collections/${plan.target.collection}/${plan.next}.json`);
      } else if (plan.family === "collection") {
        for (const item of json) transaction.json(item.file).set(item.pointer, plan.next);
        transaction.folder(`collections/${plan.target.collection}`).move(`collections/${plan.next}`);
      } else {
        const schemaKey = json.find(item => item.kind === "field-schema-key");
        const recordKeys = json.filter(item => item.kind === "record-key");
        for (const item of recordKeys) transaction.json(item.file).renameKey(item.pointer, plan.next);
        if (schemaKey) transaction.json(schemaKey.file).renameKey(schemaKey.pointer, plan.next);
        for (const item of json.filter(item => item.kind === "when-row")) {
          const parts = item.pointer.split("/");
          if (item.ownerField === plan.target.field) parts[parts.length - 4] = pointerSegment(plan.next);
          transaction.json(item.file).renameKey(parts.join("/"), plan.next);
        }
        for (const item of json.filter(item => item.kind === "mirrored-by")) transaction.json(item.file).set(item.pointer, plan.next);
      }
      if (plan.headingEdit) {
        for (const edit of [...headingEdits].sort((left, right) =>
          right.range.start.character - left.range.start.character)) {
          transaction.text(plan.headingEdit.file).replace(edit.range, edit.text);
        }
      }
      if (stale()) { transaction.abort(); return refusal(packageRevision(), changedReason(), {
        name: plan.name, next: plan.next, family: plan.family
      }); }
      try {
        await validatePackage(transaction);
        if (stale()) { transaction.abort(); return refusal(packageRevision(), changedReason(), {
          name: plan.name, next: plan.next, family: plan.family
        }); }
        await transaction.commit();
      } catch (error) {
        transaction.abort();
        if (stale() || /older package revision|stale/u.test(error.message)) return refusal(packageRevision(), changedReason(), {
          name: plan.name, next: plan.next, family: plan.family
        });
        // A designer sentence first; the validator's finding under it.
        return refusal(packageRevision(), COLLECTION_COPY.validationRefused(error.message), { name: plan.name, next: plan.next, family: plan.family });
      }
      await analysis?.refresh?.();
      return { ...plan, applied: true };
    }
  };
  return Object.freeze(service);
}
