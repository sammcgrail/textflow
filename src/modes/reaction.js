import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var rxnU, rxnV, rxnW, rxnH;
function initReaction() {
  rxnW = state.COLS; rxnH = state.ROWS;
  var sz = rxnW * rxnH;
  rxnU = new Float32Array(sz).fill(1);
  rxnV = new Float32Array(sz);
  // Seed some spots of V
  for (var i = 0; i < 12; i++) {
    var cx = (Math.random() * rxnW) | 0;
    var cy = (Math.random() * rxnH) | 0;
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < rxnW && ny >= 0 && ny < rxnH) {
          rxnV[ny * rxnW + nx] = 0.5 + Math.random() * 0.25;
          rxnU[ny * rxnW + nx] = 0.25;
        }
      }
    }
  }
}
// initReaction(); — called via registerMode
function renderReaction() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (rxnW !== W || rxnH !== H) initReaction();
  var f = 0.055, k = 0.062, Du = 0.21, Dv = 0.105;
  // Click injects V
  if (pointer.down && state.currentMode === 'reaction') {
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          rxnV[ny * W + nx] = 0.5;
          rxnU[ny * W + nx] = 0.25;
        }
      }
    }
    // Pointer shifts params locally
    f = 0.03 + (pointer.gx / W) * 0.05;
    k = 0.04 + (pointer.gy / H) * 0.04;
  }
  // 2 substeps per frame
  for (var sub = 0; sub < 2; sub++) {
    var nextU = new Float32Array(W * H);
    var nextV = new Float32Array(W * H);
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var idx = y * W + x;
        var u = rxnU[idx], v = rxnV[idx];
        var lapU = rxnU[idx - 1] + rxnU[idx + 1] + rxnU[idx - W] + rxnU[idx + W] - 4 * u;
        var lapV = rxnV[idx - 1] + rxnV[idx + 1] + rxnV[idx - W] + rxnV[idx + W] - 4 * v;
        var uvv = u * v * v;
        nextU[idx] = u + Du * lapU - uvv + f * (1 - u);
        nextV[idx] = v + Dv * lapV + uvv - (f + k) * v;
      }
    }
    rxnU = nextU;
    rxnV = nextV;
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = rxnV[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * 2 * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[Math.min(ri, RAMP_DENSE.length - 1)];
      var u = rxnU[y * W + x];
      var hue = (200 + v * 160) % 360;
      drawCharHSL(ch, x, y, hue | 0, 70, (10 + v * 60) | 0);
    }
  }
}

registerMode('reaction', {
  init: initReaction,
  render: renderReaction,
});
