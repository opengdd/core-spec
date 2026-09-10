import { parseJson, pointerSegment } from "./json-path.mjs";

const DOTTED_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const COLLECTION_RECORD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_NAME = /^(?:(.+\.md))?#([A-Za-z0-9._-]+)$/i;
const ACCEPTANCE_TEST = /^AT-(\d+)$/;
const CREATABLE_NAME = /^[A-Za-z0-9._-]+$/;
const MOOD_ID = /^(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_EXTENSION_SEGMENT = "(?!(?:json|md)(?:\\.|$))";
const addressPattern = (prefix, segment, repeated = false) => {
  const guarded = `${RESERVED_EXTENSION_SEGMENT}${segment}`;
  return new RegExp(`^${prefix}\\.(${guarded}${repeated ? `(?:\\.${guarded})*` : ""})$`);
};
const CLOCK_ADDRESS = addressPattern("clocks", "[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?");
const RULE_ADDRESS = addressPattern("rules", "[a-z0-9]+(?:-[a-z0-9]+)*");
const PALETTE_NAME = addressPattern("palette", "(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*", true);
const RESERVED_CREATION_FIRST_SEGMENTS = new Set(RESERVED_FIRST_SEGMENTS);
const RESERVED_CREATION_EXTENSIONS = new Set(RESERVED_EXTENSIONS);

// These are the kinds for which classifyCreation already supplies the host's
// built-in quick-create path. Panel creators of the same kind stay available
// inside their own panel, but must not duplicate the host's choice.
export const BUILT_IN_CREATION_KINDS = Object.freeze([
  "acceptance-test", "clock", "collection-record", "colors", "contrast", "mood",
  "palette", "question", "rule", "section", "timing", "value"
]);

const insertion = (at, keyOrIndex, value, options) => ({ type: "insert", pointer: at, keyOrIndex, value, options });
const removal = pointer => ({ type: "remove", pointer });

export function parseJsonScalar(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(CREATION_COPY.validJsonScalar); }
  if (value !== null && typeof value === "object") throw new Error(CREATION_COPY.jsonScalarOnly);
  return value;
}

function appendBlock(text, block) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const separator = !text ? "" : text.endsWith(`${newline}${newline}`) ? "" : text.endsWith(newline) ? newline : `${newline}${newline}`;
  return `${text}${separator}${block.replaceAll("\n", newline)}${newline}`;
}

