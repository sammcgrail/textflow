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

  // Number of curtains at different "depths"
  var curtains = [
    { hue: 120, phase: 0, depth: 1.0, freq: 2.5, amp: 0.15, speed: 0.4 },
    { hue: 270, phase: 1.2, depth: 0.7, freq: 3.0, amp: 0.12, speed: 0.3 },
    { hue: 200, phase: 2.5, depth: 0.5, freq: 2.0, amp: 0.18, speed: 0.5 },
    { hue: 330, phase: 3.8, depth: 0.3, freq: 3.5, amp: 0.10, speed: 0.35 },
    { hue: 150, phase: 5.0, depth: 0.15, freq: 2.8, amp: 0.14, speed: 0.45 }
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

        // Curtain wave shape - vertical ribbons that wave horizontally
        var wave = Math.sin(nx * cur.freq * Math.PI + t * cur.speed + cur.phase);
        wave += Math.sin(nx * cur.freq * 1.7 * Math.PI + t * cur.speed * 0.7 + cur.phase * 1.3) * 0.5;
        wave *= cur.amp;

        // Curtain is brightest at top, fading down
        var curtainY = 0.1 + wave + ny * 0.05;
        var distFromCurtain = Math.abs(ny - curtainY);

        // Vertical falloff - aurora hangs from top
        var vertFade = Math.exp(-distFromCurtain * 4) * (1 - ny * 0.6);

        // Shimmer
        var shimmer = Math.sin(nx * 20 + ny * 10 + t * 3 + cur.phase) * 0.15 + 0.85;

        var intensity = vertFade * shimmer * cur.depth;

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
        var sat = 85 + totalLight * 15;
        var light = 12 + totalLight * 55;

        // Random bright flickers
        if (Math.random() < totalLight * 0.02) {
          light += 15;
        }

        var ci = (totalLight * (RAMP_DENSE.length - 2) + 1) | 0;
        ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));
        drawCharHSL(RAMP_DENSE[ci], x, y, hue, Math.min(sat, 100), Math.min(light, 75));
      } else {
        // Dark sky with faint stars
        if (Math.random() < 0.003) {
          drawCharHSL('.', x, y, 220, 20, 30);
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
