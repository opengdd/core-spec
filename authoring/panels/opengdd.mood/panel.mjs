import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { kebabName } from "../../src/creation.mjs";
import { moodFieldGroups, moodFields, moodSections, routeMoodFinding } from "../../src/direction-fields.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";

const localMoodName = value => kebabName(String(value ?? "").replace(/^mood\./, ""));
const createMood = (context, request = {}) => context.internal.create(
  "Mood", request.anchor, localMoodName(request.name) || undefined);

function moodEntity(selection, files) {
  if (selection?.kind !== "mood" || selection.file !== "direction.json" || !selection.name?.startsWith("mood.")) return null;
  const id = selection.name.slice("mood.".length);
  const text = files.get("direction.json");
  const direction = parseJson(text);
  if (!plainObject(direction?.mood?.[id])) return null;
  const at = pointer(["mood", id]);
  let range;
  try { range = pointerRange(text, at); } catch {}
  return {
    id, address: `mood.${id}`, title: id, kindLabel: INSPECTOR_COPY.moodKind,
    file: "direction.json", pointer: at, range, value: direction.mood[id], document: direction, text,
    moodCount: Object.keys(direction.mood).length
  };
}

const moodShape = Object.freeze({
  id: "mood",
  match: moodEntity,
  fields: moodFields,
  fieldGroups: moodFieldGroups,
  sections: moodSections,
  findings: { route: routeMoodFinding },
  rename: entity => entity.address,
  onRenamed(context, _entity, next) {
    const id = String(next).replace(/^mood\./, "");
    let range;
    try { range = pointerRange(context.package.read("direction.json"), pointer(["mood", id])); } catch {}
    context.services.selection.select({ kind: "mood", name: `mood.${id}`, file: "direction.json", range });
  }
});

const descriptor = {
  api: 1,
  id: "opengdd.mood",
  title: INSPECTOR_COPY.moodTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["mood"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.moodEmpty },
  creates: [{
    kind: "mood", label: INSPECTOR_COPY.moodTitle, help: INSPECTOR_COPY.newMoodHelp,
    requires: ["name"], needs: ["edits"], run: createMood
  }],
  create(context) {
    const shape = { ...moodShape, compact: "reflow", remove(entity) {
      return {
        pointer: entity.moodCount === 1 ? "/mood" : entity.pointer, label: entity.title,
        expectedFindings: [{ code: "PROSE_CITATION_DANGLING", address: entity.address }],
        question: count => INSPECTOR_COPY.removeMoodQuestion(entity.title, count)
      };
    } };
    return createEntityInspector(context, shape);
  }
};

export default descriptor;
