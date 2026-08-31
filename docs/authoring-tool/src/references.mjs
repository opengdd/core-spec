import { COLLECTION_COPY } from "./copy/collection-copy.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { packageFiles, parseJson, plainObject, pointer, pointerSegment } from "./json-path.mjs";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;
const RECORD = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const COLLECTION = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const FIELD_REFERENCE = /^collections\.([a-z0-9]+(?:-[a-z0-9]+)*)#(.+)$/;
const CONTRACT = /^contracts\.([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const unfencedLines = text => {
  const lines = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((value, index) => {
    if (/^\s*```/.test(value)) { fenced = !fenced; return; }
    if (!fenced) lines.push({ line: index + 1, text: value });
  });
  return lines;
};
const copyRange = range => ({
  start: { line: range.start.line, character: range.start.character },
  end: { line: range.end.line, character: range.end.character }
});

function schemas(files) {
  return [...files].flatMap(([file, text]) => {
    const match = /^collections\/([^/]+)\/_collection\.json$/.exec(file);
    const record = match ? parseJson(text)?.record : undefined;
    return match && plainObject(record) ? [{ collection: match[1], file, record }] : [];
  });
}

function recordEntries(files) {
  return [...files].flatMap(([file, text]) => {
    const match = /^collections\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(file);
    const record = match ? parseJson(text) : undefined;
    return match && plainObject(record) ? [{ collection: match[1], id: match[2], file, record }] : [];
  });
}

function currentAnalysis(analysis) {
  return typeof analysis === "function" ? analysis() : analysis?.current?.() ?? analysis;
}

function familyFor(name, files, view) {
  const contract = CONTRACT.exec(name);
  if (contract) {
    const definitions = view?.definitionsByName?.get?.(name) ?? [];
    const expectedKind = contract[2] ? "contract-value" : "contract";
    if (definitions.some(definition => definition.kind === expectedKind)) {
      return { family: "contract", adoption: contract[1], value: contract[2], address: name,
        file: `contracts/${contract[1]}.json` };
    }
  }
  const field = FIELD_REFERENCE.exec(name);
  if (field) {
    const parts = field[2].split(".");
    const fieldName = parts.at(-1);
    const parentPath = parts.slice(0, -1);
    const schema = schemas(files).find(item => item.collection === field[1])?.record;
    let level = schema;
    for (const parent of parentPath) level = level?.[parent]?.type === "list" ? level[parent].of : undefined;
    if (plainObject(level) && Object.hasOwn(level, fieldName)) {
      return { family: "collection-field", collection: field[1], field: fieldName, parentPath };
    }
    return undefined;
  }
  const definitions = view?.definitionsByName?.get?.(name) ?? [];
  const kinds = new Set(definitions.map(definition => definition.kind));
  const record = RECORD.exec(name);
  if (record && kinds.has("collection-record")) {
    return { family: "collection-record", collection: record[1], record: record[2] };
  }
  const collection = COLLECTION.exec(name);
  if (collection && kinds.has("collection")) return { family: "collection", collection: collection[1] };
  return undefined;
}

function walkShapes(level, parts, visit) {
  if (!plainObject(level)) return;
  for (const [field, shape] of Object.entries(level)) {
    if (!plainObject(shape)) continue;
    visit(field, shape, [...parts, field]);
    if (shape.type === "list" && plainObject(shape.of)) walkShapes(shape.of, [...parts, field, "of"], visit);
  }
}

function walkRecordLinks(value, level, parts, visit) {
  if (!plainObject(value) || !plainObject(level)) return;
  for (const [field, shape] of Object.entries(level)) {
    if (!plainObject(shape) || !Object.hasOwn(value, field)) continue;
    const fieldParts = [...parts, field];
    const current = value[field];
    if (shape.type === "link") {
      if (shape.many === true && Array.isArray(current)) current.forEach((item, index) => visit(item, shape, [...fieldParts, index]));
      else visit(current, shape, fieldParts);
    } else if (shape.type === "list" && Array.isArray(current) && plainObject(shape.of)) {
      current.forEach((line, index) => walkRecordLinks(line, shape.of, [...fieldParts, index], visit));
    }
  }
}

function walkFieldRecords(value, parentPath, field, parts, visit) {
  if (!plainObject(value)) return;
  if (!parentPath.length) {
    if (Object.hasOwn(value, field)) visit([...parts, field]);
    return;
  }
  const [parent, ...rest] = parentPath;
  const lines = value[parent];
  if (!Array.isArray(lines)) return;
  lines.forEach((line, index) => walkFieldRecords(line, rest, field, [...parts, parent, index], visit));
}

function walkJsonStrings(value, parts, visit) {
  if (typeof value === "string") { visit(value, parts); return; }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJsonStrings(item, [...parts, index], visit));
    return;
  }
  if (plainObject(value)) for (const [key, item] of Object.entries(value)) walkJsonStrings(item, [...parts, key], visit);
}

function site(packageService, file, values) {
  return { file, ...values, revision: packageService.revision(file) };
}

function proseSites(packageService, files, view, name) {
  const found = [];
  const seen = new Set();
  const add = (file, range) => {
    const key = `${file}\0${range.start.line}\0${range.start.character}\0${range.end.character}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(site(packageService, file, { range, channel: "prose", kind: "citation" }));
  };
  for (const anchor of view?.anchors ?? []) {
    if (anchor.name !== name && !anchor.name.startsWith(`${name}.`)) continue;
    const range = copyRange(anchor.range);
    range.end = { line: range.start.line, character: range.start.character + name.length };
    add(anchor.file, range);
  }
  // The validator trims the contents of inline-code spans. The language view
  // predates that detail, so enumerate the same unfenced spans here and give a
  // padded citation its exact editable range instead of claiming false safety.
  for (const [file, text] of files) {
    if (!/\.md$/i.test(file) || typeof text !== "string") continue;
    for (const item of unfencedLines(text)) for (const match of item.text.matchAll(/`([^`\r\n]+)`/g)) {
      const raw = match[1];
      const token = raw.trim();
      if (token !== name && !token.startsWith(`${name}.`)) continue;
      const leading = raw.length - raw.trimStart().length;
      const start = match.index + 1 + leading;
      add(file, {
        start: { line: item.line - 1, character: start },
        end: { line: item.line - 1, character: start + name.length }
      });
    }
  }
  return found;
}

function jsonSites(packageService, files, target) {
  const found = [];
  const allSchemas = schemas(files);
  if (target.family === "contract") {
    for (const [file, text] of files) {
      // A pack's exact bytes are its identity. Contract renames may rewrite
      // adoption-owned citations, never text that happens to occur in a pack.
      if (!/\.json$/i.test(file) || /\.pack\.json$/i.test(file) || typeof text !== "string") continue;
      const value = parseJson(text);
      walkJsonStrings(value, [], (current, parts) => {
        if (current === target.address || current.startsWith(`${target.address}.`)) {
          found.push(site(packageService, file, { pointer: pointer(parts), channel: "json", kind: "contract-citation", current }));
        }
      });
    }
  } else if (target.family === "collection-record") {
    for (const entry of recordEntries(files)) {
      const schema = allSchemas.find(item => item.collection === entry.collection)?.record;
      walkRecordLinks(entry.record, schema, [], (value, shape, parts) => {
        if (shape.to === target.collection && value === target.record) {
          found.push(site(packageService, entry.file, { pointer: pointer(parts), channel: "json", kind: "link-value" }));
        }
      });
    }
  } else if (target.family === "collection") {
    for (const schema of allSchemas) walkShapes(schema.record, ["record"], (_field, shape, parts) => {
      if (shape.type === "link" && shape.to === target.collection) {
        found.push(site(packageService, schema.file, { pointer: pointer([...parts, "to"]), channel: "json", kind: "collection-to" }));
      }
    });
  } else if (target.family === "collection-field") {
    const own = allSchemas.find(item => item.collection === target.collection);
    const levelParts = ["record", ...target.parentPath.flatMap(part => [part, "of"] )];
    if (own) {
      found.push(site(packageService, own.file, {
        pointer: pointer([...levelParts, target.field]), channel: "json", kind: "field-schema-key"
      }));
      let level = own.record;
      for (const parent of target.parentPath) level = level?.[parent]?.of;
      if (plainObject(level)) for (const [field, shape] of Object.entries(level)) {
        if (plainObject(shape?.when?.row) && Object.hasOwn(shape.when.row, target.field)) {
          found.push(site(packageService, own.file, {
            pointer: pointer([...levelParts, field, "when", "row", target.field]),
            ownerField: field, channel: "json", kind: "when-row"
          }));
        }
      }
    }
    for (const entry of recordEntries(files).filter(item => item.collection === target.collection)) {
      walkFieldRecords(entry.record, target.parentPath, target.field, [], parts => {
        found.push(site(packageService, entry.file, { pointer: pointer(parts), channel: "json", kind: "record-key" }));
      });
    }
    if (!target.parentPath.length) for (const schema of allSchemas) walkShapes(schema.record, ["record"], (_field, shape, parts) => {
      if (shape.type === "link" && shape.to === target.collection && shape.mirrored_by === target.field) {
        found.push(site(packageService, schema.file, {
          pointer: pointer([...parts, "mirrored_by"]), channel: "json", kind: "mirrored-by"
        }));
      }
    });
  }
  return found;
}

function refusal(packageRevision, reason, values = {}) {
  return { safety: "refused", sites: [], unreachable: [], packageRevision, reason, ...values };
}

const ruleNames = source => typeof source === "string"
  ? [...source.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/gu)].map(match => match[0]) : [];

export function collectionFieldReference(collection, field, parentPath = []) {
  return `collections.${collection}#${[...parentPath, field].join(".")}`;
}

export function createReferences({ package: packageService, analysis, edits, validatePackage } = {}) {
  if (!packageService || packageService.packageRevision === undefined || !edits || typeof validatePackage !== "function") {
    throw new TypeError("createReferences requires package, edits, validatePackage, and packageRevision.");
  }
  const packageRevision = () => packageService.packageRevision;
  const view = () => currentAnalysis(analysis);
  const files = () => packageFiles(packageService);

  const service = {
    families() {
      return ["collection", "collection-record", "collection-field", "contract"].map(family => Object.freeze({
        id: family, family, channels: Object.freeze({ prose: Object.freeze({ enumerable: true }), json: Object.freeze({ enumerable: true }) })
      }));
    },
    resolve(name) {
      const definitionsByName = view()?.definitionsByName;
      let definitions = definitionsByName?.get?.(name) ?? [];
      const segments = String(name).split(".");
      if (!definitions.length && segments[0] === "collections" && segments.length >= 4) {
        definitions = definitionsByName?.get?.(segments.slice(0, 3).join(".")) ?? [];
      }
      if (definitions.length === 1) return "known";
      if (definitions.length > 1) return "ambiguous";
      return ["collection-field", "contract"].includes(familyFor(name, files(), view())?.family) ? "known" : "unknown";
    },
    usages(name) {
      const currentFiles = files();
      const target = familyFor(name, currentFiles, view());
      if (!target) return [];
      return [...proseSites(packageService, currentFiles, view(), name), ...jsonSites(packageService, currentFiles, target)];
    },
    // The contract family also owns the one-way move from an old tuning
    // address to a contract value. It is a complete reference plan because
    // removing the key without every prose rewrite would create dangling text.
    planUseContractValue(key, contractAddress) {
      const revision = packageRevision();
      const currentFiles = files();
      const tuning = parseJson(currentFiles.get("tuning.json"));
      const target = familyFor(contractAddress, currentFiles, view());
      if (!plainObject(tuning?.values) || !Object.hasOwn(tuning.values, key)
        || target?.family !== "contract" || !target.value) {
        return refusal(revision, CONTRACT_COPY.transactionRefused, { family: "contract", key, contractAddress });
      }
      const prose = proseSites(packageService, currentFiles, view(), key);
      const range = plainObject(tuning.ranges) && Object.hasOwn(tuning.ranges, key)
        ? [site(packageService, "tuning.json", { pointer: pointer(["ranges", key]), channel: "json", kind: "tuning-range" })]
        : [];
      const rules = Object.entries(plainObject(tuning.rules) ? tuning.rules : {})
        .filter(([, source]) => ruleNames(source).includes(key))
        .map(([name, source]) => site(packageService, "tuning.json", {
          pointer: pointer(["rules", name]), channel: "json", kind: "tuning-rule", name, source
        }));
      // A personalization question that sets the key is a site the plan
      // cannot rewrite honestly (a question sets a tuning key, not a
      // contract value), so it refuses in the designer's words, as a rule does.
      const personalization = parseJson(currentFiles.get("personalization.json"));
      const sets = (Array.isArray(personalization?.questions) ? personalization.questions : []).flatMap((question, index) => {
        const found = [];
        if (question?.sets === key) found.push(pointer(["questions", index, "sets"]));
        (Array.isArray(question?.options) ? question.options : []).forEach((option, optionIndex) => {
          if (plainObject(option?.sets) && Object.hasOwn(option.sets, key)) found.push(pointer(["questions", index, "options", optionIndex, "sets", key]));
        });
        return found.map(at => site(packageService, "personalization.json", { pointer: at, channel: "json", kind: "personalization-set", question: question?.id }));
      });
      const sites = [...prose, ...range, ...rules, ...sets];
      const counts = { prose: prose.length, ranges: range.length, rules: rules.length, sets: sets.length };
      if (rules.length) return refusal(revision, CONTRACT_COPY.moveRuleRefused(key, rules[0].source), {
        family: "contract", job: "use-contract-value", sites, unreachable: rules,
        key, contractAddress, target, counts
      });
      if (sets.length) return refusal(revision, CONTRACT_COPY.moveSetRefused(key, sets[0].question), {
        family: "contract", job: "use-contract-value", sites, unreachable: sets,
        key, contractAddress, target, counts
      });
      return {
        safety: "complete", family: "contract", job: "use-contract-value", sites, unreachable: [],
        packageRevision: revision, key, contractAddress, target,
        counts, reason: CONTRACT_COPY.moveConfirmation(key, prose.length, range.length > 0)
      };
    },
    async applyUseContractValue(plan) {
      const stale = () => plan?.packageRevision !== packageRevision()
        || plan?.sites?.some(item => packageService.revision(item.file) !== item.revision);
      if (!plan || plan.safety !== "complete" || plan.job !== "use-contract-value") {
        return plan ?? refusal(packageRevision(), CONTRACT_COPY.transactionRefused);
      }
      if (stale()) return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
        family: "contract", key: plan.key, contractAddress: plan.contractAddress
      });
      const transaction = edits.begin(CONTRACT_COPY.undo.useContractNumber);
      for (const item of plan.sites.filter(site => site.channel === "prose").sort((left, right) => right.file.localeCompare(left.file)
        || right.range.start.line - left.range.start.line || right.range.start.character - left.range.start.character)) {
        transaction.text(item.file).replace({ ...item.range, revision: item.revision }, plan.contractAddress);
      }
      if (plan.sites.some(site => site.kind === "tuning-range")) {
        transaction.json("tuning.json").remove(pointer(["ranges", plan.key]));
      }
      transaction.json("tuning.json").remove(pointer(["values", plan.key]));
      if (stale()) { transaction.abort(); return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
        family: "contract", key: plan.key, contractAddress: plan.contractAddress
      }); }
      try {
        await validatePackage(transaction);
        if (stale()) { transaction.abort(); return refusal(packageRevision(), CONTRACT_COPY.renameChanged, {
          family: "contract", key: plan.key, contractAddress: plan.contractAddress
        }); }
        await transaction.commit();
      } catch (error) {
        transaction.abort();
        return refusal(packageRevision(), CONTRACT_COPY.validationRefused(error.message), {
          family: "contract", key: plan.key, contractAddress: plan.contractAddress
        });
      }
      await analysis?.refresh?.();
      return { ...plan, applied: true };
    },
    planRename(name, next) {
      const revision = packageRevision();
      const currentFiles = files();
      const currentView = view();
      const target = familyFor(name, currentFiles, currentView);
      if (!target) return refusal(revision, COLLECTION_COPY.renameUnknown(name), { name, next });
      if (target.family === "contract" && target.value) return refusal(revision, CONTRACT_COPY.valueRenameRefused(name), { name, next });
      const legal = target.family === "collection-field" ? FIELD.test(next) : KEBAB.test(next);
      if (!legal) return refusal(revision, target.family === "collection-field"
        ? COLLECTION_COPY.renameFieldName : COLLECTION_COPY.renameKebab, { name, next, family: target.family });
      let taken = false;
      if (target.family === "contract") taken = currentFiles.has(`contracts/${next}.json`);
      else if (target.family === "collection") taken = packageService.list().some(path => path === `collections/${next}`
        || path.startsWith(`collections/${next}/`));
      else if (target.family === "collection-record") taken = currentFiles.has(`collections/${target.collection}/${next}.json`);
      else {
        const own = schemas(currentFiles).find(item => item.collection === target.collection)?.record;
        let level = own;
        for (const parent of target.parentPath) level = level?.[parent]?.of;
        taken = plainObject(level) && Object.hasOwn(level, next);
      }
      if (taken) return refusal(revision, COLLECTION_COPY.renameTaken(next), { name, next, family: target.family });
      const sites = [...proseSites(packageService, currentFiles, currentView, name), ...jsonSites(packageService, currentFiles, target)];
      const counts = {
        prose: sites.filter(item => item.channel === "prose").length,
        json: sites.filter(item => item.channel === "json").length
      };
      let reason;
      let bareWords = 0;
      if (target.family === "contract") {
        reason = CONTRACT_COPY.rename(target.adoption, next, counts.prose, counts.json);
      } else if (target.family === "collection-record") {
        const definitionFile = `collections/${target.collection}/${target.record}.json`;
        bareWords = (currentView?.anchors ?? []).filter(anchor => anchor.name === target.record
          && anchor.classification === "known" && anchor.definitions?.length === 1
          && anchor.definitions[0].kind === "collection-record" && anchor.definitions[0].file === definitionFile).length;
        reason = COLLECTION_COPY.renameRecord(target.record, next, counts.prose,
          sites.filter(item => item.kind === "link-value").length);
      } else if (target.family === "collection") {
        const records = recordEntries(currentFiles).filter(item => item.collection === target.collection).length;
        reason = COLLECTION_COPY.renameCollection(target.collection, next, records, counts.prose,
          sites.filter(item => item.kind === "collection-to").length);
        counts.records = records;
      } else {
        const records = new Set(sites.filter(item => item.kind === "record-key").map(item => item.file)).size;
        const schemaNames = new Set(sites.filter(item => ["mirrored-by", "when-row"].includes(item.kind)).map(item => item.file)).size;
        reason = COLLECTION_COPY.renameField(target.field, next, records, schemaNames);
        counts.records = records;
        counts.schemas = schemaNames;
      }
      if (bareWords) reason += ` ${COLLECTION_COPY.bareMentions(bareWords, target.record)}`;
      return {
        safety: "complete", sites, unreachable: [], packageRevision: revision, reason,
        family: target.family, name, next, target, counts, bareWords
      };
    },
    async applyRename(plan) {
      const changedReason = () => COLLECTION_COPY.renameChanged;
      const stale = () => plan?.packageRevision !== packageRevision()
        || plan?.sites?.some(item => packageService.revision(item.file) !== item.revision);
      if (!plan || plan.safety !== "complete") return plan ?? refusal(packageRevision(), COLLECTION_COPY.renameUnknown(""));
      if (stale()) return refusal(packageRevision(), changedReason(), {
        name: plan.name, next: plan.next, family: plan.family
      });
      const label = plan.family === "contract" ? CONTRACT_COPY.undo.rename : COLLECTION_COPY.undo[plan.family === "collection-record" ? "renameRecord"
        : plan.family === "collection" ? "renameCollection" : "renameField"];
      const transaction = edits.begin(label);
      const prose = plan.sites.filter(item => item.channel === "prose").sort((left, right) =>
        right.file.localeCompare(left.file) || right.range.start.line - left.range.start.line
        || right.range.start.character - left.range.start.character);
      for (const item of prose) transaction.text(item.file).replace({ ...item.range, revision: item.revision },
        plan.family === "contract" ? `contracts.${plan.next}`
          : plan.family === "collection" ? `collections.${plan.next}`
            : plan.family === "collection-record" ? `collections.${plan.target.collection}.${plan.next}` : plan.next);
      const json = plan.sites.filter(item => item.channel === "json");
      if (plan.family === "contract") {
        for (const item of json) transaction.json(item.file).set(item.pointer,
          `contracts.${plan.next}${item.current.slice(`contracts.${plan.target.adoption}`.length)}`);
        transaction.file(plan.target.file).move(`contracts/${plan.next}.json`);
      } else if (plan.family === "collection-record") {
        for (const item of json) transaction.json(item.file).set(item.pointer, plan.next);
        transaction.file(`collections/${plan.target.collection}/${plan.target.record}.json`)
          .move(`collections/${plan.target.collection}/${plan.next}.json`);
      } else if (plan.family === "collection") {
        for (const item of json) transaction.json(item.file).set(item.pointer, plan.next);
        transaction.folder(`collections/${plan.target.collection}`).move(`collections/${plan.next}`);
      } else {
        const schemaKey = json.find(item => item.kind === "field-schema-key");
        const recordKeys = json.filter(item => item.kind === "record-key");
        for (const item of recordKeys) transaction.json(item.file).renameKey(item.pointer, plan.next);
        if (schemaKey) transaction.json(schemaKey.file).renameKey(schemaKey.pointer, plan.next);
        for (const item of json.filter(item => item.kind === "when-row")) {
          const parts = item.pointer.split("/");
          if (item.ownerField === plan.target.field) parts[parts.length - 4] = pointerSegment(plan.next);
          transaction.json(item.file).renameKey(parts.join("/"), plan.next);
        }
        for (const item of json.filter(item => item.kind === "mirrored-by")) transaction.json(item.file).set(item.pointer, plan.next);
      }
      if (stale()) { transaction.abort(); return refusal(packageRevision(), changedReason(), {
        name: plan.name, next: plan.next, family: plan.family
      }); }
      try {
        await validatePackage(transaction);
        if (stale()) { transaction.abort(); return refusal(packageRevision(), changedReason(), {
          name: plan.name, next: plan.next, family: plan.family
        }); }
        await transaction.commit();
      } catch (error) {
        transaction.abort();
        if (stale() || /older package revision|stale/u.test(error.message)) return refusal(packageRevision(), changedReason(), {
          name: plan.name, next: plan.next, family: plan.family
        });
        // A designer sentence first; the validator's finding under it.
        return refusal(packageRevision(), COLLECTION_COPY.validationRefused(error.message), { name: plan.name, next: plan.next, family: plan.family });
      }
      await analysis?.refresh?.();
      return { ...plan, applied: true };
    }
  };
  return Object.freeze(service);
}
