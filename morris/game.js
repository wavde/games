(function () {
  "use strict";

  // ---------- rules + AI (no DOM) ----------
  // 24 points on three nested squares. Point r*8 + k: ring r (0 outer, 2 inner), k = 0..7
  // clockwise from the top-left corner; odd k are side midpoints, joined to the next ring.
  // State: b[24] (0 empty, 1 white, 2 black), hand[side] pieces still to place, turn, quiet
  // (plies since the last capture once every piece is placed).

  const WHITE = 1, BLACK = 2, DRAW_PLIES = 50;
  const NAMES = ["", "White", "Black"];
  const POS = [];
  for (let r = 0; r < 3; r++) {
    const lo = r, hi = 6 - r, mid = 3;
    POS.push([lo, lo], [mid, lo], [hi, lo], [hi, mid], [hi, hi], [mid, hi], [lo, hi], [lo, mid]);
  }
  const ADJ = Array.from({ length: 24 }, () => []);
  const MILLS = [];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 8; k++) {
      ADJ[r * 8 + k].push(r * 8 + (k + 1) % 8, r * 8 + (k + 7) % 8);
      if (k % 2) { if (r > 0) ADJ[r * 8 + k].push((r - 1) * 8 + k); if (r < 2) ADJ[r * 8 + k].push((r + 1) * 8 + k); }
    }
    for (const k of [0, 2, 4, 6]) MILLS.push([r * 8 + k, r * 8 + k + 1, r * 8 + (k + 2) % 8]);
  }
  for (const k of [1, 3, 5, 7]) MILLS.push([k, 8 + k, 16 + k]);
  const MILLS_AT = Array.from({ length: 24 }, (_, i) => MILLS.filter((m) => m.includes(i)));

  function initial() { return { b: new Int8Array(24), hand: [0, 9, 9], turn: WHITE, quiet: 0 }; }
  const clone = (S) => ({ b: S.b.slice(), hand: S.hand.slice(), turn: S.turn, quiet: S.quiet });
  const onBoard = (S, p) => { let n = 0; for (let i = 0; i < 24; i++) if (S.b[i] === p) n++; return n; };

  function inMill(b, i) { const p = b[i]; return MILLS_AT[i].some((m) => b[m[0]] === p && b[m[1]] === p && b[m[2]] === p); }

  // Would piece p standing on `to` (having left `from`) close a mill?
  function closes(b, p, from, to) {
    return MILLS_AT[to].some((m) => m.every((x) => x === to || (x !== from && b[x] === p)));
  }

  // Enemy pieces that may be taken: any not in a mill, or any at all if every one is in a mill.
  function takeable(b, o) {
    const all = [], free = [];
    for (let i = 0; i < 24; i++) if (b[i] === o) { all.push(i); if (!inMill(b, i)) free.push(i); }
    return free.length ? free : all;
  }

  // Moves: { from (-1 = place from hand), to, take (-1 = none) }.
  function legalMoves(S) {
    const p = S.turn, o = 3 - p, b = S.b, out = [];
    const base = [];
    if (S.hand[p]) { for (let i = 0; i < 24; i++) if (!b[i]) base.push([-1, i]); }
    else {
      const fly = onBoard(S, p) === 3;
      for (let i = 0; i < 24; i++) {
        if (b[i] !== p) continue;
        if (fly) { for (let j = 0; j < 24; j++) if (!b[j]) base.push([i, j]); }
        else for (const j of ADJ[i]) if (!b[j]) base.push([i, j]);
      }
    }
    for (const [from, to] of base) {
      if (!closes(b, p, from, to)) { out.push({ from, to, take: -1 }); continue; }
      const t = b.slice();
      if (from >= 0) t[from] = 0;
      t[to] = p;
      for (const x of takeable(t, o)) out.push({ from, to, take: x });
    }
    return out;
  }

  function applyMove(S, m) {
    const p = S.turn;
    if (m.from < 0) S.hand[p]--; else S.b[m.from] = 0;
    S.b[m.to] = p;
    if (m.take >= 0) { S.b[m.take] = 0; S.quiet = 0; }
    else if (!S.hand[1] && !S.hand[2]) S.quiet++;
    S.turn = 3 - p;
  }

  // null while play goes on, else { winner } (0 = draw). The side to move loses with fewer
  // than three pieces left or no legal move.
  function outcome(S, moves) {
    const p = S.turn;
    if (onBoard(S, p) + S.hand[p] < 3) return { winner: 3 - p, why: "pieces" };
    if (!(moves || legalMoves(S)).length) return { winner: 3 - p, why: "blocked" };
    if (S.quiet >= DRAW_PLIES) return { winner: 0, why: "quiet" };
    return null;
  }

  // Score for the side to move: material, open twos (two of a line with the third empty),
  // and freedom to move.
  function evaluate(S) {
    const p = S.turn, o = 3 - p, b = S.b;
    let s = (onBoard(S, p) + S.hand[p] - onBoard(S, o) - S.hand[o]) * 100;
    for (const m of MILLS) {
      let a = 0, c = 0, e = 0;
      for (const x of m) { if (b[x] === p) a++; else if (b[x] === o) c++; else e++; }
      if (e === 1) { if (a === 2) s += 14; else if (c === 2) s -= 14; }
    }
    if (!S.hand[1] && !S.hand[2]) {
      let mp = 0, mo = 0;
      for (let i = 0; i < 24; i++) {
        if (!b[i]) continue;
        let f = 0;
        for (const j of ADJ[i]) if (!b[j]) f++;
        if (b[i] === p) mp += f; else mo += f;
      }
      s += (mp - mo) * 4;
    }
    return s;
  }

  const WIN = 100000;

  // At the horizon, keep playing out mills (a capture swings the score by a whole piece)
  // until the position is quiet; either side may also stand pat.
  function quiesce(S, alpha, beta, ply, left) {
    const stand = evaluate(S);
    if (!left || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    let best = stand;
    for (const m of legalMoves(S)) {
      if (m.take < 0) continue;
      const T = clone(S);
      applyMove(T, m);
      const res = outcome(T);
      const v = res ? (res.winner ? WIN - ply - 1 : 0) : -quiesce(T, -beta, -alpha, ply + 1, left - 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Alpha-beta with a transposition table (clock.tt): positions reached by different move
  // orders are searched once per depth, and their best move is tried first next time.
  function negamax(S, depth, alpha, beta, ply, clock) {
    const moves = legalMoves(S), res = outcome(S, moves);
    if (res) return res.winner ? -(WIN - ply) : 0;
    if (depth === 0) return quiesce(S, alpha, beta, ply, 4);
    if (clock.out()) return 0;
    const key = S.b.join("") + S.hand[1] + "," + S.hand[2] + S.turn + (S.quiet > DRAW_PLIES - 12 ? "q" + S.quiet : "");
    const hit = clock.tt.get(key), a0 = alpha;
    if (hit && hit.depth >= depth && Math.abs(hit.v) < WIN - 200) {
      if (hit.flag === 0) return hit.v;
      if (hit.flag === 1 && hit.v >= beta) return hit.v;
      if (hit.flag === -1 && hit.v <= alpha) return hit.v;
    }
    moves.sort((x, y) => (y.take >= 0) - (x.take >= 0));
    if (hit && hit.best) {
      const k = moves.findIndex((m) => m.from === hit.best.from && m.to === hit.best.to && m.take === hit.best.take);
      if (k > 0) moves.unshift(moves.splice(k, 1)[0]);
    }
    let best = -Infinity, bestMove = null;
    for (const m of moves) {
      const T = clone(S);
      applyMove(T, m);
      const v = -negamax(T, depth - 1, -beta, -alpha, ply + 1, clock);
      if (v > best) { best = v; bestMove = m; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (!clock.out()) clock.tt.set(key, { depth, v: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0, best: bestMove });
    return best;
  }

  // Best move at `depth` (iterative deepening up to it within `budget` ms); with `noise`,
  // a random move among those within noise of the best.
  function pickMove(S, depth, noise, budget, rng) {
    const moves = legalMoves(S);
    if (moves.length === 1) return moves[0];
    const t0 = Date.now(), clock = { out: () => Date.now() - t0 > budget, tt: new Map() };
    let scored = moves.map((m) => ({ m, v: 0 })), chosen = moves[0];
    // Even depths only: a search that ends on its own move overrates it.
    for (let d = depth % 2 ? 1 : 2; d <= depth; d += 2) {
      const next = [];
      let alpha = -Infinity, best = null, aborted = false;
      for (const { m } of scored) {
        const T = clone(S);
        applyMove(T, m);
        // Without noise only the best move needs an exact score; the rest are just bounds.
        const v = -negamax(T, d - 1, -Infinity, noise ? Infinity : -alpha, 1, clock);
        if (clock.out() && d > 2) { aborted = true; break; }
        next.push({ m, v });
        if (v > alpha) { alpha = v; best = m; }
      }
      if (aborted) break;
      chosen = best;
      scored = next.sort((x, y) => (y.m === best) - (x.m === best) || y.v - x.v);
      if (alpha >= WIN - 100) break;
    }
    if (!noise) return chosen;
    const top = scored.filter((x) => x.v >= scored[0].v - noise);
    return top[Math.floor((rng || Math.random)() * top.length)].m;
  }

  // ---------- game ----------

  const DEPTHS = { easy: 2, medium: 4, hard: 14 };
  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const handWEl  = document.getElementById("hand-w");
  const handBEl  = document.getElementById("hand-b");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");
  const store = Gamekit.storage("morris:");

  let diff = "medium", mode = store.get("mode", "human-white");
  let S = initial(), legal = [], history = [], over = false, result = null;
  let sel = -1, pending = null, lastMove = null, aiTimer = null, aiGen = 0;
  const pointEls = [];

  if (!["human-white", "human-black", "local"].includes(mode)) mode = "human-white";
  modeSel.value = mode;

  const humanColor = () => (mode === "human-black" ? BLACK : WHITE);
  const isHumanTurn = () => mode === "local" || S.turn === humanColor();

  function buildBoard() {
    const svgNS = "http://www.w3.org/2000/svg", svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "-0.5 -0.5 7 7");
    svg.setAttribute("class", "mm-lines");
    svg.setAttribute("aria-hidden", "true");
    for (let r = 0; r < 3; r++) {
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", r);
      rect.setAttribute("y", r);
      rect.setAttribute("width", 6 - 2 * r);
      rect.setAttribute("height", 6 - 2 * r);
      svg.appendChild(rect);
    }
    for (const [x1, y1, x2, y2] of [[3, 0, 3, 2], [3, 4, 3, 6], [0, 3, 2, 3], [4, 3, 6, 3]]) {
      const l = document.createElementNS(svgNS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      svg.appendChild(l);
    }
    boardEl.appendChild(svg);
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mm-pt";
      el.dataset.i = i;
      el.style.left = (POS[i][0] + 0.5) / 7 * 100 + "%";
      el.style.top = (POS[i][1] + 0.5) / 7 * 100 + "%";
      pointEls.push(el);
      boardEl.appendChild(el);
    }
  }

  function newGame() {
    cancelAI();
    S = initial();
    legal = legalMoves(S);
    history = [];
    over = false;
    result = null;
    sel = -1;
    pending = null;
    lastMove = null;
    render();
    advance();
  }

  function play(m) {
    history.push({ S: clone(S), lastMove });
    applyMove(S, m);
    lastMove = m;
    sel = -1;
    pending = null;
    legal = legalMoves(S);
    result = outcome(S, legal);
    if (result) { over = true; finish(); }
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
      play(pickMove(S, DEPTHS[diff], diff === "easy" ? 60 : 0, diff === "hard" ? 800 : 5000));
    }, 350);
  }

  // Taps narrow the legal moves: piece to move (moving phase), destination, then a piece to take.
  function tap(i) {
    if (over || !isHumanTurn()) return;
    if (pending) {
      const m = pending.find((x) => x.take === i);
      if (m) play(m);
      return;
    }
    const placing = S.hand[S.turn] > 0;
    if (!placing && S.b[i] === S.turn) { sel = sel === i ? -1 : i; render(); return; }
    const from = placing ? -1 : sel;
    if (!placing && sel < 0) return;
    const ms = legal.filter((m) => m.from === from && m.to === i);
    if (!ms.length) return;
    if (ms[0].take < 0) { play(ms[0]); return; }
    pending = ms;
    sel = -1;
    render();
  }

  function render() {
    const b = pending ? (() => { const t = S.b.slice(); if (pending[0].from >= 0) t[pending[0].from] = 0; t[pending[0].to] = S.turn; return t; })() : S.b;
    const placing = S.hand[S.turn] > 0, human = isHumanTurn() && !over;
    const dests = new Set(), movable = new Set(), takes = new Set(pending ? pending.map((m) => m.take) : []);
    if (human && !pending) {
      for (const m of legal) {
        if (placing || m.from === sel) dests.add(m.to);
        if (!placing) movable.add(m.from);
      }
    }
    const last = new Set(lastMove ? [lastMove.to, lastMove.from].filter((x) => x >= 0) : []);
    for (let i = 0; i < 24; i++) {
      const el = pointEls[i], v = b[i];
      el.className = "mm-pt" + (v ? (v === WHITE ? " w" : " k") : "") + (i === sel ? " sel" : "") + (dests.has(i) ? " dest" : "") +
        (takes.has(i) ? " take" : "") + (last.has(i) ? " last" : "") + (v && inMill(b, i) ? " mill" : "");
      const ring = ["outer", "middle", "inner"][Math.floor(i / 8)];
      const spot = ["top left", "top", "top right", "right", "bottom right", "bottom", "bottom left", "left"][i % 8];
      let label = ring + " " + spot + ": " + (v ? NAMES[v].toLowerCase() : "empty");
      if (takes.has(i)) label += ", take this";
      else if (i === sel) label += ", selected";
      else if (dests.has(i)) label += placing ? ", place here" : ", move here";
      else if (movable.has(i) && !placing) label += ", can move";
      el.setAttribute("aria-label", label);
    }
    handWEl.textContent = S.hand[WHITE] + " / " + onBoard(S, WHITE);
    handBEl.textContent = S.hand[BLACK] + " / " + onBoard(S, BLACK);
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || (over && mode !== "local");

    if (over) {
      const why = result.why === "pieces" ? " is down to two pieces." : " has no move.";
      const loser = NAMES[3 - result.winner];
      if (!result.winner) statusEl.innerHTML = '<span class="hot">Draw — ' + DRAW_PLIES / 2 + " moves each without a capture.</span>";
      else if (mode === "local") statusEl.innerHTML = '<span class="ok">' + NAMES[result.winner] + " wins — " + loser + why + "</span>";
      else if (result.winner === humanColor()) statusEl.innerHTML = '<span class="ok">You win — the AI' + why + "</span>";
      else statusEl.innerHTML = '<span class="bad">AI wins — you' + (result.why === "pieces" ? " are down to two pieces." : " have no move.") + "</span>";
      return;
    }
    const who = mode === "local" ? NAMES[S.turn] : "You";
    if (!isHumanTurn()) statusEl.textContent = "AI thinking…";
    else if (pending) statusEl.textContent = "Mill! " + (mode === "local" ? NAMES[S.turn] + ": take" : "Take") + " a " + NAMES[3 - S.turn].toLowerCase() + " piece.";
    else if (placing) statusEl.textContent = who + (mode === "local" ? " places" : ": place") + " a piece (" + S.hand[S.turn] + " left).";
    else if (onBoard(S, S.turn) === 3) statusEl.textContent = who + (mode === "local" ? " flies" : ": fly") + " — three pieces left, any empty point.";
    else statusEl.textContent = sel < 0 ? who + (mode === "local" ? " moves" : ": move") + " a piece along a line." : "Now pick where it goes.";
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".mm-pt");
    if (el) tap(+el.dataset.i);
  });

  boardEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sel >= 0) { e.stopPropagation(); sel = -1; render(); }
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local")) return;
    cancelAI();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.S.turn !== humanColor());
    S = h.S;
    lastMove = h.lastMove;
    legal = legalMoves(S);
    over = false;
    result = null;
    sel = -1;
    pending = null;
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
  window.addEventListener("load", () => Manpage.autoOpen("morris"));

  Gamekit.gridKeys(boardEl, { selector: ".mm-pt" });
})();
