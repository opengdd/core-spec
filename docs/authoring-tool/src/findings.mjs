import { WIDGET_COPY } from "./copy/widget-copy.mjs";

export const findingLocation = finding => `${finding.file}${Number.isInteger(finding.line) ? `:${finding.line}` : ""}`;

export const findingAccessibleName = finding => {
  const severity = finding.severity === "error" ? "error" : "warning";
  const location = findingLocation(finding);
  return `${WIDGET_COPY.problemRow(severity, String(finding.message))}${location ? `, ${location}` : ""}`;
};
