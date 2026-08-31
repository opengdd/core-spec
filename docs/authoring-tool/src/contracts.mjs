import { sha256Hex } from "./package-hashes.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { plainObject } from "./json-path.mjs";

const CONTRACT_TODO_CODES = Object.freeze([
  "CONTRACT_ANSWER_MISSING", "CONTRACT_VALUE_MISSING"
]);

// These findings can live on a shared pack even though the adoption owns them.
export const CONTRACT_PACK_FILED_CODES = Object.freeze([
  "CONTRACT_RULE_INVALID", "CONTRACT_BINDING_MAP", "CONTRACT_PLACEHOLDER",
  "CONTRACT_REFERENCE", "VERIFICATION_GENERAL_SEEDS"
]);

export function isContractDependentFinding(finding) {
  return finding?.dependent === true;
}

export function isContractTodoFinding(finding) {
  return CONTRACT_TODO_CODES.includes(finding?.code)
    || finding?.code === "CONTRACT_ROW_FIELD"
      && / is missing conditionally required field /u.test(finding.message ?? "")
    || finding?.code === "CONTRACT_REFERENCE"
      && /#\/verification\/[^ ]+ is missing required input /u.test(finding.message ?? "");
}

// Consequences can be filed against either the adoption or its shared pack.
// Keep ownership here so the outline and worksheet present the same adoption.
export function contractFindingOwner(finding, contracts, findings) {
  const direct = contracts.find(contract => contract.file === finding?.file);
  if (direct) return direct;
  if (!CONTRACT_PACK_FILED_CODES.includes(finding?.code)) return undefined;
  const packContracts = contracts.filter(contract => contract.packPath === finding.file);
  const named = packContracts.filter(contract => finding.message?.includes(`\"${contract.display}\"`)
    || finding.message?.includes(`AT ${contract.display}/`));
  const incomplete = packContracts.filter(contract => findings.some(candidate => candidate.file === contract.file
    && isContractTodoFinding(candidate)));
  return named.length === 1 ? named[0] : incomplete.length === 1 ? incomplete[0] : undefined;
}

export function contractOwners(files) {
  return [...files].flatMap(([file, text]) => {
    const match = /^contracts\/([^/]+)\.json$/u.exec(file);
    const value = match && !file.endsWith(".pack.json") ? parsed(text) : undefined;
    return match && plainObject(value) && typeof value.contract === "string" && Number.isInteger(value.version)
      ? [{ file, display: match[1], packPath: `contracts/${value.contract}-${value.version}.pack.json` }]
      : [];
  });
}

export const CONTRACT_DEFINITION_FIELDS = Object.freeze([
  "contract", "version", "origin", "summary", "mechanism", "questions", "declares", "rules", "pack"
]);
const DESIGNER_FIELDS = new Set(["answers", "values", "rows", "verification"]);
export const CONTRACT_FRESH_ANSWERS = "_needs_fresh_answer";
export const CONTRACT_SAME_NUMBER_ACCEPTED = "_same_number_accepted";
const DESIGNER_ANNOTATIONS = new Set([CONTRACT_FRESH_ANSWERS, CONTRACT_SAME_NUMBER_ACCEPTED]);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const encoder = new TextEncoder();

