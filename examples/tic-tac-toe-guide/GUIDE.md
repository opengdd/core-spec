# A guided tour of the tic-tac-toe package

If you know tic-tac-toe, you already know the game in this package.
That is deliberate. OpenGDD is an open format for game design
documents. Prose carries the design intent. Structured data makes
selected claims checkable. Authority levels state which decisions
stay fixed and which the designer delegates. A familiar game lets us
study the format without learning a new design at the same time.

The package itself is intentionally lean. Its game chapters take a few
minutes to read and contain the design, not a lesson about the
design. A **builder** is the person, team, AI system, or combination
that turns the package into a game. This guide provides the lesson
outside the package.

## The shape of the package

The package directory contains seven plain files:

- [manifest.json](../tic-tac-toe/manifest.json): identity and target.
- [tuning.json](../tic-tac-toe/tuning.json): shared numeric gameplay
  values.
- [01-overview.md](../tic-tac-toe/01-overview.md): the game at a
  glance and the boundary of delegated craft.
- [02-mechanics.md](../tic-tac-toe/02-mechanics.md): the complete
  rules.
- [04-presentation.md](../tic-tac-toe/04-presentation.md): fixed
  presentation requirements and visual latitude.
- [direction.json](../tic-tac-toe/direction.json): structured art
  direction and viewing conditions.
- [05-build-plan.md](../tic-tac-toe/05-build-plan.md): five build
  stages and four acceptance tests.

This `GUIDE.md` is not an eighth package file. It sits in the sibling
`tic-tac-toe-guide` directory because teaching prose is not part of the game
specification. Package validation does not scan it.

OpenGDD reads chapter files by presence and filename order. The gap before
`04-presentation.md` is valid. There is no `03-content.md` because this game
has no story, characters, levels, dialogue, or structured content. The
package has no `personalization.json` because it asks for no per-build design
answers. It delegates some presentation craft instead.

## How checking works, end to end

Conformance means meeting the OpenGDD format's rules. A Fixed statement is a
design decision the builder follows exactly as written. A Delegated statement
gives the builder a bounded choice.

