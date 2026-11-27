(function () {
  "use strict";

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const name1El  = document.getElementById("name1");
  const name2El  = document.getElementById("name2");
  const score1El = document.getElementById("score1");
  const score2El = document.getElementById("score2");
  const recordEl = document.getElementById("record");
  const undoBtn  = document.getElementById("undo-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const modeSel  = document.getElementById("mode");
  const sizeSel  = document.getElementById("size");

  const P1 = 1, P2 = 2;
  const MODES = ["human-first", "ai-first", "local"];
  const SIZES = [3, 4, 5];
  const store = Gamekit.storage("dots-and-boxes:");

  let diff = "medium";
  let mode = store.get("mode", "human-first");
  if (!MODES.includes(mode)) mode = "human-first";
  let N = store.getInt("size", 4);
  if (!SIZES.includes(N)) N = 4;
  modeSel.value = mode;
  sizeSel.value = String(N);

  // Lines: horizontals first (row r of dots, column c) then verticals.
  let H, L, boxLines, lineBoxes;
  function geometry() {
    H = (N + 1) * N;
    L = H + N * (N + 1);
    boxLines = [];
    lineBoxes = Array.from({ length: L }, () => []);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const lines = [r * N + c, (r + 1) * N + c, H + r * (N + 1) + c, H + r * (N + 1) + c + 1];
        const b = boxLines.length;
        boxLines.push(lines);
        lines.forEach(x => lineBoxes[x].push(b));
      }
    }
  }

  let drawn, lineBy, owner, current, scores, history, last, lastBy, over, aiTimer = null, aiGen = 0;
  let lineEls = [], boxEls = [];

  // ---------- Rules ----------

  function sides(d, b) { const l = boxLines[b]; return d[l[0]] + d[l[1]] + d[l[2]] + d[l[3]]; }

  function completes(d, x) { let k = 0; for (const b of lineBoxes[x]) if (sides(d, b) === 3) k++; return k; }

  // ---------- AI ----------

  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function undrawn(d) { const o = []; for (let x = 0; x < L; x++) if (!d[x]) o.push(x); return o; }

  // A safe line gives no box a third side.
  function isSafe(d, x) { return lineBoxes[x].every(b => sides(d, b) < 2); }

  // Boxes the opponent could take in a row if we draw x.
  function giveaway(d, x) {
    const t = d.slice();
    t[x] = 1;
    let n = 0;
    for (;;) {
      let cap = -1;
      for (let y = 0; y < L; y++) if (!t[y] && completes(t, y)) { cap = y; break; }
      if (cap < 0) return n;
      n += completes(t, cap);
      t[cap] = 1;
    }
  }

  // ---------- Endgame analysis (hard) ----------
  // Once every move gives boxes away, the board usually splits into independent chains
  // and loops. value() is the best net score for the player forced to open one of them,
  // assuming the opponent then takes everything or double-deals, whichever is better.

  function components(d, exclude) {
    const seen = new Set(exclude), comps = [];
    for (let b = 0; b < N * N; b++) {
      if (seen.has(b) || sides(d, b) === 4) continue;
      const stack = [b], boxes = [];
      let simple = true, ground = 0;
      seen.add(b);
      while (stack.length) {
        const bx = stack.pop();
        boxes.push(bx);
        if (sides(d, bx) !== 2) simple = false;
        for (const l of boxLines[bx]) {
          if (d[l]) continue;
          const other = lineBoxes[l].find(o => o !== bx);
          if (other === undefined) { ground++; continue; }
          if (exclude.includes(other)) { simple = false; continue; }
          if (!seen.has(other)) { seen.add(other); stack.push(other); }
        }
      }
      comps.push({ boxes, simple, loop: ground === 0 });
    }
    return comps;
  }

  const memo = new Map();
  function value(chains, loops) {
    if (!chains.length && !loops.length) return 0;
    const key = chains.join(",") + "|" + loops.join(",");
    if (memo.has(key)) return memo.get(key);
    let best = -Infinity;
    chains.forEach((k, i) => {
      if (i && chains[i - 1] === k) return;
      const v = value(chains.slice(0, i).concat(chains.slice(i + 1)), loops);
      best = Math.max(best, k <= 2 ? -k - v : Math.min(-k - v, -(k - 4) + v));
    });
    loops.forEach((k, i) => {
      if (i && loops[i - 1] === k) return;
      const v = value(chains, loops.slice(0, i).concat(loops.slice(i + 1)));
      best = Math.max(best, Math.min(-k - v, -(k - 8) + v));
    });
    memo.set(key, best);
    return best;
  }

  function split(comps) {
    const chains = comps.filter(c => !c.loop).map(c => c.boxes.length).sort((a, b) => a - b);
    const loops = comps.filter(c => c.loop).map(c => c.boxes.length).sort((a, b) => a - b);
    return { chains, loops };
  }

  // Forced to open something: open the component that is best for us. A 2-chain is
  // opened through its middle (hard-hearted handout) so it can't be double-dealt.
  function bestOpening(d) {
    const comps = components(d, []);
    if (!comps.length || comps.some(c => !c.simple)) return -1;
    let best = -Infinity, pickC = null;
    comps.forEach((c, i) => {
      const rest = split(comps.filter((_, j) => j !== i));
      const v = value(rest.chains, rest.loops), k = c.boxes.length;
      const net = c.loop ? Math.min(-k - v, -(k - 8) + v) : k <= 2 ? -k - v : Math.min(-k - v, -(k - 4) + v);
      if (net > best) { best = net; pickC = c; }
    });
    const bx = pickC.boxes;
    const lines = new Set();
    bx.forEach(b => boxLines[b].forEach(l => { if (!d[l]) lines.add(l); }));
    if (!pickC.loop && bx.length === 2) {
      const mid = [...lines].find(l => lineBoxes[l].length === 2 && bx.includes(lineBoxes[l][0]) && bx.includes(lineBoxes[l][1]));
      if (mid !== undefined) return mid;
    }
    if (!pickC.loop) {
      const end = [...lines].find(l => lineBoxes[l].length === 1);
      if (end !== undefined) return end;
    }
    return [...lines][0];
  }

  // Two boxes left in a chain we're taking (b1 ready, b2 behind it): draw b2's far side
  // instead, handing both boxes over, when keeping control is worth more than 2 + 2.
  function doubleDeal(d) {
    const caps = undrawn(d).filter(x => completes(d, x));
    if (caps.length !== 1) return -1;
    const x = caps[0];
    if (lineBoxes[x].length !== 2) return -1;
    const [a, b] = lineBoxes[x];
    const b1 = sides(d, a) === 3 ? a : b, b2 = b1 === a ? b : a;
    if (sides(d, b1) !== 3 || sides(d, b2) !== 2) return -1;
    const y = boxLines[b2].find(l => !d[l] && l !== x);
    if (y === undefined || lineBoxes[y].length !== 1) return -1;
    const comps = components(d, [b1, b2]);
    if (!comps.length || comps.some(c => !c.simple)) return -1;
    const rest = split(comps);
    return value(rest.chains, rest.loops) < -2 ? y : -1;
  }

  // With few safe lines left, search every order of safe moves: whoever runs out first
  // must open a chain, so play the safe line that leaves the best endgame for us.
  function endgameValue(d) {
    const comps = components(d, []);
    if (comps.length && comps.every(c => c.simple)) {
      const s = split(comps);
      return value(s.chains, s.loops);
    }
    let least = Infinity;
    for (const x of undrawn(d)) least = Math.min(least, giveaway(d, x));
    return least === Infinity ? 0 : -least;
  }

  // Bounded so a crowded board can't stall the page; over budget, fall back to any safe line.
  const BUDGET = {};
  let budget = 0;

  function safeSearch(d, cache) {
    const key = d.join("");
    if (cache.has(key)) return cache.get(key);
    if (--budget < 0) throw BUDGET;
    const safes = undrawn(d).filter(x => isSafe(d, x));
    let best;
    if (!safes.length) best = endgameValue(d);
    else {
      best = -Infinity;
      for (const x of safes) {
        d[x] = 1;
        best = Math.max(best, -safeSearch(d, cache));
        d[x] = 0;
        if (best === Infinity) break;
      }
    }
    cache.set(key, best);
    return best;
  }

  function bestSafe(d, safes) {
    const cache = new Map(), t = d.slice();
    let best = -Infinity, choices = [];
    budget = 5000;
    try {
      for (const x of safes) {
        t[x] = 1;
        const v = -safeSearch(t, cache);
        t[x] = 0;
        if (v > best) { best = v; choices = [x]; }
        else if (v === best) choices.push(x);
      }
    } catch (e) {
      if (e !== BUDGET) throw e;
      return pick(safes);
    }
    return pick(choices);
  }

  function aiMove(d) {
    const free = undrawn(d);
    const caps = free.filter(x => completes(d, x));
    if (diff === "easy") return caps.length ? pick(caps) : pick(free);
    const safes = free.filter(x => isSafe(d, x));
    if (caps.length) {
      if (diff === "hard" && !safes.length) {
        const dd = doubleDeal(d);
        if (dd >= 0) return dd;
      }
      return pick(caps);
    }
    if (safes.length) return diff === "hard" && safes.length <= 12 ? bestSafe(d, safes) : pick(safes);
    if (diff === "hard") {
      const open = bestOpening(d);
      if (open >= 0) return open;
    }
    let best = Infinity, choices = [];
    for (const x of free) {
      const g = giveaway(d, x);
      if (g < best) { best = g; choices = [x]; }
      else if (g === best) choices.push(x);
    }
    return pick(choices);
  }

  // ---------- Game flow ----------

  function humanPlayer() { return mode === "ai-first" ? P2 : P1; }
  function isHumanTurn() { return mode === "local" || current === humanPlayer(); }

  function newGame() {
    cancelAI();
    geometry();
    drawn = new Uint8Array(L);
    lineBy = new Uint8Array(L);
    owner = new Uint8Array(N * N);
    current = P1;
    scores = [0, 0, 0];
    history = [];
    last = -1;
    lastBy = 0;
    over = false;
    buildBoard();
    render();
    advance();
  }

  function play(x) {
    history.push({ drawn: drawn.slice(), lineBy: lineBy.slice(), owner: owner.slice(), current, scores: scores.slice(), last, lastBy });
    const k = completes(drawn, x);
    drawn[x] = 1;
    lineBy[x] = current;
    for (const b of lineBoxes[x]) if (sides(drawn, b) === 4) owner[b] = current;
    scores[current] += k;
    last = x;
    lastBy = current;
    if (scores[1] + scores[2] === N * N) { over = true; finish(); }
    else if (!k) current = 3 - current;
    render(k);
    advance();
  }

  function recKey() { return "rec:" + diff + ":" + N; }

  function finish() {
    if (mode === "local") return;
    const h = humanPlayer();
    const diffScore = scores[h] - scores[3 - h];
    const rec = store.getJSON(recKey(), { w: 0, l: 0, d: 0 });
    if (diffScore > 0) rec.w++; else if (diffScore < 0) rec.l++; else rec.d++;
    store.setJSON(recKey(), rec);
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
      play(aiMove(drawn));
    }, 320);
  }

  // ---------- Rendering ----------

  function buildBoard() {
    boardEl.innerHTML = "";
    const tpl = "repeat(" + N + ", var(--dot) 1fr) var(--dot)";
    boardEl.style.gridTemplateColumns = tpl;
    boardEl.style.gridTemplateRows = tpl;
    lineEls = new Array(L);
    boxEls = new Array(N * N);
    const S = 2 * N + 1;
    for (let R = 0; R < S; R++) {
      for (let C = 0; C < S; C++) {
        let el;
        if (R % 2 === 0 && C % 2 === 0) {
          el = document.createElement("div");
          el.className = "db-dot";
        } else if (R % 2 === 1 && C % 2 === 1) {
          const b = ((R - 1) / 2) * N + (C - 1) / 2;
          el = document.createElement("div");
          el.className = "db-box";
          boxEls[b] = el;
        } else {
          const horiz = R % 2 === 0;
          const x = horiz ? (R / 2) * N + (C - 1) / 2 : H + ((R - 1) / 2) * (N + 1) + C / 2;
          el = document.createElement("button");
          el.type = "button";
          el.className = "db-line " + (horiz ? "db-h" : "db-v");
          el.dataset.x = x;
          el.dataset.rc = R + "," + C;
          lineEls[x] = el;
        }
        boardEl.appendChild(el);
      }
    }
  }

  function names() {
    if (mode === "local") return { 1: "P1", 2: "P2" };
    return mode === "ai-first" ? { 1: "AI", 2: "You" } : { 1: "You", 2: "AI" };
  }

  function render(justScored) {
    const humanTurn = !over && isHumanTurn();
    const nm = names();
    for (let x = 0; x < L; x++) {
      const el = lineEls[x];
      el.className = el.className.split(" ").slice(0, 2).join(" ") +
        (drawn[x] ? " p" + lineBy[x] : humanTurn ? " avail" : "") + (x === last ? " last" : "");
      el.setAttribute("aria-label", (x < H ? "Horizontal" : "Vertical") + " line " + (x + 1) + (drawn[x] ? ", drawn" : ""));
    }
    for (let b = 0; b < N * N; b++) {
      boxEls[b].className = "db-box" + (owner[b] ? " p" + owner[b] : "");
      boxEls[b].textContent = owner[b] ? (nm[owner[b]] === "You" ? "Y" : nm[owner[b]] === "AI" ? "A" : String(owner[b])) : "";
    }
    name1El.textContent = nm[1];
    name2El.textContent = nm[2];
    score1El.textContent = scores[1];
    score2El.textContent = scores[2];
    const rec = store.getJSON(recKey(), { w: 0, l: 0, d: 0 });
    recordEl.textContent = mode === "local" ? N + "×" + N : "W–L–D " + rec.w + "–" + rec.l + "–" + rec.d;
    undoBtn.disabled = !history.length || (over && mode !== "local");

    if (over) {
      const a = scores[1], b = scores[2];
      if (mode === "local") {
        statusEl.innerHTML = a === b ? '<span class="hot">Draw ' + a + '–' + b + '.</span>'
          : '<span class="ok">' + (a > b ? "P1" : "P2") + ' wins ' + Math.max(a, b) + '–' + Math.min(a, b) + '.</span>';
      } else {
        const h = humanPlayer(), mine = scores[h], theirs = scores[3 - h];
        statusEl.innerHTML = mine > theirs ? '<span class="ok">You win ' + mine + '–' + theirs + '.</span>'
          : mine < theirs ? '<span class="bad">AI wins ' + theirs + '–' + mine + '.</span>'
          : '<span class="hot">Draw ' + mine + '–' + theirs + '.</span>';
      }
    } else if (mode === "local") {
      statusEl.textContent = (justScored ? "Box! " : "") + nm[current] + " to move.";
    } else if (isHumanTurn()) {
      statusEl.textContent = justScored ? "Box! Go again." : "Your move.";
    } else {
      statusEl.textContent = justScored ? "AI took a box…" : "AI thinking…";
    }
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".db-line");
    if (!el || over || !isHumanTurn()) return;
    const x = parseInt(el.dataset.x, 10);
    if (drawn[x]) return;
    play(x);
  });

  // Undo back to the most recent position where it was the human's move.
  // Finished AI games stay final so the win–loss record can't be replayed.
  undoBtn.addEventListener("click", () => {
    if (!history.length || (over && mode !== "local")) return;
    cancelAI();
    let h;
    do { h = history.pop(); } while (mode !== "local" && history.length && h.current !== humanPlayer());
    drawn = h.drawn; lineBy = h.lineBy; owner = h.owner; current = h.current;
    scores = h.scores; last = h.last; lastBy = h.lastBy;
    over = false;
    render();
    advance();
  });

  newBtn.addEventListener("click", newGame);

  modeSel.addEventListener("change", () => {
    mode = modeSel.value;
    store.set("mode", mode);
    newGame();
  });

  sizeSel.addEventListener("change", () => {
    N = parseInt(sizeSel.value, 10);
    store.set("size", N);
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

  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("dots-and-boxes"));

  // Lines sit on a (2N+1)² lattice where row+col is odd. Left/Right walk the row;
  // Up/Down step to the adjacent row, zig-zagging so they undo each other.
  Gamekit.gridKeys(boardEl, {
    selector: ".db-line",
    next: (el, key) => {
      const [R, C] = el.dataset.rc.split(",").map(Number), S = 2 * N;
      let r = R, c = C;
      if (key === "ArrowRight") c += 2;
      else if (key === "ArrowLeft") c -= 2;
      else {
        r += key === "ArrowDown" ? 1 : -1;
        c = R % 2 === 0 ? C + 1 : C - 1;
        if (c < 0) c = C + 1;
        if (c > S) c = C - 1;
      }
      return boardEl.querySelector('.db-line[data-rc="' + r + "," + c + '"]');
    },
  });
})();
