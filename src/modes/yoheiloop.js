// yoheiloop — port of Yohei Nishitsuji's tsubuyaki-GLSL direction-flip raymarcher
// Original GLSL (tweet 2045270789629554755, posted 2026-04):
//   float i,s,R,e;
//   vec3 q,p,d=vec3((FC.xy-.5*r)/r+vec2(0,1),1);
//   for(q.yz--;i++<50.;){
//     e+=i/5e3;
//     i>35.?d/=-d:d;                       ← componentwise d/=-d → d = vec3(-1,-1,-1)
//     o.rgb+=hsv(.1,-.3*p.y,e/17.);
//     s=1.;
//     p=q+=d*e*R*.18;
//     p=vec3(log(R=length(p))-t*.5, -p.z/R, p.y+p.xx-t*.5);
//     for(e=--p.y; s<5e2; s+=s)
//       e+=cos(dot(cos(p*s),sin(p.zxy*s)))/s*.8;
//   }
//
// The signature move: at iter 35, d = d / -d = vec3(-1,-1,-1). Every ray
// reverses heading and marches backward through log-radial/cosine-FBM
// terrain, producing the tunnel-loop motion that names the shader.
//
// ASCII port notes:
//   - Shader runs 50 outer × ~9 inner = ~450 iters/pixel. JS at 160×80
//     cells = 12,800 cells/frame. Cut outer to 30 (flip at 22) to hold
//     30 fps on a mid-range laptop while keeping the post-flip signature.
//   - `vec3(a, b, p.y + p.xx - t*.5)` — constructor overflows with vec2
//     at the end; Twigl truncates to .x → `p.y + p.x - t*.5`. Replicated.
//   - `--p.y` is prefix decrement (decrement THEN read). Replicated.
//   - First outer iter uses p from the initial (zero) value — the shader
//     accumulates `hsv(.1, -.3*p.y, e/17.)` BEFORE overwriting p each iter.
//     So iter 1 contributes with p=vec3(0). Matched here.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer raymarch iterations (shader=50, cut for interactive JS).
// 22 outer × ~9 inner = ~200 iters/cell. 160×80 cells = 2.5M ops/frame
// → holds 30fps on laptop, ~15fps on mobile.
var OUTER_ITERS = 22;
// Where the direction flip fires. Shader: 35 / 50 = 0.70. Here:
// 16 / 22 = 0.73 — keeps 6 post-flip iters, the distinctive part.
var FLIP_ITER_BASE = 16;
// Inner doubling loop: s=1, s*=2 until s>=500. ~9 iters.
var INNER_MAX_S = 500;
// HDR → ASCII compression gain. Shader's o.rgb is a sum of hsv() over
// 50 iters, each ~0..0.15 magnitude. Our weighted accumulation over 30
// iters lands ~0.5..3 range; gain rolls that into the [0,1] ramp.
var GAIN = 180;

// Drag interaction — pointer x tilts ray xy, pointer y pushes flip earlier
// (closer to start → hectic) or later (smoother orbit).
var flipDrift = 0;

function initYoheiloop() {
  flipDrift = 0;
}

