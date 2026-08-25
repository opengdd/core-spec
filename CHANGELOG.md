# OpenGDD changelog

## v0.6 working draft — 2026-08-18

**Collections declare by presence (decisions 32 and 33, 2026-08-23).** §1b
is rewritten twice in one day, the second pass simplifying the first. The
manifest `content` array is gone, and with it `format`, `defined_in`,
`source`, the catalog/items duality and the three-shape catalog envelope,
`id_field`, the members list, the collection `authority` field, per-record
authority, and the collection `instance` binding. The final form: a
collection is a folder with record files in it, under the reserved
`collections/` package-root directory — the folder name the collection id,
the filename each record's id and address, the body pure designer data.
Everything else is opt-in: `_collection.json` is an optional label whose
one field `record` is a record schema in the closed field grammar contract
cores use (validated by the new `collection.schema.json`; with a schema
every record is checked, without one records are free-form and the format
says so); `grid` joins the field grammar as §1b's dialect, replacing the
old §7a `layout` block and its one-value `cell_unit` field. Drawers are
Fixed spec data, so no drawer authority exists and the interim
`> COLLECTION:` prose tag of decision 32 is retired (a survivor reports
itself); the §1b prose-inference reference scan is deleted with it.
`collections` is a reserved prose first segment (`collections.<drawer>`,
`collections.<drawer>.<record>`, dangling hard), a drawer nothing reaches
is a warning, and `collections:<drawer>:count` replaces the retired
`content:<id>:<pointer>:count`. §10.7 binds rows from the instance file's
`rows` map, by inline array or a `collections/<drawer>` source string,
with double binding and per-record dissent unspellable and a bound drawer
taking the core's schema. §6 document-check artifacts may name a drawer
with a trailing slash. Schemas: `manifest.schema.json` shrinks;
`collection.schema.json` is new. Evidence:
`forge/findings/collections-prototype-2026-08-23.md` (the decision-32
prototype), `forge/findings/collections-final-form-2026-08-23.md` (the
decision-33 pass), and the review records beside them.

The v0.6 working draft withdraws constructs whose abstractions are still
emerging — where this format invented an encoding that no settled industry
practice and no real package has yet confirmed. Withdrawn, preserved with
their research evidence, and eligible to return when their abstraction
settles or a real package exercises them: the material-simulation envelope
profile (former §6a) and `verification_profiles`; the motion rubric (former
§9.8);
certified palette-pin build evidence (`direction_result.certified_pins`) and
the color-constraint `must_match` field — exact color constraints remain as
`tolerance: 0` pins, verified through covering acceptance tests; ruleset-state
rule hooks, derived predicates,
and identity sets (§2c — `rulesets` and `> RULESET:` tags remain); the
open solver profile and the deduction solution (§7a — the
`parallel-string-layers-1` encoding remains); and the audio direction
annex (former §10). §9.10's prose restatement of `direction.schema.json` is
replaced by a pointer: the schema is authoritative; the fence grammar and
completeness rules remain normative. Declared graph edge sets (§1c) remain in
core: tech trees, recipe chains, and prerequisite graphs are
industry-settled abstractions with decades of practice behind them.

A standing rule accompanies the withdrawal: patterns proven by industry
practice belong in the core — the research program exists to establish
exactly that, and internal test coverage cannot overrule it. Withdrawal
applies to abstractions this format invented that remain unconfirmed by
settled practice or real packages. A construct with neither industry
grounding nor usage is deleted.

### Attributable runtime evidence and newcomer repair — 2026-08-22

Runtime build evidence now names its runner id and version whenever the source
package contains a scenario, property, exhaustive search, replay, target, or
direction claim. Build evidence also carries one plain-language observation
context for each measured direction constraint. These fields identify the
profile relative to which a pass is claimed; they do not standardize an engine
or turn the experimental audit into a core verdict.

Sampled aggregate direction claims now use the ordinary aggregate-property
test shape as a checked mirror: `metric`, `aggregation`, and `threshold` remain
authoritative in `direction.json` and must match the covering test exactly.
Two living candidate packages split their per-sample and incompatible
aggregate claims into honest separate tests.

