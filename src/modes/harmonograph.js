import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hgTrail;
function initHarmonograph() { hgTrail = []; }
function renderHarmonograph() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!hgTrail) initHarmonograph();
  var t = state.time;
  var f1 = 2.01, f2 = 3.0, f3 = 2.99, f4 = 2.0;
  var p1 = 0, p2 = Math.PI / 2, p3 = 0.1, p4 = Math.PI / 4;
  var d1 = 0.002, d2 = 0.003;
  if (pointer.down && state.currentMode === 'harmonograph') {
    f1 = 1.5 + pointer.gx / W * 3;
    f3 = 1.5 + pointer.gy / H * 3;
  }
  for (var i = 0; i < 5; i++) {
    var tt = t + i * 0.02;
    var x = Math.sin(tt * f1 + p1) * Math.exp(-d1 * tt * 2) + Math.sin(tt * f2 + p2) * Math.exp(-d2 * tt * 2);
    var y = Math.sin(tt * f3 + p3) * Math.exp(-d1 * tt * 2) + Math.sin(tt * f4 + p4) * Math.exp(-d2 * tt * 2);
    // Apply aspect ratio correction — scale x wider since chars are narrow
    var gx = ((x * 0.45 + 0.5) * W) | 0;
    var gy = ((y * 0.45 * ar + 0.5) * H) | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) hgTrail.push({ x: gx, y: gy, t: t });
  }
  while (hgTrail.length > 3000) hgTrail.shift();
  for (var i = 0; i < hgTrail.length; i++) {
    var p = hgTrail[i];
    var age = t - p.t;
    if (age > 10) continue;
    var bright = Math.max(0, 1 - age * 0.1);
    var hue = (p.t * 30) % 360;
    var ch = bright > 0.7 ? '@' : bright > 0.4 ? '*' : '.';
    drawCharHSL(ch, p.x, p.y, hue | 0, 70, (10 + bright * 45) | 0);
  }
}
registerMode('harmonograph', { init: initHarmonograph, render: renderHarmonograph });
