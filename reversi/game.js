(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const scoreBEl = document.getElementById("score-b");
  const scoreWEl = document.getElementById("score-w");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const NAMES = { 1: "Black", 2: "White" };
  const DEPTHS = { easy: 1, medium: 3, hard: 5 };
  const MODES = ["human-black", "human-white", "local"];
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const WEIGHTS = [
    100, -20, 10,  5,  5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
     10,  -2,  1,  1,  1,  1,  -2,  10,
      5,  -2,  1,  0,  0,  1,  -2,   5,
      5,  -2,  1,  0,  0,  1,  -2,   5,
     10,  -2,  1,  1,  1,  1,  -2,  10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10,  5,  5, 10, -20, 100,
  ];
  const store = Gamekit.storage("reversi:");

  let diff = "medium";
  let mode = store.get("mode", "human-black");
  if (!MODES.includes(mode)) mode = "human-black";
  modeSel.value = mode;

  let board, current, history, last, flipped, over, aiTimer = null, aiGen = 0;
  let cellEls = [];

  // ---------- Rules ----------

  function flipsFor(b, i, p) {
    if (b[i] !== EMPTY) return [];
    const r0 = i >> 3, c0 = i & 7, o = 3 - p, out = [];
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc;
      const run = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === o) { run.push(r * 8 + c); r += dr; c += dc; }
      if (run.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) out.push(...run);
    }
    return out;
  }

  function legalMoves(b, p) {
    const out = [];
    for (let i = 0; i < 64; i++) if (b[i] === EMPTY && flipsFor(b, i, p).length) out.push(i);
    return out;
  }

  function applyMove(b, i, p) {
    const nb = b.slice();
    const f = flipsFor(b, i, p);
    nb[i] = p;
    for (const k of f) nb[k] = p;
    return { board: nb, flips: f };
  }

  function count(b, p) { let n = 0; for (let i = 0; i < 64; i++) if (b[i] === p) n++; return n; }

  // ---------- AI: negamax alpha-beta ----------

  function evaluate(b, p) {
    const o = 3 - p;
    let pos = 0;
    for (let i = 0; i < 64; i++) {
      if (b[i] === p) pos += WEIGHTS[i];
      else if (b[i] === o) pos -= WEIGHTS[i];
    }
    const mob = legalMoves(b, p).length - legalMoves(b, o).length;
    return pos + 8 * mob;
  }

  function finalScore(b, p) {
    const d = count(b, p) - count(b, 3 - p);
    return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
  }

  function ordered(moves) { return moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]); }

  function negamax(b, p, depth, alpha, beta, passed) {
    const moves = legalMoves(b, p);
    if (!moves.length) {
      if (passed) return finalScore(b, p);
      return -negamax(b, 3 - p, depth, -beta, -alpha, true);
    }
    if (depth === 0) return evaluate(b, p);
    let best = -Infinity;
    for (const m of ordered(moves)) {
      const v = -negamax(applyMove(b, m, p).board, 3 - p, depth - 1, -beta, -alpha, false);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function pickMove(b, p, depth) {
    const moves = ordered(legalMoves(b, p));
    let best = -Infinity, choices = [];
    for (const m of moves) {
      const v = -negamax(applyMove(b, m, p).board, 3 - p, depth - 1, -Infinity, Infinity, false);
      if (v > best) { best = v; choices = [m]; }
      else if (v === best) choices.push(m);
    }
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // ---------- Game flow ----------

  // Online: the host plays black and moves first; "online" plays like "local" with one side remote.
  // Only placed discs are sent; each page works out passes and the end of the game itself.
  const twoPlayer = () => mode === "local" || mode === "online";
  const remoteTurn = () => mode === "online" && (!link.connected() || current !== humanColor());
  function humanColor() {
    if (mode === "online") return link.role() === "guest" ? WHITE : BLACK;
    return mode === "human-white" ? WHITE : BLACK;
  }
  function isHumanTurn() { return twoPlayer() || current === humanColor(); }

  function newGame() {
    cancelAI();
    board = new Array(64).fill(EMPTY);
    board[27] = WHITE; board[28] = BLACK; board[35] = BLACK; board[36] = WHITE;
    current = BLACK;
    history = [];
    last = -1;
    flipped = [];
    over = false;
    render();
    advance();
  }

  function play(i) {
    const res = applyMove(board, i, current);
    history.push({ board: board.slice(), current, last });
    board = res.board;
    last = i;
    flipped = res.flips;
    const next = 3 - current;
    let note = "";
    if (legalMoves(board, next).length) current = next;
    else if (legalMoves(board, current).length) note = NAMES[next] + " has no move — passes. ";
    else over = true;
    if (over) finish();
    render(note);
    advance();
  }

  function finish() {
    if (twoPlayer()) return;
    const h = humanColor();
    const d = count(board, h) - count(board, 3 - h);
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    if (d > 0) rec.w++; else if (d < 0) rec.l++; else rec.d++;
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
      play(pickMove(board, current, DEPTHS[diff]));
    }, 350);
  }

  // ---------- Rendering ----------

  function buildBoard() {
    boardEl.innerHTML = "";
    cellEls = [];
    for (let i = 0; i < 64; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "rv-cell";
      b.dataset.i = i;
      boardEl.appendChild(b);
      cellEls.push(b);
    }
  }

  function render(note) {
    const hints = !over && isHumanTurn() && !remoteTurn() ? new Set(legalMoves(board, current)) : new Set();
    const flipSet = new Set(flipped);
    for (let i = 0; i < 64; i++) {
      const el = cellEls[i];
      const v = board[i];
      el.className = "rv-cell" + (hints.has(i) ? " hint" : "") + (i === last ? " last" : "") + (flipSet.has(i) ? " flip" : "");
      const disc = el.firstChild;
      if (v === EMPTY) { if (disc) el.removeChild(disc); }
      else {
        const d = disc || el.appendChild(document.createElement("span"));
        d.className = "rv-disc " + (v === BLACK ? "b" : "w");
      }
      const sq = "abcdefgh"[i & 7] + (8 - (i >> 3));
      el.setAttribute("aria-label", sq + ": " + (v === BLACK ? "black" : v === WHITE ? "white" : hints.has(i) ? "legal move" : "empty"));
    }
    flipped = [];

    const nb = count(board, BLACK), nw = count(board, WHITE);
    scoreBEl.textContent = nb;
    scoreWEl.textContent = nw;
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : mode === "online" ? "online" : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || (over && mode !== "local") || mode === "online";

    note = note || "";
    if (over) {
      if (mode === "local") {
        statusEl.innerHTML = nb === nw ? '<span class="hot">Draw ' + nb + '–' + nw + '.</span>'
          : '<span class="ok">' + (nb > nw ? "Black" : "White") + ' wins ' + Math.max(nb, nw) + '–' + Math.min(nb, nw) + '.</span>';
      } else {
        const h = humanColor(), mine = count(board, h), theirs = count(board, 3 - h);
        statusEl.innerHTML = mine > theirs ? '<span class="ok">You win ' + mine + '–' + theirs + '.</span>'
          : mine < theirs ? '<span class="bad">' + (mode === "online" ? "Your friend" : "AI") + ' wins ' + theirs + '–' + mine + '.</span>'
          : '<span class="hot">Draw ' + mine + '–' + theirs + '.</span>';
      }
    } else if (mode === "online") {
      statusEl.textContent = !link.connected() ? "Online: waiting for your friend to join." :
        note + (current === humanColor() ? "Your turn (" + NAMES[current].toLowerCase() + ")." : "Your friend's turn…");
    } else if (mode === "local") {
      statusEl.textContent = note + NAMES[current] + " to move.";
    } else {
      statusEl.textContent = note + (isHumanTurn() ? "Your move." : "AI thinking…");
    }
  }

  boardEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".rv-cell");
    if (!cell || over || !isHumanTurn() || remoteTurn()) return;
    const i = parseInt(cell.dataset.i, 10);
    if (!flipsFor(board, i, current).length) return;
    play(i);
    if (mode === "online") link.send({ t: "move", i });
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local") || mode === "online") return;
    cancelAI();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.current !== humanColor());
    board = h.board; current = h.current; last = h.last;
    over = false;
    flipped = [];
    render();
    advance();
  });

  newBtn.addEventListener("click", () => {
    if (mode === "online" && !link.connected()) return;
    newGame();
    if (mode === "online") link.send({ t: "new" });
  });

  function setMode(m) {
    if (mode === "online" && m !== "online") link.leave();
    mode = m;
    modeSel.value = m;
    if (m !== "online") store.set("mode", m);
    chipsEl.hidden = twoPlayer();
    newGame();
  }
  modeSel.addEventListener("change", () => {
    setMode(modeSel.value);
    if (mode === "online") link.host();
  });

  const link = Net.attach({
    container: document.querySelector(".game-controls"),
    onJoin: () => setMode("online"),
    onOpen: () => setMode("online"),
    onMessage: (msg) => {
      if (mode !== "online") return;
      if (msg.t === "new") newGame();
      else if (msg.t === "move" && !over) {
        const i = msg.i;
        if (current !== humanColor() && Number.isInteger(i) && i >= 0 && i < 64 && flipsFor(board, i, current).length) play(i);
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

  chipsEl.hidden = twoPlayer();
  buildBoard();
  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("reversi"));

  Gamekit.gridKeys(boardEl, { selector: ".rv-cell" });
})();
