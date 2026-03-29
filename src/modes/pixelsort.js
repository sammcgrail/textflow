import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var psGrid, psW, psH;
function initPixelsort() {
  psW = state.COLS; psH = state.ROWS;
  psGrid = new Float32Array(psW * psH);
  for (var i = 0; i < psGrid.length; i++) psGrid[i] = Math.random();
}
function renderPixelsort() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!psGrid || psW !== W || psH !== H) initPixelsort();
  // Add noise
  for (var i = 0; i < 20; i++) {
    var rx = (Math.random() * W) | 0, ry = (Math.random() * H) | 0;
    psGrid[ry * W + rx] = Math.random();
  }
  // Sort columns downward (glitch aesthetic)
  var sortCol = ((state.time * 15) | 0) % W;
  for (var c = 0; c < 3; c++) {
    var col = (sortCol + c) % W;
    for (var y = H - 1; y > 0; y--) {
      if (psGrid[y * W + col] < psGrid[(y-1) * W + col]) {
        var tmp = psGrid[y * W + col];
        psGrid[y * W + col] = psGrid[(y-1) * W + col];
        psGrid[(y-1) * W + col] = tmp;
      }
    }
  }
  // Drag disrupts
  if (pointer.down && state.currentMode === 'pixelsort') {
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var px = gx + dx, py = gy + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) psGrid[py * W + px] = Math.random();
      }
    }
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = psGrid[y * W + x];
      if (v < 0.05) continue;
      var ci = (v * (RAMP_DENSE.length - 1)) | 0;
      var hue = (v * 360 + state.time * 10) % 360;
      drawCharHSL(RAMP_DENSE[ci], x, y, hue | 0, 70, (10 + v * 45) | 0);
    }
  }
}
registerMode('pixelsort', { init: initPixelsort, render: renderPixelsort });
