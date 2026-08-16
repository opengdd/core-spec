# OpenGDD changelog

## v0.5 draft — 2026-08-12

OpenGDD v0.5 renames named objects to **symbols** and defines symbol identity
as scoped, while keeping descriptors as format-owned shapes and reserving
**collection** for §1b. The `tuning.json.values` and
`opengdd-build.json.resolved_tuning.values` members become `tunables` and
`resolved_tuning.tunables` in a hard version cut. The names now express the
change-authority axis; numeric-only tuning remains because rebalancing is
change by degree.

v0.5 also separates the platform family from the renderer. §3's
`target.platform` names the delivery target and accepts `web-2d` and `web-3d`.
Rendering technique remains builder craft, while `opengdd-build.json` can
carry an optional free-text `renderer` declaration for a particular build.
Rendered-capture certification for 3D remains outside v0.5 because the only
defined capture profile is `web-1`.

### Migrating from v0.4

- Rename `tuning.json`'s `values` member to `tunables`.
- Rename `opengdd-build.json`'s `resolved_tuning.values` member to
  `resolved_tuning.tunables`.
- Replace the term **named object** with **symbol** in format-facing prose and
  tools.

This is a hard version cut: the v0.5 validator rejects the old `values`
members rather than migrating them implicitly.

### Conformance layers and certification status — 2026-08-16

A draft revision adds §2d, which names v0.5's two normative conformance
subjects — package conformance and build-record conformance — and declares
build certification **experimental** in v0.5. The acceptance-test execution
semantics, the complete `verification` descriptor machine grammar, the
harness hash audit, and the judged-direction gate belong to the experimental
certification protocol, whose draft is published with the conformance suite
as `conformance/CERTIFICATION.md` and is now referenced from the
specification. v0.5 defines no normative certification verdict. Carrier
shapes are unchanged: no schema member was added, removed, or made optional,
and existing conforming packages and build records remain conforming. Fixed
authority is unchanged; passing acceptance tests remains necessary evidence
and never sufficient. Standardizing certification — including binding the
complete source-package bytes into build receipts — continues as a v0.6
track.

An independent re-review of the same revision drove a hardening pass: the
package- and record-conformance definitions in §2d now name their exact
schema and check sets, package-level MUSTs are defined as those decidable
from package bytes alone, the build record is defined as a completion claim
so honest failure reporting travels through §2b ambiguity reports, the
fixture-reach obligations in §9.5 and §9.11 are typed as experimental-audit
obligations rather than validation failures, and the draft certification
protocol now carries the experimental marking and an RFC 8785-aligned
byte-reproducible canonical serialization.

A second review round then closed the implementability gaps: §6 states the
machine-checked surface grammar for acceptance-test headings and types phase
structure as a prose obligation, §5 and §7 require `choice` answers and
defaults to name declared option ids (with a matching `BUILD_ANSWER_OPTION`
validator check), §7 states the error-versus-warning reporting contract for
its cross-document checks, §2d distinguishes machine-decidable rules from
prose obligations and defines the severity vocabulary, the remaining
per-build evaluations (§1c predicates, §4/§4a defaults-versus-snapshot,
§6a `claim_scale`) are each assigned a conformance layer, and the
certification protocol restricts hash payloads to I-JSON, defines
`result_hash` as the digest of `payload.file`'s exact canonical bytes, and
adds Fixed-statement deviation and narrowed evidence to its verdict-blocking
list.

## v0.4 draft — 2026-08-09

v0.4 adds a structured art-direction surface while preserving the designer's
ability to communicate through prose. It also adds a portable grid-layout
encoding and more complete build provenance.

- **Direction block and schema (§9):** a package can declare `direction.json`
  through `manifest.json.build.direction`. The block carries pillars, mood,
  anti-references, constraints, viewing contexts, invariants, and a narrow
  material/wet-motion vocabulary. Claim paths bind to their viewing context;
  checked constraints cite acceptance tests. Whole-direction judged status is
  recordable but remains `pending` in v0.4.
- **Certified palette pins (§§7 and 9):** an exact palette constraint can opt
  into build evidence with `certify: true`. The source path, captured value,
  and cross-document requirements are schema- and validator-checked.
- **Mood descriptors (§8a):** format-owned mood objects carry intent,
  references, anti-references, palette roles, behaviors, and an optional inert
  audio sketch. References identify exactly which annotated properties are
  borrowed. Media paths, licenses, hashes, and byte signatures are validated.
- **`parallel-string-layers-1` (§7a):** a closed encoding for rectangular,
  same-shape string layers with alphabet, role, dimensions, and fill policy.
  It is a layout carrier, not a universal puzzle-solver interface.
