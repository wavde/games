(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 7,  density: 0.2,  grade: "basic" },
    medium: { n: 9,  density: 0.2,  grade: "deduce" },
    hard:   { n: 11, density: 0.19, grade: "deep" },
  };
  const WHITE = -2, WALL = -1;

  // ---------- generator + solver (no DOM) ----------

  // cell[i]: WHITE, WALL (no clue), or 0..4 (numbered wall).
  function buildPuzzle(n, cell) {
    const segs = [], rowSeg = new Int16Array(n * n).fill(-1), colSeg = new Int16Array(n * n).fill(-1);
    for (let r = 0; r < n; r++) {
      let cur = -1;
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (cell[i] !== WHITE) { cur = -1; continue; }
        if (cur < 0) { cur = segs.length; segs.push([]); }
        segs[cur].push(i); rowSeg[i] = cur;
      }
    }
    for (let c = 0; c < n; c++) {
      let cur = -1;
      for (let r = 0; r < n; r++) {
        const i = r * n + c;
        if (cell[i] !== WHITE) { cur = -1; continue; }
        if (cur < 0) { cur = segs.length; segs.push([]); }
        segs[cur].push(i); colSeg[i] = cur;
      }
    }
    const whites = [], numbered = [], adj = new Map();
    for (let i = 0; i < n * n; i++) {
      if (cell[i] === WHITE) whites.push(i);
      else if (cell[i] >= 0) {
        numbered.push(i);
        const r = Math.floor(i / n), c = i % n, list = [];
        for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n && cell[rr * n + cc] === WHITE) list.push(rr * n + cc);
        }
        adj.set(i, list);
      }
    }
    return { n, cell: Int8Array.from(cell), segs, rowSeg, colSeg, whites, numbered, adj };
  }

  function isLit(P, v, c) {
    for (const x of P.segs[P.rowSeg[c]]) if (v[x] === 1) return true;
    for (const x of P.segs[P.colSeg[c]]) if (v[x] === 1) return true;
    return false;
  }

  // v[i]: -1 unknown, 0 no bulb, 1 bulb. Applies forced moves to a fixpoint; false on contradiction.
  function propagate(P, v) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const seg of P.segs) {
        let b = 0;
        for (const c of seg) if (v[c] === 1) b++;
        if (b > 1) return false;
        if (b === 1) for (const c of seg) if (v[c] === -1) { v[c] = 0; changed = true; }
      }
      for (const w of P.numbered) {
        const num = P.cell[w], list = P.adj.get(w);
        let b = 0, u = 0;
        for (const c of list) { if (v[c] === 1) b++; else if (v[c] === -1) u++; }
        if (b > num || b + u < num) return false;
        if (u && (b === num || b + u === num)) {
          const val = b === num ? 0 : 1;
          for (const c of list) if (v[c] === -1) { v[c] = val; changed = true; }
        }
      }
      for (const c of P.whites) {
        if (isLit(P, v, c)) continue;
        let k = 0, cand = -1;
        for (const x of P.segs[P.rowSeg[c]]) if (v[x] === -1) { k++; cand = x; }
        for (const x of P.segs[P.colSeg[c]]) if (x !== c && v[x] === -1) { k++; cand = x; }
        if (!k) return false;
        if (k === 1) { v[cand] = 1; changed = true; }
      }
    }
    return true;
  }

  function fresh(P) { const v = new Int8Array(P.n * P.n).fill(0); for (const c of P.whites) v[c] = -1; return v; }
  function complete(P, v) { return P.whites.every(c => v[c] !== -1); }

  function basicSolve(P) { const v = fresh(P); return propagate(P, v) && complete(P, v); }

  // Deduction with single-cell probing ("if this were a bulb…"), no guessing.
  function logicSolve(P) {
    const v = fresh(P);
    if (!propagate(P, v)) return false;
    let progress = true;
    while (progress && !complete(P, v)) {
      progress = false;
      for (const c of P.whites) {
        if (v[c] !== -1) continue;
        for (const guess of [1, 0]) {
          const t = v.slice();
          t[c] = guess;
          if (!propagate(P, t)) {
            v[c] = 1 - guess;
            if (!propagate(P, v)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return complete(P, v);
  }

  // Counts solutions up to `limit`; reports `limit` if the node budget runs out.
  function countSolutions(P, limit, budget) {
    let count = 0;
    (function search(v) {
      if (count >= limit) return;
      if (--budget < 0) { count = limit; return; }
      if (!propagate(P, v)) return;
      const c = P.whites.find(x => v[x] === -1);
      if (c === undefined) { count++; return; }
      for (const guess of [1, 0]) {
        const t = v.slice();
        t[c] = guess;
        search(t);
        if (count >= limit) return;
      }
    })(fresh(P));
    return count;
  }

  // Symmetric walls, a random full lighting, then every wall numbered.
  function layout(n, density, rng) {
    const cell = new Int8Array(n * n).fill(WHITE);
    for (let i = 0; i < Math.ceil(n * n / 2); i++) if (rng() < density) cell[i] = cell[n * n - 1 - i] = WALL;
    const P0 = buildPuzzle(n, cell);
    if (P0.whites.length < n * n / 2) return null;
    const lit = new Uint8Array(n * n), bulb = new Uint8Array(n * n);
    for (const c of Gamekit.shuffle(P0.whites.slice(), rng)) {
      if (lit[c]) continue;
      bulb[c] = 1;
      for (const x of P0.segs[P0.rowSeg[c]]) lit[x] = 1;
      for (const x of P0.segs[P0.colSeg[c]]) lit[x] = 1;
    }
    for (let i = 0; i < n * n; i++) {
      if (cell[i] === WHITE) continue;
      const r = Math.floor(i / n), c = i % n;
      let k = 0;
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n && bulb[rr * n + cc]) k++;
      }
      cell[i] = k;
    }
    return cell;
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return logicSolve(P);
    return countSolutions(P, 2, 20000) === 1;
  }

  // Start fully clued, then hide numbers one at a time while the grade still holds.
  // Medium and hard must also need more than the direct rules.
  function generate(diffName, seed) {
    const { n, density, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null, last = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const cell = layout(n, density, rng);
      if (!cell) continue;
      let P = buildPuzzle(n, cell);
      last = P;
      if (!fits(P, grade)) continue;
      for (const w of Gamekit.shuffle(P.numbered.slice(), rng)) {
        const saved = cell[w];
        cell[w] = WALL;
        const P2 = buildPuzzle(n, cell);
        if (fits(P2, grade)) P = P2; else cell[w] = saved;
      }
      if (grade === "basic" || !basicSolve(P)) return P;
      if (!fallback) fallback = P;
    }
    return fallback || last;
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
  const STATUS = "Light every white cell.";
  const EMPTY = 0, BULB = 1, MARK = 2;
  const store = Gamekit.storage("akari:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });

  let diff = "medium";
  let P = null, state = null, history = [], won = false, cellEls = [];
  let dailyDate = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("akari", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = generate(diff, seed);
    state = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
    build();
    clock.start();
    statusEl.textContent = STATUS;
  }

  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--n", n);
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const v = P.cell[i];
      let el;
      if (v === WHITE) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "ak-cell";
        el.dataset.i = i;
      } else {
        el = document.createElement("div");
        el.className = "ak-wall";
        if (v >= 0) el.textContent = v;
      }
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    render();
  }

  function bulbs() { const v = new Int8Array(P.n * P.n); for (let i = 0; i < v.length; i++) v[i] = state[i] === BULB ? 1 : 0; return v; }

  function render() {
    const v = bulbs(), n = P.n;
    for (const c of P.whites) {
      const el = cellEls[c];
      let clash = false;
      if (state[c] === BULB) {
        for (const x of P.segs[P.rowSeg[c]]) if (x !== c && v[x]) clash = true;
        for (const x of P.segs[P.colSeg[c]]) if (x !== c && v[x]) clash = true;
      }
      el.className = "ak-cell" + (isLit(P, v, c) ? " lit" : "") + (state[c] === BULB ? " bulb" : state[c] === MARK ? " mark" : "") + (clash ? " clash" : "");
      el.setAttribute("aria-label", "Row " + (Math.floor(c / n) + 1) + " column " + (c % n + 1) + (state[c] === BULB ? ", bulb" : state[c] === MARK ? ", marked empty" : "") + (isLit(P, v, c) ? ", lit" : ""));
    }
    for (const w of P.numbered) {
      let b = 0;
      for (const c of P.adj.get(w)) if (v[c]) b++;
      cellEls[w].className = "ak-wall" + (b === P.cell[w] ? " ok" : b > P.cell[w] ? " over" : "");
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(c, value) {
    if (won || state[c] === value) return;
    history.push(state.slice());
    state[c] = value;
    render();
    checkWin();
  }

  function checkWin() {
    const v = bulbs();
    for (const seg of P.segs) { let b = 0; for (const c of seg) b += v[c]; if (b > 1) return; }
    for (const w of P.numbered) { let b = 0; for (const c of P.adj.get(w)) b += v[c]; if (b !== P.cell[w]) return; }
    if (!P.whites.every(c => isLit(P, v, c))) return;
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("akari", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + '.</span>';
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".ak-cell");
    if (!el) return;
    const c = parseInt(el.dataset.i, 10);
    set(c, (state[c] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".ak-cell");
    e.preventDefault();
    if (!el) return;
    const c = parseInt(el.dataset.i, 10);
    set(c, state[c] === MARK ? EMPTY : MARK);
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    state = history.pop();
    render();
  });

  resetBtn.addEventListener("click", () => {
    state = new Uint8Array(P.n * P.n);
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
  window.addEventListener("load", () => Manpage.autoOpen("akari"));

  Gamekit.gridKeys(boardEl, { selector: ".ak-cell", onSecondary: (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })) });
})();
