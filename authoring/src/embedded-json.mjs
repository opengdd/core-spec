import { insertJsonValue, removeJsonValue, renameJsonKey, setJsonValue } from "./edits-json.mjs";
import { offsetToPosition } from "./text-coordinates.mjs";
import { parseJson, plainObject } from "./json-path.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";

export function findFencedJson(text, { tag, afterLine = 0, revision } = {}) {
  if (typeof text !== "string") return undefined;
  const wanted = String(tag ?? "json").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const fence = new RegExp(`^([ \\t]*)(\`{3,}|~{3,})${wanted}[ \\t]*\\r?$`, "gimu");
  for (const match of text.matchAll(fence)) {
    const openingLine = text.slice(0, match.index).split("\n").length;
    if (openingLine <= afterLine) continue;
    const marker = match[2][0];
    const size = match[2].length;
    const contentStart = match.index + match[0].length + (text[match.index + match[0].length] === "\n" ? 1 : 0);
    const closing = new RegExp(`^[ \\t]*${marker}{${size},}[ \\t]*\\r?$`, "gmu");
    closing.lastIndex = contentStart;
    const end = closing.exec(text);
    if (!end) continue;
    const contentEnd = end.index;
    return {
      range: { start: offsetToPosition(text, contentStart), end: offsetToPosition(text, contentEnd), revision },
      text: text.slice(contentStart, contentEnd),
      revision
    };
  }
  return undefined;
}

export function readEmbedded(block, pointer) {
  const document = parseJson(block?.text);
  if (document === undefined) throw new Error(INSPECTOR_COPY.embeddedInvalid);
  const parts = pointer === "" ? [] : pointer.slice(1).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let value = document;
  let exists = true;
  for (const part of parts) {
    if (Array.isArray(value)) {
      const index = /^(?:0|[1-9]\d*)$/u.test(part) ? Number(part) : -1;
      exists = index >= 0 && index < value.length;
      value = exists ? value[index] : undefined;
    } else if (plainObject(value)) {
      exists = Object.hasOwn(value, part);
      value = exists ? value[part] : undefined;
    } else { exists = false; value = undefined; }
    if (!exists) break;
  }
  return { document, exists, value };
}

export function stageEmbedded(transaction, file, block, operations) {
  if (!block || typeof block.text !== "string" || block.revision === undefined) throw new Error(INSPECTOR_COPY.embeddedRefresh);
  let next = block.text;
  for (const operation of operations ?? []) {
    if (typeof operation === "function") next = operation(next);
    else if (operation.type === "set") next = setJsonValue(next, operation.pointer, operation.value);
    else if (operation.type === "insert") next = insertJsonValue(next, operation.pointer, operation.keyOrIndex, operation.value, operation.options);
    else if (operation.type === "remove") next = removeJsonValue(next, operation.pointer);
    else if (operation.type === "renameKey") next = renameJsonKey(next, operation.pointer, operation.nextKey);
    else throw new Error(`Unsupported embedded JSON operation ${String(operation?.type)}.`);
  }
  transaction.text(file).replace(block.range, next);
  return next;
}
