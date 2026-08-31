import { isContractDependentFinding, isContractTodoFinding } from "./contracts.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { plainObject, pointerSegment } from "./json-path.mjs";

const container = value => plainObject(value) || Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);

export function contractQuestionLiveness(adoption) {
  const questions = plainObject(adoption?.questions) ? adoption.questions : {};
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const memo = new Map();
  const resolving = new Set();
  const asked = name => {
    if (memo.has(name)) return memo.get(name);
    if (resolving.has(name)) return true; // The validator owns cycle refusal.
    resolving.add(name);
    const when = questions[name]?.when;
    let result = true;
    if (plainObject(when?.flag)) for (const [dependency, allowed] of Object.entries(when.flag)) {
      if (!own(questions, dependency) || !asked(dependency) || !own(answers, dependency)
        || !Array.isArray(allowed) || !allowed.includes(answers[dependency])) {
        result = false;
        break;
      }
    }
    resolving.delete(name);
    memo.set(name, result);
    return result;
  };
  return new Set(Object.keys(questions).filter(name => !name.startsWith("_") && asked(name)));
}

export function contractRowWhenSatisfied(condition, answers, asked, row) {
  if (plainObject(condition?.flag)) for (const [name, allowed] of Object.entries(condition.flag)) {
    if (!asked.has(name) || !own(answers, name) || !Array.isArray(allowed) || !allowed.includes(answers[name])) return false;
  }
  if (plainObject(condition?.row)) for (const [name, allowed] of Object.entries(condition.row)) {
    if (!plainObject(row) || !own(row, name) || !Array.isArray(allowed) || !allowed.includes(row[name])) return false;
  }
  return true;
}

function rowFieldsRead(template) {
  const fields = new Set();
  if (plainObject(template?.bindings)) for (const binding of Object.values(template.bindings)) {
    if (plainObject(binding) && typeof binding.row_field === "string") fields.add(binding.row_field);
  }
  const serialized = JSON.stringify([template?.title, template?.text, template?.test]);
  for (const match of serialized.matchAll(/\{\{row\.([^}]+)\}\}/g)) fields.add(match[1]);
  return fields;
}

export function liveContractTemplates(adoption, pack) {
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const asked = contractQuestionLiveness(adoption);
  const rows = plainObject(adoption?.rows) ? adoption.rows : {};
  return (Array.isArray(pack?.templates) ? pack.templates : []).filter(template => {
    if (!plainObject(template) || !contractRowWhenSatisfied(plainObject(template.when) ? { flag: template.when.flag } : undefined, answers, asked)) return false;
    if (plainObject(template.bindings)) for (const binding of Object.values(template.bindings)) {
      if (plainObject(binding) && typeof binding.flag === "string" && !asked.has(binding.flag)) return false;
    }
    if (template.expand !== "per-row") return true;
    const fields = rowFieldsRead(template);
    return (Array.isArray(rows[template.collection]) ? rows[template.collection] : []).some(row =>
      contractRowWhenSatisfied(plainObject(template.when) ? { row: template.when.row } : undefined, answers, asked, row)
      && [...fields].every(field => own(row, field)));
  });
}

export function splitContractTests(markdown, adoption) {
  if (typeof markdown !== "string" || !markdown || !adoption) return "";
  return markdown.split(/(?=^### AT )/m)
    .filter(section => section.startsWith(`### AT ${adoption}/`))
    .join("").trimEnd();
}

export function firstSentence(text) {
  const source = String(text ?? "").trim();
  const match = /^.*?[.!?](?=\s|$)/u.exec(source);
  return match?.[0] ?? source;
}

export function pointerFor(...parts) {
  return parts.length ? `/${parts.map(pointerSegment).join("/")}` : "";
}

// Verification is the only designer map that may be absent. Stage the
// shallowest missing object in one JSON operation so structured edits never
// depend on a parent created earlier in the same transaction.
function stageContractDesignerValue(transaction, adoption, file, parts, value, remove = false) {
  const json = transaction.json(file);
  let current = adoption;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!container(current) || !own(current, part)) {
      if (remove) return false;
      const nested = parts.slice(index + 1).reduceRight((child, key) => ({ [key]: child }), value);
      json.insert(pointerFor(...parts.slice(0, index)), part, nested);
      return true;
    }
    current = current[part];
  }
  if (remove) json.remove(pointerFor(...parts));
  else json.set(pointerFor(...parts), value);
  return true;
}

function applyDesignerChange(adoption, change) {
  if (change.insert !== undefined) {
    let target = adoption;
    for (const part of change.parts) {
      if (!container(target) || !own(target, part)) return false;
      target = target[part];
    }
    if (!Array.isArray(target)) return false;
    const index = change.insert === "-" ? target.length : Number(change.insert);
    target.splice(index, 0, structuredClone(change.value));
    return true;
  }
  let current = adoption;
  for (const part of change.parts.slice(0, -1)) {
    if (!container(current)) return false;
    if (!own(current, part)) {
      if (change.remove) return false;
      current[part] = {};
    }
    current = current[part];
  }
  const key = change.parts.at(-1);
  if (change.remove) {
    if (!container(current) || !own(current, key)) return false;
    if (Array.isArray(current)) current.splice(Number(key), 1);
    else delete current[key];
  } else if (container(current)) current[key] = structuredClone(change.value);
  else return false;
  return true;
}

