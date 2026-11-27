(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 6, grade: "basic" },
    medium: { n: 7, grade: "deduce" },
    hard:   { n: 8, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // An n×n grid of cells has (n+1)² dots. Edges 0..H-1 are horizontal (row r = 0..n, col c = 0..n-1),
  // edges H..E-1 are vertical (row r = 0..n-1, col c = 0..n). Edge values: -1 unknown, 0 off, 1 on.

  function geometry(n) {
    const H = (n + 1) * n, E = H + n * (n + 1), V = (n + 1) * (n + 1);
    const edgeVerts = [], cellEdges = [], vertEdges = Array.from({ length: V }, () => []);
    for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) edgeVerts.push([r * (n + 1) + c, r * (n + 1) + c + 1]);
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) edgeVerts.push([r * (n + 1) + c, (r + 1) * (n + 1) + c]);
    edgeVerts.forEach(([a, b], e) => { vertEdges[a].push(e); vertEdges[b].push(e); });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      cellEdges.push([r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]);
    }
    return { n, H, E, V, edgeVerts, cellEdges, vertEdges };
  }

  // clue[cell]: -1 (blank) or 0..3.
  function puzzle(G, clue) {
    const clued = [];
    for (let k = 0; k < clue.length; k++) if (clue[k] >= 0) clued.push(k);
    return Object.assign({}, G, { clue: Int8Array.from(clue), clued });
  }

  function unionFind(P, v) {
    const parent = new Int16Array(P.V);
    for (let i = 0; i < P.V; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    let cycle = -1;
    for (let e = 0; e < P.E; e++) {
      if (v[e] !== 1) continue;
      const a = find(P.edgeVerts[e][0]), b = find(P.edgeVerts[e][1]);
      if (a === b) cycle = a; else parent[a] = b;
    }
    return { find, cycle };
  }

  // Would switching on `e` (and nothing else) close a loop that satisfies every clue?
  function closesSolution(P, v, e, root, find) {
    for (let x = 0; x < P.E; x++) if (v[x] === 1 && find(P.edgeVerts[x][0]) !== root) return false;
    for (const k of P.clued) {
      let on = 0;
      for (const x of P.cellEdges[k]) if (v[x] === 1 || x === e) on++;
      if (on !== P.clue[k]) return false;
    }
    return true;
  }

  // Loop rule: a closed loop must be the whole answer, and an edge joining the two ends of one
  // path is off unless that would finish the puzzle. Returns -1 on contradiction, 1 if it changed v, else 0.
  function loopRule(P, v) {
    const { find, cycle } = unionFind(P, v);
    let changed = 0;
    if (cycle >= 0) {
      const root = find(cycle);
      for (let e = 0; e < P.E; e++) if (v[e] === 1 && find(P.edgeVerts[e][0]) !== root) return -1;
      for (let e = 0; e < P.E; e++) if (v[e] < 0) { v[e] = 0; changed = 1; }
      return changed;
    }
    for (let e = 0; e < P.E; e++) {
      if (v[e] >= 0) continue;
      const a = find(P.edgeVerts[e][0]);
      if (a === find(P.edgeVerts[e][1]) && !closesSolution(P, v, e, a, find)) { v[e] = 0; changed = 1; }
    }
    return changed;
  }

  // Applies forced edges to a fixpoint; false on contradiction.
  function propagate(P, v) {
    for (;;) {
      let changed = false;
      for (const k of P.clued) {
        const want = P.clue[k], es = P.cellEdges[k];
        let on = 0, unk = 0;
        for (const e of es) { if (v[e] === 1) on++; else if (v[e] < 0) unk++; }
        if (on > want || on + unk < want) return false;
        if (unk && (on === want || on + unk === want)) {
          const val = on === want ? 0 : 1;
          for (const e of es) if (v[e] < 0) v[e] = val;
          changed = true;
        }
      }
      for (let x = 0; x < P.V; x++) {
        const es = P.vertEdges[x];
        let on = 0, unk = 0, last = -1;
        for (const e of es) { if (v[e] === 1) on++; else if (v[e] < 0) { unk++; last = e; } }
        if (on > 2 || (on === 1 && !unk)) return false;
        if (!unk) continue;
        if (on === 2) { for (const e of es) if (v[e] < 0) v[e] = 0; changed = true; }
        else if (unk === 1) { v[last] = on; changed = true; }
      }
      if (changed) continue;
      const r = loopRule(P, v);
      if (r < 0) return false;
      if (!r) return true;
    }
  }

  // Exactly one loop, every dot used 0 or 2 times, every clue met.
  function isSolution(P, v) {
    for (let x = 0; x < P.V; x++) {
      let d = 0;
      for (const e of P.vertEdges[x]) if (v[e] === 1) d++;
      if (d !== 0 && d !== 2) return false;
    }
    for (const k of P.clued) {
      let d = 0;
      for (const e of P.cellEdges[k]) if (v[e] === 1) d++;
      if (d !== P.clue[k]) return false;
    }
    const { find } = unionFind(P, v);
    let root = -1;
    for (let e = 0; e < P.E; e++) {
      if (v[e] !== 1) continue;
      const r = find(P.edgeVerts[e][0]);
      if (root < 0) root = r; else if (r !== root) return false;
    }
    return root >= 0;
  }

  function fresh(P) { return new Int8Array(P.E).fill(-1); }
  function complete(v) { return !v.includes(-1); }

  function basicSolve(P) { const v = fresh(P); return propagate(P, v) && complete(v) && isSolution(P, v); }

  // Deduction with single-edge probing ("if this line were drawn…"), no guessing.
  function logicSolve(P) {
    const v = fresh(P);
    if (!propagate(P, v)) return false;
    let progress = true;
    while (progress && !complete(v)) {
      progress = false;
      for (let e = 0; e < P.E; e++) {
        if (v[e] !== -1) continue;
        for (const guess of [1, 0]) {
          const t = v.slice();
          t[e] = guess;
          if (!propagate(P, t)) {
            v[e] = 1 - guess;
            if (!propagate(P, v)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return complete(v) && isSolution(P, v);
  }

  // Branch on an edge at a loose path end when there is one.
  function pickEdge(P, v) {
    let any = -1;
    for (let x = 0; x < P.V; x++) {
      let on = 0, cand = -1;
      for (const e of P.vertEdges[x]) { if (v[e] === 1) on++; else if (v[e] < 0) cand = e; }
      if (cand < 0) continue;
      if (on === 1) return cand;
      if (any < 0) any = cand;
    }
    return any;
  }

  // Counts solutions up to `limit`; reports `limit` if the node budget runs out.
  function countSolutions(P, limit, budget) {
    let count = 0;
    (function search(v) {
      if (count >= limit) return;
      if (--budget < 0) { count = limit; return; }
      if (!propagate(P, v)) return;
      const e = pickEdge(P, v);
      if (e < 0) { if (isSolution(P, v)) count++; return; }
      for (const guess of [1, 0]) {
        const t = v.slice();
        t[e] = guess;
        search(t);
        if (count >= limit) return;
      }
    })(fresh(P));
    return count;
  }

  // Grow a random region with no holes and no corner-touching; its outline is the loop.
  function randomLoop(G, rng) {
    const n = G.n, inside = new Uint8Array(n * n);
    const isIn = (r, c) => (r >= 0 && c >= 0 && r < n && c < n && inside[r * n + c] === 1 ? 1 : 0);
    const target = Math.round(n * n * (0.4 + 0.2 * rng()));
    inside[Math.floor(rng() * n * n)] = 1;
    function valid(i) {
      const r0 = Math.floor(i / n), c0 = i % n;
      for (const [vr, vc] of [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]]) {
        const a = isIn(vr - 1, vc - 1), b = isIn(vr - 1, vc), c = isIn(vr, vc - 1), d = isIn(vr, vc);
        if (a === d && b === c && a !== b) return false;
      }
      const seen = new Uint8Array(n * n), stack = [];
      let outside = 0, reached = 0;
      for (let k = 0; k < n * n; k++) {
        if (inside[k]) continue;
        outside++;
        const r = Math.floor(k / n), c = k % n;
        if (r === 0 || c === 0 || r === n - 1 || c === n - 1) { seen[k] = 1; stack.push(k); }
      }
      while (stack.length) {
        const k = stack.pop(), r = Math.floor(k / n), c = k % n;
        reached++;
        for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          const j = rr * n + cc;
          if (!inside[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      return reached === outside;
    }
    for (let size = 1; size < target;) {
      const cands = [];
      for (let i = 0; i < n * n; i++) {
        if (inside[i]) continue;
        const r = Math.floor(i / n), c = i % n;
        const k = isIn(r - 1, c) + isIn(r + 1, c) + isIn(r, c - 1) + isIn(r, c + 1);
        if (k) cands.push([i, k]);
      }
      Gamekit.shuffle(cands, rng);
      // Mostly grow thin arms so the loop winds.
      if (rng() < 0.7) cands.sort((x, y) => (x[1] === 1 ? 0 : 1) - (y[1] === 1 ? 0 : 1));
      let added = false;
      for (const [i] of cands) {
        inside[i] = 1;
        if (valid(i)) { added = true; size++; break; }
        inside[i] = 0;
      }
      if (!added) break;
    }
    const sol = new Int8Array(G.E);
    for (let e = 0; e < G.E; e++) {
      let a, b;
      if (e < G.H) { const r = Math.floor(e / n), c = e % n; a = isIn(r - 1, c); b = isIn(r, c); }
      else { const k = e - G.H, r = Math.floor(k / (n + 1)), c = k % (n + 1); a = isIn(r, c - 1); b = isIn(r, c); }
      sol[e] = a !== b ? 1 : 0;
    }
    return sol;
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return logicSolve(P);
    return countSolutions(P, 2, 20000) === 1;
  }

  // Start fully clued, then blank numbers one at a time while the grade still holds.
  // Medium and hard must also need more than the direct rules.
  function generate(diffName, seed) {
    const { n, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed), G = geometry(n);
    let fallback = null, last = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const sol = randomLoop(G, rng);
      const clue = G.cellEdges.map((es) => es.reduce((s, e) => s + sol[e], 0));
      let P = puzzle(G, clue);
      last = P;
      if (!fits(P, grade)) continue;
      for (const k of Gamekit.shuffle(Array.from({ length: n * n }, (_, i) => i), rng)) {
        const saved = clue[k];
        clue[k] = -1;
        const P2 = puzzle(G, clue);
        if (fits(P2, grade)) P = P2; else clue[k] = saved;
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
  const STATUS = "Draw one closed loop.";
  const EMPTY = 0, LINE = 1, CROSS = 2;
  const store = Gamekit.storage("slitherlink:");

  let diff = "medium";
  let P = null, state = null, history = [], won = false, lineEls = [], cellEls = [];
  let timerStart = 0, timerInterval = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("slitherlink", diff);
    P = generate(diff, seed);
    state = new Uint8Array(P.E);
    history = [];
    won = false;
    build();
    startTimer();
    statusEl.textContent = STATUS;
    updateBest();
  }

  function edgeLabel(e) {
    const n = P.n;
    if (e < P.H) {
      const r = Math.floor(e / n), c = e % n;
      return r < n ? "Line above row " + (r + 1) + ", column " + (c + 1) : "Line below row " + n + ", column " + (c + 1);
    }
    const k = e - P.H, r = Math.floor(k / (n + 1)), c = k % (n + 1);
    return c < n ? "Line left of row " + (r + 1) + ", column " + (c + 1) : "Line right of row " + (r + 1) + ", column " + n;
  }

  function build() {
    const n = P.n, S = 2 * n + 1;
    boardEl.innerHTML = "";
    const tpl = "repeat(" + n + ", var(--dot) 1fr) var(--dot)";
    boardEl.style.gridTemplateColumns = tpl;
    boardEl.style.gridTemplateRows = tpl;
    lineEls = new Array(P.E);
    cellEls = new Array(n * n);
    for (let R = 0; R < S; R++) {
      for (let C = 0; C < S; C++) {
        let el;
        if (R % 2 === 0 && C % 2 === 0) {
          el = document.createElement("div");
          el.className = "sl-dot";
        } else if (R % 2 === 1 && C % 2 === 1) {
          const k = ((R - 1) / 2) * n + (C - 1) / 2;
          el = document.createElement("div");
          el.className = "sl-cell";
          if (P.clue[k] >= 0) el.textContent = P.clue[k];
          cellEls[k] = el;
        } else {
          const horiz = R % 2 === 0;
          const e = horiz ? (R / 2) * n + (C - 1) / 2 : P.H + ((R - 1) / 2) * (n + 1) + C / 2;
          el = document.createElement("button");
          el.type = "button";
          el.className = "sl-line " + (horiz ? "sl-h" : "sl-v");
          el.dataset.e = e;
          el.dataset.rc = R + "," + C;
          lineEls[e] = el;
        }
        boardEl.appendChild(el);
      }
    }
    render();
  }

  function lines() { const v = new Int8Array(P.E); for (let e = 0; e < P.E; e++) v[e] = state[e] === LINE ? 1 : 0; return v; }

  function render() {
    const bad = new Set();
    for (let x = 0; x < P.V; x++) {
      const on = P.vertEdges[x].filter((e) => state[e] === LINE);
      if (on.length > 2) for (const e of on) bad.add(e);
    }
    for (let e = 0; e < P.E; e++) {
      const s = state[e], el = lineEls[e];
      el.className = "sl-line " + (e < P.H ? "sl-h" : "sl-v") + (s === LINE ? " on" : s === CROSS ? " x" : "") + (bad.has(e) ? " bad" : "");
      el.setAttribute("aria-label", edgeLabel(e) + (s === LINE ? ", drawn" : s === CROSS ? ", crossed out" : ""));
    }
    for (const k of P.clued) {
      let on = 0;
      for (const e of P.cellEdges[k]) if (state[e] === LINE) on++;
      cellEls[k].className = "sl-cell" + (on === P.clue[k] ? " ok" : on > P.clue[k] ? " over" : "");
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(e, value) {
    if (won || state[e] === value) return;
    history.push(state.slice());
    state[e] = value;
    render();
    checkWin();
  }

  function checkWin() {
    if (!isSolution(P, lines())) return;
    won = true;
    clearInterval(timerInterval);
    const s = Math.floor((Date.now() - timerStart) / 1000);
    timeEl.textContent = Gamekit.fmtTime(s);
    const best = store.getInt("best:" + diff, null);
    if (best === null || s < best) store.set("best:" + diff, s);
    updateBest();
    statusEl.innerHTML = '<span class="ok">Loop closed in ' + Gamekit.fmtTime(s) + '.</span>';
    render();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerStart = Date.now();
    timeEl.textContent = Gamekit.fmtTime(0);
    timerInterval = setInterval(() => {
      if (!won) timeEl.textContent = Gamekit.fmtTime(Math.floor((Date.now() - timerStart) / 1000));
    }, 500);
  }

  function updateBest() {
    const best = store.getInt("best:" + diff, null);
    bestEl.textContent = best === null ? "—" : Gamekit.fmtTime(best);
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".sl-line");
    if (!el) return;
    const k = parseInt(el.dataset.e, 10);
    set(k, (state[k] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".sl-line");
    e.preventDefault();
    if (!el) return;
    const k = parseInt(el.dataset.e, 10);
    set(k, state[k] === CROSS ? EMPTY : CROSS);
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    state = history.pop();
    render();
  });

  resetBtn.addEventListener("click", () => {
    state = new Uint8Array(P.E);
    history = [];
    won = false;
    startTimer();
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
  window.addEventListener("load", () => Manpage.autoOpen("slitherlink"));

  // Lattice arrows: Left/Right step along a row of lines; Up/Down alternate between
  // horizontal and vertical lines so every line is reachable.
  Gamekit.gridKeys(boardEl, {
    selector: ".sl-line",
    onSecondary: (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    next: (el, key) => {
      const [R, C] = el.dataset.rc.split(",").map(Number), S = 2 * P.n;
      let r = R, c = C;
      if (key === "ArrowRight") c += 2;
      else if (key === "ArrowLeft") c -= 2;
      else {
        r += key === "ArrowDown" ? 1 : -1;
        c = R % 2 === 0 ? C + 1 : C - 1;
        if (c < 0) c = C + 1;
        if (c > S) c = C - 1;
      }
      return boardEl.querySelector('.sl-line[data-rc="' + r + "," + c + '"]');
    },
  });
})();
