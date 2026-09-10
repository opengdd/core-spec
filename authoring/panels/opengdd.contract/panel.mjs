import { evaluateRule, parseRule } from "opengdd-validation";
import {
  CONTRACT_FRESH_ANSWERS, CONTRACT_SAME_NUMBER_ACCEPTED,
  contractFindingOwner, contractOwners, isContractDependentFinding, isContractTodoFinding, sameNumberWarnings
} from "../../src/contracts.mjs";
import { CONTRACT_COPY } from "../../src/copy/contract-copy.mjs";
import { COLLECTION_COPY } from "../../src/copy/collection-copy.mjs";
import { WIDGET_COPY } from "../../src/copy/widget-copy.mjs";
import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { createContractRows } from "../../src/contract-rows.mjs";
import { anchoredConfirmation, element, renderBackticks } from "../../src/dom.mjs";
import { packageFiles, parseJson, plainObject } from "../../src/json-path.mjs";
import { createRecordTable, validationRefusal } from "../../src/record-table.mjs";
import { locationRows, referenceGroup } from "../../src/inspector-groups.mjs";
import {
  contractAdoptionActivation, contractConditionFailure, contractTestInputField, firstSentence, liveContractTemplates, pointerFor,
  ruleValueNames, splitContractTests, writeContractDesignerValue
} from "../../src/contract-worksheet.mjs";

const CONTRACT_PATH = /^contracts\/([^/]+)\.json$/;
const CONTRACT_TABLE_COPY = Object.freeze({
  ...COLLECTION_COPY,
  empty: CONTRACT_COPY.noRows,
  addFirst: CONTRACT_COPY.addFirst,
  duplicate: CONTRACT_COPY.duplicate,
  moveUp: CONTRACT_COPY.moveUp,
  moveDown: CONTRACT_COPY.moveDown,
  removeRowAction: CONTRACT_COPY.removeRowAction,
  doesntApplyField: CONTRACT_COPY.doesntApplyField,
  doesntApplyRowReason: CONTRACT_COPY.doesntApplyRowReason,
  doesntApplyAnswerReason: CONTRACT_COPY.doesntApplyAnswerReason,
  rowFinding: CONTRACT_COPY.rowFinding,
  rowFindingLeft: CONTRACT_COPY.rowFindingLeft,
  kebabHelp: CONTRACT_COPY.kebabHelp,
  rowObjectRefusal: CONTRACT_COPY.rowObjectRefusal,
  rowMissing: CONTRACT_COPY.rowMissing,
  transactionRefused: CONTRACT_COPY.transactionRefused,
  writeInterrupted: CONTRACT_COPY.writeInterrupted,
  undo: Object.freeze({
    ...COLLECTION_COPY.undo,
    pasteRecords: CONTRACT_COPY.undo.addRow,
    duplicateRecord: CONTRACT_COPY.undo.duplicateRow,
    addRow: CONTRACT_COPY.undo.addRow,
    removeRow: CONTRACT_COPY.undo.removeRow,
    moveRow: CONTRACT_COPY.undo.moveRow
  })
});

function renderedMarkdown(document, markdown) {
  const fragment = document.createDocumentFragment();
  const lines = String(markdown ?? "").split(/\r?\n/u);
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    fragment.append(element(document, "p", paragraph.join(" ")));
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^###\s+(.+)$/u.exec(line);
    if (heading) { flush(); fragment.append(element(document, "h4", heading[1])); continue; }
    if (/^```/u.test(line)) {
      flush();
      const block = [];
      while (++index < lines.length && !/^```\s*$/u.test(lines[index])) block.push(lines[index]);
      fragment.append(element(document, "pre", block.join("\n")));
      continue;
    }
    if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  return fragment;
}

function fieldNames(line, adoption) {
  return ruleValueNames(line, adoption?.declares?.values);
}

function prospectiveValueIssue(adoption, name, value) {
  if (value === undefined) return "";
  const declaration = adoption.declares?.values?.[name];
  if (Array.isArray(declaration?.range) && declaration.range.length === 2
    && (value < declaration.range[0] || value > declaration.range[1])) {
    return CONTRACT_COPY.range(declaration.range[0], declaration.range[1]);
  }
  const values = new Map(Object.entries(plainObject(adoption.values) ? adoption.values : {}));
  values.set(name, value);
  const declared = new Set(Object.keys(plainObject(adoption.declares?.values) ? adoption.declares.values : {}));
  for (const line of Object.values(plainObject(adoption.rules) ? adoption.rules : {})) {
    const names = fieldNames(line, adoption);
    if (!names.includes(name) || names.some(field => typeof values.get(field) !== "number")) continue;
    try {
      const ast = parseRule(line, { bareKeys: declared });
      if (!evaluateRule(ast, values)) return CONTRACT_COPY.rule(line);
    } catch { /* The validator reports malformed published rules in What's left. */ }
  }
  return "";
}

function appendDisclosure(document, card, key, summaryText, content, heading) {
  const disclosure = element(document, "details");
  disclosure.dataset.disclosure = key;
  disclosure.append(element(document, "summary", summaryText));
  if (heading) disclosure.append(element(document, "p", heading, "opengdd-author-contract-disclosure-heading"));
  disclosure.append(content);
  card.append(disclosure);
}

