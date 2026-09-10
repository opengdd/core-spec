export const NOTES_STORE_PATH = "panels/example.notes/notes.json";

export function endOfText(text) {
  const lines = text.split("\n");
  return { line: lines.length - 1, character: lines.at(-1).length };
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanNotes(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(note => plainObject(note) && typeof note.id === "string"
    && typeof note.name === "string" && typeof note.text === "string")
    .map(note => ({ id: note.id, name: note.name, text: note.text }));
}

// Notes are one flat list per package. A version 1 store kept them under
// design-file names; its notes are read in file order and rewritten flat on
// the next change.
export function readNotes(text) {
  if (typeof text !== "string") return [];
  const value = JSON.parse(text);
  if (plainObject(value) && value.version === 2) return cleanNotes(value.notes);
  if (plainObject(value) && value.version === 1 && plainObject(value.byFile)) {
    const notes = Object.values(value.byFile).flatMap(cleanNotes);
    const seen = new Set();
    return notes.map(note => {
      const id = seen.has(note.id) ? nextNoteId([...seen].map(id => ({ id }))) : note.id;
      seen.add(id);
      return { ...note, id };
    });
  }
  throw new Error("The notes file has an unsupported format.");
}

export function serializeNotes(notes) {
  return `${JSON.stringify({ version: 2, notes }, null, 2)}\n`;
}

export function nextNoteId(notes) {
  const ids = new Set(notes.map(note => note.id));
  let number = 1;
  while (ids.has(`note-${number}`)) number += 1;
  return `note-${number}`;
}
