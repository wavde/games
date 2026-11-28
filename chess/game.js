(function () {
  "use strict";

  // Minimal chess engine + minimax AI.
  // Board: 8x8 array. Pieces: {type:'p|n|b|r|q|k', color:'w|b'} or null.
  // Supports: basic moves, captures, castling, en passant, pawn auto-promote to queen.

  /* Use filled glyphs for both sides — styled via CSS for a chess.com-like look */
  const GLYPH = { w:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}, b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'} };
  const VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };

  // Piece-square tables (from white's perspective; flipped for black).
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
        5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
        5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40,
        -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
        -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
        -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  };

  function newBoard() {
    const b = Array.from({length:8},()=>Array(8).fill(null));
    const back = ['r','n','b','q','k','b','n','r'];
    for (let c=0;c<8;c++) {
      b[0][c] = { type: back[c], color: 'b' };
      b[1][c] = { type: 'p', color: 'b' };
      b[6][c] = { type: 'p', color: 'w' };
      b[7][c] = { type: back[c], color: 'w' };
    }
    return b;
  }

  function initialState() {
    return {
      board: newBoard(),
      turn: 'w',
      castling: { wK:true, wQ:true, bK:true, bQ:true },
      ep: null,
      halfmove: 0,       // 50-move rule (half-moves since last capture/pawn)
      positions: [],     // stack of position keys for threefold
      history: [],
    };
  }

  function positionKey(s) {
    let k = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      k += p ? (p.color + p.type) : '.';
    }
    k += '|' + s.turn + '|' +
      (s.castling.wK?'K':'') + (s.castling.wQ?'Q':'') +
      (s.castling.bK?'k':'') + (s.castling.bQ?'q':'') + '|' +
      (s.ep ? (s.ep.r + ',' + s.ep.c) : '-');
    return k;
  }

  const inb = (r,c) => r>=0&&c>=0&&r<8&&c<8;
  const opp = c => c === 'w' ? 'b' : 'w';

  function pieceMoves(s, r, c, attacksOnly=false) {
    const p = s.board[r][c];
    if (!p) return [];
    const moves = [];
    const add = (r2,c2,extra={}) => moves.push({from:[r,c], to:[r2,c2], ...extra});
    const dir = p.color === 'w' ? -1 : 1;
    const startRow = p.color === 'w' ? 6 : 1;
    const promoRow = p.color === 'w' ? 0 : 7;

    if (p.type === 'p') {
      if (!attacksOnly) {
        if (inb(r+dir,c) && !s.board[r+dir][c]) {
          add(r+dir, c, { promotion: r+dir===promoRow ? 'q' : null });
          if (r === startRow && !s.board[r+2*dir][c]) add(r+2*dir, c, { double: true });
        }
      }
      for (const dc of [-1,1]) {
        const nr = r+dir, nc = c+dc;
        if (!inb(nr,nc)) continue;
        const tgt = s.board[nr][nc];
        if (tgt && tgt.color !== p.color) add(nr, nc, { promotion: nr===promoRow ? 'q' : null });
        else if (attacksOnly) add(nr, nc);
        else if (s.ep && s.ep.r === nr && s.ep.c === nc) add(nr, nc, { enpassant: true });
      }
      return moves;
    }
    const slides = {
      n: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
      b: [[-1,-1],[-1,1],[1,-1],[1,1]],
      r: [[-1,0],[1,0],[0,-1],[0,1]],
      q: [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]],
      k: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
    };
    const sliding = p.type === 'b' || p.type === 'r' || p.type === 'q';
    for (const [dr,dc] of slides[p.type]) {
      let nr=r+dr, nc=c+dc;
      while (inb(nr,nc)) {
        const tgt = s.board[nr][nc];
        if (!tgt) add(nr,nc);
        else {
          if (tgt.color !== p.color) add(nr,nc);
          break;
        }
        if (!sliding) break;
        nr += dr; nc += dc;
      }
    }
    // Castling
    if (p.type === 'k' && !attacksOnly) {
      const row = p.color === 'w' ? 7 : 0;
      if (r === row && c === 4 && !inCheck(s, p.color)) {
        const rights = s.castling;
        if ((p.color === 'w' ? rights.wK : rights.bK) && !s.board[row][5] && !s.board[row][6]
            && s.board[row][7] && s.board[row][7].type === 'r') {
          if (!squareAttacked(s, row, 5, opp(p.color)) && !squareAttacked(s, row, 6, opp(p.color))) {
            add(row, 6, { castle: 'K' });
          }
        }
        if ((p.color === 'w' ? rights.wQ : rights.bQ) && !s.board[row][1] && !s.board[row][2] && !s.board[row][3]
            && s.board[row][0] && s.board[row][0].type === 'r') {
          if (!squareAttacked(s, row, 3, opp(p.color)) && !squareAttacked(s, row, 2, opp(p.color))) {
            add(row, 2, { castle: 'Q' });
          }
        }
      }
    }
    return moves;
  }

  function squareAttacked(s, r, c, by) {
    for (let i=0;i<8;i++) for (let j=0;j<8;j++) {
      const p = s.board[i][j];
      if (!p || p.color !== by) continue;
      const ms = pieceMoves(s, i, j, true);
      for (const m of ms) if (m.to[0]===r && m.to[1]===c) return true;
    }
    return false;
  }

  function findKing(s, color) {
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p = s.board[r][c];
      if (p && p.type==='k' && p.color===color) return [r,c];
    }
    return null;
  }

  function inCheck(s, color) {
    const k = findKing(s, color); if (!k) return false;
    return squareAttacked(s, k[0], k[1], opp(color));
  }

  function makeMove(s, m) {
    const p = s.board[m.from[0]][m.from[1]];
    const captured = s.board[m.to[0]][m.to[1]];
    const prev = {
      from: m.from, to: m.to, piece: {...p},
      captured: captured ? {...captured} : null,
      castling: {...s.castling}, ep: s.ep ? {...s.ep} : null,
      promotion: m.promotion || null, enpassant: !!m.enpassant, castle: m.castle || null,
      epCaptured: null, rookMove: null,
      halfmove: s.halfmove,
    };
    s.board[m.to[0]][m.to[1]] = p;
    s.board[m.from[0]][m.from[1]] = null;
    if (m.enpassant) {
      const epRow = p.color === 'w' ? m.to[0]+1 : m.to[0]-1;
      prev.epCaptured = { r: epRow, c: m.to[1], piece: {...s.board[epRow][m.to[1]]} };
      s.board[epRow][m.to[1]] = null;
    }
    if (m.promotion) s.board[m.to[0]][m.to[1]] = { type: m.promotion, color: p.color };
    if (m.castle) {
      const row = m.to[0];
      if (m.castle === 'K') {
        prev.rookMove = { from:[row,7], to:[row,5] };
        s.board[row][5] = s.board[row][7]; s.board[row][7] = null;
      } else {
        prev.rookMove = { from:[row,0], to:[row,3] };
        s.board[row][3] = s.board[row][0]; s.board[row][0] = null;
      }
    }
    // Update castling rights
    if (p.type === 'k') {
      if (p.color==='w') { s.castling.wK=false; s.castling.wQ=false; }
      else { s.castling.bK=false; s.castling.bQ=false; }
    }
    if (p.type === 'r') {
      if (p.color==='w' && m.from[0]===7 && m.from[1]===0) s.castling.wQ=false;
      if (p.color==='w' && m.from[0]===7 && m.from[1]===7) s.castling.wK=false;
      if (p.color==='b' && m.from[0]===0 && m.from[1]===0) s.castling.bQ=false;
      if (p.color==='b' && m.from[0]===0 && m.from[1]===7) s.castling.bK=false;
    }
    if (captured && captured.type === 'r') {
      if (m.to[0]===7 && m.to[1]===0) s.castling.wQ=false;
      if (m.to[0]===7 && m.to[1]===7) s.castling.wK=false;
      if (m.to[0]===0 && m.to[1]===0) s.castling.bQ=false;
      if (m.to[0]===0 && m.to[1]===7) s.castling.bK=false;
    }
    // EP target
    s.ep = null;
    if (m.double) {
      s.ep = { r: (m.from[0]+m.to[0])>>1, c: m.from[1] };
    }
    if (p.type === 'p' || captured || m.enpassant) s.halfmove = 0;
    else s.halfmove++;
    s.turn = opp(s.turn);
    s.history.push(prev);
    s.positions.push(positionKey(s));
    return prev;
  }

  function undoMove(s) {
    const h = s.history.pop(); if (!h) return;
    s.positions.pop();
    s.turn = opp(s.turn);
    s.castling = {...h.castling};
    s.ep = h.ep ? {...h.ep} : null;
    s.halfmove = h.halfmove || 0;
    s.board[h.from[0]][h.from[1]] = h.piece;
    s.board[h.to[0]][h.to[1]] = h.captured;
    if (h.enpassant && h.epCaptured) {
      s.board[h.epCaptured.r][h.epCaptured.c] = h.epCaptured.piece;
      s.board[h.to[0]][h.to[1]] = null;
    }
    if (h.castle && h.rookMove) {
      const rm = h.rookMove;
      s.board[rm.from[0]][rm.from[1]] = s.board[rm.to[0]][rm.to[1]];
      s.board[rm.to[0]][rm.to[1]] = null;
    }
  }

  function allLegal(s, color) {
    const out = [];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p = s.board[r][c];
      if (!p || p.color !== color) continue;
      for (const m of pieceMoves(s, r, c)) {
        makeMove(s, m);
        if (!inCheck(s, color)) out.push(m);
        undoMove(s);
      }
    }
    return out;
  }

  function evaluate(s) {
    let score = 0;
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p = s.board[r][c];
      if (!p) continue;
      const sq = p.color === 'w' ? (r*8+c) : ((7-r)*8+c);
      const pst = PST[p.type][sq];
      const v = VAL[p.type] + pst;
      score += p.color === 'w' ? v : -v;
    }
    return score;
  }

  function orderMoves(s, moves) {
    return moves.map(m => {
      const cap = s.board[m.to[0]][m.to[1]];
      const score = (cap ? 10*VAL[cap.type] - VAL[s.board[m.from[0]][m.from[1]].type] : 0) + (m.promotion ? 800 : 0);
      return { m, score };
    }).sort((a,b) => b.score - a.score).map(x => x.m);
  }

  function search(s, depth, alpha, beta) {
    if (depth === 0) return evaluate(s);
    const color = s.turn;
    const moves = orderMoves(s, allLegal(s, color));
    if (moves.length === 0) {
      if (inCheck(s, color)) return color === 'w' ? -99999 + (100-depth) : 99999 - (100-depth);
      return 0;
    }
    if (color === 'w') {
      let best = -Infinity;
      for (const m of moves) {
        makeMove(s, m);
        const val = search(s, depth-1, alpha, beta);
        undoMove(s);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        makeMove(s, m);
        const val = search(s, depth-1, alpha, beta);
        undoMove(s);
        if (val < best) best = val;
        if (best < beta) beta = best;
        if (alpha >= beta) break;
      }
      return best;
    }
  }

  function bestMove(s, depth) {
    const color = s.turn;
    const moves = orderMoves(s, allLegal(s, color));
    if (moves.length === 0) return null;
    let best = null;
    let bestScore = color === 'w' ? -Infinity : Infinity;
    for (const m of moves) {
      makeMove(s, m);
      const val = search(s, depth-1, -Infinity, Infinity);
      undoMove(s);
      if (color === 'w' ? val > bestScore : val < bestScore) {
        bestScore = val; best = m;
      }
    }
    return best;
  }

  // ---------- UI ----------
  const DEPTH = { easy: 1, medium: 2, hard: 3 };
  const MODES = ['ai-w', 'ai-b', 'local', 'online'];
  const COLOR = { w: 'White', b: 'Black' };
  const store = Gamekit.storage('chess:');
  const modeSel = document.getElementById('mode');
  const chipsEl = document.getElementById('chips');
  const undoBtn = document.getElementById('undo-btn');
  const statusEl = document.getElementById('status');
  const recordEl = document.getElementById('record');
  let diff = 'medium';
  let counted = false;   // this game's result is already in the record, so undo-and-replay can't add another
  let mode = store.get('mode', store.get('side', 'w') === 'b' ? 'ai-b' : 'ai-w');
  if (!MODES.includes(mode) || mode === 'online') mode = 'ai-w';
  modeSel.value = mode;

  let state = initialState();
  let humanColor = 'w';
  let flipped = false;
  let selected = null;
  let legalFromSel = [];
  let lastMove = null;
  let thinking = false;
  let over = false;
  // Online: the host plays White and moves first. "online" plays like "local" with one side remote.
  const twoPlayer = () => mode === 'local' || mode === 'online';
  const remoteTurn = () => mode === 'online' && (!link.connected() || state.turn !== humanColor);

  function turnStatus() {
    if (mode === 'online') {
      if (!link.connected()) return 'Online: waiting for your friend to join.';
      return state.turn === humanColor ? 'Your turn (' + COLOR[humanColor] + ').' : 'Your friend\'s turn…';
    }
    if (mode === 'local') return COLOR[state.turn] + ' to move.';
    return thinking ? 'AI thinking…' : (state.turn === humanColor ? 'Your move.' : 'AI to move.');
  }

  function renderBoard() {
    const el = document.getElementById('board');
    el.innerHTML = '';
    const rowsOrder = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const colsOrder = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    for (const r of rowsOrder) for (const c of colsOrder) {
      const d = document.createElement('div');
      d.className = 'sq ' + ((r+c)%2===0 ? 'light':'dark');
      d.setAttribute('role', 'button');
      const p = state.board[r][c];
      const NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
      d.setAttribute('aria-label', 'abcdefgh'[c] + (8 - r) + (p ? ', ' + (p.color === 'w' ? 'white ' : 'black ') + NAMES[p.type] : ''));
      if (p) {
        d.textContent = GLYPH[p.color][p.type];
        d.classList.add(p.color);
      }
      if (selected && selected[0]===r && selected[1]===c) d.classList.add('sel');
      if (lastMove && ((lastMove.from[0]===r && lastMove.from[1]===c) || (lastMove.to[0]===r && lastMove.to[1]===c))) d.classList.add('last');
      if (legalFromSel.some(m => m.to[0]===r && m.to[1]===c)) {
        d.classList.add(state.board[r][c] ? 'cap' : 'hint');
      }
      d.addEventListener('click', () => onSquare(r,c));
      el.appendChild(d);
    }
    if (over) return; // keep the result showing
    statusEl.textContent = turnStatus() + (inCheck(state, state.turn) ? ' — check!' : '');
  }

  // Plays a legal move for the side to move (a local tap or the friend's move online).
  function playMove(mv) {
    makeMove(state, mv);
    lastMove = mv;
    selected = null; legalFromSel = [];
    renderBoard();
    checkEnd();
  }

  function onSquare(r,c) {
    if (thinking || over || remoteTurn() || (!twoPlayer() && state.turn !== humanColor)) return;
    const mover = state.turn;
    const p = state.board[r][c];
    if (selected) {
      const mv = legalFromSel.find(m => m.to[0]===r && m.to[1]===c);
      if (mv) {
        playMove(mv);
        if (mode === 'online') link.send({ t: 'move', from: mv.from, to: mv.to, promotion: mv.promotion || null });
        if (!twoPlayer() && !thinking) setTimeout(aiTurn, 150);
        return;
      }
      if (p && p.color === mover) {
        selected = [r,c];
        legalFromSel = allLegal(state, mover).filter(m => m.from[0]===r && m.from[1]===c);
        renderBoard();
        return;
      }
      selected = null; legalFromSel = [];
      renderBoard();
      return;
    }
    if (p && p.color === mover) {
      selected = [r,c];
      legalFromSel = allLegal(state, mover).filter(m => m.from[0]===r && m.from[1]===c);
      renderBoard();
    }
  }

  let aiTimer = null;
  function cancelAI() { if (aiTimer !== null) { clearTimeout(aiTimer); aiTimer = null; } thinking = false; }

  function aiTurn() {
    if (twoPlayer() || over || state.turn === humanColor) return;
    if (checkEnd()) return;
    thinking = true;
    renderBoard();
    aiTimer = setTimeout(() => {
      aiTimer = null;
      if (twoPlayer() || state.turn === humanColor) { thinking = false; renderBoard(); return; }
      const depth = DEPTH[diff];
      const m = bestMove(state, depth);
      if (m) { makeMove(state, m); lastMove = m; }
      thinking = false;
      renderBoard();
      checkEnd();
    }, 20);
  }

  function insufficientMaterial(s) {
    const pieces = { w: [], b: [] };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = s.board[r][c];
      if (!p) continue;
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
      pieces[p.color].push({ t: p.type, sq: (r + c) % 2 });
    }
    const w = pieces.w.filter(p => p.t !== 'k');
    const b = pieces.b.filter(p => p.t !== 'k');
    // K v K
    if (w.length === 0 && b.length === 0) return true;
    // K+minor v K
    if (w.length === 1 && b.length === 0 && (w[0].t === 'n' || w[0].t === 'b')) return true;
    if (b.length === 1 && w.length === 0 && (b[0].t === 'n' || b[0].t === 'b')) return true;
    // K+B v K+B with same-color bishops
    if (w.length === 1 && b.length === 1 && w[0].t === 'b' && b[0].t === 'b' && w[0].sq === b[0].sq) return true;
    return false;
  }

  function threefold(s) {
    const key = s.positions[s.positions.length - 1];
    if (!key) return false;
    let c = 0;
    for (const k of s.positions) if (k === key) c++;
    return c >= 3;
  }

  function showRecord() {
    const rec = store.getJSON('rec:' + diff, null) || { w: 0, d: 0, l: 0 };
    recordEl.textContent = rec.w + (rec.w === 1 ? ' win' : ' wins') + ' · ' + rec.d + (rec.d === 1 ? ' draw' : ' draws') + ' · ' + rec.l + (rec.l === 1 ? ' loss' : ' losses');
  }

  // result: 'w' | 'd' | 'l' from this player's side; only games vs the AI are recorded, once each.
  function finish(msg, result) {
    statusEl.textContent = '';
    const span = document.createElement('span');
    span.className = result === 'w' ? 'ok' : result === 'l' ? 'bad' : 'hot';
    span.textContent = msg;
    statusEl.appendChild(span);
    over = true;
    thinking = true; // freeze interaction
    if (counted || twoPlayer()) return;
    counted = true;
    const rec = store.getJSON('rec:' + diff, null) || { w: 0, d: 0, l: 0 };
    rec[result] = (rec[result] || 0) + 1;
    store.setJSON('rec:' + diff, rec);
    showRecord();
  }

  function checkEnd() {
    const moves = allLegal(state, state.turn);
    if (moves.length === 0) {
      if (!inCheck(state, state.turn)) finish('Stalemate — draw.', 'd');
      else if (mode === 'local') finish(`Checkmate — ${COLOR[opp(state.turn)]} wins.`, 'w');
      else if (mode === 'online') finish(state.turn === humanColor ? 'Checkmate — Your friend wins.' : 'Checkmate — You win.', state.turn === humanColor ? 'l' : 'w');
      else finish(`Checkmate — ${COLOR[opp(state.turn)]} wins.`, state.turn === humanColor ? 'l' : 'w');
      return true;
    }
    if (state.halfmove >= 100) { finish('Draw — 50-move rule.', 'd'); return true; }
    if (threefold(state)) { finish('Draw — threefold repetition.', 'd'); return true; }
    if (insufficientMaterial(state)) { finish('Draw — insufficient material.', 'd'); return true; }
    return false;
  }

  function newGame() {
    cancelAI();
    state = initialState();
    selected = null; legalFromSel = []; lastMove = null;
    counted = false; over = false;
    humanColor = mode === 'ai-b' || (mode === 'online' && link.role() === 'guest') ? 'b' : 'w';
    flipped = humanColor === 'b';
    renderBoard();
    if (mode === 'ai-b') {
      statusEl.textContent = 'AI is thinking…';
      aiTimer = setTimeout(() => { aiTimer = null; aiTurn(); }, 200);
    }
  }

  document.getElementById('new-btn').addEventListener('click', () => {
    if (mode === 'online' && !link.connected()) return;
    newGame();
    if (mode === 'online') link.send({ t: 'new' });
  });

  undoBtn.addEventListener('click', () => {
    if (mode === 'online' || state.history.length === 0) return;
    cancelAI();
    over = false;
    undoMove(state);
    if (!twoPlayer() && state.turn !== humanColor && state.history.length > 0) undoMove(state);
    lastMove = null; selected = null; legalFromSel = [];
    renderBoard();
    if (!twoPlayer() && state.turn !== humanColor) aiTimer = setTimeout(() => { aiTimer = null; aiTurn(); }, 200);
  });

  document.getElementById('flip-btn').addEventListener('click', () => { flipped = !flipped; renderBoard(); });

  function applyMode() {
    chipsEl.hidden = twoPlayer();
    recordEl.parentElement.hidden = twoPlayer();
    undoBtn.disabled = mode === 'online';
    newGame();
  }

  function setMode(m) {
    if (mode === 'online' && m !== 'online') link.leave();
    mode = m;
    modeSel.value = m;
    if (m !== 'online') store.set('mode', m);
    applyMode();
  }
  modeSel.addEventListener('change', () => {
    setMode(modeSel.value);
    if (mode === 'online') link.host();
  });

  const link = Net.attach({
    container: document.querySelector('.game-controls'),
    onJoin: () => setMode('online'),
    onOpen: () => applyMode(),
    onMessage: (msg) => {
      if (mode !== 'online') return;
      if (msg.t === 'new') { newGame(); return; }
      if (msg.t !== 'move') return;
      const from = msg.from || [], to = msg.to || [];
      const mv = !over && state.turn !== humanColor && allLegal(state, state.turn).find(m =>
        m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1] && (m.promotion || null) === (msg.promotion || null));
      if (mv) playMove(mv);
      else statusEl.textContent = 'Out of sync — press new game.';
    },
    onClose: () => { mode = 'local'; setMode('local'); }, // keep the "friend left" note showing
    onLeave: () => setMode('local'),
  });

  diff = Gamekit.wireDifficultyChips({
    el: chipsEl,
    difficulties: ['easy', 'medium', 'hard'],
    initial: diff,
    storage: store,
    storageKey: 'diff',
    onChange: (d) => { diff = d; showRecord(); newGame(); },
  }).get();
  showRecord();
  applyMode();

  Gamekit.gridKeys(document.getElementById('board'), { selector: '.sq' });
})();
