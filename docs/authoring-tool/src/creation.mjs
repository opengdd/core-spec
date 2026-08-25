const DOTTED_KEY = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const COLLECTION_RECORD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_NAME = /^(?:(.+\.md))?#([A-Za-z0-9._-]+)$/i;
const ACCEPTANCE_TEST = /^AT-(\d+)$/;
const RULE = /^(?:RULE|INV)-[A-Za-z0-9._-]+$/i;
const CREATABLE_NAME = /^[A-Za-z0-9._-]+$/;
const DESCRIPTOR_ID = /^(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PALETTE_NAME = /^palette\.((?!(?:json|md)(?:\.|$))(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?!(?:json|md)(?:\.|$))(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*)*)$/;
const RESERVED_FIRST_SEGMENTS = new Set([
  "pillars", "mood", "anti", "must_keep", "constraints", "viewing",
  "semantics", "meta", "tunables", "constants", "invariants", "clocks",
  "manifest", "build", "descriptors", "contracts", "palette"
]);
const RESERVED_EXTENSIONS = new Set(["json", "md"]);

function parseJson(text) {
  try { return JSON.parse(text); }
  catch { return undefined; }
}

const insertion = (at, keyOrIndex, value, options) => ({ type: "insert", pointer: at, keyOrIndex, value, options });

export function parseJsonScalar(text) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(CREATION_COPY.validJsonScalar); }
  if (value !== null && typeof value === "object") throw new Error(CREATION_COPY.jsonScalarOnly);
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

function collectionDrawers(files, folders) {
  const drawers = new Set();
  // Invalid drawer ids stay unavailable here because validation owns their correction.
  for (const path of folders ?? []) {
    const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(path);
    if (match) drawers.add(match[1]);
  }
  // Direct callers can omit implied folders, so files independently reveal drawers.
  for (const path of files.keys()) {
    const match = /^collections\/([a-z0-9]+(?:-[a-z0-9]+)*)\//.exec(path);
    if (match) drawers.add(match[1]);
  }
  return [...drawers].sort((left, right) => left.localeCompare(right));
}

function seedCollectionField(record, field, definition) {
  if (Object.hasOwn(definition, "pattern") || definition.unique === true || definition.type === "grid") return;
  if (Array.isArray(definition.options) && definition.options.length) record[field] = definition.options[0];
  else if (definition.type === "string") record[field] = "";
  else if (definition.type === "integer" || definition.type === "number") record[field] = 0;
}

function collectionRowWhenSatisfied(when, row) {
  // This mirrors the validator's legal subset; validation owns malformed when shapes.
  if (!when || Array.isArray(when) || typeof when !== "object") return false;
  if (!Object.hasOwn(when, "row")) return true;
  if (!when.row || Array.isArray(when.row) || typeof when.row !== "object") return false;
  return Object.entries(when.row).every(([field, values]) => Array.isArray(values) && values.includes(row[field]));
}

