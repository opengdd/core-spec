# A guided tour of the tic-tac-toe package

If you know tic-tac-toe, you already know the game in this package.
That is deliberate. OpenGDD is an open format for game design
documents. Prose carries the design intent. Structured data makes
selected claims checkable. Authority levels state which decisions
stay fixed and which the designer delegates. A familiar game lets us
study the format without learning a new design at the same time.

The package itself is intentionally lean. Its game chapters are a
one-to-two-minute read and contain the design, not a lesson about the
design. A builder may be a person, an AI agent, or a combination.
This guide provides that lesson from outside the package.

## The shape of the package

The package directory contains seven plain files:

- [manifest.json](../tic-tac-toe/manifest.json): identity and the
  build contract.
- [tuning.json](../tic-tac-toe/tuning.json): numeric gameplay rules
  held as data.
- [01-overview.md](../tic-tac-toe/01-overview.md): the game at a
  glance and the boundary of delegated craft.
- [02-mechanics.md](../tic-tac-toe/02-mechanics.md): the complete
  rules.
- [04-presentation.md](../tic-tac-toe/04-presentation.md): fixed
  presentation requirements and visual latitude.
- [direction.json](../tic-tac-toe/direction.json): machine-readable
  art-direction claims and viewing conditions.
- [05-build-plan.md](../tic-tac-toe/05-build-plan.md): phases and four
  acceptance tests.

This `GUIDE.md` is not an eighth package file. It lives in the sibling
`tic-tac-toe-guide` directory because packages are scanned as spec
content, while teaching prose is not spec content. The learning site
loads the guide separately and places its file-specific sections next
to the package files. Keeping that boundary explicit prevents an
explanation of a rule from becoming another rule by accident.

The numbered chapter names follow the standard layout, so an honest
gap is allowed. There is no `03-content.md`: tic-tac-toe has no story,
levels, dialogue, or other structured content. There is also no
`personalization.json`. Personalization asks a commissioning party to
choose among declared build variants; delegation leaves bounded craft
to the builder. This game delegates presentation choices but needs no
per-build design questions.

## What the mini pass changed

An earlier version made the package teach the format while specifying
the game. The mini pass separated those jobs. Every rule datum remains:
the board and marks, legal placements, X opening and strict
alternation, immediate wins in three orientations, win-before-draw
ordering, terminal input rejection, restart behavior, presentation
requirements, tuning constants, and direction claims. What moved out
was teaching voice and certification apparatus that does not transmit
additional player-visible design.

Two small before-and-after examples show the distinction.

The old overview introduced itself with:

> “This is a complete OpenGDD specification of classic tic-tac-toe …
> It is published as a teaching example of the format.”

The lean overview now says only:

> “Classic tic-tac-toe, expressed faithfully: no twist, no variant
> rules.”

The first quotation teaches why the example exists, so that thought
belongs here. The second tells a builder what game to make.

Likewise, the old mechanics spent a paragraph saying:

> “Every cell begins empty. The board never grows, shrinks, or wraps,
> and cells have no properties other than empty or occupied by exactly
> one mark.”

The lean chapter carries the same operative facts as:

> “The board is a square grid of `board.size` columns and `board.size`
> rows; every cell begins empty and holds at most one mark.”

The rewrite is shorter, but it is not shorthand that asks the builder
to guess. The removed complete-enumeration test is a different case:
it adds proof strength rather than a game rule. It is preserved later
in this guide as a useful example of certification-grade apparatus.

## How conformance works, end to end

The lifecycle has five distinct stages. A valid package, a passing
test, a judged claim, and a certified build are different facts.

1. **Package validation.** The conformance validator reads the spec
   files and reports schema or lint errors and warnings. It checks
   whether the package is well formed and internally consistent. It
   does not run a game.

2. **Building.** A human or agent reads the validated package and
   produces a game. Fixed design statements bind exactly. Delegated
   decisions belong to the builder, within the fantasy and direction
   boundaries.

3. **Acceptance testing.** A runner carries out the structured test
   descriptors in the build plan against the build and records each
   result and its named diagnostics. Revision 0.5 specifies those
   contracts but does not define a universal mechanical interface for
   driving arbitrary games, so the runner is currently a person or a
   capable agent, not necessarily a generic test harness.

4. **Judged audit.** Human reviewers assess judged direction claims
   under their declared viewing conditions. The format standardizes
   the claim and context, not a universal scoring scale or panel
   protocol. Until that panel protocol integrates, judged results are
   recorded as coverage and sit outside the certification audit's
   verdict scope (SPEC §2d).

