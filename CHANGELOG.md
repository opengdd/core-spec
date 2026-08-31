# OpenGDD changelog

The format's early drafts carried a great deal of machinery that v0.6 and
v0.7 removed. The full record of that, with diagnostic codes and schema
changes, is in [the technical changelog](CHANGELOG-TECHNICAL.md).

## v0.7 working draft — unreleased

v0.7 asked where the format made a designer think like a programmer. The specification fell from 35,188 words to 17,988, schema properties from 178 to 91, and validator codes from 255 to 189.

If you have a v0.6 package, run `npx opengdd migrate <package-dir>`. The tool
does the mechanical part and hands back a short list only a designer can
decide: most often, an `or` rule, a `document-check` test, or a graph claim
that has no field form. `opengdd migrate --build <opengdd-build.json>`
rewrites a v0.6 build record.

**Numbers.** Three tables separate current values, allowed build choices, and required relationships (decision 36).

- `tuning.json` now has `values`, optional `ranges`, and optional `rules`. Clocks moved to `clocks.json`.
- A build records one snapshot of the values it resolved instead of separate tunable and constant maps.
- Each rule is one comparison between two sums. It can use arithmetic, parentheses, `min`, `max`, and `floor`; write two rules when both comparisons must hold.
- The validator checks ranges and rules in both the package and the build record.
- You cannot start a tuning key with `colors`, `contrast`, `timing`, `values`, `ranges`, `rules`, or `runtime`. The validator names the word and suggests a new start. `references` and `viewing` work again.

**Chapters.**

- The validator reads numbered root chapters in filename order. `01` to `05` keep their standard names; designer chapters begin at `06`.
- An unnumbered root Markdown file is not a chapter, but safety checks still read it.
- The presence of `direction.json` or `personalization.json` declares that mechanism.
- If chapters switch between sets of rules, mark each set with `> RULESET: <id>`. Exactly one tag carries `(initial)`.
- One `#` title may appear before the fantasy block. In `target`, `platform` and `genre` are required; `session_minutes` and `audience` are optional.

**Art direction.** Art direction moved into one `direction.json` (decision 39).

- Palettes and moods moved from `manifest.json` into `direction.json`.
- Pillars, results to avoid, and things that must stay are named sentences. Colors, contrast, and timing are direct lists, with one viewing context for the file.
- Palette and mood references use dotted names such as `palette.ui.warning` and `mood.uneasy`. A timing promise names its tuning key without a `tuning:` prefix.
- You no longer record media hashes, formats, per-claim audit fields, test mirrors, or a direction fence. Images still use package paths and licences. `may_vary` retired, so you no longer write it.
- Build records no longer carry direction judgments.

**Collections and links.** A link now states its target and rules on the record field that carries it (decision 41).

- A record schema can define a `link` field, a list of links, a mirrored field, and whether several links are allowed.
- `loops: false` forbids a cycle. Omission or `true` permits one.
- Validation checks link types, targets, missing records, mirrors, and opted-in loop rules. Duplicate links produce a warning.
- You no longer declare a graph registry or write separate graph tests. Migration moves simple links onto their record fields and lists graph claims that have no field form for a designer to restate in prose.

**Time.**

- `runtime.<name>` replaces the old addresses that named a changing value by its type.
- Each entry in `clocks.json` gives its unit, a complete mode table using `running`, `paused`, `steps`, or `none`, and, where it drives a runtime value, what it advances.
- Write `unchanged` when a value must not change during a replay; the old expression form is no longer used.
- The package stores replay data without interpreting it. A named runner profile defines its schedule, actions, and observations.

**Tests.** An acceptance test is one test block in one of two forms, with no prose restatement (decision 43).

- A `scenario` test uses `given`, `when`, and `then`.
- A `general` test states its `scope` and what `holds`, with optional reproducible `seeds`. It replaces the separate property, exhaustive-search, and document-check forms.
- Direction measurements use ordinary tests instead of a separate direction-check channel.

**Personalization.** Personalization now changes only numbers whose ranges state that a build may choose them.

- A v0.6 personalization file survives migration. Numeric pipelines become `sets` when the tool can rewrite them; otherwise they appear on the designer's short list.
- A choice option assigns ranged values through `sets`.
- A number question names one ranged target, and the answer given for a build becomes its value.
- A build refuses an answer outside the declared range. Choice and text answers remain recorded instructions for the builder.

**Contracts.** Each adoption is one self-contained `contracts/<adoption>.json` with its copied definition, answers, fixed values, inline rows, and optional verification (decision 35).

- `when` decides which questions are asked. Contract rules use the same one-comparison grammar as number rules.
- A matching `.pack.json` turns an adoption from promised to checked and supplies its reusable tests.
- A contract's number rows can say which two values they must stay between (`within`), and the validator checks it. An error that exists only because an answer or a number is still missing is marked as waiting, so a freshly added contract's to-do count is honest.
- You no longer paste rendered contract tests into `05-build-plan.md`; the validator renders them on demand with `--render-contract-tests`. A package that still contains the generated block fails validation, and migration removes it.
- The build record lists every checked adoption and the exact pack it used.

