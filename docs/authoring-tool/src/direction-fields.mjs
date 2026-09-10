import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";
import { findFencedJson, readEmbedded } from "./embedded-json.mjs";
import { parseJson, plainObject, pointer } from "./json-path.mjs";
import { pointerAtLine, pointerRange } from "./json-pointer-lines.mjs";
import { positionToOffset } from "./text-coordinates.mjs";
import { tuningKeys } from "./tuning-fields.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const LIST_NAME = /^(?!(?:json|md)$)(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const readFiles = files => files instanceof Map
  ? files
  : new Map((files?.list?.() ?? []).map(file => [file, files.read(file)]));
const directionFrom = files => parseJson(readFiles(files).get("direction.json"));
const paletteMap = files => plainObject(directionFrom(files)?.palette) ? directionFrom(files).palette : {};
const entryParts = entry => {
  if (typeof entry === "string") return { name: "", hex: entry };
  const names = plainObject(entry) ? Object.keys(entry) : [];
  const name = names.length === 1 ? names[0] : "";
  return { name, hex: name ? entry[name] : "" };
};

export function paletteAddresses(files) {
  return Object.keys(paletteMap(files)).map(name => `palette.${name}`);
}

export function namedColorAddresses(files) {
  const palettes = paletteMap(files);
  return Object.entries(palettes).flatMap(([palette, entries]) => (Array.isArray(entries) ? entries : []).flatMap(entry => {
    const names = plainObject(entry) ? Object.keys(entry) : [];
    return names.length === 1 ? [`palette.${palette}.${names[0]}`] : [];
  }));
}

export function paletteUses(files, palette) {
  const direction = directionFrom(files);
  const entries = direction?.palette?.[palette];
  const colors = new Set((Array.isArray(entries) ? entries : []).flatMap(entry => {
    const names = plainObject(entry) ? Object.keys(entry) : [];
    return names.length === 1 ? [`palette.${palette}.${names[0]}`] : [];
  }));
  const found = [];
  for (const [name, mood] of Object.entries(plainObject(direction?.mood) ? direction.mood : {})) {
    if (mood?.palette === `palette.${palette}`) found.push({ kind: "mood", name, address: `mood.${name}`, pointer: pointer(["mood", name]) });
  }
  for (const [name, promise] of Object.entries(plainObject(direction?.colors) ? direction.colors : {})) {
    if (colors.has(promise?.is)) found.push({ kind: "colors", name, address: `colors.${name}`, pointer: pointer(["colors", name]) });
  }
  for (const [name, promise] of Object.entries(plainObject(direction?.contrast) ? direction.contrast : {})) {
    if ((Array.isArray(promise?.colors) && promise.colors.some(value => colors.has(value))) || colors.has(promise?.against)) {
      found.push({ kind: "contrast", name, address: `contrast.${name}`, pointer: pointer(["contrast", name]) });
    }
  }
  return found;
}

const candidateOptions = (values, group) => values.map(value => ({ value, label: value, group }));

function namedColorHex(files, address) {
  for (const [palette, entries] of Object.entries(paletteMap(files))) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const parts = entryParts(entry);
      if (parts.name && address === `palette.${palette}.${parts.name}`) return parts.hex;
    }
  }
  return undefined;
}