function parsed(text) {
  if (typeof text !== "string") return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function isContractBase(value) {
  return plainObject(value) && typeof value.contract === "string"
    && Number.isInteger(value.version) && plainObject(value.questions);
}

export function classifyContractText(text) {
  const value = parsed(text);
  if (!plainObject(value)) return Object.freeze({ kind: "unknown" });
  if (typeof value.contract === "string" && Number.isInteger(value.version) && Array.isArray(value.templates)) {
    return Object.freeze({ kind: "pack", value, text });
  }
  if (!isContractBase(value)) return Object.freeze({ kind: "unknown" });
  return Object.freeze({ kind: Object.hasOwn(value, "answers") ? "adoption" : "definition", value, text });
}

function definitionEntries(value) {
  const entries = [];
  let designerStarted = false;
  for (const [key, item] of Object.entries(value)) {
    if (DESIGNER_FIELDS.has(key)) designerStarted = true;
    if (CONTRACT_DEFINITION_FIELDS.includes(key)
      || (key.startsWith("_") && !designerStarted && !DESIGNER_ANNOTATIONS.has(key))) entries.push([key, item]);
  }
  return entries;
}

function designerAnnotationEntries(value) {
  const entries = [];
  let designerStarted = false;
  for (const [key, item] of Object.entries(value)) {
    if (DESIGNER_FIELDS.has(key)) designerStarted = true;
    else if (key.startsWith("_") && (designerStarted || DESIGNER_ANNOTATIONS.has(key))) entries.push([key, item]);
  }
  return entries;
}

function definitionOrderIsSpecOrder(entries) {
  let prior = -1;
  for (const [key] of entries) {
    if (key.startsWith("_")) continue;
    const index = CONTRACT_DEFINITION_FIELDS.indexOf(key);
    if (index < prior) return false;
    prior = index;
  }
  return true;
}

function orderedDefinition(entries) {
  const annotations = new Map(entries.filter(([key]) => key.startsWith("_")));
  const standard = new Map(entries.filter(([key]) => !key.startsWith("_")));
  const result = {};
  for (const key of CONTRACT_DEFINITION_FIELDS) if (standard.has(key)) result[key] = standard.get(key);
  // A non-standard order has no stable annotation attachment point. Keeping
  // annotations after the definition fields is deterministic and leaves them
  // on the published side of the designer boundary.
  for (const [key, value] of annotations) result[key] = value;
  return result;
}

function stringEnd(text, start) {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  return -1;
}

function valueEnd(text, start) {
  let objects = 0;
  let arrays = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '"') {
      index = stringEnd(text, index) - 1;
      if (index < 0) return -1;
    } else if (text[index] === "{") objects += 1;
    else if (text[index] === "[") arrays += 1;
    else if (text[index] === "}") {
      if (!objects && !arrays) return index;
      objects -= 1;
    } else if (text[index] === "]") arrays -= 1;
    else if (text[index] === "," && !objects && !arrays) return index;
  }
  return -1;
}

// Preserve every received byte before an adoption's designer part. The small
// scanner finds top-level members only, so words such as "answers" inside a
// question or mechanism string cannot be mistaken for the boundary.
function receivedDefinitionText(text) {
  let index = 0;
  while (/\s/u.test(text[index] ?? "")) index += 1;
  if (text[index] !== "{") return undefined;
  index += 1;
  let separator = -1;
  while (index < text.length) {
    while (/\s/u.test(text[index] ?? "")) index += 1;
    if (text[index] === "}") return text;
    if (text[index] !== '"') return undefined;
    const end = stringEnd(text, index);
    if (end < 0) return undefined;
    const key = JSON.parse(text.slice(index, end));
    if (DESIGNER_FIELDS.has(key)) {
      if (separator < 0) return undefined;
      const newline = text.includes("\r\n") ? "\r\n" : "\n";
      return `${text.slice(0, separator)}${newline}}${newline}`;
    }
    index = end;
    while (/\s/u.test(text[index] ?? "")) index += 1;
    if (text[index] !== ":") return undefined;
    index = valueEnd(text, index + 1);
    if (index < 0) return undefined;
    if (text[index] === "}") return text;
    separator = index;
    index += 1;
  }
  return undefined;
}

export function extractContractDefinition(text) {
  const classification = classifyContractText(text);
  if (!['definition', 'adoption'].includes(classification.kind)) throw new Error(CONTRACT_COPY.refusal);
  const entries = definitionEntries(classification.value);
  const reordered = !definitionOrderIsSpecOrder(entries);
  const value = reordered ? orderedDefinition(entries) : Object.fromEntries(entries);
  const preserved = !reordered ? receivedDefinitionText(text) : undefined;
  return Object.freeze({ value, text: preserved ?? `${JSON.stringify(value, null, 2)}\n`, reordered });
}

function contractTodoCounts(definition) {
  const questions = Object.values(definition?.questions ?? {}).filter(question => plainObject(question) && !plainObject(question.when)).length;
  const values = plainObject(definition?.declares?.values) ? Object.keys(definition.declares.values).length : 0;
  return Object.freeze({ questions, values });
}

export function contractPackFilename(definition) {
  return `${definition.contract}-${definition.version}.pack.json`;
}

function scaffoldValue(definition) {
  const adoption = { ...definition, answers: {}, values: {} };
  const declaredRows = plainObject(definition.declares?.rows) ? Object.keys(definition.declares.rows) : [];
  if (declaredRows.length) adoption.rows = Object.fromEntries(declaredRows.map(name => [name, []]));
  return adoption;
}

function contractScaffoldText(definition) {
  return `${JSON.stringify(scaffoldValue(definition), null, 2)}\n`;
}

