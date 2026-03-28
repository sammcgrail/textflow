import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var stars = [];
var NUM_STARS = 400;

function initWarp() {
  stars = [];
  for (var i = 0; i < NUM_STARS; i++) {
    stars.push({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random()
    });
  }
}
// initWarp(); — called via registerMode
var WARP_CHARS = '.,+*oO0#@';

// Warp interaction: click to shift tunnel center
var warpCX, warpCY;
function renderWarp() {
  clearCanvas();
  var cx = state.COLS / 2;
  var cy = state.ROWS / 2;

  // Click moves the warp center
  if (pointer.down && state.currentMode === 'warp') {
    warpCX = pointer.gx; warpCY = pointer.gy;
  }
  if (warpCX !== undefined) {
    cx = cx * 0.95 + warpCX * 0.05;
    cy = cy * 0.95 + warpCY * 0.05;
    warpCX = cx; warpCY = cy;
  }
  var speed = 0.008;

  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.z -= speed;
    if (s.z <= 0.001) {
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = 1;
    }

    // Project
    var sx = (s.x / s.z) * cx * 0.8 + cx;
    var sy = (s.y / s.z) * cy * 0.8 + cy;

    if (sx < 0 || sx >= state.COLS || sy < 0 || sy >= state.ROWS) {
      s.z = 0; // Will reset next frame
      continue;
    }

    var bright = 1 - s.z;
    var ci = Math.min(WARP_CHARS.length - 1, (bright * WARP_CHARS.length) | 0);

    // Trail — draw a few chars behind
    var psx = (s.x / (s.z + speed * 3)) * cx * 0.8 + cx;
    var psy = (s.y / (s.z + speed * 3)) * cy * 0.8 + cy;
    var dx = sx - psx;
    var dy = sy - psy;
    var len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.min(4, (len) | 0);

    for (var j = 0; j <= steps; j++) {
      var t = j / (steps + 1);
      var tx = (sx - dx * t) | 0;
      var ty = (sy - dy * t) | 0;
      if (tx >= 0 && tx < state.COLS && ty >= 0 && ty < state.ROWS) {
        var fade = bright * (1 - t * 0.6);
        var b = (180 + fade * 75) | 0;
        drawChar(WARP_CHARS[ci], tx, ty, b, b, (200 + fade * 55) | 0, 0.3 + fade * 0.7);
      }
    }
  }
}

registerMode('warp', {
  init: initWarp,
  render: renderWarp,
});
