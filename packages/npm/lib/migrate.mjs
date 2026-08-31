#!/usr/bin/env node

import { evaluateRule, parseRule, validatePackage, validateSchemaDocument } from "./validate-core.mjs";

const NUMBERED_CHAPTER = /^\d\d-[^/\\]+\.md$/;
const JSON_TEXT = value => `${JSON.stringify(value, null, 2)}\n`;
const NEW_RESERVED_FIRST_SEGMENTS = new Set(["values", "ranges", "rules", "runtime", "colors", "contrast", "timing"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function unsupported(message) {
  const cause = new Error(message);
  cause.manual = true;
  return cause;
}

const OPERATOR = new Map([
  ["eq", "=="], ["ne", "!="], ["lt", "<"], ["lte", "<="], ["gt", ">"], ["gte", ">="],
  ["add", "+"], ["sub", "-"], ["mul", "*"], ["div", "/"],
  ["and", "and"], ["or", "or"]
]);
const PRECEDENCE = new Map([["or", 1], ["and", 2], ["not", 3], ["compare", 4], ["+", 5], ["-", 5], ["*", 6], ["/", 6], ["unary", 7], ["primary", 8]]);

function treeReference(node) {
  if (!isObject(node) || typeof node.ref !== "string") return undefined;
  if (!node.ref.startsWith("tuning:")) throw unsupported(`reference ${JSON.stringify(node.ref)} has no v0.7 number-rule form`);
  return node.ref.slice("tuning:".length);
}

function printTree(node, parent = 0) {
  if (typeof node === "number" || typeof node === "boolean") return { text: JSON.stringify(node), precedence: PRECEDENCE.get("primary") };
  const reference = treeReference(node);
  if (reference !== undefined) return { text: reference, precedence: PRECEDENCE.get("primary") };
  if (!isObject(node) || typeof node.op !== "string" || !Array.isArray(node.args)) throw unsupported(`expression node ${JSON.stringify(node)} cannot be printed`);
  const { op, args } = node;
  if (op === "pow") throw unsupported("operator `pow` has no v0.7 number-rule form");

  let text;
  let precedence;
  let operator;
  if (["min", "max", "floor", "ceil", "abs", "mod"].includes(op)) {
    text = `${op}(${args.map(arg => printTree(arg).text).join(", ")})`;
    precedence = PRECEDENCE.get("primary");
  } else if (op === "not") {
    text = `not (${printTree(args[0]).text})`;
    precedence = PRECEDENCE.get("not");
    operator = "not";
  } else if (["strictly-increasing", "nondecreasing"].includes(op)) {
    const symbol = op === "strictly-increasing" ? "<" : "<=";
    text = args.slice(0, -1).map((arg, index) => `${printTree(arg, PRECEDENCE.get("compare")).text} ${symbol} ${printTree(args[index + 1], PRECEDENCE.get("compare")).text}`).join(" and ");
    precedence = PRECEDENCE.get("and");
    operator = "and";
  } else if (op === "all-positive") {
    text = args.map(arg => `${printTree(arg, PRECEDENCE.get("compare")).text} > 0`).join(" and ");
    precedence = PRECEDENCE.get("and");
    operator = "and";
  } else {
    const normalized = op === "all" ? "and" : op === "any" ? "or" : op === "sum" ? "+" : OPERATOR.get(op);
    if (!normalized) throw unsupported(`operator ${JSON.stringify(op)} has no v0.7 number-rule form`);
    precedence = ["==", "!=", "<", "<=", ">", ">="].includes(normalized) ? PRECEDENCE.get("compare") : PRECEDENCE.get(normalized);
    operator = normalized;
    text = args.map((arg, index) => {
      const printed = printTree(arg);
      const sameAssociativeOperator = ["and", "or", "+", "*"].includes(normalized) && printed.operator === normalized;
      const changesAssociation = index > 0 && printed.precedence === precedence && !sameAssociativeOperator;
      return printed.precedence < precedence || changesAssociation ? `(${printed.text})` : printed.text;
    }).join(` ${normalized} `);
  }
  return { text: precedence < parent ? `(${text})` : text, precedence, operator };
}

function evaluateTree(node, values) {
  if (typeof node === "number" || typeof node === "boolean") return node;
  const reference = treeReference(node);
  if (reference !== undefined) {
    if (!own(values, reference)) throw unsupported(`reference ${JSON.stringify(node.ref)} does not name a migrated value`);
    return values[reference];
  }
  const args = node.args.map(arg => evaluateTree(arg, values));
  const op = node.op;
  if (op === "eq") return args[0] === args[1];
  if (op === "ne") return args[0] !== args[1];
  if (op === "lt") return args[0] < args[1];
  if (op === "lte") return args[0] <= args[1];
  if (op === "gt") return args[0] > args[1];
  if (op === "gte") return args[0] >= args[1];
  if (op === "and" || op === "all") return args.every(Boolean);
  if (op === "or" || op === "any") return args.some(Boolean);
  if (op === "not") return !args[0];
  if (op === "add" || op === "sum") return args.reduce((sum, value) => sum + value, 0);
  if (op === "sub") return args[0] - args[1];
  if (op === "mul") return args[0] * args[1];
  if (op === "div") return args[0] / args[1];
  if (op === "min") return Math.min(...args);
  if (op === "max") return Math.max(...args);
  if (op === "floor") return Math.floor(args[0]);
  if (op === "ceil") return Math.ceil(args[0]);
  if (op === "abs") return Math.abs(args[0]);
  if (op === "mod") return args[0] - args[1] * Math.floor(args[0] / args[1]);
  if (op === "strictly-increasing") return args.every((value, index) => index === 0 || args[index - 1] < value);
  if (op === "nondecreasing") return args.every((value, index) => index === 0 || args[index - 1] <= value);
  if (op === "all-positive") return args.every(value => value > 0);
  throw new Error(`cannot evaluate operator ${JSON.stringify(op)}`);
}

function migrateTuning(document, report) {
  const tunables = isObject(document.tunables) ? document.tunables : {};
  const constants = isObject(document.constants) ? document.constants : {};
  const values = { ...tunables };
  for (const [key, value] of Object.entries(constants)) {
    if (own(values, key)) report.manual.push(`tuning.json: ${JSON.stringify(key)} appears in both tunables and constants; kept the tunable value`);
    else values[key] = value;
  }
  for (const key of Object.keys(values)) {
    const segment = key.split(".")[0];
    if (NEW_RESERVED_FIRST_SEGMENTS.has(segment)) {
      report.manual.push(`tuning.json: key ${JSON.stringify(key)} opens with newly reserved segment ${JSON.stringify(segment)}; rename the key and its citations`);
    }
  }
  const ranges = {};
  let mustMatchCount = 0;
  for (const [key, meta] of Object.entries(isObject(document.meta) ? document.meta : {})) {
    if (!isObject(meta)) continue;
    if (own(meta, "range")) ranges[key] = meta.range;
    if (own(meta, "must_match")) mustMatchCount += 1;
    if (own(meta, "ruleset")) report.manual.push(`tuning.json: meta.${key}.ruleset ${JSON.stringify(meta.ruleset)} was removed; preserve the intended ruleset scope in chapter ruleset tags`);
  }
  if (mustMatchCount) report.changes.push({ file: "tuning.json", message: `dropped must_match from ${mustMatchCount} meta entr${mustMatchCount === 1 ? "y" : "ies"}` });

  const rules = {};
  for (const invariant of Array.isArray(document.invariants) ? document.invariants : []) {
    const name = isObject(invariant) && typeof invariant.id === "string" ? invariant.id : "<unnamed>";
    try {
      if (!isObject(invariant) || typeof invariant.id !== "string") throw unsupported(`invariant ${JSON.stringify(invariant)} has no string id`);
      const line = printTree(invariant.assert).text;
      const oldValue = evaluateTree(invariant.assert, values);
      if (typeof oldValue !== "boolean") throw unsupported(`assert is not boolean-valued (got ${typeof oldValue})`);
      const conjuncts = ruleTopLevelParts(line, "and");
      if (conjuncts.length > 1 && conjuncts.every(part => topLevelComparisonCount(part) === 1 && !retiredRuleReason(part))) {
        const valuesAfter = conjuncts.map(part => evaluateRule(parseRule(part), values));
        if (oldValue !== valuesAfter.every(Boolean)) throw new Error(`printer verification failed for ${JSON.stringify(invariant.id)}: tree=${JSON.stringify(oldValue)}, lines=${JSON.stringify(valuesAfter)}`);
        conjuncts.forEach((part, index) => { rules[`${invariant.id}-${index + 1}`] = part; });
        report.changes.push({ file: "tuning.json", message: `split rule ${JSON.stringify(invariant.id)} at top-level and into ${conjuncts.map((_, index) => JSON.stringify(`${invariant.id}-${index + 1}`)).join(", ")}` });
      } else {
        const retired = retiredRuleReason(line);
        if (retired?.startsWith("retired word ")) {
          rules[invariant.id] = line;
          report.manual.push(`tuning.json: rule ${JSON.stringify(invariant.id)} uses ${retired}; rewrite this line by hand: ${JSON.stringify(line)}`);
        } else {
          if (retired) throw unsupported(`${retired}: ${JSON.stringify(line)}`);
          const ast = parseRule(line);
          const newValue = evaluateRule(ast, values);
          if (oldValue !== newValue) throw new Error(`printer verification failed for ${JSON.stringify(invariant.id)}: tree=${JSON.stringify(oldValue)}, line=${JSON.stringify(newValue)}`);
          rules[invariant.id] = line;
        }
      }
      if (own(invariant, "message")) report.changes.push({ file: "tuning.json", message: `dropped message from invariant ${JSON.stringify(invariant.id)}` });
    } catch (cause) {
      if (!cause.manual) throw cause;
      report.manual.push(`tuning.json: dropped rule ${JSON.stringify(name)} because ${cause.message}`);
    }
  }
  const migrated = { values };
  if (Object.keys(ranges).length) migrated.ranges = ranges;
  if (Object.keys(rules).length) migrated.rules = rules;
  return { migrated, clocks: isObject(document.clocks) ? document.clocks : undefined };
}

function stageIfChanged(host, file, text, relative, report, outputs) {
  const before = host.exists(file) && host.isFile(file) ? host.readText(file) : undefined;
  if (before === text) return;
  report.changes.push({ file: relative, message: before === undefined ? "created" : "rewritten" });
  outputs.push({ file, relative, text });
}

function refuse(report, collectOutputs = false) {
  if (collectOutputs) report.refused = true;
  delete report.outputs;
  return report;
}

function readJsonForMigration(host, file, relative, report) {
  const text = host.readText(file);
  try {
    return { text, document: JSON.parse(text) };
  } catch (cause) {
    report.manual.push(`${relative}: could not parse JSON (${cause.message}); fix the file and run migration again`);
    return { text, failed: true };
  }
}

function migratePersonalization(document, ranges, report) {
  if (!isObject(document) || !Array.isArray(document.questions)) return document;
  const migrated = structuredClone(document);
  const rangeFor = key => Array.isArray(ranges[key]) && ranges[key].length === 2 && ranges[key].every(value => typeof value === "number" && Number.isFinite(value)) ? ranges[key] : undefined;
  const checkTarget = (key, value, site) => {
    if (typeof key !== "string" || key.startsWith("contracts.")) return;
    const range = rangeFor(key);
    if (!range) {
      report.manual.push(`personalization.json: ${site} targets ${JSON.stringify(key)} without a migrated range; add a range for \`${key}\`, or drop the assignment`);
    } else if (typeof value === "number" && Number.isFinite(value) && (value < range[0] || value > range[1])) {
      report.manual.push(`personalization.json: ${site} sets ${JSON.stringify(key)} to ${value}, outside its inclusive range [${range[0]}, ${range[1]}]`);
    }
  };
  migrated.questions.forEach((question, questionIndex) => {
    if (!isObject(question)) return;
    const questionName = typeof question.id === "string" ? JSON.stringify(question.id) : `at index ${questionIndex}`;
    if (own(question, "affects")) {
      report.changes.push({ file: "personalization.json", message: `dropped affects from question ${questionName}: ${JSON.stringify(question.affects)}` });
      delete question.affects;
    }
    if (Array.isArray(question.options)) {
      question.options.forEach((option, optionIndex) => {
        if (!isObject(option) || !isObject(option.tuning_overrides)) return;
        option.sets = structuredClone(option.tuning_overrides);
        delete option.tuning_overrides;
        report.changes.push({ file: "personalization.json", message: `renamed questions[${questionIndex}].options[${optionIndex}].tuning_overrides to sets` });
        for (const [key, value] of Object.entries(option.sets)) checkTarget(key, value, `questions[${questionIndex}].options[${optionIndex}].sets`);
      });
    }
    if (question.type !== "number") return;
    if (!Array.isArray(question.resolution)) {
      if (!own(question, "sets")) report.changes.push({ file: "personalization.json", message: `question ${questionName} no longer changes a number; the answer is recorded for the builder` });
      return;
    }
    const operations = structuredClone(question.resolution);
    const direct = operations.length === 1 && isObject(operations[0])
      && operations[0].operation === "replace" && operations[0].operand === "answer" && typeof operations[0].key === "string"
      ? operations[0]
      : undefined;
    if (direct) question.sets = direct.key;
    else delete question.sets;
    if (direct?.out_of_range === "clamp") {
      report.changes.push({ file: "personalization.json", message: `question ${questionName}: an out-of-range answer is now refused, never clamped` });
    }
    if (!direct) {
      report.manual.push(`personalization.json: question ${questionName} used resolution operations ${JSON.stringify(operations)}; write the formula as a rule or a sentence; a number question sets one key`);
    }
    delete question.resolution;
    if (direct) {
      report.changes.push({ file: "personalization.json", message: `replaced question ${questionName} resolution with sets ${JSON.stringify(direct.key)}` });
      checkTarget(direct.key, question.default, `questions[${questionIndex}].sets default`);
    } else {
      report.changes.push({ file: "personalization.json", message: `question ${questionName} no longer changes a number; the answer is recorded for the builder` });
    }
  });
  return migrated;
}

function directionPath(pathText) {
  if (typeof pathText !== "string") return pathText;
  return pathText
    .replace(/^constraints\.colors\./, "colors.")
    .replace(/^constraints\.thresholds\./, "contrast.")
    .replace(/^constraints\.timing\./, "timing.");
}

function rewriteDirectionText(text, moodNames = new Map(), report, file) {
  let result = text
    .replace(/descriptor:mood:([a-z0-9]+(?:-[a-z0-9]+)*)/g, "mood.$1")
    .replace(/descriptors\.mood\.([a-z0-9]+(?:-[a-z0-9]+)*)/g, "mood.$1")
    .replace(/constraints\.colors\.([a-z0-9]+(?:-[a-z0-9]+)*)/g, "colors.$1")
    .replace(/constraints\.thresholds\.([a-z0-9]+(?:-[a-z0-9]+)*)/g, "contrast.$1")
    .replace(/constraints\.timing\.([a-z0-9]+(?:-[a-z0-9]+)*)/g, "timing.$1")
    .replace(/palette:([a-z0-9.-]+)/g, "palette.$1");
  if (moodNames.size) {
    const locals = [...moodNames.keys()].sort((left, right) => right.length - left.length);
    const alternation = locals.map(local => local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = new RegExp(`mood\\.(${alternation})(?![A-Za-z0-9_-])`, "g");
    const rewritten = new Set();
    result = result.replace(pattern, (_citation, local) => {
      rewritten.add(local);
      return `mood.${moodNames.get(local)}`;
    });
    if (report && file) for (const [local, id] of moodNames) {
      if (rewritten.has(local)) report.changes.push({ file, message: `rewrote mood citation ${JSON.stringify(`mood.${local}`)} to ${JSON.stringify(`mood.${id}`)}` });
    }
  }
  return result;
}

function firstMedia(media, label, report) {
  if (!Array.isArray(media) || media.length === 0 || !isObject(media[0])) return {};
  if (media.length > 1) {
    const dropped = media.slice(1).map((entry, index) => isObject(entry) && typeof entry.path === "string" ? entry.path : `${label}.media[${index + 1}]`);
    report.manual.push(`${label}: only the first media entry became image/license; move or remove the remaining ${media.length - 1}: ${dropped.map(value => JSON.stringify(value)).join(", ")}`);
  }
  return { image: media[0].path, license: media[0].license };
}

function migrateAntiReference(entry, label, report) {
  if (typeof entry === "string") return entry;
  if (!isObject(entry)) return entry;
  if (own(entry, "not")) return structuredClone(entry);
  const media = firstMedia(entry.media, label, report);
  return own(media, "image") ? { not: entry.description, ...media } : entry.description;
}

function migrateBorrow(entry, label, report) {
  if (!isObject(entry)) return entry;
  return { from: entry.description, what: entry.borrows, ...firstMedia(entry.media, label, report) };
}

function migrateFence(text, moodNames, report, file) {
  return text.replace(/```direction[^\r\n]*\r?\n([\s\S]*?)```(?:[ \t]*\r?\n)*/gi, (_whole, body) => {
    const lines = body.split(/\r?\n/);
    const delegated = lines.find(line => line.trim() === "> DELEGATED: presentation-direction") ?? "> DELEGATED: presentation-direction";
    const bullets = [];
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^- `([^`]+)`\s*$/.exec(lines[index]);
      if (!match) continue;
      const rationale = [];
      while (index + 1 < lines.length && /^ {2}\S/.test(lines[index + 1])) rationale.push(lines[++index].trim());
      const oldCitation = match[1];
      const citation = rewriteDirectionText(directionPath(oldCitation), moodNames);
      if (citation !== oldCitation) report.changes.push({ file, message: `rewrote fence citation ${JSON.stringify(oldCitation)} to ${JSON.stringify(citation)}` });
      bullets.push(`- \`${citation}\`${rationale.length ? `: ${rewriteDirectionText(rationale.join(" "), moodNames)}` : ""}`);
    }
    return `${delegated}\n\n${bullets.join("\n")}\n\n`;
  });
}

