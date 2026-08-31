import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { isContractDependentFinding, isContractTodoFinding } from "./contracts.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { kindClass } from "./kinds.mjs";
import { buildOutlineModel } from "./outline-view.mjs";

export const OUTLINE_CREATE_ITEMS = Object.freeze(CREATION_COPY.outlineItems.flatMap(item => item === "Collection" ? [item, CONTRACT_COPY.create] : [item]));
const outlineData = value => encodeURIComponent(value);
const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const inlineCodeHtml = (value = "") => String(value).split("`")
  .map((part, index) => index % 2 ? `<code>${escapeHtml(part)}</code>` : escapeHtml(part))
  .join("");

export function outlineIcon(group) {
  const common = `class="opengdd-author-outline-icon" data-outline-icon="${group.id}" aria-hidden="true" focusable="false" viewBox="0 0 16 16"`;
  if (["pillars", "anti", "must_keep", "colors", "contrast", "timing"].includes(group.id)) {
    return `<svg ${common}><path d="M3 3h10v10H3zM5 6h6M5 9h6"/></svg>`;
  }
  if (group.id === "values") return `<svg ${common}><path d="M2 4h5m3 0h4M2 8h1m3 0h8M2 12h7m3 0h2M7 2v4M3 6v4m6 0v4"/></svg>`;
  if (group.id === "collections") return `<svg ${common}><path d="M2 3h12v10H2zM2 7h12M6 3v10m4-10v10"/></svg>`;
  if (group.id === "contracts") return `<svg ${common}><path d="M3 2h8l2 2v10H3zM6 6h4M6 9h4M6 12h2"/></svg>`;
  if (group.id === "mood") return `<svg ${common}><path d="M8 2l6 6-6 6-6-6z"/></svg>`;
  if (group.id === "palette") return `<svg ${common}><path d="M2 3h8v8H2zM6 7h8v6H6z"/></svg>`;
  if (group.id === "rules") return `<svg ${common}><path d="M2 5h5m2 0h5M2 11h5m2 0h5M7 3v4m2 2v4"/></svg>`;
  if (group.id === "runtime") return `<svg ${common}><path d="M2 9h3l2-5 2 8 2-5h3"/></svg>`;
  if (group.id === "clocks") return `<svg ${common}><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>`;
  if (group.id === "rulesets") return `<svg ${common}><path d="M3 3h10v4H3zM3 9h10v4H3z"/></svg>`;
  if (group.id === "sections") return `<svg ${common}><path d="M3 3h10M3 7h7M3 11h10M3 14h6"/></svg>`;
  if (group.id === "acceptance-tests") return `<svg ${common}><path d="M2 8l3 3 8-8M8 13h6"/></svg>`;
  if (group.id === "questions") return `<svg ${common}><path d="M5 5a3 3 0 116 0c0 2-3 2-3 5M8 13v.2"/></svg>`;
  return `<svg ${common}><circle cx="8" cy="8" r="5"/></svg>`;
}

function severityIcon(label) {
  return `<svg class="opengdd-author-outline-severity-icon" role="img" aria-label="${label}" viewBox="0 0 16 16"><path d="M8 2l6 12H2L8 2zm0 4v4m0 2v.5"/></svg>`;
}

export function findingBadge(findingIndexes, findings, target = "") {
  if (!findingIndexes.length) return "";
  const uncited = findingIndexes.filter(index => findings[index].code === "COLLECTION_UNCITED");
  const ordinary = findingIndexes.filter(index => !uncited.includes(index));
  const uncitedBadge = uncited.map(index => `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--warning opengdd-author-outline-badge--sentence" data-outline-finding="${index}" aria-label="${escapeHtml(WIDGET_COPY.collectionUnmentioned)}">${severityIcon("warning")}<span>${escapeHtml(WIDGET_COPY.collectionUnmentioned)}</span></button>`).join("");
  if (!ordinary.length) return uncitedBadge;
  const ordinaryFindings = ordinary.map(index => findings[index]);
  const errors = ordinaryFindings.filter(finding => finding.severity === "error").length;
  const warnings = ordinaryFindings.filter(finding => finding.severity === "warning").length;
  const severity = errors ? "error" : "warning";
  const label = WIDGET_COPY.problemCounts(ordinary.length, errors, warnings);
  const attribute = target ? ` data-outline-finding="${ordinary[0]}"` : "";
  const tag = target ? "button" : "span";
  const type = target ? ' type="button"' : "";
  return `${uncitedBadge}<${tag}${type} class="opengdd-author-outline-badge opengdd-author-outline-badge--${severity}"${attribute} aria-label="${label}">${severityIcon(severity)}<span>${ordinary.length}</span></${tag}>`;
}

