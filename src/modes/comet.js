import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cmComets;
function initComet() { cmComets = []; }
function renderComet() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cmComets) initComet();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'comet') {
    pointer.clicked = false;
    cmComets.push({ x: pointer.gx, y: pointer.gy, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2, size: 2 + Math.random() * 2, hue: (Math.random() * 360) | 0, trail: [] });
  } else if (pointer.down && state.currentMode === 'comet') {
    // Gravity toward pointer
    for (var i = 0; i < cmComets.length; i++) {
      var c = cmComets[i];
      var dx = pointer.gx - c.x, dy = pointer.gy - c.y;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      c.vx += dx / d * 0.3;
      c.vy += dy / d * 0.3;
    }
  }
  // Stars background
  for (var i = 0; i < 80; i++) {
    var sx = (Math.sin(i * 13.7) * 0.5 + 0.5) * W;
    var sy = (Math.sin(i * 7.3 + 3) * 0.5 + 0.5) * H;
    var px = sx | 0, py = sy | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 60, 10, 4 + Math.sin(t + i) * 2);
  }
  // Auto-spawn comets
  if (cmComets.length < 3 && Math.random() < 0.02) {
    var side = (Math.random() * 4) | 0;
    var sx, sy, vx, vy;
    if (side === 0) { sx = 0; sy = Math.random() * H; vx = 1 + Math.random(); vy = (Math.random() - 0.5) * 1; }
    else if (side === 1) { sx = W; sy = Math.random() * H; vx = -1 - Math.random(); vy = (Math.random() - 0.5) * 1; }
    else if (side === 2) { sx = Math.random() * W; sy = 0; vx = (Math.random() - 0.5) * 1; vy = 1 + Math.random(); }
    else { sx = Math.random() * W; sy = H; vx = (Math.random() - 0.5) * 1; vy = -1 - Math.random(); }
    cmComets.push({ x: sx, y: sy, vx: vx, vy: vy, size: 1.5 + Math.random() * 2, hue: (Math.random() * 360) | 0, trail: [] });
  }
  for (var i = cmComets.length - 1; i >= 0; i--) {
    var c = cmComets[i];
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 40) c.trail.shift();
    c.x += c.vx * 0.5; c.y += c.vy * 0.5;
    // Remove if way off screen
    if (c.x < -20 || c.x > W + 20 || c.y < -20 || c.y > H + 20) { cmComets.splice(i, 1); continue; }
    // Draw trail
    for (var j = 0; j < c.trail.length; j++) {
      var tr = c.trail[j];
      var frac = j / c.trail.length;
      var px = tr.x | 0, py = tr.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var bright = frac * 25;
        drawCharHSL(frac > 0.7 ? '*' : frac > 0.3 ? '-' : '.', px, py, (c.hue + (1 - frac) * 30) % 360, 60, bright | 0);
      }
    }
    // Draw head
    var px = c.x | 0, py = c.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('@', px, py, c.hue, 80, 50);
      // Coma glow
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var gx = px + dx, gy = py + dy;
        if (gx >= 0 && gx < W && gy >= 0 && gy < H && (dx !== 0 || dy !== 0)) drawCharHSL('*', gx, gy, c.hue, 60, 20);
      }
    }
  }
  if (cmComets.length > 10) cmComets.splice(0, cmComets.length - 10);
}
registerMode('comet', { init: initComet, render: renderComet });
