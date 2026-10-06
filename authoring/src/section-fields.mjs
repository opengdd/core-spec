import { INSPECTOR_COPY } from "./copy/inspector-copy.mjs";
import { authorityTagScopes, headingModeTags, markdownSlug, unfencedLines } from "opengdd-syntax";
import { element } from "./dom.mjs";
import { openTextEditDialog } from "./entity-lifecycle.mjs";
import { entityChips, locationRows, referenceGroup } from "./inspector-groups.mjs";

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
const EXPLICIT = /\s*\{#([A-Za-z0-9._-]+)\}\s*$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function markdownHeadingSlug(text) {
  return markdownSlug(String(text));
}

export function sectionEntity(selection, files, revision) {
  if (selection?.kind !== "section" || typeof selection.file !== "string") return null;
  const text = files.get(selection.file);
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/u);
  const lineNumber = selection.range?.start?.line;
  if (!Number.isInteger(lineNumber)) return null;
  const line = unfencedLines(text).find(item => item.line === lineNumber + 1)?.text ?? "";
  const heading = HEADING.exec(line);
  if (!heading) return null;
  const raw = heading[2];
  const explicit = EXPLICIT.exec(raw);
  const withoutAnchor = explicit ? raw.slice(0, explicit.index).trimEnd() : raw;
  let clocks;
  try { clocks = JSON.parse(files.get("clocks.json") ?? "{}"); } catch {}
  const declaredModes = new Set(Object.values(clocks ?? {}).flatMap(clock => Object.keys(clock?.modes ?? {})));
  const modeTags = declaredModes.size ? headingModeTags(withoutAnchor) : [];
  let title = withoutAnchor;
  for (const tag of [...modeTags].reverse()) title = title.slice(0, tag.index) + title.slice(tag.index + tag[0].length);
  title = title.trim().replace(/\s{2,}/gu, " ");
  const slug = explicit?.[1] ?? markdownHeadingSlug(withoutAnchor);
  const titleStart = line.indexOf(title, heading[1].length + 1);
  const rawStart = line.indexOf(raw, heading[1].length + 1);
  const level = heading[1].length;
  let endLine = lines.length;
  for (let index = lineNumber + 1; index < lines.length; index += 1) {
    const next = HEADING.exec(lines[index]);
    if (next && next[1].length <= level) { endLine = index; break; }
  }
  return {
    id: slug, address: `${selection.file}#${slug}`, title, titleIsProse: true, kindLabel: INSPECTOR_COPY.sectionKind,
    file: selection.file, line: lineNumber, level, slug, explicit: explicit?.[1], mode: modeTags[0]?.[1],
    modeTags: modeTags.map(tag => tag[0]), rawStart, rawEnd: rawStart + raw.length,
    lineText: line, text, sectionEndLine: endLine,
    extent: {
      start: { line: lineNumber, character: 0 },
      end: { line: endLine - 1, character: (lines[endLine - 1] ?? "").length }
    },
    range: {
      start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: line.length }, revision
    },
    titleRange: titleStart < 0 ? undefined : {
      start: { line: lineNumber, character: titleStart }, end: { line: lineNumber, character: titleStart + title.length }, revision
    },
    anchorRange: explicit ? {
      start: { line: lineNumber, character: line.lastIndexOf(`{#${explicit[1]}}`) + 2 },
      end: { line: lineNumber, character: line.lastIndexOf(`{#${explicit[1]}}`) + 2 + explicit[1].length }, revision
    } : undefined,
    anchorInsertRange: explicit ? undefined : {
      start: { line: lineNumber, character: rawStart + raw.length },
      end: { line: lineNumber, character: rawStart + raw.length }, revision
    }
  };
}

const currentEntity = (context, entity) => sectionEntity(
  { kind: "section", file: entity.file, range: { start: { line: entity.line } } },
  new Map([[entity.file, context.package.read(entity.file)], ["clocks.json", context.package.read("clocks.json")]]), context.package.revision(entity.file)
);

