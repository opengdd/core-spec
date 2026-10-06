# OpenGDD technical changelog

This file records changes to OpenGDD interfaces for validators, editors, and build pipelines.
Package authors can read the [designer changelog](CHANGELOG.md).
The entries for v0.2 to v0.6 are in the [changelog archive](CHANGELOG-ARCHIVE.md).

## v0.9 — released 2026-10-06

Changes that concern package authors are in the [designer changelog](CHANGELOG.md).

### Versions and addresses

| Interface | v0.8 | v0.9 |
| --- | --- | --- |
| Format version | Version: `0.8` | Version: `0.9` |
| Validator and `opengdd` npm package | Version: `0.8.0` | Version: `0.9.0` |
| Schema `$id`, for each of the seven root schema filenames | Address: `/schema/core/v0.8/<filename>` on `https://opengdd.org` | Address: `/schema/core/v0.9/<filename>` on `https://opengdd.org` |
| Contract catalog | Address: `/contracts/catalogue/` | Address: `/contracts/catalog/`; the old address redirects here. |
| Palette Handbook chapter | Address: `/handbook/palette-and-colour-promises/` | Address: `/handbook/palette-and-color-promises/`; the old address redirects here. |
| Safety-scan document | Site page: absent | Site page: `/conformance/injection-lint/` |

Earlier schema addresses and released specification pages keep their bytes.
The npm exports and Node.js minimum (`18`) are unchanged. Its validator
modules and seven schemas are copies of the repository sources.

### Schema changes

Every schema changes `/$id` as stated above. Titles and descriptions have
version, vocabulary, spelling, or explanatory edits; those edits add no constraint.
Pointers below are JSON pointers in the schema, not in a package file.

#### `manifest.schema.json`

| Pointer | v0.8 | v0.9 |
| --- | --- | --- |
| `/properties/opengdd/const` | Version constant: `"0.8"` | Version constant: `"0.9"` |

#### `tuning.schema.json`

| Pointer | v0.8 | v0.9 |
| --- | --- | --- |
| `/properties/open` | Property: absent | Optional object: names use `#/$defs/tuningKey`; values are numbers or `null`. |
| `/$defs/tuningKey/pattern` | Key pattern: dotted names could have only digits in every segment. | Key pattern: adds `^(?![0-9]+(?:\.[0-9]+)+$)` before the unchanged name grammar; rejects such names. |

#### `personalization.schema.json`

| Pointer | v0.8 | v0.9 |
| --- | --- | --- |
| `/$defs/question/properties/id/pattern` | Pattern: absent; a non-empty string was enough. | Pattern: `^(?![\s\S]*\s)`; rejects whitespace anywhere in the id. |

Option ids have no new pattern. The tuning-key pattern in this schema is unchanged.

#### `collection.schema.json`

| Pointer | v0.8 | v0.9 |
| --- | --- | --- |
| `/properties/record/additionalProperties` | Field shape: `{ "type": "object" }` | Field shape: `{ "$ref": "#/$defs/topLevelField" }` |
| `/$defs/topLevelField` | Definition: absent | Object definition: `properties.of` refers to `#/$defs/nestedRecord`. |
| `/$defs/nestedRecord` | Definition: absent | Object definition: `additionalProperties` refers to `#/$defs/nestedField`; `patternProperties.^_` permits annotations. |
| `/$defs/nestedField` | Definition: absent | Object definition: `properties.of` refers to `#/$defs/nestedRecord`, recursively. |

The schema checks object shapes for nested `of` declarations. The validator
checks the closed field grammar. It permits `open: true` only on a
top-level `number` or `integer` field without `required`, even `required: false`.
It rejects a `grid` field inside a `list` (§§1b, 12.1).

#### `clocks.schema.json`

No property, pattern, or constraint changes.

#### `direction.schema.json`

No property, pattern, or constraint changes.

#### `opengdd-build.schema.json`

This table names each place by the member of the build record that the
schema describes, not by a JSON pointer.

