# OpenGDD technical changelog

[Return to the readable changelog](CHANGELOG.md).

This is the detailed record of OpenGDD changes, including diagnostic codes, schema deltas, and migration steps. It is kept for tool builders and for the audit trail. The format's early drafts were built ahead of demand and carried a great deal of machinery that v0.6 and v0.7 removed. This file tells that story in full.

Paths beginning `forge/…` cite evidence in the steward's private repository, available on request through [GitHub Discussions](https://github.com/opengdd/core-spec/discussions).

Within the v0.7 entry, later paragraphs supersede earlier ones because the entry grew as the version was built.

## v0.8 working draft — 2026-09-10

**The contract layer widened so a definition can ask a question only when it applies and say what holds when it does not (SPEC §10.3–§10.8).** A gated question carries binding `otherwise` prose; a row set carries binding `when-empty` prose; a question condition may read value forms and row counts and combine clauses with `any` and `all`; a value declaration may be conditional and may cite another number instead of repeating it; and a definition may forbid an answer combination with its own designer-facing message and declared severity. Every widening is additive: a definition using only v0.7 forms keeps its exact v0.7 meaning. Ten codes are added: `CONTRACT_QUESTION_CONDITION` for a malformed question condition, `CONTRACT_QUESTION_OTHERWISE` for a missing or empty `otherwise`, `CONTRACT_VALUE_CONDITION` for a malformed declaration condition or declaration cycle, `CONTRACT_VALUE_INACTIVE` for a value supplied to an inactive declaration, `CONTRACT_VALUE_FORM` for a malformed `forms` array, `CONTRACT_CITATION_NON_NUMERIC`, `CONTRACT_CITATION_CROSS_ADOPTION`, and `CONTRACT_CITATION_CYCLE` for value-citation targets, `CONTRACT_RULE_FORBIDDEN` when an answer-aware rule fires (the only code whose severity the definition declares, `error` by default), and `CONTRACT_ROW_WHEN_EMPTY` for a missing or empty `when-empty`. One tightening: a question condition must carry exactly one non-empty form, so an empty `when` or an empty `flag` map, previously accepted and meaningless, is now `CONTRACT_QUESTION_CONDITION`.

**One vocabulary change with no change to any rule.** The designer's document is called a **package** on every surface; the build record's `spec` field keeps its name.

**The authoring tool's source is in the public repository.** `authoring/` carries the browser tool under the MIT licence with its own version number, the extension guide `authoring/PANELS.md` for third-party panels, and the host code behind the site's `/authoring-tool/` page. Panels declare `placement: "companion"` to render under the chosen inspector; a section selection carries `range` and `extent`; the tool page lists only the Tic-Tac-Toe sample, and notes are one list per package.

**Four validator changes.** A `timing` entry that is not an object is the schema's finding (`DIRECTION_SCHEMA`) and no longer also draws `DIRECTION_CLAIM_UNCOVERED`, matching how `colors` and `contrast` entries were already treated. When `tuning.json` is missing, unparsable, or without a `values` object, the prose scan that collects direction mentions is skipped (it already was), so `DIRECTION_UNMENTIONED` is no longer reported for every judged entry on top of `TUNING_JSON`; that finding stands alone. The `PROSE_TUNING_LITERAL` message is reworded for designers ("numbers belong in tuning.json, not in prose: replace 3 with a citation of the key it means (board.size and win.line_length have this value), or mark the line non-normative"); the code and its trigger are unchanged. The tie-break lint (`TIE_BREAK_CHOICE`, `TIE_BREAK_SHARED_CEILING`) no longer fires inside a Delegated or Personalization block, and the words "before", "after" and "then" no longer count as a resolution.

## v0.7 working draft — 2026-08-31

