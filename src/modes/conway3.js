import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var c3Grid, c3Next, c3W, c3H;
function initConway3() {
  c3W = state.COLS; c3H = state.ROWS;
  c3Grid = new Uint8Array(c3W * c3H);
  c3Next = new Uint8Array(c3W * c3H);
  // Random initial state
  for (var i = 0; i < c3Grid.length; i++) {
    c3Grid[i] = Math.random() < 0.1 ? 2 : 0; // 0=dead, 1=dying, 2=alive
  }
}
// initConway3(); — called via registerMode
function renderConway3() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (c3W !== W || c3H !== H) initConway3();
  // Click to toggle
  if (pointer.clicked && state.currentMode === 'conway3') {
    pointer.clicked = false;
    var cx = pointer.gx | 0, cy = pointer.gy | 0;
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
      c3Grid[cy * W + cx] = c3Grid[cy * W + cx] === 2 ? 0 : 2;
    }
  }
  // Brian's Brain rules
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var state = c3Grid[y * W + x];
      if (state === 2) {
        c3Next[y * W + x] = 1; // alive -> dying
      } else if (state === 1) {
        c3Next[y * W + x] = 0; // dying -> dead
      } else {
        // dead -> alive if exactly 2 alive neighbors
        var alive = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = (x + dx + W) % W, ny = (y + dy + H) % H;
            if (c3Grid[ny * W + nx] === 2) alive++;
          }
        }
        c3Next[y * W + x] = alive === 2 ? 2 : 0;
      }
    }
  }
  // Swap
  var tmp = c3Grid; c3Grid = c3Next; c3Next = tmp;
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var s = c3Grid[y * W + x];
      if (s === 0) continue;
      if (s === 2) {
        drawCharHSL('#', x, y, 40, 90, 55);
      } else {
        drawCharHSL('.', x, y, 200, 70, 35);
      }
    }
  }
}

registerMode('conway3', {
  init: initConway3,
  render: renderConway3,
});
