// Host-supplied prepared starting points. These are editor instructions,
// not new fields in the OpenGDD format. All writes use ordinary package data.
import { extractContractDefinition, prepareContractAddition } from './contracts.mjs';
import { parseJson, pointerSegment } from './json-path.mjs';
import { contractAdoptionActivation, contractRowWhenSatisfied } from './contract-worksheet.mjs';
import { offsetToPosition } from './text-coordinates.mjs';

export const at = (object, parts) => parts.reduce((value, key) => value?.[key], object);
export function put(object, parts, value) {
  let target = object;
  for (const key of parts.slice(0, -1)) target = target[key] ??= {};
  target[parts.at(-1)] = value;
}
export function settingActive(adoption, setting) {
  const condition = setting.parts[0] === 'values' ? adoption.declares?.values?.[setting.parts[1]]?.when : setting.when;
  const activation = contractAdoptionActivation(adoption);
  if (setting.parts[0] === 'values') return activation.activeValues.has(setting.parts[1]);
  return contractRowWhenSatisfied(condition, adoption.answers ?? {}, activation.asked, undefined, activation.facts);
}
export function matchesPreparedAdoption(adoption, files, recipe) {
  const expected = extractContractDefinition(recipe.definitionText).value;
  return adoption?.contract === expected.contract && adoption?.version === expected.version
    && (!recipe.matches || Boolean(recipe.matches(adoption, files)));
}
export function matchingPreparedFiles(files, recipe) {
  return [...files].filter(([file, text]) => {
    if (!/^contracts\/[^/]+\.json$/.test(file) || file.endsWith('.pack.json')) return false;
    return matchesPreparedAdoption(parseJson(text), files, recipe);
  }).map(([file]) => file);
}

export function preparedSettings(recipe, adoption, contentRows = {}) {
  return typeof recipe.settings === 'function' ? recipe.settings(adoption, contentRows) : recipe.settings ?? [];
}

export function preparedSettingValue(adoption, contentRows, setting) {
  return setting.parts[0] === 'contentRows' ? at(contentRows, setting.parts.slice(1)) : at(adoption, setting.parts);
}

// Trusted presentation only. Option identities, conditions and saved source
// always come from the adoption; this cannot add or remove an answer.
export function preparedQuestionCopy(recipe, adoption, id) {
  const source = adoption.questions[id], copy = recipe.questionCopy?.[id] ?? {};
  const wording = (candidate, fallback) => typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
  return {
    ...source,
    asks: wording(copy.asks, source.asks), rationale: wording(copy.rationale, source.rationale),
    options: Object.fromEntries(Object.entries(source.options).map(([key, option]) => [key, {
      ...option, meaning: wording(copy.options?.[key], option.meaning)
    }]))
  };
}

export function syncPreparedChoices(files, recipe, draft) {
  const tuning = parseJson(files.get('tuning.json'));
  if (!tuning?.values) throw new Error('Open a specification with tuning values first.');
  const defaults = parseJson(recipe.definitionText);
  // Inactive answers may be absent from a saved adoption. Keep the prepared
  // defaults in the draft so enabling their parent restores a reviewed choice.
  for (const [id, answer] of Object.entries(defaults.answers ?? {})) {
    const question = draft.adoption.questions?.[id];
    if (question?.when && !Object.hasOwn(draft.adoption.answers, id) && Object.hasOwn(question.options ?? {}, answer)) {
      draft.adoption.answers[id] = answer;
    }
  }
  draft.contentRows ??= structuredClone(recipe.readRows?.(files, draft.adoption, draft.name) ?? {});
  const defaultRows = recipe.readRows?.(files, defaults, draft.name) ?? {};
  const defaultSettings = new Map(preparedSettings(recipe, defaults, defaultRows).map(setting => [setting.id, setting]));
  const settings = preparedSettings(recipe, draft.adoption, draft.contentRows);
  const currentIds = new Set(settings.map(setting => setting.id));
  draft.choices ??= {};
  for (const id of Object.keys(draft.choices)) if (!currentIds.has(id)) delete draft.choices[id];
  for (const setting of settings) {
    if (Object.hasOwn(draft.choices, setting.id)) continue;
    const fallback = defaultSettings.get(setting.id);
    const key = preparedSettingValue(draft.adoption, draft.contentRows, setting)
      ?? (fallback ? preparedSettingValue(defaults, defaultRows, fallback) : undefined) ?? setting.defaultKey;
    draft.choices[setting.id] = { key, mode: Object.hasOwn(tuning.values, key) ? 'link' : 'create',
      value: tuning.values[key] ?? recipe.tuning?.values?.[key] ?? setting.defaultValue };
  }
  const contentIds = new Set((recipe.list ? draft.adoption.rows[recipe.list.key] : []).flatMap(row =>
    recipe.list.fields.filter(field => field.content).map(field => `${row.id}-${field.key}`)));
  draft.content ??= {};
  for (const id of Object.keys(draft.content)) if (!contentIds.has(id)) delete draft.content[id];
  const missingContent = [...contentIds].filter(id => !Object.hasOwn(draft.content, id));
  if (missingContent.length) {
    const content = recipe.readContent?.(files, draft.adoption, draft.name) ?? {};
    for (const id of missingContent) draft.content[id] = content[id] ?? '';
  }
  return draft;
}

export function createPreparedDraft(files, recipe, file) {
  const adoption = structuredClone(parseJson(file ? files.get(file) : recipe.definitionText));
  if (!adoption?.answers || !adoption?.values) throw new Error('This starting point needs prepared answers and settings.');
  return syncPreparedChoices(files, recipe, { file, name: file ? file.slice(10, -5) : recipe.name, adoption, choices: {} });
}