| Member of the build record | v0.8 | v0.9 |
| --- | --- | --- |
| `opengdd` | Version constant: `"0.8"` | Version constant: `"0.9"` |
| `evidence`, required members | Required members: `result_hash`, `payload`, `acceptance` | Required member: `acceptance` |
| `evidence`, condition | Conditional constraint: absent | Conditional constraint: requires `result_hash` and `payload` when `passed >= 1` or any `not_passed` entry has a result other than `not-run`. |

The next rows are members of `evidence.acceptance`.

| Member of `evidence.acceptance` | v0.8 | v0.9 |
| --- | --- | --- |
| `sampled`, each item | String constraint: pattern `^AT-[1-9][0-9]*$` | String constraint: `minLength: 1`. The pattern is removed. |
| `not_passed` | Member: absent | Optional object: each key is a non-empty test name. Each value is a closed object with the required members `result` and `reason`. |
| `result` of a `not_passed` entry | Member: absent | Result string: one of `failed`, `partial`, `not-run`. |
| `reason` of a `not_passed` entry | Member: absent | Reason string: `minLength: 1`. |

### Diagnostic codes

The v0.8 validator has 200 codes. The v0.9 validator has 211 codes:
13 are new and 2 are removed. Another 47 existing codes change kind,
report list, or accepted input and trigger. Message-only and location-only
edits are excluded from that count.

| New code | Kind | Specification | Reported when |
| --- | --- | --- | --- |
| `AUTHORITY_TAG_OVERLAP` | Error | §2 | Authority tags overlap at the same depth of one blockquote. |
| `BUILD_ACCEPTANCE_ACCOUNTING` | Error | §7 | Acceptance accounting has `passed + count(not_passed) != total`. |
| `BUILD_NOT_PASSED_UNKNOWN` | Error | §7 | A `not_passed` name is absent from the source tests. |
| `BUILD_RECORD_VALUE` | Error | §7 | A snapshot value for an open integer record field is fractional. |
| `BUILD_SAMPLED_NOT_RUN` | Error | §7 | A sampled test also has result `not-run`. |
| `BUILD_SPEC_PLAN_MISSING` | Error | §§1, 7 | The source build plan is missing, unreadable as a file, or resolves outside the package. |
| `CONTRACT_CITATION_AMBIGUOUS` | Error | §10.10 | A chapter fragment matches more than one heading outside fenced code. |
| `CONTRACT_CITATION_OPEN` | Error | §10.10 | A contract value or row citation names an open tuning key. |
| `RULESET_TAG_OVERLAP` | Error | §2c | Ruleset tags overlap at the same depth of one blockquote. |
| `TUNING_OPEN_OVERLAP` | Error | §4 | A key occurs in both `values` and `open`. |
| `TUNING_PIN_CONFLICT` | Error | §4 | Two pins give one open record field different numbers in a checked environment. |
| `TUNING_RULE_GUESS_FAILED` | Warning | §4 | A rule is false using at least one unresolved guess. |
| `TUNING_RULE_GUESS_UNCOMPUTABLE` | Warning | §4 | Rule arithmetic fails because of a guess. |

| Removed code | v0.8 trigger | v0.9 behavior |
| --- | --- | --- |
| `BUILD_ACCEPTANCE_INCOMPLETE` | Acceptance counts: `passed != total` was an error. | Acceptance counts: accounted failures are valid reports; accounting errors use `BUILD_ACCEPTANCE_ACCOUNTING`. |
| `VERIFICATION_AT_MISSING` | Build plan: no numbered test was an error. | Build plan: numbered acceptance tests are optional. |

