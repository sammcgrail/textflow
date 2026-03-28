import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var sfDens, sfTempDens;
var sfEmitters = [
  { cx: 0.25, cy: 0.4, orbitR: 0.14, freq: 0.3, phase: 0, strength: 0.18 },
  { cx: 0.7, cy: 0.35, orbitR: 0.1, freq: 0.25, phase: 2.1, strength: 0.15 },
  { cx: 0.45, cy: 0.65, orbitR: 0.16, freq: 0.35, phase: 4.2, strength: 0.2 },
  { cx: 0.8, cy: 0.6, orbitR: 0.08, freq: 0.4, phase: 1.0, strength: 0.14 }
];

function initSmoothfluid() {
  var sz = state.COLS * state.ROWS;
  sfDens = new Float32Array(sz);
  sfTempDens = new Float32Array(sz);
}
// initSmoothfluid(); — called via registerMode
function renderSmoothfluid() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!sfDens || sfDens.length !== sz) initSmoothfluid();

  var t = state.time;
  var aspect = state.CHAR_W / state.CHAR_H;
  var aspect2 = aspect * aspect;

  // Click injects density with velocity impulse
  if (pointer.down && state.currentMode === 'smoothfluid') {
    var fx = pointer.gx | 0, fy = pointer.gy | 0;
    for (var dy = -5; dy <= 5; dy++) {
      for (var dx = -5; dx <= 5; dx++) {
        var nx = fx + dx, ny = fy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          var drScaled = dy / aspect;
          var dist = Math.sqrt(drScaled * drScaled + dx * dx);
          var s = Math.max(0, 1 - dist / 6);
          sfDens[ny * W + nx] = Math.min(1, sfDens[ny * W + nx] + s * 0.3);
        }
      }
    }
  }

  // Semi-lagrangian advection with multi-frequency velocity field
  for (var r = 0; r < H; r++) {
    for (var c = 0; c < W; c++) {
      var nx = c / W, ny = r / H;
      // Multi-octave velocity (somnai style — 3 frequency layers)
      var vx = Math.sin(ny * 6.28 + t * 0.3) * 2
             + Math.cos((nx + ny) * 12.5 + t * 0.55) * 0.7
             + Math.sin(nx * 25 + ny * 18 + t * 0.8) * 0.25;
      var vy = Math.cos(nx * 5 + t * 0.4) * 1.5
             + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8
             + Math.cos(nx * 18 - ny * 25 + t * 0.7) * 0.25;
      // Aspect-ratio correction on vertical velocity
      vy *= aspect;
      // Backwards advection with bilinear interpolation
      var sx = Math.max(0, Math.min(W - 1.001, c - vx));
      var sy = Math.max(0, Math.min(H - 1.001, r - vy));
      var x0 = sx | 0, y0 = sy | 0;
      var x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
      var ffx = sx - x0, ffy = sy - y0;
      sfTempDens[r * W + c] = sfDens[y0 * W + x0] * (1 - ffx) * (1 - ffy)
        + sfDens[y0 * W + x1] * ffx * (1 - ffy)
        + sfDens[y1 * W + x0] * (1 - ffx) * ffy
        + sfDens[y1 * W + x1] * ffx * ffy;
    }
  }
  var swap = sfDens; sfDens = sfTempDens; sfTempDens = swap;

  // Aspect-ratio-corrected diffusion pass (somnai's technique)
  // Horizontal neighbors weighted by 1, vertical by aspect^2
  for (var r = 1; r < H - 1; r++) {
    for (var c = 1; c < W - 1; c++) {
      var i = r * W + c;
      var avg = (sfDens[i - 1] + sfDens[i + 1] + (sfDens[i - W] + sfDens[i + W]) * aspect2) / (2 + 2 * aspect2);
      sfTempDens[i] = sfDens[i] * 0.92 + avg * 0.08;
    }
  }
  swap = sfDens; sfDens = sfTempDens; sfTempDens = swap;

  // Orbiting emitters
  var spread = 4;
  for (var ei = 0; ei < sfEmitters.length; ei++) {
    var e = sfEmitters[ei];
    var ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * W;
    var ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * H;
    var ec = ex | 0, er = ey | 0;
    for (var dr = -spread; dr <= spread; dr++) {
      for (var dc = -spread; dc <= spread; dc++) {
        var rr = er + dr, cc = ec + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
          var drScaled = dr / aspect;
          var dist = Math.sqrt(drScaled * drScaled + dc * dc);
          var s = Math.max(0, 1 - dist / (spread + 1));
          sfDens[rr * W + cc] = Math.min(1, sfDens[rr * W + cc] + s * e.strength);
        }
      }
    }
  }

  // Global decay
  for (var i = 0; i < sz; i++) sfDens[i] *= 0.984;

  // Render — gradient from cool blue to hot white
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = sfDens[y * W + x];
      if (v < 0.02) continue;
      v = Math.min(1, v);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      // Somnai-style color: cold=deep blue, warm=cyan, hot=white
      var hue = 220 - v * 40;
      var sat = 80 - v * 60;
      var lit = 10 + v * 70;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, sat, lit);
    }
  }
}

registerMode('smoothfluid', {
  init: initSmoothfluid,
  render: renderSmoothfluid,
});
