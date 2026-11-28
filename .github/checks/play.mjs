// Play-through checks: every puzzle is solved through its real UI (clicks, keys, drags) on
// every level, and the card games are won by replaying a solver's line. Each game gets a
// test-only hook (appended by the test server, never shipped) exposing a `plan` that reads the
// answer from the game's own state or solves it with the game's own solver, `ok(k)` to tell
// whether cell k is in its target state yet, and `won()`.
// Usage (repo root): node .github/checks/play.mjs [game ...]   (CHROME_PATH overrides Chrome)
import { startServer, launchBrowser } from "./lib.mjs";

const LEVELS = ["easy", "medium", "hard"];

// Plans run inside each game's closure, so they can use its variables and functions.
// Step kinds: { cyc, k } click until ok(k); { click, button }; { key }; { drag: [selectors] }.
/* eslint-disable no-undef */
const PLANS = {
  calcudoku: { plan: () => ({ steps: [...P.solution].flatMap((d, i) => [{ click: '.cg-cell[data-i="' + i + '"]' }, { key: String(d) }]) }) },
  kakuro: { plan: () => ({ steps: P.cells.flatMap((i) => [{ click: '.kk-cell[data-i="' + i + '"]' }, { key: String(P.solution[i]) }]) }) },
  skyscrapers: { plan: () => ({ steps: [...P.solution].flatMap((d, i) => [{ click: '.sc-cell[data-i="' + i + '"]' }, { key: String(d) }]) }) },
  futoshiki: { plan: () => ({ steps: [...P.solution].flatMap((d, i) => (P.given[i] ? [] : [{ click: '.ft-cell[data-i="' + i + '"]' }, { key: String(d) }])) }) },
  "jigsaw-sudoku": { plan: () => ({ steps: [...P.solution].flatMap((d, i) => (P.given[i] ? [] : [{ click: '.jg-cell[data-i="' + i + '"]' }, { key: String(d) }])) }) },
  "mini-sudoku": {
    plan: () => {
      const g = Array.from(grid), n = 6;
      const ok = (p, d) => { const r = Math.floor(p / n), c = p % n, br = r - r % 2, bc = c - c % 3;
        for (let k = 0; k < n; k++) if (g[r * n + k] === d || g[k * n + c] === d) return false;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) if (g[(br + a) * n + bc + b] === d) return false;
        return true; };
      (function solve(p) { if (p === n * n) return true; if (g[p]) return solve(p + 1);
        for (let d = 1; d <= n; d++) if (ok(p, d)) { g[p] = d; if (solve(p + 1)) return true; g[p] = 0; } return false; })(0);
      cellEls.forEach((el, i) => el.setAttribute("data-ti", i));
      return { steps: g.flatMap((d, i) => (givens[i] ? [] : [{ click: '[data-ti="' + i + '"]' }, { key: String(d) }])) };
    },
  },
  hitori: { plan: () => ({ steps: [...P.solution].flatMap((s, i) => (s ? [{ cyc: '.ht-cell[data-i="' + i + '"]', k: i }] : [])) }), ok: (k) => state[k] === 1 },
  nurikabe: { plan: () => ({ steps: [...P.solution].flatMap((s, i) => (s === 0 ? [{ cyc: '.nk-cell[data-i="' + i + '"]', k: i }] : [])) }), ok: (k) => state[k] === 1 },
  tents: { plan: () => ({ steps: [...P.solution].flatMap((s, i) => (s ? [{ cyc: '.tn-cell[data-i="' + i + '"]', k: i }] : [])) }), ok: (k) => mark[k] === 1 },
  "star-battle": {
    plan: () => { const s = findSolutions(P, 1, 1e7).sols[0]; return { steps: [...s].flatMap((x, i) => (x === 1 ? [{ cyc: '.sb-cell[data-i="' + i + '"]', k: i }] : [])) }; },
    ok: (k) => state[k] === 1,
  },
  akari: {
    plan: () => {
      const v = (function solve(v) { if (!propagate(P, v)) return null; const c = P.whites.find((x) => v[x] === -1);
        if (c === undefined) return v; for (const g of [1, 0]) { const t = v.slice(); t[c] = g; const r = solve(t); if (r) return r; } return null; })(fresh(P));
      return { steps: P.whites.filter((c) => v[c] === 1).map((c) => ({ cyc: '.ak-cell[data-i="' + c + '"]', k: c })) };
    },
    ok: (k) => state[k] === 1,
  },
  slitherlink: {
    plan: () => {
      const v = (function solve(v) { if (!propagate(P, v)) return null; if (complete(v)) return isSolution(P, v) ? v : null;
        const e = pickEdge(P, v); for (const g of [1, 0]) { const t = v.slice(); t[e] = g; const r = solve(t); if (r) return r; } return null; })(fresh(P));
      return { steps: [...v].flatMap((x, e) => (x === 1 ? [{ cyc: '.sl-line[data-e="' + e + '"]', k: e }] : [])) };
    },
    ok: (k) => state[k] === 1,
  },
  hashi: {
    plan: () => {
      const b = initBounds(P);
      const lo = (function solve(lo, hi) { if (!propagate(P, lo, hi)) return null; const e = lo.findIndex((x, k) => x < hi[k]);
        if (e < 0) return connected(P, (k) => lo[k] > 0) ? lo : null;
        for (let x = lo[e]; x <= hi[e]; x++) { const l2 = lo.slice(), h2 = hi.slice(); l2[e] = h2[e] = x; const r = solve(l2, h2); if (r) return r; } return null; })(b.lo, b.hi);
      const steps = [];
      lo.forEach((c, e) => { for (let t = 0; t < c; t++) steps.push({ click: '.hs-island[data-i="' + P.edges[e].a + '"]' }, { click: '.hs-island[data-i="' + P.edges[e].b + '"]' }); });
      return { steps };
    },
  },
  queens: {
    plan: () => { cellEls.forEach((el, i) => el.setAttribute("data-ti", i)); return { steps: solution.map((c, r) => ({ cyc: '[data-ti="' + (r * N + c) + '"]', k: r * N + c })) }; },
    ok: (k) => grid[k] === 2,
  },
  tango: {
    plan: () => { cellEls.forEach((el, i) => el.setAttribute("data-ti", i)); return { steps: [...solution].flatMap((s, i) => (givens[i] ? [] : [{ cyc: '[data-ti="' + i + '"]', k: i }])) }; },
    ok: (k) => grid[k] === solution[k],
  },
  nonogram: {
    plan: () => { cellEls.forEach((el, i) => el.setAttribute("data-ti", i)); return { steps: [...sol].flatMap((s, i) => (s === 1 ? [{ cyc: '[data-ti="' + i + '"]', k: i }] : [])) }; },
    ok: (k) => grid[k] === 1,
  },
  zip: {
    plan: () => { cellEls.forEach((el, i) => el.setAttribute("data-ti", i)); const p = findSolutions(1, 5e6).sols[0]; return { steps: [{ drag: p.map((i) => '[data-ti="' + i + '"]') }] }; },
  },
  patches: {
    plan: () => {
      cellEls.forEach((el, i) => el.setAttribute("data-ti", i));
      const owner = new Int32Array(N * N).fill(-1), rects = [];
      const fits = (q, ci) => { for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
        if (owner[r * N + c] !== -1) return false; if (clues.some((x, k) => k !== ci && x.r === r && x.c === c)) return false; } return true; };
      (function solve(ci) {
        if (ci === clues.length) return owner.every((x) => x !== -1);
        const { r, c, v } = clues[ci];
        for (let w = 1; w <= v; w++) { if (v % w) continue; const h = v / w;
          for (let r0 = Math.max(0, r - h + 1); r0 <= r && r0 + h - 1 < N; r0++) for (let c0 = Math.max(0, c - w + 1); c0 <= c && c0 + w - 1 < N; c0++) {
            const q = { r0, c0, r1: r0 + h - 1, c1: c0 + w - 1 }; if (!fits(q, ci)) continue;
            for (let y = q.r0; y <= q.r1; y++) for (let x = q.c0; x <= q.c1; x++) owner[y * N + x] = ci;
            rects.push(q); if (solve(ci + 1)) return true; rects.pop();
            for (let y = q.r0; y <= q.r1; y++) for (let x = q.c0; x <= q.c1; x++) owner[y * N + x] = -1; } }
        return false; })(0);
      return { steps: rects.map((q) => ({ drag: ['[data-ti="' + (q.r0 * N + q.c0) + '"]', '[data-ti="' + (q.r1 * N + q.c1) + '"]'] })) };
    },
  },
  "lights-out": {
    plan: () => {
      cellEls.forEach((el, i) => el.setAttribute("data-ti", i));
      for (let m = 0; m < 1 << N; m++) {
        const b = Uint8Array.from(board), presses = [];
        const hit = (r, c) => { presses.push(r * N + c); press(b, r, c); };
        for (let c = 0; c < N; c++) if (m & (1 << c)) hit(0, c);
        for (let r = 1; r < N; r++) for (let c = 0; c < N; c++) if (b[(r - 1) * N + c]) hit(r, c);
        if (b.every((x) => !x)) return { steps: presses.map((i) => ({ click: '[data-ti="' + i + '"]' })) };
      }
      return { steps: [] };
    },
  },
  "slide-15": {
    levels: ["easy"],
    plan: () => {
      const goal = tiles.map((_, i) => (i === tiles.length - 1 ? 0 : i + 1)).join(","), start = tiles.join(",");
      const prev = new Map([[start, null]]), queue = [start];
      while (queue.length && !prev.has(goal)) { const s = queue.shift(), t = s.split(",").map(Number), z = t.indexOf(0);
        for (const d of [-N, N, -1, 1]) { const j = z + d; if (j < 0 || j >= t.length || (Math.abs(d) === 1 && Math.floor(j / N) !== Math.floor(z / N))) continue;
          const u = t.slice(); [u[z], u[j]] = [u[j], u[z]]; const key = u.join(","); if (!prev.has(key)) { prev.set(key, [s, j]); queue.push(key); } } }
      const cells = []; for (let s = goal; prev.get(s); s = prev.get(s)[0]) cells.unshift(prev.get(s)[1]);
      return { steps: cells.map((c) => ({ click: '.sl-tile[data-cell="' + c + '"]' })) };
    },
  },
  sokoban: {
    plan: () => {
      const n = L.n, D = [-n, n, -1, 1], KEY = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      const isGoal = (i) => (L.goal.length === n * n ? !!L.goal[i] : L.goal.includes(i));
      const start = { p: player, b: [...box.keys()].filter((i) => box[i]) }, key = (s) => s.p + "|" + s.b.join(",");
      const prev = new Map([[key(start), null]]), queue = [start];
      while (queue.length) { const s = queue.shift();
        if (s.b.every(isGoal)) { const keys = []; for (let k = key(s); prev.get(k); k = prev.get(k)[0]) keys.unshift(KEY[prev.get(k)[1]]); return { steps: keys.map((k) => ({ key: k })) }; }
        for (let d = 0; d < 4; d++) { const q = s.p + D[d]; if (L.wall[q]) continue; let b = s.b;
          if (b.includes(q)) { const t = q + D[d]; if (L.wall[t] || b.includes(t)) continue; b = b.map((x) => (x === q ? t : x)).sort((a, c) => a - c); }
          const ns = { p: q, b }, k = key(ns); if (!prev.has(k)) { prev.set(k, [key(s), d]); queue.push(ns); } } }
      return { steps: [] };
    },
  },
  "code-breaker": {
    plan: () => { [...paletteEl.children].forEach((el, i) => el.setAttribute("data-ti", "c" + (i + 1))); guessBtn.setAttribute("data-ti", "go");
      return { steps: secret.map((c) => ({ click: '[data-ti="c' + c + '"]' })).concat([{ click: '[data-ti="go"]' }]) }; },
  },
  // Cards: steps drag a card (grabbed by its visible top strip) onto a drop zone.
  klondike: {
    levels: ["one", "three"],
    // Replays the deal's own solver line. The solver plays safe cards home between moves and
    // the page doesn't, so those plays become drags too; once everything is face up and the
    // stock is gone the page finishes on its own.
    plan: () => {
      const T = clone(S), steps = [], n = MODES[mode];
      let stop = false;
      const src = (f) => (f.w ? '[data-key="w"]' : '[data-key="t' + f.t + "-" + f.k + '"]');
      const finished = () => !T.s.length && !T.w.length && T.d.every((x) => x === 0);
      const after = () => {
        if (won(T)) { stop = true; return; }
        if (!finished()) return;
        for (let p = 0; p < 7; p++) if (T.t[p].length && canFound(T, top(T.t[p]))) { apply(T, { from: { t: p, k: T.t[p].length - 1 }, to: { f: true } }); p = -1; }
        steps.push({ idle: true });
        stop = won(T);
      };
      const move = (mv) => { if (stop) return; steps.push({ drag: [src(mv.from), mv.to.f ? '[data-drop="f"]' : '[data-drop="' + mv.to.t + '"]'], grab: true }); apply(T, mv); after(); };
      const home = () => { for (let moved = true; moved && !stop;) { moved = false;
        if (T.w.length && safe(T, top(T.w))) { move({ from: { w: true }, to: { f: true } }); moved = true; }
        for (let p = 0; p < 7; p++) if (T.t[p].length && safe(T, top(T.t[p]))) { move({ from: { t: p, k: T.t[p].length - 1 }, to: { f: true } }); moved = true; } } };
      home();
      for (const mv of solve(T, n, 1e6).line) {
        if (stop) break;
        if (mv === "draw") { steps.push({ click: '[data-key="stock"]' }); draw(T, n); after(); } else move(mv);
        home();
      }
      return { steps };
    },
    won: () => done,
    idle: () => !finishing,
  },
  freecell: {
    levels: [1, 617, 25904],
    chip: false,
    // Greedy best-first search over the page's own rules (runs move as one when capacity allows),
    // scoring cards still out, how deep the next card of each suit is buried, and full cells.
    plan: (deal) => {
      number = deal; dailyDate = null; restart();
      const key = (T) => T.f.join(",") + "|" + T.c.slice().sort((a, b) => a - b).join(",") + "|" + T.t.map((P) => P.join(".")).sort().join("/");
      const score = (T) => { let h = 3 * (52 - T.f.reduce((a, b) => a + b, 0)) + T.c.filter((x) => x >= 0).length;
        for (let u = 0; u < 4; u++) { const want = u * 13 + T.f[u]; for (const P of T.t) { const i = P.indexOf(want); if (i >= 0) h += P.length - 1 - i; } }
        return h; };
      const moves = (T) => {
        const out = [];
        T.c.forEach((x, q) => { if (x >= 0 && canFound(T, x)) out.push({ from: { c: q }, to: { f: true } }); });
        T.t.forEach((P, p) => { if (P.length && canFound(T, top(P))) out.push({ from: { t: p, k: P.length - 1 }, to: { f: true } }); });
        const empty = T.t.findIndex((P) => !P.length);
        T.t.forEach((P, a) => { for (let k = 0; k < P.length; k++) { if (!cardsOf(T, { t: a, k }).length) continue;
          for (let b = 0; b < 8; b++) if (T.t[b].length || (b === empty && k > 0)) { const mv = { from: { t: a, k }, to: { t: b } }; if (legal(T, mv)) out.push(mv); } } });
        T.c.forEach((x, q) => { if (x >= 0) for (let b = 0; b < 8; b++) if (T.t[b].length || b === empty) { const mv = { from: { c: q }, to: { t: b } }; if (legal(T, mv)) out.push(mv); } });
        const free = T.c.indexOf(-1);
        if (free >= 0) T.t.forEach((P, p) => { if (P.length) out.push({ from: { t: p, k: P.length - 1 }, to: { c: free } }); });
        return out;
      };
      const heap = [], push = (n) => { heap.push(n); for (let i = heap.length - 1; i > 0;) { const j = (i - 1) >> 1; if (heap[j].h <= heap[i].h) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
      const pop = () => { const r = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; for (let i = 0; ;) { let m = i; const l = 2 * i + 1, rr = l + 1;
        if (l < heap.length && heap[l].h < heap[m].h) m = l; if (rr < heap.length && heap[rr].h < heap[m].h) m = rr; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return r; };
      const seen = new Set([key(S)]);
      let goal = null;
      push({ T: clone(S), h: score(S), up: null, mv: null });
      for (let nodes = 0; heap.length && !goal && nodes < 2e5; nodes++) {
        const n = pop();
        for (const mv of moves(n.T)) { const U = clone(n.T); apply(U, mv); autoplay(U); const k = key(U); if (seen.has(k)) continue; seen.add(k);
          const m = { T: U, h: score(U), up: n, mv }; if (won(U)) { goal = m; break; } push(m); }
      }
      const line = []; for (let n = goal; n && n.mv; n = n.up) line.push(n.mv);
      const src = (f) => (f.c !== undefined ? '[data-key="c' + f.c + '"]' : '[data-key="t' + f.t + "-" + f.k + '"]');
      const dst = (t) => (t.f ? '[data-drop="f"]' : t.c !== undefined ? '[data-drop="c' + t.c + '"]' : '[data-drop="' + t.t + '"]');
      return { steps: line.reverse().map((mv) => ({ drag: [src(mv.from), dst(mv.to)], grab: true })) };
    },
    won: () => done,
  },
  spider: {
    // A crafted near-win (seven runs home, the last split across three columns) finished by
    // dragging a five-card run and then the ace.
    plan: () => {
      const run = (a, b) => { const r = []; for (let k = a; k >= b; k--) r.push(k - 1); return r; };
      S = { t: [run(13, 7), run(6, 2), [0], [], [], [], [], [], [], []], d: Array(10).fill(0), s: [], done: Array(7).fill(0) };
      start = clone(S); history = []; moves = 0; render();
      return { steps: [{ drag: ['[data-key="t1-0"]', '[data-drop="0"]'], grab: true }, { drag: ['[data-key="t2-0"]', '[data-drop="0"]'], grab: true }] };
    },
    won: () => over,
  },
};
/* eslint-enable no-undef */

// Norinori and LITS: boards come from a bank, so the offline tools solve them in Node.
const BANKED = { norinori: "nr-cell", lits: "lt-cell" };

function hookFor(game) {
  const p = PLANS[game];
  const fn = (f, dflt) => (f ? f.toString() : dflt);
  if (p) return "window.__play = { plan: " + p.plan.toString() + ", ok: " + fn(p.ok, "() => true") + ", won: " + fn(p.won, "() => won") + ", idle: " + fn(p.idle, "() => true") + " };";
  if (BANKED[game]) return "window.__play = { code: () => P.n + ':' + P.reg.map((x) => ID[x]).join(''), ok: (k) => mark[k] === 1, won: () => won };";
  return "";
}

const only = process.argv.slice(2);
const { server, base } = await startServer(hookFor);
const browser = await launchBrowser();
const failures = [];
const tools = { norinori: await import("../tools/norinori.mjs"), lits: await import("../tools/lits.mjs") };

// The middle of an element, or with `grab` a point just inside its top edge (cards overlap).
async function center(page, selector, grab) {
  const el = await page.$(selector);
  if (!el) throw new Error("missing " + selector);
  const box = await el.boundingBox();
  return { x: box.x + box.width / 2, y: grab ? box.y + Math.min(6, box.height / 2) : box.y + box.height / 2 };
}

async function run(page, steps) {
  for (const s of steps) {
    if (s.cyc) {
      let n = 0;
      while (!(await page.evaluate((k) => window.__play.ok(k), s.k))) { if (++n > 4) throw new Error("cell " + s.k + " never reached its target"); await page.click(s.cyc); }
    } else if (s.click) await page.click(s.click, s.button ? { button: s.button } : {});
    else if (s.key) await page.keyboard.press(s.key);
    else if (s.idle) await page.waitForFunction(() => window.__play.idle(), { timeout: 10000 });
    else if (s.drag) {
      const pts = [];
      for (const [j, q] of s.drag.entries()) pts.push(await center(page, q, s.grab && j === 0));
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y, { steps: 2 });
      await page.mouse.up();
    }
  }
}

async function openGame(game) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewport({ width: 460, height: 1400 });
  await page.goto(base + "/" + game + "/", { waitUntil: "load" });
  // The manual auto-opens on a first visit; close it and wait for its backdrop to leave.
  if (await page.$(".man-backdrop")) await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".man-backdrop"));
  await ready(page);
  return { page, errors };
}

