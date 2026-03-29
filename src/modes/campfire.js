import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cfSparks;
function initCampfire() { cfSparks = []; }
function renderCampfire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cfSparks) initCampfire();
  var t = state.time;
  var cx = W / 2, groundY = H - 4;
  var fireW = Math.max(4, (W * 0.12) | 0);
  if (pointer.clicked && state.currentMode === 'campfire') {
    pointer.clicked = false;
    // Stoke the fire — burst of sparks
    for (var i = 0; i < 20; i++) {
      cfSparks.push({ x: cx + (Math.random() - 0.5) * fireW, y: groundY - Math.random() * 3, vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2, life: 1 });
    }
  } else if (pointer.down && state.currentMode === 'campfire') {
    cx = pointer.gx;
  }
  // Ground
  for (var x = 0; x < W; x++) {
    for (var gy = groundY + 2; gy < H; gy++) {
      if (gy < H) drawCharHSL('.', x, gy, 30, 20, 4);
    }
  }
  // Log pile
  for (var i = -2; i <= 2; i++) {
    var lx = (cx + i * 2) | 0;
    if (lx >= 0 && lx < W && groundY + 1 < H) drawCharHSL('=', lx, groundY + 1, 25, 40, 10);
    if (lx + 1 < W && groundY + 1 < H) drawCharHSL('=', lx + 1, groundY + 1, 25, 40, 8);
  }
  // Rocks around fire
  for (var i = 0; i < 8; i++) {
    var ang = i / 8 * Math.PI * 2;
    var rx = (cx + Math.cos(ang) * (fireW + 2)) | 0;
    var ry = (groundY + 1 + Math.sin(ang) * 0.5) | 0;
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) drawCharHSL('O', rx, ry, 0, 0, 12);
  }
  // Fire
  for (var y = groundY; y > groundY - 12 && y >= 0; y--) {
    var dist = groundY - y;
    var w = fireW * (1 - dist / 14);
    for (var dx = -w; dx <= w; dx++) {
      var fx = (cx + dx) | 0;
      if (fx < 0 || fx >= W) continue;
      var v = Math.sin(dx * 0.5 + t * 8 + y * 0.7) * 0.3 + Math.sin(dx * 0.3 - t * 5) * 0.2 + (1 - dist / 12);
      v *= (1 - Math.abs(dx) / (w + 1));
      if (v > 0.2) {
        var hue = v > 0.7 ? 50 : v > 0.5 ? 30 : 10;
        var ch = v > 0.8 ? '#' : v > 0.5 ? '*' : v > 0.3 ? '^' : '.';
        drawCharHSL(ch, fx, y, hue, 90, (10 + v * 45) | 0);
      }
    }
  }
  // Sparks
  if (Math.random() < 0.3) {
    cfSparks.push({ x: cx + (Math.random() - 0.5) * fireW * 0.5, y: groundY - 2, vx: (Math.random() - 0.5) * 0.8, vy: -0.5 - Math.random() * 1, life: 1 });
  }
  for (var i = cfSparks.length - 1; i >= 0; i--) {
    var s = cfSparks[i];
    s.x += s.vx * 0.3; s.y += s.vy * 0.3;
    s.vy -= 0.02; s.life -= 0.015;
    if (s.life <= 0) { cfSparks.splice(i, 1); continue; }
    var px = s.x | 0, py = s.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('*', px, py, 40, 90, (s.life * 45) | 0);
    }
  }
  if (cfSparks.length > 200) cfSparks.splice(0, cfSparks.length - 200);
}
registerMode('campfire', { init: initCampfire, render: renderCampfire });