| Existing code | v0.8 | v0.9 |
| --- | --- | --- |
| `BUILD_SCHEMA` | Schema checks: required evidence for every record; sampled names were game-local. | Schema checks: conditional evidence and expanded acceptance fields above. |
| `BUILD_TUNING_KEYS` | Snapshot keys: package `values` and live contract values. | Snapshot keys: also `open` keys and present open record fields. |
| `BUILD_TUNING_RANGE` | Range checks: package values. | Range checks: also open tuning values. |
| `BUILD_TUNING_VALUE` | Value checks: every source-and-answer value had to match. | Value checks: unassigned ranged and open tuning values are builder choices. |
| `BUILD_TUNING_RULE` | Rule checks: snapshot values only. | Rule checks: also decided record fields; missing expected snapshot keys use `BUILD_TUNING_KEYS`. |
| `BUILD_ANSWER_REJECTED` | Answer checks: ranged values targets. | Answer checks: also ranged open targets. |
| `BUILD_RUNNER_REQUIRED` | Runner check: any runtime source test existed. | Runner check: at least one source test ran. |
| `BUILD_SAMPLED_UNKNOWN` | Name check: game-local tests only. | Name check: also rendered contract tests. |
| `BUILD_SAMPLED_TYPE` | Type check: game-local sampled tests were `general`. | Type check: rendered contract sampled tests must also be `general`. |
| `COLLECTION_LABEL_SCHEMA` | Schema check: each field declaration was an object. | Schema check: also recursive object shapes for `of`. |
| `COLLECTION_SCHEMA_SHAPE` | Field grammar: `open` was unknown; nested `grid` was accepted. | Field grammar: permits top-level numeric `open: true` without `required`; rejects nested `grid`. |
| `COLLECTION_RECORD_SCHEMA` | Numeric fields: required numeric values when present. | Open numeric fields: also permit `null`. |
| `COLLECTION_UNCITED` | Reach check: prose or a link field reached a collection. | Reach check: a tuning rule naming a record field also reaches it. |
| `CONTRACT_ENVELOPE_TYPE` | Required text: could be empty; `mechanism` could be empty. | Required text: rejects empty or whitespace-only `summary`, `asks`, `meaning`, value `description`, and mechanism entries; requires at least one mechanism entry. |
| `CONTRACT_NAME_GRAMMAR` | Value names: kebab-case, with reserved names excluded. | Value names: must also begin with a lowercase letter. |
| `CONTRACT_CITATION_AUTHORITY` | Section check: authority tags reached heading sections. | Section check: only tagged blockquotes reach text; the entire cited section must remain Fixed. |
| `CONTRACT_CITATION_DANGLING` | Heading check: included fenced headings; unknown open keys had no declaration. | Heading check: excludes fenced headings; declared open keys use `CONTRACT_CITATION_OPEN`. |
| `FANTASY_SENTENCE` | Fantasy check: required punctuation at the end of each run. | Fantasy check: only requires at least one fantasy line. |
| `FANTASY_FEEL` | Entry count: split on `,`; stripped one final `.`, `!`, or `?`. | Entry count: also splits on `、`, `，`, `،`, `・`; strips a Unicode sentence terminator and closing marks. |
| `FANTASY_ANTI_REFERENCES` | Empty-text check: stripped one final `.`, `!`, or `?`. | Empty-text check: strips a Unicode sentence terminator and closing marks. |
| `FANTASY_REFERENCE` | Reference check: chapter anchors used ASCII names. | Reference check: also recognizes Unicode chapter anchors and open tuning citations. |
| `PERSONALIZATION_SCHEMA` | Question ids: any non-empty string. | Question ids: reject whitespace. |
| `PERSONALIZATION_SETS_TARGET` | Target check: `values` keys only. | Target check: also `open` keys; record fields remain excluded. |
| `PERSONALIZATION_SETS_UNRANGED` | Target check: every target needed a range. | Target check: an `open` target needs no range. |
| `PERSONALIZATION_SETS_RANGE` | Range check: assignments to ranged values. | Range check: also assignments to open targets, including numeric defaults. |
| `PERSONALIZATION_TAG_DANGLING` | Tag check: top-level quotes. | Tag check: also nested quotes outside fenced code. |
| `RULESET_TAG_SHAPE` | Tag check: top-level quotes. | Tag check: also nested quotes outside fenced code. |
| `RULESET_INITIAL` | Initial check: top-level ruleset tags. | Initial check: also nested ruleset tags. |
| `TUNING_SCHEMA` | Schema check: `values`, `ranges`, `rules`; all-digit keys permitted. | Schema check: also `open`; all-digit keys rejected. |
| `TUNING_SHAPE` | Object check: `open` was unknown. | Object check: permits an `open` object. |
| `TUNING_KEY` | Key check: all-digit segments permitted. | Key check: rejects all-digit keys; also checks `open` keys. |
| `TUNING_KEY_RESERVED` | Reserved-name check: `values` and `ranges` keys. | Reserved-name check: also `open` keys. |
| `TUNING_NUMBER` | Number check: `values` entries. | Number check: also `open` entries, which permit finite numbers or `null`. |
| `TUNING_RANGE_KEY` | Range target: must exist in `values`. | Range target: may exist in `values` or `open`. |
| `TUNING_RANGE_VALUE` | Bounds check: decided values only. | Bounds check: also numeric open guesses. |
| `TUNING_RULE_INVALID` | Rule inputs: decided tuning values. | Rule inputs: also open numbers and record fields; rejects fractional integer pins and decided arithmetic errors. |
| `TUNING_RULE_FAILED` | Rule check: authored values and defaults. | Rule check: decided environments include record fields and independent pins; guesses use warnings. |
| `PROSE_CITATION_DANGLING` | Citation check: tuning values; collection citations resolved through the record. | Citation check: also open tuning keys; checks the first field segment against the record or schema. |
| `PROSE_TUNING_LITERAL` | Warning in `findings`: omitted lines marked non-normative. | Hint in `hints`, only in review mode: compares decided `values`; no non-normative escape. |
| `TIE_BREAK_CHOICE` | Warning in `findings`: omitted authority-tagged heading sections. | Hint in `hints`, only in review mode: omits authority-tagged blockquotes. |
| `TIE_BREAK_SHARED_CEILING` | Warning in `findings`: omitted authority-tagged heading sections. | Hint in `hints`, only in review mode: omits authority-tagged blockquotes. |
| `INJECTION_EXTERNAL_ACTION` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |
| `INJECTION_OBFUSCATED_BLOCK` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |
| `INJECTION_PROMPT_CONTROL` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |
| `INJECTION_READER_DIRECTIVE` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |
| `INJECTION_SCAN_SKIPPED` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |
| `INJECTION_SUSPICIOUS_LINK` | Warning in `findings`. | Safety notice in `safety`; still `severity: "warning"`. |