function titleFromSlug(slug) {
  return slug.split(/[-_.]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(" ") || slug;
}

export function nextChapterNumber(files) {
  const used = new Set([...files.keys()].flatMap(path => {
    const match = /^(\d{2})-[^/]+\.md$/i.exec(path);
    return match ? [Number(match[1])] : [];
  }));
  for (let number = 6; number <= 99; number += 1) if (!used.has(number)) return String(number).padStart(2, "0");
  throw new Error(CREATION_COPY.noChapterNumber);
}

export function chapterCreation(files, name) {
  const title = String(name).trim();
  const stem = kebabName(title);
  if (!stem) throw new Error(CREATION_COPY.chapterDialog.nameRequired);
  const number = nextChapterNumber(files);
  const path = `${number}-${stem}.md`;
  return { path, stem, text: `# ${title}\n` };
}

function markdownTarget(files, requested, openPath) {
  if (!requested) return typeof files.get(openPath) === "string" && /\.md$/i.test(openPath) ? openPath : undefined;
  if (typeof files.get(requested) === "string" && /\.md$/i.test(requested)) return requested;
  const matches = [...files.keys()].filter(path => path.slice(path.lastIndexOf("/") + 1) === requested && /\.md$/i.test(path));
  return matches.length === 1 ? matches[0] : undefined;
}

function collectionDrawers(files, folders) {
  const drawers = new Set();
  // Invalid drawer ids stay unavailable here because validation owns their correction.
  for (const path of folders ?? []) {
    const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(path);
    if (match) drawers.add(match[1]);
  }
  // Direct callers can omit implied folders, so files independently reveal drawers.
  for (const path of files.keys()) {
    const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(path);
    if (match) drawers.add(match[1]);
  }
  return [...drawers].sort((left, right) => left.localeCompare(right));
}

function seedCollectionField(record, field, definition) {
  if (Object.hasOwn(definition, "pattern") || definition.unique === true || definition.type === "grid") return;
  if (definition.type === "link") record[field] = definition.many === true ? [] : null;
  else if (definition.type === "list") record[field] = [];
  else if (Array.isArray(definition.options) && definition.options.length) record[field] = definition.options[0];
  else if (definition.type === "string") record[field] = "";
  else if (definition.type === "integer" || definition.type === "number") record[field] = 0;
}

export function collectionRowWhenSatisfied(when, row) {
  // This mirrors the validator's legal subset; validation owns malformed when shapes.
  if (!when || Array.isArray(when) || typeof when !== "object") return false;
  if (!Object.hasOwn(when, "row")) return true;
  if (!when.row || Array.isArray(when.row) || typeof when.row !== "object") return false;
  return Object.entries(when.row).every(([field, values]) => Array.isArray(values) && values.includes(row[field]));
}

export function collectionRowWhenValid(when) {
  if (!when || Array.isArray(when) || typeof when !== "object") return false;
  if (Object.keys(when).some(key => key !== "row")) return false;
  if (!Object.hasOwn(when, "row")) return true;
  if (!when.row || Array.isArray(when.row) || typeof when.row !== "object") return false;
  return Object.values(when.row).every(values => Array.isArray(values) && values.length > 0);
}

export function collectionRecordText(files, drawer) {
  const label = parseJson(files.get(`collections/${drawer}/_collection.json`));
  const schema = label?.record;
  if (!schema || Array.isArray(schema) || typeof schema !== "object") return "{}\n";
  const record = {};
  for (const [field, definition] of Object.entries(schema)) {
    if (!definition || Array.isArray(definition) || typeof definition !== "object" || definition.required !== true) continue;
    seedCollectionField(record, field, definition);
  }
  for (let pass = 0; pass < Object.keys(schema).length; pass += 1) {
    let added = false;
    for (const [field, definition] of Object.entries(schema)) {
      if (!definition || Array.isArray(definition) || typeof definition !== "object") continue;
      if (!Object.hasOwn(definition, "when") || Object.hasOwn(record, field)) continue;
      if (!collectionRowWhenSatisfied(definition.when, record)) continue;
      seedCollectionField(record, field, definition);
      added = Object.hasOwn(record, field);
    }
    if (!added) break;
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}

function collectionRecords(files) {
  const recordsByDrawer = new Map();
  for (const [path, text] of files) {
    const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(path);
    if (!match || typeof text !== "string") continue;
    const record = parseJson(text);
    if (!record || Array.isArray(record) || typeof record !== "object") continue;
    const records = recordsByDrawer.get(match[1]) ?? [];
    records.push({ id: match[2], record });
    recordsByDrawer.set(match[1], records);
  }
  return recordsByDrawer;
}

const MISSING_FIELD = Symbol("missing collection field");

export function inferredLink(values, idsByDrawer) {
  const present = values.filter(value => value !== MISSING_FIELD && value !== null);
  if (!present.length) return undefined;
  const arrays = present.map(Array.isArray);
  if (arrays.some(Boolean) && arrays.some(value => !value)) return undefined;
  if (!present.every(value => typeof value === "string"
    || (Array.isArray(value) && value.every(item => typeof item === "string")))) return undefined;
  const ids = present.flat();
  if (!ids.length) return undefined;
  const targets = [...idsByDrawer].filter(([, targetIds]) => ids.every(id => targetIds.has(id))).map(([target]) => target);
  if (targets.length !== 1) return undefined;
  return { type: "link", to: targets[0], ...(arrays.some(Boolean) ? { many: true } : {}) };
}

export function inferField(values, idsByDrawer) {
  const present = values.filter(value => value !== MISSING_FIELD);
  const link = inferredLink(values, idsByDrawer);
  let definition;
  if (link) definition = link;
  else if (present.length && present.every(value => typeof value === "string")) definition = { type: "string" };
  else if (present.length && present.every(value => typeof value === "number" && Number.isFinite(value))) {
    definition = { type: present.every(Number.isInteger) ? "integer" : "number" };
  } else if (present.length && present.every(value => Array.isArray(value) && value.length > 0
    && value.every(row => typeof row === "string" && [...row].length > 0 && [...row].length === [...value[0]].length))
    // Equal-length word lists and character grids have the same JSON shape.
    // Stay conservative unless the rows carry visible board notation; the
    // designer can still choose grid in Describe the fields.
    && present.some(value => value.some(row => /[^\p{L}\s-]/u.test(row)))) {
    definition = { type: "grid" };
  } else if (present.length && present.every(value => Array.isArray(value)
    && value.every(row => row && !Array.isArray(row) && typeof row === "object"))) {
    const rows = present.flat();
    const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(field => !field.startsWith("_"))))];
    const of = {};
    for (const field of keys) {
      const nested = inferField(rows.map(row => Object.hasOwn(row, field) ? row[field] : MISSING_FIELD), idsByDrawer);
      if (!nested) return undefined;
      of[field] = nested;
    }
    definition = { type: "list", of };
  }
  if (!definition) return undefined;
  const everyRecordCarriesField = values.every(value => value !== MISSING_FIELD);
  const requiredLinkHasValue = definition.type !== "link"
    || values.every(value => value !== null && (!Array.isArray(value) || value.length > 0));
  if (everyRecordCarriesField && requiredLinkHasValue) definition.required = true;
  return definition;
}

