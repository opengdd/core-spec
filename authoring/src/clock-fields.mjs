import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";
import { packageFiles, parseJson, plainObject, pointer } from "./json-path.mjs";
import { pointerRange } from "./json-pointer-lines.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const RUNTIME_ADDRESS = /^runtime\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)*$/u;
const MODE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const CLOCK_MODE_WORDS = Object.freeze(["running", "paused", "steps", "none"]);
const DEFAULT_CLOCK_MODE = "none";

const kebabName = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
  .toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
export const createClock = (context, request = {}) => context.internal.create(
  "Clock", request.anchor, kebabName(String(request.name ?? "").replace(/^clocks\./u, "")) || undefined);

const packageMapCache = new WeakMap();
const readFiles = files => {
  if (files instanceof Map) return files;
  const revision = files?.packageRevision;
  if (revision !== undefined) {
    const cached = packageMapCache.get(files);
    if (cached?.revision === revision) return cached.files;
  }
  const map = new Map((files?.list?.() ?? []).map(file => [file, files.read(file)]));
  if (revision !== undefined) packageMapCache.set(files, { revision, files: map });
  return map;
};

const clockDocument = files => parseJson(readFiles(files).get("clocks.json"));

const addUnique = (values, value) => {
  if (!values.includes(value)) values.push(value);
};

export function runtimeAddresses(files, view) {
  const values = [];
  for (const entry of view?.routables ?? []) {
    if (entry.kind === "runtime" && RUNTIME_ADDRESS.test(entry.name)) addUnique(values, entry.name);
  }
  const clocks = clockDocument(files);
  for (const clock of Object.values(plainObject(clocks) ? clocks : {})) {
    for (const address of Array.isArray(clock?.advances) ? clock.advances : []) {
      if (typeof address === "string" && RUNTIME_ADDRESS.test(address)) addUnique(values, address);
    }
  }
  return values;
}

export function modeIds(files) {
  const values = [];
  const clocks = clockDocument(files);
  for (const clock of Object.values(plainObject(clocks) ? clocks : {})) {
    for (const mode of Object.keys(plainObject(clock?.modes) ? clock.modes : {})) addUnique(values, mode);
  }
  return values;
}

