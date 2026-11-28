(function () {
  "use strict";

  const DIFFS = {
    easy:   { n: 7,  islands: 9,  extra: 0.15, grade: "basic" },
    medium: { n: 9,  islands: 15, extra: 0.2,  grade: "deduce" },
    hard:   { n: 11, islands: 22, extra: 0.3,  grade: "deep" },
  };

  // ---------- generator + solver (no DOM) ----------

  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  // Potential bridges: each island to the first island it sees to the right and below.
  function buildPuzzle(n, islands) {
    const at = new Map();
    islands.forEach((p, i) => at.set(p.r * n + p.c, i));
    const edges = [], adj = islands.map(() => []), cellEdges = new Map();
    islands.forEach((p, a) => {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const cells = [];
        let r = p.r + dr, c = p.c + dc;
        while (r < n && c < n && !at.has(r * n + c)) { cells.push(r * n + c); r += dr; c += dc; }
        if (r < n && c < n) {
          const e = edges.length;
          const b = at.get(r * n + c);
          edges.push({ a, b, horiz: dr === 0, cells });
          adj[a].push(e); adj[b].push(e);
          cells.forEach(k => { if (!cellEdges.has(k)) cellEdges.set(k, []); cellEdges.get(k).push(e); });
        }
      }
    });
    const crosses = edges.map(() => []);
    for (const list of cellEdges.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (edges[list[i]].horiz !== edges[list[j]].horiz) { crosses[list[i]].push(list[j]); crosses[list[j]].push(list[i]); }
      }
    }
    return { n, islands, edges, adj, crosses, cellEdges };
  }

  function connected(P, use) {
    const seen = new Uint8Array(P.islands.length), stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const e of P.adj[i]) {
        if (!use(e)) continue;
        const j = P.edges[e].a === i ? P.edges[e].b : P.edges[e].a;
        if (!seen[j]) { seen[j] = 1; count++; stack.push(j); }
      }
    }
    return count === P.islands.length;
  }

  // Tighten [lo, hi] bridge bounds to a fixpoint. Returns false on contradiction.
  function propagate(P, lo, hi) {
    const isl = P.islands;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < isl.length; i++) {
        let sLo = 0, sHi = 0;
        for (const e of P.adj[i]) { sLo += lo[e]; sHi += hi[e]; }
        const num = isl[i].num;
        if (sLo > num || sHi < num) return false;
        for (const e of P.adj[i]) {
          const nl = Math.max(lo[e], num - (sHi - hi[e]));
          const nh = Math.min(hi[e], num - (sLo - lo[e]));
          if (nl > nh) return false;
          if (nl !== lo[e] || nh !== hi[e]) { sLo += nl - lo[e]; sHi += nh - hi[e]; lo[e] = nl; hi[e] = nh; changed = true; }
        }
      }
      for (let e = 0; e < P.edges.length; e++) {
        if (!lo[e]) continue;
        for (const f of P.crosses[e]) {
          if (lo[f]) return false;
          if (hi[f]) { hi[f] = 0; changed = true; }
        }
      }
      if (!changed) {
        if (!connected(P, e => hi[e] > 0)) return false;
        // A finished group of islands that isn't everything can never join the rest.
        const done = P.islands.map((_, i) => P.adj[i].every(e => lo[e] === hi[e]));
        const seen = new Uint8Array(isl.length);
        for (let s = 0; s < isl.length; s++) {
          if (seen[s]) continue;
          const stack = [s], comp = [];
          seen[s] = 1;
          while (stack.length) {
            const i = stack.pop();
            comp.push(i);
            for (const e of P.adj[i]) {
              if (!lo[e]) continue;
              const j = P.edges[e].a === i ? P.edges[e].b : P.edges[e].a;
              if (!seen[j]) { seen[j] = 1; stack.push(j); }
            }
          }
          if (comp.length < isl.length && comp.every(i => done[i])) return false;
        }
      }
    }
    return true;
  }

  function initBounds(P) {
    const lo = new Array(P.edges.length).fill(0);
    const hi = P.edges.map(e => Math.min(2, P.islands[e.a].num, P.islands[e.b].num));
    return { lo, hi };
  }

  // Pure deduction: propagation plus single-value probing. Returns true if fully determined.
  function logicSolve(P) {
    const { lo, hi } = initBounds(P);
    if (!propagate(P, lo, hi)) return false;
    let progress = true;
    while (progress) {
      progress = false;
      for (let e = 0; e < P.edges.length; e++) {
        if (lo[e] === hi[e]) continue;
        for (let v = lo[e]; v <= hi[e]; v++) {
          const l2 = lo.slice(), h2 = hi.slice();
          l2[e] = h2[e] = v;
          if (!propagate(P, l2, h2)) {
            if (v === lo[e]) lo[e]++; else if (v === hi[e]) hi[e]--; else continue;
            if (!propagate(P, lo, hi)) return false;
            progress = true;
            break;
          }
        }
      }
    }
    return lo.every((v, e) => v === hi[e]) && connected(P, e => lo[e] > 0);
  }

  // Counts solutions up to `limit`; reports `limit` if the node budget runs out.
  function countSolutions(P, limit, budget) {
    let count = 0;
    function search(lo, hi) {
      if (count >= limit) return;
      if (--budget < 0) { count = limit; return; }
      if (!propagate(P, lo, hi)) return;
      let pick = -1;
      for (let e = 0; e < P.edges.length; e++) if (lo[e] < hi[e]) { pick = e; break; }
      if (pick < 0) { if (connected(P, e => lo[e] > 0)) count++; return; }
      for (let v = lo[pick]; v <= hi[pick] && count < limit; v++) {
        const l2 = lo.slice(), h2 = hi.slice();
        l2[pick] = h2[pick] = v;
        search(l2, h2);
      }
    }
    const { lo, hi } = initBounds(P);
    search(lo, hi);
    return count;
  }

  // Grow a connected network of islands and bridges, then keep it only if the clues
  // have exactly one solution (and, for easier tiers, one reachable by pure deduction).
  function layout(n, target, extra, rng) {
    const island = new Int16Array(n * n).fill(-1), bridge = new Uint8Array(n * n);
    const isl = [], bridges = new Map();
    const free = (r, c) => r >= 0 && c >= 0 && r < n && c < n && island[r * n + c] < 0 && !bridge[r * n + c];
    const lonely = (r, c) => DIRS.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr < 0 || cc < 0 || rr >= n || cc >= n || island[rr * n + cc] < 0; });
    const addIsland = (r, c) => { island[r * n + c] = isl.length; isl.push({ r, c, num: 0 }); return isl.length - 1; };
    const addBridge = (a, b, cells, k) => {
      const key = Math.min(a, b) + "-" + Math.max(a, b);
      bridges.set(key, Math.min(2, (bridges.get(key) || 0) + k));
      cells.forEach(x => (bridge[x] = 1));
    };
    addIsland(Math.floor(rng() * n), Math.floor(rng() * n));
    for (let tries = 0; tries < 600 && isl.length < target; tries++) {
      const a = Math.floor(rng() * isl.length), [dr, dc] = DIRS[Math.floor(rng() * 4)];
      const d = 2 + Math.floor(rng() * (n - 2));
      const { r, c } = isl[a], cells = [];
      let ok = true;
      for (let s = 1; s < d && ok; s++) { if (free(r + dr * s, c + dc * s)) cells.push((r + dr * s) * n + c + dc * s); else ok = false; }
      const tr = r + dr * d, tc = c + dc * d;
      if (!ok || !free(tr, tc) || !lonely(tr, tc)) continue;
      const b = addIsland(tr, tc);
      addBridge(a, b, cells, rng() < 0.4 ? 2 : 1);
    }
    // A few extra bridges between islands that already see each other make loops.
    const P0 = buildPuzzle(n, isl);
    for (const e of Gamekit.shuffle(P0.edges.slice(), rng)) {
      if (rng() > extra) continue;
      if (e.cells.some(x => bridge[x]) && !bridges.has(Math.min(e.a, e.b) + "-" + Math.max(e.a, e.b))) continue;
      addBridge(e.a, e.b, e.cells, 1);
    }
    for (const [key, k] of bridges) { const [a, b] = key.split("-").map(Number); isl[a].num += k; isl[b].num += k; }
    return isl;
  }

  // basic: counting rules alone finish it. deduce: needs look-ahead deduction but no guessing.
  // deep: unique, and counting rules alone are not enough (may need deeper look-ahead).
  function fitsGrade(P, grade) {
    const { lo, hi } = initBounds(P);
    const basic = propagate(P, lo, hi) && lo.every((v, e) => v === hi[e]) && connected(P, e => lo[e] > 0);
    if (grade === "basic") return basic;
    if (grade === "deduce") return !basic && logicSolve(P);
    return !basic && countSolutions(P, 2, 20000) === 1;
  }

  function generate(diffName, seed) {
    const { n, islands, extra, grade } = DIFFS[diffName];
    const rng = Gamekit.mulberry32(seed);
    let fallback = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const isl = layout(n, islands, extra, rng);
      if (isl.length < islands - 2) continue;
      const P = buildPuzzle(n, isl);
      if (fitsGrade(P, grade)) return P;
      if (!fallback && countSolutions(P, 2, 20000) === 1) fallback = P;
    }
    return fallback || buildPuzzle(n, layout(n, islands, extra, rng));
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const statusEl = document.getElementById("status");
  const undoBtn  = document.getElementById("undo-btn");
  const STATUS = "Connect every island.";
  const SVGNS = "http://www.w3.org/2000/svg";

  let P = null, val = [], history = [], won = false, sel = -1, dragFrom = -1;
  let islandEls = [], svgEl = null;

  function edgeBetween(a, b) {
    for (const e of P.adj[a]) if (P.edges[e].a === b || P.edges[e].b === b) return e;
    return -1;
  }
  function sumAt(i) { let s = 0; for (const e of P.adj[i]) s += val[e]; return s; }

  function start(P0) {
    P = P0;
    clear();
    build();
  }

  function clear() {
    val = new Array(P.edges.length).fill(0);
    history = [];
    won = false;
    sel = -1;
  }

  function build() {
    const n = P.n;
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--n", n);
    svgEl = document.createElementNS(SVGNS, "svg");
    svgEl.setAttribute("class", "hs-svg");
    svgEl.setAttribute("viewBox", "0 0 " + n + " " + n);
    boardEl.appendChild(svgEl);
    islandEls = P.islands.map((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hs-island";
      b.style.gridRow = String(p.r + 1);
      b.style.gridColumn = String(p.c + 1);
      b.dataset.i = i;
      b.textContent = p.num;
      boardEl.appendChild(b);
      return b;
    });
    render();
  }

  function line(x1, y1, x2, y2, cls) {
    const l = document.createElementNS(SVGNS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("class", cls);
    svgEl.appendChild(l);
  }

  function render() {
    svgEl.innerHTML = "";
    const n = P.n, occupied = new Set(P.islands.map(p => p.r * n + p.c));
    for (let k = 0; k < n * n; k++) {
      if (occupied.has(k)) continue;
      const d = document.createElementNS(SVGNS, "circle");
      d.setAttribute("cx", (k % n) + 0.5); d.setAttribute("cy", Math.floor(k / n) + 0.5); d.setAttribute("r", 0.04);
      d.setAttribute("class", "hs-dot");
      svgEl.appendChild(d);
    }
    P.edges.forEach((e, i) => {
      if (!val[i]) return;
      const A = P.islands[e.a], B = P.islands[e.b];
      const x1 = A.c + 0.5, y1 = A.r + 0.5, x2 = B.c + 0.5, y2 = B.r + 0.5;
      if (val[i] === 1) line(x1, y1, x2, y2, "hs-bridge");
      else {
        const o = 0.13, ox = e.horiz ? 0 : o, oy = e.horiz ? o : 0;
        line(x1 - ox, y1 - oy, x2 - ox, y2 - oy, "hs-bridge");
        line(x1 + ox, y1 + oy, x2 + ox, y2 + oy, "hs-bridge");
      }
    });
    const targets = new Set();
    if (sel >= 0) for (const e of P.adj[sel]) targets.add(P.edges[e].a === sel ? P.edges[e].b : P.edges[e].a);
    islandEls.forEach((el, i) => {
      const s = sumAt(i), num = P.islands[i].num;
      el.className = "hs-island" + (s === num ? " done" : s > num ? " over" : "") + (i === sel ? " sel" : "") + (targets.has(i) ? " target" : "");
      el.setAttribute("aria-label", "Island " + num + ", " + s + " bridge" + (s === 1 ? "" : "s") + (i === sel ? ", selected" : ""));
    });
    boardEl.classList.toggle("solved", won);
    undoBtn.disabled = won || !history.length;
  }

  function cycle(e) {
    if (won || e < 0) return;
    const next = (val[e] + 1) % 3;
    if (next > 0 && P.crosses[e].some(f => val[f] > 0)) {
      statusEl.innerHTML = '<span class="bad">Bridges can\'t cross.</span>';
      return;
    }
    history.push(val.slice());
    val[e] = next;
    statusEl.textContent = STATUS;
    render();
    checkWin();
  }

  function checkWin() {
    if (!P.islands.every((p, i) => sumAt(i) === p.num)) return;
    if (!connected(P, e => val[e] > 0)) {
      statusEl.innerHTML = '<span class="hot">Every count is right, but the islands must form one connected group.</span>';
      return;
    }
    won = true;
    sel = -1;
    page.win();
    render();
  }

  // ---------- input: tap island → tap island, drag island → island, or tap a gap ----------

  function islandAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const b = el && el.closest && el.closest(".hs-island");
    return b && boardEl.contains(b) ? parseInt(b.dataset.i, 10) : -1;
  }

  boardEl.addEventListener("pointerdown", (e) => {
    if (won || !P) return;
    e.preventDefault();
    const i = islandAt(e.clientX, e.clientY);
    if (i >= 0) { dragFrom = i; return; }
    // Tapped open water: toggle the bridge that passes through this cell.
    const r = boardEl.getBoundingClientRect(), n = P.n;
    const c = Math.floor((e.clientX - r.left) / r.width * n), row = Math.floor((e.clientY - r.top) / r.height * n);
    const list = P.cellEdges.get(row * n + c) || [];
    if (!list.length) { sel = -1; render(); return; }
    const withBridge = list.filter(x => val[x] > 0);
    sel = -1;
    cycle(withBridge.length === 1 ? withBridge[0] : list.find(x => P.edges[x].horiz) ?? list[0]);
    render();
  });

  window.addEventListener("pointerup", (e) => {
    if (dragFrom < 0) return;
    const from = dragFrom;
    dragFrom = -1;
    const to = islandAt(e.clientX, e.clientY);
    if (to >= 0 && to !== from) {
      sel = -1;
      cycle(edgeBetween(from, to));
    } else if (to === from) {
      tapIsland(from);
    }
    render();
  });
  window.addEventListener("pointercancel", () => { dragFrom = -1; });

  // Tap an island to select it; tap a neighbour of the selection to cycle their bridge.
  function tapIsland(i) {
    if (won) return;
    if (sel >= 0 && sel !== i && edgeBetween(sel, i) >= 0) { const s = sel; sel = -1; cycle(edgeBetween(s, i)); }
    else sel = sel === i ? -1 : i;
    render();
  }
  Gamekit.gridKeys(boardEl, { selector: ".hs-island", onActivate: (el) => tapIsland(parseInt(el.dataset.i, 10)) });

  undoBtn.addEventListener("click", () => {
    if (won || !history.length) return;
    val = history.pop();
    statusEl.textContent = STATUS;
    render();
  });

  const page = Gamekit.puzzlePage({
    id: "hashi",
    status: STATUS,
    generate,
    start,
    reset: () => { clear(); render(); },
  });
  window.addEventListener("load", () => Manpage.autoOpen("hashi"));
})();
