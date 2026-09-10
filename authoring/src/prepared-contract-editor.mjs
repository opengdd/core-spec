import { element } from './dom.mjs';
import { parseJson } from './json-path.mjs';
import { contractQuestionLiveness } from './contract-worksheet.mjs';
import { createPreparedDraft, matchingPreparedFiles, preparedQuestionCopy, preparedSettings, preparedSettingValue, prepareStartingPoint, saveStartingPoint, settingActive, syncPreparedChoices } from './prepared-contract.mjs';

// Preserve a missing current target visibly until the designer changes it.
// Labels can change independently of the stable values stored in chapter rows.
export function preparedContentFieldChoices(field, draft, value) {
  const options = field.choices(draft).map(option => ({ ...option }));
  const current = value ?? '';
  if (!options.some(option => option.value === current)) options.push({ value: current, label: current });
  return options;
}

// An opt-in editor surface mounted by the tool, sharing its package, validation,
// persistence and undo. The host's recipe supplies game-specific reading copy.
export function mountPreparedContracts({ root, recipes, snapshot, internal, revision, subscribe, undo, packageInfo, previewReady = () => true }) {
  const document = root.ownerDocument;
  const launchers = element(document, 'div', undefined, 'opengdd-prepared-launchers');
  const dialog = element(document, 'dialog', undefined, 'opengdd-prepared');
  dialog.setAttribute('aria-label', 'Review a prepared contract');
  root.querySelector('.opengdd-author-loaders').append(launchers);
  root.append(dialog);
  let openingButton, busy = false, cancelPending;
  const button = (label, run, parent) => {
    const node = element(document, 'button', label); node.type = 'button';
    node.addEventListener('click', run); parent.append(node); return node;
  };
  function close() { if (busy) return; dialog.close(); openingButton?.focus(); }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function previewAction(parent, recipe, file, stamp, dirty = () => false) {
    if (typeof recipe.playablePreview !== 'function') return;
    const status = element(document, 'p'); status.setAttribute('role', 'status');
    const launch = button('Play saved copy', async () => {
      if (!file || dirty()) return;
      if (revision() !== stamp || !previewReady()) { status.textContent = 'The specification changed. Reopen this review before trying its preview.'; return; }
      launch.disabled = true; status.textContent = 'Checking the saved adoption…';
      try {
        // The trusted hook gets a detached snapshot and observations, no edits.
        const files = new Map([...snapshot()].map(([path,value]) => [path,value instanceof Uint8Array ? new Uint8Array(value) : value]));
        await recipe.playablePreview({files,adoptionFile:file,package:packageInfo(),revision:stamp,
          isCurrent:() => revision() === stamp && previewReady() && !dirty()});
        status.textContent = 'The playable preview opened in a separate tab.';
      } catch (error) { status.textContent = error.message; }
      finally { launch.disabled = !file || dirty(); }
    }, parent);
    parent.append(status);
    return {refresh() {
      launch.disabled = !file || dirty();
      status.textContent = !file ? 'Save this adoption before trying it in play.' : dirty() ? 'Save your changes before trying them in play.' : 'Uses the saved adoption. Playing and temporary changes stay in the preview.';
    }};
  }
  function choose(recipe) {
    const files = snapshot();
    const existing = matchingPreparedFiles(files, recipe);
    if (!existing.length) return edit(recipe);
    dialog.replaceChildren(element(document, 'h2', recipe.title));
    for (const file of existing) {
      button(`Edit ${file.slice(10, -5)}`, () => edit(recipe, file), dialog);
      // This door still works when a saved document cannot open a prepared form.
      // The preview's own read-only validator explains any incompatibility.
      if (existing.length === 1) previewAction(dialog, recipe, file, revision())?.refresh();
    }
    button('Add another adoption', () => edit(recipe), dialog);
    button('Back to your specification', close, dialog);
    if (!dialog.open) dialog.showModal();
  }
  function edit(recipe, file) {
    const files = snapshot(), stamp = revision();
    let draft;
    try { draft = createPreparedDraft(files, recipe, file); }
    catch (error) { dialog.replaceChildren(element(document, 'p', error.message)); button('Close', close, dialog); if (!dialog.open) dialog.showModal(); return; }
    const existingTuning = parseJson(files.get('tuning.json'));
    const savedDraft = JSON.stringify(draft);
    dialog.replaceChildren();
    const top = element(document, 'header');
    top.append(element(document, 'p', file ? 'Your adopted mechanic' : 'Prepared starting point', 'opengdd-prepared-eyebrow'),
      element(document, 'h1', recipe.title), element(document, 'p', recipe.lead));
    button('Back to your specification', close, top); dialog.append(top);
    const preview = previewAction(top, recipe, file, stamp, () => JSON.stringify(draft) !== savedDraft);
    if (recipe.trialNote) top.append(element(document, 'p', recipe.trialNote));
    if (!file) {
      const label = element(document, 'label', 'Name in your game');
      const input = element(document, 'input'); input.value = draft.name;
      input.addEventListener('input', () => { draft.name = input.value; refresh(); }); label.append(input); dialog.append(label);
    }
    const questions = element(document, 'section');
    questions.append(element(document, 'h2', 'Questions'), element(document, 'p', 'These answers are already selected. Change any that do not fit your game.'));
    const cards = new Map();
    for (const id of Object.keys(draft.adoption.questions)) {
      if (id.startsWith('_') || recipe.reviewQuestions && !recipe.reviewQuestions.includes(id)) continue;
      const q = preparedQuestionCopy(recipe, draft.adoption, id);
      const card = element(document, 'fieldset');
      card.append(element(document, 'legend', q.asks), element(document, 'p', q.rationale));
      for (const [value, option] of Object.entries(q.options)) {
        const label = element(document, 'label', undefined, 'opengdd-prepared-option');
        const input = element(document, 'input'); input.type = 'radio'; input.name = `prepared-${id}`; input.value = value;
        input.checked = draft.adoption.answers[id] === value;
        input.addEventListener('change', () => { draft.adoption.answers[id] = value; refresh(); });
        label.append(input, element(document, 'span', option.meaning)); card.append(label);
      }
      cards.set(id, card); questions.append(card);
    }
    dialog.append(questions);
    const summary = element(document, 'section', undefined, 'opengdd-prepared-summary'); summary.setAttribute('aria-live', 'polite'); dialog.append(summary);
    const tuningExplanation = element(document, 'p', 'Link values already in your specification, or create new ones. These remain ordinary tuning values, with names you choose. Changing a linked number changes it everywhere that value is used.');
    const lists = [
      ...(recipe.list ? [{ list: recipe.list, store: 'rows', rows: () => draft.adoption.rows[recipe.list.key] }] : []),
      ...(recipe.contentLists ?? []).map(list => ({ list, store: 'contentRows', rows: () => draft.contentRows[list.key] }))
    ];
    if (lists.length) dialog.append(tuningExplanation);
    for (const view of lists) {
      const { list } = view;
      view.cards = [];
      view.section = element(document, 'section');
      view.section.append(element(document, 'h2', list.title));
      if (list.lead) view.section.append(element(document, 'p', list.lead));
      view.container = element(document, 'div'); view.section.append(view.container);
      view.add = button(`Add ${list.item}`, () => {
        const rows = view.rows();
        rows.push(list.makeRow(rows, draft.name, files));
        refresh(); view.cards.at(-1)?.fields[0]?.input.focus();
      }, view.section);
    }
    const tuningSection = element(document, 'section');
    tuningSection.append(element(document, 'h2', 'Tune your mechanic'));
    if (!lists.length) tuningSection.append(tuningExplanation);
    const tuningCards = element(document, 'div'); tuningSection.append(tuningCards); dialog.append(tuningSection);
    for (const view of lists) dialog.append(view.section);
    const settingCards = new Map();
    let renderedShape;
    const editorShape = () => JSON.stringify({
      settings: preparedSettings(recipe, draft.adoption, draft.contentRows).map(({ id, parts }) => [id, parts]),
      rows: lists.map(view => view.rows().map(row => row.id))
    });
    function renderSetting(setting, parent) {
      const choice = draft.choices[setting.id];
      const box = element(document, 'fieldset'); box.dataset.setting = setting.id;
      const legend = element(document, 'legend', setting.label); box.append(legend);
      const numberLabel = element(document, 'label', setting.unit ?? 'Value');
      const number = element(document, 'input'); number.type = 'number'; number.step = 'any'; number.value = choice.value ?? '';
      number.setAttribute('aria-label', `${setting.label} value`);
      number.addEventListener('input', () => {
        choice.value = number.valueAsNumber;
        for (const [id, other] of Object.entries(draft.choices)) {
          if (id === setting.id || !choice.key || other.key !== choice.key) continue;
          other.value = choice.value;
          const otherCard = settingCards.get(id);
          if (otherCard) otherCard.number.value = number.value;
        }
        refresh();
      });
      numberLabel.append(number); box.append(numberLabel);
      const origin = element(document, 'p'); box.append(origin);
      const connection = element(document, 'details'); connection.append(element(document, 'summary', 'Choose a tuning source'));
      const modeLabel = element(document, 'label', 'Use a value'); const mode = element(document, 'select');
      mode.setAttribute('aria-label', `${setting.label} source option`);
      for (const [value, text] of [['link', 'Link an existing value'], ['create', 'Create a new value']]) { const o = element(document, 'option', text); o.value = value; mode.append(o); }
      mode.value = choice.mode; modeLabel.append(mode); connection.append(modeLabel);
      const search = element(document, 'input'); search.type = 'search'; search.placeholder = 'Search tuning values'; search.setAttribute('aria-label', `${setting.label} search`);
      const select = element(document, 'select'); select.setAttribute('aria-label', `${setting.label} existing value`);
      const key = element(document, 'input'); key.value = choice.key ?? ''; key.setAttribute('aria-label', `${setting.label} new name`);
      function fillOptions() {
        select.replaceChildren(); const empty = element(document, 'option', 'Choose a tuning value'); empty.value = ''; select.append(empty);
        for (const [name, value] of Object.entries(existingTuning.values)) {
          if (typeof value !== 'number' || name !== choice.key && !name.toLowerCase().includes(search.value.toLowerCase())) continue;
          const current = Object.values(draft.choices).find(other => other.key === name);
          const option = element(document, 'option', `${name} — ${current?.value ?? value}`); option.value = name; select.append(option);
        }
        select.value = choice.mode === 'link' ? choice.key : '';
      }
      function sourceMode() { search.hidden = select.hidden = choice.mode !== 'link'; key.hidden = choice.mode !== 'create'; fillOptions(); }
      mode.addEventListener('change', () => { choice.mode = mode.value; choice.key = mode.value === 'link' ? '' : key.value; sourceMode(); refresh(); });
      search.addEventListener('input', fillOptions);
      select.addEventListener('change', () => {
        choice.key = select.value;
        const shared = Object.entries(draft.choices).find(([id, other]) => id !== setting.id && choice.key && other.key === choice.key);
        choice.value = shared ? shared[1].value : existingTuning.values[choice.key];
        number.value = choice.value ?? ''; refresh();
      });
      key.addEventListener('input', () => { choice.key = key.value; refresh(); });
      connection.append(search, select, key); box.append(connection); sourceMode(); parent.append(box);
      const relabel = current => {
        legend.textContent = current.label;
        for (const [control, suffix] of [[number, 'value'], [mode, 'source option'], [search, 'search'], [select, 'existing value'], [key, 'new name']]) {
          control.setAttribute('aria-label', `${current.label} ${suffix}`);
        }
      };
      settingCards.set(setting.id, { box, number, origin, fillOptions, relabel });
    }
    function renderEditors() {
      settingCards.clear(); tuningCards.replaceChildren();
      const settings = preparedSettings(recipe, draft.adoption, draft.contentRows);
      for (const view of lists) {
        const { list, store } = view, rows = view.rows();
        view.container.replaceChildren(); view.cards.length = 0;
        rows.forEach((row, index) => {
          const box = element(document, 'fieldset'); box.dataset.row = row.id;
          const legend = element(document, 'legend'); box.append(legend);
          const fields = list.fields.map(field => {
            const label = element(document, 'label', field.label);
            const contentId = `${row.id}-${field.key}`;
            const projected = store === 'rows' && field.content;
            const choiceField = store === 'contentRows' && typeof field.choices === 'function';
            const input = element(document, choiceField ? 'select' : field.multiline ? 'textarea' : 'input');
            input.value = (projected ? draft.content[contentId] : row[field.key]) ?? '';
            const refreshOptions = choiceField ? () => {
              input.replaceChildren();
              for (const option of preparedContentFieldChoices(field, draft, row[field.key])) {
                const node = element(document, 'option', option.label); node.value = option.value; input.append(node);
              }
              input.value = row[field.key] ?? '';
            } : undefined;
            input.addEventListener(choiceField ? 'change' : 'input', () => {
              if (projected) draft.content[contentId] = input.value;
              else row[field.key] = input.value;
              refresh();
            });
            label.append(input); box.append(label); return { field, input, refreshOptions };
          });
          const controls = element(document, 'div');
          const remove = button('', () => {
            rows.splice(index, 1); refresh();
            (view.cards[Math.min(index, view.cards.length - 1)]?.fields[0]?.input ?? view.add).focus();
          }, controls);
          const move = offset => {
            [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]];
            refresh(); view.cards[index + offset]?.fields[0]?.input.focus();
          };
          const up = button('', () => move(-1), controls); up.disabled = index === 0;
          const down = button('', () => move(1), controls); down.disabled = index === rows.length - 1;
          box.append(controls);
          for (const setting of settings.filter(s => s.parts[0] === store && s.parts[1] === list.key && s.parts[2] === index)) renderSetting(setting, box);
          view.cards.push({ row, legend, fields, remove, up, down }); view.container.append(box);
        });
      }
      const outsideList = settings.filter(s => !lists.some(view => s.parts[0] === view.store && s.parts[1] === view.list.key));
      for (const setting of outsideList) renderSetting(setting, tuningCards);
      tuningSection.hidden = !outsideList.length;
      renderedShape = editorShape();
    }
    const settled = element(document, 'section'); settled.append(element(document, 'h2', 'Already decided for you'));
    for (const line of recipe.settled ?? []) settled.append(element(document, 'p', line));
    if (recipe.scope) settled.append(element(document, 'h3', 'Does it fit your game?'), element(document, 'p', recipe.scope));
    dialog.append(settled);
    const error = element(document, 'p', undefined, 'opengdd-prepared-error'); error.setAttribute('role', 'status');
    const review = element(document, 'p');
    const footer = element(document, 'footer'); footer.append(review, error);
    const save = button(file ? 'Save changes' : 'Adopt this mechanic', async () => {
      if (busy) return;
      busy = true; save.disabled = true;
      const locked = [...dialog.querySelectorAll('input, textarea, select, button')].map(control => [control, control.disabled]);
      for (const [control] of locked) control.disabled = true;
      try {
        if (revision() !== stamp) throw new Error('The specification changed while this review was open. Reopen it to review the current values.');
        const result = await saveStartingPoint({ internal, files, recipe, draft, currentRevision: revision, expectedRevision: stamp });
        const savedRevision = revision();
        dialog.replaceChildren(element(document, 'h2', file ? 'Changes saved' : `${draft.name} adopted`),
          element(document, 'p', `Changes applied. Document validation: ${result.run.verdict}. The tool saves a browser draft; export ZIP to keep a copy outside this browser.`));
        for (const line of recipe.summary?.(result.adoption, result.tuning, result.content, files, result.contentRows) ?? []) dialog.append(element(document, 'p', line));
        button(`Review ${draft.name}`, () => edit(recipe, result.path), dialog);
        previewAction(dialog, recipe, result.path, savedRevision)?.refresh();
        const undoStatus = element(document, 'p'); dialog.append(undoStatus);
        button(file ? 'Undo these changes' : 'Undo adoption', async () => {
          if (revision() !== savedRevision) { undoStatus.textContent = 'The specification changed again. Use its ordinary undo history to review those edits first.'; return; }
          await undo(); choose(recipe);
        }, dialog);
        button('Back to your specification', close, dialog);
      } catch (cause) { error.textContent = cause.message; save.disabled = false; }
      finally {
        busy = false;
        for (const [control, disabled] of locked) if (dialog.contains(control)) control.disabled = disabled;
        if (dialog.contains(save)) save.disabled = false;
      }
    }, footer);
    dialog.append(footer);
    function refresh() {
      syncPreparedChoices(files, recipe, draft);
      preview?.refresh();
      if (editorShape() !== renderedShape) renderEditors();
      const settings = preparedSettings(recipe, draft.adoption, draft.contentRows);
      const asked = contractQuestionLiveness(draft.adoption);
      for (const [id, card] of cards) card.hidden = !asked.has(id);
      for (const view of lists) for (const { row, legend, fields, remove, up, down } of view.cards) {
        const label = row.label || row.id || view.list.item;
        legend.textContent = label;
        for (const { field, input, refreshOptions } of fields) {
          input.setAttribute('aria-label', `${label} ${field.label.toLowerCase()}`);
          refreshOptions?.();
        }
        remove.textContent = `Remove ${label}`; up.textContent = `Move ${label} up`; down.textContent = `Move ${label} down`;
      }
      for (const setting of settings) {
        const { box, origin, fillOptions, relabel } = settingCards.get(setting.id), choice = draft.choices[setting.id];
        relabel(setting);
        box.hidden = !settingActive(draft.adoption, setting);
        origin.textContent = `${choice.mode === 'link' ? 'Linked to' : 'Will create'}: ${choice.key || 'choose a name'}`;
        fillOptions();
      }
      summary.replaceChildren(element(document, 'h2', 'Your mechanic now'));
      try {
        const plan = prepareStartingPoint(files, recipe, draft);
        for (const line of recipe.summary?.(plan.adoption, plan.tuning, plan.content, files, plan.contentRows) ?? []) summary.append(element(document, 'p', line));
        const created = Object.keys(plan.tuning.values).filter(key => !Object.hasOwn(existingTuning.values, key));
        const previous = parseJson(file ? files.get(file) : recipe.definitionText);
        const previousRows = recipe.readRows?.(files, previous, draft.name) ?? {};
        const previousSettings = new Map(preparedSettings(recipe, previous, previousRows).map(s => [s.id, s]));
        const rebound = settings.filter(s => {
          const previousSetting = previousSettings.get(s.id);
          const old = previousSetting ? preparedSettingValue(previous, previousRows, previousSetting) : undefined;
          return settingActive(plan.adoption, s) && Object.hasOwn(existingTuning.values, old) && old !== preparedSettingValue(plan.adoption, plan.contentRows, s);
        });
        review.textContent = (settings.length ? `${created.length} new tuning value${created.length === 1 ? '' : 's'}; ${plan.changes.filter(c => c.mode === 'link').length} existing values linked. ` : 'This starting point needs no tuning connections. ')
          + (rebound.length ? 'You changed a source. Existing prose and game-specific rules still cite the old names; review those uses for consistency. ' : '')
          + (settings.length ? 'Unused tuning values are kept. If you switch a behavior off, its values stay in tuning; review their connections if you switch it on again later. ' : '')
          + 'All changes save together and can be undone together.';
        error.textContent = ''; save.disabled = false;
      } catch (cause) { error.textContent = cause.message; save.disabled = true; }
    }
    refresh(); if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0;
  }
  for (const recipe of recipes) {
    const launch = button(recipe.title, () => { openingButton = launch; choose(recipe); }, launchers);
    launch.dataset.preparedRecipe = recipe.name;
  }
  // A package switch invalidates the open review instead of silently applying it
  // to another design. Ordinary edits are also checked by the revision token.
  cancelPending = subscribe(event => { if (event.type === 'opened' && dialog.open && !busy) close(); });
  return { open(recipe, file) { edit(recipe, file); }, destroy() { cancelPending(); dialog.close(); dialog.remove(); launchers.remove(); } };
}
