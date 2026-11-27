(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const movesEl  = document.getElementById("moves");
  const bestEl   = document.getElementById("best");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");

  const DIFFS = { easy: 3, medium: 4, hard: 5 };
  const store = Gamekit.storage("slide-15:");

  let diff = "medium";
  let N = DIFFS[diff];
  let tiles = [];      // tiles[cell] = number, 0 = empty space
  let initial = [];
  let history = [];    // [{ tiles, moves }]
  let moves = 0;
  let won = false;

  function solvedBoard(n) {
    const a = [];
    for (let i = 1; i < n * n; i++) a.push(i);
    a.push(0);
    return a;
  }

  function isSolved(t) {
    for (let i = 0; i < t.length - 1; i++) if (t[i] !== i + 1) return false;
    return true;
  }

  function neighbors(cell) {
    const r = Math.floor(cell / N), c = cell % N, out = [];
    if (r > 0) out.push(cell - N);
    if (r < N - 1) out.push(cell + N);
    if (c > 0) out.push(cell - 1);
    if (c < N - 1) out.push(cell + 1);
    return out;
  }

  // Random walk of legal slides from the solved board, so every scramble is solvable.
  function scramble(seed) {
    const rng = Gamekit.mulberry32(seed);
    const t = solvedBoard(N);
    let blank = t.length - 1, prev = -1;
    const steps = N * N * 20;
    for (let i = 0; i < steps || isSolved(t); i++) {
      const opts = neighbors(blank).filter(x => x !== prev);
      const next = opts[Math.floor(rng() * opts.length)];
      t[blank] = t[next];
      t[next] = 0;
      prev = blank;
      blank = next;
    }
    return t;
  }

  function newPuzzle(seedOverride) {
    N = DIFFS[diff];
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("slide-15", diff);
    initial = scramble(seed);
    tiles = initial.slice();
    history = [];
    moves = 0;
    won = false;
    boardEl.style.setProperty("--n", N);
    render();
  }

  function render() {
    boardEl.innerHTML = "";
    boardEl.classList.toggle("solved", won);
    tiles.forEach((v, i) => {
      if (v === 0) {
        const blank = document.createElement("div");
        blank.className = "sl-blank";
        blank.setAttribute("aria-hidden", "true");
        boardEl.appendChild(blank);
        return;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sl-tile" + (v === i + 1 ? " home" : "");
      b.textContent = v;
      b.dataset.cell = i;
      b.setAttribute("aria-label", "Tile " + v + ", row " + (Math.floor(i / N) + 1) + " col " + (i % N + 1));
      boardEl.appendChild(b);
    });
    updateStatus();
  }

  // Slide every tile between `cell` and the empty space one step toward the space.
  function slideFrom(cell) {
    if (won) return false;
    const blank = tiles.indexOf(0);
    const br = Math.floor(blank / N), bc = blank % N;
    const r = Math.floor(cell / N), c = cell % N;
    let step;
    if (r === br && c !== bc) step = c > bc ? 1 : -1;
    else if (c === bc && r !== br) step = r > br ? N : -N;
    else return false;

    history.push({ tiles: tiles.slice(), moves });
    let b = blank;
    while (b !== cell) {
      tiles[b] = tiles[b + step];
      tiles[b + step] = 0;
      b += step;
      moves++;
    }
    if (isSolved(tiles)) {
      won = true;
      const best = store.getInt("best:" + diff, null);
      if (best === null || moves < best) store.set("best:" + diff, moves);
    }
    render();
    return true;
  }

  function updateStatus() {
    movesEl.textContent = moves;
    const best = store.getInt("best:" + diff, null);
    bestEl.textContent = best === null ? "—" : best;
    undoBtn.disabled = history.length === 0;
    if (won) {
      statusEl.innerHTML = '<span class="ok">Solved in ' + moves + ' move' + (moves === 1 ? '' : 's') + '.</span>';
    } else {
      let home = 0;
      for (let i = 0; i < tiles.length - 1; i++) if (tiles[i] === i + 1) home++;
      statusEl.textContent = home + " of " + (tiles.length - 1) + " tiles home.";
    }
  }

  boardEl.addEventListener("click", (e) => {
    const t = e.target.closest(".sl-tile");
    if (t) slideFrom(parseInt(t.dataset.cell, 10));
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".man-backdrop:not(.closing)")) return;
    const blank = tiles.indexOf(0);
    const r = Math.floor(blank / N), c = blank % N;
    let src = -1;
    if (e.key === "ArrowLeft"  && c < N - 1) src = blank + 1;
    if (e.key === "ArrowRight" && c > 0)     src = blank - 1;
    if (e.key === "ArrowUp"    && r < N - 1) src = blank + N;
    if (e.key === "ArrowDown"  && r > 0)     src = blank - N;
    if (e.key.startsWith("Arrow")) e.preventDefault();
    if (src >= 0) slideFrom(src);
  });

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newPuzzle(); },
  });
  diff = chips.get();

  undoBtn.addEventListener("click", () => {
    const h = history.pop();
    if (!h) return;
    tiles = h.tiles;
    moves = h.moves;
    won = false;
    render();
  });

  resetBtn.addEventListener("click", () => {
    tiles = initial.slice();
    history = [];
    moves = 0;
    won = false;
    render();
  });

  newBtn.addEventListener("click", () => newPuzzle(Gamekit.randomSeed()));

  newPuzzle();
  window.addEventListener("load", () => Manpage.autoOpen("slide-15"));
})();
