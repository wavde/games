const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

let board, human, ai, turn, gameOver;

function winner(b) {
  for (const [a,c,d] of LINES) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line: [a,c,d] };
  }
  if (b.every(x => x)) return { player: 'draw', line: [] };
  return null;
}

function minimax(b, player) {
  const w = winner(b);
  if (w) {
    if (w.player === ai) return { score: 1 };
    if (w.player === human) return { score: -1 };
    return { score: 0 };
  }
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = player;
      const res = minimax(b, player === 'X' ? 'O' : 'X');
      moves.push({ idx: i, score: res.score });
      b[i] = null;
    }
  }
  if (player === ai) return moves.reduce((a, m) => m.score > a.score ? m : a, { score: -Infinity });
  return moves.reduce((a, m) => m.score < a.score ? m : a, { score: Infinity });
}

function render(winInfo) {
  const el = document.getElementById('board');
  el.innerHTML = '';
  board.forEach((v, i) => {
    const c = document.createElement('div');
    c.className = 'cell' + (v ? ' taken ' + v.toLowerCase() : '') + (winInfo && winInfo.line.includes(i) ? ' win' : '');
    c.textContent = v || '';
    c.addEventListener('click', () => play(i));
    el.appendChild(c);
  });
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }

function play(i) {
  if (gameOver || board[i] || turn !== human) return;
  board[i] = human;
  let w = winner(board);
  render(w);
  if (w) return end(w);
  turn = ai;
  setStatus('AI thinking…');
  setTimeout(aiMove, 200);
}

function aiMove() {
  const move = minimax(board.slice(), ai);
  board[move.idx] = ai;
  const w = winner(board);
  render(w);
  if (w) return end(w);
  turn = human;
  setStatus(`Your turn (${human}).`);
}

function end(w) {
  gameOver = true;
  if (w.player === 'draw') setStatus("Draw.");
  else if (w.player === human) setStatus("You win! 🎉");
  else setStatus("AI wins.");
}

function reset() {
  board = Array(9).fill(null);
  gameOver = false;
  turn = 'X';
  render(null);
  if (human === 'O') { setStatus('AI thinking…'); setTimeout(aiMove, 200); }
  else setStatus(`Your turn (${human}).`);
}

document.getElementById('reset').addEventListener('click', reset);
document.getElementById('toggle').addEventListener('click', () => {
  human = human === 'X' ? 'O' : 'X';
  ai = human === 'X' ? 'O' : 'X';
  document.getElementById('toggle').textContent = `Play as ${human === 'X' ? 'O' : 'X'}`;
  reset();
});

human = 'X'; ai = 'O';
reset();
