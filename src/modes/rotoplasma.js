import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Rotating plasma — sine wave interference with rotation transforms
function renderRotoplasma() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  // Three rotating coordinate systems
  var angles = [t * 0.3, t * -0.2, t * 0.15];
  var cosA = [], sinA = [];
  for (var i = 0; i < 3; i++) {
    cosA[i] = Math.cos(angles[i]);
    sinA[i] = Math.sin(angles[i]);
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) / W, dy = (y - cy) / H;

      // Plasma in rotated space 1
      var u1 = dx * cosA[0] - dy * sinA[0];
      var v1 = dx * sinA[0] + dy * cosA[0];
      var p1 = Math.sin(u1 * 12 + t) + Math.sin(v1 * 10 - t * 0.8);

      // Plasma in rotated space 2
      var u2 = dx * cosA[1] - dy * sinA[1];
      var v2 = dx * sinA[1] + dy * cosA[1];
      var p2 = Math.sin(u2 * 8 + t * 1.3) + Math.cos(v2 * 14 + t * 0.5);

      // Plasma in rotated space 3
      var u3 = dx * cosA[2] - dy * sinA[2];
      var v3 = dx * sinA[2] + dy * cosA[2];
      var r3 = Math.sqrt(u3 * u3 + v3 * v3);
      var p3 = Math.sin(r3 * 18 - t * 2);

      var val = (p1 + p2 + p3) / 6 + 0.5;
      val = Math.max(0, Math.min(1, val));

      // Soft vignette
      var vd = Math.sqrt(dx * dx + dy * dy) * 2;
      val *= Math.max(0, 1 - vd * vd * 0.5);

      if (val < 0.04) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (p1 * 60 + p2 * 40 + t * 30) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 75, 12 + val * 50);
    }
  }
}

registerMode('rotoplasma', { init: undefined, render: renderRotoplasma });
