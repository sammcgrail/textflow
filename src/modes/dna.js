import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var dnaW, dnaH, dnaRotSpeed;
function initDna() { dnaW = state.COLS; dnaH = state.ROWS; dnaRotSpeed = 2; }
// initDna(); — called via registerMode
function renderDna() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (dnaW !== W || dnaH !== H) initDna();
  var cx = W * 0.5;
  var amplitude = Math.min(W * 0.3, 20);
  if (pointer.down && state.currentMode === 'dna') {
    dnaRotSpeed = 0.5 + (pointer.gx / W) * 5;
  }
  var bases = 'ATGC';
  var colors = [[255,80,80],[80,80,255],[80,255,80],[255,200,80]];
  for (var y = 0; y < H; y++) {
    var phase = y * 0.3 + state.time * dnaRotSpeed;
    var x1 = cx + Math.sin(phase) * amplitude;
    var x2 = cx + Math.sin(phase + Math.PI) * amplitude;
    var depth1 = Math.cos(phase);
    var depth2 = Math.cos(phase + Math.PI);
    // Base pair connection
    var lx = Math.min(x1, x2) | 0;
    var rx = Math.max(x1, x2) | 0;
    if (Math.abs(depth1) < 0.7) {
      for (var x = lx + 1; x < rx; x++) {
        if (x >= 0 && x < W) drawChar('-', x, y, 60, 60, 80, 0.3);
      }
    }
    // Strand 1
    var bi = (y * 7 + 1) % 4;
    var ix1 = x1 | 0;
    if (ix1 >= 0 && ix1 < W) {
      var a1 = 0.4 + (depth1 + 1) * 0.3;
      drawChar(bases[bi], ix1, y, colors[bi][0], colors[bi][1], colors[bi][2], a1);
    }
    // Strand 2
    var bi2 = (3 - bi);
    var ix2 = x2 | 0;
    if (ix2 >= 0 && ix2 < W) {
      var a2 = 0.4 + (depth2 + 1) * 0.3;
      drawChar(bases[bi2], ix2, y, colors[bi2][0], colors[bi2][1], colors[bi2][2], a2);
    }
  }
}

registerMode('dna', {
  init: initDna,
  render: renderDna,
});
