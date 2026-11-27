# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles/simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Current inventory

- **16 games**, each a self-contained folder with `index.html` + `game.js`, linked from the hub (`index.html`).
  - Classics: tic-tac-toe, 2048, minesweeper, memory, chess, connect-four, lights-out, code-breaker, slide-15, reversi.
  - Logic puzzles: mini-sudoku, tango, queens, zip, patches, nonogram.
- **Shared layer** (all 16 games load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`):
  - `gamekit.js` (`window.Gamekit`): mulberry32 PRNG, `dailySeed`, `storage(prefix)`, `wireDifficultyChips`, `fmtTime`, `onLongPress`, `shuffle`. Loaded by 13 games; not by tic-tac-toe, minesweeper, chess.
  - Daily-seed + easy/medium/hard chip pattern: lights-out, code-breaker, slide-15, mini-sudoku, tango, queens, zip, patches, nonogram. connect-four and reversi use chips for AI depth.
  - Help: a `<template id="man-<game>">` + `.man-trigger` button per game.
  - Game pages (`body.g-<name>`) always use soft.css's warm-dark palette; the dark/light toggle only affects the hub.
- **No build, no dependencies, no automated tests.**

## Proposed improvements

1. **Cheap syntax check** — run `node --check` over all JS before committing (see commands below). No tooling added.
2. **Hub freshness** — keep the `new` badge on the three most recent games only (currently slide-15, nonogram, reversi).

## Games

| Status | Game | Notes |
|---|---|---|
| ✅ | **code-breaker** | Mastermind-style; 4/6/10, 4/6/8, 5/8/10 (pegs/colors/guesses); duplicate-safe scoring; best = fewest guesses. |
| ✅ | **slide-15** | 3×3/4×4/5×5; scramble is a random walk of legal slides (always solvable); line slides, arrows, undo; best = fewest moves. |
| ✅ | **nonogram** | 5×5/8×8/10×10; generator keeps only boards a line-by-line solver fully determines (unique, no guessing); fill/mark tools, straight-line drag, right-click mark; best time. |
| ✅ | **reversi** | Othello rules incl. passes; vs. AI (negamax alpha-beta, depth 1/3/5, corner-first ordering, positional + mobility eval) or local 2P; undo to your turn; W–L–D record per level (finished AI games can't be undone). |
| Proposal | **dots-and-boxes** | Classic vs. AI; small board, chain-aware greedy/alpha-beta AI. Small–medium. |
| Proposal | **hashi** (bridges) | Logic puzzle; generator + uniqueness solver like the other puzzles. Medium. |

## Next build

Nothing queued. Pick one of the proposals above; write acceptance criteria here first, following the same template (folder with `index.html` + `game.js`, shared CSS/manpage/gamekit, hub card + counts in hub, manifest, README).

## Run / check

```bash
python -m http.server 8000          # then open http://localhost:8000
```

Syntax check (requires Node.js on PATH; no packages):

```powershell
Get-ChildItem -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

```bash
for f in *.js */*.js; do node --check "$f" || echo "FAIL $f"; done
```

Manual pass: open the hub, open each touched game, play to a win (and a loss where possible), at a narrow mobile width.
