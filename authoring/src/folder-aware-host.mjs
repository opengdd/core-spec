// The shared file-map host infers directories from files. Authoring packages
// can also carry explicit empty folders, so layer those directories over the
// host without changing its behavior for ordinary one-map callers.
export function collectionDrawerFolders(folders) {
  const pattern = /^collections\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;
  return [...new Set([...(folders ?? [])]
    .map(folder => String(folder).replaceAll("\\", "/"))
    .filter(folder => pattern.test(folder))
    .map(folder => folder.replace(/\/$/, "")))]
    .sort((left, right) => left.localeCompare(right));
}

export function withExplicitFolders(host, folders, root = "/package") {
  const directories = new Set();
  for (const folder of folders ?? []) {
    const relative = String(folder).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!relative) continue;
    let directory = host.path.resolve(root, relative);
    while (directory !== root && directory !== "/" && !directories.has(directory)) {
      directories.add(directory);
      directory = host.path.dirname(directory);
    }
  }
  if (!directories.size) return host;

  const exists = value => host.exists(value) || directories.has(host.path.resolve(value));
  const isDirectory = value => host.isDirectory(value) || directories.has(host.path.resolve(value));
  const readDir = value => {
    const absolute = host.path.resolve(value);
    if (!isDirectory(absolute)) return host.readDir(value);
    const children = new Map();
    if (host.isDirectory(absolute)) {
      for (const child of host.readDir(absolute)) children.set(child.name, child);
    }
    for (const directory of directories) {
      const relative = host.path.relative(absolute, directory);
      const name = relative.split("/", 1)[0];
      if (!name || name === "..") continue;
      const target = host.path.join(absolute, name);
      const current = children.get(name);
      children.set(name, {
        name,
        isFile: current?.isFile ?? host.isFile(target),
        isDirectory: true
      });
    }
    return [...children.values()].sort((left, right) => left.name.localeCompare(right.name));
  };

  return { ...host, exists, isDirectory, readDir };
}
