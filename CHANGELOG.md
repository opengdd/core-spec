# OpenGDD changelog

This file records changes to OpenGDD for designers with a package.
Tool changes are in the [technical changelog](CHANGELOG-TECHNICAL.md).

## v0.9 — released 2026-10-06

v0.9 lets a designer write a package before every decision is made. Game
design is creative work. At the design stage, a designer often does not know
every exact number or every detail yet. In v0.8, every shared number needed a
value, so a designer had to build and test the game to find the values. In
v0.9, the designer states what the game must achieve, and can leave the exact
decision to the builder.

**Open numbers are new in v0.9, and they are the most important change.** A
number in a package can now be open: it has a guess, or no guess, and each
build supplies its value. The rules and the prose of the package still state
what the number must achieve.

The format also asks for less in other places:

- A rule that is false with guesses gives a warning, not an error.
- Acceptance tests are optional.
- The build plan can be one stage in ordinary prose.
- A Delegated passage can leave a choice that changes how the game plays to
  the builder, when the passage states the target and the limits.
- A Delegated passage can leave collection records to the builder. The
  designer can write records that are suggestions.
- A tie-break can be stated once for several rules.
- A count can stay in a sentence when nothing else in the package needs it.
- The package no longer needs a written reason for each decision.
- The `Feel:` line accepts short phrases, and the fantasy block is checked in
  the same way in every language.
- Two checks no longer affect the result. They are hints that appear only in
  review mode.

A few rules are stricter, and a v0.8 package needs a few changes. The last
part of this entry lists them. v0.9 also restructures the specification and
rewrites it in plain English.

### Open numbers

- `tuning.json` has a new optional table, `open`. Each entry is a guess for a
  number, or `null` when there is no guess.
- An open number can have a range, as a number in `values` can.
- A top-level `number` or `integer` field in a collection schema can be open.
  In a record, a number in an open field is a guess, `null` means no guess,
  and a missing field means that the field does not apply to that record.
- An open number that changes how the game plays needs a target: a statement
  of what the number must achieve.
- A personalization answer can set an open number in `tuning.json`, inside
  its range when it has one. It cannot set a number in a collection record.
- A contract cannot cite an open number. A timing promise in `direction.json`
  cannot name one.

### Rules in `tuning.json`

- A rule can use open numbers. It can also use the top-level number fields of
  collection records, by their full collection address.
- The validator reports an error when a rule is false with the numbers that
  the package decides. It reports a warning when a rule is false with
  guesses.
- The validator reports a warning when a guess makes a rule impossible to
  calculate. An example is a division by a guess of 0.
- An equality rule (`==`) can decide the open number of one record. The
  specification calls such a rule a pin. A pin is calculated only from decided
  numbers, never from another pin, so the order of the rules has no effect.
  Two pins that give one record field different numbers are an error.
- In a rule, a hyphen inside a dotted name is part of the name. A subtraction
  needs a space before the minus sign.
- A tuning key made only of digits and dots, such as `1.2`, is an error.

### Numbers in prose

- Prose no longer marks a number as "non-normative". Prose still cites a
  shared number by its tuning key and does not repeat the value. A reader
  decides whether a number in a sentence is only an example.
- A count can stay in prose only when nothing else in the package needs it.
  When another part of the package needs the count, the count is stored
  under a key. A shared count belongs in `tuning.json`. A count of one item
  stays on the collection record of that item. A number that only sets up a
  test stays with the test.
- A prose citation of a record field is an error when the field is neither in
  the record nor in the schema of the collection.

### Authority and ruleset tags

- Every tag covers only its blockquote. This holds for `DELEGATED:`,
  `PERSONALIZATION:` and `RULESET:`. In v0.8, a tag also covered the text
  after its blockquote. Now, text outside every authority tag is Fixed, and
  text outside every ruleset blockquote applies in all rulesets.
- The text after `DELEGATED:` on the tag line is part of the delegated
  passage. In v0.8 it was a label. A delegation of one line is complete.
- A tag inside the blockquote of another tag is written as a nested quote
  (`> >`). It covers its nested quote. The innermost authority tag decides
  the authority. The innermost ruleset tag decides which ruleset applies.
