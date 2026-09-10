import { CONTRACT_SAME_NUMBER_ACCEPTED } from "./contracts.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { anchoredConfirmation, element, renderBackticks } from "./dom.mjs";
import { walkJsonDocument } from "./edits-json.mjs";
import { packageFiles, parseJson, plainObject, pointer } from "./json-path.mjs";
import { pointerRange } from "./json-pointer-lines.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const readFiles = files => files instanceof Map
  ? files
  : new Map((files?.list?.() ?? []).map(file => [file, files.read(file)]));

const pointerParts = value => value === "" ? [] : value.slice(1).split("/").map(part =>
  part.replaceAll("~1", "/").replaceAll("~0", "~"));

function nodeAt(text, at) {
  let node = walkJsonDocument(text);
  for (const part of pointerParts(at)) {
    if (node.type === "object") node = node.properties.find(item => item.key === part)?.value;
    else if (node.type === "array" && /^(?:0|[1-9]\d*)$/u.test(part)) node = node.elements[Number(part)];
    else node = undefined;
    if (!node) return undefined;
  }
  return node;
}

function numberSpelling(text, at, fallback) {
  try {
    const node = nodeAt(text, at);
    return node?.type === "scalar" ? text.slice(node.start, node.end) : String(fallback ?? "");
  } catch { return String(fallback ?? ""); }
}

const buttonErrors = new WeakMap();
const button = (document, label, run, dataset) => {
  const control = element(document, "button", label);
  const error = element(document, "p", "", "opengdd-author-form-error");
  error.hidden = true;
  error.setAttribute("aria-live", "polite");
  control.type = "button";
  if (dataset) control.dataset[dataset] = "";
  control.addEventListener("click", () => {
    error.textContent = "";
    error.hidden = true;
    Promise.resolve().then(() => run(control)).catch(failure => {
      const message = String(failure?.message ?? failure);
      control.title = message;
      error.textContent = message;
      error.hidden = !message;
      if (!error.parentNode) control.after(error);
    });
  });
  buttonErrors.set(control, error);
  return control;
};

const jump = (context, selection) => context.services.selection.select(selection);

const ruleNames = ast => {
  const found = [];
  const seen = new Set();
  (function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "key" && !seen.has(node.name)) { seen.add(node.name); found.push(node.name); }
    else if (node.type === "group") visit(node.expression);
    else if (node.type === "unary") visit(node.argument);
    else if (node.type === "binary") { visit(node.left); visit(node.right); }
    else if (node.type === "call") node.args?.forEach(visit);
  })(ast);
  return found;
};

export function tuningRuleState(source, values, { parseRule, evaluateRule }) {
  let ast;
  try {
    ast = parseRule(source);
  } catch (error) {
    return { error, keys: [], verdict: INSPECTOR_COPY.tuningRuleInvalid };
  }
  const keys = ruleNames(ast);
  try {
    return { ast, keys, verdict: evaluateRule(ast, values)
      ? INSPECTOR_COPY.tuningRuleHolds : INSPECTOR_COPY.tuningRuleFails };
  } catch (error) {
    return { ast, error, keys, verdict: INSPECTOR_COPY.tuningRuleInvalid };
  }
}

export function tuningKeys(files) {
  const tuning = parseJson(readFiles(files).get("tuning.json"));
  return Object.keys(plainObject(tuning?.values) ? tuning.values : {});
}

export function rangedTuningKeys(files) {
  const tuning = parseJson(readFiles(files).get("tuning.json"));
  const values = plainObject(tuning?.values) ? tuning.values : {};
  const ranges = plainObject(tuning?.ranges) ? tuning.ranges : {};
  return Object.keys(values).filter(key => Array.isArray(ranges[key]) && ranges[key].length === 2);
}

