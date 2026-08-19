const DOTTED_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const SECTION_NAME = /^(?:(.+\.md))?#([A-Za-z0-9._-]+)$/i;
const ACCEPTANCE_TEST = /^AT-(\d+)$/;
const RULE = /^(?:RULE|INV)-[A-Za-z0-9._-]+$/i;
const CREATABLE_NAME = /^[A-Za-z0-9._-]+$/;

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { return undefined; }
}

function scanTokens(text) {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    if (/\s/.test(text[index])) { index += 1; continue; }
    const start = index;
    if (text[index] === '"') {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") { index += 2; continue; }
        if (text[index++] === '"') break;
      }
      const raw = text.slice(start, index);
      let value;
      try { value = JSON.parse(raw); } catch { value = undefined; }
      tokens.push({ raw, value, start, end: index });
      continue;
    }
    if ("{}[]:,".includes(text[index])) {
      tokens.push({ raw: text[index], start, end: ++index });
      continue;
    }
    while (index < text.length && !/[\s{}\[\]:,]/.test(text[index])) index += 1;
    tokens.push({ raw: text.slice(start, index), start, end: index });
  }
  return tokens;
}

function namedContainer(text, name, expectedOpen) {
  const tokens = scanTokens(text);
  const shape = expectedOpen === "{" ? "object" : "array";
  const closeFrom = index => {
    let depth = 0;
    for (let cursor = index; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].raw === "{" || tokens[cursor].raw === "[") depth += 1;
      else if (tokens[cursor].raw === "}" || tokens[cursor].raw === "]") depth -= 1;
      if (depth === 0) return tokens[cursor];
    }
    return undefined;
  };

  if (name === null) {
    const close = tokens[0]?.raw === expectedOpen ? closeFrom(0) : undefined;
    if (close) return { open: tokens[0], close };
    throw new Error(`JSON root is not a writable ${shape}.`);
  }

  // Only a direct member of the root object counts. A same-named container
  // nested anywhere else must never absorb the write.
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const raw = tokens[index].raw;
    if (raw === "{" || raw === "[") { depth += 1; continue; }
    if (raw === "}" || raw === "]") { depth -= 1; continue; }
    if (depth !== 1 || tokens[index].value !== name) continue;
    if (tokens[index + 1]?.raw !== ":" || tokens[index + 2]?.raw !== expectedOpen) continue;
    const close = closeFrom(index + 2);
    if (close) return { key: tokens[index], open: tokens[index + 2], close };
  }
  throw new Error(`${name} is not a writable ${shape} at the top level of this file.`);
}

function lineIndent(text, index) {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const prefix = text.slice(start, index);
  return /^\s*$/.test(prefix) ? prefix : "";
}

// The indent of the file's first member is one level, whatever width that is.
function indentUnit(text) {
  return /\r?\n([ \t]+)"/.exec(text)?.[1] ?? "  ";
}

function insertIntoContainer(text, container, snippet) {
  const inside = text.slice(container.open.end, container.close.start);
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  if (!inside.trim()) {
    if (!/[\r\n]/.test(inside)) return `${text.slice(0, container.close.start)}${snippet}${text.slice(container.close.start)}`;
    const closeIndent = lineIndent(text, container.close.start);
    const insertionAt = container.close.start - closeIndent.length;
    const memberIndent = closeIndent + indentUnit(text);
    return `${text.slice(0, insertionAt)}${memberIndent}${snippet}${newline}${text.slice(insertionAt)}`;
  }

  let insertionAt = container.close.start;
  while (insertionAt > container.open.end && /\s/.test(text[insertionAt - 1])) insertionAt -= 1;
  const inline = !/[\r\n]/.test(inside);
  const first = container.open.end + inside.search(/\S/);
  const memberIndent = inline ? "" : lineIndent(text, first);
  const separator = inline ? ", " : `,${newline}${memberIndent}`;
  return `${text.slice(0, insertionAt)}${separator}${snippet}${text.slice(insertionAt)}`;
}

