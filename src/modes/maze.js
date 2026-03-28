import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mazeGrid, mazeW, mazeH, mazeStack, mazeGenDone, mazeSolvePath, mazeSolveIdx;
var mazeCurX, mazeCurY, mazeStart, mazeEnd, mazeFrameCount;
function initMaze() {
  mazeW = Math.floor(state.COLS / 2);
  mazeH = Math.floor(state.ROWS / 2);
  if (mazeW < 3) mazeW = 3;
  if (mazeH < 3) mazeH = 3;
  mazeGrid = new Uint8Array(mazeW * mazeH); // 0=wall, 1=passage, 2=visited-solve, 3=solution
  mazeCurX = 1; mazeCurY = 1;
  mazeGrid[mazeCurY * mazeW + mazeCurX] = 1;
  mazeStack = [{x: mazeCurX, y: mazeCurY}];
  mazeGenDone = false;
  mazeSolvePath = [];
  mazeSolveIdx = 0;
  mazeStart = {x: 1, y: 1};
  mazeEnd = {x: mazeW - 2, y: mazeH - 2};
  mazeFrameCount = 0;
}
// initMaze(); — called via registerMode
function mazeNeighbors(x, y) {
  var dirs = [{dx:0,dy:-2},{dx:2,dy:0},{dx:0,dy:2},{dx:-2,dy:0}];
  var res = [];
  for (var i = 0; i < dirs.length; i++) {
    var nx = x + dirs[i].dx, ny = y + dirs[i].dy;
    if (nx > 0 && nx < mazeW - 1 && ny > 0 && ny < mazeH - 1 && mazeGrid[ny * mazeW + nx] === 0) {
      res.push({x: nx, y: ny, wx: x + dirs[i].dx / 2, wy: y + dirs[i].dy / 2});
    }
  }
  return res;
}

function mazeStepGen() {
  if (mazeStack.length === 0) { mazeGenDone = true; return; }
  var cur = mazeStack[mazeStack.length - 1];
  var nbrs = mazeNeighbors(cur.x, cur.y);
  if (nbrs.length > 0) {
    var pick = nbrs[(Math.random() * nbrs.length) | 0];
    mazeGrid[pick.wy * mazeW + pick.wx] = 1;
    mazeGrid[pick.y * mazeW + pick.x] = 1;
    mazeStack.push({x: pick.x, y: pick.y});
  } else {
    mazeStack.pop();
  }
}

function mazeSolve() {
  // BFS from start to end
  var visited = new Uint8Array(mazeW * mazeH);
  var parent = new Int32Array(mazeW * mazeH).fill(-1);
  var queue = [mazeStart.y * mazeW + mazeStart.x];
  visited[mazeStart.y * mazeW + mazeStart.x] = 1;
  var endIdx = mazeEnd.y * mazeW + mazeEnd.x;
  while (queue.length > 0) {
    var ci = queue.shift();
    if (ci === endIdx) break;
    var cx = ci % mazeW, cy = (ci / mazeW) | 0;
    var dirs = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
    for (var d = 0; d < 4; d++) {
      var nx = cx + dirs[d].dx, ny = cy + dirs[d].dy;
      var ni = ny * mazeW + nx;
      if (nx >= 0 && nx < mazeW && ny >= 0 && ny < mazeH && !visited[ni] && mazeGrid[ni] === 1) {
        visited[ni] = 1;
        parent[ni] = ci;
        queue.push(ni);
      }
    }
  }
  mazeSolvePath = [];
  var idx = endIdx;
  while (idx !== -1) {
    mazeSolvePath.push(idx);
    idx = parent[idx];
  }
  mazeSolvePath.reverse();
  mazeSolveIdx = 0;
}

function renderMaze() {
  clearCanvas();
  mazeFrameCount++;
  var W = state.COLS, H = state.ROWS;
  if (Math.floor(state.COLS / 2) !== mazeW || Math.floor(state.ROWS / 2) !== mazeH) initMaze();
  // Click sets start/end
  if (pointer.clicked && state.currentMode === 'maze') {
    pointer.clicked = false;
    var mx = Math.floor(pointer.gx / 2), my = Math.floor(pointer.gy / 2);
    if (mx >= 0 && mx < mazeW && my >= 0 && my < mazeH && mazeGrid[my * mazeW + mx] === 1) {
      if (!mazeGenDone) { /* ignore during gen */ }
      else { mazeEnd = {x: mx, y: my}; mazeSolve(); }
    }
  }
  // Animate generation
  if (!mazeGenDone) {
    for (var s = 0; s < 3; s++) mazeStepGen();
    if (mazeGenDone) mazeSolve();
  }
  // Animate solve path
  if (mazeGenDone && mazeSolveIdx < mazeSolvePath.length) {
    mazeSolveIdx = Math.min(mazeSolveIdx + 2, mazeSolvePath.length);
  }
  // Draw
  for (var y = 0; y < mazeH && y * 2 < H; y++) {
    for (var x = 0; x < mazeW && x * 2 < W; x++) {
      var val = mazeGrid[y * mazeW + x];
      var sx = x * 2, sy = y * 2;
      if (val === 0) {
        drawChar('#', sx, sy, 40, 50, 60, 0.5);
        if (sx + 1 < W) drawChar('#', sx + 1, sy, 40, 50, 60, 0.5);
      } else {
        drawChar('.', sx, sy, 30, 40, 30, 0.2);
      }
    }
  }
  // Draw solution path
  for (var i = 0; i < mazeSolveIdx && i < mazeSolvePath.length; i++) {
    var pi = mazeSolvePath[i];
    var px = (pi % mazeW) * 2, py = ((pi / mazeW) | 0) * 2;
    var prog = i / mazeSolvePath.length;
    drawCharHSL('*', px, py, (120 + prog * 240) | 0, 80, 45);
  }
  // Draw gen stack head
  if (!mazeGenDone && mazeStack.length > 0) {
    var head = mazeStack[mazeStack.length - 1];
    drawChar('@', head.x * 2, head.y * 2, 255, 255, 100, 1);
  }
}

registerMode('maze', {
  init: initMaze,
  render: renderMaze,
});
