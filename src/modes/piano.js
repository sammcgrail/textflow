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
  var keyW = 2, numKeys = Math.min(36, (W / keyW) | 0);
  var keyOff = ((W - numKeys * keyW) / 2) | 0;
  var pianoY = H - 6;
  // Spawn notes randomly (auto-play)
  if (((t * 8) | 0) > ((t - 0.016) * 8 | 0)) {
    var key = (Math.random() * numKeys) | 0;
    var isBlack = [1,3,6,8,10].indexOf(key % 12) >= 0;
    piNotes.push({ x: keyOff + key * keyW + 1, y: pianoY - 1, hue: (key * 10 + 200) % 360, speed: 0.5 + Math.random() * 0.3, black: isBlack });
  }
  if (pointer.clicked && state.currentMode === 'piano') {
    pointer.clicked = false;
    piNotes.push({ x: pointer.gx | 0, y: pianoY - 1, hue: ((pointer.gx * 10) % 360) | 0, speed: 0.6, black: false });
  }
  // Draw falling notes
  for (var i = piNotes.length - 1; i >= 0; i--) {
    var n = piNotes[i];
    n.y -= n.speed;
    if (n.y < -2) { piNotes.splice(i, 1); continue; }
    var ny = n.y | 0;
    if (ny >= 0 && ny < H) {
      drawCharHSL('#', n.x, ny, n.hue, 80, 45);
      if (n.x + 1 < W) drawCharHSL('#', n.x + 1, ny, n.hue, 80, 45);
      // Trail
      for (var tr = 1; tr <= 2; tr++) {
        if (ny + tr < H) drawCharHSL('.', n.x, ny + tr, n.hue, 60, (25 - tr * 8) | 0);
      }
    }
  }
  // Draw piano keys
  for (var k = 0; k < numKeys; k++) {
    var kx = keyOff + k * keyW;
    var isBlack = [1,3,6,8,10].indexOf(k % 12) >= 0;
    for (var ky = pianoY; ky < pianoY + 5; ky++) {
      if (ky >= H) break;
      for (var dx = 0; dx < keyW; dx++) {
        if (kx + dx >= W) continue;
        if (isBlack) drawCharHSL('#', kx + dx, ky, 0, 0, ky === pianoY ? 20 : 10);
        else drawCharHSL(dx === 0 ? '|' : ' ', kx + dx, ky, 0, 0, ky === pianoY ? 40 : 30);
      }
    }
  }
}
registerMode('piano', { init: initPiano, render: renderPiano });
