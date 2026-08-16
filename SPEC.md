# OpenGDD v0.5 draft

OpenGDD is an open format for game design documents. Designers write the game
in prose. Structured data makes selected claims checkable. Three authority
levels state which decisions stay fixed, which belong to the builder, and
which are resolved separately for each build.

A builder turns the document into a running game. The builder may be a person,
a studio, an AI agent, or a combination. The document can also carry optional
attribution and commerce terms. The core format does not require a particular
transaction model.

Version 0.5 calls designer-defined names symbols (§8) and rebalance-safe
numeric values tunables (§4). It retains the art-direction block (§9),
descriptor layer (§8), and grid-layout encoding (§7a).

Throughout this document, the words MUST, MUST NOT, SHOULD, and MAY are used
in their RFC 2119 sense.

Status: v0.5 draft. License: specification text CC-BY-4.0; schemas and
validator code MIT.

## The two roles (non-normative)

A spec connects the designer who authors the game with the builder who
implements it.

| The **designer** | The **builder** |
|---|---|
| Writes the spec. Prose carries the design intent. Structured data makes selected claims checkable. The designer chooses an authority level for every design statement. | Turns the spec into a running game. A builder may be a person, a studio, an AI agent, or a combination. |
| Owns every difference a player could notice that changes how the game plays (§2a). | Owns how the game is made: the code, the pipeline, everything no player could tell apart between two faithful builds — plus whatever visible surface the spec expressly delegates (§2a). |

One person can hold both roles, and often will. The roles stay distinct
because a design can travel: if the designer wishes, the same spec can go
to any number of builders, and every resulting build is judged against the
same acceptance tests (§6, §7). When a design travels under terms, the
manifest's optional commerce members record them (§3).

## Terms, for designers (non-normative)

This section is a reading aid for designers meeting the format for the first
time. It is not part of the format. Nothing here adds a rule, removes one, or
changes what any rule requires. Where a summary below and the numbered
sections disagree, the numbered sections are right.

### Words borrowed from standards writing

| Term | Meaning |
|---|---|
| **Normative** | A statement that decides whether something is correct. If a package or a build breaks one, it does not conform. **Informative** text explains, gives examples, and states intent. It decides nothing. |
| **MUST, MUST NOT, SHOULD, MAY** | Set in capitals, these four words are exact. MUST is a requirement. MUST NOT is a prohibition. SHOULD is a strong recommendation, which you may set aside when you have a reason and have weighed it. MAY is a genuinely free choice. The convention comes from RFC 2119, a short standards document that fixed these four meanings so nobody has to argue about them again. |
| **Schema** | A machine-readable description of what a JSON file is allowed to contain: which members have to be there, what type each one holds, and which values are legal. OpenGDD publishes its schemas next to this document. |
| **Validator** | A program that reads a package and reports what is wrong with it. It checks the schemas, and it also checks rules a schema cannot express, such as whether every reference points at something that exists. |
| **Conforming** | Satisfying the format's rules. A package conforms, a build conforms, and a validator conforms, each against the rules written for it. |
| **Certified build** | A build whose §7 evidence record has passed the separate audit described by the draft certification protocol. Conforming is the standard a thing meets. Certification is the audited record that proves a particular build met it. In v0.5 the protocol is experimental: its draft names verdicts, but none is normative (§2d). |

### Words this format defines for itself

| Term | Meaning |
|---|---|
| **Spec, package** | A spec is one game's design, written in this format. It is a directory of files (§1). This document says *package* when the files themselves are the subject, and *spec* when the design is. |
| **Manifest** | `manifest.json`, the file at the top of the package. It names the spec, the entry-point chapters, the build plan, and the tuning file (§3). |
| **Carrier** | Much of a design is written twice: once as prose for a person, once as structured data for a program. The carrier is the machine-readable half of that pair: the JSON file or JSON block a program reads and checks. `direction.json` is the carrier for the art direction written into `04-presentation.md` (§9). |
| **Fantasy block** | Every game idea begins with a fantasy, meaning what the player gets to be and feel. A spec opens the same way. `01-overview.md` starts with the fantasy in a fixed shape: one sentence of player fantasy, three to five feel adjectives, and a line saying what the game is not (§1a). It sits inside a fence tagged `fantasy`. |
| **Fixed, DELEGATED, PERSONALIZATION** | The three authority levels (§2). Every design statement in a spec carries one of them. Fixed is the default, and means build it as written. DELEGATED hands that decision to whoever builds the game. PERSONALIZATION hands it to an answer chosen for that one build. The designer writes the questions in `personalization.json`, each build supplies its answers, and a skipped question falls back to the `default` the designer wrote (§5). |
| **Symbol** | A designer-defined name in a carrier or declared namespace. Symbol identity is scoped: the same spelling in two scopes may name different symbols, and first use defines the symbol in that scope (§8). |
| **Tunable, constant** | Both are numbers listed under a key in `tuning.json`. A tunable is listed under `tunables`, and a revision that only rebalances the game may change it. A constant is listed under `constants`, and a rebalance may not touch it: changing a constant is a change to the mechanics or the content (§4). |
| **Build contract** | The aggregate agreement in `manifest.json`: the spec's identity, chapters, build plan, tuning, and optional personalization inputs (§§1, 3). |
| **Contract pointer** | A machine member, such as a collection's `contract`, that points to the Fixed prose section defining its semantics (§1b). |
| **Acceptance test** | A numbered check written into `05-build-plan.md`, `AT-1` onward. Each one pairs test text a person can read with a JSON block a program reads to run the check (§6). Acceptance tests are what a build is certified against under the experimental certification protocol (§2d). |

## 1. Package layout

A spec is a directory. It travels as a zip file or a git repository.

```text
my-game/
  manifest.json          # identity + build contract — REQUIRED
  tuning.json            # runtime tunables and numeric constants — REQUIRED
  personalization.json   # designer-authored per-build questions — optional
  01-overview.md         # pitch, pillars, player experience — REQUIRED
  02-mechanics.md        # complete rules — REQUIRED
  03-content.md          # story, characters, dialogue, levels/generation — optional
  04-presentation.md     # art direction, audio direction, UI, feel — optional
  05-build-plan.md       # phases, checkpoints, acceptance tests — REQUIRED
  assets/                # optional reference images, palettes, sketches
  <declared content>/    # optional structured collections (§1b) and fixtures
```

The build contract lives in `manifest.json`. It names the entry-point
chapters, the build plan, and the tuning file (§3).

The Markdown chapters are written for the builder who will turn the spec into
a game. Ordinary prose is welcome. Write complete chapters and keep them
short: every rule a player could observe is decided —
written precisely, or expressly handed over under one of §2's authority
levels, on the boundary §2a draws — and each rule is stated once. Length is
not thoroughness — a spec that decides everything in few words builds
better, reads better, and costs less to build from. §2a's tie-break rule is
one example of what that precision requires.

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
holds: write `hazard.interval_seconds`, never the number stored under it.

Every package-relative path MUST remain inside the package after
normalization, so resolving its `..` segments must not lead out of the
package directory. `assets/../../elsewhere.png` resolves outside, and is
invalid.

## 1a. The fantasy block (required)

`01-overview.md` MUST open with a fenced `fantasy` block. The fence carries
the tag `fantasy`, and the block MUST be the first substantive content in
the file, after the opening `#` title heading. It holds three things:

- **One sentence of player fantasy.** "You are the getaway driver, and the
  plan is already falling apart."
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
- The **player fantasy** is the first line opening with neither label. It
  MUST end with a sentence-ending mark. It MUST carry exactly one such mark
  followed by whitespace or by the end of the line. The marks are `.`, `!`,
  and `?`.

A sentence-ending mark closing the `Feel:` or anti-reference line is
punctuation, and not part of the last entry on it.

```fantasy
You are the getaway driver, and the plan is already falling apart.
Feel: fast, slick, breathless.
NOT: grindy, tactical, punishing.
```

A spec deliberately leaves some decisions to the builder. Those are its
DELEGATED sections, tagged `> DELEGATED:` (§2), and they turn up in any
chapter: a presentation chapter might delegate the menu typeface, or the
paint on the getaway car.

**Every DELEGATED section is implicitly constrained by the fantasy block.**
The block is the tie-breaker for every delegated decision in the spec, no
matter which chapter makes it. When the block says "NOT: punishing" and a
delegated choice is open between a harsh crash sound and a soft scrape, the
soft scrape wins.

## 1b. Structured content collections

Structured content, such as a deck of cards, a table of enemies, or a tree of
dialogue nodes, is discoverable through the optional `content` array in
`manifest.json`. Each entry in that array declares one **collection**.

```json
{
  "id": "cards",
  "format": "example-card-catalog-v1",
  "contract": "03-content.md#card-catalog-format",
  "source": {
    "kind": "catalog",
    "file": "cards/catalog.json"
  },
  "authority": { "level": "fixed" },
  "id_member": "id",
  "verification_profile": "card-catalog"
}
```

Each collection MUST declare six things:

- **`id`** — a name for the collection, stable and unique within the package.
- **`format`** — a versioned id for the format this collection is written
  in, such as `example-card-catalog-v1` above.
- **`contract`** — a contract pointer to the Fixed chapter section that
  defines this collection's collection-record kinds, fields, references, and
  closure rules. The reference checks further down are decided by those rules.
- **`source`** — where the collection records live. Either `catalog` with
  exactly one `file`, or `items` with one `directory` and an explicit ordered
  `members` list.
- **`authority`** — an authority level, written with the machine values from
  §2.
- **`id_member`** — the name of the collection-record field whose values are
  stable and unique inside this collection. Collection records keep whatever
  field they already have: a dialogue tree whose nodes carry `node_id`
  declares `"id_member": "node_id"`. The catalog above simply uses `id`.

A collection held in a single file still declares all six; the simplest case
is not an exception.

An item collection keeps its collection records as separate files in a
directory, and its `members` list is the collection: it MUST name every file
the collection uses, in order. The order files happen to sit in the directory
on disk means nothing.

Three rules hold over every collection:

1. Every declared file and item MUST exist.
2. Every stable id MUST be unique inside its collection.
3. Every reference MUST resolve under the target and closure rules defined in
   the collection's contract section.

These rules are not for the designer to memorize: they are checks the
validator runs and reports. Four findings are hard validation failures: a
missing member, a consumed member the collection never declared, a dangling
reference, and a reference cycle the collection's contract section forbids.

(A note for tool authors rather than designers: collection-id uniqueness and
stable-item-id uniqueness are the validator's checks, not JSON Schema's —
`uniqueItems` compares whole array entries, not one chosen field inside
them.)

`verification_profile` is optional. It links the collection to the §6
descriptors.

A collection's contract section may define fields particular to its own game,
and `tie_break` is one such field. Core OpenGDD does not define dialogue node
kinds, effect verbs, card verbs, grid glyphs, recipe semantics, or screen
geometry. A per-collection-record `condition` member is another field defined
in that section, and §4a constrains what its expressions may bind to.

Every overridable collection record MAY carry an authority of its own:

```json
{ "authority": { "level": "personalization", "question": "theme" } }
```

The machine values are `fixed`, `delegated`, and `personalization`. A
`personalization` collection record MUST name its question. A collection
record at either other level MUST NOT name one. A collection record carrying
no `authority` inherits the authority of its collection. A local alias such as
`voice` MUST NOT create a second authority channel.

## 1c. Declared graph edge sets

Collection records point at one another. A card in §1b's catalog might carry a
`set_id` field holding the id of the set it belongs to. Each such pointer
is an **edge**. §1b already requires every reference to resolve, but that
is all it requires. What an edge means, and which field carries it, is
written only as prose in the collection's contract.

Structural claims about the graph as a whole then have nowhere to sit, so
each package writes its own lint rule for them. Those claims include
closure, acyclicity, reciprocity, and monotonicity. The optional manifest
member `graphs` gives the edges a declared, typed form instead. A card's
`set_id` edge would be declared exactly this way; the example below is a
technology tree's prerequisite edges, because that graph runs deep enough
to exercise the structural claims further down:

```json
{
  "id": "tech-prerequisites",
  "edges": [
    {
      "from": { "collection": "technologies" },
      "member": "prerequisite_ids",
      "to": [{ "collection": "technologies" }]
    }
  ],
  "inverse": { "member": "unlocks" }
}
```

- `id` is package-unique, kebab-case.
- Each **edge site** declares `from.collection`, `member`, and `to`.
  - `from.collection` names a declared §1b collection id.
  - `member` names the collection-record field carrying target ids. It is
    written as a member name, or as a JSON Pointer for a nested site, and it
    holds one id or an array of ids.
  - `to` is the complete list of permitted target collections.
- **Orientation is fixed.** Every extracted edge points from the collection
  record that carries `member` to the collection record it references. For
  `prerequisite_ids` on a technology, edges point dependent → prerequisite.
- A site whose target collection varies from one collection record to another
  MUST name a `discriminator` member. By default, the discriminator's value on
  each collection record MUST equal the id of one collection listed in `to`.
  When the discriminating values are domain vocabulary rather than collection
  ids, the site declares a `discriminator_map` from each permitted value to a
  collection listed in `to`, and an unmapped value is a hard failure.
  Without a discriminator, a target id that exists in more than one
  permitted target collection is a hard failure, the ambiguous edge.
- `inverse` optionally names the back-pointer member on the target collection
  records, which is what makes reciprocity checkable. The back-pointer member
  holds one id or an array of ids, under the same extraction rule as `member`.

Declaring an edge set makes **existence-closure** an unconditional
obligation, checked as part of package validation: every edge value MUST
resolve to a collection record in a permitted target collection.

All other predicate classes are claims. Each MUST be invoked by a §6
`static-lint` acceptance test whose `rule_set` is `opengdd-graph-1`. Those
rules use the closed descriptor grammar below. A rule carrying members
outside its own predicate's list is invalid. No predicate here carries
rates, capacities, or flow fields.

