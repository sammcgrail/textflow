import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var p3W, p3H, p3Perturb;

function initPlasma3d() {
  p3W = state.COLS; p3H = state.ROWS;
  p3Perturb = [];
}

function renderPlasma3d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (p3W !== W || p3H !== H) initPlasma3d();
  var t = state.time * 0.001;

  if (pointer.clicked && state.currentMode === 'plasma3d') {
    pointer.clicked = false;
    p3Perturb.push({ x: pointer.gx, y: pointer.gy, t: 0 });
  }

  // Drag perturbation
  if (pointer.down && state.currentMode === 'plasma3d') {
    if (Math.random() < 0.3) {
      p3Perturb.push({ x: pointer.gx, y: pointer.gy, t: 0 });
    }
  }

  // Fill every cell with plasma
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x / W * 6;
      var ny = y / H * 6;

      // Overlapping sine waves creating plasma
      var v = 0;
      v += Math.sin(nx + t * 1.3);
      v += Math.sin(ny + t * 0.7);
      v += Math.sin((nx + ny) * 0.7 + t * 0.9);
      v += Math.sin(Math.sqrt(nx * nx + ny * ny) * 1.5 + t * 1.1);
      v += Math.sin(nx * 1.3 - ny * 0.8 + t * 1.5) * 0.8;
      v += Math.cos(nx * 0.5 + ny * 1.7 + t * 0.6) * 0.7;

      // Perturbation from clicks
      for (var p = 0; p < p3Perturb.length; p++) {
        var pt = p3Perturb[p];
        var pdx = x - pt.x, pdy = y - pt.y;
        var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        var pwave = Math.sin(pdist * 0.5 - pt.t * 8) * Math.exp(-pdist * 0.05) * Math.exp(-pt.t * 0.5);
        v += pwave * 3;
      }

      v /= 4.5;
      var norm = v * 0.5 + 0.5; // 0 to 1
      norm = Math.max(0, Math.min(1, norm));

      // Rainbow hue cycling
      var hue = (norm * 360 + t * 40) % 360;
      var sat = 90 + norm * 10;

      // Height-map effect: higher = brighter
      var height = norm;
      var light = 25 + height * 45;

      // Extra brightness for peaks
      if (height > 0.75) {
        light += (height - 0.75) * 60;
        sat -= (height - 0.75) * 40;
      }

      // Character from height
      var ci = (height * (RAMP_DENSE.length - 1)) | 0;
      ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));

      drawCharHSL(RAMP_DENSE[ci], x, y, hue, Math.min(sat, 100), Math.min(light, 78));
    }
  }

  // Update perturbations
  for (var i = p3Perturb.length - 1; i >= 0; i--) {
    p3Perturb[i].t += 0.016;
    if (p3Perturb[i].t > 4) p3Perturb.splice(i, 1);
  }
  if (p3Perturb.length > 10) p3Perturb.splice(0, p3Perturb.length - 10);
}

registerMode('plasma3d', {
  init: initPlasma3d,
  render: renderPlasma3d,
});