5. **Certification.** A separate audit checks the full record:
   all acceptance tests, exact runtime equality for certified tuning
   constants, the resolved snapshot and other required facts in
   `opengdd-build.json`, hash reproducibility, the judged findings
   record's validity,
   and direct implementation of Fixed obligations. The draft
   certification protocol names certify, certify-with-notes, and
   do-not-certify as its verdicts.

In this draft, certification is experimental (SPEC §2d): the verdicts above
come from the draft build-certification protocol published with the
conformance suite, and the specification itself defines no normative
certification verdict in v0.5. Certification does not grant or imply
authorization under an OpenGDD certification-mark program. No such program
operates today.

The vocabulary is worth keeping precise. Package validation is
**schema-validated**. A palette tolerance is **objectively
measurable**. Acceptance tests are **runner-executed**. Mood is
**human-judged**. An objectively measurable claim still needs a
runner and evidence; measurable does not mean the package validator
measured it.

Passing tests is necessary, not sufficient. The lean build plan says,
“The tests are the executable subset of this specification, not its
boundary.” A Fixed sentence binds even if no numbered test repeats it,
and certification is where the auditor accounts for that remainder.

## manifest.json: identity and contract

The [manifest](../tic-tac-toe/manifest.json) opens with
`"opengdd": "0.5"`; that version governs the whole package. Its
identity fields name the specification and designer. The `target`
block declares `web-2d`, the genre, a two-minute session, and the
two-players-one-device audience. Genre, session length, and audience
are descriptive metadata. Platform is part of the format's declared
target family.

The `build` block is the builder's entry point. It names the chapters
in reading order, then the plan, tuning file, and direction carrier.
A declared file is load-bearing: it must exist and its contents bind
the build. The guide is absent from this block because it is not part
of the specification.

The `descriptors.mood` entry names `paper-quiet`. Its `intent`
describes a nearby, friendly scrap-paper game, and its three `anti`
objects rule out arena spectacle, casino language, and children's-toy
gloss. Other files can cite the descriptor instead of restating it.
Anti-references matter because excluded interpretations often narrow
delegated space more efficiently than more positive adjectives.

There is no `commerce` block. It is optional and irrelevant to this
archival teaching specimen.

## tuning.json: numeric rules held as data

The [tuning file](../tic-tac-toe/tuning.json) separates numbers by
role:

- `tunables` contains rebalance-safe runtime numbers.
- `constants` contains numeric rules whose change would change the
  game.
- `meta` carries metadata for keys, including whether exact runtime
  equality must be certified.

Here `tunables` is empty. `board.size` and `win.line_length` are both
constants and both have `certify: true`. A wider board or a different
line length would be a different game, not a balance patch. The dots
in those names are ordinary characters in flat keys, not nested JSON.

The chapters refer to the keys instead of repeating their digits.
That gives each numeric rule one source of truth and lets the
validator warn about duplicated normative numbers. The certification
gate later compares the constants with the resolved snapshot of what
the running build actually consumed; copying the right digits into a
source file is not enough if runtime behavior uses something else.

The tuning file does not own every number in the package. Target
metadata, color values and tolerances, and numbers invented inside
delegated craft have different homes. It owns normative numeric
gameplay parameters.

## 01-overview.md: the game and its boundary

The [overview](../tic-tac-toe/01-overview.md) begins with a fenced
`fantasy` block:

```fantasy
You are one of two rivals claiming a small grid one mark at a time, each trying to own a straight line before the other can.
Feel: quick, familiar, exacting, friendly.
NOT: flashy, chancy, sprawling, cruel.
```

The validator parses this line-oriented shape: one player-fantasy
sentence, a `Feel:` list, and a non-empty `NOT:` list. The block is
also the tie-breaker among valid delegated choices. A presentation
decision can satisfy every explicit visual requirement and still be
wrong if it makes the game flashy or cruel.

The remainder now does only the overview's design work. It identifies
classic tic-tac-toe, states the shared-device loop and terminal
behavior, excludes timers, scores, campaigns, difficulty settings and
computer opponents, and delegates unspecified audiovisual craft. The
delegation is bounded twice: craft may change no rule, and it may add
neither chance nor hidden state.

The chapter closes with the package license. Tic-tac-toe is a
public-domain folk game; CC-BY-4.0 covers this expression of it, not
ownership of the game.

## 02-mechanics.md: complete rules without a lesson inside them

The [mechanics chapter](../tic-tac-toe/02-mechanics.md) is compact,
but every gameplay decision needed by a builder is still explicit.
Untagged design statements are Fixed by default.