**The build record.** Runtime evidence names its runner and version (decision 30).

- You no longer add renderer, resource, capture-recipe, direction-result, direction-observation, or algorithm fields to a build record. The audit may request further evidence.

**Tools.** v0.6 shapes get focused migration messages.

## v0.6 working draft — 2026-08-18

v0.6 replaced format-invented vocabulary with words designers already use, published the Handbook and closed schemas, and removed experimental machinery that had no outside demand. It also introduced the first contract and palette forms that v0.7 later simplified.

**Collections and links.** Collections became folders under `collections/`, with one record per file. Decisions 32 and 33 removed the manifest catalogue, members lists, authority fields, prose declaration tags, and the catalogue/items split.

- The folder and filename are the collection and record ids. Record bodies contain designer data only.
- An optional `_collection.json` supplies a closed record schema. Without it, records are free-form.
- The record grammar gained a checked grid shape. Contract rows can be inline or come from a collection folder.
- Dotted `collections.<collection>.<record>` references became checked, while an unused collection produces a warning.

**Chapters.** The required fantasy block widened to any number of player-fantasy lines within 280 trimmed characters. At least one line and closing punctuation remain required; digits are allowed, while typed references and tuning citations are not.

- Chapter prose cites tuning keys by bare dotted name. Reserved mechanism paths, file mentions, numeric tokens, and tuning citations became mechanically distinguishable.
- A tuning key cannot use a reserved first segment or reserved extension. State bindings gained explicit declaration locations, and chapter mode tags became checked.
- v0.6 replaced format-invented terms with designer words: `regime` became `mode`, `population` became `applies_to`, and the fidelity ladder became the precision levels `described`, `bounded`, and `exact`. The full list is in the technical changelog. There are no aliases; v0.5 spellings are rejected.

**Art direction.** v0.6 made palettes named color sets and made color constraints point to them.

- `manifest.json` gained palettes with ordered colors and optional color names. Dotted palette references resolve by whole key first; ambiguous keys and dangling colors fail validation.
- `constraints.colors` replaced palette roles. Exactness uses `tolerance: 0`; contrast thresholds name palette colors directly.
- Mood entries point to a palette but no longer carry their own colors. Unused palettes warn, and a construct's shape now fixes its audit class.
- Migrating from the earlier draft requires moving hex colors into the palette, renaming color and threshold fields, rewriting mood claims, and rechecking every contrast floor. Old palette shapes are rejected rather than converted silently.
- You no longer write the old motion rubric, certified palette-pin evidence, color `must_match`, or audio-direction annex. Exact colors remain testable.

**Tests.** Test blocks gained closed shapes for scenario, property, exhaustive-search, and document-check tests. Package-owned extra fields remain allowed but have no format meaning.

- Graph declarations made link existence and type checks unconditional, with optional checks for cycles, reciprocal links, and values that move in one direction along a path. Rates, capacities, runtime graph state, and bounded reachability remained outside the format.
- Aggregate art-direction claims had to match their covering property test. Grid records gained checked row and column congruence.
- A build record became a completion claim: its passed count must equal the expanded acceptance-test count.

**Personalization.** Choice and text answers remained builder instructions. Numeric questions gained a deterministic pipeline over tunable numbers and contract knobs; `clamp` limits an answer and `reject` refuses it.

- Defaults follow the same pipeline before number rules are checked.
- `affects` names what an answer can reach but does not define selector or replacement behavior.
- Choice answers and defaults must name declared option ids. Authority tags gained exact scope and grammar.

**Contracts.** The first contract layer let a package copy a reusable convention into `contracts/`, fill its questions and knobs, bind rows, and generate named acceptance tests. The directory and `contracts.*` tuning prefix became reserved; silence was invalid and `not-applicable` was an explicit answer.

- Adopted contract statements were Fixed, knobs entered the resolved tuning snapshot, and the experimental certification record preserved the adopted core digest.
- Two authored cores, four byte-identical generated blocks, a blind build, and a two-arm probe supplied the evidence for the mechanism.

**The build record.** Runtime evidence gained a runner id and version plus plain-language observation contexts for measured art direction. These identify how a pass was produced; they do not create a core certification verdict.

- Package conformance and build-record conformance became closed schema checks. Experimental execution and judgment remained outside both.
- Versioned schemas were published without a floating alias, including new tuning, personalization, and collection schemas.

**Tools.** The public Handbook became the designer's task-oriented route, while `SPEC.md` remained the exact OpenGDD specification. The beginner path gained the five-file kernel, a complete build plan, the maintained Garden Snake package, offline validation, and a builder handoff checklist.

- You no longer write unconfirmed material simulation, verification profiles, ruleset hooks and derived predicates, the open solver profile, or its deduction solution. The grid encoding, ruleset ids and tags, and industry-settled graph capability remained.
- Schema checks now cover tuning, personalization, test headings, option ids, build completion, grids, prose references, and fantasy placement.

