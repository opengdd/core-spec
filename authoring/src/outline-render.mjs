import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { CONTRACT_COPY } from "./copy/contract-copy.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { kindClass, kindDefinition } from "./kinds.mjs";
import { buildOutlineModel } from "./outline-view.mjs";
import { isContractDependentFinding, isContractTodoFinding } from "./contracts.mjs";
import { findingAccessibleName, findingLocation } from "./findings.mjs";

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

const ICON_PATHS = Object.freeze({
  collections: '<path d="M2 4h5l1 2h6v7H2zM4 2h5l1 2"/>',
  contracts: '<path d="M2 4h4l2 2 2-2h4v8h-4l-2-2-2 2H2z"/>',
  tuning: '<path d="M2 4h5m3 0h4M2 8h1m3 0h8M2 12h7m3 0h2M7 2v4M3 6v4m6 0v4"/>',
  time: '<path d="M4 2h8M4 14h8M5 2c0 3 1 4 3 6-2 2-3 3-3 6m6-12c0 3-1 4-3 6 2 2 3 3 3 6"/>',
  sections: '<path d="M2 3c3 0 5 1 6 3v8c-1-2-3-3-6-3zM14 3c-3 0-5 1-6 3v8c1-2 3-3 6-3z"/>',
  direction: '<path d="M2 7.5h12V14H2zM2.3 7.3l1.3-3.9 10.2 2.4-.6 1.7M6.2 4l-.9 2.5M8.9 4.6l-.9 2.5M11.6 5.3l-.9 2.5M4.5 11.2h7"/>',
  "acceptance-tests": '<path d="M3 2h10v12H3zM5 5l1 1 2-2m1 2h2M5 10l1 1 2-2m1 2h2"/>',
  personalization: '<circle cx="8" cy="5" r="3"/><path d="M2 14c1-3 3-4 6-4s5 1 6 4"/>',
  collection: '<path d="M2 3h12v10H2zM2 7h12M6 3v10m4-10v10"/>',
  contract: '<path d="M3 2h8l2 2v10H3zM6 6h4M6 9h4M6 12h2"/>',
  value: '<path d="M2 8h12M5 4v8M11 4v8"/>',
  rule: '<path d="M2 5h5m2 0h5M2 11h5m2 0h5M7 3v4m2 2v4"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
  section: '<path d="M3 3h10M3 7h7M3 11h10M3 14h6"/>',
  mood: '<path d="M8 2l6 6-6 6-6-6z"/>',
  palette: '<path d="M2 3h8v8H2zM6 7h8v6H6z"/>',
  colors: '<circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/>',
  contrast: '<path d="M8 2a6 6 0 100 12zM8 2v12"/>',
  timing: '<path d="M3 4h10M3 8h7M3 12h4M12 7v6m-2-2l2 2 2-2"/>',
  "acceptance-test": '<path d="M2 8l3 3 8-8M8 13h6"/>',
  question: '<path d="M5 5a3 3 0 116 0c0 2-3 2-3 5M8 13v.2"/>'
});

export function outlineIcon(id, colorClass = "") {
  const semanticColor = colorClass ? ` opengdd-author-kind--${colorClass}` : "";
  const common = `class="opengdd-author-outline-icon${semanticColor}" data-outline-icon="${escapeHtml(id)}" aria-hidden="true" focusable="false" viewBox="0 0 16 16"`;
  return `<svg ${common}>${ICON_PATHS[id] ?? '<circle cx="8" cy="8" r="5"/>'}</svg>`;
}

const selectedFindings = (references, findings) => references
  .map(reference => Number.isInteger(reference) ? findings[reference] : reference)
  .filter(Boolean);

function problemTail(references, findings) {
  if (!references.length) return "";
  const selected = selectedFindings(references, findings);
  const errors = selected.filter(finding => finding.severity === "error").length;
  const warnings = selected.filter(finding => finding.severity === "warning").length;
  return `, ${WIDGET_COPY.problemCounts(selected.length, errors, warnings)}`;
}

