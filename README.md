# 🎮 Browser Games

[![Pages](https://img.shields.io/badge/play-wavde.github.io%2Fgames-f5c542?style=flat)](https://wavde.github.io/games/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8affc1?style=flat)](LICENSE)
[![No build](https://img.shields.io/badge/build-none-ffd166?style=flat)](#run-locally)

Twenty classics and logic puzzles built with vanilla **HTML, CSS, and JavaScript**. No frameworks, no build step, no npm dependencies — open one file and play. Mobile-first retro-terminal aesthetic.

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

### Logic puzzles

Every logic puzzle ships with an in-browser generator + solver and three difficulty tiers. A **daily puzzle** seed (hash of the UTC date + difficulty + game) means everyone sees the same board each day; **↻ new** rolls a fresh one.

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

---

## Design system

- **Retro terminal**: Fira Mono, amber + mint on near-black, 1px hairline borders, ASCII banners, subtle scanline overlay.
- **Light mode** (hub): follows `prefers-color-scheme`, plus a footer toggle that cycles **dark → light → system**. Preference persists in `localStorage`. Game pages use `soft.css`'s warm-dark palette.
- **Manpage help**: every game has a `? man` button that opens a Unix-style manpage overlay (NAME · RULES · CONTROLS · STRATEGY). Auto-opens on first visit per game; quick to dismiss with ESC / `q` / tap-outside.
- **Accessibility**: every control has an accessible name, toggles expose `aria-pressed`, long help text is keyboard-scrollable; axe-core automated checks pass on every page.
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
├── gamekit.js          shared helpers (PRNG, daily seed, storage, chips, etc.)
├── manifest.json       PWA manifest (iOS/Android home screen)
├── favicon.svg
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
├── mini-sudoku/
├── tango/
├── queens/
├── zip/
├── patches/
├── nonogram/
├── hashi/
└── akari/
```

Each game folder is self-contained: `index.html` + `game.js`. Styling inherits from `shared.css`, `soft.css`, and `manpage.css`.

## Generators & difficulty

Every logic puzzle generates uniquely-solvable boards in the browser:

| Game | Easy | Medium | Hard |
|---|---|---|---|
| lights-out | 3 random taps | 6 taps | 10 taps |
| connect-four (AI) | depth 2 | depth 4 | depth 6 |
| reversi (AI) | depth 1 | depth 3 | depth 5 |
| dots-and-boxes (AI) | greedy + random | + safe lines, fewest-box sacrifice | + endgame search, chain analysis, double-dealing |
| gomoku (AI) | random among top 4 | best heuristic move | 4-ply alpha-beta, 8 candidates |
| mini-sudoku | 22 clues | 18 clues | 14 clues |
| tango | 16 givens, 10 edges | 10 givens, 8 edges | 6 givens, 7 edges |
| queens | 6×6 | 7×7 | 8×8 |
| zip | 5×5, 4 waypoints | 6×6, 5 wp, 3 walls | 7×7, 6 wp, 5 walls |
| patches | 5×5 partition | 6×6 partition | 7×7 partition |
| nonogram | 5×5 | 8×8 | 10×10 |
| hashi | 7×7, ~9 islands, counting rules | 9×9, ~15, look-ahead | 11×11, ~22, deeper look-ahead |
| akari | 7×7, direct rules | 9×9, look-ahead | 11×11, fewer clues, look-ahead |
| code-breaker | 4 pegs, 6 colors, 10 guesses | 4 / 6 / 8 | 5 / 8 / 10 |
| slide-15 | 3×3 | 4×4 | 5×5 |

Logic-puzzle generators check uniqueness against a solver before returning (nonogram requires a full line-by-line solve; hashi and akari are graded by how much look-ahead they need). zip is the exception: boards are built from a real path, so they are always solvable, and any valid path wins — the generator tries briefly for a unique board but doesn't require one. slide-15 scrambles by legal moves, so it is always solvable.

## Tech

- **Rendering**: HTML + CSS Grid. No `<canvas>`.
- **State**: plain JS, no framework.
- **AI**:
  - *tic-tac-toe*: full-tree minimax (unbeatable).
  - *chess*: alpha-beta + MVV-LVA move ordering + piece-square tables.
  - *connect-four*: alpha-beta with center-first column ordering.
  - *reversi*: negamax alpha-beta, corner-first ordering, positional weights + mobility.
  - *gomoku*: scores every 5-cell window for attack and defence; always takes a win or blocks an immediate five; hard adds 4-ply alpha-beta over the best 8 candidates.
  - *dots-and-boxes*: takes free boxes and avoids third sides; hard searches the last safe moves, values the chain/loop endgame exactly, and double-deals when keeping control pays.
- **PRNG**: mulberry32 seeded by FNV-1a hash of date+difficulty+game — deterministic dailies across devices.

## License

[MIT](LICENSE) © Tejas Wavde