The public beginner path now leads with the five-file kernel, uses the
canonical `tuning.json` and `05-build-plan.md` paths without obsolete manifest
redirects, links the maintained Garden Snake package, shows a complete small
build plan, and ends with an offline validation and handoff checklist. A
generated-route guard keeps the handbook and downloadable package aligned with
their sources. The fantasy-block prose now says unambiguously that the minimum
is one player-fantasy line plus the required `Feel:` and anti-reference lines.

### Terminology pass (breaking)

v0.6 renames the format's vocabulary to words a designer already owns. The
final spellings after the draft's cold-read rounds are: regime → **mode**;
fixture → **replay** (the test member is `replay`; recorded footage remains a
**capture**); oracle → **verdict**; witness → **solution**; closure →
**completeness**; discharge → **satisfy**; symbol → **identifier**; deciding
lint → **check**, advisory lint → **advice**; JSON *member*/*key* → **field**
(a *key* is a dotted lookup identifier); §5 `target` → `key`; "build
contract" → **entry points**; "verification descriptor" → **test block**;
and the former §9.9 fidelity ladder and descent rule → **precision levels:
described → bounded → exact**. The attempted intermediate term *sheet* was dropped
without replacement. The fenced infostring is `test`, and a test block's
kind field is `type`, not `class`.

Data: direction `invariants` → `must_keep` and its fence label `INVARIANTS:`
→ `MUST-KEEP:` (`tuning.json` `invariants` is unchanged); `open_axes` →
`may_vary`; `population` → `applies_to`; the §9.5 `coverage` shape →
`sampling`, sharing §6's exhaustive/per-sample/aggregate verdict discipline;
tuning `certify` → `must_match`; the color-constraint `certify` Boolean is
removed rather than renamed;
`id_member` → `id_field`; graph-edge `member` → `field` (including the
diagnostic payload field), and graph-rule `direction` → `trend` with the
self-describing values `target-at-most-source` and
`target-at-least-source`; `blind_builder_identity` → `hide_builder_name`;
`scale_speed` → `speed_and_size`; build-record `harness` → `evidence` and
`payload.scope` → `payload.covers`; `clocks.regimes` → `clocks.modes` with
`enter-regime`/`exit-regime` → `enter-mode`/`exit-mode`; test kind
`static-lint` → `document-check`; graph rule `existence-closure` →
`existence-completeness`; and a collection's `contract` → `defined_in`.
§9.7's heading becomes "What must stay, what may vary". Direction entries no
longer carry a `class` field: the entry kind fixes the audit class. No
deprecation aliases — v0.5 spellings are rejected. Unchanged on purpose: the
`harness/` directory and the runner sense of the word, `tuning.json`
`invariants`, and existing error-code identifiers (message text changed).
§2a's former "advice rule" is now the **tie-break rule**.

### Fantasy-block widening — 2026-08-18

The player-fantasy portion of the required `fantasy` block now has one hard
size limit: all unlabeled fantasy lines together MUST fit within 280
characters after per-line trimming, with newlines excluded. At least one line
is still required, and each joined statement ends in `.`, `!`, or `?`.
Further lines SHOULD add distinct facets — role, action, world, and emotion
are guidance, not a closed checklist. The intermediate one-to-three-line cap
and digit ban were rejected; digits are legal, and the character budget
permits any line count that fits. Typed references, bare tuning citations,
and chapter anchors remain forbidden in fantasy lines.

### Declared graph predicates — 2026-08-18

The retained §1c graph layer is now executable rather than only declarative.
The optional manifest `graphs` array declares edge sites over §1b collections,
including plain fields, nested JSON Pointers, one-segment array wildcards such
as `/inputs/*/item_id`, multi-collection discriminators and maps, and optional
inverse back-pointers. Declaring a graph makes edge type and
existence-completeness unconditional package checks. Duplicate ids at one
site warn; dangling, ambiguous, or wrongly typed edges fail with `GRAPH_*`
diagnostics.

Three closed `opengdd-graph-1` predicates are citable from a §6
`document-check` test's `rules` field: `acyclic`, `reciprocal` with optional
record exemptions, and `monotone-attribute-along-path`. The last accepts one
shared attribute field or a per-collection field map and states orientation
through `trend: "target-at-most-source" | "target-at-least-source"`.
Predicate declarations and results are checked by the `GRAPH_*` validator
family; rates, capacities, flow, runtime graph state, and bounded reachability
remain outside the layer.

### Published shapes and structural conformance (breaking) — 2026-08-19

The core now publishes five schemas at explicit `/schema/core/v0.6/` URLs:
`manifest.schema.json`, the newly published `tuning.schema.json` and
`personalization.schema.json`, `direction.schema.json`, and
`opengdd-build.schema.json`. There is no floating schema alias. The validator
reports the two new schema families as `TUNING_SCHEMA` and
`PERSONALIZATION_SCHEMA`; shapes previously stated only in prose are now
closed and schema failures are package-conformance failures.

Personalization's machine effect is deliberately limited. Choice and text
answers outside tuning remain recorded instructions with no include, exclude,
replace, or selector semantics. Numeric questions alone have a deterministic
resolution pipeline over tunables and unpruned contract knobs; defaults run
through that same pipeline to form the package-default snapshot on which
invariants are decided. `out_of_range: "clamp"` clamps, while `"reject"`
refuses that answer and a build record carrying it fails with
`BUILD_ANSWER_REJECTED`. `affects` declares reach and requires existing paths;
it does not confine the answer's effect. A dangling `> PERSONALIZATION: <id>`
tag is a hard `PERSONALIZATION_TAG_DANGLING` package failure. Authority tags
now have an exact grammar and scope: a tag runs until the next authority tag
in the same heading section or that section's end, whichever comes first;
untagged statements are Fixed, and only `PERSONALIZATION:` requires its
declared question id (`DELEGATED:` otherwise accepts an optional label).

The §6 test-block field grammar is closed at the format-defined names and
shapes for `scenario`, `property`, `exhaustive-search`, and `document-check`;
package-owned fields remain permitted but acquire no format meaning. A build
record is a completion claim: `acceptance.total` must equal the expanded
package AT count and `acceptance.passed` MUST equal `acceptance.total`.
A shortfall is the hard build-conformance error
`BUILD_ACCEPTANCE_INCOMPLETE`, even though the JSON record remains an honest,
schema-valid report of an incomplete build.

The retained `parallel-string-layers-1` grid encoding now has machine-decided
congruence. Every declared layer must exist as a non-empty string array, and
all layers and rows in one collection record must share row and Unicode-scalar
column counts. Violations report `CONTENT_LAYER_MISSING`,
`CONTENT_LAYER_ROW_MISMATCH`, or `CONTENT_LAYER_COLUMN_MISMATCH`.

### Prose citations and reserved key segments — 2026-08-19

A draft revision settles how chapter prose cites a tuning key. §1's bare-key
rule stands, and §4 now carries the classification rule that makes it
decidable: a backticked dotted token is a mechanism path when its first
segment is reserved, not a citation when every segment is digits, a file or
file-member mention when any segment is `json` or `md`, and otherwise a tuning
citation that MUST resolve in `tuning.json`. A dangling citation is a hard
failure. §4 lists the reserved first segments, and the list is versioned, so a
later revision may claim a segment as new mechanisms arrive and a rejection
names the revision that reserved it; `content` is deliberately left
unreserved, being a natural key namespace for a designer. The same lists bind
keys: a `tuning.json` key MUST NOT open with a reserved segment, and no
segment of it may be a reserved extension. `tuning.schema.json` and the
validator enforce both.

Three sections that leaned on the old ambiguity are corrected. §1a's fantasy
fence now bans a bare tuning citation alongside the typed references it
already banned, and the fence is machine-checked for the first time — it had
claimed validation failure with no check behind it. §8a no longer calls the
`descriptor:<family>:<id>` prose form "parallel to" prefixes that exist only
inside §4a expressions, and states the real rule: descriptor references always
carry the family-qualified form, a tuning key is cited bare, and `state:` and
`collections:` keep their prefixes. §4a states where a package declares a
`state:number` binding — a §4b clock's `governs` list, or the prose that
defines it in a package-root chapter or a §1b collection's defining
section — a path that until now existed only in validator code. §4 no longer
sends discrete choices to "declared sets": a discrete choice belongs to a §1b
collection record or a §5 personalization option, and the one declared set
v0.5 defines is §2c's ruleset ids. §4b's chapter mode tags, normative since
their introduction, are now checked as well.

### Contracts: the convention layer (breaking) — 2026-08-19

A draft revision lands the contracts layer from
`forge/rfcs/RFC-contracts-convention-layer.md` as normative text in a new
§10 — the number the withdrawn audio-direction annex vacated, so §11 stays the
document's last section and nothing renumbers. Prose carries the design and
data makes selected claims checkable; contracts carry convention, meaning the
decisions a mechanism forces on every designer and almost every spec leaves
silent. A package MAY carry a `contracts/` directory, one file per adopted
contract, and the directory's contents are the declaration: no manifest field
names it. Every other rule of the layer waits until a package adopts
something. The word *contract* is now this construct's alone: the collection
pointer is its `> COLLECTION:` claim, and what a manifest names are entry points.

Two names are reserved by this revision, and an existing package migrates by
renaming:

- a designer-owned `contracts/` directory at the package root, which is now a
  format-reserved name; and
- any `contracts.*` key in `tuning.json`, or any backticked `contracts.x.y`
  token in chapter prose, which now reads as a contract mechanism path (§4)
  rather than as a tuning citation.

Each instance file vendors its core in full and records a surface against it:
an answer for every live flag, a value for every unpruned knob, and
the test inputs its templates declare. Silence is a validation failure,
`not-applicable` is an answer, the surface is closed, and every statement it
records is Fixed — §8 names an adopted contract beside descriptors as a
construct the format reads, with its scope stated rather than assumed. Knobs
join §4's change-authority axis under the
reserved `contracts.<instance>.<knob>` namespace, enter the resolved snapshot,
and are cited bare in prose and typed in a test block. Instantiating a core's
live templates appends a generated block to the build plan whose acceptance
tests are named rather than numbered — `AT <instance>/<template-id>` — so
nothing renumbers, and which a validator recomputes and compares byte for
byte. Cross-references land in §§1, 1b, 2a, 2d, 3, 4, 4a, 5, 6, 7, and 8,
carrying the contract row binding (now §10.7's `rows` source string, after
decision 32), the core-scoped `knob:` reference
scheme, contract keys in §7's checks 4, 5, and 6 plus the re-evaluation of
core invariants over the resolved snapshot, and the reserved seed-stream name.
The certification protocol gains the per-instance contract record its core
digest lands in. The RFC's own spellings were translated into the vocabulary
this draft now uses: a template declares its `type` from §6's four test types,
carries its `test` block behind a `test` fence, the surface records
`test_inputs`, and a surface pin is `must_match`, as in `tuning.json`.
The layer arrives with its evidence — two authored cores, four byte-identical
instantiations of one generated block, the last of them blind, and a two-arm
probe whose contract arm matched its spec 14 of 14 while the prose-only arm
diverged on exactly the two decisions prose left silent; the RFC holds the
record.

### Handbook and Reference split — 2026-08-20

The task-oriented Handbook is now published on the site as the authoring
route for designers. `SPEC.md` remains the normative Reference and the source
of conformance rules; Handbook explanations and examples do not add or narrow
those rules. Site navigation and chapter pointers distinguish the two roles.

### Palettes: the designer's colors become a construct (breaking) — 2026-08-20

A draft revision lands the palette layer from `forge/rfcs/RFC-palettes.md`. The
word *palette* moves to the artifact designers already mean by it: a named set
of colors. `manifest.json` gains an optional `palette` map, a fifth top-level
declaration beside `descriptors`, whose flat dotted keys each hold an ordered
array of colors. An entry is a bare `#RRGGBB` string or a one-key object naming
one color, and a color is named only when something cites it. Ordering carries
no semantics, duplicate hexes are legal, hex case decides nothing, and a
validator MUST NOT normalize an authored spelling. `palette` joins §4's
reserved first segments, so prose cites `palette.<key>` for a set and
`palette.<key>.<name>` for one color; resolution tries the whole reference as a
key first and only then splits the last segment as a color name, and a
declare-time collision rule forbids the one pair of keys that could make the
order ambiguous. Dangling is a hard failure, which is what makes the authoring
tool's coin-on-mention flow safe. Index citations stay rejected: every key
segment and every color name MUST contain a letter, so `palette.a.b.2` can
match nothing.

