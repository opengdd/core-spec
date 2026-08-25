import { lineBounds, offsetToPosition } from "./text-coordinates.mjs";

const invalidJson = () => { throw new Error("This file is not valid JSON yet; fix it before making a structured edit."); };
const jsonWhitespace = character => character === " " || character === "\t" || character === "\r" || character === "\n";

function scanTokens(text) {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    if (jsonWhitespace(text[index])) { index += 1; continue; }
    const start = index;
    if (text[index] === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") { index += 2; continue; }
        if (text[index++] === '"') break;
      }
      const raw = text.slice(start, index);
      let value;
      try { value = JSON.parse(raw); } catch { invalidJson(); }
      tokens.push({ raw, value, start, end: index, kind: "string" });
      continue;
    }
    if ("{}[]:,".includes(text[index])) {
      tokens.push({ raw: text[index], start, end: ++index, kind: "punctuation" });
      continue;
    }
    while (index < text.length && !jsonWhitespace(text[index]) && !"{}[]:,".includes(text[index])) index += 1;
    tokens.push({ raw: text.slice(start, index), start, end: index, kind: "scalar" });
  }
  return tokens;
}

const lineAt = (text, index) => offsetToPosition(text, index).line + 1;

function parseDocument(text) {
  if (typeof text !== "string") throw new TypeError("JSON edits require a text file.");
  const tokens = scanTokens(text);
  let cursor = 0;
  const take = raw => tokens[cursor]?.raw === raw ? tokens[cursor++] : invalidJson();

  function value(parent, slot) {
    const token = tokens[cursor];
    if (!token) return invalidJson();
    if (token.raw === "{") {
      const open = take("{");
      const node = { type: "object", start: open.start, open, properties: [], commas: [], parent, slot };
      const names = new Map();
      if (tokens[cursor]?.raw !== "}") {
        while (true) {
          const key = tokens[cursor++];
          if (key?.kind !== "string") return invalidJson();
          take(":");
          if (names.has(key.value)) {
            throw new Error(`Structured edits are unavailable because key ${JSON.stringify(key.value)} is duplicated on line ${lineAt(text, key.start)}; edit this file as raw text.`);
          }
          names.set(key.value, key);
          const property = { key: key.value, keyToken: key };
          property.value = value(node, property);
          node.properties.push(property);
          if (tokens[cursor]?.raw !== ",") break;
          node.commas.push(tokens[cursor++]);
        }
      }
      const close = take("}");
      node.end = close.end;
      node.close = close;
      return node;
    }
    if (token.raw === "[") {
      const open = take("[");
      const node = { type: "array", start: open.start, open, elements: [], commas: [], parent, slot };
      if (tokens[cursor]?.raw !== "]") {
        while (true) {
          node.elements.push(value(node, node.elements.length));
          if (tokens[cursor]?.raw !== ",") break;
          node.commas.push(tokens[cursor++]);
        }
      }
      const close = take("]");
      node.end = close.end;
      node.close = close;
      return node;
    }
    cursor += 1;
    let parsed;
    try { parsed = JSON.parse(token.raw); } catch { return invalidJson(); }
    if (parsed !== null && typeof parsed === "object") return invalidJson();
    return { type: "scalar", start: token.start, end: token.end, parent, slot };
  }

  const root = value(null, null);
  if (cursor !== tokens.length) invalidJson();
  return root;
}

function segments(pointer) {
  if (typeof pointer !== "string" || (pointer !== "" && !pointer.startsWith("/"))) {
    throw new Error("Use a JSON Pointer beginning with /, or an empty pointer for the document root.");
  }
  if (pointer === "") return [];
  return pointer.slice(1).split("/").map(part => {
    if (/~(?:[^01]|$)/.test(part)) throw new Error(`JSON Pointer ${JSON.stringify(pointer)} has an invalid ~ escape.`);
    return part.replaceAll("~1", "/").replaceAll("~0", "~");
  });
}

function resolve(root, pointer) {
  let node = root;
  for (const part of segments(pointer)) {
    if (node.type === "object") {
      const property = node.properties.find(item => item.key === part);
      if (!property) throw new Error(`JSON Pointer ${JSON.stringify(pointer)} does not exist.`);
      node = property.value;
      continue;
    }
    if (node.type === "array") {
      if (!/^(?:0|[1-9]\d*)$/.test(part) || Number(part) >= node.elements.length) {
        throw new Error(`JSON Pointer ${JSON.stringify(pointer)} does not name an existing array item.`);
      }
      node = node.elements[Number(part)];
      continue;
    }
    throw new Error(`JSON Pointer ${JSON.stringify(pointer)} continues through a scalar value.`);
  }
  return node;
}

function rendered(value) {
  let result;
  try { result = JSON.stringify(value); }
  catch { throw new Error("The JSON value cannot be represented as JSON."); }
  if (result === undefined) throw new Error("The JSON value cannot be represented as JSON.");
  return result;
}

const splice = (text, start, end, replacement) => text.slice(0, start) + replacement + text.slice(end);
const lineIndent = (text, index) => {
  const start = lineBounds(text, offsetToPosition(text, index).line).start;
  const prefix = text.slice(start, index);
  return /^[ \t]*$/.test(prefix) ? prefix : "";
};
const itemStart = (container, index) => container.type === "object"
  ? container.properties[index].keyToken.start
  : container.elements[index].start;