export function directionPromiseCoverage(files, address) {
  const text = readFiles(files).get("05-build-plan.md");
  if (typeof text !== "string") return [];
  const revision = typeof files?.revision === "function" ? files.revision("05-build-plan.md") : undefined;
  const headings = [...text.matchAll(/^#{1,6}\s+(AT-(\d+))\b(.*)$/gmu)];
  const covered = [];
  for (const [index, heading] of headings.entries()) {
    const line = text.slice(0, heading.index).split("\n").length;
    const block = findFencedJson(text, { tag: "test", afterLine: line, revision });
    if (!block) continue;
    const next = headings[index + 1];
    const nextLine = next ? text.slice(0, next.index).split("\n").length - 1 : Infinity;
    if (block.range.start.line >= nextLine) continue;
    let claims;
    try { claims = readEmbedded(block, "/direction_claims").value; } catch { continue; }
    if (!Array.isArray(claims) || !claims.includes(address)) continue;
    covered.push(Object.freeze({
      id: heading[1], title: String(heading[3] ?? "").replace(/^\s*(?::|—|-)?\s*/u, "").trim(), file: "05-build-plan.md",
      range: { start: { line: line - 1, character: 0 }, end: block.range.end, revision }
    }));
  }
  return covered;
}

export function createMeasuredPromise(context, request = {}) {
  return context.internal.create("Measured promise", request.anchor, { type: request.type, name: request.name });
}

function mountPromiseSwatch(context) {
  return ({ document, box, control }) => {
    control.dataset.promiseColorTarget = "";
    const holder = element(document, "span", undefined, "opengdd-author-promise-color-control");
    const swatch = element(document, "span", undefined, "opengdd-author-palette-swatch");
    swatch.dataset.promiseSwatch = "";
    swatch.setAttribute("aria-hidden", "true");
    box.insertBefore(holder, control);
    holder.append(swatch, control);
    return { refresh(value) {
      const hex = namedColorHex(context.package, value);
      swatch.style.background = HEX.test(hex) ? hex : "";
    } };
  };
}

function boundedNumber(dataset, minimum, inclusive) {
  return ({ control }) => {
    control.dataset[dataset] = "";
    control.min = String(minimum);
    control.step = "any";
    if (!inclusive) control.setAttribute("data-exclusive-min", String(minimum));
  };
}

function promiseCommonFields(entity) {
  return [{
    key: "where", label: INSPECTOR_COPY.promiseWhere, help: INSPECTOR_COPY.promiseWhereHelp,
    type: "text", required: true, commitOnBlur: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
    binding: { file: "direction.json", pointer: `${entity.pointer}/where` }
  }, {
    key: "while", label: INSPECTOR_COPY.promiseWhile, help: INSPECTOR_COPY.promiseWhileHelp,
    type: "list", commitOnBlur: true, clearRemoves: true,
    labels: { change: INSPECTOR_COPY.changeDirectionPromise, clear: INSPECTOR_COPY.changeDirectionPromise },
    binding: { file: "direction.json", pointer: `${entity.pointer}/while` }
  }];
}

function mountContrastColorActions(context, entity, index) {
  return ({ document, box, control }) => {
    control.dataset.promiseContrastColor = String(index);
    const swatch = element(document, "span", undefined, "opengdd-author-palette-swatch");
    swatch.dataset.promiseContrastSwatch = String(index);
    swatch.setAttribute("aria-hidden", "true");
    const remove = element(document, "button", INSPECTOR_COPY.promiseRemoveColor);
    remove.type = "button";
    remove.dataset.promiseRemoveColor = String(index);
    remove.setAttribute("aria-label", INSPECTOR_COPY.promiseRemoveColorLabel(index));
    remove.addEventListener("click", () => Promise.resolve(removeDirectionPromiseColor(context, entity, index))
      .catch(error => { remove.title = error.message; }));
    const holder = element(document, "span", undefined, "opengdd-author-promise-color-control");
    box.insertBefore(holder, control);
    holder.append(swatch, control);
    box.append(remove);
    return { refresh(value) {
      const hex = namedColorHex(context.package, value);
      swatch.style.background = HEX.test(hex) ? hex : "";
    } };
  };
}

export async function removeDirectionPromiseColor(context, entity, index) {
  await commitJson(context, INSPECTOR_COPY.promiseRemoveColorUndo,
    json => json.remove(pointer(["contrast", entity.id, "colors", index])));
  const remaining = (entity.value.colors?.length ?? 0) - 1;
  if (remaining > 0) context.internal.focusField?.("direction.json", `colors-${Math.min(index, remaining - 1)}`);
}

export async function addDirectionPromiseColor(context, entity) {
  const candidates = namedColorAddresses(context.package);
  if (!candidates.length) return false;
  const current = Array.isArray(directionFrom(context.package)?.contrast?.[entity.id]?.colors)
    ? directionFrom(context.package).contrast[entity.id].colors : [];
  const value = candidates.find(candidate => !current.includes(candidate)) ?? candidates[0];
  await commitJson(context, INSPECTOR_COPY.promiseAddColorUndo,
    json => json.insert(pointer(["contrast", entity.id, "colors"]), "-", value));
  context.internal.focusField?.("direction.json", `colors-${current.length}`);
  return true;
}

export function directionPromiseFields(context, entity) {
  const colors = candidateOptions(namedColorAddresses(context.package), INSPECTOR_COPY.promiseColorCandidates);
  const common = promiseCommonFields(entity);
  if (entity.kind === "colors") return [{
    key: "is", label: INSPECTOR_COPY.promiseColorTarget, help: INSPECTOR_COPY.promiseColorTargetHelp,
    type: "reference", required: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
    binding: { file: "direction.json", pointer: `${entity.pointer}/is` },
    options: { candidates: colors, allowFree: false }, mount: mountPromiseSwatch(context)
  }, {
    key: "within", label: INSPECTOR_COPY.promiseWithin, help: INSPECTOR_COPY.promiseWithinHelp,
    type: "number", required: true, commitOnBlur: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
    binding: { file: "direction.json", pointer: `${entity.pointer}/within` },
    validate: value => typeof value === "number" && value >= 0 ? "" : INSPECTOR_COPY.promiseWithinInvalid,
    mount: boundedNumber("promiseWithin", 0, true)
  }, ...common];
  if (entity.kind === "contrast") {
    const operands = (Array.isArray(entity.value.colors) ? entity.value.colors : []).map((_value, index) => ({
      key: `colors-${index}`, row: `colors-${index}`, rowLabel: INSPECTOR_COPY.promiseContrastColor(index),
      label: INSPECTOR_COPY.promiseContrastColour, ariaLabel: INSPECTOR_COPY.promiseContrastColorLabel(index),
      help: INSPECTOR_COPY.promiseContrastColorHelp, helpShared: "contrast-colour", type: "reference", required: true,
      labels: { change: INSPECTOR_COPY.changeDirectionPromise },
      binding: { file: "direction.json", pointer: `${entity.pointer}/colors/${index}` },
      options: { candidates: colors, allowFree: false }, mount: mountContrastColorActions(context, entity, index)
    }));
    return [...operands, {
      key: "against", label: INSPECTOR_COPY.promiseAgainst, help: INSPECTOR_COPY.promiseAgainstHelp,
      type: "reference", required: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
      binding: { file: "direction.json", pointer: `${entity.pointer}/against` },
      options: { candidates: colors, allowFree: false }
    }, {
      key: "at_least", label: INSPECTOR_COPY.promiseAtLeast, help: INSPECTOR_COPY.promiseAtLeastHelp,
      type: "number", required: true, commitOnBlur: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
      binding: { file: "direction.json", pointer: `${entity.pointer}/at_least` },
      validate: value => typeof value === "number" && value > 0 ? "" : INSPECTOR_COPY.promiseAtLeastInvalid,
      mount: boundedNumber("promiseAtLeast", 0, false)
    }, ...common];
  }
  return [{
    key: "key", label: INSPECTOR_COPY.promiseTimingKey, help: INSPECTOR_COPY.promiseTimingKeyHelp,
    type: "reference", required: true, labels: { change: INSPECTOR_COPY.changeDirectionPromise },
    binding: { file: "direction.json", pointer: `${entity.pointer}/key` },
    options: { candidates: candidateOptions(tuningKeys(context.package), INSPECTOR_COPY.promiseTimingCandidates), allowFree: false },
    status(value) {
      const tuning = parseJson(context.package.read("tuning.json"));
      const values = plainObject(tuning?.values) ? tuning.values : {};
      const ranges = plainObject(tuning?.ranges) ? tuning.ranges : {};
      if (!Object.hasOwn(values, value)) return "";
      const rendered = JSON.stringify(values[value]);
      return Array.isArray(ranges[value]) && ranges[value].length === 2
        ? INSPECTOR_COPY.promiseTimingValueRange(rendered, ranges[value][0], ranges[value][1])
        : INSPECTOR_COPY.promiseTimingValue(rendered);
    },
    mount({ control }) { control.dataset.promiseTimingKey = ""; }
  }, ...common];
}

function coverageSection(context, entity) {
  const tests = directionPromiseCoverage(context.package, entity.address);
  const rows = tests.length ? [entityChips(context, tests.map(test => ({
    name: INSPECTOR_COPY.promiseCoverageLabel(test.id, test.title), kind: INSPECTOR_COPY.acceptanceTestKind,
    dataset: { promiseCoverageTest: test.id },
    selection: { kind: "acceptance-test", name: test.id, file: test.file, range: test.range }
  })))] : [];
  const section = referenceGroup(context, { key: "coverage", label: INSPECTOR_COPY.promiseCoverage,
    help: tests.length ? INSPECTOR_COPY.promiseCoverageHelp : INSPECTOR_COPY.promiseUncovered(entity.address), rows });
  section.classList.add("opengdd-author-promise-coverage");
  section.dataset.promiseCoverage = "";
  section.tabIndex = -1;
  return section;
}

export function directionPromiseSections(context, entity) {
  const sections = [];
  if (entity.kind === "contrast") {
    const addSection = element(context.document, "section", undefined, "opengdd-author-promise-add");
    const add = element(context.document, "button", INSPECTOR_COPY.promiseAddColor);
    add.type = "button";
    add.dataset.promiseAddColor = "";
    const help = element(context.document, "p", INSPECTOR_COPY.promiseAddColorHelp, "opengdd-author-form-help");
    help.id = `opengdd-promise-${entity.id}-add-help`;
    add.setAttribute("aria-describedby", help.id);
    add.disabled = namedColorAddresses(context.package).length === 0;
    add.addEventListener("click", () => Promise.resolve(addDirectionPromiseColor(context, entity))
      .catch(error => { add.title = error.message; }));
    addSection.append(add, help);
    sections.push(addSection);
  }
  sections.push(coverageSection(context, entity));
  return sections;
}

export function routeDirectionPromiseFinding(finding, entity) {
  const message = String(finding?.message ?? "");
  if (finding.code === "DIRECTION_CLAIM_UNCOVERED") {
    return message.startsWith(`${entity.address} `) ? "coverage" : false;
  }
  if (finding.code === "DIRECTION_CONTRAST_FAILED") {
    if (entity.kind !== "contrast" || !message.startsWith(`${entity.address}:`)) return false;
    const operand = new RegExp(`^${escapeRegExp(entity.address)}:\\s+\`([^\`]+)\``).exec(message)?.[1];
    const index = (Array.isArray(entity.value.colors) ? entity.value.colors : [])
      .findIndex(address => address === operand);
    return index >= 0 ? `colors-${index}` : "at_least";
  }
  if (finding.code === "DIRECTION_TIMING_KEY") {
    return entity.kind === "timing" && message.startsWith(`${entity.address}.key `) ? "key" : false;
  }
  if (["DIRECTION_COLOR_REFERENCE", "DIRECTION_COLOR_DANGLING"].includes(finding.code)) {
    if (entity.kind === "colors") return message.startsWith(`${entity.address}.is `) ? "is" : false;
    if (entity.kind !== "contrast") return false;
    const operand = new RegExp(`^contrast\\.${escapeRegExp(entity.id)}\\.colors\\[(\\d+)\\] `).exec(message);
    if (operand) return `colors-${Number(operand[1])}`;
    return message.startsWith(`${entity.address}.against `) ? "against" : false;
  }
  if (finding.code !== "DIRECTION_SCHEMA") {
    if (finding.file !== entity.file) return false;
    const namesAddress = message.includes(entity.address) || message.startsWith(`#${entity.pointer}`);
    return namesAddress ? "header" : false;
  }
  const parts = partsOf(parsedFindingPointer(finding, entity.text));
  if (parts[0] !== entity.kind || parts[1] !== entity.id) return false;
  if (entity.kind === "contrast" && parts[2] === "colors") {
    if (/^\d+$/u.test(parts[3] ?? "")) return `colors-${parts[3]}`;
    return Array.isArray(entity.value.colors) && entity.value.colors.length ? "colors-0" : "header";
  }
  const rendered = new Set([
    ...(entity.kind === "colors" ? ["is", "within"] : []),
    ...(entity.kind === "contrast" ? ["against", "at_least"] : []),
    ...(entity.kind === "timing" ? ["key"] : []),
    "where", "while"
  ]);
  const missing = /\sis missing required property "([^"]+)"\s*$/u.exec(message)?.[1];
  const target = parts[2] ?? missing;
  if (rendered.has(target)) return target;
  return "header";
}