export function tuningValueDependencies(context, key, ruleTools) {
  const tuning = parseJson(context.package.read("tuning.json"));
  const values = new Map(Object.entries(plainObject(tuning?.values) ? tuning.values : {}));
  const rules = Object.entries(plainObject(tuning?.rules) ? tuning.rules : {}).flatMap(([name, source]) => {
    const state = tuningRuleState(source, values, ruleTools);
    return state.keys.includes(key) ? [{ name, source, ...state }] : [];
  });
  const personalization = parseJson(context.package.read("personalization.json"));
  const questions = (Array.isArray(personalization?.questions) ? personalization.questions : []).flatMap((question, index) => {
    const directly = question?.sets === key;
    const options = (Array.isArray(question?.options) ? question.options : []).filter(option =>
      plainObject(option?.sets) && Object.hasOwn(option.sets, key));
    return directly || options.length ? [{ id: question?.id ?? String(index + 1), index, directly, options }] : [];
  });
  const direction = parseJson(context.package.read("direction.json"));
  const promises = Object.entries(plainObject(direction?.timing) ? direction.timing : {}).flatMap(([name, value]) =>
    value?.key === key ? [{ name }] : []);
  const usages = context.services.references.usages(key);
  const citations = usages.filter(site => site.channel === "prose");
  const contracts = usages.filter(site => ['contract-value-citation', 'contract-row-citation'].includes(site.kind));
  return { rules, questions, promises, citations, contracts };
}

const valueRangeError = (context, entity, role, candidate) => {
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return INSPECTOR_COPY.tuningFiniteNumber;
  const tuning = parseJson(context.package.read("tuning.json"));
  const value = role === "value" ? candidate : tuning?.values?.[entity.id];
  const range = tuning?.ranges?.[entity.id];
  if (!Array.isArray(range) || range.length !== 2) return "";
  const minimum = role === "minimum" ? candidate : range[0];
  const maximum = role === "maximum" ? candidate : range[1];
  if (minimum > maximum) return INSPECTOR_COPY.tuningRangeOrder(minimum, maximum);
  if (value < minimum || value > maximum) return INSPECTOR_COPY.tuningValueOutside(value, minimum, maximum);
  return "";
};

export function tuningValueFields(context, entity) {
  const fields = [{
    key: "value", label: INSPECTOR_COPY.tuningValue, help: INSPECTOR_COPY.tuningValueHelp,
    type: "number", required: true, binding: { file: "tuning.json", pointer: pointer(["values", entity.id]) },
    labels: { change: INSPECTOR_COPY.changeTuningValue },
    format: value => numberSpelling(context.package.read("tuning.json"), pointer(["values", entity.id]), value),
    validate: value => valueRangeError(context, entity, "value", value)
  }];
  if (!Array.isArray(entity.bounds) || entity.bounds.length !== 2) return fields;
  fields.push({
    key: "range-minimum", row: "range", rowLabel: INSPECTOR_COPY.tuningRange,
    label: INSPECTOR_COPY.tuningMinimum, ariaLabel: INSPECTOR_COPY.tuningMinimum,
    help: INSPECTOR_COPY.tuningMinimumHelp, type: "number", required: true,
    binding: { file: "tuning.json", pointer: pointer(["ranges", entity.id, 0]) },
    labels: { change: INSPECTOR_COPY.changeTuningRange },
    format: value => numberSpelling(context.package.read("tuning.json"), pointer(["ranges", entity.id, 0]), value),
    validate: value => valueRangeError(context, entity, "minimum", value)
  }, {
    key: "range-maximum", row: "range", rowLabel: INSPECTOR_COPY.tuningRange,
    label: INSPECTOR_COPY.tuningMaximum, ariaLabel: INSPECTOR_COPY.tuningMaximum,
    help: INSPECTOR_COPY.tuningMaximumHelp, type: "number", required: true,
    binding: { file: "tuning.json", pointer: pointer(["ranges", entity.id, 1]) },
    labels: { change: INSPECTOR_COPY.changeTuningRange },
    format: value => numberSpelling(context.package.read("tuning.json"), pointer(["ranges", entity.id, 1]), value),
    validate: value => valueRangeError(context, entity, "maximum", value)
  });
  return fields;
}

