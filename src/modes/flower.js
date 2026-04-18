// flower — port of zozuar/@yonatan's polar-bloom tweet shader
// Reference: geeks3d.com/hacklab/20230111/flower-tweet-shader/
// Original GLSL (polar bloom loop, GeeXLab uniform wrapper stripped):
//   float i=0., g=0., e=0., R=0., S=0.;
//   for (; i++ < 1e2; o.rgb += hsv(.4 - .02/R, max(e*R*1e4, .7), .03/exp(e))) {
//     S = 1.;
//     vec3 p = vec3((FC.xy/r - .5) * g, g - .3) - i/2e5;
//     p.yz *= rotate2D(.3);
//     for (p = vec3(log(R=length(p)) - t, e = asin(-p.z/R) - .1/R, atan(p.x, p.y) * 3.); S < 1e2; S += S)
//       e += pow(abs(dot(sin(p.yxz*S), cos(p*S))), .2) / S;
//     g += e * R * .1;
//   }
//
// Key properties:
// - Hue locked near 144° (hsv(.4, ...)) = green with yellow shift from the -.02/R term
// - atan(p.x, p.y) * 3. = 3-fold rotational symmetry (flower petals)
// - log(R) radial transform = blooming radial pattern
// - S += S doubling from 1 to 100 = ~7 inner iters
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer iterations (shader uses 100 — we cut hard for grid perf).
var OUTER_ITERS = 28;
// Inner doubling loop runs while S < 100 with S *= 2, so ~7 iters.
var INNER_ITERS = 7;
// UV spread multiplier — shader uses FC.xy/r direct but loses per-pixel variation
// early because g starts at 0. Scale up so flower geometry emerges quickly.
var UV_SCALE = 3.2;
// Head-tilt rotation (shader uses .3). Smaller values = flatter flower face-on.
var TILT = 0.12;
// Slow drag for petal rotation.
var dragRot = 0;

function initFlower() {
  dragRot = 0;
}

// Minimal HSV -> HSL converter (we draw via drawCharHSL; shader uses HSV so translate)
// For our accumulation we just drive hue/sat/light directly.