async function commitJson(context, label, apply) {
  const transaction = context.internal.begin(label);
  apply(transaction.json("direction.json"));
  await transaction.commit();
}

const directionRows = (context, kind) => Object.entries(plainObject(directionFrom(context.package)?.[kind])
  ? directionFrom(context.package)[kind] : {});
const availableRowName = (rows, base) => {
  const names = new Set(rows.map(([name]) => name));
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};
const parsedFindingPointer = (finding, text) => {
  const named = /^#(\/[A-Za-z0-9_./~-]*)/u.exec(String(finding?.message ?? ""))?.[1];
  if (named) return named;
  if (!Number.isInteger(finding?.line) || typeof text !== "string") return undefined;
  try { return pointerAtLine(text, finding.line); } catch { return undefined; }
};
const partsOf = value => typeof value === "string" && value.startsWith("/")
  ? value.slice(1).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~")) : [];

export async function moveDirectionEntry(context, kind, index, next) {
  const rows = directionRows(context, kind);
  if (index < 0 || index >= rows.length || next < 0 || next >= rows.length || index === next) return;
  const [name, value] = rows[index];
  const remaining = rows.filter((_, at) => at !== index);
  const before = remaining[next]?.[0];
  await commitJson(context, kind === "pillars" ? INSPECTOR_COPY.movePillarUndo
    : kind === "anti" ? INSPECTOR_COPY.moveAntiUndo : INSPECTOR_COPY.moveMustKeepUndo, json => {
    json.remove(pointer([kind, name]));
    json.insert(pointer([kind]), name, value, before === undefined ? undefined : { before });
  });
  context.internal.focusField?.("direction.json", `${kind}-${next}-sentence`);
}

export async function convertAntiEntry(context, at, toObject) {
  const current = at.kind === "anti"
    ? directionFrom(context.package)?.anti?.[at.id]
    : directionFrom(context.package)?.mood?.[at.mood]?.anti?.[at.index];
  const target = at.kind === "anti" ? pointer(["anti", at.id]) : pointer(["mood", at.mood, "anti", at.index]);
  const value = toObject ? { not: typeof current === "string" ? current : "" }
    : plainObject(current) ? String(current.not ?? "") : String(current ?? "");
  await commitJson(context, toObject ? INSPECTOR_COPY.convertAntiToObjectUndo : INSPECTOR_COPY.convertAntiToSentenceUndo,
    json => json.set(target, value));
}

