import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var w3dW, w3dH, w3dGX, w3dGZ;
function initWaves3d() {
  w3dW = state.COLS; w3dH = state.ROWS;
  w3dGX = 40; w3dGZ = 25;
}
// initWaves3d(); — called via registerMode
function renderWaves3d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (w3dW !== W || w3dH !== H) initWaves3d();
  var cx = W * 0.5, cy = H * 0.4;
  var clickWx = -999, clickWz = -999;
  if (pointer.down && state.currentMode === 'waves3d') {
    clickWx = (pointer.gx - cx) * 0.1;
    clickWz = (pointer.gy - cy) * 0.2;
  }
  for (var gz = w3dGZ - 1; gz >= 0; gz--) {
    for (var gx = -w3dGX / 2; gx < w3dGX / 2; gx++) {
      var wx = gx, wz = gz;
      var h = Math.sin(wx * 0.5 + state.time * 2) * 1.5 +
              Math.sin(wz * 0.4 + state.time * 1.5) * 1.2 +
              Math.sin(wx * 0.3 + wz * 0.3 + state.time * 1.8) * 0.8;
      // Pointer wave
      if (clickWx > -100) {
        var dd = (wx - clickWx) * (wx - clickWx) + (wz - clickWz) * (wz - clickWz);
        h += Math.sin(Math.sqrt(dd) * 2 - state.time * 5) * 3 / (1 + dd * 0.1);
      }
      // Project to screen
      var sx = cx + (gx - gz * 0.3) * 2.5;
      var sy = cy + gz * 1.2 - h * 2;
      var ix = sx | 0, iy = sy | 0;
      if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
      var depth = 1 - gz / w3dGZ;
      var v = (h + 3) / 6;
      var ch = v > 0.6 ? '~' : (v > 0.4 ? '-' : '.');
      drawCharHSL(ch, ix, iy, (200 + h * 10) | 0, 70, (15 + depth * 40 + v * 15) | 0);
    }
  }
}

registerMode('waves3d', {
  init: initWaves3d,
  render: renderWaves3d,
});
