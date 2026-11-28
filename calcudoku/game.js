(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 4, maxCage: 3, singles: 2, grade: "basic" },
    medium: { n: 5, maxCage: 3, singles: 1, grade: "deduce" },
    hard:   { n: 6, maxCage: 4, singles: 1, grade: "deep" },
  };
  const OP_SIGN = { "=": "", "+": "+", "-": "−", "*": "×", "/": "÷" };
  const OP_WORD = { "=": "", "+": " plus", "-": " minus", "*": " times", "/": " divided" };

  // ---------- generator + solver (no DOM) ----------
  // An n×n Latin square split into cages; each cage gives a target and an operation.
  // Solver state: dom[i] = bitmask of digits 1..n still possible for cell i.

  const bits = (m) => { let k = 0; for (; m; m &= m - 1) k++; return k; };

  function holds(op, target, vals) {
    if (op === "=") return vals[0] === target;
    if (op === "+") return vals.reduce((a, b) => a + b, 0) === target;
    if (op === "*") return vals.reduce((a, b) => a * b, 1) === target;
    const hi = Math.max(vals[0], vals[1]), lo = Math.min(vals[0], vals[1]);
    return op === "-" ? hi - lo === target : hi === lo * target;
  }

  // Every digit assignment that meets the cage's arithmetic, with no repeat between cells
  // of the cage that share a row or column.
  function cageTuples(n, cells, op, target) {
    const out = [], vals = new Array(cells.length);
    const clash = (a, b) => Math.floor(a / n) === Math.floor(b / n) || a % n === b % n;
    (function rec(j) {
      if (j === cells.length) { if (holds(op, target, vals)) out.push(vals.slice()); return; }
      for (let d = 1; d <= n; d++) {
        let ok = true;
        for (let m = 0; m < j && ok; m++) if (vals[m] === d && clash(cells[m], cells[j])) ok = false;
        if (!ok) continue;
        vals[j] = d;
        rec(j + 1);
      }
    })(0);
    return out;
  }

  function puzzle(n, cages) {
    const units = [];
    for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
    const cageOf = new Int16Array(n * n);
    cages.forEach((g, k) => {
      for (const i of g.cells) cageOf[i] = k;
      g.tuples = cageTuples(n, g.cells, g.op, g.target);
    });
    return { n, cages, units, cageOf, full: ((1 << (n + 1)) - 2) };
  }

  // Narrows domains to a fixpoint; false on contradiction.
  function propagate(P, dom) {
    for (;;) {
      let changed = false;
      for (const g of P.cages) {
        const allowed = new Array(g.cells.length).fill(0);
        let any = false;
        for (const t of g.tuples) {
          let ok = true;
          for (let j = 0; j < t.length && ok; j++) if (!(dom[g.cells[j]] & (1 << t[j]))) ok = false;
          if (!ok) continue;
          any = true;
          for (let j = 0; j < t.length; j++) allowed[j] |= 1 << t[j];
        }
        if (!any) return false;
        g.cells.forEach((i, j) => {
          const d = dom[i] & allowed[j];
          if (d !== dom[i]) { dom[i] = d; changed = true; }
        });
      }
      for (const u of P.units) {
        for (const i of u) {
          if (bits(dom[i]) !== 1) continue;
          for (const j of u) {
            if (j === i || !(dom[j] & dom[i])) continue;
            dom[j] &= ~dom[i];
            if (!dom[j]) return false;
            changed = true;
          }
        }
        for (let d = 1; d <= P.n; d++) {
          const bit = 1 << d;
          let where = -1, count = 0;
          for (const i of u) if (dom[i] & bit) { where = i; count++; }
          if (!count) return false;
          if (count === 1 && dom[where] !== bit) { dom[where] = bit; changed = true; }
        }
      }
      if (!changed) return true;
    }
  }

  function fresh(P) { return new Uint16Array(P.n * P.n).fill(P.full); }
  function solved(dom) { return dom.every((m) => bits(m) === 1); }

  function basicSolve(P) { const dom = fresh(P); return propagate(P, dom) && solved(dom); }

  // Cage and line logic plus single-digit probing ("if this were a 3…"), no guessing.
  function logicSolve(P) {
    const dom = fresh(P);
    if (!propagate(P, dom)) return false;
    let progress = true;
    while (progress && !solved(dom)) {
      progress = false;
      for (let i = 0; i < dom.length; i++) {
        if (bits(dom[i]) === 1) continue;
        for (let m = dom[i]; m; m &= m - 1) {
          const bit = m & -m, t = dom.slice();
          t[i] = bit;
          if (!propagate(P, t)) {
            dom[i] &= ~bit;
            if (!propagate(P, dom)) return false;
            progress = true;
          }
        }
      }
    }
    return solved(dom);
  }

  // Up to `limit` solutions; `complete: false` if the node budget ran out first.
  function findSolutions(P, limit, budget) {
    const sols = [];
    let ok = true;
    (function search(dom) {
      if (sols.length >= limit || !ok) return;
      if (--budget < 0) { ok = false; return; }
      if (!propagate(P, dom)) return;
      let best = -1, bestK = 99;
      for (let i = 0; i < dom.length; i++) {
        const k = bits(dom[i]);
        if (k > 1 && k < bestK) { bestK = k; best = i; }
      }
      if (best < 0) { sols.push(dom); return; }
      for (let m = dom[best]; m; m &= m - 1) {
        const t = dom.slice();
        t[best] = m & -m;
        search(t);
      }
    })(fresh(P));
    return { sols, complete: ok };
  }

  function latin(n, rng) {
    const g = new Int8Array(n * n);
    (function fill(i) {
      if (i === n * n) return true;
      const r = Math.floor(i / n), c = i % n;
      for (const d of Gamekit.shuffle(Array.from({ length: n }, (_, k) => k + 1), rng)) {
        let ok = true;
        for (let k = 0; k < c && ok; k++) if (g[r * n + k] === d) ok = false;
        for (let k = 0; k < r && ok; k++) if (g[k * n + c] === d) ok = false;
        if (!ok) continue;
        g[i] = d;
        if (fill(i + 1)) return true;
      }
      g[i] = 0;
      return false;
    })(0);
    return g;
  }

  function orth(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  // Grow random cages, then fold surplus single cells into a neighbouring cage.
  function partition(n, maxCage, singles, rng) {
    const cageOf = new Int16Array(n * n).fill(-1), cages = [];
    for (const s of Gamekit.shuffle(Array.from({ length: n * n }, (_, i) => i), rng)) {
      if (cageOf[s] >= 0) continue;
      const x = rng(), want = Math.min(maxCage, x < 0.08 ? 1 : x < 0.55 ? 2 : x < 0.85 ? 3 : 4);
      const cells = [s];
      cageOf[s] = cages.length;
      while (cells.length < want) {
        const front = [];
        for (const c of cells) for (const y of orth(n, c)) if (cageOf[y] < 0) front.push(y);
        if (!front.length) break;
        const y = front[Math.floor(rng() * front.length)];
        cageOf[y] = cages.length;
        cells.push(y);
      }
      cages.push(cells);
    }
    let ones = cages.filter((c) => c.length === 1).length;
    for (let k = 0; k < cages.length && ones > singles; k++) {
      if (cages[k].length !== 1) continue;
      const i = cages[k][0];
      const into = orth(n, i).map((y) => cageOf[y]).filter((g) => cages[g].length > 1 && cages[g].length <= maxCage)
        .sort((a, b) => cages[a].length - cages[b].length)[0];
      if (into === undefined) continue;
      cages[into].push(i);
      cageOf[i] = into;
      cages[k] = [];
      ones--;
    }
    return cages.filter((c) => c.length).map((c) => c.sort((a, b) => a - b));
  }

  function chooseOp(vals, rng) {
    if (vals.length === 1) return { op: "=", target: vals[0] };
    if (vals.length === 2) {
      const hi = Math.max(vals[0], vals[1]), lo = Math.min(vals[0], vals[1]), x = rng();
      if (hi % lo === 0 && x < 0.5) return { op: "/", target: hi / lo };
      if (x < 0.75) return { op: "-", target: hi - lo };
      return x < 0.88 ? { op: "+", target: hi + lo } : { op: "*", target: hi * lo };
    }
    return rng() < 0.6 ? { op: "+", target: vals.reduce((a, b) => a + b, 0) } : { op: "*", target: vals.reduce((a, b) => a * b, 1) };
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    return !basicSolve(P);
  }

  function generate(diffName, seed) {
    const { n, maxCage, singles, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 600; attempt++) {
      const sol = latin(n, rng);
      const cages = partition(n, maxCage, singles, rng).map((cells) => Object.assign({ cells }, chooseOp(cells.map((i) => sol[i]), rng)));
      const P = puzzle(n, cages);
      const r = findSolutions(P, 2, 4000);
      if (!r.complete || r.sols.length !== 1) continue;
      P.solution = sol;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const padEl    = document.getElementById("pad");
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const notesBtn = document.getElementById("notes-btn");
  const chipsEl  = document.getElementById("chips");
  const STATUS = "Fill each cage to its target.";
  const store = Gamekit.storage("calcudoku:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });

  let diff = "medium";
  let P = null, val = null, notes = null, history = [], won = false, sel = -1, noteMode = false, cellEls = [], dailyDate = null;

  const cageText = (g) => g.target + OP_SIGN[g.op];

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("calcudoku", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = generate(diff, seed);
    val = new Uint8Array(P.n * P.n);
    notes = new Uint16Array(P.n * P.n);
    history = [];
    won = false;
    sel = -1;
    build();
    buildPad();
    clock.start();
    statusEl.textContent = STATUS;
  }

  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + n + ", 1fr)";
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, g = P.cageOf[i];
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.i = i;
      let cls = "cg-cell";
      if (r === 0 || P.cageOf[i - n] !== g) cls += " br-t";
      if (r === n - 1 || P.cageOf[i + n] !== g) cls += " br-b";
      if (c === 0 || P.cageOf[i - 1] !== g) cls += " br-l";
      if (c === n - 1 || P.cageOf[i + 1] !== g) cls += " br-r";
      el.dataset.base = cls;
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    render();
  }

  function buildPad() {
    padEl.innerHTML = "";
    padEl.style.gridTemplateColumns = "repeat(" + (P.n + 1) + ", 1fr)";
    for (let d = 1; d <= P.n; d++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = d;
      b.addEventListener("click", () => enter(d));
      padEl.appendChild(b);
    }
    const erase = document.createElement("button");
    erase.type = "button";
    erase.className = "btn";
    erase.textContent = "⌫";
    erase.setAttribute("aria-label", "Erase");
    erase.addEventListener("click", () => enter(0));
    padEl.appendChild(erase);
  }

  // Repeats in a row/column, and the state of each cage: 0 open, 1 full and right, 2 wrong.
  function check() {
    const bad = new Set(), cage = P.cages.map(() => 0);
    for (const u of P.units) {
      const seen = new Map();
      for (const i of u) {
        if (!val[i]) continue;
        if (seen.has(val[i])) { bad.add(i); bad.add(seen.get(val[i])); } else seen.set(val[i], i);
      }
    }
    P.cages.forEach((g, k) => {
      const vs = g.cells.map((i) => val[i]);
      if (vs.every((v) => v)) cage[k] = holds(g.op, g.target, vs) ? 1 : 2;
    });
    return { bad, cage };
  }

  function render() {
    const n = P.n, { bad, cage } = check();
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], v = val[i], k = P.cageOf[i], g = P.cages[k];
      el.className = el.dataset.base + (i === sel ? " sel" : "") + (bad.has(i) ? " err" : "") + (won ? " won" : "");
      el.innerHTML = "";
      if (g.cells[0] === i) {
        const lab = document.createElement("span");
        lab.className = "cg-lab" + (cage[k] === 1 ? " ok" : cage[k] === 2 ? " bad" : "");
        lab.dataset.t = cageText(g);
        el.appendChild(lab);
      }
      if (v) {
        const s = document.createElement("span");
        s.className = "cg-v";
        s.dataset.d = v;
        el.appendChild(s);
      } else if (notes[i]) {
        const box = document.createElement("span");
        box.className = "cg-notes";
        for (let d = 1; d <= n; d++) {
          const s = document.createElement("span");
          if (notes[i] & (1 << d)) s.dataset.d = d;
          box.appendChild(s);
        }
        el.appendChild(box);
      }
      const marks = [];
      for (let d = 1; d <= n; d++) if (notes[i] & (1 << d)) marks.push(d);
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) +
        ", cage " + g.target + OP_WORD[g.op] + " in " + g.cells.length + (g.cells.length === 1 ? " cell" : " cells") +
        (v ? ", " + v : marks.length ? ", notes " + marks.join(" ") : ", empty") + (bad.has(i) ? ", repeated" : "") +
        (cage[k] === 2 ? ", cage wrong" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
    notesBtn.setAttribute("aria-pressed", noteMode ? "true" : "false");
  }

  function enter(d) {
    if (won || sel < 0 || d > P.n) return;
    const before = { i: sel, v: val[sel], notes: notes[sel] };
    if (!d) { val[sel] = 0; notes[sel] = 0; }
    else if (noteMode && !val[sel]) notes[sel] ^= 1 << d;
    else val[sel] = val[sel] === d ? 0 : d;
    if (val[before.i] === before.v && notes[before.i] === before.notes) return;
    history.push(before);
    render();
    checkWin();
  }

  function checkWin() {
    if (val.some((v) => !v)) return;
    const { bad, cage } = check();
    if (bad.size || cage.some((c) => c !== 1)) return;
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("calcudoku", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
    render();
  }

  function select(i) {
    if (sel === i) return;
    sel = i;
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".cg-cell");
    if (el) select(+el.dataset.i);
  });
  boardEl.addEventListener("focusin", (e) => {
    const el = e.target.closest(".cg-cell");
    if (el) select(+el.dataset.i);
  });

  notesBtn.addEventListener("click", () => { noteMode = !noteMode; render(); });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    const k = e.key;
    if (k >= "1" && k <= "9") { enter(+k); e.preventDefault(); }
    else if (k === "Backspace" || k === "Delete" || k === "0") { enter(0); e.preventDefault(); }
    else if (k === "n" || k === "N") { noteMode = !noteMode; render(); e.preventDefault(); }
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    const h = history.pop();
    val[h.i] = h.v;
    notes[h.i] = h.notes;
    render();
  });

  resetBtn.addEventListener("click", () => {
    val = new Uint8Array(P.n * P.n);
    notes = new Uint16Array(P.n * P.n);
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
  window.addEventListener("load", () => Manpage.autoOpen("calcudoku"));

  Gamekit.gridKeys(boardEl, { selector: ".cg-cell" });
})();
