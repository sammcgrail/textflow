import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var disChars, disW, disH;
function initDissolve() {
  disW = state.COLS; disH = state.ROWS;
  disChars = [];
  var msg = 'TEXTFLOW';
  // Scale letter size to screen — each letter is a block of chars
  var blockW = Math.max(3, (disW * 0.08) | 0);
  var blockH = Math.max(3, (disH * 0.06) | 0);
  var totalW = msg.length * (blockW + 1);
  var startX = ((disW - totalW) / 2) | 0;
  var startY = ((disH - blockH) / 2) | 0;
  for (var i = 0; i < msg.length; i++) {
    for (var dy = 0; dy < blockH; dy++) {
      for (var dx = 0; dx < blockW; dx++) {
        var hx = startX + i * (blockW + 1) + dx;
        var hy = startY + dy;
        disChars.push({
          ch: msg[(i + dy + dx) % msg.length],
          homeX: hx, homeY: hy,
          x: hx, y: hy,
          vx: 0, vy: 0, delay: Math.random()
        });
      }
    }
  }
}
function renderDissolve() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!disChars || disW !== W || disH !== H) initDissolve();
  var t = state.time;
  var cycle = (t * 0.3) % 2;
  var dissolving = cycle > 1;
  // Click explodes chars outward from click point
  if (pointer.clicked && state.currentMode === 'dissolve') {
    pointer.clicked = false;
    for (var i = 0; i < disChars.length; i++) {
      var dx = disChars[i].x - pointer.gx, dy = disChars[i].y - pointer.gy;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      disChars[i].vx = dx / d * 5;
      disChars[i].vy = dy / d * 5;
    }
  } else if (pointer.down && state.currentMode === 'dissolve') {
    // Drag attracts chars toward pointer
    for (var i = 0; i < disChars.length; i++) {
      var dx = pointer.gx - disChars[i].x, dy = pointer.gy - disChars[i].y;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      disChars[i].vx += dx / d * 0.3;
      disChars[i].vy += dy / d * 0.3;
    }
  }
  for (var i = 0; i < disChars.length; i++) {
    var c = disChars[i];
    if (dissolving) {
      var prog = (cycle - 1) * 2;
      if (prog > c.delay) {
        c.vx += (Math.random() - 0.5) * 0.2;
        c.vy += (Math.random() - 0.5) * 0.2 - 0.05;
        c.x += c.vx;
        c.y += c.vy;
      }
    } else {
      c.x += (c.homeX - c.x) * 0.08;
      c.y += (c.homeY - c.y) * 0.08;
      c.vx *= 0.9; c.vy *= 0.9;
    }
    var ix = c.x | 0, iy = c.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var dist = Math.sqrt((c.x - c.homeX) * (c.x - c.homeX) + (c.y - c.homeY) * (c.y - c.homeY));
    var hue = (dist * 10 + t * 30) % 360;
    drawCharHSL(c.ch, ix, iy, hue | 0, 70, (25 + Math.max(0, 1 - dist * 0.05) * 35) | 0);
  }
}
registerMode('dissolve', { init: initDissolve, render: renderDissolve });