function appendDesignerValue(definitionText, designer, fallbackDefinition) {
  const end = definitionText.search(/\s*$/u);
  const close = definitionText.lastIndexOf("}", end);
  if (close < 0) return `${JSON.stringify({ ...fallbackDefinition, ...designer }, null, 2)}\n`;
  const beforeClose = definitionText.slice(0, close);
  const coreEnd = beforeClose.search(/\s*$/u);
  const core = beforeClose.slice(0, coreEnd);
  const serialized = JSON.stringify(designer, null, 2);
  const inner = serialized.slice(1, -1);
  return `${core},${inner}}${definitionText.slice(close + 1) || "\n"}`;
}

function appendDesignerPart(definitionText, definition) {
  return appendDesignerValue(definitionText, Object.fromEntries(Object.entries(scaffoldValue(definition))
    .filter(([key]) => DESIGNER_FIELDS.has(key))), definition);
}

export function findPackageDefinition(files, contract, version) {
  for (const [file, text] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^contracts\/[^/]+\.json$/.test(file) || file.endsWith(".pack.json")) continue;
    const classification = classifyContractText(text);
    if (classification.kind !== "adoption" || classification.value.contract !== contract || classification.value.version !== version) continue;
    return Object.freeze({ file, ...extractContractDefinition(text) });
  }
  return null;
}

function packBytes(text) {
  return typeof text === "string" ? encoder.encode(text) : text instanceof Uint8Array ? text : undefined;
}

function packTextValue(text) {
  if (typeof text === "string") return text;
  if (text instanceof Uint8Array) return new TextDecoder().decode(text);
  return undefined;
}

