import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mjImage, mjW, mjH, mjDirty;
var mjBlend; // 0 = pure Mandelbrot, 1 = pure Julia
var mjClickBlend, mjClickFade;

function initMandelJulia() {
  mjW = 0; mjH = 0; mjImage = null; mjDirty = true;
  mjBlend = 0;
  mjClickBlend = 0; mjClickFade = 0;
}

function mandelJuliaCompute() {
  var W = mjW, H = mjH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 3.0;
  var rangeX = rangeY * screenAspect;
  var maxIter = 80;
  var blend = mjBlend;

  // Julia c parameter (for when blend > 0)
  var jCr = 0.7885 * Math.cos(state.time * 0.15);
  var jCi = 0.7885 * Math.sin(state.time * 0.15);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var px = (x / W - 0.5) * rangeX;
      var py = (y / H - 0.5) * rangeY;

      // Mandelbrot: z0=0, c=pixel. Julia: z0=pixel, c=fixed.
      // Blend between them smoothly
      var zr = px * blend;
      var zi = py * blend;
      var cr = px * (1 - blend) + jCr * blend;
      var ci = py * (1 - blend) + jCi * blend;

      // Offset for Mandelbrot centering
      cr += -0.5 * (1 - blend);

      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var tr = zr * zr - zi * zi + cr;
        zi = 2 * zr * zi + ci;
        zr = tr;
        iter++;
      }
      if (iter === maxIter) {
        mjImage[y * W + x] = -1;
      } else {
        var mag = Math.sqrt(zr * zr + zi * zi);
        var log2 = Math.log(2);
        var nu = mag > 1 ? Math.log(Math.log(mag) / log2) / log2 : 0;
        mjImage[y * W + x] = iter + 1 - nu;
      }
    }
  }
}

function renderMandelJulia() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (mjW !== W || mjH !== H) {
    mjW = W; mjH = H;
    mjImage = new Float32Array(W * H);
    mjDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'mandeljulia') {
    pointer.clicked = false;
    mjClickBlend = pointer.gx / W; // x position maps to blend 0-1
    mjClickFade = 1.0;
  }

  // Auto-oscillate blend between Mandelbrot (0) and Julia (1)
  var autoBlend = 0.5 + 0.5 * Math.sin(t * 0.1);
  if (mjClickFade > 0.001) {
    mjClickFade *= 0.985;
    mjBlend = autoBlend * (1 - mjClickFade) + mjClickBlend * mjClickFade;
  } else {
    mjBlend = autoBlend;
    mjClickFade = 0;
  }
  mjDirty = true;

  if (mjDirty) {
    mandelJuliaCompute();
    mjDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = mjImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.12 + y * 0.16 + t * 2) * 0.3 + 0.35;
        drawCharHSL('.', x, y, (t * 42) % 360 | 0, 86, (28 + pulse * 20) | 0);
        continue;
      }
      var v = val / 80;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (val * 15 + t * 30) % 360;
      var sat = 88 + v * 12;
      var lit = 45 + Math.min(v, 1) * 20;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('mandeljulia', { init: initMandelJulia, render: renderMandelJulia });
