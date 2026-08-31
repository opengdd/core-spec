// Pure syntax helpers shared by conformance and authoring tools.

export const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const slash = value => String(value).replaceAll("\\", "/");
export const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function markdownSlug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function unfencedLines(text) {
  const result = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (!fenced) result.push({ line: index + 1, text: line });
  });
  return result;
}
