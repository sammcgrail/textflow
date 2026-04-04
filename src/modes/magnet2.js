import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mgImage, mgW, mgH, mgDirty;
var mgCenterX, mgCenterY, mgZoom;
var mgClickCX, mgClickCY, mgClickFade;

function initMagnet2() {
  mgW = 0; mgH = 0; mgImage = null; mgDirty = true;
  mgCenterX = 1.5; mgCenterY = 0;
  mgZoom = 4.0;
  mgClickCX = 0; mgClickCY = 0; mgClickFade = 0;
}

// Complex division: (ar+ai*i) / (br+bi*i)
function cdiv(ar, ai, br, bi) {
  var d = br * br + bi * bi;
  if (d < 1e-20) return [1e6, 1e6];
  return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
}

function magnet2Compute() {
  var W = mgW, H = mgH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = mgZoom;
  var rangeX = rangeY * screenAspect;
  var maxIter = 60;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var cr = mgCenterX + (x / W - 0.5) * rangeX;
      var ci = mgCenterY + (y / H - 0.5) * rangeY;
      var zr = 0, zi = 0;
      var iter = 0;

      while (iter < maxIter) {
        // Magnet Type II: z = ((z^3 + 3(c-1)z + (c-1)(c-2)) / (3z^2 + 3(c-2)z + (c-1)(c-2) + 1))^2
        // Simplified: compute numerator and denominator
        var z2r = zr * zr - zi * zi;
        var z2i = 2 * zr * zi;
        var z3r = z2r * zr - z2i * zi;
        var z3i = z2r * zi + z2i * zr;

        var cm1r = cr - 1, cm1i = ci;
        var cm2r = cr - 2, cm2i = ci;

        // (c-1)(c-2)
        var c12r = cm1r * cm2r - cm1i * cm2i;
        var c12i = cm1r * cm2i + cm1i * cm2r;

        // 3(c-1)*z
        var t3czr = 3 * (cm1r * zr - cm1i * zi);
        var t3czi = 3 * (cm1r * zi + cm1i * zr);

        // numerator: z^3 + 3(c-1)z + (c-1)(c-2)
        var numR = z3r + t3czr + c12r;
        var numI = z3i + t3czi + c12i;

        // 3z^2
        var t3z2r = 3 * z2r;
        var t3z2i = 3 * z2i;

        // 3(c-2)*z
        var t3c2zr = 3 * (cm2r * zr - cm2i * zi);
        var t3c2zi = 3 * (cm2r * zi + cm2i * zr);

        // denominator: 3z^2 + 3(c-2)z + (c-1)(c-2) + 1
        var denR = t3z2r + t3c2zr + c12r + 1;
        var denI = t3z2i + t3c2zi + c12i;

        // fraction = num/den
        var frac = cdiv(numR, numI, denR, denI);

        // square it
        var newZr = frac[0] * frac[0] - frac[1] * frac[1];
        var newZi = 2 * frac[0] * frac[1];

        if (newZr * newZr + newZi * newZi > 100) break;

        // Check convergence to fixed point z=1
        var dr = newZr - 1, di = newZi;
        if (dr * dr + di * di < 1e-6) { iter = maxIter; break; }

        zr = newZr; zi = newZi;
        iter++;
      }
      if (iter === maxIter) {
        mgImage[y * W + x] = -1;
      } else {
        mgImage[y * W + x] = iter;
      }
    }
  }
}

function renderMagnet2() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (mgW !== W || mgH !== H) {
    mgW = W; mgH = H;
    mgImage = new Float32Array(W * H);
    mgDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'magnet2') {
    pointer.clicked = false;
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var screenAspect = W / H * charAspect;
    mgClickCX = mgCenterX + (pointer.gx / W - 0.5) * mgZoom * screenAspect;
    mgClickCY = mgCenterY + (pointer.gy / H - 0.5) * mgZoom;
    mgClickFade = 1.0;
  }

  // Auto-zoom into interesting regions
  var autoX = 1.5 + 0.8 * Math.sin(t * 0.07) + 0.3 * Math.cos(t * 0.15);
  var autoY = 0.6 * Math.cos(t * 0.09) + 0.2 * Math.sin(t * 0.19);
  var autoZoom = 2.5 + 1.5 * Math.sin(t * 0.05);

  if (mgClickFade > 0.001) {
    mgClickFade *= 0.985;
    mgCenterX = autoX * (1 - mgClickFade) + mgClickCX * mgClickFade;
    mgCenterY = autoY * (1 - mgClickFade) + mgClickCY * mgClickFade;
  } else {
    mgCenterX = autoX;
    mgCenterY = autoY;
    mgClickFade = 0;
  }
  mgZoom = autoZoom;
  mgDirty = true;

  if (mgDirty) {
    magnet2Compute();
    mgDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = mgImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.11 + y * 0.16 + t * 2.1) * 0.3 + 0.4;
        drawCharHSL('.', x, y, (220 + t * 30) % 360 | 0, 92, (30 + pulse * 18) | 0);
        continue;
      }
      var v = val / 60;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 2.5) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      // Electric blues and purples with rainbow cycling
      var hue = (220 + val * 12 + t * 28) % 360;
      var sat = 92;
      var lit = 42 + Math.min(v, 1) * 23;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('magnet2', { init: initMagnet2, render: renderMagnet2 });
