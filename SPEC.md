# OpenGDD v0.5 draft

OpenGDD is an open format for game design documents. Designers write the game
in prose. Structured data makes selected claims checkable. Three authority
levels state which decisions stay fixed, which belong to the builder, and
which are resolved separately for each build.

A builder turns the document into a running game. The builder may be a person,
a studio, an AI agent, or a combination. The document can also carry optional
attribution and commerce terms. The core format does not require a particular
transaction model.

Along the way this document names a handful of constructs — tunables (§4),
the grid-layout encoding (§7a), identifiers and descriptors (§8), the
art-direction block (§9), and contracts (§10). Each is defined in the
section its pointer names; none needs to be understood before then.

Throughout this document, the words MUST, MUST NOT, SHOULD, and MAY are used
in their RFC 2119 sense.

Status: v0.5 draft. License: specification text CC-BY-4.0; schemas and
validator code MIT.

## The two roles (non-normative)

*For everyone. Read this one first; it is one page and the rest assumes it.*

A spec connects the designer who authors the game with the builder who
implements it.

| The **designer** | The **builder** |
|---|---|
| Writes the spec. Prose carries the design intent. Structured data makes selected claims checkable. The designer chooses an authority level for every design statement. | Turns the spec into a running game. A builder may be a person, a studio, an AI agent, or a combination. |
| Owns every difference a player could notice that changes how the game plays (§2a). | Owns how the game is made: the code, the pipeline, everything two faithful builds may differ in without any player telling them apart — plus whatever visible area the spec expressly delegates (§2a). |

One person can hold both roles, and often will. The roles stay distinct
because a design can travel: if the designer wishes, the same spec can go
to any number of builders, and every resulting build is judged against the
same acceptance tests (§6, §7). When a design travels under terms, the
manifest's optional commerce fields record them (§3).

## Terms, for designers (non-normative)

*For designers. Skip if you already know the format, and come back when a word looks odd.*

A reading aid for designers meeting the format for the first time. It is not
part of the format and adds no rule; where a summary here and a numbered
section disagree, the numbered section is right.

### Words borrowed from standards writing

| Term | Meaning |
|---|---|
| **Normative** | A statement that decides whether something is correct: break one and the thing does not conform. **Informative** text explains, and decides nothing. |
| **MUST, MUST NOT, SHOULD, MAY** | Set in capitals, these four words carry exact strengths: a requirement, a prohibition, a strong recommendation you may set aside with a reason, and a free choice. The convention is borrowed from RFC 2119 so nobody has to argue about what "should" means. |
| **Schema** | A machine-readable description of what a data file is allowed to contain, so a program can tell whether the shape is right. |
| **Validator** | A program that reads a package and reports what is wrong with it. |
| **Conforming** | Meeting the format's rules. Different kinds of thing conform, each against the rules written for it. |
| **Certified build** | Conforming is the standard a thing meets; certification would be an audited record that a particular build met it. That audit is still experimental (§2d). |

### Words this format defines for itself

| Term | Meaning |
|---|---|
| **Spec, package** | A spec is one game's design, written in this format. *Package* is the same thing seen as files on disk (§1). |
| **Manifest** | The file at the top of a package that says what the spec is and where a reader should start (§3). |
| **Fantasy block** | Every game idea begins with a fantasy, meaning what the player gets to be and feel. A spec opens the same way (§1a). |
| **Fixed, Delegated, Personalization** | Every design statement says who decides it. Fixed means the designer already did, Delegated leaves it to whoever builds the game, and Personalization leaves it to an answer given for one particular build (§2). |
| **Identifier** | Any name the designer invents that the format then carries. Using one creates it; there is no separate step where you declare it (§8). |
| **Tunable, constant** | Both are numbers the design refers to by name. A tunable may be changed to rebalance the game; a constant may not, because changing it changes the game itself (§4). |
| **Entry points** | The places a builder is meant to start, named up front so nobody has to guess (§3). |
| **Defined-in pointer** | A machine field that points back to the prose that gives a thing its meaning, so data and definition stay tied together (§1b). |
| **Contract, core, surface** | A contract is a ready-made set of questions that a familiar mechanism forces every designer to answer, declared instead of described. Its **core** asks the questions; its **surface** records this game's answers (§10). |
| **Generated block** | Part of a spec that a tool writes from the answers you gave. You do not edit it by hand: you change an answer and regenerate (§10.10). |
| **Acceptance test** | A numbered check saying what a finished build has to prove. Each pairs text a person can read with a block a program can run (§6). |
| **Test block** | The machine-readable half of an acceptance test: the part that states what must be proved (§6). |
| **Test type** | Which shape a test block takes, chosen from a small fixed set (§6). |
| **`document-check`** | The test type that inspects the package's own files instead of running the game (§6). |
| **Solution** | A concrete case that shows a claim holds — an actual example, not a promise that one exists. Its opposite number is a counterexample (§6). |
| **Replay** | The inputs a test plays back, together with the results expected in return. Recorded footage is a **capture**, which is a different thing (§6). |
| **Evidence** | The record of what actually happened when the tests were run (§7). |
| **Harness** | The thing that runs the tests. Evidence is the record of what running them produced; the two words are not interchangeable (§6). |
| **Mode** | A declared span of play with its own sense of how time passes. Called a *resolution mode* on first mention, since games use "mode" for many other things (§4b). |
| **Completeness** | The idea that a spec holds together: nothing points at something that is not there, and nothing declared is left out. The format applies it in several places, each saying which side has to cover the other (§§1b, 1c). |
| **`applies_to`** | The plain-prose answer to "which things on screen does this claim apply to?" It sets the claim's reach (§9.5). |
| **Precision levels** | How precisely a visible claim is written: **described** in words, **bounded** by a tolerance, or **exact** (§9.9). |
| **`must_keep`, `may_vary`** | A `must_keep` entry names something a build has to preserve for the game to still look like itself. Its `may_vary` list names the axes along which builders are free to differ (§9.7). |
| **Palette role** | A named color with a job: the color itself, how close a build must stay to it, and what wears it. No relation to the designer's and builder's roles (§9.5). |
| **Pin** | To pin is to fix a value the build must reproduce, and a pin is the value so fixed. A **palette pin** fixes an exact color; a **certified pin** is one the experimental audit would check (§9.9). |
| **Scope** | The statement of where a claim reaches: what it applies to, when it holds, and how thoroughly it must be observed (§9.5). |
| **Judged, checked, advisory** | The three audit classes. **Checked** means a machine can verify it, **judged** means people score it, and **advisory** means it states intent and decides nothing. What a construct is fixes its class; no entry writes its own class down (§9.11). |
| **Closed** | Closed means no additions. A **closed shape** admits no field beyond the ones the format names; a **closed value set** accepts no value beyond the ones it lists. |
| **Stable** | Said of a name that must not change between revisions, because other things point at it. |
| **Error, warning** | The only two severities. An **error** is decisive: the thing does not conform. A **warning** advises and decides nothing (§2d). |
| **Field, key** | A **field** is a named slot in a data object. A **key** is a lookup id in a map. |

## 1. Package layout

*For everyone: designers read this as the shape of a spec on disk, tool
authors as the file layout a parser walks.*

A spec is a directory. It travels as a zip file or a git repository.

```text
my-game/
  manifest.json          # identity + entry points — REQUIRED
  tuning.json            # runtime tunables and numeric constants — REQUIRED
  personalization.json   # designer-authored per-build questions — optional
  01-overview.md         # pitch, pillars, player experience — REQUIRED
  02-mechanics.md        # complete rules — REQUIRED
  03-content.md          # story, characters, dialogue, levels/generation — optional
  04-presentation.md     # art direction, audio direction, UI, feel — optional
  05-build-plan.md       # phases, checkpoints, acceptance tests — REQUIRED
  assets/                # optional reference images, palettes, sketches
  contracts/             # optional adopted contracts (§10) — reserved name
  <declared content>/    # optional structured collections (§1b) and replays
```

`contracts/` is reserved for the contracts layer (§10); a package that keeps
its own directory of that name renames it.

The entry points live in `manifest.json`. It names the entry-point
chapters, the build plan, and the tuning file (§3).

**The five chapter filenames are normative.** A chapter carrying the content
the tree assigns to `01-overview.md`, `02-mechanics.md`, `03-content.md`,
`04-presentation.md`, or `05-build-plan.md` MUST use that exact filename.
`03-content.md` and `04-presentation.md` remain optional, and a package MAY
add further chapters under names of its own; what is fixed is that these five
roles are not renamed. Other sections rest on that: §1a reads the fantasy
block from `01-overview.md`, §9 reads the direction fence from
`04-presentation.md`, and §6 scans acceptance tests in the build plan. The
build plan is the one name a manifest may redirect, through `build.plan`,
whose default is the canonical `05-build-plan.md` (§3).

The Markdown chapters are written for the builder who will turn the spec into
a game. Ordinary prose is welcome. Decide everything, and say it briefly.
Every rule a player could observe has to be settled: either write it out, or
hand it over on purpose using one of §2's authority levels.
Say each rule once. Thoroughness is settling everything, not writing at
length. A spec that settles everything in few words is easier to build from,
easier to read, and cheaper. §2a's tie-break rule shows the kind of care this asks
for.

Numeric authority means which file owns which number. §4 assigns it. Three
of its assignments are worth knowing here.

- A runtime tunable or an exposed constant lives under a key in
  `tuning.json`, such as `hazard.interval_seconds`. In a balance-only
  revision a tunable may change, and a constant may not (§4).
- A fact about one piece of content lives in that content's own collection
  record. In a card game, the cost printed on a card is stored on that card
  (§1b), not in `tuning.json` and not in a chapter's prose.
- If an acceptance test needs an input, the input lives with the test. A
  test that replays fixed random seeds carries its own list of seeds (§6).

Normative prose MUST cite the tuning key rather than repeat the value it
holds: write `hazard.interval_seconds`, never the number stored under it. The
citation is bare, and §4 gives the rule that tells a citation from the other
dotted tokens prose carries.

Every package-relative path MUST remain inside the package after
normalization, so resolving its `..` segments must not lead out of the
package directory. `assets/../../elsewhere.png` resolves outside, and is
invalid.

One convention for reading this document: a JSON example shows a fragment of
the file it belongs to, not a complete document, unless the surrounding text
says it is complete.

## 1a. The fantasy block (required)

*For designers. Every spec needs one, so nobody skips this.*

`01-overview.md` MUST open with a fenced `fantasy` block. That filename is
normative (§1): the block is read from `01-overview.md` and nowhere else. The fence carries
the tag `fantasy`, and the block MUST be the first substantive content in
the file, after the opening `#` title heading. It holds three things:

- **The player fantasy, within 280 characters.** The first line says what
  the player gets to be: "You are the getaway driver, and the plan is
  already falling apart." Within the budget the shape is the writer's —
  one long sentence, three longer beats, six short ones. Further lines
  SHOULD each reach toward a different facet of the fantasy — what the
  player does, what the world looks and sounds like, what playing feels
  like — rather than elaborating a facet already stated.
- **Three to five feel adjectives.** For example: fast, slick, breathless.
- **Anti-references**: what this game is NOT. "Not: grindy, tactical,
  punishing." Saying what the game is not constrains an AI builder better
  than positive description does. Without it, an AI builder tends toward the
  average of its genre.

**Line grammar.** The block is read line by line. Blank lines are ignored,
as is leading and trailing whitespace on any line. Label matching ignores
case.

- The **feel adjectives** sit on one line opening `Feel:`, separated by
  commas. There MUST be three to five of them, and an empty entry does not
  count toward that total.
- The **anti-references** sit on one line opening `NOT:` or
  `Anti-references:`. That line MUST NOT be empty after its label.
- Each label MUST NOT appear more than once in the block. A second `Feel:` line, or
  a second anti-reference line under either of its two spellings, is a hard
  failure. Two labelled lines would leave no rule for which one binds.
- The **player fantasy** is every line opening with neither label. There
  MUST be at least one such line. Consecutive unlabeled lines join into
  one fantasy statement, so a sentence may wrap across lines; each joined
  statement MUST end with a sentence-ending mark. The marks are `.`, `!`,
  and `?`.
- The fantasy lines' combined length MUST NOT exceed **280 characters**,
  counted after trimming each line's leading and trailing whitespace,
  newlines not counted. This is the block's one size limit, and it does
  the work a line count cannot: it permits six short beats or three long
  ones equally, while squeezing out the detail that belongs in the
  chapters.
- A fantasy line MUST NOT contain a typed reference — `tuning:`, `state:`,
  and `content:` from §4a, and `descriptor:` from §8a — a bare tuning
  citation, or a chapter anchor. A **bare tuning citation** is an inline-code
  token that §4's classification rule reads as a citation.
  A **chapter anchor** is a Markdown heading anchor reference, written
  `<file>.md#<anchor>` or as a bare `#<anchor>`. The bare form is read
  lexically: a `#` preceded by the start of the line or by whitespace and
  followed immediately by a kebab-case id. A `#` in any other position is
  ordinary text, so "the #1 spot" is not an anchor.

  **The anchor of a heading (normative).** Wherever this document resolves a
  chapter anchor — §1b's `defined_in`, a §6 test block's references, a §10.7
  citation — the anchor a heading answers to is derived from the heading's
  text by these steps, in order:

  1. lowercase it;
  2. remove every HTML tag, meaning every run from `<` through the next `>`;
  3. remove every backtick, asterisk, underscore, and tilde;
  4. remove every remaining character that is not a Unicode letter, a Unicode
     number, whitespace, or a hyphen;
  5. trim leading and trailing whitespace; and
  6. replace each run of whitespace with a single hyphen.

  The rule defines no disambiguating suffix, so two headings in one file whose
  text derives the same anchor leave a citation of it undecidable; a package
  SHOULD NOT carry a pair.

The fantasy is read by every builder before any key exists to cite; a
reference in it is mechanics leaking upward, and it fails validation.

A sentence-ending mark closing the `Feel:` or anti-reference line is
punctuation, and not part of the last entry on it.

```fantasy
You are the getaway driver, and the plan is already falling apart.
Neon rain on the windshield, a stolen V8 under your hands.
Feel: fast, slick, breathless.
NOT: grindy, tactical, punishing.
```

A single fantasy line is a complete, valid block. Extra facets earn their
keep below: they tie-break delegations a role-only sentence never reaches.

A spec deliberately leaves some decisions to the builder. Those are its
Delegated sections, tagged `> DELEGATED:` (§2), and they turn up in any
chapter: a presentation chapter might delegate the menu typeface, or the
paint on the getaway car.

**Every Delegated section is implicitly constrained by the fantasy block.**
The block is the tie-breaker for every delegated decision in the spec, no
matter which chapter makes it. When the block says "NOT: punishing" and a
delegated choice is open between a harsh crash sound and a soft scrape, the
soft scrape wins.

## 1b. Structured content collections

*For designers. Skip unless your game keeps content in records: a deck, a bestiary, a level table, a dialogue tree, or anything like them.*

Structured content, such as a deck of cards, a table of enemies, or a tree of
dialogue nodes, is discoverable through the optional `content` array in
`manifest.json`. Each entry in that array declares one **collection**.

```json
{
  "id": "cards",
  "format": "example-card-catalog-v1",
  "defined_in": "03-content.md#card-catalog-format",
  "source": {
    "type": "catalog",
    "file": "cards/catalog.json"
  },
  "authority": { "level": "fixed" },
  "id_field": "id"
}
```

Each collection MUST declare six things:

- **`id`** — a name for the collection, stable and unique within the package.
- **`format`** — a versioned id for the format this collection is written
  in, such as `example-card-catalog-v1` above.
- **`defined_in`** — a pointer to the Fixed chapter section that defines this
  collection: the shapes its records take, their fields, their references, and
  its completeness rules. The three rules stated below in this §1b are decided
  by what that section says.
- **`source`** — where the collection records live. Either `catalog` with
  exactly one `file`, or `items` with one `directory` and an explicit ordered
  `members` list.
- **`authority`** — an authority level, written with the machine values from
  §2.
- **`id_field`** — the name of the collection-record field whose values are
  stable and unique inside this collection. Collection records keep whatever
  field they already have: a dialogue tree whose nodes carry `node_id`
  declares `"id_field": "node_id"`. The catalog above simply uses `id`.

A collection MAY declare one further field. **`instance`** binds its records
to a record schema declared by a contract core (§10). Its value names the
instance file and the schema by fragment — `contracts/stamina.json#thresholds`
— where the path is exactly `contracts/<instance>.json` and the fragment is a
bare key of that core's `collections` object. The core's schema governs record
shape only: the `defined_in` section still homes this package's own reference
targets and completeness rules, and the binding adds a record schema rather
than replacing that section. Every schema a vendored core declares MUST be
bound exactly once, by this field or by the instance file's inline rows, and
§10.7 gives the binding rules in full.

An item collection keeps its collection records as separate files in a
directory, and its `members` list is the collection: it MUST name every file
the collection uses, in order. The order files happen to sit in the directory
on disk means nothing.

Three rules hold over every collection:

1. Every declared file and collection record MUST exist.
2. Every stable id MUST be unique inside its collection.
3. Every reference MUST resolve under the target and completeness rules
   stated in the collection's `defined_in` section.

Rules 1 and 2 are machine checks, and not for the designer to memorize: the
validator runs and reports them. Three findings under them are hard
validation failures: a missing member, a consumed member the collection never
declared, and a duplicate stable id.

Rule 3 is decided by machine only as far as the package declares the edges.
Where a §1c edge set declares the field carrying a reference, every value of
that field must resolve, unconditionally and on every validation, and a
dangling one is a hard failure. Where a §1c `acyclic` rule is cited by a §6
`document-check` test, a cycle is a hard failure of that test. Where neither
declaration exists, the reference and cycle rules still bind the package with
full force, as prose obligations under §2d: they are decided by reading the
`defined_in` section, and a designer who wants them machine-decided declares
the edge set.

(A note for tool authors rather than designers: collection-id uniqueness and
stable-record-id uniqueness are the validator's checks, not JSON Schema's —
`uniqueItems` compares whole array entries, not one chosen field inside
them.)

A collection's `defined_in` section may define fields particular to its own
game, and `tie_break` is one such field. Core OpenGDD does not define dialogue
node types, effect verbs, card verbs, grid glyphs, recipe semantics, or screen
geometry. A per-collection-record `condition` field is another field defined
in that section, and §4a constrains what its expressions may bind to.

Every overridable collection record MAY carry an authority of its own:

```json
{ "authority": { "level": "personalization", "question": "theme" } }
```

The machine values are `fixed`, `delegated`, and `personalization`. A
`personalization` collection record MUST name its question. A collection
record at either other level MUST NOT name one. A collection record carrying
no `authority` inherits the authority of its collection.

A collection bound to a contract instance is the exception: it MUST carry
Fixed authority, and none of its records may carry an authority of its own.
Its rows are inputs to a generated block, and one per-build row would make
that block differ per build (§10.7).

## 1c. Declared graph edge sets

*For tool authors, and for designers whose content records point at one another, as in a tech tree or a crafting chain.*

Collection records point at one another. A card in §1b's catalog might carry a
`set_id` field holding the id of the set it belongs to. Each such pointer
is an **edge**. §1b already requires every reference to resolve, but that
is all it requires. What an edge means, and which field carries it, is
written only as prose in the collection's `defined_in` section.

Structural claims about the graph as a whole then have nowhere to sit, so
each package invents its own way to check them. Those claims include
completeness, acyclicity, reciprocity, and monotonicity. The optional
manifest field `graphs` gives the edges a declared, typed form instead. A card's
`set_id` edge would be declared exactly this way; the example below is a
technology tree's prerequisite edges, because that graph runs deep enough
to exercise the structural claims further down:

```json
{
  "id": "tech-prerequisites",
  "edges": [
    {
      "from": { "collection": "technologies" },
      "field": "prerequisite_ids",
      "to": [{ "collection": "technologies" }]
    }
  ],
  "inverse": { "field": "unlocks" }
}
```

- `id` is package-unique, kebab-case.
- Each **edge site** declares `from.collection`, `field`, and `to`.
  - `from.collection` names a declared §1b collection id.
  - `field` names the collection-record field carrying target ids. It is
    written as a field name, as a JSON Pointer for a nested site, or as a
    JSON Pointer containing one `*` array-wildcard segment for a site inside
    an array of objects: `/inputs/*/item_id` reads the `item_id` field of
    every element of `inputs`. A recipe holding
    `"inputs": [{ "item_id": "clay", "qty": 3 }]` is declared exactly that
    way, and the quantities stay on the record where they belong.
  - `to` is the complete list of permitted target collections.
- **Orientation is fixed.** Every extracted edge points from the collection
  record that carries `field` to the collection record it references. For
  `prerequisite_ids` on a technology, edges point dependent → prerequisite.
