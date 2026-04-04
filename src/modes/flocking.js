import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var flBoids, flTrails, flWalls, flFood, flW, flH;
function initFlocking() {
  flW = state.COLS; flH = state.ROWS;
  flBoids = []; flWalls = []; flFood = [];
  flTrails = new Float32Array(flW * flH);
  var ar = state.CHAR_W / state.CHAR_H;
  for (var i = 0; i < 80; i++) {
    var flock = (i / 20) | 0;
    flBoids.push({
      x: Math.random() * flW, y: Math.random() * flH,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      flock: flock
    });
  }
}
function renderFlocking() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!flBoids || flW !== W || flH !== H) initFlocking();
  if (pointer.clicked && state.currentMode === 'flocking') {
    pointer.clicked = false;
    flFood.push({x: pointer.gx, y: pointer.gy, life: 300});
  } else if (pointer.down && state.currentMode === 'flocking') {
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) flWalls.push({x: gx, y: gy});
    if (flWalls.length > 200) flWalls.shift();
  }
  // Decay trails
  for (var i = 0; i < W * H; i++) {
    flTrails[i] *= 0.96;
  }
  // Remove expired food
  for (var i = flFood.length - 1; i >= 0; i--) {
    flFood[i].life--;
    if (flFood[i].life <= 0) flFood.splice(i, 1);
  }
  // Update boids
  for (var i = 0; i < flBoids.length; i++) {
    var b = flBoids[i];
    var sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, sn = 0, cn = 0;
    for (var j = 0; j < flBoids.length; j++) {
      if (i === j) continue;
      var dx = flBoids[j].x - b.x, dy = flBoids[j].y - b.y;
      var d = Math.sqrt(dx * dx * ar * ar + dy * dy);
      if (d < 8 && flBoids[j].flock === b.flock) {
        if (d < 2) { sx -= dx; sy -= dy; } // separation
        ax += flBoids[j].vx; ay += flBoids[j].vy; sn++;
        cx += dx; cy += dy; cn++;
      }
    }
    if (sn > 0) { b.vx += ax / sn * 0.05; b.vy += ay / sn * 0.05; }
    if (cn > 0) { b.vx += cx / cn * 0.01; b.vy += cy / cn * 0.01; }
    b.vx += sx * 0.05; b.vy += sy * 0.05;
    // Food attraction
    for (var f = 0; f < flFood.length; f++) {
      var dx = flFood[f].x - b.x, dy = flFood[f].y - b.y;
      var d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (d < 15) { b.vx += dx / d * 0.03; b.vy += dy / d * 0.03; }
    }
    // Wall repulsion
    for (var w = 0; w < flWalls.length; w++) {
      var dx = flWalls[w].x - b.x, dy = flWalls[w].y - b.y;
      var d = dx * dx + dy * dy;
      if (d < 9 && d > 0) { b.vx -= dx / d * 0.5; b.vy -= dy / d * 0.5; }
    }
    // Speed limit
    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 0.8) { b.vx = b.vx / spd * 0.8; b.vy = b.vy / spd * 0.8; }
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0) b.x += W; if (b.x >= W) b.x -= W;
    if (b.y < 0) b.y += H; if (b.y >= H) b.y -= H;
    var ti = ((b.y | 0) * W + (b.x | 0));
    if (ti >= 0 && ti < W * H) flTrails[ti] = Math.min(1, flTrails[ti] + 0.3);
  }
  // Draw trails
  var flockHues = [200, 30, 320, 130];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = flTrails[y * W + x];
      if (v < 0.05) continue;
      var ri = (v * (RAMP_DENSE.length - 1)) | 0;
      drawCharHSL(RAMP_DENSE[ri], x, y, 200, 40, (10 + v * 30) | 0);
    }
  }
  // Draw boids
  for (var i = 0; i < flBoids.length; i++) {
    var b = flBoids[i];
    var bx = (b.x) | 0, by = (b.y) | 0;
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      drawCharHSL('>', bx, by, flockHues[b.flock % 4], 70, 45);
    }
  }
  // Draw food
  for (var f = 0; f < flFood.length; f++) {
    var fx = (flFood[f].x) | 0, fy = (flFood[f].y) | 0;
    if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
      drawCharHSL('*', fx, fy, 60, 80, 50);
    }
  }
}
registerMode('flocking', { init: initFlocking, render: renderFlocking });
