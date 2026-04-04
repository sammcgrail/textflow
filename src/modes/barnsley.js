import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bfPts, bfMax, bfOx, bfOy, bfScale, bfGrid, bfW, bfH;

function initBarnsley() {
  bfW = state.COLS; bfH = state.ROWS;
  bfPts = [];
  bfMax = 0;
  bfOx = bfW * 0.5;
  bfOy = bfH - 3;
  bfScale = Math.min(bfW * 0.18, bfH * 0.085);
  bfGrid = null;
}

function renderBarnsley() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  var t = state.time;

  if (bfW !== W || bfH !== H) {
    bfW = W; bfH = H;
    bfScale = Math.min(W * 0.18, H * 0.085);
    bfPts = []; bfMax = 0;
    bfGrid = null;
  }

  if (pointer.clicked && state.currentMode === 'barnsley') {
    pointer.clicked = false;
    bfOx = pointer.gx;
    bfOy = pointer.gy;
    bfPts = []; bfMax = 0;
    bfGrid = null;
  }

  // Accumulate points
  var target = Math.min(30000, ((t * 800) | 0));
  var addPerFrame = state.isMobile ? 100 : 200;
  var added = 0;

  if (!bfGrid) bfGrid = new Uint8Array(W * H);

  while (bfMax < target && added < addPerFrame) {
    bfMax++;
    added++;
    var x = 0, y = 0;
    for (var i = 0; i < 50; i++) {
      var r = Math.random();
      var nx, ny;
      if (r < 0.01) { nx = 0; ny = 0.16 * y; }
      else if (r < 0.86) { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6; }
      else if (r < 0.93) { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6; }
      else { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44; }
      x = nx; y = ny;
    }
    var px = (bfOx + x * bfScale) | 0;
    var py = (bfOy - y * bfScale * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var idx = py * W + px;
      if (bfGrid[idx] < 255) bfGrid[idx]++;
      bfPts.push({ x: px, y: py, ht: y / 10 });
    }
  }

  // Draw from grid for performance
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var density = bfGrid[y * W + x];
      if (density === 0) continue;
      var v = Math.min(1, density / 6);
      // Height-based coloring: bottom is dark green, tips are yellow-green
      var heightRatio = 1 - y / H;
      var hue = 80 + heightRatio * 60; // 80 (green) to 140 (yellow-green)
      // Tips get yellow highlights
      if (heightRatio > 0.7) hue = 80 + (heightRatio - 0.7) * 200;
      var sat = 88 + v * 12;
      var lit = 40 + v * 20 + heightRatio * 5;
      var flicker = Math.sin(t * 2 + x * 0.3 + y * 0.2) * 3;
      lit += flicker;
      var ch = density > 5 ? '@' : density > 3 ? '#' : density > 1 ? '*' : '+';
      drawCharHSL(ch, x, y, hue | 0, sat | 0, Math.max(35, lit) | 0);
    }
  }

  // Pot/base
  for (var dx = -4; dx <= 4; dx++) {
    var px = (bfOx + dx) | 0;
    if (px >= 0 && px < W && bfOy + 1 < H) {
      drawCharHSL('U', px, Math.min(bfOy + 1, H - 1), 25, 55, 35);
    }
  }
}

registerMode('barnsley', { init: initBarnsley, render: renderBarnsley });
