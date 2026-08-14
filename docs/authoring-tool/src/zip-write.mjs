import { safeZipPath } from "./zip-path.mjs";

const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function bytesFor(value, path) {
  if (typeof value === "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`${path} is neither UTF-8 text nor binary data.`);
}

function join(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

export function writeZip(files, folders = []) {
  if (!(files instanceof Map) || !files.size) throw new TypeError("A non-empty file map is required.");
  const entries = [
    ...[...folders].map(path => [`${String(path).replace(/\/$/, "")}/`, new Uint8Array(), true]),
    ...[...files].map(([path, value]) => [path, value, false])
  ];
  if (entries.length > 0xffff) throw new Error("Classic zip supports at most 65535 entries.");
  const locals = [];
  const central = [];
  const paths = new Set();
  let localOffset = 0;

  for (const [rawPath, value, directory] of entries) {
    const path = safeZipPath(rawPath);
    if (!directory && path.endsWith("/")) throw new Error(`A file path cannot end with /: ${path}`);
    const logicalPath = path.replace(/\/$/, "");
    // Case-insensitively, because Windows and macOS extract `Foo.md` and
    // `foo.md` over each other — one of the two files would simply be lost.
    const key = logicalPath.toLowerCase();
    if (paths.has(key)) throw new Error(`Two package paths differ only by capitalisation: ${logicalPath}`);
    paths.add(key);
    const name = encoder.encode(path);
    const bytes = directory ? value : bytesFor(value, path);
    if (name.byteLength > 0xffff || bytes.byteLength > 0xffffffff) throw new Error(`Zip entry is too large: ${path}`);
    const checksum = crc32(bytes);

    const local = new Uint8Array(30 + name.byteLength + bytes.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.byteLength, true);
    localView.setUint32(22, bytes.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    local.set(bytes, 30 + name.byteLength);
    locals.push(local);

    const record = new Uint8Array(46 + name.byteLength);
    const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true);
    recordView.setUint16(6, 20, true);
    recordView.setUint16(8, 0x0800, true);
    recordView.setUint16(12, 0, true);
    recordView.setUint16(14, 33, true);
    recordView.setUint32(16, checksum, true);
    recordView.setUint32(20, bytes.byteLength, true);
    recordView.setUint32(24, bytes.byteLength, true);
    recordView.setUint16(28, name.byteLength, true);
    recordView.setUint32(38, directory ? 0x10 : 0, true);
    recordView.setUint32(42, localOffset, true);
    record.set(name, 46);
    central.push(record);
    localOffset += local.byteLength;
    if (localOffset > 0xffffffff) throw new Error("Classic zip cannot exceed 4 GiB.");
  }

  const directory = join(central);
  if (directory.byteLength > 0xffffffff) throw new Error("Classic zip directory cannot exceed 4 GiB.");
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directory.byteLength, true);
  endView.setUint32(16, localOffset, true);
  return join([...locals, directory, end]);
}
