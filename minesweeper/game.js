const DIFFS = { easy:[9,9,10], medium:[16,16,40], hard:[20,20,80] };
let W,H,M, cells, mines, revealed, flags, over, won, firstClick;

function idx(r,c){ return r*W+c; }
function inb(r,c){ return r>=0&&c>=0&&r<H&&c<W; }
function neigh(r,c){ const a=[]; for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if((dr||dc)&&inb(r+dr,c+dc)) a.push([r+dr,c+dc]); return a; }

function reset() {
  const d = document.getElementById('diff').value;
  [H,W,M] = DIFFS[d];
  cells = new Int8Array(H*W);
  mines = new Uint8Array(H*W);
  revealed = new Uint8Array(H*W);
  flags = new Uint8Array(H*W);
  over = false; won = false; firstClick = true;
  document.getElementById('status').textContent = 'Click to reveal.';
  render();
  updateHud();
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
  document.getElementById('mines').textContent = `${M - flagged} mines left`;
  if (over) document.getElementById('status').textContent = won ? 'You won! 🎉' : 'Boom. 💥';
}

function render() {
  const el = document.getElementById('board');
  el.style.gridTemplateColumns = `repeat(${W}, 28px)`;
  el.style.gridTemplateRows = `repeat(${H}, 28px)`;
  el.replaceChildren();
  for (let r=0;r<H;r++) for (let c=0;c<W;c++) {
    const i = idx(r,c);
    const d = document.createElement('div');
    d.className = 'c';
    d.setAttribute('role', 'gridcell');
    d.setAttribute('aria-label', `row ${r+1} col ${c+1}`);
    if (flags[i]) { d.classList.add('flag'); d.textContent = '⚑'; }
    else if (revealed[i]) {
      d.classList.add('open');
      if (cells[i] === -1) { d.classList.add('mine'); d.textContent = '✷'; }
      else if (cells[i] > 0) { d.textContent = cells[i]; d.classList.add('n'+cells[i]); }
    } else if (over && mines[i]) { d.classList.add('mine'); d.textContent = '✷'; }
    d.dataset.r = r; d.dataset.c = c;
    el.appendChild(d);
  }
}

function click(r,c) {
  if (over) return;
  const i = idx(r,c);
  if (flags[i]) return;
  if (firstClick) { placeMines(r,c); firstClick = false; }
  reveal(r,c);
  checkWin();
  render(); updateHud();
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

document.getElementById('reset').addEventListener('click', reset);
document.getElementById('diff').addEventListener('change', reset);
reset();
