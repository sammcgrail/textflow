import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var mbBalls;
function initMetaball() {
  mbBalls = [];
  for (var i = 0; i < 6; i++) {
    mbBalls.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      r: 3 + Math.random() * 5
    });
  }
}
function renderMetaball() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!mbBalls) initMetaball();
  for (var i = 0; i < mbBalls.length; i++) {
    var b = mbBalls[i];
    b.x += b.vx; b.y += b.vy;
    if (b.x < 0 || b.x >= W) b.vx *= -1;
    if (b.y < 0 || b.y >= H) b.vy *= -1;
  }
  if (pointer.down && state.currentMode === 'metaball') {
    mbBalls[0].x += (pointer.gx - mbBalls[0].x) * 0.1;
    mbBalls[0].y += (pointer.gy - mbBalls[0].y) * 0.1;
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      for (var i = 0; i < mbBalls.length; i++) {
        var dx = x - mbBalls[i].x, dy = (y - mbBalls[i].y) * 2;
        var d2 = dx * dx + dy * dy;
        sum += (mbBalls[i].r * mbBalls[i].r) / (d2 + 1);
      }
      if (sum < 0.3) continue;
      var v = Math.min(1, sum * 0.5);
      var ci = (v * (RAMP_DENSE.length - 1)) | 0;
      var hue = (sum * 60 + state.time * 30) % 360;
      drawCharHSL(RAMP_DENSE[ci], x, y, hue | 0, 70, (15 + v * 40) | 0);
    }
  }
}
registerMode('metaball', { init: initMetaball, render: renderMetaball });
