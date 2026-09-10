const DATABASE = "opengdd-authoring";
const STORE = "drafts";
const DATABASE_VERSION = 3;

export function moveLegacyTicTacToeDraft(draft) {
  if (!draft || draft.id !== "tic-tac-toe") return null;
  let format;
  try {
    const files = new Map(draft.files ?? []);
    format = JSON.parse(files.get("manifest.json")).opengdd;
    if (typeof format !== "string" || !["0.6", "0.7"].includes(format)) return null;
  } catch {
    return null;
  }
  const suffix = Number.isFinite(draft.modified) ? draft.modified : "legacy";
  return {
    ...draft,
    id: `tic-tac-toe-v${format.replace(".", "")}-draft-${suffix}`,
    title: `${draft.title || "Tic-Tac-Toe"} (saved v${format} draft)`
  };
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = event => {
      const store = event.oldVersion < 1
        ? request.result.createObjectStore(STORE, { keyPath: "id" })
        : request.transaction.objectStore(STORE);
      if (event.oldVersion < 2) store.delete("lantern-demo");
      if (event.oldVersion < 3) {
        const legacy = store.get("tic-tac-toe");
        legacy.onsuccess = () => {
          const moved = moveLegacyTicTacToeDraft(legacy.result);
          if (!moved) return;
          store.put(moved);
          store.delete("tic-tac-toe");
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function listDrafts() {
  return transact("readonly", store => store.getAll()).then(items =>
    items.sort((left, right) => right.modified - left.modified)
  );
}

export function loadDraft(id) {
  return transact("readonly", store => store.get(id));
}

export function draftNeedsExampleUpdate(draft, builtin) {
  return Boolean(draft && builtin && typeof builtin.revision === "string"
    && draft.baseRevision !== builtin.revision);
}

export function saveDraft({ id, title, files, folders, baseRevision = null }) {
  return transact("readwrite", store => store.put({
    id,
    title,
    modified: Date.now(),
    baseRevision: typeof baseRevision === "string" ? baseRevision : null,
    files: [...files],
    folders: [...folders]
  }));
}

export function deleteDraft(id) {
  return transact("readwrite", store => store.delete(id));
}
