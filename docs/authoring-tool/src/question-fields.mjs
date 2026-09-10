import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { anchoredConfirmation, element } from "./dom.mjs";
import { parseJson, plainObject, pointer } from "./json-path.mjs";
import { pointerAtLine, pointerRange } from "./json-pointer-lines.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";
import { planQuestionOptionRename } from "./references.mjs";
import { rangedTuningKeys } from "./tuning-fields.mjs";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PERSONALIZATION_FILE = "personalization.json";
const candidateOptions = values => values.map(value => ({
  value, label: value, group: INSPECTOR_COPY.questionRangedCandidates
}));

const documentFrom = context => parseJson(context.package.read(PERSONALIZATION_FILE));
const questionsFrom = context => Array.isArray(documentFrom(context)?.questions)
  ? documentFrom(context).questions : [];

const commitJson = async (context, label, apply) => {
  const transaction = context.internal.begin(label);
  apply(transaction.json(PERSONALIZATION_FILE));
  await transaction.commit();
};

const freeId = (values, base) => {
  const used = new Set(values);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

const questionAt = (context, entity) => questionsFrom(context)[entity.index];

export function questionKeys(question) {
  const keys = [];
  if (typeof question?.sets === "string") keys.push(question.sets);
  for (const option of Array.isArray(question?.options) ? question.options : []) {
    for (const key of Object.keys(plainObject(option?.sets) ? option.sets : {})) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

const actionBox = (context, { label, help, dataset, run }) => {
  const box = element(context.document, "div", undefined, "opengdd-author-question-action");
  const description = element(context.document, "p", help, "opengdd-author-form-help");
  description.id = `opengdd-question-${dataset}-help`;
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

export async function changeQuestionType(context, entity, next, anchor, confirm = anchoredConfirmation) {
  const question = questionAt(context, entity);
  if (!question || question.type === next) return false;
  const forbidden = [];
  if (next !== "choice" && Object.hasOwn(question, "options")) {
    forbidden.push({ pointer: `${entity.pointer}/options`, label: INSPECTOR_COPY.questionTypeOptionsMember });
  }
  if (next !== "number" && Object.hasOwn(question, "sets")) {
    forbidden.push({ pointer: `${entity.pointer}/sets`, label: INSPECTOR_COPY.questionTypeSetsMember });
  }
  if (forbidden.length) {
    const accepted = await confirm({
      document: context.document,
      anchor,
      question: INSPECTOR_COPY.questionTypeConfirmation(forbidden.map(item => item.label)),
      actions: [
        { label: INSPECTOR_COPY.questionTypeChange, value: true },
        { label: INSPECTOR_COPY.cancel, value: false }
      ],
      datasetKey: "questionTypeConfirmation"
    });
    if (!accepted) return false;
  }
  await commitJson(context, INSPECTOR_COPY.questionTypeChange, json => {
    json.set(`${entity.pointer}/type`, next);
    for (const item of forbidden) json.remove(item.pointer);
  });
  context.internal.focusField?.(PERSONALIZATION_FILE, "type");
  return true;
}

export async function addQuestionOption(context, entity) {
  const question = questionAt(context, entity);
  if (!Array.isArray(question?.options) && question?.options !== undefined) {
    throw new Error(INSPECTOR_COPY.questionOptionsUnreadable);
  }
  const options = Array.isArray(question?.options) ? question.options : [];
  const id = freeId(options.map(option => option?.id).filter(value => typeof value === "string"), "new-option");
  const value = { id, label: "" };
  await commitJson(context, INSPECTOR_COPY.addQuestionOptionUndo, json => {
    if (Array.isArray(question?.options)) json.insert(`${entity.pointer}/options`, "-", value, { pretty: true });
    else json.insert(entity.pointer, "options", [value], { pretty: true });
  });
  context.internal.focusField?.(PERSONALIZATION_FILE, `option-${options.length}-label`);
  return id;
}

export async function removeQuestionOption(context, entity, index) {
  const options = Array.isArray(questionAt(context, entity)?.options) ? questionAt(context, entity).options : [];
  if (index < 0 || index >= options.length) return false;
  await commitJson(context, INSPECTOR_COPY.removeQuestionOptionUndo,
    json => json.remove(`${entity.pointer}/options/${index}`));
  if (options.length > 1) context.internal.focusField?.(
    PERSONALIZATION_FILE, `option-${Math.min(index, options.length - 2)}-label`);
  return true;
}

export async function moveQuestionOption(context, entity, index, next) {
  const options = Array.isArray(questionAt(context, entity)?.options) ? questionAt(context, entity).options : [];
  if (index < 0 || index >= options.length || next < 0 || next >= options.length || index === next) return false;
  const value = options[index];
  await commitJson(context, INSPECTOR_COPY.moveQuestionOptionUndo, json => {
    json.remove(`${entity.pointer}/options/${index}`);
    json.insert(`${entity.pointer}/options`, next, value, { pretty: true });
  });
  context.internal.focusField?.(PERSONALIZATION_FILE, `option-${next}-label`);
  return true;
}

export async function addQuestionOptionSet(context, entity, optionIndex) {
  const option = questionAt(context, entity)?.options?.[optionIndex];
  if (!plainObject(option?.sets) && option?.sets !== undefined) throw new Error(INSPECTOR_COPY.questionSetsUnreadable);
  const sets = plainObject(option?.sets) ? option.sets : {};
  const key = rangedTuningKeys(context.package).find(candidate => !Object.hasOwn(sets, candidate));
  if (!key) throw new Error(INSPECTOR_COPY.noQuestionSetCandidate);
  const tuning = parseJson(context.package.read("tuning.json"));
  const value = typeof tuning?.values?.[key] === "number" ? tuning.values[key] : 0;
  const base = `${entity.pointer}/options/${optionIndex}`;
  await commitJson(context, INSPECTOR_COPY.addQuestionSetUndo, json => {
    if (plainObject(option?.sets)) json.insert(`${base}/sets`, key, value);
    else json.insert(base, "sets", { [key]: value }, { pretty: true });
  });
  const next = Object.keys(sets).length;
  context.internal.focusField?.(PERSONALIZATION_FILE, `option-${optionIndex}-sets-${next}-key`);
  return key;
}

export async function removeQuestionOptionSet(context, entity, optionIndex, key) {
  const sets = questionAt(context, entity)?.options?.[optionIndex]?.sets;
  if (!plainObject(sets) || !Object.hasOwn(sets, key)) return false;
  const base = `${entity.pointer}/options/${optionIndex}/sets`;
  await commitJson(context, INSPECTOR_COPY.removeQuestionSetUndo,
    json => json.remove(Object.keys(sets).length === 1 ? base : `${base}/${pointer([key]).slice(1)}`));
  return true;
}

const optionActions = (context, entity, index, count, id) => ({ document, box }) => {
  const actions = element(document, "div", undefined, "opengdd-author-question-row-actions");
  const add = (label, aria, dataset, run, disabled = false) => {
    const button = element(document, "button", label);
    button.type = "button";
    button.setAttribute("aria-label", aria);
    button.dataset[dataset] = String(index);
    button.disabled = disabled;
    button.addEventListener("click", () => Promise.resolve(run()).catch(error => { button.title = error.message; }));
    actions.append(button);
  };
  add(INSPECTOR_COPY.listMoveUp, INSPECTOR_COPY.listMoveUpLabel(id), "questionOptionMoveUp",
    () => moveQuestionOption(context, entity, index, index - 1), index === 0);
  add(INSPECTOR_COPY.listMoveDown, INSPECTOR_COPY.listMoveDownLabel(id), "questionOptionMoveDown",
    () => moveQuestionOption(context, entity, index, index + 1), index === count - 1);
  add(INSPECTOR_COPY.listRemove, INSPECTOR_COPY.listRemoveLabel(id), "questionOptionRemove",
    () => removeQuestionOption(context, entity, index));
  box.append(actions);
};

const setRemoveMount = (context, entity, optionIndex, key) => ({ document, box }) => {
  const button = element(document, "button", INSPECTOR_COPY.listRemove);
  button.type = "button";
  button.dataset.questionSetRemove = key;
  button.setAttribute("aria-label", INSPECTOR_COPY.listRemoveLabel(key));
  button.addEventListener("click", () => Promise.resolve(removeQuestionOptionSet(context, entity, optionIndex, key))
    .catch(error => { button.title = error.message; }));
  box.append(button);
};

const optionFields = (context, entity, option, optionIndex, count) => {
  const base = `${entity.pointer}/options/${optionIndex}`;
  const id = typeof option?.id === "string" ? option.id : `option-${optionIndex + 1}`;
  const row = `option-${optionIndex}`;
  const mounted = {};
  const fields = [{
    key: `${row}-id`, row, rowLabel: INSPECTOR_COPY.questionOptionRow(optionIndex, id),
    label: INSPECTOR_COPY.questionOptionId, ariaLabel: `${INSPECTOR_COPY.questionOptionId} ${optionIndex + 1}`,
    help: INSPECTOR_COPY.questionOptionIdHelp, helpShared: "question-option-id", type: "text",
    required: true, commitOnBlur: true, commitOnRowExit: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${base}/id` },
    labels: { change: INSPECTOR_COPY.renameQuestionOptionUndo },
    validate: value => KEBAB.test(value) ? "" : INSPECTOR_COPY.questionOptionIdInvalid,
    async write(next) {
      const plan = planQuestionOptionRename(context.package, entity.id, option.id, String(next).trim(), {
        questionIndex: entity.index, optionIndex
      });
      if (plan.safety !== "complete") throw new Error(plan.reason);
      await commitJson(context, INSPECTOR_COPY.renameQuestionOptionUndo, json => {
        for (const operation of plan.operations) json.set(operation.pointer, operation.value);
      });
    },
    mount({ control }) { mounted.control = control; }
  }, {
    key: `${row}-label`, row, rowLabel: INSPECTOR_COPY.questionOptionRow(optionIndex, id),
    label: INSPECTOR_COPY.questionOptionLabel, ariaLabel: `${INSPECTOR_COPY.questionOptionLabel} ${optionIndex + 1}`,
    help: INSPECTOR_COPY.questionOptionLabelHelp, helpShared: "question-option-label", type: "text",
    required: true, commitOnBlur: true, commitOnRowExit: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${base}/label` },
    labels: { change: INSPECTOR_COPY.changeQuestionOption },
    mount: optionActions(context, entity, optionIndex, count, id)
  }, {
    key: `${row}-notes`, row, rowLabel: INSPECTOR_COPY.questionOptionRow(optionIndex, id),
    label: INSPECTOR_COPY.questionOptionNotes, ariaLabel: `${INSPECTOR_COPY.questionOptionNotes} ${optionIndex + 1}`,
    help: INSPECTOR_COPY.questionOptionNotesHelp, helpShared: "question-option-notes", type: "text",
    commitOnBlur: true, commitOnRowExit: true, clearRemoves: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${base}/notes` },
    labels: { change: INSPECTOR_COPY.changeQuestionOption, clear: INSPECTOR_COPY.changeQuestionOption }
  }];
  const sets = plainObject(option?.sets) ? Object.entries(option.sets) : [];
  const ranged = rangedTuningKeys(context.package);
  for (const [setIndex, [key]] of sets.entries()) {
    const setRow = `${row}-sets-${setIndex}`;
    const candidates = ranged.filter(candidate => candidate === key || !Object.hasOwn(option.sets, candidate));
    fields.push({
      key: `${setRow}-key`, row: setRow, rowLabel: INSPECTOR_COPY.questionSetRow(id, key),
      label: INSPECTOR_COPY.questionOptionSetKey, ariaLabel: `${INSPECTOR_COPY.questionOptionSetKey} ${key}`,
      help: INSPECTOR_COPY.questionOptionSetKeyHelp, helpShared: "question-set-key", type: "reference", required: true,
      binding: { file: PERSONALIZATION_FILE, pointer: `${base}/sets/${pointer([key]).slice(1)}` },
      read: () => key,
      options: { candidates: candidateOptions(candidates), allowFree: false },
      labels: { change: INSPECTOR_COPY.changeQuestionSet },
      async write(next) {
        if (next === key) return;
        await commitJson(context, INSPECTOR_COPY.changeQuestionSet,
          json => json.renameKey(`${base}/sets/${pointer([key]).slice(1)}`, next));
      }
    }, {
      key: `${setRow}-value`, row: setRow, rowLabel: INSPECTOR_COPY.questionSetRow(id, key),
      label: INSPECTOR_COPY.questionOptionSetValue, ariaLabel: `${INSPECTOR_COPY.questionOptionSetValue} ${key}`,
      help: INSPECTOR_COPY.questionOptionSetValueHelp, helpShared: "question-set-value", type: "number", required: true,
      binding: { file: PERSONALIZATION_FILE, pointer: `${base}/sets/${pointer([key]).slice(1)}` },
      labels: { change: INSPECTOR_COPY.changeQuestionSet },
      mount: setRemoveMount(context, entity, optionIndex, key)
    });
  }
  return fields;
};

const group = (context, key, title, help, fields, after) => {
  if (!title) {
    const section = element(context.document, "section", undefined, "opengdd-author-question-group");
    section.dataset.questionGroup = key;
    return { key, element: section, fields, after };
  }
  const section = referenceGroup(context, { key, label: title, help, rows: [], empty: fields.length === 0,
    count: fields.length });
  section.classList.add("opengdd-author-question-group");
  section.dataset.questionGroup = key;
  section.tabIndex = -1;
  return { key, element: section, fields, after };
};

export function questionFieldGroups(context, entity) {
  const question = questionAt(context, entity) ?? entity.value;
  const typeControl = {};
  const fields = [{
    key: "prompt", label: INSPECTOR_COPY.questionPrompt, help: INSPECTOR_COPY.questionPromptHelp,
    type: "longtext", required: true, commitOnBlur: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/prompt` },
    labels: { change: INSPECTOR_COPY.changeQuestion }
  }, {
    key: "type", label: INSPECTOR_COPY.questionType, help: INSPECTOR_COPY.questionTypeHelp,
    type: "enum", required: true, options: ["choice", "text", "number"],
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/type` },
    labels: { change: INSPECTOR_COPY.questionTypeChange },
    write: next => changeQuestionType(context, entity, next, typeControl.control),
    mount({ control }) { typeControl.control = control; }
  }];
  if (question?.type === "choice") fields.push({
    key: "default", label: INSPECTOR_COPY.questionDefault, help: INSPECTOR_COPY.questionDefaultHelp,
    type: "reference", clearRemoves: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/default` },
    options: { candidates: (Array.isArray(question.options) ? question.options : []).flatMap(option =>
      typeof option?.id === "string" ? [{ value: option.id, label: option.id, group: INSPECTOR_COPY.questionChoiceCandidates }] : []), allowFree: false },
    labels: { change: INSPECTOR_COPY.changeQuestion, clear: INSPECTOR_COPY.changeQuestion }
  });
  else fields.push({
    key: "default", label: INSPECTOR_COPY.questionDefault, help: INSPECTOR_COPY.questionDefaultHelp,
    type: question?.type === "number" ? "number" : "text", clearRemoves: true, commitOnBlur: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/default` },
    labels: { change: INSPECTOR_COPY.changeQuestion, clear: INSPECTOR_COPY.changeQuestion }
  });
  fields.push({
    key: "notes", label: INSPECTOR_COPY.questionNotes, help: INSPECTOR_COPY.questionNotesHelp,
    type: "longtext", commitOnBlur: true, clearRemoves: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/notes` },
    labels: { change: INSPECTOR_COPY.changeQuestion, clear: INSPECTOR_COPY.changeQuestion }
  });
  if (question?.type === "number" || Object.hasOwn(question ?? {}, "sets")) fields.push({
    key: "sets", label: INSPECTOR_COPY.questionNumberTarget, help: INSPECTOR_COPY.questionNumberTargetHelp,
    type: "reference", clearRemoves: true,
    binding: { file: PERSONALIZATION_FILE, pointer: `${entity.pointer}/sets` },
    options: { candidates: candidateOptions(rangedTuningKeys(context.package)), allowFree: false },
    labels: { change: INSPECTOR_COPY.changeQuestion, clear: INSPECTOR_COPY.changeQuestion },
    status(value) {
      const range = parseJson(context.package.read("tuning.json"))?.ranges?.[value];
      return Array.isArray(range) && range.length === 2 ? INSPECTOR_COPY.questionRangeStatus(range[0], range[1]) : "";
    }
  });
  const groups = [group(context, "question", undefined, undefined, fields)];
  if (question?.type === "choice") {
    const options = Array.isArray(question.options) ? question.options : [];
    const optionDescriptors = options.flatMap((option, index) => optionFields(context, entity, option, index, options.length));
    const after = element(context.document, "div");
    after.append(actionBox(context, { label: INSPECTOR_COPY.addQuestionOption,
      help: INSPECTOR_COPY.addQuestionOptionHelp, dataset: "addQuestionOption",
      run: () => addQuestionOption(context, entity) }));
    for (const [index, option] of options.entries()) after.append(actionBox(context, {
      label: INSPECTOR_COPY.addQuestionSet,
      help: INSPECTOR_COPY.addQuestionSetHelp,
      dataset: `addQuestionSet${index}`,
      run: () => addQuestionOptionSet(context, entity, index)
    }));
    groups.push(group(context, "options", INSPECTOR_COPY.questionOptions,
      INSPECTOR_COPY.questionOptionsHelp, optionDescriptors, after));
  }
  return groups;
}

