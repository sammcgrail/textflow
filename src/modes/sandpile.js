import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// sandpile — Bak-Tang-Wiesenfeld abelian sandpile.
//
// Each cell holds an integer count of grains. Rule: when a cell exceeds 3,
// it topples — subtract 4, add 1 to each of 4 von-Neumann neighbors. Grains
// that fall off the edge are lost. Starting from random or via tap-drop, the
// system self-organizes to a critical state where avalanches follow a power
// law in size. The classic example of self-organized criticality.
//
// Tap = drop a stack of 16 grains at the touch point (triggers an avalanche
// of variable size). Drag = continuous grain stream.

var W = 0, H = 0;
var grid = null;       // Int8Array of grain counts
var nextGrid = null;
var lastStep = 0;
var STEP_INTERVAL = 0.04;
var DROP_AMOUNT = 16;
var DRAG_DROP = 4;

function initSandpile() {
  W = 0; H = 0;
  grid = null; nextGrid = null;
  lastStep = 0;
}

function reset(W_, H_) {
  W = W_; H = H_;
  grid = new Int8Array(W * H);
  nextGrid = new Int8Array(W * H);
  // Pre-seed near critical: 2-3 grains per cell so taps trigger big avalanches
  for (var i = 0; i < W * H; i++) grid[i] = 2 + ((Math.random() * 2) | 0);
}

function dropAt(gx, gy, amt) {
  var x = Math.max(0, Math.min(W - 1, gx | 0));
  var y = Math.max(0, Math.min(H - 1, gy | 0));
  grid[y * W + x] += amt;
}

function step() {
  // One topple-tick: every cell with >=4 grains sheds 4 to neighbors. We do
  // a synchronous update via nextGrid to keep the abelian property clean.
  // Multiple sequential topples happen across frames so we get to *watch*
  // the avalanche cascade rather than collapse it instantly.
  nextGrid.set(grid);
  var toppled = false;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (grid[i] >= 4) {
        nextGrid[i] -= 4;
        if (x > 0)     nextGrid[i - 1] += 1;
        if (x < W - 1) nextGrid[i + 1] += 1;
        if (y > 0)     nextGrid[i - W] += 1;
        if (y < H - 1) nextGrid[i + W] += 1;
        toppled = true;
      }
    }
  }
  if (toppled) {
    var tmp = grid; grid = nextGrid; nextGrid = tmp;
  }
}

function renderSandpile() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) reset(CW, CH);

  if (state.currentMode === 'sandpile') {
    if (pointer.clicked) {
      pointer.clicked = false;
      dropAt(pointer.gx, pointer.gy, DROP_AMOUNT);
    }
    if (pointer.down) dropAt(pointer.gx, pointer.gy, DRAG_DROP);
  }

  // Multiple step passes per frame so avalanches resolve quickly
  if (state.time - lastStep > STEP_INTERVAL) {
    for (var k = 0; k < 3; k++) step();
    lastStep = state.time;
  }

  // 4-level palette: 0=dark, 1=blue, 2=teal, 3=hot, 4+=white (active topple)
  var glyphs = [' ', '·', '∘', '○', '●'];
  var hues = [240, 220, 180, 50, 0];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = grid[y * W + x];
      if (v <= 0) continue;
      var k = v >= 4 ? 4 : v;
      var lit = 25 + k * 14;
      drawCharHSL(glyphs[k], x, y, hues[k], 85, lit);
    }
  }
}

registerMode('sandpile', { init: initSandpile, render: renderSandpile });
