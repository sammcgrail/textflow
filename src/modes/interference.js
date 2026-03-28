import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var interfereSources = [];
function initInterference() {
  interfereSources = [];
  for (var i = 0; i < 5; i++) {
    interfereSources.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      freq: 0.3 + Math.random() * 0.5,
      speed: 1 + Math.random() * 2
    });
  }
}
// initInterference(); — called via registerMode
function renderInterference() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  // Pointer controls source 0
  if (pointer.down && state.currentMode === 'interference') {
    interfereSources[0].x = pointer.gx;
    interfereSources[0].y = pointer.gy;
  }
  // Move sources gently
  for (var s = 0; s < interfereSources.length; s++) {
    var src = interfereSources[s];
    src.x += Math.sin(t * 0.3 + s * 2) * 0.05;
    src.y += Math.cos(t * 0.4 + s * 1.5) * 0.05;
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      for (var s = 0; s < interfereSources.length; s++) {
        var src = interfereSources[s];
        var dx = x - src.x, dy = y - src.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        sum += Math.sin(dist * src.freq - t * src.speed);
      }
      var v = (sum / interfereSources.length + 1) * 0.5;
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      var hue = (v * 240 + t * 20) % 360;
      drawCharHSL(ch, x, y, hue | 0, 80, (10 + v * 40) | 0);
    }
  }
}

registerMode('interference', {
  init: initInterference,
  render: renderInterference,
});
