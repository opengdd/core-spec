import { NOTES_STORE_PATH, endOfText, nextNoteId, readNotes, serializeNotes } from "./notes-store.mjs";

function element(document, name, text, className) {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const sameName = (left, right) => left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;

export default {
  api: 1,
  id: "example.notes",
  title: "Notes",
  surfaces: ["sidebar"],
  inspects: { kinds: ["file"] },
  needs: ["edits"],
  empty: { title: "No notes yet." },
  styles: new URL("./notes.css", import.meta.url),
  create(context) {
    const { document } = context;
    const root = element(document, "section", undefined, "opengdd-notes");
    context.element.append(root);
    let createMode = false;
    let confirmDeleteId = "";
    let pendingRefresh = false;
    let commitQueue = Promise.resolve();
    const openNotes = new Set();

    const currentNotes = () => {
      try { return { notes: readNotes(context.package.read(NOTES_STORE_PATH)), error: "" }; }
      catch (error) { return { notes: [], error: error?.message ?? "The notes file could not be read." }; }
    };

    const mutate = (label, change, { coalesce } = {}) => {
      commitQueue = commitQueue.catch(() => {}).then(async () => {
        const storeText = context.package.read(NOTES_STORE_PATH);
        const notes = readNotes(storeText);
        change(notes);
        const tx = context.services.edits.begin(label, coalesce ? { coalesce } : undefined);
        if (typeof storeText === "string") {
          tx.text(NOTES_STORE_PATH).replace({
            start: { line: 0, character: 0 },
            end: endOfText(storeText),
            revision: context.package.revision(NOTES_STORE_PATH)
          }, serializeNotes(notes));
        } else tx.file(NOTES_STORE_PATH).create(serializeNotes(notes));
        await tx.commit();
      });
      return commitQueue;
    };

    // A name form is used for both creation and rename.
    const nameForm = (className, initial, submit, cancel) => {
      const form = element(document, "form", undefined, `opengdd-notes-name-form${className ? ` ${className}` : ""}`);
      const label = element(document, "label");
      label.append(element(document, "span", "Name", "opengdd-notes-field-label"));
      const input = element(document, "input");
      input.name = "name";
      input.value = initial;
      input.required = true;
      input.maxLength = 80;
      input.autocomplete = "off";
      input.placeholder = "Scene idea";
      label.append(input);
      const actions = element(document, "div", undefined, "opengdd-notes-form-actions");
      const confirm = element(document, "button", initial ? "Save" : "Create");
      confirm.type = "submit";
      const cancelButton = element(document, "button", "Cancel");
      cancelButton.type = "button";
      cancelButton.addEventListener("click", cancel);
      const message = element(document, "p", undefined, "opengdd-notes-form-error");
      message.setAttribute("role", "alert");
      actions.append(confirm, cancelButton);
      form.append(label, actions, message);
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const name = input.value.trim();
        const problem = name ? submit.validate(name) : "Give the note a name.";
        if (problem) { message.textContent = problem; input.focus(); return; }
        confirm.disabled = true;
        try { await submit.run(name); }
        catch (error) {
          confirm.disabled = false;
          message.textContent = error?.message ?? "The note could not be saved.";
        }
      });
      return { form, input };
    };

    const render = ({ focusId = "", renameId = "" } = {}) => {
      pendingRefresh = false;
      context.surface.empty(false);
      const { notes, error } = currentNotes();
      context.surface.setBadge(notes.length ? { count: notes.length } : undefined);
      const active = root.contains(document.activeElement) ? document.activeElement : null;
      const activeId = active?.closest?.("[data-note-id]")?.dataset.noteId ?? "";
      const activeKind = active?.matches?.("textarea") ? "text" : active?.matches?.("input") ? "name" : "";
      const selection = activeKind ? { start: active.selectionStart, end: active.selectionEnd } : null;
      for (const details of root.querySelectorAll("details[data-note-id][open]")) openNotes.add(details.dataset.noteId);

      root.replaceChildren();
      if (error) {
        const message = element(document, "p", error, "opengdd-notes-error");
        message.setAttribute("role", "alert");
        root.append(message);
        return;
      }
      const toolbar = element(document, "div", undefined, "opengdd-notes-toolbar");
      const add = element(document, "button", "+ New note", "opengdd-notes-add");
      add.type = "button";
      add.addEventListener("click", () => {
        confirmDeleteId = "";
        createMode = true;
        render();
        root.querySelector("[data-new-note-name]")?.focus();
      });
      toolbar.append(add);
      root.append(toolbar);

      if (createMode) {
        const { form, input } = nameForm("", "", {
          validate: name => notes.some(note => sameName(note.name, name)) ? "A note with this name already exists." : "",
          async run(name) {
            const id = nextNoteId(currentNotes().notes);
            await mutate(`Add note: ${name}`, current => current.push({ id, name, text: "" }));
            createMode = false;
            openNotes.add(id);
            render({ focusId: id });
          }
        }, () => { createMode = false; render(); });
        form.dataset.newNoteForm = "";
        input.dataset.newNoteName = "";
        root.append(form);
      }
      if (!notes.length) root.append(element(document, "p", "No notes yet.", "opengdd-notes-empty"));

      for (const note of notes) {
        const details = element(document, "details", undefined, "opengdd-notes-item");
        details.dataset.noteId = note.id;
        details.open = openNotes.has(note.id) || focusId === note.id || renameId === note.id;
        const summary = element(document, "summary");
        summary.append(element(document, "span", note.name, "opengdd-notes-name"));
        const body = element(document, "div", undefined, "opengdd-notes-body");
        const itemActions = element(document, "span", undefined, "opengdd-notes-item-actions");
        const stop = handler => event => { event.preventDefault(); event.stopPropagation(); handler(); };
        if (confirmDeleteId === note.id) {
          const confirm = element(document, "button", "✓", "opengdd-notes-delete-confirm");
          const cancel = element(document, "button", "×", "opengdd-notes-delete-cancel");
          confirm.type = cancel.type = "button";
          confirm.dataset.noteDeleteConfirm = note.id;
          confirm.title = `Delete ${note.name}`;
          confirm.setAttribute("aria-label", `Confirm delete ${note.name}`);
          cancel.title = "Keep note";
          cancel.setAttribute("aria-label", `Cancel deleting ${note.name}`);
          confirm.addEventListener("click", stop(async () => {
            confirm.disabled = cancel.disabled = true;
            try {
              await mutate(`Delete note: ${note.name}`, current => {
                const index = current.findIndex(candidate => candidate.id === note.id);
                if (index >= 0) current.splice(index, 1);
              });
              confirmDeleteId = "";
              openNotes.delete(note.id);
              render();
            } catch {
              confirm.disabled = cancel.disabled = false;
            }
          }));
          cancel.addEventListener("click", stop(() => {
            confirmDeleteId = "";
            render();
            root.querySelector(`[data-note-delete="${note.id}"]`)?.focus();
          }));
          itemActions.append(confirm, cancel);
          queueMicrotask(() => confirm.focus());
        } else {
          const rename = element(document, "button", "Rename", "opengdd-notes-rename");
          rename.type = "button";
          rename.addEventListener("click", stop(() => {
            confirmDeleteId = "";
            openNotes.add(note.id);
            render({ renameId: note.id });
          }));
          const remove = element(document, "button", "Delete", "opengdd-notes-delete");
          remove.type = "button";
          remove.dataset.noteDelete = note.id;
          remove.setAttribute("aria-label", `Delete ${note.name}`);
          remove.addEventListener("click", stop(() => { confirmDeleteId = note.id; render(); }));
          itemActions.append(rename, remove);
        }
        summary.append(itemActions);
        details.addEventListener("toggle", () => {
          if (details.open) openNotes.add(note.id);
          else openNotes.delete(note.id);
        });

        if (renameId === note.id) {
          const { form, input } = nameForm("opengdd-notes-rename-form", note.name, {
            validate: name => notes.some(candidate => candidate.id !== note.id && sameName(candidate.name, name))
              ? "A note with this name already exists." : "",
            async run(name) {
              await mutate(`Rename note: ${note.name}`, current => {
                const target = current.find(candidate => candidate.id === note.id);
                if (target) target.name = name;
              });
              render({ focusId: note.id });
            }
          }, () => render({ focusId: note.id }));
          input.dataset.renameNoteName = "";
          body.append(form);
          queueMicrotask(() => { input.focus(); input.select(); });
        }

        const field = element(document, "textarea");
        field.value = note.text;
        field.setAttribute("aria-label", `${note.name} note`);
        field.dataset.noteText = note.id;
        field.addEventListener("input", () => {
          const value = field.value;
          void mutate(`Edit note: ${note.name}`, current => {
            const target = current.find(candidate => candidate.id === note.id);
            if (target) target.text = value;
          }, { coalesce: `example.notes/${note.id}` });
        });
        body.append(field);
        details.append(summary, body);
        root.append(details);
      }

      const restoreId = focusId || activeId;
      if (restoreId) {
        const item = root.querySelector(`[data-note-id="${restoreId}"]`);
        const target = renameId === restoreId || activeKind === "name"
          ? item?.querySelector("input") ?? item?.querySelector("textarea")
          : item?.querySelector("textarea");
        target?.focus();
        if (selection && target?.setSelectionRange && activeKind) target.setSelectionRange(selection.start, selection.end);
      }
    };

    root.addEventListener("focusout", () => queueMicrotask(() => {
      if (!root.contains(document.activeElement) && pendingRefresh) render();
    }));
    context.package.subscribe(event => {
      if (event?.type === "opened") {
        createMode = false;
        confirmDeleteId = "";
        openNotes.clear();
        render();
      } else if (root.contains(document.activeElement)) pendingRefresh = true;
      else render();
    });
    render();
  }
};