- Two `DELEGATED:` or `PERSONALIZATION:` tags at the same level of one
  blockquote are an error. Two `RULESET:` tags at the same level of one
  blockquote are an error. Each ruleset is written in its own blockquote. A
  tag inside a code block is only an example.
- A sentence about how the game looks is Fixed unless a tag delegates it.
- A personalization question id cannot contain whitespace.

### What the designer must settle

- The phrase "changes how the game plays" now has a definition. A difference
  between two builds changes how the game plays when it changes one of five
  things: what the player can do, what the player knows at the moment of a
  decision, the state of the game or the result of an action, when something
  happens or how much time the player has to act, and whether the player
  succeeds or fails.
- A difference in the picture, the sound, the camera or the feedback changes
  how the game plays only when it changes one of these five things.
- A Delegated passage settles such a difference when it states the target and
  the limits of the decision. The builder chooses inside those limits. A
  Delegated passage without a target does not settle the difference.
- A tie-break can be stated once for several rules, in a Fixed statement that
  covers those rules.
- The package no longer needs a written design reason for each difference
  that it settles.
- A Delegated passage can leave collection records to the builder. The
  passage cites the collection or the records that it covers, and it states
  what the builder may leave out or change. A record that no Delegated
  passage covers is Fixed, except for its open fields.

### The fantasy block

- The validator no longer checks punctuation in the player-fantasy lines. The
  block is checked in the same way in every language. Whether a package
  passes validation no longer depends on the language of its prose.
- The `Feel:` line holds three to five entries. Each entry is a word or a
  short phrase. The entries are separated by `,`, `、`, `，`, `،` or `・`.
- A sentence-ending mark at the end of the `Feel:` line or of the
  anti-reference line is not part of the last entry. A sentence-ending mark
  is any character with the Unicode property `Sentence_Terminal`, such as
  `.`, `!`, `?` or `。`.
- The labels `Feel:` and `NOT:` are the same in every language.
- The fantasy block constrains every Delegated passage. It now also
  constrains every choice that the package leaves to the builder without a
  tag, when a player could notice the result.

### Build plan, tests, seeds and time modes

- Acceptance tests are optional. The build plan is still required.
- Build stages are ordinary prose. One stage is enough. Each stage says what
  to build. A stage may name the chapters, or the parts of chapters, that
  describe the work. Checkpoints are optional.
- A test number is a positive integer without a leading zero: `AT-4`, not
  `AT-04`. The validator checks that the number is a positive integer. A
  person checks that it has no leading zero.
- A test that needs a person watching is always reported as not run. A
  package with such a test cannot have a conforming build record.
- Seed addresses are optional. A seed contains no colon (`:`), because colons
  separate the parts of a seed address. A person checks this rule; the
  validator does not.
- A mode tag, such as `[IN-MISSION]`, can stand anywhere in a chapter
  heading. `[ALL]` in a heading is an error only when the package declares a
  time mode. The validator already worked this way.

### Art direction

- A measured promise in `direction.json` still needs a test that covers it.
  The test may name the location and the conditions of the promise as steps.
  It never states the value or the metric of the promise.
- The `while` entries of a measured promise are alternatives. The promise
  applies in each state that an entry describes. A combination of conditions
  is written in one entry. A promise without `while` applies at all times.
- A palette alone requires nothing of a build. A build must use a color as
  declared only when a `colors` or `contrast` entry names the color, or when
  a Fixed sentence requires it. A `colors` entry with `within` set to `0`
  requires the exact color.

### Build records

- A build record lists the numbers that the build used, including every open
  number.
- For a ranged number, the builder chooses any value inside the range, unless
  a personalization answer set the number. A rebalance is a change of the
  number that the designer makes in a later revision of the package.
- A build record lists every test that did not pass, with a result and a
  reason. `failed` means that the test ran completely and did not pass.
  `partial` means that the test could be run only in part. `not-run` means
  that the test did not run.
- A check of a build record has one of five outcomes. The first condition
  that holds decides the outcome:
  1. **Invalid**: the record has errors.
  2. **Not checked**: the package was not supplied.
  3. **Not verified**: the package has no tests.
  4. **Incomplete**: at least one test of the package did not pass.
  5. **Conforming**: every test of the package passed.
