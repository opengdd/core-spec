# OpenGDD v0.7 working draft

OpenGDD is an open format for game design documents. Designers write the game
in prose. Structured data makes selected claims checkable. Three authority
levels state which decisions stay fixed, which belong to the builder, and
which are resolved separately for each build.

A builder turns the document into a running game. The builder may be a person,
a studio, an AI agent, or a combination. The document can also carry optional
attribution and commerce terms. The core format does not require a particular
transaction model.

Along the way this document names a handful of constructs — values (§4),
the grid-layout encoding (§7a), identifiers (§1), art direction (§9), and
contracts (§10). Each is defined in the
section its pointer names; none needs to be understood before then.

Throughout this document, the words MUST, MUST NOT, SHOULD, and MAY are used
in their RFC 2119 sense.

Status: v0.7 working draft — not a release. License: specification text
CC-BY-4.0; schemas and validator code MIT.

This document defines OpenGDD v0.7. Unless a passage explicitly describes a
migration or historical artifact, every unnumbered current-version statement
and every normative rule in this document applies to v0.7; no unstated rule is
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
| **Manifest** | The file at the top of a package that identifies the spec and its target (§3). |
| **Fantasy block** | Every game idea begins with a fantasy, meaning what the player gets to be and feel. A spec opens the same way (§1a). |
| **Fixed, Delegated, Personalization** | Every design statement says who decides it. Fixed means the designer already did, Delegated leaves it to whoever builds the game, and Personalization leaves it to an answer given for one particular build (§2). |
| **Identifier** | Any name the designer invents that the format then carries. Using one creates it; there is no separate step where you declare it (§1). |
| **Value, range, rule** | A value is a number the design cites by name; a range says how far a value may move; a rule is a relation between values that must hold however they are tuned (§4). |
| **Contract, definition, adoption, pack** | A contract is a ready-made questionnaire for a familiar mechanism. Its **definition** is the blank form; an **adoption** is one filled form copied into `contracts/`; an optional verification **pack** makes that adoption checked (§10). |
| **Acceptance test** | A numbered check saying what a finished build has to prove. The heading names it and its test block states the check (§6). |
| **Test block** | The machine-readable acceptance test, written as one fenced JSON block after its heading (§6). |
| **Test type** | Which of the two test-block shapes applies: one specific scenario or a general claim across a scope (§6). |
| **Replay** | Runner-owned data a test plays back as input. Any expected result is the test block's separate `target`; recorded footage is a **capture**, which is a different thing (§6). |
| **Evidence** | The record of what actually happened when the tests were run (§7). |
| **Harness** | The thing that runs the tests. Evidence is the record of what running them produced; the two words are not interchangeable (§6). |
| **Runner profile** | The experimental document that gives one named, versioned runner's meaning to runtime test execution, measurements, and replay data (§§2d, 6). |
| **Audit profile** | The experimental document that records the capture recipe an audit used and describes further evidence, runtime-value review, and judged direction review (§§2d, 7, 9.10). |
| **Runtime value** | Something that changes during play and that the design names with a `runtime.` address (§4b). |
| **Time mode** | A declared span of play with one pattern for how the game's clocks behave (§4b). |
| **Clock** | A named source of advance, such as elapsed seconds or a turn count (§4b). |
| **Ruleset** | One complete set of active rules, declared and scoped by a `> RULESET:` tag (§2c). |
| **Link** | A record field that holds another record's id (§1b). |
| **Completeness** | The idea that a spec holds together: nothing points at something that is not there, and nothing declared is left out. Each mechanism says which side has to cover the other. |
| **Direction** | One optional file for the game's colours, priorities, feeling, what it must never be, measurable promises, and viewing conditions (§9). |
| **Palette** | A named set of colours in `direction.json` (§9.1). |
| **Mood** | A named feeling with what it borrows and what it must not be (§9.3). |
| **Color promise** | A measured promise about one declared colour: what wears it, when it holds, and how close a build must stay to it (§9.6). |
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
  manifest.json          # identity + target — REQUIRED
  tuning.json            # the numbers: values, ranges, rules — REQUIRED
  clocks.json            # optional time modes and clocks (§4b)
  direction.json         # optional art direction (§9)
  personalization.json   # optional questions; in use when present (§5)
  01-overview.md         # pitch, pillars, player experience — REQUIRED
  02-mechanics.md        # complete rules — REQUIRED
  03-content.md          # story, characters, dialogue, levels/generation — optional
  04-presentation.md     # art direction, audio direction, UI, feel — optional
  05-build-plan.md       # stages, checkpoints, acceptance tests — REQUIRED
  assets/                # optional reference images, moodboards, sketches
  contracts/             # optional adopted contracts (§10) — reserved name
  collections/           # optional structured collections (§1b) — reserved name
```

`contracts/` is reserved for the contracts layer (§10), and `collections/`
for structured content (§1b); a package that keeps its own directory under
either name renames it.

### Identifiers

An identifier is a designer-defined name in a JSON file or declared
namespace.

Using an identifier creates it. There is no declaration step and no registry.
A key such as `infection.damage` or `tick.day` becomes an identifier the
moment it is used.

Identity is scoped. The same spelling in two scopes may name two different
identifiers. A field named once by a collection's record schema or prose is
one identifier; the thousand records that fill it in carry one thousand
values, not one thousand identifiers.

**Chapters are declared by presence.** A chapter is a Markdown file at the
package root whose name has the form `NN-name.md`, and tools read all such
files in filename order. Numbers `01`–`05` keep the canonical names and roles
shown in the tree. A numbered file in that range under any other name is a
validation failure. `03-content.md` and `04-presentation.md` remain optional;
`01-overview.md`, `02-mechanics.md`, and `05-build-plan.md` are required.

Number `00` is reserved and invalid. Numbers `06` and up belong to the
designer's own chapters. An unnumbered
Markdown file at the package root is not a chapter, and no tool reads it as
a chapter, and nothing in it declares anything; the validator scans it only
for the injection lint. This is where notes go, for example
`my-messy-prototyping-notes.md`. The canonical root files `tuning.json`,
`clocks.json`, `direction.json`, and `personalization.json` are likewise read
by presence where their sections make them legal. In particular,
`direction.json` and `personalization.json` are in use when present; the
manifest names neither one (§3).

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

- A number the design cites lives under a key in `tuning.json` `values`, such
  as `hazard.interval_seconds`. A range beside it says how far it may move
  (§4).
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
the file. One `#` title line may precede the fantasy block; HTML comments
before the fantasy block are not content. Anything else before the block fails
(`FANTASY_POSITION`). It holds three things:

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
- A fantasy line MUST NOT contain a typed-colon reference beginning `tuning:`,
  `state:`, `collections:`, `descriptor:`, or `palette:`; a `runtime.` address;
  a bare tuning citation; or a chapter anchor. A **bare tuning citation** is
  an inline-code token that §4's classification rule reads as a citation.
  A **chapter anchor** is a Markdown heading anchor reference, written
  `<file>.md#<anchor>` or as a bare `#<anchor>`. The bare form is read
  lexically: a `#` preceded by the start of the line or by whitespace and
  followed immediately by a kebab-case id. For this lexical form, a kebab-case
  id contains at least one letter. A `#` in any other position, or followed by
  digits alone, is ordinary text, so "the #1 spot" is not an anchor.

  **The anchor of a heading (normative).** Wherever this document resolves a
  chapter anchor — a §10.7 contract-row citation — the
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
closed field grammar a contract definition's row declarations use (§10.4).
Each field names its `type`, one of `number`, `integer`, `string`, `grid`,
`link`, or `list`, and may carry `required` or a row-domain `when`,
`options`, `pattern`, `unique`, and a `description` saying how the field is
read. `link` adds `to`, `many`, `loops`, and `mirrored_by`; `list` adds
`of`, which contains the same field grammar recursively. With a schema
present, every record in the drawer MUST
satisfy it: an undeclared field, a missing required field, a wrong type, a
value outside a closed option set, and a repeated unique value are hard
failures. Without one, records are free-form designer data, and the format
says so plainly rather than pretending otherwise. In a schema and in
records alike, a key opening with `_` is an annotation — read by nothing,
checked by nothing, and exempt from the undeclared-field rule — the same
idiom §10.2 gives contract files.

The grammar's §1b dialect adds **`grid`**, **`link`**, and **`list`**.
`grid` is a non-empty array of strings, one per row. All grid fields of one record MUST agree in
dimensions, measured in Unicode scalar values — the format fixes the unit —
and §7a gives the congruence rules in full. The `citation` type is §10.7's
dialect, and question-domain conditions are §10.4's: both read a contract
adoption's context, and no such context exists here.

Field-level meaning — what `speed` measures, what `#` marks — lives in the
schema's `description`, exactly where contract definitions put it. Game rules —
"bosses spawn once per run" — live in chapters, as every rule does.
**Drawers are Fixed spec data**: statements of the package, like inline
contract rows (§10.4), owned by the designer as every other statement is. A
designer who hands some aspect of a collection's content to the builder
says so in an ordinary `> DELEGATED:` section, in words, checked as all
delegation is (§2). No authority machinery attaches to a drawer, and no
per-collection tag exists: the retired `> COLLECTION:` claim of an earlier
draft is reported as retired where it survives in a chapter.

**`collections` is a reserved prose first segment** (v0.6, under §4's
versioning clause). `` `collections.<drawer>` `` cites the drawer as a set,
`` `collections.<drawer>.<record>` `` cites one record, and a longer token
names a member of the record's own data and resolves as far as the record,
as other record-backed paths do. A dangling citation is a hard
failure. This closes the format's last silent-rename gap: with record links
hard-checked, renaming a record makes every stale link a validator finding
with a file and line — the failure that makes rename tooling
trustworthy, exactly as §4 says of palettes.

A drawer nothing reaches — no prose cites it and no record link points to
it — is a **warning**: the spec never mentions it, which is a review lead,
not an order.

### Links between records

