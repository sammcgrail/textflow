import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Prismatic rotation — light splitting through rotating prism facets
function renderRotoprism() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  var prismAngle = t * 0.35;
  var facets = 6;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 1.6;
      var r = Math.sqrt(dx * dx + dy * dy);
      var a = Math.atan2(dy, dx);

      // Rotating faceted angle quantization
      var ra = a - prismAngle;
      var facetAngle = Math.floor(ra * facets / (2 * Math.PI) + 0.5) * (2 * Math.PI) / facets;
      var refracted = facetAngle + prismAngle;
      var diff = ra - facetAngle + prismAngle; // difference from facet center

      // Rainbow dispersion based on facet edge distance
      var edgeDist = Math.abs(Math.sin(diff * facets * 0.5));
      var spectrum = (a + prismAngle) / (2 * Math.PI);
      if (spectrum < 0) spectrum += 1;

      // Caustic intensity — bright at facet edges
      var caustic = Math.pow(1 - edgeDist, 3);
      var radialWave = Math.sin(r * 0.5 - t * 3) * 0.5 + 0.5;
      var val = caustic * 0.7 + radialWave * 0.3;

      // Inner bright core
      var core = Math.max(0, 1 - r / (W * 0.08));
      val += core * 0.5;

      // Outer fade
      val *= Math.max(0, 1 - r / (W * 0.5));

      if (val < 0.04) continue;
      val = Math.min(1, val);
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (spectrum * 360 + edgeDist * 60) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 80, 10 + val * 60);
    }
  }
}

registerMode('rotoprism', { init: undefined, render: renderRotoprism });
