import { evaluateRule, parseRule } from "opengdd-validation";
import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { kebabName } from "../../src/creation.mjs";
import { createMeasuredPromise, directionMechanismFieldGroups, directionMechanismFields, directionMechanismSections, routeDirectionFinding } from "../../src/direction-fields.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";
import { mechanismCreate, mechanismEntity, mechanismSections } from "../../src/mechanism-view.mjs";
import { tuningMechanismFields, tuningMechanismSections } from "../../src/tuning-fields.mjs";
import { createClock, routeTimeFinding, timeMechanismFields, timeMechanismSections } from "../../src/clock-fields.mjs";
import {
  personalizationMechanismFields, personalizationMechanismSections, routePersonalizationFinding
} from "../../src/personalization-fields.mjs";

const createValue = (context, request = {}) => {
  const name = String(request.name ?? "").split(".").map(kebabName).filter(Boolean).join(".");
  return context.internal.create("Value", request.anchor, name || undefined);
};
const createRule = (context, request = {}) => context.internal.create(
  "Rule", request.anchor, kebabName(String(request.name ?? "").replace(/^rules\./, "")) || undefined);
const createMood = (context, request = {}) => context.internal.create(
  "Mood", request.anchor, kebabName(String(request.name ?? "").replace(/^mood\./, "")) || undefined);
const createPalette = (context, request = {}) => context.internal.create(
  "Palette", request.anchor, String(request.name ?? "").replace(/^palette\./, "")
    .split(".").map(kebabName).filter(Boolean).join(".") || undefined);
const createQuestion = (context, request = {}) => context.internal.create(
  "Question", request.anchor, kebabName(String(request.name ?? "").replace(/^questions?\./u, "")) || undefined);

const mechanismShape = Object.freeze({
  id: "mechanism",
  kinds: ["mechanism"],
  match(selection, _files, context) { return mechanismEntity(context, selection); },
  fields(context, entity) {
    if (entity.id === "tuning") return tuningMechanismFields(context, entity);
    if (entity.id === "time") return timeMechanismFields(context, entity);
    if (entity.id === "personalization") return personalizationMechanismFields(context, entity);
    return entity.id === "direction" ? directionMechanismFields(context, entity) : [];
  },
  fieldGroups(context, entity) {
    return entity.id === "direction" ? directionMechanismFieldGroups(context, entity) : undefined;
  },
  sections(context, entity) {
    if (entity.id === "tuning") return tuningMechanismSections(context, entity, { parseRule, evaluateRule });
    if (entity.id === "time") return timeMechanismSections(context, entity);
    if (entity.id === "personalization") return personalizationMechanismSections(context, entity);
    return entity.id === "direction" ? directionMechanismSections(context, entity) : mechanismSections(context, entity);
  },
  findings: { route(finding, entity) {
    if (entity.id === "direction") return routeDirectionFinding(finding, entity);
    if (entity.id === "time") return routeTimeFinding(finding, entity);
    if (entity.id === "personalization") return routePersonalizationFinding(finding, entity);
    return ["TUNING_RULE_FAILED", "TUNING_RULE_INVALID"].includes(finding.code) ? "header" : null;
  }, files(context, entity) {
    return ["time", "personalization"].includes(entity.id)
      ? context.package.list().filter(file => typeof context.package.read(file) === "string") : [];
  } },
  create(context, entity) {
    if (entity.id === "tuning") return [
      { kind: "value", label: INSPECTOR_COPY.newValue, help: INSPECTOR_COPY.newValueHelp, run: createValue },
      { kind: "rule", label: INSPECTOR_COPY.newRule, help: INSPECTOR_COPY.newRuleHelp, run: createRule, dataset: "createRule" }
    ];
    if (entity.id === "direction") return [
      { kind: "mood", label: INSPECTOR_COPY.newMood, help: INSPECTOR_COPY.newMoodHelp, run: createMood, dataset: "createMood" },
      { kind: "palette", label: INSPECTOR_COPY.newPalette, help: INSPECTOR_COPY.newPaletteHelp, run: createPalette, dataset: "createPalette" },
      { kind: "direction-promise", label: INSPECTOR_COPY.newMeasuredPromise, help: INSPECTOR_COPY.newMeasuredPromiseHelp,
        run: createMeasuredPromise, dataset: "createMeasuredPromise" }
    ];
    if (entity.id === "time") return {
      kind: "clock", label: INSPECTOR_COPY.newClock, help: INSPECTOR_COPY.newClockHelp,
      run: createClock, dataset: "createClock"
    };
    if (entity.id === "personalization") return {
      kind: "question", label: INSPECTOR_COPY.newQuestion, help: INSPECTOR_COPY.newQuestionHelp,
      run: createQuestion, dataset: "createQuestion"
    };
    return mechanismCreate(context, entity);
  }
});

const descriptor = {
  api: 1,
  id: "opengdd.mechanism",
  title: INSPECTOR_COPY.mechanismTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["mechanism"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.tuningEmpty },
  creates: [{
    kind: "value", label: INSPECTOR_COPY.newValue, help: INSPECTOR_COPY.newValueHelp,
    needs: ["edits"], run: createValue
  }, {
    kind: "rule", label: INSPECTOR_COPY.newRule, help: INSPECTOR_COPY.newRuleHelp,
    needs: ["edits"], run: createRule
  }, {
    kind: "mood", label: INSPECTOR_COPY.newMood, help: INSPECTOR_COPY.newMoodHelp,
    requires: ["name"], needs: ["edits"], run: createMood
  }, {
    kind: "palette", label: INSPECTOR_COPY.newPalette, help: INSPECTOR_COPY.newPaletteHelp,
    requires: ["name"], needs: ["edits"], run: createPalette
  }, {
    kind: "clock", label: INSPECTOR_COPY.newClock, help: INSPECTOR_COPY.newClockHelp,
    requires: ["name"], needs: ["edits"], run: createClock
  }, {
    kind: "question", label: INSPECTOR_COPY.newQuestion, help: INSPECTOR_COPY.newQuestionHelp,
    needs: ["edits"], run: createQuestion
  }],
  create(context) {
    const shape = { ...mechanismShape, compact: "summary", match(selection, files) {
      const matched = mechanismShape.match(selection, files, context);
      let entity = matched?.id === "time" ? {
            ...matched,
            runtimeNames: (context.internal.view?.()?.routables ?? [])
              .filter(entry => entry.kind === "runtime").map(entry => entry.name)
          } : matched;
      if (!entity || !entity.file) return entity;
      try {
        const text = context.package.read(entity.file);
        entity = { ...entity, text, document: parseJson(text) };
        return entity.range ? entity : { ...entity, range: pointerRange(text, "") };
      } catch { return entity; }
    } };
    return createEntityInspector(context, shape);
  }
};

export default descriptor;