export async function applyTuningRangeChange(context, key, rangePlanner) {
  const change = rangePlanner(packageFiles(context.package), key);
  if (change.reason) return { applied: false, reason: change.reason };
  const transaction = context.internal.begin(change.remove ? INSPECTOR_COPY.removeTuningRangeUndo : INSPECTOR_COPY.addTuningRangeUndo);
  const json = transaction.json("tuning.json");
  for (const operation of change.operations) {
    if (operation.type === "insert") json.insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
    else if (operation.type === "remove") json.remove(operation.pointer);
  }
  await transaction.commit();
  return { applied: true, remove: change.remove };
}

function rangeSection(context, entity, rangePlanner) {
  const action = button(context.document, entity.bounds ? INSPECTOR_COPY.removeTuningRange : INSPECTOR_COPY.addTuningRange,
    async control => {
      const result = await applyTuningRangeChange(context, entity.id, rangePlanner);
      if (!result.applied) throw new Error(result.reason);
    }, "tuningRangeGesture");
  if (entity.rangeRefusal) {
    action.disabled = true;
    action.title = entity.rangeRefusal;
  }
  const section = referenceGroup(context, {
    label: INSPECTOR_COPY.tuningRange,
    help: entity.bounds ? INSPECTOR_COPY.tuningRemoveRangeHelp : INSPECTOR_COPY.tuningAddRangeHelp,
    rows: [], empty: !entity.bounds, count: entity.bounds ? 1 : 0, action
  });
  if (entity.rangeRefusal) {
    const help = element(context.document, "p", entity.rangeRefusal, "opengdd-author-form-help");
    help.dataset.tuningRangeHelp = "";
    section.querySelector(".opengdd-author-reference-content").append(help);
  }
  section.classList.add("opengdd-author-tuning-range-action");
  section.dataset.tuningRangeAction = entity.id;
  return section;
}

function ruleListSection(context, entity, dependencies) {
  const rows = dependencies.rules.length ? [entityChips(context, dependencies.rules.map(rule => {
    let range;
    try { range = pointerRange(context.package.read("tuning.json"), pointer(["rules", rule.name])); } catch {}
    return {
      name: rule.name, kind: INSPECTOR_COPY.tuningRuleKind,
      detail: INSPECTOR_COPY.tuningRuleDetail(range ? range.start.line + 1 : undefined, rule.verdict),
      after: element(context.document, "code", rule.source), findingKey: `rule-${rule.name}`,
      selection: { kind: "rule", name: rule.name, file: "tuning.json", range }
    };
  }))] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningRulesReadingValue,
    help: dependencies.rules.length ? INSPECTOR_COPY.tuningRulesReadingValueHelp : INSPECTOR_COPY.tuningNoRulesReadValue, rows });
  section.classList.add("opengdd-author-tuning-rules");
  section.dataset.tuningValueRules = entity.id;
  return section;
}

function questionSection(context, entity, dependencies) {
  const rows = dependencies.questions.length ? [entityChips(context, dependencies.questions.map(question => {
    let range;
    try { range = pointerRange(context.package.read("personalization.json"), pointer(["questions", question.index])); } catch {}
    return { name: question.id, kind: INSPECTOR_COPY.questionKind,
      selection: { kind: "question", name: question.id, file: "personalization.json", range } };
  }))] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningQuestionsSettingValue,
    help: dependencies.questions.length ? INSPECTOR_COPY.tuningQuestionsSettingValueHelp : INSPECTOR_COPY.tuningNoQuestionsSetValue, rows });
  section.dataset.tuningValueQuestions = entity.id;
  return section;
}

