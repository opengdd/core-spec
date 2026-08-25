function notesPathFor(file) {
  return `panels/example.notes/${file}.md`;
}

function endOfText(text) {
  const lines = text.split("\n");
  return { line: lines.length - 1, character: lines.at(-1).length };
}

async function createNotesFile(context) {
  const selection = context.services.selection.current();
  if (!selection?.file || selection.kind !== "file") return;
  const tx = context.services.edits.begin(`Add notes for ${selection.file}`);
  tx.file(notesPathFor(selection.file)).create("");
  await tx.commit();
}

export default {
  api: 1,
  id: "example.notes",
  title: "Notes",
  surfaces: ["inspector"],
  inspects: { kinds: ["file"] },
  needs: ["selection", "edits"],
  compact: {
    strategy: "stack",
    note: "The prompt or textarea stacks in one column; nothing here needs width."
  },
  empty: {
    title: "Select a file to read or add its notes.",
    action: { label: "New notes file", run: createNotesFile }
  },
  styles: new URL("./notes.css", import.meta.url),

  create(context) {
    const field = context.document.createElement("textarea");
    field.setAttribute("aria-label", "Notes");
    context.element.append(field);
    let path = "";
    let pendingCommit = 0;

    const cancelPending = () => {
      if (pendingCommit) clearTimeout(pendingCommit);
      pendingCommit = 0;
    };
    const render = () => {
      const selection = context.services.selection.current();
      path = selection?.kind === "file" && selection.file ? notesPathFor(selection.file) : "";
      const text = path ? context.package.read(path) : undefined;
      context.surface.empty(typeof text !== "string");
      if (typeof text === "string" && context.document.activeElement !== field) field.value = text;
    };
    field.addEventListener("input", () => {
      cancelPending();
      pendingCommit = setTimeout(async () => {
        pendingCommit = 0;
        const before = context.package.read(path);
        if (typeof before !== "string") return;
        const tx = context.services.edits.begin(`Edit notes for ${path}`, { coalesce: `example.notes/${path}` });
        tx.text(path).replace({
          start: { line: 0, character: 0 },
          end: endOfText(before),
          revision: context.package.revision(path)
        }, field.value);
        await tx.commit();
      }, 600);
    }, { signal: context.signal });
    context.services.selection.subscribe(render);
    context.package.subscribe(render);
    render();
    return { destroy: cancelPending };
  }
};