- Only the tests of the package count as passed or not passed. Tests that a
  builder adds do not count.
- A build record can list sampled contract tests too. A sample of cases does
  not prove a promise about every case.

### Collections

- A `grid` field belongs at the top level of a collection record, not inside
  a `list`.
- The specification and the validator messages say "collection" and "schema
  file" where they said "drawer" and "label". Code names and field names
  keep their spelling, for example `COLLECTION_LABEL_JSON`.

### Contracts

- Each of the 15 contracts of the catalog has a version 2. Version 2 uses
  American spelling and plain wording. The spelling of some names changed,
  and the technical changelog lists them. The definitions and packs of
  version 1 stay available under their own names.
- Version 2 changes no behavior, except for two corrections:
  - Ranged value, version 1, told the reader to cite a band by an address of
    the form `contracts.<adoption>.bands.<id>`. The format has no such
    address, and the validator rejects it. Version 2 says to cite the Fixed
    chapter section that states the band.
  - One test text of Container, version 1, said that a stack limit holds in
    every container that carries the item type. The contract states no rule
    between two containers. In version 2, the test text names only the
    stack limit of its own adoption.
- A contract value can cite a key in `values` of `tuning.json`, with or
  without a range, or a numeric value of the same adoption. It uses the
  number that the package states, also when a build changes a cited ranged
  number. It cannot cite a value of another adoption.
- A contract value name must begin with a lowercase letter.
- The required texts of a contract definition cannot be empty: `summary`,
  each entry of `mechanism`, `asks`, `meaning`, and the `description` of a
  value.
- A contract citation of a chapter heading must match exactly one heading.

### Validation

- Two checks are now hints: the check for a missing tie-break, and the check
  for a number in prose that repeats a tuning value. A hint appears only in
  review mode. A hint never changes the result. The tie-break check looks for
  English words, so it can miss a passage in another language.
- The search for hidden instructions to an AI is now a separate safety scan.
  A safety notice marks a place that a person should read before the package
  goes to an AI that can use tools. A safety notice never changes the
  result. It does not prove that a package is harmful. A package without
  safety notices is not proven safe.
- The safety scan has its own document, `conformance/INJECTION-LINT.md`. The
  document is new in the public repository, and the site shows it at
  `/conformance/injection-lint/`.
- A finding in `tuning.json` gives a line number. When a tuning citation
  almost matches a declared key, the message suggests that key. Some
  citations of rules, clocks and collections get a suggestion too.

### The specification

- The specification states the rules only. Explanations and advice are in
  the Handbook.
- File shapes and findings are now in tables, and rules are in numbered
  lists. Three grammars that several sections use are in a new §12. The new
  form itself changed no rule.
- The subsections of §10 (Contracts) have new numbers. A link to a v0.8
  subsection of §10 can now lead to other content. Appendix A of the
  specification lists the old and the new numbers. The reference forms of
  the old Appendix A.1 are in §12.2.

### Tools, spelling and addresses

- The validator and the schemas are for OpenGDD 0.9. The npm package is
  `opengdd` 0.9.0. The schemas are at `/schema/core/v0.9/`. The schemas of
  earlier versions stay at their addresses and do not change.
- The authoring tool is version 0.6 and works with OpenGDD 0.9. It supports
  open numbers. It shows errors and warnings, hints, and safety notices in
  separate sections.
- `opengdd migrate` moves a v0.8 package to v0.9. It sets the version and
  keeps the chapter text. It then validates the result. It reports manual
  items and review notes in two separate lists. A manual item names a
  problem at a location: an error that remains, text that a tag no longer
  covers, or text after `DELEGATED:` that looks like a former label. A
  review note is a reminder: about build stages, about seeds, about
  Delegated passages, or about text after `DELEGATED:` that already reads as
  a sentence. The command exits with `1` when a manual item remains. Review
  notes do not change the exit status.
- Current prose uses American spelling, such as "color" and "catalog". File
  names, field names and published contract definitions keep their
  spelling.
- The contract catalog is at `/contracts/catalog/`. The old address
  `/contracts/catalogue/` leads to it. The Handbook chapter about palettes is
  at `/handbook/palette-and-color-promises/`, and its old address leads to
  it.

