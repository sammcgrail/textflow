import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// yoheicoral — Yohei Nishitsuji's abs-fold coral, marched in characters.
// Source: #つぶやきGLSL, tweet 2083183398575604193.
//
//   for(float i,e,g;i++<1e2;){
//     vec3 p=vec3((FC.xy-r*.5)/r.y*g, g-3.+sin(t*.5));
//     p.zy*=rotate2D(t*.5);
//     for(int j;j++<6;)
//       p*=rotate3D(t+.5,vec3(5,2.*smoothstep(-8.,8.,0.),4)), p=abs(p+p)-1.;
//     g+=e=(length(p.yzx)*5.-6.)/9e2;
//     o+=exp(-e*1e6)/7e1;
//   }
//
// Two things the 280 characters hide, both of which cost real time on the GPU
// port before I spotted them:
//   * smoothstep(-8.,8.,0.) is a CONSTANT — 0.5 — so the rotation axis is only
//     ever vec3(5,1,4). It reads like a live knob and never moves.
//   * length(p.yzx) == length(p). A swizzle cannot change a vector's length, so
//     the distance estimate is just (length(p)*5-6)/900.
// Also: `p *= rotate3D(...)` is ROW-vector, p = p*M. Both matrices depend only
// on time, so they are built ONCE per frame here rather than per sample —
// on the GPU that was 600 rebuilds per pixel.
//
// Why this one suits characters at all: the image is a pure luminance field of
// tiny packed beads, and a monospace ramp is a luminance quantiser. There is no
// colour to lose. What you lose is spatial resolution, which is exactly why
// this mode runs a SMALLER FONT than the rest of textflow (Sam's call) — the
// beads are the subject, and at the default ~13px cell they merge into porridge.
//
// The cost is real: a cell is up to 100 outer steps x 6 folds, so the grid is
// the budget. Trimming the STEP count is not the lever it looks like — the glow
// accumulates late, and at 50 steps peak luminance falls from 1.00 to 0.33 and
// at 32 to 0.07, i.e. the picture simply goes away. Measured, not guessed.
// The lever that worked was breaking as soon as o saturates.
//
// DRAG to tilt the camera. TAP to freeze.

var W = 0, H = 0;
var lum = null;                  // luminance per cell, 0..1
var frozen = false;
var frozenT = 0;
var tiltX = 0, tiltY = 0;
var phase = 0;                   // interlace parity

// Dense-to-sparse ramp. Reversed from the usual: the fractal is bright ON a
// black ground, so the heaviest glyphs must land on the brightest samples.
var RAMP = ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

function initCoral() {
  // Opt into a denser grid, then re-measure. resize() reads FONT_SCALE.
  state.FONT_SCALE = 0.9;   // a step down from the shared default, as small as the budget allows
  resize();

  W = state.COLS;
  H = state.ROWS;
  lum = new Float32Array(W * H);
  frozen = false;
  frozenT = 0;
  tiltX = 0;
  tiltY = 0;
}

function cleanupCoral() {
  // MUST restore, or every other mode inherits the tiny font. cleanup() runs on
  // mode switch (engine.js calls prev.cleanup() before the new mode's init).
  state.FONT_SCALE = 1;
  resize();
}

// Rodrigues, matching twigl's rotate3D column order. Returns a flat 9-array
// laid out as columns: [c0x,c0y,c0z, c1x,c1y,c1z, c2x,c2y,c2z].
function rot3(angle, ax, ay, az) {
  var L = Math.sqrt(ax * ax + ay * ay + az * az);
  var x = ax / L, y = ay / L, z = az / L;
  var s = Math.sin(angle), c = Math.cos(angle), r = 1 - c;
  return [
    x * x * r + c,     y * x * r + z * s, z * x * r - y * s,
    x * y * r - z * s, y * y * r + c,     z * y * r + x * s,
    x * z * r + y * s, y * z * r - x * s, z * z * r + c,
  ];
}

