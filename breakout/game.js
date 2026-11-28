(function () {
  "use strict";

  const DIFFS = {
    easy:   { rows: 4, speed: 250, paddle: 84, lives: 5 },
    medium: { rows: 5, speed: 320, paddle: 68, lives: 3 },
    hard:   { rows: 6, speed: 390, paddle: 54, lives: 3 },
  };
  const W = 360, H = 480, COLS = 8, BRICK_H = 16, TOP = 56, GAP = 3, R = 5;
  const PADDLE_Y = H - 34, PADDLE_H = 10, MAX_ANGLE = Math.PI / 3, LEVEL_SPEEDUP = 1.08;

  // ---------- rules (no DOM) ----------
  // Logical arena W×H; the canvas scales it. Bricks in higher rows are worth more.

  function buildBricks(rows) {
    const bricks = [], w = (W - GAP * (COLS + 1)) / COLS;
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
      bricks.push({ x: GAP + c * (w + GAP), y: TOP + r * (BRICK_H + GAP), w, h: BRICK_H, row: r, alive: true, points: 10 * (rows - r) });
    }
    return bricks;
  }

  function createGame(cfg) {
    const g = { cfg, level: 1, score: 0, lives: cfg.lives, speed: cfg.speed, over: false,
      paddle: { x: W / 2, w: cfg.paddle }, ball: { x: W / 2, y: PADDLE_Y - R, vx: 0, vy: 0, stuck: true } };
    g.bricks = buildBricks(cfg.rows);
    return g;
  }

  function launch(g) {
    if (!g.ball.stuck || g.over) return;
    const a = (Math.random() - 0.5) * MAX_ANGLE;
    g.ball.vx = g.speed * Math.sin(a);
    g.ball.vy = -g.speed * Math.cos(a);
    g.ball.stuck = false;
  }

  function resetBall(g) {
    // In place: update() holds a reference to the ball while it steps.
    Object.assign(g.ball, { x: g.paddle.x, y: PADDLE_Y - R, vx: 0, vy: 0, stuck: true });
  }

  // Moves the paddle to `paddleX` and the ball by dt seconds, in steps no longer than the
  // ball's radius so it can't tunnel. Returns the events that happened.
  function update(g, dt, paddleX) {
    const events = [];
    if (g.over) return events;
    const p = g.paddle, b = g.ball;
    p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, paddleX));
    if (b.stuck) { b.x = p.x; b.y = PADDLE_Y - R; return events; }
    const steps = Math.max(1, Math.ceil(g.speed * dt / R));
    const h = dt / steps;
    for (let s = 0; s < steps && !b.stuck; s++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
      if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
      // Paddle: the bounce angle depends on where the ball hits, up to ±60° from vertical.
      if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y - R <= PADDLE_Y + PADDLE_H && Math.abs(b.x - p.x) <= p.w / 2 + R) {
        const off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
        b.vx = g.speed * Math.sin(off * MAX_ANGLE);
        b.vy = -g.speed * Math.cos(off * MAX_ANGLE);
        b.y = PADDLE_Y - R;
        events.push("paddle");
      }
      for (const k of g.bricks) {
        if (!k.alive) continue;
        const nx = Math.max(k.x, Math.min(b.x, k.x + k.w)), ny = Math.max(k.y, Math.min(b.y, k.y + k.h));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy > R * R) continue;
        k.alive = false;
        g.score += k.points;
        events.push("brick");
        // Bounce off the side the ball came through: whichever overlap is shallower.
        const overX = Math.min(b.x + R - k.x, k.x + k.w - (b.x - R));
        const overY = Math.min(b.y + R - k.y, k.y + k.h - (b.y - R));
        if (overX < overY) b.vx = b.x < k.x + k.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
        else b.vy = b.y < k.y + k.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
        break;
      }
      if (g.bricks.every((k) => !k.alive)) {
        g.level++;
        g.speed *= LEVEL_SPEEDUP;
        g.bricks = buildBricks(g.cfg.rows);
        resetBall(g);
        events.push("level");
      } else if (b.y - R > H) {
        g.lives--;
        events.push("lost");
        if (g.lives <= 0) { g.over = true; events.push("over"); } else resetBall(g);
      }
    }
    return events;
  }

  // ---------- game ----------

  const canvas   = document.getElementById("board");
  const ctx      = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const livesEl  = document.getElementById("lives");
  const levelEl  = document.getElementById("level");
  const bestEl   = document.getElementById("best");
  const playBtn  = document.getElementById("play-btn");
  const chipsEl  = document.getElementById("chips");
  const leftBtn  = document.getElementById("left-btn");
  const rightBtn = document.getElementById("right-btn");
  const store = Gamekit.storage("breakout:");
  const KEY_SPEED = 420;
  const ROW_COLORS = ["#ff6b6b", "#f5a35c", "#f5c542", "#6dd58c", "#5ec2c2", "#6c90b5"];

  let diff = "medium", g = null, running = false, last = 0, raf = 0, target = W / 2, held = 0;

  function keepBest() {
    if (g && g.score > store.getInt("best:" + diff, 0)) store.set("best:" + diff, g.score);
  }

  function reset() {
    cancelAnimationFrame(raf);
    running = false;
    g = createGame(DIFFS[diff]);
    target = W / 2;
    statusEl.textContent = "Move the paddle, then tap or press Space to launch.";
    playBtn.textContent = "▶ play";
    hud();
    draw();
  }

  function hud() {
    scoreEl.textContent = g.score;
    livesEl.textContent = g.lives;
    levelEl.textContent = g.level;
    bestEl.textContent = Math.max(g.score, store.getInt("best:" + diff, 0));
    const left = g.bricks.filter((k) => k.alive).length;
    canvas.setAttribute("aria-label", "Breakout, level " + g.level + ", " + left + " bricks left, " + g.lives + (g.lives === 1 ? " life" : " lives") + ", score " + g.score);
  }

  function run() {
    if (running || g.over) return;
    running = true;
    playBtn.textContent = "❚❚ pause";
    statusEl.textContent = g.ball.stuck ? "Tap or press Space to launch." : "Keep the ball in play.";
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function pause(note) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    playBtn.textContent = "▶ resume";
    statusEl.textContent = note || "Paused.";
  }

  function fire() {
    if (g.over) { reset(); return; }
    run();
    if (g.ball.stuck) { launch(g); statusEl.textContent = "Keep the ball in play."; }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (held) target += held * KEY_SPEED * dt;
    target = Math.max(0, Math.min(W, target));
    for (const ev of update(g, dt, target)) {
      if (ev === "level") statusEl.textContent = "Level " + g.level + "! Tap or press Space to launch.";
      else if (ev === "lost" && !g.over) statusEl.textContent = "Missed — " + g.lives + (g.lives === 1 ? " life" : " lives") + " left. Launch again.";
      else if (ev === "over") end();
    }
    hud();
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  function end() {
    running = false;
    const record = g.score > store.getInt("best:" + diff, 0);
    keepBest();
    playBtn.textContent = "▶ again";
    statusEl.innerHTML = '<span class="bad">Game over — score ' + g.score + (record ? ", a new best!" : ".") + "</span>";
  }

  // ---------- drawing ----------

  function draw() {
    const cssW = canvas.clientWidth, dpr = window.devicePixelRatio || 1;
    const pw = Math.round(cssW * dpr), ph = Math.round(cssW * H / W * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const k = pw / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#1c1916";
    ctx.fillRect(0, 0, W, H);
    for (const b of g.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = ROW_COLORS[b.row % ROW_COLORS.length];
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.fillStyle = "#ede8e1";
    ctx.fillRect(g.paddle.x - g.paddle.w / 2, PADDLE_Y, g.paddle.w, PADDLE_H);
    ctx.fillStyle = g.over ? "#6a6460" : "#f5b800";
    ctx.beginPath();
    ctx.arc(g.ball.x, g.ball.y, R, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- input ----------

  function pointerTo(e) {
    const r = canvas.getBoundingClientRect();
    target = (e.clientX - r.left) / r.width * W;
    if (!running && !g.over) { update(g, 0, target); draw(); }
  }
  canvas.addEventListener("pointermove", pointerTo);
  canvas.addEventListener("pointerdown", (e) => { pointerTo(e); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", () => fire());

  const hold = (dir) => () => { held = dir; if (!running && !g.over) run(); };
  const release = () => { held = 0; };
  for (const [btn, dir] of [[leftBtn, -1], [rightBtn, 1]]) {
    btn.addEventListener("pointerdown", hold(dir));
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); held = -1; if (!running && !g.over) run(); }
    else if (k === "ArrowRight" || k === "d" || k === "D") { e.preventDefault(); held = 1; if (!running && !g.over) run(); }
    else if (k === " ") { if (e.target.closest && e.target.closest("button")) return; e.preventDefault(); fire(); }
    else if (k === "p" || k === "P") { e.preventDefault(); if (running) pause(); else run(); }
  });
  document.addEventListener("keyup", (e) => {
    if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) held = 0;
  });

  playBtn.addEventListener("click", () => {
    if (g.over) { reset(); return; }
    if (running) pause(); else fire();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("resize", () => draw());

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { keepBest(); diff = d; reset(); },
  });
  diff = chips.get();

  reset();
  window.addEventListener("load", () => { draw(); Manpage.autoOpen("breakout"); });
})();
