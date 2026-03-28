import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { fbm } from '../core/noise.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var pulseRings = [];
var MAX_PULSE_RINGS = 15;
var pulsePointerDown = false;
var pulsePointerX = 0, pulsePointerY = 0;
var pulseSpawnTimer2 = 0;

function initPulse() {
  pulseRings = [];
  pulsePointerDown = false;
}
// initPulse(); — called via registerMode


function renderPulse() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Continuous emit while held
  if (pulsePointerDown) {
    pulseSpawnTimer2++;
    if (pulseSpawnTimer2 % 15 === 0) {
      if (pulseRings.length >= MAX_PULSE_RINGS) pulseRings.shift();
      pulseRings.push({ x: pulsePointerX, y: pulsePointerY, born: state.time, strength: 1 });
    }
  }

  // Prune old
  var i = pulseRings.length;
  while (i--) { if (state.time - pulseRings[i].born > 10) pulseRings.splice(i, 1); }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var px = x * 0.55;
      // Base noise terrain that pulses reveal
      var terrain = fbm(x * 0.04, y * 0.06, 3) * 0.5 + 0.5;
      var totalPulse = 0;

      for (var r = 0; r < pulseRings.length; r++) {
        var ring = pulseRings[r];
        var age = state.time - ring.born;
        var dx = px - ring.x * 0.55, dy = y - ring.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var radius = age * 5;
        var ringWidth = 2 + age * 0.5;
        var ringDist = Math.abs(d - radius);
        if (ringDist < ringWidth) {
          var fade = Math.max(0, 1 - age / 10);
          var ringFade = 1 - ringDist / ringWidth;
          totalPulse += ring.strength * fade * ringFade;
        }
        // Also illuminate inside the ring (sonar reveal)
        if (d < radius) {
          var innerFade = Math.max(0, 1 - age / 10) * 0.15;
          totalPulse += innerFade * terrain;
        }
      }

      if (totalPulse < 0.05) continue;
      totalPulse = Math.min(1, totalPulse);

      var v = totalPulse * terrain + totalPulse * 0.3;
      v = Math.min(1, v);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (160 + terrain * 40 + totalPulse * 60) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 15 + v * 55);
    }
  }
}


function attach_pulse() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'pulse') return;
    pulsePointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    pulsePointerX = g.gx; pulsePointerY = g.gy;
    if (pulseRings.length >= MAX_PULSE_RINGS) pulseRings.shift();
    pulseRings.push({ x: g.gx, y: g.gy, born: state.time, strength: 1.5 });
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!pulsePointerDown || state.currentMode !== 'pulse') return;
    var g = screenToGrid(e.clientX, e.clientY);
    pulsePointerX = g.gx; pulsePointerY = g.gy;
  });

  state.canvas.addEventListener('mouseup', function() { if (state.currentMode === 'pulse') pulsePointerDown = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'pulse') return;
    e.preventDefault();
    pulsePointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    pulsePointerX = g.gx; pulsePointerY = g.gy;
    if (pulseRings.length >= MAX_PULSE_RINGS) pulseRings.shift();
    pulseRings.push({ x: g.gx, y: g.gy, born: state.time, strength: 1.5 });
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!pulsePointerDown || state.currentMode !== 'pulse') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    pulsePointerX = g.gx; pulsePointerY = g.gy;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'pulse') pulsePointerDown = false; });

}

registerMode('pulse', {
  init: initPulse,
  render: renderPulse,
  attach: attach_pulse,
});
