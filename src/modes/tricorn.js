import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var tImage, tW, tH, tDirty;
var tCenterX, tCenterY, tZoom;
var tClickCX, tClickCY, tClickFade;

function initTricorn() {
  tW = 0; tH = 0; tImage = null; tDirty = true;
  tCenterX = -0.3; tCenterY = 0;
  tZoom = 3.5;
  tClickCX = 0; tClickCY = 0; tClickFade = 0;
}

function tricornCompute() {
  var W = tW, H = tH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = tZoom;
  var rangeX = rangeY * screenAspect;
  var maxIter = 80;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var cr = tCenterX + (x / W - 0.5) * rangeX;
      var ci = tCenterY + (y / H - 0.5) * rangeY;
      var zr = 0, zi = 0;
      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        // Tricorn: conjugate z before squaring (negate zi)
        var tr = zr * zr - zi * zi + cr;
        zi = -2 * zr * zi + ci;
        zr = tr;
        iter++;
      }
      if (iter === maxIter) {
        tImage[y * W + x] = -1;
      } else {
        var mag = Math.sqrt(zr * zr + zi * zi);
        var log2 = Math.log(2);
        var nu = mag > 1 ? Math.log(Math.log(mag) / log2) / log2 : 0;
        tImage[y * W + x] = iter + 1 - nu;
      }
    }
  }
}

function renderTricorn() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (tW !== W || tH !== H) {
    tW = W; tH = H;
    tImage = new Float32Array(W * H);
    tDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'tricorn') {
    pointer.clicked = false;
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var screenAspect = W / H * charAspect;
    tClickCX = tCenterX + (pointer.gx / W - 0.5) * tZoom * screenAspect;
    tClickCY = tCenterY + (pointer.gy / H - 0.5) * tZoom;
    tClickFade = 1.0;
  }

  // Auto-orbit: slowly pan and zoom around interesting regions
  var autoX = -0.3 + 0.5 * Math.sin(t * 0.06) + 0.2 * Math.cos(t * 0.13);
  var autoY = 0.3 * Math.cos(t * 0.08) + 0.15 * Math.sin(t * 0.17);
  var autoZoom = 2.0 + 1.2 * Math.sin(t * 0.04);

  if (tClickFade > 0.001) {
    tClickFade *= 0.985;
    tCenterX = autoX * (1 - tClickFade) + tClickCX * tClickFade;
    tCenterY = autoY * (1 - tClickFade) + tClickCY * tClickFade;
  } else {
    tCenterX = autoX;
    tCenterY = autoY;
    tClickFade = 0;
  }
  tZoom = autoZoom;
  tDirty = true;

  if (tDirty) {
    tricornCompute();
    tDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = tImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.12 + y * 0.18 + t * 1.8) * 0.3 + 0.35;
        drawCharHSL('.', x, y, (t * 45 + 180) % 360 | 0, 88, (28 + pulse * 18) | 0);
        continue;
      }
      var v = val / 80;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (val * 15 + t * 30) % 360;
      var sat = 85 + v * 15;
      var lit = 44 + Math.min(v, 1) * 21;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('tricorn', { init: initTricorn, render: renderTricorn });
