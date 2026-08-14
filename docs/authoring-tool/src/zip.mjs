import { safeZipPath } from "./zip-path.mjs";

const TEXT_FILE = /\.(?:md|json|txt|csv|tsv|ya?ml)$/i;
const decoder = new TextDecoder();

// ZIP64 is out of scope: spec packages are text, far below the 4 GiB / 65535
// entry limits where the classic end-of-directory record stops being enough.
function endRecord(view) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("This file has no readable zip directory.");
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot decompress zip files.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function stripCommonRoot(entries) {
  const files = entries.filter(entry => !entry.directory);
  const roots = new Set(files.map(entry => entry.path.split("/")[0]));
  const nested = files.length > 0 && roots.size === 1 && files.every(entry => entry.path.includes("/"));
  if (!nested) return entries;
  const root = `${files[0].path.split("/")[0]}/`;
  return entries
    // Directory entries outside the stripped root would materialize as stray
    // top-level folders, so they are dropped with the root itself.
    .filter(entry => entry.path !== root.slice(0, -1) && (!entry.directory || entry.path.startsWith(root)))
    .map(entry => ({ ...entry, path: entry.path.startsWith(root) ? entry.path.slice(root.length) : entry.path }));
}

export async function readZip(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const end = endRecord(view);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The zip directory is malformed.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    const entryPath = safeZipPath(name);
    if (flags & 1) throw new Error(`Encrypted zip entries are not supported: ${entryPath}`);
    const directory = entryPath.endsWith("/");
    let bytes = new Uint8Array();
    if (!directory) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Invalid zip entry: ${entryPath}`);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, start, compressedSize);
      if (method === 0) bytes = compressed;
      else if (method === 8) bytes = await inflate(compressed);
      else throw new Error(`Unsupported zip compression method ${method}: ${entryPath}`);
    }
    entries.push({ path: entryPath, directory, bytes });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const normalized = stripCommonRoot(entries);
  const files = new Map();
  const folders = new Set();
  // Export refuses case-only path collisions and file-vs-folder same-name
  // clashes, so import must too — otherwise an imported package can never
  // be exported again.
  const claimed = new Map();
  const claim = (path, kind) => {
    const key = path.toLowerCase();
    const existing = claimed.get(key);
    if (existing && (existing.path !== path || existing.kind !== kind)) {
      throw new Error(`Conflicting zip paths: ${existing.path} and ${path}`);
    }
    claimed.set(key, { path, kind });
  };
  for (const entry of normalized) {
    const path = entry.path.replace(/\/$/, "");
    if (!path || path === "__MACOSX" || path.startsWith("__MACOSX/")) continue;
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const folder = parts.slice(0, index).join("/");
      claim(folder, "folder");
      folders.add(folder);
    }
    if (entry.directory) {
      claim(path, "folder");
      folders.add(path);
    } else {
      if (files.has(path)) throw new Error(`Duplicate zip path: ${path}`);
      claim(path, "file");
      files.set(path, TEXT_FILE.test(path) ? decoder.decode(entry.bytes) : new Uint8Array(entry.bytes));
    }
  }
  if (!files.size) throw new Error("The zip contains no package files.");

  let manifest = {};
  try { manifest = JSON.parse(files.get("manifest.json") ?? "{}"); } catch { /* Analysis will report malformed JSON. */ }
  const fallback = file.name.replace(/\.zip$/i, "") || "imported-package";
  return {
    id: typeof manifest.id === "string" ? manifest.id : fallback,
    title: typeof manifest.title === "string" ? manifest.title : fallback,
    files,
    folders
  };
}
