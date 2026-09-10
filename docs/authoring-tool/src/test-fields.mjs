import { modeIds, runtimeAddresses } from "./clock-fields.mjs";
import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { element } from "./dom.mjs";
import { findFencedJson, readEmbedded, stageEmbedded } from "./embedded-json.mjs";
import { openTextEditDialog } from "./entity-lifecycle.mjs";
import { parseJson, plainObject, pointerSegment } from "./json-path.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const HEADING = /^(#{1,6})\s+(AT-(\d+))\b(.*)$/u;
const pointer = parts => parts.length ? `/${parts.map(pointerSegment).join("/")}` : "";
const pointerParts = value => value.slice(1).split("/").map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"));
const childPointer = (base, ...parts) => `${base}${parts.map(part => `/${pointerSegment(part)}`).join("")}`;

export function acceptanceTestEntity(selection, files, revision) {
  if (selection?.kind !== "acceptance-test" || selection.file !== "05-build-plan.md") return null;
  const text = files.get(selection.file);
  if (typeof text !== "string") return null;
  const headings = [...text.matchAll(/^#{1,6}\s+(AT-(\d+))\b(.*)$/gmu)];
  const heading = headings.find(match => match[1].toUpperCase() === String(selection.name).toUpperCase());
  if (!heading) return null;
  const line = text.slice(0, heading.index).split("\n").length - 1;
  const lineText = heading[0];
  const lines = text.split(/\r?\n/u);
  const block = findFencedJson(text, { tag: "test", afterLine: line + 1, revision });
  const next = headings.find(match => match.index > heading.index);
  const nextLine = next ? text.slice(0, next.index).split("\n").length - 1 : lines.length;
  const ownsBlock = block && block.range.start.line < nextLine;
  const rawTitle = String(heading[3] ?? "");
  const prefix = /^\s*(?::|—|-)?\s*/u.exec(rawTitle)?.[0] ?? "";
  const headingTitle = rawTitle.slice(prefix.length).trim();
  const titleStart = lineText.length - rawTitle.length + prefix.length;
  const closeLine = ownsBlock ? block.range.end.line : line;
  const removeEnd = closeLine + 1 < lines.length
    ? { line: closeLine + 1, character: 0 }
    : { line: closeLine, character: lines[closeLine]?.length ?? 0 };
  let document;
  try { document = ownsBlock ? readEmbedded(block, "").value : undefined; } catch {}
  return {
    id: heading[1].toUpperCase(), address: heading[1].toUpperCase(),
    title: headingTitle ? `${heading[1].toUpperCase()}: ${headingTitle}` : heading[1].toUpperCase(),
    headingTitle, titleIsProse: true, kindLabel: INSPECTOR_COPY.acceptanceTestKind, file: selection.file, line,
    headingLine: lineText, block: ownsBlock ? block : undefined,
    blockError: ownsBlock ? undefined : INSPECTOR_COPY.testBlockMissing, document, text,
    range: { start: { line, character: 0 }, end: removeEnd, revision },
    removeRange: { start: { line, character: 0 }, end: removeEnd, revision },
    titleRange: {
      start: { line, character: titleStart }, end: { line, character: titleStart + headingTitle.length }, revision
    }
  };
}

const currentEntity = (context, entity) => acceptanceTestEntity(
  { kind: "acceptance-test", name: entity.id, file: entity.file },
  new Map([[entity.file, context.package.read(entity.file)]]), context.package.revision(entity.file)
);

async function embeddedChange(context, entity, label, operations) {
  const current = currentEntity(context, entity);
  if (!current?.block) throw new Error(INSPECTOR_COPY.embeddedRefresh);
  const transaction = context.internal.begin(label);
  stageEmbedded(transaction, current.file, current.block, operations);
  await transaction.commit();
}

function embeddedField(context, entity, values) {
  const at = values.binding.pointer;
  return {
    ...values,
    read() { return readEmbedded(currentEntity(context, entity).block, at); },
    async write(value, options = {}) {
      if (typeof values.write === "function") return values.write(value, options);
      const current = currentEntity(context, entity);
      const state = readEmbedded(current.block, at);
      if (options.remove && !state.exists) return;
      const operations = options.operations?.(state, value) ?? (options.remove
        ? [{ type: "remove", pointer: at }]
        : state.exists ? [{ type: "set", pointer: at, value }]
          : (() => {
            const parts = pointerParts(at); const key = parts.pop();
            return [{ type: "insert", pointer: pointer(parts), keyOrIndex: key, value }];
          })());
      await embeddedChange(context, entity, options.label ?? values.labels?.change ?? INSPECTOR_COPY.changeAcceptanceTest, operations);
    }
  };
}

function testTypeField(context, entity) {
  return embeddedField(context, entity, {
    key: "type", label: INSPECTOR_COPY.testType, help: INSPECTOR_COPY.testTypeHelp,
    type: "enum", required: true, options: ["scenario", "general"],
    labels: { change: INSPECTOR_COPY.changeTestType }, binding: { file: entity.file, pointer: "/type" },
    async write(value) {
      const current = currentEntity(context, entity);
      const document = readEmbedded(current.block, "").value;
      if (document.type === value) return;
      const remove = value === "general" ? ["given", "when", "then"] : ["scope", "holds", "seeds"];
      const operations = [{ type: Object.hasOwn(document, "type") ? "set" : "insert", pointer: Object.hasOwn(document, "type") ? "/type" : "",
        keyOrIndex: Object.hasOwn(document, "type") ? undefined : "type", value }];
      for (const key of remove) if (Object.hasOwn(document, key)) operations.push({ type: "remove", pointer: `/${key}` });
      await embeddedChange(context, entity, INSPECTOR_COPY.changeTestType, operations);
    }
  });
}

function authoredSteps(context, entity, key) {
  return embeddedField(context, entity, {
    key, label: INSPECTOR_COPY.testStepLabel(key), help: INSPECTOR_COPY.testStepHelp(key),
    type: "list", required: true, commitOnBlur: true,
    binding: { file: entity.file, pointer: `/${key}` }, labels: { change: INSPECTOR_COPY.changeAcceptanceTest },
    format: value => typeof value === "string" ? value : Array.isArray(value) ? value.join("\n") : "",
    parse(source) {
      const state = readEmbedded(currentEntity(context, entity).block, `/${key}`);
      const lines = source === "" ? [] : source.split(/\r?\n/u);
      return Array.isArray(state.value) || lines.length !== 1 ? lines : lines[0];
    }
  });
}

const candidates = (items, group) => items.map(value => ({ value, label: value, group }));

function mountRemove(context, entity, family, index, value) {
  return ({ box }) => {
    const button = element(context.document, "button", INSPECTOR_COPY.testRemoveRow);
    const errorNode = element(context.document, "p", "", "opengdd-author-form-error");
    button.type = "button";
    button.dataset.testRemoveRow = `${family}-${index}`;
    button.setAttribute("aria-label", INSPECTOR_COPY.testRemoveRowLabel(value));
    errorNode.hidden = true;
    errorNode.id = `opengdd-test-${entity.id}-${family}-${index}-action-error`;
    button.addEventListener("click", () => Promise.resolve(removeReferenceRow(context, entity, family, index))
      .then(() => { errorNode.hidden = true; errorNode.textContent = ""; })
      .catch(error => {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
        button.setAttribute("aria-describedby", errorNode.id);
      }));
    box.append(button, errorNode);
  };
}

function referenceRows(context, entity, family, values, options) {
  return (Array.isArray(values) ? values : []).map((value, index) => embeddedField(context, entity, {
    key: `${family}-${index}`, row: `${family}-${index}`, rowLabel: options.rowLabel(index, value),
    label: options.label, ariaLabel: options.rowLabel(index, value), help: options.help,
    helpShared: family, type: "reference", required: true,
    binding: { file: entity.file, pointer: childPointer(options.pointer, index) },
    options: { candidates: options.candidates, allowFree: false },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest }, mount: mountRemove(context, entity, family, index, value)
  }));
}

function currentDocument(context, entity) {
  return readEmbedded(currentEntity(context, entity).block, "").value;
}

function directionCandidates(context) {
  const direction = parseJson(context.package.read("direction.json"));
  return candidates(["colors", "contrast", "timing"].flatMap(kind =>
    Object.keys(plainObject(direction?.[kind]) ? direction[kind] : {}).map(name => `${kind}.${name}`)),
  INSPECTOR_COPY.testDirectionCandidates);
}

export function acceptanceTestFields(context, entity) {
  const document = plainObject(entity.document) ? entity.document : {};
  const fields = [testTypeField(context, entity)];
  if (document.type === "scenario") fields.push(...["given", "when", "then"].map(key => authoredSteps(context, entity, key)));
  else if (document.type === "general") fields.push(...["scope", "holds"].map(key => embeddedField(context, entity, {
    key, label: INSPECTOR_COPY.testGeneralLabel(key), help: INSPECTOR_COPY.testGeneralHelp(key),
    type: "longtext", required: true, commitOnBlur: true, binding: { file: entity.file, pointer: `/${key}` },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest }
  })), embeddedField(context, entity, {
    key: "seeds", label: INSPECTOR_COPY.testSeeds, help: INSPECTOR_COPY.testSeedsHelp,
    type: "list", commitOnBlur: true, clearRemoves: true, binding: { file: entity.file, pointer: "/seeds" },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest, clear: INSPECTOR_COPY.changeAcceptanceTest }
  }));
  fields.push(embeddedField(context, entity, {
    key: "diagnostics", label: INSPECTOR_COPY.testDiagnostics, help: INSPECTOR_COPY.testDiagnosticsHelp,
    type: "list", commitOnBlur: true, clearRemoves: true, binding: { file: entity.file, pointer: "/diagnostics" },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest, clear: INSPECTOR_COPY.changeAcceptanceTest }
  }));
  fields.push(...referenceRows(context, entity, "direction_claims", document.direction_claims, {
    pointer: "/direction_claims", label: INSPECTOR_COPY.testDirectionClaim,
    help: INSPECTOR_COPY.testDirectionClaimHelp, candidates: directionCandidates(context),
    rowLabel: index => INSPECTOR_COPY.testDirectionClaimRow(index)
  }));
  const unchanged = plainObject(document.unchanged) ? document.unchanged : {};
  fields.push(...referenceRows(context, entity, "modes", unchanged.modes, {
    pointer: "/unchanged/modes", label: INSPECTOR_COPY.testMode, help: INSPECTOR_COPY.testModeHelp,
    candidates: candidates(modeIds(context.package), INSPECTOR_COPY.testModeCandidates),
    rowLabel: index => INSPECTOR_COPY.testModeRow(index)
  }), ...referenceRows(context, entity, "values", unchanged.values, {
    pointer: "/unchanged/values", label: INSPECTOR_COPY.testRuntimeValue, help: INSPECTOR_COPY.testRuntimeValueHelp,
    candidates: candidates(runtimeAddresses(context.package, context.internal.view?.()), INSPECTOR_COPY.testRuntimeCandidates),
    rowLabel: index => INSPECTOR_COPY.testRuntimeRow(index)
  }));
  fields.push(embeddedField(context, entity, {
    key: "target", label: INSPECTOR_COPY.testTarget, help: INSPECTOR_COPY.testTargetHelp,
    type: "number", commitOnBlur: true, clearRemoves: true, binding: { file: entity.file, pointer: "/target" },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest, clear: INSPECTOR_COPY.changeAcceptanceTest }
  }));
  if (Object.hasOwn(document, "target") || Object.hasOwn(document, "tolerance")) fields.push(embeddedField(context, entity, {
    key: "tolerance", label: INSPECTOR_COPY.testTolerance, help: INSPECTOR_COPY.testToleranceHelp,
    type: "number", commitOnBlur: true, clearRemoves: true, binding: { file: entity.file, pointer: "/tolerance" },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest, clear: INSPECTOR_COPY.changeAcceptanceTest }
  }));
  for (const key of ["replay", "extensions"]) fields.push(embeddedField(context, entity, {
    key, label: INSPECTOR_COPY.testOpaqueLabel(key), help: INSPECTOR_COPY.testOpaqueHelp(key),
    type: "longtext", monospace: true, commitOnBlur: true, clearRemoves: true,
    binding: { file: entity.file, pointer: `/${key}` },
    format: value => value === undefined ? "" : JSON.stringify(value, null, 2),
    parse(source) { if (!source.trim()) return undefined; return JSON.parse(source); },
    labels: { change: INSPECTOR_COPY.changeAcceptanceTest, clear: INSPECTOR_COPY.changeAcceptanceTest },
    action: { label: INSPECTOR_COPY.showInFile(entity.file), run: () => context.services.selection.select({
      kind: "file", name: entity.file, file: entity.file, range: currentEntity(context, entity).range
    }, { reveal: true, focus: true }) }
  }));
  return fields;
}

