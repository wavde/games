(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");

  const DEPTHS = { easy: 2, medium: 6, hard: 20 };
  const MODES = ["human-first", "ai-first", "local"];
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = Gamekit.storage("mancala:");

  let diff = "medium";
  let mode = store.get("mode", "human-first");
  if (!MODES.includes(mode)) mode = "human-first";
  modeSel.value = mode;

  let board, current, history, lastFrom, over, note, busy = false, timer = null, gen = 0;
  const els = [];

  // ---------- Rules (Kalah, 6 pits × 4 seeds) ----------
  // Indices 0..5 are the bottom player's pits (left to right), 6 their store; 7..12 the top
  // player's pits (right to left as drawn), 13 their store. Sowing runs 0 → 13 and wraps.

  const BOTTOM = 0, TOP = 1;
  const STORE = [6, 13];
  const WIN = 1000, HALF = 24;

  function initialBoard() {
    const b = new Array(14).fill(4);
    b[6] = b[13] = 0;
    return b;
  }

  function owns(p, i) { return p === BOTTOM ? i < 6 : i > 6 && i < 13; }
  function sideSum(b, p) { let s = 0; for (let k = 0; k < 6; k++) s += b[p * 7 + k]; return s; }

  function legalMoves(b, p) {
    const out = [];
    for (let k = 0; k < 6; k++) if (b[p * 7 + k]) out.push(p * 7 + k);
    return out;
  }

  function applyMove(b, i, p) {
    const nb = b.slice(), path = [];
    let n = nb[i], j = i, captured = 0;
    nb[i] = 0;
    while (n) {
      j = (j + 1) % 14;
      if (j === STORE[1 - p]) continue;
      nb[j]++;
      n--;
      path.push(j);
    }
    if (owns(p, j) && nb[j] === 1 && nb[12 - j]) {
      captured = nb[12 - j] + 1;
      nb[STORE[p]] += captured;
      nb[j] = nb[12 - j] = 0;
    }
    const over = !sideSum(nb, BOTTOM) || !sideSum(nb, TOP);
    if (over) {
      for (let k = 0; k < 6; k++) {
        nb[6] += nb[k]; nb[k] = 0;
        nb[13] += nb[7 + k]; nb[7 + k] = 0;
      }
    }
    return { board: nb, next: !over && j === STORE[p] ? p : 1 - p, path, captured, over };
  }

  // ---------- AI: negamax alpha-beta; an extra turn is the same player moving again ----------

  function finalScore(b, p) {
    const d = b[STORE[p]] - b[STORE[1 - p]];
    return d > 0 ? WIN + d : d < 0 ? -WIN + d : 0;
  }

  // More than half the seeds in a store decides the game.
  function decided(b) { return b[6] > HALF || b[13] > HALF; }

  function evaluate(b, p) {
    return 4 * (b[STORE[p]] - b[STORE[1 - p]]) + sideSum(b, p) - sideSum(b, 1 - p);
  }

  // Extra turns first, then captures, then pits nearest the store.
  function ordered(b, p, moves) {
    const key = (i) => {
      const dist = STORE[p] - i, n = b[i];
      if (n === dist || n === dist + 13) return 100;
      const land = (i + n) % 14;
      if (n < 13 && owns(p, land) && !b[land] && b[12 - land]) return 50 + b[12 - land];
      return -dist;
    };
    return moves.sort((x, y) => key(y) - key(x));
  }

  const TIMEOUT = {};
  let deadline = Infinity, nodes = 0;

  function negamax(b, p, depth, alpha, beta) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;
    if (depth <= 0) return evaluate(b, p);
    let best = -Infinity;
    for (const m of ordered(b, p, legalMoves(b, p))) {
      const v = childValue(applyMove(b, m, p), p, depth - 1, alpha, beta);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function childValue(r, p, depth, alpha, beta) {
    if (r.over || decided(r.board)) return finalScore(r.board, p);
    if (r.next === p) return negamax(r.board, p, depth, alpha, beta);
    return -negamax(r.board, 1 - p, depth, -beta, -alpha);
  }

  // Deepens one ply at a time under the deadline; keeps every root move within `tol` of the best.
  function pickMove(b, p, depth, tol, budgetMs) {
    let moves = ordered(b, p, legalMoves(b, p));
    if (moves.length === 1) return moves[0];
    let choices = moves;
    deadline = budgetMs ? Date.now() + budgetMs : Infinity;
    try {
      for (let d = 1; d <= depth; d++) {
        let best = -Infinity;
        const scored = [];
        for (const m of moves) {
          const v = childValue(applyMove(b, m, p), p, d - 1, best - tol - 1, Infinity);
          scored.push([m, v]);
          if (v > best) best = v;
        }
        choices = scored.filter(([, v]) => v >= best - tol).map(([m]) => m);
        moves = scored.sort((x, y) => y[1] - x[1]).map(([m]) => m);
        if (Math.abs(best) > WIN / 2) break;
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
    } finally {
      deadline = Infinity;
    }
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // ---------- Game flow ----------

  // Online: the host plays the bottom row and moves first. "online" plays like "local" with
  // one side remote; landing in your store keeps the turn, so turns follow `current`.
  function twoPlayer() { return mode === "local" || mode === "online"; }
  function me() { return mode === "online" && link.role() === "guest" ? TOP : BOTTOM; }
  function isHumanTurn() { return mode === "local" || current === me(); }
  function remoteTurn() { return mode === "online" && (!link.connected() || current !== me()); }
  function name(p) {
    if (mode === "local") return p === BOTTOM ? "Bottom" : "Top";
    return p === me() ? "You" : mode === "online" ? "Friend" : "AI";
  }

  function cancel() {
    gen++;
    busy = false;
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function newGame() {
    cancel();
    board = initialBoard();
    current = mode === "ai-first" ? TOP : BOTTOM;
    history = [];
    lastFrom = -1;
    over = false;
    note = "";
    render();
    advance();
  }

  function play(i) {
    const before = board, mover = current, r = applyMove(board, i, current);
    history.push({ board, current, lastFrom });
    board = r.board;
    current = r.next;
    lastFrom = i;
    over = r.over;
    note = "";
    const who = mode === "online" && mover !== me() ? "Your friend" : name(mover), you = who === "You";
    if (r.captured) note = who + (you ? " capture " : " captures ") + r.captured + ". ";
    else if (!over && r.next === mover) note = who + (you ? " go again. " : " goes again. ");
    if (over) finish();
    sow(before, i, r.path, () => { render(); advance(); });
  }

  // Show the seeds landing one at a time, then the settled board.
  function sow(before, from, path, done) {
    if (REDUCED) { done(); return; }
    const g = ++gen, view = before.slice(), delay = Math.min(120, Math.round(1400 / path.length));
    view[from] = 0;
    busy = true;
    render(view, from);
    let k = 0;
    const step = () => {
      if (g !== gen) return;
      if (k < path.length) {
        const j = path[k++];
        view[j]++;
        render(view, j);
        timer = setTimeout(step, delay);
      } else {
        timer = null;
        busy = false;
        done();
      }
    };
    timer = setTimeout(step, delay);
  }

  function finish() {
    if (twoPlayer()) return;
    const d = board[6] - board[13];
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    if (d > 0) rec.w++; else if (d < 0) rec.l++; else rec.d++;
    store.setJSON("rec:" + diff, rec);
  }

  function advance() {
    if (over || twoPlayer() || isHumanTurn()) return;
    const g = ++gen;
    timer = setTimeout(() => {
      timer = null;
      if (g !== gen || over || twoPlayer() || isHumanTurn()) return;
      play(pickMove(board, current, DEPTHS[diff], diff === "easy" ? 6 : 0, 800));
    }, 300);
  }

  // ---------- Rendering ----------

  function buildBoard() {
    boardEl.innerHTML = "";
    const place = (el, col, row, span) => {
      el.style.gridColumn = String(col);
      el.style.gridRow = span ? "1 / span 2" : String(row);
      boardEl.appendChild(el);
    };
    for (const s of [13, 6]) {
      const el = document.createElement("div");
      el.className = "mc-store";
      el.innerHTML = '<span class="n"></span><span class="who"></span>';
      els[s] = el;
      place(el, s === 13 ? 1 : 8, 1, true);
    }
    for (let i = 0; i < 13; i++) {
      if (i === 6) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mc-pit";
      el.dataset.i = i;
      el.innerHTML = '<span class="mc-seeds" aria-hidden="true"></span><span class="n" aria-hidden="true"></span>';
      els[i] = el;
      place(el, i < 6 ? i + 2 : 14 - i, i < 6 ? 2 : 1, false);
    }
  }

  function render(view, hot) {
    const v = view || board;
    const human = !busy && !over && isHumanTurn() && !remoteTurn();
    for (let i = 0; i < 14; i++) {
      const el = els[i], n = v[i];
      el.querySelector(".n").textContent = n;
      if (i === 6 || i === 13) {
        const p = i === 6 ? BOTTOM : TOP;
        el.className = "mc-store" + (i === hot ? " hot" : "");
        el.querySelector(".who").textContent = name(p);
        el.setAttribute("aria-label", name(p) + " store: " + n);
        el.setAttribute("role", "img");
        continue;
      }
      const p = i < 6 ? BOTTOM : TOP, can = human && p === current && n > 0;
      el.className = "mc-pit" + (can ? " can" : "") + (i === hot ? " hot" : "") + (!view && i === lastFrom ? " last" : "");
      el.setAttribute("aria-disabled", can ? "false" : "true");
      const owner = mode === "local" ? name(p) : p === me() ? "Your" : mode === "online" ? "Your friend's" : "AI's";
      el.setAttribute("aria-label", owner + " pit " + (i % 7 + 1) + ": " + n + (n === 1 ? " seed" : " seeds"));
      const seeds = el.firstChild, show = Math.min(n, 12);
      while (seeds.childElementCount > show) seeds.lastChild.remove();
      while (seeds.childElementCount < show) seeds.appendChild(document.createElement("i"));
    }

    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : mode === "online" ? "online" : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || mode === "online" || (over && mode !== "local");

    if (view) return;
    if (over) {
      const a = board[6], b = board[13], mine = board[STORE[me()]], theirs = board[STORE[1 - me()]];
      if (a === b) statusEl.innerHTML = '<span class="hot">Draw ' + a + "–" + b + ".</span>";
      else if (mode === "local") statusEl.innerHTML = '<span class="ok">' + (a > b ? "Bottom" : "Top") + " wins " + Math.max(a, b) + "–" + Math.min(a, b) + ".</span>";
      else if (mine > theirs) statusEl.innerHTML = '<span class="ok">You win ' + mine + "–" + theirs + ".</span>";
      else statusEl.innerHTML = '<span class="bad">' + (mode === "online" ? "Your friend" : "AI") + " wins " + theirs + "–" + mine + ".</span>";
    } else if (mode === "local") {
      statusEl.textContent = note + name(current) + " to move.";
    } else if (mode === "online") {
      statusEl.textContent = !link.connected() ? "Online: waiting for your friend to join."
        : note + (isHumanTurn() ? "Your turn (" + (me() === BOTTOM ? "bottom row" : "top row") + ")." : "Your friend's turn…");
    } else {
      statusEl.textContent = note + (isHumanTurn() ? "Your move." : "AI thinking…");
    }
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".mc-pit");
    if (!el || busy || over || remoteTurn() || !isHumanTurn()) return;
    const i = +el.dataset.i;
    if (!owns(current, i) || !board[i]) return;
    play(i);
    if (mode === "online") link.send({ t: "move", i });
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || mode === "online" || (over && mode !== "local")) return;
    cancel();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.current !== BOTTOM);
    board = h.board; current = h.current; lastFrom = h.lastFrom;
    over = false;
    note = "";
    render();
    advance();
  });

  newBtn.addEventListener("click", () => {
    if (mode === "online" && !link.connected()) return;
    newGame();
    if (mode === "online") link.send({ t: "new" });
  });

  function applyMode() {
    chipsEl.hidden = twoPlayer();
    newGame();
  }

  function setMode(m) {
    if (mode === "online" && m !== "online") link.leave();
    mode = m;
    modeSel.value = m;
    if (m !== "online") store.set("mode", m);
    applyMode();
  }
  modeSel.addEventListener("change", () => {
    setMode(modeSel.value);
    if (mode === "online") link.host();
  });

  // The friend's move plays at once, even mid-animation: play() updates the board right away.
  const link = Net.attach({
    container: document.querySelector(".game-controls"),
    onJoin: () => setMode("online"),
    onOpen: () => applyMode(),
    onMessage: (msg) => {
      if (mode !== "online") return;
      if (msg.t === "new") newGame();
      else if (msg.t === "move" && !over && current !== me()) {
        if (Number.isInteger(msg.i) && owns(current, msg.i) && board[msg.i]) play(msg.i);
        else statusEl.textContent = "Out of sync — press new game.";
      }
    },
    onClose: () => { mode = "local"; setMode("local"); }, // keep the "friend left" note showing
    onLeave: () => setMode("local"),
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
  applyMode();
  window.addEventListener("load", () => Manpage.autoOpen("mancala"));

  Gamekit.gridKeys(boardEl, { selector: ".mc-pit" });
})();
