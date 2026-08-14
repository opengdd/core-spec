const DATABASE = "opengdd-authoring";
const STORE = "drafts";

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
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