const containerItems = container => container.type === "object"
  ? container.properties.map(property => property.value)
  : container.elements;
const newlineIn = trivia => {
  const matches = [...trivia.matchAll(/\r\n|\n|\r/g)];
  return matches.at(-1)?.[0];
};

function localIndentUnit(text, container) {
  const closeIndent = lineIndent(text, container.close.start);
  for (let ancestor = container.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type !== "object" && ancestor.type !== "array") continue;
    const ancestorIndent = lineIndent(text, ancestor.close.start);
    if (closeIndent.startsWith(ancestorIndent) && closeIndent.length > ancestorIndent.length) {
      return closeIndent.slice(ancestorIndent.length);
    }
  }
  // A root container with no children or siblings has no authored indentation delta.
  return "  ";
}

function boundarySeparator(text, container) {
  const first = itemStart(container, 0);
  const leading = text.slice(container.open.end, first);
  if (leading) return `,${leading}`;
  // One compact member has no authored separator to copy.
  return ", ";
}

function memberSeparator(text, container, index = container.commas.length - 1) {
  if (container.commas.length) {
    const position = Math.max(0, Math.min(index, container.commas.length - 1));
    const comma = container.commas[position];
    return text.slice(comma.start, itemStart(container, position + 1));
  }
  return boundarySeparator(text, container);
}

function insertEmpty(text, container, snippet) {
  const inside = text.slice(container.open.end, container.close.start);
  const newline = newlineIn(inside);
  if (!newline) return splice(text, container.close.start, container.close.start, snippet);
  const closeIndent = lineIndent(text, container.close.start);
  const lineStart = container.close.start - closeIndent.length;
  return splice(text, lineStart, lineStart, `${closeIndent}${localIndentUnit(text, container)}${snippet}${newline}`);
}

export function setJsonValue(text, pointer, value) {
  const node = resolve(parseDocument(text), pointer);
  return splice(text, node.start, node.end, rendered(value));
}

export function insertJsonValue(text, pointer, keyOrIndex, value, options = {}) {
  const container = resolve(parseDocument(text), pointer);
  const valueText = options.recordSpacing
    ? `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${rendered(item)}`).join(", ")}}`
    : rendered(value);
  if (container.type === "object") {
    if (typeof keyOrIndex !== "string") throw new Error("An object insertion requires a member name.");
    if (container.properties.some(property => property.key === keyOrIndex)) throw new Error(`Object member ${JSON.stringify(keyOrIndex)} already exists.`);
    const snippet = `${JSON.stringify(keyOrIndex)}: ${valueText}`;
    if (!container.properties.length) return insertEmpty(text, container, snippet);
    const last = container.properties.at(-1).value;
    return splice(text, last.end, last.end, `${memberSeparator(text, container)}${snippet}`);
  }
  if (container.type === "array") {
    const index = keyOrIndex === "-" ? container.elements.length : typeof keyOrIndex === "number" ? keyOrIndex
      : /^(?:0|[1-9]\d*)$/.test(keyOrIndex) ? Number(keyOrIndex) : NaN;
    if (!Number.isInteger(index) || index < 0 || index > container.elements.length) throw new Error("An array insertion requires an existing index or - to append.");
    if (!container.elements.length) return insertEmpty(text, container, valueText);
    if (index === container.elements.length) {
      const last = container.elements.at(-1);
      return splice(text, last.end, last.end, `${memberSeparator(text, container)}${valueText}`);
    }
    const target = container.elements[index];
    return splice(text, target.start, target.start, `${valueText}${memberSeparator(text, container, index - 1)}`);
  }
  throw new Error(`JSON Pointer ${JSON.stringify(pointer)} does not name an object or array.`);
}

export function removeJsonValue(text, pointer) {
  const node = resolve(parseDocument(text), pointer);
  const parent = node.parent;
  if (!parent) throw new Error("The whole JSON document cannot be removed with a structured edit.");
  const siblings = containerItems(parent);
  const index = siblings.indexOf(node);
  if (siblings.length === 1) {
    const leading = text.slice(parent.open.end, itemStart(parent, 0));
    const trailing = text.slice(node.end, parent.close.start);
    const trailingNewline = [...trailing.matchAll(/\r\n|\n|\r/g)].at(-1);
    if (trailingNewline) return splice(text, parent.open.end, parent.close.start, trailing.slice(trailingNewline.index));
    const leadingNewline = newlineIn(leading);
    return splice(text, parent.open.end, parent.close.start, leadingNewline ?? "");
  }
  if (index < siblings.length - 1) {
    const leadingStart = index ? parent.commas[index - 1].end : parent.open.end;
    return splice(text, leadingStart, parent.commas[index].end, "");
  }
  return splice(text, parent.commas[index - 1].start, node.end, "");
}

export function renameJsonKey(text, pointer, nextKey) {
  const node = resolve(parseDocument(text), pointer);
  const property = node.slot;
  if (node.parent?.type !== "object" || !property?.keyToken) throw new Error("renameKey requires a pointer to an object member.");
  if (typeof nextKey !== "string") throw new Error("A JSON member name must be a string.");
  if (node.parent.properties.some(item => item !== property && item.key === nextKey)) throw new Error(`Object member ${JSON.stringify(nextKey)} already exists.`);
  return splice(text, property.keyToken.start, property.keyToken.end, JSON.stringify(nextKey));
}
