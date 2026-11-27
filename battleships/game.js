(function () {
  "use strict";

  // ---------- Rules + AI (no DOM) ----------
  // Squares 0..99 = row * 10 + col. Shot knowledge per square: 0 unknown, 1 miss, 2 hit, 3 sunk.

  const N = 10;
  const FLEET = [["carrier", 5], ["battleship", 4], ["cruiser", 3], ["submarine", 3], ["destroyer", 2]];
  const UNKNOWN = 0, MISS = 1, HIT = 2, SUNK = 3;

  function placeFleet(rng) {
    const at = new Int8Array(N * N).fill(-1), ships = [];
    FLEET.forEach(([name, len], s) => {
      for (;;) {
        const horiz = rng() < 0.5;
        const r = Math.floor(rng() * (horiz ? N : N - len + 1)), c = Math.floor(rng() * (horiz ? N - len + 1 : N));
        const cells = [];
        for (let k = 0; k < len; k++) cells.push(horiz ? r * N + c + k : (r + k) * N + c);
        if (cells.some((i) => at[i] >= 0)) continue;
        for (const i of cells) at[i] = s;
        ships.push({ name, len, cells, hits: 0 });
        return;
      }
    });
    return { at, ships };
  }

  // Fires at `fleet`, updating `know`. Returns { result: "miss" | "hit" | "sunk", ship }.
  function fire(fleet, know, i) {
    const s = fleet.at[i];
    if (s < 0) { know[i] = MISS; return { result: "miss" }; }
    const ship = fleet.ships[s];
    ship.hits++;
    know[i] = HIT;
    if (ship.hits < ship.len) return { result: "hit", ship };
    for (const c of ship.cells) know[c] = SUNK;
    return { result: "sunk", ship };
  }

  function neighbours(i) {
    const r = Math.floor(i / N), c = i % N, out = [];
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    return out;
  }

  function pickRandom(list, rng) { return list[Math.floor(rng() * list.length)]; }

  function unknownCells(know) { const out = []; for (let i = 0; i < N * N; i++) if (know[i] === UNKNOWN) out.push(i); return out; }

  // Squares next to any open hit.
  function around(know) {
    const set = new Set();
    for (let i = 0; i < N * N; i++) if (know[i] === HIT) for (const j of neighbours(i)) if (know[j] === UNKNOWN) set.add(j);
    return [...set];
  }

  // Ends of every line of two or more open hits.
  function lineEnds(know) {
    const set = new Set();
    for (let i = 0; i < N * N; i++) {
      if (know[i] !== HIT) continue;
      const r = Math.floor(i / N), c = i % N;
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const pr = r - dr, pc = c - dc, nr = r + dr, nc = c + dc;
        const prevHit = pr >= 0 && pc >= 0 && know[pr * N + pc] === HIT;
        const nextHit = nr < N && nc < N && know[nr * N + nc] === HIT;
        if (prevHit || !nextHit) continue;
        // i starts a run; walk to its end and look one beyond each side.
        let er = r, ec = c;
        while (er + dr < N && ec + dc < N && know[(er + dr) * N + ec + dc] === HIT) { er += dr; ec += dc; }
        if (pr >= 0 && pc >= 0 && know[pr * N + pc] === UNKNOWN) set.add(pr * N + pc);
        if (er + dr < N && ec + dc < N && know[(er + dr) * N + ec + dc] === UNKNOWN) set.add((er + dr) * N + ec + dc);
      }
    }
    return [...set];
  }

  // For every way each unsunk ship could still lie, add weight to the squares it would cover.
  // With open hits, placements through them dominate.
  function heat(know, remaining) {
    const w = new Float64Array(N * N);
    const open = know.includes(HIT);
    for (const len of remaining) {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const horiz of [true, false]) {
        if (horiz ? c + len > N : r + len > N) continue;
        let hits = 0, ok = true;
        for (let k = 0; k < len && ok; k++) {
          const v = know[horiz ? r * N + c + k : (r + k) * N + c];
          if (v === MISS || v === SUNK) ok = false;
          else if (v === HIT) hits++;
        }
        if (!ok) continue;
        const weight = open ? (hits ? Math.pow(25, hits) : 1) : 1;
        for (let k = 0; k < len; k++) w[horiz ? r * N + c + k : (r + k) * N + c] += weight;
      }
    }
    return w;
  }

  function aiShot(level, know, remaining, rng) {
    if (level === "hard") {
      const w = heat(know, remaining);
      let best = -1, choices = [];
      for (let i = 0; i < N * N; i++) {
        if (know[i] !== UNKNOWN) continue;
        if (w[i] > best) { best = w[i]; choices = [i]; } else if (w[i] === best) choices.push(i);
      }
      return pickRandom(choices, rng);
    }
    if (level === "medium") {
      const ends = lineEnds(know);
      if (ends.length) return pickRandom(ends, rng);
    }
    const near = around(know);
    if (near.length) return pickRandom(near, rng);
    const free = unknownCells(know);
    if (level === "medium") {
      const step = Math.min(...remaining);
      const grid = free.filter((i) => (Math.floor(i / N) + i % N) % step === 0);
      if (grid.length) return pickRandom(grid, rng);
    }
    return pickRandom(free, rng);
  }

  // ---------- Game ----------

  const targetEl  = document.getElementById("target");
  const fleetEl   = document.getElementById("fleet");
  const statusEl  = document.getElementById("status");
  const shotsEl   = document.getElementById("shots");
  const recordEl  = document.getElementById("record");
  const bestEl    = document.getElementById("best");
  const enemyList = document.getElementById("enemy-ships");
  const myList    = document.getElementById("my-ships");
  const shuffleBtn = document.getElementById("shuffle-btn");
  const newBtn    = document.getElementById("new-btn");
  const chipsEl   = document.getElementById("chips");
  const store = Gamekit.storage("battleships:");
  const START = "Fire at the enemy grid.";

  let diff = "medium";
  let mine, theirs, myShots, aiShots, shots, turnHuman, over, lost, lastMine = -1, lastTheirs = -1, pop = -1, popMine = -1, timer = null;
  const targetCells = [], fleetCells = [];

  const sq = (i) => "ABCDEFGHIJ"[i % N] + (Math.floor(i / N) + 1);
  const remainingLens = (fleet) => fleet.ships.filter((s) => s.hits < s.len).map((s) => s.len);
  const allSunk = (fleet) => fleet.ships.every((s) => s.hits === s.len);

  function newGame() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    mine = placeFleet(Math.random);
    theirs = placeFleet(Math.random);
    myShots = new Uint8Array(N * N);
    aiShots = new Uint8Array(N * N);
    shots = 0;
    turnHuman = true;
    over = lost = false;
    lastMine = lastTheirs = -1;
    statusEl.textContent = START;
    render();
  }

  function finish(won) {
    over = true;
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0 });
    if (won) {
      rec.w++;
      const best = store.getInt("best:" + diff, null);
      if (best === null || shots < best) store.set("best:" + diff, shots);
    } else rec.l++;
    store.setJSON("rec:" + diff, rec);
  }

  function humanFire(i) {
    if (over || !turnHuman || myShots[i] !== UNKNOWN) return;
    shots++;
    lastTheirs = pop = i;
    const r = fire(theirs, myShots, i);
    let msg = r.result === "miss" ? "Miss at " + sq(i) + "." : r.result === "hit" ? "Hit at " + sq(i) + "!" : "You sank their " + r.ship.name + "!";
    if (allSunk(theirs)) {
      finish(true);
      statusEl.innerHTML = '<span class="ok">You win — fleet sunk in ' + shots + " shots.</span>";
      render();
      return;
    }
    turnHuman = false;
    statusEl.textContent = msg + " AI firing…";
    render();
    timer = setTimeout(() => {
      timer = null;
      const j = aiShot(diff, aiShots, remainingLens(mine), Math.random);
      lastMine = popMine = j;
      const a = fire(mine, aiShots, j);
      msg = a.result === "miss" ? "AI missed at " + sq(j) + "." : a.result === "hit" ? "AI hit your " + a.ship.name + " at " + sq(j) + "." : "AI sank your " + a.ship.name + "!";
      if (allSunk(mine)) {
        finish(false);
        lost = true;
        statusEl.innerHTML = '<span class="bad">AI wins — your fleet is sunk.</span>';
      } else {
        turnHuman = true;
        statusEl.textContent = msg + " Your shot.";
      }
      render();
    }, 450);
  }

  function build() {
    targetEl.innerHTML = "";
    fleetEl.innerHTML = "";
    for (let i = 0; i < N * N; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bs-cell";
      b.dataset.i = i;
      targetEl.appendChild(b);
      targetCells.push(b);
      const d = document.createElement("div");
      d.className = "bs-own";
      fleetEl.appendChild(d);
      fleetCells.push(d);
    }
  }

  const KNOW_CLASS = ["", " miss", " hit", " sunk"];
  const KNOW_LABEL = ["unknown", "miss", "hit", "sunk"];

  function render() {
    for (let i = 0; i < N * N; i++) {
      const t = targetCells[i], k = myShots[i];
      // After a loss, show where the surviving enemy ships were.
      const ghost = lost && !k && theirs.at[i] >= 0;
      t.className = "bs-cell" + KNOW_CLASS[k] + (ghost ? " ghost" : "") + (i === lastTheirs ? " last" : "") + (i === pop ? " fresh" : "");
      t.setAttribute("aria-label", sq(i) + ": " + (ghost ? "unhit ship" : KNOW_LABEL[k]));
      t.setAttribute("aria-disabled", k || over || !turnHuman ? "true" : "false");
      const f = fleetCells[i], a = aiShots[i];
      f.className = "bs-own" + (mine.at[i] >= 0 ? " ship" : "") + KNOW_CLASS[a] + (i === lastMine ? " last" : "") + (i === popMine ? " fresh" : "");
    }
    pop = popMine = -1;
    const list = (el, fleet) => {
      el.innerHTML = "";
      for (const s of fleet.ships) {
        const li = document.createElement("li");
        li.textContent = s.name + " " + s.len;
        if (s.hits === s.len) { li.className = "down"; li.textContent += " (sunk)"; }
        el.appendChild(li);
      }
    };
    list(enemyList, theirs);
    list(myList, mine);
    const afloat = mine.ships.filter((s) => s.hits < s.len).length, fired = aiShots.reduce((n, v) => n + (v ? 1 : 0), 0);
    fleetEl.setAttribute("aria-label", "Your fleet: " + afloat + " of 5 ships afloat; the AI has fired " + fired + " shots.");
    shotsEl.textContent = shots;
    const rec = store.getJSON("rec:" + diff, { w: 0, l: 0 });
    recordEl.textContent = "W–L " + rec.w + "–" + rec.l;
    const best = store.getInt("best:" + diff, null);
    bestEl.textContent = best === null ? "—" : best;
    shuffleBtn.disabled = shots > 0 || over;
  }

  targetEl.addEventListener("click", (e) => {
    const el = e.target.closest(".bs-cell");
    if (el) humanFire(+el.dataset.i);
  });

  shuffleBtn.addEventListener("click", () => {
    if (shots || over) return;
    mine = placeFleet(Math.random);
    render();
  });

  newBtn.addEventListener("click", newGame);

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newGame(); },
  });
  diff = chips.get();

  build();
  newGame();
  window.addEventListener("load", () => Manpage.autoOpen("battleships"));

  Gamekit.gridKeys(targetEl, { selector: ".bs-cell" });
})();
