# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles/simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Current inventory

- **14 games**, each a self-contained folder with `index.html` + `game.js`, linked from the hub (`index.html`).
  - Classics: tic-tac-toe, 2048, minesweeper, memory, chess, connect-four, lights-out, code-breaker, slide-15.
  - Logic puzzles: mini-sudoku, tango, queens, zip, patches.
- **Shared layer** (all 14 games load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`):
  - `gamekit.js` (`window.Gamekit`): mulberry32 PRNG, `dailySeed`, `storage(prefix)`, `wireDifficultyChips`, `fmtTime`, `onLongPress`, `shuffle`. Loaded by 11 games; not by tic-tac-toe, minesweeper, chess.
  - Daily-seed + easy/medium/hard chip pattern: lights-out, code-breaker, slide-15, mini-sudoku, tango, queens, zip, patches. connect-four uses chips for AI depth.
  - Help: a `<template id="man-<game>">` + `.man-trigger` button per game.
  - Game pages (`body.g-<name>`) always use soft.css's warm-dark palette; the dark/light toggle only affects the hub.
- **No build, no dependencies, no automated tests.**

## Proposed improvements (prioritized)

1. **Cheap syntax check** — run `node --check` over all JS before committing (see commands below). No tooling added.
2. **Hub freshness** — 9 cards carry a `new` badge; drop or rotate badges when the next game lands.
3. **README accuracy** — the structure tree says "(5 classics)" and marks lights-out/mini-sudoku as "new"; refresh alongside the next game.

## Proposed new games (distinct from the current set)

| Priority | Game | Fit | Size |
|---|---|---|---|
| ✅ | **code-breaker** (Mastermind-style) | Shipped — daily seed + chips + storage | Small |
| ✅ | **slide-15** (15-puzzle) | Shipped — 3×3/4×4/5×5, scramble by legal moves (always solvable) | Small |
| 1 | **nonogram** | Logic puzzle; needs line-solver for uniqueness, like other puzzles | Medium |
| 2 | **reversi** | Classic vs. AI; reuse the alpha-beta approach from connect-four | Medium |

## Shipped: `slide-15/`

- Easy 3×3, medium 4×4, hard 5×5 via `Gamekit.wireDifficultyChips`; daily scramble from `Gamekit.dailySeed("slide-15", diff)`.
- Scramble is a random walk of legal slides from solved (N²×20 steps, never ends solved), so it is always solvable.
- Tap any tile in the space's row/column to slide the whole line; arrow keys slide one tile. Moves count tiles slid.
- Tiles in their home cell are tinted; undo, reset, `↻ new`, per-difficulty best (fewest moves).
- Hub card 09 under Classics (puzzles renumbered 10–14); counts updated in hub, manifest, README.

## Shipped: `code-breaker/`

Guess a hidden color code; each guess gets exact/partial-match pegs.

**Acceptance criteria (met)**

- New folder `code-breaker/` with only `index.html` + `game.js`, following `lights-out/` as the template (same head links, topbar, chips, `↻ new`, man template, `defer` script order).
- Difficulties via `Gamekit.wireDifficultyChips`: easy 4 pegs/6 colors/10 guesses; medium 4/6/8; hard 5/8/10.
- Daily code from `Gamekit.dailySeed("code-breaker", diff)` + `Gamekit.mulberry32`; `↻ new` uses `Gamekit.randomSeed()`.
- Feedback is correct with duplicate colors (exact counted first, then min color counts over the non-exact pegs).
- Win/lose status; per-difficulty best (fewest guesses) via `Gamekit.storage("code-breaker:")`.
- Tap input with 44px palette/toolbar targets, keyboard `1`–`8` / Backspace / Enter, numbered pegs for color-blind play, `? man` overlay with NAME · RULES · CONTROLS · STRATEGY.
- Hub card 08 under Classics (puzzles renumbered 09–13); hub, manifest, and README counts updated.

**Next proposed build:** `nonogram/` — 5×5 / 10×10 picture-logic grid; generator keeps only boards a line-by-line solver can finish uniquely, matching the other logic puzzles' uniqueness guarantee.

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

Manual pass: open the hub, open each touched game, play to a win and a loss, at a narrow mobile width.