function citationCandidates(packageService, view) {
  const candidates = [];
  const tuning = parseJson(packageService.read("tuning.json"));
  for (const value of Object.keys(plainObject(tuning?.values) ? tuning.values : {})) {
    candidates.push({ value, label: value, group: CONTRACT_COPY.tuningValues });
  }
  for (const file of packageService.list().filter(path => CONTRACT_PATH.test(path) && !path.endsWith(".pack.json")).sort()) {
    const adoption = parseJson(packageService.read(file));
    const id = CONTRACT_PATH.exec(file)?.[1];
    for (const value of Object.keys(plainObject(adoption?.declares?.values) ? adoption.declares.values : {})) {
      const address = `contracts.${id}.${value}`;
      candidates.push({ value: address, label: address, group: CONTRACT_COPY.contractValues });
    }
  }
  const sections = new Map();
  for (const [name, definitions] of view?.definitionsByName ?? []) {
    if (!/\.md#[A-Za-z0-9._-]+$/u.test(name)) continue;
    const definition = definitions.find(item => item.kind === "section" && item.file === name.slice(0, name.indexOf("#")));
    if (!definition) continue;
    // Current analysis carries no authority metadata. When it does, this
    // conservative check keeps tagged sections out; until then validation is
    // the authority and refuses a non-Fixed selection before commit.
    const tagged = Boolean(definition.authority || definition.authorityTag
      || Array.isArray(definition.authorityTags) && definition.authorityTags.length);
    if (!tagged) sections.set(name, definition.value ? `${name} — ${definition.value}` : name);
  }
  for (const [value, label] of [...sections].sort(([left], [right]) => left.localeCompare(right))) {
    candidates.push({ value, label, group: CONTRACT_COPY.chapterSections });
  }
  return candidates;
}

function rowFindingLocation(adoption, finding) {
  const match = /\/rows\/([^/\s]+)\/(\d+)(?:\/([^\s,;]+))?/u.exec(finding.message ?? "");
  if (!match) return undefined;
  const set = match[1];
  const index = Number(match[2]);
  const row = adoption.rows?.[set]?.[index];
  const field = match[3]?.replace(/[)\]}.:]+$/u, "") ?? /field "([^"]+)"/u.exec(finding.message ?? "")?.[1] ?? "row";
  const id = row && Object.hasOwn(row, "id") ? String(row.id) : String(index);
  let detail = String(finding.message ?? "").slice((match.index ?? 0) + match[0].length).trim();
  if (!match[3] && field !== "row") {
    const repeated = new RegExp(`\\s+field "${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "u");
    detail = detail.replace(repeated, "");
  }
  return { set, index, id, field, detail: detail || (finding.message ?? "") };
}

export default {
  api: 1,
  id: "opengdd.contract",
  title: "Contract",
  surfaces: ["inspector"],
  inspects: { kinds: ["contract", "contract-value"] },
  needs: ["selection", "edits", "references", "forms"],
  empty: { title: "Choose a contract" },
  styles: new URL("./panel.css", import.meta.url),
  create(context) {
    const document = context.document;
    const body = element(document, "div", undefined, "opengdd-author-contract");
    body.dataset.contractWorksheet = "";
    context.element.append(body);
    let activeForms = [];
    let activeTables = [];
    let selectedFile = "";
    let pendingValue = "";
    let renderQueued = false;
    let pendingFocus;
    let lastFocus;
    let duplicateSnapshotFile = "";
    let duplicateWarningSnapshot = [];
    let duplicateSnapshotSource = "";
    let contributedWarnings = "";
    const dismissedWarnings = new Set();
    const preferredValueForms = new Map();
    let shownUpdateFile = "";
    let shownChangelog = [];

    const queueRender = () => {
      if (renderQueued) return;
      renderQueued = true;
      queueMicrotask(() => { renderQueued = false; render(); });
    };
    const jump = node => {
      node?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      const focus = node?.querySelector?.("input, textarea, button, summary");
      focus?.focus?.({ preventScroll: true });
    };
    const questionNode = id => [...body.querySelectorAll?.("[data-question-card]") ?? []]
      .find(node => node.dataset.questionCard === id);
    const valueNode = id => [...body.querySelectorAll?.("[data-value-box]") ?? []]
      .find(node => node.dataset.valueBox === id);
    const inputNode = id => [...body.querySelectorAll?.("[data-test-input-group]") ?? []]
      .find(node => node.dataset.testInputGroup === id);
    const rowNode = (set, id) => [...body.querySelectorAll?.("[data-row-set]") ?? []]
      .find(node => node.dataset.rowSet === set)?.querySelector?.(`[data-record-row="${CSS.escape(id)}"]`);

    const focusState = () => {
      const active = document.activeElement;
      if (!active || !body.contains(active)) return undefined;
      const question = active.closest?.("[data-question-card]")?.dataset.questionCard;
      const choice = active.closest?.("[data-choice]")?.dataset.choice;
      if (question) return { kind: "question", question, choice };
      const value = active.closest?.("[data-value-box]")?.dataset.valueBox;
      if (value) return { kind: "value", value };
      const inputGroup = active.closest?.("[data-test-input-group]")?.dataset.testInputGroup;
      const field = active.closest?.("[data-form-field]")?.dataset.formField;
      if (inputGroup) return { kind: "input", inputGroup, field };
      const rowSet = active.closest?.("[data-row-set]")?.dataset.rowSet;
      const row = active.closest?.("[data-record-row]")?.dataset.recordRow;
      const cell = active.closest?.("[data-record-cell]")?.dataset.recordCell;
      if (rowSet && row) return { kind: "row", rowSet, row, cell };
      const disclosure = active.closest?.("[data-disclosure]")?.dataset.disclosure;
      return disclosure ? { kind: "disclosure", disclosure } : { kind: "worksheet" };
    };

    const restoreFocus = state => {
      let target;
      if (state?.kind === "question") target = questionNode(state.question)
        ?.querySelector(state.choice ? `[data-choice="${CSS.escape(state.choice)}"]` : "button");
      else if (state?.kind === "value") target = valueNode(state.value)?.querySelector("input");
      else if (state?.kind === "input") target = inputNode(state.inputGroup)
        ?.querySelector(state.field ? `[data-form-field="${CSS.escape(state.field)}"] input, [data-form-field="${CSS.escape(state.field)}"] textarea, [data-form-field="${CSS.escape(state.field)}"] button` : "input, textarea, button");
      else if (state?.kind === "row") target = rowNode(state.rowSet, state.row)
        ?.querySelector(state.cell ? `[data-record-cell="${CSS.escape(state.cell)}"]` : "button");
      else if (state?.kind === "disclosure") target = body.querySelector(`[data-disclosure="${CSS.escape(state.disclosure)}"] summary`);
      target ??= body.querySelector("button, input, textarea, summary");
      target?.focus?.({ preventScroll: true });
    };

    async function write(adoption, parts, value, {
      remove = false, label, allowTodo = false, allowDependent = false, allowAskedAnswerTodo = false, changes
    } = {}) {
      pendingFocus = focusState();
      return writeContractDesignerValue({
        internal: context.internal, adoption, file: selectedFile, parts, value, remove, label,
        allowTodo, allowDependent, allowAskedAnswerTodo, changes
      });
    }

    function questionSection(adoption, activation) {
      const { asked } = activation;
      const section = element(document, "section", undefined, "opengdd-author-contract-questions");
      for (const [id, question] of Object.entries(plainObject(adoption.questions) ? adoption.questions : {})) {
        if (id.startsWith("_") || !plainObject(question)) continue;
        const card = element(document, "div");
        card.dataset.questionCard = id;
        const isAsked = asked.has(id);
        if (!isAsked) card.className = "opengdd-author-contract-question--not-asked";
        if (isAsked && Array.isArray(adoption[CONTRACT_FRESH_ANSWERS])
          && adoption[CONTRACT_FRESH_ANSWERS].includes(id) && !Object.hasOwn(adoption.answers ?? {}, id)) {
          const fresh = element(document, "strong", CONTRACT_COPY.freshAnswer, "opengdd-author-contract-fresh-answer");
          fresh.dataset.freshAnswer = id;
          card.append(fresh, element(document, "p", CONTRACT_COPY.freshAnswerReason,
            "opengdd-author-contract-fresh-answer-reason"));
        }
        const formHost = element(document, "div");
        card.append(formHost);
        const options = Object.entries(plainObject(question.options) ? question.options : {})
          .filter(([option]) => !option.startsWith("_"))
          .map(([option, declaration]) => ({
            value: option,
            label: declaration.meaning,
            tag: question.guidance === option ? CONTRACT_COPY.guidanceTag : ""
          }));
        activeForms.push(context.services.forms.create(formHost, {
          fields: [{
            key: id, label: question.asks, type: "choice", helpOptional: true,
            binding: { file: selectedFile, pointer: pointerFor("answers", id) },
            options, disabled: !isAsked, showSelection: isAsked,
            write: (value, detail) => {
              const fresh = Array.isArray(adoption[CONTRACT_FRESH_ANSWERS])
                ? adoption[CONTRACT_FRESH_ANSWERS] : [];
              const remainingFresh = fresh.filter(question => question !== id);
              const changes = !detail.remove && fresh.includes(id) ? [
                { parts: ["answers", id], value },
                remainingFresh.length
                  ? { parts: [CONTRACT_FRESH_ANSWERS], value: remainingFresh }
                  : { parts: [CONTRACT_FRESH_ANSWERS], remove: true }
              ] : undefined;
              return write(adoption, ["answers", id], value, {
                remove: detail.remove,
                label: detail.remove ? CONTRACT_COPY.undo.clearAnswer : CONTRACT_COPY.undo.answer,
                allowTodo: detail.remove,
                allowAskedAnswerTodo: !detail.remove,
                changes
              });
            }
          }]
        }));
        const formCard = formHost.querySelector?.(`[data-form-field="${id}"]`);
        if (formCard) formCard.classList.add("opengdd-author-contract-question-card");
        if (!isAsked) {
          const badge = element(document, "strong", CONTRACT_COPY.doesntApply, "opengdd-author-contract-not-asked-badge");
          card.prepend(badge);
          const blocked = contractConditionFailure(adoption, question.when, activation);
          if (blocked) {
            const reason = element(document, "p");
            if (blocked.kind === "flag") {
              const cause = adoption.questions?.[blocked.name];
              const meaning = firstSentence(cause?.options?.[blocked.answer]?.meaning);
              const copy = blocked.answer === undefined
                ? CONTRACT_COPY.doesntApplyAnswerNeeded(cause?.asks ?? blocked.name)
                : CONTRACT_COPY.doesntApplyReason(meaning || blocked.answer, cause?.asks ?? blocked.name);
              reason.append(copy.before);
              const link = element(document, "button", copy.question, "opengdd-author-contract-jump");
              link.type = "button";
              link.addEventListener("click", () => jump(questionNode(blocked.name)));
              reason.append(link, copy.after);
            } else if (blocked.kind === "value-form") {
              reason.textContent = CONTRACT_COPY.doesntApplyValueForm(blocked.name, blocked.forms, blocked.form);
            } else if (blocked.kind === "row-count") {
              reason.textContent = CONTRACT_COPY.doesntApplyRowCount(blocked.name, blocked.cardinality, blocked.count);
            } else reason.textContent = CONTRACT_COPY.doesntApplyCondition(blocked.pointer);
            card.append(reason);
          }
          if (typeof question.otherwise === "string" && question.otherwise.trim()) {
            card.append(element(document, "p", CONTRACT_COPY.otherwise(question.otherwise)));
          }
          if (Object.hasOwn(plainObject(adoption.answers) ? adoption.answers : {}, id)) {
            const clear = element(document, "button", CONTRACT_COPY.clearIt);
            clear.type = "button";
            clear.addEventListener("click", () => write(adoption, ["answers", id], undefined, {
              remove: true, label: CONTRACT_COPY.undo.clearAnswer
            }).catch(error => { clear.title = error.message; }));
            card.append(clear);
          }
        }
        if (question.rationale) appendDisclosure(document, card, `question:${id}:why`, CONTRACT_COPY.whyQuestion,
          element(document, "p", question.rationale));
        const exact = Object.entries(plainObject(question.options) ? question.options : {})
          .filter(([option, declaration]) => !option.startsWith("_") && typeof declaration?.semantics === "string");
        if (exact.length) {
          const definitions = element(document, "dl");
          for (const [option, declaration] of exact) {
            definitions.append(element(document, "dt", option), element(document, "dd", declaration.semantics));
          }
          appendDisclosure(document, card, `question:${id}:exact`, CONTRACT_COPY.exactWording, definitions, CONTRACT_COPY.exactHeading);
        }
        section.append(card);
      }
      body.append(section);
    }

    function valuesSection(adoption, activation) {
      const declarations = plainObject(adoption.declares?.values) ? adoption.declares.values : {};
      if (!Object.keys(declarations).length) return;
      const section = element(document, "section", undefined, "opengdd-author-contract-values");
      section.append(element(document, "h3", CONTRACT_COPY.valuesHeading));
      const host = element(document, "div");
      section.append(host);
      const active = Object.entries(declarations).filter(([name, declaration]) => !name.startsWith("_")
        && activation.activeValues.has(name));
      const fields = active.map(([name, declaration]) => {
        const forms = Array.isArray(declaration.forms) ? declaration.forms : ["number"];
        const current = adoption.values?.[name];
        const preferenceKey = `${selectedFile}\0${name}`;
        const preferred = typeof current === "string" ? "citation" : typeof current === "number" ? "number"
          : preferredValueForms.get(preferenceKey);
        const reference = forms.includes("citation") && (!forms.includes("number") || preferred === "citation");
        const field = {
          key: name, label: name, type: reference ? "reference" : "number", help: declaration.description,
          options: { candidates: citationCandidates(context.package, context.internal.view()), allowFree: false },
          binding: { file: selectedFile, pointer: pointerFor("values", name) },
          clearRemoves: true, commitOnBlur: true,
          validate: value => typeof value === "number" ? prospectiveValueIssue(adoption, name, value) : "",
          labels: { change: CONTRACT_COPY.undo.changeValue, clear: CONTRACT_COPY.undo.changeValue },
          write: async (value, detail) => {
            const issue = typeof value === "number" ? prospectiveValueIssue(adoption, name, value) : "";
            try {
              return await write(adoption, ["values", name], value, {
                remove: detail.remove, label: CONTRACT_COPY.undo.changeValue,
                allowTodo: detail.remove, allowDependent: true, allowAskedAnswerTodo: true
              });
            } catch (error) { throw new Error(issue || error.message); }
          }
        };
        if (forms.includes("number") && forms.includes("citation")) field.action = {
          label: reference ? CONTRACT_COPY.useNumber : CONTRACT_COPY.useReference,
          run: async () => {
            preferredValueForms.set(preferenceKey, reference ? "number" : "citation");
            if (!Object.hasOwn(plainObject(adoption.values) ? adoption.values : {}, name)) {
              queueRender();
              return false;
            }
            return write(adoption, ["values", name], undefined, {
              remove: true, label: CONTRACT_COPY.undo.changeValue, allowTodo: true,
              allowDependent: true, allowAskedAnswerTodo: true
            });
          }
        };
        return field;
      });
      activeForms.push(context.services.forms.create(host, { fields }));
      const tuning = parseJson(context.package.read("tuning.json"));
      for (const [name] of active) {
        const source = adoption.values?.[name];
        if (typeof source !== "string" || typeof tuning?.values?.[source] !== "number") continue;
        const editor = element(document, "div");
        section.append(editor);
        activeForms.push(context.services.forms.create(editor, { fields: [{
          key: `${name}-source`, label: `${name} — tuning value`, type: "number", help: source,
          binding: { file: "tuning.json", pointer: pointerFor("values", source) }, commitOnBlur: true
        }] }));
      }
      for (const [name, declaration] of Object.entries(declarations)) {
        const box = host.querySelector?.(`[data-form-field="${name}"]`);
        if (!box) continue;
        box.dataset.valueBox = name;
        if (Array.isArray(declaration.range) && declaration.range.length === 2) {
          box.append(element(document, "span", `${declaration.range[0]}–${declaration.range[1]}`, "opengdd-author-contract-range"));
        }
      }
      body.append(section);
    }

    function testInputsSection(adoption, pack) {
      if (!pack) return;
      const section = element(document, "section", undefined, "opengdd-author-contract-inputs");
      let groups = 0;
      for (const template of liveContractTemplates(adoption, pack).filter(item => plainObject(item.inputs))) {
        const group = element(document, "section");
        group.dataset.testInputGroup = template.id;
        group.append(element(document, "h4", template.title));
        const host = element(document, "div");
        group.append(host);
        const fields = [];
        for (const input of ["scope", "seeds"]) {
          const declaration = template.inputs[input];
          if (!plainObject(declaration)) continue;
          fields.push(contractTestInputField({ adoption, file: selectedFile, template, input, declaration, write }));
        }
        if (fields.length) {
          activeForms.push(context.services.forms.create(host, { fields }));
          section.append(group);
          groups += 1;
        }
      }
      if (groups) {
        section.prepend(element(document, "h3", CONTRACT_COPY.testInputsHeading));
        body.append(section);
      }
    }

    function rowsSection(adoption) {
      const declarations = plainObject(adoption.declares?.rows) ? adoption.declares.rows : {};
      const candidates = citationCandidates(context.package, context.internal.view?.());
      for (const [set, declaration] of Object.entries(declarations)) {
        if (set.startsWith("_") || !plainObject(declaration?.record)) continue;
        const section = element(document, "section", undefined, "opengdd-author-contract-rows");
        section.dataset.rowSet = set;
        const heading = element(document, "header", undefined, "opengdd-author-contract-rows-heading");
        heading.append(element(document, "h3", set));
        const actionError = element(document, "p");
        actionError.setAttribute("aria-live", "polite");
        const adapter = createContractRows({
          file: selectedFile, set, schema: declaration.record,
          readAdoption: () => parseJson(context.package.read(selectedFile)),
          internal: Object.freeze({ ...context.internal, candidates }), copy: CONTRACT_COPY,
        });
        const add = element(document, "button", CONTRACT_COPY.addRow);
        add.type = "button";
        let adding = false;
        add.addEventListener("click", async () => {
          if (adding) return;
          adding = true;
          add.disabled = true;
          actionError.textContent = "";
          try { await adapter.add(); }
          catch (error) { actionError.textContent = validationRefusal(CONTRACT_TABLE_COPY, error); }
          finally {
            adding = false;
            if (add.isConnected) add.disabled = false;
          }
        });
        heading.append(add);
        section.append(heading);
        const rows = Array.isArray(adoption.rows?.[set]) ? adoption.rows[set] : [];
        if (rows.length === 0 && typeof declaration["when-empty"] === "string" && declaration["when-empty"].trim()) {
          section.append(element(document, "p", CONTRACT_COPY.whenEmpty(declaration["when-empty"])));
        }
        if (declaration.description) {
          const description = element(document, "details", undefined, "opengdd-author-contract-rows-about");
          description.dataset.disclosure = `rows:${set}:about`;
          const sentence = firstSentence(declaration.description);
          description.append(element(document, "summary", sentence.length > 120 ? CONTRACT_COPY.aboutRows : sentence),
            element(document, "p", declaration.description));
          section.append(description);
        }
        const host = element(document, "div", undefined, "opengdd-author-contract-row-table");
        section.append(actionError, host);
        activeTables.push(createRecordTable(host, {
          schema: declaration.record, rows: adapter, forms: context.services.forms,
          copy: CONTRACT_TABLE_COPY, view: { authoredOrder: true, find: "", sort: { key: "id", direction: "ascending" } }
        }));
        body.append(section);
      }
    }

    const warningIdentity = warning => `${warning.file}\0${warning.key}\0${warning.name}`;

    function takeDuplicateSnapshot() {
      const files = new Map(context.package.list().map(path => [path, context.package.read(path)]));
      duplicateSnapshotFile = selectedFile;
      duplicateWarningSnapshot = [...sameNumberWarnings(files, selectedFile)];
      duplicateSnapshotSource = context.package.read(selectedFile) ?? "";
      dismissedWarnings.clear();
    }

    function clearDuplicateSnapshot() {
      duplicateSnapshotFile = "";
      duplicateWarningSnapshot = [];
      duplicateSnapshotSource = "";
      dismissedWarnings.clear();
    }

    function visibleDuplicateWarnings(adoption) {
      const accepted = new Set(Array.isArray(adoption[CONTRACT_SAME_NUMBER_ACCEPTED])
        ? adoption[CONTRACT_SAME_NUMBER_ACCEPTED] : []);
      return duplicateWarningSnapshot.filter(warning => !accepted.has(warning.key)
        && !dismissedWarnings.has(warningIdentity(warning)));
    }

    function onlyAcceptedAnnotationChanged(beforeText, afterText) {
      const before = parseJson(beforeText);
      const after = parseJson(afterText);
      if (!plainObject(before) || !plainObject(after)) return false;
      delete before[CONTRACT_SAME_NUMBER_ACCEPTED];
      delete after[CONTRACT_SAME_NUMBER_ACCEPTED];
      return JSON.stringify(before) === JSON.stringify(after);
    }

    function publishDuplicateWarnings(warnings) {
      const serialized = JSON.stringify(warnings);
      if (serialized === contributedWarnings) return;
      contributedWarnings = serialized;
      context.internal.setDuplicateWarnings?.(warnings.map(warning => ({
        ...warning,
        sentence: CONTRACT_COPY.duplicateWarning(warning.key, warning.adoption, warning.name, warning.value),
        help: CONTRACT_COPY.duplicateHelp
      })));
    }

    function duplicateSection(adoption, warnings) {
      publishDuplicateWarnings(warnings);
      if (!warnings.length) return;
      const section = element(document, "section", undefined, "opengdd-author-contract-duplicates");
      for (const warning of warnings) {
        const box = element(document, "div", undefined, "opengdd-author-contract-duplicate");
        box.dataset.duplicateWarning = warning.key;
        renderBackticks(box.appendChild(element(document, "p")),
          CONTRACT_COPY.duplicateWarning(warning.key, warning.adoption, warning.name, warning.value));
        box.append(element(document, "p", CONTRACT_COPY.duplicateHelp, "opengdd-author-muted"));
        const actions = element(document, "div", undefined, "opengdd-author-contract-duplicate-actions");
        const status = element(document, "p", undefined, "opengdd-author-contract-duplicate-status");
        status.setAttribute("aria-live", "polite");
        const show = element(document, "button", CONTRACT_COPY.showBoth);
        show.type = "button";
        show.addEventListener("click", () => {
          context.internal.showTuningValue?.(warning.key, selectedFile);
        });
        const use = element(document, "button", CONTRACT_COPY.useContractEverywhere);
        use.type = "button";
        use.addEventListener("click", async () => {
          status.textContent = "";
          const plan = context.services.references.planUseContractValue(warning.key, warning.contractAddress);
          if (plan.safety !== "complete") { status.textContent = plan.reason; return; }
          const accepted = await anchoredConfirmation({ document, anchor: use, question: plan.reason, actions: [
            { label: CONTRACT_COPY.useContractEverywhere, value: true },
            { label: CONTRACT_COPY.cancel, value: false }
          ], datasetKey: "contractConfirmation",
          removeExisting: () => body.querySelector("[data-contract-confirmation]")?.remove() });
          if (!accepted) return;
          const result = await context.services.references.applyUseContractValue(plan);
          if (!result.applied) status.textContent = result.reason;
        });
        const keep = element(document, "button", CONTRACT_COPY.keepBoth);
        keep.type = "button";
        keep.addEventListener("click", () => {
          const accepted = [...new Set([...(Array.isArray(adoption[CONTRACT_SAME_NUMBER_ACCEPTED])
            ? adoption[CONTRACT_SAME_NUMBER_ACCEPTED] : []), warning.key])];
          write(adoption, [CONTRACT_SAME_NUMBER_ACCEPTED], accepted, {
            label: CONTRACT_COPY.undo.keepBoth
          }).catch(error => { status.textContent = error.message; });
        });
        const later = element(document, "button", CONTRACT_COPY.later);
        later.type = "button";
        later.addEventListener("click", () => {
          dismissedWarnings.add(warningIdentity(warning));
          queueRender();
        });
        actions.append(show, use, keep, later);
        box.append(actions, status);
        section.append(box);
      }
      body.append(section);
    }

    function changelogSection(lines) {
      if (!lines.length) return;
      const section = element(document, "section", undefined, "opengdd-author-contract-changelog");
      section.append(element(document, "h3", CONTRACT_COPY.changelogHeading));
      if (lines.length === 1) section.append(element(document, "p", lines[0]));
      else {
        const list = element(document, "ul");
        for (const line of lines) list.append(element(document, "li", line));
        section.append(list);
      }
      body.append(section);
    }

    function targetForFinding(finding, adoption) {
      const message = finding.message ?? "";
      for (const name of Object.keys(plainObject(adoption.questions) ? adoption.questions : {})) {
        if (message.includes(`/answers/${name}`) || message.includes(JSON.stringify(name))) return questionNode(name);
      }
      for (const name of Object.keys(plainObject(adoption.declares?.values) ? adoption.declares.values : {})) {
        const word = new RegExp(`(^|[^A-Za-z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_-]|$)`, "u");
        if (message.includes(`/values/${name}`) || word.test(message)) return valueNode(name);
      }
      const template = /#\/verification\/([^ /]+)/.exec(message)?.[1];
      if (template) return inputNode(template);
      const row = rowFindingLocation(adoption, finding);
      return row ? rowNode(row.set, row.id) : undefined;
    }

    function findingText(finding, adoption) {
      const message = finding.message ?? "";
      if (finding.code === "CONTRACT_ANSWER_MISSING") {
        const name = Object.keys(adoption.questions ?? {}).find(id => message.includes(JSON.stringify(id)));
        return name ? adoption.questions[name].asks : message;
      }
      if (finding.code === "CONTRACT_VALUE_MISSING") {
        const name = Object.keys(adoption.declares?.values ?? {}).find(id => message.includes(`/values/${id}`));
        return name ? CONTRACT_COPY.valueMissing(name) : message;
      }
      if (finding.code === "CONTRACT_VALUE_RANGE") {
        const name = Object.keys(adoption.declares?.values ?? {}).find(id => message.includes(`/values/${id}`));
        return name ? CONTRACT_COPY.valueOutOfRange(name) : message;
      }
      if (/^CONTRACT_(?:ROW|CITATION)_/u.test(finding.code)) {
        const row = rowFindingLocation(adoption, finding);
        if (row) return CONTRACT_COPY.rowFindingLeft(row.set, row.id, row.field, row.detail);
      }
      // A missing verification input, in the designer's words rather than a pointer.
      const input = /#\/verification\/([^ /]+) is missing required input "([^"]+)"/.exec(message);
      if (finding.code === "CONTRACT_REFERENCE" && input) return CONTRACT_COPY.inputMissing(input[1], input[2]);
      return message;
    }

    function whatsLeftSection(adoption) {
      const section = element(document, "section", undefined, "opengdd-author-contract-left");
      section.append(element(document, "h3", CONTRACT_COPY.whatsLeft));
      const allFindings = context.internal.run()?.findings ?? [];
      const contracts = contractOwners(packageFiles(context));
      const findings = allFindings.filter(finding => contractFindingOwner(finding, contracts, allFindings)?.file === selectedFile);
      const missingQuestions = findings.filter(finding => finding.code === "CONTRACT_ANSWER_MISSING");
      if (missingQuestions.length) section.append(element(document, "p", CONTRACT_COPY.questionsToAnswer(missingQuestions.length)));
      if (!findings.length) {
        section.append(element(document, "strong", context.package.read(`contracts/${adoption.contract}-${adoption.version}.pack.json`) !== undefined
          ? CONTRACT_COPY.completeChecked : CONTRACT_COPY.completePromised));
      } else {
        const questionCodes = new Set(["CONTRACT_ANSWER_MISSING", "CONTRACT_ANSWER_UNKNOWN", "CONTRACT_ANSWER_NOT_ASKED"]);
        const valueCodes = new Set(["CONTRACT_VALUE_MISSING", "CONTRACT_VALUE_TYPE", "CONTRACT_VALUE_RANGE", "CONTRACT_RULE_FAILED"]);
        const rowFinding = finding => /^CONTRACT_(?:ROW|CITATION)_/u.test(finding.code) && rowFindingLocation(adoption, finding);
        const inputFinding = finding => /#\/verification\//.test(finding.message ?? "");
        const hasTodo = findings.some(isContractTodoFinding);
        const consequences = hasTodo ? findings.filter(finding => isContractDependentFinding(finding)
          && !isContractTodoFinding(finding)) : [];
        const consequenceSet = new Set(consequences);
        const ordered = [
          ...findings.filter(finding => questionCodes.has(finding.code)),
          ...findings.filter(finding => valueCodes.has(finding.code)),
          ...findings.filter(finding => rowFinding(finding)),
          ...findings.filter(finding => inputFinding(finding) && !questionCodes.has(finding.code)
            && !valueCodes.has(finding.code) && !rowFinding(finding) && !consequenceSet.has(finding)),
          ...findings.filter(finding => !questionCodes.has(finding.code) && !valueCodes.has(finding.code)
            && !rowFinding(finding) && !inputFinding(finding) && !consequenceSet.has(finding))
        ];
        const list = element(document, "ul");
        for (const finding of ordered) {
          const item = element(document, "li");
          const target = targetForFinding(finding, adoption);
          if (target) {
            const button = element(document, "button", findingText(finding, adoption), "opengdd-author-contract-jump");
            button.type = "button";
            button.addEventListener("click", () => jump(targetForFinding(finding, adoption)));
            item.append(button);
          } else item.append(element(document, "span", findingText(finding, adoption)));
          list.append(item);
        }
        if (consequences.length) list.append(element(document, "li",
          CONTRACT_COPY.consequenceTail(consequences.length).replace(/^·\s*/u, ""), "opengdd-author-contract-consequence-tail"));
        section.append(list);
      }
      const check = element(document, "button", CONTRACT_COPY.checkDuplicates);
      check.type = "button";
      check.dataset.checkDuplicates = "";
      check.addEventListener("click", () => {
        takeDuplicateSnapshot();
        queueRender();
      });
      section.append(check);
      body.append(section);
    }

    function testsSection(adoption, checked) {
      const disclosure = element(document, "details", undefined, "opengdd-author-contract-tests");
      disclosure.dataset.disclosure = "tests";
      disclosure.append(element(document, "summary", CONTRACT_COPY.testsHeading));
      if (!checked) disclosure.append(element(document, "p", CONTRACT_COPY.promisedTests));
      else {
        const markdown = splitContractTests(context.internal.run()?.contractTests, CONTRACT_PATH.exec(selectedFile)?.[1]);
        disclosure.append(renderedMarkdown(document, markdown));
      }
      body.append(disclosure);
    }

    function render() {
      const open = new Set([...body.querySelectorAll?.("details[data-disclosure][open]") ?? []]
        .map(disclosure => disclosure.dataset.disclosure));
      // A render behind another (validation returning) finds focus on the
      // body, because the earlier restore has not landed yet; carry the last
      // known state until a restore has actually put focus back in the body.
      const focus = pendingFocus ?? focusState() ?? (body.contains(document.activeElement) ? undefined : lastFocus);
      lastFocus = focus;
      pendingFocus = undefined;
      activeForms.forEach(form => form.destroy());
      activeForms = [];
      activeTables.forEach(table => table.destroy());
      activeTables = [];
      body.replaceChildren();
      const selection = context.services.selection.current();
      const match = ["contract", "contract-value"].includes(selection?.kind) ? CONTRACT_PATH.exec(selection.file ?? "") : undefined;
      context.surface.empty(!match);
      if (!match) { selectedFile = ""; return; }
      const previousFile = selectedFile;
      selectedFile = selection.file;
      if (previousFile !== selectedFile) {
        shownChangelog = [];
      }
      const updateNotice = context.internal.takeUpdateNotice?.(selectedFile);
      if (updateNotice) { shownUpdateFile = selectedFile; shownChangelog = updateNotice.changelog ?? []; }
      if (context.internal.consumeDuplicateCheck?.(selectedFile)) takeDuplicateSnapshot();
      pendingValue = selection.kind === "contract-value" ? String(selection.name ?? "").split(".").at(-1) : "";
      const adoption = parseJson(context.package.read(selectedFile));
      if (!plainObject(adoption)) return;
      const packName = `${adoption.contract}-${adoption.version}.pack.json`;
      const pack = parseJson(context.package.read(`contracts/${packName}`));
      const checked = plainObject(pack);
      const intro = element(document, "header", undefined, "opengdd-author-contract-intro");
      const mode = element(document, "p", undefined, "opengdd-author-contract-mode");
      renderBackticks(mode, checked ? CONTRACT_COPY.modeChecked(packName) : CONTRACT_COPY.modePromised);
      const rename = element(document, "button", CONTRACT_COPY.renameButton);
      rename.type = "button";
      rename.dataset.contractRename = "";
      rename.addEventListener("click", () => context.internal.rename(rename, selectedFile));
      intro.append(element(document, "p", adoption.summary ?? ""), mode,
        element(document, "p", `${adoption.contract}, version ${adoption.version}`, "opengdd-author-contract-version"), rename);
      body.append(intro);
      if (context.internal.hasStartingPoint?.(adoption)) {
        const review = element(document, "button", "Review behavior and tuning");
        review.type = "button";
        review.addEventListener("click", () => context.internal.openStartingPoint(selectedFile));
        intro.prepend(review);
      }
      const outlineEntity = context.internal.view()?.mechanisms?.find(mechanism => mechanism.id === "contracts")
        ?.entities.find(entity => entity.file === selectedFile);
      if (outlineEntity) {
        const open = element(document, "button", WIDGET_COPY.showInFile(selectedFile));
        open.type = "button";
        open.addEventListener("click", () => context.internal.openLocation(outlineEntity));
        intro.append(open);
      }
      if (outlineEntity?.citations?.length) {
        const citations = referenceGroup(context, { label: INSPECTOR_COPY.citations,
          help: INSPECTOR_COPY.citationsHelp,
          rows: [locationRows(context, outlineEntity.citations, { reveal: citation => context.internal.revealLocation(citation) })] });
        body.append(citations);
      }
      if (shownUpdateFile === selectedFile) changelogSection(shownChangelog);
      duplicateSection(adoption, duplicateSnapshotFile === selectedFile ? visibleDuplicateWarnings(adoption) : []);
      const activation = contractAdoptionActivation(adoption);
      questionSection(adoption, activation);
      valuesSection(adoption, activation);
      if (checked) testInputsSection(adoption, pack);
      rowsSection(adoption);
      whatsLeftSection(adoption);
      testsSection(adoption, checked);
      for (const disclosure of body.querySelectorAll?.("details[data-disclosure]") ?? []) {
        disclosure.open = open.has(disclosure.dataset.disclosure);
      }
      if (pendingValue) queueMicrotask(() => jump(valueNode(pendingValue)));
      else if (focus) {
        // Restore once the DOM has settled; a second render queued behind this
        // one (validation returning) would otherwise see focus on the body and
        // remember nothing. The frame retry covers that case.
        queueMicrotask(() => restoreFocus(focus));
        const view = document.defaultView;
        view?.requestAnimationFrame?.(() => { if (!body.contains(document.activeElement)) restoreFocus(focus); });
      }
    }

    const cancelSelection = context.services.selection.subscribe(queueRender);
    const cancelPackage = context.package.subscribe(event => {
      let snapshotChanged = false;
      if (duplicateSnapshotFile) {
        const after = context.package.read(duplicateSnapshotFile) ?? "";
        const acceptedOnly = event.paths?.length === 1 && event.paths[0] === duplicateSnapshotFile
          && onlyAcceptedAnnotationChanged(duplicateSnapshotSource, after);
        if (acceptedOnly) duplicateSnapshotSource = after;
        else {
          clearDuplicateSnapshot();
          publishDuplicateWarnings([]);
        }
        snapshotChanged = true;
      }
      if (event.type === "opened" || event.paths?.includes(selectedFile) || snapshotChanged) queueRender();
    });
    const cancelValidation = context.internal.subscribe(queueRender);
    render();
    return { destroy() {
      context.internal.setDuplicateWarnings?.([]);
      cancelSelection(); cancelPackage(); cancelValidation();
      activeForms.forEach(form => form.destroy());
      activeForms = [];
      activeTables.forEach(table => table.destroy());
      activeTables = [];
      body.remove();
    } };
  }
};
