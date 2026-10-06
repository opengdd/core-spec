import { WIDGET_COPY } from "./copy/widget-copy.mjs";

// The validator's messages are written for tools. Where a designer meets one
// about open numbers, the tool shows a plain sentence instead; the finding
// itself (code, message, data) is unchanged, so routing still reads it.
const NO_GUESS_FIELD = /^(.+) must be an? (integer|number), got null$/u;
const DANGLING_NUMBER = /^prose citation `([^`]+)` does not resolve to a tuning\.json key(.*)$/su;

export function findingMessage(finding) {
  const message = String(finding?.message ?? "");
  if (finding?.code === "COLLECTION_RECORD_SCHEMA") {
    const noGuess = NO_GUESS_FIELD.exec(message);
    if (noGuess) return WIDGET_COPY.openFieldNoGuess(noGuess[1], noGuess[2] === "integer");
  }
  if (finding?.code === "PROSE_CITATION_DANGLING") {
    const dangling = DANGLING_NUMBER.exec(message);
    if (dangling) return WIDGET_COPY.citationNotANumber(dangling[1], dangling[2]);
  }
  return message;
}

export const findingLocation = finding => `${finding.file}${Number.isInteger(finding.line) ? `:${finding.line}` : ""}`;

export const findingAccessibleName = finding => {
  const severity = finding.severity === "error" ? "error" : finding.severity === "hint" ? "hint" : "warning";
  const location = findingLocation(finding);
  return `${WIDGET_COPY.problemRow(severity, findingMessage(finding))}${location ? `, ${location}` : ""}`;
};