export function insertJsonValue(text, containerName, entry) {
  if (typeof text !== "string") throw new TypeError("JSON text is required.");
  // Refuse to edit a file that is already broken: the insertion would succeed
  // and leave the designer with a still-broken file and a success message.
  if (parseJson(text) === undefined) throw new Error("This file is not valid JSON yet; fix it before creating names in it.");
  const isMember = Object.hasOwn(entry, "key");
  const container = namedContainer(text, containerName, isMember ? "{" : "[");
  const parsedContainer = parseJson(text.slice(container.open.start, container.close.end));
  if (parsedContainer === undefined) throw new Error(`${containerName} contains invalid JSON.`);
  if (isMember && Object.hasOwn(parsedContainer, entry.key)) throw new Error(`${entry.key} already exists in ${containerName}.`);
  // Match hand-authored spacing (`{"id": "mira"}`), which JSON.stringify drops.
  const record = value => `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`).join(", ")}}`;
  const snippet = isMember
    ? `${JSON.stringify(entry.key)}: ${JSON.stringify(entry.value)}`
    : record(entry.value);
  return insertIntoContainer(text, container, snippet);
}

export function parseJsonScalar(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("Enter a valid JSON scalar."); }
  if (value !== null && typeof value === "object") throw new Error("Enter a JSON scalar, not an object or array.");
  return value;
}

function appendBlock(text, block) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const separator = !text ? "" : text.endsWith(`${newline}${newline}`) ? "" : text.endsWith(newline) ? newline : `${newline}${newline}`;
  return `${text}${separator}${block.replaceAll("\n", newline)}${newline}`;
}

function titleFromSlug(slug) {
  return slug.split(/[-_.]+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(" ") || slug;
}

function markdownTarget(files, requested, openPath) {
  if (!requested) return typeof files.get(openPath) === "string" && /\.md$/i.test(openPath) ? openPath : undefined;
  if (typeof files.get(requested) === "string" && /\.md$/i.test(requested)) return requested;
  const matches = [...files.keys()].filter(path => path.slice(path.lastIndexOf("/") + 1) === requested && /\.md$/i.test(path));
  return matches.length === 1 ? matches[0] : undefined;
}

function catalogArray(collection, files) {
  if (collection?.source?.kind !== "catalog" || typeof collection.source.file !== "string") return undefined;
  const text = files.get(collection.source.file);
  const document = typeof text === "string" ? parseJson(text) : undefined;
  if (!document || Array.isArray(document) || typeof document !== "object") return undefined;
  const arrays = Object.entries(document).filter(([, value]) => Array.isArray(value));
  const named = arrays.find(([member]) => member === collection.id);
  const candidates = named ? [named] : arrays.filter(([, records]) => records.every(record => record
    && typeof record === "object"
    && !Array.isArray(record)
    && typeof record[collection.id_member] === "string"));
  if (candidates.length !== 1) return undefined;
  const [member, records] = candidates[0];
  return { file: collection.source.file, member, records };
}

function idStyle(id) {
  if (/^[a-z0-9]+$/.test(id)) return "plain";
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(id)) return "kebab";
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(id)) return "snake";
  return "other";
}

function matchesRecordIds(name, records, idMember) {
  const styles = new Set(records.map(record => idStyle(record[idMember])).filter(style => style !== "other"));
  if (!styles.size) return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(name);
  return (styles.has("plain") && /^[a-z0-9]+$/.test(name))
    || (styles.has("kebab") && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name))
    || (styles.has("snake") && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name));
}

function planAction(name, number, manifest, files) {
  const target = manifest?.build?.plan;
  const text = typeof target === "string" ? files.get(target) : undefined;
  if (typeof text !== "string" || !/\.md$/i.test(target)) return { actions: [], reason: `Cannot add ${name}: this package has no declared writable plan file.` };
  const numbers = [...text.matchAll(/^#{1,6}\s+AT-(\d+)\b/gim)].map(match => Number(match[1]));
  if (numbers.includes(number)) return { actions: [], reason: `Cannot add ${name}: ${name} already has a heading in ${target}.` };
  const next = Math.max(0, ...numbers) + 1;
  if (number !== next) return { actions: [], reason: `Cannot add ${name}: the next acceptance test must be AT-${next}.` };
  const block = `## ${name.toUpperCase()} — Acceptance test

