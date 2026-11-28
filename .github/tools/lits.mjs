// LITS solver + board generator, run offline to build lits/puzzles.js and from CI to re-check
// every banked board (making a board with exactly one answer takes seconds, too slow for the page).
// Usage (repo root): node .github/tools/lits.mjs <easy|medium|hard> <count> [seed] > part.json
//
// Board: n×n grid cut into regions. Shade one tetromino (L, I, T, or S shape; never the 2×2 O)
// in every region so that all shaded cells connect, no 2×2 block is fully shaded, and two
// tetrominoes of the same shape never touch along an edge (rotations and mirror images count
// as the same shape). Solver state: dom[k] = placements still possible in region k,
// v[i] = -1 unknown, 0 unshaded, 1 shaded.

import { mulberry32 } from "./norinori.mjs";

export const LEVELS = {
  easy:   { n: 6, grade: "basic" },
  medium: { n: 8, grade: "deduce" },
  hard:   { n: 9, grade: "deep" },
};

const ID = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const encode = (n, reg) => n + ":" + Array.from(reg, (x) => ID[x]).join("");
export const decode = (s) => { const [n, b] = s.split(":"); return { n: +n, reg: Array.from(b, (ch) => ID.indexOf(ch)) }; };

function orth(n, i) {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

// L, I, T, S from four connected cells, or "" for the square.
export function shapeOf(n, cells) {
  const rows = new Map(), cols = new Map();
  let deg3 = false;
  for (const i of cells) {
    const r = Math.floor(i / n), c = i % n;
    rows.set(r, (rows.get(r) || 0) + 1);
    cols.set(c, (cols.get(c) || 0) + 1);
    if (orth(n, i).filter((j) => cells.includes(j)).length === 3) deg3 = true;
  }
  const line = Math.max(...rows.values(), ...cols.values());
  if (line === 4) return "I";
  if (deg3) return "T";
  if (line === 3) return "L";
  return rows.size === 2 && cols.size === 2 ? "" : "S";
}

// Every tetromino (not the square) inside region cells.
function placements(n, cells) {
  const inside = new Set(cells), seen = new Set(), out = [];
  // Each placement is found by growing from its smallest cell.
  for (const c of cells) (function grow(set) {
    if (set.length === 4) {
      const key = set.slice().sort((a, b) => a - b).join(",");
      if (seen.has(key)) return;
      seen.add(key);
      const s = shapeOf(n, set);
      if (s) out.push({ cells: set.slice().sort((a, b) => a - b), shape: s });
      return;
    }
    for (const i of set) for (const j of orth(n, i)) if (inside.has(j) && !set.includes(j) && j > c) grow(set.concat(j));
  })([c]);
  return out;
}

export function puzzle(n, reg) {
  const k = Math.max(...reg) + 1, regions = Array.from({ length: k }, () => []);
  for (let i = 0; i < n * n; i++) regions[reg[i]].push(i);
  const nb = Array.from({ length: n * n }, (_, i) => orth(n, i));
  const near = regions.map((R) => [...new Set(R.flatMap((i) => nb[i]).map((j) => reg[j]))].filter((x) => x !== reg[R[0]]));
  const blocks = [];
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) blocks.push([r * n + c, r * n + c + 1, r * n + c + n, r * n + c + n + 1]);
  return { n, reg: Int16Array.from(reg), regions, nb, near, pl: regions.map((R) => placements(n, R)), blocks };
}

export function fresh(P) {
  return { dom: P.pl.map((L) => L.map((_, x) => x)), v: new Int8Array(P.n * P.n).fill(-1) };
}
const copy = (s) => ({ dom: s.dom.map((d) => d.slice()), v: s.v.slice() });

function touches(P, a, b) {
  const B = new Set(b);
  return a.some((i) => P.nb[i].some((j) => B.has(j)));
}

