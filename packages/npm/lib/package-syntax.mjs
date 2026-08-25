// Pure syntax helpers shared by conformance and authoring tools.

export const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const slash = value => String(value).replaceAll("\\", "/");
export const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function markdownSlug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function unfencedLines(text) {
  const result = [];
  let fenced = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (!fenced) result.push({ line: index + 1, text: line });
  });
  return result;
}

// SPEC §3: "A backticked `palette.` token inside a fence continuation line is
// chapter prose like any other, so it resolves and it reaches." A §9.10
// direction fence is a fenced block, so `unfencedLines` drops all of it; this
// returns the part of it the spec calls chapter prose, and nothing else.
//
// The split follows §9.10's fence grammar exactly. A **citation line** carries
// the entry's dotted path in inline code and is fence grammar: it is resolved
// by the fence machinery (DIRECTION_FENCE_DANGLING), so it is deliberately not
// returned here and never double-scanned. A **continuation line** is indented
// by exactly two spaces and carries free rationale prose; one or more of them
// may follow a citation line, and the run ends at the next citation line,
// label line, or blank line. Only those lines are returned.
export function directionFenceContinuationLines(text) {
  const result = [];
  let fenced = false;
  let direction = false;
  let afterCitation = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      direction = fenced ? false : /^\s*```direction/i.test(line);
      fenced = !fenced;
      afterCitation = false;
      return;
    }
    if (!fenced || !direction) return;
    if (/^- `[^`]+`\s*$/.test(line)) { afterCitation = true; return; }
    if (afterCitation && /^ {2}\S/.test(line)) { result.push({ line: index + 1, text: line }); return; }
    afterCitation = false;
  });
  return result;
}
