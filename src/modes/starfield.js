import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var sfStars, sfCount, sfW, sfH;
function initStarfield() {
  sfW = state.COLS; sfH = state.ROWS;
  sfCount = state.isMobile ? 300 : 500;
  sfStars = [];
  for (var i = 0; i < sfCount; i++) {
    sfStars.push({
      x: (Math.random() - 0.5) * sfW * 4,
      y: (Math.random() - 0.5) * sfH * 4,
      z: Math.random() * 100 + 1
    });
  }
}
// initStarfield(); — called via registerMode
function renderStarfield() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (sfW !== W || sfH !== H) initStarfield();
  var cx = W * 0.5, cy = H * 0.5;
  var ox = 0, oy = 0;
  if (pointer.down && state.currentMode === 'starfield') {
    ox = (pointer.gx - cx) * 0.5;
    oy = (pointer.gy - cy) * 0.5;
  }
  for (var i = 0; i < sfCount; i++) {
    var s = sfStars[i];
    s.z -= 0.8;
    if (s.z < 1) {
      s.x = (Math.random() - 0.5) * W * 4;
      s.y = (Math.random() - 0.5) * H * 4;
      s.z = 100;
    }
    var px = (s.x + ox) / s.z * 10 + cx;
    var py = (s.y + oy) / s.z * 10 + cy;
    var ix = px | 0, iy = py | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var bright = 1 - s.z / 100;
    var ri = Math.min(RAMP_DENSE.length - 1, (bright * RAMP_DENSE.length) | 0);
    var ch = RAMP_DENSE[ri];
    var b8 = (55 + bright * 200) | 0;
    drawChar(ch, ix, iy, b8, b8, (b8 + 30 > 255 ? 255 : b8 + 30), bright);
  }
}

registerMode('starfield', {
  init: initStarfield,
  render: renderStarfield,
});
