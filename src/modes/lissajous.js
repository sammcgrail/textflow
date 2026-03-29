import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

function renderLissajous() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var a = 3, b = 4, delta = t * 0.3;
  if (pointer.down && state.currentMode === 'lissajous') {
    a = 1 + (pointer.gx / W) * 6;
    b = 1 + (pointer.gy / H) * 6;
  }
  // Draw multiple Lissajous curves
  for (var curve = 0; curve < 4; curve++) {
    var ca = a + curve * 0.5;
    var cb = b + curve * 0.3;
    var cd = delta + curve * Math.PI / 4;
    var hue = (curve * 80 + t * 10) % 360;
    for (var i = 0; i < 600; i++) {
      var tt = i / 600 * Math.PI * 2;
      var x = Math.sin(ca * tt + cd);
      var y = Math.sin(cb * tt);
      var gx = ((x * 0.45 + 0.5) * W) | 0;
      var gy = ((y * 0.45 + 0.5) * H) | 0;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      var bright = 0.5 + Math.sin(tt * 3 + t) * 0.3;
      var ch = bright > 0.6 ? '*' : bright > 0.3 ? '+' : '.';
      drawCharHSL(ch, gx, gy, hue | 0, 70, (15 + bright * 40) | 0);
    }
  }
}
registerMode('lissajous', { render: renderLissajous });