// A warning triangle with an exclamation mark: the one problem symbol, on the
// Problems-only control, on every count badge and on every problem row.
export const PROBLEM_ICON = '<svg class="opengdd-author-problem-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16"><path d="M8 2.2 14.6 13.5H1.4z"/><path d="M8 6.2v3.6M8 11.4v.9"/></svg>';

const SEVERITY_CLASSES = Object.freeze({
  error: Object.freeze({
    badge: "opengdd-author-outline-badge--error",
    problem: "opengdd-author-outline-problem--error"
  }),
  warning: Object.freeze({
    badge: "opengdd-author-outline-badge--warning",
    problem: "opengdd-author-outline-problem--warning"
  })
});

function countBadge(severity, count, title = "") {
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
  return `<span class="opengdd-author-outline-badge ${SEVERITY_CLASSES[severity].badge}" aria-hidden="true"${titleAttribute}>${PROBLEM_ICON}<span>${count}</span></span>`;
}

export function findingBadge(references, findings) {
  if (!references.length) return "";
  const selected = selectedFindings(references, findings);
  const severity = selected.some(finding => finding.severity === "error") ? "error" : "warning";
  return countBadge(severity, selected.length);
}

export function contractFindingBadge(indexes, findings) {
  const questionIndexes = indexes.filter(index => findings[index]?.code === "CONTRACT_ANSWER_MISSING");
  const valueIndexes = indexes.filter(index => findings[index]?.code === "CONTRACT_VALUE_MISSING");
  const todoIndexes = indexes.filter(index => isContractTodoFinding(findings[index]));
  const consequenceIndexes = todoIndexes.length
    ? indexes.filter(index => isContractDependentFinding(findings[index]) && !todoIndexes.includes(index))
    : [];
  const inputIndexes = todoIndexes.filter(index => !questionIndexes.includes(index) && !valueIndexes.includes(index));
  const summarized = new Set([...todoIndexes, ...consequenceIndexes]);
  const ordinaryIndexes = indexes.filter(index => !summarized.has(index));
  const sentence = CONTRACT_COPY.badge(questionIndexes.length, valueIndexes.length, inputIndexes.length);
  const consequence = consequenceIndexes.length ? CONTRACT_COPY.consequenceTail(consequenceIndexes.length) : "";
  const accessible = todoIndexes.length ? [sentence, consequence].filter(Boolean).join(" ") : CONTRACT_COPY.complete;
  const markup = todoIndexes.length
    ? countBadge("error", todoIndexes.length, accessible)
    : `<span class="opengdd-author-outline-badge" aria-hidden="true">✓</span>`;
  return Object.freeze({ accessible, markup, ordinaryIndexes });
}

