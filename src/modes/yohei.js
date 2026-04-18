// yohei — port of Yohei Nishitsuji's tsubuyaki-GLSL 3D folded fractal raymarcher
// Original GLSL (posted 2026-04-17):
//   for(float i,g,e,s;++i<18.;){
//     vec3 p=vec3((FC.xy*2.-r)/r.y*(9.+cos(t*.5)*3.),g+.2)*rotate3D(...);
//     s=1.; for(int i;i++<9;p=vec3(1.5,4,3)-abs(abs(p)*e-vec3(1,1.2,3))) s*=e=max(.95,9./dot(p,p));
//     g+=mod(length(p.yy),p.y)/s*.5;
//     o.rgb+=hsv(.59,.4-g,s/4e3);
//   }
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader uses 18 — we cut to stay interactive at grid res).
var OUTER_ITERS = 10;
// Inner fold iterations (shader uses 9).
var INNER_ITERS = 7;
// Zoom-drag from pointer while held.
var dragZoom = 0;

function initYohei() {
  dragZoom = 0;
}

function renderYohei() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H; // character aspect ratio correction

  // Pointer interaction — drag to add a subtle zoom / warp shift.
  if (pointer.down && state.currentMode === 'yohei') {
    dragZoom = (pointer.gx / W - 0.5) * 6; // ±3 zoom delta
  } else {
    dragZoom *= 0.94; // easing back
  }

  // 3D rotation basis, matching rotate3D(t*.5, vec3(-4, sin(t)+7, 0)) normalised.
  var ang = t * 0.5;
  var axX = -4, axY = Math.sin(t) + 7, axZ = 0;
  var axLen = Math.sqrt(axX * axX + axY * axY + axZ * axZ) || 1;
  axX /= axLen; axY /= axLen; axZ /= axLen;
  var c = Math.cos(ang), s = Math.sin(ang), oc = 1 - c;
  // Rodrigues rotation matrix components (row-major).
  var m00 = c + axX * axX * oc;
  var m01 = axX * axY * oc - axZ * s;
  var m02 = axX * axZ * oc + axY * s;
  var m10 = axY * axX * oc + axZ * s;
  var m11 = c + axY * axY * oc;
  var m12 = axY * axZ * oc - axX * s;
  var m20 = axZ * axX * oc - axY * s;
  var m21 = axZ * axY * oc + axX * s;
  var m22 = c + axZ * axZ * oc;

  // Screen-to-uv scaling — mirrors (FC.xy*2.-r)/r.y*(9+cos(t*.5)*3).
  var zoom = 9 + Math.cos(t * 0.5) * 3 + dragZoom;
  var invH = 1 / H;

  for (var y = 0; y < H; y++) {
    // y-uv (flip vertical so top of screen = +y)
    var uy = (1 - y * 2 * invH) * zoom;
    for (var x = 0; x < W; x++) {
      var ux = ((x - W * 0.5) * 2 * invH) * zoom * ar;

      // Outer raymarch: accumulate s (brightness) and g (depth offset)
      var g = 0;
      var accumV = 0;    // sum of s/4000 terms → lightness
      var accumG = 0;    // sum of (0.4 - g) → saturation-ish
      var sCount = 0;
      for (var it = 0; it < OUTER_ITERS; it++) {
        // Initial point: rotate (ux, uy, g + 0.2) by the rotation matrix.
        var pz0 = g + 0.2;
        var px = m00 * ux + m01 * uy + m02 * pz0;
        var py = m10 * ux + m11 * uy + m12 * pz0;
        var pz = m20 * ux + m21 * uy + m22 * pz0;

        // Inner fold loop — repeated box-fold + inversion (the "fractal" step).
        var sb = 1, e = 1;
        for (var k = 0; k < INNER_ITERS; k++) {
          var d = px * px + py * py + pz * pz;
          if (d < 1e-4) d = 1e-4;
          e = 9 / d;
          if (e < 0.95) e = 0.95;
          sb *= e;
          // p = vec3(1.5, 4, 3) - abs(abs(p) * e - vec3(1, 1.2, 3))
          var ax2 = Math.abs(px) * e, ay2 = Math.abs(py) * e, az2 = Math.abs(pz) * e;
          px = 1.5 - Math.abs(ax2 - 1);
          py = 4   - Math.abs(ay2 - 1.2);
          pz = 3   - Math.abs(az2 - 3);
        }

        // g += mod(length(p.yy), p.y) / s * 0.5
        // length(p.yy) = |p.y|*sqrt(2); mod(a, b) where b=p.y (signed).
        var lenYY = Math.abs(py) * 1.41421356;
        var pyb = py === 0 ? 1e-4 : py;
        // GLSL mod: x - y*floor(x/y)
        var modv = lenYY - pyb * Math.floor(lenYY / pyb);
        if (sb !== 0) g += modv / sb * 0.5;

        // o.rgb += hsv(0.59, 0.4 - g, s/4e3)  →  we accumulate s/4000 as brightness
        var bright = sb / 4000;
        // Shader originally sums many iterations of s/4e3 — so we allow accumulation
        // to exceed 1 naturally; we'll clamp at the end.
        accumV += bright;
        accumG += (0.4 - g);
        sCount++;
      }

      // Map accumulated brightness → ASCII ramp index
      var v = accumV;
      if (v <= 0.001) continue;
      // Non-linear compression — the shader is HDR-ish. Stronger gain so the
      // folded fractal fills the grid instead of being a sparse star-field.
      v = 1 - Math.exp(-v * 8);
      if (v < 0.02) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue 0.59 in HSV ≈ 212°  (a cool cyan-blue).
      // Saturation rides on accumG — slightly higher sat at bright edges.
      var gAvg = accumG / Math.max(1, sCount);
      var sat = 45 + Math.max(0, Math.min(1, 0.5 + gAvg * 0.4)) * 40;
      var light = 10 + v * 55;
      var hue = 212 + Math.sin(t * 0.3 + v * 2) * 10; // gentle drift around cyan
      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yohei', {
  init: initYohei,
  render: renderYohei,
});
