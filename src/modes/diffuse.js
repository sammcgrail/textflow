import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var diffuseGrid;
var diffuseHueGrid;

function initDiffuse() {
  var sz = state.COLS * state.ROWS;
  diffuseGrid = new Float32Array(sz);
  diffuseHueGrid = new Float32Array(sz);
}
// initDiffuse(); — called via registerMode
function renderDiffuse() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!diffuseGrid || diffuseGrid.length !== sz) initDiffuse();

  // Click to drop ink
  if (pointer.down && state.currentMode === 'diffuse') {
    var ix = pointer.gx | 0, iy = pointer.gy | 0;
    var inkHue = (state.time * 30) % 360;
    for (var idy = -1; idy <= 1; idy++) {
      for (var idx = -1; idx <= 1; idx++) {
        var nx = ix + idx, ny = iy + idy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          var ii = ny * W + nx;
          diffuseGrid[ii] = Math.min(1, diffuseGrid[ii] + 0.3);
          diffuseHueGrid[ii] = inkHue;
        }
      }
    }
  }

  // Diffuse
  var newGrid = new Float32Array(sz);
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      var avg = (diffuseGrid[idx - 1] + diffuseGrid[idx + 1] + diffuseGrid[idx - W] + diffuseGrid[idx + W]) * 0.25;
      newGrid[idx] = diffuseGrid[idx] * 0.95 + avg * 0.05;
      newGrid[idx] *= 0.9995;
      // Blend hue
      if (avg > diffuseGrid[idx] * 0.5) {
        diffuseHueGrid[idx] = diffuseHueGrid[idx] * 0.95 +
          (diffuseHueGrid[idx - 1] + diffuseHueGrid[idx + 1] + diffuseHueGrid[idx - W] + diffuseHueGrid[idx + W]) * 0.0125;
      }
    }
  }
  diffuseGrid = newGrid;

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = diffuseGrid[y * W + x];
      if (v < 0.02) continue;
      v = Math.min(1, v);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = diffuseHueGrid[y * W + x] % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 15 + v * 50);
    }
  }
}

registerMode('diffuse', {
  init: initDiffuse,
  render: renderDiffuse,
});
