import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var spirals = [];
var spiralGrid;

function initSpiral() {
  spirals = [];
  spiralGrid = new Float32Array(state.COLS * state.ROWS);
}
// initSpiral(); — called via registerMode
function renderSpiral() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!spiralGrid || spiralGrid.length !== W * H) initSpiral();

  if (pointer.clicked && state.currentMode === 'spiral') {
    pointer.clicked = false;
    spirals.push({
      x: pointer.gx, y: pointer.gy, born: state.time,
      dir: Math.random() < 0.5 ? 1 : -1,
      hue: (Math.random() * 360) | 0,
      speed: 0.3 + Math.random() * 0.3
    });
    if (spirals.length > 15) spirals.shift();
  }

  // Decay
  for (var i = 0; i < spiralGrid.length; i++) spiralGrid[i] *= 0.97;

  // Draw spirals
  for (var si = 0; si < spirals.length; si++) {
    var sp = spirals[si];
    var age = state.time - sp.born;
    if (age > 25) { spirals.splice(si, 1); si--; continue; }
    var maxAngle = age * 3 * sp.speed;
    var fade = Math.max(0, 1 - age / 25);

    for (var a = 0; a < maxAngle; a += 0.15) {
      var r = a * 0.4;
      var px = sp.x + Math.cos(a * sp.dir) * r;
      var py = sp.y + Math.sin(a * sp.dir) * r * 0.6; // aspect correction
      var gx = px | 0, gy = py | 0;
      if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
        var brightness = fade * (1 - a / (maxAngle + 1));
        spiralGrid[gy * W + gx] = Math.min(1, spiralGrid[gy * W + gx] + brightness * 0.3);
      }
    }
  }

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = spiralGrid[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (40 + v * 40 + state.time * 20) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + v * 30, 15 + v * 55);
    }
  }
}

registerMode('spiral', {
  init: initSpiral,
  render: renderSpiral,
});
