(function () {
  "use strict";

  // maxK / maxWalls: most numbers / walls a board may show; more clues make it easier.
  const DIFFS = {
    easy:   { N: 5, K: 4, walls: 0, maxK: 8, maxWalls: 2 },
    medium: { N: 6, K: 6, walls: 1, maxK: 10, maxWalls: 4 },
    hard:   { N: 7, K: 8, walls: 2, maxK: 12, maxWalls: 6 },
  };

  const boardEl = document.getElementById("board");
  const svgEl = document.getElementById("svg");
  const statusEl = document.getElementById("status");
  const timeEl = document.getElementById("time");
  const bestEl = document.getElementById("best");
  const undoBtn = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn = document.getElementById("new-btn");
  const chipsEl = document.getElementById("chips");

  const store = Gamekit.storage("zip:");
  let diff = store.get("diff", "medium");
  if (!DIFFS[diff]) diff = "medium";

  let N, K;
  let waypoints = [];    // length K, each is cell index; waypoints[0]=start, sorted by number 1..K
  let walls = new Set(); // set of "a-b" with a<b representing blocked edge

  let path = [];         // user's current path (array of cell indices)
  let onPath = new Set();
  let won = false;
  let timerStart = 0;
  let timerInterval = null;
  let cellEls = [];
  let dragging = false;

  function idx(r, c) { return r * N + c; }
  function rcOf(i) { return [Math.floor(i / N), i % N]; }
  function neighbors(i) {
    const [r, c] = rcOf(i);
    const out = [];
    if (r > 0) out.push(idx(r - 1, c));
    if (r < N - 1) out.push(idx(r + 1, c));
    if (c > 0) out.push(idx(r, c - 1));
    if (c < N - 1) out.push(idx(r, c + 1));
    return out;
  }
  function edgeKey(a, b) { return a < b ? (a + "-" + b) : (b + "-" + a); }
  function blocked(a, b) { return walls.has(edgeKey(a, b)); }

  // Random Hamiltonian path via DFS + Warnsdorff heuristic
  function hamiltonian(rng) {
    const total = N * N;
    const visited = new Uint8Array(total);
    const path = [];
    let start = Math.floor(rng() * total);
    // On odd-sized boards a Hamiltonian path must start on the majority colour; any other
    // start forces an exhaustive (effectively endless on 7×7) search before failing.
    if (total % 2 === 1) {
      const [r, c] = rcOf(start);
      if ((r + c) % 2 === 1) start += 1;
    }
    let budget = 200000;
    function step(i) {
      if (--budget < 0) return false;
      path.push(i);
      visited[i] = 1;
      if (path.length === total) return true;
      let nb = neighbors(i).filter(n => !visited[n]);
      nb = Gamekit.shuffle(nb, rng);
      // Warnsdorff: prefer neighbors with fewer unvisited neighbors
      nb.sort((a, b) => {
        const da = neighbors(a).filter(n => !visited[n]).length;
        const db = neighbors(b).filter(n => !visited[n]).length;
        return da - db;
      });
      for (const n of nb) {
        if (step(n)) return true;
      }
      path.pop();
      visited[i] = 0;
      return false;
    }
    if (step(start)) return path;
    return null;
  }

  // Searches for up to `limit` solutions (start on 1, visit the numbers in order, fill every
  // cell, finish on the last number, never cross a wall) within a node budget. Returns
  // { sols, complete } where complete means the search finished, so sols is the full list
  // (up to limit). `avoid` (the intended path) is tried last, so alternatives surface fast.
  // Prunes when some unvisited cell can no longer be entered and left, or the unvisited
  // cells have split into separate pieces.
  function findSolutions(limit, budget, avoid) {
    const total = N * N;
    const visited = new Uint8Array(total);
    const order = new Int16Array(total).fill(-1);
    waypoints.forEach((w, k) => { order[w] = k; });
    const end = waypoints[K - 1];
    const path = [waypoints[0]];
    const sols = [];
    let nextWp = 1;

    // Returns false if the position is dead, -1 if any move may work, or the one cell the
    // path is forced to enter next.
    function viable(head) {
      let first = -1, free = 0, same = 0, forced = -1, endViaHeadOnly = false;
      const hc = (Math.floor(head / N) + head % N) & 1;
      for (let c = 0; c < total; c++) {
        if (visited[c]) continue;
        free++;
        if (first < 0) first = c;
        if (((Math.floor(c / N) + c % N) & 1) === hc) same++;
        let d = 0, touchesHead = false;
        for (const m of neighbors(c)) {
          if (blocked(c, m)) continue;
          if (m === head) { d++; touchesHead = true; } else if (!visited[m]) d++;
        }
        if (d < (c === end ? 1 : 2)) return false;
        if (c === end && d === 1 && touchesHead) endViaHeadOnly = true;
        // A cell with only two ways in/out, one being the head, must be entered right now.
        if (touchesHead && c !== end && d === 2) {
          if (forced >= 0) return false;
          forced = c;
        }
      }
      if (!free) return -1;
      // The last number can't be reached only through the head while other cells remain.
      if (endViaHeadOnly && free > 1) return false;
      // The rest of the path alternates colours starting with the colour opposite the head.
      if (same !== Math.floor(free / 2)) return false;
      const seen = new Uint8Array(total), stack = [first];
      seen[first] = 1;
      let reached = 1;
      while (stack.length) {
        const c = stack.pop();
        for (const m of neighbors(c)) {
          if (visited[m] || seen[m] || blocked(c, m)) continue;
          seen[m] = 1; reached++; stack.push(m);
        }
      }
      if (reached !== free) return false;
      return forced;
    }

    function step(cur, len) {
      if (sols.length >= limit || budget < 0) return;
      if (len === total) { sols.push(path.slice()); return; }
      const v = viable(cur);
      if (v === false) return;
      let moves = v >= 0 ? [v] : neighbors(cur);
      if (avoid && v < 0) moves = moves.slice().sort((a, b) => (a === avoid[len]) - (b === avoid[len]));
      for (const n of moves) {
        if (visited[n] || blocked(cur, n)) continue;
        const o = order[n];
        if (o >= 0 && o !== nextWp) continue;
        if (n === end && len + 1 !== total) continue;
        budget--;
        visited[n] = 1; path.push(n);
        if (o >= 0) nextWp++;
        step(n, len + 1);
        if (o >= 0) nextWp--;
        visited[n] = 0; path.pop();
        if (sols.length >= limit || budget < 0) return;
      }
    }

    visited[waypoints[0]] = 1;
    step(waypoints[0], 1);
    return { sols, complete: budget >= 0 || sols.length >= limit };
  }

  // Builds a board around a random full path, then makes it unique: while another solution
  // exists, wall off the edge where it first leaves the intended path (which rules it out for
  // good); once the tier's wall budget is spent, number that cell instead. Boards that need
  // more clues than the tier allows are discarded.
  function generate(seed) {
    const rng = Gamekit.mulberry32(seed);
    const cfg = DIFFS[diff];
    N = cfg.N;
    const total = N * N;
    let fallback = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const hp = hamiltonian(rng);
      if (!hp) continue;
      const positions = new Set([0, total - 1]);
      const interior = Gamekit.shuffle(Array.from({ length: total - 2 }, (_, i) => i + 1), rng);
      for (let i = 0; i < cfg.K - 2; i++) positions.add(interior[i]);

      // Starting walls go only on edges the intended path doesn't use.
      const pathEdges = new Set();
      for (let i = 0; i < hp.length - 1; i++) pathEdges.add(edgeKey(hp[i], hp[i + 1]));
      const nonPath = [];
      for (let i = 0; i < total; i++) {
        for (const nn of neighbors(i)) if (nn > i && !pathEdges.has(edgeKey(i, nn))) nonPath.push([i, nn]);
      }
      walls = new Set(Gamekit.shuffle(nonPath, rng).slice(0, cfg.walls).map(e => edgeKey(e[0], e[1])));

      let unique = false;
      for (let guard = 0; guard < 60 && positions.size <= cfg.maxK && walls.size <= cfg.maxWalls; guard++) {
        const sorted = [...positions].sort((a, b) => a - b);
        waypoints = sorted.map(p => hp[p]);
        K = waypoints.length;
        const res = findSolutions(40, 60000, hp);
        const alts = res.sols.filter(s => s.some((c, i) => c !== hp[i]));
        if (!alts.length) {
          if (res.complete) { unique = true; break; }
          positions.add(interior.find(p => !positions.has(p)));
          continue;
        }
        // Greedy cover: pick the single wall or number that rules out the most alternatives.
        let best = null, bestKill = 0;
        if (positions.size < cfg.maxK) {
          const at = alts.map(s => { const a = new Int16Array(total); s.forEach((c, i) => { a[c] = i; }); return a; });
          for (let p = 1; p < total - 1; p++) {
            if (positions.has(p)) continue;
            let j = 0;
            while (sorted[j + 1] < p) j++;
            const lo = hp[sorted[j]], hi = hp[sorted[j + 1]], c = hp[p];
            let kill = 0;
            for (const a of at) if (!(a[lo] < a[c] && a[c] < a[hi])) kill++;
            if (kill > bestKill) { bestKill = kill; best = { number: p }; }
          }
        }
        if (walls.size < cfg.maxWalls) {
          const uses = new Map();
          for (const s of alts) {
            const seen = new Set();
            for (let i = 0; i < s.length - 1; i++) {
              const e = edgeKey(s[i], s[i + 1]);
              if (!pathEdges.has(e) && !seen.has(e)) { seen.add(e); uses.set(e, (uses.get(e) || 0) + 1); }
            }
          }
          for (const [e, kill] of uses) if (kill > bestKill) { bestKill = kill; best = { wall: e }; }
        }
        if (!best) break;
        if (best.wall) walls.add(best.wall); else positions.add(best.number);
      }
      if (unique && positions.size <= cfg.maxK) return;
      if (!fallback) fallback = { waypoints: [...positions].sort((a, b) => a - b).map(p => hp[p]), walls: new Set(walls) };
    }
    // Practically unreachable: keep a valid (solvable) board even if not provably unique.
    waypoints = fallback.waypoints;
    walls = fallback.walls;
    K = waypoints.length;
  }

  function newPuzzle(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("zip", diff);
    generate(seed);
    path = [];
    onPath = new Set();
    won = false;
    timerStart = Date.now();
    startTimer();
    renderShell();
    renderPath();
    updateStatus();
    statusEl.textContent = "Connect 1 → 2 → 3 → … filling every cell.";
  }

  function renderShell() {
    boardEl.style.gridTemplateColumns = "repeat(" + N + ", 1fr)";
    boardEl.style.gridTemplateRows = "repeat(" + N + ", 1fr)";
    // Remove all children except the svg
    Array.from(boardEl.children).forEach(c => { if (c !== svgEl) c.remove(); });
    Array.from(boardEl.querySelectorAll(".zp-wall-h, .zp-wall-v")).forEach(w => w.remove());
    cellEls = [];
    const total = N * N;
    const wpIdx = {};
    waypoints.forEach((w, k) => { wpIdx[w] = k + 1; });
    for (let i = 0; i < total; i++) {
      const el = document.createElement("div");
      el.className = "zp-cell fade-in";
      el.style.animationDelay = (i * 5) + "ms";
      el.dataset.i = String(i);
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", "Row " + (Math.floor(i / N) + 1) + " column " + (i % N + 1) + (wpIdx[i] !== undefined ? ", number " + wpIdx[i] : ""));
      if (wpIdx[i] !== undefined) {
        const k = wpIdx[i];
        if (k === 1) el.classList.add("start");
        if (k === K) el.classList.add("end");
        const wp = document.createElement("span");
        wp.className = "wp";
        wp.textContent = String(k);
        el.appendChild(wp);
      }
      boardEl.appendChild(el);
      cellEls.push(el);
    }
    // Walls
    requestAnimationFrame(renderWalls);
  }
  boardEl.addEventListener("pointerdown", onPointerDown);
  boardEl.addEventListener("pointermove", onPointerMove);
  boardEl.addEventListener("pointerup", onPointerUp);
  boardEl.addEventListener("pointercancel", onPointerUp);

  function renderWalls() {
    Array.from(boardEl.querySelectorAll(".zp-wall-h, .zp-wall-v")).forEach(w => w.remove());
    const brect = boardEl.getBoundingClientRect();
    for (const w of walls) {
      const [a, b] = w.split("-").map(Number);
      const ra = Math.floor(a / N), ca = a % N;
      const rb = Math.floor(b / N), cb = b % N;
      const ae = cellEls[a].getBoundingClientRect();
      const be = cellEls[b].getBoundingClientRect();
      const div = document.createElement("div");
      if (ra === rb) {
        div.className = "zp-wall-v";
        const x = (ra < rb || ca < cb) ? (ae.right - brect.left - 2) : (be.right - brect.left - 2);
        div.style.left = x + "px";
        div.style.top = (ae.top - brect.top) + "px";
        div.style.width = "4px";
        div.style.height = ae.height + "px";
      } else {
        div.className = "zp-wall-h";
        const y = (ra < rb) ? (ae.bottom - brect.top - 2) : (be.bottom - brect.top - 2);
        div.style.top = y + "px";
        div.style.left = (ae.left - brect.left) + "px";
        div.style.width = ae.width + "px";
        div.style.height = "4px";
      }
      boardEl.appendChild(div);
    }
  }

  function renderPath() {
    for (let i = 0; i < cellEls.length; i++) cellEls[i].classList.toggle("on", onPath.has(i));
    // Redraw SVG polyline
    const brect = boardEl.getBoundingClientRect();
    svgEl.setAttribute("viewBox", "0 0 " + brect.width + " " + brect.height);
    svgEl.innerHTML = "";
    if (path.length >= 2) {
      const ns = "http://www.w3.org/2000/svg";
      const pts = path.map(i => {
        const r = cellEls[i].getBoundingClientRect();
        return (r.left - brect.left + r.width / 2) + "," + (r.top - brect.top + r.height / 2);
      }).join(" ");
      const line = document.createElementNS(ns, "polyline");
      line.setAttribute("points", pts);
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", "var(--accent)");
      line.setAttribute("stroke-width", "6");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      line.setAttribute("opacity", "0.85");
      svgEl.appendChild(line);
    }
  }

  function cellFromEvent(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return -1;
    const cell = el.closest(".zp-cell");
    if (!cell || !boardEl.contains(cell)) return -1;
    return Number(cell.dataset.i);
  }

  function flashInvalid(cellIdx) {
    const el = boardEl.children[cellIdx];
    if (!el) return;
    el.classList.remove('invalid');
    void el.offsetWidth;
    el.classList.add('invalid');
    el.addEventListener('animationend', () => el.classList.remove('invalid'), { once: true });
  }

  function tryExtend(target) {
    if (target < 0 || won) return;
    // If path empty, must start at cell 1
    if (path.length === 0) {
      if (target === waypoints[0]) { path.push(target); onPath.add(target); renderPath(); }
      else flashInvalid(target);
      return;
    }
    // If user taps current end, nothing
    const last = path[path.length - 1];
    if (target === last) return;
    // If tapping a cell already on path (not last), truncate to there
    if (onPath.has(target)) {
      const ix = path.indexOf(target);
      const removed = path.splice(ix + 1);
      removed.forEach(r => onPath.delete(r));
      renderPath();
      return;
    }
    // Must be adjacent to last
    if (!neighbors(last).includes(target)) { flashInvalid(target); return; }
    if (blocked(last, target)) { flashInvalid(target); return; }
    // Waypoint order check: may not place a non-next waypoint
    const nextExpectedWp = path.filter(p => waypoints.includes(p)).length;
    const wpIndex = waypoints.indexOf(target);
    if (wpIndex !== -1 && wpIndex !== nextExpectedWp) { flashInvalid(target); return; }
    path.push(target);
    onPath.add(target);
    renderPath();
    checkWin();
  }

  function onPointerDown(e) {
    if (won) return;
    const t = cellFromEvent(e);
    if (t < 0) return;
    dragging = true;
    try { boardEl.setPointerCapture(e.pointerId); } catch (_) { /* pointer already released */ }
    tryExtend(t);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const t = cellFromEvent(e);
    if (t < 0) return;
    tryExtend(t);
  }
  function onPointerUp(e) {
    dragging = false;
    try { boardEl.releasePointerCapture(e.pointerId); } catch (_) { /* capture already gone */ }
  }

  function checkWin() {
    if (path.length !== N * N) return;
    // Must end at last waypoint; must have visited waypoints in order (already enforced).
    if (path[path.length - 1] !== waypoints[K - 1]) return;
    won = true;
    const s = Math.floor((Date.now() - timerStart) / 1000);
    const best = store.getInt("best:" + diff, null);
    if (best === null || s < best) {
      store.set("best:" + diff, s);
      bestEl.textContent = Gamekit.fmtTime(s);
    }
    statusEl.innerHTML = '<span class="ok">Zipped in ' + Gamekit.fmtTime(s) + '.</span>';
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeEl.textContent = Gamekit.fmtTime(0);
    timerInterval = setInterval(() => {
      if (won) return;
      const s = Math.floor((Date.now() - timerStart) / 1000);
      timeEl.textContent = Gamekit.fmtTime(s);
    }, 500);
  }

  function updateStatus() {
    const best = store.getInt("best:" + diff, null);
    bestEl.textContent = best === null ? "—" : Gamekit.fmtTime(best);
  }

  undoBtn.addEventListener("click", () => {
    if (path.length === 0 || won) return;
    const r = path.pop();
    onPath.delete(r);
    renderPath();
    statusEl.textContent = "Connect 1 → 2 → 3 → … filling every cell.";
  });
  resetBtn.addEventListener("click", () => {
    path = []; onPath = new Set(); won = false;
    timerStart = Date.now(); startTimer();
    statusEl.textContent = "Connect 1 → 2 → 3 → … filling every cell.";
    renderPath();
  });
  newBtn.addEventListener("click", () => newPuzzle(Gamekit.randomSeed()));

  Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newPuzzle(); updateStatus(); },
  });
  diff = store.get("diff", diff);
  if (!DIFFS[diff]) diff = "medium";

  window.addEventListener("resize", () => { renderWalls(); renderPath(); });
  // Keyboard: Enter/Space on a cell extends (or truncates) the path to it.
  Gamekit.gridKeys(boardEl, { selector: ".zp-cell", onActivate: (el) => tryExtend(Number(el.dataset.i)) });

  newPuzzle();
  updateStatus();
  window.addEventListener("load", () => Manpage.autoOpen("zip"));
})();
