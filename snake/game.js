(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 15, wrap: true,  tick: 170, speedup: 0 },
    medium: { n: 17, wrap: false, tick: 125, speedup: 1 },
    hard:   { n: 19, wrap: false, tick: 105, speedup: 2 },
  };
  const MIN_TICK = 60;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left as [dx, dy]

  // ---------- rules (no DOM) ----------
  // Cells are y * n + x. body[0] is the head.

  function createGame(n, wrap, rng) {
    const mid = Math.floor(n / 2), y = mid;
    const body = [y * n + mid, y * n + mid - 1, y * n + mid - 2];
    const g = { n, wrap, body, dir: 1, food: -1, alive: true, won: false, score: 0 };
    placeFood(g, rng);
    return g;
  }

  function placeFood(g, rng) {
    const taken = new Set(g.body), free = [];
    for (let i = 0; i < g.n * g.n; i++) if (!taken.has(i)) free.push(i);
    g.food = free.length ? free[Math.floor(rng() * free.length)] : -1;
    if (!free.length) g.won = true;
  }

  // Advance one tick heading `dir` (a reversal onto the neck is ignored).
  // Returns "move", "eat", "dead", or "won".
  function step(g, dir, rng) {
    if (!g.alive || g.won) return "dead";
    if (dir !== undefined && (dir + 2) % 4 !== g.dir) g.dir = dir;
    const n = g.n, head = g.body[0];
    let x = head % n + DIRS[g.dir][0], y = Math.floor(head / n) + DIRS[g.dir][1];
    if (x < 0 || y < 0 || x >= n || y >= n) {
      if (!g.wrap) { g.alive = false; return "dead"; }
      x = (x + n) % n;
      y = (y + n) % n;
    }
    const next = y * n + x, eats = next === g.food;
    // The tail moves out of the way this tick unless the snake is growing.
    const hits = g.body.indexOf(next);
    if (hits >= 0 && (eats || hits !== g.body.length - 1)) { g.alive = false; return "dead"; }
    g.body.unshift(next);
    if (!eats) { g.body.pop(); return "move"; }
    g.score++;
    placeFood(g, rng);
    return g.won ? "won" : "eat";
  }

  // ---------- game ----------

  const canvas   = document.getElementById("board");
  const ctx      = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const bestEl   = document.getElementById("best");
  const playBtn  = document.getElementById("play-btn");
  const chipsEl  = document.getElementById("chips");
  const padEl    = document.getElementById("pad");
  const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
  const store = Gamekit.storage("snake:");

  let diff = "medium", g = null, queue = [], running = false, tick = 0, acc = 0, last = 0, raf = 0;

  // A game abandoned midway (new speed, restart) still counts towards the best score.
  function keepBest(key) {
    if (g && g.score > store.getInt(key, 0)) store.set(key, g.score);
  }

  function reset() {
    const cfg = DIFFS[diff];
    g = createGame(cfg.n, cfg.wrap, Math.random);
    queue = [];
    tick = cfg.tick;
    running = false;
    cancelAnimationFrame(raf);
    statusEl.textContent = "Press an arrow key, swipe, or ▶ to start.";
    playBtn.textContent = "▶ play";
    draw();
    showScore();
  }

  function showScore() {
    scoreEl.textContent = g.score;
    const best = store.getInt("best:" + diff, 0);
    bestEl.textContent = best;
    canvas.setAttribute("aria-label", "Snake, length " + g.body.length + ", score " + g.score + (g.alive ? "" : ", game over"));
  }

  function start() {
    if (!g.alive || g.won) reset();
    if (running) return;
    running = true;
    statusEl.textContent = "Eat the food. Don't bite yourself" + (DIFFS[diff].wrap ? "." : " or hit the walls.");
    playBtn.textContent = "❚❚ pause";
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
  }

  function pause(note) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    playBtn.textContent = "▶ resume";
    statusEl.textContent = note || "Paused.";
  }

  function frame(now) {
    if (!running) return;
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= tick && running) {
      acc -= tick;
      const ev = step(g, queue.shift(), Math.random);
      if (ev === "eat") tick = Math.max(MIN_TICK, tick - DIFFS[diff].speedup);
      if (ev === "dead" || ev === "won") end(ev);
      showScore();
    }
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  function end(ev) {
    running = false;
    const best = store.getInt("best:" + diff, 0), record = g.score > best;
    if (record) store.set("best:" + diff, g.score);
    playBtn.textContent = "▶ again";
    statusEl.innerHTML = ev === "won"
      ? '<span class="ok">You filled the board! Score ' + g.score + ".</span>"
      : '<span class="bad">Game over — score ' + g.score + (record ? ", a new best!" : ".") + "</span>";
  }

  function turn(dir) {
    if (!g.alive || g.won) { reset(); }
    // Queue up to two turns so quick double-turns aren't lost between ticks.
    const lastDir = queue.length ? queue[queue.length - 1] : g.dir;
    if (queue.length < 2 && dir !== lastDir && (dir + 2) % 4 !== lastDir) queue.push(dir);
    if (!running) start();
  }

  // ---------- drawing ----------

  function draw() {
    const size = canvas.clientWidth, dpr = window.devicePixelRatio || 1, px = Math.round(size * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    const n = g.n, c = px / n;
    ctx.fillStyle = "#1c1916";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = "#24201c";
    for (let i = 0; i < n * n; i++) if ((i % n + Math.floor(i / n)) % 2) ctx.fillRect((i % n) * c, Math.floor(i / n) * c, c, c);
    if (g.food >= 0) {
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc((g.food % n + 0.5) * c, (Math.floor(g.food / n) + 0.5) * c, c * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    g.body.forEach((cell, k) => {
      ctx.fillStyle = k === 0 ? (g.alive ? "#f5b800" : "#8a6a00") : k % 2 ? "#6dd58c" : "#5ec27c";
      const pad = c * 0.08;
      ctx.fillRect((cell % n) * c + pad, Math.floor(cell / n) * c + pad, c - 2 * pad, c - 2 * pad);
    });
  }

  // ---------- input ----------

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("button, input, select, textarea") && !(e.key in KEYS)) return;
    if (e.key in KEYS) { e.preventDefault(); turn(KEYS[e.key]); }
    else if (e.key === " " || e.key === "p" || e.key === "P") { e.preventDefault(); if (running) pause(); else start(); }
  });

  let sx = 0, sy = 0;
  canvas.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; });
  canvas.addEventListener("pointerup", (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { if (running) pause(); else start(); return; }
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });

  padEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dir]");
    if (b) turn(+b.dataset.dir);
  });

  playBtn.addEventListener("click", () => { if (running) pause(); else start(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("resize", () => draw());

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { keepBest("best:" + diff); diff = d; reset(); },
  });
  diff = chips.get();

  reset();
  window.addEventListener("load", () => { draw(); Manpage.autoOpen("snake"); });
})();
