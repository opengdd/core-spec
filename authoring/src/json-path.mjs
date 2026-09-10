// Shared JSON-shape, pointer, parsing, and package-snapshot helpers.
// Source modules and panels use these without changing their stored-data behavior.
export const plainObject = value => value && typeof value === "object" && !Array.isArray(value);
export const own = (value, key) => Object.hasOwn(value, key);

export const pointerSegment = value => String(value).replaceAll("~", "~0").replaceAll("/", "~1");

export function pointer(value) {
  const parts = Array.isArray(value) ? value : [value];
  return parts.length ? `/${parts.map(pointerSegment).join("/")}` : "";
}

export function parseJson(text) {
  try { return JSON.parse(text instanceof Uint8Array ? new TextDecoder().decode(text) : text); }
  catch { return undefined; }
}

export function packageFiles(source) {
  const service = typeof source?.list === "function" ? source : source?.package;
  return new Map(service.list().flatMap(path => {
    const value = service.read(path);
    return value === undefined ? [] : [[path, value]];
  }));
}