**Contract errors that only wait on the designer are marked, and number rows can declare their bounds.** An error that exists only because the same adoption still lacks an answer, a value, a required row field, or a `scope` or `seeds` input carries `dependent: true`; `summary.dependent` counts them; severity and exit status do not change. A rule waiting on values emits one `CONTRACT_RULE_INVALID` per rule, naming the missing values in `data.waits_on`; a binding or verification entry waiting on an answer names the question. A contract `number` or `integer` row field may declare `within` as an inclusive `[lower, upper]` pair of declared value names or finite numbers (integer literals on an integer field); a row value outside it is `CONTRACT_ROW_RANGE`, a pair whose resolved lower bound exceeds its upper is `CONTRACT_ROW_FIELD_SHAPE`, and a bound naming no declared value is `CONTRACT_REFERENCE`. `COLLECTION_UNCITED` no longer says "no contract binds it": rows are inline, so no contract can reach a drawer.

**Learn wording was reconciled with the existing validator and manifest schema.** SPEC §1a now says that one `#` title line may precede the fantasy block and that anything else before it fails with `FANTASY_POSITION`; SPEC §3 now says that `target` requires `platform` and `genre`, while `session_minutes` and `audience` are optional. These are normative prose corrections only: no validator or schema changed, and no decision was needed.

**Acceptance tests became one block in two forms.** Each `AT-n` heading now has one `test` block and no required prose restatement; `scenario` keeps `given`, `when`, and `then`, while `general` uses designer-written `scope` and `holds` with optional reproducible `seeds`. A build record may list sampled game-local general tests under `evidence.acceptance.sampled`, and the runner profile says how it samples or walks each scope. `VERIFICATION_PROSE` retired; `VERIFICATION_TYPE_RETIRED`, `VERIFICATION_GENERAL_SCOPE`, `VERIFICATION_GENERAL_HOLDS`, `VERIFICATION_GENERAL_SEEDS`, `BUILD_SAMPLED_UNKNOWN`, and `BUILD_SAMPLED_TYPE` are the replacement diagnostics, with `VERIFICATION_FIELD_UNKNOWN` reused for retired fields. Pack templates and adoption inputs changed to `general` and `scope`, changing the ranged-value pack from `sha256:b63f5f2d3a9e181b6eb76d066215273adc8ec5e3250fca29564f7609e841206a` to `sha256:b853c8560d4ed6538266cc64b263136d47081957c84289cbdda81ccfea5c5541` and the hand-reviewed threshold-and-bounds probe from `sha256:65b65767c48ada623e03fce619b08ba2e6dbebd131ed36d3786125924ef36ee6` to `sha256:941bf9a9e6ffa94389ecb1f3949b56f1a8a98cc3374997fb0aad56a9eee8950e`.

**A number rule became one comparison between two sums.** Rule lines retain `== != < <= > >=`, arithmetic with `+ - * /`, parentheses, and `min`, `max`, and `floor`; two required comparisons are two named rules, and alternatives remain prose. `TUNING_RULE_INVALID` replaces `TUNING_RULE_NAME`, `TUNING_RULE_SYNTAX`, `TUNING_RULE_REFERENCE`, `TUNING_RULE_TYPE`, and `TUNING_RULE_ARITHMETIC`, while `TUNING_RULE_FAILED` and `BUILD_TUNING_RULE` remain. Contract rules use the same grammar: `CONTRACT_RULE_INVALID` replaces the corresponding five contract diagnostics, `CONTRACT_RULE_FAILED` remains, and build failures remain `BUILD_CONTRACT_RULE`.

**Record pointers now use the designer word `link`, cycle prevention is Boolean, and build evidence lost a one-value field.** Collection schemas now write `"type": "link"`; `loops: false` forbids a cycle, while omission or `true` permits one. `COLLECTION_LINK_TARGET`, `COLLECTION_LINK_TYPE`, `COLLECTION_LINK_DANGLING`, `COLLECTION_LINK_DUPLICATE`, and `COLLECTION_LINK_LOOP` replace the `COLLECTION_REFERENCE_*` family. `evidence.algorithm` retired under a focused `BUILD_SCHEMA` migration error because the certification protocol already fixes SHA-256; `evidence.contracts` remains so a record preserves the exact pack bytes the build was verified against.

