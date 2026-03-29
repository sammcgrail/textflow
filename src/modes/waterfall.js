import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var wfX;
function initWaterfall() { wfX = state.COLS / 2; }
function renderWaterfall() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (wfX === undefined) initWaterfall();
  if (pointer.down && state.currentMode === 'waterfall') {
    wfX += (pointer.gx - wfX) * 0.1;
  }
  var fallX = wfX | 0, fallW = Math.max(6, (W * 0.08) | 0);
  var cliffY = (H * 0.2) | 0;
  var t = state.time;
  for (var y = 0; y <= cliffY; y++) {
    for (var x = 0; x < W; x++) {
      if (x > fallX - fallW/2 && x < fallX + fallW/2) continue;
      var rock = Math.sin(x * 0.3 + y * 0.5) * 0.2 + Math.sin(x * 0.7 - y * 0.3) * 0.15 + 0.4;
      if (rock > 0.25) {
        var ri = Math.min(RAMP_DENSE.length - 1, (rock * (RAMP_DENSE.length - 1)) | 0);
        drawCharHSL(RAMP_DENSE[ri], x, y, 25, 25, (8 + rock * 18) | 0);
      }
    }
  }
  for (var y = cliffY; y < H; y++) {
    for (var x = (fallX - fallW/2) | 0; x <= (fallX + fallW/2) | 0; x++) {
      if (x < 0 || x >= W) continue;
      var dist = Math.abs(x - fallX) / (fallW / 2);
      var flow = Math.sin(y * 0.4 - t * 10 + x * 0.5) * 0.5 + 0.5;
      var v = flow * (1 - dist);
      if (v > 0.1) drawCharHSL(v > 0.7 ? '|' : v > 0.4 ? ':' : '.', x, y, 200, 70, (15 + v * 45) | 0);
    }
  }
  var splashY = (H * 0.8) | 0;
  for (var y = splashY; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var md = Math.abs(x - fallX);
      var maxSpread = fallW * 2 + (y - splashY) * 1.5;
      if (md < maxSpread) {
        var mist = Math.sin(x * 0.15 + t * 3) * Math.sin(y * 0.2 - t * 1.5) * (1 - md / maxSpread);
        if (mist > 0.15) drawCharHSL(mist > 0.4 ? '~' : '.', x, y, 200, 40, (10 + mist * 25) | 0);
      }
    }
  }
  for (var x = 0; x < W; x++) {
    var wave = Math.sin(x * 0.1 - t * 0.8) * 0.3 + 0.5;
    drawCharHSL('~', x, H - 2, 210, 50, (12 + wave * 18) | 0);
  }
}
registerMode('waterfall', { init: initWaterfall, render: renderWaterfall });
