import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cmComets;
function initComet() { cmComets = []; }
function makeComet() {
  var W = state.COLS, H = state.ROWS;
  var side = (Math.random() * 4) | 0;
  var sx, sy, vx, vy;
  if (side === 0) { sx = -5; sy = Math.random() * H * 0.5; vx = 0.8 + Math.random() * 0.5; vy = 0.2 + Math.random() * 0.4; }
  else if (side === 1) { sx = W + 5; sy = Math.random() * H * 0.5; vx = -0.8 - Math.random() * 0.5; vy = 0.2 + Math.random() * 0.4; }
  else if (side === 2) { sx = Math.random() * W; sy = -5; vx = (Math.random() - 0.5) * 0.8; vy = 0.5 + Math.random() * 0.5; }
  else { sx = Math.random() * W; sy = H + 5; vx = (Math.random() - 0.5) * 0.8; vy = -0.5 - Math.random() * 0.5; }
  return { x: sx, y: sy, vx: vx, vy: vy, size: 2 + Math.random() * 2, hue: [180, 200, 50, 150, 280][(Math.random() * 5) | 0], trail: [] };
}
function renderComet() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cmComets) initComet();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'comet') {
    pointer.clicked = false;
    var c = makeComet();
    c.x = pointer.gx; c.y = pointer.gy;
    c.vx = (Math.random() - 0.5) * 2; c.vy = (Math.random() - 0.5) * 1.5;
    c.size = 3;
    cmComets.push(c);
  } else if (pointer.down && state.currentMode === 'comet') {
    for (var i = 0; i < cmComets.length; i++) {
      var c = cmComets[i];
      var dx = pointer.gx - c.x, dy = pointer.gy - c.y;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      c.vx += dx / d * 0.2;
      c.vy += dy / d * 0.2;
    }
  }
  // Stars background — denser
  for (var i = 0; i < 150; i++) {
    var sx = (Math.sin(i * 13.7) * 0.5 + 0.5) * W;
    var sy = (Math.sin(i * 7.3 + 3) * 0.5 + 0.5) * H;
    var px = sx | 0, py = sy | 0;
    var tw = Math.sin(t * 0.8 + i * 1.3) * 0.5 + 0.5;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(tw > 0.7 ? '+' : '.', px, py, 60, 10, (3 + tw * 6) | 0);
  }
  // Auto-spawn
  while (cmComets.length < 3) cmComets.push(makeComet());
  if (Math.random() < 0.01) cmComets.push(makeComet());
  for (var i = cmComets.length - 1; i >= 0; i--) {
    var c = cmComets[i];
    c.trail.push({ x: c.x, y: c.y });
    if (c.trail.length > 60) c.trail.shift();
    c.x += c.vx * 0.4; c.y += c.vy * 0.4;
    if (c.x < -30 || c.x > W + 30 || c.y < -30 || c.y > H + 30) { cmComets.splice(i, 1); continue; }
    // Draw trail — long and fading
    for (var j = 0; j < c.trail.length; j++) {
      var tr = c.trail[j];
      var frac = j / c.trail.length;
      var px = tr.x | 0, py = tr.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var bright = frac * frac * 30;
        var ch = frac > 0.8 ? '*' : frac > 0.5 ? ':' : frac > 0.2 ? '-' : '.';
        drawCharHSL(ch, px, py, (c.hue + (1 - frac) * 40) % 360, 55, bright | 0);
      }
    }
    // Draw coma (fuzzy glow around head)
    var px = c.x | 0, py = c.y | 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -3; dx <= 3; dx++) {
      var gx = px + dx, gy = py + dy;
      var d = Math.sqrt(dx * dx + dy * dy * 4);
      if (gx >= 0 && gx < W && gy >= 0 && gy < H && d < 3.5) {
        var bright = (1 - d / 3.5) * 35;
        drawCharHSL(d < 1 ? '#' : d < 2 ? '*' : '.', gx, gy, c.hue, 50, bright | 0);
      }
    }
    // Bright head
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('@', px, py, c.hue, 80, 55);
  }
  if (cmComets.length > 8) cmComets.splice(0, cmComets.length - 8);
}
registerMode('comet', { init: initComet, render: renderComet });
