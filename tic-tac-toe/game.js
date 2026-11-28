(function () {
  "use strict";

  const LINES = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  let board, human, ai, turn, gameOver, mode;
  let aiTimer = null;
  let cellEls = [];

  const boardEl = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const newBtn = document.getElementById("new-btn");
  const modeSel = document.getElementById("mode");
  const recordEl = document.getElementById("record");
  const store = Gamekit.storage("tic-tac-toe:");

  function winner(b) {
    for (const [a, c, d] of LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line: [a, c, d] };
    }
    if (b.every(x => x)) return { player: "draw", line: [] };
    return null;
  }

  function minimax(b, player) {
    const w = winner(b);
    if (w) {
      if (w.player === ai) return { score: 1 };
      if (w.player === human) return { score: -1 };
      return { score: 0 };
    }
    let best = null;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = player;
      const res = minimax(b, player === "X" ? "O" : "X");
      b[i] = null;
      const candidate = { idx: i, score: res.score };
      if (best === null) {
        best = candidate;
      } else if (player === ai ? candidate.score > best.score : candidate.score < best.score) {
        best = candidate;
      }
    }
    return best;
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    cellEls = [];
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "cell";
      c.setAttribute("aria-label", "cell " + (i + 1));
      c.dataset.i = String(i);
      c.addEventListener("click", () => play(i));
      boardEl.appendChild(c);
      cellEls.push(c);
    }
  }

  function render(winInfo) {
    for (let i = 0; i < 9; i++) {
      const v = board[i];
      const el = cellEls[i];
      el.textContent = v || "";
      el.classList.toggle("taken", !!v);
      el.classList.toggle("x", v === "X");
      el.classList.toggle("o", v === "O");
      el.classList.toggle("win", !!(winInfo && winInfo.line.includes(i)));
      el.setAttribute("aria-disabled", v || winInfo || remoteTurn() || (!twoPlayer() && turn !== human) ? "true" : "false");
    }
  }

  function setStatus(msg, cls) {
    if (!cls) { statusEl.textContent = msg; return; }
    statusEl.textContent = "";
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = msg;
    statusEl.appendChild(span);
  }

  function getRecord() {
    const rec = store.getJSON("rec", null);
    return rec && typeof rec === "object" ? { w: rec.w | 0, d: rec.d | 0, l: rec.l | 0 } : { w: 0, d: 0, l: 0 };
  }

  function showRecord() {
    const r = getRecord();
    recordEl.textContent = r.w + (r.w === 1 ? " win" : " wins") + " · " + r.d + (r.d === 1 ? " draw" : " draws") + " · " + r.l + (r.l === 1 ? " loss" : " losses");
  }

  // Online: the host plays X and moves first. "online" plays like "local" with one side remote.
  const twoPlayer = () => mode === "local" || mode === "online";
  const remoteTurn = () => mode === "online" && (!link.connected() || turn !== human);

  function turnStatus() {
    if (mode === "online") {
      if (!link.connected()) return "Online: waiting for your friend to join.";
      return turn === human ? "Your turn (" + human + ")." : "Your friend's turn…";
    }
    if (mode === "local") return turn + " to move.";
    return "Your turn (" + human + ").";
  }

  function cancelAI() {
    if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; }
  }

  function play(i) {
    if (gameOver || board[i] || remoteTurn() || (!twoPlayer() && turn !== human)) return;
    place(i);
    if (mode === "online") link.send({ t: "move", i });
  }

  // Marks cell i for the side to move (a local tap or the friend's move online).
  function place(i) {
    board[i] = turn;
    const w = winner(board);
    if (w) { render(w); return end(w); }
    turn = turn === "X" ? "O" : "X";
    render(null);
    if (twoPlayer()) { setStatus(turnStatus()); return; }
    setStatus("AI thinking…");
    cancelAI();
    aiTimer = setTimeout(aiMove, 200);
  }

  function aiMove() {
    aiTimer = null;
    if (gameOver || twoPlayer()) return;
    const move = minimax(board.slice(), ai);
    if (!move) return;
    board[move.idx] = ai;
    const w = winner(board);
    if (w) { render(w); return end(w); }
    turn = human;
    render(null);
    setStatus("Your turn (" + human + ").");
  }

  function end(w) {
    gameOver = true;
    cancelAI();
    if (mode === "local") {
      if (w.player === "draw") setStatus("Draw.", "hot");
      else setStatus(w.player + " wins.", "ok");
      return;
    }
    const result = w.player === "draw" ? "d" : w.player === human ? "w" : "l";
    if (mode === "online") {
      setStatus(result === "d" ? "Draw." : result === "w" ? "You win." : "Your friend wins.", result === "d" ? "hot" : result === "w" ? "ok" : "bad");
      return;
    }
    if (result === "d") setStatus("Draw.", "hot");
    else if (result === "w") setStatus("You win! 🎉", "ok");
    else setStatus("AI wins.", "bad");
    const rec = getRecord();
    rec[result]++;
    store.setJSON("rec", rec);
    showRecord();
  }

  function reset() {
    cancelAI();
    board = Array(9).fill(null);
    gameOver = false;
    turn = "X";
    render(null);
    if (mode === "ai-o") {
      setStatus("AI thinking…");
      aiTimer = setTimeout(aiMove, 200);
    } else {
      setStatus(turnStatus());
    }
  }

  function applyMode() {
    human = mode === "ai-o" || (mode === "online" && link.role() === "guest") ? "O" : "X";
    ai = human === "X" ? "O" : "X";
    recordEl.parentElement.hidden = twoPlayer();
    reset();
  }

  function setMode(m) {
    if (mode === "online" && m !== "online") link.leave();
    mode = m;
    modeSel.value = m;
    if (m !== "online") store.set("mode", m);
    applyMode();
  }

  newBtn.addEventListener("click", () => {
    if (mode === "online" && !link.connected()) return;
    reset();
    if (mode === "online") link.send({ t: "new" });
  });
  modeSel.addEventListener("change", () => {
    setMode(modeSel.value);
    if (mode === "online") link.host();
  });

  const link = Net.attach({
    container: document.querySelector(".game-controls"),
    onJoin: () => setMode("online"),
    onOpen: () => applyMode(),
    onMessage: (msg) => {
      if (mode !== "online") return;
      if (msg.t === "new") reset();
      else if (msg.t === "move") {
        const i = msg.i;
        if (!gameOver && turn !== human && Number.isInteger(i) && i >= 0 && i < 9 && !board[i]) place(i);
        else setStatus("Out of sync — press new game.");
      }
    },
    onClose: () => { mode = "local"; setMode("local"); }, // keep the "friend left" note showing
    onLeave: () => setMode("local"),
  });

  mode = store.get("mode", store.get("side", "X") === "O" ? "ai-o" : "ai-x");
  if (!["ai-x", "ai-o", "local"].includes(mode)) mode = "ai-x";
  modeSel.value = mode;
  buildBoard();
  showRecord();
  applyMode();

  Gamekit.gridKeys(document.getElementById("board"), { selector: ".cell" });
})();