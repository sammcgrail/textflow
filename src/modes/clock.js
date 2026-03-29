import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ckOffset = 0;
function renderClock() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var cx = W / 2, cy = H / 2;
  var r = Math.min(cx * 0.8, cy * 0.8);
  // Click adjusts time offset (hours)
  if (pointer.clicked && state.currentMode === 'clock') {
    pointer.clicked = false;
    var angle = Math.atan2(pointer.gy - cy, pointer.gx - cx);
    ckOffset = ((angle / Math.PI * 6 + 12) % 12) | 0;
  }
  var now = new Date();
  var sec = now.getSeconds() + now.getMilliseconds() / 1000;
  var min = now.getMinutes() + sec / 60;
  var hr = ((now.getHours() + ckOffset) % 12) + min / 60;
  for (var a = 0; a < 360; a += 3) {
    var rad = a * Math.PI / 180;
    var px = (cx + Math.cos(rad) * r * 1.8) | 0;
    var py = (cy + Math.sin(rad) * r * 0.9) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 0, 0, 25);
  }
  for (var h = 0; h < 12; h++) {
    var a = (h * 30 - 90) * Math.PI / 180;
    var px = (cx + Math.cos(a) * r * 1.6) | 0;
    var py = (cy + Math.sin(a) * r * 0.8) | 0;
    var label = h === 0 ? '12' : '' + h;
    for (var i = 0; i < label.length; i++) {
      var lx = px - (label.length / 2 | 0) + i;
      if (lx >= 0 && lx < W && py >= 0 && py < H) drawCharHSL(label[i], lx, py, 0, 0, 50);
    }
  }
  var ha = (hr * 30 - 90) * Math.PI / 180;
  drawHand(cx, cy, ha, r * 0.5, W, H, '#', 40, 80, 45);
  var ma = (min * 6 - 90) * Math.PI / 180;
  drawHand(cx, cy, ma, r * 0.7, W, H, '|', 210, 70, 45);
  var sa = (sec * 6 - 90) * Math.PI / 180;
  drawHand(cx, cy, sa, r * 0.8, W, H, '.', 0, 90, 50);
  drawCharHSL('@', cx | 0, cy | 0, 0, 0, 60);
  var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  var tx = ((W - timeStr.length) / 2) | 0;
  var ty = ((cy + r * 0.5) | 0) + 2;
  for (var i = 0; i < timeStr.length; i++) {
    if (tx + i >= 0 && tx + i < W && ty >= 0 && ty < H) drawCharHSL(timeStr[i], tx + i, ty, 120, 60, 40);
  }
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function drawHand(cx, cy, angle, len, W, H, ch, hue, sat, light) {
  var steps = (len * 2) | 0;
  for (var i = 0; i <= steps; i++) {
    var f = i / steps;
    var px = (cx + Math.cos(angle) * len * f * 1.8) | 0;
    var py = (cy + Math.sin(angle) * len * f * 0.9) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(ch, px, py, hue, sat, light);
  }
}
registerMode('clock', { render: renderClock });