export function createOutlineRenderer({
  element,
  controlsElement,
  document,
  view,
  state,
  hidden = () => false,
  panelHost,
  entries,
  beforeOpen,
  openLocation,
  report,
  select,
  syncFolds,
  createFromOutline,
  enterInspector,
  announceSelection,
  openFinding
}) {
  let renderedModel = "";
  let frame = 0;
  const owns = target => Boolean(element?.contains(target) || controlsElement?.contains(target));
  const query = selector => controlsElement?.querySelector(selector) ?? element?.querySelector(selector);
  const queryAll = selector => [
    ...(controlsElement?.querySelectorAll(selector) ?? []),
    ...(element?.querySelectorAll(selector) ?? [])
  ];

  const renderKey = model => JSON.stringify(model, (key, value) => {
    if (key === "revision") return undefined;
    if (key === "range" && value?.start && value?.end) return { start: { line: value.start.line } };
    return value;
  });

  const focusKeyForEntity = entity => `entry-${outlineData(entity.identity)}`;
  const artifactForKey = key => entries().find(entry => focusKeyForEntity(entry) === key);
  const itemForKey = key => element.querySelector(`[data-outline-focus="${key}"]`);

  function setTabStop(item) {
    const treeItems = [...element.querySelectorAll('[role="treeitem"]')];
    for (const candidate of treeItems) candidate.tabIndex = candidate === item ? 0 : -1;
  }

  function recomputeTabStop() {
    const treeItems = [...element.querySelectorAll('[role="treeitem"]')];
    if (!treeItems.length) return;
    const selected = treeItems.find(item => item.getAttribute("aria-selected") === "true");
    setTabStop(selected ?? treeItems[0]);
  }

  function render() {
    if (!element || hidden()) return;
    const model = buildOutlineModel({
      authoringView: state.authoringView,
      validation: state.validation,
      problemsOnly: state.outlineProblemsOnly,
      menuOpen: state.outlineMenuOpen,
      selection: state.outlineSelection,
      folds: state.outlineFolds
    });
    const serialized = renderKey(model);
    if (serialized === renderedModel) return;
    renderedModel = serialized;
    const active = owns(document.activeElement) ? document.activeElement.dataset.outlineFocus : "";
    const scroll = { top: element.scrollTop, left: element.scrollLeft };
    const validationFindings = state.validation.run?.findings ?? [];

    const renderProblem = (finding, parentKey) => {
      const index = finding.index;
      const severity = finding.severity === "error" ? "error" : "warning";
      const message = String(finding.message);
      const location = findingLocation(finding);
      const focusKey = `finding-${index}`;
      const accessible = findingAccessibleName(finding);
      return `<li role="treeitem" aria-level="2" aria-selected="false" aria-label="${escapeHtml(accessible)}" tabindex="-1" data-outline-finding="${index}" data-outline-parent="${escapeHtml(parentKey)}" data-outline-focus="${focusKey}" data-outline-name="${escapeHtml(message.toLocaleLowerCase())}" class="opengdd-author-outline-entry opengdd-author-outline-problem ${SEVERITY_CLASSES[severity].problem}" title="${escapeHtml(message)}"><div class="opengdd-author-outline-row"><span class="opengdd-author-outline-chevron" aria-hidden="true"></span>${PROBLEM_ICON}<span class="opengdd-author-outline-name">${escapeHtml(message)}</span>${location ? `<span class="opengdd-author-outline-range-tag">${escapeHtml(location)}</span>` : ""}</div></li>`;
    };

    const renderEntity = (entity, level, parentKey) => {
      const focusKey = focusKeyForEntity(entity);
      const display = entity.display || entity.name;
      const typeLabel = kindDefinition(entity.kind).labels.singular;
      const selected = model.selection === entity.identity;
      const contractBadge = entity.kind === "contract" ? contractFindingBadge(entity.findings, validationFindings) : undefined;
      const accessible = contractBadge
        ? `${display}, ${typeLabel}, ${contractBadge.accessible}${problemTail(contractBadge.ordinaryIndexes, validationFindings)}`
        : `${display}, ${typeLabel}${problemTail(entity.findings, validationFindings)}`;
      const rangeTag = entity.rangeTag ? `<span class="opengdd-author-outline-range-tag">${escapeHtml(entity.rangeTag)}</span>` : "";
      const badges = contractBadge
        ? `${contractBadge.markup}${findingBadge(contractBadge.ordinaryIndexes, validationFindings)}`
        : findingBadge(entity.findings, validationFindings);
      return `<li role="treeitem" aria-level="${level}" aria-selected="${selected}" aria-label="${escapeHtml(accessible)}" tabindex="-1" data-outline-entry="${outlineData(entity.identity)}" data-outline-parent="${escapeHtml(parentKey)}" data-outline-focus="${focusKey}" data-outline-name="${escapeHtml(display.toLocaleLowerCase())}" class="opengdd-author-outline-entry opengdd-author-outline-entry--${escapeHtml(entity.kind)} opengdd-author-kind--${kindClass(entity.kind)}${selected ? " opengdd-author-is-selected" : ""}"><div class="opengdd-author-outline-row"><span class="opengdd-author-outline-chevron" aria-hidden="true"></span>${outlineIcon(entity.kind, kindClass(entity.kind))}<span class="opengdd-author-outline-name">${escapeHtml(display)}</span><span class="opengdd-author-outline-kind-tag">${escapeHtml(typeLabel)}</span>${rangeTag}${badges}</div></li>`;
    };

    const renderBranch = (branch, mechanismKey) => {
      const focusKey = `branch-${branch.id}`;
      const shownEntities = state.outlineProblemsOnly ? branch.entities.filter(entity => entity.findings.length) : branch.entities;
      if (state.outlineProblemsOnly && !shownEntities.length) return "";
      const children = branch.expanded ? shownEntities.map(entity => renderEntity(entity, 3, focusKey)).join("") : "";
      return `<li role="treeitem" aria-level="2" aria-expanded="${branch.expanded}" aria-label="${escapeHtml(branch.label)}" tabindex="-1" data-outline-branch="${escapeHtml(branch.id)}" data-outline-parent="${mechanismKey}" data-outline-focus="${focusKey}" data-outline-name="${escapeHtml(branch.label.toLocaleLowerCase())}" class="opengdd-author-outline-branch"><div class="opengdd-author-outline-row"><span class="opengdd-author-outline-chevron" aria-hidden="true">${branch.expanded ? "▾" : "▸"}</span><span class="opengdd-author-outline-name">${escapeHtml(branch.label)}</span></div>${branch.expanded ? `<ul role="group">${children}</ul>` : ""}</li>`;
    };

    const treeItems = model.mechanisms.map(mechanism => {
      const focusKey = `mechanism-${mechanism.id}`;
      const shownEntities = state.outlineProblemsOnly ? mechanism.entities.filter(entity => entity.findings.length) : mechanism.entities;
      const hasVisibleProblem = mechanism.findings.length || shownEntities.length;
      if (state.outlineProblemsOnly && !hasVisibleProblem) return "";
      const count = mechanism.entities.length;
      const selected = model.selection === mechanism.identity;
      const accessible = `${mechanism.label}, ${count} ${count === 1 ? mechanism.singular : mechanism.plural}${problemTail(mechanism.findings, validationFindings)}`;
      const create = mechanism.action && mechanism.create
        ? `<button type="button" tabindex="-1" class="opengdd-author-outline-mechanism-create" data-outline-create="${escapeHtml(mechanism.create)}" data-outline-focus="mechanism-create-${mechanism.id}" aria-label="${escapeHtml(mechanism.action)}" title="${escapeHtml(mechanism.action)}"><span aria-hidden="true">+</span></button>`
        : "";
      let children = "";
      if (mechanism.expanded) {
        // Findings the model could route to no declaration (a file that does
        // not parse, a package-wide check) are rows of their own under the
        // mechanism, so a counted problem is always a visible, openable row.
        children = mechanism.findings.map(finding => renderProblem(finding, focusKey)).join("")
          + (mechanism.branches
            ? mechanism.branches.map(branch => renderBranch(branch, focusKey)).join("")
            : shownEntities.map(entity => renderEntity(entity, 2, focusKey)).join(""));
      }
      const empty = mechanism.expanded && !mechanism.entities.length && !state.outlineProblemsOnly
        ? `<p class="opengdd-author-outline-empty">${inlineCodeHtml(mechanism.empty)}</p>` : "";
      return `<li role="treeitem" aria-level="1" aria-expanded="${mechanism.expanded}" aria-selected="${selected}" aria-label="${escapeHtml(accessible)}" tabindex="-1" data-outline-mechanism="${mechanism.id}" data-outline-focus="${focusKey}" data-outline-name="${escapeHtml(mechanism.label.toLocaleLowerCase())}" class="opengdd-author-outline-mechanism${selected ? " opengdd-author-is-selected" : ""}"><div class="opengdd-author-outline-row"><span class="opengdd-author-outline-chevron" aria-hidden="true">${mechanism.expanded ? "▾" : "▸"}</span>${outlineIcon(mechanism.id)}<span class="opengdd-author-outline-mechanism-name">${escapeHtml(mechanism.label)}</span><span class="opengdd-author-outline-mechanism-count" aria-hidden="true">${count}</span>${findingBadge(mechanism.findings, validationFindings)}${create}</div>${mechanism.expanded && children ? `<ul role="group">${children}</ul>` : ""}${empty}</li>`;
    }).join("");

    const hasEntities = model.mechanisms.some(mechanism => mechanism.entities.length);
    const nothing = hasEntities || state.outlineProblemsOnly ? "" : `<p class="opengdd-author-outline-nothing"><strong>${WIDGET_COPY.outlineNothing}</strong><span>${WIDGET_COPY.outlineNothingAction}</span></p>`;
    const noProblems = model.noProblems ? `<p class="opengdd-author-outline-nothing" role="status">${WIDGET_COPY.noValidationProblems}</p>` : "";
    const selectedFile = state.selected?.type === "file" ? state.selected.path : "";
    const panelCreators = panelHost?.creators({ file: selectedFile }, { menu: true }) ?? [];
    const promptedCreator = panelCreators.find(creator => creator.id === state.panelCreatorPrompt);
    const panelCreatorMarkup = panelCreators.map(creator => `<button type="button" role="menuitem" tabindex="-1" data-panel-creator="${escapeHtml(creator.id)}" data-outline-focus="panel-creator-${outlineData(creator.id)}">${escapeHtml(creator.label)}</button>`).join("");
    const creatorError = state.panelCreatorError ? `<p class="opengdd-author-quickfix-error" aria-live="polite">${escapeHtml(state.panelCreatorError)}</p>` : "";
    const promptMarkup = promptedCreator ? `<div class="opengdd-author-panel-creator-prompt"><strong>${escapeHtml(promptedCreator.label)}</strong><p>${escapeHtml(promptedCreator.help)}</p><input data-panel-creator-name autocomplete="off"><button type="button" data-panel-creator-confirm="${escapeHtml(promptedCreator.id)}">${WIDGET_COPY.create}</button>${creatorError}</div>` : creatorError;
    const controlsMarkup = `<div class="opengdd-author-outline-create"><button type="button" data-action="outline-menu" data-outline-focus="menu" aria-label="${WIDGET_COPY.create}" aria-haspopup="menu" aria-expanded="${state.outlineMenuOpen}">+</button>${state.outlineMenuOpen ? `<div role="menu" aria-label="${WIDGET_COPY.create}"><span>${WIDGET_COPY.create}</span>${OUTLINE_CREATE_ITEMS.map((item, index) => `<button type="button" role="menuitem" tabindex="${index ? -1 : 0}" data-outline-create="${item}" data-outline-focus="menuitem-${outlineData(item)}">${item}</button>`).join("")}${panelCreatorMarkup}${promptMarkup}</div>` : ""}</div><button type="button" class="opengdd-author-outline-filter${state.outlineProblemsOnly ? " opengdd-author-outline-filter--active" : ""}" data-outline-filter data-outline-focus="filter" aria-label="${WIDGET_COPY.problemsOnly}" title="${WIDGET_COPY.problemsOnly}" aria-pressed="${state.outlineProblemsOnly}">${PROBLEM_ICON}</button>`;
    if (controlsElement) controlsElement.innerHTML = controlsMarkup;
    element.innerHTML = `${controlsElement ? "" : `<div class="opengdd-author-outline-controls">${controlsMarkup}</div>`}${noProblems}${nothing}<ul class="opengdd-author-outline-tree" role="tree" aria-label="${WIDGET_COPY.outlineLabel}">${treeItems}</ul><div data-panel-sidebar></div>`;
    panelHost?.refreshSidebar();
    recomputeTabStop();
    element.scrollTop = scroll.top;
    element.scrollLeft = scroll.left;
    if (active) {
      const restored = queryAll("[data-outline-focus]").find(candidate => candidate.dataset.outlineFocus === active);
      restored?.focus({ preventScroll: true });
      if (restored?.matches('[role="treeitem"]')) setTabStop(restored);
    }
  }

  function schedule() {
    if (!element || frame) return;
    frame = view.requestAnimationFrame(() => { frame = 0; render(); });
  }

  function toggleFold(key) {
    if (state.outlineFolds.has(key)) state.outlineFolds.delete(key);
    else state.outlineFolds.add(key);
    syncFolds();
    renderedModel = "";
    render();
  }

  async function activate(item) {
    const key = item.dataset.outlineFocus;
    const mechanismId = item.dataset.outlineMechanism;
    if (item.dataset.outlineBranch) {
      toggleFold(`branch-${item.dataset.outlineBranch}`);
      itemForKey(key)?.focus({ preventScroll: true });
      return;
    }
    if (item.dataset.outlineFinding !== undefined) {
      await beforeOpen();
      const finding = openFinding(Number(item.dataset.outlineFinding), { source: true });
      if (finding) announceSelection(findingAccessibleName(finding), { kind: "file", name: finding.file, file: finding.file });
      return;
    }
    if (state.outlineSelection && item.getAttribute("aria-selected") === "true") {
      enterInspector(key);
      return;
    }
    await beforeOpen();
    if (mechanismId) {
      const mechanism = WIDGET_COPY.outlineMechanisms[mechanismId];
      const file = state.authoringView?.mechanisms.find(candidate => candidate.id === mechanismId)?.file ?? "";
      const identity = `mechanism\0${mechanismId}\0${file}`;
      state.outlineSelection = identity;
      const next = { kind: "mechanism", name: mechanismId, file };
      select(next);
      announceSelection(mechanism.label, next);
      renderedModel = "";
      render();
      itemForKey(key)?.focus({ preventScroll: true });
      return;
    }
    const artifact = artifactForKey(key);
    if (!artifact || !openLocation(artifact, { focus: false })) {
      report(WIDGET_COPY.declarationGone(artifact?.name ?? WIDGET_COPY.thisDeclaration), true);
      renderedModel = "";
      render();
      return;
    }
    state.outlineSelection = artifact.identity;
    const next = {
      kind: artifact.kind,
      name: artifact.name,
      file: artifact.kind === "collection" ? artifact.location.replace(/\/$/, "") : artifact.file,
      range: artifact.range,
      extent: artifact.extent
    };
    select(next);
    announceSelection(artifact.display || artifact.name, next);
    renderedModel = "";
    render();
    itemForKey(key)?.focus({ preventScroll: true });
  }

  async function handleClick(event) {
    if (!owns(event.target)) return false;
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
        query("[data-panel-creator-name]")?.focus();
      } else {
        try {
          await panelHost.runCreator(creator.id, { file: state.selected?.type === "file" ? state.selected.path : undefined }, "sidebar");
          state.outlineMenuOpen = false;
          state.panelCreatorError = "";
        } catch (error) { state.panelCreatorError = error.message; }
        renderedModel = "";
        render();
        query('[data-action="outline-menu"]')?.focus({ preventScroll: true });
      }
      return true;
    }
    const panelCreatorConfirm = event.target.closest("[data-panel-creator-confirm]");
    if (panelCreatorConfirm) {
      const name = query("[data-panel-creator-name]")?.value ?? "";
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
      (state.panelCreatorPrompt ? query("[data-panel-creator-name]") : query('[data-action="outline-menu"]'))?.focus({ preventScroll: true });
      return true;
    }
    if (event.target.closest("[data-outline-filter]")) {
      state.outlineProblemsOnly = !state.outlineProblemsOnly;
      renderedModel = "";
      render();
      query("[data-outline-filter]")?.focus({ preventScroll: true });
      return true;
    }
    if (event.target.closest('[data-action="outline-menu"]')) {
      state.outlineMenuOpen = !state.outlineMenuOpen;
      if (!state.outlineMenuOpen) { state.panelCreatorPrompt = ""; state.panelCreatorError = ""; }
      renderedModel = "";
      render();
      // Closing the menu from its own button keeps focus on that button, so
      // Escape can still reach the drawer and Tab still starts from the strip.
      if (state.outlineMenuOpen) query('[role="menu"] [role="menuitem"]')?.focus();
      else query('[data-action="outline-menu"]')?.focus({ preventScroll: true });
      return true;
    }
    const treeItem = event.target.closest('[role="treeitem"]');
    // The chevron folds a mechanism without selecting it; the rest of the
    // row selects (a branch row folds wherever it is clicked).
    if (treeItem?.dataset.outlineMechanism && event.target.closest(".opengdd-author-outline-chevron")) {
      toggleFold(`mechanism-${treeItem.dataset.outlineMechanism}`);
      focusItem(itemForKey(treeItem.dataset.outlineFocus));
      return true;
    }
    if (treeItem) { await activate(treeItem); return true; }
    return false;
  }

  function focusItem(item) {
    if (!item) return;
    setTabStop(item);
    item.focus({ preventScroll: true });
  }

  function handleKeydown(event) {
    const menuItem = event.target.closest('[role="menuitem"]');
    if (menuItem && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = queryAll('[role="menuitem"]');
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
      renderedModel = "";
      render();
      query('[data-action="outline-menu"]')?.focus();
      return true;
    }
    const tree = event.target.closest('[role="tree"]');
    const treeItem = event.target.closest('[role="treeitem"]');
    if (!tree || !treeItem || !tree.contains(treeItem)) return false;
    const items = [...tree.querySelectorAll('[role="treeitem"]')];
    const current = items.indexOf(treeItem);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
        : Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
      focusItem(items[next]);
      return true;
    }
    if (event.key === "ArrowLeft") {
      if (treeItem.getAttribute("aria-expanded") === "true") {
        event.preventDefault();
        const fold = treeItem.dataset.outlineMechanism ? `mechanism-${treeItem.dataset.outlineMechanism}` : `branch-${treeItem.dataset.outlineBranch}`;
        toggleFold(fold);
        focusItem(itemForKey(treeItem.dataset.outlineFocus));
      } else if (treeItem.dataset.outlineParent) {
        event.preventDefault();
        focusItem(itemForKey(treeItem.dataset.outlineParent));
      }
      return true;
    }
    if (event.key === "ArrowRight") {
      if (treeItem.getAttribute("aria-expanded") === "false") {
        event.preventDefault();
        const fold = treeItem.dataset.outlineMechanism ? `mechanism-${treeItem.dataset.outlineMechanism}` : `branch-${treeItem.dataset.outlineBranch}`;
        toggleFold(fold);
        focusItem(itemForKey(treeItem.dataset.outlineFocus));
      } else if (treeItem.getAttribute("aria-expanded") === "true") {
        const child = treeItem.querySelector(':scope > [role="group"] > [role="treeitem"]');
        if (child) { event.preventDefault(); focusItem(child); }
      }
      return true;
    }
    if ((event.key === "Enter" || event.key === " ") && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (event.shiftKey && event.key === "Enter" && treeItem.dataset.outlineMechanism) {
        const create = treeItem.querySelector(':scope > .opengdd-author-outline-row > [data-outline-create]');
        if (create) void createFromOutline(create.dataset.outlineCreate, create);
      } else void activate(treeItem);
      return true;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const needle = event.key.toLocaleLowerCase();
      for (let offset = 1; offset <= items.length; offset += 1) {
        const candidate = items[(current + offset) % items.length];
        if ((candidate.dataset.outlineName ?? "").startsWith(needle)) {
          event.preventDefault();
          focusItem(candidate);
          break;
        }
      }
      return true;
    }
    return true;
  }

  return Object.freeze({
    render,
    schedule,
    invalidate() { renderedModel = ""; },
    handleClick,
    owns,
    handleKeydown,
    focusKey(key) { itemForKey(key)?.focus({ preventScroll: true }); },
    destroy() { if (frame) view.cancelAnimationFrame(frame); frame = 0; }
  });
}