- Sometimes one site points into different collections depending on the
  record. Such a site MUST name a `discriminator`: a second field, on the
  same record, that says which collection this particular id belongs to. It
  is written like `field` — a field name or a JSON Pointer. When `field` uses
  an array wildcard, the discriminator is read from the same array element,
  so each element may point somewhere different. By default the
  discriminator's value MUST be the id of a collection listed in `to`. If the
  values are the game's own words instead of collection ids, the site adds a
  `discriminator_map` that translates each permitted value into a collection
  listed in `to`; a value the map does not cover is a hard failure. Without a
  discriminator, an id that exists in more than one permitted target
  collection is a hard failure — nothing says which one was meant.
- `inverse` optionally names the back-pointer field on the target collection
  records, which is what makes reciprocity checkable. The back-pointer field
  holds one id or an array of ids, under the same extraction rule as `field`.

**Extraction.** A field value that is absent, `null`, or an empty array
contributes zero edges, and that is never a failure: a root technology with
no prerequisites, or an item no recipe produces, is an ordinary record.
Each present value MUST be a string id; any other type is a hard failure.
The same id appearing twice in one field contributes one edge, and a
validator SHOULD warn on the repetition, reporting it under the
`duplicate-edge` diagnostic. The warning decides nothing (§2d): a repeated id
leaves the edge set well-formed, and the repetition is usually an editing
slip worth seeing.

An edge set's sites may carry different relations — a crafting chain
declares "recipe consumes item" and "item is produced by recipe" as two
sites of one set, so the predicates below see the whole
recipe → item → recipe chain as one graph. Every predicate operates on the
union of the set's extracted edges.

Declaring an edge set makes **existence-completeness** an unconditional
obligation, checked as part of package validation: every edge value MUST
resolve to a collection record in a permitted target collection, with the
`dangling-edge` diagnostic carrying the source collection-record id, the
field, and the value. Completeness is not a citable claim, because it never
needs citing: it runs on every validation, unconditionally.

The three graph predicates below are claims. Each MUST be invoked by a §6
`document-check` acceptance test whose `rule_set` is `opengdd-graph-1`,
carrying its rule objects in the test block's `rules` field (§6 defines the
rule shape). Those rules use the closed grammar below. A rule carrying
fields outside its own predicate's list is invalid. No predicate
here carries rates, capacities, or flow fields.

1. **`acyclic`** — `{ "predicate": "acyclic", "edge_set": <id> }`. The edge
   set induces a directed acyclic graph, so no path returns to where it
   started. Diagnostics: `cycle`, carrying one complete cycle as an ordered
   list of collection-record ids.
2. **`reciprocal`** — `{ "predicate": "reciprocal", "edge_set": <id>,
   "exemptions": [ { "collection": <id>, "id": <record-id> } ] }`, where
   `exemptions` is optional. Forward edges and declared `inverse`
   back-pointers form a bijection in both directions, so each forward edge
   has exactly one matching back-pointer and the reverse holds too.
   The bijection is over edges, not records: a forward field holding
   several ids forms several edges, and each needs its own matching
   back-pointer, which is not a violation. An exempted collection record is
   ignored entirely — every edge incident to it, in either direction, is
   dropped before the comparison. The edge set MUST declare `inverse`.
   Diagnostics: `one-way-edge` and `dangling-back-pointer`, each carrying
   both collection-record ids, and `duplicate-edge`, which names the
   extraction warning above wherever the repetition sits, on a forward field
   or on a back-pointer.
3. **`monotone-attribute-along-path`** —

   ```json
   {
     "predicate": "monotone-attribute-along-path",
     "edge_set": "tech-prerequisites",
     "attribute": { "field": "era_order" },
     "trend": "target-at-most-source"
   }
   ```

   `attribute` takes one of two forms. `{ "field": <name> }` applies when
   every collection in the edge set uses one field name. `{ "fields": {
   <collection-id>: <name>, ... } }` covers every collection the edge set
   touches, one name each.

   `trend` names the assertion each edge must satisfy. Every edge points
   source → target. `target-at-most-source` asserts
   attribute(target) <= attribute(source). `target-at-least-source` asserts
   attribute(target) >= attribute(source). The example above is
   `target-at-most-source` because prerequisite edges point dependent →
   prerequisite, and the claim being made is prerequisite.era <=
   dependent.era.

   The value says what it asserts, so no mental inversion is needed. A tool
   SHOULD still confirm the choice by rendering a sentence about the author's
   own records — "fire-making's era must not exceed smelting's" — rather
   than showing the raw pair.

   The check runs edge by edge, and passing it implies the property holds
   along whole paths. The path-level property is what the claim asserts.

   A missing or non-numeric attribute on any collection record in the edge set
   is a hard failure. The attribute rule is decidable from package bytes and
   is a package-level rule (§2d); evaluating the predicates themselves runs
   through the citing §6 `document-check` test. Diagnostics:
   `monotonicity-violation`, carrying both
   collection-record ids and both values, and `missing-attribute`.

Diagnostics are per file, collection-record id, and rule, as §6
`document-check` already requires, and per edge as well.

A complete worked test block, for the technology tree above plus a
`tech-unlocks-recipe` edge set with an `unlocked_by_tech_id` inverse:

````markdown
### AT-7 — Declared graph structure holds

```test
{
  "type": "document-check",
  "artifacts": ["manifest.json", "content/technologies.json",
                "content/recipes.json"],
  "rule_set": "opengdd-graph-1",
  "rules": [
    { "predicate": "acyclic", "edge_set": "tech-prerequisites" },
    { "predicate": "reciprocal", "edge_set": "tech-unlocks-recipe" },
    { "predicate": "monotone-attribute-along-path",
      "edge_set": "tech-prerequisites",
      "attribute": { "field": "era_order" },
      "trend": "target-at-most-source" }
  ],
  "diagnostics": ["cycle", "one-way-edge", "dangling-back-pointer",
                  "duplicate-edge", "monotonicity-violation",
                  "missing-attribute"]
}
```
The technology tree has no prerequisite cycles; technology↔recipe unlock
pointers agree in both directions; and no prerequisite sits in a later
era than the technology that requires it.
````

The declaration is structure-only. It does not define what an edge *means*:
recipe, unlock, and adjacency semantics stay in the collection's `defined_in`
section. It carries no rates, capacities, conservation, throughput, or
steady-state flow claims, no runtime graph state, and no solver predicates
(§6, §7a).

## 2. The three authority levels

*For designers. This is the core mechanism of the format; nobody skips it.*

Every design statement in the spec carries one of three authority levels.
Fixed is the default and needs no tag. Chapters mark non-default sections
with a blockquote tag.

| Level | Tag | Meaning |
|---|---|---|
| **Fixed** | (default, untagged) | Build exactly as written. Deviation fails certification under the experimental protocol (§2d). |
| **Delegated** | `> DELEGATED:` | The builder decides. The spec states intent and constraints; the implementation may vary. |
| **Personalization** | `> PERSONALIZATION: <id>` | Resolved by the answer to question `<id>` in `personalization.json`. |

**Scope.** An authority tag has an exact syntactic scope. It starts at the tag
and ends at the next authority tag in the same heading section, or at the end
of that section, whichever comes first. The section ends at the next heading
of the same or a higher level. A statement with no authority tag in scope is
Fixed, which is why Fixed needs no tag of its own.

**Token grammar.** What follows `DELEGATED:` is an optional free-text label. It
is descriptive only, and no rule reads it, with one exception: the §9.10
direction fence requires the exact label `presentation-direction` on its first
line. What follows `PERSONALIZATION:` MUST be the id of a question declared in
`personalization.json` (§5). A tag naming no declared question is a hard
failure, and it is a package-level one (§2d): the id and the question
declaration are both package bytes.

The three levels are the core mechanism of the format: they make every build
unique while keeping the design intact.

**What v0.5 resolves by machine.** All three levels are prose-level
instructions to the builder, with one exception: v0.5 defines machine
semantics for Personalization only where an answer moves a number, and §5
owns that machinery. For a personalized prose section or collection record,
v0.5 defines no machine effect; §5's "Answers outside tuning" rules say how
the builder resolves one.

## 2a. The responsibility boundary

*For designers and builders. It settles who decides what, so read it before you argue about it.*

One test decides which statements must be Fixed and which may be Delegated:
**does the difference change play, in a way a player can observe?**

Suppose two builds of one spec differ. If a player could notice the
difference, and it changes how the game plays, that difference is design
area. The spec must pin it, and give the design reason. If no player could
ever tell, it is the builder's craft.

That leaves a third case, and it is the common one in presentation: a
difference a player plainly sees which does not change how the game plays.
Two builds may light the same room differently, or animate the same win at
different speeds. That area is Delegated. A designer who wants to
constrain it without pinning it uses the art-direction block (§9), which
states targets and leaves the means open.

The rendering technique is one such area. A spec's §3 `platform` names
the state space the design is responsible for; the renderer that draws it is
the builder's, and a `web-2d` world may be drawn with flat sprites or a
perspective 3D renderer without touching the design area, provided every
Fixed and constrained claim still holds. The build declares its renderer in
`opengdd-build.json` (§7); the spec never does.

Some decisions belong to neither party, but to **the format itself**. These
are ecosystem properties, where builds agreeing with each other matters more
than anyone's preference. The format fixes three of them.

- **PRNG algorithm.** Seeds are strings. Hash an addressed seed's exact UTF-8
  bytes with FNV-1a (32-bit), then drive Mulberry32. The same address then
  draws the same sequence in anyone's build, which is what makes a seeded
  acceptance test checkable.
- **PRNG address.** A stream address has this canonical text grammar:

  ```text
  address = seed *( ":" unit ":" index ) [ ":stream:" stream ]
  unit    = lowercase-kebab-name
  index   = "0" | [ "-" ] nonzero-digit *digit
  stream  = lowercase-kebab-name
  ```

  `+`, leading zeroes, and `-0` are forbidden.

  One reserved name departs from the `stream` production above: the stream a
  contract's acceptance test addresses is named
  `contracts.<instance>.<template-id>`, three dot-free kebab segments joined
  by dots and parsed like a tuning key. The generated block is where it is
  declared — in text the builder reads, as every stream must be — and its
  seeds are recorded in that instance's surface (§10.11).

  The spec MUST declare four things about its addresses.

  1. Every unit and named-stream template.
  2. Each index's meaning and origin.
  3. Whether a unit accepts signed coordinates or only non-negative
     ordinals.
  4. The order in which draws are consumed inside a sequential stream.

  These four MUSTs bind the package, and they are prose obligations under
  §2d. They are discharged in the spec's own chapters, since v0.5 declares no
  machine site to hold them: no validator can decide whether a spec has named
  every unit or fixed every draw order. People reading the chapters decide it,
  and a builder who finds one missing files a §2b ambiguity report.

  An address may carry more than one `unit:index` component, as in
  `{seed}:chunk-x:-4:chunk-y:7:stream:terrain`. Ordinal units may nest, as in
  `{seed}:arena:2:wave:4:spawn:7:stream:choreography`. The floor form is
  `{seed}:floor:{n}` with non-negative `n`. A root stream is allowed
  only when declared. No free-form path segment is an address.

  Named streams isolate draw sequences from each other. The same address and
  Fixed consuming procedure MUST produce the same result in every build. A
  Delegated consuming procedure promises deterministic replay only within its
  own build and that build's Fixed invariants. So a spec MUST NOT require an
  exact cross-build artifact hash while delegating the procedure that creates
  it.
- **Tie-break rule.** Some rules force a choice: which target, which
  order, what happens when two conditions fire at once, which of two equal
  distances wins. Every such rule MUST state its tie-break. A validator
  should flag choice-shaped verbs such as "nearest", "first", and "when both"
  when no tie-break is present.

## 2b. Spec lifecycle

*For designers. Skip if you are only building from someone else's spec.*

Three stages describe how far a spec has been proven. They are stated in
terms of certified builds, so they take effect only as far as the
experimental certification protocol does (§2d).

- **Draft.** No build has ever been certified from it. It is buildable at
  your own risk, and ambiguity reports are expected and welcomed.
- **Proven.** At least one certified build exists, normally the designer's
  own reference build. Producing that build is part of authoring, because it
  exposes the rules the spec left unstated.
- **Hardened.** At least two independent builders have certified builds.

A failed build checkpoint generates an **ambiguity report**, routed to the
designer as a spec issue: what the builder found, what the spec left open,
and which spec revision it was filed against. The format does not yet
standardize the report's shape.

Reviews attach to builds, and never to specs. A spec's quality signal would
come instead from its certification rate, its independent-build count, and
the ratings of its certified builds.

## 2c. Ruleset state

*For designers. Skip unless your game swaps one whole ruleset for another while play is in progress.*

Some games change which rules are active while play is in progress: a game
might swap one complete ruleset for another between acts or scenes.

Fixed prose can define these systems, and declared state can represent them.
The optional manifest field `ruleset_state` gives that pattern a shared
structure:

```json
{
  "ruleset_state": {
    "rulesets": [
      { "id": "act1-cabin", "initial": true },
      { "id": "act2-pixel" }
    ]
  }
}
```

A `ruleset_state` block MUST contain `rulesets`. Its ids are unique and
exactly one entry carries `initial: true`. A ruleset needs no `defined_in`
pointer. Its semantics are the chapter statements tagged with its id, using
the tag defined below.

The declaration makes one §4a reference form resolvable, with a Boolean
value: `state:member:ruleset:<ruleset-id>` is true when that ruleset is
active. The first segment after `state:member` is the declared-set id (§4a),
and the id `ruleset` is reserved for this form.

Use `> RULESET: <id>` to scope a prose section to one ruleset. A
`tuning.json` `meta` entry MAY also carry a `ruleset` field. Both forms MUST
name a declared ruleset id. A dangling tag is a hard failure.

A prose tag has an exact syntactic scope. It starts at the tag and ends at
the next `> RULESET:` tag in the same heading section, or at the end of that
section, whichever comes first. The section ends at the next heading of the
same or a higher level. An untagged statement is authoritative under every
ruleset.

Tooling guarantees exactly three things: parsing ruleset tags,
checking that each ruleset tag and `tuning.json` `meta.ruleset` value names a
declared ruleset id, and enumerating which statements are shared or belong to
one ruleset.

Tags cannot establish semantic claims about mutual exclusion or reachability,
such as "these two rulesets are never simultaneously active." Game-local §6
tests cover those claims. Use a `scenario`, an `exhaustive-search` test,
or a game-local `document-check` rule set.

## 2d. Conformance layers and certification status

*For auditors and tool authors. Designers: read the two-severity rule and move on.*

v0.5 defines two normative conformance subjects for a design — the package
and the build record — and one experimental protocol. Every conformance or
certification statement in this document reads against this section. Prose
also says that a validator or a runtime outcome conforms; those uses read
against the rules written for them and introduce no third conformance subject.
There are two severities, and only two. An **error** is decisive: "hard
failure", "validation failure", and "validation error" all mean the same
thing — the package or build does not conform. A **warning** advises: it
points at something worth looking at and decides nothing. §7's
package-consistency check 6 shows the two severities keeping their subjects
straight: a build whose `acceptance.passed` falls short of `acceptance.total`
does not conform, and the shortfall is an error against build conformance
rather than a complaint about the file — the record stays a well-formed,
schema-valid record of an incomplete build.

**Package conformance (normative).** A package conforms when each machine file
for which this document publishes a schema validates against its published
v0.5 schema — `manifest.json`
against the manifest schema, `tuning.json` against the tuning schema, and,
when present, `personalization.json` against the personalization schema and
`direction.json` against the direction schema — and the package satisfies every package-level MUST in this
document. A package-level MUST is one decidable from the package bytes alone.
A MUST about build behavior, cross-build stability, or test execution reads
against the build-record conformance layer or the experimental protocol
instead. The published
validator implements checks of package conformance; the rules, not any one
tool's current coverage, define it. Package-level rules are of two kinds.
Machine-decidable rules — schema validity, completeness, shape grammar, and
cross-file consistency — are decided by validation, and a validator error is
a conformance failure. Prose obligations, such as §2a's tie-break rule or the
rule that normative prose cites a tuning key rather than repeating its value,
bind the package with the same force, but deciding a violation can take human
judgment; a validator surfaces likely violations as warnings, and a warning
does not by itself decide conformance.

**Build-record conformance (normative).** A build conforms when it ships an
`opengdd-build.json` that validates against the build schema and passes every
§7 validator-level package-consistency check, including the §9.11
direction-result rules. The record is the builder's
completion claim: shipping it asserts that every acceptance test passed, and
so that every certified pin its tests cover matched (§9.9). v0.5 machine-checks the record's internal
validity and its consistency with the source package; it does not audit the
assertion's truth. Auditing that truth is what certification would do. A
build that still fails a test does not yet ship a conforming record; what it
has are §2b ambiguity reports.

**Build certification (EXPERIMENTAL in v0.5).** Certification would be the
audited claim that one particular build faithfully implements its spec. The
audit has four intended parts: executing the §6 acceptance tests, accounting
for every Fixed statement, scoring judged direction claims (§9.11), and
auditing the §7 `evidence` record. It is described by the conformance
certification protocol published at `conformance/CERTIFICATION.md` in the
OpenGDD conformance suite. The panel protocol behind the third part is not
yet integrated and sits outside that draft's audit scope.

v0.5 does not define a normative certification outcome, an execution grammar
for `test` blocks beyond §6's package-level field set, or a panel protocol for
judged claims. Where this
document describes certification, it describes the intended shape of that
protocol. No v0.5 statement grants or withholds a certification outcome, and
no construct in this document can fail a build's certification, because the
draft protocol's outcomes are experimental.

The experimental status changes no file's shape. `opengdd-build.json` keeps
its required fields, including `evidence`, and packages keep their §6
structural obligations. Record conformance checks the `evidence` field's
shape and counts only: no record-conformance check executes tests or
reproduces hashes. A contract's folder rules, closed surface, vendored-core
identity, and generated-block byte equality are package-level rules of the
first kind, all decidable from package bytes (§10); its core digest is not a
package rule at all, and recomputing one is audit work under the experimental
protocol, exactly as with every other hash here (§10.3). Fixed statements bind at full force regardless:
passing every acceptance test is necessary but never sufficient for the
experimental certification protocol, because a Fixed statement binds
whether or not a numbered test restates it (§2).

## 3. manifest.json

*For designers. One short file per spec, and you write it once.*