export async function addReferenceRow(context, entity, family) {
  const document = currentDocument(context, entity);
  const details = family === "direction_claims"
    ? { pointer: "/direction_claims", values: document.direction_claims, candidates: directionCandidates(context).map(item => item.value) }
    : family === "modes"
      ? { pointer: "/unchanged/modes", values: document.unchanged?.modes, candidates: modeIds(context.package) }
      : { pointer: "/unchanged/values", values: document.unchanged?.values,
        candidates: runtimeAddresses(context.package, context.internal.view?.()) };
  if (details.values !== undefined && !Array.isArray(details.values)) throw new Error(INSPECTOR_COPY.testListUnreadable(family));
  const value = details.candidates.find(item => !details.values?.includes(item));
  if (!value) throw new Error(INSPECTOR_COPY.testNoReferenceCandidates(family));
  const operations = [];
  if (family === "direction_claims") {
    operations.push(Array.isArray(details.values)
      ? { type: "insert", pointer: details.pointer, keyOrIndex: "-", value }
      : { type: "insert", pointer: "", keyOrIndex: "direction_claims", value: [value] });
  } else if (!plainObject(document.unchanged)) {
    operations.push({ type: "insert", pointer: "", keyOrIndex: "unchanged", value: { [family]: [value] } });
  } else operations.push(Array.isArray(details.values)
    ? { type: "insert", pointer: details.pointer, keyOrIndex: "-", value }
    : { type: "insert", pointer: "/unchanged", keyOrIndex: family, value: [value] });
  await embeddedChange(context, entity, INSPECTOR_COPY.testAddRowUndo(family), operations);
  context.internal.focusField?.(entity.file, `${family}-${Array.isArray(details.values) ? details.values.length : 0}`);
}