function headingReplacement(current, title, anchor = current.explicit) {
  const contiguous = current.titleRange && current.titleRange.start.character >= current.rawStart;
  let heading = contiguous
    ? current.lineText.slice(0, current.titleRange.start.character) + title + current.lineText.slice(current.titleRange.end.character)
    : current.lineText.slice(0, current.rawStart) + title + (current.modeTags.length ? ` ${current.modeTags.join(" ")}` : "")
      + (current.explicit ? ` {#${current.explicit}}` : "") + current.lineText.slice(current.rawEnd);
  if (current.explicit && anchor) return heading.replace(`{#${current.explicit}}`, `{#${anchor}}`);
  if (anchor) {
    const at = heading.length - (current.lineText.length - current.rawEnd);
    heading = heading.slice(0, at) + ` {#${anchor}}` + heading.slice(at);
  }
  return heading;
}

async function replaceText(context, label, file, range, value) {
  const transaction = context.internal.begin(label);
  transaction.text(file).replace(range, value);
  await transaction.commit();
}

async function writeHeading(context, entity, value) {
  const current = currentEntity(context, entity);
  if (!current || value === current.title) return;
  if (!value.trim()) throw new Error(INSPECTOR_COPY.sectionHeadingRequired);
  const transaction = context.internal.begin(INSPECTOR_COPY.changeSectionHeading);
  const heading = headingReplacement(current, value.trim(), current.slug);
  transaction.text(current.file).replace(current.range, heading);
  await transaction.commit();
}

async function renameAnchor(context, entity, next) {
  const current = currentEntity(context, entity);
  const plan = context.services.references.planRename(current.address, next);
  if (plan.safety !== "complete") throw new Error(plan.reason);
  const result = await context.services.references.applyRename(plan);
  if (!result.applied) throw new Error(result.reason);
  context.services.selection.select({ kind: "section", name: next, file: current.file,
    range: { start: { line: current.line, character: 0 }, end: { line: current.line, character: current.lineText.length } },
    extent: current.extent });
}

export function sectionFields(context, entity) {
  const current = () => currentEntity(context, entity);
  const anchor = {
    key: "anchor", label: INSPECTOR_COPY.sectionAnchor, help: INSPECTOR_COPY.sectionAnchorHelp,
    type: "text", required: true, commitOnBlur: true, disabled: !entity.explicit,
    binding: { file: entity.file, pointer: "/anchor" }, read: () => current()?.slug,
    validate: value => SLUG.test(value) ? "" : INSPECTOR_COPY.sectionAnchorInvalid,
    async write(value) { await renameAnchor(context, entity, value); },
    labels: { change: INSPECTOR_COPY.renameSectionAnchor }
  };
  if (!entity.explicit) anchor.action = {
    label: INSPECTOR_COPY.makeAnchorExplicit,
    run: async () => {
      const now = current();
      await replaceText(context, INSPECTOR_COPY.makeAnchorExplicitUndo, now.file, {
        start: { line: now.line, character: now.lineText.length },
        end: { line: now.line, character: now.lineText.length }, revision: now.range.revision
      }, ` {#${now.slug}}`);
    }
  };
  return [{
    key: "heading", label: INSPECTOR_COPY.sectionHeading, help: INSPECTOR_COPY.sectionHeadingHelp,
    type: "text", required: true, commitOnBlur: true,
    binding: { file: entity.file, pointer: "/heading" }, read: () => current()?.title,
    validate: value => value.trim() ? "" : INSPECTOR_COPY.sectionHeadingRequired,
    write: value => writeHeading(context, entity, value), labels: { change: INSPECTOR_COPY.changeSectionHeading }
  }, anchor];
}

function sectionRulesets(context, entity) {
  const lines = entity.text.split(/\r?\n/u);
  const tags = authorityTagScopes(lines).filter(scope => scope.level === "ruleset"
    && scope.start > entity.line && scope.start < entity.sectionEndLine
    && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\s+\(initial\))?\s*$/u.test(scope.content)
    && scope.ruleset !== "all").map(scope => ({ id: scope.ruleset, initial: scope.initial, line: scope.start, end: scope.end }));
  tags.sort((left, right) => Number(right.initial) - Number(left.initial) || left.line - right.line);
  const rows = tags.length ? [entityChips(context, tags.map(tag => ({
      name: INSPECTOR_COPY.sectionRulesetLabel(tag.id, tag.initial), kind: INSPECTOR_COPY.rulesetKind,
      dataset: { [tag.initial ? "sectionInitialRuleset" : "sectionRuleset"]: "" }, selection: {
        kind: "ruleset", name: tag.id, file: entity.file,
        range: { start: { line: tag.line, character: 0 }, end: { line: tag.line, character: lines[tag.line].length } },
        extent: { start: { line: tag.line, character: 0 }, end: { line: tag.end - 1, character: lines[tag.end - 1].length } }
      }
    })))] : [];
  const section = referenceGroup(context, { key: "rulesets", label: INSPECTOR_COPY.sectionRulesets,
    help: tags.length ? INSPECTOR_COPY.sectionRulesetsHelp : INSPECTOR_COPY.sectionNoRulesets, rows });
  section.dataset.sectionRulesets = "";
  section.tabIndex = -1;
  return section;
}

