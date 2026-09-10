export const CONFORMANCE_SCHEMA_NAMES = Object.freeze([
  "manifest.schema.json",
  "tuning.schema.json",
  "personalization.schema.json",
  "collection.schema.json",
  "direction.schema.json",
  "opengdd-build.schema.json"
]);

export const OPTIONAL_MIGRATION_SCHEMA_NAMES = Object.freeze([
  "clocks.schema.json"
]);

async function checkedResponse(url, request) {
  const response = await request(url);
  if (response.ok) return response;
  let detail;
  try { detail = (await response.json()).error; } catch {}
  throw new Error(detail ?? `${url} returned ${response.status}`);
}

export async function requestJson(url, request = fetch) {
  return (await checkedResponse(url, request)).json();
}

export async function requestText(url, request = fetch) {
  return (await checkedResponse(url, request)).text();
}

export async function loadConformanceSchemas(load = name => requestJson(`/file/${name}`)) {
  const entries = await Promise.all(
    CONFORMANCE_SCHEMA_NAMES.map(async name => [name, await load(name)])
  );
  for (const name of OPTIONAL_MIGRATION_SCHEMA_NAMES) {
    try { entries.push([name, await load(name)]); }
    catch {}
  }
  return Object.fromEntries(entries);
}
