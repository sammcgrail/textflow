import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var coralGrid, coralW, coralH, coralHues, coralActive;
function initCoral() {
  coralW = state.COLS; coralH = state.ROWS;
  coralGrid = new Uint8Array(coralW * coralH);
  coralHues = new Float32Array(coralW * coralH);
  coralActive = [];
  // Seed points along bottom
  var seeds = 5 + (Math.random() * 5) | 0;
  for (var s = 0; s < seeds; s++) {
    var sx = (coralW * (s + 0.5) / seeds) | 0;
    var sy = coralH - 1;
    var hue = (s * 360 / seeds) | 0;
    coralGrid[sy * coralW + sx] = 1;
    coralHues[sy * coralW + sx] = hue;
    coralActive.push({ x: sx, y: sy, hue: hue });
  }
}
// initCoral(); — called via registerMode
function renderCoral() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (coralW !== W || coralH !== H) initCoral();
  // Add seed on click
  if (pointer.clicked && state.currentMode === 'coral') {
    pointer.clicked = false;
    var cx = pointer.gx | 0, cy = pointer.gy | 0;
    if (cx >= 0 && cx < W && cy >= 0 && cy < H && !coralGrid[cy * W + cx]) {
      var hue = (Math.random() * 360) | 0;
      coralGrid[cy * W + cx] = 1;
      coralHues[cy * W + cx] = hue;
      coralActive.push({ x: cx, y: cy, hue: hue });
    }
  }
  // Grow a few cells per frame
  var steps = Math.min(coralActive.length, 8);
  for (var s = 0; s < steps; s++) {
    if (coralActive.length === 0) break;
    var idx = (Math.random() * coralActive.length) | 0;
    var a = coralActive[idx];
    // Biased upward growth
    var dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[0,-1],[0,-1]];
    var d = dirs[(Math.random() * dirs.length) | 0];
    var nx = a.x + d[0], ny = a.y + d[1];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H && !coralGrid[ny * W + nx]) {
      coralGrid[ny * W + nx] = 1;
      coralHues[ny * W + nx] = a.hue + (Math.random() - 0.5) * 10;
      coralActive.push({ x: nx, y: ny, hue: coralHues[ny * W + nx] });
    }
    // Remove inactive (surrounded)
    var surrounded = true;
    for (var dy = -1; dy <= 1 && surrounded; dy++) {
      for (var dx = -1; dx <= 1 && surrounded; dx++) {
        if (dx === 0 && dy === 0) continue;
        var tx = a.x + dx, ty = a.y + dy;
        if (tx >= 0 && tx < W && ty >= 0 && ty < H && !coralGrid[ty * W + tx]) surrounded = false;
      }
    }
    if (surrounded) coralActive.splice(idx, 1);
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (!coralGrid[y * W + x]) continue;
      var hue = coralHues[y * W + x];
      var ri = Math.min(RAMP_DENSE.length - 1, 5 + ((y / H) * (RAMP_DENSE.length - 5)) | 0);
      drawCharHSL(RAMP_DENSE[ri], x, y, ((hue + 360) % 360) | 0, 70, (25 + (1 - y / H) * 35) | 0);
    }
  }
}

registerMode('coral', {
  init: initCoral,
  render: renderCoral,
});
