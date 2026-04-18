// emptiness — port of Yohei Nishitsuji's "Emptiness, your infinity" tsubuyaki-GLSL shader
// (featured on Codrops, Feb 2025). Infinite-depth cyan fractal tunnel.
//
// Original GLSL (cleaned of extraction artifacts):
//   float i,e,g,R,s;
//   vec3 q,p,d=vec3(FC.xy/r-.6,1);
//   for(q.zy--; i++<99.; ) {
//     e+=i/8e5;
//     o.rgb+=hsv(.6, R+g*.3, e*i/40.);
//     s=4.;
//     p=q+=d*e*R*.2;
//     g+=p.y/s;
//     p=vec3((R=length(p))-.5+sin(t)*.02, exp2(mod(-p.z,s)/R)-.2, p);
//     for(e=--p.y; s<1e3; s+=s)
//       e+=.03 - abs(dot(sin(p.yzx*s), cos(p.xzz*s))/s*.6);
//   }
//
// Hue locked near 216° (hsv(.6,...) = cyan). 99 outer raymarch iters cut to ~12 for
// grid-res perf; log-spaced inner iteration pattern (s+=s) from 4 to 1e3 cut to ~7 doublings.

import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader uses 99 — we cut for interactive grid-res).
var OUTER_ITERS = 10;
// Inner log-doubling iterations (shader goes s=4..1e3, i.e. ~8 doublings).
var INNER_ITERS = 5;
// Pointer drag adds a gentle warp offset to the camera.
var dragX = 0;
var dragY = 0;

function initEmptiness() {
  dragX = 0;
  dragY = 0;
}

function renderEmptiness() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H; // char aspect ratio correction

  // Pointer drag → small warp offsets on the ray direction.
  if (pointer.down && state.currentMode === 'emptiness') {
    dragX = (pointer.gx / W - 0.5) * 0.3;
    dragY = (pointer.gy / H - 0.5) * 0.3;
  } else {
    dragX *= 0.95;
    dragY *= 0.95;
  }

  // Shader's sin(t)*.02 breath on R — a slow in/out.
  var breath = Math.sin(t) * 0.02;

  var invH = 1 / H;
  var invW = 1 / W;

  for (var y = 0; y < H; y++) {
    // FC.xy/r-.6 in the shader → normalised screen coord with -.6 offset.
    // We use y-flip so the tunnel "opens upward" on screen.
    var ny = (1 - y * invH) - 0.6 + dragY;
    for (var x = 0; x < W; x++) {
      var nx = (x * invW - 0.6) * ar + dragX;

      // d = vec3(FC.xy/r-.6, 1)
      var dx = nx, dy = ny, dz = 1;

      // q starts at (0, -1, -1) because q.zy-- decrements both z and y once.
      var qx = 0, qy = -1, qz = -1;

      var e = 0, g = 0, R = 0;
      var accumV = 0;   // sum of e*i/40 (shader's V in hsv)
      var accumSat = 0; // sum of R + g*0.3 (shader's S in hsv)
      var satCount = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // e += i/8e5 — tiny accumulation per outer step.
        e += i / 8e5;

        // p = q += d * e * R * 0.2 — ray march step weighted by R (so initially no advance,
        // then each iter pushes further as R grows).
        var advance = e * R * 0.2;
        qx += dx * advance;
        qy += dy * advance;
        qz += dz * advance;
        var px0 = qx, py0 = qy, pz0 = qz;

        // g += p.y / s, with s = 4
        g += py0 / 4;

        // R = length(p)
        R = Math.sqrt(px0 * px0 + py0 * py0 + pz0 * pz0);
        if (R < 0.25) R = 0.25; // clamp harder — prevents exp2 blowup when ray near origin

        // p = vec3(R - 0.5 + sin(t)*0.02, exp2(mod(-p.z, s)/R) - 0.2, p)
        // GLSL: vec3(a, b, c) where c is a vec3 → gives vec3(a, b, c.x) in practice
        // because vec3 constructor takes up to 3 scalars. But swizzle p means it
        // collapses to vec3(a, b, p.x). So the "z" component becomes the old p.x.
        var npx = R - 0.5 + breath;
        // exp2(mod(-p.z, s) / R) - 0.2 — clamp ratio so exp doesn't saturate
        var negPz = -pz0;
        // GLSL mod(a, b) = a - b*floor(a/b); s=4
        var modv = negPz - 4 * Math.floor(negPz / 4);
        var ratio = modv / R;
        if (ratio > 4) ratio = 4; // exp2(4)=16; keeps the feature scale reasonable
        var npy = Math.pow(2, ratio) - 0.2;
        var npz = px0;

        // Shader does `for(e=--p.y; s<1e3; s+=s) e += ...`
        // That's: e = p.y - 1; then loop.
        var ep = npy - 1;

        var si = 4;
        for (var k = 0; k < INNER_ITERS; k++) {
          // e += 0.03 - abs(dot(sin(p.yzx*si), cos(p.xzz*si)) / si * 0.6)
          // p.yzx = (npy, npz, npx), p.xzz = (npx, npz, npz)
          var sy = Math.sin(npy * si), sz = Math.sin(npz * si), sx = Math.sin(npx * si);
          var cx = Math.cos(npx * si), cz1 = Math.cos(npz * si), cz2 = Math.cos(npz * si);
          // dot((sy, sz, sx), (cx, cz1, cz2)) = sy*cx + sz*cz1 + sx*cz2
          var dotv = sy * cx + sz * cz1 + sx * cz2;
          ep += 0.03 - Math.abs(dotv / si * 0.6);
          si += si;
        }

        // The inner loop's final `e` is what the shader uses for subsequent iterations.
        e = ep;

        // o.rgb += hsv(0.6, R + g*0.3, e * i / 40)
        // Raw accumulate but cap per-iter to prevent explosive cells from dominating
        // the ramp. The shader gets away with it because 99 iters average out —
        // with 10 iters we need the guard.
        var vRaw = (e * i) / 40;
        if (vRaw > 0.3) vRaw = 0.3 + Math.log1p(vRaw - 0.3) * 0.2;
        if (vRaw > 0) accumV += vRaw;
        accumSat += R + g * 0.3;
        satCount++;
      }

      // Strong bias so the "emptiness" (dark cells) stays empty; the fractal
      // only shows where accumulation actually piles up.
      var v = accumV - 0.12;
      if (v <= 0.005) continue;
      // Expand with gamma curve; multiply so bright cells hit heavier ramp chars.
      v = Math.pow(v, 0.55) * 2.0;
      if (v < 0.06) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue locked near 216° to match hsv(0.6, ...). A tiny drift keeps it alive.
      var hue = 216 + Math.sin(t * 0.2 + v * 1.5) * 8;
      // Saturation rides on R+g*.3 — the fractal's geometry drives how "deep cyan" it looks.
      var satRaw = accumSat / Math.max(1, satCount);
      var sat = 65 + Math.max(0, Math.min(1, satRaw * 0.3)) * 30;
      var light = 18 + v * 62;
      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('emptiness', {
  init: initEmptiness,
  render: renderEmptiness,
});