What was called a palette role is now a **color constraint**, and *role*
returns to people. The construct keeps its home beside thresholds and timings
and stops carrying a hex: `constraints.palette` becomes `constraints.colors`,
and the entry's `value` becomes `color`, a typed `palette:<key>.<name>`
reference into the manifest. Tolerance and scope are unchanged, the former
color `must_match` field is removed, exactness is expressed by `tolerance: 0`,
scope stays on the constraint rather than moving to a test, and there is no
raw-hex escape: a deliberate off-palette accent is just another palette.
Thresholds bind palette colors directly, `roles` becoming `colors` with both
operands typed, and §9.5's consistency check now reads declared palette values
across two files. A mood descriptor's `palette` becomes a bare palette key and
carries no colors, tolerances, or scopes of its own; the
`descriptors.mood.<id>.palette.<role>` claim path is deleted with the rules
that served it. A palette carries no audit class of its own, on the viewing-entry
and reference precedent, and is read through the mood entry that names it under
that entry's bound viewing context. An unreached palette draws a warning.
Deleting the mood role removes the format's single audit-class exception: after
this revision, what a construct is fixes its class, with nothing outside its own
shape able to move it. `palette:` joins the typed references banned from a
fantasy line, and the schemas publish at `/core/v0.6/`; the frozen v0.5 URLs are
untouched.

