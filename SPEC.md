# OpenGDD v0.6 working draft

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

Status: v0.6 working draft — not a release. License: specification text
CC-BY-4.0; schemas and validator code MIT.

This document defines OpenGDD v0.6. Unless a passage explicitly describes a
migration or historical artifact, every unnumbered current-version statement
and every normative rule in this document applies to v0.6; no unstated rule is
inherited from an earlier version.

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
| **Replay** | Runner-owned data a test plays back as input. Any expected result is the test block's separate `target`; recorded footage is a **capture**, which is a different thing (§6). |
| **Evidence** | The record of what actually happened when the tests were run (§7). |
| **Harness** | The thing that runs the tests. Evidence is the record of what running them produced; the two words are not interchangeable (§6). |
| **Mode** | A declared span of play with its own sense of how time passes. Called a *resolution mode* on first mention, since games use "mode" for many other things (§4b). |
| **Completeness** | The idea that a spec holds together: nothing points at something that is not there, and nothing declared is left out. The format applies it in several places, each saying which side has to cover the other (§§1b, 1c). |
| **`applies_to`** | The plain-prose answer to "which things on screen does this claim apply to?" It sets the claim's reach (§9.5). |
| **Precision levels** | How precisely a visible claim is written: **described** in words, **bounded** by a tolerance, or **exact** (§9.8). |
| **`must_keep`, `may_vary`** | A `must_keep` entry names something a build has to preserve for the game to still look like itself. Its `may_vary` list names the axes along which builders are free to differ (§9.7). |
| **Palette** | A named set of colors, declared in the manifest: the hexes off your moodboard, kept in one place so everything else can point at them. A color inside one gets a name only when something needs to point at it (§3). |
| **Color constraint** | A promise about one declared color: what wears it, when it holds, and how close a build must stay to it (§9.5). |
| **Pin** | To pin is to fix a value the build must reproduce, and a pin is the value so fixed. A **color pin** is a color constraint with `tolerance: 0` (§9.8). |
| **Scope** | The statement of where a claim reaches: what it applies to, when it holds, and how thoroughly it must be observed (§9.5). |
| **Judged, checked, advisory** | The three audit classes. **Checked** means a machine can verify it, **judged** means people score it, and **advisory** means it states intent and decides nothing. What a construct is fixes its class; no entry writes its own class down (§9.10). |
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
  assets/                # optional reference images, moodboards, sketches
  contracts/             # optional adopted contracts (§10) — reserved name
  collections/           # optional structured collections (§1b) — reserved name
```

`contracts/` is reserved for the contracts layer (§10), and `collections/`
for structured content (§1b); a package that keeps its own directory under
either name renames it.

The entry points live in `manifest.json`. It names the entry-point chapters
and, when present, the personalization and direction files (§3). The build
plan and tuning file use the canonical root paths shown above and are not
redirected through the manifest.

**The five chapter filenames are normative.** A chapter carrying the content
the tree assigns to `01-overview.md`, `02-mechanics.md`, `03-content.md`,
`04-presentation.md`, or `05-build-plan.md` MUST use that exact filename.
`03-content.md` and `04-presentation.md` remain optional, and a package MAY
add further chapters under names of its own; what is fixed is that these five
roles are not renamed. Other sections rest on that: §1a reads the fantasy
block from `01-overview.md`, §9 reads the direction fence from
`04-presentation.md`, and §6 scans acceptance tests in the build plan. The
build plan is always the canonical root file `05-build-plan.md`; the tuning
file is always the canonical root file `tuning.json` (§3).

The numbered namespace ends at `05`. Numbers beyond it belong to the
designer's own chapters forever; the five canonical names never renumber and
never gain numbered siblings; and a future revision that adds a canonical
file gives it an unnumbered role name, as `direction.json` and
`personalization.json` already have.

**The kernel promise.** The five required files alone — three Markdown
chapters written in ordinary prose, and two small JSON files — are a
complete, conforming design document. Not a draft, and not a minimum
awaiting the rest of this specification: every further mechanism in this
document is opt-in, activated by declaring or using it, and a package that
stops here is finished. This floor is deliberate. Widening it — making any
further construct required of every package — is a format revision taken
knowingly, never a side effect of another change.

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
  and `collections:` from §4a, `descriptor:` from §8a, and `palette:` from
  §9.5 — a bare tuning
  citation, or a chapter anchor. A **bare tuning citation** is an inline-code
  token that §4's classification rule reads as a citation.
  A **chapter anchor** is a Markdown heading anchor reference, written
  `<file>.md#<anchor>` or as a bare `#<anchor>`. The bare form is read
  lexically: a `#` preceded by the start of the line or by whitespace and
  followed immediately by a kebab-case id. A `#` in any other position is
  ordinary text, so "the #1 spot" is not an anchor.

  **The anchor of a heading (normative).** Wherever this document resolves a
  chapter anchor — a §6 test block's references, a §10.7 citation — the
  anchor a heading answers to is derived from the heading's text by these
  steps, in order:

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

A single player-fantasy line is enough for that part of the block; a complete,
valid block also carries the required `Feel:` line and anti-reference line.
Extra fantasy facets earn their keep below: they tie-break delegations a
role-only sentence never reaches.

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

A collection is a folder with record files in it. Everything else is
opt-in.

```text
my-game/
  collections/
    enemies/
      gloom-moth.json      one record; the filename is its id
      cinder-wisp.json
    levels/
      _collection.json     the optional label: the record schema
      first-slide.json
```

**Each immediate subdirectory of `collections/` is one collection**, and the
folder name is the collection's id, in lowercase kebab-case (the identifier
grammar of §3). Presence is the whole declaration: there is nothing to
register in the manifest, and nothing that can contradict what the folder
holds. The directory holds drawers and nothing else, and a drawer holds its
optional label and its records and nothing else: a loose file in either
place is a hard failure, because a file the format cannot read as a record
would otherwise sit silently beside the ones it can. Drawers are flat —
subdirectories inside a drawer are not defined in this revision.
Organization is expressed as sibling drawers with compound kebab names
(`enemies-bosses`, `enemies-minions`), which is also what differently shaped
records truthfully are: different collections.

**One file per record, and the filename is the record's id and address.**
The name minus `.json` MUST be lowercase kebab-case, which also makes
case-folding collisions unspellable, and the filesystem enforces id
uniqueness by construction. The file holds one JSON object of the game's
own fields, and a display name is ordinary record data: the address stays
stable while the game calls the thing whatever it likes.

**`_collection.json` is the drawer's optional label**, validated by
`collection.schema.json` (§3a), and it appears only when it has something
to say. Its one field is **`record`**: a record schema, written in the same
closed field grammar a contract core's collection schemas use (§10.5) —
each field names its `type` and may carry `required` or a row-domain
`when`, `options`, `pattern`, `unique`, and a `description` saying how the
field is read. With a schema present, every record in the drawer MUST
satisfy it: an undeclared field, a missing required field, a wrong type, a
value outside a closed option set, and a repeated unique value are hard
failures. Without one, records are free-form designer data, and the format
says so plainly rather than pretending otherwise. In a schema and in
records alike, a key opening with `_` is an annotation — read by nothing,
checked by nothing, and exempt from the undeclared-field rule — the same
idiom §10.4 gives the contract envelope.

The grammar's §1b dialect adds one type: **`grid`**, a non-empty array of
strings, one per row. All grid fields of one record MUST agree in
dimensions, measured in Unicode scalar values — the format fixes the unit —
and §7a gives the congruence rules in full. The `citation` type and
flag-domain conditions are §10's dialect: they read a contract instance's
context, and no such context exists here.

Field-level meaning — what `speed` measures, what `#` marks — lives in the
schema's `description`, exactly where contract cores put it. Game rules —
"bosses spawn once per run" — live in chapters, as every rule does.
**Drawers are Fixed spec data**: statements of the package, like inline
contract rows (§10.7), owned by the designer as every other statement is. A
designer who hands some aspect of a collection's content to the builder
says so in an ordinary `> DELEGATED:` section, in words, checked as all
delegation is (§2). No authority machinery attaches to a drawer, and no
per-collection tag exists: the retired `> COLLECTION:` claim of an earlier
draft is reported as retired where it survives in a chapter.

**`collections` is a reserved prose first segment** (v0.6, under §4's
versioning clause). `` `collections.<drawer>` `` cites the drawer as a set,
`` `collections.<drawer>.<record>` `` cites one record, and a longer token
names a member of the record's own data and resolves as far as the record,
the rule descriptors and invariants use. A dangling citation is a hard
failure. This closes the format's last silent-rename gap: with graph edges
(§1c), contract row sources (§10.7), and expression references (§4a) all
hard-checked, renaming a record makes every stale reference a validator
finding with a file and line — the failure that makes rename tooling
trustworthy, exactly as §4 says of palettes.

A drawer's record count is a mechanical fact — one file per record — and an
expression cites it as `collections:<drawer>:count` (§4a). A drawer nothing
reaches — no prose citation, no count reference, no §1c edge set, no §10.7
row binding, no §6 artifact — is a **warning**: the spec never mentions it,
which is a review lead, not an order. Cross-record references beyond what a schema can
say remain what they have always been: a §1c edge set where declared, hard
on every validation; a prose obligation under §2d where not, decided by
reading the chapters, by a designer who wants it machine-decided declaring
the edge set.

A collection bound to a contract instance as its rows takes the core's
record schema and MUST NOT carry a `record` schema of its own — one shape,
one home — and §10.7 gives the binding rules in full.

## 1c. Declared graph edge sets

*For tool authors, and for designers whose content records point at one another, as in a tech tree or a crafting chain.*

Collection records point at one another. A card in a §1b drawer might carry a
`set_id` field holding the id of the set it belongs to. Each such pointer
is an **edge**. §1b already requires every reference to resolve, but that
is all it requires. What an edge means, and which field carries it, is
written only as prose in the game's chapters.

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
  - `from.collection` names a §1b drawer by its collection id.
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

The three graph predicates below are opt-in claims. A package asserts one by
including its rule object in a §6 `document-check` acceptance test whose
`rule_set` is `opengdd-graph-1`. Every predicate the package asserts MUST be
invoked that way; an edge set need not assert any of them. The test carries
its rule objects in the test block's `rules` field (§6 defines the rule
shape). Those rules use the closed grammar below. A rule carrying fields
outside its own predicate's list is invalid. No predicate here carries rates,
capacities, or flow fields.

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
  "artifacts": ["manifest.json", "collections/technologies/",
                "collections/recipes/"],
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
recipe, unlock, and adjacency semantics stay in the collection's defining
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
| **Fixed** | (default, untagged) | Build exactly as written. A deviation is an audit finding under the experimental protocol and would block a future normative certification outcome (§2d). |
| **Delegated** | `> DELEGATED:` | The builder decides. The spec states intent and constraints; the implementation may vary. |
| **Personalization** | `> PERSONALIZATION: <id>` | Resolved by the answer to question `<id>` in `personalization.json`. |

