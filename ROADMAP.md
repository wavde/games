# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles/simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Current inventory

- **20 games**, each a self-contained folder with `index.html` + `game.js`, linked from the hub (`index.html`).
  - Classics: tic-tac-toe, 2048, minesweeper, memory, chess, connect-four, lights-out, code-breaker, slide-15, reversi, dots-and-boxes, gomoku.
  - Logic puzzles: mini-sudoku, tango, queens, zip, patches, nonogram, hashi, akari.
- **Shared layer** (all 20 games load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`):
  - `gamekit.js` (`window.Gamekit`): mulberry32 PRNG, `dailySeed`, `storage(prefix)`, `wireDifficultyChips`, `fmtTime`, `onLongPress`, `shuffle`. Loaded by 17 games; not by tic-tac-toe, minesweeper, chess.
  - Daily-seed + easy/medium/hard chip pattern: lights-out, code-breaker, slide-15, mini-sudoku, tango, queens, zip, patches, nonogram, hashi, akari. connect-four, reversi, dots-and-boxes, and gomoku use chips for AI level.
  - Help: a `<template id="man-<game>">` + `.man-trigger` button per game.
  - Game pages (`body.g-<name>`) always use soft.css's warm-dark palette; the dark/light toggle only affects the hub.
- **No build, no dependencies, no automated tests.**

## Proposed improvements

1. **Cheap syntax check** — run `node --check` over all JS before committing (see commands below). No tooling added; a portable Node works fine.
2. **Hub freshness** — keep the `new` badge on the three most recent games only (currently hashi, akari, gomoku).
3. **zip uniqueness** (proposal) — boards are always solvable but almost never unique with the current waypoint/wall counts; uniqueness would need more waypoints or walls per tier plus a stronger solver. Generation is now bounded (≤ ~0.4 s on hard) after fixing an odd-board hang.

4. **Keyboard play** — most boards are pointer/touch only (mini-sudoku, code-breaker, slide-15, 2048 have keys). Roving-tabindex arrow-key navigation per board would close the biggest remaining accessibility gap.
5. **CI checks** (proposal) — a GitHub Actions workflow that installs ESLint, html-validate, and axe-core in CI only (repo stays dependency-free) and runs the audit below on every push.

## Code-quality audit (latest)

- **ESLint** (`recommended` + `eqeqeq`, `no-var`, `prefer-const`, `no-unused-vars`, `no-implicit-globals`, `no-use-before-define`): 0 errors, 0 warnings across all JS. Every script is an IIFE in strict mode; no globals leak besides `Gamekit` and `Manpage`.
- **html-validate** (`recommended`): 0 messages on all 21 pages.
- **axe-core** (WCAG 2.0/2.1 A+AA + best practices): 0 violations on every page freshly loaded, after random play, with the manpage open, and on the hub in light mode.
- No `console`/`debugger`/TODO leftovers; `innerHTML` only ever receives fixed strings and numbers (no user input).

## Games

| Status | Game | Notes |
|---|---|---|
| ✅ | **code-breaker** | Mastermind-style; 4/6/10, 4/6/8, 5/8/10 (pegs/colors/guesses); duplicate-safe scoring; best = fewest guesses. |
| ✅ | **slide-15** | 3×3/4×4/5×5; scramble is a random walk of legal slides (always solvable); line slides, arrows, undo; best = fewest moves. |
| ✅ | **nonogram** | 5×5/8×8/10×10; generator keeps only boards a line-by-line solver fully determines (unique, no guessing); fill/mark tools, straight-line drag, right-click mark; best time. |
| ✅ | **reversi** | Othello rules incl. passes; vs. AI (negamax alpha-beta, depth 1/3/5, corner-first ordering, positional + mobility eval) or local 2P; undo to your turn; W–L–D record per level (finished AI games can't be undone). |
| ✅ | **dots-and-boxes** | 3×3/4×4/5×5 boxes; vs. AI or local 2P. Easy: greedy + random; medium: never opens a box while a safe line exists, sacrifices fewest boxes; hard: + bounded search over the last ≤12 safe lines and exact chain/loop endgame values (opens the cheapest component, double-deals when control pays) — beat medium 19–10–1 on 4×4 and 10–6 on 5×5 in headless AI-vs-AI runs. W–L–D per level and size. |
| ✅ | **hashi** (bridges) | 7×7/9×9/11×11; grows a connected island network, keeps it only if unique. Graded: easy = counting rules alone, medium = needs look-ahead deduction, hard = larger and not solvable by counting alone. Tap-tap, drag, or tap the gap; crossings blocked. |
| ✅ | **akari** (light up) | 7×7/9×9/11×11, symmetric walls; starts fully clued and hides numbers while the grade holds. Easy = direct rules alone, medium/hard = need look-ahead. Tap cycles bulb/dot; clashes and satisfied clues shown. |
| ✅ | **gomoku** | 15×15 freestyle five-in-a-row; vs. AI or local 2P. Window-count heuristic (attack + defence), always wins/blocks fives; hard = 4-ply alpha-beta over 8 candidates (beat medium 5–1–2; ≤110 ms/move). W–L–D per level. |
| Proposal | **checkers** | Classic vs. AI (8×8 English draughts, forced captures, kings); alpha-beta AI. Medium. |
| Proposal | **slitherlink** | Logic puzzle: draw one loop around numbered cells. Generator + uniqueness solver. Medium–large. |

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
