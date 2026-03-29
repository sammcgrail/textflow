import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var autoGrid, autoRule, autoW, autoH;
function initAutomata() {
  autoW = state.COLS;
  autoH = state.ROWS;
  autoGrid = new Uint8Array(autoW * autoH);
  autoRule = 30;
  // Seed top row with single center cell
  autoGrid[Math.floor(autoW / 2)] = 1;
  // Generate all rows
  for (var y = 1; y < autoH; y++) {
    for (var x = 0; x < autoW; x++) {
      var l = x > 0 ? autoGrid[(y - 1) * autoW + x - 1] : 0;
      var c = autoGrid[(y - 1) * autoW + x];
      var r = x < autoW - 1 ? autoGrid[(y - 1) * autoW + x + 1] : 0;
      var idx = (l << 2) | (c << 1) | r;
      autoGrid[y * autoW + x] = (autoRule >> idx) & 1;
    }
  }
}
// initAutomata(); — called via registerMode
function renderAutomata() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (autoW !== W || autoH !== H) initAutomata();
  // Click toggles cells
  if (pointer.clicked && state.currentMode === 'automata') {
    pointer.clicked = false;
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      autoGrid[gy * W + gx] ^= 1;
      // Regenerate rows below
      for (var y = Math.max(1, gy + 1); y < H; y++) {
        for (var x = 0; x < W; x++) {
          var l = x > 0 ? autoGrid[(y - 1) * W + x - 1] : 0;
          var c = autoGrid[(y - 1) * W + x];
          var r = x < W - 1 ? autoGrid[(y - 1) * W + x + 1] : 0;
          var idx2 = (l << 2) | (c << 1) | r;
          autoGrid[y * W + x] = (autoRule >> idx2) & 1;
        }
      }
    }
  }
  // Drag changes rule — horizontal position maps to rule 0-255 (only on drag, not click)
  else if (pointer.down && state.currentMode === 'automata') {
    var newRule = Math.floor((pointer.gx / W) * 256);
    if (newRule !== autoRule && newRule >= 0 && newRule < 256) {
      autoRule = newRule;
      // Regenerate
      for (var y = 1; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var l = x > 0 ? autoGrid[(y - 1) * W + x - 1] : 0;
          var c = autoGrid[(y - 1) * W + x];
          var r = x < W - 1 ? autoGrid[(y - 1) * W + x + 1] : 0;
          var idx3 = (l << 2) | (c << 1) | r;
          autoGrid[y * W + x] = (autoRule >> idx3) & 1;
        }
      }
    }
  }
  // Scroll animation: shift rows up periodically
  var scrollInterval = 0.1;
  var scrollPhase = (state.time / scrollInterval) | 0;
  var hue = (autoRule * 1.4) % 360;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = autoGrid[y * W + x];
      if (val === 0) continue;
      var bright = 0.5 + (y / H) * 0.5;
      var ch = RAMP_DENSE[((bright * RAMP_DENSE.length) | 0) % RAMP_DENSE.length];
      drawCharHSL(ch, x, y, (hue + y * 2) | 0, 80, (20 + bright * 35) | 0);
    }
  }
  // Show current rule
}

registerMode('automata', {
  init: initAutomata,
  render: renderAutomata,
});
