import { contractQuestionLiveness, contractRowWhenSatisfied, pointerFor,
  writeContractDesignerValue } from "./contract-worksheet.mjs";
import { plainObject } from "./json-path.mjs";

const own = (value, key) => Object.hasOwn(value, key);

function uniqueRowName(existing, key) {
  const taken = new Set(existing.map(candidate => candidate?.[key]).filter(value => typeof value === "string"));
  for (let number = 1; ; number += 1) {
    const value = `row-${number}`;
    if (!taken.has(value)) return value;
  }
}

function seededRow(schema, existing) {
  const row = {};
  for (const [key, shape] of Object.entries(plainObject(schema) ? schema : {})) {
    if (!plainObject(shape) || plainObject(shape.when)) continue;
    const constrainedString = shape.type === "string"
      && (key === "id" || shape.pattern === "kebab-case" || shape.unique === true);
    if (constrainedString && (shape.required === true || key === "id")) row[key] = uniqueRowName(existing, key);
    else if (shape.required !== true) continue;
    else if (Array.isArray(shape.options) && shape.options.length) row[key] = shape.options[0];
    else if (shape.type === "number" || shape.type === "integer") row[key] = 0;
    else if (shape.type === "string" || shape.type === "citation") row[key] = "";
  }
  return row;
}

function normalizeRows(rows, schema, existing, copy) {
  const source = rows === undefined ? [seededRow(schema, existing)] : Array.isArray(rows) ? rows : [rows];
  return source.map(item => {
    const row = structuredClone(plainObject(item?.values) ? item.values : item);
    if (!plainObject(row)) throw new Error(copy.rowObjectRefusal);
    if (plainObject(schema?.id) && !own(row, "id") && typeof item?.id === "string") row.id = item.id;
    return row;
  });
}

function settleInapplicable(row, schema, answers, asked) {
  for (let pass = 0; pass < Object.keys(schema).length; pass += 1) {
    let removed = false;
    for (const [key, shape] of Object.entries(schema)) {
      if (!plainObject(shape?.when) || !own(row, key)
        || contractRowWhenSatisfied(shape.when, answers, asked, row)) continue;
      delete row[key];
      removed = true;
    }
    if (!removed) break;
  }
  return row;
}

function rowFindingField(message, set, index) {
  const escaped = String(set).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = new RegExp(`/rows/${escaped}/${index}/([^\\s,;]+)`, "u").exec(message)?.[1];
  if (direct) return direct.replace(/[)\]}.:]+$/u, "");
  return /field "([^"]+)"/u.exec(message)?.[1] ?? "row";
}

function findingsFor(internal, file, set, index) {
  const escaped = String(set).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pointer = new RegExp(`/rows/${escaped}/${index}(?=/|\\s|$)`, "u");
  return (internal.run?.()?.findings ?? []).filter(finding => finding.file === file
    && (/^CONTRACT_ROW_/u.test(finding.code) || /^CONTRACT_CITATION_/u.test(finding.code))
    && pointer.test(String(finding.message ?? "")));
}

function reasonFor(copy, shape) {
  const row = Object.entries(plainObject(shape.when?.row) ? shape.when.row : {})[0];
  if (row) return copy.doesntApplyRowReason(row[0], row[1]);
  const flag = Object.entries(plainObject(shape.when?.flag) ? shape.when.flag : {})[0];
  return flag ? copy.doesntApplyAnswerReason(flag[0], flag[1]) : copy.doesntApplyField;
}

