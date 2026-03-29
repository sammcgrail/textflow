import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ltBolts, ltFlash;
function initLightning() { ltBolts = []; ltFlash = 0; }
function makeBolt(x1, y1, x2, y2, depth) {
  var segs = [];
  var dx = x2 - x1, dy = y2 - y1;
  var steps = Math.max(5, ((Math.abs(dx) + Math.abs(dy)) * 0.5) | 0);
  var px = x1, py = y1;
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var nx = x1 + dx * t + (Math.random() - 0.5) * (1 - t) * 8;
    var ny = y1 + dy * t;
    segs.push({ x: nx | 0, y: ny | 0 });
    // Branch
    if (depth < 3 && Math.random() < 0.08) {
      var bx = nx + (Math.random() - 0.5) * 15;
      var by = ny + 3 + Math.random() * 8;
      var sub = makeBolt(nx, ny, bx, by, depth + 1);
      for (var j = 0; j < sub.length; j++) segs.push(sub[j]);
    }
  }
  return segs;
}
function renderLightning() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!ltBolts) initLightning();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'lightning') {
    pointer.clicked = false;
    ltBolts.push({ segs: makeBolt(pointer.gx, 0, pointer.gx + (Math.random() - 0.5) * 20, H - 1, 0), birth: t });
    ltFlash = 1;
  } else if (pointer.down && state.currentMode === 'lightning') {
    if (Math.random() < 0.05) {
      ltBolts.push({ segs: makeBolt(pointer.gx, pointer.gy, pointer.gx + (Math.random() - 0.5) * 30, H - 1, 0), birth: t });
      ltFlash = 0.5;
    }
  }
  // Random bolts
  if (Math.random() < 0.01) {
    var sx = Math.random() * W;
    ltBolts.push({ segs: makeBolt(sx, 0, sx + (Math.random() - 0.5) * 30, H - 1, 0), birth: t });
    ltFlash = 0.8;
  }
  // Cloud layer
  for (var x = 0; x < W; x++) {
    var cloud = Math.sin(x * 0.05 + t * 0.1) * 0.3 + Math.sin(x * 0.12 - t * 0.05) * 0.2 + 0.5;
    for (var y = 0; y < 4; y++) {
      if (cloud > 0.3 + y * 0.1) {
        var fl = ltFlash * 0.3;
        drawCharHSL(cloud > 0.6 ? '#' : '~', x, y, 240, 10, (3 + cloud * 8 + fl * 30) | 0);
      }
    }
  }
  // Draw bolts
  for (var i = ltBolts.length - 1; i >= 0; i--) {
    var b = ltBolts[i];
    var age = t - b.birth;
    if (age > 0.8) { ltBolts.splice(i, 1); continue; }
    var bright = Math.max(0, 1 - age * 1.5);
    for (var j = 0; j < b.segs.length; j++) {
      var s = b.segs[j];
      if (s.x >= 0 && s.x < W && s.y >= 0 && s.y < H) {
        var ch = bright > 0.7 ? '#' : bright > 0.4 ? '*' : '+';
        drawCharHSL(ch, s.x, s.y, 240 + Math.random() * 40, 60, (bright * 60) | 0);
      }
    }
  }
  if (ltBolts.length > 10) ltBolts.splice(0, ltBolts.length - 10);
  ltFlash *= 0.9;
  // Ground
  for (var x = 0; x < W; x++) {
    drawCharHSL('_', x, H - 1, 120, 15, (3 + ltFlash * 15) | 0);
  }
}
registerMode('lightning', { init: initLightning, render: renderLightning });
