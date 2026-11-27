(function () {
  "use strict";

  const N = 15;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const LEVELS = {
    easy:   { depth: 0, top: 4 },
    medium: { depth: 0, top: 1 },
    hard:   { depth: 4, width: 8 },
  };

  // ---------- AI (no DOM) ----------

  // Every run of 5 cells in the four directions.
  const WINDOWS = [], WINS_OF = Array.from({ length: N * N }, () => []);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + dr * 4, ec = c + dc * 4;
      if (er < 0 || er >= N || ec < 0 || ec >= N) continue;
      const w = [];
      for (let k = 0; k < 5; k++) w.push((r + dr * k) * N + c + dc * k);
      for (const i of w) WINS_OF[i].push(WINDOWS.length);
      WINDOWS.push(w);
    }
  }
  const PLACE = [0, 1, 8, 60, 600, 100000];   // value of a window reaching k own stones
  const BOARD = [0, 1, 10, 100, 1000, 1000000];

  function isFive(b, i) {
    const p = b[i];
    if (!p) return false;
    const r0 = Math.floor(i / N), c0 = i % N;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let k = 1;
      for (const s of [1, -1]) {
        let r = r0 + dr * s, c = c0 + dc * s;
        while (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === p) { k++; r += dr * s; c += dc * s; }
      }
      if (k >= 5) return true;
    }
    return false;
  }

  // How much placing p at i helps p (attack) plus how much it stops the opponent (defence).
  function cellScore(b, i, p) {
    let att = 0, def = 0;
    for (const wi of WINS_OF[i]) {
      let mine = 0, theirs = 0;
      for (const j of WINDOWS[wi]) { if (b[j] === p) mine++; else if (b[j]) theirs++; }
      if (!theirs) att += PLACE[mine + 1];
      if (!mine) def += PLACE[theirs + 1];
    }
    return att + def * 0.8;
  }

  function evaluate(b, p) {
    let s = 0;
    for (const w of WINDOWS) {
      let a = 0, o = 0;
      for (const j of w) { if (b[j] === p) a++; else if (b[j]) o++; }
      if (a && !o) s += BOARD[a];
      else if (o && !a) s -= BOARD[o] * 1.2;
    }
    return s;
  }

  // Empty cells within two steps of any stone, best heuristic first.
  function candidates(b, p, limit) {
    const near = new Uint8Array(N * N);
    let any = false;
    for (let i = 0; i < N * N; i++) {
      if (!b[i]) continue;
      any = true;
      const r = Math.floor(i / N), c = i % N;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N && !b[rr * N + cc]) near[rr * N + cc] = 1;
      }
    }
    if (!any) return [Math.floor(N / 2) * N + Math.floor(N / 2)];
    const list = [];
    for (let i = 0; i < N * N; i++) if (near[i]) list.push({ i, s: cellScore(b, i, p) });
    list.sort((x, y) => y.s - x.s);
    return (limit ? list.slice(0, limit) : list).map(x => x.i);
  }

  function negamax(b, p, depth, alpha, beta, width) {
    if (depth === 0) return evaluate(b, p);
    const moves = candidates(b, p, width);
    if (!moves.length) return 0;
    let best = -Infinity;
    for (const m of moves) {
      b[m] = p;
      const v = isFive(b, m) ? 1e9 + depth : -negamax(b, 3 - p, depth - 1, -beta, -alpha, width);
      b[m] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function pickMove(board, p, levelName, rand) {
    const L = LEVELS[levelName], b = board.slice();
    const all = candidates(b, p, 0);
    // Always take a win; otherwise always block the opponent's immediate five.
    for (const i of all) { b[i] = p; const w = isFive(b, i); b[i] = 0; if (w) return i; }
    for (const i of all) { b[i] = 3 - p; const w = isFive(b, i); b[i] = 0; if (w) return i; }
    if (!L.depth) return all[Math.floor(rand() * Math.min(L.top, all.length))];
    let best = -Infinity, choice = all[0];
    for (const m of all.slice(0, L.width + 4)) {
      b[m] = p;
      const v = -negamax(b, 3 - p, L.depth - 1, -Infinity, -best, L.width);
      b[m] = 0;
      if (v > best) { best = v; choice = m; }
    }
    return choice;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");
  const MODES = ["human-black", "human-white", "local"];
  const STARS = new Set([3 * N + 3, 3 * N + 11, 7 * N + 7, 11 * N + 3, 11 * N + 11]);
  const store = Gamekit.storage("gomoku:");

  let diff = "medium";
  let mode = store.get("mode", "human-black");
  if (!MODES.includes(mode)) mode = "human-black";
  modeSel.value = mode;

  let board, current, history, last, over, winLine, aiTimer = null, aiGen = 0;
  let cellEls = [];

  function humanColor() { return mode === "human-white" ? WHITE : BLACK; }
  function isHumanTurn() { return mode === "local" || current === humanColor(); }

  function lineThrough(i) {
    const p = board[i], r0 = Math.floor(i / N), c0 = i % N;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [i];
      for (const s of [1, -1]) {
        let r = r0 + dr * s, c = c0 + dc * s;
        while (r >= 0 && r < N && c >= 0 && c < N && board[r * N + c] === p) { line.push(r * N + c); r += dr * s; c += dc * s; }
      }
      if (line.length >= 5) return line;
    }
    return [];
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    cellEls = [];
    for (let i = 0; i < N * N; i++) {
      const b = document.createElement("button");
      b.type = "button";
      const r = Math.floor(i / N), c = i % N;
      b.className = "gm-cell" + (r === 0 ? " t" : "") + (r === N - 1 ? " b" : "") + (c === 0 ? " l" : "") + (c === N - 1 ? " r" : "") + (STARS.has(i) ? " star" : "");
      b.dataset.i = i;
      boardEl.appendChild(b);
      cellEls.push(b);
    }
  }

  function newGame() {
    cancelAI();
    board = new Array(N * N).fill(EMPTY);
    current = BLACK;
    history = [];
    last = -1;
    over = false;
    winLine = [];
    render();
    advance();
  }

  function play(i) {
    history.push({ board: board.slice(), current, last });
    board[i] = current;
    last = i;
    if (isFive(board, i)) { over = true; winLine = lineThrough(i); finish(current); }
    else if (board.every(v => v)) { over = true; finish(0); }
    else current = 3 - current;
    render();
    advance();
  }

  function finish(winner) {
    if (mode === "local") return;
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    if (!winner) rec.d++; else if (winner === humanColor()) rec.w++; else rec.l++;
    store.setJSON("rec:" + diff, rec);
  }

  function cancelAI() {
    aiGen++;
    if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; }
  }

  function advance() {
    if (over || isHumanTurn()) return;
    const gen = ++aiGen;
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (gen !== aiGen || over || isHumanTurn()) return;
      play(pickMove(board, current, diff, Math.random));
    }, 250);
  }

  function render() {
    const win = new Set(winLine), canPlay = !over && isHumanTurn();
    for (let i = 0; i < N * N; i++) {
      const el = cellEls[i], v = board[i];
      el.classList.toggle("avail", canPlay && !v);
      el.classList.toggle("ghost-w", canPlay && !v && current === WHITE);
      let stone = el.firstChild;
      if (!v) { if (stone) el.removeChild(stone); }
      else {
        if (!stone) stone = el.appendChild(document.createElement("span"));
        stone.className = "gm-stone " + (v === BLACK ? "b" : "w") + (i === last ? " last" : "") + (win.has(i) ? " win" : "");
      }
      const r = Math.floor(i / N), c = i % N;
      el.setAttribute("aria-label", "abcdefghjklmnop"[c] + (N - r) + ": " + (v === BLACK ? "black" : v === WHITE ? "white" : "empty"));
    }
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || (over && mode !== "local");

    const name = current === BLACK ? "Black" : "White";
    if (over) {
      const winner = winLine.length ? board[winLine[0]] : 0;
      if (!winner) statusEl.innerHTML = '<span class="hot">Board full — draw.</span>';
      else if (mode === "local") statusEl.innerHTML = '<span class="ok">' + (winner === BLACK ? "Black" : "White") + ' wins.</span>';
      else statusEl.innerHTML = winner === humanColor() ? '<span class="ok">You win.</span>' : '<span class="bad">AI wins.</span>';
    } else if (mode === "local") statusEl.textContent = name + " to move.";
    else statusEl.textContent = isHumanTurn() ? "Your move (" + name.toLowerCase() + ")." : "AI thinking…";
  }

  boardEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".gm-cell");
    if (!cell || over || !isHumanTurn()) return;
    const i = parseInt(cell.dataset.i, 10);
    if (board[i]) return;
    play(i);
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local")) return;
    cancelAI();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.current !== humanColor());
    board = h.board; current = h.current; last = h.last;
    over = false;
    winLine = [];
    render();
    advance();
  });

  newBtn.addEventListener("click", newGame);

  modeSel.addEventListener("change", () => {
    mode = modeSel.value;
    store.set("mode", mode);
    newGame();
  });

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newGame(); },
  });
  diff = chips.get();

  buildBoard();
  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("gomoku"));

  Gamekit.gridKeys(boardEl, { selector: ".gm-cell" });
})();
