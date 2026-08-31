import { resolveAnchor } from "opengdd-analysis";
import { unfencedLines } from "opengdd-syntax";
import { RESERVED_EXTENSIONS, RESERVED_FIRST_SEGMENTS } from "opengdd-validation";
import { CREATION_COPY } from "./copy/creation-copy.mjs";
import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { kindClass } from "./kinds.mjs";
import {
  lineBounds, lineStarts, lineText, offsetToPosition, rangeFromOffsets, updateLineStarts
} from "./text-coordinates.mjs";

const OVERLAY_MARGIN = 60;
const RESERVED_CREATION_TOKENS = new Set(["true", "false", "null"]);
const CREATION_TOKEN_SHAPE = /^(?:(?:[A-Za-z0-9._-]+\.md)?#[A-Za-z0-9._-]+|[A-Za-z0-9._-]+)$/i;
const CREATION_PALETTE_TOKEN = /^palette\.(?:(?!(?:json|md)(?:\.|$))(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(?:(?!(?:json|md)(?:\.|$))(?=[a-z0-9-]*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*))*$/;
const CREATION_MECHANISM_TOKEN = /^(?:clocks\.[A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?|rules\.[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RESERVED_CREATION_FIRST_SEGMENTS = new Set(RESERVED_FIRST_SEGMENTS);
const RESERVED_CREATION_EXTENSIONS = new Set(RESERVED_EXTENSIONS);

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function anchorClass(anchor) {
  const kind = anchor.classification === "known" ? kindClass(anchor.definitions[0]?.kind) : anchor.classification;
  return `opengdd-author-anchor opengdd-author-anchor--${anchor.classification} opengdd-author-kind--${kind}`;
}

function anchorsByLine(anchors) {
  const byLine = new Map();
  for (const anchor of anchors) {
    const line = anchor.range.start.line;
    const current = byLine.get(line) ?? [];
    current.push(anchor);
    byLine.set(line, current);
  }
  for (const line of byLine.values()) line.sort((left, right) => left.range.start.character - right.range.start.character);
  return byLine;
}

function renderOverlayLine(line, anchors) {
  if (!anchors) return escapeHtml(line);
  let cursor = 0;
  let output = "";
  for (const anchor of anchors) {
    const start = anchor.range.start.character;
    const end = anchor.range.end.character;
    if (start < cursor) continue;
    output += escapeHtml(line.slice(cursor, start));
    output += `<span class="${anchorClass(anchor)}" data-anchor-name="${escapeHtml(anchor.name)}">${escapeHtml(line.slice(start, end))}</span>`;
    cursor = end;
  }
  return output + escapeHtml(line.slice(cursor));
}

// Unknown names the engine does not yet index — the raw material of a
// quick-fix. Fence handling comes from the shared syntax helper so this can
// never drift from what the engine and the validator consider prose.
function creationTokens(text, definitionsByName, file) {
  const anchors = [];
  // A bare spelling of an existing anchor (`mechanics` when `#mechanics`
  // is declared) is a near-miss citation, not a new name: completions may
  // suggest the anchored spelling, creation must never be offered.
  const anchoredBareNames = new Set();
  for (const key of definitionsByName?.keys?.() ?? []) {
    const hash = key.indexOf("#");
    if (hash >= 0 && hash < key.length - 1) anchoredBareNames.add(key.slice(hash + 1));
  }
  for (const item of unfencedLines(text)) {
    for (const match of item.text.matchAll(/`([^`\r\n]*)`/g)) {
      const name = match[1];
      if (!name || !CREATION_TOKEN_SHAPE.test(name) || RESERVED_CREATION_TOKENS.has(name) || /[\\/]/.test(name)) continue;
      if (!name.includes("#") && name.includes(".")) {
        const segments = name.split(".");
        if ((RESERVED_CREATION_FIRST_SEGMENTS.has(segments[0]) && !CREATION_PALETTE_TOKEN.test(name) && !CREATION_MECHANISM_TOKEN.test(name))
          || segments.some(segment => RESERVED_CREATION_EXTENSIONS.has(segment))
          || segments.every(segment => /^\d+$/.test(segment))) continue;
      }
      if (anchoredBareNames.has(name)) continue;
      const resolution = resolveAnchor(definitionsByName, name);
      if (resolution.classification !== "unknown") continue;
      const character = match.index + 1;
      anchors.push({
        ...resolution,
        file,
        range: { start: { line: item.line - 1, character }, end: { line: item.line - 1, character: character + name.length } }
      });
    }
  }
  return anchors;
}

// Scanned backwards from the caret rather than over the text before it: this
// runs on every keystroke, and a whole chapter must not be copied to find out
// that the word under the caret is not a name.
function completionContext(textarea) {
  const value = textarea.value;
  const caret = textarea.selectionStart ?? value.length;
  for (let index = caret - 1; index >= 0; index -= 1) {
    if (value[index] === "`") return { backtick: index, caret, prefix: value.slice(index + 1, caret) };
    if (/\s/.test(value[index])) return null;
  }
  return null;
}

function valueText(value) {
  if (value === undefined) return "";
  const rendered = JSON.stringify(value);
  return rendered === undefined ? String(value) : rendered;
}

export function createEditorSurface({
  document, view, elements: ui, on, viewSupplier, pathSupplier, revisionSupplier,
  textSupplier, queueEdit, proposeCreation, confirmCreation, creationApplied,
  report, isDestroyed, publishSelection
}) {
  const overlay = {
    lines: [], elements: [], markup: [], analysisLines: [], byLine: new Map(),
    lineStarts: [], first: 0, last: -1, dirty: true
  };
  const overlayWidth = document.createElement("span");
  overlayWidth.className = "opengdd-author-overlay-width";
  let frame = 0;
  let completionsPending = false;
  let textRevision = 0;
  let anchorCache = { view: null, path: "", revision: -1, anchors: [] };
  let completionIndex = -1;
  let hoverName = "";
  let quickfix = null;

  function currentPath() { return pathSupplier(); }

  function reset() {
    overlay.lines = [];
    overlay.elements = [];
    overlay.markup = [];
    overlay.analysisLines = [];
    overlay.byLine = new Map();
    overlay.lineStarts = [];
    overlay.first = 0;
    overlay.last = -1;
    overlay.dirty = true;
    ui.highlight.replaceChildren();
  }

  function overlayElement(markup) {
    const element = document.createElement("span");
    element.className = "opengdd-author-overlay-line";
    element.innerHTML = markup;
    return element;
  }

  // The highlight layer is the text the designer sees — the textarea's own
  // glyphs are transparent — so it follows every keystroke. Unchanged line
  // nodes stay in place; changed lines render plain until analysis returns.
  function reconcile(lines) {
    const previous = overlay.lines;
    let first = 0;
    while (first < previous.length && first < lines.length && previous[first] === lines[first]) first += 1;
    let tail = 0;
    while (tail < previous.length - first && tail < lines.length - first
      && previous[previous.length - 1 - tail] === lines[lines.length - 1 - tail]) tail += 1;
    if (first === previous.length && first === lines.length) return;
    const oldEnd = previous.length - tail;
    const newEnd = lines.length - tail;
    const reference = overlay.elements[oldEnd] ?? null;
    for (const element of overlay.elements.slice(first, oldEnd)) {
      const newline = element.nextSibling;
      element.remove();
      newline?.remove();
    }
    const fragment = document.createDocumentFragment();
    const elements = [];
    const markup = [];
    for (let index = first; index < newEnd; index += 1) {
      const rendered = escapeHtml(lines[index]);
      const element = overlayElement(rendered);
      fragment.append(element, document.createTextNode("\n"));
      elements.push(element);
      markup.push(rendered);
    }
    ui.highlight.insertBefore(fragment, reference);
    overlay.elements = [...overlay.elements.slice(0, first), ...elements, ...overlay.elements.slice(oldEnd)];
    overlay.markup = [...overlay.markup.slice(0, first), ...markup, ...overlay.markup.slice(oldEnd)];
    overlay.lines = lines;
  }

  function paint() {
    if (ui.textarea.hidden) return;
    if (ui.editor.classList.contains("opengdd-author-editor--wrapped")) {
      reconcile(ui.textarea.value.split("\n"));
    } else {
      const text = ui.textarea.value;
    if (!overlay.lineStarts.length) overlay.lineStarts = lineStarts(text);
      const starts = overlay.lineStarts;
      const style = view.getComputedStyle(ui.textarea);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      const top = Math.floor(ui.textarea.scrollTop / lineHeight);
      const last = Math.min(starts.length - 1, top + Math.ceil(ui.textarea.clientHeight / lineHeight) + OVERLAY_MARGIN);
      const first = Math.min(Math.max(0, top - OVERLAY_MARGIN), last);
      if (overlay.dirty || first < overlay.first || last > overlay.last) {
        const width = ui.textarea.scrollWidth;
        const shift = starts.length - overlay.analysisLines.length;
        let output = "\n".repeat(first);
        for (let index = first; index <= last; index += 1) {
      const line = lineText(text, starts, index);
          const source = overlay.analysisLines[index] === line
            ? index
            : overlay.analysisLines[index - shift] === line ? index - shift : -1;
          if (index > first) output += "\n";
          output += renderOverlayLine(line, source < 0 ? null : overlay.byLine.get(source));
        }
        const tail = starts.length - 1 - last;
        overlayWidth.style.width = first === 0 && tail === 0 ? "0" : `${width}px`;
        ui.highlight.innerHTML = `${output}${"\n".repeat(tail)}`;
        ui.highlight.append(overlayWidth, document.createTextNode("\n"));
        overlay.first = first;
        overlay.last = last;
        overlay.dirty = false;
      }
    }
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
  }

  // The character goes up first; the completion list follows in the same
  // frame. Offering completions reads layout back out of the DOM, and doing
  // that from the input handler makes the browser lay out the whole file
  // before it can paint a single keystroke.
  function schedule({ changed = false, completions = false } = {}) {
    overlay.dirty ||= changed;
    completionsPending ||= completions;
    if (frame || isDestroyed()) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      paint();
      flushCompletions();
    });
  }

  // A key that acts on the list — accept, move, dismiss — must act on the
  // list the text deserves, not the one left over from the keystroke before
  // it. Typing never comes through here, so the keystroke path stays clear.
  function flushCompletions() {
    if (!completionsPending) return;
    completionsPending = false;
    offerCompletions();
  }

  function anchors() {
    const promised = viewSupplier();
    const path = currentPath();
    if (anchorCache.view === promised && anchorCache.path === path && anchorCache.revision === textRevision) return anchorCache.anchors;
    let found;
    if (/\.md$/i.test(path)) {
      const analyzed = (promised?.anchors ?? []).filter(anchor => anchor.file === path);
      const keys = new Set(analyzed.map(anchor => `${anchor.range.start.line}:${anchor.range.start.character}`));
      const mentions = promised ? creationTokens(ui.textarea.value, promised.definitionsByName, path) : [];
      found = [...analyzed, ...mentions.filter(anchor => !keys.has(`${anchor.range.start.line}:${anchor.range.start.character}`))];
    } else if (/\.json$/i.test(path)) {
      try { JSON.parse(ui.textarea.value); } catch { found = []; }
      if (!found) {
        found = [];
        for (const match of ui.textarea.value.matchAll(/"(?:\\.|[^"\\])*"/g)) {
          let name;
          try { name = JSON.parse(match[0]); } catch { continue; }
          if (!promised) continue;
          const resolution = resolveAnchor(promised.definitionsByName, name);
      if (resolution.classification !== "unknown") found.push({ ...resolution, file: path, range: rangeFromOffsets(ui.textarea.value, match.index, match.index + match[0].length) });
        }
      }
    } else found = [];
    anchorCache = { view: promised, path, revision: textRevision, anchors: found };
    return found;
  }

  function analysisChanged() {
    hoverName = "";
    if (ui.textarea.hidden) return;
    const lines = ui.textarea.value.split("\n");
    const byLine = anchorsByLine(anchors());
    if (ui.editor.classList.contains("opengdd-author-editor--wrapped")) {
      reconcile(lines);
      for (let index = 0; index < lines.length; index += 1) {
        const markup = renderOverlayLine(lines[index], byLine.get(index));
        if (markup === overlay.markup[index]) continue;
        overlay.elements[index].innerHTML = markup;
        overlay.markup[index] = markup;
      }
    } else {
      overlay.analysisLines = lines;
      overlay.byLine = byLine;
    overlay.lineStarts = lineStarts(ui.textarea.value);
      overlay.dirty = true;
      paint();
    }
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
  }

  function showHover(name) {
    if (!name || hoverName === name) return;
    hoverName = name;
    const resolution = resolveAnchor(viewSupplier()?.definitionsByName ?? new Map(), name);
    const anchor = anchors().find(candidate => candidate.name === name);
    publishSelection?.({
      kind: resolution.definitions[0]?.kind === "name" ? "identifier" : resolution.definitions[0]?.kind ?? "identifier",
      name,
      file: anchor?.file ?? currentPath(),
      range: anchor?.range
    });
    const definitions = resolution.definitions.map(definition => {
      const value = valueText(definition.value);
      return `<li><strong>${escapeHtml(CREATION_COPY.kindLabels[definition.kind] ?? CREATION_COPY.kindLabels.name)}</strong><span>${escapeHtml(definition.detail)}</span><span>${escapeHtml(definition.file)} · ${WIDGET_COPY.line(definition.range.start.line + 1)}</span>${value ? `<span class="opengdd-author-definition-value"><span>${WIDGET_COPY.value}</span><code>${escapeHtml(value)}</code></span>` : ""}</li>`;
    }).join("");
  }

  function anchorAt(line, character) {
    const path = currentPath();
    return anchors().find(anchor => anchor.file === path
      && anchor.range.start.line === line
      && character >= anchor.range.start.character
      && character <= anchor.range.end.character);
  }

  function anchorNameAtPoint(x, y) {
    for (const anchor of ui.highlight.querySelectorAll("[data-anchor-name]")) {
      for (const rect of anchor.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return anchor.dataset.anchorName;
      }
    }
    return "";
  }

  function showCaretAnchor() {
    const caret = offsetToPosition(ui.textarea.value, ui.textarea.selectionStart ?? 0);
    const anchor = anchorAt(caret.line, caret.character);
    if (anchor) showHover(anchor.name);
    return anchor;
  }

  function completionButtons() {
    return [...ui.completions.querySelectorAll("[data-completion]")];
  }

  function activateCompletion(index) {
    const buttons = completionButtons();
    if (!buttons.length) { completionIndex = -1; return; }
    completionIndex = (index + buttons.length) % buttons.length;
    buttons.forEach((button, position) => button.classList.toggle("opengdd-author-is-active", position === completionIndex));
    buttons[completionIndex].scrollIntoView({ block: "nearest" });
  }

  function positionPopup(element) {
    const style = view.getComputedStyle(ui.textarea);
    for (const property of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding", "borderWidth", "boxSizing", "whiteSpace", "overflowWrap", "wordBreak", "tabSize"]) {
      ui.mirror.style[property] = style[property];
    }
    ui.mirror.style.width = `${ui.textarea.clientWidth}px`;
    const value = ui.textarea.value;
    const caret = ui.textarea.selectionStart ?? value.length;
    const wrapped = ui.editor.classList.contains("opengdd-author-editor--wrapped");
    let line = 0;
    if (wrapped) ui.mirror.textContent = value.slice(0, caret);
    else {
      const position = offsetToPosition(value, caret);
      line = position.line;
      const bounds = lineBounds(value, line);
      ui.mirror.textContent = value.slice(bounds.start, caret);
    }
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    ui.mirror.appendChild(marker);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
    const top = marker.offsetTop + (wrapped ? lineHeight : (line + 1) * lineHeight) - ui.textarea.scrollTop;
    const maxLeft = ui.textarea.clientWidth - element.offsetWidth;
    const left = Math.max(0, Math.min(marker.offsetLeft - ui.textarea.scrollLeft, maxLeft));
    element.style.top = `${Math.max(0, Math.min(top, ui.textarea.clientHeight))}px`;
    element.style.left = `${left}px`;
  }

  let folded = { view: null, names: [] };
  function lowercaseNames() {
    const promised = viewSupplier();
    if (folded.view !== promised) folded = { view: promised, names: (promised?.completionNames ?? []).map(entry => entry.name.toLowerCase()) };
    return folded.names;
  }

  function clearCompletions() {
    ui.completions.replaceChildren();
    completionIndex = -1;
  }

  function offerCompletions() {
    if (quickfix) { clearCompletions(); return; }
    const context = completionContext(ui.textarea);
    if (!context || ui.textarea.hidden || !/\.md$/i.test(currentPath())) { clearCompletions(); return; }
    const prefix = context.prefix.toLowerCase();
    const table = viewSupplier()?.completionNames ?? [];
    const names = lowercaseNames();
    const opening = [];
    const containing = [];
    for (let index = 0; index < table.length; index += 1) {
      const at = names[index].indexOf(prefix);
      if (at === 0) opening.push(table[index]);
      else if (at > 0) containing.push(table[index]);
    }
    const matches = opening.concat(containing);
    const visible = matches.slice(0, 60);
    const countLine = visible.length
      ? `<li class="opengdd-author-completion-count">${visible.length < matches.length ? WIDGET_COPY.narrowedMatches(visible.length, matches.length) : WIDGET_COPY.matches(matches.length)}</li>`
      : "";
    ui.completions.innerHTML = countLine + visible.map(entry => {
      const definition = entry.definitions[0] ?? {};
      const label = CREATION_COPY.kindLabels[definition.kind] ?? CREATION_COPY.kindLabels.name;
      const detail = definition.kind === "section" ? definition.detail : `${label} · ${definition.detail ?? WIDGET_COPY.packageName}`;
      return `<li><button type="button" data-completion="${escapeHtml(entry.name)}"><code>${escapeHtml(entry.name)}</code><span>${escapeHtml(detail)}</span></button></li>`;
    }).join("");
    if (visible.length) {
      positionPopup(ui.completions);
      activateCompletion(0);
    } else completionIndex = -1;
  }

  async function acceptCompletion(name) {
    const context = completionContext(ui.textarea);
    if (!context) return;
    const after = ui.textarea.value.slice(context.caret);
    const value = `${ui.textarea.value.slice(0, context.backtick + 1)}${name}\`${after}`;
    const caret = context.backtick + name.length + 2;
    ui.textarea.value = value;
    await queueEdit({ label: WIDGET_COPY.completionAction(name), path: currentPath(), text: value });
    textRevision += 1;
    overlay.lineStarts = [];
    schedule({ changed: true });
    ui.textarea.focus();
    ui.textarea.setSelectionRange(caret, caret);
    clearCompletions();
    creationApplied({ changed: true, showCompletion: true });
  }

  function restoreEditor(snapshot) {
    if (!snapshot || snapshot.path !== currentPath() || ui.textarea.hidden) return;
    const start = Math.min(snapshot.start, ui.textarea.value.length);
    const end = Math.min(snapshot.end, ui.textarea.value.length);
    ui.textarea.focus({ preventScroll: true });
    ui.textarea.setSelectionRange(start, end);
    ui.textarea.scrollTop = snapshot.scrollTop;
    ui.textarea.scrollLeft = snapshot.scrollLeft;
    ui.highlight.scrollTop = snapshot.scrollTop;
    ui.highlight.scrollLeft = snapshot.scrollLeft;
  }

  function dismissDialog(restore = true) {
    const snapshot = quickfix?.selection;
    quickfix = null;
    ui.quickfix.hidden = true;
    ui.quickfix.replaceChildren();
    if (restore) restoreEditor(snapshot);
  }

  function renderDialog(focus = false) {
    if (!quickfix) return;
    const selected = quickfix.actions[quickfix.index];
    const actions = quickfix.actions.map((action, index) => ({ action, index }))
      .filter(({ action }) => !action.hiddenUntilError || quickfix.revealAnyway)
      .map(({ action, index }) => `<button type="button" role="radio" aria-checked="${index === quickfix.index}" tabindex="${index === quickfix.index ? 0 : -1}" data-quickfix-action="${index}" class="${index === quickfix.index ? "opengdd-author-is-active" : ""}">${escapeHtml(action.choice)}</button>`).join("");
    const value = selected.needsValue
      ? `<label>${escapeHtml(selected.valueLabel ?? CREATION_COPY.jsonValue)}<input data-role="quickfix-value" value="${escapeHtml(quickfix.value)}" autocomplete="off" spellcheck="false"></label>`
      : "";
    ui.quickfix.innerHTML = `<p>${CREATION_COPY.createNew} <code>${escapeHtml(quickfix.name)}</code> ${CREATION_COPY.as}</p><div class="opengdd-author-quickfix-actions" role="radiogroup" aria-label="${CREATION_COPY.kind}">${actions}</div><div class="opengdd-author-quickfix-confirm">${value}<button type="button" data-quickfix-confirm>${CREATION_COPY.confirm}</button><button type="button" data-quickfix-cancel>${CREATION_COPY.cancelEsc}</button></div><p class="opengdd-author-quickfix-error" aria-live="polite">${escapeHtml(quickfix.error)}</p>`;
    ui.quickfix.setAttribute("aria-label", CREATION_COPY.createNamed(quickfix.name));
    ui.quickfix.hidden = false;
    positionPopup(ui.quickfix);
    if (!focus) return;
    const target = selected.needsValue ? ui.quickfix.querySelector('[data-role="quickfix-value"]') : ui.quickfix.querySelector(`[data-quickfix-action="${quickfix.index}"]`);
    target?.focus({ preventScroll: true });
  }

  function activateDialog(index) {
    if (!quickfix) return;
    const input = ui.quickfix.querySelector('[data-role="quickfix-value"]');
    if (input) quickfix.value = input.value;
    const visible = quickfix.actions.map((action, actionIndex) => ({ action, actionIndex }))
      .filter(({ action }) => !action.hiddenUntilError || quickfix.revealAnyway)
      .map(({ actionIndex }) => actionIndex);
    if (visible.includes(index)) quickfix.index = index;
    else {
      const direction = index < quickfix.index ? -1 : 1;
      const current = Math.max(0, visible.indexOf(quickfix.index));
      quickfix.index = visible[(current + direction + visible.length) % visible.length];
    }
    quickfix.error = "";
    renderDialog(true);
  }

  function revealDialogActions() {
    if (!quickfix) return false;
    const selected = quickfix.actions[quickfix.index];
    if (!selected?.revealActions) return false;
    quickfix.actions.splice(quickfix.index, 1, ...selected.revealActions);
    quickfix.error = "";
    renderDialog(true);
    return true;
  }

  function openDialog(anchor) {
    const path = currentPath();
    if (!anchor || anchor.classification !== "unknown" || !/\.md$/i.test(path)) return;
    dismissDialog(false);
    const proposal = proposeCreation({ name: anchor.name, path, view: viewSupplier() });
    if (!proposal.actions.length) { report(proposal.reason || CREATION_COPY.cannotCreateHere(anchor.name), true); return; }
    completionsPending = false;
    clearCompletions();
    quickfix = {
      name: anchor.name,
      actions: proposal.actions,
      index: 0,
      value: proposal.actions[0]?.defaultValue ?? "",
      error: "",
      revealAnyway: false,
      selection: {
        path,
        start: ui.textarea.selectionStart ?? 0,
        end: ui.textarea.selectionEnd ?? 0,
        scrollTop: ui.textarea.scrollTop,
        scrollLeft: ui.textarea.scrollLeft
      }
    };
    renderDialog(true);
  }

  function closedUnknownAtCaret() {
    const value = ui.textarea.value;
    const caret = ui.textarea.selectionStart ?? value.length;
    if (caret < 2 || value[caret - 1] !== "`") return null;
    const promised = viewSupplier();
    const path = currentPath();
    const analyzedRevision = promised?.revisions?.[path];
    const currentRevision = revisionSupplier(path);
    const beforeClosingBacktick = `${value.slice(0, caret - 1)}${value.slice(caret)}`;
    if (analyzedRevision === undefined || analyzedRevision !== currentRevision || beforeClosingBacktick !== textSupplier(path)) return null;
    const endAtCaret = offsetToPosition(value, caret - 1);
    return creationTokens(value, promised.definitionsByName, path).find(anchor => {
      const end = anchor.range.end;
      return end.line === endAtCaret.line && end.character === endAtCaret.character;
    }) ?? null;
  }

  async function commitDialog() {
    const pending = quickfix;
    if (!pending) return;
    if (revealDialogActions()) return;
    try {
      const input = ui.quickfix.querySelector('[data-role="quickfix-value"]');
      pending.value = input?.value ?? pending.value;
      const outcome = await confirmCreation({
        name: pending.name,
        choice: pending.actions[pending.index]?.choice,
        value: pending.value,
        selection: pending.selection,
        isCurrent: () => quickfix === pending
      });
      if (!outcome || quickfix !== pending) return;
      if (typeof outcome.editorText === "string") {
        ui.textarea.value = outcome.editorText;
        textRevision += 1;
        overlay.lineStarts = [];
        schedule({ changed: true });
      }
      const snapshot = pending.selection;
      dismissDialog(false);
      creationApplied(outcome);
      restoreEditor(snapshot);
    } catch (error) {
      if (quickfix !== pending) return;
      pending.error = error.message;
      if (error.writeAnyway) pending.revealAnyway = true;
      renderDialog(true);
    }
  }

  function inputChanged(previous, selection, detectDialog = true) {
    if (!ui.editor.classList.contains("opengdd-author-editor--wrapped") && typeof previous === "string") {
      overlay.lineStarts = updateLineStarts(overlay.lineStarts, previous, ui.textarea.value, selection);
    }
    textRevision += 1;
    const closedUnknown = detectDialog ? closedUnknownAtCaret() : null;
    if (closedUnknown) openDialog(closedUnknown);
    schedule({ changed: true, completions: !closedUnknown });
    return Boolean(closedUnknown);
  }

  function textLoaded() {
    textRevision += 1;
    analysisChanged();
  }

  function loadText(text) {
    ui.textarea.value = text;
    ui.textarea.scrollTop = 0;
    ui.textarea.scrollLeft = 0;
    ui.highlight.scrollTop = 0;
    ui.highlight.scrollLeft = 0;
    textLoaded();
  }

  function invalidateInput() {
    overlay.lineStarts = [];
  }

  function scrollToEditorLine(index) {
    const wrappedLine = ui.editor.classList.contains("opengdd-author-editor--wrapped") ? overlay.elements[index] : null;
    if (wrappedLine) ui.textarea.scrollTop = Math.max(0, wrappedLine.offsetTop - ui.textarea.clientHeight / 3);
    else {
      const style = view.getComputedStyle(ui.textarea);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      ui.textarea.scrollTop = Math.max(0, index * lineHeight - ui.textarea.clientHeight / 3);
    }
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
  }

  on(ui.editor, "click", event => {
    const completion = event.target.closest("[data-completion]");
    if (completion) { acceptCompletion(completion.dataset.completion).catch(error => report(error.message, true)); return; }
    const action = event.target.closest("[data-quickfix-action]");
    if (action && quickfix) {
      activateDialog(Number(action.dataset.quickfixAction));
      revealDialogActions();
      return;
    }
    if (event.target.closest("[data-quickfix-confirm]")) { commitDialog(); return; }
    if (event.target.closest("[data-quickfix-cancel]")) dismissDialog();
  });
  function scrollChanged() {
    ui.highlight.scrollTop = ui.textarea.scrollTop;
    ui.highlight.scrollLeft = ui.textarea.scrollLeft;
    schedule();
    if (completionButtons().length) positionPopup(ui.completions);
    if (quickfix) positionPopup(ui.quickfix);
  }
  on(ui.textarea, "scroll", scrollChanged);
  on(ui.textarea, "keydown", event => {
    if (["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) flushCompletions();
    if ((event.ctrlKey && event.key === ".") || (event.altKey && event.key === "Enter")) {
      const anchor = showCaretAnchor();
      if (anchor?.classification === "unknown") { event.preventDefault(); openDialog(anchor); }
      return;
    }
    const buttons = completionButtons();
    if (!buttons.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); activateCompletion(completionIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); activateCompletion(completionIndex - 1); }
    else if (event.key === "Enter" && completionIndex >= 0) {
      event.preventDefault();
      acceptCompletion(buttons[completionIndex].dataset.completion).catch(error => report(error.message, true));
    } else if (event.key === "Escape") clearCompletions();
  });
  on(ui.textarea, "keyup", showCaretAnchor);
  on(ui.textarea, "click", () => {
    const anchor = showCaretAnchor();
    if (anchor?.classification === "unknown") openDialog(anchor);
    // The click already placed the caret; restoring the snapshot would drag it
    // back to the mention the designer just left.
    else if (quickfix) dismissDialog(false);
  });
  on(ui.quickfix, "keydown", event => {
    if (!quickfix) return;
    const radio = event.target.closest('[role="radio"]');
    if (radio && event.target.closest('[role="radiogroup"]') && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      activateDialog(quickfix.index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1));
    } else if (event.key === "Enter" && event.target.matches('[data-role="quickfix-value"]')) { event.preventDefault(); commitDialog(); }
    else if (event.key === "Escape") { event.preventDefault(); dismissDialog(); }
    else if (event.key === "Tab") {
      const focusable = [...ui.quickfix.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"])')];
      const current = focusable.indexOf(document.activeElement);
      if (!focusable.length || (!event.shiftKey && current < focusable.length - 1) || (event.shiftKey && current > 0)) return;
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  });
  on(ui.textarea, "mousemove", event => {
    const name = anchorNameAtPoint(event.clientX, event.clientY);
    if (name) showHover(name);
  });
  // A resize changes wrapping in both stacked layers; a frame keeps their
  // scroll positions and any open popup aligned after layout settles.
  const resize = new view.ResizeObserver(() => schedule({ changed: true }));
  resize.observe(ui.editor);

  return {
    reset,
    loadText,
    anchors,
    analysisChanged,
    offerCompletions,
    schedule,
    inputChanged,
    invalidateInput,
    scrollToEditorLine,
    scrollChanged,
    closeDialog: dismissDialog,
    closePopups(restore = true) {
      clearCompletions();
      dismissDialog(restore);
    },
    dialogOpen() { return Boolean(quickfix); },
    openCreation(name) { openDialog({ name, classification: "unknown" }); },
    dialogContains(target) { return ui.quickfix.contains(target); },
    destroy() {
      resize.disconnect();
      view.cancelAnimationFrame(frame);
    }
  };
}