The manifest carries the spec's identity and entry points. It is
machine-validated against [manifest.schema.json](https://opengdd.org/schema/core/v0.5/manifest.schema.json). Here
is a complete manifest for §1a's getaway driver, with none of the optional
top-level structures further down:

```json
{
  "opengdd": "0.5",
  "id": "getaway-driver",
  "version": "1.0.0",
  "title": "Getaway Driver",
  "designer": { "name": "OpenGDD Examples" },
  "target": {
    "platform": "web-2d",
    "genre": "arcade driving",
    "session_minutes": 5,
    "audience": "anyone; one hand on the keyboard"
  },
  "build": {
    "chapters": ["01-overview.md", "02-mechanics.md", "03-content.md",
                 "04-presentation.md"],
    "plan": "05-build-plan.md",
    "tuning": "tuning.json",
    "personalization": "personalization.json"
  }
}
```

Its required top-level fields are exactly:

- **`opengdd`** is the format version. Its value is `"0.5"`.
- **`id` and `version`** identify the spec. `version` uses semver, and `id` is
  unique within a registry.
- **`title` and `designer`** name the game and its designer. The designer has
  a name and may also have a registry handle and contact details.
- **`target`** gives the platform, the genre family, the session length, and
  the audience. `platform` names the delivery target and the **state space**
  the designer is responsible for — what the game must keep track of, not
  what it looks like. v0.x accepts `web-2d` and `web-3d`. A game whose world
  is a plane declares `web-2d` no matter how a build draws it; `web-3d` is
  for a game whose state itself needs three dimensions. Rendering technique
  is never a platform fact: it is the builder's craft on §2a's boundary, and
  a build records what it rendered with in `opengdd-build.json` (§7).
- **`build`** names the entry-point chapters and the paths to the build plan
  and tuning file. It may also name a personalization file. The five chapter
  filenames are normative (§1), so `build.chapters` lists them under their
  canonical names; `build.plan` is the one of the five a package may point
  elsewhere, and its default is the canonical `05-build-plan.md`.

`build.direction` names the optional §9 direction file, `direction.json`. As
of v0.5 the rules for that file are normative, and it has a schema of its
own. A direction block in `04-presentation.md` and a declared
`direction.json` MUST appear together. If either appears without the other,
validation fails.

Four optional top-level fields declare other package structures:

- `content` declares §1b collections.
- `graphs` declares §1c edge sets over those collections.
- `ruleset_state` declares the §2c block.
- `descriptors` declares the named descriptor families from §8. Mood is the
  only populated family in v0.5 (§8a).

Adopted contracts are the one package structure with no manifest field of its
own: the `contracts/` directory's contents are the declaration (§10.2). The
manifest still carries the one binding that holds information rather than
restating presence — a `content` entry's optional `instance` field, which says
which contract record schema validates that collection's records (§§1b, 10.7).

The optional `commerce` profile contains `license`, `split`, and an optional
`derived_from` field:

```json
{
  "commerce": {
    "license": "opengdd-share-v0",
    "split": { "designer": 50, "builder": 50 },
    "derived_from": { "id": "parent-spec", "version": "1.0.0" }
  }
}
```

The commerce profile is REQUIRED when a spec is offered for third-party
building or marketplace listing on any registry. It MAY be omitted without
penalty for internal, jam, archival, test, and other artifact-only uses.
The experimental certification protocol never requires commerce metadata.
Whether the profile is present or absent MUST NOT change gameplay expression,
authority, or a build's standing under that protocol.

`opengdd-share-v0` permits building and deployment under the declared split.
Revenue-bearing builds must ship with attribution metadata. The percentages
in `split` MUST sum to 100.

`derived_from` is **Reserved** and inert in v0.x. It records lineage metadata
only. Fork licensing and royalties remain outside v0.x. Modifications beyond
the declared personalization bounds have no path through the experimental
certification protocol. These rules belong to the commerce profile and do not
change core artifact semantics.

## 3a. Canonical schema URLs

*For tool authors. Designers: all you need is that `"opengdd": "0.5"` picks your schemas.*

Every published schema is identified and served at a canonical URL:

```text
https://opengdd.org/schema/<layer>/v<minor>/<file>.schema.json
```

For example:

```text
https://opengdd.org/schema/core/v0.5/manifest.schema.json
```

The `core` layer publishes five schemas: `manifest.schema.json` (§3),
`tuning.schema.json` (§4), `personalization.schema.json` (§5),
`direction.schema.json` (§9.10), and `opengdd-build.schema.json` (§7). The
first four are the package's; the fifth is the build record's. A contract
instance file has no schema here by decision, not by omission: §10's envelope
is format machinery while a core's content is not (§10.13), so §10 states the
envelope normatively in prose and a validator implements it. A schema for the
envelope may ship with tooling later; it would add no rule.

Four rules govern these URLs:

1. **The schema layer comes before the version.** Each schema layer versions
   independently. `core` is the only schema layer today. A future commerce
   profile could be another. The URL layout MUST NOT imply that different
   schema layers share one version.
2. **The version segment uses the format version.** It is `v` followed by the
   manifest's `opengdd` value. A schema under `/core/v0.5/` validates
   manifests that declare `"opengdd": "0.5"`. Schema URLs use minor-version
   granularity. Patch-level corrections are published as errata at the same
   URL and MUST NOT silently change any validation outcome.
3. **Published URLs are permanent.** A schema MAY be superseded by a newer
   version at a new URL. Its existing URL MUST NOT be repurposed or removed.
   The content served there is frozen except for the errata allowed above.
4. **There is no floating alias.** Documents MUST reference an explicit
   version. The format defines no `/latest/` URL.

## 4. tuning.json

*For designers. This is where your numbers live, so read it.*

`tuning.json` assigns each runtime number a role. It is machine-validated
against [tuning.schema.json](https://opengdd.org/schema/core/v0.5/tuning.schema.json).

`tunables` and `constants` split every number by who may change it. A tunable
is a rebalance-safe knob. A constant is a value the game's identity rests on,
and a rebalance may not touch it. Neither is a runtime variable.

Only numbers live here. Rebalancing is change by degree, so it presumes
numbers: a discrete choice belongs to a content collection record (§1b) or to
a personalization question's options (§5), and text belongs in content
records. The one declared set v0.5 defines is §2c's set of ruleset ids.

```json
{
  "tunables": { "hazard.interval_seconds": 1.2 },
  "constants": { "lane.count": 2 },
  "meta": {
    "hazard.interval_seconds": { "range": [0.8, 2.0], "must_match": true },
    "lane.count": { "must_match": true }
  },
  "invariants": [
    {
      "language": "opengdd-expr-1",
      "id": "positive-interval",
      "assert": { "op": "gt", "args": [
        { "ref": "tuning:hazard.interval_seconds" }, 0
      ] },
      "message": "hazard interval must be positive"
    }
  ]
}
```

- **`tunables` is required.** It is a flat object with namespaced dotted keys.
  Every runtime numeric parameter that a data-only balance or configuration
  revision may change MUST live here, with one declared home elsewhere: a
  parameter of a mechanism the package adopts as a contract lives in that
  contract's surface instead, under the reserved `contracts.` namespace, and
  reaches the resolved snapshot from there (§10.11).
- **`constants` is optional.** It is a flat object of numeric Fixed rules
  exposed to runtime data. Changing a constant is a mechanics or content
  change. A balance-only revision cannot change it.
- **`meta` is optional.** Its keys come from `tunables` or `constants`. A
  `range` is an inclusive `[minimum, maximum]`, and is allowed only when the
  key comes from `tunables`. `must_match` says that the built value must
  reproduce the resolved snapshot's value exactly, and it is what the
  experimental certification protocol would audit (§2d). A `meta` entry MAY
  also carry a `ruleset` field
  naming a §2c ruleset id.
- **`invariants` is optional.** It contains the §4a expressions. Every
  invariant MUST evaluate true after personalization resolution and before a
  run starts. At package validation the validator evaluates invariants at
  package defaults; over a personalized build's resolved snapshot the same
  obligation is audited under the experimental protocol (§2d).
- **`clocks` is optional.** It declares the §4b modes-and-clocks block.

Four rules hold over the file as a whole, and each is decided from the file's
own bytes.

1. **The top level is a closed shape.** `tunables`, `constants`, `meta`,
   `invariants`, and `clocks` are the only legal top-level fields. Any other
   field is a validation failure.
2. **Every tuning value is a finite JSON number.** This holds for `tunables`
   and `constants` alike. A string, a Boolean, an object, an array, or `null`
   under a key is a validation failure.
3. **Every key is a dotted key.** A key in `tunables` or `constants` is two or
   more segments joined by `.`, where each segment is one or more characters
   drawn from `a`–`z`, `A`–`Z`, `0`–`9`, `_`, and `-`. `hazard.interval_seconds`
   and `lane.count` are keys; a single bare word is not. A key MUST NOT open
   with a segment reserved for prose citation, and no segment of it may be a
   reserved extension. Either would make the key unciteable in prose, and both
   lists are given below.
4. **A declared value sits inside its own range.** Where a key declares
   `meta.range`, the value that key carries in `tunables` MUST lie inside that
   inclusive range. A package whose own number falls outside the range it
   declares for that number is a validation failure.

**Package defaults** are the resolved tuning snapshot (§5) produced by
applying every personalization question's `default` through §5's resolution
pipeline. For a package that declares no `personalization.json`, the package
defaults are `tuning.json`'s own `tunables` verbatim. This is
the snapshot at which package validation evaluates the invariants above and
§4a's arithmetic failures.

A key MUST be unique across `tunables` and `constants`. Every `meta` key MUST
exist in exactly one of those objects. A balance-only game-spec revision may
change only `tunables`, and only within declared ranges. It MUST NOT change
`constants`, structured-content facts, or a test's replays. A contract knob
follows the same rule under its own declaration: a `kind: tunable` knob is a
balance revision's to move within its range, and a `kind: constant` knob is
out of its reach (§10.11).

Numbers that belong elsewhere stay elsewhere:

- A number that only says how many of something there are MAY stay in Fixed
  prose, as long as no program needs to read it. A mechanics chapter saying
  a run lasts three rounds is one such number.
- A per-content measurement or solver-derived fact lives on that content's
  own collection record.
- Test inputs, sample counts, seed sets, schedules, expected observations,
  and tolerances live in the acceptance test or its replay. Where a contract
  template declares the inputs it needs, they are recorded in that instance's
  surface and land in the instantiated test, which is the same rule reached
  through a declaration (§10.6).
- Examples and identifiers carry no numeric authority. A displayed numeric
  example in prose MUST be marked non-normative.

### Reading a citation in prose (normative)

§1 requires normative prose to cite the tuning key rather than the value, and
the citation is written bare: the key alone in inline code, with no prefix.
Chapter prose carries other dotted tokens too, so one rule decides what a
token is. A backticked dotted token in chapter prose is classified by the
first of these that matches:

1. **Its first segment is reserved** → a mechanism path, resolved against the
   file that owns it. `mood.rain-glass` resolves in `direction.json` (§9),
   `meta.hazard.interval_seconds` in `tuning.json`.
2. **Every segment is all digits** → not a citation. `0.5.0` is a version
   string.
3. **Any segment of it is a reserved extension** — `json` or `md` → a file or
   file-member mention, such as `tuning.json`, `02-mechanics.md`, or
   `tuning.json.invariants`. The extension need not be the last segment, which
   is why a tuning key MUST NOT carry one in any position.
4. **Otherwise** → a tuning citation. It MUST resolve to a key declared in
   `tuning.json`. A token that resolves to nothing is a dangling citation, and
   a validation failure.

The reserved first segments are `pillars`, `mood`, `anti`, `must_keep`,
`constraints`, `viewing`, `semantics`, `meta`, `tunables`, `constants`,
`invariants`, `clocks`, `manifest`, `build`, `descriptors`, and `contracts`.
`content` is deliberately not among them: it is a natural key namespace for a
designer. The list is versioned: a later revision of this format MAY extend
it as new mechanisms claim a segment, and a validator that rejects a key on a
newly reserved segment names the revision that reserved it.

`contracts` earns its place on that list by rule 1: a backticked
`contracts.stamina.max` in prose is a mechanism path, resolved against the
instance file that owns it (§10). That is how chapter prose cites a contract
knob, and §1's rule that prose cites the key rather than the value holds over
it unchanged. The typed form `tuning:contracts.<instance>.<knob>` is a
different channel: it is the §4a reference, resolving in the resolved
snapshot, and it is what a generated test block carries (§10.9). Prose cites
bare; the JSON channel cites typed; neither reaches into the other.

Typed references keep their prefixes in prose. `state:` and `content:` (§4a)
name ids the designer chose, so no first segment can classify them, and
`descriptor:<family>:<id>` (§8a) is always written in full.

## 4a. Declared expressions and invariants

*For designers and tool authors. Skip unless you want the format to enforce a rule between two of your numbers.*

`opengdd-expr-1` is a closed, typed abstract syntax tree stored as data. It is
never source text. A named expression has four fields: `language`, a stable
`id`, a Boolean `assert`, and a diagnostic `message`.

```json
{
  "language": "opengdd-expr-1",
  "id": "interval-order",
  "assert": {
    "op": "lte",
    "args": [
      { "ref": "tuning:hazard.interval_min_seconds" },
      { "ref": "tuning:hazard.interval_start_seconds" }
    ]
  },
  "message": "minimum interval must not exceed starting interval"
}
```

A designer writes an expression like this to hold a rule between numbers.
The one above says the minimum hazard interval must never exceed the
starting interval. Like every invariant, it is checked after personalization
resolution and before a run starts.

Every expression node takes one of three forms:

- a finite JSON Boolean, number, or string literal;
- `{ "ref": "<typed-reference>" }`; or
- `{ "op": "<operator>", "args": [<finite explicit node list>] }`.

The operator set is closed. These are all its operators and signatures:

- **Boolean.** `and`, `or`, `all`, and `any` take one or more Booleans. `not`
  takes exactly one Boolean.
- **Equality.** `eq` and `ne` take exactly two values of the same type.
- **Numeric comparison.** `lt`, `lte`, `gt`, and `gte` take exactly two
  numbers.
- **Numeric arithmetic.** `add`, `mul`, `min`, `max`, and `sum` take one or
  more numbers. `sub`, `div`, `pow`, and `mod` take exactly two numbers.
  `floor`, `ceil`, and `abs` take exactly one number.
- **Numeric series predicates.** `strictly-increasing`, `nondecreasing`, and
  `all-positive` take one or more numeric references in an explicit ordered
  list. They return Boolean.

`sum`, `all`, and `any` operate only on their explicit finite `args`. They do
not traverse runtime collections. `mod(a,b)` means
`a - b * floor(a / b)`.

Four conditions are hard validation failures: division by zero, modulo by
zero, an invalid real-number domain, and a non-finite result. At package
validation these are decided at package defaults; over a personalized build's
resolved snapshot they are audited under the experimental protocol (§2d).

Typed references are profile-limited. The first form below reads
`tuning.json`; the next three reach into declared runtime state and declared
content; the last is legal only inside a contract core:

- `tuning:<dotted-key>` → number from the resolved `tunables` or `constants`;
- `state:number:<declared-id>` → number from a declared runtime inventory,
  resource, counter, or other numeric state binding;
- `state:member:<declared-set-id>:<declared-member-id>` → Boolean membership in
  a declared runtime set;
- `content:<collection-id>:<JSON-Pointer>:count` → numeric length of a declared
  array; and
- `knob:<name>` → number from a contract core's own knob meta, legal **only**
  inside that core's invariants (§10.5). A core is authored before any
  instance of it exists, so it cannot name itself
  `tuning:contracts.<instance>.<knob>`; once a package adopts it, the same
  number is reachable as an ordinary `tuning:` reference.

No reference form binds a decision-flag answer, in a core's invariants or
anywhere else. `state:member` is the near miss a designer will reach for, and
the exclusion is deliberate: a flag answer reaches generated text only through
the phrases its core author wrote (§10.9).

A format or profile definition MUST declare every runtime-state binding. For
each binding, it declares the type and when the value is read.

A package declares a `state:number` binding by either of two paths. A §4b
clock's `governs` list declares every reference it names, so a governed clock
value needs nothing further. Otherwise the binding is declared where its prose
defines it: writing the reference itself in a chapter at the package root, or
in the `defined_in` section of a §1b collection, declares it, and the
surrounding prose is where the type and the read timing are stated. A
reference neither path declares does not resolve, and citing it is a hard
failure.

A §2c `ruleset_state` declaration is one such definition. It makes the
`state:member:ruleset:<ruleset-id>` form resolvable: true when the named
ruleset is active.

A structured-content condition may bind only declared state ids and literals,
unless the collection's `defined_in` section opts into another binding.

The following are hard failures: an unknown operator, wrong arity, an
unresolved reference, a type mismatch, implicit coercion, and a non-finite
number. Arbitrary functions and host code are forbidden. So are filesystem or
network access, implicit traversal, recursion, and unbounded iteration.
Reachability and solver predicates belong to §6.

## 4b. Clocks and resolution modes

*For designers. Skip unless your game mixes real time with turns or a pause.*

A game can bridge two **resolution modes**. It might place real-time combat
inside a paused strategic layer, or a turn-based mission inside a running
campaign. A difficulty setting, a menu screen, or a game mode in the
marketing sense is not a resolution mode. Such a game makes
player-observable promises about which clocks advance in each mode. A clock
here is one source of advance, such as running time or a turn index. A spec
MAY declare those promises:

```json
{
  "clocks": {
    "modes": ["strategic-running", "strategic-paused", "tactical"],
    "clocks": {
      "strategic_master_clock": {
        "governs": ["state:number:scan_progress"],
        "behavior": {
          "strategic-running": "advances",
          "strategic-paused": "frozen",
          "tactical": "frozen"
        }
      },
      "faction_turn_index": {
        "behavior": {
          "strategic-running": "does-not-exist",
          "strategic-paused": "does-not-exist",
          "tactical": "discrete-only"
        }
      }
    }
  }
}
```

The `clocks` block is an optional top-level field of `tuning.json`.
`modes` is a finite, closed list of package-declared ids. Every clock
declares exactly one behavior for every declared mode. The behavior comes
from this closed set: `advances`, `frozen`, `discrete-only`, and
`does-not-exist`.

`discrete-only` is the behavior that the `apply-discrete-order` action
requires below, as `advance-clock` requires `advances`. `does-not-exist` marks
state that has no value outside its mode. It does not mean "frozen at
zero." The object
shape makes contradictory behaviors for one clock in one mode
unrepresentable.

Chapter mode tags, such as `[TACTICAL]`, MUST name declared mode ids. The
reserved tag value `all` marks a statement as authoritative in every mode.
It is equivalent to leaving the statement untagged, but allows the author to
be explicit. `all` MUST NOT be declared as a mode id.

A clock MAY declare `governs`. It is a closed list of §4a typed state
references whose values advance only under that clock. The `governs` lists
of different clocks are disjoint. A reference governed by no clock has no
declared mode behavior. The §4b checks below apply only to governed
references.

A clock MAY declare `unit` as a string. The default is the spec's declared
time unit.

A replay (§6) has exactly one **active mode** at every point.
Modes do not nest or stack. The replay declares its initial mode.

Replay schedules use standard mode-transition actions. Each action is a
JSON object. The following four actions are the complete standard set. Any
other `action` value makes the replay data invalid:

- `{ "action": "enter-mode", "mode": <id> }` — the named mode becomes
  active. Precondition: the id is declared.
- `{ "action": "exit-mode", "to": <id> }` — the named mode becomes active,
  exactly as `enter-mode` makes it active. Both actions name the destination
  mode, `enter-mode` in `mode` and `exit-mode` in `to`; `exit-mode` exists so
  a trace reads leave-then-enter. Precondition: the id is declared.
- `{ "action": "advance-clock", "clock": <name>, "amount": <number> }` —
  `amount` is a finite positive number in the clock's declared unit.
  Precondition: the clock's behavior in the active mode is `advances`.
- `{ "action": "apply-discrete-order", "clock": <name>, "order": <string> }`
  — precondition: the clock's behavior in the active mode is
  `discrete-only`; `order` names a Fixed action defined in the chapters.

An action whose precondition fails is invalid replay data.

A §6 `scenario` or `property` test block MAY carry a **freeze invariant**:

```json
{
  "freeze_invariant": {
    "references": ["state:number:laser_charge_seconds"],
    "modes": ["strategic-paused", "tactical"]
  }
}
```

The block above says that within any one unbroken stretch spent in
`strategic-paused` or in `tactical` — a **maximal replay interval** — the
laser charge reads the same every time the replay looks at it. A later
stretch may read differently.

For every maximal replay interval whose active mode is in the named set,
each typed reference MUST have the same value at every replay observation
point in that interval. This includes the entry and exit boundaries. Typed
references use the §4a forms and must resolve under §4a's declared-binding
rules.

Naming a reference governed by a clock whose behavior is `advances` in one
of the named modes is a warning. Naming one governed by a clock
whose behavior is `does-not-exist` in a named mode is a hard failure.

A freeze invariant asserts only the observation-point equality defined
above. It makes no claim about unobserved states, write ordering,
indivisibility, or rollback. This section defines no transaction or snapshot
semantics. Mode-transition *procedures*, including what a transition writes
and how, remain Fixed prose under §2a.

## 5. Build personalization (`personalization.json`)

*For designers. Skip if every build of your spec should come out the same.*

`personalization.json` carries the questions asked before or while building.
Its top level is a closed object whose one required field is `questions`:

```json
{ "questions": [] }
```

`questions` is an ordered array of question objects, and its order is the
resolution order below. The file is machine-validated against
[personalization.schema.json](https://opengdd.org/schema/core/v0.5/personalization.schema.json).
One entry of that array:

```json
{
  "id": "theme",
  "prompt": "Where does the chase happen?",
  "type": "choice",
  "options": [
    { "id": "night-city", "label": "...", "notes": "..." }
  ],
  "default": "night-city",
  "affects": ["03-content.md", "04-presentation.md"]
}
```

A question object carries these fields, and the set is closed: adding one
takes a format revision.

- **`id`** is required: a string, unique within the file. It is the id a
  `> PERSONALIZATION: <id>` prose tag (§2) and a collection record's
  `authority.question` (§1b) name.
- **`prompt`** is required: a non-empty string stating the question as the
  builder is asked it.
- **`type`** is required, and is exactly one of `choice`, `text`, or `number`.
- **`options`** is required for a `choice` question and legal only there. It
  is a non-empty array of objects, each carrying a required string `id`
  unique within the question, a required string `label`, an optional `notes`
  string, and the optional `tuning_overrides` object below.
- **`default`** is required for every question. Its type follows the
  question's `type`: the `id` of one declared option for `choice`, a string
  for `text`, a JSON number for `number`.
- **`affects`** is optional: an array of package-relative paths, each of which
  MUST exist.
- **`resolution`** is legal only on a `number` question. It is the array of
  operations defined below.
- **`notes`** is optional: a string, under the same rule as an option's
  `notes`.

`default` is required because a skipped question with no default has no
defined outcome: nothing would say what the build resolved, and the resolved
snapshot could not be computed. Questions are optional for each build; when
one is skipped, its `default` applies, so every question has an answer either
way.

**`affects` (normative).** It declares which files of the package this
question's answer may influence. Each entry is a package-relative path under
§1's normalization rule, and every one MUST resolve to a file that exists; a
path that does not is a hard failure. That existence rule is the whole of its
machine meaning in v0.5. It grants no permission and withholds none: it does
not confine the answer's effect to the listed files, and no validator compares
it against what the answer actually changed. It is the designer's declaration
of reach, written for the builder who has to find it.

For a `choice` question, the declared `default` and every
recorded answer MUST name the `id` of one of its declared `options`: the
resolution pipeline below is defined only for declared option ids, and an
undeclared id is a validation failure.

For creative variants, designers SHOULD write `notes` a builder can act on
directly: concrete instructions. Notes MUST NOT be the only authority for a
numeric change.

### Enumerated answers

A choice option or other enumerated answer MAY declare exact tuning-key
replacements through `tuning_overrides`:

```json
{
  "id": "rush-hour",
  "label": "Rush hour",
  "tuning_overrides": { "hazard.interval_seconds": 0.9 }
}
```

Each key in `tuning_overrides` MUST name an explicit `tunables` key. A
`constants` key is never legal here, exactly as in numeric resolution below:
an answer may rebalance the game, and may not change what the game is.

Each value MUST lie within its key's declared `meta.range`, where the key
declares one. An override outside that range is a validation failure. There is
no `out_of_range` choice for an override, because there is nothing to clamp:
the designer wrote the number, not the player.

### Numeric answers

A numeric question that affects tuning MUST declare resolution operations:

```json
{
  "id": "hazard_pace",
  "type": "number",
  "default": 1.2,
  "resolution": [
    {
      "key": "hazard.interval_seconds",
      "operation": "replace",
      "operand": "answer",
      "bounds": "target-meta-range",
      "out_of_range": "clamp"
    }
  ]
}
```

Resolution operations use these fields:

- **`operation`** is `replace`, `add`, or `multiply`.
- **`key`** MUST name an explicit `tunables` key. A `constants` key is never
  legal here.
- **`operand`** is `answer` or a JSON number.
- **`bounds`** is `target-meta-range`.
- **`out_of_range`** is `clamp` or `reject`.

`clamp` uses the named key's inclusive `meta.range`. A key without that range
cannot use `clamp`.

`reject` refuses the value instead of clamping it. An operation declared
`out_of_range: "reject"` whose computed value falls outside the target key's
`meta.range` makes that **answer** invalid — not the package. Package
validation fires nothing, because an answer is not package bytes: a package
may declare `reject` on any operation, and the declaration alone is always
legal. Where it decides something is the build record: a recorded answer whose
resolution rejects fails build-record conformance under §7's check 4 (§2d).

**Contract knobs as targets.** A `tuning_overrides` key, or a resolution
`key`, MAY also name a contract knob, written `contracts.<instance>.<knob>`.
It is legal exactly when that knob's `kind` is `tunable` — the same rule as
"an explicit `tunables` key", read for a number that lives in a contract
surface — and its range and its `must_match` pin are read from the core's knob
meta and the surface's `meta` block rather than from `tuning.json` `meta`
(§10.11). Nothing else about a contract is a personalization target: its
answers, its test inputs, and its rows are Fixed (§10.6).

Resolution order is deterministic:

1. Apply questions in question-list order.
2. Within each question, apply operations in operation-list order.

Defaults use the same pipeline. Every final value MUST remain within its
key's declared range.

### The resolved tuning snapshot

The **resolved tuning snapshot** is the complete flat `tunables` map after all
default or supplied answers are applied. It carries every unpruned contract
knob as well, under its `contracts.<instance>.<knob>` key, so every number a
build runs on is findable in one place (§10.11). For every `must_match: true` key, it
is this snapshot that the experimental certification protocol would evaluate
the built value against, never the package default or the declared range
(§2d). `opengdd-build.json` MUST record the answers and the full resolved
snapshot.

### Answers outside tuning

Numbers are the whole of what v0.5 resolves by machine. A question may also
reach prose, through a `> PERSONALIZATION: <id>` section tag (§2), and
structured content, through a collection record whose `authority.level` is
`personalization` (§1b). For neither does v0.5 define a machine effect: there
is no include, exclude, or replace semantics, and no selector saying which
answer produces which section or which record.

A personalized prose section or collection record is resolved by the
builder's Delegated interpretation of the recorded answer, under §2a's
boundary and the §1a fantasy block's tie-break. The recorded answer in
`opengdd-build.json` is the only machine-checked trace of that resolution: a
validator confirms the answer names a declared question and a declared option
(§7), and nothing more. A designer who needs a personalized decision checked
gives it a number and a `tuning.json` key.

Choices made at runtime, such as boons, difficulty modifiers, crafting
choices, and laws, are gameplay state. They are not build personalization.

## 6. Build plan and acceptance tests (`05-build-plan.md`)

*For designers and builders. Required reading: this chapter is what a build is judged against.*

Under the experimental certification protocol (§2d), a certification harness
would execute this chapter, and its acceptance tests are what a build would be
certified against. The chapter's structure below is a normative package
obligation, and so is the closed test-block field set stated with the test
types. The executing runner is not defined in v0.5 and belongs to the
experimental protocol. The chapter MUST contain ordered phases. The v0
convention lists them as `core-loop` → `content` → `tuning` → `presentation`
→ `polish`. Each phase lists its scope, chapter references, and
machine-verifiable checkpoints. Phase structure is a prose obligation (§2d):
v0.5 defines no machine grammar for it, and validators do not decide it.

### Acceptance-test types

Acceptance tests are numbered `AT-1 … AT-n`. Their machine-checked shape
grammar: an acceptance test is a Markdown heading, at any heading level,
whose text begins `AT-<n>`. One file is scanned for those headings — the
build plan named by the manifest's `build.plan`, which is `05-build-plan.md`
unless the manifest says otherwise (§3) — and it MUST carry at least one.
Numbers MUST be unique and ascending in document order. Gaps are permitted: a
deleted test's number is retired and never reused, so `AT-4` names the same
check in every revision that still has one. This numbering scopes to the
tests the package writes itself: a generated test is named rather than
numbered, its heading begins `AT ` with no hyphen, and the scan above never
sees one (below). Every `AT-n` heading MUST be
followed by two things: a fenced JSON block whose fence carries the tag word
`test`, and, after that block, the human-readable statement of the
same check. This document calls what the fence holds a test block. Every
test block declares one of four **test types**.

- **`scenario`** declares Given/When/Then state and action semantics. An
  optional `replay` adds a versioned replay: initial state,
  schedule, ordered expected observations, numeric targets, tolerance
  semantics, and mismatch diagnostics.
- **`property`** declares a quantified input or domain and an invariant. Its
  `sampling` member is either the string `"exhaustive"` or a reproducible
  sampling plan object.
  A sampled plan MUST declare a deterministic `seed_set` and sample count.
  Its property MUST declare a **verdict rule**: `verdict: "per-sample"` or
  `verdict: "aggregate"`.
  - `per-sample` applies the invariant to every sample.
  - `aggregate` additionally MUST declare the deterministic `seed_set`,
    measured `metric`, `aggregation`, and `threshold`. `aggregation` is
    `count`, `rate`, `min`, `max`, `mean`, or a declared finite histogram
    with explicit bins.

  A finite named schedule set is a valid property domain. A sampled aggregate
  establishes only its declared bounded distribution claim. It cannot
  establish universal absence.
- **`exhaustive-search`** declares initial states, the legal transition or
  action set, a predicate, and either a finite-state declaration or an
  explicit state or depth bound. It MUST declare `complete: true|false` and
  the required solution and/or counterexample diagnostics. Only
  `complete: true` may establish absence, a minimum, universal reachability,
  or claims about every optimal solution. The test block MUST name the
  diagnostics that prove success and diagnose failure.
- **`document-check`** checks spec or content artifacts without running the
  game. Its test block carries four fields: `artifacts`, the
  package-relative files the check reads; `rule_set`, the versioned id of
  the rule grammar the rules are written in (a trailing `-<digits>` suffix
  is a version, matching the format's own rule-set names); `rules`, the
  array of rule objects in that grammar; and `diagnostics`, the named
  failure reports, which are per file, collection-record id, and rule. The
  core rule set `opengdd-graph-1` (§1c) covers the three citable graph
  predicates over declared edge sets, and §1c ends with a complete worked
  test block.
  Game-local rule sets cover obligations outside that core set.

A `scenario` or `property` test block MAY also carry a §4b
`freeze_invariant` field. When the package declares clocks, its replay
schedules use the standard §4b mode-transition actions.

#### The package-level test-block shape (normative)

The format defines exactly these test-block field names, and the set is
closed: adding one takes a format revision. A package validator reads these
names, decides their shapes, and reports a violation as a package
conformance error (§2d):

- `type`, in every block: a string, one of the four test types above.
- `scenario`: `given`, `when`, and `then`. Each is a string or an array of
  strings, and each MUST be non-empty. The example below writes `given` as one
  string and `when` and `then` as arrays.
- `property`: `domain`, a string or an object describing the quantified
  domain; `invariant`, a string; `verdict`, the string `"per-sample"` or
  `"aggregate"`; and `sampling`, either the string `"exhaustive"` or a plan
  object. A plan object carries `seed_set`, a non-empty array, and a sample
  count: a field whose name contains `sample`, such as `samples_per_seed`,
  holding a positive integer. Under `verdict: "aggregate"` the block also
  carries `seed_set` — a non-empty array, read from the block or from the
  `sampling` plan — `metric`, a string; `aggregation`, one of the strings
  `"count"`, `"rate"`, `"min"`, `"max"`, and `"mean"`, or a histogram object
  `{ "type": "histogram", "bins": [ … ] }` whose `bins` array is non-empty;
  and `threshold`, an object, written `{ "op": …, "value": … }`.
- `exhaustive-search`: `initial_states`, an array of strings; `transitions`, a
  string; `predicate`, a string; `complete`, a Boolean; `diagnostics`, a
  non-empty array of strings; and `bound`, an object naming its `type` string
  and at least one further field carrying the limit, or the `finite_state`
  declaration that stands in for it.
- `document-check`: `artifacts`, an array of package-relative path strings;
  `rule_set`, a string ending in its version suffix, as `opengdd-graph-1`
  does, or an object carrying `id` and `version`; `rules`, an array of rule
  objects written in that grammar; and `diagnostics`, a non-empty array of
  strings.
- In the blocks whose own rules admit them: `direction_claims`, a non-empty
  array of dotted-path strings (below); `rules` (§1c); `diagnostics`, a
  non-empty array of strings; `freeze_invariant`, an object (§4b); `replay`,
  an object; and the expected-observation pair `target`, which takes the
  observation's own JSON type, and `tolerance`, a number.

Which of these a block MUST carry is stated with the type that carries it;
this list settles the names, not the obligations. A package validator decides
these shapes as far as they are decided at all: where a field takes one type,
it decides that type, and where a field is prose-shaped it decides presence
and non-emptiness, with the string form and the array form equally legal.

A block MAY carry further fields of the package's own, such as a fixture id
or a capture handle its harness needs. The format gives them no meaning and
no validator rejects them, exactly as §8 leaves any other coined identifier
to the designer.

The list is package-level, and closed at the field-name level named here.
Test execution semantics are not in it: how a runner reads a `given`, a
`when`, or a `then`, how it plays a `replay` back, and what an observation is
worth remain the experimental certification protocol's (§2d). A package
validator decides which fields are present and whether their shapes are
well-formed; it never runs the check.

### Direction-claim citations

A `scenario` or `property` test block that covers a §9 direction claim MUST
carry `direction_claims`. This field is a non-empty array of exact dotted
paths. A **test block** may cite only these claim kinds:

- `constraints.palette.<key>`
- `constraints.thresholds.<key>`
- `constraints.timing.<key>`
- `descriptors.mood.<mood-id>.palette.<role>`

The fourth path leaves `direction.json`. It names one palette role inside a
mood descriptor declared in `manifest.json` (§8a), and its `<mood-id>` segment
is that descriptor's own `id` — never a `mood.<key>` local key from the
direction block.

Pillars, mood entries, anti-references, and `must_keep` entries are never
cited by a test block. They are scored directly against the finished build
under §9.11.

Direction-claim completeness:

1. Every path in `direction_claims` MUST resolve: a `constraints.*` path to a
   declared `direction.json` entry, and a `descriptors.mood.*` path to a
   declared mood descriptor's declared palette role. A dangling citation is a
   hard failure either way.
2. Every `constraints.*` entry MUST be named by at least one AT's
   `direction_claims`. All `constraints.*` entries are fixed observational
   `checked` claims under §9.11. An entry covered by no AT is a validation
   failure.
3. Completeness does not run back the other way for mood palettes: no rule
   requires a mood palette role to be cited, and an uncited role is judged
   with its mood (§8a).

An AT that carries `direction_claims` MUST NOT restate the cited claim's
value or scope. The §9.5 single-source rule extends to this field.

Example scenario, the commonest type, from the getaway driver's build plan:

```test
{
  "type": "scenario",
  "given": "a chase running at the resolved hazard.interval_seconds",
  "when": ["the road runs for sixty seconds and the player never crashes"],
  "then": ["no two hazards arrive closer together than that interval"],
  "diagnostics": ["hazard-spawn-log"]
}
```

Example aggregate property:

```test
{
  "type": "property",
  "domain": "generated chase routes at difficulty 3",
  "sampling": { "seed_set": ["night-city", "harbour"], "samples_per_seed": 100 },
  "invariant": "the sampled route can be driven from start to end",
  "verdict": "aggregate",
  "metric": "drivable-route",
  "aggregation": "rate",
  "threshold": { "op": "eq", "value": 1.0 }
}
```


Replay paths MUST be package-relative. When a replay is structured
content, it MUST be declared through §1b. A tolerance without an expected
target is invalid. A target without its input or schedule replay is also
invalid.

A test block states what must be proved. It leaves the implementation
architecture open.

### Generated acceptance tests

A package that adopts a contract (§10) grows acceptance tests from it. The
core's templates are instantiated over that instance's answers and rows, and
the result is appended to this chapter as a marked block at the end of the
file, after all game-local content and outside the phase structure. §10.10
gives the markers, the ordering, and the byte layout.

Generated tests differ from the ones a package writes in exactly one way:
identity. Each is named `AT <instance>/<template-id>`, or
`AT <instance>/<template-id>/<row-id>` for a per-row expansion, so nothing
renumbers when an answer, an instance, or a row changes. In every other way
they are ordinary acceptance tests — the same four types, the same closed
test-block field set, the same fenced `test` block followed by readable
text — and they execute under the same runner and evidence duties and count in
§7's checks 5 and 6.

Two rules keep the block coherent.

- **The block is not hand-edited.** A validator recomputes it from the
  instance file and requires byte equality, so editing a generated test is a
  validation failure; you change the answer and regenerate (§10.10).
- **Nothing may point into it.** No reference of any kind — a chapter anchor,
  a `defined_in` pointer, a contract citation (§10.7) — may target a generated
  test or an anchor inside the block. A generated test's existence depends on
  the answers, so change one and the target can legally vanish; a stable name
  is still not a stable target.

A core knows nothing of its adopting package's direction claims, so no
generated test carries `direction_claims`. Covering a `constraints.*` entry
(§9.11) stays the package's own work.

The tests are the executable part of the spec; they are not all of it. Every
Fixed statement binds even when no test restates it (§2). So passing every
acceptance test and matching every `must_match` resolved tuning key is
necessary but never sufficient for the experimental certification protocol.
Build-record conformance is defined by §2d and §7.

## 7. Build records (`opengdd-build.json`)

*For builders and auditors. Designers: skip, you never write this file.*

A conforming build ships `opengdd-build.json` (build-record conformance,
§2d). Where this chapter uses certification vocabulary — "certified",
"certifying spec", "certifying profile" — it uses it in §2d's
intended-shape sense: the record is the artifact the experimental protocol
would audit, and v0.5 defines no normative certification outcome for it. The
file is machine-validated
against [opengdd-build.schema.json](https://opengdd.org/schema/core/v0.5/opengdd-build.schema.json).

### Core fields

The required top-level fields are exactly:

- **`opengdd`**: the format version the build was tested against.
- **`spec`**: the `id` and `version` of the built spec.
- **`designer`** and **`builder`**: each carries a name, with optional
  `handle`, `contact`, and `role`.
- **`personalization`**: an `answers` object that maps question ids to the
  answers used. It is an empty object when there are no answers.
- **`resolved_tuning`**: the §5 resolved snapshot. It contains the complete,
  flat `tunables` map after answer resolution and the package `constants`,
  each carrying the package's contract keys as well —
  `contracts.<instance>.<knob>`, split between the two by the knob's `kind`
  (§10.11). `constants` is an empty object when the package declares none.
- **`evidence`**: the test-run record. Its required fields are:
  - `algorithm`. The only value currently defined is `"sha256"`.
  - `result_hash`.
  - `payload`, with `covers` and `file`. `covers` states in plain words which
    artifacts the hash covers. `file` is a package-relative path to the
    canonical payload bytes covered by the hash.
  - `acceptance`, with `passed` and `total` counts.

Canonicalization follows the conformance certification protocol published at
`conformance/CERTIFICATION.md` in the OpenGDD conformance suite (§2d).
Record conformance checks `evidence` for shape and counts only; `payload.file`
is checked as a package-relative path shape, not for existence.
Reproducing `result_hash` and auditing the payload belong to the experimental
protocol, under which a digest without a reconstructible payload is
unauditable and fails the audit.
`evidence` may also contain build-local checkpoint records, captures, and
transcripts. The core format does not define that additional detail.

### Package-consistency checks

The schema cannot perform every check because some rules depend on the source
package. A conforming validator MUST also verify all of the following:

1. `spec.id` and `spec.version` match the source manifest.
2. The build `designer` matches the source manifest on their common identity
   fields: `name`, plus `handle` and `contact` when each is present in both.
   `role` is build-local and is excluded from matching.
3. Every recorded answer names a declared question and type-checks against
   that question's type; a `choice` answer MUST additionally name a declared
   option id (§5). Defaulted questions are recorded too.
4. The `resolved_tuning.tunables` and `resolved_tuning.constants` keys exactly
   equal the corresponding source key sets, each unioned with the contract
   keys the package declares — `contracts.<instance>.<knob>` for every
   unpruned knob of every instance, landing in one set or the other according
   to that knob's `kind`, and a pruned knob entering neither (§10.11).
   `resolved_tuning.tunables` is
   produced by the §5 resolution pipeline, and every value remains inside its
   declared range. A recorded answer whose resolution reaches an
   `out_of_range: "reject"` operation with a computed value outside the target
   key's range does not resolve, and the record does not conform (§5).
5. `acceptance.total` equals the package's enumerated AT count: its game-local
   acceptance tests, plus its generated ones after liveness and per-row
   expansion (§§6, 10.10).
6. A conforming build has `acceptance.passed == acceptance.total`.

Checks 1–6 are the core set, not the whole set. The direction-result
presence, path, and subset rules of §9.11 are validator-level
package-consistency checks of the same rank, and §2d's build-record
conformance includes them. So is one contract rule: every live
core invariant is re-evaluated over the resolved snapshot, because an override
that is legal for its own key can still break a rule between two knobs that no
per-key range can see (§10.8).
Validators report divergence in checks 1–6 and in the direction-result rules
as errors. A check-6 shortfall is an error against build conformance rather
than a complaint about the file (§2d); it does not conflict with honest
reporting, because the shipped record is a completion claim, and a build
still failing tests reports through §2b ambiguity reports rather than a
build record.

When a commerce split exists, the build manifest includes the manifest's
commerce profile verbatim (including `derived_from` when present). Nothing in
the experimental certification protocol depends on commerce metadata.

### Optional renderer declaration

`opengdd-build.json` MAY include `renderer`: a free-text string naming the
rendering technique the build used, such as `"three.js 0.185.1, WebGL"`.
The renderer is the builder's fact, never the spec's: §3's `platform` names
the state space a design is responsible for, and two builds of one spec may
declare different renderers. The declaration is informative in v0.5: the
`web-1` capture recipe does not read it, and recipe selection stays with
`capture_profile.type`.

### Optional capture profile

`opengdd-build.json` MAY include `capture_profile`. It records the capture
adapter and serving or run recipe that produced the captures:
`{ "id": <string>, "type": <string> }`.

`type` is a closed, versioned enum. v0.5 defines one value: `"web-1"`. It
names the existing headless-browser reference recipe summarized here:

- advance gameplay on a synthetic 60 Hz clock;
- sample full-viewport frames at 12 fps; and
- record the input hash, duration, rates and counts, determinism checks, and
  artifact paths in the capture manifest.

`web-1` is an identifiable, versioned recipe. This field does not define a
new profile or certification path. The §7 acceptance-count and hash-payload
rules apply regardless of the capture profile.

`id` is a build-local label for the concrete adapter invocation, such as a
run identifier or container tag. It does not need to resolve outside the
build. If `capture_profile` is absent, the certifying profile is unrecorded;
the absence does not claim that no profile was used.

Cross-profile equivalence claims and a registry of types beyond `"web-1"`
are outside v0.5; a future adapter earns a new enum value through an
ordinary additive schema change.

### Optional resource disclosure

`opengdd-build.json` MAY include `resources`: the build-resource provenance
disclosed by the builder. It lists kits, third-party assets, and tools that
the build consumed. Each entry has this shape:

`{ "id": <string>, "type": "kit" | "asset" | "tool", "artifact":
<string>, "license": <string>, "hash": "sha256:<64 lowercase hex>",
"source": <string, optional> }`

`artifact` identifies the exact immutable file or archive covered by the
hash. It may be a URL, a registry coordinate such as `name@version`, or a
package-relative path.

In v0.5, `hash` MUST cover exactly one file's bytes. A multi-file kit, source
tree, or tool installation MUST be packaged into one archive, such as a
`.zip`, before hashing. v0.5 defines no directory or tree-hash
canonicalization.

`license` is a free-text declaration. The validator checks that it is present;
it does not verify the declaration's truth. §8a applies the same rule to media
licensing.

`resources` is the builder's disclosed set for this build. Its presence does
not attest that every consumed resource is listed, and its absence records
nothing either way. The list creates no commerce split, and the experimental
certification protocol does not turn on it.

A designer-authored kit reference used as direction under §8a is a mood-
descriptor reference. It is outside this build-resource list. `resources`
records what the builder consumed, the provenance only the builder can
disclose.

### Conditional direction result

`direction_result` carries the §9.11 judged-gate record, and §9.11 owns its
shape and validity rules. It is present exactly when the source spec's
`direction.json` declares at least one judged claim, and MUST be absent
otherwise. The presence rule and §9.11's path and subset rules require a
validator-level cross-check against the source spec: the build record schema
alone cannot express them, and its `directionClaimPath` regex is necessary
but not sufficient.

## 7a. Authored puzzles

*For designers with hand-authored puzzles. The grid encoding applies only to grid games.*

Specs with authored logical puzzles MAY declare them as a §1b structured
collection. These are puzzles authored as content rather than systemic or
generated play. Two tiers are supported:

- **Tier 1 — literal layouts.** Each puzzle is data: a layout, entity
  placements, and a win condition, referenced from the content chapters. The
  puzzle is fully Fixed, and an acceptance test can check it. For example:
  "puzzle 7 requires at least 12 moves."
- **Tier 2 — solution-annotated layouts.** Each puzzle also carries designer
  metadata: intended insight, red herrings, difficulty-curve position, and
  machine-checkable invariants. Those invariants may include minimum solution
  length, required mechanics, and forbidden shortcuts. Checking them needs a
  solver, and v0.5 standardizes no solver adapter, so the citing package
  supplies one (below). The insight is Fixed. Its decoration is Delegated.

### Grid-layout encoding family: `parallel-string-layers-1` (normative)

v0.5 defines one named, buildable member of the still-open grid-encoding
family: the flat, single-cell `parallel-string-layers-1` encoding. Two
independent grid-puzzle instances converged on this layout shape. They did not
converge on a solver-adapter interface or predicate vocabulary, so those parts
remain open below.

A §1b collection declares this encoding by setting `format` to
`parallel-string-layers-1` and adding `layout` to that collection's manifest
declaration. `layout` is the mechanical layer binding:

```json
{
  "id": "puzzles",
  "format": "parallel-string-layers-1",
  "layout": {
    "layers": ["terrain", "entities"],
    "cell_unit": "unicode-scalar-value"
  },
  "defined_in": "03-content.md#puzzle-layout-format",
  "...": "..."
}
```

- **`layers`** is required. It contains one or more unique strings in a
  closed, ordered set. A single-layer grid — one field holding the whole
  board — is the commonest case and declares a one-string list. Each string
  names a collection-record field that carries a grid layer. A validator reads exactly these named fields from
  every collection record, whether the collection is held as items or as a
  catalog.
  No other field is a layer, whatever its shape. A named field that is
  missing or is not a string array is a hard failure. Generic tools discover
  layers from manifest `layout.layers`, not from game prose.
- **`cell_unit`** is required and fixed to `"unicode-scalar-value"`, the only
  value defined in v0.5. A row's column count is its length in Unicode scalar
  values, or code points. UTF-16 code units and grapheme clusters are not the
  measurement. A surrogate-pair emoji is one cell. A combining-mark sequence
  occupies as many cells as it contains scalar values.

Every collection record MUST carry all of `layout.layers` as string-array
fields. Every layer in one collection record MUST be non-empty and congruent
with every other layer in that collection record:

- Row count, the array length, MUST be at least 1.
- Every row's column count, measured by `cell_unit`, MUST be at least 1.
- Row count and every row's column count MUST be identical within each layer
  and across all layers in the collection record.

These rules establish one shared, zero-based `(x, y)` grid per collection
record. The grid is at least 1×1, with no partial or zero-width rows.

A collection record with empty or incongruent layers is a hard failure. A
row-count disagreement, including zero rows, is diagnosed as
`layer-row-mismatch`. A column-count disagreement at a named row, including
zero columns, is diagnosed as `layer-column-mismatch`. Both are existence-level
package checks under §1b's unconditional completeness rule, mirroring §1c
`existence-completeness`. No acceptance test is needed to catch them.

**Single-cell rule (core-fixed).** Each `(x, y)` coordinate holds exactly one cell value
per declared layer: one Unicode scalar value read from that layer's row at
that column. The encoding cannot represent one value spanning several cells
in a layer. Multi-cell entities are outside `parallel-string-layers-1`, even
if a game's own rules express one entity identity across several single-cell
footprints.

The collection's `defined_in` pointer keeps these fields in the game's own
defining section under §1b completeness:

- per-cell glyph vocabulary;
- overlap rules;
- entity footprints;
- terrain semantics; and
- the win predicate.

The core encoding fixes the grid shape and layer set. The collection's
`defined_in` section gives cell values their meaning. This encoding declares
no solver adapter or replay
grammar. Until those are standardized, a citing collection defines its own
command alphabet and predicates under §§6 and 7a.

**The encoding family remains open.** One documented case this encoding
cannot express needs integer per-column heights, region terrain with tile overrides, graph edges
between cells, and persistent multi-cell rigid bodies. It still requires a
game-local extension.

The family widens when an encoding or encoding-family member can express that
shape without a game-local extension and is validated against a third
grid-puzzle package that needs it.

## 8. Identifiers and descriptors

*For designers. Short, and it explains why your own invented names work at all.*

Two rules: **any identifier is yours to coin; only descriptors carry format
semantics.**

One construct sits beside descriptors, and its scope is stated rather than
assumed: an adopted contract (§10). Its envelope — the instance-file shape,
the closed surface, the instantiation grammar — is format machinery, and the
format reads it. A core's *semantics* are not: they bind the builder the way
Fixed prose binds, by declaration, and not because the format adopted the
shape. That is what lets a package adopt a core this document has never seen,
and why the admission bar below governs descriptor families rather than cores.

### Identifiers

An identifier is a designer-defined name in a JSON file or declared
namespace. It is a broader thing than a tuning entry: a tuning key is one
identifier, and so is a field named in a collection's `defined_in` section
and a member of a declared set. An id is one kind of identifier; a key is an
identifier written as a dotted path.

Using an identifier creates it. There is no declaration step and no registry.
A key such as `infection.damage` or `tick.day` becomes an identifier the
moment it is used, whether written directly into `tuning.json` or promoted
there by tooling when an unrecognized name first appears in prose. Custom
fields in collection records and personalization question ids work the same
way.

Identity is scoped: the same spelling in two scopes may name two different
identifiers, and first use defines the identifier in that scope. A field
named in a collection's `defined_in` section is one identifier, no matter how
many records carry that field. Name it once there and you have made one
identifier; the thousand cards that fill it in are one thousand values, not
one thousand identifiers.

This freedom to coin is not in tension with the places where the format says
MUST declare. Those rules are about different objects. §4a's declared
runtime-state bindings, §1b's collections, and §1c's edge sets are structures
the format has to be told about before it can resolve or check anything; the
names inside them are still coined by using them.

The format gives an identifier no meaning beyond key/value binding. It can
validate the value's shape, such as a numeric value, string, or declared-set
membership. Tooling can bind, complete, and snapshot the name. Designer prose
defines what the name means.

### Descriptors

A descriptor is a reserved shape with fields defined by the format. This lets
tools and audits act on the descriptor directly: for example, a palette
can be checked, anti-references can feed judges, and behaviors can become
rubric lines.

A descriptor family is a keyed map whose entry shape and semantics the format
owns. Designer-defined shapes are §1b collections: their collection-record
fields are defined in the collection's `defined_in` section. A
designer-defined shape becomes a descriptor family only when the format
adopts it.

Descriptors are grouped by family under the manifest's `descriptors` field:

```json
{
  "descriptors": {
    "mood": [ { "id": "dark-spell-mood", "...": "..." } ]
  }
}
```

Every descriptor has a kebab-case `id` that is unique within its family in the
package.

`mood` is the first descriptor family, not a special case (§8a). v0.5 defines
no `character`, `cutscene`, `storyboard`, or `space-atmosphere` descriptor
family. Declaring any of those family keys is a validation error.

A future family requires both survey-grade support for a corroborated
professional-practice construct and a working transmission and audit story.
Subjective intuition alone is insufficient. Adding a family requires a format
revision; it is not a package-local extension.

## 8a. The mood descriptor

*For designers. Skip unless you are directing the look and feel by reference.*

`mood` is the first populated descriptor family. One `descriptors.mood`
entry looks like this:

```json
{
  "id": "dark-spell-mood",
  "intent": "a held breath right before something breaks",
  "references": [
    {
      "description": "the throne-room reveal (cite by description, not a licensed title, unless the citation itself is the annotation)",
      "borrows": ["silhouette weight", "value grouping"],
      "media": [
        { "path": "assets/mood/dark-spell-01.png", "license": "CC-BY-4.0",
          "hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000", "format": "png" }
      ]
    }
  ],
  "anti": [
    { "description": "no saturated purple 'magic glow' cliche" }
  ],
  "palette": {
    "threat": {
      "value": "#B3202A", "tolerance": 8,
      "scope": {
        "applies_to": "enemy projectiles and enemy contact surfaces",
        "states": ["in-play"],
        "sampling": "exhaustive"
      }
    }
  },
  "behaviors": [
    { "trigger": "player casts a dark spell",
      "response": "this mood becomes active",
      "timing": { "max_latency_ms": 150 } }
  ],
  "audio": { "status": "draft" }
}
```

- **`intent`** is required. It contains a few sentences of prose stating the
  emotional or creative target. Its audit class is `advisory`: it states
  intent and decides nothing. No entry writes that class down — what the
  field is fixes it (§9.11) — and the validator checks only that `intent` is
  present.
- **`references`** is optional. It uses the §9.3 `annotatedReference` shape
  verbatim. Every entry names the borrowed property; an unannotated reference
  is invalid.
- **`anti`** is required and has `minItems: 1`. A mood descriptor without an
  anti-reference is a hard failure. The required negative space prevents the
  reference from silently defining the whole target.
- **`palette`** is optional. It contains palette roles in the full §9.5
  shape — the required `value`, `tolerance`, and `scope`, and the optional
  `must_match` — scoped to this mood. `must_match: true` is legal only when
  `tolerance` is exactly zero, exactly as in §9.5, and it makes the role a
  certified pin (§9.9).
- **`behaviors`** is optional. It binds game events to this mood becoming
  active or inactive. Each entry contains:
  - `trigger`: a prose-bound game-state condition, under the same
    authority-prose discipline as §9.5 scope prose;
  - `response`: exactly `"this mood becomes active"` or `"this mood becomes
    inactive"`; and
  - optionally, `timing.max_latency_ms`.

  Any other response belongs to a §9 direction-block construct. Mood behavior
  is not a general event-response language.

### Palette roles in a mood (normative)

A mood palette role can be cited by an acceptance test. Its canonical
citation path is `descriptors.mood.<mood-id>.palette.<role>`, where
`<mood-id>` is the descriptor's own `id` and `<role>` is the role key. A test
block names that path in `direction_claims` exactly as it names a
`constraints.palette.<key>` entry (§6). The path MUST resolve to a declared
descriptor and one of its declared roles; a dangling citation is a hard
failure, as it is for every other claim.

Citing changes what the role is worth. An uncited role is `judged`, read by
the panel as part of the mood it belongs to (§9.2). A cited role is an
observational `checked` claim, verified by the test that cites it at the
tolerance the role declares (§9.11).

Nothing requires a role to be cited. The completeness that makes every
`constraints.*` entry find an acceptance test does not extend here (§6): a
designer cites the colors worth checking, and leaves the rest to be read as
direction. That is the point of putting a palette inside a mood.

### Prose citations (normative)

A mood descriptor is referenced from Fixed or Delegated chapter prose anywhere
in the package by the exact inline code token
`` `descriptor:mood:<id>` ``. A descriptor reference in prose always carries
this family-qualified `descriptor:<family>:<id>` form. Prose citation is not
one uniform spelling across the format: a tuning key is cited bare under §4's
classification rule, while `state:` and `content:` (§4a) keep their prefixes.

`<id>` MUST name a declared `descriptors.mood` entry. A token without a
matching descriptor is a dangling reference and a hard failure. A bare mood
name without the `descriptor:mood:` prefix is ordinary prose and binds
nothing.

The §9.2 direction block uses the same token in the `descriptor` field of
each keyed `mood` entry. Each entry has the shape `{ descriptor, viewing }`.

### Reference semantics (normative)

A reference in a mood descriptor or §9.3 direction block binds only the
properties explicitly named by its `borrows` annotation. A property can be a
quality such as "silhouette weight" or "value grouping"; it is not a claim to
reproduce the source's literal pixels.

Copying visual content that the reference does not annotate is a conformance
failure, not stronger compliance. All unannotated content, including the
source's exact appearance, remains open.

Only pinned assets at the §9.9 **exact** precision level bind exactly. When
exact pixels are required, use an exact, pinned asset reference outside this
construct, not an annotated reference.

### Media packaging (normative)

Every media file attached to a reference or anti-reference here or in §9 MUST:

- be a package-relative path resolving inside the package (§1's
  normalization rule);
- carry a per-file `license` declaration: a non-empty string naming the
  license or terms. The validator checks its presence, not its truth. A
  missing declaration is a hard failure; a false one is the designer's
  responsibility, not the format's;
- carry a hash pin in the form `"sha256:<64 lowercase hex>"` over the exact
  file bytes;
- declare one of the closed format allowlist values: `png`, `jpg`, `jpeg`, or
  `webp`. These are the only media formats v0.5 defines; audio direction
  remains excluded in v0.5 (§11).

v0.5 defines no numeric media-size conformance limit. Validators MUST NOT
invent one. Package authors MUST NOT rely on unbounded file sizes; this is
authoring guidance, not a numeric validation threshold.

The validator MUST verify that the file's leading byte signature matches its
declared format; full decoding is not required. It cannot trust the `format`
string alone. A renamed or
misdeclared file fails even when its extension and `format` field agree.

A file outside the format allowlist, whose leading byte signature does not
match its declared format, or without a license declaration is a hard
failure. This
is the direction block's media rule too (§9.3), stated once here since
both constructs share the reference shape.

## 9. The art-direction block

*For designers. The whole chapter is optional; skip it if presentation prose is enough for your spec.*

The direction block is optional. It is a fenced `direction` section at the
start of `04-presentation.md`, just as the §1a fantasy block starts
`01-overview.md`. Both filenames are normative (§1), so the fence is read from
`04-presentation.md` and nowhere else. The machine half of the direction is `direction.json`,
declared by `manifest.json.build.direction` (§3). Providing the prose block
without `direction.json`, or `direction.json` without the prose block, is a
validation error.

The fantasy block remains required and is the tie-breaker. A direction block
refines the fantasy block and MUST NOT contradict it. When no direction block
is present, the existing presentation prose remains sufficient.

Citation convention for this chapter: prose refers to a `direction.json`
entry by its dotted path (`viewing.<key>`, `references.<key>`, `constraints.palette.<key>`).
A JSON field that names such an entry always holds the bare `<key>` alone —
`"viewing": "dusk-panel"`, never `"viewing": "viewing.dusk-panel"`.

**Design principles (normative).**

1. **Constrain, and leave open.** Every construct states both what it
   constrains and what remains open to interpretation. A construct that
   leaves nothing open is a pinned value at the §9.9 **exact** precision
   level, not Delegated content.
2. **No new authority level.** The entire block uses the existing Delegated
   authority level (§2): the builder decides, while the specification states
   intent and constraints in an auditable structure. This creates no exception
   to the ordinary untagged default; the fence explicitly opens with
   `> DELEGATED: presentation-direction`.
3. **Audit classes belong to individual claims.** The available classes are
   `checked` for mechanical verification, `judged` for panel verification,
   and `advisory` for stated intent without a conformance consequence. The
   block itself has no audit class. A claim's kind fixes its class; no entry
   writes one down, and claiming a class stronger than the entry kind allows
   is a validation failure. The one claim that moves is the §8a mood palette
   role: an acceptance test's citation carries it from `judged` to `checked`.
4. **Anti-references have primacy.** Negative direction is what holds a build
   back from drifting into its own references, and from settling into the
   genre's defaults. The §1a fantasy
   block's anti-references generalize into this block; they are not replaced.
5. **Core constructs exclude implementation vocabulary.** Direction states
   player-observable targets. Renderer channels, rig names, LUT files, and
   framework tokens MUST NOT appear in core constructs. Color spaces and
   measurement metrics must be observable-referenced and versioned.

### 9.1 Pillars (`pillars`)

*For designers. The two-to-four priorities every look-and-feel call answers to.*

`pillars` defines two to four named priorities that every presentation
decision should reinforce. It is a closed object containing two to four
entries, keyed by stable kebab-case ids. A key is cited as
`pillars.<key>`, such as `pillars.readability-first`.

Each entry contains:

- `statement`: required, exactly one sentence;
- `viewing`: required, naming one `viewing.<key>`;
- `tie_break_order`: optional, a positive integer; and
- `references`: optional, naming one or more `references.<key>` ids.

Every pillar is `judged`, unconditionally; the entry does not say so, because
the entry kind fixes it. A pillar is never `checked`, because no mechanical
test can determine whether a choice advanced a priority. It is never
`advisory`, because a panel always scores it. The required `viewing` field
identifies the evaluation context for that score. The optional `references`
field supplies the §9.3 claim-to-reference edge.

`tie_break_order` says which pillar prevails when two of them pull against
each other: the lower value wins. Equal values, or a pillar that declares
none, leave the tie to the panel, reading the entries' own statements under
their bound viewing context. It is §2a's tie-break discipline applied to
pillars.

Pillars leave every asset-level choice open. Under the named viewing
context, the panel scores whether the build's choices advance them.

### 9.2 Mood (`mood`)

*For designers. How a mood descriptor gets attached to this game's direction.*

`mood` constrains the intended emotional neighborhood by reference. It is a
closed object containing one or more entries, keyed by stable local kebab-case
ids and cited as `mood.<key>`. The local key need not equal the referenced
descriptor's id.

Each entry contains:

- `descriptor`: required, one `descriptor:mood:<id>` token under the §8a
  citation grammar;
- `viewing`: required, naming one `viewing.<key>`; and
- `references`: optional, naming one or more top-level
  `references.<key>` ids. This pool is separate from the descriptor's own
  §8a `references`.

The `descriptor` token MUST resolve to a declared `descriptors.mood` entry. A
dangling token is a hard failure. The direction block does not inline mood
anchors. Instead, it wraps a reusable descriptor with the evaluation context
specific to this block. Every mood entry is `judged`, unconditionally. The same descriptor token can also
be used in prose and in other moods' `behaviors` triggers.

The referenced descriptor's mandatory `anti` field alone establishes the
`judged` class. No other descriptor field is a precondition. Descriptor
`references` are optional supplementary grounds for the panel; their
presence never changes the class. The required `viewing` field identifies
the context in which the panel scores the mood citation.

The entry leaves open the observable means, degree, and local reading that the
descriptor's `intent`, `references`, `anti`, and `palette` do not already pin.

### 9.3 References (`references`)

*For designers. Read it before you cite anyone else's work.*

`references` defines general presentation references at the direction-block
level, rather than references scoped to one mood. When present, it is a closed
object containing one or more entries, keyed by stable kebab-case ids and
cited as `references.<key>`.

Each entry uses the shared §8a `annotatedReference` shape:

- `description`: required;
- `borrows`: required, with at least one specifically named property, such as
  "silhouette weight" or "value grouping"; `"the whole image"` is not a
  valid property; and
- `media`: optional, under the §8a media-packaging rule.

A missing or empty `borrows` field is structurally invalid, not `advisory`.
Every unnamed property and the synthesis remain open; copying a reference is
a conformance failure under §8a. A reference carries no audit class of its
own. Its annotation is a structural consequence of schema validity.

#### Claim-to-reference edges (normative)

Property-transfer fidelity is assessed only while scoring the `judged` claim
that cites a reference. The association is explicit: `pillars.*`, `mood.*`,
`anti.*`, and `must_keep.*` entries can each carry an optional
`references` field naming one or more `references.<key>` ids (§§9.1, 9.2,
9.4, and 9.7). A dangling id is a hard failure.

The §8a reference pool attached to a mood descriptor is separate from
`direction.json`'s top-level `references` collection.

Completeness applies in both directions. Every declared top-level
`references.<key>` entry MUST be cited by at least one judged claim's
`references` field. An uncited entry is an orphaned reference and a hard
failure.

#### Cultural-source trigger

This trigger depends on the borrowed property, not the source's medium or
whether its presentation is fictional. An annotated borrow that depicts or
derives from a real place, people, culture, or living tradition MUST cite
specific annotated sources.

Every judged claim that cites such a reference, either directly through its
own `references` field or through a mood descriptor's separate §8a reference
pool, MUST bind through its required `viewing` field to a `viewing.<key>`
whose `judge_qualifications` names the expertise the judge needs (§9.6). A
borrow of a purely invented property creates no such obligation.

Whether a borrow reaches a real place, people, culture, or living tradition is
human judgment. No field records it, and no validator decides it. Both MUSTs
above are prose obligations under §2d: they bind the package with full force,
and the designer discharges them. What a machine sees is the annotation — that
every cited reference is declared and carries its `borrows` list, and that
every judged claim binds a declared `viewing` entry — and that is where the
citation cross-check stops. A viewing entry left without
`judge_qualifications` is a design-review finding, never a validation failure.

### 9.4 Anti-references (`anti`)

*For designers. Short, and the highest-value part of the chapter.*

`anti` constrains what the presentation is not: forbidden elements, palettes,
resemblance targets, and clichés. If your genre has an obvious default look,
say so, and rule it out by name.

When present, `anti` is a closed object containing one or more entries, keyed
by stable kebab-case ids and cited as `anti.<key>`. Each entry contains:

- `description`: required;
- `observable`: optional. When present, it contains a required, non-empty
  `criteria` string describing the mechanical test;
- `viewing`: required, naming one `viewing.<key>`; and
- `references`: optional, naming one or more `references.<key>` ids through
  the §9.3 claim-to-reference edge.

Anti-references leave the replacement open unless positive constructs supply
it. On their own they say what to avoid, and never what to move toward.

Every anti-reference is `judged`, unconditionally. `observable` is legal
panel-facing documentation of what a mechanical test would check, but v0.5
defines no execution route for it. It never changes or elevates the audit
class. Promoting it requires a future revision. The required `viewing` field
names the context in which the panel scores the entry.

The §8a media-packaging rule also applies here. An anti-reference MAY attach
`media`, such as a labeled "not this" board.

### 9.5 Constraint core (`constraints`)

*For designers who need an exact color, contrast, or timing — and for the tool authors who check them.*

The constraint core is the mechanically checkable floor: the part of the
direction a machine can check by measurement. Runtime numeric authority
remains in `tuning.json` under §4; `direction.json` never restates a runtime
number.

`constraints` is itself a closed object: it contains at least one of
`palette`, `thresholds`, or `timing`, and no other field is legal. Each
present field is in turn a closed object containing one or more entries,
keyed by stable kebab-case ids.

#### Palette roles (`palette`)

A palette role, such as `palette.threat`, is a closed object (no field
beyond these four is legal) containing:

- `value`: required, an 8-bit sRGB hexadecimal color written as `#` plus
  exactly six hex digits (`#RRGGBB`, either case; three-digit shorthand is
  invalid);
- `tolerance`: required, a number greater than or equal to zero;
- `scope`: required, using the shared shape below; and
- `must_match`: an optional Boolean.

`tolerance` is a CIEDE2000 (ΔE00) radius around `value`, computed in CIELAB
D65 after sRGB decoding. `tolerance: 0` makes the constraint exact.
`must_match: true` is legal only when `tolerance` is exactly zero; otherwise
`must_match` is absent or `false`. The schema enforces this implication.
Writing `must_match: true` on an exact constraint is what turns it into a
**certified pin** — the experimental certification protocol's name for a pin
whose value that protocol would audit (§9.9). Nothing else does, and the
acceptance test that covers the claim is what verifies it (§9.9).

A palette entry constrains values, role assignment, and where they hold. It
leaves distribution and harmony open for judgment through pillars and mood.

#### Perceptual thresholds (`thresholds`)

A threshold, such as `thresholds.actor-vs-background`, is a closed object
(exactly these six fields) containing:

- `roles`: required, always an array, holding one or more bare
  palette-role keys (`["threat"]`, never `"threat"` alone or
  `"palette.threat"`); each MUST resolve to a declared `palette` entry;
- `against`: required, one bare palette-role key under the same rule;
- `min_contrast`: required, a number greater than zero;
- `metric`: required, a string that MUST appear in `semantics.metrics`
  (`semantics` sits at the direction file's root, not inside `constraints`; it is
  defined at the end of this section);
- `viewing`: required, holding the bare key of one `viewing` entry (the
  field value is `"dusk-panel"`, never `"viewing.dusk-panel"`); and
- `scope`: required.

A threshold constrains measurable separation and leaves form open.

#### Timing constraints (`timing`)

Timing entries cover exact runtime values. An entry such as
`timing.dash-recovery` contains only a required `key` in the §4a
`tuning:<dotted-key>` form and a required `scope`.

The numeric parameter MUST live in `tuning.json`, where the designer owns it.
The direction file does not repeat the number. The verified proposition is
that rendered event timing matches the resolved tuning value over the declared
domain. v0.5 defines no universal numeric window for "matches"; the covering
acceptance test's §6 procedure states how the match is checked, and that
procedure is what the experimental certification protocol would audit.

No constraint entry may carry an audit class of its own — the closed shapes
above exclude one, so writing one fails validation. Every palette, threshold, and
timing entry has the fixed audit class observational `checked` (§9.11); none
has a `judged` or `advisory` reading.

#### Scope (normative)

Every constraint-core claim has a `scope`; this shape does not apply to
`viewing` entries. The scope owns the claim's applicability domain and proof
obligation:

- `applies_to`: required, non-empty prose identifying the player-visible
  instances that carry the role;
- `states`: required, with at least one named game state in which the claim
  holds. Each state is a non-empty free-form string; v0.5 declares no
  package-level state registry for these names to resolve against, so a
  validator MUST NOT reject a name for failing to resolve. The
  replay-reach rule below is delegated to the covering acceptance test's
  own §6 procedure, not decided by machine-matching state strings; and
- `sampling`: required, either `"exhaustive"` or a sampled **verdict** rule.

Put *what* in `applies_to` and *when* in `states`; do not repeat a state
inside `applies_to`.

For `"exhaustive"`, the covering acceptance test MUST observe every member of
everything the claim applies to. A sample cannot satisfy the claim.

A sampled verdict is written as a nested object:
`"sampling": { "sampled": { "verdict": ... } }` — the `sampled` wrapper is a
real JSON field, not a prose label. Both wrappers are closed: `sampling`'s
object form admits only `sampled`, and `sampled` admits only `verdict` (a
field such as a sample count is illegal).

The verdict rule takes one of two forms. The first is the string
`"per-sample"`. The second is an object whose single field is the key
`aggregate` — `"verdict": { "aggregate": { ... } }`. That `aggregate` object
is closed, as is its `threshold` object, and it contains:

- `aggregation`: exactly one of `"count"`, `"rate"`, `"min"`, `"max"`, or
  `"mean"`;
- `metric`: a string; and
- `threshold`: an object with `op`, exactly one of `"eq"`, `"lt"`, `"lte"`,
  `"gt"`, or `"gte"`, and a numeric `value`.

Aggregate fields are authored once in `direction.json` and never restated by
the test block, following §6's per-sample and aggregate discipline.

The covering replay MUST reach every state named by `scope.states`. It MUST
NOT narrow what the claim applies to, the states, or the proof obligation.
The package validator cannot decide replay reach (above), so this obligation
is delegated to the covering acceptance test's §6 procedure; nothing else in
v0.5 checks it. A narrower replay, or a sampled result presented as
exhaustive proof, does not discharge it. The acceptance test cites the
`direction.json` key, such as `constraints.palette.<key>`, and MUST NOT
restate its value.

#### Self-describing semantics (normative)

`semantics` is required when the file declares `constraints`, and so
whenever it declares any `thresholds`. The schema's if/then owns that
implication. A direction file carrying only judged claims measures nothing and
needs none; declaring `semantics` there anyway is permitted, and reads as a
declared-but-unused registry. When present, the field sits at
`direction.json`'s root, as a sibling of `constraints` and `viewing` — not
inside `constraints`. It defines measurement semantics:

- `tolerance`: required, a single string holding one versioned
  tolerance-math id (not an array). v0.5 defines `"ciede2000-lab-d65-v1"`;
  and
- `metrics`: required, an array with at least one versioned metric id.
  v0.5 defines `"wcag21-contrast-ratio"`.

The registry is closed: v0.5 recognizes no other ids, and an unrecognized
id in `semantics.tolerance` or `semantics.metrics` fails schema validation.
Separately from that closed registry, one cross-check applies: every
`thresholds.*.metric` value MUST appear in `semantics.metrics`. The
`aggregate.metric` inside a `sampling` verdict rule is subject to neither
rule — that field remains a free-form string naming the sampled measurement.

#### Designer-side consistency (normative)

Package validation MUST compute each threshold at the declared value of each
operand role, and confirm that the direction file's own authored values pass
it. A direction file that breaks its own threshold is a hard failure.

### 9.6 Evaluation context (`viewing`)

*For designers: you write one viewing context, then cite it everywhere. Auditors judge under it.*

`viewing` defines the inputs that stabilize panel evaluation. When present,
it is a closed object containing one or more entries, keyed by stable
kebab-case ids. Prose in this specification cites an entry as
`viewing.<key>`; a claim's `viewing` field holds only the bare
`<key>`.

Each entry contains:

- `speed_and_size`: required, non-empty prose stating representative scale
  and speed;
- `sequence_context`: optional prose. A designer SHOULD include it when an
  arc matters to a claim that cites this entry; v0.5 defines no machine
  check for that condition, so its absence is a design-review finding,
  never a validation failure;
- `calibration`: required, non-empty prose stating calibration assumptions;
- `hide_builder_name`: a required Boolean; and
- `judge_qualifications`: an optional array of strings. It becomes required
  and non-empty when a citing claim triggers the §9.3 cultural-source rule.
  That condition is human judgment, not a machine check (§9.3).

The entry leaves the judgment and panel protocol open. It has no audit class
of its own; presence and completeness are structural consequences of schema
validity.

#### Claim-to-viewing edges (normative)

Every claim kind that can be `judged`, meaning `pillars.*`, `mood.*`,
`anti.*`, and `must_keep.*`, has a required `viewing` field
naming exactly one `viewing.<key>` (§§9.1, 9.2, 9.4, and 9.7). A
threshold has the same field for the separate purpose of defining its
contrast-measurement condition (§9.5).

A dangling `viewing` reference is a hard failure. There is no default and no
fallback to the sole declared entry. Every judged claim names its context
explicitly, even when all claims share one entry.

### 9.7 What must stay, what may vary (`must_keep`, `may_vary`)

*For designers. What a build must preserve, and where it is free to differ.*

`must_keep` constrains the recognition-critical features a build MUST
preserve. Examples include a silhouette rule, a role-color meaning, or a
motif. The collection is a closed object keyed by stable kebab-case ids. A
key is cited as `must_keep.<key>`. When present, the `must_keep` collection
contains one or more entries.

Each entry is also closed. No field beyond the following five is legal:

- `statement`: required;
- `may_vary`: required, an array with at least one named axis where
  interpretation is expected;
- `observable`: optional, using the closed §9.4 shape. It contains only the
  required, non-empty `criteria` string;
- `viewing`: required, naming one viewing entry by its bare key, such as
  `"viewing": "dusk-panel"`; and
- `references`: optional, naming one or more reference entries by their bare
  keys, such as `"references": ["wet-study"]`. This is the §9.3
  claim-to-reference edge.

`statement` is a non-empty string. Every `may_vary` element is a non-empty
string. The ids in a `references` list are unique.

An entry leaves everything inside its declared axes open. An empty or missing
`may_vary` field leaves nothing open, and fails block validation. The schema
enforces this structurally with `minItems: 1`.

`observable` follows the same rule as the §9.4 anti-references. Every
`must_keep` entry is `judged`, unconditionally. The optional `observable`
field is panel-facing documentation and never elevates the class. The
required `viewing` field names the context in which the panel scores the
entry.

### 9.9 Authority, precision, and boundary rules

*For designers. It says how precise you may get, and what each level costs you.*

**Authority.** The direction block has Delegated authority, as design
principle 2 states: the builder decides how to realize it within the stated
intent and constraints. An `advisory` claim is Delegated intent. It guides
interpretation and tie-breaks in the same way as fantasy-block prose and
carries no conformance constraint.

If a direction claim conflicts with a Fixed statement elsewhere in
`04-presentation.md`, the Fixed statement wins. The conflict is an authoring
error. v0.5 does not permit `> PERSONALIZATION:` tags inside the direction
fence. Personalized direction is a recorded KNOWN-LIMITATIONS item.

**Precision levels.** Anything a player can see may be written down at one
of three precisions:

- **described** — plain prose direction. This is the default, and most of a
  direction block stays here. It carries no measurement.
- **bounded** — a constraint with a stated tolerance, such as a palette role
  with `tolerance: 8`. Its obligation is the observational `checked` claim
  §9.5 defines, discharged by its covering acceptance test.
- **exact** — a palette constraint written with `tolerance: 0`. Every
  builder must reproduce the declared value exactly.

Every visible thing may be **described**; that level is always available.
**Bounded** and **exact** are defined today for palette entries, and the
ladder of three levels is the pattern future areas adopt as their own
mechanisms arrive. A designer may move a claim to a more precise level
wherever the level is defined. Each level up carries the obligation listed
with it; nothing forces a claim to move.

A **certified pin** is an exact palette constraint that also declares
`must_match: true`. The name is the experimental certification
protocol's (§2d): a certified pin is a pin whose value that protocol would
audit. When `must_match` is absent or `false`, an exact constraint stays
outside that audit. A pinned area should have been tested by the designer
against a build. That is an authoring obligation carried by the designer, and
discharged in the spec's own revision history; the §2b lifecycle stages
advance only as far as the experimental protocol does, and v0.5 defines no
per-build machine check for it.

The optional `must_match` field belongs to the closed palette-role object
defined in §9.5, wherever that object appears: in
`constraints.palette.<key>` and in a §8a mood descriptor's `palette`. §4's
`tuning.json` `meta.must_match` carries the same idea for a tuning key: the
build must reproduce the declared value exactly. `must_match: true` is legal
only when `tolerance` is exactly zero, and `direction.schema.json` and
`manifest.schema.json` each enforce that implication for the palette roles
they hold. A bounded palette constraint therefore cannot be a certified pin.

In v0.5, a certified pin is available to direction-constraint palette entries
and to the mood-descriptor palette roles of §8a, which take the same closed
shape and the same `must_match` implication. A mood role is audited through
the acceptance test that cites it (§6); an uncited role is judged with its
mood (§8a).

**How each area is proved:**

- A `must_match` tuning key is proved by comparing runtime consumption with
  the resolved snapshot (§4).
- Fixed prose and structured content are proved by acceptance tests, and by
  the experimental protocol's intended audit of Fixed statements.
- A certified palette pin is verified through the acceptance test that
  cites its claim in `direction_claims` (§6): the captured value is checked
  against the declared value at ΔE00 = 0.

An area with no existing proof mechanism is recorded as a
KNOWN-LIMITATIONS item. The format promises nothing about auditing that
area.

Everything left at the **described** level is interpretation space where two
faithful builds may differ.

**Soft boundary, hard mechanism.** No rule limits how precise a spec may
get. The only hard boundaries are that pinned values bind absolutely and that
nothing left open may contradict the specification.

### 9.10 The direction file: `direction.json`

*For tool authors. Designers: your editor writes this file for you.*

`direction.json` is a single optional JSON file. Its package-relative path is
declared by the bare `direction` field inside the `build` object in
`manifest.json`, as in `"build": { "direction": "direction.json" }`. The
file is machine-validated against
[direction.schema.json](https://opengdd.org/schema/core/v0.5/direction.schema.json).

The schema is the authoritative and exhaustive statement of the file's
legal shape: every field name, entry shape, closed-object rule, and value
constraint lives there and is not restated in this document. The cross-field
resolution rules and semantic requirements in §§9.1–9.7 apply on top of
schema validity.

A declared `direction.json` MUST carry at least one field. An empty object
constrains nothing and gives the panel nothing to read, and the schema rejects
it: a package with no direction to state leaves the file and its fence out
together (§9).

Prose cites `direction.json` entries by dotted path, such as
`pillars.readability-first`, `mood.the-fear`, or
`constraints.palette.threat`. Array positions cannot be citation targets.

**Fence grammar (normative).** The chapter's `direction` fence is a
line-oriented plain-text block, following the fantasy block convention in
§1a.

1. Line 1 is exactly `> DELEGATED: presentation-direction`.
2. When at least one section block follows, line 2 is exactly one blank
   line: the mandatory separator between the header and the first block. A
   header-only fence needs no line 2.
3. Any remaining content consists of one or more **section blocks**. Exactly
   one blank line separates adjacent section blocks. No blank line follows
   the last block.
4. A section block opens with one legal uppercase label for a populated
   top-level `direction.json` field. It then contains one or more **entry blocks**,
   with no blank line between them.
5. The judged-claim labels are `PILLARS:`, `MOOD:`, `ANTI:`, and
   `MUST-KEEP:`. The per-entry completeness rule below applies to them.
6. The commentary-only labels are `REFERENCES:`, `VIEWING:`, and
   `CONSTRAINTS:`. They are legal and optional. They carry no completeness
   obligation. Their citation lines must resolve, but a commentary section
   may omit declared entries or cite the same entry more than once.
7. An entry block begins with one **citation line**. The line contains a
   leading `- ` followed by the entry's exact dotted-path citation in inline
   code, with nothing else on that line.
8. A citation line may be followed by one or more **continuation lines**.
   Each continuation line is indented by exactly two spaces and contains free
   rationale prose. The continuation ends at the next citation line, label
   line, or blank line. Rationale is optional: an entry MAY have zero
   continuation lines. When present, rationale MUST NOT restate a
   `direction.json` value under §9.5's single-source rule.
9. A constraint citation uses a three-part dotted path:
   `constraints.palette.<key>`, `constraints.thresholds.<key>`, or
   `constraints.timing.<key>`.

Example:

```direction
> DELEGATED: presentation-direction

PILLARS:
- `pillars.readability-first`
  readability before spectacle, always.

MOOD:
- `mood.the-fear`

ANTI:
- `anti.no-neon`
  avoid the genre's saturated purple "magic glow" shorthand for dark magic.
```

**Chapter/file ownership rule (normative).** `direction.json` holds every
machine-checkable fact, including value and scope. The chapter fence
may add rationale. For judged-claim collections, completeness is checked in
both directions for each keyed entry:

- Every citation line in the fence MUST resolve to a declared
  `direction.json` entry of the matching kind. A dangling citation is a hard failure in both
  judged-claim and commentary-only sections.
- Every keyed entry in `pillars`, `mood`, `anti`, and `must_keep` MUST
  have exactly one corresponding citation line in the fence.
  Zero citations or more than one citation is a hard failure.
- When a judged claim cites a reference entry, it uses its optional
  `references` field. Every judged claim cites a viewing entry through its
  required `viewing` field. A threshold also cites its viewing context
  through its required `viewing` field.
  Those JSON values use bare keys, not dotted paths: for example,
  `"references": ["wet-study"]` and `"viewing": "dusk-panel"`.
  `REFERENCES:` and `VIEWING:` fence sections remain optional commentary and
  carry no completeness obligation.
- Acceptance-test blocks cite `constraints.*` entries through their
  `direction_claims` fields (§6). Constraint entries have the fixed
  observational class `checked` and carry no fence-completeness obligation.
  A `CONSTRAINTS:` fence section remains optional commentary.

### 9.11 Audit hooks and the certification gate

*For auditors and tool authors. Designers: one rule reaches you — every constraint needs a covering acceptance test (§6).*

The `checked` audit class means that a machine or a replay verifies the
claim. v0.5 has two disjoint kinds of `checked` coverage:

- **Structural facts.** These are facts inherent in `direction.json`
  validating against its schema, together with §9.10's per-entry fence
  completeness. They include reference, viewing, and may-vary-axis
  completeness, and `direction.json`, scope, and key validity. The validator
  or a `document-check` test verifies these package facts without running the
  game. They require no capture.
- **Observational `checked` claims.** These are the `constraints.palette.*`,
  `constraints.thresholds.*`, and `constraints.timing.*` entries, together
  with any §8a mood palette role that an acceptance test cites at
  `descriptors.mood.<mood-id>.palette.<role>`. Their closed JSON shapes carry
  no audit-class field. A `constraints.*` entry's kind fixes its class. A mood
  palette role is the one construct whose class turns on something outside its
  own shape: cited, it is observational `checked`; uncited, it is `judged`
  with its mood (§8a). Neither is written down.

Every `constraints.*` claim is covered by an acceptance test that cites it in
`direction_claims`. §6 owns that rule and states it once; a claim no test
cites is a validation failure there. A mood palette role omitted from every
`direction_claims` array is not: it is judged instead (§8a).

What a validator decides is the citation's presence. The cited forms are
`constraints.palette.<key>`, `constraints.thresholds.<key>`,
`constraints.timing.<key>`, and `descriptors.mood.<mood-id>.palette.<role>`;
these are full dotted paths rather than bare
keys. In every form, `<key>`, `<mood-id>`, and `<role>` match
`^[a-z0-9]+(-[a-z0-9]+)*$`. Whether the citing test's procedure captures the
claim over the domain `direction.json` declares — reaching every state named
in its `scope.states` — is not decidable from package bytes. That remainder is
an obligation of the experimental certification protocol (§2d): the §6
procedure is what reaches those states, and the protocol is what audits that
it did (§9.5).

Judged claims require no capture. A panel scores each directly
against the finished build under the claim's bound `viewing` context.

**The judged gate.** The complete v0.5 set of `judged` claim paths is
`pillars.*`, `mood.*`, `anti.*`, and `must_keep.*` (§§9.1, 9.2, 9.4, and
9.7). An assessment considers every attempted claim under its
bound `viewing` context (§9.6). v0.5 records assessment coverage and results,
but does not standardize panel composition, scoring, or an overall adherence
finding. The gate belongs to the experimental certification path (§2d): it
defines no pass/fail outcome in v0.5, empty `assessed` and `adherent` arrays
are the legal record of a run with no assessment, and no v0.5 conformance or
certification outcome turns on the gate's contents beyond the validity rules
stated here.

`direction_result` is the build's JSON record for this gate. It is a closed
object in `opengdd-build.json`. Its only legal field name is `judged`.

The `direction_result` object is present exactly when the source spec's
`direction.json` declares at least one judged claim. It MUST be absent
otherwise.

- **`judged`.** This field is required. It is a closed object with exactly
  three required fields: `status`, `assessed`, and `adherent`.
  `status` is the string `"pending"`, the sole value defined in v0.5. No
  certificate can assert that the build followed the direction as a whole
  while the panel protocol remains unintegrated. `assessed` is an array of
  the judged claim paths attempted in this run. `adherent` is an array
  containing the assessed paths judged adherent. Each array contains unique
  dotted-path strings. The schema permits either array to be empty. Every path
  resolves to a declared claim in one of the four judged families above; a
  dangling path is a validation failure. `adherent` is a subset of `assessed`.
  A path found only in `adherent` is a validation failure. These arrays report
  claim coverage and adherence as separate facts.

The `direction_result` requirement covers only §9 visual-direction claims.

**`advisory` claims** carry no conformance or audit consequence. No entry
ever writes its own audit class down: what a construct is fixes its class, so
`advisory` is assigned, never authored. Every defined judged claim kind has
the fixed class `judged`, and every checked claim kind has the fixed
observational class `checked`, the §8a mood palette role being the single
construct whose class turns on being cited; the one construct whose fixed
class is `advisory` is the §8a mood descriptor's `intent`, which states intent
and decides nothing. The three class names are this document's vocabulary,
not a field: no schema declares an enum for them, because no file ever carries
one. `advisory` keeps its place in that vocabulary for the constructs that
will need it, and the validator's only job around the classes is to see that
nothing is treated as more strongly verified than its own kind supports.

## 10. Contracts

*For designers: §10.1, then §10.6 when you fill a surface in, §10.7 if your core asks for a list, and §10.12 before you adopt one into a spec that already has numbers. For core authors and tool authors: the rest is the envelope, the instantiation grammar, and the checks.*

### 10.1 What a contract is

Prose carries the design. Structured data makes selected claims checkable.
Between them sits a third kind of material: **convention** — the mechanics
every designer knows, nobody wants to re-derive, and almost every spec
under-specifies. Does overheal clamp? Does a failed craft consume its inputs?
Can two simultaneous killing blows both fire the death event? Each unanswered
question is a place where two faithful builds of one spec come out different,
which is the thing this format exists to prevent.

A **contract** is a mechanism written down once, under a name and a version,
with every question it forces already listed and no room to add another. A
spec declares one instead of describing it. It has two halves.

- The **core** asks the questions. It is a machine-readable document: what the
  mechanism is, which decisions it forces, what each legal answer means,
  which numbers parameterize it, and the acceptance tests that prove a build
  answered the way this spec says. A core is authored once and travels; a
  package carries its own copy of the one it adopts.
- The **surface** records this game's answers. One option per question, one
  value per number, and the test inputs the core's tests ask this game to
  supply.

You adopt a core, you answer its surface, and the build plan grows the
acceptance tests your answers imply (§10.10). Nothing is guessed and nothing
may be skipped: every question that is live after your other answers MUST be
answered, and `not-applicable`, where the core offers it, is an answer rather
than a silence (§10.8).

The word **contract** in this document means this construct and nothing else.
A collection's pointer to its defining section is `defined_in` (§1b), and what
the manifest names for the builder are entry points (§3); neither is called a
contract.

Adopting one means copying a core into `contracts/<name>.json` unchanged and
writing the surface underneath — answers, knob values, test inputs, and any
declared rows (§§10.2, 10.6, 10.7).

*Non-normative, and the reason a contract stays small.* A contract is as big
as one thing an experienced designer would call "standard X", and no bigger.
Four questions decide a candidate: a mechanism rather than a value or a piece
of content; described near-identically by two unrelated designers, except for
parameters; acceptance tests meaningful without knowing the rest of the game;
one seam wide, rather than a genre bundled up. What fails them is written as
prose, not adopted as a contract. No validator decides any of this; the
format owns the envelope, never the content (§10.13).

### 10.2 The `contracts/` directory

A package MAY carry a `contracts/` directory at the package root. Each file in
it is one **contract instance**:

```text
contracts/
  hull.json      # instance "hull"   of core health-1
  shield.json    # instance "shield" of core health-1
  crafting.json  # instance "crafting" of core recipe-resolution-1
```

The directory containing at least one instance file is what activates this
section. There is no manifest field declaring it (§3): dropping the file in
*is* the declaration, so there is nothing to register and nothing that can
contradict what the folder holds.

From this revision on, `contracts` is a **reserved directory name** at the
package root. The reservation is what makes declaration-by-presence safe, and
five rules carry it:

1. The name is exactly lowercase `contracts`, compared as a literal path
   string, so no filesystem's case folding can change the verdict. Only the
   package-root directory is reserved; a nested `assets/contracts/` is
   untouched.
2. Files whose names begin with a dot are ignored by these rules — VCS and
   OS metadata, `.gitkeep` included, so an empty reserved folder is
   representable in git.
3. Every other entry MUST be a file, and every one of those files MUST be a
   valid contract instance (§10.4). A stray file or a subdirectory is a
   validation failure.
4. Rules 1–3 bind on the directory's existence, not on activation, so junk in
   an instance-less `contracts/` fails now rather than at the moment someone
   adopts a contract.
5. A package that already carries a designer-owned `contracts/` directory MUST
   rename it. That is the one migration cost this section imposes, and a
   validator SHOULD name it as such rather than reporting a folder full of
   invalid instances. A package with no `contracts/` directory is untouched by
   every rule in this section.

**The filename is the instance id.** The name minus `.json` MUST equal the
file's declared `instance`. Instance ids are kebab-case and dot-free (§10.5),
so the strip is unambiguous: `stamina.instance.json` is illegal, not
ambiguous. Instance ids are unique within a package, and everything else
addresses an instance through them: `contracts.<instance>.<knob>` as a tuning
key (§10.11), `<instance>/<template>` as an acceptance-test name (§10.10).

**Several instances of one core are ordinary.** `hull` and `shield` above
share `health-1`'s semantics with independent surfaces — the
shields-as-second-health-bar convention, written as two files. **The core's
bytes live in the instance file**, in full, so one file stays one drop-in
declaration. Where two instances in one package declare the same core `id` and
`version`, their `core` objects MUST be **identical**, meaning byte-equal
under §10.10's canonical serialization — authored field order, annotations
included, since the annotations are part of what a reader reads. Divergent
copies are a validation failure, because a package cannot carry two silently
different `health-1`s under one name.

### 10.3 Identity, lifecycle, and integrity

**Identity is human-shaped: `id`, `version`, and `origin`.** These are claims,
and the core's bytes are the truth a reader consults — a core is a few
kilobytes of self-describing JSON sitting inside the package, and the reader,
human or agent, recognizes it by reading it. Two unrelated `health-5` cores
may exist; there is no registry to prevent it (§10.13), and a reader tells
them apart the way readers do: by reading, and by `origin`, which a core
SHOULD carry. The compound name `health-1` is id `health` plus version `1`,
and that compound form is how a generated block's markers (§10.10) and the
certification protocol's contract records (§10.3, below) name a core.
Filenames stay instance ids.

**A published core is immutable, and a revision is a new version.** The
revised document carries a new `version` and MAY carry `supersedes` naming
what it replaces. Editing a core you have adopted makes your copy a variant:
declare it under your own id or version and your own `origin`. That is
authoring discipline, not a machine check — the enforcement sits at
certification time, where the format already lives on hashes.

**The digest belongs to that layer alone.** The **core digest** is SHA-256
over the vendored `core` object serialized in §10.10's canonical form, with
every field covered — `origin` and `_`-prefixed annotations included, unlike
the block rendering that strips them — so an origin-only or annotation-only
edit is detectable drift. No package rule reads it and no authoring tool computes it. The
experimental certification protocol (§2d) records one entry per instance,
carrying the plain `id`, `version`, and `origin` triple beside the digest, so
an audit never has to guess which variant of `health-1` a claim covers, and
recomputing it is the auditor's work as with every other hash in this format.
The digest's own record shape is published with that protocol at
`conformance/CERTIFICATION.md`; no v0.5 build-record field carries it.

### 10.4 The instance file

An instance file's top-level fields are exactly:

- **`format`** (string, required): `opengdd-contract-instance-1`.
- **`instance`** (string, required): the instance id, equal to the filename
  minus `.json` (§10.2).
- **`core`** (object, required): the vendored core (§10.5).
- **`surface`** (object, required): this game's answers (§10.6).
- **`rows`** (object, optional): inline collection rows (§10.7).

Nothing else. **Every object in the envelope is closed** — the three levels
above and every nested object §§10.5–10.7 shape — so an undeclared field is a
validation failure wherever it appears.

One idiom is exempt. A field whose name begins with `_` is an **annotation**:
legal in every envelope object, read by no check, ignored by every
closed-shape check for unknown fields, and neither interpolated nor rendered
into the generated block (§10.10). That exemption reaches unknown-field
closedness and nothing else: an annotation is ordinary content to the identity
comparison of §10.2 and to the core digest of §10.3, so an annotation edit is
drift like any other. Annotations hold provenance and history; what a designer
needs *while answering* belongs in `rationale` (§10.5).

### 10.5 The core

The `core` object's fields are exactly these, and nothing else. Required:
`format` (`opengdd-contract-core-1`), `id` (string), `version` (integer),
`summary` (string), `mechanism` (an array of strings — the semantics a builder
implements against), `decisions` (array), and `templates` (array). A core
SHOULD carry `origin` (§10.3). Optional: `supersedes`, `knobs`, `invariants`,
and `collections`. `decisions` MUST be non-empty: a core that forces no
decision records no decision, and would be nothing but a channel for dropping
Fixed acceptance tests into someone else's build plan.

**Naming, one rule.** What the designer names is kebab-case: core ids,
instance ids, flag and knob names, option ids, invariant, template and binding
ids, `surface_inputs` names, record field names, `options` values,
collection-schema names, and unit strings. **Kebab-case** here means
`^[a-z0-9]+(-[a-z0-9]+)*$`, §9.11's segment grammar. All of them are therefore
dot-free, so `contracts.<instance>.<knob>` parses unambiguously as a §4 dotted
key. What the format names is snake_case: `default_guidance`,
`surface_inputs`, `test_inputs`. Within one core, flag
names and knob names share one namespace and MUST be unique across it, so a
placeholder never needs disambiguating; template ids sit outside that
namespace, since placeholders resolve knob names and row fields only.

**The condition field `when`.** Everything conditional in the envelope — a
flag, a knob, a template, a record field — uses this one field. It is an
object with optional `flag` and `row` fields. `flag` maps a flag name to an
array of option ids. `row` maps a record field name to an array of values, and
is legal only where a row is in scope: record fields, and `per-row` templates.
A condition is satisfied when every listed flag's recorded answer, and every
listed row field's value, is in its array. A condition naming a *pruned* flag
is unsatisfied, there being no recorded answer to read. An absent or empty
`when` is satisfied.

The nested shapes, each closed:

- **`origin`**: `author` (string, required), `url` (string, optional),
  `status` (string, optional).
- **`supersedes`**: `id` (string, required), `version` (integer, required),
  `origin` (object, optional, the shape above).
- **`decisions[]` entry** — one **flag**, which is what this document calls a
  question a core forces: `flag` (kebab name, required);
  `question` (string, required — the question as the designer is asked it);
  `options` (array, required, non-empty), each entry carrying `id` (kebab,
  required, unique within the flag), `semantics` (string, required — what
  choosing it means, precisely enough to build against), and an optional
  `rationale`. Optional per flag: `default_guidance` (string; SHOULD name an
  option id where one fits), `rationale` (string), and `when` (the condition
  above, `flag` domain only). The legal values of `answers.<flag>` are exactly
  the option ids. The option id **`not-applicable` is reserved**: listing it
  is how a core permits "this design has no such mechanism", and its
  `semantics` says what that absence means. A constitutive flag simply omits
  it — health with no defined at-zero event is not a smaller health system, it
  is not health — and the flag's `rationale` is where the why-no-escape
  reasoning lives. The dependency graph the `flag` conditions induce over
  flags MUST be acyclic.
- **`knobs.<name>` entry** — the meta for one number: `kind` (required;
  `tunable` or `constant` — §4's change-authority axis, read by the
  balance-revision rule, by §5 targeting, and by §7's key sets); `unit`
  (required; a unit string, or `dimensionless`, or `instance-defined`, the two
  sentinel spellings being reserved and unable to name a real unit); `type`
  (required; `number` or `integer`); `range` (optional, legal on `tunable`
  only; an object with `min` and/or `max`, at least one, bounds inclusive, and
  `min` never above `max` where both are declared);
  `default_guidance` (number or string, optional); `description` and
  `rationale` (strings, optional); `when` (optional, `flag` domain only — the
  knob applies exactly when it is satisfied). Knobs are numeric only: a
  non-numeric choice is a flag, and a text answer belongs to a row (§10.7).
  Units are descriptive: no rule compares
  or converts two of them, so a unit can never couple two instances, and
  everything downstream — the resolved snapshot, §5 clamping, key
  citations — sees the bare number.
- **`invariants[]` entry**: `language` (required; `opengdd-expr-1`), `id`
  (kebab, required, unique among the core's invariants), `assert` (required; a
  §4a expression whose references use the `knob:<name>` scheme, legal only
  here), `message` (string, required). An invariant states a rule between the
  core's own knobs — a bound below a ceiling, a starting value inside its
  range — that no per-key range can express.
- **`collections.<schema>` entry** — a record schema for content the mechanism
  consumes: `description` (optional) and `record` (required; field name →
  field shape). §10.7 gives the field shape and says where the rows come from.
- **`templates[]` entry** — one acceptance test, parameterized: `id` (kebab,
  required, unique among the core's templates); `title` (string, required —
  the heading text; the only placeholders legal in a title are
  `{{instance}}`, `{{bind:<id>}}`, and `{{row.<field>}}`); `type` (required;
  one of §6's four test types); `expand` (required; `once` or `per-row`);
  `collection` (required exactly when `per-row`; a key of the core's
  `collections`); `when` (optional; the `row` domain is legal exactly when
  `per-row`, and selects which rows expand); `bindings` (optional; below);
  `surface_inputs` (optional; below); `test` (object, required — the test
  block in its type's §6 shape, with placeholders, and carrying a `type`
  field equal to the template's own); and `text` (string, required — the
  human-readable statement of the same check, with placeholders). Templates
  select and parameterize within §6's grammar; they do not invent one. §6's
  closed field set and its shape rules are decided over the *instantiated*
  block (§10.10), not over the template: before substitution a `test` may
  hold placeholders where §6 requires an array or a number, and that is what
  a template is for.
  - **`bindings`** maps a binding id (kebab) to exactly one of
    `{flag, map}` or `{row_field, map}`, the second legal only under
    `per-row`. The map takes an option id, or a field value, to a
    core-authored phrase. Binding phrases are template text: placeholders inside them
    expand in the same single pass (§10.9), they count as the template's own
    references for liveness (§10.8), a phrase MUST NOT contain a `{{bind:}}`
    placeholder, and a phrase a `title` interpolates is restricted to the
    title's three legal forms. A map's keys MUST be a subset of the flag's
    option ids and SHOULD cover the options that can co-occur with the
    template's liveness; the normative check is the dynamic one — a live
    template whose map lacks the recorded value is a validation failure —
    since co-occurrence under flag dependencies is a satisfiability question.
    Flag answers never interpolate
    raw; they reach generated text only through these phrases, so the
    generated block's vocabulary is the core author's.
  - **`surface_inputs`** declares the test inputs a template needs that
    neither a flag nor a knob can express — a domain sentence, a seed set, a
    sample count. It is an array whose entries carry a required `name`
    (kebab), `type`, and `description`, plus an optional `example` and
    `default_guidance`. `type` is a JSON type name: `string`, `number`,
    `integer`, `boolean`, `array`, or `object`, so a tool can render a real
    field rather than a raw JSON box. `example` illustrates and is typically
    drawn from another game; `default_guidance` is a value this designer may
    accept as written. Both are guidance: the surface still records the value
    (§10.6).

### 10.6 The surface

**Every statement a surface records — an answer, a knob value, a test
input — and every inline row is a Fixed design statement of the adopting
package (§2).** A core's semantics bind the builder the way Fixed prose binds:
by declaration (§8). None of it is ever Delegated, and none of it is a
personalization target — a `kind: tunable` knob's *value* is the one
exception, and §10.11 says why the rest cannot be.

The `surface` object's fields are exactly:

- **`answers`** (object, required): live flag name → option id. One entry per
  live flag, `not-applicable` being an option id like any other where the core
  lists it. A pruned flag MUST be absent.
- **`knobs`** (object): knob name → a number, or `{value, unit}` exactly when
  the knob's meta declares `instance-defined` and only then. A knob whose meta
  names a concrete unit, or `dimensionless`, takes a bare number:
  `"max": 100`. A surface-supplied `unit` is a non-empty kebab-case string,
  and the two reserved sentinels — `dimensionless` and `instance-defined` —
  are not legal there: a surface names a real unit, or the core should have
  said `dimensionless`. Either way the value MUST satisfy the knob's declared
  `type`, and a `kind: tunable` knob's value MUST sit inside its declared
  `range`.
- **`test_inputs`** (object): template id → an object keyed *exactly* by that
  template's `surface_inputs` names. The entry is required exactly when the
  template is live and declares a non-empty `surface_inputs`, and forbidden
  otherwise. Each value MUST match its declaration's `type`, and is
  substituted per §10.9.
- **`meta`** (object, optional): unpruned knob name → `{must_match}`. The
  field, if present, MUST be `true`: there is nothing to record a false pin
  about. It is the one designer-side channel the envelope sanctions, and it
  needs no opt-in from the core — any surface may pin a knob the way §4's
  `meta.<key>.must_match` pins a tuning key.

Nothing else: the closed surface is precisely this list. `knobs` and
`test_inputs` are each required exactly when their declaration set is
non-empty after liveness — at least one unpruned knob, at least one live
template with inputs — and MUST be absent otherwise.

An adopting package's own creative data stays where it always lived: in
`tuning.json`, in its collections, and in its chapters. `tuning.json` stays
purely the designer's and the contract stays purely conventional; the resolved
snapshot (§5) is where the two meet.

Contract knob meta carries no §2c `ruleset` field in v0.5. A knob is one
number under one authority in every ruleset a package declares; scoping one to
a ruleset would be a format revision, not a package's choice.

### 10.7 Rows: bound collections and inline rows

A core MAY declare collection schemas for content its mechanism consumes — a
threshold list, a recipe list, a stat list. The contract declares the machine;
the adopting package supplies the material.

**Field shape**, closed, inside a schema's `record`: `type` (required;
`number`, `integer`, `string`, or `citation`); at most one of `required`
(Boolean) and `when` (the condition of §10.5, both domains legal — the `row`
domain reads other fields of the same row, the `flag` domain reads the
surface's answers, and the field is required exactly when the condition holds
and forbidden otherwise); `options` (array, legal on `string` only — a closed
set of kebab-case values of at most 64 characters); `pattern` (legal on
`string`; `kebab-case` is the only value defined); `unique` (Boolean, any
type; uniqueness within the bound rows); and `description`.

A row carries exactly the fields its schema declares: the record object is
closed like every other object of the envelope (§10.4).

Two of those field shapes carry the layer's rule for text. **A text answer is
a closed choice or a citation, never free prose.** A closed choice is a
`string` field with `options` — a quoted value from a list, and because those
values are kebab-case (§10.5), no value can carry prose or break the fence it
lands in. A `citation` is a reference into the adopting package's own
material, and its value grammar is closed: a §4a `tuning:<key>` reference, or
a chapter-section reference written `<file>.md#<anchor>` with the file
extension, as §1a reads one, and nothing else. A citation substitutes into the
test as the reference itself, never as the resolved target's text.

A citation MUST resolve, and to a legal target. A `tuning:` citation MUST
name a declared key. A chapter-section citation MUST name an existing file and
an anchor that §1a's slug rule derives from a heading in it, and **that
section is a legal target only when no authority tag appears anywhere inside
it and no enclosing tag's scope (§2) covers it.** The reason is the test the
citation lands in: a test whose pass condition lives in prose the builder may
vary is the divergence this layer exists to abolish, and a section that hands
any part of itself away can no longer be relied on whole.

A tuning key is a legal target for the opposite reason, and the difference is
worth stating, because it is what makes a key citation safe where prose is
not: the key is stable, only its value moves, and the resolved snapshot pins
that value for each build (§5). A citation of a live personalization target is
therefore fine — the test still asserts the same thing about the same key.

No citation may target the generated block or an anchor inside it (§6). A
plain `string` field with neither `options` nor `pattern` stays legal for
content the designer *names* — labels, ids — which answers nothing; the
closed-choice-or-citation rule governs text that *answers* the contract.

Where one anchor covers several declared behaviors, the cure is finer anchors
or an ordinary discriminator field on the row. The citation grammar stays
closed.

**Binding.** Binding reaches only the schemas a vendored core declares.
Everything else a package keeps — its own collections, its own content, its
own files — is untouched by this section and stays exactly where it lives
today (§10.6). For every instance file present, every collection schema its
vendored core declares MUST be bound by exactly one of two homes:

1. a §1b collection whose manifest entry carries the `instance` field —
   `"instance": "contracts/stamina.json#thresholds"`, the path being exactly
   `contracts/<instance>.json` and the fragment a bare key of the core's
   `collections` object; or
2. an entry of the instance file's own top-level `rows` object, keyed by the
   same schema name and holding an array of rows.

An unbound schema is a validation failure, never a silent zero-expansion; a
schema bound twice is a validation failure, because two row sets would make
the expansion ambiguous. An empty bound collection is legal and declares "none
of these". Inline rows are legal at any size; which home a list wants is a
question for the guides — its own file when it is big enough to be its own
artifact, or when other parts of the spec reference it — and never a
validator's business.

A bound §1b collection MUST carry Fixed authority, and none of its rows — the
collection records this section reads as rows — may carry an authority of its
own (§1b). Rows are instantiation inputs, and one personalization-authority
row would make the generated acceptance tests differ per build. Inline rows
are Fixed inherently, being statements of the instance file (§10.6).

Three further rules:

- Binding a schema is what activates row validation, including citation
  resolution, and it runs whether or not any template expands those rows: the
  rows are content the builder consumes either way.
- A record schema that any `per-row` template expands MUST declare an `id`
  field — `type: string`, `pattern: kebab-case`, `required: true`,
  `unique: true` — because §10.10's acceptance-test names lean on it. A schema
  no template expands may omit it.
- The coupling between rows and answers runs one way. A record schema MAY read
  flag answers through a `when`; nothing in the envelope ever reads a row to
  resolve a flag.

A bound collection keeps everything §1b already asks of it. The core's schema
governs record shape; the collection's `defined_in` section still homes the
package-specific reference targets and completeness rules, and the `instance`
field adds a record schema rather than replacing that section.

### 10.8 Answered, not silent

**Every live flag MUST be answered. N/A is a recorded decision;
silence is a validation failure.** A checklist has no power if lines can be
skipped, so under-specification here is made illegal rather than impolite.
The mirror rule holds too: every unpruned knob MUST be set — a
`default_guidance` is guidance for the author, never a fallback at
runtime — and a pruned flag or knob MUST be absent, because a value for
machinery that must not exist is as wrong as silence about machinery that
must. Every live template's declared inputs MUST be filled.

**Pruning is one rule everywhere.** A flag, knob, template, or record field
whose `when` is unsatisfied is pruned: unasked, absent, and gone from the
generated block. `not-applicable` prunes through exactly this mechanism, as
does any other excluded answer; templates carry no ownership field naming the
flag they belong to.

Liveness computes in one pass over the recorded answers:

1. **Flags.** Resolve them in dependency order — the graph is acyclic, so one
   pass suffices. A flag with no `when`, or with a satisfied one, is live and
   MUST be answered; a flag whose `when` is unsatisfied is pruned and absent
   from `answers`. A condition naming a pruned flag is unsatisfied, so pruning
   cascades cleanly.
2. **Knobs.** Prune each knob whose `when` is unsatisfied by the recorded
   answers.
3. **Templates.** A template is live exactly when every knob it references —
   in a placeholder anywhere in its `text`, its `test`, or a binding phrase,
   a `title` contributing only through its bindings — is unpruned; and every
   flag its `bindings` read is live; and the `flag` domain of its `when` is
   satisfied; and, under `per-row`, at least one bound row matches the `row`
   domain of its `when`. A template over an empty or fully filtered row set is
   not live and compels nothing.
4. **Invariants.** An invariant is live exactly when every knob it references
   is unpruned. It carries no condition of its own; its liveness is derived.
5. **Expansion.** A `per-row` template expands for exactly those bound rows
   matching the `row` domain of its `when` — absent or empty meaning every
   row. A row that legally lacks *any* field the template reads — through its
   `when`'s `row` domain, through a `{{row.<field>}}` placeholder, or through
   a `row_field` binding — does not match and does not expand.

Liveness is a derivation, not an obligation. A template that references a
pruned knob simply is not live, which makes a placeholder pointing at a key
that must not exist unreachable rather than checked.

Before any of that, referential integrity: every flag name, option id, knob
name, and row-field name appearing in a `when`, in `bindings`, or in a
placeholder MUST be declared in the core, and row fields in the named schema's
record. An undeclared name is a validation failure, never a vacuous condition.

**Core invariants are checked twice**: over the surface's own values at
package validation, and again over the resolved snapshot when a build record
is validated (§10.11). A §5 override that is legal for its own key can still
violate a rule between two knobs that no per-key range can see.

### 10.9 Instantiation and placeholders

Placeholders are delimited `{{` `}}`, and there are five forms:

- **`{{instance}}`** — the instance id.
- **`{{knob-cite:<knob>}}`** — the literal citation
  `tuning:contracts.<instance>.<knob>`. Never the value: §1's cite-the-key
  rule holds inside a generated test exactly as it does in prose, which is
  also what keeps the generated block invariant under §5 personalization of a
  tunable contract knob.
- **`{{surface:<input>}}`** — the value of a test input, verbatim.
- **`{{bind:<binding-id>}}`** — the binding's mapped phrase for the recorded
  answer or row value.
- **`{{row.<field>}}`** — the expanding row's field value, `per-row` templates
  only. A `citation` field substitutes as the reference itself, never as the
  resolved target's text.

Substitution has two contexts. **Whole-value**: where a string in the test
block — a field value or an array element, at any nesting depth — is exactly
one placeholder, it is replaced by the raw JSON value, which is how an
object-valued test input such as a sampling plan lands as a nested object.
**In-string**: a placeholder embedded in surrounding text substitutes as text
— a string bare, a number in the shortest decimal that round-trips, a Boolean
as `true` or `false`. Arrays and objects are legal in whole-value position
only; interpolating one in-string is a validation failure.

Expansion is a single pass over *core-authored* text — `title`, `text`, the
test block's strings, and binding phrases, which are template text and expand
in that same pass: resolving a `{{bind:}}` inserts the phrase, and the
inserted phrase's own placeholders then resolve. Values supplied by the
surface or by rows are never re-scanned, so no recursion is possible, and any
such value containing `{{`, `}}`, or a code-fence delimiter is a validation
failure — checked recursively over every string inside an array or object
value. A closed choice needs no such check: its `options` values are
kebab-case, and no kebab-case value can carry either delimiter. An
unresolvable placeholder in a live template is a validation failure.

### 10.10 The generated block

Instantiating a core's live templates over one surface produces a **generated
block**, which is appended to the build plan (§6) and checked there. One
marker pair per instance, emitted for every instance even when it has zero
live templates, so presence is always visible:

```text
<!-- opengdd:contracts:generated:begin instance=<id> core=<core-id>-<version> -->
<!-- opengdd:contracts:generated:end instance=<id> core=<core-id>-<version> -->
```

The marker lines are normative verbatim at column zero, attributes in the
order and spacing shown, and they are inside the compared bytes. On read-back,
a marker's `core=` attribute splits at its *last* hyphen: ids may contain
hyphens, versions are integers. The pairs sit at the end of the build plan,
after all game-local content and outside the phase structure, ordered
lexicographically by instance id.

Inside a pair, each instantiated test renders as a heading:

```text
### AT <instance>/<template-id> — <instantiated title>
### AT <instance>/<template-id>/<row-id> — <instantiated title>
```

the second form for `per-row` expansion, the row id being the row's `id`
field. **Generated tests carry names, not numbers** (§6): the name is unique
by construction, since instance ids are unique in a package, template ids
within a core, and row ids within their bound rows, and nothing ever
renumbers. Adding a game-local test, another instance, or another row changes
no other test's identity. Because they are not numbered, generated tests do
not satisfy §6's floor: a build plan MUST still carry at least one `AT-<n>`
of the package's own, however many contracts it adopts.

Order inside an instance is: templates in the core's declaration order, read
from the instance file's own vendored core text; a `per-row` template
contributing one test per matching row, rows in the authored order of whatever
binds the schema — the §1b collection's document order, or the inline `rows`
array's order. The row loop is *inner* to the template loop: all of one
template's row tests render before the next template begins.

The heading form above is normative, the em dash and the single spaces around
it included: the headings are inside the bytes compared below.

Each test's body is the fenced test block followed by the instantiated `text`,
the block first, as §6 requires of any acceptance test. The fence is exactly
three backticks with the info string `test` immediately following, and a bare
three-backtick closing fence. Wherever this section says **code-fence
delimiter** it means exactly three backticks.

**The canonical form (normative).** A test block's content is the instantiated
object rendered by these rules, which are also this section's canonical
serialization wherever another rule cites it:

- two-space indentation, one level per nesting depth;
- one field or array element per line, `": "` between a field name and its
  value, and a `,` terminating every line that is followed by a sibling;
- an empty object or array on one line, as `{}` or `[]`;
- fields in the order the source object declares them — the authored order of
  the core file's JSON text, which tools MUST preserve through parsing; a JSON
  stack that discards field order cannot implement this section;
- strings escaping only `"`, `\`, and the C0 control characters — JSON's short
  escapes where they exist and lowercase `\u00xx` otherwise — with every other
  character passing through as literal UTF-8;
- numbers rendered by the JavaScript number-to-string algorithm, the shortest
  decimal that round-trips, so `1.0` renders `1`;
- Booleans as `true` and `false`; and
- LF line endings.

Those rules are `JSON.stringify(value, null, 2)`. `_`-prefixed annotations are
stripped before rendering, so they never reach any rendered output, and
`{{row._x}}` is not a legal placeholder. The instantiated `text` is emitted as
its own bytes, unchanged; a core author separates paragraphs with a blank
line.

The same canonical form, applied to a whole `core` object with annotations
kept rather than stripped, is what §10.2's identity comparison and §10.3's
core digest read. Those two cover the core whole by deliberate scope, which is
why the annotations count there.

Byte layout, pinned because the equality below is over bytes: LF line endings;
exactly one blank line between every pair of adjacent elements — begin marker
and first heading, heading and fence, closing fence and text, text and the
next heading, last text and end marker, a begin marker and its own end marker
where an instance has no live template, and an end marker and the next begin
marker; exactly one blank line before the first begin marker; and the final
end marker is the last line of the file, ending with a newline.

**The block is a pure function of its canonical inputs, and the validator
proves it.** Those inputs are the instance id, the core, the surface excluding
`surface.meta`, and the bound rows — and nothing else. The validator recomputes the
instantiation from them and requires byte equality with the block as
committed. Regenerating after an edit is tooling discipline, the same as
generating a site from its sources; the check is what makes the discipline
safe. Byte equality is deliberate: a looser rule could be adopted later
without breaking anything, while a tighter one could not.

The placement rules above bind the build plan. A document that merely *quotes*
a generated block — a guide, a walkthrough — is bound by the block's internal
layout only. Outside a package, externally bound rows have no normative
source, so a demonstrating document MUST state its assumed rows as declared
premises and is checked against that premise set; an instance carrying its
rows inline needs no premise at all.

### 10.11 Contract knobs and the numeric machinery

Contract knobs do not duplicate §§4, 5, and 7; they join them, under the
reserved key namespace `contracts.<instance>.<knob>`.

- **§4.** A contract knob is a rebalance-safe parameter of the machine, and
  the location rule admits it: it lives in the surface rather than in
  `tuning.json` `tunables`, and `contracts.` stays a reserved first segment,
  so no `tuning.json` key may occupy the namespace. A balance-only revision
  MAY change a `kind: tunable` knob's value within its range, and MUST NOT
  touch a `kind: constant` one — exactly the rule §4 already states for
  `constants`. `range` is legal on tunables only; where a core needs a
  constant's bounds, it writes an invariant, which keeps every declared range
  inside the machinery that enforces ranges. §4's rule that a test's inputs
  live with the test extends: a template's inputs are declared by the core and
  recorded in the surface's `test_inputs`, and they land in the instantiated
  test.
- **Citing one in prose.** A backticked `contracts.stamina.max` in chapter
  prose is classified by §4's first rule — a reserved first segment — and
  resolves as a mechanism path against the instance file that owns it. It
  resolves against the *live* knobs: a pruned knob is not there to be cited.
  The two-segment form `contracts.stamina` is a legal citation too, of the
  adoption itself, and it resolves whenever that instance file exists. The
  typed form `tuning:contracts.<instance>.<knob>` is the §4a reference,
  resolving in the resolved snapshot, and it is what a generated test block
  carries (§10.9). The two channels never collide: prose cites bare, the JSON
  channel cites typed.
- **§5.** Override targeting and clamping extend to `contracts.*` keys. A
  knob's range is read from the core's knob meta and its `must_match` pin from
  the surface's own `meta`, rather than from `tuning.json` `meta` — otherwise
  the machinery is §5's unchanged, and contract knob meta carries no §2c
  `ruleset` field in v0.5 (§10.6). Nothing else about a contract is
  personalizable: flags, test
  inputs, and rows are Fixed (§10.6). A per-build flag answer would make the
  set of generated tests differ per build, which collides head-on with the
  count check below; whether a later revision may relax that is genuinely
  open.
- **§7, check 4.** The `resolved_tuning` key set MUST exactly equal the
  `tuning.json` key set unioned with the contract key set —
  `contracts.<instance>.<knob>` for every unpruned knob of every instance. A
  pruned knob enters neither the snapshot nor this check. Each contract entry
  carries the bare number and sits in `tunables` or `constants` according to
  its knob's `kind`.
- **§7, check 5 and check 6.** `acceptance.total` counts game-local
  acceptance tests plus generated ones after liveness and per-row expansion; a
  template that is not live, and a row that does not match, contribute zero.
  Pass equality holds over that same total.
- **§7, invariants.** A core invariant that fails over the resolved snapshot
  is a build-record failure of the same rank as checks 1–6 (§10.8).
- **Certification.** A `must_match` pin on a contract knob reads exactly as
  §4's does, against the resolved snapshot. Instantiated tests
  execute as game-local ones do, under the same runner and the same evidence
  duties, and only after package validation — block equality included — has
  passed, so no run can execute a block that disagrees with its surface. A
  generated test's failure attributes to the adoption — this build against
  this surface — never to the core in isolation.
- **§2a.** Where a template's inputs supply a seed set, the stream is declared
  where every stream must be declared: in text the builder reads. §2a carves
  one exception into its address grammar for the reserved stream name
  `contracts.<instance>.<template-id>`, whose segments are dot-free kebab
  names parsed like the tuning namespace, and the seed values live in the
  surface's `test_inputs` and land in the instantiated test block.

### 10.12 Adopting a contract into an existing spec

Adopting a core into a spec that already has numbers — a retrofit — can
leave one value under two names: a package tuning key and a contract knob.

**On adoption, a semantically duplicated package key MUST migrate into the
contract namespace.** Letting the surface cite the package key instead would
re-open the closed surface. One exception: where migrating would flip the
key's change authority — a `tunables` key, perhaps a live personalization
target, against a `kind: constant` knob — migration is blocked rather than
silently reclassifying the number. The adoption then needs either a declared
core variant (§10.3) or a recorded acceptance of the flip, written as the
annotation `_authority_flip_accepted` beside the knob's `meta` entry, where it
stays visible in the file it concerns.

Enforcement is honestly split. *Detecting* an unmigrated duplicate is a
semantic judgment no validator can make, so this MUST is a prose obligation
under §2d, like §2a's tie-break rule. An adoption checklist and a
value-equality report emitted once at adoption, rather than on every
validation, are the tooling queued to support it; neither exists yet.
*Completing* a migration is machine-checked for free wherever the old key was
cited: the key is deleted, and §4's fourth classification rule turns every
stale citation into a dangling citation, which is a validation failure. An uncited key —
declared and consumed only by the implementation — has no such signal, and is
the profile most likely to be duplicated by a knob, so the checklist asks
about uncited keys explicitly.

### 10.13 What this layer does not do

- **No registry.** Contracts travel by copy-paste, vendored into the package,
  hermetic and resolvable offline, exactly as packages already are. Guides and
  galleries may show conventions; anyone may curate a collection; the format
  anoints no one.
- **No inter-contract dependencies.** An edge case that touches another system
  enumerates its outcomes abstractly. Conventional pairings live in guides.
- **No composition algebra.** What happens between two contracts is where the
  design lives: authored in prose, free to blend the boxes, and verified by
  the package's own §6 tests on the seam.
- **No code.** A contract is a specification. An implementation library may
  claim conformance to a core by passing its tests; that claim belongs to the
  implementation, not to the format.
- **No content, and no semantics review.** The format owns the
  envelope — the instance-file shape, the closed surface, the folder rules,
  and the instantiation grammar — and a core is *valid* by satisfying it.
  Validity never reads a core's content: no semantics review, and no check of
  the §10.1 criteria. Cores are authored like any other document, and the
  format's own first cores are format-published documents rather than a
  privileged namespace.

## 11. What v0 deliberately excludes

*For everyone. One page, and it may save you designing something the format cannot carry yet.*

v0 deliberately excludes:

- multiplayer and networking;
- rendered-capture certification for 3D renderers. A `web-3d` package
  validates, and a build of one can assemble a full record under the
  experimental protocol (§2d) when its complete acceptance suite needs only
  logic and state observations. What is missing is capture: no capture
  profile beyond `web-1` exists yet, and a rendered-capture acceptance test
  against a 3D renderer has no standardized sampling recipe (§7);
- binary asset pipelines;
- audio direction — a professional-vocabulary survey exists, but its
  transmission experiment has not run, so v0 makes no audio-direction
  claims;
- localization structure;
- monetization design beyond the optional commerce split, including IAP
  design;
- any registry API; and
- target families beyond web delivery (`web-2d`, `web-3d`), until the
  format has held up across ten real specs.

---
