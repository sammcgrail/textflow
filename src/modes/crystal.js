import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var crystalGrid, crystalHueGrid;
var crystalSeeds = [];

function initCrystal() {
  var sz = state.COLS * state.ROWS;
  crystalGrid = new Float32Array(sz);
  crystalHueGrid = new Float32Array(sz);
  crystalSeeds = [];
}
// initCrystal(); — called via registerMode
function renderCrystal() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!crystalGrid || crystalGrid.length !== W * H) initCrystal();

  if (pointer.clicked && state.currentMode === 'crystal') {
    pointer.clicked = false;
    var sx = pointer.gx | 0, sy = pointer.gy | 0;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      crystalGrid[sy * W + sx] = 1;
      crystalHueGrid[sy * W + sx] = (Math.random() * 360) | 0;
      crystalSeeds.push({ x: sx, y: sy });
    }
  }

  // Grow crystals — DLA-like (diffusion-limited aggregation)
  for (var g = 0; g < 5; g++) {
    var rx = Math.floor(Math.random() * (W - 2)) + 1;
    var ry = Math.floor(Math.random() * (H - 2)) + 1;
    var ridx = ry * W + rx;
    if (crystalGrid[ridx] > 0) continue;

    // Check if adjacent to crystal
    var hasNeighbor = false;
    var neighborHue = 0;
    var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (var d = 0; d < dirs.length; d++) {
      var nx = rx + dirs[d][0], ny = ry + dirs[d][1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && crystalGrid[ny * W + nx] > 0.5) {
        hasNeighbor = true;
        neighborHue = crystalHueGrid[ny * W + nx];
        break;
      }
    }

    if (hasNeighbor && Math.random() < 0.3) {
      crystalGrid[ridx] = 0.9 + Math.random() * 0.1;
      crystalHueGrid[ridx] = neighborHue + (Math.random() - 0.5) * 5;
    }
  }

  // Render
  var crystalChars = '.:;=+*#@';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = crystalGrid[y * W + x];
      if (v < 0.1) continue;
      var ci = Math.min(crystalChars.length - 1, (v * crystalChars.length) | 0);
      var hue = crystalHueGrid[y * W + x] % 360;
      // Shimmer
      var shimmer = Math.sin(x * 0.3 + y * 0.2 + state.time * 2) * 0.1 + 0.9;
      drawCharHSL(crystalChars[ci], x, y, hue, 50 + v * 50, (15 + v * 50) * shimmer);
    }
  }
}

registerMode('crystal', {
  init: initCrystal,
  render: renderCrystal,
});
