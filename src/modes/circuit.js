import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var circGrid, circW, circH, circTraces, circNodes;
function initCircuit() {
  circW = state.COLS; circH = state.ROWS;
  circGrid = new Uint8Array(circW * circH);
  circNodes = new Float32Array(circW * circH);
  circTraces = [];
  // Spawn initial traces
  for (var i = 0; i < 8; i++) {
    circTraces.push({
      x: (Math.random() * circW) | 0,
      y: (Math.random() * circH) | 0,
      dx: Math.random() < 0.5 ? 1 : 0,
      dy: Math.random() < 0.5 ? 1 : 0,
      life: 20 + (Math.random() * 40) | 0,
      hue: (Math.random() * 360) | 0
    });
    if (circTraces[circTraces.length - 1].dx === 0 && circTraces[circTraces.length - 1].dy === 0) circTraces[circTraces.length - 1].dx = 1;
  }
}
// initCircuit(); — called via registerMode
function renderCircuit() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (circW !== W || circH !== H) initCircuit();
  // Add trace on click
  if (pointer.clicked && state.currentMode === 'circuit') {
    pointer.clicked = false;
    circTraces.push({
      x: pointer.gx | 0, y: pointer.gy | 0,
      dx: Math.random() < 0.5 ? 1 : -1, dy: 0,
      life: 20 + (Math.random() * 40) | 0,
      hue: (Math.random() * 360) | 0
    });
  }
  // Decay node blinks
  for (var i = 0; i < circNodes.length; i++) circNodes[i] *= 0.98;
  // Grow traces
  var steps = Math.min(circTraces.length, 6);
  for (var s = 0; s < steps; s++) {
    if (circTraces.length === 0) break;
    var idx = (Math.random() * circTraces.length) | 0;
    var t = circTraces[idx];
    t.x += t.dx; t.y += t.dy; t.life--;
    if (t.x < 0 || t.x >= W || t.y < 0 || t.y >= H || t.life <= 0) {
      circTraces.splice(idx, 1); continue;
    }
    circGrid[t.y * W + t.x] = 1;
    // Turn 90 degrees randomly
    if (Math.random() < 0.15) {
      circNodes[t.y * W + t.x] = 1;
      if (t.dx !== 0) { t.dy = Math.random() < 0.5 ? 1 : -1; t.dx = 0; }
      else { t.dx = Math.random() < 0.5 ? 1 : -1; t.dy = 0; }
      // Fork
      if (Math.random() < 0.3) {
        circTraces.push({ x: t.x, y: t.y, dx: -t.dx || (Math.random() < 0.5 ? 1 : -1), dy: -t.dy || (Math.random() < 0.5 ? 1 : -1), life: 10 + (Math.random() * 20) | 0, hue: t.hue });
      }
    }
  }
  // Draw grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (!circGrid[y * W + x]) continue;
      var node = circNodes[y * W + x];
      var ch = node > 0.5 ? 'O' : (node > 0.1 ? '+' : '-');
      var blink = node > 0.5 ? Math.sin(state.time * 10 + x + y) * 0.5 + 0.5 : 0;
      drawChar(ch, x, y, 0, (120 + blink * 135) | 0, (80 + blink * 80) | 0, 0.6 + node * 0.4);
    }
  }
}

registerMode('circuit', {
  init: initCircuit,
  render: renderCircuit,
});
