import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var lifeA, lifeB, lifeAge;
var LIFE_CHARS = ' .,:;+*oO#@';

function initLife() {
  var sz = state.COLS * state.ROWS;
  lifeA = new Uint8Array(sz);
  lifeB = new Uint8Array(sz);
  lifeAge = new Float32Array(sz);
  // Random seed — ~30% alive
  for (var i = 0; i < sz; i++) {
    lifeA[i] = Math.random() < 0.3 ? 1 : 0;
  }
}
// initLife(); — called via registerMode
var lifeTickAccum = 0;

function renderLife() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var sz = W * H;

  if (!lifeA || lifeA.length !== sz) initLife();

  // Click to paint alive cells
  if (pointer.down && state.currentMode === 'life') {
    var lx = pointer.gx | 0, ly = pointer.gy | 0;
    for (var ldy = -2; ldy <= 2; ldy++) {
      for (var ldx = -2; ldx <= 2; ldx++) {
        var lnx = (lx + ldx + W) % W, lny = (ly + ldy + H) % H;
        lifeA[lny * W + lnx] = 1;
        lifeAge[lny * W + lnx] = 0.8;
      }
    }
  }

  lifeTickAccum += 1;
  // Step every 6 frames (~10 generations/sec at 60fps)
  if (lifeTickAccum >= 6) {
    lifeTickAccum = 0;
    // Count neighbours and produce next gen
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var ny = (y + dy + H) % H;
            var nx = (x + dx + W) % W;
            n += lifeA[ny * W + nx];
          }
        }
        var idx = y * W + x;
        var alive = lifeA[idx];
        if (alive) {
          lifeB[idx] = (n === 2 || n === 3) ? 1 : 0;
        } else {
          lifeB[idx] = (n === 3) ? 1 : 0;
        }
        // Track age for color
        if (lifeB[idx]) {
          lifeAge[idx] = Math.min(lifeAge[idx] + 0.15, 1);
        } else {
          lifeAge[idx] = Math.max(lifeAge[idx] - 0.08, 0);
        }
      }
    }
    // Swap buffers
    var tmp = lifeA; lifeA = lifeB; lifeB = tmp;

    // Inject random cells to prevent stagnation
    if (Math.random() < 0.05) {
      var rx = Math.floor(Math.random() * (W - 10)) + 5;
      var ry = Math.floor(Math.random() * (H - 10)) + 5;
      // Glider
      var pat = [[0,0],[1,0],[2,0],[2,-1],[1,-2]];
      for (var p = 0; p < pat.length; p++) {
        var pi = ((ry + pat[p][1] + H) % H) * W + ((rx + pat[p][0]) % W);
        lifeA[pi] = 1;
      }
    }
  }

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var age = lifeAge[idx];
      if (age < 0.01) continue;
      var ci = Math.min(LIFE_CHARS.length - 1, (age * LIFE_CHARS.length) | 0);
      var hue = (age * 120 + state.time * 20) % 360;
      drawCharHSL(LIFE_CHARS[ci], x, y, hue, 70 + age * 30, 30 + age * 45);
    }
  }
}

registerMode('life', {
  init: initLife,
  render: renderLife,
});