export async function removeReferenceRow(context, entity, family, index) {
  const document = currentDocument(context, entity);
  const values = family === "direction_claims" ? document.direction_claims : document.unchanged?.[family];
  if (!Array.isArray(values) || index < 0 || index >= values.length) throw new Error(INSPECTOR_COPY.embeddedRefresh);
  const base = family === "direction_claims" ? "/direction_claims" : `/unchanged/${family}`;
  const other = family === "modes" ? document.unchanged?.values : document.unchanged?.modes;
  const target = values.length > 1 ? childPointer(base, index)
    : family !== "direction_claims" && !Array.isArray(other) ? "/unchanged" : base;
  await embeddedChange(context, entity, INSPECTOR_COPY.testRemoveRowUndo(family), [{ type: "remove", pointer: target }]);
  if (values.length > 1) context.internal.focusField?.(entity.file, `${family}-${Math.min(index, values.length - 2)}`);
}

function addSection(context, entity, family, title, help, count) {
  const button = element(context.document, "button", INSPECTOR_COPY.testAddRow(family));
  button.type = "button";
  button.dataset.testAddRow = family;
  const errorNode = element(context.document, "p", "", "opengdd-author-form-error");
  errorNode.id = `opengdd-test-${entity.id}-${family}-action-error`;
  errorNode.hidden = true;
  button.addEventListener("click", () => Promise.resolve(addReferenceRow(context, entity, family))
    .then(() => { errorNode.hidden = true; errorNode.textContent = ""; })
    .catch(error => {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      button.setAttribute("aria-describedby", `${section.querySelector("h3").getAttribute("aria-describedby")} ${errorNode.id}`);
    }));
  const section = referenceGroup(context, { key: family, label: title, help, rows: [], empty: count === 0, count, action: button });
  section.dataset.testReferenceList = family;
  section.tabIndex = -1;
  button.setAttribute("aria-describedby", section.querySelector("h3").getAttribute("aria-describedby"));
  section.querySelector(".opengdd-author-reference-content").append(errorNode);
  return section;
}

