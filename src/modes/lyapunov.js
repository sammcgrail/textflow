import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var lImage, lW, lH, lDirty;
var lPhase;
var lClickPhase, lClickFade;

function initLyapunov() {
  lW = 0; lH = 0; lImage = null; lDirty = true;
  lPhase = 0;
  lClickPhase = 0; lClickFade = 0;
}

function lyapunovCompute() {
  var W = lW, H = lH;
  var N = 200; // iterations
  var warmup = 50;
  // Sequence AABB shifted by phase
  var seqLen = 4;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var a = 2.0 + (x / W) * 2.0; // a in [2, 4]
      var b = 2.0 + (y / H) * 2.0; // b in [2, 4]
      var xn = 0.5;
      var lyap = 0;
      var count = 0;

      for (var n = 0; n < N + warmup; n++) {
        // Sequence: AABB pattern with phase shift
        var seqIdx = ((n + (lPhase * seqLen | 0)) % seqLen);
        var r = (seqIdx < 2) ? a : b;
        xn = r * xn * (1 - xn);
        if (xn < 1e-10) xn = 1e-10;
        if (xn > 1 - 1e-10) xn = 1 - 1e-10;
        if (n >= warmup) {
          var deriv = Math.abs(r * (1 - 2 * xn));
          if (deriv > 1e-12) {
            lyap += Math.log(deriv);
            count++;
          }
        }
      }
      lImage[y * W + x] = count > 0 ? lyap / count : 0;
    }
  }
}

function renderLyapunov() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (lW !== W || lH !== H) {
    lW = W; lH = H;
    lImage = new Float32Array(W * H);
    lDirty = true;
  }

  if (pointer.clicked && state.currentMode === 'lyapunov') {
    pointer.clicked = false;
    lClickPhase = (pointer.gx / W) * 10;
    lClickFade = 1.0;
  }

  var autoPhase = t * 1.2;
  if (lClickFade > 0.001) {
    lClickFade *= 0.985;
    lPhase = autoPhase * (1 - lClickFade) + lClickPhase * lClickFade;
  } else {
    lPhase = autoPhase;
    lClickFade = 0;
  }
  lDirty = true;

  if (lDirty) {
    lyapunovCompute();
    lDirty = false;
  }

  // Pulsing zoom: oscillates between 0.7x and 1.3x over ~8 seconds
  var zoom = 1.0 + 0.3 * Math.sin(t * 0.8);
  var cx = W * 0.5, cy = H * 0.5;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Sample from zoomed coordinates
      var sx = ((x - cx) / zoom + cx) | 0;
      var sy = ((y - cy) / zoom + cy) | 0;
      if (sx < 0) sx = 0; if (sx >= W) sx = W - 1;
      if (sy < 0) sy = 0; if (sy >= H) sy = H - 1;
      var val = lImage[sy * W + sx];
      var chaotic = val > 0;
      // Normalize to visual range
      var v;
      if (chaotic) {
        v = Math.min(val / 1.5, 1);
      } else {
        v = Math.min(Math.abs(val) / 2, 1);
      }
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 1)) | 0);
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var hue, sat, lit;
      if (chaotic) {
        hue = (v * 180 + t * 100) % 360;
        sat = 90;
        lit = 40 + v * 25;
      } else {
        hue = (240 + v * 120 + t * 80) % 360;
        sat = 85;
        lit = 35 + v * 25;
      }
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('lyapunov', { init: initLyapunov, render: renderLyapunov });
