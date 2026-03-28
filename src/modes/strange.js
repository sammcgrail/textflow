import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var strangeDensity, strangeW, strangeH, strangeType, strangeTimer;
function initStrange() {
  strangeW = state.COLS; strangeH = state.ROWS;
  strangeDensity = new Float32Array(strangeW * strangeH);
  strangeType = 0;
  strangeTimer = 0;
}
// initStrange(); — called via registerMode
function renderStrange() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (strangeW !== W || strangeH !== H) initStrange();
  strangeTimer += 0.016;
  if (strangeTimer > 8) { strangeTimer = 0; strangeType = (strangeType + 1) % 5; strangeDensity = new Float32Array(W * H); }
  // Decay
  for (var i = 0; i < strangeDensity.length; i++) strangeDensity[i] *= 0.96;
  // Pointer controls 3D rotation
  var rotX = pointer.down && state.currentMode === 'strange' ? (pointer.gy / H - 0.5) * 2 : Math.sin(state.time * 0.3) * 0.5;
  var rotY = pointer.down && state.currentMode === 'strange' ? (pointer.gx / W - 0.5) * 2 : state.time * 0.2;
  var steps = state.isMobile ? 3000 : 5000;
  // Integrate attractor
  var x = 0.1, y = 0.1, z = 0.1;
  var dt = 0.005;
  for (var s = 0; s < steps; s++) {
    var dx, dy, dz;
    if (strangeType === 0) {
      // Rossler
      var a = 0.2, b = 0.2, c = 5.7;
      dx = (-y - z) * dt;
      dy = (x + a * y) * dt;
      dz = (b + z * (x - c)) * dt;
    } else if (strangeType === 1) {
      // Aizawa
      var a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
      dx = ((z - b) * x - d * y) * dt;
      dy = (d * x + (z - b) * y) * dt;
      dz = (c + a * z - z * z * z / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x) * dt;
    } else if (strangeType === 2) {
      // Thomas
      var b = 0.208186;
      dx = (Math.sin(y) - b * x) * dt * 2;
      dy = (Math.sin(z) - b * y) * dt * 2;
      dz = (Math.sin(x) - b * z) * dt * 2;
    } else if (strangeType === 3) {
      // Halvorsen
      var a = 1.89;
      dx = (-a * x - 4 * y - 4 * z - y * y) * dt * 0.3;
      dy = (-a * y - 4 * z - 4 * x - z * z) * dt * 0.3;
      dz = (-a * z - 4 * x - 4 * y - x * x) * dt * 0.3;
    } else {
      // Dadras
      var p = 3, q = 2.7, r = 1.7, s2 = 2, e = 9;
      dx = (y - p * x + q * y * z) * dt * 0.3;
      dy = (r * y - x * z + z) * dt * 0.3;
      dz = (s2 * x * y - e * z) * dt * 0.3;
    }
    x += dx; y += dy; z += dz;
    // Apply rotation
    var rx = x * Math.cos(rotY) - z * Math.sin(rotY);
    var rz = x * Math.sin(rotY) + z * Math.cos(rotY);
    var ry = y * Math.cos(rotX) - rz * Math.sin(rotX);
    // Project to screen
    var scale = Math.min(W, H) * 0.15;
    var sx = ((rx * scale) + W * 0.5) | 0;
    var sy = ((ry * scale) + H * 0.5) | 0;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      strangeDensity[sy * W + sx] = Math.min(1, strangeDensity[sy * W + sx] + 0.01);
    }
  }
  // Draw
  var hueBase = strangeType * 72;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = strangeDensity[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      drawCharHSL(ch, x, y, (hueBase + v * 60) | 0, 80, (10 + v * 55) | 0);
    }
  }
}

registerMode('strange', {
  init: initStrange,
  render: renderStrange,
});