// The board is ready once the page isn't generating (puzzle shells mark the board aria-busy).
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 30));
}

for (const game of Object.keys(PLANS).concat(Object.keys(BANKED))) {
  if (only.length && !only.includes(game)) continue;
  const t0 = Date.now(), { page, errors } = await openGame(game), done = [];
  for (const level of PLANS[game]?.levels || LEVELS) {
    try {
      if (PLANS[game]?.chip !== false) await page.evaluate((d) => document.querySelector('.chip[data-diff="' + d + '"]').click(), level);
      await ready(page);
      let steps;
      if (BANKED[game]) {
        const code = await page.evaluate(() => window.__play.code()), t = tools[game], { n, reg } = t.decode(code);
        const v = t.findSolutions(t.puzzle(n, reg), 1, 1e6).sols[0];
        steps = [...v].flatMap((x, i) => (x === 1 ? [{ cyc: "." + BANKED[game] + '[data-i="' + i + '"]', k: i }] : []));
      } else steps = (await page.evaluate((l) => window.__play.plan(l), level)).steps;
      if (!steps.length) throw new Error("no plan");
      await run(page, steps);
      await page.waitForFunction(() => window.__play.won(), { timeout: 10000 });
      done.push(level);
    } catch (e) {
      failures.push(game + " " + level + ": " + e.message.split("\n")[0]);
    }
  }
  // New and Reset give a fresh, ready board.
  if (!PLANS[game] || PLANS[game].chip !== false) {
    try {
      for (const id of ["new-btn", "reset-btn"]) {
        if (!(await page.$("#" + id))) continue;
        await page.click("#" + id);
        await ready(page);
        const st = await page.evaluate(() => ({ cells: document.getElementById("board").children.length, status: document.getElementById("status").textContent, won: window.__play.won() }));
        if (!st.cells || /Generating|Solved|Won/.test(st.status) || st.won) throw new Error(id + " left " + JSON.stringify(st));
      }
    } catch (e) { failures.push(game + " new/reset: " + e.message.split("\n")[0]); }
  }
  for (const e of errors) failures.push(game + ": page error " + e);
  console.log((done.length === (PLANS[game]?.levels || LEVELS).length && !errors.length ? "ok   " : "FAIL ") + game + " — solved " + (done.join(", ") || "nothing") + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error("\n" + failures.length + " failure(s):\n" + failures.join("\n"));
  process.exit(1);
}
