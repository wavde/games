(function () {
  "use strict";

  const SUITS_FOR = { easy: 1, medium: 2, hard: 4 };

  // ---------- rules (no DOM) ----------
  // Two decks, 104 cards. Card c: suit = c / 13 (♠ ♥ ♦ ♣), rank = c % 13 + 1; with fewer suits
  // the same suits simply repeat. State: t[10] columns (bottom first) with d[p] face-down at the
  // bottom, s stock (dealt from the end), done = completed king-to-ace runs.

  const SUITS = ["♠", "♥", "♦", "♣"];
  const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
  const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RANK_NAMES = ["", "ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];
  const suit = (c) => Math.floor(c / 13), rank = (c) => c % 13 + 1;
  const red = (c) => suit(c) === 1 || suit(c) === 2;
  const nameOf = (c) => RANK_NAMES[rank(c)] + " of " + SUIT_NAMES[suit(c)];
  const top = (a) => a[a.length - 1];

  function dealFrom(suits, rng) {
    const deck = [];
    for (let k = 0; k < 104; k++) deck.push((k % suits) * 13 + Math.floor(k / suits) % 13);
    Gamekit.shuffle(deck, rng);
    const t = [], d = [];
    let k = 0;
    for (let p = 0; p < 10; p++) {
      const n = p < 4 ? 6 : 5;
      t.push(deck.slice(k, k + n));
      d.push(n - 1);
      k += n;
    }
    return { t, d, s: deck.slice(k), done: [] };
  }

  const clone = (S) => ({ t: S.t.map((p) => p.slice()), d: S.d.slice(), s: S.s.slice(), done: S.done.slice() });
  const won = (S) => S.done.length === 8;

  // A run moves together if it is face up, one suit, and counts down by one.
  function cardsOf(S, from) {
    const P = S.t[from.t];
    if (from.k < S.d[from.t] || from.k >= P.length) return [];
    for (let k = from.k + 1; k < P.length; k++) if (suit(P[k]) !== suit(P[k - 1]) || rank(P[k]) !== rank(P[k - 1]) - 1) return [];
    return P.slice(from.k);
  }

  function legal(S, mv) {
    const cs = cardsOf(S, mv.from);
    if (!cs.length || mv.from.t === mv.to.t) return false;
    const P = S.t[mv.to.t];
    return !P.length || rank(top(P)) === rank(cs[0]) + 1;
  }

  function settle(S, p) {
    const P = S.t[p];
    // A finished king-to-ace run of one suit leaves the table.
    if (P.length - S.d[p] >= 13 && rank(top(P)) === 1) {
      const run = cardsOf(S, { t: p, k: P.length - 13 });
      if (run.length === 13 && rank(run[0]) === 13) { S.done.push(suit(run[0])); P.length -= 13; }
    }
    if (S.d[p] >= P.length) S.d[p] = Math.max(0, P.length - 1);
  }

  function apply(S, mv) {
    const cs = cardsOf(S, mv.from);
    S.t[mv.from.t].length = mv.from.k;
    settle(S, mv.from.t);
    S.t[mv.to.t].push(...cs);
    settle(S, mv.to.t);
  }

  // One card onto every column; not allowed while a column is empty.
  const canDeal = (S) => S.s.length > 0 && S.t.every((P) => P.length);
  function dealRow(S) {
    for (let p = 0; p < 10; p++) { S.t[p].push(S.s.pop()); settle(S, p); }
  }

  // ---------- game ----------

  const boardEl  = document.getElementById("board");
  const stockEl  = document.getElementById("stock");
  const doneEl   = document.getElementById("done");
  const pileEls  = Array.from(document.querySelectorAll(".sp-pile"));
  const statusEl = document.getElementById("status");
  const timeEl   = document.getElementById("time");
  const bestEl   = document.getElementById("best");
  const movesEl  = document.getElementById("moves");
  const undoBtn  = document.getElementById("undo-btn");
  const resetBtn = document.getElementById("reset-btn");
  const newBtn   = document.getElementById("new-btn");
  const chipsEl  = document.getElementById("chips");
  const STATUS = "Build runs of one suit from king down to ace.";
  const store = Gamekit.storage("spider:");
  const clock = Gamekit.puzzleClock({ timeEl, bestEl, store, key: () => "best:" + diff });

  let diff = "easy";
  let S = null, start = null, history = [], moves = 0, over = false;
  let picked = null, dailyDate = null, drag = null, suppressClick = false;

  function newDeal(seedOverride) {
    const seed = seedOverride !== undefined ? seedOverride : Gamekit.dailySeed("spider", diff);
    dailyDate = seedOverride === undefined ? Gamekit.todayISO() : null;
    start = dealFrom(SUITS_FOR[diff], Gamekit.mulberry32(seed));
    restart();
  }

  function restart() {
    S = clone(start);
    history = [];
    moves = 0;
    over = false;
    picked = null;
    clock.start();
    statusEl.textContent = STATUS;
    render();
  }

  // ----- rendering -----

  function cardEl(c, keyName, from) {
    const el = document.createElement(from ? "button" : "div");
    el.className = "sp-card " + (red(c) ? "red" : "black");
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
    el.className = "sp-card down";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  const same = (a, b) => !!a && !!b && a.t === b.t && a.k === b.k;

  function render() {
    const focusKey = boardEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const cw = pileEls[0].getBoundingClientRect().width || 40, ch = cw * 1.4;
    boardEl.style.setProperty("--cw", cw + "px");

    stockEl.innerHTML = "";
    const sb = document.createElement("button");
    sb.type = "button";
    sb.className = "sp-stock";
    sb.dataset.key = "stock";
    sb.dataset.n = S.s.length / 10;
    sb.disabled = over || !S.s.length;
    sb.setAttribute("aria-label", S.s.length ? "Deal a row, " + S.s.length / 10 + " left" + (canDeal(S) ? "" : " (fill every column first)") : "Stock empty");
    stockEl.appendChild(sb);

    doneEl.innerHTML = "";
    doneEl.setAttribute("aria-label", S.done.length + " of 8 runs complete");
    S.done.forEach((st, k) => {
      const c = cardEl(st * 13 + 12, "", null);
      c.style.left = k * cw * 0.22 + "px";
      doneEl.appendChild(c);
    });

    const tallest = Math.max(...S.t.map((P, p) => (P.length - S.d[p]) + S.d[p] * 0.4));
    const step = Math.min(ch * 0.27, Math.max(ch * 0.14, (window.innerHeight * 0.62 - ch) / Math.max(1, tallest - 1)));
    pileEls.forEach((el, p) => {
      el.innerHTML = "";
      const P = S.t[p];
      el.setAttribute("aria-label", "Column " + (p + 1) + (S.d[p] ? ", " + S.d[p] + " face down" : ""));
      if (!P.length) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "sp-slot";
        slot.dataset.key = "e" + p;
        slot.setAttribute("aria-label", "Column " + (p + 1) + ", empty");
        el.appendChild(slot);
        el.style.height = ch + "px";
        return;
      }
      let y = 0;
      P.forEach((c, k) => {
        const up = k >= S.d[p];
        const ce = up ? cardEl(c, "t" + p + "-" + k, over ? null : { t: p, k }) : backEl();
        ce.style.top = y + "px";
        if (picked && picked.t === p && k >= picked.k) ce.classList.add("picked");
        if (drag && drag.on && drag.from.t === p && k >= drag.from.k) ce.classList.add("lifted");
        el.appendChild(ce);
        if (k < P.length - 1) y += up ? step : step * 0.4;
      });
      el.style.height = y + ch + "px";
    });

    movesEl.textContent = moves;
    undoBtn.disabled = over || !history.length;
    if (focusKey) {
      const back = boardEl.querySelector('[data-key="' + focusKey + '"]') || boardEl.querySelector("button:not(:disabled)");
      if (back) back.focus({ preventScroll: true });
    }
  }

  // ----- moves -----

  function sourceOf(el) { return el && el.from ? el.from : null; }
  function targetOf(el) {
    const zone = el && el.closest("[data-drop]");
    return zone ? { t: +zone.dataset.drop } : null;
  }
  function say(text) { statusEl.textContent = text; }

  function commit(fn) {
    history.push({ S: clone(S), moves });
    const runs = S.done.length;
    fn();
    moves++;
    picked = null;
    if (won(S)) { win(); return; }
    statusEl.textContent = S.done.length > runs ? "Run complete — " + S.done.length + " of 8." : STATUS;
    render();
  }

  function tryMove(from, to) {
    if (!legal(S, { from, to })) { say(cardsOf(S, from).length ? "That can't go there." : "Only a run of one suit moves together."); render(); return; }
    commit(() => apply(S, { from, to }));
  }

  // Tap: onto a card of the same suit one higher, else any card one higher, else an empty column.
  function autoMove(from) {
    const cs = cardsOf(S, from);
    if (!cs.length) { say("Only a run of one suit, counting down, moves together."); return; }
    let any = -1, empty = -1;
    for (let j = 1; j < 10; j++) {
      const b = (from.t + j) % 10, P = S.t[b];
      if (!legal(S, { from, to: { t: b } })) continue;
      if (!P.length) { if (empty < 0 && from.k > 0) empty = b; continue; }
      if (suit(top(P)) === suit(cs[0])) { commit(() => apply(S, { from, to: { t: b } })); return; }
      if (any < 0) any = b;
    }
    const b = any >= 0 ? any : empty;
    if (b >= 0) commit(() => apply(S, { from, to: { t: b } }));
    else say("No move for the " + nameOf(cs[0]) + ".");
  }

  function deal() {
    if (over || !S.s.length) return;
    if (!canDeal(S)) { say("Fill every empty column before dealing."); return; }
    commit(() => dealRow(S));
  }

  function win() {
    over = true;
    const s = clock.stop();
    if (dailyDate) Gamekit.markDailySolved("spider", diff, dailyDate);
    statusEl.innerHTML = '<span class="ok">Won in ' + Gamekit.fmtTime(s) + ", " + moves + " moves.</span>";
    render();
  }

  // ----- input -----

  function activate(el) {
    if (over || !el) return;
    if (el.dataset.key === "stock") { deal(); return; }
    if (picked) {
      const from = picked, to = targetOf(el), src = sourceOf(el);
      picked = null;
      if (src && same(src, from)) { say(STATUS); render(); return; }
      if (to) tryMove(from, to); else render();
      return;
    }
    const src = sourceOf(el);
    if (src) autoMove(src);
  }

  function pick(el) {
    if (over) return;
    const src = sourceOf(el);
    if (!src || !cardsOf(S, src).length) return;
    picked = same(picked, src) ? null : src;
    say(picked ? "Holding the " + nameOf(cardsOf(S, src)[0]) + ". Move to a column and press Enter." : STATUS);
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
    if (e.button !== 0 || over) return;
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
      f.className = "sp-float";
      f.style.left = r.left + "px";
      f.style.top = r.top + "px";
      f.style.setProperty("--cw", r.width + "px");
      cardsOf(S, drag.from).forEach((c, j) => {
        const ce = cardEl(c, "", null);
        ce.style.top = j * r.width * 1.4 * 0.27 + "px";
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
    if (to) tryMove(d.from, to); else render();
  }
  document.addEventListener("pointerup", (e) => endDrag(e, true));
  document.addEventListener("pointercancel", (e) => endDrag(e, false));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".man-backdrop")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.key === "Escape" && picked) { picked = null; say(STATUS); render(); }
    else if (e.key === "d" || e.key === "D") { deal(); e.preventDefault(); }
  });

  undoBtn.addEventListener("click", () => {
    if (over || !history.length) return;
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
    difficulties: ["easy", "medium", "hard"],
    initial: diff,
    storage: store,
    storageKey: "diff",
    onChange: (d) => { diff = d; newDeal(); },
  });
  diff = chips.get();

  newDeal();
  let lastW = 0;
  new ResizeObserver(() => {
    const w = boardEl.clientWidth;
    if (S && w !== lastW) { lastW = w; render(); }
  }).observe(boardEl);
  window.addEventListener("load", () => Manpage.autoOpen("spider"));

  Gamekit.gridKeys(boardEl, { selector: "button", onSecondary: (el) => pick(el) });
})();
