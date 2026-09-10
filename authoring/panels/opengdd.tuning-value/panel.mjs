import { evaluateRule, parseRule } from "opengdd-validation";
import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { rangeChange, rangeRemovalRefusal } from "../../src/creation.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { packageFiles, parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";
import {
  routeTuningValueFinding, tuningValueDependencies, tuningValueFields, tuningValueSections
} from "../../src/tuning-fields.mjs";

function tuningValueEntity(selection, files, context) {
  if (selection?.kind !== "value" || selection.file !== "tuning.json") return null;
  const text = files.get("tuning.json");
  const tuning = parseJson(text);
  if (!plainObject(tuning?.values) || !Object.hasOwn(tuning.values, selection.name)) return null;
  const at = pointer(["values", selection.name]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  const sourceRange = tuning.ranges?.[selection.name];
  const dependencies = tuningValueDependencies(context, selection.name, { parseRule, evaluateRule });
  const entry = context.internal.entry?.();
  return {
    id: selection.name,
    address: selection.name,
    title: selection.name,
    kindLabel: INSPECTOR_COPY.tuningValueKind,
    file: "tuning.json",
    pointer: at,
    range,
    value: tuning.values[selection.name],
    bounds: sourceRange,
    rangeRefusal: Array.isArray(sourceRange) ? rangeRemovalRefusal(files, selection.name) : undefined,
    ruleNames: dependencies.rules.map(rule => rule.name),
    sameNumberWarnings: entry?.sameNumberWarnings ?? []
  };
}

const descriptor = {
  api: 1,
  id: "opengdd.tuning-value",
  title: INSPECTOR_COPY.tuningValueTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["value"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.tuningValueEmpty },
  create(context) {
    const dismissed = new Set();
    const shape = {
      id: "tuning-value",
      compact: "reflow",
      match: (selection, files) => tuningValueEntity(selection, files, context),
      fields: tuningValueFields,
      sections: (shapeContext, entity) => tuningValueSections(shapeContext, entity, {
        dismissed, ruleTools: { parseRule, evaluateRule }, rangePlanner: rangeChange
      }),
      findings: { route: routeTuningValueFinding },
      rename: entity => entity.address,
      normalizeRename: value => value.trim(),
      onRenamed(shapeContext, _entity, next) {
        let range;
        try { range = pointerRange(shapeContext.package.read("tuning.json"), pointer(["values", next])); } catch {}
        shapeContext.services.selection.select({ kind: "value", name: next, file: "tuning.json", range });
      },
      remove(entity) {
        const dependencies = tuningValueDependencies(context, entity.id, { parseRule, evaluateRule });
        const rangeExists = plainObject(parseJson(context.package.read("tuning.json"))?.ranges)
          && Object.hasOwn(parseJson(context.package.read("tuning.json")).ranges, entity.id);
        return {
          pointer: entity.pointer,
          pointers: rangeExists ? [pointer(["ranges", entity.id]), entity.pointer] : [entity.pointer],
          label: entity.title,
          expectedFindings: [
            ...dependencies.rules.map(() => ({ code: "TUNING_RULE_INVALID", address: entity.id })),
            ...dependencies.questions.map(() => ({ code: "PERSONALIZATION_SETS_TARGET" })),
            ...dependencies.promises.map(() => ({ code: "DIRECTION_TIMING_KEY", address: entity.id })),
            ...dependencies.citations.map(() => ({ code: "PROSE_CITATION_DANGLING", address: entity.id }))
          ],
          question: () => INSPECTOR_COPY.removeTuningValueQuestion(entity.id, {
            citations: dependencies.citations,
            contracts: dependencies.contracts,
            range: rangeExists,
            rules: dependencies.rules.map(rule => rule.name),
            questions: dependencies.questions.map(question => question.id),
            promises: dependencies.promises.map(promise => promise.name)
          })
        };
      }
    };
    return createEntityInspector(context, shape);
  }
};

export { tuningValueEntity };
export default descriptor;
