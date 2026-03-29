import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bacGrid, bacW, bacH, bacStep;
function initBacteria() {
  bacW = state.COLS; bacH = state.ROWS;
  bacGrid = new Uint8Array(bacW * bacH);
  bacStep = 0;
  // Seed colonies
  for (var c = 0; c < 5; c++) {
    var cx = (Math.random() * bacW) | 0, cy = (Math.random() * bacH) | 0;
    if (cx >= 0 && cx < bacW && cy >= 0 && cy < bacH) bacGrid[cy * bacW + cx] = 1 + (c % 4);
  }
}
function renderBacteria() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!bacGrid || bacW !== W || bacH !== H) initBacteria();
  if (pointer.clicked && state.currentMode === 'bacteria') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) bacGrid[gy * W + gx] = 1 + ((Math.random() * 4) | 0);
  }
  var curStep = (state.time * 15) | 0;
  if (curStep > bacStep) {
    bacStep = curStep;
    // Growth step
    for (var i = 0; i < 30; i++) {
      var rx = (Math.random() * W) | 0, ry = (Math.random() * H) | 0;
      if (bacGrid[ry * W + rx] === 0) continue;
      var type = bacGrid[ry * W + rx];
      var dx = ((Math.random() * 3) | 0) - 1, dy = ((Math.random() * 3) | 0) - 1;
      var nx = rx + dx, ny = ry + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && bacGrid[ny * W + nx] === 0) {
        if (Math.random() < 0.6) bacGrid[ny * W + nx] = type;
      }
    }
  }
  var chars = '.oO@#';
  var hues = [0, 120, 60, 280, 30];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = bacGrid[y * W + x];
      if (v === 0) continue;
      // Count neighbors for density
      var n = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var px = x+dx, py = y+dy;
        if (px >= 0 && px < W && py >= 0 && py < H && bacGrid[py*W+px] === v) n++;
      }
      var ci = Math.min(chars.length - 1, (n / 3) | 0);
      drawCharHSL(chars[ci], x, y, hues[v % hues.length], 70, (20 + n * 3) | 0);
    }
  }
}
registerMode('bacteria', { init: initBacteria, render: renderBacteria });
