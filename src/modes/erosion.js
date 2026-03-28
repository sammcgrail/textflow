import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { simplex2, fbm } from '../core/noise.js';
import { state } from '../core/state.js';

var terrainH;

function initErosion() {
  terrainH = null; // Will generate on first render
}
// initErosion(); — called via registerMode
// Erosion interaction: click to raise terrain
var erosionBumps = [];
function renderErosion() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var sc = 0.04;
  var drift = state.time * 0.15;

  if (pointer.clicked && state.currentMode === 'erosion') {
    pointer.clicked = false;
    if (erosionBumps.length > 8) erosionBumps.shift();
    erosionBumps.push({ x: pointer.gx, y: pointer.gy, born: state.time });
  }

  var terrainChars = ' .,-~:;=+*oO#@';
  var terrainColors = [
    [30,60,120], [40,80,50], [60,120,40], [100,160,50],
    [140,180,60], [180,170,100], [200,190,150], [220,210,180],
    [240,235,220], [255,250,245]
  ];

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var px = x * sc + drift, py = y * sc + drift * 0.3;
      var h = fbm(px, py, 6) * 0.5 + 0.5;

      // Add ridge noise for mountain detail
      var ridge = Math.abs(simplex2(px * 2, py * 2));
      h = h * 0.7 + ridge * 0.3;

      // Add click-raised terrain bumps
      for (var eb = 0; eb < erosionBumps.length; eb++) {
        var bump = erosionBumps[eb];
        var bdx = x - bump.x, bdy = y - bump.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy);
        var bAge = state.time - bump.born;
        if (bd < 10 && bAge < 30) {
          h += (1 - bd / 10) * 0.4 * Math.max(0, 1 - bAge / 30);
        }
      }

      h = Math.max(0, Math.min(1, h));
      if (h < 0.1) continue;

      var ci = Math.min(terrainColors.length - 1, (h * terrainColors.length) | 0);
      var c = terrainColors[ci];
      var ri = Math.min(terrainChars.length - 1, (h * terrainChars.length) | 0);
      drawChar(terrainChars[ri], x, y, c[0], c[1], c[2], 0.3 + h * 0.7);
    }
  }
}

registerMode('erosion', {
  init: initErosion,
  render: renderErosion,
});
