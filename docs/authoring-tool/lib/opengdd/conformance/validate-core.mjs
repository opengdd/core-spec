// Pure validation engine. All environment access is supplied by the host.
import { isObject, markdownSlug, own, slash, unfencedLines } from "./package-syntax.mjs";

const SPEC_VERSION = "0.5";

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
  const INJECTION_LINT_STATUS = "advisory-v0.5";
  const INJECTION_LINT_SECTION = "SPEC v0.5 — specs are data (injection-surface lint)";
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

  function addFinding(severity, code, section, file, message, line = undefined, data = undefined) {
    if (findingsSuppressed > 0) return;
    const finding = { severity, code, spec_section: section, file: slash(file), message };
    if (line !== undefined) finding.line = line;
    if (data !== undefined) finding.data = data;
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
      for (const [key, value] of Object.entries(instance)) {
        if (own(declared, key)) {
          problems.push(...schemaProblems(value, declared[key], schemaRoot, `${instancePath}/${pointerEscape(key)}`));
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

  function validateDefinedIn(definedIn, resolvePath) {
    if (typeof definedIn !== "string" || definedIn.length === 0) return undefined;
    const hash = definedIn.indexOf("#");
    if (hash <= 0 || hash === definedIn.length - 1) {
      error("CONTENT_CONTRACT_SECTION", "§1b", "manifest.json", `content defined_in must point to a chapter section: ${JSON.stringify(definedIn)}`);
      return undefined;
    }
    const filePart = definedIn.slice(0, hash);
    const fragment = decodeURIComponent(definedIn.slice(hash + 1));
    const file = resolvePath(filePart, "content defined_in file", "§1b", "CONTENT_CONTRACT_PATH", { mustExist: true, kind: "file" });
    if (!file) return undefined;
    const text = host.readText(file);
    const lines = text.split(/\r?\n/);
    const headings = lines.map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      return match ? { level: match[1].length, title: match[2], slug: markdownSlug(match[2]), line: index + 1, index } : undefined;
    }).filter(Boolean);
    const heading = headings.find(item => item.slug === fragment.toLowerCase());
    if (!heading) {
      error("CONTENT_CONTRACT_SECTION", "§1b", slash(filePart), `defined_in fragment #${fragment} does not match a Markdown heading`);
      return { file, text, fragment };
    }
    const next = headings.find(item => item.index > heading.index && item.level <= heading.level);
    const sectionLines = lines.slice(heading.index + 1, next?.index ?? lines.length);
    const first = sectionLines.find(line => line.trim().length > 0)?.trim();
    if (first?.startsWith("> DELEGATED:") || first?.startsWith("> PERSONALIZATION:")) {
      error("CONTENT_CONTRACT_AUTHORITY", "§1b", slash(filePart), "content defined_in section must be Fixed", heading.line);
    }
    return { file, text, fragment, line: heading.line };
  }

  function loadPersonalization(packageRoot, manifest, resolvePath) {
    const empty = { questions: new Map(), doc: undefined, display: undefined, declared: false, readable: false };
    const declared = manifest?.build?.personalization;
    if (!declared) return empty;
    const file = resolvePath(declared, "build.personalization", "§3", "BUILD_PATH_MISSING", { mustExist: true, kind: "file" });
    if (!file) return { ...empty, declared: true };
    const display = slash(declared);
    const doc = parseJsonFile(file, display, "§5", "PERSONALIZATION_JSON");
    // SPEC §2d — personalization.json is one of the schema-validated package
    // files. The bespoke §5 checks below and in validatePersonalizationOverrides
    // stay: they read tuning.json, which no single-document schema can.
    if (doc !== undefined) {
      const schema = loadSchema("personalization.schema.json", "§5");
      if (schema) {
        for (const problem of schemaProblems(doc, schema, schema)) {
          error("PERSONALIZATION_SCHEMA", "§5", display, `${problem.path} ${problem.message}`);
        }
      }
    }
    if (!isObject(doc) || !Array.isArray(doc.questions)) {
      return { ...empty, doc: isObject(doc) ? doc : undefined, display, declared: true, readable: doc !== undefined };
    }
    doc.questions.forEach((question, questionIndex) => {
      if (!isObject(question) || !Array.isArray(question.affects)) return;
      question.affects.forEach((affected, affectedIndex) => {
        if (typeof affected === "string") resolvePath(affected, `questions[${questionIndex}].affects[${affectedIndex}]`, "§5", "PERSONALIZATION_PATH", { mustExist: true });
      });
    });
    const questions = new Map(doc.questions.filter(isObject).filter(question => typeof question.id === "string").map(question => [question.id, question]));
    return { questions, doc, display, declared: true, readable: true };
  }

  // SPEC §5 — a `tuning_overrides` entry replaces a tunables key exactly. It
  // therefore carries the same two obligations numeric `resolution` carries:
  // the replacement stays inside the target key's declared range, and a
  // `constants` key is never a legal target.
  function validatePersonalizationOverrides(personalization, tuningDoc, contractsCtx) {
    const doc = personalization?.doc;
    if (!isObject(doc) || !isObject(tuningDoc)) return;
    const display = personalization.display ?? "personalization.json";
    const constants = isObject(tuningDoc.constants) ? tuningDoc.constants : {};
    const tunables = isObject(tuningDoc.tunables) ? tuningDoc.tunables : {};
    const meta = isObject(tuningDoc.meta) ? tuningDoc.meta : {};
    walk(doc, (value, pointer, ancestors) => {
      const last = ancestors.at(-1);
      if (!isObject(value) || !isObject(last) || last.key !== "tuning_overrides") return;
      for (const [key, replacement] of Object.entries(value)) {
        const site = `${pointer}/${pointerEscape(key)}`;
        // §10.11: §5's targeting and clamping extend to `contracts.*` keys,
        // reading the range and the change authority from the core's knob meta
        // rather than from `tuning.json` meta. A knob's value is the one part
        // of a contract that is personalizable at all.
        if (key.startsWith("contracts.")) {
          const knob = contractsCtx?.knobIndex?.get(key);
          if (!knob) {
            error("TUNING_OVERRIDE_TARGET", "§5", display, `${site} names no live contract knob; the namespace holds \`contracts.<instance>.<knob>\` for every unpruned knob of every instance, and nothing else`);
            continue;
          }
          if (knob.meta.kind !== "tunable") {
            error("TUNING_OVERRIDE_CONSTANT", "§5", display, `${site} overrides a contract knob whose meta declares kind ${JSON.stringify(knob.meta.kind)}; personalization may replace tunables only`);
            continue;
          }
          if (typeof replacement !== "number" || !Number.isFinite(replacement)) continue;
          const knobRange = isObject(knob.meta.range) ? knob.meta.range : undefined;
          if (knobRange && typeof knobRange.min === "number" && replacement < knobRange.min) {
            error("TUNING_OVERRIDE_RANGE", "§5", display, `${site}=${replacement} is below the core's declared minimum ${knobRange.min} for that knob (bounds inclusive)`);
          }
          if (knobRange && typeof knobRange.max === "number" && replacement > knobRange.max) {
            error("TUNING_OVERRIDE_RANGE", "§5", display, `${site}=${replacement} is above the core's declared maximum ${knobRange.max} for that knob (bounds inclusive)`);
          }
          continue;
        }
        if (own(constants, key)) {
          error("TUNING_OVERRIDE_CONSTANT", "§5", display, `${site} overrides a constants key; personalization may replace tunables only`);
          continue;
        }
        if (!own(tunables, key)) continue;
        const range = isObject(meta[key]) ? meta[key].range : undefined;
        if (!Array.isArray(range) || range.length !== 2 || !range.every(bound => typeof bound === "number" && Number.isFinite(bound))) continue;
        if (typeof replacement !== "number" || !Number.isFinite(replacement)) continue;
        if (replacement < range[0] || replacement > range[1]) {
          error("TUNING_OVERRIDE_RANGE", "§5", display, `${site}=${replacement} is outside the target key's inclusive range [${range[0]}, ${range[1]}]`);
        }
      }
    });
  }

  function validateAuthority(authority, file, pointer, questionsById) {
    if (!isObject(authority)) {
      error("CONTENT_AUTHORITY", "§1b", file, `${pointer} authority must be an object`);
      return;
    }
    const keys = Object.keys(authority).sort();
    if (authority.level === "fixed" || authority.level === "delegated") {
      if (keys.length !== 1 || keys[0] !== "level") {
        error("CONTENT_AUTHORITY", "§1b", file, `${pointer} ${authority.level} authority must contain only level`);
      }
      return;
    }
    if (authority.level === "personalization") {
      if (keys.length !== 2 || keys[0] !== "level" || keys[1] !== "question" || typeof authority.question !== "string" || !authority.question) {
        error("CONTENT_AUTHORITY", "§1b", file, `${pointer} personalization authority requires exactly level and a non-empty question`);
      } else if (questionsById.size > 0 && !questionsById.has(authority.question)) {
        error("CONTENT_AUTHORITY_QUESTION", "§1b", file, `${pointer} names unknown personalization question ${JSON.stringify(authority.question)}`);
      }
      return;
    }
    error("CONTENT_AUTHORITY", "§1b", file, `${pointer} has illegal authority level ${JSON.stringify(authority.level)}`);
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

  // SPEC §7a — `parallel-string-layers-1` grid congruence. These are
  // existence-level package checks over EVERY collection record of a
  // grid-encoded collection, whatever its source type (catalog or items).
  function validateGridLayers(collection, recordEntries) {
    if (collection?.format !== "parallel-string-layers-1") return;
    const layers = collection?.layout?.layers;
    if (!Array.isArray(layers) || layers.length === 0) return;
    for (const entry of recordEntries) {
      const record = entry.record;
      if (!isObject(record)) continue;
      const present = [];
      for (const layer of layers) {
        if (typeof layer !== "string") continue;
        const value = record[layer];
        if (!Array.isArray(value) || !value.every(row => typeof row === "string")) {
          error("CONTENT_LAYER_MISSING", "§7a", entry.display, `${entry.pointer} declared layer ${JSON.stringify(layer)} is missing or is not a string array`, undefined, { diagnostic: "layer-row-mismatch", record: recordLabel(collection, record), field: layer });
          continue;
        }
        present.push({ layer, rows: value });
      }
      if (present.length === 0) continue;
      const reference = present[0];
      const rowCount = reference.rows.length;
      let rowsAgree = true;
      for (const candidate of present) {
        if (candidate.rows.length !== rowCount) {
          rowsAgree = false;
          error("CONTENT_LAYER_ROW_MISMATCH", "§7a", entry.display, `${entry.pointer} layer ${JSON.stringify(candidate.layer)} has ${candidate.rows.length} row(s); layer ${JSON.stringify(reference.layer)} has ${rowCount}`, undefined, { diagnostic: "layer-row-mismatch", record: recordLabel(collection, record), field: candidate.layer });
        }
      }
      if (rowCount < 1) {
        error("CONTENT_LAYER_ROW_MISMATCH", "§7a", entry.display, `${entry.pointer} grid has zero rows; every collection-record grid is at least 1×1`, undefined, { diagnostic: "layer-row-mismatch", record: recordLabel(collection, record), field: reference.layer });
        continue;
      }
      if (!rowsAgree) continue;
      const columns = [...reference.rows[0]].length;
      for (const candidate of present) {
        candidate.rows.forEach((row, rowIndex) => {
          const width = [...row].length;
          if (width !== columns || width < 1) {
            error("CONTENT_LAYER_COLUMN_MISMATCH", "§7a", entry.display, `${entry.pointer} layer ${JSON.stringify(candidate.layer)} row ${rowIndex} has ${width} column(s); the record's grid is ${columns} wide`, undefined, { diagnostic: "layer-column-mismatch", record: recordLabel(collection, record), field: candidate.layer, row: rowIndex });
          }
        });
      }
    }
  }

  function recordLabel(collection, record) {
    const field = collection?.id_field;
    const value = typeof field === "string" ? record?.[field] : undefined;
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  }

  function validateContent(packageRoot, manifest, resolvePath, questionsById) {
    const context = { collections: new Map(), stateSets: new Map(), stateNumbers: new Set(), documents: [] };
    if (!Array.isArray(manifest?.content)) return context;
    const collectionIds = new Set();

    for (let index = 0; index < manifest.content.length; index += 1) {
      const collection = manifest.content[index];
      if (!isObject(collection)) continue;
      const id = collection.id;
      if (typeof id === "string") {
        if (collectionIds.has(id)) error("CONTENT_COLLECTION_ID_DUPLICATE", "§1b", "manifest.json", `content collection id ${JSON.stringify(id)} is duplicated`);
        collectionIds.add(id);
      }
      const definedIn = validateDefinedIn(collection.defined_in, resolvePath);
      const docs = [];
      const recordEntries = [];
      const source = collection.source;

      if (isObject(source) && source.type === "catalog" && typeof source.file === "string") {
        const file = resolvePath(source.file, `content[${index}].source.file`, "§1b", "CONTENT_SOURCE_MISSING", { mustExist: true, kind: "file" });
        if (file) {
          const data = parseJsonFile(file, slash(source.file), "§1b", "CONTENT_JSON");
          if (data !== undefined) {
            docs.push({ file, display: slash(source.file), data });
            let records;
            if (Array.isArray(data)) records = data;
            else if (isObject(data) && Array.isArray(data[id])) records = data[id];
            else if (isObject(data)) {
              const candidateArrays = Object.values(data).filter(value => Array.isArray(value) && value.every(isObject));
              if (candidateArrays.length === 1) records = candidateArrays[0];
            }
            if (!Array.isArray(records)) {
              error("CONTENT_CATALOG_RECORDS", "§1b", slash(source.file), `cannot mechanically identify records for catalog collection ${JSON.stringify(id)}`);
            } else {
              records.forEach((record, recordIndex) => recordEntries.push({ record, display: slash(source.file), pointer: `#/${pointerEscape(id)}/${recordIndex}` }));
            }
          }
        }
      } else if (isObject(source) && source.type === "items" && typeof source.directory === "string" && Array.isArray(source.members)) {
        const directory = resolvePath(source.directory, `content[${index}].source.directory`, "§1b", "CONTENT_SOURCE_MISSING", { mustExist: true, kind: "directory" });
        for (const member of source.members) {
          if (typeof member !== "string") continue;
          const combined = path.join(source.directory, member);
          const file = resolvePath(combined, `content[${index}] member`, "§1b", "CONTENT_MEMBER_MISSING", {
            mustExist: true, kind: "file", within: directory
          });
          if (!file) continue;
          const display = slash(combined);
          const data = parseJsonFile(file, display, "§1b", "CONTENT_JSON");
          if (data !== undefined) {
            docs.push({ file, display, data });
            recordEntries.push({ record: data, display, pointer: "#" });
          }
        }
      }

      const stableIds = new Map();
      for (const entry of recordEntries) {
        if (!isObject(entry.record)) {
          error("CONTENT_RECORD_SHAPE", "§1b", entry.display, `${entry.pointer} collection record must be an object`);
          continue;
        }
        const field = collection.id_field;
        if (typeof field !== "string" || !own(entry.record, field) || (typeof entry.record[field] !== "string" && typeof entry.record[field] !== "number") || String(entry.record[field]).length === 0) {
          error("CONTENT_ID_MEMBER", "§1b", entry.display, `${entry.pointer} must carry a non-empty stable ${JSON.stringify(field)} field`);
          continue;
        }
        const stable = `${typeof entry.record[field]}:${String(entry.record[field])}`;
        if (stableIds.has(stable)) {
          error("CONTENT_ID_DUPLICATE", "§1b", entry.display, `stable id ${JSON.stringify(entry.record[field])} duplicates ${stableIds.get(stable)}`);
        } else stableIds.set(stable, `${entry.display}${entry.pointer}`);
      }

      validateGridLayers(collection, recordEntries);

      const allIds = new Set();
      for (const doc of docs) {
        for (const itemId of collectIds(doc.data)) allIds.add(itemId);
        walk(doc.data, (value, pointer, ancestors) => {
          if (isObject(value) && own(value, "authority")) validateAuthority(value.authority, doc.display, pointer, questionsById);
        });
      }

      const info = { collection, definedIn, docs, records: recordEntries, allIds };
      if (typeof id === "string") context.collections.set(id, info);
      context.documents.push(...docs.map(doc => ({ ...doc, collection: info })));
    }

    // Defining prose sections may declare state bindings used by structured expressions.
    for (const info of context.collections.values()) {
      const text = info.definedIn?.text ?? "";
      for (const match of text.matchAll(/state:number:([a-zA-Z0-9_.-]+)/g)) context.stateNumbers.add(match[1]);
      const registryIds = new Set();
      const registryMatch = /members\s+are\s+exactly\s+the\s+`id`\s+values\s+in\s+`([^`]+\.json)\.([A-Za-z_][A-Za-z0-9_]*)`/i.exec(text);
      if (registryMatch) {
        const registryDoc = info.docs.find(doc => slash(doc.display).endsWith(slash(registryMatch[1])) || path.basename(doc.display) === path.basename(registryMatch[1]));
        const records = registryDoc?.data?.[registryMatch[2]];
        if (Array.isArray(records)) {
          for (const record of records) if (isObject(record) && (typeof record.id === "string" || typeof record.id === "number")) registryIds.add(String(record.id));
        }
      }
      const stateMembers = registryIds.size ? registryIds : info.allIds;
      for (const match of text.matchAll(/state:member:([a-zA-Z0-9_.-]+):/g)) context.stateSets.set(match[1], stateMembers);
    }
    const allContentIds = new Set([...context.collections.values()].flatMap(info => [...info.allIds]));
    for (const entry of host.readDir(packageRoot)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const text = host.readText(path.join(packageRoot, entry.name));
      for (const match of text.matchAll(/state:number:([a-zA-Z0-9_.-]+)/g)) context.stateNumbers.add(match[1]);
      for (const match of text.matchAll(/state:member:([a-zA-Z0-9_.-]+):/g)) {
        if (!context.stateSets.has(match[1])) context.stateSets.set(match[1], allContentIds);
      }
    }
    return context;
  }

  function jsonPointerGet(root, pointer) {
    if (pointer === "") return root;
    if (!pointer.startsWith("/")) return undefined;
    let value = root;
    for (const raw of pointer.slice(1).split("/")) {
      const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
      if ((isObject(value) || Array.isArray(value)) && own(value, token)) value = value[token];
      else return undefined;
    }
    return value;
  }

  function referenceInfo(ref, context, file, pointer) {
    const tuningPrefix = "tuning:";
    if (ref.startsWith(tuningPrefix)) {
      const key = ref.slice(tuningPrefix.length);
      if (!context.tuning.has(key)) {
        error("EXPR_REFERENCE", "§4a", file, `${pointer} has unresolved tuning reference ${JSON.stringify(ref)}`);
        return { type: "number", available: false, reference: true };
      }
      return { type: "number", value: context.tuning.get(key), available: true, reference: true };
    }
    // The `knob:<name>` scheme is scoped to a contract core's own invariants —
    // a core is authored before any instance exists, so it cannot name
    // `tuning:contracts.<instance>.<knob>`. The context carries `knobs` only
    // there, so the scheme stays illegal in every other expression position.
    const knobRef = /^knob:(.+)$/.exec(ref);
    if (knobRef && context.knobs instanceof Map) {
      if (!context.knobs.has(knobRef[1])) return { type: "number", available: false, reference: true };
      return { type: "number", value: context.knobs.get(knobRef[1]), available: true, reference: true };
    }
    const stateNumber = /^state:number:([^:]+)$/.exec(ref);
    if (stateNumber) {
      if (!context.stateNumbers.has(stateNumber[1])) error("EXPR_REFERENCE", "§4a", file, `${pointer} has undeclared runtime-number reference ${JSON.stringify(ref)}`);
      return { type: "number", available: false, reference: true };
    }
    const stateMember = /^state:member:([^:]+):(.+)$/.exec(ref);
    if (stateMember) {
      const members = context.stateSets.get(stateMember[1]);
      if (!members || !members.has(stateMember[2])) error("EXPR_REFERENCE", "§4a", file, `${pointer} has unresolved runtime-set reference ${JSON.stringify(ref)}`);
      return { type: "boolean", available: false, reference: true };
    }
    const contentCount = /^content:([^:]+):(.*):count$/.exec(ref);
    if (contentCount) {
      const info = context.collections.get(contentCount[1]);
      if (!info) {
        error("EXPR_REFERENCE", "§4a", file, `${pointer} names unknown content collection ${JSON.stringify(contentCount[1])}`);
        return { type: "number", available: false, reference: true };
      }
      if (info.docs.length !== 1 || info.collection.source?.type !== "catalog") {
        error("EXPR_REFERENCE", "§4a", file, `${pointer} content count is not mechanically resolvable against a one-file catalog: ${JSON.stringify(ref)}`);
        return { type: "number", available: false, reference: true };
      }
      const target = jsonPointerGet(info.docs[0].data, contentCount[2]);
      if (!Array.isArray(target)) {
        error("EXPR_REFERENCE", "§4a", file, `${pointer} content count does not resolve to an array: ${JSON.stringify(ref)}`);
        return { type: "number", available: false, reference: true };
      }
      return { type: "number", value: target.length, available: true, reference: true };
    }
    error("EXPR_REFERENCE", "§4a", file, `${pointer} has invalid or unsupported typed reference ${JSON.stringify(ref)}`);
    return { type: "unknown", available: false, reference: true };
  }

  const OPERATORS = {
    and: { arity: "many", inputs: "boolean", output: "boolean" },
    or: { arity: "many", inputs: "boolean", output: "boolean" },
    all: { arity: "many", inputs: "boolean", output: "boolean" },
    any: { arity: "many", inputs: "boolean", output: "boolean" },
    not: { arity: 1, inputs: "boolean", output: "boolean" },
    eq: { arity: 2, inputs: "same", output: "boolean" },
    ne: { arity: 2, inputs: "same", output: "boolean" },
    lt: { arity: 2, inputs: "number", output: "boolean" },
    lte: { arity: 2, inputs: "number", output: "boolean" },
    gt: { arity: 2, inputs: "number", output: "boolean" },
    gte: { arity: 2, inputs: "number", output: "boolean" },
    add: { arity: "many", inputs: "number", output: "number" },
    mul: { arity: "many", inputs: "number", output: "number" },
    min: { arity: "many", inputs: "number", output: "number" },
    max: { arity: "many", inputs: "number", output: "number" },
    sum: { arity: "many", inputs: "number", output: "number" },
    sub: { arity: 2, inputs: "number", output: "number" },
    div: { arity: 2, inputs: "number", output: "number" },
    pow: { arity: 2, inputs: "number", output: "number" },
    mod: { arity: 2, inputs: "number", output: "number" },
    floor: { arity: 1, inputs: "number", output: "number" },
    ceil: { arity: 1, inputs: "number", output: "number" },
    abs: { arity: 1, inputs: "number", output: "number" },
    "strictly-increasing": { arity: "many", inputs: "number", output: "boolean", refsOnly: true },
    nondecreasing: { arity: "many", inputs: "number", output: "boolean", refsOnly: true },
    "all-positive": { arity: "many", inputs: "number", output: "boolean", refsOnly: true }
  };

  function evaluateOperator(op, values) {
    if (op === "and" || op === "all") return values.every(Boolean);
    if (op === "or" || op === "any") return values.some(Boolean);
    if (op === "not") return !values[0];
    if (op === "eq") return values[0] === values[1];
    if (op === "ne") return values[0] !== values[1];
    if (op === "lt") return values[0] < values[1];
    if (op === "lte") return values[0] <= values[1];
    if (op === "gt") return values[0] > values[1];
    if (op === "gte") return values[0] >= values[1];
    if (op === "add" || op === "sum") return values.reduce((a, b) => a + b, 0);
    if (op === "mul") return values.reduce((a, b) => a * b, 1);
    if (op === "min") return Math.min(...values);
    if (op === "max") return Math.max(...values);
    if (op === "sub") return values[0] - values[1];
    if (op === "div") return values[0] / values[1];
    if (op === "pow") return values[0] ** values[1];
    if (op === "mod") return values[0] - values[1] * Math.floor(values[0] / values[1]);
    if (op === "floor") return Math.floor(values[0]);
    if (op === "ceil") return Math.ceil(values[0]);
    if (op === "abs") return Math.abs(values[0]);
    if (op === "strictly-increasing") return values.every((value, index) => index === 0 || values[index - 1] < value);
    if (op === "nondecreasing") return values.every((value, index) => index === 0 || values[index - 1] <= value);
    if (op === "all-positive") return values.every(value => value > 0);
    return undefined;
  }

  function validateExprNode(node, context, file, pointer) {
    if (typeof node === "boolean" || typeof node === "string") return { type: typeof node, value: node, available: true, reference: false };
    if (typeof node === "number") {
      if (!Number.isFinite(node)) error("EXPR_LITERAL", "§4a", file, `${pointer} numeric literal must be finite`);
      return { type: "number", value: node, available: Number.isFinite(node), reference: false };
    }
    if (!isObject(node)) {
      error("EXPR_NODE", "§4a", file, `${pointer} is not a legal expression node`);
      return { type: "unknown", available: false, reference: false };
    }
    const keys = Object.keys(node).sort();
    if (keys.length === 1 && keys[0] === "ref" && typeof node.ref === "string") {
      return referenceInfo(node.ref, context, file, pointer);
    }
    if (keys.length !== 2 || keys[0] !== "args" || keys[1] !== "op" || typeof node.op !== "string" || !Array.isArray(node.args)) {
      error("EXPR_NODE", "§4a", file, `${pointer} object must contain exactly ref, or exactly op and args`);
      return { type: "unknown", available: false, reference: false };
    }
    const signature = OPERATORS[node.op];
    if (!signature) {
      error("EXPR_OPERATOR", "§4a", file, `${pointer} uses unknown operator ${JSON.stringify(node.op)}`);
      return { type: "unknown", available: false, reference: false };
    }
    if ((signature.arity === "many" && node.args.length < 1) || (typeof signature.arity === "number" && node.args.length !== signature.arity)) {
      error("EXPR_ARITY", "§4a", file, `${pointer} operator ${node.op} has wrong arity (${node.args.length})`);
    }
    const args = node.args.map((arg, index) => validateExprNode(arg, context, file, `${pointer}/args/${index}`));
    if (signature.refsOnly && args.some(arg => !arg.reference)) {
      error("EXPR_REFERENCE_LIST", "§4a", file, `${pointer} operator ${node.op} accepts only explicit numeric references`);
    }
    if (signature.inputs === "same" && args.length === 2 && args[0].type !== "unknown" && args[1].type !== "unknown" && args[0].type !== args[1].type) {
      error("EXPR_TYPE", "§4a", file, `${pointer} operator ${node.op} requires two values of the same type`);
    } else if (signature.inputs !== "same") {
      args.forEach((arg, index) => {
        if (arg.type !== "unknown" && arg.type !== signature.inputs) {
          error("EXPR_TYPE", "§4a", file, `${pointer}/args/${index} must be ${signature.inputs} for ${node.op}, got ${arg.type}`);
        }
      });
    }
    const available = args.length > 0 && args.every(arg => arg.available);
    if (!available) return { type: signature.output, available: false, reference: false };
    const values = args.map(arg => arg.value);
    if ((node.op === "div" || node.op === "mod") && values[1] === 0) {
      error("EXPR_DOMAIN", "§4a", file, `${pointer} performs ${node.op} by zero`);
      return { type: signature.output, available: false, reference: false };
    }
    let value;
    try { value = evaluateOperator(node.op, values); } catch { value = Number.NaN; }
    if (signature.output === "number" && !Number.isFinite(value)) {
      error("EXPR_DOMAIN", "§4a", file, `${pointer} produces a non-finite or invalid real-number result`);
      return { type: signature.output, available: false, reference: false };
    }
    return { type: signature.output, value, available: true, reference: false };
  }

  function validateNamedExpression(expression, context, file, pointer, requireTrue) {
    if (!isObject(expression)) {
      error("EXPR_DECLARATION", "§4a", file, `${pointer} must be an expression declaration object`);
      return;
    }
    const required = ["language", "id", "assert", "message"];
    for (const key of required) if (!own(expression, key)) error("EXPR_DECLARATION", "§4a", file, `${pointer} is missing ${key}`);
    for (const key of Object.keys(expression)) if (!required.includes(key)) error("EXPR_DECLARATION", "§4a", file, `${pointer}/${pointerEscape(key)} is outside the closed declaration shape`);
    if (expression.language !== "opengdd-expr-1") error("EXPR_LANGUAGE", "§4a", file, `${pointer} language must be "opengdd-expr-1"`);
    if (typeof expression.id !== "string" || !expression.id) error("EXPR_DECLARATION", "§4a", file, `${pointer} id must be a non-empty string`);
    if (typeof expression.message !== "string" || !expression.message) error("EXPR_DECLARATION", "§4a", file, `${pointer} message must be a non-empty string`);
    if (!own(expression, "assert")) return;
    const result = validateExprNode(expression.assert, context, file, `${pointer}/assert`);
    if (result.type !== "unknown" && result.type !== "boolean") error("EXPR_ASSERT_TYPE", "§4a", file, `${pointer}/assert must return Boolean, got ${result.type}`);
    if (requireTrue && result.available && result.type === "boolean" && result.value !== true) {
      error("TUNING_INVARIANT_FALSE", "§4", file, `${pointer} invariant ${JSON.stringify(expression.id)} evaluates false at package defaults`);
    }
  }

  // §1c: declared edge sets. Extraction, unconditional existence-completeness, and
  // the three `opengdd-graph-1` predicates a §6 document-check AT may cite.
  const GRAPH_RULE_FIELDS = {
    "acyclic": ["predicate", "edge_set"],
    "reciprocal": ["predicate", "edge_set", "exemptions"],
    "monotone-attribute-along-path": ["predicate", "edge_set", "attribute", "trend"]
  };
  const GRAPH_TRENDS = new Set(["target-at-least-source", "target-at-most-source"]);

  function graphNodeKey(collection, id) {
    return `${collection}\u0000${id}`;
  }

  function graphEdgeKey(fromKey, toKey) {
    return `${fromKey}\u0001${toKey}`;
  }

  function graphFieldValue(root, field) {
    if (typeof field !== "string" || !field.length) return undefined;
    if (!field.startsWith("/")) return isObject(root) && own(root, field) ? root[field] : undefined;
    return jsonPointerGet(root, field);
  }

  function graphFieldSites(record, field) {
    const tokens = typeof field === "string" && field.startsWith("/") ? field.split("/") : [];
    const wildcard = tokens.indexOf("*");
    if (wildcard < 0) return [{ container: record, value: graphFieldValue(record, field), pointer: field }];
    const prefix = tokens.slice(0, wildcard).join("/");
    const suffix = tokens.slice(wildcard + 1).join("/");
    const array = prefix === "" ? record : jsonPointerGet(record, prefix);
    if (!Array.isArray(array)) return [];
    return array.map((element, index) => ({
      container: element,
      value: suffix ? jsonPointerGet(element, `/${suffix}`) : element,
      pointer: `${prefix}/${index}${suffix ? `/${suffix}` : ""}`
    }));
  }

  function graphRecordIndex(info) {
    if (!info.recordIndex) {
      const index = new Map();
      const field = info.collection?.id_field;
      for (const entry of info.records) {
        if (!isObject(entry.record) || typeof field !== "string") continue;
        const value = entry.record[field];
        if (typeof value !== "string" && typeof value !== "number") continue;
        const id = String(value);
        if (!index.has(id)) index.set(id, entry);
      }
      info.recordIndex = index;
    }
    return info.recordIndex;
  }

  function graphSiteIds(value, file, label) {
    if (value === undefined || value === null) return [];
    const raw = Array.isArray(value) ? value : [value];
    const ids = [];
    for (const item of raw) {
      if (typeof item !== "string" || !item.length) {
        error("GRAPH_EDGE_TYPE", "§1c", file, `${label} must hold non-empty string ids; got ${JSON.stringify(item)}`, undefined, { diagnostic: "edge-type" });
        continue;
      }
      ids.push(item);
    }
    return ids;
  }

  function graphResolveSource(targetId, fromCollections, contentContext) {
    const matches = [];
    for (const collection of fromCollections) {
      const info = contentContext.collections.get(collection);
      if (info && graphRecordIndex(info).has(targetId)) matches.push(collection);
    }
    return matches;
  }

  function buildGraphContext(manifest, contentContext) {
    const sets = new Map();
    if (!Array.isArray(manifest?.graphs)) return { sets, contentContext };
    for (const set of manifest.graphs) {
      if (!isObject(set) || typeof set.id !== "string" || !Array.isArray(set.edges)) continue;
      const edges = [];
      const fromCollections = new Set();
      const toCollections = new Set();
      set.edges.forEach((edge, edgeIndex) => {
        if (!isObject(edge) || !isObject(edge.from) || typeof edge.from.collection !== "string") return;
        if (typeof edge.field !== "string" || !Array.isArray(edge.to)) return;
        const targets = edge.to.filter(target => isObject(target) && typeof target.collection === "string").map(target => target.collection);
        fromCollections.add(edge.from.collection);
        for (const target of targets) toCollections.add(target);
        const source = contentContext.collections.get(edge.from.collection);
        if (!source) return;
        const idMember = source.collection?.id_field;
        for (const entry of source.records) {
          if (!isObject(entry.record) || typeof idMember !== "string") continue;
          const rawId = entry.record[idMember];
          if (typeof rawId !== "string" && typeof rawId !== "number") continue;
          const sourceId = String(rawId);
          const label = `${entry.pointer} graph ${JSON.stringify(set.id)} field ${JSON.stringify(edge.field)}`;
          for (const site of graphFieldSites(entry.record, edge.field)) {
            const seen = new Set();
            for (const targetId of graphSiteIds(site.value, entry.display, label)) {
              if (seen.has(targetId)) {
                warning("GRAPH_EDGE_DUPLICATE_ID", "§1c", entry.display, `${label} repeats target id ${JSON.stringify(targetId)}; the repetition contributes one edge`, undefined, { diagnostic: "duplicate-edge", record: sourceId, field: edge.field, value: targetId });
                continue;
              }
              seen.add(targetId);
              let permitted = targets;
              if (typeof edge.discriminator === "string") {
                const raw = graphFieldValue(site.container, edge.discriminator);
                const mapped = isObject(edge.discriminator_map) && typeof raw === "string" ? edge.discriminator_map[raw] : raw;
                if (typeof mapped !== "string" || !targets.includes(mapped)) {
                  error("GRAPH_DISCRIMINATOR_UNMAPPED", "§1c", entry.display, `${label} discriminator ${JSON.stringify(edge.discriminator)} value ${JSON.stringify(raw)} does not name a permitted target collection`, undefined, { diagnostic: "discriminator-unmapped", record: sourceId, field: edge.field, value: targetId });
                  continue;
                }
                permitted = [mapped];
              }
              const matches = graphResolveSource(targetId, permitted, contentContext);
              if (matches.length === 0) {
                error("GRAPH_EDGE_DANGLING", "§1c", entry.display, `${label} references ${JSON.stringify(targetId)}, which is not a collection record in ${permitted.map(name => JSON.stringify(name)).join(", ")}`, undefined, { diagnostic: "dangling-edge", record: sourceId, field: edge.field, value: targetId });
                continue;
              }
              if (matches.length > 1) {
                error("GRAPH_EDGE_AMBIGUOUS", "§1c", entry.display, `${label} references ${JSON.stringify(targetId)}, which exists in more than one permitted target collection (${matches.join(", ")}); the site needs a discriminator`, undefined, { diagnostic: "ambiguous-edge", record: sourceId, field: edge.field, value: targetId });
                continue;
              }
              edges.push({
                fromCollection: edge.from.collection,
                fromId: sourceId,
                fromKey: graphNodeKey(edge.from.collection, sourceId),
                toCollection: matches[0],
                toId: targetId,
                toKey: graphNodeKey(matches[0], targetId),
                field: edge.field,
                display: entry.display,
                edgeIndex
              });
            }
          }
        }
      });
      sets.set(set.id, {
        set,
        edges,
        fromCollections: [...fromCollections],
        toCollections: [...toCollections],
        collections: [...new Set([...fromCollections, ...toCollections])],
        inverse: isObject(set.inverse) && typeof set.inverse.field === "string" ? set.inverse.field : undefined
      });
    }
    return { sets, contentContext };
  }

  function graphFindCycle(edges) {
    const adjacency = new Map();
    const labels = new Map();
    for (const edge of edges) {
      if (!adjacency.has(edge.fromKey)) adjacency.set(edge.fromKey, []);
      adjacency.get(edge.fromKey).push(edge.toKey);
      labels.set(edge.fromKey, edge.fromId);
      labels.set(edge.toKey, edge.toId);
    }
    const color = new Map();
    for (const root of adjacency.keys()) {
      if (color.get(root)) continue;
      color.set(root, 1);
      const stack = [{ node: root, next: 0 }];
      while (stack.length) {
        const frame = stack[stack.length - 1];
        const neighbors = adjacency.get(frame.node) ?? [];
        if (frame.next >= neighbors.length) {
          color.set(frame.node, 2);
          stack.pop();
          continue;
        }
        const next = neighbors[frame.next];
        frame.next += 1;
        if (color.get(next) === 1) {
          const start = stack.findIndex(item => item.node === next);
          return [...stack.slice(start).map(item => labels.get(item.node)), labels.get(next)];
        }
        if (!color.get(next)) {
          color.set(next, 1);
          stack.push({ node: next, next: 0 });
        }
      }
    }
    return undefined;
  }

  function evaluateGraphAcyclic(info, setId, id, file, line) {
    const cycle = graphFindCycle(info.edges);
    if (!cycle) return;
    error("GRAPH_ACYCLIC", "§1c", file, `${id} edge set ${JSON.stringify(setId)} is not acyclic: ${cycle.join(" → ")}`, line, { diagnostic: "cycle", edge_set: setId, cycle });
  }

  function evaluateGraphReciprocal(rule, info, setId, ctx, id, file, line) {
    if (!info.inverse) {
      error("GRAPH_RULE_INVALID", "§1c", file, `${id} reciprocal rule cites edge set ${JSON.stringify(setId)}, which declares no inverse back-pointer field`, line, { diagnostic: "rule-invalid", edge_set: setId });
      return;
    }
    const exempt = new Set();
    if (Array.isArray(rule.exemptions)) {
      rule.exemptions.forEach((entry, index) => {
        if (!isObject(entry) || typeof entry.collection !== "string" || typeof entry.id !== "string") {
          error("GRAPH_RULE_INVALID", "§1c", file, `${id} reciprocal exemptions[${index}] must name a collection and a record id`, line, { diagnostic: "rule-invalid", edge_set: setId });
          return;
        }
        if (!info.collections.includes(entry.collection)) {
          error("GRAPH_RULE_INVALID", "§1c", file, `${id} reciprocal exemptions[${index}] names collection ${JSON.stringify(entry.collection)}, which edge set ${JSON.stringify(setId)} does not touch`, line, { diagnostic: "rule-invalid", edge_set: setId });
          return;
        }
        exempt.add(graphNodeKey(entry.collection, entry.id));
      });
    }
    const pairs = new Map();
    const forward = new Map();
    const backward = new Map();
    for (const edge of info.edges) {
      if (exempt.has(edge.fromKey) || exempt.has(edge.toKey)) continue;
      const key = graphEdgeKey(edge.fromKey, edge.toKey);
      pairs.set(key, { fromId: edge.fromId, toId: edge.toId });
      forward.set(key, (forward.get(key) ?? 0) + 1);
    }
    for (const collection of info.toCollections) {
      const target = ctx.contentContext.collections.get(collection);
      if (!target) continue;
      const idMember = target.collection?.id_field;
      for (const entry of target.records) {
        if (!isObject(entry.record) || typeof idMember !== "string") continue;
        const rawId = entry.record[idMember];
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const targetId = String(rawId);
        const targetKey = graphNodeKey(collection, targetId);
        if (exempt.has(targetKey)) continue;
        const label = `${entry.pointer} graph ${JSON.stringify(setId)} inverse field ${JSON.stringify(info.inverse)}`;
        for (const site of graphFieldSites(entry.record, info.inverse)) {
          const seen = new Set();
          for (const sourceId of graphSiteIds(site.value, entry.display, label)) {
            if (seen.has(sourceId)) {
              warning("GRAPH_EDGE_DUPLICATE_ID", "§1c", entry.display, `${label} repeats source id ${JSON.stringify(sourceId)}; the repetition contributes one edge`, undefined, { diagnostic: "duplicate-edge", record: targetId, field: info.inverse, value: sourceId });
              continue;
            }
            seen.add(sourceId);
            const matches = graphResolveSource(sourceId, info.fromCollections, ctx.contentContext);
            if (matches.length === 0) {
              error("GRAPH_RECIPROCAL", "§1c", file, `${id} back-pointer on ${JSON.stringify(targetId)} names ${JSON.stringify(sourceId)}, which is not a collection record in ${info.fromCollections.join(", ")}`, line, { diagnostic: "dangling-back-pointer", edge_set: setId, record: targetId, field: info.inverse, value: sourceId, file: entry.display });
              continue;
            }
            if (matches.length > 1) {
              error("GRAPH_EDGE_AMBIGUOUS", "§1c", file, `${id} back-pointer on ${JSON.stringify(targetId)} names ${JSON.stringify(sourceId)}, which exists in more than one source collection (${matches.join(", ")})`, line, { diagnostic: "ambiguous-edge", edge_set: setId, record: targetId, field: info.inverse, value: sourceId, file: entry.display });
              continue;
            }
            const sourceKey = graphNodeKey(matches[0], sourceId);
            if (exempt.has(sourceKey)) continue;
            const key = graphEdgeKey(sourceKey, targetKey);
            pairs.set(key, { fromId: sourceId, toId: targetId });
            backward.set(key, (backward.get(key) ?? 0) + 1);
          }
        }
      }
    }
    for (const [key, pair] of pairs) {
      const forwardCount = forward.get(key) ?? 0;
      const backwardCount = backward.get(key) ?? 0;
      if (forwardCount > 1 || backwardCount > 1) {
        error("GRAPH_RECIPROCAL", "§1c", file, `${id} edge ${JSON.stringify(pair.fromId)} → ${JSON.stringify(pair.toId)} is declared ${forwardCount} time(s) forward and ${backwardCount} time(s) as a back-pointer; a bijection admits one of each`, line, { diagnostic: "duplicate-edge", edge_set: setId, from: pair.fromId, to: pair.toId, forward: forwardCount, backward: backwardCount });
      } else if (forwardCount === 1 && backwardCount === 0) {
        error("GRAPH_RECIPROCAL", "§1c", file, `${id} forward edge ${JSON.stringify(pair.fromId)} → ${JSON.stringify(pair.toId)} has no matching ${JSON.stringify(info.inverse)} back-pointer`, line, { diagnostic: "one-way-edge", edge_set: setId, from: pair.fromId, to: pair.toId });
      } else if (backwardCount === 1 && forwardCount === 0) {
        error("GRAPH_RECIPROCAL", "§1c", file, `${id} back-pointer ${JSON.stringify(pair.toId)} → ${JSON.stringify(pair.fromId)} has no matching forward edge ${JSON.stringify(pair.fromId)} → ${JSON.stringify(pair.toId)}`, line, { diagnostic: "one-way-edge", edge_set: setId, from: pair.fromId, to: pair.toId });
      }
    }
  }

  function evaluateGraphMonotone(rule, info, setId, ctx, id, file, line) {
    const attribute = rule.attribute;
    const fields = new Map();
    if (isObject(attribute) && typeof attribute.field === "string") {
      for (const collection of info.collections) fields.set(collection, attribute.field);
    } else if (isObject(attribute) && isObject(attribute.fields)) {
      for (const collection of info.collections) {
        const field = attribute.fields[collection];
        if (typeof field !== "string" || !field.length) {
          error("GRAPH_RULE_INVALID", "§1c", file, `${id} attribute.fields must name a field for every collection edge set ${JSON.stringify(setId)} touches; ${JSON.stringify(collection)} is missing`, line, { diagnostic: "rule-invalid", edge_set: setId });
          continue;
        }
        fields.set(collection, field);
      }
    } else {
      error("GRAPH_RULE_INVALID", "§1c", file, `${id} monotone-attribute-along-path rule requires attribute as {"field": <name>} or {"fields": {<collection>: <name>}}`, line, { diagnostic: "rule-invalid", edge_set: setId });
      return;
    }
    if (!GRAPH_TRENDS.has(rule.trend)) {
      error("GRAPH_RULE_INVALID", "§1c", file, `${id} monotone-attribute-along-path trend must be "target-at-least-source" or "target-at-most-source"`, line, { diagnostic: "rule-invalid", edge_set: setId });
      return;
    }
    const values = new Map();
    for (const collection of info.collections) {
      const field = fields.get(collection);
      const target = ctx.contentContext.collections.get(collection);
      if (!field || !target) continue;
      const idMember = target.collection?.id_field;
      for (const entry of target.records) {
        if (!isObject(entry.record) || typeof idMember !== "string") continue;
        const rawId = entry.record[idMember];
        if (typeof rawId !== "string" && typeof rawId !== "number") continue;
        const recordId = String(rawId);
        const value = graphFieldValue(entry.record, field);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          error("GRAPH_MONOTONE", "§1c", file, `${id} collection record ${JSON.stringify(recordId)} in ${JSON.stringify(collection)} has a missing or non-numeric ${JSON.stringify(field)} attribute`, line, { diagnostic: "missing-attribute", edge_set: setId, collection, record: recordId, field: field, file: entry.display });
          continue;
        }
        values.set(graphNodeKey(collection, recordId), value);
      }
    }
    for (const edge of info.edges) {
      const from = values.get(edge.fromKey);
      const to = values.get(edge.toKey);
      if (typeof from !== "number" || typeof to !== "number") continue;
      const holds = rule.trend === "target-at-least-source" ? from <= to : from >= to;
      if (holds) continue;
      const relation = rule.trend === "target-at-least-source" ? "<=" : ">=";
      error("GRAPH_MONOTONE", "§1c", file, `${id} edge ${JSON.stringify(edge.fromId)} → ${JSON.stringify(edge.toId)} violates ${rule.trend}: ${from} ${relation} ${to} is false`, line, { diagnostic: "monotonicity-violation", edge_set: setId, from: edge.fromId, to: edge.toId, from_value: from, to_value: to });
    }
  }

  function validateGraphRule(rule, index, ctx, id, file, line) {
    const label = `${id} rules[${index}]`;
    if (!isObject(rule)) {
      error("GRAPH_RULE_INVALID", "§1c", file, `${label} must be a rule object`, line, { diagnostic: "rule-invalid" });
      return;
    }
    const allowed = GRAPH_RULE_FIELDS[rule.predicate];
    if (!allowed) {
      error("GRAPH_RULE_INVALID", "§1c", file, `${label} names unknown opengdd-graph-1 predicate ${JSON.stringify(rule.predicate)}`, line, { diagnostic: "rule-invalid" });
      return;
    }
    for (const key of Object.keys(rule)) {
      if (!allowed.includes(key)) error("GRAPH_RULE_INVALID", "§1c", file, `${label} carries ${JSON.stringify(key)}, which is outside the ${rule.predicate} field list`, line, { diagnostic: "rule-invalid" });
    }
    const setId = rule.edge_set;
    if (typeof setId !== "string" || !ctx.sets.has(setId)) {
      error("GRAPH_RULE_INVALID", "§1c", file, `${label} edge_set ${JSON.stringify(setId)} does not name a declared manifest graph`, line, { diagnostic: "rule-invalid" });
      return;
    }
    const info = ctx.sets.get(setId);
    if (rule.predicate === "acyclic") evaluateGraphAcyclic(info, setId, label, file, line);
    else if (rule.predicate === "reciprocal") evaluateGraphReciprocal(rule, info, setId, ctx, label, file, line);
    else evaluateGraphMonotone(rule, info, setId, ctx, label, file, line);
  }

  function validateManifestConstructs(manifest, contentContext) {
    const rulesetIds = new Set();
    if (!isObject(manifest)) return { rulesetIds, graphContext: { sets: new Map(), contentContext } };
    const collectionIds = new Set();
    if (Array.isArray(manifest.content)) {
      for (const entry of manifest.content) if (isObject(entry) && typeof entry.id === "string") collectionIds.add(entry.id);
    }
    if (Array.isArray(manifest.graphs)) {
      const edgeSetIds = new Set();
      manifest.graphs.forEach((set, index) => {
        if (!isObject(set)) return;
        if (typeof set.id === "string") {
          if (edgeSetIds.has(set.id)) error("GRAPH_ID_UNIQUE", "§1c", "manifest.json", `graphs[${index}] duplicates edge-set id ${JSON.stringify(set.id)}`);
          edgeSetIds.add(set.id);
        }
        if (Array.isArray(set.edges)) set.edges.forEach((edge, edgeIndex) => {
          if (!isObject(edge)) return;
          const sites = [];
          if (isObject(edge.from) && typeof edge.from.collection === "string") sites.push([edge.from.collection, `edges[${edgeIndex}].from`]);
          if (Array.isArray(edge.to)) edge.to.forEach((target, targetIndex) => {
            if (isObject(target) && typeof target.collection === "string") sites.push([target.collection, `edges[${edgeIndex}].to[${targetIndex}]`]);
          });
          for (const [collection, label] of sites) {
            if (!collectionIds.has(collection)) error("GRAPH_COLLECTION", "§1c", "manifest.json", `graphs[${index}].${label} names undeclared collection ${JSON.stringify(collection)}`);
          }
        });
      });
    }
    if (isObject(manifest.ruleset_state) && Array.isArray(manifest.ruleset_state.rulesets)) {
      let initialCount = 0;
      manifest.ruleset_state.rulesets.forEach((entry, index) => {
        if (!isObject(entry)) return;
        if (typeof entry.id === "string") {
          if (rulesetIds.has(entry.id)) error("RULESET_ID_UNIQUE", "§2c", "manifest.json", `ruleset_state.rulesets[${index}] duplicates id ${JSON.stringify(entry.id)}`);
          rulesetIds.add(entry.id);
        }
        if (entry.initial === true) initialCount += 1;
      });
      if (initialCount !== 1) error("RULESET_INITIAL", "§2c", "manifest.json", `ruleset_state.rulesets must mark exactly one initial ruleset; found ${initialCount}`);
    }
    return { rulesetIds, graphContext: buildGraphContext(manifest, contentContext) };
  }

  // §2c deepening: `> RULESET: <id>` chapter tags and `tuning.json` meta.ruleset
  // entries are the declared-id completeness the SPEC's "core check promise" names.
  // meta.ruleset is already checked in validateTuning; this covers prose tags.
  // The five canonical chapter filenames (SPEC §1) plus whatever else the
  // manifest declares as a chapter. Yields readable chapter files only.
  function* chapterTexts(packageRoot, manifest, includePlan = false) {
    const chapters = new Set(["01-overview.md", "02-mechanics.md", "03-content.md", "04-presentation.md", "05-build-plan.md"]);
    for (const declared of manifest?.build?.chapters ?? []) if (typeof declared === "string" && declared.endsWith(".md")) chapters.add(declared);
    if (includePlan && typeof manifest?.build?.plan === "string" && manifest.build.plan.endsWith(".md")) chapters.add(manifest.build.plan);
    for (const chapter of chapters) {
      if (path.isAbsolute(chapter) || chapter.includes("..")) continue;
      const file = path.join(packageRoot, chapter);
      if (!host.exists(file) || !host.isFile(file)) continue;
      yield { chapter, text: host.readText(file) };
    }
  }

  function validateRulesetTags(packageRoot, manifest, rulesetIds) {
    if (rulesetIds.size === 0) return;
    for (const { chapter, text } of chapterTexts(packageRoot, manifest)) {
      for (const item of unfencedLines(text)) {
        const match = /^\s*>\s*RULESET:\s*(\S+)\s*$/.exec(item.text);
        if (!match) continue;
        const id = match[1];
        if (id !== "all" && !rulesetIds.has(id)) {
          error("RULESET_TAG_DANGLING", "§2c", slash(chapter), `> RULESET: ${id} does not name a declared ruleset id`, item.line);
        }
      }
    }
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
    for (const { chapter, text } of chapterTexts(packageRoot, manifest)) {
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

  // SPEC §4b: a chapter mode tag, such as `[TACTICAL]`, MUST name a declared
  // mode id. `all` is the reserved tag value marking a statement authoritative
  // in every mode. Tags are read from heading lines only, and a package that
  // declares no modes declares no tag vocabulary at all, so a bracketed run in
  // one of its headings is ordinary Markdown with nothing to resolve against.
  function validateModeTags(packageRoot, manifest, clocksResult) {
    const modes = clocksResult?.modes;
    if (!modes || modes.size === 0) return;
    for (const { chapter, text } of chapterTexts(packageRoot, manifest, true)) {
      for (const item of unfencedLines(text)) {
        if (!/^\s{0,3}#{1,6}\s/.test(item.text)) continue;
        // A run followed by `(` or `[` is a Markdown link, and an all-digit run
        // is a footnote marker; neither is a tag.
        for (const found of item.text.matchAll(/\[([A-Za-z0-9_-]+)\](?![([])/g)) {
          const tag = found[1];
          if (/^\d+$/.test(tag) || tag === "all" || modes.has(tag)) continue;
          error("MODE_TAG_DANGLING", "§4b", slash(chapter), `chapter mode tag [${tag}] does not name a declared mode id`, item.line);
        }
      }
    }
  }

  const CLOCK_BEHAVIORS = new Set(["advances", "frozen", "discrete-only", "does-not-exist"]);

  function validateClocks(doc) {
    const result = { modes: new Set(), governedBy: new Map(), behaviors: new Map() };
    const clocks = doc.clocks;
    if (!isObject(clocks)) {
      error("CLOCKS_SHAPE", "§4b", "tuning.json", "clocks must be an object with modes and clocks fields");
      return result;
    }
    for (const key of Object.keys(clocks)) if (key !== "modes" && key !== "clocks") error("CLOCKS_SHAPE", "§4b", "tuning.json", `clocks.${key} is not defined by the v0.5 shape`);
    const modeSet = result.modes;
    if (!Array.isArray(clocks.modes) || !clocks.modes.length) {
      error("CLOCKS_REGIMES", "§4b", "tuning.json", "clocks.modes must be a non-empty array of mode ids");
    } else {
      clocks.modes.forEach((mode, index) => {
        if (typeof mode !== "string" || !mode.length) error("CLOCKS_REGIMES", "§4b", "tuning.json", `clocks.modes[${index}] must be a non-empty string`);
        else if (modeSet.has(mode)) error("CLOCKS_REGIMES", "§4b", "tuning.json", `clocks.modes duplicates ${JSON.stringify(mode)}`);
        else {
          // SPEC §4b reserves `all` for the every-mode chapter tag, so no
          // package may declare it as one of its own mode ids.
          if (mode === "all") error("CLOCKS_REGIME_RESERVED", "§4b", "tuning.json", `clocks.modes[${index}] declares the reserved tag value "all"`);
          modeSet.add(mode);
        }
      });
    }
    if (!isObject(clocks.clocks)) {
      error("CLOCKS_SHAPE", "§4b", "tuning.json", "clocks.clocks must be an object of named clocks");
      return result;
    }
    // §4b deepening: `governs` disjointness and behavior-per-mode lookup, used
    // to check a citing AT's `freeze_invariant` for the advances/does-not-exist
    // contradictions the SPEC names.
    for (const [name, clock] of Object.entries(clocks.clocks)) {
      if (!isObject(clock) || !isObject(clock.behavior)) {
        error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name} must declare a behavior object`);
        continue;
      }
      for (const [mode, behavior] of Object.entries(clock.behavior)) {
        if (!modeSet.has(mode)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior names undeclared mode ${JSON.stringify(mode)}`);
        if (!CLOCK_BEHAVIORS.has(behavior)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior[${JSON.stringify(mode)}] must be one of advances, frozen, discrete-only, does-not-exist`);
        result.behaviors.set(`${name} ${mode}`, behavior);
      }
      for (const mode of modeSet) {
        if (!own(clock.behavior, mode)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior must cover declared mode ${JSON.stringify(mode)}`);
      }
      if (Array.isArray(clock.governs)) {
        for (const ref of clock.governs) {
          if (typeof ref !== "string") continue;
          if (result.governedBy.has(ref)) {
            error("CLOCKS_GOVERNS_DISJOINT", "§4b", "tuning.json", `${JSON.stringify(ref)} is governed by both ${result.governedBy.get(ref)} and ${name}; governs lists must be disjoint`);
          } else {
            result.governedBy.set(ref, name);
          }
        }
      }
    }
    return result;
  }

  // §4b deepening: freeze_invariant contradiction/hard-failure rule.
  function validateFreezeInvariant(freezeInvariant, clocksResult, file, pointer, exprContext) {
    if (!isObject(freezeInvariant)) return;
    if (!clocksResult) {
      error("FREEZE_INVARIANT_NO_CLOCKS", "§4b", file, `${pointer} declares freeze_invariant but the package declares no tuning.json clocks block`);
      return;
    }
    const references = Array.isArray(freezeInvariant.references) ? freezeInvariant.references : [];
    const modes = Array.isArray(freezeInvariant.modes) ? freezeInvariant.modes : [];
    if (!references.length) error("FREEZE_INVARIANT_SHAPE", "§4b", file, `${pointer} freeze_invariant.references must be a non-empty array`);
    if (!modes.length) error("FREEZE_INVARIANT_SHAPE", "§4b", file, `${pointer} freeze_invariant.modes must be a non-empty array`);
    for (const mode of modes) {
      if (typeof mode === "string" && !clocksResult.modes.has(mode)) {
        error("FREEZE_INVARIANT_REGIME", "§4b", file, `${pointer} freeze_invariant names undeclared mode ${JSON.stringify(mode)}`);
      }
    }
    for (const ref of references) {
      if (typeof ref !== "string") continue;
      if (exprContext) referenceInfo(ref, exprContext, file, `${pointer} freeze_invariant reference`);
      const clockName = clocksResult.governedBy.get(ref);
      if (!clockName) continue; // ungoverned reference: SPEC 4b says nothing more to check here
      for (const mode of modes) {
        const behavior = clocksResult.behaviors.get(`${clockName} ${mode}`);
        if (behavior === "advances") {
          warning("FREEZE_INVARIANT_ADVANCES", "§4b", file, `${pointer} names ${JSON.stringify(ref)}, governed by clock ${JSON.stringify(clockName)}, which advances in named mode ${JSON.stringify(mode)} — advisory contradiction`);
        } else if (behavior === "does-not-exist") {
          error("FREEZE_INVARIANT_UNDEFINED", "§4b", file, `${pointer} names ${JSON.stringify(ref)}, governed by clock ${JSON.stringify(clockName)}, which does-not-exist in named mode ${JSON.stringify(mode)}`);
        }
      }
    }
  }

  // SPEC §4 — "package defaults" means the resolved tuning snapshot produced by
  // applying every question's `default` through the §5 pipeline. For a package
  // with no personalization.json it is tuning.json verbatim. §4a invariants are
  // decided at package defaults, so they are decided against this snapshot, not
  // against the authored numbers: a default that moves a key is part of what
  // the package ships, and an invariant it breaks is broken on arrival.
  //
  // Typed `tuning:` references elsewhere still read the authored numbers. That
  // is deliberate: outside the invariant list a reference resolves a key, and
  // the key's authored value is the package's own statement of it.
  function resolveDefaultTuning(doc, personalization, base) {
    const questions = isObject(personalization?.doc) && Array.isArray(personalization.doc.questions) ? personalization.doc.questions : [];
    if (!questions.length) return base;
    const tunables = isObject(doc?.tunables) ? doc.tunables : {};
    const meta = isObject(doc?.meta) ? doc.meta : {};
    const resolved = new Map(base);
    const rangeOf = key => {
      const range = isObject(meta[key]) ? meta[key].range : undefined;
      return Array.isArray(range) && range.length === 2 && range.every(bound => typeof bound === "number" && Number.isFinite(bound)) ? range : undefined;
    };
    // Only a declared tunables key is a legal target; the illegal ones are
    // reported by name elsewhere and must not silently enter the snapshot.
    const assign = (key, value) => {
      if (own(tunables, key) && typeof value === "number" && Number.isFinite(value)) resolved.set(key, value);
    };
    for (const question of questions) {
      if (!isObject(question) || !own(question, "default")) continue;
      const answer = question.default;
      if (question.type === "choice" && Array.isArray(question.options)) {
        const option = question.options.find(item => isObject(item) && item.id === answer);
        if (isObject(option) && isObject(option.tuning_overrides)) {
          for (const [key, value] of Object.entries(option.tuning_overrides)) assign(key, value);
        }
      }
      if (!Array.isArray(question.resolution)) continue;
      for (const operation of question.resolution) {
        if (!isObject(operation) || typeof operation.key !== "string") continue;
        const operand = operation.operand === "answer" ? answer : operation.operand;
        if (typeof operand !== "number" || !Number.isFinite(operand)) continue;
        const current = resolved.get(operation.key);
        let next;
        if (operation.operation === "replace") next = operand;
        else if (operation.operation === "add" && typeof current === "number") next = current + operand;
        else if (operation.operation === "multiply" && typeof current === "number") next = current * operand;
        if (typeof next !== "number" || !Number.isFinite(next)) continue;
        const range = rangeOf(operation.key);
        // `reject` deliberately does not clamp: the value the pipeline computed
        // is what the invariant is decided against (SPEC §5).
        if (range && operation.out_of_range === "clamp") next = Math.min(Math.max(next, range[0]), range[1]);
        assign(operation.key, next);
      }
    }
    return resolved;
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
    if (RESERVED_FIRST_SEGMENTS.has(segments[0])) {
      error("TUNING_KEY_RESERVED", "§4", "tuning.json", `${role} key ${JSON.stringify(key)} opens with \`${segments[0]}\`, a segment reserved for prose citation in v${SPEC_VERSION}`);
    }
    const extension = segments.find(segment => RESERVED_EXTENSIONS.has(segment));
    if (extension !== undefined) {
      error("TUNING_KEY_RESERVED", "§4", "tuning.json", `${role} key ${JSON.stringify(key)} carries the reserved extension segment \`${extension}\`, which marks a file mention in prose in v${SPEC_VERSION}`);
    }
  }

  function validateTuning(packageRoot, contentContext, rulesetIds = new Set(), personalization = undefined) {
    const file = path.join(packageRoot, "tuning.json");
    const doc = host.exists(file) ? parseJsonFile(file, "tuning.json", "§4", "TUNING_JSON") : undefined;
    const context = { ...contentContext, tuning: new Map() };
    if (doc === undefined) return { doc, context };
    // SPEC §2d — tuning.json is one of the schema-validated package files. The
    // bespoke §4 checks below stay: cross-field rules (a key in both roles, a
    // meta key naming no declared key, a value outside its own sibling range)
    // and every §4a expression rule are outside what one schema decides.
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
    const allowedTop = new Set(["tunables", "constants", "meta", "invariants", "clocks"]);
    for (const key of Object.keys(doc)) {
      if (allowedTop.has(key)) continue;
      const message = key === "values"
        ? "top-level field `values` was renamed to `tunables` in v0.5"
        : `unknown top-level field ${JSON.stringify(key)}`;
      error("TUNING_SHAPE", "§4", "tuning.json", message);
    }
    if (!isObject(doc.tunables)) error("TUNING_TUNABLES", "§4", "tuning.json", "tunables is required and must be a flat object");
    if (own(doc, "constants") && !isObject(doc.constants)) error("TUNING_CONSTANTS", "§4", "tuning.json", "constants must be a flat object when present");
    if (own(doc, "meta") && !isObject(doc.meta)) error("TUNING_META", "§4", "tuning.json", "meta must be an object when present");
    if (own(doc, "invariants") && !Array.isArray(doc.invariants)) error("TUNING_INVARIANTS", "§4", "tuning.json", "invariants must be an array when present");
    context.clocks = own(doc, "clocks") ? validateClocks(doc) : undefined;
    // A clock's `governs` list is itself a declaration of the typed reference
    // for §4a purposes (SPEC 4b) — register it so freeze_invariant citations
    // of a governed state:number reference don't need a redundant prose match.
    if (context.clocks) {
      for (const ref of context.clocks.governedBy.keys()) {
        const match = /^state:number:(.+)$/.exec(ref);
        if (match) context.stateNumbers.add(match[1]);
      }
    }

    const dotted = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
    for (const [role, object] of [["tunables", doc.tunables], ["constants", doc.constants]]) {
      if (!isObject(object)) continue;
      for (const [key, value] of Object.entries(object)) {
        if (!dotted.test(key)) error("TUNING_KEY", "§4", "tuning.json", `${role} key ${JSON.stringify(key)} is not a flat dotted key`);
        else validateTuningKeySegments(role, key);
        if (typeof value !== "number" || !Number.isFinite(value)) error("TUNING_NUMBER", "§4", "tuning.json", `${role}.${key} must be a finite JSON number`);
        else context.tuning.set(key, value);
      }
    }
    if (isObject(doc.tunables) && isObject(doc.constants)) {
      for (const key of Object.keys(doc.tunables)) if (own(doc.constants, key)) error("TUNING_KEY_DUPLICATE", "§4", "tuning.json", `${JSON.stringify(key)} appears in both tunables and constants`);
    }
    if (isObject(doc.meta)) {
      for (const [key, metadata] of Object.entries(doc.meta)) {
        const inTunables = isObject(doc.tunables) && own(doc.tunables, key);
        const inConstants = isObject(doc.constants) && own(doc.constants, key);
        if (Number(inTunables) + Number(inConstants) !== 1) error("TUNING_META_KEY", "§4", "tuning.json", `meta key ${JSON.stringify(key)} must exist in exactly one of tunables or constants`);
        if (!isObject(metadata)) {
          error("TUNING_META", "§4", "tuning.json", `meta.${key} must be an object`);
          continue;
        }
        for (const metaField of Object.keys(metadata)) if (metaField !== "range" && metaField !== "must_match" && metaField !== "ruleset") error("TUNING_META", "§4", "tuning.json", `meta.${key}.${metaField} is not defined by the v0.5 shape`);
        if (own(metadata, "must_match") && typeof metadata.must_match !== "boolean") error("TUNING_META_CERTIFY", "§4", "tuning.json", `meta.${key}.must_match must be Boolean`);
        if (own(metadata, "ruleset") && (typeof metadata.ruleset !== "string" || !rulesetIds.has(metadata.ruleset))) {
          error("TUNING_META_RULESET", "§2c", "tuning.json", `meta.${key}.ruleset must name a declared ruleset id`);
        }
        if (own(metadata, "range")) {
          if (!inTunables) error("TUNING_RANGE_ROLE", "§4", "tuning.json", `meta.${key}.range is allowed only for tunables keys`);
          const range = metadata.range;
          if (!Array.isArray(range) || range.length !== 2 || range.some(value => typeof value !== "number" || !Number.isFinite(value))) {
            error("TUNING_RANGE", "§4", "tuning.json", `meta.${key}.range must be two finite numbers`);
          } else {
            if (range[0] > range[1]) error("TUNING_RANGE", "§4", "tuning.json", `meta.${key}.range minimum exceeds maximum`);
            if (inTunables && typeof doc.tunables[key] === "number" && (doc.tunables[key] < range[0] || doc.tunables[key] > range[1])) {
              error("TUNING_RANGE_VALUE", "§4", "tuning.json", `tunables.${key}=${doc.tunables[key]} is outside inclusive range [${range[0]}, ${range[1]}]`);
            }
          }
        }
      }
    }
    const invariantIds = new Set();
    if (Array.isArray(doc.invariants)) {
      const defaultsContext = { ...context, tuning: resolveDefaultTuning(doc, personalization, context.tuning) };
      doc.invariants.forEach((invariant, index) => {
        if (isObject(invariant) && typeof invariant.id === "string") {
          if (invariantIds.has(invariant.id)) error("TUNING_INVARIANT_ID", "§4", "tuning.json", `invariant id ${JSON.stringify(invariant.id)} is duplicated`);
          invariantIds.add(invariant.id);
        }
        validateNamedExpression(invariant, defaultsContext, "tuning.json", `#/invariants/${index}`, true);
      });
    }
    return { doc, context };
  }

  function validateContentReferences(contentContext, exprContext) {
    for (const info of contentContext.collections.values()) {
      const definitionText = info.definedIn?.text ?? "";
      const mechanicallyResolvedFields = new Set();
      const arrayTargets = new Map();
      const namespaceTargets = new Map();
      const referenceVerbs = new Set();
      for (const match of definitionText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`[^.\n]{0,100}(?:MUST\s+)?resolve/gi)) mechanicallyResolvedFields.add(match[1]);
      for (const match of definitionText.matchAll(/(?:Every\s+[^.\n]{0,80})`([A-Za-z_][A-Za-z0-9_]*)`[^.\n]{0,100}(?:MUST\s+)?resolve/gi)) mechanicallyResolvedFields.add(match[1]);
      for (const match of definitionText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`\s+references\s+MUST\s+resolve\s+to\s+`([A-Za-z_][A-Za-z0-9_]*)\[\]\.id`/gi)) {
        arrayTargets.set(match[1], match[2]);
      }
      for (const match of definitionText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`[\s\S]{0,120}?MUST\s+resolve\s+to[\s\S]{0,80}?`([A-Za-z_][A-Za-z0-9_.-]*)\.\*`/gi)) {
        namespaceTargets.set(match[1], `${match[2]}.`);
      }
      for (const match of definitionText.matchAll(/`([a-z][a-z0-9_-]*):<[^`>]*-id>`/gi)) referenceVerbs.add(match[1]);
      const scheduleUsesTuning = /schedule\s+strings\s+MUST\s+resolve\s+to\s+tuning\s+keys/i.test(definitionText);

      for (const doc of info.docs) {
        const localIds = collectIds(doc.data);
        const idsByArray = new Map();
        for (const arrayName of arrayTargets.values()) {
          const ids = new Set();
          walk(doc.data, value => {
            if (isObject(value) && Array.isArray(value[arrayName])) {
              for (const record of value[arrayName]) if (isObject(record) && (typeof record.id === "string" || typeof record.id === "number")) ids.add(String(record.id));
            }
          });
          idsByArray.set(arrayName, ids);
        }
        walk(doc.data, (value, pointer, ancestors) => {
          if (isObject(value) && value.language === "opengdd-expr-1" && own(value, "assert")) {
            validateNamedExpression(value, exprContext, doc.display, pointer, false);
          }
          if (typeof value !== "string") return;
          const last = ancestors.at(-1);
          const key = isObject(last) && own(last, "key") ? last.key : undefined;
          if (value.startsWith("tuning:")) referenceInfo(value, exprContext, doc.display, pointer);
          const verb = /^([a-z][a-z0-9_-]*):(.+)$/.exec(value);
          if (verb && referenceVerbs.has(verb[1]) && !info.allIds.has(verb[2])) {
            error("CONTENT_DANGLING_REFERENCE", "§1b", doc.display, `${pointer} ${verb[1]} target ${JSON.stringify(verb[2])} does not resolve in the collection`);
          }
          if (key && mechanicallyResolvedFields.has(key)) {
            const resolved = (key.endsWith("_pointer") || value.startsWith("/"))
              ? jsonPointerGet(doc.data, value) !== undefined
              : arrayTargets.has(key)
                ? idsByArray.get(arrayTargets.get(key))?.has(value)
                : namespaceTargets.has(key)
                  ? value.startsWith(namespaceTargets.get(key)) && info.allIds.has(value)
                  : localIds.has(value) || info.allIds.has(value);
            if (!resolved) error("CONTENT_DANGLING_REFERENCE", "§1b", doc.display, `${pointer} ${key} reference ${JSON.stringify(value)} is dangling`);
          }
          const inSchedule = ancestors.some(item => isObject(item) && item.key === "schedule");
          if (scheduleUsesTuning && inSchedule && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(value) && !exprContext.tuning.has(value)) {
            error("CONTENT_DANGLING_TUNING", "§1b", doc.display, `${pointer} schedule tuning key ${JSON.stringify(value)} does not resolve`);
          }
        });
      }
    }
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
    // SPEC §1a: a fantasy line MUST NOT carry a reference. That covers the §4a
    // and §8a typed forms and, under the §4 grammar, a backticked bare token
    // that classifies as a tuning citation. The fantasy is read by every
    // builder before any key exists to cite, so a reference in it is mechanics
    // leaking upward. Classification alone decides this: whether the key
    // happens to exist is not what the fence is about.
    const bodyStart = text.slice(0, match.index).split(/\r?\n/).length + 1;
    match[1].split(/\r?\n/).forEach((raw, offset) => {
      const at = bodyStart + offset;
      for (const typed of raw.matchAll(/(?:^|[^A-Za-z0-9_:-])(tuning|state|content|descriptor):([A-Za-z0-9_:-]+(?:\.[A-Za-z0-9_:-]+)*)/g)) {
        error("FANTASY_REFERENCE", "§1a", "01-overview.md", `fantasy line carries the typed reference \`${typed[1]}:${typed[2]}\`; §1a admits no reference in the fantasy block`, at);
      }
      for (const span of raw.matchAll(/`([^`\n]+)`/g)) {
        const token = span[1].trim();
        if (classifyProseToken(token)?.kind !== "tuning") continue;
        error("FANTASY_REFERENCE", "§1a", "01-overview.md", `fantasy line cites the tuning key \`${token}\`; §1a admits no reference in the fantasy block`, at);
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
      const isShared = sharedCeiling.test(paragraph.text);
      const isChoice = choice.test(paragraph.text);
      if ((!isChoice && !isShared) || resolution.test(paragraph.text) || (isShared && allocationResolution.test(paragraph.text))) continue;
      const excerpt = paragraph.text.length > 180 ? `${paragraph.text.slice(0, 177)}…` : paragraph.text;
      warning(isShared ? "TIE_BREAK_SHARED_CEILING" : "TIE_BREAK_CHOICE", "§2a", "02-mechanics.md", `choice-shaped rule lacks a mechanically apparent tie-break: ${excerpt}`, paragraph.line);
    }
  }

  function validateProseLiterals(packageRoot, manifest, tuningDoc) {
    if (!isObject(tuningDoc)) return;
    const numericValues = new Map();
    for (const role of ["tunables", "constants"]) {
      if (!isObject(tuningDoc[role])) continue;
      for (const [key, value] of Object.entries(tuningDoc[role])) {
        if (typeof value === "number" && Number.isFinite(value)) {
          if (!numericValues.has(value)) numericValues.set(value, []);
          numericValues.get(value).push(key);
        }
      }
    }
    const chapters = new Set(["01-overview.md", "02-mechanics.md", "03-content.md", "04-presentation.md", "05-build-plan.md"]);
    for (const declared of manifest?.build?.chapters ?? []) if (typeof declared === "string" && declared.endsWith(".md")) chapters.add(declared);
    if (typeof manifest?.build?.plan === "string" && manifest.build.plan.endsWith(".md")) chapters.add(manifest.build.plan);
    const numberPattern = /(?<![A-Za-z0-9_.-])-?(?:\d+\.\d+|\d+)(?![A-Za-z0-9_.-])/g;
    for (const chapter of chapters) {
      if (path.isAbsolute(chapter) || chapter.includes("..")) continue;
      const file = path.join(packageRoot, chapter);
      if (!host.exists(file) || !host.isFile(file)) continue;
      for (const item of unfencedLines(host.readText(file))) {
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

  // The list is versioned. `content` was claimed in the first draft and given
  // back the same day: it is a natural designer namespace, and reserving a
  // segment silently disables citation checking for every package that uses it.
  const RESERVED_FIRST_SEGMENTS = new Set([
    "pillars", "mood", "anti", "must_keep", "constraints", "viewing",
    "semantics", "meta", "tunables", "constants", "invariants", "clocks",
    "manifest", "build", "descriptors", "contracts"
  ]);
  const RESERVED_EXTENSIONS = new Set(["json", "md"]);
  // The reserved segments whose family exposes a mechanical citation target:
  // the §9.10 direction families, in the shapes §9.10 declares citable. The
  // remaining reserved segments name file members (`meta.range`,
  // `build.chapters`, `invariants.<id>`) rather than declared entries, so a
  // token opening with one is classified and then resolved against nothing.
  const DIRECTION_CITABLE_SEGMENTS = new Set(["pillars", "mood", "anti", "must_keep", "constraints", "viewing"]);
  const DOTTED_TOKEN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;

  function classifyProseToken(token) {
    if (!DOTTED_TOKEN.test(token)) return undefined;
    const segments = token.split(".");
    if (RESERVED_FIRST_SEGMENTS.has(segments[0])) return { kind: "mechanism", segments };
    if (segments.every(segment => /^\d+$/.test(segment))) return { kind: "version", segments };
    if (segments.some(segment => RESERVED_EXTENSIONS.has(segment))) return { kind: "file", segments };
    return { kind: "tuning", segments };
  }

  // Inline-code spans only. The citation form §1 mandates is backticked, and a
  // bare dotted word in running text is prose — "i.e.", "U.S." — not a citation.
  function* inlineCodeTokens(text) {
    for (const item of unfencedLines(text)) {
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

  function validateProseCitations(packageRoot, manifest, tuningDoc, directionCtx, contractsCtx) {
    // A tuning.json that is missing, unparsable, or without `tunables` has
    // already reported itself. Resolving citations against nothing would bury
    // that one finding under one dangling report per citation in the package.
    if (!isObject(tuningDoc) || !isObject(tuningDoc.tunables)) return;
    const keys = new Set(Object.keys(tuningDoc.tunables));
    if (isObject(tuningDoc.constants)) for (const key of Object.keys(tuningDoc.constants)) keys.add(key);
    const directionDoc = directionCtx?.directionDoc;
    for (const { chapter, text } of chapterTexts(packageRoot, manifest, true)) {
      for (const { token, line } of inlineCodeTokens(text)) {
        const classified = classifyProseToken(token);
        if (!classified || classified.kind === "version" || classified.kind === "file") continue;
        if (classified.kind === "mechanism") {
          const [first] = classified.segments;
          // SPEC §10.11: a backticked `contracts.<instance>.<knob>` is
          // classified by §4's reserved-first-segment rule and resolves as a
          // mechanism path against the instance file that owns it. The typed
          // `tuning:` form is the §4a reference and travels the JSON channel;
          // the two never collide, because prose cites bare.
          if (first === "contracts") {
            if (!contractsCtx) continue;
            // The knob form is what §10.11 names. A bare `contracts.<instance>`
            // naming the adoption itself is accepted where the instance exists:
            // the spec does not declare it citable, and inventing a failure for
            // prose that names a real declared thing is the wrong default.
            const named = classified.segments.length === 2 && contractsCtx.instanceIds.has(classified.segments[1]);
            if (!named && !contractsCtx.contractKeys.has(token)) {
              error("PROSE_CITATION_DANGLING", "§10", slash(chapter), `prose citation \`${token}\` names no declared contract instance or knob; the citable form is \`contracts.<instance>.<knob>\``, line, { token });
            }
            continue;
          }
          if (!isObject(directionDoc)) continue;
          if (!DIRECTION_CITABLE_SEGMENTS.has(first)) continue;
          const citableShape = first === "constraints" ? classified.segments.length === 3 : classified.segments.length === 2;
          if (!citableShape) continue;
          if (!resolveDirectionPath(directionDoc, token)) {
            error("PROSE_CITATION_DANGLING", "§9.10", slash(chapter), `prose citation \`${token}\` does not resolve to a declared ${directionCtx.declaredPath} entry`, line, { token });
          }
          continue;
        }
        if (keys.has(token)) continue;
        const near = [...RESERVED_FIRST_SEGMENTS].find(segment => isNearMiss(classified.segments[0], segment));
        const hint = near ? `; did you mean the reserved \`${near}.\` family?` : "";
        error("PROSE_CITATION_DANGLING", "§4", slash(chapter), `prose citation \`${token}\` does not resolve to a tuning.json key${hint}`, line, { token, first_segment: classified.segments[0] });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SPEC §8a/§9 — the direction file (direction.json + the chapter fence).
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

  const MEDIA_MAGIC = {
    png: buffer => buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a,
    jpg: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    jpeg: buffer => MEDIA_MAGIC.jpg(buffer),
    webp: buffer => buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  };

  // Duck-types SPEC 8a mediaFile objects (path+license+hash+format) anywhere in
  // a JSON tree — used for both manifest.json descriptors and direction.json.
  function collectMediaFiles(root) {
    const results = [];
    walk(root, (value, pointer) => {
      if (isObject(value) && typeof value.path === "string" && typeof value.hash === "string" && typeof value.format === "string" && typeof value.license === "string") {
        results.push({ value, pointer });
      }
    });
    return results;
  }

  function validateMediaFiles(root, display, resolvePath) {
    for (const { value, pointer } of collectMediaFiles(root)) {
      const file = resolvePath(value.path, `${pointer} media path`, "§8a", "MEDIA_PATH_MISSING", { mustExist: true, kind: "file", display });
      if (!file) continue;
      let buffer;
      try { buffer = host.readBytes(file); }
      catch (cause) { error("MEDIA_UNREADABLE", "§8a", display, `${pointer} media file cannot be read: ${cause.message}`); continue; }
      const magic = MEDIA_MAGIC[value.format];
      if (!magic) error("MEDIA_FORMAT_UNKNOWN", "§8a", display, `${pointer} declares format ${JSON.stringify(value.format)}, outside the closed allowlist`);
      else if (buffer === undefined) skip("media-format-bytes", "Media byte-format checks were skipped because the host cannot supply binary bytes.");
      else if (!magic(buffer)) error("MEDIA_FORMAT_MISMATCH", "§8a", display, `${pointer} media file bytes do not decode as declared format ${JSON.stringify(value.format)}`);
      if (/^sha256:[0-9a-f]{64}$/.test(value.hash)) {
        if (buffer === undefined) skip("media-hash", "Media hash checks were skipped because the host cannot supply binary bytes.");
        else if (!host.sha256) skip("media-hash", "Media hash checks were skipped because the host cannot compute digests.");
        else if (host.sha256(buffer) !== value.hash.slice(7)) error("MEDIA_HASH_MISMATCH", "§8a", display, `${pointer} media file bytes do not match declared hash`);
      }
    }
  }

  const DIRECTION_JUDGED_LABELS = new Map([["PILLARS:", "pillars"], ["MOOD:", "mood"], ["ANTI:", "anti"], ["MUST-KEEP:", "must_keep"], ["MOTION:", "motion"]]);
  const DIRECTION_COMMENTARY_LABELS = new Set(["REFERENCES:", "VIEWING:", "CONSTRAINTS:"]);

  // SPEC §9.10 fence grammar: line 1 the DELEGATED tag, line 2 exactly one
  // blank line, then label sections of citation (+ optional continuation)
  // entry blocks, separated by exactly one blank line.
  function parseDirectionFence(fenceLines, startLine, display) {
    const sections = [];
    const at = offset => startLine + offset;
    if ((fenceLines[0] ?? "") !== "> DELEGATED: presentation-direction") {
      error("DIRECTION_FENCE_HEADER", "§9.10", display, "direction fence must open with exactly '> DELEGATED: presentation-direction'", at(0));
    }
    let lines = fenceLines.slice();
    while (lines.length && lines[lines.length - 1].trim() === "") lines = lines.slice(0, -1);
    if (lines.length <= 1) return sections;
    if ((lines[1] ?? "").trim() !== "") {
      error("DIRECTION_FENCE_SEPARATOR", "§9.10", display, "the line after the DELEGATED tag must be exactly one blank line", at(1));
    }
    const body = lines.slice(2);
    const bodyAt = offset => at(2 + offset);
    let index = 0;
    let expectBlankBefore = false;
    while (index < body.length) {
      if (body[index].trim() === "") {
        error("DIRECTION_FENCE_BLANK", "§9.10", display, "unexpected blank line inside the direction fence", bodyAt(index));
        index += 1;
        continue;
      }
      if (expectBlankBefore) {
        error("DIRECTION_FENCE_SEPARATOR", "§9.10", display, "section blocks must be separated by exactly one blank line", bodyAt(index));
      }
      const labelText = body[index].trim();
      if (!DIRECTION_JUDGED_LABELS.has(labelText) && !DIRECTION_COMMENTARY_LABELS.has(labelText)) {
        error("DIRECTION_FENCE_LABEL", "§9.10", display, `unrecognized direction fence section label ${JSON.stringify(body[index])}`, bodyAt(index));
      }
      const labelLine = bodyAt(index);
      index += 1;
      const entries = [];
      while (index < body.length && body[index].trim() !== "") {
        const match = /^- `([^`]+)`\s*$/.exec(body[index]);
        if (!match) {
          if (/^  \S/.test(body[index])) {
            // continuation line with no preceding citation line
            error("DIRECTION_FENCE_ENTRY", "§9.10", display, "continuation line has no preceding citation line", bodyAt(index));
          } else {
            error("DIRECTION_FENCE_ENTRY", "§9.10", display, `expected a citation line (- \`dotted.path\`), got ${JSON.stringify(body[index])}`, bodyAt(index));
          }
          index += 1;
          continue;
        }
        const citationLine = bodyAt(index);
        index += 1;
        while (index < body.length && /^  \S/.test(body[index])) index += 1;
        entries.push({ citation: match[1], line: citationLine });
      }
      sections.push({ label: labelText, line: labelLine, entries });
      if (index < body.length) { index += 1; expectBlankBefore = false; } // consumed the blank separator
    }
    return sections;
  }

  // Resolves a SPEC §9.10 dotted-path citation against a validated direction.json.
  function resolveDirectionPath(directionDoc, dotted) {
    if (!isObject(directionDoc)) return undefined;
    const parts = dotted.split(".");
    if (parts[0] === "constraints" && parts.length === 3) {
      const [, group, key] = parts;
      if (!["palette", "thresholds", "timing"].includes(group)) return undefined;
      const entry = directionDoc.constraints?.[group]?.[key];
      return entry ? { kind: `constraints.${group}`, key, entry } : undefined;
    }
    if (parts.length === 2 && ["pillars", "mood", "references", "anti", "viewing", "must_keep", "motion"].includes(parts[0])) {
      const entry = directionDoc[parts[0]]?.[parts[1]];
      return entry ? { kind: parts[0], key: parts[1], entry } : undefined;
    }
    return undefined;
  }

  const DIRECTION_JUDGED_KINDS = new Set(["pillars", "mood", "anti", "must_keep", "motion"]);

  // SPEC §8a/§9.11 — a mood descriptor's palette role is citable as a checked
  // claim at `descriptors.mood.<mood-id>.palette.<role>`. The <mood-id> segment
  // matches a manifest descriptors.mood entry's `id`; the last segment is a
  // key of that entry's `palette` object.
  function resolveMoodPalettePath(manifest, dotted) {
    const match = /^descriptors\.mood\.([^.]+)\.palette\.(.+)$/.exec(dotted);
    if (!match) return undefined;
    const entries = Array.isArray(manifest?.descriptors?.mood) ? manifest.descriptors.mood : [];
    const descriptor = entries.find(item => isObject(item) && item.id === match[1]);
    if (!isObject(descriptor) || !isObject(descriptor.palette)) return undefined;
    const entry = descriptor.palette[match[2]];
    return isObject(entry) ? { kind: "descriptors.mood.palette", key: `${match[1]}.${match[2]}`, entry } : undefined;
  }

  // SPEC §9.9 precision rule, applied to mood palette entries exactly as the
  // direction schema applies it to constraints.palette entries: a pin claims
  // an exact value, so must_match:true is legal only at tolerance 0.
  function validateMoodDescriptors(manifest) {
    const entries = Array.isArray(manifest?.descriptors?.mood) ? manifest.descriptors.mood : [];
    for (const descriptor of entries) {
      if (!isObject(descriptor) || !isObject(descriptor.palette) || typeof descriptor.id !== "string") continue;
      for (const [role, entry] of Object.entries(descriptor.palette)) {
        if (!isObject(entry) || entry.must_match !== true) continue;
        if (entry.tolerance !== 0) {
          error("DESCRIPTOR_MOOD_PALETTE_PIN", "§9.9", "manifest.json", `descriptors.mood.${descriptor.id}.palette.${role} declares must_match: true with tolerance ${JSON.stringify(entry.tolerance)}; a pin requires tolerance 0`);
        }
      }
    }
  }

  function validateDirection(packageRoot, manifest, resolvePath) {
    const presentationFile = path.join(packageRoot, "04-presentation.md");
    const presentationText = host.exists(presentationFile) ? host.readText(presentationFile) : undefined;
    const fenceMatch = presentationText ? /```direction[^\r\n]*\r?\n([\s\S]*?)```/i.exec(presentationText) : undefined;
    const declaredPath = manifest?.build?.direction;

    if (fenceMatch && declaredPath === undefined) {
      error("DIRECTION_CARRIER_UNDECLARED", "§9", "manifest.json", "04-presentation.md carries a direction fence but manifest.json.build.direction is not declared");
    }
    if (!fenceMatch && declaredPath !== undefined) {
      error("DIRECTION_FENCE_MISSING", "§9", "04-presentation.md", "manifest.json.build.direction is declared but 04-presentation.md carries no direction fence");
    }
    if (!fenceMatch || declaredPath === undefined) return undefined;

    const file = resolvePath(declaredPath, "build.direction", "§9", "DIRECTION_PATH_MISSING", { mustExist: true, kind: "file" });
    const directionDoc = file ? parseJsonFile(file, slash(declaredPath), "§9", "DIRECTION_JSON") : undefined;

    if (directionDoc !== undefined) {
      const schema = loadSchema("direction.schema.json");
      if (schema) {
        for (const problem of schemaProblems(directionDoc, schema, schema)) {
          error("DIRECTION_SCHEMA", "§9", slash(declaredPath), `${problem.path} ${problem.message}`);
        }
      }
      validateMediaFiles(directionDoc, slash(declaredPath), resolvePath);
    }

    const descriptorIds = new Set();
    if (Array.isArray(manifest?.descriptors?.mood)) {
      for (const entry of manifest.descriptors.mood) if (isObject(entry) && typeof entry.id === "string") descriptorIds.add(entry.id);
    }

    const requiredCoverage = new Set(); // constraints.* and motion.* claim paths an AT must cite
    if (isObject(directionDoc)) {
      // viewing / references / mood-descriptor cross-references.
      const viewingIds = new Set(Object.keys(directionDoc.viewing ?? {}));
      const referenceIds = new Set(Object.keys(directionDoc.references ?? {}));
      const citedReferences = new Set();
      const semanticsMetrics = new Set(Array.isArray(directionDoc.semantics?.metrics) ? directionDoc.semantics.metrics : []);

      const checkClaimEdges = (kind, key, claimEntry) => {
        if (typeof claimEntry.viewing === "string" && !viewingIds.has(claimEntry.viewing)) {
          error("DIRECTION_VIEWING_DANGLING", "§9.6", slash(declaredPath), `${kind}.${key}.viewing ${JSON.stringify(claimEntry.viewing)} does not resolve to a declared viewing entry`);
        }
        if (Array.isArray(claimEntry.references)) {
          for (const ref of claimEntry.references) {
            if (typeof ref !== "string") continue;
            if (!referenceIds.has(ref)) {
              error("DIRECTION_REFERENCE_DANGLING", "§9.3", slash(declaredPath), `${kind}.${key}.references cites undeclared reference ${JSON.stringify(ref)}`);
            } else {
              citedReferences.add(ref);
            }
          }
        }
      };

      for (const [key, entry] of Object.entries(directionDoc.pillars ?? {})) if (isObject(entry)) checkClaimEdges("pillars", key, entry);
      for (const [key, entry] of Object.entries(directionDoc.anti ?? {})) if (isObject(entry)) checkClaimEdges("anti", key, entry);
      for (const [key, entry] of Object.entries(directionDoc.must_keep ?? {})) if (isObject(entry)) checkClaimEdges("must_keep", key, entry);
      for (const [key, entry] of Object.entries(directionDoc.motion ?? {})) {
        if (!isObject(entry)) continue;
        checkClaimEdges("motion", key, entry);
        requiredCoverage.add(`motion.${key}`);
      }
      for (const [key, entry] of Object.entries(directionDoc.mood ?? {})) {
        if (!isObject(entry)) continue;
        checkClaimEdges("mood", key, entry);
        const token = /^descriptor:mood:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(entry.descriptor ?? "");
        if (!token || !descriptorIds.has(token[1])) {
          error("DIRECTION_MOOD_DESCRIPTOR_DANGLING", "§9.2", slash(declaredPath), `mood.${key}.descriptor ${JSON.stringify(entry.descriptor)} does not resolve to a declared descriptors.mood entry`);
        }
      }
      for (const key of referenceIds) {
        if (!citedReferences.has(key)) error("DIRECTION_REFERENCE_ORPHANED", "§9.3", slash(declaredPath), `references.${key} is not cited by any judged claim's references field`);
      }

      // constraints.* cross-references: palette/against/metric/viewing, plus AT coverage set.
      const paletteKeys = new Set(Object.keys(directionDoc.constraints?.palette ?? {}));
      for (const key of paletteKeys) requiredCoverage.add(`constraints.palette.${key}`);
      for (const [key, entry] of Object.entries(directionDoc.constraints?.thresholds ?? {})) {
        if (!isObject(entry)) continue;
        requiredCoverage.add(`constraints.thresholds.${key}`);
        for (const role of Array.isArray(entry.roles) ? entry.roles : []) {
          if (typeof role === "string" && !paletteKeys.has(role)) error("DIRECTION_THRESHOLD_ROLE", "§9.5", slash(declaredPath), `constraints.thresholds.${key}.roles cites undeclared palette role ${JSON.stringify(role)}`);
        }
        if (typeof entry.against === "string" && !paletteKeys.has(entry.against)) error("DIRECTION_THRESHOLD_ROLE", "§9.5", slash(declaredPath), `constraints.thresholds.${key}.against cites undeclared palette role ${JSON.stringify(entry.against)}`);
        if (typeof entry.viewing === "string" && !viewingIds.has(entry.viewing)) error("DIRECTION_VIEWING_DANGLING", "§9.6", slash(declaredPath), `constraints.thresholds.${key}.viewing ${JSON.stringify(entry.viewing)} does not resolve to a declared viewing entry`);
        if (typeof entry.metric === "string" && !semanticsMetrics.has(entry.metric)) error("DIRECTION_METRIC_UNREGISTERED", "§9.5", slash(declaredPath), `constraints.thresholds.${key}.metric ${JSON.stringify(entry.metric)} does not appear in semantics.metrics`);
      }
      for (const key of Object.keys(directionDoc.constraints?.timing ?? {})) requiredCoverage.add(`constraints.timing.${key}`);
    }

    // Fence completeness: per-entry for judged labels, existence-only for commentary labels.
    const fenceStart = presentationText.slice(0, fenceMatch.index).split(/\r?\n/).length + 1;
    const fenceLines = fenceMatch[1].split(/\r?\n/);
    const sections = parseDirectionFence(fenceLines, fenceStart, "04-presentation.md");
    const citedByLabel = new Map(); // "pillars" -> Map(key -> count)
    for (const section of sections) {
      const collectionKey = DIRECTION_JUDGED_LABELS.get(section.label);
      const isCommentary = DIRECTION_COMMENTARY_LABELS.has(section.label);
      if (!collectionKey && !isCommentary) continue;
      for (const entry of section.entries) {
        const resolved = isObject(directionDoc) ? resolveDirectionPath(directionDoc, entry.citation) : undefined;
        if (!resolved) {
          error("DIRECTION_FENCE_DANGLING", "§9.10", "04-presentation.md", `fence citation ${JSON.stringify(entry.citation)} does not resolve to a declared direction.json entry`, entry.line);
          continue;
        }
        if (collectionKey) {
          const expectedPrefix = collectionKey === "mood" ? "mood" : collectionKey;
          if (!entry.citation.startsWith(`${expectedPrefix}.`)) {
            error("DIRECTION_FENCE_LABEL_MISMATCH", "§9.10", "04-presentation.md", `${section.label} section cites ${JSON.stringify(entry.citation)}, outside its own collection`, entry.line);
            continue;
          }
          if (!citedByLabel.has(collectionKey)) citedByLabel.set(collectionKey, new Map());
          const counts = citedByLabel.get(collectionKey);
          counts.set(resolved.key, (counts.get(resolved.key) ?? 0) + 1);
        }
      }
    }
    for (const kind of DIRECTION_JUDGED_KINDS) {
      const declaredKeys = new Set(Object.keys(directionDoc?.[kind] ?? {}));
      const counts = citedByLabel.get(kind) ?? new Map();
      for (const key of declaredKeys) {
        const count = counts.get(key) ?? 0;
        if (count === 0) error("DIRECTION_FENCE_UNCITED", "§9.10", "04-presentation.md", `${kind}.${key} has no corresponding citation line in the direction fence`);
        else if (count > 1) error("DIRECTION_FENCE_DUPLICATE", "§9.10", "04-presentation.md", `${kind}.${key} is cited more than once in the direction fence`);
      }
      for (const key of counts.keys()) {
        if (!declaredKeys.has(key)) error("DIRECTION_FENCE_DANGLING", "§9.10", "04-presentation.md", `fence cites ${kind}.${key}, which is not declared in direction.json`);
      }
    }

    return { directionDoc, declaredPath: slash(declaredPath), requiredCoverage, coveredByAT: new Set() };
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

  function validateDescriptorPaths(descriptor, id, file, line, resolvePath) {
    walk(descriptor, (value, pointer, ancestors) => {
      if (typeof value !== "string" || /\s/.test(value) || /^(?:https?:|tuning:|state:|content:)/i.test(value)) return;
      const last = ancestors.at(-1);
      const key = isObject(last) && own(last, "key") ? last.key : "";
      if (/pointer$/i.test(key) || value.includes("*")) return;
      const filePart = value.split("#", 1)[0];
      const explicitPathField = /(?:^|_)(?:file|path)$/i.test(key);
      const knownFile = /\.(?:md|json|txt|csv|tsv|yaml|yml)$/i.test(filePart);
      const directory = /[\\/]$/.test(filePart);
      if (!filePart || (!explicitPathField && !knownFile && !directory)) return;
      resolvePath(filePart, `${id} descriptor ${pointer}`, "§6", "VERIFICATION_PATH", { mustExist: true, display: file });
    });
  }

  function validateDescriptor(descriptor, id, file, line, resolvePath, exprContext, directionCtx, graphContext, manifest) {
    if (!isObject(descriptor)) {
      error("VERIFICATION_SHAPE", "§6", file, `${id} test descriptor must be a JSON object`, line);
      return;
    }
    validateDescriptorPaths(descriptor, id, file, line, resolvePath);
    if (own(descriptor, "freeze_invariant")) {
      validateFreezeInvariant(descriptor.freeze_invariant, exprContext?.clocks, file, `${id} freeze_invariant`, exprContext);
    }
    if (own(descriptor, "direction_claims")) {
      const claims = Array.isArray(descriptor.direction_claims) ? descriptor.direction_claims : undefined;
      if (!claims || !claims.length) {
        error("DIRECTION_CLAIMS_SHAPE", "§6", file, `${id} direction_claims must be a non-empty array of dotted-path citations`, line);
      } else {
        for (const claim of claims) {
          if (typeof claim !== "string") { error("DIRECTION_CLAIMS_SHAPE", "§6", file, `${id} direction_claims entries must be strings`, line); continue; }
          const moodPalette = claim.startsWith("descriptors.") ? resolveMoodPalettePath(manifest, claim) : undefined;
          if (moodPalette) continue; // §8a checked claim; deliberately outside two-way coverage
          const resolved = directionCtx?.directionDoc ? resolveDirectionPath(directionCtx.directionDoc, claim) : undefined;
          if (!resolved || !(resolved.kind.startsWith("constraints.") || resolved.kind === "motion")) {
            error("DIRECTION_CLAIMS_DANGLING", "§6", file, `${id} direction_claims cites ${JSON.stringify(claim)}, which does not resolve to a constraints.* or motion.* direction.json entry or a descriptors.mood.<mood-id>.palette.<role> manifest entry`, line);
          } else {
            directionCtx.coveredByAT.add(claim);
          }
        }
      }
    }
    const legal = new Set(["scenario", "property", "exhaustive-search", "document-check"]);
    if (!legal.has(descriptor.type)) {
      error("VERIFICATION_CLASS", "§6", file, `${id} has illegal test type ${JSON.stringify(descriptor.type)}`, line);
      return;
    }
    if (descriptor.type === "scenario") {
      requireFields(descriptor, ["given", "when", "then"], id, file, line);
    } else if (descriptor.type === "property") {
      requireFields(descriptor, ["domain", "invariant", "verdict"], id, file, line);
      if (!own(descriptor, "sampling")) error("VERIFICATION_PROPERTY_PLAN", "§6", file, `${id} property requires sampling: "exhaustive" or a sampling plan object`, line);
      if (own(descriptor, "sampling")) {
        if (typeof descriptor.sampling === "string") {
          if (!/exhaustive/i.test(descriptor.sampling)) error("VERIFICATION_PROPERTY_PLAN", "§6", file, `${id} non-sampled property sampling must explicitly be "exhaustive"`, line);
        } else if (!isObject(descriptor.sampling)) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampling must be "exhaustive" or a sampling plan object`, line);
        else {
          if (!Array.isArray(descriptor.sampling.seed_set) || descriptor.sampling.seed_set.length === 0) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampled property requires a non-empty deterministic seed_set`, line);
          const countFields = Object.entries(descriptor.sampling).filter(([key, value]) => /sample/i.test(key) && key !== "sample_derivation" && Number.isInteger(value) && value > 0);
          if (countFields.length === 0) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampled property requires a positive integer sample count`, line);
        }
      }
      if (descriptor.verdict !== "per-sample" && descriptor.verdict !== "aggregate") error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} verdict must be "per-sample" or "aggregate"`, line);
      if (descriptor.verdict === "aggregate") {
        requireFields(descriptor, ["metric", "aggregation", "threshold"], id, file, line);
        const seedSet = descriptor.seed_set ?? descriptor.sampling?.seed_set;
        if (!Array.isArray(seedSet) || seedSet.length === 0) error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} aggregate check requires a deterministic seed_set`, line);
        const aggregation = descriptor.aggregation;
        const simple = new Set(["count", "rate", "min", "max", "mean"]);
        const histogram = isObject(aggregation) && aggregation.type === "histogram" && Array.isArray(aggregation.bins) && aggregation.bins.length > 0;
        if (!simple.has(aggregation) && !histogram) error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} aggregation must be count/rate/min/max/mean or a finite histogram with bins`, line);
      }
    } else if (descriptor.type === "exhaustive-search") {
      requireFields(descriptor, ["initial_states", "transitions", "predicate", "diagnostics"], id, file, line);
      if (typeof descriptor.complete !== "boolean") error("VERIFICATION_SEARCH_COMPLETE", "§6", file, `${id} exhaustive-search requires complete: true|false`, line);
      if (!nonEmpty(descriptor.finite_state) && !nonEmpty(descriptor.bound)) error("VERIFICATION_SEARCH_BOUND", "§6", file, `${id} exhaustive-search requires a finite_state declaration or explicit bound`, line);
      if (own(descriptor, "bound") && (!isObject(descriptor.bound) || !nonEmpty(descriptor.bound.type) || Object.keys(descriptor.bound).length < 2)) {
        error("VERIFICATION_SEARCH_BOUND", "§6", file, `${id} bound must name its type and an explicit state/depth limit`, line);
      }
      if (!Array.isArray(descriptor.diagnostics) || descriptor.diagnostics.length === 0) error("VERIFICATION_SEARCH_DIAGNOSTICS", "§6", file, `${id} must name solution and/or counterexample diagnostics`, line);
    } else if (descriptor.type === "document-check") {
      requireFields(descriptor, ["artifacts", "rule_set", "diagnostics"], id, file, line);
      const ruleSet = descriptor.rule_set;
      const versioned = (typeof ruleSet === "string" && /(?:-v?\d+|\d+\.\d+(?:\.\d+)?)$/i.test(ruleSet)) || (isObject(ruleSet) && nonEmpty(ruleSet.id) && nonEmpty(ruleSet.version));
      if (!versioned) error("VERIFICATION_LINT_RULE_SET", "§6", file, `${id} document-check rule_set must be versioned`, line);
      const ruleSetId = typeof ruleSet === "string" ? ruleSet : isObject(ruleSet) ? ruleSet.id : undefined;
      if (Array.isArray(descriptor.diagnostics)) {
        if (ruleSetId === "opengdd-graph-1") {
          const graphDiagnostics = new Set(["cycle", "one-way-edge", "dangling-back-pointer", "duplicate-edge", "monotonicity-violation", "missing-attribute"]);
          for (const value of descriptor.diagnostics) {
            if (!graphDiagnostics.has(String(value))) error("VERIFICATION_LINT_DIAGNOSTICS", "§6", file, `${id} diagnostic "${value}" is not in the closed opengdd-graph-1 vocabulary (SPEC §1c); graph diagnostics carry file, collection-record id, edge, and rule in their payloads`, line);
          }
        } else {
          const normalized = descriptor.diagnostics.map(value => String(value).toLowerCase());
          const hasFile = normalized.some(value => value === "file" || value.includes("file"));
          const hasRecord = normalized.some(value => value === "record" || value.includes("record"));
          const hasRule = normalized.some(value => value === "rule" || value.includes("rule"));
          if (!hasFile || !hasRecord || !hasRule) error("VERIFICATION_LINT_DIAGNOSTICS", "§6", file, `${id} document-check diagnostics must identify file, collection record, and rule`, line);
        }
      }
      if (ruleSetId === "opengdd-graph-1") {
        if (!Array.isArray(descriptor.rules) || descriptor.rules.length === 0) {
          error("VERIFICATION_LINT_RULES", "§6", file, `${id} document-check citing rule_set "opengdd-graph-1" requires a non-empty rules array`, line);
        } else if (graphContext) {
          descriptor.rules.forEach((rule, index) => validateGraphRule(rule, index, graphContext, id, file, line));
        }
      }
    }
    const hasTolerance = own(descriptor, "tolerance") || own(descriptor, "tolerances");
    const hasTarget = own(descriptor, "target") || own(descriptor, "targets") || own(descriptor, "expected") || own(descriptor, "then");
    const hasReplay = own(descriptor, "replay") || own(descriptor, "replays") || own(descriptor, "schedule") || own(descriptor, "schedule_set") || own(descriptor, "given") || (isObject(descriptor.domain) && deepKey(descriptor.domain).includes("schedule"));
    if (hasTolerance && !hasTarget) error("VERIFICATION_TOLERANCE_TARGET", "§6", file, `${id} declares tolerance without an expected target`, line);
    if ((own(descriptor, "target") || own(descriptor, "targets")) && !hasReplay) error("VERIFICATION_TARGET_FIXTURE", "§6", file, `${id} declares a target without an input/schedule replay`, line);
  }

  function buildPlanAcceptanceHeadings(packageRoot, manifest) {
    const relative = typeof manifest?.build?.plan === "string" ? manifest.build.plan : "05-build-plan.md";
    if (path.isAbsolute(relative) || relative.includes("..")) return undefined;
    const file = path.join(packageRoot, relative);
    if (!host.exists(file)) return undefined;
    const text = host.readText(file);
    const headings = [...text.matchAll(/^#{1,6}\s+(AT-(\d+))\b.*$/gm)].map(match => ({ id: match[1], number: Number(match[2]), index: match.index, after: match.index + match[0].length, line: text.slice(0, match.index).split(/\r?\n/).length }));
    // §10.10: a generated acceptance test carries a derived name rather than a
    // number — `<instance>/<template>[/<row>]` — so it never enters §6's
    // consecutive numbering, and counting it needs its own arm.
    const generated = [...text.matchAll(/^#{1,6}\s+AT\s+([a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\s+—/gm)].map(match => ({ name: match[1], index: match.index, line: text.slice(0, match.index).split(/\r?\n/).length }));
    return { relative, text, headings, generated };
  }

  function validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx, graphContext) {
    const plan = buildPlanAcceptanceHeadings(packageRoot, manifest);
    if (!plan) return;
    const { relative, text, headings } = plan;
    const display = slash(relative);
    if (headings.length === 0) {
      error("VERIFICATION_AT_MISSING", "§6", display, "build plan must contain numbered AT-<n> acceptance tests");
      return;
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
      validateDescriptor(descriptor, heading.id, display, heading.line, resolvePath, exprContext, directionCtx, graphContext, manifest);
      const afterBlock = body.slice(block.index + block[0].length).trim();
      const proseBeforeHeading = afterBlock.split(/\r?\n(?=#{1,6}\s)/, 1)[0].trim();
      if (!proseBeforeHeading) error("VERIFICATION_PROSE", "§6", display, `${heading.id} requires human-readable test text after its descriptor`, heading.line);
    });
    if (directionCtx) {
      for (const claim of directionCtx.requiredCoverage) {
        if (!directionCtx.coveredByAT.has(claim)) {
          error("DIRECTION_CLAIM_UNCOVERED", "§9.11", display, `${claim} is not cited by any AT's direction_claims — every observational-checked constraint needs a covering AT`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Declared contracts — the convention layer (SPEC §10).
  //
  // A package MAY carry a package-root `contracts/` directory; its presence
  // with at least one instance file activates the layer, and the folder rules
  // bind on the directory's existence rather than on activation. Every file in
  // it is one contract instance: a vendored immutable core (the questions) plus
  // a local surface (the answers). The envelope is closed at every level, the
  // instantiated acceptance-test block in the build plan is a pure function of
  // core × surface × bound rows, and the validator recomputes it byte for byte.
  //
  // Vocabulary note: the field names here are SPEC §10's, which renamed several
  // of the originating RFC's — a template's test block is `test` (not
  // `descriptor`, which §8 reserves), a surface's inputs channel is
  // `test_inputs` (not `verification`), a test's type discriminator is `type`
  // (not `class`), and a property's oracle is `verdict`. The era-stamped
  // artifacts under `forge/contracts/` and the two `contract-probe-*` packages
  // predate those renames and are expected to fail these checks until they are
  // regenerated.
  // ---------------------------------------------------------------------------

  const CONTRACT_SECTION = "§10";
  const CONTRACT_DIRECTORY = "contracts";
  const CONTRACT_INSTANCE_FORMAT = "opengdd-contract-instance-1";
  const CONTRACT_CORE_FORMAT = "opengdd-contract-core-1";
  const CONTRACT_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const CONTRACT_UNIT_SENTINELS = new Set(["dimensionless", "instance-defined"]);
  const CONTRACT_INPUT_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object"]);
  const CONTRACT_FIELD_TYPES = new Set(["number", "integer", "string", "citation"]);
  const CONTRACT_TEST_TYPES = new Set(["scenario", "property", "exhaustive-search", "document-check"]);
  const CONTRACT_PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;
  const CONTRACT_BEGIN_PATTERN = /^<!-- opengdd:contracts:generated:begin instance=(\S+) core=(\S+) -->$/;

  const contractBeginMarker = (instance, core) => `<!-- opengdd:contracts:generated:begin instance=${instance} core=${core} -->`;
  const contractEndMarker = (instance, core) => `<!-- opengdd:contracts:generated:end instance=${instance} core=${core} -->`;

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

  // §10.5: what the designer names is kebab-case and dot-free, so
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

  // §10.5's one unified condition: an object with optional `flag` and `row`
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

  // §10.5/§10.8: satisfied when every listed flag's recorded answer and every
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

  function contractParsePlaceholder(body) {
    if (body === "instance") return { form: "instance" };
    const knob = /^knob-cite:(.+)$/.exec(body);
    if (knob) return { form: "knob-cite", name: knob[1] };
    const surface = /^surface:(.+)$/.exec(body);
    if (surface) return { form: "surface", name: surface[1] };
    const bind = /^bind:(.+)$/.exec(body);
    if (bind) return { form: "bind", name: bind[1] };
    const row = /^row\.(.+)$/.exec(body);
    if (row) return { form: "row", name: row[1] };
    return undefined;
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

  // §10.9 substitution, two contexts. Whole-value: a string that is exactly one
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

  // §10.9's injection ban, applied recursively over every string inside a
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

  // §10.5: the core's structural shape. Everything here reads the core alone —
  // no surface, no rows — so a core is checkable before any instance answers it.
  // The one extractor. Reading a core's shape and validating it are separate
  // jobs: liveness has to be computable without emitting findings, both for the
  // two-pass key set below and for the §7 build-record checks, which read a
  // certifying package's contracts without re-reporting its own validation.
  // Admission here is permissive on purpose — a malformed part is still
  // modelled so the checks downstream have something to name.
  function contractModelOf(core) {
    const flags = new Map();
    const knobs = new Map();
    const collections = new Map();
    const templates = new Map();
    const templateOrder = [];
    const templateByIndex = new Map();
    if (Array.isArray(core?.decisions)) {
      core.decisions.forEach((entry, index) => {
        if (!isObject(entry) || typeof entry.flag !== "string" || flags.has(entry.flag)) return;
        const options = new Map();
        if (Array.isArray(entry.options)) {
          for (const option of entry.options) {
            if (isObject(option) && typeof option.id === "string" && CONTRACT_KEBAB.test(option.id) && !options.has(option.id)) options.set(option.id, option);
          }
        }
        flags.set(entry.flag, { entry, options, index });
      });
    }
    if (isObject(core?.knobs)) {
      for (const [name, meta] of Object.entries(core.knobs)) {
        if (!name.startsWith("_") && isObject(meta)) knobs.set(name, meta);
      }
    }
    if (isObject(core?.collections)) {
      for (const [name, schema] of Object.entries(core.collections)) {
        if (name.startsWith("_") || !isObject(schema)) continue;
        const fields = new Map();
        if (isObject(schema.record)) {
          for (const [field, shape] of Object.entries(schema.record)) {
            if (!field.startsWith("_") && isObject(shape)) fields.set(field, shape);
          }
        }
        collections.set(name, { schema, fields });
      }
    }
    if (Array.isArray(core?.templates)) {
      core.templates.forEach((template, index) => {
        if (!isObject(template)) return;
        const inputs = new Map();
        if (Array.isArray(template.surface_inputs)) {
          for (const input of template.surface_inputs) {
            if (isObject(input) && typeof input.name === "string" && CONTRACT_KEBAB.test(input.name) && !inputs.has(input.name)) inputs.set(input.name, input);
          }
        }
        const record = { template, index, perRow: template.expand === "per-row", inputs, at: `#/core/templates/${index}` };
        if (typeof template.id === "string" && !templates.has(template.id)) templates.set(template.id, record);
        templateOrder.push(record);
        templateByIndex.set(index, record);
      });
    }
    return { flags, knobs, collections, templates, templateOrder, templateByIndex, malformedInvariants: new Set() };
  }

  // Every row field a template reads: the `row` domain of its condition, every
  // `{{row.<field>}}` placeholder in text it renders, and every `row_field`
  // binding. §10.8 step 5 prunes a row that legally lacks any of them.
  function contractTemplateRowFields(template) {
    const fields = new Set();
    if (isObject(template?.when) && isObject(template.when.row)) {
      for (const field of Object.keys(template.when.row)) fields.add(field);
    }
    const sources = [template?.title, template?.text, template?.test];
    if (isObject(template?.bindings)) {
      for (const [bindingId, binding] of Object.entries(template.bindings)) {
        if (bindingId.startsWith("_") || !isObject(binding)) continue;
        if (typeof binding.row_field === "string") fields.add(binding.row_field);
        if (isObject(binding.map)) sources.push(...Object.values(binding.map));
      }
    }
    for (const source of sources) {
      if (source === undefined) continue;
      for (const found of contractScanPlaceholders(source, "")) {
        const parsed = contractParsePlaceholder(found.body);
        if (parsed?.form === "row") fields.add(parsed.name);
      }
    }
    return fields;
  }

  function contractValidateCore(core, display, model) {
    const { flags, knobs, collections, templates } = model;
    const seenFlags = new Set();
    const seenTemplates = new Set();
    const pointer = "#/core";
    contractClosed(core, [
      "format", "id", "version", "origin", "supersedes", "summary", "mechanism",
      "decisions", "knobs", "invariants", "collections", "templates"
    ], ["format", "id", "version", "summary", "mechanism", "decisions", "templates"], display, pointer);

    if (own(core, "format") && core.format !== CONTRACT_CORE_FORMAT) {
      error("CONTRACT_FORMAT", CONTRACT_SECTION, display, `${pointer}/format must be ${JSON.stringify(CONTRACT_CORE_FORMAT)}, got ${JSON.stringify(core.format)}`);
    }
    if (own(core, "id")) contractKebab(core.id, display, pointer, "core id");
    if (own(core, "version") && !Number.isInteger(core.version)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/version must be an integer, got ${JSON.stringify(core.version)}`);
    }
    if (own(core, "summary")) contractType(core.summary, "string", display, pointer, "summary");
    if (own(core, "mechanism") && (!Array.isArray(core.mechanism) || !core.mechanism.every(item => typeof item === "string"))) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/mechanism must be an array of strings`);
    }
    if (own(core, "origin")) {
      if (contractType(core.origin, "object", display, pointer, "origin")) {
        contractClosed(core.origin, ["author", "url", "status"], ["author"], display, `${pointer}/origin`);
      }
    } else {
      warning("CONTRACT_ORIGIN_ABSENT", CONTRACT_SECTION, display, `${pointer} declares no origin; a core SHOULD carry one (author, url), and the SHOULD is satisfiable only at first authoring — adding it later is a core edit like any other`);
    }
    if (own(core, "supersedes") && contractType(core.supersedes, "object", display, pointer, "supersedes")) {
      contractClosed(core.supersedes, ["id", "version", "origin"], ["id", "version"], display, `${pointer}/supersedes`);
      if (own(core.supersedes, "origin") && isObject(core.supersedes.origin)) {
        contractClosed(core.supersedes.origin, ["author", "url", "status"], ["author"], display, `${pointer}/supersedes/origin`);
      }
    }

    // Flags. Round-8 D12: a zero-decision core is a drop-in channel for
    // arbitrary Fixed acceptance tests with no recorded decision.
    if (!Array.isArray(core.decisions)) {
      if (own(core, "decisions")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/decisions must be an array of decision flags`);
    } else if (core.decisions.length === 0) {
      error("CONTRACT_DECISIONS_EMPTY", CONTRACT_SECTION, display, `${pointer}/decisions must declare at least one decision flag; a zero-decision core records no decision at all`);
    } else {
      core.decisions.forEach((entry, index) => {
        const at = `${pointer}/decisions/${index}`;
        if (!isObject(entry)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be an object`);
          return;
        }
        contractClosed(entry, ["flag", "question", "options", "default_guidance", "rationale", "when"], ["flag", "question", "options"], display, at);
        if (own(entry, "flag") && contractKebab(entry.flag, display, at, "flag name")) {
          if (seenFlags.has(entry.flag)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${at}/flag ${JSON.stringify(entry.flag)} is declared twice; flag and knob names share one namespace and MUST be unique`);
          seenFlags.add(entry.flag);
        }
        if (own(entry, "question")) contractType(entry.question, "string", display, at, "question");
        for (const key of ["default_guidance", "rationale"]) {
          if (own(entry, key)) contractType(entry[key], "string", display, at, key);
        }
        const seenOptions = new Set();
        if (!Array.isArray(entry.options) || entry.options.length === 0) {
          if (own(entry, "options")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/options must be a non-empty array of option entries`);
        } else {
          entry.options.forEach((option, optionIndex) => {
            const optionAt = `${at}/options/${optionIndex}`;
            if (!isObject(option)) {
              error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${optionAt} must be an object with id and semantics`);
              return;
            }
            contractClosed(option, ["id", "semantics", "rationale"], ["id", "semantics"], display, optionAt);
            if (own(option, "id") && contractKebab(option.id, display, optionAt, "option id")) {
              if (seenOptions.has(option.id)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${optionAt}/id ${JSON.stringify(option.id)} is declared twice within flag ${JSON.stringify(entry.flag)}`);
              seenOptions.add(option.id);
            }
            for (const key of ["semantics", "rationale"]) {
              if (own(option, key)) contractType(option[key], "string", display, optionAt, key);
            }
          });
        }
        contractWhenShape(entry.when, display, at, false);
      });
    }

    // Knob meta. §10.5: knobs are numeric-only, carry a required change
    // authority (`kind`) and a required `unit`, and `range` is legal on
    // tunables only — a constant's bounds are invariants.
    if (own(core, "knobs") && contractType(core.knobs, "object", display, pointer, "knobs")) {
      for (const [name, meta] of Object.entries(core.knobs)) {
        if (name.startsWith("_")) continue;
        const at = `${pointer}/knobs/${pointerEscape(name)}`;
        contractKebab(name, display, at, "knob name");
        if (flags.has(name)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${at} knob name ${JSON.stringify(name)} collides with a flag of the same name; flag and knob names share one namespace`);
        if (!isObject(meta)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a knob-meta object`);
          continue;
        }
        contractClosed(meta, ["kind", "unit", "type", "range", "default_guidance", "description", "rationale", "when"], ["kind", "unit", "type"], display, at);
        if (own(meta, "kind") && meta.kind !== "tunable" && meta.kind !== "constant") {
          error("CONTRACT_KNOB_KIND", CONTRACT_SECTION, display, `${at}/kind must be "tunable" or "constant", got ${JSON.stringify(meta.kind)}`);
        }
        if (own(meta, "type") && meta.type !== "number" && meta.type !== "integer") {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/type must be "number" or "integer", got ${JSON.stringify(meta.type)}`);
        }
        if (own(meta, "unit")) {
          if (typeof meta.unit !== "string" || !meta.unit) {
            error("CONTRACT_KNOB_UNIT", CONTRACT_SECTION, display, `${at}/unit must be a unit string, "dimensionless", or "instance-defined"`);
          } else if (!CONTRACT_UNIT_SENTINELS.has(meta.unit) && !CONTRACT_KEBAB.test(meta.unit)) {
            error("CONTRACT_KNOB_UNIT", CONTRACT_SECTION, display, `${at}/unit ${JSON.stringify(meta.unit)} is neither a reserved sentinel nor a kebab-case unit name`);
          }
        }
        if (own(meta, "range")) {
          if (meta.kind !== "tunable") {
            error("CONTRACT_KNOB_RANGE", CONTRACT_SECTION, display, `${at}/range is legal on a "tunable" knob only; a constant's bounds belong in the core's invariants`);
          }
          if (!isObject(meta.range)) {
            error("CONTRACT_KNOB_RANGE", CONTRACT_SECTION, display, `${at}/range must be an object with min and/or max`);
          } else {
            contractClosed(meta.range, ["min", "max"], [], display, `${at}/range`);
            if (!own(meta.range, "min") && !own(meta.range, "max")) {
              error("CONTRACT_KNOB_RANGE", CONTRACT_SECTION, display, `${at}/range must declare at least one of min and max`);
            }
            for (const bound of ["min", "max"]) {
              if (own(meta.range, bound) && typeof meta.range[bound] !== "number") {
                error("CONTRACT_KNOB_RANGE", CONTRACT_SECTION, display, `${at}/range/${bound} must be a number`);
              }
            }
            if (typeof meta.range.min === "number" && typeof meta.range.max === "number" && meta.range.min > meta.range.max) {
              error("CONTRACT_KNOB_RANGE", CONTRACT_SECTION, display, `${at}/range min ${meta.range.min} exceeds max ${meta.range.max}`);
            }
          }
        }
        if (own(meta, "default_guidance") && typeof meta.default_guidance !== "number" && typeof meta.default_guidance !== "string") {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/default_guidance must be a number or a string`);
        }
        for (const key of ["description", "rationale"]) {
          if (own(meta, key)) contractType(meta[key], "string", display, at, key);
        }
        contractWhenShape(meta.when, display, at, false);
      }
    }

    // Collection record schemas.
    if (own(core, "collections") && contractType(core.collections, "object", display, pointer, "collections")) {
      for (const [name, schema] of Object.entries(core.collections)) {
        if (name.startsWith("_")) continue;
        const at = `${pointer}/collections/${pointerEscape(name)}`;
        contractKebab(name, display, at, "collection-schema name");
        if (!isObject(schema)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a collection-schema object`);
          continue;
        }
        contractClosed(schema, ["description", "record"], ["record"], display, at);
        if (own(schema, "description")) contractType(schema.description, "string", display, at, "description");
        if (own(schema, "record") && contractType(schema.record, "object", display, at, "record")) {
          for (const [field, shape] of Object.entries(schema.record)) {
            if (field.startsWith("_")) continue;
            const fieldAt = `${at}/record/${pointerEscape(field)}`;
            contractKebab(field, display, fieldAt, "record field name");
            if (!isObject(shape)) {
              error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${fieldAt} must be a field-shape object`);
              continue;
            }
            contractClosed(shape, ["type", "required", "when", "options", "pattern", "unique", "description"], ["type"], display, fieldAt);
            if (own(shape, "type") && !CONTRACT_FIELD_TYPES.has(shape.type)) {
              error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${fieldAt}/type must be one of ${[...CONTRACT_FIELD_TYPES].join(", ")}, got ${JSON.stringify(shape.type)}`);
            }
            if (own(shape, "required") && own(shape, "when")) {
              error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${fieldAt} declares both required and when; at most one is legal (absent both means optional)`);
            }
            if (own(shape, "required")) contractType(shape.required, "boolean", display, fieldAt, "required");
            if (own(shape, "unique")) contractType(shape.unique, "boolean", display, fieldAt, "unique");
            if (own(shape, "description")) contractType(shape.description, "string", display, fieldAt, "description");
            if (own(shape, "pattern")) {
              if (shape.type !== "string") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${fieldAt}/pattern is legal on a string field only`);
              if (shape.pattern !== "kebab-case") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${fieldAt}/pattern admits only "kebab-case" today, got ${JSON.stringify(shape.pattern)}`);
            }
            if (own(shape, "options")) {
              if (shape.type !== "string") error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${fieldAt}/options is legal on a string field only; a text answer is a closed choice or a citation`);
              if (!Array.isArray(shape.options) || shape.options.length === 0) {
                error("CONTRACT_ROW_FIELD_SHAPE", CONTRACT_SECTION, display, `${fieldAt}/options must be a non-empty array of kebab-case values`);
              } else {
                shape.options.forEach((value, valueIndex) => contractKebab(value, display, `${fieldAt}/options/${valueIndex}`, "closed-choice value", 64));
              }
            }
            contractWhenShape(shape.when, display, fieldAt, true);
          }
        }
      }
    }

    // Templates.
    if (!Array.isArray(core.templates)) {
      if (own(core, "templates")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/templates must be an array`);
    } else {
      core.templates.forEach((template, index) => {
        const at = `${pointer}/templates/${index}`;
        if (!isObject(template)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be a template object`);
          return;
        }
        contractClosed(template, ["id", "title", "type", "expand", "collection", "when", "bindings", "surface_inputs", "test", "text"],
          ["id", "title", "type", "expand", "test", "text"], display, at);
        if (own(template, "id") && contractKebab(template.id, display, at, "template id")) {
          if (seenTemplates.has(template.id)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${at}/id ${JSON.stringify(template.id)} is declared twice among the core's templates`);
          seenTemplates.add(template.id);
        }
        for (const key of ["title", "text"]) {
          if (own(template, key)) contractType(template[key], "string", display, at, key);
        }
        if (own(template, "type") && !CONTRACT_TEST_TYPES.has(template.type)) {
          error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at}/type must name one of §6's four test types (${[...CONTRACT_TEST_TYPES].join(", ")}), got ${JSON.stringify(template.type)}`);
        }
        const perRow = template.expand === "per-row";
        if (own(template, "expand") && template.expand !== "once" && !perRow) {
          error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at}/expand must be "once" or "per-row", got ${JSON.stringify(template.expand)}`);
        }
        if (perRow && !own(template, "collection")) {
          error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at} expands per-row and must name the collection its rows come from`);
        }
        if (!perRow && own(template, "collection")) {
          error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at}/collection is legal only on a per-row template`);
        }
        if (own(template, "collection") && typeof template.collection === "string" && !collections.has(template.collection)) {
          error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/collection names ${JSON.stringify(template.collection)}, which the core's collections object does not declare`);
        }
        contractWhenShape(template.when, display, at, perRow);
        if (own(template, "test") && contractType(template.test, "object", display, at, "test")) {
          // The test block is a §6 test block, so it carries its own `type`.
          // Silence there would render a block §6 rejects, and the template's
          // own `type` is not a substitute — it is the field liveness and
          // §10.10 read, and the two MUST agree.
          if (!own(template.test, "type")) {
            error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at}/test is missing \`type\`; a §6 test block declares its own type, and it MUST equal the template's`);
          } else if (own(template, "type") && template.test.type !== template.type) {
            error("CONTRACT_TEMPLATE_SHAPE", CONTRACT_SECTION, display, `${at}/test/type ${JSON.stringify(template.test.type)} disagrees with the template's declared type ${JSON.stringify(template.type)}`);
          }
        }
        if (own(template, "bindings") && contractType(template.bindings, "object", display, at, "bindings")) {
          for (const [bindingId, binding] of Object.entries(template.bindings)) {
            if (bindingId.startsWith("_")) continue;
            const bindingAt = `${at}/bindings/${pointerEscape(bindingId)}`;
            contractKebab(bindingId, display, bindingAt, "binding id");
            if (!isObject(binding)) {
              error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${bindingAt} must be an object declaring exactly one of flag or row_field, plus map`);
              continue;
            }
            const hasFlag = own(binding, "flag");
            const hasRowField = own(binding, "row_field");
            contractClosed(binding, ["flag", "row_field", "map"], ["map"], display, bindingAt);
            if (hasFlag === hasRowField) {
              error("CONTRACT_BINDING_SHAPE", CONTRACT_SECTION, display, `${bindingAt} must declare exactly one of flag and row_field`);
            }
            if (hasRowField && !perRow) {
              error("CONTRACT_BINDING_SHAPE", CONTRACT_SECTION, display, `${bindingAt} binds a row field, which is legal only on a per-row template`);
            }
            if (!isObject(binding.map)) {
              if (own(binding, "map")) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${bindingAt}/map must map an option id or field value to a core-authored phrase`);
              continue;
            }
            for (const [key, phrase] of Object.entries(binding.map)) {
              if (typeof phrase !== "string") {
                error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${bindingAt}/map/${pointerEscape(key)} must be a string phrase`);
                continue;
              }
              if (phrase.includes("{{bind:")) {
                error("CONTRACT_BINDING_SHAPE", CONTRACT_SECTION, display, `${bindingAt}/map/${pointerEscape(key)} carries a {{bind:}} placeholder; a binding phrase MUST NOT nest another binding, so expansion terminates by construction`);
              }
            }
            if (hasFlag && typeof binding.flag === "string") {
              const flag = flags.get(binding.flag);
              if (!flag) {
                error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${bindingAt}/flag names undeclared flag ${JSON.stringify(binding.flag)}`);
              } else {
                for (const key of Object.keys(binding.map)) {
                  if (!flag.options.has(key)) {
                    error("CONTRACT_BINDING_MAP", CONTRACT_SECTION, display, `${bindingAt}/map keys ${JSON.stringify(key)}, which is not an option id of flag ${JSON.stringify(binding.flag)}`);
                  }
                }
              }
            }
            if (hasRowField && typeof binding.row_field === "string") {
              const schema = collections.get(template.collection);
              if (schema && !schema.fields.has(binding.row_field)) {
                error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${bindingAt}/row_field names ${JSON.stringify(binding.row_field)}, which collection ${JSON.stringify(template.collection)} does not declare`);
              }
            }
          }
        }
        const seenInputs = new Set();
        if (own(template, "surface_inputs")) {
          if (!Array.isArray(template.surface_inputs)) {
            error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/surface_inputs must be an array of typed input declarations`);
          } else {
            template.surface_inputs.forEach((input, inputIndex) => {
              const inputAt = `${at}/surface_inputs/${inputIndex}`;
              if (!isObject(input)) {
                error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${inputAt} must be an object with name, type, and description`);
                return;
              }
              contractClosed(input, ["name", "type", "description", "example", "default_guidance"], ["name", "type", "description"], display, inputAt);
              if (own(input, "name") && contractKebab(input.name, display, inputAt, "surface input name")) {
                if (seenInputs.has(input.name)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${inputAt}/name ${JSON.stringify(input.name)} is declared twice on this template`);
                seenInputs.add(input.name);
              }
              if (own(input, "type") && !CONTRACT_INPUT_TYPES.has(input.type)) {
                error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${inputAt}/type must be a JSON type name (${[...CONTRACT_INPUT_TYPES].join(", ")}), got ${JSON.stringify(input.type)}`);
              }
              if (own(input, "description")) contractType(input.description, "string", display, inputAt, "description");
            });
          }
        }
      });
    }

    // Invariants (§10.5). The `knob:` reference scheme is legal only here.
    const invariantIds = new Set();
    if (own(core, "invariants")) {
      if (!Array.isArray(core.invariants)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${pointer}/invariants must be an array`);
      } else {
        core.invariants.forEach((invariant, index) => {
          const at = `${pointer}/invariants/${index}`;
          if (!isObject(invariant)) {
            error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be an invariant declaration`);
            return;
          }
          contractClosed(invariant, ["language", "id", "assert", "message"], ["language", "id", "assert", "message"], display, at);
          if (invariant.language !== "opengdd-expr-1") {
            error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at}/language must be "opengdd-expr-1"`);
          }
          if (own(invariant, "id") && contractKebab(invariant.id, display, at, "invariant id")) {
            if (invariantIds.has(invariant.id)) error("CONTRACT_NAME_UNIQUE", CONTRACT_SECTION, display, `${at}/id ${JSON.stringify(invariant.id)} is declared twice among the core's invariants`);
            invariantIds.add(invariant.id);
          }
          if (own(invariant, "message")) contractType(invariant.message, "string", display, at, "message");
          // The expression's *shape* is core validation, so it is checked
          // whether or not the knobs it reads are live or set. Only its
          // evaluation waits for a surface.
          if (own(invariant, "assert") && !contractExpressionShape(invariant.assert, `${at}/assert`, display, knobs)) {
            // A malformed assertion is reported here and not evaluated later:
            // an evaluator asked to run it would report the same fault again
            // in its own vocabulary.
            model.malformedInvariants.add(index);
          }
        });
      }
    }

    // §10.10's derived acceptance-test names lean on a row's `id`, so a schema
    // any per-row template expands MUST declare one. The rule is about the
    // schema and the template, not about today's rows: a collection that
    // happens to be empty this week still owes the field.
    for (const record of model.templateOrder) {
      if (!record.perRow || typeof record.template.collection !== "string") continue;
      const schema = collections.get(record.template.collection);
      if (!schema) continue;
      const idField = schema.fields.get("id");
      if (!idField || idField.type !== "string" || idField.pattern !== "kebab-case" || idField.required !== true || idField.unique !== true) {
        error("CONTRACT_ROW_ID", CONTRACT_SECTION, display, `collection ${JSON.stringify(record.template.collection)} is expanded by per-row template ${JSON.stringify(record.template.id)} and MUST declare an \`id\` field (type string, pattern kebab-case, required true, unique true); §10.10's derived acceptance-test names lean on it`);
      }
    }
  }

  // What a build record needs to know about a certifying package's contracts:
  // §10.11's live key set with each key's role, the count of generated
  // acceptance tests after liveness and per-row expansion, and the live
  // invariants to re-evaluate over the resolved snapshot. Gathered with the
  // finding sink closed — this reads someone else's package.
  function contractBuildFacts(specRoot, specManifest) {
    return quietly(() => {
      const resolvePath = makePathResolver(specRoot);
      const questions = loadPersonalization(specRoot, specManifest, resolvePath).questions;
      const contentContext = validateContent(specRoot, specManifest, resolvePath, questions);
      const specTuningRelative = specManifest?.build?.tuning ?? "tuning.json";
      const specTuningFile = path.join(specRoot, specTuningRelative);
      const specTuning = host.exists(specTuningFile) && host.isFile(specTuningFile)
        ? (() => { try { return JSON.parse(host.readText(specTuningFile)); } catch { return undefined; } })()
        : undefined;
      const result = validateContracts(specRoot, specManifest, contentContext, resolvePath, specTuning);
      if (!result) return undefined;
      const roles = new Map();
      const invariants = [];
      for (const instance of result.instances) {
        for (const name of instance.liveKnobs) {
          const meta = instance.model.knobs.get(name) ?? {};
          roles.set(`contracts.${instance.id}.${name}`, meta.kind === "constant" ? "constants" : "tunables");
        }
        if (!Array.isArray(instance.core.invariants)) continue;
        for (const invariant of instance.core.invariants) {
          if (!isObject(invariant) || !own(invariant, "assert")) continue;
          const referenced = contractInvariantKnobs(invariant.assert);
          if (!referenced.every(name => instance.liveKnobs.has(name))) continue;
          invariants.push({ instance: instance.id, invariant, referenced });
        }
      }
      return { roles, invariants, generatedTotal: result.generatedTotal };
    });
  }

  // §10.10's canonical form applied to a whole `core` object: two-space
  // indented JSON in authored field order, LF, annotations *included* — the
  // same bytes §10.3's digest covers. §10.2's identity rule compares these.
  function contractCanonicalCore(core) {
    return JSON.stringify(core, null, 2);
  }

  function contractInvariantKnobs(assert) {
    const referenced = [];
    walk(assert, value => {
      if (isObject(value) && typeof value.ref === "string" && value.ref.startsWith("knob:")) referenced.push(value.ref.slice("knob:".length));
    });
    return referenced;
  }

  // A core invariant's assertion, checked for shape alone. `knob:<name>` is the
  // only reference scheme legal inside one — a core is authored before any
  // instance exists, so it cannot name `tuning:contracts.<instance>.<knob>`.
  function contractExpressionShape(node, at, display, knobs) {
    if (typeof node === "boolean" || typeof node === "string") return true;
    if (typeof node === "number") {
      if (Number.isFinite(node)) return true;
      error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at} numeric literal must be finite`);
      return false;
    }
    if (!isObject(node)) {
      error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at} is not a legal opengdd-expr-1 node`);
      return false;
    }
    const keys = Object.keys(node).sort();
    if (keys.length === 1 && keys[0] === "ref") {
      if (typeof node.ref !== "string") {
        error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at}/ref must be a string`);
        return false;
      }
      if (!node.ref.startsWith("knob:")) {
        error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at} uses the reference ${JSON.stringify(node.ref)}; \`knob:<name>\` is the only scheme legal inside a core invariant, since a core is authored before any instance exists to name`);
        return false;
      }
      const name = node.ref.slice("knob:".length);
      if (knobs.has(name)) return true;
      error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at} cites undeclared knob ${JSON.stringify(name)}`);
      return false;
    }
    if (keys.length !== 2 || keys[0] !== "args" || keys[1] !== "op" || typeof node.op !== "string" || !Array.isArray(node.args)) {
      error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at} must carry exactly \`ref\`, or exactly \`op\` and \`args\``);
      return false;
    }
    const signature = OPERATORS[node.op];
    if (!signature) {
      error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at} uses unknown operator ${JSON.stringify(node.op)}`);
      return false;
    }
    let ok = true;
    if ((signature.arity === "many" && node.args.length < 1) || (typeof signature.arity === "number" && node.args.length !== signature.arity)) {
      error("CONTRACT_INVARIANT_SHAPE", CONTRACT_SECTION, display, `${at} operator ${node.op} has wrong arity (${node.args.length})`);
      ok = false;
    }
    for (const [index, arg] of node.args.entries()) {
      if (!contractExpressionShape(arg, `${at}/args/${index}`, display, knobs)) ok = false;
    }
    return ok;
  }

  // §10.8's referential-integrity pass, checked before liveness: every flag
  // name, option id, row-field name, and knob name appearing in any `when`, in
  // `bindings`, or in a placeholder MUST be declared in the core. An undeclared
  // name is a validation failure, never a vacuous condition.
  function contractReferentialIntegrity(core, model, display) {
    const { flags, knobs, collections, templates } = model;
    const checkWhen = (when, at, collection) => {
      if (!isObject(when)) return;
      if (isObject(when.flag)) {
        for (const [name, values] of Object.entries(when.flag)) {
          const flag = flags.get(name);
          if (!flag) {
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/flag names undeclared flag ${JSON.stringify(name)}`);
            continue;
          }
          if (!Array.isArray(values)) continue;
          for (const value of values) {
            if (!flag.options.has(value)) {
              error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/flag/${pointerEscape(name)} names option ${JSON.stringify(value)}, which flag ${JSON.stringify(name)} does not declare`);
            }
          }
        }
      }
      if (isObject(when.row)) {
        const schema = collection ? collections.get(collection) : undefined;
        for (const field of Object.keys(when.row)) {
          if (schema && !schema.fields.has(field)) {
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${at}/when/row names field ${JSON.stringify(field)}, which collection ${JSON.stringify(collection)} does not declare`);
          }
        }
      }
    };

    for (const [name, flag] of flags) checkWhen(flag.entry.when, `#/core/decisions/${flag.index}`, undefined);
    for (const [name, meta] of knobs) checkWhen(meta.when, `#/core/knobs/${pointerEscape(name)}`, undefined);
    for (const [name, info] of collections) {
      for (const [field, shape] of info.fields) checkWhen(shape.when, `#/core/collections/${pointerEscape(name)}/record/${pointerEscape(field)}`, name);
    }
    for (const record of model.templateOrder) {
      const { template, at, perRow, inputs } = record;
      checkWhen(template.when, at, perRow ? template.collection : undefined);
      const schema = perRow ? collections.get(template.collection) : undefined;
      const sources = [
        ["title", template.title],
        ["text", template.text],
        ["test", template.test]
      ];
      if (isObject(template.bindings)) {
        for (const [bindingId, binding] of Object.entries(template.bindings)) {
          if (bindingId.startsWith("_") || !isObject(binding) || !isObject(binding.map)) continue;
          for (const [key, phrase] of Object.entries(binding.map)) sources.push([`bindings/${pointerEscape(bindingId)}/map/${pointerEscape(key)}`, phrase]);
        }
      }
      const titleForms = new Set(["instance", "bind", "row"]);
      for (const [label, value] of sources) {
        if (value === undefined) continue;
        for (const found of contractScanPlaceholders(value, `${at}/${label}`)) {
          const parsed = contractParsePlaceholder(found.body);
          if (!parsed) {
            error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `${found.pointer} carries unknown placeholder ${found.raw}; the five legal forms are {{instance}}, {{knob-cite:<knob>}}, {{surface:<input>}}, {{bind:<id>}}, and {{row.<field>}}`);
            continue;
          }
          if (label === "title" && !titleForms.has(parsed.form)) {
            error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `${found.pointer} carries ${found.raw}; a title admits only {{instance}}, {{bind:<id>}}, and {{row.<field>}} — no knob citation or test input reaches a heading`);
          }
          if (parsed.form === "knob-cite" && !knobs.has(parsed.name)) {
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${found.pointer} cites undeclared knob ${JSON.stringify(parsed.name)}`);
          }
          if (parsed.form === "surface" && !inputs.has(parsed.name)) {
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${found.pointer} reads undeclared test input ${JSON.stringify(parsed.name)}`);
          }
          if (parsed.form === "bind" && (!isObject(template.bindings) || !own(template.bindings, parsed.name))) {
            error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${found.pointer} reads undeclared binding ${JSON.stringify(parsed.name)}`);
          }
          if (parsed.form === "row") {
            if (!perRow) {
              error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `${found.pointer} reads ${found.raw}, but the template does not expand per-row`);
            } else if (parsed.name.startsWith("_")) {
              error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `${found.pointer} reads annotation ${JSON.stringify(parsed.name)}; annotations are never interpolated`);
            } else if (schema && !schema.fields.has(parsed.name)) {
              error("CONTRACT_REFERENCE", CONTRACT_SECTION, display, `${found.pointer} reads row field ${JSON.stringify(parsed.name)}, which collection ${JSON.stringify(template.collection)} does not declare`);
            }
          }
        }
      }
    }
  }

  // §10.8 steps 1–2, computed without reporting: the flag dependency graph is
  // acyclic, so liveness resolves in one pass and pruning cascades cleanly.
  // Reporting the cycle is the caller's job, so the same computation serves
  // the two-pass key set and the §7 build-record checks.
  function contractLiveness(model, answers) {
    const { flags } = model;
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
      const when = flags.get(name)?.entry?.when;
      if (isObject(when) && isObject(when.flag)) {
        for (const dependency of Object.keys(when.flag)) if (flags.has(dependency)) visit(dependency, stack);
      }
      stack.pop();
      state.set(name, "done");
    };
    for (const name of flags.keys()) visit(name, []);
    if (cycle) return { liveFlags: new Set(flags.keys()), liveKnobs: new Set(model.knobs.keys()), cycle };
    const memo = new Map();
    const resolve = name => {
      if (memo.has(name)) return memo.get(name);
      const when = flags.get(name)?.entry?.when;
      let live = true;
      if (isObject(when) && isObject(when.flag)) {
        for (const [dependency, values] of Object.entries(when.flag)) {
          if (!flags.has(dependency) || !resolve(dependency) || !own(answers, dependency) || !Array.isArray(values) || !values.includes(answers[dependency])) {
            live = false;
            break;
          }
        }
      }
      memo.set(name, live);
      return live;
    };
    const liveFlags = new Set();
    for (const name of flags.keys()) if (resolve(name)) liveFlags.add(name);
    const liveKnobs = new Set();
    for (const [name, meta] of model.knobs) {
      if (contractWhenSatisfied(meta.when, answers, liveFlags, undefined)) liveKnobs.add(name);
    }
    return { liveFlags, liveKnobs, cycle: undefined };
  }

  // §10.7's closed citation grammar: a §4a `tuning:<key>` reference, or a
  // chapter-section reference `<file>.md#<anchor>` carrying the extension, as
  // §1a reads one. A citation MUST resolve, and to a legal target: never the
  // generated block, and never a section any authority tag reaches — a test
  // whose pass condition lives in prose the builder may vary is the divergence
  // this layer exists to abolish. A tuning key is legal for the opposite
  // reason: the key is stable and the snapshot pins its value per build.
  function contractResolveCitation(value, at, display, ctx) {
    if (typeof value !== "string" || !value.trim()) {
      error("CONTRACT_CITATION_GRAMMAR", CONTRACT_SECTION, display, `${at} citation must be a non-empty string`);
      return;
    }
    if (value.startsWith("tuning:")) {
      const key = value.slice("tuning:".length);
      if (!ctx.tuningKeys.has(key) && !ctx.contractKeys.has(key)) {
        error("CONTRACT_CITATION_DANGLING", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, which resolves to no tuning.json key and no contract knob key`);
      }
      return;
    }
    const hash = value.indexOf("#");
    if (hash <= 0 || hash === value.length - 1 || value.includes(" ") || !value.slice(0, hash).endsWith(".md")) {
      error("CONTRACT_CITATION_GRAMMAR", CONTRACT_SECTION, display, `${at} citation ${JSON.stringify(value)} is outside the closed grammar: a \`tuning:<key>\` reference, or a \`<file>.md#<anchor>\` chapter-section reference carrying its extension, and nothing else`);
      return;
    }
    const filePart = value.slice(0, hash);
    const fragment = decodeURIComponent(value.slice(hash + 1));
    const file = ctx.resolvePath(filePart, `${at} citation target`, CONTRACT_SECTION, "CONTRACT_CITATION_DANGLING", { mustExist: true, kind: "file", display });
    if (!file) return;
    const text = host.readText(file);
    const lines = text.split(/\r?\n/);
    const headings = lines.map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      return match ? { level: match[1].length, slug: markdownSlug(match[2]), index, line: index + 1 } : undefined;
    }).filter(Boolean);
    const heading = headings.find(item => item.slug === fragment.toLowerCase());
    if (!heading) {
      error("CONTRACT_CITATION_DANGLING", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, whose fragment matches no Markdown heading in ${slash(filePart)}`);
      return;
    }
    // No reference of any kind may target a generated AT or an anchor inside
    // the generated block: the block is itself a function of what would cite it.
    const region = ctx.generatedRegions.get(slash(filePart));
    if (region !== undefined && heading.line >= region) {
      error("CONTRACT_CITATION_BLOCK", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, an anchor inside the generated contracts block; no reference may target a generated acceptance test`);
      return;
    }
    // A citation's target must be Fixed *throughout*. A tag anywhere inside the
    // cited section, not merely at its head, means some statement a reader
    // finds under that anchor is one the builder may vary — and the citation
    // does not say which statement it meant. Enclosing sections count too: a
    // tag scoped above the anchor governs it by inheritance. A tag scoped to a
    // sub-topic *below* the cited anchor is what the reader would land on, so
    // it counts as well; the cure is a finer anchor.
    const tagged = line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("> DELEGATED:")) return "Delegated";
      if (trimmed.startsWith("> PERSONALIZATION:")) return "a Personalization";
      return undefined;
    };
    const sectionEnd = anchor => headings.find(item => item.index > anchor.index && item.level <= anchor.level)?.index ?? lines.length;
    const citedEnd = sectionEnd(heading);
    let fenced = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (/^\s*```/.test(lines[index])) { fenced = !fenced; continue; }
      if (fenced) continue;
      const found = tagged(lines[index]);
      if (!found) continue;
      // Inside the cited section: any tag at all disqualifies it. A section
      // that hands any part of itself away can no longer be relied on whole,
      // and the citation does not say which part it meant.
      if (index > heading.index && index < citedEnd) {
        error("CONTRACT_CITATION_AUTHORITY", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, whose target section carries ${found} authority tag at line ${index + 1}; a legal target carries no tag anywhere inside it`);
        return;
      }
      // Outside it: §2 scopes a tag from its own line to the end of the
      // heading section holding it, and that section ends at the next heading
      // of the same or a higher level — so an enclosing section's tag reaches
      // down into this one, while a sibling's stops short of it.
      const owner = [...headings].reverse().find(item => item.index < index);
      if (owner && index < heading.index && heading.index < sectionEnd(owner)) {
        error("CONTRACT_CITATION_AUTHORITY", CONTRACT_SECTION, display, `${at} cites ${JSON.stringify(value)}, which sits inside the scope of ${found} authority tag at line ${index + 1}; a legal target is covered by no enclosing tag`);
        return;
      }
    }
  }

  function contractValidateRows(rows, schemaName, info, source, display, ctx) {
    if (!Array.isArray(rows)) {
      error("CONTRACT_ROWS_SHAPE", CONTRACT_SECTION, display, `${source} must be an array of rows`);
      return [];
    }
    const uniqueSeen = new Map();
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
        if (typeof value === "string") {
          if (Array.isArray(shape.options) && !shape.options.includes(value)) {
            error("CONTRACT_ROW_CHOICE", CONTRACT_SECTION, display, `${at}/${field} is ${JSON.stringify(value)}, which is outside the field's closed option set (${shape.options.join(", ")})`);
          }
          // §10.7 caps `options` values at 64 characters; a `pattern` field
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

  // §10.10's byte layout, rendered from the canonical inputs: core × surface ×
  // bound rows, and nothing else.
  function contractRenderBlock(instance, display) {
    const lines = [contractBeginMarker(instance.id, `${instance.core.id}-${instance.core.version}`)];
    let count = 0;
    for (const record of instance.model.templateOrder) {
      const { template, perRow } = record;
      if (!instance.liveTemplates.has(record)) continue;
      const rows = perRow ? instance.expandedRows.get(record) ?? [] : [undefined];
      for (const row of rows) {
        const report = message => error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `#/core/templates/${record.index} ${message}`);
        const phrases = new Map();
        // A placeholder left standing *because* of a fault already reported is
        // that fault said twice. These two are the whole set: a binding with no
        // phrase for the recorded value, and a declared test input the surface
        // did not fill. Both are named by their own checks, so the leftover
        // report below skips them.
        const accountedFor = new Set();
        for (const found of contractScanPlaceholders([template.title, template.text, template.test], "")) {
          if (!contractParsePlaceholder(found.body)) accountedFor.add(found.body);
        }
        if (isObject(template.bindings)) {
          for (const [bindingId, binding] of Object.entries(template.bindings)) {
            if (bindingId.startsWith("_") || !isObject(binding) || !isObject(binding.map)) continue;
            const key = own(binding, "flag") ? instance.surface.answers?.[binding.flag] : row?.[binding.row_field];
            if (!own(binding.map, key)) {
              error("CONTRACT_BINDING_MAP", CONTRACT_SECTION, display, `#/core/templates/${record.index}/bindings/${pointerEscape(bindingId)} has no phrase for the recorded value ${JSON.stringify(key)}; a live template's binding map MUST cover every value that can co-occur with its liveness`);
              accountedFor.add(`bind:${bindingId}`);
              continue;
            }
            phrases.set(bindingId, binding.map[key]);
          }
        }
        for (const name of record.inputs.keys()) {
          if (!own(instance.surface.test_inputs?.[template.id] ?? {}, name)) accountedFor.add(`surface:${name}`);
        }
        const expanding = new Set();
        const resolve = body => {
          const parsed = contractParsePlaceholder(body);
          if (!parsed) return undefined;
          if (parsed.form === "instance") return instance.id;
          if (parsed.form === "knob-cite") return `tuning:contracts.${instance.id}.${parsed.name}`;
          if (parsed.form === "surface") return instance.surface.test_inputs?.[template.id]?.[parsed.name];
          if (parsed.form === "bind") {
            const phrase = phrases.get(parsed.name);
            if (phrase === undefined) return undefined;
            // A binding phrase is core-authored template text, so its own
            // placeholders resolve in the same single pass; supplied values are
            // never re-scanned. A phrase MUST NOT nest a `{{bind:}}` — the
            // shape check above reports that — and this guard makes the
            // renderer terminate anyway rather than recurse on a bad core.
            if (expanding.has(parsed.name)) return undefined;
            expanding.add(parsed.name);
            try { return contractSubstitute(phrase, resolve, report); }
            finally { expanding.delete(parsed.name); }
          }
          if (parsed.form === "row") return row?.[parsed.name];
          return undefined;
        };
        const title = contractSubstitute(template.title ?? "", resolve, report);
        const testBlock = contractStripAnnotations(contractSubstitute(template.test ?? {}, resolve, report));
        const text = contractSubstitute(template.text ?? "", resolve, report);
        const name = row === undefined ? `${instance.id}/${template.id}` : `${instance.id}/${template.id}/${row.id}`;
        for (const rendered of [title, text]) {
          for (const leftover of String(rendered).matchAll(CONTRACT_PLACEHOLDER_PATTERN)) {
            if (accountedFor.has(leftover[1])) continue;
            error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `AT ${name} leaves ${leftover[0]} unresolved; an unresolvable placeholder in a live template is a validation failure`);
          }
        }
        for (const leftover of contractScanPlaceholders(testBlock, "test")) {
          if (accountedFor.has(leftover.body)) continue;
          error("CONTRACT_PLACEHOLDER", CONTRACT_SECTION, display, `AT ${name} leaves ${leftover.raw} unresolved in its test block`);
        }
        // A generated test is an acceptance test like any other, so it answers
        // to §6 in the shape it actually lands in — after substitution, where a
        // whole-value test input has become a real object. Checking the
        // template instead would check a shape no builder ever reads.
        // A template with no `test` object at all renders an empty block, and
        // the required-field check owns that: handing `{}` to the §6 pass would
        // report one absence twice, in two vocabularies.
        if (isObject(template.test) && isObject(testBlock)) {
          if (own(testBlock, "direction_claims")) {
            // §9.11 coverage runs two ways and a generated test's existence
            // depends on the answers, so a claim covered only by one could
            // vanish with an edit to a surface. Generated tests make no
            // direction claims; game-local ones carry them. The field is then
            // dropped before the §6 pass rather than resolved: reporting it
            // dangling as well would be this one fault said twice.
            error("CONTRACT_TEST_DIRECTION_CLAIMS", CONTRACT_SECTION, display, `AT ${name} carries direction_claims; a generated test may not claim direction coverage, whose two-way completeness game-local tests own`);
          }
          // The finding names the instance file, not the build plan: the block
          // is machine-written, so the fix is always in the core or the surface.
          // `directionCtx` is deliberately not passed — a generated test earns
          // no §9.11 coverage credit, per the ban just above.
          // The §6 pass reads the block without `direction_claims`: the ban
          // above owns that field, and resolving it here would report the one
          // fault a second time as a dangling claim.
          const ctx = instance.ctx;
          const { direction_claims: _claims, ...checkable } = testBlock;
          if (ctx) validateDescriptor(checkable, `AT ${name}`, display, undefined, ctx.resolvePath, ctx.exprContext, undefined, ctx.graphContext, ctx.manifest);
        }
        lines.push("", `### AT ${name} — ${title}`, "", "```test", ...JSON.stringify(testBlock, null, 2).split("\n"), "```", "", text);
        count += 1;
      }
    }
    lines.push("", contractEndMarker(instance.id, `${instance.core.id}-${instance.core.version}`));
    return { lines, count };
  }

  function contractValidateInstance(entry, ctx) {
    const { display, instance: document } = entry;
    contractClosed(document, ["format", "instance", "core", "surface", "rows"], ["format", "instance", "core", "surface"], display, "#");
    if (own(document, "format") && document.format !== CONTRACT_INSTANCE_FORMAT) {
      error("CONTRACT_FORMAT", CONTRACT_SECTION, display, `#/format must be ${JSON.stringify(CONTRACT_INSTANCE_FORMAT)}, got ${JSON.stringify(document.format)}`);
    }
    const id = entry.fileId;
    if (document.instance !== id) {
      error("CONTRACT_INSTANCE_FILENAME", CONTRACT_SECTION, display, `#/instance is ${JSON.stringify(document.instance)} but the filename declares instance ${JSON.stringify(id)}; the filename minus .json is the instance id`);
    }
    if (!isObject(document.core) || !isObject(document.surface)) {
      if (own(document, "core") && !isObject(document.core)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/core must be an object");
      if (own(document, "surface") && !isObject(document.surface)) error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/surface must be an object");
      return undefined;
    }
    const core = document.core;
    const surface = document.surface;
    const model = entry.model ?? contractModelOf(core);
    contractValidateCore(core, display, model);
    contractReferentialIntegrity(core, model, display);

    const answers = isObject(surface.answers) ? surface.answers : {};
    const { liveFlags, liveKnobs, cycle } = contractLiveness(model, answers);
    if (cycle) {
      error("CONTRACT_FLAG_CYCLE", CONTRACT_SECTION, display, `the flag dependency graph carries a cycle (${cycle.join(" → ")}); a core's flag \`when\` graph MUST be acyclic so liveness resolves in one pass`);
    }

    contractClosed(surface, ["answers", "knobs", "test_inputs", "meta"], ["answers"], display, "#/surface");
    if (own(surface, "answers") && !isObject(surface.answers)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/surface/answers must be an object mapping each live flag to an option id");
    }

    // §10.8: every live flag answered; a pruned flag absent. N/A is a recorded
    // decision, silence is a validation failure.
    for (const [name, flag] of model.flags) {
      const answered = own(answers, name);
      if (liveFlags.has(name)) {
        if (!answered) {
          error("CONTRACT_SURFACE_ANSWER", CONTRACT_SECTION, display, `#/surface/answers is missing live flag ${JSON.stringify(name)}; every live decision MUST be answered — "${flag.entry.question ?? "?"}"`);
        } else if (!flag.options.has(answers[name])) {
          error("CONTRACT_SURFACE_ANSWER", CONTRACT_SECTION, display, `#/surface/answers/${pointerEscape(name)} is ${JSON.stringify(answers[name])}, which is not a declared option of that flag (${[...flag.options.keys()].join(", ")})`);
        }
      } else if (answered) {
        error("CONTRACT_SURFACE_ANSWER", CONTRACT_SECTION, display, `#/surface/answers/${pointerEscape(name)} answers a flag pruned by its own \`when\`; a pruned flag is unasked and MUST be absent`);
      }
    }
    for (const name of Object.keys(answers)) {
      if (name.startsWith("_")) continue;
      if (!model.flags.has(name)) {
        error("CONTRACT_SURFACE_ANSWER", CONTRACT_SECTION, display, `#/surface/answers/${pointerEscape(name)} names no declared flag; the surface is closed`);
      }
    }

    // §10.8 step 2 and §10.5: a knob whose `when` is unsatisfied is pruned;
    // every unpruned knob MUST be set, and a pruned one MUST be absent.
    const surfaceKnobs = isObject(surface.knobs) ? surface.knobs : {};
    if (own(surface, "knobs") && !isObject(surface.knobs)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/surface/knobs must be an object mapping each unpruned knob to its value");
    }
    if (liveKnobs.size > 0 && !own(surface, "knobs")) {
      error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `#/surface is missing \`knobs\`, which is required exactly when the declaration set is non-empty after liveness (${liveKnobs.size} unpruned knob(s))`);
    }
    if (liveKnobs.size === 0 && own(surface, "knobs")) {
      error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, "#/surface/knobs is present with no unpruned knob to set; the field MUST be absent then");
    }
    const knobValues = new Map();
    for (const [name, meta] of model.knobs) {
      const at = `#/surface/knobs/${pointerEscape(name)}`;
      const present = own(surfaceKnobs, name);
      if (!liveKnobs.has(name)) {
        if (present) error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} sets a knob pruned by its own \`when\`; a value for machinery that must not exist is as illegal as silence about machinery that must`);
        continue;
      }
      if (!present) {
        error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} is missing; every unpruned knob MUST be set — defaults are guidance for the author, never fallback values`);
        continue;
      }
      const raw = surfaceKnobs[name];
      const instanceDefined = meta.unit === "instance-defined";
      let value;
      if (instanceDefined) {
        if (!isObject(raw)) {
          error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} must be {value, unit}: the core declares unit "instance-defined", so the surface supplies the unit alongside the value`);
          continue;
        }
        contractClosed(raw, ["value", "unit"], ["value", "unit"], display, at);
        value = raw.value;
        if (typeof raw.unit !== "string" || CONTRACT_UNIT_SENTINELS.has(raw.unit) || !CONTRACT_KEBAB.test(raw.unit)) {
          error("CONTRACT_KNOB_UNIT", CONTRACT_SECTION, display, `${at}/unit must be a non-empty kebab-case unit name; the two reserved sentinels are forbidden here — a surface names a real unit or the core should have said "dimensionless"`);
        }
      } else {
        if (isObject(raw)) {
          error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} carries {value, unit}, which is legal exactly when the knob's meta declares unit "instance-defined"`);
          continue;
        }
        value = raw;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} value must be a finite number, got ${JSON.stringify(value)}`);
        continue;
      }
      if (meta.type === "integer" && !Number.isInteger(value)) {
        error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} value ${value} must be an integer, as the knob's meta declares`);
      }
      if (isObject(meta.range)) {
        if (typeof meta.range.min === "number" && value < meta.range.min) {
          error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} value ${value} is below the core's declared minimum ${meta.range.min} (bounds inclusive)`);
        }
        if (typeof meta.range.max === "number" && value > meta.range.max) {
          error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `${at} value ${value} is above the core's declared maximum ${meta.range.max} (bounds inclusive)`);
        }
      }
      knobValues.set(name, value);
    }
    for (const name of Object.keys(surfaceKnobs)) {
      if (name.startsWith("_")) continue;
      if (!model.knobs.has(name)) {
        error("CONTRACT_SURFACE_KNOB", CONTRACT_SECTION, display, `#/surface/knobs/${pointerEscape(name)} names no declared knob; the surface is closed`);
      }
    }

    // §10.6: the surface meta block is the certification
    // pin only, targeting unpruned knobs, and only in the false→true direction.
    if (own(surface, "meta") && contractType(surface.meta, "object", display, "#/surface", "meta")) {
      for (const [name, pin] of Object.entries(surface.meta)) {
        if (name.startsWith("_")) continue;
        const at = `#/surface/meta/${pointerEscape(name)}`;
        if (!model.knobs.has(name)) {
          error("CONTRACT_SURFACE_META", CONTRACT_SECTION, display, `${at} names no declared knob`);
          continue;
        }
        if (!liveKnobs.has(name)) {
          error("CONTRACT_SURFACE_META", CONTRACT_SECTION, display, `${at} targets a pruned knob; a meta entry may target unpruned knobs only`);
          continue;
        }
        if (!isObject(pin)) {
          error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be an object carrying the certification pin`);
          continue;
        }
        contractClosed(pin, ["must_match"], ["must_match"], display, at);
        if (own(pin, "must_match") && pin.must_match !== true) {
          error("CONTRACT_SURFACE_META", CONTRACT_SECTION, display, `${at}/must_match is ${JSON.stringify(pin.must_match)}; the pin is a claim, so the only value it may carry is true — a surface can add a certification pin, never record the absence of one`);
        }
      }
    }

    // Rows: each core-declared schema is bound by exactly one of a manifest
    // collection's `instance` member or the instance file's inline `rows` entry.
    const inlineRows = isObject(document.rows) ? document.rows : undefined;
    if (own(document, "rows") && !isObject(document.rows)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/rows must map a collection-schema name to an array of rows");
    }
    if (inlineRows) {
      for (const name of Object.keys(inlineRows)) {
        if (name.startsWith("_")) continue;
        if (!model.collections.has(name)) {
          error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, display, `#/rows/${pointerEscape(name)} names no collection schema the vendored core declares`);
        }
      }
    }
    const boundRows = new Map();
    const rowCtx = { ...ctx, answers, liveFlags, contractKeys: ctx.contractKeys };
    for (const [name, info] of model.collections) {
      const inline = inlineRows && own(inlineRows, name) ? inlineRows[name] : undefined;
      const external = ctx.bindings.get(`${id}#${name}`);
      if (inline !== undefined && external) {
        error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, display, `collection schema ${JSON.stringify(name)} is bound twice — inline at #/rows and by manifest collection ${JSON.stringify(external.collectionId)}; two row sets would make the expansion ambiguous`);
      }
      if (inline === undefined && !external) {
        error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, display, `collection schema ${JSON.stringify(name)} is bound by neither an inline \`rows\` entry nor a manifest collection's \`instance\` field; an unbound schema is a validation failure, never a silent zero-expansion`);
        boundRows.set(name, []);
        continue;
      }
      if (external) {
        // §10.7: a bound collection MUST carry Fixed authority and its records
        // MUST NOT carry per-record authority overrides — rows are
        // instantiation inputs, and one personalization-authority row would
        // make the generated AT set per-build. The check reads the binding
        // itself, so a doubly-bound schema is still held to it.
        const collection = external.info?.collection;
        const level = isObject(collection?.authority) ? collection.authority.level : undefined;
        if (level !== undefined && level !== "fixed") {
          error("CONTRACT_ROW_AUTHORITY", CONTRACT_SECTION, display, `manifest collection ${JSON.stringify(external.collectionId)} binds schema ${JSON.stringify(name)} but declares ${JSON.stringify(level)} authority; bound rows MUST be Fixed — one personalization-authority row would make the generated test set per-build`);
        }
        const records = (external.info?.records ?? []).map(record => record.record);
        for (const record of records) {
          if (isObject(record) && own(record, "authority")) {
            error("CONTRACT_ROW_AUTHORITY", CONTRACT_SECTION, display, `a record of manifest collection ${JSON.stringify(external.collectionId)} carries a per-record authority override; bound rows admit none`);
            break;
          }
        }
        if (inline === undefined) boundRows.set(name, contractValidateRows(records, name, info, `${external.collectionId} rows`, display, rowCtx));
      }
      if (inline !== undefined) {
        boundRows.set(name, contractValidateRows(inline, name, info, `#/rows/${pointerEscape(name)}`, display, rowCtx));
      }
    }

    // §10.8 steps 3–5: template liveness and per-row expansion.
    const liveTemplates = new Set();
    const expandedRows = new Map();
    for (const record of model.templateOrder) {
      const { template, perRow } = record;
      const referencedKnobs = new Set();
      const readFlags = new Set();
      const sources = [template.text, template.test];
      if (isObject(template.bindings)) {
        for (const [bindingId, binding] of Object.entries(template.bindings)) {
          if (bindingId.startsWith("_") || !isObject(binding)) continue;
          if (typeof binding.flag === "string") readFlags.add(binding.flag);
          if (isObject(binding.map)) sources.push(...Object.values(binding.map));
        }
      }
      for (const source of sources) {
        if (source === undefined) continue;
        for (const found of contractScanPlaceholders(source, "")) {
          const parsed = contractParsePlaceholder(found.body);
          if (parsed?.form === "knob-cite") referencedKnobs.add(parsed.name);
        }
      }
      let live = [...referencedKnobs].every(name => !model.knobs.has(name) || liveKnobs.has(name))
        && [...readFlags].every(name => liveFlags.has(name))
        && contractWhenSatisfied(isObject(template.when) ? { flag: template.when.flag } : undefined, answers, liveFlags, undefined);
      if (live && perRow) {
        // §10.8 step 5: a row matches when the `row` domain is satisfied *and*
        // the row actually carries every field the template reads. A row that
        // legally lacks one — its own `when` makes the field absent — does not
        // expand, rather than expanding into a hole. A row that *illegally*
        // lacks one has already failed row validation above.
        const readFields = contractTemplateRowFields(template);
        const rows = (boundRows.get(template.collection) ?? []).filter(row =>
          contractWhenSatisfied(isObject(template.when) ? { row: template.when.row } : undefined, answers, liveFlags, row)
          && [...readFields].every(field => own(row, field)));
        if (rows.length === 0) live = false;
        else expandedRows.set(record, rows);
      }
      if (live) liveTemplates.add(record);
    }

    // `test_inputs` is required exactly when a live template declares a
    // non-empty `surface_inputs`, and forbidden otherwise. A live template with
    // unfilled inputs is a validation failure.
    const expectedInputs = new Set();
    for (const record of liveTemplates) if (record.inputs.size > 0) expectedInputs.add(record.template.id);
    const testInputs = isObject(surface.test_inputs) ? surface.test_inputs : {};
    if (own(surface, "test_inputs") && !isObject(surface.test_inputs)) {
      error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, "#/surface/test_inputs must be an object keyed by template id");
    }
    if (expectedInputs.size > 0 && !own(surface, "test_inputs")) {
      error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `#/surface is missing \`test_inputs\`; ${[...expectedInputs].map(item => JSON.stringify(item)).join(", ")} ${expectedInputs.size === 1 ? "is a live template that declares" : "are live templates that declare"} test inputs`);
    }
    if (expectedInputs.size === 0 && own(surface, "test_inputs")) {
      error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, "#/surface/test_inputs is present with no live template declaring inputs; the field MUST be absent then");
    }
    for (const [templateId, filled] of Object.entries(testInputs)) {
      if (templateId.startsWith("_")) continue;
      const at = `#/surface/test_inputs/${pointerEscape(templateId)}`;
      const record = model.templates.get(templateId);
      if (!record) {
        error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `${at} names no declared template`);
        continue;
      }
      if (!expectedInputs.has(templateId)) {
        error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `${at} fills inputs for a template that is ${liveTemplates.has(record) ? "live but declares no inputs" : "not live under the recorded answers"}; the entry is forbidden then`);
        continue;
      }
      if (!isObject(filled)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, display, `${at} must be an object keyed exactly by that template's surface_inputs names`);
        continue;
      }
      for (const name of Object.keys(filled)) {
        if (name.startsWith("_")) continue;
        if (!record.inputs.has(name)) error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `${at}/${pointerEscape(name)} names no input the template declares`);
      }
      for (const [name, declaration] of record.inputs) {
        if (!own(filled, name)) {
          error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `${at} is missing declared input ${JSON.stringify(name)}; a live template with unfilled inputs is a validation failure`);
          continue;
        }
        const value = filled[name];
        if (declaration.type && !schemaTypeMatches(value, declaration.type)) {
          error("CONTRACT_SURFACE_INPUTS", CONTRACT_SECTION, display, `${at}/${pointerEscape(name)} must be ${declaration.type}, got ${JSON.stringify(value)}`);
        }
        contractInjectionBan(value, display, `${at}/${pointerEscape(name)}`, "test input");
      }
    }

    // §10.8: core invariants are checked over the surface's own values at
    // package validation, and again over the resolved snapshot when a build
    // record is validated. An invariant is live exactly when every knob it
    // references is unpruned — liveness is purely derived, never declared.
    if (Array.isArray(core.invariants)) {
      const exprContext = { tuning: new Map(), stateNumbers: new Set(), stateSets: new Map(), collections: new Map(), knobs: knobValues, liveKnobs };
      core.invariants.forEach((invariant, index) => {
        if (!isObject(invariant) || !own(invariant, "assert")) return;
        if (model.malformedInvariants.has(index)) return;
        const referenced = contractInvariantKnobs(invariant.assert);
        // Undeclared names were already reported by the shape pass. Evaluation
        // waits for every referenced knob to be both live and set.
        if (!referenced.every(name => model.knobs.has(name) && liveKnobs.has(name) && knobValues.has(name))) return;
        const result = validateExprNode(invariant.assert, exprContext, display, `#/core/invariants/${index}/assert`);
        if (result.available && result.type === "boolean" && result.value !== true) {
          error("CONTRACT_INVARIANT_FALSE", CONTRACT_SECTION, display, `#/core/invariants/${index} ${JSON.stringify(invariant.id)} evaluates false over this surface's values: ${invariant.message ?? ""}`.trim());
        }
      });
    }

    return {
      id,
      display,
      core,
      surface,
      model,
      liveFlags,
      liveKnobs,
      liveTemplates,
      expandedRows,
      knobValues,
      ctx,
      cyclic: Boolean(cycle)
    };
  }

  // §10.2's folder rules, and the whole layer's entry point. The rules bind on
  // the directory's existence, not on activation, so junk in an instance-less
  // `contracts/` is already a failure rather than a latent one.
  function validateContracts(packageRoot, manifest, contentContext, resolvePath, tuningDoc, exprContext, directionCtx, graphContext) {
    let entries;
    try { entries = host.readDir(packageRoot); }
    catch { return undefined; }
    const exact = entries.find(item => item.isDirectory && item.name === CONTRACT_DIRECTORY);
    for (const item of entries) {
      if (!item.isDirectory || item.name === CONTRACT_DIRECTORY) continue;
      if (item.name.toLowerCase() === CONTRACT_DIRECTORY) {
        warning("CONTRACT_FOLDER_CASE", CONTRACT_SECTION, `${item.name}/`, `the reserved contracts directory is exact lowercase \`contracts\`, compared as a literal path string; a directory named ${JSON.stringify(item.name)} is not the reserved folder here, but a case-insensitive filesystem would reach it through \`contracts/\` and change the verdict`);
      }
    }
    if (!exact) return undefined;

    // Three §10 duties are deliberately not package-validation checks, and the
    // conformance README names them under Deliberate limits: §10.3's core
    // digest (certification-layer — no package rule reads it and no authoring
    // tool computes it), §10.12's adoption value-equality report
    // (adoption-checklist tooling, emitted once at adoption), and the resolved
    // flattened view (a tooling SHOULD). The `skipped` channel is reserved for
    // checks a host could not perform, which is a different thing.
    const directory = path.join(packageRoot, CONTRACT_DIRECTORY);
    const listing = host.readDir(directory).filter(item => !item.name.startsWith("."));
    // §10.2 rule 5: a package whose `contracts/` predates the reservation must
    // rename it, and a validator SHOULD name that migration rather than
    // reporting a folder full of invalid instances.
    // The test is "does this even claim to be an instance file", not "is it a
    // valid one": a file declaring the wrong `format` is a typo to report as
    // CONTRACT_FORMAT, not evidence that the whole folder is someone else's.
    const claimsToBeAnInstance = item => {
      if (!item.isFile || !item.name.endsWith(".json")) return false;
      try {
        const parsed = JSON.parse(host.readText(path.join(directory, item.name)));
        return isObject(parsed) && own(parsed, "format");
      } catch { return false; }
    };
    if (listing.length > 0 && !listing.some(claimsToBeAnInstance)) {
      error("CONTRACT_FOLDER_RESERVED", CONTRACT_SECTION, `${CONTRACT_DIRECTORY}/`, `holds ${listing.length} entr${listing.length === 1 ? "y" : "ies"} and nothing that claims to be a contract instance; \`contracts\` is a reserved package-root directory name, so a designer-owned folder of that name MUST be renamed on adoption of this revision`);
      // Naming the migration replaces nothing: the folder rules bind on the
      // directory's existence, so its contents are still reported below.
    }

    const files = [];
    for (const item of listing) {
      const relative = `${CONTRACT_DIRECTORY}/${item.name}`;
      if (item.isDirectory) {
        error("CONTRACT_FOLDER_ENTRY", CONTRACT_SECTION, relative, "the reserved contracts/ directory holds contract instance files only; a subdirectory is a validation failure");
        continue;
      }
      if (!item.name.endsWith(".json")) {
        error("CONTRACT_FOLDER_ENTRY", CONTRACT_SECTION, relative, "every file in contracts/ MUST be a contract instance; a stray file is a validation failure");
        continue;
      }
      const fileId = item.name.slice(0, -".json".length);
      if (fileId.includes(".")) {
        error("CONTRACT_INSTANCE_FILENAME", CONTRACT_SECTION, relative, "instance ids are dot-free, so the filename minus .json is unambiguous; a name like stamina.instance.json is illegal");
        continue;
      }
      if (!contractKebab(fileId, relative, "#", "instance id")) continue;
      const document = parseJsonFile(path.join(directory, item.name), relative, CONTRACT_SECTION, "CONTRACT_INSTANCE_JSON");
      if (document === undefined) continue;
      if (!isObject(document)) {
        error("CONTRACT_ENVELOPE_TYPE", CONTRACT_SECTION, relative, "a contract instance file's top level must be an object");
        continue;
      }
      files.push({ fileId, display: relative, instance: document });
    }
    if (files.length === 0) return undefined;
    files.sort((left, right) => (left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0));

    // §10.7's binding field: `contracts/<instance>.json#<schema>`.
    const bindings = new Map();
    if (Array.isArray(manifest?.content)) {
      manifest.content.forEach((collection, index) => {
        if (!isObject(collection) || typeof collection.instance !== "string") return;
        const at = `content[${index}].instance`;
        const match = /^contracts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json#([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(collection.instance);
        if (!match) {
          error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, "manifest.json", `${at} must be exactly \`contracts/<instance>.json#<schema>\`, got ${JSON.stringify(collection.instance)}`);
          return;
        }
        const [, instanceId, schemaName] = match;
        const target = files.find(file => file.fileId === instanceId);
        if (!target) {
          error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, "manifest.json", `${at} names instance ${JSON.stringify(instanceId)}, for which contracts/${instanceId}.json does not exist`);
          return;
        }
        // The fragment is a bare key of the vendored core's `collections`
        // object, not a JSON Pointer, so a typo has a name to be reported by.
        const declared = target.instance?.core?.collections;
        if (isObject(declared) && !own(declared, schemaName)) {
          error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, "manifest.json", `${at} names collection schema ${JSON.stringify(schemaName)}, which the core vendored by contracts/${instanceId}.json does not declare`);
          return;
        }
        const key = `${instanceId}#${schemaName}`;
        if (bindings.has(key)) {
          error("CONTRACT_ROWS_BINDING", CONTRACT_SECTION, "manifest.json", `${at} binds ${JSON.stringify(collection.instance)}, which manifest collection ${JSON.stringify(bindings.get(key).collectionId)} already binds; a schema bound twice makes the expansion ambiguous`);
          return;
        }
        bindings.set(key, { collectionId: collection.id, info: contentContext?.collections?.get(collection.id) });
      });
    }

    // The generated block's own extent, so no citation may target an anchor
    // inside it, and so block equality has a region to compare.
    const planRelative = typeof manifest?.build?.plan === "string" ? manifest.build.plan : "05-build-plan.md";
    const planFile = path.join(packageRoot, planRelative);
    const planText = host.exists(planFile) && host.isFile(planFile) ? host.readText(planFile) : undefined;
    const generatedRegions = new Map();
    let blockIndex = planText === undefined ? -1 : planText.indexOf("<!-- opengdd:contracts:generated:begin ");
    if (planText !== undefined && blockIndex >= 0) {
      generatedRegions.set(slash(planRelative), planText.slice(0, blockIndex).split("\n").length);
    }

    const tuningKeys = new Set([
      ...(isObject(tuningDoc?.tunables) ? Object.keys(tuningDoc.tunables) : []),
      ...(isObject(tuningDoc?.constants) ? Object.keys(tuningDoc.constants) : [])
    ]);
    // The contract key namespace, in two passes. §10.11 says the namespace
    // holds `contracts.<instance>.<knob>` for every *unpruned* knob, so it
    // cannot be read off the declarations: liveness decides it. The first pass
    // computes liveness with no reporting, and the second — the real
    // validation — resolves citations against the key set that results, so a
    // citation of a pruned knob dangles, which is what it does downstream too.
    for (const file of files) file.model = contractModelOf(file.instance?.core);
    const contractKeys = new Set();
    for (const file of files) {
      const answers = isObject(file.instance?.surface?.answers) ? file.instance.surface.answers : {};
      const { liveKnobs } = contractLiveness(file.model, answers);
      for (const name of liveKnobs) contractKeys.add(`contracts.${file.fileId}.${name}`);
    }

    const ctx = { resolvePath, bindings, generatedRegions, tuningKeys, contractKeys, manifest, exprContext, directionCtx, graphContext };
    const instances = [];
    for (const file of files) {
      const result = contractValidateInstance(file, ctx);
      if (result) instances.push(result);
    }

    // §10.2: where two instances declare the same core id and version, their
    // vendored cores MUST be identical — compared as §10.10's canonical
    // serialization, annotations included, which is the same form §10.3's
    // digest covers, so "identical" means one thing in this format and not two.
    const byCore = new Map();
    for (const instance of instances) {
      const id = `${instance.core.id}-${instance.core.version}`;
      const serialized = contractCanonicalCore(instance.core);
      const first = byCore.get(id);
      if (!first) byCore.set(id, { instance, serialized });
      else if (first.serialized !== serialized) {
        error("CONTRACT_CORE_DIVERGENT", CONTRACT_SECTION, instance.display, `vendors a core declaring ${JSON.stringify(id)} whose canonical serialization differs from the one vendored by ${first.instance.display}; a package cannot carry two silently different copies under one name`);
      }
    }

    // §10.10: one marker pair per instance, ordered lexicographically by
    // instance id, at the end of the build plan, compared byte for byte.
    let generatedTotal = 0;
    const blocks = [];
    for (const instance of instances) {
      const rendered = contractRenderBlock(instance, instance.display);
      generatedTotal += rendered.count;
      blocks.push(rendered.lines.join("\n"));
    }
    const expected = `${blocks.join("\n\n")}\n`;
    const planDisplay = slash(planRelative);
    if (instances.length === 0) {
      // Nothing in the folder validated far enough to instantiate. The files
      // have already reported why; demanding a block for them would only
      // repeat it in a form that names no fix.
    } else if (planText === undefined) {
      error("CONTRACT_BLOCK_MISSING", CONTRACT_SECTION, planDisplay, "the package declares contract instances but has no build plan to carry their generated acceptance-test block");
    } else if (blockIndex < 0) {
      error("CONTRACT_BLOCK_MISSING", CONTRACT_SECTION, planDisplay, `carries no generated contracts block; one marker pair per instance is emitted even when an instance has zero live templates, so presence is always visible (expected ${instances.length} pair(s))`);
    } else {
      const prefix = planText.slice(0, blockIndex);
      const actual = planText.slice(blockIndex);
      if (planText.includes("\r")) {
        error("CONTRACT_BLOCK_LAYOUT", CONTRACT_SECTION, planDisplay, "the generated block's byte layout pins LF line endings; the build plan carries CR bytes");
      }
      if (!/[^\n]\n\n$/.test(prefix)) {
        error("CONTRACT_BLOCK_LAYOUT", CONTRACT_SECTION, planDisplay, "exactly one blank line MUST precede the first begin marker", prefix.split("\n").length);
      }
      if (actual !== expected) {
        let at = 0;
        while (at < actual.length && at < expected.length && actual[at] === expected[at]) at += 1;
        const line = prefix.split("\n").length + actual.slice(0, at).split("\n").length - 1;
        const show = value => JSON.stringify(value.slice(at, at + 72));
        error("CONTRACT_BLOCK_EQUALITY", CONTRACT_SECTION, planDisplay, `the generated contracts block is not byte-identical to the instantiation of its instances over the canonical inputs (core × surface × bound rows); first difference at byte ${at} of the block — committed ${show(actual)}, instantiated ${show(expected)}`, line);
      }
    }

    // The live contract key namespace, with the meta §5 reads off each key.
    const knobIndex = new Map();
    for (const instance of instances) {
      for (const name of instance.liveKnobs) {
        knobIndex.set(`contracts.${instance.id}.${name}`, { instance: instance.id, name, meta: instance.model.knobs.get(name) ?? {} });
      }
    }
    return {
      instances,
      generatedTotal,
      contractKeys,
      knobIndex,
      instanceIds: new Set(files.map(file => file.fileId)),
      block: instances.length ? expected : undefined
    };
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
      if (isObject(manifest.build)) {
        const paths = [];
        if (Array.isArray(manifest.build.chapters)) manifest.build.chapters.forEach((value, index) => paths.push([value, `build.chapters[${index}]`]));
        for (const key of ["plan", "tuning", "personalization"]) if (own(manifest.build, key)) paths.push([manifest.build[key], `build.${key}`]);
        for (const [relative, label] of paths) resolvePath(relative, label, "§3", "BUILD_PATH_MISSING", { mustExist: true, kind: "file" });
      }
    }

    const personalization = loadPersonalization(packageRoot, manifest, resolvePath);
    const contentContext = validateContent(packageRoot, manifest, resolvePath, personalization.questions);
    const { rulesetIds, graphContext } = validateManifestConstructs(manifest, contentContext);
    validateRulesetTags(packageRoot, manifest, rulesetIds);
    validatePersonalizationTags(packageRoot, manifest, personalization);
    const { doc: tuningDoc, context: exprContext } = validateTuning(packageRoot, contentContext, rulesetIds, personalization);
    validateMoodDescriptors(manifest);
    validateContentReferences(contentContext, exprContext);
    validateFantasy(packageRoot);
    validateInjectionSurface(packageRoot);
    validateTieBreakLint(packageRoot);
    validateProseLiterals(packageRoot, manifest, tuningDoc);
    if (manifest !== undefined) validateMediaFiles(manifest, "manifest.json", resolvePath);
    const directionCtx = validateDirection(packageRoot, manifest, resolvePath);
    const contractsCtx = validateContracts(packageRoot, manifest, contentContext, resolvePath, tuningDoc, exprContext, directionCtx, graphContext);
    validatePersonalizationOverrides(personalization, tuningDoc, contractsCtx);
    validateProseCitations(packageRoot, manifest, tuningDoc, directionCtx, contractsCtx);
    validateModeTags(packageRoot, manifest, exprContext.clocks);
    validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx, graphContext);
    return {
      packageRoot,
      packageName: manifest?.id ?? path.basename(packageRoot),
      manifest,
      contractsBlock: contractsCtx?.block
    };
  }

  // ---------------------------------------------------------------------------
  // SPEC §7 — opengdd-build.json, validated against a certifying source spec.
  // ---------------------------------------------------------------------------

  function validateBuildManifest(buildFilePath, specRoot) {
    const buildFile = path.resolve(buildFilePath);
    if (!host.exists(buildFile) || !host.isFile(buildFile)) {
      error("BUILD_FILE_MISSING", "§7", ".", `opengdd-build.json does not exist: ${buildFile}`);
      return { packageRoot: buildFile, packageName: path.basename(buildFile) };
    }
    const build = parseJsonFile(buildFile, "opengdd-build.json", "§7", "BUILD_JSON");
    if (build === undefined) return { packageRoot: buildFile, packageName: path.basename(buildFile) };

    const hasLegacyResolvedValues = isObject(build?.resolved_tuning) && own(build.resolved_tuning, "values");
    const schema = loadSchema("opengdd-build.schema.json");
    if (schema) {
      for (const problem of schemaProblems(build, schema, schema)) {
        if (hasLegacyResolvedValues && (
          (problem.path === "#/resolved_tuning/values" && problem.message === "is not an allowed property") ||
          (!own(build.resolved_tuning, "tunables") && problem.path === "#/resolved_tuning" && problem.message === 'is missing required property "tunables"')
        )) continue;
        error("BUILD_SCHEMA", "§7", "opengdd-build.json", `${problem.path} ${problem.message}`);
      }
    }
    if (hasLegacyResolvedValues) {
      error("BUILD_SCHEMA", "§7", "opengdd-build.json", "resolved_tuning.values was renamed to resolved_tuning.tunables in v0.5");
    }

    if (!specRoot) {
      warning(
        "BUILD_SPEC_CROSS_CHECKS_SKIPPED",
        "§7",
        "opengdd-build.json",
        "certifying spec directory was not supplied; skipped source-dependent SPEC §7 package-consistency checks 1–5 (spec id/version, designer, personalization answers, resolved_tuning keys/ranges, and acceptance-test total) and source-backed direction-result checks. Supply the optional <spec-dir> argument to enable them"
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

        const specTuningRelative = specManifest.build?.tuning ?? "tuning.json";
        const specTuningFile = specResolvePath(specTuningRelative, "build.tuning", "§7", "BUILD_SPEC_TUNING_MISSING", { mustExist: true, kind: "file", display: "opengdd-build.json" });
        const specTuning = specTuningFile ? parseJsonFile(specTuningFile, slash(specTuningRelative), "§7", "TUNING_JSON") : undefined;
        // §10.11 amends check 4: the key set is `tuning.json`'s unioned with
        // the contract key set — `contracts.<instance>.<knob>` for every
        // unpruned knob of every instance — each entry sitting in tunables or
        // constants according to its knob's `kind`. A pruned knob enters
        // neither the snapshot nor this check.
        const contractFacts = contractBuildFacts(specResolvedRoot, specManifest);
        if (isObject(specTuning) && isObject(build?.resolved_tuning)) {
          for (const role of ["tunables", "constants"]) {
            const source = isObject(specTuning[role]) ? specTuning[role] : {};
            const contractRole = [...(contractFacts?.roles ?? new Map())].filter(([, value]) => value === role).map(([key]) => key);
            const expected = new Set([...Object.keys(source), ...contractRole]);
            const resolved = isObject(build.resolved_tuning[role]) ? build.resolved_tuning[role] : {};
            const missing = [...expected].filter(key => !own(resolved, key)).sort();
            const extra = Object.keys(resolved).filter(key => !expected.has(key)).sort();
            if (missing.length || extra.length) {
              const details = [
                missing.length ? `missing ${missing.map(key => JSON.stringify(key)).join(", ")}` : undefined,
                extra.length ? `unexpected ${extra.map(key => JSON.stringify(key)).join(", ")}` : undefined
              ].filter(Boolean).join("; ");
              const union = contractRole.length ? `${slash(specTuningRelative)} ${role} keys unioned with the contract ${role} key set` : `${slash(specTuningRelative)} ${role} keys`;
              error("BUILD_TUNING_KEYS", "§7", "opengdd-build.json", `resolved_tuning.${role} keys must exactly equal ${union}: ${details}`);
            }
          }
          if (isObject(specTuning.tunables) && isObject(specTuning.meta) && isObject(build.resolved_tuning.tunables)) {
            for (const [key, value] of Object.entries(build.resolved_tuning.tunables)) {
              const range = specTuning.meta[key]?.range;
              if (own(specTuning.tunables, key) && typeof value === "number" && Number.isFinite(value) && Array.isArray(range) && range.length === 2 && range.every(bound => typeof bound === "number" && Number.isFinite(bound)) && (value < range[0] || value > range[1])) {
                error("BUILD_TUNING_RANGE", "§7", "opengdd-build.json", `resolved_tuning.tunables.${key}=${value} is outside the source inclusive range [${range[0]}, ${range[1]}]`);
              }
            }
          }
          // §10.8: core invariants are re-evaluated over the resolved
          // snapshot. A §5 override legal for its own key can still violate a
          // rule between two knobs that no per-key range can see, and that is a
          // build-record failure rather than a silent self-contradiction.
          const snapshot = new Map();
          for (const role of ["tunables", "constants"]) {
            const resolved = isObject(build.resolved_tuning[role]) ? build.resolved_tuning[role] : {};
            for (const [key, value] of Object.entries(resolved)) if (typeof value === "number") snapshot.set(key, value);
          }
          for (const entry of contractFacts?.invariants ?? []) {
            const knobs = new Map();
            let complete = true;
            for (const name of entry.referenced) {
              const key = `contracts.${entry.instance}.${name}`;
              if (!snapshot.has(key)) { complete = false; break; }
              knobs.set(name, snapshot.get(key));
            }
            if (!complete) continue;
            const exprContext = { tuning: new Map(), stateNumbers: new Set(), stateSets: new Map(), collections: new Map(), knobs };
            const outcome = quietly(() => validateExprNode(entry.invariant.assert, exprContext, "opengdd-build.json", "resolved_tuning"));
            if (outcome.available && outcome.type === "boolean" && outcome.value !== true) {
              error("BUILD_CONTRACT_INVARIANT", "§7", "opengdd-build.json", `core invariant ${JSON.stringify(entry.invariant.id)} of instance ${JSON.stringify(entry.instance)} evaluates false over resolved_tuning: ${entry.invariant.message ?? ""}`.trim());
            }
          }
        }

        // SPEC §7 check 4, `reject` half. An `out_of_range: "reject"` operation
        // whose computed value falls outside the target's inclusive meta.range
        // makes the ANSWER invalid (§5). Nothing fires at package validation,
        // because an answer is not package bytes; here the answer is in the
        // record, so the record does not conform. This is not BUILD_TUNING_RANGE
        // said twice: that check reads the recorded snapshot, which a builder
        // may record perfectly in range while the answer that produced it was
        // rejected outright.
        if (isObject(specTuning) && isObject(build?.personalization?.answers)) {
          const answers = build.personalization.answers;
          const sourceTunables = isObject(specTuning.tunables) ? specTuning.tunables : {};
          const sourceMeta = isObject(specTuning.meta) ? specTuning.meta : {};
          const running = new Map();
          const currentValue = key => (running.has(key) ? running.get(key) : sourceTunables[key]);
          for (const [questionId, question] of sourceQuestions) {
            const answer = own(answers, questionId) ? answers[questionId] : question.default;
            if (question.type === "choice" && Array.isArray(question.options)) {
              const option = question.options.find(item => isObject(item) && item.id === answer);
              if (isObject(option) && isObject(option.tuning_overrides)) {
                for (const [key, value] of Object.entries(option.tuning_overrides)) {
                  if (typeof value === "number" && Number.isFinite(value)) running.set(key, value);
                }
              }
            }
            if (!Array.isArray(question.resolution)) continue;
            for (const operation of question.resolution) {
              if (!isObject(operation) || typeof operation.key !== "string") continue;
              const operand = operation.operand === "answer" ? answer : operation.operand;
              if (typeof operand !== "number" || !Number.isFinite(operand)) continue;
              const current = currentValue(operation.key);
              let next;
              if (operation.operation === "replace") next = operand;
              else if (operation.operation === "add" && typeof current === "number") next = current + operand;
              else if (operation.operation === "multiply" && typeof current === "number") next = current * operand;
              if (typeof next !== "number" || !Number.isFinite(next)) continue;
              const range = isObject(sourceMeta[operation.key]) ? sourceMeta[operation.key].range : undefined;
              const bounded = Array.isArray(range) && range.length === 2 && range.every(bound => typeof bound === "number" && Number.isFinite(bound));
              if (bounded && (next < range[0] || next > range[1])) {
                if (operation.out_of_range === "reject") {
                  error("BUILD_ANSWER_REJECTED", "§7", "opengdd-build.json", `personalization.answers.${questionId} resolves ${JSON.stringify(operation.key)} to ${next}, outside the inclusive range [${range[0]}, ${range[1]}]; the operation declares out_of_range "reject", so the recorded answer is invalid`);
                } else if (operation.out_of_range === "clamp") {
                  next = Math.min(Math.max(next, range[0]), range[1]);
                }
              }
              running.set(operation.key, next);
            }
          }
        }

        // §10.11 amends check 5: the total counts game-local acceptance tests
        // plus generated ones after liveness and per-row expansion. A template
        // that is not live, and a row that does not match, contribute zero.
        const plan = buildPlanAcceptanceHeadings(specResolvedRoot, specManifest);
        if (plan && typeof build?.evidence?.acceptance?.total === "number") {
          const generated = contractFacts?.generatedTotal ?? 0;
          const expectedTotal = plan.headings.length + plan.generated.length;
          if (plan.generated.length !== generated) {
            error("BUILD_ACCEPTANCE_TOTAL", "§7", "opengdd-build.json", `the source package's build plan carries ${plan.generated.length} generated acceptance test(s) but its contracts instantiate ${generated}; the source package does not validate, so its test count cannot be trusted`);
          } else if (build.evidence.acceptance.total !== expectedTotal) {
            const split = generated ? ` (${plan.headings.length} game-local plus ${generated} generated)` : "";
            error("BUILD_ACCEPTANCE_TOTAL", "§7", "opengdd-build.json", `evidence.acceptance.total ${build.evidence.acceptance.total} does not match the source package's ${expectedTotal} enumerated acceptance tests${split}`);
          }
        }

        // Enforce direction_result presence and resolve claim paths to their source declarations.
        const directionDeclared = specManifest?.build?.direction;
        let directionDoc;
        if (typeof directionDeclared === "string") {
          const directionFile = path.join(specResolvedRoot, directionDeclared);
          if (host.exists(directionFile)) directionDoc = parseJsonFile(directionFile, slash(directionDeclared), "§7", "DIRECTION_JSON");
        }
        const hasJudgedClaims = isObject(directionDoc) && DIRECTION_JUDGED_KINDS.size &&
          [...DIRECTION_JUDGED_KINDS].some(kind => isObject(directionDoc[kind]) && Object.keys(directionDoc[kind]).length > 0);
        const hasCertifiedPins = isObject(directionDoc) &&
          Object.values(directionDoc.constraints?.palette ?? {}).some(entry => isObject(entry) && entry.must_match === true);

        const result = build?.direction_result;
        if (hasJudgedClaims && !isObject(result?.judged)) {
          error("BUILD_DIRECTION_RESULT_MISSING", "§7", "opengdd-build.json", "the certifying spec declares judged direction claims; direction_result.judged is required");
        }
        if (!hasJudgedClaims && isObject(result?.judged)) {
          error("BUILD_DIRECTION_RESULT_UNEXPECTED", "§7", "opengdd-build.json", "direction_result.judged is present but the certifying spec declares no judged direction claims");
        }
        if (hasCertifiedPins && !Array.isArray(result?.certified_pins)) {
          error("BUILD_CERTIFIED_PINS_MISSING", "§7", "opengdd-build.json", "the certifying spec declares a must_match:true palette claim; direction_result.certified_pins is required");
        }
        if (!hasCertifiedPins && Array.isArray(result?.certified_pins)) {
          error("BUILD_CERTIFIED_PINS_UNEXPECTED", "§7", "opengdd-build.json", "direction_result.certified_pins is present but the certifying spec declares no must_match:true palette claim");
        }
        if (isObject(result?.judged)) {
          const assessed = new Set(Array.isArray(result.judged.assessed) ? result.judged.assessed : []);
          for (const claimPath of [...assessed, ...(Array.isArray(result.judged.adherent) ? result.judged.adherent : [])]) {
            const resolved = directionDoc ? resolveDirectionPath(directionDoc, claimPath) : undefined;
            if (!resolved || !DIRECTION_JUDGED_KINDS.has(resolved.kind)) {
              error("BUILD_DIRECTION_CLAIM_DANGLING", "§7", "opengdd-build.json", `direction_result.judged names ${JSON.stringify(claimPath)}, which does not resolve to a declared judged claim in the certifying spec's direction.json`);
            }
          }
          for (const claimPath of Array.isArray(result.judged.adherent) ? result.judged.adherent : []) {
            if (!assessed.has(claimPath)) error("BUILD_DIRECTION_ADHERENT_NOT_ASSESSED", "§7", "opengdd-build.json", `direction_result.judged.adherent names ${JSON.stringify(claimPath)}, which is not in .assessed`);
          }
        }
        if (Array.isArray(result?.certified_pins) && isObject(directionDoc)) {
          for (const pin of result.certified_pins) {
            if (!isObject(pin) || typeof pin.path !== "string") continue;
            const resolved = resolveDirectionPath(directionDoc, pin.path);
            if (!resolved || resolved.kind !== "constraints.palette" || resolved.entry?.must_match !== true) {
              error("BUILD_CERTIFIED_PIN_DANGLING", "§7", "opengdd-build.json", `direction_result.certified_pins names ${JSON.stringify(pin.path)}, which is not a must_match:true constraints.palette claim in the certifying spec`);
            }
          }
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

    return { packageRoot: buildFile, packageName: build?.spec?.id ?? path.basename(buildFile) };
  }

  function finish(result) {
    findings.sort((a, b) => {
      const severity = { error: 0, warning: 1 };
      return severity[a.severity] - severity[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code);
    });
    const errors = findings.filter(item => item.severity === "error").length;
    const warnings = findings.filter(item => item.severity === "warning").length;
    return {
      ...result,
      valid: errors === 0,
      summary: { errors, warnings, findings: findings.length },
      findings,
      skipped
    };
  }

  return { validatePackage, validateBuildManifest, finish };
}

export function validatePackage(host, packageArgument) {
  const validator = createValidator(host);
  return validator.finish({ ...validator.validatePackage(packageArgument), validationKind: "package" });
}

export function validateBuildManifest(host, buildFile, specDirectory) {
  const validator = createValidator(host);
  return validator.finish({ ...validator.validateBuildManifest(buildFile, specDirectory), validationKind: "build" });
}

// SPEC §10.10 makes regenerating the block tooling discipline and byte equality
// the check that keeps the discipline safe. Hand-authoring those bytes is not a
// thing anyone should attempt, so the tool that checks them also writes them.
export function emitContractsBlock(host, packageArgument) {
  const validator = createValidator(host);
  const run = validator.finish({ ...validator.validatePackage(packageArgument), validationKind: "package" });
  return { block: run.contractsBlock, findings: run.findings, summary: run.summary };
}

export function formatReport(run, jsonMode) {
  const isBuild = run.validationKind === "build";
  const subject = { id: run.packageName, path: run.packageRoot };
  const output = {
    validator: `OpenGDD v${SPEC_VERSION} ${isBuild ? "build" : "package"} conformance`,
    [isBuild ? "build" : "package"]: subject,
    valid: run.valid,
    summary: run.summary,
    findings: run.findings
  };
  if (jsonMode) return `${JSON.stringify(output, null, 2)}\n`;

  const status = run.summary.errors ? "FAIL" : run.summary.warnings ? "PASS WITH WARNINGS" : "PASS";
  const lines = [
    `OpenGDD v${SPEC_VERSION} ${isBuild ? "build" : "package"} validation`,
    `${isBuild ? "Build" : "Package"}: ${run.packageName} (${run.packageRoot})`,
    `Result: ${status} — ${run.summary.errors} error(s), ${run.summary.warnings} warning(s)`
  ];
  if (run.findings.length) lines.push("");
  for (const finding of run.findings) {
    const location = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
    lines.push(`${finding.severity.toUpperCase()} [${finding.code}] ${location} — ${finding.message} (SPEC ${finding.spec_section})`);
  }
  return `${lines.join("\n")}\n`;
}
