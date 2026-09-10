import { insertJsonValue, removeJsonValue, renameJsonKey, setJsonValue } from "./edits-json.mjs";
import { positionToOffset } from "./text-coordinates.mjs";

const copyValue = value => value instanceof Uint8Array ? value.slice() : value;
const sameValue = (left, right) => {
  if (typeof left === "string" || typeof right === "string") return left === right;
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
};

const isHighSurrogate = value => value >= 0xd800 && value <= 0xdbff;
const isLowSurrogate = value => value >= 0xdc00 && value <= 0xdfff;
const splitsSurrogate = (text, offset) => offset > 0 && offset < text.length
  && isHighSurrogate(text.charCodeAt(offset - 1)) && isLowSurrogate(text.charCodeAt(offset));

export function minimalTextChange(previous, next) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;
  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  if (splitsSurrogate(previous, start) || splitsSurrogate(next, start)) start -= 1;
  if (splitsSurrogate(previous, previousEnd)) previousEnd += 1;
  if (splitsSurrogate(next, nextEnd)) nextEnd += 1;
  return { start, previousEnd, nextEnd };
}

function normalizePath(value) {
  if (typeof value !== "string") throw new Error("Use a package-relative path.");
  const path = value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  if (!path || path.includes("\0") || path.split("/").some(part => part === "." || part === "..")) {
    throw new Error("Use a package-relative path without . or .. segments.");
  }
  return path;
}

function addParents(folders, path) {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
}

function claimPath(files, folders, path, except = new Set()) {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const parent = parts.slice(0, index).join("/");
    const file = [...files.keys()].find(item => item.toLowerCase() === parent.toLowerCase());
    if (file) throw new Error(`A file at ${file} cannot contain another package item.`);
  }
  const key = path.toLowerCase();
  const taken = [...files.keys(), ...folders].find(existing => !except.has(existing) && existing.toLowerCase() === key);
  if (taken) throw new Error(`A package item already exists at ${taken}.`);
}

function changedPaths(beforeFiles, afterFiles, beforeFolders, afterFolders) {
  const paths = new Set();
  for (const path of new Set([...beforeFiles.keys(), ...afterFiles.keys()])) {
    if (!beforeFiles.has(path) || !afterFiles.has(path) || !sameValue(beforeFiles.get(path), afterFiles.get(path))) paths.add(path);
  }
  for (const path of new Set([...beforeFolders, ...afterFolders])) {
    if (beforeFolders.has(path) !== afterFolders.has(path)) paths.add(path);
  }
  return paths;
}

function historyEntry(label, key, beforeFiles, afterFiles, beforeFolders, afterFolders, paths, moves) {
  const files = new Map();
  const folders = new Map();
  for (const path of paths) {
    const beforeExists = beforeFiles.has(path);
    const afterExists = afterFiles.has(path);
    if (beforeExists || afterExists) {
      files.set(path, {
        beforeExists,
        before: beforeExists ? copyValue(beforeFiles.get(path)) : undefined,
        afterExists,
        after: afterExists ? copyValue(afterFiles.get(path)) : undefined
      });
    }
    const beforeFolder = beforeFolders.has(path);
    const afterFolder = afterFolders.has(path);
    if (beforeFolder !== afterFolder) folders.set(path, { before: beforeFolder, after: afterFolder });
  }
  return { label, key, files, folders, paths: new Set(paths), moves: new Map(moves) };
}

function mergeEntry(target, next) {
  for (const [path, change] of next.files) {
    const existing = target.files.get(path);
    if (existing) {
      existing.afterExists = change.afterExists;
      existing.after = copyValue(change.after);
    } else target.files.set(path, { ...change, before: copyValue(change.before), after: copyValue(change.after) });
  }
  for (const [path, change] of next.folders) {
    const existing = target.folders.get(path);
    if (existing) existing.after = change.after;
    else target.folders.set(path, { ...change });
  }
  for (const path of next.paths) target.paths.add(path);
  for (const [from, to] of next.moves) target.moves.set(from, to);
}

