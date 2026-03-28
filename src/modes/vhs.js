import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { simplex2 } from '../core/noise.js';
import { state } from '../core/state.js';

var vhsTrackOffset = 0;
var vhsGlitchTimer = 0;
var vhsMessage = '  PLAY >  00:' + ('0' + Math.floor(Math.random() * 60)).slice(-2) + ':' + ('0' + Math.floor(Math.random() * 60)).slice(-2) + '  REC ';

function initVHS() {
  vhsTrackOffset = 0;
  vhsGlitchTimer = 0;
}
// initVHS(); — called via registerMode
function renderVHS() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Click triggers tracking glitch
  if (pointer.clicked && state.currentMode === 'vhs') {
    pointer.clicked = false;
    vhsGlitchTimer = 20 + Math.floor(Math.random() * 20);
  }
  // Hold to continuously glitch
  if (pointer.down && state.currentMode === 'vhs') {
    vhsGlitchTimer = Math.max(vhsGlitchTimer, 5);
  }

  var glitching = vhsGlitchTimer > 0;
  if (glitching) vhsGlitchTimer--;

  // Update VHS timestamp
  var secs = (state.time * 1) | 0;
  var mins = (secs / 60) | 0;
  var hrs = (mins / 60) | 0;
  vhsMessage = '  PLAY >  ' + ('0' + (hrs % 24)).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2) + ':' + ('0' + (secs % 60)).slice(-2) + '  ';

  // Base content — a "recorded" scene
  for (var y = 0; y < H; y++) {
    var rowOffset = 0;

    // Tracking distortion
    if (glitching) {
      var trackZone = Math.sin(y * 0.3 + state.time * 5) * 0.5 + 0.5;
      if (trackZone > 0.7) rowOffset = (Math.random() * 10 - 5) | 0;
      // Horizontal tear
      if (Math.random() < 0.05) rowOffset = (Math.random() * W * 0.5 - W * 0.25) | 0;
    }

    // Subtle ongoing tracking wobble
    rowOffset += Math.sin(y * 0.05 + state.time * 2) * 0.5 | 0;

    for (var x = 0; x < W; x++) {
      var sx = (x + rowOffset + W) % W;

      // VHS "recorded" content — a landscape scene
      var scene = simplex2(sx * 0.04 + state.time * 0.05, y * 0.06) * 0.5 + 0.5;
      scene += simplex2(sx * 0.08 - state.time * 0.03, y * 0.1 + 5) * 0.3;
      scene = Math.max(0, Math.min(1, scene));

      // Color bleed — shift R channel
      var bleedX = (sx + 2 + W) % W;
      var rScene = simplex2(bleedX * 0.04 + state.time * 0.05, y * 0.06) * 0.5 + 0.5;

      if (scene < 0.15) continue;

      var ri = Math.min(RAMP_DENSE.length - 1, (scene * RAMP_DENSE.length) | 0);
      var r = (rScene * 200 + 55) | 0;
      var g = (scene * 180 + 40) | 0;
      var b = (scene * 160 + 30) | 0;

      // VHS noise overlay
      if (Math.random() < 0.02) { r = 255; g = 255; b = 255; }

      // Scanline
      var scan = (y % 2 === 0) ? 1 : 0.75;
      drawChar(RAMP_DENSE[ri], x, y, (r * scan) | 0, (g * scan) | 0, (b * scan) | 0, 0.3 + scene * 0.6);
    }
  }

  // VHS OSD overlay (timestamp, PLAY indicator)
  var osdY = 2;
  for (var oi = 0; oi < vhsMessage.length && oi < W; oi++) {
    var ch = vhsMessage[oi];
    if (ch !== ' ') drawChar(ch, oi + 2, osdY, 255, 255, 255, 0.9);
  }

  // REC dot blink
  if ((state.time * 2 | 0) % 2 === 0) {
    drawChar('●', W - 5, 2, 255, 30, 30, 0.9);
    drawChar('R', W - 4, 2, 255, 255, 255, 0.8);
    drawChar('E', W - 3, 2, 255, 255, 255, 0.8);
    drawChar('C', W - 2, 2, 255, 255, 255, 0.8);
  }

  // Bottom tracking bar
  if (glitching) {
    var barY = (H * 0.7 + Math.sin(state.time * 3) * H * 0.2) | 0;
    for (var bx = 0; bx < W; bx++) {
      drawChar('=', bx, barY, 200, 200, 200, 0.4 + Math.random() * 0.3);
    }
  }
}

registerMode('vhs', {
  init: initVHS,
  render: renderVHS,
});
