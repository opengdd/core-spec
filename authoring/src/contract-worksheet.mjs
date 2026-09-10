import { isContractDependentFinding, isContractTodoFinding } from "./contracts.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { own, plainObject, pointerSegment } from "./json-path.mjs";

const container = value => plainObject(value) || Array.isArray(value);
function contractValueCitationForm(value) {
  return typeof value === "string" && value.trim() !== "" && !/[\s#:{}]/u.test(value)
    && value.includes(".") && !value.split(".").some(segment => !segment);
}

function conditionFlagDependencies(condition, found = [], nested = false) {
  if (!plainObject(condition)) return found;
  if (plainObject(condition.flag)) found.push(...Object.keys(condition.flag));
  if (!nested) for (const combinator of ["any", "all"]) {
    if (Array.isArray(condition[combinator])) {
      for (const member of condition[combinator]) conditionFlagDependencies(member, found, true);
    }
  }
  return found;
}

function conditionHolds(condition, environment, nested = false, row, rowDomain = false) {
  if (!plainObject(condition)) return true;
  if (rowDomain) {
    if (plainObject(condition.flag)) for (const [name, allowed] of Object.entries(condition.flag)) {
      if (!environment.flagHolds(name, allowed)) return false;
    }
    if (plainObject(condition.row)) for (const [field, allowed] of Object.entries(condition.row)) {
      if (!plainObject(row) || !own(row, field) || !Array.isArray(allowed)
        || !allowed.includes(row[field])) return false;
    }
    return true;
  }
  if (plainObject(condition.flag)) {
    for (const [name, allowed] of Object.entries(condition.flag)) {
      if (!environment.flagHolds(name, allowed)) return false;
    }
    return true;
  }
  if (plainObject(condition["value-form"])) {
    for (const [name, listed] of Object.entries(condition["value-form"])) {
      const form = environment.valueForms.get(name);
      if (!form || !Array.isArray(listed) || !listed.includes(form)) return false;
    }
    return true;
  }
  if (plainObject(condition["row-count"])) {
    for (const [name, cardinality] of Object.entries(condition["row-count"])) {
      const count = environment.rowCounts.get(name);
      if (typeof count !== "number") return false;
      if (cardinality === "empty" && count !== 0) return false;
      if (cardinality === "non-empty" && count < 1) return false;
      if (cardinality === "at-least-two" && count < 2) return false;
    }
    return true;
  }
  if (Array.isArray(condition.any)) {
    return !nested && condition.any.some(member => conditionHolds(member, environment, true, row));
  }
  if (Array.isArray(condition.all)) {
    return !nested && condition.all.every(member => conditionHolds(member, environment, true, row));
  }
  if (plainObject(condition["row-has"])) {
    if (nested) return false;
    for (const [name, rowCondition] of Object.entries(condition["row-has"])) {
      const rows = environment.rowArrays.get(name);
      if (!Array.isArray(rows) || !rows.some(candidate => plainObject(candidate)
        && plainObject(rowCondition) && Object.entries(rowCondition).every(([field, allowed]) =>
          own(candidate, field) && Array.isArray(allowed) && allowed.includes(candidate[field])))) return false;
    }
    return true;
  }
  return false;
}

function contractFacts(adoption) {
  const declarations = plainObject(adoption?.declares?.values) ? adoption.declares.values : {};
  const suppliedValues = plainObject(adoption?.values) ? adoption.values : {};
  const valueForms = new Map();
  for (const [name, declaration] of Object.entries(declarations)) {
    if (name.startsWith("_") || !plainObject(declaration) || own(declaration, "when")
      || !own(suppliedValues, name)) continue;
    const value = suppliedValues[name];
    if (typeof value === "number" && Number.isFinite(value)) valueForms.set(name, "number");
    else if (contractValueCitationForm(value)) valueForms.set(name, "citation");
  }
  const rowDeclarations = plainObject(adoption?.declares?.rows) ? adoption.declares.rows : {};
  const suppliedRows = plainObject(adoption?.rows) ? adoption.rows : {};
  const rowCounts = new Map();
  const rowArrays = new Map();
  for (const [name, declaration] of Object.entries(rowDeclarations)) {
    if (name.startsWith("_") || !plainObject(declaration) || !Array.isArray(suppliedRows[name])) continue;
    rowCounts.set(name, suppliedRows[name].length);
    rowArrays.set(name, suppliedRows[name]);
  }
  return { valueForms, rowCounts, rowArrays };
}

function conditionEnvironment(adoption, asked, facts) {
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  return {
    ...facts,
    flagHolds: (name, allowed) => asked.has(name) && own(answers, name)
      && Array.isArray(allowed) && allowed.includes(answers[name])
  };
}

export function contractQuestionLiveness(adoption, facts = contractFacts(adoption)) {
  const source = plainObject(adoption?.questions) ? adoption.questions : {};
  const questions = new Map(Object.entries(source)
    .filter(([name, question]) => !name.startsWith("_") && plainObject(question)));
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const states = new Map();
  let cycle;
  const visit = (name, stack) => {
    if (cycle || states.get(name) === "done") return;
    if (states.get(name) === "open") {
      cycle = [...stack.slice(stack.indexOf(name)), name];
      return;
    }
    states.set(name, "open");
    stack.push(name);
    for (const dependency of conditionFlagDependencies(questions.get(name)?.when)) {
      if (questions.has(dependency)) visit(dependency, stack);
    }
    stack.pop();
    states.set(name, "done");
  };
  for (const name of questions.keys()) visit(name, []);
  if (cycle) return new Set(questions.keys());

  const memo = new Map();
  let environment;
  const resolve = name => {
    if (memo.has(name)) return memo.get(name);
    const when = questions.get(name)?.when;
    const result = !plainObject(when) || conditionHolds(when, environment);
    memo.set(name, result);
    return result;
  };
  environment = {
    ...facts,
    flagHolds: (name, allowed) => questions.has(name) && resolve(name) && own(answers, name)
      && Array.isArray(allowed) && allowed.includes(answers[name])
  };
  return new Set([...questions.keys()].filter(resolve));
}

export function contractAdoptionActivation(adoption) {
  const facts = contractFacts(adoption);
  const asked = contractQuestionLiveness(adoption, facts);
  const environment = conditionEnvironment(adoption, asked, facts);
  const declarations = plainObject(adoption?.declares?.values) ? adoption.declares.values : {};
  const activeValues = new Set();
  for (const [name, declaration] of Object.entries(declarations)) {
    if (name.startsWith("_") || !plainObject(declaration)) continue;
    if (!own(declaration, "when") || conditionHolds(declaration.when, environment)) activeValues.add(name);
  }
  return Object.freeze({ asked, activeValues, facts });
}

export function contractRowWhenSatisfied(condition, answers, asked, row, facts) {
  const environment = {
    valueForms: facts.valueForms,
    rowCounts: facts.rowCounts,
    rowArrays: facts.rowArrays,
    flagHolds: (name, allowed) => asked.has(name) && own(answers, name)
      && Array.isArray(allowed) && allowed.includes(answers[name])
  };
  const widened = plainObject(condition) && ["value-form", "row-count", "any", "all", "row-has"]
    .some(form => own(condition, form));
  return conditionHolds(condition, environment, false, row, !widened);
}

export function contractConditionFailure(adoption, condition, activation = contractAdoptionActivation(adoption)) {
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const environment = conditionEnvironment(adoption, activation.asked, activation.facts);
  const find = (candidate, nested = false, pointer = "/when") => {
    if (!plainObject(candidate)) return { kind: "condition", pointer };
    if (conditionHolds(candidate, environment, nested)) return undefined;
    if (Array.isArray(candidate.any)) {
      if (nested || candidate.any.length === 0) return { kind: "condition", pointer: `${pointer}/any` };
      return find(candidate.any[0], true, `${pointer}/any/0`) ?? { kind: "condition", pointer: `${pointer}/any` };
    }
    if (Array.isArray(candidate.all)) {
      if (nested || candidate.all.length === 0) return { kind: "condition", pointer: `${pointer}/all` };
      const member = candidate.all.find(item => !conditionHolds(item, environment, true));
      const index = candidate.all.indexOf(member);
      return find(member, true, `${pointer}/all/${index}`) ?? { kind: "condition", pointer: `${pointer}/all/${index}` };
    }
    if (plainObject(candidate.flag)) for (const [name, allowed] of Object.entries(candidate.flag)) {
      if (!environment.flagHolds(name, allowed)) {
        return { kind: "flag", name, allowed, answer: own(answers, name) ? answers[name] : undefined };
      }
    }
    if (plainObject(candidate["value-form"])) for (const [name, forms] of Object.entries(candidate["value-form"])) {
      const form = activation.facts.valueForms.get(name);
      if (!form || !Array.isArray(forms) || !forms.includes(form)) return { kind: "value-form", name, forms, form };
    }
    if (plainObject(candidate["row-count"])) for (const [name, cardinality] of Object.entries(candidate["row-count"])) {
      const count = activation.facts.rowCounts.get(name);
      const holds = typeof count === "number" && (cardinality === "empty" ? count === 0
        : cardinality === "non-empty" ? count >= 1 : cardinality === "at-least-two" && count >= 2);
      if (!holds) return { kind: "row-count", name, cardinality, count };
    }
    return { kind: "condition", pointer };
  };
  return find(condition);
}

function stringsIn(value, visit) {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringsIn(item, visit);
    return;
  }
  if (plainObject(value)) for (const [key, item] of Object.entries(value)) {
    if (!key.startsWith("_")) stringsIn(item, visit);
  }
}

