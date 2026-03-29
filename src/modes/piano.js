import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var piNotes;
function initPiano() { piNotes = []; }
function renderPiano() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!piNotes) initPiano();
  var t = state.time;
  var keyW = 3, numKeys = Math.min(36, (W / keyW) | 0);
  var keyOff = ((W - numKeys * keyW) / 2) | 0;
  var pianoY = H - 4;
  // Auto-play melody
  if (((t * 6) | 0) > ((t - 0.016) * 6 | 0)) {
    var key = (Math.random() * numKeys) | 0;
    piNotes.push({ x: keyOff + key * keyW + 1, y: pianoY - 1, hue: (key * 10 + 200) % 360, speed: 0.4 + Math.random() * 0.2 });
  }
  // Click spawns note at click position
  if (pointer.clicked && state.currentMode === 'piano') {
    pointer.clicked = false;
    var clickKey = ((pointer.gx - keyOff) / keyW) | 0;
    if (clickKey >= 0 && clickKey < numKeys) {
      for (var n = 0; n < 3; n++) {
        piNotes.push({ x: keyOff + (clickKey + n - 1) * keyW + 1, y: pianoY - 1, hue: ((clickKey * 10 + 200 + n * 40) % 360) | 0, speed: 0.5 + Math.random() * 0.3 });
      }
    }
  }
  // Draw falling notes
  for (var i = piNotes.length - 1; i >= 0; i--) {
    var n = piNotes[i];
    n.y -= n.speed;
    if (n.y < -2) { piNotes.splice(i, 1); continue; }
    var ny = n.y | 0;
    if (ny >= 0 && ny < H) {
      drawCharHSL('#', n.x, ny, n.hue, 80, 45);
      if (n.x + 1 < W) drawCharHSL('#', n.x + 1, ny, n.hue, 80, 40);
      for (var tr = 1; tr <= 3; tr++) {
        if (ny + tr < H) drawCharHSL(':', n.x, ny + tr, n.hue, 60, (20 - tr * 4) | 0);
      }
    }
  }
  // Trim notes array
  if (piNotes.length > 200) piNotes.splice(0, piNotes.length - 200);
  // Draw piano keys at bottom
  for (var k = 0; k < numKeys; k++) {
    var kx = keyOff + k * keyW;
    var isBlack = [1,3,6,8,10].indexOf(k % 12) >= 0;
    for (var ky = pianoY; ky < Math.min(pianoY + 3, H); ky++) {
      for (var dx = 0; dx < keyW; dx++) {
        if (kx + dx >= W) continue;
        if (isBlack) drawCharHSL('#', kx + dx, ky, 0, 0, 12);
        else drawCharHSL(dx === 0 ? '|' : '_', kx + dx, ky, 0, 0, ky === pianoY ? 35 : 25);
      }
    }
  }
}
registerMode('piano', { init: initPiano, render: renderPiano });