### Validator output and command line

`--json` writes one object on passing and failing validation runs.

| Report field | Shape or change |
| --- | --- |
| `validator`, `format`, `validator_version` | Identity fields: validation kind, `"0.9"`, and `"0.9.0"`. |
| `package` or `build` | Subject object: `id` and `path`. A missing package directory has `package.id: null`. |
| `valid`, `verdict` | Result fields: package validity depends only on errors; build results follow the precedence below. |
| `outcome` | New build-only string: the derived outcome; absent from package reports. |
| `findings` | Conformance list: errors and warnings. |
| `hints` | New always-present list: optional review hints with `severity: "hint"`. |
| `safety` | New always-present list: safety notices with `severity: "warning"`. |
| `summary` | Count object: `errors`, `dependent`, `warnings`, `findings`, and new `hints` and `safety` counts. The last two lists do not contribute to `warnings` or `findings`. |
| Each finding, hint, or notice | Entry object: `code`, `severity`, `spec_section`, `file`, `message`; optional `line` and check-specific `data`. An error waiting on required input can carry `dependent: true`. |
| `data.lint_status` | Safety marker: changes from `advisory-v0.7` to `advisory`; `spec_section` becomes `§1`. Other safety data fields are unchanged. |
| Collection link `data.drawer` | Existing field: keeps its name. No `data` field is renamed. |

Findings in `tuning.json` now include line numbers. Near-name citation
suggestions are message text, not new `data` fields.
Messages are not a stable interface; messages now use “collection” and
“schema file” for “drawer” and “label”, while codes keep their names.

