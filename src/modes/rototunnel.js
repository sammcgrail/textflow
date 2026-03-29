import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Rotating infinite tunnel — classic demoscene tunnel effect
function renderRototunnel() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  // Camera sway
  var camX = Math.sin(t * 0.5) * W * 0.1;
  var camY = Math.cos(t * 0.7) * H * 0.08;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx - camX;
      var dy = (y - cy - camY) * 1.6;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r < 0.5) r = 0.5;
      var a = Math.atan2(dy, dx);

      // Tunnel mapping: distance = 1/r, angle = a
      var tunnelDist = 30 / r + t * 3;
      var tunnelAngle = a / (2 * Math.PI) + t * 0.1;

      // Texture: checkerboard in tunnel space
      var tu = tunnelAngle * 8;
      var tv = tunnelDist * 0.5;
      var check = ((Math.floor(tu) + Math.floor(tv)) & 1);

      // Stripe overlay
      var stripe = Math.sin(tu * Math.PI * 2) * 0.5 + 0.5;

      var val = check * 0.6 + stripe * 0.4;

      // Depth fog — darker further in
      var fog = Math.min(1, 20 / r);
      val *= fog;

      // Edge glow near tunnel walls
      var edge = Math.max(0, 1 - r / 3);
      val += edge * 0.3 * (Math.sin(t * 5) * 0.5 + 0.5);

      if (val < 0.03) continue;
      val = Math.min(1, val);
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (tunnelDist * 20 + a * 57.3) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 50 + fog * 40, 8 + val * 50);
    }
  }
}

registerMode('rototunnel', { init: undefined, render: renderRototunnel });
