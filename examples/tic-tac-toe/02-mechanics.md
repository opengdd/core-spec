# Tic-Tac-Toe: Mechanics

Numeric rules refer to keys in [tuning.json](tuning.json).

## Board and marks

The board is a square grid of `board.size` columns and `board.size`
rows; every cell begins empty and holds at most one mark. One player
owns the cross mark, written X; the other owns the ring mark, written
O. A placed mark never moves, changes owner, or leaves the board.

## Turns

X takes the opening turn; the players then strictly alternate, one
placement per turn, until the game ends. No passing, no double moves.
The active player marks exactly one empty cell: every empty cell is a
legal placement, and nothing else is. An attempt to mark an occupied
cell is rejected with the board unchanged and the same player still
active. Player input is the only source of variation; no rule here
ever faces a choice, so none needs a tie-break.

## Ending

A player wins at the moment their placement completes an unbroken
straight line of `win.line_length` of their own marks: a full row, a
full column, or a full corner-to-corner diagonal. The win check runs
immediately after every placement, before any other check; a win ends
the game on the spot, and no further placement is ever accepted. A
placement that completes two lines at once simply wins, and both
lines count as completed.

If a placement leaves every cell occupied and completes no line, the
game is a draw. The draw check runs only after the win check, so a
placement that fills the board and completes a line is a win, never a
draw.

There is no resignation, no timer, and no abandoned state inside the
rules. A fresh game is identical to the setup above, with X again
opening. `board.size` and `win.line_length` are equal by design:
changing either constant is a new game, never a data-only revision of
this one.