function timingSection(context, entity, dependencies) {
  const rows = dependencies.promises.length ? [entityChips(context, dependencies.promises.map(promise => {
    let range;
    try { range = pointerRange(context.package.read("direction.json"), pointer(["timing", promise.name])); } catch {}
    return { name: promise.name, kind: INSPECTOR_COPY.promiseTimingKind,
      selection: { kind: "timing", name: `timing.${promise.name}`, file: "direction.json", range } };
  }))] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningTimingPromises,
    help: dependencies.promises.length ? INSPECTOR_COPY.tuningTimingPromisesHelp : INSPECTOR_COPY.tuningNoTimingPromises, rows });
  section.dataset.tuningValueTiming = entity.id;
  return section;
}

function citationSection(context, entity, dependencies) {
  const rows = dependencies.citations.length ? [locationRows(context, dependencies.citations, {
    reveal: site => context.internal.revealLocation(site)
  })] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningCitations,
    help: dependencies.citations.length ? INSPECTOR_COPY.tuningCitationsHelp : INSPECTOR_COPY.tuningNoCitations, rows });
  section.dataset.tuningValueCitations = entity.id;
  section.dataset.inspectorAside = "";
  return section;
}

function contractSection(context, entity, dependencies) {
  if (!dependencies.contracts.length) return undefined;
  // Location ranges are for display only; rename sites retain JSON pointers.
  const locations = dependencies.contracts.map(site => {
    let range;
    try { range = pointerRange(context.package.read(site.file), site.pointer); } catch {}
    return { ...site, range };
  });
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningContracts,
    help: INSPECTOR_COPY.tuningContractsHelp,
    rows: [locationRows(context, locations, { reveal: site => context.internal.revealLocation(site) })] });
  section.dataset.tuningValueContracts = entity.id;
  return section;
}

async function keepBothNumbers(context, warning) {
  const adoption = parseJson(context.package.read(warning.file));
  const accepted = [...new Set([...(Array.isArray(adoption?.[CONTRACT_SAME_NUMBER_ACCEPTED])
    ? adoption[CONTRACT_SAME_NUMBER_ACCEPTED] : []), warning.key])];
  const transaction = context.internal.begin(CONTRACT_COPY.undo.keepBoth);
  const json = transaction.json(warning.file);
  if (Object.hasOwn(adoption ?? {}, CONTRACT_SAME_NUMBER_ACCEPTED)) json.set(pointer(CONTRACT_SAME_NUMBER_ACCEPTED), accepted);
  else json.insert("", CONTRACT_SAME_NUMBER_ACCEPTED, accepted);
  await transaction.commit();
}

function sameNumberSection(context, entity, dismissed) {
  const warnings = (entity.sameNumberWarnings ?? []).filter(warning => !dismissed.has(`${warning.file}\0${warning.key}\0${warning.name}`));
  if (!warnings.length) return undefined;
  const section = element(context.document, "section", undefined, "opengdd-author-tuning-duplicates");
  for (const warning of warnings) {
    const identity = `${warning.file}\0${warning.key}\0${warning.name}`;
    const box = element(context.document, "div", undefined, "opengdd-author-tuning-duplicate");
    box.dataset.sameNumberWarning = warning.key;
    renderBackticks(box.appendChild(element(context.document, "p")),
      CONTRACT_COPY.duplicateWarning(warning.key, warning.adoption, warning.name, warning.value));
    box.append(element(context.document, "p", CONTRACT_COPY.duplicateHelp, "opengdd-author-form-help"));
    const actions = element(context.document, "div", undefined, "opengdd-author-tuning-duplicate-actions");
    const status = element(context.document, "p", "", "opengdd-author-tuning-duplicate-status");
    status.setAttribute("aria-live", "polite");
    const use = button(context.document, CONTRACT_COPY.useContractEverywhere, async anchor => {
      status.textContent = "";
      const plan = context.services.references.planUseContractValue(warning.key, warning.contractAddress);
      if (plan.safety !== "complete") { status.textContent = plan.reason; return; }
      const accepted = await anchoredConfirmation({
        document: context.document, anchor, question: plan.reason,
        actions: [{ label: CONTRACT_COPY.useContractEverywhere, value: true }, { label: INSPECTOR_COPY.cancel, value: false }],
        datasetKey: "tuningContractConfirmation"
      });
      if (!accepted) return;
      const result = await context.services.references.applyUseContractValue(plan);
      if (!result.applied) status.textContent = result.reason;
    });
    const keep = button(context.document, CONTRACT_COPY.keepBoth, () => keepBothNumbers(context, warning));
    const later = button(context.document, CONTRACT_COPY.later, () => {
      dismissed.add(identity);
      box.remove();
      if (!section.querySelector("[data-same-number-warning]")) section.remove();
    });
    actions.append(use, keep, later);
    box.append(actions, status);
    section.append(box);
  }
  return section;
}

