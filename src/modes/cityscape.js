import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

function renderCityscape() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var skyline = H * 0.6;
  // Stars
  for (var y = 0; y < skyline; y++) {
    for (var x = 0; x < W; x++) {
      var hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      if ((hash - (hash | 0)) > 0.993) {
        var twinkle = Math.sin(t * 3 + hash * 10) * 0.3 + 0.7;
        drawCharHSL('.', x, y, 0, 0, (10 + twinkle * 20) | 0);
      }
    }
  }
  // Moon
  var moonX = (W * 0.75) | 0, moonY = (H * 0.15) | 0;
  for (var dy = -2; dy <= 2; dy++) for (var dx = -3; dx <= 3; dx++) {
    var d = Math.sqrt(dx*dx/2 + dy*dy);
    if (d < 2.5) {
      var px = moonX + dx, py = moonY + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(d < 1.5 ? '@' : 'O', px, py, 50, 20, (30 + (2.5-d)*15) | 0);
    }
  }
  // Buildings
  for (var bx = 0; bx < W; bx += 1) {
    var hash = Math.sin(bx * 43.37) * 9999;
    var bHeight = ((hash - (hash | 0)) * H * 0.5) | 0;
    if (bHeight < 3) continue;
    var bTop = H - bHeight;
    // Only draw building columns at intervals
    var bGroup = (bx / 4) | 0;
    var bHash = Math.sin(bGroup * 77.7) * 4321;
    var groupH = 5 + ((bHash - (bHash | 0)) * H * 0.45) | 0;
    var groupTop = H - groupH;
    for (var y = groupTop; y < H; y++) {
      // Window pattern
      var isWindow = (bx % 4 !== 0) && (y % 3 !== 0) && y > groupTop + 1;
      if (isWindow) {
        var lit = Math.sin(bx * 13.7 + y * 7.3 + Math.floor(t * 0.1) * 99) > 0.3;
        if (lit) drawCharHSL('#', bx, y, 50, 60, 35);
        else drawCharHSL('.', bx, y, 0, 0, 8);
      } else {
        drawCharHSL(y === groupTop ? '_' : '|', bx, y, 220, 10, 12);
      }
    }
  }
}
registerMode('cityscape', { render: renderCityscape });