export function contractFindingBadge(findingIndexes, findings) {
  const questionIndexes = findingIndexes.filter(index => findings[index]?.code === "CONTRACT_ANSWER_MISSING");
  const valueIndexes = findingIndexes.filter(index => findings[index]?.code === "CONTRACT_VALUE_MISSING");
  const todoIndexes = findingIndexes.filter(index => isContractTodoFinding(findings[index]));
  const consequenceIndexes = todoIndexes.length
    ? findingIndexes.filter(index => isContractDependentFinding(findings[index])
      && !todoIndexes.includes(index)) : [];
  // A missing verification input is the designer's to do as much as an answer is.
  const inputIndexes = todoIndexes.filter(index => !questionIndexes.includes(index) && !valueIndexes.includes(index));
  const summarizedIndexes = new Set([...questionIndexes, ...valueIndexes, ...inputIndexes, ...consequenceIndexes]);
  const ordinary = findingIndexes.filter(index => !summarizedIndexes.has(index));
  const label = CONTRACT_COPY.badge(questionIndexes.length, valueIndexes.length, inputIndexes.length);
  const tailText = consequenceIndexes.length ? CONTRACT_COPY.consequenceTail(consequenceIndexes.length) : "";
  const tail = tailText
    ? ` <span class="opengdd-author-outline-contract-consequences">${escapeHtml(tailText)}</span>` : ""; // the space separates the tail from the counts in text as on screen
  const todo = todoIndexes.length
    ? `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--error opengdd-author-outline-badge--sentence" data-outline-finding="${todoIndexes[0]}" aria-label="${escapeHtml([label, tailText].filter(Boolean).join(" "))}">${severityIcon("error")}<span>${escapeHtml(label)}</span>${tail}</button>`
    : `<span class="opengdd-author-outline-complete" role="img" aria-label="${CONTRACT_COPY.complete}">✓</span>`;
  return `${todo}${findingBadge(ordinary, findings, "finding")}`;
}