export function inferCollectionRecord(files, drawer) {
  const recordsByDrawer = collectionRecords(files);
  const records = recordsByDrawer.get(drawer) ?? [];
  const idsByDrawer = new Map([...recordsByDrawer].map(([name, entries]) => [name, new Set(entries.map(record => record.id))]));
  const fields = [...new Set(records.flatMap(({ record }) => Object.keys(record).filter(field => !field.startsWith("_"))))];
  const record = {};
  for (const field of fields) {
    const definition = inferField(records.map(entry => Object.hasOwn(entry.record, field) ? entry.record[field] : MISSING_FIELD), idsByDrawer);
    if (!definition) return { record: undefined, refusalField: field };
    record[field] = definition;
  }
  return { record, refusalField: undefined };
}

export function inferCollectionField(files, drawer, field) {
  const recordsByDrawer = collectionRecords(files);
  const records = recordsByDrawer.get(drawer) ?? [];
  const idsByDrawer = new Map([...recordsByDrawer].map(([name, entries]) => [name, new Set(entries.map(record => record.id))]));
  return inferField(records.map(entry => Object.hasOwn(entry.record, field) ? entry.record[field] : MISSING_FIELD), idsByDrawer);
}

export function linkOffers(files) {
  const recordsByDrawer = collectionRecords(files);
  const idsByDrawer = new Map([...recordsByDrawer].map(([drawer, records]) => [drawer, new Set(records.map(record => record.id))]));
  const offers = [];
  for (const [drawer, records] of [...recordsByDrawer].sort(([left], [right]) => left.localeCompare(right))) {
    if (!records.length) continue;
    const labelPath = `collections/${drawer}/_collection.json`;
    const labelText = files.get(labelPath);
    const label = labelText === undefined ? undefined : parseJson(labelText);
    if (labelText !== undefined && (!label || Array.isArray(label) || typeof label !== "object")) continue;
    const described = label?.record;
    if (described !== undefined && (!described || Array.isArray(described) || typeof described !== "object")) continue;
    const fields = [...new Set(records.flatMap(({ record }) => Object.keys(record).filter(field => !field.startsWith("_"))))]
      .filter(field => !Object.hasOwn(described ?? {}, field));
    const candidates = fields.flatMap(field => {
      const definition = inferredLink(records.map(record => Object.hasOwn(record.record, field) ? record.record[field] : MISSING_FIELD), idsByDrawer);
      return definition ? [{ field, definition }] : [];
    });
    if (!candidates.length) continue;
    const inferred = labelText === undefined ? inferCollectionRecord(files, drawer) : undefined;
    if (inferred?.refusalField) {
      offers.push({ drawer, path: labelPath, refused: true, refusalField: inferred.refusalField });
      continue;
    }
    for (const candidate of candidates) {
      offers.push({
        drawer,
        field: candidate.field,
        to: candidate.definition.to,
        many: candidate.definition.many === true,
        definition: candidate.definition,
        record: inferred?.record,
        path: labelPath
      });
    }
  }
  return offers;
}

