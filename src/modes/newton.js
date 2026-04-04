import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var nImage, nBasin, nW, nH, nDirty;
var nRotation;
var nClickRot, nClickFade;

function initNewton() {
  nW = 0; nH = 0; nImage = null; nBasin = null; nDirty = true;
  nRotation = 0;
  nClickRot = 0; nClickFade = 0;
}

function newtonCompute() {
  var W = nW, H = nH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 3.5;
  var rangeX = rangeY * screenAspect;
  var maxIter = 40;
  var tol = 1e-6;

  // Three roots of z^3-1=0, rotated
  var cos120 = Math.cos(2.0943951); // 2*PI/3
  var sin120 = Math.sin(2.0943951);
  var cosR = Math.cos(nRotation);
  var sinR = Math.sin(nRotation);
  var r0x = cosR, r0y = sinR;
  var r1x = cosR * cos120 - sinR * sin120;
  var r1y = sinR * cos120 + cosR * sin120;
  var r2x = cosR * cos120 + sinR * sin120;
  var r2y = sinR * cos120 - cosR * sin120;
  // Correct: rotate each root
  r1x = Math.cos(nRotation + 2.0943951);
  r1y = Math.sin(nRotation + 2.0943951);
  r2x = Math.cos(nRotation + 4.1887902);
  r2y = Math.sin(nRotation + 4.1887902);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var zr = (x / W - 0.5) * rangeX;
      var zi = (y / H - 0.5) * rangeY;
      var iter = 0;
      while (iter < maxIter) {
        // z^3
        var z2r = zr * zr - zi * zi;
        var z2i = 2 * zr * zi;
        var z3r = z2r * zr - z2i * zi;
        var z3i = z2r * zi + z2i * zr;
        // f(z) = z^3 - 1, f'(z) = 3z^2
        var fr = z3r - 1;
        var fi = z3i;
        var dr = 3 * z2r;
        var di = 3 * z2i;
        // z = z - f/f'
        var denom = dr * dr + di * di;
        if (denom < 1e-12) break;
        var nr = (fr * dr + fi * di) / denom;
        var ni = (fi * dr - fr * di) / denom;
        zr -= nr;
        zi -= ni;
        if (nr * nr + ni * ni < tol) break;
        iter++;
      }
      // Determine which root
      var d0 = (zr - r0x) * (zr - r0x) + (zi - r0y) * (zi - r0y);
      var d1 = (zr - r1x) * (zr - r1x) + (zi - r1y) * (zi - r1y);
      var d2 = (zr - r2x) * (zr - r2x) + (zi - r2y) * (zi - r2y);
      var basin = d0 < d1 ? (d0 < d2 ? 0 : 2) : (d1 < d2 ? 1 : 2);
      nImage[y * W + x] = iter;
      nBasin[y * W + x] = basin;
    }
  }
}

function renderNewton() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (nW !== W || nH !== H) {
    nW = W; nH = H;
    nImage = new Float32Array(W * H);
    nBasin = new Uint8Array(W * H);
    nDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'newton') {
    pointer.clicked = false;
    nClickRot = Math.atan2(pointer.gy / H - 0.5, pointer.gx / W - 0.5);
    nClickFade = 1.0;
  }

  var autoRot = t * 0.12;
  if (nClickFade > 0.001) {
    nClickFade *= 0.985;
    nRotation = autoRot * (1 - nClickFade) + nClickRot * nClickFade;
  } else {
    nRotation = autoRot;
    nClickFade = 0;
  }
  nDirty = true;

  if (nDirty) {
    newtonCompute();
    nDirty = false;
  }

  var baseHues = [0, 120, 240]; // R, G, B for three basins
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var iter = nImage[y * W + x];
      var basin = nBasin[y * W + x];
      var v = iter / 40;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 2.5) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var hue = (baseHues[basin] + iter * 8 + t * 25) % 360;
      var sat = 90;
      var lit = 55 - Math.min(v, 1) * 15;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('newton', { init: initNewton, render: renderNewton });
