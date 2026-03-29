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
  var fallX = wfX, fallW = 8;
  var cliffY = H * 0.25;
  var t = state.time;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (y < cliffY && (x < fallX - fallW/2 || x > fallX + fallW/2)) {
        var rock = Math.sin(x * 0.5 + y * 0.3) * 0.3 + 0.3;
        if (rock > 0.2) {
          var ri = (rock * (RAMP_DENSE.length - 1)) | 0;
          drawCharHSL(RAMP_DENSE[ri], x, y, 30, 20, (10 + rock * 15) | 0);
        }
        continue;
      }
      if (x >= fallX - fallW/2 && x <= fallX + fallW/2 && y >= cliffY) {
        var dist = Math.abs(x - fallX);
        var flow = Math.sin(y * 0.5 - t * 8 + x * 0.3) * 0.5 + 0.5;
        var fade = 1 - dist / (fallW / 2);
        var v = flow * fade;
        if (v > 0.1) drawCharHSL(v > 0.7 ? '|' : v > 0.4 ? ':' : '.', x, y, 200, 60, (20 + v * 40) | 0);
      }
      if (y > H * 0.75) {
        var md = Math.abs(x - fallX);
        if (md < fallW * 2) {
          var mist = Math.sin(x * 0.2 + t * 2) * Math.sin(y * 0.3 - t) * (1 - md / (fallW * 2)) * (y - H * 0.75) / (H * 0.25);
          if (mist > 0.2) drawCharHSL('.', x, y, 200, 30, (15 + mist * 20) | 0);
        }
      }
      if (y > H * 0.85) {
        var pool = Math.sin(x * 0.15 - t * 0.5 + y * 0.3) * 0.3 + 0.4;
        if (pool > 0.3) drawCharHSL('~', x, y, 210, 50, (15 + pool * 20) | 0);
      }
    }
  }
}
registerMode('waterfall', { init: initWaterfall, render: renderWaterfall });
