import {
  collectionRowWhenSatisfied, collectionRowWhenValid, inferCollectionField
} from "../../src/creation.mjs";
import { recordIds } from "../../src/collection-fields.mjs";
import { setJsonValue } from "../../src/edits-json.mjs";
import { RECORD_FORM_COPY } from "../../src/copy/record-form-copy.mjs";
import { COLLECTION_COPY } from "../../src/copy/collection-copy.mjs";
import { WIDGET_COPY } from "../../src/copy/widget-copy.mjs";
import { element } from "../../src/dom.mjs";
import { packageFiles, parseJson, plainObject, pointer } from "../../src/json-path.mjs";
import { openRenameDialog } from "../../src/rename-dialog.mjs";

const RECORD_PATH = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

function gridDimensions(value) {
  if (!Array.isArray(value) || !value.length || value.some(row => typeof row !== "string")) return undefined;
  return { rows: value.length, columns: [...value[0]].length };
}

function gridError(value, otherGrid) {
  if (!Array.isArray(value) || !value.length) return RECORD_FORM_COPY.gridEmpty;
  if (value.some(row => typeof row !== "string")) return RECORD_FORM_COPY.gridEmpty;
  const columns = [...value[0]].length;
  if (!columns) return RECORD_FORM_COPY.gridRagged(1, 0, columns);
  const ragged = value.findIndex(row => [...row].length !== columns);
  if (ragged >= 0) return RECORD_FORM_COPY.gridRagged(ragged + 1, [...value[ragged]].length, columns);
  const other = gridDimensions(otherGrid);
  if (other && (other.rows !== value.length || other.columns !== columns)) {
    return RECORD_FORM_COPY.gridMismatch(other.rows, other.columns);
  }
  return "";
}

function duplicateLine(text, record) {
  const first = Object.keys(record)[0];
  if (!first) return undefined;
  try { setJsonValue(text, pointer(first), record[first]); }
  catch (error) {
    const match = /duplicated on line (\d+)/.exec(error.message);
    return match ? Number(match[1]) : undefined;
  }
  return undefined;
}

export function conditionalRemovals(schema, record, changedKey, value, remove = false) {
  const next = { ...record };
  if (remove) delete next[changedKey];
  else next[changedKey] = value;
  return Object.entries(schema).flatMap(([key, shape]) => {
    if (key === changedKey || !plainObject(shape) || !collectionRowWhenValid(shape.when)
      || !plainObject(shape.when?.row) || !Object.hasOwn(shape.when.row, changedKey)
      || !Object.hasOwn(record, key) || collectionRowWhenSatisfied(shape.when, next)) return [];
    return [key];
  });
}

