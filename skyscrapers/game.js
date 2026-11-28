(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 4, grade: "basic" },
    medium: { n: 5, grade: "deduce" },
    hard:   { n: 6, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // An n×n Latin square of building heights 1..n. clue[k] (0 = none) counts the buildings
  // visible from one edge: k = c top, n + c bottom, 2n + r left, 3n + r right.
  // Solver state: dom[i] = bitmask of heights still possible for cell i.

  const bits = (m) => { let k = 0; for (; m; m &= m - 1) k++; return k; };

  function visible(a) {
    let top = 0, k = 0;
    for (const v of a) if (v > top) { top = v; k++; }
    return k;
  }

  // Every ordering of 1..n with how many buildings show from each end.
  const PERMS = {};
  function permsFor(n) {
    if (PERMS[n]) return PERMS[n];
    const out = [], a = Array.from({ length: n }, (_, i) => i + 1);
    (function rec(k) {
      if (k === n) { out.push({ a: a.slice(), f: visible(a), b: visible(a.slice().reverse()) }); return; }
      for (let j = k; j < n; j++) {
        [a[k], a[j]] = [a[j], a[k]];
        rec(k + 1);
        [a[k], a[j]] = [a[j], a[k]];
      }
    })(0);
    return (PERMS[n] = out);
  }

  function puzzle(n, clue) {
    const lines = [], all = permsFor(n);
    for (let c = 0; c < n; c++) lines.push({ cells: Array.from({ length: n }, (_, r) => r * n + c), front: c, back: n + c });
    for (let r = 0; r < n; r++) lines.push({ cells: Array.from({ length: n }, (_, c) => r * n + c), front: 2 * n + r, back: 3 * n + r });
    for (const L of lines) {
      const f = clue[L.front], b = clue[L.back];
      L.perms = all.filter((p) => (!f || p.f === f) && (!b || p.b === b));
    }
    return { n, clue: Int8Array.from(clue), lines, full: (1 << (n + 1)) - 2 };
  }

  // Keeps, for every line, only the orderings that fit its clues and the current domains.
  function propagate(P, dom) {
    for (;;) {
      let changed = false;
      for (const L of P.lines) {
        const allowed = new Array(P.n).fill(0);
        let any = false;
        for (const p of L.perms) {
          let ok = true;
          for (let j = 0; j < P.n && ok; j++) if (!(dom[L.cells[j]] & (1 << p.a[j]))) ok = false;
          if (!ok) continue;
          any = true;
          for (let j = 0; j < P.n; j++) allowed[j] |= 1 << p.a[j];
        }
        if (!any) return false;
        L.cells.forEach((i, j) => {
          const d = dom[i] & allowed[j];
          if (d !== dom[i]) { dom[i] = d; changed = true; }
        });
      }
      if (!changed) return true;
    }
  }

  function fresh(P) { return new Uint16Array(P.n * P.n).fill(P.full); }
  function solved(dom) { return dom.every((m) => bits(m) === 1); }

  function basicSolve(P) { const dom = fresh(P); return propagate(P, dom) && solved(dom); }

  // Line logic plus single-height probing ("if this were a 4…"), no guessing.
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

  function unique(P) {
    const r = findSolutions(P, 2, 20000);
    return r.complete && r.sols.length === 1;
  }

  // While the clue set still meets the level: easy stays solvable by line logic alone,
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

  // Start with every clue, then hide clues one at a time while the level still holds.
  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const sol = latin(n, rng), clue = new Int8Array(4 * n);
      for (let c = 0; c < n; c++) {
        const col = Array.from({ length: n }, (_, r) => sol[r * n + c]);
        clue[c] = visible(col);
        clue[n + c] = visible(col.slice().reverse());
      }
      for (let r = 0; r < n; r++) {
        const row = Array.from(sol.slice(r * n, r * n + n));
        clue[2 * n + r] = visible(row);
        clue[3 * n + r] = visible(row.slice().reverse());
      }
      let P = puzzle(n, clue);
      if (!keeps(P, grade)) continue;
      for (const k of Gamekit.shuffle(Array.from({ length: 4 * n }, (_, i) => i), rng)) {
        const saved = clue[k];
        clue[k] = 0;
        const P2 = puzzle(n, clue);
        if (keeps(P2, grade)) P = P2; else clue[k] = saved;
      }
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
  const STATUS = "Each clue counts the towers it sees.";
  const store = Gamekit.storage("skyscrapers:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });

  let diff = "medium";
  let P = null, val = null, notes = null, history = [], won = false, sel = -1, noteMode = false;
  let cellEls = [], clueEls = [], dailyDate = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("skyscrapers", diff);
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

  // The board is (n + 2)² with clue cells around the edge.
  function build() {
    const n = P.n, S = n + 2;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + S + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + S + ", 1fr)";
    cellEls = new Array(n * n);
    clueEls = new Array(4 * n);
    for (let R = 0; R < S; R++) for (let C = 0; C < S; C++) {
      const r = R - 1, c = C - 1;
      let k = -1;
      if (R === 0 && c >= 0 && c < n) k = c;
      else if (R === S - 1 && c >= 0 && c < n) k = n + c;
      else if (C === 0 && r >= 0 && r < n) k = 2 * n + r;
      else if (C === S - 1 && r >= 0 && r < n) k = 3 * n + r;
      let el;
      if (r >= 0 && r < n && c >= 0 && c < n) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "sc-cell";
        el.dataset.i = r * n + c;
        cellEls[r * n + c] = el;
      } else {
        el = document.createElement("div");
        el.className = "sc-clue";
        if (k >= 0 && P.clue[k]) el.textContent = P.clue[k];
        if (k >= 0) clueEls[k] = el;
      }
      boardEl.appendChild(el);
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

  // Repeated heights in a line, and each clue's state: 0 open, 1 full and right, 2 wrong.
  function check() {
    const bad = new Set(), clue = new Int8Array(4 * P.n);
    for (const L of P.lines) {
      const seen = new Map();
      for (const i of L.cells) {
        if (!val[i]) continue;
        if (seen.has(val[i])) { bad.add(i); bad.add(seen.get(val[i])); } else seen.set(val[i], i);
      }
      if (L.cells.every((i) => val[i])) {
        const a = L.cells.map((i) => val[i]);
        if (P.clue[L.front]) clue[L.front] = visible(a) === P.clue[L.front] ? 1 : 2;
        if (P.clue[L.back]) clue[L.back] = visible(a.reverse()) === P.clue[L.back] ? 1 : 2;
      }
    }
    return { bad, clue };
  }

  function render() {
    const n = P.n, { bad, clue } = check();
    clueEls.forEach((el, k) => { el.className = "sc-clue" + (clue[k] === 1 ? " ok" : clue[k] === 2 ? " bad" : ""); });
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], v = val[i];
      el.className = "sc-cell" + (i === sel ? " sel" : "") + (bad.has(i) ? " err" : "") + (won ? " won" : "");
      el.innerHTML = "";
      if (v) {
        const s = document.createElement("span");
        s.className = "sc-v";
        s.dataset.d = v;
        el.appendChild(s);
      } else if (notes[i]) {
        const box = document.createElement("span");
        box.className = "sc-notes";
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
        (v ? ", height " + v : marks.length ? ", notes " + marks.join(" ") : ", empty") + (bad.has(i) ? ", repeated" : ""));
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
    const { bad, clue } = check();
    if (bad.size || clue.some((c) => c === 2)) return;
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("skyscrapers", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
    render();
  }

  function select(i) {
    if (sel === i) return;
    sel = i;
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".sc-cell");
    if (el) select(+el.dataset.i);
  });
  boardEl.addEventListener("focusin", (e) => {
    const el = e.target.closest(".sc-cell");
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
  window.addEventListener("load", () => Manpage.autoOpen("skyscrapers"));

  Gamekit.gridKeys(boardEl, { selector: ".sc-cell" });
})();