**Contracts became self-contained filled forms.** Each `contracts/<adoption>.json` now carries one copied definition plus the designer's `answers`, plain fixed `values`, inline `rows`, and optional `verification`; questions are asked or not asked through `when`, rules use the §4 one-line grammar, and a matching content-addressed `.pack.json` changes every adoption of that definition from promised to checked. Checked tests render through `--render-contract-tests`, never into `05-build-plan.md`, while build records list each checked adoption and pack hash in `evidence.contracts`. New or renamed diagnostics are `CONTRACT_ANSWER_MISSING`, `CONTRACT_ANSWER_UNKNOWN`, `CONTRACT_ANSWER_NOT_ASKED`, `CONTRACT_VALUE_MISSING`, `CONTRACT_VALUE_UNKNOWN`, `CONTRACT_VALUE_TYPE`, `CONTRACT_VALUE_RANGE`, `CONTRACT_RULE_NAME`, `CONTRACT_RULE_SYNTAX`, `CONTRACT_RULE_REFERENCE`, `CONTRACT_RULE_TYPE`, `CONTRACT_RULE_ARITHMETIC`, `CONTRACT_RULE_FAILED`, `CONTRACT_QUESTION_CYCLE`, `CONTRACT_DEFINITION_DIVERGENT`, `CONTRACT_PACK_SHAPE`, `CONTRACT_PACK_HASH`, `CONTRACT_PACK_ORPHAN`, `CONTRACT_BLOCK_RETIRED`, `BUILD_CONTRACTS_MISSING`, `BUILD_CONTRACTS_UNEXPECTED`, `BUILD_CONTRACT_PACK`, and `BUILD_CONTRACT_RULE`; the historical core/surface, knob/invariant, and generated-block diagnostics retired. `opengdd migrate` converts old contract files to the filled form, copies bound rows inline, moves verification machinery and test inputs into a hashed pack and the adoption respectively, rewrites addresses and supported rules, removes retired build-plan blocks, turns a semantics-only option into `meaning`, collapses identical `meaning` and `semantics` wording, and reports half-open ranges, removed metadata, or other non-mechanical choices for review.

**Numbers became values, ranges, and rules.**
`tuning.schema.json` replaced `tunables`, `constants`, `meta`, `invariants`,
and the embedded `clocks` block with required `values` and optional `ranges`
and `rules`; `clocks` moved unchanged to root `clocks.json`.
`opengdd-build.schema.json` replaced the two resolved maps with
`resolved_tuning.values`, personalization targets became ranged-value-only,
and package and build validation began evaluating the readable line-rule
grammar. The new diagnostics were `TUNING_RANGE_KEY`, `TUNING_RANGE_VALUE`,
`TUNING_RULE_NAME`, `TUNING_RULE_SYNTAX`, `TUNING_RULE_REFERENCE`,
`TUNING_RULE_TYPE`, `TUNING_RULE_ARITHMETIC`, `TUNING_RULE_FAILED`,
`TUNING_OVERRIDE_UNRANGED`, `PERSONALIZATION_RESOLUTION_UNRANGED`, and
`BUILD_TUNING_RULE`. `opengdd migrate <package-dir>` merged old number maps,
moved ranges and clocks, rewrote supported expression trees as rule lines,
and `opengdd migrate --build <opengdd-build.json>` merged old snapshots. The
reserved first-segment set gained `values`, `ranges`, `rules`, and `runtime`.

**Chapters and optional files became presence-declared.**
`manifest.schema.json` removed `build`, including `chapters`, `direction`, and
`personalization`. Validators began reading every root `NN-name.md` in
filename order, kept `01`–`05` for their canonical names and roles, admitted
designer chapters from `06` upward, did not treat unnumbered root Markdown as
chapters, and read `direction.json` and `personalization.json` when present.
Unnumbered root Markdown remained subject to state-binding and prompt-injection
scans. The new
`CHAPTER_NAME_RESERVED` diagnostic rejected `00`–`05` under noncanonical
names. `opengdd migrate` deleted the manifest `build` object.

