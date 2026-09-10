// Read-only inspector groups: a labelled group row, browsable source rows, and
// entity chips carrying name and kind. Copy and DOM only, so field modules can
// import this without the kit's lifecycle.
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";

let nextReferenceGroupId = 0;

export function referenceGroup(context, {
  key, label, help, rows = [], empty = rows.length === 0, action, count
}) {
  const document = context.document;
  const section = element(document, "section", undefined, "opengdd-author-reference-group");
  const id = `opengdd-inspector-group-${++nextReferenceGroupId}`;
  if (key) section.dataset.inspectorFindingTarget = key;
  const heading = element(document, "h3", undefined, "opengdd-author-reference-label");
  heading.title = help;
  heading.setAttribute("aria-describedby", `${id}-help`);
  const rowCount = count ?? rows.reduce((total, row) => total + Number(row?.dataset?.inspectorCount ?? 1), 0);
  const populated = rows.length > 0 || Number(rowCount) > 0;
  const labelText = element(document, "span", undefined, "opengdd-author-reference-label-text");
  if (populated) {
    const words = String(label).trim().split(/\s+/u);
    const last = words.pop() ?? "";
    if (words.length) labelText.append(`${words.join(" ")} `);
    const tail = element(document, "span", undefined, "opengdd-author-reference-label-tail");
    tail.append(last, "\u00a0", element(document, "span", String(rowCount), "opengdd-author-reference-count"));
    labelText.append(tail);
  } else labelText.textContent = label;
  heading.append(labelText);
  const description = element(document, "p", help, "opengdd-author-visually-hidden");
  description.id = `${id}-help`;
  description.dataset.inspectorGroupHelp = "";
  const content = element(document, "div", undefined, "opengdd-author-reference-content");
  if (empty && rows.length === 0) content.append(element(document, "span", INSPECTOR_COPY.none, "opengdd-author-reference-none"));
  if (rows.length) {
    const rowHost = element(document, "div", undefined, "opengdd-author-reference-rows");
    rowHost.append(...rows);
    content.append(rowHost);
  }
  if (action) {
    action.classList?.add("opengdd-author-reference-action");
    const describedBy = [action.getAttribute?.("aria-describedby"), `${id}-help`].filter(Boolean).join(" ");
    action.setAttribute?.("aria-describedby", describedBy);
    content.append(action);
  }
  section.append(heading, content, description);
  return section;
}

const excerptAt = (context, file, line) => {
  const source = context.package.read(file);
  if (typeof source !== "string") return "";
  return String(source.split(/\r?\n/u)[line - 1] ?? "").replace(/\s+/gu, " ").trim();
};

export function locationRows(context, locations, { reveal = location => context.internal?.revealLocation?.(location) } = {}) {
  const document = context.document;
  const root = element(document, "div", undefined, "opengdd-author-location-rows");
  const seen = new Set();
  for (const location of locations ?? []) {
    if (!location?.file) continue;
    const line = (location.range?.start?.line ?? 0) + 1;
    const identity = `${location.file}\0${line}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const excerpt = excerptAt(context, location.file, line);
    const row = element(document, "button", undefined, "opengdd-author-location-row");
    row.type = "button";
    row.setAttribute("aria-label", [INSPECTOR_COPY.locationName(location.file, line), excerpt].filter(Boolean).join(": "));
    row.append(
      element(document, "span", location.file, "opengdd-author-location-row-file"),
      element(document, "span", String(line), "opengdd-author-location-row-line"),
      element(document, "span", excerpt, "opengdd-author-location-row-excerpt")
    );
    row.addEventListener("click", () => reveal(location));
    root.append(row);
  }
  root.dataset.inspectorCount = String(seen.size);
  return root;
}

export function entityChips(context, entities, { open = entity => context.services.selection.select(entity.selection ?? entity) } = {}) {
  const document = context.document;
  const root = element(document, "div", undefined, "opengdd-author-entity-chips");
  root.dataset.inspectorCount = String((entities ?? []).length);
  for (const entity of entities ?? []) {
    const name = entity.label ?? entity.display ?? entity.name;
    const kind = INSPECTOR_COPY.entityKind(entity.kindLabel ?? entity.kind);
    const row = element(document, "span", undefined, "opengdd-author-entity-chip-row");
    for (const [key, value] of Object.entries(entity.rowDataset ?? {})) row.dataset[key] = value;
    if (entity.findingKey) {
      row.dataset.inspectorFindingTarget = entity.findingKey;
      row.tabIndex = -1;
    }
    const chip = element(document, "button", undefined, "opengdd-author-reference-chip opengdd-author-entity-chip");
    chip.type = "button";
    chip.setAttribute("aria-label", INSPECTOR_COPY.entityName(name, kind));
    for (const [key, value] of Object.entries(entity.dataset ?? {})) chip.dataset[key] = value;
    chip.append(element(document, "span", name),
      element(document, "small", kind, "opengdd-author-classification opengdd-author-reference-kind"));
    chip.addEventListener("click", () => open(entity));
    row.append(chip);
    if (entity.detail) row.append(element(document, "span", entity.detail, "opengdd-author-reference-detail"));
    if (entity.after) row.append(entity.after);
    root.append(row);
  }
  return root;
}