export function createOutlineRenderer({
  element,
  document,
  view,
  state,
  hidden = () => false,
  panelHost,
  entries,
  beforeOpen,
  openLocation,
  openFinding,
  report,
  select,
  syncCollectionCollapsed,
  createFromOutline,
  openCollectionDialog,
  openContractRename,
  toggleRange,
  acceptLinkOffer
}) {
  let renderedModel = "";
  let frame = 0;

  const findingBadgeLabel = findingIndexes => {
    const findings = findingIndexes.map(index => state.validation.run.findings[index]);
    const errors = findings.filter(finding => finding.severity === "error").length;
    const warnings = findings.filter(finding => finding.severity === "warning").length;
    return WIDGET_COPY.problemCounts(findingIndexes.length, errors, warnings);
  };

  function render() {
    if (!element || hidden()) return;
    const model = buildOutlineModel({
      authoringView: state.authoringView,
      validation: state.validation,
      problemsOnly: state.outlineProblemsOnly,
      menuOpen: state.outlineMenuOpen,
      selection: state.outlineSelection,
      collectionCollapsed: state.outlineCollectionCollapsed,
      fallbackOpen: state.outlineFallbackOpen
    });
    const serialized = JSON.stringify(model);
    if (serialized === renderedModel) return;
    renderedModel = serialized;
    const active = element.contains(document.activeElement) ? document.activeElement.dataset.outlineFocus : "";
    const validationFindings = state.validation.run?.findings ?? [];
    const groups = model.groups.map(group => {
      const all = group.artifacts;
      const shown = state.outlineProblemsOnly ? all.filter(artifact => artifact.findings.length).map(artifact => ({
        ...artifact,
        children: artifact.children.filter(child => child.findings.length)
      })) : all;
      const groupFallback = group.fallback;
      if (state.outlineProblemsOnly && !shown.length && !groupFallback.length) return "";
      const visibleTreeIdentities = ["collections", "contracts"].includes(group.id) ? shown.flatMap(artifact => [
        artifact.identity,
        ...(group.id === "contracts" || artifact.expanded ? artifact.children.map(child => child.identity) : [])
      ]) : [];
      const treeTabStop = visibleTreeIdentities.includes(state.outlineSelection)
        ? state.outlineSelection
        : visibleTreeIdentities[0];
      const renderArtifact = (artifact, level = 1) => {
        const kind = artifact.kind;
        const display = artifact.display || artifact.name;
        const entryKey = outlineData(artifact.identity);
        const citations = artifact.citations.length ? `<details class="opengdd-author-outline-citations"><summary>${WIDGET_COPY.citations(artifact.citations.length)}</summary><ul role="list">${artifact.citations.map(citation => `<li><button type="button" data-outline-entry="${entryKey}" data-outline-citation="${outlineData(citation.identity)}" data-outline-focus="citation-${outlineData(citation.identity)}">${escapeHtml(citation.file)} · ${WIDGET_COPY.line(citation.range.start.line + 1)}</button></li>`).join("")}</ul></details>` : "";
        const kindTagValue = artifact.kind === "collection" ? WIDGET_COPY.collectionKind : artifact.kindTag;
        const kindTag = kindTagValue ? `<span class="opengdd-author-outline-kind-tag">${kindTagValue}</span>` : "";
        const rangeTag = artifact.rangeTag ? `<span class="opengdd-author-outline-range-tag">${escapeHtml(artifact.rangeTag)}</span>` : "";
        const rangeAction = artifact.kind === "value"
          ? `<button type="button" class="opengdd-author-outline-range-action" data-outline-range="${entryKey}" data-outline-focus="range-${entryKey}"${artifact.rangeRefusal ? ` disabled title="${escapeHtml(artifact.rangeRefusal)}"` : ""}>${artifact.rangeTag ? WIDGET_COPY.removeRange : WIDGET_COPY.addRange}</button>`
          : "";
        const accessibleKind = kindTagValue ? `, ${kindTagValue}` : "";
        if (kind === "collection") {
          const count = artifact.count ? WIDGET_COPY.collectionCount(artifact.count) : WIDGET_COPY.collectionEmptyCount;
          const location = WIDGET_COPY.collectionLocation(artifact.name);
          const children = artifact.expanded && artifact.children.length
            ? `<ul class="opengdd-author-outline-children" role="group">${artifact.children.map(child => renderArtifact(child, 2)).join("")}</ul>`
            : "";
          const linkOfferMarkup = (artifact.linkOffers ?? []).map(offer => offer.refused
            ? `<span class="opengdd-author-outline-badge opengdd-author-outline-badge--sentence">${inlineCodeHtml(WIDGET_COPY.noFieldForm(offer.refusalField))}</span>`
            : `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--sentence" data-outline-link-offer="${outlineData(`${offer.drawer}\0${offer.field}`)}" data-outline-focus="link-${outlineData(`${offer.drawer}\0${offer.field}`)}">${inlineCodeHtml(WIDGET_COPY.linkOffer(offer.field, offer.to))}</button>`).join("");
          return `<li role="treeitem" aria-level="1" aria-expanded="${artifact.expanded}" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--collection${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" class="opengdd-author-outline-toggle" data-outline-toggle="${entryKey}" data-outline-focus="toggle-${entryKey}" aria-label="${escapeHtml(artifact.expanded ? WIDGET_COPY.collapseCollection(artifact.name) : WIDGET_COPY.expandCollection(artifact.name))}" aria-expanded="${artifact.expanded}">${artifact.expanded ? "▾" : "▸"}</button><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--collection" aria-label="${escapeHtml(`${artifact.name}${accessibleKind}, ${count}, ${location}`)}"><span class="opengdd-author-outline-name">${escapeHtml(artifact.name)}</span>${kindTag}<span class="opengdd-author-outline-count">${escapeHtml(count)}</span><span class="opengdd-author-outline-location">${escapeHtml(location)}</span></button>${findingBadge(artifact.findings, validationFindings, "finding")}<button type="button" class="opengdd-author-outline-add-record" data-outline-add-record="${escapeHtml(artifact.name)}" data-outline-focus="add-${entryKey}">${WIDGET_COPY.addRecord}</button>${linkOfferMarkup}</div>${citations}${children}</li>`;
        }
        if (kind === "contract") {
          const children = artifact.children.length
            ? `<ul class="opengdd-author-outline-children" role="group">${artifact.children.map(child => renderArtifact(child, 2)).join("")}</ul>`
            : "";
          return `<li role="treeitem" aria-level="1" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--contract${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--contract" aria-label="${escapeHtml(`${display}${accessibleKind}, ${artifact.mode}, ${artifact.location}`)}"><span class="opengdd-author-outline-name">${escapeHtml(display)}</span>${kindTag}<span class="opengdd-author-outline-mode">${escapeHtml(artifact.mode)}</span><span class="opengdd-author-outline-location">${escapeHtml(artifact.location)}</span></button><div class="opengdd-author-outline-contract-actions">${contractFindingBadge(artifact.findings, validationFindings)}<button type="button" class="opengdd-author-outline-contract-rename" data-outline-contract-rename="${entryKey}">${CONTRACT_COPY.renameButton}</button></div></div>${citations}${children}</li>`;
        }
        if (level === 2 && group.id === "contracts") return `<li role="treeitem" aria-level="2" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-parent="${outlineData(artifact.parentIdentity)}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--child${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--contract" aria-label="${escapeHtml(`${display}, ${artifact.file}, ${WIDGET_COPY.line(artifact.range.start.line + 1)}`)}"><span class="opengdd-author-outline-name">${escapeHtml(display)}</span><span class="opengdd-author-outline-location">${escapeHtml(artifact.file)} · ${WIDGET_COPY.line(artifact.range.start.line + 1)}</span></button>${findingBadge(artifact.findings, validationFindings, "finding")}</div>${citations}</li>`;
        if (level === 2 && group.id === "collections") return `<li role="treeitem" aria-level="2" tabindex="${treeTabStop === artifact.identity ? 0 : -1}" data-outline-treeitem="${entryKey}" data-outline-parent="${outlineData(artifact.parentIdentity)}" data-outline-focus="entry-${entryKey}" class="opengdd-author-outline-entry opengdd-author-outline-entry--child${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div data-outline-entry="${entryKey}"><button type="button" tabindex="-1" class="opengdd-author-outline-jump opengdd-author-kind--${kindClass(kind)}" aria-label="${escapeHtml(`${display}${accessibleKind}, ${artifact.file}, ${WIDGET_COPY.line(artifact.range.start.line + 1)}`)}"><span class="opengdd-author-outline-name">${escapeHtml(display)}</span>${kindTag}${rangeTag}<span class="opengdd-author-outline-location">${escapeHtml(artifact.file)} · ${WIDGET_COPY.line(artifact.range.start.line + 1)}</span></button>${findingBadge(artifact.findings, validationFindings, "finding")}</div>${citations}</li>`;
        const children = artifact.children.length
          ? `<ul class="opengdd-author-outline-children" role="list">${artifact.children.map(child => renderArtifact(child, 2)).join("")}</ul>`
          : "";
        const childClass = level === 2 ? " opengdd-author-outline-entry--child" : "";
        const location = `${escapeHtml(artifact.file)} · ${WIDGET_COPY.line(artifact.range.start.line + 1)}`;
        const locationInJump = artifact.kind === "value" ? "" : `<span class="opengdd-author-outline-location">${location}</span>`;
        const valueMeta = artifact.kind === "value"
          ? `<div class="opengdd-author-outline-value-meta"><span class="opengdd-author-outline-location">${location}</span>${rangeAction}</div>`
          : "";
        const sameNumber = (artifact.sameNumberWarnings ?? []).map(warning => `<span class="opengdd-author-outline-badge opengdd-author-outline-badge--warning opengdd-author-outline-badge--sentence" role="img" aria-label="${escapeHtml(warning.sentence)}" title="${escapeHtml(warning.help)}">${severityIcon("warning")}<span>${inlineCodeHtml(warning.sentence)}</span></span>`).join("");
        return `<li class="opengdd-author-outline-entry${artifact.kind === "value" ? " opengdd-author-outline-entry--value" : ""}${childClass}${state.outlineSelection === artifact.identity ? " opengdd-author-is-selected" : ""}"><div><button type="button" class="opengdd-author-outline-jump opengdd-author-kind--${kindClass(kind)}" data-outline-entry="${entryKey}" data-outline-focus="entry-${entryKey}" aria-label="${escapeHtml(`${display}${accessibleKind}, ${artifact.file}, ${WIDGET_COPY.line(artifact.range.start.line + 1)}`)}"><span class="opengdd-author-outline-name">${escapeHtml(display)}</span>${kindTag}${rangeTag}${locationInJump}</button>${findingBadge(artifact.findings, validationFindings, "finding")}${sameNumber}${valueMeta}</div>${citations}${children}</li>`;
      };
      const entryMarkup = shown.map(artifact => renderArtifact(artifact)).join("");
      const action = group.action && group.create
        ? `<button type="button" data-outline-create="${group.create}" data-outline-focus="create-${outlineData(group.create)}">${group.action}</button>`
        : "";
      const empty = shown.length || state.outlineProblemsOnly ? "" : `<div class="opengdd-author-outline-empty"><p>${inlineCodeHtml(group.empty)}</p>${action}</div>`;
      const severity = groupFallback.some(index => validationFindings[index].severity === "error") ? "error" : "warning";
      const fallbackId = `opengdd-outline-${group.id}-fallback`;
      const disclosure = groupFallback.length ? `<button type="button" class="opengdd-author-outline-badge opengdd-author-outline-badge--${severity}" data-outline-disclosure="${group.id}" data-outline-focus="fallback-${group.id}" aria-expanded="${group.fallbackOpen}" aria-controls="${fallbackId}" aria-label="${findingBadgeLabel(groupFallback)}">${severityIcon(severity)}<span>${groupFallback.length}</span></button>` : "";
      const fallbackList = group.fallbackOpen && groupFallback.length ? `<ul class="opengdd-author-outline-fallback" id="${fallbackId}" role="list">${groupFallback.map(index => {
        const finding = validationFindings[index];
        const message = finding.code === "CONTRACT_PACK_ORPHAN" ? CONTRACT_COPY.orphan : finding.message;
        return `<li><button type="button" data-outline-finding="${index}" data-outline-focus="fallback-${group.id}-${index}"><span>${escapeHtml(message)}</span><span>${escapeHtml(finding.file)}${finding.line ? ` · ${WIDGET_COPY.line(finding.line)}` : ""}</span></button></li>`;
      }).join("")}</ul>` : "";
      const headerCreate = group.action && group.create && (shown.length || ["collections", "contracts"].includes(group.id))
        ? `<button type="button" class="opengdd-author-outline-group-create" data-outline-create="${group.create}" data-outline-focus="group-create-${group.id}">${group.action}</button>`
        : "";
      const entryList = ["collections", "contracts"].includes(group.id) ? `<ul class="opengdd-author-outline-entries" role="tree">${entryMarkup}</ul>` : `<ul class="opengdd-author-outline-entries" role="list">${entryMarkup}</ul>`;
      const label = group.address ? `<code>${group.label}</code>` : `<span>${group.label}</span>`;
      return `<section class="opengdd-author-outline-group opengdd-author-kind--${kindClass(group.kinds[0])}" role="group" aria-labelledby="opengdd-outline-${group.id}"><h3 id="opengdd-outline-${group.id}">${outlineIcon(group)}${label}${headerCreate}${disclosure}</h3>${fallbackList}${entryMarkup ? entryList : empty}</section>`;
    }).join("");
    const artifacts = model.groups.flatMap(group => group.artifacts);
    const nothing = artifacts.length || state.outlineProblemsOnly ? "" : `<p class="opengdd-author-outline-nothing"><strong>${WIDGET_COPY.outlineNothing}</strong><span>${WIDGET_COPY.outlineNothingAction}</span></p>`;
    const noProblems = model.noProblems ? `<p class="opengdd-author-outline-nothing" role="status">${WIDGET_COPY.noValidationProblems}</p>` : "";
    const selectedFile = state.selected?.type === "file" ? state.selected.path : "";
    const panelCreators = panelHost?.creators({ file: selectedFile }, { menu: true }) ?? [];
    const promptedCreator = panelCreators.find(creator => creator.id === state.panelCreatorPrompt);
    const panelCreatorMarkup = panelCreators.map(creator => `<button type="button" role="menuitem" tabindex="-1" data-panel-creator="${escapeHtml(creator.id)}" data-outline-focus="panel-creator-${outlineData(creator.id)}">${escapeHtml(creator.label)}</button>`).join("");
    const creatorError = state.panelCreatorError ? `<p class="opengdd-author-quickfix-error" aria-live="polite">${escapeHtml(state.panelCreatorError)}</p>` : "";
    const promptMarkup = promptedCreator ? `<div class="opengdd-author-panel-creator-prompt"><strong>${escapeHtml(promptedCreator.label)}</strong><p>${escapeHtml(promptedCreator.help)}</p><input data-panel-creator-name autocomplete="off"><button type="button" data-panel-creator-confirm="${escapeHtml(promptedCreator.id)}">${WIDGET_COPY.create}</button>${creatorError}</div>` : creatorError;
    element.innerHTML = `<div class="opengdd-author-outline-controls"><div class="opengdd-author-outline-create"><button type="button" data-action="outline-menu" data-outline-focus="menu" aria-label="${WIDGET_COPY.create}" aria-haspopup="menu" aria-expanded="${state.outlineMenuOpen}">+</button>${state.outlineMenuOpen ? `<div role="menu" aria-label="${WIDGET_COPY.create}"><span>${WIDGET_COPY.create}</span>${OUTLINE_CREATE_ITEMS.map((item, index) => `<button type="button" role="menuitem" tabindex="${index ? -1 : 0}" data-outline-create="${item}" data-outline-focus="menuitem-${outlineData(item)}">${item}</button>`).join("")}${panelCreatorMarkup}${promptMarkup}</div>` : ""}</div><label><input type="checkbox" data-outline-filter data-outline-focus="filter"${state.outlineProblemsOnly ? " checked" : ""}> ${WIDGET_COPY.problemsOnly}</label></div>${noProblems}${nothing}${groups}<div data-panel-sidebar></div>`;
    panelHost?.refreshSidebar();
    if (active) [...element.querySelectorAll("[data-outline-focus]")].find(candidate => candidate.dataset.outlineFocus === active)?.focus({ preventScroll: true });
  }

  function schedule() {
    if (!element || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  async function handleClick(event) {
    if (!element?.contains(event.target)) return false;
    const outlineFinding = event.target.closest("[data-outline-finding]");
    if (outlineFinding) {
      openFinding(Number(outlineFinding.dataset.outlineFinding));
      return true;
    }
    const outlineToggle = event.target.closest("[data-outline-toggle]");
    if (outlineToggle) {
      const identity = decodeURIComponent(outlineToggle.dataset.outlineToggle);
      const collection = entries().find(entry => entry.identity === identity && entry.kind === "collection");
      if (!collection) return true;
      if (state.outlineCollectionCollapsed.has(collection.name)) state.outlineCollectionCollapsed.delete(collection.name);
      else state.outlineCollectionCollapsed.add(collection.name);
      syncCollectionCollapsed();
      render();
      return true;
    }
    const addRecord = event.target.closest("[data-outline-add-record]");
    if (addRecord) {
      openCollectionDialog(addRecord, "record", addRecord.dataset.outlineAddRecord);
      return true;
    }
    const contractRename = event.target.closest("[data-outline-contract-rename]");
    if (contractRename) {
      const identity = decodeURIComponent(contractRename.dataset.outlineContractRename);
      const artifact = entries().find(entry => entry.identity === identity && entry.kind === "contract");
      if (artifact) openContractRename(contractRename, artifact);
      return true;
    }
    const range = event.target.closest("[data-outline-range]");
    if (range) {
      const identity = decodeURIComponent(range.dataset.outlineRange);
      const artifact = entries().find(entry => entry.identity === identity && entry.kind === "value");
      if (artifact) await toggleRange(artifact);
      render();
      return true;
    }
    const linkOffer = event.target.closest("[data-outline-link-offer]");
    if (linkOffer) {
      const [drawer, field] = decodeURIComponent(linkOffer.dataset.outlineLinkOffer).split("\0");
      const artifact = entries().find(entry => entry.kind === "collection" && entry.name === drawer);
      const offer = artifact?.linkOffers?.find(candidate => candidate.field === field);
      if (artifact && offer) await acceptLinkOffer(artifact, offer);
      render();
      return true;
    }
    const outlineEntry = event.target.closest("[data-outline-entry]");
    if (outlineEntry) {
      await beforeOpen();
      const identity = decodeURIComponent(outlineEntry.dataset.outlineEntry);
      const artifact = entries().find(entry => entry.identity === identity);
      const citationIdentity = outlineEntry.dataset.outlineCitation === undefined ? "" : decodeURIComponent(outlineEntry.dataset.outlineCitation);
      const location = citationIdentity ? artifact?.citations.find(citation => citation.identity === citationIdentity) : artifact;
      if (!artifact || !location || !openLocation(location)) {
        const name = artifact?.name ?? identity.split("\0")[1] ?? WIDGET_COPY.thisDeclaration;
        report(WIDGET_COPY.declarationGone(name), true);
        renderedModel = "";
        render();
        return true;
      }
      state.outlineSelection = artifact.identity;
      select({
        kind: artifact.kind === "name" ? "identifier" : artifact.kind,
        name: artifact.name,
        file: artifact.kind === "collection" && !citationIdentity ? artifact.location.replace(/\/$/, "") : location.file,
        range: location.range
      });
      render();
      return true;
    }
    const outlineDisclosure = event.target.closest("[data-outline-disclosure]");
    if (outlineDisclosure) {
      const group = outlineDisclosure.dataset.outlineDisclosure;
      if (state.outlineFallbackOpen.has(group)) state.outlineFallbackOpen.delete(group);
      else state.outlineFallbackOpen.add(group);
      render();
      return true;
    }
    const outlineCreate = event.target.closest("[data-outline-create]");
    if (outlineCreate) {
      await createFromOutline(outlineCreate.dataset.outlineCreate, outlineCreate);
      render();
      return true;
    }
    const panelCreator = event.target.closest("[data-panel-creator]");
    if (panelCreator) {
      const creator = panelHost.creators({ file: state.selected?.type === "file" ? state.selected.path : "" }, { menu: true })
        .find(candidate => candidate.id === panelCreator.dataset.panelCreator);
      if (!creator) return true;
      if (creator.requires.includes("name")) {
        state.panelCreatorPrompt = creator.id;
        state.panelCreatorError = "";
        renderedModel = "";
        render();
        element.querySelector("[data-panel-creator-name]")?.focus();
      } else {
        try {
          await panelHost.runCreator(creator.id, { file: state.selected?.type === "file" ? state.selected.path : undefined }, "sidebar");
          state.outlineMenuOpen = false;
          state.panelCreatorError = "";
        } catch (error) { state.panelCreatorError = error.message; }
        renderedModel = "";
        render();
        element.querySelector('[data-action="outline-menu"]')?.focus({ preventScroll: true });
      }
      return true;
    }
    const panelCreatorConfirm = event.target.closest("[data-panel-creator-confirm]");
    if (panelCreatorConfirm) {
      const name = element.querySelector("[data-panel-creator-name]")?.value ?? "";
      try {
        await panelHost.runCreator(panelCreatorConfirm.dataset.panelCreatorConfirm, {
          name,
          file: state.selected?.type === "file" ? state.selected.path : undefined
        }, "sidebar");
        state.panelCreatorPrompt = "";
        state.outlineMenuOpen = false;
        state.panelCreatorError = "";
      } catch (error) { state.panelCreatorError = error.message; }
      renderedModel = "";
      render();
      (state.panelCreatorPrompt ? element.querySelector("[data-panel-creator-name]") : element.querySelector('[data-action="outline-menu"]'))?.focus({ preventScroll: true });
      return true;
    }
    if (event.target.closest('[data-action="outline-menu"]')) {
      state.outlineMenuOpen = !state.outlineMenuOpen;
      if (!state.outlineMenuOpen) {
        state.panelCreatorPrompt = "";
        state.panelCreatorError = "";
      }
      render();
      if (state.outlineMenuOpen) element.querySelector('[role="menu"] [role="menuitem"]')?.focus();
      return true;
    }
    return false;
  }

  function handleChange(event) {
    if (!event.target.matches("[data-outline-filter]")) return false;
    state.outlineProblemsOnly = event.target.checked;
    render();
    return true;
  }

  function handleKeydown(event) {
    const menuItem = event.target.closest('[role="menuitem"]');
    if (menuItem && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...element.querySelectorAll('[role="menuitem"]')];
      const current = items.indexOf(menuItem);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((item, index) => { item.tabIndex = index === next ? 0 : -1; });
      items[next].focus();
      return true;
    }
    if (event.key === "Escape" && state.outlineMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      state.outlineMenuOpen = false;
      render();
      element.querySelector('[data-action="outline-menu"]')?.focus();
      return true;
    }
    const tree = event.target.closest('[role="tree"]');
    const treeItem = event.target.closest("[data-outline-treeitem]");
    if (!tree || !treeItem || !tree.contains(treeItem)) return false;
    const focusTreeItem = identity => {
      const liveTree = element.querySelector('[role="tree"]');
      const item = liveTree?.querySelector(`[data-outline-treeitem="${outlineData(identity)}"]`);
      for (const candidate of liveTree?.querySelectorAll("[data-outline-treeitem]") ?? []) candidate.tabIndex = candidate === item ? 0 : -1;
      item?.focus({ preventScroll: true });
    };
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...tree.querySelectorAll("[data-outline-treeitem]")];
      const current = items.indexOf(treeItem);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
      focusTreeItem(decodeURIComponent(items[next].dataset.outlineTreeitem));
    } else if (event.key === "ArrowLeft") {
      const identity = decodeURIComponent(treeItem.dataset.outlineTreeitem);
      const collection = entries().find(entry => entry.identity === identity && entry.kind === "collection");
      if (collection && !state.outlineCollectionCollapsed.has(collection.name)) {
        event.preventDefault();
        state.outlineCollectionCollapsed.add(collection.name);
        syncCollectionCollapsed();
        render();
        focusTreeItem(identity);
      } else if (treeItem.dataset.outlineParent) {
        event.preventDefault();
        focusTreeItem(decodeURIComponent(treeItem.dataset.outlineParent));
      }
    } else if (event.key === "ArrowRight") {
      const identity = decodeURIComponent(treeItem.dataset.outlineTreeitem);
      const collection = entries().find(entry => entry.identity === identity && entry.kind === "collection");
      if (!collection) return true;
      if (state.outlineCollectionCollapsed.has(collection.name)) {
        event.preventDefault();
        state.outlineCollectionCollapsed.delete(collection.name);
        syncCollectionCollapsed();
        render();
        focusTreeItem(identity);
      } else {
        const child = element.querySelector(`[data-outline-treeitem][data-outline-parent="${outlineData(identity)}"]`);
        if (child) {
          event.preventDefault();
          focusTreeItem(decodeURIComponent(child.dataset.outlineTreeitem));
        }
      }
    }
    return true;
  }

  return Object.freeze({
    render,
    schedule,
    invalidate() { renderedModel = ""; },
    handleClick,
    owns: target => Boolean(element?.contains(target)),
    handleChange,
    handleKeydown,
    destroy() { if (frame) view.cancelAnimationFrame(frame); frame = 0; }
  });
}