`validatePackage(host, dir, { review: true })` or `opengdd validate --review`
enables hints. Only the Boolean `true` enables the library option. Hints and
safety notices never affect validity, verdict, or exit status. Build mode
returns empty `hints` and `safety` lists. `--review` with `--build` or
`--render-contract-tests` is a usage error.

`renderContractTests` also returns `hints` and `safety`. New library exports
are `calculateTuningEnvironments`, `readTuningEnvironments`,
`buildSnapshotAddresses`, and `SAFETY_SCAN_LIMIT`.

Package validation exits `0` without errors, `1` with errors, and `2` for
usage or execution errors. Build outcomes use the first matching condition (§7).

| Condition, in precedence order | `outcome` | `valid` | `verdict` | Exit |
| --- | --- | --- | --- | --- |
| Record: has errors. | `invalid` | `false` | `FAIL` | `1` |
| Source package: not supplied, with no record errors. | `not checked` | `null` | `NOT CHECKED` | `3` |
| Source package: has no acceptance tests. | `not verified` | `true` | `NOT VERIFIED` | `3` |
| Source test: at least one did not pass. | `incomplete` | `true` | `INCOMPLETE` | `3` |
| Source tests: all passed. | `conforming` | `true` | `PASS` or `PASS WITH WARNINGS` | `0` |

Build usage errors exit `2`. The text report prints the outcome on `Result:`.
Without a source package, checking still covers JSON, the build schema,
retired fields, payload-path safety, and acceptance accounting. Package
identity, answers, snapshot consistency, test names, runner requirements,
and commerce equality need the source package.

### Parsing and evaluation changes

- Tags cover their own line and consecutive lines with at least the same
  quote depth. A bare `>` continues a quote. A smaller depth ends the scope.
  Spaces before `>` are allowed. Tags inside fenced code are ignored (§2).
- Nested tags use additional `>` markers. The deepest authority tag decides
  authority. The deepest ruleset tag independently decides applicability.
  Two tags of either kind at the same depth in one blockquote are errors.
  Text outside authority tags is Fixed. Text outside ruleset tags applies
  in every ruleset (§§2, 2c).
- `DELEGATED:` line text is passage text. `PERSONALIZATION:` and `RULESET:`
  line text identifies a question or ruleset (§§2, 2c).
- Fences use at least three backticks or tildes. A closing fence uses the
  same character, at least the opening length, and the same quote depth.
  A decrease in quote depth also ends a quoted fence (§2).
- Mode tags can occur anywhere in a heading. All-digit bracket tokens and
  tokens followed by `(` or `[` are excluded. `[ALL]` is rejected only when
  a time mode is declared. This behavior is unchanged (§§4b, 12.2).
- Fantasy lines need no final punctuation. `Feel:` splits on `,`, `、`,
  `，`, `،`, or `・`, trims entries, discards empty entries, and requires
  three to five. A final Unicode `Sentence_Terminal` character and following
  closing brackets or quotation marks are removed from `Feel:` and
  anti-reference text. Labels remain `Feel:`, `NOT:`, and `Anti-references:`.
  Chapter-anchor detection now includes Unicode letters and numbers (§1a).
- A hyphen inside a dotted rule name belongs to the name. Subtraction needs
  a space before the minus. This lexer behavior is unchanged. Contract value
  names now begin with a lowercase letter (§§4, 10.4).
- Rules can read tuning keys and top-level numeric record fields, including
  numeric fields of records without a schema. In an open field, a number
  is a guess, `null` has no guess, and absence means not applicable. An absent
  or nonnumeric record field is an invalid rule reference (§§1b, 4).
- Open tuning numbers use bare tuning-key citations. `open` is not a new
  reserved citation prefix (§4).
- Rules are checked in the authored environment and, when different, the
  personalization-default environment. Each base contains decided tuning
  and record numbers. The default base also contains open tuning keys set by
  default answers. A top-level equality pins a present open record field
  when one side is that address alone and the other uses only base numbers
  and literals. Parentheses around the address are permitted. Pins use the
  unchanged base, so they never depend on another pin or a guess (§4).
