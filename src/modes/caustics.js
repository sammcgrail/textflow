import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var caDistX = 0, caDistY = 0;
function renderCaustics() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  // Click creates ripple distortion
  if (pointer.down && state.currentMode === 'caustics') {
    caDistX = pointer.gx; caDistY = pointer.gy;
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x * 0.08, ny = y * 0.12;
      // Pointer ripple distortion
      if (caDistX > 0) {
        var pdx = x - caDistX, pdy = y - caDistY;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pd < 20) {
          var ripple = Math.sin(pd * 0.5 - t * 5) * (1 - pd / 20) * 0.3;
          nx += ripple; ny += ripple;
        }
      }
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
      drawCharHSL(RAMP_DENSE[ci], x, y, hue, (50 + v * 30) | 0, (5 + v * 35 * (1 - depth * 0.3)) | 0);
    }
  }
}
registerMode('caustics', { render: renderCaustics });
