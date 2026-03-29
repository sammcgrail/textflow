import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var wfFreq = 3, wfAmp = 0.8;
function renderWaveform() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'waveform') {
    pointer.clicked = false;
    wfFreq = 1 + Math.random() * 8;
  } else if (pointer.down && state.currentMode === 'waveform') {
    wfFreq = 1 + (pointer.gx / W) * 10;
    wfAmp = 0.2 + (1 - pointer.gy / H) * 1.2;
  }
  var bands = 5;
  var bandH = H / bands;
  var colors = [0, 120, 200, 300, 50];
  for (var b = 0; b < bands; b++) {
    var cy = bandH * (b + 0.5);
    var freq = wfFreq * (1 + b * 0.5);
    var amp = wfAmp * bandH * 0.35;
    // Center line
    for (var x = 0; x < W; x++) {
      var ly = cy | 0;
      if (ly >= 0 && ly < H) drawCharHSL('-', x, ly, colors[b], 20, 5);
    }
    // Waveform
    for (var x = 0; x < W; x++) {
      var phase = x / W * Math.PI * 2 * freq - t * 3;
      var v = Math.sin(phase) * wfAmp;
      v += Math.sin(phase * 2.5 + t) * 0.3;
      v += Math.sin(phase * 0.5 - t * 0.7) * 0.2;
      var py = (cy - v * amp) | 0;
      if (py >= 0 && py < H) {
        var bright = 20 + Math.abs(v) * 35;
        var ch = Math.abs(v) > 0.7 ? '#' : Math.abs(v) > 0.3 ? '*' : '.';
        drawCharHSL(ch, x, py, colors[b], 80, bright | 0);
        // Fill between center and wave
        var startY = Math.min(cy, py) | 0, endY = Math.max(cy, py) | 0;
        for (var fy = startY; fy <= endY; fy++) {
          if (fy >= 0 && fy < H && fy !== py) {
            drawCharHSL(':', x, fy, colors[b], 40, 6);
          }
        }
      }
    }
    // Band label
    var label = (freq * 100 | 0) + 'Hz';
    for (var i = 0; i < label.length; i++) {
      var ly = (cy - bandH * 0.4) | 0;
      if (1 + i < W && ly >= 0 && ly < H) drawCharHSL(label[i], 1 + i, ly, colors[b], 50, 18);
    }
  }
}
registerMode('waveform', { render: renderWaveform });
