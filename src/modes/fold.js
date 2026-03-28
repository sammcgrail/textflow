import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { fbm } from '../core/noise.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Fold interaction: cursor distorts the domain warp
function renderFold() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var sc = 0.03;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var px = x * sc, py = y * sc;

      // Cursor distortion
      var foldWarp = 0;
      if (pointer.down && state.currentMode === 'fold') {
        var fdx = x - pointer.gx, fdy = y - pointer.gy;
        var fd = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fd < 20) foldWarp = (1 - fd / 20) * 2;
      }

      // Nested domain warping
      var q1 = fbm(px + state.time * 0.1 + foldWarp, py + state.time * 0.05, 4);
      var q2 = fbm(px + 5.2 + state.time * 0.08, py + 1.3 + foldWarp, 4);
      var r1 = fbm(px + 4 * q1 + 1.7 + state.time * 0.06, py + 4 * q2 + 9.2, 4);
      var r2 = fbm(px + 4 * q1 + 8.3, py + 4 * q2 + 2.8 + state.time * 0.07, 4);
      var v = fbm(px + 4 * r1, py + 4 * r2, 3);

      v = v * 0.5 + 0.5; // normalize
      if (v < 0.1) continue;

      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (v * 60 + 20) % 360; // amber range
      var sat = 60 + v * 40;
      var lit = 15 + v * 50;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, sat, lit);
    }
  }
}

registerMode('fold', {
  init: undefined,
  render: renderFold,
});
