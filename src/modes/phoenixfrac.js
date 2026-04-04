import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var pImage, pW, pH, pDirty;
var pParam; // phoenix p parameter
var pClickParam, pClickFade;

function initPhoenix() {
  pW = 0; pH = 0; pImage = null; pDirty = true;
  pParam = 0.56667;
  pClickParam = 0; pClickFade = 0;
}

function phoenixCompute() {
  var W = pW, H = pH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 3.2;
  var rangeX = rangeY * screenAspect;
  var maxIter = 80;
  var cr = 0.5667; // fixed c real
  var ci = 0; // fixed c imag
  var p = pParam;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Phoenix: z_{n+1} = z_n^2 + c + p * z_{n-1}
      var zr = (x / W - 0.5) * rangeX;
      var zi = (y / H - 0.5) * rangeY;
      var prevZr = 0, prevZi = 0;
      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var newR = zr * zr - zi * zi + cr + p * prevZr;
        var newI = 2 * zr * zi + ci + p * prevZi;
        prevZr = zr; prevZi = zi;
        zr = newR; zi = newI;
        iter++;
      }
      if (iter === maxIter) {
        pImage[y * W + x] = -1;
      } else {
        var mag = Math.sqrt(zr * zr + zi * zi);
        var log2 = Math.log(2);
        var nu = mag > 1 ? Math.log(Math.log(mag) / log2) / log2 : 0;
        pImage[y * W + x] = iter + 1 - nu;
      }
    }
  }
}

function renderPhoenix() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (pW !== W || pH !== H) {
    pW = W; pH = H;
    pImage = new Float32Array(W * H);
    pDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'phoenixfrac') {
    pointer.clicked = false;
    pClickParam = (pointer.gx / W - 0.5) * 2.0;
    pClickFade = 1.0;
  }

  // Auto-cycle p parameter for psychedelic morphing
  var autoParam = 0.56667 + 0.4 * Math.sin(t * 0.15) + 0.2 * Math.sin(t * 0.23);
  if (pClickFade > 0.001) {
    pClickFade *= 0.985;
    pParam = autoParam * (1 - pClickFade) + pClickParam * pClickFade;
  } else {
    pParam = autoParam;
    pClickFade = 0;
  }
  pDirty = true;

  if (pDirty) {
    phoenixCompute();
    pDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = pImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.13 + y * 0.17 + t * 2.2) * 0.35 + 0.4;
        drawCharHSL('*', x, y, (t * 55 + 90) % 360 | 0, 92, (30 + pulse * 22) | 0);
        continue;
      }
      var v = val / 80;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (val * 18 + t * 40) % 360;
      var sat = 90 + v * 10;
      var lit = 45 + Math.min(v, 1) * 20;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('phoenixfrac', { init: initPhoenix, render: renderPhoenix });