**Direction timing adopted bare tuning-key addresses.**
`direction.schema.json` changed each `constraints.timing.*.key` from
`tuning:<dotted-key>` to the bare dotted key and validation added
`DIRECTION_TIMING_KEY` so that key must name a declared `values` entry.
`opengdd migrate` removed the `tuning:` prefix from timing keys; other address
families change with the v0.7 mechanisms that own them.

**Art direction became one self-contained file.** `direction.json` gained
the manifest's `palette` and mood content, reduced `pillars`, `anti`, and
`must_keep` to named sentences, flattened measured promises to root `colors`,
`contrast`, and `timing`, consolidated `viewing` to one object, and kept images
as package paths with licences. It lost the mood wrapper, top-level reference
pool, `constraints` and `semantics`, per-claim viewing and audit fields,
`may_vary`, `observable`, `behaviors`, media hashes and formats, and the
direction fence. `manifest.schema.json` removed `palette` and `descriptors`;
`opengdd-build.schema.json` removed `direction_result` and
`evidence.direction_observations`. New diagnostics are
`DIRECTION_CONTRAST_FAILED`, `DIRECTION_FENCE_RETIRED`,
`DIRECTION_MOOD_PALETTE_DANGLING`, and `DIRECTION_UNMENTIONED`.
`DIRECTION_CONTRAST_FAILED` replaces `DIRECTION_THRESHOLD_CONTRAST`, and
`DIRECTION_MOOD_PALETTE_DANGLING` replaces
`DESCRIPTOR_MOOD_PALETTE_DANGLING`. Retired diagnostics are
`BUILD_DIRECTION_ADHERENT_NOT_ASSESSED`,
`BUILD_DIRECTION_CLAIM_DANGLING`, `BUILD_DIRECTION_OBSERVATION_DANGLING`,
`BUILD_DIRECTION_OBSERVATION_DUPLICATE`,
`BUILD_DIRECTION_OBSERVATION_MISSING`,
`BUILD_DIRECTION_OBSERVATIONS_MISSING`,
`BUILD_DIRECTION_OBSERVATIONS_UNEXPECTED`,
`BUILD_DIRECTION_RESULT_MISSING`, `BUILD_DIRECTION_RESULT_UNEXPECTED`,
`DESCRIPTOR_MOOD_PALETTE_DANGLING`, `DIRECTION_CARRIER_UNDECLARED`,
`DIRECTION_CLAIM_AGGREGATE_MIRROR`,
`DIRECTION_CLAIM_AGGREGATE_TEST_TYPE`, `DIRECTION_FENCE_BLANK`,
`DIRECTION_FENCE_DANGLING`, `DIRECTION_FENCE_DUPLICATE`,
`DIRECTION_FENCE_ENTRY`, `DIRECTION_FENCE_HEADER`,
`DIRECTION_FENCE_LABEL`, `DIRECTION_FENCE_LABEL_MISMATCH`,
`DIRECTION_FENCE_MISSING`, `DIRECTION_FENCE_SEPARATOR`,
`DIRECTION_FENCE_UNCITED`, `DIRECTION_METRIC_UNREGISTERED`,
`DIRECTION_MOOD_DESCRIPTOR_DANGLING`, `DIRECTION_REFERENCE_DANGLING`,
`DIRECTION_REFERENCE_ORPHANED`, `DIRECTION_THRESHOLD_CONTRAST`,
`DIRECTION_VIEWING_DANGLING`, `MEDIA_FORMAT_MISMATCH`,
`MEDIA_FORMAT_UNKNOWN`, `MEDIA_HASH_MISMATCH`, `MEDIA_MAGIC`, and
`MEDIA_UNREADABLE`. `opengdd migrate` now moves manifest palettes and moods,
collapses direction wrappers, reduces sentence claims, flattens measured
promises, converts fence rationale to ordinary prose, drops test mirrors, and
removes the historical build-record fields; a fence left behind is the
`DIRECTION_FENCE_RETIRED` error. The full list of what left the package
format with this decision is audit classes; the precision ladder;
`hide_builder_name`; `judge_qualifications`; `observable`; `may_vary`;
`behaviors`; media hash and format; `tie_break_order`; the references pool;
the fence and its grammar; the mood wrapper and `descriptor:` token;
`semantics`; `constraints`; and `scope`.

