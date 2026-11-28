# Roadmap

Proposals for growing the collection. Nothing here is committed scope until picked. Exploratory non-game puzzles and simulations belong in the separate curiosity-lab repo; this repo stays a games collection.

## Recently done

The site audit's plan, end to end:

- **Foundations**: self-hosted Fira Mono, PNG and maskable icons, link-preview tags on every page, per-game CSS moved out of `soft.css`.
- **Design system**: board tokens and one control bar, styled selects, Easy / Medium / Hard everywhere, paper boards for the logic puzzles.
- **Puzzle shell**: `Gamekit.puzzlePage` runs all 24 daily puzzles (chips, daily seed, paint-first generation, clock, New/Reset, win line).
- **Play-through tests**: every puzzle solved through its UI on every level, card games won by drag (`play.mjs`).
- **Hub v2**: sections, today's dailies and streak, recently played, filter, two-column phone layout.
- **Original five**: 2048, chess, memory, minesweeper, and tic-tac-toe brought up to the standard controls, levels, and stored records.
- **Offline**: service worker with a CI-checked precache list (`offline.mjs`).
- **Online two-player**: WebRTC with copy-paste invites, no server (`net.js`, `online.mjs`).
- **Bigger norinori and LITS banks**: 365 boards per level, all CP-SAT-confirmed; the daily steps through the bank by day, so it doesn't repeat for a year.

## Proposals

1. **Daily cache for slow generators**: keep today's generated board in localStorage for jigsaw-sudoku, star-battle, and zip so a revisit is instant. Acceptance: same board as generating fresh (checked in CI), no stale board after midnight UTC.
2. **Shareable results**: a "copy result" line after a daily (time and level, no spoilers).

## Adding a game

1. A folder with `index.html` + `game.js`; load `shared.css`, `soft.css`, `manpage.css`, `manpage.js`, `gamekit.js` (and `net.js` for online play). Give `<body>` the class `g-<name>`.
2. Daily puzzles use `Gamekit.puzzlePage`; boards must be solver-checked unique.
3. A `<template id="man-<name>">` manual with Name, Rules, Controls, Strategy.
4. Keyboard play through `Gamekit.gridKeys`.
5. A hub card in the right section (update the section count and the "Forty-three" totals in the hub, README, and manifest), a README row, and a `docs/games.md` entry.
6. Run `node .github/tools/precache.mjs`, add a `play.mjs` plan (puzzles) or an `online.mjs` entry (versus games), and logic checks for any generator or AI.
