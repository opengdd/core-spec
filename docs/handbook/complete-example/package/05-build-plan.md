# Garden Snake: Build Plan

## Phase 1: core-loop

Scope: the garden grid, the start layout, the tick, direction input,
eating and growth, and the end of a run, exactly as
[02-mechanics.md](02-mechanics.md) states them. This phase is the
whole game.

- Checkpoint: AT-1 through AT-4 pass.

## Phase 2: content

Scope: none. Garden Snake declares no content chapter and no
collections.

- Checkpoint: nothing to verify.

## Phase 3: tuning

Scope: the build consumes every key in [tuning.json](tuning.json) as
data rather than embedding its number.

- Checkpoint: all six keys are read from tuning data.

## Phase 4: presentation

Scope: the delegated presentation of [01-overview.md](01-overview.md):
a garden a player reads at a glance, a snake whose length is always
countable, an apple that stands out.

- Checkpoint: a playtester can tell snake, apple, and wall apart
  without being told.

## Phase 5: polish

Scope: builder courtesies that touch no rule.

- Checkpoint: all acceptance tests still pass after polish.

## Acceptance tests

The tests are the executable subset of this specification, not its
boundary: every Fixed statement binds a build whether or not a
numbered test covers it.

### AT-1: Apples grow the snake, walls and body end the run

```test
{
  "type": "scenario",
  "given": "a run in progress with the head one cell from the apple",
  "when": ["the head moves onto the apple", "play continues until the head moves into the wall", "a fresh run continues until the head moves into the snake's own body"],
  "then": ["eating grows the snake by one cell, scores one apple, and a new apple appears in an empty cell", "the wall ends its run on the spot", "the body ends its run on the spot", "each finished run reports its apple count"],
  "diagnostics": ["tick-log", "garden-before-after"]
}
```

Three moments cover the ordinary rules: one meal, one wall, one
collision with the body. Eating is the only way to grow, and the
score is nothing but the apples.

### AT-2: The start is the same in every run

```test
{
  "type": "scenario",
  "given": "a fresh run",
  "when": ["the run begins"],
  "then": ["the snake lies along the middle row at the length and layout 02-mechanics.md fixes, its head on the center cell, moving right", "exactly one apple sits in a cell the snake does not occupy"],
  "diagnostics": ["garden-before-after"]
}
```

Every run opens identically except for where the apple fell. A build
whose snake starts anywhere else, at any other length, or moving any
other way does not pass.

### AT-3: Filling the garden wins

```test
{
  "type": "scenario",
  "given": "a run whose snake occupies every cell but one, with the apple in that last cell",
  "when": ["the head moves onto the apple"],
  "then": ["the snake grows to fill the whole garden", "the run ends as a win on the spot", "the score counts that final apple"],
  "diagnostics": ["tick-log", "garden-before-after"]
}
```

The garden can be beaten. When the last free cell is eaten there is
no room for another apple, and that is victory, not an error.

### AT-4: Apples speed the snake up in steps

```test
{
  "type": "scenario",
  "given": "a run one apple short of snake.speedup_every_apples, with its current tick interval above snake.minimum_tick_seconds",
  "when": ["the snake eats the next apple", "the next tick begins"],
  "then": ["the score reaches a speed-up threshold", "the next tick interval is snake.speedup_step_seconds shorter than before, but not below snake.minimum_tick_seconds"],
  "diagnostics": ["tick-log", "apple-count-before-after"]
}
```

Speed changes only at the declared apple milestones. The floor keeps
the final stretch playable even when the garden is nearly full.
