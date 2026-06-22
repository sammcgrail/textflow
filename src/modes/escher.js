// escher — "Ascending and Descending": an impossible square stairwell.
// Concentric square rings (the stairwell shaft) carry steps that march endlessly
// around the loop; the leading edge of each step glows gold and sweeps forever,
// so the staircase reads as perpetual ascent with no top or bottom.
import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var dir = 1; // ascent direction — tap to flip (ascending <-> descending)

function initEscher() {}

function attachEscher() {
  // tap flips the loop direction
  cleanupEscher();
  _onUp = function () { if (state.currentMode === 'escher' && !pointer.dragged) dir = -dir; };
  window.addEventListener('pointerup', _onUp);
}
var _onUp = null;
function cleanupEscher() { if (_onUp) { window.removeEventListener('pointerup', _onUp); _onUp = null; } }

function renderEscher() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  var cx = W / 2, cy = H / 2;
  var ar = state.CHAR_H / state.CHAR_W; // ~2 — square up the shaft
  var rad = Math.min(W, H * ar) * 0.5;
  var active = pointer.down && state.currentMode === 'escher';
  var steps = active ? 16 + Math.round((pointer.gy / Math.max(1, H)) * 28) : 30;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) / rad;
      var dy = (y - cy) * ar / rad;
      var ring = Math.max(Math.abs(dx), Math.abs(dy)); // square rings: 0 centre .. 1 edge
      if (ring < 0.14 || ring > 1.0) continue;         // hollow shaft + circular-ish bound

      var ang = Math.atan2(dy, dx);
      var peri = ang / 6.2832 + 0.5;                   // 0..1 around the perimeter
      // steps march around the loop; deeper rings are phase-shifted => spiral ascent
      var stair = peri * steps - dir * t * 1.1 + ring * 4.0;
      var tread = Math.floor(stair);
      var phase = stair - tread;                       // 0..1 within one step

      // shading: tread bright, riser dark; walls darken with depth
      var lit = phase < 0.5 ? 0.85 : 0.4;
      var depth = 0.35 + 0.65 * ring;
      var v = lit * depth * (0.85 + 0.15 * ((tread & 1) ? 1 : 0));
      if (v < 0.1) continue;

      var lead = phase < 0.16;                          // glowing leading edge of each step
      var hue = lead ? (40 + t * 12) % 360 : 214;       // gold edge on cool stone
      var sat = lead ? 75 : 22;
      var light = lead ? 60 : (10 + v * 50);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, sat, light | 0);
    }
  }
}

registerMode('escher', {
  init: initEscher,
  render: renderEscher,
  attach: attachEscher,
  cleanup: cleanupEscher,
});