function rowActions(context, { kind, index, count, label, removePointer, focusKey, convert }) {
  return ({ document, box }) => {
    const actions = element(document, "div", undefined, "opengdd-author-direction-row-actions");
    const add = (text, aria, dataset, run, disabled = false) => {
      const button = element(document, "button", text);
      button.type = "button";
      button.setAttribute("aria-label", aria);
      button.dataset[dataset] = String(index);
      button.disabled = disabled;
      button.addEventListener("click", () => Promise.resolve(run()).catch(error => { button.title = error.message; }));
      actions.append(button);
    };
    if (kind) {
      add(INSPECTOR_COPY.listMoveUp, INSPECTOR_COPY.listMoveUpLabel(label), `${kind}MoveUp`,
        () => moveDirectionEntry(context, kind, index, index - 1), index === 0);
      add(INSPECTOR_COPY.listMoveDown, INSPECTOR_COPY.listMoveDownLabel(label), `${kind}MoveDown`,
        () => moveDirectionEntry(context, kind, index, index + 1), index === count - 1);
    }
    if (convert) add(convert.label, INSPECTOR_COPY.listConvertLabel(convert.label, label), convert.dataset, convert.run);
    add(INSPECTOR_COPY.listRemove, INSPECTOR_COPY.listRemoveLabel(label), `${kind ?? "moodAnti"}Remove`, async () => {
      await commitJson(context, kind === "pillars" ? INSPECTOR_COPY.removePillarUndo
        : kind === "must_keep" ? INSPECTOR_COPY.removeMustKeepUndo : INSPECTOR_COPY.removeAntiUndo,
      json => json.remove(removePointer));
      if (count > 1 && focusKey) context.internal.focusField?.("direction.json", focusKey(Math.min(index, count - 2)));
    });
    box.append(actions);
  };
}

function renameField(context, kind, index, name, label, help) {
  const mounted = {};
  return {
    key: `${kind}-${index}-name`, row: `${kind}-${index}`, label, rowLabel: name,
    ariaLabel: `${label} ${name}`, help, helpShared: `${kind}-name`, type: "text",
    commitOnBlur: true, commitOnRowExit: true,
    binding: { file: "direction.json", pointer: pointer([kind, name]) }, read: () => name,
    parse(value) {
      const next = String(value).trim();
      if (!LIST_NAME.test(next)) throw new Error(INSPECTOR_COPY.directionListNameInvalid);
      return next;
    },
    validate: value => LIST_NAME.test(value) ? "" : INSPECTOR_COPY.directionListNameInvalid,
    write(value) {
      if (value === name || !mounted.control) return;
      return context.internal.renameEntity?.({
        anchor: mounted.control, address: `${kind}.${name}`, initial: value,
        onCancel: () => context.internal.focusField?.("direction.json", `${kind}-${index}-name`)
      });
    },
    mount({ control, box, document }) {
      mounted.control = control;
      if (kind === "pillars") {
        const citations = context.services.references.usages(`pillars.${name}`).length;
        box.append(element(document, "span", INSPECTOR_COPY.renamePillarCitations(citations), "opengdd-author-direction-citations"));
      }
    }
  };
}

function sentenceMapFields(context, kind, copy) {
  const rows = directionRows(context, kind);
  return rows.flatMap(([name], index) => [
    renameField(context, kind, index, name, copy.nameLabel, copy.nameHelp),
    {
      key: `${kind}-${index}-sentence`, row: `${kind}-${index}`, label: copy.sentenceLabel,
      rowLabel: name, ariaLabel: `${copy.sentenceLabel} ${name}`, help: copy.sentenceHelp,
      helpShared: `${kind}-sentence`, type: "longtext", required: true, commitOnBlur: true,
      labels: { change: INSPECTOR_COPY.changeDirectionSentence },
      binding: { file: "direction.json", pointer: pointer([kind, name]) },
      mount: rowActions(context, { kind, index, count: rows.length, label: name,
        removePointer: rows.length === 1 ? pointer([kind]) : pointer([kind, name]), focusKey: at => `${kind}-${at}-sentence` })
    }
  ]);
}

function antiMapFields(context) {
  const rows = directionRows(context, "anti");
  return rows.flatMap(([name, entry], index) => {
    const base = pointer(["anti", name]);
    const object = plainObject(entry);
    const fields = [renameField(context, "anti", index, name, INSPECTOR_COPY.directionAntiName, INSPECTOR_COPY.directionAntiNameHelp)];
    const actionMount = rowActions(context, {
      kind: "anti", index, count: rows.length, label: name, removePointer: rows.length === 1 ? "/anti" : base,
      focusKey: at => `anti-${at}-sentence`, convert: {
        label: object ? INSPECTOR_COPY.antiUseSentence : INSPECTOR_COPY.antiUseImage,
        dataset: "antiConvert", run: () => convertAntiEntry(context, { kind: "anti", id: name }, !object)
      }
    });
    fields.push({
      key: `anti-${index}-sentence`, row: `anti-${index}`, label: INSPECTOR_COPY.directionAntiSentence,
      rowLabel: name, ariaLabel: `${INSPECTOR_COPY.directionAntiSentence} ${name}`,
      help: INSPECTOR_COPY.directionAntiSentenceHelp, helpShared: "anti-sentence", type: "longtext",
      required: true, commitOnBlur: true, labels: { change: INSPECTOR_COPY.changeAntiField },
      binding: { file: "direction.json", pointer: object ? `${base}/not` : base }, mount: actionMount
    });
    if (object) fields.push({
      key: `anti-${index}-image`, row: `anti-${index}`, label: INSPECTOR_COPY.directionAntiImage,
      ariaLabel: `${INSPECTOR_COPY.directionAntiImage} ${name}`, help: INSPECTOR_COPY.directionAntiImageHelp,
      helpShared: "anti-image", type: "text", commitOnBlur: true, clearRemoves: true,
      labels: { change: INSPECTOR_COPY.changeAntiField, clear: INSPECTOR_COPY.changeAntiField },
      binding: { file: "direction.json", pointer: `${base}/image` }
    }, {
      key: `anti-${index}-license`, row: `anti-${index}`, label: INSPECTOR_COPY.directionAntiLicense,
      ariaLabel: `${INSPECTOR_COPY.directionAntiLicense} ${name}`, help: INSPECTOR_COPY.directionAntiLicenseHelp,
      helpShared: "anti-license", type: "text", commitOnBlur: true, clearRemoves: true,
      labels: { change: INSPECTOR_COPY.changeAntiField, clear: INSPECTOR_COPY.changeAntiField },
      binding: { file: "direction.json", pointer: `${base}/license` }
    });
    return fields;
  });
}

function addListSection(context, kind, label, help, run) {
  const button = element(context.document, "button", label);
  button.type = "button";
  button.dataset[`${kind}Add`] = "";
  button.addEventListener("click", () => Promise.resolve(run()).catch(error => { button.title = error.message; }));
  const section = referenceGroup(context, { label: kind === "pillars" ? INSPECTOR_COPY.directionPillars
    : kind === "anti" || kind === "moodAnti" ? INSPECTOR_COPY.directionAnti : INSPECTOR_COPY.directionMustKeep,
  help, rows: [], empty: false, action: button });
  section.classList.add("opengdd-author-direction-add");
  section.dataset.directionList = kind;
  return section;
}

