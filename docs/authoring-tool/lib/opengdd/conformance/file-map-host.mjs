function normalize(value) {
  const input = String(value).replaceAll("\\", "/");
  const absolute = input.startsWith("/");
  const parts = [];
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop();
      else if (!absolute) parts.push(part);
    } else parts.push(part);
  }
  return `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
}

function resolve(...values) {
  let result = "";
  for (const value of values) {
    const part = String(value);
    result = part.startsWith("/") ? part : `${result}/${part}`;
  }
  return normalize(result || ".");
}

function relative(from, to) {
  const left = resolve(from).split("/").filter(Boolean);
  const right = resolve(to).split("/").filter(Boolean);
  let common = 0;
  while (common < left.length && common < right.length && left[common] === right[common]) common += 1;
  return [...left.slice(common).map(() => ".."), ...right.slice(common)].join("/");
}

function join(...values) {
  return normalize(values.filter(value => String(value).length).join("/"));
}

function dirname(value) {
  const normalized = normalize(value);
  if (normalized === "/" || normalized === ".") return normalized;
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  return index === 0 ? "/" : normalized.slice(0, index);
}

function basename(value) {
  const normalized = normalize(value);
  if (normalized === "/" || normalized === ".") return "";
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function extname(value) {
  const name = basename(value);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index);
}

export const posixPath = {
  resolve,
  relative,
  join,
  dirname,
  basename,
  extname,
  isAbsolute: value => String(value).startsWith("/"),
  // Matches node:path.win32.isAbsolute: a leading separator is absolute on
  // Windows even without a drive letter, so `\images\hero.png` must not pass
  // the package-relative guard on one host and fail it on the other.
  isAbsoluteWindows: value => /^(?:[\\/]|[A-Za-z]:[\\/])/.test(String(value)),
  sep: "/"
};

function entryValue(value) {
  if (typeof value === "string") return { text: value };
  if (value instanceof Uint8Array) return { bytes: value };
  if (value === null) return {};
  return value ?? {};
}

export function createFileMapHost(fileMap, options = {}) {
  const root = resolve(options.root ?? "/package");
  const files = new Map();
  const directories = new Set([root]);
  for (const [name, value] of fileMap) {
    const file = resolve(root, String(name).replace(/^[/\\]+/, ""));
    files.set(file, entryValue(value));
    let directory = dirname(file);
    while (!directories.has(directory)) {
      directories.add(directory);
      if (directory === root || directory === "/") break;
      directory = dirname(directory);
    }
  }

  function requireFile(file) {
    const entry = files.get(resolve(file));
    if (!entry) throw new Error(`ENOENT: no such file, open '${file}'`);
    return entry;
  }

  return {
    path: posixPath,
    exists: file => files.has(resolve(file)) || directories.has(resolve(file)),
    isFile: file => files.has(resolve(file)),
    isDirectory: file => directories.has(resolve(file)),
    isSymbolicLink: () => false,
    readLink: file => { throw new Error(`EINVAL: invalid argument, readlink '${file}'`); },
    // Entry order is unspecified by the host contract (a real filesystem does
    // not guarantee one); callers must sort whatever they depend on.
    readDir: directory => {
      const absolute = resolve(directory);
      if (!directories.has(absolute)) throw new Error(`ENOENT: no such directory, scandir '${directory}'`);
      const children = new Map();
      for (const file of files.keys()) {
        const child = relative(absolute, file).split("/", 1)[0];
        if (!child || child === "..") continue;
        const target = join(absolute, child);
        children.set(child, {
          name: child,
          isFile: files.has(target),
          isDirectory: directories.has(target)
        });
      }
      return [...children.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    size: file => {
      const entry = requireFile(file);
      if (entry.bytes instanceof Uint8Array) return entry.bytes.byteLength;
      if (typeof entry.text === "string") return new TextEncoder().encode(entry.text).byteLength;
      return entry.size ?? 0;
    },
    readText: file => {
      const entry = requireFile(file);
      if (typeof entry.text === "string") return entry.text;
      if (entry.bytes instanceof Uint8Array) return new TextDecoder().decode(entry.bytes);
      throw new Error(`EIO: text unavailable, read '${file}'`);
    },
    readBytes: file => {
      const entry = requireFile(file);
      if (options.bytes === false) return undefined;
      if (entry.bytes instanceof Uint8Array) return entry.bytes;
      return typeof entry.text === "string" ? new TextEncoder().encode(entry.text) : undefined;
    },
    // Optional capability: without it the core skips hash checks rather than failing them.
    sha256: options.sha256,
    loadSchema: name => options.schemas instanceof Map ? options.schemas.get(name) : options.schemas?.[name]
  };
}