export function propagate(P, s) {
  const { dom, v } = s;
  for (;;) {
    let changed = false;
    // Placements must fit known cells, avoid 2×2 blocks, and not touch a fixed same-shape neighbour.
    for (let k = 0; k < dom.length; k++) {
      const keep = dom[k].filter((x) => {
        const p = P.pl[k][x], on = new Set(p.cells);
        if (p.cells.some((i) => v[i] === 0)) return false;
        if (P.regions[k].some((i) => v[i] === 1 && !on.has(i))) return false;
        for (const i of p.cells) for (const j of P.nb[i]) {
          const m = P.reg[j];
          if (m === k || dom[m].length !== 1) continue;
          const q = P.pl[m][dom[m][0]];
          if (q.shape === p.shape && q.cells.includes(j)) return false;
        }
        for (const b of P.blocks) if (b.some((i) => on.has(i)) && b.every((i) => on.has(i) || v[i] === 1)) return false;
        return true;
      });
      if (!keep.length) return false;
      if (keep.length !== dom[k].length) { dom[k] = keep; changed = true; }
      for (const i of P.regions[k]) {
        if (v[i] !== -1) continue;
        let all = true, none = true;
        for (const x of keep) { if (P.pl[k][x].cells.includes(i)) none = false; else all = false; }
        if (all) { v[i] = 1; changed = true; } else if (none) { v[i] = 0; changed = true; }
      }
    }
    // 2×2: three shaded leave the fourth unshaded.
    for (const b of P.blocks) {
      const on = b.filter((i) => v[i] === 1).length;
      if (on === 4) return false;
      if (on === 3) for (const i of b) if (v[i] === -1) { v[i] = 0; changed = true; }
    }
    // Every shaded cell must still be able to reach the others through cells not ruled out.
    const start = v.indexOf(1);
    if (start >= 0) {
      const seen = new Uint8Array(v.length), stack = [start];
      seen[start] = 1;
      while (stack.length) for (const j of P.nb[stack.pop()]) if (v[j] !== 0 && !seen[j]) { seen[j] = 1; stack.push(j); }
      for (let i = 0; i < v.length; i++) if (v[i] === 1 && !seen[i]) return false;
      // Regions cut off from the shading can't take part.
      for (let k = 0; k < dom.length; k++) if (!P.regions[k].some((i) => seen[i])) return false;
    }
    if (!changed) return true;
  }
}

const done = (s) => s.dom.every((d) => d.length === 1);
const unknown = (s) => s.v.reduce((k, x) => k + (x === -1), 0);

function reach(P, probing) {
  const s = fresh(P);
  if (!propagate(P, s)) return -1;
  let progress = probing;
  while (progress && !done(s)) {
    progress = false;
    for (let i = 0; i < s.v.length; i++) {
      if (s.v[i] !== -1) continue;
      for (const x of [1, 0]) {
        const t = copy(s);
        t.v[i] = x;
        if (!propagate(P, t)) {
          s.v[i] = 1 - x;
          if (!propagate(P, s)) return -1;
          progress = true;
          break;
        }
      }
    }
  }
  return done(s) ? 0 : Math.max(1, unknown(s));
}
export const basicSolve = (P) => reach(P, false) === 0;
export const logicSolve = (P) => reach(P, true) === 0;

// Up to `limit` full shadings, branching on the region with fewest placements left.
export function findSolutions(P, limit, budget) {
  const sols = [];
  let ok = true;
  (function search(s) {
    if (sols.length >= limit || !ok) return;
    if (--budget < 0) { ok = false; return; }
    if (!propagate(P, s)) return;
    let k = -1, best = 1e9;
    for (let x = 0; x < s.dom.length; x++) if (s.dom[x].length > 1 && s.dom[x].length < best) { best = s.dom[x].length; k = x; }
    if (k < 0) {
      // All regions fixed: check the whole rule set once more.
      const v = new Int8Array(P.n * P.n);
      s.dom.forEach((d, m) => { for (const i of P.pl[m][d[0]].cells) v[i] = 1; });
      if (valid(P, v)) sols.push(v);
      return;
    }
    for (const x of s.dom[k]) {
      const t = copy(s);
      t.dom[k] = [x];
      search(t);
    }
  })(fresh(P));
  return { sols, complete: ok };
}

