import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var boltGrid, boltAge;
var boltBranches = [];

function initBolt() {
  var sz = state.COLS * state.ROWS;
  boltGrid = new Float32Array(sz);
  boltAge = new Float32Array(sz);
  boltBranches = [];
}
// initBolt(); — called via registerMode
var boltTimer = 0;

function renderBolt() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!boltGrid || boltGrid.length !== W * H) initBolt();

  boltTimer += 1;

  // Click to spawn bolt at cursor position
  if (pointer.clicked && state.currentMode === 'bolt') {
    pointer.clicked = false;
    var bsx = pointer.gx;
    var bsy = pointer.gy;
    var numB = 3 + Math.floor(Math.random() * 3);
    for (var bb = 0; bb < numB; bb++) {
      boltBranches.push({ x: bsx + (Math.random() - 0.5) * 4, y: bsy, life: 30 + Math.random() * 30 });
    }
  }

  // Spawn new bolt periodically
  if (boltTimer > 30 || boltBranches.length === 0) {
    boltTimer = 0;
    var sx = Math.floor(Math.random() * (W - 10)) + 5;
    var numBranches = 2 + Math.floor(Math.random() * 3);
    for (var b = 0; b < numBranches; b++) {
      boltBranches.push({ x: sx + (Math.random() - 0.5) * 6, y: 0, life: 40 + Math.random() * 30 });
    }
  }

  // Grow branches
  var newBranches = [];
  for (var i = 0; i < boltBranches.length; i++) {
    var br = boltBranches[i];
    if (br.life <= 0 || br.y >= H) continue;
    br.life--;

    // Move downward with jitter
    br.x += (Math.random() - 0.5) * 2.5;
    br.y += 0.5 + Math.random() * 1.5;

    var gx = Math.floor(br.x), gy = Math.floor(br.y);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      boltGrid[gy * W + gx] = 1;
      boltAge[gy * W + gx] = 1;
      // Thicken
      if (gx > 0) { boltGrid[gy * W + gx - 1] = 0.5; boltAge[gy * W + gx - 1] = Math.max(boltAge[gy * W + gx - 1], 0.7); }
      if (gx < W-1) { boltGrid[gy * W + gx + 1] = 0.5; boltAge[gy * W + gx + 1] = Math.max(boltAge[gy * W + gx + 1], 0.7); }
    }

    // Branch
    if (Math.random() < 0.08 && br.life > 10) {
      newBranches.push({ x: br.x + (Math.random() - 0.5) * 3, y: br.y, life: br.life * 0.5 });
    }

    boltBranches[i] = br;
  }
  for (var i = 0; i < newBranches.length; i++) boltBranches.push(newBranches[i]);
  // Prune dead
  boltBranches = boltBranches.filter(function(b) { return b.life > 0 && b.y < H; });

  // Decay and render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var v = boltAge[idx];
      if (v < 0.01) continue;
      boltAge[idx] *= 0.96;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var b = (150 + v * 105) | 0;
      drawChar(RAMP_DENSE[ri], x, y, (100 + v * 55) | 0, (150 + v * 105) | 0, 255, 0.2 + v * 0.8);
    }
  }
}

registerMode('bolt', {
  init: initBolt,
  render: renderBolt,
});