// Build against a snapshot and keep existing tuning keys, prose, ranges, and
// unrelated rules. A host supplies only its own support-data reconciliation.
export function prepareStartingPoint(files, recipe, draft) {
  const adoption = structuredClone(draft.adoption);
  const contentRows = structuredClone(draft.contentRows ?? {});
  const asked = contractAdoptionActivation(adoption).asked;
  for (const id of Object.keys(adoption.answers)) {
    if (adoption.questions?.[id]?.when && !asked.has(id)) delete adoption.answers[id];
  }
  const previous = draft.file ? parseJson(files.get(draft.file)) : undefined;
  const addition = prepareContractAddition({ files: draft.file ? new Map([...files].filter(([p]) => p !== draft.file)) : files,
    definitionText: recipe.definitionText, packText: recipe.packText, name: draft.name });
  if (!addition.ok) throw new Error(addition.reason);
  if (draft.file && addition.path !== draft.file) throw new Error('Rename this adoption through the ordinary rename tool.');
  const expected = extractContractDefinition(recipe.definitionText).value;
  if (JSON.stringify(extractContractDefinition(JSON.stringify(adoption)).value) !== JSON.stringify(expected)
    || JSON.stringify(addition.definition) !== JSON.stringify(expected)) {
    throw new Error('This contract has changed. Review its definition before using this starting point.');
  }
  const originalTuning = parseJson(files.get('tuning.json'));
  const tuning = structuredClone(originalTuning);
  const assigned = new Map();
  const changes = [];
  for (const setting of preparedSettings(recipe, adoption, contentRows)) {
    if (!settingActive(adoption, setting)) {
      if (setting.parts[0] === 'values') delete adoption.values[setting.parts[1]];
      continue;
    }
    const choice = draft.choices[setting.id];
    const key = choice?.key?.trim();
    if (!key || !Number.isFinite(choice.value)) throw new Error(`Choose a tuning value and a number for ${setting.label}.`);
    const exists = Object.hasOwn(originalTuning.values, key);
    if (choice.mode === 'link' && (!exists || typeof originalTuning.values[key] !== 'number')) throw new Error(`Choose an existing numeric tuning value for ${setting.label}.`);
    if (choice.mode === 'create' && exists) throw new Error(`${key} already exists. Link it or choose another name.`);
    if (assigned.has(key) && assigned.get(key) !== choice.value) throw new Error(`${key} is shared by settings with different numbers. Give them the same number or separate sources.`);
    assigned.set(key, choice.value);
    tuning.values[key] = choice.value;
    if (setting.parts[0] === 'contentRows') put(contentRows, setting.parts.slice(1), key);
    else put(adoption, setting.parts, key);
    changes.push({ label: setting.label, key, mode: choice.mode, value: choice.value });
  }
  const content = structuredClone(draft.content ?? {});
  const support = recipe.support?.({ files, adoption, previous, tuning, name: draft.name, content, contentRows });
  return { path: addition.path, adoption, tuning, originalTuning, previous, pack: addition.pack, changes, support, content, contentRows };
}

function stageMap(transaction, path, before, after, member) {
  const next = after[member];
  if (next === undefined) {
    if (member === 'rules' && Object.hasOwn(before, member)) transaction.json(path).remove('/rules');
    return;
  }
  if (!Object.hasOwn(before, member)) { transaction.json(path).insert('', member, next, { pretty: true }); return; }
  if (member === 'rules') for (const key of Object.keys(before[member])) {
    if (!Object.hasOwn(next, key)) transaction.json(path).remove(`/rules/${pointerSegment(key)}`);
  }
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(before[member]?.[key]) === JSON.stringify(value)) continue;
    if (Object.hasOwn(before[member], key)) transaction.json(path).set(`/${member}/${pointerSegment(key)}`, value);
    else transaction.json(path).insert(`/${member}`, key, value, { pretty: true });
  }
}

export async function saveStartingPoint({ internal, files, recipe, draft, currentRevision, expectedRevision }) {
  const checkRevision = () => {
    if (currentRevision && currentRevision() !== expectedRevision) throw new Error('The specification changed during this review. Reopen it before saving.');
  };
  checkRevision();
  const plan = prepareStartingPoint(files, recipe, draft);
  const transaction = internal.begin(plan.previous ? `Change ${recipe.title}` : `Adopt ${recipe.title}`);
  try {
    if (!plan.previous) transaction.file(plan.path).create(`${JSON.stringify(plan.adoption, null, 2)}\n`);
    else {
      for (const member of ['answers', 'values', 'rows']) {
        if (JSON.stringify(plan.previous[member]) !== JSON.stringify(plan.adoption[member])) {
          transaction.json(plan.path).set(`/${member}`, plan.adoption[member]);
        }
      }
    }
    if (plan.pack?.create) transaction.file(plan.pack.path).create(plan.pack.value);
    for (const { file, before, text } of plan.support?.replace ?? []) {
      if (typeof before !== 'string' || files.get(file) !== before) throw new Error(`${file} changed during this review. Reopen it before saving.`);
      transaction.text(file).replace({ start: { line: 0, character: 0 }, end: offsetToPosition(before, before.length),
        revision: internal.revision(file) }, text);
    }
    for (const { file, text } of plan.support?.append ?? []) transaction.text(file).append(text);
    for (const member of ['values', 'ranges', 'rules']) stageMap(transaction, 'tuning.json', plan.originalTuning, plan.tuning, member);
    const staged = await internal.stage(transaction);
    checkRevision();
    if (staged.introduced.length) throw new Error(staged.introduced.map(f => f.message).join('\n'));
    await transaction.commit();
    return { ...plan, run: staged.run };
  } catch (error) { transaction.abort(); throw error; }
}
