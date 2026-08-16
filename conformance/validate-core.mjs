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

  function addFinding(severity, code, section, file, message, line = undefined, data = undefined) {
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

  function validateContract(contract, resolvePath) {
    if (typeof contract !== "string" || contract.length === 0) return undefined;
    const hash = contract.indexOf("#");
    if (hash <= 0 || hash === contract.length - 1) {
      error("CONTENT_CONTRACT_SECTION", "§1b", "manifest.json", `content contract must point to a chapter section: ${JSON.stringify(contract)}`);
      return undefined;
    }
    const filePart = contract.slice(0, hash);
    const fragment = decodeURIComponent(contract.slice(hash + 1));
    const file = resolvePath(filePart, "content contract file", "§1b", "CONTENT_CONTRACT_PATH", { mustExist: true, kind: "file" });
    if (!file) return undefined;
    const text = host.readText(file);
    const lines = text.split(/\r?\n/);
    const headings = lines.map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      return match ? { level: match[1].length, title: match[2], slug: markdownSlug(match[2]), line: index + 1, index } : undefined;
    }).filter(Boolean);
    const heading = headings.find(item => item.slug === fragment.toLowerCase());
    if (!heading) {
      error("CONTENT_CONTRACT_SECTION", "§1b", slash(filePart), `contract fragment #${fragment} does not match a Markdown heading`);
      return { file, text, fragment };
    }
    const next = headings.find(item => item.index > heading.index && item.level <= heading.level);
    const sectionLines = lines.slice(heading.index + 1, next?.index ?? lines.length);
    const first = sectionLines.find(line => line.trim().length > 0)?.trim();
    if (first?.startsWith("> DELEGATED:") || first?.startsWith("> PERSONALIZATION:")) {
      error("CONTENT_CONTRACT_AUTHORITY", "§1b", slash(filePart), "content contract section must be Fixed", heading.line);
    }
    return { file, text, fragment, line: heading.line };
  }

  function loadPersonalization(packageRoot, manifest, resolvePath) {
    const declared = manifest?.build?.personalization;
    if (!declared) return new Map();
    const file = resolvePath(declared, "build.personalization", "§3", "BUILD_PATH_MISSING", { mustExist: true, kind: "file" });
    if (!file) return new Map();
    const doc = parseJsonFile(file, slash(declared), "§5", "PERSONALIZATION_JSON");
    if (!isObject(doc) || !Array.isArray(doc.questions)) return new Map();
    doc.questions.forEach((question, questionIndex) => {
      if (!isObject(question) || !Array.isArray(question.affects)) return;
      question.affects.forEach((affected, affectedIndex) => {
        if (typeof affected === "string") resolvePath(affected, `questions[${questionIndex}].affects[${affectedIndex}]`, "§5", "PERSONALIZATION_PATH", { mustExist: true });
      });
    });
    return new Map(doc.questions.filter(isObject).filter(question => typeof question.id === "string").map(question => [question.id, question]));
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
      const contract = validateContract(collection.contract, resolvePath);
      const docs = [];
      const recordEntries = [];
      const source = collection.source;

      if (isObject(source) && source.kind === "catalog" && typeof source.file === "string") {
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
      } else if (isObject(source) && source.kind === "items" && typeof source.directory === "string" && Array.isArray(source.members)) {
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
        const member = collection.id_member;
        if (typeof member !== "string" || !own(entry.record, member) || (typeof entry.record[member] !== "string" && typeof entry.record[member] !== "number") || String(entry.record[member]).length === 0) {
          error("CONTENT_ID_MEMBER", "§1b", entry.display, `${entry.pointer} must carry a non-empty stable ${JSON.stringify(member)} member`);
          continue;
        }
        const stable = `${typeof entry.record[member]}:${String(entry.record[member])}`;
        if (stableIds.has(stable)) {
          error("CONTENT_ID_DUPLICATE", "§1b", entry.display, `stable id ${JSON.stringify(entry.record[member])} duplicates ${stableIds.get(stable)}`);
        } else stableIds.set(stable, `${entry.display}${entry.pointer}`);
      }

      const allIds = new Set();
      for (const doc of docs) {
        for (const itemId of collectIds(doc.data)) allIds.add(itemId);
        walk(doc.data, (value, pointer, ancestors) => {
          if (isObject(value) && own(value, "authority")) validateAuthority(value.authority, doc.display, pointer, questionsById);
        });
      }

      const info = { collection, contract, docs, records: recordEntries, allIds };
      if (typeof id === "string") context.collections.set(id, info);
      context.documents.push(...docs.map(doc => ({ ...doc, collection: info })));
    }

    // Contracts may declare state bindings used by structured expressions.
    for (const info of context.collections.values()) {
      const text = info.contract?.text ?? "";
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
      if (info.docs.length !== 1 || info.collection.source?.kind !== "catalog") {
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

  function validateManifestConstructs(manifest) {
    const rulesetIds = new Set();
    if (!isObject(manifest)) return { rulesetIds };
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
    return { rulesetIds };
  }

  // §2c deepening: `> RULESET: <id>` chapter tags and `tuning.json` meta.ruleset
  // entries are the declared-id closure the SPEC's "core lint promise" names.
  // meta.ruleset is already checked in validateTuning; this covers prose tags.
  function validateRulesetTags(packageRoot, manifest, rulesetIds) {
    if (rulesetIds.size === 0) return;
    const chapters = new Set(["01-overview.md", "02-mechanics.md", "03-content.md", "04-presentation.md", "05-build-plan.md"]);
    for (const declared of manifest?.build?.chapters ?? []) if (typeof declared === "string" && declared.endsWith(".md")) chapters.add(declared);
    for (const chapter of chapters) {
      if (path.isAbsolute(chapter) || chapter.includes("..")) continue;
      const file = path.join(packageRoot, chapter);
      if (!host.exists(file) || !host.isFile(file)) continue;
      for (const item of unfencedLines(host.readText(file))) {
        const match = /^\s*>\s*RULESET:\s*(\S+)\s*$/.exec(item.text);
        if (!match) continue;
        const id = match[1];
        if (id !== "all" && !rulesetIds.has(id)) {
          error("RULESET_TAG_DANGLING", "§2c", slash(chapter), `> RULESET: ${id} does not name a declared ruleset id`, item.line);
        }
      }
    }
  }

  const CLOCK_BEHAVIORS = new Set(["advances", "frozen", "discrete-only", "does-not-exist"]);

  function validateClocks(doc) {
    const result = { regimes: new Set(), governedBy: new Map(), behaviors: new Map() };
    const clocks = doc.clocks;
    if (!isObject(clocks)) {
      error("CLOCKS_SHAPE", "§4b", "tuning.json", "clocks must be an object with regimes and clocks members");
      return result;
    }
    for (const key of Object.keys(clocks)) if (key !== "regimes" && key !== "clocks") error("CLOCKS_SHAPE", "§4b", "tuning.json", `clocks.${key} is not defined by the v0.5 shape`);
    const regimeSet = result.regimes;
    if (!Array.isArray(clocks.regimes) || !clocks.regimes.length) {
      error("CLOCKS_REGIMES", "§4b", "tuning.json", "clocks.regimes must be a non-empty array of regime ids");
    } else {
      clocks.regimes.forEach((regime, index) => {
        if (typeof regime !== "string" || !regime.length) error("CLOCKS_REGIMES", "§4b", "tuning.json", `clocks.regimes[${index}] must be a non-empty string`);
        else if (regimeSet.has(regime)) error("CLOCKS_REGIMES", "§4b", "tuning.json", `clocks.regimes duplicates ${JSON.stringify(regime)}`);
        else regimeSet.add(regime);
      });
    }
    if (!isObject(clocks.clocks)) {
      error("CLOCKS_SHAPE", "§4b", "tuning.json", "clocks.clocks must be an object of named clocks");
      return result;
    }
    // §4b deepening: `governs` disjointness and behavior-per-regime lookup, used
    // to check a citing AT's `freeze_invariant` for the advances/does-not-exist
    // contradictions the SPEC names.
    for (const [name, clock] of Object.entries(clocks.clocks)) {
      if (!isObject(clock) || !isObject(clock.behavior)) {
        error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name} must declare a behavior object`);
        continue;
      }
      for (const [regime, behavior] of Object.entries(clock.behavior)) {
        if (!regimeSet.has(regime)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior names undeclared regime ${JSON.stringify(regime)}`);
        if (!CLOCK_BEHAVIORS.has(behavior)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior[${JSON.stringify(regime)}] must be one of advances, frozen, discrete-only, does-not-exist`);
        result.behaviors.set(`${name} ${regime}`, behavior);
      }
      for (const regime of regimeSet) {
        if (!own(clock.behavior, regime)) error("CLOCKS_BEHAVIOR", "§4b", "tuning.json", `clocks.clocks.${name}.behavior must cover declared regime ${JSON.stringify(regime)}`);
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
    const regimes = Array.isArray(freezeInvariant.regimes) ? freezeInvariant.regimes : [];
    if (!references.length) error("FREEZE_INVARIANT_SHAPE", "§4b", file, `${pointer} freeze_invariant.references must be a non-empty array`);
    if (!regimes.length) error("FREEZE_INVARIANT_SHAPE", "§4b", file, `${pointer} freeze_invariant.regimes must be a non-empty array`);
    for (const regime of regimes) {
      if (typeof regime === "string" && !clocksResult.regimes.has(regime)) {
        error("FREEZE_INVARIANT_REGIME", "§4b", file, `${pointer} freeze_invariant names undeclared regime ${JSON.stringify(regime)}`);
      }
    }
    for (const ref of references) {
      if (typeof ref !== "string") continue;
      if (exprContext) referenceInfo(ref, exprContext, file, `${pointer} freeze_invariant reference`);
      const clockName = clocksResult.governedBy.get(ref);
      if (!clockName) continue; // ungoverned reference: SPEC 4b says nothing more to check here
      for (const regime of regimes) {
        const behavior = clocksResult.behaviors.get(`${clockName} ${regime}`);
        if (behavior === "advances") {
          warning("FREEZE_INVARIANT_ADVANCES", "§4b", file, `${pointer} names ${JSON.stringify(ref)}, governed by clock ${JSON.stringify(clockName)}, which advances in named regime ${JSON.stringify(regime)} — lint-level contradiction`);
        } else if (behavior === "does-not-exist") {
          error("FREEZE_INVARIANT_UNDEFINED", "§4b", file, `${pointer} names ${JSON.stringify(ref)}, governed by clock ${JSON.stringify(clockName)}, which does-not-exist in named regime ${JSON.stringify(regime)}`);
        }
      }
    }
  }

  function validateTuning(packageRoot, contentContext, rulesetIds = new Set()) {
    const file = path.join(packageRoot, "tuning.json");
    const doc = host.exists(file) ? parseJsonFile(file, "tuning.json", "§4", "TUNING_JSON") : undefined;
    const context = { ...contentContext, tuning: new Map() };
    if (doc === undefined) return { doc, context };
    if (!isObject(doc)) {
      error("TUNING_SHAPE", "§4", "tuning.json", "top level must be an object");
      return { doc, context };
    }
    const allowedTop = new Set(["tunables", "constants", "meta", "invariants", "clocks"]);
    for (const key of Object.keys(doc)) {
      if (allowedTop.has(key)) continue;
      const message = key === "values"
        ? "top-level member `values` was renamed to `tunables` in v0.5"
        : `unknown top-level member ${JSON.stringify(key)}`;
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
        for (const member of Object.keys(metadata)) if (member !== "range" && member !== "certify" && member !== "ruleset") error("TUNING_META", "§4", "tuning.json", `meta.${key}.${member} is not defined by the v0.5 shape`);
        if (own(metadata, "certify") && typeof metadata.certify !== "boolean") error("TUNING_META_CERTIFY", "§4", "tuning.json", `meta.${key}.certify must be Boolean`);
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
      doc.invariants.forEach((invariant, index) => {
        if (isObject(invariant) && typeof invariant.id === "string") {
          if (invariantIds.has(invariant.id)) error("TUNING_INVARIANT_ID", "§4", "tuning.json", `invariant id ${JSON.stringify(invariant.id)} is duplicated`);
          invariantIds.add(invariant.id);
        }
        validateNamedExpression(invariant, context, "tuning.json", `#/invariants/${index}`, true);
      });
    }
    return { doc, context };
  }

  function validateContentReferences(contentContext, exprContext) {
    for (const info of contentContext.collections.values()) {
      const contractText = info.contract?.text ?? "";
      const mechanicallyResolvedFields = new Set();
      const arrayTargets = new Map();
      const namespaceTargets = new Map();
      const referenceVerbs = new Set();
      for (const match of contractText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`[^.\n]{0,100}(?:MUST\s+)?resolve/gi)) mechanicallyResolvedFields.add(match[1]);
      for (const match of contractText.matchAll(/(?:Every\s+[^.\n]{0,80})`([A-Za-z_][A-Za-z0-9_]*)`[^.\n]{0,100}(?:MUST\s+)?resolve/gi)) mechanicallyResolvedFields.add(match[1]);
      for (const match of contractText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`\s+references\s+MUST\s+resolve\s+to\s+`([A-Za-z_][A-Za-z0-9_]*)\[\]\.id`/gi)) {
        arrayTargets.set(match[1], match[2]);
      }
      for (const match of contractText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`[\s\S]{0,120}?MUST\s+resolve\s+to[\s\S]{0,80}?`([A-Za-z_][A-Za-z0-9_.-]*)\.\*`/gi)) {
        namespaceTargets.set(match[1], `${match[2]}.`);
      }
      for (const match of contractText.matchAll(/`([a-z][a-z0-9_-]*):<[^`>]*-id>`/gi)) referenceVerbs.add(match[1]);
      const scheduleUsesTuning = /schedule\s+strings\s+MUST\s+resolve\s+to\s+tuning\s+keys/i.test(contractText);

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
    const fantasy = lines.find(line => !/^Feel:|^NOT:|^Anti-references:/i.test(line));
    if (!fantasy || !/[.!?]$/.test(fantasy) || (fantasy.match(/[.!?](?=\s|$)/g) ?? []).length !== 1) {
      error("FANTASY_SENTENCE", "§1a", "01-overview.md", "fantasy block must contain exactly one sentence of player fantasy");
    }
    const feel = lines.find(line => /^Feel:/i.test(line));
    const adjectives = feel ? feel.replace(/^Feel:\s*/i, "").replace(/[.!?]$/, "").split(",").map(item => item.trim()).filter(Boolean) : [];
    if (adjectives.length < 3 || adjectives.length > 5) error("FANTASY_FEEL", "§1a", "01-overview.md", `fantasy block must contain 3–5 feel adjectives; found ${adjectives.length}`);
    const anti = lines.find(line => /^(?:NOT|Anti-references):/i.test(line));
    if (!anti || !anti.replace(/^(?:NOT|Anti-references):\s*/i, "").replace(/[.!?]$/, "").trim()) {
      error("FANTASY_ANTI_REFERENCES", "§1a", "01-overview.md", "fantasy block must contain non-empty anti-references");
    }
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
  // SPEC §8a/§9 — the art-direction carrier (direction.json + the chapter fence).
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

  const DIRECTION_JUDGED_LABELS = new Map([["PILLARS:", "pillars"], ["MOOD:", "mood"], ["ANTI:", "anti"], ["INVARIANTS:", "invariants"], ["MOTION:", "motion"]]);
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
    if (parts.length === 2 && ["pillars", "mood", "references", "anti", "viewing", "invariants", "motion"].includes(parts[0])) {
      const entry = directionDoc[parts[0]]?.[parts[1]];
      return entry ? { kind: parts[0], key: parts[1], entry } : undefined;
    }
    return undefined;
  }

  const DIRECTION_JUDGED_KINDS = new Set(["pillars", "mood", "anti", "invariants", "motion"]);

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
      for (const [key, entry] of Object.entries(directionDoc.invariants ?? {})) if (isObject(entry)) checkClaimEdges("invariants", key, entry);
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
        if (!citedReferences.has(key)) error("DIRECTION_REFERENCE_ORPHANED", "§9.3", slash(declaredPath), `references.${key} is not cited by any judged claim's references member`);
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

    // Fence closure: per-entry for judged labels, existence-only for commentary labels.
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
    if (missing.length) error("VERIFICATION_FIELD", "§6", file, `${id} ${descriptor.class} descriptor requires ${missing.join(", ")}`, line);
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

  function validateDescriptor(descriptor, id, file, line, resolvePath, exprContext, directionCtx) {
    if (!isObject(descriptor)) {
      error("VERIFICATION_SHAPE", "§6", file, `${id} verification descriptor must be a JSON object`, line);
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
          const resolved = directionCtx?.directionDoc ? resolveDirectionPath(directionCtx.directionDoc, claim) : undefined;
          if (!resolved || !(resolved.kind.startsWith("constraints.") || resolved.kind === "motion")) {
            error("DIRECTION_CLAIMS_DANGLING", "§6", file, `${id} direction_claims cites ${JSON.stringify(claim)}, which does not resolve to a constraints.* or motion.* direction.json entry`, line);
          } else {
            directionCtx.coveredByAT.add(claim);
          }
        }
      }
    }
    const legal = new Set(["scenario", "property", "exhaustive-search", "static-lint"]);
    if (!legal.has(descriptor.class)) {
      error("VERIFICATION_CLASS", "§6", file, `${id} has illegal verification class ${JSON.stringify(descriptor.class)}`, line);
      return;
    }
    if (descriptor.class === "scenario") {
      requireFields(descriptor, ["given", "when", "then"], id, file, line);
    } else if (descriptor.class === "property") {
      requireFields(descriptor, ["domain", "invariant", "oracle"], id, file, line);
      if (!own(descriptor, "coverage") && !own(descriptor, "sampling")) error("VERIFICATION_PROPERTY_PLAN", "§6", file, `${id} property requires exhaustive coverage or a sampling plan`, line);
      if (own(descriptor, "coverage") && !own(descriptor, "sampling")) {
        const exhaustive = (typeof descriptor.coverage === "string" && /exhaustive/i.test(descriptor.coverage)) || (isObject(descriptor.coverage) && /exhaustive/i.test(String(descriptor.coverage.kind ?? descriptor.coverage.type ?? "")));
        if (!exhaustive) error("VERIFICATION_PROPERTY_PLAN", "§6", file, `${id} non-sampled property coverage must explicitly be exhaustive`, line);
      }
      if (own(descriptor, "sampling")) {
        if (!isObject(descriptor.sampling)) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampling must be an object`, line);
        else {
          if (!Array.isArray(descriptor.sampling.seed_set) || descriptor.sampling.seed_set.length === 0) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampled property requires a non-empty deterministic seed_set`, line);
          const countFields = Object.entries(descriptor.sampling).filter(([key, value]) => /sample/i.test(key) && key !== "sample_derivation" && Number.isInteger(value) && value > 0);
          if (countFields.length === 0) error("VERIFICATION_PROPERTY_SAMPLING", "§6", file, `${id} sampled property requires a positive integer sample count`, line);
        }
      }
      if (descriptor.oracle !== "per-sample" && descriptor.oracle !== "aggregate") error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} oracle must be "per-sample" or "aggregate"`, line);
      if (descriptor.oracle === "aggregate") {
        requireFields(descriptor, ["metric", "aggregation", "threshold"], id, file, line);
        const seedSet = descriptor.seed_set ?? descriptor.sampling?.seed_set;
        if (!Array.isArray(seedSet) || seedSet.length === 0) error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} aggregate oracle requires a deterministic seed_set`, line);
        const aggregation = descriptor.aggregation;
        const simple = new Set(["count", "rate", "min", "max", "mean"]);
        const histogram = isObject(aggregation) && aggregation.kind === "histogram" && Array.isArray(aggregation.bins) && aggregation.bins.length > 0;
        if (!simple.has(aggregation) && !histogram) error("VERIFICATION_PROPERTY_ORACLE", "§6", file, `${id} aggregation must be count/rate/min/max/mean or a finite histogram with bins`, line);
      }
    } else if (descriptor.class === "exhaustive-search") {
      requireFields(descriptor, ["initial_states", "transitions", "predicate", "diagnostics"], id, file, line);
      if (typeof descriptor.complete !== "boolean") error("VERIFICATION_SEARCH_COMPLETE", "§6", file, `${id} exhaustive-search requires complete: true|false`, line);
      if (!nonEmpty(descriptor.finite_state) && !nonEmpty(descriptor.bound)) error("VERIFICATION_SEARCH_BOUND", "§6", file, `${id} exhaustive-search requires a finite_state declaration or explicit bound`, line);
      if (own(descriptor, "bound") && (!isObject(descriptor.bound) || !nonEmpty(descriptor.bound.kind) || Object.keys(descriptor.bound).length < 2)) {
        error("VERIFICATION_SEARCH_BOUND", "§6", file, `${id} bound must name its kind and an explicit state/depth limit`, line);
      }
      if (!Array.isArray(descriptor.diagnostics) || descriptor.diagnostics.length === 0) error("VERIFICATION_SEARCH_DIAGNOSTICS", "§6", file, `${id} must name witness and/or counterexample diagnostics`, line);
    } else if (descriptor.class === "static-lint") {
      requireFields(descriptor, ["artifacts", "rule_set", "diagnostics"], id, file, line);
      const ruleSet = descriptor.rule_set;
      const versioned = (typeof ruleSet === "string" && /(?:-v\d+|\d+\.\d+(?:\.\d+)?)$/i.test(ruleSet)) || (isObject(ruleSet) && nonEmpty(ruleSet.id) && nonEmpty(ruleSet.version));
      if (!versioned) error("VERIFICATION_LINT_RULE_SET", "§6", file, `${id} static-lint rule_set must be versioned`, line);
      if (Array.isArray(descriptor.diagnostics)) {
        const normalized = descriptor.diagnostics.map(value => String(value).toLowerCase());
        const hasFile = normalized.some(value => value === "file" || value.includes("file"));
        const hasItem = normalized.some(value => value === "item" || value.includes("item"));
        const hasRule = normalized.some(value => value === "rule" || value.includes("rule"));
        if (!hasFile || !hasItem || !hasRule) error("VERIFICATION_LINT_DIAGNOSTICS", "§6", file, `${id} static-lint diagnostics must identify file, item, and rule`, line);
      }
    }
    const hasTolerance = own(descriptor, "tolerance") || own(descriptor, "tolerances");
    const hasTarget = own(descriptor, "target") || own(descriptor, "targets") || own(descriptor, "expected") || own(descriptor, "then");
    const hasFixture = own(descriptor, "fixture") || own(descriptor, "fixtures") || own(descriptor, "replay-fixture") || own(descriptor, "schedule") || own(descriptor, "schedule_set") || own(descriptor, "given") || (isObject(descriptor.domain) && deepKey(descriptor.domain).includes("schedule"));
    if (hasTolerance && !hasTarget) error("VERIFICATION_TOLERANCE_TARGET", "§6", file, `${id} declares tolerance without an expected target`, line);
    if ((own(descriptor, "target") || own(descriptor, "targets")) && !hasFixture) error("VERIFICATION_TARGET_FIXTURE", "§6", file, `${id} declares a target without an input/schedule fixture`, line);
  }

  function buildPlanAcceptanceHeadings(packageRoot, manifest) {
    const relative = typeof manifest?.build?.plan === "string" ? manifest.build.plan : "05-build-plan.md";
    if (path.isAbsolute(relative) || relative.includes("..")) return undefined;
    const file = path.join(packageRoot, relative);
    if (!host.exists(file)) return undefined;
    const text = host.readText(file);
    const headings = [...text.matchAll(/^#{1,6}\s+(AT-(\d+))\b.*$/gm)].map(match => ({ id: match[1], number: Number(match[2]), index: match.index, after: match.index + match[0].length, line: text.slice(0, match.index).split(/\r?\n/).length }));
    return { relative, text, headings };
  }

  function validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx) {
    const plan = buildPlanAcceptanceHeadings(packageRoot, manifest);
    if (!plan) return;
    const { relative, text, headings } = plan;
    const display = slash(relative);
    if (headings.length === 0) {
      error("VERIFICATION_AT_MISSING", "§6", display, "build plan must contain numbered AT-1 … AT-n acceptance tests");
      return;
    }
    headings.forEach((heading, index) => {
      if (heading.number !== index + 1) error("VERIFICATION_AT_ORDER", "§6", display, `expected AT-${index + 1}, found ${heading.id}`, heading.line);
      const next = headings[index + 1]?.index ?? text.length;
      const body = text.slice(heading.after, next);
      const block = /^\s*```verification[^\r\n]*\r?\n([\s\S]*?)```/.exec(body);
      if (!block) {
        error("VERIFICATION_BLOCK", "§6", display, `${heading.id} heading must be followed by a fenced verification JSON descriptor`, heading.line);
        return;
      }
      let descriptor;
      try { descriptor = JSON.parse(block[1]); }
      catch (cause) {
        error("VERIFICATION_JSON", "§6", display, `${heading.id} verification block is not valid JSON: ${cause.message}`, heading.line);
        return;
      }
      validateDescriptor(descriptor, heading.id, display, heading.line, resolvePath, exprContext, directionCtx);
      const afterBlock = body.slice(block.index + block[0].length).trim();
      const proseBeforeHeading = afterBlock.split(/\r?\n(?=#{1,6}\s)/, 1)[0].trim();
      if (!proseBeforeHeading) error("VERIFICATION_PROSE", "§6", display, `${heading.id} requires human-readable test text after its descriptor`, heading.line);
    });
    if (directionCtx) {
      for (const claim of directionCtx.requiredCoverage) {
        if (!directionCtx.coveredByAT.has(claim)) {
          error("DIRECTION_CLAIM_UNCOVERED", "§9.11", display, `${claim} is not cited by any AT's direction_claims — every observational-checked constraint and every motion entry needs a covering AT`);
        }
      }
    }
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

    const questionsById = loadPersonalization(packageRoot, manifest, resolvePath);
    const contentContext = validateContent(packageRoot, manifest, resolvePath, questionsById);
    const { rulesetIds } = validateManifestConstructs(manifest);
    validateRulesetTags(packageRoot, manifest, rulesetIds);
    const { doc: tuningDoc, context: exprContext } = validateTuning(packageRoot, contentContext, rulesetIds);
    validateContentReferences(contentContext, exprContext);
    validateFantasy(packageRoot);
    validateInjectionSurface(packageRoot);
    validateTieBreakLint(packageRoot);
    validateProseLiterals(packageRoot, manifest, tuningDoc);
    if (manifest !== undefined) validateMediaFiles(manifest, "manifest.json", resolvePath);
    const directionCtx = validateDirection(packageRoot, manifest, resolvePath);
    validateBuildPlan(packageRoot, manifest, resolvePath, exprContext, directionCtx);
    return { packageRoot, packageName: manifest?.id ?? path.basename(packageRoot), manifest };
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
        "certifying spec directory was not supplied; skipped source-dependent SPEC §7 cross-document checks 1–5 (spec id/version, designer, personalization answers, resolved_tuning keys/ranges, and acceptance-test total) and source-backed direction-result checks. Supply the optional <spec-dir> argument to enable them"
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
        const sourceQuestions = loadPersonalization(specResolvedRoot, specManifest, specResolvePath);
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
            const expected = question.kind === "number" ? "number" : question.kind === "choice" || question.kind === "text" ? "string" : undefined;
            if (expected && (typeof answer !== expected || (expected === "number" && !Number.isFinite(answer)))) {
              error("BUILD_ANSWER_TYPE", "§7", "opengdd-build.json", `personalization.answers.${questionId} must be a ${expected} for ${JSON.stringify(question.kind)} question ${JSON.stringify(questionId)}`);
            } else if (question.kind === "choice" && typeof answer === "string" && Array.isArray(question.options)) {
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
        if (isObject(specTuning) && isObject(build?.resolved_tuning)) {
          for (const role of ["tunables", "constants"]) {
            const source = isObject(specTuning[role]) ? specTuning[role] : {};
            const resolved = isObject(build.resolved_tuning[role]) ? build.resolved_tuning[role] : {};
            const sourceKeys = Object.keys(source).sort();
            const resolvedKeys = Object.keys(resolved).sort();
            const missing = sourceKeys.filter(key => !own(resolved, key));
            const extra = resolvedKeys.filter(key => !own(source, key));
            if (missing.length || extra.length) {
              const details = [
                missing.length ? `missing ${missing.map(key => JSON.stringify(key)).join(", ")}` : undefined,
                extra.length ? `unexpected ${extra.map(key => JSON.stringify(key)).join(", ")}` : undefined
              ].filter(Boolean).join("; ");
              error("BUILD_TUNING_KEYS", "§7", "opengdd-build.json", `resolved_tuning.${role} keys must exactly equal ${slash(specTuningRelative)} ${role} keys: ${details}`);
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
        }

        const plan = buildPlanAcceptanceHeadings(specResolvedRoot, specManifest);
        if (plan && typeof build?.harness?.acceptance?.total === "number" && build.harness.acceptance.total !== plan.headings.length) {
          error("BUILD_ACCEPTANCE_TOTAL", "§7", "opengdd-build.json", `harness.acceptance.total ${build.harness.acceptance.total} does not match the source package's ${plan.headings.length} enumerated acceptance tests`);
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
          Object.values(directionDoc.constraints?.palette ?? {}).some(entry => isObject(entry) && entry.certify === true);

        const result = build?.direction_result;
        if (hasJudgedClaims && !isObject(result?.judged)) {
          error("BUILD_DIRECTION_RESULT_MISSING", "§7", "opengdd-build.json", "the certifying spec declares judged direction claims; direction_result.judged is required");
        }
        if (!hasJudgedClaims && isObject(result?.judged)) {
          error("BUILD_DIRECTION_RESULT_UNEXPECTED", "§7", "opengdd-build.json", "direction_result.judged is present but the certifying spec declares no judged direction claims");
        }
        if (hasCertifiedPins && !Array.isArray(result?.certified_pins)) {
          error("BUILD_CERTIFIED_PINS_MISSING", "§7", "opengdd-build.json", "the certifying spec declares a certify:true palette claim; direction_result.certified_pins is required");
        }
        if (!hasCertifiedPins && Array.isArray(result?.certified_pins)) {
          error("BUILD_CERTIFIED_PINS_UNEXPECTED", "§7", "opengdd-build.json", "direction_result.certified_pins is present but the certifying spec declares no certify:true palette claim");
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
            if (!resolved || resolved.kind !== "constraints.palette" || resolved.entry?.certify !== true) {
              error("BUILD_CERTIFIED_PIN_DANGLING", "§7", "opengdd-build.json", `direction_result.certified_pins names ${JSON.stringify(pin.path)}, which is not a certify:true constraints.palette claim in the certifying spec`);
            }
          }
        }
      }
    }

    if (isObject(build) && isObject(build.harness)) {
      if (typeof build.harness.acceptance?.total !== "number" || typeof build.harness.acceptance?.passed !== "number") {
        error("BUILD_ACCEPTANCE_SHAPE", "§7", "opengdd-build.json", "harness.acceptance must declare numeric passed and total");
      } else if (build.harness.acceptance.passed !== build.harness.acceptance.total) {
        warning("BUILD_ACCEPTANCE_INCOMPLETE", "§7", "opengdd-build.json", `harness.acceptance ${build.harness.acceptance.passed}/${build.harness.acceptance.total} — a conforming build requires passed == total`);
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
