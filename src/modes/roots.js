import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var rtBranches, rtStep;
function initRoots() {
  var W = state.COLS, H = state.ROWS;
  rtBranches = [{ x: W / 2, y: 2, dx: 0, dy: 1, life: 1, hue: 30, depth: 0 }];
  rtStep = 0;
}
function renderRoots() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!rtBranches) initRoots();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'roots') {
    pointer.clicked = false;
    rtBranches.push({ x: pointer.gx, y: pointer.gy, dx: 0, dy: 1, life: 1, hue: 80 + Math.random() * 60, depth: 0 });
  } else if (pointer.down && state.currentMode === 'roots') {
    // Add nutrients - grow faster near pointer
    for (var i = 0; i < rtBranches.length; i++) {
      var b = rtBranches[i];
      if (!b.settled) {
        var dx = pointer.gx - b.x, dy = pointer.gy - b.y;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) b.life = Math.min(1, b.life + 0.02);
      }
    }
  }
  // Soil layer background
  for (var y = 3; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var n = Math.sin(x * 0.2 + y * 0.3) * 0.3 + Math.sin(x * 0.5 - y * 0.1) * 0.2;
      if (n > 0.1) drawCharHSL('.', x, y, 30, 15, 3);
    }
  }
  // Surface
  for (var x = 0; x < W; x++) {
    drawCharHSL('~', x, 2, 120, 40, 10);
    drawCharHSL('"', x, 1, 120, 50, 8);
  }
  // Grow roots
  var curStep = (t * 15) | 0;
  while (rtStep < curStep && rtStep < curStep + 3) {
    rtStep++;
    var newBranches = [];
    for (var i = 0; i < rtBranches.length; i++) {
      var b = rtBranches[i];
      if (b.settled) continue;
      b.x += b.dx + (Math.random() - 0.5) * 1.5;
      b.y += b.dy * 0.5;
      b.dx += (Math.random() - 0.5) * 0.3;
      b.dx *= 0.9;
      b.life -= 0.005;
      if (b.x < 0 || b.x >= W || b.y >= H || b.life <= 0) { b.settled = true; continue; }
      // Branch
      if (Math.random() < 0.03 && b.depth < 6 && rtBranches.length + newBranches.length < 500) {
        newBranches.push({ x: b.x, y: b.y, dx: (Math.random() - 0.5) * 2, dy: 0.5 + Math.random() * 0.5, life: b.life * 0.7, hue: b.hue + (Math.random() - 0.5) * 20, depth: b.depth + 1 });
      }
    }
    for (var i = 0; i < newBranches.length; i++) rtBranches.push(newBranches[i]);
  }
  // Draw roots
  for (var i = 0; i < rtBranches.length; i++) {
    var b = rtBranches[i];
    var px = b.x | 0, py = b.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var thick = b.depth < 2 ? '#' : b.depth < 4 ? '|' : ':';
      drawCharHSL(thick, px, py, b.hue, 40, (8 + b.life * 20) | 0);
    }
  }
  // Reset if saturated
  if (rtBranches.length > 400) {
    var active = 0;
    for (var i = 0; i < rtBranches.length; i++) if (!rtBranches[i].settled) active++;
    if (active < 3) initRoots();
  }
}
registerMode('roots', { init: initRoots, render: renderRoots });