The board section establishes a square grid, empty initial cells, one
mark per cell, two mark owners, and permanent ownership. The turns
section fixes X as opener, strict alternation, one legal placement per
turn, no passing or double moves, occupied-cell rejection with no
state change, and empty-cell acceptance. Player input is the only
source of variation, so the rules never need a tie-break.

The ending section fixes the details that are easy to implement in
the wrong order:

- Check for a row, column, or corner-to-corner diagonal immediately
  after every accepted placement.
- End on a win before checking for a draw, and reject all later
  placements.
- If one placement completes two lines, report both and award the one
  win.
- Declare a draw only when the board is full and no line was
  completed.
- Start a fresh game from an empty board with X opening again.

The equality of `board.size` and `win.line_length` is part of this
design. Changing either constant is explicitly a new game, not a
data-only revision. That sentence prevents a builder from trying to
generalize prose whose row and diagonal language is intentionally
specific to this geometry.

## 04-presentation.md and direction.json: fixed floor, delegated craft, measurable claims

The [presentation chapter](../tic-tac-toe/04-presentation.md) and
[direction carrier](../tic-tac-toe/direction.json) divide visual
intent between readable prose and structured claims.

The chapter's Fixed list requires the whole board and all marks to be
visible at once, drawn grid lines, unmistakable empty and occupied
cells, shape-based distinction between X and O, a continuously visible
active player, complete win or draw feedback, every completed winning
line indicated, and an in-game path to a fresh board. Everything else
is delegated craft: texture, stroke, animation, layout, typography,
rejection feedback, and sound. That craft remains bounded by the
fantasy and `descriptor:mood:paper-quiet` and may alter no rule.

The fenced `direction` block cites two entries from the carrier:

- `mood.paper-quiet` connects the manifest descriptor to the `judged`
  audit class and the `table-reading` viewing context.
- `constraints.palette.mark-ink` sets one near-black ink role for
  every placed mark and grid line during the in-game state, with an
  exhaustive population and a numeric tolerance.

The fence explains why the claims exist; `direction.json` holds what
is claimed. Dotted paths cite carrier entries,
`descriptor:mood:paper-quiet` is a typed cross-file reference to the
manifest, and flat names such as `board.size` are tuning keys. These
spellings identify different kinds of object.

The carrier's `semantics` block names the color-distance math, and its
viewing entry fixes scale, speed, display assumptions, and builder
blindness for the judged mood. The required metrics list contains the
format's contrast-ratio metric even though this package declares no
contrast constraint; it is format floor, not an extra design claim.

One shared ink is deliberate. Player identity is carried by X and O
shape, while ink color carries atmosphere. The claim is objectively
measurable, but its capture procedure belongs in the build plan rather
than in the color value itself.

## 05-build-plan.md: phases, four tests, and what moved to teaching

The [build plan](../tic-tac-toe/05-build-plan.md) follows five phases.
Core-loop covers the whole game and points to AT-1 through AT-3.
Content honestly has no work. Tuning consumes and later certifies the
two constants. Presentation pairs AT-4 with direct review of every
Fixed presentation requirement. Polish may add courtesies that touch
no rule, after which all tests run again.

All four current tests use the `scenario` class:

- **AT-1, Turns and placement,** combines the old turn-order and
  legality checks. It covers X opening, alternation, occupied-cell
  rejection without a turn change, and accepted empty-cell placement.
- **AT-2, A win ends the game,** uses reachable row, column, and
  diagonal fixtures, checks immediate termination, reports every
  completed line, and rejects a post-game placement.
- **AT-3, Draw, and win before draw,** uses two one-cell-left boards
  to distinguish a true draw from a last-cell win.
- **AT-4, Direction constraint capture,** measures
  `constraints.palette.mark-ink` over its declared scope.

Each test has a fenced `verification` JSON descriptor followed by
human-readable fixture or procedure text. `given`, `when`, and `then`
state the contract; `diagnostics` names the evidence a run must
produce. Those diagnostic labels are package-defined record keys, not
a central format vocabulary.

### The sampling semantics behind AT-4

The lean AT-4 keeps the procedure short, so it is worth unpacking the
semantics that the old package's direction test, then numbered AT-6,
taught at length.

A member of the constrained population is one placed mark or one grid
line. Exhaustive coverage means the fixture observes every such
member, not a convenient sample of members. For each member it samples
pixels fully inside the stroke and excludes antialiased edge pixels,
whose blend with the background would measure a different thing. Each
sampled interior pixel must fall within the `ciede2000-lab-d65-v1`
tolerance declared in the carrier.

