import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mshList, mshSpores;
function initMushroom() {
  mshList = []; mshSpores = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 15; i++) {
    mshList.push({ x: (Math.random() * (W - 6) + 3) | 0, baseY: H - 2 - (Math.random() * (H * 0.4)) | 0, size: 2 + Math.random() * 3, hue: [280, 340, 120, 40, 200, 60][(Math.random() * 6) | 0], growth: Math.random() * 0.5 });
  }
}
function renderMushroom() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!mshList) initMushroom();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'mushroom') {
    pointer.clicked = false;
    mshList.push({ x: (pointer.gx) | 0, baseY: (pointer.gy) | 0, size: 2 + Math.random() * 2, hue: (Math.random() * 360) | 0, growth: 0 });
    if (mshList.length > 25) mshList.splice(0, 1);
  } else if (pointer.down && state.currentMode === 'mushroom') {
    for (var i = 0; i < mshList.length; i++) {
      if (Math.abs(mshList[i].x - pointer.gx) < 8) mshList[i].growth = Math.min(1, mshList[i].growth + 0.02);
    }
  }
  // Forest floor
  for (var x = 0; x < W; x++) {
    for (var y = H - 2; y < H; y++) {
      var n = Math.sin(x * 0.2 + y * 0.5) * 0.3 + 0.4;
      drawCharHSL(n > 0.4 ? '.' : ',', x, y, 30, 20, (3 + n * 4) | 0);
    }
    // Fallen leaves and moss
    if (Math.sin(x * 0.7 + 3) > 0.4) drawCharHSL('"', x, H - 3, 120, 30, 5);
    if (Math.sin(x * 1.3 + 1) > 0.6) drawCharHSL('~', x, H - 3, 40, 25, 4);
  }
  // Log
  for (var x = (W * 0.2) | 0; x < (W * 0.45) | 0; x++) {
    if (x < W) drawCharHSL('=', x, H - 3, 25, 30, 7);
  }
  // Grow and draw mushrooms (sorted by Y for overlap)
  mshList.sort(function(a, b) { return a.baseY - b.baseY; });
  for (var i = 0; i < mshList.length; i++) {
    var m = mshList[i];
    m.growth = Math.min(1, m.growth + 0.004);
    var g = m.growth;
    var s = m.size * g;
    if (s < 0.3) continue;
    var capW = (s * 2.5 + 1) | 0;
    var capH = Math.max(1, (s * 0.7) | 0);
    var stemH = Math.max(1, (s * 1.8) | 0);
    // Stem
    for (var dy = 0; dy < stemH; dy++) {
      var sy = m.baseY - dy;
      var sw = dy < stemH * 0.3 ? 1 : 0;
      for (var dx = -sw; dx <= sw; dx++) {
        var px = m.x + dx;
        if (px >= 0 && px < W && sy >= 0 && sy < H) drawCharHSL('|', px, sy, 60, 25, (8 + g * 8) | 0);
      }
    }
    // Cap (dome shape)
    var capTop = m.baseY - stemH;
    for (var dy = 0; dy <= capH; dy++) {
      var rowFrac = 1 - dy / (capH + 1);
      var rowW = (capW * Math.sqrt(rowFrac)) | 0;
      for (var dx = -rowW; dx <= rowW; dx++) {
        var px = (m.x + dx) | 0, py = (capTop - dy) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          var edge = Math.abs(dx) >= rowW - 1;
          var spot = Math.sin(dx * 2.1 + dy * 3.2) > 0.3;
          var ch = edge ? ')' : spot ? 'o' : '#';
          var bright = 12 + g * 15 + (spot ? 5 : 0);
          drawCharHSL(ch, px, py, m.hue, 55 + g * 15, bright | 0);
        }
      }
    }
    // Gills under cap
    for (var dx = -(capW - 1); dx <= capW - 1; dx++) {
      var px = (m.x + dx) | 0, py = capTop + 1;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('~', px, py, m.hue + 20, 30, (6 + g * 6) | 0);
    }
    // Release spores
    if (g > 0.4 && Math.random() < 0.08) {
      mshSpores.push({ x: m.x + (Math.random() - 0.5) * capW * 2, y: capTop, vx: (Math.random() - 0.5) * 0.4, vy: -0.15 - Math.random() * 0.3, life: 1, hue: m.hue });
    }
  }
  // Spores
  for (var i = mshSpores.length - 1; i >= 0; i--) {
    var s = mshSpores[i];
    s.x += s.vx + Math.sin(t * 2 + s.x * 0.3) * 0.05;
    s.y += s.vy;
    s.vx += (Math.random() - 0.5) * 0.03;
    s.vy += 0.003;
    s.life -= 0.004;
    if (s.life <= 0 || s.y < 0 || s.y >= H) { mshSpores.splice(i, 1); continue; }
    var px = s.x | 0, py = s.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL(s.life > 0.5 ? '*' : '.', px, py, s.hue, 40, (s.life * 22) | 0);
    }
  }
  if (mshSpores.length > 300) mshSpores.splice(0, mshSpores.length - 300);
}
registerMode('mushroom', { init: initMushroom, render: renderMushroom });
