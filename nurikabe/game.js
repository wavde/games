(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 6,  maxIsland: 5, grade: "basic" },
    medium: { n: 8,  maxIsland: 7, grade: "deduce" },
    hard:   { n: 10, maxIsland: 9, grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------
  // Cells are r * n + c; clue[i] is an island size or 0. Solver values: -1 unknown, 0 sea, 1 land.

  function puzzle(n, clue) {
    const near = [], blocks = [], clues = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, nb = [];
      if (r > 0) nb.push(i - n);
      if (r < n - 1) nb.push(i + n);
      if (c > 0) nb.push(i - 1);
      if (c < n - 1) nb.push(i + 1);
      near.push(nb);
      if (clue[i]) clues.push(i);
      if (r < n - 1 && c < n - 1) blocks.push([i, i + 1, i + n, i + n + 1]);
    }
    return { n, clue: Int8Array.from(clue), near, blocks, clues };
  }

  // Land components: comp[i] = id or -1; info[id] = { cells, clue (cell or -1), clues }.
  function landComponents(P, v) {
    const N = P.n * P.n, comp = new Int16Array(N).fill(-1), info = [];
    for (let s = 0; s < N; s++) {
      if (v[s] !== 1 || comp[s] >= 0) continue;
      const id = info.length, cells = [s];
      comp[s] = id;
      let clue = -1, clues = 0;
      for (let k = 0; k < cells.length; k++) {
        const x = cells[k];
        if (P.clue[x]) { clue = x; clues++; }
        for (const y of P.near[x]) if (v[y] === 1 && comp[y] < 0) { comp[y] = id; cells.push(y); }
      }
      info.push({ cells, clue, clues });
    }
    return { comp, info };
  }

  // Every sea cell reachable from every other through cells that aren't land.
  function seaConnected(P, v) {
    const N = P.n * P.n;
    let start = -1, seas = 0;
    for (let i = 0; i < N; i++) if (v[i] === 0) { seas++; if (start < 0) start = i; }
    if (start < 0) return true;
    const seen = new Uint8Array(N), stack = [start];
    seen[start] = 1;
    let found = 0;
    while (stack.length) {
      const x = stack.pop();
      if (v[x] === 0) found++;
      for (const y of P.near[x]) if (!seen[y] && v[y] !== 1) { seen[y] = 1; stack.push(y); }
    }
    return found === seas;
  }

  // Applies forced cells to a fixpoint; false on contradiction.
  function propagate(P, v) {
    const N = P.n * P.n;
    for (;;) {
      let changed = false;
      const { comp, info } = landComponents(P, v);
      for (const isl of info) {
        if (isl.clues > 1) return false;
        if (isl.clue < 0) continue;
        const want = P.clue[isl.clue];
        if (isl.cells.length > want) return false;
        if (isl.cells.length === want) {
          for (const x of isl.cells) for (const y of P.near[x]) if (v[y] < 0) { v[y] = 0; changed = true; }
        }
      }
      if (changed) continue;
      // An unknown cell that would merge two numbered islands, or overfill one, is sea.
      for (let i = 0; i < N; i++) {
        if (v[i] !== -1) continue;
        const ids = new Set();
        for (const y of P.near[i]) if (comp[y] >= 0) ids.add(comp[y]);
        let clue = -1, clues = 0, size = 1;
        for (const id of ids) { size += info[id].cells.length; if (info[id].clue >= 0) { clue = info[id].clue; clues++; } }
        if (clues > 1 || (clue >= 0 && size > P.clue[clue])) { v[i] = 0; changed = true; }
      }
      if (changed) continue;
      for (const b of P.blocks) {
        let sea = 0, unk = -1, k = 0;
        for (const x of b) { if (v[x] === 0) sea++; else if (v[x] < 0) { unk = x; k++; } }
        if (sea === 4) return false;
        if (sea === 3 && k === 1) { v[unk] = 1; changed = true; }
      }
      if (changed) continue;
      // Reach: how far each unfinished numbered island could still grow. Cells next to another
      // numbered island can't join it. Unknown cells no island can reach are sea.
      const reach = new Uint8Array(N);
      for (const isl of info) {
        if (isl.clue < 0) continue;
        const left = P.clue[isl.clue] - isl.cells.length, id = comp[isl.clue];
        if (!left) { for (const x of isl.cells) reach[x] = 1; continue; }
        const dist = new Int16Array(N).fill(-1), queue = [];
        for (const x of isl.cells) { dist[x] = 0; queue.push(x); reach[x] = 1; }
        let room = 0, exits = 0, exit = -1;
        for (let q = 0; q < queue.length; q++) {
          const x = queue[q];
          if (dist[x] >= left) continue;
          for (const y of P.near[x]) {
            if (dist[y] >= 0 || v[y] === 0) continue;
            if (P.near[y].some((z) => comp[z] >= 0 && comp[z] !== id && info[comp[z]].clue >= 0)) continue;
            if (comp[y] >= 0 && info[comp[y]].clue >= 0) continue;
            dist[y] = dist[x] + 1;
            reach[y] = 1;
            room++;
            if (dist[y] === 1 && v[y] < 0) { exits++; exit = y; }
            queue.push(y);
          }
        }
        if (room < left) return false;
        if (exits === 1 && !isl.cells.some((x) => P.near[x].some((y) => v[y] === 1 && comp[y] !== id))) {
          if (v[exit] < 0) { v[exit] = 1; changed = true; }
        }
      }
      if (changed) continue;
      for (let i = 0; i < N; i++) {
        if (reach[i]) continue;
        if (v[i] === 1) return false;
        if (v[i] < 0) { v[i] = 0; changed = true; }
      }
      if (changed) continue;
      if (!seaConnected(P, v)) return false;
      // A cell whose landing would cut the sea in two is sea.
      for (let i = 0; i < N; i++) {
        if (v[i] !== -1) continue;
        v[i] = 1;
        const ok = seaConnected(P, v);
        v[i] = -1;
        if (!ok) { v[i] = 0; changed = true; }
      }
      if (!changed) return true;
    }
  }

  function isSolution(P, v) {
    if (v.includes(-1)) return false;
    for (const b of P.blocks) if (b.every((x) => v[x] === 0)) return false;
    for (const isl of landComponents(P, v).info) {
      if (isl.clues !== 1 || isl.cells.length !== P.clue[isl.clue]) return false;
    }
    return seaConnected(P, v);
  }

  function fresh(P) {
    const v = new Int8Array(P.n * P.n).fill(-1);
    for (const i of P.clues) v[i] = 1;
    return v;
  }

  function basicSolve(P) { const v = fresh(P); return propagate(P, v) && isSolution(P, v); }

  // Deduction with single-cell probing ("if this were sea…"), no guessing.
  function logicSolve(P) {
    const v = fresh(P);
    if (!propagate(P, v)) return false;
    let progress = true;
    while (progress && v.includes(-1)) {
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
    return isSolution(P, v);
  }

  // Counts solutions up to `limit`; reports `limit` if the node budget runs out.
  function countSolutions(P, limit, budget) {
    let count = 0;
    (function search(v) {
      if (count >= limit) return;
      if (--budget < 0) { count = limit; return; }
      if (!propagate(P, v)) return;
      const i = v.indexOf(-1);
      if (i < 0) { if (isSolution(P, v)) { count++; P.solution = v; } return; }
      for (const guess of [1, 0]) {
        const t = v.slice();
        t[i] = guess;
        search(t);
        if (count >= limit) return;
      }
    })(fresh(P));
    return count;
  }

  // Start all sea; while a 2×2 pool remains, turn one of its cells to land, either joining the
  // one island it touches or starting a new one, as long as islands stay apart, within size,
  // and the sea stays connected.
  function randomSolution(n, maxIsland, rng) {
    const P = puzzle(n, new Int8Array(n * n)), v = new Int8Array(n * n), id = new Int16Array(n * n).fill(-1), size = [];
    for (let step = 0; step < n * n; step++) {
      const pools = P.blocks.filter((b) => b.every((x) => v[x] === 0));
      if (!pools.length) break;
      let placed = false;
      // Mostly grow an existing island rather than start a new one, so islands aren't all tiny.
      const order = Gamekit.shuffle(pools[Math.floor(rng() * pools.length)].slice(), rng);
      if (rng() < 0.4) order.sort((x, y) => (P.near[y].some((z) => id[z] >= 0) ? 1 : 0) - (P.near[x].some((z) => id[z] >= 0) ? 1 : 0));
      for (const x of order) {
        const ids = new Set();
        for (const y of P.near[x]) if (id[y] >= 0) ids.add(id[y]);
        if (ids.size > 1) continue;
        const join = ids.size ? [...ids][0] : -1;
        if (join >= 0 && size[join] >= maxIsland) continue;
        v[x] = 1;
        if (!seaConnected(P, v)) { v[x] = 0; continue; }
        if (join >= 0) { id[x] = join; size[join]++; } else { id[x] = size.length; size.push(1); }
        placed = true;
        break;
      }
      if (!placed) return null;
    }
    if (P.blocks.some((b) => b.every((x) => v[x] === 0))) return null;
    return { id, size };
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    return !basicSolve(P);
  }

  // Number one cell of every island; keep boards with one answer and the right grade.
  function generate(diffName, seed) {
    const { n, maxIsland, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      const s = randomSolution(n, maxIsland, rng);
      if (!s) continue;
      const cells = s.size.map(() => []);
      for (let i = 0; i < n * n; i++) if (s.id[i] >= 0) cells[s.id[i]].push(i);
      const clue = new Int8Array(n * n);
      cells.forEach((list, k) => { clue[list[Math.floor(rng() * list.length)]] = s.size[k]; });
      const P = puzzle(n, clue);
      if (countSolutions(P, 2, 3000) !== 1) continue;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const undoBtn  = document.getElementById("undo-btn");
  const EMPTY = 0, SEA = 1, DOT = 2;

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
      el.className = "nk-cell";
      el.dataset.i = i;
      if (P.clue[i]) el.textContent = P.clue[i];
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    render();
  }

  // 2×2 pools of sea, and dotted islands that join two numbers or outgrow theirs.
  function conflicts() {
    const bad = new Set();
    for (const b of P.blocks) if (b.every((x) => state[x] === SEA)) for (const x of b) bad.add(x);
    const dots = Int8Array.from(state, (s, i) => (s === DOT || P.clue[i] ? 1 : 0));
    for (const isl of landComponents(P, dots).info) {
      if (isl.clues > 1 || (isl.clue >= 0 && isl.cells.length > P.clue[isl.clue])) {
        for (const x of isl.cells) if (P.clue[x]) bad.add(x);
      }
    }
    return bad;
  }

  function render() {
    const n = P.n, bad = conflicts();
    for (let i = 0; i < n * n; i++) {
      const s = state[i];
      cellEls[i].className = "nk-cell" + (P.clue[i] ? " clue" : s === SEA ? " sea" : s === DOT ? " dot" : "") + (bad.has(i) ? " err" : "") + (won && s !== SEA ? " won" : "");
      cellEls[i].setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) +
        (P.clue[i] ? ", island of " + P.clue[i] : s === SEA ? ", sea" : s === DOT ? ", marked island" : ", empty") + (bad.has(i) ? ", conflict" : ""));
      cellEls[i].setAttribute("aria-disabled", P.clue[i] ? "true" : "false");
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(i, value) {
    if (won || P.clue[i] || state[i] === value) return;
    history.push(state.slice());
    state[i] = value;
    render();
    checkWin();
  }

  function checkWin() {
    if (!isSolution(P, Int8Array.from(state, (s) => (s === SEA ? 0 : 1)))) return;
    won = true;
    page.win();
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".nk-cell");
    if (!el) return;
    const i = parseInt(el.dataset.i, 10);
    set(i, (state[i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".nk-cell");
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
    id: "nurikabe",
    status: "Islands match their numbers.",
    generate,
    start,
    reset: () => { clear(); render(); },
  });
  window.addEventListener("load", () => Manpage.autoOpen("nurikabe"));

  Gamekit.gridKeys(boardEl, {
    selector: ".nk-cell",
    onSecondary: (el) => el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
  });
})();
