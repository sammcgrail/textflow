import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var swirlParts = [];
var NUM_SWIRL = 300;
var attractor1 = { x: 0, y: 0 };
var attractor2 = { x: 0, y: 0 };

function initSwirl() {
  swirlParts = [];
  for (var i = 0; i < NUM_SWIRL; i++) {
    swirlParts.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      life: Math.random(),
      ch: RAMP_DENSE[Math.floor(Math.random() * RAMP_DENSE.length)]
    });
  }
}
// initSwirl(); — called via registerMode
// Swirl interaction: click to add a third attractor at cursor
var swirlClickAttr = null;
function renderSwirl() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Animate attractors in orbits
  attractor1.x = W * 0.5 + Math.cos(state.time * 0.4) * W * 0.25;
  attractor1.y = H * 0.5 + Math.sin(state.time * 0.6) * H * 0.3;
  attractor2.x = W * 0.5 + Math.cos(state.time * 0.3 + 2) * W * 0.3;
  attractor2.y = H * 0.5 + Math.sin(state.time * 0.5 + 2) * H * 0.25;

  // Click creates a strong temporary attractor
  if (pointer.down && state.currentMode === 'swirl') {
    swirlClickAttr = { x: pointer.gx, y: pointer.gy };
  }
  if (!pointer.down) swirlClickAttr = null;

  // Density field for rendering
  var density = new Float32Array(W * H);

  for (var i = 0; i < swirlParts.length; i++) {
    var p = swirlParts[i];

    // Gravity toward attractors with tangential component (swirl)
    var dx1 = attractor1.x - p.x, dy1 = attractor1.y - p.y;
    var d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) + 1;
    var f1 = 2.0 / d1;
    // Tangential = perpendicular to radial
    p.vx += (dx1 / d1 * f1 - dy1 / d1 * f1 * 0.8) * 0.02;
    p.vy += (dy1 / d1 * f1 + dx1 / d1 * f1 * 0.8) * 0.02;

    var dx2 = attractor2.x - p.x, dy2 = attractor2.y - p.y;
    var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) + 1;
    var f2 = 1.5 / d2;
    p.vx += (dx2 / d2 * f2 + dy2 / d2 * f2 * 0.6) * 0.02;
    p.vy += (dy2 / d2 * f2 - dx2 / d2 * f2 * 0.6) * 0.02;

    // Click attractor
    if (swirlClickAttr) {
      var dx3 = swirlClickAttr.x - p.x, dy3 = swirlClickAttr.y - p.y;
      var d3 = Math.sqrt(dx3 * dx3 + dy3 * dy3) + 1;
      var f3 = 4.0 / d3;
      p.vx += (dx3 / d3 * f3 - dy3 / d3 * f3 * 1.2) * 0.02;
      p.vy += (dy3 / d3 * f3 + dx3 / d3 * f3 * 1.2) * 0.02;
    }

    // Damping
    p.vx *= 0.98;
    p.vy *= 0.98;

    // Speed limit
    var spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > 2) { p.vx = p.vx / spd * 2; p.vy = p.vy / spd * 2; }

    p.x += p.vx;
    p.y += p.vy;

    // Wrap
    if (p.x < 0) p.x += W; if (p.x >= W) p.x -= W;
    if (p.y < 0) p.y += H; if (p.y >= H) p.y -= H;

    // Splat onto density field (3x3)
    var gx = p.x | 0, gy = p.y | 0;
    for (var sy = -1; sy <= 1; sy++) {
      for (var sx = -1; sx <= 1; sx++) {
        var nx = (gx + sx + W) % W;
        var ny = (gy + sy + H) % H;
        var dist = Math.abs(sx) + Math.abs(sy);
        var w = dist === 0 ? 1.0 : (dist === 1 ? 0.4 : 0.15);
        density[ny * W + nx] += w * (0.5 + spd * 0.3);
      }
    }
  }

  // Render density field
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = density[y * W + x];
      if (v < 0.1) continue;
      v = Math.min(v * 0.3, 1);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (Math.atan2(y - H / 2, x - W / 2) * 57.3 + state.time * 40 + 360) % 360;
      var sat = 60 + v * 40;
      var lit = 25 + v * 50;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, sat, lit);
    }
  }
}

registerMode('swirl', {
  init: initSwirl,
  render: renderSwirl,
});