- Guess evaluation starts with the default decided lookup and its pins.
  Guesses fill only remaining keys. A false rule using a guess is a warning.
  Division by zero or a non-finite result is a warning only when the failing
  arithmetic depends on a guess. Division-by-zero dependencies are the
  denominator's keys. Non-finite-result dependencies are the failing
  arithmetic subtree's keys. Decided arithmetic errors remain errors.
  A rule with neither a decided value nor a guess waits for the build (§4).
- Arithmetic uses binary64, ties to even, left association at equal
  precedence, and exact comparisons. Division by zero and non-finite results
  fail evaluation. These arithmetic rules are unchanged (§§4, 10.6).
- Prose field citations require the first field segment to exist in the
  record or its schema. Further segments are not recursively checked (§1b).
- Contract value citations resolve to authored `values`, including ranged
  values, or a numeric value of the same adoption. They do not use a build's
  changed ranged value. Open tuning keys and cross-adoption value citations
  are rejected. Chapter citations require exactly one unfenced heading;
  the section ends at the next heading of the same or a higher level and
  must be wholly Fixed (§10.10).
- Sampled names can identify game-local or rendered contract `general`
  tests. An unlisted test is not reported as sampled. Only a passed,
  unlisted test reports a whole-scope check (§§6, 7).
- Measured direction promises still require a game-local covering test.
  Timing keys still name `values`, so an open tuning key is rejected (§9.8).

### Build records

`resolved_tuning.values` contains exactly every `values` key, every `open`
key, every present open record field at its `collections.` address, and
every live contract value as its resolved number (§§5, 7).
An answer sets its target. An unassigned ranged value can be any number
inside its range. An unassigned open value is a builder choice. Decided
and contract values must match the source-and-answer calculation. Open
integer record fields require integers. Build rule evaluation combines the
snapshot with decided record fields.

`passed + count(not_passed)` must equal `total`, even without a source
package. Only source tests count. Builder-added tests do not count.
`not_passed` keys are `AT-n`, `<adoption>/<template>`, or
`<adoption>/<template>/<row-id>`; contract keys omit the heading's `AT `.

| Result | Meaning |
| --- | --- |
| `failed` | Test result: the test ran completely and did not pass. |
| `partial` | Test result: only part of the test ran. |
| `not-run` | Test result: the test did not run. |

Every entry has a reason. A `not-run` test cannot also be sampled.
The schema requires `result_hash` and `payload` when any test ran.
Source-backed validation requires `runner` then. No source tests means a
valid record is not verified. A test requiring a human observation is
reported `not-run` (§§6, 7).

### Migrator

`opengdd migrate <package-dir>` targets v0.9. `--dry-run` writes nothing.
The v0.6 input conversion replaces retired file shapes, addresses, rules,
contracts, and build-plan blocks. The v0.7 step keeps its file shapes.
The v0.8 version step updates `manifest.json` and keeps chapter bytes.
Legacy forms still present in v0.7 or v0.8 input can require conversion.
The staged v0.9 package is validated. Every remaining error is a manual
item, including an error already present before migration. A conversion
that introduces an error refuses the write.

| Report key | Content |
| --- | --- |
| `root` | Package path: the absolute migration directory. |
| `changes` | Change list: objects with `file` and `message`. |
| `manual` | Manual-item list: location-specific tag-scope changes, former `DELEGATED:` labels, unresolved conversions, and remaining validation errors. |
| `reviewNotes` | Package note list: sentence-like `DELEGATED:` line text and applicable reminders about seeds, build stages, and Delegated passages. |
| `noOp` | Package Boolean: no conversion was needed. |
| `refused` | Optional library Boolean: conversion was refused when `collectOutputs` is requested. |
| `outputs` | Optional library list: staged `file`, `relative`, and `text` entries when `collectOutputs` is requested. |
| `json` | Build-report object: the converted record; replaces package-only `root`, `reviewNotes`, and `noOp`. Build reports also have `changes` and `manual`. |
| `error` | CLI error string: returned alone for an unreadable input or migration exception in JSON mode. |

