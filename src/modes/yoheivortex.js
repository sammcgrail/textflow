// yoheivortex — port of Yohei Nishitsuji's tsubuyaki-GLSL log-polar vortex
// Original GLSL (tweet 2045276647142863013, posted 2026-04):
//   float i,e,R,s;
//   vec3 q,p,d=vec3((FC.xy-r*.5)/r*2.,.5);
//   for(q.xz--;i++<99.;){
//     o.rgb+=.01-hsv(.1,sin(e),min(e*s,.7-e)/35.);
//     s=3.;
//     p=q+=d*e*R*.1;
//     p=vec3(log2(R=length(p-.05))-t, exp(.5-p.z/R), atan(p.y,p.x));
//     for(e=--p.y; s<1e3; s+=s)
//       e+=sin(dot(sin(p.xxy*s), cos(1.-p.xzy*s)))/s;
//   }
//
// Warm orange/brown rose-pattern fractal tunnel — the log-polar warp
// (log2(R), exp(.5-z/R), atan(y,x)) maps radial rays onto concentric
// rings and the cosine-FBM paints them into the filigree rose shape.
//
// ASCII port notes:
//   - Shader runs 99 outer × ~9 inner = ~900 iters. JS at 160×80 cells
//     needs aggressive cut. 24 outer × 8 inner = ~3M ops/frame → 30fps.
//   - `log2(R=length(p-.05))` — p-.05 is a componentwise offset. We
//     subtract 0.05 from each of x,y,z before taking length.
//   - `--p.y` is prefix decrement (read after). Replicated.
//   - `o.rgb += .01 - hsv(...)` is a *subtractive* accumulator — the
//     shader paints dark bands over light. We treat this as intensity.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader=99; aggressive cut for JS).
// 24 outer × 8 inner ≈ 200 iters/cell; 160×80 cells ≈ 2.6M ops/frame.
var OUTER_ITERS = 24;
// Inner doubling loop: s=3, s*=2 until s>=1000 → ~8 iters.
var INNER_MAX_S = 1000;
// HDR → ASCII compression gain.
var GAIN = 120;

// Drag interaction — pointer pushes/pulls through the tunnel
var dollyZ = 0;
var tiltX = 0;

function initYoheivortex() {
  dollyZ = 0;
  tiltX = 0;
}

function renderYoheivortex() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'yoheivortex') {
    dollyZ = (0.5 - pointer.gy / H) * 0.4;
    tiltX = (pointer.gx / W - 0.5) * 0.5;
  } else {
    dollyZ *= 0.93;
    tiltX *= 0.93;
  }

  // Shader direction: d = vec3((FC - r/2)/r * 2, 0.5)
  // Multiply screen coords by 2 → wider FOV
  var dz = 0.5 + dollyZ;

  for (var y = 0; y < H; y++) {
    // (FC.y - r.y/2)/r.y * 2 → range [-1, 1]
    var ny = (0.5 - y / H) * 2;
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * 2 * ar + tiltX;

      var dx = nx, dy = ny;

      // q starts at vec3(-1, 0, -1) (after q.xz--)
      var qx = -1, qy = 0, qz = -1;
      var e = 0, R = 0, s = 0;

      var accumV = 0;
      var accumHue = 0;
      var accumSat = 0;
      var count = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // color accumulate — shader: o.rgb += .01 - hsv(.1, sin(e), min(e*s, .7-e)/35)
        // The value channel is min(e*s, .7-e)/35, weighted by sin(e) as saturation.
        var vchan = Math.min(e * s, 0.7 - e);
        if (!isFinite(vchan)) vchan = 0;
        var contrib = Math.abs(vchan) / 35;
        accumV += contrib;
        accumSat += Math.sin(e);
        accumHue += 0.1; // shader is fixed hue .1 → 36° (warm amber)
        count++;

        s = 3;
        // q += d * e * R * 0.1
        var step = e * R * 0.1;
        qx += dx * step;
        qy += dy * step;
        qz += dz * step;

        // p = q - vec3(0.05, 0.05, 0.05) for length calc
        var offx = qx - 0.05, offy = qy - 0.05, offz = qz - 0.05;
        R = Math.sqrt(offx * offx + offy * offy + offz * offz);
        if (R < 1e-4) R = 1e-4;

        // p = vec3(log2(R) - t, exp(0.5 - p.z/R), atan(p.y, p.x))
        // Note: shader uses original p (which is q) for .z/R and atan(.y,.x)
        var npx = Math.log(R) / Math.LN2 - t;
        var npy = Math.exp(0.5 - qz / R);
        var npz = Math.atan2(qy, qx);

        // --p.y (prefix decrement)
        npy -= 1;
        e = npy;

        // Inner doubling loop: s=3 → s*=2 until s>=1000
        // e += sin(dot(sin(p.xxy*s), cos(1. - p.xzy*s))) / s
        // p.xxy = (npx, npx, npy); p.xzy = (npx, npz, npy)
        while (s < INNER_MAX_S) {
          var sa = Math.sin(npx * s);
          var sb = Math.sin(npx * s);
          var sc = Math.sin(npy * s);
          var ca = Math.cos(1 - npx * s);
          var cb = Math.cos(1 - npz * s);
          var cc = Math.cos(1 - npy * s);
          var dotv = sa * ca + sb * cb + sc * cc;
          e += Math.sin(dotv) / s;
          s += s;
        }
      }

      var normV = accumV / count;
      var v = 1 - Math.exp(-normV * GAIN);
      if (v < 0.04) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Warm orange/brown — shader hue=0.1 (~36° amber).
      // Swing slightly based on saturation channel for depth variation.
      var satAvg = accumSat / count;
      var hue = 28 + satAvg * 12;      // 16–40° — amber → orange
      if (hue < 10) hue = 10;
      if (hue > 50) hue = 50;

      // Saturation — warm rose stays saturated in the centre, washes at edges
      var sat = 55 + v * 30;
      // Lightness
      var light = 15 + v * 55;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheivortex', {
  init: initYoheivortex,
  render: renderYoheivortex,
});
