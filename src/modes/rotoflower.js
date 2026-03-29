import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Rotating flower/mandala — petal shapes that bloom and rotate
function renderRotoflower() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 1.6;
      var r = Math.sqrt(dx * dx + dy * dy);
      var a = Math.atan2(dy, dx);

      var val = 0;

      // Layer 1: outer petals (slow rotation)
      var petals1 = 8;
      var petalR1 = Math.cos(a * petals1 + t * 0.5) * 0.5 + 0.5;
      var bloom1 = W * 0.35 + Math.sin(t * 0.8) * W * 0.05;
      var d1 = Math.abs(r - bloom1 * petalR1) / (W * 0.08);
      val += Math.max(0, 1 - d1);

      // Layer 2: inner petals (faster, opposite rotation)
      var petals2 = 5;
      var petalR2 = Math.cos(a * petals2 - t * 0.8) * 0.5 + 0.5;
      var bloom2 = W * 0.2 + Math.sin(t * 1.2) * W * 0.04;
      var d2 = Math.abs(r - bloom2 * petalR2) / (W * 0.06);
      val += Math.max(0, 1 - d2) * 0.8;

      // Layer 3: tiny center whirl
      var petals3 = 12;
      var petalR3 = Math.cos(a * petals3 + t * 1.5) * 0.5 + 0.5;
      var bloom3 = W * 0.08;
      var d3 = Math.abs(r - bloom3 * petalR3) / (W * 0.04);
      val += Math.max(0, 1 - d3) * 0.6;

      // Center glow
      val += Math.max(0, 1 - r / (W * 0.04)) * 0.5;

      // Stamen dots along radii
      var stamenAngle = Math.floor(a * 16 / (2 * Math.PI) + 0.5) * (2 * Math.PI) / 16;
      var stamenR = W * 0.12 + Math.sin(t * 2 + stamenAngle * 3) * 3;
      var sd = Math.sqrt(Math.pow(r * Math.cos(a) - stamenR * Math.cos(stamenAngle + t * 0.3), 2) +
                         Math.pow(r * Math.sin(a) - stamenR * Math.sin(stamenAngle + t * 0.3), 2));
      val += Math.max(0, 1 - sd / 2) * 0.4;

      if (val < 0.05) continue;
      val = Math.min(1, val);
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      // Pink/magenta/gold palette
      var hue = (320 + a * 57.3 * 0.3 + val * 40 + Math.sin(t) * 20) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + val * 35, 15 + val * 50);
    }
  }
}

registerMode('rotoflower', { init: undefined, render: renderRotoflower });
