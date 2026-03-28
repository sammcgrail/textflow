import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var lorenzParts, lorenzDensity, lorenzW, lorenzH;
function initLorenz() {
  lorenzW = state.COLS; lorenzH = state.ROWS;
  lorenzDensity = new Float32Array(lorenzW * lorenzH);
  lorenzParts = [];
  for (var i = 0; i < 300; i++) {
    lorenzParts.push({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random() * 30 + 10
    });
  }
}
// initLorenz(); — called via registerMode
function renderLorenz() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (lorenzW !== W || lorenzH !== H) initLorenz();
  var sigma = 10, rho = 28, beta = 8 / 3;
  if (pointer.down && state.currentMode === 'lorenz') {
    rho = 10 + (pointer.gx / W) * 40;
    sigma = 5 + (pointer.gy / H) * 20;
  }
  // Decay density
  for (var i = 0; i < lorenzDensity.length; i++) lorenzDensity[i] *= 0.92;
  // Integrate particles
  var dt = 0.005;
  for (var i = 0; i < lorenzParts.length; i++) {
    var p = lorenzParts[i];
    for (var s = 0; s < 5; s++) {
      var dx = sigma * (p.y - p.x) * dt;
      var dy = (p.x * (rho - p.z) - p.y) * dt;
      var dz = (p.x * p.y - beta * p.z) * dt;
      p.x += dx; p.y += dy; p.z += dz;
    }
    // Project 3D -> 2D
    var sx = ((p.x / 50 + 0.5) * W) | 0;
    var sy = ((p.z / 60) * H) | 0;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      lorenzDensity[sy * W + sx] = Math.min(1, lorenzDensity[sy * W + sx] + 0.15);
    }
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = lorenzDensity[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      drawCharHSL(ch, x, y, (270 + v * 60) | 0, 80, (10 + v * 50) | 0);
    }
  }
}

registerMode('lorenz', {
  init: initLorenz,
  render: renderLorenz,
});
