import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// XorDev "Viscosity" — port of the FragCoord-DSL shader to a CPU-rendered
// ASCII grid. Original (3 lines):
//   f2 c = C.xy / R.y * 4 + R, s = flr(c), i;
//   @(9) c += cos(++i * c.yx + .1/(s-c) + T) / i
//   O = exp(-3*abs(sin(c.y + f4(,.4,.2,))))
//
// Per ASCII cell we run the same 9-iter inverse-distance domain warp + the
// exp(-abs(sin)) ridge readout, then map brightness → glyph from RAMP_DENSE.
// Hue cycles with the warped y coord (mimics XorDev's per-channel offset)
// so the iridescent oil-film flavor reads in HSL.
//
// Mouse drag scrolls the grid origin so you can scrub through the fluid.
// Click pulses the iter count up briefly for a denser frame.

var xvW = 0, xvH = 0;
var xvOffsetX = 0, xvOffsetY = 0;
var xvOffTargetX = 0, xvOffTargetY = 0;
var xvIterBoost = 0;
var xvBuf = null;       // brightness 0..1
var xvHue = null;       // 0..360

function initXorVisc() {
  xvW = 0; xvH = 0;
  xvOffsetX = 0; xvOffsetY = 0;
  xvOffTargetX = 0; xvOffTargetY = 0;
  xvIterBoost = 0;
  xvBuf = null; xvHue = null;
}

function viscCompute() {
  var W = xvW, H = xvH;
  var t = state.time;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  // Aspect-correct so the grid cells read as roughly square.
  var aspectScale = (W / H) * charAspect;

  // Iter cap (mobile-aware would go here; default 9 + click boost up to 12).
  var iters = 9 + Math.floor(xvIterBoost);
  if (iters > 12) iters = 12;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Normalize + scale to ~4 cells/axis. Use H as the divisor like the
      // original (`/ R.y`) so vertical cells stay ~regular.
      var cx = (x / H * 4.0 * aspectScale) + (W / H) + xvOffsetX;
      var cy = (y / H * 4.0)               + 1.0     + xvOffsetY;
      var sx = Math.floor(cx);
      var sy = Math.floor(cy);

      // 9-iter inverse-distance domain warp.
      var i = 0;
      for (var n = 0; n < iters; n++) {
        i += 1;
        var dx = sx - cx;
        var dy = sy - cy;
        // 0.1/(s-c) singularity field — guard tiny denominators so
        // cells exactly at the singularity don't NaN.
        var gx = dx === 0 ? 1000 : 0.1 / dx;
        var gy = dy === 0 ? 1000 : 0.1 / dy;
        // arg = i * c.yx + singularity + T
        var ax = i * cy + gx + t;
        var ay = i * cx + gy + t;
        cx += Math.cos(ax) / i;
        cy += Math.cos(ay) / i;
      }

      // Readout — exp(-3 * abs(sin(c.y))) for the brightness ridge.
      // Skip per-channel RGB offset; HSL hue handles the chromatic spin.
      var brightness = Math.exp(-3.0 * Math.abs(Math.sin(cy)));
      var idx = y * W + x;
      xvBuf[idx] = brightness;

      // Hue from warped y coord + slow time precession + horizontal phase.
      // Mirrors the XorDev per-channel offset trick — same scalar driving
      // multiple chromatic samples, here as a 360° rotation.
      var hue = ((cy * 30 + cx * 10 + t * 25) % 360 + 360) % 360;
      xvHue[idx] = hue;
    }
  }
}

function renderXorVisc() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (xvW !== W || xvH !== H) {
    xvW = W; xvH = H;
    xvBuf = new Float32Array(W * H);
    xvHue = new Float32Array(W * H);
  }

  // Mouse drag offsets the grid origin (scroll through the fluid).
  // Click pulses iter boost briefly for a denser frame.
  if (pointer.down && state.currentMode === 'xorvisc') {
    xvOffTargetX = (pointer.gx / W - 0.5) * 6;
    xvOffTargetY = (pointer.gy / H - 0.5) * 6;
  }
  if (pointer.clicked && state.currentMode === 'xorvisc') {
    pointer.clicked = false;
    xvIterBoost = 3;
  }
  // Smooth lerp the offsets so it doesn't jerk.
  xvOffsetX += (xvOffTargetX - xvOffsetX) * 0.10;
  xvOffsetY += (xvOffTargetY - xvOffsetY) * 0.10;
  // Decay the iter boost.
  xvIterBoost *= 0.94;

  viscCompute();

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var v = xvBuf[idx];
      // Map brightness 0..1 → glyph from dense ramp.
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 1)) | 0);
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var hue = xvHue[idx] | 0;
      var sat = 92;
      // Lit driven by brightness so dim cells fade toward dark.
      var lit = (15 + v * 55) | 0;
      drawCharHSL(ch, x, y, hue, sat, lit);
    }
  }
}

registerMode('xorvisc', { init: initXorVisc, render: renderXorVisc });
