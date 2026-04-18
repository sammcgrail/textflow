// yoheiterra — port of Yohei Nishitsuji's tsubuyaki-GLSL terrain flyover
// Original GLSL (tweet 2045273021267792190, posted 2026-04):
//   for(float e,i,a,g,h; i++<99.;){
//     vec3 p=vec3((FC.xy-.5*r)/r*g+2., g);
//     p.zy*=rotate2D(.4);
//     e=p.y; h=e;
//     p.z+=t;
//     for(a=.7; a>.001; a*=.7)
//       p.xz*=rotate2D(4.),
//       e-=exp(sin(p.z/a+t)-3.)*a,
//       h+=abs(dot(sin(p.xz/a*.3)*a, r/r));
//     g+=e=min(e, h*.5-1.);
//     o.rgb+=.01-.02/exp(max(s,e)*4e3)/h*hsv(h*.3,.2,1.);
//   }
// Note: `s` undeclared → treat as 0. `rotate2D(a)` = mat2(c,-s,s,c).
//
// Mountain range over water — horizontal horizon band, warm ridges above,
// cool valleys / water below. `e` accumulates terrain height via nested
// FBM + exp noise; `h` tracks surface detail for the HSV hue term.
//
// ASCII port notes:
//   - Shader runs 99 outer × ~16 inner (.7^16 ≈ .003) = ~1600 iters.
//     JS at 160×80 cells: cut outer to 26 × inner to 9 = ~2.4M ops/frame.
//   - `r/r` is vec2(1,1) in GLSL. Replicated as constant.
//   - `p.zy *= rotate2D(.4)` — rotates y,z plane by 0.4 rad. Applied once.
//   - `p.xz *= rotate2D(4.)` — rotates x,z plane by 4 rad each inner iter.
//   - `s` undeclared → 0. max(0, e) = max(0, e).
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer march iters — shader uses 99. For ASCII we want enough depth for the
// ray to actually penetrate below the terrain surface on lower rows, but 45
// tanks FPS. 32 is the sweet spot between depth and frame rate.
var OUTER_ITERS = 32;
// Inner FBM iters — 5 keeps a=0.7^5 ≈ 0.17, enough for ridge detail
var INNER_ITERS = 5;

var tiltY = 0;
var tiltX = 0;

function initYoheiterra() {
  tiltY = 0;
  tiltX = 0;
}

function renderYoheiterra() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'yoheiterra') {
    tiltY = (0.5 - pointer.gy / H) * 0.3;
    tiltX = (pointer.gx / W - 0.5) * 0.3;
  } else {
    tiltY *= 0.93;
    tiltX *= 0.93;
  }

  // rotate2D(0.4) for the initial p.zy rotation
  var c04 = Math.cos(0.4), s04 = Math.sin(0.4);
  // rotate2D(4.0) for p.xz per inner iter — precompute
  var c40 = Math.cos(4), s40 = Math.sin(4);

  for (var y = 0; y < H; y++) {
    // Use full [-0.5, 0.5] range to match shader (FC-.5r)/r.
    // +tiltY lets the drag gesture swing horizon.
    var ny = (0.5 - (y + 0.5) / H) + tiltY;
    for (var x = 0; x < W; x++) {
      var nx = ((x + 0.5) / W - 0.5) * ar * 2 + tiltX;  // *2 compensates for char aspect

      // Shader march accumulator g — ray depth advance
      var g = 0;
      var terrainAccum = 0;    // integrates max(0, -e): how far below surface
      var hMax = 0;            // peak ridge detail seen along ray
      var hSum = 0;
      var firstHit = -1;       // outer iter at which ray first hit ground

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // p = vec3(uv * g + 2, g)
        var px = nx * g + 2;
        var py = ny * g + 2;
        var pz = g;

        // p.zy *= rotate2D(0.4)  → pitches camera downward toward ground
        var npz = c04 * pz - s04 * py;
        var npy = s04 * pz + c04 * py;
        pz = npz;
        py = npy;

        var e = py;
        var h = e;
        pz += t;

        var a = 0.7;
        for (var k = 0; k < INNER_ITERS; k++) {
          // p.xz *= rotate2D(4)
          var rpx = c40 * px - s40 * pz;
          var rpz = s40 * px + c40 * pz;
          px = rpx;
          pz = rpz;

          // e -= exp(sin(pz/a + t) - 3) * a  — terrain height perturbation
          e -= Math.exp(Math.sin(pz / a + t) - 3) * a;

          // h += abs(sin(px/a*.3)*a + sin(pz/a*.3)*a)  — ridge detail
          var sxa = Math.sin(px / a * 0.3) * a;
          var sza = Math.sin(pz / a * 0.3) * a;
          h += Math.abs(sxa + sza);

          a *= 0.7;
        }

        // e = min(e, h*.5 - 1)  — the ceiling clamp that accelerates ground hit
        if (h * 0.5 - 1 < e) e = h * 0.5 - 1;
        g += e;

        // Track terrain: once e goes negative, ray is INSIDE ground.
        // Magnitude of negative e = penetration depth.
        if (e < 0) {
          terrainAccum += -e;
          if (firstHit < 0) firstHit = i;
        }
        if (h > hMax) hMax = h;
        hSum += h;
      }

      // Reference image: mountain range fills top+right, water fills bottom-left,
      // diagonal horizon separates them. Both sides are DENSE — no blank areas.
      // Density signal: hMax (ridge detail peak). Mountains have hMax ~7-10,
      // water has hMax ~2-4. Color: warm amber for mountains, cool teal for water.
      var hNorm = Math.min(1, hMax / 9);
      var yNorm = y / H;

      // Classify this pixel: water if ray never hit ground early AND hMax low,
      // else mountain/ridge.
      var isWater = (firstHit < 0 || firstHit > OUTER_ITERS * 0.75) && hMax < 5;

      var v;
      if (isWater) {
        // Water: soft dense mid-range — dots + tildes.
        v = 0.40 + Math.min(0.35, (5 - hMax) * 0.1);
      } else if (firstHit < 0) {
        // Sky haze near top — faint texture.
        v = 0.25 + hNorm * 0.3;
      } else {
        // Mountains: bright dense chars scaled by ridge detail.
        var hitDepth = 1 - (firstHit - 1) / OUTER_ITERS;
        v = 0.35 + hitDepth * 0.35 + hNorm * 0.30;
      }
      if (v > 1) v = 1;
      if (v < 0.1) v = 0.1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Color: water cool teal-green ~165, mountain warm amber-brown ~22
      var hue, sat, light;
      if (isWater) {
        hue = 165 + Math.sin(hMax * 0.3 + t * 0.2) * 8;
        sat = 28 + v * 20;
        light = 22 + v * 35;
      } else {
        hue = 22 + hNorm * 14 + Math.sin(hMax * 0.2 + t * 0.15) * 6;
        sat = 22 + v * 18;
        light = 20 + v * 42;
      }
      if (hue < 0) hue += 360;
      if (hue > 360) hue -= 360;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheiterra', {
  init: initYoheiterra,
  render: renderYoheiterra,
});
