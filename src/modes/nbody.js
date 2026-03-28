import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var nbodyParts, nbodyTrail, nbodyW, nbodyH;
function initNbody() {
  nbodyW = state.COLS; nbodyH = state.ROWS;
  nbodyTrail = new Float32Array(nbodyW * nbodyH);
  var num = state.isMobile ? 100 : 150;
  nbodyParts = [];
  var cx = nbodyW * 0.5, cy = nbodyH * 0.5;
  for (var i = 0; i < num; i++) {
    var ang = Math.random() * Math.PI * 2;
    var r = 5 + Math.random() * Math.min(nbodyW, nbodyH) * 0.3;
    var speed = 0.4 / Math.sqrt(r * 0.1 + 1);
    nbodyParts.push({
      x: cx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
      vx: -Math.sin(ang) * speed,
      vy: Math.cos(ang) * speed,
      mass: 0.5 + Math.random() * 1.5
    });
  }
}
// initNbody(); — called via registerMode
function renderNbody() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (nbodyW !== W || nbodyH !== H) initNbody();
  // Decay trail
  for (var i = 0; i < nbodyTrail.length; i++) nbodyTrail[i] *= 0.92;
  // Click spawns massive body
  if (pointer.clicked && state.currentMode === 'nbody') {
    pointer.clicked = false;
    nbodyParts.push({
      x: pointer.gx, y: pointer.gy,
      vx: 0, vy: 0, mass: 10
    });
  }
  var softening = 2.0;
  var G = 0.05;
  var n = nbodyParts.length;
  // O(N^2) force computation
  for (var i = 0; i < n; i++) {
    var pi = nbodyParts[i];
    var ax = 0, ay = 0;
    for (var j = 0; j < n; j++) {
      if (i === j) continue;
      var pj = nbodyParts[j];
      var dx = pj.x - pi.x, dy = pj.y - pi.y;
      var d2 = dx * dx + dy * dy + softening * softening;
      var inv = G * pj.mass / (d2 * Math.sqrt(d2));
      ax += dx * inv;
      ay += dy * inv;
    }
    // Pointer attraction
    if (pointer.down && state.currentMode === 'nbody') {
      var dx = pointer.gx - pi.x, dy = pointer.gy - pi.y;
      var d2 = dx * dx + dy * dy + 4;
      var inv = 2.0 / (d2 * Math.sqrt(d2));
      ax += dx * inv;
      ay += dy * inv;
    }
    pi.vx += ax;
    pi.vy += ay;
  }
  // Leapfrog integration + trail
  for (var i = 0; i < n; i++) {
    var p = nbodyParts[i];
    p.x += p.vx;
    p.y += p.vy;
    // Wrap
    if (p.x < 0) p.x += W;
    if (p.x >= W) p.x -= W;
    if (p.y < 0) p.y += H;
    if (p.y >= H) p.y -= H;
    var ix = p.x | 0, iy = p.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      nbodyTrail[iy * W + ix] = Math.min(1, nbodyTrail[iy * W + ix] + 0.2 * p.mass);
    }
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = nbodyTrail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      drawCharHSL(ch, x, y, (40 + v * 30) | 0, 80, (10 + v * 50) | 0);
    }
  }
}

registerMode('nbody', {
  init: initNbody,
  render: renderNbody,
});