Manual items exit `1`. No manual items exits `0`. Invalid arguments,
unreadable input, or migration exceptions exit `2`. Review notes do not
affect the exit status. The v0.8 version step never rewrites chapter
meaning, guesses, question ids, seeds, or contract versions.

`opengdd migrate --build <record> [<package-dir>]` converts legacy v0.6
and v0.7 record shapes through v0.8. It changes v0.8 to v0.9 only when
the source snapshot address list equals the recorded list. Otherwise it
keeps v0.8 and reports a manual item. Equal address lists do not establish
unchanged tag meaning. Migration never regenerates test results or evidence
payloads.

### Contracts

All 15 catalog definitions have version 2: action-legibility, camera-framing,
container, control-options, event-resolution, fact-list, grid-and-direction,
input-forgiveness, job-resolution, pointer-command, ranged-value, replay-scope,
state-persistence-scope, suspension-and-catch-up, and timed-window.
Version 2 changes text and names only. Behavior is unchanged, except for two
corrections of text that stated something the contract or the format does
not support. In `ranged-value-2`, the last `mechanism` entry and the
description of the row field `condition-declared-in` no longer name the
address form `contracts.<adoption>.bands.<id>`, which
`CONTRACT_CITATION_GRAMMAR` rejects. They say to cite the Fixed chapter
section that states the band. In the `container-2` pack, the text of the
template for the stack limit no longer says that the limit holds in every
container; the test steps are unchanged. Each definition
has a new version identity and each pack has a new hash. Version 1 definitions
and packs remain available. Downloadable version 2 example adoptions omit
annotation keys that start with `_`.

| Contract | Old name | New name | Kind of name |
| --- | --- | --- | --- |
| event-resolution | `is-cancelled` | `is-canceled` | Option id and row option value. |
| event-resolution | `orphan-override-is-cancelled` | `orphan-override-is-canceled` | Template id. |
| fact-list | `colour-alone` | `color-alone` | Question id. |
| fact-list | `player-recolourable` | `player-recolorable` | Option id. |
| fact-list | `colour-and-audio-policy-holds` | `color-and-audio-policy-holds` | Template id. |
| fact-list | `colour-result` | `color-result` | Binding id. |
| grid-and-direction | `cell-centres-are-whole-numbers` | `cell-centers-are-whole-numbers` | Option id. |
| grid-and-direction | `four-neighbours` | `four-neighbors` | Option id in movement and effects questions. |
| grid-and-direction | `eight-neighbours` | `eight-neighbors` | Option id in movement and effects questions. |
| grid-and-direction | `movement-neighbours-phrase` | `movement-neighbors-phrase` | Binding id. |
| grid-and-direction | `effect-neighbours-phrase` | `effect-neighbors-phrase` | Binding id. |
| grid-and-direction | `grid-neighbours-a` | `grid-neighbors-a` | Default seed name. |
| grid-and-direction | `grid-neighbours-b` | `grid-neighbors-b` | Default seed name. |
| grid-and-direction | `neighbours` | `neighbors` | Catalog search alias. |
| replay-scope | `later-comparisons-never-resynchronise` | `later-comparisons-never-resynchronize` | Template id. |
| suspension-and-catch-up | `away-behaviour` | `away-behavior` | Term in catalog facet text; no adoption field is renamed. |

Moving an adoption to version 2 is optional.

1. Replace the copied definition and pack with their version 2 files.
2. Keep the answers, values, rows, and verification inputs. Apply the names
   above where they occur.
3. Validate the package and read the rendered tests.
4. For a checked adoption, issue a new build record. Its
  `evidence.contracts` must name the new pack hash (`BUILD_CONTRACT_PACK`).

Version 1 and version 2 catalog definitions already meet the stricter
value-name and required-text checks.