export function kebabName(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function collectionNameTaken(files, folders, name) {
  const target = kebabName(name).toLowerCase();
  if (!target) return false;
  return [...files.keys(), ...(folders ?? [])].some(path => {
    const match = /^collections\/([^/]+)(?:\/|$)/i.exec(path);
    return match?.[1].toLowerCase() === target;
  });
}

export function collectionRecordNameTaken(files, folders, drawer, name) {
  const target = `collections/${drawer}/${kebabName(name)}.json`.toLowerCase();
  if (!kebabName(name)) return false;
  return [...files.keys(), ...(folders ?? [])].some(path => path.toLowerCase() === target);
}

const measuredPromiseKind = value => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["color", "colour", "colors", "colours"].includes(normalized)) return "colors";
  if (normalized === "contrast") return "contrast";
  if (normalized === "timing") return "timing";
  return undefined;
};

const namedDirectionColors = direction => Object.entries(
  direction?.palette && !Array.isArray(direction.palette) && typeof direction.palette === "object"
    ? direction.palette : {}
).flatMap(([palette, entries]) => (Array.isArray(entries) ? entries : []).flatMap(entry => {
  if (!entry || Array.isArray(entry) || typeof entry !== "object") return [];
  const names = Object.keys(entry);
  return names.length === 1 ? [`palette.${palette}.${names[0]}`] : [];
}));

export function measuredPromiseCreation(files, requestedType, requestedName) {
  const kind = measuredPromiseKind(requestedType);
  if (!kind) throw new Error(CREATION_COPY.measuredPromiseTypeRequired);
  const text = files.get("direction.json");
  const direction = text === undefined ? undefined : parseJson(text);
  if (text !== undefined && (!direction || Array.isArray(direction) || typeof direction !== "object")) {
    throw new Error(CREATION_COPY.outlineErrors.promiseDirection);
  }
  if (direction?.[kind] !== undefined
    && (!direction[kind] || Array.isArray(direction[kind]) || typeof direction[kind] !== "object")) {
    throw new Error(CREATION_COPY.outlineErrors.promiseMap(kind));
  }
  const requested = kebabName(String(requestedName ?? "").replace(/^(?:colors|contrast|timing)\./u, ""));
  const base = kind === "colors" ? "new-colour-promise" : kind === "contrast" ? "new-contrast-promise" : "new-timing-promise";
  const id = (() => {
    const entries = direction?.[kind] ?? {};
    const wanted = requested || base;
    if (!Object.hasOwn(entries, wanted)) return wanted;
    for (let suffix = 2; ; suffix += 1) if (!Object.hasOwn(entries, `${wanted}-${suffix}`)) return `${wanted}-${suffix}`;
  })();
  const colors = namedDirectionColors(direction);
  let value;
  if (kind === "colors") {
    if (!colors.length) throw new Error(CREATION_COPY.measuredPromiseNeedsColor);
    value = { is: colors[0], within: 0, where: INSPECTOR_COPY.promiseWherePlaceholder };
  } else if (kind === "contrast") {
    if (colors.length < 2) throw new Error(CREATION_COPY.measuredPromiseNeedsTwoColors);
    value = { colors: [colors[0]], against: colors[1], at_least: 4.5, where: INSPECTOR_COPY.promiseWherePlaceholder };
  } else {
    const tuning = parseJson(files.get("tuning.json"));
    const keys = tuning?.values && !Array.isArray(tuning.values) && typeof tuning.values === "object"
      ? Object.keys(tuning.values) : [];
    if (!keys.length) throw new Error(CREATION_COPY.measuredPromiseNeedsTuningKey);
    value = { key: keys[0], where: INSPECTOR_COPY.promiseWherePlaceholder };
  }
  return Object.freeze({
    kind,
    id,
    target: "direction.json",
    create: direction === undefined ? `${JSON.stringify({ [kind]: { [id]: value } }, null, 2)}\n` : undefined,
    operations: direction === undefined ? undefined : () => direction[kind] === undefined
      ? [insertion("", kind, { [id]: value })]
      : [insertion(`/${kind}`, id, value)],
    selected: { kind, name: `${kind}.${id}`, file: "direction.json" }
  });
}