- **Build provenance (§7):** `opengdd-build.json` gains optional
  `capture_profile`, `resources`, and `direction_result` members. Resource
  digests cover one explicitly named artifact; presence is a disclosure, not
  a claim that every consumed resource is listed.
- **Audio direction (§10):** a non-normative planning annex. It creates no
  validation or certification consequence in v0.4.
- **Prose/schema alignment:** cardinalities, identifier grammar, claim classes,
  certified-pin ownership, and cross-document presence rules are stated
  consistently in the specification, schemas, and validator.

### Migrating from v0.3

Most v0.4 constructs are additive. A package that adopts none of them normally
needs only a version bump, subject to two namespace collisions that v0.3
deliberately left open:

- **`build.direction`:** v0.3 reserved this member but did not validate the
  target. In v0.4 it names a real direction block and the referenced file must
  exist and validate.
- **`parallel-string-layers-1`:** a v0.3 package that independently used this
  format id for another shape must rename its local format before upgrading.

Change the source manifest's `opengdd` value from `"0.3"` to `"0.4"`.
Any retained `opengdd-build.json` being certified against v0.4 must also use
`"0.4"`; a historical build record can remain associated with v0.3.

## v0.3 draft — 2026-08-08

v0.3 adds reusable structure for graphs, rule-state systems, mixed clock
regimes, macroscopic material simulation, and build evidence.

- **Declared graph edge sets (§1c):** typed cross-record edges plus the
  `opengdd-graph-1` static-lint predicates for existence closure, acyclicity,
  reciprocity, bounded reachability, and monotone attributes.
- **Ruleset state (§2c):** finite rule registries, applicability tags, closed
  hook and derived-predicate universes, and state bindings. Open-ended
  player-authored rule vocabularies remain outside v0.x certification.
- **Clocks and resolution regimes (§4b):** optional clock behavior across
  declared regimes and standard replay transitions. Atomic transaction and
  snapshot semantics remain deferred.
- **Material-simulation envelope (§6a):** declared minimum feature width,
  observation schedule, interaction table, macroscopic measures, and bounded
  outcome models. It does not certify sub-envelope or universal-emergence
  claims.
- **Solver-interface problem statement (§7a):** documents the open layout and
  predicate questions and provides a finite-domain exhaustive-search idiom;
  it does not lock a universal puzzle profile.
- **Build-manifest schema (§7):** `opengdd-build.json` gains a schema and
  validator-level cross-document checks for identity, parties,
  personalization, resolved tuning, evidence payload, digest, and acceptance
  counts.
- **`build.direction` reserved:** namespace is set aside for the v0.4
  direction block and remains inert in v0.3.

### Migrating from v0.2

Package-side constructs are additive; a package that declares none of them is
valid after changing manifest `opengdd` from `"0.2"` to `"0.3"`.

Builds certifying against v0.3 must ship an `opengdd-build.json` matching the
new schema: personalization answers, both resolved-tuning sections, and the
evidence algorithm, digest, payload, and acceptance counts. Existing v0.2
build records remain associated with v0.2.

## v0.2 draft — 2026-08-06

- **Numeric authority homes:** separates mutable `values`, Fixed `constants`,
  per-content facts, and verification inputs.
- **Typed expressions:** adds closed `opengdd-expr-1` expressions for declared
  numeric, Boolean, finite-list, and runtime-state operations.
- **Structured-content envelope:** adds declared collections, format ids,
  stable record ids, reference closure, and authority.
- **Verification classes:** standardizes `scenario`, `property`,
  `exhaustive-search`, and `static-lint`, including bounded evidence.
- **PRNG stream addresses:** defines canonical nested unit and named-stream
  addressing over FNV-1a-derived Mulberry32 sub-seeds.
- **Numeric personalization:** adds ordered target operations, bound policy,
  and a resolved tuning snapshot in `opengdd-build.json`.
- **Commerce profile:** moves licensing, split, and derivation metadata into an
  optional profile used only when relevant to third-party building or listing.
- **Package safety:** defines path normalization and archive traversal guards.

The general grid-replay solver profile is not part of v0.2 and remains
deferred.

### Migrating from v0.1

v0.2 is a breaking revision and does not accept a v0.1 package unchanged.

- Change manifest `opengdd` from `"0"` to `"0.2"`.
- Move top-level `license`, `split`, and any `derived_from` value into the
  optional `commerce` block.
- Declare legacy structured-content directories as §1b collections when they
  need machine discovery and validation.
- Keep mutable tuning in `values`, move Fixed numeric values to `constants`,
  and keep metadata under `meta`.
- Replace personalization notes that change numeric tuning with explicit
  `tuning_overrides` or numeric-question resolution operations.
