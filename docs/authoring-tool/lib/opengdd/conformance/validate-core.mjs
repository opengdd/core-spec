// Pure validation engine. All environment access is supplied by the host.
import { isObject, markdownSlug, own, slash, unfencedLines } from "./package-syntax.mjs?v=de258b84a459";

const SPEC_VERSION = "0.7";
// The revision that reserved the `palette` first segment. §4's versioning clause requires the
// diagnostics on a newly reserved segment to name their revision, so this is
// carried separately from SPEC_VERSION rather than folded into it.
const PALETTE_REVISION = "0.6";
// The revision that reserved the `collections` first segment for the
// collections/ drawers (decision 32). The reservation is what closes the
// format's last silent-rename gap: a prose citation of a drawer or record is
// classified as a mechanism path and a dangling one is a hard failure.
const COLLECTIONS_REVISION = "0.6";
const TUNING_KEY_PATTERN = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)+$/;
const TUNING_KEY_PREFIX = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)+/;

// SPEC §4's versioned prose-citation classifier. Exported so browser-side
// authoring surfaces reject exactly the names the validator classifies as
// format mechanisms or file mentions.
//
// The list is versioned. `content` was claimed in the first draft and given
// back the same day: it is a natural designer namespace, and reserving a
// segment silently disables citation checking for every package that uses it.
// §4's versioning clause: a validator that rejects a key on a newly reserved
// segment names the revision that reserved it. The revision each segment
// was reserved in is `RESERVED_SINCE` in the validator below: v0.6 took
// `palette` and `collections` (decision 32), v0.7 took the seven number
// and direction words (decisions 36 and 39); everything else dates from
// v0.5 — so a key legal under an older draft learns what changed under it.
export const RESERVED_FIRST_SEGMENTS = Object.freeze([
  "pillars", "mood", "anti", "must_keep", "colors", "contrast", "timing",
  "values", "ranges", "rules", "runtime", "clocks",
  "manifest", "build", "contracts", "palette",
  "collections"
]);
export const RESERVED_EXTENSIONS = Object.freeze(["json", "md"]);
const RESERVED_FIRST_SEGMENT_SET = new Set(RESERVED_FIRST_SEGMENTS);
const RESERVED_EXTENSION_SET = new Set(RESERVED_EXTENSIONS);

// ---------------------------------------------------------------------------
// OpenGDD v0.7 number-rule parser and evaluator.
// ---------------------------------------------------------------------------
const RULE_FUNCTIONS = new Map([
  ["min", { min: 1, max: Infinity }],
  ["max", { min: 1, max: Infinity }],
  ["floor", { min: 1, max: 1 }]
]);
const RULE_MAX_DEPTH = 64;
const RULE_MAX_TOKENS = 2048;

function ruleFailure(kind, message, position) {
  const cause = new Error(message);
  cause.kind = kind;
  cause.position = position;
  return cause;
}

