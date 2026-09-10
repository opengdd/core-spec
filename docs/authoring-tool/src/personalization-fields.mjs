import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";
import { parseJson, pointer } from "./json-path.mjs";
import { pointerRange } from "./json-pointer-lines.mjs";
import { questionKeys } from "./question-fields.mjs";
import { entityChips, referenceGroup } from "./inspector-groups.mjs";

const FILE = "personalization.json";

const questionsFrom = context => {
  const document = parseJson(context.package.read(FILE));
  return Array.isArray(document?.questions) ? document.questions : [];
};

export async function moveQuestion(context, index, next) {
  const questions = questionsFrom(context);
  if (index < 0 || index >= questions.length || next < 0 || next >= questions.length || index === next) return false;
  const value = questions[index];
  const transaction = context.internal.begin(INSPECTOR_COPY.moveQuestionUndo);
  const json = transaction.json(FILE);
  json.remove(pointer(["questions", index]));
  json.insert(pointer(["questions"]), next, value, { pretty: true });
  await transaction.commit();
  context.internal.focusField?.(FILE, `question-${next}`);
  return true;
}

const jumpQuestion = (context, question, index) => {
  let range;
  try { range = pointerRange(context.package.read(FILE), pointer(["questions", index])); } catch {}
  context.services.selection.select({ kind: "question", name: question.id, file: FILE, range });
};

export function personalizationMechanismFields() {
  return [];
}

export function personalizationMechanismSections(context) {
  const questions = questionsFrom(context);
  const entries = questions.map((question, index) => {
      const id = typeof question?.id === "string" ? question.id : String(index + 1);
      const up = element(context.document, "button", INSPECTOR_COPY.listMoveUp);
      up.type = "button";
      up.dataset.personalizationMoveUp = String(index);
      up.setAttribute("aria-label", INSPECTOR_COPY.listMoveUpLabel(id));
      up.disabled = index === 0;
      up.addEventListener("click", () => Promise.resolve(moveQuestion(context, index, index - 1))
        .catch(error => { up.title = error.message; }));
      const down = element(context.document, "button", INSPECTOR_COPY.listMoveDown);
      down.type = "button";
      down.dataset.personalizationMoveDown = String(index);
      down.setAttribute("aria-label", INSPECTOR_COPY.listMoveDownLabel(id));
      down.disabled = index === questions.length - 1;
      down.addEventListener("click", () => Promise.resolve(moveQuestion(context, index, index + 1))
        .catch(error => { down.title = error.message; }));
      const actions = element(context.document, "span", undefined, "opengdd-author-reference-row-actions");
      actions.append(up, down);
      return { name: id, kind: INSPECTOR_COPY.questionKind,
        detail: INSPECTOR_COPY.personalizationQuestionRow(id, String(question?.prompt ?? ""),
          String(question?.type ?? ""), questionKeys(question)),
        after: actions, findingKey: `question-${index}`,
        rowDataset: { personalizationQuestion: id }, dataset: { personalizationOpenQuestion: id },
        question, index };
  });
  const ordered = referenceGroup(context, { label: INSPECTOR_COPY.personalizationQuestions,
    help: entries.length ? INSPECTOR_COPY.personalizationQuestionsHelp : INSPECTOR_COPY.personalizationNoQuestions,
    rows: entries.length ? [entityChips(context, entries, { open: entry => jumpQuestion(context, entry.question, entry.index) })] : [] });
  ordered.dataset.personalizationQuestions = "";
  return [ordered];
}

const pointerIndex = message => Number(/#?\/questions\/(\d+)/u.exec(String(message ?? ""))?.[1]);

export function routePersonalizationFinding(finding, entity) {
  if (finding.code === "PERSONALIZATION_JSON") return false;
  if (!["PERSONALIZATION", "PERSONALIZATION_TAG_DANGLING"].includes(finding.code)
    && !String(finding.code ?? "").startsWith("PERSONALIZATION_")) return false;
  const index = pointerIndex(finding.message);
  const questions = Array.isArray(entity.document?.questions) ? entity.document.questions : [];
  if (Number.isInteger(index) && index >= 0 && index < questions.length) return `question-${index}`;
  const namedIndex = questions.findIndex(question => typeof question?.id === "string"
    && (String(finding.message ?? "").includes(`\`${question.id}\``)
      || String(finding.message ?? "").includes(JSON.stringify(question.id))));
  return namedIndex >= 0 ? `question-${namedIndex}` : "header";
}
