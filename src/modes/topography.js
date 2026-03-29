import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var topoOx = 0, topoOy = 0;
function simplex(x, y) {
  return Math.sin(x * 12.9898 + y * 78.233) * 0.5 + Math.sin(x * 4.898 + y * 7.23 + x * 3.1 + y * 2.7) * 0.3 + Math.sin(x * 1.5 + y * 2.3) * 0.2;
}
function renderTopography() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time * 0.15;
  // Drag pans the map
  if (pointer.down && state.currentMode === 'topography') {
    topoOx += (pointer.gx / W - 0.5) * 0.1;
    topoOy += (pointer.gy / H - 0.5) * 0.1;
  }
  var levels = 12;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x * 0.06 + t + topoOx, ny = y * 0.1 + t * 0.3 + topoOy;
      var h = simplex(nx, ny) + simplex(nx * 2.1, ny * 2.1) * 0.5 + simplex(nx * 4.3, ny * 4.3) * 0.25;
      h = (h + 1.5) / 3;
      var level = (h * levels) | 0;
      var frac = h * levels - level;
      var isContour = frac < 0.08 || frac > 0.92;
      if (isContour) {
        var hue = (level * 30 + 120) % 360;
        drawCharHSL('-', x, y, hue, 50, 40);
      } else if (frac > 0.45 && frac < 0.55) {
        var hue = (level * 30 + 120) % 360;
        drawCharHSL(String(level % 10), x, y, hue, 30, 18);
      }
    }
  }
}
registerMode('topography', { render: renderTopography });
