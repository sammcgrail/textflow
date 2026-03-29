import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var tlOffset = 0, tlHueShift = 0;
function renderTiles() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'tiles') {
    pointer.clicked = false;
    tlHueShift += 60;
  } else if (pointer.down && state.currentMode === 'tiles') {
    tlOffset = pointer.gx * 0.05;
    tlHueShift = pointer.gy * 2;
  }
  var tileW = 6, tileH = 3;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var tx = x + Math.sin(t * 0.3 + y * 0.1) * 2 + tlOffset;
      var ty = y + Math.sin(t * 0.2 + x * 0.05) * 1;
      // Offset every other row
      var row = (ty / tileH) | 0;
      var ox = row % 2 === 0 ? 0 : tileW / 2;
      var lx = ((tx + ox) % tileW + tileW) % tileW;
      var ly = ((ty) % tileH + tileH) % tileH;
      var tileId = (((tx + ox) / tileW) | 0) + row * 100;
      // Edge detection
      var isEdge = lx < 0.5 || ly < 0.5;
      var hue = ((tileId * 37 + tlHueShift) % 360 + 360) % 360;
      var pattern = ((tileId * 13) % 5);
      if (isEdge) {
        drawCharHSL('+', x, y, hue, 30, 12);
      } else {
        var chars = ['#', '=', '~', '*', ':'];
        var innerV = Math.sin(lx * 1.5) * Math.sin(ly * 2) * 0.5 + 0.5;
        var bright = 6 + innerV * 16;
        drawCharHSL(chars[pattern], x, y, hue, 50, bright | 0);
      }
    }
  }
}
registerMode('tiles', { render: renderTiles });
