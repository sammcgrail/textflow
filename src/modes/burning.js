import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bImage, bW, bH, bDirty;
var bCenterX, bCenterY, bZoom;
var bClickCX, bClickCY, bClickFade;

function initBurning() {
  bW = 0; bH = 0; bImage = null; bDirty = true;
  bCenterX = -1.755; bCenterY = -0.03;
  bZoom = 0.02;
  bClickCX = 0; bClickCY = 0; bClickFade = 0;
}

function burningCompute() {
  var W = bW, H = bH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = bZoom;
  var rangeX = rangeY * screenAspect;
  var maxIter = 100;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var cr = bCenterX + (x / W - 0.5) * rangeX;
      var ci = bCenterY + (y / H - 0.5) * rangeY;
      var zr = 0, zi = 0;
      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var tr = zr * zr - zi * zi + cr;
        zi = Math.abs(2 * zr * zi) + ci;
        zr = tr;
        iter++;
      }
      if (iter === maxIter) {
        bImage[y * W + x] = -1;
      } else {
        var mag = Math.sqrt(zr * zr + zi * zi);
        var log2 = Math.log(2);
        var nu = mag > 1 ? Math.log(Math.log(mag) / log2) / log2 : 0;
        bImage[y * W + x] = iter + 1 - nu;
      }
    }
  }
}

function renderBurning() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (bW !== W || bH !== H) {
    bW = W; bH = H;
    bImage = new Float32Array(W * H);
    bDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'burning') {
    pointer.clicked = false;
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var screenAspect = W / H * charAspect;
    bClickCX = bCenterX + (pointer.gx / W - 0.5) * bZoom * screenAspect;
    bClickCY = bCenterY + (pointer.gy / H - 0.5) * bZoom;
    bClickFade = 1.0;
  }

  // Auto-zoom orbit around the ship bow
  var autoX = -1.755 + 0.02 * Math.sin(t * 0.08);
  var autoY = -0.03 + 0.015 * Math.cos(t * 0.11);
  var autoZoom = 0.5 * Math.pow(0.5, 2.5 + 1.5 * Math.sin(t * 0.05));

  if (bClickFade > 0.001) {
    bClickFade *= 0.985;
    bCenterX = autoX * (1 - bClickFade) + bClickCX * bClickFade;
    bCenterY = autoY * (1 - bClickFade) + bClickCY * bClickFade;
  } else {
    bCenterX = autoX;
    bCenterY = autoY;
    bClickFade = 0;
  }
  bZoom = autoZoom;
  bDirty = true;

  if (bDirty) {
    burningCompute();
    bDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = bImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.1 + y * 0.15 + t * 2) * 0.3 + 0.4;
        drawCharHSL('.', x, y, (t * 50 + 20) % 360 | 0, 90, (25 + pulse * 20) | 0);
        continue;
      }
      var v = val / 100;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (val * 12 + t * 35) % 360;
      var sat = 85 + v * 15;
      var lit = 42 + Math.min(v, 1) * 23;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('burning', { init: initBurning, render: renderBurning });
