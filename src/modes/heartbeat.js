import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hbSpeed = 2;
function renderHeartbeat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var midY = H / 2;
  // Click changes heart rate
  if (pointer.clicked && state.currentMode === 'heartbeat') {
    pointer.clicked = false;
    hbSpeed = 1 + (pointer.gx / W) * 5;
  } else if (pointer.down && state.currentMode === 'heartbeat') {
    hbSpeed = 1 + (pointer.gx / W) * 5;
  }
  var t = state.time * hbSpeed;
  for (var trace = 0; trace < 3; trace++) {
    var yOff = midY + (trace - 1) * (H * 0.3);
    var hue = trace === 0 ? 120 : trace === 1 ? 0 : 60;
    for (var x = 0; x < W; x++) {
      var phase = (x / W * 6 - t + trace * 0.5) % 6;
      if (phase < 0) phase += 6;
      var val = 0;
      if (phase < 2) val = Math.sin(phase * Math.PI * 0.5) * 0.1;
      else if (phase < 2.3) val = -0.15;
      else if (phase < 2.5) val = 0.8;
      else if (phase < 2.8) val = -0.3;
      else if (phase < 3.3) val = Math.sin((phase - 2.8) * Math.PI * 2) * 0.2;
      else val = 0;
      var py = (yOff - val * H * 0.3) | 0;
      if (py >= 0 && py < H) {
        var bright = 30 + Math.abs(val) * 40;
        drawCharHSL(val > 0.5 ? '#' : val > 0.1 ? '*' : '-', x, py, hue, 90, bright | 0);
      }
    }
  }
  var bpm = (hbSpeed * 36) | 0;
  var bpmStr = bpm + ' BPM';
  for (var i = 0; i < bpmStr.length; i++) {
    drawCharHSL(bpmStr[i], W - bpmStr.length - 2 + i, 2, 0, 90, 45);
  }
}
registerMode('heartbeat', { render: renderHeartbeat });
