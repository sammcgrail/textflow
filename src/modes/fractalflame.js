import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ffBuf, ffColor, ffW, ffH;
var ffVarParam;
var ffClickVar, ffClickFade;

function initFlame() {
  ffW = 0; ffH = 0; ffBuf = null; ffColor = null;
  ffVarParam = 0;
  ffClickVar = 0; ffClickFade = 0;
}

function flameCompute() {
  var W = ffW, H = ffH;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);

  // Clear buffers
  for (var i = 0; i < W * H; i++) { ffBuf[i] = 0; ffColor[i] = 0; }

  var vp = ffVarParam;
  var t = state.time;

  // IFS with sinusoidal variations
  var px = 0.1, py = 0.1;
  var colorIdx = 0.5;
  var numPoints = W * H * 2;
  if (numPoints > 120000) numPoints = 120000;

  // Precompute transform parameters that vary with time
  var a1 = 0.6 * Math.cos(vp * 0.5);
  var b1 = -0.4 * Math.sin(vp * 0.7);
  var c1 = 0.3 * Math.sin(vp * 0.3);
  var d1 = 0.7 * Math.cos(vp * 0.4);

  var a2 = -0.5 * Math.sin(vp * 0.6);
  var b2 = 0.6 * Math.cos(vp * 0.8);
  var c2 = 0.5 * Math.cos(vp * 0.35);
  var d2 = -0.4 * Math.sin(vp * 0.55);

  var a3 = 0.4 * Math.cos(vp * 0.45);
  var b3 = 0.5 * Math.sin(vp * 0.65);
  var c3 = -0.6 * Math.cos(vp * 0.5);
  var d3 = 0.3 * Math.sin(vp * 0.4);

  // Use a simple LCG for speed instead of Math.random
  var seed = ((t * 1000) | 0) & 0x7FFFFFFF;
  function rng() {
    seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    return (seed & 0xFFFF) / 0xFFFF;
  }

  for (var i = 0; i < numPoints; i++) {
    var r = rng();
    var nx, ny, nc;

    if (r < 0.33) {
      // Sinusoidal variation
      nx = Math.sin(a1 * px + b1 * py);
      ny = Math.sin(c1 * px + d1 * py);
      nc = 0.2;
    } else if (r < 0.66) {
      // Spherical variation
      var r2 = px * px + py * py + 1e-6;
      var tx = a2 * px + b2 * py;
      var ty = c2 * px + d2 * py;
      nx = tx / r2;
      ny = ty / r2;
      nc = 0.5;
    } else {
      // Swirl variation
      var sr2 = px * px + py * py;
      var sinr = Math.sin(sr2);
      var cosr = Math.cos(sr2);
      var tx2 = a3 * px + b3 * py;
      var ty2 = c3 * px + d3 * py;
      nx = tx2 * sinr - ty2 * cosr;
      ny = tx2 * cosr + ty2 * sinr;
      nc = 0.8;
    }

    px = nx; py = ny;
    colorIdx = (colorIdx + nc) * 0.5;

    // Skip first 20 points (warmup)
    if (i < 20) continue;

    // Map to screen
    var sx = ((px * 0.3 + 0.5) * W) | 0;
    var sy = ((py * 0.3 / charAspect + 0.5) * H) | 0;

    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      var idx = sy * W + sx;
      ffBuf[idx]++;
      ffColor[idx] = (ffColor[idx] * (ffBuf[idx] - 1) + colorIdx * 360) / ffBuf[idx];
    }
  }
}

function renderFlame() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (ffW !== W || ffH !== H) {
    ffW = W; ffH = H;
    ffBuf = new Float32Array(W * H);
    ffColor = new Float32Array(W * H);
  }

  if (pointer.clicked && state.currentMode === 'fractalflame') {
    pointer.clicked = false;
    ffClickVar = (pointer.gx / W) * 10;
    ffClickFade = 1.0;
  }

  var autoVar = t * 0.4;
  if (ffClickFade > 0.001) {
    ffClickFade *= 0.985;
    ffVarParam = autoVar * (1 - ffClickFade) + ffClickVar * ffClickFade;
  } else {
    ffVarParam = autoVar;
    ffClickFade = 0;
  }

  flameCompute();

  // Find max for log-density mapping
  var maxVal = 1;
  for (var i = 0; i < W * H; i++) {
    if (ffBuf[i] > maxVal) maxVal = ffBuf[i];
  }
  var logMax = Math.log(maxVal + 1);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var hits = ffBuf[idx];
      if (hits < 1) {
        // Dark background with subtle shimmer
        var shimmer = Math.sin(x * 0.2 + y * 0.25 + t * 1.5) * 0.15 + 0.2;
        drawCharHSL('.', x, y, (t * 20 + x * 2) % 360 | 0, 60, (15 + shimmer * 10) | 0);
        continue;
      }
      var v = Math.log(hits + 1) / logMax;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 1)) | 0);
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var hue = (ffColor[idx] + t * 25) % 360;
      var sat = 95;
      var lit = 35 + v * 30;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('fractalflame', { init: initFlame, render: renderFlame });