export function acceptanceTestSections(context, entity) {
  const directionCount = Array.isArray(entity.document?.direction_claims) ? entity.document.direction_claims.length : 0;
  const modeCount = Array.isArray(entity.document?.unchanged?.modes) ? entity.document.unchanged.modes.length : 0;
  const valueCount = Array.isArray(entity.document?.unchanged?.values) ? entity.document.unchanged.values.length : 0;
  const sections = [
    addSection(context, entity, "direction_claims", INSPECTOR_COPY.testDirectionClaims, INSPECTOR_COPY.testDirectionClaimsHelp, directionCount),
    addSection(context, entity, "modes", INSPECTOR_COPY.testModes, INSPECTOR_COPY.testModesHelp, modeCount),
    addSection(context, entity, "values", INSPECTOR_COPY.testRuntimeValues, INSPECTOR_COPY.testRuntimeValuesHelp, valueCount)
  ];
  const sites = context.internal.entry?.()?.citations ?? [];
  const citationRows = sites.length ? locationRows(context, sites, { reveal: site => context.internal.revealLocation(site) }) : undefined;
  for (const row of citationRows?.querySelectorAll("button") ?? []) row.dataset.testCitation = "";
  const citations = referenceGroup(context, { label: INSPECTOR_COPY.testCitations,
    help: sites.length ? INSPECTOR_COPY.testCitationsHelp : INSPECTOR_COPY.testNoCitations,
    rows: citationRows ? [citationRows] : [] });
  const claims = Array.isArray(entity.document?.direction_claims) ? entity.document.direction_claims : [];
  const claimChips = claims.length ? entityChips(context, claims.map(claim => {
      const kind = String(claim).split(".")[0];
      return { name: claim, kind, dataset: { testPromise: "" },
        selection: { kind, name: claim, file: "direction.json" } };
    })) : undefined;
  const coverage = referenceGroup(context, { label: INSPECTOR_COPY.testPromises,
    help: claims.length ? INSPECTOR_COPY.testPromisesHelp : INSPECTOR_COPY.testNoPromises,
    rows: claimChips ? [claimChips] : [] });
  return [...sections, citations, coverage];
}

