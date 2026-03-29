import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hgGrains, hgFlipped;
function initHourglass() { hgGrains = []; hgFlipped = 0; }
function renderHourglass() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!hgGrains) initHourglass();
  var t = state.time;
  var cx = W / 2, cy = H / 2;
  var glassH = (H * 0.4) | 0;
  var glassW = (W * 0.2) | 0;
  if (pointer.clicked && state.currentMode === 'hourglass') {
    pointer.clicked = false;
    hgFlipped = t;
    hgGrains = [];
  } else if (pointer.down && state.currentMode === 'hourglass') {
    cx = pointer.gx;
  }
  var elapsed = t - hgFlipped;
  var fillPct = Math.min(1, elapsed * 0.05);
  // Draw glass outline
  for (var y = 0; y < H; y++) {
    var dy = y - cy;
    var normY = dy / glassH;
    if (Math.abs(normY) > 1) continue;
    // Hourglass shape: wide at top/bottom, narrow at middle
    var w = glassW * (Math.abs(normY) * 0.8 + 0.05);
    var lx = (cx - w) | 0, rx = (cx + w) | 0;
    if (lx >= 0 && lx < W) drawCharHSL('|', lx, y, 40, 30, 15);
    if (rx >= 0 && rx < W) drawCharHSL('|', rx, y, 40, 30, 15);
    // Top/bottom caps
    if (Math.abs(Math.abs(normY) - 1) < 0.05) {
      for (var x = lx; x <= rx; x++) {
        if (x >= 0 && x < W) drawCharHSL('=', x, y, 40, 30, 15);
      }
    }
  }
  // Sand falling through neck
  if (fillPct < 1) {
    var grain = Math.sin(t * 20) * 0.5;
    var nx = (cx + grain) | 0;
    for (var dy = -1; dy <= 1; dy++) {
      var py = (cy + dy) | 0;
      if (px >= 0 && nx < W && py >= 0 && py < H) drawCharHSL(':', nx, py, 40, 60, 25);
    }
  }
  // Top sand (draining)
  var topFill = 1 - fillPct;
  for (var y = (cy - glassH) | 0; y < cy; y++) {
    var dy = y - cy;
    var normY = Math.abs(dy / glassH);
    var w = glassW * (normY * 0.8 + 0.05) - 1;
    var sandTop = cy - glassH * topFill;
    if (y < sandTop) continue;
    for (var dx = -w; dx <= w; dx++) {
      var px = (cx + dx) | 0;
      if (px >= 0 && px < W && y >= 0 && y < H) {
        var n = Math.sin(px * 0.3 + y * 0.5 + t * 0.1) * 0.3 + 0.5;
        drawCharHSL(n > 0.5 ? ':' : '.', px, y, 40, 50, (8 + n * 12) | 0);
      }
    }
  }
  // Bottom sand (filling)
  for (var y = H - 1; y > cy; y--) {
    var dy = y - cy;
    var normY = Math.abs(dy / glassH);
    if (normY > 1) continue;
    var w = glassW * (normY * 0.8 + 0.05) - 1;
    var sandBottom = cy + glassH * (1 - fillPct);
    if (y < sandBottom) continue;
    for (var dx = -w; dx <= w; dx++) {
      var px = (cx + dx) | 0;
      if (px >= 0 && px < W && y >= 0 && y < H) {
        var n = Math.sin(px * 0.4 + y * 0.3) * 0.3 + 0.5;
        drawCharHSL(n > 0.5 ? ':' : '.', px, y, 35, 55, (8 + n * 14) | 0);
      }
    }
  }
  // Falling grains
  if (fillPct < 1 && Math.random() < 0.4) {
    hgGrains.push({ x: cx + (Math.random() - 0.5) * 2, y: cy, vy: 0.5 + Math.random() * 0.5 });
  }
  for (var i = hgGrains.length - 1; i >= 0; i--) {
    var g = hgGrains[i];
    g.y += g.vy;
    g.x += (Math.random() - 0.5) * 0.3;
    if (g.y > cy + glassH * (1 - fillPct)) { hgGrains.splice(i, 1); continue; }
    var px = g.x | 0, py = g.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 45, 70, 30);
  }
  if (hgGrains.length > 50) hgGrains.splice(0, hgGrains.length - 50);
}
registerMode('hourglass', { init: initHourglass, render: renderHourglass });
