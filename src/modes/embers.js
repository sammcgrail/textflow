import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var embParts, embW, embH;
function initEmbers() {
  embW = state.COLS; embH = state.ROWS;
  embParts = [];
  for (var i = 0; i < 200; i++) spawnEmber();
}
function spawnEmber() {
  embParts.push({
    x: Math.random() * embW,
    y: embH * 0.8 + Math.random() * embH * 0.2,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -(0.3 + Math.random() * 0.8),
    life: 1,
    decay: 0.003 + Math.random() * 0.008,
    size: Math.random()
  });
}
function renderEmbers() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!embParts || embW !== W || embH !== H) initEmbers();
  // Draw fire bed at bottom
  for (var x = 0; x < W; x++) {
    for (var y = H - 3; y < H; y++) {
      var v = Math.sin(x * 0.3 + state.time * 3) * 0.3 + 0.5;
      if (v > 0.3) drawCharHSL(v > 0.6 ? '#' : '=', x, y, (10 + v * 20) | 0, 90, (20 + v * 30) | 0);
    }
  }
  if (pointer.clicked && state.currentMode === 'embers') {
    pointer.clicked = false;
    for (var s = 0; s < 15; s++) {
      var p = { x: pointer.gx, y: pointer.gy, vx: (Math.random()-0.5)*2, vy: -(1+Math.random()*2), life: 1, decay: 0.01+Math.random()*0.02, size: Math.random() };
      embParts.push(p);
    }
  }
  for (var i = embParts.length - 1; i >= 0; i--) {
    var p = embParts[i];
    p.x += p.vx + Math.sin(state.time * 2 + p.x * 0.1) * 0.1;
    p.y += p.vy;
    p.vy *= 0.995;
    p.life -= p.decay;
    if (p.life <= 0 || p.y < -2) { embParts.splice(i, 1); spawnEmber(); continue; }
    var ix = p.x | 0, iy = p.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var hue = (20 - p.life * 20) | 0;
    if (hue < 0) hue = 0;
    var ch = p.life > 0.7 ? '*' : p.life > 0.4 ? '+' : p.life > 0.2 ? '.' : '`';
    drawCharHSL(ch, ix, iy, hue, 90, (10 + p.life * 50) | 0);
  }
}
registerMode('embers', { init: initEmbers, render: renderEmbers });
