import { inferCollectionRecord } from "../../src/creation.mjs";
import {
  collectionNames, mirroredDependants, parseCollectionJson, recordFiles, schemaShapeError,
  stageDescribeFields, stageRemoveField
} from "../../src/collection-fields.mjs";
import { COLLECTION_COPY } from "../../src/copy/collection-copy.mjs";
import { anchoredConfirmation, element, renderBackticks } from "../../src/dom.mjs";
import { packageFiles, plainObject, pointer } from "../../src/json-path.mjs";
import { createFolderRows, createRecordTable } from "../../src/record-table.mjs";
import { collectionFieldReference } from "../../src/references.mjs";
import { openRenameDialog } from "../../src/rename-dialog.mjs";
import { fieldDescriptor } from "../opengdd.record-form/panel.mjs";

const COLLECTION_PATH = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

function kindLabel(shape) {
  if (!shape) return "text";
  if (shape.type === "link") return `link to \`${shape.to}\` (${shape.many === true ? "many" : "one"})`;
  if (shape.type === "list") return `lines, each with ${Object.keys(shape.of ?? {}).join(", ") || "no fields yet"}`;
  return COLLECTION_COPY.kinds[shape.type]?.label ?? shape.type;
}

function normalizeShapeForType(shape, type, collections) {
  const common = {};
  if (shape.required === true) common.required = true;
  if (shape.unique === true) common.unique = true;
  if (shape.description) common.description = shape.description;
  if (shape.when) { delete common.required; common.when = shape.when; }
  if (type === "link") return { type, to: shape.type === "link" && collections.includes(shape.to) ? shape.to : collections[0], ...common };
  if (type === "list") return { type, of: shape.type === "list" && plainObject(shape.of) ? shape.of : {}, ...common };
  if (type === "string") return {
    type, ...common,
    ...(shape.type === "string" && Array.isArray(shape.options) ? { options: shape.options } : {}),
    ...(shape.type === "string" && shape.pattern === "kebab-case" ? { pattern: "kebab-case" } : {})
  };
  return { type, ...common };
}