#### Migrating to the palette layer

- Declare a `palette` map in `manifest.json` and move every color constraint's
  hex into it, naming the colors something cites.
- Rename `constraints.palette` to `constraints.colors` in `direction.json`, and
  every `constraints.palette.<key>` path in a direction fence, a
  `direction_claims` array, or an instantiated contract surface.
- Replace each constraint's `value` hex with `color`, a typed
  `palette:<key>.<name>` reference. A constraint MUST NOT carry a hex.
- Rename a threshold's `roles` to `colors`, and write both `colors` and
  `against` as typed `palette:` references instead of bare sibling keys.
- Replace a mood descriptor's `palette` object with the bare key of a declared
  palette, and rewrite any `descriptors.mood.<id>.palette.<role>` claim as a
  `constraints.colors` entry the covering test cites.
- Re-check every threshold against its own floor after respelling it. §9.5's
  designer-side check computes each threshold over the declared palette values,
  so a threshold whose old operands never satisfied its own `min_contrast`
  fails the moment it migrates, and re-aiming it at the colors it was always
  about is the fix. One living candidate is the live case: `glyph-legibility` and
  `headlamp-vs-night` computed 1.20:1 and 2.90:1 against declared floors of 4.5
  and 5.0, and now name three colors authored with this batch, `#F6E3C0`
  headlamp-pool, `#CFC4AE` plaque-face, and `#2A2722` glyph-ink. That re-aiming
  is an authoring judgment on the package's art direction, ruled by the steward
  2026-08-20 (approved); `forge/rename/MAP.md` §m carries the record.
- Set `"opengdd"` to `"0.6"` and point the package's schema URLs at
  `/core/v0.6/`.

This is a hard version cut: the v0.6 validator rejects `constraints.palette`, a
constraint carrying `value`, and a mood carrying palette entries, rather than
migrating them implicitly.

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
