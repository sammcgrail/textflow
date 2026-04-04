import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ksCx, ksCy, ksGrid, ksW, ksH;

function initKochsnow() {
  ksW = state.COLS; ksH = state.ROWS;
  ksCx = ksW * 0.5;
  ksCy = ksH * 0.5;
  ksGrid = null;
}

function kochLine(grid, W, H, x1, y1, x2, y2, depth) {
  if (depth <= 0) {
    // Draw line segment
    var dx = x2 - x1, dy = y2 - y1;
    var steps = Math.max(Math.abs(dx), Math.abs(dy)) * 1.5;
    steps = Math.max(1, steps | 0);
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var px = (x1 + dx * t) | 0;
      var py = (y1 + dy * t) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var idx = py * W + px;
        if (grid[idx] < 255) grid[idx]++;
      }
    }
    return;
  }
  // Split into 4 Koch segments
  var dx = x2 - x1, dy = y2 - y1;
  var ax = x1 + dx / 3, ay = y1 + dy / 3;
  var bx = x1 + dx * 2 / 3, by = y1 + dy * 2 / 3;
  // Peak point (equilateral triangle outward)
  var mx = (ax + bx) / 2 + (by - ay) * 0.866;
  var my = (ay + by) / 2 - (bx - ax) * 0.866;
  kochLine(grid, W, H, x1, y1, ax, ay, depth - 1);
  kochLine(grid, W, H, ax, ay, mx, my, depth - 1);
  kochLine(grid, W, H, mx, my, bx, by, depth - 1);
  kochLine(grid, W, H, bx, by, x2, y2, depth - 1);
}

function renderKochsnow() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (ksW !== W || ksH !== H) { ksW = W; ksH = H; }

  if (pointer.clicked && state.currentMode === 'kochsnow') {
    pointer.clicked = false;
    ksCx = pointer.gx;
    ksCy = pointer.gy;
  }

  // Animated depth cycling
  var depthCycle = ((t * 0.4) % 5) | 0;
  var depth = Math.max(1, Math.min(4, depthCycle + 1));

  ksGrid = new Uint8Array(W * H);

  // Build equilateral triangle vertices
  var size = Math.min(W * 0.42 * ar, H * 0.42);
  var rotation = t * 0.15;
  var vertices = [];
  for (var i = 0; i < 3; i++) {
    var a = rotation + i * Math.PI * 2 / 3 - Math.PI * 0.5;
    vertices.push({
      x: ksCx + Math.cos(a) * size / ar,
      y: ksCy + Math.sin(a) * size
    });
  }

  // Draw Koch curve on each edge
  for (var i = 0; i < 3; i++) {
    var j = (i + 1) % 3;
    kochLine(ksGrid, W, H, vertices[i].x, vertices[i].y, vertices[j].x, vertices[j].y, depth);
  }

  // Render grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var density = ksGrid[y * W + x];
      if (density === 0) continue;
      var v = Math.min(1, density / 4);
      var hue = 195 + Math.sin(x * 0.08 + y * 0.06 + t * 1.5) * 15;
      var sat = 82 + v * 18;
      var lit = 50 + v * 15 + Math.sin(t * 3 + x * 0.2) * 5;
      var ch = density > 3 ? '@' : density > 2 ? '#' : density > 1 ? '*' : '+';
      drawCharHSL(ch, x, y, hue | 0, sat | 0, Math.max(40, lit) | 0);
    }
  }

  // Sparkle effect on snowflake
  for (var i = 0; i < 8; i++) {
    var sx = (Math.random() * W) | 0;
    var sy = (Math.random() * H) | 0;
    if (ksGrid[sy * W + sx] > 0) {
      drawCharHSL('*', sx, sy, 200, 60, 70);
    }
  }
}

registerMode('kochsnow', { init: initKochsnow, render: renderKochsnow });
