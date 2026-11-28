// Norinori solver + board generator, run offline to build norinori/puzzles.js and from CI
// to re-check every banked board. Generating a board that has exactly one answer takes
// seconds, too slow for the page, so the game ships a bank of boards made here.
// Usage (repo root): node .github/tools/norinori.mjs <easy|medium|hard> <count> [seed] > part.json
//
// Board: n×n grid cut into regions. Shade exactly two cells in every region so that every
// shaded cell touches exactly one other shaded cell side-on (dominoes that never touch side-on).
// Solver state: v[i] = -1 unknown, 0 unshaded, 1 shaded.

export const LEVELS = {
  easy:   { n: 6, grade: "basic" },
  medium: { n: 7, grade: "deduce" },
  hard:   { n: 8, grade: "deep" },
};

const ID = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const encode = (n, reg) => n + ":" + Array.from(reg, (x) => ID[x]).join("");
export function decode(s) {
  const [n, body] = s.split(":");
  return { n: +n, reg: Array.from(body, (ch) => ID.indexOf(ch)) };
}

function orth(n, i) {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

export function puzzle(n, reg) {
  const k = Math.max(...reg) + 1, regions = Array.from({ length: k }, () => []);
  for (let i = 0; i < n * n; i++) regions[reg[i]].push(i);
  return { n, reg: Int16Array.from(reg), regions, nb: Array.from({ length: n * n }, (_, i) => orth(n, i)) };
}

// For each region with shading still to place: try every way to finish it (the rest left
// unshaded), keep what all the locally consistent ways agree on. null on a contradiction.
function regionPass(P, v) {
  let changed = false;
  for (const R of P.regions) {
    const open = R.filter((i) => v[i] === -1);
    if (!open.length) continue;
    const need = 2 - R.filter((i) => v[i] === 1).length;
    const ways = need === 1 ? open.map((i) => [i]) : [];
    if (need === 2) for (let a = 0; a < open.length; a++) for (let b = a + 1; b < open.length; b++) ways.push([open[a], open[b]]);
    let on = -1, any = 0;
    for (const w of ways) {
      for (const i of open) v[i] = 0;
      for (const i of w) v[i] = 1;
      let ok = true;
      for (const i of R) {
        for (const x of [i, ...P.nb[i]]) {
          if (v[x] !== 1) continue;
          let kb = 0, ku = 0;
          for (const j of P.nb[x]) { if (v[j] === 1) kb++; else if (v[j] === -1) ku++; }
          if (kb > 1 || (!kb && !ku)) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (ok) {
        let m = 0;
        for (let k = 0; k < open.length; k++) if (v[open[k]] === 1) m |= 1 << k;
        on = on < 0 ? m : on & m;
        any |= m;
      }
    }
    for (const i of open) v[i] = -1;
    if (on < 0) return null;
    open.forEach((i, k) => {
      if (on & (1 << k)) { v[i] = 1; changed = true; }
      else if (!(any & (1 << k))) { v[i] = 0; changed = true; }
    });
  }
  return changed;
}

export function propagate(P, v) {
  for (;;) {
    let changed = false;
    const set = (i, x) => { if (v[i] === -1) { v[i] = x; changed = true; } };
    for (const R of P.regions) {
      let b = 0, u = 0;
      for (const i of R) { if (v[i] === 1) b++; else if (v[i] === -1) u++; }
      if (b > 2 || b + u < 2) return false;
      if (u && b === 2) for (const i of R) set(i, 0);
      else if (u && b + u === 2) for (const i of R) set(i, 1);
    }
    for (let i = 0; i < v.length; i++) {
      let kb = 0, ku = 0, last = -1;
      for (const j of P.nb[i]) { if (v[j] === 1) kb++; else if (v[j] === -1) { ku++; last = j; } }
      if (v[i] === 1) {
        if (kb > 1 || (!kb && !ku)) return false;
        if (kb === 1) { for (const j of P.nb[i]) set(j, 0); }
        else if (ku === 1) set(last, 1);
      } else if (v[i] === -1) {
        if (kb >= 2 || (!kb && !ku)) set(i, 0);
      }
    }
    if (!changed) {
      const r = regionPass(P, v);
      if (r === null) return false;
      if (!r) return true;
    }
  }
}

const fresh = (P) => new Int8Array(P.n * P.n).fill(-1);
const unknowns = (v) => v.reduce((k, x) => k + (x === -1), 0);

// Cells logic leaves unknown: propagation alone, or with probing. -1 on a contradiction.
function reach(P, probing) {
  const v = fresh(P);
  if (!propagate(P, v)) return -1;
  let progress = probing;
  while (progress && unknowns(v)) {
    progress = false;
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== -1) continue;
      for (const x of [1, 0]) {
        const t = v.slice();
        t[i] = x;
        if (!propagate(P, t)) {
          v[i] = 1 - x;
          if (!propagate(P, v)) return -1;
          progress = true;
          break;
        }
      }
    }
  }
  return unknowns(v);
}
export const basicSolve = (P) => reach(P, false) === 0;
export const logicSolve = (P) => reach(P, true) === 0;

// Up to `limit` solutions, branching in the region with fewest open cells.
export function findSolutions(P, limit, budget) {
  const sols = [];
  let ok = true;
  (function search(v) {
    if (sols.length >= limit || !ok) return;
    if (--budget < 0) { ok = false; return; }
    if (!propagate(P, v)) return;
    let i = -1, bestU = 99;
    for (const R of P.regions) {
      let u = 0, first = -1;
      for (const x of R) if (v[x] === -1) { u++; if (first < 0) first = x; }
      if (u && u < bestU) { bestU = u; i = first; }
    }
    if (i < 0) { sols.push(v); return; }
    for (const x of [1, 0]) {
      const t = v.slice();
      t[i] = x;
      search(t);
    }
  })(fresh(P));
  return { sols, complete: ok };
}

export function unique(P) {
  const r = findSolutions(P, 2, 200000);
  return r.complete && r.sols.length === 1;
}

// basic: propagation alone; deduce: needs probing; deep: unique but not propagation alone.
export function fits(P, grade) {
  if (grade === "basic") return basicSolve(P);
  if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
  return !basicSolve(P) && unique(P);
}

// Move cell i (unshaded in the answer) to region `to`; pieces of its old region cut off from
// the two shaded cells join a neighbouring region. Refused if the shaded pair would split.
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

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Dominoes packed so none touch side-on; each shaded cell seeds an area grown at random to
// cover the grid; touching areas are paired into regions of two shaded cells. While a search
// finds a rival shading, a cell it shades (and the answer doesn't) moves to a neighbouring
// region, which rules that rival out. Returns { reg, sol } or null.
export function generate(level, rng) {
  const { n, grade } = LEVELS[level];
  const nb = (i) => orth(n, i);
  for (let attempt = 0; attempt < 200; attempt++) {
    const sol = new Int8Array(n * n), area = new Int16Array(n * n).fill(-1);
    let k = 0;
    for (const i of shuffle(Array.from({ length: n * n }, (_, x) => x), rng)) {
      if (sol[i]) continue;
      const opts = nb(i).filter((j) => !sol[j] && nb(i).concat(nb(j)).every((x) => x === i || x === j || !sol[x]));
      if (!opts.length) continue;
      const j = opts[Math.floor(rng() * opts.length)];
      sol[i] = sol[j] = 1;
      area[i] = k++;
      area[j] = k++;
    }
    for (let left = area.filter((x) => x < 0).length; left; left--) {
      const front = [];
      for (let i = 0; i < n * n; i++) if (area[i] < 0 && nb(i).some((j) => area[j] >= 0)) front.push(i);
      const i = front[Math.floor(rng() * front.length)], own = nb(i).filter((j) => area[j] >= 0);
      area[i] = area[own[Math.floor(rng() * own.length)]];
    }
    const adj = Array.from({ length: k }, () => new Set());
    for (let i = 0; i < n * n; i++) for (const j of nb(i)) if (area[i] !== area[j]) adj[area[i]].add(area[j]);
    const mate = new Int16Array(k).fill(-1);
    let paired = true;
    for (let left = k; left > 0; left -= 2) {
      let a = -1, best = 99;
      for (let x = 0; x < k; x++) {
        if (mate[x] >= 0) continue;
        const f = [...adj[x]].filter((y) => mate[y] < 0).length;
        if (f < best || (f === best && rng() < 0.5)) { best = f; a = x; }
      }
      const free = [...adj[a]].filter((y) => mate[y] < 0);
      if (!free.length) { paired = false; break; }
      const b = free[Math.floor(rng() * free.length)];
      mate[a] = b;
      mate[b] = a;
    }
    if (!paired) continue;
    const rid = new Int16Array(k).fill(-1);
    let nr = 0;
    for (let x = 0; x < k; x++) if (rid[x] < 0) { rid[x] = rid[mate[x]] = nr++; }
    const reg = Int16Array.from(area, (x) => rid[x]);
    for (let fix = 0; fix < 60; fix++) {
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

if (process.argv[1] && process.argv[1].endsWith("norinori.mjs")) {
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