**Palette and mood references adopted the one dotted address.** The `palette:` and
`descriptor:mood:` forms retired: prose and JSON now use
`palette.<key>.<color>` and `mood.<name>`, while a mood's `palette` field holds
the palette address `palette.<key>`. Palette ownership moved from
`manifest.json` to `direction.json`, whole-key-first resolution moved with it,
and `colors`, `contrast`, and `timing` became reserved first segments in v0.7;
`references.*` and `viewing.*` became legal tuning keys again. Migration
rewrites both retired prefixes and reports other retired descriptor-family
tokens as dangling prose references.

**Runtime values, time modes, clocks, and rulesets adopted their v0.7 forms.**
The seventh core
schema, `clocks.schema.json`, declares one root entry per clock with `unit`,
optional `advances`, and a complete `modes` map using `running`, `paused`,
`steps`, or `none`; `runtime.<name>` replaced the typed state forms,
`unchanged` replaced `freeze_invariant`, rulesets became `> RULESET: <id>`
tags with `(initial)` on exactly one, and `replay` became an opaque object
whose schedule and actions belong to a runner profile. New diagnostics are
`CLOCKS_ADVANCES_DISJOINT`, `CLOCKS_MODE_MISSING`, `CLOCKS_MODE_WORD`,
`RULESET_TAG_SHAPE`, `RUNTIME_UNDECLARED`, `UNCHANGED_ADVANCES`,
`UNCHANGED_MODE`, `UNCHANGED_NO_CLOCKS`, `UNCHANGED_SHAPE`,
`UNCHANGED_UNDEFINED`; retired diagnostics are `CLOCKS_BEHAVIOR`,
`CLOCKS_GOVERNS_DISJOINT`, `CLOCKS_REGIME_RESERVED`, `CLOCKS_REGIMES`,
`FREEZE_INVARIANT_ADVANCES`, `FREEZE_INVARIANT_NO_CLOCKS`,
`FREEZE_INVARIANT_REGIME`, `FREEZE_INVARIANT_SHAPE`,
`FREEZE_INVARIANT_TYPE`, `FREEZE_INVARIANT_UNDEFINED`, `RULESET_ID_UNIQUE`,
`RULESET_TAG_DANGLING`, `VERIFICATION_REPLAY_ACTION`,
`VERIFICATION_REPLAY_CLOCK`, `VERIFICATION_REPLAY_MODE`, and
`VERIFICATION_REPLAY_PRECONDITION`. `opengdd migrate` now rewrites typed
state addresses, moves and reshapes clocks, rewrites unchanged claims, moves
the initial ruleset marker to its tag, removes the retired `all` tags, and
preserves runner-owned replay data.

**Links between records moved onto collection fields.** A drawer's record
schema now admits `reference` fields with `to`, optional `many`, `loops`, and
`mirrored_by`, plus recursive `list` / `of` rows; reference existence is
checked on every validation, while loop and mirror checks opt in on the field.
New diagnostics are `COLLECTION_MIRROR_FIELD`,
`COLLECTION_MIRROR_ONE_WAY`, `COLLECTION_REFERENCE_DANGLING`,
`COLLECTION_REFERENCE_DUPLICATE`, `COLLECTION_REFERENCE_LOOP`,
`COLLECTION_REFERENCE_TARGET`, and `COLLECTION_REFERENCE_TYPE`; retired
diagnostics are `GRAPH_ACYCLIC`, `GRAPH_COLLECTION`,
`GRAPH_DISCRIMINATOR_UNMAPPED`, `GRAPH_EDGE_AMBIGUOUS`,
`GRAPH_EDGE_DANGLING`, `GRAPH_EDGE_DUPLICATE_ID`, `GRAPH_EDGE_TYPE`,
`GRAPH_ID_UNIQUE`, `GRAPH_MONOTONE`, `GRAPH_RECIPROCAL`, and
`GRAPH_RULE_INVALID`. `opengdd migrate` now moves each manifest graph site to
the source drawer's field schema, infers `list` / `of` for wildcard rows,
turns inverse pointers into `mirrored_by`, transfers single-field acyclicity
to `loops: "never"`, removes the retired graph tests, and reports cross-field
or monotone claims for prose instead of inventing a field-local rule.