export function questionCreation(files, requestedName) {
  const target = "personalization.json";
  const text = files.get(target);
  const document = text === undefined ? undefined : parseJson(text);
  if (text !== undefined && (!document || Array.isArray(document) || typeof document !== "object")) {
    throw new Error(CREATION_COPY.outlineErrors.personalizationObject);
  }
  if (document?.questions !== undefined && !Array.isArray(document.questions)) {
    throw new Error(CREATION_COPY.outlineErrors.personalizationQuestions);
  }
  const questions = Array.isArray(document?.questions) ? document.questions : [];
  const used = new Set(questions.flatMap(question => typeof question?.id === "string" ? [question.id] : []));
  const requested = kebabName(String(requestedName ?? "").replace(/^questions?\./u, ""));
  const base = requested || "new-question";
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  const value = { id, prompt: CREATION_COPY.questionPlaceholderPrompt, type: "text", default: "" };
  return Object.freeze({
    kind: "question", target, id, value,
    create: text === undefined ? `${JSON.stringify({ questions: [value] }, null, 2)}\n` : undefined,
    operations: text === undefined ? undefined : () => document.questions === undefined
      ? [insertion("", "questions", [value])]
      : [insertion("/questions", "-", value, { pretty: true })],
    selected: Object.freeze({ kind: "question", name: id, file: target })
  });
}

export function rankCollectionCreationActions(actions, files, revisionFor, limit = 3) {
  const collectionActions = actions.filter(action => action.kind === "collection-record")
    .sort((left, right) => {
      const revision = action => Math.max(-1, ...[...files.keys()]
        .filter(file => file.startsWith(`collections/${action.drawer}/`))
        .map(file => revisionFor(file) ?? -1));
      return revision(right) - revision(left) || left.drawer.localeCompare(right.drawer);
    });
  if (collectionActions.length <= limit) return actions;
  const first = actions.findIndex(action => action.kind === "collection-record");
  const ranked = actions.filter(action => action.kind !== "collection-record");
  ranked.splice(first, 0, ...collectionActions.slice(0, limit), {
    kind: "more",
    label: CREATION_COPY.more,
    choice: CREATION_COPY.more,
    revealActions: collectionActions.slice(limit)
  });
  return ranked;
}

export function defaultRuleLine(files) {
  const tuning = parseJson(files.get("tuning.json"));
  const values = tuning?.values && !Array.isArray(tuning.values) && typeof tuning.values === "object"
    ? Object.entries(tuning.values).filter(([, value]) => Number.isFinite(value)).map(([key]) => key)
    : [];
  return values.length >= 2 ? `${values[0]} <= max(${values[0]}, ${values[1]})` : "1 <= 1";
}

function ruleValue(source, values, writeAnyway = false) {
  const ast = parseRule(source);
  if (!writeAnyway && !evaluateRule(ast, values)) {
    const error = new Error(CREATION_COPY.ruleFalse);
    error.writeAnyway = true;
    throw error;
  }
  return source;
}

function ruleAction(address, files) {
  const match = RULE_ADDRESS.exec(address);
  if (!match) return undefined;
  const target = "tuning.json";
  const text = files.get(target);
  const document = text === undefined ? undefined : parseJson(text);
  if (text === undefined) return { actions: [], reason: CREATION_COPY.cannotAddNoTuning(address) };
  if (text !== undefined && (!document || Array.isArray(document) || typeof document !== "object")) {
    return { actions: [], reason: CREATION_COPY.cannotAddTuningObject(address) };
  }
  if (document?.rules !== undefined && (!document.rules || Array.isArray(document.rules) || typeof document.rules !== "object")) {
    return { actions: [], reason: CREATION_COPY.cannotAddRulesObject(address) };
  }
  if (Object.hasOwn(document?.rules ?? {}, match[1])) return { actions: [], reason: CREATION_COPY.alreadyDeclared(address) };
  const line = defaultRuleLine(files);
  const values = document?.values && !Array.isArray(document.values) && typeof document.values === "object"
    ? document.values
    : {};
  const operations = value => document?.rules === undefined
    ? [insertion("", "rules", { [match[1]]: value })]
    : [insertion("/rules", match[1], value)];
  const action = {
    kind: "rule",
    label: CREATION_COPY.createRule,
    choice: CREATION_COPY.choices.rule,
    target,
    operations,
    needsValue: true,
    defaultValue: line,
    valueLabel: CREATION_COPY.ruleLine,
    parseValue: source => ruleValue(source, values),
    selected: { kind: "rule", name: match[1], file: target },
    notice: CREATION_COPY.addedRule(match[1])
  };
  return { actions: [action, {
    ...action,
    choice: CREATION_COPY.writeRuleAnyway,
    hiddenUntilError: true,
    parseValue: source => ruleValue(source, values, true)
  }] };
}

