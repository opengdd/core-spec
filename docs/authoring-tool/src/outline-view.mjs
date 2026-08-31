import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { CONTRACT_PACK_FILED_CODES, contractFindingOwner } from "./contracts.mjs";
import { rollUpCollectionFindings } from "./outline.mjs";

export function buildOutlineModel({
  authoringView,
  validation,
  problemsOnly,
  menuOpen,
  selection,
  collectionCollapsed,
  fallbackOpen
}) {
  const viewGroups = authoringView?.groups ?? [];
  const copyArtifact = (entry, outlineGroup, parentIdentity = "") => ({
    ...entry,
    outlineGroup,
    parentIdentity,
    citations: entry.citations.map(citation => ({ ...citation })),
    findings: [],
    sameNumberWarnings: (authoringView?.sameNumberWarnings ?? []).filter(warning => entry.kind === "value"
      && entry.file === "tuning.json" && entry.name === warning.key).map(warning => ({ ...warning })),
    children: (entry.children ?? []).map(child => copyArtifact(child, outlineGroup, entry.identity)),
    expanded: entry.kind === "collection" ? !collectionCollapsed.has(entry.name) : undefined
  });
  const artifacts = viewGroups.flatMap(group => group.entries.map(entry => copyArtifact(entry, group.id)));
  const flatArtifacts = artifacts.flatMap(artifact => [artifact, ...(artifact.children ?? [])]);
  const fallback = new Map(viewGroups.map(group => [group.id, []]));
  const findings = validation.run?.findings ?? [];
  for (const [index, finding] of findings.entries()) {
    if (finding.code === "COLLECTION_UNCITED") {
      const collection = flatArtifacts.find(artifact => artifact.kind === "collection" && artifact.location === finding.file);
      if (collection) {
        collection.findings.push(index);
        continue;
      }
    }
    if (CONTRACT_PACK_FILED_CODES.includes(finding.code)) {
      const owner = contractFindingOwner(finding,
        flatArtifacts.filter(artifact => artifact.kind === "contract"), findings);
      if (owner) {
        owner.findings.push(index);
        continue;
      }
    }
    if (String(finding.code).startsWith("CONTRACT_")) {
      const contract = flatArtifacts.find(artifact => artifact.kind === "contract" && artifact.file === finding.file);
      if (contract) {
        contract.findings.push(index);
        continue;
      }
      if (fallback.has("contracts")) {
        fallback.get("contracts").push(index);
        continue;
      }
    }
    const line = Number.isInteger(finding.line) ? finding.line - 1 : null;
    const inRange = flatArtifacts.filter(artifact => artifact.kind !== "collection" && artifact.file === finding.file && line !== null
      && line >= artifact.range.start.line && line <= artifact.range.end.line);
    if (inRange.length) {
      inRange.sort((left, right) => (left.range.end.line - left.range.start.line) - (right.range.end.line - right.range.start.line));
      inRange[0].findings.push(index);
      continue;
    }
    const fileArtifacts = flatArtifacts.filter(artifact => (artifact.kind !== "collection" && artifact.file === finding.file)
      || artifact.citations.some(citation => citation.file === finding.file));
    if (!fileArtifacts.length) continue;
    const nearestLine = artifact => {
      const locations = artifact.file === finding.file ? [artifact.range.start.line]
        : artifact.citations.filter(citation => citation.file === finding.file).map(citation => citation.range.start.line);
      return line === null ? 0 : Math.min(...locations.map(location => Math.abs(location - line)));
    };
    fileArtifacts.sort((left, right) => nearestLine(left) - nearestLine(right));
    fallback.get(fileArtifacts[0].outlineGroup)?.push(index);
  }
  // A child problem also belongs to its collection for filtering and the
  // parent badge, while the record keeps its own normal problem behavior.
  rollUpCollectionFindings(flatArtifacts);
  for (const palette of flatArtifacts.filter(artifact => artifact.kind === "palette")) {
    palette.findings = [...new Set([...palette.findings, ...palette.children.flatMap(child => child.findings)])];
  }
  return {
    problemsOnly,
    menuOpen,
    selection,
    noProblems: problemsOnly && validation.status === "ready" && !(validation.run?.findings.length),
    groups: viewGroups.map(viewGroup => {
      const copy = WIDGET_COPY.outlineGroups.find(group => group.id === viewGroup.id);
      return {
        ...copy,
        artifacts: artifacts.filter(artifact => artifact.outlineGroup === viewGroup.id),
        fallback: fallback.get(viewGroup.id) ?? [],
        fallbackOpen: fallbackOpen.has(viewGroup.id)
      };
    })
  };
}
