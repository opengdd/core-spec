# OpenGDD package conformance

This directory contains the OpenGDD v0.9 working-draft package validator. It is a plain
Node.js CLI with no third-party dependencies.

```text
node conformance/validate.mjs <package-dir>
node conformance/validate.mjs --json <package-dir>
node conformance/validate.mjs --review <package-dir>
node conformance/validate.mjs --build <opengdd-build.json> [<package-dir>]
node conformance/validate.mjs --render-contract-tests <package-dir>
```

The validator checks the rules of `SPEC.md` that a program can decide from
the files of a package or of a build record. "Hard checks" below lists these
rules. The validator does not run a game, and it does not execute an
acceptance test. It does not decide the rules that need a human reader, such
as the tie-break rule (SPEC §2d). "Deliberate limits" below says what else
the validator leaves out.

In the public repository, the seven schemas are in `schema/core/v0.9/`, and
`examples/tic-tac-toe` holds a complete package. This command validates that
package from the repository root:

```text
node conformance/validate.mjs examples/tic-tac-toe
```

The npm package `opengdd` holds the same validator. Its command is
`npx opengdd validate <package-dir>`.

The migrator rewrites a v0.6, v0.7, or v0.8 package or build record in place
into its v0.9 form:

```text
npx opengdd migrate <package-dir> [--dry-run] [--json]
npx opengdd migrate --build <opengdd-build.json> [<package-dir>] [--dry-run] [--json]
```

`--dry-run` reports without writing. `--json` emits the report as JSON, with
separate `manual` and `reviewNotes` arrays. A manual item names a problem or
a change that the migrator detected at a location. A review note is a
reminder, and it does not change the exit status.
Exit `0` means the migration completed with no manual items, `1` means the
report contains changes that require manual review, and `2` means invalid
arguments, unreadable input, or another migration error.

For a build record, supply its source package. The migrator compares the
recorded and source address lists before a version-only migration. It changes
a v0.8 record to v0.9 only when the lists are the same. If the package gained
or lost a recorded address, the record stays at v0.8 and the report tells the
builder to issue a new report. The migrator cannot invent values used by an
earlier build. Omitting the source package leaves a manual item and exits `1`.

The meaning of tag scope changed in v0.9. The v0.8 to v0.9 version step keeps
chapter text unchanged. It reports the chapter, line, tag, and old scoped text for
each passage that needs review. The designer must quote lines that should
remain under the tag, or leave them unquoted as Fixed text or text that
applies in every ruleset. A scope item is manual work and makes the command
exit `1`.
The same review is required for build-record migration. Equal address lists
do not prove that chapter text has the same meaning.

For direction, migration moves manifest palettes and moods into
`direction.json`, collapses the old wrappers, rewrites palette and mood
addresses, reduces named sentence claims, flattens measured promises, turns
the retired fence into ordinary prose, removes mirrored test fields, and
removes the two historical direction fields from a build record. A fence that
survives migration is the `DIRECTION_FENCE_RETIRED` error.

For runtime and links, migration rewrites typed state addresses as
`runtime.*`, reshapes root `clocks.json`, converts `freeze_invariant` to
`unchanged`, moves the initial ruleset marker to its tag, preserves opaque
replay data, and moves manifest graph sites into collection `reference`
fields, then renames those fields to `link`. It infers recursive `list` / `of`
rows, transfers field-local loop and
mirror claims, and reports cross-field or monotone claims for prose. The
validator loads the seventh schema, `clocks.schema.json`.

For personalization, tests, and build records, migration replaces choice
assignments and direct numeric answers with `sets`; rewrites `property` as
`general`, `domain` as `scope`, and keeps `holds` and optional `seeds`; folds
`applies_to` into the `holds` sentence; folds an `exhaustive-search` claim
into a general scope and holds sentence; and
quotes a `document-check` as a manual item. It drops the retired test fields,
renames collection `reference` fields to `link`, rewrites `loops: "never"` as
`loops: false`, and removes historical build-profile fields and
`evidence.algorithm`. Object scopes, unsupported rule expressions,
out-of-range defaults, and choices that cannot be rewritten exactly are
reported for manual review. Retired test types use
`VERIFICATION_TYPE_RETIRED`; retired fields use
`VERIFICATION_FIELD_UNKNOWN`; both messages point to `opengdd migrate`. The
focused build-record error is `BUILD_SCHEMA` and points to
`opengdd migrate --build`.

For contracts, migration replaces each historical instance/core/surface file
with one filled adoption form. It renames flags to questions and surfaces to
answers, converts knob objects to plain fixed values with full inclusive
ranges, rewrites supported invariant trees as rule lines, copies bound collection
records into inline `rows`, and moves per-adoption domain and seed inputs into
`verification`, renaming the input to `scope`. Verification machinery moves into
`contracts/<contract>-<version>.pack.json`; migration hashes the exact pack
bytes into every matching definition, removes retired generated-contract
markers and their contents from `05-build-plan.md`, and rewrites contract
addresses to the dotted adoption/value form. Half-open ranges, removed units
or presentation text, runner-owned sample counts, and annotations under
retired parents are reported for manual review. A source option with only
`semantics` migrates to `meaning`; identical `meaning` and `semantics` text is
kept once as `meaning`. Filled forms are emitted with the definition fields
first, followed by `answers`, `values`, `rows`, and `verification`.

