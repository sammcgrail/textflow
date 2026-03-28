import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var ripples = [];
var rippleField;
var MAX_RIPPLES = 20;

function initRipple() {
  ripples = [];
  rippleField = new Float32Array(state.COLS * state.ROWS);
}
// initRipple(); — called via registerMode

function renderRipple() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Prune old ripples
  var i = ripples.length;
  while (i--) { if (state.time - ripples[i].born > 12) ripples.splice(i, 1); }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      var px = x * 0.55; // aspect ratio correction

      // Base water texture
      sum += Math.sin(x * 0.08 + state.time * 0.5) * 0.1 + Math.sin(y * 0.12 - state.time * 0.3) * 0.08;

      for (var r = 0; r < ripples.length; r++) {
        var rp = ripples[r];
        var age = state.time - rp.born;
        var dx = px - rp.x * 0.55, dy = y - rp.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var radius = age * 4;
        var ringDist = Math.abs(d - radius);
        if (ringDist < 3) {
          var wave = Math.cos(ringDist * 1.5) * rp.strength;
          var fade = Math.max(0, 1 - age / 12);
          var ringFade = 1 - ringDist / 3;
          sum += wave * fade * ringFade * 0.8;
        }
      }

      sum = sum * 0.5 + 0.5;
      if (sum < 0.15 || sum > 0.85) {
        var edge = sum < 0.15 ? sum / 0.15 : (1 - sum) / 0.15;
        if (edge < 0.05) continue;
      }
      var v = Math.abs(sum - 0.5) * 2;
      v = Math.min(1, v * 1.5);
      if (v < 0.05) continue;

      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      var hue = (200 + sum * 40 + state.time * 10) % 360;
      drawCharHSL(RAMP_SOFT[ri], x, y, hue, 60 + v * 40, 20 + v * 50);
    }
  }
}


function attach_ripple() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'ripple') return;
    var g = screenToGrid(e.clientX, e.clientY);
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: g.gx, y: g.gy, born: state.time, strength: 1 });
  });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'ripple') return;
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: g.gx, y: g.gy, born: state.time, strength: 1 });
  }, { passive: false });

}

registerMode('ripple', {
  init: initRipple,
  render: renderRipple,
  attach: attach_ripple,
});
