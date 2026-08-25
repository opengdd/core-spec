# Garden Snake: Mechanics

## The garden

The garden is a square grid, `garden.size` cells per side, enclosed by
a wall. The snake occupies a chain of cells. Except at the moment of
winning, exactly one apple sits in a cell the snake does not occupy.

## The start

A run begins with the snake `snake.start_length` cells long, laid
along the middle row: head on the center cell, body extending left,
moving right. The first apple is placed by the same random rule as
every later one.

## The tick

Time advances in steps of `snake.tick_seconds`. Each tick the head
moves one cell in the current direction, the body follows, and the
tail cell empties. Between ticks the player may set a new direction;
setting the opposite direction is ignored. Direction input is the
game's only action.

After every `snake.speedup_every_apples` apples eaten in the current
run, later ticks become `snake.speedup_step_seconds` shorter, down to
`snake.minimum_tick_seconds`. The shorter interval begins with the next
tick. `snake.speedup_every_apples` is a positive whole number.

## Eating and growing

When the head moves onto the apple the snake grows: the tail does not
empty that tick, and the score gains one apple. If any cell remains
unoccupied, the next apple appears in one picked at random from those
cells. The randomness is the builder's craft under the overview's
delegation: no fixed pattern, nothing a player can exploit.

## The end of a run

The run ends when the head moves into the wall or into the snake's
own body. It ends as a win when the snake fills the whole garden and
leaves no cell for an apple. The finished run reports its score.
Nothing carries between runs.
