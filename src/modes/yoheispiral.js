// yoheispiral — port of Yohei Nishitsuji's tsubuyaki-GLSL log-polar spiral
// Original GLSL (tweet 2045383716911136968, #つぶやきGLSL):
//   float i, e, R, s;
//   vec3 q, p, d = vec3((FC.xy - .5*r) / r.x, 1.);
//   for(q.z--; i++ < 119.;){
//     o.rgb += hsv(R/i, -e, e/3e1);
//     p = q += d * max(e, .005) * R * .2;
//     p.xy *= rotate2D(.8);
//     p = vec3(log(R = length(p)) - t*.3, e = -p.z/R - 1., atan(p.x*.1, p.y) - t*.3);
//     for(s = 1.; s < 6e3; s += s)
//       e += abs(dot(sin(p.yzx*s), cos(p.zxy*s))) / s;
//   }
//
// Blue/cyan swirling nebula — log-polar warp + pre-rotate (0.8 rad) paints
// a spiral galaxy fractal. The negative-saturation hsv() arg inverts channel
// ordering, pushing the palette into cool blue/cyan territory.
//
// ASCII port notes:
//   - Shader runs 119 outer × 13 inner = 1547 iters. JS at 160×80 cells
//     needs aggressive cut. 30 outer × 8 inner ≈ 240 ops/cell → 3M/frame.
//   - `r.x` normalizer (not r.y) → WIDER aspect than terrain shaders
//   - Negative sat in HSV is unusual: twigl's hsv() treats -sat by
//     inverting the mix ramp. We fake it via cool-shifted base hue
//     (blue 200°) with lightness-driven whites pushing toward core.
//   - `e = -p.z/R - 1.` also feeds as the inner-loop seed (e value
//     re-assigned inside the vec3() constructor — GLSL evaluates left-
//     to-right, so e is set after R is set). Replicated.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader=119; aggressive cut for JS perf).
var OUTER_ITERS = 18;
// Inner doubling loop: s=1, s*=2 until s>=6000 → ~13 iters full; cut to 6.
var INNER_MAX_S = 32;
// HDR → ASCII compression gain.
var GAIN = 90;

// Pre-rotate angle on p.xy (shader uses 0.8 rad)
var ROT_ANGLE = 0.8;
var COS_ROT = Math.cos(ROT_ANGLE);
var SIN_ROT = Math.sin(ROT_ANGLE);

// Drag interaction — pointer tilts the camera axis
var tiltX = 0;
var tiltY = 0;

function initYoheispiral() {
  tiltX = 0;
  tiltY = 0;
}

function renderYoheispiral() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'yoheispiral') {
    tiltX = (pointer.gx / W - 0.5) * 0.6;
    tiltY = (0.5 - pointer.gy / H) * 0.6;
  } else {
    tiltX *= 0.93;
    tiltY *= 0.93;
  }

  // Shader direction: d = vec3((FC - r/2)/r.x, 1.0)
  // r.x normalizer → wider FOV than r.y-normalized shaders
  var dz = 1.0;

  for (var y = 0; y < H; y++) {
    // (FC.y - r.y/2) / r.x — this is r.x divisor even for y component.
    // In ASCII land, r.x maps to cols, r.y maps to rows. Use cols as denominator.
    var ny = (0.5 - y / H) * (H / W) * 2;
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * 2 * ar;

      var dx = nx + tiltX * 0.3;
      var dy = ny + tiltY * 0.3;

      // q starts at vec3(0, 0, -1) (after q.z--)
      var qx = 0, qy = 0, qz = -1;
      var e = 0, R = 0;

      var accumV = 0;
      var accumHueShift = 0;
      var count = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // color accumulate — shader: o.rgb += hsv(R/i, -e, e/30)
        // Value channel e/30, hue R/i (cycles fast early then slows)
        var contrib = Math.abs(e) / 30;
        if (!isFinite(contrib)) contrib = 0;
        accumV += contrib;
        accumHueShift += (R / i) % 1;
        count++;

        // q += d * max(e, 0.005) * R * 0.2
        var stepE = Math.max(e, 0.005);
        var step = stepE * R * 0.2;
        qx += dx * step;
        qy += dy * step;
        qz += dz * step;

        // p.xy *= rotate2D(0.8) — pre-rotate before log-polar
        // First: compute R from rotated-xy + original z
        var rxp = qx * COS_ROT - qy * SIN_ROT;
        var ryp = qx * SIN_ROT + qy * COS_ROT;
        // R = length(rotated p)
        R = Math.sqrt(rxp * rxp + ryp * ryp + qz * qz);
        if (R < 1e-4) R = 1e-4;

        // p = vec3(log(R) - t*.3, -p.z/R - 1., atan(p.x*.1, p.y) - t*.3)
        var npx = Math.log(R) - t * 0.3;
        var npy = -qz / R - 1;
        var npz = Math.atan2(rxp * 0.1, ryp) - t * 0.3;
        e = npy;

        // Inner doubling loop: s=1 → s*=2 until s>=6000 → 13 iters full
        // e += abs(dot(sin(p.yzx*s), cos(p.zxy*s))) / s
        // p.yzx = (npy, npz, npx); p.zxy = (npz, npx, npy)
        var s = 1;
        while (s < INNER_MAX_S) {
          var sa = Math.sin(npy * s);
          var sb = Math.sin(npz * s);
          var sc = Math.sin(npx * s);
          var ca = Math.cos(npz * s);
          var cb = Math.cos(npx * s);
          var cc = Math.cos(npy * s);
          var dotv = sa * ca + sb * cb + sc * cc;
          e += Math.abs(dotv) / s;
          s += s;
        }
      }

      var normV = accumV / count;
      var v = 1 - Math.exp(-normV * GAIN);
      if (v < 0.04) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Cool blue/cyan palette — shader's negative-sat + fast-cycle hue
      // translates to blues shifted by log-polar radius. Base ~210° (cyan-blue),
      // swing into deeper navy (230°) or cyan (190°) based on R/i accumulation.
      var hueShift = accumHueShift / count;
      var hue = 210 + Math.sin(hueShift * Math.PI * 2) * 20;
      // Clamp to cool half of wheel
      if (hue < 180) hue = 180;
      if (hue > 240) hue = 240;

      // Saturation — bright core desaturates to white; cooler edges stay saturated
      var sat = 70 - v * 45;  // 70 → 25 as brightness climbs (core goes white)
      if (sat < 10) sat = 10;

      // Lightness — dark navy periphery to bright white core
      var light = 10 + v * 75;
      if (light > 92) light = 92;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheispiral', {
  init: initYoheispiral,
  render: renderYoheispiral,
});
