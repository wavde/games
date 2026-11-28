(function () {
  "use strict";

  // ---------- rules (no DOM) ----------
  // Card c in 0..51: suit = c / 13 (♠ ♥ ♦ ♣), rank = c % 13 + 1 (ace = 1, king = 13).
  // State: t[8] columns (bottom first), c[4] free cells (-1 = empty), f[suit] = cards home.

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
  const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_NAMES = ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];
  const suit = (c) => Math.floor(c / 13), rank = (c) => c % 13 + 1;
  const red = (c) => suit(c) === 1 || suit(c) === 2;
  const nameOf = (c) => RANK_NAMES[rank(c)] + " of " + SUIT_NAMES[suit(c)];
  const top = (a) => a[a.length - 1];
  const DEALS = 32000, UNWINNABLE = 11982;

  // Microsoft FreeCell deal n (1..32000): its LCG shuffle, cards dealt across eight columns.
  // MS card m: rank m >> 2, suit m & 3 in clubs, diamonds, hearts, spades order.
  function deal(n) {
    const cards = Array.from({ length: 52 }, (_, i) => 51 - i);
    let s = n;
    for (let i = 0; i < 52; i++) {
      s = (Math.imul(s, 214013) + 2531011) & 0x7fffffff;
      const j = 51 - ((s >> 16) % (52 - i));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const t = [[], [], [], [], [], [], [], []];
    cards.forEach((m, k) => t[k % 8].push([3, 2, 1, 0][m & 3] * 13 + (m >> 2)));
    return { t, c: [-1, -1, -1, -1], f: [0, 0, 0, 0] };
  }

  const clone = (S) => ({ t: S.t.map((p) => p.slice()), c: S.c.slice(), f: S.f.slice() });
  const won = (S) => S.f.every((x) => x === 13);
  const canFound = (S, c) => S.f[suit(c)] === rank(c) - 1;
  const stacks = (a, b) => rank(a) === rank(b) + 1 && red(a) !== red(b);
  function canTab(S, c, p) { return !S.t[p].length || stacks(top(S.t[p]), c); }

  // How many cards move at once: one per free cell plus one, doubled for each empty column
  // that isn't the destination.
  function capacity(S, to) {
    const cells = S.c.filter((x) => x < 0).length;
    const empty = S.t.filter((p, q) => !p.length && q !== to).length;
    return (cells + 1) * (1 << empty);
  }

  // Moves: from = { t, k } | { c }, to = { t } | { c } | { f: true }.
  function cardsOf(S, from) {
    if (from.c !== undefined) return S.c[from.c] >= 0 ? [S.c[from.c]] : [];
    const P = S.t[from.t];
    if (from.k < 0 || from.k >= P.length) return [];
    for (let k = from.k + 1; k < P.length; k++) if (!stacks(P[k - 1], P[k])) return [];
    return P.slice(from.k);
  }

  function legal(S, mv) {
    const cs = cardsOf(S, mv.from);
    if (!cs.length) return false;
    if (mv.to.f) return cs.length === 1 && canFound(S, cs[0]);
    if (mv.to.c !== undefined) return cs.length === 1 && S.c[mv.to.c] < 0 && mv.from.c === undefined;
    if (mv.from.t === mv.to.t) return false;
    return canTab(S, cs[0], mv.to.t) && cs.length <= capacity(S, mv.to.t);
  }

  function apply(S, mv) {
    const cs = cardsOf(S, mv.from);
    if (mv.from.c !== undefined) S.c[mv.from.c] = -1;
    else S.t[mv.from.t].length = mv.from.k;
    if (mv.to.f) S.f[suit(cs[0])]++;
    else if (mv.to.c !== undefined) S.c[mv.to.c] = cs[0];
    else S.t[mv.to.t].push(...cs);
  }

  // A card goes home automatically once no card that could still sit on it is out.
  function safe(S, c) {
    if (!canFound(S, c)) return false;
    const r = rank(c), o = red(c) ? [0, 3] : [1, 2];
    return r <= 2 || (S.f[o[0]] >= r - 1 && S.f[o[1]] >= r - 1);
  }

  function autoplay(S) {
    let n = 0;
    for (let moved = true; moved;) {
      moved = false;
      for (let q = 0; q < 4; q++) if (S.c[q] >= 0 && safe(S, S.c[q])) { S.f[suit(S.c[q])]++; S.c[q] = -1; moved = true; n++; }
      for (const P of S.t) if (P.length && safe(S, top(P))) { S.f[suit(P.pop())]++; moved = true; n++; }
    }
    return n;
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const cellEls  = Array.from(document.querySelectorAll(".fc-free"));
  const foundEls = Array.from(document.querySelectorAll(".fc-found"));
  const pileEls  = Array.from(document.querySelectorAll(".fc-pile"));
  const statusEl = document.getElementById("status");
  const dealEl   = document.getElementById("deal");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const movesEl  = document.getElementById("moves");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const STATUS = "Build each suit up from ace to king.";
  const store = Gamekit.storage("freecell:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best" });

  let S = null, number = 0, history = [], moves = 0, done = false;
  let picked = null, dailyDate = null, drag = null, suppressClick = false;

  function pickNumber(seed) {
    const n = (seed % DEALS) + 1;
    return n === UNWINNABLE ? n + 1 : n;
  }

  function newDeal(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("freecell", "deal");
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    number = pickNumber(seed);
    restart();
  }

  function restart() {
    S = deal(number);
    autoplay(S);
    history = [];
    moves = 0;
    done = false;
    picked = null;
    dealEl.textContent = "#" + number + (dailyDate ? " (daily)" : "");
    clock.start();
    statusEl.textContent = STATUS;
    render();
  }

  // ----- rendering -----

  function cardEl(c, keyName, from) {
    const el = document.createElement(from ? "button" : "div");
    el.className = "fc-card " + (red(c) ? "red" : "black");
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

  function slotBtn(keyName, label, glyph) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "fc-slot";
    el.dataset.key = keyName;
    if (glyph) el.dataset.s = glyph;
    el.setAttribute("aria-label", label);
    return el;
  }

  const same = (a, b) => !!a && !!b && a.t === b.t && a.k === b.k && a.c === b.c;

  function render() {
    const focusKey = boardEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const cw = pileEls[0].getBoundingClientRect().width || 50, ch = cw * 1.4;
    boardEl.style.setProperty("--cw", cw + "px");

    cellEls.forEach((el, q) => {
      el.innerHTML = "";
      const c = S.c[q];
      if (c >= 0) {
        const b = cardEl(c, "c" + q, done ? null : { c: q });
        if (!done) b.setAttribute("aria-label", nameOf(c) + ", free cell " + (q + 1));
        if (same(picked, { c: q })) b.classList.add("picked");
        el.appendChild(b);
      } else el.appendChild(slotBtn("c" + q, "Free cell " + (q + 1) + ", empty"));
    });

    foundEls.forEach((el, f) => {
      el.innerHTML = "";
      const k = S.f[f];
      if (k) {
        const b = cardEl(f * 13 + k - 1, "", null);
        el.appendChild(b);
        const hit = slotBtn("f" + f, nameOf(f * 13 + k - 1) + ", " + SUIT_NAMES[f] + " foundation");
        hit.classList.add("cover");
        el.appendChild(hit);
      } else el.appendChild(slotBtn("f" + f, SUIT_NAMES[f] + " foundation, empty", SUITS[f]));
    });

    const longest = Math.max(...S.t.map((P) => P.length));
    const step = Math.min(ch * 0.3, Math.max(ch * 0.18, (window.innerHeight * 0.62 - ch) / Math.max(1, longest - 1)));
    pileEls.forEach((el, p) => {
      el.innerHTML = "";
      const P = S.t[p];
      el.setAttribute("aria-label", "Column " + (p + 1));
      if (!P.length) { el.appendChild(slotBtn("e" + p, "Column " + (p + 1) + ", empty")); el.style.height = ch + "px"; return; }
      P.forEach((c, k) => {
        const ce = cardEl(c, "t" + p + "-" + k, done ? null : { t: p, k });
        ce.style.top = k * step + "px";
        if (picked && picked.t === p && k >= picked.k) ce.classList.add("picked");
        if (drag && drag.on && drag.from.t === p && k >= drag.from.k) ce.classList.add("lifted");
        el.appendChild(ce);
      });
      el.style.height = (P.length - 1) * step + ch + "px";
    });

    movesEl.textContent = moves;
    undoBtn.disabled = done || !history.length;
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
    const d = zone.dataset.drop;
    return d === "f" ? { f: true } : d[0] === "c" ? { c: +d.slice(1) } : { t: +d };
  }

  function say(text) { statusEl.textContent = text; }

  function commit(mv) {
    history.push({ S: clone(S), moves });
    apply(S, mv);
    moves++;
    autoplay(S);
    picked = null;
    if (won(S)) { win(); return; }
    statusEl.textContent = STATUS;
    render();
  }

  function tryMove(from, to) {
    const mv = { from, to };
    if (legal(S, mv)) { commit(mv); return true; }
    const cs = cardsOf(S, from);
    if (to.t !== undefined && cs.length > 1 && canTab(S, cs[0], to.t) && cs.length > capacity(S, to.t)) {
      say("Only " + capacity(S, to.t) + " cards can move at once there. Free a cell or a column.");
    } else say("That can't go there.");
    render();
    return false;
  }

  // Tap: home if it can, else onto a column that takes it, else an empty column, else a free cell.
  function autoMove(from) {
    let cs = cardsOf(S, from);
    if (!cs.length) {
      say("Only an in-order run (down, alternating colours) moves together.");
      return;
    }
    if (cs.length === 1 && canFound(S, cs[0])) { commit({ from, to: { f: true } }); return; }
    const at = from.t === undefined ? -1 : from.t;
    let empty = -1;
    for (let j = 1; j <= 8; j++) {
      const b = (at + j + 8) % 8;
      if (b === from.t) continue;
      const mv = { from, to: { t: b } };
      if (!legal(S, mv)) continue;
      if (S.t[b].length) { commit(mv); return; }
      if (empty < 0 && !(from.t !== undefined && from.k === 0)) empty = b;
    }
    if (empty >= 0) { commit({ from, to: { t: empty } }); return; }
    const free = S.c.indexOf(-1);
    if (cs.length === 1 && from.c === undefined && free >= 0) { commit({ from, to: { c: free } }); return; }
    cs = cardsOf(S, from);
    say("No move for the " + nameOf(cs[0]) + ".");
  }

  function win() {
    done = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("freecell", "deal", dailyDate);
    statusEl.innerHTML = '<span class="ok">Won deal #' + number + " in " + Gamekit.fmtTime(s) + ", " + moves + " moves.</span>";
    render();
  }

  // ----- input -----

  function activate(el) {
    if (done || !el) return;
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
    if (done) return;
    const src = sourceOf(el);
    if (!src || !cardsOf(S, src).length) return;
    picked = same(picked, src) ? null : src;
    if (picked) say("Holding the " + nameOf(cardsOf(S, src)[0]) + ". Move to a column, cell, or foundation and press Enter.");
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
    if (e.button !== 0 || done) return;
    const el = e.target.closest("button"), from = sourceOf(el);
    if (!from || !cardsOf(S, from).length) return;
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
      f.className = "fc-float";
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
    if (e.key === "Escape" && picked && !document.querySelector(".man-backdrop")) { picked = null; say(STATUS); render(); }
  });

  undoBtn.addEventListener("click", () => {
    if (done || !history.length) return;
    const h = history.pop();
    S = h.S;
    moves = h.moves;
    picked = null;
    statusEl.textContent = STATUS;
    render();
  });

  resetBtn.addEventListener("click", restart);
  newBtn.addEventListener("click", () => newDeal(Gamekit.randomSeed()));

  newDeal();
  let lastW = 0;
  new ResizeObserver(() => {
    const w = boardEl.clientWidth;
    if (S && w !== lastW) { lastW = w; render(); }
  }).observe(boardEl);
  window.addEventListener("load", () => Manpage.autoOpen("freecell"));

  Gamekit.gridKeys(boardEl, { selector: "button", onSecondary: (el) => pick(el) });
})();