function renderYoheiloop() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H; // terminal character aspect

  var tiltX = 0, tiltY = 0;
  if (pointer.down && state.currentMode === 'yoheiloop') {
    tiltX = (pointer.gx / W - 0.5) * 0.35;
    tiltY = (pointer.gy / H - 0.5) * 0.35;
    // y-axis drag: -6 to +6 iter shift on flip point
    flipDrift = (0.5 - pointer.gy / H) * 10;
  } else {
    flipDrift *= 0.94;
  }
  var flipIter = FLIP_ITER_BASE + flipDrift | 0;
  if (flipIter < 6) flipIter = 6;
  if (flipIter > OUTER_ITERS) flipIter = OUTER_ITERS;

  for (var y = 0; y < H; y++) {
    // Shader: (FC.y - r.y/2) / r.y  →  range ~[-0.5, 0.5]
    // Flip sign for GL y-up. Shader adds +1.0 to y (the `+ vec2(0,1)`)
    // → looking up/through rather than forward.
    var ny = (0.5 - y / H) + 1.0 + tiltY;
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * ar + tiltX;

      // Initial ray direction — will be overwritten with vec3(-1,-1,-1)
      // after the flip.
      var dx = nx, dy = ny, dz = 1.0;

      // q starts at vec3(0, -1, -1) (after q.yz--)
      var qx = 0, qy = -1, qz = -1;
      // p uninitialized in GLSL → zeros
      var px = 0, py = 0, pz = 0;
      var e = 0, R = 0, s = 0;

      var accumV = 0;
      var accumHueShift = 0;   // tracks p.y for color riding
      var count = 0;

      for (var i = 1; i <= OUTER_ITERS; i++) {
        // e += i / 5000
        e += i / 5000;

        // direction flip at iter N
        if (i > flipIter) {
          dx = -1; dy = -1; dz = -1;
        }

        // color accumulate (uses previous iter's p.y and current e)
        // shader: o.rgb += hsv(0.1, -0.3*p.y, e/17)
        // We track value = e/17 weighted by iteration (weighting favours
        // post-flip marches where structure emerges)
        var iterWeight = (i < flipIter ? 0.6 : 1.4);
        var contrib = (Math.abs(e) / 17) * iterWeight;
        accumV += contrib;
        accumHueShift += -0.3 * py;
        count++;

        // March forward: q += d * e * R * 0.18
        var step = e * R * 0.18;
        qx += dx * step;
        qy += dy * step;
        qz += dz * step;
        px = qx; py = qy; pz = qz;

        R = Math.sqrt(px * px + py * py + pz * pz);
        if (R < 1e-4) R = 1e-4;

        // p = vec3(log(R) - t*0.5,
        //         -p.z / R,
        //         p.y + p.x - t*0.5)   // Twigl overflow truncate
        var npx = Math.log(R) - t * 0.5;
        var npy = -pz / R;
        var npz = py + px - t * 0.5;

        // --p.y (prefix decrement)
        npy -= 1;
        e = npy;

        // Inner doubling loop: s=1, *=2 until s>=500
        // e += cos(dot(cos(p*s), sin(p.zxy*s))) / s * 0.8
        s = 1;
        while (s < INNER_MAX_S) {
          var ca = Math.cos(npx * s);
          var cb = Math.cos(npy * s);
          var cc = Math.cos(npz * s);
          // p.zxy * s → (npz*s, npx*s, npy*s)
          var sa = Math.sin(npz * s);
          var sb = Math.sin(npx * s);
          var sc = Math.sin(npy * s);
          var dotv = ca * sa + cb * sb + cc * sc;
          e += Math.cos(dotv) / s * 0.8;
          s += s;
        }

        // Write back for next outer iter's color pick
        px = npx; py = npy; pz = npz;
      }

      var normV = accumV / count;
      // 1 - exp(-x * GAIN) smoothly rolls HDR into [0,1]
      var v = 1 - Math.exp(-normV * GAIN);
      if (v < 0.04) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue rides p.y shift (negative → warm, positive → cool)
      var hueShift = accumHueShift / count;
      // Shader hue=0.1 (~36°, warm orange) with sat mod producing pastels.
      // In HSL terms: center on 30° (amber), swing ±35° with pY.
      var hue = 30 + hueShift * 35;
      if (hue < -10) hue += 360;
      if (hue > 360) hue -= 360;
      if (hue < 0) hue += 360;

      // Saturation — low sat for the washed-out tunnel look, rising near
      // the centre where the loop converges.
      var sat = 20 + v * 55;

      // Lightness — core shape
      var light = 15 + v * 65;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('yoheiloop', {
  init: initYoheiloop,
  render: renderYoheiloop,
});
