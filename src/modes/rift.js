import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var riftU, riftV, riftUNew, riftVNew;

function initRift() {
  var sz = state.COLS * state.ROWS;
  riftU = new Float32Array(sz);
  riftV = new Float32Array(sz);
  riftUNew = new Float32Array(sz);
  riftVNew = new Float32Array(sz);
  for (var i = 0; i < sz; i++) { riftU[i] = 1; riftV[i] = 0; }
  // Seed several spots
  for (var s = 0; s < 8; s++) {
    var cx = Math.floor(Math.random() * (state.COLS - 20)) + 10;
    var cy = Math.floor(Math.random() * (state.ROWS - 10)) + 5;
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < state.COLS && ny >= 0 && ny < state.ROWS) {
          var idx = ny * state.COLS + nx;
          riftU[idx] = 0.5 + Math.random() * 0.1;
          riftV[idx] = 0.25 + Math.random() * 0.1;
        }
      }
    }
  }
}
// initRift(); — called via registerMode
function renderRift() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!riftU || riftU.length !== sz) initRift();

  // Click to seed new reaction spots
  if (pointer.clicked && state.currentMode === 'rift') {
    pointer.clicked = false;
    var rx = pointer.gx | 0, ry = pointer.gy | 0;
    for (var rdy = -4; rdy <= 4; rdy++) {
      for (var rdx = -4; rdx <= 4; rdx++) {
        var rnx = rx + rdx, rny = ry + rdy;
        if (rnx >= 0 && rnx < W && rny >= 0 && rny < H) {
          var ridx = rny * W + rnx;
          riftU[ridx] = 0.5 + Math.random() * 0.1;
          riftV[ridx] = 0.25 + Math.random() * 0.1;
        }
      }
    }
  }

  var Du = 0.16, Dv = 0.08, f = 0.055, k = 0.062, dt = 1.0;
  if (!riftUNew || riftUNew.length !== sz) { riftUNew = new Float32Array(sz); riftVNew = new Float32Array(sz); }

  for (var step = 0; step < 8; step++) {
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        var idx = y * W + x;
        var u = riftU[idx], v = riftV[idx];
        var lapU = riftU[idx-1] + riftU[idx+1] + riftU[idx-W] + riftU[idx+W] - 4*u;
        var lapV = riftV[idx-1] + riftV[idx+1] + riftV[idx-W] + riftV[idx+W] - 4*v;
        var uvv = u * v * v;
        riftUNew[idx] = u + (Du * lapU - uvv + f * (1 - u)) * dt;
        riftVNew[idx] = v + (Dv * lapV + uvv - (f + k) * v) * dt;
      }
    }
    var tmp = riftU; riftU = riftUNew; riftUNew = tmp;
    tmp = riftV; riftV = riftVNew; riftVNew = tmp;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = riftV[y * W + x];
      if (v < 0.05) continue;
      var t = Math.min(v * 4, 1);
      var ri = Math.min(RAMP_DENSE.length - 1, (t * RAMP_DENSE.length) | 0);
      var hue = (200 + t * 60 + state.time * 10) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + t * 30, 25 + t * 50);
    }
  }
}

registerMode('rift', {
  init: initRift,
  render: renderRift,
});
