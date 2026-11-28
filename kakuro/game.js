(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 7, density: 0.2, maxRun: 4, grade: "basic" },
    medium: { n: 8, density: 0.2, maxRun: 5, grade: "deduce" },
    hard:   { n: 9, density: 0.2, maxRun: 5, grade: "deep" },
  };
  const ALL = 0x3fe; // digits 1..9 as bits 1..9

  // ---------- generator + solver (no DOM) ----------
  // An n×n grid; row 0 and column 0 are always clue cells. white[i] marks entry cells.
  // A run is a maximal line of white cells; its clue sits in the black cell just before it.
  // Solver state: dom[i] = bitmask of digits still possible for white cell i.

  const bits = Gamekit.bitCount;
  const digitOf = (m) => 31 - Math.clz32(m);

  // COMBOS[len][sum]: digit sets (bitmasks) of `len` distinct digits adding to `sum`.
  const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
  for (let m = 2; m <= ALL; m += 2) {
    let s = 0;
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) s += d;
    COMBOS[bits(m)][s].push(m);
  }

  function buildRuns(n, white) {
    const runs = [], across = new Int16Array(n * n).fill(-1), down = new Int16Array(n * n).fill(-1);
    for (const horiz of [true, false]) {
      for (let a = 0; a < n; a++) {
        let cur = null;
        for (let b = 0; b < n; b++) {
          const i = horiz ? a * n + b : b * n + a;
          if (!white[i]) { cur = null; continue; }
          if (!cur) {
            cur = { clue: horiz ? i - 1 : i - n, horiz, cells: [], sum: 0 };
            runs.push(cur);
          }
          cur.cells.push(i);
          (horiz ? across : down)[i] = runs.length - 1;
        }
      }
    }
    return { runs, across, down };
  }

  function puzzle(n, white, digits) {
    const { runs, across, down } = buildRuns(n, white);
    for (const r of runs) r.sum = r.cells.reduce((s, i) => s + digits[i], 0);
    const cells = [];
    for (let i = 0; i < n * n; i++) if (white[i]) cells.push(i);
    return { n, white, runs, across, down, cells };
  }

  // Narrows every run to the digit sets that still fit; false on contradiction.
  function propagate(P, dom) {
    for (let changed = true; changed;) {
      changed = false;
      for (const run of P.runs) {
        let placed = 0, nPlaced = 0;
        for (const i of run.cells) if (bits(dom[i]) === 1) { placed |= dom[i]; nPlaced++; }
        if (bits(placed) !== nPlaced) return false;
        let allowed = 0, required = ALL;
        for (const c of COMBOS[run.cells.length][run.sum] || []) {
          if ((c & placed) !== placed) continue;
          let cover = 0, ok = true;
          for (const i of run.cells) {
            const d = dom[i] & c;
            if (!d) { ok = false; break; }
            cover |= d;
          }
          if (!ok || cover !== c) continue;
          allowed |= c;
          required &= c;
        }
        if (!allowed) return false;
        for (const i of run.cells) {
          let d = dom[i] & allowed;
          if (bits(dom[i]) > 1) d &= ~placed;
          if (!d) return false;
          if (d !== dom[i]) { dom[i] = d; changed = true; }
        }
        // A digit every fitting set needs, with only one cell left that can hold it.
        for (let m = required & ~placed; m; m &= m - 1) {
          const bit = m & -m;
          let where = -1, count = 0;
          for (const i of run.cells) if (dom[i] & bit) { where = i; count++; }
          if (!count) return false;
          if (count === 1 && dom[where] !== bit) { dom[where] = bit; changed = true; }
        }
      }
    }
    return true;
  }

  function fresh(P) { const dom = new Uint16Array(P.n * P.n); for (const i of P.cells) dom[i] = ALL; return dom; }
  const { basicSolve, logicSolve, findSolutions } = Gamekit.domainSolver({ propagate, fresh, cells: (P) => P.cells });

  // Symmetric black cells, then repair: no run of length 1 or longer than maxRun, all white cells connected.
  function layout(n, density, maxRun, rng) {
    const white = new Uint8Array(n * n);
    for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) white[r * n + c] = 1;
    const sym = (i) => {
      const r = Math.floor(i / n), c = i % n;
      return (n - r) * n + (n - c);
    };
    for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) {
      const i = r * n + c, j = sym(i);
      if (j < i) continue;
      if (rng() < density) white[i] = white[j] = 0;
    }
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < n * n; i++) {
        if (!white[i]) continue;
        const r = Math.floor(i / n), c = i % n;
        const h = (c > 1 && white[i - 1]) || (c < n - 1 && white[i + 1]);
        const v = (r > 1 && white[i - n]) || (r < n - 1 && white[i + n]);
        if (!h || !v) { white[i] = white[sym(i)] = 0; changed = true; }
      }
      if (changed) continue;
      for (const run of buildRuns(n, white).runs) {
        if (run.cells.length <= maxRun) continue;
        const i = run.cells[1 + Math.floor(rng() * (run.cells.length - 2))];
        white[i] = white[sym(i)] = 0;
        changed = true;
        break;
      }
    }
    const cells = [];
    for (let i = 0; i < n * n; i++) if (white[i]) cells.push(i);
    if (cells.length < (n - 1) * (n - 1) * 0.55) return null;
    const seen = new Set([cells[0]]), stack = [cells[0]];
    while (stack.length) {
      const x = stack.pop();
      for (const y of [x - 1, x + 1, x - n, x + n]) if (y >= 0 && y < n * n && white[y] && !seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return seen.size === cells.length ? white : null;
  }

  // Random digits with no repeat in any run.
  function fill(n, white, rng) {
    const { runs, across, down } = buildRuns(n, white);
    const used = new Uint16Array(runs.length), digits = new Uint8Array(n * n), cells = [];
    for (let i = 0; i < n * n; i++) if (white[i]) cells.push(i);
    let budget = 20000;
    return (function place(k) {
      if (k === cells.length) return true;
      if (--budget < 0) return false;
      const i = cells[k], a = across[i], d = down[i];
      for (const x of Gamekit.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
        const bit = 1 << x;
        if ((used[a] | used[d]) & bit) continue;
        used[a] |= bit; used[d] |= bit; digits[i] = x;
        if (place(k + 1)) return true;
        used[a] &= ~bit; used[d] &= ~bit;
      }
      return false;
    })(0) ? digits : null;
  }

  // Change a digit where a rival solution differs, keeping runs repeat-free, until the answer is
  // unique. The new digit is the one whose two run sums have the fewest digit sets.
  function makeUnique(n, white, digits, rng, maxTries) {
    for (let t = 0; t <= maxTries; t++) {
      const P = puzzle(n, white, digits);
      const { sols, complete } = findSolutions(P, 2, 4000);
      if (!complete) return null;
      if (sols.length === 1) { P.solution = digits; return P; }
      const rival = sols.find((dom) => P.cells.some((i) => digitOf(dom[i]) !== digits[i]));
      const diff = Gamekit.shuffle(P.cells.filter((i) => digitOf(rival[i]) !== digits[i]), rng);
      let changed = false;
      for (const i of diff) {
        const taken = new Set();
        for (const j of P.runs[P.across[i]].cells.concat(P.runs[P.down[i]].cells)) if (j !== i) taken.add(digits[j]);
        const a = P.runs[P.across[i]], d = P.runs[P.down[i]];
        let best = Infinity, pick = [];
        for (let x = 1; x <= 9; x++) {
          if (x === digits[i] || taken.has(x)) continue;
          const score = COMBOS[a.cells.length][a.sum - digits[i] + x].length + COMBOS[d.cells.length][d.sum - digits[i] + x].length;
          if (score < best) { best = score; pick = [x]; } else if (score === best) pick.push(x);
        }
        if (!pick.length) continue;
        digits[i] = pick[Math.floor(rng() * pick.length)];
        changed = true;
        break;
      }
      if (!changed) return null;
    }
    return null;
  }

  function fits(P, grade) {
    if (grade === "basic") return basicSolve(P);
    if (grade === "deduce") return !basicSolve(P) && logicSolve(P);
    return !basicSolve(P);
  }

  function generate(diffName, seed) {
    const { n, density, maxRun, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      let white = null;
      for (let k = 0; k < 500 && !white; k++) white = layout(n, density, maxRun, rng);
      if (!white) continue;
      const digits = fill(n, white, rng);
      if (!digits) continue;
      const P = makeUnique(n, white, digits, rng, 60);
      if (!P) continue;
      if (fits(P, grade)) return P;
      if (!fallback) fallback = P;
    }
    return fallback;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const padEl    = document.getElementById("pad");
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const notesBtn = document.getElementById("notes-btn");
  const chipsEl  = document.getElementById("chips");
  const STATUS = "Each run adds up to its clue.";
  const store = Gamekit.storage("kakuro:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });

  let diff = "medium";
  let P = null, val = null, notes = null, history = [], won = false, sel = -1, noteMode = false;
  let cellEls = [], clueEls = [];
  let dailyDate = null;

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("kakuro", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    P = generate(diff, seed);
    val = new Uint8Array(P.n * P.n);
    notes = new Uint16Array(P.n * P.n);
    history = [];
    won = false;
    sel = -1;
    build();
    clock.start();
    statusEl.textContent = STATUS;
  }

  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + n + ", 1fr)";
    boardEl.style.setProperty("--n", n);
    cellEls = new Array(n * n);
    clueEls = new Array(P.runs.length);
    const clueAt = new Map();
    P.runs.forEach((run, k) => {
      if (!clueAt.has(run.clue)) clueAt.set(run.clue, []);
      clueAt.get(run.clue).push(k);
    });
    for (let i = 0; i < n * n; i++) {
      let el;
      if (P.white[i]) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "kk-cell";
        el.dataset.i = i;
        cellEls[i] = el;
      } else {
        el = document.createElement("div");
        el.className = "kk-block";
        el.setAttribute("aria-hidden", "true");
        const ks = clueAt.get(i) || [];
        if (ks.length) el.classList.add("clue");
        for (const k of ks) {
          const s = document.createElement("span");
          s.className = P.runs[k].horiz ? "ac" : "dn";
          s.textContent = P.runs[k].sum;
          el.appendChild(s);
          clueEls[k] = s;
        }
      }
      boardEl.appendChild(el);
    }
    render();
  }

  function render() {
    const n = P.n, bad = new Set();
    P.runs.forEach((run, k) => {
      const seen = new Map();
      let sum = 0, full = true;
      for (const i of run.cells) {
        const v = val[i];
        if (!v) { full = false; continue; }
        sum += v;
        if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); } else seen.set(v, i);
      }
      clueEls[k].className = (run.horiz ? "ac" : "dn") + (sum > run.sum || (full && sum !== run.sum) ? " bad" : full ? " ok" : "");
    });
    for (const i of P.cells) {
      const el = cellEls[i], v = val[i];
      el.className = "kk-cell" + (i === sel ? " sel" : "") + (bad.has(i) ? " err" : "") + (won ? " won" : "");
      if (v) el.textContent = v;
      else if (notes[i]) {
        el.innerHTML = "";
        const g = document.createElement("span");
        g.className = "kk-notes";
        g.setAttribute("aria-hidden", "true");
        for (let d = 1; d <= 9; d++) {
          const s = document.createElement("span");
          if (notes[i] & (1 << d)) s.dataset.d = d;
          g.appendChild(s);
        }
        el.appendChild(g);
      } else el.textContent = "";
      const a = P.runs[P.across[i]], d = P.runs[P.down[i]];
      const marks = [];
      for (let x = 1; x <= 9; x++) if (notes[i] & (1 << x)) marks.push(x);
      el.setAttribute("aria-label", "Row " + Math.floor(i / n) + " column " + (i % n) +
        ", across " + a.sum + " in " + a.cells.length + ", down " + d.sum + " in " + d.cells.length +
        (v ? ", " + v : marks.length ? ", notes " + marks.join(" ") : ", empty") + (bad.has(i) ? ", repeated" : ""));
    }
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
    notesBtn.setAttribute("aria-pressed", noteMode ? "true" : "false");
  }

  function enter(d) {
    if (won || sel < 0) return;
    const before = { i: sel, v: val[sel], notes: notes[sel] };
    if (!d) { val[sel] = 0; notes[sel] = 0; }
    else if (noteMode && !val[sel]) notes[sel] ^= 1 << d;
    else { val[sel] = val[sel] === d ? 0 : d; }
    if (val[before.i] === before.v && notes[before.i] === before.notes) return;
    history.push(before);
    render();
    checkWin();
  }

  function checkWin() {
    for (const i of P.cells) if (!val[i]) return;
    for (const run of P.runs) {
      let sum = 0, mask = 0;
      for (const i of run.cells) { sum += val[i]; mask |= 1 << val[i]; }
      if (sum !== run.sum || bits(mask) !== run.cells.length) return;
    }
    won = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("kakuro", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Solved in ' + Gamekit.fmtTime(s) + ".</span>";
    render();
  }

  function select(i) {
    if (sel === i) return;
    sel = i;
    render();
  }

  boardEl.addEventListener("click", (e) => {
    const el = e.target.closest(".kk-cell");
    if (el) select(+el.dataset.i);
  });
  boardEl.addEventListener("focusin", (e) => {
    const el = e.target.closest(".kk-cell");
    if (el) select(+el.dataset.i);
  });

  Gamekit.numberPad(padEl, 9, enter);

  notesBtn.addEventListener("click", () => { noteMode = !noteMode; render(); });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    const k = e.key;
    if (k >= "1" && k <= "9") { enter(+k); e.preventDefault(); }
    else if (k === "Backspace" || k === "Delete" || k === "0") { enter(0); e.preventDefault(); }
    else if (k === "n" || k === "N") { noteMode = !noteMode; render(); e.preventDefault(); }
  });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    const h = history.pop();
    val[h.i] = h.v;
    notes[h.i] = h.notes;
    render();
  });

  resetBtn.addEventListener("click", () => {
    val = new Uint8Array(P.n * P.n);
    notes = new Uint16Array(P.n * P.n);
    history = [];
    won = false;
    clock.start();
    statusEl.textContent = STATUS;
    render();
  });

  newBtn.addEventListener("click", () => newPuzzle(Gamekit.randomSeed()));

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newPuzzle(); },
  });
  diff = chips.get();

  newPuzzle();
  window.addEventListener("load", () => Manpage.autoOpen("kakuro"));

  Gamekit.gridKeys(boardEl, { selector: ".kk-cell" });
})();
