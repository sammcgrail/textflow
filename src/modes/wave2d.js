import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var wave2dA, wave2dB, wave2dC, wave2dW, wave2dH;
function initWave2d() {
  wave2dW = state.COLS; wave2dH = state.ROWS;
  var sz = wave2dW * wave2dH;
  wave2dA = new Float32Array(sz);
  wave2dB = new Float32Array(sz);
  wave2dC = new Float32Array(sz);
  // Drop initial stones for visual interest
  for (var i = 0; i < 5; i++) {
    var sx = (Math.random() * wave2dW * 0.6 + wave2dW * 0.2) | 0;
    var sy = (Math.random() * wave2dH * 0.6 + wave2dH * 0.2) | 0;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var nx = sx + dx, ny = sy + dy;
        if (nx >= 0 && nx < wave2dW && ny >= 0 && ny < wave2dH) {
          wave2dA[ny * wave2dW + nx] = (1 - Math.sqrt(dx*dx+dy*dy)/3) * 0.8;
        }
      }
    }
  }
}
// initWave2d(); — called via registerMode
function renderWave2d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (wave2dW !== W || wave2dH !== H) initWave2d();
  // Click drops stones
  if (pointer.down && state.currentMode === 'wave2d') {
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    if (gx > 0 && gx < W - 1 && gy > 0 && gy < H - 1) {
      if (pointer.clicked) {
        pointer.clicked = false; // consume flag — else it re-fires every frame
        wave2dA[gy * W + gx] = 2.0;
      } else {
        // Oscillating source when held
        wave2dA[gy * W + gx] = Math.sin(state.time * 10) * 1.5;
      }
    }
  }
  // Wave equation step
  var damping = 0.995;
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      var lap = wave2dA[idx - 1] + wave2dA[idx + 1] + wave2dA[idx - W] + wave2dA[idx + W] - 4 * wave2dA[idx];
      wave2dC[idx] = (2 * wave2dA[idx] - wave2dB[idx] + lap * 0.45) * damping;
    }
  }
  // Rotate buffers
  var tmp = wave2dB;
  wave2dB = wave2dA;
  wave2dA = wave2dC;
  wave2dC = tmp;
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = wave2dA[y * W + x];
      var av = Math.abs(v);
      if (av < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (av * RAMP_DENSE.length * 0.5) | 0);
      var ch = RAMP_DENSE[ri];
      if (v > 0) {
        drawChar(ch, x, y, 80, (100 + v * 150) | 0, 255, Math.min(1, av));
      } else {
        drawChar(ch, x, y, 80, 80, (100 - v * 150) | 0, Math.min(1, av));
      }
    }
  }
}

registerMode('wave2d', {
  init: initWave2d,
  render: renderWave2d,
});
