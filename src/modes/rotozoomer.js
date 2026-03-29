import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Classic demoscene rotozoomer — rotating + zooming checkerboard/XOR texture
function renderRotozoomer() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  var angle1 = t * 0.4;
  var angle2 = t * -0.25;
  var zoom1 = 8 + Math.sin(t * 0.3) * 5;
  var zoom2 = 12 + Math.cos(t * 0.5) * 6;
  var c1 = Math.cos(angle1), s1 = Math.sin(angle1);
  var c2 = Math.cos(angle2), s2 = Math.sin(angle2);
  var cx = W / 2, cy = H / 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 1.8;

      // Layer 1: rotating checkerboard
      var u1 = (dx * c1 - dy * s1) / zoom1;
      var v1 = (dx * s1 + dy * c1) / zoom1;
      var check1 = ((Math.floor(u1) + Math.floor(v1)) & 1) ? 1.0 : 0.0;

      // Layer 2: counter-rotating XOR pattern
      var u2 = (dx * c2 - dy * s2) / zoom2;
      var v2 = (dx * s2 + dy * c2) / zoom2;
      var ix = ((u2 | 0) % 16 + 16) % 16;
      var iy = ((v2 | 0) % 16 + 16) % 16;
      var xorVal = (ix ^ iy) / 15;

      // Blend layers with pulsing mix
      var mix = Math.sin(t * 0.7) * 0.5 + 0.5;
      var val = check1 * mix + xorVal * (1 - mix);

      // Distance fade
      var dist = Math.sqrt(dx * dx + dy * dy) / (W * 0.6);
      val *= Math.max(0, 1 - dist * dist);

      if (val < 0.05) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (val * 120 + t * 50 + dist * 200) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + val * 30, 15 + val * 45);
    }
  }
}

registerMode('rotozoomer', { init: undefined, render: renderRotozoomer });
