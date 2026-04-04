import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var jCr, jCi, jDirty, jImage, jW, jH, jClickCr, jClickCi, jClickFade;

function initJulia() {
  jCr = -0.7; jCi = 0.27015;
  jDirty = true;
  jW = 0; jH = 0;
  jImage = null;
  jClickCr = 0; jClickCi = 0;
  jClickFade = 0; // 0 = pure auto-orbit, 1 = clicked position
}

function juliaCompute() {
  var W = jW, H = jH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 3.0;
  var rangeX = rangeY * screenAspect;
  var maxIter = 80;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var zr = (x / W - 0.5) * rangeX;
      var zi = (y / H - 0.5) * rangeY;
      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var tr = zr * zr - zi * zi + jCr;
        zi = 2 * zr * zi + jCi;
        zr = tr;
        iter++;
      }
      if (iter === maxIter) {
        jImage[y * W + x] = -1;
      } else {
        var log2 = Math.log(2);
        var nu = Math.log(Math.log(Math.sqrt(zr * zr + zi * zi)) / log2) / log2;
        jImage[y * W + x] = (iter + 1 - nu);
      }
    }
  }
}

function renderJulia() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (jW !== W || jH !== H) {
    jW = W; jH = H;
    jImage = new Float32Array(W * H);
    jDirty = true;
  }

  // Click sets a target c — but auto-orbit never stops
  if (pointer.clicked && state.currentMode === 'julia') {
    pointer.clicked = false;
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var screenAspect = W / H * charAspect;
    jClickCr = (pointer.gx / W - 0.5) * 3.0 * screenAspect;
    jClickCi = (pointer.gy / H - 0.5) * 3.0;
    jClickFade = 1.0; // snap to clicked position
  }

  // Auto orbit always runs — click position fades back to orbit over ~3s
  var orbitSpeed = 0.15;
  var orbitCr = 0.7885 * Math.cos(t * orbitSpeed);
  var orbitCi = 0.7885 * Math.sin(t * orbitSpeed);

  // Fade click influence back to 0
  if (jClickFade > 0.001) {
    jClickFade *= 0.985; // ~3 second fade
    jCr = orbitCr * (1 - jClickFade) + jClickCr * jClickFade;
    jCi = orbitCi * (1 - jClickFade) + jClickCi * jClickFade;
  } else {
    jCr = orbitCr;
    jCi = orbitCi;
    jClickFade = 0;
  }
  jDirty = true;

  if (jDirty) {
    juliaCompute();
    jDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = jImage[y * W + x];
      if (val < 0) {
        // Inside set — deep glow
        var pulse = Math.sin(x * 0.15 + y * 0.2 + t * 2) * 0.3 + 0.3;
        if (pulse > 0.1) {
          drawCharHSL('.', x, y, (t * 40) % 360 | 0, 85, (30 + pulse * 20) | 0);
        }
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

registerMode('julia', { init: initJulia, render: renderJulia });
