import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var auroraWaves = [];

function initAurora() {
  auroraWaves = [];
  // Start with a few default curtains
  for (var i = 0; i < 3; i++) {
    auroraWaves.push({
      x: state.COLS * (0.2 + i * 0.3), phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.3, born: -100
    });
  }
}
// initAurora(); — called via registerMode
function renderAurora() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (pointer.clicked && state.currentMode === 'aurora') {
    pointer.clicked = false;
    auroraWaves.push({
      x: pointer.gx, phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.4, born: state.time
    });
    if (auroraWaves.length > 12) auroraWaves.shift();
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var totalV = 0;
      var bestHue = 120;

      for (var aw = 0; aw < auroraWaves.length; aw++) {
        var wave = auroraWaves[aw];
        var dx = x - wave.x;
        var spread = 15 + Math.sin(state.time * wave.speed + wave.phase) * 5;
        var xFade = Math.exp(-dx * dx / (2 * spread * spread));

        // Vertical curtain — stronger at top
        var yFade = Math.max(0, 1 - y / (H * 0.8));
        yFade = yFade * yFade;

        // Shimmer
        var shimmer = Math.sin(y * 0.3 + x * 0.05 + state.time * wave.speed * 3 + wave.phase) * 0.5 + 0.5;
        shimmer *= Math.sin(y * 0.15 - state.time * 0.5 + wave.phase) * 0.5 + 0.5;

        var v = xFade * yFade * shimmer;
        if (wave.born > 0) {
          var age = state.time - wave.born;
          if (age < 2) v *= age / 2; // fade in
          if (age > 20) v *= Math.max(0, 1 - (age - 20) / 10);
        }

        totalV += v;
        if (v > 0.1) bestHue = (120 + aw * 40 + y * 0.5) % 360;
      }

      if (totalV < 0.03) continue;
      totalV = Math.min(1, totalV);
      var ri = Math.min(RAMP_SOFT.length - 1, (totalV * RAMP_SOFT.length) | 0);
      drawCharHSL(RAMP_SOFT[ri], x, y, bestHue, 60 + totalV * 40, 15 + totalV * 50);
    }
  }
}

registerMode('aurora', {
  init: initAurora,
  render: renderAurora,
});
