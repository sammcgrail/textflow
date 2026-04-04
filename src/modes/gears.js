import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var grGears, grW, grH;
function initGears() {
  grW = state.COLS; grH = state.ROWS;
  grGears = [];
  // Pre-seed interlocking gears
  var sizes = [5, 4, 6, 3, 5, 4, 7];
  var cx = grW * 0.2;
  for (var i = 0; i < sizes.length; i++) {
    var r = sizes[i];
    grGears.push({
      cx: cx, cy: grH * 0.3 + (i % 2) * grH * 0.35,
      radius: r, teeth: r + 2, speed: (i % 2 === 0 ? 1 : -1) * (0.5 + Math.random() * 0.5),
      angle: 0
    });
    cx += r * 1.8;
    if (cx > grW * 0.9) cx = grW * 0.15;
  }
}
function renderGears() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!grGears || grW !== W || grH !== H) initGears();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'gears') {
    pointer.clicked = false;
    var r = 3 + (Math.random() * 4) | 0;
    grGears.push({
      cx: pointer.gx, cy: pointer.gy, radius: r, teeth: r + 2,
      speed: (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random()), angle: 0
    });
    if (grGears.length > 20) grGears.shift();
  } else if (pointer.down && state.currentMode === 'gears') {
    // Drag changes speed of nearest gear
    var gx = pointer.gx, gy = pointer.gy;
    var best = -1, bestD = 9999;
    for (var i = 0; i < grGears.length; i++) {
      var dx = grGears[i].cx - gx, dy = grGears[i].cy - gy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      grGears[best].speed *= 1.01;
      if (Math.abs(grGears[best].speed) > 5) grGears[best].speed *= 0.5;
    }
  }
  // Update angles
  for (var i = 0; i < grGears.length; i++) {
    grGears[i].angle += grGears[i].speed * 0.02;
  }
  // Draw gears
  var teethChars = '=-+*#@';
  for (var gi = 0; gi < grGears.length; gi++) {
    var g = grGears[gi];
    var r = g.radius;
    // Draw gear body — filled circle with teeth
    for (var dy = -r - 1; dy <= r + 1; dy++) {
      for (var dx = (-r - 1) / ar; dx <= (r + 1) / ar; dx++) {
        var px = (g.cx + dx) | 0, py = (g.cy + dy) | 0;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        var dist = Math.sqrt(dx * dx * ar * ar + dy * dy);
        var angle = Math.atan2(dy, dx * ar);
        var toothWave = Math.sin((angle + g.angle) * g.teeth);
        var outerR = r + (toothWave > 0.3 ? 1 : 0);
        var innerR = r * 0.3;
        if (dist <= outerR && dist >= innerR) {
          var norm = (dist - innerR) / (outerR - innerR);
          var ci = (norm * (teethChars.length - 1)) | 0;
          // Copper/bronze palette: hue 25-35
          var hue = 25 + Math.sin(angle + g.angle) * 10;
          var lit = (18 + (1 - norm) * 30 + toothWave * 8) | 0;
          if (lit > 55) lit = 55;
          drawCharHSL(teethChars[ci], px, py, hue | 0, 60, lit);
        }
      }
    }
    // Draw axle
    var ax = (g.cx) | 0, ay = (g.cy) | 0;
    if (ax >= 0 && ax < W && ay >= 0 && ay < H) {
      drawCharHSL('+', ax, ay, 40, 50, 50);
    }
  }
}
registerMode('gears', { init: initGears, render: renderGears });