**Personalization, property tests, and build records adopted their smaller
v0.7 boundaries.** Choice
options now assign ranged numbers through `sets`; a number question may name
one ranged `sets` target whose answer is the value, and an out-of-range build
answer is refused. Property tests now carry `domain`, `holds`, `applies_to`
(`every-sample` or `the-average`), and optional `seeds`; measurement details
belong to the runner profile. Build records keep one `resolved_tuning.values`
map and `evidence.runner`, while top-level `renderer`, `resources`, and
`capture_profile` retired. New diagnostics are `PERSONALIZATION_SETS_TYPE`,
`PERSONALIZATION_SETS_TARGET`, `PERSONALIZATION_SETS_UNRANGED`,
`PERSONALIZATION_SETS_RANGE`, `VERIFICATION_PROPERTY_HOLDS`,
`VERIFICATION_PROPERTY_APPLIES`, and `VERIFICATION_PROPERTY_SEEDS`; retired
diagnostics are `TUNING_OVERRIDE_CONSTANT`, `TUNING_OVERRIDE_RANGE`,
`TUNING_OVERRIDE_TARGET`, `TUNING_OVERRIDE_UNRANGED`,
`PERSONALIZATION_RESOLUTION_CONSTANT`, `PERSONALIZATION_RESOLUTION_RANGE`,
`PERSONALIZATION_RESOLUTION_REQUIRED`, `PERSONALIZATION_RESOLUTION_TARGET`,
`PERSONALIZATION_RESOLUTION_UNRANGED`, `PERSONALIZATION_PATH`,
`VERIFICATION_PROPERTY_PLAN`, `VERIFICATION_PROPERTY_SAMPLING`, and
`VERIFICATION_PROPERTY_ORACLE`. `BUILD_ANSWER_REJECTED` now names the refused
answer behavior, and `BUILD_SCHEMA` gives focused migration hints for retired
build fields. `opengdd migrate` rewrites direct assignments and property
claims, reports runner-owned or unexpressible details for review, and
`opengdd migrate --build` removes the retired build fields.

**The experimental protocol gained runner and audit profiles.** The
runner profile gives the named `evidence.runner` id and version a published
meaning for property-test measurement, replay actions, and observations. The
audit profile records `capture_profile` in the audit's own record, owns its
capture recipes, may ask for further evidence unnamed by the format, and owns
review of `resolved_tuning.values` and judged direction with adherence and
coverage reported separately. The core validator reads neither profile; no
new diagnostic code turns their contents into package or build-record
conformance, while `BUILD_SCHEMA` rejects the historical fields that no
longer belong in the build record.

## v0.6 working draft — 2026-08-18

**Collections declare by presence, with one record per file (2026-08-23).** §1b
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
`> COLLECTION:` prose tag is retired (a survivor reports itself); the §1b
prose-inference reference scan is deleted with it.
`collections` is a reserved prose first segment (`collections.<drawer>`,
`collections.<drawer>.<record>`, dangling hard), a drawer nothing reaches
is a warning, and `collections:<drawer>:count` replaces the retired
`content:<id>:<pointer>:count`. §10.7 binds rows from the instance file's
`rows` map, by inline array or a `collections/<drawer>` source string,
with double binding and per-record dissent unspellable and a bound drawer
taking the core's schema. §6 document-check artifacts may name a drawer
with a trailing slash. Schemas: `manifest.schema.json` shrinks;
`collection.schema.json` is new. Evidence came from two independent
prototypes and the review records that converged on this form.

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
carrying the contract row binding (now §10.7's `rows` source string), the
core-scoped `knob:` reference
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
certification protocol, whose draft is published beside the reference validator
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