export function contractTemplateRowFields(template) {
  const fields = new Set();
  if (plainObject(template?.bindings)) for (const binding of Object.values(template.bindings)) {
    if (plainObject(binding) && typeof binding.row_field === "string") fields.add(binding.row_field);
  }
  if (plainObject(template?.when?.row)) for (const field of Object.keys(template.when.row)) fields.add(field);
  const sources = [template?.title, template?.text, template?.test];
  if (plainObject(template?.bindings)) for (const binding of Object.values(template.bindings)) {
    if (plainObject(binding?.map)) sources.push(...Object.values(binding.map));
  }
  stringsIn(sources, source => {
    for (const match of source.matchAll(/\{\{row\.([^}]+)\}\}/g)) fields.add(match[1]);
  });
  return fields;
}

export function contractTemplateValueCitations(template) {
  const sources = [template?.title, template?.text, template?.test];
  if (plainObject(template?.bindings)) for (const binding of Object.values(template.bindings)) {
    if (plainObject(binding?.map)) sources.push(...Object.values(binding.map));
  }
  const citations = [];
  stringsIn(sources, source => {
    for (const match of source.matchAll(/\{\{value-cite:([^}]+)\}\}/g)) citations.push(match[1]);
  });
  return citations;
}

function matchingTemplateRows(adoption, template, activation) {
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const rows = plainObject(adoption?.rows) ? adoption.rows : {};
  const fields = contractTemplateRowFields(template);
  return (Array.isArray(rows[template.collection]) ? rows[template.collection] : []).filter(row =>
    contractRowWhenSatisfied(plainObject(template.when) ? { row: template.when.row } : undefined,
      answers, activation.asked, row, activation.facts)
    && [...fields].every(field => own(row, field)));
}

