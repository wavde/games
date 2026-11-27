(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const countBEl = document.getElementById("count-b");
  const countWEl = document.getElementById("count-w");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");

  const NAMES = { 1: "Black", 2: "White" };
  const DEPTHS = { easy: 2, medium: 4, hard: 8 };
  const MODES = ["human-black", "human-white", "local"];
  const DRAW_PLIES = 80;
  const store = Gamekit.storage("checkers:");

  let diff = "medium";
  let mode = store.get("mode", "human-black");
  if (!MODES.includes(mode)) mode = "human-black";
  modeSel.value = mode;

  let board, current, legal, history, lastMove, quiet, over, result, sel = null, aiTimer = null, aiGen = 0;
  let cellEls = [];

  // ---------- Rules ----------
  // Squares are 0..63 (row * 8 + col, row 0 at the top). Black starts at the bottom and moves up.
  // Pieces: 0 empty, 1 black man, 2 white man, 3 black king, 4 white king.

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const ALL_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const STEPS = { 1: ALL_DIRS.slice(0, 2), 2: ALL_DIRS.slice(2), 3: ALL_DIRS, 4: ALL_DIRS };

  function sideOf(p) { return p === EMPTY ? 0 : p % 2 ? BLACK : WHITE; }
  function isKing(p) { return p > 2; }
  function crowns(p, i) { return (p === 1 && i < 8) || (p === 2 && i >= 56); }

  function initialBoard() {
    const b = new Array(64).fill(EMPTY);
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      if ((r + c) % 2 === 0) continue;
      if (r < 3) b[i] = 2;
      else if (r > 4) b[i] = 1;
    }
    return b;
  }

  // Extend a jump sequence; captured pieces stay on the board until the move ends,
  // so they can't be jumped twice. Being crowned ends the move.
  function jumps(b, i, p, path, caps, out) {
    const r = i >> 3, c = i & 7, opp = 3 - sideOf(p);
    let more = false;
    for (const [dr, dc] of STEPS[p]) {
      const r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7) continue;
      const mid = (r + dr) * 8 + c + dc, land = r2 * 8 + c2;
      if (sideOf(b[mid]) !== opp || b[land] !== EMPTY || caps.includes(mid)) continue;
      more = true;
      const np = path.concat(land), nc = caps.concat(mid);
      if (crowns(p, land)) out.push({ path: np, caps: nc });
      else jumps(b, land, p, np, nc, out);
    }
    if (!more && caps.length) out.push({ path, caps });
  }

  // All legal moves for `side`; captures are compulsory.
  function legalMoves(b, side) {
    const caps = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (sideOf(p) !== side) continue;
      b[i] = EMPTY;
      jumps(b, i, p, [i], [], caps);
      b[i] = p;
    }
    if (caps.length) return caps;
    const out = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (sideOf(p) !== side) continue;
      const r = i >> 3, c = i & 7;
      for (const [dr, dc] of STEPS[p]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 < 0 || r2 > 7 || c2 < 0 || c2 > 7 || b[r2 * 8 + c2] !== EMPTY) continue;
        out.push({ path: [i, r2 * 8 + c2], caps: [] });
      }
    }
    return out;
  }

  function applyMove(b, m) {
    const nb = b.slice();
    const from = m.path[0], to = m.path[m.path.length - 1];
    let p = nb[from];
    nb[from] = EMPTY;
    for (const k of m.caps) nb[k] = EMPTY;
    if (crowns(p, to)) p += 2;
    nb[to] = p;
    return nb;
  }

  function count(b, side) { let n = 0; for (let i = 0; i < 64; i++) if (sideOf(b[i]) === side) n++; return n; }

  // ---------- AI: negamax alpha-beta, captures searched to quiescence ----------

  const WIN = 100000;

  function evaluate(b, side) {
    let score = 0, mine = 0, theirs = 0;
    const kings = [], foes = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const r = i >> 3, c = i & 7;
      let v;
      if (isKing(p)) v = 160 + (r > 0 && r < 7 && c > 0 && c < 7 ? 4 : 0);
      else {
        v = 100 + 3 * (p === 1 ? 7 - r : r);
        if ((p === 1 && r === 7) || (p === 2 && r === 0)) v += 8;
        if (r >= 3 && r <= 4 && c >= 2 && c <= 5) v += 4;
      }
      if (sideOf(p) === side) { score += v; mine += v; if (isKing(p)) kings.push(i); }
      else { score -= v; theirs += v; foes.push(i); }
    }
    // Ahead on material: prefer trading down, and in sparse endgames drive kings at the enemy.
    score += Math.round(300 * (mine - theirs) / (mine + theirs || 1));
    if (mine > theirs && kings.length + foes.length <= 10) {
      for (const k of kings) {
        let d = 8;
        for (const f of foes) d = Math.min(d, Math.max(Math.abs((k >> 3) - (f >> 3)), Math.abs((k & 7) - (f & 7))));
        score -= 3 * d;
      }
    }
    return score;
  }

  function ordered(b, moves) {
    if (moves[0].caps.length) return moves.sort((x, y) => y.caps.length - x.caps.length);
    return moves.sort((x, y) => crownsNext(b, y) - crownsNext(b, x));
  }
  function crownsNext(b, m) { return crowns(b[m.path[0]], m.path[m.path.length - 1]) ? 1 : 0; }

  function negamax(b, side, depth, alpha, beta, ply) {
    const moves = legalMoves(b, side);
    if (!moves.length) return -WIN + ply;
    if ((depth <= 0 && !moves[0].caps.length) || ply >= 40) return evaluate(b, side);
    let best = -Infinity;
    for (const m of ordered(b, moves)) {
      const v = -negamax(applyMove(b, m), 3 - side, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Root search keeps exact scores for every move within `tol` of the best, then picks one at random.
  function pickMove(b, side, depth, tol) {
    const moves = ordered(b, legalMoves(b, side));
    if (moves.length === 1) return moves[0];
    let best = -Infinity;
    const scored = [];
    for (const m of moves) {
      const v = -negamax(applyMove(b, m), 3 - side, depth - 1, -Infinity, -(best - tol - 1), 1);
      scored.push([m, v]);
      if (v > best) best = v;
    }
    const choices = scored.filter(([, v]) => v >= best - tol).map(([m]) => m);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // ---------- Game flow ----------

  function humanColor() { return mode === "human-white" ? WHITE : BLACK; }
  function isHumanTurn() { return mode === "local" || current === humanColor(); }

  function newGame() {
    cancelAI();
    board = initialBoard();
    current = BLACK;
    legal = legalMoves(board, current);
    history = [];
    lastMove = null;
    quiet = 0;
    over = false;
    result = null;
    sel = null;
    render();
    advance();
  }

  function play(m) {
    history.push({ board, current, lastMove, quiet });
    const progress = m.caps.length > 0 || !isKing(board[m.path[0]]);
    board = applyMove(board, m);
    lastMove = m;
    sel = null;
    quiet = progress ? 0 : quiet + 1;
    current = 3 - current;
    legal = legalMoves(board, current);
    if (!legal.length) { over = true; result = { winner: 3 - current }; }
    else if (quiet >= DRAW_PLIES) { over = true; result = { winner: 0 }; }
    if (over) finish();
    render();
    advance();
  }

  function finish() {
    if (mode === "local") return;
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    if (!result.winner) rec.d++;
    else if (result.winner === humanColor()) rec.w++;
    else rec.l++;
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
      play(pickMove(board, current, DEPTHS[diff], diff === "easy" ? 30 : 0));
    }, 350);
  }

  // Moves still consistent with the squares tapped so far.
  function candidates() {
    return legal.filter((m) => sel.every((sq, k) => m.path[k] === sq));
  }

  function tap(i) {
    if (over || !isHumanTurn()) return;
    if (sel) {
      const next = candidates().filter((m) => m.path[sel.length] === i);
      if (next.length) {
        const path = sel.concat(i);
        const done = next.find((m) => m.path.length === path.length);
        if (done) play(done);
        else { sel = path; render(); }
        return;
      }
      if (sel.length > 1) return;
      if (i === sel[0]) { sel = null; render(); return; }
    }
    sel = legal.some((m) => m.path[0] === i) ? [i] : null;
    render();
  }

  // ---------- Rendering ----------

  function buildBoard() {
    const flip = mode === "human-white";
    boardEl.innerHTML = "";
    cellEls = [];
    for (let k = 0; k < 64; k++) {
      const i = flip ? 63 - k : k;
      if (((i >> 3) + (i & 7)) % 2 === 0) {
        const d = document.createElement("div");
        d.className = "ck-light";
        boardEl.appendChild(d);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ck-cell";
      b.dataset.i = i;
      b.dataset.v = (k >> 3) + "," + (k & 7);
      boardEl.appendChild(b);
      cellEls[i] = b;
    }
  }

  function render() {
    const human = !over && isHumanTurn();
    let view = board;
    const dests = new Set(), can = new Set(), capped = new Set();
    if (sel) {
      view = board.slice();
      const p = view[sel[0]];
      view[sel[0]] = EMPTY;
      view[sel[sel.length - 1]] = p;
      for (let k = 1; k < sel.length; k++) capped.add((sel[k - 1] + sel[k]) / 2);
      for (const m of candidates()) dests.add(m.path[sel.length]);
    } else if (human) {
      for (const m of legal) can.add(m.path[0]);
    }
    const lastSet = new Set(lastMove ? [lastMove.path[0], lastMove.path[lastMove.path.length - 1]] : []);

    for (const el of cellEls) {
      if (!el) continue;
      const i = +el.dataset.i, v = view[i];
      el.className = "ck-cell" + (lastSet.has(i) ? " last" : "") + (can.has(i) ? " can" : "") +
        (dests.has(i) ? " dest" : "") + (sel && i === sel[sel.length - 1] ? " sel" : "") + (capped.has(i) ? " cap" : "");
      let piece = el.firstChild;
      if (!v) { if (piece) el.removeChild(piece); }
      else {
        if (!piece) { piece = el.appendChild(document.createElement("span")); piece.setAttribute("aria-hidden", "true"); }
        piece.className = "ck-piece " + (sideOf(v) === BLACK ? "b" : "w");
        piece.textContent = isKing(v) ? "♛" : "";
      }
      const sq = "abcdefgh"[i & 7] + (8 - (i >> 3));
      let label = v ? (sideOf(v) === BLACK ? "black " : "white ") + (isKing(v) ? "king" : "piece") : "empty";
      if (capped.has(i)) label += ", captured";
      else if (sel && i === sel[sel.length - 1]) label += ", selected";
      else if (dests.has(i)) label += ", move here";
      else if (can.has(i)) label += ", can move";
      el.setAttribute("aria-label", sq + ": " + label);
    }

    countBEl.textContent = count(board, BLACK);
    countWEl.textContent = count(board, WHITE);
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || (over && mode !== "local");

    const mustJump = legal.length && legal[0].caps.length > 0;
    if (over) {
      const loser = NAMES[3 - result.winner];
      if (!result.winner) statusEl.innerHTML = '<span class="hot">Draw — 40 moves each without a capture or advance.</span>';
      else if (mode === "local") statusEl.innerHTML = '<span class="ok">' + NAMES[result.winner] + " wins — " + loser + " has no moves.</span>";
      else if (result.winner === humanColor()) statusEl.innerHTML = '<span class="ok">You win — the AI has no moves.</span>';
      else statusEl.innerHTML = '<span class="bad">AI wins — you have no moves.</span>';
    } else if (sel && sel.length > 1) {
      statusEl.textContent = "Keep jumping.";
    } else if (mode === "local") {
      statusEl.textContent = NAMES[current] + " to move." + (mustJump ? " Must jump." : "");
    } else {
      statusEl.textContent = human ? (mustJump ? "Your move — you must jump." : "Your move.") : "AI thinking…";
    }
  }

  boardEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".ck-cell");
    if (cell) tap(+cell.dataset.i);
  });

  boardEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sel) {
      e.stopPropagation();
      sel = null;
      render();
    }
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local")) return;
    cancelAI();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.current !== humanColor());
    board = h.board; current = h.current; lastMove = h.lastMove; quiet = h.quiet;
    legal = legalMoves(board, current);
    over = false;
    result = null;
    sel = null;
    render();
    advance();
  });

  newBtn.addEventListener("click", newGame);

  modeSel.addEventListener("change", () => {
    mode = modeSel.value;
    store.set("mode", mode);
    buildBoard();
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
  window.addEventListener("load", () => Manpage.autoOpen("checkers"));

  // Arrows: Left/Right jump to the next dark square in the row; Up/Down zig-zag
  // within a two-column band so every dark square stays reachable.
  Gamekit.gridKeys(boardEl, {
    selector: ".ck-cell",
    next: (el, key) => {
      let [r, c] = el.dataset.v.split(",").map(Number);
      if (key === "ArrowRight") c += 2;
      else if (key === "ArrowLeft") c -= 2;
      else {
        r += key === "ArrowDown" ? 1 : -1;
        c += c % 2 ? -1 : 1;
      }
      return boardEl.querySelector('.ck-cell[data-v="' + r + "," + c + '"]');
    },
  });
})();
