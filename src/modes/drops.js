import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var drRipples;
function initDrops() { drRipples = []; }
function renderDrops() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!drRipples) initDrops();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'drops') {
    pointer.clicked = false;
    drRipples.push({ x: pointer.gx, y: pointer.gy, birth: t, size: 2 + Math.random() * 3 });
  } else if (pointer.down && state.currentMode === 'drops') {
    if (Math.random() < 0.1) drRipples.push({ x: pointer.gx + (Math.random() - 0.5) * 6, y: pointer.gy + (Math.random() - 0.5) * 4, birth: t, size: 1 + Math.random() * 2 });
  }
  // Random drops
  if (Math.random() < 0.06) {
    drRipples.push({ x: Math.random() * W, y: Math.random() * H, birth: t, size: 1.5 + Math.random() * 3 });
  }
  // Water surface base
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var wave = 0;
      for (var i = 0; i < drRipples.length; i++) {
        var r = drRipples[i];
        var dx = x - r.x, dy = (y - r.y) / ar;
        var d = Math.sqrt(dx * dx + dy * dy);
        var age = t - r.birth;
        var ringR = age * 8 * r.size;
        var dist = Math.abs(d - ringR);
        if (dist < 3) {
          var amp = Math.max(0, 1 - age * 0.3) * Math.max(0, 1 - dist / 3) / (1 + ringR * 0.05);
          wave += Math.sin(d * 2 - age * 10) * amp;
        }
      }
      if (Math.abs(wave) > 0.05) {
        var hue = 200 + wave * 30;
        var bright = 5 + Math.abs(wave) * 35;
        var ch = Math.abs(wave) > 0.4 ? 'O' : Math.abs(wave) > 0.2 ? 'o' : Math.abs(wave) > 0.1 ? '~' : '.';
        drawCharHSL(ch, x, y, hue | 0, 50, bright | 0);
      } else {
        // Subtle water texture
        var n = Math.sin(x * 0.1 + t * 0.3) * Math.sin(y * 0.15 - t * 0.2);
        if (n > 0.3) drawCharHSL('.', x, y, 210, 20, 3);
      }
    }
  }
  // Falling drops (before they hit)
  for (var i = 0; i < drRipples.length; i++) {
    var r = drRipples[i];
    var age = t - r.birth;
    if (age < 0.1) {
      var px = r.x | 0, py = r.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('*', px, py, 200, 80, 40);
    }
  }
  // Cleanup old ripples
  for (var i = drRipples.length - 1; i >= 0; i--) {
    if (t - drRipples[i].birth > 5) drRipples.splice(i, 1);
  }
  if (drRipples.length > 30) drRipples.splice(0, drRipples.length - 30);
}
registerMode('drops', { init: initDrops, render: renderDrops });
