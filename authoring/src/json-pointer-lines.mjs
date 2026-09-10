import { walkJsonDocument } from "./edits-json.mjs";
import { offsetToPosition } from "./text-coordinates.mjs";
import { pointerSegment } from "./json-path.mjs";

const parts = pointer => pointer === "" ? [] : pointer.slice(1).split("/").map(part => {
  if (/~(?:[^01]|$)/u.test(part)) throw new Error(`JSON Pointer ${JSON.stringify(pointer)} has an invalid ~ escape.`);
  return part.replaceAll("~1", "/").replaceAll("~0", "~");
});

function child(node, part, pointer) {
  if (node.type === "object") {
    const property = node.properties.find(item => item.key === part);
    if (!property) throw new Error(`JSON Pointer ${JSON.stringify(pointer)} does not exist.`);
    return property.value;
  }
  if (node.type === "array" && /^(?:0|[1-9]\d*)$/u.test(part) && Number(part) < node.elements.length) {
    return node.elements[Number(part)];
  }
  throw new Error(`JSON Pointer ${JSON.stringify(pointer)} does not exist.`);
}

const startOf = node => node.parent?.type === "object" && node.slot?.keyToken ? node.slot.keyToken.start : node.start;

export function pointerRange(text, pointer) {
  if (typeof pointer !== "string" || pointer !== "" && !pointer.startsWith("/")) throw new Error("Use a JSON Pointer beginning with /.");
  let node = walkJsonDocument(text);
  for (const part of parts(pointer)) node = child(node, part, pointer);
  const start = offsetToPosition(text, startOf(node));
  const end = offsetToPosition(text, node.end);
  return { start, end, line: start.line + 1 };
}

export function pointerAtLine(text, line) {
  if (!Number.isInteger(line) || line < 1) return undefined;
  const root = walkJsonDocument(text);
  let best;
  const visit = (node, path) => {
    const range = {
      start: offsetToPosition(text, startOf(node)),
      end: offsetToPosition(text, node.end)
    };
    if (line >= range.start.line + 1 && line <= range.end.line + 1) best = path;
    else return;
    if (node.type === "object") for (const property of node.properties) visit(property.value, `${path}/${pointerSegment(property.key)}`);
    if (node.type === "array") node.elements.forEach((item, index) => visit(item, `${path}/${index}`));
  };
  visit(root, "");
  return best;
}
