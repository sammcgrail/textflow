import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Two rotating grids that create moiré interference patterns
function renderRotogrid() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  var a1 = t * 0.2;
  var a2 = t * -0.15 + 0.5;
  var a3 = t * 0.08;
  var c1 = Math.cos(a1), s1 = Math.sin(a1);
  var c2 = Math.cos(a2), s2 = Math.sin(a2);
  var c3 = Math.cos(a3), s3 = Math.sin(a3);
  var spacing1 = 4 + Math.sin(t * 0.4) * 1.5;
  var spacing2 = 5 + Math.cos(t * 0.3) * 2;
  var spacing3 = 6 + Math.sin(t * 0.25) * 1;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = y - cy;

      // Grid 1
      var u1 = dx * c1 - dy * s1;
      var v1 = dx * s1 + dy * c1;
      var g1 = Math.cos(u1 * Math.PI / spacing1) * Math.cos(v1 * Math.PI / spacing1);

      // Grid 2
      var u2 = dx * c2 - dy * s2;
      var v2 = dx * s2 + dy * c2;
      var g2 = Math.cos(u2 * Math.PI / spacing2) * Math.cos(v2 * Math.PI / spacing2);

      // Grid 3 — slower, wider
      var u3 = dx * c3 - dy * s3;
      var v3 = dx * s3 + dy * c3;
      var g3 = Math.cos(u3 * Math.PI / spacing3) * Math.cos(v3 * Math.PI / spacing3);

      // Combine: interference
      var val = (g1 + g2 + g3) / 3;
      val = val * 0.5 + 0.5; // normalize to 0-1

      // Radial fade
      var dist = Math.sqrt(dx * dx + dy * dy) / (W * 0.55);
      val *= Math.max(0, 1 - dist * dist * 0.8);

      if (val < 0.08) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (val * 180 + t * 25) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 50 + val * 40, 10 + val * 55);
    }
  }
}

registerMode('rotogrid', { init: undefined, render: renderRotogrid });
