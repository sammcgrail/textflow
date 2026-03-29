import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mshList, mshSpores;
function initMushroom() {
  mshList = []; mshSpores = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 5; i++) {
    mshList.push({ x: (Math.random() * W) | 0, y: H - 2, size: 1 + Math.random() * 2, hue: (Math.random() * 360) | 0, growth: 0 });
  }
}
function renderMushroom() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!mshList) initMushroom();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'mushroom') {
    pointer.clicked = false;
    mshList.push({ x: (pointer.gx) | 0, y: (pointer.gy) | 0, size: 1, hue: (Math.random() * 360) | 0, growth: 0 });
    if (mshList.length > 20) mshList.splice(0, 1);
  } else if (pointer.down && state.currentMode === 'mushroom') {
    // Rain nutrients - accelerate growth
    for (var i = 0; i < mshList.length; i++) {
      if (Math.abs(mshList[i].x - pointer.gx) < 10) mshList[i].growth += 0.01;
    }
  }
  // Ground
  for (var x = 0; x < W; x++) {
    var gy = H - 1;
    drawCharHSL('.', x, gy, 30, 20, 4);
    // Moss
    if (Math.sin(x * 0.4 + 3) > 0.3) drawCharHSL('"', x, gy - 1, 120, 30, 5);
  }
  // Grow and draw mushrooms
  for (var i = 0; i < mshList.length; i++) {
    var m = mshList[i];
    m.growth = Math.min(1, m.growth + 0.003);
    m.size = Math.min(6, m.size + 0.002);
    var s = m.size * m.growth;
    var capW = (s * 2 + 1) | 0;
    var capH = (s * 0.8) | 0;
    var stemH = (s * 1.5 + 1) | 0;
    // Stem
    for (var dy = 0; dy < stemH; dy++) {
      var sy = m.y - dy;
      if (sy >= 0 && sy < H && m.x >= 0 && m.x < W) {
        drawCharHSL('|', m.x, sy, 60, 20, 10 + m.growth * 5);
      }
    }
    // Cap
    var capY = m.y - stemH;
    for (var dy = 0; dy <= capH; dy++) {
      var rowW = capW * (1 - dy / (capH + 1));
      for (var dx = -rowW; dx <= rowW; dx++) {
        var px = (m.x + dx) | 0, py = (capY - dy) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          var spot = Math.sin(dx * 1.5 + dy * 2) > 0.5;
          drawCharHSL(spot ? 'o' : '(', px, py, m.hue, 50 + m.growth * 20, (10 + m.growth * 18) | 0);
        }
      }
    }
    // Release spores
    if (m.growth > 0.5 && Math.random() < 0.05) {
      mshSpores.push({ x: m.x + (Math.random() - 0.5) * capW, y: capY, vx: (Math.random() - 0.5) * 0.5, vy: -0.2 - Math.random() * 0.3, life: 1, hue: m.hue });
    }
  }
  // Spores
  for (var i = mshSpores.length - 1; i >= 0; i--) {
    var s = mshSpores[i];
    s.x += s.vx; s.y += s.vy;
    s.vx += (Math.random() - 0.5) * 0.05;
    s.vy += 0.005;
    s.life -= 0.005;
    if (s.life <= 0 || s.y < 0 || s.y >= H) { mshSpores.splice(i, 1); continue; }
    var px = s.x | 0, py = s.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('.', px, py, s.hue, 40, (s.life * 20) | 0);
    }
  }
  if (mshSpores.length > 200) mshSpores.splice(0, mshSpores.length - 200);
}
registerMode('mushroom', { init: initMushroom, render: renderMushroom });
