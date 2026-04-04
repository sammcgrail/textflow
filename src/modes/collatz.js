import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cImage, cW, cH, cDirty;
var cOffsetX, cOffsetY;
var cClickOX, cClickOY, cClickFade;

function initCollatz() {
  cW = 0; cH = 0; cImage = null; cDirty = true;
  cOffsetX = 0; cOffsetY = 0;
  cClickOX = 0; cClickOY = 0; cClickFade = 0;
}

function collatzCompute() {
  var W = cW, H = cH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 6.0;
  var rangeX = rangeY * screenAspect;
  var maxIter = 60;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Complex Collatz: f(z) = (1/4)(2 + 7z - (2 + 5z)cos(pi*z))
      var zr = cOffsetX + (x / W - 0.5) * rangeX;
      var zi = cOffsetY + (y / H - 0.5) * rangeY;
      var iter = 0;

      while (zr * zr + zi * zi < 100 && iter < maxIter) {
        // cos(pi*z) = cos(pi*zr)*cosh(pi*zi) + i*sin(pi*zr)*sinh(pi*zi)  ... but negate imag
        var pzr = Math.PI * zr;
        var pzi = Math.PI * zi;
        var cosR = Math.cos(pzr) * Math.cosh(pzi);
        var cosI = -Math.sin(pzr) * Math.sinh(pzi);

        // (2 + 7z)
        var ar = 2 + 7 * zr;
        var ai = 7 * zi;

        // (2 + 5z)
        var br = 2 + 5 * zr;
        var bi = 5 * zi;

        // (2+5z)*cos(pi*z)
        var bcr = br * cosR - bi * cosI;
        var bci = br * cosI + bi * cosR;

        // f(z) = 0.25 * ((2+7z) - (2+5z)*cos(pi*z))
        zr = 0.25 * (ar - bcr);
        zi = 0.25 * (ai - bci);
        iter++;
      }
      cImage[y * W + x] = iter;
    }
  }
}

function renderCollatz() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (cW !== W || cH !== H) {
    cW = W; cH = H;
    cImage = new Float32Array(W * H);
    cDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'collatz') {
    pointer.clicked = false;
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var screenAspect = W / H * charAspect;
    cClickOX = cOffsetX + (pointer.gx / W - 0.5) * 6.0 * screenAspect;
    cClickOY = cOffsetY + (pointer.gy / H - 0.5) * 6.0;
    cClickFade = 1.0;
  }

  // Auto-shift viewport slowly
  var autoOX = 2.0 * Math.sin(t * 0.06) + 1.5 * Math.cos(t * 0.1);
  var autoOY = 1.5 * Math.cos(t * 0.07) + Math.sin(t * 0.13);

  if (cClickFade > 0.001) {
    cClickFade *= 0.985;
    cOffsetX = autoOX * (1 - cClickFade) + cClickOX * cClickFade;
    cOffsetY = autoOY * (1 - cClickFade) + cClickOY * cClickFade;
  } else {
    cOffsetX = autoOX;
    cOffsetY = autoOY;
    cClickFade = 0;
  }
  cDirty = true;

  if (cDirty) {
    collatzCompute();
    cDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var iter = cImage[y * W + x];
      var v = iter / 60;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 2) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var hue = (iter * 14 + t * 32) % 360;
      var sat = 90;
      var lit = 40 + Math.min(v, 1) * 25;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('collatz', { init: initCollatz, render: renderCollatz });
