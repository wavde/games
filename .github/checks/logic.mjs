// Logic checks: rules engines, AIs, and puzzle generators, run against the real game code.
// The test server appends a hook to each game.js that exposes named internals on window.__t,
// so nothing in the site ships test code. Seeds are fixed, so failures reproduce.
//  - every generated logic puzzle (3 levels × SEEDS boards) has exactly one solution, and the
//    graded ones still need the technique their level promises
//  - checkers matches published perft counts; mancala matches an independent Kalah model;
//    the checkers, battleships, and mancala AIs only ever play legal moves; sokoban par is exact;
//    every klondike deal's winning line replays as legal moves; freecell, morris, and hex rules
// Usage (repo root): node .github/checks/logic.mjs   (CHROME_PATH overrides the Chrome binary)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const ROOT = process.cwd();
const SEEDS = 10;
const LEVELS = ["easy", "medium", "hard"];

// Internals to expose per game; `extra` runs inside the game's closure.
const EXPOSE = {
  akari:         { names: ["generate", "countSolutions", "fits", "DIFFS"] },
  slitherlink:   { names: ["generate", "countSolutions", "fits", "DIFFS"] },
  hashi:         { names: ["generate", "countSolutions", "fitsGrade", "DIFFS"] },
  "star-battle": { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  kakuro:        { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  hitori:        { names: ["generate", "countSolutions", "fits", "DIFFS"] },
  nurikabe:      { names: ["generate", "countSolutions", "fits", "DIFFS"] },
  calcudoku:     { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  skyscrapers:   { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  futoshiki:     { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  tents:         { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  "jigsaw-sudoku": { names: ["generate", "findSolutions", "fits", "DIFFS"] },
  freecell:      { names: ["deal", "clone", "legal", "apply", "autoplay", "cardsOf", "capacity"] },
  morris:        { names: ["initial", "clone", "legalMoves", "applyMove", "outcome", "pickMove", "onBoard", "MILLS"] },
  hex:           { names: ["connected", "pickMove"] },
  klondike:      { names: ["deal", "solve", "clone", "legal", "apply", "draw", "autoplay", "won", "MODES"] },
  breakout:      { names: ["createGame", "update", "launch", "DIFFS", "W"] },
  zip:           { names: ["generate", "findSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  nonogram:      { names: ["generate", "lineSolvable", "clueOf", "DIFFS"], extra: "setDiff: (d) => { diff = d; }" },
  queens:        { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; N = DIFFS[d]; }" },
  tango:         { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  "mini-sudoku": { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  patches:       { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }, clues: () => clues, size: () => N" },
  checkers:      { names: ["initialBoard", "legalMoves", "applyMove", "pickMove"] },
  mancala:       { names: ["initialBoard", "legalMoves", "applyMove", "pickMove"] },
  battleships:   { names: ["placeFleet", "fire", "aiShot"] },
  sokoban:       { names: ["generate"] },
  snake:         { names: ["createGame", "step"] },
};

function hook(game) {
  const { names, extra } = EXPOSE[game];
  const parts = names.map((n) => n + ": typeof " + n + ' === "undefined" ? undefined : ' + n);
  if (extra) parts.push(extra);
  return "\nwindow.__t = { " + parts.join(", ") + " };\n";
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, "utf8", (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const m = /^\/([\w-]+)\/game\.js$/.exec(rel);
    if (m && EXPOSE[m[1]]) {
      const end = data.lastIndexOf("})();");
      data = data.slice(0, end) + hook(m[1]) + data.slice(end);
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port;

const executablePath = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find((p) => fs.existsSync(p));
if (!executablePath) { console.error("No Chrome found; set CHROME_PATH."); process.exit(2); }
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });

// Each check runs in the page and returns { fails: [...], note }.
const CHECKS = {
  // Graded generators: own exhaustive solver with a large budget, plus the grade predicate.
  graded: (levels, seeds, solverName, gradeName) => {
    const t = window.__t, fails = [];
    for (const d of levels) for (let s = 1; s <= seeds; s++) {
      const P = t.generate(d, s);
      const r = solverName === "countSolutions" ? t.countSolutions(P, 2, 2e6) : t.findSolutions(P, 2, 2e7);
      const unique = typeof r === "number" ? r === 1 : r.complete && r.sols.length === 1;
      if (!unique) fails.push(d + " seed " + s + ": not unique");
      if (!t[gradeName](P, t.DIFFS[d].grade)) fails.push(d + " seed " + s + ": wrong grade");
    }
    return { fails, note: levels.length * seeds + " boards" };
  },
  zip: (levels, seeds) => {
    const t = window.__t, fails = [];
    for (const d of levels) {
      t.setDiff(d);
      for (let s = 1; s <= seeds; s++) {
        t.generate(s);
        const r = t.findSolutions(2, 5e6);
        if (!r.complete || r.sols.length !== 1) fails.push(d + " seed " + s + ": not unique");
      }
    }
    return { fails, note: levels.length * seeds + " boards" };
  },
  nonogram: (levels, seeds) => {
    const t = window.__t, fails = [];
    for (const d of levels) {
      t.setDiff(d);
      const n = t.DIFFS[d].n;
      for (let s = 1; s <= seeds; s++) {
        const p = t.generate(s);
        if (!t.lineSolvable(p.rows, p.cols, n)) fails.push(d + " seed " + s + ": not line-solvable");
        for (let r = 0; r < n; r++) if (t.clueOf(p.s.slice(r * n, r * n + n)).join() !== p.rows[r].join()) fails.push(d + " seed " + s + ": row clue mismatch");
      }
    }
    return { fails, note: levels.length * seeds + " boards" };
  },
  simpleUnique: (levels, seeds, game) => {
    const t = window.__t, fails = [];
    for (const d of levels) {
      t.setDiff(d);
      for (let s = 1; s <= seeds; s++) {
        const p = t.generate(s);
        let n;
        if (game === "queens") n = t.countSolutions(p.regions, 2);
        else if (game === "tango") n = t.countSolutions(p.givens.slice(), p.edges, 2);
        else if (game === "mini-sudoku") n = t.countSolutions(p.slice(), 2);
        else n = t.countSolutions(t.clues(), t.size(), 2);
        if (n !== 1) fails.push(d + " seed " + s + ": " + n + " solutions");
      }
    }
    return { fails, note: levels.length * seeds + " boards" };
  },
  checkers: () => {
    const t = window.__t, fails = [];
    const want = [1, 7, 49, 302, 1469, 7361, 36768, 179740];
    const perft = (b, s, d) => {
      const ms = t.legalMoves(b, s);
      if (d === 1) return ms.length;
      let n = 0;
      for (const m of ms) n += perft(t.applyMove(b, m), 3 - s, d - 1);
      return n;
    };
    for (let d = 1; d < want.length; d++) {
      const n = perft(t.initialBoard(), 1, d);
      if (n !== want[d]) fails.push("perft " + d + ": " + n + ", expected " + want[d]);
    }
    let b = t.initialBoard(), s = 1, ply = 0;
    for (; ply < 200; ply++) {
      const legal = t.legalMoves(b, s).map((m) => m.path.join("-"));
      if (!legal.length) break;
      const m = t.pickMove(b, s, 4, 0, 200);
      if (!legal.includes(m.path.join("-"))) { fails.push("AI played an illegal move at ply " + ply); break; }
      b = t.applyMove(b, m);
      s = 3 - s;
    }
    return { fails, note: "perft 1–7, AI self-play " + ply + " plies" };
  },
  mancala: () => {
    const t = window.__t, fails = [];
    // Independent Kalah: two rows of six pits walked as a ring.
    const ref = (st, k) => {
      const s = JSON.parse(JSON.stringify(st)), me = s.turn ? s.b : s.a, them = s.turn ? s.a : s.b;
      let n = me[k], pos = { row: "me", k };
      me[k] = 0;
      while (n) {
        if (pos.row === "me") pos = pos.k === 5 ? { row: "store" } : { row: "me", k: pos.k + 1 };
        else if (pos.row === "store") pos = { row: "them", k: 0 };
        else pos = pos.k === 5 ? { row: "me", k: 0 } : { row: "them", k: pos.k + 1 };
        if (pos.row === "me") me[pos.k]++; else if (pos.row === "them") them[pos.k]++; else if (s.turn) s.sb++; else s.sa++;
        n--;
      }
      if (pos.row === "me" && me[pos.k] === 1 && them[5 - pos.k] > 0) {
        const c = 1 + them[5 - pos.k];
        me[pos.k] = them[5 - pos.k] = 0;
        if (s.turn) s.sb += c; else s.sa += c;
      }
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      const over = !sum(s.a) || !sum(s.b);
      if (over) { s.sa += sum(s.a); s.sb += sum(s.b); s.a.fill(0); s.b.fill(0); }
      if (!(pos.row === "store" && !over)) s.turn = 1 - s.turn;
      return { s, over };
    };
    let rnd = 7;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
    let moves = 0;
    for (let g = 0; g < 400 && fails.length < 3; g++) {
      let st = { a: [4, 4, 4, 4, 4, 4], b: [4, 4, 4, 4, 4, 4], sa: 0, sb: 0, turn: g % 2 }, b = t.initialBoard(), p = st.turn;
      for (;;) {
        const lm = t.legalMoves(b, p), i = lm[Math.floor(rand() * lm.length)];
        const r = t.applyMove(b, i, p), q = ref(st, i % 7);
        moves++;
        if (JSON.stringify(r.board) !== JSON.stringify([...q.s.a, q.s.sa, ...q.s.b, q.s.sb]) || r.over !== q.over || (!r.over && r.next !== q.s.turn)) {
          fails.push("game " + g + ": differs from reference");
          break;
        }
        b = r.board; st = q.s; p = r.next;
        if (r.over) break;
      }
    }
    let b = t.initialBoard(), p = 0;
    for (let k = 0; k < 200; k++) {
      const m = t.pickMove(b, p, 6, 0, 200);
      if (!t.legalMoves(b, p).includes(m)) { fails.push("AI played an illegal move"); break; }
      const r = t.applyMove(b, m, p);
      b = r.board; p = r.next;
      if (r.over) break;
    }
    return { fails, note: moves + " moves vs reference, AI self-play" };
  },
  // Sokoban par must equal the fewest pushes found by a separate forward search.
  sokoban: (levels, seeds) => {
    const t = window.__t, fails = [];
    const forward = (L) => {
      const N = L.n * L.n, D = [-L.n, L.n, -1, 1];
      const reach = (set, from) => {
        const seen = new Uint8Array(N), st = [from];
        seen[from] = 1;
        let min = from;
        while (st.length) {
          const x = st.pop();
          if (x < min) min = x;
          for (const d of D) if (!seen[x + d] && !L.wall[x + d] && !set[x + d]) { seen[x + d] = 1; st.push(x + d); }
        }
        return { seen, min };
      };
      const solved = (bs) => bs.every((b) => L.goal[b]);
      const start = L.boxes.slice().sort((a, b) => a - b);
      if (solved(start)) return 0;
      const s0 = new Uint8Array(N);
      for (const b of start) s0[b] = 1;
      let front = [[start, reach(s0, L.player).min]];
      const seen = new Set([start.join() + "|" + front[0][1]]);
      for (let depth = 1; front.length; depth++) {
        const next = [];
        for (const [bs, p] of front) {
          const set = new Uint8Array(N);
          for (const b of bs) set[b] = 1;
          const can = reach(set, p).seen;
          for (let k = 0; k < bs.length; k++) for (const d of D) {
            const b = bs[k], to = b + d;
            if (!can[b - d] || L.wall[to] || set[to]) continue;
            const nb = bs.slice();
            nb[k] = to;
            nb.sort((x, y) => x - y);
            if (solved(nb)) return depth;
            set[b] = 0; set[to] = 1;
            const key = nb.join() + "|" + reach(set, b).min;
            set[to] = 0; set[b] = 1;
            if (!seen.has(key)) { seen.add(key); next.push([nb, Number(key.split("|")[1])]); }
          }
        }
        front = next;
      }
      return -1;
    };
    for (const d of levels) for (let s = 1; s <= seeds; s++) {
      const L = t.generate(d, s), f = forward(L);
      if (f !== L.par) fails.push(d + " seed " + s + ": par " + L.par + ", solver says " + f);
    }
    return { fails, note: levels.length * seeds + " rooms, par checked" };
  },
  snake: () => {
    const t = window.__t, fails = [], never = () => 0.999;
    const expect = (cond, msg) => { if (!cond) fails.push(msg); };
    let g = t.createGame(7, false, never);
    g.food = 48;
    let ticks = 0, ev;
    do { ev = t.step(g, 1, never); ticks++; } while (ev === "move" && ticks < 20);
    expect(ev === "dead" && ticks === 4, "wall: died after " + ticks + " ticks");
    g = t.createGame(5, true, never);
    const head = g.body[0];
    g.food = 0;
    for (let k = 0; k < 5; k++) t.step(g, 1, never);
    expect(g.alive && g.body[0] === head, "wrap: head did not come round");
    g = t.createGame(7, false, never);
    g.food = g.body[0] + 1;
    ev = t.step(g, 1, never);
    expect(ev === "eat" && g.body.length === 4 && g.score === 1 && !g.body.includes(g.food), "eating did not grow the snake");
    g = t.createGame(7, false, never);
    g.food = 48;
    const before = g.body[0];
    t.step(g, 3, never);
    expect(g.body[0] === before + 1, "reversal was not ignored");
    g = t.createGame(7, false, never);
    g.body = [24, 23, 22, 21, 20];
    g.dir = 1;
    g.food = 48;
    t.step(g, 2, never); t.step(g, 3, never);
    expect(t.step(g, 0, never) === "dead", "self-collision not detected");
    g = t.createGame(7, false, never);
    g.body = [0, 1, 8, 7];
    g.dir = 3;
    g.food = 48;
    expect(t.step(g, 2, never) === "move", "moving into the vacating tail was refused");
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 300 && fails.length < 5; k++) {
      g = t.createGame(9, k % 2 === 0, rand);
      for (let s = 0; s < 500 && g.alive && !g.won; s++) {
        t.step(g, Math.floor(rand() * 4), rand);
        if (!g.alive) break;
        if (new Set(g.body).size !== g.body.length || g.body.length !== 3 + g.score || g.body.includes(g.food)) { fails.push("invariant broken in random game " + k); break; }
      }
    }
    return { fails, note: "rules + 300 random games" };
  },
  // Breakout: a jittery tracking paddle clears three levels with exact brick and score counts,
  // the ball never leaves the arena or goes flat, and a paddle that never moves loses.
  breakout: () => {
    const t = window.__t, fails = [];
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const d of ["easy", "medium", "hard"]) {
      const cfg = t.DIFFS[d], g = t.createGame(cfg), perLevel = cfg.rows * 8;
      let off = 0, bricks = 0, levels = 0, time = 0, wantScore = 0;
      for (let r = 0; r < cfg.rows; r++) wantScore += 8 * 10 * (cfg.rows - r);
      t.launch(g);
      while (levels < 3 && time < 900 && !g.over) {
        for (const e of t.update(g, 1 / 60, g.ball.x + off)) {
          if (e === "paddle") off = (rand() - 0.5) * g.paddle.w * 0.8;
          if (e === "brick") bricks++;
          if (e === "level") levels++;
        }
        time += 1 / 60;
        if (g.ball.stuck) t.launch(g);
        const b = g.ball;
        if (b.x < 4.99 || b.x > t.W - 4.99 || b.y < 4.99) { fails.push(d + ": ball left the arena"); break; }
        if (!b.stuck && Math.abs(b.vy) < g.speed * 0.49) { fails.push(d + ": ball went flat"); break; }
      }
      if (levels < 3) fails.push(d + ": tracker cleared only " + levels + " levels");
      if (bricks !== 3 * perLevel || g.score !== 3 * wantScore) fails.push(d + ": " + bricks + " bricks / score " + g.score + ", expected " + 3 * perLevel + " / " + 3 * wantScore);
      const still = t.createGame(cfg);
      t.launch(still);
      for (let k = 0; k < 60 * 600 && !still.over; k++) { t.update(still, 1 / 60, 0); if (still.ball.stuck) t.launch(still); }
      if (!still.over) fails.push(d + ": a still paddle never lost");
    }
    return { fails, note: "3 levels per speed, physics invariants" };
  },
  // Klondike: each deal's solver line replays as legal moves to a win with all 52 cards
  // accounted for at every step, and the rules refuse the classic illegal moves.
  klondike: (seeds) => {
    const t = window.__t, fails = [];
    const count = (S) => {
      const seen = new Set([...S.t.flat(), ...S.s, ...S.w]);
      return seen.size === S.t.flat().length + S.s.length + S.w.length ? seen.size + S.f.reduce((a, b) => a + b, 0) : -1;
    };
    for (const mode of ["one", "three"]) {
      const n = t.MODES[mode];
      for (let seed = 1; seed <= seeds; seed++) {
        const S = t.deal(seed, n), r = t.solve(S, n, 1e6), T = t.clone(S);
        if (!r.won) { fails.push(mode + " seed " + seed + ": solver found no win"); continue; }
        let ok = true;
        for (const mv of r.line) {
          t.autoplay(T);
          if (mv === "draw") t.draw(T, n);
          else if (!t.legal(T, mv)) { fails.push(mode + " seed " + seed + ": illegal move in line"); ok = false; break; }
          else t.apply(T, mv);
          if (count(T) !== 52) { fails.push(mode + " seed " + seed + ": cards lost or duplicated"); ok = false; break; }
        }
        t.autoplay(T);
        if (ok && !t.won(T)) fails.push(mode + " seed " + seed + ": line does not finish the game");
      }
    }
    // Spot rules on a hand-built table: 0 = A♠, 13 = A♥, 11 = Q♠, 25 = K♥, 23 = J♥, 10 = J♠.
    const R = { t: [[11], [25], [], [23], [10], [], []], d: [0, 0, 0, 0, 0, 0, 0], s: [], w: [0], f: [0, 0, 0, 0] };
    const L = (from, to) => t.legal(R, { from, to });
    if (!L({ t: 0, k: 0 }, { t: 1 })) fails.push("Q♠ onto K♥ refused");
    if (L({ t: 4, k: 0 }, { t: 0 })) fails.push("J♠ onto Q♠ allowed");
    if (!L({ t: 3, k: 0 }, { t: 0 })) fails.push("J♥ onto Q♠ refused");
    if (L({ t: 0, k: 0 }, { t: 2 })) fails.push("queen into an empty column allowed");
    if (!L({ t: 1, k: 0 }, { t: 2 })) fails.push("king into an empty column refused");
    if (!L({ w: true }, { f: true }) || L({ t: 0, k: 0 }, { f: true })) fails.push("foundation order wrong");
    return { fails, note: 2 * seeds + " deals replayed + rules" };
  },
  // FreeCell: deal #1 matches the published layout; random legal play keeps all 52 cards and
  // never moves a run longer than the free cells and empty columns allow.
  freecell: () => {
    const t = window.__t, fails = [];
    const R = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"], SU = "SHDC";
    const name = (c) => R[c % 13 + 1] + SU[Math.floor(c / 13)];
    const d1 = t.deal(1), row1 = d1.t.map((p) => name(p[0])).join(" ");
    if (row1 !== "JD 2D 9H JC 5D 7H 7C 5H") fails.push("deal #1 first row " + row1);
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let g = 0; g < 40; g++) {
      const S = t.deal(1 + Math.floor(rand() * 32000));
      for (let k = 0; k < 150; k++) {
        const moves = [];
        const froms = [];
        for (let q = 0; q < 4; q++) if (S.c[q] >= 0) froms.push({ c: q });
        for (let p = 0; p < 8; p++) for (let i = 0; i < S.t[p].length; i++) if (t.cardsOf(S, { t: p, k: i }).length) froms.push({ t: p, k: i });
        for (const from of froms) for (const to of [{ f: true }, { c: S.c.indexOf(-1) }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((p) => ({ t: p }))]) {
          if (to.c === -1) continue;
          const mv = { from, to };
          if (!t.legal(S, mv)) continue;
          if (to.t !== undefined && t.cardsOf(S, from).length > t.capacity(S, to.t)) fails.push("over-long run allowed");
          moves.push(mv);
        }
        if (!moves.length) break;
        t.apply(S, moves[Math.floor(rand() * moves.length)]);
        t.autoplay(S);
        const all = [...S.t.flat(), ...S.c.filter((c) => c >= 0)];
        if (new Set(all).size !== all.length || all.length + S.f.reduce((a, b) => a + b, 0) !== 52) { fails.push("cards lost or duplicated"); break; }
      }
      if (fails.length) break;
    }
    return { fails, note: "deal #1 layout + 40 random games" };
  },
  // Morris: random games keep piece counts consistent, mills take exactly one piece, and the AI
  // at each level only plays legal moves and finishes games.
  morris: () => {
    const t = window.__t, fails = [];
    let seed = 2;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const key = (m) => m.from + "," + m.to + "," + m.take;
    for (let g = 0; g < 200 && !fails.length; g++) {
      const S = t.initial();
      for (let ply = 0; ply < 300 && !t.outcome(S); ply++) {
        const moves = t.legalMoves(S), m = moves[Math.floor(rand() * moves.length)], o = 3 - S.turn;
        const before = t.onBoard(S, o);
        t.applyMove(S, m);
        if (t.onBoard(S, o) !== before - (m.take >= 0 ? 1 : 0)) { fails.push("capture count wrong"); break; }
        if (S.hand[1] + t.onBoard(S, 1) > 9 || S.hand[2] + t.onBoard(S, 2) > 9) { fails.push("piece count over nine"); break; }
      }
    }
    for (const level of [["easy", 2, 60, 5000], ["medium", 4, 0, 5000], ["hard", 14, 0, 300]]) {
      const S = t.initial();
      for (let ply = 0; ply < 120 && !t.outcome(S); ply++) {
        const m = S.turn === 1 ? t.pickMove(S, level[1], level[2], level[3], rand) : t.legalMoves(S)[Math.floor(rand() * t.legalMoves(S).length)];
        if (!t.legalMoves(S).some((x) => key(x) === key(m))) { fails.push(level[0] + ": illegal AI move"); break; }
        t.applyMove(S, m);
      }
    }
    return { fails, note: "200 random games, AI legality" };
  },
  // Hex: a full board always has exactly one winner; the AI takes a winning cell and blocks one.
  hex: () => {
    const t = window.__t, fails = [];
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 1000; k++) {
      const n = 3 + (k % 9), b = new Int8Array(n * n).map(() => 1 + (rand() < 0.5));
      if (!!t.connected(b, n, 1) === !!t.connected(b, n, 2)) { fails.push("full board without exactly one winner"); break; }
    }
    const n = 7, b = new Int8Array(n * n);
    // Red runs down column 3 to the last-but-one row; blue holds one of the two cells below.
    for (let r = 0; r < n - 1; r++) b[r * n + 3] = 1;
    b[(n - 1) * n + 2] = 2;
    if (t.pickMove(b, n, 1, "easy", rand) !== (n - 1) * n + 3) fails.push("AI missed a winning cell");
    if (t.pickMove(b, n, 2, "easy", rand) !== (n - 1) * n + 3) fails.push("AI missed a block");
    return { fails, note: "1000 full boards, win/block" };
  },
  battleships: () => {
    const t = window.__t, fails = [];
    for (let k = 0; k < 500; k++) {
      const f = t.placeFleet(Math.random);
      if ([...f.at].filter((x) => x >= 0).length !== 17) { fails.push("fleet overlaps"); break; }
    }
    for (const lvl of ["easy", "medium", "hard"]) for (let g = 0; g < 30; g++) {
      const f = t.placeFleet(Math.random), know = new Uint8Array(100);
      let shots = 0;
      while (f.ships.some((s) => s.hits < s.len) && shots <= 100) {
        const i = t.aiShot(lvl, know, f.ships.filter((s) => s.hits < s.len).map((s) => s.len), Math.random);
        if (i === undefined || know[i]) { fails.push(lvl + ": repeated or missing shot"); shots = 999; break; }
        t.fire(f, know, i);
        shots++;
      }
      if (shots > 100) { fails.push(lvl + ": did not sink the fleet"); break; }
    }
    return { fails, note: "500 fleets, 90 AI games" };
  },
};

const PLAN = [
  ["akari", "graded", [LEVELS, SEEDS, "countSolutions", "fits"]],
  ["slitherlink", "graded", [LEVELS, SEEDS, "countSolutions", "fits"]],
  ["hashi", "graded", [LEVELS, SEEDS, "countSolutions", "fitsGrade"]],
  ["star-battle", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["kakuro", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["hitori", "graded", [LEVELS, SEEDS, "countSolutions", "fits"]],
  ["nurikabe", "graded", [LEVELS, SEEDS, "countSolutions", "fits"]],
  ["calcudoku", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["skyscrapers", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["futoshiki", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["tents", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["jigsaw-sudoku", "graded", [LEVELS, SEEDS, "findSolutions", "fits"]],
  ["zip", "zip", [LEVELS, SEEDS]],
  ["nonogram", "nonogram", [LEVELS, SEEDS]],
  ["queens", "simpleUnique", [LEVELS, SEEDS, "queens"]],
  ["tango", "simpleUnique", [LEVELS, SEEDS, "tango"]],
  ["mini-sudoku", "simpleUnique", [LEVELS, SEEDS, "mini-sudoku"]],
  ["patches", "simpleUnique", [LEVELS, SEEDS, "patches"]],
  ["checkers", "checkers", []],
  ["mancala", "mancala", []],
  ["battleships", "battleships", []],
  ["sokoban", "sokoban", [LEVELS, 4]],
  ["snake", "snake", []],
  ["breakout", "breakout", []],
  ["klondike", "klondike", [SEEDS]],
  ["freecell", "freecell", []],
  ["morris", "morris", []],
  ["hex", "hex", []],
];

const failures = [];
for (const [game, check, args] of PLAN) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(game + ": page error " + e.message));
  await page.goto(BASE + "/" + game + "/", { waitUntil: "load" });
  const t0 = Date.now();
  const { fails, note } = await page.evaluate(CHECKS[check], ...args);
  for (const f of fails) failures.push(game + ": " + f);
  console.log((fails.length ? "FAIL " : "ok   ") + game + " — " + note + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error("\n" + failures.length + " failure(s):\n" + failures.join("\n"));
  process.exit(1);
}