The human report is the default. `--json` emits one JSON object containing the
package identity, validity, verdict, summary counts, and the always-present
`findings`, `hints`, and `safety` lists. The summary carries `errors`,
`dependent`, `warnings`, `hints`, `safety`, and `findings` counts. Build mode
also emits the derived `outcome` and empty hint and safety lists. Items
carry a stable code, severity, file/location where available, message, and
normative `spec_section`. An error that exists only because the same adoption
still lacks a required answer, value, row field, or verification input also
carries `dependent: true`; `summary.dependent` counts those errors. The process
exits `0` when a package has no errors, `1` when a package has one or more
conformance errors, and `2` for CLI usage errors. Build mode exits `0` only
for conforming, `1` for invalid, `2` for usage, and `3` for incomplete, not
verified, or not checked. Warnings, hints, and safety notices never change an
exit status.

`--review` asks package validation for English-language hints. The text report
prints findings after the result, then the optional hints section, then the
default safety scan. Library callers use `validatePackage(host, dir,
{ review: true })`; with review omitted or false, `hints` is empty. Safety runs
by default. Neither list contributes to the verdict or warning count.

For package validation, the verdict is `PASS`, `PASS WITH WARNINGS`, or
`FAIL`. Build mode uses `PASS` or `PASS WITH WARNINGS` only for a conforming
report; its other verdicts are `INCOMPLETE`, `NOT VERIFIED`, `NOT CHECKED`,
and `FAIL`.

The optional `<package-dir>` of `--build` is the source package: the package
that the build was built from. Without it, the eight package-consistency
checks of SPEC §7 do not run, except the acceptance sum of check 6. The
validator checks that sum from the record alone: `passed` plus the number of
`not_passed` entries must equal `total`. The validator also checks the record
against its schema. A record with errors is invalid: the verdict is `FAIL`,
and the exit status is `1`. A record without errors is not checked: `valid`
is `null`, the verdict is `NOT CHECKED`, and the exit status is `3`.
`NOT CHECKED` is not a passing verdict. Supply the package directory to run
the eight checks.

With its source package, a valid build report has one of three outcomes:
`conforming` when the package has tests and all passed, `incomplete` when
`evidence.acceptance.not_passed` lists any test, and `not verified` when the
package has no tests. Invalid and not checked keep their existing meanings.
The human report lists the `not_passed` names for an incomplete result and
says when a not-verified package declares no tests.

