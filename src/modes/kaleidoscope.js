import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var kalW, kalH;
function initKaleidoscope() { kalW = state.COLS; kalH = state.ROWS; }
// initKaleidoscope(); — called via registerMode
function renderKaleidoscope() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (kalW !== W || kalH !== H) initKaleidoscope();
  var cx = W * 0.5, cy = H * 0.5;
  var mx = pointer.down && state.currentMode === 'kaleidoscope' ? pointer.gx / W : 0.5;
  var my = pointer.down && state.currentMode === 'kaleidoscope' ? pointer.gy / H : 0.5;
  var segments = 8;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) / (W * 0.5);
      var dy = (y - cy) / (H * 0.5);
      var angle = Math.atan2(dy, dx);
      var r = Math.sqrt(dx * dx + dy * dy);
      // Fold into one segment
      var segAngle = (Math.PI * 2) / segments;
      angle = ((angle % segAngle) + segAngle) % segAngle;
      if (angle > segAngle * 0.5) angle = segAngle - angle;
      // Generate pattern
      var v = Math.sin(r * 8 + state.time * 2 + mx * 10) * 0.5 +
              Math.sin(angle * 6 + state.time * 1.5 + my * 8) * 0.3 +
              Math.sin(r * 4 - state.time + angle * 3) * 0.2;
      v = (v + 1) * 0.5;
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (v * 360 + state.time * 30 + r * 100) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, 80, (10 + v * 50) | 0);
    }
  }
}

registerMode('kaleidoscope', {
  init: initKaleidoscope,
  render: renderKaleidoscope,
});