A field of type `link` holds the id of a record in the drawer named by
`to`. `many: true` makes the field an array of ids; without it the field holds
one id. The target drawer belongs to the same package and MAY be the drawer
that declares the field. The field names below are the designer's; the format
defines their shapes, not their names.

```json
{
  "record": {
    "prerequisite_ids": {
      "type": "link",
      "to": "technologies",
      "many": true,
      "loops": false
    },
    "unlock_recipe_ids": {
      "type": "link",
      "to": "recipes",
      "many": true,
      "mirrored_by": "unlocked_by_tech_id"
    },
    "inputs": {
      "type": "list",
      "of": {
        "item_id": { "type": "link", "to": "items", "required": true },
        "qty": { "type": "integer", "required": true }
      }
    }
  }
}
```

An absent link field, `null`, or an empty array contributes zero links.
When `required: true` or a satisfied `when` condition makes the field
required, it MUST instead hold at least one link. A present single link
MUST be a string id; a present link with `many: true` MUST be an array of
string ids. Repeating an id in one array produces the
`COLLECTION_LINK_DUPLICATE` warning. A present value of the wrong type is
`COLLECTION_LINK_TYPE`.

**Existence is checked on every package validation.** Each linked id MUST
name a record in the `to` drawer. A missing drawer is
`COLLECTION_LINK_TARGET`; a missing record is
`COLLECTION_LINK_DANGLING`. Both diagnostics identify the declaring
field, and the dangling-record diagnostic also identifies the source record
and value. Nothing is registered in the manifest and no acceptance test turns
this check on.

Two further checks are opt-in on the field:

- **`loops: false`**, on a link into the same drawer, says the links carried
  by that field MUST contain no cycle. A failure is `COLLECTION_LINK_LOOP`
  and reports one complete cycle as an ordered list of record ids. On a link
  to a different drawer, `loops` has no effect. Omitted or `true` permits
  cycles.
- **`mirrored_by: "<field>"`** names a link field on the target drawer
  that points back to this drawer. Forward links and back-pointers MUST agree
  in both directions, link by link. A missing or incompatible mirror field is
  `COLLECTION_MIRROR_FIELD`; a link present in only one direction is
  `COLLECTION_MIRROR_ONE_WAY` and reports both record ids.

A `list` field holds an array of objects. Its `of` object is a closed record
schema for each line, so a recipe can keep an item link and its quantity
together without a path grammar or wildcard.

When a pointer's target depends on the record, use one link field per
kind of target. For example, `requires_unit` points to units and
`requires_improvement` points to improvements; the chapter says which one a
rule reads. A later revision may let `loops` continue through a further
field, allowing one claim to cross two fields.

## 1c. Retired

*This section was retired in v0.7; links between records live on the field
(§1b).*

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
is descriptive only, and no rule reads it. What follows `PERSONALIZATION:`
MUST be the id of a question declared in
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
constrain it without pinning it uses art direction (§9), which
states targets and leaves the means open.

The rendering technique is one such area. A spec's §3 `platform` names
the state space the design is responsible for; how the builder draws it is
the builder's choice. A `web-2d` world may use flat sprites or perspective 3D
graphics without touching the design area, provided every Fixed and
constrained claim still holds.

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
  own build and that build's Fixed rules. So a spec MUST NOT require an
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

## 2c. Rulesets

*For designers. Skip unless your game swaps one whole ruleset for another while play is in progress.*

Some games change which rules are active while play is in progress: a game
might swap one complete ruleset for another between acts or scenes. A
`> RULESET: <id>` tag declares the ruleset id and scopes the prose that
follows to it. Exactly one tag MUST add `(initial)` after the id:

```markdown
> RULESET: act-one (initial)
```

The id is kebab-case. The reserved id `all` is retired; an untagged statement
already applies in every ruleset. Repeating a ruleset id in another tag
continues the same ruleset; it does not declare a second one.

A prose tag has an exact syntactic scope. It starts at the tag and ends at
the next `> RULESET:` tag in the same heading section, or at the end of that
section, whichever comes first. The section ends at the next heading of the
same or a higher level. An untagged statement is authoritative under every
ruleset.

Tooling parses the tags, identifies the one initial ruleset, and enumerates
which statements are shared or belong to each ruleset.

Tags cannot establish semantic claims about mutual exclusion or reachability,
such as "these two rulesets are never simultaneously active." Game-local §6
tests cover those claims.

## 2d. Conformance layers and certification status

*For auditors and tool authors. Designers: read the two-severity rule and move on.*

The map of the three layers, before the rules:

| Layer | Question it answers | Decided by | Decided from |
| --- | --- | --- | --- |
| Package conformance (normative) | Is the design sound on paper? | Validation: machine checks, plus human reading for prose obligations | The package bytes alone |
| Build-record conformance (normative) | Is the builder's completion claim coherent? | Validation: record shape, arithmetic, consistency with the source package | The record and package bytes alone |
| Build certification (EXPERIMENTAL) | Is the claim true in reality? | The runner profile and audit profile in `conformance/CERTIFICATION.md`: execution, evidence, judgment | Running the build and reviewing its evidence |

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
v0.7 schema — `manifest.json`
against the manifest schema, `tuning.json` against the tuning schema, and,
when present, `personalization.json` against the personalization schema,
`direction.json` against the direction schema, and `clocks.json` against the
clocks schema — and the package satisfies
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
§7 validator-level package-consistency check. The record is the builder's
completion claim: shipping it asserts that every acceptance test passed, and
so that every colour promise with `within: 0` its tests cover matched (§9.6). This
version machine-checks the record's internal validity and its consistency with
the source package; it does not audit the
assertion's truth. Auditing that truth is what certification would do. A
build that still fails a test does not yet ship a conforming record; what it
has are §2b ambiguity reports.

**Build certification (EXPERIMENTAL).** Certification would be the
audited claim that one particular build faithfully implements its spec. The
runner profile and audit profile are documents inside the conformance
certification protocol published at `conformance/CERTIFICATION.md`. The
runner profile states how a named runner executes §6 tests and produces
observations. The audit profile owns capture recipes, review of §7 evidence
and runtime values, accounting for every Fixed statement, and judged
direction claims (§9.10). Both profiles are experimental.

This version does not define a normative certification outcome, an execution
grammar for `test` blocks beyond §6's package-level field set, or a panel protocol for
judged claims. Where this
document describes certification, it describes the intended shape of that
protocol. No statement grants or withholds a normative certification outcome.
The draft protocol may record audit findings and experimental results, but
those results are not core conformance outcomes.

The experimental status changes no file's shape. `opengdd-build.json` keeps
its required fields, including `evidence`, and packages keep their §6
structural obligations. Record conformance checks the `evidence` field's
shape and counts only: no record-conformance check executes tests or
reproduces hashes. A contract's folder rules, filled-form shape, definition
identity, pack pairing, and rendered-test shape are package-level rules of the
first kind, all decidable from package bytes (§10); its definition digest is
not a package rule, and recomputing one is audit work under the experimental
protocol, exactly as with every other hash here (§10.9). Fixed statements bind
at full force regardless: passing every acceptance test is necessary but never sufficient for the
experimental certification protocol, because a Fixed statement binds
whether or not a numbered test restates it (§2).

## 3. manifest.json

*For designers. One short file per spec, and you write it once.*

