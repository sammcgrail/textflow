import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var orbitBodies = [];
var orbitTrail;
var orbitCenter = { x: 0, y: 0 };
var MAX_ORBIT_BODIES = 200;
var orbitPointerDown = false;

function initOrbit() {
  orbitBodies = [];
  orbitTrail = new Float32Array(state.COLS * state.ROWS);
  orbitCenter = { x: state.COLS / 2, y: state.ROWS / 2 };
  orbitPointerDown = false;
}
// initOrbit(); — called via registerMode


function renderOrbit() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!orbitTrail || orbitTrail.length !== W * H) initOrbit();

  // Decay trails
  for (var i = 0; i < orbitTrail.length; i++) orbitTrail[i] *= 0.96;

  // Continuous spawn while held
  if (orbitPointerDown && orbitBodies.length < MAX_ORBIT_BODIES) {
    var angle = Math.random() * Math.PI * 2;
    var dist = 1 + Math.random() * 3;
    orbitBodies.push({
      x: orbitCenter.x + Math.cos(angle) * dist,
      y: orbitCenter.y + Math.sin(angle) * dist,
      vx: Math.sin(angle) * 0.8, vy: -Math.cos(angle) * 0.8,
      hue: (state.time * 30 + Math.random() * 60) % 360 | 0
    });
  }

  // Update bodies — orbit around center
  for (var i = 0; i < orbitBodies.length; i++) {
    var b = orbitBodies[i];
    var dx = orbitCenter.x - b.x, dy = orbitCenter.y - b.y;
    var d = Math.sqrt(dx * dx + dy * dy) + 0.5;
    var f = 1.5 / (d * d);
    b.vx += dx / d * f; b.vy += dy / d * f;
    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 2.5) { b.vx = b.vx / spd * 2.5; b.vy = b.vy / spd * 2.5; }
    b.x += b.vx; b.y += b.vy;

    var gx = b.x | 0, gy = b.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      orbitTrail[gy * W + gx] = Math.min(orbitTrail[gy * W + gx] + 0.4, 1);
    }
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = orbitTrail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (260 + v * 60 + state.time * 20) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 20 + v * 55);
    }
  }
}


function attach_orbit() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'orbit') return;
    orbitPointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    orbitCenter.x = g.gx; orbitCenter.y = g.gy;
    // Spawn a burst of particles
    for (var i = 0; i < 15; i++) {
      if (orbitBodies.length >= MAX_ORBIT_BODIES) orbitBodies.shift();
      var angle = Math.random() * Math.PI * 2;
      var dist = 2 + Math.random() * 5;
      orbitBodies.push({
        x: g.gx + Math.cos(angle) * dist,
        y: g.gy + Math.sin(angle) * dist,
        vx: Math.sin(angle) * (0.5 + Math.random() * 0.5),
        vy: -Math.cos(angle) * (0.5 + Math.random() * 0.5),
        hue: (Math.random() * 360) | 0
      });
    }
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!orbitPointerDown || state.currentMode !== 'orbit') return;
    var g = screenToGrid(e.clientX, e.clientY);
    orbitCenter.x = g.gx; orbitCenter.y = g.gy;
  });

  state.canvas.addEventListener('mouseup', function() { if (state.currentMode === 'orbit') orbitPointerDown = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'orbit') return;
    e.preventDefault();
    orbitPointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    orbitCenter.x = g.gx; orbitCenter.y = g.gy;
    for (var i = 0; i < 15; i++) {
      if (orbitBodies.length >= MAX_ORBIT_BODIES) orbitBodies.shift();
      var angle = Math.random() * Math.PI * 2;
      var dist = 2 + Math.random() * 5;
      orbitBodies.push({
        x: g.gx + Math.cos(angle) * dist, y: g.gy + Math.sin(angle) * dist,
        vx: Math.sin(angle) * (0.5 + Math.random() * 0.5),
        vy: -Math.cos(angle) * (0.5 + Math.random() * 0.5),
        hue: (Math.random() * 360) | 0
      });
    }
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!orbitPointerDown || state.currentMode !== 'orbit') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    orbitCenter.x = g.gx; orbitCenter.y = g.gy;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'orbit') orbitPointerDown = false; });

}

registerMode('orbit', {
  init: initOrbit,
  render: renderOrbit,
  attach: attach_orbit,
});
