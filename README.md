# 🎮 Browser Games

[![Pages](https://img.shields.io/badge/play-wavde.github.io%2Fgames-6ea8ff?style=flat)](https://wavde.github.io/games/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8affc1?style=flat)](LICENSE)
[![No build](https://img.shields.io/badge/build-none-ffd166?style=flat)](#run-locally)

Six classic games built with vanilla **HTML, CSS, and JavaScript**. No frameworks, no build step, no dependencies — open one file and play.

**▶ Play now: [wavde.github.io/games](https://wavde.github.io/games/)**

---

## Games

| | Game | Highlights |
|---|---|---|
| ❌⭕ | **[Tic-Tac-Toe](tic-tac-toe/)** | Unbeatable AI via minimax. Play as X or O. |
| 🐍 | **[Snake](snake/)** | Keyboard, WASD, and swipe controls. Speed ramps with score. |
| 🔢 | **[2048](2048/)** | Slide & merge. Local-storage best score. |
| 💣 | **[Minesweeper](minesweeper/)** | 3 difficulties. First-click always safe. Right-click or long-press to flag. |
| 🧠 | **[Memory Match](memory/)** | 4×4, 6×6, 8×8 boards. Timer and best time per size. |
| ♞ | **[Chess](chess/)** | Full rules (castling, en passant, promotion). Minimax + alpha-beta engine with piece-square tables. Three difficulty levels. |

## Highlights

- **Zero dependencies.** No npm, no bundler, no transpiler. ~60KB total.
- **Mobile-friendly.** Touch / swipe support on Snake, 2048, Minesweeper.
- **Persistent best scores** via `localStorage`.
- **Accessible.** High-contrast palette, keyboard-navigable, respects reduced-motion preferences.
- **Real AI on two games.** Tic-Tac-Toe uses exhaustive minimax (unbeatable). Chess uses minimax with alpha-beta pruning and piece-square-table evaluation.

## Run locally

```bash
git clone https://github.com/wavde/games.git
cd games
# open index.html in any modern browser
```

No server required. If you prefer one:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
games/
├── index.html          hub page linking to each game
├── shared.css          design tokens, buttons, panels
├── favicon.svg
├── tic-tac-toe/
│   ├── index.html
│   └── game.js
├── snake/
├── 2048/
├── minesweeper/
├── memory/
└── chess/
    ├── index.html
    └── game.js         ~500 lines; board, move gen, minimax, UI
```

Each game folder is fully self-contained: `index.html` + `game.js`. Styling inherits from `shared.css` plus a small per-game `<style>` block.

## Tech

- **Rendering:** HTML + CSS Grid. Snake is the only canvas game.
- **State:** plain JS modules, no framework.
- **AI:**
  - *Tic-Tac-Toe:* minimax over the full game tree. Unbeatable.
  - *Chess:* minimax with alpha-beta pruning, move ordering (MVV-LVA + promotions), and piece-square tables for positional evaluation. Depth 1–3 selectable.

## Contributing

Issues and PRs welcome. Good first tasks:

- Add new games (Connect Four, Wordle clone, Tetris, Flappy Bird)
- Improve chess engine (iterative deepening, quiescence search, opening book)
- Add a global high-score page
- Add a dark/light mode toggle

## License

[MIT](LICENSE) © Tejas Wavde