function sameFileBytes(left, right) {
  const a = packBytes(left);
  const b = packBytes(right);
  return a && b && a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export function prepareContractAddition({ files, definitionText, packText, name }) {
  if (!(files instanceof Map)) throw new TypeError("prepareContractAddition requires a package files Map.");
  const normalizedName = String(name ?? "").trim();
  if (!KEBAB.test(normalizedName)) return Object.freeze({ ok: false, reason: CONTRACT_COPY.renameKebab });
  if (files.has(`contracts/${normalizedName}.json`)) return Object.freeze({ ok: false, reason: CONTRACT_COPY.nameTaken(normalizedName) });

  const received = extractContractDefinition(definitionText);
  const incoming = received.value;
  const reserved = new Set([...files.keys()].flatMap(file => {
    const match = /^contracts\/([^/]+)\.pack\.json$/.exec(file);
    return match ? [match[1]] : [];
  }));
  for (const [file, text] of files) {
    if (!/^contracts\/[^/]+\.json$/.test(file) || file.endsWith(".pack.json")) continue;
    const adoption = classifyContractText(text);
    if (adoption.kind === "adoption") reserved.add(`${adoption.value.contract}-${adoption.value.version}`);
  }
  reserved.add(`${incoming.contract}-${incoming.version}`);
  if (reserved.has(normalizedName)) return Object.freeze({ ok: false, reason: CONTRACT_COPY.nameReserved(normalizedName) });

  const existing = findPackageDefinition(files, incoming.contract, incoming.version);
  const definition = existing?.value ?? incoming;
  let pack;
  if (packText !== undefined && packText !== null) {
    const readable = packTextValue(packText);
    const classification = classifyContractText(readable);
    if (classification.kind !== "pack" || classification.value.contract !== definition.contract
      || classification.value.version !== definition.version) {
      return Object.freeze({ ok: false, reason: CONTRACT_COPY.packMismatch });
    }
    const digest = `sha256:${sha256Hex(packBytes(packText))}`;
    if (definition.pack !== digest) return Object.freeze({ ok: false, reason: CONTRACT_COPY.packMismatch });
    const filename = contractPackFilename(definition);
    const path = `contracts/${filename}`;
    const current = files.get(path);
    if (current !== undefined && !sameFileBytes(current, packText)) return Object.freeze({ ok: false, reason: CONTRACT_COPY.packMismatch });
    pack = Object.freeze({ path, filename, value: packText, create: current === undefined });
  }

  const counts = contractTodoCounts(definition);
  const definitionTextToWrite = existing?.text ?? received.text;
  const preserveReceivedDefinition = !(existing?.reordered ?? received.reordered);
  return Object.freeze({
    ok: true,
    name: normalizedName,
    path: `contracts/${normalizedName}.json`,
    adoptionText: preserveReceivedDefinition ? appendDesignerPart(definitionTextToWrite, definition) : contractScaffoldText(definition),
    definition,
    reordered: existing ? existing.reordered : received.reordered,
    reusedDefinition: Boolean(existing),
    counts,
    pack
  });
}

function supersededIdentities(definition) {
  const value = definition?._supersedes;
  return new Set((Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .filter(item => typeof item === "string"));
}

export function findContractUpdateTargets(files, definitionText) {
  if (!(files instanceof Map)) throw new TypeError("findContractUpdateTargets requires a package files Map.");
  const incoming = extractContractDefinition(definitionText).value;
  const supersedes = supersededIdentities(incoming);
  const targets = [];
  for (const [file, text] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const match = /^contracts\/([^/]+)\.json$/u.exec(file);
    if (!match || file.endsWith(".pack.json")) continue;
    const current = classifyContractText(text);
    if (current.kind !== "adoption") continue;
    const identity = `${current.value.contract}-${current.value.version}`;
    const sameContractNewer = current.value.contract === incoming.contract && incoming.version > current.value.version;
    if (!sameContractNewer && !supersedes.has(identity)) continue;
    targets.push(Object.freeze({ file, adoption: match[1], contract: current.value.contract,
      version: current.value.version, identity }));
  }
  return Object.freeze(targets);
}

function preparedPack(files, definition, packText) {
  if (packText === undefined || packText === null) return undefined;
  const readable = packTextValue(packText);
  const classification = classifyContractText(readable);
  if (classification.kind !== "pack" || classification.value.contract !== definition.contract
    || classification.value.version !== definition.version) return Object.freeze({ error: CONTRACT_COPY.packMismatch });
  const digest = `sha256:${sha256Hex(packBytes(packText))}`;
  if (definition.pack !== digest) return Object.freeze({ error: CONTRACT_COPY.packMismatch });
  const filename = contractPackFilename(definition);
  const path = `contracts/${filename}`;
  const current = files.get(path);
  if (current !== undefined && !sameFileBytes(current, packText)) return Object.freeze({ error: CONTRACT_COPY.packMismatch });
  return Object.freeze({ path, filename, value: packText, create: current === undefined,
    templateIds: new Set(classification.value.templates.map(template => template?.id).filter(id => typeof id === "string")) });
}

function compatibleAnswers(current, incoming) {
  const answers = {};
  const fresh = [];
  const removed = [];
  for (const [question, answer] of Object.entries(plainObject(current.answers) ? current.answers : {})) {
    const next = incoming.questions?.[question];
    if (!plainObject(next)) { removed.push(question); continue; }
    if (plainObject(next.options) && Object.hasOwn(next.options, answer)) answers[question] = answer;
    else fresh.push(question);
  }
  const added = Object.keys(plainObject(incoming.questions) ? incoming.questions : {})
    .filter(question => !question.startsWith("_") && !Object.hasOwn(plainObject(current.questions) ? current.questions : {}, question));
  return { answers, fresh, removed, added };
}

function templateIdsFromPack(text, contract, version) {
  const pack = classifyContractText(typeof text === "string" ? text : packTextValue(text));
  if (pack.kind !== "pack" || pack.value.contract !== contract || pack.value.version !== version) return undefined;
  return new Set(pack.value.templates.map(template => template?.id).filter(id => typeof id === "string"));
}

export function prepareContractUpdate({ files, definitionText, packText, adoptionFile }) {
  if (!(files instanceof Map)) throw new TypeError("prepareContractUpdate requires a package files Map.");
  const currentText = files.get(adoptionFile);
  const current = classifyContractText(currentText);
  if (current.kind !== "adoption") return Object.freeze({ ok: false, reason: CONTRACT_COPY.updateUnknown });
  const received = extractContractDefinition(definitionText);
  const definition = received.value;
  const target = findContractUpdateTargets(files, definitionText).find(item => item.file === adoptionFile);
  if (!target) return Object.freeze({ ok: false, reason: CONTRACT_COPY.updateNotNewer });
  const pack = preparedPack(files, definition, packText);
  if (pack?.error) return Object.freeze({ ok: false, reason: pack.error });
  const carried = compatibleAnswers(current.value, definition);
  const designer = {
    answers: carried.answers,
    values: structuredClone(plainObject(current.value.values) ? current.value.values : {})
  };
  if (plainObject(current.value.rows)) designer.rows = structuredClone(current.value.rows);
  let verificationTemplateIds = pack?.templateIds;
  if (!pack) {
    const oldPack = files.get(`contracts/${contractPackFilename(current.value)}`);
    verificationTemplateIds = oldPack === undefined ? undefined
      : templateIdsFromPack(oldPack, current.value.contract, current.value.version);
  }
  let droppedVerification = 0;
  if (plainObject(current.value.verification)) {
    const entries = Object.entries(current.value.verification);
    const retained = verificationTemplateIds === undefined ? entries : entries.filter(([template]) => {
      const keep = template.startsWith("_") || verificationTemplateIds.has(template);
      if (!keep) droppedVerification += 1;
      return keep;
    });
    const verification = Object.fromEntries(retained.map(([template, value]) => [template, structuredClone(value)]));
    if (Object.keys(verification).length) designer.verification = verification;
  }
  for (const [key, value] of designerAnnotationEntries(current.value)) {
    if (key !== CONTRACT_FRESH_ANSWERS) designer[key] = structuredClone(value);
  }
  if (carried.fresh.length) designer[CONTRACT_FRESH_ANSWERS] = carried.fresh;
  const text = appendDesignerValue(received.text, designer, definition);
  const changelog = definition._changelog;
  return Object.freeze({
    ok: true, path: adoptionFile, adoption: target.adoption, definition, text, pack,
    counts: Object.freeze({ kept: Object.keys(carried.answers).length, dropped: carried.fresh.length,
      added: carried.added.length, droppedVerification }),
    freshAnswers: Object.freeze([...carried.fresh]),
    addedQuestions: Object.freeze([...carried.added]),
    changelog: typeof changelog === "string" ? Object.freeze([changelog])
      : Array.isArray(changelog) ? Object.freeze(changelog.filter(item => typeof item === "string")) : Object.freeze([])
  });
}

const NUMBER_WORD_STOP_WORDS = new Set(["max", "min", "value", "initial", "count", "rate"]);
const numberWords = value => new Set(String(value).toLowerCase().split(/[._-]+/u)
  .filter(word => word && !NUMBER_WORD_STOP_WORDS.has(word)));

export function sameNumberWarnings(files, adoptionFile) {
  const adoption = classifyContractText(files?.get?.(adoptionFile));
  if (adoption.kind !== "adoption") return Object.freeze([]);
  const tuning = parsed(files.get("tuning.json"));
  const values = plainObject(tuning?.values) ? tuning.values : {};
  const accepted = new Set(Array.isArray(adoption.value[CONTRACT_SAME_NUMBER_ACCEPTED])
    ? adoption.value[CONTRACT_SAME_NUMBER_ACCEPTED] : []);
  const adoptionName = /^contracts\/([^/]+)\.json$/u.exec(adoptionFile)?.[1] ?? "";
  const adoptionWords = numberWords(adoptionName);
  const warnings = [];
  for (const [key, tuningValue] of Object.entries(values)) {
    if (accepted.has(key) || typeof tuningValue !== "number" || !Number.isFinite(tuningValue)) continue;
    const keyWords = numberWords(key);
    const matches = [];
    for (const [name, contractValue] of Object.entries(plainObject(adoption.value.values) ? adoption.value.values : {})) {
      if (typeof contractValue !== "number" || !Number.isFinite(contractValue) || contractValue !== tuningValue) continue;
      const valueShared = [...keyWords].some(word => numberWords(name).has(word));
      const adoptionShared = [...keyWords].some(word => adoptionWords.has(word));
      if (valueShared || adoptionShared) matches.push({ name, valueShared });
    }
    // One tuning key gets one decision. Prefer the value its own words name;
    // equal sibling values would otherwise repeat the same warning card.
    matches.sort((left, right) => Number(right.valueShared) - Number(left.valueShared));
    if (matches[0]) warnings.push(Object.freeze({ adoption: adoptionName, file: adoptionFile, key,
      name: matches[0].name, value: tuningValue, contractAddress: `contracts.${adoptionName}.${matches[0].name}` }));
  }
  return Object.freeze(warnings);
}

export function collectContractSources(files) {
  const definitions = [];
  const packs = [];
  for (const [path, value] of files) {
    if (!/\.json$/i.test(path)) continue;
    const text = packTextValue(value);
    const classification = classifyContractText(text);
    if (classification.kind === "pack") packs.push({ path, text: value, value: classification.value });
    else if (classification.kind === "definition" || classification.kind === "adoption") {
      definitions.push({ path, text, value: classification.value, kind: classification.kind });
    }
  }
  return definitions.map(definition => ({
    ...definition,
    pack: packs.find(pack => pack.value.contract === definition.value.contract && pack.value.version === definition.value.version)?.text
  }));
}
