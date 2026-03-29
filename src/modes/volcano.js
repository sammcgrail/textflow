import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var volParticles;
function initVolcano() { volParticles = []; }
function renderVolcano() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!volParticles) initVolcano();
  var t = state.time;
  var cx = W / 2;
  var peakY = (H * 0.35) | 0;
  var eruptForce = 1;
  if (pointer.clicked && state.currentMode === 'volcano') {
    pointer.clicked = false;
    eruptForce = 3;
    for (var i = 0; i < 40; i++) {
      volParticles.push({ x: cx + (Math.random() - 0.5) * 4, y: peakY, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 4, type: Math.random() < 0.3 ? 'ash' : 'lava', life: 1 });
    }
  } else if (pointer.down && state.currentMode === 'volcano') {
    eruptForce = 1 + (1 - pointer.gy / H) * 3;
  }
  // Mountain
  for (var x = 0; x < W; x++) {
    var dx = Math.abs(x - cx);
    var slope = peakY + dx * 0.8 + Math.sin(x * 0.3) * 2;
    for (var y = (slope | 0); y < H; y++) {
      if (y < 0 || y >= H) continue;
      var depth = y - slope;
      var hue = depth < 3 ? 15 : 25;
      var light = 6 + Math.sin(x * 0.5 + y * 0.3) * 2;
      drawCharHSL(depth < 1 ? '^' : '#', x, y, hue, 30, light | 0);
    }
  }
  // Lava glow at crater
  for (var dx = -3; dx <= 3; dx++) {
    var px = cx + dx;
    if (px >= 0 && px < W && peakY >= 0 && peakY < H) {
      var glow = Math.sin(t * 4 + dx) * 0.3 + 0.7;
      drawCharHSL('*', px | 0, peakY, 15, 90, (20 + glow * 30) | 0);
    }
  }
  // Eruption particles
  if (Math.random() < 0.2 * eruptForce) {
    volParticles.push({ x: cx + (Math.random() - 0.5) * 3, y: peakY - 1, vx: (Math.random() - 0.5) * 1.5 * eruptForce, vy: -1 - Math.random() * 2 * eruptForce, type: Math.random() < 0.4 ? 'ash' : 'lava', life: 1 });
  }
  for (var i = volParticles.length - 1; i >= 0; i--) {
    var p = volParticles[i];
    p.x += p.vx * 0.3; p.y += p.vy * 0.3;
    p.vy += 0.05; // gravity
    p.life -= 0.008;
    if (p.life <= 0 || p.y > H) { volParticles.splice(i, 1); continue; }
    var px = p.x | 0, py = p.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      if (p.type === 'lava') {
        drawCharHSL(p.life > 0.5 ? '#' : '*', px, py, 15 + (1 - p.life) * 20, 90, (p.life * 50) | 0);
      } else {
        drawCharHSL('.', px, py, 0, 0, (p.life * 25) | 0);
      }
    }
  }
  if (volParticles.length > 400) volParticles.splice(0, volParticles.length - 400);
  // Smoke plume
  for (var i = 0; i < 15; i++) {
    var sx = cx + Math.sin(t * 0.5 + i * 0.7) * (i * 1.5);
    var sy = peakY - 2 - i * 1.5 + Math.sin(t + i) * 0.5;
    var px = sx | 0, py = sy | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var a = Math.max(0, 1 - i * 0.07);
      drawCharHSL(i < 5 ? '%' : '~', px, py, 0, 0, (5 + a * 12) | 0);
    }
  }
}
registerMode('volcano', { init: initVolcano, render: renderVolcano });
