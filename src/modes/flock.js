import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var boids = [];
var NUM_BOIDS = 250;
var flockTrail;

function initFlock() {
  boids = [];
  for (var i = 0; i < NUM_BOIDS; i++) {
    boids.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2
    });
  }
  flockTrail = new Float32Array(state.COLS * state.ROWS);
}
// initFlock(); — called via registerMode
function renderFlock() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!flockTrail || flockTrail.length !== W * H) initFlock();

  // Decay trails
  for (var i = 0; i < flockTrail.length; i++) flockTrail[i] *= 0.93;

  // Update boids
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];
    var sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0;
    var sc = 0, ac = 0, cc = 0;

    // Click attracts flock toward cursor
    if (pointer.down && state.currentMode === 'flock') {
      var fdx = pointer.gx - b.x, fdy = pointer.gy - b.y;
      var fd = Math.sqrt(fdx * fdx + fdy * fdy) + 1;
      b.vx += fdx / fd * 0.15; b.vy += fdy / fd * 0.15;
    }

    for (var j = 0; j < boids.length; j += 3) { // sample every 3rd for perf
      if (i === j) continue;
      var o = boids[j];
      var dx = o.x - b.x, dy = o.y - b.y;
      var d = dx * dx + dy * dy;
      if (d < 9 && d > 0) { sx -= dx / d; sy -= dy / d; sc++; } // separation
      if (d < 64) { ax += o.vx; ay += o.vy; ac++; } // alignment
      if (d < 144) { cx += dx; cy += dy; cc++; } // cohesion
    }

    if (sc > 0) { b.vx += sx * 0.15; b.vy += sy * 0.15; }
    if (ac > 0) { b.vx += (ax / ac - b.vx) * 0.05; b.vy += (ay / ac - b.vy) * 0.05; }
    if (cc > 0) { b.vx += (cx / cc) * 0.005; b.vy += (cy / cc) * 0.005; }

    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 1.5) { b.vx = b.vx / spd * 1.5; b.vy = b.vy / spd * 1.5; }
    if (spd < 0.3) { b.vx *= 1.5; b.vy *= 1.5; }

    b.x += b.vx; b.y += b.vy;
    if (b.x < 0) b.x += W; if (b.x >= W) b.x -= W;
    if (b.y < 0) b.y += H; if (b.y >= H) b.y -= H;

    var gx = b.x | 0, gy = b.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      flockTrail[gy * W + gx] = Math.min(flockTrail[gy * W + gx] + 0.5, 1);
    }
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = flockTrail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (30 + v * 30) % 360; // warm yellow-orange
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + v * 30, 25 + v * 50);
    }
  }
}

registerMode('flock', {
  init: initFlock,
  render: renderFlock,
});
