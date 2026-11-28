(function () {
  "use strict";

  // ---------- boards (no DOM) ----------
  // n×n grid cut into regions. Shade exactly two cells in every region so that every shaded
  // cell touches exactly one other shaded cell side-on: the shading is a set of dominoes that
  // never touch each other along an edge (corners are fine).
  // Boards come from puzzles.js, a bank made offline by .github/tools/norinori.mjs (making a
  // board with exactly one answer takes seconds); CI re-checks every one.

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

  // The daily board walks through the bank one day at a time (no repeats for a bank's length
  // in days); "new" picks at random.
  function pick(level, seed, day) {
    const bank = window.NORINORI_PUZZLES[level];
    return decode(bank[(day !== undefined ? day : seed) % bank.length]);
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
  const undoBtn  = document.getElementById("undo-btn");
  const NAME = ["empty", "shaded", "dot"];

  let P = null, mark = null, history = [], won = false, cellEls = [];

  function start(P0) {
    P = P0;
    mark = new Uint8Array(P.n * P.n);
    history = [];
    won = false;
    build();
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

  // Shaded cells with two or more shaded neighbours, and regions holding more than two.
  function check() {
    const bad = new Set();
    for (let i = 0; i < mark.length; i++) {
      if (mark[i] !== 1) continue;
      if (P.nb[i].filter((j) => mark[j] === 1).length > 1) bad.add(i);
    }
    for (const R of P.regions) {
      const sh = R.filter((i) => mark[i] === 1);
      if (sh.length > 2) for (const i of sh) bad.add(i);
    }
    return bad;
  }

  function render() {
    const n = P.n, bad = check();
    for (let i = 0; i < n * n; i++) {
      const el = cellEls[i], m = mark[i];
      el.className = "nr-cell" + el.dataset.edge + (m === 1 ? " on" : m === 2 ? " dot" : "") + (bad.has(i) ? " err" : "");
      el.setAttribute("aria-label", "Row " + (Math.floor(i / n) + 1) + " column " + (i % n + 1) + ", region " + (P.reg[i] + 1) +
        ", " + NAME[m] + (bad.has(i) ? ", breaks a rule" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function set(i, x) {
    if (won || mark[i] === x) return;
    history.push({ i, v: mark[i] });
    mark[i] = x;
    render();
    checkWin();
  }

  function checkWin() {
    for (const R of P.regions) if (R.filter((i) => mark[i] === 1).length !== 2) return;
    for (let i = 0; i < mark.length; i++) if (mark[i] === 1 && P.nb[i].filter((j) => mark[j] === 1).length !== 1) return;
    won = true;
    page.win();
    render();
  }

  const toggleDot = (i) => set(i, mark[i] === 2 ? 0 : 2);

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".nr-cell");
    if (el) set(+el.dataset.i, (mark[+el.dataset.i] + 1) % 3);
  });
  boardEl.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".nr-cell");
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

  const page = Gamekit.puzzlePage({
    id: "norinori",
    status: "Two shaded cells per region, in dominoes that never touch side-on.",
    generate: pick,
    start,
    reset: () => {
      mark = new Uint8Array(P.n * P.n);
      history = [];
      won = false;
      render();
    },
  });
  window.addEventListener("load", () => Manpage.autoOpen("norinori"));

  Gamekit.gridKeys(boardEl, { selector: ".nr-cell", onSecondary: (el) => toggleDot(+el.dataset.i) });
})();