1. **`existence-closure`** — `{ "predicate": "existence-closure",
   "edge_set": <id> }`. This restates the unconditional check above as a
   claim a test can cite. Diagnostics: `dangling-edge`, carrying the source
   collection-record id, the member, and the value.
2. **`acyclic`** — `{ "predicate": "acyclic", "edge_set": <id> }`. The edge
   set induces a directed acyclic graph, so no path returns to where it
   started. Diagnostics: `cycle`, carrying one complete cycle as an ordered
   list of collection-record ids.
3. **`reciprocal`** — `{ "predicate": "reciprocal", "edge_set": <id>,
   "exemptions": [ { "collection": <id>, "id": <record-id> } ] }`, where
   `exemptions` is optional. Forward edges and declared `inverse`
   back-pointers form a bijection in both directions, so each forward edge
   has exactly one matching back-pointer and the reverse holds too.
   Exempted collection records are ignored. The edge set MUST declare
   `inverse`.
   Diagnostics: `one-way-edge`, `dangling-back-pointer`, and
   `duplicate-edge`, each carrying both collection-record ids.
4. **`bounded-reachability`** — `{ "predicate": "bounded-reachability",
   "edge_set": <id>, "roots": [ { "collection": <id>, "id": <record-id> } ],
   "bound": { "kind": "depth" | "nodes", "maximum": <positive integer> } }`.

   The obligation is root coverage. Every collection record in the edge set's
   source and target collections is reachable from some declared root, within
   the bound, following declared edge orientation.

   The two bound kinds measure different things. `kind: "depth"` bounds the
   edge count of any accepted path from a root. `kind: "nodes"` bounds the
   total number of distinct collection records the search may visit.

   Exceeding the bound before coverage is decided is itself the
   `bound-exceeded` failure. It never passes silently. Diagnostics:
   `unreached-id`, `bound-exceeded`.
5. **`monotone-attribute-along-path`** —

   ```json
   {
     "predicate": "monotone-attribute-along-path",
     "edge_set": "tech-prerequisites",
     "attribute": { "member": "era_order" },
     "direction": "non-increasing"
   }
   ```

   `attribute` takes one of two forms. `{ "member": <name> }` applies when
   every collection in the edge set uses one member name. `{ "members": {
   <collection-id>: <name>, ... } }` covers every collection the edge set
   touches, one name each.

   `direction` compares along declared edge orientation. `non-decreasing`
   asserts attribute(from) <= attribute(to) on every edge. `non-increasing`
   asserts attribute(from) >= attribute(to). The example above is
   `non-increasing` because prerequisite edges point dependent →
   prerequisite, and the claim being made is prerequisite.era <=
   dependent.era.

   The check runs edge by edge, and passing it implies the property holds
   along whole paths. The path-level property is the certified claim.

   A missing or non-numeric attribute on any collection record in the edge set
   is a hard failure. The attribute rule is decidable from package bytes and
   is a package-level rule (§2d); evaluating the predicates themselves runs
   through the citing §6 `static-lint` test. Diagnostics:
   `monotonicity-violation`, carrying both
   collection-record ids and both values, and `missing-attribute`.

Diagnostics are per file, collection-record id, edge, and rule, as §6
`static-lint` already requires.

The carrier is structure-only. It does not define what an edge *means*:
recipe, unlock, and adjacency semantics stay in the collection's contract
section. It carries no rates, capacities, conservation, throughput, or
steady-state flow claims, no runtime graph state, and no solver predicates
(§6, §7a).

## 2. The three authority levels

Every design statement in the spec carries one of three authority levels.
Fixed is the default and needs no tag. Chapters mark non-default sections
with a blockquote tag.

| Level | Tag | Meaning |
|---|---|---|
| **Fixed** | (default, untagged) | Build exactly as written. Deviation fails certification under the experimental protocol (§2d). |
| **Delegated** | `> DELEGATED:` | The builder decides. The spec states intent and constraints; the implementation may vary. |
| **Personalization** | `> PERSONALIZATION: <id>` | Resolved by the answer to question `<id>` in `personalization.json`. |

The taxonomy is borrowed from tabletop roleplaying modules, which separate
read-aloud text from guidance meant for the game master. It is the core
mechanism of the format. It makes every build unique while keeping the design
intact.

## 2a. The responsibility boundary

One test decides which statements must be Fixed and which may be Delegated:
**does the difference change play, in a way a player can observe?**

Suppose two builds of one spec differ. If a player could notice the
difference, and it changes how the game plays, that difference is design
surface. The spec must pin it, and give the design reason. If no player could
ever tell, it is the builder's craft.

That leaves a third case, and it is the common one in presentation: a
difference a player plainly sees which does not change how the game plays.
Two builds may light the same room differently, or animate the same win at
different speeds. That surface is Delegated. A designer who wants to
constrain it without pinning it uses the art-direction block (§9), which
states targets and leaves the means open.

The rendering technique is one such surface. A spec's §3 `platform` names
the state space the design is responsible for; the renderer that draws it is
the builder's, and a `web-2d` world may be drawn with flat sprites or a
perspective 3D renderer without touching the design surface, provided every
Fixed and constrained claim still holds. The build declares its renderer in
`opengdd-build.json` (§7); the spec never does.

Some decisions belong to neither party, but to **the format itself**. These
are ecosystem properties, where builds agreeing with each other matters more
than anyone's preference. v0.2 fixes three of them.

- **PRNG algorithm.** Seeds are strings. Hash an addressed seed's exact UTF-8
  bytes with FNV-1a (32-bit), then drive Mulberry32. For the designer this
  means a random stream is named by a readable address, and a Fixed procedure
  reading that address draws the same sequence in anyone's build, which is
  what makes a seeded acceptance test checkable.
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

  An address may carry more than one `unit:index` component, as in
  `{seed}:chunk-x:-4:chunk-y:7:stream:terrain`. Ordinal units may nest, as in
  `{seed}:arena:2:wave:4:spawn:7:stream:choreography`. The v0.1 floor form
  remains `{seed}:floor:{n}` with non-negative `n`. A root stream is allowed
  only when declared. No free-form path segment is an address.

  Named streams isolate draw sequences from each other. The same address and
  Fixed consuming procedure MUST produce the same result in every build. A
  Delegated consuming procedure promises deterministic replay only within its
  own build and that build's Fixed invariants. So a spec MUST NOT require an
  exact cross-build artifact hash while delegating the procedure that creates
  it.
- **Tie-break lint rule.** Some rules force a choice: which target, which
  order, what happens when two conditions fire at once, which of two equal
  distances wins. Every such rule MUST state its tie-break. A validator
  should flag choice-shaped verbs such as "nearest", "first", and "when both"
  when no tie-break is present.

## 2b. Spec lifecycle

Three stages describe how far a spec has been proven.

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

Reviews attach to builds, and never to specs. A spec's quality signal comes
instead from its certification rate, its independent-build count, and the
ratings of its certified builds.

## 2c. Ruleset state

Some games change which rules are active while play is in progress. A game
might swap one complete ruleset for another. It might derive rules from the
board layout after every step, or activate predeclared effects at runtime.

Fixed prose can define these systems, and declared state can represent them.
The optional manifest member `ruleset_state` gives that pattern a shared
structure:

```json
{
  "ruleset_state": {
    "rulesets": [
      { "id": "act1-cabin", "initial": true },
      { "id": "act2-pixel" }
    ],
    "hooks": {
      "id": "law-hooks",
      "contract": "03-content.md#law-verb-table",
      "members": ["allow-assignment", "set-cookhouse-recipe"]
    },
    "derived_predicates": {
      "id": "active-rules",
      "contract": "02-mechanics.md#rule-recomputation",
      "subjects": ["baba", "wall", "flag", "rock"],
      "predicates": ["you", "win", "stop", "push"],
      "derivation": "fixed"
    },
    "identity_sets": [
      { "entity_class": "board-entity",
        "contract": "02-mechanics.md#identity-mutation",
        "entities": { "collection": "board-entities" },
        "candidate_types": ["baba", "wall", "flag", "rock"] }
    ]
  }
}
```

A `ruleset_state` block MUST contain `rulesets`, or one or more of `hooks`,
`derived_predicates`, and `identity_sets`. Every member list is explicit,
finite, and closed when the spec is authored.

`hooks`, `derived_predicates`, and every `identity_sets` entry carry a
`contract` pointer. It points to the Fixed chapter section that defines that
construct's semantics, under §1b's closure discipline. A ruleset needs no
contract pointer of its own. Its semantics are the chapter statements tagged
with its id, using the tag defined below.

When `rulesets` is present, its ids are unique and exactly one entry carries
`initial: true`.

Every `derived_predicates` block MUST carry `derivation: "fixed"`.
`derivation` names the authority level of the recomputation procedure. That
procedure is Fixed, and the build must implement it. The format names the
procedure and binds it to a contract pointer. The pointed-to prose expresses
what the procedure does. Hook and derivation semantics therefore remain Fixed
prose.
The format defines no effect or mutation language, and `opengdd-expr-1`
remains read-only.

Each `identity_sets` entry declares its entity id space through `entities`.
It takes one of two forms:

- `{ "collection": <§1b collection id> }` uses the stable item ids from that
  collection.
- `{ "members": [<explicit id list>] }` supplies the ids directly.

Every entity id used in a `state:member` identity reference MUST match
`^[a-z0-9]+(-[a-z0-9]+)*$`, the kebab-case grammar. The `:` delimiter cannot
appear in any segment. When an identity set uses a collection, any stable id
that violates this grammar is a hard failure.

These declarations make four §4a reference forms resolvable. Each reference
has a Boolean value:

- `state:member:ruleset:<ruleset-id>` is true when that ruleset is active.
- `state:member:<hooks-id>:<hook-id>` is true when that predeclared hook is
  live.
- `state:member:<predicates-id>:<subject>:<predicate>` tests membership in
  the derived rule universe. This is a three-segment `state:member` form.
  §4a admits it only for a declared `derived_predicates` block.
- `state:member:<entity-class>:<entity-id>:<type>` reports an entity's
  current identity. This is also a three-segment form. It is valid only when
  a declared `identity_sets` entry contains the entity id in its `entities`
  space and the type in its `candidate_types`.

The first segment after `state:member` is a namespace. The id `ruleset` is
reserved. The ids of `hooks`, `derived_predicates`, and every `entity_class`
MUST be mutually unique. They MUST NOT equal `ruleset` or collide with any
§4a declared-set id. A colliding declaration is a hard failure.

Use `> RULESET: <id>` to scope a prose section to one ruleset. A
`tuning.json` `meta` entry MAY also carry a `ruleset` member. Both forms MUST
name a declared ruleset id. A dangling tag is a hard failure.

A prose tag has an exact syntactic scope. It starts at the tag and ends at
the next `> RULESET:` tag in the same heading section, or at the end of that
section, whichever comes first. The section ends at the next heading of the
same or a higher level. An untagged statement is authoritative under every
ruleset.

The core lint promise covers exactly three things: parsing ruleset tags,
checking that each ruleset tag and `tuning.json` `meta.ruleset` value names a
declared ruleset id, and enumerating which statements are shared or belong to
one ruleset.

Tags cannot establish semantic claims about mutual exclusion or reachability,
such as "these two rulesets are never simultaneously active." Game-local §6
tests discharge those claims. Use a `scenario`, an `exhaustive-search` test,
or a game-local `static-lint` rule set.

Four things remain deliberately out of scope:

- mechanics that let players create new rule vocabulary during play.
  Certification tests against a declared, finite vocabulary; a rule word
  that first exists at runtime has no declared set to test against. A
  fixed vocabulary the designer declared in full is fine, however the
  player combines it;
- any mutation language;
- any coupling to a solver profile, so §7a remains unchanged; and
- any semantic ontology for what activated rules mean. Endings and
  consequences remain authored predicates over declared memberships.

## 2d. Conformance layers and certification status

v0.5 defines two normative conformance subjects for a design — the package
and the build record — and one experimental protocol. Every conformance or
certification statement in this document reads against this section. Prose
also says that a validator or a runtime outcome conforms; those uses read
against the rules written for them and introduce no third release subject.
The severity vocabulary is two-valued throughout: "hard failure",
"validation failure", and "validation error" all name conformance-deciding
errors in their layer, and lint-level findings or validator warnings advise
without deciding — with one §7 exception: the check-6 shortfall warning,
where the deciding rule is `passed == total` and the warning merely reports
it.

**Package conformance (normative).** A package conforms when each of its
machine files validates against its published v0.5 schema — `manifest.json`
against the manifest schema and, when present, `direction.json` against the
direction schema — and the package satisfies every package-level MUST in this
document. A package-level MUST is one decidable from the package bytes alone.
A MUST about build behavior, cross-build stability, or test execution reads
against the build-record or experimental layer instead. The published
validator implements checks of package conformance; the rules, not any one
tool's current coverage, define it. Package-level rules are of two kinds.
Machine-decidable rules — schema validity, closure, surface grammar, and
cross-file consistency — are decided by validation, and a validator error is
a conformance failure. Prose obligations, such as §2a's tie-break rule or the
rule that normative prose cites a tuning key rather than repeating its value,
bind the package with the same force, but deciding a violation can take human
judgment; a validator surfaces likely violations as warnings, and a warning
does not by itself decide conformance.

**Build-record conformance (normative).** A build conforms when it ships an
`opengdd-build.json` that validates against the build schema and passes every
§7 validator-level cross-document check, including the §7 and §9.11
direction-result and certified-pin rules. The record is the builder's
completion claim: shipping it asserts that every acceptance test passed and
every certified pin matched. v0.5 machine-checks the record's internal
validity and its consistency with the source package; it does not audit the
assertion's truth. Auditing truth is certification. A build that still fails
a test does not yet ship a conforming record; what it has are §2b ambiguity
reports.