function renderCoral() {
  clearCanvas();

  if (W !== state.COLS || H !== state.ROWS) {
    W = state.COLS; H = state.ROWS;
    lum = new Float32Array(W * H);
  }
  if (!lum) return;

  var t = frozen ? frozenT : state.time;

  // Drag tilts the camera; the pointer is only sampled while held.
  if (pointer.down) {
    tiltX += ((pointer.x / Math.max(1, window.innerWidth) - 0.5) * 0.5 - tiltX) * 0.15;
    tiltY += ((pointer.y / Math.max(1, window.innerHeight) - 0.5) * 0.5 - tiltY) * 0.15;
  }

  // Built once per FRAME, not per sample.
  var M = rot3(t + 0.5, 5, 1, 4);
  var c2 = Math.cos(t * 0.5), s2 = Math.sin(t * 0.5);
  var camZ = -3 + Math.sin(t * 0.5);

  // Field of view. The full-frame framing of the original aliases into noise at
  // character resolution — one cell samples one point of a very high-frequency
  // field, so neighbours are uncorrelated. Zooming in until a bead spans a few
  // cells is what makes it read as structure instead of static.
  var ZOOM = 0.16;
  // Cell aspect: characters are ~2x taller than wide, so the horizontal span is
  // the canvas aspect measured in PIXELS, not in cells.
  var physAspect = (W * state.CHAR_W) / (H * state.CHAR_H);
  var OUTER = 100;   // cutting this does not work — see below

  // INTERLACED. Every cell is a fixed 100-step march — the ray converges rather
  // than escaping, so no early-out exists for the void (measured: 640k steps
  // with or without an escape test). Halving the work per frame is the only
  // lever left that does not cost either resolution or the picture itself.
  // Alternate rows update on alternate frames; the field is fully fresh every
  // second frame, which at this animation speed is invisible.
  phase ^= 1;
  var maxL = 0;
  for (var yy = phase; yy < H; yy += 2) {
    var sy = ((yy + 0.5) / H - 0.5) * ZOOM + tiltY;
    for (var xx = 0; xx < W; xx++) {
      var sx = ((xx + 0.5) / W - 0.5) * physAspect * ZOOM + tiltX;

      var g = 0, o = 0;
      for (var i = 0; i < OUTER; i++) {
        var px = sx * g, py = sy * g, pz = g + camZ;

        // p.zy *= rotate2D(t*.5)  — rotate the (z,y) pair, in that order
        var nz = pz * c2 - py * s2;
        var ny = pz * s2 + py * c2;
        pz = nz; py = ny;

        for (var j = 0; j < 6; j++) {
          // p = p * M  (row vector) → dot p with each COLUMN
          var qx = px * M[0] + py * M[1] + pz * M[2];
          var qy = px * M[3] + py * M[4] + pz * M[5];
          var qz = px * M[6] + py * M[7] + pz * M[8];
          px = Math.abs(qx + qx) - 1;
          py = Math.abs(qy + qy) - 1;
          pz = Math.abs(qz + qz) - 1;
        }

        var len = Math.sqrt(px * px + py * py + pz * pz);
        var e = (len * 5 - 6) / 900;
        g += e;
        // exp(-e*1e6) overflows the instant e goes negative, which it does at
        // the fold surface. The GPU saturates to white; here it would be
        // Infinity and poison the whole cell, so cap the step.
        var arg = -e * 1e6;
        o += (arg > 0 ? 1 : (arg < -60 ? 0 : Math.exp(arg))) / 70;
        // Break at 1.0, not higher: o is clamped to 1 below, so every step past
        // it is pure cost. Measured 2.8x faster for byte-identical output, and
        // that speedup is what pays for the smaller font.
        if (o >= 1) break;
      }

      var v = o > 1 ? 1 : o;
      lum[yy * W + xx] = v;
      if (v > maxL) maxL = v;
    }
  }

  // Normalise over the WHOLE cached field, not just the rows recomputed this
  // frame — taking the max of half the rows makes the scale jitter between
  // parities and the picture strobes.
  maxL = 0;
  for (var k = 0; k < lum.length; k++) if (lum[k] > maxL) maxL = lum[k];
  var norm = maxL > 0.05 ? 1 / maxL : 1;

  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      var val = lum[y2 * W + x2] * norm;
      // Lift the black point. Without it ~91% of cells get a glyph and the
      // frame reads as texture soup; the original is roughly half void.
      val = val <= 0.42 ? 0 : (val - 0.42) / 0.58;
      if (val < 0.02) continue;
      var gamma = Math.pow(val, 1.15);
      var idx = Math.min(RAMP.length - 1, Math.floor(gamma * RAMP.length));
      var ch = RAMP.charAt(idx);
      if (ch === ' ') continue;
      // Near-white, faintly cool in the shadows — the original is greyscale, so
      // this stays desaturated rather than inventing a palette.
      var light = 24 + gamma * 68;
      drawCharHSL(ch, x2, y2, 196, 10 + (1 - gamma) * 14, light);
    }
  }
}

function attachCoral() {
  pointer.onTap = function () {
    frozen = !frozen;
    if (frozen) frozenT = state.time;
  };
}

registerMode('yoheicoral', {
  init: initCoral,
  render: renderCoral,
  attach: attachCoral,
  cleanup: cleanupCoral,
});
