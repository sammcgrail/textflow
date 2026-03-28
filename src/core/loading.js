import { state } from './state.js';
import { RAMP_DENSE } from './ramps.js';
import { drawChar, drawCharHSL } from './draw.js';

export function drawFancyLoading(label) {
  var W = state.COLS, H = state.ROWS;
  var cx = W / 2, cy = H / 2;
  var t = state.time;
  var loadChars = '\u2593\u2592\u2591\u2588\u2584\u2580\u25A0\u25A1\u25CF\u25CB\u25C6\u25C7\u2605\u2606';
  for (var i = 0; i < 40; i++) {
    var angle = t * 1.5 + i * 0.157;
    var radius = 4 + Math.sin(t * 0.8 + i * 0.3) * 3;
    var px = cx + Math.cos(angle) * radius;
    var py = cy + Math.sin(angle) * radius * 0.5;
    var ix = Math.round(px), iy = Math.round(py);
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var ch = loadChars[i % loadChars.length];
      var hue = (t * 60 + i * 25) % 360;
      var bright = 30 + Math.sin(t * 3 + i) * 15;
      drawCharHSL(ch, ix, iy, hue, 50, bright);
    }
  }
  var dots = '';
  for (var d = 0; d < 3; d++) dots += Math.sin(t * 4 + d * 1.2) > 0 ? '.' : ' ';
  var msg = '[ ' + label + dots + ' ]';
  state.ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.sin(t * 2) * 0.15).toFixed(2) + ')';
  state.ctx.textAlign = 'center';
  state.ctx.fillText(msg, cx * state.CHAR_W, state.NAV_H + (cy + 6) * state.CHAR_H);
  state.ctx.textAlign = 'left';
  var scanY = Math.round((Math.sin(t * 1.5) * 0.5 + 0.5) * H);
  for (var sx = 0; sx < W; sx++) {
    var b = Math.sin(sx * 0.2 + t * 5) * 0.5 + 0.5;
    if (b > 0.6) {
      var sci = Math.min(RAMP_DENSE.length - 1, (b * RAMP_DENSE.length) | 0);
      drawChar(RAMP_DENSE[sci], sx, scanY, 100, 100, 100, b * 0.3);
    }
  }
}
