// yoheicavern — port of Yohei Nishitsuji's tsubuyaki-GLSL cavern raymarcher
// Original GLSL (tweet 2045277433134514346, posted 2026-04):
//   float i,e,g,R,s;
//   vec3 q,p,d=vec3((FC.xy-.5*r)/r,.7);
//   for(q.yz--;i++<99.;){
//     s=5.;
//     p=q+=d*e*R*.2;
//     g=p.x+p.z*9.;
//     p=vec3(log2(R=length(p))+g*.02-t*.2, exp2(mod(-p.z,s)/R)-.1, p);
//     for(e=--p.y; s<5e3; s+=s)
//       e-=abs(dot(cos(p.xzz*s+g), cos(p.zzy*s))/s*.6);
//     o.rgb+=hsv(e,e-R,min(e*i,.01));
//   }
//
// vs the fractal-fold yohei shader: this one is a raymarch through a
// log-radial / exp-angular reparam with cosine-FBM modulation. Ice-blue
// cavern. Hue rides `e` (emission), saturation rides `e-R` (brightness
// minus radial distance), value clamps at .01 per iter so the spiky HDR
// hit spreads over many rays instead of clipping on one.
//
// ASCII port notes:
//   - Shader runs 99 outer × ~10 inner = ~1000 iters/pixel. Textflow runs
//     in JS at (typically) 160×80 cells = 12800 cells/frame. Cutting outer
//     to 20 keeps the frame under 30ms on a decent laptop while preserving
//     the cavern character.
//   - `vec3(a, b, p)` where p is vec3 is a Twigl overflow constructor →
//     truncates to vec3(a, b, p.x). Replicated here.
//   - `--p.y` is prefix decrement (decrement THEN read). Replicated.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader uses 99; cut for interactive JS).
var OUTER_ITERS = 26;
// Inner doubling loop goes s=5, s*=2 until s>=5000 → ~10 iters.
// Keep full — it's where the cavern detail comes from.
var INNER_MAX_S = 5000;
// Brightness compression gain — tuned so the cavern walls read as distinct
// from the voids. Shader is HDR (iterative accumulation of min(e*i, .01));
// ASCII needs aggressive rolloff to surface variance instead of saturating.
var GAIN = 350;

// Drag-driven dolly: pointer y shifts d.z (ray direction depth), creating
// the "pulling in / pushing out" feel from the pfive version's tap pulse.
var dollyZ = 0;

function initYoheicavern() {
  dollyZ = 0;
}

function renderYoheicavern() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H; // character aspect correction

  // Drag interaction — pointer y adjusts dolly, x adds lateral tilt.
  var tiltX = 0;
  if (pointer.down && state.currentMode === 'yoheicavern') {
    dollyZ = (0.5 - pointer.gy / H) * 0.6;   // ±0.3 depth shift
    tiltX = (pointer.gx / W - 0.5) * 0.4;    // ±0.2 x tilt
  } else {
    dollyZ *= 0.93;
  }

  // Shader direction vector: d = vec3((FC - r/2)/r, 0.7 + dolly)
  // In textflow we compute per-cell below (FC equivalent varies per pixel).
  var dz = 0.7 + dollyZ;

  for (var y = 0; y < H; y++) {
    // Normalised screen y: shader uses (FC.y - r.y/2)/r.y (no aspect),
    // so range ~[-0.5, 0.5]. Flip sign to match GL y-up.
    var ny = (0.5 - y / H);
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * ar + tiltX;
      // d = (nx, ny, dz) — ray direction, not normalised (shader leaves it raw)
      var dx = nx;
      var dy = ny;

      // Init: q = (0, -1, -1), e=0, R=0, s=0, accumulators
      var qx = 0, qy = -1, qz = -1;
      var e = 0, g = 0, R = 0, s = 0;
      var accumV = 0;
      var accumE = 0;
      var accumEminusR = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        s = 5;
        // q += d * e * R * 0.2
        var step = e * R * 0.2;
        qx += dx * step;
        qy += dy * step;
        qz += dz * step;
        // p = q (copy)
        var px = qx, py = qy, pz = qz;

        g = px + pz * 9;
        R = Math.sqrt(px * px + py * py + pz * pz);
        if (R < 1e-4) R = 1e-4;

        // p = vec3(log2(R) + g*0.02 - t*0.2,
        //         exp2(mod(-pz, s)/R) - 0.1,
        //         px)                    // Twigl overflow truncate
        var modv = (-pz) - s * Math.floor((-pz) / s); // GLSL mod
        var npx = Math.log(R) / Math.LN2 + g * 0.02 - t * 0.2;
        var npy = Math.pow(2, modv / R) - 0.1;
        var npz = px;

        // --p.y (prefix decrement)
        npy -= 1;
        e = npy;

        // Inner doubling loop: s=5 → s*=2 until s>=5000
        // e -= abs(dot(cos(p.xzz*s + g), cos(p.zzy*s)) / s * 0.6)
        // p.xzz = (npx, npz, npz); p.zzy = (npz, npz, npy)
        while (s < INNER_MAX_S) {
          var a0 = Math.cos(npx * s + g);
          var a1 = Math.cos(npz * s + g);
          var a2 = Math.cos(npz * s + g);
          var b0 = Math.cos(npz * s);
          var b1 = Math.cos(npz * s);
          var b2 = Math.cos(npy * s);
          var dot = a0 * b0 + a1 * b1 + a2 * b2;
          e -= Math.abs(dot / s * 0.6);
          s += s;
        }

        // o.rgb += hsv(e, e-R, min(e*i, 0.01))
        // Shader sums hsv() over 99 iters — value channel caps each iter at 0.01.
        // For ASCII at OUTER=26 the first ~5 iters all have identical (q,p,e,R)
        // across pixels (ray hasn't diverged yet), so accumulating every iter
        // washes out per-pixel variance. Weight later iterations heavier — at
        // iter i, contribute i-th iter × i (linear ramp), keeping the "rays
        // that marched farther into the cavern contribute more" semantic.
        var v = Math.min(Math.abs(e) * i, 0.01) * i;
        accumV += v;
        accumE += e;
        accumEminusR += (e - R);
      }

      // Non-linear compression — shader is HDR, ASCII is 0..1 ramp.
      // Divide by OUTER_ITERS^2/2 roughly (weighted-sum normalisation), then
      // GAIN rolls off. Tuned so cavern walls read distinct from voids.
      var normV = accumV / (OUTER_ITERS * OUTER_ITERS * 0.5);
      var v = 1 - Math.exp(-normV * GAIN);
      if (v < 0.03) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue rides `e` average (shader's HSV hue = e). Map to cool palette:
      // e typically swings ~[-0.5, 0.5]; center at cyan (200°), swing ±40°.
      var eAvg = accumE / OUTER_ITERS;
      var hue = 200 + eAvg * 40;
      if (hue < 170) hue = 170;
      if (hue > 235) hue = 235;

      // Saturation rides (e - R) — brighter rays hold more color.
      var satK = accumEminusR / OUTER_ITERS;
      var sat = 40 + Math.max(0, Math.min(1, satK + 0.5)) * 45;

      // Lightness driven by accumulated v, with a floor so dim cavern walls
      // still read above ~10% so the ramp has headroom.
      var light = 12 + v * 60;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheicavern', {
  init: initYoheicavern,
  render: renderYoheicavern,
});