function renderFlower() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time * 0.5; // slow the bloom so petals breathe
  // Aspect correction: monospace cells are taller than wide (CHAR_W < CHAR_H).
  // To get CIRCULAR polar geometry on screen, we must stretch x in world space
  // so that one grid-col equals one grid-row visually. Thus xAspect = H/W (grid)
  // is wrong; the right factor is CHAR_H / CHAR_W (pixel aspect of a cell).
  var cellAspect = state.CHAR_H / state.CHAR_W;

  // Pointer interaction — drag horizontally to rotate the flower.
  if (pointer.down && state.currentMode === 'flower') {
    dragRot = (pointer.gx / W - 0.5) * 3.14;
  } else {
    dragRot *= 0.94;
  }

  // rotate2D(.3) yz rotation — precompute sin/cos (use TILT tuning)
  var rotAng = TILT + dragRot;
  var cR = Math.cos(rotAng), sR = Math.sin(rotAng);

  // Normalize by pixel dimensions so the flower looks circular on screen
  // (not squashed by non-square grid cells).
  var pxW = W * state.CHAR_W;
  var pxH = H * state.CHAR_H;
  var invPxH = 1 / pxH;
  var cxPx = pxW * 0.5;
  var cyPx = pxH * 0.5;

  for (var y = 0; y < H; y++) {
    // Pixel-center-y in [- H/2*CHAR_H, +H/2*CHAR_H], divided by pxH → world y
    var yPx = y * state.CHAR_H + state.CHAR_H * 0.5;
    var fy = (yPx - cyPx) * invPxH * UV_SCALE;
    for (var x = 0; x < W; x++) {
      var xPx = x * state.CHAR_W + state.CHAR_W * 0.5;
      var fx = (xPx - cxPx) * invPxH * UV_SCALE;

      // Accumulators for the outer loop's color writes.
      var accumV = 0;  // sum of .03/exp(e) brightness terms
      var accumHueShift = 0; // sum of -.02/R terms (yellow push)
      var accumSat = 0;      // sum of max(e*R*1e4, .7)
      var nonEmpty = 0;
      var R = 1; // avoid div-by-zero on first iter
      var g = 0; // depth accumulator

      for (var it = 1; it <= OUTER_ITERS; it++) {
        // p = vec3((FC.xy/r - .5) * g, g - .3) - i/2e5
        var px = fx * g - it / 2e5;
        var py = fy * g - it / 2e5;
        var pz = (g - 0.3) - it / 2e5;

        // p.yz *= rotate2D(.3)   [y,z] rotated by rotAng
        var py2 = py * cR - pz * sR;
        var pz2 = py * sR + pz * cR;
        py = py2; pz = pz2;

        // R = length(p)
        R = Math.sqrt(px * px + py * py + pz * pz);
        if (R < 1e-6) R = 1e-6;

        // Rewrite p: (log(R) - t,  asin(-p.z/R) - .1/R,  atan(p.x, p.y) * 3.)
        var nx = Math.log(R) - t;
        var azarg = -pz / R;
        if (azarg > 1) azarg = 1; else if (azarg < -1) azarg = -1;
        var ny = Math.asin(azarg) - 0.1 / R;
        var nz = Math.atan2(px, py) * 3.0;

        // Inner doubling: e starts from ny (as per `e = asin(-p.z/R) - .1/R`)
        var e = ny;
        for (var S = 1; S < 100; S += S) {
          // dot(sin(p.yxz*S), cos(p*S))
          // sin vector: sin(ny*S), sin(nx*S), sin(nz*S)    (p.yxz)
          // cos vector: cos(nx*S), cos(ny*S), cos(nz*S)    (p.xyz)
          var sy = Math.sin(ny * S);
          var sx = Math.sin(nx * S);
          var sz = Math.sin(nz * S);
          var cx = Math.cos(nx * S);
          var cy = Math.cos(ny * S);
          var cz = Math.cos(nz * S);
          var dp = sy * cx + sx * cy + sz * cz;
          var ad = dp < 0 ? -dp : dp;
          if (ad < 1e-12) ad = 1e-12;
          e += Math.pow(ad, 0.2) / S;
        }

        // g += e * R * .1
        g += e * R * 0.1;

        // Color accumulation (shader's o.rgb += hsv(...) at end of each loop)
        // brightness = .03 / exp(e)
        var bright = 0.03 / Math.exp(e);
        // saturation = max(e*R*1e4, .7)
        var satTerm = e * R * 1e4;
        if (satTerm < 0.7) satTerm = 0.7;
        // hue shift -.02/R
        var hueShift = -0.02 / R;

        accumV += bright;
        accumHueShift += hueShift;
        accumSat += satTerm;
        nonEmpty++;
      }

      // Map accumulated brightness → ASCII ramp index
      var v = accumV;
      if (v <= 0.001) continue;
      // HDR compression — the polar bloom is high dynamic range.
      v = 1 - Math.exp(-v * 3.5);
      if (v < 0.02) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue: shader uses hsv(0.4 - .02/R).
      // HSV hue 0.4 → 144° (green). -0.02/R pushes toward yellow at bright center (small R).
      // Map to degrees: baseHue = 144. The shift can be quite large when R → 0, so clamp.
      var avgHueShift = accumHueShift / Math.max(1, nonEmpty);
      // Convert HSV-hue-units to degrees: hueShift is already in [0,1] hue units, so * 360
      var hueDeg = 144 + avgHueShift * 360;
      // Clamp into green-yellow band (60°–160°) so it never rolls into cyan.
      if (hueDeg < 60) hueDeg = 60;
      if (hueDeg > 160) hueDeg = 160;

      // Saturation: HSV→HSL approximation. For vibrant petals keep sat high.
      var avgSat = accumSat / Math.max(1, nonEmpty);
      // avgSat is capped at .7 minimum by the shader; typical values are small.
      var satPct = 70 + Math.min(1, avgSat * 0.0002) * 25; // 70–95

      // Lightness driven by brightness
      var light = 12 + v * 60;

      // Gentle time-breath on hue so the bloom throbs.
      hueDeg += Math.sin(t * 0.7 + v * 2) * 6;

      drawCharHSL(ch, x, y, hueDeg | 0, satPct | 0, light | 0);
    }
  }
}

registerMode('flower', {
  init: initFlower,
  render: renderFlower,
});