export function fieldDescriptor(context, files, collection, recordName, recordFile, record, schema, key, shape, depth = 0) {
  const common = {
    key,
    label: key,
    help: shape.description ?? null,
    helpOptional: shape.description === undefined,
    required: shape.required === true,
    clearRemoves: shape.required !== true,
    requiredLabel: RECORD_FORM_COPY.required,
    requiredError: RECORD_FORM_COPY.requiredError,
    seed: !(Object.hasOwn(shape, "pattern") || shape.unique === true || shape.type === "grid"),
    binding: depth ? undefined : { file: recordFile, pointer: pointer(key) },
    labels: {
      change: shape.type === "link" ? RECORD_FORM_COPY.undo.changeLink : RECORD_FORM_COPY.undo.changeField,
      addLine: RECORD_FORM_COPY.undo.addLine,
      removeLine: RECORD_FORM_COPY.undo.removeLine
    },
    stageChange: depth ? undefined : ({ transaction, value, remove }) => {
      const removedConditionals = conditionalRemovals(schema, record, key, value, remove);
      for (const removed of removedConditionals) transaction.json(recordFile).remove(pointer(removed));
      return { removedConditionals };
    }
  };
  if (shape.type === "string") {
    const patternHelp = shape.pattern ? RECORD_FORM_COPY.kebabHelp : "";
    return {
      ...common,
      type: Array.isArray(shape.options) ? "enum" : "text",
      options: shape.options,
      monospace: Boolean(shape.pattern),
      help: [shape.description, patternHelp].filter(Boolean).join(" · ") || null,
      helpOptional: !shape.description && !patternHelp
    };
  }
  if (shape.type === "integer" || shape.type === "number") return { ...common, type: shape.type };
  if (shape.type === "grid") {
    const otherGrid = Object.entries(schema).find(([otherKey, otherShape]) => otherKey !== key && otherShape?.type === "grid" && Array.isArray(record[otherKey]))?.[0];
    return {
      ...common,
      type: "longtext",
      requiredError: RECORD_FORM_COPY.gridEmpty,
      monospace: true,
      format: value => Array.isArray(value) ? value.join("\n") : "",
      parse: value => value === "" ? [] : value.split(/\r?\n/),
      validate: value => gridError(value, otherGrid ? record[otherGrid] : undefined),
      status: value => {
        const size = gridDimensions(value);
        return size ? RECORD_FORM_COPY.gridSize(size.rows, size.columns) : "";
      }
    };
  }
  if (shape.type === "link") {
    const targetSchema = parseJson(files.get(`collections/${shape.to}/_collection.json`))?.record;
    const inverseMirror = !shape.mirrored_by && plainObject(targetSchema)
      ? Object.entries(targetSchema).find(([, candidate]) => plainObject(candidate) && candidate.type === "link"
        && candidate.to === collection && candidate.mirrored_by === key)
      : undefined;
    const mirrorField = shape.mirrored_by ?? inverseMirror?.[0];
    const mirrorShape = mirrorField && plainObject(targetSchema) ? targetSchema[mirrorField] : undefined;
    const ids = recordIds(files, shape.to).filter(id => !(shape.loops === false && shape.to === collection && id === recordName));
    return {
      ...common,
      type: "link",
      note: shape.mirrored_by ? RECORD_FORM_COPY.mirroredBy(shape.mirrored_by, shape.to) : "",
      copy: RECORD_FORM_COPY,
      options: {
        to: shape.to,
        many: shape.many === true,
        ids,
        onCreate: anchor => context.internal.openCollectionRecord({
          anchor, collection: shape.to, selectCreated: false
        }),
        mirror: mirrorField ? {
          file: id => `collections/${shape.to}/${id}.json`,
          pointer: pointer(mirrorField),
          many: mirrorShape?.many === true,
          ownId: recordName
        } : undefined
      }
    };
  }
  if (shape.type === "list") {
    const fields = plainObject(shape.of) ? Object.entries(shape.of).map(([nestedKey, nestedShape]) =>
      fieldDescriptor(context, files, collection, recordName, recordFile, record, shape.of, nestedKey, nestedShape, depth + 1)) : [];
    return { ...common, type: "lines", copy: RECORD_FORM_COPY, options: { fields } };
  }
  return { ...common, type: "text" };
}

function freeKind(value) {
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "yes/no";
  if (Array.isArray(value) && value.every(item => typeof item === "string")) return "list";
  if (typeof value === "string") return "text";
  return "other";
}

function freeValueDescriptor(file, key, value, kind) {
  const base = {
    key: `value-${key}`,
    label: RECORD_FORM_COPY.value,
    help: ["yes/no", "list", "other"].includes(kind) ? RECORD_FORM_COPY.cannotCheck : RECORD_FORM_COPY.valueHelp,
    binding: { file, pointer: pointer(key) },
    labels: { change: RECORD_FORM_COPY.undo.changeField }
  };
  if (kind === "number") return { ...base, type: "number" };
  if (kind === "yes/no") return { ...base, type: "boolean" };
  if (kind === "list") return { ...base, type: "list" };
  if (kind === "other") return {
    ...base,
    type: "longtext",
    monospace: true,
    commitOnBlur: true,
    format: current => JSON.stringify(current, null, 2),
    parse: source => JSON.parse(source)
  };
  return { ...base, type: "text" };
}

