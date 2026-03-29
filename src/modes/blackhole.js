import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bhParticles;
function initBlackhole() {
  bhParticles = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 600; i++) {
    var ang = Math.random() * Math.PI * 2;
    var r = 2 + Math.random() * Math.max(W, H) * 0.5;
    bhParticles.push({ ang: ang, r: r, speed: 0.2 + Math.random() * 0.6, hue: (ang * 57 + r * 5) % 360 });
  }
}
function renderBlackhole() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!bhParticles) initBlackhole();
  var cx = W / 2, cy = H / 2;
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'blackhole') {
    pointer.clicked = false;
    for (var i = 0; i < 50; i++) {
      var ang = Math.random() * Math.PI * 2;
      bhParticles.push({ ang: ang, r: 3 + Math.random() * 12, speed: 0.4 + Math.random() * 0.8, hue: Math.random() * 360 });
    }
    if (bhParticles.length > 800) bhParticles.splice(0, bhParticles.length - 800);
  } else if (pointer.down && state.currentMode === 'blackhole') {
    cx = pointer.gx; cy = pointer.gy;
  }
  // Stars background
  for (var i = 0; i < 100; i++) {
    var sx = (Math.sin(i * 13.7) * 0.5 + 0.5) * W;
    var sy = (Math.sin(i * 7.3 + 3) * 0.5 + 0.5) * H;
    var px = sx | 0, py = sy | 0;
    // Gravitational lensing — stars near center get displaced
    var dx = px - cx, dy = (py - cy) / ar;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > 3 && d < 30) {
      var lens = 3 / (d * 0.3);
      px = (px + dx * lens * 0.5) | 0;
      py = (py + dy * lens * 0.5) | 0;
    }
    if (px >= 0 && px < W && py >= 0 && py < H && d > 3) drawCharHSL('.', px, py, 60, 10, 4 + Math.sin(t * 0.5 + i) * 2);
  }
  // Accretion disk — dense bright ring
  for (var a = 0; a < 400; a++) {
    var ang = a / 400 * Math.PI * 2 + t * 0.3;
    var diskR = 5 + Math.sin(ang * 5 + t * 3) * 1.5;
    var px = (cx + Math.cos(ang) * diskR) | 0;
    var py = (cy + Math.sin(ang) * diskR * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var hue = (ang * 30 + t * 50) % 360;
      drawCharHSL('~', px, py, hue | 0, 70, 20 + Math.sin(ang * 7 + t * 4) * 10);
    }
    // Inner disk
    var innerR = 3 + Math.sin(ang * 3 - t * 5) * 0.8;
    px = (cx + Math.cos(ang + t * 0.8) * innerR) | 0;
    py = (cy + Math.sin(ang + t * 0.8) * innerR * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('*', px, py, (30 + a * 0.8) % 360, 80, 30);
    }
  }
  // Particles spiral inward
  for (var i = bhParticles.length - 1; i >= 0; i--) {
    var p = bhParticles[i];
    p.ang += p.speed * 0.04 / Math.max(0.3, p.r * 0.08);
    p.r -= p.speed * 0.12;
    if (p.r < 1.5) { p.r = 8 + Math.random() * Math.max(W, H) * 0.4; p.ang = Math.random() * Math.PI * 2; p.hue = Math.random() * 360; }
    var px = (cx + Math.cos(p.ang) * p.r) | 0;
    var py = (cy + Math.sin(p.ang) * p.r * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var bright = Math.min(50, Math.max(5, 55 - p.r * 1.2));
      var ch = p.r < 4 ? '*' : p.r < 10 ? '+' : '.';
      drawCharHSL(ch, px, py, ((p.hue + t * 15) % 360) | 0, 65, bright | 0);
    }
  }
  // Event horizon (void)
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      var d = Math.sqrt(dx * dx + (dy / ar) * (dy / ar));
      if (d < 2) {
        var px = (cx + dx) | 0, py = (cy + dy) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(' ', px, py, 0, 0, 0);
      }
    }
  }
}
registerMode('blackhole', { init: initBlackhole, render: renderBlackhole });
