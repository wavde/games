(function () {
  "use strict";

  // ---------- rules + AI (no DOM) ----------
  // n×n rhombus of hexagons; cell i = r*n + c. Red (1) joins the top and bottom edges, Blue (2)
  // the left and right. A full board always has exactly one winner, so the AI scores moves by
  // filling the rest of the board at random many times and crediting every cell it ended up
  // owning in the fills it won ("all moves as first").

  const RED = 1, BLUE = 2;
  const NAMES = ["", "Red", "Blue"];

  function neighbours(n) {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, nb = [];
      for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) nb.push(rr * n + cc);
      }
      out.push(nb);
    }
    return out;
  }
  const NB = {};
  const nbOf = (n) => NB[n] || (NB[n] = neighbours(n));

  // Does side p join its two edges? Returns the winning chain's cells, or null.
  function connected(b, n, p) {
    const nb = nbOf(n), from = new Int16Array(n * n).fill(-2), queue = [];
    for (let k = 0; k < n; k++) {
      const i = p === RED ? k : k * n;
      if (b[i] === p) { from[i] = -1; queue.push(i); }
    }
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (p === RED ? Math.floor(i / n) === n - 1 : i % n === n - 1) {
        const chain = [];
        for (let x = i; x >= 0; x = from[x]) chain.push(x);
        return chain;
      }
      for (const j of nb[i]) if (b[j] === p && from[j] === -2) { from[j] = i; queue.push(j); }
    }
    return null;
  }

  // Scores every empty cell for side p by random fills; returns win rates (NaN if never owned).
  function amaf(b, n, p, playouts, rng, deadline) {
    const empties = [];
    for (let i = 0; i < n * n; i++) if (!b[i]) empties.push(i);
    const wins = new Float64Array(n * n), seen = new Float64Array(n * n), t = new Int8Array(n * n);
    const nb = nbOf(n), stack = new Int16Array(n * n), mark = new Uint8Array(n * n);
    for (let k = 0; k < playouts; k++) {
      if (deadline && (k & 63) === 0 && Date.now() > deadline) break;
      t.set(b);
      for (let i = empties.length - 1; i >= 0; i--) {
        const j = Math.floor(rng() * (i + 1)), x = empties[j];
        empties[j] = empties[i];
        empties[i] = x;
        t[x] = (empties.length - 1 - i) % 2 ? 3 - p : p;
      }
      // Red wins a full board iff a red chain joins top to bottom.
      mark.fill(0);
      let sp = 0, redWins = false;
      for (let c = 0; c < n; c++) if (t[c] === RED) { mark[c] = 1; stack[sp++] = c; }
      while (sp && !redWins) {
        const i = stack[--sp];
        if (i >= n * (n - 1)) { redWins = true; break; }
        for (const j of nb[i]) if (t[j] === RED && !mark[j]) { mark[j] = 1; stack[sp++] = j; }
      }
      const win = (p === RED) === redWins ? 1 : 0;
      for (const x of empties) if (t[x] === p) { seen[x]++; wins[x] += win; }
    }
    const rate = new Float64Array(n * n).fill(NaN);
    for (const x of empties) if (seen[x]) rate[x] = (wins[x] + 1) / (seen[x] + 2);
    return rate;
  }

  // Win now if possible, else block a cell that would win for the opponent at once,
  // else the best-scoring cell (easy picks among the top few).
  const LEVELS = {
    easy:   { playouts: 150, top: 5 },
    medium: { playouts: 2500, top: 1 },
    hard:   { playouts: 1e9, top: 1, ms: 1200 },
  };
  function pickMove(b, n, p, level, rng) {
    const L = LEVELS[level], t = b.slice();
    const empties = [];
    for (let i = 0; i < n * n; i++) if (!b[i]) empties.push(i);
    for (const q of [p, 3 - p]) {
      for (const i of empties) {
        t[i] = q;
        const w = connected(t, n, q);
        t[i] = 0;
        if (w) return i;
      }
    }
    const rate = amaf(b, n, p, L.playouts, rng, L.ms ? Date.now() + L.ms : 0);
    const ranked = empties.filter((i) => !Number.isNaN(rate[i])).sort((x, y) => rate[y] - rate[x]);
    if (!ranked.length) return empties[0];
    return ranked[Math.floor(rng() * Math.min(L.top, ranked.length))];
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");
  const sizeSel  = document.getElementById("size");
  const MODES = ["human-red", "human-blue", "local"];
  const store = Gamekit.storage("hex:");
  const SQ3 = Math.sqrt(3), R = 1 / SQ3, PAD = 0.7;

  let diff = "medium", mode = store.get("mode", "human-red"), n = store.getInt("size", 9);
  if (!MODES.includes(mode)) mode = "human-red";
  if (![7, 9, 11].includes(n)) n = 9;
  modeSel.value = mode;
  sizeSel.value = String(n);

  let b = null, turn = RED, history = [], over = false, winner = 0, chain = [], last = -1;
  let aiTimer = null, aiGen = 0, polys = [], cellEls = [];

  const humanColor = () => (mode === "human-blue" ? BLUE : RED);
  const isHumanTurn = () => mode === "local" || turn === humanColor();
  const centre = (i) => {
    const r = Math.floor(i / n), c = i % n;
    return [PAD + c + r / 2 + 0.5, PAD + r * SQ3 / 2 + R];
  };

  function build() {
    const W = n + (n - 1) / 2 + 2 * PAD, H = (n - 1) * SQ3 / 2 + 2 * R + 2 * PAD;
    const svgNS = "http://www.w3.org/2000/svg", svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "hx-svg");
    svg.setAttribute("aria-hidden", "true");
    boardEl.innerHTML = "";
    boardEl.style.aspectRatio = W + " / " + H;
    const v = (i, k) => {
      const [x, y] = centre(i);
      return [[x, y - R], [x + 0.5, y - R / 2], [x + 0.5, y + R / 2], [x, y + R], [x - 0.5, y + R / 2], [x - 0.5, y - R / 2]][k];
    };
    const edge = (pts, cls) => {
      const pl = document.createElementNS(svgNS, "polyline");
      pl.setAttribute("points", pts.map((q) => q.join(",")).join(" "));
      pl.setAttribute("class", cls);
      svg.appendChild(pl);
    };
    const top = [], bottom = [], left = [], right = [];
    for (let c = 0; c < n; c++) { top.push(v(c, 5), v(c, 0)); bottom.push(v((n - 1) * n + c, 4), v((n - 1) * n + c, 3)); }
    top.push(v(n - 1, 1));
    bottom.push(v(n * n - 1, 2));
    for (let r = 0; r < n; r++) { left.push(v(r * n, 5), v(r * n, 4)); right.push(v(r * n + n - 1, 1), v(r * n + n - 1, 2)); }
    edge(top, "hx-edge red");
    edge(bottom, "hx-edge red");
    edge(left, "hx-edge blue");
    edge(right, "hx-edge blue");
    polys = [];
    cellEls = [];
    for (let i = 0; i < n * n; i++) {
      const pg = document.createElementNS(svgNS, "polygon");
      pg.setAttribute("points", [0, 1, 2, 3, 4, 5].map((k) => v(i, k).join(",")).join(" "));
      svg.appendChild(pg);
      polys.push(pg);
    }
    boardEl.appendChild(svg);
    for (let i = 0; i < n * n; i++) {
      const [x, y] = centre(i), el = document.createElement("button");
      el.type = "button";
      el.className = "hx-cell";
      el.dataset.i = i;
      el.style.left = x / W * 100 + "%";
      el.style.top = y / H * 100 + "%";
      el.style.width = 0.9 / W * 100 + "%";
      cellEls.push(el);
      boardEl.appendChild(el);
    }
  }

  function newGame() {
    cancelAI();
    b = new Int8Array(n * n);
    turn = RED;
    history = [];
    over = false;
    winner = 0;
    chain = [];
    last = -1;
    build();
    render();
    advance();
  }

  function play(i) {
    if (b[i]) return;
    history.push({ i, last });
    b[i] = turn;
    last = i;
    const w = connected(b, n, turn);
    if (w) { over = true; winner = turn; chain = w; finish(); }
    else turn = 3 - turn;
    render();
    advance();
  }

  function finish() {
    if (mode === "local") return;
    const key = "rec:" + diff + ":" + n, rec = store.getJSON(key, { w: 0, l: 0 });
    if (winner === humanColor()) rec.w++; else rec.l++;
    store.setJSON(key, rec);
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
      play(pickMove(b, n, turn, diff, Math.random));
    }, 300);
  }

  function render() {
    const onChain = new Set(chain), human = isHumanTurn() && !over;
    for (let i = 0; i < n * n; i++) {
      const v = b[i], r = Math.floor(i / n), c = i % n;
      polys[i].setAttribute("class", "hx-hex" + (v === RED ? " red" : v === BLUE ? " blue" : "") + (onChain.has(i) ? " chain" : "") + (i === last ? " last" : ""));
      const el = cellEls[i];
      el.setAttribute("aria-disabled", v || !human ? "true" : "false");
      el.setAttribute("aria-label", "Row " + (r + 1) + " column " + (c + 1) + ": " + (v ? NAMES[v].toLowerCase() : "empty") +
        (onChain.has(i) ? ", winning chain" : i === last ? ", last move" : ""));
    }
    const rec = store.getJSON("rec:" + diff + ":" + n, { w: 0, l: 0 });
    recordEl.textContent = mode === "local" ? "2P local" : "W–L " + rec.w + "–" + rec.l;
    undoBtn.disabled = !history.length || (over && mode !== "local");
    if (over) {
      if (mode === "local") statusEl.innerHTML = '<span class="ok">' + NAMES[winner] + " wins — " + (winner === RED ? "top joined to bottom." : "left joined to right.") + "</span>";
      else if (winner === humanColor()) statusEl.innerHTML = '<span class="ok">You win!</span>';
      else statusEl.innerHTML = '<span class="bad">AI wins — its chain is highlighted.</span>';
    } else if (!isHumanTurn()) statusEl.textContent = "AI thinking…";
    else if (mode === "local") statusEl.textContent = NAMES[turn] + " to move — join " + (turn === RED ? "top and bottom." : "left and right.");
    else statusEl.textContent = "Your move — join " + (turn === RED ? "top and bottom (red edges)." : "left and right (blue edges).");
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".hx-cell");
    if (!el || over || !isHumanTurn()) return;
    play(+el.dataset.i);
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local")) return;
    cancelAI();
    do {
      const h = history.pop();
      b[h.i] = 0;
      last = h.last;
      turn = history.length % 2 ? BLUE : RED;
    } while (mode !== "local" && history.length && turn !== humanColor());
    over = false;
    winner = 0;
    chain = [];
    render();
    advance();
  });

  newBtn.addEventListener("click", newGame);
  modeSel.addEventListener("change", () => { mode = modeSel.value; store.set("mode", mode); newGame(); });
  sizeSel.addEventListener("change", () => { n = +sizeSel.value; store.set("size", n); newGame(); });

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newGame(); },
  });
  diff = chips.get();

  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("hex"));

  Gamekit.gridKeys(boardEl, { selector: ".hx-cell" });
})();