**Scope.** An authority tag has an exact syntactic scope. It starts at the tag
and ends at the next authority tag in the same heading section, or at the end
of that section, whichever comes first. The section ends at the next heading
of the same or a higher level. A statement with no authority tag in scope is
Fixed, which is why Fixed needs no tag of its own.

**Token grammar.** What follows `DELEGATED:` is an optional free-text label. It
is descriptive only, and no rule reads it, with one exception: the §9.9
direction fence requires the exact label `presentation-direction` on its first
line. What follows `PERSONALIZATION:` MUST be the id of a question declared in
`personalization.json` (§5). A tag naming no declared question is a hard
failure, and it is a package-level one (§2d): the id and the question
declaration are both package bytes.

The three levels are the core mechanism of the format: they make every build
unique while keeping the design intact.

**What the format resolves by machine.** All three levels are prose-level
instructions to the builder, with one exception: this version defines machine
semantics for Personalization only where an answer moves a number, and §5
owns that machinery. For a personalized prose section or collection record,
the format defines no machine effect; §5's "Answers outside tuning" rules say how
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
  §2d. They are discharged in the spec's own chapters, since the format declares no
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
exactly one entry carries `initial: true`. Its semantics are the chapter
statements tagged with its id, using the tag defined below.

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

The map of the three layers, before the rules:

| Layer | Question it answers | Decided by | Decided from |
| --- | --- | --- | --- |
| Package conformance (normative) | Is the design sound on paper? | Validation: machine checks, plus human reading for prose obligations | The package bytes alone |
| Build-record conformance (normative) | Is the builder's completion claim coherent? | Validation: record shape, arithmetic, consistency with the source package | The record and package bytes alone |
| Build certification (EXPERIMENTAL) | Is the claim true in reality? | The experimental audit: execution, evidence, judgment | Running the build and reviewing its evidence |

This version defines two normative conformance subjects for a design — the
package and the build record — and one experimental protocol. Every conformance or
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
v0.6 schema — `manifest.json`
against the manifest schema, `tuning.json` against the tuning schema, and,
when present, `personalization.json` against the personalization schema and
`direction.json` against the direction schema — and the package satisfies
every package-level MUST in this document. A package-level MUST is one
decidable from the package bytes alone — by machine or by a human reader,
never requiring execution or external state.
A MUST about build behavior, cross-build stability, or test execution reads
against the build-record conformance layer or the experimental protocol
instead. The published validator implements the machine-decidable subset of
package conformance. A zero-error CLI result establishes only that the checks
this implementation performs passed; it does not by itself establish full
package conformance. The rules, not any one tool's current coverage, define
that outcome. Package-level rules are of two kinds.
Machine-decidable rules — schema validity, completeness, shape grammar, and
cross-file consistency — are decided by validation, and a validator error is
a conformance failure. Prose obligations, such as §2a's tie-break rule or the
rule that normative prose cites a tuning key rather than repeating its value,
bind the package with the same force, but deciding a violation can take human
judgment. A validator may surface likely violations as warnings, but a warning
does not by itself decide conformance, and the absence of a warning does not
discharge the human review.

**Build-record conformance (normative).** A build conforms when it ships an
`opengdd-build.json` that validates against the build schema and passes every
§7 validator-level package-consistency check, including the §9.10
direction-result rules. The record is the builder's
completion claim: shipping it asserts that every acceptance test passed, and
so that every exact color constraint its tests cover matched (§9.8). This
version machine-checks the record's internal validity and its consistency with
the source package; it does not audit the
assertion's truth. Auditing that truth is what certification would do. A
build that still fails a test does not yet ship a conforming record; what it
has are §2b ambiguity reports.

**Build certification (EXPERIMENTAL).** Certification would be the
audited claim that one particular build faithfully implements its spec. The
audit has four intended parts: executing the §6 acceptance tests, accounting
for every Fixed statement, scoring judged direction claims (§9.10), and
auditing the §7 `evidence` record. It is described by the conformance
certification protocol published at `conformance/CERTIFICATION.md` in the
OpenGDD conformance suite. The panel protocol behind the third part is not
yet integrated and sits outside that draft's audit scope.

This version does not define a normative certification outcome, an execution
grammar for `test` blocks beyond §6's package-level field set, or a panel protocol for
judged claims. Where this
document describes certification, it describes the intended shape of that
protocol. No statement grants or withholds a normative certification outcome.
The draft protocol may record audit findings and experimental verdicts, but
those results are not core conformance outcomes.

The experimental status changes no file's shape. `opengdd-build.json` keeps
its required fields, including `evidence`, and packages keep their §6
structural obligations. Record conformance checks the `evidence` field's
shape and counts only: no record-conformance check executes tests or
reproduces hashes. A contract's folder rules, closed surface, vendored-core
identity, and generated-block byte equality are package-level rules of the
first kind, all decidable from package bytes (§10); its core digest is not a
package rule at all, and recomputing one is audit work under the experimental
protocol, exactly as with every other hash here (§10.3). Fixed statements bind
at full force regardless: passing every acceptance test is necessary but never sufficient for the
experimental certification protocol, because a Fixed statement binds
whether or not a numbered test restates it (§2).

## 3. manifest.json

*For designers. One short file per spec, and you write it once.*

