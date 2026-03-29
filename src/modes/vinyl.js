import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var vnSpeed = 1;
function renderVinyl() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  var cx = W / 2, cy = H / 2;
  var maxR = Math.min(cx, cy / ar) * 0.9;
  var t = state.time * vnSpeed;
  if (pointer.clicked && state.currentMode === 'vinyl') {
    pointer.clicked = false;
    vnSpeed = vnSpeed > 0 ? 0 : 1;
  } else if (pointer.down && state.currentMode === 'vinyl') {
    vnSpeed = 0.2 + (pointer.gx / W) * 3;
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = (y - cy) / ar;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > maxR || r < 1) continue;
      var ang = Math.atan2(dy, dx) + t * (0.5 + r * 0.01);
      var groove = Math.sin(r * 2.5) * 0.5 + 0.5;
      var shine = Math.sin(ang * 2 + r * 0.3) * 0.3 + 0.5;
      var v = groove * shine;
      // Label area
      if (r < maxR * 0.25) {
        var labelAng = Math.atan2(dy, dx) + t * 0.5;
        var lv = Math.sin(labelAng * 3 + r) * 0.3 + 0.5;
        drawCharHSL(lv > 0.5 ? '#' : '=', x, y, 0, 70, (12 + lv * 20) | 0);
        continue;
      }
      // Center hole
      if (r < maxR * 0.05) continue;
      var ch = v > 0.6 ? '-' : v > 0.3 ? '.' : ' ';
      if (ch !== ' ') {
        var hue = (r * 3 + ang * 20) % 360;
        drawCharHSL(ch, x, y, hue, 15, (5 + v * 18) | 0);
      }
    }
  }
  // Tonearm
  var armX = (cx + maxR * 0.3) | 0;
  for (var ay = 1; ay < cy; ay++) {
    var ax = (armX + (cy - ay) * 0.15) | 0;
    if (ax >= 0 && ax < W && ay >= 0 && ay < H) drawCharHSL('|', ax, ay, 0, 0, 20);
  }
  // Speed display
  var rpm = (vnSpeed * 33.3) | 0;
  var s = rpm + ' RPM';
  for (var i = 0; i < s.length; i++) {
    if (2 + i < W) drawCharHSL(s[i], 2, 1, 0, 0, 25);
  }
}
registerMode('vinyl', { render: renderVinyl });
