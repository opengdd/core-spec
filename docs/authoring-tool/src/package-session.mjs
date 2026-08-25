import { deleteDraft as removeDraft, draftNeedsExampleUpdate, listDrafts, saveDraft } from "./drafts.mjs";
import { createEditController } from "./edits.mjs";
import { packageIdFromTitle } from "./package.mjs";
import { readZip } from "./zip.mjs";
import { writeZip } from "./zip-write.mjs";

const debounce = (action, delay) => {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => action(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

function foldersFor(files, explicit = new Set()) {
  const folders = new Set(explicit);
  for (const path of files.keys()) {
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  return folders;
}

function packageFrom(value, decodeBinary) {
  // Accepted file shapes: a Map, entry pairs (the browser-draft wire shape),
  // or {path, text|base64} objects (the serialized wire shape).
  const files = value.files instanceof Map
    ? new Map(value.files)
    : new Map((value.files ?? []).map(file => Array.isArray(file) ? [file[0], file[1]] : [file.path,
      typeof file.text === "string" ? file.text : typeof file.base64 === "string" ? decodeBinary(file.base64) : null
    ]));
  return {
    id: value.id,
    title: value.title ?? value.name ?? value.id,
    // Built-in drafts retain the exact example revision they forked from.
    // A missing value is intentionally preserved for pre-revision drafts so
    // the UI can warn instead of silently treating them as current.
    baseRevision: typeof value.baseRevision === "string" ? value.baseRevision : null,
    repositoryPath: value.path ?? null,
    // Reader links point at repository files, so only paths that came from the
    // repository may offer one — a file created or moved here has no such twin.
    repositoryFiles: new Set(value.path ? files.keys() : []),
    files,
    folders: foldersFor(files, new Set(value.folders ?? []))
  };
}

export function createPackageSession({
  decodeBinary,
  listBuiltins,
  loadBuiltin,
  report = () => {},
  onEdit = () => {},
  isClosed = () => false,
  storage = { listDrafts, saveDraft, deleteDraft: removeDraft },
  zip = { read: readZip, write: writeZip },
  saveDelay = 450
} = {}) {
  const listeners = new Set();
  let builtins = [];
  let drafts = [];
  let pendingDelete = null;
  let saveStatus = "Not saved";
  let revision = 0;
  let requestId = 0;
  let pendingSave = null;
  let closed = false;
  let pkg = packageFrom({ id: "", title: "Loading package…", files: [] }, decodeBinary);
  let controller = createEditController(pkg);
  let stopEditing = controller.subscribe(onEdit);

  const builtinFor = id => builtins.find(item => item.id === id);
  const draftFor = id => drafts.find(item => item.id === id);
  const packageOptions = () => {
    const builtinIds = new Set(builtins.map(item => item.id));
    return [
      ...builtins.map(item => {
        const draft = draftFor(item.id);
        const update = draftNeedsExampleUpdate(draft, item) ? " · update available" : "";
        return { id: item.id, label: `${draft?.title ?? item.title} — ${draft ? "local draft" : "example"}${update}` };
      }),
      ...drafts.filter(draft => !builtinIds.has(draft.id)).map(draft => ({ id: draft.id, label: `${draft.title} — local draft` }))
    ];
  };
  const snapshot = () => ({
    package: pkg,
    editController: controller,
    builtins,
    drafts,
    options: packageOptions(),
    hasDraft: Boolean(draftFor(pkg.id)),
    isBuiltin: Boolean(builtinFor(pkg.id)),
    pendingDelete,
    saveStatus,
    revision
  });
  const publish = type => {
    const delivery = { type, ...snapshot() };
    for (const listener of [...listeners]) listener(delivery);
  };
  const selectedId = preferredId => {
    const ids = [...builtins.map(item => item.id), ...drafts.map(item => item.id)];
    return ids.includes(preferredId) ? preferredId : ids[0] ?? "";
  };

  async function refresh() {
    drafts = await storage.listDrafts();
    if (closed || isClosed()) return;
    publish("package");
  }

  const persist = debounce(async (announce = true) => {
    const pending = pendingSave;
    pendingSave = null;
    if (!pending) return;
    try {
      await storage.saveDraft(pending);
      saveStatus = "Saved in this browser";
      publish("save");
      if (announce) report("Working copy saved in this browser.");
      await refresh();
    } catch (error) {
      saveStatus = "Save failed";
      publish("save");
      report(`Browser draft could not be saved: ${error.message}`, true);
    }
  }, saveDelay);

  function flush() {
    if (!pendingSave) return;
    persist.cancel();
    const pending = pendingSave;
    pendingSave = null;
    storage.saveDraft(pending).then(refresh).catch(() => {});
  }

  function install(value) {
    if (closed || isClosed()) return;
    flush();
    stopEditing();
    revision += 1;
    pkg = packageFrom(value, decodeBinary);
    controller = createEditController(pkg);
    stopEditing = controller.subscribe(onEdit);
    saveStatus = "Not saved";
    publish("package");
    return pkg;
  }

  return Object.freeze({
    state: snapshot,
    async list({ preferredId = pkg.id, discoverBuiltins = false, publish: shouldPublish = true } = {}) {
      const discovery = storage.listDrafts();
      if (discoverBuiltins && typeof listBuiltins === "function") builtins = await listBuiltins();
      drafts = await discovery;
      if (closed || isClosed()) return "";
      if (shouldPublish) publish("package");
      return selectedId(preferredId);
    },
    async discoverBuiltins() {
      if (typeof listBuiltins !== "function") return builtins;
      builtins = await listBuiltins();
      if (!closed && !isClosed()) publish("package");
      return builtins;
    },
    async open(value) {
      if (typeof value !== "string") return install(value);
      if (!value) return;
      // Re-opening the already-open package would replace the working copy
      // with its last SAVED snapshot, silently dropping any pending edit.
      if (value === pkg.id) return pkg;
      const request = ++requestId;
      flush();
      const draft = draftFor(value);
      const builtin = builtinFor(value);
      if (!draft && !builtin) throw new Error(`Unknown package: ${value}`);
      const opened = draft ?? { ...await loadBuiltin(value), baseRevision: builtin?.revision ?? null };
      if (closed || isClosed() || request !== requestId) return;
      install(opened);
      if (draftNeedsExampleUpdate(draft, builtin)) {
        report("This local draft predates the current example. Export it before Reset example if you want to keep its changes.");
      }
      return pkg;
    },
    save({ announce = true, immediate = false, markSaved = false, value = pkg } = {}) {
      if (!value?.id) return Promise.resolve();
      if (!immediate) {
        pendingSave = value;
        saveStatus = "Saving…";
        publish("save");
        persist(announce);
        return Promise.resolve();
      }
      return storage.saveDraft(value).then(async result => {
        if (markSaved) {
          saveStatus = "Saved in this browser";
          publish("save");
        }
        await refresh();
        return result;
      });
    },
    async deleteDraft({ request = false, cancel = false, confirm = false, id = pkg.id } = {}) {
      if (request) {
        if (!draftFor(id)) return null;
        pendingDelete = { id, title: pkg.title, reset: Boolean(builtinFor(id)) };
        publish("package");
        return pendingDelete;
      }
      if (cancel) {
        pendingDelete = null;
        publish("package");
        return null;
      }
      if (!confirm) return null;
      const removed = pendingDelete;
      if (!removed) return null;
      if (pendingSave?.id === removed.id) {
        persist.cancel();
        pendingSave = null;
      }
      await storage.deleteDraft(removed.id);
      pendingDelete = null;
      await refresh();
      const selected = selectedId(removed.reset ? removed.id : builtins[0]?.id);
      if (selected) await this.open(selected);
      else install({ id: "", title: "No package selected", files: [] });
      return removed;
    },
    async importZip(file) {
      if (!file) return null;
      const imported = await zip.read(file);
      if (draftFor(imported.id)) throw new Error(`A local package already uses the id ${imported.id}. Delete it first, or change the imported manifest id.`);
      install(imported);
      await this.save({ immediate: true });
      return pkg;
    },
    exportSnapshot({ id = pkg.id, path = "", text } = {}) {
      const name = `${packageIdFromTitle(id)}.zip`;
      const files = new Map(pkg.files);
      if (path && files.has(path) && typeof text === "string") files.set(path, text);
      return { name, bytes: zip.write(files, pkg.folders), type: "application/zip" };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
    close() {
      if (closed) return;
      flush();
      closed = true;
      persist.cancel();
      stopEditing();
      listeners.clear();
    }
  });
}
