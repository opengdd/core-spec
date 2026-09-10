import { kebabName } from "./creation.mjs";
import { element } from "./dom.mjs";
import { packageFiles, parseJson, plainObject, pointer } from "./json-path.mjs";

const RECORD_FILE = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

function recordEntries(service, collection) {
  return service.list().flatMap(path => {
    const match = RECORD_FILE.exec(path);
    if (!match || match[1] !== collection) return [];
    const values = parseJson(service.read(path));
    return plainObject(values) ? [{ id: match[2], values }] : [];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function countMarkdownMentions(service, collection, id) {
  const address = `collections.${collection}.${id}`;
  return service.list().filter(path => path.toLowerCase().endsWith(".md")).reduce((total, path) => {
    const text = service.read(path);
    return total + (typeof text === "string" ? text.split(address).length - 1 : 0);
  }, 0);
}

function walkLinks(value, shape, targetCollection, targetId) {
  if (!shape || !plainObject(shape)) return 0;
  if (shape.type === "link" && shape.to === targetCollection) {
    const values = shape.many === true ? (Array.isArray(value) ? value : []) : [value];
    return values.filter(candidate => candidate === targetId).length;
  }
  if (shape.type !== "list" || !Array.isArray(value) || !plainObject(shape.of)) return 0;
  return value.reduce((total, line) => total + (plainObject(line) ? Object.entries(shape.of)
    .reduce((lineTotal, [key, nested]) => lineTotal + walkLinks(line[key], nested, targetCollection, targetId), 0) : 0), 0);
}

function countRecordLinks(service, collection, id) {
  const schemas = new Map();
  for (const path of service.list()) {
    const match = /^collections\/([^/]+)\/_collection\.json$/.exec(path);
    const record = match ? parseJson(service.read(path))?.record : undefined;
    if (match && plainObject(record)) schemas.set(match[1], record);
  }
  let count = 0;
  for (const [sourceCollection, schema] of schemas) {
    for (const { values } of recordEntries(service, sourceCollection)) {
      for (const [key, shape] of Object.entries(schema)) count += walkLinks(values[key], shape, collection, id);
    }
  }
  return count;
}

function schemaFor(service, collection) {
  return parseJson(service.read(`collections/${collection}/_collection.json`))?.record;
}

function mirrorFor(service, collection, field, shape) {
  if (shape?.type !== "link" || typeof shape.to !== "string") return undefined;
  const targetSchema = schemaFor(service, shape.to);
  const inverse = !shape.mirrored_by && plainObject(targetSchema)
    ? Object.entries(targetSchema).find(([, candidate]) => candidate?.type === "link"
      && candidate.to === collection && candidate.mirrored_by === field)
    : undefined;
  const mirrorField = shape.mirrored_by ?? inverse?.[0];
  const mirrorShape = mirrorField && plainObject(targetSchema) ? targetSchema[mirrorField] : undefined;
  return mirrorField ? { collection: shape.to, field: mirrorField, many: mirrorShape?.many === true } : undefined;
}

function stageValue(json, at, current, value) {
  if (current.exists) json.set(at, value);
  else json.insert("", at.slice(1).replaceAll("~1", "/").replaceAll("~0", "~"), value);
}

function stageMirror({ transaction, service, mirror, ownId, targetId, action }) {
  const file = `collections/${mirror.collection}/${targetId}.json`;
  const record = parseJson(service.read(file));
  if (!plainObject(record)) {
    if (action === "remove") return;
    throw new Error(`The mirror record ${file} does not exist.`);
  }
  const exists = Object.hasOwn(record, mirror.field);
  const value = record[mirror.field];
  const json = transaction.json(file);
  const at = pointer(mirror.field);
  if (action === "add") {
    if (mirror.many) {
      if (Array.isArray(value)) {
        if (!value.includes(ownId)) json.insert(at, "-", ownId);
      } else stageValue(json, at, { exists }, [ownId]);
    } else if (value !== ownId) stageValue(json, at, { exists }, ownId);
    return;
  }
  if (mirror.many) {
    if (!Array.isArray(value)) return;
    for (const index of value.flatMap((candidate, index) => candidate === ownId ? [index] : []).reverse()) {
      json.remove(`${at}/${index}`);
    }
  } else if (exists && value === ownId) json.set(at, null);
}

function linkIds(value, many) {
  return many && Array.isArray(value) ? value.filter(id => typeof id === "string")
    : typeof value === "string" && value ? [value] : [];
}

export function createFolderRows({
  collection, package: packageService, edits, validatePackage, openAddRecord,
  field, confirmRemove, renameRecord, references, copy
}) {
  if (!collection || !packageService || !edits || typeof validatePackage !== "function") {
    throw new TypeError("A folder row adapter needs a collection, package, edits, and staged validator.");
  }
  const pathFor = id => `collections/${collection}/${id}.json`;
  const beginAdd = (records, label) => {
    const transaction = edits.begin(label);
    const schema = schemaFor(packageService, collection);
    for (const record of records) {
      transaction.file(pathFor(record.id)).create(`${JSON.stringify(record.values, null, 2)}\n`);
      if (!plainObject(schema)) continue;
      for (const [key, shape] of Object.entries(schema)) {
        const mirror = mirrorFor(packageService, collection, key, shape);
        if (!mirror) continue;
        for (const targetId of linkIds(record.values[key], shape.many === true)) {
          stageMirror({ transaction, service: packageService, mirror, ownId: record.id, targetId, action: "add" });
        }
      }
    }
    return transaction;
  };
  const validate = async transaction => {
    try { return await validatePackage(transaction); }
    catch (error) { transaction.abort(); throw error; }
  };
  const adapter = {
    list: () => recordEntries(packageService, collection),
    read(id, key) { return parseJson(packageService.read(pathFor(id)))?.[key]; },
    async write(id, key, value, label = copy.undo.changeField) {
      const record = parseJson(packageService.read(pathFor(id)));
      if (!plainObject(record)) throw new Error(`${pathFor(id)} must contain a JSON object.`);
      const transaction = edits.begin(label);
      const json = transaction.json(pathFor(id));
      const exists = Object.hasOwn(record, key);
      const shape = schemaFor(packageService, collection)?.[key];
      if (value === undefined && exists) json.remove(pointer(key));
      else if (shape?.type === "link" && shape.many === true && Array.isArray(record[key]) && Array.isArray(value)) {
        const appended = value.length === record[key].length + 1 && record[key].every((item, index) => item === value[index]);
        let removedAt = -1;
        if (value.length === record[key].length - 1) {
          removedAt = value.findIndex((item, index) => item !== record[key][index]);
          if (removedAt < 0) removedAt = value.length;
        }
        if (appended) json.insert(pointer(key), "-", value.at(-1));
        else if (removedAt >= 0) json.remove(`${pointer(key)}/${removedAt}`);
        else json.set(pointer(key), value);
      }
      else if (exists) json.set(pointer(key), value);
      else json.insert("", key, value);
      const mirror = mirrorFor(packageService, collection, key, shape);
      if (mirror) {
        const before = new Set(linkIds(record[key], shape.many === true));
        const after = new Set(linkIds(value, shape.many === true));
        for (const targetId of before) if (!after.has(targetId)) {
          stageMirror({ transaction, service: packageService, mirror, ownId: id, targetId, action: "remove" });
        }
        for (const targetId of after) if (!before.has(targetId)) {
          stageMirror({ transaction, service: packageService, mirror, ownId: id, targetId, action: "add" });
        }
      }
      await validate(transaction);
      await transaction.commit();
    },
    async add(value, label = copy.undo.pasteRecords) {
      if (value === undefined || typeof value === "string") {
        return openAddRecord?.({ collection, prefill: typeof value === "string" ? value : "" });
      }
      const records = Array.isArray(value) ? value : [value];
      const transaction = beginAdd(records, label);
      await validate(transaction);
      await transaction.commit();
      return records.map(record => record.id);
    },
    async previewAdd(records, label = copy.undo.pasteRecords) {
      const transaction = beginAdd(records, label);
      const run = await validate(transaction);
      transaction.abort();
      return run;
    },
    async remove(id) {
      const sites = references?.usages?.(`collections.${collection}.${id}`);
      const mentions = sites ? sites.filter(site => site.channel === "prose").length
        : countMarkdownMentions(packageService, collection, id);
      const links = sites ? sites.filter(site => site.kind === "link-value").length
        : countRecordLinks(packageService, collection, id);
      const accepted = await confirmRemove?.({ id, mentions, links, question: copy.removeRecord(id, mentions, links) });
      if (!accepted) return false;
      const transaction = edits.begin(copy.undo.removeRecord);
      transaction.file(pathFor(id)).remove();
      await transaction.commit();
      return true;
    },
    ...(renameRecord ? { async rename(id, anchor) { return renameRecord({ id, anchor }); } } : {}),
    binding(id, key) { return { file: pathFor(id), pointer: pointer(key) }; },
    field(id, key, shape) { return field?.(id, key, shape); },
    files: () => packageFiles(packageService)
  };
  return Object.freeze(adapter);
}

function nextName(seed, taken) {
  const stem = kebabName(seed) || "record";
  let name = stem;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${stem}-${suffix}`;
  taken.add(name);
  return name;
}

function parseCell(value, shape) {
  if (!shape) return value;
  if (shape.type === "integer") return /^-?\d+$/.test(value.trim()) ? Number(value) : undefined;
  if (shape.type === "number") return value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined;
  if (shape.type === "link") return shape.many === true
    ? value.split(",").map(item => item.trim()).filter(Boolean)
    : value.trim() || null;
  if (shape.type === "grid") return value ? value.split(/\\n/) : [];
  return value;
}

export function parseSpreadsheet(text, { schema, existing = [], copy } = {}) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").filter(line => line.trim());
  if (lines.length < 2) return { refused: copy.pasteRefusal, records: [], messages: [] };
  const headers = lines.shift().split("\t").map(value => value.trim());
  if (!headers.some(Boolean)) return { refused: copy.pasteRefusal, records: [], messages: [] };
  const described = plainObject(schema);
  const known = new Set(described ? Object.keys(schema) : headers.filter(Boolean));
  const nameAt = ["name", "title", "id"].map(name => headers.indexOf(name)).find(index => index >= 0) ?? 0;
  const taken = new Set(existing);
  const dropped = described ? headers.filter(header => header && !known.has(header)) : [];
  const lineFields = described ? Object.entries(schema).filter(([, shape]) => shape?.type === "list").map(([field]) => field) : [];
  const records = lines.flatMap((line, rowIndex) => {
    const cells = line.split("\t");
    if (!cells.some(value => value.trim())) return [];
    const id = nextName(cells[nameAt] || `record-${rowIndex + 1}`, taken);
    const values = {};
    for (const [index, header] of headers.entries()) {
      if (!header || !known.has(header) || described && schema[header]?.type === "list") continue;
      const raw = cells[index] ?? "";
      if (!raw && described && schema[header]?.required !== true) continue;
      const value = parseCell(raw, described ? schema[header] : undefined);
      if (value !== undefined) values[header] = value;
    }
    if (described) for (const field of lineFields) values[field] = [];
    return [{ id, values }];
  });
  if (!records.length) return { refused: copy.pasteRefusal, records: [], messages: [] };
  const messages = [copy.pastedNames(records.length, records.map(record => record.id).join(", "))];
  for (const column of dropped) messages.push(copy.droppedColumn(column));
  for (const field of lineFields) if (headers.includes(field)) messages.push(copy.unpastedLines(field));
  if (described) for (const [field, shape] of Object.entries(schema)) {
    if (shape?.required !== true || shape.type === "list") continue;
    const empty = records.filter(record => !Object.hasOwn(record.values, field)
      || record.values[field] === "" || record.values[field] === null || Array.isArray(record.values[field]) && !record.values[field].length).length;
    if (empty) messages.push(copy.unfilledRequired(field, empty));
  }
  return { records, messages, refused: "" };
}

export function validationRefusal(copy, error) {
  const message = String(error?.message ?? error ?? "");
  if (message === copy.transactionRefused || message === copy.writeInterrupted) return message;
  const prefix = copy.validationRefused("");
  return message.startsWith(prefix) ? message : copy.validationRefused(message);
}

function displayValue(value, shape, copy) {
  if (shape?.type === "link" && shape.many === true) return copy.manyRecords(Array.isArray(value) ? value.length : 0);
  if (shape?.type === "list") return copy.linesCount(Array.isArray(value) ? value.length : 0);
  if (shape?.type === "grid") {
    const rows = Array.isArray(value) ? value : [];
    const columns = rows.length && typeof rows[0] === "string" ? [...rows[0]].length : 0;
    return copy.gridSize(rows.length, columns);
  }
  if (value === undefined || value === null) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

// A row adapter supplies list, read, write, add, remove, field, binding, and
// previewAdd; move is optional for tables whose row order can change.
export function createRecordTable(elementHost, { schema: initialSchema, rows, forms, copy, onSelectRow, view = {} }) {
  if (!elementHost?.ownerDocument || !rows || !forms) throw new TypeError("createRecordTable needs an Element, rows adapter, and forms service.");
  elementHost.classList?.add("opengdd-author-record-table-host");
  const document = elementHost.ownerDocument;
  let schema = initialSchema;
  view.sort ??= { key: "id", direction: "ascending" };
  view.find ??= "";
  let destroyed = false;
  let activeForm;
  let pasteBox;

  const columnsFor = entries => {
    if (plainObject(schema)) return Object.keys(schema).filter(key => !(view.authoredOrder === true && key === "id"))
      .map(key => ({ key, shape: schema[key] }));
    const counts = new Map();
    for (const row of entries) for (const key of Object.keys(row.values).filter(key => !key.startsWith("_"))) counts.set(key, (counts.get(key) ?? 0) + 1);
    const common = [...counts].filter(([, count]) => count === entries.length).map(([key]) => {
      const values = entries.map(row => row.values[key]);
      if (values.every(value => typeof value === "string")) return { key, shape: { type: "string" } };
      if (values.every(value => typeof value === "number" && Number.isFinite(value))) {
        return { key, shape: { type: values.every(Number.isInteger) ? "integer" : "number" } };
      }
      if (values.every(value => Array.isArray(value) && value.every(line => typeof line === "string"))) return { key, shape: { type: "grid" } };
      if (values.every(value => Array.isArray(value) && value.every(line => plainObject(line)))) return { key, shape: { type: "list" } };
      return { key, open: true };
    });
    return counts.size > common.length ? [...common, { key: "__other__", other: true }] : common;
  };

  const shownRows = () => {
    const value = view.find.trim().toLowerCase();
    // Find follows the row's human identity. Link columns can mention the
    // searched id in several unrelated rows, which would make "bell" show
    // three route records instead of the Bell Market row.
    const filtered = rows.list().filter(row => !value || `${row.id} ${row.values.title ?? ""} ${row.values.name ?? ""}`.toLowerCase().includes(value));
    if (view.authoredOrder === true) return filtered;
    const key = view.sort.key;
    return filtered.sort((left, right) => {
      const leftValue = key === "id" ? left.id : left.values[key];
      const rightValue = key === "id" ? right.id : right.values[key];
      const compared = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
      return view.sort.direction === "ascending" ? compared : -compared;
    });
  };

  function startEdit(cell, row, column) {
    if (column.other || column.open || ["grid", "list"].includes(column.shape?.type)) { onSelectRow?.(row.id); return; }
    const descriptor = rows.field?.(row.id, column.key, column.shape);
    const binding = rows.binding?.(row.id, column.key);
    if (!descriptor || !binding) return;
    descriptor.binding = binding;
    descriptor.write = (value, detail) => rows.write(row.id, column.key, detail.remove ? undefined : value, detail.label);
    cell.replaceChildren();
    activeForm?.destroy?.();
    activeForm = forms.create(cell, { fields: [descriptor] });
    const control = cell.querySelector?.("input, select, textarea, button");
    control?.focus?.();
  }

  function moveCell(cell, key) {
    const cells = [...elementHost.querySelectorAll?.("[data-roving-cell]") ?? []];
    const row = cell.parentElement;
    const rowCells = [...row.children].filter(candidate => Object.hasOwn(candidate.dataset, "rovingCell"));
    const column = rowCells.indexOf(cell);
    const rowElements = [...row.parentElement.children];
    const rowIndex = rowElements.indexOf(row);
    const target = key === "ArrowLeft" ? rowCells[column - 1]
      : key === "ArrowRight" ? rowCells[column + 1]
        : key === "ArrowUp" ? [...rowElements[rowIndex - 1]?.children ?? []].filter(candidate => Object.hasOwn(candidate.dataset, "rovingCell"))[column]
          : key === "ArrowDown" ? [...rowElements[rowIndex + 1]?.children ?? []].filter(candidate => Object.hasOwn(candidate.dataset, "rovingCell"))[column]
            : undefined;
    if (cells.includes(target)) {
      // One tab stop per row: clear the stops of the row we land in, not the
      // row we leave, so a vertical move never strips a row of its stop.
      const targetRowCells = [...target.parentElement.children].filter(candidate => Object.hasOwn(candidate.dataset, "rovingCell"));
      for (const candidate of targetRowCells) candidate.tabIndex = -1;
      target.tabIndex = 0;
      target.focus?.();
    }
  }

  function leaveCell(rowId, key) {
    activeForm?.destroy?.();
    activeForm = undefined;
    render();
    const selector = key === "id" ? `[data-record-row="${rowId}"] th[scope="row"]`
      : `[data-record-row="${rowId}"] [data-record-cell="${key}"]`;
    elementHost.querySelector?.(selector)?.focus?.();
  }

  function sortButton(key, text, heading) {
    const button = element(document, "button", text);
    button.type = "button";
    button.addEventListener("click", () => {
      view.sort = view.sort.key === key ? { key, direction: view.sort.direction === "ascending" ? "descending" : "ascending" } : { key, direction: "ascending" };
      render();
    });
    heading.append(button);
  }

  function renderPaste(preview) {
    pasteBox?.remove?.();
    pasteBox = element(document, "section", undefined, "opengdd-author-record-paste-preview");
    pasteBox.dataset.recordPastePreview = "";
    pasteBox.setAttribute("role", "dialog");
    pasteBox.append(element(document, "p", copy.gridPasteHelp));
    if (preview.refused) pasteBox.append(element(document, "p", preview.refused));
    else for (const message of preview.messages) pasteBox.append(element(document, "p", message));
    const add = element(document, "button", copy.addThem);
    add.type = "button";
    add.disabled = true;
    const cancel = element(document, "button", copy.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => { pasteBox.remove(); pasteBox = undefined; });
    pasteBox.append(add, cancel);
    elementHost.append(pasteBox);
    if (preview.refused) return;
    Promise.resolve(rows.previewAdd(preview.records)).then(run => {
      if (run?.refused) pasteBox.insertBefore(element(document, "p", validationRefusal(copy, run.refused.message)), add);
      else add.disabled = false;
    }).catch(error => {
      pasteBox.insertBefore(element(document, "p", validationRefusal(copy, error)), add);
    });
    add.addEventListener("click", async () => {
      add.disabled = true;
      try { await rows.add(preview.records, copy.undo.pasteRecords); pasteBox?.remove?.(); pasteBox = undefined; render(); }
      catch (error) { pasteBox.insertBefore(element(document, "p", validationRefusal(copy, error)), add); }
    });
  }

  function render() {
    if (destroyed) return;
    activeForm?.destroy?.();
    activeForm = undefined;
    const entries = shownRows();
    const all = rows.list();
    const columns = columnsFor(all);
    const idShape = plainObject(schema?.id) ? schema.id : undefined;
    const table = element(document, "table");
    table.dataset.recordTable = "";
    const thead = element(document, "thead");
    const headingRow = element(document, "tr");
    const nameHeading = element(document, "th");
    nameHeading.scope = "col";
    if (view.authoredOrder === true) nameHeading.textContent = idShape ? "id" : "name";
    else {
      nameHeading.setAttribute("aria-sort", view.sort.key === "id" ? view.sort.direction : "none");
      sortButton("id", "name", nameHeading);
    }
    headingRow.append(nameHeading);
    for (const column of columns) {
      const heading = element(document, "th");
      heading.scope = "col";
      if (view.authoredOrder !== true) heading.setAttribute("aria-sort", view.sort.key === column.key ? view.sort.direction : "none");
      if (column.other) heading.textContent = copy.otherFields;
      else if (view.authoredOrder === true) heading.textContent = column.key;
      else sortButton(column.key, column.key, heading);
      headingRow.append(heading);
    }
    const actionsHeading = element(document, "th");
    actionsHeading.scope = "col";
    actionsHeading.append(element(document, "span", "actions", "opengdd-author-visually-hidden"));
    headingRow.append(actionsHeading);
    thead.append(headingRow);
    const tbody = element(document, "tbody");
    for (const row of entries) {
      const tr = element(document, "tr");
      tr.dataset.recordRow = row.id;
      const rowHeading = element(document, "th");
      rowHeading.scope = "row";
      rowHeading.tabIndex = 0;
      rowHeading.dataset.rovingCell = "";
      rowHeading.dataset.recordCell = "id";
      const idDescriptor = idShape ? rows.field?.(row.id, "id", idShape) : undefined;
      const idEditable = idDescriptor && !idDescriptor.inapplicable && rows.binding?.(row.id, "id");
      const select = element(document, "button", row.id, "opengdd-author-identifier");
      select.type = "button";
      select.tabIndex = -1;
      if (idEditable) {
        select.dataset.cellButton = "";
        select.addEventListener("click", () => startEdit(rowHeading, row, { key: "id", shape: idShape }));
      } else select.addEventListener("click", () => onSelectRow?.(row.id));
      rowHeading.append(select);
      rowHeading.addEventListener("keydown", event => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); moveCell(rowHeading, event.key); }
        else if (event.key === "Enter") {
          event.preventDefault();
          if (idEditable) startEdit(rowHeading, row, { key: "id", shape: idShape });
          else onSelectRow?.(row.id);
        }
        else if (event.key === "Escape") { event.preventDefault(); rowHeading.focus?.(); }
      });
      tr.append(rowHeading);
      for (const column of columns) {
        const cell = element(document, "td");
        cell.tabIndex = -1;
        cell.dataset.rovingCell = "";
        cell.dataset.recordCell = column.key;
        if (column.other) {
          const common = new Set(columns.filter(candidate => !candidate.other).map(candidate => candidate.key));
          const others = Object.keys(row.values).filter(key => !key.startsWith("_") && !common.has(key));
          const open = element(document, "button", others.join(", "));
          open.type = "button";
          open.tabIndex = -1;
          open.addEventListener("click", () => onSelectRow?.(row.id));
          cell.append(open);
        } else {
          const value = rows.read(row.id, column.key);
          const descriptor = rows.field?.(row.id, column.key, column.shape);
          const editable = descriptor && !descriptor.inapplicable && rows.binding?.(row.id, column.key);
          if (descriptor?.inapplicable) {
            const unavailable = element(document, "span", descriptor.display);
            unavailable.title = descriptor.reason;
            unavailable.setAttribute("aria-label", descriptor.ariaLabel);
            cell.append(unavailable);
          } else if (!editable && !["grid", "list"].includes(column.shape?.type)) {
            cell.append(element(document, "span", displayValue(value, column.shape, copy)), element(document, "small", copy.readOnlyCell));
          } else {
            const display = element(document, "button", displayValue(value, column.shape, copy));
            display.type = "button";
            display.tabIndex = -1;
            display.dataset.cellButton = "";
            display.addEventListener("click", () => startEdit(cell, row, column));
            cell.append(display);
          }
        }
        cell.addEventListener("keydown", event => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); moveCell(cell, event.key); }
          else if (event.key === "Enter") { event.preventDefault(); startEdit(cell, row, column); }
          else if (event.key === "Escape") { event.preventDefault(); leaveCell(row.id, column.key); }
        });
        tr.append(cell);
      }
      const actions = element(document, "td");
      actions.tabIndex = -1;
      actions.dataset.rovingCell = "";
      actions.dataset.recordCell = "__actions__";
      const rowError = element(document, "p");
      rowError.setAttribute("aria-live", "polite");
      rowError.dataset.rowError = row.id;
      rowError.textContent = rows.errors?.(row.id) ?? "";
      const duplicate = element(document, "button", copy.duplicate);
      duplicate.type = "button";
      duplicate.tabIndex = -1;
      duplicate.addEventListener("click", async () => {
        try {
          const id = nextName(`${row.id}-copy`, new Set(rows.list().map(item => item.id)));
          const values = structuredClone(row.values);
          if (idShape) values.id = id;
      await rows.add([{ id, values }], copy.undo.duplicateRecord);
          rowError.textContent = "";
          render();
        } catch (error) { rowError.textContent = error.message; }
      });
      const rename = typeof rows.rename === "function" ? element(document, "button", copy.rename) : undefined;
      if (rename) {
        rename.type = "button";
        rename.tabIndex = -1;
        rename.addEventListener("click", async () => {
          try { await rows.rename(row.id, rename); rowError.textContent = ""; }
          catch (error) { rowError.textContent = error.message; }
        });
      }
      const remove = element(document, "button", copy.removeRowAction ?? copy.remove);
      remove.type = "button";
      remove.tabIndex = -1;
      remove.addEventListener("click", async () => {
        try { await rows.remove(row.id); rowError.textContent = ""; render(); }
        catch (error) { rowError.textContent = error.message; }
      });
      const authoredIndex = rows.list().findIndex(item => item.id === row.id);
      const moveUp = typeof rows.move === "function" ? element(document, "button", copy.moveUp) : undefined;
      const moveDown = typeof rows.move === "function" ? element(document, "button", copy.moveDown) : undefined;
      if (moveUp) {
        moveUp.type = "button";
        moveUp.tabIndex = -1;
        moveUp.disabled = authoredIndex <= 0;
        moveUp.addEventListener("click", async () => {
          try { await rows.move(row.id, "up"); rowError.textContent = ""; render(); }
          catch (error) { rowError.textContent = error.message; }
        });
      }
      if (moveDown) {
        moveDown.type = "button";
        moveDown.tabIndex = -1;
        moveDown.disabled = authoredIndex < 0 || authoredIndex >= rows.list().length - 1;
        moveDown.addEventListener("click", async () => {
          try { await rows.move(row.id, "down"); rowError.textContent = ""; render(); }
          catch (error) { rowError.textContent = error.message; }
        });
      }
      actions.addEventListener("keydown", event => {
        // Inside the cell, Enter reaches the buttons; Left/Right move between
        // Duplicate, Rename, and Remove; Escape returns to the cell. Outside them the
        // arrows move between cells as everywhere else.
        const actionButtons = [duplicate, rename, moveUp, moveDown, remove].filter(Boolean);
        const onButton = actionButtons.includes(event.target);
        if (onButton && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
          event.preventDefault();
          const at = actionButtons.indexOf(event.target);
          actionButtons[(at + (event.key === "ArrowRight" ? 1 : actionButtons.length - 1)) % actionButtons.length].focus?.();
        } else if (onButton && event.key === "Escape") {
          event.preventDefault();
          actions.focus?.();
        } else if (onButton) {
          return;
        } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); moveCell(actions, event.key); }
        else if (event.key === "Enter") { event.preventDefault(); duplicate.focus?.(); }
      });
      actions.append(duplicate, ...(rename ? [rename] : []), ...(moveUp ? [moveUp, moveDown] : []), remove, rowError);
      tr.append(actions);
      tbody.append(tr);
    }
    if (!entries.length) {
      const tr = element(document, "tr");
      const cell = element(document, "td");
      cell.colSpan = columns.length + 2;
      cell.append(element(document, "p", copy.empty));
      const addFirst = element(document, "button", copy.addFirst); addFirst.type = "button";
      const addError = element(document, "p"); addError.setAttribute("aria-live", "polite");
      addFirst.addEventListener("click", async () => {
        addFirst.disabled = true;
        try { await rows.add(); render(); }
        catch (error) { addError.textContent = validationRefusal(copy, error); }
        finally { if (addFirst.isConnected) addFirst.disabled = false; }
      });
      cell.append(addFirst, addError); tr.append(cell); tbody.append(tr);
    }
    table.append(thead, tbody);
    table.addEventListener("paste", event => {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      event.preventDefault();
      renderPaste(parseSpreadsheet(text, { schema, existing: rows.list().map(row => row.id), copy }));
    });
    elementHost.replaceChildren(table);
  }

  render();
  return Object.freeze({
    setFind(value) { view.find = String(value ?? ""); render(); },
    setSchema(value) { schema = value; render(); },
    previewPaste(text) {
      const preview = parseSpreadsheet(text, { schema, existing: rows.list().map(row => row.id), copy });
      renderPaste(preview);
      return preview;
    },
    refresh: render,
    destroy() { destroyed = true; activeForm?.destroy?.(); elementHost.replaceChildren(); }
  });
}
