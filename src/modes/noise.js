import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var noiseP = [];
function initNoise() {
  noiseP = [];
  for (var i = 0; i < 512; i++) noiseP[i] = (Math.random() * 256) | 0;
}
// initNoise(); — called via registerMode
function noiseLerp(a, b, t) { return a + (b - a) * t; }
function noiseVal(px, py) {
  var xi = Math.floor(px) & 255, yi = Math.floor(py) & 255;
  var xf = px - Math.floor(px), yf = py - Math.floor(py);
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var aa = noiseP[(noiseP[xi] + yi) & 255] / 255;
  var ab = noiseP[(noiseP[xi] + yi + 1) & 255] / 255;
  var ba = noiseP[(noiseP[(xi + 1) & 255] + yi) & 255] / 255;
  var bb = noiseP[(noiseP[(xi + 1) & 255] + yi + 1) & 255] / 255;
  return noiseLerp(noiseLerp(aa, ba, u), noiseLerp(ab, bb, u), v);
}
function noiseFbm(px, py) {
  var val = 0, amp = 0.5, freq = 1;
  for (var i = 0; i < 4; i++) {
    val += noiseVal(px * freq, py * freq) * amp;
    amp *= 0.5; freq *= 2;
  }
  return val;
}

function renderNoise() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time * 0.4;
  var lx = pointer.down && state.currentMode === 'noise' ? pointer.gx : -999;
  var ly = pointer.down && state.currentMode === 'noise' ? pointer.gy : -999;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x * 0.06 + t, ny = y * 0.1 + t * 0.7;
      // Pointer lens distortion
      var ddx = x - lx, ddy = y - ly;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd < 8) {
        var warp = (1 - dd / 8) * 3;
        nx += Math.sin(dd + state.time * 5) * warp;
        ny += Math.cos(dd + state.time * 5) * warp;
      }
      var v = noiseFbm(nx, ny);
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      var hue = (v * 360 + state.time * 30) % 360;
      drawCharHSL(ch, x, y, hue | 0, 60, (10 + v * 45) | 0);
    }
  }
}

registerMode('noise', {
  init: initNoise,
  render: renderNoise,
});
