import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Moire interaction: cursor becomes a focal point
function renderMoire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  // Three focal points orbiting
  var f1x = W * 0.5 + Math.cos(state.time * 0.3) * W * 0.3;
  var f1y = H * 0.5 + Math.sin(state.time * 0.4) * H * 0.3;
  var f2x = W * 0.5 + Math.cos(state.time * 0.37 + 2) * W * 0.25;
  var f2y = H * 0.5 + Math.sin(state.time * 0.29 + 2) * H * 0.35;
  var f3x, f3y;
  // Cursor replaces third focal point when active
  if (pointer.down && state.currentMode === 'moire') {
    f3x = pointer.gx; f3y = pointer.gy;
  } else {
    f3x = W * 0.5 + Math.sin(state.time * 0.23 + 4) * W * 0.35;
    f3y = H * 0.5 + Math.cos(state.time * 0.31 + 4) * H * 0.25;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var px = x * 0.55;
      var dx1 = px - f1x * 0.55, dy1 = y - f1y;
      var dx2 = px - f2x * 0.55, dy2 = y - f2y;
      var dx3 = px - f3x * 0.55, dy3 = y - f3y;
      var d1 = Math.sqrt(dx1*dx1 + dy1*dy1);
      var d2 = Math.sqrt(dx2*dx2 + dy2*dy2);
      var d3 = Math.sqrt(dx3*dx3 + dy3*dy3);

      var v = Math.sin(d1 * 0.3 + state.time) + Math.sin(d2 * 0.31 - state.time * 0.7) + Math.sin(d3 * 0.29 + state.time * 0.5);
      v = (v + 3) / 6; // normalize 0-1

      if (v < 0.15 || v > 0.85) continue; // show only the interference bands
      var band = Math.abs(v - 0.5) * 2;
      band = 1 - band; // invert: brightest at edges of bands

      var ri = Math.min(RAMP_SOFT.length - 1, (band * RAMP_SOFT.length) | 0);
      drawChar(RAMP_SOFT[ri], x, y, 0, (100 + band * 155) | 0, (50 + band * 50) | 0, 0.3 + band * 0.7);
    }
  }
}

registerMode('moire', {
  init: undefined,
  render: renderMoire,
});
