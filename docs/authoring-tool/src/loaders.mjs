export const CONFORMANCE_SCHEMA_NAMES = Object.freeze([
  "manifest.schema.json",
  "tuning.schema.json",
  "personalization.schema.json",
  "collection.schema.json",
  "direction.schema.json",
  "opengdd-build.schema.json"
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
  return Object.fromEntries(await Promise.all(
    CONFORMANCE_SCHEMA_NAMES.map(async name => [name, await load(name)])
  ));
}
