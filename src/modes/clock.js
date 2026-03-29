import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ckTheme = 0, ckShowDate = false;
var themes = [
  { face: 0, hour: 40, min: 210, sec: 0, accent: 120 },
  { face: 200, hour: 60, min: 180, sec: 0, accent: 50 },
  { face: 120, hour: 280, min: 330, sec: 30, accent: 160 },
  { face: 300, hour: 120, min: 60, sec: 200, accent: 280 }
];
function renderClock() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  var cx = W / 2, cy = H / 2;
  var r = Math.min(W * 0.4, H * 0.4);
  var th = themes[ckTheme % themes.length];
  // Click cycles color theme
  if (pointer.clicked && state.currentMode === 'clock') {
    pointer.clicked = false;
    ckTheme = (ckTheme + 1) % themes.length;
    ckShowDate = !ckShowDate;
  } else if (pointer.down && state.currentMode === 'clock') {
    // Drag adjusts clock size
    var dx = pointer.gx - cx, dy = (pointer.gy - cy) / ar;
    r = Math.max(5, Math.min(Math.min(W, H) * 0.48, Math.sqrt(dx * dx + dy * dy)));
  }
  var now = new Date();
  var sec = now.getSeconds() + now.getMilliseconds() / 1000;
  var min = now.getMinutes() + sec / 60;
  var hr = (now.getHours() % 12) + min / 60;
  // Clock face circle
  for (var a = 0; a < 360; a += 2) {
    var rad = a * Math.PI / 180;
    var px = (cx + Math.cos(rad) * r) | 0;
    var py = (cy + Math.sin(rad) * r * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, th.face, 20, 20);
  }
  // Tick marks
  for (var m = 0; m < 60; m++) {
    var a = (m * 6 - 90) * Math.PI / 180;
    var isHour = m % 5 === 0;
    var tr = isHour ? r * 0.88 : r * 0.93;
    var px = (cx + Math.cos(a) * tr) | 0;
    var py = (cy + Math.sin(a) * tr * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(isHour ? '+' : '.', px, py, th.face, 30, isHour ? 30 : 15);
  }
  // Hour markers
  for (var h = 0; h < 12; h++) {
    var a = (h * 30 - 90) * Math.PI / 180;
    var px = (cx + Math.cos(a) * r * 0.78) | 0;
    var py = (cy + Math.sin(a) * r * 0.78 * ar) | 0;
    var label = h === 0 ? '12' : '' + h;
    for (var i = 0; i < label.length; i++) {
      var lx = px - (label.length / 2 | 0) + i;
      if (lx >= 0 && lx < W && py >= 0 && py < H) drawCharHSL(label[i], lx, py, th.face, 30, 50);
    }
  }
  // Hands
  drawHand(cx, cy, (hr * 30 - 90) * Math.PI / 180, r * 0.5, W, H, ar, '#', th.hour, 80, 45);
  drawHand(cx, cy, (min * 6 - 90) * Math.PI / 180, r * 0.7, W, H, ar, '|', th.min, 70, 45);
  drawHand(cx, cy, (sec * 6 - 90) * Math.PI / 180, r * 0.8, W, H, ar, '.', th.sec, 90, 50);
  drawCharHSL('@', cx | 0, cy | 0, th.accent, 60, 60);
  // Digital time display
  var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  var tx = ((W - timeStr.length) / 2) | 0;
  var ty = ((cy + r * ar * 0.5) | 0) + 2;
  for (var i = 0; i < timeStr.length; i++) {
    if (tx + i >= 0 && tx + i < W && ty >= 0 && ty < H) drawCharHSL(timeStr[i], tx + i, ty, th.accent, 60, 40);
  }
  // Date display (toggled by click)
  if (ckShowDate) {
    var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var dateStr = days[now.getDay()] + ' ' + pad(now.getDate()) + '/' + pad(now.getMonth() + 1);
    var dx = ((W - dateStr.length) / 2) | 0;
    var dy = ty + 1;
    for (var i = 0; i < dateStr.length; i++) {
      if (dx + i >= 0 && dx + i < W && dy >= 0 && dy < H) drawCharHSL(dateStr[i], dx + i, dy, th.accent, 40, 30);
    }
  }
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function drawHand(cx, cy, angle, len, W, H, ar, ch, hue, sat, light) {
  var steps = (len * 2) | 0;
  for (var i = 0; i <= steps; i++) {
    var f = i / steps;
    var px = (cx + Math.cos(angle) * len * f) | 0;
    var py = (cy + Math.sin(angle) * len * f * ar) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL(ch, px, py, hue, sat, light);
  }
}
registerMode('clock', { render: renderClock });