function migrateDirectionDocument(manifest, oldDirection, report) {
  const source = isObject(oldDirection) ? oldDirection : {};
  const result = {};
  if (own(source, "semantics")) report.changes.push({ file: "direction.json", message: "dropped semantics" });
  if (own(manifest, "palette")) result.palette = manifest.palette;
  else if (own(source, "palette")) result.palette = source.palette;

  const descriptors = new Map();
  for (const descriptor of Array.isArray(manifest?.descriptors?.mood) ? manifest.descriptors.mood : []) {
    if (!isObject(descriptor) || typeof descriptor.id !== "string") continue;
    const mood = { intent: descriptor.intent };
    if (Array.isArray(descriptor.references)) mood.borrows = descriptor.references.map((entry, index) => migrateBorrow(entry, `manifest.json descriptors.mood.${descriptor.id}.references[${index}]`, report));
    mood.anti = (Array.isArray(descriptor.anti) ? descriptor.anti : []).map((entry, index) => migrateAntiReference(entry, `manifest.json descriptors.mood.${descriptor.id}.anti[${index}]`, report));
    if (own(descriptor, "palette")) mood.palette = typeof descriptor.palette === "string" && !descriptor.palette.startsWith("palette.") ? `palette.${descriptor.palette}` : descriptor.palette;
    if (own(descriptor, "behaviors")) report.changes.push({ file: "manifest.json", message: `dropped behaviors from mood ${JSON.stringify(descriptor.id)}` });
    descriptors.set(descriptor.id, mood);
  }

  const pool = isObject(source.references) ? source.references : {};
  const consumedPool = new Set();
  const moodNames = new Map();
  for (const [local, wrapper] of Object.entries(isObject(source.mood) ? source.mood : {})) {
    const token = isObject(wrapper) && typeof wrapper.descriptor === "string" ? /^descriptor:mood:(.+)$/.exec(wrapper.descriptor) : undefined;
    const id = token?.[1] ?? local;
    if (local !== id) moodNames.set(local, id);
    if (isObject(wrapper) && own(wrapper, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from mood.${local}` });
    const mood = descriptors.get(id) ?? (isObject(wrapper) && own(wrapper, "intent") ? structuredClone(wrapper) : undefined);
    if (!mood) {
      report.manual.push(`direction.json: mood.${local} names ${JSON.stringify(id)} but no matching manifest descriptor exists`);
      continue;
    }
    if (typeof mood.palette === "string" && !mood.palette.startsWith("palette.")) mood.palette = `palette.${mood.palette}`;
    if (Array.isArray(wrapper?.references)) {
      mood.borrows ??= [];
      for (const ref of wrapper.references) {
        if (!own(pool, ref)) { report.manual.push(`direction.json: mood.${local}.references cites missing pool entry ${JSON.stringify(ref)}`); continue; }
        mood.borrows.push(migrateBorrow(pool[ref], `direction.json references.${ref}`, report));
        consumedPool.add(ref);
        report.changes.push({ file: "direction.json", message: `moved references.${ref} into mood.${id}.borrows` });
      }
    }
    descriptors.set(id, mood);
  }
  if (isObject(source.pillars)) {
    const ordered = Object.entries(source.pillars).map(([key, entry], index) => ({ key, entry, index }))
      .sort((left, right) => ((left.entry?.tie_break_order ?? Infinity) - (right.entry?.tie_break_order ?? Infinity)) || left.index - right.index);
    result.pillars = Object.fromEntries(ordered.map(({ key, entry }) => {
      if (isObject(entry) && Array.isArray(entry.references)) for (const ref of entry.references) report.manual.push(`direction.json: reference ${JSON.stringify(ref)} cited by pillars.${key}: move it into a mood's borrows or into prose`);
      if (isObject(entry) && own(entry, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from pillars.${key}` });
      if (isObject(entry) && own(entry, "tie_break_order")) report.changes.push({ file: "direction.json", message: `used and dropped tie_break_order from pillars.${key}` });
      return [key, isObject(entry) ? entry.statement : entry];
    }));
  }
  if (descriptors.size) result.mood = Object.fromEntries(descriptors);
  if (isObject(source.anti)) {
    result.anti = Object.fromEntries(Object.entries(source.anti).map(([key, entry]) => {
      if (isObject(entry) && own(entry, "observable")) report.changes.push({ file: "direction.json", message: `dropped observable from anti.${key}` });
      if (isObject(entry) && own(entry, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from anti.${key}` });
      if (isObject(entry) && Array.isArray(entry.references)) for (const ref of entry.references) report.manual.push(`direction.json: reference ${JSON.stringify(ref)} cited by anti.${key}: move it into a mood's borrows or into prose`);
      return [key, migrateAntiReference(entry, `direction.json anti.${key}`, report)];
    }));
  }
  if (isObject(source.must_keep)) {
    result.must_keep = Object.fromEntries(Object.entries(source.must_keep).map(([key, entry]) => {
      if (isObject(entry) && Array.isArray(entry.may_vary)) report.changes.push({ file: "direction.json", message: `dropped may_vary from must_keep.${key}: ${JSON.stringify(entry.may_vary)}` });
      for (const field of ["observable", "viewing"]) if (isObject(entry) && own(entry, field)) report.changes.push({ file: "direction.json", message: `dropped ${field} from must_keep.${key}` });
      if (isObject(entry) && Array.isArray(entry.references)) for (const ref of entry.references) report.manual.push(`direction.json: reference ${JSON.stringify(ref)} cited by must_keep.${key}: move it into a mood's borrows or into prose`);
      return [key, isObject(entry) ? entry.statement : entry];
    }));
  }

  for (const [key, entry] of Object.entries(pool)) if (!consumedPool.has(key)) report.manual.push(`direction.json: unconsumed references.${key}: ${JSON.stringify(entry)}`);

  const viewingEntries = Object.entries(isObject(source.viewing) ? source.viewing : {});
  if (isObject(source.viewing) && typeof source.viewing.speed_and_size === "string") {
    result.viewing = structuredClone(source.viewing);
  } else if (viewingEntries.length) {
    const counts = new Map(viewingEntries.map(([key]) => [key, 0]));
    const countViewing = entry => { if (isObject(entry) && typeof entry.viewing === "string" && counts.has(entry.viewing)) counts.set(entry.viewing, counts.get(entry.viewing) + 1); };
    for (const group of [source.pillars, source.mood, source.anti, source.must_keep, source.constraints?.colors, source.constraints?.thresholds, source.constraints?.timing]) for (const entry of Object.values(isObject(group) ? group : {})) countViewing(entry);
    const chosen = viewingEntries.reduce((best, item) => counts.get(item[0]) > counts.get(best[0]) ? item : best);
    const [key, entry] = chosen;
    result.viewing = { speed_and_size: entry.speed_and_size, calibration: entry.calibration };
    if (own(entry, "sequence_context")) result.viewing.sequence = entry.sequence_context;
    for (const field of ["hide_builder_name", "judge_qualifications"]) if (own(entry, field)) report.changes.push({ file: "direction.json", message: `dropped viewing.${key}.${field}` });
    if (viewingEntries.length > 1) report.manual.push(`direction.json: kept viewing.${key} ${JSON.stringify(result.viewing)}; other viewing entries require manual consolidation: ${viewingEntries.filter(([other]) => other !== key).map(([other]) => other).join(", ")}`);
  }

  const constraints = isObject(source.constraints) ? source.constraints : {};
  if (isObject(constraints.colors)) result.colors = Object.fromEntries(Object.entries(constraints.colors).map(([key, entry]) => {
    const scope = isObject(entry?.scope) ? entry.scope : {};
    if (own(scope, "sampling")) report.changes.push({ file: "direction.json", message: `dropped sampling from colors.${key}` });
    if (own(entry ?? {}, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from colors.${key}` });
    const migrated = { is: typeof entry?.color === "string" ? entry.color.replace(/^palette:/, "palette.") : entry?.color, within: entry?.tolerance, where: scope.applies_to };
    if (Array.isArray(scope.states)) migrated.while = scope.states;
    return [key, migrated];
  }));
  if (isObject(constraints.thresholds)) result.contrast = Object.fromEntries(Object.entries(constraints.thresholds).map(([key, entry]) => {
    const scope = isObject(entry?.scope) ? entry.scope : {};
    const aggregate = scope?.sampling?.sampled?.verdict?.aggregate;
    if (isObject(aggregate)) report.manual.push(`direction.json: dropped sampled aggregate verdict from contrast.${key}; its covering test now carries the measurement in \`holds\` ${JSON.stringify(aggregate)}`);
    else if (own(scope, "sampling")) report.changes.push({ file: "direction.json", message: `dropped sampling from contrast.${key}` });
    if (own(entry ?? {}, "metric")) report.changes.push({ file: "direction.json", message: `dropped metric from contrast.${key}` });
    if (own(entry ?? {}, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from contrast.${key}` });
    const migrated = { colors: (Array.isArray(entry?.colors) ? entry.colors : []).map(value => typeof value === "string" ? value.replace(/^palette:/, "palette.") : value), against: typeof entry?.against === "string" ? entry.against.replace(/^palette:/, "palette.") : entry?.against, at_least: entry?.min_contrast, where: scope.applies_to };
    if (Array.isArray(scope.states)) migrated.while = scope.states;
    return [key, migrated];
  }));
  if (isObject(constraints.timing)) result.timing = Object.fromEntries(Object.entries(constraints.timing).map(([key, entry]) => {
    const scope = isObject(entry?.scope) ? entry.scope : {};
    if (own(scope, "sampling")) report.changes.push({ file: "direction.json", message: `dropped sampling from timing.${key}` });
    if (own(entry ?? {}, "viewing")) report.changes.push({ file: "direction.json", message: `dropped viewing from timing.${key}` });
    const migrated = { key: typeof entry?.key === "string" ? entry.key.replace(/^tuning:/, "") : entry?.key, where: scope.applies_to };
    if (Array.isArray(scope.states)) migrated.while = scope.states;
    return [key, migrated];
  }));
  if (!isObject(constraints.colors) && isObject(source.colors)) result.colors = structuredClone(source.colors);
  if (!isObject(constraints.thresholds) && isObject(source.contrast)) result.contrast = structuredClone(source.contrast);
  if (!isObject(constraints.timing) && isObject(source.timing)) result.timing = structuredClone(source.timing);
  if (result.viewing) {
    const viewing = result.viewing;
    delete result.viewing;
    result.viewing = viewing;
  }
  return { result, moodNames };
}

function legacyDirectionShape(manifest, direction, chapterTexts) {
  return own(manifest, "palette") || own(manifest, "descriptors") || own(direction ?? {}, "constraints") || own(direction ?? {}, "semantics") ||
    Object.values(direction?.mood ?? {}).some(entry => isObject(entry) && own(entry, "descriptor")) || chapterTexts.some(([, text]) => /```direction/i.test(text));
}

const RUNTIME_REWRITES = [
  [/state:number:([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/g, groups => `runtime.${groups[0]}`],
  [/state:member:(?!ruleset:)([A-Za-z0-9_-]+):([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/g, groups => `runtime.${groups[0]}.${groups[1]}`],
  [/state:member:([A-Za-z0-9_-]+)\.([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/g, groups => `runtime.${groups[0]}.${groups[1]}`]
];

function rewriteRuntimeChunk(text, report, file) {
  for (const match of text.matchAll(/state:member:ruleset:([A-Za-z0-9_.-]+)/g)) {
    report.manual.push(`${file}: ${JSON.stringify(match[0])} has no v0.7 form; write the condition as a sentence`);
  }
  for (const match of text.matchAll(/collections:[A-Za-z0-9_-]+:count/g)) report.manual.push(`${file}: ${JSON.stringify(match[0])} is retired; rewrite the count as ordinary prose`);
  let result = text;
  for (const [pattern, replacement] of RUNTIME_REWRITES) {
    result = result.replace(pattern, (whole, ...groups) => {
      const migrated = replacement(groups);
      report.changes.push({ file, message: `rewrote ${JSON.stringify(whole)} as ${JSON.stringify(migrated)}` });
      return migrated;
    });
  }
  return result;
}

function rewriteRuntimeText(text, report, file) {
  let result = "";
  let cursor = 0;
  for (const fence of text.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)```/g)) {
    result += rewriteRuntimeChunk(text.slice(cursor, fence.index), report, file);
    const language = fence[1].trim().split(/\s+/)[0].toLowerCase();
    if (language === "fantasy") {
      for (const match of fence[2].matchAll(/state:(?:number|member):[A-Za-z0-9_.:-]+/g)) report.manual.push(`${file}: fantasy line carries ${JSON.stringify(match[0])}; remove the runtime address from the fantasy line`);
      result += rewriteRuntimeChunk(fence[0], report, file);
    } else {
      // Test blocks migrate structurally below so replay stays opaque. Contract
      // cores and every other code fragment are outside this phase's authority.
      result += fence[0];
    }
    cursor = fence.index + fence[0].length;
  }
  return result + rewriteRuntimeChunk(text.slice(cursor), report, file);
}

function rewriteRuntimeValue(value, report, file, pointer = "#", insideReplay = false) {
  if (insideReplay) return structuredClone(value);
  if (typeof value === "string") return rewriteRuntimeText(value, report, `${file} ${pointer}`);
  if (Array.isArray(value)) return value.map((item, index) => rewriteRuntimeValue(item, report, file, `${pointer}/${index}`));
  if (!isObject(value)) return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = rewriteRuntimeValue(item, report, file, `${pointer}/${key}`, key === "replay");
  return result;
}

function migrateClocks(document, report) {
  if (!isObject(document)) return document;
  if (!own(document, "modes") && !own(document, "clocks")) return structuredClone(document);
  const modes = Array.isArray(document.modes) ? document.modes.filter(mode => typeof mode === "string") : [];
  const words = new Map([["advances", "running"], ["frozen", "paused"], ["discrete-only", "steps"], ["does-not-exist", "none"]]);
  const result = {};
  for (const [name, clock] of Object.entries(isObject(document.clocks) ? document.clocks : {})) {
    if (!isObject(clock)) { result[name] = clock; continue; }
    const migrated = { unit: clock.unit };
    if (Array.isArray(clock.governs)) migrated.advances = clock.governs.map(value => typeof value === "string" ? rewriteRuntimeText(value, report, "clocks.json") : value);
    const oldModes = isObject(clock.behavior) ? clock.behavior : {};
    migrated.modes = {};
    for (const mode of modes) {
      if (own(oldModes, mode)) migrated.modes[mode] = words.get(oldModes[mode]) ?? oldModes[mode];
      else {
        migrated.modes[mode] = "none";
        report.changes.push({ file: "clocks.json", message: `filled clock ${JSON.stringify(name)} missing mode ${JSON.stringify(mode)} with "none"` });
      }
    }
    for (const [mode, word] of Object.entries(oldModes)) if (!own(migrated.modes, mode)) migrated.modes[mode] = words.get(word) ?? word;
    result[name] = migrated;
  }
  report.changes.push({ file: "clocks.json", message: "reshaped root modes/clocks into the v0.7 clock map" });
  return result;
}

function inferField(values, report, field) {
  const present = values.filter(value => value !== undefined && value !== null);
  if (present.length && present.every(Number.isInteger)) return { type: "integer" };
  if (present.length && present.every(value => typeof value === "number" && Number.isFinite(value))) return { type: "number" };
  if (present.length && present.every(value => typeof value === "string")) return { type: "string" };
  if (present.length && present.every(Array.isArray)) {
    const grids = present.every(value => value.length > 0 && value.every(row => typeof row === "string") && new Set(value.map(row => [...row].length)).size === 1);
    if (grids) return { type: "grid" };
    const objectLists = present.every(value => value.every(isObject));
    const items = present.flat();
    if (objectLists && items.length) {
      const keys = [...new Set(items.flatMap(item => Object.keys(item)))].sort();
      const of = {};
      for (const key of keys) {
        const inferred = inferField(items.map(item => item[key]), report, `${field}.${key}`);
        if (inferred) of[key] = inferred;
      }
      if (Object.keys(of).length) return { type: "list", of };
    }
    report.manual.push(`${field}: cannot infer a record field from ${JSON.stringify(present)}; string arrays are grids only when non-empty with equal-length rows, and lists contain objects`);
    return undefined;
  }
  const reason = present.some(value => typeof value === "boolean") ? "the record grammar has no boolean type" : "the values do not share an inferable field type";
  report.manual.push(`${field}: ${reason}; kept the record value ${JSON.stringify(present[0])} and omitted the field from the inferred schema so validation exposes it`);
  return undefined;
}

function readDrawer(host, packageRoot, drawer, report) {
  const directory = host.path.join(packageRoot, "collections", drawer);
  const records = [];
  if (!host.exists(directory) || !host.isDirectory(directory)) return { drawer, directory, records, schema: {}, hadSchema: false };
  for (const entry of host.readDir(directory).filter(item => item.isFile && item.name.endsWith(".json") && item.name !== "_collection.json").sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `collections/${drawer}/${entry.name}`;
    const parsed = readJsonForMigration(host, host.path.join(directory, entry.name), relative, report);
    if (parsed.failed) return { failed: true };
    records.push({ id: entry.name.slice(0, -5), value: parsed.document });
  }
  const labelFile = host.path.join(directory, "_collection.json");
  if (!host.exists(labelFile)) return { drawer, directory, records, schema: {}, hadSchema: false, labelFile };
  const parsed = readJsonForMigration(host, labelFile, `collections/${drawer}/_collection.json`, report);
  if (parsed.failed) return { failed: true };
  return { drawer, directory, records, schema: isObject(parsed.document?.record) ? structuredClone(parsed.document.record) : {}, hadSchema: isObject(parsed.document?.record), labelFile };
}

function ensureClosedSchema(drawerInfo, report, knownReferenceFields = new Set()) {
  if (drawerInfo.hadSchema || drawerInfo.schemaInferred) return;
  const rows = drawerInfo.records.map(record => record.value).filter(isObject);
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].sort();
  for (const key of keys) {
    if (knownReferenceFields.has(key)) continue;
    const inferred = inferField(rows.map(row => row[key]), report, `collections/${drawerInfo.drawer}.${key}`);
    if (inferred) drawerInfo.schema[key] = inferred;
  }
  drawerInfo.schemaInferred = true;
  report.changes.push({ file: `collections/${drawerInfo.drawer}/_collection.json`, message: `inferred a closed schema for existing fields: ${keys.join(", ") || "(none)"}` });
}

function migrateGraphs(host, packageRoot, manifest, planText, report, outputs) {
  if (!Array.isArray(manifest.graphs)) return planText;
  const drawers = new Map();
  const getDrawer = name => {
    if (!drawers.has(name)) drawers.set(name, readDrawer(host, packageRoot, name, report));
    return drawers.get(name);
  };
  const sites = new Map();
  const knownReferenceFields = new Map();
  const markKnownReference = (drawer, field) => {
    const fields = knownReferenceFields.get(drawer) ?? new Set();
    fields.add(field);
    knownReferenceFields.set(drawer, fields);
  };
  for (const set of manifest.graphs) {
    if (!isObject(set) || !Array.isArray(set.edges)) continue;
    for (const edge of set.edges) {
      const targets = Array.isArray(edge?.to) ? edge.to.filter(isObject).map(item => item.collection).filter(value => typeof value === "string") : [];
      if (!isObject(edge?.from) || typeof edge.from.collection !== "string" || typeof edge.field !== "string" || targets.length !== 1 || own(edge, "discriminator")) continue;
      if (!edge.field.startsWith("/")) markKnownReference(edge.from.collection, edge.field);
      if (isObject(set.inverse) && typeof set.inverse.field === "string") markKnownReference(targets[0], set.inverse.field);
    }
  }
  for (const set of manifest.graphs) {
    if (!isObject(set) || !Array.isArray(set.edges)) continue;
    for (const edge of set.edges) {
      if (!isObject(edge) || !isObject(edge.from) || typeof edge.from.collection !== "string" || typeof edge.field !== "string") continue;
      const targets = Array.isArray(edge.to) ? edge.to.filter(isObject).map(item => item.collection).filter(value => typeof value === "string") : [];
      if (targets.length !== 1 || own(edge, "discriminator")) {
        report.manual.push(`manifest.json: graph ${JSON.stringify(set.id)} field ${JSON.stringify(edge.field)} has ${targets.length === 1 ? "a discriminator" : "several or no targets"}; split it into one reference field per target drawer`);
        continue;
      }
      const from = getDrawer(edge.from.collection);
      if (from.failed) return { failed: true, text: planText };
      ensureClosedSchema(from, report, knownReferenceFields.get(from.drawer));
      const wildcard = /^\/([^/]+)\/\*\/([^/]+)$/.exec(edge.field);
      let field;
      if (wildcard) {
        const [, listName, referenceName] = wildcard;
        const items = from.records.flatMap(record => Array.isArray(record.value?.[listName]) ? record.value[listName].filter(isObject) : []);
        const keys = [...new Set(items.flatMap(item => Object.keys(item)))].sort();
        const of = {};
        for (const key of keys) {
          const inferred = key === referenceName ? { type: "link", to: targets[0] } : inferField(items.map(item => item[key]), report, `collections/${from.drawer}.${listName}.${key}`);
          if (inferred) of[key] = inferred;
        }
        from.schema[listName] = { ...(isObject(from.schema[listName]) ? from.schema[listName] : {}), type: "list", of };
        field = `${listName}.${referenceName}`;
        report.changes.push({ file: `collections/${from.drawer}/_collection.json`, message: `inferred list/of schema for ${listName}: ${JSON.stringify(of)}` });
      } else if (!edge.field.startsWith("/")) {
        const many = from.records.some(record => Array.isArray(record.value?.[edge.field]));
        const definition = { ...(isObject(from.schema[edge.field]) ? from.schema[edge.field] : {}), type: "link", to: targets[0], ...(many ? { many: true } : {}) };
        delete definition.of;
        delete definition.options;
        delete definition.pattern;
        from.schema[edge.field] = definition;
        field = edge.field;
      } else {
        report.manual.push(`manifest.json: graph ${JSON.stringify(set.id)} field ${JSON.stringify(edge.field)} is a JSON Pointer outside the supported /<list>/*/<field> migration form`);
        continue;
      }
      const siteList = sites.get(set.id) ?? [];
      siteList.push({ from, field, rootField: wildcard ? wildcard[1] : field, nestedField: wildcard?.[2], target: targets[0] });
      sites.set(set.id, siteList);
      if (isObject(set.inverse) && typeof set.inverse.field === "string") {
        const definition = wildcard ? from.schema[wildcard[1]].of[wildcard[2]] : from.schema[field];
        definition.mirrored_by = set.inverse.field;
        const target = getDrawer(targets[0]);
        if (target.failed) return { failed: true, text: planText };
        ensureClosedSchema(target, report, knownReferenceFields.get(target.drawer));
        const many = target.records.some(record => Array.isArray(record.value?.[set.inverse.field]));
        const reverse = { ...(isObject(target.schema[set.inverse.field]) ? target.schema[set.inverse.field] : {}), type: "reference", to: from.drawer, ...(many ? { many: true } : {}) };
        delete reverse.of;
        delete reverse.options;
        delete reverse.pattern;
        target.schema[set.inverse.field] = reverse;
      }
    }
  }
  let text = planText;
  let removedGraphTest = false;
  const removedTestIds = [];
  const headings = [...text.matchAll(/^#{1,6}\s+AT-\d+\b.*$/gm)];
  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    const section = text.slice(start, end);
    const block = /```test[^\r\n]*\r?\n([\s\S]*?)```/.exec(section);
    if (!block) continue;
    let descriptor;
    try { descriptor = JSON.parse(block[1]); } catch { continue; }
    if (descriptor.rule_set !== "opengdd-graph-1") continue;
    for (const rule of Array.isArray(descriptor.rules) ? descriptor.rules : []) {
      const siteList = sites.get(rule?.edge_set) ?? [];
      if (rule?.predicate === "acyclic" && siteList.length === 1) {
        const site = siteList[0];
        const definition = site.nestedField ? site.from.schema[site.rootField].of[site.nestedField] : site.from.schema[site.rootField];
        definition.loops = false;
      } else if (rule?.predicate === "acyclic" && siteList.length !== 1) {
        report.manual.push(`05-build-plan.md: acyclic graph rule ${JSON.stringify(rule)} ${siteList.length ? "crosses several reference fields" : "has no migrated reference field"} and has no v0.7 field-local form; write the condition as a sentence`);
      } else if (rule?.predicate === "monotone-attribute-along-path") report.manual.push(`05-build-plan.md: retired graph rule requires a sentence: ${JSON.stringify(rule)}`);
    }
    report.changes.push({ file: "05-build-plan.md", message: `removed ${headings[index][0]} using opengdd-graph-1` });
    const removedId = /\bAT-\d+\b/.exec(headings[index][0])?.[0];
    if (removedId) removedTestIds.push(removedId);
    text = text.slice(0, start) + text.slice(end);
    removedGraphTest = true;
  }
  if (removedGraphTest) text = text.replace(/\n+$/, "\n");
  for (const id of removedTestIds) {
    if (new RegExp(`\\b${id}\\b`).test(text)) report.manual.push(`05-build-plan.md: removed test id ${id} is still named in chapter prose; update that sentence`);
  }
  for (const info of drawers.values()) {
    if (info.failed || !info.hadSchema && Object.keys(info.schema).length === 0) continue;
    stageIfChanged(host, info.labelFile, JSON_TEXT({ record: info.schema }), `collections/${info.drawer}/_collection.json`, report, outputs);
  }
  delete manifest.graphs;
  report.changes.push({ file: "manifest.json", message: "removed graphs after moving links to drawer schemas" });
  return { text };
}

function migrateTestBlocks(text, report, file) {
  return text.replace(/```test([^\r\n]*)\r?\n([\s\S]*?)```/g, (whole, suffix, body, offset, source) => {
    let descriptor;
    try { descriptor = JSON.parse(body); } catch { return whole; }
    if (descriptor.type === "document-check") {
      report.manual.push(`${file}: a document-check is a rule on the data or prose; delete or rewrite: ${JSON.stringify(descriptor)}`);
      return whole;
    }
    const migrated = rewriteRuntimeValue(descriptor, report, file);
    if (own(migrated, "freeze_invariant")) {
      const freeze = migrated.freeze_invariant;
      migrated.unchanged = isObject(freeze) ? { values: freeze.references, modes: freeze.modes } : freeze;
      delete migrated.freeze_invariant;
      report.changes.push({ file, message: "renamed freeze_invariant references to unchanged values" });
    }
    if (migrated.type === "property") {
      if (own(migrated, "invariant")) {
        if (!own(migrated, "holds")) migrated.holds = migrated.invariant;
        delete migrated.invariant;
        report.changes.push({ file, message: "renamed property invariant to holds" });
      }
      const oldVerdict = migrated.verdict;
      if (oldVerdict === "per-sample") migrated.applies_to = "every-sample";
      else if (oldVerdict === "aggregate") migrated.applies_to = "the-average";
      if (own(migrated, "verdict")) {
        delete migrated.verdict;
        report.changes.push({ file, message: `renamed property verdict ${JSON.stringify(oldVerdict)} to applies_to ${JSON.stringify(migrated.applies_to)}` });
      }

      const collectedSeeds = [];
      const addSeeds = seeds => {
        if (!Array.isArray(seeds)) return;
        for (const seed of seeds) if (!collectedSeeds.includes(seed)) collectedSeeds.push(seed);
      };
      if (isObject(migrated.sampling)) addSeeds(migrated.sampling.seed_set);
      addSeeds(migrated.seed_set);
      if (collectedSeeds.length) migrated.seeds = collectedSeeds;
      if (own(migrated, "seed_set")) {
        delete migrated.seed_set;
        report.changes.push({ file, message: "renamed top-level property seed_set to seeds" });
      }
      if (own(migrated, "sampling")) {
        if (migrated.sampling === "exhaustive") {
          report.changes.push({ file, message: 'dropped property sampling "exhaustive"; absence walks the domain whole' });
        } else if (isObject(migrated.sampling)) {
          const planFields = Object.keys(migrated.sampling).filter(key => key !== "seed_set");
          if (planFields.length) report.changes.push({ file, message: `dropped property sampling plan fields ${JSON.stringify(planFields)}; sample counts are the runner profile's` });
          if (own(migrated.sampling, "seed_set")) report.changes.push({ file, message: "moved property sampling.seed_set to seeds" });
        } else {
          report.changes.push({ file, message: `dropped property sampling ${JSON.stringify(migrated.sampling)}; the runner profile owns how a claim is measured` });
        }
        delete migrated.sampling;
      }

      const measurementFields = ["metric", "aggregation", "threshold"].filter(key => own(migrated, key));
      if (oldVerdict === "aggregate" && measurementFields.length) {
        const measurement = { aggregation: migrated.aggregation, metric: migrated.metric, threshold: migrated.threshold };
        const threshold = migrated.threshold;
        const words = new Map([["gte", "at least"], ["lte", "at most"], ["eq", "equal to"], ["lt", "below"], ["gt", "above"]]);
        if (isObject(migrated.aggregation) && migrated.aggregation.type === "histogram") {
          report.manual.push(`${file}: property histogram measurement requires a runner-profile rewrite: ${JSON.stringify(measurement)}`);
        } else if (typeof migrated.holds === "string" && typeof migrated.aggregation === "string" && typeof migrated.metric === "string" && isObject(threshold) && words.has(threshold.op) && own(threshold, "value")) {
          migrated.holds = `${migrated.holds} — measured as ${migrated.aggregation} of ${migrated.metric} ${words.get(threshold.op)} ${threshold.value}`;
          report.changes.push({ file, message: `folded aggregate measurement into property holds: ${JSON.stringify(measurement)}` });
        } else {
          report.manual.push(`${file}: property aggregate measurement could not be folded automatically: ${JSON.stringify(measurement)}`);
        }
      }
      if (oldVerdict === "aggregate") {
        const followingLines = source.slice(offset + whole.length).replace(/^\r?\n/, "").split(/\r?\n/).slice(0, 5);
        const staleLine = followingLines.find(line => /aggregate oracle|repeats/i.test(line));
        if (staleLine) report.changes.push({ file, message: `aggregate property test is followed by stale prose ${JSON.stringify(staleLine.trim())}; update that sentence for the runner-owned measurement` });
      }
      if (measurementFields.length) {
        for (const key of measurementFields) delete migrated[key];
        report.changes.push({ file, message: `dropped property measurement fields ${JSON.stringify(measurementFields)}; the runner profile owns how a claim is measured` });
      }
      migrated.type = "general";
      if (typeof migrated.domain === "string") migrated.scope = migrated.domain;
      else if (isObject(migrated.domain)) {
        migrated.scope = objectScope(migrated.domain);
        report.manual.push(`${file}: review mechanically written general scope ${JSON.stringify(migrated.scope)} from object domain ${JSON.stringify(migrated.domain)}`);
      }
      if (own(migrated, "domain")) {
        delete migrated.domain;
        report.changes.push({ file, message: "renamed property domain to general scope" });
      }
      if (own(migrated, "applies_to")) {
        report.changes.push({ file, message: `dropped applies_to ${JSON.stringify(migrated.applies_to)}; the holds sentence now states whether the claim is per case or across a measure` });
        delete migrated.applies_to;
      }
    } else if (migrated.type === "exhaustive-search") {
      const initial = Array.isArray(migrated.initial_states) ? migrated.initial_states.join("; ") : String(migrated.initial_states ?? "");
      const limit = boundScope(migrated.bound);
      const general = {
        type: "general",
        scope: `every state reachable from ${initial}${limit ? `, within ${limit}` : ""}`,
        holds: migrated.predicate
      };
      for (const key of ["diagnostics", "direction_claims", "unchanged", "replay", "target", "tolerance", "extensions"]) if (own(migrated, key)) general[key] = migrated[key];
      const dropped = ["initial_states", "transitions", "predicate", "finite_state", "complete", "bound"].filter(key => own(migrated, key));
      report.changes.push({ file, message: `rewrote exhaustive-search as general; dropped ${dropped.join(", ")}` });
      report.manual.push(`${file}: review migrated exhaustive-search scope ${JSON.stringify(general.scope)} and holds ${JSON.stringify(general.holds)}`);
      Object.keys(migrated).forEach(key => delete migrated[key]);
      Object.assign(migrated, general);
    } else if (migrated.type === "general" && own(migrated, "applies_to")) {
      report.changes.push({ file, message: `dropped applies_to ${JSON.stringify(migrated.applies_to)}; the holds sentence now states whether the claim is per case or across a measure` });
      delete migrated.applies_to;
    }
    if (JSON.stringify(migrated) === JSON.stringify(descriptor)) return whole;
    return `\`\`\`test${suffix}\n${JSON.stringify(migrated, null, 2)}\n\`\`\``;
  });
}

function stagedValidationHost(host, outputs) {
  const staged = new Map(outputs.map(output => [host.path.resolve(output.file), output.text]));
  const encoder = new TextEncoder();
  return {
    ...host,
    exists(file) { return staged.has(host.path.resolve(file)) || host.exists(file); },
    isFile(file) { return staged.has(host.path.resolve(file)) || host.isFile(file); },
    isDirectory(file) { return !staged.has(host.path.resolve(file)) && host.isDirectory(file); },
    isSymbolicLink(file) { return staged.has(host.path.resolve(file)) ? false : host.isSymbolicLink(file); },
    readText(file) { return staged.get(host.path.resolve(file)) ?? host.readText(file); },
    readBytes(file) { const text = staged.get(host.path.resolve(file)); return text === undefined ? host.readBytes(file) : encoder.encode(text); },
    size(file) { const text = staged.get(host.path.resolve(file)); return text === undefined ? host.size(file) : encoder.encode(text).length; },
    readDir(directory) {
      const resolved = host.path.resolve(directory);
      const entries = new Map(host.readDir(directory).map(entry => [entry.name, entry]));
      for (const file of staged.keys()) {
        if (host.path.dirname(file) === resolved) entries.set(host.path.basename(file), { name: host.path.basename(file), isFile: true, isDirectory: false });
      }
      return [...entries.values()];
    }
  };
}

function migrationFindingSite(finding) {
  return JSON.stringify([finding.severity, finding.code, finding.file, finding.message]);
}

function phase3TextNeeded(text) {
  const structuredNeeded = (value, insideReplay = false) => {
    if (insideReplay) return false;
    if (typeof value === "string") return /state:(?:number|member):|collections:[A-Za-z0-9_-]+:count/i.test(value);
    if (Array.isArray(value)) return value.some(item => structuredNeeded(item));
    if (!isObject(value)) return false;
    if (own(value, "freeze_invariant") || value.rule_set === "opengdd-graph-1") return true;
    return Object.entries(value).some(([key, item]) => structuredNeeded(item, key === "replay"));
  };
  const inScope = text.replace(/```([^\r\n]*)\r?\n([\s\S]*?)```/g, (whole, suffix, body) => {
    const language = suffix.trim().split(/\s+/)[0].toLowerCase();
    if (language === "fantasy") return whole;
    if (language !== "test") return "";
    try { return structuredNeeded(JSON.parse(body)) ? " phase3-test " : ""; }
    catch { return whole; }
  });
  return /phase3-test|state:(?:number|member):|collections:[A-Za-z0-9_-]+:count|freeze_invariant|\[all\]|>\s*RULESET:\s*all\b|opengdd-graph-1/i.test(inScope);
}

function phase3Needed(manifest, clocks, chapters) {
  return own(manifest, "ruleset_state") || own(manifest, "graphs") || (isObject(clocks) && (own(clocks, "modes") || own(clocks, "clocks"))) || chapters.some(([, text]) => phase3TextNeeded(text));
}

function phase4Needed(personalization, chapters) {
  const personalizationNeeded = isObject(personalization) && Array.isArray(personalization.questions) && personalization.questions.some(question => {
    if (!isObject(question)) return false;
    if (own(question, "resolution") || own(question, "affects")) return true;
    return Array.isArray(question.options) && question.options.some(option => isObject(option) && own(option, "tuning_overrides"));
  });
  if (personalizationNeeded) return true;
  return chapters.some(([, text]) => /```test([^\r\n]*)\r?\n([\s\S]*?)```/g.test(text) && [...text.matchAll(/```test([^\r\n]*)\r?\n([\s\S]*?)```/g)].some(match => {
    try {
      const descriptor = JSON.parse(match[2]);
      return descriptor?.type === "property" && ["invariant", "verdict", "sampling", "seed_set", "metric", "aggregation", "threshold"].some(key => own(descriptor, key));
    } catch {
      return false;
    }
  }));
}

function ruleTopLevelParts(source, word) {
  if (typeof source !== "string") return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (depth === 0 && source.slice(index, index + word.length) === word
      && !/[A-Za-z0-9_-]/.test(source[index - 1] ?? "")
      && !/[A-Za-z0-9_-]/.test(source[index + word.length] ?? "")) {
      parts.push(source.slice(start, index).trim());
      start = index + word.length;
      index += word.length - 1;
    }
  }
  if (parts.length) parts.push(source.slice(start).trim());
  return parts;
}

function topLevelComparisonCount(source) {
  if (typeof source !== "string") return 0;
  let depth = 0;
  let count = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") depth -= 1;
    else if (depth === 0) {
      const op = /^(?:==|!=|<=|>=|<|>)/.exec(source.slice(index))?.[0];
      if (op) { count += 1; index += op.length - 1; }
    }
  }
  return count;
}

function retiredRuleReason(source) {
  if (typeof source !== "string") return undefined;
  const retiredWord = /(?<![A-Za-z0-9_.-])(and|or|not)(?![A-Za-z0-9_.-])/.exec(source)?.[1];
  if (retiredWord) return `retired word ${JSON.stringify(retiredWord)}`;
  const retiredFunction = /\b(ceil|abs|mod)\s*\(/.exec(source)?.[1];
  if (retiredFunction) return `retired function ${JSON.stringify(retiredFunction)}`;
  if (topLevelComparisonCount(source) > 1) return "a chained comparison";
  return undefined;
}

function migrateRuleMap(rules, report, file) {
  if (!isObject(rules)) return rules;
  const migrated = {};
  for (const [name, source] of Object.entries(rules)) {
    if (name.startsWith("_")) { migrated[name] = structuredClone(source); continue; }
    const conjuncts = ruleTopLevelParts(source, "and");
    if (conjuncts.length > 1 && conjuncts.every(part => topLevelComparisonCount(part) === 1 && !retiredRuleReason(part))) {
      const conflicts = conjuncts.map((_, index) => `${name}-${index + 1}`).filter(next => own(rules, next) || own(migrated, next));
      if (conflicts.length) {
        report.manual.push(`${file}: rule ${JSON.stringify(name)} uses top-level and, but split names conflict with ${conflicts.map(JSON.stringify).join(", ")}; rewrite the line by hand: ${JSON.stringify(source)}`);
        migrated[name] = source;
        continue;
      }
      conjuncts.forEach((part, index) => { migrated[`${name}-${index + 1}`] = part; });
      report.changes.push({ file, message: `split rule ${JSON.stringify(name)} at top-level and into ${conjuncts.map((_, index) => JSON.stringify(`${name}-${index + 1}`)).join(", ")}` });
      continue;
    }
    const reason = retiredRuleReason(source);
    if (reason) {
      const item = `${file}: rule ${JSON.stringify(name)} uses ${reason}; rewrite this line by hand: ${JSON.stringify(source)}`;
      if (!report.manual.includes(item)) report.manual.push(item);
    }
    migrated[name] = structuredClone(source);
  }
  return migrated;
}

function objectScope(domain) {
  return Object.entries(domain).map(([key, value]) => {
    const words = key.replaceAll("_", " ");
    if (Array.isArray(value)) return `${words}: ${value.map(item => typeof item === "string" ? item : JSON.stringify(item)).join(", ")}`;
    if (isObject(value)) return `${words}: ${Object.entries(value).map(([member, item]) => `${member.replaceAll("_", " ")} ${typeof item === "string" ? item : JSON.stringify(item)}`).join(", ")}`;
    return `${words}: ${String(value)}`;
  }).join("; ");
}

function boundScope(bound) {
  if (!isObject(bound)) return undefined;
  const maximum = bound.maximum ?? bound.max ?? bound.limit;
  if (typeof maximum !== "number" || !Number.isFinite(maximum) || typeof bound.type !== "string") return undefined;
  let words = bound.type.replaceAll("_", "-").replace(/-depth$/, "").replaceAll("-", " ");
  if (!words.endsWith("s")) words += "s";
  return `${maximum} ${words}`;
}

function phase6TestNeeded(text) {
  return [...text.matchAll(/```test([^\r\n]*)\r?\n([\s\S]*?)```/g)].some(match => {
    try {
      const descriptor = JSON.parse(match[2]);
      return ["property", "exhaustive-search", "document-check"].includes(descriptor?.type) || own(descriptor ?? {}, "applies_to");
    } catch { return false; }
  });
}

function phase6PackageNeeded(host, packageRoot, tuning, chapters) {
  if (chapters.some(([, text]) => phase6TestNeeded(text))) return true;
  if (Object.values(isObject(tuning?.rules) ? tuning.rules : {}).some(source => retiredRuleReason(source))) return true;
  const collections = host.path.join(packageRoot, "collections");
  if (host.exists(collections) && host.isDirectory(collections)) for (const drawer of host.readDir(collections)) {
    const label = host.path.join(collections, drawer.name, "_collection.json");
    if (!drawer.isDirectory || !host.exists(label) || !host.isFile(label)) continue;
    const text = host.readText(label);
    if (/"type"\s*:\s*"reference"|"loops"\s*:\s*"never"/.test(text)) return true;
  }
  const contracts = host.path.join(packageRoot, "contracts");
  if (host.exists(contracts) && host.isDirectory(contracts)) for (const entry of host.readDir(contracts)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const text = host.readText(host.path.join(contracts, entry.name));
    if (/\{\{inputs:domain\}\}|"type"\s*:\s*"property"|"domain"\s*:/.test(text)) return true;
    try {
      const document = JSON.parse(text);
      if (Object.values(isObject(document?.rules) ? document.rules : {}).some(source => retiredRuleReason(source))) return true;
    } catch {}
  }
  return false;
}

function migrateLinkShapes(value, report, file, pointer = "#") {
  if (Array.isArray(value)) return value.map((item, index) => migrateLinkShapes(item, report, file, `${pointer}/${index}`));
  if (!isObject(value)) return value;
  const migrated = {};
  for (const [key, child] of Object.entries(value)) migrated[key] = migrateLinkShapes(child, report, file, `${pointer}/${key}`);
  if (migrated.type === "reference") {
    migrated.type = "link";
    report.changes.push({ file, message: `renamed ${pointer}/type from reference to link` });
  }
  if (migrated.loops === "never") {
    migrated.loops = false;
    report.changes.push({ file, message: `rewrote ${pointer}/loops from "never" to false` });
  }
  return migrated;
}

function migratePhase6Pack(document, report, file) {
  const migrateValue = value => {
    if (typeof value === "string") return value.replaceAll("{{inputs:domain}}", "{{inputs:scope}}");
    if (Array.isArray(value)) return value.map(migrateValue);
    if (!isObject(value)) return value;
    const result = {};
    for (const [key, child] of Object.entries(value)) result[key === "domain" ? "scope" : key] = migrateValue(child);
    if (result.type === "property") result.type = "general";
    if (result.type === "general") delete result.applies_to;
    return result;
  };
  const migrated = migrateValue(document);
  if (JSON.stringify(migrated) !== JSON.stringify(document)) report.changes.push({ file, message: "migrated property template and domain input to general with scope" });
  return migrated;
}

function replaceContractPlaceholders(value) {
  if (typeof value === "string") return value
    .replace("Optional. The tuning key that governs this relay's signal budget. Exercises the citation grammar's tuning: arm, whose target is legal for the opposite reason a chapter section is: the key is stable and the resolved snapshot pins its value per build.", "Optional. The dotted address of the value that governs this relay's signal budget. The address is stable, and the resolved snapshot pins its value per build.")
    .replace("Pruned along with the mechanism when relay-mode is not-applicable.", "This Fixed value remains filled even when relay-mode is not-applicable.")
    .replace(/\{\{knob-cite:([^{}]+)\}\}/g, "{{value-cite:$1}}")
    .replace(/\{\{surface:sampling\}\}/g, "{{inputs:seeds}}")
    .replace(/\{\{surface:([^{}]+)\}\}/g, "{{inputs:$1}}")
    .replace(/\{\{inputs:domain\}\}/g, "{{inputs:scope}}")
    .replace(/tuning:contracts\./g, "contracts.")
    .replace(/collections:([a-z0-9]+(?:-[a-z0-9]+)*):count/g, "collections.$1")
    .replace(/opengdd-expr-1/g, "the retired operator-tree grammar")
    .replace(/knob:/g, "value ")
    .replace(/tuning:/g, "");
  if (Array.isArray(value)) return value.map(replaceContractPlaceholders);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceContractPlaceholders(child)]));
}

function copyContractAnnotations(source, target) {
  if (!isObject(source) || !isObject(target)) return;
  for (const [name, value] of Object.entries(source)) {
    if (!name.startsWith("_")) continue;
    target[name] = replaceContractPlaceholders(structuredClone(value));
  }
}

const CONTRACT_DEFINITION_ORDER = ["contract", "version", "origin", "summary", "mechanism", "questions", "declares", "rules", "pack"];
const CONTRACT_DESIGNER_ORDER = ["answers", "values", "rows", "verification"];

function normalizeContractOption(option, stats = {}) {
  if (!isObject(option)) return structuredClone(option);
  const normalized = {};
  if (typeof option.meaning === "string") normalized.meaning = option.meaning;
  else if (typeof option.semantics === "string") {
    normalized.meaning = option.semantics;
    stats.semanticsToMeaning = (stats.semanticsToMeaning ?? 0) + 1;
  } else if (own(option, "meaning")) normalized.meaning = structuredClone(option.meaning);
  if (typeof option.semantics === "string" && option.semantics !== normalized.meaning) normalized.semantics = option.semantics;
  else if (typeof option.semantics === "string" && typeof option.meaning === "string") stats.duplicatesCollapsed = (stats.duplicatesCollapsed ?? 0) + 1;
  if (own(option, "rationale")) normalized.rationale = structuredClone(option.rationale);
  copyContractAnnotations(option, normalized);
  return normalized;
}

function normalizeContractQuestions(questions, stats) {
  if (!isObject(questions)) return structuredClone(questions);
  const normalized = {};
  for (const [questionId, question] of Object.entries(questions)) {
    if (!isObject(question) || !isObject(question.options)) {
      normalized[questionId] = structuredClone(question);
      continue;
    }
    const copy = {};
    for (const [key, value] of Object.entries(question)) {
      if (key !== "options") copy[key] = structuredClone(value);
    }
    copy.options = Object.fromEntries(Object.entries(question.options).map(([optionId, option]) =>
      [optionId, optionId.startsWith("_") ? structuredClone(option) : normalizeContractOption(option, stats)]));
    normalized[questionId] = copy;
  }
  return normalized;
}

export function normalizeContractDocument(document, { definitionOnly = false, stats = {} } = {}) {
  if (!isObject(document) || typeof document.contract !== "string" || !Number.isInteger(document.version)) return undefined;
  const keys = Object.keys(document);
  const answersIndex = keys.indexOf("answers");
  const definitionAnnotations = keys.filter((key, index) => key.startsWith("_") && (answersIndex < 0 || index < answersIndex));
  const designerAnnotations = keys.filter((key, index) => key.startsWith("_") && answersIndex >= 0 && index > answersIndex);
  const normalized = {};
  for (const key of CONTRACT_DEFINITION_ORDER) {
    if (!own(document, key)) continue;
    normalized[key] = key === "questions"
      ? normalizeContractQuestions(document[key], stats)
      : structuredClone(document[key]);
  }
  for (const key of definitionAnnotations) normalized[key] = structuredClone(document[key]);
  if (definitionOnly) return normalized;
  for (const key of CONTRACT_DESIGNER_ORDER) if (own(document, key)) normalized[key] = structuredClone(document[key]);
  for (const key of designerAnnotations) normalized[key] = structuredClone(document[key]);
  return normalized;
}

function reportRetiredContractAnnotations(source, report, site, parent) {
  const visit = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!isObject(value)) return;
    for (const [name, child] of Object.entries(value)) {
      const childPath = `${path}.${name}`;
      if (name.startsWith("_")) report.manual.push(`${site}: annotation ${JSON.stringify(name)} inside retired ${parent} (${childPath}) was removed: ${typeof child === "string" ? child : JSON.stringify(child)}`);
      else visit(child, childPath);
    }
  };
  visit(source, parent);
}

function reportDirectContractAnnotations(source, report, site, parent) {
  if (!isObject(source)) return;
  for (const [name, value] of Object.entries(source)) if (name.startsWith("_")) {
    report.manual.push(`${site}: annotation ${JSON.stringify(name)} inside retired ${parent} was removed: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
}

function contractRuleTree(node) {
  if (Array.isArray(node)) return node.map(contractRuleTree);
  if (!isObject(node)) return node;
  if (typeof node.ref === "string" && node.ref.startsWith("knob:")) return { ref: `tuning:${node.ref.slice("knob:".length)}` };
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, contractRuleTree(value)]));
}

function contractSeedList(value) {
  if (Array.isArray(value?.seeds)) return value.seeds;
  if (Array.isArray(value?.seed_set)) return value.seed_set;
  if (Array.isArray(value?.sampling?.seeds)) return value.sampling.seeds;
  if (Array.isArray(value?.sampling?.seed_set)) return value.sampling.seed_set;
  return undefined;
}

function migrateContractTemplate(template, report, site) {
  const migrated = replaceContractPlaceholders(structuredClone(template));
  if (!own(migrated, "test") && isObject(migrated.descriptor)) {
    migrated.test = migrated.descriptor;
    delete migrated.descriptor;
    report.changes.push({ file: site, message: `renamed descriptor to test on template ${JSON.stringify(migrated.id)}` });
  }
  if (typeof migrated.title !== "string") {
    migrated.title = String(migrated.id ?? "contract test").replaceAll("-", " ");
    report.changes.push({ file: site, message: `derived a readable title from template id ${JSON.stringify(migrated.id)}` });
    report.manual.push(`${site}: template ${JSON.stringify(migrated.id)} had no title; ${JSON.stringify(migrated.title)} was derived from its id — replace it with the designer-facing test title`);
  }
  if (migrated.expand === "per-threshold-row") {
    migrated.expand = "per-row";
    migrated.collection = "thresholds";
    report.changes.push({ file: site, message: `renamed per-threshold-row expansion on ${JSON.stringify(migrated.id)} to per-row thresholds` });
  }
  if (isObject(migrated.when) && !own(migrated.when, "flag") && !own(migrated.when, "row")) migrated.when = { flag: migrated.when };
  if (isObject(migrated.when_row)) {
    migrated.when = { ...(isObject(migrated.when) ? migrated.when : {}), row: migrated.when_row };
    delete migrated.when_row;
  }
  const oldInputs = Array.isArray(migrated.surface_inputs) ? migrated.surface_inputs : [];
  delete migrated.surface_inputs;
  let defaultSeeds;
  const inputs = {};
  for (const input of oldInputs) {
    const oldName = typeof input === "string" ? input : isObject(input) && typeof input.name === "string" ? input.name : undefined;
    if (!oldName) continue;
    const name = oldName === "sampling" ? "seeds" : oldName === "domain" ? "scope" : oldName;
    if (!["scope", "seeds"].includes(name)) {
      report.manual.push(`${site}: template ${JSON.stringify(migrated.id)} declares unsupported verification input ${JSON.stringify(oldName)}; rename it to scope or seeds`);
      continue;
    }
    const declaration = {};
    if (isObject(input) && own(input, "default_guidance")) {
      const fallback = name === "seeds" ? contractSeedList(input.default_guidance) ?? contractSeedList({ seeds: input.default_guidance }) : input.default_guidance;
      if (fallback !== undefined) declaration.default = structuredClone(fallback);
    }
    if (name === "seeds" && own(declaration, "default")) defaultSeeds = declaration.default;
    inputs[name] = declaration;
  }
  if (isObject(migrated.test) && migrated.test.type === "property") {
    const sampling = migrated.test.sampling;
    defaultSeeds ??= contractSeedList(sampling);
    if (own(migrated.test, "invariant")) {
      migrated.test.holds = migrated.test.invariant;
      delete migrated.test.invariant;
    }
    if (own(migrated.test, "verdict")) {
      delete migrated.test.verdict;
    }
    if (own(migrated.test, "sampling")) {
      delete migrated.test.sampling;
      report.changes.push({ file: site, message: `moved property sampling on template ${JSON.stringify(migrated.id)} to seeds; sample counts are runner-owned` });
    }
    if (defaultSeeds && !own(inputs, "seeds")) inputs.seeds = { default: defaultSeeds };
    if (own(inputs, "seeds") || own(migrated.test, "sampling")) migrated.test.seeds = "{{inputs:seeds}}";
    migrated.test.type = "general";
    migrated.type = "general";
    if (own(migrated.test, "domain")) {
      migrated.test.scope = migrated.test.domain;
      delete migrated.test.domain;
    }
    delete migrated.test.applies_to;
  }
  if (Object.keys(inputs).length) migrated.inputs = inputs;
  if (oldInputs.length) report.changes.push({ file: site, message: `renamed surface_inputs on template ${JSON.stringify(migrated.id)} to inputs with optional defaults` });
  if (typeof migrated.text === "string") migrated.text = migrated.text
    .replace("The domain and the sampling plan are supplied by this game through the contract surface's verification channel", "The domain and seeds are supplied by this adoption through its verification inputs")
    .replace("The game supplies the domain and sampling plan through the surface's verification channel", "The adoption supplies the domain and seeds through its verification inputs");
  return migrated;
}

function contractOrigin(core, report, site) {
  if (typeof core.origin === "string") return core.origin;
  if (typeof core.origin?.url === "string") {
    report.changes.push({ file: site, message: "kept origin.url as the definition origin string; dropped the old origin wrapper" });
    return core.origin.url;
  }
  report.changes.push({ file: site, message: "replaced the old origin object with the canonical OpenGDD catalogue origin" });
  return `https://opengdd.org/contracts/${core.id}-${core.version}`;
}

export function migrateLegacyContract(document, report = { changes: [], manual: [] }, site = "contract.json", sha256) {
  if (!isObject(document) || document.format !== "opengdd-contract-instance-1" || !isObject(document.core)) return undefined;
  const core = document.core;
  const questions = {};
  let droppedSections = 0;
  for (const decision of Array.isArray(core.decisions) ? core.decisions : []) {
    if (!isObject(decision) || typeof decision.flag !== "string") continue;
    const question = { asks: decision.question };
    if (own(decision, "rationale")) question.rationale = decision.rationale;
    if (own(decision, "default_guidance")) question.guidance = decision.default_guidance;
    if (own(decision, "when")) question.when = structuredClone(decision.when);
    copyContractAnnotations(decision, question);
    question.options = {};
    for (const option of Array.isArray(decision.options) ? decision.options : []) {
      if (!isObject(option) || typeof option.id !== "string") continue;
      const migrated = normalizeContractOption(option);
      question.options[option.id] = migrated;
    }
    if (decision.not_applicable?.permitted === true) {
      const option = normalizeContractOption(decision.not_applicable);
      question.options["not-applicable"] = option;
    }
    questions[decision.flag] = question;
    if (own(decision, "section")) droppedSections += 1;
  }
  if (droppedSections) report.changes.push({ file: site, message: `dropped presentation-only section from ${droppedSections} question declaration(s)` });
  const declaredValues = {};
  for (const [name, meta] of Object.entries(isObject(core.knobs) ? core.knobs : {})) {
    if (name.startsWith("_") || !isObject(meta)) continue;
    const declaration = { description: replaceContractPlaceholders(typeof meta.description === "string" ? meta.description : `The contract value ${name}.`) };
    copyContractAnnotations(meta, declaration);
    if (isObject(meta.range)) {
      if (typeof meta.range.min === "number" && Number.isFinite(meta.range.min) && typeof meta.range.max === "number" && Number.isFinite(meta.range.max)) declaration.range = [meta.range.min, meta.range.max];
      else report.manual.push(`${site}: value ${JSON.stringify(name)} has a half-open range ${JSON.stringify(meta.range)}; choose a finite [min, max] range or remove it`);
    }
    const dropped = ["kind", "unit", "type", "default_guidance", "rationale", "when"].filter(key => own(meta, key));
    if (dropped.length) report.changes.push({ file: site, message: `dropped ${dropped.join(", ")} from value declaration ${JSON.stringify(name)}` });
    declaredValues[name] = declaration;
  }
  const declaredRows = replaceContractPlaceholders(structuredClone(isObject(core.collections) ? core.collections : {}));
  for (const declaration of Object.values(declaredRows)) if (isObject(declaration?.record)) for (const shape of Object.values(declaration.record)) {
    if (!isObject(shape) || !isObject(shape.required_when)) continue;
    shape.when = { row: shape.required_when };
    delete shape.required_when;
  }
  const rules = {};
  const bareKeys = new Set(Object.keys(declaredValues));
  for (const invariant of Array.isArray(core.invariants) ? core.invariants : []) {
    const name = isObject(invariant) && typeof invariant.id === "string" ? invariant.id : "<unnamed>";
    try {
      const line = printTree(contractRuleTree(invariant.assert)).text;
      const conjuncts = ruleTopLevelParts(line, "and");
      if (conjuncts.length > 1 && conjuncts.every(part => topLevelComparisonCount(part) === 1 && !retiredRuleReason(part))) {
        conjuncts.forEach((part, index) => {
          parseRule(part, { bareKeys });
          rules[`${invariant.id}-${index + 1}`] = part;
        });
        report.changes.push({ file: site, message: `split rule ${JSON.stringify(invariant.id)} at top-level and into ${conjuncts.map((_, index) => JSON.stringify(`${invariant.id}-${index + 1}`)).join(", ")}` });
      } else {
        const retired = retiredRuleReason(line);
        if (retired) throw unsupported(`${retired}: ${JSON.stringify(line)}`);
        parseRule(line, { bareKeys });
        rules[invariant.id] = line;
      }
      if (own(invariant, "message")) report.changes.push({ file: site, message: `dropped message from contract rule ${JSON.stringify(invariant.id)}` });
    } catch (cause) {
      report.manual.push(`${site}: invariant ${JSON.stringify(name)} could not become a rule line (${cause.message})`);
    }
    reportRetiredContractAnnotations(invariant, report, site, `core.invariants.${name}`);
  }
  const pack = {
    contract: core.id,
    version: core.version,
    templates: (Array.isArray(core.templates) ? core.templates : []).map(template => migrateContractTemplate(template, report, site))
  };
  for (const template of pack.templates) {
    const encoded = JSON.stringify(template);
    const inherited = {};
    for (const [name, meta] of Object.entries(isObject(core.knobs) ? core.knobs : {})) {
      const oldFlags = isObject(meta?.when?.flag) ? meta.when.flag : isObject(meta?.when) ? meta.when : undefined;
      if (!encoded.includes(`{{value-cite:${name}}}`) || !oldFlags) continue;
      for (const [flag, options] of Object.entries(oldFlags)) {
        if (!Array.isArray(options)) continue;
        inherited[flag] = own(inherited, flag)
          ? inherited[flag].filter(option => options.includes(option))
          : [...options];
      }
    }
    if (!Object.keys(inherited).length) continue;
    const existing = isObject(template.when?.flag) ? template.when.flag : {};
    const flags = { ...inherited };
    for (const [flag, options] of Object.entries(existing)) {
      flags[flag] = own(flags, flag) && Array.isArray(options)
        ? flags[flag].filter(option => options.includes(option))
        : options;
    }
    template.when = { ...(isObject(template.when) ? template.when : {}), flag: flags };
    report.changes.push({ file: site, message: `preserved conditional value liveness on template ${JSON.stringify(template.id)} as a flag condition` });
  }
  const oldVerification = isObject(document.surface?.test_inputs) ? document.surface.test_inputs : isObject(document.surface?.verification) ? document.surface.verification : isObject(document.verification) ? document.verification : {};
  const packText = JSON_TEXT(pack);
  if (typeof sha256 !== "function") {
    report.manual.push(`${site}: the verification-pack digest could not be computed because the host supplies no SHA-256; no files were written`);
    return { refused: true };
  }
  const hash = `sha256:${sha256(new TextEncoder().encode(packText))}`;
  const adoption = {
    contract: core.id,
    version: core.version,
    origin: contractOrigin(core, report, site),
    summary: core.summary,
    mechanism: structuredClone(core.mechanism),
    questions,
    declares: {},
    pack: hash,
    answers: structuredClone(isObject(document.surface?.answers) ? document.surface.answers : {}),
    values: {}
  };
  if (Object.keys(declaredValues).length) adoption.declares.values = declaredValues;
  if (Object.keys(declaredRows).length) adoption.declares.rows = declaredRows;
  if (Object.keys(rules).length) adoption.rules = rules;
  for (const [name, raw] of Object.entries(isObject(document.surface?.knobs) ? document.surface.knobs : {})) {
    if (name.startsWith("_")) {
      adoption.values[name] = replaceContractPlaceholders(structuredClone(raw));
      continue;
    }
    if (isObject(raw) && typeof raw.value === "number") {
      adoption.values[name] = raw.value;
      report.changes.push({ file: site, message: `made value ${JSON.stringify(name)} a plain number; dropped unit ${JSON.stringify(raw.unit)}` });
    } else adoption.values[name] = raw;
    reportRetiredContractAnnotations(raw, report, site, `surface.knobs.${name}`);
  }
  for (const [name, meta] of Object.entries(isObject(core.knobs) ? core.knobs : {})) if (!own(adoption.values, name)) {
    const provisional = typeof meta?.default_guidance === "number" && Number.isFinite(meta.default_guidance) ? meta.default_guidance : 0;
    adoption.values[name] = provisional;
    report.manual.push(`${site}: old liveness pruned value ${JSON.stringify(name)}; inserted provisional ${provisional} because v0.7 values are always declared and filled — review this number`);
  }
  const verification = {};
  copyContractAnnotations(oldVerification, verification);
  for (const [templateId, input] of Object.entries(oldVerification)) {
    if (templateId.startsWith("_")) continue;
    const migratedInput = {};
    copyContractAnnotations(input, migratedInput);
    if (typeof input?.domain === "string") migratedInput.scope = input.domain;
    const seeds = contractSeedList(input);
    if (seeds) migratedInput.seeds = seeds;
    if (Object.keys(migratedInput).length) verification[templateId] = migratedInput;
    const sampleCount = input?.samples_per_seed ?? input?.sampling?.samples_per_seed;
    if (sampleCount !== undefined) report.changes.push({ file: site, message: `dropped samples_per_seed ${JSON.stringify(sampleCount)} from verification ${JSON.stringify(templateId)}; the runner profile owns sample counts` });
    for (const [name, value] of Object.entries(isObject(input) ? input : {})) if (!name.startsWith("_") && !["domain", "scope", "seeds", "seed_set", "sampling", "samples_per_seed"].includes(name)) report.changes.push({ file: site, message: `dropped verification input ${JSON.stringify(`${templateId}.${name}`)}: ${JSON.stringify(value)}` });
    if (isObject(input?.sampling)) reportRetiredContractAnnotations(input.sampling, report, site, `verification.${templateId}.sampling`);
  }
  if (Object.keys(verification).length) adoption.verification = verification;
  reportDirectContractAnnotations(document.surface, report, site, "surface");
  reportRetiredContractAnnotations(document.surface?.meta, report, site, "surface.meta");
  if (own(document.surface ?? {}, "meta")) report.changes.push({ file: site, message: `dropped surface.meta ${JSON.stringify(document.surface.meta)}` });
  if (own(document, "about")) report.manual.push(`${site}: about text was removed; move it into a chapter if you want it kept: ${document.about}`);
  const oldRows = isObject(document.rows) ? document.rows : {};
  if (Object.keys(declaredRows).length) adoption.rows = {};
  copyContractAnnotations(oldRows, adoption.rows);
  for (const name of Object.keys(declaredRows)) {
    if (own(oldRows, name)) adoption.rows[name] = replaceContractPlaceholders(structuredClone(oldRows[name]));
    else if (Array.isArray(document[name])) adoption.rows[name] = replaceContractPlaceholders(structuredClone(document[name]));
  }
  report.changes.push({ file: site, message: "dropped format, instance, core, and surface wrappers; the adoption is now one filled form" });
  const orderedAdoption = {};
  for (const key of CONTRACT_DEFINITION_ORDER) if (own(adoption, key)) orderedAdoption[key] = adoption[key];
  copyContractAnnotations(core, orderedAdoption);
  for (const key of CONTRACT_DESIGNER_ORDER) if (own(adoption, key)) orderedAdoption[key] = adoption[key];
  copyContractAnnotations(document, orderedAdoption);
  return { adoption: normalizeContractDocument(orderedAdoption), pack, packText, hash };
}

function phase5LegacyNeeded(host, packageRoot, chapters) {
  const directory = host.path.join(packageRoot, "contracts");
  if (host.exists(directory) && host.isDirectory(directory)) for (const entry of host.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    try {
      const document = JSON.parse(host.readText(host.path.join(directory, entry.name)));
      if (document?.format === "opengdd-contract-instance-1") return true;
    } catch {}
  }
  return chapters.some(([, text]) => /<!-- opengdd:contracts:generated:begin\b/.test(text) || /tuning:contracts\./.test(text));
}

function phase5Needed(host, packageRoot, chapters) {
  if (phase5LegacyNeeded(host, packageRoot, chapters)) return true;
  const directory = host.path.join(packageRoot, "contracts");
  if (host.exists(directory) && host.isDirectory(directory)) for (const entry of host.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json") || entry.name.endsWith(".pack.json")) continue;
    const file = host.path.join(directory, entry.name);
    try {
      const document = JSON.parse(host.readText(file));
      if (isObject(document?.answers) && isObject(document?.values)) {
        const normalized = normalizeContractDocument(document);
        if (normalized && JSON_TEXT(normalized) !== host.readText(file)) return true;
      }
    } catch {}
  }
  return false;
}

function removeGeneratedContractBlocks(text, report, file) {
  let count = 0;
  const replaced = text.replace(/(?:\r?\n)?^<!-- opengdd:contracts:generated:begin\b[^\r\n]*-->\r?\n[\s\S]*?^<!-- opengdd:contracts:generated:end\b[^\r\n]*-->\r?\n?/gm, () => { count += 1; return "\n"; });
  if (count) report.changes.push({ file, message: `removed ${count} retired generated contract block${count === 1 ? "" : "s"} (markers and content)` });
  return count ? replaced.replace(/\n{2,}$/g, "\n") : text;
}

export function migratePackage(host, root, options = {}) {
  const packageRoot = host.path.resolve(root);
  const report = { root: packageRoot, changes: [], manual: [], noOp: false };
  const manifestFile = host.path.join(packageRoot, "manifest.json");
  const tuningFile = host.path.join(packageRoot, "tuning.json");
  const clocksFile = host.path.join(packageRoot, "clocks.json");
  const directionFile = host.path.join(packageRoot, "direction.json");
  const personalizationFile = host.path.join(packageRoot, "personalization.json");
  if (!host.exists(manifestFile) || !host.isFile(manifestFile)) throw new Error(`manifest.json not found in ${packageRoot}`);
  const manifestInput = readJsonForMigration(host, manifestFile, "manifest.json", report);
  if (manifestInput.failed) return refuse(report, options.collectOutputs);
  const manifest = manifestInput.document;
  if (manifest.opengdd !== "0.6" && manifest.opengdd !== "0.7") throw new Error(`manifest.json opengdd must be "0.6" or "0.7", got ${JSON.stringify(manifest.opengdd)}`);
  if (!host.exists(tuningFile) || !host.isFile(tuningFile)) throw new Error(`tuning.json not found in ${packageRoot}`);
  const tuningInput = readJsonForMigration(host, tuningFile, "tuning.json", report);
  const clocksInput = host.exists(clocksFile) && host.isFile(clocksFile)
    ? readJsonForMigration(host, clocksFile, "clocks.json", report)
    : undefined;
  const directionInput = host.exists(directionFile) && host.isFile(directionFile)
    ? readJsonForMigration(host, directionFile, "direction.json", report)
    : undefined;
  const personalizationInput = host.exists(personalizationFile) && host.isFile(personalizationFile)
    ? readJsonForMigration(host, personalizationFile, "personalization.json", report)
    : undefined;
  if (tuningInput.failed || clocksInput?.failed || directionInput?.failed || personalizationInput?.failed) return refuse(report, options.collectOutputs);
  const tuning = tuningInput.document;
  const outputs = [];
  const chapters = host.readDir(packageRoot)
    .filter(item => item.isFile && NUMBERED_CHAPTER.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => [entry.name, host.readText(host.path.join(packageRoot, entry.name))]);
  const phase1 = manifest.opengdd === "0.6";
  const phase2 = legacyDirectionShape(manifest, directionInput?.document, chapters);
  const phase3 = phase3Needed(manifest, clocksInput?.document ?? tuning.clocks, chapters);
  const phase4 = phase4Needed(personalizationInput?.document, chapters);
  const phase5Legacy = phase5LegacyNeeded(host, packageRoot, chapters);
  const phase5 = phase5Legacy || phase5Needed(host, packageRoot, chapters);
  const phase6 = phase6PackageNeeded(host, packageRoot, tuning, chapters);
  if (!phase1 && !phase2 && !phase3 && !phase4 && !phase5 && !phase6) {
    report.noOp = true;
    if (options.collectOutputs) report.outputs = [];
    return report;
  }

  let clocksForPhase3 = clocksInput?.document;
  let tuningForPhase4 = tuning;
  if (phase1) {
    const oldBuild = isObject(manifest.build) ? manifest.build : undefined;
    if (oldBuild) {
    for (const chapter of Array.isArray(oldBuild.chapters) ? oldBuild.chapters : []) {
      if (typeof chapter === "string" && !NUMBERED_CHAPTER.test(chapter)) {
        const stem = host.path.basename(chapter).replace(/\.md$/i, "");
        report.manual.push(`manifest.json: \`${chapter}\` is listed as a chapter but is not a numbered root file; move it to \`06-${stem}.md\``);
      }
    }
    if (own(oldBuild, "direction") && oldBuild.direction !== "direction.json") report.manual.push(`manifest.json: build.direction names ${JSON.stringify(oldBuild.direction)}; move it to root "direction.json"`);
    if (own(oldBuild, "personalization") && oldBuild.personalization !== "personalization.json") report.manual.push(`manifest.json: build.personalization names ${JSON.stringify(oldBuild.personalization)}; move it to root "personalization.json"`);
    }
    const { migrated, clocks } = migrateTuning(tuning, report);
    if (isObject(migrated.rules)) migrated.rules = migrateRuleMap(migrated.rules, report, "tuning.json");
    tuningForPhase4 = migrated;
    stageIfChanged(host, tuningFile, JSON_TEXT(migrated), "tuning.json", report, outputs);
    if (clocks) {
      const clocksText = JSON_TEXT(clocks);
      if (clocksInput && clocksInput.text !== clocksText) {
        report.manual.push("clocks.json: an existing file differs from tuning.json.clocks; reconcile them before migrating");
      } else {
        clocksForPhase3 = clocks;
      }
    }
  }

  if (phase6 && !phase1 && isObject(tuning.rules)) {
    const migratedTuning = structuredClone(tuning);
    migratedTuning.rules = migrateRuleMap(migratedTuning.rules, report, "tuning.json");
    stageIfChanged(host, tuningFile, JSON_TEXT(migratedTuning), "tuning.json", report, outputs);
    tuningForPhase4 = migratedTuning;
  }

  if ((phase1 || phase4) && personalizationInput) {
    const migratedPersonalization = migratePersonalization(personalizationInput.document, tuningForPhase4.ranges ?? {}, report);
    stageIfChanged(host, personalizationFile, JSON_TEXT(migratedPersonalization), "personalization.json", report, outputs);
  }

  if (phase5) {
    const contractsDirectory = host.path.join(packageRoot, "contracts");
    const packs = new Map();
    if (host.exists(contractsDirectory) && host.isDirectory(contractsDirectory)) {
      for (const entry of host.readDir(contractsDirectory)) {
        if (!entry.isFile || !entry.name.endsWith(".json") || entry.name.endsWith(".pack.json")) continue;
        const relative = `contracts/${entry.name}`;
        const file = host.path.join(contractsDirectory, entry.name);
        const input = readJsonForMigration(host, file, relative, report);
        if (input.failed) continue;
        if (input.document?.format !== "opengdd-contract-instance-1") {
          if (isObject(input.document?.answers) && isObject(input.document?.values)) {
            const stats = {};
            const normalized = normalizeContractDocument(input.document, { stats });
            if (normalized) {
              stageIfChanged(host, file, JSON_TEXT(normalized), relative, report, outputs);
              if ((stats.semanticsToMeaning ?? 0) || (stats.duplicatesCollapsed ?? 0)) {
                report.changes.push({ file: relative, message: `normalized option wording: ${stats.semanticsToMeaning ?? 0} semantics-only option(s) became meaning, ${stats.duplicatesCollapsed ?? 0} duplicate semantics field(s) collapsed` });
              }
            }
          }
          continue;
        }
        const migrated = migrateLegacyContract(input.document, report, relative, host.sha256);
        if (!migrated) continue;
        if (migrated.refused) return refuse(report, options.collectOutputs);
        for (const [name, binding] of Object.entries(migrated.adoption.rows)) {
          if (typeof binding !== "string") continue;
          const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(binding);
          if (!match) {
            report.manual.push(`${relative}: rows.${name} uses unsupported source ${JSON.stringify(binding)}; replace it with an inline array`);
            continue;
          }
          const drawer = host.path.join(packageRoot, "collections", match[1]);
          if (!host.exists(drawer) || !host.isDirectory(drawer)) {
            report.manual.push(`${relative}: rows.${name} names missing drawer ${JSON.stringify(binding)}; replace it with an inline array`);
            continue;
          }
          const rows = [];
          for (const recordEntry of host.readDir(drawer).filter(item => item.isFile && item.name.endsWith(".json") && item.name !== "_collection.json").sort((a, b) => a.name.localeCompare(b.name))) {
            const recordPath = host.path.join(drawer, recordEntry.name);
            try {
              const record = JSON.parse(host.readText(recordPath));
              if (isObject(record)) {
                const migratedRecord = replaceContractPlaceholders(record);
                rows.push({ id: recordEntry.name.slice(0, -5), ...migratedRecord });
                stageIfChanged(host, recordPath, JSON_TEXT(migratedRecord), `collections/${match[1]}/${recordEntry.name}`, report, outputs);
              }
            } catch (cause) {
              report.manual.push(`${relative}: could not inline ${binding}/${recordEntry.name} (${cause.message})`);
            }
          }
          migrated.adoption.rows[name] = rows;
          report.manual.push(`${relative}: copied ${rows.length} record(s) from ${binding} into rows.${name}; the drawer may now be deleted or kept as ordinary content`);
        }
        stageIfChanged(host, file, JSON_TEXT(migrated.adoption), relative, report, outputs);
        const packName = `${migrated.pack.contract}-${migrated.pack.version}.pack.json`;
        const existing = packs.get(packName);
        if (existing && existing !== migrated.packText) {
          report.manual.push(`${relative}: its verification pack differs from the other ${packName}; reconcile the old cores before migrating`);
        } else packs.set(packName, migrated.packText);
      }
      for (const [packName, text] of packs) stageIfChanged(host, host.path.join(contractsDirectory, packName), text, `contracts/${packName}`, report, outputs);
    }
  }

  if (phase6 && !phase5Legacy) {
    const contractsDirectory = host.path.join(packageRoot, "contracts");
    const packHashes = new Map();
    if (host.exists(contractsDirectory) && host.isDirectory(contractsDirectory)) {
      for (const entry of host.readDir(contractsDirectory).filter(item => item.isFile && item.name.endsWith(".pack.json")).sort((left, right) => left.name.localeCompare(right.name))) {
        const relative = `contracts/${entry.name}`;
        const file = host.path.join(contractsDirectory, entry.name);
        const input = readJsonForMigration(host, file, relative, report);
        if (input.failed) continue;
        const migrated = migratePhase6Pack(input.document, report, relative);
        const text = JSON_TEXT(migrated);
        stageIfChanged(host, file, text, relative, report, outputs);
        if (typeof migrated.contract === "string" && Number.isInteger(migrated.version)) {
          if (typeof host.sha256 !== "function") {
            report.manual.push(`${relative}: the verification-pack digest could not be computed because the host supplies no SHA-256; no files were written`);
            return refuse(report, options.collectOutputs);
          }
          packHashes.set(`${migrated.contract}-${migrated.version}`, `sha256:${host.sha256(new TextEncoder().encode(text))}`);
        }
      }
      for (const entry of host.readDir(contractsDirectory).filter(item => item.isFile && item.name.endsWith(".json") && !item.name.endsWith(".pack.json")).sort((left, right) => left.name.localeCompare(right.name))) {
        const relative = `contracts/${entry.name}`;
        const file = host.path.join(contractsDirectory, entry.name);
        const input = readJsonForMigration(host, file, relative, report);
        if (input.failed || !isObject(input.document)) continue;
        const migrated = structuredClone(input.document);
        if (isObject(migrated.verification)) for (const [template, values] of Object.entries(migrated.verification)) {
          if (!isObject(values) || !own(values, "domain")) continue;
          values.scope = values.domain;
          delete values.domain;
          report.changes.push({ file: relative, message: `renamed verification.${template}.domain to scope` });
        }
        if (isObject(migrated.rules)) migrated.rules = migrateRuleMap(migrated.rules, report, relative);
        const hash = packHashes.get(`${migrated.contract}-${migrated.version}`);
        if (hash && migrated.pack !== hash) {
          migrated.pack = hash;
          report.changes.push({ file: relative, message: `updated pack hash to ${hash}` });
        }
        stageIfChanged(host, file, JSON_TEXT(migrated), relative, report, outputs);
      }
    }
  }

  let moodNames = new Map();
  if (phase2) {
    const migratedDirection = migrateDirectionDocument(manifest, directionInput?.document, report);
    moodNames = migratedDirection.moodNames;
    if (Object.keys(migratedDirection.result).length === 0) throw new Error("direction migration produced an empty direction.json");
    const directionSchemaProblems = validateSchemaDocument(migratedDirection.result, host.loadSchema("direction.schema.json"));
    if (directionSchemaProblems.length) {
      const paletteProblems = directionSchemaProblems.filter(problem => /^#\/palette\/[^/]+\/\d+/.test(problem.path));
      if (paletteProblems.length) {
        const grouped = new Map();
        for (const problem of paletteProblems) {
          const match = /^#\/palette\/([^/]+)\/(\d+)/.exec(problem.path);
          const identity = `${match[1]}/${match[2]}`;
          const group = grouped.get(identity) ?? { encodedKey: match[1], index: match[2], problems: [] };
          group.problems.push(`${problem.path} ${problem.message}`);
          grouped.set(identity, group);
        }
        for (const { encodedKey, index, problems } of grouped.values()) {
          const key = encodedKey.replaceAll("~1", "/").replaceAll("~0", "~");
          report.manual.push(`direction.json: palette ${JSON.stringify(key)} entry ${index} requires manual repair; schema preflight failed: ${problems.join("; ")}`);
        }
        for (const problem of directionSchemaProblems.filter(problem => !paletteProblems.includes(problem))) {
          report.manual.push(`direction.json: schema preflight failed after palette migration: ${problem.path} ${problem.message}`);
        }
        return refuse(report, options.collectOutputs);
      }
      throw new Error(`migrated direction.json does not satisfy the v0.7 schema: ${directionSchemaProblems.map(problem => `${problem.path} ${problem.message}`).join("; ")}`);
    }
    stageIfChanged(host, directionFile, JSON_TEXT(migratedDirection.result), "direction.json", report, outputs);
    if (own(manifest, "palette")) report.changes.push({ file: "manifest.json", message: "moved palette to direction.json" });
    if (own(manifest, "descriptors")) report.changes.push({ file: "manifest.json", message: "moved descriptors.mood to direction.json mood" });
    delete manifest.palette;
    delete manifest.descriptors;
  }

  let phase3Plan;
  let oldRulesets;
  if (phase3) {
    if (clocksForPhase3 !== undefined) {
      const migratedClocks = migrateClocks(clocksForPhase3, report);
      const clockSchema = host.loadSchema("clocks.schema.json");
      const clockProblems = validateSchemaDocument(migratedClocks, clockSchema);
      if (clockProblems.length) throw new Error(`migrated clocks.json does not satisfy the v0.7 schema: ${clockProblems.map(problem => `${problem.path} ${problem.message}`).join("; ")}`);
      stageIfChanged(host, clocksFile, JSON_TEXT(migratedClocks), "clocks.json", report, outputs);
    }
    const planEntry = chapters.find(([name]) => name === "05-build-plan.md");
    phase3Plan = planEntry?.[1];
    if (Array.isArray(manifest.graphs) && typeof phase3Plan === "string") {
      const graphResult = migrateGraphs(host, packageRoot, manifest, phase3Plan, report, outputs);
      if (graphResult.failed) return refuse(report, options.collectOutputs);
      phase3Plan = graphResult.text;
    }
    oldRulesets = isObject(manifest.ruleset_state) && Array.isArray(manifest.ruleset_state.rulesets)
      ? structuredClone(manifest.ruleset_state.rulesets)
      : undefined;
    if (own(manifest, "ruleset_state")) {
      delete manifest.ruleset_state;
      report.changes.push({ file: "manifest.json", message: "removed ruleset_state; chapter tags now declare rulesets" });
    }
  }

  if (phase6) {
    const collectionsDirectory = host.path.join(packageRoot, "collections");
    const labels = new Map();
    if (host.exists(collectionsDirectory) && host.isDirectory(collectionsDirectory)) for (const drawer of host.readDir(collectionsDirectory)) {
      if (!drawer.isDirectory) continue;
      const labelFile = host.path.join(collectionsDirectory, drawer.name, "_collection.json");
      if (host.exists(labelFile) && host.isFile(labelFile)) labels.set(`collections/${drawer.name}/_collection.json`, labelFile);
    }
    for (const output of outputs) {
      const relative = host.path.relative(packageRoot, output.file).replaceAll("\\", "/");
      if (/^collections\/[^/]+\/_collection\.json$/.test(relative)) labels.set(relative, output.file);
    }
    for (const [relative, labelFile] of labels) {
      const staged = [...outputs].reverse().find(output => host.path.resolve(output.file) === host.path.resolve(labelFile));
      let input;
      if (staged) {
        try { input = { text: staged.text, document: JSON.parse(staged.text) }; }
        catch (cause) { report.manual.push(`${relative}: could not parse staged JSON (${cause.message}); fix the file and run migration again`); continue; }
      } else input = readJsonForMigration(host, labelFile, relative, report);
      if (input.failed) continue;
      const text = JSON_TEXT(migrateLinkShapes(input.document, report, relative));
      if (staged) staged.text = text;
      else stageIfChanged(host, labelFile, text, relative, report, outputs);
    }
  }

  manifest.opengdd = "0.7";
  delete manifest.build;
  stageIfChanged(host, manifestFile, JSON_TEXT(manifest), "manifest.json", report, outputs);

  const initialId = oldRulesets?.find(entry => isObject(entry) && entry.initial === true)?.id;
  const taggedRulesets = new Set(chapters.flatMap(([, text]) => [...text.matchAll(/^\s*>\s*RULESET:\s*([a-z0-9]+(?:-[a-z0-9]+)*)/gm)].map(match => match[1])));
  if (oldRulesets) for (const entry of oldRulesets) {
    if (isObject(entry) && typeof entry.id === "string" && !taggedRulesets.has(entry.id)) report.changes.push({ file: "manifest.json", message: `ruleset ${JSON.stringify(entry.id)} had no chapter tag and ceases to exist` });
  }
  let initialApplied = false;
  for (const [name, original] of chapters) {
    const before = phase3 && name === "05-build-plan.md" && typeof phase3Plan === "string" ? phase3Plan : original;
    const file = host.path.join(packageRoot, name);
    let after = before;
    if (phase1) {
      after = after.replace(/`invariants\.([A-Za-z0-9_-]+)`/g, "`rules.$1`");
      for (const match of after.matchAll(/`meta\.([A-Za-z0-9_.-]+)`/g)) report.manual.push(`${name}: citation ${match[0]} has no automatic v0.7 form; cite the value key directly, or cite \`ranges.<key>\``);
    }
    if (phase2) {
      after = rewriteDirectionText(after, moodNames, report, name);
      if (/```direction/i.test(after)) after = migrateFence(after, new Map(), report, name);
      for (const match of after.matchAll(/`viewing\.([A-Za-z0-9_.-]+)`/g)) report.manual.push(`${name}: citation ${match[0]} has no v0.7 direction target; move its meaning into prose`);
    }
    if (phase3) {
      after = rewriteRuntimeText(after, report, name);
      after = after.replace(/[ \t]*\[all\]/gi, () => { report.changes.push({ file: name, message: "removed [ALL] mode tag" }); return ""; });
      after = after.replace(/^\s*>\s*RULESET:\s*all\s*\r?\n?/gm, () => { report.changes.push({ file: name, message: "removed > RULESET: all tag" }); return ""; });
      if (!initialApplied && typeof initialId === "string") {
        const pattern = new RegExp(`^(\\s*>\\s*RULESET:\\s*${initialId.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})(\\s*)$`, "m");
        if (pattern.test(after)) {
          after = after.replace(pattern, "$1 (initial)$2");
          initialApplied = true;
          report.changes.push({ file: name, message: `marked ruleset ${JSON.stringify(initialId)} initial` });
        }
      }
    }
    if (phase3 || phase4 || phase6) after = migrateTestBlocks(after, report, name);
    if (phase5Legacy) {
      if (/\bAT\s+[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\b/.test(after.replace(/<!-- opengdd:contracts:generated:begin[\s\S]*/m, ""))) report.manual.push(`${name}: prose names a generated contract AT; replace that dependency with the contract adoption or rendered-test description`);
      after = removeGeneratedContractBlocks(after, report, name).replace(/tuning:contracts\./g, "contracts.");
    }
    stageIfChanged(host, file, after, name, report, outputs);
  }
  if (phase3 && typeof initialId === "string" && !initialApplied) report.manual.push(`manifest.json: initial ruleset ${JSON.stringify(initialId)} has no chapter tag; add (initial) to its first tag after writing one`);
  const beforeFindings = validatePackage(host, packageRoot).findings.filter(finding => finding.severity === "error");
  const beforeSites = new Set(beforeFindings.map(migrationFindingSite));
  const introduced = validatePackage(stagedValidationHost(host, outputs), packageRoot).findings
    .filter(finding => finding.severity === "error" && !beforeSites.has(migrationFindingSite(finding)))
    .filter(finding => {
      if (finding.code !== "TUNING_RULE_INVALID") return true;
      const match = /^rule ("(?:\\.|[^"])*"): retired word /.exec(finding.message);
      return !match || !report.manual.some(item => item.startsWith(`${finding.file}: rule ${match[1]} uses retired word `));
    });
  if (introduced.length) {
    for (const finding of introduced) report.manual.push(`migration validation: ${finding.code} ${finding.file}${finding.line ? `:${finding.line}` : ""} | ${finding.message}`);
    return refuse(report, options.collectOutputs);
  }
  if (!options.dryRun) for (const output of outputs) host.writeText(output.file, output.text);
  if (options.collectOutputs) report.outputs = outputs;
  return report;
}

export function migrateBuildRecord(json) {
  if (!isObject(json)) throw new Error("build record must be an object");
  const document = structuredClone(json);
  const changes = [];
  const manual = [];
  const beganLegacy = document.opengdd === "0.6" || !isObject(document.resolved_tuning?.values);
  if (document.opengdd !== "0.6" && document.opengdd !== "0.7") throw new Error(`opengdd-build.json opengdd must be "0.6" or "0.7", got ${JSON.stringify(document.opengdd)}`);
  if (document.opengdd === "0.6" || !isObject(document.resolved_tuning?.values)) {
    document.opengdd = "0.7";
    const resolved = isObject(document.resolved_tuning) ? document.resolved_tuning : {};
    const values = { ...(isObject(resolved.tunables) ? resolved.tunables : {}) };
    for (const [key, value] of Object.entries(isObject(resolved.constants) ? resolved.constants : {})) {
      if (own(values, key)) manual.push(`opengdd-build.json: ${JSON.stringify(key)} appears in both resolved_tuning tables; kept the tunables value`);
      else values[key] = value;
    }
    document.resolved_tuning = { values };
    changes.push({ file: "opengdd-build.json", message: "set opengdd to 0.7 and merged resolved_tuning into values" });
  }
  if (own(document, "direction_result")) {
    delete document.direction_result;
    changes.push({ file: "opengdd-build.json", message: "deleted historical direction_result" });
  }
  if (isObject(document.evidence) && own(document.evidence, "direction_observations")) {
    delete document.evidence.direction_observations;
    changes.push({ file: "opengdd-build.json", message: "deleted historical evidence.direction_observations" });
  }
  if (isObject(document.evidence) && own(document.evidence, "algorithm")) {
    delete document.evidence.algorithm;
    changes.push({ file: "opengdd-build.json", message: "deleted retired evidence.algorithm; the certification protocol names the hash" });
  }
  if (own(document, "renderer")) {
    changes.push({ file: "opengdd-build.json", message: `stripped retired renderer ${JSON.stringify(document.renderer)}` });
    delete document.renderer;
  }
  if (own(document, "capture_profile")) {
    changes.push({ file: "opengdd-build.json", message: `stripped capture_profile; keep it beside the audit evidence:\n${JSON.stringify(document.capture_profile, null, 2)}` });
    delete document.capture_profile;
  }
  if (own(document, "resources")) {
    changes.push({ file: "opengdd-build.json", message: `stripped resources; keep them beside the audit evidence:\n${JSON.stringify(document.resources, null, 2)}` });
    delete document.resources;
  }
  if (beganLegacy && Object.keys(isObject(document.resolved_tuning?.values) ? document.resolved_tuning.values : {}).some(key => key.startsWith("contracts."))) {
    manual.push("opengdd-build.json: add evidence.contracts with each checked adoption and its matching sha256 pack hash; the migrator cannot infer pack presence without the certifying package");
  }
  return { json: document, changes, manual };
}

function createNodeHost({ fs, path, crypto, fileURLToPath }) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    path: { resolve: path.resolve, relative: path.relative, join: path.join, dirname: path.dirname, basename: path.basename, extname: path.extname, isAbsolute: path.isAbsolute, isAbsoluteWindows: path.win32.isAbsolute, sep: path.sep },
    exists: fs.existsSync,
    isFile: file => fs.statSync(file).isFile(),
    isDirectory: file => fs.statSync(file).isDirectory(),
    isSymbolicLink: file => fs.lstatSync(file).isSymbolicLink(),
    readLink: fs.readlinkSync,
    readText: file => fs.readFileSync(file, "utf8"),
    readDir: directory => fs.readdirSync(directory, { withFileTypes: true }).map(entry => ({ name: entry.name, isFile: entry.isFile(), isDirectory: entry.isDirectory() })),
    size: file => fs.statSync(file).size,
    readBytes: file => new Uint8Array(fs.readFileSync(file)),
    sha256: bytes => crypto.createHash("sha256").update(bytes).digest("hex"),
    loadSchema: name => JSON.parse(fs.readFileSync(path.resolve(here, "..", name), "utf8")),
    writeText: (file, text) => fs.writeFileSync(file, text.replaceAll("\r\n", "\n"), "utf8")
  };
}

function printReport(report, jsonMode) {
  if (jsonMode) return `${JSON.stringify(report, null, 2)}\n`;
  if (report.noOp) return "package already uses OpenGDD v0.7; no changes needed\n";
  const lines = [];
  for (const change of report.changes) lines.push(`CHANGE ${change.file}: ${change.message}`);
  for (const item of report.manual) lines.push(`MANUAL ${item}`);
  if (!lines.length) lines.push("no changes needed");
  return `${lines.join("\n")}\n`;
}

function usage(message) {
  if (message) console.error(message);
  console.error("usage: node conformance/migrate.mjs <package-dir> [--dry-run] [--json]");
  console.error("       node conformance/migrate.mjs --build <opengdd-build.json> [--dry-run] [--json]");
  process.exitCode = 2;
}

async function main(args, modules) {
  const jsonMode = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const buildMode = args.includes("--build");
  const positional = args.filter(arg => !["--json", "--dry-run", "--build"].includes(arg));
  const unknown = positional.find(arg => arg.startsWith("-"));
  if (unknown || positional.length !== 1) return usage(unknown ? `unknown option: ${unknown}` : "exactly one path is required");
  const { fs, path } = modules;
  const host = createNodeHost(modules);
  try {
    let report;
    if (buildMode) {
      const file = path.resolve(positional[0]);
      const before = fs.readFileSync(file, "utf8");
      report = migrateBuildRecord(JSON.parse(before));
      const after = JSON_TEXT(report.json);
      if (before === after) report.changes = [];
      else if (!dryRun) fs.writeFileSync(file, after, "utf8");
    } else {
      report = migratePackage(host, positional[0], { dryRun });
    }
    process.stdout.write(printReport(report, jsonMode));
    process.exitCode = report.manual.length ? 1 : 0;
  } catch (cause) {
    if (jsonMode) process.stdout.write(`${JSON.stringify({ error: cause.message }, null, 2)}\n`);
    else console.error(cause.message);
    process.exitCode = 2;
  }
}

async function runIfMain() {
  if (typeof process === "undefined" || !process.argv?.[1]) return;
  const scriptName = String(process.argv[1]).replaceAll("\\", "/").split("/").at(-1);
  if (scriptName !== "migrate.mjs") return;
  const [{ default: fs }, { default: path }, { default: crypto }, { fileURLToPath }] = await Promise.all([
    import("node:fs"), import("node:path"), import("node:crypto"), import("node:url")
  ]);
  if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main(process.argv.slice(2), { fs, path, crypto, fileURLToPath });
  }
}

if (typeof process !== "undefined") runIfMain();