export function questionFields(context, entity) {
  return questionFieldGroups(context, entity).flatMap(item => item.fields);
}

export function questionSections(context, entity) {
  const keys = questionKeys(entity.value);
  const tuningRows = keys.length ? [entityChips(context, keys.map(key => {
    let range;
    try { range = pointerRange(context.package.read("tuning.json"), pointer(["values", key])); } catch {}
    return { name: key, kind: INSPECTOR_COPY.tuningValueKind,
      selection: { kind: "value", name: key, file: "tuning.json", range } };
  }))] : [];
  const tuning = referenceGroup(context, { label: INSPECTOR_COPY.questionTuningKeys,
    help: keys.length ? INSPECTOR_COPY.questionTuningKeysHelp : INSPECTOR_COPY.questionNoTuningKeys,
    rows: tuningRows });
  tuning.dataset.questionTuningKeys = entity.id;
  const sites = context.services.references.usages(entity.id).filter(site => site.channel === "prose");
  const citations = referenceGroup(context, { label: INSPECTOR_COPY.questionCitations,
    help: sites.length ? INSPECTOR_COPY.questionCitationsHelp : INSPECTOR_COPY.questionNoCitations,
    rows: sites.length ? [locationRows(context, sites, { reveal: site => context.internal.revealLocation(site) })] : [] });
  citations.dataset.questionCitations = entity.id;
  return [tuning, citations];
}

