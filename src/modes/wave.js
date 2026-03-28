import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Wave interaction: click to add wave centers
var waveCenters = [];

function renderWave() {
  clearCanvas();
  var phrase = 'textflow';

  if (pointer.clicked && state.currentMode === 'wave') {
    pointer.clicked = false;
    if (waveCenters.length > 5) waveCenters.shift();
    waveCenters.push({ x: pointer.gx, y: pointer.gy, born: state.time });
  }
  // Prune old wave centers
  var wi = waveCenters.length;
  while (wi--) { if (state.time - waveCenters[wi].born > 15) waveCenters.splice(wi, 1); }

  for (var y = 0; y < state.ROWS; y++) {
    for (var x = 0; x < state.COLS; x++) {
      var w1 = Math.sin(x * 0.08 - state.time * 1.2 + y * 0.15) * 0.5 + 0.5;
      var w2 = Math.sin(x * 0.12 + state.time * 0.8 - y * 0.1) * 0.5 + 0.5;
      var w3 = Math.sin((x + y) * 0.06 + state.time * 0.5) * 0.5 + 0.5;
      var ccx = x - state.COLS / 2, ccy = y - state.ROWS / 2;
      var w4 = Math.sin(Math.sqrt(ccx * ccx + ccy * ccy) * 0.12 - state.time * 1.5) * 0.5 + 0.5;

      var v = w1 * 0.35 + w2 * 0.25 + w3 * 0.2 + w4 * 0.2;

      // Add click-spawned wave centers
      for (var wc = 0; wc < waveCenters.length; wc++) {
        var cen = waveCenters[wc];
        var cdx = x - cen.x, cdy = y - cen.y;
        var cd = Math.sqrt(cdx * cdx + cdy * cdy);
        var age = state.time - cen.born;
        var fade = Math.max(0, 1 - age / 15);
        v += Math.sin(cd * 0.25 - state.time * 2) * 0.3 * fade * Math.exp(-cd * 0.03);
      }

      v = Math.pow(Math.max(0, v), 1.2);
      if (v < 0.15) continue;

      var ci = ((x + state.time * 8) | 0) % phrase.length;
      if (ci < 0) ci += phrase.length;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = v > 0.6 ? phrase[ci] : RAMP_SOFT[ri];

      var hue = (x * 2.5 + y * 1.5 + state.time * 30) % 360;
      var sat = 60 + v * 40;
      var lit = 30 + v * 50;
      drawCharHSL(ch, x, y, hue, sat, lit);
    }
  }
}

registerMode('wave', {
  init: undefined,
  render: renderWave,
});
