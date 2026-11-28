(function () {
  "use strict";

  const MODES = { one: 1, three: 3 };

  // ---------- rules + solver (no DOM) ----------
  // Card c in 0..51: suit = c / 13 (♠ ♥ ♦ ♣), rank = c % 13 + 1 (ace = 1, king = 13).
  // State: t[7] tableau piles (bottom first) with d[p] face-down cards at the bottom,
  // s stock and w waste (top last), f[suit] = cards on that suit's foundation.

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
  const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_NAMES = ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];
  const suit = (c) => Math.floor(c / 13), rank = (c) => c % 13 + 1;
  const red = (c) => suit(c) === 1 || suit(c) === 2;
  const nameOf = (c) => RANK_NAMES[rank(c)] + " of " + SUIT_NAMES[suit(c)];

  function dealFrom(rng) {
    const deck = Gamekit.shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
    const t = [], d = [];
    let k = 0;
    for (let p = 0; p < 7; p++) { t.push(deck.slice(k, k + p + 1)); d.push(p); k += p + 1; }
    return { t, d, s: deck.slice(k), w: [], f: [0, 0, 0, 0] };
  }

  const clone = (S) => ({ t: S.t.map((p) => p.slice()), d: S.d.slice(), s: S.s.slice(), w: S.w.slice(), f: S.f.slice() });
  const top = (a) => a[a.length - 1];
  const won = (S) => S.f.every((x) => x === 13);

  function canFound(S, c) { return S.f[suit(c)] === rank(c) - 1; }
  function canTab(S, c, p) {
    const P = S.t[p];
    if (!P.length) return rank(c) === 13;
    const u = top(P);
    return rank(u) === rank(c) + 1 && red(u) !== red(c);
  }

  // Turn up the new top card of a pile.
  function settle(S, p) { if (S.d[p] >= S.t[p].length) S.d[p] = Math.max(0, S.t[p].length - 1); }

  // Moves: from = { w } | { t, k } | { f }, to = { t } | { f: true }.
  function cardsOf(S, from) {
    if (from.w) return S.w.length ? [top(S.w)] : [];
    if (from.f !== undefined) return S.f[from.f] ? [from.f * 13 + S.f[from.f] - 1] : [];
    const P = S.t[from.t];
    return from.k >= S.d[from.t] && from.k < P.length ? P.slice(from.k) : [];
  }

  function legal(S, mv) {
    const cs = cardsOf(S, mv.from);
    if (!cs.length) return false;
    if (mv.to.f) return cs.length === 1 && mv.from.f === undefined && canFound(S, cs[0]);
    if (mv.from.t === mv.to.t) return false;
    return canTab(S, cs[0], mv.to.t);
  }

  function apply(S, mv) {
    const cs = cardsOf(S, mv.from);
    if (mv.from.w) S.w.pop();
    else if (mv.from.f !== undefined) S.f[mv.from.f]--;
    else { S.t[mv.from.t].length = mv.from.k; settle(S, mv.from.t); }
    if (mv.to.f) S.f[suit(cs[0])]++;
    else S.t[mv.to.t].push(...cs);
  }

  // Turn up to n cards from stock to waste, or turn the waste back over when the stock is out.
  function draw(S, n) {
    if (S.s.length) for (let i = 0; i < n && S.s.length; i++) S.w.push(S.s.pop());
    else { S.s = S.w.reverse(); S.w = []; }
  }

  // A card can go home for good once nothing could still need to sit on it.
  function safe(S, c) {
    if (!canFound(S, c)) return false;
    const r = rank(c), o = red(c) ? [0, 3] : [1, 2];
    return r <= 2 || (S.f[o[0]] >= r - 1 && S.f[o[1]] >= r - 1);
  }

  function autoplay(S) {
    for (let moved = true; moved;) {
      moved = false;
      if (S.w.length && safe(S, top(S.w))) { S.f[suit(S.w.pop())]++; moved = true; }
      for (let p = 0; p < 7; p++) {
        const P = S.t[p];
        if (P.length && safe(S, top(P))) { S.f[suit(P.pop())]++; settle(S, p); moved = true; }
      }
    }
  }

  // Candidate moves, most promising first. Pruned to moves that can matter: whole runs that
  // turn up a card or empty a column, part-runs that free a card for its foundation.
  function candidates(S) {
    const out = [], reveal = [], other = [];
    if (S.w.length && canFound(S, top(S.w))) out.push({ from: { w: true }, to: { f: true } });
    for (let p = 0; p < 7; p++) if (S.t[p].length && canFound(S, top(S.t[p]))) out.push({ from: { t: p, k: S.t[p].length - 1 }, to: { f: true } });
    for (let a = 0; a < 7; a++) {
      const P = S.t[a];
      for (let k = S.d[a]; k < P.length; k++) {
        const whole = k === S.d[a];
        if (!whole && !canFound(S, P[k - 1])) continue;
        let empty = false;
        for (let b = 0; b < 7; b++) {
          if (b === a || !canTab(S, P[k], b)) continue;
          if (!S.t[b].length) { if (empty || (whole && k === 0)) continue; empty = true; }
          (whole && k > 0 ? reveal : other).push({ from: { t: a, k }, to: { t: b } });
        }
      }
    }
    out.push(...reveal);
    if (S.w.length) {
      let empty = false;
      for (let b = 0; b < 7; b++) {
        if (!canTab(S, top(S.w), b)) continue;
        if (!S.t[b].length) { if (empty) continue; empty = true; }
        out.push({ from: { w: true }, to: { t: b } });
      }
    }
    out.push(...other);
    return out;
  }

  function key(S) {
    return S.f.join(",") + "|" + S.t.map((P, p) => S.d[p] + ":" + P.join(".")).sort().join("/") + "|" + S.s.join(".") + "|" + S.w.join(".");
  }

  // Depth-first search for a winning line, seeing the face-down cards.
  // { won, complete, line }: complete is false if the node budget ran out first; line lists the
  // moves ("draw" for the stock) between automatic foundation plays.
  function solve(S0, n, budget) {
    const seen = new Set(), line = [];
    let nodes = 0, out = false;
    function dfs(S) {
      autoplay(S);
      if (won(S)) return true;
      if (++nodes > budget) { out = true; return false; }
      const k = key(S);
      if (seen.has(k)) return false;
      seen.add(k);
      for (const mv of candidates(S)) {
        const T = clone(S);
        apply(T, mv);
        if (dfs(T)) { line.push(mv); return true; }
        if (out) return false;
      }
      if (S.s.length || S.w.length) {
        const T = clone(S);
        draw(T, n);
        if (dfs(T)) { line.push("draw"); return true; }
      }
      return false;
    }
    const w = dfs(clone(S0));
    return { won: w, complete: w || !out, nodes, line: line.reverse() };
  }

  // The first deal from this seed that the solver can win.
  const BUDGET = 6000;
  function deal(seed, n) {
    for (let k = 0; k < 40; k++) {
      const S = dealFrom(Gamekit.mulberry32((seed + Math.imul(k, 0x9e3779b9)) >>> 0));
      if (solve(S, n, BUDGET).won) return S;
    }
    return dealFrom(Gamekit.mulberry32(seed));
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const stockEl  = document.getElementById("stock");
  const wasteEl  = document.getElementById("waste");
  const foundEls = Array.from(document.querySelectorAll(".kl-found"));
  const pileEls  = Array.from(document.querySelectorAll(".kl-pile"));
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const movesEl  = document.getElementById("moves");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const STATUS = "Build each suit up from ace to king.";
  const store = Gamekit.storage("klondike:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + mode });

  let mode = "one";
  let S = null, start = null, history = [], moves = 0, done = false, finishing = false;
  let picked = null, dailyDate = null, drag = null, suppressClick = false;

  function newDeal(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("klondike", mode);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    start = deal(seed, MODES[mode]);
    restart();
  }

  function restart() {
    S = clone(start);
    history = [];
    moves = 0;
    done = finishing = false;
    picked = null;
    clock.start();
    statusEl.textContent = STATUS;
    render();
  }

  // ----- rendering -----

  function cardEl(c, keyName, from) {
    const el = document.createElement(from ? "button" : "div");
    el.className = "kl-card " + (red(c) ? "red" : "black");
    el.dataset.r = RANKS[rank(c)];
    el.dataset.s = SUITS[suit(c)];
    if (from) {
      el.type = "button";
      el.dataset.key = keyName;
      el.setAttribute("aria-label", nameOf(c));
      el.from = from;
    } else el.setAttribute("aria-hidden", "true");
    return el;
  }

  function backEl() {
    const el = document.createElement("div");
    el.className = "kl-card down";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function slotBtn(keyName, label, glyph) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "kl-slot";
    el.dataset.key = keyName;
    if (glyph) el.dataset.s = glyph;
    el.setAttribute("aria-label", label);
    return el;
  }

  const same = (a, b) => !!a && !!b && a.w === b.w && a.t === b.t && a.k === b.k && a.f === b.f;

  function render() {
    const focusKey = boardEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const cw = pileEls[0].getBoundingClientRect().width || 60, ch = cw * 1.4;
    const n = MODES[mode];
    boardEl.style.setProperty("--cw", cw + "px");

    stockEl.innerHTML = "";
    const sb = slotBtn("stock", S.s.length ? "Stock, " + S.s.length + " cards: turn " + (n === 1 ? "one" : "three") :
      S.w.length ? "Stock empty: turn the waste back over" : "Stock empty", S.s.length ? "" : "↻");
    if (S.s.length) sb.classList.add("back");
    sb.disabled = done || (!S.s.length && !S.w.length);
    stockEl.appendChild(sb);

    wasteEl.innerHTML = "";
    const fan = S.w.slice(-n);
    fan.forEach((c, j) => {
      const isTop = j === fan.length - 1;
      const el = cardEl(c, isTop ? "w" : "", isTop && !done ? { w: true } : null);
      el.style.left = j * cw * 0.32 + "px";
      if (isTop && same(picked, { w: true })) el.classList.add("picked");
      wasteEl.appendChild(el);
    });

    foundEls.forEach((el, f) => {
      el.innerHTML = "";
      const k = S.f[f];
      if (k) {
        const c = f * 13 + k - 1, b = cardEl(c, "f" + f, done ? null : { f });
        if (!done) b.setAttribute("aria-label", nameOf(c) + ", " + SUIT_NAMES[f] + " foundation");
        if (same(picked, { f })) b.classList.add("picked");
        el.appendChild(b);
      } else el.appendChild(slotBtn("f" + f, SUIT_NAMES[f] + " foundation, empty", SUITS[f]));
    });

    pileEls.forEach((el, p) => {
      el.innerHTML = "";
      const P = S.t[p];
      el.setAttribute("aria-label", "Column " + (p + 1) + (S.d[p] ? ", " + S.d[p] + " face down" : ""));
      if (!P.length) { el.appendChild(slotBtn("e" + p, "Column " + (p + 1) + ", empty")); el.style.height = ch + "px"; return; }
      let y = 0;
      P.forEach((c, k) => {
        const up = k >= S.d[p];
        const ce = up ? cardEl(c, "t" + p + "-" + k, done ? null : { t: p, k }) : backEl();
        ce.style.top = y + "px";
        if (picked && picked.t === p && k >= picked.k) ce.classList.add("picked");
        if (drag && drag.on && drag.from.t === p && k >= drag.from.k) ce.classList.add("lifted");
        el.appendChild(ce);
        if (k < P.length - 1) y += up ? ch * 0.28 : ch * 0.12;
      });
      el.style.height = y + ch + "px";
    });

    movesEl.textContent = moves;
    undoBtn.disabled = done || finishing || !history.length;
    boardEl.classList.toggle("won", done);
    if (focusKey) {
      const back = boardEl.querySelector('[data-key="' + focusKey + '"]') || boardEl.querySelector("button:not(:disabled)");
      if (back) back.focus({ preventScroll: true });
    }
  }

  // ----- moves -----

  function sourceOf(el) { return el && el.from ? el.from : null; }

  function targetOf(el) {
    const zone = el && el.closest("[data-drop]");
    if (!zone) return null;
    return zone.dataset.drop === "f" ? { f: true } : { t: +zone.dataset.drop };
  }

  function say(text) { statusEl.textContent = text; }

  function commit(mv) {
    history.push({ S: clone(S), moves });
    apply(S, mv);
    moves++;
    after();
  }

  function tryMove(from, to) {
    const mv = { from, to };
    if (!legal(S, mv)) { say("That can't go there."); render(); return false; }
    commit(mv);
    return true;
  }

  // Tap: home to the foundation if it can, else the next column that takes it.
  function autoMove(from) {
    const cs = cardsOf(S, from);
    if (!cs.length) return;
    if (cs.length === 1 && from.f === undefined && canFound(S, cs[0])) { commit({ from, to: { f: true } }); return; }
    let empty = -1;
    const at = from.t === undefined ? -1 : from.t;
    for (let j = 1; j <= 7; j++) {
      const b = (at + j + 7) % 7;
      if (b === from.t || !canTab(S, cs[0], b)) continue;
      if (S.t[b].length) { commit({ from, to: { t: b } }); return; }
      if (empty < 0 && !(from.t !== undefined && from.k === 0)) empty = b;
    }
    if (empty >= 0) { commit({ from, to: { t: empty } }); return; }
    say("No move for the " + nameOf(cs[0]) + ".");
  }

  function turnStock() {
    if (done || finishing || (!S.s.length && !S.w.length)) return;
    history.push({ S: clone(S), moves });
    draw(S, MODES[mode]);
    moves++;
    after();
  }

  function after() {
    picked = null;
    if (won(S)) { win(); return; }
    statusEl.textContent = STATUS;
    render();
    if (!S.s.length && !S.w.length && S.d.every((x) => x === 0)) finish();
  }

  // Everything is face up and the stock is gone: play the rest home.
  function finish() {
    finishing = true;
    say("Finishing…");
    render();
    (function step() {
      if (!finishing) return;
      for (let p = 0; p < 7; p++) {
        const P = S.t[p];
        if (P.length && canFound(S, top(P))) {
          apply(S, { from: { t: p, k: P.length - 1 }, to: { f: true } });
          if (won(S)) { win(); return; }
          render();
          setTimeout(step, 70);
          return;
        }
      }
      finishing = false;
      render();
    })();
  }

  function win() {
    done = true;
    finishing = false;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("klondike", mode, dailyDate);
    statusEl.innerHTML = '<span class="ok">Won in ' + Gamekit.fmtTime(s) + ", " + moves + " moves.</span>";
    render();
  }

  // ----- input -----

  function activate(el) {
    if (done || finishing || !el) return;
    if (el.dataset.key === "stock") { turnStock(); return; }
    if (picked) {
      const from = picked, to = targetOf(el), src = sourceOf(el);
      picked = null;
      if (src && same(src, from)) { say(STATUS); render(); return; }
      if (to) tryMove(from, to);
      else render();
      return;
    }
    const src = sourceOf(el);
    if (src) autoMove(src);
  }

  function pick(el) {
    if (done || finishing) return;
    const src = sourceOf(el);
    if (!src) return;
    picked = same(picked, src) ? null : src;
    if (picked) say("Holding the " + nameOf(cardsOf(S, src)[0]) + ". Move to a column or foundation and press Enter.");
    else say(STATUS);
    render();
  }

  // A drag ends in a stray click on whatever lies under the pointer; swallow that one only.
  boardEl.addEventListener("click", (e) => {
    if (suppressClick) {
      suppressClick = false;
      if (e.detail > 0) return;
    }
    activate(e.target.closest("button"));
  });

  boardEl.addEventListener("pointerdown", (e) => {
    suppressClick = false;
    if (e.button !== 0 || done || finishing) return;
    const el = e.target.closest("button"), from = sourceOf(el);
    if (!from) return;
    drag = { from, el, x: e.clientX, y: e.clientY, on: false, float: null, id: e.pointerId };
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      if (dx * dx + dy * dy < 36) return;
      drag.on = true;
      picked = null;
      const r = drag.el.getBoundingClientRect(), f = document.createElement("div");
      f.className = "kl-float";
      f.style.left = r.left + "px";
      f.style.top = r.top + "px";
      f.style.setProperty("--cw", r.width + "px");
      cardsOf(S, drag.from).forEach((c, j) => {
        const ce = cardEl(c, "", null);
        ce.style.top = j * r.width * 1.4 * 0.28 + "px";
        f.appendChild(ce);
      });
      document.body.appendChild(f);
      drag.float = f;
      render();
    }
    drag.float.style.transform = "translate(" + dx + "px," + dy + "px)";
  });

  function endDrag(e, drop) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    d.float.remove();
    suppressClick = true;
    const to = drop ? targetOf(document.elementFromPoint(e.clientX, e.clientY)) : null;
    if (to) tryMove(d.from, to);
    else render();
  }
  document.addEventListener("pointerup", (e) => endDrag(e, true));
  document.addEventListener("pointercancel", (e) => endDrag(e, false));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.key === "Escape" && picked) { picked = null; say(STATUS); render(); }
    else if (e.key === "d" || e.key === "D") { turnStock(); e.preventDefault(); }
  });

  undoBtn.addEventListener("click", () => {
    if (done || finishing || !history.length) return;
    const h = history.pop();
    S = h.S;
    moves = h.moves;
    picked = null;
    statusEl.textContent = STATUS;
    render();
  });

  resetBtn.addEventListener("click", restart);
  newBtn.addEventListener("click", () => newDeal(Gamekit.randomSeed()));

  const chips = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ["one", "three"],
    initial: mode,
    storage: store,
    storageKey: "mode",
    onChange: (m) => { mode = m; newDeal(); },
  });
  mode = chips.get();

  newDeal();
  let lastW = 0;
  new ResizeObserver(() => {
    const w = boardEl.clientWidth;
    if (S && w !== lastW) { lastW = w; render(); }
  }).observe(boardEl);
  window.addEventListener("load", () => Manpage.autoOpen("klondike"));

  Gamekit.gridKeys(boardEl, { selector: "button", onSecondary: (el) => pick(el) });
})();
