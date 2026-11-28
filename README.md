# 🎮 Browser Games

[![Pages](https://img.shields.io/badge/play-wavde.github.io%2Fgames-f5c542?style=flat)](https://wavde.github.io/games/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8affc1?style=flat)](LICENSE)
[![No build](https://img.shields.io/badge/build-none-ffd166?style=flat)](#run-locally)
[![checks](https://github.com/wavde/games/actions/workflows/checks.yml/badge.svg)](https://github.com/wavde/games/actions/workflows/checks.yml)

Forty-three games built with vanilla **HTML, CSS, and JavaScript**: daily logic puzzles, strategy games against an AI or a friend, solitaire, and arcade classics. No frameworks, no build step, no runtime dependencies. Retro-terminal look, mobile first, and it works offline once visited.

**▶ Play now: [wavde.github.io/games](https://wavde.github.io/games/)**

More detail per game: [docs/games.md](docs/games.md). What's next: [ROADMAP.md](ROADMAP.md).

---

## The lineup

### Daily puzzles (24)

Every daily puzzle has a solver-checked unique answer and three levels. A daily seed (hash of the UTC date, level, and game) gives everyone the same board each day; **↻ new** rolls a random one. Solving a daily ticks its card on the hub and counts toward your streak.

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
| 📦 | **[sokoban](sokoban/)** | Push every box onto a goal. Generated rooms, always solvable, with a solver-computed par. Keys, swipe, or tap. |
| 🔐 | **[code-breaker](code-breaker/)** | Mastermind-style. Daily code, 3 difficulties, best per difficulty. |
| 💡 | **[lights-out](lights-out/)** | 5×5 toggle grid. Turn every light off. |
| 🧩 | **[slide-15](slide-15/)** | Sliding tiles, 3×3 / 4×4 / 5×5. Daily scramble, undo, best moves. |

### Versus (11)

Strategy games against an AI at three strengths. All but battleships can also be played by two people on one device or **online with a friend** (see below).

| | Game | Highlights |
|---|---|---|
| ♞ | **[chess](chess/)** | Full rules. Alpha-beta + piece-square-table engine, 3 levels, undo, flip, W–D–L record per level. |
| ⛀ | **[checkers](checkers/)** | English draughts: forced jumps, multi-jumps, kings. Local 2P or alpha-beta AI (depths 2/4/8), W–L–D record. |
| ⚫ | **[reversi](reversi/)** | Othello rules. Local 2P or alpha-beta AI (depths 1/3/5), W–L–D record. |
| 🔴 | **[connect-four](connect-four/)** | Local 2P or alpha-beta AI (depths 2/4/6). |
| ⚪ | **[gomoku](gomoku/)** | Five in a row on 15×15. Local 2P or look-ahead AI, W–L–D record. |
| ⬢ | **[hex](hex/)** | Join your two edges of a hexagon diamond; no draws. 7×7 / 9×9 / 11×11, Monte-Carlo AI or local 2P. |
| ⊞ | **[morris](morris/)** | Nine men's morris: place, slide, and fly; mills take pieces. Local 2P or alpha-beta AI, W–L–D record. |
| ◎ | **[mancala](mancala/)** | Kalah: sow seeds, chain extra turns, capture across the board. Local 2P or alpha-beta AI, W–L–D record. |
| ▢ | **[dots-and-boxes](dots-and-boxes/)** | 3×3 / 4×4 / 5×5 boxes. Local 2P or chain-aware AI, W–L–D record. |
| ⚓ | **[battleships](battleships/)** | Hunt the AI's hidden fleet before it sinks yours. Hunt/target, checkerboard, or heat-map AI; W–L record and fewest shots. |
| ❌⭕ | **[tic-tac-toe](tic-tac-toe/)** | Unbeatable AI via full minimax. Play X or O, W–L–D record. |

### Cards (3)

Solitaire with a daily deal, tap-or-drag moves, and unlimited undo.

| | Game | Highlights |
|---|---|---|
| 🂡 | **[klondike](klondike/)** | Solitaire, draw 1 or draw 3. Tap to auto-move or drag; unlimited undo; a daily deal. A solver checks every deal has a winning line. |
| 🃏 | **[freecell](freecell/)** | Every card face up, four free cells, the classic numbered deals #1–32000. Multi-card moves, tap or drag, unlimited undo, a daily deal. |
| 🕷 | **[spider](spider/)** | Two-deck solitaire: build king-to-ace runs of one suit to clear them. 1 / 2 / 4 suits, tap or drag, unlimited undo, a daily deal. |

### Arcade (5)

Quick games against the clock or the board.

| | Game | Highlights |
|---|---|---|
| 🔢 | **[2048](2048/)** | Slide & merge. Keys or swipe; best score and top tile kept. |
| 💣 | **[minesweeper](minesweeper/)** | 9×9 / 16×16 / 20×20. First-click safe, long-press to flag; best time and won/played per level. Starts on Easy on phones. |
| 🧠 | **[memory](memory/)** | 4×4 / 6×6 / 8×8. Timer, moves, and best time per size. |
| 🐍 | **[snake](snake/)** | The arcade classic on a canvas. Wrap-around easy, walls and speed-ups on medium/hard; keys, swipe, or on-screen pad; best score per speed. |
| 🧱 | **[breakout](breakout/)** | Paddle, ball, and a wall of bricks; endless levels that speed up. Mouse/touch, keys, or buttons; best score per speed. |

---

## Features

- **Daily boards and streaks**: the hub shows how many of today's dailies you've solved, your streak of days in a row, and your recently played games. A filter box (press `/`) finds a game by name or description.
- **Online two-player, no server**: pick *Online with a friend* in a versus game to get an invite link. Your friend opens it and sends back a reply code, and the two browsers connect directly over WebRTC (`net.js`). The host moves first. Networks that block direct connections can't connect.
- **Offline and installable**: a service worker (`sw.js`) caches the whole site (~1 MB) on the first visit; after that every game works with no connection, and the manifest makes it installable on phones and desktops.
- **Help pages**: every game has a `? man` button that opens a Unix-style manual (name, rules, controls, strategy). It opens by itself on a first visit; close it with Esc, `q`, or a tap outside.
- **Keyboard play**: every board is one Tab stop; arrow keys move, Enter/Space plays, and F/X flags or marks where a game has a second action.
- **Accessible**: every control has an accessible name and toggles expose `aria-pressed`; axe-core finds no violations on any page.
- **Look**: Fira Mono (self-hosted, no third-party requests), amber and mint on near-black, 1px hairlines. The hub follows the system light/dark setting or a footer toggle; game pages use a warm-dark theme with light "paper" puzzle boards.

## Run locally

```bash
git clone https://github.com/wavde/games.git
cd games
python -m http.server 8000    # then visit http://localhost:8000
```

Opening `index.html` straight from disk also works, except offline mode and online play, which need `http://localhost` or HTTPS.

## How it's built

```
games/
├── index.html      hub: sections, today's dailies and streak, recent games, filter
├── shared.css      design tokens, buttons, panels, light mode, @font-face
├── soft.css        the game pages' theme: board tokens, control bar, selects, online panel
├── gamekit.js      shared helpers (window.Gamekit), below
├── manpage.js/.css the help overlay
├── net.js          online two-player over WebRTC (window.Net)
├── sw.js           service worker: precaches the site, network-first, offline fallback
├── manifest.json   install manifest; favicon.svg, icons/ (PNG icons, link preview), fonts/
├── <game>/         one folder per game: index.html + game.js (norinori and lits add puzzles.js)
├── docs/games.md   per-game reference
└── .github/        checks/ (CI scripts), tools/ (offline generators, precache list), workflows/
```

`gamekit.js` holds what the games share:

- **`puzzlePage`**, the page shell for every daily puzzle. It owns the level chips, the daily seed, generating after the first paint (the board is marked `aria-busy` and the status reads *Generating…*), the clock and best time per level, New and Reset, and the win line. A game supplies `generate(level, seed)` and `start(puzzle)` and keeps its own rules, rendering, and undo.
- A seeded PRNG (mulberry32) and `dailySeed`, `storage(prefix)` for localStorage that never throws, `wireDifficultyChips`, `puzzleClock`, `gridKeys` (keyboard play), and the solved-today, streak, and recently-played records the hub reads.
- For the digit puzzles: `domainSolver` (bitmask propagation, probing, then search), `latinSquare`, and `numberPad`.

Every script is an IIFE in strict mode; the only globals are `Gamekit`, `Manpage`, and `Net`.

## Checks

CI (`.github/workflows/checks.yml`) runs all of these on every push and pull request. The tools install only in CI; the site itself has no dependencies.

| Check | What it proves |
|---|---|
| `node --check`, ESLint, html-validate | Syntax, lint rules (`no-var`, `eqeqeq`, `no-implicit-globals`, …), and valid HTML on all 44 pages. |
| `browser.mjs` | Every page loads without errors, opens its manual, and passes axe-core, fresh and with the manual open. |
| `logic.mjs` | Every generated puzzle (3 levels × 10 seeds) has exactly one answer and meets its grade; all 2,190 banked norinori/lits boards are unique; checkers matches perft 1–7; mancala matches an independent Kalah model; the AIs only play legal moves; card, snake, breakout, morris, and hex rules hold. |
| `play.mjs` | Every puzzle is solved through its real UI (clicks, keys, drags) on every level; klondike is won by replaying its solver's line, three FreeCell deals by a best-first solver, and a spider near-win by dragging; New and Reset give a fresh board. |
| `online.mjs` | Two browsers connect through the real invite and reply-code flow, play each of the ten online-capable versus games to the end with both boards identical after every move, start a new game, and handle a player leaving. |
| `offline.mjs` | `sw.js` lists every site file, and with the server stopped the hub and every game still load from the cache. |

Run them locally from the repo root:

```bash
npm install --prefix .github/checks --no-save eslint @eslint/js globals html-validate axe-core puppeteer-core
.github/checks/node_modules/.bin/eslint --config .github/checks/eslint.config.mjs .
.github/checks/node_modules/.bin/html-validate --config .github/checks/htmlvalidate.json index.html */index.html
node .github/checks/browser.mjs     # set CHROME_PATH if Chrome isn't in a standard location
node .github/checks/logic.mjs
node .github/checks/play.mjs        # or name games: node .github/checks/play.mjs tango zip
node .github/checks/online.mjs
node .github/checks/offline.mjs
```

After adding or removing a site file, run `node .github/tools/precache.mjs` to refresh the offline list in `sw.js` (CI fails until you do).

## License

[MIT](LICENSE) © Tejas Wavde