// Full rule check of a shading (also used by the game to recognise a win).
export function valid(P, v) {
  const shapes = [];
  for (const R of P.regions) {
    const on = R.filter((i) => v[i] === 1);
    if (on.length !== 4) return false;
    const seen = new Set([on[0]]), stack = [on[0]];
    while (stack.length) for (const j of P.nb[stack.pop()]) if (on.includes(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
    if (seen.size !== 4) return false;
    const sh = shapeOf(P.n, on);
    if (!sh) return false;
    shapes.push({ on, sh });
  }
  for (let a = 0; a < shapes.length; a++) for (const b of P.near[a]) if (b > a && shapes[a].sh === shapes[b].sh && touches(P, shapes[a].on, shapes[b].on)) return false;
  for (const b of P.blocks) if (b.every((i) => v[i] === 1)) return false;
  const start = v.indexOf(1), seen = new Uint8Array(v.length), stack = [start];
  seen[start] = 1;
  while (stack.length) for (const j of P.nb[stack.pop()]) if (v[j] === 1 && !seen[j]) { seen[j] = 1; stack.push(j); }
  return v.every((x, i) => x !== 1 || seen[i]);
}

export function unique(P) {
  const r = findSolutions(P, 2, 100000);
  return r.complete && r.sols.length === 1;
}

export function fits(P, grade) {
  if (grade === "basic") return basicSolve(P);
  if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
  return !basicSolve(P) && unique(P);
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Move unshaded cell i to region `to`; pieces cut off from its old region's tetromino join a
// neighbouring region. Refused if the tetromino itself would split.
function spill(n, reg, sol, i, to) {
  const from = reg[i], before = Int16Array.from(reg);
  reg[i] = to;
  const left = [];
  for (let x = 0; x < n * n; x++) if (reg[x] === from) left.push(x);
  const comp = new Map();
  let nc = 0;
  for (const x of left) {
    if (comp.has(x)) continue;
    const stack = [x];
    comp.set(x, nc);
    while (stack.length) for (const j of orth(n, stack.pop())) if (reg[j] === from && !comp.has(j)) { comp.set(j, nc); stack.push(j); }
    nc++;
  }
  const keep = new Set(left.filter((x) => sol[x]).map((x) => comp.get(x)));
  if (keep.size !== 1) { reg.set(before); return false; }
  const k = [...keep][0];
  for (let c = 0; c < nc; c++) {
    if (c === k) continue;
    const cells = left.filter((x) => comp.get(x) === c);
    let target = -1;
    for (const x of cells) for (const j of orth(n, x)) if (reg[j] !== from && target < 0) target = reg[j];
    if (target < 0) { reg.set(before); return false; }
    for (const x of cells) reg[x] = target;
  }
  return true;
}

// A connected chain of tetrominoes (no 2×2, same shapes never touching) grown until no more
// fit; each tetromino becomes a region core and the unshaded cells join neighbouring regions at
// random. While a search finds a rival shading, a cell it shades (and the answer doesn't) moves
// to another region, which rules that rival out.
export function generate(level, rng) {
  const { n, grade } = LEVELS[level];
  const nb = (i) => orth(n, i);
  for (let attempt = 0; attempt < 300; attempt++) {
    const sol = new Int8Array(n * n), reg = new Int16Array(n * n).fill(-1), shapes = [];
    let k = 0;
    for (let tries = 0; tries < n * n * 6; tries++) {
      const seedCells = k ? [] : [Math.floor(rng() * n * n)];
      if (k) for (let i = 0; i < n * n; i++) if (reg[i] < 0 && nb(i).some((j) => sol[j])) seedCells.push(i);
      if (!seedCells.length) break;
      const cells = [seedCells[Math.floor(rng() * seedCells.length)]];
      while (cells.length < 4) {
        const opts = [...new Set(cells.flatMap(nb))].filter((j) => reg[j] < 0 && !cells.includes(j));
        if (!opts.length) break;
        cells.push(opts[Math.floor(rng() * opts.length)]);
      }
      if (cells.length < 4) continue;
      const sh = shapeOf(n, cells);
      if (!sh) continue;
      const t = sol.slice();
      for (const i of cells) t[i] = 1;
      let bad = false;
      for (let r = 0; r < n - 1 && !bad; r++) for (let c = 0; c < n - 1; c++) { const a = r * n + c; if (t[a] && t[a + 1] && t[a + n] && t[a + n + 1]) { bad = true; break; } }
      for (const i of cells) for (const j of nb(i)) if (reg[j] >= 0 && shapes[reg[j]] === sh) bad = true;
      if (bad) continue;
      for (const i of cells) { sol[i] = 1; reg[i] = k; }
      shapes.push(sh);
      k++;
    }
    if (k < (n * n) / 7) continue;
    for (let left = reg.filter((x) => x < 0).length; left; left--) {
      const front = [];
      for (let i = 0; i < n * n; i++) if (reg[i] < 0 && nb(i).some((j) => reg[j] >= 0)) front.push(i);
      const i = front[Math.floor(rng() * front.length)], own = nb(i).filter((j) => reg[j] >= 0);
      reg[i] = reg[own[Math.floor(rng() * own.length)]];
    }
    for (let fix = 0; fix < 80; fix++) {
      const r = findSolutions(puzzle(n, reg), 2, 20000);
      if (!r.complete) break;
      const rival = r.sols.find((s) => s.some((x, i) => x !== sol[i]));
      if (!rival) break;
      const moves = [];
      for (let i = 0; i < n * n; i++) if (rival[i] && !sol[i]) for (const j of nb(i)) if (reg[j] !== reg[i]) moves.push([i, reg[j]]);
      shuffle(moves, rng);
      if (!moves.some(([i, to]) => spill(n, reg, sol, i, to))) break;
    }
    const map = new Map();
    for (let i = 0; i < n * n; i++) if (!map.has(reg[i])) map.set(reg[i], map.size);
    const out = Int16Array.from(reg, (x) => map.get(x)), P = puzzle(n, out);
    if (map.size <= ID.length && unique(P) && fits(P, grade)) return { reg: out, sol };
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("lits.mjs")) {
  const [level, count, seed] = [process.argv[2], +process.argv[3] || 10, +process.argv[4] || 1];
  const rng = mulberry32(seed), out = [], seen = new Set();
  while (out.length < count) {
    const g = generate(level, rng);
    if (!g) continue;
    const code = encode(LEVELS[level].n, g.reg);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, sol: Array.from(g.sol).join("") });
    process.stderr.write(level + " " + out.length + "/" + count + "\n");
  }
  process.stdout.write(JSON.stringify(out));
}
