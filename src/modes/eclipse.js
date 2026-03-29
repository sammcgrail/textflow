import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

function renderEclipse() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var cx = W / 2, cy = H / 2;
  var t = state.time;
  var sunR = Math.min(W, H) * 0.25;
  // Moon position oscillates
  var moonOff = Math.sin(t * 0.2) * sunR * 1.5;
  var moonX = cx + moonOff;
  var moonY = cy;
  var moonR = sunR * 0.95;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) * 2;
      var dSun = Math.sqrt(dx * dx + dy * dy);
      var dmx = x - moonX, dmy = (y - moonY) * 2;
      var dMoon = Math.sqrt(dmx * dmx + dmy * dmy);
      // Corona
      if (dSun < sunR * 3 && dMoon > moonR) {
        var corona = Math.max(0, 1 - dSun / (sunR * 3));
        var flicker = Math.sin(Math.atan2(dy, dx) * 8 + t * 2) * 0.2 + 0.8;
        corona *= flicker;
        if (corona > 0.05) {
          var ci = (corona * (RAMP_DENSE.length - 1)) | 0;
          var hue = (40 - corona * 30) | 0;
          drawCharHSL(RAMP_DENSE[ci], x, y, Math.max(0, hue), 90, (5 + corona * 50) | 0);
        }
      }
      // Sun body
      if (dSun < sunR && dMoon > moonR) {
        var bright = 1 - dSun / sunR;
        var ci = (bright * (RAMP_DENSE.length - 1)) | 0;
        drawCharHSL(RAMP_DENSE[ci], x, y, 40, 90, (30 + bright * 40) | 0);
      }
      // Moon (dark)
      if (dMoon < moonR) {
        var edge = moonR - dMoon;
        if (edge < 1.5) drawCharHSL('.', x, y, 0, 0, 8);
      }
      // Stars in background
      if (dSun > sunR * 2.5) {
        var star = Math.sin(x * 127.1 + y * 311.7) * Math.sin(x * 269.5 + y * 183.3);
        if (star > 0.97) drawCharHSL('.', x, y, 0, 0, 30 + Math.sin(t + x) * 10 | 0);
      }
    }
  }
}
registerMode('eclipse', { render: renderEclipse });
