import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import {
  createMeasuredPromise, directionPromiseCoverage, directionPromiseFields, directionPromiseSections,
  routeDirectionPromiseFinding
} from "../../src/direction-fields.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { kindDefinition } from "../../src/kinds.mjs";
import { parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";

const PROMISE_KINDS = Object.freeze(["colors", "contrast", "timing"]);

function directionPromiseEntity(selection, files) {
  if (!PROMISE_KINDS.includes(selection?.kind) || selection.file !== "direction.json"
    || !selection.name?.startsWith(`${selection.kind}.`)) return null;
  const id = selection.name.slice(selection.kind.length + 1);
  const text = files.get("direction.json");
  const direction = parseJson(text);
  if (!plainObject(direction?.[selection.kind]?.[id])) return null;
  const at = pointer([selection.kind, id]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  return {
    id,
    kind: selection.kind,
    address: `${selection.kind}.${id}`,
    title: id,
    kindLabel: kindDefinition(selection.kind).labels.singular,
    file: "direction.json",
    pointer: at,
    range,
    value: direction[selection.kind][id],
    document: direction,
    text,
    kindCount: Object.keys(direction[selection.kind]).length
  };
}

const creator = (kind, label, help) => ({
  kind,
  label,
  help,
  needs: ["edits"],
  run: (context, request = {}) => createMeasuredPromise(context, { ...request, type: kind })
});

const directionPromiseShape = Object.freeze({
  id: "direction-promise",
  match: directionPromiseEntity,
  fields: directionPromiseFields,
  sections: directionPromiseSections,
  findings: { route: routeDirectionPromiseFinding, files: ["05-build-plan.md"] },
  rename: entity => entity.address,
  onRenamed(context, entity, next) {
    const id = String(next).replace(new RegExp(`^${entity.kind}\\.`), "");
    let range;
    try { range = pointerRange(context.package.read("direction.json"), pointer([entity.kind, id])); } catch {}
    context.services.selection.select({ kind: entity.kind, name: `${entity.kind}.${id}`, file: "direction.json", range });
  }
});

const descriptor = {
  api: 1,
  id: "opengdd.direction-promise",
  title: INSPECTOR_COPY.directionPromiseTitle,
  surfaces: ["inspector"],
  inspects: { kinds: PROMISE_KINDS },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.directionPromiseEmpty },
  creates: [
    creator("colors", INSPECTOR_COPY.promiseColorKind, INSPECTOR_COPY.newMeasuredPromiseHelp),
    creator("contrast", INSPECTOR_COPY.promiseContrastKind, INSPECTOR_COPY.newMeasuredPromiseHelp),
    creator("timing", INSPECTOR_COPY.promiseTimingKind, INSPECTOR_COPY.newMeasuredPromiseHelp)
  ],
  create(context) {
    const shape = { ...directionPromiseShape, compact: "reflow", remove(entity) {
      const tests = directionPromiseCoverage(context.package, entity.address).map(test => test.id);
      const references = context.services.references.usages(entity.address);
      const otherReferences = references.filter(site => site.kind !== "direction-claim").length;
      return {
        pointer: entity.kindCount === 1 ? pointer([entity.kind]) : entity.pointer,
        label: entity.title,
        expectedFindings: [
          { code: "DIRECTION_CLAIMS_DANGLING", address: entity.address },
          { code: "PROSE_CITATION_DANGLING", address: entity.address }
        ],
        question: () => INSPECTOR_COPY.removeDirectionPromiseQuestion(entity.title, tests, otherReferences)
      };
    } };
    return createEntityInspector(context, shape);
  }
};

export default descriptor;