export function tuningValueSections(context, entity, { dismissed = new Set(), ruleTools, rangePlanner } = {}) {
  const dependencies = tuningValueDependencies(context, entity.id, ruleTools);
  return [rangeSection(context, entity, rangePlanner), ruleListSection(context, entity, dependencies),
    questionSection(context, entity, dependencies), timingSection(context, entity, dependencies),
    contractSection(context, entity, dependencies), citationSection(context, entity, dependencies),
    sameNumberSection(context, entity, dismissed)].filter(Boolean);
}

const decodeJsonString = source => {
  try { return JSON.parse(source); } catch { return undefined; }
};

const pointerToken = source => source.replaceAll("~1", "/").replaceAll("~0", "~");

function tuningValueSubject(message) {
  let match = /^(?:values|ranges)\s+key\s+("(?:\\.|[^"\\])*")/u.exec(message);
  if (match) return decodeJsonString(match[1]);
  match = /^(?:values|ranges)\.([A-Za-z0-9_.-]+)(?=$|[\s"'`:;=,\[\](){}])/u.exec(message);
  if (match) return match[1];
  match = /^#\/(?:values|ranges)\/([^/\s]+)/u.exec(message);
  return match ? pointerToken(match[1]) : undefined;
}

function tuningRuleSubject(message) {
  let match = /^rule(?:\s+name)?\s+("(?:\\.|[^"\\])*")/u.exec(message);
  if (match) return decodeJsonString(match[1]);
  match = /^#\/rules\/([^/\s]+)/u.exec(message);
  return match ? pointerToken(match[1]) : undefined;
}

export function routeTuningValueFinding(finding, entity) {
  const message = String(finding?.message ?? "");
  if (finding.code === "TUNING_RULE_FAILED") {
    const rule = /^rule\s+"([^"]+)"/u.exec(message)?.[1];
    return rule && entity.ruleNames?.includes(rule) ? `rule-${rule}` : false;
  }
  const subject = tuningValueSubject(message);
  if (subject !== undefined && subject !== entity.id) return false;
  if (subject === entity.id && finding.code === "TUNING_NUMBER") return "value";
  if (subject === entity.id && finding.code === "TUNING_RANGE_VALUE") {
    if (Array.isArray(entity.bounds) && entity.bounds.length === 2) {
      if (entity.value < entity.bounds[0]) return "range-minimum";
      if (entity.value > entity.bounds[1]) return "range-maximum";
    }
    return "value";
  }
  if (subject === entity.id && finding.code === "TUNING_RANGE") return "range-minimum";
  if (subject === entity.id && finding.code === "TUNING_SCHEMA") {
    const escaped = entity.id.replaceAll("~", "~0").replaceAll("/", "~1");
    if (message.includes(`/ranges/${escaped}/1`)) return "range-maximum";
    if (message.includes("/ranges/")) return "range-minimum";
    if (message.includes("/values/")) return "value";
  }
  return subject === entity.id ? "header" : null;
}

