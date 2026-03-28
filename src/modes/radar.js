import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var radarBlips, radarAngle, radarW, radarH, radarTargets;
function initRadar() {
  radarW = state.COLS; radarH = state.ROWS;
  radarAngle = 0;
  radarBlips = new Float32Array(radarW * radarH);
  radarTargets = [];
  for (var i = 0; i < 8; i++) {
    radarTargets.push({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.7 });
  }
}
// initRadar(); — called via registerMode
function renderRadar() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (radarW !== W || radarH !== H) initRadar();
  var cx = W * 0.5, cy = H * 0.5;
  var maxR = Math.min(cx, cy) - 1;
  radarAngle += 0.016 * 2;
  // Decay blips
  for (var i = 0; i < radarBlips.length; i++) radarBlips[i] *= 0.97;
  // Add target on click
  if (pointer.clicked && state.currentMode === 'radar') {
    pointer.clicked = false;
    var ta = Math.atan2(pointer.gy - cy, pointer.gx - cx);
    var tr = Math.sqrt(Math.pow(pointer.gx - cx, 2) + Math.pow(pointer.gy - cy, 2)) / maxR;
    radarTargets.push({ a: ta, r: Math.min(tr, 0.95) });
  }
  // Sweep line + detect targets
  var sweepA = radarAngle % (Math.PI * 2);
  for (var d = 0; d < maxR; d++) {
    var sx = (cx + Math.cos(sweepA) * d) | 0;
    var sy = (cy + Math.sin(sweepA) * d * 0.6) | 0;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) radarBlips[sy * W + sx] = 1;
  }
  // Light up targets near sweep
  for (var t = 0; t < radarTargets.length; t++) {
    var tg = radarTargets[t];
    var diff = Math.abs(sweepA - ((tg.a + Math.PI * 2) % (Math.PI * 2)));
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < 0.15) {
      var tx = (cx + Math.cos(tg.a) * tg.r * maxR) | 0;
      var ty = (cy + Math.sin(tg.a) * tg.r * maxR * 0.6) | 0;
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        radarBlips[ty * W + tx] = 1;
        if (tx + 1 < W) radarBlips[ty * W + tx + 1] = 0.8;
        if (ty + 1 < H) radarBlips[(ty + 1) * W + tx] = 0.8;
      }
    }
  }
  // Draw circle border
  for (var a = 0; a < Math.PI * 2; a += 0.03) {
    var bx = (cx + Math.cos(a) * maxR) | 0;
    var by = (cy + Math.sin(a) * maxR * 0.6) | 0;
    if (bx >= 0 && bx < W && by >= 0 && by < H) drawChar('.', bx, by, 0, 120, 0, 0.5);
  }
  // Draw crosshair
  for (var d = -maxR; d <= maxR; d++) {
    var hx = (cx + d) | 0, hy = cy | 0;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) drawChar('-', hx, hy, 0, 60, 0, 0.2);
    var vx = cx | 0, vy = (cy + d * 0.6) | 0;
    if (vx >= 0 && vx < W && vy >= 0 && vy < H) drawChar('|', vx, vy, 0, 60, 0, 0.2);
  }
  // Draw blips
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = radarBlips[y * W + x];
      if (v < 0.05) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      drawChar(RAMP_SOFT[ri], x, y, 0, (80 + v * 175) | 0, 0, v);
    }
  }
}

registerMode('radar', {
  init: initRadar,
  render: renderRadar,
});
