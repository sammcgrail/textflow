import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var snPings, snBlips;
function initSonar() {
  snPings = []; snBlips = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 12; i++) snBlips.push({ x: (Math.random() * W) | 0, y: (Math.random() * H) | 0, size: 1 + Math.random() * 2 });
}
function renderSonar() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!snBlips) initSonar();
  var t = state.time;
  var cx = W / 2, cy = H / 2;
  var maxR = Math.min(cx * 0.9, cy / ar * 0.9);
  if (pointer.clicked && state.currentMode === 'sonar') {
    pointer.clicked = false;
    snPings.push({ birth: t, cx: pointer.gx, cy: pointer.gy });
  } else if (pointer.down && state.currentMode === 'sonar') {
    cx = pointer.gx; cy = pointer.gy;
  }
  // Auto ping
  if (((t * 0.5) | 0) > (((t - 0.016) * 0.5) | 0)) snPings.push({ birth: t, cx: cx, cy: cy });
  // Range rings
  for (var ring = 1; ring <= 5; ring++) {
    var r = maxR * ring / 5;
    for (var a = 0; a < 180; a++) {
      var ang = a / 180 * Math.PI * 2;
      var px = (cx + Math.cos(ang) * r) | 0;
      var py = (cy + Math.sin(ang) * r * ar) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 120, 30, 4);
    }
  }
  // Cross hairs
  for (var x = 0; x < W; x++) { var py = cy | 0; if (py >= 0 && py < H) drawCharHSL('-', x, py, 120, 25, 3); }
  for (var y = 0; y < H; y++) { var px = cx | 0; if (px >= 0 && px < W) drawCharHSL('|', px, y, 120, 25, 3); }
  // Sweep line — full radius
  var sweepAng = t * 1.5;
  for (var r = 0; r < maxR; r += 0.4) {
    var px = (cx + Math.cos(sweepAng) * r) | 0;
    var py = (cy + Math.sin(sweepAng) * r * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 120, 70, 18);
  }
  // Sweep trail (fading arc behind sweep)
  for (var i = 1; i < 30; i++) {
    var trailAng = sweepAng - i * 0.025;
    var bright = 15 - i * 0.4;
    if (bright < 1) break;
    for (var r = 0; r < maxR; r += 1.5) {
      var px = (cx + Math.cos(trailAng) * r) | 0;
      var py = (cy + Math.sin(trailAng) * r * ar) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 120, 50, bright | 0);
    }
  }
  // Ping expanding waves
  for (var i = snPings.length - 1; i >= 0; i--) {
    var p = snPings[i];
    var age = t - p.birth;
    if (age > 4) { snPings.splice(i, 1); continue; }
    var pingR = age * maxR * 0.3;
    var bright = Math.max(0, 1 - age * 0.25);
    for (var a = 0; a < 120; a++) {
      var ang = a / 120 * Math.PI * 2;
      var px = (p.cx + Math.cos(ang) * pingR) | 0;
      var py = (p.cy + Math.sin(ang) * pingR * ar) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('o', px, py, 120, 60, (bright * 20) | 0);
    }
  }
  if (snPings.length > 6) snPings.splice(0, snPings.length - 6);
  // Blips revealed by sweep
  for (var i = 0; i < snBlips.length; i++) {
    var b = snBlips[i];
    var dx = b.x - cx, dy = (b.y - cy) / ar;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var blipAng = Math.atan2(dy, dx);
    if (blipAng < 0) blipAng += Math.PI * 2;
    var swNorm = (sweepAng % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    var diff = (swNorm - blipAng + Math.PI * 2) % (Math.PI * 2);
    if (diff < 1.0 && dist < maxR) {
      var bright = Math.max(5, 35 - diff * 30);
      var px = b.x | 0, py = b.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        drawCharHSL('#', px, py, 120, 80, bright | 0);
        // Blip glow
        for (var gd = -1; gd <= 1; gd++) {
          if (px + gd >= 0 && px + gd < W) drawCharHSL('.', px + gd, py, 120, 60, (bright * 0.4) | 0);
        }
      }
    }
  }
  // Range label
  var label = 'SONAR';
  for (var i = 0; i < label.length; i++) if (2 + i < W) drawCharHSL(label[i], 2, 1, 120, 50, 15);
}
registerMode('sonar', { init: initSonar, render: renderSonar });
