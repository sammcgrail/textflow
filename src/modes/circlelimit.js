// circlelimit — hyperbolic Poincaré-disk tessellation (Escher's Circle Limit III)
// rendered at HIGH DETAIL: the mode dials the font size DOWN on entry so the
// grid roughly quadruples in cell count, then restores it on exit. The motif
// densifies toward the rim via the Poincaré metric, like the interlocking fish.
import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { resizeWebGL } from '../core/webgl-renderer.js';

var HUES = [140, 0, 50, 210]; // Circle Limit III: green, red, yellow, blue

// Shrink the font => more COLS/ROWS => finer tessellation. scale<1 = denser.
function applyFineGrid(scale) {
  var w = window.innerWidth, h = window.innerHeight - 14; // INFO_BAR_H
  var base = Math.max(10, Math.min(16, w / 70));
  state.FONT_SIZE = Math.max(5, base * scale);
  var mc = state.ctx;
  mc.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  mc.textBaseline = 'top';
  state.CHAR_W = mc.measureText('M').width;
  state.CHAR_H = state.FONT_SIZE * 1.25;
  state.COLS = Math.floor(w / state.CHAR_W);
  state.ROWS = Math.floor((h - state.NAV_H) / state.CHAR_H);
  if (state.useWebGL) resizeWebGL();
}

function initCirclelimit() {
  applyFineGrid(state.isMobile ? 0.6 : 0.5);
}

function cleanupCirclelimit() {
  resize(); // restore the default grid/font when leaving the mode
}

function renderCirclelimit() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  var cx = W / 2, cy = H / 2;
  var ar = state.CHAR_H / state.CHAR_W; // ~2 — square up the disk
  var rad = Math.min(W, H * ar) * 0.48;
  var active = pointer.down && state.currentMode === 'circlelimit';
  var pfold = active ? 4 + Math.round((pointer.gx / Math.max(1, W)) * 6) : 6;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx;
      var dy = (y - cy) * ar;
      var r = Math.sqrt(dx * dx + dy * dy) / rad; // 0..1 inside disk
      if (r >= 0.998) continue;                   // outside => the bounding circle
      var a = Math.atan2(dy, dx);
      // Poincaré radial distance — rings crowd toward the rim
      var rho = Math.log((1 + r) / (1 - r));
      var rings = Math.sin(rho * 3.0 - t * 1.4);
      var arcs = Math.cos(a * pfold + rho * 1.6 + t * 0.3); // swirling "fish" arcs
      var motif = rings * 0.6 + arcs * 0.4;
      var v = motif * 0.5 + 0.5;
      if (v < 0.14) continue;
      var seg = ((((Math.floor((a / 6.2832 + 0.5) * pfold + rho)) % 4) + 4) % 4);
      var hue = (HUES[seg] + t * 10) % 360;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, 82, (8 + v * 60) | 0);
    }
  }
}

registerMode('circlelimit', {
  init: initCirclelimit,
  render: renderCirclelimit,
  cleanup: cleanupCirclelimit,
});