const runtimeEntries = context => {
  const entries = context.internal.view?.()?.routables ?? [];
  const byName = new Map();
  for (const entry of entries) {
    if (entry.kind !== "runtime" || byName.has(entry.name)) continue;
    byName.set(entry.name, entry);
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const clocksFrom = context => {
  const clocks = parseJson(context.package.read("clocks.json"));
  return plainObject(clocks) ? clocks : {};
};

const actionBox = (context, { label, help, dataset, run }) => {
  const box = element(context.document, "div", undefined, "opengdd-author-clock-action");
  const description = element(context.document, "p", help, "opengdd-author-form-help");
  description.id = `opengdd-clock-${dataset}-help`;
  const button = element(context.document, "button", label);
  button.type = "button";
  button.dataset[dataset] = "";
  button.setAttribute("aria-describedby", description.id);
  const error = element(context.document, "p", "", "opengdd-author-form-error");
  error.hidden = true;
  error.setAttribute("aria-live", "polite");
  button.addEventListener("click", () => {
    error.textContent = "";
    error.hidden = true;
    Promise.resolve().then(() => run(button)).catch(failure => {
      const message = String(failure?.message ?? failure);
      button.title = message;
      error.textContent = message;
      error.hidden = !message;
    });
  });
  box.append(button, description, error);
  return box;
};

const commitJson = async (context, label, change) => {
  const transaction = context.internal.begin(label);
  change(transaction.json("clocks.json"));
  await transaction.commit();
};

export async function removeClockAdvance(context, entity, index) {
  await commitJson(context, INSPECTOR_COPY.removeClockAdvanceUndo,
    json => json.remove(pointer([entity.id, "advances", index])));
  const remaining = Math.max(0, entity.advances.length - 1);
  if (remaining) context.internal.focusField?.("clocks.json", `advances-${Math.min(index, remaining - 1)}`);
}

export async function addClockAdvance(context, entity) {
  if (!Array.isArray(entity.value?.advances)) {
    if (entity.value?.advances !== undefined) throw new Error(INSPECTOR_COPY.clockAdvancesUnreadable);
  }
  const candidates = runtimeAddresses(context.package, context.internal.view?.());
  const current = Array.isArray(entity.value?.advances) ? entity.value.advances : [];
  const advancedElsewhere = new Set(otherClockAdvances(context, entity).map(entry => entry.address));
  const available = candidate => !current.includes(candidate);
  const value = candidates.find(candidate => available(candidate) && !advancedElsewhere.has(candidate))
    ?? candidates.find(available);
  if (!value) throw new Error(INSPECTOR_COPY.clockNoRuntimeToAdd);
  if (!Array.isArray(entity.value?.advances) && !Object.hasOwn(entity.value ?? {}, "modes")) {
    throw new Error(INSPECTOR_COPY.clockAdvanceWithoutModes);
  }
  await commitJson(context, INSPECTOR_COPY.addClockAdvanceUndo, json => {
    if (Array.isArray(entity.value?.advances)) json.insert(pointer([entity.id, "advances"]), current.length, value);
    else json.insert(pointer([entity.id]), "advances", [value], { before: "modes" });
  });
  context.internal.focusField?.("clocks.json", `advances-${current.length}`);
  return value;
}

export async function removeClockMode(context, entity, mode) {
  await commitJson(context, INSPECTOR_COPY.removeClockModeUndo,
    json => json.remove(pointer([entity.id, "modes", mode])));
}

function openAddModeDialog(context, entity, anchor) {
  const dialog = element(context.document, "section", undefined, "opengdd-author-confirmation");
  dialog.dataset.clockModeDialog = "";
  dialog.setAttribute("role", "dialog");
  const label = element(context.document, "label", INSPECTOR_COPY.clockModeQuestion);
  const input = element(context.document, "input");
  input.id = `opengdd-clock-mode-${entity.id}`;
  input.dataset.clockModeName = "";
  input.autocomplete = "off";
  label.htmlFor = input.id;
  const help = element(context.document, "p", INSPECTOR_COPY.clockModeIdHelp, "opengdd-author-form-help");
  const error = element(context.document, "p", "", "opengdd-author-form-error");
  error.setAttribute("aria-live", "polite");
  const add = element(context.document, "button", INSPECTOR_COPY.addClockMode);
  add.type = "button";
  add.dataset.clockModeConfirm = "";
  add.disabled = true;
  const cancel = element(context.document, "button", INSPECTOR_COPY.cancel);
  cancel.type = "button";
  const update = () => {
    const mode = input.value.trim();
    error.textContent = !mode ? "" : !MODE_ID.test(mode) ? INSPECTOR_COPY.clockModeIdInvalid
      : modeIds(context.package).includes(mode) ? INSPECTOR_COPY.clockModeTaken(mode) : "";
    add.disabled = !mode || Boolean(error.textContent);
  };
  input.addEventListener("input", update);
  cancel.addEventListener("click", () => { dialog.remove(); anchor.focus?.(); });
  add.addEventListener("click", async () => {
    const mode = input.value.trim();
    add.disabled = true;
    try {
      if (!plainObject(clocksFrom(context)[entity.id]?.modes)) throw new Error(INSPECTOR_COPY.clockModesUnreadable);
      await commitJson(context, INSPECTOR_COPY.addClockModeUndo,
        json => json.insert(pointer([entity.id, "modes"]), mode, DEFAULT_CLOCK_MODE));
      dialog.remove();
      context.internal.focusField?.("clocks.json", `mode-${modeIds(context.package).indexOf(mode)}`);
    } catch (failure) {
      error.textContent = String(failure?.message ?? failure);
      add.disabled = false;
    }
  });
  dialog.append(label, input, help, error, add, cancel);
  anchor.after(dialog);
  input.focus();
  return dialog;
}

function clockGroup(context, key, title, help, fields, after) {
  const section = referenceGroup(context, { key, label: title, help, rows: [], empty: fields.length === 0,
    count: fields.length });
  section.classList.add("opengdd-author-clock-group");
  section.dataset.clockGroup = key;
  return { key, element: section, fields, after };
}

function standaloneClockField(context, key, fields) {
  const container = element(context.document, "div", undefined, "opengdd-author-clock-field");
  container.dataset.clockField = key;
  return { key, element: container, fields };
}

const otherClockAdvances = (context, entity) => Object.entries(clocksFrom(context))
  .filter(([name]) => name !== entity.id)
  .flatMap(([name, clock]) => (Array.isArray(clock?.advances) ? clock.advances : [])
    .map(address => ({ name, address })));

function clockFieldSets(context, entity) {
  const candidates = runtimeAddresses(context.package, context.internal.view?.())
    .map(value => ({ value, label: value, group: INSPECTOR_COPY.clockRuntimeCandidates }));
  const advances = Array.isArray(entity.value?.advances) ? entity.value.advances : [];
  const advanceFields = advances.map((address, index) => ({
    key: `advances-${index}`, row: `advances-${index}`,
    rowLabel: INSPECTOR_COPY.clockAdvanceRow(index, address), label: INSPECTOR_COPY.clockAdvance,
    ariaLabel: INSPECTOR_COPY.clockAdvanceLabel(index), help: INSPECTOR_COPY.clockAdvanceHelp,
    helpShared: "clock-advance", type: "reference", required: true,
    labels: { change: INSPECTOR_COPY.changeClockAdvance },
    binding: { file: "clocks.json", pointer: pointer([entity.id, "advances", index]) },
    options: { candidates, allowFree: false },
    action: {
      label: INSPECTOR_COPY.listRemove,
      ariaLabel: INSPECTOR_COPY.removeClockAdvanceLabel(address),
      run: () => removeClockAdvance(context, entity, index)
    }
  }));
  const modes = modeIds(context.package);
  const ownModes = plainObject(entity.value?.modes) ? entity.value.modes : {};
  const modeFields = modes.map((mode, index) => ({
    key: `mode-${index}`, row: `mode-${index}`, rowLabel: INSPECTOR_COPY.clockModeRow(mode),
    label: mode, help: INSPECTOR_COPY.clockModeHelp, type: "enum", required: true,
    labels: { change: INSPECTOR_COPY.changeClockMode, clear: INSPECTOR_COPY.removeClockModeUndo },
    binding: { file: "clocks.json", pointer: pointer([entity.id, "modes", mode]) },
    options: CLOCK_MODE_WORDS,
    ...(Object.hasOwn(ownModes, mode) ? { action: {
      label: INSPECTOR_COPY.listRemove,
      ariaLabel: INSPECTOR_COPY.removeClockModeLabel(mode),
      run: () => removeClockMode(context, entity, mode)
    } } : {})
  }));
  const unit = [{
    key: "unit", label: INSPECTOR_COPY.clockUnit, help: INSPECTOR_COPY.clockUnitHelp,
    type: "text", required: true, commitOnBlur: true,
    labels: { change: INSPECTOR_COPY.changeClockUnit },
    binding: { file: "clocks.json", pointer: pointer([entity.id, "unit"]) }
  }];
  return { unit, advanceFields, modeFields };
}

export function clockFieldGroups(context, entity) {
  const { unit, advanceFields, modeFields } = clockFieldSets(context, entity);
  const other = otherClockAdvances(context, entity);
  const advancesAfter = element(context.document, "div", undefined, "opengdd-author-clock-advance-after");
  advancesAfter.append(actionBox(context, {
    label: INSPECTOR_COPY.addClockAdvance,
    help: INSPECTOR_COPY.addClockAdvanceHelp,
    dataset: "addClockAdvance",
    run: () => addClockAdvance(context, entity)
  }), element(context.document, "p", other.length
    ? INSPECTOR_COPY.otherClockAdvances(other)
    : INSPECTOR_COPY.noOtherClockAdvances, "opengdd-author-form-note"));
  const modesAfter = actionBox(context, {
    label: INSPECTOR_COPY.addClockMode,
    help: INSPECTOR_COPY.addClockModeHelp,
    dataset: "addClockMode",
    run: anchor => openAddModeDialog(context, entity, anchor)
  });
  return [
    standaloneClockField(context, "unit", unit),
    clockGroup(context, "advances", INSPECTOR_COPY.clockAdvances, INSPECTOR_COPY.clockAdvancesHelp, advanceFields, advancesAfter),
    clockGroup(context, "modes", INSPECTOR_COPY.clockModes, INSPECTOR_COPY.clockModesHelp, modeFields, modesAfter)
  ];
}

export function clockFields(context, entity) {
  const { unit, advanceFields, modeFields } = clockFieldSets(context, entity);
  return [...unit, ...advanceFields, ...modeFields];
}

function jumpToEntry(context, entry) {
  return context.services.selection.select({
    kind: entry.kind, name: entry.name, file: entry.file, range: entry.range
  });
}

const entryForRuntime = (context, address) => runtimeEntries(context).find(entry => entry.name === address);

export function clockDependencies(context, entity) {
  const citations = context.services.references.usages(entity.address).filter(site => site.channel === "prose");
  return { advances: Array.isArray(entity.value?.advances) ? entity.value.advances : [], citations };
}

export function clockSections(context, entity) {
  const runtimeEntities = entity.advances.map((address, index) => {
    const entry = entryForRuntime(context, address);
    const fallbackRange = (() => {
      try { return pointerRange(context.package.read("clocks.json"), pointer([entity.id, "advances", index])); } catch { return undefined; }
    })();
    const target = entry ?? { kind: "clock", name: entity.address, file: "clocks.json", range: fallbackRange };
    const declarationFile = entry?.file ?? "clocks.json";
    const declarationRange = entry?.range ?? fallbackRange;
    return { name: address, kind: "runtime",
      detail: INSPECTOR_COPY.locationDetail(declarationFile, (declarationRange?.start?.line ?? 0) + 1),
      dataset: { clockRuntimeValue: address }, selection: target };
  });
  const advanced = referenceGroup(context, { label: INSPECTOR_COPY.clockRuntimeValues,
    help: runtimeEntities.length ? INSPECTOR_COPY.clockRuntimeValuesHelp : INSPECTOR_COPY.clockNoRuntimeValues,
    rows: runtimeEntities.length ? [entityChips(context, runtimeEntities, { open: entry => jumpToEntry(context, entry.selection) })] : [] });
  advanced.classList.add("opengdd-author-clock-runtime");
  advanced.dataset.clockRuntime = entity.id;

  const citations = clockDependencies(context, entity).citations;
  const prose = referenceGroup(context, { label: INSPECTOR_COPY.clockCitations,
    help: citations.length ? INSPECTOR_COPY.clockCitationsHelp : INSPECTOR_COPY.clockNoCitations,
    rows: citations.length ? [locationRows(context, citations, {
      reveal: site => context.internal.revealLocation(site)
    })] : [] });
  prose.classList.add("opengdd-author-clock-citations");
  prose.dataset.clockCitations = entity.id;
  return [advanced, prose];
}

const quoted = source => {
  try { return JSON.parse(source); } catch { return undefined; }
};

const clockSubject = finding => quoted(/clock(?:\s+name)?\s+("(?:\\.|[^"\\])*")/u.exec(String(finding?.message ?? ""))?.[1]);
const modeSubject = finding => finding?.mode ?? quoted(/\bmode\s+("(?:\\.|[^"\\])*")/u.exec(String(finding?.message ?? ""))?.[1]);
const runtimeSubject = finding => finding?.address ?? quoted(/("runtime\.(?:\\.|[^"\\])*")/u.exec(String(finding?.message ?? ""))?.[1]);

export function routeClockFinding(finding, entity) {
  if (finding.code === "CLOCKS_JSON") return false;
  if (!String(finding.code ?? "").startsWith("CLOCKS_")) return null;
  const subject = finding.clock ?? clockSubject(finding);
  if (subject !== undefined && subject !== entity.id) return false;
  if (finding.code === "CLOCKS_UNIT") return "unit";
  if (finding.code === "CLOCKS_ADVANCES_DISJOINT") {
    const address = runtimeSubject(finding);
    const index = entity.advances.indexOf(address);
    return index >= 0 ? `advances-${index}` : "header";
  }
  if (["CLOCKS_MODE_MISSING", "CLOCKS_MODE_WORD"].includes(finding.code)) {
    const index = entity.modeIds.indexOf(modeSubject(finding));
    return index >= 0 ? `mode-${index}` : "header";
  }
  if (finding.code === "CLOCKS_SHAPE") {
    const message = String(finding.message ?? "");
    const advance = /\badvances\[(\d+)\]/u.exec(message);
    if (advance && Number(advance[1]) < entity.advances.length) return `advances-${advance[1]}`;
    const mode = modeSubject(finding);
    const modeIndex = entity.modeIds.indexOf(mode);
    if (modeIndex >= 0) return `mode-${modeIndex}`;
    if (/\bunit\b/u.test(message)) return "unit";
    if (/\bmodes\b/u.test(message) && entity.modeIds.length) return "mode-0";
    if (/\badvances\b/u.test(message) && entity.advances.length) return "advances-0";
    return "header";
  }
  return "header";
}

export function timeMechanismFields() {
  return [];
}

export function timeMechanismSections(context) {
  const clocks = clocksFrom(context);
  const runtimes = runtimeEntries(context);
  const entries = runtimes.map(entry => {
    const names = Object.entries(clocks).filter(([, clock]) =>
      Array.isArray(clock?.advances) && clock.advances.includes(entry.name)).map(([name]) => name);
    return { name: entry.name, kind: "runtime",
      detail: INSPECTOR_COPY.timeRuntimeDetail(names, entry.file, entry.range.start.line + 1),
      findingKey: `runtime-${entry.name}`, dataset: { timeRuntimeValue: entry.name }, selection: entry };
  });
  const section = referenceGroup(context, { label: INSPECTOR_COPY.timeRuntimeValues,
    help: entries.length ? INSPECTOR_COPY.timeRuntimeValuesHelp : INSPECTOR_COPY.timeNoRuntimeValues,
    rows: entries.length ? [entityChips(context, entries, { open: entry => jumpToEntry(context, entry.selection) })] : [] });
  section.classList.add("opengdd-author-time-runtime");
  section.dataset.timeRuntimeValues = "";
  return [section];
}

export function routeTimeFinding(finding, entity) {
  if (!String(finding.code ?? "").startsWith("RUNTIME_")) return false;
  const address = runtimeSubject(finding);
  return address && entity.runtimeNames.includes(address) ? `runtime-${address}` : "header";
}
