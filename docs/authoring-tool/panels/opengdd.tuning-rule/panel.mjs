import { evaluateRule, parseRule } from "opengdd-validation";
import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";
import {
  routeTuningRuleFinding, tuningRuleFields, tuningRuleSections, tuningRuleState
} from "../../src/tuning-fields.mjs";

function tuningRuleEntity(selection, files) {
  if (selection?.kind !== "rule") return null;
  if (selection.file !== "tuning.json") return {
    id: selection.name,
    title: selection.name,
    kindLabel: INSPECTOR_COPY.tuningProseRuleKind,
    file: selection.file,
    range: selection.range,
    emptyState: INSPECTOR_COPY.tuningProseRuleEmpty(selection.name)
  };
  const text = files.get("tuning.json");
  const tuning = parseJson(text);
  if (!plainObject(tuning?.rules) || !Object.hasOwn(tuning.rules, selection.name)) return null;
  const at = pointer(["rules", selection.name]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  const values = new Map(Object.entries(plainObject(tuning.values) ? tuning.values : {}));
  return {
    id: selection.name,
    address: selection.name,
    title: selection.name,
    kindLabel: INSPECTOR_COPY.tuningRuleKind,
    file: "tuning.json",
    pointer: at,
    range,
    source: tuning.rules[selection.name],
    values,
    ruleState: tuningRuleState(tuning.rules[selection.name], values, { parseRule, evaluateRule }),
    ruleCount: Object.keys(tuning.rules).length
  };
}

const descriptor = {
  api: 1,
  id: "opengdd.tuning-rule",
  title: INSPECTOR_COPY.tuningRuleTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["rule"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.tuningRuleEmpty },
  create(context) {
    const shape = {
      id: "tuning-rule",
      compact: "reflow",
      match: tuningRuleEntity,
      fields: (shapeContext, entity) => tuningRuleFields(shapeContext, entity, { parseRule, evaluateRule }),
      sections: tuningRuleSections,
      findings: { route: routeTuningRuleFinding },
      rename: entity => entity.address,
      onRenamed(shapeContext, _entity, next) {
        let range;
        try { range = pointerRange(shapeContext.package.read("tuning.json"), pointer(["rules", next])); } catch {}
        shapeContext.services.selection.select({ kind: "rule", name: next, file: "tuning.json", range });
      },
      remove(entity) {
        const citations = context.services.references.usages(entity.address).filter(site => site.channel === "prose");
        return {
          pointer: entity.ruleCount === 1 ? "/rules" : entity.pointer,
          label: entity.title,
          expectedFindings: citations.map(() => ({ code: "PROSE_CITATION_DANGLING", address: `rules.${entity.id}` })),
          question: () => INSPECTOR_COPY.removeTuningRuleQuestion(entity.id, citations.length)
        };
      }
    };
    return createEntityInspector(context, shape);
  }
};

export { tuningRuleEntity };
export default descriptor;
