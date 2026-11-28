(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 5, grade: "basic" },
    medium: { n: 6, grade: "deduce" },
    hard:   { n: 7, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // An n×n Latin square of 1..n with < / > signs between some neighbours and a few givens.
  // Edge e: horizontal e = r(n-1) + c joins (r,c)-(r,c+1); vertical e = n(n-1) + rn + c joins
  // (r,c)-(r+1,c). sign[e]: 0 none, 1 first < second, 2 first > second.
  // Solver state: dom[i] = bitmask of values still possible for cell i (bit d = value d).

  const bits = (m) => { let k = 0; for (; m; m &= m - 1) k++; return k; };
  const lo = (m) => 31 - Math.clz32(m & -m);
  const hi = (m) => 31 - Math.clz32(m);

  function edgeCells(n, e) {
    const H = n * (n - 1);
    if (e < H) { const r = Math.floor(e / (n - 1)), c = e % (n - 1); return [r * n + c, r * n + c + 1]; }
    const k = e - H;
    return [k, k + n];
  }

  function puzzle(n, given, sign) {
    const lines = [];
    for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
    const peers = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n), c = i % n, out = [];
      for (let k = 0; k < n; k++) {
        if (k !== c) out.push(r * n + k);
        if (k !== r) out.push(k * n + c);
      }
      return out;
    });
    const rels = [];
    for (let e = 0; e < sign.length; e++) {
      if (!sign[e]) continue;
      const [a, b] = edgeCells(n, e);
      rels.push(sign[e] === 1 ? [a, b] : [b, a]);
    }
    return { n, given: Int8Array.from(given), sign: Int8Array.from(sign), lines, peers, rels, full: (1 << (n + 1)) - 2 };
  }

  // Singles, hidden singles, and inequality bounds until nothing changes.
  function propagate(P, dom) {
    const n = P.n;
    for (;;) {
      let changed = false;
      for (let i = 0; i < dom.length; i++) {
        if (!dom[i]) return false;
        if (bits(dom[i]) !== 1) continue;
        for (const j of P.peers[i]) {
          if (dom[j] & dom[i]) {
            dom[j] &= ~dom[i];
            if (!dom[j]) return false;
            changed = true;
          }
        }
      }
      for (const L of P.lines) {
        for (let d = 1; d <= n; d++) {
          let where = -1, k = 0;
          for (const i of L) if (dom[i] & (1 << d)) { where = i; k++; }
          if (!k) return false;
          if (k === 1 && dom[where] !== 1 << d) { dom[where] = 1 << d; changed = true; }
        }
      }
      for (const [a, b] of P.rels) {
        const na = dom[a] & ((1 << hi(dom[b])) - 1);
        if (!na) return false;
        if (na !== dom[a]) { dom[a] = na; changed = true; }
        const nb = dom[b] & ~((1 << (lo(dom[a]) + 1)) - 1);
        if (!nb) return false;
        if (nb !== dom[b]) { dom[b] = nb; changed = true; }
      }
      if (!changed) return true;
    }
  }

  function fresh(P) {
    const dom = new Uint16Array(P.n * P.n).fill(P.full);
    P.given.forEach((v, i) => { if (v) dom[i] = 1 << v; });
    return dom;
  }
  function solved(dom) { return dom.every((m) => bits(m) === 1); }

  function basicSolve(P) { const dom = fresh(P); return propagate(P, dom) && solved(dom); }

  // Propagation plus single-value probing ("if this were a 4…"), no guessing.
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

  // While the clue set still meets the level: easy stays solvable by propagation alone,
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

  // Start with every given and every sign, then hide givens, then signs, while the level holds.
  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    const E = 2 * n * (n - 1);
    let fallback = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const sol = latin(n, rng), given = Int8Array.from(sol), sign = new Int8Array(E);
      for (let e = 0; e < E; e++) {
        const [a, b] = edgeCells(n, e);
        sign[e] = sol[a] < sol[b] ? 1 : 2;
      }
      let P = puzzle(n, given, sign);
      for (const i of Gamekit.shuffle(Array.from({ length: n * n }, (_, k) => k), rng)) {
        given[i] = 0;
        const P2 = puzzle(n, given, sign);
        if (keeps(P2, grade)) P = P2; else given[i] = sol[i];
      }
      for (const e of Gamekit.shuffle(Array.from({ length: E }, (_, k) => k), rng)) {
        const saved = sign[e];
        sign[e] = 0;
        const P2 = puzzle(n, given, sign);
        if (keeps(P2, grade)) P = P2; else sign[e] = saved;
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
  const STATUS = "Every row and column holds 1 to n once; obey the signs.";
  const store = Gamekit.storage("futoshiki:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });
  const GLYPH = [["", "<", ">"], ["", "∧", "∨"]];

  let diff = "medium";
  let P = null, val = null, notes = null, history = [], won = false, sel = -1, noteMode = false;
  let cellEls = [], signEls = [], dailyDate = null, relText = [];

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("futoshiki", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = generate(diff, seed);
    val = Uint8Array.from(P.given);
    notes = new Uint16Array(P.n * P.n);
    history = [];
    won = false;
    sel = -1;
    describe();
    build();
    buildPad();
    clock.start();
    statusEl.textContent = STATUS;
  }

  // Spoken relations for each cell, e.g. "smaller than right, bigger than below".
  function describe() {
    const n = P.n;
    relText = Array.from({ length: n * n }, () => []);
    const H = n * (n - 1);
    for (let e = 0; e < P.sign.length; e++) {
      if (!P.sign[e]) continue;
      const [a, b] = edgeCells(n, e), less = P.sign[e] === 1, horiz = e < H;
      relText[a].push((less ? "smaller" : "bigger") + " than " + (horiz ? "right" : "below"));
      relText[b].push((less ? "bigger" : "smaller") + " than " + (horiz ? "left" : "above"));
    }
  }

  // The board is (2n − 1)² tracks: cells on even tracks, sign slots between them.
  function build() {
    const n = P.n, S = 2 * n - 1, H = n * (n - 1);
    const tracks = "repeat(" + (n - 1) + ", 1fr 0.42fr) 1fr";
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = tracks;
    boardEl.style.gridTemplateRows = tracks;
    cellEls = new Array(n * n);
    signEls = new Array(P.sign.length);
    for (let R = 0; R < S; R++) for (let C = 0; C < S; C++) {
      let el;
      if (R % 2 === 0 && C % 2 === 0) {
        const i = (R / 2) * n + C / 2;
        el = document.createElement("button");
        el.type = "button";
        el.className = "ft-cell";
        el.dataset.i = i;
        cellEls[i] = el;
      } else {
        el = document.createElement("div");
        el.className = "ft-sign";
        let e = -1;
        if (R % 2 === 0) e = (R / 2) * (n - 1) + (C - 1) / 2;
        else if (C % 2 === 0) e = H + ((R - 1) / 2) * n + C / 2;
        if (e >= 0 && P.sign[e]) {
          el.textContent = GLYPH[e < H ? 0 : 1][P.sign[e]];
          el.setAttribute("aria-hidden", "true");
          signEls[e] = el;
        }
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

  // Repeated values in a line, and signs whose two filled cells break them.
  function check() {
    const bad = new Set(), badSign = new Set();
    for (const L of P.lines) {
      const seen = new Map();
      for (const i of L) {
        if (!val[i]) continue;
        if (seen.has(val[i])) { bad.add(i); bad.add(seen.get(val[i])); } else seen.set(val[i], i);
      }
    }
    for (let e = 0; e < P.sign.length; e++) {
      if (!P.sign[e]) continue;
      const [a, b] = edgeCells(P.n, e);
      if (val[a] && val[b] && (val[a] < val[b]) !== (P.sign[e] === 1)) badSign.add(e);
    }
    return { bad, badSign };
  }

  function render() {
    const n = P.n, { bad, badSign } = check();
    signEls.forEach((el, e) => { if (el) el.className = "ft-sign" + (badSign.has(e) ? " bad" : ""); });
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], v = val[i], given = !!P.given[i];
      el.className = "ft-cell" + (given ? " given" : "") + (i === sel ? " sel" : "") + (bad.has(i) ? " err" : "");
      el.innerHTML = "";
      if (v) {
        const s = document.createElement("span");
        s.className = "ft-v";
        s.dataset.d = v;
        el.appendChild(s);
      } else if (notes[i]) {
        const box = document.createElement("span");
        box.className = "ft-notes";
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
        (given ? ", given " + v : v ? ", " + v : marks.length ? ", notes " + marks.join(" ") : ", empty") +
        (bad.has(i) ? ", repeated" : "") + (relText[i].length ? ", " + relText[i].join(", ") : ""));
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
    if (val.some((v) => !v)) return;
    const { bad, badSign } = check();
    if (bad.size || badSign.size) return;
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("futoshiki", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
    render();
  }

  function select(i) {
    if (sel === i) return;
    sel = i;
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".ft-cell");
    if (el) select(+el.dataset.i);
  });
  boardEl.addEventListener("focusin", (e) => {
    const el = e.target.closest(".ft-cell");
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
    val = Uint8Array.from(P.given);
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
  window.addEventListener("load", () => Manpage.autoOpen("futoshiki"));

  Gamekit.gridKeys(boardEl, { selector: ".ft-cell" });
})();