**Build certification (EXPERIMENTAL in v0.5).** Certification is the audited
claim that one particular build faithfully implements its spec: executing the
§6 acceptance tests, accounting for every Fixed statement, scoring judged
direction claims (§9.11 — a scoring whose panel protocol is not yet
integrated and sits outside the published draft's audit scope), and auditing
the §7 `harness` evidence under the
conformance certification protocol published at `conformance/CERTIFICATION.md`
in the OpenGDD conformance suite. v0.5 does not define a normative
certification verdict, a complete machine grammar for `verification`
descriptors, or a panel protocol for judged claims. Where this document
describes certification, it describes the intended shape of that protocol.
No v0.5 statement grants or withholds a certification verdict, and no
construct in this document can fail a build's certification, because v0.5
defines no normative verdict: the draft protocol's verdicts are experimental.

The experimental status changes no carrier shape. `opengdd-build.json` keeps
its required members, including `harness`, and packages keep their §6
structural obligations. Record conformance checks the `harness` member's
shape and counts only: no record-conformance check executes tests or
reproduces hashes. Fixed statements bind at full force regardless:
passing every acceptance test is necessary evidence for the experimental
certification protocol and never sufficient, because a Fixed statement binds
whether or not a numbered test restates it (§2).

## 3. manifest.json

The manifest carries the spec's identity and build contract. It is
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
  and tuning file. It may also name a personalization file.

`build.direction` names the optional §9 art-direction carrier,
`direction.json`. As of v0.5 the rules for that file are normative, and it
has a schema of its own. A
direction block in `04-presentation.md` and a declared carrier MUST appear
together. If either appears without the other, validation fails.

Five optional top-level fields declare other package structures:

- `content` declares §1b collections.
- `graphs` declares §1c edge sets over those collections.
- `ruleset_state` declares the §2c block.
- `descriptors` declares the named descriptor families from §8. Mood is the
  only populated family in v0.5 (§8a).
- `verification_profiles` declares configured §6a instances. Each one defines
  the certifiable envelope for a simulated material system, such as fire
  spread or falling sand, without fixing how it is implemented.

`verification_profiles` and `capture_profile` name different things. A
`verification_profiles` entry is a claim envelope in the spec. The
`capture_profile` in `opengdd-build.json` identifies the capture adapter and
serving recipe used for one certification run (§7).

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
Game-spec certification never requires commerce metadata. Whether the profile
is present or absent MUST NOT change gameplay expression, authority, or build
certification.

`opengdd-share-v0` permits building and deployment under the declared split.
Revenue-bearing builds must ship with attribution metadata. The percentages
in `split` MUST sum to 100.

`derived_from` is **Reserved** and inert in v0.x. It records lineage metadata
only. Fork licensing and royalties remain outside v0.x. Modifications beyond
the declared personalization bounds have no certified path. These rules
belong to the commerce profile and do not change core artifact semantics.

## 3a. Canonical schema URLs

Every published schema is identified and served at a canonical URL:

```text
https://opengdd.org/schema/<layer>/v<minor>/<file>.schema.json
```

For example:

```text
https://opengdd.org/schema/core/v0.5/manifest.schema.json
```

Four rules govern these URLs:

1. **The layer comes before the version.** Each layer versions independently.
   `core` is the only layer today. A future commerce profile could be another.
   The URL layout MUST NOT imply that different layers share one version.
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

For a designer, what these rules protect is durability. A spec that declares
`"opengdd": "0.5"` is checked against the schemas at `/core/v0.5/`, and that
address still serves those schemas years from now. Corrections appear there
as published errata, never as a silent change of verdict.

## 4. tuning.json

`tuning.json` assigns each runtime number a role:

`tunables` and `constants` name the change-authority axis: a rebalance-safe
knob versus an identity-bearing pillar. Neither is a runtime variable.
Rebalancing is change by degree, which presumes numbers; discrete choices are
declared sets, and text is content records.

```json
{
  "tunables": { "hazard.interval_seconds": 1.2 },
  "constants": { "lane.count": 2 },
  "meta": {
    "hazard.interval_seconds": { "range": [0.8, 2.0], "certify": true },
    "lane.count": { "certify": true }
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
  revision may change MUST live here.
- **`constants` is optional.** It is a flat object of numeric Fixed rules
  exposed to runtime data. Changing a constant is a mechanics or content
  change. A balance-only revision cannot change it.
- **`meta` is optional.** Its keys come from `tunables` or `constants`. A
  `range` is an inclusive `[minimum, maximum]`, and is allowed only when the
  key comes from `tunables`. `certify` says whether the built value must match
  the resolved snapshot. A `meta` entry MAY also carry a `ruleset` member
  naming a §2c ruleset id.
- **`invariants` is optional.** It contains the §4a expressions. Every
  invariant MUST evaluate true after personalization resolution and before a
  run starts. At package validation the validator evaluates invariants at
  package defaults; over a personalized build's resolved snapshot the same
  obligation is audited under the experimental protocol (§2d).
- **`clocks` is optional.** It declares the §4b regimes-and-clocks block.

A key MUST be unique across `tunables` and `constants`. Every `meta` key MUST
exist in exactly one of those objects. A balance-only game-spec revision may
change only `tunables`, and only within declared ranges. It MUST NOT change
`constants`, structured-content facts, or verification fixtures.

Numbers that belong elsewhere stay elsewhere:

- A numeric semantic cardinality MAY remain in Fixed prose when no machine
  consumer needs it. A mechanics chapter saying a run lasts three rounds is
  one such number.
- A per-content measurement or solver-derived fact lives with its structured
  content item.
- Verification inputs, sample counts, seed sets, schedules, expected
  observations, and tolerances live in the acceptance test or its fixture.
- Examples and identifiers carry no numeric authority. A displayed numeric
  example in prose MUST be marked non-normative.

## 4a. Declared expressions and invariants

`opengdd-expr-1` is a closed, typed abstract syntax tree stored as data. It is
never source text. A named expression has four members: `language`, a stable
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
`tuning.json`. The other three reach into declared runtime state and declared
content:

- `tuning:<dotted-key>` → number from the resolved `tunables` or `constants`;
- `state:number:<declared-id>` → number from a declared runtime inventory,
  resource, counter, or other numeric state binding;
- `state:member:<declared-set-id>:<declared-member-id>` → Boolean membership in
  a declared runtime set; and
- `content:<collection-id>:<JSON-Pointer>:count` → numeric length of a declared
  array.

A format or profile contract MUST declare every runtime-state binding. For
each binding, it declares the type and when the value is read.

A §2c `ruleset_state` declaration is one such contract. It makes the ruleset,
hook, derived-predicate, and identity membership forms listed there
resolvable. This includes the three-segment `state:member` form for declared
derived predicates.

A structured-content condition may bind only declared state ids and literals,
unless its contract opts into another binding.

The following are hard failures: an unknown operator, wrong arity, an
unresolved reference, a type mismatch, implicit coercion, and a non-finite
number. Arbitrary functions and host code are forbidden. So are filesystem or
network access, implicit traversal, recursion, and unbounded iteration.
Reachability and solver predicates belong to §6.

## 4b. Clocks and resolution regimes

A game can bridge two resolution regimes. It might place real-time combat
inside a paused strategic layer, or a turn-based mission inside a running
campaign. Such a game makes player-observable promises about which clocks
advance in each regime. A clock here is one source of advance, such as
running time or a turn index. A spec MAY declare those promises:

```json
{
  "clocks": {
    "regimes": ["strategic-running", "strategic-paused", "tactical"],
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

The `clocks` block is an optional top-level member of `tuning.json`.
`regimes` is a finite, closed list of package-declared ids. Every clock
declares exactly one behavior for every declared regime. The behavior comes
from this closed set: `advances`, `frozen`, `discrete-only`, and
`does-not-exist`.

`discrete-only` is the behavior that the `apply-discrete-order` action
requires below, as `advance-clock` requires `advances`. `does-not-exist` marks
state that has no value outside its regime. It does not mean "frozen at
zero." The object
shape makes contradictory behaviors for one clock in one regime
unrepresentable.

Chapter regime tags, such as `[TACTICAL]`, MUST name declared regime ids. The
reserved tag value `all` marks a statement as authoritative in every regime.
It is equivalent to leaving the statement untagged, but allows the author to
be explicit. `all` MUST NOT be declared as a regime id.

A clock MAY declare `governs`. It is a closed list of §4a typed state
references whose values advance only under that clock. The `governs` lists
of different clocks are disjoint. A reference governed by no clock has no
declared regime behavior. The §4b lint checks below apply only to governed
references.

A clock MAY declare `unit` as a string. The default is the spec's declared
time unit.

A replay fixture (§6) has exactly one **active regime** at every point.
Regimes do not nest or stack. The fixture declares its initial regime.

Fixture schedules use standard regime-transition actions. Each action is a
JSON object. The following four actions are the complete standard set. Any
other `action` value makes the fixture data invalid:

- `{ "action": "enter-regime", "regime": <id> }` — the named regime becomes
  active. Precondition: the id is declared.
- `{ "action": "exit-regime", "to": <id> }` — another spelling of
  `enter-regime` on `to`, kept for trace readability. Its semantics are
  identical.
- `{ "action": "advance-clock", "clock": <name>, "amount": <number> }` —
  `amount` is a finite positive number in the clock's declared unit.
  Precondition: the clock's behavior in the active regime is `advances`.
- `{ "action": "apply-discrete-order", "clock": <name>, "order": <string> }`
  — precondition: the clock's behavior in the active regime is
  `discrete-only`; `order` names a Fixed action defined in the chapters.

An action whose precondition fails is invalid fixture data.

A §6 `scenario` or `property` descriptor MAY carry a **freeze invariant**:

```json
{
  "freeze_invariant": {
    "references": ["state:number:laser_charge_seconds"],
    "regimes": ["strategic-paused", "tactical"]
  }
}
```

The block above says that within any one stretch spent in `strategic-paused`
or in `tactical`, the laser charge reads the same every time the fixture
looks at it. A later stretch may read differently.

For every maximal fixture interval whose active regime is in the named set,
each typed reference MUST have the same value at every fixture observation
point in that interval. This includes the entry and exit boundaries. Typed
references use the §4a forms and must resolve under §4a's declared-binding
rules.

The invariant says nothing about unobserved intermediate states. Naming a
reference governed by a clock whose behavior is `advances` in one of the
named regimes is a lint-level contradiction. Naming one governed by a clock
whose behavior is `does-not-exist` in a named regime is a hard failure.

A freeze invariant asserts only the observation-point equality defined
above. It makes no claim about unobserved states, write ordering,
indivisibility, or rollback. This section defines no transaction or snapshot
semantics. Regime-transition *procedures*, including what a transition writes
and how, remain Fixed prose under §2a.

## 5. Build personalization (`personalization.json`)

`personalization.json` is an ordered list of questions asked before or while
building:

```json
{
  "id": "theme",
  "prompt": "Where does the chase happen?",
  "kind": "choice",
  "options": [
    { "id": "night-city", "label": "...", "notes": "..." }
  ],
  "default": "night-city",
  "affects": ["03-content.md", "04-presentation.md"]
}
```

Every question has one of three kinds: `choice`, `text`, or `number`.
Questions are optional for each build. When a question is skipped, its
`default` applies. For a `choice` question, the declared `default` and every
recorded answer MUST name the `id` of one of its declared `options`: the
resolution pipeline below is defined only for declared option ids, and an
undeclared id is a validation failure.

For creative variants, designers SHOULD write `notes` a builder can act on
directly: concrete instructions. Notes MUST NOT be the only authority for a
numeric change.

### Enumerated answers

A choice option or other enumerated answer MAY declare exact target-key
replacements through `tuning_overrides`:

```json
{
  "id": "rush-hour",
  "label": "Rush hour",
  "tuning_overrides": { "hazard.interval_seconds": 0.9 }
}
```

### Numeric answers

A numeric question that affects tuning MUST declare resolution operations:

```json
{
  "id": "hazard_pace",
  "kind": "number",
  "default": 1.2,
  "resolution": [
    {
      "target": "hazard.interval_seconds",
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
- **`target`** MUST name an explicit `tunables` key. A `constants` key is never
  a legal target.
- **`operand`** is `answer` or a JSON number.
- **`bounds`** is `target-meta-range`.
- **`out_of_range`** is `clamp` or `reject`.

`clamp` uses the target's inclusive `meta.range`. A target without that range
cannot use `clamp`.

Resolution order is deterministic:

1. Apply questions in question-list order.
2. Within each question, apply operations in operation-list order.

Defaults use the same pipeline. Every final target MUST remain within its
declared range.

### The resolved tuning snapshot

The **resolved tuning snapshot** is the complete flat `tunables` map after all
default or supplied answers are applied. For every `certify: true` key,
certification evaluates this snapshot. Package defaults and declared ranges
are not certification targets. `opengdd-build.json` MUST record the answers
and the full resolved snapshot.

Choices made at runtime, such as boons, difficulty modifiers, crafting
choices, and laws, are gameplay state. They are not build personalization.

## 6. Build plan and acceptance tests (`05-build-plan.md`)

Under the experimental certification protocol (§2d), the certification
harness executes this chapter, and its acceptance tests are what a build is
certified against. The chapter's structure below is a normative package
obligation; the executing harness, and a complete closed machine grammar for
`verification` descriptors, are not defined in v0.5 and belong to the
experimental protocol. The chapter MUST contain ordered phases. The v0
convention lists them as `core-loop` → `content` → `tuning` → `presentation`
→ `polish`. Each phase lists its scope, chapter references, and
machine-verifiable checkpoints. Phase structure is a prose obligation (§2d):
v0.5 defines no machine grammar for it, and validators do not decide it.

### Acceptance-test classes

Acceptance tests are numbered `AT-1 … AT-n`. Their machine-checked surface
grammar: an acceptance test is a Markdown heading, at any heading level,
whose text begins `AT-<n>`; numbering MUST start at `AT-1` and be consecutive
in document order. Every `AT-n` heading MUST be
followed by two things: a fenced `verification` JSON descriptor and
human-readable test text. The descriptor declares one of four classes.

- **`scenario`** declares Given/When/Then state and action semantics. An
  optional `replay-fixture` adds a versioned input recording, initial state,
  schedule fixture, ordered expected observations, numeric targets, tolerance
  semantics, and mismatch diagnostics.
- **`property`** declares a quantified input or domain and an invariant. It
  uses either exhaustive domain coverage or a reproducible sampling plan.
  A sampled plan MUST declare a deterministic `seed_set` and sample count.
  Its oracle descriptor MUST declare `oracle: "per-sample"` or
  `oracle: "aggregate"`.
  - `per-sample` applies the invariant to every sample.
  - `aggregate` additionally MUST declare the deterministic `seed_set`,
    measured `metric`, `aggregation`, and `threshold`. `aggregation` is
    `count`, `rate`, `min`, `max`, `mean`, or a declared finite histogram
    with explicit bins.

  A finite named schedule set is a valid property domain. A sampled aggregate
  certifies only its declared bounded distribution claim. It cannot certify
  universal absence.
- **`exhaustive-search`** declares initial states, the legal transition or
  action surface, a predicate, and either a finite-state declaration or an
  explicit state or depth bound. It MUST declare `complete: true|false` and
  the required witness and/or counterexample diagnostics. Only
  `complete: true` may certify absence, a minimum, universal reachability, or
  "every optimal witness" claims. The descriptor MUST name the diagnostics
  that prove success and diagnose failure.
- **`static-lint`** declares spec or content artifacts, a versioned rule set,
  and file/item/rule diagnostics. It does not run the game. The core rule
  set `opengdd-graph-1` (§1c) covers the five structural graph-predicate
  classes over declared edge sets. Game-local rule sets cover obligations
  outside that core set.

A `scenario` or `property` descriptor MAY also carry a §4b
`freeze_invariant` member. When the package declares clocks, its replay
schedules use the standard §4b regime-transition actions.

### Direction-claim citations

A `scenario` or `property` descriptor that covers a §9 direction claim MUST
carry `direction_claims`. This member is a non-empty array of exact dotted
paths. A fixture may cite only these claim kinds:

- `constraints.palette.<key>`
- `constraints.thresholds.<key>`
- `constraints.timing.<key>`
- `motion.<key>`

Pillars, mood, anti-references, and invariants never cite a fixture. They are
scored directly against the finished build under §9.11.

Direction-claim closure runs both ways:

1. Every path in `direction_claims` MUST resolve to a declared
   `direction.json` entry. A dangling citation is a hard failure.
2. Every `constraints.*` entry MUST be named by at least one AT's
   `direction_claims`, and every `motion.*` entry's required `fixture` MUST
   name an AT whose `direction_claims` array includes that entry's
   `motion.<key>` path (§9.11). All
   `constraints.*` entries are fixed observational `checked` claims under
   §9.11. An entry satisfied by no AT is a validation failure.

An AT that carries `direction_claims` MUST NOT restate the cited claim's
value, scope, or class. The §9.5 single-source rule extends to this member.

Example scenario, the commonest class, from the getaway driver's build plan:

```verification
{
  "class": "scenario",
  "given": "a chase running at the certified hazard.interval_seconds",
  "when": ["the road runs for sixty seconds and the player never crashes"],
  "then": ["no two hazards arrive closer together than that interval"],
  "diagnostics": ["hazard-spawn-log"]
}
```

Example aggregate property:

```verification
{
  "class": "property",
  "domain": "generated chase routes at difficulty 3",
  "sampling": { "seed_set": ["night-city", "harbour"], "samples_per_seed": 100 },
  "invariant": "the sampled route can be driven from start to end",
  "oracle": "aggregate",
  "metric": "drivable-route",
  "aggregation": "rate",
  "threshold": { "op": "eq", "value": 1.0 }
}
```

Example complete search:

```verification
{
  "class": "exhaustive-search",
  "initial_states": ["chase-start"],
  "transitions": "02-mechanics.md#legal-actions",
  "bound": { "kind": "action-depth", "maximum": 8 },
  "complete": true,
  "predicate": "every declared ending has a witness",
  "diagnostics": ["witness-per-ending", "unreached-id"]
}
```

Fixture paths MUST be package-relative. When a fixture is structured content,
it MUST be declared through §1b. A tolerance without an expected target is
invalid. A target without its input or schedule fixture is also invalid.

A descriptor states what must be proved. It leaves the implementation
architecture open.

These tests are the executable subset of the spec, not its boundary. Passing
every acceptance test and matching every certified resolved tuning key is
necessary evidence for certification and never sufficient: a Fixed statement
binds whether or not a numbered test restates it (§2). Certification itself
is experimental in v0.5, and build-record conformance is defined by §2d
and §7.

## 6a. Material-simulation envelope profile

A material system might simulate falling-sand fluids, voxel destruction, or
fire spread. Fixing it at simulation grain would also fix cell size,
neighborhood, and update order as implementation architecture. §2a leaves
that architecture open. The named verification profile
`material-simulation-envelope-1` defines the envelope that can be certified.
For a designer, that means promising the declared measures at or above a
stated size, and only at stated moments. How the simulation is built
underneath, down to its cell size and update order, stays the builder's.

### Carrier and references

Configured instances live in the optional manifest member
`verification_profiles`. It is an array of named instances with
package-unique ids. Two places can reference an instance by id:

- a §1b collection's `verification_profile` member; and
- an AT descriptor's `profile` member.

A dangling profile reference is a hard failure.

```json
{
  "id": "destruction-envelope",
  "profile": "material-simulation-envelope-1",
  "min_feature_width": { "ref": "tuning:material.envelope_min_feature" },
  "observation_schedule": ["event:removal-batch", "cadence:fire.step_seconds"],
  "interaction_table": {
    "collection": "material-interactions",
    "materials_collection": "materials",
    "pair_members": ["material_a", "material_b"],
    "interaction_member": "result",
    "priority_member": "priority",
    "inert_value": "inert",
    "completeness": "closed"
  },
  "measures": ["area", "connectivity", "ordered-conversion-events"],
  "measures_contract": "02-mechanics.md#macroscopic-measures",
  "opening_thresholds": [0.5, 1.0, 2.0],
  "subsystems": [
    {
      "id": "fire",
      "outcome_model": "legal-outcome-set",
      "envelope": "02-mechanics.md#fire-envelope"
    }
  ]
}
```

### Minimum scale and observation points

**`min_feature_width`** is a tuning reference in world units. The profile
makes no cross-build promise below that width.

**`observation_schedule`** lists named, discrete observation points. Each
entry has one of two forms:

- `event:<kebab-name>`: the name MUST be an event defined in the Fixed
  chapters or in the citing AT's fixture vocabulary.
- `cadence:<tuning-key>`: the key MUST resolve in `tunables` or `constants`.
  Its value is a period in the spec's declared time unit.

Claims hold at these observation points. They do not bind states between
observations.

### Interaction table

**`interaction_table`** declares pairwise material interactions through §1b
collections:

- `collection` names the collection whose collection records are interaction
  rows.
- `materials_collection` names the collection whose stable item ids form the
  material universe.
- `pair_members` names the two row members that hold material ids from that
  universe.
- `interaction_member` names the row member that carries the interaction
  outcome.
- `priority_member` names the member that carries each row's resolution
  priority or tie-break under the §2a lint. It MUST be non-empty on every row.

`completeness` distinguishes two cases:

- `"closed"` asserts that every unordered pair in the material universe
  resolves to exactly one explicit row. A row whose `interaction_member`
  equals `inert_value` counts as explicit. A missing or duplicate pair is a
  hard failure.
- `"representative"` declares a partial table.

### Measures and claim scale

**`measures`** uses a closed enum:

- `area`
- `center-of-mass`
- `connectivity`
- `free-surface-order`
- `ordered-conversion-events`
- `opening-class`
- `support-collapse-events`
- `fire-envelope-bounds`

This enum standardizes the portable vocabulary. The operational definition
of each declared measure remains Fixed prose behind the instance's
`measures_contract` pointer, under §1b's closure discipline. That definition
covers inputs, units and axes, comparison and tolerance semantics, and
diagnostics.

The `opening-class` measure also requires `opening_thresholds`. This is an
inline, strictly increasing array of width thresholds in the same world units
as `min_feature_width`. The thresholds define the opening classes.

Each AT that cites the profile names its measures, observation points, and
tolerances under the §6 fixture rules. It also MUST carry `claim_scale`: a
finite number in world units that is no smaller than the resolved
`min_feature_width`. That comparison depends on the build's resolved tuning,
so it is discharged at audit under the experimental protocol (§2d); at
package validation a validator MAY check it against the §5 defaults. A
smaller `claim_scale` at the audited resolution is a hard failure there. An
observation
point outside the declared schedule is also a hard failure.

### Subsystem outcome models

Each entry in **`subsystems`** declares one `outcome_model`:

- **`deterministic`**: identical state and parameters produce an identical
  result within a build.
- **`seeded`**: replay uses the §2a addressed PRNG.
- **`legal-outcome-set`**: a seedless Fixed predicate behind the `envelope`
  contract pointer defines the legal outcomes. Any satisfying outcome is
  conforming. The profile makes no cross-run or cross-build promise about
  which satisfying outcome is selected.

A `legal-outcome-set` subsystem MUST NOT declare a seed. A spec MUST NOT
require an exact cross-build artifact hash for that subsystem; this extends
the §2a hash prohibition.

A universal claim says that every possible outcome satisfies the envelope.
Only an `exhaustive-search` with `complete: true` over a declared finite domain
can discharge that claim. Bounded `property` sampling certifies only its
declared bounded distribution claim under §6. It cannot certify universal
coverage.

### Certification boundary

The profile certifies interaction tables and macroscopic envelopes at or
above the declared feature width, and only at declared observations. A claim
below that width or outside the schedule is a hard failure. The profile does
not certify sub-envelope outcomes, states between observations, or universal
emergent behavior.

Simulation grain stays Delegated. This includes cell size, neighborhood,
update order, integrator, exact voxel sets, and debris trajectories.

## 7. Certified builds (`opengdd-build.json`)

A conforming build ships `opengdd-build.json` (build-record conformance,
§2d). This chapter keeps the certification vocabulary — "certified",
"certifies against", "certifying spec" — in §2d's intended-shape sense: the
record is the artifact the experimental protocol audits. The file is
machine-validated
against [opengdd-build.schema.json](https://opengdd.org/schema/core/v0.5/opengdd-build.schema.json).

### Core fields

The required top-level fields are exactly:

- **`opengdd`**: the format version the build certifies against.
- **`spec`**: the `id` and `version` of the built spec.
- **`designer`** and **`builder`**: each carries a name, with optional
  `handle`, `contact`, and `role`.
- **`personalization`**: an `answers` object that maps question ids to the
  answers used. It is an empty object when there are no answers.
- **`resolved_tuning`**: the §5 resolved snapshot. It contains the complete,
  flat `tunables` map after answer resolution and the package `constants`.
  `constants` is an empty object when the package declares none.
- **`harness`**: the certification record. Its required members are:
  - `algorithm`. The only value currently defined is `"sha256"`.
  - `result_hash`.
  - `payload`, with `scope` and `file`. `scope` is the exact human-readable
    payload scope. `file` is a package-relative path to the canonical payload
    bytes covered by the hash.
  - `acceptance`, with `passed` and `total` counts.

Canonicalization follows the conformance certification protocol published at
`conformance/CERTIFICATION.md` in the OpenGDD conformance suite (§2d).
Record conformance checks `harness` for shape and counts only; `payload.file`
is checked as a package-relative path shape, not for existence.
Reproducing `result_hash` and auditing the payload belong to the experimental
protocol, under which a digest without a reconstructible payload is
unauditable and fails the audit.
`harness` may also contain build-local checkpoint records, fixtures, and
transcripts. That additional detail is outside the core contract.

### Cross-document checks

The schema cannot perform every check because some rules depend on the source
package. A conforming validator MUST also verify all of the following:

1. `spec.id` and `spec.version` match the source manifest.
2. The build `designer` matches the source manifest on their common identity
   fields: `name`, plus `handle` and `contact` when each is present in both.
   `role` is build-local and is excluded from matching.
3. Every recorded answer names a declared question and type-checks against
   that question's kind; a `choice` answer MUST additionally name a declared
   option id (§5). Defaulted questions are recorded too.
4. The `resolved_tuning.tunables` and `resolved_tuning.constants` keys exactly
   equal the corresponding source key sets. `resolved_tuning.tunables` is
   produced by the §5 resolution pipeline, and every value remains inside its
   declared range.
5. `acceptance.total` equals the package's enumerated AT count.
6. A conforming build has `acceptance.passed == acceptance.total`.

Checks 1–6 are the core set, not the whole set. The direction-result
presence, path, and subset rules and the certified-pin count and value rules
stated later in this chapter and in §9.11 are validator-level cross-document
checks of the same rank, and §2d's build-record conformance includes them.
Check 6 does not conflict with honest reporting: the shipped record is a
completion claim (§2d), and a build still failing tests reports through §2b
ambiguity reports rather than a build record. Validators report divergence in
checks 1–5 and in the direction-result and certified-pin rules as errors. A
check-6 shortfall is reported as a warning: the record stays well-formed
evidence of an incomplete build, and the build does not conform until
`passed` equals `total`.

When a commerce split exists, the build manifest includes the manifest's
commerce profile verbatim (including `derived_from` when present).
Certification itself never depends on commerce metadata.

### Optional renderer declaration

`opengdd-build.json` MAY include `renderer`: a free-text string naming the
rendering technique the build used, such as `"three.js 0.185.1, WebGL"`.
The renderer is the builder's fact, never the spec's: §3's `platform` names
the state space a design is responsible for, and two builds of one spec may
declare different renderers. The declaration is informative in v0.5: the
`web-1` capture recipe does not read it, and recipe selection stays with
`capture_profile.kind`. If `renderer` is absent, the renderer is
unrecorded; the absence claims nothing.

### Optional capture profile

`opengdd-build.json` MAY include `capture_profile`. It records the capture
adapter and serving or run recipe that produced the certification:
`{ "id": <string>, "kind": <string> }`.

This field is unrelated to the manifest-level `verification_profiles` in
§6a. Those profiles define claim envelopes. `capture_profile` identifies a
capture recipe.

`kind` is a closed, versioned enum. v0.5 defines one value: `"web-1"`. It
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

Cross-profile equivalence claims, such as byte-identical resolved surfaces
across two profiles, are outside v0.5. A registry of kinds beyond `"web-1"`
is also outside v0.5. A future adapter earns a new enum value through an
ordinary additive schema change.

### Optional resource disclosure

`opengdd-build.json` MAY include `resources`: the build-resource provenance
disclosed by the builder. It lists kits, third-party assets, and tools that
the build consumed. Each entry has this shape:

`{ "id": <string>, "kind": "kit" | "asset" | "tool", "artifact":
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
not certify that every consumed resource is listed. Its absence means that
provenance was not recorded; it does not mean that no resources were used.
The list creates no commerce split and changes no certification outcome.

A designer-authored kit reference used as direction under §8a is a mood-
descriptor reference. It is outside this build-resource list. `resources`
records what the builder consumed, the provenance only the builder can
disclose.

### Conditional direction result

`direction_result` carries the §9.11 judged-gate record and §9.9 certified
palette-pin evidence. It has two independently conditioned members:

- **`judged`** has the shape `{ "status": "pending", "assessed":
  [<direction claim paths>], "adherent": [<subset of assessed>] }`.
`status` is fixed to `"pending"`, the only value defined in v0.5, because
  the panel protocol is not integrated. `judged` is required exactly when `direction.json`
  declares at least one judged claim: `pillars.*`, `mood.*`, `anti.*`,
  `invariants.*`, or `motion.*`. It is absent otherwise.
- **`certified_pins`** has the shape `[{ "path":
  <constraints.palette.<key>>, "value": <8-bit sRGB hex> }]`. It is required
  exactly when the source spec declares at least one `certify: true`
  `constraints.palette.*` claim under §9.5/9.9. It contains exactly one entry
  for each such claim — a duplicated `path` is a validation failure — and is
  absent otherwise.

Certified pins apply only to direction-constraint palettes. Mood-descriptor
palettes cannot carry `certify` in v0.5 because no build-evidence path exists
for a descriptor-level pin.

`direction_result` is present when either member's condition holds. It is
absent when neither condition holds. The member conditions are independent,
so the object may contain `judged`, `certified_pins`, or both. These presence
rules require validator-level cross-checks against the source spec; the build
manifest schema alone cannot express them.

**Claim-path source resolution.** Every path in `judged.assessed` and
`judged.adherent` MUST resolve to an entry declared in the certifying spec's
`direction.json`. Its prefix must name one of the five fixed-judged kinds. A
syntactically valid but nonexistent path, such as `pillars.not-declared`, is a
hard failure. The `directionClaimPath` regex in
`opengdd-build.schema.json` is necessary but not sufficient.
`judged.adherent` MUST also be a subset of `judged.assessed`.

## 7a. Authored puzzles

Specs with authored logical puzzles MAY declare them as a §1b structured
collection. These are puzzles authored as content rather than systemic or
generated play. Two tiers are supported:

- **Tier 1 — literal layouts.** Each puzzle is data: a layout, entity
  placements, and a win condition, referenced from the content chapters. The
  puzzle is fully Fixed and certifiable. For example: “puzzle 7 is solvable in
  at least 12 moves.”
- **Tier 2 — solution-annotated layouts.** Each puzzle also carries designer
  metadata: intended insight, red herrings, difficulty-curve position, and
  machine-checkable invariants. Those invariants may include minimum solution
  length, required mechanics, and forbidden shortcuts. Certification runs an
  appropriate solver. The insight is Fixed. Its decoration is Delegated.

### Grid-layout encoding family: `parallel-string-layers-1` (normative)

v0.5 defines one named, buildable member of the still-open grid-encoding
family: the flat, single-cell `parallel-string-layers-1` carrier. Two
independent grid-puzzle instances converged on this layout shape. They did not
converge on a solver-adapter interface or predicate vocabulary, so those parts
remain open below.

A §1b collection declares this carrier by setting `format` to
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
  "contract": "03-content.md#puzzle-layout-format",
  "...": "..."
}
```

- **`layers`** is required. It contains at least two unique strings in a
  closed, ordered set. Each string names a collection-record member that
  carries a grid layer. A validator reads exactly these named members from
  every item collection record.
  No other member is a layer, whatever its shape. A named member that is
  missing or is not a string array is a hard failure. Generic tools discover
  layers from manifest `layout.layers`, not from game prose.
- **`cell_unit`** is required and fixed to `"unicode-scalar-value"`, the only
  value defined in v0.5. A row's column count is its length in Unicode scalar
  values, or code points. UTF-16 code units and grapheme clusters are not the
  measurement. A surrogate-pair emoji is one cell. A combining-mark sequence
  occupies as many cells as it contains scalar values.

Every item collection record MUST carry all of `layout.layers` as string-array
members. Every layer in one collection record MUST be non-empty and congruent
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
package checks under §1b's unconditional closure, mirroring §1c
`existence-closure`. No acceptance test is needed to catch them.

**Single-cell rule (core-fixed).** Each `(x, y)` coordinate holds exactly one cell value
per declared layer: one Unicode scalar value read from that layer's row at
that column. The encoding cannot represent one value spanning several cells
in a layer. Multi-cell entities are outside `parallel-string-layers-1`, even
if a game contract expresses one entity identity across several single-cell
footprints.

The collection's `contract` pointer keeps these fields in the game contract
under §1b closure:

- per-cell glyph vocabulary;
- overlap rules;
- entity footprints;
- terrain semantics; and
- the win predicate.

The core encoding fixes the grid shape and layer set. The game contract gives
cell values their meaning. This carrier declares no solver adapter or replay
grammar. Until those are standardized, a citing collection defines its own
command alphabet and predicates under §§6 and 7a.

**The encoding family remains open.** One documented counterexample needs
integer per-column heights, region terrain with tile overrides, graph edges
between cells, and persistent multi-cell rigid bodies. It still requires a
game-local extension.

The family widens when an encoding or encoding-family member can express that
shape without a game-local extension and is validated against a third
grid-puzzle fixture that needs it.

### Open solver profile

The interoperable solver profile `opengdd-grid-puzzle-1` remains deferred.
Evidence from two independent deterministic grid puzzles and two deduction
fixtures establishes three parts that an eventual contract must cover.

1. **Layout envelope.** v0.5 partially resolves this part through the
   normative `parallel-string-layers-1` encoding above. The wider encoding
   family remains open because the height/region/graph/rigid-body
   counterexample is still unaddressed. The closure condition is stated above.
2. **Solver-adapter interface.** The interface must use Fixed, observable
   terms for:
   - initial-state construction from a layout;
   - canonical state equality;
   - a finite-state proof or explicit state or depth bound;
   - ordered legal-action enumeration with tie-breaks;
   - `step(state, action) → state + emitted events`;
   - the win predicate;
   - command decoding; and
   - witness serialization.

   This target shape survived a second instance without refutation. It is a
   certification interface. It does not prescribe the game's internal
   architecture.
3. **Standard predicate vocabulary.** Predicates discharge through §6
   `exhaustive-search`. Minimum, absence, and universal claims require
   `complete: true`.

   Four drafted predicates are not a complete vocabulary: `solvable`,
   `minimum-actions`, `event-required-in-every-optimal-witness`, and
   `solvable-with-event-suppressed`. A fifth claim, an exact event order in
   every solved witness, required a game-local product automaton.

   This part remains open. It closes when the next exercise decides between a
   `witness-event-order-invariant` predicate and a documented
   product-automaton-with-monitor fallback for the general case.

The profile is not a universal schema for dossier deduction, silent grammar,
mutable-rule, recursive-containment, physics, language, or knowledge-only
puzzles. Until it is approved, Tier 1 and Tier 2 collection fields and solver
adapters remain versioned game contracts under §§1b and 6.

### Worked example: deduction claims as finite-domain CSP

Symbolic deduction puzzles, such as “identify all N subjects from the
evidence,” certify through §6 `exhaustive-search` as a
constraint-satisfaction problem.

This method certifies an operational claim: the assignment is uniquely
determined, and each declared elimination chain is necessary to that
uniqueness. It does not certify what a human perceives or infers.

The descriptors below use the normative §6 members `class`, `initial_states`,
`transitions`, `complete`, `predicate`, and `diagnostics`. The search-space
representation inside `transitions`, meaning its variables, domains, and
constraint lists, is game-contract data behind a contract pointer. It is not
core format vocabulary. v0.5 defines no CSP subgrammar.

Uniqueness:

```verification
{
  "class": "exhaustive-search",
  "initial_states": ["all-assignments"],
  "transitions": "03-content.md#deduction-csp",
  "complete": true,
  "predicate": "at least one satisfying assignment exists AND every satisfying assignment agrees on every variable",
  "diagnostics": ["witness-assignment", "disagreeing-variable", "unsatisfiable-core"]
}
```

Elimination-chain necessity uses mask-and-resolve. It restates the same
declared search space in full, with one declared chain's premises masked each
time:

```verification
{
  "class": "exhaustive-search",
  "initial_states": ["all-assignments"],
  "transitions": "03-content.md#deduction-csp-masked",
  "complete": true,
  "predicate": "for every declared elimination chain, masking that chain's premises admits >= 2 satisfying assignments that disagree on the chain's concluded variable",
  "diagnostics": ["masked-chain-id", "disagreeing-assignments-pair"]
}
```

Uniqueness proves that the deduction closes. Mask-and-resolve proves that each
declared chain is necessary to uniqueness. This is a chain-level claim; it
does not prove that every premise within the chain is independently necessary.
That stronger claim requires masking one premise per run.

Other `exhaustive-search` techniques, such as a product automaton with an
order monitor, are equally valid. The class is standardized. The technique is
not.

Tier 3 is the research horizon: the designer authors an insight sequence, and
the builder generates solver-verified instances for each build. Tier 3 is
explicitly outside v0.x.

## 8. Symbols and descriptors

OpenGDD uses two layers: **anything can be a symbol; only descriptors
carry format semantics.**

### Symbols

A symbol is a designer-defined name in a carrier or declared namespace. Symbol
identity is scoped: the same spelling in two scopes may name different
symbols, and first use defines the symbol in that scope. Naming one creates it
— no declaration, no registry. A key such as `infection.damage` or `tick.day`
becomes a symbol the moment it is defined, whether written directly into
`tuning.json` or promoted there by tooling when an unrecognized name first
appears in prose. Custom fields in collection records and
personalization question ids work the same way. §4 `tunables` and `constants`
keys, §1b collection-contract fields, and §4a declared-set members are all
symbols. A field name defined in a collection's contract section is one symbol
in that collection-contract scope, with many occurrences across its collection
records.

The format gives a symbol no meaning beyond key/value binding. It can validate
the symbol's shape, such as a numeric value, string, or declared-set
membership. Tooling can bind, complete, and snapshot its name. Designer prose
defines what the name means.

### Descriptors

A descriptor is a reserved shape with fields defined by the format. This lets
certification act on the descriptor directly: for example, a palette
can be checked, anti-references can feed judges, and behaviors can become
rubric lines.

A descriptor family is a keyed map whose entry shape and semantics the format
owns. Designer-defined shapes are §1b collections: their collection-record
fields are defined in the collection's contract section. A designer-defined
shape becomes a descriptor family only when the format adopts it.

Descriptors are grouped by family under the manifest's `descriptors` member:

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

A future family requires both survey-grade evidence of a corroborated
professional-practice construct and a working transmission and audit story.
Subjective intuition alone is insufficient. Adding a family requires a format
revision; it is not a package-local extension.

## 8a. The mood descriptor

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
        "population": "enemy projectiles and enemy contact surfaces while this mood is active",
        "states": ["in-play"],
        "coverage": "exhaustive"
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
  emotional or creative target. It is `advisory` and is checked only for
  presence.
- **`references`** is optional. It uses the §9.3 `annotatedReference` shape
  verbatim. Every entry names the borrowed property; an unannotated reference
  is invalid.
- **`anti`** is required and has `minItems: 1`. A mood descriptor without an
  anti-reference is a hard failure. The required negative space prevents the
  reference from silently defining the whole target.
- **`palette`** is optional. It contains palette roles in the §9.5 shape,
  scoped to this mood.
- **`behaviors`** is optional. It binds game events to this mood becoming
  active or inactive. Each entry contains:
  - `trigger`: a prose-bound game-state condition, under the same
    authority-prose discipline as §9.5 `scope.population`;
  - `response`: exactly `"this mood becomes active"` or `"this mood becomes
    inactive"`; and
  - optionally, `timing.max_latency_ms`.

  Any other response belongs to a §9 direction-block construct. Mood behavior
  is not a general event-response language.
- **`audio`** is optional, DRAFT, and non-normative. The §10 posture applies,
  and the block has no certification consequence.

### Prose citations (normative)

A mood descriptor is referenced from Fixed or Delegated chapter prose anywhere
in the package by the exact inline code token
`` `descriptor:mood:<id>` ``. This is the family-qualified
`descriptor:<family>:<id>` form, parallel to the §4a `tuning:`, `state:`, and
`content:` typed-reference prefixes.

`<id>` MUST name a declared `descriptors.mood` entry. A token without a
matching descriptor is a dangling reference and a hard failure. A bare mood
name without the `descriptor:mood:` prefix is ordinary prose and binds
nothing.

The §9.2 direction block uses the same token in the `descriptor` member of
each keyed `mood` entry. Each entry has the shape `{ descriptor, class,
viewing }`.

### Reference semantics (normative)

A reference in a mood descriptor or §9.3 direction block binds only the
properties explicitly named by its `borrows` annotation. A property can be a
quality such as "silhouette weight" or "value grouping"; it is not a claim to
reproduce the source's literal pixels.

Copying visual content that the reference does not annotate is a conformance
failure, not stronger compliance. All unannotated content, including the
source's exact appearance, remains open.

Only pinned, certified assets under the §9.9 descent rule bind exactly. When
exact pixels are required, use a certified asset reference outside this
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
  `webp`. These are the only media formats v0.5 defines; audio media remains
  deferred under §10.

v0.5 defines no numeric media-size conformance limit. Validators MUST NOT
invent one. Package authors MUST NOT rely on unbounded file sizes; this is
authoring guidance, not a numeric validation threshold. Authors remain
responsible for deployment-specific limits.

The validator MUST verify that the file's leading byte signature matches its
declared format; full decoding is not required. It cannot trust the `format`
string alone. A renamed or
misdeclared file fails even when its extension and `format` member agree.

A file outside the format allowlist, whose leading byte signature does not
match its declared format, or without a license declaration is a hard
failure. This
is the direction block's media rule too (§9.3), stated once here since
both constructs share the reference shape.

## 9. The art-direction block

The direction block is optional. It is a fenced `direction` section at the
start of `04-presentation.md`, just as the §1a fantasy block starts
`01-overview.md`. Its machine carrier is `direction.json`, declared by
`manifest.json.build.direction` (§3). Providing the prose block without the
carrier, or the carrier without the prose block, is a validation error.

The fantasy block remains required and is the tie-breaker. A direction block
refines the fantasy block and MUST NOT contradict it. When no direction block
is present, the existing presentation prose remains sufficient.

Citation convention for this chapter: prose refers to a carrier entry by its
dotted path (`viewing.<key>`, `references.<key>`, `constraints.palette.<key>`).
A JSON member that names such an entry always holds the bare `<key>` alone —
`"viewing": "dusk-panel"`, never `"viewing": "viewing.dusk-panel"`.

**Design principles (normative).**

1. **Constrain, and leave open.** Every construct states both what it
   constrains and what remains open to interpretation. A construct that
   leaves nothing open is a pinned value under the §9.9 descent rule, not
   Delegated content.
2. **No new authority level.** The entire block uses the existing Delegated
   authority level (§2): the builder decides, while the specification states
   intent and constraints in an auditable structure. This creates no exception
   to the ordinary untagged default; the fence explicitly opens with
   `> DELEGATED: presentation-direction`.
3. **Audit classes belong to individual claims.** The available classes are
   `checked` for mechanical verification, `judged` for panel verification,
   and `advisory` for stated intent without a conformance consequence. The
   block itself has no audit class. Assigning a class stronger than the
   claim's stated criteria can support is a validation failure.
4. **Anti-references have primacy.** Negative direction is what holds a build
   back from drifting into its own references, and from settling into the
   genre's defaults. The §1a fantasy
   block's anti-references generalize into this block; they are not replaced.
5. **Core constructs exclude implementation vocabulary.** Direction states
   player-observable targets. Renderer channels, rig names, LUT files, and
   framework tokens MUST NOT appear in core constructs. Color spaces and
   measurement metrics must be observable-referenced and versioned.

### 9.1 Pillars (`pillars`)

`pillars` defines two to four named priorities that every presentation
decision should reinforce. It is a closed object containing two to four
entries, keyed by stable kebab-case ids. A key is cited as
`pillars.<key>`, such as `pillars.readability-first`.

Each entry contains:

- `statement`: required, exactly one sentence;
- `class`: required and authored, with `"judged"` its single legal value —
  an entry that omits `class` fails validation;
- `viewing`: required, naming one `viewing.<key>`;
- `tie_break_order`: optional, a positive integer; and
- `references`: optional, naming one or more `references.<key>` ids.

A pillar is never `checked`, because no mechanical test can determine whether
a choice advanced a priority. It is never `advisory`, because a panel always
scores it. The required `viewing` member identifies the evaluation context for
that score. The optional `references` member supplies the §9.3
claim-to-reference edge.

Pillars leave every asset-level solution open. Under the named viewing
context, the panel scores whether the build's choices advance them.

### 9.2 Mood (`mood`)

`mood` constrains the intended emotional neighborhood by reference. It is a
closed object containing one or more entries, keyed by stable local kebab-case
ids and cited as `mood.<key>`. The local key need not equal the referenced
descriptor's id.

Each entry contains:

- `descriptor`: required, one `descriptor:mood:<id>` token under the §8a
  citation grammar;
- `class`: required and authored, with `"judged"` its single legal value —
  an entry that omits `class` fails validation;
- `viewing`: required, naming one `viewing.<key>`; and
- `references`: optional, naming one or more top-level
  `references.<key>` ids. This pool is separate from the descriptor's own
  §8a `references`.

The `descriptor` token MUST resolve to a declared `descriptors.mood` entry. A
dangling token is a hard failure. The direction block does not inline mood
anchors. Instead, it wraps a reusable descriptor with the audit class and
evaluation context specific to this block. The same descriptor token can also
be used in prose and in other moods' `behaviors` triggers.

The referenced descriptor's mandatory `anti` member alone establishes the
`judged` class. No other descriptor field is a precondition. Descriptor
`references` are optional supplementary evidence for the panel; their
presence never changes the class. The required `viewing` member identifies
the context in which the panel scores the mood citation.

The entry leaves open the observable means, degree, and local reading that the
descriptor's `intent`, `references`, `anti`, and `palette` do not already pin.

### 9.3 References (`references`)

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

A missing or empty `borrows` member is structurally invalid, not `advisory`.
Every unnamed property and the synthesis remain open; copying a reference is
a conformance failure under §8a. A reference has no authored `class` of its
own. Its annotation is a structural consequence of schema validity.

#### Claim-to-reference edges (normative)

Property-transfer fidelity is assessed only while scoring the `judged` claim
that cites a reference. The association is explicit: `pillars.*`, `mood.*`,
`anti.*`, `invariants.*`, and `motion.*` entries can each carry an optional
`references` member naming one or more `references.<key>` ids (§§9.1, 9.2,
9.4, 9.7, and 9.8). A dangling id is a hard failure.

The §8a reference pool attached to a mood descriptor is separate from the
direction carrier's top-level `references` collection.

Closure applies in both directions. Every declared top-level
`references.<key>` entry MUST be cited by at least one judged claim's
`references` member. An uncited entry is an orphaned reference and a hard
failure.

#### Cultural-source trigger

This trigger depends on the borrowed property, not the source's medium or
whether its presentation is fictional. An annotated borrow that depicts or
derives from a real place, people, culture, or living tradition MUST cite
specific annotated sources.

Every judged claim that cites such a reference, either directly through its
own `references` member or through a mood descriptor's separate §8a reference
pool, MUST bind through its required `viewing` member to a `viewing.<key>`
whose `judge_qualifications` names the expertise the judge needs (§9.6). A
borrow of a purely invented property creates no such obligation.

### 9.4 Anti-references (`anti`)

`anti` constrains what the presentation is not: forbidden elements, palettes,
resemblance targets, and clichés. When the mechanics have a saturated genre
prior, the entry names that canonical default explicitly.

When present, `anti` is a closed object containing one or more entries, keyed
by stable kebab-case ids and cited as `anti.<key>`. Each entry contains:

- `description`: required;
- `observable`: optional. When present, it contains a required, non-empty
  `criteria` string describing the mechanical test;
- `class`: required and authored, with `"judged"` its single legal value —
  an entry that omits `class` fails validation;
- `viewing`: required, naming one `viewing.<key>`; and
- `references`: optional, naming one or more `references.<key>` ids through
  the §9.3 claim-to-reference edge.

Anti-references leave the replacement open unless positive constructs supply
it. On their own they say what to avoid, and never what to move toward.

Every anti-reference is `judged`, unconditionally. `observable` is legal
panel-facing documentation of what a mechanical test would check, but v0.5
defines no execution route for it. It never changes or elevates `class`.
Promoting it requires a future revision. The required `viewing` member names
the context in which the panel scores the entry.

The §8a media-packaging rule also applies here. An anti-reference MAY attach
`media`, such as a labeled "not this" sheet.

### 9.5 Constraint core (`constraints`)

The constraint core is the mechanically checkable floor: the part of the
direction a machine can check by measurement. Runtime numeric authority
remains in `tuning.json` under §4; this carrier never restates a runtime
number.

`constraints` is itself a closed object: it contains at least one of
`palette`, `thresholds`, or `timing`, and no other member is legal. Each
present member is in turn a closed object containing one or more entries,
keyed by stable kebab-case ids.

#### Palette roles (`palette`)

A palette role, such as `palette.threat`, is a closed object (no member
beyond these four is legal) containing:

- `value`: required, an 8-bit sRGB hexadecimal color written as `#` plus
  exactly six hex digits (`#RRGGBB`, either case; three-digit shorthand is
  invalid);
- `tolerance`: required, a number greater than or equal to zero;
- `scope`: required, using the shared shape below; and
- `certify`: an optional Boolean.

`tolerance` is a CIEDE2000 (ΔE00) radius around `value`, computed in CIELAB
D65 after sRGB decoding. `tolerance: 0` makes the constraint exact.
`certify: true` is legal only when `tolerance` is exactly zero; otherwise
`certify` is absent or `false`. The schema enforces this implication. An
exact constraint becomes a **certified pin** (§9.9) only when it also
declares `certify: true`; that conjunction, and nothing else, requires the
build evidence reported through `opengdd-build.json`
`direction_result.certified_pins` (§§7 and 9.9).

A palette entry constrains values, role assignment, and where they hold. It
leaves distribution and harmony open for judgment through pillars and mood.

#### Perceptual thresholds (`thresholds`)

A threshold, such as `thresholds.actor-vs-background`, is a closed object
(exactly these six members) containing:

- `roles`: required, always an array, holding one or more bare
  palette-role keys (`["threat"]`, never `"threat"` alone or
  `"palette.threat"`); each MUST resolve to a declared `palette` entry;
- `against`: required, one bare palette-role key under the same rule;
- `min_contrast`: required, a number greater than zero;
- `metric`: required, a string that MUST appear in `semantics.metrics`
  (`semantics` sits at the carrier's root, not inside `constraints`; it is
  defined at the end of this section);
- `viewing`: required, holding the bare key of one `viewing` entry (the
  member value is `"dusk-panel"`, never `"viewing.dusk-panel"`); and
- `scope`: required.

A threshold constrains measurable separation and leaves form open.

#### Timing constraints (`timing`)

Timing entries cover exact runtime values. An entry such as
`timing.dash-recovery` contains only a required `key` in the §4a
`tuning:<dotted-key>` form and a required `scope`.

The numeric parameter MUST live in `tuning.json`, where the designer owns it.
The direction carrier does not repeat the number. The verified proposition is
that rendered event timing matches the resolved tuning value over the declared
domain. v0.5 defines no universal numeric window for "matches"; the covering
acceptance test's §6 procedure states how the match is checked, and that
procedure is what certification audits.

No constraint entry may carry a `class` member — the closed shapes above
exclude it, so an authored `class` fails validation. Every palette, threshold, and
timing entry has the fixed audit class observational `checked` (§9.11); none
has a `judged` or `advisory` reading.

#### Scope (normative)

Every constraint-core claim has a `scope`; this shape does not apply to
`viewing` entries. The scope owns the claim's applicability domain and proof
obligation:

- `population`: required, non-empty prose identifying the player-visible
  instances that carry the role;
- `states`: required, with at least one named game state in which the claim
  holds. Each state is a non-empty free-form string; v0.5 declares no
  package-level state registry for these names to resolve against, so a
  validator MUST NOT reject a name for failing to resolve. The
  fixture-reach rule below is discharged by the covering acceptance test's
  own §6 procedure, not by machine-matching state strings; and
- `coverage`: required, either `"exhaustive"` or a sampled oracle.

For `"exhaustive"`, the covering acceptance test MUST observe every member. A
sample cannot discharge the claim.

Sampled coverage is written as a nested object:
`"coverage": { "sampled": { "oracle": ... } }` — the `sampled` wrapper is a
real JSON member, not a prose label. Both wrappers are closed: `coverage`'s
object form admits only `sampled`, and `sampled` admits only `oracle` (a
member such as a sample count is illegal). The oracle is either the string
`"per-sample"` or an object whose single member is the key `aggregate` —
`"oracle": { "aggregate": { ... } }` — where `aggregate` (itself closed, as
is its `threshold` object) contains:

- `aggregation`: exactly one of `"count"`, `"rate"`, `"min"`, `"max"`, or
  `"mean"`;
- `metric`: a string; and
- `threshold`: an object with `op`, exactly one of `"eq"`, `"lt"`, `"lte"`,
  `"gt"`, or `"gte"`, and a numeric `value`.

Aggregate fields are authored once in the carrier and never restated by the
fixture, following §6's per-sample and aggregate discipline.

The covering fixture MUST reach every state named by `scope.states`. It MUST
NOT narrow the population, states, or proof obligation. The package validator
cannot decide fixture reach (above), so this obligation is discharged by the
covering acceptance test's §6 procedure and audited under the experimental
certification protocol (§2d): a narrower fixture, or a sampled result
presented as exhaustive proof, fails that audit. The
acceptance test cites the carrier key, such as `constraints.palette.<key>`, and
MUST NOT restate its value.

#### Self-describing semantics (normative)

The required `semantics` member sits at the direction carrier's root, as a
sibling of `constraints` and `viewing` — not inside `constraints`. It
defines measurement semantics:

- `tolerance`: required, a single string holding one versioned
  tolerance-math id (not an array). v0.5 defines `"ciede2000-lab-d65-v1"`;
  and
- `metrics`: required, an array with at least one versioned metric id.
  v0.5 defines `"wcag21-contrast-ratio"`.

The registry is closed: v0.5 recognizes no other ids, and an unrecognized
id in `semantics.tolerance` or `semantics.metrics` fails schema validation.
Separately from that closure, one cross-check applies: every
`thresholds.*.metric` value MUST appear in `semantics.metrics`. The sampled
oracle's `aggregate.metric` is subject to neither rule — that field remains
a free-form string naming the sampled measurement.

#### Designer-side consistency (normative)

Package validation MUST compute each threshold nominally over its operand
roles and verify that the carrier's authored values satisfy it. A carrier that
violates its own threshold is a hard failure.

### 9.6 Evaluation context (`viewing`)

`viewing` defines the inputs that stabilize panel evaluation. When present,
it is a closed object containing one or more entries, keyed by stable
kebab-case ids. Prose in this specification cites an entry as
`viewing.<key>`; a claim's `viewing` member holds only the bare
`<key>`.

Each entry contains:

- `scale_speed`: required, non-empty prose stating representative scale and
  speed;
- `sequence_context`: optional prose. A designer SHOULD include it when an
  arc matters to a claim that cites this entry; v0.5 defines no machine
  check for that condition, so its absence is a design-review finding,
  never a validation failure;
- `calibration`: required, non-empty prose stating calibration assumptions;
- `blind_builder_identity`: a required Boolean; and
- `judge_qualifications`: an optional array of strings. It becomes required
  and non-empty when a citing claim triggers the §9.3 cultural-source rule.
  That condition is a validator-level citation cross-check.

The entry leaves the judgment and panel protocol open. It has no authored
`class`; presence and completeness are structural consequences of schema
validity.

#### Claim-to-viewing edges (normative)

Every claim kind that can be `judged`, meaning `pillars.*`, `mood.*`,
`anti.*`, `invariants.*`, and `motion.*`, has a required `viewing` member
naming exactly one `viewing.<key>` (§§9.1, 9.2, 9.4, 9.7, and 9.8). A
threshold has the same member for the separate purpose of defining its
contrast-measurement condition (§9.5).

A dangling `viewing` reference is a hard failure. There is no default and no
fallback to the sole declared entry. Every judged claim names its context
explicitly, even when all claims share one entry.

### 9.7 Variation envelope (`invariants`)

`invariants` constrains the recognition-critical constants that a build MUST
preserve. Examples include a silhouette rule, a role-color meaning, or a
motif. The collection is a closed object keyed by stable kebab-case ids. A
key is cited as `invariants.<key>`. When present, the `invariants` collection
contains one or more entries.

Each entry is also closed. No member beyond the following six is legal:

- `statement`: required;
- `open_axes`: required, an array with at least one named axis where
  interpretation is expected;
- `observable`: optional, using the closed §9.4 shape. It contains only the
  required, non-empty `criteria` string;
- `class`: required and authored, with `"judged"` its single legal value —
  an entry that omits `class` fails validation;
- `viewing`: required, naming one viewing entry by its bare key, such as
  `"viewing": "dusk-panel"`; and
- `references`: optional, naming one or more reference entries by their bare
  keys, such as `"references": ["wet-study"]`. This is the §9.3
  claim-to-reference edge.

`statement` is a non-empty string. Every `open_axes` item is a non-empty
string. The ids in a `references` list are unique.

An entry leaves everything inside its declared axes open. An empty or missing
`open_axes` member leaves nothing open, and fails block validation. The schema
enforces this structurally with `minItems: 1`.

`class` and `observable` follow the same rule as the §9.4 anti-references.
The class is always `"judged"`. The optional `observable` member is
panel-facing documentation and never elevates the class. The required
`viewing` member names the context in which the panel scores the entry.

### 9.8 Motion rubric (`motion`)

`motion` turns a captured study of wet material behavior and its blind-panel
findings into a reusable audit interface: a common structure for declaring
the behavior and the evidence used to judge it.

**Scope, restricted (v0.5).** This construct covers only **material/wet
behavior over time**, the exact domain covered by the evidence. It does not
cover character weight, impact, camera grammar, or any other kinetic-motion
quality. Those qualities remain with the deferred general kinetic-motion
construct, which is closed for admission until it clears its own evidence
bar. A `motion` entry MUST NOT be cited to satisfy a non-material kinetic
direction claim. Such a claim is out of scope for v0.5, rather than merely
under-evidenced.

The `motion` collection is a closed object keyed by stable kebab-case ids. A
key is cited as `motion.<key>`. When present, the `motion` collection contains
one or more entries. Each entry is also closed. No member beyond the following
six is legal:

- `tags`: required, an array containing at least one token from the closed
  v0.5 vocabulary below;
- `requires_tier`: required, with the value `1` or `2`. The number names
  an evidence class, not a strictness rank — `2` is the broader
  requirement, per the comparison rule below;
- `class`: required and authored, with `"judged"` its single legal value —
  an entry that omits `class` fails validation;
- `fixture`: required, an `AT-<n>` reference (§6) to the covering
  capture-fixture acceptance test. It uses the positive-integer form
  `AT-[1-9][0-9]*`; `AT-1` is legal, while `AT-0` and `AT-01` are illegal;
- `viewing`: required, naming one viewing entry by its bare key, such as
  `"viewing": "dusk-panel"`; and
- `references`: optional, naming one or more reference entries by their bare
  keys, such as `"references": ["wet-study"]`. This is the §9.3
  claim-to-reference edge.

`tags` entries are unique. The ids in a `references` list are unique.

The closed v0.5 tag vocabulary assigns each exact token a fixed tier. No
other token is legal.

| Tag | Tier |
|---|---|
| `traveling-glisten` | 1 |
| `drip` | 1 |
| `ooze` | 1 |
| `moist-deformation` | 1 |
| `event-scoped-liquefaction` | 2 |

A package that needs an uncovered behavior class documents it as a
KNOWN-LIMITATIONS item. It cannot introduce local vocabulary.

**Tier comparison rule (normative).** `requires_tier: 1` is satisfied only
when the covering fixture shows at least one Tier 1 tag named in `tags`.
`requires_tier: 2` is satisfied when the fixture shows any named tag, whether
Tier 1 or Tier 2.

A Tier-2-only entry has only `event-scoped-liquefaction` in `tags`. Such an
entry MUST NOT declare `requires_tier: 1`. That combination is a hard failure
because no Tier 2 tag can satisfy a Tier 1 requirement. In the wet-in-motion
finding, an unstated event-scoped dissolve did not clear the "wet" bar.

The entry's `class` is always `"judged"`. A panel applies the tier definition
to the fixture's captured frames (§9.11). No pixel-diff oracle applies. Tier
satisfaction has no `"checked"` or `"advisory"` reading.

Completeness of the tag, tier, and fixture-reference declarations is
separately structural `checked`, inherent in schema validity. It needs no
authored field, following the same reasoning as §§9.3 and 9.6.

The technique, asset, and exact frame count used to produce a cited tag's
tier-qualifying behavior remain open. Achieving a Tier 1 tag through a shader,
sprite animation, or particle system is entirely Delegated.

### 9.9 Authority, descent, and boundary rules

**Authority.** The direction block has Delegated authority, as design
principle 2 states: the builder decides how to realize it within the stated
intent and constraints. An `advisory` claim is Delegated intent. It guides
interpretation and tie-breaks in the same way as fantasy-block prose and
carries no conformance constraint.

If a direction claim conflicts with a Fixed statement elsewhere in
`04-presentation.md`, the Fixed statement wins. The conflict is an authoring
error. v0.5 does not permit `> PERSONALIZATION:` tags inside the direction
fence. Personalized direction is a recorded KNOWN-LIMITATIONS item.

**The fidelity ladder.** Any player-observable surface may be specified
at three fidelities: *prose direction* → *constraints* → *exact values*.
The default is prose direction.

**The descent rule.** Designers may descend anywhere. Each descent creates
an obligation. At the middle rung, a bounded constraint's obligation is the
observational `checked` claim §9.5 defines, discharged by its covering
acceptance test. At the bottom rung, an exact palette constraint uses
`tolerance: 0`, and every builder must reproduce its declared value exactly.

A **certified pin** is an exact direction-palette constraint that also
declares `certify: true`. For a schema-valid carrier, `certify: true` is the
sole trigger for `direction_result.certified_pins` build evidence. When
`certify` is absent or `false`, an exact constraint remains uncertified and
creates no evidence requirement in that array. A certified surface must have
been tested by the designer against a build; that is an authoring
obligation carried by the §2b spec lifecycle, and v0.5 defines no per-build
machine check for it — an auditor neither passes nor fails a build on it.

The optional `certify` member belongs to the closed
`constraints.palette.<key>` object defined in §9.5. It is distinct from §4's
`tuning.json` `meta.certify`. `certify: true` is legal only when `tolerance`
is exactly zero, and `direction.schema.json` enforces that implication. A
bounded palette constraint therefore cannot be certified.

In v0.5, palette-pin certification is available only to
direction-constraint palette entries. The mood-descriptor palette shape in
§8a does not admit a `certify` member. A designer who wants an exact,
certified mood color places it in a direction-block `constraints.palette`
entry.

Evidence follows the source mechanism:

- Certified tuning keys compare runtime consumption with the resolved
  snapshot (§4).
- Fixed prose and structured content use acceptance tests and the
  certification protocol's Fixed-fidelity audit.
- A certified palette pin uses `opengdd-build.json`
  `direction_result.certified_pins` (§7). This array is required whenever at
  least one direction-palette claim declares `certify: true`, regardless of
  whether the source also declares a judged claim. It contains one entry for
  each such palette claim. Each entry is a closed object containing exactly
  `path` and `value`: `path` identifies the
  `constraints.palette.<key>` claim, and `value` records the captured resolved
  color. The captured value is checked against the declared value at ΔE00 =
  0. The presence rule runs in both directions: when no direction-palette
  claim declares `certify: true`, the array MUST be absent, and an entry whose
  `path` resolves to a claim without `certify: true` is a validation
  failure.

A surface with no existing evidence mechanism is recorded as a
KNOWN-LIMITATIONS item. The format makes no certification promise for that
surface.

**Builder courtesies.** Everything not descended into is interpretation
space where builds may compete. Examples include polish iteration, tutorials,
key rebinding, and accessibility affordances. These courtesies must serve the
spec's fantasy. They may not alter certified surfaces or Fixed rules.

**Soft boundary, hard mechanism.** No rule limits the depth of descent.
The only hard boundaries are that certified surfaces bind absolutely and
builder courtesies cannot contradict the specification.

### 9.10 Machine carrier: `direction.json`

`direction.json` is a single optional JSON file. Its package-relative path is
declared by the bare `direction` member inside the `build` object in
`manifest.json`, as in `"build": { "direction": "direction.json" }`. The
file is machine-validated against
[direction.schema.json](https://opengdd.org/schema/core/v0.5/direction.schema.json).

The file's root value is a JSON object. The object is closed:
`additionalProperties` is `false`. Its only legal top-level members are:

| Bare JSON member | Presence | JSON type and cardinality |
|---|---|---|
| `semantics` | required | one object |
| `pillars` | optional | an object containing two to four entries |
| `mood` | optional | a non-empty object |
| `references` | optional | a non-empty object |
| `anti` | optional | a non-empty object |
| `constraints` | optional | one object containing at least one of the bare members `palette`, `thresholds`, or `timing` |
| `viewing` | optional | a non-empty object |
| `invariants` | optional | a non-empty object |
| `motion` | optional | a non-empty object |

The `constraints` object is closed (`additionalProperties: false`). Each of
its three optional members is a non-empty keyed object. At least one must be
present.

The keyed maps are `pillars`, `mood`, `references`, `anti`,
`constraints.palette`, `constraints.thresholds`, `constraints.timing`,
`viewing`, `invariants`, and `motion`. Each is a JSON object, including
`mood`. None is an array. Each map is keyed by package-unique, stable
ids. The schema requires every id to match
`^[a-z0-9]+(-[a-z0-9]+)*$`, the kebab-case form used throughout
§§9.1–9.8. Each member value must match that map's entry shape. Prose
cites these entries by dotted path, such as `pillars.readability-first`,
`mood.the-fear`, `constraints.palette.threat`, or
`motion.clear-wetness`. Array positions cannot be citation targets.

Every entry object and every other fixed-shape object described below is
closed (`additionalProperties: false`). The keyed map objects are
maps, so their legal member names are the ids themselves. They contain no
fixed structural members alongside those ids.

**Entry shapes.** In this table, the first column gives a prose citation.
The other columns give the literal bare keys that appear inside its JSON
entry object. All `viewing` values and `references` array items use bare ids,
as in `"viewing": "dusk-panel"` and `"references": ["wet-study"]`.
Threshold `roles` items and `against` values also use bare palette ids, as in
`"roles": ["threat"]` and `"against": "background"`.

| Entry | Required bare JSON keys | Optional bare JSON keys |
|---|---|---|
| `pillars.<id>` | `statement`: non-empty string; `class`: the string `"judged"`; `viewing`: kebab-case string | `tie_break_order`: integer at least 1; `references`: non-empty array of unique kebab-case strings |
| `mood.<id>` | `descriptor`: string matching `^descriptor:mood:[a-z0-9]+(-[a-z0-9]+)*$`; `class`: the string `"judged"`; `viewing`: kebab-case string | `references`: non-empty array of unique kebab-case strings |
| `references.<id>` | `description`: non-empty string; `borrows`: non-empty array of non-empty strings | `media`: non-empty array of media objects |
| `anti.<id>` | `description`: non-empty string; `class`: the string `"judged"`; `viewing`: kebab-case string | `observable`: observable object; `media`: non-empty array of media objects; `references`: non-empty array of unique kebab-case strings |
| `constraints.palette.<id>` | `value`: string matching `^#[0-9A-Fa-f]{6}$`; `tolerance`: number at least 0; `scope`: scope object | `certify`: Boolean; when `true`, `tolerance` must equal 0 |
| `constraints.thresholds.<id>` | `roles`: non-empty array of non-empty strings; `against`: non-empty string; `min_contrast`: number greater than 0; `metric`: non-empty string; `viewing`: kebab-case string; `scope`: scope object | none |
| `constraints.timing.<id>` | `key`: string matching `^tuning:[A-Za-z0-9_.-]+$`; `scope`: scope object | none |
| `viewing.<id>` | `scale_speed`: non-empty string; `calibration`: non-empty string; `blind_builder_identity`: Boolean | `sequence_context`: non-empty string; `judge_qualifications`: non-empty array of non-empty strings |
| `invariants.<id>` | `statement`: non-empty string; `open_axes`: non-empty array of non-empty strings; `class`: the string `"judged"`; `viewing`: kebab-case string | `observable`: observable object; `references`: non-empty array of unique kebab-case strings |
| `motion.<id>` | `tags`: non-empty array of unique allowed tag strings; `requires_tier`: integer `1` or `2`; `class`: the string `"judged"`; `fixture`: string matching `^AT-[1-9][0-9]*$`; `viewing`: kebab-case string | `references`: non-empty array of unique kebab-case strings |

The table exhausts each entry object's legal JSON members and schema-level
constraints. The cross-field resolution rules and semantic requirements in
§§9.1–9.8 still apply.

The five allowed `motion.<id>.tags` strings are `traveling-glisten`, `drip`,
`ooze`, `moist-deformation`, and `event-scoped-liquefaction`. When
`requires_tier` is `1`, the `tags` array must contain at least one of the
first four strings.

An observable object has one required bare member, `criteria`, whose value is
a non-empty string. A media object has four required bare members: `path` is
a non-empty string; `license` is a non-empty string; `hash` is a string
matching `^sha256:[0-9a-f]{64}$`; and `format` is one of `png`, `jpg`,
`jpeg`, or `webp`.

A scope object has three required bare members. `population` is a non-empty
string. `states` is a non-empty array of non-empty strings. `coverage` is
either the string `"exhaustive"` or the following nested object form:

```json
{
  "sampled": {
    "oracle": {
      "aggregate": {
        "aggregation": "count",
        "metric": "non-empty metric id",
        "threshold": { "op": "gte", "value": 1 }
      }
    }
  }
}
```

In that form, `oracle` may instead be the string `"per-sample"`.
`aggregation` must be `"count"`, `"rate"`, `"min"`, `"max"`, or
`"mean"`. The `metric` value is a non-empty string. The `threshold` object
requires `op` and `value`. The `op` value must be `"eq"`, `"lt"`, `"lte"`,
`"gt"`, or `"gte"`; `value` is a number. The `coverage`, `sampled`,
object-form `oracle`, `aggregate`, and `threshold` objects are all closed
(`additionalProperties: false`).

The required `semantics` object is also closed
(`additionalProperties: false`). It has exactly two bare members.
`tolerance` is the string `"ciede2000-lab-d65-v1"`. `metrics` is a
non-empty array of unique strings drawn from a one-item vocabulary, so its
value in v0.5 is exactly `["wcag21-contrast-ratio"]`.

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
   top-level carrier member. It then contains one or more **entry blocks**,
   with no blank line between them.
5. The judged-claim labels are `PILLARS:`, `MOOD:`, `ANTI:`, `INVARIANTS:`,
   and `MOTION:`. The per-entry closure rule below applies to them.
6. The commentary-only labels are `REFERENCES:`, `VIEWING:`, and
   `CONSTRAINTS:`. They are legal and optional. They carry no closure
   obligation. Their citation lines must resolve, but a commentary section
   may omit declared entries or cite the same entry more than once.
7. An entry block begins with one **citation line**. The line contains a
   leading `- ` followed by the entry's exact dotted-path citation in inline
   code, with nothing else on that line.
8. A citation line may be followed by one or more **continuation lines**.
   Each continuation line is indented by exactly two spaces and contains free
   rationale prose. The continuation ends at the next citation line, label
   line, or blank line. Rationale is optional: an entry MAY have zero
   continuation lines. When present, rationale MUST NOT restate a carrier
   value under §9.5's single-source rule.
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

**Chapter/carrier ownership rule (normative).** The carrier holds every
machine-checkable fact, including value, scope, and class. The chapter fence
may add rationale. For judged-claim collections, closure is checked in both
directions for each keyed entry:

- Every citation line in the fence MUST resolve to a declared carrier
  entry of the matching kind. A dangling citation is a hard failure in both
  judged-claim and commentary-only sections.
- Every keyed entry in `pillars`, `mood`, `anti`, `invariants`, and
  `motion` MUST have exactly one corresponding citation line in the fence.
  Zero citations or more than one citation is a hard failure.
- When a judged claim cites a reference entry, it uses its optional
  `references` member. Every judged claim cites a viewing entry through its
  required `viewing` member. A threshold also cites its viewing context
  through its required `viewing` member.
  Those JSON values use bare keys, not dotted paths: for example,
  `"references": ["wet-study"]` and `"viewing": "dusk-panel"`.
  `REFERENCES:` and `VIEWING:` fence sections remain optional commentary and
  carry no closure obligation.
- Acceptance-test descriptors cite `constraints.*` entries through their
  `direction_claims` members (§6). Constraint entries have the fixed
  observational class `checked` and carry no fence-closure obligation.
  A `CONSTRAINTS:` fence section remains optional commentary.

### 9.11 Audit hooks and the certification gate

The `checked` audit class means that a machine or fixture verifies the
claim. v0.5 has two disjoint kinds of `checked` coverage:

- **Structural facts.** These are facts inherent in `direction.json`
  validating against its schema, together with §9.10's per-entry fence
  closure. They include reference, viewing, and invariant-axis completeness;
  motion tag, tier, fixture, and viewing declaration shape; carrier, scope,
  and key validity; and the §9.8 tier-comparison rule. The validator or a
  `static-lint`-class check verifies these package facts without running the
  game. They require no capture fixture.
- **Observational `checked` claims.** This kind consists only of
  `constraints.palette.*`, `constraints.thresholds.*`, and
  `constraints.timing.*` entries. Their closed JSON shapes carry no `class`
  member. Their entry kind fixes the class as observational `checked`.

Each observational `checked` claim MUST be cited through `direction_claims`
by at least one acceptance test whose fixture declares the capture procedure
over the domain declared in the carrier (§6). The `direction_claims` member is
a non-empty JSON array of dotted-path strings. For this claim kind — the
observational `checked` constraints — the cited forms are
`constraints.palette.<key>`, `constraints.thresholds.<key>`, and
`constraints.timing.<key>`; these are full dotted paths rather than bare
keys. The array is not limited to these three forms: a motion claim's
`motion.<key>` path also appears here, per the motion-fixture rule below. In
every form, `<key>` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Each claim
MUST reach every state named in its `scope.states`; that reach obligation is
discharged by the §6 procedure and audited under the experimental protocol
(§2d, §9.5), not decided by the package validator. A claim omitted from every
acceptance test's `direction_claims` array is a validation failure.

**Judged claims requiring a capture fixture.** Every `motion.*` entry has the
fixed class `judged` (§9.8). It cannot be `checked`. Its required `fixture`
member is a string holding a bare positive acceptance-test id in the
`AT-<n>` form. The named acceptance test's non-empty `direction_claims` array
includes the full dotted path `motion.<key>`. The panel scores the motion tier
against that fixture's captured frames. Uncaptured live play is not the
scoring evidence. A missing named acceptance test, or a named test that omits
the path, is a hard failure.

Pillars, moods, anti-references, and invariants require no capture fixture.
A panel scores each directly against the finished build under the claim's
bound `viewing` context.

**The judged gate.** The complete v0.5 set of `judged` claim paths is
`pillars.*`, `mood.*`, `anti.*`, `invariants.*`, and `motion.*` (§§9.1, 9.2,
9.4, 9.7, and 9.8). An assessment considers every attempted claim under its
bound `viewing` context (§9.6). v0.5 records assessment coverage and results,
but does not standardize panel composition, scoring, or an overall adherence
verdict. The gate belongs to the experimental certification path (§2d): it
defines no pass/fail outcome in v0.5, empty `assessed` and `adherent` arrays
are the legal record of a run with no assessment, and no v0.5 conformance or
certification outcome turns on the gate's contents beyond the validity rules
stated here.

`direction_result` is the build's JSON record for this gate and for certified
palette-pin evidence. It is a closed object in `opengdd-build.json`. Its only
legal bare member keys are `judged` and `certified_pins`.

The `direction_result` object is present exactly when the source spec's
`direction.json` declares at least one judged claim or at least one
`certify: true` direction-constraint palette pin. It MUST be absent when
neither condition holds. Its two member conditions are independent:

- **`judged`.** This member is required exactly when at least one judged
  claim exists and is absent otherwise. It is a closed object with exactly
  three required bare members: `status`, `assessed`, and `adherent`.
  `status` is the string `"pending"`, the sole value defined in v0.5. No
  certificate can assert that the build followed the direction as a whole
  while the panel protocol remains unintegrated. `assessed` is an array of
  the judged claim paths attempted in this run. `adherent` is an array
  containing the assessed paths judged adherent. Each array contains unique
  dotted-path strings. The schema permits either array to be empty. Every path
  resolves to a declared claim in one of the five judged families above; a
  dangling path is a validation failure. `adherent` is a subset of `assessed`.
  A path found only in `adherent` is a validation failure. These arrays report
  claim coverage and adherence as separate facts.
- **`certified_pins`.** This member is required exactly when at least one
  `constraints.palette.<key>` entry declares `certify: true`, and it is
  absent otherwise (§§7 and 9.9). It is a JSON array with at least one entry.
  Each entry is a closed object with exactly two required string members.
  `path` is a full dotted path in the form `constraints.palette.<key>`.
  `value` is the captured color: `#` followed by exactly six hexadecimal
  digits, with upper- and lowercase letters both legal.

When both source conditions hold, `direction_result` contains both members.
When certified pins are the only condition, it contains `certified_pins` and
has no `judged` member.

The `direction_result` requirement covers only §9 visual-direction claims.
The §10 audio annex creates no certification state.

**`advisory` claims** carry no certification consequence. The validator's
only job is to ensure that they are not classified above the level their
stated criteria support. v0.5 defines no construct whose `class` can legally
be authored as `advisory`. Every defined judged claim kind has the fixed class
`judged`. Every checked claim kind has the fixed observational class
`checked`. The `advisory` value remains in the closed audit-class enum for
forward compatibility with a future construct that needs it.

## 10. Audio direction (DRAFT — non-normative)

**Status: DRAFT and non-normative.** This section is a planning annex. It
creates **no certification consequence**. Nothing elsewhere in this SPEC
depends on it: every downstream reference to an audio construct — today,
§8a's `audio` sub-block — remains inert until a future revision promotes
this section.

Two outcomes remain equally available. A later revision may promote the
annex to normative status. In the judge/generation loop, a generator
proposes candidate audio and a judge evaluates it. Dedicated research may
instead show that the current loop cannot close. In that case, the annex may
become a named entry in the KNOWN-LIMITATIONS record. No v0.5 rule depends
on which outcome is chosen.

The following vocabulary is entirely DRAFT and non-normative. It mirrors
the visual direction block in §9:

- `audio-pillars`: 2–4 named priorities for what sound does.
- `audio-mood`: a prose anchor annotated under §9.3's reference
  discipline.
- `audio-references` / `audio-anti`: the annotation and negative-target
  discipline from §§9.3 and 9.4, plus an audio-specific
  work-resemblance ban type.
- `sound-palette`: source-family and production-character constraints,
  organized by category.
- `audio-behaviors`: the reactivity contract. Each behavior connects a
  game-state trigger to an audible response and a timing bound. This is
  the audio analogue of §9.8's motion rubric. Adaptive music,
  parameter-driven mix changes, and state-bound silence MUST be authored
  as behaviors, never as static adjectives.
- `diegesis-rules`.
- `mix-hierarchy`.
- `silence-map`.
- `temporal-constraints`.
- `acoustic-space-rules`.

The placement of the reactivity contract remains undecided. It may belong
in the direction block or beside the mechanics. That decision remains
inside this DRAFT section.

**Certification consequence: none, unconditionally. This rule is
normative for v0.5.** Audio content authored under this section is **not
evaluated**. It is **not serialized into certification status**. It is
**not used to accept or reject any package or build** in v0.5.

Audio claims have no PENDING state. They receive no `checked`, `judged`,
or `advisory` class assignment. They create no capture-coverage
obligation. A v0.5 validator and a v0.5 certifier MUST both ignore this
section's content operationally, exactly as they ignore any other
non-normative prose. Until a future revision promotes some or all of this
annex, audio is entirely outside certification.

**Capture is a separate descriptive fact.** It carries no certification
meaning of its own. The current capture tooling has no synchronized audio
capture. Even a future normative audio-observation claim therefore has
nothing to measure against yet. This gap is planning information for the
people who scope that future work. It creates no certification rule.

## 11. What v0 deliberately excludes

v0 deliberately excludes:

- multiplayer and networking;
- rendered-capture certification for 3D renderers — a `web-3d` package
  validates, and a build of one can assemble full certification evidence
  under the experimental protocol (§2d) when its complete acceptance
  suite needs only logic and state observations, but no capture profile
  beyond `web-1` exists yet and a rendered-capture acceptance test against
  a 3D renderer has no standardized sampling recipe (§7);
- binary asset pipelines;
- localization structure;
- monetization design beyond the optional commerce split, including IAP
  design;
- any registry API; and
- target families beyond web delivery (`web-2d`, `web-3d`), until the
  format has held up across ten real specs.

---
