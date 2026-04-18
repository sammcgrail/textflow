// drop1 — closed octahedral kaleidoscopic mandala
// No source shader — approximates the "drop1" visual reference frames:
//   - 4-fold (octahedral) kaleidoscopic symmetry
//   - concentric rings at center + filigree teardrop pattern outward
//   - palette cycles red → blue → green → orange over ~40s
//   - dark background, bright filigree strokes
//
// Approach: reduce each cell's (x,y) to the fundamental octant via
// |x|, |y|, swap — producing 8-fold symmetry. Convert to polar (r, a)
// then apply a domain-warped cosine-FBM in polar coordinates to produce
// the filigree pattern. Palette cycles on a 40s sinusoid.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Outer detail iterations — controls filigree fineness
var OUTER_ITERS = 22;
// Inner FBM iters
var INNER_ITERS = 8;
// Compression gain
var GAIN = 2.4;
// Palette cycle period (seconds per full loop across 4 anchor hues)
var PALETTE_PERIOD = 40;

// Drag adds a pulse — center-ward push
var zoom = 1;
var spin = 0;

function initDrop1() {
  zoom = 1;
  spin = 0;
}

// Return HSL hue cycling through red(0) → blue(230) → green(120) → orange(30)
// Smoothly interpolate using a 4-anchor cycle.
function paletteHue(t) {
  var phase = (t / PALETTE_PERIOD) % 1;
  if (phase < 0) phase += 1;
  // Four anchor hues
  var anchors = [0, 230, 120, 30];
  var n = anchors.length;
  var p = phase * n;
  var i0 = Math.floor(p);
  var i1 = (i0 + 1) % n;
  var frac = p - i0;
  // Smoothstep frac for gentler transitions
  var sf = frac * frac * (3 - 2 * frac);
  var a = anchors[i0], b = anchors[i1];
  // Shortest-path hue interp
  var diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  var h = a + diff * sf;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return h;
}

function renderDrop1() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'drop1') {
    // pointer y → zoom (closer to top = zoom in)
    zoom = 1 + (0.5 - pointer.gy / H) * 0.8;
    spin = (pointer.gx / W - 0.5) * 1.2;
  } else {
    zoom += (1 - zoom) * 0.07;
    spin *= 0.93;
  }

  // Base palette hue for this frame (primary color of the mandala)
  var baseHue = paletteHue(t);
  // Secondary hue 120° off for filigree detail
  var secHue = (baseHue + 140) % 360;

  // Center-of-screen offset
  var cx = W * 0.5;
  var cy = H * 0.5;

  // Normalisation so mandala fills the shorter dimension
  var norm = 2 / Math.min(W, H);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Centered coords in [-1, 1] range (roughly)
      var ux = (x - cx) * norm * ar / zoom;
      var uy = (y - cy) * norm / zoom;

      // Spin rotation
      var cs = Math.cos(spin), ss = Math.sin(spin);
      var rx = cs * ux - ss * uy;
      var ry = ss * ux + cs * uy;

      // 4-fold (octahedral) symmetry: fold into first octant
      var fx = Math.abs(rx);
      var fy = Math.abs(ry);
      // Swap if below diagonal — produces 8-fold symmetry
      if (fy > fx) { var tmp = fx; fx = fy; fy = tmp; }

      // Polar coords in folded space
      var r = Math.sqrt(fx * fx + fy * fy);
      if (r < 1e-4) r = 1e-4;
      var a = Math.atan2(fy, fx);   // in [0, π/4] after folding

      // Domain-warp the polar coords with a low-freq noise
      var warpR = r + Math.sin(a * 8 + t * 0.4) * 0.08;
      var warpA = a + Math.cos(r * 6 - t * 0.3) * 0.25;

      // FBM / cosine-sum ridge pattern — produces the filigree
      var sig = 0;
      var amp = 1;
      var freq = 6;
      for (var k = 0; k < INNER_ITERS; k++) {
        var val = Math.cos(warpR * freq + warpA * 6 + t * 0.5) *
                  Math.sin(warpA * freq * 2 - t * 0.3);
        sig += Math.abs(val) * amp;
        amp *= 0.62;
        freq *= 1.9;
      }

      // Concentric rings term — sharp at small r
      var rings = Math.abs(Math.sin(r * 14 - t * 0.8));
      rings = Math.pow(1 - rings, 3);  // ring strokes

      // Combine: outer filigree + inner rings
      var ringsMask = Math.exp(-r * 4.5);   // rings concentrated at center
      var filMask = 1 - Math.exp(-r * 1.2);  // filigree further out
      var sigWarp = 0;
      for (var j = 1; j <= OUTER_ITERS; j++) {
        // Weight: emphasise certain frequencies
        var jn = j / OUTER_ITERS;
        sigWarp += Math.abs(Math.cos(warpR * (3 + jn * 20) +
                                      warpA * (2 + jn * 12) -
                                      t * (0.2 + jn * 0.5))) / OUTER_ITERS;
      }

      var raw = sigWarp * filMask + rings * ringsMask * 1.4 + sig * 0.04;
      // Vignette — dark edges
      var vig = Math.exp(-r * r * 0.9);

      var v = raw * vig * GAIN;
      v = 1 - Math.exp(-v);
      if (v < 0.05) continue;
      if (v > 1) v = 1;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // Hue: base palette mixed with secondary for filigree depth.
      // Pick which hue based on signal character.
      var hueMix = (sigWarp > 0.5) ? 1 : 0;
      // Smooth interp between base and secondary
      var hueT = Math.min(1, Math.max(0, (sigWarp - 0.35) * 2));
      var dh = secHue - baseHue;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      var hue = baseHue + dh * hueT * 0.35;
      if (hue < 0) hue += 360;
      if (hue >= 360) hue -= 360;

      var sat = 70 + v * 25;
      var light = 10 + v * 55;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('drop1', {
  init: initDrop1,
  render: renderDrop1,
});