export function sectionSections(context, entity) {
  const factsList = element(context.document, "dl", undefined, "opengdd-author-section-facts-list");
  factsList.append(element(context.document, "dt", INSPECTOR_COPY.sectionLevel),
    element(context.document, "dd", String(entity.level)), element(context.document, "dt", INSPECTOR_COPY.sectionFile),
    element(context.document, "dd", entity.file, "opengdd-author-identifier"));
  const facts = referenceGroup(context, { label: INSPECTOR_COPY.sectionFacts,
    help: INSPECTOR_COPY.sectionFactsHelp, rows: [factsList] });
  facts.dataset.sectionFacts = "";

  const time = referenceGroup(context, { key: "time-mode", label: INSPECTOR_COPY.sectionTimeMode,
    help: entity.mode ? INSPECTOR_COPY.sectionTimeModeHelp : INSPECTOR_COPY.sectionNoTimeMode,
    rows: entity.mode ? [element(context.document, "span", `[${entity.mode}]`)] : [] });
  time.dataset.sectionTimeMode = "";
  time.tabIndex = -1;

  const sites = context.internal.entry?.()?.citations ?? [];
  const rows = sites.length ? locationRows(context, sites, { reveal: site => context.internal.revealLocation(site) }) : undefined;
  for (const row of rows?.querySelectorAll("button") ?? []) row.dataset.sectionCitation = "";
  const citations = referenceGroup(context, { label: INSPECTOR_COPY.sectionCitations,
    help: sites.length ? INSPECTOR_COPY.sectionCitationsHelp : INSPECTOR_COPY.sectionNoCitations,
    rows: rows ? [rows] : [] });
  citations.dataset.sectionCitations = "";
  return [facts, sectionRulesets(context, entity), time, citations];
}

export function renameSection(context, entity, anchor) {
  return openTextEditDialog({
    document: context.document, anchor, label: INSPECTOR_COPY.sectionRenameQuestion,
    initial: entity.title, confirm: INSPECTOR_COPY.rename, cancel: INSPECTOR_COPY.cancel,
    validate: value => value ? "" : INSPECTOR_COPY.sectionHeadingRequired,
    async submit(_value, raw) {
      const current = currentEntity(context, entity);
      const title = raw.trim();
      const next = markdownHeadingSlug(title);
      if (!SLUG.test(next)) throw new Error(INSPECTOR_COPY.sectionAnchorInvalid);
      const plan = context.services.references.planRename(current.address, next);
      if (plan.safety !== "complete") throw new Error(plan.reason);
      const replacement = headingReplacement(current, title, next);
      const edits = [{ range: current.range, text: replacement }];
      const result = await context.services.references.applyRename({ ...plan, headingEdit: {
        address: current.address, file: current.file, edits
      } });
      if (!result.applied) throw new Error(result.reason);
      const lineLength = replacement.length;
      context.services.selection.select({ kind: "section", name: next, file: current.file,
        range: { start: { line: current.line, character: 0 }, end: { line: current.line, character: lineLength } },
        extent: current.extent });
    }
  });
}

export function routeSectionFinding(finding, entity) {
  if (finding.file !== entity.file) return false;
  if (["RULESET_INITIAL", "RULESET_TAG_SHAPE"].includes(finding.code)) {
    return Number.isInteger(finding.line) && finding.line - 1 >= entity.line && finding.line - 1 < entity.sectionEndLine
      ? "rulesets" : false;
  }
  if (finding.code === "MODE_TAG_DANGLING") return finding.line === entity.line + 1 ? "time-mode" : false;
  if (finding.code === "CHAPTER_NAME_RESERVED") return "header";
  return null;
}
