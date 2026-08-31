import { parseJson, plainObject, pointer } from "./json-path.mjs";

const COLLECTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD_ID = /^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?$/;
const OPTION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TYPES = new Set(["string", "integer", "number", "grid", "link", "list"]);
export const parseCollectionJson = parseJson;

export function collectionNames(files) {
  return [...new Set([...files.keys()].flatMap(path => {
    const match = /^collections\/([^/]+)\//.exec(path);
    return match && COLLECTION_ID.test(match[1]) ? [match[1]] : [];
  }))].sort((left, right) => left.localeCompare(right));
}

export function recordFiles(files, collection) {
  const prefix = `collections/${collection}/`;
  return [...files.keys()].flatMap(path => {
    if (!path.startsWith(prefix) || path === `${prefix}_collection.json`) return [];
    return /^collections\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(path) ? [path] : [];
  }).sort((left, right) => left.localeCompare(right));
}

export function recordIds(files, collection) {
  return recordFiles(files, collection).map(path => path.slice(path.lastIndexOf("/") + 1, -".json".length));
}

export function schemaShapeError(shape, collections) {
  if (!plainObject(shape) || !TYPES.has(shape.type)) return "A field needs one of the six collection kinds.";
  const members = new Set(["type", "required", "when", "options", "pattern", "unique", "description", "to", "many", "loops", "mirrored_by", "of"]);
  const unknown = Object.keys(shape).find(key => !members.has(key));
  if (unknown) return `${unknown} is not a field-shape member.`;
  if (Object.hasOwn(shape, "required") && Object.hasOwn(shape, "when")) return "A field is either always required or required only when — not both.";
  if (Object.hasOwn(shape, "required") && typeof shape.required !== "boolean") return "required must be true or false.";
  if (Object.hasOwn(shape, "unique") && typeof shape.unique !== "boolean") return "no two records share it must be true or false.";
  if (Object.hasOwn(shape, "description") && typeof shape.description !== "string") return "The sentence must be text.";
  if (Object.hasOwn(shape, "options")) {
    if (shape.type !== "string") return "Choices are legal on text fields only.";
    if (!Array.isArray(shape.options) || !shape.options.length || shape.options.some(value => typeof value !== "string" || !OPTION.test(value) || value.length > 64)) {
      return "Choices must be non-empty lowercase-hyphen names of at most 64 characters.";
    }
  }
  if (Object.hasOwn(shape, "pattern") && (shape.type !== "string" || shape.pattern !== "kebab-case")) return "The lowercase-hyphen rule is legal on text fields only.";
  if (shape.type === "link") {
    if (typeof shape.to !== "string" || !collections.includes(shape.to)) return "points to must name a collection in this package.";
    if (Object.hasOwn(shape, "many") && typeof shape.many !== "boolean") return "one / many must be a choice.";
    if (Object.hasOwn(shape, "loops") && typeof shape.loops !== "boolean") return "no loops must be true or false.";
    if (Object.hasOwn(shape, "mirrored_by") && (typeof shape.mirrored_by !== "string" || !FIELD_ID.test(shape.mirrored_by))) return "mirrored by must name a field.";
  } else if (["to", "many", "loops", "mirrored_by"].some(key => Object.hasOwn(shape, key))) return "Link settings are legal on link fields only.";
  if (shape.type === "list") {
    if (!plainObject(shape.of)) return "Lines need the fields each line holds.";
    for (const [key, nested] of Object.entries(shape.of)) {
      if (!FIELD_ID.test(key)) return `${key} is not a legal field name.`;
      const error = schemaShapeError(nested, collections);
      if (error) return error;
    }
  } else if (Object.hasOwn(shape, "of")) return "each line holds is legal on lines fields only.";
  if (Object.hasOwn(shape, "when")) {
    if (!plainObject(shape.when) || Object.keys(shape.when).some(key => key !== "row")) return "only when can use record fields only.";
    if (Object.hasOwn(shape.when, "row") && (!plainObject(shape.when.row)
      || Object.values(shape.when.row).some(values => !Array.isArray(values) || !values.length))) return "only when values cannot be empty.";
  }
  return "";
}

export function stageDescribeFields(transaction, files, collection, record) {
  const path = `collections/${collection}/_collection.json`;
  const label = parseCollectionJson(files.get(path));
  if (files.has(path)) {
    if (!plainObject(label)) throw new Error(`${path} must contain a JSON object.`);
    if (Object.hasOwn(label, "record")) transaction.json(path).set("/record", record);
    else transaction.json(path).insert("", "record", record);
  } else transaction.file(path).create(`${JSON.stringify({ record }, null, 2)}\n`);
}

function stageRecordRemove(transaction, text, file, parentPath, field) {
  const record = parseCollectionJson(text);
  if (!plainObject(record)) return 0;
  let count = 0;
  const visit = (value, depth, parts) => {
    if (depth === parentPath.length) {
      if (plainObject(value) && Object.hasOwn(value, field)) {
        transaction.json(file).remove(pointer([...parts, field]));
        count += 1;
      }
      return;
    }
    const outer = parentPath[depth];
    const lines = plainObject(value) ? value[outer] : undefined;
    if (Array.isArray(lines)) lines.forEach((line, index) => visit(line, depth + 1, [...parts, outer, index]));
  };
  visit(record, 0, []);
  return count;
}

export function mirroredDependants(files, collection, field) {
  const matches = [];
  const visit = (level, other, parentPath = []) => {
    for (const [name, shape] of Object.entries(level)) {
      if (shape?.type === "link" && shape.to === collection && shape.mirrored_by === field) {
        matches.push(parentPath.length ? { collection: other, field: name, parentPath } : { collection: other, field: name });
      }
      if (shape?.type === "list" && plainObject(shape.of)) visit(shape.of, other, [...parentPath, name]);
    }
  };
  for (const other of collectionNames(files)) {
    const schema = parseCollectionJson(files.get(`collections/${other}/_collection.json`))?.record;
    if (!plainObject(schema)) continue;
    visit(schema, other);
  }
  return matches;
}

export function stageRemoveField(transaction, files, collection, field, { removeMirrors = false, parentPath = [] } = {}) {
  const path = `collections/${collection}/_collection.json`;
  const levelPointer = ["record", ...parentPath.flatMap(key => [key, "of"] )];
  transaction.json(path).remove(pointer([...levelPointer, field]));
  for (const file of recordFiles(files, collection)) stageRecordRemove(transaction, files.get(file), file, parentPath, field);
  const mirrors = parentPath.length ? [] : mirroredDependants(files, collection, field);
  if (removeMirrors) for (const mirror of mirrors) {
    const mirrorPath = `collections/${mirror.collection}/_collection.json`;
    const mirrorParent = mirror.parentPath ?? [];
    transaction.json(mirrorPath).remove(pointer(["record", ...mirrorParent.flatMap(key => [key, "of"]), mirror.field]));
    for (const file of recordFiles(files, mirror.collection)) {
      stageRecordRemove(transaction, files.get(file), file, mirrorParent, mirror.field);
    }
  }
  return mirrors;
}