export function directionMechanismFields(context) {
  return directionMechanismFieldSets(context).flatMap(group => group.fields);
}

function directionListGroup(context, kind, title, help, fields, action) {
  let control;
  if (action) {
    control = element(context.document, "button", action.label);
    control.type = "button";
    control.dataset[`${kind}Add`] = "";
    control.addEventListener("click", () => Promise.resolve(action.run()).catch(error => { control.title = error.message; }));
  }
  const section = referenceGroup(context, { key: kind, label: title, help, rows: [], empty: fields.length === 0,
    count: fields.length, action: control });
  section.classList.add("opengdd-author-direction-add");
  section.dataset.directionList = kind;
  return { key: kind, element: section, fields };
}

function addDirectionRow(context, kind, base, undo) {
  return async () => {
    const rows = directionRows(context, kind);
    const name = availableRowName(rows, base);
    await commitJson(context, undo, json => {
      if (directionFrom(context.package)?.[kind] === undefined) json.insert("", kind, { [name]: "" });
      else json.insert(pointer([kind]), name, "");
    });
    context.internal.focusField?.("direction.json", `${kind}-${rows.length}-sentence`);
  };
}

function directionMechanismFieldSets(context) {
  const viewingFields = [{
    key: "viewing-speed_and_size", label: INSPECTOR_COPY.directionSpeedAndSize,
    help: INSPECTOR_COPY.directionSpeedAndSizeHelp, type: "longtext", required: true, commitOnBlur: true,
    labels: { change: INSPECTOR_COPY.changeViewingField },
    binding: { file: "direction.json", pointer: "/viewing/speed_and_size" }
  }, {
    key: "viewing-calibration", label: INSPECTOR_COPY.directionCalibration,
    help: INSPECTOR_COPY.directionCalibrationHelp, type: "longtext", required: true, commitOnBlur: true,
    labels: { change: INSPECTOR_COPY.changeViewingField },
    binding: { file: "direction.json", pointer: "/viewing/calibration" }
  }, {
    key: "viewing-sequence", label: INSPECTOR_COPY.directionSequence,
    help: INSPECTOR_COPY.directionSequenceHelp, type: "longtext", commitOnBlur: true, clearRemoves: true,
    labels: { change: INSPECTOR_COPY.changeViewingField, clear: INSPECTOR_COPY.changeViewingField },
    binding: { file: "direction.json", pointer: "/viewing/sequence" }
  }];
  return [
    { kind: "pillars", title: INSPECTOR_COPY.directionPillars, help: INSPECTOR_COPY.directionPillarsHelp,
      fields: sentenceMapFields(context, "pillars", {
      nameLabel: INSPECTOR_COPY.directionPillarName, nameHelp: INSPECTOR_COPY.directionPillarNameHelp,
      sentenceLabel: INSPECTOR_COPY.directionPillarSentence, sentenceHelp: INSPECTOR_COPY.directionPillarSentenceHelp
      }), action: { label: INSPECTOR_COPY.addPillar,
        run: addDirectionRow(context, "pillars", "new-pillar", INSPECTOR_COPY.addPillarUndo) } },
    { kind: "anti", title: INSPECTOR_COPY.directionAnti, help: INSPECTOR_COPY.directionAntiHelp,
      fields: antiMapFields(context), action: { label: INSPECTOR_COPY.addAnti,
        run: addDirectionRow(context, "anti", "new-anti-reference", INSPECTOR_COPY.addAntiUndo) } },
    { kind: "must_keep", title: INSPECTOR_COPY.directionMustKeep, help: INSPECTOR_COPY.directionMustKeepHelp,
      fields: sentenceMapFields(context, "must_keep", {
      nameLabel: INSPECTOR_COPY.directionMustKeepName, nameHelp: INSPECTOR_COPY.directionMustKeepNameHelp,
      sentenceLabel: INSPECTOR_COPY.directionMustKeepSentence, sentenceHelp: INSPECTOR_COPY.directionMustKeepSentenceHelp
      }), action: { label: INSPECTOR_COPY.addMustKeep,
        run: addDirectionRow(context, "must_keep", "new-quality", INSPECTOR_COPY.addMustKeepUndo) } },
    { kind: "viewing", title: INSPECTOR_COPY.directionViewing,
      help: INSPECTOR_COPY.directionViewingHelp, fields: viewingFields }
  ];
}

export function directionMechanismFieldGroups(context) {
  return directionMechanismFieldSets(context).map(group => directionListGroup(
    context, group.kind, group.title, group.help, group.fields, group.action));
}

function selectDeclaration(context, declaration) {
  return context.services.selection.select({
    kind: declaration.entry.kind, name: declaration.entry.name,
    file: declaration.entry.file, range: declaration.entry.range
  });
}

export function directionMechanismSections(context) {
  const declarations = (context.internal.mechanism?.("direction")?.entities ?? [])
    .filter(entry => ["mood", "palette", "colors", "contrast", "timing"].includes(entry.kind))
    .map(entry => ({ entry }));
  const rows = declarations.length ? [entityChips(context, declarations.map(declaration => ({
    name: declaration.entry.display || declaration.entry.name, kind: declaration.entry.kind,
    detail: declaration.detail, dataset: { directionDeclaration: declaration.entry.name },
    selection: declaration
  })), { open: declaration => selectDeclaration(context, declaration.selection) })] : [];
  const owned = referenceGroup(context, { label: INSPECTOR_COPY.directionOwned,
    help: declarations.length ? INSPECTOR_COPY.directionOwnedHelp : INSPECTOR_COPY.directionNoOwned, rows });
  owned.classList.add("opengdd-author-direction-owned");
  owned.dataset.directionList = "owned";
  return [owned];
}

export function routeDirectionFinding(finding, entity) {
  const parts = partsOf(parsedFindingPointer(finding, entity.text));
  if (finding.code === "DIRECTION_UNMENTIONED") {
    const match = /^(pillars|anti|must_keep)\.([a-z0-9]+(?:-[a-z0-9]+)*)/u.exec(String(finding.message ?? ""));
    if (!match) return "header";
    const index = Object.keys(entity.document?.[match[1]] ?? {}).indexOf(match[2]);
    return index >= 0 ? `${match[1]}-${index}-sentence` : "header";
  }
  if (finding.code === "MEDIA_PATH_MISSING" && parts[0] === "anti") {
    const index = Object.keys(entity.document?.anti ?? {}).indexOf(parts[1]);
    return index >= 0 ? `anti-${index}-image` : "header";
  }
  if (finding.code !== "DIRECTION_SCHEMA") return null;
  if (parts[0] === "pillars" || parts[0] === "must_keep") {
    const index = Object.keys(entity.document?.[parts[0]] ?? {}).indexOf(parts[1]);
    return index >= 0 ? `${parts[0]}-${index}-sentence` : "header";
  }
  if (parts[0] === "anti") {
    const index = Object.keys(entity.document?.anti ?? {}).indexOf(parts[1]);
    if (index < 0) return "header";
    return parts[2] === "image" || parts[2] === "license" ? `anti-${index}-image` : `anti-${index}-sentence`;
  }
  if (parts[0] === "viewing" && ["speed_and_size", "calibration", "sequence"].includes(parts[1])) return `viewing-${parts[1]}`;
  return "header";
}

