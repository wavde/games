const EMOJI = ['🍎','🍌','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🍉','🥭','🍋','🥑','🌽','🥕','🍆','🥦','🧄','🧅','🥔','🌶️','🫐','🍊','🍐','🍈','🍏','🫒','🥜','🌰','🍠','🥐','🥖'];
const store = Gamekit.storage('memory:');
let size, cards, flipped, matched, moves, startTime, timerId, locked;

function reset() {
  size = +document.getElementById('size').value;
  const n = size*size;
  const pairs = n/2;
  const chosen = EMOJI.slice().sort(()=>Math.random()-0.5).slice(0, pairs);
  cards = chosen.concat(chosen).sort(()=>Math.random()-0.5).map((e,i)=>({id:i, emoji:e, flipped:false, matched:false}));
  flipped = []; matched = 0; moves = 0; locked = false;
  document.getElementById('moves').textContent = 0;
  document.getElementById('time').textContent = 0;
  document.getElementById('status').textContent = 'Flip two. Match all pairs.';
  const best = store.getInt('best:' + size, null);
  document.getElementById('best').textContent = best !== null ? best + 's' : '—';
  clearInterval(timerId); timerId = null; startTime = null;
  render();
}

function startTimer() {
  startTime = Date.now();
  timerId = setInterval(() => {
    document.getElementById('time').textContent = Math.floor((Date.now()-startTime)/1000);
  }, 250);
}

function render() {
  const el = document.getElementById('board');
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  el.replaceChildren();
  cards.forEach(c => {
    const d = document.createElement('div');
    d.className = 'card' + (c.flipped?' flip':'') + (c.matched?' match':'');
    d.setAttribute('role', 'button');
    d.setAttribute('tabindex', '0');
    d.setAttribute('aria-label', c.matched || c.flipped ? c.emoji : 'Face-down card');
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = c.emoji;
    d.appendChild(face);
    const handler = () => flip(c);
    d.addEventListener('click', handler);
    d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    el.appendChild(d);
  });
}

function flip(c) {
  if (locked || c.flipped || c.matched) return;
  if (!startTime) startTimer();
  c.flipped = true;
  flipped.push(c);
  render();
  if (flipped.length === 2) {
    moves++;
    document.getElementById('moves').textContent = moves;
    const [a,b] = flipped;
    if (a.emoji === b.emoji) {
      a.matched = b.matched = true;
      matched += 2;
      flipped = [];
      render();
      if (matched === cards.length) finish();
    } else {
      locked = true;
      setTimeout(() => {
        a.flipped = b.flipped = false;
        flipped = []; locked = false;
        render();
      }, 650);
    }
  }
}

function finish() {
  clearInterval(timerId);
  timerId = null;
  const secs = Math.floor((Date.now()-startTime)/1000);
  const prev = store.getInt('best:' + size, null);
  if (prev === null || secs < prev) store.set('best:' + size, secs);
  const newBest = store.getInt('best:' + size, null);
  document.getElementById('best').textContent = newBest !== null ? newBest + 's' : '—';
  document.getElementById('status').textContent = `Done in ${moves} moves, ${secs}s 🎉`;
}

document.getElementById('reset').addEventListener('click', reset);
document.getElementById('size').addEventListener('change', reset);
reset();
