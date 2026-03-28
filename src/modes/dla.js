import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var dlaGrid, dlaAge, dlaWalkers, dlaW, dlaH, dlaMaxAge;
function initDla() {
  dlaW = state.COLS; dlaH = state.ROWS;
  dlaGrid = new Uint8Array(dlaW * dlaH);
  dlaAge = new Float32Array(dlaW * dlaH);
  dlaMaxAge = 1;
  // Seed center
  var cx = (dlaW / 2) | 0, cy = (dlaH / 2) | 0;
  dlaGrid[cy * dlaW + cx] = 1;
  dlaAge[cy * dlaW + cx] = 0;
  // Walkers
  dlaWalkers = [];
  var numW = state.isMobile ? 300 : 500;
  for (var i = 0; i < numW; i++) {
    dlaWalkers.push({x: (Math.random() * dlaW) | 0, y: (Math.random() * dlaH) | 0});
  }
}
// initDla(); — called via registerMode
function renderDla() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (dlaW !== W || dlaH !== H) initDla();
  // Click adds seeds
  if (pointer.clicked && state.currentMode === 'dla') {
    pointer.clicked = false;
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      dlaGrid[gy * W + gx] = 1;
      dlaAge[gy * W + gx] = dlaMaxAge;
      dlaMaxAge++;
    }
  }
  // Walk and stick
  for (var i = 0; i < dlaWalkers.length; i++) {
    var w = dlaWalkers[i];
    for (var s = 0; s < 5; s++) {
      var dir = (Math.random() * 4) | 0;
      var nx = w.x + (dir === 0 ? -1 : dir === 1 ? 1 : 0);
      var ny = w.y + (dir === 2 ? -1 : dir === 3 ? 1 : 0);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      // Check neighbors for aggregate
      var stuck = false;
      for (var d = 0; d < 4; d++) {
        var ax = nx + (d === 0 ? -1 : d === 1 ? 1 : 0);
        var ay = ny + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (ax >= 0 && ax < W && ay >= 0 && ay < H && dlaGrid[ay * W + ax]) {
          stuck = true; break;
        }
      }
      if (stuck && !dlaGrid[ny * W + nx]) {
        dlaGrid[ny * W + nx] = 1;
        dlaAge[ny * W + nx] = dlaMaxAge;
        dlaMaxAge++;
        // Respawn walker
        w.x = (Math.random() * W) | 0;
        w.y = (Math.random() * H) | 0;
        break;
      }
      w.x = nx; w.y = ny;
    }
  }
  // Draw aggregate
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (!dlaGrid[y * W + x]) continue;
      var age = dlaAge[y * W + x] / (dlaMaxAge + 1);
      var ri = Math.min(RAMP_DENSE.length - 1, (0.3 + age * 0.7) * RAMP_DENSE.length | 0);
      var ch = RAMP_DENSE[ri];
      var hue = (age * 300 + 30) % 360;
      drawCharHSL(ch, x, y, hue | 0, 70, (20 + age * 40) | 0);
    }
  }
}

registerMode('dla', {
  init: initDla,
  render: renderDla,
});
