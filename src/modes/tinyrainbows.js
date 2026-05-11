import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// "Tiny Rainbows" — port of @clippecac (OldEclipse) FragCoord-DSL one-liner:
//   O = 1 / abs(sin(len(C.xy/90 + clm(tan(C.yx/90 + T), -5, 5)) + f4(,.2,.4,))) / 9
//
// The clamp(tan()) generates a tile lattice (tan goes to infinity at the
// asymptotes), len() folds it radially, 1/abs(sin()) creates high-contrast
// spectral bands. The f4(,.2,.4,) is a per-channel phase offset (R=0, G=.2,
// B=.4) which gives the chromatic dispersion / "tiny rainbows" feel.
//
// Per ASCII cell we compute the same per-channel intensities, then map the
// peak channel to a glyph from RAMP_DENSE and pull HSL from the RGB.
//
// Drag scrolls the grid origin. Tap pulses a brief zoom-in (scale spike) so
// you can see a single tile up close.

var trW = 0, trH = 0;
var trOffsetX = 0, trOffsetY = 0;
var trOffTargetX = 0, trOffTargetY = 0;
var trScaleBoost = 1;
var trR = null, trG = null, trB = null;

function initTinyRainbows() {
  trW = 0; trH = 0;
  trOffsetX = 0; trOffsetY = 0;
  trOffTargetX = 0; trOffTargetY = 0;
  trScaleBoost = 1;
  trR = null; trG = null; trB = null;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function rainbowsCompute() {
  var W = trW, H = trH;
  var t = state.time;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var aspectScale = (W / H) * charAspect;
  // Original `/90` over a ~1280px frame ≈ 14 units across. ASCII at ~120 cols
  // matches at a per-cell scale of ~9. trScaleBoost lets a tap zoom in.
  var scale = 9 / trScaleBoost;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Map cell → phase coord, aspect-corrected so tiles look square-ish.
      var cx = (x - W * 0.5) * aspectScale / scale + trOffsetX;
      var cy = (y - H * 0.5) / scale + trOffsetY;

      // clamp(tan(...), -5, 5) on the swapped axes — this is the lattice.
      var tx = clamp(Math.tan(cy + t), -5, 5);
      var ty = clamp(Math.tan(cx + t), -5, 5);

      // len(C.xy + clamp(tan(C.yx + T)))
      var px = cx + tx;
      var py = cy + ty;
      var d = Math.sqrt(px * px + py * py);

      // Per channel: 1 / abs(sin(d + phase)) / 9. Clamp the asymptotes.
      var r = 1 / (Math.abs(Math.sin(d)) + 1e-6) / 9;
      var g = 1 / (Math.abs(Math.sin(d + 0.2)) + 1e-6) / 9;
      var b = 1 / (Math.abs(Math.sin(d + 0.4)) + 1e-6) / 9;
      if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
      if (r < 0) r = 0; if (g < 0) g = 0; if (b < 0) b = 0;

      var idx = y * W + x;
      trR[idx] = r;
      trG[idx] = g;
      trB[idx] = b;
    }
  }
}

function rgbToHsl(r, g, b) {
  var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
  var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
  var l = (mx + mn) * 0.5;
  var h = 0, s = 0;
  if (mx !== mn) {
    var d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function renderTinyRainbows() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (trW !== W || trH !== H) {
    trW = W; trH = H;
    trR = new Float32Array(W * H);
    trG = new Float32Array(W * H);
    trB = new Float32Array(W * H);
  }

  if (pointer.down && state.currentMode === 'tinyrainbows') {
    trOffTargetX = (pointer.gx / W - 0.5) * 8;
    trOffTargetY = (pointer.gy / H - 0.5) * 8;
  }
  if (pointer.clicked && state.currentMode === 'tinyrainbows') {
    pointer.clicked = false;
    trScaleBoost = 2.4;  // zoom in pulse
  }
  trOffsetX += (trOffTargetX - trOffsetX) * 0.10;
  trOffsetY += (trOffTargetY - trOffsetY) * 0.10;
  trScaleBoost += (1 - trScaleBoost) * 0.04;

  rainbowsCompute();

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var r = trR[idx], g = trG[idx], b = trB[idx];
      var v = r > g ? (r > b ? r : b) : (g > b ? g : b); // peak channel

      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 1)) | 0);
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';

      var hsl = rgbToHsl(r, g, b);
      var hue = ((hsl[0] + 360) % 360) | 0;
      var sat = (hsl[1] * 100) | 0;
      if (sat < 30) sat = 30;  // keep saturated even when bands collapse
      var lit = (15 + v * 55) | 0;
      drawCharHSL(ch, x, y, hue, sat, lit);
    }
  }
}

registerMode('tinyrainbows', { init: initTinyRainbows, render: renderTinyRainbows });