export default {
  api: 1,
  id: "opengdd.collection",
  title: "Collection",
  surfaces: ["inspector"],
  inspects: { kinds: ["collection"] },
  needs: ["selection", "edits", "references", "forms"],
  compact: { strategy: "reflow", note: "The fields and records reflow in the inspector drawer." },
  empty: { title: "Choose a collection" },
  create(context) {
    const document = context.document;
    const body = element(document, "div", undefined, "opengdd-author-collection");
    context.element.append(body);
    let activeTable;
    let activeCollection = "";
    let panelError;
    let headerCount;
    let fieldsHost;
    const views = new Map();

    const actionButton = (text, run, data, errorTarget) => {
      const button = element(document, "button", text);
      button.type = "button";
      if (data) button.dataset[data] = "";
      button.addEventListener("click", () => Promise.resolve(run(button)).catch(error => {
        const target = errorTarget ?? panelError;
        if (target) target.textContent = error.message;
      }));
      return button;
    };

    async function validatedCommit(transaction) {
      try { await context.internal.validatePackage(transaction); }
      catch (error) { transaction.abort(); throw error; }
      await transaction.commit();
    }

    async function confirmRemove(anchor, detail) {
      return anchoredConfirmation({ document, anchor, question: detail.question, actions: [
        { label: COLLECTION_COPY.remove, value: true }, { label: COLLECTION_COPY.cancel, value: false }
      ], datasetKey: "collectionConfirmation" });
    }

    function descriptorFor(collection, id, key, shape) {
      const files = packageFiles(context);
      const recordFile = `collections/${collection}/${id}.json`;
      const record = parseCollectionJson(files.get(recordFile)) ?? {};
      const schema = parseCollectionJson(files.get(`collections/${collection}/_collection.json`))?.record ?? {};
      const descriptor = fieldDescriptor(context, files, collection, id, recordFile, record, schema, key, shape);
      descriptor.validateTransaction = true;
      return descriptor;
    }

    function stagedDescription(files, collection, record, label = COLLECTION_COPY.undo.describeFields) {
      const transaction = context.internal.begin(label);
      stageDescribeFields(transaction, files, collection, record);
      return transaction;
    }

    function failingRecords(run, collection) {
      const prefix = `collections/${collection}/`;
      return new Set((run?.findings ?? []).flatMap(finding => finding.severity === "error" && finding.file?.startsWith(prefix)
        && finding.file !== `${prefix}_collection.json` ? [finding.file] : [])).size;
    }

    function describeDialog(anchor, collection) {
      const files = packageFiles(context);
      const inferred = inferCollectionRecord(files, collection);
      const box = element(document, "section", undefined, "opengdd-author-fields-dialog");
      box.setAttribute("role", "dialog");
      box.append(element(document, "h4", COLLECTION_COPY.describeFields), element(document, "p", COLLECTION_COPY.describeIntro));
      anchor.after(box);
      if (inferred.refusalField) {
        const sentence = element(document, "p");
        sentence.append(renderBackticks(document.createDocumentFragment(), COLLECTION_COPY.describeBlocked(inferred.refusalField)));
        const rename = actionButton(COLLECTION_COPY.renameBlocked(inferred.refusalField), anchor => openRenameDialog({
          document,
          anchor,
          references: context.services.references,
          name: collectionFieldReference(collection, inferred.refusalField),
          initial: `_${inferred.refusalField}`,
          onApplied: () => refreshPackage()
        }), "renameRefusalField");
        box.append(sentence, rename, actionButton(COLLECTION_COPY.cancel, () => box.remove()));
        return;
      }
      const draft = structuredClone(inferred.record ?? {});
      const table = element(document, "table");
      const head = element(document, "thead");
      const headRow = element(document, "tr");
      for (const name of ["name", "kind", COLLECTION_COPY.columns.required, COLLECTION_COPY.columns.sentence]) {
        const heading = element(document, "th", name); heading.scope = "col"; headRow.append(heading);
      }
      head.append(headRow);
      const tbody = element(document, "tbody");
      for (const [field, initial] of Object.entries(draft)) {
        const row = element(document, "tr");
        row.dataset.describeField = field;
        const name = element(document, "th", field); name.scope = "row";
        const kindCell = element(document, "td");
        const kind = element(document, "select");
        for (const [type, definition] of Object.entries(COLLECTION_COPY.kinds)) {
          const option = element(document, "option", definition.label); option.value = type; kind.append(option);
        }
        kind.value = initial.type;
        const kindHelp = element(document, "p", kindLabel(initial));
        kind.addEventListener("change", () => { draft[field] = normalizeShapeForType(draft[field], kind.value, collectionNames(files)); kindHelp.textContent = kindLabel(draft[field]); validateDraft(); });
        kindCell.append(kind, kindHelp);
        const requiredCell = element(document, "td");
        const required = element(document, "input"); required.type = "checkbox"; required.checked = initial.required === true; required.setAttribute("aria-label", `${field} ${COLLECTION_COPY.columns.required}`);
        required.addEventListener("change", () => { if (required.checked) draft[field].required = true; else delete draft[field].required; validateDraft(); });
        requiredCell.append(required);
        const sentenceCell = element(document, "td");
        const sentence = element(document, "input"); sentence.type = "text"; sentence.value = initial.description ?? ""; sentence.placeholder = COLLECTION_COPY.noSentence;
        sentence.addEventListener("input", () => { if (sentence.value) draft[field].description = sentence.value; else delete draft[field].description; validateDraft(); });
        sentenceCell.append(sentence);
        row.append(name, kindCell, requiredCell, sentenceCell);
        tbody.append(row);
      }
      table.append(head, tbody);
      const status = element(document, "p", COLLECTION_COPY.matchCount(0, recordFiles(files, collection).length));
      status.dataset.describeMatchCount = "";
      status.setAttribute("aria-live", "polite");
      const reason = element(document, "p");
      const describe = actionButton(COLLECTION_COPY.describeThem, async () => {
        describe.disabled = true;
        const transaction = stagedDescription(packageFiles(context), collection, draft);
        await validatedCommit(transaction);
        box.remove();
        refreshPackage();
      }, "describeThem");
      describe.disabled = true;
      const cancel = actionButton(COLLECTION_COPY.cancel, () => box.remove());
      box.append(table, status, reason, describe, cancel);
      let validationGeneration = 0;
      async function validateDraft() {
        const runId = ++validationGeneration;
        describe.disabled = true;
        reason.textContent = "";
        const transaction = stagedDescription(packageFiles(context), collection, draft);
        try {
          const run = await context.internal.validatePackage(transaction);
          transaction.abort();
          if (runId !== validationGeneration) return;
          const total = recordFiles(packageFiles(context), collection).length;
          status.textContent = COLLECTION_COPY.matchCount(total - failingRecords(run, collection), total);
          describe.disabled = false;
        } catch (error) {
          transaction.abort();
          if (runId !== validationGeneration) return;
          reason.textContent = error.message;
          const total = recordFiles(packageFiles(context), collection).length;
          status.textContent = COLLECTION_COPY.matchCount(0, total);
        }
      }
      validateDraft();
    }

    async function writeShape(collection, field, shape, error, parentPath = [], reset) {
      const files = packageFiles(context);
      const preliminary = schemaShapeError(shape, collectionNames(files));
      if (preliminary) { error.textContent = preliminary; reset?.(); return false; }
      const path = `collections/${collection}/_collection.json`;
      const shapePointer = ["record", ...parentPath.flatMap(key => [key, "of"]), field];
      const transaction = context.internal.begin(COLLECTION_COPY.undo.changeFields);
      transaction.json(path).set(pointer(shapePointer), shape);
      try { await validatedCommit(transaction); error.textContent = ""; refreshPackage(); return true; }
      catch (failure) { error.textContent = failure.message; reset?.(); return false; }
    }

    function choicesEditor(anchor, collection, field, shape, error, parentPath) {
      const box = element(document, "section"); box.setAttribute("role", "dialog"); box.dataset.choicesEditor = "";
      const textarea = element(document, "textarea"); textarea.value = (shape.options ?? []).join("\n"); textarea.setAttribute("aria-label", COLLECTION_COPY.columns.choices);
      box.append(textarea, element(document, "p", COLLECTION_COPY.choicesHelp));
      box.append(actionButton("Save", async () => {
        const values = textarea.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
        const next = { ...shape }; if (values.length) next.options = values; else delete next.options;
        if (await writeShape(collection, field, next, error, parentPath,
          () => { textarea.value = (shape.options ?? []).join("\n"); })) box.remove();
      }), actionButton(COLLECTION_COPY.cancel, () => box.remove()));
      anchor.after(box);
    }

    function whenEditor(anchor, collection, field, shape, level, error, parentPath) {
      const box = element(document, "section"); box.setAttribute("role", "dialog"); box.dataset.whenEditor = "";
      const select = element(document, "select");
      for (const candidate of Object.keys(level).filter(name => name !== field)) { const option = element(document, "option", candidate); option.value = candidate; select.append(option); }
      const current = Object.entries(shape.when?.row ?? {})[0]; if (current) select.value = current[0];
      const values = element(document, "input"); values.type = "text"; values.value = current?.[1]?.join(", ") ?? ""; values.placeholder = "value, another-value";
      const fieldLabel = element(document, "label", "field"); fieldLabel.append(select);
      const valuesLabel = element(document, "label", "values"); valuesLabel.append(values);
      box.append(fieldLabel, valuesLabel, actionButton("Save", async () => {
        const choices = values.value.split(",").map(value => value.trim()).filter(Boolean);
        const next = { ...shape }; delete next.required;
        if (select.value && choices.length) next.when = { row: { [select.value]: choices } }; else delete next.when;
        if (await writeShape(collection, field, next, error, parentPath, () => {
          select.value = current?.[0] ?? ""; values.value = current?.[1]?.join(", ") ?? "";
        })) box.remove();
      }), actionButton(COLLECTION_COPY.cancel, () => box.remove()));
      anchor.after(box);
    }

    function fieldPopover(anchor, data) {
      const previous = anchor.parentElement?.querySelector?.("[data-field-popover]");
      previous?.remove?.();
      const box = element(document, "section", undefined, "opengdd-author-field-popover");
      box.setAttribute("role", "dialog");
      box.dataset.fieldPopover = data;
      anchor.after(box);
      return box;
    }

    function linkSummary(shape) {
      return `${COLLECTION_COPY.pointsTo} \`${shape.to}\` · ${shape.many === true ? COLLECTION_COPY.many : COLLECTION_COPY.one}`
        + `${shape.loops === false ? ` · ${COLLECTION_COPY.noLoops}` : ""}`
        // A field with no mirror says nothing about mirrors.
        + `${shape.mirrored_by ? ` · ${COLLECTION_COPY.mirroredBy} \`${shape.mirrored_by}\`` : ""}`;
    }

    function linkEditor(anchor, collection, field, shape, error, parentPath) {
      const box = fieldPopover(anchor, "link");
      const files = packageFiles(context);
      const names = collectionNames(files);
      const target = element(document, "select"); target.setAttribute("aria-label", COLLECTION_COPY.pointsTo);
      for (const name of names) { const option = element(document, "option", name); option.value = name; target.append(option); }
      target.value = shape.to;
      target.addEventListener("change", async () => {
        const next = { ...shape, to: target.value }; delete next.mirrored_by; if (target.value !== collection) delete next.loops;
        await writeShape(collection, field, next, error, parentPath, () => { target.value = shape.to; });
      });
      const cardinality = element(document, "select"); cardinality.setAttribute("aria-label", `${COLLECTION_COPY.one} / ${COLLECTION_COPY.many}`);
      for (const [value, label] of [["one", COLLECTION_COPY.one], ["many", COLLECTION_COPY.many]]) { const option = element(document, "option", label); option.value = value; cardinality.append(option); }
      cardinality.value = shape.many === true ? "many" : "one";
      cardinality.addEventListener("change", async () => {
        const next = { ...shape }; if (cardinality.value === "many") next.many = true; else delete next.many;
        await writeShape(collection, field, next, error, parentPath, () => { cardinality.value = shape.many === true ? "many" : "one"; });
      });
      const targetLabel = element(document, "label", COLLECTION_COPY.pointsTo); targetLabel.append(target);
      const cardinalityLabel = element(document, "label", `${COLLECTION_COPY.one} / ${COLLECTION_COPY.many}`); cardinalityLabel.append(cardinality);
      box.append(targetLabel, cardinalityLabel);
      if (shape.to === collection) {
        const loopsLabel = element(document, "label", COLLECTION_COPY.noLoops);
        const loops = element(document, "input"); loops.type = "checkbox"; loops.checked = shape.loops === false;
        loops.addEventListener("change", async () => {
          const next = { ...shape }; if (loops.checked) next.loops = false; else delete next.loops;
          await writeShape(collection, field, next, error, parentPath, () => { loops.checked = shape.loops === false; });
        });
        loopsLabel.prepend(loops); box.append(loopsLabel);
      }
      const targetSchema = parseCollectionJson(files.get(`collections/${shape.to}/_collection.json`))?.record;
      const mirrors = plainObject(targetSchema) ? Object.entries(targetSchema).filter(([, candidate]) => candidate?.type === "link" && candidate.to === collection).map(([name]) => name) : [];
      const mirror = element(document, "select"); mirror.setAttribute("aria-label", COLLECTION_COPY.mirroredBy);
      const none = element(document, "option", mirrors.length ? "" : COLLECTION_COPY.mirrorEmpty(shape.to)); none.value = ""; mirror.append(none);
      for (const name of mirrors) { const option = element(document, "option", name); option.value = name; mirror.append(option); }
      mirror.value = shape.mirrored_by ?? "";
      mirror.addEventListener("change", async () => {
        const next = { ...shape }; if (mirror.value) next.mirrored_by = mirror.value; else delete next.mirrored_by;
        await writeShape(collection, field, next, error, parentPath, () => { mirror.value = shape.mirrored_by ?? ""; });
      });
      const mirrorLabel = element(document, "label", COLLECTION_COPY.mirroredBy); mirrorLabel.append(mirror); box.append(mirrorLabel);
      box.append(actionButton(COLLECTION_COPY.cancel, () => box.remove(), undefined, error));
    }

    function linesEditor(anchor, collection, field, shape, error, parentPath) {
      const box = fieldPopover(anchor, "lines");
      box.append(element(document, "p", `${COLLECTION_COPY.eachLineHolds}: ${Object.keys(shape.of ?? {}).join(" · ") || "no fields yet"}`));
      if (parentPath.length >= 1) box.append(element(document, "p", COLLECTION_COPY.nestedTooDeep));
      else box.append(actionButton(COLLECTION_COPY.addField, async () => {
        const next = structuredClone(shape); next.of ??= {};
        let name = "new-field"; for (let suffix = 2; Object.hasOwn(next.of, name); suffix += 1) name = `new-field-${suffix}`;
        next.of[name] = { type: "string" };
        if (await writeShape(collection, field, next, error, parentPath)) box.remove();
      }, undefined, error));
      box.append(actionButton(COLLECTION_COPY.cancel, () => box.remove(), undefined, error));
    }

    function fieldRows(tbody, collection, level, parentPath = [], depth = 0) {
      for (const [field, shape] of Object.entries(level)) {
        const row = element(document, "tr"); row.dataset.collectionField = field;
        row.dataset.fieldDepth = String(depth);
        const error = element(document, "p"); error.setAttribute("aria-live", "polite"); error.dataset.fieldError = field;
        const nameCell = element(document, "th"); nameCell.scope = "row";
        const name = element(document, "input"); name.value = field; name.size = Math.max(4, Math.min(16, field.length)); name.dataset.fieldName = ""; name.setAttribute("aria-label", `field name ${field}`);
        name.addEventListener("blur", async () => {
          const next = name.value.trim(); if (!next || next === field) { name.value = field; return; }
          openRenameDialog({
            document,
            anchor: name,
            references: context.services.references,
            name: collectionFieldReference(collection, field, parentPath),
            initial: next,
            onCancel: () => { name.value = field; },
            onApplied: () => refreshPackage()
          });
        });
        nameCell.append(name);
        const kindCell = element(document, "td");
        const kind = element(document, "select");
        for (const [type, definition] of Object.entries(COLLECTION_COPY.kinds)) { const option = element(document, "option", definition.label); option.value = type; kind.append(option); }
        kind.value = shape.type;
        kind.title = COLLECTION_COPY.kinds[shape.type]?.help ?? "";
        kind.addEventListener("change", async () => {
          await writeShape(collection, field, normalizeShapeForType(shape, kind.value, collectionNames(packageFiles(context))), error, parentPath,
            () => { kind.value = shape.type; });
        });
        kindCell.append(kind);
        const requiredCell = element(document, "td"); const required = element(document, "input"); required.type = "checkbox"; required.checked = shape.required === true;
        required.setAttribute("aria-label", `${field} ${COLLECTION_COPY.columns.required}`);
        required.addEventListener("change", async () => {
          if (required.checked && shape.when) { required.checked = false; error.textContent = COLLECTION_COPY.exclusive; return; }
          const next = { ...shape }; if (required.checked) next.required = true; else delete next.required;
          await writeShape(collection, field, next, error, parentPath, () => { required.checked = shape.required === true; });
        }); requiredCell.append(required);
        const uniqueCell = element(document, "td"); const unique = element(document, "input"); unique.type = "checkbox"; unique.checked = shape.unique === true; unique.setAttribute("aria-label", `${field} ${COLLECTION_COPY.columns.unique}`);
        unique.addEventListener("change", async () => { const next = { ...shape }; if (unique.checked) next.unique = true; else delete next.unique;
          await writeShape(collection, field, next, error, parentPath, () => { unique.checked = shape.unique === true; }); }); uniqueCell.append(unique);
        const choicesCell = element(document, "td"); const choices = actionButton(shape.options?.length ? `${shape.options.length} choices` : COLLECTION_COPY.columns.choices,
          anchor => choicesEditor(anchor, collection, field, shape, error, parentPath), undefined, error); choices.disabled = shape.type !== "string"; choicesCell.append(choices);
        const patternCell = element(document, "td"); const pattern = element(document, "input"); pattern.type = "checkbox"; pattern.checked = shape.pattern === "kebab-case"; pattern.disabled = shape.type !== "string"; pattern.setAttribute("aria-label", `${field} ${COLLECTION_COPY.columns.pattern}`);
        pattern.addEventListener("change", async () => { const next = { ...shape }; if (pattern.checked) next.pattern = "kebab-case"; else delete next.pattern;
          await writeShape(collection, field, next, error, parentPath, () => { pattern.checked = shape.pattern === "kebab-case"; }); }); patternCell.append(pattern);
        const whenCell = element(document, "td"); const when = actionButton(shape.when ? `${COLLECTION_COPY.columns.when} ✓` : COLLECTION_COPY.columns.when,
          anchor => {
            if (shape.required === true) { error.textContent = COLLECTION_COPY.exclusive; return; }
            whenEditor(anchor, collection, field, shape, level, error, parentPath);
          }, undefined, error); when.title = shape.when ? COLLECTION_COPY.whenSentence(Object.keys(shape.when.row ?? {})[0] ?? "", Object.values(shape.when.row ?? {})[0]?.join(", ") ?? "") : COLLECTION_COPY.columns.when; whenCell.append(when);
        const sentenceCell = element(document, "td"); const sentence = element(document, "input"); sentence.value = shape.description ?? ""; sentence.placeholder = COLLECTION_COPY.noSentence; sentence.setAttribute("aria-label", `${field} ${COLLECTION_COPY.columns.sentence}`);
        sentence.addEventListener("blur", async () => { const next = { ...shape }; if (sentence.value) next.description = sentence.value; else delete next.description;
          await writeShape(collection, field, next, error, parentPath, () => { sentence.value = shape.description ?? ""; }); }); sentenceCell.append(sentence);
        const actionCell = element(document, "td"); const remove = actionButton(COLLECTION_COPY.remove, async anchor => {
          const files = packageFiles(context); const mirrors = parentPath.length ? [] : mirroredDependants(files, collection, field);
          if (mirrors.length) {
            const choice = await anchoredConfirmation({ document, anchor,
              question: COLLECTION_COPY.removeMirrorQuestion(mirrors[0].field, mirrors[0].collection), actions: [
              { label: COLLECTION_COPY.removeBoth, value: "both" }, { label: COLLECTION_COPY.keepBoth, value: "keep" }
              ], datasetKey: "collectionConfirmation" });
            if (choice !== "both") return;
          }
          const transaction = context.internal.begin(COLLECTION_COPY.undo.removeField);
          stageRemoveField(transaction, files, collection, field, { removeMirrors: mirrors.length > 0, parentPath });
          try { await validatedCommit(transaction); refreshPackage(); } catch (failure) { error.textContent = failure.message; }
        }, undefined, error); actionCell.append(remove, error);
        row.append(nameCell, kindCell, requiredCell, uniqueCell, choicesCell, patternCell, whenCell, sentenceCell, actionCell);
        tbody.append(row);
        if (shape.type === "link" || shape.type === "list") {
          const extras = element(document, "tr"); extras.dataset.fieldExtras = field; extras.dataset.fieldDepth = String(depth);
          const extrasCell = element(document, "td"); extrasCell.colSpan = 9;
          const summary = shape.type === "link" ? linkSummary(shape)
            : `${COLLECTION_COPY.eachLineHolds} ${Object.keys(shape.of ?? {}).join(" · ") || "no fields yet"}`;
          const editExtras = actionButton(summary, anchor => shape.type === "link"
            ? linkEditor(anchor, collection, field, shape, error, parentPath)
            : linesEditor(anchor, collection, field, shape, error, parentPath), undefined, error);
          // Backticked names in the summary render as code, as everywhere else.
          editExtras.replaceChildren(renderBackticks(document.createDocumentFragment(), summary));
          editExtras.dataset.fieldExtrasButton = field; extrasCell.append(editExtras); extras.append(extrasCell); tbody.append(extras);
        }
        if (shape.type === "list" && depth < 1) fieldRows(tbody, collection, shape.of ?? {}, [...parentPath, field], depth + 1);
      }
    }

    function renderFieldsSection(parent, collection, schema) {
      const section = element(document, "section"); section.dataset.collectionFields = "";
      if (!plainObject(schema)) {
        section.append(element(document, "h3", COLLECTION_COPY.notDescribed), element(document, "p", COLLECTION_COPY.notDescribedHelp));
        section.append(actionButton(COLLECTION_COPY.describeFields, anchor => describeDialog(anchor, collection), "describeFields"));
        parent.append(section);
        return;
      }
      section.append(element(document, "h3", COLLECTION_COPY.fields));
      const table = element(document, "table"); table.dataset.fieldsTable = "";
      const thead = element(document, "thead"); const row = element(document, "tr");
      for (const [headingText, label] of [["name", "name"], ["kind", "kind"], ["required", COLLECTION_COPY.columns.required], ["unique", COLLECTION_COPY.columns.unique],
        ["choices", COLLECTION_COPY.columns.choices], ["kebab", COLLECTION_COPY.columns.pattern], ["only when", COLLECTION_COPY.columns.when], ["sentence", COLLECTION_COPY.columns.sentence]]) {
        const heading = element(document, "th", headingText); heading.scope = "col"; heading.title = label; heading.setAttribute("aria-label", label); row.append(heading);
      }
      const actionsHeading = element(document, "th"); actionsHeading.scope = "col"; actionsHeading.append(element(document, "span", "actions", "opengdd-author-visually-hidden")); row.append(actionsHeading);
      thead.append(row); const tbody = element(document, "tbody"); fieldRows(tbody, collection, schema); table.append(thead, tbody); section.append(table);
      const legend = element(document, "p", Object.values(COLLECTION_COPY.kinds).map(kind => `${kind.label} — ${kind.help}`).join(" · "));
      legend.dataset.fieldsKindLegend = ""; section.append(legend);
      section.append(actionButton(COLLECTION_COPY.addField, async () => {
        const files = packageFiles(context); let name = "new-field"; for (let suffix = 2; Object.hasOwn(schema, name); suffix += 1) name = `new-field-${suffix}`;
        const transaction = context.internal.begin(COLLECTION_COPY.undo.addField); transaction.json(`collections/${collection}/_collection.json`).insert("/record", name, { type: "string" });
        await validatedCommit(transaction); refreshPackage();
      }, "addCollectionField"));
      section.append(actionButton(COLLECTION_COPY.editAsText, () => context.services.selection.select({ kind: "file", name: "_collection.json", file: `collections/${collection}/_collection.json` }), "editFieldsText"));
      section.append(actionButton(COLLECTION_COPY.removeDescriptions, async anchor => {
        const accepted = await anchoredConfirmation({ document, anchor, question: COLLECTION_COPY.removeDescriptionsQuestion, actions: [
          { label: COLLECTION_COPY.removeDescriptions, value: true }, { label: COLLECTION_COPY.cancel, value: false }
        ], datasetKey: "collectionConfirmation" });
        if (!accepted) return;
        const transaction = context.internal.begin(COLLECTION_COPY.undo.removeDescriptions); transaction.json(`collections/${collection}/_collection.json`).remove("/record");
        await validatedCommit(transaction); refreshPackage();
      }, "removeFieldDescriptions"));
      parent.append(section);
    }

    function refreshPackage() {
      if (!activeCollection || !activeTable || !fieldsHost) return;
      const files = packageFiles(context);
      const entries = recordFiles(files, activeCollection);
      headerCount.textContent = COLLECTION_COPY.recordsCount(entries.length);
      const schema = parseCollectionJson(files.get(`collections/${activeCollection}/_collection.json`))?.record;
      fieldsHost.replaceChildren();
      renderFieldsSection(fieldsHost, activeCollection, schema);
      activeTable.setSchema(plainObject(schema) ? schema : undefined);
    }

    function render() {
      const selection = context.services.selection.current();
      const collection = selection?.kind === "collection" ? (COLLECTION_PATH.exec(selection.file)?.[1] ?? selection.name) : "";
      if (!collection) { context.surface.empty(true); return; }
      context.surface.empty(false);
      activeCollection = collection;
      activeTable?.destroy?.(); activeTable = undefined;
      body.replaceChildren();
      const files = packageFiles(context);
      const entries = recordFiles(files, collection);
      const header = element(document, "header"); header.dataset.collectionHeader = "";
      headerCount = element(document, "span", COLLECTION_COPY.recordsCount(entries.length));
      header.append(element(document, "code", collection), element(document, "span", " · "), headerCount, element(document, "span", " · "));
      const add = actionButton(COLLECTION_COPY.addRecord, anchor => context.internal.openCollectionRecord({ anchor, collection }), "collectionAddRecord");
      const rename = actionButton(COLLECTION_COPY.rename, anchor => openRenameDialog({
        document,
        anchor,
        references: context.services.references,
        name: `collections.${collection}`,
        initial: collection,
        onApplied: next => context.services.selection.select({ kind: "collection", name: next, file: `collections/${next}` })
      }), "collectionRename");
      const remove = actionButton(COLLECTION_COPY.remove, async anchor => {
        const accepted = await anchoredConfirmation({ document, anchor,
          question: COLLECTION_COPY.removeCollection(collection, entries.length), actions: [
          { label: COLLECTION_COPY.remove, value: true }, { label: COLLECTION_COPY.cancel, value: false }
          ], datasetKey: "collectionConfirmation" });
        if (!accepted) return;
        const transaction = context.internal.begin(COLLECTION_COPY.undo.removeCollection);
        transaction.folder(`collections/${collection}`).remove();
        await transaction.commit();
        context.services.selection.select(null);
      }, "collectionRemove");
      const view = views.get(collection) ?? { sort: { key: "id", direction: "ascending" }, find: "" }; views.set(collection, view);
      const findLabel = element(document, "label", COLLECTION_COPY.find); const find = element(document, "input"); find.type = "search"; find.value = view.find; find.dataset.collectionFind = ""; findLabel.append(find);
      header.append(add, element(document, "span", " · "), rename, element(document, "span", " · "), remove,
        element(document, "span", " · "), findLabel); body.append(header);
      const schema = parseCollectionJson(files.get(`collections/${collection}/_collection.json`))?.record;
      fieldsHost = element(document, "div"); fieldsHost.dataset.collectionFieldsHost = ""; body.append(fieldsHost);
      renderFieldsSection(fieldsHost, collection, schema);
      const tableHost = element(document, "div"); body.append(tableHost);
      const rows = createFolderRows({
        collection, package: context.package, edits: context.internal.edits,
        validatePackage: context.internal.validatePackage,
        openAddRecord: ({ prefill }) => context.internal.openCollectionRecord({ anchor: add, collection, prefill }),
        references: context.services.references,
        renameRecord: ({ id, anchor }) => openRenameDialog({
          document,
          anchor,
          references: context.services.references,
          name: `collections.${collection}.${id}`,
          initial: id,
          onApplied: next => context.services.selection.select({
            kind: "collection-record", name: next, file: `collections/${collection}/${next}.json`
          })
        }),
        field: (id, key, shape) => descriptorFor(collection, id, key, shape),
        confirmRemove: detail => confirmRemove(body.querySelector?.(`[data-record-row="${detail.id}"] button`) ?? add, detail),
        copy: COLLECTION_COPY
      });
      activeTable = createRecordTable(tableHost, {
        schema: plainObject(schema) ? schema : undefined, rows, forms: context.services.forms, copy: COLLECTION_COPY,
        view,
        onSelectRow: id => context.services.selection.select({ kind: "collection-record", name: id, file: `collections/${collection}/${id}.json` })
      });
      find.addEventListener("input", () => activeTable?.setFind(find.value));
      panelError = element(document, "p"); panelError.setAttribute("aria-live", "polite"); panelError.dataset.collectionError = ""; body.append(panelError);
    }

    const selectionCancel = context.services.selection.subscribe(render);
    const packageCancel = context.package.subscribe(refreshPackage);
    render();
    return { destroy() { selectionCancel(); packageCancel(); activeTable?.destroy?.(); body.remove(); } };
  }
};