## v0.5 draft — 2026-08-12

v0.5 renamed named objects as scoped symbols while keeping descriptor shapes and reserving “collection” for structured content. It separated delivery platform from rendering technique and drew the first firm line between checking a package, checking a build record, and experimentally auditing a finished build.

**Numbers.** The `values` table in `tuning.json` became `tunables`, and the build snapshot followed the same rename. This was a hard version cut.

**The build record.** The delivery target began naming `web-2d` or `web-3d`; a build could separately record its renderer. Three-dimensional capture certification remained undefined.

- Package and record conformance gained exact schema and check sets, severity rules, and ownership for prose obligations and per-build evaluations.
- Build certification was marked experimental. The draft protocol defined reproducible canonical payloads and hashes, but no normative certification verdict.
- A build record became a completion claim, with incomplete work reported through ambiguity records. Passing tests remained necessary evidence, not proof by itself.
- Choice answers and defaults had to name declared option ids. The experimental audit owned fixture reach, execution semantics, judged art direction, and narrowed-evidence review.

**Tools.** Migrating from v0.4 means renaming both number maps and replacing “named object” with “symbol”. The v0.5 validator rejects the old map names.

## v0.4 draft — 2026-08-09

v0.4 added structured art direction without replacing designer prose. It also added a portable grid encoding and fuller build provenance.

**Art direction.** A manifest could declare `direction.json` with pillars, mood, results to avoid, constraints, viewing contexts, things that must stay, and a narrow material and wet-motion vocabulary.

- Checked claims named their viewing context and acceptance tests. Exact palette constraints could opt into build evidence.
- Mood descriptors recorded intent, references, palette roles, behavior, and an inert audio sketch. Referenced media carried licences, hashes, and byte checks.
- Whole-direction judgment could be recorded but remained pending.

**Collections and links.** `parallel-string-layers-1` provided rectangular, same-shape string layers with an alphabet, roles, dimensions, and fill policy. It was a layout carrier, not a universal puzzle interface.

**The build record.** Optional capture profile, resource digests, and direction results recorded more provenance. A resource digest covered one named artifact and did not claim a complete inventory.

**Tools.** Prose, schemas, and validation aligned on counts, identifier grammar, claim classes, palette-pin ownership, and cross-file presence. The audio annex was planning guidance only.

- Most v0.3 packages needed only a version bump. A package already using the reserved art-direction slot or `parallel-string-layers-1` name for something else had to rename it or supply the new valid shape.
- Current source and build records move to `"0.4"`; historical v0.3 build records may remain with v0.3.

## v0.3 draft — 2026-08-08

v0.3 added reusable structures for connected records, changing rulesets, mixed clocks, material experiments, and build evidence.

**Collections and links.** Declared graph edge sets added cross-record links and checks for existence, cycles, reciprocity, bounded reachability, and values that move in one direction along a path.

**Time.** Rulesets gained finite registries, applicability tags, hooks, derived predicates, and state bindings. Clocks described several regimes and replay transitions; atomic transactions and snapshots remained deferred.

**Tests.** The material-simulation envelope described feature width, observation schedules, interactions, measures, and bounded outcomes. It did not certify universal emergence. A solver note supplied a finite-domain exhaustive-search pattern without fixing a universal puzzle profile.

**The build record.** `opengdd-build.json` gained a schema and checks for identity, parties, personalization, resolved tuning, evidence payloads, digests, and acceptance counts. The manifest reserved an art-direction slot for v0.4 but did not use it yet.

**Tools.** Package mechanisms were additive, so migration usually meant changing `"0.2"` to `"0.3"`. New builds needed the v0.3 build-record shape; historical v0.2 records stayed with v0.2.

## v0.2 draft — 2026-08-06

v0.2 introduced the first structured mechanisms around the prose document. It separated kinds of numeric authority, reusable content, tests, personalization, and package safety.

**Numbers.** Mutable values, Fixed constants, per-record facts, and test inputs gained distinct homes. Closed typed expressions covered numbers, Booleans, finite lists, and runtime state.

**Collections and links.** Collections gained format ids, stable record ids, checked references, and authority. Package paths and archives gained normalization and traversal guards.

**Tests.** Scenario, property, exhaustive-search, and static-lint tests gained standard shapes and bounded evidence. Deterministic random streams gained nested unit and named-stream addresses based on FNV-1a and Mulberry32.

**Personalization.** Ordered numeric changes, bound policies, and a resolved tuning snapshot made player-selected tuning explicit.

**Contracts.** Licensing, revenue split, and derivation metadata moved into an optional commerce profile used only for third-party building or listing. The general grid-replay solver remained deferred.

**Tools.** v0.2 did not accept a v0.1 package unchanged. Migration moves commerce fields, declares structured directories as collections, separates mutable values from Fixed constants and metadata, and replaces numeric personalization notes with explicit operations.
