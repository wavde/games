(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 6,  grade: "basic" },
    medium: { n: 8,  grade: "deduce" },
    hard:   { n: 10, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // n×n field with trees. Place one tent per tree, orthogonally next to it, so tents never
  // touch (not even diagonally) and every row and column holds its clued number of tents.
  // Solver state: s[i] = 0 unknown, 1 tent, 2 grass (trees and tree-less spots start as grass).

  const UNK = 0, TENT = 1, GRASS = 2;

  function puzzle(n, tree, rows, cols) {
    const orth = [], ring = [], trees = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, o = [], g = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        g.push(rr * n + cc);
        if (!dr || !dc) o.push(rr * n + cc);
      }
      orth.push(o);
      ring.push(g);
      if (tree[i]) trees.push(i);
    }
    const lines = [];
    for (let r = 0; r < n; r++) lines.push({ cells: Array.from({ length: n }, (_, c) => r * n + c), want: rows[r] });
    for (let c = 0; c < n; c++) lines.push({ cells: Array.from({ length: n }, (_, r) => r * n + c), want: cols[c] });
    return { n, tree: Uint8Array.from(tree), rows: Int8Array.from(rows), cols: Int8Array.from(cols), orth, ring, trees, lines };
  }

  // Kuhn's augmenting paths: can every left node get its own right node?
  function saturates(left, adj) {
    const owner = new Map();
    function augment(u, seen) {
      for (const v of adj(u)) {
        if (seen.has(v)) continue;
        seen.add(v);
        if (!owner.has(v) || augment(owner.get(v), seen)) { owner.set(v, u); return true; }
      }
      return false;
    }
    for (const u of left) if (!augment(u, new Set())) return false;
    return true;
  }

  // Every tree can still get its own tent, and every tent placed so far its own tree.
  function matchable(P, s) {
    if (!saturates(P.trees, (t) => P.orth[t].filter((j) => s[j] !== GRASS && !P.tree[j]))) return false;
    const tents = [];
    for (let i = 0; i < s.length; i++) if (s[i] === TENT) tents.push(i);
    return saturates(tents, (i) => P.orth[i].filter((j) => P.tree[j]));
  }

  function fresh(P) {
    const s = new Uint8Array(P.n * P.n);
    for (let i = 0; i < s.length; i++) if (P.tree[i] || !P.orth[i].some((j) => P.tree[j])) s[i] = GRASS;
    return s;
  }

  function propagate(P, s) {
    for (;;) {
      let changed = false;
      for (let i = 0; i < s.length; i++) {
        if (s[i] !== TENT) continue;
        for (const j of P.ring[i]) {
          if (s[j] === TENT) return false;
          if (s[j] === UNK) { s[j] = GRASS; changed = true; }
        }
      }
      for (const L of P.lines) {
        let t = 0, u = 0;
        for (const i of L.cells) { if (s[i] === TENT) t++; else if (s[i] === UNK) u++; }
        if (t > L.want || t + u < L.want) return false;
        if (u && (t === L.want || t + u === L.want)) {
          const v = t === L.want ? GRASS : TENT;
          for (const i of L.cells) if (s[i] === UNK) s[i] = v;
          changed = true;
        }
      }
      for (const t of P.trees) {
        let tents = 0, open = -1, k = 0;
        for (const j of P.orth[t]) {
          if (s[j] === TENT) tents++;
          else if (s[j] === UNK) { open = j; k++; }
        }
        if (!tents && !k) return false;
        if (!tents && k === 1) { s[open] = TENT; changed = true; }
      }
      if (!changed) return matchable(P, s);
    }
  }

  const solved = (s) => s.every((v) => v !== UNK);

  function basicSolve(P) { const s = fresh(P); return propagate(P, s) && solved(s); }

  // Propagation plus probing ("if a tent went here…"), no guessing.
  function logicSolve(P) {
    const s = fresh(P);
    if (!propagate(P, s)) return false;
    let progress = true;
    while (progress && !solved(s)) {
      progress = false;
      for (let i = 0; i < s.length; i++) {
        if (s[i] !== UNK) continue;
        for (const v of [TENT, GRASS]) {
          const t = s.slice();
          t[i] = v;
          if (!propagate(P, t)) {
            s[i] = v === TENT ? GRASS : TENT;
            if (!propagate(P, s)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return solved(s);
  }

  // Up to `limit` solutions; `complete: false` if the node budget ran out first.
  function findSolutions(P, limit, budget) {
    const sols = [];
    let ok = true;
    (function search(s) {
      if (sols.length >= limit || !ok) return;
      if (--budget < 0) { ok = false; return; }
      if (!propagate(P, s)) return;
      const i = s.indexOf(UNK);
      if (i < 0) { sols.push(s); return; }
      for (const v of [TENT, GRASS]) {
        const t = s.slice();
        t[i] = v;
        search(t);
      }
    })(fresh(P));
    return { sols, complete: ok };
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    if (basicSolve(P)) return false;
    const r = findSolutions(P, 2, 200000);
    return r.complete && r.sols.length === 1;
  }

  // Scatter tents that don't touch, each with a tree on one side, until about a fifth of
  // the field is tents; keep the first layout that grades right.
  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    const want = Math.round(n * n / 5);
    let fallback = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const tent = new Uint8Array(n * n), tree = new Uint8Array(n * n);
      let placed = 0;
      for (const i of Gamekit.shuffle(Array.from({ length: n * n }, (_, k) => k), rng)) {
        if (placed >= want) break;
        const r = Math.floor(i / n), c = i % n;
        if (tree[i]) continue;
        let clear = true;
        for (let dr = -1; dr <= 1 && clear; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n && tent[rr * n + cc]) { clear = false; break; }
        }
        if (!clear) continue;
        const spots = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
          .filter(([rr, cc]) => rr >= 0 && cc >= 0 && rr < n && cc < n && !tent[rr * n + cc] && !tree[rr * n + cc]);
        if (!spots.length) continue;
        const [tr, tc] = spots[Math.floor(rng() * spots.length)];
        tent[i] = 1;
        tree[tr * n + tc] = 1;
        placed++;
      }
      if (placed < want) continue;
      const rows = [], cols = [];
      for (let k = 0; k < n; k++) {
        let a = 0, b = 0;
        for (let j = 0; j < n; j++) { a += tent[k * n + j]; b += tent[j * n + k]; }
        rows.push(a);
        cols.push(b);
      }
      const P = puzzle(n, tree, rows, cols);
      P.solution = tent;
      if (fits(P, grade)) return P;
      if (!fallback && findSolutions(P, 2, 200000).sols.length === 1) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const STATUS = "One tent beside each tree; tents never touch.";
  const store = Gamekit.storage("tents:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });
  const NAME = ["empty", "tent", "grass"];

  let diff = "medium";
  let P = null, mark = null, history = [], won = false;
  let cellEls = [], rowEls = [], colEls = [], dailyDate = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("tents", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = generate(diff, seed);
    mark = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
    build();
    clock.start();
    statusEl.textContent = STATUS;
  }

  // (n + 1)² grid: column counts along the top, row counts down the left.
  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "0.7fr repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "0.7fr repeat(" + n + ", 1fr)";
    cellEls = new Array(n * n);
    rowEls = [];
    colEls = [];
    boardEl.appendChild(document.createElement("div"));
    for (let c = 0; c < n; c++) {
      const el = document.createElement("div");
      el.className = "tn-count";
      el.textContent = P.cols[c];
      colEls.push(el);
      boardEl.appendChild(el);
    }
    for (let r = 0; r < n; r++) {
      const el = document.createElement("div");
      el.className = "tn-count";
      el.textContent = P.rows[r];
      rowEls.push(el);
      boardEl.appendChild(el);
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        let cell;
        if (P.tree[i]) {
          cell = document.createElement("div");
          cell.className = "tn-tree";
          cell.setAttribute("role", "img");
          cell.setAttribute("aria-label", "Tree, row " + (r + 1) + " column " + (c + 1));
        } else {
          cell = document.createElement("button");
          cell.type = "button";
          cell.className = "tn-cell";
          cell.dataset.i = i;
        }
        cellEls[i] = cell;
        boardEl.appendChild(cell);
      }
    }
    render();
  }

  // Touching tents, and each count's state: 0 open, 1 met, 2 over.
  function check() {
    const touch = new Set();
    for (let i = 0; i < mark.length; i++) {
      if (mark[i] !== TENT) continue;
      for (const j of P.ring[i]) if (mark[j] === TENT) { touch.add(i); touch.add(j); }
    }
    const state = P.lines.map((L) => {
      const t = L.cells.filter((i) => mark[i] === TENT).length;
      return t > L.want ? 2 : t === L.want ? 1 : 0;
    });
    return { touch, state };
  }

  function render() {
    const n = P.n, { touch, state } = check();
    rowEls.forEach((el, r) => { el.className = "tn-count" + (state[r] === 1 ? " ok" : state[r] === 2 ? " bad" : ""); });
    colEls.forEach((el, c) => { el.className = "tn-count" + (state[n + c] === 1 ? " ok" : state[n + c] === 2 ? " bad" : ""); });
    for (let i = 0; i < n * n; i++) {
      if (P.tree[i]) continue;
      const el = cellEls[i], m = mark[i];
      el.className = "tn-cell" + (m === TENT ? " tent" : m === GRASS ? " grass" : "") + (touch.has(i) ? " err" : "");
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", " + NAME[m] +
        (touch.has(i) ? ", touching another tent" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(i, v) {
    if (won || P.tree[i] || mark[i] === v) return;
    history.push({ i, v: mark[i] });
    mark[i] = v;
    render();
    checkWin();
  }

  function checkWin() {
    const { touch, state } = check();
    if (touch.size || state.some((x) => x !== 1)) return;
    if (!matchable(P, mark.map((m) => (m === TENT ? TENT : GRASS)))) return;
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("tents", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".tn-cell");
    if (el) set(+el.dataset.i, (mark[+el.dataset.i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".tn-cell");
    if (!el) return;
    e.preventDefault();
    const i = +el.dataset.i;
    set(i, mark[i] === GRASS ? UNK : GRASS);
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    const h = history.pop();
    mark[h.i] = h.v;
    render();
  });

  resetBtn.addEventListener("click", () => {
    mark = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
    clock.start();
    statusEl.textContent = STATUS;
    render();
  });

  newBtn.addEventListener("click", () => newPuzzle(Gamekit.randomSeed()));

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newPuzzle(); },
  });
  diff = chips.get();

  newPuzzle();
  window.addEventListener("load", () => Manpage.autoOpen("tents"));

  Gamekit.gridKeys(boardEl, {
    selector: ".tn-cell",
    onSecondary: (el) => { const i = +el.dataset.i; set(i, mark[i] === GRASS ? UNK : GRASS); },
  });
})();
