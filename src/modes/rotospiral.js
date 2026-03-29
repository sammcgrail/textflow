import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Layered rotating spirals with depth illusion
function renderRotospiral() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 1.6;
      var r = Math.sqrt(dx * dx + dy * dy);
      var a = Math.atan2(dy, dx);

      // Spiral arms — logarithmic spiral
      var arms = 5;
      var spiral1 = Math.sin(a * arms + Math.log(r + 1) * 3 - t * 2);
      var spiral2 = Math.sin(a * 3 - Math.log(r + 1) * 2.5 + t * 1.5);
      var spiral3 = Math.cos(a * 7 + Math.log(r + 1) * 4 - t * 3);

      // Depth: inner layers brighter
      var depth = 1 / (1 + r * 0.04);
      var val = (spiral1 * 0.4 + spiral2 * 0.35 + spiral3 * 0.25) * 0.5 + 0.5;
      val *= depth;

      // Pulsing core
      var pulse = Math.sin(t * 4 - r * 0.3) * 0.5 + 0.5;
      val += Math.max(0, 1 - r / 8) * pulse * 0.4;

      // Vignette
      var vd = r / (W * 0.5);
      val *= Math.max(0, 1 - vd * vd);

      if (val < 0.04) continue;
      val = Math.min(1, val);
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (a * 57.3 + r * 2 + t * 40) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 65 + val * 30, 10 + val * 55);
    }
  }
}

registerMode('rotospiral', { init: undefined, render: renderRotospiral });