export function renameAcceptanceTest(context, entity, anchor) {
  return openTextEditDialog({
    document: context.document, anchor, label: INSPECTOR_COPY.testRenameQuestion,
    initial: entity.headingTitle, confirm: INSPECTOR_COPY.rename, cancel: INSPECTOR_COPY.cancel,
    validate: value => value ? "" : INSPECTOR_COPY.testHeadingRequired,
    async submit(value) {
      const current = currentEntity(context, entity);
      const replacement = current.headingTitle ? value : `: ${value}`;
      await embeddedHeadingChange(context, current, replacement);
    }
  });
}

async function embeddedHeadingChange(context, entity, value) {
  const transaction = context.internal.begin(INSPECTOR_COPY.renameAcceptanceTest);
  transaction.text(entity.file).replace(entity.titleRange, value);
  await transaction.commit();
}

export function routeAcceptanceTestFinding(finding, entity) {
  const message = String(finding.message ?? "");
  if (!message.includes(entity.id) && finding.code !== "VERIFICATION_AT_MISSING") return false;
  if (["VERIFICATION_BLOCK", "VERIFICATION_SHAPE", "VERIFICATION_AT_ORDER", "VERIFICATION_AT_MISSING"].includes(finding.code)) return "header";
  if (["VERIFICATION_CLASS", "VERIFICATION_TYPE_RETIRED"].includes(finding.code)) return "type";
  if (finding.code === "VERIFICATION_GENERAL_SCOPE") return "scope";
  if (finding.code === "VERIFICATION_GENERAL_HOLDS") return "holds";
  if (finding.code === "VERIFICATION_GENERAL_SEEDS") return "seeds";
  if (finding.code === "VERIFICATION_TOLERANCE_TARGET") return "tolerance";
  if (finding.code === "VERIFICATION_REPLAY") return "replay";
  if (finding.code === "VERIFICATION_EXTENSIONS") return "extensions";
  if (finding.code === "VERIFICATION_FIELD" || finding.code === "VERIFICATION_FIELD_TYPE" || finding.code === "VERIFICATION_FIELD_UNKNOWN") {
    return ["given", "when", "then", "scope", "holds", "seeds", "diagnostics", "target", "tolerance", "replay", "extensions"]
      .find(key => new RegExp(`(?:requires .*\\b|scenario |general |field \")${key}\\b`, "u").test(message)) ?? "header";
  }
  if (finding.code === "DIRECTION_CLAIMS_DANGLING") {
    const claim = /direction_claims cites ("(?:\\.|[^"\\])*")/u.exec(message)?.[1];
    let value;
    try { value = claim ? JSON.parse(claim) : undefined; } catch {}
    const index = Array.isArray(entity.document?.direction_claims) ? entity.document.direction_claims.indexOf(value) : -1;
    return index >= 0 ? `direction_claims-${index}` : "direction_claims";
  }
  if (finding.code === "DIRECTION_CLAIMS_SHAPE") {
    const index = Array.isArray(entity.document?.direction_claims)
      ? entity.document.direction_claims.findIndex(value => typeof value !== "string") : -1;
    return index >= 0 ? `direction_claims-${index}` : "direction_claims";
  }
  if (finding.code === "UNCHANGED_MODE") {
    const value = /undeclared mode ("(?:\\.|[^"\\])*")/u.exec(message)?.[1];
    let mode; try { mode = value ? JSON.parse(value) : undefined; } catch {}
    const index = entity.document?.unchanged?.modes?.indexOf(mode) ?? -1;
    return index >= 0 ? `modes-${index}` : "modes";
  }
  if (["UNCHANGED_ADVANCES", "UNCHANGED_UNDEFINED"].includes(finding.code)) {
    const value = /names ("runtime\.(?:\\.|[^"\\])*")/u.exec(message)?.[1];
    let address; try { address = value ? JSON.parse(value) : undefined; } catch {}
    const index = entity.document?.unchanged?.values?.indexOf(address) ?? -1;
    return index >= 0 ? `values-${index}` : "values";
  }
  if (finding.code === "UNCHANGED_NO_CLOCKS") return "modes";
  if (finding.code === "UNCHANGED_SHAPE") return message.includes(".values") ? "values" : "modes";
  return finding.code === "VERIFICATION_JSON" ? false : null;
}
