// yoheifract — port of Yohei Nishitsuji's IFS-fold tsubuyaki-GLSL
// Original GLSL (tweet 2045269549667500122):
//   for(float i,e,g; i++<1.1e2;){
//     vec3 p=vec3((FC.xy-r*.5)/r.y*g, g-3.5);
//     for(int j; j++<7;)
//       p *= rotate3D(1.57, vec3(sin(t), cos(t*.5), 1)),
//       p = abs(p+p) - 1.;
//     g += e = (max(abs(p.y), abs(p.z)) - .6) / 5e2;
//     o += exp(-e*1e4)/7e1 * vec4(.85, vec3(.8,.73,0));
//   }
//
// Warm cream/white crystalline 3D fractal — seven axis-angle rotations
// followed by classic Kleinian fold (abs(p+p)-1) per iteration, with the
// distance field being a cross-section of a box (max(|y|,|z|)-0.6).
// The exp(-e*1e4)/70 term is a sharply-peaked glow centered on the surface.
//
// ASCII port notes:
//   - Shader: 110 outer × 7 inner = 770 iters/cell. JS at 160×80 cells
//     → cut to 24 outer × 4 inner ≈ 96 iters/cell ≈ 1.2M ops/frame.
//   - rotate3D(angle, axis) is the standard axis-angle rotation matrix
//     (Rodrigues' formula). Axis = vec3(sin(t), cos(t*.5), 1), must be
//     normalized. Angle = 1.57 ≈ π/2.
//   - Density from exp(-e*1e4) is so steep we only light cells where |e|
//     is tiny (surface hit). Accumulate raw exp sum over outer iters.
//   - Color fixed warm cream: r=.85 g=.8 b=.73 → hue ≈ 40°, sat ≈ 14%,
//     light scales with hit-intensity.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var OUTER_ITERS = 60;      // <50 blank, shader uses 110
var INNER_ITERS = 7;       // MUST be 7: <7 breaks Kleinian attractor
var GAIN = 0.9;

// Drag tilts the rotation axis so the fractal reshapes under the cursor.
var tiltX = 0;
var tiltY = 0;

function initYoheifract() {
  tiltX = 0;
  tiltY = 0;
}

// Axis-angle rotation (Rodrigues). Rotates vec3 v around normalized axis
// by angle; equivalent to GLSL rotate3D. Writes back into v[] in place.
function rotate3D(v, ax, ay, az, ang) {
  // normalize axis
  var len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-6) return;
  ax /= len; ay /= len; az /= len;
  var c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  var x = v[0], y = v[1], z = v[2];
  // Rodrigues rotation matrix applied to (x,y,z)
  var r0 = (c + ax * ax * k)      * x + (ax * ay * k - az * s) * y + (ax * az * k + ay * s) * z;
  var r1 = (ay * ax * k + az * s) * x + (c + ay * ay * k)      * y + (ay * az * k - ax * s) * z;
  var r2 = (az * ax * k - ay * s) * x + (az * ay * k + ax * s) * y + (c + az * az * k)      * z;
  v[0] = r0; v[1] = r1; v[2] = r2;
}

function renderYoheifract() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'yoheifract') {
    tiltX = (pointer.gx / W - 0.5) * 1.2;
    tiltY = (0.5 - pointer.gy / H) * 1.2;
  } else {
    tiltX *= 0.94;
    tiltY *= 0.94;
  }

  // Rotation axis: vec3(sin(t), cos(t*.5), 1) + drag tilt
  var axX = Math.sin(t) + tiltX;
  var axY = Math.cos(t * 0.5) + tiltY;
  var axZ = 1;
  var ANGLE = 1.57;

  var p = [0, 0, 0];

  for (var y = 0; y < H; y++) {
    // FC.y/r.y in [0..1], shader flips: higher FC.y = up
    var ny = (0.5 - y / H);
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * ar;

      var g = 0;
      var hit = 0;
      var minE = 1e9;           // track closest approach for fallback halo

      for (var i = 0; i < OUTER_ITERS; i++) {
        // p = vec3((FC - r/2)/r.y * g, g - 3.5)
        p[0] = nx * g;
        p[1] = ny * g;
        p[2] = g - 3.5;

        // Inner fold: rotate then abs(p+p)-1 — 7 iters MUST match shader
        for (var j = 0; j < INNER_ITERS; j++) {
          rotate3D(p, axX, axY, axZ, ANGLE);
          p[0] = Math.abs(p[0] + p[0]) - 1;
          p[1] = Math.abs(p[1] + p[1]) - 1;
          p[2] = Math.abs(p[2] + p[2]) - 1;
        }

        // Distance field: (max(|y|,|z|) - .6) / 500
        var ay = Math.abs(p[1]);
        var az = Math.abs(p[2]);
        var rawE = (ay > az ? ay : az) - 0.6;
        var e = rawE / 500;
        g += e;

        if (rawE >= 0 && rawE < minE) minE = rawE;

        // exp(-e*1e4)/70 — sharply peaked surface glow
        var arg = -e * 1e4;
        if (arg > 20) arg = 20;       // cap: exp(20) is plenty
        if (arg < -40) arg = -40;
        hit += Math.exp(arg) / 70;
      }

      // Soft halo — even if ray never reached surface, closest approach
      // contributes faint glow (keeps fractal body visible with fewer iters).
      var halo = minE < 1e9 ? Math.exp(-minE * 2.5) * 0.12 : 0;
      hit += halo;

      var v = 1 - Math.exp(-hit * GAIN);
      if (!isFinite(v) || v < 0.015) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Warm cream — shader const vec4(.85, .8, .73, 0).
      // HSL of (.85, .8, .73): hue ≈ 38°, sat ≈ 35%, light ≈ 79%.
      // Slightly desaturate bright hits, warm up dim hits.
      var hue = 40 - v * 6;           // 34–40° amber→cream
      var sat = 18 - v * 8;           // 10–18% (muted warm white)
      var light = 30 + v * 55;        // 30–85% — body of the fractal glows
      if (light > 92) light = 92;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheifract', {
  init: initYoheifract,
  render: renderYoheifract,
});