export function collectionRecordText(files, drawer) {
  const label = parseJson(files.get(`collections/${drawer}/_collection.json`));
  const schema = label?.record;
  if (!schema || Array.isArray(schema) || typeof schema !== "object") return "{}\n";
  const record = {};
  for (const [field, definition] of Object.entries(schema)) {
    if (!definition || Array.isArray(definition) || typeof definition !== "object" || definition.required !== true) continue;
    seedCollectionField(record, field, definition);
  }
  for (let pass = 0; pass < Object.keys(schema).length; pass += 1) {
    let added = false;
    for (const [field, definition] of Object.entries(schema)) {
      if (!definition || Array.isArray(definition) || typeof definition !== "object") continue;
      if (!Object.hasOwn(definition, "when") || Object.hasOwn(record, field)) continue;
      if (!collectionRowWhenSatisfied(definition.when, record)) continue;
      seedCollectionField(record, field, definition);
      added = Object.hasOwn(record, field);
    }
    if (!added) break;
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function kebabName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function collectionNameTaken(files, folders, name) {
  const target = kebabName(name).toLowerCase();
  if (!target) return false;
  return [...files.keys(), ...(folders ?? [])].some(path => {
    const match = /^collections\/([^/]+)(?:\/|$)/i.exec(path);
    return match?.[1].toLowerCase() === target;
  });
}

export function collectionRecordNameTaken(files, folders, drawer, name) {
  const target = `collections/${drawer}/${kebabName(name)}.json`.toLowerCase();
  if (!kebabName(name)) return false;
  return [...files.keys(), ...(folders ?? [])].some(path => path.toLowerCase() === target);
}

export function rankCollectionCreationActions(actions, files, revisionFor, limit = 3) {
  const collectionActions = actions.filter(action => action.kind === "collection-record")
    .sort((left, right) => {
      const revision = action => Math.max(-1, ...[...files.keys()]
        .filter(file => file.startsWith(`collections/${action.drawer}/`))
        .map(file => revisionFor(file) ?? -1));
      return revision(right) - revision(left) || left.drawer.localeCompare(right.drawer);
    });
  if (collectionActions.length <= limit) return actions;
  const first = actions.findIndex(action => action.kind === "collection-record");
  const ranked = actions.filter(action => action.kind !== "collection-record");
  ranked.splice(first, 0, ...collectionActions.slice(0, limit), {
    kind: "more",
    label: CREATION_COPY.more,
    choice: CREATION_COPY.more,
    revealActions: collectionActions.slice(limit)
  });
  return ranked;
}

function planAction(name, number, manifest, files) {
  // v0.6 fixed the canonical paths: the build plan is always this file,
  // and the manifest no longer carries a redirect.
  const target = "05-build-plan.md";
  const text = files.get(target);
  if (typeof text !== "string") return { actions: [], reason: CREATION_COPY.cannotAddNoPlan(name) };
  const numbers = [...text.matchAll(/^#{1,6}\s+AT-(\d+)\b/gim)].map(match => Number(match[1]));
  if (numbers.includes(number)) return { actions: [], reason: CREATION_COPY.cannotAddExistingHeading(name, target) };
  const next = Math.max(0, ...numbers) + 1;
  if (number !== next) return { actions: [], reason: CREATION_COPY.cannotAddNextAcceptance(name, next) };
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
  return { actions: [{ kind: "acceptance-test", label: CREATION_COPY.createAcceptanceTest, choice: CREATION_COPY.choices.identifier, target, apply: text => appendBlock(text, block), notice: CREATION_COPY.addedTo(name, target) }] };
}

export function classifyCreation(name, { files, folders, manifest, openPath }) {
  const palette = PALETTE_NAME.exec(name);
  if (palette) {
    const text = files.get("manifest.json");
    const document = typeof text === "string" ? parseJson(text) : undefined;
    if (!document || Array.isArray(document) || typeof document !== "object") {
      return { actions: [], reason: CREATION_COPY.cannotAddManifestObject(name) };
    }
    if (document.palette !== undefined && (!document.palette || Array.isArray(document.palette) || typeof document.palette !== "object")) {
      return { actions: [], reason: CREATION_COPY.cannotAddPaletteObject(name) };
    }
    return { actions: [{
      kind: "palette",
      label: CREATION_COPY.createPalette,
      choice: CREATION_COPY.choices.palette,
      target: "manifest.json",
      container: "palette",
      createContainer: document.palette === undefined,
      entryValue: [{ "new-color": "#000000" }],
      operations: () => [
        ...(document.palette === undefined ? [insertion("", "palette", {})] : []),
        insertion("/palette", palette[1], [{ "new-color": "#000000" }])
      ],
      notice: CREATION_COPY.addedPalette(name)
    }] };
  }

  if (DOTTED_KEY.test(name)) {
    const segments = name.split(".");
    if (RESERVED_FIRST_SEGMENTS.has(segments[0]) || segments.some(segment => RESERVED_EXTENSIONS.has(segment)) || segments.every(segment => /^\d+$/.test(segment))) {
      return { actions: [], reason: CREATION_COPY.cannotAddReserved(name) };
    }
    const target = "tuning.json";
    const document = parseJson(files.get(target));
    const actions = [];
    if (document?.tunables && typeof document.tunables === "object" && !Array.isArray(document.tunables)) {
      actions.push({ kind: "tunable", label: CREATION_COPY.createTunable, choice: CREATION_COPY.choices.tunable, target, container: "tunables", needsValue: true,
        operations: value => [insertion("/tunables", name, value)], notice: CREATION_COPY.addedTunable(name) });
    }
    if (document && typeof document === "object" && !Array.isArray(document)
      && (document.constants === undefined || (document.constants && typeof document.constants === "object" && !Array.isArray(document.constants)))) {
      actions.push({ kind: "constant", label: CREATION_COPY.createConstant, choice: CREATION_COPY.choices.constant, target, container: "constants", createContainer: document.constants === undefined, needsValue: true,
        operations: value => [
          ...(document.constants === undefined ? [insertion("", "constants", {})] : []),
          insertion("/constants", name, value)
        ], notice: CREATION_COPY.addedConstant(name) });
    }
    return actions.length ? { actions } : { actions, reason: CREATION_COPY.cannotAddTuningObjects(name) };
  }

  const section = SECTION_NAME.exec(name);
  if (section) {
    const target = markdownTarget(files, section[1], openPath);
    if (!target) return { actions: [], reason: CREATION_COPY.cannotAddMarkdownTarget(name) };
    const slug = section[2];
    const block = `## ${titleFromSlug(slug)} {#${slug}}`;
    return { actions: [{ kind: "section", label: CREATION_COPY.createSection, choice: CREATION_COPY.choices.identifier, target, apply: text => appendBlock(text, block), notice: CREATION_COPY.addedTo(name, target) }] };
  }

  const acceptance = ACCEPTANCE_TEST.exec(name);
  if (acceptance) return planAction(name, Number(acceptance[1]), manifest, files);

  if (RULE.test(name)) {
    const target = markdownTarget(files, null, openPath);
    if (!target) return { actions: [], reason: CREATION_COPY.cannotAddNoMarkdown(name) };
    return { actions: [{ kind: "rule", label: CREATION_COPY.createRule, choice: CREATION_COPY.choices.identifier, target, apply: text => appendBlock(text, `## ${name}`), notice: CREATION_COPY.addedTo(name, target) }] };
  }

  const target = markdownTarget(files, null, openPath);
  if (!target) return { actions: [], reason: CREATION_COPY.cannotAddNoMarkdown(name) };
  if (!CREATABLE_NAME.test(name)) return { actions: [], reason: CREATION_COPY.cannotAddNameShape(name) };
  const actions = [];
  const descriptors = manifest?.descriptors;
  const moods = descriptors?.mood;
  if (DESCRIPTOR_ID.test(name)
    && manifest?.opengdd === "0.6" && !Array.isArray(manifest) && typeof manifest === "object"
    && (descriptors === undefined || (descriptors && !Array.isArray(descriptors) && typeof descriptors === "object"))
    && (moods === undefined || Array.isArray(moods))) {
    const stub = { id: name, intent: "Describe the intended mood.", anti: [{ description: "Not yet specified." }] };
    actions.push({
      kind: "descriptor",
      label: CREATION_COPY.createDescriptor,
      choice: CREATION_COPY.choices.descriptor,
      target: "manifest.json",
      operations: () => descriptors === undefined
        ? [insertion("", "descriptors", { mood: [stub] })]
        : moods === undefined
          ? [insertion("/descriptors", "mood", [stub])]
          : [insertion("/descriptors/mood", "-", stub, { recordSpacing: true })],
      notice: CREATION_COPY.addedDescriptor(name)
    });
  }
  if (COLLECTION_RECORD_ID.test(name)) for (const drawer of collectionDrawers(files, folders)) {
    const collectionTarget = `collections/${drawer}/${name}.json`;
    if ([...files.keys(), ...(folders ?? [])].some(path => path.toLowerCase() === collectionTarget.toLowerCase())) continue;
    actions.push({
      kind: "collection-record",
      drawer,
      label: CREATION_COPY.addCollectionRecord(drawer),
      choice: CREATION_COPY.addCollectionRecord(drawer),
      target: collectionTarget,
      create: collectionRecordText(files, drawer),
      notice: CREATION_COPY.addedCollection(name, drawer)
    });
  }
  actions.push({
    kind: "section",
    label: CREATION_COPY.giveSectionHere,
    choice: CREATION_COPY.choices.identifier,
    target,
    apply: text => appendBlock(text, `## ${name} {#${name}}`),
    notice: CREATION_COPY.gaveSection(name, target)
  });
  return { actions };
}
import { CREATION_COPY } from "./copy/creation-copy.mjs";
