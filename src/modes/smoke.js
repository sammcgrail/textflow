import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var smokeParts, smokeCount, smokeW, smokeH, smokeGrid;
function initSmoke() {
  smokeW = state.COLS; smokeH = state.ROWS;
  smokeCount = state.isMobile ? 300 : 600;
  smokeParts = [];
  smokeGrid = new Float32Array(smokeW * smokeH);
  for (var i = 0; i < smokeCount; i++) {
    smokeParts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  }
}
// initSmoke(); — called via registerMode
function renderSmoke() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (smokeW !== W || smokeH !== H) initSmoke();
  // Clear grid
  for (var i = 0; i < smokeGrid.length; i++) smokeGrid[i] *= 0.85;
  var baseX = W * 0.5;
  var pushX = 0, pushY = 0;
  if (pointer.down && state.currentMode === 'smoke') {
    pushX = (pointer.gx - W * 0.5) * 0.3;
    pushY = (pointer.gy - H * 0.5) * 0.3;
  }
  for (var i = 0; i < smokeCount; i++) {
    var p = smokeParts[i];
    if (p.life <= 0) {
      p.x = baseX + (Math.random() - 0.5) * 4;
      p.y = H - 1;
      p.vx = (Math.random() - 0.5) * 2;
      p.vy = -(3 + Math.random() * 4);
      p.life = 1;
    }
    var turb = Math.sin(p.y * 0.3 + state.time * 2) * 2 + Math.sin(p.x * 0.2 + state.time * 1.3) * 1.5;
    p.vx += (turb + pushX) * 0.016;
    p.vy += (-2 + pushY) * 0.016;
    p.vx *= 0.98;
    p.x += p.vx * 0.016 * 15;
    p.y += p.vy * 0.016 * 15;
    p.life -= 0.008;
    var ix = p.x | 0, iy = p.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      smokeGrid[iy * W + ix] = Math.min(1, smokeGrid[iy * W + ix] + p.life * 0.3);
    }
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = smokeGrid[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var b = (80 + v * 150) | 0;
      drawChar(RAMP_SOFT[ri], x, y, b, b, b, v * 0.8);
    }
  }
}

registerMode('smoke', {
  init: initSmoke,
  render: renderSmoke,
});
