import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ocFish;
function initOcean() {
  ocFish = [];
  for (var i = 0; i < 15; i++) {
    ocFish.push({
      x: Math.random() * state.COLS,
      y: state.ROWS * 0.4 + Math.random() * state.ROWS * 0.5,
      speed: 0.2 + Math.random() * 0.5,
      dir: Math.random() < 0.5 ? 1 : -1,
      hue: (Math.random() * 360) | 0,
      size: Math.random() < 0.3 ? 2 : 1
    });
  }
}
function renderOcean() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!ocFish) initOcean();
  var t = state.time;
  var waterLine = (H * 0.25) | 0;
  // Sky gradient
  for (var y = 0; y < waterLine; y++) {
    for (var x = 0; x < W; x++) {
      var grad = y / waterLine;
      if (grad > 0.7) drawCharHSL('~', x, y, 210, 40, (8 + grad * 10) | 0);
    }
  }
  // Surface waves
  for (var x = 0; x < W; x++) {
    var wave = Math.sin(x * 0.15 - t * 1.5) * 1.5 + Math.sin(x * 0.08 + t * 0.7) * 0.8;
    var wy = (waterLine + wave) | 0;
    if (wy >= 0 && wy < H) drawCharHSL('~', x, wy, 200, 60, 40);
    if (wy + 1 < H) drawCharHSL('~', x, wy + 1, 200, 50, 30);
  }
  // Underwater
  for (var y = waterLine + 2; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var depth = (y - waterLine) / (H - waterLine);
      var current = Math.sin(x * 0.05 + y * 0.1 - t * 0.3 + depth * 2) * 0.5 + 0.5;
      if (current > 0.85) drawCharHSL('.', x, y, 200, 30, (5 + (1-depth) * 10) | 0);
    }
  }
  // Fish
  for (var i = 0; i < ocFish.length; i++) {
    var f = ocFish[i];
    f.x += f.speed * f.dir;
    if (f.x > W + 5) { f.x = -5; f.dir = 1; }
    if (f.x < -5) { f.x = W + 5; f.dir = -1; }
    f.y += Math.sin(t * 2 + i) * 0.05;
    var fx = f.x | 0, fy = f.y | 0;
    if (fy < waterLine + 2 || fy >= H) continue;
    if (f.dir > 0) {
      if (fx-1 >= 0 && fx-1 < W) drawCharHSL('<', fx-1, fy, f.hue, 70, 35);
      if (fx >= 0 && fx < W) drawCharHSL(f.size > 1 ? 'X' : 'x', fx, fy, f.hue, 70, 45);
      if (fx+1 >= 0 && fx+1 < W) drawCharHSL('>', fx+1, fy, f.hue, 70, 35);
    } else {
      if (fx+1 >= 0 && fx+1 < W) drawCharHSL('>', fx+1, fy, f.hue, 70, 35);
      if (fx >= 0 && fx < W) drawCharHSL(f.size > 1 ? 'X' : 'x', fx, fy, f.hue, 70, 45);
      if (fx-1 >= 0 && fx-1 < W) drawCharHSL('<', fx-1, fy, f.hue, 70, 35);
    }
  }
  // Seabed
  for (var x = 0; x < W; x++) {
    var sh = Math.sin(x * 0.3) * 1.5 + Math.sin(x * 0.7) * 0.5;
    var sy = H - 2 + (sh | 0);
    if (sy >= 0 && sy < H) {
      drawCharHSL('_', x, sy, 30, 40, 15);
      // Seaweed
      if (((x * 17 + 3) % 7) === 0) {
        for (var sw = 1; sw < 4; sw++) {
          var swx = x + (Math.sin(t * 2 + sw) * 0.5 | 0);
          if (sy - sw >= 0 && swx >= 0 && swx < W) drawCharHSL(')', swx, sy - sw, 120, 60, 20);
        }
      }
    }
  }
}
registerMode('ocean', { init: initOcean, render: renderOcean });
