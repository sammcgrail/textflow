import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ltBolts, ltFlash;
function initLightning() { ltBolts = []; ltFlash = 0; }
function makeBolt(x1, y1, x2, y2, depth) {
  var segs = [];
  var dx = x2 - x1, dy = y2 - y1;
  var steps = Math.max(8, (Math.abs(dy) * 0.8) | 0);
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var jitter = (1 - t * 0.5) * 6;
    var nx = x1 + dx * t + (Math.random() - 0.5) * jitter;
    var ny = y1 + dy * t;
    segs.push({ x: nx | 0, y: ny | 0 });
    if (depth < 3 && Math.random() < 0.12) {
      var bx = nx + (Math.random() - 0.5) * 20;
      var by = ny + 3 + Math.random() * 10;
      var sub = makeBolt(nx, ny, bx, Math.min(by, y2), depth + 1);
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
    ltBolts.push({ segs: makeBolt(pointer.gx, 4, pointer.gx + (Math.random() - 0.5) * 20, H - 2, 0), birth: t });
    ltFlash = 1;
  } else if (pointer.down && state.currentMode === 'lightning') {
    if (Math.random() < 0.08) {
      ltBolts.push({ segs: makeBolt(pointer.gx, 4, pointer.gx + (Math.random() - 0.5) * 15, H - 2, 0), birth: t });
      ltFlash = 0.6;
    }
  }
  // Frequent random bolts so screen is never empty
  if (Math.random() < 0.06 || ltBolts.length === 0) {
    var sx = Math.random() * W;
    ltBolts.push({ segs: makeBolt(sx, 4, sx + (Math.random() - 0.5) * 30, H - 2, 0), birth: t });
    ltFlash = Math.max(ltFlash, 0.7);
  }
  // Cloud layer
  for (var x = 0; x < W; x++) {
    var cloud = Math.sin(x * 0.05 + t * 0.1) * 0.3 + Math.sin(x * 0.12 - t * 0.05) * 0.2 + 0.5;
    for (var y = 0; y < 5; y++) {
      if (cloud > 0.2 + y * 0.08) {
        var fl = ltFlash * 0.4;
        drawCharHSL(cloud > 0.6 ? '#' : '~', x, y, 240, 15, (4 + cloud * 10 + fl * 35) | 0);
      }
    }
  }
  // Draw bolts
  for (var i = ltBolts.length - 1; i >= 0; i--) {
    var b = ltBolts[i];
    var age = t - b.birth;
    if (age > 1.2) { ltBolts.splice(i, 1); continue; }
    var bright = Math.max(0, 1 - age * 0.9);
    for (var j = 0; j < b.segs.length; j++) {
      var s = b.segs[j];
      if (s.x >= 0 && s.x < W && s.y >= 0 && s.y < H) {
        var ch = bright > 0.6 ? '#' : bright > 0.3 ? '*' : '+';
        drawCharHSL(ch, s.x, s.y, 220 + Math.random() * 50, 70, (bright * 60) | 0);
        // Glow around bolt
        if (bright > 0.4) {
          if (s.x > 0) drawCharHSL('.', s.x - 1, s.y, 240, 40, (bright * 15) | 0);
          if (s.x < W - 1) drawCharHSL('.', s.x + 1, s.y, 240, 40, (bright * 15) | 0);
        }
      }
    }
  }
  if (ltBolts.length > 8) ltBolts.splice(0, ltBolts.length - 8);
  ltFlash *= 0.92;
  // Ground with flash illumination
  for (var x = 0; x < W; x++) {
    drawCharHSL('_', x, H - 1, 120, 15, (3 + ltFlash * 20) | 0);
    if (ltFlash > 0.3) drawCharHSL('.', x, H - 2, 120, 10, (ltFlash * 8) | 0);
  }
}
registerMode('lightning', { init: initLightning, render: renderLightning });
