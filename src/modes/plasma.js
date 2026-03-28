import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Plasma interaction: cursor becomes extra focal point
function renderPlasma() {
  clearCanvas();

  for (var y = 0; y < state.ROWS; y++) {
    for (var x = 0; x < state.COLS; x++) {
      var v1 = Math.sin(x * 0.06 + state.time * 0.7);
      var v2 = Math.sin(y * 0.09 + state.time * 0.5);
      var v3 = Math.sin((x + y) * 0.05 + state.time * 0.4);
      var pcx = x - state.COLS / 2, pcy = y - state.ROWS / 2;
      var v4 = Math.sin(Math.sqrt(pcx * pcx + pcy * pcy) * 0.1 - state.time * 0.8);
      var v5 = Math.sin(x * 0.04 * Math.sin(state.time * 0.2) + y * 0.05 * Math.cos(state.time * 0.15));

      var v = (v1 + v2 + v3 + v4 + v5) * 0.1 + 0.5;

      // Pointer adds plasma focal point
      if (pointer.down && state.currentMode === 'plasma') {
        var pdx = x - pointer.gx, pdy = y - pointer.gy;
        var pd = Math.sqrt(pdx * pdx + pdy * pdy);
        v += Math.sin(pd * 0.2 - state.time * 2) * 0.3 * Math.exp(-pd * 0.02);
      }

      if (v < 0.1) continue;

      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (v * 270 + x * 1.5 + state.time * 30) % 360;
      var sat = 70 + v * 30;
      var lit = 20 + v * 55;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, sat, lit);
    }
  }
}

registerMode('plasma', {
  init: undefined,
  render: renderPlasma,
});
