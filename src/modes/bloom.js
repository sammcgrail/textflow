import { RAMP_DENSE, RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var blooms = [];
var bloomTrail;

function initBloom() {
  blooms = [];
  bloomTrail = new Float32Array(state.COLS * state.ROWS);
}
// initBloom(); — called via registerMode
function renderBloom() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!bloomTrail || bloomTrail.length !== W * H) initBloom();

  if (pointer.clicked && state.currentMode === 'bloom') {
    pointer.clicked = false;
    var numP = 30 + Math.floor(Math.random() * 30);
    var hue = (Math.random() * 360) | 0;
    for (var bp = 0; bp < numP; bp++) {
      var angle = (bp / numP) * Math.PI * 2 + Math.random() * 0.3;
      var spd = 0.5 + Math.random() * 1.5;
      blooms.push({
        x: pointer.gx, y: pointer.gy,
        vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd - 0.3,
        life: 3 + Math.random() * 4, born: state.time, hue: hue + Math.random() * 40,
        ch: RAMP_DENSE[Math.floor(Math.random() * RAMP_DENSE.length)]
      });
    }
  }

  // Decay trail
  for (var i = 0; i < bloomTrail.length; i++) bloomTrail[i] *= 0.95;

  // Update particles
  var bi = blooms.length;
  while (bi--) {
    var p = blooms[bi];
    var age = state.time - p.born;
    if (age > p.life) { blooms.splice(bi, 1); continue; }
    p.vy += 0.015; // gravity
    p.vx *= 0.99; p.vy *= 0.99;
    p.x += p.vx; p.y += p.vy;

    var gx = p.x | 0, gy = p.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      var fade = 1 - age / p.life;
      bloomTrail[gy * W + gx] = Math.min(1, bloomTrail[gy * W + gx] + fade * 0.5);
      drawCharHSL(p.ch, gx, gy, p.hue, 70 + fade * 30, 20 + fade * 60);
    }
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = bloomTrail[y * W + x];
      if (v < 0.03) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      drawCharHSL(RAMP_SOFT[ri], x, y, (30 + v * 30) % 360, 60, 10 + v * 30);
    }
  }
}

registerMode('bloom', {
  init: initBloom,
  render: renderBloom,
});
