import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var tetGrid, tetPiece, tetX, tetY, tetW, tetH, tetScore, tetStep, tetBoardW, tetBoardH, tetOff;
var PIECES = [
  [[1,1,1,1]], // I
  [[1,1],[1,1]], // O
  [[0,1,0],[1,1,1]], // T
  [[1,0],[1,0],[1,1]], // L
  [[0,1],[0,1],[1,1]], // J
  [[0,1,1],[1,1,0]], // S
  [[1,1,0],[0,1,1]]  // Z
];
var PHUES = [180, 60, 280, 30, 210, 120, 0];
function initTetris() {
  tetW = state.COLS; tetH = state.ROWS;
  tetBoardW = 10; tetBoardH = tetH - 2;
  tetOff = ((tetW - tetBoardW * 2) / 2) | 0;
  tetGrid = new Uint8Array(tetBoardW * tetBoardH);
  tetScore = 0; tetStep = 0;
  spawnPiece();
}
function spawnPiece() {
  var idx = (Math.random() * PIECES.length) | 0;
  tetPiece = { shape: PIECES[idx], hue: PHUES[idx], idx: idx };
  tetX = ((tetBoardW - tetPiece.shape[0].length) / 2) | 0;
  tetY = 0;
}
function collides(shape, px, py) {
  for (var r = 0; r < shape.length; r++) for (var c = 0; c < shape[r].length; c++) {
    if (!shape[r][c]) continue;
    var nx = px + c, ny = py + r;
    if (nx < 0 || nx >= tetBoardW || ny >= tetBoardH) return true;
    if (ny >= 0 && tetGrid[ny * tetBoardW + nx]) return true;
  }
  return false;
}
function lockPiece() {
  var s = tetPiece.shape;
  for (var r = 0; r < s.length; r++) for (var c = 0; c < s[r].length; c++) {
    if (!s[r][c]) continue;
    var ny = tetY + r;
    if (ny >= 0 && ny < tetBoardH) tetGrid[ny * tetBoardW + tetX + c] = tetPiece.idx + 1;
  }
  // Clear lines
  for (var y = tetBoardH - 1; y >= 0; y--) {
    var full = true;
    for (var x = 0; x < tetBoardW; x++) if (!tetGrid[y * tetBoardW + x]) { full = false; break; }
    if (full) {
      for (var yy = y; yy > 0; yy--) for (var x = 0; x < tetBoardW; x++) tetGrid[yy*tetBoardW+x] = tetGrid[(yy-1)*tetBoardW+x];
      for (var x = 0; x < tetBoardW; x++) tetGrid[x] = 0;
      tetScore++; y++;
    }
  }
  spawnPiece();
  if (collides(tetPiece.shape, tetX, tetY)) initTetris();
}
function renderTetris() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!tetGrid || tetW !== W || tetH !== H) initTetris();
  var curStep = (state.time * 5) | 0;
  if (curStep > tetStep) {
    tetStep = curStep;
    // Auto-play: random moves
    if (Math.random() < 0.3) { var nx = tetX + (Math.random() < 0.5 ? -1 : 1); if (!collides(tetPiece.shape, nx, tetY)) tetX = nx; }
    if (!collides(tetPiece.shape, tetX, tetY + 1)) tetY++; else lockPiece();
  }
  // Draw board border
  for (var y = 0; y < tetBoardH; y++) {
    drawCharHSL('|', tetOff - 1, y + 1, 0, 0, 25);
    drawCharHSL('|', tetOff + tetBoardW * 2, y + 1, 0, 0, 25);
  }
  for (var x = -1; x <= tetBoardW * 2; x++) drawCharHSL('-', tetOff + x, tetBoardH + 1, 0, 0, 25);
  // Draw grid
  for (var y = 0; y < tetBoardH; y++) for (var x = 0; x < tetBoardW; x++) {
    var v = tetGrid[y * tetBoardW + x];
    if (v) {
      drawCharHSL('#', tetOff + x * 2, y + 1, PHUES[v-1], 70, 35);
      drawCharHSL('#', tetOff + x * 2 + 1, y + 1, PHUES[v-1], 70, 35);
    }
  }
  // Draw current piece
  if (tetPiece) {
    var s = tetPiece.shape;
    for (var r = 0; r < s.length; r++) for (var c = 0; c < s[r].length; c++) {
      if (!s[r][c]) continue;
      var px = tetOff + (tetX + c) * 2, py = tetY + r + 1;
      if (py >= 0 && py < H) {
        drawCharHSL('#', px, py, tetPiece.hue, 80, 50);
        drawCharHSL('#', px + 1, py, tetPiece.hue, 80, 50);
      }
    }
  }
  // Score
  var scoreStr = 'LINES: ' + tetScore;
  for (var i = 0; i < scoreStr.length; i++) drawCharHSL(scoreStr[i], tetOff + tetBoardW * 2 + 3 + i, 3, 0, 0, 40);
}
registerMode('tetris', { init: initTetris, render: renderTetris });