const templateExclusion = (cause, { flag, value, list, field } = {}) => Object.freeze({
  cause, flag, value, list, field
});

export function contractTemplateExclusion(adoption, template, activation = contractAdoptionActivation(adoption)) {
  const answers = plainObject(adoption?.answers) ? adoption.answers : {};
  const whenFlags = plainObject(template?.when?.flag) ? template.when.flag : {};
  for (const [flag, allowed] of Object.entries(whenFlags)) {
    if (!Array.isArray(allowed)) return templateExclusion("malformed", { flag });
    if (!activation.asked.has(flag)) return templateExclusion("flag-not-asked", { flag });
    if (!allowed.includes(answers[flag])) return templateExclusion("flag-value", { flag, value: answers[flag] });
  }
  if (plainObject(template?.bindings)) for (const binding of Object.values(template.bindings)) {
    if (plainObject(binding) && typeof binding.flag === "string" && !activation.asked.has(binding.flag)) {
      return templateExclusion("binding-flag", { flag: binding.flag });
    }
  }
  const declarations = plainObject(adoption?.declares?.values) ? adoption.declares.values : {};
  const inactive = contractTemplateValueCitations(template)
    .find(value => own(declarations, value) && !activation.activeValues.has(value));
  if (inactive) return templateExclusion("inactive-value", { value: inactive });
  if (template?.expand !== "per-row") return undefined;

  const list = template.collection;
  const rows = Array.isArray(adoption?.rows?.[list]) ? adoption.rows[list] : [];
  if (!rows.length) return templateExclusion("rows-empty", { list });
  const rowWhen = plainObject(template?.when?.row) ? template.when.row : {};
  if (Object.values(rowWhen).some(allowed => !Array.isArray(allowed))) {
    return templateExclusion("malformed", { list, field: Object.keys(rowWhen).find(field => !Array.isArray(rowWhen[field])) });
  }
  const conditionMatches = rows.filter(row => contractRowWhenSatisfied({ row: rowWhen }, answers,
    activation.asked, row, activation.facts));
  if (!conditionMatches.length) return templateExclusion("row-condition", { list });
  if (matchingTemplateRows(adoption, template, activation).length) return undefined;
  const fields = [...contractTemplateRowFields(template)];
  const missing = fields.find(field => conditionMatches.every(row => !own(row, field)));
  const incomplete = fields.filter(field => !conditionMatches.every(row => own(row, field)));
  return templateExclusion("row-fields", { list, field: missing ?? incomplete.join(" and ") });
}

export function liveContractTemplates(adoption, pack, {
  expandRows = false,
  activation = contractAdoptionActivation(adoption)
} = {}) {
  const live = [];
  for (const template of Array.isArray(pack?.templates) ? pack.templates : []) {
    if (!plainObject(template)) continue;
    if (contractTemplateExclusion(adoption, template, activation)) continue;
    if (template.expand !== "per-row") {
      live.push(expandRows ? { template } : template);
      continue;
    }
    const matching = matchingTemplateRows(adoption, template, activation);
    if (expandRows) live.push(...matching.map(row => ({ template, row })));
    else if (matching.length) live.push(template);
  }
  return live;
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
  const activation = contractAdoptionActivation(after);
  const { asked } = activation;
  for (const [name, declaration] of Object.entries(after.declares?.values ?? {})) {
    if (own(after.values ?? {}, name) && !activation.activeValues.has(name)) {
      delete after.values[name];
      if (own(before.values ?? {}, name)) changes.push({ parts: ["values", name], remove: true });
    }
  }
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
            || contractRowWhenSatisfied(shape.when, answers, asked, row, activation.facts)) continue;
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
      // A value form, row count, or answer can make a question newly asked.
      // That honest next answer never excuses an independent rule failure.
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
