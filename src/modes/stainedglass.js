import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var sgSeeds, sgW, sgH, sgCells;
function initStainedglass() {
  sgW = state.COLS; sgH = state.ROWS;
  sgSeeds = [];
  for (var i = 0; i < 20; i++) {
    sgSeeds.push({
      x: Math.random() * sgW, y: Math.random() * sgH,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      hue: [0, 220, 130, 45, 340, 200, 15, 280][i % 8],
      sat: 60 + (Math.random() * 20) | 0
    });
  }
  sgCells = null; // will recompute
}
function computeCells() {
  var W = sgW, H = sgH;
  sgCells = new Int16Array(W * H);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var best = 0, bestD = 99999;
      var ar = state.CHAR_W / state.CHAR_H;
      for (var i = 0; i < sgSeeds.length; i++) {
        var dx = (x - sgSeeds[i].x) * ar;
        var dy = y - sgSeeds[i].y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      sgCells[y * W + x] = best;
    }
  }
}
function renderStainedglass() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!sgSeeds || sgW !== W || sgH !== H) initStainedglass();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'stainedglass') {
    pointer.clicked = false;
    // Shatter nearest cell
    var gx = pointer.gx, gy = pointer.gy;
    var best = -1, bestD = 9999;
    for (var i = 0; i < sgSeeds.length; i++) {
      var dx = sgSeeds[i].x - gx, dy = sgSeeds[i].y - gy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      var s = sgSeeds[best];
      // Split into 3
      for (var j = 0; j < 3; j++) {
        sgSeeds.push({
          x: s.x + (Math.random() - 0.5) * 4,
          y: s.y + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          hue: (s.hue + (Math.random() - 0.5) * 40 + 360) % 360,
          sat: s.sat
        });
      }
      sgSeeds.splice(best, 1);
      if (sgSeeds.length > 60) sgSeeds.splice(0, sgSeeds.length - 40);
    }
  } else if (pointer.down && state.currentMode === 'stainedglass') {
    var gx = pointer.gx, gy = pointer.gy;
    for (var i = 0; i < sgSeeds.length; i++) {
      var dx = sgSeeds[i].x - gx, dy = sgSeeds[i].y - gy;
      var d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (d < 10) {
        sgSeeds[i].vx += dx / d * 0.1;
        sgSeeds[i].vy += dy / d * 0.1;
      }
    }
  }
  // Move seeds
  for (var i = 0; i < sgSeeds.length; i++) {
    var s = sgSeeds[i];
    s.x += s.vx; s.y += s.vy;
    s.vx *= 0.98; s.vy *= 0.98;
    if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
    if (s.x >= W) { s.x = W - 1; s.vx = -Math.abs(s.vx); }
    if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy); }
    if (s.y >= H) { s.y = H - 1; s.vy = -Math.abs(s.vy); }
  }
  // Recompute Voronoi
  computeCells();
  var ar = state.CHAR_W / state.CHAR_H;
  // Draw cells
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var ci = sgCells[y * W + x];
      var s = sgSeeds[ci];
      if (!s) continue;
      // Check if edge (neighbor has different cell)
      var isEdge = false;
      if (x > 0 && sgCells[y * W + x - 1] !== ci) isEdge = true;
      if (x < W - 1 && sgCells[y * W + x + 1] !== ci) isEdge = true;
      if (y > 0 && sgCells[(y - 1) * W + x] !== ci) isEdge = true;
      if (y < H - 1 && sgCells[(y + 1) * W + x] !== ci) isEdge = true;
      if (isEdge) {
        // Gold/white outline
        var edgeHue = 45;
        drawCharHSL('+', x, y, edgeHue, 40, 50);
      } else {
        var hue = (s.hue + Math.sin(t * 0.5 + ci * 0.7) * 15 + 360) % 360;
        var lit = (15 + Math.sin(t * 0.3 + ci) * 8) | 0;
        var chars = '.:-=*';
        var dx = (x - s.x) * ar, dy = y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var chi = Math.min(chars.length - 1, (dist * 0.3) | 0);
        drawCharHSL(chars[chi], x, y, hue | 0, s.sat, lit);
      }
    }
  }
}
registerMode('stainedglass', { init: initStainedglass, render: renderStainedglass });
