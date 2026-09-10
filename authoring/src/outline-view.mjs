import { WIDGET_COPY } from "./copy/widget-copy.mjs";
import { CONTRACT_PACK_FILED_CODES, contractFindingOwner } from "./contracts.mjs";

const mechanismIdentity = mechanism => `mechanism\0${mechanism.id}\0${mechanism.file ?? ""}`;
const copyLocation = location => ({
  identity: location.identity,
  name: location.name,
  file: location.file,
  range: location.range ? structuredClone(location.range) : undefined,
  revision: location.revision
});

function ownerFor(routable, entities, mechanisms) {
  if (routable.entity) return entities.find(entity => entity.identity === routable.identity);
  if (routable.kind === "collection-record") {
    return entities.find(entity => entity.kind === "collection" && routable.file.startsWith(entity.location));
  }
  if (routable.kind === "contract-value") {
    return entities.find(entity => entity.kind === "contract" && entity.file === routable.file);
  }
  if (routable.kind === "color") {
    return entities.filter(entity => entity.kind === "palette" && routable.name.startsWith(`${entity.name}.`))
      .sort((left, right) => right.name.length - left.name.length)[0];
  }
  if (routable.kind === "ruleset") {
    return entities.filter(entity => entity.kind === "section" && entity.file === routable.file
      && entity.range.start.line <= routable.range.start.line)
      .sort((left, right) => right.range.start.line - left.range.start.line)[0];
  }
  return mechanisms.find(mechanism => mechanism.id === routable.mechanism);
}

function mechanismForFile(file, mechanisms) {
  const exact = mechanisms.find(mechanism => mechanism.file && mechanism.file === file);
  if (exact) return exact;
  if (file.startsWith("collections/")) return mechanisms.find(mechanism => mechanism.id === "collections");
  if (file.startsWith("contracts/")) return mechanisms.find(mechanism => mechanism.id === "contracts");
  if (file.endsWith(".md")) return mechanisms.find(mechanism => mechanism.id === "sections");
  return undefined;
}

