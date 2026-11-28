/* ============================================================
   gamekit.js — tiny shared helpers for the new games.
   Exposes `window.Gamekit`.
   ============================================================ */
(function (global) {
  "use strict";

  // Deterministic 32-bit PRNG (Mulberry32)
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // FNV-1a style 32-bit string hash
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todayISO() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const da = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + da;
  }

  function dailySeed(game, difficulty) {
    return hashStr(todayISO() + "|" + difficulty + "|" + game);
  }

  function randomSeed() {
    return (Math.random() * 0x100000000) >>> 0;
  }

  // Shuffle in-place (Fisher-Yates) with a given rng
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Minimal localStorage wrapper that never throws
  function storage(prefix) {
    prefix = prefix || "";
    return {
      get: function (key, fallback) {
        try { const v = localStorage.getItem(prefix + key); return v === null ? fallback : v; }
        catch (e) { return fallback; }
      },
      set: function (key, value) {
        try { localStorage.setItem(prefix + key, String(value)); } catch (e) { /* storage unavailable or full */ }
      },
      getInt: function (key, fallback) {
        const v = this.get(key, null);
        if (v === null || v === undefined) return fallback;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : fallback;
      },
      getJSON: function (key, fallback) {
        const v = this.get(key, null);
        if (v === null) return fallback;
        try { return JSON.parse(v); } catch (e) { return fallback; }
      },
      setJSON: function (key, obj) {
        try { this.set(key, JSON.stringify(obj)); } catch (e) { /* unserialisable value */ }
      },
      remove: function (key) {
        try { localStorage.removeItem(prefix + key); } catch (e) { /* storage unavailable */ }
      },
    };
  }

  function fmtTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  // Wire the standard difficulty-chip pattern. opts = { el, difficulties, initial, onChange, storage, storageKey }
  function wireDifficultyChips(opts) {
    const el = opts.el;
    const diffs = opts.difficulties;
    const store = opts.storage;
    const key   = opts.storageKey || "diff";
    let current = opts.initial;
    if (store) {
      const saved = store.get(key, null);
      if (saved && diffs.indexOf(saved) !== -1) current = saved;
    }
    function apply(d, fire) {
      current = d;
      el.querySelectorAll(".chip").forEach(c => {
        const on = c.getAttribute("data-diff") === current;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      if (store) store.set(key, current);
      if (fire && opts.onChange) opts.onChange(current);
    }
    el.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      const d = btn.getAttribute("data-diff");
      if (!d || !diffs.includes(d) || d === current) return;
      apply(d, true);
    });
    apply(current, false);
    return {
      get: () => current,
      set: (d) => { if (diffs.includes(d)) apply(d, true); },
    };
  }

  // Long-press helper — calls onLong if the user presses for > ms without moving much.
  // Returns a detach() fn.
  function onLongPress(el, ms, onLong) {
    let timer = null;
    let sx = 0, sy = 0;
    const CANCEL = 8;
    function start(x, y) {
      sx = x; sy = y;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onLong();
      }, ms);
    }
    function cancel() { clearTimeout(timer); timer = null; }
    function move(x, y) {
      if (!timer) return;
      if (Math.abs(x - sx) > CANCEL || Math.abs(y - sy) > CANCEL) cancel();
    }
    const td = (e) => start(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e) => move(e.touches[0].clientX, e.touches[0].clientY);
    const tu = () => cancel();
    const md = (e) => start(e.clientX, e.clientY);
    const mm = (e) => move(e.clientX, e.clientY);
    const mu = () => cancel();
    el.addEventListener("touchstart", td, { passive: true });
    el.addEventListener("touchmove",  tm, { passive: true });
    el.addEventListener("touchend",   tu);
    el.addEventListener("touchcancel",tu);
    el.addEventListener("mousedown",  md);
    el.addEventListener("mousemove",  mm);
    el.addEventListener("mouseup",    mu);
    el.addEventListener("mouseleave", mu);
    return function detach() {
      el.removeEventListener("touchstart", td);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", tu);
      el.removeEventListener("touchcancel", tu);
      el.removeEventListener("mousedown", md);
      el.removeEventListener("mousemove", mm);
      el.removeEventListener("mouseup", mu);
      el.removeEventListener("mouseleave", mu);
    };
  }

  // Keyboard play for a board: the board is a single Tab stop (roving tabindex), arrow keys
  // move to the nearest cell in that direction by on-screen position (so sparse layouts work
  // too), Home/End jump to the first/last cell, Enter/Space activates, and F or X runs the
  // optional secondary action (flag / mark). Survives games re-rendering their cells.
  // opts = { selector, onActivate(el, i)?, onSecondary(el, i)?, cross?, next(el, key)? }
  //   cross: weight of sideways offset when choosing a neighbour (higher = stay in line).
  //   next:  custom arrow-key move; return the element to focus (or null to stay).
  function gridKeys(boardEl, opts) {
    const cross = opts.cross === undefined ? 2 : opts.cross;
    let active = 0, inside = false;

    const cells = () => Array.prototype.filter.call(boardEl.querySelectorAll(opts.selector), el => el.getClientRects().length > 0);

    function sync() {
      const list = cells();
      if (!list.length) return list;
      if (active >= list.length) active = list.length - 1;
      list.forEach((el, i) => el.setAttribute("tabindex", i === active ? "0" : "-1"));
      return list;
    }

    function focusCell(list, i) {
      active = i;
      sync();
      list[i].focus({ preventScroll: false });
    }

    function step(list, key) {
      const r0 = list[active].getBoundingClientRect();
      const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
      let best = -1, bestScore = Infinity, bestSide = Infinity;
      list.forEach((el, i) => {
        if (i === active) return;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        const main = key === "ArrowRight" ? dx : key === "ArrowLeft" ? -dx : key === "ArrowDown" ? dy : -dy;
        const side = Math.abs(key === "ArrowRight" || key === "ArrowLeft" ? dy : dx);
        if (main < 1) return;
        const score = main + cross * side;
        if (score < bestScore - 0.5 || (Math.abs(score - bestScore) <= 0.5 && side < bestSide)) {
          best = i; bestScore = score; bestSide = side;
        }
      });
      return best;
    }

    function own(el) { return opts.onActivate ? true : !(el instanceof HTMLButtonElement); }

    boardEl.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const list = cells();
      const i = list.indexOf(e.target);
      if (i < 0) return;
      active = i;
      const k = e.key;
      if (k.indexOf("Arrow") === 0 || k === "Home" || k === "End") {
        e.preventDefault();
        const next = k === "Home" ? 0 : k === "End" ? list.length - 1 : opts.next ? list.indexOf(opts.next(e.target, k)) : step(list, k);
        if (next >= 0) focusCell(list, next);
      } else if ((k === "Enter" || k === " ") && own(e.target)) {
        e.preventDefault();
        (opts.onActivate || (el => el.click()))(e.target, i);
      } else if ((k === "f" || k === "F" || k === "x" || k === "X") && opts.onSecondary) {
        e.preventDefault();
        opts.onSecondary(e.target, i);
      }
    });
    // Space activates native buttons on keyup; suppress that when we handled keydown ourselves.
    boardEl.addEventListener("keyup", (e) => { if (e.key === " " && opts.onActivate && cells().indexOf(e.target) >= 0) e.preventDefault(); });

    boardEl.addEventListener("focusin", (e) => {
      const i = cells().indexOf(e.target);
      if (i >= 0) { active = i; inside = true; sync(); }
    });
    boardEl.addEventListener("focusout", (e) => {
      if (e.relatedTarget && !boardEl.contains(e.relatedTarget)) inside = false;
    });
    document.addEventListener("pointerdown", (e) => { if (!boardEl.contains(e.target)) inside = false; }, true);

    // Games often rebuild their cells; keep exactly one tab stop and keep keyboard focus on the board.
    new MutationObserver(() => {
      const list = sync();
      if (inside && list.length && !boardEl.contains(document.activeElement)) list[active].focus({ preventScroll: true });
    }).observe(boardEl, { childList: true, subtree: true });

    sync();
    return { refresh: sync };
  }

  // Timer + best time for the timed puzzles. opts = { timeEl, bestEl, store, key: () => storage key }.
  // start() on every new or reset board, stop() on a win (records a new best, returns seconds),
  // showBest() when the key changes without a new board.
  function puzzleClock(opts) {
    let t0 = 0, iv = null;
    const secs = () => Math.floor((Date.now() - t0) / 1000);
    function showBest() {
      const b = opts.store.getInt(opts.key(), null);
      opts.bestEl.textContent = b === null ? "—" : fmtTime(b);
    }
    return {
      start() {
        clearInterval(iv);
        t0 = Date.now();
        opts.timeEl.textContent = fmtTime(0);
        iv = setInterval(() => { opts.timeEl.textContent = fmtTime(secs()); }, 500);
        showBest();
      },
      stop() {
        clearInterval(iv);
        iv = null;
        const s = secs(), b = opts.store.getInt(opts.key(), null);
        opts.timeEl.textContent = fmtTime(s);
        if (b === null || s < b) opts.store.set(opts.key(), s);
        showBest();
        return s;
      },
      showBest,
      seconds: secs,
    };
  }

  // Which of today's daily puzzles were solved; the hub reads this to tick its cards.
  // `date` is the day the puzzle was dealt, so a board finished after midnight UTC doesn't count.
  const dailyStore = storage("daily:");
  function dailySolved(game) {
    const d = dailyStore.getJSON(game, null);
    return d && d.date === todayISO() && Array.isArray(d.diffs) ? d.diffs : [];
  }
  function markDailySolved(game, diff, date) {
    if (!date || date !== todayISO()) return;
    const diffs = dailySolved(game);
    if (diffs.indexOf(diff) < 0) diffs.push(diff);
    dailyStore.setJSON(game, { date: date, diffs: diffs });
  }

  global.Gamekit = {
    mulberry32,
    hashStr,
    todayISO,
    dailySeed,
    randomSeed,
    shuffle,
    storage,
    fmtTime,
    wireDifficultyChips,
    onLongPress,
    gridKeys,
    puzzleClock,
    dailySolved,
    markDailySolved,
  };
})(window);
