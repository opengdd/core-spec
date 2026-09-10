import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import {
  clockDependencies, clockFieldGroups, clockSections, createClock, modeIds, routeClockFinding
} from "../../src/clock-fields.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";

function clockEntity(selection, files, context) {
  if (selection?.kind !== "clock" || selection.file !== "clocks.json") return null;
  const text = files.get("clocks.json");
  const clocks = parseJson(text);
  if (!plainObject(clocks)) return null;
  const id = String(selection.name ?? "").replace(/^clocks\./u, "");
  if (!Object.hasOwn(clocks, id)) return null;
  const at = pointer([id]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  const value = clocks[id];
  const entry = context.internal.entry?.();
  return {
    id,
    address: `clocks.${id}`,
    title: id,
    kindLabel: INSPECTOR_COPY.clockKind,
    file: "clocks.json",
    pointer: at,
    range,
    value,
    advances: Array.isArray(value?.advances) ? value.advances : [],
    modeIds: modeIds(files),
    clockCount: Object.keys(clocks).length,
    citations: entry?.citations ?? []
  };
}

const descriptor = {
  api: 1,
  id: "opengdd.clock",
  title: INSPECTOR_COPY.clockTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["clock"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.clockEmpty },
  creates: [{
    kind: "clock", label: INSPECTOR_COPY.newClock, help: INSPECTOR_COPY.newClockHelp,
    requires: ["name"], needs: ["edits"], run: createClock
  }],
  create(context) {
    const shape = {
      id: "clock",
      compact: "reflow",
      match: (selection, files) => clockEntity(selection, files, context),
      fieldGroups: clockFieldGroups,
      sections: clockSections,
      findings: { route: routeClockFinding },
      rename: entity => entity.address,
      onRenamed(shapeContext, _entity, next) {
        const id = String(next).replace(/^clocks\./u, "");
        let range;
        try { range = pointerRange(shapeContext.package.read("clocks.json"), pointer([id])); } catch {}
        shapeContext.services.selection.select({ kind: "clock", name: `clocks.${id}`, file: "clocks.json", range });
      },
      remove(entity) {
        const dependencies = clockDependencies(context, entity);
        return {
          pointer: entity.pointer,
          removeFile: entity.clockCount === 1,
          label: entity.title,
          expectedFindings: [
            ...dependencies.advances.map(address => ({ code: "RUNTIME_UNDECLARED", address })),
            ...dependencies.citations.map(() => ({ code: "PROSE_CITATION_DANGLING", address: entity.address }))
          ],
          question: () => INSPECTOR_COPY.removeClockQuestion(
            entity.id, dependencies.advances, dependencies.citations)
        };
      }
    };
    return createEntityInspector(context, shape);
  }
};

export { clockEntity, createClock };
export default descriptor;
