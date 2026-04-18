// scarab — port of Mario Carrillo's "Scarab" shader
// Tweet: https://x.com/marioecg/status/2045545142275457263
// No GLSL source published — this reproduces the visual look.
//
// Reference: iridescent bug-wing / holographic foil tessellation with:
//   - Central vertical pink/magenta/cyan bright spine
//   - Curved horizontal "ribs" bowing outward around the spine
//   - Vertical weft lines forming a woven lattice
//   - Gold/orange accents at cell intersections
//   - Cyan-dominant field elsewhere
//
// Approach:
//   - Horizontal curved bands: sin(y*freqY + |x-cx|*curve + t)
//     The |x-cx| term bends bands outward like cathedral arches.
//   - Vertical weft: sin(x*freqX + t*0.5)
//   - Spine brightness: exp(-dx²/σ²) — gaussian falloff around cx
//   - Lattice cells: product (ribs * weft) lights up cell interiors
//   - Gold highlights: where both waves peak (rib * weft > threshold)
//   - Hue: cyan base (200°), shifts toward pink/magenta (320°) on spine
//     and toward gold (40°) on lattice highlights
//
// Pointer drag: shifts the central spine horizontally for interaction.
import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Spatial frequency of the horizontal curved ribs (more = tighter ribs).
var RIB_FREQ = 16;
// Curvature — how much the ribs bow outward from the spine.
var RIB_CURVE = 4.5;
// Spatial frequency of the vertical weft.
var WEFT_FREQ = 18;
// Spine gaussian width (smaller = tighter bright spine).
var SPINE_SIGMA = 0.18;
// Lattice brightness gain.
var LATTICE_GAIN = 1.3;

// Pointer drag shifts spine horizontally. Smoothed toward target.
var spineShift = 0;
var targetShift = 0;

function initScarab() {
  spineShift = 0;
  targetShift = 0;
}

function renderScarab() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.down && state.currentMode === 'scarab') {
    // Map pointer x across full width to shift range [-0.5, 0.5]
    targetShift = (pointer.gx / W - 0.5);
  } else {
    targetShift *= 0.94;
  }
  // Smooth toward target
  spineShift += (targetShift - spineShift) * 0.12;

  var cx = 0.5 + spineShift;
  var sigma2 = SPINE_SIGMA * SPINE_SIGMA;

  // Phase animates ribs traveling outward from spine.
  var ribPhase = t * 1.4;
  // Weft shimmers more slowly for an interwoven motion.
  var weftPhase = t * 0.55;
  // Palette cycle — subtle hue drift over time.
  var hueDrift = Math.sin(t * 0.3) * 8;

  for (var y = 0; y < H; y++) {
    // Normalize y to [0,1]
    var ny = y / H;
    // Center-relative for symmetric vertical gradient
    var dy = ny - 0.5;

    for (var x = 0; x < W; x++) {
      var nx = x / W;
      var dx = (nx - cx) * ar; // aspect-correct horizontal distance
      var adx = dx < 0 ? -dx : dx;

      // --- Spine: gaussian bright column around cx ---
      var spine = Math.exp(-(dx * dx) / sigma2);

      // --- Curved ribs: horizontal bands that bow outward ---
      // The |dx|*curve term shifts phase as you move away from spine,
      // causing ribs to bend. Multiplied by (1 - 0.4*spine) so ribs
      // flatten near spine and bend more at edges — matches the
      // arched cathedral-window shape of the reference.
      var ribArg = ny * RIB_FREQ + adx * RIB_CURVE + ribPhase;
      var rib = Math.sin(ribArg);
      // Also a slower "envelope" wave that creates the overall curved bowl
      var bowl = Math.sin(ny * Math.PI * 2 + adx * 1.8 + ribPhase * 0.3);

      // --- Weft: vertical lines, slight y-dependent phase for waviness ---
      var weftArg = nx * WEFT_FREQ + Math.sin(ny * 3 + weftPhase) * 0.6 + weftPhase;
      var weft = Math.sin(weftArg);

      // --- Cell field: product of ribs × weft lights up cell interiors ---
      // Taking the absolute value creates bright at both peaks and troughs,
      // which gives the woven cell appearance.
      var cell = Math.abs(rib) * Math.abs(weft);

      // --- Lattice highlights: where both waves peak strongly together ---
      // These are the gold/orange cell-boundary accents in the reference.
      var ribEdge = 1 - Math.abs(rib);   // bright at rib zero-crossings
      var weftEdge = 1 - Math.abs(weft); // bright at weft zero-crossings
      var lattice = Math.pow(ribEdge * weftEdge, 2) * LATTICE_GAIN;

      // --- Combined intensity field ---
      // Spine dominates centre, lattice paints the grid, cell fills interior.
      var v =
        spine * 0.85 +
        lattice * 0.9 +
        cell * 0.35 +
        bowl * bowl * 0.15;

      // Soft clamp
      if (v < 0.05) continue;
      if (v > 1) v = 1;

      // ASCII ramp pick — denser chars for brighter regions
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var ch = RAMP_SOFT[ri];

      // --- Hue selection ---
      // Base cyan (200°). Spine pulls toward pink/magenta (320°).
      // Lattice highlights pull toward gold (40°).
      // Vertical position also modulates hue subtly so the spine
      // gradient reads cyan→pink→magenta top→bottom.
      var baseHue = 200 + dy * 20;            // 190–210 cyan range
      var spineHue = 310 + dy * 20;           // 300–320 pink→magenta
      var latticeHue = 42;                    // warm gold

      // Blend based on which field is dominant at this pixel.
      var spineW = spine * 1.4;
      var latticeW = lattice * 1.8;
      var baseW = 1;
      var totalW = spineW + latticeW + baseW;

      var hue = (
        baseHue * baseW +
        spineHue * spineW +
        latticeHue * latticeW
      ) / totalW + hueDrift;

      // Normalize hue into [0, 360)
      hue = ((hue % 360) + 360) % 360;

      // --- Saturation: iridescent, high everywhere; slight dip at edges ---
      var sat = 72 + spine * 18 + lattice * 10;
      if (sat > 95) sat = 95;

      // --- Lightness: intensity-driven with subtle wave modulation ---
      // The rib sine adds a shimmer that ripples through the field.
      var shimmer = rib * 0.08;
      var light = 28 + v * 48 + shimmer * 10;
      if (light < 10) light = 10;
      if (light > 82) light = 82;

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('scarab', {
  init: initScarab,
  render: renderScarab,
});