The manifest carries the spec's identity and target. It is
machine-validated against
[manifest.schema.json](https://opengdd.org/schema/core/v0.7/manifest.schema.json).
Here is a complete manifest for §1a's getaway driver, without optional
commerce metadata:

```json
{
  "opengdd": "0.7",
  "id": "getaway-driver",
  "version": "1.0.0",
  "title": "Getaway Driver",
  "designer": { "name": "OpenGDD Examples" },
  "target": {
    "platform": "web-2d",
    "genre": "arcade driving",
    "session_minutes": 5,
    "audience": "anyone; one hand on the keyboard"
  }
}
```

Its required top-level fields are exactly:

- **`opengdd`** is the format version. Its value is `"0.7"`.
- **`id` and `version`** identify the spec. `version` is exactly three
  dot-separated non-negative decimal integers, `MAJOR.MINOR.PATCH`. Each
  component is either `0` or begins with a non-zero digit; prerelease and build
  suffixes are not accepted. `id` is a kebab-case package id. Core conformance
  makes no global uniqueness claim;
  a catalogue or registry MAY impose uniqueness within its own declared
  domain.
- **`title` and `designer`** name the game and its designer. The designer has
  a name and may also have a registry handle and contact details.
- **`target`** requires the platform and genre family. It may also give the
  session length in `session_minutes` and the audience. `platform` names the
  delivery target and the **state space**
  the designer is responsible for — what the game must keep track of, not
  what it looks like. This version accepts `web-2d` and `web-3d`. A game whose
  world is a plane declares `web-2d` no matter how a build draws it; `web-3d` is
  for a game whose state itself needs three dimensions. Rendering technique
  is never a platform fact: it is the builder's craft on §2a's boundary, and
  a build records what it rendered with in `opengdd-build.json` (§7).

The manifest declares nothing beyond identity, target, and optional commerce
metadata. Chapters and optional files are read by presence (§1); adopted
contracts (§10.2) and collections (§1b) declare themselves through their
directory contents; rulesets are declared by their prose tags (§2c).

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
change gameplay expression or authority (a prose obligation, §2d). Under the
experimental certification protocol, it does not change a build's standing.

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

## 3a. Canonical schema URLs

*For tool authors. Designers: all you need is that `"opengdd": "0.7"` picks your schemas.*

Every published schema is identified and served at a canonical URL:

```text
https://opengdd.org/schema/<layer>/v<minor>/<file>.schema.json
```

For example:

```text
https://opengdd.org/schema/core/v0.7/manifest.schema.json
```

The `core` layer publishes seven schemas: `manifest.schema.json` (§3),
`tuning.schema.json` (§4), `clocks.schema.json` (§4b),
`personalization.schema.json` (§5), `collection.schema.json` (§1b, the drawer
label), `direction.schema.json` (§9), and `opengdd-build.schema.json` (§7).
The first six are the package's; the seventh is the build record's. A contract
adoption file has no schema here by decision, not by omission: §10's filled
form is format machinery while a definition's content is not (§10.10), so §10
states the shape normatively in prose and a validator implements it. A schema
for that shape may ship with tooling later; it would add no rule.

Four rules govern these URLs:

1. **The schema layer comes before the version.** Each schema layer versions
   independently. `core` is the only schema layer today. A future commerce
   profile could be another. The URL layout MUST NOT imply that different
   schema layers share one version (a rule for the schema publisher, outside
   package conformance).
2. **The version segment uses the format version.** It is `v` followed by the
   manifest's `opengdd` value. A schema under `/core/v0.7/` validates
   manifests that declare `"opengdd": "0.7"`. Schema URLs use minor-version
   granularity. Patch-level corrections are published as errata at the same
   URL and MUST NOT silently change any validation outcome (a rule for the
   schema publisher, outside package conformance).
3. **Published URLs are permanent.** A schema MAY be superseded by a newer
   version at a new URL. Its existing URL MUST NOT be repurposed or removed (a
   rule for the schema publisher, outside package conformance).
   The content served there is frozen except for the errata allowed above.
4. **There is no floating alias.** Documents MUST reference an explicit
   version (a prose obligation, §2d). The format defines no `/latest/` URL.

## 4. tuning.json

*For designers. This is where your numbers live, so read it.*

`tuning.json` keeps the numbers a build reads, the ranges within which some
numbers may move, and readable rules that keep those numbers in step. It is
machine-validated against
[tuning.schema.json](https://opengdd.org/schema/core/v0.7/tuning.schema.json).
The top level is a closed shape with exactly three possible tables:
`values`, `ranges`, and `rules`.

```json
{
  "values": {
    "dash.speed_tiles_per_second": 12,
    "dash.duration_seconds": 0.15,
    "dash.cooldown_seconds": 0.6,
    "tile.size_units": 16
  },
  "ranges": {
    "dash.speed_tiles_per_second": [8, 20],
    "dash.duration_seconds": [0.1, 0.3],
    "dash.cooldown_seconds": [0.3, 1.5]
  },
  "rules": {
    "no-dash-while-dashing": "dash.cooldown_seconds >= dash.duration_seconds",
    "dash-covers-a-tile": "dash.speed_tiles_per_second * dash.duration_seconds >= 1"
  }
}
```

`clocks.json` declares the §4b block; it is not a fourth table here.

### Values (`values`)

`values` is required. It is one flat map from dotted keys to finite JSON
numbers. A string, a Boolean, an object, an array, `null`, or a non-finite
number under a key is a validation failure.

Every key obeys three rules:

1. It has two or more segments joined by `.`.
2. Each segment contains only `a`–`z`, `A`–`Z`, `0`–`9`, `_`, and `-`, and a
   segment MUST NOT begin or end with `-`. `hazard.interval_seconds` and
   `lane.count` are keys; a single bare word is not.
3. The key MUST NOT open with a segment reserved for prose citation, and no
   segment may be a reserved extension. Either would make the key unciteable
   in prose. Both lists appear under the citation rule below.

Every number the design cites as shared gameplay data lives under one of
these keys. A value declared by an adopted contract lives in that adoption
instead and enters the same resolved snapshot under the reserved `contracts.`
namespace (§§10.4, 10.6).

### Ranges (`ranges`)

`ranges` is optional. It maps a `values` key to an inclusive
`[minimum, maximum]` pair. The minimum MUST NOT exceed the maximum; every
range key MUST exist in `values`; and the declared value MUST sit inside its
own range.

A key with a range is what a rebalance or a personalization answer may move,
within that range (§5). "Tunable" is a description of such a value, never a
declaration or a category in this file. A key without a range is fixed as
written.

### Rules (`rules`)

`rules` is optional. It maps each stable kebab-case rule name to one readable
line. A rule reads keys from `values` only.
`rules.no-dash-while-dashing`, for example, is a mechanism path naming the
first rule in the complete example above.

A rule is one comparison between two sums: a left side, one of `==`, `!=`,
`<`, `<=`, `>`, or `>=`, and a right side. Each side is arithmetic over
numbers and `values` keys with `+`, `-`, `*`, `/`, parentheses, and the three
functions `min(a, b, …)`, `max(a, b, …)`, and `floor(x)`. `floor` rounds down
and is useful when a division represents a whole-number count. Precedence is
the usual arithmetic precedence: `*` and `/` before `+` and `-`; use
parentheses for anything else.

Every rule is evaluated over the authored `values`, over the package defaults,
and over every resolved snapshot a build receives. The first two evaluations
occur at package validation. A false package rule is a package validation
failure; a false rule over a build snapshot is a build-record failure (§7).
A failing rule produces a three-line message that names the rule, shows the
line, and shows the numbers as they stand:

```text
rule "dash-covers-a-tile" does not hold
  dash.speed_tiles_per_second * dash.duration_seconds >= 1
  8 * 0.1 = 0.8, which is not >= 1
```

Anything wrong with a rule line or its name is `TUNING_RULE_INVALID`; its
message identifies the specific problem, such as an unreadable line, an
unknown key or function, or division by zero. A false comparison is
`TUNING_RULE_FAILED`.

### Package defaults

**Package defaults** are one flat `values` map. They are produced by applying
every personalization question's `default` through §5's ordered answer pipeline
to `tuning.json` `values`. With no `personalization.json`, they are
`tuning.json` `values` unchanged. These are the numbers over which package
validation evaluates the rules above.

*Non-normative.* A balance-only revision moves values within their ranges; no
conformance subject compares two revisions.

Numbers that belong elsewhere stay elsewhere:

- A number that only says how many of something there are MAY stay in Fixed
  prose, as long as no program needs to read it. A mechanics chapter saying
  a run lasts three rounds is one such number.
- A per-content measurement or solver-derived fact lives on that content's
  own collection record.
- Test inputs and seeds live with the acceptance test. Sample counts belong
  to the runner profile. Schedules, expected observations, and tolerances live
  with the test or its replay. Where a contract pack declares the inputs a
  test needs, they are recorded in the adoption's `verification` map and land
  in the rendered test (§10.8).
- Examples and identifiers carry no numeric authority. A displayed numeric
  example in prose MUST be marked non-normative (a prose obligation, §2d).
  The `PROSE_TUNING_LITERAL` warning carries this numeric-example rule.

### Reading a citation in prose (normative)

§1 requires normative prose to cite the tuning key rather than the value, and
the citation is written bare: the key alone in inline code, with no prefix.
Chapter prose carries other dotted tokens too, so one rule decides what a
token is. A backticked dotted token in chapter prose is classified by the
first of these that matches:

1. **Its first segment is reserved** → a mechanism path, resolved against the
   file that owns it. `mood.rain-glass` resolves in `direction.json` (§9),
   and `rules.no-dash-while-dashing` in `tuning.json`.
2. **Every segment is all digits** → not a citation. `0.5.0` is a version
   string.
3. **Any segment of it is a reserved extension** — `json` or `md` → a file or
   file-member mention, such as `tuning.json`, `02-mechanics.md`, or
   `tuning.json.rules`. The extension need not be the last segment, which
   is why a tuning key MUST NOT carry one in any position.
4. **Otherwise** → a tuning citation. It MUST resolve to a key declared in
   `tuning.json`. A token that resolves to nothing is a dangling citation, and
   a validation failure.

The reserved first segments are `pillars`, `mood`, `anti`, `must_keep`,
`colors`, `contrast`, `timing`, `values`, `ranges`, `rules`, `runtime`,
`clocks`, `manifest`, `build`, `contracts`, `palette`, and `collections`.
`manifest` and `build` are reserved against future use; a prose token opening
with one is classified as a mechanism path and resolves against nothing in
this version, so it is neither checked nor a citation. `runtime` is reserved
because §4b owns it. An inline-code token equal to `runtime` or opening with
`runtime.` MUST have §4b's runtime-address shape; otherwise validation reports
`PROSE_CITATION_DANGLING`.
`content` is deliberately not among them: it is a natural key namespace for a
designer. The list is versioned: a later revision of this format MAY extend
it as new mechanisms claim a segment, and a validator that rejects a key on a
newly reserved segment names the revision that reserved it and suggests a
legal key beginning with `feel.`. `palette` and
`collections` are reserved as of v0.6. A tuning key opening with either that
was legal before is rejected with a diagnostic naming that revision.
`references.*` and `viewing.*` are legal tuning keys again in v0.7.

`values`, `ranges`, `rules`, `runtime`, `colors`, `contrast`, and `timing` are
reserved as of v0.7. A tuning key opening with any of those segments is
rejected with a diagnostic naming v0.7 as the revision that reserved it. A
`values.<key>`, `ranges.<key>`, or `rules.<name>` token in prose is a
mechanism path and MUST resolve against the corresponding `tuning.json`
table.

The seven citable direction kinds are `pillars`, `mood`, `anti`, `must_keep`,
`colors`, `contrast`, and `timing`. Each citation has exactly two segments:
the kind and the entry key. `viewing` is not a citation target.

`contracts` earns its place on that list by rule 1: a backticked
`contracts.stamina.max` in prose is a mechanism path, resolved against the
adoption file that owns it (§10). That is how chapter prose cites a contract
value, and §1's rule that prose cites the key rather than the number holds over
it unchanged. The same dotted address is used in JSON (§10.6).

`palette.<key>` and `palette.<key>.<color>` are mechanism paths resolved
against `direction.json` under §9.1's whole-key-first order.

**Every reference form, in one place.** This table gathers the format's
reference spellings; each row's cited section states the governing rules, and
the classification order above decides what a prose token is.

| Form | Legal where | Resolves against | Failure behavior |
| --- | --- | --- | --- |
| Bare dotted token, first segment unreserved — `` `hazard.interval_seconds` `` | Chapter prose, inline code | A declared `tuning.json` key | Dangling citation is a hard failure (§4) |
| Dotted token, reserved first segment — `` `mood.rain-glass` ``, `` `colors.mark-ink` ``, `` `palette.enemies.fire.flame` `` | Chapter prose, inline code; JSON fields that cite the same address | The owning file or directory, including `direction.json` (§9), the `tuning.json` tables (§4), `clocks.json` (§4b), contract adoptions (§10), and `collections/` (§1b) | Dangling is a hard failure; a palette token resolves whole-key first (§9.1) |
| `runtime.<dotted-name>` | Chapter prose; a clock's `advances`; a test's `unchanged.values` | Chapter prose and a clock's `advances` declare the runtime value (§4b) | A well-formed prose use is the declaration and cannot dangle; a prose token equal to `runtime` or opening with `runtime.` but not shaped as a runtime address is `PROSE_CITATION_DANGLING`. `RUNTIME_UNDECLARED` applies when a test's `unchanged.values` names a value declared by neither chapter prose nor a clock's `advances` (§4b) |
| Chapter anchor — `<file>.md#<anchor>` | §10.7 contract row citations | Heading anchors under §1a's derivation | Unresolvable where the position requires one; banned in fantasy lines (§1a) |
| `> RULESET: <id>` tag | Prose section tags | The ruleset ids the tags declare (§2c) | Exactly one tag carries `(initial)` (§2c) |
| `[MODE]` heading tag | End of a chapter heading | The time modes named by `clocks.json` (§4b) | An unknown mode is `MODE_TAG_DANGLING` (§4b) |

Not references, by the same rules: a token whose segments are all digits (a
version string), a token carrying a `json` or `md` segment (a file mention),
a colon-bearing token read as prose (not a dotted citation), and a `#` that
is not preceded by line start or whitespace, or not followed by a kebab-case
id with at least one letter ("the #1 spot").

## 4a. Retired

*This section was retired in v0.7; runtime values moved to §4b.*

## 4b. Runtime values, time modes, and clocks

*For designers. Skip unless a test must name a changing value, or the game
mixes real time with turns or a pause.*

### 4b.1 Runtime values

A **runtime value** is something that changes during play and that the design
names so prose, tests, and clocks can point at it. Its address is
`runtime.<dotted-name>`, such as `runtime.oxygen_seconds` or
`runtime.case_facts.gallery_argument`. The address is untyped: the surrounding
chapter sentence says what the value is and when it is read, and the builder
chooses its implementation.

Using a runtime address in a package-root chapter declares it. Naming it in a
clock's `advances` array also declares it. Any other use without either
declaration is `RUNTIME_UNDECLARED`.

### 4b.2 Time modes and clocks

A **time mode** is a span of play with one pattern for how time passes. A
**clock** is a named source of advance, such as elapsed seconds or a turn
count. A package opts in by adding `clocks.json` at its root. The file is a
non-empty map with one entry per clock and is machine-validated against
[clocks.schema.json](https://opengdd.org/schema/core/v0.7/clocks.schema.json):

```json
{
  "world_clock": {
    "unit": "seconds",
    "advances": ["runtime.scan_progress", "runtime.research_remaining"],
    "modes": {
      "playing": "running",
      "paused": "paused",
      "in-mission": "paused"
    }
  },
  "mission_turn": {
    "unit": "turns",
    "advances": ["runtime.faction_turn"],
    "modes": {
      "playing": "none",
      "paused": "none",
      "in-mission": "steps"
    }
  }
}
```

Every clock MUST declare a non-empty string `unit` and a non-empty `modes`
map. `advances`, when present, is an array of runtime addresses carried
forward by that clock. The `advances` arrays of different clocks MUST be
disjoint; a value named by more than one is `CLOCKS_ADVANCES_DISJOINT`.
Clock names use the tuning-key segment grammar: a letter, number, or underscore
at each end, with letters, numbers, underscores, or hyphens between them.

The time modes are the union of the keys in every clock's `modes` map. Every
clock MUST name every mode; an omitted cell is `CLOCKS_MODE_MISSING`. Mode ids
are kebab-case. Each cell uses exactly one of four words:

- `running`: the clock moves continuously in that mode;
- `paused`: the clock keeps its value and does not move in that mode;
- `steps`: the clock moves only when a turn or other discrete step is taken;
- `none`: the clock has no value in that mode.

Any other cell word is `CLOCKS_MODE_WORD`. The object shape makes two words
for one clock in one mode unrepresentable.

A mode tag such as `[IN-MISSION]` is written at the end of a chapter heading
and scopes that heading's section to one time mode, the way `> RULESET:` scopes
its section. Tags are uppercase by convention and compare case-insensitively
with the lowercase kebab-case ids declared by `clocks.json`; the folded tag
MUST name one of those ids. A bracketed word in a paragraph is ordinary text.
The reserved `all` tag is retired; leave a statement untagged when it applies
in every mode. A later revision may add a tag that names a subset of modes.

Clocks are not contracts. The clock map declares this game's facts; unusual
behavior, such as a clock that runs only while the player moves, is a rule in
prose. A later pause contract may ask the closed semantic questions that
games answer differently, such as whether an expiry during a pause fires on
resume, while still citing the game's clock rather than replacing it.

### 4b.3 Unchanged during a mode

A `scenario` or `general` test MAY carry `unchanged`:

```json
{
  "unchanged": {
    "modes": ["paused", "in-mission"],
    "values": ["runtime.scan_progress"]
  }
}
```

Both arrays MUST be non-empty. Every mode MUST be declared in `clocks.json`,
and every value MUST be a declared runtime address. During any one unbroken
stretch in a named mode, each named value MUST read the same at every runner
observation; a later stretch may read differently.

Naming a value advanced by a clock that is `running` or `steps` in a named
mode is the `UNCHANGED_ADVANCES` warning. Naming a value whose clock is
`none` there is the `UNCHANGED_UNDEFINED` error. A package without
`clocks.json` cannot make this claim (`UNCHANGED_NO_CLOCKS`). A malformed
`unchanged` object, or a value or mode of the wrong type, is
`UNCHANGED_SHAPE`; an unknown mode is `UNCHANGED_MODE`.

### 4b.4 What the runner owns

Replay schedules and replay actions are runner data, not package vocabulary.
At package conformance, `replay` is an opaque object: the core checks its
shape as an object and assigns no meaning to its contents. The runner profile
belonging to the experimental protocol defines the schedule and action
vocabulary it accepts; that vocabulary is not yet standardized. See [the
certification protocol](conformance/CERTIFICATION.md).

## 5. Build personalization (`personalization.json`)

*For designers. Skip if every build of your spec should come out the same.*

**Two lanes, one file.** A question can set numbers mechanically or give the
builder creative instruction. A `choice` option sets numbers when it carries
`sets`; a `number` question sets its one named key to the numeric answer when
the question carries `sets`. Text answers and answers with no `sets` are
recorded for the builder to interpret. The same numeric answers always
produce the same resolved snapshot; creative answers may lead two faithful
builders to different implementations (§2a).

`personalization.json` carries the questions asked before or while building.
Its top level is a closed object whose one required field is `questions`:

```json
{ "questions": [] }
```

`questions` is an ordered array of question objects, and answers are applied
in that order. The file is machine-validated against
[personalization.schema.json](https://opengdd.org/schema/core/v0.7/personalization.schema.json).
One entry of that array:

```json
{
  "id": "hazard_interval",
  "prompt": "How quickly should hazards arrive?",
  "type": "choice",
  "options": [
    {
      "id": "steady",
      "label": "Steady",
      "sets": { "hazard.interval_seconds": 1.2 }
    }
  ],
  "default": "steady"
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
  string, and the optional `sets` object below.
- **`default`** is required for every question. Its type follows the
  question's `type`: the `id` of one declared option for `choice`, a string
  for `text`, a JSON number for `number`.
- **`sets`** is optional on a `number` question and legal at question level
  only there. It is one tuning-key string: the key that receives the answer.
- **`notes`** is optional: a string, under the same rule as an option's
  `notes`.

`default` is required because a skipped question with no default has no
defined outcome: nothing would say what the build resolved, and the resolved
snapshot could not be computed. Questions are optional for each build; when
one is skipped, its `default` applies, so every question has an answer either
way.

For a `choice` question, the declared `default` and every
recorded answer MUST name the `id` of one of its declared `options`: the
answer pipeline below is defined only for declared option ids, and an
undeclared id is a validation failure.

For creative variants, designers SHOULD write `notes` a builder can act on
directly: concrete instructions. Notes MUST NOT be the only authority for a
numeric change (a prose obligation, §2d).

### Enumerated answers

A choice option MAY declare exact tuning-key assignments through `sets`.
When present, this object contains
at least one entry:

```json
{
  "id": "rush-hour",
  "label": "Rush hour",
  "sets": { "hazard.interval_seconds": 0.9 }
}
```

Each key in `sets` MUST name a key in `values` that has a range
(§4); a key without a range cannot be set.

Each value MUST lie within its key's declared range. A value outside that
range is a package validation failure. A choice option without `sets` gives
the builder creative instruction only.

### Numeric answers

A numeric question MAY name one ranged key with `sets`:

```json
{
  "id": "hazard_pace",
  "prompt": "How many seconds should separate hazards?",
  "type": "number",
  "default": 1.2,
  "sets": "hazard.interval_seconds"
}
```

The answer is the value assigned to that key. The `sets` key MUST exist in
`values` and have a range (§4). The default MUST sit within that inclusive
range. A supplied answer outside it is refused, never clamped, and the build
record fails §7's check 4. A number question without `sets`
records creative instruction and changes no number by machine.

**Contract values are not targets.** A `sets` key MUST NOT name
`contracts.<adoption>.<value>`. A contract's values are fixed in the adoption;
they cannot be set per build. A violation is
`PERSONALIZATION_SETS_TARGET` (§10.4).

### The resolved tuning snapshot

The **resolved tuning snapshot** is one object with exactly one flat map
member, `values`. Starting from `tuning.json` `values`, apply each supplied
answer, or its question's default when no answer was supplied, in question
order. A choice answer applies its selected option's `sets` map. A number
answer assigns itself to the question's one `sets` key when present. After
that pipeline, every adopted contract value joins the map unchanged under
`contracts.<adoption>.<value>` (§§10.4, 10.6). The audit protocol
compares runtime consumption with the resolved snapshot for the keys it
chooses to check (§2d).
`opengdd-build.json` MUST record the answers and the full resolved snapshot.

### Answers outside tuning

Numbers are the whole of what this version resolves by machine. A question
may also reach prose, through a `> PERSONALIZATION: <id>` section tag (§2).
For prose the format defines no machine effect: there is no include,
exclude, or replace semantics, and no selector saying which answer produces
which section. Collection records are Fixed spec data (§1b) and are not a
personalization channel in this version.

A personalized prose section is interpreted by the builder from the recorded
answer, under §2a's boundary and the §1a fantasy block's tie-break. The
recorded answer in `opengdd-build.json` is the only machine-checked trace: a
validator confirms the answer names a declared question and, for a choice,
a declared option (§7), and nothing more. A designer who needs a personalized
decision checked by machine gives it a ranged number and uses `sets`.

Choices made at runtime, such as boons, difficulty modifiers, crafting
choices, and laws, are gameplay state. They are not build personalization.

## 6. Build plan and acceptance tests (`05-build-plan.md`)

*For designers and builders. Required reading: this chapter is what a build is judged against.*

Under the experimental certification protocol (§2d), a certification harness
would execute this chapter, and its acceptance tests are what a build would be
certified against. The chapter's structure below is a normative package
obligation, and so is the closed test-block field set stated with the test
types. The executing runner is not defined by the core format and belongs to
the experimental protocol. The chapter MUST contain ordered build stages. The
conventional order is `core-loop` → `content` → `tuning` → `presentation`
→ `polish`. Each stage lists its scope, chapter references, and
machine-verifiable checkpoints. Build-stage structure is a prose obligation (§2d):
the format defines no machine grammar for it, and validators do not decide it.

### Acceptance-test types

Acceptance tests are numbered `AT-1 … AT-n`. Their machine-checked shape
grammar: an acceptance test is a Markdown heading, at any heading level,
whose text begins `AT-<n>`. One file is scanned for those headings — the
canonical root build plan `05-build-plan.md` (§1) — and it MUST carry at
least one.
Numbers MUST be unique and ascending in document order. Gaps are permitted: a
deleted test's number is retired and never reused, so `AT-4` names the same
check in every revision that still has one. This numbering scopes to the
tests the package writes itself: a generated test is named rather than
numbered, its heading begins `AT ` with no hyphen, and the scan above never
sees one (below). Every `AT-n` heading MUST be immediately followed by one fenced JSON
block whose fence carries the tag word `test`. That block is the acceptance
test; no prose restatement is required.

Every test block declares one of two **test types**:

- **`scenario`** describes one specific situation with `given`, `when`, and
  `then`.
- **`general`** states `scope`, the cases the claim is about in words, and
  `holds`, the claim across those cases. Optional `seeds` name repeatable
  random sequences used to generate cases so a failure can be reproduced.

The choosing rule is: **a scenario, unless the promise is about many cases.**

#### The package-level test-block shape (normative)

The format defines exactly these test-block field names, and the set is
closed: adding one takes a format revision. A package validator reads these
names, decides their shapes, and reports a violation as a package
conformance error (§2d):

- `type`, in every block: a string, one of the two test types above.
- `scenario`: `given`, `when`, and `then`. Each is a string or an array of
  strings, and each MUST be non-empty. The example below writes `given` as one
  string and `when` and `then` as arrays.
- `general`: `scope`, a non-empty string describing the cases in words;
  `holds`, a non-empty string stating the claim; and optional `seeds`, a
  non-empty array of non-empty strings.
- Beyond each type's required fields, the optional grants are exactly these.
  Both types MAY carry `diagnostics`, a non-empty array of strings;
  `direction_claims`, a non-empty array of dotted-path strings (below);
  `unchanged`, an object (§4b); `replay`, an opaque object; and the
  expected-observation pair `target`, which takes the observation's own JSON
  type, with `tolerance`, a finite JSON number.
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
§1, but the one-container rule prevents them from colliding with present or
future standard fields.

The list is package-level and closed at the top-level field-name layer.
Test execution semantics are not in it: how a runner reads a `given`, a
`when`, or a `then`, how it plays a `replay` back, and what an observation is
worth remain the experimental certification protocol's (§2d). A package
validator decides which fields are present and whether their shapes are
well-formed; it never runs the check.

A general test whose scope was sampled establishes what its `holds` sentence
bounds; one whose whole scope was checked can establish absence, a minimum,
or a universal. The build record's `acceptance.sampled` list states which
game-local general tests were sampled (§7).

The retired test types `property`, `exhaustive-search`, and `document-check`,
and their retired fields `domain`, `applies_to`, `predicate`,
`initial_states`, `transitions`, `finite_state`, `complete`, `bound`,
`rule_set`, and `artifacts`, receive focused errors that name
`opengdd migrate`. A package-file check belongs in the data rules or in
ordinary prose.

Every test feature has exactly one owner (§2d's layers):

| Test feature | Owner |
| --- | --- |
| Block shape, the closed field set, per-type shapes, `direction_claims` lookup and coverage | PACKAGE — the validator decides from bytes |
| Reading `given`/`when`/`then`, sampling or walking a general test's `scope`, playing back `replay`, `target` and observation semantics, schedule execution | Runner profile — experimental protocol document (`conformance/CERTIFICATION.md`) |
| "The tests passed" | RECORD — the build record's claim, checked for shape and counts (§7) |
| Whether they truly passed, and whether uncited Fixed prose held | AUDIT — the experimental certification audit (§2d, §9.10) |

### Direction-claim citations

A `scenario` or `general` test block that covers a measured §9 direction
promise carries `direction_claims`, a non-empty array of exact dotted paths.
Each path MUST resolve to a `colors.<key>`, `contrast.<key>`, or
`timing.<key>` entry. A path of another kind or a dangling path is
`DIRECTION_CLAIMS_DANGLING`; an empty or malformed array is
`DIRECTION_CLAIMS_SHAPE`. Illegal test types use `VERIFICATION_CLASS`, or
`VERIFICATION_TYPE_RETIRED` for a retired type.

Every declared `colors`, `contrast`, and `timing` entry MUST be cited by at
least one game-local acceptance test. An entry no test cites is
`DIRECTION_CLAIM_UNCOVERED`. Palettes, pillars, moods, anti-references, what
must stay, and viewing conditions are not `direction_claims` targets.

The test points at the promise; it does not copy it. A test carrying
`direction_claims` MUST NOT restate the cited promise's value, metric,
location, or conditions (a prose obligation, §2d). Its procedure states how the runner observes the
declared promise, including how it reaches any conditions named by `while`.
The validator decides the citation and coverage from package bytes. Execution
and the truth of the result belong to the runner and experimental audit under
§2d.

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

At package conformance, `replay`, when present, is an opaque object. A
`tolerance` without an expected `target` is invalid.

The remainder is an **experimental certification obligation**, not a package
conformance check. Because this version deliberately leaves other replay
entries runner-defined, the certification audit confirms that every path the
runner treats as replay input is package-relative, that replay input carried
as structured content is declared through §1b, and that every `target` is
grounded in an input or schedule the runner actually supplies. A package
validator does not perform those checks; question 8 in
`conformance/CERTIFICATION.md` owns them.

### Checked contract tests

A checked contract adoption (§10.5) contributes acceptance tests from its
verification pack. They are rendered for reading with
`--render-contract-tests`; they are never committed to this chapter. Each is
named `AT <adoption>/<template-id>`, or
`AT <adoption>/<template-id>/<row-id>` for a per-row expansion, so changing
one adoption or row does not renumber another test.

Rendered contract tests use the same two test types, closed field sets,
runner, evidence duties, and §7 acceptance counts as game-local tests. They do
not satisfy this chapter's requirement for at least one numbered `AT-<n>`.
Because a pack cannot own the adopting package's art-direction coverage, a
rendered contract test MUST NOT carry `direction_claims`; §9.8 remains the
package's own work.

The tests are the executable part of the spec; they are not all of it. Every
Fixed statement binds even when no test restates it (§2). So passing every
acceptance test is necessary but never sufficient for the experimental
certification protocol.
Build-record conformance is defined by §2d and §7.

## 7. Build records (`opengdd-build.json`)

*For builders and auditors. Designers: skip, you never write this file.*

A conforming build ships `opengdd-build.json` (build-record conformance,
§2d). Where this chapter uses certification vocabulary — "certified",
"certifying spec", "certifying profile" — it uses it in §2d's
intended-shape sense: the record is the artifact the experimental protocol
would audit, and the core format defines no normative certification outcome for it. The
file is machine-validated
against [opengdd-build.schema.json](https://opengdd.org/schema/core/v0.7/opengdd-build.schema.json).

### Core fields

The required top-level fields are exactly:

- **`opengdd`**: the format version the build was tested against.
- **`spec`**: the `id` and `version` of the built spec.
- **`designer`** and **`builder`**: each carries a name, with optional
  `handle`, `contact`, and `role`.
- **`personalization`**: an `answers` object that maps question ids to the
  answers used. It is an empty object when there are no answers.
- **`resolved_tuning`**: the §5 resolved snapshot. It contains one complete,
  flat `values` map after the ordered answers are applied, including every
  adopted contract value as `contracts.<adoption>.<value>`, copied unchanged
  from its adoption (§10.6).
- **`evidence`**: the test-run record. Its required fields are:
  - `result_hash`, written as 64 characters of bare lowercase hexadecimal.
  - `payload`, with `covers` and `file`. `covers` states in plain words which
    artifacts the hash covers. `file` is a package-relative path to the
    canonical payload bytes covered by the hash.
  - `acceptance`, with `passed` and `total` counts. It MAY carry `sampled`, a
    unique list of game-local `AT-n` ids for general tests whose scopes were
    sampled rather than checked whole. Absent or empty means every general
    test's whole scope was checked.

  When the source package has checked contract adoptions, `evidence` also
  carries `contracts`: one closed `{ "adoption": "<id>", "pack":
  "sha256:<digest>" }` entry per checked adoption. It is absent when every
  adoption is promised (§10.5). This records the pack bytes the build was
  verified against, the way `resolved_tuning` records the numbers it used; a
  later pack replacement does not change what this record says was checked.

  One further field is conditionally required when the source package is
  available:

  - `runner`, a closed object with non-empty `id` and `version` strings. It
    names the runner profile relative to which the result is true. It is
    required when any source acceptance test is `scenario` or `general`, or
    when a block carries `replay`, `target`, or `direction_claims`.

Canonicalization follows the conformance certification protocol published at
`conformance/CERTIFICATION.md` in the OpenGDD conformance suite (§2d).
The standalone record check validates the evidence shapes it can see.
Source-backed record validation additionally decides the conditional runner
and test-count rules below. `payload.file` is checked as a
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
4. The `resolved_tuning.values` keys exactly equal the source `values` key set
   unioned with the contract keys the package declares —
   `contracts.<adoption>.<value>` for every value of every adoption (§10.6).
   The validator MUST compute the complete expected snapshot from the source
   package and the recorded personalization answers, then append the adoption
   values unchanged and require every recorded value to equal its expected
   value. Every tuning key with a range remains inside that range. A recorded
   number answer outside its `sets` target's range is
   refused, never adjusted to an endpoint, and the record does not conform
   (`BUILD_ANSWER_REJECTED`). The refused answer is still visible when the
   validator computes the expected snapshot, so the invalid record may also
   receive `BUILD_TUNING_VALUE`; no boundary value is substituted (§5).
5. `acceptance.total` equals the package's enumerated AT count: its game-local
   acceptance tests plus the tests rendered from checked packs after template
   liveness and per-row expansion (§§6, 10.8). Every id in
   `acceptance.sampled` names a game-local general test; an unknown id is
   `BUILD_SAMPLED_UNKNOWN` and another test type is `BUILD_SAMPLED_TYPE`.
6. A conforming build has `acceptance.passed == acceptance.total`.
7. When the source test set contains any runtime test named above,
   `evidence.runner` is present. Its identity makes results attributable; the
   core does not interpret the named profile or claim that two profiles are
   equivalent.
8. `evidence.contracts` is present exactly when the source package has checked
   adoptions and matches their adoption ids and pack hashes exactly (§10.5).

Every `rules` entry of the certifying package MUST hold over
`resolved_tuning.values`. A false rule is a build-record failure (§4).

Checks 1–8 are the core set, not the whole set. Every relation declared by a
contract definition is re-evaluated over the adoption's values in the resolved
snapshot (§10.4).
Validators report divergence in checks 1–8 as errors. A check-6 shortfall is
an error against build conformance rather
than a complaint about the file (§2d); it does not conflict with honest
reporting, because the shipped record is a completion claim, and a build
still failing tests reports through §2b ambiguity reports rather than a
build record.

`opengdd-build.json` MAY copy the source manifest's `commerce` profile. When it
does, the source manifest MUST carry that profile and the copy MUST be
verbatim, including `derived_from` when present. Omitting the optional copy
has no conformance consequence, and nothing in the experimental certification
protocol depends on commerce metadata.

### Audit evidence outside the build record

The audit profile in `conformance/CERTIFICATION.md#audit-profile` records the
capture recipe it used by id in the audit's own record, not in
`opengdd-build.json`. An audit may ask the builder to attach any further
evidence it needs; the format gives that evidence no field or fixed shape. A
v0.7 build record carrying the historical `renderer`, `resources`,
`capture_profile`, `direction_result`, `evidence.direction_observations`, or
`evidence.algorithm` fields receives a focused `BUILD_SCHEMA` error and can
be rewritten with `opengdd migrate --build`. The certification protocol fixes
SHA-256 for the result hash. `evidence.runner` remains the runner identity
defined above.

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
  machine-checkable properties. Those properties may include minimum solution
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
zero columns, is diagnosed as `layer-column-mismatch`. The report codes are
`CONTENT_LAYER_ROW_MISMATCH` and `CONTENT_LAYER_COLUMN_MISMATCH`; the lowercase
diagnostic name travels in the finding's `data`. Both are existence-level
package checks under §1b's unconditional record checks. No acceptance test is
needed to catch them.

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

## 8. Retired

*This section was retired in v0.7; identifiers moved to §1.*

## 9. Art direction (`direction.json`)

Art direction is optional. When it is used, one file named `direction.json`
MUST sit at the package root. The file is in use when it exists and is
self-contained: it carries the colours, priorities, feeling, what the result
must never be, measurable promises, and viewing conditions.

The presentation chapter says what it wants in ordinary prose under a
`> DELEGATED:` section and cites direction entries by their dotted addresses.
A `pillars`, `mood`, `anti`, or `must_keep` entry that no chapter cites is
legal but produces `DIRECTION_UNMENTIONED`. Direction uses Delegated authority
under §2; it creates no additional authority level.

This is a complete `direction.json`:

```json
{
  "palette": {
    "board": [{ "mark-ink": "#2B2A26" }, { "paper": "#F7F4EC" }]
  },
  "pillars": {
    "shape-not-color": "The two players are told apart by mark shape alone; color never carries identity."
  },
  "mood": {
    "paper-quiet": {
      "intent": "The quiet of a game drawn on scrap paper between two people who happen to be nearby.",
      "borrows": [{ "from": "a pencil game on the back of an envelope", "what": ["paper texture", "hand-drawn line weight"], "image": "assets/mood/envelope.jpg", "license": "CC-BY-4.0" }],
      "anti": [
        "not an arena: no announcers, no glow, no dramatic stings, no victory fanfare",
        "not a casino: no chance imagery, no jackpot celebration"
      ],
      "palette": "palette.board"
    }
  },
  "anti": {
    "no-mascots": "no wobbling mascots or candy gloss; the game is casual, not infantile"
  },
  "must_keep": {
    "shape-carries-identity": "cross and ring are distinguishable by shape alone in every state"
  },
  "colors": {
    "mark-ink": { "is": "palette.board.mark-ink", "within": 12, "where": "every placed mark and every grid line", "while": ["in-game"] }
  },
  "contrast": {
    "mark-vs-paper": { "colors": ["palette.board.mark-ink"], "against": "palette.board.paper", "at_least": 4.5, "where": "marks on the board" }
  },
  "timing": {
    "mark-placement": { "key": "feel.placement_seconds", "where": "the mark appearing after a legal tap" }
  },
  "viewing": {
    "speed_and_size": "the whole board on screen at once, at real play speed",
    "calibration": "sRGB display at standard desktop viewing distance"
  }
}
```

`direction.json` is a closed, non-empty object. Its only root fields are the
ones defined below. Schema-shape failures, including unknown fields and empty
maps, are reported as `DIRECTION_SCHEMA`.

### 9.1 Palettes (`palette`)

A palette keeps a named set of colours in one place so every other direction
entry can point at it.

`palette` is an optional non-empty map. Each key names one palette and holds a
non-empty array. A palette key is one or more dot-separated segments. Each
segment MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, MUST contain at least one
letter, and MUST NOT be `json` or `md`. The dots are part of the flat key;
they do not create nested objects.

Each array entry is either a `#RRGGBB` sRGB colour string or a one-key object
whose key names that colour and whose value is a `#RRGGBB` string. A colour
name follows the same dot-free kebab-case rule, contains at least one letter,
MUST NOT be `json` or `md`, and is unique within its palette. A bare colour has
no address. A colour is
named only when something needs to cite it. Array order carries no meaning,
and array positions are not citation targets. Two entries MAY carry the same
hex value. Tools MUST preserve the authored spelling; this binds tools, not
packages.

A palette carries no scope, tolerance, or per-colour promise. Those belong to
the measured entry that cites a named colour. `PALETTE_SHAPE` reports an empty
or non-array palette, `PALETTE_ENTRY_FORM` an illegal entry, and
`PALETTE_COLOR_DUPLICATE` a repeated colour name.

Palette addresses resolve in one fixed order. Remove the leading `palette.`
and first try the entire remainder as a palette key. If no such palette
exists, split off the final segment, try the preceding text as the palette
key, and try the final segment as a named colour in it. Otherwise the address
is dangling. Therefore `palette.enemies.fire` names a palette when
`enemies.fire` is a key, while `palette.enemies.fire.flame` names its colour
`flame`. The whole-key/colour distinction is decided only when the address has
two or more segments after `palette.`. A `palette.<key>` address in a colour
position is a malformed colour address, reported as
`DIRECTION_COLOR_REFERENCE`. For a longer address, a whole-key result that
names a palette where the position requires a colour is
`DIRECTION_COLOR_DANGLING`, not an ambiguity.

A palette key MUST NOT equal another palette key plus one of that other
palette's colour names. For example, a palette `enemies.fire` with a colour
`flame` cannot coexist with a palette keyed `enemies.fire.flame`.
`PALETTE_KEY_COLLISION` reports this declaration-time collision. Invalid
colour-address spelling is `DIRECTION_COLOR_REFERENCE`; a well-spelled
address that resolves to neither a palette nor a named colour is
`DIRECTION_COLOR_DANGLING`.

A palette is reached when a mood's `palette` field names it, a `colors` or
`contrast` entry names a colour in it, or chapter prose cites the palette or
one of its colours. A palette nothing reaches is legal and produces the
`PALETTE_UNREACHED` warning. Reachability is per palette; unused colours
inside a reached palette produce no warning.

### 9.2 Pillars (`pillars`)

Pillars state the visual priorities a builder uses when direction goals pull
against each other.

`pillars` is an optional non-empty map from a kebab-case name to a non-empty
sentence. Its closed entry shape is the sentence itself. Priority is the
order written. Invalid shape is `DIRECTION_SCHEMA`; a pillar no chapter cites
produces `DIRECTION_UNMENTIONED`.

### 9.3 Mood (`mood`)

A mood names the intended feeling, what it borrows, and the negative space
that keeps the result from drifting into a nearby but wrong feeling.

`mood` is an optional non-empty map from a kebab-case name to a closed object.
Every mood requires a non-empty `intent` string and `anti`, a non-empty array
with at least one entry. An `anti` entry is either a non-empty sentence or the
image-bearing object defined in §9.4. `borrows` is optional and non-empty when
present. Each borrow is a closed object with required non-empty `from` and a
required non-empty `what` array of non-empty strings. It MAY carry `image`
and its required `license` under §9.9.

The optional `palette` field holds a palette address such as
`palette.board`, not a bare key and not a colour address. A missing palette or
an address that names a colour produces `DIRECTION_MOOD_PALETTE_DANGLING`.
Other shape failures are `DIRECTION_SCHEMA`. A mood no chapter cites produces
`DIRECTION_UNMENTIONED`.

### 9.4 Anti-references (`anti`)

An anti-reference names a result the builder must avoid.

`anti` is an optional non-empty map from a kebab-case name to either a
non-empty sentence or a closed object. The object requires a non-empty `not`
sentence and MAY carry `image` and `license`; an image requires its licence
under §9.9. Invalid shape is `DIRECTION_SCHEMA`. An anti-reference no chapter
cites produces `DIRECTION_UNMENTIONED`.

### 9.5 What must stay (`must_keep`)

What must stay names visible qualities that every faithful build preserves.

`must_keep` is an optional non-empty map from a kebab-case name to a non-empty
sentence. Its closed entry shape is the sentence itself; a later revision MAY
allow a sentence to become an object if another field is needed. Invalid
shape is `DIRECTION_SCHEMA`; an entry no chapter cites produces
`DIRECTION_UNMENTIONED`.

### 9.6 Measured promises (`colors`, `contrast`, `timing`)

Measured promises put a number or a tuning value behind the parts of art
direction that a covering acceptance test can observe.

Each of `colors`, `contrast`, and `timing` is an optional non-empty map from a
kebab-case name to the closed entry shape below. Unknown or missing fields,
empty strings, empty arrays, and invalid numeric bounds are
`DIRECTION_SCHEMA`.

**Colours (`colors`).** A colour entry requires exactly `is`, `within`, and
`where`, with optional `while`. `is` is a named palette-colour address.
`within` is a non-negative CIEDE2000 distance in CIELAB D65, computed after
decoding the declared sRGB values; `within: 0` requires the exact declared
colour. `where` says which visible things the promise covers. `while`, when
present, is a non-empty array of non-empty state descriptions saying when it
holds. A malformed address is `DIRECTION_COLOR_REFERENCE`; one whose remaining
segments resolve to a palette rather than to a named colour of one, or to
nothing, is `DIRECTION_COLOR_DANGLING`.

**Contrast (`contrast`).** A contrast entry requires exactly `colors`,
`against`, `at_least`, and `where`, with optional `while`. `colors` is a
non-empty array of named palette-colour addresses. `against` is one such
address. `at_least` is a positive WCAG 2.1 contrast ratio. `where` and
`while` have the meanings above. The validator decides from the declared
colour bytes whether every `colors` operand meets the floor against
`against`; a pair below it is `DIRECTION_CONTRAST_FAILED`. Address failures
use `DIRECTION_COLOR_REFERENCE` and `DIRECTION_COLOR_DANGLING`.

**Timing (`timing`).** A timing entry requires exactly `key` and `where`,
with optional `while`. `key` is the dotted address of a declared
`tuning.json` value. `where` names the rendered event whose duration the
build matches to that tuning value, and `while` states when the promise
holds. The covering test's procedure says how the runner observes the event;
the format defines no universal timing window. A key that names no declared
value is `DIRECTION_TIMING_KEY`.

The metric for each measured kind is fixed here. There is no per-entry field
that chooses or redescribes it.

### 9.7 Viewing (`viewing`)

Viewing records the conditions under which the finished result is considered.

`viewing` is one optional closed object, not a map of contexts. It requires
`speed_and_size`, which says the playback speed and the size or framing at
which the game is seen, and `calibration`, which says the relevant display or
output calibration. Optional `sequence` says what span or order of play must
be included. Each value is a non-empty string. Invalid shape is
`DIRECTION_SCHEMA`. The experimental audit judges direction under this
object; `viewing` itself is not a citation target.

### 9.8 The covering rule

Every `colors`, `contrast`, and `timing` entry MUST be cited by at least one
game-local acceptance test's `direction_claims` field. §6 owns that field and its
lookup rules. An uncovered measured promise is
`DIRECTION_CLAIM_UNCOVERED`.

The acceptance test points to the promise and its procedure says how to test
it. It MUST NOT restate the promise's value, metric, location, or conditions
(a prose obligation, §2d); there is no mirror between the two files.

### 9.9 Images

An `image` on a mood borrow or anti-reference is a package-relative path that
MUST remain inside the package and name an existing file. It carries a
non-empty `license`. A missing file is `MEDIA_PATH_MISSING`; missing or
malformed fields are `DIRECTION_SCHEMA`. The core checks nothing else about
the image or licence.

### 9.10 What the audit owns

Judging pillars, mood, anti-references, and what must stay under the package's
viewing conditions, blind to the builder's name, is the experimental audit
protocol's concern. Where a borrow reaches a real place, people, culture, or
living tradition, that protocol uses qualified judges. It records per-claim
observations and reports two axes, adherence apart from coverage. None of
those are fields in `direction.json`; `conformance/CERTIFICATION.md` owns the
experimental protocol.

Retired from the package format are audit classes; the precision ladder;
`hide_builder_name`; `judge_qualifications`; `observable`; `may_vary`;
`behaviors`; media hash and format; `tie_break_order`; the references pool;
the fence and its grammar; the mood wrapper and `descriptor:` token;
`semantics`; `constraints`; and `scope`.

### 9.11 Migration from v0.6

`opengdd migrate` rewrites a v0.6 direction, including the manifest palette
and descriptors, the direction fence, and measured constraints, into this
shape; a surviving fence is `DIRECTION_FENCE_RETIRED`.

## 10. Contracts

A contract is a declared mechanism. This chapter defines its package and
build-record checks; the experimental audit owns judged claims (§2d).

*For designers, §§10.1–10.6 state what the form promises. Pack authors and
tool builders need §§10.7–10.8 as well.*

### 10.1 What a contract is

Games often answer the same mechanical question in inconsistent ways: whether
a health value clamps, whether a failed craft consumes its inputs, or which
event wins when two effects happen together. A **contract** writes one such
mechanism down once as questions with closed answer options. The questions
record the decisions a faithful build would otherwise have to guess.

A catalogue publishes a **definition**, the blank form. A package adopts it by
copying the definition into one JSON file and filling in that game's answers,
values, rows, and any verification inputs. The result is an **adoption**. The
copy travels with the package and requires no registry or network access.

The contract's `mechanism` text is the builder's exact obligation. An option's
required `meaning` binds the designer; when optional `semantics` is present,
its precise wording is what holds the builder and the tests.
Validation checks the form and its declared relations. It does not decide
whether a definition is useful or whether its prose is good (§10.10).

### 10.2 The adoption file

A package MAY carry a reserved package-root `contracts/` directory. Presence
declares adoption: every non-dot entry is either one adoption file or one pack
file, and there is no manifest registration. The directory name is exact
lowercase. Dotfiles are ignored. A subdirectory, a non-JSON entry, or another
file shape is a validation failure. A package that already used `contracts/`
for unrelated files renames that directory.

One filled form lives at `contracts/<adoption>.json`. `<adoption>` is a
dot-free kebab-case name and the filename is its id and address; there is no
duplicate id field inside the JSON. A package without this directory is
unaffected by this chapter.

The top level is closed. Its **definition part** has these fields:

- `contract` (required): the definition's kebab-case id.
- `version` (required): an integer. `<contract>-<version>` is the definition
  identity.
- `origin` (optional, recommended): a string naming where the blank form came
  from.
- `summary` (required): a string.
- `mechanism` (required): an array of strings stating what the builder
  implements.
- `questions` (required): the question map (§10.3).
- `declares` (required): optional `values` and `rows` maps inside one object
  (§10.4). The object may be empty.
- `rules` (optional): the rule map (§10.4).
- `pack` (optional): a `sha256:` digest naming the verification pack (§10.5).

Its **designer part** has `answers` and `values`, both required maps, plus
optional `rows` and `verification`, in that order. An optional map with nothing
in it is better omitted. The definition part comes first in the field order
listed above. Definition annotations precede `answers`; designer annotations
follow it. Every
object is closed except that a key beginning with `_` is an annotation: checks
do not read it and unknown-field checks ignore it.

Two adoptions of the same `contract` and `version` are two filled forms with
independent designer parts. For comparison, `answers`, `values`, `rows`,
`verification`, and annotations are stripped; the remaining definition fields
are emitted in the order listed above and serialized as two-space JSON. Member
order inside those fields is part of the identity. Divergence is
`CONTRACT_DEFINITION_DIVERGENT`.

### 10.3 Questions and answers

`questions` maps each kebab-case question id to an object with `asks` and a
non-empty `options` map. It may also carry `rationale`, `guidance`, and `when`.
Each option id is kebab-case. An option requires a `meaning` string and may
carry `semantics` and `rationale`. When `semantics` is present, it MUST NOT
contradict `meaning`; that fidelity is a review obligation, and `semantics`
holds the builder to its more precise wording.

A question with no `when` is **asked**. A question with `when.flag` is asked
only when every named question is asked and its recorded answer is one
of the listed option ids. Otherwise it is **not asked**. Dependencies MUST be
acyclic; a dependency on a not-asked question makes the dependent question not
asked.

`answers` maps question ids to option ids. Every asked question MUST have
exactly one declared answer (`CONTRACT_ANSWER_MISSING` or
`CONTRACT_ANSWER_UNKNOWN`). An answer to a not-asked question is permitted but
warned as `CONTRACT_ANSWER_NOT_ASKED`, because removing it makes the filled
form state only decisions that apply.

### 10.4 Values, rows, and rules

A definition declares numbers under `declares.values`. Each kebab-case value
name maps to a closed object with a required `description` and an optional
inclusive `range` written as `[minimum, maximum]`. Both bounds are finite and
the minimum is not above the maximum. The adoption's `values` map supplies one
finite plain JSON number for every declaration, no more and no fewer, and each
number MUST be inside its declared range. Contract values are Fixed: §5 cannot
change them per build. A value name MUST NOT be `and`, `or`, or `not`, which
the rule grammar reserves, and MUST NOT duplicate a question name.

A definition declares row sets under `declares.rows`. Each entry has an
optional `description` and a required `record` schema in the §1b record
grammar's contract dialect: `number`, `integer`, `string`, and `citation`
fields; `required`, or a `when` condition over recorded answers (§10.3), row
fields, or both; `options`; `pattern`; `within`; `unique`; and `description`.
The adoption's `rows` map supplies one inline array for every
declared row set, including `[]` when empty. Drawer bindings are not legal.
Rows are Fixed package data and are validated whether or not a pack test uses
them.

The row object is closed. `required` and `when` are mutually exclusive;
`pattern` accepts only `kebab-case` and, like `options`, is legal only on a
`string` field. A closed option is kebab-case and at most 64 characters. A
`within` pair is legal only on a `number` or `integer` field and gives its
inclusive lower and upper bounds, in that order; each bound is either a bare
name from `declares.values` or a finite JSON number. A present row value MUST
lie inside the pair when both named bounds have been supplied by the adoption.
A conditioned field is required exactly when its condition holds and forbidden
otherwise. Violations use `CONTRACT_ROW_FIELD_SHAPE`,
`CONTRACT_ROW_FIELD`, `CONTRACT_ROW_CHOICE`, `CONTRACT_ROW_RANGE`, or — for a
`within` bound naming no declared value — `CONTRACT_REFERENCE`.

`rules` maps a kebab-case name to one comparison over the definition's bare
value names. It uses exactly §4's one-comparison grammar, operators, and three
functions. It is evaluated at package validation over the adoption's `values`
and again at build-record validation over those same values at
`contracts.<adoption>.<value>` in the resolved snapshot. Anything wrong with
the line or its name is `CONTRACT_RULE_INVALID`; a false comparison is
`CONTRACT_RULE_FAILED`. A false comparison in the build record is
`BUILD_CONTRACT_RULE`.

### 10.5 Promised and checked

Mode is declared by the pack's presence. An adoption with no matching pack file
is **promised** even when its definition names a pack hash. It binds as a
conviction: its promise binds the builder as Fixed prose does, and the
experimental audit judges whether the build kept it.

A matching file at
`contracts/<contract>-<version>.pack.json` makes every adoption of that
definition **checked**. Its exact bytes MUST hash to the definition's `pack`
value. A missing or mismatched digest is `CONTRACT_PACK_HASH`; a pack whose
`contract` and `version` match no adoption is `CONTRACT_PACK_ORPHAN`. A
present same-identity pack makes the adoption checked even when another pack
finding is reported; a malformed pack does not silently weaken the promise.

Checked acceptance tests are rendered from the pack with:

```text
node conformance/validate.mjs --render-contract-tests <package-dir>
```

Rendering is a read-only view. Tests are never pasted into
`05-build-plan.md`; a retired marker block there is
`CONTRACT_BLOCK_RETIRED`. Rendered tests use the §6 acceptance-test shapes,
run under the same runner and audit duties as game-local tests, and count in
the build record's acceptance total.

Each checked answer becomes one or more named acceptance tests that the build
MUST pass. A build that behaves differently fails the corresponding test by
its rendered name; §7 check 6 refuses a record whose passed count falls short.

A source-backed build record carries `evidence.contracts` exactly when the
package has checked adoptions. It lists one `{ "adoption": "<id>", "pack":
"sha256:<digest>" }` entry per checked adoption and no promised adoption.
The entries MUST match the source pack hashes
(`BUILD_CONTRACTS_MISSING`, `BUILD_CONTRACTS_UNEXPECTED`, and
`BUILD_CONTRACT_PACK`).

### 10.6 Addresses

An adoption's address is `contracts.<adoption>`. One of its values is
`contracts.<adoption>.<value>`. Both forms are written exactly that way in
prose and JSON, resolve against the adoption file, and use `contracts` as a
reserved first segment under §4. A dangling adoption or value address is a
validation failure.

Inside a pack, `{{value-cite:<value>}}` renders the literal
`contracts.<adoption>.<value>` address, never the number. Contract values join
`resolved_tuning.values` under those addresses and are copied unchanged from
the adoption.

### 10.7 Citations in a contract

A pack template cites one of the adoption's values with
`{{value-cite:<value>}}`; rendering produces the dotted address described in
§10.6. A `citation` row field accepts either a dotted tuning or contract
address, or one chapter anchor written `<file>.md#<anchor>`. Every citation
MUST resolve. A chapter target MUST be Fixed: no `> DELEGATED:` or
`> PERSONALIZATION:` authority tag may reach or occur inside the cited
section, because a contract test cannot depend on prose the builder may vary.

An invalid form is `CONTRACT_CITATION_GRAMMAR`, an unresolved target is
`CONTRACT_CITATION_DANGLING`, and a non-Fixed chapter target is
`CONTRACT_CITATION_AUTHORITY`.

### 10.8 The pack

A verification pack is immutable under the SHA-256 of its exact file bytes.
Its filename and top-level `contract` and `version` agree, and its only other
required field is `templates`, an array. Each template requires `id`, `title`,
`type`, `expand`, `test`, and `text`; it may carry `when`, `bindings`,
`collection`, and `inputs`. `type` is `scenario` or `general` and matches
`test.type`. `expand` is
`once` or `per-row`; only `per-row` names a declared row set in `collection`.
`inputs` may declare `scope` and `seeds`, each with an optional `default`.
The adoption supplies each declared input under
`verification.<template-id>.scope` and `.seeds`. A live template whose input
has no `default` MUST be filled there.

**Template liveness.** A `once` template is live when its `when.flag`
condition is satisfied and every question read by a binding is asked. A
`per-row` template additionally needs at least one row that satisfies its
`when.row` condition and carries every field the template reads. A template
that is not live renders no test and accepts no `verification` entry.

**Per-row expansion.** A live `once` template renders one test named
`<adoption>/<template>`. A live `per-row` template renders one test per
matching row, in authored row order, named
`<adoption>/<template>/<row-id>`. Its row declaration therefore has a required,
unique kebab-case string `id`. Template order is the pack's authored order.

Placeholders are `{{instance}}` for the adoption id,
`{{value-cite:<value>}}` for a value address, `{{inputs:scope}}` and
`{{inputs:seeds}}` for verification inputs, `{{bind:<id>}}` for a phrase
selected by an answer or row field, and `{{row.<field>}}` during per-row
expansion. A placeholder that occupies a whole JSON value substitutes its raw
JSON value; one inside a string substitutes text. Expansion is one pass over
pack-authored `title`, `test`, `text`, and binding phrases. Values supplied by
an adoption or row are never scanned again.

That last boundary is enforced as an injection ban. Every supplied string,
including strings nested in an array or object, MUST contain neither `{{`,
`}}`, nor a three-backtick code-fence delimiter. An unknown, unreachable, or
unresolved placeholder is a validation failure. `_`-prefixed annotations are
stripped from a rendered test.

### 10.9 Forking

A catalogue definition is immutable under its published identity. Editing its
definition part creates a fork: the catalogue's identity and pack no longer
apply, the adoption drops to promised, and the audit records a finding naming
the divergence. To check the fork, publish it under a new `contract` or
`version`, give it its own origin and pack, and update the pack hash.

The package validator does not contact a catalogue and cannot discover that
two unrelated definitions claim the same id and version. Catalogue identity
rules therefore apply only to unforked copies. The audit records the digest of
the definition part it actually judged (§2d), so the bytes covered by its
finding or verdict remain explicit.

### 10.10 What this layer does not do

- **No registry or online lookup.** Definitions and packs travel by copy and
  remain readable offline. The catalogue publishes them but does not make
  their ids globally unique.
- **No dependencies between contracts.** A definition is readable and
  removable on its own. Interactions between two adopted mechanisms belong in
  package prose and game-local acceptance tests.
- **No composition algebra.** The package authors the seam between mechanisms.
- **No implementation code.** A contract specifies behavior. A library may
  claim it implements that behavior only through evidence outside the format.
- **No semantic review by validation.** Mechanical validity proves the file
  shape, references, ranges, rules, pack pairing, and rendered test shape. It
  does not prove that the mechanism or its answer options are well designed.

## 11. What this version deliberately excludes

*For everyone. One page, and it may save you designing something the format cannot carry yet.*

This version deliberately excludes:

- multiplayer and networking;
- rendered-capture certification for 3D graphics. A `web-3d` package
  validates, and a build of one can assemble a full record under the
  experimental protocol (§2d) when its complete acceptance suite needs only
  logic and state observations. The audit profile defines one browser capture
  recipe, but no standardized recipe for 3D rendered captures
  (`conformance/CERTIFICATION.md#audit-profile`);
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
