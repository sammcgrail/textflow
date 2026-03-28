import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var fluidVX, fluidVY, fluidDens;

function initFluid() {
  var sz = state.COLS * state.ROWS;
  fluidVX = new Float32Array(sz);
  fluidVY = new Float32Array(sz);
  fluidDens = new Float32Array(sz);
  // Seed some initial density
  for (var i = 0; i < sz; i++) fluidDens[i] = Math.random() * 0.2;
}
// initFluid(); — called via registerMode
function renderFluid() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!fluidDens || fluidDens.length !== sz) initFluid();

  // Click adds velocity and density
  if (pointer.down && state.currentMode === 'fluid') {
    var fx = pointer.gx | 0, fy = pointer.gy | 0;
    for (var fdy = -3; fdy <= 3; fdy++) {
      for (var fdx = -3; fdx <= 3; fdx++) {
        var nx = fx + fdx, ny = fy + fdy;
        if (nx >= 1 && nx < W - 1 && ny >= 1 && ny < H - 1) {
          var idx = ny * W + nx;
          fluidDens[idx] = Math.min(fluidDens[idx] + 0.15, 1);
          // Add velocity in drag direction (based on pointer movement heuristic)
          fluidVX[idx] += (Math.random() - 0.5) * 0.3;
          fluidVY[idx] += (Math.random() - 0.5) * 0.3 - 0.1;
        }
      }
    }
  }

  // Simple advection + diffusion
  var newDens = new Float32Array(sz);
  var newVX = new Float32Array(sz);
  var newVY = new Float32Array(sz);

  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      // Advect density
      var srcX = x - fluidVX[idx];
      var srcY = y - fluidVY[idx];
      srcX = Math.max(0.5, Math.min(W - 1.5, srcX));
      srcY = Math.max(0.5, Math.min(H - 1.5, srcY));
      var sx0 = srcX | 0, sy0 = srcY | 0;
      var sx1 = sx0 + 1, sy1 = sy0 + 1;
      var fx = srcX - sx0, fy = srcY - sy0;
      newDens[idx] = (1 - fx) * (1 - fy) * fluidDens[sy0 * W + sx0] +
                     fx * (1 - fy) * fluidDens[sy0 * W + sx1] +
                     (1 - fx) * fy * fluidDens[sy1 * W + sx0] +
                     fx * fy * fluidDens[sy1 * W + sx1];

      // Diffuse velocity
      newVX[idx] = fluidVX[idx] * 0.99 + (fluidVX[idx - 1] + fluidVX[idx + 1] + fluidVX[idx - W] + fluidVX[idx + W] - 4 * fluidVX[idx]) * 0.1;
      newVY[idx] = fluidVY[idx] * 0.99 + (fluidVY[idx - 1] + fluidVY[idx + 1] + fluidVY[idx - W] + fluidVY[idx + W] - 4 * fluidVY[idx]) * 0.1;
      newDens[idx] *= 0.998;
    }
  }
  fluidDens = newDens; fluidVX = newVX; fluidVY = newVY;

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = fluidDens[y * W + x];
      if (v < 0.02) continue;
      v = Math.min(1, v);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var vel = Math.sqrt(fluidVX[y * W + x] * fluidVX[y * W + x] + fluidVY[y * W + x] * fluidVY[y * W + x]);
      var hue = (200 + vel * 100 + state.time * 10) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 15 + v * 50);
    }
  }
}

registerMode('fluid', {
  init: initFluid,
  render: renderFluid,
});
