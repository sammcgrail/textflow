import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

function renderCaustics() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x * 0.08, ny = y * 0.12;
      // Layered sine caustic pattern
      var c1 = Math.sin(nx + Math.sin(ny + t) * 2) * Math.cos(ny * 1.3 + Math.sin(nx * 0.7 - t * 0.8) * 1.5);
      var c2 = Math.sin(nx * 1.5 + t * 0.7) * Math.cos(ny * 0.8 + Math.sin(nx * 1.2 + t * 0.5) * 2);
      var c3 = Math.sin((nx + ny) * 0.6 + t * 0.3) * Math.cos((nx - ny) * 0.4 + t * 0.6);
      var v = (c1 + c2 + c3) / 3;
      v = v * 0.5 + 0.5;
      v = Math.pow(v, 0.6);
      if (v < 0.15) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var depth = y / H;
      var hue = (190 + depth * 30 + Math.sin(t * 0.2) * 10) | 0;
      var sat = (50 + v * 30) | 0;
      var light = (5 + v * 35 * (1 - depth * 0.3)) | 0;
      drawCharHSL(RAMP_DENSE[ci], x, y, hue, sat, light);
    }
  }
}
registerMode('caustics', { render: renderCaustics });
