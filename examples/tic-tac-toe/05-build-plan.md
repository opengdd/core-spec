# Tic-Tac-Toe: Build Plan

## Phase 1: core-loop

Scope: the board, turn order, placement legality, the win check, and
the draw check, exactly as [02-mechanics.md](02-mechanics.md) states
them. This phase is the whole game.

- Checkpoint: AT-1 through AT-3 pass.

## Phase 2: content

Scope: none. Tic-tac-toe has no story, characters, levels, or
structured content; this package declares no content chapter and no
collections.

- Checkpoint: nothing to verify.

## Phase 3: tuning

Scope: the build consumes `board.size` and `win.line_length` from
[tuning.json](tuning.json) as data rather than embedding their
numbers. Both are certified constants; this package declares no
balance-tunable values.

- Checkpoint: at certification, the resolved tuning snapshot matches
  both certified constants for exact runtime equality.

## Phase 4: presentation

Scope: the Fixed requirements and the direction block of
[04-presentation.md](04-presentation.md), including the mark-ink
palette role declared in [direction.json](direction.json).

- Checkpoint: AT-4 passes, and every Fixed requirement in
  [04-presentation.md](04-presentation.md) is reviewed against the
  build.

## Phase 5: polish

Scope: builder courtesies that touch no rule.

- Checkpoint: all acceptance tests still pass after polish.

## Acceptance tests

The tests are the executable subset of this specification, not its
boundary: every Fixed statement binds a build whether or not a
numbered test covers it.

### AT-1: Turns and placement

```verification
{
  "class": "scenario",
  "given": "a fresh game on an empty board",
  "when": ["the opening placement is made", "play continues with attempts on both empty and occupied cells until the game ends"],
  "then": ["the opening placement belongs to X", "ownership strictly alternates for the whole game", "every occupied-cell attempt is rejected with board and active player unchanged", "every empty-cell placement is accepted and ends the turn"],
  "diagnostics": ["turn-log", "board-before-after"]
}
```

The opening mark is always X, marks strictly alternate, marking an
occupied cell changes nothing — not even whose turn it is — and,
while the game is in progress, marking an empty cell is always
accepted. There is no other action in the game.

### AT-2: A win ends the game

```verification
{
  "class": "scenario",
  "given": "the three prepared positions defined in the test text, in each of which the active player's next placement completes a line of win.line_length of their marks",
  "when": ["the completing placement is made", "any further placement is attempted"],
  "then": ["the game ends immediately as a win for the mover, with every completed line's cells reported in diagnostics", "the further placement is rejected because the game is over"],
  "diagnostics": ["final-board", "declared-result", "winning-line-cells"]
}
```

One prepared position per line orientation, using a period for an
empty cell; none contains a completed line before the move, and each
is reachable by legal alternating play.

```text
Row case, X to move at the top-right cell:

X X .
O O .
. . .

Column case, O to move at the bottom-left cell:

O X .
O X .
. . X

Diagonal case, X to move at the bottom-right cell:

X O .
O X .
. . .
```

### AT-3: Draw, and win before draw

```verification
{
  "class": "scenario",
  "given": "the two prepared positions defined in the test text, each with exactly one empty cell: one where filling it completes no line, and one where filling it completes a line",
  "when": ["the last cell is filled in each position"],
  "then": ["the first position ends in a draw", "the second position ends as a win for the mover, never a draw"],
  "diagnostics": ["final-board", "declared-result"]
}
```

X to move in both prepared positions:

```text
Draw case, filling the last cell completes no line:

X O X
X O O
O X .

Win case, filling the last cell completes the diagonal:

X O O
O X X
X O .
```

### AT-4: Direction constraint capture

```verification
{
  "class": "scenario",
  "given": "a built game rendered at default settings under the table-reading viewing context, played from an empty board to a finished game",
  "when": ["the capture fixture samples the rendered color of every placed mark and every grid line during the in-game state"],
  "then": ["constraints.palette.mark-ink is satisfied over its declared scope"],
  "direction_claims": ["constraints.palette.mark-ink"],
  "diagnostics": ["per-member-sampled-color", "delta-e-per-member"]
}
```

The claim's value, tolerance, and scope are read from
[direction.json](direction.json), not repeated here. A member is one
placed mark or one grid line; the fixture samples each member's
interior pixels, excluding antialiased edges, once, in a stable
resting frame after any placement animation, and every sampled
interior pixel must sit within the declared tolerance of the declared
value. The in-game state ends
the moment the game ends, so a win highlight may recolor the winning
lines freely. The run records its viewport and rendering environment
alongside its diagnostics.
