import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hlGrid, hlNext, hlW, hlH, hlGen;
function initHexlife() {
  hlW = state.COLS; hlH = state.ROWS;
  hlGrid = new Uint8Array(hlW * hlH);
  hlNext = new Uint8Array(hlW * hlH);
  hlGen = 0;
  for (var i = 0; i < hlGrid.length; i++) hlGrid[i] = Math.random() < 0.3 ? 1 : 0;
}
function renderHexlife() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!hlGrid || hlW !== W || hlH !== H) initHexlife();
  if (pointer.clicked && state.currentMode === 'hexlife') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var px = gx+dx, py = gy+dy;
      if (px >= 0 && px < W && py >= 0 && py < H) hlGrid[py*W+px] = 1;
    }
  }
  // Step every few frames
  if (((state.time * 10) | 0) > hlGen) {
    hlGen = (state.time * 10) | 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var n = 0;
        var odd = y & 1;
        // Hex neighbors (6)
        var dirs = odd
          ? [[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]]
          : [[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]];
        for (var d = 0; d < 6; d++) {
          var nx = x + dirs[d][0], ny = y + dirs[d][1];
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) n += hlGrid[ny*W+nx];
        }
        var alive = hlGrid[y*W+x];
        hlNext[y*W+x] = alive ? (n === 2 ? 1 : 0) : (n === 2 ? 1 : 0);
      }
    }
    var tmp = hlGrid; hlGrid = hlNext; hlNext = tmp;
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (!hlGrid[y*W+x]) continue;
      var hue = (x * 3 + y * 5 + state.time * 20) % 360;
      drawCharHSL((y & 1) ? '⬡' : '⬢', x, y, hue | 0, 70, 40);
    }
  }
}
registerMode('hexlife', { init: initHexlife, render: renderHexlife });