function moodAntiFields(context, entity) {
  const entries = Array.isArray(entity.value.anti) ? entity.value.anti : [];
  return entries.flatMap((entry, index) => {
    const base = `${entity.pointer}/anti/${index}`;
    const object = plainObject(entry);
    const mount = rowActions(context, {
      index, count: entries.length, label: INSPECTOR_COPY.moodAntiRow(index).toLowerCase(), removePointer: base,
      focusKey: at => `mood-anti-${at}-sentence`, convert: {
        label: object ? INSPECTOR_COPY.antiUseSentence : INSPECTOR_COPY.antiUseImage,
        dataset: "moodAntiConvert", run: () => convertAntiEntry(context, { kind: "mood", mood: entity.id, index }, !object)
      }
    });
    const fields = [{
      key: `mood-anti-${index}-sentence`, row: `mood-anti-${index}`, label: INSPECTOR_COPY.directionAntiSentence,
      rowLabel: INSPECTOR_COPY.moodAntiRow(index), ariaLabel: `${INSPECTOR_COPY.directionAntiSentence} ${INSPECTOR_COPY.moodAntiRow(index)}`,
      help: INSPECTOR_COPY.directionAntiSentenceHelp,
      helpShared: "mood-anti-sentence", type: "longtext", required: true, commitOnBlur: true,
      labels: { change: INSPECTOR_COPY.changeAntiField }, binding: { file: "direction.json", pointer: object ? `${base}/not` : base }, mount
    }];
    if (object) fields.push({
      key: `mood-anti-${index}-image`, row: `mood-anti-${index}`, label: INSPECTOR_COPY.directionAntiImage,
      ariaLabel: `${INSPECTOR_COPY.directionAntiImage} ${INSPECTOR_COPY.moodAntiRow(index)}`,
      help: INSPECTOR_COPY.directionAntiImageHelp, helpShared: "mood-anti-image", type: "text", commitOnBlur: true,
      clearRemoves: true, labels: { change: INSPECTOR_COPY.changeAntiField, clear: INSPECTOR_COPY.changeAntiField },
      binding: { file: "direction.json", pointer: `${base}/image` }
    }, {
      key: `mood-anti-${index}-license`, row: `mood-anti-${index}`, label: INSPECTOR_COPY.directionAntiLicense,
      ariaLabel: `${INSPECTOR_COPY.directionAntiLicense} ${INSPECTOR_COPY.moodAntiRow(index)}`,
      help: INSPECTOR_COPY.directionAntiLicenseHelp, helpShared: "mood-anti-license", type: "text", commitOnBlur: true,
      clearRemoves: true, labels: { change: INSPECTOR_COPY.changeAntiField, clear: INSPECTOR_COPY.changeAntiField },
      binding: { file: "direction.json", pointer: `${base}/license` }
    });
    return fields;
  });
}

function mountMoodPalette(context) {
  return ({ document, box }) => {
    const swatches = element(document, "span", undefined, "opengdd-author-mood-swatches");
    swatches.setAttribute("aria-hidden", "true");
    box.append(swatches);
    return { refresh(value) {
      swatches.replaceChildren();
      const key = typeof value === "string" ? value.slice("palette.".length) : "";
      const entries = directionFrom(context.package)?.palette?.[key];
      for (const entry of Array.isArray(entries) ? entries : []) {
        const hex = entryParts(entry).hex;
        if (!HEX.test(hex)) continue;
        const item = element(document, "span", undefined, "opengdd-author-palette-swatch");
        item.style.background = hex; swatches.append(item);
      }
    } };
  };
}

export function moodFields(context, entity) {
  const candidates = paletteAddresses(context.package).map(value => ({ value, label: value, group: INSPECTOR_COPY.moodPaletteGroup }));
  return [{
    key: "intent", label: INSPECTOR_COPY.moodIntent, help: INSPECTOR_COPY.moodIntentHelp,
    type: "longtext", required: true, commitOnBlur: true, labels: { change: INSPECTOR_COPY.changeMoodField },
    binding: { file: "direction.json", pointer: `${entity.pointer}/intent` }
  }, ...moodAntiFields(context, entity), {
    key: "borrows", label: INSPECTOR_COPY.moodBorrows, help: INSPECTOR_COPY.moodBorrowsHelp,
    type: "lines", labels: { change: INSPECTOR_COPY.changeMoodField,
      addLine: INSPECTOR_COPY.addBorrowUndo, removeLine: INSPECTOR_COPY.removeBorrowUndo },
    binding: { file: "direction.json", pointer: `${entity.pointer}/borrows` },
    options: { fields: [{
      key: "from", label: INSPECTOR_COPY.moodBorrowFrom, help: INSPECTOR_COPY.moodBorrowFromHelp,
      type: "text", required: true, commitOnBlur: true
    }, {
      key: "what", label: INSPECTOR_COPY.moodBorrowWhat, help: INSPECTOR_COPY.moodBorrowWhatHelp,
      type: "list", required: true, commitOnBlur: true
    }, {
      key: "image", label: INSPECTOR_COPY.moodBorrowImage, help: INSPECTOR_COPY.moodBorrowImageHelp,
      type: "text", commitOnBlur: true, clearRemoves: true
    }, {
      key: "license", label: INSPECTOR_COPY.moodBorrowLicense, help: INSPECTOR_COPY.moodBorrowLicenseHelp,
      type: "text", commitOnBlur: true, clearRemoves: true
    }] }
  }, {
    key: "palette", label: INSPECTOR_COPY.moodPalette, help: INSPECTOR_COPY.moodPaletteHelp,
    type: "reference", clearRemoves: true, labels: { change: INSPECTOR_COPY.changeMoodField, clear: INSPECTOR_COPY.changeMoodField },
    binding: { file: "direction.json", pointer: `${entity.pointer}/palette` },
    options: { candidates, allowFree: false }, mount: mountMoodPalette(context)
  }];
}

