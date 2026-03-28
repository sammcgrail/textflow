import { RAMP_FIRE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var heatGrid, heatW, heatH;
function initHeat() {
  heatW = state.COLS; heatH = state.ROWS;
  heatGrid = new Float32Array(heatW * heatH);
  // Initial heat spots
  for (var i = 0; i < 4; i++) {
    var sx = (Math.random() * heatW * 0.6 + heatW * 0.2) | 0;
    var sy = (Math.random() * heatH * 0.6 + heatH * 0.2) | 0;
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var nx = sx + dx, ny = sy + dy;
        if (nx >= 0 && nx < heatW && ny >= 0 && ny < heatH) {
          heatGrid[ny * heatW + nx] = Math.max(0, 1 - Math.sqrt(dx*dx+dy*dy)/4);
        }
      }
    }
  }
}
// initHeat(); — called via registerMode
function renderHeat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (heatW !== W || heatH !== H) initHeat();
  // Click places heat sources
  if (pointer.down && state.currentMode === 'heat') {
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          heatGrid[ny * W + nx] = Math.min(1, heatGrid[ny * W + nx] + 0.3);
        }
      }
    }
  }
  // Permanent pulsing heat emitters
  var emitters = [
    {x: W * 0.25, y: H * 0.3}, {x: W * 0.75, y: H * 0.7},
    {x: W * 0.5, y: H * 0.5}, {x: W * 0.2, y: H * 0.8}
  ];
  for (var ei = 0; ei < emitters.length; ei++) {
    var ex = emitters[ei].x | 0, ey = emitters[ei].y | 0;
    var pulse = 0.5 + Math.sin(state.time * 1.5 + ei * 1.7) * 0.3;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var nx = ex + dx, ny = ey + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          heatGrid[ny * W + nx] = Math.min(1, heatGrid[ny * W + nx] + pulse * 0.08);
        }
      }
    }
  }
  // Diffuse
  var next = new Float32Array(W * H);
  var alpha = 0.15;
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      var lap = heatGrid[idx - 1] + heatGrid[idx + 1] + heatGrid[idx - W] + heatGrid[idx + W] - 4 * heatGrid[idx];
      next[idx] = heatGrid[idx] + alpha * lap;
      next[idx] *= 0.998; // slow decay
    }
  }
  heatGrid = next;
  // Draw with blue->red->yellow->white colormap
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = heatGrid[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_FIRE.length - 1, (v * RAMP_FIRE.length) | 0);
      var ch = RAMP_FIRE[ri];
      var r, g, b;
      if (v < 0.25) { r = 0; g = 0; b = (v / 0.25) * 255; }
      else if (v < 0.5) { var t2 = (v - 0.25) / 0.25; r = t2 * 255; g = 0; b = (1 - t2) * 255; }
      else if (v < 0.75) { var t2 = (v - 0.5) / 0.25; r = 255; g = t2 * 255; b = 0; }
      else { var t2 = (v - 0.75) / 0.25; r = 255; g = 255; b = t2 * 255; }
      drawChar(ch, x, y, r | 0, g | 0, b | 0, Math.min(1, v * 2));
    }
  }
}

registerMode('heat', {
  init: initHeat,
  render: renderHeat,
});
