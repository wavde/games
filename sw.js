// Offline play: the whole site is cached when the service worker installs, then every request
// goes to the network first (so updates show up at once) and falls back to the cache offline.
// The file list is written by .github/tools/precache.mjs and checked in CI.
"use strict";

const CACHE = "games";
const FILES = [
  // precache:start
  "./",
  "2048/",
  "2048/game.js",
  "akari/",
  "akari/game.js",
  "battleships/",
  "battleships/game.js",
  "breakout/",
  "breakout/game.js",
  "calcudoku/",
  "calcudoku/game.js",
  "checkers/",
  "checkers/game.js",
  "chess/",
  "chess/game.js",
  "code-breaker/",
  "code-breaker/game.js",
  "connect-four/",
  "connect-four/game.js",
  "dots-and-boxes/",
  "dots-and-boxes/game.js",
  "favicon.svg",
  "fonts/fira-mono-400-latin-ext.woff2",
  "fonts/fira-mono-400-latin.woff2",
  "fonts/fira-mono-400-symbols2.woff2",
  "fonts/fira-mono-500-latin-ext.woff2",
  "fonts/fira-mono-500-latin.woff2",
  "fonts/fira-mono-500-symbols2.woff2",
  "fonts/fira-mono-700-latin-ext.woff2",
  "fonts/fira-mono-700-latin.woff2",
  "fonts/fira-mono-700-symbols2.woff2",
  "freecell/",
  "freecell/game.js",
  "futoshiki/",
  "futoshiki/game.js",
  "gamekit.js",
  "gomoku/",
  "gomoku/game.js",
  "hashi/",
  "hashi/game.js",
  "hex/",
  "hex/game.js",
  "hitori/",
  "hitori/game.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "jigsaw-sudoku/",
  "jigsaw-sudoku/game.js",
  "kakuro/",
  "kakuro/game.js",
  "klondike/",
  "klondike/game.js",
  "lights-out/",
  "lights-out/game.js",
  "lits/",
  "lits/game.js",
  "lits/puzzles.js",
  "mancala/",
  "mancala/game.js",
  "manifest.json",
  "manpage.css",
  "manpage.js",
  "memory/",
  "memory/game.js",
  "minesweeper/",
  "minesweeper/game.js",
  "mini-sudoku/",
  "mini-sudoku/game.js",
  "morris/",
  "morris/game.js",
  "net.js",
  "nonogram/",
  "nonogram/game.js",
  "norinori/",
  "norinori/game.js",
  "norinori/puzzles.js",
  "nurikabe/",
  "nurikabe/game.js",
  "patches/",
  "patches/game.js",
  "queens/",
  "queens/game.js",
  "reversi/",
  "reversi/game.js",
  "shared.css",
  "skyscrapers/",
  "skyscrapers/game.js",
  "slide-15/",
  "slide-15/game.js",
  "slitherlink/",
  "slitherlink/game.js",
  "snake/",
  "snake/game.js",
  "soft.css",
  "sokoban/",
  "sokoban/game.js",
  "spider/",
  "spider/game.js",
  "star-battle/",
  "star-battle/game.js",
  "tango/",
  "tango/game.js",
  "tents/",
  "tents/game.js",
  "tic-tac-toe/",
  "tic-tac-toe/game.js",
  "zip/",
  "zip/game.js",
  // precache:end
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const answer = async (req) => {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await caches.match("./");
      if (home) return home;
    }
    throw err;
  }
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(answer(req));
});
