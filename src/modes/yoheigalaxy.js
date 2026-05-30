// yoheigalaxy — port of Yohei Nishitsuji's tsubuyaki-GLSL "galaxy zone" raymarcher.
// Original GLSL (tweet 2060352962585890997, posted 2026-05):
//   float i,e,R,s;vec3 q,p,d=vec3((FC.xy-.5*r)/r,.6);
//   for(q.z--;i++<67.;i>36.){
//     o.rgb+=hsv(.58,e/i*2.5,e/5e1)+.008;
//     p=q+=d*max(e,.03-e*5.)*R*.2;
//     p=vec3(log(R=length(p))-t, e=asin(-p.z/R)-1.3, atan(p.y,p.x)-t*.2);
//     for(s=1.;s<8e2;s+=s)e+=abs(dot(sin(p.yzx*s),cos(p*s)))/s;
//   }
//
// A log-polar coordinate warp (log(R), asin(-z/R), atan(y,x)) wrapped around a
// doubling-frequency turbulence sum — the same family as yoheiloop, but the
// emission hue is locked at 0.58 (icy cyan-blue) and the value rides e/50, so it
// resolves to the high-key milky-blue nebula of the original (not a dark field).
// The trailing `i>36.` in the for-header is a Twigl char-saver no-op (no flip).
//
// ASCII port notes:
//   - Shader runs 67 outer × 10 inner (s=1..512) ≈ 670 iters/cell. JS cut to
//     22 outer × 9 inner (s=1..256) ≈ 200 iters/cell — holds ~30fps laptop,
//     ~15fps mobile, matching the yoheiloop budget.
//   - Color: hsv(.58, e/i*2.5, e/50) + .008. Hue is fixed blue; brightness is
//     the value channel e/50 plus the per-iter .008 floor. Accumulate raw, then
//     compress with 1-exp(-sum*GAIN). Saturation falls as brightness rises so
//     the bright cores read as icy white, the midtones as light blue.
//   - asin domain guarded to [-1,1]; atan uses the pre-warp p.xy (== q.xy, since
//     `p=q+=…` sets p=q immediately before the warp constructor reads p.x/p.y).
//   - Pointer drags pan the view centre across the nebula (parallax), decaying
//     back to centre on release — same easing feel as the sibling yohei modes.

import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader=67, cut for interactive JS).
var OUTER_ITERS = 22;
// Inner doubling loop: s=1, s*=2 until s>=INNER_MAX_S → s=1,2,…,256 (9 iters).
var INNER_MAX_S = 300;
// Contrast-stretch window for the raw HDR accumulation. accumV lands in a tight
// band (~0.30..0.60 typical, bright cores ~0.87 over 22 iters); a plain
// 1-exp(-x) curve crushes that to flat mid-grey, so we window it to [LO,HI] and
// apply GAMMA<1 to lift the midtone nebula haze. Tuned offline against the
// original frame — glowing core, layered icy clouds.
var LO = 0.33, HI = 0.80, GAMMA = 0.7;

// Parallax pan, eased.
var panX = 0;
var panY = 0;

function initYoheigalaxy() {
  panX = 0;
  panY = 0;
}

function renderYoheigalaxy() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H; // terminal character aspect

  if (pointer.down && state.currentMode === 'yoheigalaxy') {
    panX = (pointer.gx / W - 0.5) * 0.6;
    panY = (pointer.gy / H - 0.5) * 0.6;
  } else {
    panX *= 0.95;
    panY *= 0.95;
  }

  for (var y = 0; y < H; y++) {
    // (FC.y - r.y/2)/r.y, GL y-up flip. d.z = 0.6 (forward).
    var ny = (0.5 - y / H) + panY;
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * ar + panX;

      // d = vec3((FC - 0.5r)/r, 0.6)
      var dx = nx, dy = ny, dz = 0.6;
      // q = vec3(0,0,-1)  (after q.z--)
      var qx = 0, qy = 0, qz = -1;
      var e = 0, R = 0;

      var accumV = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // color value channel: hsv(.58, e/i*2.5, e/50) + .008
        var val = e / 50;
        if (val < 0) val = 0;
        accumV += val + 0.008;

        // march: q += d * max(e, .03 - e*5) * R * .2
        var step = Math.max(e, 0.03 - e * 5) * R * 0.2;
        qx += dx * step;
        qy += dy * step;
        qz += dz * step;

        // R = length(p),  p == q here
        R = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (R < 1e-4) R = 1e-4;

        // e = asin(-p.z/R) - 1.3   (guard asin domain)
        var asinArg = -qz / R;
        if (asinArg > 1) asinArg = 1; else if (asinArg < -1) asinArg = -1;
        e = Math.asin(asinArg) - 1.3;

        // warped p = vec3(log(R)-t, e, atan(p.y,p.x)-t*.2)  — atan uses pre-warp q.xy
        var npx = Math.log(R) - t;
        var npy = e;
        var npz = Math.atan2(qy, qx) - t * 0.2;

        // inner turbulence: e += abs(dot(sin(p.yzx*s), cos(p*s))) / s
        //   sin(p.yzx*s) = (sin(npy*s), sin(npz*s), sin(npx*s))
        //   cos(p*s)     = (cos(npx*s), cos(npy*s), cos(npz*s))
        var s = 1;
        while (s < INNER_MAX_S) {
          var dotv = Math.sin(npy * s) * Math.cos(npx * s)
                   + Math.sin(npz * s) * Math.cos(npy * s)
                   + Math.sin(npx * s) * Math.cos(npz * s);
          e += Math.abs(dotv) / s;
          s += s;
        }
      }

      // HDR → [0,1] via contrast-stretch (see LO/HI/GAMMA note above).
      var v = (accumV - LO) / (HI - LO);
      if (v < 0) v = 0; else if (v > 1) v = 1;
      v = Math.pow(v, GAMMA);
      if (!isFinite(v) || v < 0.04) continue;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Icy cyan-blue (hsv hue 0.58 ≈ 209°), drifting a touch with depth.
      var hue = (205 + v * 18 + Math.sin(t * 0.15) * 6) % 360;
      if (hue < 0) hue += 360;
      // Bright cores wash to white (low sat); midtones stay light blue.
      var sat = 48 - v * 30;
      if (sat < 8) sat = 8;
      // High-key lightness.
      var light = 22 + v * 66;
      if (light > 92) light = 92;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheigalaxy', {
  init: initYoheigalaxy,
  render: renderYoheigalaxy,
});