export function createEditController(pkg) {
  if (!(pkg?.files instanceof Map) || !(pkg?.folders instanceof Set)) {
    throw new TypeError("createEditController requires a package with files and folders.");
  }
  const fileRevisions = new Map([...pkg.files.keys()].map(path => [path, 0]));
  const listeners = new Set();
  const entries = [];
  let cursor = 0;
  let packageRevision = 0;
  let nextFileRevision = 0;
  let serialized = Promise.resolve();
  let coalescingEntry;

  const editEvent = (paths, moves) => ({
    type: "edits",
    paths: [...paths],
    moves: [...moves].map(([from, to]) => ({ from, to }))
  });

  const notify = event => queueMicrotask(() => {
    for (const listener of [...listeners]) listener(event);
  });

  function enqueue(action) {
    const settled = serialized.then(action, action);
    serialized = settled.catch(() => {});
    return settled;
  }

  function bump(paths) {
    packageRevision += 1;
    for (const path of paths) {
      if (pkg.files.has(path)) fileRevisions.set(path, ++nextFileRevision);
      else fileRevisions.delete(path);
    }
  }

  function applyEntry(entry, side) {
    for (const [path, change] of entry.files) {
      const exists = side === "before" ? change.beforeExists : change.afterExists;
      if (exists) pkg.files.set(path, copyValue(change[side]));
      else pkg.files.delete(path);
    }
    for (const [path, change] of entry.folders) {
      if (change[side]) pkg.folders.add(path); else pkg.folders.delete(path);
    }
    bump(entry.paths);
    const moves = side === "before"
      ? new Map([...entry.moves].map(([from, to]) => [to, from]))
      : entry.moves;
    const event = editEvent(entry.paths, moves);
    notify(event);
    return event;
  }

  function begin(label, { coalesce } = {}) {
    if (typeof label !== "string" || !label.trim()) throw new Error("An edit needs a designer-facing label.");
    if (coalesce !== undefined && (typeof coalesce !== "string" || !coalesce)) throw new Error("A coalesce key must be a non-empty string.");
    const baseRevision = packageRevision;
    const baseFileRevisions = new Map(fileRevisions);
    const operations = [];
    let state = "open";
    const add = operation => {
      if (state !== "open") throw new Error("This edit transaction is no longer open.");
      operations.push(operation);
    };
    const transaction = {
      json(file) {
        const path = normalizePath(file);
        return {
          set(pointer, value) { add({ type: "json-set", path, pointer, value }); },
          insert(pointer, keyOrIndex, value, options) { add({ type: "json-insert", path, pointer, keyOrIndex, value, options }); },
          remove(pointer) { add({ type: "json-remove", path, pointer }); },
          renameKey(pointer, nextKey) { add({ type: "json-rename", path, pointer, nextKey }); }
        };
      },
      text(file) {
        const path = normalizePath(file);
        return {
          replace(range, text) { add({ type: "text-replace", path, range, text }); },
          append(block) { add({ type: "text-append", path, block }); }
        };
      },
      file(file) {
        const path = normalizePath(file);
        return {
          create(value) { add({ type: "file-create", path, value }); },
          move(nextPath) { add({ type: "file-move", path, nextPath: normalizePath(nextPath) }); },
          remove() { add({ type: "file-remove", path }); }
        };
      },
      folder(folder) {
        const path = normalizePath(folder);
        return {
          create() { add({ type: "folder-create", path }); },
          move(nextPath) { add({ type: "folder-move", path, nextPath: normalizePath(nextPath) }); },
          remove() { add({ type: "folder-remove", path }); }
        };
      },
      abort() {
        if (state === "open") state = "aborted";
      },
      async preview() {
        if (state !== "open") throw new Error("This edit transaction is no longer open.");
        if (packageRevision !== baseRevision) throw new Error("This edit was based on an older package revision; refresh it and try again.");
        const previewPackage = {
          files: new Map([...pkg.files].map(([path, value]) => [path, copyValue(value)])),
          folders: new Set(pkg.folders)
        };
        const preview = createEditController(previewPackage).begin(label);
        for (const operation of operations) {
          if (operation.type === "json-set") preview.json(operation.path).set(operation.pointer, operation.value);
          else if (operation.type === "json-insert") preview.json(operation.path).insert(operation.pointer, operation.keyOrIndex, operation.value, operation.options);
          else if (operation.type === "json-remove") preview.json(operation.path).remove(operation.pointer);
          else if (operation.type === "json-rename") preview.json(operation.path).renameKey(operation.pointer, operation.nextKey);
          else if (operation.type === "text-replace") preview.text(operation.path).replace({ ...operation.range, revision: 0 }, operation.text);
          else if (operation.type === "text-append") preview.text(operation.path).append(operation.block);
          else if (operation.type === "file-create") preview.file(operation.path).create(operation.value);
          else if (operation.type === "file-move") preview.file(operation.path).move(operation.nextPath);
          else if (operation.type === "file-remove") preview.file(operation.path).remove();
          else if (operation.type === "folder-create") preview.folder(operation.path).create();
          else if (operation.type === "folder-move") preview.folder(operation.path).move(operation.nextPath);
          else if (operation.type === "folder-remove") preview.folder(operation.path).remove();
          else throw new Error(`Preview cannot replay a ${operation.type} operation.`);
        }
        await preview.commit();
        return previewPackage;
      },
      commit() {
        if (state !== "open") return Promise.reject(new Error("This edit transaction is no longer open."));
        state = "committing";
        return enqueue(() => {
          if (packageRevision !== baseRevision) throw new Error("This edit was based on an older package revision; refresh it and try again.");
          const files = new Map([...pkg.files].map(([path, value]) => [path, copyValue(value)]));
          const folders = new Set(pkg.folders);
          const revisions = new Map(baseFileRevisions);
          const touched = new Set();
          const moves = new Map();
          const recordMove = (from, to) => {
            if (from === to) return;
            const origin = [...moves].find(([, destination]) => destination === from)?.[0];
            if (origin) {
              moves.set(origin, to);
              if (origin !== from) moves.delete(from);
            } else moves.set(from, to);
          };
          const requireFile = (path, text = false) => {
            if (!files.has(path)) throw new Error(`The file ${path} does not exist.`);
            const value = files.get(path);
            if (text && typeof value !== "string") throw new Error(`The file ${path} is binary and cannot be edited as text.`);
            return value;
          };
          for (const operation of operations) {
            const { path } = operation;
            touched.add(path);
            if (operation.nextPath) touched.add(operation.nextPath);
            if (operation.type.startsWith("json-")) {
              const text = requireFile(path, true);
              if (operation.type === "json-set") files.set(path, setJsonValue(text, operation.pointer, operation.value));
              else if (operation.type === "json-insert") files.set(path, insertJsonValue(text, operation.pointer, operation.keyOrIndex, operation.value, operation.options));
              else if (operation.type === "json-remove") files.set(path, removeJsonValue(text, operation.pointer));
              else files.set(path, renameJsonKey(text, operation.pointer, operation.nextKey));
            } else if (operation.type === "text-replace") {
              const text = requireFile(path, true);
              if (typeof operation.text !== "string") throw new Error("Replacement text must be a string.");
              if (operation.range?.revision !== revisions.get(path)) throw new Error(`The text range for ${path} is stale; refresh it and try again.`);
              const start = positionToOffset(text, operation.range.start, "start");
              const end = positionToOffset(text, operation.range.end, "end");
              if (end < start) throw new Error("The text range ends before it starts.");
              files.set(path, text.slice(0, start) + operation.text + text.slice(end));
            } else if (operation.type === "text-append") {
              const text = requireFile(path, true);
              if (typeof operation.block !== "string") throw new Error("Appended text must be a string.");
              files.set(path, text + operation.block);
            } else if (operation.type === "file-create") {
              claimPath(files, folders, path);
              if (typeof operation.value !== "string" && !(operation.value instanceof Uint8Array)) throw new Error("A file must be created from text or a Uint8Array.");
              files.set(path, copyValue(operation.value));
              revisions.set(path, undefined);
              addParents(folders, path);
            } else if (operation.type === "file-move") {
              const value = requireFile(path);
              if (path !== operation.nextPath) claimPath(files, folders, operation.nextPath, new Set([path]));
              files.delete(path);
              files.set(operation.nextPath, value);
              const revision = revisions.get(path);
              revisions.delete(path);
              revisions.set(operation.nextPath, revision);
              addParents(folders, operation.nextPath);
              recordMove(path, operation.nextPath);
            } else if (operation.type === "file-remove") {
              requireFile(path);
              files.delete(path);
              revisions.delete(path);
            } else if (operation.type === "folder-create") {
              claimPath(files, folders, path);
              folders.add(path);
              addParents(folders, path);
            } else if (operation.type === "folder-move") {
              if (!folders.has(path)) throw new Error(`The folder ${path} does not exist.`);
              if (operation.nextPath.startsWith(`${path}/`)) throw new Error("A folder cannot be moved inside itself.");
              claimPath(files, folders, operation.nextPath, new Set([...files.keys(), ...folders].filter(item => item === path || item.startsWith(`${path}/`))));
              const affectedFiles = [...files].filter(([item]) => item.startsWith(`${path}/`));
              const affectedFolders = [...folders].filter(item => item === path || item.startsWith(`${path}/`));
              const except = new Set([...affectedFiles.map(([item]) => item), ...affectedFolders]);
              for (const item of [...files.keys(), ...folders]) {
                if (except.has(item)) continue;
                const key = item.toLowerCase();
                if (key === operation.nextPath.toLowerCase() || key.startsWith(`${operation.nextPath.toLowerCase()}/`)) {
                  throw new Error(`The destination ${operation.nextPath} is not empty.`);
                }
              }
              for (const [item] of affectedFiles) files.delete(item);
              for (const item of affectedFolders) folders.delete(item);
              for (const [item, value] of affectedFiles) {
                const next = operation.nextPath + item.slice(path.length);
                files.set(next, value);
                const revision = revisions.get(item);
                revisions.delete(item);
                revisions.set(next, revision);
                recordMove(item, next);
              }
              for (const item of affectedFolders) {
                const next = operation.nextPath + item.slice(path.length);
                folders.add(next);
                recordMove(item, next);
              }
              addParents(folders, operation.nextPath);
            } else if (operation.type === "folder-remove") {
              if (!folders.has(path)) throw new Error(`The folder ${path} does not exist.`);
              for (const item of [...files.keys()]) {
                if (item.startsWith(`${path}/`)) { files.delete(item); revisions.delete(item); }
              }
              for (const item of [...folders]) if (item === path || item.startsWith(`${path}/`)) folders.delete(item);
            }
          }
          const paths = changedPaths(pkg.files, files, pkg.folders, folders);
          for (const path of touched) paths.add(path);
          const entry = historyEntry(label.trim(), coalesce, pkg.files, files, pkg.folders, folders, paths, moves);
          pkg.files.clear();
          for (const [path, value] of files) pkg.files.set(path, copyValue(value));
          pkg.folders.clear();
          for (const path of folders) pkg.folders.add(path);
          // Coalescing continues only along the current history tip with the
          // same key; undo/redo branching or an intervening edit invalidates it.
          const branched = cursor < entries.length;
          if (branched) entries.splice(cursor);
          const previous = entries.at(-1);
          if (coalesce && !branched && coalescingEntry === previous && previous?.key === coalesce) {
            mergeEntry(previous, entry);
          } else {
            entries.push(entry);
            cursor += 1;
          }
          coalescingEntry = coalesce ? entries.at(-1) : undefined;
          if (entries.length > 200) {
            const removed = entries.length - 200;
            entries.splice(0, removed);
            cursor -= removed;
          }
          bump(paths);
          state = "committed";
          notify(editEvent(paths, moves));
        }).catch(error => {
          state = "refused";
          throw error;
        });
      }
    };
    return transaction;
  }

  const history = {};
  Object.defineProperties(history, {
    label: { enumerable: true, get: () => cursor ? entries[cursor - 1].label : undefined },
    count: { enumerable: true, get: () => entries.length },
    canUndo: { enumerable: true, get: () => cursor > 0 },
    canRedo: { enumerable: true, get: () => cursor < entries.length }
  });

  return {
    begin,
    // With no path this is the package revision used to bind cross-file plans;
    // the existing path form remains the public per-file revision contract.
    revision(path) { return arguments.length ? fileRevisions.get(normalizePath(path)) : packageRevision; },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("An edit subscriber must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    undo() {
      return enqueue(() => {
        coalescingEntry = undefined;
        if (!cursor) return false;
        const entry = entries[--cursor];
        return applyEntry(entry, "before");
      });
    },
    redo() {
      return enqueue(() => {
        coalescingEntry = undefined;
        if (cursor >= entries.length) return false;
        const entry = entries[cursor++];
        return applyEntry(entry, "after");
      });
    },
    history
  };
}

export function createEditLayer(pkgOrController) {
  const controller = pkgOrController?.files instanceof Map
    ? createEditController(pkgOrController)
    : pkgOrController;
  if (typeof controller?.begin !== "function") throw new TypeError("createEditLayer requires a package or edit controller.");
  return { begin: controller.begin };
}
