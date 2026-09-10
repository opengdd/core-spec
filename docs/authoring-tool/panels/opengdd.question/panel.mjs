import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";
import {
  questionFieldGroups, questionKeys, questionSections, routeQuestionFinding
} from "../../src/question-fields.mjs";

const createQuestion = (context, request = {}) => context.internal.create("Question", request.anchor, request.name);

export function questionEntity(selection, files) {
  if (selection?.kind !== "question" || selection.file !== "personalization.json") return null;
  const text = files.get("personalization.json");
  const document = parseJson(text);
  if (!Array.isArray(document?.questions)) return null;
  const index = document.questions.findIndex(question => question?.id === selection.name);
  if (index < 0) return null;
  const at = pointer(["questions", index]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  const value = document.questions[index];
  return {
    id: value.id,
    address: value.id,
    title: value.id,
    kindLabel: INSPECTOR_COPY.questionKind,
    file: "personalization.json",
    pointer: at,
    range,
    index,
    value,
    document,
    text
  };
}

const descriptor = {
  api: 1,
  id: "opengdd.question",
  title: INSPECTOR_COPY.questionTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["question"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.questionEmpty },
  creates: [{
    kind: "question", label: INSPECTOR_COPY.newQuestion, help: INSPECTOR_COPY.newQuestionHelp,
    needs: ["edits"], run: createQuestion
  }],
  create(context) {
    return createEntityInspector(context, {
      id: "question",
      compact: "reflow",
      match: questionEntity,
      fieldGroups: questionFieldGroups,
      sections: questionSections,
      findings: {
        route: routeQuestionFinding,
        files: shapeContext => shapeContext.package.list().filter(file => /\.md$/iu.test(file))
      },
      rename: entity => entity.address,
      onRenamed(shapeContext, _entity, next) {
        const text = shapeContext.package.read("personalization.json");
        const document = parseJson(text);
        const index = Array.isArray(document?.questions) ? document.questions.findIndex(question => question?.id === next) : -1;
        let range;
        try { range = pointerRange(text, pointer(["questions", index])); } catch {}
        shapeContext.services.selection.select({ kind: "question", name: next, file: "personalization.json", range });
      },
      remove(entity) {
        const citations = context.services.references.usages(entity.id).filter(site => site.channel === "prose");
        return {
          pointer: entity.pointer,
          label: entity.id,
          expectedFindings: citations.map(() => ({ code: "PERSONALIZATION_TAG_DANGLING", address: entity.id })),
          question: () => INSPECTOR_COPY.removeQuestionQuestion(entity.id, citations, questionKeys(entity.value))
        };
      }
    });
  }
};

export default descriptor;