export function tuningRuleFields(_context, entity, ruleTools) {
  const { parseRule } = ruleTools;
  return [{
    key: "line", label: INSPECTOR_COPY.tuningRuleLine, help: INSPECTOR_COPY.tuningRuleLineHelp,
    type: "text", monospace: true, required: true,
    binding: { file: "tuning.json", pointer: pointer(["rules", entity.id]) },
    labels: { change: INSPECTOR_COPY.changeTuningRule },
    parse(value) {
      try { parseRule(value); return value; }
      catch (error) { throw new Error(error.message); }
    },
    validate(value) {
      try { parseRule(value); return ""; }
      catch (error) { return error.message; }
    }
  }];
}

export function tuningRuleSections(context, entity) {
  const rows = entity.ruleState.keys.length ? [entityChips(context, entity.ruleState.keys.map(key => ({
    name: key, kind: INSPECTOR_COPY.tuningValueKind, detail: String(entity.values.get(key)),
    selection: (() => { let range; try { range = pointerRange(context.package.read("tuning.json"), pointer(["values", key])); } catch {}
      return { kind: "value", name: key, file: "tuning.json", range }; })()
  })))] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningRuleReads,
    help: entity.ruleState.keys.length ? INSPECTOR_COPY.tuningRuleReadsHelp : INSPECTOR_COPY.tuningRuleReadsNone, rows });
  section.classList.add("opengdd-author-tuning-rule-values");
  section.dataset.tuningRuleValues = entity.id;
  return [section];
}

export function routeTuningRuleFinding(finding, entity) {
  const message = String(finding.message ?? "");
  const subject = tuningRuleSubject(message);
  if (subject !== undefined && subject !== entity.id) return false;
  if (subject === entity.id && ["TUNING_RULE_INVALID", "TUNING_RULE_FAILED"].includes(finding.code)) return "line";
  return subject === entity.id ? "header" : null;
}

export function tuningMechanismFields() {
  return [];
}

function tuningRuleList(context, tuning, text, ruleTools) {
  const document = context.document;
  const entries = Object.entries(plainObject(tuning?.rules) ? tuning.rules : {});
  const values = new Map(Object.entries(plainObject(tuning?.values) ? tuning.values : {}));
  const rows = entries.length ? [entityChips(context, entries.map(([name, source]) => {
    const state = tuningRuleState(source, values, ruleTools);
    let range;
    try { range = pointerRange(text, pointer(["rules", name])); } catch {}
    return { name, kind: INSPECTOR_COPY.tuningRuleKind, detail: state.verdict,
      dataset: { tuningRule: name }, selection: { kind: "rule", name, file: "tuning.json", range } };
  }))] : [];
  const section = referenceGroup(context, { label: INSPECTOR_COPY.tuningRules,
    help: entries.length ? INSPECTOR_COPY.tuningRulesHelp : INSPECTOR_COPY.tuningNoRules, rows });
  section.dataset.tuningRules = "";
  return section;
}

export function tuningMechanismSections(context, _entity, ruleTools) {
  const text = context.package.read("tuning.json");
  const tuning = parseJson(text);
  const values = plainObject(tuning?.values) ? Object.entries(tuning.values) : [];
  const ranges = plainObject(tuning?.ranges) ? tuning.ranges : {};
  const rows = values.length ? [entityChips(context, values.map(([key, value]) => {
    let range;
    try { range = pointerRange(text, pointer(["values", key])); } catch {}
    const bounds = Array.isArray(ranges[key]) && ranges[key].length === 2 ? ranges[key] : undefined;
    return { name: key, kind: INSPECTOR_COPY.tuningValueKind,
      detail: INSPECTOR_COPY.tuningValueDetail(value, bounds), dataset: { tuningValue: key },
      selection: { kind: "value", name: key, file: "tuning.json", range } };
  }))] : [];
  const valueList = referenceGroup(context, { label: INSPECTOR_COPY.tuningValues,
    help: INSPECTOR_COPY.tuningValuesHelp, rows });
  valueList.dataset.tuningValues = "";
  return [valueList, tuningRuleList(context, tuning, text, ruleTools)];
}
