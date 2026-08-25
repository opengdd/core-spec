export function rollUpCollectionFindings(artifacts) {
  for (const collection of artifacts.filter(artifact => artifact.kind === "collection")) {
    collection.findings = [...new Set([
      ...collection.findings,
      ...(collection.children ?? []).flatMap(child => child.findings)
    ])];
  }
  return artifacts;
}
