import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var pwSpeed = 1;
function renderPendwave() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  // Drag changes speed
  if (pointer.down && state.currentMode === 'pendwave') {
    pwSpeed = 0.2 + (pointer.gy / H) * 3;
  }
  var t = state.time * pwSpeed;
  // Center pendulums in the screen
  var count = Math.min(W - 4, 50);
  var startX = ((W - count) / 2) | 0;
  var anchorY = 3;
  var maxLen = (H - anchorY - 4) * 0.85;
  for (var i = 0; i < count; i++) {
    var freq = 0.5 + i * 0.025;
    var angle = Math.sin(t * freq) * Math.PI * 0.35;
    var anchorX = startX + i;
    // Draw anchor point
    drawCharHSL('-', anchorX, anchorY, 0, 0, 20);
    // Bob position
    var bobX = (anchorX + Math.sin(angle) * maxLen * 0.4) | 0;
    var bobY = (anchorY + Math.cos(angle) * maxLen * 0.6) | 0;
    // Draw string
    var steps = 15;
    for (var s = 1; s < steps; s++) {
      var frac = s / steps;
      var sx = (anchorX + (bobX - anchorX) * frac) | 0;
      var sy = (anchorY + (bobY - anchorY) * frac) | 0;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) drawCharHSL(':', sx, sy, (i * 7) | 0, 40, 15);
    }
    // Draw bob
    if (bobX >= 0 && bobX < W && bobY >= 0 && bobY < H) {
      drawCharHSL('@', bobX, bobY, (i * 7) | 0, 80, 50);
    }
  }
}
registerMode('pendwave', { render: renderPendwave });
