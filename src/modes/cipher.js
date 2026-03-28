import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cipherDecodes = [];
var cipherText;

function initCipher() {
  cipherDecodes = [];
  cipherText = [];
  var msg = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG -- TEXTFLOW CIPHER MODE -- SEBLAND.COM -- ';
  for (var y = 0; y < state.ROWS; y++) {
    var row = [];
    for (var x = 0; x < state.COLS; x++) {
      row.push(msg[(x + y * state.COLS) % msg.length]);
    }
    cipherText.push(row);
  }
}
// initCipher(); — called via registerMode
function renderCipher() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cipherText || cipherText.length !== H) initCipher();

  if (pointer.clicked && state.currentMode === 'cipher') {
    pointer.clicked = false;
    cipherDecodes.push({ x: pointer.gx, y: pointer.gy, born: state.time });
    if (cipherDecodes.length > 10) cipherDecodes.shift();
  }

  // Prune old decodes
  var ci = cipherDecodes.length;
  while (ci--) { if (state.time - cipherDecodes[ci].born > 12) cipherDecodes.splice(ci, 1); }

  var scrambleChars = '@#$%&*!?><{}[]=/+-~^';

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var decoded = false;
      var bestFade = 0;

      for (var d = 0; d < cipherDecodes.length; d++) {
        var dec = cipherDecodes[d];
        var dx = x - dec.x, dy = y - dec.y;
        var dist = Math.sqrt(dx * dx * 0.3 + dy * dy);
        var age = state.time - dec.born;
        var radius = age * 4;
        var fade = Math.max(0, 1 - age / 12);

        if (dist < radius) {
          decoded = true;
          if (fade > bestFade) bestFade = fade;
        }
      }

      if (decoded) {
        var ch = cipherText[y][x];
        var lit = 30 + bestFade * 50;
        drawCharHSL(ch, x, y, 120, 80, lit);
      } else {
        // Show scrambled
        if (Math.random() < 0.02) continue; // gaps
        var sch = scrambleChars[(x * 7 + y * 13 + (state.time * 3 | 0)) % scrambleChars.length];
        drawCharHSL(sch, x, y, 0, 0, 12 + Math.random() * 8);
      }
    }
  }
}

registerMode('cipher', {
  init: initCipher,
  render: renderCipher,
});
