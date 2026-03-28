import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var boidList, boidPred, boidCount, boidW, boidH;
function initBoids() {
  boidW = state.COLS; boidH = state.ROWS;
  boidCount = state.isMobile ? 100 : 200;
  boidList = [];
  for (var i = 0; i < boidCount; i++) {
    boidList.push({
      x: Math.random() * boidW,
      y: Math.random() * boidH,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4
    });
  }
  boidPred = { x: boidW * 0.5, y: boidH * 0.5, vx: 1, vy: 1 };
}
// initBoids(); — called via registerMode
function renderBoids() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (boidW !== W || boidH !== H) initBoids();
  var sep = 3, ali = 5, coh = 5, predR = 10, maxSpd = 8;
  // Update predator — chase nearest boid
  var nearest = null, nearDist = 999;
  for (var i = 0; i < boidCount; i++) {
    var dx = boidList[i].x - boidPred.x, dy = boidList[i].y - boidPred.y;
    var d = dx * dx + dy * dy;
    if (d < nearDist) { nearDist = d; nearest = boidList[i]; }
  }
  if (nearest) {
    boidPred.vx += (nearest.x - boidPred.x) * 0.02;
    boidPred.vy += (nearest.y - boidPred.y) * 0.02;
  }
  var ps = Math.sqrt(boidPred.vx * boidPred.vx + boidPred.vy * boidPred.vy);
  if (ps > 6) { boidPred.vx *= 6 / ps; boidPred.vy *= 6 / ps; }
  boidPred.x += boidPred.vx; boidPred.y += boidPred.vy;
  if (boidPred.x < 0) boidPred.x = W; if (boidPred.x > W) boidPred.x = 0;
  if (boidPred.y < 0) boidPred.y = H; if (boidPred.y > H) boidPred.y = 0;
  // Pointer as second predator
  var px2 = -999, py2 = -999;
  if (pointer.down && state.currentMode === 'boids') { px2 = pointer.gx; py2 = pointer.gy; }
  // Update boids
  for (var i = 0; i < boidCount; i++) {
    var b = boidList[i];
    var sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, sc = 0, ac = 0, cc = 0;
    for (var j = 0; j < boidCount; j++) {
      if (i === j) continue;
      var dx = boidList[j].x - b.x, dy = boidList[j].y - b.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < sep) { sx -= dx / (d + 0.1); sy -= dy / (d + 0.1); sc++; }
      if (d < ali) { ax += boidList[j].vx; ay += boidList[j].vy; ac++; }
      if (d < coh) { cx += boidList[j].x; cy += boidList[j].y; cc++; }
    }
    if (sc > 0) { b.vx += sx * 0.15; b.vy += sy * 0.15; }
    if (ac > 0) { b.vx += (ax / ac - b.vx) * 0.05; b.vy += (ay / ac - b.vy) * 0.05; }
    if (cc > 0) { b.vx += (cx / cc - b.x) * 0.005; b.vy += (cy / cc - b.y) * 0.005; }
    // Flee predator
    var dpx = b.x - boidPred.x, dpy = b.y - boidPred.y;
    var dp = Math.sqrt(dpx * dpx + dpy * dpy);
    if (dp < predR) { b.vx += dpx / (dp + 0.1) * 2; b.vy += dpy / (dp + 0.1) * 2; }
    // Flee pointer
    var dpx2 = b.x - px2, dpy2 = b.y - py2;
    var dp2 = Math.sqrt(dpx2 * dpx2 + dpy2 * dpy2);
    if (dp2 < predR) { b.vx += dpx2 / (dp2 + 0.1) * 2; b.vy += dpy2 / (dp2 + 0.1) * 2; }
    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > maxSpd) { b.vx *= maxSpd / spd; b.vy *= maxSpd / spd; }
    b.x += b.vx * 0.5; b.y += b.vy * 0.5;
    if (b.x < 0) b.x += W; if (b.x >= W) b.x -= W;
    if (b.y < 0) b.y += H; if (b.y >= H) b.y -= H;
    var ix = b.x | 0, iy = b.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      drawCharHSL('>', ix, iy, 200, 80, 55);
    }
  }
  // Draw predator
  var pix = boidPred.x | 0, piy = boidPred.y | 0;
  if (pix >= 0 && pix < W && piy >= 0 && piy < H) drawChar('@', pix, piy, 255, 50, 50, 1);
}

registerMode('boids', {
  init: initBoids,
  render: renderBoids,
});