function conditionedRowRemovals(before, after) {
  const changes = [];
  const answers = plainObject(after.answers) ? after.answers : {};
  const asked = contractQuestionLiveness(after);
  const declarations = plainObject(after.declares?.rows) ? after.declares.rows : {};
  for (const [set, declaration] of Object.entries(declarations)) {
    const schema = plainObject(declaration?.record) ? declaration.record : {};
    const rows = Array.isArray(after.rows?.[set]) ? after.rows[set] : [];
    const beforeRows = Array.isArray(before.rows?.[set]) ? before.rows[set] : [];
    for (const [index, row] of rows.entries()) {
      if (!plainObject(row) || !plainObject(beforeRows[index])) continue;
      // A removal can make another row condition false, so settle the row
      // before staging the minimal removals against the authored object.
      for (let pass = 0; pass < Object.keys(schema).length; pass += 1) {
        let removed = false;
        for (const [field, shape] of Object.entries(schema)) {
          if (!plainObject(shape?.when) || !own(row, field)
            || contractRowWhenSatisfied(shape.when, answers, asked, row)) continue;
          delete row[field];
          if (own(beforeRows[index], field)) changes.push({ parts: ["rows", set, index, field], remove: true });
          removed = true;
        }
        if (!removed) break;
      }
    }
  }
  return changes;
}

// This is the worksheet's one shipped transaction boundary. Module checks call
// it directly; the panel supplies the same private staged-validation channel.
export async function writeContractDesignerValue({ internal, adoption, file, parts, value,
  remove = false, label, allowTodo = false, allowDependent = false, allowRowTodo = false,
  allowAskedAnswerTodo = false, changes, preview = false }) {
  const transaction = internal.begin(label);
  const requested = Array.isArray(changes) ? changes : [{ parts, value, remove }];
  const prospective = structuredClone(adoption);
  const applicable = requested.map(change => applyDesignerChange(prospective, change));
  if (applicable.some(result => !result)) {
    transaction.abort();
    throw new Error(CONTRACT_COPY.transactionRefused);
  }
  const cleanup = conditionedRowRemovals(adoption, prospective);
  const stagedChanges = [...requested, ...cleanup.filter(change => !requested.some(candidate => candidate.remove
    && pointerFor(...candidate.parts) === pointerFor(...change.parts)))];
  const json = transaction.json(file);
  for (const change of stagedChanges) {
    // A row or an input object joins a pretty-printed container in its layout.
    if (change.insert !== undefined) json.insert(pointerFor(...change.parts), change.insert, change.value, { pretty: true });
    else if (!stageContractDesignerValue(transaction, adoption, file, change.parts, change.value, change.remove)) {
      transaction.abort();
      throw new Error(CONTRACT_COPY.transactionRefused);
    }
  }
  let staged;
  try {
    staged = await internal.stage(transaction);
    const newlyMissingAnswer = allowAskedAnswerTodo
      && staged.introduced.some(finding => finding.code === "CONTRACT_ANSWER_MISSING");
    const refused = staged.introduced.find(finding => {
      if (allowTodo && (isContractTodoFinding(finding) || isContractDependentFinding(finding))) return false;
      // Dependent findings exist only because designer parts are missing.
      // A value write can only reduce what is missing, so their changed shape may pass.
      if (allowDependent && isContractDependentFinding(finding)) return false;
      // The rows path may leave a row's own to-do (a field a condition just
      // made required, a choice still to make) and its consequences; never an
      // answer or value to-do, which no row edit can honestly create.
      if (allowRowTodo && (/^CONTRACT_ROW_(FIELD|CHOICE|ID)$/u.test(finding.code) || isContractDependentFinding(finding))) return false;
      // Answer writes never excuse rule failures, which read values rather than answers.
      if (allowAskedAnswerTodo && (finding.code === "CONTRACT_ANSWER_MISSING"
        || newlyMissingAnswer && isContractDependentFinding(finding) && finding.code !== "CONTRACT_RULE_INVALID")) return false;
      return true;
    });
    if (refused && !preview) {
      const error = new Error(CONTRACT_COPY.validationRefused(refused.message));
      error.findings = staged.introduced;
      throw error;
    }
    if (preview) {
      transaction.abort();
      return Object.freeze({ committed: false, staged, refused });
    }
  } catch (error) {
    transaction.abort();
    if (error?.findings) throw error;
    throw new Error(CONTRACT_COPY.writeInterrupted);
  }
  try { await transaction.commit(); }
  catch { throw new Error(CONTRACT_COPY.writeInterrupted); }
  return Object.freeze({ committed: true, staged });
}

export function contractTestInputField({ adoption, file, template, input, declaration, write }) {
  const suggested = declaration.default;
  const field = {
    key: `${template.id}-${input}`, label: input, type: input === "seeds" ? "list" : "text",
    helpOptional: true, clearRemoves: true,
    binding: { file, pointer: pointerFor("verification", template.id, input) },
    format: current => {
      const shown = current === undefined ? suggested : current;
      return input === "seeds" ? Array.isArray(shown) ? shown.join("\n") : "" : shown ?? "";
    },
    labels: { change: CONTRACT_COPY.undo.changeTestInput, clear: CONTRACT_COPY.undo.changeTestInput },
    write: (value, detail) => write(adoption, ["verification", template.id, input], value, {
      remove: detail.remove, label: CONTRACT_COPY.undo.changeTestInput, allowTodo: detail.remove
    })
  };
  if (suggested !== undefined) field.action = {
    label: CONTRACT_COPY.suggested,
    run: () => write(adoption, ["verification", template.id, input], suggested, {
      label: CONTRACT_COPY.undo.changeTestInput
    })
  };
  return field;
}

export function ruleValueNames(line, declarations) {
  const names = new Set(Object.keys(plainObject(declarations) ? declarations : {}));
  return [...String(line ?? "").matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)]
    .map(match => match[0]).filter((name, index, all) => names.has(name) && all.indexOf(name) === index);
}
