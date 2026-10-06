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

// Skip all-digit tags and bracket tokens followed by a link target.
export function headingModeTags(text) {
  return [...text.matchAll(/\[([A-Za-z0-9_-]+)\](?![([])/g)]
    .filter(found => !/^\d+$/.test(found[1]));
}

export function unfencedLines(text) {
  const result = [];
  let fence;
  text.split(/\r?\n/).forEach((line, index) => {
    const quote = quoteLine(line);
    if (fence && quote.depth < fence.depth) fence = undefined;
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(quote.text);
    if (fence) {
      if (quote.depth === fence.depth && marker && marker[1][0] === fence.char
        && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return;
    }
    if (marker) {
      fence = { depth: quote.depth, char: marker[1][0], length: marker[1].length };
      return;
    }
    result.push({ line: index + 1, text: line });
  });
  return result;
}

function quoteLine(line) {
  const match = /^(\s*(?:>\s*)+)(.*)$/.exec(line);
  return match ? { depth: (match[1].match(/>/g) ?? []).length, text: match[2] }
    : { depth: 0, text: line };
}

// SPEC §2 / §2c: every tag covers its line and the uninterrupted quote
// at its own depth. A bare `>` continues a top-level quote. A nested quote
// ends when its depth decreases. Delegated tag-line text is passage text;
// Personalization and Ruleset tag-line text identifies the question or ruleset.
// Ranges use zero-based indices and an exclusive end, even without a heading.
export function authorityTagScopes(lines) {
  const scopes = [];
  for (const item of unfencedLines(lines.join("\n"))) {
    const index = item.line - 1;
    const quote = quoteLine(item.text);
    const match = quote.depth && /^(DELEGATED|PERSONALIZATION|RULESET):\s*(.*)$/.exec(quote.text);
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && quoteLine(lines[end]).depth >= quote.depth) end += 1;
    const id = match[2].split(/\s/)[0] || undefined;
    scopes.push({
      start: index, end, line: index + 1,
      tag: match[1], depth: quote.depth, content: match[2],
      level: match[1].toLowerCase(),
      label: match[1] === "DELEGATED" ? "Delegated" : match[1] === "PERSONALIZATION" ? "a Personalization" : "a Ruleset",
      question: match[1] === "PERSONALIZATION" ? id : undefined,
      ruleset: match[1] === "RULESET" ? id : undefined,
      initial: match[1] === "RULESET" && /\s+\(initial\)\s*$/.test(match[2])
    });
  }
  return scopes;
}

// Ruleset applicability and authority are independent. Within either kind,
// the deepest active quote decides. Same-depth authority overlap is invalid.
export function tagScopeAt(scopes, index, kind = "authority") {
  return scopes.filter(scope => index >= scope.start && index < scope.end
    && (kind === "ruleset" ? scope.level === "ruleset" : scope.level !== "ruleset"))
    .sort((left, right) => right.depth - left.depth)[0];
}
