import { kebabName } from "./creation.mjs";
import { COLLECTION_COPY } from "./copy/collection-copy.mjs";
import { element, renderBackticks } from "./dom.mjs";

export function openRenameDialog({ document, anchor, references, name, initial = "", onApplied, onCancel }) {
  const box = element(document, "section", undefined, "opengdd-author-confirmation");
  box.dataset.renameDialog = "";
  box.setAttribute("role", "dialog");
  const label = element(document, "label", COLLECTION_COPY.renameQuestion);
  const input = element(document, "input");
  input.dataset.renameInput = "";
  input.autocomplete = "off";
  label.append(input);
  const preview = element(document, "p", "", "opengdd-author-create-preview");
  const question = element(document, "p");
  question.dataset.renamePlan = "";
  const error = element(document, "p", "", "opengdd-author-create-error");
  error.dataset.renameError = "";
  error.setAttribute("aria-live", "polite");
  const rename = element(document, "button", COLLECTION_COPY.rename);
  rename.type = "button";
  rename.dataset.renameConfirm = "";
  const cancel = element(document, "button", COLLECTION_COPY.cancel);
  cancel.type = "button";
  cancel.dataset.renameCancel = "";
  let plan;
  const current = name.includes("#") ? name.split("#", 2)[1].split(".").at(-1) : name.split(".").at(-1);
  const update = () => {
    const field = name.includes("#");
    const next = field ? input.value.trim() : kebabName(input.value);
    renderBackticks(preview, next ? COLLECTION_COPY.renamePreview(next) : "", { replace: true });
    if (next === current) {
      plan = undefined;
      question.textContent = "";
      error.textContent = "";
      rename.disabled = true;
      return;
    }
    plan = references.planRename(name, next);
    const accepted = plan.safety === "complete";
    renderBackticks(question, accepted ? plan.reason : "", { replace: true });
    renderBackticks(error, accepted || !input.value ? "" : plan.reason, { replace: true });
    // The sentence arrives after typing and grows the box downward; keep the
    // buttons, which are last, in view.
    rename.scrollIntoView?.({ block: "nearest" });
    rename.disabled = !accepted;
  };
  input.addEventListener("input", update);
  cancel.addEventListener("click", () => { box.remove(); onCancel?.(); anchor.focus?.(); });
  rename.addEventListener("click", async () => {
    rename.disabled = true;
    const result = await references.applyRename(plan);
    if (!result.applied) {
      question.textContent = "";
      error.textContent = result.reason;
      return;
    }
    box.remove();
    await onApplied?.(plan.next, result);
  });
  box.append(label, preview, question, error, rename, cancel);
  const row = anchor.closest?.("[data-record-row], .opengdd-author-record-breadcrumb, [data-collection-header], [data-collection-field]");
  let container = box;
  if (row?.tagName === "TR") {
    container = element(document, "tr");
    const cell = element(document, "td");
    cell.colSpan = Math.max(1, row.children?.length ?? 1);
    cell.append(box);
    container.append(cell);
    row.after(container);
  } else (row ?? anchor).after(box);
  const remove = box.remove.bind(box);
  box.remove = () => { if (container === box) remove(); else container.remove(); };
  input.value = initial;
  update();
  // "end", not "nearest": in the band the box can be taller than the space,
  // and the designer needs the Rename and Cancel buttons, which are last.
  box.scrollIntoView?.({ block: "end" });
  input.focus();
  input.select?.();
  return box;
}
