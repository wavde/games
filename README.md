# 🎮 Browser Games

[![Pages](https://img.shields.io/badge/play-wavde.github.io%2Fgames-f5c542?style=flat)](https://wavde.github.io/games/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8affc1?style=flat)](LICENSE)
[![No build](https://img.shields.io/badge/build-none-ffd166?style=flat)](#run-locally)
[![checks](https://github.com/wavde/games/actions/workflows/checks.yml/badge.svg)](https://github.com/wavde/games/actions/workflows/checks.yml)

Forty-three classics and logic puzzles built with vanilla **HTML, CSS, and JavaScript**. No frameworks, no build step, no npm dependencies — open one file and play. Mobile-first retro-terminal aesthetic.

**▶ Play now: [wavde.github.io/games](https://wavde.github.io/games/)**

What's next: see [ROADMAP.md](ROADMAP.md).

---

## The lineup

### Classics

| | Game | Highlights |
|---|---|---|
| ❌⭕ | **[tic-tac-toe](tic-tac-toe/)** | Unbeatable AI via full minimax. |
| 🔢 | **[2048](2048/)** | Slide & merge. Per-session best score. |
| 💣 | **[minesweeper](minesweeper/)** | 3 sizes. First-click safe. Long-press to flag. |
| 🧠 | **[memory](memory/)** | 4×4 / 6×6 / 8×8. Timer and per-size best. |
| ♞ | **[chess](chess/)** | Full rules. Alpha-beta + piece-square-table engine, 3 levels. |
| 🔴 | **[connect-four](connect-four/)** | Local 2P or alpha-beta AI (depths 2/4/6). |
| 💡 | **[lights-out](lights-out/)** | 5×5 toggle grid. Turn every light off. |
| 🔐 | **[code-breaker](code-breaker/)** | Mastermind-style. Daily code, 3 difficulties, best per difficulty. |
| 🧩 | **[slide-15](slide-15/)** | Sliding tiles, 3×3 / 4×4 / 5×5. Daily scramble, undo, best moves. |
| ⚫ | **[reversi](reversi/)** | Othello rules. Local 2P or alpha-beta AI (depths 1/3/5), W–L–D record. |
| ▢ | **[dots-and-boxes](dots-and-boxes/)** | 3×3 / 4×4 / 5×5 boxes. Local 2P or chain-aware AI, W–L–D record. |
| ⚪ | **[gomoku](gomoku/)** | Five in a row on 15×15. Local 2P or look-ahead AI, W–L–D record. |
| ⛀ | **[checkers](checkers/)** | English draughts: forced jumps, multi-jumps, kings. Local 2P or alpha-beta AI (depths 2/4/8), W–L–D record. |
| ◎ | **[mancala](mancala/)** | Kalah: sow seeds, chain extra turns, capture across the board. Local 2P or alpha-beta AI, W–L–D record. |
| ⚓ | **[battleships](battleships/)** | Hunt the AI's hidden fleet before it sinks yours. Hunt/target, checkerboard, or heat-map AI; W–L record and fewest shots. |
| 📦 | **[sokoban](sokoban/)** | Push every box onto a goal. Generated rooms, always solvable, with a solver-computed par. Keys, swipe, or tap. |
| 🐍 | **[snake](snake/)** | The arcade classic on a canvas. Wrap-around easy, walls and speed-ups on medium/hard; keys, swipe, or on-screen pad; best score per speed. |
| 🧱 | **[breakout](breakout/)** | Paddle, ball, and a wall of bricks; endless levels that speed up. Mouse/touch, keys, or buttons; best score per speed. |
| 🂡 | **[klondike](klondike/)** | Solitaire, draw 1 or draw 3. Tap to auto-move or drag; unlimited undo; a daily deal. A solver checks every deal has a winning line. |
| 🃏 | **[freecell](freecell/)** | Every card face up, four free cells, the classic numbered deals #1–32000. Multi-card moves, tap or drag, unlimited undo, a daily deal. |
| ⊞ | **[morris](morris/)** | Nine men's morris: place, slide, and fly; mills take pieces. Local 2P or alpha-beta AI, W–L–D record. |
| ⬢ | **[hex](hex/)** | Join your two edges of a hexagon diamond; no draws. 7×7 / 9×9 / 11×11, Monte-Carlo AI or local 2P. |
| 🕷 | **[spider](spider/)** | Two-deck solitaire: build king-to-ace runs of one suit to clear them. 1 / 2 / 4 suits, tap or drag, unlimited undo, a daily deal. |

### Logic puzzles

Every logic puzzle has a solver-checked unique answer and three difficulty tiers; all but norinori and lits generate their boards in the browser (those two draw from a bank built offline). A **daily puzzle** seed (hash of the UTC date + difficulty + game) means everyone sees the same board each day; **↻ new** rolls a fresh one. Solving a daily ticks its card on the hub (*✓ today's easy, hard*) until the UTC day ends.

| | Game | Highlights |
|---|---|---|
| ﹟ | **[mini-sudoku](mini-sudoku/)** | 6×6 with 2×3 boxes. Pencil marks, keyboard support. |
| ☀ | **[tango](tango/)** | Suns & moons. No 3-in-a-row, balanced counts, `=` / `×` edge constraints. |
| ♛ | **[queens](queens/)** | Non-attacking queens across colored regions. |
| 🧵 | **[zip](zip/)** | Draw one Hamiltonian path through numbered waypoints in order. |
| ▦ | **[patches](patches/)** | Partition the grid into rectangles — clue number = rectangle area. |
| ▩ | **[nonogram](nonogram/)** | Paint the picture from run-length clues. Drag to fill or mark a line. |
| ≡ | **[hashi](hashi/)** | Bridges: link numbered islands with up to two bridges each way, no crossings, one network. |
| ✺ | **[akari](akari/)** | Light Up: place bulbs so every cell is lit, no bulb sees another, numbered walls get their count. |
| ➰ | **[slitherlink](slitherlink/)** | Draw one closed loop through the dots; each number counts how many of its sides the loop uses. |
| ★ | **[star-battle](star-battle/)** | Two stars in every row, column, and region; stars never touch, not even diagonally. |
| ∑ | **[kakuro](kakuro/)** | Cross sums: fill each run with distinct digits 1–9 adding up to its clue. Number pad, pencil notes. |
| ▦ | **[hitori](hitori/)** | Shade cells so no number repeats in a row or column; shaded cells never touch and the rest stay connected. |
| 🏝 | **[nurikabe](nurikabe/)** | Shade the sea so each island matches its number, the sea stays connected, and no 2×2 pool forms. |
| ➗ | **[calcudoku](calcudoku/)** | Latin square with arithmetic cages (+ − × ÷). Number pad, pencil notes. |
| 🏙 | **[skyscrapers](skyscrapers/)** | Latin square of tower heights; edge clues count how many towers each side can see. |
| ＞ | **[futoshiki](futoshiki/)** | Latin square with greater-than signs between neighbours. Number pad, pencil notes. |
| ⛺ | **[tents](tents/)** | One tent beside each tree; tents never touch; row and column counts. |
| ⧉ | **[jigsaw-sudoku](jigsaw-sudoku/)** | Sudoku with irregular regions, 6×6 / 8×8 / 9×9. Number pad, pencil notes. |
| ▚ | **[norinori](norinori/)** | Shade two cells per region so the shading forms dominoes that never touch side-on. |
| ⧈ | **[lits](lits/)** | Shade an L, I, T, or S in every region: all connected, no 2×2, matching shapes never touch. |

---

## Design system

- **Retro terminal**: Fira Mono (self-hosted in `fonts/`, no third-party requests), amber + mint on near-black, 1px hairline borders, ASCII banners, subtle scanline overlay.
- **Light mode** (hub): follows `prefers-color-scheme`, plus a footer toggle that cycles **dark → light → system**. Preference persists in `localStorage`. Game pages use `soft.css`'s warm-dark palette.
- **Manpage help**: every game has a `? man` button that opens a Unix-style manpage overlay (NAME · RULES · CONTROLS · STRATEGY). Auto-opens on first visit per game; quick to dismiss with ESC / `q` / tap-outside.
- **Accessibility**: every control has an accessible name, toggles expose `aria-pressed`, long help text is keyboard-scrollable; axe-core automated checks pass on every page.
- **Keyboard play**: every board is one Tab stop; arrow keys move, Enter/Space plays, and F/X flags or marks where a game has a second action (shared `Gamekit.gridKeys`).
- **Mobile-first**: 44px minimum tap targets, `dvh` viewport units, `touch-action: manipulation`, no hover-only UI.

## Run locally

```bash
git clone https://github.com/wavde/games.git
cd games
# open index.html in any modern browser
```

Or serve it:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
games/
├── index.html          hub page
├── shared.css          design tokens, buttons, panels, light mode
├── manpage.css         shared help-overlay styles
├── manpage.js          shared help-overlay controller
├── gamekit.js          shared helpers (PRNG, daily seed + solved-today record, storage, chips, puzzle clock, keyboard grid, digit-puzzle solver)
├── manifest.json       PWA manifest (iOS/Android home screen)
├── favicon.svg         app mark; icons/ holds the PNG install icons and the link-preview image
├── fonts/              Fira Mono subsets (SIL OFL)
├── tic-tac-toe/        each game: index.html + game.js
├── 2048/
├── minesweeper/
├── memory/
├── chess/
├── connect-four/
├── lights-out/
├── code-breaker/
├── slide-15/
├── reversi/
├── dots-and-boxes/
├── gomoku/
├── checkers/
├── mancala/
├── battleships/
├── sokoban/
├── snake/
├── breakout/
├── klondike/
├── freecell/
├── morris/
├── hex/
├── spider/
├── mini-sudoku/
├── tango/
├── queens/
├── zip/
├── patches/
├── nonogram/
├── hashi/
├── akari/
├── slitherlink/
├── star-battle/
├── kakuro/
├── hitori/
├── nurikabe/
├── calcudoku/
├── skyscrapers/
├── futoshiki/
├── tents/
├── jigsaw-sudoku/
├── norinori/
└── lits/
```

Each game folder is self-contained: `index.html` + `game.js`. Styling inherits from `shared.css`, `soft.css`, and `manpage.css`.

## Generators & difficulty

Logic puzzles generate uniquely-solvable boards in the browser (norinori and lits use an offline-built bank):

| Game | Easy | Medium | Hard |
|---|---|---|---|
| lights-out | 3 random taps | 6 taps | 10 taps |
| connect-four (AI) | depth 2 | depth 4 | depth 6 |
| reversi (AI) | depth 1 | depth 3 | depth 5 |
| dots-and-boxes (AI) | greedy + random | + safe lines, fewest-box sacrifice | + endgame search, chain analysis, double-dealing |
| gomoku (AI) | random among top 4 | best heuristic move | 4-ply alpha-beta, 8 candidates |
| checkers (AI) | depth 2, random among near-best | depth 4 | depth 8 |
| morris (AI) | 2 plies, random among near-best | 4 plies | deepest in 0.8 s |
| hex (AI) | 150 random fills, top 5 | 2,500 fills | fills for 1.2 s |
| mancala (AI) | depth 2, random among near-best | depth 6 | deepest in 0.8 s |
| battleships (AI) | random hunt, then neighbours of hits | checkerboard hunt, follows lines of hits | probability heat-map over every placement |
| mini-sudoku | 22 clues | 18 clues | 14 clues |
| tango | 16 givens, 10 edges | 10 givens, 8 edges | 6 givens, 7 edges |
| queens | 6×6 | 7×7 | 8×8 |
| zip | 5×5, ~6 numbers | 6×6, ~8 numbers, ~2 walls | 7×7, ~11 numbers, ~3–4 walls |
| patches | 5×5 partition | 6×6 partition | 7×7 partition |
| nonogram | 5×5 | 8×8 | 10×10 |
| hashi | 7×7, ~9 islands, counting rules | 9×9, ~15, look-ahead | 11×11, ~22, deeper look-ahead |
| akari | 7×7, direct rules | 9×9, look-ahead | 11×11, fewer clues, look-ahead |
| slitherlink | 6×6, direct rules | 7×7, look-ahead | 8×8, fewer clues, deeper look-ahead |
| star-battle | 8×8, one unit at a time | 9×9, look-ahead | 10×10, look-ahead |
| kakuro | 6×6, runs ≤ 4, sums alone | 7×7, runs ≤ 5, look-ahead | 8×8, runs ≤ 5, look-ahead |
| hitori | 6×6, opening patterns + direct rules | 8×8, look-ahead | 10×10, look-ahead |
| nurikabe | 6×6, direct rules | 8×8, look-ahead | 10×10, look-ahead |
| calcudoku | 4×4, cages + lines | 5×5, look-ahead | 6×6, cages up to 4, look-ahead |
| skyscrapers | 4×4, a line at a time | 5×5, look-ahead | 6×6, fewest clues that stay unique |
| futoshiki | 5×5, direct deduction | 6×6, look-ahead | 7×7, fewest clues that stay unique |
| tents | 6×6, direct rules | 8×8, look-ahead | 10×10, never direct-rules-only |
| jigsaw-sudoku | 6×6, singles | 8×8, look-ahead | 9×9, fewest givens that stay unique |
| norinori | 6×6, direct rules | 7×7, look-ahead | 8×8, never direct-rules-only |
| lits | 6×6, direct rules | 8×8, look-ahead | 9×9, never direct-rules-only |
| sokoban | 7×7 room, 2 boxes (par ~10) | 8×8, 3 boxes (par ~18) | 9×9, 4 boxes (par ~27) |
| code-breaker | 4 pegs, 6 colors, 10 guesses | 4 / 6 / 8 | 5 / 8 / 10 |
| slide-15 | 3×3 | 4×4 | 5×5 |

Logic-puzzle generators check uniqueness against a solver before returning (nonogram requires a full line-by-line solve; hashi, akari, slitherlink, star-battle, kakuro, hitori, nurikabe, calcudoku, skyscrapers, futoshiki, tents, jigsaw-sudoku, norinori, and lits are graded by how much look-ahead they need). zip adds numbers and walls until every other path is ruled out. norinori and lits boards take seconds to make unique, so they come from a bank of 150 per level built offline by `.github/tools/` and re-checked in CI. slide-15 scrambles by legal moves, so it is always solvable; sokoban rooms are searched backwards from the solved position, so they are always solvable and the start chosen is the one needing the most pushes.

## Tech

- **Rendering**: HTML + CSS Grid; snake and breakout draw on `<canvas>`.
- **State**: plain JS, no framework.
- **AI**:
  - *tic-tac-toe*: full-tree minimax (unbeatable).
  - *chess*: alpha-beta + MVV-LVA move ordering + piece-square tables.
  - *connect-four*: alpha-beta with center-first column ordering.
  - *reversi*: negamax alpha-beta, corner-first ordering, positional weights + mobility.
  - *gomoku*: scores every 5-cell window for attack and defence; always takes a win or blocks an immediate five; hard adds 4-ply alpha-beta over the best 8 candidates.
  - *checkers*: negamax alpha-beta that always follows capture sequences to the end, with iterative deepening under a 0.8 s budget; material, advancement, back-row and centre terms, trades down when ahead, and drives kings at the enemy in the endgame. Two kings v one king is solved exactly (built on first use), so won king endings are converted. Rules verified against published perft counts to depth 9.
  - *mancala*: negamax alpha-beta where an extra turn is the same player moving again; extra-turn and capture moves searched first; store and on-side seed difference; hard deepens until its 0.8 s budget runs out. Rules checked against an independent Kalah implementation over 5,000 random games.
  - *battleships*: easy hunts at random and tries the squares around a hit; medium hunts on a checkerboard sized to the smallest unsunk ship and follows lines of hits; hard sums every placement of every unsunk ship consistent with the shots so far (placements through open hits weighted heavily) and fires at the hottest square. Sinking a random fleet takes ~63 / 51 / 45 shots on average.
  - *morris*: negamax alpha-beta with a transposition table, mill-closing moves searched past the horizon, and even-depth iterative deepening; material, open twos, and mobility.
  - *hex*: Monte-Carlo with all-moves-as-first scoring — fills the rest of the board at random and favours cells it owned in the fills it won; always takes a win and blocks an immediate loss.
  - *dots-and-boxes*: takes free boxes and avoids third sides; hard searches the last safe moves, values the chain/loop endgame exactly, and double-deals when keeping control pays.
- **Klondike deals**: before a deal is used, a depth-first solver that can see the face-down cards must find a win (safe foundation plays automatic, moves pruned to ones that turn a card, empty a column, or free a card for its foundation, seen positions skipped). Unproven deals are skipped; about 60% of draw-1 and 50% of draw-3 deals pass within the budget.
- **FreeCell deals**: Microsoft's LCG shuffle, so deal numbers match the classic Windows set (checked against the published layouts of deals #1 and #617); #11982, the one unwinnable deal, is skipped.
- **PRNG**: mulberry32 seeded by FNV-1a hash of date+difficulty+game — deterministic dailies across devices.

## License

[MIT](LICENSE) © Tejas Wavde
