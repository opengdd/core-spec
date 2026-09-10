# OpenGDD package conformance

This directory contains the OpenGDD v0.8 working-draft package validator. It is a plain
Node.js CLI with no third-party dependencies.

```text
node conformance/validate.mjs <package-dir>
node conformance/validate.mjs --json <package-dir>
node conformance/validate.mjs --build <opengdd-build.json> [<package-dir>]
node conformance/validate.mjs --render-contract-tests <package-dir>
```

The migrator rewrites a v0.6 or v0.7 package or build record in place into
its v0.8 form:

```text
npx opengdd migrate <package-dir> [--dry-run] [--json]
npx opengdd migrate --build <opengdd-build.json> [--dry-run] [--json]
```

`--dry-run` reports without writing, and `--json` emits the report as JSON.
Exit `0` means the migration completed with no manual items, `1` means the
report contains changes that require manual review, and `2` means invalid
arguments, unreadable input, or another migration error.

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
ranges, rewrites supported invariant trees as rule lines, copies bound drawer
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

The guards below are the steward's own checks. They run in the private
repository before a release and are not part of the public repository; they
are described so a reader knows what the validator is held to.

The current revision also has a small release guard:

```text
node conformance/scripts/current-v0.8.mjs
```

It requires zero errors from the six maintained design specs and the three
living corpus packages. Historical corpus snapshots are intentionally outside
that gate. A later format revision should add its own version-named guard and
focused regressions instead of silently inheriting every old package.

The kernel guard runs beside it:

```text
node conformance/scripts/kernel-guard.mjs
```