export default {
  api: 1,
  id: "opengdd.record-form",
  title: "Record",
  surfaces: ["inspector"],
  inspects: { kinds: ["collection-record"] },
  needs: ["selection", "edits", "references", "forms"],
  compact: {
    strategy: "reflow",
    note: "Fields reflow into one column in the inspector drawer."
  },
  empty: { title: "Choose a collection record" },
  create(context) {
    const document = context.document;
    const body = element(document, "div", undefined, "opengdd-author-record-form");
    body.dataset.recordForm = "";
    context.element.append(body);
    let activeForms = [];
    let generation = 0;
    let selectedFile = "";
    let selectedLabel = "";
    const conditionalNotices = new Set();

    const selectFile = (kind, name, file) => context.services.selection.select({ kind, name, file });

    async function commit(transaction) {
      await transaction.commit();
      render();
    }

    function actionButton(text, run, className) {
      const button = element(document, "button", text, className);
      button.type = "button";
      button.addEventListener("click", () => Promise.resolve(run(button)).catch(error => {
        button.disabled = true;
        button.title = error.message;
      }));
      return button;
    }

    function breadcrumb(collection, recordName, file) {
      const row = element(document, "div", undefined, "opengdd-author-record-breadcrumb");
      const collectionButton = actionButton(collection, () => selectFile("collection", collection, `collections/${collection}`));
      const slash = element(document, "span", " / ");
      const name = element(document, "code", recordName);
      const duplicate = actionButton(RECORD_FORM_COPY.duplicate, anchor => context.internal.openCollectionRecord({
        anchor,
        collection,
        prefill: `${recordName}-copy`,
        sourceFile: file,
        undo: RECORD_FORM_COPY.undo.duplicateRecord
      }));
      const rename = actionButton(COLLECTION_COPY.rename, anchor => openRenameDialog({
        document,
        anchor,
        references: context.services.references,
        name: `collections.${collection}.${recordName}`,
        initial: recordName,
        onApplied: next => selectFile("collection-record", next, `collections/${collection}/${next}.json`)
      }));
      rename.dataset.recordRename = "";
      const edit = actionButton(RECORD_FORM_COPY.editAsText, () => selectFile("file", recordName, file));
      row.append(collectionButton, slash, name, duplicate, rename, edit);
      return row;
    }

    function addFieldButton(file, record) {
      const button = actionButton(RECORD_FORM_COPY.addField, async () => {
        let key = "new-field";
        for (let suffix = 2; Object.hasOwn(record, key); suffix += 1) key = `new-field-${suffix}`;
        const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.addField);
        tx.json(file).insert("", key, "");
        await commit(tx);
      });
      button.dataset.recordAddField = "";
      return button;
    }

    function previousNames(files, collection, recordName) {
      const records = recordIds(files, collection);
      const at = records.indexOf(recordName);
      if (at <= 0) return [];
      const previous = parseJson(files.get(`collections/${collection}/${records[at - 1]}.json`));
      return plainObject(previous) ? Object.keys(previous).filter(key => !key.startsWith("_")) : [];
    }

    function renderNotChecked(record) {
      const keys = Object.keys(record).filter(key => key.startsWith("_"));
      if (!keys.length) return;
      const section = element(document, "section", undefined, "opengdd-author-record-not-checked");
      section.append(element(document, "h3", RECORD_FORM_COPY.notChecked), element(document, "p", RECORD_FORM_COPY.notCheckedHelp, "opengdd-author-form-help"));
      const list = element(document, "ul");
      for (const key of keys) {
        const item = element(document, "li");
        const name = element(document, "code", key);
        const value = element(document, "code", JSON.stringify(record[key]));
        item.append(name, " · ", value);
        list.append(item);
      }
      section.append(list);
      body.append(section);
    }

    function renderFreeForm(files, collection, recordName, file, record) {
      const keys = Object.keys(record).filter(key => !key.startsWith("_"));
      if (!keys.length) {
        body.append(element(document, "p", RECORD_FORM_COPY.empty), addFieldButton(file, record));
        renderNotChecked(record);
        return;
      }
      const suggestions = previousNames(files, collection, recordName);
      const datalistId = `opengdd-record-fields-${collection}-${recordName}`;
      const datalist = element(document, "datalist");
      datalist.id = datalistId;
      for (const suggestion of suggestions) {
        const option = element(document, "option");
        option.value = suggestion;
        datalist.append(option);
      }
      body.append(datalist);
      for (const key of keys) {
        const value = record[key];
        const kind = freeKind(value);
        const row = element(document, "section", undefined, "opengdd-author-record-free-row");
        row.dataset.recordField = key;
        const nameLabel = element(document, "label", RECORD_FORM_COPY.fieldName);
        const name = element(document, "input");
        name.value = key;
        name.placeholder = RECORD_FORM_COPY.fieldPlaceholder;
        name.setAttribute("list", datalistId);
        nameLabel.append(name);
        name.addEventListener("blur", async () => {
          const next = name.value.trim();
          if (!next || next === key || Object.hasOwn(record, next)) { name.value = key; return; }
          const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.changeField);
          tx.json(file).renameKey(pointer(key), next);
          await commit(tx);
        });
        const kindLabel = element(document, "label", RECORD_FORM_COPY.kind);
        const kindSelect = element(document, "select");
        for (const choice of RECORD_FORM_COPY.kinds) {
          const option = element(document, "option", choice);
          option.value = choice;
          kindSelect.append(option);
        }
        kindSelect.value = kind;
        kindSelect.addEventListener("change", async () => {
          const nextKind = kindSelect.value;
          const nextValue = nextKind === "number" ? (Number.isFinite(Number(value)) ? Number(value) : 0)
            : nextKind === "yes/no" ? Boolean(value)
              : nextKind === "list" ? (Array.isArray(value) && value.every(item => typeof item === "string") ? value : [])
                : nextKind === "other" ? value
                  : typeof value === "string" ? value : JSON.stringify(value);
          const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.changeField);
          tx.json(file).set(pointer(key), nextValue);
          await commit(tx);
        });
        kindLabel.append(kindSelect);
        const valueHost = element(document, "div", undefined, "opengdd-author-record-free-value");
        activeForms.push(context.services.forms.create(valueHost, { fields: [freeValueDescriptor(file, key, value, kind)] }));
        const remove = actionButton(RECORD_FORM_COPY.remove, async () => {
          const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.removeField);
          tx.json(file).remove(pointer(key));
          await commit(tx);
        });
        row.append(nameLabel, kindLabel, valueHost, remove);
        const inferred = inferCollectionField(files, collection, key);
        if (inferred?.type === "link") {
          row.append(element(document, "p", WIDGET_COPY.linkOffer(key, inferred.to), "opengdd-author-form-note"),
            actionButton(RECORD_FORM_COPY.describeFields, () => selectFile("collection", collection, `collections/${collection}`)));
        }
        body.append(row);
      }
      body.append(addFieldButton(file, record));
      renderNotChecked(record);
    }

    function renderUnknownFields(files, collection, file, record, schema, labelFile) {
      const keys = Object.keys(record).filter(key => !key.startsWith("_") && !Object.hasOwn(schema, key));
      if (!keys.length) return;
      const section = element(document, "section", undefined, "opengdd-author-record-unknown");
      section.append(element(document, "h3", RECORD_FORM_COPY.notDescribed), element(document, "p", RECORD_FORM_COPY.notDescribedHelp));
      for (const key of keys) {
        const row = element(document, "div", undefined, "opengdd-author-record-unknown-row");
        row.append(element(document, "code", key));
        const definition = inferCollectionField(files, collection, key);
        if (definition) {
          const add = actionButton(RECORD_FORM_COPY.addToFields, async () => {
            const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.changeFields);
            tx.json(labelFile).insert("/record", key, { ...definition, required: false });
            try { await context.internal.validatePackage(tx); }
            catch (error) { tx.abort(); throw error; }
            await commit(tx);
          });
          add.dataset.recordDescribeField = key;
          add.disabled = true;
          add.title = RECORD_FORM_COPY.checkingField;
          row.append(add);
          const checkGeneration = generation;
          const preview = context.services.edits.begin(RECORD_FORM_COPY.undo.changeFields);
          preview.json(labelFile).insert("/record", key, { ...definition, required: false });
          Promise.resolve(context.internal.validatePackage(preview)).then(() => {
            preview.abort();
            if (checkGeneration !== generation || !add.isConnected) return;
            add.disabled = false;
            add.title = "";
          }).catch(error => {
            preview.abort();
            if (checkGeneration === generation) add.title = error.message;
          });
        } else row.append(element(document, "span", RECORD_FORM_COPY.holdsNoKind, "opengdd-author-form-error"));
        row.append(
          actionButton(RECORD_FORM_COPY.openFields, () => selectFile("file", "_collection", labelFile)),
          actionButton(RECORD_FORM_COPY.remove, async () => {
            const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.removeField);
            tx.json(file).remove(pointer(key));
            await commit(tx);
          })
        );
        section.append(row);
      }
      body.append(section);
    }

    function renderDescribed(files, collection, recordName, file, record, schema, labelFile) {
      const fields = [];
      const conditionControllers = new Set(Object.values(schema).flatMap(shape =>
        plainObject(shape?.when?.row) ? Object.keys(shape.when.row) : []));
      for (const [key, shape] of Object.entries(schema)) {
        if (!plainObject(shape)) continue;
        if (Object.hasOwn(shape, "when") && collectionRowWhenValid(shape.when)
          && !collectionRowWhenSatisfied(shape.when, record)) {
          if (Object.hasOwn(record, key) || conditionalNotices.has(key)) {
            const conditionField = Object.keys(shape.when?.row ?? {})[0] ?? "field";
            const values = shape.when?.row?.[conditionField] ?? [];
            const present = Object.hasOwn(record, key);
            const conditional = {
              ...fieldDescriptor(context, files, collection, recordName, file, record, schema, key, shape),
              disabled: true,
              help: conditionalNotices.has(key)
                ? RECORD_FORM_COPY.doesNotApplyRemoved(conditionField, values.join(", "))
                : RECORD_FORM_COPY.doesNotApply(conditionField, values.join(", ")),
              helpOptional: false
            };
            if (present) conditional.action = {
              label: RECORD_FORM_COPY.remove,
              run: async () => {
                const tx = context.services.edits.begin(RECORD_FORM_COPY.undo.changeField);
                tx.json(file).remove(pointer(key));
                conditionalNotices.delete(key);
                await commit(tx);
              }
            };
            fields.push(conditional);
          }
          continue;
        }
        conditionalNotices.delete(key);
        fields.push(fieldDescriptor(context, files, collection, recordName, file, record, schema, key, shape));
      }
      const host = element(document, "div");
      body.append(host);
      activeForms.push(context.services.forms.create(host, {
        fields,
        onChange: ({ field, staged }) => {
          for (const key of staged?.removedConditionals ?? []) conditionalNotices.add(key);
          if (conditionControllers.has(field.key) || staged?.removedConditionals?.length) render();
        },
        labels: {
          change: RECORD_FORM_COPY.undo.changeField,
          addLine: RECORD_FORM_COPY.undo.addLine,
          removeLine: RECORD_FORM_COPY.undo.removeLine
        }
      }));
      renderUnknownFields(files, collection, file, record, schema, labelFile);
      renderNotChecked(record);
    }

    function render() {
      generation += 1;
      activeForms.forEach(form => form.destroy());
      activeForms = [];
      body.replaceChildren();
      const selection = context.services.selection.current();
      const match = selection?.kind === "collection-record" ? RECORD_PATH.exec(selection.file ?? "") : undefined;
      context.surface.empty(!match);
      if (!match) { selectedFile = ""; selectedLabel = ""; conditionalNotices.clear(); return; }
      const [, collection, recordName] = match;
      const file = selection.file;
      const labelFile = `collections/${collection}/_collection.json`;
      if (selectedFile !== file) conditionalNotices.clear();
      selectedFile = file;
      selectedLabel = labelFile;
      body.append(breadcrumb(collection, recordName, file));
      const files = packageFiles(context);
      const text = files.get(file);
      const record = parseJson(text);
      if (!plainObject(record)) {
        body.append(element(document, "p", RECORD_FORM_COPY.unreadable(recordName), "opengdd-author-form-error"),
          actionButton(RECORD_FORM_COPY.editAsText, () => selectFile("file", recordName, file)));
        return;
      }
      const repeated = duplicateLine(text, record);
      if (repeated) {
        body.append(element(document, "p", RECORD_FORM_COPY.cannotPatch(recordName, repeated), "opengdd-author-form-error"),
          actionButton(RECORD_FORM_COPY.editAsText, () => selectFile("file", recordName, file)));
        return;
      }
      const label = parseJson(files.get(labelFile));
      if (plainObject(label?.record)) renderDescribed(files, collection, recordName, file, record, label.record, labelFile);
      else renderFreeForm(files, collection, recordName, file, record);
    }

    context.services.selection.subscribe(render);
    context.package.subscribe(event => {
      if (event.type === "opened" || event.paths?.includes(selectedLabel)) render();
      else if (event.paths?.includes(selectedFile)) {
        const move = event.moves?.find(item => selectedFile === item.from || selectedFile.startsWith(`${item.from}/`));
        const movedFile = move ? `${move.to}${selectedFile.slice(move.from.length)}` : "";
        const movedRecord = RECORD_PATH.exec(movedFile);
        if (movedRecord) {
          // Move selection with the edit event, before a bound form can refresh
          // against the old path that the transaction has already removed.
          selectFile("collection-record", movedRecord[2], movedFile);
          render();
        } else if (typeof context.package.read(selectedFile) !== "string") render();
        else activeForms.forEach(form => form.refresh());
      }
    });
    render();
    return { destroy() { generation += 1; activeForms.forEach(form => form.destroy()); activeForms = []; } };
  }
};