Timing and state boundaries matter too. Measure each member once in a
stable resting frame, after placement animation and transient feedback
finish. The declared `in-game` state ends when the game ends, so a win
highlight may recolor completed lines without violating the claim.
Record the viewport and rendering environment with the per-member
colors and color differences, because those conditions can affect the
measurement.

The carrier remains the single source for value, tolerance, population
and state. AT-4 cites the claim and describes how to observe it; it
does not copy those facts.

### The removed AT-5 as a certification instrument

The earlier package included an exhaustive-search test. It is no
longer a current acceptance test, but its descriptor remains useful
teaching material. (Quoted verbatim from the old package: its
`transitions` anchor pointed at the old chapter's "Taking a turn"
heading, which the lean chapter folds into "Turns".)

```verification
{
  "class": "exhaustive-search",
  "initial_states": ["the empty board with X to move"],
  "transitions": "02-mechanics.md#taking-a-turn",
  "finite_state": "a state is the grid contents, the active mark, and the game status (in progress, x-win, o-win, or draw); terminal states have no successors; the reachable set is finite because every turn fills one cell and the board has finitely many cells",
  "complete": true,
  "predicate": "every reachable terminal state is exactly one of x-win, o-win, or draw; no reachable state contains completed lines for both players; and each of the three outcomes has at least one witness game",
  "diagnostics": ["witness-per-outcome", "double-win-state", "unclassified-terminal", "search-completeness-record"]
}
```

Starting from the empty board, this class can enumerate every reachable
state and certify three universal facts: win for X, win for O, and draw
are the only terminal outcomes; legal play never produces a state in
which both players have completed lines; and every one of those three
outcomes is reachable. That is stronger than sampling. The
`complete: true` field is an obligation, not self-proving syntax: the
runner must exhaust the frontier and record state and edge counts, its
deduplication rule, and its completeness evidence.

Why remove something so rigorous? It transmits no additional rule to
the builder. The four lean scenarios cover the behavior most likely to
break, while every Fixed rule remains binding and auditable. Complete
enumeration is apparatus for a certification-grade instrument; the
lean package is optimized for design transmission. The same
distinction recurs in material-measurement profiles: apparatus can add
cross-build proof without adding player-observable design. It is
valuable when that proof is the goal, and it belongs in teaching or a
certification instrument rather than on every minimal designer spec.

The format also defines `property` and `static-lint` test classes, but
this package uses neither. Adding one merely to demonstrate the class
would make the example less honest.

## What the validator checks

From the `opengdd` directory, validate the package with:

```text
node conformance/validate.mjs examples/tic-tac-toe
```

The validator checks required files, schemas, declared paths, tuning
keys and metadata, the fantasy-block shape, direction citations and
constraint coverage, consecutive acceptance-test numbering,
descriptor structure, and required prose after each descriptor. It
also issues advisory lints for likely problems such as missing
tie-break language or duplicated normative numbers. Errors invalidate
a package; warnings ask for human review.

The current lean package validates with **0 errors and 0 warnings**.
The sibling guide is outside the package, is not declared by the
manifest, and is not scanned by this command. The learning site's own
build reads it separately and depends on the exact file-section
headings used in this page.

Validation checks shape and internal references, not domain truth. It
cannot prove that AT-2's boards are reachable, that AT-3 has no
pre-existing win, that AT-4 sampled every member, that the running
game follows the rules, or that the mood feels like quiet play on paper. Those
questions belong to runners, reviewers, and the certification audit.

## What a builder does with the package

A builder starts with the manifest, reads the chapters in their
declared order, loads the two numeric constants as data, and makes
choices only where the spec delegates them. It implements the phases,
runs AT-1 through AT-4, records their diagnostics and the resolved
tuning snapshot, and accounts for the remaining Fixed statements.

The definition of done is a spec-faithful, auditable build, not merely
four green labels. A game that scrolls the board, identifies players
only by color, or omits one of two simultaneously completed lines can
fail Fixed obligations even if its test record looks green. A neon
arena can also fall short of the judged mood, though v0.5 records that
assessment rather than adjudicating it. Two builders may choose different
strokes, layouts, motion, feedback, and sound while producing the same
game; that bounded variation is delegated craft.

## Where to go next

Use this package as a decoder ring for a game you do not already know,
then read the format specification for constructs this example does
not need: content collections, personalization questions, declared
graphs, and clocks and regimes.

## License

This guide is published under CC-BY-4.0, the same license as the
OpenGDD specification text. The tic-tac-toe package carries its own
CC-BY-4.0 note, and the public-domain game belongs to everyone.
