import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var pendulums = [];
var pendulumTrail;

function initPendulum() {
  pendulums = [];
  pendulumTrail = new Float32Array(state.COLS * state.ROWS);
}
// initPendulum(); — called via registerMode
function renderPendulum() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pendulumTrail || pendulumTrail.length !== W * H) initPendulum();

  if (pointer.clicked && state.currentMode === 'pendulum') {
    pointer.clicked = false;
    pendulums.push({
      pivotX: pointer.gx, pivotY: pointer.gy,
      len: 5 + Math.random() * 10,
      angle: (Math.random() - 0.5) * Math.PI * 0.8,
      vel: 0,
      hue: (Math.random() * 360) | 0,
      born: state.time
    });
    if (pendulums.length > 20) pendulums.shift();
  }

  // Decay trail
  for (var i = 0; i < pendulumTrail.length; i++) pendulumTrail[i] *= 0.97;

  // Update pendulums
  for (var pi = 0; pi < pendulums.length; pi++) {
    var p = pendulums[pi];
    var age = state.time - p.born;
    // Simple pendulum physics
    var gravity = 0.015;
    p.vel += -gravity * Math.sin(p.angle);
    p.vel *= 0.999; // tiny damping
    p.angle += p.vel;

    // Draw arm and bob
    var bobX = p.pivotX + Math.sin(p.angle) * p.len;
    var bobY = p.pivotY + Math.cos(p.angle) * p.len;

    // Draw arm
    var steps = p.len | 0;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var ax = (p.pivotX + (bobX - p.pivotX) * t) | 0;
      var ay = (p.pivotY + (bobY - p.pivotY) * t) | 0;
      if (ax >= 0 && ax < W && ay >= 0 && ay < H) {
        drawCharHSL('|', ax, ay, p.hue, 40, 25);
      }
    }

    // Bob leaves trail
    var bx = bobX | 0, by = bobY | 0;
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      pendulumTrail[by * W + bx] = 1;
      drawCharHSL('@', bx, by, p.hue, 80, 60);
    }
    // Pivot
    var px = p.pivotX | 0, py = p.pivotY | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('+', px, py, p.hue, 50, 40);
    }
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = pendulumTrail[y * W + x];
      if (v < 0.03) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      drawCharHSL(RAMP_SOFT[ri], x, y, (30 + v * 30) % 360, 60, 10 + v * 35);
    }
  }
}

registerMode('pendulum', {
  init: initPendulum,
  render: renderPendulum,
});