function findingAddress(finding) {
  const message = String(finding.message ?? "");
  const clock = /\bclock\s+"([A-Za-z0-9_-]+)"/u.exec(message);
  if (clock) return `clocks.${clock[1]}`;
  const rule = /^rule\s+"([A-Za-z0-9_.-]+)"/u.exec(message);
  if (rule) return `rules.${rule[1]}`;
  // Schema findings name their target as a JSON pointer ("#/mood/paper-quiet/anti").
  const pointer = /^#\/([A-Za-z0-9_.\/-]+)/u.exec(message);
  if (pointer) return pointer[1].split("/").join(".");
  return /^([A-Za-z0-9_.-]+)(?=[ =:"]|$)/u.exec(message)?.[1];
}

function addressRoutable(finding, routables) {
  const address = findingAddress(finding);
  if (!address) return undefined;
  const addresses = [address];
  // A personalization pointer names its question by its declared array index.
  // The analyzer can omit broken id-less questions, so routable position is
  // not a safe substitute for that index.
  const questionIndex = finding.file === "personalization.json" ? /^questions\.(\d+)(?:\.|$)/u.exec(address)?.[1] : undefined;
  if (questionIndex !== undefined) {
    const question = routables.find(routable => routable.kind === "question" && routable.file === finding.file
      && routable.declaredIndex === Number(questionIndex));
    if (question) return question;
  }
  if (finding.file === "tuning.json") {
    const bare = /^(?:values|ranges|rules)\.(.+)$/u.exec(address)?.[1];
    if (bare) addresses.push(bare);
  }
  return routables.flatMap(routable => {
    const names = [routable.name, `${routable.kind}.${routable.name}`];
    const length = Math.max(0, ...addresses.flatMap(candidate => names
      .filter(name => candidate === name || candidate.startsWith(`${name}.`))
      .map(name => name.length)));
    return length ? [{ routable, length }] : [];
  }).sort((left, right) => right.length - left.length)[0]?.routable;
}

export function buildOutlineModel({
  authoringView,
  validation,
  problemsOnly,
  menuOpen,
  selection,
  folds
}) {
  const viewMechanisms = authoringView?.mechanisms ?? [];
  const mechanisms = viewMechanisms.map(viewMechanism => {
    const copy = WIDGET_COPY.outlineMechanisms[viewMechanism.id];
    const entities = viewMechanism.entities.map(entity => ({
      ...entity,
      mechanism: viewMechanism.id,
      citations: entity.citations.map(copyLocation),
      findings: [],
      sameNumberWarnings: (authoringView?.sameNumberWarnings ?? []).filter(warning => entity.kind === "value"
        && entity.file === "tuning.json" && entity.name === warning.key).map(warning => ({ ...warning }))
    }));
    return {
      ...copy,
      id: viewMechanism.id,
      file: viewMechanism.file ?? "",
      identity: mechanismIdentity(viewMechanism),
      findings: [],
      entities,
      expanded: !folds.has(`mechanism-${viewMechanism.id}`)
    };
  });
  const entities = mechanisms.flatMap(mechanism => mechanism.entities);
  const routables = authoringView?.routables ?? [];
  const findings = validation.run?.findings ?? [];
  const mechanismSet = new Set(mechanisms);
  const findingRow = index => {
    const finding = findings[index];
    return {
      index,
      severity: finding.severity,
      message: finding.message,
      file: finding.file,
      line: finding.line
    };
  };

  const attach = (target, index) => {
    if (target && !target.findings.some(item => typeof item === "object" ? item.index === index : item === index)) {
      target.findings.push(mechanismSet.has(target) ? findingRow(index) : index);
    }
    return Boolean(target);
  };
  const ownerOf = routable => ownerFor(routable, entities, mechanisms);

  for (const [index, finding] of findings.entries()) {
    if (finding.code === "CLOCKS_ADVANCES_DISJOINT") {
      const named = /\badvanced by both\s+"([A-Za-z0-9_-]+)"\s+and\s+"([A-Za-z0-9_-]+)"/u
        .exec(String(finding.message ?? ""))?.slice(1) ?? [];
      let attached = false;
      for (const name of named) {
        const clock = entities.find(entity => entity.kind === "clock"
          && (entity.name === name || entity.name === `clocks.${name}`));
        attached = attach(clock, index) || attached;
      }
      if (attached) continue;
    }
    if (String(finding.code).startsWith("RUNTIME_")) {
      const address = finding.address ?? /"(runtime\.[A-Za-z0-9_.-]+)"/u.exec(String(finding.message ?? ""))?.[1];
      const runtime = routables.find(routable => routable.kind === "runtime" && routable.name === address);
      if (attach(runtime ? ownerOf(runtime) : mechanisms.find(mechanism => mechanism.id === "time"), index)) continue;
    }
    if (finding.code === "COLLECTION_UNCITED") {
      const collection = entities.find(entity => entity.kind === "collection" && entity.location === finding.file);
      if (attach(collection, index)) continue;
    }
    if (CONTRACT_PACK_FILED_CODES.includes(finding.code)) {
      const owner = contractFindingOwner(finding, entities.filter(entity => entity.kind === "contract"), findings);
      if (attach(owner, index)) continue;
    }
    if (String(finding.code).startsWith("CONTRACT_")) {
      const contract = entities.find(entity => entity.kind === "contract" && entity.file === finding.file);
      if (attach(contract ?? mechanisms.find(mechanism => mechanism.id === "contracts"), index)) continue;
    }
    const fileOwned = routables.find(routable => routable.kind === "collection-record" && routable.file === finding.file)
      ?? entities.find(entity => entity.kind === "contract" && entity.file === finding.file);
    if (fileOwned && attach(ownerOf(fileOwned), index)) continue;

    const line = Number.isInteger(finding.line) ? finding.line - 1 : null;
    const inRange = routables.filter(routable => routable.file === finding.file && line !== null
      && line >= routable.range.start.line && line <= routable.range.end.line);
    if (inRange.length) {
      // The smallest span wins; at an equal span a section loses to the
      // declaration sharing its heading (an acceptance test, a contract), since
      // the section is the container and the other is the thing the finding names.
      const span = routable => routable.range.end.line - routable.range.start.line;
      inRange.sort((left, right) => span(left) - span(right)
        || Number(left.kind === "section") - Number(right.kind === "section"));
      if (attach(ownerOf(inRange[0]), index)) continue;
    }

    if (line === null) {
      // Some package-wide checks are filed against the build plan but lead
      // with the address of the declaration that owns the problem.
      const addressed = addressRoutable(finding, routables);
      if (addressed && attach(ownerOf(addressed), index)) continue;
    }

    const fileRoutables = routables.filter(routable => routable.file === finding.file
      || routable.citations.some(citation => citation.file === finding.file));
    if (fileRoutables.length) {
      const nearestLine = routable => {
        const locations = routable.file === finding.file ? [routable.range.start.line]
          : routable.citations.filter(citation => citation.file === finding.file).map(citation => citation.range.start.line);
        return line === null ? 0 : Math.min(...locations.map(location => Math.abs(location - line)));
      };
      fileRoutables.sort((left, right) => nearestLine(left) - nearestLine(right));
      const routedMechanism = mechanisms.find(mechanism => mechanism.id === fileRoutables[0].mechanism);
      if (attach(routedMechanism, index)) continue;
    }
    attach(mechanismForFile(finding.file ?? "", mechanisms), index);
  }

  for (const mechanism of mechanisms) {
    if (mechanism.id !== "tuning") continue;
    const values = mechanism.entities.filter(entity => entity.kind === "value");
    const rules = mechanism.entities.filter(entity => entity.kind === "rule");
    const prefixes = new Map();
    for (const value of values) {
      const prefix = value.name.split(".")[0];
      const branch = prefixes.get(prefix) ?? { id: `tuning-${prefix}`, label: prefix, entities: [] };
      branch.entities.push(value);
      prefixes.set(prefix, branch);
    }
    mechanism.branches = [...prefixes.values()].sort((left, right) => left.label.localeCompare(right.label));
    if (rules.length) mechanism.branches.push({ id: "tuning-rules", label: WIDGET_COPY.tuningRulesBranch, entities: rules });
    for (const branch of mechanism.branches) branch.expanded = !folds.has(`branch-${branch.id}`);
  }

  // A selection that names something the tree does not list (a record, a
  // contract value, a colour) highlights the row that owns it.
  const rowIdentities = new Set([...mechanisms.map(mechanism => mechanism.identity), ...entities.map(entity => entity.identity)]);
  const selectedRoutable = selection && !rowIdentities.has(selection) ? routables.find(routable => routable.identity === selection) : undefined;
  const resolvedSelection = selectedRoutable ? (ownerOf(selectedRoutable)?.identity ?? selection) : selection;

  return {
    problemsOnly,
    menuOpen,
    selection: resolvedSelection,
    noProblems: problemsOnly && validation.status === "ready" && !findings.length,
    mechanisms
  };
}
