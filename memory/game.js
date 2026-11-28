(function () {
  "use strict";

  const EMOJI = ['🍎','🍌','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🍉','🥭','🍋','🥑','🌽','🥕','🍆','🥦','🧄','🧅','🥔','🌶️','🫐','🍊','🍐','🍈','🍏','🫒','🥜','🌰','🍠','🥐','🥖'];
  /* 32 distinct hues so every pair gets its own tinted background */
  const PAIR_COLORS = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e84393',
    '#d35400','#27ae60','#2980b9','#8e44ad','#c0392b','#16a085','#f39c12','#6c5ce7',
    '#00b894','#fd79a8','#0984e3','#e17055','#636e72','#a29bfe','#55efc4','#fab1a0',
    '#74b9ff','#dfe6e9','#ffeaa7','#81ecec','#ff7675','#fdcb6e','#b2bec3','#6ab04c',
  ];
  const store = Gamekit.storage('memory:');
  const SIZES = { easy: 4, medium: 6, hard: 8 };
  const fmt = Gamekit.fmtTime;
  let diff = 'medium';
  let size, cards, flipped, matched, moves, startTime, timerId, locked;

  function showBest() {
    const best = store.getInt('best:' + size, null);
    document.getElementById('best').textContent = best !== null ? fmt(best) : '—';
  }

  function reset() {
    size = SIZES[diff];
    const n = size*size;
    const pairs = n/2;
    const shuffled = EMOJI.map((e,i)=>({emoji:e,color:PAIR_COLORS[i]})).sort(()=>Math.random()-0.5).slice(0, pairs);
    cards = shuffled.concat(shuffled).sort(()=>Math.random()-0.5).map((e,i)=>({id:i, emoji:e.emoji, color:e.color, flipped:false, matched:false}));
    flipped = []; matched = 0; moves = 0; locked = false;
    document.getElementById('moves').textContent = 0;
    document.getElementById('time').textContent = fmt(0);
    document.getElementById('status').textContent = 'Flip two. Match all pairs.';
    showBest();
    clearInterval(timerId); timerId = null; startTime = null;
    render();
  }

  function startTimer() {
    startTime = Date.now();
    timerId = setInterval(() => {
      document.getElementById('time').textContent = fmt((Date.now()-startTime)/1000);
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
      if (c.flipped || c.matched) d.style.background = c.color + '22';
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', c.matched || c.flipped ? c.emoji : 'Face-down card');
      const face = document.createElement('span');
      face.className = 'face';
      face.textContent = c.emoji;
      d.appendChild(face);
      const handler = () => flip(c);
      d.addEventListener('click', handler);
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
    showBest();
    document.getElementById('time').textContent = fmt(secs);
    const status = document.getElementById('status');
    status.textContent = '';
    const done = document.createElement('span');
    done.className = 'ok';
    done.textContent = `Done in ${moves} moves, ${fmt(secs)}` + (prev === null || secs < prev ? ' · new best! 🎉' : ' 🎉');
    status.appendChild(done);
  }

  document.getElementById('new-btn').addEventListener('click', reset);
  diff = Gamekit.wireDifficultyChips({
    el: document.getElementById('chips'),
    difficulties: ['easy', 'medium', 'hard'],
    initial: diff,
    storage: store,
    storageKey: 'diff',
    onChange: (d) => { diff = d; reset(); },
  }).get();
  reset();

  Gamekit.gridKeys(document.getElementById('board'), { selector: '.card' });
})();
