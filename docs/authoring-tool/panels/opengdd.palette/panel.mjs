import { INSPECTOR_COPY } from "../../src/copy/inspector-copy.mjs";
import { kebabName } from "../../src/creation.mjs";
import { paletteFields, paletteSections, paletteUses, routePaletteFinding } from "../../src/direction-fields.mjs";
import { createEntityInspector } from "../../src/inspector-kit.mjs";
import { parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { pointerRange } from "../../src/json-pointer-lines.mjs";

const localPaletteName = value => String(value ?? "").replace(/^palette\./, "")
  .split(".").map(kebabName).filter(Boolean).join(".");

const createPalette = (context, request = {}) => context.internal.create(
  "Palette", request.anchor, localPaletteName(request.name) || undefined);

function paletteEntity(selection, files) {
  if (selection?.kind !== "palette" || selection.file !== "direction.json" || !selection.name?.startsWith("palette.")) return null;
  const id = selection.name.slice("palette.".length);
  const direction = parseJson(files.get("direction.json"));
  if (!plainObject(direction?.palette) || !Array.isArray(direction.palette[id])) return null;
  const at = pointer(["palette", id]);
  let range;
  try { range = pointerRange(files.get("direction.json"), at); } catch {}
  return { id, address: `palette.${id}`, title: id, kindLabel: INSPECTOR_COPY.paletteKind,
    file: "direction.json", pointer: at, range, entries: direction.palette[id], paletteCount: Object.keys(direction.palette).length };
}

const paletteShape = Object.freeze({
  id: "palette",
  match: paletteEntity,
  fields: paletteFields,
  sections: paletteSections,
  findings: { route: routePaletteFinding },
  rename: entity => entity.address,
  onRenamed(context, _entity, next) {
    const id = String(next).replace(/^palette\./, "");
    let range;
    try { range = pointerRange(context.package.read("direction.json"), pointer(["palette", id])); } catch {}
    context.services.selection.select({ kind: "palette", name: `palette.${id}`, file: "direction.json", range });
  }
});

const descriptor = {
  api: 1,
  id: "opengdd.palette",
  title: INSPECTOR_COPY.paletteTitle,
  surfaces: ["inspector"],
  inspects: { kinds: ["palette"] },
  needs: ["selection", "edits", "validation", "forms", "references"],
  empty: { title: INSPECTOR_COPY.paletteEmpty },
  creates: [{
    kind: "palette", label: INSPECTOR_COPY.paletteTitle, help: INSPECTOR_COPY.newPaletteHelp,
    requires: ["name"], needs: ["edits"], run: createPalette
  }],
  create(context) {
    const shape = { ...paletteShape, compact: "reflow", remove(entity) {
      const uses = paletteUses(context.package, entity.id);
      const colourAddresses = entity.entries.flatMap(entry => plainObject(entry)
        ? Object.keys(entry).map(name => `${entity.address}.${name}`) : []);
      const expectedFindings = [
        { code: "PROSE_CITATION_DANGLING", address: entity.address },
        { code: "DIRECTION_MOOD_PALETTE_DANGLING", address: entity.address },
        ...colourAddresses.flatMap(address => [
          { code: "PROSE_CITATION_DANGLING", address },
          { code: "DIRECTION_COLOR_DANGLING", address }
        ])
      ];
      return { pointer: entity.paletteCount === 1 ? "/palette" : entity.pointer,
        label: entity.title, expectedFindings,
        question: count => INSPECTOR_COPY.removePaletteQuestion(entity.title, uses.map(use => use.name), count) };
    } };
    return createEntityInspector(context, shape);
  }
};

export default descriptor;