It requires **zero findings** — errors or warnings — from
`fixtures/kernel/afternoon`, the smallest complete design document the
format promises (SPEC §1's kernel promise). A
change that breaks this guard grew the kernel, and growing the kernel is a
steward decision, never a side effect.

The handbook fragment guard runs beside both:

```text
node conformance/scripts/handbook-fragments.mjs
```

It is the check behind the Handbook's rule that fragments validate as shown
or visibly elide with `…`. It reads the Handbook chapters and nothing else:
every fenced `json` or `test`
block without a visible elision MUST parse as JSON, and a `test` block MUST
additionally carry a legal §6 type, that type's required fields, and no
top-level field outside that type's closed set. It writes nothing. Obligations
that need a package around the fragment — path existence, citation resolution,
AT numbering — are not decidable from a fragment and are left to the package
fixtures rather than faked here.

The human report is the default. `--json` emits one JSON object containing the
package identity, validity, verdict, summary counts, and findings. Findings
carry a stable code, severity, file/location where available, message, and
normative `spec_section`. An error that exists only because the same adoption
still lacks a required answer, value, row field, or verification input also
carries `dependent: true`; `summary.dependent` counts those errors. The process
exits `0` when there are no errors, `1` when a package has one or more
conformance errors, and `2` for CLI usage errors. Warnings never make the exit
status nonzero.

The verdict is `PASS`, `PASS WITH WARNINGS`, `FAIL`, or `NOT CHECKED`. The
last one is build-record only, and it is what `--build` reports when the
optional `<package-dir>` is omitted. That directory is the package the build
record is checked against. SPEC §2d makes a record's subject the
consistency between the record and the package bytes, and SPEC §7 makes eight of
those checks mandatory, so a run that never read the certifying package has
not decided conformance. It lists what it did find, sets `valid` to `null`
rather than `true`, and never reports any passing verdict. Supply the package
directory and the verdict is decidable again.

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
rule false uses `BUILD_TUNING_RULE`. An invalid-line message names the specific
problem. A false-result message names the rule, repeats its line, and shows the
numbers that made it false.

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
Fixed.

The v0.8 widened forms (SPEC §10.3–§10.8) add ten codes:
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
  `MANIFEST_SCHEMA`. The CLI implements the schema subset the v0.8 core
  schemas use:
  local `$ref`, `type`, `required`, `properties`, `additionalProperties`,
  `oneOf`, `const`, `enum`, `pattern`, `minLength`, numeric bounds, array
  `items`, `minItems`, and deep `uniqueItems`.
- **§1a — fantasy:** opening fenced `fantasy` block (anything else before it is
  `FANTASY_POSITION`), at least one player-fantasy
  line, sentence-ending punctuation on each joined run, a 280-character
  combined budget across those lines, three to five feel adjectives,
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
  rules no single-document schema decides: one finite-number `values` map;
  flat dotted keys whose first segment is not reserved and whose segments do
  not begin or end with `-` or use a reserved extension; range targets,
  inclusive bounds, and declared values inside them; and the §4 line-rule
  grammar of one comparison between two arithmetic sides, plus key lookup,
  finite arithmetic, and truth over declared values and package defaults.
- **§4 — prose citations:** every backticked dotted token in a declared
  chapter is classified by §4's four rules. A version string and a file
  mention are skipped; a reserved extension segment is read wherever it sits,
  so `tuning.json.rules` is a file member, not a citation. A token left
  as a bare tuning citation MUST resolve to
  a `tuning.json` key; a dangling one is a hard failure, and carries a
  did-you-mean hint when its opening segment is one edit from a reserved
  segment. A mechanism path is resolved against the file that owns it, for
  every family that owns one:
  - the §9 direction families — `pillars`, `mood`, `anti`, `must_keep`,
    `colors`, `contrast`, `timing`, and `palette` — against a declared
    `direction.json`; the first seven take exactly two segments, while palette
    addresses use §9.1's whole-key-first order;
  - `tuning.json`'s `rules` map: `rules.<name>` names one declared rule;
  - the root `clocks.json` map (§4b): `clocks.<name>` names a declared clock;
  - the `collections/` drawers (§1b): `collections.<drawer>` cites the drawer
    as a set and `collections.<drawer>.<record>` cites one record, whose id is
    its filename. A longer token names a member of the record's own data and
    resolves as far as the record. A dangling one is a hard failure reported against
    §1b, which is what closes the format's last silent-rename gap: renaming a
    record makes every stale citation a finding with a file and a line;
  - the contract adoption file that owns a value (§10.6).

  The reserved-segment list is versioned, and the key check that mirrors it
  names the revision. `palette` and `collections` are reserved as of v0.6.
  `collections` is reserved for the same
  kind of reason and carries the same diagnostic: the segment belongs to the
  `collections/` drawers, so a `collections.*` tuning key legal before
  is rejected naming v0.6 as the revision that took the namespace. The
  `values`, `ranges`, `rules`, `runtime`, `colors`, `contrast`, and `timing`
  were added to the reserved set in v0.7, and a rejected key names that
  revision. `references.*` and `viewing.*` are legal tuning keys again.

  A dangling bare citation and a mechanism path that resolves against nothing
  are both `PROSE_CITATION_DANGLING`, filed against the section that owns the
  family.

  A `runtime.*` address is declared by a numbered root chapter or a clock's
  `advances` array. Another JSON use without either declaration is
  `RUNTIME_UNDECLARED`. Contract adoptions and packs use the same dotted
  adoption/value addresses as prose (§10.6).
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
  at the end of a chapter heading must name one of those modes. Tags compare
  case-insensitively with mode ids, and `all` is retired; an unknown tag and
  the retired `all` tag are `MODE_TAG_DANGLING`.
- **§4b — unchanged:** `scenario` and `general` tests may carry `unchanged`
  with non-empty `values` and `modes`. `UNCHANGED_ADVANCES` warns when a named
  value's clock moves there; `UNCHANGED_UNDEFINED` fails when its clock is
  `none`; the remaining `UNCHANGED_*` codes decide shape, declaration, and the
  presence of `clocks.json`. Wrong-typed values and modes use
  `UNCHANGED_SHAPE`.
- **§10.4 — contract rules:** the §4 one-comparison grammar over a
  definition's bare value names. Invalid names or lines use
  `CONTRACT_RULE_INVALID`; when values are still missing, one dependent
  finding per rule names the missing values. False comparisons use
  `CONTRACT_RULE_FAILED`, or `BUILD_CONTRACT_RULE` over a resolved build
  snapshot.
- **§1b — collections:** `collections/` is a reserved package-root directory
  and presence is the whole declaration. Each immediate
  subdirectory is one collection and the folder name is its id, so there is
  nothing to register and nothing that can contradict what the folder holds.
  A drawer holds one JSON file per record. The filename minus `.json` is the
  record's id and address, it MUST be lowercase kebab-case, and the record
  body is designer data. The filesystem enforces id uniqueness
  by construction, so there is no uniqueness check left to run. A loose file
  directly under `collections/`, a non-`.json` file inside a drawer, and a
  subdirectory inside a drawer are each a failure: drawers are flat in this
  revision, and organization is expressed as sibling drawers with compound
  kebab names. The envelope codes are
  `COLLECTION_LABEL_JSON`, `COLLECTION_LABEL_SCHEMA`, `COLLECTION_RECORD_JSON`,
  `COLLECTION_RECORD_SHAPE`, `COLLECTION_ID_GRAMMAR`, `COLLECTION_STRAY_FILE`,
  and `COLLECTION_SUBDIRECTORY`.

  `_collection.json` is optional and appears only when it has something to
  say; it is closed and schema-validated against `collection.schema.json`, and
  its one field is `record` — an optional record schema written in the closed
  field grammar §10.4 and §1b share: `type`, one of `number`, `integer`,
  `string`, `grid`, `link`, or `list`; `required` or `when` but never both, absent both
  meaning optional, and a §1b condition reads a row domain only because there
  are no flags outside a contract; `options` and `pattern: "kebab-case"` on
  string fields; `unique`; and `description`, where field-level meaning lives.
  A fault in the grammar itself is `COLLECTION_SCHEMA_SHAPE`. With a schema,
  every record in the drawer is validated against it — undeclared fields,
  missing required and conditionally required fields, a present field whose
  condition does not hold, types, closed choices, kebab-case patterns, and
  drawer-wide uniqueness, every one of them `COLLECTION_RECORD_SCHEMA`.
  Without a schema, records are free-form and the format says so plainly
  instead of pretending otherwise. `_`-prefixed keys are annotations
  throughout this family and are read by nothing. A `link` names its target
  drawer with `to`, optionally uses `many`, Boolean `loops`, and
  `mirrored_by`; a `list` carries the same field grammar recursively under
  `of`.

  Drawers are Fixed spec data, exactly as inline contract rows are:
  statements of the package. No drawer authority exists, and no `authority`
  field exists anywhere in this family, so `authority` inside a record file,
  top level or nested, is an ordinary property name a package may use for its
  own data and the format must not read. A designer who hands a drawer's
  content to the builder says so in an ordinary `> DELEGATED:` section, in
  words, checked as all delegation is. The `> COLLECTION:` tag is retired
  together with the defining-section concept it carried, and a surviving tag
  reports its retirement (`COLLECTION_TAG_RETIRED`).

  Prose cites, and the label owns the reading. Game rules live in chapters
  citing `collections.<drawer>` and `collections.<drawer>.<record>`, which the
  §4 prose-citation check resolves. A drawer nothing reaches — no prose
  citation and no record link — is a **warning**
  (`COLLECTION_UNCITED`), the
  `PALETTE_UNREACHED` of collections: the designer is nudged to mention every
  drawer, not ordered to.

  Every `link` value must name a record in its `to` drawer. Existence is
  unconditional; `loops` and `mirrored_by` opt into cycle and two-way-link
  checks. `loops: false` forbids a cycle; omitted or `true` permits one. The
  codes are `COLLECTION_LINK_TARGET`, `COLLECTION_LINK_TYPE`,
  `COLLECTION_LINK_DANGLING`, `COLLECTION_LINK_DUPLICATE`,
  `COLLECTION_LINK_LOOP`,
  `COLLECTION_MIRROR_FIELD`, and `COLLECTION_MIRROR_ONE_WAY`.
- **§2 — authority tags:** a `> PERSONALIZATION: <id>` chapter tag names a
  declared question. A `> DELEGATED:` label is descriptive and resolves
  against nothing.
- **§5 — personalization:** validation against `personalization.schema.json`,
  unique question and choice-option ids, type-correct defaults and choice
  membership, choice-only options, and `sets` only on choice options or number
  questions. Every `sets` target must be a declared value with a range, and
  every package-supplied assignment and default must sit inside that range.
  Answers are applied in question order; an out-of-range build answer is
  refused. Contract values are fixed in their adoption and are rejected as
  `sets` targets.
  The current codes are `PERSONALIZATION_SETS_TYPE`,
  `PERSONALIZATION_SETS_TARGET`, `PERSONALIZATION_SETS_UNRANGED`, and
  `PERSONALIZATION_SETS_RANGE`.
- **§7a — grid layers:** `grid` is a field type in the drawer's record schema,
  and a schema declaring at least one grid field is what makes the drawer
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
  computes WCAG 2.1 contrast from the declared colours before a build and
  reports a pair below its floor as `DIRECTION_CONTRAST_FAILED`. A surviving
  fenced direction block is `DIRECTION_FENCE_RETIRED`; ordinary delegated
  presentation prose replaces it.
- **§6 — `test` blocks:** unique, ascending `AT-<n>` headings (gaps permitted)
  in canonical `05-build-plan.md`, an
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

- **§7 — runner identity:** the build schema admits a closed
  `evidence.runner` object containing non-empty `id` and `version`.
  Source-backed validation
  requires the runner identity when any game-local or generated acceptance
  test is a `scenario` or `general`, or carries `replay`, `target`, or
  `direction_claims`. `evidence.acceptance.sampled` may name only game-local
  general tests; `BUILD_SAMPLED_UNKNOWN` and `BUILD_SAMPLED_TYPE` report the
  two mismatches. A legacy build record carrying
  `renderer`, `resources`, `capture_profile`, `direction_result`, or
  `evidence.direction_observations`, or `evidence.algorithm` receives one focused `BUILD_SCHEMA`
  error; v0.7 and v0.8 records carry none of them. A record missing an answer for a
  declared question is `BUILD_ANSWER_MISSING`; an answer naming no declared
  question is `BUILD_ANSWER_UNKNOWN`; an answer of the wrong type for its
  question is `BUILD_ANSWER_TYPE`; a choice answer naming no declared option
  is `BUILD_ANSWER_OPTION`; an out-of-range numeric answer is
  refused under `BUILD_ANSWER_REJECTED`; and a resolved value that differs
  from the one the source-and-answer pipeline computes is `BUILD_TUNING_VALUE`.
  A record checked without its source directory warns
  `BUILD_SPEC_CROSS_CHECKS_SKIPPED` and reaches no verdict. The
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

## Heuristic warnings

Three checks are deliberately advice, not proof:

- **§2a tie-break advice** (`TIE_BREAK_CHOICE`, and `TIE_BREAK_SHARED_CEILING`
  for the shared-ceiling family) scans mechanics prose for targeting, ordering,
  simultaneity, equality, and choice-shaped language without a nearby apparent
  resolution. It also recognizes the AR-1 ordering-under-a-shared-ceiling
  family: allocation/composition/formula language combined with total caps,
  limits, or ceilings. Paragraphs governed by a `> DELEGATED:` or
  `> PERSONALIZATION:` tag are exempt because the designer handed the choice
  over. Ordinary sequence words such as "before", "after", and "then" do not
  count as a resolution. The scan can still flag player choices that need no
  automatic tie-break and can miss rules expressed with unusual language.
- **§4 prose-literal advice** (`PROSE_TUNING_LITERAL`) reports a numeric prose
  literal whose numeric value equals one or more declared values. Equality
  alone cannot prove that the prose literal is the same semantic parameter, so
  these are review leads.
  Fenced code and explicitly non-normative lines are excluded. False
  positives and false negatives remain possible.
- **Injection-surface lint — standing, warning-only** scans text-like package files
  for prompt-control language, external-action requests, reader-directed
  imperatives, long encoded-looking runs, and suspicious links. Every finding
  is a warning; this family never fails conformance. It does not decode, follow,
  fetch, or execute anything it finds. The draft signals and their known limits
  are documented in [INJECTION-LINT.md](INJECTION-LINT.md).

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
verb from unrestricted Markdown. This validator enforces the drawer envelope —
the filename grammar, the optional record schema, and the records against that
schema where one exists — and only the definition
completeness that is mechanically
identifiable. Game-specific checks remain ordinary design prose or acceptance
tests whose execution meaning belongs to the named runner.

The core commerce profile is optional package metadata. Build records may
omit it; when a record carries a copy, source-backed build validation requires
exact JSON equality with the source manifest. The validator does not attempt
game-specific expression profiles or catalogue policy beyond requirements
needed by the checks above.

Two §10 duties are deliberately outside package validation. The audit
recomputes a digest over each adoption's definition part so its judged identity
is explicit. It also decides whether a copied catalogue definition was edited:
an edited definition is a fork that drops to promised until it has a new
identity and pack. The package validator stays offline, so it cannot compare a
copy with a catalogue or decide that two semantically similar values duplicate
one another.

Rendering checked tests is a read-only view. The pack and adoption remain the
authoritative inputs; the validator neither writes nor compares build-plan
bytes.

The corpus run used to establish current behavior is recorded in
[BASELINE-REPORT.md](BASELINE-REPORT.md).

## Fixtures

`fixtures/` holds paired minimal packages that pin validator behaviour.
`fixtures/structural/{holds,broken}` covers the §2 personalization tag, §4
and §5 schemas, §4 prose citations, §4b runtime declarations, clocks and mode
tags, §2c ruleset tags, §4b `unchanged`, §5 assignments, §1b record schemas,
§7a grid layers, §9 palette references, §1a fantasy labels and references, §4
reserved keys, and §6 acceptance-test numbering. It pins §4 rule evaluation
over both the declared values and the default-resolved snapshot. `holds`
passes with no findings, and `broken` carries one seeded fault per check.

Four structural checks have two arms apiece and carry one fault per arm: the
§1a reference fence (a typed reference and a bare citation), the §4 prose
citation check (a dangling tuning citation and a dangling mechanism path),
the §4 reserved-key check (a reserved first segment and a reserved extension
segment in a non-final position), and the §9 palette check (a dangling colour
binding and a declaration-time key collision). `holds` carries the
classification rules themselves as prose: a resolving tuning key, a
mechanism path, a version string, and two file mentions, one with its extension
segment in the middle. This keeps every skipped class pinned.

`fixtures/links/{holds,broken}` covers single and many links, nested
`list` / `of` rows, missing targets, wrong value types, duplicate ids, loops,
and mirror agreement; the pair produces zero and seven findings.

`fixtures/collections/{holds,broken}` covers the collection envelope and
record-schema family. `holds` passes with no findings and exercises a `boards`
drawer whose label spans the field grammar: a unique string, a closed choice,
a kebab-case pattern, an integer, a number, a conditioned field, and two grid
fields that agree in size. Its `notes` drawer has no label and holds free-form
designer data. The package also carries resolving drawer and record citations
and one scenario test over the note-to-board relation.

`broken` seeds the 23 findings pinned by host parity. Two stray files, a
subdirectory inside a drawer, two ill-formed ids, an unparsable label, a label
with an unknown field, an unparsable record, and an array where a record must
be an object pin the envelope. A `schema-odd` drawer breaks the field grammar
three ways: an undefined type, `required` and `when` together, and `options`
on a non-string. A `records-odd` drawer breaks its valid schema five ways: an
undeclared field, a repeated unique value, a value outside a closed option
set, a wrong type, and a missing required field. One grid pair disagrees in
row count and another in column count. One chapter carries the retired
`> COLLECTION:` tag, one drawer is unreached, and two prose citations dangle.

`fixtures/build-cross-check` holds `opengdd-build.json` articles validated
against a certifying spec directory. The steward's host-parity check
pins the exact finding sets.

`fixtures/mood/{holds,broken}` covers mood borrows, anti-reference images, one
viewing object, a passing contrast promise, and a tuning key named
`references.x`, which is legal again. `holds` has no findings; `broken` adds
one missing borrow image and produces `MEDIA_PATH_MISSING`.

`fixtures/palette/{holds,broken}` covers the §9.1 palette map, whole-key-first
resolution, mood palette addresses, measured colour and contrast promises,
reachability, prose citations, and direction-image paths. `holds` has no
findings. `broken` pins the current 15-error multiset, including
`PALETTE_SHAPE`, `PALETTE_ENTRY_FORM`, `PALETTE_COLOR_DUPLICATE`,
`PALETTE_KEY_COLLISION`, `PALETTE_UNREACHED`,
`DIRECTION_MOOD_PALETTE_DANGLING`, `DIRECTION_COLOR_REFERENCE`,
`DIRECTION_COLOR_DANGLING`, `DIRECTION_CONTRAST_FAILED`, and a dangling prose
citation. The host-parity check asserts both pairs through the Node and
file-map hosts.

`fixtures/contracts/` covers §10 in five packages.

- **`holds`** passes with no findings. `beacon.json` and
  `dark-beacon.json` are two filled adoptions with byte-identical definitions,
  independent answers and values, inline relay rows, and one shared
  `latch-relay-1.pack.json`. `stamina.json` is a third filled adoption with the
  independently refereed `ranged-value-1.pack.json`. Together the two packs
  render 14 checked acceptance tests and exercise asked-question conditions,
  bindings, value and row citations, per-row expansion, general-test inputs, and
  multi-paragraph text.
- **`broken`** produces the 24 findings pinned by host parity. Its compact
  adoptions and packs cover filled-form shape, question cycles and answers,
  values, row bindings, every row `within` shape and range arm, rule parsing
  and evaluation, non-live verification input refusal, definition divergence,
  pack shape and references, hash mismatch, and an orphan pack.
- **`fresh`** pins a copied definition with empty designer maps and a
  verification entry waiting on an unanswered flag. Its exact findings
  distinguish nine dependent errors that clear with answers, values, or inputs
  from one genuine rule syntax error; its named `within` bounds stay silent
  while their adoption values are missing.
- **`promised`** passes with no findings. Its definition names an absent pack,
  so the adoption is promised, renders zero tests, and contributes no checked
  pack entry to build evidence.
- **`reserved-name`** pins the focused migration diagnostic for a pre-existing
  designer-owned `contracts/` folder plus the folder-entry findings. Host
  parity pins its complete 12-finding result.

One check has no fixture: the warning for a package-root directory whose name
differs from `contracts` only by case cannot be committed beside a real
`contracts/` directory on a case-insensitive filesystem, and a package
carrying only the miscased folder would pin nothing else.

The following families are pinned as mutations inside the host-parity check rather
than as committed packages, because each arm is one edit to a package that
already exists and committing eight near-identical copies would obscure what
the arm is.

- **Authority grain (§§1b, 2).** A drawer is Fixed package data outright,
  which retires four of this family's five arms: no prose scope, tag,
  or record field decides a drawer's authority, so there is no grain left to
  pin. The arm that survives is the over-enforcement direction over the
  structural fixture — package-owned nested data using the ordinary property
  name `authority`, which must produce no finding.
- **Contract filled forms and packs (§10).** Mutations cover asked and
  not-asked answers, fixed-value types and full ranges, row-set binding,
  question/value name collisions, rule grammar and evaluation, definition
  divergence, pack shape/hash/orphan handling, template input liveness, pack
  rendering, fixed build snapshots, and checked build evidence.
- **Attributable runtime evidence (§7).** Closed and non-empty runner identity,
  runtime versus document-only test suites, checked pack runtime tests, and one
  focused `BUILD_SCHEMA` error for historical build-profile and direction
  fields.
