import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var scopeWaves = [];
var scopeTrail;

function initScope() {
  scopeWaves = [{ freqX: 3, freqY: 2, phaseX: 0, phaseY: Math.PI / 2, hue: 120 }];
  scopeTrail = new Float32Array(state.COLS * state.ROWS);
}
// initScope(); — called via registerMode
function renderScope() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!scopeTrail || scopeTrail.length !== W * H) initScope();

  // Click to add a new waveform
  if (pointer.clicked && state.currentMode === 'oscilloscope') {
    pointer.clicked = false;
    scopeWaves.push({
      freqX: 1 + Math.floor(Math.random() * 6),
      freqY: 1 + Math.floor(Math.random() * 6),
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
      hue: (Math.random() * 360) | 0
    });
    if (scopeWaves.length > 8) scopeWaves.shift();
  }

  // Decay trail
  for (var i = 0; i < scopeTrail.length; i++) scopeTrail[i] *= 0.96;

  // Draw grid
  var gridChars = '·';
  for (var y = 0; y < H; y += 4) {
    for (var x = 0; x < W; x += 6) {
      drawChar(gridChars, x, y, 0, 40, 20, 0.3);
    }
  }
  // Axes
  var midY = H / 2 | 0;
  var midX = W / 2 | 0;
  for (var x = 0; x < W; x++) drawChar('-', x, midY, 0, 60, 30, 0.3);
  for (var y = 0; y < H; y++) drawChar('|', midX, y, 0, 60, 30, 0.3);

  // Draw Lissajous curves
  for (var wi = 0; wi < scopeWaves.length; wi++) {
    var w = scopeWaves[wi];
    var steps = 500;
    for (var s = 0; s < steps; s++) {
      var t = (s / steps) * Math.PI * 2;
      var px = Math.sin(t * w.freqX + w.phaseX + state.time * 0.5) * (W * 0.4) + W / 2;
      var py = Math.sin(t * w.freqY + w.phaseY + state.time * 0.3) * (H * 0.4) + H / 2;
      var gx = px | 0, gy = py | 0;
      if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
        scopeTrail[gy * W + gx] = Math.min(1, scopeTrail[gy * W + gx] + 0.15);
      }
    }
    // Slowly drift phase
    w.phaseX += 0.002;
    w.phaseY += 0.003;
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = scopeTrail[y * W + x];
      if (v < 0.03) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      // Phosphor green with brightness
      drawChar(RAMP_DENSE[ri], x, y, 0, (v * 255) | 0, (v * 120) | 0, 0.3 + v * 0.7);
    }
  }
}

registerMode('oscilloscope', {
  init: initScope,
  render: renderScope,
});