OpenGDD separates checking into three layers. The
[Promises and proof](https://opengdd.org/handbook/promises-and-proof/)
handbook chapter gives the full introduction.

1. **Package checking** asks whether the design is sound on paper. The
   validator checks the package bytes, and a human reviews its prose. Neither
   runs the game.

2. **Record checking** asks whether the builder's `opengdd-build.json` report
   is coherent and agrees with the package. It does not prove that the tests
   passed or that the running game consumed the recorded values.

3. **Audit checking** asks whether the builder's claim is true in reality. A
   **runner**, the tool or person that executes the tests, follows a named
   runner profile. An **auditor**, the person reviewing the package, build,
   and evidence, follows the audit profile. The profile owns runtime-value
   checks, review of Fixed prose, and judged art direction.

The [OpenGDD specification](../../SPEC.md) defines package and build-record
conformance. The [build-certification protocol](../../conformance/CERTIFICATION.md)
defines the experimental runner and audit profiles. Version 0.8 defines no
normative certification outcome, and the draft protocol grants no right to
use a certification mark.

The distinction matters here: the validator checks that a numeric colour
promise has a valid shape and a covering test, the runner observes the build,
and the auditor decides whether the evidence supports the claim. Passing every
test does not replace review of Fixed prose that no test repeats.

## manifest.json: identity and target

The [manifest](../tic-tac-toe/manifest.json) opens with
`"opengdd": "0.8"`. That value selects the package's format version. The
remaining identity fields give the package id `tic-tac-toe`, design version
`1.0.0`, title `Tic-Tac-Toe`, and designer name `OpenGDD Examples`.

The `target` object says:

```json
{
  "platform": "web-2d",
  "genre": "abstract strategy",
  "session_minutes": 2,
  "audience": "anyone; two players sharing one device"
}
```

Here `web-2d` describes the game's two-dimensional state space. It does not
choose a rendering technique. Genre, session length, and audience describe
the intended game and play situation.

The manifest does not list chapters, `tuning.json`, or `direction.json`.
OpenGDD discovers those files in their standard locations. The package has no
optional `commerce` object.

## tuning.json: numeric rules held as data

The [tuning file](../tic-tac-toe/tuning.json) is deliberately small:

```json
{
  "values": {
    "board.size": 3,
    "win.line_length": 3
  }
}
```

`values` is one flat map. The dots are characters in each key, not nested
JSON objects. A key with no entry in the optional `ranges` map is fixed as
written. This package has no ranges because changing the board size or line
length would produce a different game. It has no numeric `rules` table
because the mechanics chapter already states their design relationship:
`board.size` and `win.line_length` are equal for this game.

The chapters cite the keys instead of repeating their digits. This gives each
shared gameplay number one source of truth. It also lets tools follow the
connection from prose to data.

Not every number belongs here. The manifest's session length, the colour and
tolerance in `direction.json`, and test inputs remain in the files that give
them meaning. `tuning.json` holds the shared gameplay numbers that a build
reads.

With no personalization questions, the package defaults are these two values
unchanged. A build record carries the full resolved values snapshot. The
experimental audit may then compare selected entries with what the running
game actually consumes.

## 01-overview.md: the game and its boundary

The [overview](../tic-tac-toe/01-overview.md) begins with the required
`fantasy` block:

```fantasy
You are one of two rivals claiming a small grid one mark at a time, each trying to own a straight line before the other can.
Feel: quick, familiar, exacting, friendly.
NOT: flashy, chancy, sprawling, cruel.
```

The block is the first substantive content after the title. It gives the
player fantasy, four feel adjectives, and results to avoid. It also guides
every delegated choice in the package. A presentation choice can satisfy the
fixed visual requirements and still be wrong if it makes the game flashy or
cruel.

The next paragraph identifies classic tic-tac-toe and says there is no twist
or variant. The following paragraph settles the shared-device loop, win and
draw outcomes, restart, and excluded features such as a timer, score,
difficulty setting, or computer opponent.

The final design paragraph delegates audiovisual decisions beyond
`04-presentation.md`. It sets hard boundaries around that freedom:

> “Craft may touch no rule and may introduce no chance or hidden state; the
> fantasy block above is the tie-breaker among valid choices.”

The chapter closes with the package license. Tic-tac-toe is a public-domain
folk game. CC-BY-4.0 covers this expression of it, not ownership of the game.

## 02-mechanics.md: complete rules in a short chapter

The [mechanics chapter](../tic-tac-toe/02-mechanics.md) is compact,
but it settles every gameplay decision a builder needs. Untagged design
statements are Fixed by default.

The board section establishes a square grid, empty initial cells, one mark
per cell, two mark owners, and permanent ownership. The turns section fixes X
as the opener, strict alternation, one placement per turn, no passing or
double moves, and occupied-cell rejection with the board and active player
unchanged. Every empty cell is legal while play continues.

The ending section fixes details that are easy to implement in the wrong
order:

- Check for a row, column, or corner-to-corner diagonal immediately after
  every placement.
- End on a win before checking for a draw, and accept no later placement.
- If one placement completes two lines, count both lines and award one win.
- Declare a draw only when the board is full and no line was completed.
- Start a fresh game with X opening again.

Player input is the only source of variation. The rules never face a choice,
so they need no tie-break. The chapter explicitly says that changing either
`board.size` or `win.line_length` creates a new game, not a data-only revision
of this one.

## 04-presentation.md: the fixed presentation floor

The [presentation chapter](../tic-tac-toe/04-presentation.md) first
points the builder to two entries in the direction file:

- `mood.paper-quiet`: “A game drawn on scrap paper between two people who
  happen to be nearby.”
- `colors.mark-ink`: “One shared ink; the players stay distinguishable by
  mark shape alone.”

These lines sit in a Delegated section labelled `presentation-direction`. They
give the builder structured art direction to follow without choosing every
visual detail.

The `Fixed requirements` section sets the presentation floor. The whole board
and every mark stay visible at once. Grid lines separate cells. Empty and
occupied cells are unmistakable. X and O differ by shape rather than colour.
The active player remains visible during play. A win names the winning mark
and shows every completed line, a draw is announced, and a fresh board is
offered without leaving the game.

The chapter then delegates texture, stroke, animation, layout, typography,
rejected-placement feedback, and sound. Those choices may not change a game
rule. The fantasy block and `mood.paper-quiet` bound them.

## direction.json: self-contained art direction

The [direction file](../tic-tac-toe/direction.json) contains four
root objects: `palette`, `mood`, `colors`, and `viewing`.

`palette.board.mark-ink` names the sRGB colour `#2B2A26`. sRGB is the standard
colour space used by web displays. The mood entry
`mood.paper-quiet` describes a friendly, unhurried, low-stakes scrap-paper
game. Its three negative examples rule out arena spectacle, casino imagery,
and children's-toy gloss.

The measured promise `colors.mark-ink` points to the named palette colour. It
allows a CIEDE2000 distance, a perceptual colour-difference measure, of 12. It
applies to “every placed mark and every grid line” while the game is
`in-game`. The file's single
`viewing` object asks for the whole board at real play speed and an sRGB
display at standard desktop viewing distance.

The package uses one shared ink on purpose. Mark shape identifies each
player, while colour carries atmosphere. The direction file states the
promise once. The presentation chapter cites it, and AT-4 cites it again to
describe how a runner observes it.

## 05-build-plan.md: phases and acceptance tests

The [build plan](../tic-tac-toe/05-build-plan.md) gives the builder
five ordered build stages, headed as phases:

- `core-loop` implements the board, turns, placements, win check, and draw
  check. AT-1 through AT-3 are its checkpoint.
- `content` records that this game has no content chapter or collections.
- `tuning` makes the build consume `board.size` and `win.line_length` as data.
- `presentation` implements the fixed presentation requirements and the art
  direction. AT-4 covers the measured colour promise.
- `polish` permits builder courtesies that change no rule, followed by another
  run of every acceptance test.

These phase headings are build stages, not conformance layers. They help a
builder order the work. The three checking layers decide what the package,
record, and experimental audit establish.

The plan contains four current tests, all of type `scenario`:

- **AT-1, Turns and placement,** checks X opening, strict alternation,
  occupied-cell rejection without a turn change, and accepted empty-cell
  placement.
- **AT-2, A win ends the game,** supplies reachable row, column, and diagonal
  positions, checks immediate termination, reports every completed line, and
  rejects a post-game placement.
- **AT-3, Draw, and win before draw,** supplies two one-cell-left boards to
  distinguish a draw from a last-cell win.
- **AT-4, Direction promise capture,** observes `colors.mark-ink` across
  its declared scope.

AT-4 is a scenario because it makes one promise about one rendered game, even
though its capture procedure samples many marks and grid lines.

Each `AT-n` heading is followed immediately by one `test` block. The
`given`, `when`, and `then` fields state the situation, action, and expected
result. `diagnostics` names the evidence the runner should produce. AT-4 also
uses `direction_claims` to point to `colors.mark-ink` without copying the
promise into the test.

Acceptance-test numbers are unique and ascend in document order. Gaps are
allowed because a removed number is not reused. This package currently uses
AT-1 through AT-4 without a gap.

### How AT-4 observes the colour promise

AT-4 runs from an empty board to a finished game. A member is one placed mark
or one grid line. The procedure samples every member rather than a subset.
For each member, it samples interior pixels and excludes antialiased edges.

The runner samples once in a stable resting frame after placement animation.
Each sampled interior pixel must remain within the distance declared in
`direction.json`. The `in-game` period ends when the game ends, so a win
highlight may recolour a completed line afterward. The run records its
viewport and rendering environment with the diagnostics.

The direction file remains the only source for the colour, tolerance, covered
members, and applicable state. AT-4 says how to observe the promise. It does
not repeat those values.

### What a general test would look like

This package does not need a `general` test. If the design needed one promise
across every reachable board, its test block could look like this:

```test
{
  "type": "general",
  "scope": "every state reachable from the empty board with X to move",
  "holds": "every reachable terminal state is exactly one of x-win, o-win, or draw; no reachable state contains completed lines for both players; and each of the three outcomes has at least one witness game",
  "diagnostics": ["witness-per-outcome", "double-win-state", "unclassified-terminal", "search-completeness-record"]
}
```

A `general` test makes one promise across many cases. Here, a runner that
walks the whole declared scope can establish three universal facts: X win, O
win, and draw are the only terminal outcomes; legal play never reaches a
state where both players have completed lines; and each outcome has a witness
game.

Sampling cannot establish those universal claims. When a runner samples a
game-local `general` test, the build record names its id in
`evidence.acceptance.sampled`. The runner may report what the sampled cases
showed, but it may not turn a sample into a claim of absence or universality.

This stronger audit instrument transmits no additional game rule. The four
current scenarios cover the behaviour most likely to break, while every Fixed
statement remains binding. Whole-board enumeration is valuable when stronger
audit evidence is the goal, but it does not belong in every lean design
package.

The two current test types are `scenario` and `general`. This package needs
only scenarios. Adding a current `general` test only to demonstrate the type
would make the package less honest about what the design needs.

## What the validator checks

From the repository root, validate the package with:

```text
node conformance/validate.mjs specs/tic-tac-toe
```

The validator checks required files, JSON shapes, the fantasy block,
cross-file references, measured-promise coverage, and test block shape and
numbering. The [Acceptance tests](https://opengdd.org/handbook/acceptance-tests/)
chapter explains the test checks. This package passes with 0 errors and 0
warnings; the guide remains outside the package and is not scanned.

A clean command does not prove that the prepared boards are reachable, the
runner sampled every member, the build follows the mechanics, or the mood
feels like quiet play on paper. Human package review, the named runner, and
the experimental audit own those questions.

## What a builder does with the package

A builder reads the manifest, then reads every numbered chapter in filename
order. The builder loads the two shared gameplay values, follows the five
build stages, and makes choices only where the package delegates
them. A named runner executes AT-1 through AT-4 and produces the requested
diagnostics. The build record then reports the resolved values and acceptance
results.

The goal is a faithful and reviewable build, not merely four green labels. A
game that scrolls the board, identifies players only by colour, or fails to
show both lines from one winning move breaks Fixed prose even if its recorded
tests are green. A neon arena may conflict with `mood.paper-quiet`. The audit
profile examines both kinds of evidence.

Two builders may choose different strokes, layouts, motion, feedback, and
sound while producing the same game. That variation is deliberate. The
package fixes the player-visible design and gives the builder bounded room
for craft.

## Closing reflections

This package is small because the game is small, not because the format asks
the builder to fill gaps. The prose settles the complete game. The JSON files
give tools stable names for selected data and art direction. The tests focus
on behaviour that benefits from execution, while Fixed statements remain
binding beyond test coverage.

Use the package to learn how those parts connect, then compare the same shape
with a game you do not already know. The OpenGDD specification covers optional
mechanisms this example does not need, including collections,
personalization, rulesets, runtime values, modes, clocks, and contracts.

## License

This guide is published under CC-BY-4.0, the same license as the OpenGDD
specification text. The tic-tac-toe package carries its own CC-BY-4.0 note,
and the public-domain game belongs to everyone.
