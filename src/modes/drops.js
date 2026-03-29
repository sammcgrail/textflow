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
    for (var i = 0; i < 5; i++) drRipples.push({ x: pointer.gx + (Math.random() - 0.5) * 8, y: pointer.gy + (Math.random() - 0.5) * 5, birth: t + i * 0.1, size: 2 + Math.random() * 3 });
  } else if (pointer.down && state.currentMode === 'drops') {
    if (Math.random() < 0.15) drRipples.push({ x: pointer.gx + (Math.random() - 0.5) * 6, y: pointer.gy + (Math.random() - 0.5) * 4, birth: t, size: 1 + Math.random() * 2 });
  }
  // Auto-drops — varied positions
  if (Math.random() < 0.12) {
    drRipples.push({ x: Math.random() * W, y: Math.random() * H, birth: t, size: 1 + Math.random() * 3 });
  }
  // Water surface + ripples combined
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var wave = 0;
      for (var i = 0; i < drRipples.length; i++) {
        var r = drRipples[i];
        var age = t - r.birth;
        if (age < 0) continue;
        var dx = x - r.x, dy = (y - r.y) / ar;
        var d = Math.sqrt(dx * dx + dy * dy);
        var ringR = age * 6 * r.size;
        var dist = Math.abs(d - ringR);
        if (dist < 4) {
          var amp = Math.max(0, 1 - age * 0.25) * Math.max(0, 1 - dist / 4) / (1 + ringR * 0.04);
          wave += Math.sin(d * 1.5 - age * 8) * amp * r.size * 0.5;
        }
      }
      if (Math.abs(wave) > 0.03) {
        var hue = 200 + wave * 30;
        var bright = 4 + Math.abs(wave) * 40;
        var ch = Math.abs(wave) > 0.5 ? 'O' : Math.abs(wave) > 0.3 ? 'o' : Math.abs(wave) > 0.15 ? '~' : '.';
        drawCharHSL(ch, x, y, hue | 0, 50, Math.min(50, bright) | 0);
      } else {
        var n = Math.sin(x * 0.08 + t * 0.2) * Math.sin(y * 0.12 - t * 0.15);
        if (n > 0.2) drawCharHSL('.', x, y, 210, 20, 3);
      }
    }
  }
  // Impact splashes
  for (var i = 0; i < drRipples.length; i++) {
    var r = drRipples[i];
    var age = t - r.birth;
    if (age >= 0 && age < 0.15) {
      var px = r.x | 0, py = r.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('*', px, py, 200, 80, 45);
      // Splash droplets
      for (var d = 0; d < 4; d++) {
        var sa = d * Math.PI / 2 + age * 5;
        var sr = age * 15;
        var sx = (r.x + Math.cos(sa) * sr) | 0, sy = (r.y + Math.sin(sa) * sr * ar) | 0;
        if (sx >= 0 && sx < W && sy >= 0 && sy < H) drawCharHSL('.', sx, sy, 200, 70, 30);
      }
    }
  }
  // Cleanup
  for (var i = drRipples.length - 1; i >= 0; i--) {
    if (t - drRipples[i].birth > 5) drRipples.splice(i, 1);
  }
  if (drRipples.length > 40) drRipples.splice(0, drRipples.length - 40);
}
registerMode('drops', { init: initDrops, render: renderDrops });
