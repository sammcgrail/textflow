import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var gravParticles = [];
var gravWells = [];
var NUM_GRAV_PARTICLES = 500;
var MAX_GRAV_WELLS = 12;
var gravPointerDown = false;
var gravPointerX = 0, gravPointerY = 0;

function initGravity() {
  gravParticles = [];
  gravWells = [];
  gravPointerDown = false;
  for (var i = 0; i < NUM_GRAV_PARTICLES; i++) {
    gravParticles.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
      ch: RAMP_DENSE[Math.floor(Math.random() * RAMP_DENSE.length)]
    });
  }
}
// initGravity(); — called via registerMode


function renderGravity() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var trail = new Float32Array(W * H);

  // Decay old wells
  var i = gravWells.length;
  while (i--) {
    var age = state.time - gravWells[i].born;
    if (age > 20 && !gravPointerDown) { gravWells[i].str *= 0.99; if (gravWells[i].str < 0.05) gravWells.splice(i, 1); }
  }

  // Update particles
  for (var i = 0; i < gravParticles.length; i++) {
    var p = gravParticles[i];
    for (var j = 0; j < gravWells.length; j++) {
      var w = gravWells[j];
      var dx = w.x - p.x, dy = w.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy) + 1;
      var f = w.str / (d * d) * 0.5;
      p.vx += dx / d * f;
      p.vy += dy / d * f;
    }
    // Slight orbit tendency
    var spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > 2) { p.vx = p.vx / spd * 2; p.vy = p.vy / spd * 2; }
    p.vx *= 0.995; p.vy *= 0.995;
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x += W; if (p.x >= W) p.x -= W;
    if (p.y < 0) p.y += H; if (p.y >= H) p.y -= H;

    var gx = p.x | 0, gy = p.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      trail[gy * W + gx] = Math.min(trail[gy * W + gx] + 0.3 + spd * 0.2, 1);
    }
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = trail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (200 + v * 60 + state.time * 15) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + v * 30, 20 + v * 55);
    }
  }

  // Draw wells as bright centers
  for (var j = 0; j < gravWells.length; j++) {
    var w = gravWells[j];
    var wx = w.x | 0, wy = w.y | 0;
    if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
      drawChar('@', wx, wy, 200, 230, 255, Math.min(1, w.str));
    }
  }
}


function attach_gravity() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'gravity') return;
    gravPointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    gravPointerX = g.gx; gravPointerY = g.gy;
    if (gravWells.length >= MAX_GRAV_WELLS) gravWells.shift();
    gravWells.push({ x: g.gx, y: g.gy, str: 0.5, born: state.time });
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!gravPointerDown || state.currentMode !== 'gravity') return;
    var g = screenToGrid(e.clientX, e.clientY);
    gravPointerX = g.gx; gravPointerY = g.gy;
    // Strengthen latest well while held
    if (gravWells.length > 0) {
      var w = gravWells[gravWells.length - 1];
      w.str = Math.min(w.str + 0.02, 5);
    }
  });

  state.canvas.addEventListener('mouseup', function() { gravPointerDown = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'gravity') return;
    e.preventDefault();
    gravPointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    gravPointerX = g.gx; gravPointerY = g.gy;
    if (gravWells.length >= MAX_GRAV_WELLS) gravWells.shift();
    gravWells.push({ x: g.gx, y: g.gy, str: 0.5, born: state.time });
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!gravPointerDown || state.currentMode !== 'gravity') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    gravPointerX = g.gx; gravPointerY = g.gy;
    if (gravWells.length > 0) gravWells[gravWells.length - 1].str = Math.min(gravWells[gravWells.length - 1].str + 0.02, 5);
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'gravity') gravPointerDown = false; });

}

registerMode('gravity', {
  init: initGravity,
  render: renderGravity,
  attach: attach_gravity,
});