For a package run, `PASS` and `PASS WITH WARNINGS` are CLI verdicts over the
machine checks implemented below. They are necessary evidence for package
conformance, not a complete package-conformance decision. SPEC §2d also binds
package-level prose obligations that require human reading; a clean run does
not waive them, and warnings are review leads rather than conformance verdicts.
Use the handbook [preflight checklist](https://opengdd.org/handbook/preflight-checklist/)
before claiming that a package fully conforms.

`--render-contract-tests` validates the package and prints the checked
adoptions' rendered acceptance tests to stdout. It is read-only and writes no
build-plan bytes. A package with only promised adoptions exits successfully,
prints no tests, and explains on stderr that no tests are generated.

Number rules in `tuning.json` use the §4 readable line grammar. Rule findings
use `TUNING_RULE_INVALID` for anything wrong with the line or its name and
`TUNING_RULE_FAILED` for a false comparison. A build snapshot that makes a
rule false uses `BUILD_TUNING_RULE`. `TUNING_RULE_GUESS_FAILED` is the warning
`guesses break rule "<name>"`, followed by the rule line and the numbers that
made the guess evaluation false. An invalid-line message names the specific
problem. A false-result message names the rule, repeats its line, and shows the
numbers that made it false. `TUNING_OPEN_OVERLAP` says `key "<key>" appears in
both values and open; a number has one kind`.

The new runtime, clock, ruleset, and link codes are
`CLOCKS_ADVANCES_DISJOINT`, `CLOCKS_MODE_MISSING`, `CLOCKS_MODE_WORD`,
`COLLECTION_MIRROR_FIELD`, `COLLECTION_MIRROR_ONE_WAY`,
`COLLECTION_LINK_DANGLING`, `COLLECTION_LINK_DUPLICATE`,
`COLLECTION_LINK_LOOP`, `COLLECTION_LINK_TARGET`,
`COLLECTION_LINK_TYPE`, `RULESET_TAG_SHAPE`, `RULESET_INITIAL`,
`RUNTIME_UNDECLARED`,
`UNCHANGED_ADVANCES`, `UNCHANGED_MODE`, `UNCHANGED_NO_CLOCKS`,
`UNCHANGED_SHAPE`, and `UNCHANGED_UNDEFINED`.

The filled-form contract codes a designer meets most often are `CONTRACT_ANSWER_MISSING`,
`CONTRACT_ANSWER_UNKNOWN`, `CONTRACT_ANSWER_NOT_ASKED` (warning),
`CONTRACT_VALUE_MISSING`, `CONTRACT_VALUE_UNKNOWN`, `CONTRACT_VALUE_TYPE`,
`CONTRACT_VALUE_RANGE`, `CONTRACT_RULE_INVALID`, `CONTRACT_RULE_FAILED`,
`CONTRACT_ROW_RANGE`,
`CONTRACT_QUESTION_CYCLE`, `CONTRACT_DEFINITION_DIVERGENT`,
`CONTRACT_PACK_SHAPE`, `CONTRACT_PACK_HASH`, `CONTRACT_PACK_ORPHAN`, and
`CONTRACT_BLOCK_RETIRED`. Source-backed build checks add
`BUILD_CONTRACTS_MISSING`, `BUILD_CONTRACTS_UNEXPECTED`,
`BUILD_CONTRACT_PACK`, and `BUILD_CONTRACT_RULE`.
Contract citation findings use `CONTRACT_CITATION_GRAMMAR` for a form outside
the closed citation grammar, `CONTRACT_CITATION_DANGLING` for an unresolved
target, and `CONTRACT_CITATION_AUTHORITY` for a chapter target that is not
Fixed. `CONTRACT_CITATION_OPEN` refuses both contract routes to an open number
with `<location> cites "<key>", an open number; contracts may cite decided
tuning values only`.

The v0.8 widened forms (SPEC §10.3–§10.10) add ten codes:
`CONTRACT_QUESTION_CONDITION` for a malformed question condition,
`CONTRACT_QUESTION_OTHERWISE` for a missing or empty `otherwise`,
`CONTRACT_VALUE_CONDITION` for a malformed declaration condition or
declaration cycle, `CONTRACT_VALUE_INACTIVE` for a value supplied to an
inactive declaration, `CONTRACT_VALUE_FORM` for a malformed `forms` array,
`CONTRACT_CITATION_NON_NUMERIC`, `CONTRACT_CITATION_CROSS_ADOPTION`, and
`CONTRACT_CITATION_CYCLE` for value-citation targets,
`CONTRACT_RULE_FORBIDDEN` when an answer-aware rule fires (the only code
whose severity the definition declares: `error` or `warning`, default
`error`), and `CONTRACT_ROW_WHEN_EMPTY` for a missing or empty `when-empty`.

The codes that may be filed against a shared `.pack.json` and routed back to
its adoption are `CONTRACT_RULE_INVALID`, `CONTRACT_BINDING_MAP`,
`CONTRACT_PLACEHOLDER`, `CONTRACT_REFERENCE`, and
`VERIFICATION_GENERAL_SEEDS`. This location rule is independent of the
optional `dependent` marker.

## Hard checks

Errors are limited to mechanically testable MUST requirements in `SPEC.md`:

- **§§1 and 3 — package and manifest:** required files; package-relative path
  containment; `manifest.json` validation against `manifest.schema.json`;
  commerce split total; numbered chapters read by presence; canonical names
  for `01`–`05`; and optional direction and personalization files read by
  presence. A missing required file is `PACKAGE_REQUIRED_FILE`; a manifest that
  breaks its schema, including a field the closed shape does not name, is
  `MANIFEST_SCHEMA`. The CLI implements the schema subset the v0.9 core
  schemas use:
  local `$ref`, `type`, `required`, `properties`, `additionalProperties`,
  `oneOf`, `const`, `enum`, `pattern`, `minLength`, numeric bounds, array
  `items`, `minItems`, and deep `uniqueItems`.
- **§1a — fantasy:** opening fenced `fantasy` block (anything else before it is
  `FANTASY_POSITION`), at least one player-fantasy
  line, a 280-character
  combined budget across those lines, three to five feel entries,
  non-empty anti-references, at most one
  line per label (`Feel:`, and the anti-reference line under either spelling),
  and the reference fence: no fantasy line carries a typed-colon reference
  beginning `tuning:`, `state:`, `collections:`, `descriptor:`, or `palette:`;
  a backticked `runtime.*` address; or a bare token that §4's classification
  rule reads as a tuning citation. Classification
  alone decides the bare arm — whether the key exists is not what the fence
  is about — and no fantasy line may carry a `<file>.md#<anchor>` or bare
  `#<anchor>` chapter reference.
- **§4 — tuning:** validation against `tuning.schema.json`, plus the cross-field
  rules no single-document schema decides: one finite-number `values` map and
  an optional `open` map of finite guesses or `null`; no key in both tables;
  flat dotted keys whose first segment is not reserved and whose segments do
  not begin or end with `-` or use a reserved extension; range targets,
  inclusive bounds, and declared values or guesses inside them; and the §4
  line-rule grammar of one comparison between two arithmetic sides, plus key
  lookup, finite arithmetic, package errors over package-decided numbers, and
  warnings only when a rule that still names a guess fails. The guess lookup
  starts from the package lookup — defaults and one-pass record pins included —
  and fills only undecided keys from guesses. Rule lookup also admits top-level
  numeric collection fields at their full addresses. A record pin is a
  top-level equality with the open record address alone on one side and only
  package-decided numbers or literals on the other; pins do not chain.
- **§4 — prose citations:** every backticked dotted token in a declared
  chapter is classified by §4's four rules. A version string and a file
  mention are skipped; a reserved extension segment is read wherever it sits,
  so `tuning.json.rules` is a file member, not a citation. A token left
  as a bare tuning citation MUST resolve to
  a `values` or `open` key in `tuning.json`; a dangling one is a hard failure, and its message
  names the reserved segment ("did you mean") when its opening segment is one
  edit from a reserved segment. A mechanism path is resolved against the file that owns it, for
  every family that owns one:
  - the §9 direction families — `pillars`, `mood`, `anti`, `must_keep`,
    `colors`, `contrast`, `timing`, and `palette` — against a declared
    `direction.json`; the first seven take exactly two segments, while palette
    addresses use §9.1's whole-key-first order;
  - `tuning.json`'s `rules` map: `rules.<name>` names one declared rule;
  - the root `clocks.json` map (§4b): `clocks.<name>` names a declared clock;
  - the `collections/` collections (§1b): `collections.<collection>` cites the collection
    as a set, `collections.<collection>.<record>` cites one record, and
    `collections.<collection>.<record>.<field>` must name a field present in the
    record or its schema. A dangling one is a hard failure reported against
    §1b, which is what closes the format's last silent-rename gap: renaming a
    record makes every stale citation a finding with a file and a line;
  - the contract adoption file that owns a value (§10.9).

  The reserved-segment list is versioned, and the key check that mirrors it
  names the revision. `palette` and `collections` are reserved as of v0.6.
  `collections` is reserved for the same
  kind of reason and carries the same diagnostic: the segment belongs to the
  `collections/` collections, so a `collections.*` tuning key legal before
  is rejected naming v0.6 as the revision that took the namespace. The
  `values`, `ranges`, `rules`, `runtime`, `colors`, `contrast`, and `timing`
  were added to the reserved set in v0.7, and a rejected key names that
  revision. `open` is not reserved; open tuning numbers are cited by bare
  name. `references.*` and `viewing.*` are legal tuning keys again.

  A dangling bare citation and a mechanism path that resolves against nothing
  are both `PROSE_CITATION_DANGLING`, filed against the section that owns the
  family.

  A `runtime.*` address is declared by a numbered root chapter or a clock's
  `advances` array. Another JSON use without either declaration is
  `RUNTIME_UNDECLARED`. Contract adoptions and packs use the same dotted
  adoption/value addresses as prose (§10.9).
- **§4b — runtime, clocks, and time modes:** `clocks.json` validates against
  `clocks.schema.json`. Each root clock has a non-empty `unit`, optional
  `advances`, and a non-empty `modes` map whose values are `running`, `paused`,
  `steps`, or `none`; `CLOCKS_SHAPE` reports the file's own shape faults — a
  top level that is not a non-empty map, the retired v0.6 root wrappers, a
  clock name outside the tuning-key segment grammar, an unknown clock field, a
  malformed `advances` array, and a mode id that is not kebab-case.
  `CLOCKS_ADVANCES_DISJOINT` rejects one runtime value on
  two clocks; `CLOCKS_MODE_MISSING` requires every clock to cover the union of
  declared modes; `CLOCKS_MODE_WORD` rejects another cell word. A `[MODE]` tag
  can stand anywhere in a chapter heading. It must name one of those modes,
  and the comparison ignores letter case. `[ALL]` is retired. In a package
  that declares at least one time mode, an unknown tag and `[ALL]` are
  `MODE_TAG_DANGLING`. In a package that declares no time mode, the validator
  does not check bracketed words in headings.
- **§4b — unchanged:** `scenario` and `general` tests may carry `unchanged`
  with non-empty `values` and `modes`. `UNCHANGED_ADVANCES` warns when a named
  value's clock moves there; `UNCHANGED_UNDEFINED` fails when its clock is
  `none`; the remaining `UNCHANGED_*` codes decide shape, declaration, and the
  presence of `clocks.json`. Wrong-typed values and modes use
  `UNCHANGED_SHAPE`.
- **§10.6 — contract rules:** the §4 one-comparison grammar over a
  definition's bare value names. Invalid names or lines use
  `CONTRACT_RULE_INVALID`; when values are still missing, one dependent
  finding per rule names the missing values. False comparisons use
  `CONTRACT_RULE_FAILED`, or `BUILD_CONTRACT_RULE` over a resolved build
  snapshot.
- **§1b — collections:** `collections/` is a reserved package-root directory
  and presence is the whole declaration. Each immediate
  subdirectory is one collection and the folder name is its id, so there is
  nothing to register and nothing that can contradict what the folder holds.
  A collection holds one JSON file per record. The filename minus `.json` is the
  record's id and address, it MUST be lowercase kebab-case, and the record
  body is designer data. The filesystem enforces id uniqueness
  by construction, so there is no uniqueness check left to run. A loose file
  directly under `collections/`, a non-`.json` file inside a collection, and a
  subdirectory inside a collection are each a failure: collections are flat in this
  revision, and organization is expressed as sibling collections with compound
  kebab names. The envelope codes are
  `COLLECTION_LABEL_JSON`, `COLLECTION_LABEL_SCHEMA`, `COLLECTION_RECORD_JSON`,
  `COLLECTION_RECORD_SHAPE`, `COLLECTION_ID_GRAMMAR`, `COLLECTION_STRAY_FILE`,
  and `COLLECTION_SUBDIRECTORY`.

  `_collection.json` is optional and appears only when it has something to
  say; it is closed and schema-validated against `collection.schema.json`, and
  its one field is `record` — an optional record schema written in the closed
  field grammar §12.1 and §1b share: `type`, one of `number`, `integer`,
  `string`, `grid`, `link`, or `list`; `required` or `when` but never both, absent both
  meaning optional, and a §1b condition reads a row domain only because there
  are no flags outside a contract; `options` and `pattern: "kebab-case"` on
  string fields; `unique`; and `description`, where field-level meaning lives.
  A top-level number or integer field may carry `open: true`, never together
  with `required`; `open` is not legal in a nested list schema. In an open
  field, a number is a guess, `null` is no guess, and absence means the field
  does not apply to that record.
  A fault in the grammar itself is `COLLECTION_SCHEMA_SHAPE`. With a schema,
  every record in the collection is validated against it — undeclared fields,
  missing required and conditionally required fields, a present field whose
  condition does not hold, types, closed choices, kebab-case patterns, and
  collection-wide uniqueness, every one of them `COLLECTION_RECORD_SCHEMA`.
  Without a schema, records are free-form and the format says so plainly
  instead of pretending otherwise. `_`-prefixed keys are annotations
  throughout this family and are read by nothing. A `link` names its target
  collection with `to`, optionally uses `many`, Boolean `loops`, and
  `mirrored_by`; a `list` carries the same field grammar recursively under
  `of`.

  Collection records are Fixed package data, with two exceptions: open
  fields, and content that a Delegated passage covers. A collection has no
  authority mechanism of its own, and no `authority` field exists anywhere in
  this family. So `authority` inside a record file, at the top level or
  nested, is an ordinary property name that a package may use for its own
  data. The validator gives it no special meaning. A designer who leaves part
  of a collection's content to the builder says so in an ordinary
  `> DELEGATED:` blockquote. The passage cites the collection or the records
  that it covers, and it states what the builder may omit or change. When
  such a change affects how the game plays, the passage also states its
  target and its limits (SPEC §2a). The validator does not interpret the
  words of a Delegated passage. The `> COLLECTION:` tag is retired, and a tag
  that remains is reported as `COLLECTION_TAG_RETIRED`.

  Chapter prose cites a collection, and the schema file states how each field
  is read. Game rules are written in chapters that cite
  `collections.<collection>` and `collections.<collection>.<record>`, which the
  §4 prose-citation check resolves. A collection that nothing refers to
  receives the `COLLECTION_UNCITED` **warning**. Nothing refers to a
  collection when no chapter prose cites it, no `link` field names it in
  `to`, and no rule in `tuning.json` names one of its record fields. The
  warning asks for a review. It does not require a change.

  Every `link` value must name a record in its `to` collection. Existence is
  unconditional; `loops` and `mirrored_by` opt into cycle and two-way-link
  checks. `loops: false` forbids a cycle; omitted or `true` permits one. The
  codes are `COLLECTION_LINK_TARGET`, `COLLECTION_LINK_TYPE`,
  `COLLECTION_LINK_DANGLING`, `COLLECTION_LINK_DUPLICATE`,
  `COLLECTION_LINK_LOOP`,
  `COLLECTION_MIRROR_FIELD`, and `COLLECTION_MIRROR_ONE_WAY`.
- **§2 — authority tags:** a `> PERSONALIZATION: <id>` chapter tag names a
  declared question. Text after `DELEGATED:` on the tag line is part of the
  Delegated passage. One tag line can hold the complete passage. That text
  declares no identifier, and the validator resolves it against nothing.
- **§5 — personalization:** validation against `personalization.schema.json`,
  unique question and choice-option ids, type-correct defaults and choice
  membership, choice-only options, and `sets` only on choice options or number
  questions. Every `sets` target must be a ranged `values` key or an `open`
  key, and every package-supplied assignment and default must sit inside its
  range when one is declared.
  Answers are applied in question order; an out-of-range build answer is
  refused. Contract values are fixed in their adoption and are rejected as
  `sets` targets.
  The current codes are `PERSONALIZATION_SETS_TYPE`,
  `PERSONALIZATION_SETS_TARGET`, `PERSONALIZATION_SETS_UNRANGED`, and
  `PERSONALIZATION_SETS_RANGE`.
- **§7a — grid layers:** `grid` is a field type in the collection's record schema,
  and a schema declaring at least one grid field is what makes the collection
  grid-encoded — the trigger the retired `layout` block was, and the retired
  collection `format` field before it. A grid value is an array of strings,
  one per row; presence and that shape belong to the record-schema check above
  and report as `COLLECTION_RECORD_SCHEMA`, which is where a missing grid
  field now lands. Congruence over the fields that are grids is this check's:
  within and across every grid field of one record, row counts and per-row
  column counts agree and the grid is at least 1×1, columns measured in
  Unicode scalar values. The format fixes that unit, so the one-value
  `cell_unit` field is gone with the block that held it
  (`CONTENT_LAYER_ROW_MISMATCH`, `CONTENT_LAYER_COLUMN_MISMATCH`).
- **§9 — art direction:** `direction.json` is optional and self-contained.
  Its closed root holds `palette`, `pillars`, `mood`, `anti`, `must_keep`,
  `colors`, `contrast`, `timing`, and one `viewing` object. A file that will
  not parse is `DIRECTION_JSON`, and its downstream findings are suppressed
  until it does; a root or entry shape fault, including an unknown field, an
  empty map, an empty string, and an invalid numeric bound, is
  `DIRECTION_SCHEMA`. Palettes keep their
  entry, naming, collision, whole-key-first resolution, and reachability
  rules; ownership moved from the manifest to this file. A mood palette is a
  `palette.<key>` address. `DIRECTION_UNMENTIONED` warns when no chapter cites
  a pillar, mood, anti-reference, or what-must-stay entry.

  Measured promises are the flat `colors`, `contrast`, and `timing` maps.
  Palette-address and tuning-key checks use `DIRECTION_COLOR_REFERENCE`,
  `DIRECTION_COLOR_DANGLING`, and `DIRECTION_TIMING_KEY`. The validator
  computes WCAG 2.1 contrast from the declared colors before a build and
  reports a pair below its floor as `DIRECTION_CONTRAST_FAILED`. A surviving
  fenced direction block is `DIRECTION_FENCE_RETIRED`; ordinary delegated
  presentation prose replaces it.
- **§6 — `test` blocks:** acceptance tests are optional; canonical
  `05-build-plan.md` remains required. When tests are present, unique,
  ascending `AT-<n>` headings (gaps permitted) each have an
  immediately following JSON `test` fence, a legal test type (another one is
  `VERIFICATION_CLASS`),
  type-specific required fields, and finite tolerance requiring a target.
  The standard top-level field set is closed;
  package-owned data lives only under `extensions`, whose kebab-case keys map
  to opaque objects. A `scenario` carries non-empty `given`, `when`, and
  `then`. A `general` test carries non-empty `scope` and `holds`, with optional
  non-empty `seeds`. Their focused field codes are
  `VERIFICATION_GENERAL_SCOPE`, `VERIFICATION_GENERAL_HOLDS`, and
  `VERIFICATION_GENERAL_SEEDS`. A surviving retired type is
  `VERIFICATION_TYPE_RETIRED`; surviving retired fields use
  `VERIFICATION_FIELD_UNKNOWN`; both messages name `opengdd migrate`.

  The whole `replay` object and general-test execution details are runner-owned
  and opaque to package validation. The
  [Runner profile](CERTIFICATION.md#runner-profile) states how it samples or
  walks each scope, per seed when seeds are present, plus replay vocabulary
  and observation semantics.
  Its path containment, §1b structured-content declaration, and actual input
  grounding for a `target` are experimental certification audit obligations
  (SPEC §6).

  A `scenario` or `general` may cite `colors.<key>`, `contrast.<key>`, or
  `timing.<key>` through `direction_claims`. An empty or malformed array is
  `DIRECTION_CLAIMS_SHAPE` and a path that resolves to no measured entry is
  `DIRECTION_CLAIMS_DANGLING`. Every measured direction promise
  needs at least one game-local covering test (`DIRECTION_CLAIM_UNCOVERED`).
  The test points to the promise and does not mirror its value or scope. A
  rendered contract test carrying `direction_claims` is
  `CONTRACT_TEST_DIRECTION_CLAIMS`: a pack cannot own the adopting package's
  art-direction coverage.

- **§7 — build reports and runner identity:** `resolved_tuning.values` contains
  every source value and open tuning key, every applicable open record field,
  and every live contract value. Unanswered ranged values may move inside
  their ranges; answer-set values equal their answers; decided and contract
  values stay fixed. Tuning rules run over that recorded map plus decided
  record numbers. Open integer record fields remain whole.

  `evidence.acceptance.not_passed` lists each source test that did not pass as
  `failed`, `partial`, or `not-run`, with a non-empty reason. `failed` means
  that the test ran completely and did not pass. `partial` means that the
  test could be run only in part. `not-run` means that the test did not run.
  The validator reports `BUILD_NOT_PASSED_UNKNOWN`, `BUILD_ACCEPTANCE_ACCOUNTING`, and
  `BUILD_SAMPLED_NOT_RUN` for unknown names, an unaccounted shortfall, and a
  sampled test that did not run. A rendered contract key is exactly
  `<adoption>/<template>` or `<adoption>/<template>/<row-id>` under §10.7,
  without the heading's `AT ` prefix; when that prefix is present, the message
  for the unknown name says this. `result_hash` and `payload` are required when
  anything ran and may be absent when nothing ran.

  The build schema admits a closed
  `evidence.runner` object containing non-empty `id` and `version`.
  Source-backed validation
  requires the runner identity when any test ran, game-local or generated
  (`BUILD_RUNNER_REQUIRED`). Passed, failed, and partial tests ran; `not-run`
  tests did not. `evidence.acceptance.sampled` names general tests of the
  source package, game-local or generated. `BUILD_SAMPLED_UNKNOWN` reports a
  name that is no test of the source package, and `BUILD_SAMPLED_TYPE`
  reports a test that is not a general test. A legacy build record carrying
  `renderer`, `resources`, `capture_profile`, `direction_result`, or
  `evidence.direction_observations`, or `evidence.algorithm` receives one focused `BUILD_SCHEMA`
  error; v0.7 and v0.8 records carry none of them. A record missing an answer for a
  declared question is `BUILD_ANSWER_MISSING`; an answer naming no declared
  question is `BUILD_ANSWER_UNKNOWN`; an answer of the wrong type for its
  question is `BUILD_ANSWER_TYPE`; a choice answer naming no declared option
  is `BUILD_ANSWER_OPTION`; an out-of-range numeric answer is
  refused under `BUILD_ANSWER_REJECTED`; an open record integer given a
  fraction is `BUILD_RECORD_VALUE`; and a fixed or answer-set value that differs
  from the one the source-and-answer pipeline computes is `BUILD_TUNING_VALUE`.
  A missing canonical source `05-build-plan.md` is
  `BUILD_SPEC_PLAN_MISSING` rather than a zero-test conforming result.
  A record checked without its source package receives the
  `BUILD_SPEC_CROSS_CHECKS_SKIPPED` warning. It is invalid when it has errors
  of its own, and it is not checked when it has none. The
  [Audit profile](CERTIFICATION.md#audit-profile) records `capture_profile` in
  the audit's own record and owns capture recipes, any further evidence it
  asks for, resolved-value audit scope, and judged direction.

- **§10 — declared contracts:** the family is inert without a package-root
  `contracts/` directory. The exact lowercase directory name is reserved;
  dotfiles are ignored; every other entry is one adoption JSON file or one
  `<contract>-<version>.pack.json` file; and subdirectories are forbidden.
  The adoption filename minus `.json` is its kebab-case id and
  address. A miscased sibling directory is the `CONTRACT_FOLDER_CASE` warning.
  A `contracts/` directory holding at least one non-dot entry and no file that
  claims to be an adoption — no parsing `.json` file other than a
  `.pack.json` carrying `contract` or the historical `format` — receives the
  focused reserved-folder migration diagnostic, `CONTRACT_FOLDER_RESERVED`.
  - *Filled form.* An adoption is one closed top-level object. Required
    definition fields are `contract`, `version`, `summary`, `mechanism`,
    `questions`, and `declares`; `origin`, `rules`, and `pack` are optional.
    Required designer fields are `answers` and `values`; `rows` and
    `verification` are optional. `_`-prefixed annotations are legal throughout.
    Two adoptions with one contract/version identity must have identical
    definition bytes after the designer fields and annotations are stripped
    (`CONTRACT_DEFINITION_DIVERGENT`). A definition declaring no `origin` is
    the `CONTRACT_ORIGIN_ABSENT` warning. A value name reserved by the rule
    grammar (`and`, `or`, `not`) or outside the kebab-case grammar is
    `CONTRACT_NAME_GRAMMAR`; one colliding with a question name is
    `CONTRACT_NAME_UNIQUE`. A `when` carrying a `row` domain where no row is in
    scope is `CONTRACT_WHEN_DOMAIN`.
  - *Questions.* Question and option names are dot-free kebab-case. `when.flag`
    conditions form an acyclic dependency graph. Every asked question has one
    declared option in `answers`; an answer to a not-asked question is the
    `CONTRACT_ANSWER_NOT_ASKED` warning.
  - *Values, rows, and rules.* Every declared value has a finite plain number
    in `values` and satisfies its optional full inclusive range. Values are
    Fixed and cannot be personalization targets. Every declared row set has
    one inline array under `rows`, including `[]`; records are checked against
    the definition's closed §1b-dialect schema. A number or integer row field
    may use `within` to name an inclusive pair of declared values or finite
    numeric bounds; integer fields require integer literals. Resolved lower
    bounds above their upper bounds are `CONTRACT_ROW_FIELD_SHAPE`, and an
    outside value is `CONTRACT_ROW_RANGE`. A row set that is not an array of
    row objects is `CONTRACT_ROWS_SHAPE`; an undeclared, missing, wrongly
    typed, or repeated-unique field is `CONTRACT_ROW_FIELD`; a value outside a
    closed option set is `CONTRACT_ROW_CHOICE`; and a supplied string carrying
    placeholder delimiters or a code fence is `CONTRACT_INJECTION`. Rules use
    the §4 one-line grammar over bare declared value names and are evaluated
    over the adoption and resolved build snapshot.
  - *Promised and checked.* No matching pack means promised. A matching pack
    file means checked for every adoption of that definition. The definition's
    `pack` must equal the SHA-256 of the pack's exact bytes
    (`CONTRACT_PACK_HASH`), and a same-identity pack without an adoption is
    `CONTRACT_PACK_ORPHAN`. A pack is closed, immutable under its hash, and
    contains typed acceptance-test templates whose references, conditions,
    inputs, placeholders, bindings, and rendered descriptor shapes are
    checked. Pack shape faults are `CONTRACT_PACK_SHAPE`. A binding carries
    exactly one selector — `flag` naming a question, or `row_field` naming a
    field of a `per-row` template's row set — plus a `map` from the selected
    value to a phrase; a binding of another shape is `CONTRACT_BINDING_SHAPE`.
  - *Rendering and build evidence.* Checked tests render in memory through
    `--render-contract-tests`; they are not committed to
    `05-build-plan.md`. A retired marker block is
    `CONTRACT_BLOCK_RETIRED`. Source-backed build validation includes rendered
    tests in `evidence.acceptance.total`, copies every fixed contract value to
    `resolved_tuning.values` at `contracts.<adoption>.<value>`, re-evaluates
    contract rules, and requires `evidence.contracts` to list each checked
    adoption with its exact pack hash. That entry preserves the pack bytes the
    build was verified against. Promised adoptions contribute no
    rendered tests or pack-evidence entry.

Malformed JSON is reported against the section governing that artifact. Every
finding, including warnings, cites a SPEC section.

## Hints and safety scan

Two English-language heuristics are available only through review mode:

- **§2a tie-break advice** (`TIE_BREAK_CHOICE`, and
  `TIE_BREAK_SHARED_CEILING` for the shared-ceiling family) points out mechanics
  passages where an automatic choice may lack a nearby resolution. Paragraphs
  governed by a `> DELEGATED:` or `> PERSONALIZATION:` tag are exempt. The
  heuristic can flag a player choice that needs no automatic tie-break and can
  miss a rule expressed differently.
- **§4 prose-literal advice** (`PROSE_TUNING_LITERAL`) reports a numeric prose
  literal whose value equals one or more decided `values`. It never compares
  guesses in `open`. Equality cannot prove that the sentence restates the same
  rule, so a reader decides the lead. Fenced code, headings, format lines,
  section numbers, test ids, and list numbers are excluded.

The separate **safety scan** runs by default over text-like package files and
reports prompt-control language, external-action requests, reader-directed
imperatives, long encoded-looking runs, suspicious links, and skipped files in
the `safety` list. Items retain `severity: "warning"` and `data.lint_status`,
but are not findings and never affect conformance. The scan does not decode,
follow, fetch, or execute anything it finds. Its standing signals and known
limits are documented in [INJECTION-LINT.md](INJECTION-LINT.md).

## Deliberate limits

Package validation is not build certification. This CLI does not run a game,
execute acceptance tests, inspect runtime data, prove gameplay correctness,
judge fun, certify a build, or create `opengdd-build.json`. The separate build
protocol is documented in [CERTIFICATION.md](CERTIFICATION.md).

Its [Runner profile](CERTIFICATION.md#runner-profile) gives a named runner's
meaning to general-test scope execution, replay, and observations. Its
[Audit profile](CERTIFICATION.md#audit-profile) records the capture recipe id
in the audit's own record and owns any further evidence it asks for,
resolved-value inspection, and judged direction.
Both are experimental, and the package validator reads neither.

OpenGDD deliberately permits game-specific structured-content definitions. A
spec-agnostic validator cannot infer every record type, field constraint,
reference edge, forbidden cycle, geometry rule, solver predicate, or dialogue
verb from unrestricted Markdown. This validator enforces the collection envelope —
the filename grammar, the optional record schema, and the records against that
schema where one exists — and only the definition
completeness that is mechanically
identifiable. Game-specific checks remain ordinary design prose or acceptance
tests whose execution meaning belongs to the named runner.

The core commerce profile is optional package metadata. Build records may
omit it; when a record carries a copy, source-backed build validation requires
exact JSON equality with the source manifest. The validator does not attempt
game-specific expression profiles or catalog policy beyond requirements
needed by the checks above.

Two §10 duties are deliberately outside package validation. The audit
recomputes a digest over each adoption's definition part so its judged identity
is explicit. It also decides whether a copied catalog definition was edited:
an edited definition is a fork. A fork loses the catalog's identity and its
verification claim. It keeps its status in the package, checked or promised. The package validator stays offline, so it cannot compare a
copy with a catalog or decide that two semantically similar values duplicate
one another.

Rendering checked tests is a read-only view. The pack and adoption remain the
authoritative inputs; the validator neither writes nor compares build-plan
bytes.

The public repository does not hold the fixture packages and the release
checks that test this validator. SPEC §7 names a published conformance suite
that does not depend on one validator as a requirement for version 1.0.
