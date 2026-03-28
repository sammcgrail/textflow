import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Roto interaction: click to shift rotation center
var rotoCX, rotoCY;
function renderRoto() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var angle = state.time * 0.3;
  var scale = 1.5 + Math.sin(state.time * 0.7) * 0.8;
  var cosA = Math.cos(angle), sinA = Math.sin(angle);
  var cx = W / 2, cy = H / 2;

  if (pointer.down && state.currentMode === 'roto') {
    rotoCX = pointer.gx; rotoCY = pointer.gy;
  }
  if (rotoCX !== undefined) {
    cx = cx * 0.97 + rotoCX * 0.03;
    cy = cy * 0.97 + rotoCY * 0.03;
    rotoCX = cx; rotoCY = cy;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = y - cy;
      var tx = (dx * cosA - dy * sinA) * scale;
      var ty = (dx * sinA + dy * cosA) * scale;

      // XOR texture
      var ix = ((tx | 0) % 32 + 32) % 32;
      var iy = ((ty | 0) % 32 + 32) % 32;
      var v = ((ix ^ iy) & 31) / 31;

      // Second layer
      var angle2 = state.time * -0.2;
      var scale2 = 2 + Math.cos(state.time * 0.5) * 0.5;
      var cosB = Math.cos(angle2), sinB = Math.sin(angle2);
      var tx2 = (dx * cosB - dy * sinB) * scale2;
      var ty2 = (dx * sinB + dy * cosB) * scale2;
      var ix2 = ((tx2 | 0) % 16 + 16) % 16;
      var iy2 = ((ty2 | 0) % 16 + 16) % 16;
      var v2 = ((ix2 ^ iy2) & 15) / 15;

      var combined = (v + v2) * 0.5;
      if (combined < 0.1) continue;

      var ri = Math.min(RAMP_DENSE.length - 1, (combined * RAMP_DENSE.length) | 0);
      var hue = (combined * 360 + state.time * 40) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + combined * 30, 20 + combined * 50);
    }
  }
}

registerMode('roto', {
  init: undefined,
  render: renderRoto,
});
