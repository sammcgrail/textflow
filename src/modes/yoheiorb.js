// yoheiorb — port of Yohei Nishitsuji's tsubuyaki-GLSL spherical-fold raymarcher.
// Original GLSL (tweet 2047661844563931323):
//   for(float i,e,g; i++ < 9e1;){
//     vec3 p = vec3((FC.xy - r*.5)/r.y*g, g - 5.);
//     for(int j; j++ < 8;){
//       p *= rotate3D(4., vec3(sin(t*.5)*.3, 2.*smoothstep(-1.,1.,cos(t*.5))-1., 1));
//       p = abs(p+p) - 1.;
//     }
//     g += e = (length(p.xz) - 1.6) / 7e2;
//     o += (sin(g)+1.9) * exp(-e*2e4) / 1e2;
//   }
//
// Classic Kleinian fold (abs(p+p)-1) with a cylindrical distance estimator
// (length(p.xz) - 1.6). Per outer step the ray advances by the DE, and the
// emission is a sinusoid times a steeply-peaked exponential around the surface.
//
// ASCII port notes:
//   - Shader runs 90 outer × 8 inner = 720 iters/cell. JS at 160×80 cells
//     cuts to 24 outer × 5 inner ≈ 120 iters/cell (~1.5M ops/frame).
//   - rotate3D(angle=4, axis) — axis drifts with time; y-component uses
//     `2*smoothstep(-1,1,cos(t*.5)) - 1` which in JS reduces to a simple
//     smoothstep on cos(t*.5).
//   - Emission term (sin(g)+1.9) * exp(-e*2e4) / 100 is HDR with a very
//     narrow exp peak. Accumulate raw, then compress with 1-exp(-sum*gain).
//   - Hue modulated by final g value → spheres have subtle color bands.

import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var OUTER_ITERS = 24;    // shader=90, cut for per-cell budget
var INNER_ITERS = 8;     // MUST be 8: Kleinian fold breaks with fewer
var STEP_SCALE = 3.5;    // march faster to cover shader's reach in 1/4 the outer steps
var ARG_CAP = 4;         // clamp exp() peak — exp(4)≈55 is bright enough
var GAIN = 0.25;         // HDR → ASCII compression (peaks reach ~20)

var tiltX = 0;
var tiltY = 0;

function initYoheiorb() {
  tiltX = 0;
  tiltY = 0;
}

// smoothstep(edge0, edge1, x)
function smoothstep(e0, e1, x) {
  var t = (x - e0) / (e1 - e0);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

// Axis-angle rotation (Rodrigues) applied in-place to v=[x,y,z].
function rotate3D(v, ax, ay, az, ang) {
  var len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-6) return;
  ax /= len; ay /= len; az /= len;
  var c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  var x = v[0], y = v[1], z = v[2];
  var r0 = (c + ax * ax * k)      * x + (ax * ay * k - az * s) * y + (ax * az * k + ay * s) * z;
  var r1 = (ay * ax * k + az * s) * x + (c + ay * ay * k)      * y + (ay * az * k - ax * s) * z;
  var r2 = (az * ax * k - ay * s) * x + (az * ay * k + ax * s) * y + (c + az * az * k)      * z;
  v[0] = r0; v[1] = r1; v[2] = r2;
}

function renderYoheiorb() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'yoheiorb') {
    tiltX = (pointer.gx / W - 0.5) * 1.2;
    tiltY = (0.5 - pointer.gy / H) * 1.2;
  } else {
    tiltX *= 0.94;
    tiltY *= 0.94;
  }

  // Rotation axis drifts with time — shader form:
  //   axis = vec3(sin(t*.5)*.3, 2*smoothstep(-1,1,cos(t*.5))-1, 1)
  var axX = Math.sin(t * 0.5) * 0.3 + tiltX;
  var axY = 2 * smoothstep(-1, 1, Math.cos(t * 0.5)) - 1 + tiltY;
  var axZ = 1;
  var ROT_ANG = 4;

  var p = [0, 0, 0];
  var invH = 1 / H;

  for (var y = 0; y < H; y++) {
    // (FC.y - r.y/2) / r.y  — shader flips y; higher y = up
    var ny = (0.5 - y * invH);
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * ar;

      var g = 0;
      var accum = 0;
      var lastG = 0;

      for (var i = 0; i < OUTER_ITERS; i++) {
        // p = vec3((FC - r/2)/r.y * g, g - 5)
        p[0] = nx * g;
        p[1] = ny * g;
        p[2] = g - 5;

        // Inner fold: 8 rotates + abs(p+p)-1
        for (var j = 0; j < INNER_ITERS; j++) {
          rotate3D(p, axX, axY, axZ, ROT_ANG);
          p[0] = Math.abs(p[0] + p[0]) - 1;
          p[1] = Math.abs(p[1] + p[1]) - 1;
          p[2] = Math.abs(p[2] + p[2]) - 1;
        }

        // Distance estimator: (length(p.xz) - 1.6) / 700
        var pxz = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
        var e = (pxz - 1.6) / 700;
        // March faster than shader — 24 steps to cover what 90 does.
        g += e * STEP_SCALE;
        lastG = g;

        // Emission: (sin(g)+1.9) * exp(-e*2e4) / 100
        // Narrow exp peak — cap positive side so surface crossings don't explode.
        var arg = -e * 2e4;
        if (arg > ARG_CAP) arg = ARG_CAP;
        else if (arg < -50) arg = -50;
        accum += (Math.sin(g) + 1.9) * Math.exp(arg) / 100;
      }

      var v = 1 - Math.exp(-accum * GAIN);
      if (!isFinite(v) || v < 0.02) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue rides on final g — slow color bands across spheres.
      // Base is blue-violet with warm highlights at the brightest hits.
      var hue = (220 + lastG * 40 + Math.sin(t * 0.2) * 20) % 360;
      if (hue < 0) hue += 360;
      var sat = 55 + v * 20;
      var light = 14 + v * 68;
      if (light > 90) light = 90;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheiorb', {
  init: initYoheiorb,
  render: renderYoheiorb,
});
