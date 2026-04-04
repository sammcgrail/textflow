import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mImage, mW, mH, mDirty;
var mPower;
var mClickPower, mClickFade;

function initMultibrot() {
  mW = 0; mH = 0; mImage = null; mDirty = true;
  mPower = 2;
  mClickPower = 2; mClickFade = 0;
}

// Complex power: (r,i)^d using polar form
function cpow(r, i, d) {
  var mag = Math.sqrt(r * r + i * i);
  if (mag < 1e-12) return [0, 0];
  var angle = Math.atan2(i, r);
  var newMag = Math.pow(mag, d);
  var newAngle = angle * d;
  return [newMag * Math.cos(newAngle), newMag * Math.sin(newAngle)];
}

function multibrotCompute() {
  var W = mW, H = mH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var screenAspect = W / H * charAspect;
  var rangeY = 3.5;
  var rangeX = rangeY * screenAspect;
  var maxIter = 80;
  var d = mPower;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var cr = (x / W - 0.5) * rangeX;
      var ci = (y / H - 0.5) * rangeY;
      var zr = 0, zi = 0;
      var iter = 0;
      while (zr * zr + zi * zi < 4 && iter < maxIter) {
        var p = cpow(zr, zi, d);
        zr = p[0] + cr;
        zi = p[1] + ci;
        iter++;
      }
      if (iter === maxIter) {
        mImage[y * W + x] = -1;
      } else {
        var mag = Math.sqrt(zr * zr + zi * zi);
        var log2 = Math.log(2);
        var logD = Math.log(d);
        var nu = mag > 1 ? Math.log(Math.log(mag) / log2) / logD : 0;
        mImage[y * W + x] = iter + 1 - nu;
      }
    }
  }
}

function renderMultibrot() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (mW !== W || mH !== H) {
    mW = W; mH = H;
    mImage = new Float32Array(W * H);
    mDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'multibrot') {
    pointer.clicked = false;
    mClickPower = 2 + (pointer.gx / W) * 6; // map x to power 2-8
    mClickFade = 1.0;
  }

  // Auto-animate power from 2 to 8 and back (smooth sinusoidal)
  var autoPower = 5 + 3 * Math.sin(t * 0.12);
  if (mClickFade > 0.001) {
    mClickFade *= 0.985;
    mPower = autoPower * (1 - mClickFade) + mClickPower * mClickFade;
  } else {
    mPower = autoPower;
    mClickFade = 0;
  }
  mDirty = true;

  if (mDirty) {
    multibrotCompute();
    mDirty = false;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = mImage[y * W + x];
      if (val < 0) {
        var pulse = Math.sin(x * 0.1 + y * 0.14 + t * 1.9) * 0.3 + 0.35;
        drawCharHSL('.', x, y, (t * 35 + 60) % 360 | 0, 88, (28 + pulse * 20) | 0);
        continue;
      }
      var v = val / 80;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length * 3) | 0);
      if (ri >= RAMP_DENSE.length) ri = RAMP_DENSE.length - 1;
      var ch = RAMP_DENSE[ri];
      var hue = (val * 15 + t * 30) % 360;
      var sat = 88 + v * 12;
      var lit = 44 + Math.min(v, 1) * 21;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('multibrot', { init: initMultibrot, render: renderMultibrot });
