(function () {
  "use strict";

  const DIFFS = { easy:[9,9,10], medium:[16,16,40], hard:[20,20,80] };
  const store = Gamekit.storage('minesweeper:');
  const fmt = Gamekit.fmtTime;
  // Phones start on the small board; a stored choice still wins.
  let diff = window.matchMedia('(max-width: 560px)').matches ? 'easy' : 'medium';
  let W,H,M, cells, mines, revealed, flags, over, won, firstClick;
  let timerStart = 0, timerId = null, elapsed = 0;

  function idx(r,c){ return r*W+c; }
  function inb(r,c){ return r>=0&&c>=0&&r<H&&c<W; }
  function neigh(r,c){ const a=[]; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if((dr||dc)&&inb(r+dr,c+dc)) a.push([r+dr,c+dc]); return a; }

  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer() {
    stopTimer();
    timerStart = Date.now();
    elapsed = 0;
    document.getElementById('time').textContent = fmt(0);
    timerId = setInterval(() => {
      elapsed = Math.floor((Date.now() - timerStart) / 1000);
      document.getElementById('time').textContent = fmt(elapsed);
    }, 500);
  }

  function getRecord() {
    const rec = store.getJSON('rec:' + diff, null);
    return rec && typeof rec === 'object' ? { won: rec.won | 0, played: rec.played | 0 } : { won: 0, played: 0 };
  }

  function showStats() {
    const best = store.getInt('best:' + diff, null);
    document.getElementById('best').textContent = best === null ? '—' : fmt(best);
    const rec = getRecord();
    document.getElementById('record').textContent = rec.won + '/' + rec.played;
  }

  function reset() {
    [H,W,M] = DIFFS[diff];
    cells = new Int8Array(H*W);
    mines = new Uint8Array(H*W);
    revealed = new Uint8Array(H*W);
    flags = new Uint8Array(H*W);
    over = false; won = false; firstClick = true;
    stopTimer();
    elapsed = 0;
    document.getElementById('time').textContent = fmt(0);
    document.getElementById('status').textContent = 'Tap to reveal. Long-press (or right-click) to flag.';
    render();
    updateHud();
    showStats();
  }

  function placeMines(safeR, safeC) {
    const safe = new Set();
    safe.add(idx(safeR,safeC));
    neigh(safeR,safeC).forEach(([r,c])=>safe.add(idx(r,c)));
    let placed = 0;
    while (placed < M) {
      const i = Math.floor(Math.random()*H*W);
      if (mines[i] || safe.has(i)) continue;
      mines[i] = 1; placed++;
    }
    for (let r=0;r<H;r++) for (let c=0;c<W;c++) {
      if (mines[idx(r,c)]) { cells[idx(r,c)] = -1; continue; }
      let n=0; neigh(r,c).forEach(([nr,nc])=>{ if (mines[idx(nr,nc)]) n++; });
      cells[idx(r,c)] = n;
    }
  }

  function reveal(r,c) {
    const i = idx(r,c);
    if (revealed[i] || flags[i]) return;
    revealed[i] = 1;
    if (cells[i] === -1) { over = true; return; }
    if (cells[i] === 0) neigh(r,c).forEach(([nr,nc])=>reveal(nr,nc));
  }

  function checkWin() {
    let safeLeft = 0;
    for (let i=0;i<H*W;i++) if (!mines[i] && !revealed[i]) safeLeft++;
    if (safeLeft === 0) { won = true; over = true; }
  }

  function updateHud() {
    let flagged=0; for (let i=0;i<H*W;i++) if (flags[i]) flagged++;
    document.getElementById('mines').textContent = String(M - flagged);
    if (over) {
      const st = document.getElementById('status');
      st.textContent = '';
      const span = document.createElement('span');
      span.className = won ? 'ok' : 'bad';
      span.textContent = won ? 'You won in ' + fmt(elapsed) + '! 🎉' : 'Boom. 💥';
      st.appendChild(span);
    }
  }

  // Cells fill the panel up to 32px but never drop below 24px (a usable tap target);
  // a board that still doesn't fit scrolls inside its own frame.
  function cellSize(el) {
    const panel = el.parentElement, ps = getComputedStyle(panel), bs = getComputedStyle(el);
    const avail = Math.min(panel.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight), 640);
    const chrome = parseFloat(bs.paddingLeft) + parseFloat(bs.paddingRight) + parseFloat(bs.borderLeftWidth) + parseFloat(bs.borderRightWidth);
    const gap = parseFloat(bs.columnGap) || 0;
    return Math.max(24, Math.min(32, Math.floor((avail - chrome - gap * (W - 1)) / W)));
  }

  function render() {
    const el = document.getElementById('board');
    const sz = cellSize(el);
    el.style.gridTemplateColumns = `repeat(${W}, ${sz}px)`;
    el.style.gridTemplateRows = `repeat(${H}, ${sz}px)`;
    el.replaceChildren();
    el.style.fontSize = sz < 26 ? '0.75rem' : sz < 30 ? '0.9rem' : '1rem';
    for (let r=0;r<H;r++) for (let c=0;c<W;c++) {
      const i = idx(r,c);
      const d = document.createElement('div');
      d.className = 'c';
      d.setAttribute('role', 'button');
      let state = 'hidden';
      if (flags[i]) { d.classList.add('flag'); d.textContent = '⚑'; state = 'flagged'; }
      else if (revealed[i]) {
        d.classList.add('open');
        state = 'empty';
        if (cells[i] === -1) { d.classList.add('mine'); d.textContent = '✷'; state = 'mine'; }
        else if (cells[i] > 0) { d.textContent = cells[i]; d.classList.add('n'+cells[i]); state = String(cells[i]); }
      } else if (over && mines[i]) { d.classList.add('mine'); d.textContent = '✷'; state = 'mine'; }
      d.setAttribute('aria-label', `row ${r+1} col ${c+1}, ${state}`);
      d.dataset.r = r; d.dataset.c = c;
      el.appendChild(d);
    }
  }

  function click(r,c) {
    if (over) return;
    const i = idx(r,c);
    if (flags[i]) return;
    if (firstClick) {
      placeMines(r,c); firstClick = false; startTimer();
      const rec = getRecord();
      rec.played++;
      store.setJSON('rec:' + diff, rec);
    }
    reveal(r,c);
    checkWin();
    if (over) {
      stopTimer();
      elapsed = Math.floor((Date.now() - timerStart) / 1000);
      document.getElementById('time').textContent = fmt(elapsed);
      if (won) {
        const rec = getRecord();
        rec.won++;
        store.setJSON('rec:' + diff, rec);
        const best = store.getInt('best:' + diff, null);
        if (best === null || elapsed < best) store.set('best:' + diff, elapsed);
      }
    }
    render(); updateHud(); showStats();
  }

  function flag(r,c) {
    if (over) return;
    const i = idx(r,c);
    if (revealed[i]) return;
    flags[i] ^= 1;
    render(); updateHud();
  }

  // Delegated events on the board — single set of listeners, no leaks.
  const boardEl = document.getElementById('board');
  let pressTimer = null, longPressed = false;
  function cellAt(target) {
    const d = target.closest('.c');
    if (!d || !d.dataset) return null;
    return { r: +d.dataset.r, c: +d.dataset.c };
  }
  boardEl.addEventListener('click', e => {
    if (longPressed) { longPressed = false; return; }
    const p = cellAt(e.target); if (p) click(p.r, p.c);
  });
  boardEl.addEventListener('contextmenu', e => {
    e.preventDefault();
    const p = cellAt(e.target); if (p) flag(p.r, p.c);
  });
  boardEl.addEventListener('touchstart', e => {
    const p = cellAt(e.target); if (!p) return;
    longPressed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { longPressed = true; flag(p.r, p.c); pressTimer = null; }, 400);
  }, { passive: true });
  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  boardEl.addEventListener('touchend', cancelPress);
  boardEl.addEventListener('touchcancel', cancelPress);
  boardEl.addEventListener('touchmove', cancelPress, { passive: true });

  document.getElementById('new-btn').addEventListener('click', reset);
  diff = Gamekit.wireDifficultyChips({
    el: document.getElementById('chips'),
    difficulties: ['easy', 'medium', 'hard'],
    initial: diff,
    storage: store,
    storageKey: 'diff',
    onChange: (d) => { diff = d; reset(); },
  }).get();
  window.addEventListener('resize', () => { if (!over) render(); });
  reset();

  Gamekit.gridKeys(boardEl, { selector: '.c', onSecondary: (el) => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) });
})();