### Specification structure

[Appendix A](SPEC.md#appendix-a-reference-tables-non-normative) maps the
renumbered §10 subsections; the former Appendix A.1 is now §12.2.
The former Appendix A.2 checklist is now in the diagnostics tables of
§§10.3–10.6 and §10.10.

### Safety scan

The default package scan reports notices in `safety`, marked by
`data.lint_status: "advisory"`. The checks are defined in
[conformance/INJECTION-LINT.md](conformance/INJECTION-LINT.md).
Three checks read English phrases. Scan coverage and skip notices are
unchanged. A notice does not change conformance. A clean scan does not
establish that a package is safe.

## v0.8 working draft — 2026-09-10

**The contract layer widened so a definition can ask a question only when it applies and say what holds when it does not (SPEC §10.3–§10.8).** A gated question carries binding `otherwise` prose; a row set carries binding `when-empty` prose; a question condition may read value forms and row counts and combine clauses with `any` and `all`; a value declaration may be conditional and may cite another number instead of repeating it; and a definition may forbid an answer combination with its own designer-facing message and declared severity. Every widening is additive: a definition using only v0.7 forms keeps its exact v0.7 meaning. Ten codes are added: `CONTRACT_QUESTION_CONDITION` for a malformed question condition, `CONTRACT_QUESTION_OTHERWISE` for a missing or empty `otherwise`, `CONTRACT_VALUE_CONDITION` for a malformed declaration condition or declaration cycle, `CONTRACT_VALUE_INACTIVE` for a value supplied to an inactive declaration, `CONTRACT_VALUE_FORM` for a malformed `forms` array, `CONTRACT_CITATION_NON_NUMERIC`, `CONTRACT_CITATION_CROSS_ADOPTION`, and `CONTRACT_CITATION_CYCLE` for value-citation targets, `CONTRACT_RULE_FORBIDDEN` when an answer-aware rule fires (the only code whose severity the definition declares, `error` by default), and `CONTRACT_ROW_WHEN_EMPTY` for a missing or empty `when-empty`. One tightening: a question condition must carry exactly one non-empty form, so an empty `when` or an empty `flag` map, previously accepted and meaningless, is now `CONTRACT_QUESTION_CONDITION`.

**One vocabulary change with no change to any rule.** The designer's document is called a **package** on every surface; the build record's `spec` field keeps its name.

**The authoring tool's source is in the public repository.** `authoring/` carries the browser tool under the MIT licence with its own version number, the extension guide `authoring/PANELS.md` for third-party panels, and the host code behind the site's `/authoring-tool/` page. Panels declare `placement: "companion"` to render under the chosen inspector; a section selection carries `range` and `extent`; the tool page lists only the Tic-Tac-Toe sample, and notes are one list per package.

**Four validator changes.** A `timing` entry that is not an object is the schema's finding (`DIRECTION_SCHEMA`) and no longer also draws `DIRECTION_CLAIM_UNCOVERED`, matching how `colors` and `contrast` entries were already treated. When `tuning.json` is missing, unparsable, or without a `values` object, the prose scan that collects direction mentions is skipped (it already was), so `DIRECTION_UNMENTIONED` is no longer reported for every judged entry on top of `TUNING_JSON`; that finding stands alone. The `PROSE_TUNING_LITERAL` message is reworded for designers ("numbers belong in tuning.json, not in prose: replace 3 with a citation of the key it means (board.size and win.line_length have this value), or mark the line non-normative"); the code and its trigger are unchanged. The tie-break lint (`TIE_BREAK_CHOICE`, `TIE_BREAK_SHARED_CEILING`) no longer fires inside a Delegated or Personalization block, and the words "before", "after" and "then" no longer count as a resolution.

## v0.7 working draft — 2026-08-31

Within the v0.7 entry, later paragraphs supersede earlier ones because the entry grew as the version was built.

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

The entries for working drafts v0.2 to v0.6 are in the [changelog archive](CHANGELOG-ARCHIVE.md).
