import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var glitchBase = [];
var glitchStrips = [];
var glitchEvent = 0;

function initGlitch() {
  glitchBase = [];
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?<>{}[]=/+-~';
  for (var y = 0; y < state.ROWS; y++) {
    var row = [];
    for (var x = 0; x < state.COLS; x++) {
      row.push(chars[Math.floor(Math.random() * chars.length)]);
    }
    glitchBase.push(row);
  }
  glitchStrips = [];
  glitchEvent = 0;
}
// initGlitch(); — called via registerMode
function renderGlitch() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!glitchBase.length || glitchBase.length !== H || glitchBase[0].length !== W) initGlitch();

  // Slowly scroll base text
  if (Math.random() < 0.02) {
    var row = [];
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!?<>{}[]=/+-~';
    for (var x = 0; x < W; x++) row.push(chars[Math.floor(Math.random() * chars.length)]);
    glitchBase.push(row);
    glitchBase.shift();
  }

  // Click to force glitch at cursor
  if (pointer.clicked && state.currentMode === 'glitch') {
    pointer.clicked = false;
    glitchEvent = 10 + Math.floor(Math.random() * 10);
    glitchStrips = [];
    var gy = pointer.gy | 0;
    for (var gs = 0; gs < 3 + Math.floor(Math.random() * 4); gs++) {
      glitchStrips.push({
        y: gy + gs * 2 - 3,
        h: 1 + Math.floor(Math.random() * 3),
        offset: Math.floor((pointer.gx - state.COLS / 2) * 0.5 + (Math.random() - 0.5) * 10),
        color: Math.floor(Math.random() * 3)
      });
    }
  }

  // Trigger glitch events
  glitchEvent--;
  if (glitchEvent <= 0 && Math.random() < 0.06) {
    glitchEvent = 5 + Math.floor(Math.random() * 12);
    glitchStrips = [];
    var numStrips = 1 + Math.floor(Math.random() * 4);
    for (var s = 0; s < numStrips; s++) {
      glitchStrips.push({
        y: Math.floor(Math.random() * H),
        h: 1 + Math.floor(Math.random() * 4),
        offset: Math.floor((Math.random() - 0.5) * 15),
        color: Math.floor(Math.random() * 3) // 0=cyan, 1=magenta, 2=red
      });
    }
  }

  var glitching = glitchEvent > 0;

  for (var y = 0; y < H; y++) {
    var strip = null;
    if (glitching) {
      for (var s = 0; s < glitchStrips.length; s++) {
        if (y >= glitchStrips[s].y && y < glitchStrips[s].y + glitchStrips[s].h) {
          strip = glitchStrips[s];
          break;
        }
      }
    }

    for (var x = 0; x < W; x++) {
      var sx = x, sy = y;
      var r = 120, g = 130, b = 140;

      if (strip) {
        sx = (x + strip.offset + W) % W;
        if (strip.color === 0) { r = 0; g = 255; b = 255; }
        else if (strip.color === 1) { r = 255; g = 0; b = 255; }
        else { r = 255; g = 50; b = 50; }
      }

      // Static noise
      if (Math.random() < 0.015) {
        var chars = '@#$%!?*';
        drawChar(chars[Math.floor(Math.random() * chars.length)], x, y, 255, 255, 255, 0.3 + Math.random() * 0.5);
        continue;
      }

      if (sy < glitchBase.length && sx < glitchBase[0].length) {
        var ch = glitchBase[sy][sx];
        var alpha = strip ? 0.7 + Math.random() * 0.3 : 0.15 + Math.random() * 0.1;
        drawChar(ch, x, y, r, g, b, alpha);
      }
    }
  }

  // Block corruption
  if (glitching && Math.random() < 0.3) {
    var bx = Math.floor(Math.random() * (W - 8));
    var by = Math.floor(Math.random() * (H - 4));
    var bch = '#@$%'[Math.floor(Math.random() * 4)];
    for (var dy = 0; dy < 3; dy++) {
      for (var dx = 0; dx < 6 + Math.floor(Math.random() * 8); dx++) {
        if (bx + dx < W && by + dy < H)
          drawChar(bch, bx + dx, by + dy, 255, 0, 255, 0.6 + Math.random() * 0.4);
      }
    }
  }
}

registerMode('glitch', {
  init: initGlitch,
  render: renderGlitch,
});