### What to change in a v0.8 package

1. Run `npx opengdd migrate <package-dir>`. Correct each manual item that the
   command lists, and read its review notes.
2. Check each tag. Text after a tag's blockquote is no longer covered by the
   tag. Move the text that you meant to delegate, to personalize or to keep
   in one ruleset into the blockquote.
3. Check each `DELEGATED:` tag line. A label after `DELEGATED:` is now part
   of the delegation. Replace the label with the sentence that you mean, or
   remove it.
4. Check each untagged sentence about how the game looks. It is Fixed. To
   leave the choice to the builder, put the sentence in a `> DELEGATED:`
   blockquote.
5. Rename a tuning key that is made only of digits and dots, such as `1.2`.
   Change every place that names the key.
6. Rename a personalization question id that contains whitespace. Change
   every `> PERSONALIZATION:` tag that names the question.
7. Replace each seed that contains a colon. Change every place that uses the
   seed.
8. Check each test that needs a person watching. Such a test is reported as
   not run, so the package cannot have a conforming build record. Replace
   the test with a check that a program can repeat, or describe the quality
   in art direction instead.
9. In your own contract definitions, rename each value name that does not
   begin with a lowercase letter. Write the missing text in every empty
   required text field. The contracts of the OpenGDD catalog already follow
   both rules.

Moving an adoption to version 2 of a contract is optional. Version 1
definitions and packs stay supported, and `opengdd migrate` does not change
the contract version. To move an adoption:

1. Replace the definition part of the adoption file with the version 2
   definition.
2. Replace the version 1 pack file with the version 2 pack file.
3. Keep the answers, values, rows and verification inputs. Where the
   spelling of a name changed, change the name in them.
4. Run the validator, and read the generated tests again.

For a checked adoption, a build record that was made before this move names
the version 1 pack. It no longer matches the package, so the builder makes a
new build record.

## v0.8 — released 2026-09-10

v0.8 widens the contract layer (§10). A contract can now skip a question that
does not apply to the game, and it states in plain words what the build does
in that case.

- A gated question carries binding `otherwise` prose.
- A row set carries binding `when-empty` prose.
- A question condition can read value forms and row counts, and combine them
  with `any` or `all`.
- A value declaration can be conditional, and cite a number instead of
  repeating it.
- A definition can forbid an answer combination, with its own designer-facing
  message.

