import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var fernPts, fernMax;
function initFern() { fernPts = []; fernMax = 0; }
function renderFern() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!fernPts) initFern();
  var t = state.time;
  // Barnsley fern IFS
  var target = Math.min(15000, ((t * 500) | 0));
  var ox = W * 0.5, oy = H - 2;
  var scale = Math.min(W * 0.15, H * 0.08);
  if (pointer.clicked && state.currentMode === 'fern') {
    pointer.clicked = false;
    fernPts = []; fernMax = 0;
    ox = pointer.gx; oy = pointer.gy;
  } else if (pointer.down && state.currentMode === 'fern') {
    scale = 2 + (pointer.gy / H) * H * 0.15;
  }
  while (fernMax < target) {
    fernMax++;
    var x = 0, y = 0;
    for (var i = 0; i < 40; i++) {
      var r = Math.random();
      var nx, ny;
      if (r < 0.01) { nx = 0; ny = 0.16 * y; }
      else if (r < 0.86) { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6; }
      else if (r < 0.93) { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6; }
      else { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44; }
      x = nx; y = ny;
    }
    var px = (ox + x * scale) | 0;
    var py = (oy - y * scale * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      fernPts.push({ x: px, y: py, age: fernMax });
    }
  }
  // Draw
  for (var i = 0; i < fernPts.length; i++) {
    var p = fernPts[i];
    var bright = 8 + (p.y / H) * 20;
    var hue = 100 + (p.y / H) * 40;
    var ch = p.y < H * 0.3 ? '.' : p.y < H * 0.6 ? '*' : '#';
    drawCharHSL(ch, p.x, p.y, hue | 0, 60, bright | 0);
  }
  // Pot/base
  for (var dx = -3; dx <= 3; dx++) {
    var px = (ox + dx) | 0;
    if (px >= 0 && px < W && oy < H) drawCharHSL('U', px, Math.min(oy + 1, H - 1), 20, 40, 12);
  }
}
registerMode('fern', { init: initFern, render: renderFern });
