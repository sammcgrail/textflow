import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hbSpeed = 2;
function renderHeartbeat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (pointer.down && state.currentMode === 'heartbeat') {
    hbSpeed = 1 + (pointer.gx / W) * 5;
  }
  var t = state.time * hbSpeed;
  var numTraces = 3;
  var traceH = H / numTraces;
  for (var trace = 0; trace < numTraces; trace++) {
    var yOff = traceH * (trace + 0.5);
    var hue = trace === 0 ? 120 : trace === 1 ? 0 : 60;
    for (var x = 0; x < W; x++) drawCharHSL('-', x, yOff | 0, hue, 20, 8);
    for (var x = 0; x < W; x++) {
      var phase = (x / W * 4 - t + trace * 0.5) % 4;
      if (phase < 0) phase += 4;
      var val = 0;
      if (phase < 1.5) val = Math.sin(phase * Math.PI * 0.5) * 0.08;
      else if (phase < 1.7) val = -0.15;
      else if (phase < 1.9) val = 0.85;
      else if (phase < 2.1) val = -0.35;
      else if (phase < 2.5) val = Math.sin((phase - 2.1) * Math.PI * 2.5) * 0.15;
      else val = Math.sin(phase * 0.5) * 0.03;
      var amplitude = traceH * 0.4;
      var py = (yOff - val * amplitude) | 0;
      if (py >= 0 && py < H) {
        var bright = 25 + Math.abs(val) * 45;
        drawCharHSL(Math.abs(val) > 0.5 ? '#' : Math.abs(val) > 0.1 ? '*' : '-', x, py, hue, 90, bright | 0);
        if (Math.abs(val) > 0.3 && py + 1 < H) drawCharHSL('.', x, py + 1, hue, 60, 15);
      }
    }
    var labels = ['LEAD I', 'LEAD II', 'LEAD III'];
    for (var i = 0; i < labels[trace].length; i++) {
      var ly = (yOff - traceH * 0.35) | 0;
      if (2 + i < W && ly >= 0 && ly < H) drawCharHSL(labels[trace][i], 2 + i, ly, hue, 50, 25);
    }
  }
  var bpm = (hbSpeed * 36) | 0;
  var bpmStr = bpm + ' BPM';
  for (var i = 0; i < bpmStr.length; i++) drawCharHSL(bpmStr[i], W - bpmStr.length - 2 + i, 1, 0, 90, 50);
}
registerMode('heartbeat', { render: renderHeartbeat });
