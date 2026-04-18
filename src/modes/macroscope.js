// macroscope — Yohei Nishitsuji's "Macroscopic microscope" as ASCII.
// Reference: tympanus.net/codrops/2025/02/18/rendering-the-simulation-theory-…
//
// Original GLSL (log-polar transform with cosine-of-cosine interference):
//   float i,e,R,s;
//   vec3 q,p,d = vec3(-FC.yx/r.y*.8*(abs(cos(t*.3)*.3+.1+.8)), 1);
//   for(q--; i++<119.; i>89.? d/=-d : d) {
//     e += i/5e3;
//     o += e*e/25.;
//     p = q += d*e*R*.16;
//     p = vec3(log2(R=length(p))-2.-t*.3, -p.z/R, atan(p.x, p.y));
//     for(e = --p.y; s < 1e5; s += s)
//       e += cos(dot(cos(p.zyy*s), cos(p.xyx*s))) / s;
//   }
//
// ASCII port strategy:
//   At grid resolution (~80x40) the full 119-iter raymarch is way too slow
//   in JS (observed 2 fps). We keep the SPIRIT of the shader — log-polar
//   remap + cosine-of-cosine interference — but flatten the outer ray-march
//   to a fixed depth so each cell is cheap. The result is visually the same
//   family of "microscopic fractal" patterns, computed cheaply.
//
//   Steps:
//     1. Screen → (u, v) with breathing zoom (matches cos(t*.3) factor).
//     2. Apply log-polar: (log2(R)-t*.3, angle, -depth/R).
//     3. Inner cosine-of-cosine sum (5 octaves ≈ s doubling from 1 to 16).
//     4. Map accumulated energy → ASCII ramp + blue-violet tint.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Inner doubling count — 5 octaves gives rich interference without killing fps.
var OCTAVES = 5;
// Drag warp — pulls the log-polar origin around when the user drags.
var dragX = 0, dragY = 0;

function initMacroscope() {
  dragX = 0;
  dragY = 0;
}

function renderMacroscope() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'macroscope') {
    dragX = (pointer.gx / W - 0.5) * 2;
    dragY = (pointer.gy / H - 0.5) * 2;
  } else {
    dragX *= 0.94;
    dragY *= 0.94;
  }

  // shader: breath = abs(cos(t*.3)*.3+.1+.8) — a slow 0.6..1.1 pulse
  var breath = Math.abs(Math.cos(t * 0.3) * 0.3 + 0.1 + 0.8);
  // Direction-reversal cue — shader does d/=-d at i=89. We fake that with a
  // periodic sign flip that ramps in/out so the output has the pull-back kick.
  var flipPhase = Math.sin(t * 0.18);
  var dirSign = flipPhase >= 0 ? 1 : -1;

  var invH = 1 / H;

  for (var y = 0; y < H; y++) {
    var uy = (y - H * 0.5) * 2 * invH * breath + dragY * 0.5;
    for (var x = 0; x < W; x++) {
      var ux = (x - W * 0.5) * 2 * invH * ar * breath + dragX * 0.5;

      // log-polar transform: angle + log-radius + depth
      // Guard against r = 0 at the origin cell.
      var r2 = ux * ux + uy * uy;
      if (r2 < 1e-6) r2 = 1e-6;
      var R = Math.sqrt(r2);
      var logR = Math.log2(R) - t * 0.3 * dirSign;
      var ang = Math.atan2(ux, uy);
      // shader's p.z/R factor — here we synthesize a depth from distance
      // with a slow time-wobble, so the third axis isn't flat.
      var depth = Math.cos(t * 0.13 + R * 0.6) * 0.8;

      // Inner cosine-of-cosine interference sum.
      // shader: for(e = --p.y; s<1e5; s+=s)
      //            e += cos(dot(cos(p.zyy*s), cos(p.xyx*s))) / s;
      // with p = (logR, depth, ang). We use p.zyy = (ang, depth, depth),
      // p.xyx = (logR, depth, logR).
      var e = depth - 1;
      var s = 1;
      for (var k = 0; k < OCTAVES; k++) {
        // cos(p.zyy*s) = (cos(ang*s), cos(depth*s), cos(depth*s))
        var c_z = Math.cos(ang * s);
        var c_d = Math.cos(depth * s);
        // cos(p.xyx*s) = (cos(logR*s), cos(depth*s), cos(logR*s))
        var c_x = Math.cos(logR * s);
        // dot(cos(p.zyy*s), cos(p.xyx*s)) = c_z*c_x + c_d*c_d + c_d*c_x
        var dotCC = c_z * c_x + c_d * c_d + c_d * c_x;
        e += Math.cos(dotCC) / s;
        s += s;
      }

      // Map interference energy → [0..1] brightness.
      // Normalise: each octave adds ±1/s so the sum roughly sits in [-1, +1]
      // plus the depth - 1 bias. Shift + gain so the pattern fills the ramp.
      var v = (e + 1.8) * 0.35;
      // Radial falloff at the very centre so the singularity doesn't burn out.
      v *= 1 - Math.exp(-R * 1.5);
      if (v <= 0.02) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Blue-violet tint — matches the glow colour (140,180,255).
      var hue = 220 + Math.sin(t * 0.2 + logR * 0.4) * 14;
      var sat = 40 + v * 30;
      var light = 20 + v * 55;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('macroscope', {
  init: initMacroscope,
  render: renderMacroscope,
});