const moodStandaloneGroup = (context, key, fields) => {
  const section = element(context.document, "section", undefined, "opengdd-author-mood-field-group");
  section.dataset.moodFieldGroup = key;
  return { key, element: section, fields };
};

export function moodFieldGroups(context, entity) {
  const fields = moodFields(context, entity);
  const intent = fields.filter(field => field.key === "intent");
  const anti = fields.filter(field => field.key.startsWith("mood-anti-"));
  const remainder = fields.filter(field => field.key !== "intent" && !field.key.startsWith("mood-anti-"));
  const entries = Array.isArray(entity.value.anti) ? entity.value.anti : [];
  const add = element(context.document, "button", INSPECTOR_COPY.addAnti);
  add.type = "button";
  add.dataset.moodAntiAdd = "";
  add.title = INSPECTOR_COPY.addAntiHelp;
  add.addEventListener("click", () => Promise.resolve((async () => {
    const current = directionFrom(context.package)?.mood?.[entity.id]?.anti;
    await commitJson(context, INSPECTOR_COPY.addAntiUndo, json => {
      if (current === undefined) json.insert(entity.pointer, "anti", [""]);
      else json.insert(`${entity.pointer}/anti`, "-", "");
    });
    context.internal.focusField?.("direction.json", `mood-anti-${Array.isArray(current) ? current.length : 0}-sentence`);
  })()).catch(error => { add.title = error.message; }));
  const antiSection = referenceGroup(context, {
    key: "mood-anti", label: INSPECTOR_COPY.moodAnti, help: INSPECTOR_COPY.moodAntiHelp,
    rows: [], empty: anti.length === 0, count: entries.length, action: add
  });
  antiSection.classList.add("opengdd-author-mood-anti-group");
  antiSection.dataset.directionList = "mood-anti";
  return [
    moodStandaloneGroup(context, "intent", intent),
    { key: "mood-anti", element: antiSection, fields: anti },
    moodStandaloneGroup(context, "details", remainder)
  ];
}

export function moodSections(context, entity) {
  const sites = context.services.references.usages(entity.address).filter(site => site.channel === "prose");
  const rows = sites.length ? locationRows(context, sites, { reveal: site => context.internal.revealLocation(site) }) : undefined;
  for (const row of rows?.querySelectorAll("button") ?? []) row.dataset.moodCitation = row.firstElementChild?.textContent ?? "";
  const section = referenceGroup(context, { label: INSPECTOR_COPY.moodCitations,
    help: sites.length ? INSPECTOR_COPY.moodCitationsHelp : INSPECTOR_COPY.moodNoCitations,
    rows: rows ? [rows] : [] });
  section.classList.add("opengdd-author-mood-citations");
  return [section];
}

export function routeMoodFinding(finding, entity) {
  if (["DIRECTION_UNMENTIONED", "DIRECTION_MOOD_PALETTE_DANGLING"].includes(finding.code)) {
    const subject = /^mood\.([a-z0-9]+(?:-[a-z0-9]+)*)\b/u.exec(String(finding.message ?? ""))?.[1];
    if (subject !== entity.id) return null;
    return finding.code === "DIRECTION_UNMENTIONED" ? "header" : "palette";
  }
  const parts = partsOf(parsedFindingPointer(finding, entity.text));
  if (parts[0] !== "mood" || parts[1] !== entity.id) return null;
  if (finding.code === "MEDIA_PATH_MISSING" && parts[2] === "borrows" && Number.isInteger(Number(parts[3]))) return `borrows-${parts[3]}-image`;
  if (finding.code !== "DIRECTION_SCHEMA") return null;
  if (parts[2] === "intent") return "intent";
  if (parts[2] === "palette") return "palette";
  if (parts[2] === "borrows") return parts[3] !== undefined && parts[4] ? `borrows-${parts[3]}-${parts[4]}` : "borrows";
  if (parts[2] === "anti") {
    if (parts[3] === undefined) return "mood-anti";
    return parts[4] === "image" || parts[4] === "license" ? `mood-anti-${parts[3]}-image` : `mood-anti-${parts[3]}-sentence`;
  }
  return "header";
}

export async function movePaletteColor(context, entity, index, next) {
  const text = context.package.read("direction.json");
  const entryPointer = pointer(["palette", entity.id, index]);
  const entry = directionFrom(context.package)?.palette?.[entity.id]?.[index];
  if (entry === undefined || next < 0 || next >= entity.entries.length) return;
  const range = pointerRange(text, entryPointer);
  const source = text.slice(positionToOffset(text, range.start), positionToOffset(text, range.end));
  await commitJson(context, INSPECTOR_COPY.moveColorUndo, json => {
    json.remove(entryPointer);
    json.insert(pointer(["palette", entity.id]), next, entry, { source });
  });
  context.internal.focusField?.("direction.json", `palette-${next}-hex`);
}

function mountNameControl(index, mounted) {
  return ({ control }) => {
    control.dataset.paletteColorName = String(index);
    mounted.control = control;
  };
}

function mountHexControl(context, entity, index, colour) {
  return ({ document, box, control }) => {
    control.dataset.paletteColorHex = String(index);
    const swatch = element(document, "span", undefined, "opengdd-author-palette-swatch");
    swatch.dataset.paletteSwatch = String(index);
    swatch.setAttribute("aria-hidden", "true");
    const sharedHead = box.parentElement?.querySelector?.(":scope > .opengdd-author-form-shared-help");
    if (sharedHead && !sharedHead.querySelector("[data-palette-swatch-heading]")) {
      const heading = element(document, "p", INSPECTOR_COPY.paletteSwatch, "opengdd-author-form-shared-label");
      heading.dataset.paletteSwatchHeading = "";
      sharedHead.prepend(heading);
    }
    const actions = element(document, "div", undefined, "opengdd-author-palette-row-actions");
    const action = (label, ariaLabel, dataset, run, disabled = false) => {
      const button = element(document, "button", label);
      button.type = "button";
      button.setAttribute("aria-label", ariaLabel);
      button.dataset[dataset] = String(index);
      button.disabled = disabled;
      button.addEventListener("click", () => Promise.resolve(run()).catch(error => { button.title = error.message; }));
      actions.append(button);
    };
    action(INSPECTOR_COPY.moveColorUp, INSPECTOR_COPY.moveColorUpLabel(colour), "paletteMoveUp",
      () => movePaletteColor(context, entity, index, index - 1), index === 0);
    action(INSPECTOR_COPY.moveColorDown, INSPECTOR_COPY.moveColorDownLabel(colour), "paletteMoveDown",
      () => movePaletteColor(context, entity, index, index + 1), index === entity.entries.length - 1);
    action(INSPECTOR_COPY.removeColor, INSPECTOR_COPY.removeColorLabel(colour), "paletteRemoveColor", async () => {
      await commitJson(context, INSPECTOR_COPY.removeColorUndo,
        json => json.remove(pointer(["palette", entity.id, index])));
      const remaining = entity.entries.length - 1;
      if (remaining > 0) context.internal.focusField?.("direction.json", `palette-${Math.min(index, remaining - 1)}-hex`);
    });
    box.append(swatch, actions);
    return { refresh(value) { swatch.style.background = HEX.test(value) ? value : ""; } };
  };
}

