import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// forest — Drossel-Schwabl forest fire CA. Self-organized criticality.
//
// Three states per cell:
//   0 = empty (dirt / ash)
//   1 = tree
//   2 = burning
// Rules per tick:
//   empty → tree with probability p_grow
//   tree → burning if any 4-neighbor is burning
//   tree → burning by lightning with probability p_lightning
//   burning → empty
//
// Emerges: forests grow until lightning strikes; fire then percolates as a
// cascade through connected clumps. Cluster size distribution follows a
// power law — a textbook SOC system. Tap to manually strike lightning.

var W = 0, H = 0;
var grid = null, next = null;
var lastStep = 0;
var STEP_INTERVAL = 0.06;
var P_GROW = 0.012;
var P_LIGHTNING = 0.00005;
var GLYPHS = [' ', 'Y', '*'];

function initForest() {
  W = 0; H = 0;
  grid = null; next = null;
  lastStep = 0;
}

function reset(W_, H_) {
  W = W_; H = H_;
  grid = new Uint8Array(W * H);
  next = new Uint8Array(W * H);
  // Seed with random tree cover
  for (var i = 0; i < W * H; i++) {
    grid[i] = Math.random() < 0.45 ? 1 : 0;
  }
}

function lightning(gx, gy) {
  // Set tree → burning at a small radius around touch
  var R = 1;
  var cx = gx | 0, cy = gy | 0;
  for (var y = -R; y <= R; y++) {
    for (var x = -R; x <= R; x++) {
      var px = cx + x, py = cy + y;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      var i = py * W + px;
      if (grid[i] === 1) grid[i] = 2;
      else if (grid[i] === 0 && Math.random() < 0.3) grid[i] = 2; // spark dry ground sparingly
    }
  }
}

function step() {
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      var s = grid[i];
      if (s === 2) {
        next[i] = 0;
      } else if (s === 1) {
        // burning neighbor?
        var burning = false;
        if (x > 0     && grid[i - 1] === 2) burning = true;
        else if (x < W - 1 && grid[i + 1] === 2) burning = true;
        else if (y > 0     && grid[i - W] === 2) burning = true;
        else if (y < H - 1 && grid[i + W] === 2) burning = true;
        if (burning || Math.random() < P_LIGHTNING) next[i] = 2;
        else next[i] = 1;
      } else {
        next[i] = Math.random() < P_GROW ? 1 : 0;
      }
    }
  }
  var tmp = grid; grid = next; next = tmp;
}

function renderForest() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) reset(CW, CH);

  if (state.currentMode === 'forest') {
    if (pointer.clicked) {
      pointer.clicked = false;
      lightning(pointer.gx, pointer.gy);
    }
    if (pointer.down) lightning(pointer.gx, pointer.gy);
  }

  if (state.time - lastStep > STEP_INTERVAL) {
    step();
    lastStep = state.time;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var s = grid[y * W + x];
      if (s === 0) continue;
      if (s === 1) {
        // tree — green
        drawCharHSL(GLYPHS[1], x, y, 130, 60, 38);
      } else {
        // burning — bright orange/red
        drawCharHSL(GLYPHS[2], x, y, 20, 95, 60);
      }
    }
  }
}

registerMode('forest', { init: initForest, render: renderForest });
