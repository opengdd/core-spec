# Tic-Tac-Toe: Presentation

```direction
> DELEGATED: presentation-direction

MOOD:
- `mood.paper-quiet`
  A game drawn on scrap paper between two people who happen to be
  nearby.

CONSTRAINTS:
- `constraints.palette.mark-ink`
  One shared ink; the players stay distinguishable by mark shape
  alone.
```

## Fixed requirements

- The whole board and every placed mark are visible at once, with no
  scrolling, zooming, or paging.
- The cells are separated by drawn grid lines.
- An empty cell and an occupied cell are unmistakable at a glance.
- The cross mark and the ring mark are distinguishable by shape
  alone; color never carries player identity.
- While a game is in progress, the identity of the active player is
  visible at all times.
- A win names the winning mark and visibly indicates every completed
  line (a single placement can complete two); a draw is announced.
- After a game ends, a fresh board is offered without leaving the
  game.

> DELEGATED: Everything not required above is the builder's craft:
> texture, stroke, animation, layout, typography, feedback for
> rejected placements, and any sound. Craft may touch no rule, and is
> bounded by the fantasy block in [01-overview.md](01-overview.md)
> and the mood `descriptor:mood:paper-quiet`.
