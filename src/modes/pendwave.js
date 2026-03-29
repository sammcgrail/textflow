import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var pwSpeed = 1;
function renderPendwave() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var count = Math.min(W, 60);
  if (pointer.down && state.currentMode === 'pendwave') {
    pwSpeed = 0.2 + (pointer.gy / H) * 3;
  }
  var t = state.time * pwSpeed;
  for (var i = 0; i < count; i++) {
    var freq = 0.5 + i * 0.03;
    var angle = Math.sin(t * freq) * Math.PI * 0.4;
    var length = H * 0.6;
    var anchorX = (W / 2 - count / 2 + i) | 0;
    var anchorY = 2;
    var bobX = anchorX + Math.sin(angle) * length * 0.3;
    var bobY = anchorY + Math.cos(angle) * length * 0.5;
    var steps = 20;
    for (var s = 0; s <= steps; s++) {
      var frac = s / steps;
      var sx = (anchorX + (bobX - anchorX) * frac) | 0;
      var sy = (anchorY + (bobY - anchorY) * frac) | 0;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) drawCharHSL('|', sx, sy, (i * 6) | 0, 50, 20);
    }
    var bx = bobX | 0, by = bobY | 0;
    if (bx >= 0 && bx < W && by >= 0 && by < H) drawCharHSL('@', bx, by, (i * 6) | 0, 80, 50);
    for (var trail = 1; trail <= 3; trail++) {
      var ta = Math.sin((t - trail * 0.05) * freq) * Math.PI * 0.4;
      var tx = (anchorX + Math.sin(ta) * length * 0.3) | 0;
      var ty = (anchorY + Math.cos(ta) * length * 0.5) | 0;
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) drawCharHSL('.', tx, ty, (i * 6) | 0, 60, (15 - trail * 3) | 0);
    }
  }
}
registerMode('pendwave', { render: renderPendwave });
