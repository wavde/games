(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 8,  grade: "basic" },
    medium: { n: 9,  grade: "deduce" },
    hard:   { n: 10, grade: "deep" },
  };
  const STARS = 2;

  // ---------- generator + solver (no DOM) ----------
  // Cells are r * n + c. region[i] is 0..n-1. Solver values: -1 unknown, 0 no star, 1 star.

  function neighbours8(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc);
    }
    return out;
  }

  function buildPuzzle(n, region) {
    const units = [];
    for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
    for (let g = 0; g < n; g++) units.push([]);
    for (let i = 0; i < n * n; i++) units[2 * n + region[i]].push(i);
    const near = Array.from({ length: n * n }, (_, i) => neighbours8(n, i));
    return { n, region: Int8Array.from(region), units, near };
  }

  // Applies forced cells to a fixpoint; false on contradiction.
  function propagate(P, v) {
    for (;;) {
      let changed = false;
      for (let i = 0; i < v.length; i++) {
        if (v[i] !== 1) continue;
        for (const j of P.near[i]) {
          if (v[j] === 1) return false;
          if (v[j] < 0) { v[j] = 0; changed = true; }
        }
      }
      for (const u of P.units) {
        let s = 0, k = 0;
        for (const i of u) { if (v[i] === 1) s++; else if (v[i] < 0) k++; }
        if (s > STARS || s + k < STARS) return false;
        if (k && (s === STARS || s + k === STARS)) {
          const val = s === STARS ? 0 : 1;
          for (const i of u) if (v[i] < 0) v[i] = val;
          changed = true;
        }
      }
      if (!changed) return true;
    }
  }

  function fresh(P) { return new Int8Array(P.n * P.n).fill(-1); }
  function complete(v) { return !v.includes(-1); }

  // The usual human techniques on top of counting: (1) for each row/column/region, cells
  // that every remaining way of placing its stars rules out are empty, and cells in every
  // way are stars; (2) if k regions fit entirely inside k consecutive rows (or columns),
  // they take all of those rows' stars, so the rest of those rows is empty.
  function deduce(P, v) {
    for (;;) {
      if (!propagate(P, v)) return false;
      let changed = false;
      for (const u of P.units) {
        let s = 0;
        const cand = [];
        for (const i of u) { if (v[i] === 1) s++; else if (v[i] < 0) cand.push(i); }
        const need = STARS - s;
        if (!need) continue;
        const ways = [];
        if (need === 1) for (const a of cand) ways.push([a]);
        else for (let x = 0; x < cand.length; x++) for (let y = x + 1; y < cand.length; y++) {
          if (!P.near[cand[x]].includes(cand[y])) ways.push([cand[x], cand[y]]);
        }
        if (!ways.length) return false;
        let empty = null, star = null;
        for (const w of ways) {
          const off = new Set();
          for (const a of w) for (const j of P.near[a]) if (v[j] < 0) off.add(j);
          for (const a of cand) if (!w.includes(a)) off.add(a);
          empty = empty ? new Set([...empty].filter((j) => off.has(j))) : off;
          star = star ? new Set(w.filter((a) => star.has(a))) : new Set(w);
        }
        for (const j of empty) if (v[j] < 0) { v[j] = 0; changed = true; }
        for (const j of star) if (v[j] < 0) { v[j] = 1; changed = true; }
      }
      const n = P.n;
      for (const byRow of [true, false]) {
        const line = (i) => (byRow ? Math.floor(i / n) : i % n);
        for (let k = 1; k < n; k++) for (let a = 0; a + k <= n; a++) {
          const inside = new Set();
          for (let g = 0; g < n; g++) {
            if (P.units[2 * n + g].every((i) => !v[i] || (line(i) >= a && line(i) < a + k))) inside.add(g);
          }
          if (inside.size > k) return false;
          if (inside.size < k) continue;
          for (let i = 0; i < n * n; i++) {
            if (v[i] < 0 && line(i) >= a && line(i) < a + k && !inside.has(P.region[i])) { v[i] = 0; changed = true; }
          }
        }
      }
      if (!changed) return true;
    }
  }

  function basicSolve(P) { const v = fresh(P); return deduce(P, v) && complete(v); }

  // Those techniques plus single-cell probing ("if a star went here…"), no guessing.
  function logicSolve(P) {
    const v = fresh(P);
    if (!deduce(P, v)) return false;
    let progress = true;
    while (progress && !complete(v)) {
      progress = false;
      for (let i = 0; i < v.length; i++) {
        if (v[i] !== -1) continue;
        for (const guess of [1, 0]) {
          const t = v.slice();
          t[i] = guess;
          if (!deduce(P, t)) {
            v[i] = 1 - guess;
            if (!deduce(P, v)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return complete(v);
  }

  // Branch on an unknown cell of the unit with the fewest unknowns.
  function pickCell(P, v) {
    let best = -1, bestK = Infinity;
    for (const u of P.units) {
      let k = 0, cand = -1;
      for (const i of u) if (v[i] < 0) { k++; cand = i; }
      if (k && k < bestK) { bestK = k; best = cand; }
    }
    return best;
  }

  // Up to `limit` solutions; `complete: false` if the node budget ran out first.
  function findSolutions(P, limit, budget) {
    const sols = [];
    let ok = true;
    (function search(v) {
      if (sols.length >= limit || !ok) return;
      if (--budget < 0) { ok = false; return; }
      if (!propagate(P, v)) return;
      const i = pickCell(P, v);
      if (i < 0) { sols.push(v); return; }
      for (const guess of [1, 0]) {
        const t = v.slice();
        t[i] = guess;
        search(t);
      }
    })(fresh(P));
    return { sols, complete: ok };
  }

  // Two stars per row and column, none touching, chosen row by row.
  function randomStars(n, rng) {
    const rows = [], colCount = new Int8Array(n);
    const pairs = [];
    for (let a = 0; a < n; a++) for (let b = a + 2; b < n; b++) pairs.push([a, b]);
    (function place(r) {
      if (r === n) return true;
      const left = n - r;
      for (const [a, b] of Gamekit.shuffle(pairs.slice(), rng)) {
        if (colCount[a] >= STARS || colCount[b] >= STARS) continue;
        if (r && rows[r - 1].some((c) => Math.abs(c - a) <= 1 || Math.abs(c - b) <= 1)) continue;
        colCount[a]++; colCount[b]++;
        rows[r] = [a, b];
        // Every column still needs room for its remaining stars.
        let feasible = true;
        for (let c = 0; c < n && feasible; c++) if (STARS - colCount[c] > Math.ceil((left - 1) / 2)) feasible = false;
        if (feasible && place(r + 1)) return true;
        colCount[a]--; colCount[b]--;
      }
      return false;
    })(0);
    const stars = [];
    rows.forEach((cs, r) => cs.forEach((c) => stars.push(r * n + c)));
    return stars;
  }

  function orth(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  // Pair up nearby stars, join each pair with a path, then grow the regions to fill the grid.
  function randomRegions(n, stars, rng) {
    const region = new Int8Array(n * n).fill(-1), isStar = new Uint8Array(n * n);
    for (const s of stars) isStar[s] = 1;
    const left = Gamekit.shuffle(stars.slice(), rng);
    let g = 0;
    while (left.length) {
      const a = left.pop(), ar = Math.floor(a / n), ac = a % n;
      left.sort((x, y) => (Math.abs(Math.floor(y / n) - ar) + Math.abs(y % n - ac)) - (Math.abs(Math.floor(x / n) - ar) + Math.abs(x % n - ac)));
      const b = left.pop();
      // BFS from a to b through free, non-star cells.
      const prev = new Int16Array(n * n).fill(-2);
      prev[a] = -1;
      const queue = [a];
      while (queue.length && prev[b] === -2) {
        const x = queue.shift();
        for (const y of Gamekit.shuffle(orth(n, x), rng)) {
          if (prev[y] !== -2 || region[y] >= 0 || (isStar[y] && y !== b)) continue;
          prev[y] = x;
          queue.push(y);
        }
      }
      if (prev[b] === -2) return null;
      for (let x = b; x !== -1; x = prev[x]) region[x] = g;
      g++;
    }
    const size = new Int16Array(n);
    for (let i = 0; i < n * n; i++) if (region[i] >= 0) size[region[i]]++;
    for (;;) {
      const front = [];
      for (let i = 0; i < n * n; i++) {
        if (region[i] >= 0) continue;
        for (const j of orth(n, i)) if (region[j] >= 0) front.push([i, region[j]]);
      }
      if (!front.length) break;
      // Favour the smaller regions so sizes stay even-ish.
      Gamekit.shuffle(front, rng);
      front.sort((x, y) => size[x[1]] - size[y[1]]);
      const [i, rg] = front[Math.floor(rng() * Math.min(3, front.length))];
      region[i] = rg;
      size[rg]++;
    }
    return region;
  }

  function stillConnected(n, region, rg, without) {
    const cells = [];
    for (let i = 0; i < n * n; i++) if (region[i] === rg && i !== without) cells.push(i);
    if (!cells.length) return false;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const x = stack.pop();
      for (const y of orth(n, x)) if (y !== without && region[y] === rg && !seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return seen.size === cells.length;
  }

  // Move border cells between regions until only the intended solution is left:
  // reassigning a cell that holds a star in a rival solution breaks that rival.
  function makeUnique(n, region, isStar, rng, maxMoves) {
    for (let move = 0; move <= maxMoves; move++) {
      const P = buildPuzzle(n, region);
      const { sols, complete } = findSolutions(P, 2, 40000);
      if (!complete) return null;
      if (sols.length === 1) return P;
      const rival = sols.find((v) => !v.every((x, i) => x === isStar[i]));
      const cands = [];
      for (let i = 0; i < n * n; i++) {
        if (isStar[i] || rival[i] !== 1) continue;
        for (const j of orth(n, i)) if (region[j] !== region[i]) cands.push([i, region[j]]);
      }
      let done = false;
      for (const [i, to] of Gamekit.shuffle(cands, rng)) {
        if (!stillConnected(n, region, region[i], i)) continue;
        region[i] = to;
        done = true;
        break;
      }
      if (!done) return null;
    }
    return null;
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    return !basicSolve(P);
  }

  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      const stars = randomStars(n, rng);
      const region = randomRegions(n, stars, rng);
      if (!region) continue;
      const isStar = new Uint8Array(n * n);
      for (const s of stars) isStar[s] = 1;
      const P = makeUnique(n, region, isStar, rng, 40);
      if (!P) continue;
      P.solution = isStar;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const undoBtn  = document.getElementById("undo-btn");
  const EMPTY = 0, STAR = 1, DOT = 2;

  let P = null, state = null, history = [], won = false, cellEls = [];

  function start(P0) {
    P = P0;
    clear();
    build();
  }

  function clear() {
    state = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
  }

  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + n + ", 1fr)";
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, g = P.region[i];
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.i = i;
      let cls = "sb-cell r" + g;
      if (r === 0 || P.region[i - n] !== g) cls += " br-t";
      if (r === n - 1 || P.region[i + n] !== g) cls += " br-b";
      if (c === 0 || P.region[i - 1] !== g) cls += " br-l";
      if (c === n - 1 || P.region[i + 1] !== g) cls += " br-r";
      el.dataset.base = cls;
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    render();
  }

  // Stars that touch another star, or sit in a row/column/region with too many.
  function clashes() {
    const bad = new Set();
    for (let i = 0; i < state.length; i++) {
      if (state[i] !== STAR) continue;
      for (const j of P.near[i]) if (state[j] === STAR) { bad.add(i); bad.add(j); }
    }
    for (const u of P.units) {
      const s = u.filter((i) => state[i] === STAR);
      if (s.length > STARS) for (const i of s) bad.add(i);
    }
    return bad;
  }

  function render() {
    const n = P.n, bad = clashes();
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], s = state[i];
      el.className = el.dataset.base + (s === STAR ? " star" : s === DOT ? " dot" : "") + (bad.has(i) ? " err" : "") + (won && s === STAR ? " won" : "");
      el.textContent = s === STAR ? "★" : s === DOT ? "·" : "";
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", region " + (P.region[i] + 1) +
        (s === STAR ? ", star" : s === DOT ? ", marked empty" : "") + (bad.has(i) ? ", conflict" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(i, value) {
    if (won || state[i] === value) return;
    history.push(state.slice());
    state[i] = value;
    render();
    checkWin();
  }

  function checkWin() {
    for (const u of P.units) if (u.filter((i) => state[i] === STAR).length !== STARS) return;
    if (clashes().size) return;
    won = true;
    page.win();
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".sb-cell");
    if (!el) return;
    const i = parseInt(el.dataset.i, 10);
    set(i, (state[i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".sb-cell");
    e.preventDefault();
    if (!el) return;
    const i = parseInt(el.dataset.i, 10);
    set(i, state[i] === DOT ? EMPTY : DOT);
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    state = history.pop();
    render();
  });

  const page = Gamekit.puzzlePage({
    id: "star-battle",
    status: "2 stars per row, column, region.",
    generate,
    start,
    reset: () => { clear(); render(); },
  });
  window.addEventListener("load", () => Manpage.autoOpen("star-battle"));

  Gamekit.gridKeys(boardEl, { selector: ".sb-cell", onSecondary: (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })) });
})();
