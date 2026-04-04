import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var nW, nH, stars, novaFlashes;

function initNebula() {
  nW = state.COLS; nH = state.ROWS;
  stars = [];
  novaFlashes = [];
  var count = state.isMobile ? 120 : 300;
  for (var i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * nW,
      y: Math.random() * nH,
      depth: Math.random(),
      twinkle: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 3
    });
  }
}

function renderNebula() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (nW !== W || nH !== H) initNebula();
  var t = state.time * 0.001;

  if (pointer.clicked && state.currentMode === 'nebula') {
    pointer.clicked = false;
    novaFlashes.push({ x: pointer.gx, y: pointer.gy, t: 0, max: 1.5 });
  }

  // Draw nebula gas cloud - fill every cell
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x / W;
      var ny = y / H;

      // Multiple overlapping wave layers for cloud structure
      var v1 = Math.sin(nx * 6 + t * 0.3) * Math.cos(ny * 4 + t * 0.2);
      var v2 = Math.sin((nx + ny) * 5 + t * 0.4) * Math.cos(nx * 3 - t * 0.15);
      var v3 = Math.sin(nx * 8 - t * 0.25) * Math.sin(ny * 7 + t * 0.35);
      var v4 = Math.cos((nx - ny) * 9 + t * 0.5) * Math.sin(nx * 2 + ny * 3 + t * 0.1);

      var val = (v1 + v2 + v3 + v4) * 0.25; // -1 to 1
      var norm = val * 0.5 + 0.5; // 0 to 1

      // Color: blend between pink (330), blue (220), purple (270)
      var hue;
      if (norm < 0.33) hue = 220 + norm * 3 * 50; // blue to purple
      else if (norm < 0.66) hue = 270 + (norm - 0.33) * 3 * 60; // purple to pink
      else hue = 330 + (norm - 0.66) * 3 * 30; // pink to red

      var sat = 80 + norm * 20;
      var light = 15 + norm * 30;

      // Nova flash brightening
      for (var f = 0; f < novaFlashes.length; f++) {
        var fl = novaFlashes[f];
        var fdx = x - fl.x, fdy = y - fl.y;
        var fd = Math.sqrt(fdx * fdx + fdy * fdy);
        var frad = fl.t * 30;
        var fring = Math.abs(fd - frad);
        if (fring < 5) {
          var boost = (1 - fring / 5) * (1 - fl.t / fl.max) * 35;
          light += boost;
        }
      }

      var ci = (norm * (RAMP_DENSE.length - 2) + 1) | 0;
      ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));
      drawCharHSL(RAMP_DENSE[ci], x, y, hue % 360, sat, Math.min(light, 75));
    }
  }

  // Draw stars on top
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.twinkle += 0.02 * s.speed;
    var tw = Math.sin(s.twinkle) * 0.5 + 0.5;
    var ix = s.x | 0, iy = s.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var depth = s.depth;
      var ch = depth > 0.7 ? '*' : (depth > 0.4 ? '+' : '.');
      var sl = 50 + depth * 25 + tw * 15;
      var sh = depth > 0.5 ? 40 : 200; // warm or cool stars
      drawCharHSL(ch, ix, iy, sh, 20 + depth * 30, Math.min(sl, 80));
    }
  }

  // Update nova flashes
  for (var i = novaFlashes.length - 1; i >= 0; i--) {
    novaFlashes[i].t += 0.016;
    if (novaFlashes[i].t > novaFlashes[i].max) novaFlashes.splice(i, 1);
  }

  // Drag interaction: brighten area around pointer
  if (pointer.down && state.currentMode === 'nebula') {
    var pr = 5;
    for (var dy = -pr; dy <= pr; dy++) {
      for (var dx = -pr; dx <= pr; dx++) {
        var px = (pointer.gx | 0) + dx, py = (pointer.gy | 0) + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          var dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < pr) {
            var bl = 65 + (1 - dd / pr) * 20;
            drawCharHSL('*', px, py, 50, 30, bl);
          }
        }
      }
    }
  }
}

registerMode('nebula', {
  init: initNebula,
  render: renderNebula,
});
