import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var rtGrid, rtBranches, rtStep;
function initRoots() {
  var W = state.COLS, H = state.ROWS;
  rtGrid = new Uint8Array(W * H);
  rtBranches = [];
  rtStep = 0;
  for (var i = 0; i < 5; i++) {
    var sx = ((i + 0.5) / 5) * W;
    rtBranches.push({ x: sx, y: 3, dx: 0, dy: 1, life: 1, hue: 30 + i * 25, depth: 0 });
  }
}
function renderRoots() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!rtGrid || rtGrid.length !== W * H) initRoots();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'roots') {
    pointer.clicked = false;
    rtBranches.push({ x: pointer.gx, y: pointer.gy, dx: 0, dy: 1, life: 1, hue: (Math.random() * 100 + 20) | 0, depth: 0 });
  } else if (pointer.down && state.currentMode === 'roots') {
    for (var i = 0; i < rtBranches.length; i++) {
      var b = rtBranches[i];
      if (!b.settled) {
        var dx = pointer.gx - b.x, dy = pointer.gy - b.y;
        if (Math.abs(dx) < 15 && Math.abs(dy) < 10) { b.life = Math.min(1, b.life + 0.03); b.dx += dx * 0.01; }
      }
    }
  }
  // Surface/grass
  for (var x = 0; x < W; x++) {
    drawCharHSL('~', x, 2, 120, 50, 12);
    drawCharHSL('"', x, 1, 120, 60, 10);
    if (Math.sin(x * 0.5) > 0 && x % 3 === 0) drawCharHSL('Y', x, 0, 120, 40, 8);
  }
  // Soil texture
  for (var y = 3; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var n = Math.sin(x * 0.15 + y * 0.25) * 0.3 + Math.sin(x * 0.4 - y * 0.1 + 2) * 0.2;
      if (n > 0.05 && rtGrid[y * W + x] === 0) drawCharHSL('.', x, y, 30, 15, 4);
    }
  }
  // Grow roots
  var curStep = (t * 25) | 0;
  while (rtStep < curStep && rtStep < curStep + 5) {
    rtStep++;
    var newBranches = [];
    for (var i = 0; i < rtBranches.length; i++) {
      var b = rtBranches[i];
      if (b.settled) continue;
      b.x += b.dx + (Math.random() - 0.5) * 1.8;
      b.y += b.dy * 0.6;
      b.dx += (Math.random() - 0.5) * 0.4;
      b.dx *= 0.85;
      b.life -= 0.003;
      var px = b.x | 0, py = b.y | 0;
      if (px < 0 || px >= W || py >= H || b.life <= 0) { b.settled = true; continue; }
      if (py >= 0 && py < H) rtGrid[py * W + px] = ((b.hue / 25) | 0) + 1;
      if (Math.random() < 0.06 && b.depth < 7 && rtBranches.length + newBranches.length < 800) {
        newBranches.push({ x: b.x, y: b.y, dx: (Math.random() - 0.5) * 2.5, dy: 0.4 + Math.random() * 0.6, life: b.life * 0.7, hue: b.hue + (Math.random() - 0.5) * 15, depth: b.depth + 1 });
      }
    }
    for (var i = 0; i < newBranches.length; i++) rtBranches.push(newBranches[i]);
  }
  // Draw roots from grid
  for (var y = 3; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = rtGrid[y * W + x];
      if (v > 0) {
        var n = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && rtGrid[ny * W + nx] > 0) n++;
        }
        var thick = n > 5 ? '#' : n > 3 ? '|' : n > 1 ? ':' : '.';
        drawCharHSL(thick, x, y, 25 + v * 15, 45, (8 + n * 3) | 0);
      }
    }
  }
  var active = 0;
  for (var i = 0; i < rtBranches.length; i++) if (!rtBranches[i].settled) active++;
  if (active < 2 && rtStep > 200) initRoots();
}
registerMode('roots', { init: initRoots, render: renderRoots });
