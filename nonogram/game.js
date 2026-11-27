(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeEl   = document.getElementById("mode");

  const DIFFS = {
    easy:   { n: 5,  density: 0.6 },
    medium: { n: 8,  density: 0.6 },
    hard:   { n: 10, density: 0.58 },
  };
  const EMPTY = 0, FILL = 1, MARK = 2;
  const STATUS = "Fill cells to match the clues.";
  const store = Gamekit.storage("nonogram:");

  let diff = "medium";
  let N = DIFFS[diff].n;
  let sol = [], rowClues = [], colClues = [];
  let grid = [];
  let history = [];
  let won = false;
  let mode = "fill";
  let cellEls = [], rowClueEls = [], colClueEls = [];
  let timerStart = 0, timerInterval = null;

  // ---------- Clues + line solver ----------

  function clueOf(line) {
    const out = [];
    let run = 0;
    for (const v of line) {
      if (v === 1) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out;
  }

  // cur: -1 unknown, 0 empty, 1 filled. Returns the line with every cell forced by
  // all placements consistent with `cur`, or null if no placement fits.
  function lineSolve(clue, cur) {
    const n = cur.length, k = clue.length;
    const canFill = new Array(n).fill(false), canEmpty = new Array(n).fill(false);
    const line = new Array(n).fill(0);
    const minRest = new Array(k);
    let s = 0;
    for (let b = k - 1; b >= 0; b--) { s += clue[b] + (b < k - 1 ? 1 : 0); minRest[b] = s; }
    let any = false;

    function place(b, start) {
      if (b === k) {
        for (let i = start; i < n; i++) if (cur[i] === 1) return;
        any = true;
        for (let i = 0; i < n; i++) { if (line[i]) canFill[i] = true; else canEmpty[i] = true; }
        return;
      }
      const len = clue[b];
      for (let p = start; p + minRest[b] <= n; p++) {
        if (p > start && cur[p - 1] === 1) break;
        let ok = true;
        for (let i = p; i < p + len; i++) if (cur[i] === 0) { ok = false; break; }
        if (!ok) continue;
        if (p + len < n && cur[p + len] === 1) continue;
        for (let i = p; i < p + len; i++) line[i] = 1;
        place(b + 1, p + len + 1);
        for (let i = p; i < p + len; i++) line[i] = 0;
      }
    }
    place(0, 0);
    if (!any) return null;
    return cur.map((v, i) => canFill[i] && !canEmpty[i] ? 1 : canEmpty[i] && !canFill[i] ? 0 : v);
  }

  // Propagates line logic to a fixed point. A fully determined grid means the
  // puzzle has exactly one solution and needs no guessing.
  function lineSolvable(rows, cols, n) {
    const g = new Array(n * n).fill(-1);
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < n; r++) {
        const cur = g.slice(r * n, r * n + n);
        const res = lineSolve(rows[r], cur);
        if (!res) return false;
        for (let c = 0; c < n; c++) if (res[c] !== cur[c]) { g[r * n + c] = res[c]; changed = true; }
      }
      for (let c = 0; c < n; c++) {
        const cur = [];
        for (let r = 0; r < n; r++) cur.push(g[r * n + c]);
        const res = lineSolve(cols[c], cur);
        if (!res) return false;
        for (let r = 0; r < n; r++) if (res[r] !== cur[r]) { g[r * n + c] = res[r]; changed = true; }
      }
    }
    return !g.includes(-1);
  }

  function cluesFor(s, n) {
    const rows = [], cols = [];
    for (let r = 0; r < n; r++) rows.push(clueOf(s.slice(r * n, r * n + n)));
    for (let c = 0; c < n; c++) {
      const col = [];
      for (let r = 0; r < n; r++) col.push(s[r * n + c]);
      cols.push(clueOf(col));
    }
    return { rows, cols };
  }

  function generate(seed) {
    const { n, density } = DIFFS[diff];
    const rng = Gamekit.mulberry32(seed);
    for (let attempt = 0; attempt < 2000; attempt++) {
      const s = [];
      for (let i = 0; i < n * n; i++) s.push(rng() < density ? 1 : 0);
      const { rows, cols } = cluesFor(s, n);
      if (lineSolvable(rows, cols, n)) return { s, rows, cols };
    }
    // Practically unreachable; a full grid is always line-solvable.
    const s = new Array(n * n).fill(1);
    return Object.assign({ s }, cluesFor(s, n));
  }

  // ---------- Game ----------

  function newPuzzle(seedOverride) {
    N = DIFFS[diff].n;
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("nonogram", diff);
    const p = generate(seed);
    sol = p.s; rowClues = p.rows; colClues = p.cols;
    grid = new Array(N * N).fill(EMPTY);
    history = [];
    won = false;
    buildBoard();
    startTimer();
    statusEl.textContent = STATUS;
    updateBest();
  }

  function clueSpans(el, clue) {
    el.innerHTML = "";
    (clue.length ? clue : [0]).forEach(v => {
      const s = document.createElement("span");
      s.textContent = v;
      el.appendChild(s);
    });
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--n", N);
    cellEls = []; rowClueEls = []; colClueEls = [];
    boardEl.appendChild(document.createElement("div"));
    for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "ng-colclue";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Column " + (c + 1) + " clue: " + (colClues[c].join(" ") || "0"));
      clueSpans(el, colClues[c]);
      boardEl.appendChild(el);
      colClueEls.push(el);
    }
    for (let r = 0; r < N; r++) {
      const rc = document.createElement("div");
      rc.className = "ng-rowclue";
      rc.setAttribute("role", "img");
      rc.setAttribute("aria-label", "Row " + (r + 1) + " clue: " + (rowClues[r].join(" ") || "0"));
      clueSpans(rc, rowClues[r]);
      boardEl.appendChild(rc);
      rowClueEls.push(rc);
      for (let c = 0; c < N; c++) {
        const el = document.createElement("div");
        let cls = "ng-cell";
        if (r === 0) cls += " top";
        if (c === 0) cls += " left";
        if (N > 5 && (c + 1) % 5 === 0 && c < N - 1) cls += " t5r";
        if (N > 5 && (r + 1) % 5 === 0 && r < N - 1) cls += " t5b";
        el.className = cls;
        el.dataset.i = r * N + c;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", "Row " + (r + 1) + " column " + (c + 1));
        boardEl.appendChild(el);
        cellEls.push(el);
      }
    }
    fitBoard();
    syncAll();
  }

  // Largest cell size (16–40px) at which the whole board, clues included, fits the panel.
  function fitBoard() {
    if (!cellEls.length) return;
    const panel = boardEl.parentElement;
    const cs = getComputedStyle(panel);
    const avail = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let cell = 40;
    for (; cell > 16; cell--) {
      boardEl.style.setProperty("--cell", cell + "px");
      if (boardEl.getBoundingClientRect().width <= avail) break;
    }
    boardEl.style.setProperty("--cell", cell + "px");
  }

  function lineMatches(values, clue) {
    const got = clueOf(values);
    return got.length === clue.length && got.every((v, i) => v === clue[i]);
  }

  function syncAll() {
    for (let i = 0; i < N * N; i++) {
      cellEls[i].classList.toggle("fill", grid[i] === FILL);
      cellEls[i].classList.toggle("mark", grid[i] === MARK);
      cellEls[i].setAttribute("aria-label", "Row " + (Math.floor(i / N) + 1) + " column " + (i % N + 1) + (grid[i] === FILL ? ", filled" : grid[i] === MARK ? ", marked" : ""));
    }
    for (let r = 0; r < N; r++) {
      rowClueEls[r].classList.toggle("done", lineMatches(grid.slice(r * N, r * N + N).map(v => v === FILL ? 1 : 0), rowClues[r]));
    }
    for (let c = 0; c < N; c++) {
      const col = [];
      for (let r = 0; r < N; r++) col.push(grid[r * N + c] === FILL ? 1 : 0);
      colClueEls[c].classList.toggle("done", lineMatches(col, colClues[c]));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || history.length === 0;
  }

  function checkWin() {
    for (let i = 0; i < N * N; i++) if ((grid[i] === FILL) !== (sol[i] === 1)) return;
    won = true;
    clearInterval(timerInterval);
    const s = Math.floor((Date.now() - timerStart) / 1000);
    timeEl.textContent = Gamekit.fmtTime(s);
    const best = store.getInt("best:" + diff, null);
    if (best === null || s < best) store.set("best:" + diff, s);
    updateBest();
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + '.</span>';
    syncAll();
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

  // ---------- Painting (tap or straight-line drag) ----------

  let stroke = null; // { start, axis, kind, value, snapshot, changed }

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest(".ng-cell");
    return cell && boardEl.contains(cell) ? parseInt(cell.dataset.i, 10) : -1;
  }

  // Filling/marking only touches empty cells; clearing only touches cells of the stroke's kind.
  function paint(i) {
    const v = grid[i];
    if (stroke.value === EMPTY ? v !== stroke.kind : v !== EMPTY) return;
    grid[i] = stroke.value;
    stroke.changed = true;
  }

  function paintTo(i) {
    const sr = Math.floor(stroke.start / N), sc = stroke.start % N;
    const r = Math.floor(i / N), c = i % N;
    if (!stroke.axis) {
      if (r === sr && c !== sc) stroke.axis = "row";
      else if (c === sc && r !== sr) stroke.axis = "col";
      else return;
    }
    if (stroke.axis === "row") {
      for (let x = Math.min(sc, c); x <= Math.max(sc, c); x++) paint(sr * N + x);
    } else {
      for (let y = Math.min(sr, r); y <= Math.max(sr, r); y++) paint(y * N + sc);
    }
  }

  function highlight(i) {
    const r = i < 0 ? -1 : Math.floor(i / N), c = i < 0 ? -1 : i % N;
    cellEls.forEach((el, k) => el.classList.toggle("hl", i >= 0 && (Math.floor(k / N) === r || k % N === c)));
  }

  boardEl.addEventListener("pointerdown", (e) => {
    if (won) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    const kind = (e.button === 2 || mode === "mark") ? MARK : FILL;
    stroke = { start: i, axis: null, kind, value: grid[i] === kind ? EMPTY : kind, snapshot: grid.slice(), changed: false };
    paint(i);
    highlight(i);
    syncAll();
  });

  window.addEventListener("pointermove", (e) => {
    if (!stroke) return;
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i < 0) return;
    paintTo(i);
    syncAll();
  });

  function endStroke() {
    if (!stroke) return;
    if (stroke.changed) history.push(stroke.snapshot);
    stroke = null;
    highlight(-1);
    syncAll();
    checkWin();
  }
  window.addEventListener("pointerup", endStroke);
  window.addEventListener("pointercancel", endStroke);
  boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard: Enter/Space applies the current tool to one cell, F/X marks it.
  function keyPaint(i, kind) {
    if (won) return;
    stroke = { start: i, axis: null, kind, value: grid[i] === kind ? EMPTY : kind, snapshot: grid.slice(), changed: false };
    paint(i);
    endStroke();
  }
  Gamekit.gridKeys(boardEl, {
    selector: ".ng-cell",
    onActivate: (el) => keyPaint(parseInt(el.dataset.i, 10), mode === "mark" ? MARK : FILL),
    onSecondary: (el) => keyPaint(parseInt(el.dataset.i, 10), MARK),
  });

  modeEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    mode = b.dataset.mode;
    modeEl.querySelectorAll(".chip").forEach(x => {
      const on = x === b;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });

  undoBtn.addEventListener("click", () => {
    if (won) return;
    const h = history.pop();
    if (!h) return;
    grid = h;
    syncAll();
  });

  resetBtn.addEventListener("click", () => {
    grid = new Array(N * N).fill(EMPTY);
    history = [];
    won = false;
    startTimer();
    statusEl.textContent = STATUS;
    syncAll();
  });

  newBtn.addEventListener("click", () => newPuzzle(Gamekit.randomSeed()));
  window.addEventListener("resize", fitBoard);

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
  window.addEventListener("load", () => { fitBoard(); Manpage.autoOpen("nonogram"); });
})();
