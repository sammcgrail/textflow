import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bhParticles;
function initBlackhole() {
  bhParticles = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 400; i++) {
    var ang = Math.random() * Math.PI * 2;
    var r = 5 + Math.random() * Math.max(W, H) * 0.5;
    bhParticles.push({ ang: ang, r: r, speed: 0.3 + Math.random() * 0.5, hue: (ang * 57 + r * 3) % 360 });
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
    for (var i = 0; i < 30; i++) {
      var ang = Math.random() * Math.PI * 2;
      bhParticles.push({ ang: ang, r: 3 + Math.random() * 15, speed: 0.5 + Math.random() * 0.8, hue: Math.random() * 360 });
    }
    if (bhParticles.length > 600) bhParticles.splice(0, bhParticles.length - 600);
  } else if (pointer.down && state.currentMode === 'blackhole') {
    cx = pointer.gx; cy = pointer.gy;
  }
  // Accretion disk glow
  for (var a = 0; a < 200; a++) {
    var ang = a / 200 * Math.PI * 2 + t * 0.5;
    var r = 4 + Math.sin(ang * 3 + t * 2) * 1.5;
    var px = (cx + Math.cos(ang) * r) | 0;
    var py = (cy + Math.sin(ang) * r * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('~', px, py, (30 + a * 1.5) % 360, 80, 25 + Math.sin(ang * 5 + t * 3) * 10);
    }
  }
  // Particles spiral in
  for (var i = bhParticles.length - 1; i >= 0; i--) {
    var p = bhParticles[i];
    p.ang += p.speed * 0.05 / Math.max(0.5, p.r * 0.1);
    p.r -= p.speed * 0.15;
    if (p.r < 0.5) { p.r = 10 + Math.random() * Math.max(W, H) * 0.4; p.ang = Math.random() * Math.PI * 2; }
    var px = (cx + Math.cos(p.ang) * p.r) | 0;
    var py = (cy + Math.sin(p.ang) * p.r * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var bright = Math.max(8, 50 - p.r * 0.8);
      var ch = p.r < 3 ? '*' : p.r < 8 ? '+' : '.';
      drawCharHSL(ch, px, py, (p.hue + t * 20) % 360, 70, bright | 0);
    }
  }
  // Event horizon
  for (var a = 0; a < 60; a++) {
    var ang = a / 60 * Math.PI * 2;
    var px = (cx + Math.cos(ang) * 2) | 0;
    var py = (cy + Math.sin(ang) * 2 * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('@', px, py, 0, 0, 5);
  }
}
registerMode('blackhole', { init: initBlackhole, render: renderBlackhole });
