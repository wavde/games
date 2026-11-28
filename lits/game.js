(function () {
  "use strict";

  // ---------- boards + rules (no DOM) ----------
  // n×n grid cut into regions. Shade one tetromino (L, I, T, or S; never the 2×2 square) in
  // every region so that all shaded cells connect, no 2×2 block is fully shaded, and two
  // tetrominoes of the same shape never touch along an edge.
  // Boards come from puzzles.js, a bank made offline by .github/tools/lits.mjs (making a board
  // with exactly one answer takes seconds); CI re-checks every one.

  const ID = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function orth(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  function decode(code) {
    const [ns, body] = code.split(":"), n = +ns, reg = Array.from(body, (ch) => ID.indexOf(ch));
    const regions = Array.from({ length: Math.max(...reg) + 1 }, () => []);
    reg.forEach((k, i) => regions[k].push(i));
    return { n, reg, regions, nb: Array.from({ length: n * n }, (_, i) => orth(n, i)) };
  }

  function pick(level, seed) {
    const bank = window.LITS_PUZZLES[level];
    return decode(bank[seed % bank.length]);
  }

  // L, I, T, S for four connected cells, "" for the square or anything else.
  function shapeOf(P, cells) {
    if (cells.length !== 4) return "";
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) for (const j of P.nb[stack.pop()]) if (cells.includes(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
    if (seen.size !== 4) return "";
    const rows = new Map(), cols = new Map();
    let deg3 = false;
    for (const i of cells) {
      const r = Math.floor(i / P.n), c = i % P.n;
      rows.set(r, (rows.get(r) || 0) + 1);
      cols.set(c, (cols.get(c) || 0) + 1);
      if (P.nb[i].filter((j) => cells.includes(j)).length === 3) deg3 = true;
    }
    const line = Math.max(...rows.values(), ...cols.values());
    if (line === 4) return "I";
    if (deg3) return "T";
    if (line === 3) return "L";
    return rows.size === 2 && cols.size === 2 ? "" : "S";
  }

  // Each region's shape (or ""), and the cells breaking a rule right now.
  function check(P, v) {
    const shape = P.regions.map((R) => shapeOf(P, R.filter((i) => v[i] === 1)));
    const bad = new Set();
    P.regions.forEach((R) => { const on = R.filter((i) => v[i] === 1); if (on.length > 4) on.forEach((i) => bad.add(i)); });
    const n = P.n;
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
      const b = [r * n + c, r * n + c + 1, r * n + c + n, r * n + c + n + 1];
      if (b.every((i) => v[i] === 1)) b.forEach((i) => bad.add(i));
    }
    for (let i = 0; i < v.length; i++) {
      if (v[i] !== 1 || !shape[P.reg[i]]) continue;
      for (const j of P.nb[i]) if (v[j] === 1 && P.reg[j] !== P.reg[i] && shape[P.reg[j]] === shape[P.reg[i]]) { bad.add(i); bad.add(j); }
    }
    return { shape, bad };
  }

  function solved(P, v) {
    const { shape, bad } = check(P, v);
    if (bad.size || shape.some((s) => !s)) return false;
    const start = v.indexOf(1), seen = new Uint8Array(v.length), stack = [start];
    seen[start] = 1;
    while (stack.length) for (const j of P.nb[stack.pop()]) if (v[j] === 1 && !seen[j]) { seen[j] = 1; stack.push(j); }
    return v.every((x, i) => x !== 1 || seen[i]);
  }

  function tints(P) {
    const k = P.regions.length, adj = Array.from({ length: k }, () => new Set());
    for (let i = 0; i < P.reg.length; i++) for (const j of P.nb[i]) if (P.reg[i] !== P.reg[j]) adj[P.reg[i]].add(P.reg[j]);
    const col = new Int8Array(k).fill(-1);
    for (const a of Array.from({ length: k }, (_, x) => x).sort((x, y) => adj[y].size - adj[x].size)) {
      const used = new Set([...adj[a]].map((j) => col[j]));
      let c = 0;
      while (used.has(c)) c++;
      col[a] = c;
    }
    return col;
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
  const STATUS = "One L, I, T, or S per region; all connected; same shapes never touch.";
  const store = Gamekit.storage("lits:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });
  const NAME = ["empty", "shaded", "dot"];

  let diff = "medium";
  let P = null, mark = null, history = [], won = false, cellEls = [], dailyDate = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("lits", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = pick(diff, seed);
    mark = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
    build();
    clock.start();
    statusEl.textContent = STATUS;
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

  function render() {
    const n = P.n, v = Int8Array.from(mark, (m) => (m === 1 ? 1 : 0)), { shape, bad } = check(P, v);
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], m = mark[i], sh = m === 1 ? shape[P.reg[i]] : "";
      el.className = "lt-cell" + el.dataset.edge + (m === 1 ? " on" : m === 2 ? " dot" : "") + (sh ? " s" + sh : "") + (bad.has(i) ? " err" : "");
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", region " + (P.reg[i] + 1) +
        ", " + NAME[m] + (sh ? ", " + sh + " shape" : "") + (bad.has(i) ? ", breaks a rule" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(i, x) {
    if (won || mark[i] === x) return;
    history.push({ i, v: mark[i] });
    mark[i] = x;
    render();
    if (solved(P, Int8Array.from(mark, (m) => (m === 1 ? 1 : 0)))) {
      won = true;
      const s = clock.stop();
      if (dailyDate) Gamekit.markDailySolved("lits", diff, dailyDate);
      statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
      render();
    }
  }

  const toggleDot = (i) => set(i, mark[i] === 2 ? 0 : 2);

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".lt-cell");
    if (el) set(+el.dataset.i, (mark[+el.dataset.i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".lt-cell");
    if (!el) return;
    e.preventDefault();
    toggleDot(+el.dataset.i);
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
  window.addEventListener("load", () => Manpage.autoOpen("lits"));

  Gamekit.gridKeys(boardEl, { selector: ".lt-cell", onSecondary: (el) => toggleDot(+el.dataset.i) });
})();
