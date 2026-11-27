(function () {
  "use strict";

  const boardEl   = document.getElementById("board");
  const paletteEl = document.getElementById("palette");
  const statusEl  = document.getElementById("status");
  const turnEl    = document.getElementById("turn");
  const maxEl     = document.getElementById("max");
  const bestEl    = document.getElementById("best");
  const delBtn    = document.getElementById("del-btn");
  const guessBtn  = document.getElementById("guess-btn");
  const newBtn    = document.getElementById("new-btn");
  const chipsEl   = document.getElementById("chips");

  const DIFFS = {
    easy:   { pegs: 4, colors: 6, guesses: 10 },
    medium: { pegs: 4, colors: 6, guesses: 8 },
    hard:   { pegs: 5, colors: 8, guesses: 10 },
  };
  const COLOR_NAMES = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "white"];
  const store = Gamekit.storage("code-breaker:");

  let diff = "medium";
  let cfg = DIFFS[diff];
  let secret = [];
  let rows = [];       // [{ guess, exact, partial }]
  let current = [];    // active row; 0 = empty, 1..colors = color
  let over = false;
  let won = false;

  function makeSecret(seed) {
    const rng = Gamekit.mulberry32(seed);
    const code = [];
    for (let i = 0; i < cfg.pegs; i++) code.push(1 + Math.floor(rng() * cfg.colors));
    return code;
  }

  // Exact = right color, right spot. Partial = shared color counts among the non-exact pegs.
  function score(code, guess) {
    let exact = 0;
    const cs = new Array(9).fill(0), cg = new Array(9).fill(0);
    for (let i = 0; i < code.length; i++) {
      if (code[i] === guess[i]) exact++;
      else { cs[code[i]]++; cg[guess[i]]++; }
    }
    let partial = 0;
    for (let c = 1; c <= 8; c++) partial += Math.min(cs[c], cg[c]);
    return { exact, partial };
  }

  function newGame(seedOverride) {
    cfg = DIFFS[diff];
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("code-breaker", diff);
    secret = makeSecret(seed);
    rows = [];
    current = new Array(cfg.pegs).fill(0);
    over = false;
    won = false;
    maxEl.textContent = cfg.guesses;
    renderPalette();
    render();
  }

  function pegEl(tag, color, label) {
    const el = document.createElement(tag);
    el.className = "cb-peg" + (color ? " c" + color : " empty");
    el.textContent = color ? String(color) : "·";
    if (tag === "button") el.type = "button";
    el.setAttribute("aria-label", label);
    return el;
  }

  function feedbackEl(exact, partial) {
    const fb = document.createElement("div");
    fb.className = "cb-fb";
    fb.setAttribute("aria-label", exact + " exact, " + partial + " partial");
    for (let i = 0; i < cfg.pegs; i++) {
      const d = document.createElement("i");
      if (i < exact) d.className = "exact";
      else if (i < exact + partial) d.className = "partial";
      fb.appendChild(d);
    }
    return fb;
  }

  function rowEl(numText, cls) {
    const row = document.createElement("div");
    row.className = "cb-row" + (cls ? " " + cls : "");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = numText;
    row.appendChild(num);
    const pegs = document.createElement("div");
    pegs.className = "cb-pegs";
    row.appendChild(pegs);
    return { row, pegs };
  }

  function render() {
    boardEl.innerHTML = "";

    const s = rowEl("", "secret");
    secret.forEach((c, i) => {
      if (over) {
        s.pegs.appendChild(pegEl("span", c, "Code peg " + (i + 1) + ": " + COLOR_NAMES[c - 1]));
      } else {
        const p = pegEl("span", 0, "Hidden peg " + (i + 1));
        p.classList.add("hidden");
        p.textContent = "?";
        s.pegs.appendChild(p);
      }
    });
    boardEl.appendChild(s.row);

    rows.forEach((r, ri) => {
      const el = rowEl(String(ri + 1));
      r.guess.forEach((c, i) => el.pegs.appendChild(pegEl("span", c, "Slot " + (i + 1) + ": " + COLOR_NAMES[c - 1])));
      el.row.appendChild(feedbackEl(r.exact, r.partial));
      boardEl.appendChild(el.row);
    });

    if (!over) {
      const el = rowEl(String(rows.length + 1), "active");
      current.forEach((c, i) => {
        const b = pegEl("button", c, "Slot " + (i + 1) + ": " + (c ? COLOR_NAMES[c - 1] + ", tap to clear" : "empty"));
        b.addEventListener("click", () => { if (!over && current[i]) { current[i] = 0; render(); } });
        el.pegs.appendChild(b);
      });
      const spacer = document.createElement("div");
      spacer.className = "cb-fb";
      el.row.appendChild(spacer);
      boardEl.appendChild(el.row);
    }

    updateStatus();
  }

  function renderPalette() {
    paletteEl.innerHTML = "";
    for (let c = 1; c <= cfg.colors; c++) {
      const b = pegEl("button", c, "Add " + COLOR_NAMES[c - 1]);
      b.addEventListener("click", () => addPeg(c));
      paletteEl.appendChild(b);
    }
  }

  function updateStatus() {
    const best = store.getInt("best:" + diff, null);
    bestEl.textContent = best === null ? "—" : best;
    turnEl.textContent = over ? rows.length : rows.length + 1;
    guessBtn.disabled = over || current.some(x => !x);
    delBtn.disabled = over || current.every(x => !x);
    paletteEl.querySelectorAll("button").forEach(b => { b.disabled = over; });

    if (won) {
      statusEl.innerHTML = '<span class="ok">Cracked in ' + rows.length + ' guess' + (rows.length === 1 ? '' : 'es') + '.</span>';
    } else if (over) {
      statusEl.innerHTML = '<span class="bad">Out of guesses.</span> Code revealed above.';
    } else if (rows.length === 0) {
      statusEl.textContent = "Crack the code.";
    } else {
      const left = cfg.guesses - rows.length;
      statusEl.textContent = left + " guess" + (left === 1 ? "" : "es") + " left.";
    }
  }

  function addPeg(c) {
    if (over) return;
    const i = current.indexOf(0);
    if (i === -1) return;
    current[i] = c;
    render();
  }

  function deletePeg() {
    if (over) return;
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i]) { current[i] = 0; render(); return; }
    }
  }

  function submit() {
    if (over || current.some(x => !x)) return;
    const guess = current.slice();
    const r = score(secret, guess);
    rows.push({ guess, exact: r.exact, partial: r.partial });
    current = new Array(cfg.pegs).fill(0);
    if (r.exact === cfg.pegs) {
      won = true;
      over = true;
      const best = store.getInt("best:" + diff, null);
      if (best === null || rows.length < best) store.set("best:" + diff, rows.length);
    } else if (rows.length >= cfg.guesses) {
      over = true;
    }
    render();
  }

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newGame(); },
  });
  diff = chips.get();

  delBtn.addEventListener("click", deletePeg);
  guessBtn.addEventListener("click", submit);
  newBtn.addEventListener("click", () => newGame(Gamekit.randomSeed()));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".man-backdrop:not(.closing)")) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= cfg.colors) { addPeg(n); e.preventDefault(); }
    else if (e.key === "Backspace") { deletePeg(); e.preventDefault(); }
    else if (e.key === "Enter") {
      // Let Enter activate a focused button natively instead of also submitting.
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
      submit(); e.preventDefault();
    }
  });

  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("code-breaker"));
})();
