import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mandelCx, mandelCy, mandelZoom, mandelIter, mandelImage, mandelW, mandelH, mandelDirty;
function initMandel() {
  mandelW = state.COLS; mandelH = state.ROWS;
  mandelCx = -0.5; mandelCy = 0;
  mandelZoom = 3.0;
  mandelImage = new Float32Array(mandelW * mandelH);
  mandelDirty = true;
  mandelIter = 0;
}
// initMandel(); — called via registerMode
function mandelCompute() {
  var W = mandelW, H = mandelH;
  // Correct for character aspect ratio (chars are ~2x tall as wide)
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = mandelZoom;
  var rangeX = mandelZoom * screenAspect;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var cr = mandelCx + (x / W - 0.5) * rangeX;
      var ci = mandelCy + (y / H - 0.5) * rangeY;
      var zr = 0, zi = 0, iter = 0, maxIter = 150;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var tr = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci;
        zr = tr;
        iter++;
      }
      if (iter === maxIter) {
        mandelImage[y * W + x] = 0;
      } else {
        // Smooth coloring
        var log2 = Math.log(2);
        var nu = Math.log(Math.log(Math.sqrt(zr * zr + zi * zi)) / log2) / log2;
        mandelImage[y * W + x] = (iter + 1 - nu) / maxIter;
      }
    }
  }
}

function renderMandel() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (mandelW !== W || mandelH !== H) initMandel();
  // Click sets center and zooms in
  if (pointer.clicked && state.currentMode === 'mandel') {
    pointer.clicked = false;
    var cAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var sAspect = W / H * cAspect;
    mandelCx += (pointer.gx / W - 0.5) * mandelZoom * sAspect;
    mandelCy += (pointer.gy / H - 0.5) * mandelZoom;
    mandelZoom *= 0.5;
    mandelDirty = true;
  }
  // Hold zooms continuously
  if (pointer.down && state.currentMode === 'mandel') {
    mandelZoom *= 0.99;
    mandelDirty = true;
  }
  // Slow auto zoom (every 4th frame to save CPU)
  mandelIter++;
  if (!pointer.down && (mandelIter & 3) === 0) {
    mandelZoom *= 0.999;
    mandelDirty = true;
  }
  if (mandelDirty) {
    mandelCompute();
    mandelDirty = false;
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = mandelImage[y * W + x];
      if (v < 0.001) {
        // Interior of set — subtle pulsing pattern
        var pulse = Math.sin(x * 0.2 + y * 0.3 + state.time * 2) * 0.15 + 0.15;
        if (pulse > 0.05) drawChar('.', x, y, 20, 10, (30 + pulse * 40) | 0, pulse);
        continue;
      }
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (v * 720 + state.time * 20) % 360;
      drawCharHSL(ch, x, y, hue | 0, 85, (10 + v * 60) | 0);
    }
  }
  // Show zoom level
}

registerMode('mandel', {
  init: initMandel,
  render: renderMandel,
});
