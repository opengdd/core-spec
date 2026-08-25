// Text coordinates are 0-based UTF-16 positions. LF separates lines; in CRLF
// text the CR is owned by the prior line. Every accepted offset is a Unicode
// code-point boundary, so no conversion or range can split a surrogate pair.

const isHighSurrogate = value => value >= 0xd800 && value <= 0xdbff;
const isLowSurrogate = value => value >= 0xdc00 && value <= 0xdfff;

export const isCodePointBoundary = (text, offset) => offset <= 0 || offset >= text.length
  || !isHighSurrogate(text.charCodeAt(offset - 1)) || !isLowSurrogate(text.charCodeAt(offset));

function requireOffset(text, offset) {
  if (typeof text !== "string") throw new TypeError("Text coordinates require a string.");
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new RangeError("Text offset is outside the file.");
  if (!isCodePointBoundary(text, offset)) throw new RangeError("Text offset splits a Unicode code point.");
  return offset;
}

export function lineStarts(text) {
  if (typeof text !== "string") throw new TypeError("Text coordinates require a string.");
  const starts = [0];
  for (let offset = text.indexOf("\n"); offset >= 0; offset = text.indexOf("\n", offset + 1)) starts.push(offset + 1);
  return starts;
}

export function lineBounds(text, line) {
  const starts = lineStarts(text);
  const index = Math.max(0, Math.min(starts.length - 1, line));
  const start = starts[index];
  const end = index + 1 < starts.length ? starts[index + 1] - 1 : text.length;
  return { index, start, end };
}

export function lineText(text, starts, line) {
  const start = starts[line];
  const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
  return text.slice(start, end);
}

export function offsetToPosition(text, offset) {
  requireOffset(text, offset);
  const starts = lineStarts(text);
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) low = middle; else high = middle - 1;
  }
  return { line: low, character: offset - starts[low] };
}

export function positionToOffset(text, position, name = "position") {
  if (typeof text !== "string") throw new TypeError("Text coordinates require a string.");
  if (!position || !Number.isInteger(position.line) || position.line < 0
    || !Number.isInteger(position.character) || position.character < 0) {
    throw new Error(`The text range has an invalid ${name} position.`);
  }
  const starts = lineStarts(text);
  if (position.line >= starts.length) throw new Error(`The text range ${name} line is outside the file.`);
  const bounds = lineBounds(text, position.line);
  if (position.character > bounds.end - bounds.start) throw new Error(`The text range ${name} character is outside its line.`);
  const offset = bounds.start + position.character;
  if (!isCodePointBoundary(text, offset)) throw new Error(`The text range ${name} position splits a Unicode code point.`);
  return offset;
}

export function clampedPositionToOffset(text, position) {
  const bounds = lineBounds(text, position.line);
  const character = Math.max(0, Math.min(bounds.end - bounds.start, position.character));
  let offset = bounds.start + character;
  if (!isCodePointBoundary(text, offset)) offset -= 1;
  return offset;
}

export function rangeFromOffsets(text, start, end = start) {
  requireOffset(text, start);
  requireOffset(text, end);
  if (end < start) throw new RangeError("Text range ends before it starts.");
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) };
}

export function updateLineStarts(starts, previous, next, selection) {
  if (!starts.length || !selection) return lineStarts(next);
  const { start, end } = selection;
  requireOffset(previous, start);
  requireOffset(previous, end);
  const insertedLength = next.length - previous.length + end - start;
  if (insertedLength < 0
    || previous.slice(start, end).includes("\n")
    || next.slice(start, start + insertedLength).includes("\n")) return lineStarts(next);
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= start) low = middle; else high = middle - 1;
  }
  const delta = insertedLength - (end - start);
  for (let index = low + 1; index < starts.length; index += 1) starts[index] += delta;
  return starts;
}
