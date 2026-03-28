import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var staticChannel = 0;
var staticTuning = 0;
var staticChannelData = [];

function initStatic() {
  staticChannel = 0;
  staticTuning = 0;
  // Pre-generate "channel" patterns
  staticChannelData = [];
  var patterns = [
    function(x, y, t) { return 'TEXTFLOW'[(x + (t * 5 | 0)) % 8]; }, // scrolling text
    function(x, y, t) { return ((x ^ y) & 7) / 7; }, // XOR pattern
    function(x, y, t) { var d = Math.sqrt((x - state.COLS/2)*(x-state.COLS/2) + (y-state.ROWS/2)*(y-state.ROWS/2)); return Math.sin(d * 0.2 - t * 2) * 0.5 + 0.5; }, // circles
    function(x, y, t) { return (Math.sin(x * 0.1 + t) + Math.sin(y * 0.15 - t * 0.7)) * 0.25 + 0.5; }, // waves
    function(x, y, t) { return (x % 8 < 4) !== (y % 6 < 3) ? 0.8 : 0.1; }, // checkerboard
  ];
  staticChannelData = patterns;
}
// initStatic(); — called via registerMode
function renderStatic() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Click to change channel
  if (pointer.clicked && state.currentMode === 'tvstatic') {
    pointer.clicked = false;
    staticTuning = 15; // frames of static while tuning
    staticChannel = (staticChannel + 1) % staticChannelData.length;
  }

  if (staticTuning > 0) {
    staticTuning--;
    // Pure static noise while tuning
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (Math.random() < 0.6) continue;
        var v = Math.random();
        var chars = '@#$%&*!?.,:;+-=~';
        var ch = chars[Math.floor(Math.random() * chars.length)];
        var grey = (v * 200) | 0;
        drawChar(ch, x, y, grey, grey, grey, 0.3 + v * 0.7);
      }
    }
    // Horizontal bars
    for (var sy = 0; sy < 3; sy++) {
      var barY = Math.floor(Math.random() * H);
      for (var x = 0; x < W; x++) {
        drawChar('-', x, barY, 255, 255, 255, 0.5);
      }
    }
  } else {
    // Show current channel with some static overlay
    var pattern = staticChannelData[staticChannel];
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var v;
        var result = pattern(x, y, state.time);
        if (typeof result === 'string') {
          // Text channel
          var ch = result;
          drawCharHSL(ch, x, y, (state.time * 20 + x) % 360, 60, 40);
          continue;
        }
        v = result;
        // Add static noise
        v += (Math.random() - 0.5) * 0.1;
        v = Math.max(0, Math.min(1, v));
        if (v < 0.1) continue;

        var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
        var grey = (v * 255) | 0;
        drawChar(RAMP_DENSE[ri], x, y, grey, grey, grey, 0.3 + v * 0.7);
      }
    }
  }

  // Scanlines
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x++) {
      if (Math.random() < 0.95) continue;
      drawChar('-', x, y, 50, 50, 50, 0.15);
    }
  }
}

registerMode('tvstatic', {
  init: initStatic,
  render: renderStatic,
});
