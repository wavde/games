(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 6, grade: "basic" },
    medium: { n: 8, grade: "deduce" },
    hard:   { n: 9, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // n×n grid cut into n irregular regions of n cells. Every row, column, and region holds
  // 1..n once. Solver state: dom[i] = bitmask of values still possible (bit d = value d).

  const bits = Gamekit.bitCount;

  function orth(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  function connected(n, reg, k) {
    const cells = [];
    for (let i = 0; i < reg.length; i++) if (reg[i] === k) cells.push(i);
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) for (const j of orth(n, stack.pop())) if (reg[j] === k && !seen.has(j)) { seen.add(j); stack.push(j); }
    return seen.size === cells.length;
  }

  // Start with the rows as regions, then keep trading cells across region borders (one each
  // way, so sizes stay n) whenever both regions stay in one piece.
  function regions(n, rng) {
    const reg = new Int8Array(n * n);
    for (let i = 0; i < n * n; i++) reg[i] = Math.floor(i / n);
    for (let it = 0; it < n * n * 40; it++) {
      const a = Math.floor(rng() * n * n), nb = orth(n, a).filter((j) => reg[j] !== reg[a]);
      if (!nb.length) continue;
      const A = reg[a], B = reg[nb[Math.floor(rng() * nb.length)]];
      const cand = [];
      for (let c = 0; c < n * n; c++) if (reg[c] === B && orth(n, c).some((j) => reg[j] === A && j !== a)) cand.push(c);
      if (!cand.length) continue;
      const c = cand[Math.floor(rng() * cand.length)];
      reg[a] = B;
      reg[c] = A;
      if (!connected(n, reg, A) || !connected(n, reg, B)) { reg[a] = A; reg[c] = B; }
    }
    return reg;
  }

  function puzzle(n, reg, given) {
    const units = [];
    for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
    for (let k = 0; k < n; k++) units.push([]);
    for (let i = 0; i < n * n; i++) units[2 * n + reg[i]].push(i);
    const peers = Array.from({ length: n * n }, () => new Set());
    for (const u of units) for (const i of u) for (const j of u) if (i !== j) peers[i].add(j);
    return { n, reg: Int8Array.from(reg), given: Int8Array.from(given), units, peers: peers.map((s) => [...s]), full: (1 << (n + 1)) - 2 };
  }

  // Naked singles and hidden singles over rows, columns, and regions.
  function propagate(P, dom) {
    for (;;) {
      let changed = false;
      for (let i = 0; i < dom.length; i++) {
        if (!dom[i]) return false;
        if (bits(dom[i]) !== 1) continue;
        for (const j of P.peers[i]) {
          if (!(dom[j] & dom[i])) continue;
          dom[j] &= ~dom[i];
          if (!dom[j]) return false;
          changed = true;
        }
      }
      for (const u of P.units) {
        for (let d = 1; d <= P.n; d++) {
          let where = -1, k = 0;
          for (const i of u) if (dom[i] & (1 << d)) { where = i; k++; }
          if (!k) return false;
          if (k === 1 && dom[where] !== 1 << d) { dom[where] = 1 << d; changed = true; }
        }
      }
      if (!changed) return true;
    }
  }

  function fresh(P) {
    const dom = new Uint16Array(P.n * P.n).fill(P.full);
    P.given.forEach((v, i) => { if (v) dom[i] = 1 << v; });
    return dom;
  }
  const { basicSolve, logicSolve, findSolutions } = Gamekit.domainSolver({ propagate, fresh });

  // A random full grid for these regions: propagation plus search with shuffled values.
  function fill(P, rng, budget) {
    let out = null;
    (function search(dom) {
      if (out || --budget < 0 || !propagate(P, dom)) return;
      let best = -1, bestK = 99;
      for (let i = 0; i < dom.length; i++) {
        const k = bits(dom[i]);
        if (k > 1 && k < bestK) { bestK = k; best = i; }
      }
      if (best < 0) { out = Int8Array.from(dom, (m) => 31 - Math.clz32(m)); return; }
      const vals = [];
      for (let m = dom[best]; m; m &= m - 1) vals.push(m & -m);
      for (const v of Gamekit.shuffle(vals, rng)) {
        const t = dom.slice();
        t[best] = v;
        search(t);
        if (out) return;
      }
    })(fresh(P));
    return out;
  }

  function unique(P) {
    const r = findSolutions(P, 2, 3000);
    return r.complete && r.sols.length === 1;
  }

  // While the givens still meet the level: easy stays solvable by singles alone,
  // medium by look-ahead, hard just unique.
  function keeps(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return logicSolve(P);
    return unique(P);
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
    for (let attempt = 0; attempt < 60; attempt++) {
      const reg = regions(n, rng);
      const sol = fill(puzzle(n, reg, new Int8Array(n * n)), rng, 5000);
      if (!sol) continue;
      const given = Int8Array.from(sol);
      const base = puzzle(n, reg, given);
      let P = base;
      for (const i of Gamekit.shuffle(Array.from({ length: n * n }, (_, k) => k), rng)) {
        given[i] = 0;
        const P2 = Object.assign({}, base, { given: Int8Array.from(given) });
        if (keeps(P2, grade)) P = P2; else given[i] = sol[i];
      }
      P.solution = sol;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // Four tints so no two touching regions share one (greedy, most-connected first).
  function tints(P) {
    const n = P.n, adj = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < n * n; i++) for (const j of orth(n, i)) if (P.reg[i] !== P.reg[j]) adj[P.reg[i]].add(P.reg[j]);
    const col = new Int8Array(n).fill(-1);
    for (const k of Array.from({ length: n }, (_, k) => k).sort((a, b) => adj[b].size - adj[a].size)) {
      const used = new Set([...adj[k]].map((j) => col[j]));
      let c = 0;
      while (used.has(c)) c++;
      col[k] = c;
    }
    return col;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const padEl    = document.getElementById("pad");
  const undoBtn  = document.getElementById("undo-btn");
  const notesBtn = document.getElementById("notes-btn");

  let P = null, val = null, notes = null, history = [], won = false, sel = -1, noteMode = false;
  let cellEls = [];

  function start(P0) {
    P = P0;
    sel = -1;
    clear();
    build();
    Gamekit.numberPad(padEl, P.n, enter);
  }

  function clear() {
    val = Uint8Array.from(P.given);
    notes = new Uint16Array(P.n * P.n);
    history = [];
    won = false;
  }

  function build() {
    const n = P.n, tint = tints(P);
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + n + ", 1fr)";
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, k = P.reg[i];
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.i = i;
      el.dataset.t = tint[k];
      let edge = "";
      if (r === 0 || P.reg[i - n] !== k) edge += " et";
      if (r === n - 1 || P.reg[i + n] !== k) edge += " eb";
      if (c === 0 || P.reg[i - 1] !== k) edge += " el";
      if (c === n - 1 || P.reg[i + 1] !== k) edge += " er";
      el.dataset.edge = edge;
      cellEls.push(el);
      boardEl.appendChild(el);
    }
    render();
  }

  function repeats() {
    const bad = new Set();
    for (const u of P.units) {
      const seen = new Map();
      for (const i of u) {
        if (!val[i]) continue;
        if (seen.has(val[i])) { bad.add(i); bad.add(seen.get(val[i])); } else seen.set(val[i], i);
      }
    }
    return bad;
  }

  function render() {
    const n = P.n, bad = repeats();
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], v = val[i], given = !!P.given[i];
      el.className = "jg-cell" + el.dataset.edge + (given ? " given" : "") + (i === sel ? " sel" : "") + (bad.has(i) ? " err" : "");
      el.innerHTML = "";
      if (v) {
        const s = document.createElement("span");
        s.className = "jg-v";
        s.dataset.d = v;
        el.appendChild(s);
      } else if (notes[i]) {
        const box = document.createElement("span");
        box.className = "jg-notes";
        for (let d = 1; d <= n; d++) {
          const s = document.createElement("span");
          if (notes[i] & (1 << d)) s.dataset.d = d;
          box.appendChild(s);
        }
        el.appendChild(box);
      }
      const marks = [];
      for (let d = 1; d <= n; d++) if (notes[i] & (1 << d)) marks.push(d);
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", region " + (P.reg[i] + 1) +
        (given ? ", given " + v : v ? ", " + v : marks.length ? ", notes " + marks.join(" ") : ", empty") + (bad.has(i) ? ", repeated" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
    notesBtn.setAttribute("aria-pressed", noteMode ? "true" : "false");
  }

  function enter(d) {
    if (won || sel < 0 || d > P.n || P.given[sel]) return;
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
    if (val.some((v) => !v) || repeats().size) return;
    won = true;
    page.win();
    render();
  }

  function select(i) {
    if (sel === i) return;
    sel = i;
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".jg-cell");
    if (el) select(+el.dataset.i);
  });
  boardEl.addEventListener("focusin", (e) => {
    const el = e.target.closest(".jg-cell");
    if (el) select(+el.dataset.i);
  });

  notesBtn.addEventListener("click", () => { if (!P) return; noteMode = !noteMode; render(); });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    const k = e.key;
    if (k >= "1" && k <= "9") { enter(+k); e.preventDefault(); }
    else if (k === "Backspace" || k === "Delete" || k === "0") { enter(0); e.preventDefault(); }
    else if ((k === "n" || k === "N") && P) { noteMode = !noteMode; render(); e.preventDefault(); }
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    const h = history.pop();
    val[h.i] = h.v;
    notes[h.i] = h.notes;
    render();
  });

  const page = Gamekit.puzzlePage({
    id: "jigsaw-sudoku",
    status: "Each row, column, and region holds 1 to n once.",
    generate,
    start,
    reset: () => { clear(); render(); },
  });
  window.addEventListener("load", () => Manpage.autoOpen("jigsaw-sudoku"));

  Gamekit.gridKeys(boardEl, { selector: ".jg-cell" });
})();
