import { RAMP_FIRE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var fireBuffer;
function initFire() {
  fireBuffer = new Float32Array(state.COLS * (state.ROWS + 2));
}
// initFire(); — called via registerMode
var fireColors = [
  [20,5,0], [80,15,0], [180,40,0], [220,90,10],
  [255,150,20], [255,200,60], [255,240,150], [255,255,220]
];

function renderFire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS + 2;

  if (!fireBuffer || fireBuffer.length !== W * H) {
    fireBuffer = new Float32Array(W * H);
  }

  // Click to add fire fuel at cursor
  if (pointer.down && state.currentMode === 'fire') {
    var fx = pointer.gx | 0, fy = (pointer.gy | 0);
    for (var fdx = -3; fdx <= 3; fdx++) {
      for (var fdy = -2; fdy <= 2; fdy++) {
        var nx = fx + fdx, ny = fy + fdy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          fireBuffer[ny * W + nx] = 0.9 + Math.random() * 0.1;
        }
      }
    }
  }

  for (var x = 0; x < W; x++) {
    fireBuffer[(H - 1) * W + x] = Math.random() > 0.4 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.3;
  }

  for (var y = 0; y < H - 1; y++) {
    for (var x = 0; x < W; x++) {
      var y1 = y + 1;
      var y2 = Math.min(H - 1, y + 2);
      var xl = x > 0 ? x - 1 : 0;
      var xr = x < W - 1 ? x + 1 : W - 1;
      var v = (fireBuffer[y1 * W + x] + fireBuffer[y1 * W + xl] + fireBuffer[y1 * W + xr] + fireBuffer[y2 * W + x]) * 0.25;
      v = v * (0.97 - Math.random() * 0.02) - 0.008;
      fireBuffer[y * W + x] = v > 0 ? v : 0;
    }
  }

  for (var y = 0; y < state.ROWS; y++) {
    for (var x = 0; x < W; x++) {
      var v = fireBuffer[y * W + x];
      if (v < 0.05) continue;
      var ci = Math.min(7, (v * 8) | 0);
      var c = fireColors[ci];
      var ri = Math.min(RAMP_FIRE.length - 1, (v * RAMP_FIRE.length) | 0);
      drawChar(RAMP_FIRE[ri], x, y, c[0], c[1], c[2], 0.3 + v * 0.7);
    }
  }
}

registerMode('fire', {
  init: initFire,
  render: renderFire,
});
