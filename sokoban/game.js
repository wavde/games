(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 7, boxes: 2, walls: 0.12, tries: 6, cap: 20000 },
    medium: { n: 8, boxes: 3, walls: 0.14, tries: 6, cap: 40000 },
    hard:   { n: 9, boxes: 4, walls: 0.16, tries: 5, cap: 60000 },
  };

  // ---------- generator (no DOM) ----------
  // An n×n room with a wall border; cells are r * n + c. wall[i] = 1 for walls, goal[i] = 1 for goals.

  // A room: border walls plus scattered inner walls, all floor connected.
  function room(n, density, rng) {
    const wall = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      if (r === 0 || c === 0 || r === n - 1 || c === n - 1) wall[i] = 1;
    }
    const inner = [];
    for (let i = 0; i < n * n; i++) if (!wall[i]) inner.push(i);
    let want = Math.round(inner.length * density);
    for (const i of Gamekit.shuffle(inner, rng)) {
      if (!want) break;
      wall[i] = 1;
      const floor = [];
      for (let k = 0; k < n * n; k++) if (!wall[k]) floor.push(k);
      const seen = new Set([floor[0]]), stack = [floor[0]];
      while (stack.length) {
        const x = stack.pop();
        for (const d of [-n, n, -1, 1]) if (!wall[x + d] && !seen.has(x + d)) { seen.add(x + d); stack.push(x + d); }
      }
      if (seen.size === floor.length) want--; else wall[i] = 0;
    }
    return wall;
  }

  // Breadth-first search backwards from the solved position, pulling boxes instead of pushing
  // them. Every pull played forwards is a push, so a position found at depth k needs exactly
  // k pushes to solve. Returns the deepest positions reached (within `cap` states).
  function deepestStarts(n, wall, goals, cap) {
    const N = n * n, D = [-n, n, -1, 1], box = new Uint8Array(N), stamp0 = new Int32Array(N), stand = new Int32Array(N);
    let mark = 0;
    // Flood the player's walkable area into `stamp` (or the separate `stand` array); returns its smallest cell.
    const reach = (p, into) => {
      const stamp = into || stamp0;
      mark++;
      const stack = [p];
      stamp[p] = mark;
      let min = p;
      while (stack.length) {
        const x = stack.pop();
        if (x < min) min = x;
        for (const d of D) {
          const y = x + d;
          if (stamp[y] !== mark && !wall[y] && !box[y]) { stamp[y] = mark; stack.push(y); }
        }
      }
      return min;
    };
    const key = (bs, p) => { let k = p; for (const b of bs) k = k * N + b; return k; };
    const seen = new Set();
    let layer = [];
    for (const g of goals) box[g] = 1;
    for (let i = 0; i < N; i++) {
      if (wall[i] || box[i]) continue;
      const p = reach(i), k = key(goals, p);
      if (!seen.has(k)) { seen.add(k); layer.push([goals, p]); }
    }
    for (const g of goals) box[g] = 0;
    let depth = 0;
    for (;;) {
      const next = [];
      for (const [bs, p] of layer) {
        for (const b of bs) box[b] = 1;
        reach(p, stand);
        const mine = mark;
        for (let k = 0; k < bs.length; k++) {
          const b = bs[k];
          for (const d of D) {
            const q = b + d, r = q + d;
            if (stand[q] !== mine || wall[r] || box[r]) continue;
            const nb = bs.slice();
            nb[k] = q;
            nb.sort((x, y) => x - y);
            box[b] = 0; box[q] = 1;
            const np = reach(r), nk = key(nb, np);
            box[q] = 0; box[b] = 1;
            if (seen.has(nk)) continue;
            seen.add(nk);
            next.push([nb, np]);
          }
        }
        for (const b of bs) box[b] = 0;
        if (seen.size > cap) break;
      }
      if (!next.length || seen.size > cap) break;
      layer = next;
      depth++;
    }
    return { depth, layer };
  }

  // Several rooms with random goals; keep the start that needs the most pushes. The player is
  // placed on a random cell of the start's walkable area.
  function generate(diffName, seed) {
    const { n, boxes, walls, tries, cap } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let best = null;
    for (let t = 0; t < tries || !best; t++) {
      const wall = room(n, walls, rng), floor = [];
      for (let i = 0; i < n * n; i++) if (!wall[i]) floor.push(i);
      const goals = Gamekit.shuffle(floor, rng).slice(0, boxes).sort((a, b) => a - b);
      const { depth, layer } = deepestStarts(n, wall, goals, cap);
      if (!depth || (best && depth <= best.par)) continue;
      const [bs, p] = layer[Math.floor(rng() * layer.length)];
      const goal = new Uint8Array(n * n);
      for (const g of goals) goal[g] = 1;
      const area = [], box = new Uint8Array(n * n), stack = [p];
      for (const b of bs) box[b] = 1;
      const seen = new Uint8Array(n * n);
      seen[p] = 1;
      while (stack.length) {
        const x = stack.pop();
        area.push(x);
        for (const d of [-n, n, -1, 1]) if (!seen[x + d] && !wall[x + d] && !box[x + d]) { seen[x + d] = 1; stack.push(x + d); }
      }
      best = { n, wall, goal, D: [-n, n, -1, 1], boxes: bs, player: area[Math.floor(rng() * area.length)], par: depth };
    }
    return best;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const movesEl  = document.getElementById("moves");
  const parEl    = document.getElementById("par");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const KEYS = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3, w: 0, s: 1, a: 2, d: 3, W: 0, S: 1, A: 2, D: 3 };

  let L = null, player = 0, box = null, moves = 0, pushes = 0, history = [], won = false, cellEls = [];
  let sx = 0, sy = 0, swiped = false;

  function start(P0) {
    L = P0;
    parEl.textContent = L.par;
    build();
    restart();
  }

  function restart() {
    box = new Uint8Array(L.n * L.n);
    for (const b of L.boxes) box[b] = 1;
    player = L.player;
    moves = pushes = 0;
    history = [];
    won = false;
    render();
  }

  function build() {
    const n = L.n;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + n + ", 1fr)";
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const el = document.createElement("div");
      el.dataset.i = i;
      boardEl.appendChild(el);
      cellEls.push(el);
    }
  }

  function render() {
    let onGoal = 0, total = 0;
    for (let i = 0; i < cellEls.length; i++) {
      if (box[i]) { total++; if (L.goal[i]) onGoal++; }
      cellEls[i].className = "sk-c" + (L.wall[i] ? " wall" : " floor") + (L.goal[i] ? " goal" : "") +
        (box[i] ? " box" : "") + (i === player ? " me" : "");
    }
    movesEl.textContent = moves + (moves === 1 ? " move" : " moves") + ", " + pushes + (pushes === 1 ? " push" : " pushes");
    const n = L.n;
    boardEl.setAttribute("aria-label", "Sokoban room, " + n + " by " + n + ". You are at row " + Math.floor(player / n) + ", column " + (player % n) +
      ". " + onGoal + " of " + total + " boxes on goals.");
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
    resetBtn.disabled = won || !history.length;
  }

  // One step in direction k (0 up, 1 down, 2 left, 3 right); pushes a box if one is in the way.
  function step(k, record) {
    const d = L.D[k], to = player + d;
    if (L.wall[to]) return false;
    if (box[to]) {
      if (L.wall[to + d] || box[to + d]) return false;
      if (record) history.push(snapshot());
      box[to] = 0; box[to + d] = 1;
      pushes++;
    } else if (record) history.push(snapshot());
    player = to;
    moves++;
    return true;
  }

  function snapshot() { return { player, box: box.slice(), moves, pushes }; }

  function act(k) {
    if (!L || won || !step(k, true)) return;
    after();
  }

  function after() {
    render();
    let done = true;
    for (let i = 0; i < box.length; i++) if (box[i] && !L.goal[i]) done = false;
    if (!done) return;
    won = true;
    page.win((t) => "Solved in " + moves + " moves, " + pushes + " pushes (par " + L.par + "), " + t + ".");
    render();
  }

  // Tap: an adjacent box gets pushed; any other reachable floor is walked to (one undo step).
  function tapCell(i) {
    if (won || L.wall[i] || i === player) return;
    const k = L.D.indexOf(i - player);
    if (k >= 0 && (i % L.n === player % L.n || Math.floor(i / L.n) === Math.floor(player / L.n))) { act(k); return; }
    if (box[i]) return;
    const prev = new Int16Array(L.n * L.n).fill(-1), queue = [player];
    prev[player] = player;
    for (let q = 0; q < queue.length && prev[i] < 0; q++) {
      const x = queue[q];
      for (const d of L.D) {
        const y = x + d;
        if (prev[y] < 0 && !L.wall[y] && !box[y]) { prev[y] = x; queue.push(y); }
      }
    }
    if (prev[i] < 0) return;
    const path = [];
    for (let x = i; x !== player; x = prev[x]) path.unshift(L.D.indexOf(x - prev[x]));
    history.push(snapshot());
    for (const k2 of path) step(k2, false);
    after();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".sk-c");
    if (el && !swiped) tapCell(+el.dataset.i);
  });

  // Swipe to step.
  boardEl.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; swiped = false; });
  boardEl.addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    swiped = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : (dy > 0 ? 1 : 0));
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.key in KEYS) { e.preventDefault(); act(KEYS[e.key]); }
    else if (e.key === "u" || e.key === "U" || e.key === "z" || e.key === "Z") { e.preventDefault(); undoBtn.click(); }
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    const h = history.pop();
    player = h.player; box = h.box; moves = h.moves; pushes = h.pushes;
    render();
  });

  const page = Gamekit.puzzlePage({
    id: "sokoban",
    status: "Push every box onto a goal.",
    generate,
    start,
    reset: restart,
  });
  window.addEventListener("load", () => Manpage.autoOpen("sokoban"));
})();
