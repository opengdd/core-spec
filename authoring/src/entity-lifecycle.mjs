import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { anchoredConfirmation, confirmationHost, element } from "./dom.mjs";
import { openRenameDialog } from "./rename-dialog.mjs";

export function renameEntity({ context, anchor, address, initial, normalize, onApplied, onCancel }) {
  return openRenameDialog({
    document: context.document,
    anchor,
    references: context.services.references,
    name: address,
    initial,
    normalize,
    onApplied,
    onCancel
  });
}

export function openTextEditDialog({ document, anchor, label, initial = "", confirm, cancel,
  normalize = value => value.trim(), validate, submit }) {
  const box = element(document, "section", undefined, "opengdd-author-confirmation");
  box.dataset.inspectorTextDialog = "";
  box.setAttribute("role", "dialog");
  const fieldLabel = element(document, "label", label);
  const input = element(document, "input");
  input.dataset.inspectorTextInput = "";
  input.autocomplete = "off";
  fieldLabel.append(input);
  const error = element(document, "p", "", "opengdd-author-create-error");
  error.setAttribute("aria-live", "polite");
  const accept = element(document, "button", confirm);
  accept.type = "button";
  accept.dataset.inspectorTextConfirm = "";
  const dismiss = element(document, "button", cancel);
  dismiss.type = "button";
  dismiss.dataset.inspectorTextCancel = "";
  const update = () => {
    const value = normalize(input.value);
    const message = validate?.(value, input.value) ?? "";
    error.textContent = message;
    accept.disabled = Boolean(message) || value === normalize(initial);
  };
  input.addEventListener("input", update);
  dismiss.addEventListener("click", () => { box.remove(); anchor.focus?.(); });
  accept.addEventListener("click", async () => {
    accept.disabled = true;
    try {
      await submit(normalize(input.value), input.value);
      box.remove();
    } catch (failure) {
      error.textContent = failure.message;
      accept.disabled = false;
    }
  });
  box.append(fieldLabel, error, accept, dismiss);
  confirmationHost(anchor).after(box);
  input.value = initial;
  update();
  input.focus();
  input.select?.();
  return box;
}

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const messageNamesAddress = (message, address) => new RegExp(
  `(^|[^A-Za-z0-9_.-])${escapeRegExp(address)}(?=[^A-Za-z0-9_.-]|$)`, "u"
).test(String(message ?? ""));
const findingList = value => Array.isArray(value?.introduced) ? value.introduced
  : Array.isArray(value?.findings) ? value.findings
  : Array.isArray(value) ? value : undefined;

export const matchesExpectedFinding = (finding, expected) => finding.code === expected.code
  && (expected.address === undefined || messageNamesAddress(finding.message, expected.address));

export async function removeEntity({ context, anchor, address, file, pointer, pointers, range, removeFile = false, label, question, expectedFindings = [] }) {
  const count = context.services.references.usages(address).length;
  const accepted = await anchoredConfirmation({
    document: context.document,
    anchor,
    question: typeof question === "function" ? question(count) : question ?? INSPECTOR_COPY.removeQuestion(label, count),
    actions: [{ label: INSPECTOR_COPY.remove, value: true, danger: true }, { label: INSPECTOR_COPY.cancel, value: false }],
    datasetKey: "entityConfirmation"
  });
  if (!accepted) return false;
  const transaction = context.internal.begin(INSPECTOR_COPY.removeEntity(label));
  if (removeFile) transaction.file(file).remove();
  else if (range) transaction.text(file).replace(range, "");
  else {
    const json = transaction.json(file);
    for (const target of pointers ?? [pointer]) json.remove(target);
  }
  let introduced;
  try {
    const validation = await context.internal.validatePackage(transaction, { collectIntroduced: true });
    introduced = findingList(validation);
    if (!introduced) throw new Error(INSPECTOR_COPY.stagedFindingsUnavailable);
  }
  catch (error) {
    introduced = findingList(error);
    if (!introduced) { transaction.abort(); throw error; }
  }
  const unexpected = introduced.find(finding => !expectedFindings.some(expected => matchesExpectedFinding(finding, expected)));
  if (unexpected) {
    transaction.abort();
    throw new Error(unexpected.message);
  }
  await transaction.commit();
  context.services.selection.select(null);
  return true;
}