function clockAction(address, files) {
  const match = CLOCK_ADDRESS.exec(address);
  if (!match) return undefined;
  const target = "clocks.json";
  const text = files.get(target);
  const document = text === undefined ? undefined : parseJson(text);
  if (text !== undefined && (!document || Array.isArray(document) || typeof document !== "object")) {
    return { actions: [], reason: CREATION_COPY.cannotAddClocksObject(address) };
  }
  if (Object.hasOwn(document ?? {}, match[1])) return { actions: [], reason: CREATION_COPY.alreadyDeclared(address) };
  const existing = Object.keys(document ?? {});
  if (existing.some(name => !document[name] || Array.isArray(document[name]) || typeof document[name] !== "object"
    || !document[name].modes || Array.isArray(document[name].modes) || typeof document[name].modes !== "object")) {
    return { actions: [], reason: CREATION_COPY.cannotFindClockModes(address) };
  }
  const modes = existing.length
    ? Object.fromEntries([...new Set(existing.flatMap(name => Object.keys(document[name]?.modes ?? {})))].map(mode => [mode, "none"]))
    : { playing: "running" };
  if (!Object.keys(modes).length) return { actions: [], reason: CREATION_COPY.cannotFindClockModes(address) };
  const value = { unit: "seconds", advances: [], modes };
  return { actions: [{
    kind: "clock",
    label: CREATION_COPY.createClock,
    choice: CREATION_COPY.choices.clock,
    target,
    create: text === undefined ? `${JSON.stringify({ [match[1]]: value }, null, 2)}\n` : undefined,
    operations: text === undefined ? undefined : () => [insertion("", match[1], value)],
    selected: { kind: "clock", name: address, file: target },
    notice: CREATION_COPY.addedClock(match[1])
  }] };
}