\`\`\`test
{
  "type": "scenario",
  "given": "TODO",
  "when": "TODO",
  "then": "TODO"
}
\`\`\`

Describe what this acceptance test proves.`;
  return { actions: [{ kind: "acceptance-test", label: "Create acceptance test", target, apply: text => appendBlock(text, block), notice: `Added \`${name}\` to ${target}.` }] };
}

export function classifyCreation(name, { files, manifest, openPath }) {
  if (DOTTED_KEY.test(name)) {
    const target = "tuning.json";
    const document = parseJson(files.get(target));
    const actions = [];
    if (document?.tunables && typeof document.tunables === "object" && !Array.isArray(document.tunables)) {
      actions.push({ kind: "tunable", label: "Create tunable", target, container: "tunables", needsValue: true, notice: `Added \`${name}\` to tuning.json tunables.` });
    }
    if (document && typeof document === "object" && !Array.isArray(document)
      && (document.constants === undefined || (document.constants && typeof document.constants === "object" && !Array.isArray(document.constants)))) {
      actions.push({ kind: "constant", label: "Create constant", target, container: "constants", createContainer: document.constants === undefined, needsValue: true, notice: `Added \`${name}\` to tuning.json constants.` });
    }
    return actions.length ? { actions } : { actions, reason: `Cannot add ${name}: tuning.json has no writable tunables or constants object.` };
  }

  const section = SECTION_NAME.exec(name);
  if (section) {
    const target = markdownTarget(files, section[1], openPath);
    if (!target) return { actions: [], reason: `Cannot add ${name}: its Markdown target is not uniquely writable.` };
    const slug = section[2];
    const block = `## ${titleFromSlug(slug)} {#${slug}}`;
    return { actions: [{ kind: "section", label: "Create section", target, apply: text => appendBlock(text, block), notice: `Added \`${name}\` to ${target}.` }] };
  }

  const acceptance = ACCEPTANCE_TEST.exec(name);
  if (acceptance) return planAction(name, Number(acceptance[1]), manifest, files);

  if (RULE.test(name)) {
    const target = markdownTarget(files, null, openPath);
    if (!target) return { actions: [], reason: `Cannot add ${name}: no Markdown chapter is open.` };
    return { actions: [{ kind: "rule", label: "Create rule", target, apply: text => appendBlock(text, `## ${name}`), notice: `Added \`${name}\` to ${target}.` }] };
  }

  const target = markdownTarget(files, null, openPath);
  if (!target) return { actions: [], reason: `Cannot add ${name}: no Markdown chapter is open.` };
  if (!CREATABLE_NAME.test(name)) return { actions: [], reason: `Cannot add ${name}: a name may contain only letters, numbers, dot, underscore, and hyphen.` };
  const actions = [];
  for (const collection of manifest?.content ?? []) {
    if (!collection || typeof collection.id !== "string" || typeof collection.id_member !== "string") continue;
    const catalog = catalogArray(collection, files);
    if (!catalog || !matchesRecordIds(name, catalog.records, collection.id_member)) continue;
    actions.push({
      kind: "collection-record",
      label: `Add ${collection.id} record`,
      target: catalog.file,
      container: catalog.member,
      record: { [collection.id_member]: name },
      notice: `Added \`${name}\` to ${catalog.file} ${catalog.member}.`
    });
  }
  // This route writes a section carrying the name. When prose sub-files land
  // in a later revision, the action can gain another writable home.
  actions.push({
    kind: "section",
    label: "Give it a section here",
    target,
    apply: text => appendBlock(text, `## ${name} {#${name}}`),
    notice: `Gave \`${name}\` a section in ${target}.`
  });
  return { actions };
}
