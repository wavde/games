// Logic checks: rules engines, AIs, and puzzle generators, run against the real game code.
// The test server appends a hook to each game.js that exposes named internals on window.__t,
// so nothing in the site ships test code. Seeds are fixed, so failures reproduce.
//  - every generated logic puzzle (3 levels × SEEDS boards) has exactly one solution, and the
//    graded ones still need the technique their level promises
//  - checkers matches published perft counts; mancala matches an independent Kalah model;
//    the checkers, battleships, and mancala AIs only ever play legal moves
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
  zip:           { names: ["generate", "findSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  nonogram:      { names: ["generate", "lineSolvable", "clueOf", "DIFFS"], extra: "setDiff: (d) => { diff = d; }" },
  queens:        { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; N = DIFFS[d]; }" },
  tango:         { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  "mini-sudoku": { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }" },
  patches:       { names: ["generate", "countSolutions"], extra: "setDiff: (d) => { diff = d; }, clues: () => clues, size: () => N" },
  checkers:      { names: ["initialBoard", "legalMoves", "applyMove", "pickMove"] },
  mancala:       { names: ["initialBoard", "legalMoves", "applyMove", "pickMove"] },
  battleships:   { names: ["placeFleet", "fire", "aiShot"] },
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
  ["zip", "zip", [LEVELS, SEEDS]],
  ["nonogram", "nonogram", [LEVELS, SEEDS]],
  ["queens", "simpleUnique", [LEVELS, SEEDS, "queens"]],
  ["tango", "simpleUnique", [LEVELS, SEEDS, "tango"]],
  ["mini-sudoku", "simpleUnique", [LEVELS, SEEDS, "mini-sudoku"]],
  ["patches", "simpleUnique", [LEVELS, SEEDS, "patches"]],
  ["checkers", "checkers", []],
  ["mancala", "mancala", []],
  ["battleships", "battleships", []],
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