export function rangeChange(files, key) {
  const tuning = parseJson(files.get("tuning.json"));
  if (!tuning || Array.isArray(tuning) || typeof tuning !== "object") throw new Error(CREATION_COPY.outlineErrors.tuningObject);
  if (!tuning.values || Array.isArray(tuning.values) || typeof tuning.values !== "object") throw new Error(CREATION_COPY.outlineErrors.tuningObject);
  const value = tuning.values[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(CREATION_COPY.cannotRangeValue(key));
  if (tuning.ranges !== undefined && (!tuning.ranges || Array.isArray(tuning.ranges) || typeof tuning.ranges !== "object")) {
    throw new Error(CREATION_COPY.outlineErrors.rangesObject);
  }
  if (Object.hasOwn(tuning.ranges ?? {}, key)) {
    const reason = rangeRemovalRefusal(files, key);
    if (reason) return { remove: true, reason, operations: [] };
    const pointer = Object.keys(tuning.ranges).length === 1 ? "/ranges" : `/ranges/${pointerSegment(key)}`;
    return { remove: true, operations: [removal(pointer)] };
  }
  return {
    remove: false,
    operations: tuning.ranges === undefined
      ? [insertion("", "ranges", { [key]: [value, value] }, { recordSpacing: true, arraySpacing: true })]
      : [insertion("/ranges", key, [value, value], { arraySpacing: true })]
  };
}

export function rangeRemovalRefusal(files, key) {
  const personalization = parseJson(files.get("personalization.json"));
  if (!Array.isArray(personalization?.questions)) return undefined;
  for (const question of personalization.questions) {
    if (!question || Array.isArray(question) || typeof question !== "object") continue;
    const directlySets = question.sets === key;
    const optionSets = Array.isArray(question.options) && question.options.some(option => option?.sets
      && !Array.isArray(option.sets) && typeof option.sets === "object" && Object.hasOwn(option.sets, key));
    if ((directlySets || optionSets) && typeof question.id === "string") return CREATION_COPY.rangeRequired(question.id);
  }
  return undefined;
}

function testBlock(name, type) {
  const body = type === "general"
    ? { type: "general", scope: "TODO", holds: "TODO" }
    : { type: "scenario", given: "TODO", when: "TODO", then: "TODO" };
  return `## ${name.toUpperCase()} — Acceptance test\n\n\`\`\`test\n${JSON.stringify(body, null, 2)}\n\`\`\``;
}

function planAction(name, number, manifest, files) {
  // v0.6 fixed the canonical paths: the build plan is always this file,
  // and the manifest no longer carries a redirect.
  const target = "05-build-plan.md";
  const text = files.get(target);
  if (typeof text !== "string") return { actions: [], reason: CREATION_COPY.cannotAddNoPlan(name) };
  const numbers = [...text.matchAll(/^#{1,6}\s+AT-(\d+)\b/gim)].map(match => Number(match[1]));
  if (numbers.includes(number)) return { actions: [], reason: CREATION_COPY.cannotAddExistingHeading(name, target) };
  const next = Math.max(0, ...numbers) + 1;
  if (number !== next) return { actions: [], reason: CREATION_COPY.cannotAddNextAcceptance(name, next) };
  return { actions: ["scenario", "general"].map(type => ({
    kind: "acceptance-test",
    testType: type,
    label: type === "scenario" ? CREATION_COPY.createScenarioTest : CREATION_COPY.createGeneralTest,
    choice: type === "scenario" ? CREATION_COPY.createScenarioTest : CREATION_COPY.createGeneralTest,
    target,
    apply: text => appendBlock(text, testBlock(name, type)),
    selected: { kind: "acceptance-test", name: name.toUpperCase(), file: target },
    notice: CREATION_COPY.addedTo(name, target)
  })) };
}

export function classifyCreation(name, { files, folders, manifest, openPath }) {
  const clock = clockAction(name, files);
  if (clock) return clock;
  const rule = ruleAction(name, files);
  if (rule) return rule;

  const palette = PALETTE_NAME.exec(name);
  if (palette) {
    const text = files.get("direction.json");
    const document = typeof text === "string" ? parseJson(text) : undefined;
    if (text === undefined) {
      const value = { palette: { [palette[1]]: [{ "new-color": "#000000" }] } };
      return { actions: [{
        kind: "palette",
        label: CREATION_COPY.createPalette,
        choice: CREATION_COPY.choices.palette,
        target: "direction.json",
        create: `${JSON.stringify(value, null, 2)}\n`,
        notice: CREATION_COPY.addedPalette(name)
      }] };
    }
    if (!document || Array.isArray(document) || typeof document !== "object") {
      return { actions: [], reason: CREATION_COPY.cannotAddDirectionObject(name) };
    }
    if (document.palette !== undefined && (!document.palette || Array.isArray(document.palette) || typeof document.palette !== "object")) {
      return { actions: [], reason: CREATION_COPY.cannotAddPaletteObject(name) };
    }
    return { actions: [{
      kind: "palette",
      label: CREATION_COPY.createPalette,
      choice: CREATION_COPY.choices.palette,
      target: "direction.json",
      container: "palette",
      createContainer: document.palette === undefined,
      entryValue: [{ "new-color": "#000000" }],
      operations: () => [
        ...(document.palette === undefined ? [insertion("", "palette", {})] : []),
        insertion("/palette", palette[1], [{ "new-color": "#000000" }])
      ],
      notice: CREATION_COPY.addedPalette(name)
    }] };
  }

  if (DOTTED_KEY.test(name)) {
    const segments = name.split(".");
    if (RESERVED_CREATION_FIRST_SEGMENTS.has(segments[0]) || segments.some(segment => RESERVED_CREATION_EXTENSIONS.has(segment)) || segments.every(segment => /^\d+$/.test(segment))) {
      return { actions: [], reason: CREATION_COPY.cannotAddReserved(name) };
    }
    const target = "tuning.json";
    const document = parseJson(files.get(target));
    const actions = [];
    if (document?.values && typeof document.values === "object" && !Array.isArray(document.values)) {
      actions.push({ kind: "value", label: CREATION_COPY.createValue, choice: CREATION_COPY.choices.value, target, container: "values", needsValue: true,
        operations: value => [insertion("/values", name, value)], notice: CREATION_COPY.addedValue(name) });
    }
    return actions.length ? { actions } : { actions, reason: CREATION_COPY.cannotAddTuningObjects(name) };
  }

  const section = SECTION_NAME.exec(name);
  if (section) {
    const target = markdownTarget(files, section[1], openPath);
    if (!target) return { actions: [], reason: CREATION_COPY.cannotAddMarkdownTarget(name) };
    const slug = section[2];
    const block = `## ${titleFromSlug(slug)} {#${slug}}`;
    return { actions: [{ kind: "section", label: CREATION_COPY.createSection, choice: CREATION_COPY.choices.identifier, target, apply: text => appendBlock(text, block), notice: CREATION_COPY.addedTo(name, target) }] };
  }

  const acceptance = ACCEPTANCE_TEST.exec(name);
  if (acceptance) return planAction(name, Number(acceptance[1]), manifest, files);

  const target = markdownTarget(files, null, openPath);
  if (!target) return { actions: [], reason: CREATION_COPY.cannotAddNoMarkdown(name) };
  if (!CREATABLE_NAME.test(name)) return { actions: [], reason: CREATION_COPY.cannotAddNameShape(name) };
  const actions = [];
  const direction = parseJson(files.get("direction.json"));
  const moods = direction?.mood;
  if (MOOD_ID.test(name) && manifest?.opengdd === SUPPORTED_OPENGDD_VERSION && files.get("direction.json") === undefined) {
    const stub = { intent: "Describe the intended mood.", anti: ["Not yet specified."] };
    actions.push({
      kind: "mood",
      label: CREATION_COPY.createMood,
      choice: CREATION_COPY.choices.mood,
      target: "direction.json",
      create: `${JSON.stringify({ mood: { [name]: stub } }, null, 2)}\n`,
      notice: CREATION_COPY.addedMood(name)
    });
  } else if (MOOD_ID.test(name) && manifest?.opengdd === SUPPORTED_OPENGDD_VERSION && direction && !Array.isArray(direction) && typeof direction === "object"
    && (moods === undefined || (moods && !Array.isArray(moods) && typeof moods === "object"))) {
    const stub = { intent: "Describe the intended mood.", anti: ["Not yet specified."] };
    actions.push({
      kind: "mood",
      label: CREATION_COPY.createMood,
      choice: CREATION_COPY.choices.mood,
      target: "direction.json",
      operations: () => moods === undefined
        ? [insertion("", "mood", { [name]: stub })]
        : [insertion("/mood", name, stub)],
      notice: CREATION_COPY.addedMood(name)
    });
  }
  if (COLLECTION_RECORD_ID.test(name)) for (const drawer of collectionDrawers(files, folders)) {
    const collectionTarget = `collections/${drawer}/${name}.json`;
    if ([...files.keys(), ...(folders ?? [])].some(path => path.toLowerCase() === collectionTarget.toLowerCase())) continue;
    actions.push({
      kind: "collection-record",
      drawer,
      label: CREATION_COPY.addCollectionRecord(drawer),
      choice: CREATION_COPY.addCollectionRecord(drawer),
      target: collectionTarget,
      create: collectionRecordText(files, drawer),
      notice: CREATION_COPY.addedCollection(name, drawer)
    });
  }
  actions.push({
    kind: "section",
    label: CREATION_COPY.giveSectionHere,
    choice: CREATION_COPY.choices.identifier,
    target,
    apply: text => appendBlock(text, `## ${name} {#${name}}`),
    notice: CREATION_COPY.gaveSection(name, target)
  });
  return { actions };
}
import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { SUPPORTED_OPENGDD_VERSION } from "./package.mjs";
import { evaluateRule, parseRule, RESERVED_EXTENSIONS, RESERVED_FIRST_SEGMENTS } from "opengdd-validation";
