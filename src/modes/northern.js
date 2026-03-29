import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ntIntensity = 1;
function renderNorthern() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'northern') {
    pointer.clicked = false;
    ntIntensity = 2;
  } else if (pointer.down && state.currentMode === 'northern') {
    ntIntensity = 0.5 + (1 - pointer.gy / H) * 2;
  }
  ntIntensity = Math.max(0.5, ntIntensity * 0.995);
  // Stars
  for (var i = 0; i < 50; i++) {
    var sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
    var sy = (Math.sin(i * 3.1 + 2) * 0.3 + 0.15) * H;
    var twinkle = Math.sin(t * (1 + i * 0.1) + i) * 0.5 + 0.5;
    var px = sx | 0, py = sy | 0;
    if (px >= 0 && px < W && py >= 0 && py < H && twinkle > 0.3) {
      drawCharHSL(twinkle > 0.7 ? '*' : '.', px, py, 60, 10, (5 + twinkle * 15) | 0);
    }
  }
  // Aurora curtains
  var numCurtains = 4;
  for (var c = 0; c < numCurtains; c++) {
    var baseY = H * (0.15 + c * 0.08);
    var curtainH = H * 0.35 * ntIntensity;
    for (var x = 0; x < W; x++) {
      var wave = Math.sin(x * 0.03 + t * 0.4 + c * 2) * 3 + Math.sin(x * 0.07 - t * 0.6 + c) * 2;
      var topY = (baseY + wave) | 0;
      var intensity = Math.sin(x * 0.02 + t * 0.3 + c * 1.5) * 0.5 + 0.5;
      intensity *= ntIntensity;
      for (var y = topY; y < topY + curtainH * intensity; y++) {
        if (y < 0 || y >= H) continue;
        var fade = 1 - (y - topY) / (curtainH * intensity);
        fade *= fade;
        var hue = c === 0 ? 120 : c === 1 ? 160 : c === 2 ? 280 : 100;
        hue += Math.sin(x * 0.05 + t * 0.2) * 20;
        var bright = fade * intensity * 20;
        if (bright > 1) {
          var ch = bright > 12 ? '|' : bright > 6 ? ':' : '.';
          drawCharHSL(ch, x, y, hue | 0, 60, bright | 0);
        }
      }
    }
  }
  // Mountain silhouette
  for (var x = 0; x < W; x++) {
    var mh = Math.sin(x * 0.02) * H * 0.08 + Math.sin(x * 0.05 + 1) * H * 0.04 + H * 0.12;
    for (var y = H - (mh | 0); y < H; y++) {
      if (y >= 0 && y < H) drawCharHSL('#', x, y, 220, 10, 2);
    }
  }
}
registerMode('northern', { render: renderNorthern });