The manifest carries the spec's identity and entry points. It is
machine-validated against
[manifest.schema.json](https://opengdd.org/schema/core/v0.6/manifest.schema.json).
Here is a complete manifest for §1a's getaway driver, with none of the optional
top-level structures further down:

```json
{
  "opengdd": "0.6",
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
    "personalization": "personalization.json"
  }
}
```

Its required top-level fields are exactly:

- **`opengdd`** is the format version. Its value is `"0.6"`.
- **`id` and `version`** identify the spec. `version` is exactly three
  dot-separated non-negative decimal integers, `MAJOR.MINOR.PATCH`. Each
  component is either `0` or begins with a non-zero digit; prerelease and build
  suffixes are not accepted. `id` is a kebab-case package id. Core conformance
  makes no global uniqueness claim;
  a catalogue or registry MAY impose uniqueness within its own declared
  domain.
- **`title` and `designer`** name the game and its designer. The designer has
  a name and may also have a registry handle and contact details.
- **`target`** gives the platform, the genre family, the session length, and
  the audience. `platform` names the delivery target and the **state space**
  the designer is responsible for — what the game must keep track of, not
  what it looks like. This version accepts `web-2d` and `web-3d`. A game whose
  world is a plane declares `web-2d` no matter how a build draws it; `web-3d` is
  for a game whose state itself needs three dimensions. Rendering technique
  is never a platform fact: it is the builder's craft on §2a's boundary, and
  a build records what it rendered with in `opengdd-build.json` (§7).
- **`build`** names the entry-point chapters and may name a personalization
  file. The five chapter filenames are normative (§1), so `build.chapters`
  lists chapter entry points under their canonical names. The canonical root
  files `05-build-plan.md` and `tuning.json` are required directly and have no
  manifest fields.

`build.direction` names the optional §9 direction file, `direction.json`. The
rules for that file are normative, and it has a schema of its
own. A direction block in `04-presentation.md` and a declared
`direction.json` MUST appear together. If either appears without the other,
validation fails.

Four optional top-level fields declare other package structures:

- `graphs` declares §1c edge sets over the package's §1b collections.
- `ruleset_state` declares the §2c block.
- `descriptors` declares the named descriptor families from §8. Mood is the
  only populated family in this version (§8a).
- `palette` declares the package's named color sets, described below.

Adopted contracts (§10.2) and collections (§1b) have no manifest field at
all: the `contracts/` and `collections/` directories' contents are the
declaration. The manifest keeps what it honestly owns — identity, target,
entry points, palettes, descriptors, graphs, ruleset state — and registers
no structure a directory already declares by holding it.

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

The commerce profile is OPTIONAL core metadata. Whether the same package bytes
are offered, listed, built by a third party, or kept internal does not change
package conformance and never makes this field required. A publication or
commerce profile MAY impose requirements within its own declared scope; those
requirements are outside core conformance. Presence or absence here MUST NOT
change gameplay expression, authority, or a build's standing under the
experimental certification protocol.

`opengdd-share-v0` records proposed building and deployment terms under the
declared split. The core format validates the metadata's shape, not whether it
grants legal permission or whether a distribution satisfied its terms. The
percentages in `split` MUST sum to 100.

`derived_from` is **Reserved** and inert in this version. It records lineage
metadata only. Its `version` identifies a design spec and therefore uses the
same numeric `MAJOR.MINOR.PATCH` grammar as the manifest's own `version`.
Fork licensing and royalties remain outside the core format.
Modifications beyond
the declared personalization bounds have no path through the experimental
certification protocol. These rules belong to the commerce profile and do not
change core artifact semantics.

### Palettes (`palette`)

A palette is a set of colors with a name. It is where a spec writes down
"these are the five colors of act two": the hexes off the moodboard, in one
place, so that everything else in the package points at them instead of
repeating them.

```json
"palette": {
  "story.act-2":   ["#1A1B2E", "#2E3450", "#E8A13C", "#F4E9D8"],
  "enemies.fire":  ["#B3202A", { "flame": "#E8A13C" }, "#2B0F0A"],
  "strict-colors": [{ "that-purchase-button": "#7B2FF2" }]
}
```

`palette` is OPTIONAL. When present it MUST be a non-empty object. It stands
on its own: a package MAY declare palettes with no `build.direction`, and a
package MAY declare a direction block with no palettes — though a §9.5 color
constraint then has nothing to bind, and a reference that resolves to nothing
is a hard failure.

**Palette keys.** Each key of the map names one palette. A palette key is one
or more segments joined by `.`, and the dots are spelling rather than
structure: the map is flat, and a key groups colors however the designer finds
useful. Single-segment keys are legal.

- Every segment MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, the format's kebab-case
  identifier rule.
- Every segment MUST contain at least one letter. An all-digit unit between
  delimiters is what a reader reads as an array position, and neither a key
  segment nor a color name may offer one (§4).
- No segment may be `json` or `md`. That exclusion is not strictly needed
  here — §4's rule 1 classifies a `palette.`-first token before rule 3's
  reserved-extension prohibition could reach it, so such a key would stay
  citeable either way — and it is kept uniform with tuning keys anyway, so
  that a designer learns one naming rule for dotted keys rather than two.

Two palette keys must not collide in a way that leaves a citation
undecidable; §4 states that rule with the resolution order it protects.

**Palette entries.** Each value MUST be an ordered array of **palette
entries**, non-empty, with no upper bound. The format defines no maximum and a
validator MUST NOT invent one. A palette entry MUST be either:

- a bare string in the `#RRGGBB` grammar — an 8-bit sRGB hexadecimal color
  written as `#` plus exactly six hex digits, either case; three-digit
  shorthand is invalid — which is the paste-out-of-any-palette-tool form; or
- a **one-key object** whose single key is the color's name and whose value is
  a `#RRGGBB` string.

Each of these is a validation failure: a zero-key object (`{}`), a two-key
object, a number, a Boolean, a null, and an array, which is what a nested
palette would be. No other entry form is legal.

Order carries no meaning. The array is ordered because JSON arrays are, and
because designers paste ramps in order; nothing in the format reads position,
and a position is not a citation target (§4).

Two entries in one palette MAY carry the same hex: a name is a citation
handle, not a claim that a color differs from its neighbours. Two hex
spellings that differ only in the case of their digits are compared by no rule
in this format, and nothing turns on the difference. A validator or authoring
tool MUST NOT normalize the authored spelling in any artifact it emits — not
in a diagnostic, not in a rewritten manifest.

**A color is named when something cites it.** Most entries are bare hexes and
stay that way. A color name MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, MUST
contain at least one letter, and MUST be unique within its palette. It is
dot-free: the dot is the delimiter that separates it from its palette key.
Uniqueness is per palette rather than across the package, so two palettes MAY
each carry a color named `flame`.

A bare-string entry has no name and is therefore not a citation target: it is
read, not pointed at. Anything that binds one color — a §9.5 color
constraint's `color` field, a §9.5 threshold operand, a prose citation of a
single color (§4) — MUST name a *named* entry. A reference that resolves to a
bare-string entry is not merely dangling; there is no name to spell. Naming is
therefore an edit an authoring tool makes on demand, when the designer first
cites a color, and never a form the designer fills in up front.

**What a palette does not carry.** A palette has no scope, no tolerance, and
no per-color machinery of any kind. It carries no audit class of its own,
exactly as a §9.6 viewing entry and a §9.3 reference carry none: it is
declared material that other constructs cite. The promise about a color — how
close a build must stay to it, and where that holds — is a color constraint
(§9.5), and it lives there because one color makes different promises in
different places.

A palette read through a §9.2 mood entry is supplementary grounds for the
panel under that entry's own bound `viewing` context, exactly as a mood's
`references` and `anti` already are, and never an independent claim. A
palette reached only by a color constraint, a threshold operand, or prose is
not panel material at all: its colors are consumed mechanically.

**Reachability.** A palette is **reached** by any one of these, and by nothing
else:

1. a §8a mood descriptor's `palette` field naming it;
2. a §9.5 color constraint's `color` field binding into it;
3. a §9.5 threshold operand — `colors` or `against` — binding into it;
4. a prose citation of the palette itself, or of any color in it, in any file
   §4's classification rule walks: the `build.chapters` files and the build
   plan.

A palette that nothing reaches is legal declared-but-unused data, and a
validator SHOULD warn about it. Reachability is judged per palette: an unused
color *name* inside a reached palette draws nothing. Several moods MAY
reference one palette; nothing about the reference is exclusive.

There is no `PALETTE:` direction-fence section and none can exist: §9.9's
fence labels name populated `direction.json` fields, and a palette is not one.
A backticked `palette.` token inside a fence continuation line is chapter
prose like any other, so it resolves and it reaches.

## 3a. Canonical schema URLs

*For tool authors. Designers: all you need is that `"opengdd": "0.6"` picks your schemas.*

Every published schema is identified and served at a canonical URL:

```text
https://opengdd.org/schema/<layer>/v<minor>/<file>.schema.json
```

For example:

```text
https://opengdd.org/schema/core/v0.6/manifest.schema.json
```

The `core` layer publishes six schemas: `manifest.schema.json` (§3),
`tuning.schema.json` (§4), `personalization.schema.json` (§5),
`collection.schema.json` (§1b, the drawer label), `direction.schema.json`
(§9.9), and `opengdd-build.schema.json` (§7). The first five are the
package's; the sixth is the build record's. A contract
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
   manifest's `opengdd` value. A schema under `/core/v0.6/` validates
   manifests that declare `"opengdd": "0.6"`. Schema URLs use minor-version
   granularity. Patch-level corrections are published as errata at the same
   URL and MUST NOT silently change any validation outcome.
3. **Published URLs are permanent.** A schema MAY be superseded by a newer
   version at a new URL. Its existing URL MUST NOT be repurposed or removed.
   The content served there is frozen except for the errata allowed above.
4. **There is no floating alias.** Documents MUST reference an explicit
   version. The format defines no `/latest/` URL.

## 4. tuning.json

*For designers. This is where your numbers live, so read it.*

`tuning.json` sorts each runtime number into one of two categories. It is
machine-validated
against [tuning.schema.json](https://opengdd.org/schema/core/v0.6/tuning.schema.json).

`tunables` and `constants` split every number by who may change it. A tunable
is a rebalance-safe knob. A constant is a value the game's identity rests on,
and a rebalance may not touch it. Neither is a runtime variable.

Only numbers live here. Rebalancing is change by degree, so it presumes
numbers: a discrete choice belongs to a content collection record (§1b) or to
a personalization question's options (§5), and text belongs in content
records. The one declared set this version defines is §2c's set of ruleset
ids.

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
pipeline. For a package that declares no `personalization.json`, its
`tunables` member copies `tuning.json`'s `tunables`, and its `constants` member
copies `tuning.json`'s `constants` or is empty. Live contract knobs join the
matching member by kind (§10.11). This is the snapshot at which package
validation evaluates the invariants above and §4a's arithmetic failures.

A key MUST be unique across `tunables` and `constants`. Every `meta` key MUST
exist in exactly one of those objects.

*Versioning guidance (non-normative).* A revision that intends to be
balance-only changes only `tunables`, within declared ranges, and leaves
constants, structured-content facts, and test replays untouched; a
`kind: tunable` contract knob is likewise a balance revision's to move
within its range, and a `kind: constant` knob is not (§10.11). No
conformance subject in this version compares two revisions, so this is
guidance for humans and publication tooling, not a package check; a
publication profile may own the comparison later.

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
`constraints`, `viewing`, `references`, `semantics`, `meta`, `tunables`,
`constants`, `invariants`, `clocks`, `manifest`, `build`, `descriptors`,
`contracts`, `palette`, and `collections`.
`content` is deliberately not among them: it is a natural key namespace for a
designer. The list is versioned: a later revision of this format MAY extend
it as new mechanisms claim a segment, and a validator that rejects a key on a
newly reserved segment names the revision that reserved it. `palette`,
`references`, and `collections` are reserved as of v0.6, so a tuning key
spelled `palette.*`, `references.*`, or `collections.*` that was legal
before is rejected with a diagnostic naming that revision. `references.<key>`
in prose resolves against `direction.json` (§9.3), exactly as the other
direction families do, and `collections.<drawer>` resolves against the
`collections/` directory (§1b).

`contracts` earns its place on that list by rule 1: a backticked
`contracts.stamina.max` in prose is a mechanism path, resolved against the
instance file that owns it (§10). That is how chapter prose cites a contract
knob, and §1's rule that prose cites the key rather than the value holds over
it unchanged. The typed form `tuning:contracts.<instance>.<knob>` is a
different channel: it is the §4a reference, resolving in the resolved
snapshot, and it is what a generated test block carries (§10.9). Prose cites
bare; the JSON channel cites typed; neither reaches into the other.

`palette` earns its place the same way: a backticked
`` `palette.enemies.fire` `` in prose is a mechanism path, resolved against
`manifest.json`, which is where the palette map lives (§3). It is the format's
first resolving family that does not live in `direction.json`, and
`contracts.*` is the precedent for a family resolved outside that file.

**Resolving a palette citation (normative).** A palette key is dotted and a
color name is a further segment, so one token can be read two ways. The order
is fixed, and it governs both channels: a prose citation and the typed
`palette:` form of §9.5 resolve under exactly these steps.

1. A validator MUST first try **the whole reference text** as a palette key —
   in prose, the token minus its `palette.` first segment; in the typed JSON
   form, the text after `palette:`. If a palette of exactly that key is
   declared, the reference names that palette.
2. Otherwise it MUST split off the last segment and try the remainder as a
   palette key. If that palette is declared and carries a named entry matching
   the last segment, the reference names that one color. When the reference
   text is a single segment the remainder is empty, so this step yields
   nothing and resolution proceeds to step 3.
3. Otherwise the reference is dangling, and a dangling reference is a hard
   failure.

So `` `palette.enemies.fire` `` names the palette and
`` `palette.enemies.fire.flame` `` names one color in it. Where the position
requires a color rather than a palette — a §9.5 `color` field, a §9.5
threshold operand — a reference that resolves at step 1 fails as *names a
palette, not a color* rather than as a dangling reference.

**The collision rule.** A palette key MUST NOT equal another palette's key
plus one of that palette's color names. Declaring `enemies.fire` with a color
named `flame` alongside a palette keyed `enemies.fire.flame` is a validation
failure at declaration, not an ambiguity discovered at citation.

**Array positions are not citation targets**, here as everywhere (§9.9), so
`palette.enemies.fire.2` names nothing: inserting a color into a palette must
never silently re-aim a citation. No special check is needed for it. §3's
grammar admits no all-digit key segment and no all-digit color name, so a
digit tail matches nothing at either step above and the token simply dangles.

Dangling-is-a-hard-failure is what makes the ordinary authoring flow safe.
Type `` `palette.enemies.fire` `` in prose, and a tool that notices the path
does not resolve can offer to create it, with the colors set in a side panel;
naming one color is the same gesture one level down. It is the flow designers
already have for tuning keys. The format does not specify the tool; it
specifies the failure that makes the tool trustworthy. When a package declares
no `palette` map at all, the dangling-citation diagnostic SHOULD name the
revision that reserved the segment, mirroring the tuning-key diagnostic above.

Typed references keep their prefixes in prose. `state:` and `collections:`
(§4a) name ids the designer chose, so no first segment can classify them,
`descriptor:<family>:<id>` (§8a) is always written in full, and `palette:`
(§9.5) is the JSON channel's spelling of a palette citation. A typed reference
is never misread as a prose citation: the classification rule above reads
dotted tokens of word characters, and a token carrying a colon is not one.

**Every reference form, in one place.** This table gathers the format's
reference spellings; each row's cited section states the governing rules, and
the classification order above decides what a prose token is.

| Form | Legal where | Resolves against | Failure behavior |
| --- | --- | --- | --- |
| Bare dotted token, first segment unreserved — `` `hazard.interval_seconds` `` | Chapter prose, inline code | A declared `tuning.json` key | Dangling citation is a hard failure (§4) |
| Dotted token, reserved first segment — `` `mood.rain-glass` ``, `` `contracts.stamina.max` ``, `` `palette.enemies.fire.flame` ``, `` `collections.enemies.gloom-moth` `` | Chapter prose, inline code | The owning file or directory: `direction.json` (§9), `tuning.json` `meta.*` (§4), `invariants.<id>` (§4a) and the `clocks` block (§4b) in `tuning.json`, the contract instance (§10), the `manifest.json` palette map (§3), the `collections/` drawers and their records (§1b) | Dangling is a hard failure; a palette token resolves whole-key first (§4) |
| `tuning:<key>`, including `tuning:contracts.<instance>.<knob>` | JSON channel: §4a expression refs, §9.5 timing entries, generated test blocks | The resolved tuning snapshot (§5) | Dangling reference is a hard failure (§4a) |
| `state:` forms (§4a), including `state:member:ruleset:<id>` | §4a expression refs; keeps its prefix in prose | Declared state ids (§4a); declared rulesets (§2c) | Dangling is a hard failure (§4a) |
| `collections:<drawer>:count` | §4a expression refs; keeps its prefix in prose | The `collections/` drawers (§1b) | Dangling is a hard failure (§4a) |
| `descriptor:<family>:<id>` | Both channels, always written in full | The §8a descriptor families | Dangling is a hard failure (§8a) |
| `palette:<palette-key>.<color-name>` | JSON channel only: §9.5 `color` fields and threshold operands | The `manifest.json` palette map; the position requires a color | Grammar errors fail before resolution; *names a palette, not a color*; dangling is a hard failure (§9.5) |
| Chapter anchor — `<file>.md#<anchor>`, bare `#<anchor>` | §6 test references, §10.7 citations | Heading anchors under §1a's derivation | Unresolvable where the position requires one; banned in fantasy lines (§1a) |
| `> RULESET: <id>` tag; `meta.ruleset` | Prose section tags; `tuning.json` `meta` entries | Declared ruleset ids (§2c) | A dangling tag is a hard failure (§2c) |

Not references, by the same rules: a token whose segments are all digits (a
version string), a token carrying a `json` or `md` segment (a file mention),
a colon-bearing token read as prose (not a dotted citation), and a `#` that
is not preceded by line start or whitespace ("the #1 spot").

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
- `collections:<drawer>:count` → the number of records in a §1b drawer, one
  file per record. The v0.5 spelling, `content:<id>:<pointer>:count`, is
  retired: an expression carrying it is a hard failure that names the
  replacement, since the catalog file its pointer reached into no longer
  exists; and
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
defines it: writing the reference itself in a chapter at the package root
declares it, and the surrounding prose is where the type and the read
timing are stated. A
reference neither path declares does not resolve, and citing it is a hard
failure.

A §2c `ruleset_state` declaration is one such definition. It makes the
`state:member:ruleset:<ruleset-id>` form resolvable: true when the named
ruleset is active.

A drawer record schema's `when` condition reads the row's own fields and
nothing else (§1b); inside a contract, §10.5's `flag` domain also reads
the surface's answers. No other structured-content condition exists in
this version.

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

Every clock MUST declare `unit` as a string. There is no default: no v0.6
declaration site defines a package-wide time unit, so an omitted unit would
leave two tools free to read the same clock differently.

A package that declares clocks gives every replay (§6) exactly one **active
mode** at every point. Modes do not nest or stack. In such a package, every
replay object carries an `initial_mode` string and a `schedule` array. Other
replay entries remain runner-defined under §6.

Those replay schedules use standard mode-transition actions. Each action is a
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

**Two lanes, one file.** Personalization holds two different kinds of
question, and most confusion in this chapter comes from reading them as one:

- **Numeric resolution.** `number` questions with `resolution` operations,
  and `choice` options carrying `tuning_overrides`. These resolve
  mechanically: the same answers always produce the same resolved snapshot,
  and validation checks the machinery end to end. Walked once with the
  `hazard_pace` example below: the builder skips the question, so its
  `default` of `1.2` applies; the `replace` operation writes `1.2` into
  `hazard.interval_seconds`; the value sits inside that key's `meta.range`;
  and the resolved snapshot's `tunables` member carries `1.2`, with every
  constant copied through unchanged. Had an operation instead multiplied a
  base of `2.0` by an answer of `2.0`, the computed `4.0` would clamp to the
  range's top under `out_of_range: "clamp"`, or invalidate the answer under
  `"reject"`.
- **Creative instruction.** `text` questions, and `choice` options without
  overrides. The answer is recorded and the builder interprets it; two
  faithful builds may legitimately differ (§2a). The record proves what was
  asked and answered — not what it changed.

`affects` serves both lanes without joining either: it is an impact index,
the designer's declaration of where to look — never an automatic
transformation. Its shape rules are below.

`personalization.json` carries the questions asked before or while building.
Its top level is a closed object whose one required field is `questions`:

```json
{ "questions": [] }
```

`questions` is an ordered array of question objects, and its order is the
resolution order below. The file is machine-validated against
[personalization.schema.json](https://opengdd.org/schema/core/v0.6/personalization.schema.json).
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
  `> PERSONALIZATION: <id>` prose tag (§2) names.
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
- **`affects`** is optional: a non-empty array of unique package-relative
  paths, each of which MUST exist.
- **`resolution`** is legal only on a `number` question. It is a non-empty
  array of the operations defined below.
- **`notes`** is optional: a string, under the same rule as an option's
  `notes`.

`default` is required because a skipped question with no default has no
defined outcome: nothing would say what the build resolved, and the resolved
snapshot could not be computed. Questions are optional for each build; when
one is skipped, its `default` applies, so every question has an answer either
way.

**`affects` (normative).** It declares which files of the package this
question's answer may influence. When present, it contains at least one path
and does not repeat a path. Each entry is a package-relative path under §1's
normalization rule, and every one MUST resolve to a file that exists; a path
that does not is a hard failure. Those shape and existence rules are the whole
of its machine meaning in this version. It grants no permission and withholds none: it does
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
replacements through `tuning_overrides`. When present, this object contains
at least one entry:

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

The **resolved tuning snapshot** is one object with exactly two flat map
members: `tunables` and `constants`. Its `tunables` member contains every
package tunable after all default or supplied answers are applied; its
`constants` member copies every package constant unchanged. Every unpruned
contract knob joins the member selected by its `kind`, under the key
`contracts.<instance>.<knob>` (§10.11). The full two-member object therefore
contains every runtime number the package exposes through this machinery.
For every `must_match: true` key, the experimental certification protocol
would evaluate the built value against the corresponding value in this
snapshot, never the package default or the declared range (§2d).
`opengdd-build.json` MUST record the answers and the full resolved snapshot.

### Answers outside tuning

Numbers are the whole of what this version resolves by machine. A question
may also reach prose, through a `> PERSONALIZATION: <id>` section tag (§2).
For prose the format defines no machine effect: there is no include,
exclude, or replace semantics, and no selector saying which answer produces
which section. Collection records are Fixed spec data (§1b) and are not a
personalization channel in this version.

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
types. The executing runner is not defined by the core format and belongs to
the experimental protocol. The chapter MUST contain ordered phases. The
conventional order is `core-loop` → `content` → `tuning` → `presentation`
→ `polish`. Each phase lists its scope, chapter references, and
machine-verifiable checkpoints. Phase structure is a prose obligation (§2d):
the format defines no machine grammar for it, and validators do not decide it.

### Acceptance-test types

Acceptance tests are numbered `AT-1 … AT-n`. Their machine-checked shape
grammar: an acceptance test is a Markdown heading, at any heading level,
whose text begins `AT-<n>`. One file is scanned for those headings — the
canonical root build plan `05-build-plan.md` (§§1, 3) — and it MUST carry at
least one.
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

**Choosing the type.** Ask, in order:

1. Does the check read documents or content files, without ever running the
   game? → `document-check`.
2. Does it check one concrete play situation — a given state, an action, an
   expected result? → `scenario`. **This is the default**: most acceptance
   tests are scenarios, and several concrete scenarios beat one abstract
   test for writing, reading, and diagnosing.
3. Does the claim quantify over many inputs — "for every …", "for any
   sampled …"? → `property`.
4. Must the claim hold over every reachable state — an impossibility, a
   minimum, a universal? → `exhaustive-search`, and only `complete: true`
   establishes it.

When in doubt, write a `scenario`.

- **`scenario`** declares Given/When/Then state and action semantics. An
  optional `replay` carries runner-defined replay data; §4b defines additional
  fields only when the package declares clocks.
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
  package-relative files the check reads, where a path ending in `/` names
  a directory — a §1b drawer, whose records are the checked documents;
  `rule_set`, the versioned id of
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
- `document-check`: `artifacts`, an array of package-relative path strings,
  each an existing file or, with a trailing `/`, an existing directory;
  `rule_set`, a string ending in its version suffix, as `opengdd-graph-1`
  does, or an object carrying `id` and `version`; `rules`, an array of rule
  objects written in that grammar; and `diagnostics`, a non-empty array of
  strings.
- Beyond each type's required fields, the optional grants are exactly these.
  `scenario` and `property` blocks MAY carry `diagnostics`, a non-empty
  array of strings; `direction_claims`, a non-empty array of dotted-path
  strings (below); `freeze_invariant`, an object (§4b); `replay`, an object;
  and the expected-observation pair `target`, which takes the observation's
  own JSON type, with `tolerance`, a finite JSON number.
  `exhaustive-search` and `document-check` blocks admit no optional field
  beyond `extensions`; their `diagnostics` (and `document-check`'s `rules`,
  §1c) are required fields of their own shapes.
- `extensions`, optional in every block: an object whose keys are
  package-local kebab-case extension ids and whose values are JSON objects.
  Each key names one package or harness extension and is the namespace for
  everything inside its value. The core format validates the container, key
  grammar, and object-valued entries, but treats each value as opaque and
  assigns no meaning to its nested fields.

Which of these a block MUST carry is stated with the type that carries it;
this list settles the names, not the obligations. A package validator decides
these shapes as far as they are decided at all: where a field takes one type,
it decides that type, and where a field is prose-shaped it decides presence
and non-emptiness, with the string form and the array form equally legal.

A block MUST NOT carry any other top-level field. Package- or harness-owned
data, such as a fixture id or capture handle, is legal only inside
`extensions`; placing it directly beside standard fields is a package
conformance error. The extension ids remain designer-coined identifiers under
§8, but the one-container rule prevents them from colliding with present or
future standard fields.

The list is package-level and closed at the top-level field-name layer.
Test execution semantics are not in it: how a runner reads a `given`, a
`when`, or a `then`, how it plays a `replay` back, and what an observation is
worth remain the experimental certification protocol's (§2d). A package
validator decides which fields are present and whether their shapes are
well-formed; it never runs the check.

Every test feature has exactly one owner (§2d's layers):

| Test feature | Owner |
| --- | --- |
| Block shape, the closed field set, per-type shapes, `direction_claims` resolution and coverage | PACKAGE — the validator decides from bytes |
| Reading `given`/`when`/`then`, playing back `replay`, `target` and observation semantics, schedule execution | Runner — experimental protocol territory (§2d) |
| "The tests passed" | RECORD — the build record's claim, checked for shape and counts (§7) |
| Whether they truly passed, and whether uncited Fixed prose held | AUDIT — the experimental certification audit (§2d, §9.10) |

### Direction-claim citations

A `scenario` or `property` test block that covers a §9 direction claim MUST
carry `direction_claims`. This field is a non-empty array of exact dotted
paths. A **test block** may cite only these claim kinds:

- `constraints.colors.<key>`
- `constraints.thresholds.<key>`
- `constraints.timing.<key>`

All three are `constraints.*` paths, and all three name entries inside
`direction.json`. A palette is not one of them: it is declared material with
no audit class of its own (§3), so a test block never cites it. Palettes are
cited in prose instead, under §4's classification rule, and the two channels
stay separate exactly as they do for contracts.

Pillars, mood entries, anti-references, and `must_keep` entries are never
cited by a test block. They are scored directly against the finished build
under §9.10.

Direction-claim completeness:

1. Every path in `direction_claims` MUST resolve to a declared
   `direction.json` entry. A dangling citation is a hard failure.
2. Every `constraints.*` entry MUST be named by at least one AT's
   `direction_claims`. All `constraints.*` entries are fixed observational
   `checked` claims under §9.10. An entry covered by no AT is a validation
   failure.

An AT that carries `direction_claims` MUST NOT restate the cited claim's
value or scope. The §9.5 single-source rule extends to this field, with one
checked-mirror exception. A claim whose
`scope.sampling.sampled.verdict` carries `aggregate` MUST be covered by a
`property` AT with `verdict: "aggregate"`; a scenario or per-sample property
does not cover it. The test retains the `metric`, `aggregation`, and
`threshold` fields that its §6 aggregate-property shape requires. The test's
`metric` and `aggregation` strings MUST equal the cited claim's strings, and
its `threshold` MUST carry the same `op` and a numerically equal `value`. A
single test may cover more than one sampled-aggregate claim only when all of
their mirrored values match. The mirror does not become the authority: the
claim remains authored in `direction.json`.

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


At package conformance, `replay`, when present, is an object. A `tolerance`
without an expected `target` is invalid. When the package declares clocks,
§4b additionally requires `initial_mode` and a `schedule` array and decides
every standard action's shape and preconditions.

The remainder is an **experimental certification obligation**, not a package
conformance check. Because this version deliberately leaves other replay
entries runner-defined, the certification audit confirms that every path the
runner treats as replay input is package-relative, that replay input carried
as structured content is declared through §1b, and that every `target` is
grounded in an input or schedule the runner actually supplies. A package
validator does not infer those meanings from opaque replay entries or require
a particular runner-owned carrier.

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
- **Nothing may point into it.** No reference of any kind — a chapter
  anchor, a contract citation (§10.7) — may target a generated
  test or an anchor inside the block. A generated test's existence depends on
  the answers, so change one and the target can legally vanish; a stable name
  is still not a stable target.

A core knows nothing of its adopting package's direction claims, so no
generated test carries `direction_claims`. Covering a `constraints.*` entry
(§9.10) stays the package's own work.

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
would audit, and the core format defines no normative certification outcome for it. The
file is machine-validated
against [opengdd-build.schema.json](https://opengdd.org/schema/core/v0.6/opengdd-build.schema.json).

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
  (§10.11). `constants` is an empty object only when neither the package nor
  any live contract surface declares a constant.
- **`evidence`**: the test-run record. Its required fields are:
  - `algorithm`. The only value currently defined is `"sha256"`.
  - `result_hash`.
  - `payload`, with `covers` and `file`. `covers` states in plain words which
    artifacts the hash covers. `file` is a package-relative path to the
    canonical payload bytes covered by the hash.
  - `acceptance`, with `passed` and `total` counts.

  Two further fields are conditionally required when the source package is
  available:

  - `runner`, a closed object with non-empty `id` and `version` strings. It
    names the runner profile relative to which the result is true. It is
    required when any source acceptance test is `scenario`, `property`, or
    `exhaustive-search`, or when a block carries `replay`, `target`, or
    `direction_claims`. A package containing only `document-check` tests may
    omit it.
  - `direction_observations`, one closed `{ claim, context }` object for every
    observational `constraints.*` claim declared by the source
    `direction.json`. `claim` is its exact dotted path and `context` is a
    non-empty plain-language account of what was observed. The array is absent
    when the source declares no such claims.

Canonicalization follows the conformance certification protocol published at
`conformance/CERTIFICATION.md` in the OpenGDD conformance suite (§2d).
The standalone record check validates the evidence shapes it can see.
Source-backed record validation additionally decides the conditional runner,
observation, and test-count rules below. `payload.file` is checked as a
package-relative path shape, not for existence.
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
   The validator MUST compute the complete expected snapshot from the source
   package, the recorded answers, and the live contract surfaces, then require
   every recorded value to equal its expected value. The `tunables` member is
   produced by the §5 resolution pipeline; the `constants` member copies
   source package and live `kind: constant` contract values unchanged. Every
   tunable value remains inside its declared range. A recorded answer whose
   resolution reaches an
   `out_of_range: "reject"` operation with a computed value outside the target
   key's range does not resolve, and the record does not conform (§5).
5. `acceptance.total` equals the package's enumerated AT count: its game-local
   acceptance tests, plus its generated ones after liveness and per-row
   expansion (§§6, 10.10).
6. A conforming build has `acceptance.passed == acceptance.total`.
7. When the source test set contains any runtime test named above,
   `evidence.runner` is present. Its identity makes results attributable; the
   core does not interpret the named profile or claim that two profiles are
   equivalent.
8. `evidence.direction_observations`, when required, names every declared
   `constraints.colors.*`, `constraints.thresholds.*`, and
   `constraints.timing.*` claim exactly once, names no other claim, and gives
   each a non-empty observation context (§9.10).

Checks 1–8 are the core set, not the whole set. The direction-result
presence, path, and subset rules of §9.10 are validator-level
package-consistency checks of the same rank, and §2d's build-record
conformance includes them. So is one contract rule: every live
core invariant is re-evaluated over the resolved snapshot, because an override
that is legal for its own key can still break a rule between two knobs that no
per-key range can see (§10.8).
Validators report divergence in checks 1–8 and in the direction-result rules
as errors. A check-6 shortfall is an error against build conformance rather
than a complaint about the file (§2d); it does not conflict with honest
reporting, because the shipped record is a completion claim, and a build
still failing tests reports through §2b ambiguity reports rather than a
build record.

`opengdd-build.json` MAY copy the source manifest's `commerce` profile. When it
does, the source manifest MUST carry that profile and the copy MUST be
verbatim, including `derived_from` when present. Omitting the optional copy
has no conformance consequence, and nothing in the experimental certification
protocol depends on commerce metadata.

### Optional renderer declaration

`opengdd-build.json` MAY include `renderer`: a free-text string naming the
rendering technique the build used, such as `"three.js 0.185.1, WebGL"`.
The renderer is the builder's fact, never the spec's: §3's `platform` names
the state space a design is responsible for, and two builds of one spec may
declare different renderers. The declaration is informative in this version: the
`web-1` capture recipe does not read it, and recipe selection stays with
`capture_profile.type`.

### Optional capture profile

`opengdd-build.json` MAY include `capture_profile`. It records the capture
adapter and serving or run recipe that produced the captures:
`{ "id": <string>, "type": <string> }`.

`type` is a closed, versioned enum. This version defines one value: `"web-1"`. It
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

`capture_profile` and `evidence.runner` answer different questions. The first
names a capture recipe; the second names the runner that interpreted runtime
acceptance tests. One does not substitute for the other, although a build may
use the same implementation behind both declarations.

Cross-profile equivalence claims and a registry of types beyond `"web-1"`
are outside this version; a future adapter earns a new enum value through an
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

In this version, `hash` MUST cover exactly one file's bytes. A multi-file kit, source
tree, or tool installation MUST be packaged into one archive, such as a
`.zip`, before hashing. The format defines no directory or tree-hash
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

`direction_result` carries the §9.10 judged-gate record, and §9.10 owns its
shape and validity rules. It is present exactly when the source spec's
`direction.json` declares at least one judged claim, and MUST be absent
otherwise. The presence rule and §9.10's path and subset rules require a
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
  solver, and the format standardizes no solver adapter, so the citing package
  supplies one (below). The insight is Fixed. Its decoration is Delegated.

### Grid-layout encoding family: `parallel-string-layers-1` (normative)

This version defines one named, buildable member of the still-open grid-encoding
family: the flat, single-cell `parallel-string-layers-1` encoding. Two
independent grid-puzzle instances converged on this layout shape. They did not
converge on a solver-adapter interface or predicate vocabulary, so those parts
remain open below.

A §1b drawer declares this encoding through its record schema (decision
33): a field of type `grid` is one layer, and the schema's grid fields are
the layer set. A single-layer grid — one field holding the whole board — is
the commonest case and declares one grid field. A validator reads exactly
the grid-typed fields; no other field is a layer, whatever its shape, and
generic tools discover layers from the schema, not from game prose:

```json
{
  "record": {
    "terrain": { "type": "grid", "required": true,
      "description": "walls and floor: `#` is wall, `.` is floor" },
    "entities": { "type": "grid", "required": true,
      "description": "what stands where: `-` is empty, `o` is a stone" }
  }
}
```

The cell unit is fixed by the format: a row's column count is its length in
Unicode scalar values, or code points. UTF-16 code units and grapheme
clusters are not the measurement. A surrogate-pair emoji is one cell. A
combining-mark sequence occupies as many cells as it contains scalar
values. (An earlier draft carried this as a mandatory `cell_unit` field
with exactly one legal value; a field that can only say one thing is the
format's to say.)

A grid field's presence and string-array shape are the record schema's
rules (§1b). The grids a record does carry MUST be non-empty and congruent
with one another:

- Row count, the array length, MUST be at least 1.
- Every row's column count, measured in scalar values, MUST be at least 1.
- Row count and every row's column count MUST be identical within each grid
  field and across all grid fields of the record.

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

The grid field's schema `description` owns the per-cell glyph vocabulary —
what `#` marks is how the field is read, and field-level reading lives in
the schema (§1b), written once. The game's own chapters keep the rest in
the game's own words:

- overlap rules;
- entity footprints;
- terrain semantics; and
- the win predicate.

The core encoding fixes the grid shape and layer set; the schema
description names the glyphs; the game's prose gives the rules their
meaning. This encoding declares no solver adapter
or replay grammar. Until those are standardized, a citing collection defines its own
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
identifier, and so is a field a collection's record schema names or its
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
a collection's record schema or prose names is one identifier, no matter how
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
tools and audits act on the descriptor directly: for example, anti-references
can feed judges, an annotated reference names exactly what a build may borrow,
and behaviors can become rubric lines.

A descriptor family is a keyed map whose entry shape and semantics the format
owns. Designer-defined shapes are §1b collections: their record fields are the
designer's, named by a record schema or by prose. A
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

`mood` is the first descriptor family, not a special case (§8a). This version defines
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
  "palette": "spells.dark",
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
  field is fixes it (§9.10) — and the validator checks only that `intent` is
  present.
- **`references`** is optional. It uses the §9.3 `annotatedReference` shape
  verbatim. Every entry names the borrowed property; an unannotated reference
  is invalid.
- **`anti`** is required and has `minItems: 1`. A mood descriptor without an
  anti-reference is a hard failure. The required negative space prevents the
  reference from silently defining the whole target.
- **`palette`** is optional. When present it is a string holding the bare key
  of one palette declared in `manifest.json` (§3) — `"spells.dark"`, never
  `"palette.spells.dark"` — following the format's bare-key convention for
  JSON cross-references (§9.9). It names the colors this mood is built out
  of, and nothing more: no tolerance, no scope, and no other
  constraint machinery appears in a mood. That machinery has one home,
  `constraints.colors` (§9.5), because one color makes different promises in
  different places.

  The value is resolved by direct lookup in the manifest's `palette` map,
  never by §4's two-step resolution order. That order exists for citations,
  which carry the palette-or-color ambiguity; this field is documented as
  naming a palette, so there is nothing to disambiguate. A value that is not a
  declared palette key is dangling and a hard failure, including the case
  where §4's order would have read it as a color: `"palette": "enemies.fire"`
  with no `enemies.fire` declared is dangling even if a palette `enemies`
  carries a color named `fire`. A tool MAY offer near misses, that reading
  among them, but a suggestion is tooling and does not change the verdict.

  Inline palettes are illegal. An inline array would have no name, so nothing
  could cite it, and the artifact would be invisible to the tooling that makes
  palettes worth having.
- **`behaviors`** is optional. It binds game events to this mood becoming
  active or inactive. Each entry contains:
  - `trigger`: a prose-bound game-state condition, under the same
    authority-prose discipline as §9.5 scope prose;
  - `response`: exactly `"this mood becomes active"` or `"this mood becomes
    inactive"`; and
  - optionally, `timing.max_latency_ms`.

  Any other response belongs to a §9 direction-block construct. Mood behavior
  is not a general event-response language.

### Prose citations (normative)

A mood descriptor is referenced from Fixed or Delegated chapter prose anywhere
in the package by the exact inline code token
`` `descriptor:mood:<id>` ``. A descriptor reference in prose always carries
this family-qualified `descriptor:<family>:<id>` form. Prose citation is not
one uniform spelling across the format: a tuning key is cited bare under §4's
classification rule, while `state:` and `collections:` (§4a) keep their prefixes.

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

Copying visual content that the reference does not annotate is not stronger
compliance. When an experimental panel assesses a judged claim that cites the
reference, such copying is an adverse audit finding. It does not independently
fail package or build-record conformance. All unannotated content, including
the source's exact appearance, remains open.

Only pinned assets at the §9.8 **exact** precision level bind exactly. When
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
  `webp`. These are the only media formats this version defines; audio
  direction remains excluded (§11).

The format defines no numeric media-size conformance limit. Validators MUST NOT
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
entry by its dotted path (`viewing.<key>`, `references.<key>`, `constraints.colors.<key>`).
A JSON field that names such an entry always holds the bare `<key>` alone —
`"viewing": "dusk-panel"`, never `"viewing": "viewing.dusk-panel"`.

**The whole path, once.** The smallest complete exact-color claim crosses
four files, in this order:

1. The color exists in one place: `manifest.json` declares the palette
   `enemies.fire` carrying the color `flame` (§3). No other file holds a hex.
2. The claim lives in `direction.json`:
   `constraints.colors.light-flame` references the color as
   `"palette:enemies.fire.flame"`, sets `tolerance: 0`, and scopes what
   wears it and when (§9.5).
3. The prose half opens `04-presentation.md`: the `direction` fence states
   the intent and cites the entry by its dotted path. Fence and file pair
   or neither is legal.
4. A §6 acceptance test in `05-build-plan.md` cites the claim in
   `direction_claims`. The claim is now covered: validation checks that
   every link above resolves, the build record's passing test asserts the
   captured color matched at ΔE00 = 0, and the experimental audit is what
   would check that assertion against reality.

Every direction mechanism in this chapter is an elaboration of that path.

**Where each piece lives and who checks it:**

| Piece | Declared in | Cited by | Package check | Beyond the package |
| --- | --- | --- | --- | --- |
| Color value | `manifest.json` palette (§3) | `palette:` references | Key and name grammar; references resolve | — |
| Claim | `direction.json` `constraints` (§9.5) | Prose dotted path; test `direction_claims` | Closed shape; typed reference resolves; tolerance rules | — |
| Intent prose | `04-presentation.md` fence | — | Fence–file pairing; fence grammar | `judged` and `advisory` content reads to the audit |
| Covering test | `05-build-plan.md` test block (§6) | `direction_claims` dotted paths | Citation resolves to a declared claim; block shape | Runner executes; audit reviews evidence |
| Build outcome | `opengdd-build.json` (§7, §9.10) | — | Record check: shape and package consistency | Audit checks the assertion's truth |

**Design principles (normative).**

1. **Constrain, and leave open.** Every construct states both what it
   constrains and what remains open to interpretation. A construct that
   leaves nothing open is a pinned value at the §9.8 **exact** precision
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
   is a validation failure. Nothing outside a claim's own shape can move it.
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
`advisory`, because it is eligible for panel scoring under the experimental
audit. The required `viewing` field identifies the evaluation context for any
such score. The optional `references` field supplies the §9.3
claim-to-reference edge.

`tie_break_order` says which pillar prevails when two of them pull against
each other: the lower value wins. Equal values, or a pillar that declares
none, leave the tie to the panel, reading the entries' own statements under
their bound viewing context. It is §2a's tie-break discipline applied to
pillars.

Pillars leave every asset-level choice open. When an assessment is attempted,
the panel scores whether the build's choices advance them under the named
viewing context.

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
the context in which an experimental panel would score the mood citation.

The entry leaves open the observable means, degree, and local reading that the
descriptor's `intent`, `references`, and `anti` do not already pin. A
descriptor's `palette` pins nothing on its own: it names the colors the mood
is built out of, and the promises about them, if any, are color constraints
(§9.5).

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
Every unnamed property and the synthesis remain open; copying outside the
annotation has the experimental audit consequence defined in §8a, not an
independent package- or build-record-conformance consequence. A reference
carries no audit class of its own. Its annotation is a structural consequence
of schema validity.

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
panel-facing documentation of what a mechanical test would check, but the core
format defines no execution route for it. It never changes or elevates the audit
class. Promoting it requires a future revision. The required `viewing` field
names the context in which an experimental panel would score the entry.

The §8a media-packaging rule also applies here. An anti-reference MAY attach
`media`, such as a labeled "not this" board.

### 9.5 Constraint core (`constraints`)

*For designers who need an exact color, contrast, or timing — and for the tool authors who check them.*

The constraint core is the mechanically checkable floor: the part of the
direction a machine can check by measurement. Runtime numeric authority
remains in `tuning.json` under §4; `direction.json` never restates a runtime
number.

`constraints` is itself a closed object: it contains at least one of
`colors`, `thresholds`, or `timing`, and no other field is legal. Each
present field is in turn a closed object containing one or more entries,
keyed by stable kebab-case ids.

#### Color constraints (`colors`)

A color constraint, such as `colors.light-flame`, is a promise about one
declared color: what wears it, when the promise holds, and how close a build
must stay to it. The color itself lives in a palette (§3); the constraint adds
the claim.

```json
"constraints": {
  "colors": {
    "light-flame": {
      "color": "palette:enemies.fire.flame",
      "tolerance": 14,
      "scope": {
        "applies_to": "the lantern flame and its cast light",
        "states": ["in-play"],
        "sampling": "exhaustive"
      }
    }
  }
}
```

A color constraint is a closed object (no field beyond these three is legal)
containing:

- `color`: required, a typed reference to one **named** palette entry, written
  `palette:<palette-key>.<color-name>`. The referenced palette MUST be
  declared in `manifest.json` (§3) and MUST carry a color of that name. A
  dangling `color` is a hard failure, and a reference that names a palette
  rather than a color fails as *names a palette, not a color* (§4);
- `tolerance`: required, a number greater than or equal to zero;
- `scope`: required, using the shared shape below.

A constraint never carries a hex of its own, and there is no raw-hex escape: a
deliberately off-palette accent, or a bag of one-off pinned colors, is just
another palette. Colors live in one place, so a build's palette cannot drift
from the one the spec declares.

`palette:` is the JSON channel's spelling, matching the `tuning:` form the
timing entries below use: prose cites bare and with dots, the JSON channel
cites typed and with a colon, and the typed form is used exactly where a
reference crosses files. It is a grammar rather than a template — `palette:`,
a palette key, a dot, a color name — and because a key may itself contain dots
while a name may not, the split point is decided by §4's resolution order and
not by counting dots. Each of the following is a validation failure raised
before resolution is attempted, and its diagnostic is a grammar error rather
than a dangling reference: no `palette:` prefix at all, whether a bare dotted
path or a leftover raw hex; no dot after the prefix (`palette:a`); an empty
key part (`palette:.flame`); an empty name part (`palette:a.`); any whitespace
anywhere in the value; the prose spelling written into a `color` field
(`palette.a.b`), which the JSON channel does not accept; and any character
outside the key and color-name grammars of §3.

`tolerance` is a CIEDE2000 (ΔE00) radius around the referenced color, computed
in CIELAB D65 after sRGB decoding. `tolerance: 0` makes the constraint exact.
The acceptance test that covers the claim verifies it at that tolerance
(§9.8).

A color constraint says which declared color applies, how close a build must
stay to it, and where the claim holds. It leaves distribution and harmony open
for judgment through pillars and mood.

Tolerance and scope stay on the constraint rather than on the palette entry,
because the relationship runs one color to many promises: the same flame is a
candle at tolerance 14 in one place and a lantern pinned at 0 in another.
Neither moves onto the covering test either, which would let the proof author
shrink the promise invisibly (§6).

#### Perceptual thresholds (`thresholds`)

A threshold, such as `thresholds.actor-vs-background`, is a closed object
(exactly these six fields) containing:

- `colors`: required, always an array with at least one element. Each element
  is a typed `palette:<palette-key>.<color-name>` reference in the form above
  — `["palette:enemies.fire.flame"]`, never a bare key and never the prose
  spelling `"palette.enemies.fire.flame"` — and each MUST resolve to a
  **named** color. A reference that names a palette rather than a color fails
  as *names a palette, not a color* rather than as a dangling reference;
- `against`: required, one typed reference under exactly the same rule;
- `min_contrast`: required, a number greater than zero;
- `metric`: required, a string that MUST appear in `semantics.metrics`
  (`semantics` sits at the direction file's root, not inside `constraints`; it is
  defined at the end of this section);
- `viewing`: required, holding the bare key of one `viewing` entry (the
  field value is `"dusk-panel"`, never `"viewing.dusk-panel"`); and
- `scope`: required.

A threshold constrains measurable separation and leaves form open. Its
operands are palette colors rather than sibling constraint entries, so naming
a color as an operand places no coverage obligation on that color: the
threshold's own covering acceptance test proves the contrast claim (§6), and a
designer who wants an operand's value independently held writes a color
constraint for it.

#### Timing constraints (`timing`)

Timing entries cover exact runtime values. An entry such as
`timing.dash-recovery` contains only a required `key` in the §4a
`tuning:<dotted-key>` form and a required `scope`.

The numeric parameter MUST live in `tuning.json`, where the designer owns it.
The direction file does not repeat the number. The verified proposition is
that rendered event timing matches the resolved tuning value over the declared
domain. The core format defines no universal numeric window for "matches"; the covering
acceptance test's §6 procedure states how the match is checked, and that
procedure is what the experimental certification protocol would audit.

No constraint entry may carry an audit class of its own — the closed shapes
above exclude one, so writing one fails validation. Every color, threshold, and
timing entry has the fixed audit class observational `checked` (§9.10); none
has a `judged` or `advisory` reading.

#### Scope (normative)

Every constraint-core claim has a `scope`; this shape does not apply to
`viewing` entries. The scope owns the claim's applicability domain and proof
obligation:

- `applies_to`: required, non-empty prose identifying the player-visible
  instances the claim covers;
- `states`: required, with at least one named game state in which the claim
  holds. Each state is a non-empty free-form string; the format declares no
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

Aggregate fields are authoritative in `direction.json`. A covering `property`
test uses `verdict: "aggregate"`, retains the `metric`, `aggregation`, and
`threshold` fields required by §6, and MUST mirror the cited claim exactly
under §6's checked-mirror rule. That duplication is a consistency check, not a
second source of authority.

The covering replay MUST reach every state named by `scope.states`. It MUST
NOT narrow what the claim applies to, the states, or the proof obligation.
The package validator cannot decide replay reach (above), so this obligation
is delegated to the covering acceptance test's §6 procedure; nothing else in
this version checks it. A narrower replay, or a sampled result presented as
exhaustive proof, does not discharge it. The acceptance test cites the
`direction.json` key, such as `constraints.colors.<key>`, and MUST NOT
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
  tolerance-math id (not an array). This version defines
  `"ciede2000-lab-d65-v1"`;
  and
- `metrics`: required, an array with at least one versioned metric id.
  This version defines `"wcag21-contrast-ratio"`.

The registry is closed: this version recognizes no other ids, and an
unrecognized id in `semantics.tolerance` or `semantics.metrics` fails schema validation.
Separately from that closed registry, one cross-check applies: every
`thresholds.*.metric` value MUST appear in `semantics.metrics`. The
`aggregate.metric` inside a `sampling` verdict rule is subject to neither
rule — that field remains a free-form string naming the sampled measurement.

#### Designer-side consistency (normative)

Package validation MUST compute each threshold over every pair (`c`,
`against`) for each `c` in `colors`, at the values the referenced palette
colors declare, and confirm that every pair passes the threshold. Tolerance
never enters: the check reads declared values, and a `constraints.colors`
entry that separately binds one of those colors does not widen it. Each
failing pair is its own diagnostic. The check runs whether or not the operand
colors are otherwise constrained. A package whose declared colors break its
own threshold is a hard failure.

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
  arc matters to a claim that cites this entry; the format defines no machine
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
preserve. Examples include a silhouette rule, what a signal color means, or a
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
required `viewing` field names the context in which an experimental panel
would score the entry when an assessment is attempted.

### 9.8 Authority, precision, and boundary rules

*For designers. It says how precise you may get, and what each level costs you.*

**Authority.** The direction block has Delegated authority, as design
principle 2 states: the builder decides how to realize it within the stated
intent and constraints. An `advisory` claim is Delegated intent. It guides
interpretation and tie-breaks in the same way as fantasy-block prose and
carries no conformance constraint.

If a direction claim conflicts with a Fixed statement elsewhere in
`04-presentation.md`, the Fixed statement wins. The conflict is an authoring
error. The format does not permit `> PERSONALIZATION:` tags inside the
direction fence. Personalized direction is a recorded KNOWN-LIMITATIONS item.

**Precision levels.** Anything a player can see may be written down at one
of three precisions:

- **described** — plain prose direction. This is the default, and most of a
  direction block stays here. It carries no measurement.
- **bounded** — a constraint with a stated tolerance, such as a color
  constraint with `tolerance: 8`. Its obligation is the observational
  `checked` claim §9.5 defines, discharged by its covering acceptance test.
- **exact** — a constraint written with `tolerance: 0`. Every
  builder must reproduce the declared value exactly.

Every visible thing may be **described**; that level is always available.
**Bounded** and **exact** are defined today for color entries, and the
ladder of three levels is the pattern future areas adopt as their own
mechanisms arrive. A designer may move a claim to a more precise level
wherever the level is defined. Each level up carries the obligation listed
with it; nothing forces a claim to move.

An exact color constraint is a color pin. Like every other observational
`checked` claim, it is audited through the acceptance test that cites it in
`direction_claims` (§6). A pinned area should have been tested by the designer
against a build. That is an authoring obligation carried by the designer, and
discharged in the spec's own revision history; the §2b lifecycle stages
advance only as far as the experimental protocol does, and this version
defines no per-build machine check for that authoring history.

Color constraints carry no `must_match` field. §4's `tuning.json`
`meta.must_match` remains the separate mechanism for requiring a build to
reproduce a resolved tuning value exactly.

**How each area is proved:**

- A `must_match` tuning key is proved by comparing runtime consumption with
  the resolved snapshot (§4).
- Fixed prose and structured content are proved by acceptance tests, and by
  the experimental protocol's intended audit of Fixed statements.
- An exact color constraint is verified through the acceptance test that
  cites its claim in `direction_claims` (§6): the captured value is checked
  at ΔE00 = 0 against the declared value, which is the one the constraint's
  `color` reference reaches in the palette (§3).

An area with no existing proof mechanism is recorded as a
KNOWN-LIMITATIONS item. The format promises nothing about auditing that
area.

Everything left at the **described** level is interpretation space where two
faithful builds may differ.

**Soft boundary, hard mechanism.** No rule limits how precise a spec may
get. The only hard boundaries are that pinned values bind absolutely and that
nothing left open may contradict the specification.

### 9.9 The direction file: `direction.json`

*For tool authors. Designers: your editor writes this file for you.*

`direction.json` is a single optional JSON file. Its package-relative path is
declared by the bare `direction` field inside the `build` object in
`manifest.json`, as in `"build": { "direction": "direction.json" }`. The
file is machine-validated against
[direction.schema.json](https://opengdd.org/schema/core/v0.6/direction.schema.json).

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
`constraints.colors.light-flame`. Array positions cannot be citation targets.

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
   `constraints.colors.<key>`, `constraints.thresholds.<key>`, or
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

### 9.10 Audit hooks and the certification gate

*For auditors and tool authors. Designers: one rule reaches you — every constraint needs a covering acceptance test (§6).*

The `checked` audit class means that a machine or a replay verifies the
claim. This version has two disjoint kinds of `checked` coverage:

- **Structural facts.** These are facts inherent in `direction.json`
  validating against its schema, together with §9.9's per-entry fence
  completeness. They include reference, viewing, and may-vary-axis
  completeness, and `direction.json`, scope, and key validity. The validator
  or a `document-check` test verifies these package facts without running the
  game. They require no capture.
- **Observational `checked` claims.** These are the `constraints.colors.*`,
  `constraints.thresholds.*`, and `constraints.timing.*` entries. Their closed
  JSON shapes carry no audit-class field. A `constraints.*` entry's kind fixes
  its class, and the class is never written down.

Every `constraints.*` claim is covered by an acceptance test that cites it in
`direction_claims`. §6 owns that rule and states it once; a claim no test
cites is a validation failure there.

A source-backed build record also carries
`evidence.direction_observations`, with exactly one `{ claim, context }`
entry for every declared `constraints.*` claim. `claim` is the same exact
dotted path used by `direction_claims`; `context` is a non-empty
plain-language account of the state, subject, capture, or measurement context
the runner actually observed. Duplicate, dangling, missing, or unexpected
entries are build-record conformance failures. The context remains evidence
metadata, not a second declaration of the claim's value or scope.

Because the tests covering these claims use runner-owned runtime and
observation semantics, §7 also requires the build evidence to name that
runner's `id` and `version`. The core does not standardize an engine or infer
equivalence between runner versions. These two fields make a result
attributable; the experimental audit still decides whether the observation
really satisfied the claim.

What a validator decides is the citation's presence. The cited forms are
`constraints.colors.<key>`, `constraints.thresholds.<key>`, and
`constraints.timing.<key>`;
these are full dotted paths rather than bare
keys. In every form, `<key>` matches
`^[a-z0-9]+(-[a-z0-9]+)*$`. Whether the citing test's procedure captures the
claim over the domain `direction.json` declares — reaching every state named
in its `scope.states` — is not decidable from package bytes. That remainder is
an obligation of the experimental certification protocol (§2d): the §6
procedure is what reaches those states, and the protocol is what audits that
it did (§9.5).

Judged claims require no capture. When an assessment is attempted, an
experimental panel scores each attempted claim directly against the finished
build under the claim's bound `viewing` context.

**The judged gate.** The complete set of `judged` claim paths is
`pillars.*`, `mood.*`, `anti.*`, and `must_keep.*` (§§9.1, 9.2, 9.4, and
9.7). An assessment considers every attempted claim under its
bound `viewing` context (§9.6). The build record records assessment coverage
and results, but does not standardize panel composition, scoring, or an overall adherence
finding. The gate belongs to the experimental certification path (§2d): it
defines no pass/fail outcome, empty `assessed` and `adherent` arrays
are the legal record of a run with no assessment, and no core conformance or
certification outcome turns on the gate's contents beyond the validity rules
stated here.

`direction_result` is the build's JSON record for this gate. It is a closed
object in `opengdd-build.json`. Its only legal field name is `judged`.

The `direction_result` object is present exactly when the source spec's
`direction.json` declares at least one judged claim. It MUST be absent
otherwise.

- **`judged`.** This field is required. It is a closed object with exactly
  three required fields: `status`, `assessed`, and `adherent`.
  `status` is the string `"pending"`, the sole value currently defined. No
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
observational class `checked`; the one construct whose fixed
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
A collection's record schema is its label's one field (§1b), and what the
manifest names for the builder are entry points (§3); neither is called a
contract.

Adopting one means copying a core into `contracts/<name>.json` unchanged and
writing the surface underneath — answers, knob values, test inputs, and any
declared rows (§§10.2, 10.6, 10.7).

**The smallest adoption, once.** The ordinary path, complete:

1. Copy a core — say `health-1` — unchanged into `contracts/hull.json`. The
   file's presence is the declaration; nothing registers it (§10.2).
2. Answer its questions in the surface underneath the copy: one option per
   live question, `not-applicable` where the core offers it being an answer
   rather than a silence (§10.8).
3. Give each knob its number, inside the core's declared range (§10.6).
4. Supply the test inputs the core asks this game for (§10.6).
5. Regenerate: the instantiated tests land at the end of the build plan
   inside the instance's marker pair (§10.10), and validation checks every
   link — answers against options, knobs against ranges, generated bytes
   against the templates.

That is the whole ordinary path. Rows (§10.7) exist only when an adopted
core binds a collection; conditional liveness (§10.8) only when a core
declares conditions; placeholders and the template grammar (§10.9) are
core-author and tool-author material an adopting designer never writes.

*Non-normative, and the reason a contract stays small.* A contract is as big
as one thing an experienced designer would call "standard X", and no bigger.
Four questions decide a candidate: a mechanism rather than a value or a piece
of content; described near-identically by two unrelated designers, except for
parameters; acceptance tests meaningful without knowing the rest of the game;
one seam wide, rather than a genre bundled up. What fails them is written as
prose, not adopted as a contract. No validator decides any of this; the
format owns the envelope, never the content (§10.13).

*Non-normative, for core authors.* Give one observable fact to one question.
When two questions touch the same fact, state how their answers compose rather
than letting both answers define it independently. A redundant, ineffective,
or even unplayable combination may still be an explicit design; that is not a
conflict for the format to prevent. Two answers that make incompatible claims
about the same behaviour are instead an authoring defect in the core. The
format does not attempt to discover that defect through semantic review
(§10.13).

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
`conformance/CERTIFICATION.md`; no core build-record field carries it.

### 10.4 The instance file

An instance file's top-level fields are exactly:

- **`format`** (string, required): `opengdd-contract-instance-1`.
- **`instance`** (string, required): the instance id, equal to the filename
  minus `.json` (§10.2).
- **`core`** (object, required): the vendored core (§10.5).
- **`surface`** (object, required): this game's answers (§10.6).
- **`rows`** (object, optional): inline collection rows (§10.7).
- **`about`** (non-empty string, optional): a hand-written introduction to this
  instance in the designer's voice — what this thing is in this game, and
  what lies outside the contract. Presentation only: tools display it, but no
  behavioural, liveness, or instantiation check uses its content, and it is
  neither interpolated nor rendered into the generated block (§10.10).

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
`^[a-z0-9]+(-[a-z0-9]+)*$`, §9.10's segment grammar. All of them are therefore
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
  `section` (non-empty string, optional — a display heading for this question);
  `options` (array, required, non-empty), each entry carrying `id` (kebab,
  required, unique within the flag), `semantics` (string, required — what
  choosing it means, precisely enough to build against), an optional
  `meaning` (non-empty string — the same choice in the designer's voice), and an
  optional `rationale`. Optional per flag: `default_guidance` (string; SHOULD
  name an option id where one fits), `rationale` (string), and `when` (the
  condition above, `flag` domain only). The legal values of `answers.<flag>` are exactly
  the option ids. The option id **`not-applicable` is reserved**: listing it
  is how a core permits "this design has no such mechanism", and its
  `semantics` says what that absence means. A constitutive flag simply omits
  it — health with no defined at-zero event is not a smaller health system, it
  is not health — and the flag's `rationale` is where the why-no-escape
  reasoning lives. The dependency graph the `flag` conditions induce over
  flags MUST be acyclic.

`section` has no machine meaning beyond display. It changes no answer, contract
behaviour, liveness, test instantiation, or instance-file shape. The
`decisions` array remains the question order. A catalogue or authoring tool
MUST use authored section strings when present, grouping only consecutive
questions carrying the same string under one heading, and MUST fall back to
one flat question list when no decision carries `section`. It MUST NOT infer a
section from a flag name or question wording. If a core uses sections, its
author SHOULD put one on every question and SHOULD keep every section in one
continuous block; a tool never merges separated blocks with the same heading.

`meaning` is the designer's voice for an option; `semantics` remains the
contract. Written well, a `meaning` is example-shaped and plain — concrete
numbers over variables, the option's consequence over its algorithm. A tool
presenting options to a designer SHOULD lead with `meaning` where present,
keeping `semantics` one gesture away, and MUST NOT treat `meaning` as
behavioural authority: where the two texts disagree, `semantics` binds and the
disagreement is an authoring defect to fix, not a choice to interpret.
`meaning` remains part of the closed core and therefore counts for core
identity and the core digest (§§10.2–10.3). A core intended for publication
SHOULD carry `meaning` on every option.
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

Contract knob meta carries no §2c `ruleset` field in this version. A knob is one
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

This is the one record-schema grammar the format has, and §1b's drawer
labels write their `record` schemas in it too, each side with one dialect:
`citation` and the `flag` domain are this layer's, since both read a
contract instance's context, and `grid` is §1b's, since it reads record
files. A grammar written twice would drift; a dialect is a stated
difference.

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
vendored core declares MUST be bound by exactly one entry of the instance
file's own top-level `rows` object, keyed by the schema name, whose value is
one of two forms:

1. an array of rows, written inline; or
2. a row source, the string `collections/<drawer>`, naming a §1b drawer
   whose records are the rows. Each record's `id` is its filename; the
   record file itself MUST NOT carry a top-level `id`, because that fact is
   already written once.

An unbound schema is a validation failure, never a silent zero-expansion. A
schema bound twice is unspellable: the instance file is the one binding
site, and its `rows` keys are unique. An empty bound drawer is legal and
declares "none of these". Inline rows are legal at any size; which home a
list wants is a question for the guides — a drawer when it is big enough to
be its own artifact, or when other parts of the spec reference its records
— and never a validator's business.

A drawer's records are Fixed inherently — statements of the package, as
inline rows are statements of the instance file (§10.6) — so rows from
either home are stable instantiation inputs, and the generated acceptance
tests cannot differ per build.

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

A bound drawer keeps everything §1b already asks of it. The core's schema
governs record shape — the drawer MUST NOT carry a `record` schema of its
own; one shape, one home — while the package's chapters still home its
reference targets and completeness rules.

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

The generated block is generator-owned: a tool derives it from core and
surface, and the comparison below is byte-exact, so the working practice is
regenerate, never hand-edit — a hand-maintained block is possible in
principle and expected of no one.

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
  so no `tuning.json` key may occupy the namespace. Under §4's non-normative
  versioning guidance, a balance-only revision changes a `kind: tunable`
  knob's value within its range and leaves a `kind: constant` one untouched
  — exactly the guidance §4 states for `constants`. `range` is legal on tunables only; where a core needs a
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
  `ruleset` field in this version (§10.6). Nothing else about a contract is
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
  its knob's `kind`. The value comparison is the one §7 states: a live
  contract surface supplies the source value, the §5 pipeline resolves any
  legal personalization of a `kind: tunable` knob, and a `kind: constant`
  value is copied unchanged.
- **§7, check 5 and check 6.** `acceptance.total` counts game-local
  acceptance tests plus generated ones after liveness and per-row expansion; a
  template that is not live, and a row that does not match, contribute zero.
  Pass equality holds over that same total.
- **§7, invariants.** A core invariant that fails over the resolved snapshot
  is a build-record failure of the same rank as checks 1–8 (§10.8).
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

## 11. What this version deliberately excludes

*For everyone. One page, and it may save you designing something the format cannot carry yet.*

This version deliberately excludes:

- multiplayer and networking;
- rendered-capture certification for 3D renderers. A `web-3d` package
  validates, and a build of one can assemble a full record under the
  experimental protocol (§2d) when its complete acceptance suite needs only
  logic and state observations. What is missing is capture: no capture
  profile beyond `web-1` exists yet, and a rendered-capture acceptance test
  against a 3D renderer has no standardized sampling recipe (§7);
- binary asset pipelines;
- audio direction — a professional-vocabulary survey exists, but its
  transmission experiment has not run, so this version makes no audio-direction
  claims;
- localization structure;
- monetization design beyond the optional commerce split, including IAP
  design;
- any registry API; and
- target families beyond web delivery (`web-2d`, `web-3d`), until the
  format has held up across ten real specs.

---
