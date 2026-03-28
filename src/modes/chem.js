import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var chemMols, chemCount, chemW, chemH;
function initChem() {
  chemW = state.COLS; chemH = state.ROWS;
  chemCount = state.isMobile ? 15 : 25;
  chemMols = [];
  for (var i = 0; i < chemCount; i++) {
    chemMols.push({
      x: Math.random() * chemW,
      y: Math.random() * chemH,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      r: 1 + Math.random() * 0.5,
      elem: ['H','O','N','C','S'][(Math.random() * 5) | 0]
    });
  }
}
// initChem(); — called via registerMode
function renderChem() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (chemW !== W || chemH !== H) initChem();
  // Add energy on pointer
  if (pointer.down && state.currentMode === 'chem') {
    for (var i = 0; i < chemCount; i++) {
      var dx = chemMols[i].x - pointer.gx, dy = chemMols[i].y - pointer.gy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) {
        chemMols[i].vx += dx / (d + 0.1) * 0.5;
        chemMols[i].vy += dy / (d + 0.1) * 0.5;
      }
    }
  }
  // Lennard-Jones forces
  for (var i = 0; i < chemCount; i++) {
    var a = chemMols[i];
    for (var j = i + 1; j < chemCount; j++) {
      var b = chemMols[j];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) d = 0.5;
      var sigma = 3;
      var r6 = Math.pow(sigma / d, 6);
      var f = 24 * (2 * r6 * r6 - r6) / d;
      f = Math.max(-2, Math.min(2, f));
      var fx = f * dx / d, fy = f * dy / d;
      a.vx -= fx * 0.1; a.vy -= fy * 0.1;
      b.vx += fx * 0.1; b.vy += fy * 0.1;
    }
  }
  // Update positions
  for (var i = 0; i < chemCount; i++) {
    var m = chemMols[i];
    m.vx *= 0.99; m.vy *= 0.99;
    var spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    if (spd > 10) { m.vx *= 10 / spd; m.vy *= 10 / spd; }
    m.x += m.vx * 0.3; m.y += m.vy * 0.3;
    if (m.x < 1) { m.x = 1; m.vx *= -0.8; }
    if (m.x > W - 2) { m.x = W - 2; m.vx *= -0.8; }
    if (m.y < 1) { m.y = 1; m.vy *= -0.8; }
    if (m.y > H - 2) { m.y = H - 2; m.vy *= -0.8; }
  }
  // Draw bonds
  for (var i = 0; i < chemCount; i++) {
    for (var j = i + 1; j < chemCount; j++) {
      var dx = chemMols[j].x - chemMols[i].x, dy = chemMols[j].y - chemMols[i].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 5) {
        var steps = (d * 1.5) | 0;
        for (var s = 1; s < steps; s++) {
          var t = s / steps;
          var bx = (chemMols[i].x + dx * t) | 0;
          var by = (chemMols[i].y + dy * t) | 0;
          if (bx >= 0 && bx < W && by >= 0 && by < H) {
            drawChar('-', bx, by, 80, 80, 120, 0.3);
          }
        }
      }
    }
  }
  // Draw molecules
  for (var i = 0; i < chemCount; i++) {
    var m = chemMols[i];
    var ix = m.x | 0, iy = m.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    var temp = Math.min(1, spd / 8);
    var hue = (240 - temp * 240) | 0;
    drawCharHSL(m.elem, ix, iy, hue, 90, (40 + temp * 30) | 0);
  }
}

registerMode('chem', {
  init: initChem,
  render: renderChem,
});