export function createContractRows({ file, set, schema, readAdoption, internal, copy }) {
  if (typeof file !== "string" || !file || typeof set !== "string" || !set
    || !plainObject(schema) || typeof readAdoption !== "function" || !internal
    || typeof internal.begin !== "function" || typeof internal.stage !== "function") {
    throw new TypeError("Contract rows need a file, set, record schema, fresh-adoption reader, and worksheet write boundary.");
  }
  const currentAdoption = () => {
    const value = readAdoption();
    if (!plainObject(value)) throw new Error(copy.writeInterrupted);
    return value;
  };
  const authored = adoption => Array.isArray(adoption.rows?.[set]) ? adoption.rows[set] : [];
  const hasId = plainObject(schema.id);
  const idAt = (rows, index) => hasId ? String(rows[index]?.id ?? index) : String(index);
  const indexOf = (rows, id) => rows.findIndex((row, index) => idAt(rows, index) === String(id));
  const changesFor = rows => rows.map(row => ({ parts: ["rows", set], insert: "-", value: row }));
  const writeBoundary = (adoption, options) => writeContractDesignerValue({
    internal, adoption, file, allowRowTodo: true, ...options
  });

  const adapter = {
    list() {
      const rows = authored(currentAdoption());
      return rows.map((values, index) => ({ id: idAt(rows, index), values }));
    },
    read(id, key) {
      const rows = authored(currentAdoption());
      const index = indexOf(rows, id);
      return index < 0 ? undefined : rows[index]?.[key];
    },
    async write(id, key, value, label = copy.undo.changeRow) {
      const adoption = currentAdoption();
      const index = indexOf(authored(adoption), id);
      if (index < 0) throw new Error(copy.rowMissing(id));
      return writeBoundary(adoption, {
        changes: [{ parts: ["rows", set, index, key], value, remove: value === undefined }], label
      });
    },
    async add(rows, label = copy.undo.addRow) {
      const adoption = currentAdoption();
      const existing = authored(adoption);
      const answers = plainObject(adoption.answers) ? adoption.answers : {};
      const asked = contractQuestionLiveness(adoption);
      const values = normalizeRows(rows, schema, existing, copy)
        .map(row => settleInapplicable(row, schema, answers, asked));
      await writeBoundary(adoption, { changes: changesFor(values), label });
      return values.map((row, offset) => hasId ? String(row.id) : String(existing.length + offset));
    },
    async previewAdd(rows, label = copy.undo.addRow) {
      const adoption = currentAdoption();
      const existing = authored(adoption);
      const answers = plainObject(adoption.answers) ? adoption.answers : {};
      const asked = contractQuestionLiveness(adoption);
      const values = normalizeRows(rows, schema, existing, copy)
        .map(row => settleInapplicable(row, schema, answers, asked));
      const result = await writeBoundary(adoption, { changes: changesFor(values), label, preview: true });
      return Object.freeze({ ...result.staged.run, refused: result.refused });
    },
    async remove(id) {
      const adoption = currentAdoption();
      const index = indexOf(authored(adoption), id);
      if (index < 0) throw new Error(copy.rowMissing(id));
      return writeBoundary(adoption, { changes: [{ parts: ["rows", set, index], remove: true }], label: copy.undo.removeRow });
    },
    async move(id, direction) {
      const adoption = currentAdoption();
      const rows = authored(adoption);
      const index = indexOf(rows, id);
      const neighbour = direction === "up" ? index - 1 : direction === "down" ? index + 1 : -1;
      if (index < 0) throw new Error(copy.rowMissing(id));
      if (neighbour < 0 || neighbour >= rows.length) return false;
      await writeBoundary(adoption, { changes: [
        { parts: ["rows", set, index], remove: true },
        { parts: ["rows", set], insert: neighbour, value: structuredClone(rows[index]) }
      ], label: copy.undo.moveRow });
      return true;
    },
    field(id, key, shape) {
      const adoption = currentAdoption();
      const rows = authored(adoption);
      const index = indexOf(rows, id);
      const row = rows[index];
      if (index < 0 || !plainObject(shape)) return undefined;
      const answers = plainObject(adoption.answers) ? adoption.answers : {};
      const asked = contractQuestionLiveness(adoption);
      if (plainObject(shape.when) && !contractRowWhenSatisfied(shape.when, answers, asked, row)) {
        const reason = reasonFor(copy, shape);
        return { inapplicable: true, display: copy.doesntApplyField, reason,
          ariaLabel: `${key}: ${copy.doesntApplyField}. ${reason}` };
      }
      const finding = findingsFor(internal, file, set, index)
        .find(item => rowFindingField(item.message ?? "", set, index) === key);
      const descriptor = {
        key, label: key, help: shape.description ?? null, helpOptional: !shape.description,
        required: shape.required === true || plainObject(shape.when), clearRemoves: true,
      labels: { change: copy.undo.changeRow, clear: copy.undo.changeRow },
        validate: () => finding?.message ?? ""
      };
      if (shape.pattern === "kebab-case") descriptor.note = copy.kebabHelp;
      if (shape.type === "string") {
        descriptor.type = Array.isArray(shape.options) ? "enum" : "text";
        if (Array.isArray(shape.options)) descriptor.options = shape.options;
      } else if (shape.type === "integer" || shape.type === "number") descriptor.type = shape.type;
      else if (shape.type === "citation") {
        descriptor.type = "reference";
        descriptor.options = { candidates: internal.candidates ?? [], allowFree: false };
      } else return undefined;
      return descriptor;
    },
    binding(id, key) {
      const adoption = currentAdoption();
      const index = indexOf(authored(adoption), id);
      return index < 0 ? undefined : { file, pointer: pointerFor("rows", set, index, key) };
    },
    errors(id) {
      const adoption = currentAdoption();
      const index = indexOf(authored(adoption), id);
      if (index < 0) return "";
      return findingsFor(internal, file, set, index).map(finding => {
        const field = rowFindingField(finding.message ?? "", set, index);
        return copy.rowFinding(field, finding.message ?? "");
      }).join(" ");
    },
    findings(id) {
      const adoption = currentAdoption();
      const index = indexOf(authored(adoption), id);
      return index < 0 ? [] : findingsFor(internal, file, set, index).map(finding => ({
        finding, field: rowFindingField(finding.message ?? "", set, index)
      }));
    }
  };
  return Object.freeze(adapter);
}
