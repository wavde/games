(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 6, grade: "basic" },
    medium: { n: 8, grade: "deduce" },
    hard:   { n: 10, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // Cells are r * n + c holding numbers 1..n. Solver values: -1 unknown, 0 unshaded, 1 shaded.

  function puzzle(n, num) {
    const same = [], near = [], lonely = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, s = [];
      for (let k = 0; k < n; k++) {
        if (k !== c && num[r * n + k] === num[i]) s.push(r * n + k);
        if (k !== r && num[k * n + c] === num[i]) s.push(k * n + c);
      }
      same.push(s);
      if (!s.length) lonely.push(i);
      const nb = [];
      if (r > 0) nb.push(i - n);
      if (r < n - 1) nb.push(i + n);
      if (c > 0) nb.push(i - 1);
      if (c < n - 1) nb.push(i + 1);
      near.push(nb);
    }
    // Opening techniques read straight off the numbers. Sandwich: in X Y X the Y stays
    // unshaded (shading it would leave both Xs unshaded side by side in one line). Pair: when
    // two equal numbers touch, one of them stays unshaded, so every other copy in that line is shaded.
    const keep = [], shade = [];
    const at = (r, c) => num[r * n + c];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if ((c > 0 && c < n - 1 && at(r, c - 1) === at(r, c + 1)) || (r > 0 && r < n - 1 && at(r - 1, c) === at(r + 1, c))) keep.push(i);
      if (c < n - 1 && at(r, c) === at(r, c + 1)) {
        for (let k = 0; k < n; k++) if (k !== c && k !== c + 1 && at(r, k) === at(r, c)) shade.push(r * n + k);
      }
      if (r < n - 1 && at(r, c) === at(r + 1, c)) {
        for (let k = 0; k < n; k++) if (k !== r && k !== r + 1 && at(k, c) === at(r, c)) shade.push(k * n + c);
      }
    }
    return { n, num: Int8Array.from(num), same, near, lonely, keep, shade };
  }

  // Every unshaded cell reachable from every other through cells not shaded.
  function connected(P, v) {
    const N = P.n * P.n;
    let start = -1, whites = 0;
    for (let i = 0; i < N; i++) if (v[i] === 0) { whites++; if (start < 0) start = i; }
    if (start < 0) return true;
    const seen = new Uint8Array(N), stack = [start];
    seen[start] = 1;
    let found = 0;
    while (stack.length) {
      const x = stack.pop();
      if (v[x] === 0) found++;
      for (const y of P.near[x]) if (!seen[y] && v[y] !== 1) { seen[y] = 1; stack.push(y); }
    }
    return found === whites;
  }

  // Applies forced cells to a fixpoint; false on contradiction.
  function propagate(P, v) {
    for (;;) {
      let changed = false;
      for (let i = 0; i < v.length; i++) {
        if (v[i] === 1) {
          for (const j of P.near[i]) {
            if (v[j] === 1) return false;
            if (v[j] < 0) { v[j] = 0; changed = true; }
          }
        } else if (v[i] === 0) {
          for (const j of P.same[i]) {
            if (v[j] === 0) return false;
            if (v[j] < 0) { v[j] = 1; changed = true; }
          }
        }
      }
      if (changed) continue;
      if (!connected(P, v)) return false;
      // A cell whose shading would cut the unshaded cells apart stays unshaded.
      for (let i = 0; i < v.length; i++) {
        if (v[i] !== -1) continue;
        v[i] = 1;
        const ok = connected(P, v);
        v[i] = -1;
        if (!ok) { v[i] = 0; changed = true; }
      }
      if (!changed) return true;
    }
  }

  // A number with no twin in its row or column never needs shading. Opening techniques are only
  // used for grading: the uniqueness search must not rely on them.
  function fresh(P) {
    const v = new Int8Array(P.n * P.n).fill(-1);
    for (const i of P.lonely) v[i] = 0;
    return v;
  }
  function opened(P) {
    const v = fresh(P);
    for (const i of P.keep) v[i] = 0;
    for (const i of P.shade) { if (v[i] === 0) return null; v[i] = 1; }
    return v;
  }
  function complete(v) { return !v.includes(-1); }

  function basicSolve(P) { const v = opened(P); return !!v && propagate(P, v) && complete(v); }

  // Deduction with single-cell probing ("if this were shaded…"), no guessing.
  function logicSolve(P) {
    const v = opened(P);
    if (!v || !propagate(P, v)) return false;
    let progress = true;
    while (progress && !complete(v)) {
      progress = false;
      for (let i = 0; i < v.length; i++) {
        if (v[i] !== -1) continue;
        for (const guess of [1, 0]) {
          const t = v.slice();
          t[i] = guess;
          if (!propagate(P, t)) {
            v[i] = 1 - guess;
            if (!propagate(P, v)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return complete(v);
  }

  // Counts solutions up to `limit`; reports `limit` if the node budget runs out. The search keeps
  // lone numbers unshaded, so a single answer only counts if none of them could be shaded too.
  function countSolutions(P, limit, budget) {
    let count = 0, sol = null;
    (function search(v) {
      if (count >= limit) return;
      if (--budget < 0) { count = limit; return; }
      if (!propagate(P, v)) return;
      const i = v.indexOf(-1);
      if (i < 0) { count++; sol = v; return; }
      for (const guess of [1, 0]) {
        const t = v.slice();
        t[i] = guess;
        search(t);
        if (count >= limit) return;
      }
    })(fresh(P));
    if (count === 1) {
      for (const i of P.lonely) {
        if (P.near[i].some((j) => sol[j] === 1)) continue;
        sol[i] = 1;
        const ok = connected(P, sol);
        sol[i] = 0;
        if (ok) return 2;
      }
      P.solution = sol;
    }
    return count;
  }

  // Shade random cells that keep shaded cells apart and unshaded cells connected.
  function randomShading(n, rng) {
    const v = new Int8Array(n * n), P = puzzle(n, new Int8Array(n * n));
    const target = Math.round(n * n * (0.28 + 0.06 * rng()));
    let k = 0;
    for (const i of Gamekit.shuffle(Array.from({ length: n * n }, (_, x) => x), rng)) {
      if (k >= target) break;
      if (P.near[i].some((j) => v[j] === 1)) continue;
      v[i] = 1;
      if (connected(P, v)) k++; else v[i] = 0;
    }
    return v;
  }

  function latin(n, rng) {
    const rows = Gamekit.shuffle(Array.from({ length: n }, (_, i) => i), rng);
    const cols = Gamekit.shuffle(Array.from({ length: n }, (_, i) => i), rng);
    const sym = Gamekit.shuffle(Array.from({ length: n }, (_, i) => i + 1), rng);
    const g = new Int8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = sym[(rows[r] + cols[c]) % n];
    return g;
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    return !basicSolve(P);
  }

  // Shaded cells copy a number from their row or column, so the Latin square underneath
  // makes every unshaded number distinct; keep boards with one answer and the right grade.
  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const shade = randomShading(n, rng), num = latin(n, rng);
      for (let i = 0; i < n * n; i++) {
        if (!shade[i]) continue;
        const r = Math.floor(i / n), c = i % n, from = [];
        for (let k = 0; k < n; k++) {
          if (!shade[r * n + k]) from.push(r * n + k);
          if (!shade[k * n + c]) from.push(k * n + c);
        }
        num[i] = num[from[Math.floor(rng() * from.length)]];
      }
      const P = puzzle(n, num);
      if (countSolutions(P, 2, 20000) !== 1) continue;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const undoBtn  = document.getElementById("undo-btn");
  const EMPTY = 0, SHADE = 1, CIRCLE = 2;

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
      const el = document.createElement("button");
      el.type = "button";
      el.className = "ht-cell";
      el.dataset.i = i;
      el.textContent = P.num[i];
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    render();
  }

  // Shaded cells that touch, and circled (kept) cells that repeat a number.
  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < state.length; i++) {
      if (state[i] === SHADE) for (const j of P.near[i]) if (state[j] === SHADE) { bad.add(i); bad.add(j); }
      if (state[i] === CIRCLE) for (const j of P.same[i]) if (state[j] === CIRCLE) { bad.add(i); bad.add(j); }
    }
    return bad;
  }

  function render() {
    const n = P.n, bad = conflicts();
    for (let i = 0; i < n * n; i++) {
      const s = state[i];
      cellEls[i].className = "ht-cell" + (s === SHADE ? " shade" : s === CIRCLE ? " circle" : "") + (bad.has(i) ? " err" : "") + (won && s !== SHADE ? " won" : "");
      cellEls[i].setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", " + P.num[i] +
        (s === SHADE ? ", shaded" : s === CIRCLE ? ", kept" : "") + (bad.has(i) ? ", conflict" : ""));
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
    const v = Int8Array.from(state, (s) => (s === SHADE ? 1 : 0));
    for (let i = 0; i < v.length; i++) {
      if (v[i] === 1 && P.near[i].some((j) => v[j] === 1)) return;
      if (v[i] === 0 && P.same[i].some((j) => v[j] === 0)) return;
    }
    if (!connected(P, v)) return;
    won = true;
    page.win();
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".ht-cell");
    if (!el) return;
    const i = parseInt(el.dataset.i, 10);
    set(i, (state[i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".ht-cell");
    e.preventDefault();
    if (!el) return;
    const i = parseInt(el.dataset.i, 10);
    set(i, state[i] === CIRCLE ? EMPTY : CIRCLE);
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    state = history.pop();
    render();
  });

  const page = Gamekit.puzzlePage({
    id: "hitori",
    status: "Shade repeats. Keep the rest joined.",
    generate,
    start,
    reset: () => { clear(); render(); },
  });
  window.addEventListener("load", () => Manpage.autoOpen("hitori"));

  Gamekit.gridKeys(boardEl, { selector: ".ht-cell", onSecondary: (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })) });
})();