function tokenizeRule(source, bareKeys = undefined) {
  if (typeof source !== "string") throw ruleFailure("syntax", "rule must be a string", 0);
  if (/\r|\n/.test(source)) throw ruleFailure("syntax", "rule must be one line", source.search(/\r|\n/));
  const tokens = [];
  const push = token => {
    if (tokens.length >= RULE_MAX_TOKENS) throw ruleFailure("syntax", "rule is too long", token.start);
    tokens.push(token);
  };
  let position = 0;
  while (position < source.length) {
    if (/\s/.test(source[position])) { position += 1; continue; }
    const rest = source.slice(position);
    // A leading `-` is the unary/binary operator. Hyphens remain valid inside
    // dotted-key segments, but treating `-dash.speed` as one key would make the
    // grammar's required unary-minus form impossible to spell.
    if (rest.startsWith("-")) {
      push({ type: "operator", value: "-", start: position, end: position + 1 });
      position += 1;
      continue;
    }
    const key = TUNING_KEY_PREFIX.exec(rest)?.[0];
    const number = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)?.[0];
    if (key && key.split(".").length > 2 && key.split(".").every(segment => /^\d+$/.test(segment))) {
      throw ruleFailure("syntax", `invalid number or key near ${JSON.stringify(rest.slice(0, Math.min(16, rest.length)))}`, position);
    }
    if (key && (!number || key.length > number.length)) {
      push({ type: "key", value: key, start: position, end: position + key.length });
      position += key.length;
      continue;
    }
    if (number) {
      const next = rest[number.length];
      if (next && /[A-Za-z0-9_.]/.test(next)) throw ruleFailure("syntax", `invalid number or key near ${JSON.stringify(rest.slice(0, Math.min(16, rest.length)))}`, position);
      const value = Number(number);
      if (!Number.isFinite(value)) throw ruleFailure("syntax", `numeric literal ${JSON.stringify(number)} is not finite`, position);
      push({ type: "number", value, raw: number, start: position, end: position + number.length });
      position += number.length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(rest)?.[0];
    if (identifier) {
      const followedByCall = /^\s*\(/.test(rest.slice(identifier.length));
      const reservedWord = ["and", "or", "not"].includes(identifier);
      const isKey = bareKeys?.has(identifier) && !reservedWord && !followedByCall;
      push({ type: isKey ? "key" : "identifier", value: identifier, start: position, end: position + identifier.length });
      position += identifier.length;
      continue;
    }
    const operator = /^(?:==|!=|<=|>=|[<>+\-*/(),])/.exec(rest)?.[0];
    if (operator) {
      push({ type: "operator", value: operator, start: position, end: position + operator.length });
      position += operator.length;
      continue;
    }
    throw ruleFailure("syntax", `unexpected character ${JSON.stringify(source[position])}`, position);
  }
  tokens.push({ type: "eof", value: "", start: source.length, end: source.length });
  return tokens;
}

export function parseRule(source, options = {}) {
  const tokens = tokenizeRule(source, options.bareKeys);
  let index = 0;
  let depth = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const takeValue = value => peek().value === value ? take() : undefined;
  const expectValue = value => {
    const token = takeValue(value);
    if (!token) throw ruleFailure("syntax", `expected ${JSON.stringify(value)}`, peek().start);
    return token;
  };
  const binary = (op, left, right) => ({ type: "binary", op, left, right, start: left.start, end: right.end });
  const nested = (position, parse) => {
    if (depth >= RULE_MAX_DEPTH) throw ruleFailure("syntax", "rule is too deeply nested", position);
    depth += 1;
    try { return parse(); } finally { depth -= 1; }
  };

  function primary() {
    const token = peek();
    if (token.type === "number") { take(); return { type: "number", value: token.value, raw: token.raw, start: token.start, end: token.end }; }
    if (token.type === "key") { take(); return { type: "key", name: token.value, start: token.start, end: token.end }; }
    if (takeValue("(")) {
      const open = tokens[index - 1];
      return nested(open.start, () => {
        const expression = additive();
        const close = expectValue(")");
        return { type: "group", expression, start: open.start, end: close.end };
      });
    }
    if (token.type === "identifier") {
      take();
      const name = token.value;
      if (["and", "or", "not"].includes(name)) throw ruleFailure("syntax", `retired word ${JSON.stringify(name)}; write each comparison as its own rule`, token.start);
      if (!takeValue("(")) {
        if (options.bareKeys) throw ruleFailure("reference", `unknown value ${JSON.stringify(name)}`, token.start);
        throw ruleFailure("syntax", `unexpected identifier ${JSON.stringify(name)}; rules use dotted keys`, token.start);
      }
      if (!RULE_FUNCTIONS.has(name)) throw ruleFailure("syntax", `unknown function ${JSON.stringify(name)}`, token.start);
      return nested(token.start, () => {
        const args = [];
        if (peek().value !== ")") {
          do { args.push(additive()); } while (takeValue(","));
        }
        const close = expectValue(")");
        const arity = RULE_FUNCTIONS.get(name);
        if (args.length < arity.min || args.length > arity.max) {
          const expected = arity.max === Infinity ? "one or more arguments" : arity.min === arity.max ? `${arity.min} argument${arity.min === 1 ? "" : "s"}` : `${arity.min}–${arity.max} arguments`;
          throw ruleFailure("syntax", `${name} expects ${expected}; got ${args.length}`, token.start);
        }
        return { type: "call", name, args, start: token.start, end: close.end };
      });
    }
    throw ruleFailure("syntax", "expected a number, dotted key, function call, or parenthesized expression", token.start);
  }

  function unaryMinus() {
    const operator = takeValue("-");
    if (!operator) return primary();
    return nested(operator.start, () => {
      const argument = unaryMinus();
      return { type: "unary", op: "-", argument, start: operator.start, end: argument.end };
    });
  }

  function multiplicative() {
    let node = unaryMinus();
    while (peek().value === "*" || peek().value === "/") {
      const op = take().value;
      node = binary(op, node, unaryMinus());
    }
    return node;
  }

  function additive() {
    let node = multiplicative();
    while (peek().value === "+" || peek().value === "-") {
      const op = take().value;
      node = binary(op, node, multiplicative());
    }
    return node;
  }

  const comparisons = new Set(["==", "!=", "<", "<=", ">", ">="]);
  const left = additive();
  if (!comparisons.has(peek().value)) {
    const detail = peek().type === "identifier" && ["and", "or", "not"].includes(peek().value)
      ? `retired word ${JSON.stringify(peek().value)}`
      : "a rule requires exactly one top-level comparison";
    throw ruleFailure("syntax", detail, peek().start);
  }
  const op = take().value;
  const ast = binary(op, left, additive());
  if (comparisons.has(peek().value)) throw ruleFailure("syntax", "chained comparisons are not allowed; write each comparison as its own rule", peek().start);
  if (peek().type === "identifier" && ["and", "or", "not"].includes(peek().value)) throw ruleFailure("syntax", `retired word ${JSON.stringify(peek().value)}`, peek().start);
  if (peek().type !== "eof") throw ruleFailure("syntax", `unexpected token ${JSON.stringify(peek().value)}`, peek().start);
  ast.source = source;
  return ast;
}

function ruleLookup(lookup, name, position) {
  let found = false;
  let value;
  if (lookup instanceof Map) { found = lookup.has(name); value = lookup.get(name); }
  else if (typeof lookup === "function") { value = lookup(name); found = value !== undefined; }
  else if (isObject(lookup)) { found = own(lookup, name); value = lookup[name]; }
  if (!found) {
    const lookupHas = key => lookup instanceof Map ? lookup.has(key) : isObject(lookup) ? own(lookup, key) : false;
    const subtractionHint = [...name].some((character, index) => character === "-" && lookupHas(name.slice(0, index)) && lookupHas(name.slice(index + 1)));
    const hint = subtractionHint ? " (write spaces around `-` for subtraction)" : "";
    throw ruleFailure("reference", `unknown key ${JSON.stringify(name)}${hint}`, position);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw ruleFailure("arithmetic", `key ${JSON.stringify(name)} does not resolve to a finite number`, position);
  return value;
}

function evaluateRuleNode(ast, lookup) {
  if (ast.type === "number") return ast.value;
  if (ast.type === "key") return ruleLookup(lookup, ast.name, ast.start);
  if (ast.type === "group") return evaluateRuleNode(ast.expression, lookup);
  if (ast.type === "unary") {
    const value = evaluateRuleNode(ast.argument, lookup);
    if (typeof value !== "number") throw ruleFailure("type", "unary `-` requires a number operand", ast.start);
    const result = -value;
    if (!Number.isFinite(result)) throw ruleFailure("arithmetic", "unary `-` produced a non-finite result", ast.start);
    return result;
  }
  if (ast.type === "call") {
    const args = ast.args.map(arg => evaluateRuleNode(arg, lookup));
    if (args.some(value => typeof value !== "number")) throw ruleFailure("type", `${ast.name} requires number operands`, ast.start);
    let result;
    if (ast.name === "min") result = Math.min(...args);
    else if (ast.name === "max") result = Math.max(...args);
    else if (ast.name === "floor") result = Math.floor(args[0]);
    if (!Number.isFinite(result)) throw ruleFailure("arithmetic", `${ast.name} produced a non-finite result`, ast.start);
    return result;
  }
  if (ast.type === "binary") {
    const left = evaluateRuleNode(ast.left, lookup);
    const right = evaluateRuleNode(ast.right, lookup);
    if (["+", "-", "*", "/"].includes(ast.op)) {
      if (typeof left !== "number" || typeof right !== "number") throw ruleFailure("type", `\`${ast.op}\` requires number operands`, ast.start);
      if (ast.op === "/" && right === 0) throw ruleFailure("arithmetic", "division by zero", ast.start);
      const result = ast.op === "+" ? left + right : ast.op === "-" ? left - right : ast.op === "*" ? left * right : left / right;
      if (!Number.isFinite(result)) throw ruleFailure("arithmetic", `\`${ast.op}\` produced a non-finite result`, ast.start);
      return result;
    }
    if (["==", "!="].includes(ast.op)) {
      if (typeof left !== "number" || typeof right !== "number") throw ruleFailure("type", `\`${ast.op}\` requires number operands`, ast.start);
      return ast.op === "==" ? left === right : left !== right;
    }
    if (typeof left !== "number" || typeof right !== "number") throw ruleFailure("type", `\`${ast.op}\` requires number operands`, ast.start);
    if (ast.op === "<") return left < right;
    if (ast.op === "<=") return left <= right;
    if (ast.op === ">") return left > right;
    if (ast.op === ">=") return left >= right;
  }
  throw ruleFailure("syntax", "invalid rule syntax tree", ast.start ?? 0);
}

export function evaluateRule(ast, lookup) {
  const value = evaluateRuleNode(ast, lookup);
  if (typeof value !== "boolean") throw ruleFailure("type", "a rule must evaluate to a boolean", ast.start ?? 0);
  return value;
}

function ruleNodeText(ast, lookup) {
  const source = ast.source ?? "";
  const replacements = [];
  (function visit(node) {
    if (node.type === "key") replacements.push({ start: node.start, end: node.end, value: String(ruleLookup(lookup, node.name, node.start)) });
    else if (node.type === "group") visit(node.expression);
    else if (node.type === "unary") visit(node.argument);
    else if (node.type === "binary") { visit(node.left); visit(node.right); }
    else if (node.type === "call") node.args.forEach(visit);
  })(ast);
  let rendered = source.slice(ast.start, ast.end);
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    const start = replacement.start - ast.start;
    const end = replacement.end - ast.start;
    rendered = `${rendered.slice(0, start)}${replacement.value}${rendered.slice(end)}`;
  }
  return rendered;
}

function singleKeyNode(ast) {
  while (ast.type === "group") ast = ast.expression;
  return ast.type === "key" ? ast : undefined;
}

function ruleFailureDetail(sourceAst, failed, lookup) {
  const comparisons = new Set(["==", "!=", "<", "<=", ">", ">="]);
  if (failed.type === "binary" && comparisons.has(failed.op)) {
    const leftText = ruleNodeText({ ...failed.left, source: sourceAst.source }, lookup);
    const rightText = ruleNodeText({ ...failed.right, source: sourceAst.source }, lookup);
    const left = evaluateRuleNode(failed.left, lookup);
    const right = evaluateRuleNode(failed.right, lookup);
    const leftKey = singleKeyNode(failed.left);
    const rightKey = singleKeyNode(failed.right);
    const leftShown = leftKey ? `${leftKey.name} = ${left}` : leftText === String(left) ? leftText : `${leftText} = ${left}`;
    const rightShown = rightKey ? `${rightKey.name} = ${right}` : rightText === String(right) ? rightText : `${rightText} = ${right}`;
    return `${leftShown}, which is not ${failed.op} ${rightShown}`;
  }
  return `${ruleNodeText({ ...failed, source: sourceAst.source }, lookup)} evaluates ${String(evaluateRuleNode(failed, lookup))}`;
}

function formatRuleFailure(name, source, ast, lookup, subject = undefined) {
  const details = [`  ${ruleFailureDetail(ast, ast, lookup)}`];
  return `${subject ? `${subject} ` : ""}rule ${JSON.stringify(name)} does not hold\n  ${source}\n${details.join("\n")}`;
}

function createValidator(host) {
  const { path } = host;
  const findings = [];
  const findingKeys = new Set();
  const skipped = [];
  const skippedChecks = new Set();

  function skip(check, reason) {
    if (skippedChecks.has(check)) return;
    skippedChecks.add(check);
    skipped.push({ check, reason });
  }

  // The injection-surface lint is a review aid, not a conformance requirement.
  // Every finding in this family MUST remain WARNING, never FAIL.
  const INJECTION_LINT_STATUS = "advisory-v0.7";
  const INJECTION_LINT_SECTION = "SPEC v0.7 — specs are data (injection-surface lint)";
  const INJECTION_SCAN_MAX_BYTES = 2 * 1024 * 1024;
  const INJECTION_TEXT_EXTENSIONS = new Set([
    ".csv", ".htm", ".html", ".json", ".jsonl", ".markdown", ".md",
    ".ndjson", ".svg", ".toml", ".tsv", ".txt", ".xml", ".yaml", ".yml"
  ]);

  // A build record is validated against a certifying package, and reading that
  // package means running package checks over it. Their findings belong to the
  // package's own report, not to the record's, so the reads that only gather
  // facts run with the sink closed.
  let findingsSuppressed = 0;
  function quietly(fn) {
    findingsSuppressed += 1;
    try { return fn(); } finally { findingsSuppressed -= 1; }
  }

  function addFinding(severity, code, section, file, message, line = undefined, data = undefined, dependent = false) {
    if (findingsSuppressed > 0) return;
    const finding = { severity, code, spec_section: section, file: slash(file), message };
    if (line !== undefined) finding.line = line;
    if (data !== undefined) finding.data = data;
    if (dependent) finding.dependent = true;
    // The marker stays outside this key on purpose; identical emissions must agree on it.
    const key = JSON.stringify([severity, code, section, finding.file, line, message]);
    if (!findingKeys.has(key)) {
      findingKeys.add(key);
      findings.push(finding);
    }
  }

  const error = (...args) => addFinding("error", ...args);
  const warning = (...args) => addFinding("warning", ...args);
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (isObject(value)) {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  }

  function deepKey(value) {
    return JSON.stringify(canonical(value));
  }

  function pointerEscape(token) {
    return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
  }

  function parseJsonFile(file, display, section, code) {
    try {
      return JSON.parse(host.readText(file));
    } catch (cause) {
      error(code, section, display, `is not valid JSON: ${cause.message}`);
      return undefined;
    }
  }

  function resolveSchemaRef(root, ref) {
    if (!ref.startsWith("#/")) throw new Error(`unsupported schema reference ${ref}`);
    let current = root;
    for (const raw of ref.slice(2).split("/")) {
      const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
      current = current?.[token];
    }
    if (current === undefined) throw new Error(`unresolved schema reference ${ref}`);
    return current;
  }

  function schemaTypeMatches(value, type) {
    if (Array.isArray(type)) return type.some(candidate => schemaTypeMatches(value, candidate));
    if (type === "object") return isObject(value);
    if (type === "array") return Array.isArray(value);
    if (type === "string") return typeof value === "string";
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "boolean") return typeof value === "boolean";
    if (type === "null") return value === null;
    return false;
  }

  // Implements exactly the JSON Schema constructs used by manifest.schema.json.
  function schemaProblems(instance, schema, schemaRoot, instancePath = "#") {
    const problems = [];
    if (!isObject(schema)) return problems;

    if (schema.$ref) {
      try {
        problems.push(...schemaProblems(instance, resolveSchemaRef(schemaRoot, schema.$ref), schemaRoot, instancePath));
      } catch (cause) {
        problems.push({ path: instancePath, message: cause.message });
      }
    }

    if (Array.isArray(schema.oneOf)) {
      const alternatives = schema.oneOf.map(branch => schemaProblems(instance, branch, schemaRoot, instancePath));
      const passing = alternatives.filter(branch => branch.length === 0).length;
      if (passing !== 1) {
        if (passing > 1) {
          problems.push({ path: instancePath, message: `matches ${passing} oneOf alternatives; exactly one is required` });
        } else {
          const closest = [...alternatives].sort((a, b) => a.length - b.length)[0] ?? [];
          problems.push({ path: instancePath, message: "does not match any oneOf alternative" }, ...closest);
        }
      }
      return problems;
    }

    if (Array.isArray(schema.anyOf)) {
      const alternatives = schema.anyOf.map(branch => schemaProblems(instance, branch, schemaRoot, instancePath));
      if (!alternatives.some(branch => branch.length === 0)) {
        const closest = [...alternatives].sort((a, b) => a.length - b.length)[0] ?? [];
        problems.push({ path: instancePath, message: "does not match any anyOf alternative" }, ...closest);
      }
    }

    if (Array.isArray(schema.allOf)) {
      for (const branch of schema.allOf) problems.push(...schemaProblems(instance, branch, schemaRoot, instancePath));
    }

    if (isObject(schema.if)) {
      const ifProblems = schemaProblems(instance, schema.if, schemaRoot, instancePath);
      const branch = ifProblems.length === 0 ? schema.then : schema.else;
      if (isObject(branch)) problems.push(...schemaProblems(instance, branch, schemaRoot, instancePath));
    }

    if (isObject(schema.not) && schemaProblems(instance, schema.not, schemaRoot, instancePath).length === 0) {
      problems.push({ path: instancePath, message: "matches a forbidden schema shape" });
    }

    if (schema.type && !schemaTypeMatches(instance, schema.type)) {
      problems.push({ path: instancePath, message: `must be ${schema.type}` });
      return problems;
    }
    if (own(schema, "const") && deepKey(instance) !== deepKey(schema.const)) {
      problems.push({ path: instancePath, message: `must equal ${JSON.stringify(schema.const)}` });
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(item => deepKey(item) === deepKey(instance))) {
      problems.push({ path: instancePath, message: `must be one of ${schema.enum.map(JSON.stringify).join(", ")}` });
    }

    if (typeof instance === "string") {
      if (schema.minLength !== undefined && [...instance].length < schema.minLength) {
        problems.push({ path: instancePath, message: `must contain at least ${schema.minLength} character(s)` });
      }
      if (schema.pattern !== undefined) {
        let regex;
        try { regex = new RegExp(schema.pattern, "u"); } catch { regex = undefined; }
        if (!regex || !regex.test(instance)) problems.push({ path: instancePath, message: `must match /${schema.pattern}/` });
      }
    }

    if (typeof instance === "number" && Number.isFinite(instance)) {
      if (schema.minimum !== undefined && instance < schema.minimum) {
        problems.push({ path: instancePath, message: `must be >= ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && instance > schema.maximum) {
        problems.push({ path: instancePath, message: `must be <= ${schema.maximum}` });
      }
      if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) {
        problems.push({ path: instancePath, message: `must be > ${schema.exclusiveMinimum}` });
      }
      if (schema.exclusiveMaximum !== undefined && instance >= schema.exclusiveMaximum) {
        problems.push({ path: instancePath, message: `must be < ${schema.exclusiveMaximum}` });
      }
    }

    if (Array.isArray(instance)) {
      if (schema.minItems !== undefined && instance.length < schema.minItems) {
        problems.push({ path: instancePath, message: `must contain at least ${schema.minItems} item(s)` });
      }
      if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
        problems.push({ path: instancePath, message: `must contain at most ${schema.maxItems} item(s)` });
      }
      if (schema.uniqueItems) {
        const seen = new Set();
        for (let index = 0; index < instance.length; index += 1) {
          const key = deepKey(instance[index]);
          if (seen.has(key)) problems.push({ path: `${instancePath}/${index}`, message: "duplicates an earlier array item" });
          seen.add(key);
        }
      }
      if (schema.items) {
        instance.forEach((item, index) => {
          problems.push(...schemaProblems(item, schema.items, schemaRoot, `${instancePath}/${index}`));
        });
      }
      if (isObject(schema.contains)) {
        const hasMatch = instance.some((item, index) => schemaProblems(item, schema.contains, schemaRoot, `${instancePath}/${index}`).length === 0);
        if (!hasMatch) problems.push({ path: instancePath, message: "must contain at least one item matching the required shape" });
      }
    }

    if (isObject(instance)) {
      for (const key of schema.required ?? []) {
        if (!own(instance, key)) problems.push({ path: instancePath, message: `is missing required property ${JSON.stringify(key)}` });
      }
      if (schema.minProperties !== undefined && Object.keys(instance).length < schema.minProperties) {
        problems.push({ path: instancePath, message: `must contain at least ${schema.minProperties} propert(y/ies)` });
      }
      if (schema.maxProperties !== undefined && Object.keys(instance).length > schema.maxProperties) {
        problems.push({ path: instancePath, message: `must contain at most ${schema.maxProperties} propert(y/ies)` });
      }
      if (isObject(schema.propertyNames)) {
        for (const key of Object.keys(instance)) {
          for (const problem of schemaProblems(key, schema.propertyNames, schemaRoot, `${instancePath}/${pointerEscape(key)}`)) {
            problems.push({ ...problem, message: `property name ${JSON.stringify(key)} ${problem.message}` });
          }
        }
      }
      const declared = schema.properties ?? {};
      const patterns = isObject(schema.patternProperties) ? Object.entries(schema.patternProperties) : [];
      for (const [key, value] of Object.entries(instance)) {
        const pattern = patterns.find(([expression]) => { try { return new RegExp(expression).test(key); } catch { return false; } });
        if (own(declared, key)) {
          problems.push(...schemaProblems(value, declared[key], schemaRoot, `${instancePath}/${pointerEscape(key)}`));
        } else if (pattern) {
          if (isObject(pattern[1])) problems.push(...schemaProblems(value, pattern[1], schemaRoot, `${instancePath}/${pointerEscape(key)}`));
        } else if (schema.additionalProperties === false) {
          problems.push({ path: `${instancePath}/${pointerEscape(key)}`, message: "is not an allowed property" });
        } else if (isObject(schema.additionalProperties)) {
          problems.push(...schemaProblems(value, schema.additionalProperties, schemaRoot, `${instancePath}/${pointerEscape(key)}`));
        }
      }
    }
    return problems;
  }

  function isInside(parent, child) {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  }

  function linkTraversalStaysInside(packageRoot, resolved) {
    const initial = path.relative(packageRoot, resolved);
    const queue = initial === "" ? [] : initial.split(path.sep).filter(Boolean);
    let current = packageRoot;
    const visited = new Set();
    while (queue.length) {
      current = path.join(current, queue.shift());
      if (!host.exists(current) || !host.isSymbolicLink(current)) continue;
      const state = `${current}\0${queue.join("/")}`;
      if (visited.has(state) || visited.size >= 40) return false;
      visited.add(state);
      const target = path.resolve(path.dirname(current), host.readLink(current));
      if (!isInside(packageRoot, target)) return false;
      const targetParts = path.relative(packageRoot, target).split(path.sep).filter(Boolean);
      queue.unshift(...targetParts);
      current = packageRoot;
    }
    return isInside(packageRoot, current);
  }

  function makePathResolver(packageRoot) {
    return function resolvePackagePath(relativePath, label, section, code, options = {}) {
      const display = options.display ?? "manifest.json";
      if (typeof relativePath !== "string" || relativePath.length === 0) return undefined;
      if (relativePath.includes("\0") || path.isAbsolute(relativePath) || path.isAbsoluteWindows(relativePath)) {
        error(code, section, display, `${label} must be a package-relative path, got ${JSON.stringify(relativePath)}`);
        return undefined;
      }
      const platformPath = relativePath.replace(/[\\/]/g, path.sep);
      const resolved = path.resolve(packageRoot, platformPath);
      if (!isInside(packageRoot, resolved)) {
        error(code, "§1", display, `${label} escapes the package after normalization: ${JSON.stringify(relativePath)}`);
        return undefined;
      }
      if (options.within && !isInside(options.within, resolved)) {
        error(code, section, display, `${label} escapes its declared collection directory: ${JSON.stringify(relativePath)}`);
        return undefined;
      }
      if (options.mustExist && !host.exists(resolved)) {
        error(code, section, display, `${label} does not exist: ${JSON.stringify(relativePath)}`);
        return undefined;
      }
      if (host.exists(resolved)) {
        try {
          if (!linkTraversalStaysInside(packageRoot, resolved)) {
            error(code, "§1", display, `${label} resolves through a link outside the package: ${JSON.stringify(relativePath)}`);
            return undefined;
          }
          if (options.kind === "file" && !host.isFile(resolved)) {
            error(code, section, display, `${label} is not a file: ${JSON.stringify(relativePath)}`);
            return undefined;
          }
          if (options.kind === "directory" && !host.isDirectory(resolved)) {
            error(code, section, display, `${label} is not a directory: ${JSON.stringify(relativePath)}`);
            return undefined;
          }
        } catch (cause) {
          error(code, section, display, `${label} cannot be inspected: ${cause.message}`);
          return undefined;
        }
      }
      return resolved;
    };
  }

  // ---------------------------------------------------------------------------
  // SPEC §2 — where an authority tag reaches.
  //
  // A tag scopes from its own line to the end of the heading section holding
  // it, so a section is Fixed only when no tag sits anywhere inside it and no
  // enclosing section's tag reaches down into it. A tag on the section's first
  // line and a tag three paragraphs later hand away exactly as much. Both
  // §1b's `> COLLECTION:` claims and §10.7 citations ask that one question,
  // so they ask it in one place.
  // ---------------------------------------------------------------------------
  function markdownHeadings(lines) {
    return lines.map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      return match ? { level: match[1].length, title: match[2], slug: markdownSlug(match[2]), line: index + 1, index } : undefined;
    }).filter(Boolean);
  }

  function authorityTagReaching(lines, headings, heading) {
    const sectionEnd = anchor => headings.find(item => item.index > anchor.index && item.level <= anchor.level)?.index ?? lines.length;
    const end = sectionEnd(heading);
    let fenced = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (/^\s*```/.test(lines[index])) { fenced = !fenced; continue; }
      if (fenced) continue;
      const match = /^\s*> (DELEGATED|PERSONALIZATION):\s*(\S*)/.exec(lines[index]);
      if (!match) continue;
      const tag = {
        label: match[1] === "DELEGATED" ? "Delegated" : "a Personalization",
        level: match[1] === "DELEGATED" ? "delegated" : "personalization",
        question: match[2] || undefined,
        line: index + 1
      };
      if (index > heading.index && index < end) return { ...tag, where: "inside" };
      const owner = [...headings].reverse().find(item => item.index < index);
      if (owner && index < heading.index && heading.index < sectionEnd(owner)) return { ...tag, where: "enclosing" };
    }
    return undefined;
  }

  function loadPersonalization(packageRoot, manifest, resolvePath) {
    const empty = { questions: new Map(), doc: undefined, display: undefined, declared: false, readable: false };
    const display = "personalization.json";
    const file = path.join(packageRoot, display);
    if (!host.exists(file) || !host.isFile(file)) return empty;
    const doc = parseJsonFile(file, display, "§5", "PERSONALIZATION_JSON");
    // SPEC §2d — personalization.json is one of the schema-validated package
    // files. The bespoke §5 checks below and in validatePersonalizationSets
    // stay: they read tuning.json, which no single-document schema can.
    if (doc !== undefined) {
      const schema = loadSchema("personalization.schema.json", "§5");
      if (schema) {
        const retired = new Set(["tuning_overrides", "resolution", "operation", "operand", "bounds", "out_of_range", "affects"]);
        for (const problem of schemaProblems(doc, schema, schema)) {
          const field = problem.path.split("/").at(-1);
          const hint = problem.message === "is not an allowed property" && retired.has(field)
            ? `; ${JSON.stringify(field)} is retired; run \`opengdd migrate <package-dir>\``
            : "";
          error("PERSONALIZATION_SCHEMA", "§5", display, `${problem.path} ${problem.message}${hint}`);
        }
      }
    }
    if (!isObject(doc) || !Array.isArray(doc.questions)) {
      return { ...empty, doc: isObject(doc) ? doc : undefined, display, declared: true, readable: doc !== undefined };
    }
    const questionIds = new Set();
    doc.questions.forEach((question, questionIndex) => {
      if (!isObject(question)) return;
      const at = `#/questions/${questionIndex}`;
      if (typeof question.id === "string") {
        if (questionIds.has(question.id)) error("PERSONALIZATION_QUESTION_ID", "§5", display, `${at}/id duplicates question id ${JSON.stringify(question.id)}`);
        questionIds.add(question.id);
      }
      if (own(question, "sets") && question.type !== "number") {
        const questionName = typeof question.id === "string" ? `\`${question.id}\`` : `at index ${questionIndex}`;
        const questionType = typeof question.type === "string" ? `\`${question.type}\`` : JSON.stringify(question.type);
        error("PERSONALIZATION_SETS_TYPE", "§5", display, `\`sets\` is legal on a number question and on a choice option, not on question ${questionName} of type ${questionType}`);
      }
      if (question.type === "choice" && Array.isArray(question.options)) {
        const optionIds = new Set();
        question.options.forEach((option, optionIndex) => {
          if (!isObject(option) || typeof option.id !== "string") return;
          if (optionIds.has(option.id)) error("PERSONALIZATION_OPTION_ID", "§5", display, `${at}/options/${optionIndex}/id duplicates option id ${JSON.stringify(option.id)} within question ${JSON.stringify(question.id)}`);
          optionIds.add(option.id);
        });
        if (typeof question.default === "string" && !optionIds.has(question.default)) {
          error("PERSONALIZATION_DEFAULT_OPTION", "§5", display, `${at}/default ${JSON.stringify(question.default)} does not name a declared option id`);
        }
      }
    });
    const questions = new Map(doc.questions.filter(isObject).filter(question => typeof question.id === "string").map(question => [question.id, question]));
    return { questions, doc, display, declared: true, readable: true };
  }

  // ---------------------------------------------------------------------------
  // One range representation for both declaration sites.
  //
  // Both tuning and contract values use the same inclusive two-number range.
  // ---------------------------------------------------------------------------
  function boundsFromPair(range) {
    return Array.isArray(range) && range.length === 2 && range.every(bound => typeof bound === "number" && Number.isFinite(bound))
      ? { min: range[0], max: range[1] }
      : undefined;
  }

  function outsideBounds(bounds, value) {
    return (bounds.min !== undefined && value < bounds.min) || (bounds.max !== undefined && value > bounds.max);
  }

  function describeBounds(bounds) {
    if (bounds.min !== undefined && bounds.max !== undefined) return `[${bounds.min}, ${bounds.max}]`;
    if (bounds.min !== undefined) return `[${bounds.min}, unbounded]`;
    return `[unbounded, ${bounds.max}]`;
  }

  // SPEC §5 — every `sets` target exists, carries a range, and receives a
  // value inside that range. Contract values are Fixed adoption data and are
  // never personalization targets.
  function validatePersonalizationSets(personalization, tuningDoc) {
    const doc = personalization?.doc;
    if (!isObject(doc) || !isObject(tuningDoc)) return;
    const display = personalization.display ?? "personalization.json";
    const values = isObject(tuningDoc.values) ? tuningDoc.values : {};
    const ranges = isObject(tuningDoc.ranges) ? tuningDoc.ranges : {};
    const targetRange = (key, site) => {
      if (key.startsWith("contracts.")) {
        error("PERSONALIZATION_SETS_TARGET", "§5", display, `${site} names ${JSON.stringify(key)}; a contract's values are fixed in the adoption; they cannot be set per build`);
        return undefined;
      }
      if (!own(values, key)) {
        error("PERSONALIZATION_SETS_TARGET", "§5", display, `${site} names no declared values key`);
        return undefined;
      }
      const range = boundsFromPair(ranges[key]);
      if (!range) error("PERSONALIZATION_SETS_UNRANGED", "§5", display, `${site} names ${JSON.stringify(key)}, but only a key with a range can be set`);
      return range;
    };
    const checkValue = (key, value, site) => {
      const range = targetRange(key, site);
      if (range && typeof value === "number" && Number.isFinite(value) && outsideBounds(range, value)) {
        error("PERSONALIZATION_SETS_RANGE", "§5", display, `${site} sets ${JSON.stringify(key)} to ${value}, outside its inclusive range ${describeBounds(range)}`);
      }
    };
    for (const [questionIndex, question] of (doc.questions ?? []).entries()) {
      if (!isObject(question)) continue;
      if (question.type === "choice" && Array.isArray(question.options)) {
        for (const [optionIndex, option] of question.options.entries()) {
          if (!isObject(option?.sets)) continue;
          for (const [key, value] of Object.entries(option.sets)) {
            checkValue(key, value, `#/questions/${questionIndex}/options/${optionIndex}/sets/${pointerEscape(key)}`);
          }
        }
      } else if (question.type === "number" && typeof question.sets === "string") {
        checkValue(question.sets, question.default, `#/questions/${questionIndex}/sets`);
      }
    }
  }

  function walk(value, visit, pointer = "#", ancestors = []) {
    visit(value, pointer, ancestors);
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${pointer}/${index}`, [...ancestors, value]));
    else if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        walk(item, visit, `${pointer}/${pointerEscape(key)}`, [...ancestors, { object: value, key }]);
      }
    }
  }

  function collectIds(value) {
    const ids = new Set();
    walk(value, item => {
      if (isObject(item) && (typeof item.id === "string" || typeof item.id === "number")) ids.add(String(item.id));
    });
    return ids;
  }

  // SPEC §7a — grid congruence. A drawer's record schema marks fields with
  // type "grid" (decision 33 — the label's separate layout block and its
  // one-value cell_unit field are retired; the format fixes the unit at
  // Unicode scalar values). These are existence-level package checks over
  // EVERY record of a drawer whose schema declares at least one grid field.
  // A grid field's own presence and string-array shape are the record-schema
  // check's to report; congruence over the fields that are grids is this one's.
  function validateGridLayers(gridFields, recordEntries) {
    if (!Array.isArray(gridFields) || gridFields.length === 0) return;
    for (const entry of recordEntries) {
      const record = entry.record;
      if (!isObject(record)) continue;
      const present = [];
      for (const layer of gridFields) {
        const value = record[layer];
        if (!Array.isArray(value) || !value.every(row => typeof row === "string")) continue;
        present.push({ layer, rows: value });
      }
      if (present.length === 0) continue;
      const reference = present[0];
      const rowCount = reference.rows.length;
      let rowsAgree = true;
      for (const candidate of present) {
        if (candidate.rows.length !== rowCount) {
          rowsAgree = false;
          error("CONTENT_LAYER_ROW_MISMATCH", "§7a", entry.display, `grid field ${JSON.stringify(candidate.layer)} has ${candidate.rows.length} row(s); grid field ${JSON.stringify(reference.layer)} has ${rowCount}`, undefined, { diagnostic: "layer-row-mismatch", record: entry.id, field: candidate.layer });
        }
      }
      if (rowCount < 1) {
        error("CONTENT_LAYER_ROW_MISMATCH", "§7a", entry.display, `grid has zero rows; every collection-record grid is at least 1×1`, undefined, { diagnostic: "layer-row-mismatch", record: entry.id, field: reference.layer });
        continue;
      }
      if (!rowsAgree) continue;
      const columns = [...reference.rows[0]].length;
      for (const candidate of present) {
        candidate.rows.forEach((row, rowIndex) => {
          const width = [...row].length;
          if (width !== columns || width < 1) {
            error("CONTENT_LAYER_COLUMN_MISMATCH", "§7a", entry.display, `grid field ${JSON.stringify(candidate.layer)} row ${rowIndex} has ${width} column(s); the record's grid is ${columns} wide`, undefined, { diagnostic: "layer-column-mismatch", record: entry.id, field: candidate.layer, row: rowIndex });
          }
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SPEC §1b (decision 33) — a collection is a folder with record files in
  // it, and everything else is opt-in.
  //
  // `collections/` is a reserved package-root directory. Each immediate
  // subdirectory is one collection; the folder name is the collection id, and
  // presence is the whole declaration. One JSON file per record, the filename
  // minus `.json` the record's id and address, the body designer data. The
  // optional `_collection.json` label appears only when it has something to
  // say, and its one field is `record`: an optional record schema in the
  // closed field grammar §10.4 and §1b share (with `grid` as §1b's dialect
  // and `citation`/flag-domain conditions as §10's — the two implementations
  // below and in the contracts layer must stay verdict-aligned). With a
  // schema every record is validated against it; without one, records are
  // free-form and the format says so rather than pretending otherwise.
  // Drawers are Fixed spec data — statements of the package, like inline
  // contract rows — so no drawer authority exists; prose delegation about a
  // game's content is ordinary §2 prose. Prose cites drawers and records
  // (`collections.<drawer>`, `collections.<drawer>.<record>`); a drawer
  // nothing reaches is a warning, not an order.
  // ---------------------------------------------------------------------------
  const COLLECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const COLLECTION_FIELD_ID = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;
  const COLLECTION_FIELD_TYPES = new Set(["number", "integer", "string", "grid", "link", "list"]);

  // The record schema's own shape: the §10.4 field grammar, row-domain
  // conditions only (there are no flags to read outside a contract), and
  // `grid` in place of `citation`. Returns the field map, or undefined when
  // the schema is too broken to check records against.
  function validateDrawerSchema(record, display, root = "#/record") {
    if (!isObject(record)) {
      error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${root} must map field names to field-shape objects`);
      return undefined;
    }
    const fields = new Map();
    for (const [field, shape] of Object.entries(record)) {
      if (field.startsWith("_")) continue;
      const at = `${root}/${field}`;
      // Decision 41's adopted field examples use designer-owned snake_case;
      // collection fields therefore use the tuning-segment character set,
      // independently of the narrower contract-row grammar.
      if (!COLLECTION_FIELD_ID.test(field)) {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at} field name ${JSON.stringify(field)} must use lowercase letters, digits, underscores, or internal hyphens`);
        continue;
      }
      if (!isObject(shape)) {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at} must be a field-shape object`);
        continue;
      }
      for (const key of Object.keys(shape)) {
        if (!["type", "required", "when", "options", "pattern", "unique", "description", "to", "many", "loops", "mirrored_by", "of"].includes(key)) {
          error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/${key} is not a field-shape member`);
        }
      }
      if (!COLLECTION_FIELD_TYPES.has(shape.type)) {
        const hint = shape.type === "reference" ? "; `reference` is now `link` (run `opengdd migrate`)" : "";
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/type must be one of ${[...COLLECTION_FIELD_TYPES].join(", ")}, got ${JSON.stringify(shape.type)}${hint}`);
        continue;
      }
      if (own(shape, "required") && own(shape, "when")) {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at} declares both required and when; at most one is legal (absent both means optional)`);
      }
      if (own(shape, "required") && typeof shape.required !== "boolean") {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/required must be a boolean`);
      }
      if (own(shape, "unique") && typeof shape.unique !== "boolean") {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/unique must be a boolean`);
      }
      if (own(shape, "description") && typeof shape.description !== "string") {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/description must be a string`);
      }
      if (own(shape, "pattern")) {
        if (shape.type !== "string") error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/pattern is legal on a string field only`);
        if (shape.pattern !== "kebab-case") error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/pattern admits only "kebab-case" today, got ${JSON.stringify(shape.pattern)}`);
      }
      if (own(shape, "options")) {
        if (shape.type !== "string") error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/options is legal on a string field only`);
        if (!Array.isArray(shape.options) || shape.options.length === 0 || shape.options.some(value => typeof value !== "string" || !COLLECTION_ID.test(value) || value.length > 64)) {
          error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/options must be a non-empty array of kebab-case values of at most 64 characters (§10.4's closed-choice rule)`);
        }
      }
      if (shape.type === "link") {
        if (typeof shape.to !== "string" || !COLLECTION_ID.test(shape.to)) error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/to is required on a link and must be a drawer id`);
        if (own(shape, "many") && typeof shape.many !== "boolean") error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/many must be a boolean`);
        if (own(shape, "loops") && typeof shape.loops !== "boolean") {
          const hint = shape.loops === "never" ? '; `"loops": "never"` is now `"loops": false` (run `opengdd migrate`)' : "";
          error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/loops must be true or false${hint}`);
        }
        if (own(shape, "mirrored_by") && (typeof shape.mirrored_by !== "string" || !COLLECTION_FIELD_ID.test(shape.mirrored_by))) error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/mirrored_by must be a field name`);
      } else {
        for (const key of ["to", "many", "loops", "mirrored_by"]) if (own(shape, key)) error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/${key} is legal on a link field only`);
      }
      if (shape.type === "list") {
        shape.of = validateDrawerSchema(shape.of, display, `${at}/of`);
      } else if (own(shape, "of")) {
        error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/of is legal on a list field only`);
      }
      if (own(shape, "when")) {
        // §§10.3–10.4: an absent or empty `when` is satisfied, so `{}` is legal
        // here exactly as it is on the contracts side.
        if (!isObject(shape.when) || Object.keys(shape.when).some(key => key !== "row")) {
          error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/when must be a condition object with a row domain only; there are no flags outside a contract`);
        } else if (own(shape.when, "row") && (!isObject(shape.when.row) || Object.entries(shape.when.row).some(([, values]) => !Array.isArray(values) || values.length === 0))) {
          error("COLLECTION_SCHEMA_SHAPE", "§1b", display, `${at}/when/row must map a field name to a non-empty array of values`);
        }
      }
      fields.set(field, shape);
    }
    return fields;
  }

  function validateDrawerRecords(fields, recordEntries, links, drawerId) {
    const uniqueSeen = new Map();
    const validateRow = (fieldsHere, row, entry, at) => {
      if (!isObject(row)) {
        error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${at} must be an object`, undefined, { record: entry.id, field: at });
        return;
      }
      for (const key of Object.keys(row)) {
        if (key.startsWith("_")) continue;
        if (!fieldsHere.has(key)) {
          const fieldAt = at ? `${at}.${key}` : key;
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `carries field ${JSON.stringify(fieldAt)}, which the drawer's record schema does not declare`, undefined, { record: entry.id, field: fieldAt });
        }
      }
      for (const [field, shape] of fieldsHere) {
        const present = own(row, field);
        const conditional = own(shape, "when");
        const required = shape.required === true || (conditional && contractWhenSatisfied(shape.when, {}, undefined, row));
        const fieldAt = at ? `${at}.${field}` : field;
        if (conditional && !required && present) {
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${fieldAt} is present, but its condition is unsatisfied; a conditioned field is required exactly when its \`when\` holds and forbidden otherwise`, undefined, { record: entry.id, field: fieldAt });
          continue;
        }
        if (!present) {
          if (required) error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `is missing ${conditional ? "conditionally required" : "required"} field ${JSON.stringify(fieldAt)}`, undefined, { record: entry.id, field: fieldAt });
          continue;
        }
        const value = row[field];
        if (shape.type === "number" && typeof value !== "number") {
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} must be a number, got ${JSON.stringify(value)}`, undefined, { record: entry.id, field });
        } else if (shape.type === "integer" && !Number.isInteger(value)) {
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} must be an integer, got ${JSON.stringify(value)}`, undefined, { record: entry.id, field });
        } else if (shape.type === "string" && typeof value !== "string") {
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} must be a string, got ${JSON.stringify(value)}`, undefined, { record: entry.id, field });
        } else if (shape.type === "grid" && (!Array.isArray(value) || !value.every(item => typeof item === "string"))) {
          error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} must be a grid: an array of strings, one per row`, undefined, { record: entry.id, field });
        } else if (shape.type === "list") {
          if (!Array.isArray(value)) error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${fieldAt} must be a list: an array of objects`, undefined, { record: entry.id, field: fieldAt });
          else if (shape.of instanceof Map) value.forEach((item, index) => validateRow(shape.of, item, entry, `${fieldAt}[${index}]`));
        } else if (shape.type === "link") {
          const values = value === undefined || value === null || (Array.isArray(value) && value.length === 0)
            ? []
            : shape.many === true ? (Array.isArray(value) ? value : undefined)
              : typeof value === "string" ? [value]
                : undefined;
          if (!values || values.some(item => typeof item !== "string")) {
            error("COLLECTION_LINK_TYPE", "§1b", entry.display, `${fieldAt} must hold ${shape.many === true ? "an array of string ids" : "a string id"}; got ${JSON.stringify(value)}`, undefined, { record: entry.id, field: fieldAt });
          } else if (required && values.length === 0) {
            error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${fieldAt} is required and must hold at least one link`, undefined, { record: entry.id, field: fieldAt });
          } else {
            const seen = new Set();
            for (const targetId of values) {
              if (seen.has(targetId)) warning("COLLECTION_LINK_DUPLICATE", "§1b", entry.display, `${fieldAt} repeats link ${JSON.stringify(targetId)}`, undefined, { record: entry.id, field: fieldAt, value: targetId, drawer: shape.to });
              else seen.add(targetId);
              links.push({ drawer: drawerId, record: entry.id, field, fieldAt, shape, targetId, display: entry.display });
            }
          }
        }
        if (shape.type === "string" && typeof value === "string") {
          if (Array.isArray(shape.options) && !shape.options.includes(value)) {
            error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} is ${JSON.stringify(value)}, outside the field's closed option set (${shape.options.join(", ")})`, undefined, { record: entry.id, field });
          }
          if (shape.pattern === "kebab-case" && !COLLECTION_ID.test(value)) {
            error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} value ${JSON.stringify(value)} is not kebab-case`, undefined, { record: entry.id, field });
          }
        }
        if (shape.unique === true) {
          const key = `${field}\u0000${JSON.stringify(value)}`;
          if (uniqueSeen.has(key)) {
            error("COLLECTION_RECORD_SCHEMA", "§1b", entry.display, `${field} repeats value ${JSON.stringify(value)}, which the schema declares unique within the drawer`, undefined, { record: entry.id, field });
          } else uniqueSeen.set(key, entry.id);
        }
      }
    };
    for (const entry of recordEntries) validateRow(fields, entry.record, entry, "");
  }

  function collectionRecordIndex(info) {
    if (!info.recordIndex) info.recordIndex = new Map(info.records.map(entry => [entry.id, entry]));
    return info.recordIndex;
  }

  function findCollectionCycle(edges) {
    const adjacency = new Map();
    for (const edge of edges) {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from).push(edge.to);
    }
    const color = new Map();
    for (const root of adjacency.keys()) {
      if (color.get(root)) continue;
      color.set(root, 1);
      const stack = [{ node: root, next: 0 }];
      while (stack.length) {
        const frame = stack.at(-1);
        const neighbors = adjacency.get(frame.node) ?? [];
        if (frame.next >= neighbors.length) { color.set(frame.node, 2); stack.pop(); continue; }
        const next = neighbors[frame.next++];
        if (color.get(next) === 1) {
          const start = stack.findIndex(item => item.node === next);
          return [...stack.slice(start).map(item => item.node), next];
        }
        if (!color.get(next)) { color.set(next, 1); stack.push({ node: next, next: 0 }); }
      }
    }
    return undefined;
  }

  function validateCollectionLinks(context, links) {
    const mirrorDeclarations = [];
    for (const info of context.collections.values()) {
      const visit = fields => {
        for (const [field, shape] of fields ?? []) {
          if (shape.type === "link") {
            const target = context.collections.get(shape.to);
            if (!target) error("COLLECTION_LINK_TARGET", "§1b", info.labelDisplay ?? `collections/${info.id}/_collection.json`, `link field ${JSON.stringify(field)} names missing drawer ${JSON.stringify(shape.to)}`, undefined, { field, drawer: info.id, target: shape.to });
            else target.reached = true;
            if (own(shape, "mirrored_by") && target) {
              const mirror = target.fields?.get(shape.mirrored_by);
              if (!mirror || mirror.type !== "link" || mirror.to !== info.id) {
                error("COLLECTION_MIRROR_FIELD", "§1b", info.labelDisplay ?? `collections/${info.id}/_collection.json`, `link field ${JSON.stringify(field)} mirrored_by ${JSON.stringify(shape.mirrored_by)} must name a link field on collections/${shape.to} pointing back to collections/${info.id}`, undefined, { field, drawer: info.id, target: shape.to, mirrored_by: shape.mirrored_by });
              } else {
                mirrorDeclarations.push({ info, field, shape, mirror });
              }
            }
          } else if (shape.type === "list") visit(shape.of);
        }
      };
      visit(info.fields);
    }
    for (const link of links) {
      const target = context.collections.get(link.shape.to);
      if (target && !collectionRecordIndex(target).has(link.targetId)) {
        error("COLLECTION_LINK_DANGLING", "§1b", link.display, `record ${JSON.stringify(link.record)} field ${JSON.stringify(link.fieldAt)} links to ${JSON.stringify(link.targetId)}, which is not a record in drawer ${JSON.stringify(link.shape.to)}`, undefined, { record: link.record, field: link.fieldAt, value: link.targetId, drawer: link.shape.to });
      }
    }
    const declarations = new Map();
    for (const link of links) {
      const key = `${link.drawer}\u0000${link.field}`;
      const list = declarations.get(key) ?? [];
      list.push(link);
      declarations.set(key, list);
    }
    for (const [key, fieldLinks] of declarations) {
      const [drawer, field] = key.split("\u0000");
      const shape = fieldLinks[0].shape;
      if (shape.loops === false) {
        const cycle = findCollectionCycle(fieldLinks.filter(link => link.shape.to === drawer).map(link => ({ from: link.record, to: link.targetId })));
        if (cycle) error("COLLECTION_LINK_LOOP", "§1b", fieldLinks[0].display, `link field ${JSON.stringify(field)} forms a forbidden loop: ${cycle.join(" → ")}`, undefined, { drawer, field, cycle });
      }
    }
    for (const { info, field, shape, mirror } of mirrorDeclarations) {
      const fieldLinks = links.filter(link => link.drawer === info.id && link.shape === shape);
      const reverseLinks = links.filter(link => link.drawer === shape.to && link.shape === mirror);
      const reverse = new Set(reverseLinks.map(link => `${link.record}\u0000${link.targetId}`));
      const forward = new Set(fieldLinks.map(link => `${link.record}\u0000${link.targetId}`));
      for (const link of fieldLinks) {
        if (!reverse.has(`${link.targetId}\u0000${link.record}`)) error("COLLECTION_MIRROR_ONE_WAY", "§1b", link.display, `link ${JSON.stringify(link.record)}.${link.fieldAt} → ${JSON.stringify(link.targetId)} has no matching ${JSON.stringify(shape.mirrored_by)} link back`, undefined, { from_record: link.record, to_record: link.targetId, field: link.fieldAt, mirrored_by: shape.mirrored_by });
      }
      for (const item of reverseLinks) {
        if (forward.has(`${item.targetId}\u0000${item.record}`)) continue;
        error("COLLECTION_MIRROR_ONE_WAY", "§1b", item.display, `link ${JSON.stringify(item.record)}.${item.fieldAt} → ${JSON.stringify(item.targetId)} has no matching ${JSON.stringify(field)} link back`, undefined, { from_record: item.targetId, to_record: item.record, field, mirrored_by: shape.mirrored_by });
      }
    }
  }

  function validateContent(packageRoot, manifest, resolvePath, questionsById) {
    const collections = new Map();
    const context = { collections, documents: [] };
    const links = [];
    const collectionsRoot = path.join(packageRoot, "collections");
    if (host.exists(collectionsRoot) && host.isDirectory(collectionsRoot)) {
      const drawerEntries = [...host.readDir(collectionsRoot)].sort((left, right) => (left.name < right.name ? -1 : 1));
      for (const drawerEntry of drawerEntries) {
        if (!drawerEntry.isDirectory) {
          error("COLLECTION_STRAY_FILE", "§1b", `collections/${drawerEntry.name}`, "collections/ holds one directory per collection; a loose file here belongs inside a drawer");
          continue;
        }
        const id = drawerEntry.name;
        if (!COLLECTION_ID.test(id)) {
          error("COLLECTION_ID_GRAMMAR", "§1b", `collections/${id}`, `collection id ${JSON.stringify(id)} is not lowercase kebab-case`);
          continue;
        }
        const drawerDir = path.join(collectionsRoot, id);
        const docs = [];
        const recordEntries = [];
        let fields;
        const members = [...host.readDir(drawerDir)].sort((left, right) => (left.name < right.name ? -1 : 1));
        for (const member of members) {
          const display = `collections/${id}/${member.name}`;
          if (member.isDirectory) {
            error("COLLECTION_SUBDIRECTORY", "§1b", display, "subdirectories inside a drawer are not defined in this revision; organize as sibling drawers with compound kebab names");
            continue;
          }
          if (member.name === "_collection.json") {
            // The label is optional and appears only when it has something
            // to say; `record` is its one field (decision 33).
            const data = parseJsonFile(path.join(drawerDir, member.name), display, "§1b", "COLLECTION_LABEL_JSON");
            if (data === undefined) continue;
            const labelSchema = loadSchema("collection.schema.json", "§1b");
            if (labelSchema) {
              for (const problem of schemaProblems(data, labelSchema, labelSchema)) {
                error("COLLECTION_LABEL_SCHEMA", "§1b", display, `${problem.path} ${problem.message}`);
              }
            }
            if (isObject(data) && own(data, "record")) fields = validateDrawerSchema(data.record, display);
            continue;
          }
          if (!member.name.endsWith(".json")) {
            error("COLLECTION_STRAY_FILE", "§1b", display, "a drawer holds its optional `_collection.json` label and one `.json` file per record; anything else is not defined by this revision");
            continue;
          }
          const recordId = member.name.slice(0, -".json".length);
          if (!COLLECTION_ID.test(recordId)) {
            error("COLLECTION_ID_GRAMMAR", "§1b", display, `record id ${JSON.stringify(recordId)} is not lowercase kebab-case; the filename is the record's id and address`);
            continue;
          }
          const file = path.join(drawerDir, member.name);
          const data = parseJsonFile(file, display, "§1b", "COLLECTION_RECORD_JSON");
          if (data === undefined) continue;
          if (!isObject(data)) {
            error("COLLECTION_RECORD_SHAPE", "§1b", display, "a collection record file holds one JSON object of designer data");
            continue;
          }
          docs.push({ file, display, data });
          recordEntries.push({ record: data, display, id: recordId });
        }
        if (fields) {
          validateDrawerRecords(fields, recordEntries, links, id);
          validateGridLayers([...fields.entries()].filter(([, shape]) => shape.type === "grid").map(([field]) => field), recordEntries);
        }
        const recordIds = new Set(recordEntries.map(entry => entry.id));
        const allIds = new Set(recordIds);
        for (const doc of docs) for (const itemId of collectIds(doc.data)) allIds.add(itemId);
        const info = { id, fields, docs, records: recordEntries, recordIds, allIds, reached: false, labelDisplay: fields ? `collections/${id}/_collection.json` : undefined };
        context.collections.set(id, info);
        context.documents.push(...docs.map(doc => ({ ...doc, collection: info })));
      }
    }

    // The `> COLLECTION:` tag is retired (decision 33): presence declares the
    // drawer, prose cites it, and the label's record schema owns the shape. A
    // surviving tag is old machinery that would otherwise sit silently.
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const item of unfencedLines(text)) {
        if (/^\s*>\s*COLLECTION:/.test(item.text)) {
          error("COLLECTION_TAG_RETIRED", "§1b", slash(chapter), "`> COLLECTION:` is retired (decision 33); presence declares the drawer, prose cites it, and the label's `record` schema owns the shape", item.line);
        }
      }
    }

    validateCollectionLinks(context, links);
    return context;
  }


  // Numbered root Markdown files are chapters. The first five numbers retain
  // canonical names and roles; 06 and up are package-owned chapters.
  function* chapterTexts(packageRoot) {
    const canonical = new Map([
      ["01", "01-overview.md"], ["02", "02-mechanics.md"],
      ["03", "03-content.md"], ["04", "04-presentation.md"],
      ["05", "05-build-plan.md"]
    ]);
    const chapters = host.readDir(packageRoot)
      .filter(entry => entry.isFile && /^\d\d-[^/\\]+\.md$/.test(entry.name))
      .map(entry => entry.name)
      .sort();
    for (const chapter of chapters) {
      const number = chapter.slice(0, 2);
      if (number === "00") {
        error("CHAPTER_NAME_RESERVED", "§1", chapter, `\`${chapter}\`: number 00 is reserved and invalid; use 06 and up for your own chapters`);
      } else if (canonical.has(number) && canonical.get(number) !== chapter) {
        error("CHAPTER_NAME_RESERVED", "§1", chapter, `\`${chapter}\`: numbers 01–05 are the canonical chapters (\`${canonical.get(number)}\`); use 06 and up for your own chapters`);
      }
      const file = path.join(packageRoot, chapter);
      yield { chapter, text: host.readText(file) };
    }
  }

  function validateRulesetTags(packageRoot) {
    const rulesetIds = new Set();
    const initial = [];
    const tags = [];
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const item of unfencedLines(text)) {
        if (!/^\s*>\s*RULESET:/.test(item.text)) continue;
        const match = /^\s*>\s*RULESET:\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+(\(initial\)))?\s*$/.exec(item.text);
        if (!match) {
          error("RULESET_TAG_SHAPE", "§2c", slash(chapter), "ruleset tags use `> RULESET: <kebab-case-id>` with optional `(initial)`", item.line);
          continue;
        }
        const id = match[1];
        if (id === "all") {
          error("RULESET_TAG_SHAPE", "§2c", slash(chapter), "`> RULESET: all` is retired; leave the statement untagged when it holds in every ruleset", item.line);
          continue;
        }
        rulesetIds.add(id);
        tags.push({ id, file: slash(chapter), line: item.line });
        if (match[2]) initial.push({ id, file: slash(chapter), line: item.line });
      }
    }
    if (tags.length && initial.length !== 1) {
      const message = initial.length
        ? `ruleset tags must carry exactly one (initial); found ${initial.length} at ${initial.map(item => `${item.file}:${item.line}`).join(", ")}`
        : "ruleset tags must carry exactly one (initial); none is marked initial";
      error("RULESET_INITIAL", "§2c", initial[0]?.file ?? tags[0].file, message, initial[0]?.line ?? tags[0].line, { initial });
    }
    return rulesetIds;
  }

  // SPEC §2 — the authority tags, given the §2c tag treatment. A tag's first
  // token is what follows the colon. After `DELEGATED:` that token is an
  // optional free-text label: the §9 direction fence requires the specific
  // label `presentation-direction` (checked in parseDirectionFence), and
  // elsewhere it is descriptive only, so there is nothing here to resolve and
  // nothing to fail. After `PERSONALIZATION:` it MUST be a declared question
  // id, and a tag naming no declared question is a hard failure: the section
  // claims an answer decides it, and no answer exists.
  function validatePersonalizationTags(packageRoot, manifest, personalization) {
    // A declared personalization.json that would not parse already reported
    // itself; resolving ids against an empty map would only repeat that.
    if (personalization.declared && !personalization.readable) return;
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const item of unfencedLines(text)) {
        const match = /^\s*>\s*(DELEGATED|PERSONALIZATION):\s*(\S*)/.exec(item.text);
        if (!match || match[1] !== "PERSONALIZATION") continue;
        const id = match[2];
        if (!personalization.questions.has(id)) {
          error("PERSONALIZATION_TAG_DANGLING", "§2", slash(chapter), `> PERSONALIZATION: ${id || "(no id)"} does not name a declared personalization question`, item.line);
        }
      }
    }
  }

  // A heading mode tag resolves against the union of every clock's mode keys.
  // The reserved all tag is never needed: an untagged statement already holds
  // in every mode.
  function validateModeTags(packageRoot, manifest, clocksResult) {
    const modes = clocksResult?.modes;
    if (!modes || modes.size === 0) return;
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const item of unfencedLines(text)) {
        if (!/^\s{0,3}#{1,6}\s/.test(item.text)) continue;
        for (const found of item.text.matchAll(/\[([A-Za-z0-9_-]+)\](?![([])/g)) {
          const tag = found[1];
          const modeId = tag.toLowerCase();
          if (/^\d+$/.test(tag)) continue;
          if (modeId === "all") {
            error("MODE_TAG_DANGLING", "§4b", slash(chapter), `chapter mode tag [${tag}] is retired; leave the statement untagged; it already holds in every mode`, item.line);
          } else if (modes.size && !modes.has(modeId)) {
            error("MODE_TAG_DANGLING", "§4b", slash(chapter), `chapter mode tag [${tag}] does not name a declared mode id`, item.line);
          }
        }
      }
    }
  }

  const CLOCK_MODE_WORDS = new Set(["running", "paused", "steps", "none"]);
  const TUNING_SEGMENT = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?$/;
  const MODE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const RUNTIME_ADDRESS = /^runtime\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)*$/;

  function validateClocks(clocks, file = "clocks.json") {
    const result = { modes: new Set(), clocks: new Set(), advancedBy: new Map(), behaviors: new Map(), runtime: new Set() };
    if (!isObject(clocks) || Object.keys(clocks).length === 0) {
      error("CLOCKS_SHAPE", "§4b", file, "top level must be a non-empty map of clock names to clock objects");
      return result;
    }
    if (own(clocks, "modes") || own(clocks, "clocks")) {
      error("CLOCKS_SHAPE", "§4b", file, "v0.6 clocks.json used root `modes` / `clocks`; v0.7 puts each clock at the root with its own `modes` map (`opengdd migrate <package-dir>`)");
      return result;
    }
    const clockEntries = [];
    for (const [name, clock] of Object.entries(clocks)) {
      if (!TUNING_SEGMENT.test(name)) error("CLOCKS_SHAPE", "§4b", file, `clock name ${JSON.stringify(name)} is outside the tuning-key segment grammar`);
      else result.clocks.add(name);
      if (!isObject(clock)) {
        error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} must be an object`);
        continue;
      }
      for (const key of Object.keys(clock)) if (!["unit", "advances", "modes"].includes(key)) error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} carries unknown field ${JSON.stringify(key)}`);
      if (typeof clock.unit !== "string" || !clock.unit.trim()) error("CLOCKS_UNIT", "§4b", file, `clock ${JSON.stringify(name)} must declare unit as a non-empty string`);
      if (own(clock, "advances") && !Array.isArray(clock.advances)) {
        error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} advances must be an array of runtime.* addresses`);
      } else {
        for (const [index, address] of (clock.advances ?? []).entries()) {
          if (typeof address !== "string" || !RUNTIME_ADDRESS.test(address)) {
            error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} advances[${index}] is not a runtime.* address`);
            continue;
          }
          result.runtime.add(address);
          if (result.advancedBy.has(address)) error("CLOCKS_ADVANCES_DISJOINT", "§4b", file, `${JSON.stringify(address)} is advanced by both ${JSON.stringify(result.advancedBy.get(address))} and ${JSON.stringify(name)}; advances lists must be disjoint`);
          else result.advancedBy.set(address, name);
        }
      }
      if (!isObject(clock.modes) || Object.keys(clock.modes).length === 0) {
        error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} modes must be a non-empty map`);
        continue;
      }
      for (const [mode, word] of Object.entries(clock.modes)) {
        if (!MODE_ID.test(mode)) error("CLOCKS_SHAPE", "§4b", file, `clock ${JSON.stringify(name)} mode ${JSON.stringify(mode)} is not kebab-case`);
        else result.modes.add(mode);
        if (!CLOCK_MODE_WORDS.has(word)) error("CLOCKS_MODE_WORD", "§4b", file, `clock ${JSON.stringify(name)} mode ${JSON.stringify(mode)} must be running, paused, steps, or none; got ${JSON.stringify(word)}`);
        result.behaviors.set(`${name} ${mode}`, word);
      }
      clockEntries.push([name, clock]);
    }
    for (const [name, clock] of clockEntries) {
      for (const mode of result.modes) if (!own(clock.modes, mode)) error("CLOCKS_MODE_MISSING", "§4b", file, `clock ${JSON.stringify(name)} is missing mode ${JSON.stringify(mode)}`, undefined, { clock: name, mode });
    }
    return result;
  }

  function validateRuntimeUse(address, context, file, pointer) {
    if (typeof address !== "string" || !RUNTIME_ADDRESS.test(address)) return false;
    if (!context?.runtime?.has(address)) error("RUNTIME_UNDECLARED", "§4b", file, `${pointer} uses ${JSON.stringify(address)}, which is not declared; declare it by writing it in a chapter, with a sentence saying what it is, or by naming it in a clock's \`advances\``, undefined, { address, pointer });
    return true;
  }

  function validateUnchanged(unchanged, clocksResult, file, pointer, exprContext) {
    if (!isObject(unchanged)) {
      error("UNCHANGED_SHAPE", "§4b", file, `${pointer} must be an object`);
      return;
    }
    for (const key of Object.keys(unchanged)) if (key !== "values" && key !== "modes") error("UNCHANGED_SHAPE", "§4b", file, `${pointer} carries unknown field ${JSON.stringify(key)}`);
    const values = Array.isArray(unchanged.values) ? unchanged.values : [];
    const modes = Array.isArray(unchanged.modes) ? unchanged.modes : [];
    if (!values.length || values.some(value => typeof value !== "string" || !RUNTIME_ADDRESS.test(value))) error("UNCHANGED_SHAPE", "§4b", file, `${pointer}.values must be a non-empty array of runtime.* addresses`);
    if (!modes.length || modes.some(mode => typeof mode !== "string" || !mode)) error("UNCHANGED_SHAPE", "§4b", file, `${pointer}.modes must be a non-empty array of mode names`);
    if (!clocksResult) {
      error("UNCHANGED_NO_CLOCKS", "§4b", file, `${pointer} requires clocks.json, but the package declares none`);
      return;
    }
    for (const mode of modes) if (typeof mode === "string" && !clocksResult.modes.has(mode)) error("UNCHANGED_MODE", "§4b", file, `${pointer} names undeclared mode ${JSON.stringify(mode)}`);
    for (const value of values) {
      if (!validateRuntimeUse(value, exprContext, file, `${pointer}.values`)) continue;
      const clockName = clocksResult.advancedBy.get(value);
      if (!clockName) continue;
      for (const mode of modes) {
        const word = clocksResult.behaviors.get(`${clockName} ${mode}`);
        if (word === "running" || word === "steps") warning("UNCHANGED_ADVANCES", "§4b", file, `${pointer} names ${JSON.stringify(value)}, advanced by clock ${JSON.stringify(clockName)}, which is ${word} in mode ${JSON.stringify(mode)}`);
        else if (word === "none") error("UNCHANGED_UNDEFINED", "§4b", file, `${pointer} names ${JSON.stringify(value)}, advanced by clock ${JSON.stringify(clockName)}, which is none in mode ${JSON.stringify(mode)}`);
      }
    }
  }

  // SPEC §4 — "package defaults" means the resolved tuning snapshot produced by
  // applying every question's `default` through the §5 pipeline. For a package
  // with no personalization.json it equals the authored values. Rule validation
  // reads both the authored values and this default snapshot.
  //
  function applyPersonalizationAnswers(base, questions, answerFor, canSet) {
    const resolved = new Map(base);
    const assign = (key, value) => {
      if (typeof key === "string" && resolved.has(key) && canSet(key) && typeof value === "number" && Number.isFinite(value)) resolved.set(key, value);
    };
    for (const question of questions) {
      if (!isObject(question)) continue;
      const answer = answerFor(question);
      if (question.type === "choice" && Array.isArray(question.options)) {
        const option = question.options.find(item => isObject(item) && item.id === answer);
        if (isObject(option?.sets)) for (const [key, value] of Object.entries(option.sets)) assign(key, value);
      } else if (question.type === "number") {
        assign(question.sets, answer);
      }
    }
    return resolved;
  }

  function resolveDefaultTuning(doc, personalization, base) {
    const questions = isObject(personalization?.doc) && Array.isArray(personalization.doc.questions) ? personalization.doc.questions : [];
    const ranges = isObject(doc?.ranges) ? doc.ranges : {};
    return applyPersonalizationAnswers(base, questions, question => question.default, key => own(ranges, key));
  }

  // SPEC §4 rule 3, second half: a key MUST NOT open with a segment reserved
  // for prose citation, and MUST NOT carry a reserved extension segment in any
  // position. Either would make the key unciteable — §4's classification rule
  // would read its own citation as a mechanism path or a file mention and
  // never look for the key. The reserved list is versioned, so the diagnostic
  // names the revision that reserved the segment: a key legal under an earlier
  // revision needs to know what changed under it, not merely that it is now
  // wrong. Left out of tuning.schema.json deliberately — the schema can state
  // the constraint only as a lookahead-and-lookbehind pattern that no reader
  // can check by eye, and cannot name a revision.
  function validateTuningKeySegments(role, key) {
    const segments = key.split(".");
    if (RESERVED_FIRST_SEGMENT_SET.has(segments[0])) {
      const rest = segments.slice(1).join(".") || "value";
      error("TUNING_KEY_RESERVED", "§4", "tuning.json", `${role} key ${JSON.stringify(key)} opens with \`${segments[0]}\`, a format word reserved for prose citation in v${reservedIn(segments[0])}; try \`feel.${rest}\``);
    }
    const extension = segments.find(segment => RESERVED_EXTENSION_SET.has(segment));
    if (extension !== undefined) {
      error("TUNING_KEY_RESERVED", "§4", "tuning.json", `${role} key ${JSON.stringify(key)} carries the reserved extension segment \`${extension}\`, which marks a file mention in prose in v${SPEC_VERSION}`);
    }
  }

  function validateTuning(packageRoot, contentContext, personalization = undefined) {
    const file = path.join(packageRoot, "tuning.json");
    const doc = host.exists(file) ? parseJsonFile(file, "tuning.json", "§4", "TUNING_JSON") : undefined;
    const tuning = new Map();
    const context = { ...contentContext, tuning };
    if (doc === undefined) return { doc, context };
    // SPEC §2d — tuning.json is one of the schema-validated package files. The
    // bespoke §4 checks below stay: ranges and rules read sibling tables.
    const tuningSchema = loadSchema("tuning.schema.json", "§4");
    if (tuningSchema) {
      for (const problem of schemaProblems(doc, tuningSchema, tuningSchema)) {
        error("TUNING_SCHEMA", "§4", "tuning.json", `${problem.path} ${problem.message}`);
      }
    }
    if (!isObject(doc)) {
      error("TUNING_SHAPE", "§4", "tuning.json", "top level must be an object");
      return { doc, context };
    }
    const allowedTop = new Set(["values", "ranges", "rules"]);
    const historical = new Map([
      ["tunables", "merge it into `values`"],
      ["constants", "merge it into `values`"],
      ["meta", "move each range into `ranges`; must_match and ruleset leave tuning.json"],
      ["invariants", "print each expression as an entry in `rules`"],
      ["clocks", "move it verbatim to root `clocks.json`"]
    ]);
    for (const key of Object.keys(doc)) {
      if (allowedTop.has(key)) continue;
      const message = historical.has(key)
        ? `top-level field ${JSON.stringify(key)} is a v0.6 field; ${historical.get(key)}. \`opengdd migrate <package-dir>\` rewrites the file`
        : `unknown top-level field ${JSON.stringify(key)}`;
      error("TUNING_SHAPE", "§4", "tuning.json", message);
    }
    if (!isObject(doc.values)) error("TUNING_SHAPE", "§4", "tuning.json", "values is required and must be a flat object");
    if (own(doc, "ranges") && !isObject(doc.ranges)) error("TUNING_SHAPE", "§4", "tuning.json", "ranges must be a flat object when present");
    if (own(doc, "rules") && !isObject(doc.rules)) error("TUNING_SHAPE", "§4", "tuning.json", "rules must be an object when present");

    const clocksFile = path.join(packageRoot, "clocks.json");
    const clocksDoc = host.exists(clocksFile) && host.isFile(clocksFile)
      ? parseJsonFile(clocksFile, "clocks.json", "§4b", "CLOCKS_JSON")
      : undefined;
    context.clocks = clocksDoc !== undefined ? validateClocks(clocksDoc, "clocks.json") : undefined;
    context.runtime = new Set();
    for (const { text } of chapterTexts(packageRoot)) {
      for (const { token } of inlineCodeTokens(text)) if (RUNTIME_ADDRESS.test(token)) context.runtime.add(token);
    }
    for (const address of context.clocks?.runtime ?? []) context.runtime.add(address);

    const dotted = TUNING_KEY_PATTERN;
    if (isObject(doc.values)) {
      for (const [key, value] of Object.entries(doc.values)) {
        if (!dotted.test(key)) error("TUNING_KEY", "§4", "tuning.json", `values key ${JSON.stringify(key)} is not a flat dotted key`);
        else validateTuningKeySegments("values", key);
        if (typeof value !== "number" || !Number.isFinite(value)) error("TUNING_NUMBER", "§4", "tuning.json", `values.${key} must be a finite JSON number`);
        else context.tuning.set(key, value);
      }
    }
    if (isObject(doc.ranges)) {
      for (const [key, range] of Object.entries(doc.ranges)) {
        if (!dotted.test(key)) error("TUNING_KEY", "§4", "tuning.json", `ranges key ${JSON.stringify(key)} is not a flat dotted key`);
        else validateTuningKeySegments("ranges", key);
        if (!isObject(doc.values) || !own(doc.values, key)) error("TUNING_RANGE_KEY", "§4", "tuning.json", `ranges key ${JSON.stringify(key)} does not exist in values`);
        if (!Array.isArray(range) || range.length !== 2 || range.some(value => typeof value !== "number" || !Number.isFinite(value))) {
          error("TUNING_RANGE", "§4", "tuning.json", `ranges.${key} must be two finite numbers`);
          continue;
        }
        if (range[0] > range[1]) error("TUNING_RANGE", "§4", "tuning.json", `ranges.${key} minimum ${range[0]} exceeds maximum ${range[1]}`);
        const value = doc.values?.[key];
        if (typeof value === "number" && Number.isFinite(value) && (value < range[0] || value > range[1])) {
          error("TUNING_RANGE_VALUE", "§4", "tuning.json", `values.${key}=${value} is outside inclusive range [${range[0]}, ${range[1]}]`);
        }
      }
    }
    if (isObject(doc.rules)) {
      const defaults = resolveDefaultTuning(doc, personalization, context.tuning);
      for (const [name, source] of Object.entries(doc.rules)) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) error("TUNING_RULE_INVALID", "§4", "tuning.json", `rule name ${JSON.stringify(name)} must be kebab-case`);
        if (typeof source !== "string") {
          error("TUNING_RULE_INVALID", "§4", "tuning.json", `rule ${JSON.stringify(name)} must be a string`);
          continue;
        }
        try {
          const ast = parseRule(source);
          for (const lookup of [context.tuning, defaults]) {
            try {
              if (!evaluateRule(ast, lookup)) error("TUNING_RULE_FAILED", "§4", "tuning.json", formatRuleFailure(name, source, ast, lookup));
            } catch (cause) {
              error("TUNING_RULE_INVALID", "§4", "tuning.json", `rule ${JSON.stringify(name)}: ${cause.message} at position ${cause.position ?? 0}`);
            }
          }
        } catch (cause) {
          error("TUNING_RULE_INVALID", "§4", "tuning.json", `rule ${JSON.stringify(name)}: ${cause.message} at position ${cause.position ?? 0}`);
        }
      }
    }
    return { doc, context };
  }

  function validateFantasy(packageRoot) {
    const file = path.join(packageRoot, "01-overview.md");
    if (!host.exists(file)) return;
    const text = host.readText(file).replace(/^\uFEFF/, "");
    const match = /```fantasy[^\r\n]*\r?\n([\s\S]*?)```/i.exec(text);
    if (!match) {
      error("FANTASY_BLOCK", "§1a", "01-overview.md", "must open with a fenced fantasy block");
      return;
    }
    const prefix = text.slice(0, match.index)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^\s*#\s+[^\r\n]+\r?\n?/, "")
      .trim();
    if (prefix) error("FANTASY_POSITION", "§1a", "01-overview.md", "fantasy block must be the first substantive content after the document title");
    const lines = match[1].split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    // SPEC §1a line grammar: the player fantasy is every unlabeled line. There
    // MUST be at least one; each run of them MUST close on `.`, `!`, or `?`;
    // and their combined trimmed length MUST NOT exceed 280 characters.
    const isLabelled = line => /^(?:Feel|NOT|Anti-references):/i.test(line);
    const fantasyLines = lines.filter(line => !isLabelled(line));
    // SPEC §1a: each label MAY appear at most once. A second `Feel:` line, or a
    // second anti-reference line under either spelling, leaves no rule for which
    // one binds, so it is a hard failure.
    const labelSlot = line => (/^Feel:/i.test(line) ? "Feel:" : "NOT: / Anti-references:");
    const labelCounts = new Map();
    for (const line of lines.filter(isLabelled)) labelCounts.set(labelSlot(line), (labelCounts.get(labelSlot(line)) ?? 0) + 1);
    for (const [label, count] of labelCounts) {
      if (count > 1) error("FANTASY_LABEL_DUPLICATE", "§1a", "01-overview.md", `fantasy block carries ${count} ${label} lines; each label may appear at most once`);
    }
    if (!fantasyLines.length) {
      error("FANTASY_SENTENCE", "§1a", "01-overview.md", "fantasy block must contain at least one line of player fantasy");
    } else {
      const runs = [];
      lines.forEach(line => {
        if (isLabelled(line)) { runs.push(undefined); return; }
        if (runs.length && runs[runs.length - 1] !== undefined) runs[runs.length - 1] += ` ${line}`;
        else runs.push(line);
      });
      for (const run of runs) {
        if (run !== undefined && !/[.!?]$/.test(run)) {
          error("FANTASY_SENTENCE", "§1a", "01-overview.md", `player fantasy must end with a sentence-ending mark (. ! ?); got ${JSON.stringify(run)}`);
        }
      }
      const budget = fantasyLines.reduce((total, line) => total + [...line].length, 0);
      if (budget > 280) {
        error("FANTASY_LENGTH", "§1a", "01-overview.md", `player fantasy is ${budget} characters; SPEC §1a allows at most 280 combined, newlines not counted`);
      }
    }
    const feel = lines.find(line => /^Feel:/i.test(line));
    const adjectives = feel ? feel.replace(/^Feel:\s*/i, "").replace(/[.!?]$/, "").split(",").map(item => item.trim()).filter(Boolean) : [];
    if (adjectives.length < 3 || adjectives.length > 5) error("FANTASY_FEEL", "§1a", "01-overview.md", `fantasy block must contain 3–5 feel adjectives; found ${adjectives.length}`);
    const anti = lines.find(line => /^(?:NOT|Anti-references):/i.test(line));
    if (!anti || !anti.replace(/^(?:NOT|Anti-references):\s*/i, "").replace(/[.!?]$/, "").trim()) {
      error("FANTASY_ANTI_REFERENCES", "§1a", "01-overview.md", "fantasy block must contain non-empty anti-references");
    }
    // SPEC §1a: a fantasy line MUST NOT carry a reference. That covers the §4b
    // and §9 typed forms and, under the §4 grammar, a backticked bare token
    // that classifies as a tuning citation. The fantasy is read by every
    // builder before any key exists to cite, so a reference in it is mechanics
    // leaking upward. Classification alone decides this: whether the key
    // happens to exist is not what the fence is about.
    const bodyStart = text.slice(0, match.index).split(/\r?\n/).length + 1;
    match[1].split(/\r?\n/).forEach((raw, offset) => {
      if (isLabelled(raw.trim())) return;
      const at = bodyStart + offset;
      for (const typed of raw.matchAll(/(?:^|[^A-Za-z0-9_:-])(tuning|state|collections|descriptor|palette):([A-Za-z0-9_:-]+(?:\.[A-Za-z0-9_:-]+)*)/g)) {
        error("FANTASY_REFERENCE", "§1a", "01-overview.md", `fantasy line carries the typed reference \`${typed[1]}:${typed[2]}\`; §1a admits no reference in the fantasy block`, at);
      }
      for (const span of raw.matchAll(/`([^`\n]+)`/g)) {
        const token = span[1].trim();
        const classified = classifyProseToken(token);
        if (classified?.kind !== "tuning" && !RUNTIME_ADDRESS.test(token)) continue;
        error("FANTASY_REFERENCE", "§1a", "01-overview.md", `fantasy line cites \`${token}\`; §1a admits no tuning or runtime reference in the fantasy block`, at);
      }
      const chapterAnchor = /(?:[A-Za-z0-9_./-]+\.md#[a-z0-9]+(?:-[a-z0-9]+)*|(?:^|\s)#(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*(?![a-z0-9-]))/.exec(raw);
      if (chapterAnchor) {
        error("FANTASY_REFERENCE", "§1a", "01-overview.md", `fantasy line carries the chapter anchor ${JSON.stringify(chapterAnchor[0].trim())}; §1a admits no reference in the fantasy block`, at);
      }
    });
  }

  function proseParagraphs(text) {
    const lines = text.split(/\r?\n/);
    const paragraphs = [];
    let current = [];
    let start = 1;
    let fenced = false;
    const flush = () => {
      if (current.length) paragraphs.push({ line: start, text: current.join(" ").replace(/\s+/g, " ").trim() });
      current = [];
    };
    lines.forEach((line, index) => {
      if (/^\s*```/.test(line)) { flush(); fenced = !fenced; return; }
      if (fenced || /^\s*$/.test(line) || /^#{1,6}\s/.test(line)) { flush(); return; }
      if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line) && current.length) flush();
      if (!current.length) start = index + 1;
      current.push(line.trim());
    });
    flush();
    return paragraphs;
  }

  // DRAFT-pending-v0.4. These patterns deliberately look for shapes, not intent.
  // A warning can be benign game prose; the validator never follows links,
  // decodes payloads, executes commands, or turns these warnings into errors.
  const INJECTION_PROMPT_CONTROL_PATTERNS = [
    /\b(?:ignore|disregard|forget|override|bypass)\b.{0,80}\b(?:(?:previous|prior|earlier|above)(?:\s+[\p{L}\p{N}_-]+){0,3}\s+(?:instructions?|prompts?|messages?|rules?)|(?:system|developer|user)\s+(?:instructions?|prompts?|messages?|rules?))\b/iu,
    /\b(?:system|developer|assistant)\s+(?:message|prompt|instructions?)\b/iu,
    /\b(?:you\s+are|act\s+as|pretend\s+to\s+be)\s+(?:chatgpt|an?\s+(?:ai|assistant|agent|language\s+model)|the\s+(?:assistant|agent|model))\b/iu,
    /\b(?:follow|obey)\s+(?:only\s+)?(?:these|the\s+following|my|this)\s+(?:instructions?|prompt)\b/iu,
    /\b(?:do\s+not|never)\s+(?:mention|reveal|disclose|report)\b.{0,60}\b(?:instructions?|prompt|message)\b/iu
  ];

  const INJECTION_EXTERNAL_ACTION_PATTERNS = [
    /\b(?:run|execute|invoke|launch)\s+(?:(?:this|the|a|following)\s+)?(?:command|script|shell|terminal|powershell|cmd(?:\.exe)?|bash|executable|program)\b/iu,
    /\b(?:fetch|download|upload|send|post|open|visit|browse|navigate(?:\s+to)?|request)\s+(?:(?:this|the|a|following)\s+)?(?:url|uri|link|endpoint|https?:\/\/|www\.)/iu,
    /\b(?:curl|wget|invoke-webrequest|start-bitstransfer|npm\s+(?:install|exec)|npx|pip\s+install|powershell(?:\.exe)?\s+-|cmd(?:\.exe)?\s+\/c|bash\s+-c|sh\s+-c)\b/iu
  ];

  const INJECTION_SECOND_PERSON_PATTERNS = [
    /\byou\s+(?:must|should|need\s+to|are\s+(?:required|expected|instructed)\s+to|will\s+now)\b/iu,
    /\b(?:make\s+sure|ensure)\s+(?:that\s+)?you\b/iu,
    /\byour\s+(?:task|job|goal|instructions?)\s+is\b/iu
  ];

  const INJECTION_IMPERATIVE_START = /^\s*(?:>\s*)?(?:(?:[-+*]|\d+[.)])\s+)?(?:\*\*|__)?(run|execute|invoke|fetch|download|install|upload|send|post|browse|navigate|open|visit|read|write|edit|delete|copy|paste|return|respond|output|reveal)\b/iu;
  const INJECTION_AGENT_CONTEXT = /\b(?:agent|assistant|builder|implementer|developer|reader|validator|auditor|model|ai|llm|chatgpt|system\s+prompt|repository|repo|file|filesystem|shell|terminal|command|script|url|uri|endpoint|browser|network|credential|secret|environment\s+variable|tool)\b/iu;
  const INJECTION_GAME_CONTEXT = /\b(?:player|character|avatar|piece|card|token|turn|round|tile|cell|board|controller|button|key|input|move|jump|attack|score|health|inventory|dialogue|camera|screen|level|room|puzzle|enemy|boss|win|lose|victory|defeat|press|hold|release|choose|select)\b/iu;
  const INJECTION_DANGEROUS_LINK = /(?:\b(?:javascript|vbscript):|\b(?:file|smb|ftp):\/\/|\bdata:[a-z]+\/[a-z0-9.+-]+(?:;base64)?,|\bhttps?:\/\/[^\s/@]+:[^\s/@]+@|\bhttps?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|\[?::1\]?)(?=[:/\s]|$)|\bhttps?:\/\/[^\s)]+\.(?:ps1|bat|cmd|exe|msi|sh|js|zip)(?=[?#\s)]|$))/iu;
  const INJECTION_ACTION_LINK = /(?:\b(?:fetch|download|upload|send|post|open|visit|browse|navigate|request|curl|wget)\b.{0,120}\b(?:https?:\/\/|www\.)|\b(?:https?:\/\/|www\.)\S{0,120}\b(?:fetch|download|upload|send|post|open|visit|browse|navigate|request|curl|wget)\b)/iu;

  function injectionTextFiles(packageRoot) {
    const files = [];
    const pending = [packageRoot];
    while (pending.length) {
      const directory = pending.pop();
      let entries;
      try { entries = host.readDir(directory); }
      catch { continue; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (host.isSymbolicLink(target)) continue;
        if (entry.isDirectory) pending.push(target);
        else if (entry.isFile && INJECTION_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(target);
      }
    }
    return files.sort((a, b) => a.localeCompare(b));
  }

  function injectionPatternStartsHere(patterns, current, window) {
    return patterns.some(pattern => {
      const match = pattern.exec(window);
      return match && match.index < current.length;
    });
  }

  function injectionBase64Length(line) {
    for (const match of line.matchAll(/(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_-]{80,}={0,2}(?![A-Za-z0-9+/_=-])/gu)) {
      const token = match[0];
      if (/^[A-Fa-f0-9]+$/u.test(token) || token.length % 4 !== 0) continue;
      const classes = [/[a-z]/u, /[A-Z]/u, /[0-9]/u, /[+/_=-]/u].filter(pattern => pattern.test(token)).length;
      if (classes >= 3) return token.length;
    }
    return undefined;
  }

  function injectionHexLength(line) {
    // A legitimate SPEC 7/8a sha256: pin is exactly 64 lowercase hexadecimal
    // characters. Excluding this normative, unambiguous prefix form keeps the
    // signal meaningful without reopening it to every hex-shaped run.
    const pinned = /sha256:[0-9a-f]{64}(?![0-9A-Fa-f])/u;
    const withoutPins = line.replace(new RegExp(pinned, "gu"), match => "-".repeat(match.length));
    const match = /(?<![0-9A-Fa-f])(?:0x)?[0-9A-Fa-f]{64,}(?![0-9A-Fa-f])/u.exec(withoutPins);
    return match?.[0].length;
  }

  function markdownFenceMap(lines, markdown) {
    if (!markdown) return lines.map(() => false);
    let fenced = false;
    return lines.map(line => {
      const marker = /^\s*(?:```|~~~)/u.test(line);
      const result = fenced || marker;
      if (marker) fenced = !fenced;
      return result;
    });
  }

  function validateInjectionSurface(packageRoot) {
    for (const file of injectionTextFiles(packageRoot)) {
      const display = slash(path.relative(packageRoot, file));
      let text;
      try {
        const size = host.size(file);
        if (size > INJECTION_SCAN_MAX_BYTES) {
          warning("INJECTION_SCAN_SKIPPED", INJECTION_LINT_SECTION, display, `text-like file exceeds the 2 MiB lint limit and was not scanned; review it as untrusted data`, undefined, { lint_status: INJECTION_LINT_STATUS, bytes: size });
          continue;
        }
        text = host.readText(file);
      } catch (cause) {
        warning("INJECTION_SCAN_SKIPPED", INJECTION_LINT_SECTION, display, `text-like file could not be scanned (${cause.code ?? "read error"}); review it as untrusted data`, undefined, { lint_status: INJECTION_LINT_STATUS });
        continue;
      }

      const lines = text.split(/\r?\n/);
      const fenced = markdownFenceMap(lines, /\.(?:md|markdown)$/iu.test(file));
      lines.forEach((raw, index) => {
        const current = raw.replace(/\s+/gu, " ").trim();
        if (!current) return;
        const following = lines.slice(index + 1, index + 3).join(" ").replace(/\s+/gu, " ").trim();
        const window = following ? `${current} ${following}` : current;
        const line = index + 1;

        if (injectionPatternStartsHere(INJECTION_PROMPT_CONTROL_PATTERNS, current, window)) {
          warning("INJECTION_PROMPT_CONTROL", INJECTION_LINT_SECTION, display, `prompt-control language may address a reader or agent; treat this line as untrusted data`, line, { lint_status: INJECTION_LINT_STATUS, signal: "prompt-control-language" });
        }
        if (injectionPatternStartsHere(INJECTION_EXTERNAL_ACTION_PATTERNS, current, window)) {
          warning("INJECTION_EXTERNAL_ACTION", INJECTION_LINT_SECTION, display, `external-action language may ask a reader or agent to run code or contact a resource; do not execute it`, line, { lint_status: INJECTION_LINT_STATUS, signal: "external-action-language" });
        }
        if (injectionPatternStartsHere(INJECTION_SECOND_PERSON_PATTERNS, current, window) && (!INJECTION_GAME_CONTEXT.test(window) || INJECTION_AGENT_CONTEXT.test(window))) {
          warning("INJECTION_READER_DIRECTIVE", INJECTION_LINT_SECTION, display, `second-person directive may address the reader or agent rather than describe game behavior; review the context`, line, { lint_status: INJECTION_LINT_STATUS, signal: "second-person-directive" });
        }

        const hexLength = injectionHexLength(raw);
        if (hexLength !== undefined) {
          warning("INJECTION_OBFUSCATED_BLOCK", INJECTION_LINT_SECTION, display, `long hex-like run (${hexLength} characters) may conceal instructions; do not decode it automatically`, line, { lint_status: INJECTION_LINT_STATUS, signal: "hex-like-run", characters: hexLength });
        }
        const base64Length = injectionBase64Length(raw);
        if (base64Length !== undefined) {
          warning("INJECTION_OBFUSCATED_BLOCK", INJECTION_LINT_SECTION, display, `long base64-like run (${base64Length} characters) may conceal instructions; do not decode it automatically`, line, { lint_status: INJECTION_LINT_STATUS, signal: "base64-like-run", characters: base64Length });
        }

        if (!fenced[index] && (INJECTION_DANGEROUS_LINK.test(raw) || INJECTION_ACTION_LINK.test(raw))) {
          warning("INJECTION_SUSPICIOUS_LINK", INJECTION_LINT_SECTION, display, `prose contains a link with action-oriented, executable, local-network, credential, or active-scheme indicators; do not follow it automatically`, line, { lint_status: INJECTION_LINT_STATUS, signal: "suspicious-link" });
        }
      });

      for (const paragraph of proseParagraphs(text)) {
        const match = INJECTION_IMPERATIVE_START.exec(paragraph.text);
        if (!match) continue;
        const agentContext = INJECTION_AGENT_CONTEXT.test(paragraph.text);
        const buildPlanContext = path.basename(file).toLowerCase() === "05-build-plan.md";
        if ((!agentContext && !buildPlanContext) || (INJECTION_GAME_CONTEXT.test(paragraph.text) && !agentContext && !buildPlanContext)) continue;
        warning("INJECTION_READER_DIRECTIVE", INJECTION_LINT_SECTION, display, `imperative ${JSON.stringify(match[1].toLowerCase())} may address the builder or test runner rather than describe game behavior; review the context`, paragraph.line, { lint_status: INJECTION_LINT_STATUS, signal: "imperative-reader-directive", verb: match[1].toLowerCase() });
      }
    }
  }

  function validateTieBreakLint(packageRoot) {
    const file = path.join(packageRoot, "02-mechanics.md");
    if (!host.exists(file)) return;
    const text = host.readText(file);
    const choice = /\b(?:nearest|closest|first|last|when both|both conditions|simultaneous(?:ly)?|equal distance|equidistant|ties?|targets?|selects?|chooses?|choice|ordering)\b/i;
    const sharedCeiling = /(?:\b(?:total|combined|shared|all)\b.{0,180}\b(?:cap(?:ped)?|ceiling|limit(?:ed)?|maximum|max)\b|\b(?:cap(?:ped)?|ceiling)\b.{0,180}\b(?:allocation|composition|formula|total|combined|shared|reduce|remaining|regardless)\b)/i;
    const resolution = /\b(?:tie[- ]?break|lowest|highest|ascending|descending|clockwise|counterclockwise|lexicograph|priority|prioritize|prefer|wins|random|prng|listed order|declared order|fixed order|by id|before|after|then)\b/i;
    const allocationResolution = /\b(?:priority|prioritize|preserve|clamp\s+(?:the\s+)?(?:first|second|[a-z-]+)|remove\s+(?:the\s+)?(?:first|second|[a-z-]+)|reduce\s+(?:the\s+)?(?:first|second|[a-z-]+)|remaining capacity|allocated first|allocated last|wins)\b/i;
    for (const paragraph of proseParagraphs(text)) {
      // A backticked token is a citation, not English: under decision 32 a
      // record id like `first-note` is cited constantly, and reading it as
      // the word "first" makes every such paragraph choice-shaped. The
      // resolution scan keeps the full text — a resolution stated anywhere
      // in the paragraph, cited or prose, settles the choice.
      const spoken = paragraph.text.replaceAll(/`[^`]*`/g, "`…`");
      const isShared = sharedCeiling.test(spoken);
      const isChoice = choice.test(spoken);
      if ((!isChoice && !isShared) || resolution.test(paragraph.text) || (isShared && allocationResolution.test(paragraph.text))) continue;
      const excerpt = paragraph.text.length > 180 ? `${paragraph.text.slice(0, 177)}…` : paragraph.text;
      warning(isShared ? "TIE_BREAK_SHARED_CEILING" : "TIE_BREAK_CHOICE", "§2a", "02-mechanics.md", `choice-shaped rule lacks a mechanically apparent tie-break: ${excerpt}`, paragraph.line);
    }
  }

  function validateProseLiterals(packageRoot, manifest, tuningDoc) {
    if (!isObject(tuningDoc)) return;
    const numericValues = new Map();
    if (isObject(tuningDoc.values)) {
      for (const [key, value] of Object.entries(tuningDoc.values)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          if (!numericValues.has(value)) numericValues.set(value, []);
          numericValues.get(value).push(key);
        }
      }
    }
    const numberPattern = /(?<![A-Za-z0-9_.-])-?(?:\d+\.\d+|\d+)(?![A-Za-z0-9_.-])/g;
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const item of unfencedLines(text)) {
        if (/^\s*#/.test(item.text) || /non[- ]normative/i.test(item.text) || /^\s*Format (?:revision|version):/i.test(item.text)) continue;
        for (const match of item.text.matchAll(numberPattern)) {
          const raw = match[0];
          const before = item.text.slice(Math.max(0, match.index - 4), match.index);
          if (/§\s*$/.test(before) || /AT-$/.test(before) || /^\s*\d+[.)]\s/.test(item.text)) continue;
          const numeric = Number(raw);
          const keys = numericValues.get(numeric);
          if (!keys) continue;
          warning("PROSE_TUNING_LITERAL", "§4", slash(chapter), `numeric literal ${raw} duplicates tuning ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ` (+${keys.length - 5} more)` : ""}; normative prose should refer to a key`, item.line, { value: numeric, tuning_keys: keys });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SPEC §4 — the prose citation grammar.
  //
  // §1 mandates the bare backticked form for a tuning citation, so decidability
  // comes from the token's own segments. A backticked dotted token in chapter
  // prose classifies by four rules, in order: a reserved first segment makes it
  // a mechanism path that resolves against its own file; all-digit segments
  // make it a version string; a reserved extension segment in any position
  // makes it a file mention, since `tuning.json.invariants` names a member of a
  // file as surely as `tuning.json` names the file; anything left is a bare
  // tuning citation, and it MUST resolve in tuning.json.
  // ---------------------------------------------------------------------------

  const RESERVED_SINCE = new Map([
    ["palette", PALETTE_REVISION], ["collections", COLLECTIONS_REVISION],
    ["values", "0.7"], ["ranges", "0.7"], ["rules", "0.7"], ["runtime", "0.7"],
    ["colors", "0.7"], ["contrast", "0.7"], ["timing", "0.7"]
  ]);
  const reservedIn = segment => RESERVED_SINCE.get(segment) ?? SPEC_VERSION;
  // The reserved segments whose family exposes a mechanical citation target,
  // and the file each resolves against:
  //
  // - the §9 direction families, in their declared citable shapes, against
  //   `direction.json`;
  // - `palette`, against the palette map in the same file (§3);
  // - `values` and `ranges`, against their same-named tuning.json tables;
  // - `rules`, against tuning.json's rule map by name;
  // - `clocks`, against the declared mode ids and clock names of
  //   `clocks.json` (§4b);
  // - `contracts`, against the adoption file that owns the value (§10.6),
  //   handled on its own branch below.
  //
  // The remaining reserved segments — `runtime`, `manifest`, and `build` —
  // name format mechanisms rather than declared entries in this
  // phase, so a token opening with one is classified and resolves against
  // nothing.
  const DIRECTION_CITABLE_SEGMENTS = new Set(["pillars", "mood", "anti", "must_keep", "colors", "contrast", "timing", "palette"]);
  const DOTTED_TOKEN = TUNING_KEY_PATTERN;
  function classifyProseToken(token) {
    if (!DOTTED_TOKEN.test(token)) return undefined;
    const segments = token.split(".");
    if (RESERVED_FIRST_SEGMENT_SET.has(segments[0])) return { kind: "mechanism", segments };
    if (segments.every(segment => /^\d+$/.test(segment))) return { kind: "version", segments };
    if (segments.some(segment => RESERVED_EXTENSION_SET.has(segment))) return { kind: "file", segments };
    return { kind: "tuning", segments };
  }

  // ---------------------------------------------------------------------------
  // SPEC §3 / §4 — the direction file's `palette` map.
  //
  // A palette is a named set of colors declared in direction.json. It carries
  // no scope or tolerance: the promise about a color is a `colors` entry, and
  // the palette is only where the color is written down, exactly once.
  //
  // The grammars below are the validator's copy of the schema's patterns. The
  // schema carries shape — key grammar, name grammar, entry forms — and this
  // layer carries everything that needs a second document to decide: entry-form
  // enumeration in plain words, name uniqueness, the declare-time collision
  // rule, the two-pass resolution order, and reachability.
  // ---------------------------------------------------------------------------

  const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
  // One segment of a palette key, and equally one color name: kebab-case with
  // at least one letter, excluding the reserved extension words. The letter
  // rule is what makes `palette.a.fire.2` unspellable, and so what makes
  // §9.1's ban on index citations structural rather than a check.
  const PALETTE_SEGMENT = /^(?!(?:json|md)$)(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // §4 resolution, in the fixed two-pass order, over one reference text: the
  // prose token minus its `palette.` first segment, or the typed form's text
  // after `palette:`. Whole text as a palette key first; only then the last
  // segment as a color name of the remainder. A one-pass split at the last dot
  // is not verdict-equivalent — it dangles on a legal dotted key — so the order
  // is normative and this is the one implementation of it.
  function resolvePaletteReference(paletteCtx, text) {
    const palettes = paletteCtx?.palettes;
    if (!palettes) return { kind: "dangling" };
    if (palettes.has(text)) return { kind: "palette", key: text };
    const cut = text.lastIndexOf(".");
    if (cut > 0) {
      const key = text.slice(0, cut);
      const name = text.slice(cut + 1);
      const colors = palettes.get(key);
      if (colors && colors.has(name)) return { kind: "color", key, name, hex: colors.get(name) };
    }
    return { kind: "dangling" };
  }

  function resolveDirectionPaletteColor(paletteCtx, value, label, section, display) {
    if (typeof value !== "string" || !/^palette\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(value)) {
      error("DIRECTION_COLOR_REFERENCE", section, display, `${label} ${JSON.stringify(value)} is not a palette color address; use \`palette.<key>.<name>\``);
      return undefined;
    }
    const text = value.slice("palette.".length);
    const resolved = resolvePaletteReference(paletteCtx, text);
    if (resolved.kind === "color") {
      paletteCtx.reached.add(resolved.key);
      return resolved;
    }
    if (resolved.kind === "palette") {
      // Not reached: §3's reachability list is about references that bind, and
      // this one has just been rejected. Marking it reached here would let a
      // failing reference suppress the PALETTE_UNREACHED warning.
      error("DIRECTION_COLOR_DANGLING", section, display, `${label} ${JSON.stringify(value)} names a palette, not a color`);
      return undefined;
    }
    error("DIRECTION_COLOR_DANGLING", section, display, `${label} ${JSON.stringify(value)} ${paletteDanglingTail(paletteCtx)}`);
    return undefined;
  }

  // §4's SHOULD: when a package declares no palette map at all, a dangling
  // palette reference names the revision that reserved the segment, mirroring
  // the TUNING_KEY_RESERVED wording. A designer mid-migration otherwise gets a
  // bare "dangling" from one tool and a versioned explanation from another.
  // The SHOULD is scoped to "no `palette` map at all", so a package that
  // declares one and mistyped a key gets the ordinary wording — including when
  // the map it declared is empty or malformed, which is a declaration with a
  // fault of its own rather than an absence.
  function paletteDanglingTail(paletteCtx) {
    return paletteCtx?.declared
      ? "resolves to no declared palette and to no named color of one"
      : "resolves to nothing: this package declares no `palette` map, and `palette` is a first segment reserved in v0.6; owned by `direction.json` since v0.7";
  }

  // §9.1's closed enumeration of what an entry may be, said in the words a
  // designer would use. The schema rejects the same set; this layer exists so
  // the report names the form rather than a JSON Pointer.
  function paletteEntryProblem(entry) {
    if (typeof entry === "string") {
      return HEX_COLOR.test(entry) ? undefined : `${JSON.stringify(entry)} is not a #RRGGBB color (\`#\` plus exactly six hexadecimal digits; three-digit shorthand is invalid)`;
    }
    if (Array.isArray(entry)) return "is an array; a palette holds colors, and a palette inside a palette is not a form";
    if (entry === null) return "is null";
    if (typeof entry === "number" || typeof entry === "boolean") return `is a ${typeof entry}`;
    if (!isObject(entry)) return "is outside the two legal entry forms";
    const keys = Object.keys(entry);
    if (keys.length === 0) return "is an empty object; a naming entry carries exactly one key, the color's name";
    if (keys.length > 1) return `carries ${keys.length} keys (${keys.map(key => JSON.stringify(key)).join(", ")}); a naming entry carries exactly one`;
    const [name] = keys;
    if (!PALETTE_SEGMENT.test(name)) return `names the color ${JSON.stringify(name)}, outside the kebab-case rule a color name obeys (dot-free, carrying at least one letter, and not \`json\` or \`md\`)`;
    const value = entry[name];
    if (typeof value !== "string" || !HEX_COLOR.test(value)) return `binds ${JSON.stringify(name)} to ${JSON.stringify(value)}, which is not a #RRGGBB color`;
    return undefined;
  }

  // Reads the map, reports every declare-time rule, and returns the resolution
  // context every later pass shares. It is built before anything that cites a
  // palette is checked.
  function validatePalettes(directionDoc) {
    const context = {
      declared: isObject(directionDoc) && own(directionDoc, "palette"),
      palettes: new Map(),
      reached: new Set()
    };
    if (!isObject(directionDoc?.palette)) return context;

    const declaredNames = new Map();
    for (const [key, entries] of Object.entries(directionDoc.palette)) {
      if (!Array.isArray(entries)) {
        error("PALETTE_SHAPE", "§9.1", "direction.json", `palette.${key} must be a non-empty array of palette entries`);
        continue;
      }
      if (entries.length === 0) {
        error("PALETTE_SHAPE", "§9.1", "direction.json", `palette.${key} is empty; an empty palette declares nothing`);
        continue;
      }
      const colors = new Map();
      // Every color name this palette spells, whether or not the entry carrying
      // it is well formed. `colors` is what a reference resolves against, so a
      // faulted entry must stay out of it; `names` is what §9.1's collision rule
      // reads, and that rule is a property of the two keys and the declared name
      // and of nothing else. Keeping one map for both made the collision
      // diagnostic order-dependent on an unrelated rule: a malformed hex beside
      // the name suppressed it, so the designer fixed the hex, revalidated, and
      // was handed a structural error nothing had mentioned.
      const names = new Set();
      entries.forEach((entry, index) => {
        const problem = paletteEntryProblem(entry);
        if (problem !== undefined) error("PALETTE_ENTRY_FORM", "§9.1", "direction.json", `palette.${key}[${index}] ${problem}`);
        if (typeof entry === "string" || !isObject(entry)) return; // a bare hex is read, not pointed at
        const entryKeys = Object.keys(entry);
        if (entryKeys.length !== 1) return; // a zero- or two-key object names no one color
        const [name] = entryKeys;
        if (!PALETTE_SEGMENT.test(name)) return; // no spellable name to collide with
        // Two entries MAY carry the same hex — a name is a citation handle, not
        // a claim of distinctness — but two names collide as citation targets.
        if (names.has(name)) {
          error("PALETTE_COLOR_DUPLICATE", "§9.1", "direction.json", `palette.${key} names the color ${JSON.stringify(name)} twice; a color name is unique within its palette`);
          return;
        }
        names.add(name);
        if (problem !== undefined) return;
        colors.set(name, entry[name]);
      });
      context.palettes.set(key, colors);
      declaredNames.set(key, names);
    }

    // §9.1's declare-time collision rule, stated there as a MUST NOT: palettes
    // are machine-declared in one map, so the collision is cheap to detect and
    // there is no authoring case for it. It reads declared names rather than
    // resolvable colors, so an entry-form fault elsewhere in the shorter
    // palette cannot suppress it.
    for (const key of declaredNames.keys()) {
      for (const [other, names] of declaredNames) {
        if (other === key || !key.startsWith(`${other}.`)) continue;
        const tail = key.slice(other.length + 1);
        if (names.has(tail)) {
          error("PALETTE_KEY_COLLISION", "§9.1", "direction.json", `palette key ${JSON.stringify(key)} equals palette ${JSON.stringify(other)} plus its color ${JSON.stringify(tail)}; a citation of it would be undecidable`);
        }
      }
    }

    return context;
  }

  // §9.1's reachability SHOULD: a palette reachable by nothing is legal
  // declared-but-unused data, and draws a warning on the `duplicate-edge`
  // precedent — usually an editing slip, worth seeing, decides nothing. The
  // four reaching constructs are §9.1's closed list: a mood's `palette`
  // field, a §9.6 colour promise, a §9.6 contrast operand, and a §4 prose
  // citation. Granularity is per palette, so
  // an unused color name inside a reached palette draws nothing.
  function reportUnreachedPalettes(paletteCtx) {
    if (!paletteCtx) return;
    for (const key of paletteCtx.palettes.keys()) {
      if (paletteCtx.reached.has(key)) continue;
      warning("PALETTE_UNREACHED", "§9.1", "direction.json", `palette.${key} is reached by no mood, no color or contrast claim, and no prose citation`);
    }
  }

  // WCAG 2.1 relative luminance and contrast ratio over 8-bit sRGB, for §9.6's
  // contrast consistency check. The formula is the WCAG 2.1 contrast ratio
  // names; no other registered metric exists in v0.6.
  function relativeLuminance(hex) {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function contrastRatio(left, right) {
    const first = relativeLuminance(left);
    const second = relativeLuminance(right);
    const [lighter, darker] = first >= second ? [first, second] : [second, first];
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Inline-code spans only. The citation form §1 mandates is backticked, and a
  // bare dotted word in running text is prose — "i.e.", "U.S." — not a citation.
  //
  // The retired direction fence is a fenced block, so `unfencedLines` drops it —
  // but §3 rules that a backticked token on one of its **continuation** lines
  // is chapter prose like any other, "so it resolves and it reaches". Those
  // lines rejoin the scan here, for every citation family this walk handles
  // rather than for palettes alone: the sentence names the palette case because
  // that is the one it had to settle, and the rationale under a colour is the
  // same rationale prose wherever it sits. The fence's own citation lines stay
  // out: they are fence grammar, resolved by the fence machinery, and scanning
  // them here would report every fence entry twice.
  function* inlineCodeTokens(text) {
    const lines = [...unfencedLines(text)];
    for (const item of lines) {
      for (const match of item.text.matchAll(/`([^`\n]+)`/g)) {
        yield { token: match[1].trim(), line: item.line };
      }
    }
  }

  // True when one insertion, deletion, or substitution turns one string into
  // the other. Used only for the did-you-mean hint on a dangling citation.
  function isNearMiss(left, right) {
    if (left === right) return false;
    const [short, long] = left.length <= right.length ? [left, right] : [right, left];
    if (long.length - short.length > 1) return false;
    let shortIndex = 0;
    let longIndex = 0;
    let edits = 0;
    while (shortIndex < short.length && longIndex < long.length) {
      if (short[shortIndex] === long[longIndex]) { shortIndex += 1; longIndex += 1; continue; }
      edits += 1;
      if (edits > 1) return false;
      if (short.length === long.length) shortIndex += 1;
      longIndex += 1;
    }
    return edits + (long.length - longIndex) <= 1;
  }

  // ---------------------------------------------------------------------------
  // Retired typed prose forms stay recognizable so their failures can carry a
  // precise migration hint. Runtime values and collection paths use dotted
  // addresses; neither retired prefix can declare or resolve a value.
  // ---------------------------------------------------------------------------
  function proseTypedReferenceProblem(token) {
    if (token.includes("<") || token.includes(">")) return undefined;
    const descriptor = /^descriptor:([^:]+):(.+)$/.exec(token);
    if (descriptor) {
      return descriptor[1] === "mood"
        ? { section: "§9", message: `is retired; \`descriptor:mood:${descriptor[2]}\` is now \`mood.${descriptor[2]}\`` }
        : { section: "§9", message: "names a retired form; descriptors no longer exist (a mood is `mood.<name>`)" };
    }
    if (token.startsWith("state:")) {
      const number = /^state:number:([^:]+)$/.exec(token);
      return { section: "§4b", message: number ? `is retired; \`state:number:${number[1]}\` is now \`runtime.${number[1]}\`` : "is retired; write a `runtime.<name>` address and state the condition in a sentence" };
    }
    if (/^collections\b/.test(token) && token.includes(":")) return { section: "§1b", message: "uses a retired colon count form; cite the drawer with its dotted address and state the count in prose" };
    return undefined;
  }

  function validateProseCitations(packageRoot, manifest, tuningDoc, directionCtx, contractsCtx, paletteCtx, exprContext) {
    // A tuning.json that is missing, unparsable, or without `values` has
    // already reported itself. Resolving citations against nothing would bury
    // that one finding under one dangling report per citation in the package.
    // The gate covers what resolves in tuning.json — the tuning citations of
    // §4's rule 4 — and the direction and contract families, which each have a
    // gate of their own below. It does not cover palettes: that map lives in
    // manifest.json and resolves whether or not tuning.json parses, and the
    // batch already routed the palette branch around the sibling
    // no-direction-file gate for the same reason.
    const tuningReadable = isObject(tuningDoc) && isObject(tuningDoc.values);
    const keys = new Set(tuningReadable ? Object.keys(tuningDoc.values) : []);
    const directionDoc = directionCtx?.directionDoc;
    for (const { chapter, text } of chapterTexts(packageRoot)) {
      for (const { token, line } of inlineCodeTokens(text)) {
        // §4: "a token carrying a colon is not one" of the dotted tokens the
        // classification rule reads, so the typed forms are resolved first and
        // on their own terms.
        if ((/^(?:descriptor|state)\b/.test(token) || /^collections\b/.test(token)) && token.includes(":")) {
          const problem = proseTypedReferenceProblem(token);
          if (problem) {
            error("PROSE_REFERENCE_DANGLING", problem.section, slash(chapter), `prose reference \`${token}\` ${problem.message}`, line, { token });
          }
          continue;
        }
        if ((token === "runtime" || token.startsWith("runtime.")) && !RUNTIME_ADDRESS.test(token)) {
          error("PROSE_CITATION_DANGLING", "§4b", slash(chapter), `prose citation \`${token}\` is not a runtime address; use runtime plus one or more dotted tuning-key segments`, line, { token });
          continue;
        }
        const classified = classifyProseToken(token);
        if (!classified || classified.kind === "version" || classified.kind === "file") continue;
        if (classified.kind !== "mechanism" && !tuningReadable) continue;
        if (classified.kind === "mechanism") {
          const [first] = classified.segments;
          if (!tuningReadable && first !== "palette" && first !== "collections") continue;
          // A backticked contract address is classified by §4's reserved-
          // first-segment rule and resolves against the adoption that owns it.
          if (first === "contracts") {
            if (!contractsCtx) continue;
            // A bare adoption address
            // naming the adoption itself is accepted where the instance exists:
            // the spec does not declare it citable, and inventing a failure for
            // prose that names a real declared thing is the wrong default.
            const named = classified.segments.length === 2 && contractsCtx.instanceIds.has(classified.segments[1]);
            if (!named && !contractsCtx.contractKeys.has(token)) {
              error("PROSE_CITATION_DANGLING", "§10", slash(chapter), `prose citation \`${token}\` names no declared contract adoption or value; the citable form is \`contracts.<adoption>.<value>\``, line, { token });
            }
            continue;
          }
          if (first === "values" || first === "ranges") {
            const table = isObject(tuningDoc?.[first]) ? tuningDoc[first] : {};
            const key = classified.segments.slice(1).join(".");
            if (!own(table, key)) error("PROSE_CITATION_DANGLING", "§4", slash(chapter), `prose citation \`${token}\` does not resolve to a declared tuning.json ${first} key`, line, { token });
            continue;
          }
          if (first === "rules") {
            const rules = isObject(tuningDoc?.rules) ? tuningDoc.rules : {};
            const name = classified.segments[1];
            if (!own(rules, name)) error("PROSE_CITATION_DANGLING", "§4", slash(chapter), `prose citation \`${token}\` does not resolve to a declared tuning.json rule name`, line, { token });
            continue;
          }
          if (first === "runtime") continue;
          // Decision 40's single address is `clocks.<name>`. Modes are tag
          // vocabulary, not separately citable objects, and the retired
          // root wrappers do not survive as prose paths.
          if (first === "clocks") {
            const names = exprContext?.clocks?.clocks ?? new Set();
            const [, second] = classified.segments;
            const resolved = classified.segments.length === 2 && names.has(second);
            if (!resolved) {
              error("PROSE_CITATION_DANGLING", "§4b", slash(chapter), `prose citation \`${token}\` does not resolve to a declared clocks.json clock; use \`clocks.<name>\``, line, { token });
            }
            continue;
          }
          // §1b (decision 32): `collections.<drawer>` cites the drawer as a
          // set and `collections.<drawer>.<record>` cites one record; a longer
          // token names a member of the record's own data and resolves as far
          // as the record, the rule descriptors and invariants use. A dangling
          // citation is a hard failure — with graph edges, contract row
          // sources, and expression references already hard-checked, this
          // closes the format's last silent-rename gap: renaming a record
          // makes every stale reference a finding with a file and line.
          if (first === "collections") {
            const drawers = exprContext?.collections ?? new Map();
            const [, drawer, record] = classified.segments;
            const info = drawers.get(drawer);
            if (!info) {
              error("PROSE_CITATION_DANGLING", "§1b", slash(chapter), `prose citation \`${token}\` names no collections/ drawer`, line, { token });
              continue;
            }
            info.reached = true;
            if (record !== undefined && !info.recordIds.has(record)) {
              error("PROSE_CITATION_DANGLING", "§1b", slash(chapter), `prose citation \`${token}\` does not resolve to a record of collections/${drawer}; the record's id is its filename`, line, { token });
            }
            continue;
          }
          if (!DIRECTION_CITABLE_SEGMENTS.has(first)) continue;
          // A palette citation is of arbitrary segment count by construction —
          // `palette.enemies.fire` and `palette.enemies.fire.flame` are three
          // and four — so the shape gate admits two or more: the `palette`
          // segment plus one or more key-or-name segments.
          const citableShape = first === "palette"
              ? classified.segments.length >= 2
              : classified.segments.length === 2;
          if (!citableShape) continue;
          // Palette citations use their own variable-length resolver before
          // the exact two-segment direction-family gate below.
          if (first === "palette") {
            const text = classified.segments.slice(1).join(".");
            const resolved = resolvePaletteReference(paletteCtx, text);
            if (resolved.kind === "dangling") {
              error("PROSE_CITATION_DANGLING", "§4", slash(chapter), `prose citation \`${token}\` ${paletteDanglingTail(paletteCtx)}`, line, { token });
            } else {
              paletteCtx.reached.add(resolved.key);
            }
            continue;
          }
          if (!isObject(directionDoc)) continue;
          const resolvedDirection = resolveDirectionPath(directionDoc, token);
          if (!resolvedDirection) {
            error("PROSE_CITATION_DANGLING", "§9", slash(chapter), `prose citation \`${token}\` does not resolve to a declared ${directionCtx.declaredPath} entry`, line, { token });
          } else if (DIRECTION_JUDGED_KINDS.has(resolvedDirection.kind)) {
            directionCtx.mentioned.add(token);
          }
          continue;
        }
        if (keys.has(token)) continue;
        const near = RESERVED_FIRST_SEGMENTS.find(segment => isNearMiss(classified.segments[0], segment));
        const migrated = /^constraints\.(colors|thresholds|timing)\./.test(token)
          ? `; \`${token}\` is a retired direction path (for example, \`constraints.colors.x\` is now \`colors.x\`)`
          : "";
        const hint = migrated || (near ? `; did you mean the reserved \`${near}.\` family?` : "");
        error("PROSE_CITATION_DANGLING", "§4", slash(chapter), `prose citation \`${token}\` does not resolve to a tuning.json key${hint}`, line, { token, first_segment: classified.segments[0] });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SPEC §9 — direction.json and retired chapter-fence detection.
  // ---------------------------------------------------------------------------

  // A host may throw while reading or parsing a schema file. Report that as a
  // finding, never as a crash: a malformed schema must still yield a report.
  function loadSchema(name, section = "§9") {
    try {
      return host.loadSchema(name);
    } catch (cause) {
      error("SCHEMA_JSON", section, `../${name}`, `is not valid JSON: ${cause.message}`);
      return undefined;
    }
  }

  function validateDirectionImages(directionDoc, resolvePath) {
    walk(directionDoc, (value, pointer) => {
      if (!isObject(value) || typeof value.image !== "string") return;
      resolvePath(value.image, `${pointer}/image`, "§9", "MEDIA_PATH_MISSING", { mustExist: true, kind: "file", display: "direction.json" });
    });
  }

  function resolveDirectionPath(directionDoc, dotted) {
    if (!isObject(directionDoc)) return undefined;
    const parts = dotted.split(".");
    if (parts.length === 2 && ["pillars", "mood", "anti", "must_keep", "colors", "contrast", "timing"].includes(parts[0])) {
      const entry = directionDoc[parts[0]]?.[parts[1]];
      return entry ? { kind: parts[0], key: parts[1], entry } : undefined;
    }
    return undefined;
  }

  const DIRECTION_JUDGED_KINDS = new Set(["pillars", "mood", "anti", "must_keep"]);

  function validateDirection(packageRoot, resolvePath, exprContext) {
    const declaredPath = "direction.json";
    const directionFile = path.join(packageRoot, declaredPath);
    const declared = host.exists(directionFile) && host.isFile(directionFile);

    for (const { chapter, text } of chapterTexts(packageRoot)) {
      if (/```direction[^\r\n]*\r?\n[\s\S]*?```/i.test(text)) {
        error("DIRECTION_FENCE_RETIRED", "§9", slash(chapter), "the ```direction fence is retired; run `opengdd migrate` to turn its citations and rationale into ordinary presentation prose");
      }
    }
    if (!declared) return { directionDoc: undefined, declaredPath, requiredCoverage: new Set(), coveredByAT: new Set(), mentioned: new Set(), paletteCtx: validatePalettes(undefined) };

    const directionDoc = parseJsonFile(directionFile, declaredPath, "§9", "DIRECTION_JSON");

    if (directionDoc !== undefined) {
      const schema = loadSchema("direction.schema.json");
      if (schema) {
        for (const problem of schemaProblems(directionDoc, schema, schema)) {
          error("DIRECTION_SCHEMA", "§9", slash(declaredPath), `${problem.path} ${problem.message}`);
        }
      }
      validateDirectionImages(directionDoc, resolvePath);
    }
    const paletteCtx = validatePalettes(directionDoc);
    const requiredCoverage = new Set();
    if (isObject(directionDoc)) {
      for (const [key, entry] of Object.entries(directionDoc.mood ?? {})) {
        if (!isObject(entry)) continue;
        if (!own(entry, "palette")) continue;
        const address = typeof entry.palette === "string" && /^palette\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(entry.palette)
          ? entry.palette.slice("palette.".length)
          : undefined;
        const resolved = address === undefined ? { kind: "dangling" } : resolvePaletteReference(paletteCtx, address);
        if (resolved.kind === "palette") paletteCtx.reached.add(resolved.key);
        else if (resolved.kind === "color") error("DIRECTION_MOOD_PALETTE_DANGLING", "§9", declaredPath, `mood.${key}.palette ${JSON.stringify(entry.palette)} names a colour, not a palette`);
        else error("DIRECTION_MOOD_PALETTE_DANGLING", "§9", declaredPath, `mood.${key}.palette ${JSON.stringify(entry.palette)} does not resolve to a declared palette address`);
      }

      for (const [key, entry] of Object.entries(directionDoc.colors ?? {})) {
        if (!isObject(entry)) continue;
        requiredCoverage.add(`colors.${key}`);
        if (own(entry, "is")) resolveDirectionPaletteColor(paletteCtx, entry.is, `colors.${key}.is`, "§9", declaredPath);
      }
      for (const [key, entry] of Object.entries(directionDoc.contrast ?? {})) {
        if (!isObject(entry)) continue;
        requiredCoverage.add(`contrast.${key}`);
        const operands = [];
        (Array.isArray(entry.colors) ? entry.colors : []).forEach((color, index) => {
          operands.push(resolveDirectionPaletteColor(paletteCtx, color, `contrast.${key}.colors[${index}]`, "§9", declaredPath));
        });
        const against = own(entry, "against")
          ? resolveDirectionPaletteColor(paletteCtx, entry.against, `contrast.${key}.against`, "§9", declaredPath)
          : undefined;
        if (typeof entry.at_least !== "number" || !Number.isFinite(entry.at_least) || !against) continue;
        for (const operand of operands) {
          if (!operand) continue;
          const ratio = contrastRatio(operand.hex, against.hex);
          if (ratio + 1e-9 >= entry.at_least) continue;
          error("DIRECTION_CONTRAST_FAILED", "§9", declaredPath, `contrast.${key}: \`palette.${operand.key}.${operand.name}\` (${operand.hex}) against \`palette.${against.key}.${against.name}\` (${against.hex}) is ${ratio.toFixed(2)}:1, below the declared floor ${entry.at_least}:1`);
        }
      }
      for (const [key, entry] of Object.entries(directionDoc.timing ?? {})) {
        requiredCoverage.add(`timing.${key}`);
        if (isObject(entry) && typeof entry.key === "string" && !exprContext?.tuning?.has(entry.key)) {
          error("DIRECTION_TIMING_KEY", "§9", declaredPath, `timing.${key}.key ${JSON.stringify(entry.key)} does not resolve to a declared values key`);
        }
      }
    }
    return { directionDoc, declaredPath, requiredCoverage, coveredByAT: new Set(), mentioned: new Set(), paletteCtx };
  }

  function reportUnmentionedDirection(directionCtx) {
    if (!isObject(directionCtx?.directionDoc)) return;
    for (const kind of DIRECTION_JUDGED_KINDS) {
      for (const key of Object.keys(directionCtx.directionDoc[kind] ?? {})) {
        const citation = `${kind}.${key}`;
        if (!directionCtx.mentioned.has(citation)) warning("DIRECTION_UNMENTIONED", "§9", "direction.json", `${citation} is declared but no chapter mentions it`);
      }
    }
  }

  function nonEmpty(value) {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return value !== undefined && value !== null;
  }

  function requireFields(descriptor, fields, id, file, line) {
    const missing = fields.filter(field => !nonEmpty(descriptor[field]));
    if (missing.length) error("VERIFICATION_FIELD", "§6", file, `${id} ${descriptor.type} descriptor requires ${missing.join(", ")}`, line);
  }

  const TEST_COMMON_FIELDS = new Set(["type", "diagnostics", "direction_claims", "unchanged", "replay", "target", "tolerance", "extensions"]);
  const TEST_FIELDS_BY_TYPE = new Map([
    ["scenario", new Set(["given", "when", "then"])],
    ["general", new Set(["scope", "holds", "seeds"])]
  ]);

  function stringOrStringArray(value) {
    return (typeof value === "string" && value.trim().length > 0)
      || (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0));
  }

  function stringArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0);
  }

  function validateTestEnvelope(descriptor, id, file, line) {
    const allowed = TEST_FIELDS_BY_TYPE.get(descriptor.type);
    if (allowed) {
      for (const key of Object.keys(descriptor)) {
        if (!TEST_COMMON_FIELDS.has(key) && !allowed.has(key)) {
          let hint = key === "freeze_invariant" ? "; `freeze_invariant` is now `unchanged`" : "";
          if (key === "domain") hint = "; `domain` is now `scope` on a general test";
          else if (key === "predicate") hint = "; `predicate` is now `holds` on a general test";
          else if (key === "applies_to") hint = "; a general test's holds sentence says whether the claim is about each case or a measure across them";
          else if (["initial_states", "bound"].includes(key)) hint = "; fold it into a general test's scope";
          else if (["transitions", "finite_state", "complete"].includes(key)) hint = "; the record says how thoroughly a general test was checked (acceptance.sampled)";
          else if (["rule_set", "artifacts"].includes(key)) hint = "; a package-file check belongs in the data rules or ordinary prose";
          if (hint) hint += " (run `opengdd migrate`)";
          error("VERIFICATION_FIELD_UNKNOWN", "§6", file, `${id} ${descriptor.type} descriptor carries unknown top-level field ${JSON.stringify(key)}; package-owned data belongs under extensions${hint}`, line);
        }
      }
    }
    if (!own(descriptor, "extensions")) return;
    if (!isObject(descriptor.extensions)) {
      error("VERIFICATION_EXTENSIONS", "§6", file, `${id} extensions must be an object keyed by kebab-case extension ids`, line);
      return;
    }
    for (const [key, value] of Object.entries(descriptor.extensions)) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) error("VERIFICATION_EXTENSIONS", "§6", file, `${id} extension id ${JSON.stringify(key)} must be kebab-case`, line);
      if (!isObject(value)) error("VERIFICATION_EXTENSIONS", "§6", file, `${id} extensions.${key} must be an opaque object value`, line);
    }
  }

  function validateReplay(replay, id, file, line) {
    if (!isObject(replay)) error("VERIFICATION_REPLAY", "§6", file, `${id} replay must be an object`, line);
  }

  function validateDescriptor(descriptor, id, file, line, resolvePath, exprContext, directionCtx, manifest, dependent = undefined) {
    if (!isObject(descriptor)) {
      error("VERIFICATION_SHAPE", "§6", file, `${id} test descriptor must be a JSON object`, line);
      return;
    }
    validateTestEnvelope(descriptor, id, file, line);
    if (own(descriptor, "unchanged")) {
      validateUnchanged(descriptor.unchanged, exprContext?.clocks, file, `${id} unchanged`, exprContext);
    }
    const retired = new Set(["property", "exhaustive-search", "document-check"]);
    if (retired.has(descriptor.type)) {
      error("VERIFICATION_TYPE_RETIRED", "§6", file, `${id} test type ${JSON.stringify(descriptor.type)} is retired; run \`opengdd migrate\``, line);
      return;
    }
    const legal = new Set(TEST_FIELDS_BY_TYPE.keys());
    if (!legal.has(descriptor.type)) {
      error("VERIFICATION_CLASS", "§6", file, `${id} has illegal test type ${JSON.stringify(descriptor.type)}`, line);
      return;
    }
    if (own(descriptor, "direction_claims")) {
      const claims = Array.isArray(descriptor.direction_claims) ? descriptor.direction_claims : undefined;
      if (!claims || !claims.length) {
        error("DIRECTION_CLAIMS_SHAPE", "§6", file, `${id} direction_claims must be a non-empty array of dotted-path citations`, line);
      } else {
        for (const claim of claims) {
          if (typeof claim !== "string") { error("DIRECTION_CLAIMS_SHAPE", "§6", file, `${id} direction_claims entries must be strings`, line); continue; }
          const resolved = directionCtx?.directionDoc ? resolveDirectionPath(directionCtx.directionDoc, claim) : undefined;
          if (!resolved || !["colors", "contrast", "timing"].includes(resolved.kind)) {
            const hint = typeof claim === "string" && claim.startsWith("constraints.") ? "; constraints.colors.x is now colors.x, constraints.thresholds.x is now contrast.x, and constraints.timing.x is now timing.x" : "";
            error("DIRECTION_CLAIMS_DANGLING", "§6", file, `${id} direction_claims cites ${JSON.stringify(claim)}, which does not resolve to a colors, contrast, or timing direction.json entry${hint}`, line);
          } else {
            directionCtx.coveredByAT.add(claim);
          }
        }
      }
    }
    if (descriptor.type === "scenario") {
      requireFields(descriptor, ["given", "when", "then"], id, file, line);
      for (const key of ["given", "when", "then"]) if (own(descriptor, key) && !stringOrStringArray(descriptor[key])) error("VERIFICATION_FIELD_TYPE", "§6", file, `${id} scenario ${key} must be a non-empty string or non-empty array of non-empty strings`, line);
    } else if (descriptor.type === "general") {
      if (typeof descriptor.scope !== "string" || !descriptor.scope.trim()) error("VERIFICATION_GENERAL_SCOPE", "§6", file, `${id} general scope must be a non-empty string`, line);
      if (typeof descriptor.holds !== "string" || !descriptor.holds.trim()) error("VERIFICATION_GENERAL_HOLDS", "§6", file, `${id} general holds must be a non-empty string`, line);
      if (own(descriptor, "seeds") && !stringArray(descriptor.seeds)) error("VERIFICATION_GENERAL_SEEDS", "§6", file, `${id} general seeds must be a non-empty array of non-empty strings`, line, undefined, dependent?.seeds === true);
    }
    if (own(descriptor, "diagnostics") && !stringArray(descriptor.diagnostics)) error("VERIFICATION_FIELD_TYPE", "§6", file, `${id} diagnostics must be a non-empty array of non-empty strings`, line);
    if (own(descriptor, "replay")) validateReplay(descriptor.replay, id, file, line);
    const hasTolerance = own(descriptor, "tolerance");
    const hasTarget = own(descriptor, "target");
    if (hasTolerance && !hasTarget) error("VERIFICATION_TOLERANCE_TARGET", "§6", file, `${id} declares tolerance without an expected target`, line);
    if (hasTolerance && (typeof descriptor.tolerance !== "number" || !Number.isFinite(descriptor.tolerance))) error("VERIFICATION_FIELD_TYPE", "§6", file, `${id} tolerance must be a finite number`, line);
  }

  function buildPlanAcceptanceHeadings(packageRoot, manifest) {
    const relative = "05-build-plan.md";
    if (path.isAbsolute(relative) || relative.includes("..")) return undefined;
    const file = path.join(packageRoot, relative);
    if (!host.exists(file)) return undefined;
    const text = host.readText(file);
    const headings = [...text.matchAll(/^#{1,6}\s+(AT-(\d+))\b.*$/gm)].map(match => ({ id: match[1], number: Number(match[2]), index: match.index, after: match.index + match[0].length, line: text.slice(0, match.index).split(/\r?\n/).length }));
    // §10.8: a generated acceptance test carries a derived name rather than a
    // number — `<instance>/<template>[/<row>]` — so it never enters §6's
    // consecutive numbering, and counting it needs its own arm.
    const generated = [...text.matchAll(/^#{1,6}\s+AT\s+([a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\s+—.*$/gm)].map(match => ({ name: match[1], index: match.index, after: match.index + match[0].length, line: text.slice(0, match.index).split(/\r?\n/).length }));
    return { relative, text, headings, generated };
  }

  // Read the descriptor set without assigning execution meaning. Build-record
  // validation uses it only to decide whether the acceptance result depended
  // on runner-owned runtime semantics and therefore needs a runner identity.
  // Package validation owns malformed/missing-block diagnostics, so unreadable
  // entries are omitted here instead of being reported a second time.
  function buildPlanAcceptanceDescriptors(plan) {
    if (!plan) return [];
    const tests = [
      ...plan.headings.map(heading => ({ ...heading, name: heading.id })),
      ...plan.generated
    ].sort((left, right) => left.index - right.index);
    return tests.flatMap((test, index) => {
      const next = tests[index + 1]?.index ?? plan.text.length;
      const body = plan.text.slice(test.after, next);
      const block = /^\s*```test[^\r\n]*\r?\n([\s\S]*?)```/.exec(body);
      if (!block) return [];
      try { return [{ name: test.name, descriptor: JSON.parse(block[1]) }]; }
      catch { return []; }
    });
  }

  function validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx) {
    const plan = buildPlanAcceptanceHeadings(packageRoot, manifest);
    if (!plan) return;
    const { relative, text, headings } = plan;
    const display = slash(relative);
    const retiredMarker = text.search(/^<!-- opengdd:contracts:generated:(?:begin|end)\b/m);
    const retiredAt = retiredMarker;
    if (retiredAt >= 0) error("CONTRACT_BLOCK_RETIRED", "§10", display, "the build plan carries a retired generated-contracts block; run `opengdd migrate` to remove its markers and content", text.slice(0, retiredAt).split(/\r?\n/).length);
    if (headings.length === 0) {
      error("VERIFICATION_AT_MISSING", "§6", display, "build plan must contain numbered AT-<n> acceptance tests");
    }
    headings.forEach((heading, index) => {
      // SPEC §6: AT numbers are unique and ascending in document order. Gaps are
      // permitted — a deleted test's number is retired, never reused.
      const previous = headings[index - 1];
      if (!Number.isInteger(heading.number) || heading.number < 1) {
        error("VERIFICATION_AT_ORDER", "§6", display, `${heading.id} must carry a positive acceptance-test number`, heading.line);
      } else if (previous && heading.number <= previous.number) {
        error("VERIFICATION_AT_ORDER", "§6", display, `${heading.id} follows ${previous.id}; acceptance-test numbers must be unique and ascending in document order`, heading.line);
      }
      const next = headings[index + 1]?.index ?? text.length;
      const body = text.slice(heading.after, next);
      const block = /^\s*```test[^\r\n]*\r?\n([\s\S]*?)```/.exec(body);
      if (!block) {
        error("VERIFICATION_BLOCK", "§6", display, `${heading.id} heading must be followed by a fenced test JSON descriptor`, heading.line);
        return;
      }
      let descriptor;
      try { descriptor = JSON.parse(block[1]); }
      catch (cause) {
        error("VERIFICATION_JSON", "§6", display, `${heading.id} test block is not valid JSON: ${cause.message}`, heading.line);
        return;
      }
      validateDescriptor(descriptor, heading.id, display, heading.line, resolvePath, exprContext, directionCtx, manifest);
    });
    if (directionCtx) {
      for (const claim of directionCtx.requiredCoverage) {
        if (!directionCtx.coveredByAT.has(claim)) {
          error("DIRECTION_CLAIM_UNCOVERED", "§9", display, `${claim} is not cited by any AT's direction_claims — every measured direction promise needs a covering AT`);
        }
      }
    }
  }

  // Shared helpers for self-contained v0.7 contract adoptions and packs.

  const CONTRACT_SECTION = "§10";
  const CONTRACT_DIRECTORY = "contracts";
  const CONTRACT_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CONTRACT_FIELD_TYPES = new Set(["number", "integer", "string", "citation"]);
  const CONTRACT_TEST_TYPES = new Set(["scenario", "general"]);
  const CONTRACT_PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

  function contractStripAnnotations(value) {
    if (Array.isArray(value)) return value.map(contractStripAnnotations);
    if (isObject(value)) {
      const result = {};
      for (const [key, member] of Object.entries(value)) {
        if (key.startsWith("_")) continue;
        result[key] = contractStripAnnotations(member);
      }
      return result;
    }
    return value;
  }

  // §10.4: every envelope object is closed. Members whose names begin with `_`
  // are annotations — legal everywhere, read by nothing, excluded from every
  // key-set comparison, and never interpolated.
  function contractClosed(object, allowed, required, display, pointer) {
    for (const key of Object.keys(object)) {
      if (key.startsWith("_")) continue;
      if (!allowed.includes(key)) {
        error("CONTRACT_ENVELOPE_UNKNOWN", CONTRACT_SECTION, display, `${pointer} carries undeclared field ${JSON.stringify(key)}; every object in the envelope is closed (legal here: ${allowed.join(", ")})`);
      }
    }
    for (const key of required) {
      if (!own(object, key)) error("CONTRACT_ENVELOPE_REQUIRED", CONTRACT_SECTION, display, `${pointer} is missing required field ${JSON.stringify(key)}`);
    }
  }

  function contractType(value, kind, display, pointer, what) {
    if (schemaTypeMatches(value, kind)) return true;
    error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer} ${what} must be ${Array.isArray(kind) ? kind.join(" or ") : kind}, got ${JSON.stringify(value)}`);
    return false;
  }

  // §10.6: what the designer names is kebab-case and dot-free, so
  // `contracts.<instance>.<knob>` parses unambiguously in the §4 dotted-key
  // namespace and an id can never collide with the item-3 fragment syntax.
  function contractKebab(value, display, pointer, what, maxLength = 0) {
    if (typeof value !== "string" || !CONTRACT_KEBAB.test(value)) {
      error("CONTRACT_NAME_GRAMMAR", CONTRACT_SECTION, display, `${pointer} ${what} must be a dot-free kebab-case name (lowercase letters, digits, hyphens), got ${JSON.stringify(value)}`);
      return false;
    }
    if (maxLength && [...value].length > maxLength) {
      error("CONTRACT_NAME_GRAMMAR", CONTRACT_SECTION, display, `${pointer} ${what} is ${[...value].length} characters; at most ${maxLength} are legal`);
      return false;
    }
    return true;
  }

  // §§10.3–10.4 use one condition: an object with optional `flag` and `row`
  // submembers, each mapping a name to a non-empty array of legal values.
  function contractWhenShape(when, display, pointer, rowDomainLegal) {
    if (when === undefined) return;
    if (!isObject(when)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/when must be a condition object with optional flag and row fields`);
      return;
    }
    contractClosed(when, ["flag", "row"], [], display, `${pointer}/when`);
    if (own(when, "row") && !rowDomainLegal) {
      error("CONTRACT_WHEN_DOMAIN", CONTRACT_SECTION, display, `${pointer}/when carries a row domain, which is legal only where a row is in scope (a record field, or a per-row template)`);
    }
    for (const domain of ["flag", "row"]) {
      if (!own(when, domain)) continue;
      if (!isObject(when[domain])) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/when/${domain} must map a name to an array of values`);
        continue;
      }
      for (const [name, values] of Object.entries(when[domain])) {
        if (!Array.isArray(values) || values.length === 0) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/when/${domain}/${name} must be a non-empty array of values; an empty array can never be satisfied, so a condition that means "always" omits the field instead`);
        }
      }
    }
  }

  // §§10.3–10.4 and §10.8: satisfied when every listed flag's recorded answer and every
  // listed row field's value is in its array. A condition naming a pruned flag
  // is unsatisfied — there is no recorded answer to read. Absent or empty is
  // satisfied.
  function contractWhenSatisfied(when, answers, liveFlags, row) {
    if (!isObject(when)) return true;
    if (isObject(when.flag)) {
      for (const [name, values] of Object.entries(when.flag)) {
        if (liveFlags && !liveFlags.has(name)) return false;
        if (!Array.isArray(values) || !own(answers, name) || !values.includes(answers[name])) return false;
      }
    }
    if (isObject(when.row)) {
      for (const [field, values] of Object.entries(when.row)) {
        if (!isObject(row) || !own(row, field) || !Array.isArray(values) || !values.includes(row[field])) return false;
      }
    }
    return true;
  }

  // Every placeholder occurrence in core-authored text, with the string it sits
  // in, so the caller can tell whole-value position from in-string position.
  function contractScanPlaceholders(value, pointer, found = []) {
    if (typeof value === "string") {
      for (const match of value.matchAll(CONTRACT_PLACEHOLDER_PATTERN)) {
        found.push({ raw: match[0], body: match[1], pointer, whole: value === match[0] });
      }
      return found;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => contractScanPlaceholders(item, `${pointer}/${index}`, found));
      return found;
    }
    if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (key.startsWith("_")) continue;
        contractScanPlaceholders(item, `${pointer}/${pointerEscape(key)}`, found);
      }
      return found;
    }
    return found;
  }

  // §10.8 substitution, two contexts. Whole-value: a string that is exactly one
  // placeholder is replaced by the raw JSON value. In-string: an embedded
  // placeholder substitutes as text — strings bare, numbers in shortest
  // round-trip decimal. Arrays and objects are legal in whole-value position
  // only. Values supplied by the surface or by rows are never re-scanned.
  function contractSubstitute(value, resolve, report) {
    if (typeof value === "string") {
      const solo = /^\{\{([^{}]*)\}\}$/.exec(value);
      if (solo) {
        const resolved = resolve(solo[1]);
        return resolved === undefined ? value : resolved;
      }
      return value.replace(CONTRACT_PLACEHOLDER_PATTERN, (match, body) => {
        const resolved = resolve(body);
        if (resolved === undefined) return match;
        if (typeof resolved === "string") return resolved;
        if (typeof resolved === "number") return JSON.stringify(resolved);
        if (typeof resolved === "boolean") return String(resolved);
        report(`placeholder ${match} interpolates ${Array.isArray(resolved) ? "an array" : "an object"} inside surrounding text; arrays and objects are legal in whole-value position only`);
        return match;
      });
    }
    if (Array.isArray(value)) return value.map(item => contractSubstitute(item, resolve, report));
    if (isObject(value)) {
      const result = {};
      for (const [key, item] of Object.entries(value)) result[key] = contractSubstitute(item, resolve, report);
      return result;
    }
    return value;
  }

  // §10.8's injection ban, applied recursively over every string inside a
  // supplied value: a value carrying `{{`, `}}`, or a code-fence delimiter
  // could break out of the fenced test block it lands in.
  function contractInjectionBan(value, display, pointer, what) {
    if (typeof value === "string") {
      const offence = value.includes("{{") ? "{{" : value.includes("}}") ? "}}" : value.includes("```") ? "```" : undefined;
      if (offence) {
        error("CONTRACT_INJECTION", CONTRACT_SECTION, display, `${pointer} ${what} contains ${JSON.stringify(offence)}; a supplied value may carry neither placeholder delimiters nor a code fence`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => contractInjectionBan(item, display, `${pointer}/${index}`, what));
      return;
    }
    if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) contractInjectionBan(item, display, `${pointer}/${pointerEscape(key)}`, what);
    }
  }

  // What a build record needs to know about a certifying package's contracts:
  // every Fixed value, the count of generated acceptance tests after liveness
  // and per-row expansion, and the rules to re-evaluate over the resolved
  // snapshot. Gathered with the finding sink closed — this reads someone
  // else's package.
  function contractBuildFacts(specRoot, specManifest) {
    return quietly(() => {
      const resolvePath = makePathResolver(specRoot);
      const personalization = loadPersonalization(specRoot, specManifest, resolvePath);
      const contentContext = validateContent(specRoot, specManifest, resolvePath, personalization.questions);
      const { doc: specTuning, context: exprContext } = validateTuning(specRoot, contentContext, personalization);
      const directionCtx = validateDirection(specRoot, resolvePath, exprContext);
      const result = validateContractsV07(specRoot, specManifest, contentContext, resolvePath, specTuning, exprContext, directionCtx);
      if (!result) return undefined;
      const values = new Map();
      const rules = [];
      for (const adoption of result.instances) {
        for (const name of adoption.model.values.keys()) {
          const key = `contracts.${adoption.id}.${name}`;
          if (adoption.valueValues.has(name)) values.set(key, adoption.valueValues.get(name));
        }
        for (const rule of adoption.parsedRules) rules.push({ adoption: adoption.id, ...rule });
      }
      return { values, rules, generatedTotal: result.generatedTotal, generatedTests: result.generatedTests, checked: result.checked };
    });
  }

  // §10.7's closed citation grammar: a dotted value address, or a chapter-
  // section reference `<file>.md#<anchor>` carrying the extension, as
  // §1a reads one. A citation MUST resolve, and never to a section any
  // authority tag reaches — a test whose pass condition lives in prose the
  // builder may vary is the divergence this layer exists to abolish. A tuning
  // key is legal for the opposite
  // reason: the key is stable and the snapshot pins its value per build.
  function contractResolveCitation(value, at, display, ctx) {
    if (typeof value !== "string" || !value.trim()) {
      error("CONTRACT_CITATION_GRAMMAR", CONTRACT_SECTION, display, `${at} citation must be a non-empty string`);
      return;
    }
    if (value.includes(":")) {
      error("CONTRACT_CITATION_GRAMMAR", CONTRACT_SECTION, display, `${at} citation ${JSON.stringify(value)} uses a retired colon form; use the thing's dotted address`);
      return;
    }
    if (ctx.tuningKeys.has(value) || ctx.contractKeys.has(value) || (value.startsWith("contracts.") && value.split(".").length === 2 && ctx.instanceIds?.has(value.split(".")[1]))) {
      return;
    }
    const hash = value.indexOf("#");
    if (hash <= 0 || hash === value.length - 1 || value.includes(" ") || !value.slice(0, hash).endsWith(".md")) {
      error("CONTRACT_CITATION_GRAMMAR", CONTRACT_SECTION, display, `${at} citation ${JSON.stringify(value)} is outside the closed grammar: a dotted tuning or contract address, or a \`<file>.md#<anchor>\` chapter-section reference`);
      return;
    }
    const filePart = value.slice(0, hash);
    const fragment = decodeURIComponent(value.slice(hash + 1));
    const file = ctx.resolvePath(filePart, `${at} citation target`, CONTRACT_SECTION, "CONTRACT_CITATION_DANGLING", { mustExist: true, kind: "file", display });
    if (!file) return;
    const text = host.readText(file);
    const lines = text.split(/\r?\n/);
    const headings = markdownHeadings(lines);
    const heading = headings.find(item => item.slug === fragment.toLowerCase());
    if (!heading) {
      error("CONTRACT_CITATION_DANGLING", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, whose fragment matches no Markdown heading in ${slash(filePart)}`);
      return;
    }
    // A citation's target must be Fixed *throughout*. A tag anywhere inside the
    // cited section, not merely at its head, means some statement a reader
    // finds under that anchor is one the builder may vary — and the citation
    // does not say which statement it meant. Enclosing sections count too: a
    // tag scoped above the anchor governs it by inheritance. A tag scoped to a
    // sub-topic *below* the cited anchor is what the reader would land on, so
    // it counts as well; the cure is a finer anchor.
    // Inside the cited section: any tag at all disqualifies it. A section that
    // hands any part of itself away can no longer be relied on whole, and the
    // citation does not say which part it meant. Outside it: §2 scopes a tag
    // from its own line to the end of the heading section holding it, so an
    // enclosing section's tag reaches down into this one while a sibling's
    // stops short of it.
    const reaching = authorityTagReaching(lines, headings, heading);
    if (reaching) {
      error("CONTRACT_CITATION_AUTHORITY", CONTRACT_SECTION, display, reaching.where === "inside"
        ? `${at} cites ${JSON.stringify(value)}, whose target section carries ${reaching.label} authority tag at line ${reaching.line}; a legal target carries no tag anywhere inside it`
        : `${at} cites ${JSON.stringify(value)}, which sits inside the scope of ${reaching.label} authority tag at line ${reaching.line}; a legal target is covered by no enclosing tag`);
    }
  }

  function contractValidateRows(rows, schemaName, info, source, display, ctx) {
    if (!Array.isArray(rows)) {
      error("CONTRACT_ROWS_SHAPE", CONTRACT_SECTION, display, `${source} must be an array of rows`);
      return [];
    }
    const uniqueSeen = new Map();
    const resolvedWithin = new Map();
    for (const [field, shape] of info.fields) {
      if ((shape.type !== "number" && shape.type !== "integer") || !Array.isArray(shape.within) || shape.within.length !== 2) continue;
      const bounds = shape.within.map(bound => typeof bound === "number" ? bound : ctx.values.get(bound));
      if (!bounds.every(bound => typeof bound === "number" && Number.isFinite(bound))) continue;
      if (bounds[0] > bounds[1]) {
        if (!shape.within.every(bound => typeof bound === "number")) {
          const declaration = `#/declares/rows/${pointerEscape(schemaName)}/record/${pointerEscape(field)}/within`;
          const declared = `[${shape.within.map(bound => JSON.stringify(bound)).join(", ")}]`;
          error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${declaration} ${declared} gives lower bound ${bounds[0]} above upper bound ${bounds[1]}`);
        }
        continue;
      }
      resolvedWithin.set(field, bounds);
    }
    rows.forEach((row, index) => {
      const at = `${source}/${index}`;
      if (!isObject(row)) {
        error("CONTRACT_ROWS_SHAPE", CONTRACT_SECTION, display, `${at} must be an object`);
        return;
      }
      for (const key of Object.keys(row)) {
        if (key.startsWith("_")) continue;
        if (!info.fields.has(key)) {
          error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at} carries field ${JSON.stringify(key)}, which record schema ${JSON.stringify(schemaName)} does not declare`);
        }
      }
      for (const [field, shape] of info.fields) {
        const present = own(row, field);
        const conditional = own(shape, "when");
        const required = shape.required === true || (conditional && contractWhenSatisfied(shape.when, ctx.answers, ctx.liveFlags, row));
        if (conditional && !required && present) {
          error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at}/${field} is present, but its condition is unsatisfied; a conditioned field is required exactly when its \`when\` holds and forbidden otherwise`);
          continue;
        }
        if (!present) {
          if (required) error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at} is missing ${conditional ? "conditionally required" : "required"} field ${JSON.stringify(field)}`);
          continue;
        }
        const value = row[field];
        if (shape.type === "number" && typeof value !== "number") {
          error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at}/${field} must be a number, got ${JSON.stringify(value)}`);
        } else if (shape.type === "integer" && !Number.isInteger(value)) {
          error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at}/${field} must be an integer, got ${JSON.stringify(value)}`);
        } else if ((shape.type === "string" || shape.type === "citation") && typeof value !== "string") {
          error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at}/${field} must be a string, got ${JSON.stringify(value)}`);
        }
        const bounds = resolvedWithin.get(field);
        if (bounds && typeof value === "number" && Number.isFinite(value) && (value < bounds[0] || value > bounds[1])) {
          const declaration = `[${shape.within.map(bound => JSON.stringify(bound)).join(", ")}]`;
          error("CONTRACT_ROW_RANGE", CONTRACT_SECTION, display, `${at}/${field}=${value} is outside inclusive range [${bounds[0]}, ${bounds[1]}] declared by within ${declaration}`);
        }
        if (typeof value === "string") {
          if (Array.isArray(shape.options) && !shape.options.includes(value)) {
            error("CONTRACT_ROW_CHOICE", CONTRACT_SECTION, display, `${at}/${field} is ${JSON.stringify(value)}, which is outside the field's closed option set (${shape.options.join(", ")})`);
          }
          // §10.4 caps `options` values at 64 characters; a `pattern` field
          // carries the lexical class alone, so no length rule is invented here.
          if (shape.pattern === "kebab-case") contractKebab(value, display, at, `${field} value`);
          if (shape.type === "citation") contractResolveCitation(value, `${at}/${field}`, display, ctx);
        }
        contractInjectionBan(value, display, `${at}/${field}`, "row value");
        if (shape.unique === true) {
          const key = `${field}\u0000${deepKey(value)}`;
          if (uniqueSeen.has(key)) {
            error("CONTRACT_ROW_FIELD", CONTRACT_SECTION, display, `${at}/${field} repeats value ${JSON.stringify(value)}, which the schema declares unique within the bound rows`);
          } else uniqueSeen.set(key, index);
        }
      }
    });
    return rows.filter(isObject);
  }

  // -------------------------------------------------------------------------
  // OpenGDD v0.7 contracts (decision 35, with decisions 34/36/40).
  //
  // Package validation enters here: one filled form per adoption, with
  // verification machinery in an optional content-addressed pack.
  // -------------------------------------------------------------------------

  const CONTRACT_DESIGNER_FIELDS = ["answers", "values", "rows", "verification"];
  const CONTRACT_DEFINITION_FIELDS = ["contract", "version", "origin", "summary", "mechanism", "questions", "declares", "rules", "pack"];
  const CONTRACT_PACK_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

  function contractDefinitionOf(document) {
    const definition = {};
    for (const key of CONTRACT_DEFINITION_FIELDS) if (own(document, key)) definition[key] = document[key];
    return contractStripAnnotations(definition);
  }

  function contractCanonicalDefinition(document) {
    return JSON.stringify(contractDefinitionOf(document), null, 2);
  }

  function contractModelV07(document) {
    const questions = new Map();
    for (const [name, question] of Object.entries(isObject(document?.questions) ? document.questions : {})) {
      if (name.startsWith("_") || !isObject(question)) continue;
      const options = new Map(Object.entries(isObject(question.options) ? question.options : {}).filter(([id, option]) => !id.startsWith("_") && isObject(option)));
      questions.set(name, { entry: question, options });
    }
    const values = new Map(Object.entries(isObject(document?.declares?.values) ? document.declares.values : {}).filter(([name, declaration]) => !name.startsWith("_") && isObject(declaration)));
    const rows = new Map();
    for (const [name, declaration] of Object.entries(isObject(document?.declares?.rows) ? document.declares.rows : {})) {
      if (name.startsWith("_") || !isObject(declaration)) continue;
      const fields = new Map(Object.entries(isObject(declaration.record) ? declaration.record : {}).filter(([field, shape]) => !field.startsWith("_") && isObject(shape)));
      rows.set(name, { schema: declaration, fields });
    }
    return { questions, values, rows };
  }

  function contractQuestionLiveness(model, answers) {
    const state = new Map();
    let cycle;
    const visit = (name, stack) => {
      if (cycle || state.get(name) === "done") return;
      if (state.get(name) === "open") {
        cycle = [...stack.slice(stack.indexOf(name)), name];
        return;
      }
      state.set(name, "open");
      stack.push(name);
      const when = model.questions.get(name)?.entry?.when;
      if (isObject(when?.flag)) for (const dependency of Object.keys(when.flag)) if (model.questions.has(dependency)) visit(dependency, stack);
      stack.pop();
      state.set(name, "done");
    };
    for (const name of model.questions.keys()) visit(name, []);
    if (cycle) return { asked: new Set(model.questions.keys()), cycle };
    const memo = new Map();
    const resolve = name => {
      if (memo.has(name)) return memo.get(name);
      const when = model.questions.get(name)?.entry?.when;
      let asked = true;
      if (isObject(when?.flag)) {
        for (const [dependency, allowed] of Object.entries(when.flag)) {
          if (!model.questions.has(dependency) || !resolve(dependency) || !own(answers, dependency) || !Array.isArray(allowed) || !allowed.includes(answers[dependency])) {
            asked = false;
            break;
          }
        }
      }
      memo.set(name, asked);
      return asked;
    };
    const asked = new Set();
    for (const name of model.questions.keys()) if (resolve(name)) asked.add(name);
    return { asked, cycle: undefined };
  }

  function contractValidateFieldDeclarations(record, display, pointer, declaredValues) {
    const fields = new Map();
    if (!isObject(record)) return fields;
    for (const [field, shape] of Object.entries(record)) {
      if (field.startsWith("_")) continue;
      const at = `${pointer}/${pointerEscape(field)}`;
      contractKebab(field, display, at, "record field name");
      if (!isObject(shape)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a field-shape object`);
        continue;
      }
      fields.set(field, shape);
      contractClosed(shape, ["type", "required", "when", "options", "pattern", "within", "unique", "description"], ["type"], display, at);
      if (own(shape, "type") && !CONTRACT_FIELD_TYPES.has(shape.type)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/type must be one of ${[...CONTRACT_FIELD_TYPES].join(", ")}, got ${JSON.stringify(shape.type)}`);
      if (own(shape, "required") && own(shape, "when")) error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at} declares both required and when; at most one is legal`);
      if (own(shape, "required")) contractType(shape.required, "boolean", display, at, "required");
      if (own(shape, "unique")) contractType(shape.unique, "boolean", display, at, "unique");
      if (own(shape, "description")) contractType(shape.description, "string", display, at, "description");
      if (own(shape, "pattern")) {
        if (shape.type !== "string") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/pattern is legal on a string field only`);
        if (shape.pattern !== "kebab-case") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/pattern admits only "kebab-case" today`);
      }
      if (own(shape, "options")) {
        if (shape.type !== "string") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/options is legal on a string field only`);
        if (!Array.isArray(shape.options) || shape.options.length === 0) error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/options must be a non-empty array`);
        else shape.options.forEach((value, index) => contractKebab(value, display, `${at}/options/${index}`, "closed-choice value", 64));
      }
      if (own(shape, "within")) {
        if (shape.type !== "number" && shape.type !== "integer") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/within is legal on a number or integer field only`);
        if (!Array.isArray(shape.within) || shape.within.length !== 2 || shape.within.some(bound => typeof bound !== "string" && !(typeof bound === "number" && Number.isFinite(bound)))) {
          error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/within must be [lower, upper], with each bound a declared value name or finite number`);
        } else {
          shape.within.forEach((bound, index) => {
            if (typeof bound === "string" && !declaredValues.has(bound)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/within/${index} names undeclared value ${JSON.stringify(bound)}`);
          });
          if (shape.type === "integer" && shape.within.some(bound => typeof bound === "number" && !Number.isInteger(bound))) {
            error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/within must use integer literals on an integer field, got ${JSON.stringify(shape.within)}`);
          }
          if (shape.within.every(bound => typeof bound === "number") && shape.within[0] > shape.within[1]) {
            error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${at}/within lower bound ${shape.within[0]} exceeds upper bound ${shape.within[1]}`);
          }
        }
      }
      contractWhenShape(shape.when, display, at, true);
    }
    return fields;
  }

  function contractValidateDefinition(document, display, model) {
    contractClosed(document, [...CONTRACT_DEFINITION_FIELDS, ...CONTRACT_DESIGNER_FIELDS], ["contract", "version", "summary", "mechanism", "questions", "declares", "answers", "values"], display, "#");
    if (own(document, "contract")) contractKebab(document.contract, display, "#", "contract id");
    if (own(document, "version") && !Number.isInteger(document.version)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `#/version must be an integer, got ${JSON.stringify(document.version)}`);
    if (own(document, "origin") && typeof document.origin !== "string") error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/origin must be a string");
    if (!own(document, "origin")) warning("CONTRACT_ORIGIN_ABSENT", CONTRACT_SECTION, display, "the definition declares no origin; a contract SHOULD name where its blank form came from");
    if (own(document, "summary")) contractType(document.summary, "string", display, "#", "summary");
    if (own(document, "mechanism") && (!Array.isArray(document.mechanism) || !document.mechanism.every(item => typeof item === "string"))) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/mechanism must be an array of strings");
    if (own(document, "pack") && (typeof document.pack !== "string" || !CONTRACT_PACK_HASH_PATTERN.test(document.pack))) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/pack must be sha256 followed by 64 lowercase hexadecimal digits");

    if (!isObject(document.questions)) {
      if (own(document, "questions")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/questions must map question ids to question declarations");
    } else for (const [name, question] of Object.entries(document.questions)) {
      if (name.startsWith("_")) continue;
      const at = `#/questions/${pointerEscape(name)}`;
      contractKebab(name, display, at, "question id");
      if (!isObject(question)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a question object`);
        continue;
      }
      contractClosed(question, ["asks", "rationale", "guidance", "when", "options"], ["asks", "options"], display, at);
      for (const key of ["asks", "rationale", "guidance"]) if (own(question, key)) contractType(question[key], "string", display, at, key);
      contractWhenShape(question.when, display, at, false);
      if (!isObject(question.options) || Object.keys(question.options).filter(key => !key.startsWith("_")).length === 0) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/options must be a non-empty map`);
      } else for (const [optionId, option] of Object.entries(question.options)) {
        if (optionId.startsWith("_")) continue;
        const optionAt = `${at}/options/${pointerEscape(optionId)}`;
        contractKebab(optionId, display, optionAt, "option id");
        if (!isObject(option)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${optionAt} must be an option object`);
          continue;
        }
        contractClosed(option, ["meaning", "semantics", "rationale"], ["meaning"], display, optionAt);
        for (const key of ["meaning", "semantics", "rationale"]) if (own(option, key)) contractType(option[key], "string", display, optionAt, key);
      }
    }

    if (!isObject(document.declares)) {
      if (own(document, "declares")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/declares must be an object");
    } else {
      contractClosed(document.declares, ["values", "rows"], [], display, "#/declares");
      if (own(document.declares, "values") && !isObject(document.declares.values)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/declares/values must be a map");
      if (isObject(document.declares.values)) for (const [name, declaration] of Object.entries(document.declares.values)) {
        if (name.startsWith("_")) continue;
        const at = `#/declares/values/${pointerEscape(name)}`;
        contractKebab(name, display, at, "value name");
        if (["and", "or", "not"].includes(name)) error("CONTRACT_NAME_GRAMMAR", CONTRACT_SECTION, display, `${at} value name ${JSON.stringify(name)} is reserved by the rule grammar`);
        if (model.questions.has(name)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${at} collides with a question of the same name`);
        if (!isObject(declaration)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a value declaration`);
          continue;
        }
        contractClosed(declaration, ["description", "range"], ["description"], display, at);
        if (own(declaration, "description")) contractType(declaration.description, "string", display, at, "description");
        if (own(declaration, "range") && (!Array.isArray(declaration.range) || declaration.range.length !== 2 || !declaration.range.every(value => typeof value === "number" && Number.isFinite(value)) || declaration.range[0] > declaration.range[1])) {
          error("CONTRACT_VALUE_RANGE", CONTRACT_SECTION, display, `${at}/range must be an inclusive [min, max] pair of finite numbers with min <= max`);
        }
      }
      if (own(document.declares, "rows") && !isObject(document.declares.rows)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/declares/rows must be a map");
      if (isObject(document.declares.rows)) for (const [name, declaration] of Object.entries(document.declares.rows)) {
        if (name.startsWith("_")) continue;
        const at = `#/declares/rows/${pointerEscape(name)}`;
        contractKebab(name, display, at, "row-set name");
        if (!isObject(declaration)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a row declaration`);
          continue;
        }
        contractClosed(declaration, ["description", "record"], ["record"], display, at);
        if (own(declaration, "description")) contractType(declaration.description, "string", display, at, "description");
        if (!isObject(declaration.record)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/record must be an object`);
        else contractValidateFieldDeclarations(declaration.record, display, `${at}/record`, model.values);
      }
    }
    if (!isObject(document.rules)) {
      if (own(document, "rules")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/rules must map rule ids to one-line strings");
    }

    const checkWhen = (when, at, rowInfo) => {
      if (!isObject(when)) return;
      if (isObject(when.flag)) for (const [name, allowed] of Object.entries(when.flag)) {
        const question = model.questions.get(name);
        if (!question) error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/flag names undeclared question ${JSON.stringify(name)}`);
        else if (Array.isArray(allowed)) for (const option of allowed) if (!question.options.has(option)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/flag/${pointerEscape(name)} names undeclared option ${JSON.stringify(option)}`);
      }
      if (isObject(when.row) && rowInfo) for (const field of Object.keys(when.row)) if (!rowInfo.fields.has(field)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/row names undeclared row field ${JSON.stringify(field)}`);
    };
    for (const [name, question] of model.questions) checkWhen(question.entry.when, `#/questions/${pointerEscape(name)}`, undefined);
    for (const [name, rowInfo] of model.rows) for (const [field, shape] of rowInfo.fields) checkWhen(shape.when, `#/declares/rows/${pointerEscape(name)}/record/${pointerEscape(field)}`, rowInfo);
  }

  function contractValidateAdoption(entry, ctx) {
    const { display, document, model } = entry;
    contractValidateDefinition(document, display, model);
    const id = entry.fileId;
    const answers = isObject(document.answers) ? document.answers : {};
    if (own(document, "answers") && !isObject(document.answers)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/answers must map question ids to option ids");
    const { asked, cycle } = contractQuestionLiveness(model, answers);
    if (cycle) error("CONTRACT_QUESTION_CYCLE", CONTRACT_SECTION, display, `the question dependency graph carries a cycle (${cycle.join(" → ")}); asked questions must resolve in one pass`);
    for (const [name, question] of model.questions) {
      if (asked.has(name)) {
        if (!own(answers, name)) error("CONTRACT_ANSWER_MISSING", CONTRACT_SECTION, display, `#/answers is missing asked question ${JSON.stringify(name)} — ${JSON.stringify(question.entry.asks ?? "?")}`);
        else if (!question.options.has(answers[name])) error("CONTRACT_ANSWER_UNKNOWN", CONTRACT_SECTION, display, `#/answers/${pointerEscape(name)} is ${JSON.stringify(answers[name])}, not one of ${[...question.options.keys()].join(", ")}`);
      } else if (own(answers, name)) warning("CONTRACT_ANSWER_NOT_ASKED", CONTRACT_SECTION, display, `#/answers/${pointerEscape(name)} answers a question whose when condition is not satisfied; remove the unused answer`);
    }
    for (const name of Object.keys(answers)) if (!name.startsWith("_") && !model.questions.has(name)) error("CONTRACT_ANSWER_UNKNOWN", CONTRACT_SECTION, display, `#/answers/${pointerEscape(name)} names no declared question`);

    const sourceValues = isObject(document.values) ? document.values : {};
    if (own(document, "values") && !isObject(document.values)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/values must map declared names to finite numbers");
    const valueValues = new Map();
    for (const [name, declaration] of model.values) {
      const at = `#/values/${pointerEscape(name)}`;
      if (!own(sourceValues, name)) {
        error("CONTRACT_VALUE_MISSING", CONTRACT_SECTION, display, `${at} is missing; every declared value needs one number`);
        continue;
      }
      const value = sourceValues[name];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        error("CONTRACT_VALUE_TYPE", CONTRACT_SECTION, display, `${at} must be a finite number, got ${JSON.stringify(value)}`);
        continue;
      }
      valueValues.set(name, value);
      if (Array.isArray(declaration.range) && declaration.range.length === 2 && declaration.range.every(Number.isFinite) && (value < declaration.range[0] || value > declaration.range[1])) error("CONTRACT_VALUE_RANGE", CONTRACT_SECTION, display, `${at} value ${value} is outside the declared inclusive range [${declaration.range[0]}, ${declaration.range[1]}]`);
    }
    for (const name of Object.keys(sourceValues)) if (!name.startsWith("_") && !model.values.has(name)) error("CONTRACT_VALUE_UNKNOWN", CONTRACT_SECTION, display, `#/values/${pointerEscape(name)} names no declared value`);

    const sourceRows = isObject(document.rows) ? document.rows : {};
    if (own(document, "rows") && !isObject(document.rows)) error("CONTRACT_ROWS_SHAPE", CONTRACT_SECTION, display, "#/rows must map each declared row set to an inline array");
    for (const name of Object.keys(sourceRows)) if (!name.startsWith("_") && !model.rows.has(name)) error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, display, `#/rows/${pointerEscape(name)} names no declared row set`);
    const boundRows = new Map();
    const rowCtx = { ...ctx, answers, liveFlags: asked, values: valueValues };
    for (const [name, info] of model.rows) {
      if (!own(sourceRows, name)) {
        error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, display, `#/rows is missing declared row set ${JSON.stringify(name)}; write an inline array, including [] when it has no rows`);
        boundRows.set(name, []);
      } else if (!Array.isArray(sourceRows[name])) {
        error("CONTRACT_ROWS_SHAPE", CONTRACT_SECTION, display, `#/rows/${pointerEscape(name)} must be an inline array; the bound-drawer form is retired (run \`opengdd migrate\`)`);
        boundRows.set(name, []);
      } else boundRows.set(name, contractValidateRows(sourceRows[name], name, info, `#/rows/${pointerEscape(name)}`, display, rowCtx));
    }

    const parsedRules = [];
    if (isObject(document.rules)) for (const [name, source] of Object.entries(document.rules)) {
      if (name.startsWith("_")) continue;
      if (!CONTRACT_KEBAB.test(name)) error("CONTRACT_RULE_INVALID", CONTRACT_SECTION, display, `rule name ${JSON.stringify(name)} must be kebab-case`);
      if (typeof source !== "string") {
        error("CONTRACT_RULE_INVALID", CONTRACT_SECTION, display, `rule ${JSON.stringify(name)} must be a string`);
        continue;
      }
      try {
        const ast = parseRule(source, { bareKeys: new Set(model.values.keys()) });
        parsedRules.push({ name, source, ast });
        const referenced = new Set();
        const pending = [ast];
        while (pending.length) {
          const node = pending.pop();
          if (node.type === "key") referenced.add(node.name);
          else if (node.type === "group") pending.push(node.expression);
          else if (node.type === "unary") pending.push(node.argument);
          else if (node.type === "binary") pending.push(node.left, node.right);
          else if (node.type === "call") pending.push(...node.args);
        }
        const missing = [...model.values.keys()].filter(key => referenced.has(key) && !own(sourceValues, key));
        if (missing.length) {
          const waits = missing.length === 1
            ? `value ${JSON.stringify(missing[0])}`
            : `values ${missing.map(key => JSON.stringify(key)).join(", ")}`;
          error("CONTRACT_RULE_INVALID", CONTRACT_SECTION, display,
            `rule ${JSON.stringify(name)} waits on ${waits}`, undefined, { rule: name, waits_on: missing }, true);
        } else if (!evaluateRule(ast, valueValues)) error("CONTRACT_RULE_FAILED", CONTRACT_SECTION, display, formatRuleFailure(name, source, ast, valueValues, `adoption ${JSON.stringify(id)}`));
      } catch (cause) {
        error("CONTRACT_RULE_INVALID", CONTRACT_SECTION, display, `rule ${JSON.stringify(name)}: ${cause.message} at position ${cause.position ?? 0}`);
      }
    }

    if (own(document, "verification") && !isObject(document.verification)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/verification must map template ids to contract inputs");
    if (isObject(document.verification)) for (const [templateId, override] of Object.entries(document.verification)) {
      if (templateId.startsWith("_")) continue;
      const at = `#/verification/${pointerEscape(templateId)}`;
      if (!isObject(override)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be an object carrying scope and/or seeds`);
      else {
        contractClosed(override, ["scope", "seeds"], [], display, at);
        if (own(override, "scope") && !(typeof override.scope === "string" && override.scope.trim())) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/scope must be a non-empty sentence`);
        if (own(override, "seeds") && !stringArray(override.seeds)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/seeds must be a non-empty array of non-empty strings`);
        contractInjectionBan(override, display, at, "verification input");
      }
    }
    return { id, display, document, model, answers, asked, valueValues, boundRows, parsedRules, ctx, checked: false, pack: undefined, liveTemplates: new Set(), expandedRows: new Map() };
  }

  function contractPackError(display, message) {
    error("CONTRACT_PACK_SHAPE", CONTRACT_SECTION, display, message);
  }

  function contractValidatePack(entry, adoptions) {
    const { display, document: pack } = entry;
    if (!isObject(pack)) {
      contractPackError(display, "a verification pack's top level must be an object");
      return { templates: new Map(), order: [] };
    }
    const packClosed = (object, allowed, required, pointer) => {
      for (const key of Object.keys(object)) if (!key.startsWith("_") && !allowed.includes(key)) contractPackError(display, `${pointer} carries undeclared field ${JSON.stringify(key)}; the pack is closed`);
      for (const key of required) if (!own(object, key)) contractPackError(display, `${pointer} is missing required field ${JSON.stringify(key)}`);
    };
    packClosed(pack, ["contract", "version", "templates"], ["contract", "version", "templates"], "#");
    if (pack.contract !== entry.contract || pack.version !== entry.version) contractPackError(display, `#/contract and #/version must match filename ${JSON.stringify(`${entry.contract}-${entry.version}.pack.json`)}`);
    if (!Array.isArray(pack.templates)) {
      contractPackError(display, "#/templates must be an array");
      return { templates: new Map(), order: [] };
    }
    const templates = new Map();
    const order = [];
    for (const [index, template] of pack.templates.entries()) {
      const at = `#/templates/${index}`;
      if (!isObject(template)) {
        contractPackError(display, `${at} must be a template object`);
        continue;
      }
      packClosed(template, ["id", "title", "type", "expand", "when", "bindings", "collection", "test", "text", "inputs"], ["id", "title", "type", "expand", "test", "text"], at);
      if (typeof template.id !== "string" || !CONTRACT_KEBAB.test(template.id)) contractPackError(display, `${at}/id must be kebab-case`);
      else if (templates.has(template.id)) contractPackError(display, `${at}/id ${JSON.stringify(template.id)} is duplicated`);
      for (const key of ["title", "text"]) if (typeof template[key] !== "string") contractPackError(display, `${at}/${key} must be a string`);
      if (!CONTRACT_TEST_TYPES.has(template.type)) {
        const retired = ["property", "exhaustive-search", "document-check"].includes(template.type)
          ? `; ${JSON.stringify(template.type)} is retired (run \`opengdd migrate\`)`
          : "";
        contractPackError(display, `${at}/type must name one of ${[...CONTRACT_TEST_TYPES].join(", ")}${retired}`);
      }
      if (template.expand !== "once" && template.expand !== "per-row") contractPackError(display, `${at}/expand must be "once" or "per-row"`);
      if (template.expand === "per-row" && typeof template.collection !== "string") contractPackError(display, `${at}/collection is required for per-row expansion`);
      if (template.expand !== "per-row" && own(template, "collection")) contractPackError(display, `${at}/collection is legal only for per-row expansion`);
      if (!isObject(template.test)) contractPackError(display, `${at}/test must be an object`);
      else if (template.test.type !== template.type) contractPackError(display, `${at}/test/type must equal the template type`);
      if (own(template, "inputs")) {
        if (!isObject(template.inputs)) contractPackError(display, `${at}/inputs must map input names to declarations with optional defaults`);
        else for (const [name, declaration] of Object.entries(template.inputs)) {
          if (name.startsWith("_")) continue;
          const inputAt = `${at}/inputs/${pointerEscape(name)}`;
          if (!["scope", "seeds"].includes(name)) contractPackError(display, `${inputAt} names unsupported input ${JSON.stringify(name)}; legal inputs are scope and seeds`);
          if (!isObject(declaration)) contractPackError(display, `${inputAt} must be an object with an optional default`);
          else {
            packClosed(declaration, ["default"], [], inputAt);
            if (own(declaration, "default") && name === "scope" && !(typeof declaration.default === "string" && declaration.default.trim())) contractPackError(display, `${inputAt}/default must be a non-empty sentence`);
            if (own(declaration, "default") && name === "seeds" && !stringArray(declaration.default)) contractPackError(display, `${inputAt}/default must be a non-empty array of non-empty strings`);
          }
        }
      }
      contractWhenShape(template.when, display, at, template.expand === "per-row");
      const record = { template, index, at, perRow: template.expand === "per-row" };
      if (typeof template.id === "string" && !templates.has(template.id)) templates.set(template.id, record);
      order.push(record);
    }
    const model = { templates, order };
    for (const adoption of adoptions) contractValidatePackReferences(adoption, model, display);
    return model;
  }

  function contractTemplateRowFieldsV07(template) {
    const fields = new Set();
    if (isObject(template.when?.row)) for (const field of Object.keys(template.when.row)) fields.add(field);
    const sources = [template.title, template.text, template.test];
    if (isObject(template.bindings)) for (const binding of Object.values(template.bindings)) {
      if (!isObject(binding)) continue;
      if (typeof binding.row_field === "string") fields.add(binding.row_field);
      if (isObject(binding.map)) sources.push(...Object.values(binding.map));
    }
    for (const source of sources) for (const found of contractScanPlaceholders(source, "")) {
      const row = /^row\.(.+)$/.exec(found.body);
      if (row) fields.add(row[1]);
    }
    return fields;
  }

  function contractValidatePackReferences(adoption, packModel, packDisplay) {
    const { model } = adoption;
    const checkWhen = (when, at, rowInfo) => {
      if (!isObject(when)) return;
      if (isObject(when.flag)) for (const [name, allowed] of Object.entries(when.flag)) {
        const question = model.questions.get(name);
        if (!question) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${at}/when/flag names undeclared question ${JSON.stringify(name)} in ${adoption.display}`);
        else if (Array.isArray(allowed)) for (const option of allowed) if (!question.options.has(option)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${at}/when/flag/${pointerEscape(name)} names undeclared option ${JSON.stringify(option)}`);
      }
      if (isObject(when.row) && rowInfo) for (const field of Object.keys(when.row)) if (!rowInfo.fields.has(field)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${at}/when/row names undeclared field ${JSON.stringify(field)}`);
    };
    for (const record of packModel.order) {
      const { template, at, perRow } = record;
      const rowInfo = perRow ? model.rows.get(template.collection) : undefined;
      if (perRow && !rowInfo) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${at}/collection names undeclared row set ${JSON.stringify(template.collection)}`);
      if (perRow && rowInfo) {
        const idField = rowInfo.fields.get("id");
        if (!idField || idField.type !== "string" || idField.pattern !== "kebab-case" || idField.required !== true || idField.unique !== true) {
          error("CONTRACT_ROW_ID", CONTRACT_SECTION, adoption.display, `row set ${JSON.stringify(template.collection)} is expanded by template ${JSON.stringify(template.id)} and must declare id as required unique kebab-case string`);
        }
      }
      checkWhen(template.when, at, rowInfo);
      if (isObject(template.bindings)) for (const [bindingId, binding] of Object.entries(template.bindings)) {
        if (bindingId.startsWith("_")) continue;
        const bindingAt = `${at}/bindings/${pointerEscape(bindingId)}`;
        if (!isObject(binding)) {
          error("CONTRACT_BINDING_SHAPE", CONTRACT_SECTION, packDisplay, `${bindingAt} must be an object`);
          continue;
        }
        const hasFlag = own(binding, "flag");
        const hasRow = own(binding, "row_field");
        if (hasFlag === hasRow || !isObject(binding.map)) error("CONTRACT_BINDING_SHAPE", CONTRACT_SECTION, packDisplay, `${bindingAt} must carry exactly one of flag and row_field, plus a map`);
        if (hasFlag) {
          const question = model.questions.get(binding.flag);
          if (!question) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${bindingAt}/flag names undeclared question ${JSON.stringify(binding.flag)}`);
          else if (isObject(binding.map)) for (const key of Object.keys(binding.map)) if (!question.options.has(key)) error("CONTRACT_BINDING_MAP", CONTRACT_SECTION, packDisplay, `${bindingAt}/map names undeclared option ${JSON.stringify(key)}`);
        }
        if (hasRow && (!perRow || !rowInfo?.fields.has(binding.row_field))) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${bindingAt}/row_field names no field in the template's row set`);
      }
      const sources = [["title", template.title], ["text", template.text], ["test", template.test]];
      if (isObject(template.bindings)) for (const [id, binding] of Object.entries(template.bindings)) if (isObject(binding?.map)) for (const [key, phrase] of Object.entries(binding.map)) sources.push([`bindings/${id}/map/${key}`, phrase]);
      for (const [label, source] of sources) for (const found of contractScanPlaceholders(source, `${at}/${label}`)) {
        const body = found.body;
        if (body === "instance") continue;
        const value = /^value-cite:(.+)$/.exec(body);
        const surface = /^surface:(.+)$/.exec(body);
        const input = /^inputs:(.+)$/.exec(body);
        const bind = /^bind:(.+)$/.exec(body);
        const row = /^row\.(.+)$/.exec(body);
        if (value) {
          if (!model.values.has(value[1])) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${found.pointer} cites undeclared value ${JSON.stringify(value[1])}`);
        } else if (surface) {
          error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, packDisplay, `${found.pointer} uses retired placeholder ${found.raw}; write {{inputs:${surface[1]}}}`);
        } else if (input) {
          if (!isObject(template.inputs) || !own(template.inputs, input[1])) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${found.pointer} reads undeclared input ${JSON.stringify(input[1])}`);
        } else if (bind) {
          if (!isObject(template.bindings) || !own(template.bindings, bind[1])) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${found.pointer} reads undeclared binding ${JSON.stringify(bind[1])}`);
        } else if (row) {
          if (!perRow || !rowInfo?.fields.has(row[1])) error("CONTRACT_REFERENCE", CONTRACT_SECTION, packDisplay, `${found.pointer} reads undeclared row field ${JSON.stringify(row[1])}`);
        } else error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, packDisplay, `${found.pointer} carries unknown placeholder ${found.raw}; legal forms are {{instance}}, {{value-cite:<value>}}, {{inputs:scope}}, {{inputs:seeds}}, {{bind:<id>}}, and {{row.<field>}}`);
      }
    }
  }

  function contractPrepareTemplates(adoption, packModel) {
    const liveTemplates = new Set();
    const expandedRows = new Map();
    const nonLiveTemplateReasons = new Map();
    for (const record of packModel.order) {
      const { template, perRow } = record;
      let genuineBlock = false;
      const missingAnswers = [];
      let waitReason;
      if (isObject(template.when?.flag)) for (const [name, allowed] of Object.entries(template.when.flag)) {
        if (!adoption.asked.has(name)) genuineBlock = true;
        else if (!own(adoption.answers, name)) missingAnswers.push(name);
        else if (!Array.isArray(allowed) || !allowed.includes(adoption.answers[name])) genuineBlock = true;
      }
      if (isObject(template.bindings)) for (const binding of Object.values(template.bindings)) {
        if (isObject(binding) && typeof binding.flag === "string" && !adoption.asked.has(binding.flag)) genuineBlock = true;
      }
      let live = !genuineBlock && missingAnswers.length === 0;
      if (!genuineBlock && missingAnswers.length) waitReason = { kind: "answer", name: missingAnswers[0] };
      if (live && perRow) {
        const fields = contractTemplateRowFieldsV07(template);
        const rows = (adoption.boundRows.get(template.collection) ?? []).filter(row => contractWhenSatisfied(isObject(template.when) ? { row: template.when.row } : undefined, adoption.answers, adoption.asked, row) && [...fields].every(field => own(row, field)));
        if (rows.length === 0) {
          live = false;
          const rowInfo = adoption.model.rows.get(template.collection);
          for (const row of adoption.boundRows.get(template.collection) ?? []) {
            if (!contractWhenSatisfied(isObject(template.when) ? { row: template.when.row } : undefined, adoption.answers, adoption.asked, row)) continue;
            const name = [...fields].find(field => !own(row, field) && (rowInfo?.fields.get(field)?.required === true
              || own(rowInfo?.fields.get(field) ?? {}, "when") && contractWhenSatisfied(rowInfo.fields.get(field).when, adoption.answers, adoption.asked, row)));
            if (name) { waitReason = { kind: "row-field", name }; break; }
          }
        }
        else expandedRows.set(record, rows);
      }
      if (live) liveTemplates.add(record);
      else if (waitReason) nonLiveTemplateReasons.set(record, waitReason);
    }
    adoption.liveTemplates = liveTemplates;
    adoption.expandedRows = expandedRows;
    adoption.nonLiveTemplateReasons = nonLiveTemplateReasons;
  }

  function contractRenderTestsV07(adoption) {
    const lines = [];
    const tests = [];
    let count = 0;
    const packModel = adoption.pack.model;
    for (const record of packModel.order) {
      if (!adoption.liveTemplates.has(record)) continue;
      const { template, perRow } = record;
      const rows = perRow ? adoption.expandedRows.get(record) ?? [] : [undefined];
      for (const row of rows) {
        const phrases = new Map();
        const missingBindings = new Set();
        if (isObject(template.bindings)) for (const [bindingId, binding] of Object.entries(template.bindings)) {
          if (!isObject(binding) || !isObject(binding.map)) continue;
          const selected = own(binding, "flag") ? adoption.answers[binding.flag] : row?.[binding.row_field];
          const waitsOnAnswer = own(binding, "flag") && !own(adoption.answers, binding.flag);
          if (!own(binding.map, selected)) {
            const message = waitsOnAnswer
              ? `${record.at}/bindings/${pointerEscape(bindingId)} waits on the answer to question ${JSON.stringify(binding.flag)} in adoption ${JSON.stringify(adoption.id)}`
              : `${record.at}/bindings/${pointerEscape(bindingId)} has no phrase for ${JSON.stringify(selected)} in adoption ${JSON.stringify(adoption.id)}`;
            error("CONTRACT_BINDING_MAP", CONTRACT_SECTION, adoption.pack.display, message, undefined, undefined, waitsOnAnswer);
            if (waitsOnAnswer) missingBindings.add(bindingId);
          }
          else phrases.set(bindingId, binding.map[selected]);
        }
        const supplied = isObject(adoption.document.verification?.[template.id]) ? adoption.document.verification[template.id] : {};
        const inputs = {};
        const missingDesignerInputs = new Set();
        for (const [name, declaration] of Object.entries(isObject(template.inputs) ? template.inputs : {})) {
          if (name.startsWith("_")) continue;
          inputs[name] = own(supplied, name) ? supplied[name] : declaration?.default;
          if (inputs[name] === undefined) {
            const designerCanSupply = name === "scope" || name === "seeds";
            if (designerCanSupply) missingDesignerInputs.add(name);
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, adoption.display, `#/verification/${pointerEscape(template.id)} is missing required input ${JSON.stringify(name)} for a live template`, undefined, undefined, designerCanSupply);
          }
        }
        const expanding = new Set();
        const report = message => error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, adoption.pack.display, `${record.at} ${message}`);
        const resolve = body => {
          if (body === "instance") return adoption.id;
          const value = /^value-cite:(.+)$/.exec(body);
          if (value) return `contracts.${adoption.id}.${value[1]}`;
          const input = /^inputs:(.+)$/.exec(body);
          if (input) return inputs[input[1]];
          const bind = /^bind:(.+)$/.exec(body);
          if (bind) {
            const phrase = phrases.get(bind[1]);
            if (phrase === undefined || expanding.has(bind[1])) return undefined;
            expanding.add(bind[1]);
            try { return contractSubstitute(phrase, resolve, report); } finally { expanding.delete(bind[1]); }
          }
          const rowField = /^row\.(.+)$/.exec(body);
          if (rowField) return row?.[rowField[1]];
          return undefined;
        };
        const title = contractSubstitute(template.title ?? "", resolve, report);
        const testBlock = contractStripAnnotations(contractSubstitute(template.test ?? {}, resolve, report));
        const text = contractSubstitute(template.text ?? "", resolve, report);
        const name = row === undefined ? `${adoption.id}/${template.id}` : `${adoption.id}/${template.id}/${row.id}`;
        for (const leftover of contractScanPlaceholders([title, testBlock, text], "rendered")) {
          const input = /^inputs:(.+)$/.exec(leftover.body);
          const bind = /^bind:(.+)$/.exec(leftover.body);
          const dependent = Boolean(input && missingDesignerInputs.has(input[1]) || bind && missingBindings.has(bind[1]));
          error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, adoption.pack.display, `AT ${name} leaves ${leftover.raw} unresolved`, undefined, undefined, dependent);
        }
        if (isObject(testBlock)) {
          if (own(testBlock, "direction_claims")) error("CONTRACT_TEST_DIRECTION_CLAIMS", CONTRACT_SECTION, adoption.pack.display, `AT ${name} carries direction_claims; generated tests may not claim direction coverage`);
          const { direction_claims: _claims, ...checkable } = testBlock;
          const seedsWaitsOnInput = contractScanPlaceholders(template.test?.seeds, `${record.at}/test/seeds`)
            .some(found => found.whole && found.body === "inputs:seeds");
          validateDescriptor(checkable, `AT ${name}`, adoption.pack.display, undefined, adoption.ctx.resolvePath, adoption.ctx.exprContext, undefined, adoption.ctx.manifest, {
            seeds: missingDesignerInputs.has("seeds") && seedsWaitsOnInput
          });
        }
        if (lines.length) lines.push("");
        lines.push(`### AT ${name} — ${title}`, "", "```test", ...JSON.stringify(testBlock, null, 2).split("\n"), "```", "", text);
        tests.push({ name, descriptor: testBlock });
        count += 1;
      }
    }
    return { markdown: lines.length ? `${lines.join("\n")}\n` : "", count, tests };
  }

  function validateContractsV07(packageRoot, manifest, contentContext, resolvePath, tuningDoc, exprContext, directionCtx) {
    let rootEntries;
    try { rootEntries = host.readDir(packageRoot); } catch { return undefined; }
    const exact = rootEntries.find(item => item.isDirectory && item.name === CONTRACT_DIRECTORY);
    for (const item of rootEntries) if (item.isDirectory && item.name !== CONTRACT_DIRECTORY && item.name.toLowerCase() === CONTRACT_DIRECTORY) warning("CONTRACT_FOLDER_CASE", CONTRACT_SECTION, `${item.name}/`, `the reserved directory is exact lowercase \`contracts\``);
    if (!exact) return undefined;
    const directory = path.join(packageRoot, CONTRACT_DIRECTORY);
    const listing = host.readDir(directory).filter(item => !item.name.startsWith("."));
    const claims = item => {
      if (!item.isFile || !item.name.endsWith(".json") || item.name.endsWith(".pack.json")) return false;
      try { const value = JSON.parse(host.readText(path.join(directory, item.name))); return isObject(value) && (own(value, "contract") || own(value, "format")); } catch { return false; }
    };
    if (listing.length && !listing.some(claims)) error("CONTRACT_FOLDER_RESERVED", CONTRACT_SECTION, "contracts/", `holds ${listing.length} entries and no contract adoption; rename a designer-owned folder, or run \`opengdd migrate\``);

    const adoptionEntries = [];
    const packEntries = [];
    for (const item of listing) {
      const relative = `contracts/${item.name}`;
      if (item.isDirectory) {
        error("CONTRACT_FOLDER_ENTRY", CONTRACT_SECTION, relative, "contracts/ holds adoption JSON files and verification-pack JSON files only; subdirectories are forbidden");
        continue;
      }
      if (!item.name.endsWith(".json")) {
        error("CONTRACT_FOLDER_ENTRY", CONTRACT_SECTION, relative, "contracts/ holds JSON files only");
        continue;
      }
      const packMatch = /^(.*)-([0-9]+)\.pack\.json$/.exec(item.name);
      if (packMatch) {
        if (!CONTRACT_KEBAB.test(packMatch[1])) contractPackError(relative, "pack filename contract id must be kebab-case");
        let document;
        try { document = JSON.parse(host.readText(path.join(directory, item.name))); }
        catch (cause) { contractPackError(relative, `pack is not valid JSON: ${cause.message}`); continue; }
        const bytes = host.readBytes(path.join(directory, item.name));
        let hash;
        if (typeof host.sha256 !== "function") {
          skip("contract-pack-hash", "the host supplies no SHA-256; verification-pack bytes were not compared against the adoptions' `pack` digests");
        } else if (bytes === undefined) {
          skip("contract-pack-hash", "the host supplies no readable verification-pack bytes; verification-pack bytes were not compared against the adoptions' `pack` digests");
        } else {
          hash = `sha256:${host.sha256(bytes)}`;
        }
        packEntries.push({ contract: packMatch[1], version: Number(packMatch[2]), display: relative, document, hash });
        continue;
      }
      const fileId = item.name.slice(0, -5);
      if (fileId.includes(".") || !CONTRACT_KEBAB.test(fileId)) {
        error("CONTRACT_INSTANCE_FILENAME", CONTRACT_SECTION, relative, "an adoption filename is its dot-free kebab-case id plus .json");
        continue;
      }
      const document = parseJsonFile(path.join(directory, item.name), relative, CONTRACT_SECTION, "CONTRACT_INSTANCE_JSON");
      if (document === undefined) continue;
      if (!isObject(document)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, relative, "a contract adoption's top level must be an object");
        continue;
      }
      adoptionEntries.push({ fileId, display: relative, document, model: contractModelV07(document) });
    }
    adoptionEntries.sort((a, b) => a.fileId.localeCompare(b.fileId));
    packEntries.sort((a, b) => a.display.localeCompare(b.display));

    const tuningKeys = new Set(Object.keys(isObject(tuningDoc?.values) ? tuningDoc.values : {}));
    const contractKeys = new Set();
    for (const entry of adoptionEntries) for (const name of entry.model.values.keys()) contractKeys.add(`contracts.${entry.fileId}.${name}`);
    const instanceIds = new Set(adoptionEntries.map(entry => entry.fileId));
    const ctx = { resolvePath, contentContext, tuningKeys, contractKeys, instanceIds, manifest, exprContext, directionCtx };
    const instances = adoptionEntries.map(entry => contractValidateAdoption(entry, ctx));

    const byDefinition = new Map();
    for (const adoption of instances) {
      const identity = `${adoption.document.contract}-${adoption.document.version}`;
      const serialized = contractCanonicalDefinition(adoption.document);
      const first = byDefinition.get(identity);
      if (!first) byDefinition.set(identity, { adoption, serialized });
      else if (first.serialized !== serialized) error("CONTRACT_DEFINITION_DIVERGENT", CONTRACT_SECTION, adoption.display, `definition ${JSON.stringify(identity)} differs from the canonical definition in ${first.adoption.display}; strip answers, values, rows, verification, and annotations and make the blank forms identical`);
    }

    const packsByIdentity = new Map();
    for (const pack of packEntries) {
      const identity = `${pack.contract}-${pack.version}`;
      if (packsByIdentity.has(identity)) contractPackError(pack.display, `a second pack exists for ${JSON.stringify(identity)}; one content-addressed pack serves every adoption`);
      else packsByIdentity.set(identity, pack);
      const matching = instances.filter(adoption => adoption.document.contract === pack.contract && adoption.document.version === pack.version);
      pack.model = contractValidatePack(pack, matching);
      if (matching.length === 0) error("CONTRACT_PACK_ORPHAN", CONTRACT_SECTION, pack.display, `pack ${JSON.stringify(identity)} has no adoption in this package`);
    }

    const checked = [];
    let generatedTotal = 0;
    const rendered = [];
    const generatedTests = [];
    for (const adoption of instances) {
      const identity = `${adoption.document.contract}-${adoption.document.version}`;
      const pack = packsByIdentity.get(identity);
      if (!pack) continue;
      adoption.checked = true;
      adoption.pack = pack;
      checked.push({ adoption: adoption.id, pack: pack.hash });
      if (pack.hash !== undefined && adoption.document.pack !== pack.hash) {
        const message = own(adoption.document, "pack")
          ? `definition names ${JSON.stringify(adoption.document.pack)} but present pack ${pack.display} hashes to ${pack.hash}`
          : `the definition names no pack, but ${pack.display} is present and hashes to ${pack.hash}; add \"pack\": ${JSON.stringify(pack.hash)} or remove the pack`;
        error("CONTRACT_PACK_HASH", CONTRACT_SECTION, adoption.display, message);
      }
      if (isObject(adoption.document.verification)) for (const templateId of Object.keys(adoption.document.verification)) if (!templateId.startsWith("_") && !pack.model.templates.has(templateId)) error("CONTRACT_REFERENCE", CONTRACT_SECTION, adoption.display, `#/verification/${pointerEscape(templateId)} names no template in ${pack.display}`);
      contractPrepareTemplates(adoption, pack.model);
      if (isObject(adoption.document.verification)) for (const templateId of Object.keys(adoption.document.verification)) {
        if (templateId.startsWith("_")) continue;
        const record = pack.model.templates.get(templateId);
        if (record && !adoption.liveTemplates.has(record)) {
          const reason = adoption.nonLiveTemplateReasons.get(record);
          const at = `#/verification/${pointerEscape(templateId)}`;
          const message = reason?.kind === "answer"
            ? `${at} waits on the answer to question ${JSON.stringify(reason.name)}`
            : reason?.kind === "row-field"
              ? `${at} waits on required row field ${JSON.stringify(reason.name)}`
              : `${at} fills inputs for a template that is not live under the recorded answers; remove the entry`;
          error("CONTRACT_REFERENCE", CONTRACT_SECTION, adoption.display, message, undefined, undefined, Boolean(reason));
        }
      }
      const output = contractRenderTestsV07(adoption);
      generatedTotal += output.count;
      generatedTests.push(...output.tests);
      if (output.markdown) rendered.push(output.markdown.trimEnd());
    }

    return { instances, generatedTotal, generatedTests, checked, contractKeys, instanceIds, rendered: rendered.length ? `${rendered.join("\n\n")}\n` : "" };
  }

  function validatePackage(packageArgument) {
    const packageRoot = path.resolve(packageArgument);
    if (!host.exists(packageRoot) || !host.isDirectory(packageRoot)) {
      error("PACKAGE_DIRECTORY", "§1", ".", `package directory does not exist or is not a directory: ${packageRoot}`);
      return { packageRoot, packageName: path.basename(packageRoot), manifest: undefined };
    }
    const resolvePath = makePathResolver(packageRoot);
    const required = ["manifest.json", "tuning.json", "01-overview.md", "02-mechanics.md", "05-build-plan.md"];
    for (const relative of required) {
      const file = path.join(packageRoot, relative);
      if (!host.exists(file) || !host.isFile(file)) error("PACKAGE_REQUIRED_FILE", "§1", relative, `required package file is missing: ${relative}`);
    }

    const manifestFile = path.join(packageRoot, "manifest.json");
    const manifest = host.exists(manifestFile) ? parseJsonFile(manifestFile, "manifest.json", "§3", "MANIFEST_JSON") : undefined;
    if (manifest !== undefined) {
      const schema = loadSchema("manifest.schema.json", "§3");
      if (schema) {
        for (const problem of schemaProblems(manifest, schema, schema)) {
          error("MANIFEST_SCHEMA", "§3", "manifest.json", `${problem.path} ${problem.message}`);
        }
      }
      if (isObject(manifest.commerce) && isObject(manifest.commerce.split)) {
        const designer = manifest.commerce.split.designer;
        const builder = manifest.commerce.split.builder;
        if (typeof designer === "number" && typeof builder === "number" && Number.isFinite(designer) && Number.isFinite(builder) && Math.abs(designer + builder - 100) > 1e-9) {
          error("COMMERCE_SPLIT", "§3", "manifest.json", `commerce split must sum to 100; got ${designer + builder}`);
        }
      }
    }

    const personalization = loadPersonalization(packageRoot, manifest, resolvePath);
    const contentContext = validateContent(packageRoot, manifest, resolvePath, personalization.questions);
    validateRulesetTags(packageRoot);
    validatePersonalizationTags(packageRoot, manifest, personalization);
    const { doc: tuningDoc, context: exprContext } = validateTuning(packageRoot, contentContext, personalization);
    validateFantasy(packageRoot);
    validateInjectionSurface(packageRoot);
    validateTieBreakLint(packageRoot);
    validateProseLiterals(packageRoot, manifest, tuningDoc);
    const directionCtx = validateDirection(packageRoot, resolvePath, exprContext);
    const paletteCtx = directionCtx.paletteCtx;
    const contractsCtx = validateContractsV07(packageRoot, manifest, contentContext, resolvePath, tuningDoc, exprContext, directionCtx);
    validatePersonalizationSets(personalization, tuningDoc);
    validateProseCitations(packageRoot, manifest, tuningDoc, directionCtx, contractsCtx, paletteCtx, exprContext);
    reportUnmentionedDirection(directionCtx);
    validateModeTags(packageRoot, manifest, exprContext.clocks);
    validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx);
    // Reachability is the union of every pass above — mood field, color
    // binding, threshold operand, prose citation — so the warning is emitted
    // once they have all run.
    reportUnreachedPalettes(paletteCtx);
    // §1b's twin of the palette rule: a drawer nothing reaches — no prose
    // citation and no link field — is a review lead, not an order.
    for (const [id, info] of contentContext.collections) {
      if (!info.reached) warning("COLLECTION_UNCITED", "§1b", `collections/${id}/`, `nothing reaches drawer ${JSON.stringify(id)}: no prose cites it and no link field points to it`);
    }
    return {
      packageRoot,
      packageName: manifest?.id ?? path.basename(packageRoot),
      manifest,
      contractTests: contractsCtx?.rendered,
      contractAdoptions: contractsCtx?.instances.length,
      checkedContractAdoptions: contractsCtx?.checked.length
    };
  }

  // ---------------------------------------------------------------------------
  // SPEC §7 — opengdd-build.json, validated against a certifying source spec.
  // ---------------------------------------------------------------------------

  function expectedBuildSnapshot(specTuning, sourceQuestions, answers, contractFacts) {
    const values = new Map(Object.entries(isObject(specTuning?.values) ? specTuning.values : {}));
    const assignable = new Set(Object.keys(isObject(specTuning?.ranges) ? specTuning.ranges : {}));
    for (const [key, value] of contractFacts?.values ?? []) {
      values.set(key, value);
    }
    return applyPersonalizationAnswers(
      values,
      [...sourceQuestions.values()],
      question => own(answers, question.id) ? answers[question.id] : question.default,
      key => assignable.has(key)
    );
  }

  function validateBuildManifest(buildFilePath, specRoot) {
    const buildFile = path.resolve(buildFilePath);
    // Without a certifying spec directory the mandatory §7 cross-checks cannot
    // run, so this run cannot reach a conformance verdict at all. The flag
    // travels to `finish`, which turns it into NOT CHECKED.
    const indeterminate = !specRoot;
    if (!host.exists(buildFile) || !host.isFile(buildFile)) {
      error("BUILD_FILE_MISSING", "§7", ".", `opengdd-build.json does not exist: ${buildFile}`);
      return { packageRoot: buildFile, packageName: path.basename(buildFile), indeterminate };
    }
    const build = parseJsonFile(buildFile, "opengdd-build.json", "§7", "BUILD_JSON");
    if (build === undefined) return { packageRoot: buildFile, packageName: path.basename(buildFile), indeterminate };

    const hasLegacyResolvedRoles = isObject(build?.resolved_tuning) && (own(build.resolved_tuning, "tunables") || own(build.resolved_tuning, "constants"));
    const hasLegacyDirection = own(build, "direction_result") || (isObject(build.evidence) && own(build.evidence, "direction_observations"));
    const hasLegacyBuildProfile = ["renderer", "resources", "capture_profile"].some(field => own(build, field));
    const hasLegacyAlgorithm = isObject(build.evidence) && own(build.evidence, "algorithm");
    const schema = loadSchema("opengdd-build.schema.json");
    if (schema) {
      for (const problem of schemaProblems(build, schema, schema)) {
        if (hasLegacyResolvedRoles && (
          (["#/resolved_tuning/tunables", "#/resolved_tuning/constants"].includes(problem.path) && problem.message === "is not an allowed property") ||
          (!own(build.resolved_tuning, "values") && problem.path === "#/resolved_tuning" && problem.message === 'is missing required property "values"')
        )) continue;
        if (hasLegacyDirection && ["#/direction_result", "#/evidence/direction_observations"].includes(problem.path) && problem.message === "is not an allowed property") continue;
        if (hasLegacyBuildProfile && ["#/renderer", "#/resources", "#/capture_profile"].includes(problem.path) && problem.message === "is not an allowed property") continue;
        error("BUILD_SCHEMA", "§7", "opengdd-build.json", `${problem.path} ${problem.message}`);
      }
    }
    if (hasLegacyResolvedRoles) {
      error("BUILD_SCHEMA", "§7", "opengdd-build.json", "resolved_tuning.tunables/constants are historical; v0.7 requires resolved_tuning.values (`opengdd migrate --build`)");
    }
    if (hasLegacyDirection) {
      error("BUILD_SCHEMA", "§7", "opengdd-build.json", "`direction_result` / `evidence.direction_observations` are historical; v0.7 records carry neither (`opengdd migrate --build`)");
    }
    if (hasLegacyBuildProfile) {
    error("BUILD_SCHEMA", "§7", "opengdd-build.json", "`capture_profile` is recorded in the audit's own record (`conformance/CERTIFICATION.md`, Audit profile); `renderer` and `resources` are retired (`opengdd migrate --build`)");
    }
    if (hasLegacyAlgorithm) {
      error("BUILD_SCHEMA", "§7", "opengdd-build.json", "`evidence.algorithm` is retired; the certification protocol names the hash (`opengdd migrate --build`)");
    }
    const payloadFile = build?.evidence?.payload?.file;
    if (typeof payloadFile === "string") {
      const payloadPath = path.resolve(path.dirname(buildFile), payloadFile.replaceAll("/", path.sep));
      if (path.isAbsolute(payloadFile) || path.isAbsoluteWindows(payloadFile) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(payloadFile) || payloadFile.includes("\\") || !isInside(path.dirname(buildFile), payloadPath)) {
        error("BUILD_PAYLOAD_PATH", "§7", "opengdd-build.json", `evidence.payload.file must be a forward-slash package-relative path that stays inside the build package, got ${JSON.stringify(payloadFile)}`);
      }
    }

    if (!specRoot) {
      warning(
        "BUILD_SPEC_CROSS_CHECKS_SKIPPED",
        "§7",
        "opengdd-build.json",
        "certifying spec directory was not supplied; skipped source-dependent SPEC §7 package-consistency checks (spec id/version, designer, personalization answers, resolved_tuning values, acceptance-test total, completion, and runtime runner identity) plus optional commerce equality. Supply the optional <spec-dir> argument to enable them; until then this run reports NOT CHECKED rather than any passing verdict, because most of the record's subject was never decided"
      );
    }

    let specManifest;
    if (specRoot) {
      const specResolvedRoot = path.resolve(specRoot);
      const specManifestFile = path.join(specResolvedRoot, "manifest.json");
      specManifest = host.exists(specManifestFile) ? parseJsonFile(specManifestFile, "manifest.json", "§7", "MANIFEST_JSON") : undefined;
      if (specManifest === undefined) {
        error("BUILD_SPEC_MISSING", "§7", "opengdd-build.json", `certifying spec manifest not found or invalid: ${specManifestFile}`);
      } else if (isObject(build?.spec)) {
        if (build.spec.id !== specManifest.id) error("BUILD_SPEC_ID", "§7", "opengdd-build.json", `spec.id ${JSON.stringify(build.spec.id)} does not match the source manifest's id ${JSON.stringify(specManifest.id)}`);
        if (build.spec.version !== specManifest.version) error("BUILD_SPEC_VERSION", "§7", "opengdd-build.json", `spec.version ${JSON.stringify(build.spec.version)} does not match the source manifest's version ${JSON.stringify(specManifest.version)}`);
        if (isObject(build.designer) && isObject(specManifest.designer)) {
          if (build.designer.name !== specManifest.designer.name) error("BUILD_DESIGNER_NAME", "§7", "opengdd-build.json", "build designer.name does not match the source manifest's designer.name");
          for (const key of ["handle", "contact"]) {
            if (own(build.designer, key) && own(specManifest.designer, key) && build.designer[key] !== specManifest.designer[key]) {
              error("BUILD_DESIGNER_FIELD", "§7", "opengdd-build.json", `build designer.${key} does not match the source manifest's designer.${key}`);
            }
          }
        }
        if (own(build, "commerce") && deepKey(build.commerce) !== deepKey(specManifest.commerce)) {
          error("BUILD_COMMERCE_MISMATCH", "§7", "opengdd-build.json", "commerce is optional in the build record, but when present it must equal the source manifest's commerce object");
        }

        const specResolvePath = makePathResolver(specResolvedRoot);
        const sourceQuestions = loadPersonalization(specResolvedRoot, specManifest, specResolvePath).questions;
        if (isObject(build?.personalization?.answers)) {
          const answers = build.personalization.answers;
          for (const [questionId, question] of sourceQuestions) {
            if (!own(answers, questionId)) {
              error("BUILD_ANSWER_MISSING", "§7", "opengdd-build.json", `personalization.answers is missing declared question ${JSON.stringify(questionId)}; defaulted questions must be recorded too`);
            }
          }
          for (const [questionId, answer] of Object.entries(answers)) {
            const question = sourceQuestions.get(questionId);
            if (!question) {
              error("BUILD_ANSWER_UNKNOWN", "§7", "opengdd-build.json", `personalization.answers names undeclared question ${JSON.stringify(questionId)}`);
              continue;
            }
            const expected = question.type === "number" ? "number" : question.type === "choice" || question.type === "text" ? "string" : undefined;
            if (expected && (typeof answer !== expected || (expected === "number" && !Number.isFinite(answer)))) {
              error("BUILD_ANSWER_TYPE", "§7", "opengdd-build.json", `personalization.answers.${questionId} must be a ${expected} for ${JSON.stringify(question.type)} question ${JSON.stringify(questionId)}`);
            } else if (question.type === "choice" && typeof answer === "string" && Array.isArray(question.options)) {
              const optionIds = question.options.filter(isObject).map(option => option.id).filter(id => typeof id === "string");
              if (!optionIds.includes(answer)) {
                error("BUILD_ANSWER_OPTION", "§7", "opengdd-build.json", `personalization.answers.${questionId} ${JSON.stringify(answer)} is not a declared option id for choice question ${JSON.stringify(questionId)}`);
              }
            }
          }
        }

        const specTuningRelative = "tuning.json";
        const specTuningFile = specResolvePath(specTuningRelative, "canonical tuning file", "§7", "BUILD_SPEC_TUNING_MISSING", { mustExist: true, kind: "file", display: "opengdd-build.json" });
        const specTuning = specTuningFile ? parseJsonFile(specTuningFile, slash(specTuningRelative), "§7", "TUNING_JSON") : undefined;
        // The snapshot contains every package tuning value plus every filled
        // contract value, including promised adoptions.
        const contractFacts = contractBuildFacts(specResolvedRoot, specManifest);
        if (isObject(specTuning) && isObject(build?.resolved_tuning)) {
          const source = isObject(specTuning.values) ? specTuning.values : {};
          const contractKeys = [...(contractFacts?.values ?? new Map()).keys()];
          const expected = new Set([...Object.keys(source), ...contractKeys]);
          const resolved = isObject(build.resolved_tuning.values) ? build.resolved_tuning.values : {};
          const missing = [...expected].filter(key => !own(resolved, key)).sort();
          const extra = Object.keys(resolved).filter(key => !expected.has(key)).sort();
          if (missing.length || extra.length) {
            const details = [
              missing.length ? `missing ${missing.map(key => JSON.stringify(key)).join(", ")}` : undefined,
              extra.length ? `unexpected ${extra.map(key => JSON.stringify(key)).join(", ")}` : undefined
            ].filter(Boolean).join("; ");
            const union = contractKeys.length ? `${slash(specTuningRelative)} values keys unioned with the live contract key set` : `${slash(specTuningRelative)} values keys`;
            error("BUILD_TUNING_KEYS", "§7", "opengdd-build.json", `resolved_tuning.values keys must exactly equal ${union}: ${details}`);
          }
          if (isObject(specTuning.ranges)) {
            for (const [key, range] of Object.entries(specTuning.ranges)) {
              const value = resolved[key];
              if (typeof value === "number" && Number.isFinite(value) && Array.isArray(range) && range.length === 2 && range.every(bound => typeof bound === "number" && Number.isFinite(bound)) && (value < range[0] || value > range[1])) {
                error("BUILD_TUNING_RANGE", "§7", "opengdd-build.json", `resolved_tuning.values.${key}=${value} is outside the source inclusive range [${range[0]}, ${range[1]}]`);
              }
            }
          }
          const answers = isObject(build?.personalization?.answers) ? build.personalization.answers : {};
          const expectedSnapshot = expectedBuildSnapshot(specTuning, sourceQuestions, answers, contractFacts);
          for (const [key, expectedValue] of expectedSnapshot) {
            if (!own(resolved, key) || resolved[key] === expectedValue) continue;
            error("BUILD_TUNING_VALUE", "§7", "opengdd-build.json", `resolved_tuning.values.${key} is ${JSON.stringify(resolved[key])}; the canonical source-and-answer pipeline resolves it to ${JSON.stringify(expectedValue)}`);
          }
          const snapshot = new Map(Object.entries(resolved).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
          if (isObject(specTuning.rules)) {
            for (const [name, sourceRule] of Object.entries(specTuning.rules)) {
              if (typeof sourceRule !== "string") continue;
              try {
                const ast = parseRule(sourceRule);
                if (!evaluateRule(ast, snapshot)) error("BUILD_TUNING_RULE", "§4", "opengdd-build.json", formatRuleFailure(name, sourceRule, ast, snapshot));
              } catch (cause) {
                error("BUILD_TUNING_RULE", "§4", "opengdd-build.json", `rule ${JSON.stringify(name)} could not be evaluated over resolved_tuning.values: ${cause.message} at position ${cause.position ?? 0}`);
              }
            }
          }
          for (const entry of contractFacts?.rules ?? []) {
            const prefix = `contracts.${entry.adoption}.`;
            const local = new Map([...snapshot].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
            try {
              if (!evaluateRule(entry.ast, local)) error("BUILD_CONTRACT_RULE", "§7", "opengdd-build.json", formatRuleFailure(entry.name, entry.source, entry.ast, local, `adoption ${JSON.stringify(entry.adoption)}`));
            } catch (cause) {
              error("BUILD_CONTRACT_RULE", "§7", "opengdd-build.json", `adoption ${JSON.stringify(entry.adoption)} rule ${JSON.stringify(entry.name)} could not be evaluated over resolved_tuning.values: ${cause.message} at position ${cause.position ?? 0}`);
            }
          }
        }

        // SPEC §7 check 4: a number answer outside its target range is refused.
        // Package validation checks the default; the record is where a supplied
        // answer becomes available. There is no clamp branch.
        if (isObject(specTuning) && isObject(build?.personalization?.answers)) {
          const answers = build.personalization.answers;
          const sourceRanges = isObject(specTuning.ranges) ? specTuning.ranges : {};
          const rangeOf = key => boundsFromPair(sourceRanges[key]);
          for (const [questionId, question] of sourceQuestions) {
            const answer = own(answers, questionId) ? answers[questionId] : question.default;
            if (question.type !== "number" || typeof question.sets !== "string" || typeof answer !== "number" || !Number.isFinite(answer)) continue;
            const range = rangeOf(question.sets);
            if (range && outsideBounds(range, answer)) {
              error("BUILD_ANSWER_REJECTED", "§7", "opengdd-build.json", `personalization.answers.${questionId} sets ${JSON.stringify(question.sets)} to ${answer}, outside the inclusive range ${describeBounds(range)}; the answer is refused, never clamped`);
            }
          }
        }

        const expectedContracts = contractFacts?.checked ?? [];
        const recordedContracts = build?.evidence?.contracts;
        if (expectedContracts.length && !Array.isArray(recordedContracts)) {
          error("BUILD_CONTRACTS_MISSING", "§7", "opengdd-build.json", `evidence.contracts is required because the source package has ${expectedContracts.length} checked contract adoption(s)`);
        } else if (!expectedContracts.length && own(build?.evidence ?? {}, "contracts")) {
          error("BUILD_CONTRACTS_UNEXPECTED", "§7", "opengdd-build.json", "evidence.contracts is present, but the source package has no checked contract adoption");
        } else if (Array.isArray(recordedContracts)) {
          const expected = new Map(expectedContracts.map(entry => [entry.adoption, entry.pack]));
          const seen = new Set();
          for (const [index, entry] of recordedContracts.entries()) {
            if (!isObject(entry) || typeof entry.adoption !== "string" || typeof entry.pack !== "string") {
              error("BUILD_CONTRACT_PACK", "§7", "opengdd-build.json", `evidence.contracts[${index}] must be { adoption, pack }`);
              continue;
            }
            // A pack whose digest the host could not compute (see the
            // `contract-pack-hash` skip) is present but unknown: the adoption
            // is still expected here, and its digest is not compared.
            const expectedPack = expected.get(entry.adoption);
            const mismatch = expectedPack === undefined && expected.has(entry.adoption) ? false : expectedPack !== entry.pack;
            if (seen.has(entry.adoption) || mismatch) error("BUILD_CONTRACT_PACK", "§7", "opengdd-build.json", `evidence.contracts[${index}] does not match the source pack for adoption ${JSON.stringify(entry.adoption)}`);
            seen.add(entry.adoption);
          }
          for (const adoption of expected.keys()) if (!seen.has(adoption)) error("BUILD_CONTRACT_PACK", "§7", "opengdd-build.json", `evidence.contracts is missing checked adoption ${JSON.stringify(adoption)}`);
        }

        // Checked adoptions contribute their in-memory rendered tests; promised
        // adoptions contribute none. Generated headings in the build plan are
        // retired and never count.
        const plan = buildPlanAcceptanceHeadings(specResolvedRoot, specManifest);
        const planDescriptors = buildPlanAcceptanceDescriptors(plan);
        if (plan && typeof build?.evidence?.acceptance?.total === "number") {
          const generated = contractFacts?.generatedTotal ?? 0;
          const expectedTotal = plan.headings.length + generated;
          if (build.evidence.acceptance.total !== expectedTotal) {
            const split = generated ? ` (${plan.headings.length} game-local plus ${generated} generated)` : "";
            error("BUILD_ACCEPTANCE_TOTAL", "§7", "opengdd-build.json", `evidence.acceptance.total ${build.evidence.acceptance.total} does not match the source package's ${expectedTotal} enumerated acceptance tests${split}`);
          }
        }
        if (Array.isArray(build?.evidence?.acceptance?.sampled)) {
          const localTests = new Map(planDescriptors.filter(test => /^AT-[1-9][0-9]*$/.test(test.name)).map(test => [test.name, test.descriptor]));
          for (const id of new Set(build.evidence.acceptance.sampled)) {
            if (typeof id !== "string" || !/^AT-[1-9][0-9]*$/.test(id)) continue;
            if (!localTests.has(id)) error("BUILD_SAMPLED_UNKNOWN", "§7", "opengdd-build.json", `evidence.acceptance.sampled names ${JSON.stringify(id)}, which is not an acceptance test in the source package`);
            else if (localTests.get(id)?.type !== "general") error("BUILD_SAMPLED_TYPE", "§7", "opengdd-build.json", `evidence.acceptance.sampled names ${JSON.stringify(id)}, whose source test type is ${JSON.stringify(localTests.get(id)?.type)}; only general tests may be sampled`);
          }
        }
        const runtimeTests = [...planDescriptors, ...(contractFacts?.generatedTests ?? [])].filter(({ descriptor }) => isObject(descriptor) && (
          ["scenario", "general"].includes(descriptor.type)
          || ["replay", "target", "direction_claims"].some(field => own(descriptor, field))
        ));
        if (runtimeTests.length > 0 && isObject(build?.evidence) && !own(build.evidence, "runner")) {
          error("BUILD_RUNNER_REQUIRED", "§7", "opengdd-build.json", `evidence.runner is required because the source package carries runtime acceptance test${runtimeTests.length === 1 ? "" : "s"}: ${runtimeTests.map(test => test.name).join(", ")}`);
        }

      }
    }

    if (isObject(build) && isObject(build.evidence)) {
      if (typeof build.evidence.acceptance?.total !== "number" || typeof build.evidence.acceptance?.passed !== "number") {
        error("BUILD_ACCEPTANCE_SHAPE", "§7", "opengdd-build.json", "evidence.acceptance must declare numeric passed and total");
      } else if (build.evidence.acceptance.passed !== build.evidence.acceptance.total) {
        error("BUILD_ACCEPTANCE_INCOMPLETE", "§7", "opengdd-build.json", `evidence.acceptance ${build.evidence.acceptance.passed}/${build.evidence.acceptance.total} — a conforming build requires passed == total; the build does not conform`);
      }
    }

    return { packageRoot: buildFile, packageName: build?.spec?.id ?? path.basename(buildFile), indeterminate };
  }

  function finish(result) {
    findings.sort((a, b) => {
      const severity = { error: 0, warning: 1 };
      return severity[a.severity] - severity[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code);
    });
    const errors = findings.filter(item => item.severity === "error").length;
    const dependent = findings.filter(item => item.severity === "error" && item.dependent === true).length;
    const warnings = findings.filter(item => item.severity === "warning").length;
    // SPEC §2d makes a build record's subject the consistency between the
    // record and the package bytes, and SPEC §7 makes eight of those checks
    // mandatory. A run that never read the package could not decide them, so
    // its result is neither pass nor fail: the verdict is NOT CHECKED and
    // `valid` is null. Zero errors is not a passing verdict when most of the
    // subject was never looked at.
    const indeterminate = result.indeterminate === true && errors === 0;
    const verdict = errors ? "FAIL" : indeterminate ? "NOT CHECKED" : warnings ? "PASS WITH WARNINGS" : "PASS";
    return {
      ...result,
      valid: indeterminate ? null : errors === 0,
      verdict,
      summary: { errors, dependent, warnings, findings: findings.length },
      findings,
      skipped
    };
  }

  return {
    validatePackage,
    validateBuildManifest,
    finish,
    validateSchemaDocument: (document, schema) => schemaProblems(document, schema, schema)
  };
}

export function validateSchemaDocument(document, schema) {
  return createValidator({}).validateSchemaDocument(document, schema);
}

export function validatePackage(host, packageArgument) {
  const validator = createValidator(host);
  return validator.finish({ ...validator.validatePackage(packageArgument), validationKind: "package" });
}

export function validateBuildManifest(host, buildFile, specDirectory) {
  const validator = createValidator(host);
  return validator.finish({ ...validator.validateBuildManifest(buildFile, specDirectory), validationKind: "build" });
}

// Rendering is a read-only view of the live tests supplied by checked contract
// adoptions; no build-plan bytes are written or compared.
export function renderContractTests(host, packageArgument) {
  const validator = createValidator(host);
  const run = validator.finish({ ...validator.validatePackage(packageArgument), validationKind: "package" });
  return {
    markdown: run.contractTests,
    findings: run.findings,
    summary: run.summary,
    contractAdoptions: run.contractAdoptions,
    checkedContractAdoptions: run.checkedContractAdoptions
  };
}

export function formatReport(run, jsonMode) {
  const isBuild = run.validationKind === "build";
  const subject = { id: run.packageName, path: run.packageRoot };
  const output = {
    validator: `OpenGDD v${SPEC_VERSION} ${isBuild ? "build" : "package"} conformance`,
    [isBuild ? "build" : "package"]: subject,
    valid: run.valid,
    verdict: run.verdict,
    summary: run.summary,
    findings: run.findings
  };
  if (jsonMode) return `${JSON.stringify(output, null, 2)}\n`;

  const status = run.verdict;
  const lines = [
    `OpenGDD v${SPEC_VERSION} ${isBuild ? "build" : "package"} validation`,
    `${isBuild ? "Build" : "Package"}: ${run.packageName} (${run.packageRoot})`,
    `Result: ${status} — ${run.summary.errors} error(s)${run.summary.dependent ? ` (${run.summary.dependent} waiting on designer input)` : ""}, ${run.summary.warnings} warning(s)`
  ];
  if (run.findings.length) lines.push("");
  for (const finding of run.findings) {
    const location = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
    lines.push(`${finding.severity.toUpperCase()} [${finding.code}] ${location} — ${finding.message} (SPEC ${finding.spec_section})`);
  }
  return `${lines.join("\n")}\n`;
}
