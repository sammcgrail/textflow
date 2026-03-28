import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

function initTerrain() {}
// initTerrain(); — called via registerMode
function renderTerrain() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var px = pointer.down && state.currentMode === 'terrain' ? pointer.gx : -999;
  var py = pointer.down && state.currentMode === 'terrain' ? pointer.gy : -999;
  var t = state.time * 0.3;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x * 0.05 + t;
      var ny = y * 0.08 + t * 0.5;
      var h = 0;
      h += Math.sin(nx * 1.0 + ny * 0.7) * 0.5;
      h += Math.sin(nx * 2.1 - ny * 1.3 + t) * 0.25;
      h += Math.sin(nx * 4.3 + ny * 3.7 - t * 0.7) * 0.125;
      h += Math.sin(nx * 8.1 - ny * 7.2 + t * 1.1) * 0.0625;
      // Pointer raises terrain
      var dx = x - px, dy = y - py;
      var pd = Math.sqrt(dx * dx + dy * dy);
      if (pd < 10) h += (1 - pd / 10) * 0.5;
      // Contour detection
      var level = Math.floor(h * 8);
      var frac = (h * 8) - level;
      var contour = frac < 0.1 || frac > 0.9;
      var v = (h + 1) * 0.5;
      if (v < 0.02) continue;
      var ch, r, g, b;
      if (contour) {
        ch = '-';
        if (Math.abs(((h * 8) % 1) - 0.5) < 0.1) ch = '=';
        var hue = v * 120 + 100;
        r = (Math.cos(hue * 0.0174) * 0.5 + 0.5) * 200 + 55;
        g = (Math.cos((hue - 120) * 0.0174) * 0.5 + 0.5) * 200 + 55;
        b = (Math.cos((hue - 240) * 0.0174) * 0.5 + 0.5) * 200 + 55;
        drawChar(ch, x, y, r | 0, g | 0, b | 0, 0.9);
      } else {
        var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
        ch = RAMP_SOFT[ri];
        var green = 80 + v * 150;
        drawChar(ch, x, y, 40, green | 0, 60, 0.3 + v * 0.4);
      }
    }
  }
}

registerMode('terrain', {
  init: initTerrain,
  render: renderTerrain,
});
