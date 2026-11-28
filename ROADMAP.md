# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles/simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Current inventory

- **31 games**, each a self-contained folder with `index.html` + `game.js`, linked from the hub (`index.html`).
  - Classics: tic-tac-toe, 2048, minesweeper, memory, chess, connect-four, lights-out, code-breaker, slide-15, reversi, dots-and-boxes, gomoku, checkers, mancala, battleships, sokoban, snake.
  - Logic puzzles: mini-sudoku, tango, queens, zip, patches, nonogram, hashi, akari, slitherlink, star-battle, kakuro, hitori, nurikabe, calcudoku.
- **Shared layer** (all 31 games load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`):
  - `gamekit.js` (`window.Gamekit`): mulberry32 PRNG, `dailySeed`, `storage(prefix)`, `wireDifficultyChips`, `fmtTime`, `onLongPress`, `shuffle`, `gridKeys` (keyboard play), `puzzleClock` (timer + best time for the 11 timed puzzles), `markDailySolved`/`dailySolved` (today's solved dailies, shown on the hub). Loaded by all 31 games and the hub.
  - Daily-seed + easy/medium/hard chip pattern: lights-out, code-breaker, slide-15, mini-sudoku, tango, queens, zip, patches, nonogram, hashi, akari, slitherlink, star-battle, kakuro, hitori, nurikabe, calcudoku, sokoban. connect-four, reversi, dots-and-boxes, gomoku, checkers, mancala, and battleships use chips for AI level.
  - Help: a `<template id="man-<game>">` + `.man-trigger` button per game.
  - Game pages (`body.g-<name>`) always use soft.css's warm-dark palette; the dark/light toggle only affects the hub.
- **No build, no runtime dependencies.** CI checks (below) install their tools only in CI.

## Proposed improvements

1. **Cheap syntax check** — run `node --check` over all JS before committing (see commands below). No tooling added; a portable Node works fine.
2. **Hub freshness** — keep the `new` badge on the three most recent games only (currently sokoban, calcudoku, snake).
3. **zip uniqueness** ✅ — every board is unique. A pruned path solver (degree, connectivity, colour-parity, and forced-move checks) lists alternative paths; the generator greedily adds whichever number or wall rules out the most, within per-tier caps. ~5 ms easy, ~20 ms medium, ~170 ms hard (worst ~0.6 s); 120/120 boards confirmed unique by an independent solver.

4. **Keyboard play** ✅ — every game is playable by keyboard: shared `Gamekit.gridKeys` gives each board one Tab stop, arrow-key movement (by on-screen position, so sparse boards like hashi work; dots-and-boxes walks its line lattice), Enter/Space to play, and F/X for flag/mark. Board buttons use `aria-disabled` instead of `disabled` so focus survives AI turns.
5. **CI checks** ✅ — `.github/workflows/checks.yml` runs `node --check`, ESLint, html-validate, a headless-Chrome pass (page errors, manpage auto-open, axe-core), and logic checks on every push and PR. Tools install only in CI; the site stays dependency-free.
6. **Logic checks in CI** ✅ — `.github/checks/logic.mjs` loads each game in headless Chrome with a test-only hook that exposes its internals, then checks (fixed seeds): every board of the 14 generated puzzles has exactly one solution, graded puzzles still meet their grade, sokoban par matches an independent forward push search, snake's rules hold (walls, wrap, growth, no reversal, tail-chasing, invariants over random play), checkers matches perft 1–7, mancala matches an independent Kalah model, and the checkers/mancala/battleships AIs only play legal moves. It caught that queens boards were almost never unique; queens now repairs regions until one answer remains (150/150 confirmed by CP-SAT).

## Code-quality audit (latest)

- **ESLint** (`recommended` + `eqeqeq`, `no-var`, `prefer-const`, `no-unused-vars`, `no-implicit-globals`, `no-use-before-define`): 0 errors, 0 warnings across all JS. Every script is an IIFE in strict mode; no globals leak besides `Gamekit` and `Manpage`.
- **html-validate** (`recommended`): 0 messages on all 32 pages (hub + 31 games).
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
| ✅ | **checkers** | 8×8 English draughts: compulsory captures, multi-jumps, crowning ends the move, 40-move no-progress draw; vs. AI or local 2P (board flips when you play white). Negamax alpha-beta at depth 2/4/8 with capture quiescence, iterative deepening, and an 0.8 s think budget (medium beat easy 16–0–4, hard beat medium 20–0–0). Two kings v one king (wins take up to 33 plies) is solved exactly by retrograde analysis on first use (~170 ms, 29,760 entries, verified against an independent recomputation); with it, hard converted 20/20 each of 2K v 1K, 3K v 2K, 3K v 1K, 2K v 1M, and 2K+1M v 1K from random starts. Move generator matches published perft to depth 9 and an independent generator on 20k random positions. W–L–D per level. |
| ✅ | **slitherlink** | 6×6/7×7/8×8 loop puzzle. Random hole-free region → its outline is the loop; starts fully clued and blanks numbers while the grade holds (easy = direct rules, medium = single-edge look-ahead, hard = unique by search, never direct-rules-solvable). 120/120 sampled boards confirmed unique by an independent OR-Tools CP-SAT model; hard generates in ~150 ms median. Tap cycles line/×; over-full numbers and branching lines turn red. |
| ✅ | **mancala** | Kalah(6,4): sowing skips the opponent's store, extra turn on landing in your store, captures from your own empty pit, remaining seeds banked when a side empties. vs. AI or local 2P; negamax alpha-beta where an extra turn is the same player moving again, extra-turn/capture moves ordered first; easy = depth 2 with near-best randomness, medium = depth 6, hard = iterative deepening under 0.8 s (medium beat easy 27–3, hard beat medium 19–0–1). Rules match an independent implementation over 5,000 random games (219k moves). Sowing animates seed by seed (skipped under reduced motion); undo to your turn; W–L–D per level. |
| ✅ | **battleships** | 10×10, classic fleet (5/4/3/3/2), straight non-overlapping ships that may touch; sunk ships revealed. vs. AI: easy = random hunt + neighbours of hits, medium = checkerboard hunt sized to the smallest unsunk ship + follows lines of hits, hard = probability heat-map over every consistent placement. Mean shots to sink a random fleet 63 / 51 / 45 (400 games each); medium beat easy 296–104 and hard beat medium 294–106 head to head. Fleet shuffle until your first shot; W–L and fewest shots to win per level. |
| ✅ | **star-battle** | Two stars per row/column/region, no touching; 8×8/9×9/10×10. Random valid star layout → nearby stars paired and joined into regions → border cells shifted between regions until a solver finds no rival solution. Graded with the standard human techniques (unit counting, per-unit placement enumeration, region-confinement across consecutive rows/columns): easy = solvable by those alone, medium/hard = need single-cell look-ahead. 120/120 sampled boards confirmed unique (with the intended answer) by an independent OR-Tools CP-SAT model; hard generates in ~150 ms median (≤0.7 s). |
| ✅ | **kakuro** | Cross sums on 6×6/7×7/8×8 (plus the clue row/column). Symmetric layout repaired so no run is 1 long or longer than the level's cap (4/5/5); random repeat-free fill; then, while a solver finds a rival answer, one differing cell gets the digit whose two run sums allow the fewest digit sets. Solver uses per-run digit-set filtering and required-digit placement; easy = solvable by that alone, medium/hard = need single-digit look-ahead. 90/90 sampled boards confirmed unique (with the intended answer) by an independent OR-Tools CP-SAT model; generation ~7/25/32 ms median, ≤0.5 s. Number pad + typing, pencil notes, repeated digits and overshooting clues in red. |
| ✅ | **hitori** | 6×6/8×8/10×10. Random shading (no shaded neighbours, unshaded cells connected) over a random Latin square; each shaded cell copies a number from its row or column, so the unshaded numbers are distinct by construction. Solver: shaded → neighbours unshaded, unshaded → same-number cells in its lines shaded, connectivity (cells whose shading would split the unshaded area stay unshaded); lone numbers are kept unshaded and uniqueness then checks none of them could be shaded instead. Graded with the opening patterns (sandwich X Y X, adjacent pair) + direct rules for easy, single-cell look-ahead for medium/hard. 120/120 sampled boards confirmed unique by an independent CP-SAT model with lazy connectivity cuts; generation ≤30 ms. |
| ✅ | **nurikabe** | 6×6/8×8/10×10. Starts all sea and, while a 2×2 pool remains, turns one of its cells to land (joining the one island it touches — preferred, so islands aren't all tiny — or starting a new one, islands kept apart and capped at 5/7/9 cells, sea kept connected); one random cell per island gets its size. Solver: finished islands walled with sea, cells that would merge numbered islands or overfill one are sea, 2×2 pools, reach (cells no unfinished island can still reach are sea; an island with one way out takes it), sea connectivity with cut cells. Easy = those rules alone, medium/hard = single-cell look-ahead. 120/120 sampled boards confirmed unique by an independent CP-SAT model (one-hot island membership, lazy island/sea connectivity cuts); generation ~2/12/110 ms median, hard ≤1.4 s. |
| ✅ | **sokoban** | Generated rooms (7×7/8×8/9×9 with a wall border and scattered inner walls, floor connected; 2/3/4 boxes). Breadth-first search *backwards* from the solved position (pulling boxes, numeric state keys, capped at 20k/40k/60k states) gives every reachable start with its exact minimum push count; the deepest start of the best of several rooms is used, and its depth is shown as par. Par ~10/18/27 pushes; every sampled level's par matched an independent forward push search; generation ~1/20/400 ms median, ≤0.75 s. Arrow keys/WASD, swipe, tap to push or walk; undo per step or walk; time + best time per level. |
| ✅ | **calcudoku** | 4×4/5×5/6×6 Latin square in random cages (up to 3/3/4 cells, surplus single cells folded into neighbours); each cage gets ÷/−/+/× (÷ only when exact, 3+ cells + or ×). Solver filters each cage to the digit tuples that still fit, plus row/column singles and hidden singles; boards kept only when a search finds exactly one answer. Easy = those rules alone, medium/hard = single-digit look-ahead. 90/90 sampled boards confirmed unique by an independent CP-SAT model; generation ≤10 ms. |
| ✅ | **snake** | First real-time game. Canvas (sized for device pixel ratio), fixed-step loop on requestAnimationFrame. Easy 15×15 wrap-around at 170 ms/step; medium 17×17 walls, 125 ms, −1 ms per bite; hard 19×19 walls, 105 ms, −2 ms per bite (floor 60 ms). Rules are DOM-free (`createGame`/`step`): moving into the tail's cell is legal when not growing, reversals are ignored, up to two turns are queued per tick. Arrows/WASD, swipe, tap to pause, on-screen pad; auto-pause on tab switch; best score per speed. |

## Next build

Nothing queued; every proposal so far is built. Add new proposals here with acceptance criteria first, following the same template: folder with `index.html` + `game.js`, shared CSS/manpage/gamekit, keyboard play, hub card + counts in hub, manifest, README.

## Run / check

CI (`.github/workflows/checks.yml`) runs everything below automatically. To run it locally from the repo root:

```bash
npm install --prefix .github/checks --no-save eslint @eslint/js globals html-validate axe-core puppeteer-core
.github/checks/node_modules/.bin/eslint --config .github/checks/eslint.config.mjs .
.github/checks/node_modules/.bin/html-validate --config .github/checks/htmlvalidate.json index.html */index.html
node .github/checks/browser.mjs   # set CHROME_PATH if Chrome isn't in a standard location
node .github/checks/logic.mjs     # puzzle uniqueness/grades, checkers perft, mancala vs. reference, AI legality
```

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
