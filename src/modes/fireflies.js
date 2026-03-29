import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ffFlies;
function initFireflies() {
  ffFlies = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 60; i++) {
    ffFlies.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2,
      phase: Math.random() * Math.PI * 2, freq: 0.5 + Math.random() * 1.5
    });
  }
}
function renderFireflies() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!ffFlies) initFireflies();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'fireflies') {
    pointer.clicked = false;
    for (var i = 0; i < 10; i++) {
      ffFlies.push({
        x: pointer.gx + (Math.random() - 0.5) * 4, y: pointer.gy + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2, freq: 0.5 + Math.random() * 2
      });
    }
    if (ffFlies.length > 150) ffFlies.splice(0, ffFlies.length - 150);
  } else if (pointer.down && state.currentMode === 'fireflies') {
    // Attract fireflies toward pointer
    for (var i = 0; i < ffFlies.length; i++) {
      var f = ffFlies[i];
      var dx = pointer.gx - f.x, dy = pointer.gy - f.y;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      f.vx += dx / d * 0.05;
      f.vy += dy / d * 0.05;
    }
  }
  // Draw grass/ground
  for (var x = 0; x < W; x++) {
    var gh = 1 + ((Math.sin(x * 0.3) + Math.sin(x * 0.7 + 1)) * 0.5 + 0.5) * 2;
    for (var dy = 0; dy < gh; dy++) {
      var gy = H - 1 - dy;
      if (gy >= 0) drawCharHSL(dy === 0 ? 'w' : '|', x, gy, 120, 40, 6 + dy * 2);
    }
  }
  // Draw some trees silhouettes
  for (var tr = 0; tr < 5; tr++) {
    var tx = ((tr * W / 5 + W * 0.1) | 0) % W;
    var th = 5 + (Math.sin(tr * 7) * 3) | 0;
    for (var ty = H - 3 - th; ty < H - 2; ty++) {
      if (tx >= 0 && tx < W && ty >= 0) drawCharHSL('|', tx, ty, 30, 20, 5);
    }
    for (var dy = -2; dy <= 1; dy++) for (var dx = -3; dx <= 3; dx++) {
      var lx = tx + dx, ly = H - 3 - th + dy;
      if (lx >= 0 && lx < W && ly >= 0 && ly < H && Math.abs(dx) + Math.abs(dy) < 4) {
        drawCharHSL('&', lx, ly, 120, 30, 4);
      }
    }
  }
  // Update and draw fireflies
  for (var i = 0; i < ffFlies.length; i++) {
    var f = ffFlies[i];
    f.vx += (Math.random() - 0.5) * 0.04;
    f.vy += (Math.random() - 0.5) * 0.03;
    f.vx *= 0.98; f.vy *= 0.98;
    f.x += f.vx; f.y += f.vy;
    if (f.x < 0) f.x = W - 1; if (f.x >= W) f.x = 0;
    if (f.y < 0) f.y = 0; if (f.y >= H - 3) f.y = H - 4;
    var glow = Math.sin(t * f.freq + f.phase) * 0.5 + 0.5;
    var px = f.x | 0, py = f.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      if (glow > 0.3) {
        var bright = 15 + glow * 40;
        drawCharHSL(glow > 0.7 ? '*' : '.', px, py, 55 + glow * 10, 80, bright | 0);
      }
    }
  }
}
registerMode('fireflies', { init: initFireflies, render: renderFireflies });
