import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

function initTunnel() {}
// initTunnel(); — called via registerMode
function renderTunnel() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var cx = W * 0.5, cy = H * 0.5;
  if (pointer.down && state.currentMode === 'tunnel') {
    cx = pointer.gx * 0.3 + cx * 0.7;
    cy = pointer.gy * 0.3 + cy * 0.7;
  }
  var t = state.time;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 1.8;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) dist = 0.5;
      var angle = Math.atan2(dy, dx);
      var u = angle / (Math.PI * 2) * 16 + t * 2;
      var v = 16.0 / dist + t * 3;
      var pattern = ((Math.floor(u) + Math.floor(v)) & 1);
      var shade = 1.0 / (1 + dist * 0.15);
      if (shade < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (shade * (pattern ? 1 : 0.5) * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      var hue = (angle * 57.3 + t * 60) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(ch, x, y, hue | 0, 70, (shade * 50) | 0);
    }
  }
}

registerMode('tunnel', {
  init: initTunnel,
  render: renderTunnel,
});
