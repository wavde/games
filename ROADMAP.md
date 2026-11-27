# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles/simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Current inventory

- **15 games**, each a self-contained folder with `index.html` + `game.js`, linked from the hub (`index.html`).
  - Classics: tic-tac-toe, 2048, minesweeper, memory, chess, connect-four, lights-out, code-breaker, slide-15.
  - Logic puzzles: mini-sudoku, tango, queens, zip, patches, nonogram.
- **Shared layer** (all 15 games load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`):
  - `gamekit.js` (`window.Gamekit`): mulberry32 PRNG, `dailySeed`, `storage(prefix)`, `wireDifficultyChips`, `fmtTime`, `onLongPress`, `shuffle`. Loaded by 12 games; not by tic-tac-toe, minesweeper, chess.
  - Daily-seed + easy/medium/hard chip pattern: lights-out, code-breaker, slide-15, mini-sudoku, tango, queens, zip, patches, nonogram. connect-four uses chips for AI depth.
  - Help: a `<template id="man-<game>">` + `.man-trigger` button per game.
  - Game pages (`body.g-<name>`) always use soft.css's warm-dark palette; the dark/light toggle only affects the hub.
- **No build, no dependencies, no automated tests.**

## Proposed improvements

1. **Cheap syntax check** — run `node --check` over all JS before committing (see commands below). No tooling added.
2. **Hub freshness** — keep the `new` badge on the three most recent games only (currently code-breaker, slide-15, nonogram).

## Games

| Status | Game | Notes |
|---|---|---|
| ✅ | **code-breaker** | Mastermind-style; 4/6/10, 4/6/8, 5/8/10 (pegs/colors/guesses); duplicate-safe scoring; best = fewest guesses. |
| ✅ | **slide-15** | 3×3/4×4/5×5; scramble is a random walk of legal slides (always solvable); line slides, arrows, undo; best = fewest moves. |
| ✅ | **nonogram** | 5×5/8×8/10×10; generator keeps only boards a line-by-line solver fully determines (unique, no guessing); fill/mark tools, straight-line drag, right-click mark; best time. |
| Next | **reversi** | Classic vs. AI; reuse connect-four's alpha-beta approach. |

## Next proposed build: `reversi/`

**Acceptance criteria**

- New folder `reversi/` with only `index.html` + `game.js`, following the existing game template (head links, topbar, chips, man template, `defer` scripts); no new dependencies.
- 8×8 board, standard opening, legal-move hints, flips in all eight directions, automatic pass when a side has no move, game over when neither side can move; disc counts shown.
- Local two-player or vs. AI; AI depth via `Gamekit.wireDifficultyChips` (easy/medium/hard), alpha-beta with a corner/edge-weighted evaluation, responsive (<1s per move on hard).
- Per-difficulty record of wins vs. AI via `Gamekit.storage("reversi:")`.
- Hub card 10 under Classics (puzzles renumber 11–16); counts updated in hub, manifest, README.

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
