import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var a3W, a3H, a3Flare;

function initAurora3d() {
  a3W = state.COLS; a3H = state.ROWS;
  a3Flare = [];
}

function renderAurora3d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (a3W !== W || a3H !== H) initAurora3d();
  var t = state.time * 0.001;

  if (pointer.clicked && state.currentMode === 'aurora3d') {
    pointer.clicked = false;
    a3Flare.push({ x: pointer.gx, t: 0 });
  }

  // Curtains at different "depths" — far ones dimmer & smaller, near ones bright & sweeping.
  // centerY = vertical anchor (0=top, 1=bottom). spread = how tall the curtain is (smaller = tighter band).
  var curtains = [
    { hue: 120, phase: 0.0, depth: 1.00, freq: 1.5, amp: 0.20, speed: 0.55, centerY: 0.28, spread: 0.55 },
    { hue: 160, phase: 1.2, depth: 0.70, freq: 2.2, amp: 0.16, speed: 0.40, centerY: 0.35, spread: 0.45 },
    { hue: 270, phase: 2.4, depth: 0.55, freq: 1.8, amp: 0.14, speed: 0.70, centerY: 0.32, spread: 0.40 },
    { hue: 200, phase: 3.7, depth: 0.40, freq: 2.6, amp: 0.12, speed: 0.50, centerY: 0.40, spread: 0.35 },
    { hue: 330, phase: 4.9, depth: 0.25, freq: 3.2, amp: 0.10, speed: 0.85, centerY: 0.38, spread: 0.30 }
  ];

  // Fill entire screen with dark sky base
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x / W;
      var ny = y / H;

      var totalLight = 0;
      var totalHue = 0;
      var totalWeight = 0;

      for (var c = 0; c < curtains.length; c++) {
        var cur = curtains[c];

        // Horizontal flow over time — curtains DRIFT sideways, not just oscillate
        var flowX = nx + t * cur.speed * 0.08 * (c % 2 === 0 ? 1 : -1);

        // Curtain wave shape — multi-octave for organic motion
        var wave = Math.sin(flowX * cur.freq * Math.PI * 2 + t * cur.speed + cur.phase);
        wave += Math.sin(flowX * cur.freq * 1.7 * Math.PI * 2 + t * cur.speed * 0.7 + cur.phase * 1.3) * 0.55;
        wave += Math.sin(flowX * cur.freq * 0.6 * Math.PI * 2 + t * cur.speed * 0.3 + cur.phase * 2.1) * 0.35;
        wave *= cur.amp;

        // Curtain Y center anchored higher up, with strong horizontal wave displacement
        var curtainY = cur.centerY + wave;
        var distFromCurtain = Math.abs(ny - curtainY);

        // Vertical falloff — exponential decay rate scaled by spread.
        // Asymmetric: brighter "tail" trails DOWN (aurora hangs), dimmer above.
        var below = ny > curtainY ? 1.0 : 0.35;
        var fadeRate = 1.0 / cur.spread;
        // Global atmosphere fade — kills aurora in lower 40% of sky
        var atmosphere = Math.max(0, 1 - Math.max(0, ny - 0.25) * 1.6);
        var vertFade = Math.exp(-distFromCurtain * fadeRate) * below * atmosphere;

        // Vertical streaks — bright filaments inside the curtain
        var streak = Math.sin(flowX * 18 * Math.PI + t * cur.speed * 1.2 + cur.phase * 3) * 0.25 + 0.75;

        // Fast shimmer
        var shimmer = Math.sin(nx * 30 + ny * 14 + t * 4 + cur.phase) * 0.20 + 0.80;

        var intensity = vertFade * shimmer * streak * cur.depth;

        if (intensity > 0.01) {
          totalHue += cur.hue * intensity;
          totalLight += intensity;
          totalWeight += intensity;
        }
      }

      // Solar flare pulses
      for (var f = 0; f < a3Flare.length; f++) {
        var fl = a3Flare[f];
        var fdist = Math.abs(x - fl.x);
        var fwave = Math.exp(-fdist * 0.05) * Math.exp(-fl.t * 2) * (1 - ny * 0.8);
        if (fwave > 0.01) {
          totalLight += fwave * 0.8;
          totalHue += 60 * fwave; // warm yellow flash
          totalWeight += fwave;
        }
      }

      if (totalWeight > 0.01) {
        var hue = (totalHue / totalWeight) % 360;
        var sat = 80 + totalLight * 20;
        var light = 18 + totalLight * 60;

        // Random bright flickers
        if (Math.random() < totalLight * 0.04) {
          light += 18;
        }

        var ci = (totalLight * 1.2 * (RAMP_DENSE.length - 2) + 1) | 0;
        ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));
        drawCharHSL(RAMP_DENSE[ci], x, y, hue, Math.min(sat, 100), Math.min(light, 82));
      } else {
        // Dark sky with faint stars (denser at top, sparser low)
        var starChance = 0.005 * (1 - ny * 0.7);
        if (Math.random() < starChance) {
          var twinkle = Math.sin(t * 4 + x * 7 + y * 11) * 0.5 + 0.5;
          drawCharHSL('.', x, y, 220, 20, 25 + twinkle * 25);
        }
      }
    }
  }

  // Update flares
  for (var i = a3Flare.length - 1; i >= 0; i--) {
    a3Flare[i].t += 0.016;
    if (a3Flare[i].t > 3) a3Flare.splice(i, 1);
  }

  // Drag interaction: pull aurora curtains toward pointer
  if (pointer.down && state.currentMode === 'aurora3d') {
    var pr = 6;
    for (var dy = -pr; dy <= pr; dy++) {
      for (var dx = -pr; dx <= pr; dx++) {
        var px = (pointer.gx | 0) + dx, py = (pointer.gy | 0) + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          var dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < pr) {
            var bl = 50 + (1 - dd / pr) * 25;
            drawCharHSL('=', px, py, 120, 90, bl);
          }
        }
      }
    }
  }
}

registerMode('aurora3d', {
  init: initAurora3d,
  render: renderAurora3d,
});