const pointerParts = value => String(value ?? "").split("/").slice(1)
  .map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"));
const findingPointer = (finding, entity) => {
  const named = /#?(\/questions\/\d+(?:\/[A-Za-z0-9_.~-]+)*)/u.exec(String(finding?.message ?? ""))?.[1];
  if (named) return named;
  if (finding.file !== entity.file || !Number.isInteger(finding.line)) return undefined;
  try { return pointerAtLine(entity.text, finding.line); } catch { return undefined; }
};

export function routeQuestionFinding(finding, entity) {
  if (finding.code === "PERSONALIZATION_JSON") return false;
  if (["PERSONALIZATION_TAG_DANGLING", "PERSONALIZATION"].includes(finding.code)) return "header";
  if (!String(finding.code ?? "").startsWith("PERSONALIZATION_")) return false;
  if (finding.code === "PERSONALIZATION_SETS_TYPE"
    && String(finding.message ?? "").includes(`question \`${entity.id}\``)) return "sets";
  const at = findingPointer(finding, entity);
  const parts = pointerParts(at);
  if (parts[0] !== "questions" || Number(parts[1]) !== entity.index) return at ? false : "header";
  if (finding.code === "PERSONALIZATION_QUESTION_ID") return "header";
  if (finding.code === "PERSONALIZATION_DEFAULT_OPTION") return "default";
  if (["PERSONALIZATION_SETS_TARGET", "PERSONALIZATION_SETS_RANGE", "PERSONALIZATION_SETS_TYPE", "PERSONALIZATION_SETS_UNRANGED"].includes(finding.code)) {
    if (parts[2] === "sets") return "sets";
    if (parts[2] === "options" && /^\d+$/u.test(parts[3] ?? "") && parts[4] === "sets") {
      const optionIndex = Number(parts[3]);
      const keys = Object.keys(plainObject(entity.value?.options?.[optionIndex]?.sets) ? entity.value.options[optionIndex].sets : {});
      const key = parts[5];
      const setIndex = keys.indexOf(key);
      return setIndex >= 0 ? `option-${optionIndex}-sets-${setIndex}-key` : `option-${optionIndex}-label`;
    }
  }
  if (finding.code === "PERSONALIZATION_OPTION_ID" && parts[2] === "options" && /^\d+$/u.test(parts[3] ?? "")) {
    return `option-${parts[3]}-id`;
  }
  if (finding.code === "PERSONALIZATION_SCHEMA") {
    const missing = /is missing required property "([^"]+)"/u.exec(String(finding.message ?? ""))?.[1];
    const member = parts[2] ?? missing;
    if (["prompt", "type", "default", "notes", "sets"].includes(member)) return member;
    if (member === "options" && parts.length <= 3) return "options";
    if (parts[2] === "options" && /^\d+$/u.test(parts[3] ?? "")) {
      const field = parts[4] ?? missing;
      if (["id", "label", "notes"].includes(field)) return `option-${parts[3]}-${field}`;
      if (field === "sets") {
        const optionIndex = Number(parts[3]);
        const keys = Object.keys(plainObject(entity.value?.options?.[optionIndex]?.sets)
          ? entity.value.options[optionIndex].sets : {});
        const setIndex = keys.indexOf(parts[5]);
        return setIndex >= 0 ? `option-${optionIndex}-sets-${setIndex}-value` : `option-${parts[3]}-label`;
      }
    }
  }
  return "header";
}
