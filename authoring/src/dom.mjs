// Shared DOM construction and inline-code rendering for the authoring tool.
// Panels use these helpers so identical interface elements have one implementation.
export function element(document, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function renderBackticks(node, text, { replace = false } = {}) {
  if (replace) node.replaceChildren();
  String(text ?? "").split("`").forEach((part, index) => {
    if (!part) return;
    if (index % 2) node.append(element(node.ownerDocument, "code", part));
    else node.append(part);
  });
  return node;
}

export const confirmationHost = anchor => anchor.closest?.(
  "[data-record-row], [data-form-row], .opengdd-author-record-breadcrumb, [data-collection-header], [data-collection-field], .opengdd-author-entity-header"
) ?? anchor;

export function anchoredConfirmation({ document, anchor, question, actions, datasetKey, removeExisting }) {
  return new Promise(resolve => {
    removeExisting?.();
    const box = element(document, "section", undefined, "opengdd-author-confirmation");
    box.setAttribute("role", "dialog");
    if (datasetKey) box.dataset[datasetKey] = "";
    box.append(renderBackticks(element(document, "p"), question));
    const settle = value => { box.remove(); resolve(value); };
    for (const action of actions) {
      const button = element(document, "button", action.label);
      button.type = "button";
      if (action.danger) button.classList.add("opengdd-author-danger-action");
      button.addEventListener("click", () => settle(action.value));
      box.append(button);
    }
    // A confirmation asked from an inspector header sits under the whole
    // header, not inside its row of buttons.
    confirmationHost(anchor).after(box);
  });
}
