const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const N = 20;
const CELL = canvas.width / N;
const BEST_KEY = 'snake_best';

let snake, dir, nextDir, food, score, alive, paused, tickMs, lastTick;

function reset() {
  snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
  dir = {x:1,y:0};
  nextDir = dir;
  score = 0;
  alive = true;
  paused = false;
  tickMs = 110;
  placeFood();
  updateHud();
}

function placeFood() {
  while (true) {
    const f = {x: Math.floor(Math.random()*N), y: Math.floor(Math.random()*N)};
    if (!snake.some(s => s.x===f.x && s.y===f.y)) { food = f; return; }
  }
}

function updateHud() {
  document.getElementById('score').textContent = score;
  document.getElementById('best').textContent = localStorage.getItem(BEST_KEY) || 0;
}

function step() {
  if (!alive || paused) return;
  dir = nextDir;
  const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
  if (head.x<0||head.x>=N||head.y<0||head.y>=N||snake.some(s=>s.x===head.x&&s.y===head.y)) {
    alive = false;
    document.getElementById('status').textContent = 'Game over. Press New game.';
    const best = +(localStorage.getItem(BEST_KEY) || 0);
    if (score > best) localStorage.setItem(BEST_KEY, score);
    updateHud();
    return;
  }
  snake.unshift(head);
  if (head.x===food.x && head.y===food.y) {
    score++;
    if (tickMs > 60) tickMs -= 2;
    placeFood();
    updateHud();
  } else {
    snake.pop();
  }
}

function draw() {
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#ff6b6b';
  ctx.fillRect(food.x*CELL+2, food.y*CELL+2, CELL-4, CELL-4);
  snake.forEach((s,i) => {
    ctx.fillStyle = i===0 ? '#8affc1' : '#6ea8ff';
    ctx.fillRect(s.x*CELL+1, s.y*CELL+1, CELL-2, CELL-2);
  });
  if (paused && alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', canvas.width/2, canvas.height/2);
  }
}

function loop(t) {
  if (!lastTick) lastTick = t;
  if (t - lastTick >= tickMs) { step(); lastTick = t; }
  draw();
  requestAnimationFrame(loop);
}

const KEYS = {
  ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0},
  w:{x:0,y:-1}, s:{x:0,y:1}, a:{x:-1,y:0}, d:{x:1,y:0},
  W:{x:0,y:-1}, S:{x:0,y:1}, A:{x:-1,y:0}, D:{x:1,y:0},
};

window.addEventListener('keydown', e => {
  if (e.key === ' ') { paused = !paused; e.preventDefault(); return; }
  const k = KEYS[e.key];
  if (!k) return;
  if (k.x === -dir.x && k.y === -dir.y) return;
  nextDir = k;
  e.preventDefault();
});

// Touch swipe
let tStart = null;
canvas.addEventListener('touchstart', e => { tStart = e.touches[0]; }, {passive: true});
canvas.addEventListener('touchend', e => {
  if (!tStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - tStart.clientX;
  const dy = t.clientY - tStart.clientY;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20 && dir.x !== -1) nextDir = {x:1,y:0};
    else if (dx < -20 && dir.x !== 1) nextDir = {x:-1,y:0};
  } else {
    if (dy > 20 && dir.y !== -1) nextDir = {x:0,y:1};
    else if (dy < -20 && dir.y !== 1) nextDir = {x:0,y:-1};
  }
  tStart = null;
});

document.getElementById('reset').addEventListener('click', () => {
  reset();
  document.getElementById('status').textContent = 'Go!';
});

reset();
requestAnimationFrame(loop);