Every widening is additive. A v0.7 definition keeps its exact meaning and
needs no migration. Ten diagnostic codes are added. See the
[conformance README](https://github.com/opengdd/core-spec/blob/main/conformance/README.md).

One rule is tighter. A question condition must carry exactly one non-empty
form. Before, an empty `when` or an empty `flag` map was accepted and meant
nothing. It is now reported.

One vocabulary change. No rule changes. The designer's document is now called
a **package** everywhere. Earlier text called it a spec, which collided with
the specification. The build record's `spec` field keeps its name.

## v0.7 — released 2026-08-31

v0.7 asked where the format made a designer think like a programmer. The
specification fell from 35,188 words to 17,988. Schema properties fell from
178 to 91, and validator codes from 255 to 189.

If you have a v0.6 package, run `npx opengdd migrate <package-dir>`. The tool
does the mechanical part. It hands back a short list only a designer can
decide: most often an `or` rule, a `document-check` test, or a graph claim
with no field form. `opengdd migrate --build <opengdd-build.json>` rewrites a
v0.6 build record.

**Numbers.** Three tables separate current values, allowed build choices, and
required relationships.

- `tuning.json` now has `values`, optional `ranges`, and optional `rules`.
  Clocks moved to `clocks.json`.
- A build records one snapshot of the values it resolved. The separate tunable
  and constant maps are gone.
- Each rule is one comparison between two sums. It can use arithmetic,
  parentheses, `min`, `max`, and `floor`. Write two rules when both
  comparisons must hold.
- The validator checks ranges and rules in the package and in the build
  record.
- You cannot start a tuning key with `colors`, `contrast`, `timing`, `values`,
  `ranges`, `rules`, or `runtime`. The validator names the word and suggests a
  new start. `references` and `viewing` work again.

**Chapters.**

- The validator reads numbered root chapters in filename order. `01` to `05`
  keep their standard names. Designer chapters begin at `06`.
- An unnumbered root Markdown file is not a chapter, but safety checks still
  read it.
- The presence of `direction.json` or `personalization.json` declares that
  mechanism.
- If chapters switch between sets of rules, mark each set with
  `> RULESET: <id>`. Exactly one tag carries `(initial)`.
- One `#` title may appear before the fantasy block. In `target`, `platform`
  and `genre` are required. `session_minutes` and `audience` are optional.

**Art direction.** Art direction moved into one `direction.json` so its
palettes, moods, promises, and viewing context stay together.

- Palettes and moods moved from `manifest.json` into `direction.json`.
- Pillars, results to avoid, and things that must stay are named sentences.
  Colors, contrast, and timing are direct lists, with one viewing context for
  the file.
- Palette and mood references use dotted names such as `palette.ui.warning`
  and `mood.uneasy`. A timing promise names its tuning key without a `tuning:`
  prefix.
- You no longer record media hashes, formats, per-claim audit fields, test
  mirrors, or a direction fence. Images still use package paths and licences.
  The `may_vary` field is retired.
- Build records no longer carry direction judgments.

**Collections and links.** A link now states its target and rules on the
record field that carries it.

- A record schema can define a `link` field, a list of links, a mirrored
  field, and whether several links are allowed.
- `loops: false` forbids a cycle. Omission or `true` permits one.
- Validation checks link types, targets, missing records, mirrors, and
  opted-in loop rules. Duplicate links produce a warning.
- You no longer declare a graph registry or write separate graph tests.
  Migration moves simple links onto their record fields. It lists graph claims
  with no field form for a designer to restate in prose.

**Time.**

- `runtime.<name>` replaces the old addresses that named a changing value by
  its type.
- Each entry in `clocks.json` gives its unit and a complete mode table using
  `running`, `paused`, `steps`, or `none`. Where it drives a runtime value,
  the entry says what it advances.
- Write `unchanged` when a value must not change during a replay. The old
  expression form is no longer used.
- The package stores replay data without interpreting it. A named runner
  profile defines its schedule, actions, and observations.

**Tests.** An acceptance test is one test block in one of two forms, with no
prose restatement.

- A `scenario` test uses `given`, `when`, and `then`.
- A `general` test states its `scope` and what `holds`, with optional
  reproducible `seeds`. It replaces the separate property, exhaustive-search,
  and document-check forms.
- Direction measurements use ordinary tests instead of a separate
  direction-check channel.

**Personalization.** Personalization now changes only numbers whose ranges say
a build may choose them.

- A v0.6 personalization file survives migration. Numeric pipelines become
  `sets` when the tool can rewrite them. Otherwise they appear on the
  designer's short list.
- A choice option assigns ranged values through `sets`.
- A number question names one ranged target, and the answer given for a build
  becomes its value.
- A build refuses an answer outside the declared range. Choice and text
  answers remain recorded instructions for the builder.

**Contracts.** Each adoption is one file, `contracts/<adoption>.json`, with
the copied definition, answers, fixed values, inline rows, and optional
verification.

- `when` decides which questions are asked. Contract rules use the same
  one-comparison grammar as number rules.
- A matching `.pack.json` turns an adoption from promised to checked and
  supplies its reusable tests.
- A contract's number rows can say which two values they must stay between,
  using `within`, and the validator checks it. Some errors exist only because
  an answer or a number is still missing. They are marked as waiting, so a new
  contract's to-do count is honest.
- You no longer paste rendered contract tests into `05-build-plan.md`. The
  validator renders them on demand with `--render-contract-tests`. A package
  that contains the generated block fails validation, and migration removes
  it.
- The build record lists every checked adoption and the exact pack it used.

**The build record.** Runtime evidence names its runner and version so the
claim is attributable to the profile that produced it.

- You no longer add renderer, resource, capture-recipe, direction-result,
  direction-observation, or algorithm fields to a build record. The audit may
  request further evidence.

**Tools.** v0.6 shapes get focused migration messages.

The entries for working drafts v0.2 to v0.6 are in the [changelog archive](CHANGELOG-ARCHIVE.md).