export function paletteFields(context, entity) {
  return entity.entries.flatMap((_entry, index) => {
    const entryPointer = pointer(["palette", entity.id, index]);
    const current = () => directionFrom(context.package)?.palette?.[entity.id]?.[index];
    const currentParts = () => entryParts(current());
    const currentName = currentParts().name;
    const colour = INSPECTOR_COPY.paletteColorLabel(currentName, index, currentParts().hex);
    const mountedName = {};
    return [{
      key: `palette-${index}-name`, row: `palette-${index}`, label: INSPECTOR_COPY.paletteName,
      rowLabel: colour, ariaLabel: INSPECTOR_COPY.paletteNameLabel(colour),
      help: INSPECTOR_COPY.paletteNameHelp, helpShared: "palette-name", type: "text", commitOnBlur: true,
      binding: { file: "direction.json", pointer: entryPointer },
      read: () => currentParts().name,
      parse(value) {
        if (value !== "" && !LIST_NAME.test(value)) throw new Error(INSPECTOR_COPY.paletteNameInvalid);
        return value;
      },
      validate: value => value === "" || LIST_NAME.test(value) ? "" : INSPECTOR_COPY.paletteNameInvalid,
      async write(value) {
        const parts = currentParts();
        if (value === parts.name) return;
        if (parts.name && value) {
          const anchor = mountedName.control;
          if (!anchor) return;
          context.internal.renameEntity?.({
            anchor, address: `palette.${entity.id}.${parts.name}`, initial: value,
            onCancel: () => context.internal.focusField?.("direction.json", `palette-${index}-name`)
          });
          return;
        }
        await commitJson(context, value ? INSPECTOR_COPY.nameColor : INSPECTOR_COPY.unnameColor,
          json => json.set(entryPointer, value ? { [value]: parts.hex } : parts.hex));
      },
      mount: mountNameControl(index, mountedName)
    }, {
      key: `palette-${index}-hex`, row: `palette-${index}`, label: INSPECTOR_COPY.paletteHex,
      rowLabel: colour, ariaLabel: INSPECTOR_COPY.paletteHexLabel(colour),
      help: INSPECTOR_COPY.paletteHexHelp, helpShared: "palette-hex", type: "text", monospace: true, required: true, commitOnBlur: true,
      binding: { file: "direction.json", pointer: currentName ? pointer(["palette", entity.id, index, currentName]) : entryPointer },
      read: () => currentParts().hex,
      parse(value) {
        if (!HEX.test(value)) throw new Error(INSPECTOR_COPY.paletteHexInvalid);
        return value;
      },
      validate: value => HEX.test(value) ? "" : INSPECTOR_COPY.paletteHexInvalid,
      async write(value) {
        if (value === currentParts().hex) return;
        await commitJson(context, INSPECTOR_COPY.changeColor, json => json.set(
          currentParts().name ? pointer(["palette", entity.id, index, currentParts().name]) : entryPointer, value));
      },
      mount: mountHexControl(context, entity, index, colour)
    }];
  });
}

function selectUse(context, use) {
  let range;
  try { range = pointerRange(context.package.read("direction.json"), use.pointer); } catch {}
  context.services.selection.select({ kind: use.kind, name: use.address, file: "direction.json", range });
}

export function paletteSections(context, entity) {
  const document = context.document;
  const addSection = element(document, "section", undefined, "opengdd-author-palette-add");
  addSection.classList.add("opengdd-author-value-column");
  const add = element(document, "button", INSPECTOR_COPY.addColor);
  add.type = "button";
  add.dataset.paletteAddColor = "";
  const addHelp = element(document, "p", INSPECTOR_COPY.addColorHelp, "opengdd-author-form-help");
  addHelp.id = `opengdd-palette-${entity.id.replace(/[^A-Za-z0-9_-]/g, "-")}-add-help`;
  add.setAttribute("aria-describedby", addHelp.id);
  add.addEventListener("click", () => Promise.resolve((async () => {
    const index = directionFrom(context.package)?.palette?.[entity.id]?.length ?? 0;
    await commitJson(context, INSPECTOR_COPY.addColorUndo,
      json => json.insert(pointer(["palette", entity.id]), "-", "#000000"));
    context.internal.focusField?.("direction.json", `palette-${index}-hex`);
  })()).catch(error => { add.title = error.message; }));
  addSection.append(add, addHelp);

  const uses = paletteUses(context.package, entity.id);
  const rows = uses.length ? [entityChips(context, uses.map(use => ({
    name: use.name, kind: use.kind,
    dataset: { paletteUse: use.address }, selection: use
  })), { open: item => selectUse(context, item.selection) })] : [];
  const useSection = referenceGroup(context, { label: INSPECTOR_COPY.usesPalette,
    help: uses.length ? INSPECTOR_COPY.usesPaletteHelp : INSPECTOR_COPY.paletteUnused, rows });
  useSection.classList.add("opengdd-author-palette-uses");
  return [addSection, useSection];
}

export function routePaletteFinding(finding, entity) {
  if (["PALETTE_SHAPE", "PALETTE_KEY_COLLISION", "PALETTE_UNREACHED"].includes(finding.code)) return "header";
  const indexed = new RegExp(`palette\\.${entity.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\[(\\d+)\\]`).exec(finding.message);
  if (indexed) {
    const index = Number(indexed[1]);
    return finding.code === "PALETTE_ENTRY_FORM" && /names the color|carries \d+ keys/.test(finding.message)
      ? `palette-${index}-name` : `palette-${index}-hex`;
  }
  if (finding.code === "PALETTE_COLOR_DUPLICATE") {
    const named = /names the color ("(?:\\.|[^"\\])*") twice/.exec(finding.message);
    let name;
    try { name = named ? JSON.parse(named[1]) : undefined; } catch {}
    const duplicate = entity.entries.map((entry, index) => entryParts(entry).name === name ? index : -1).filter(index => index >= 0)[1];
    if (duplicate !== undefined) return `palette-${duplicate}-hex`;
  }
  return finding.code?.startsWith("PALETTE_") ? "header" : null;
}
