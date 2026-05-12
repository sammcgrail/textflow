import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// lenia — continuous-state generalization of Conway's Life (Bert Chan, 2018).
//
// Continuous-valued cells in [0,1], updated via convolution with a Gaussian
// ring kernel + a Gaussian growth function. Same rule space as Life but on
// a continuum produces wildly different dynamics: emergent self-propelled
// "creatures" (orbium, scutium, etc) that translate, rotate, and sometimes
// replicate. The cleanest demonstration that complex life-like behavior
// arises from a single continuous local rule.
//
// Simplified implementation: precomputed ring kernel (donut shape), separable
// approximation skipped — direct 2D conv with a small radius for cell-grid
// scale that ASCII can resolve.
//
// Tap drops an orbium-seed blob. Drag streaks blobs.

var W = 0, H = 0;
var grid = null, next = null, kernel = null, kSum = 0;
var R = 5;             // kernel radius
var DT = 0.10;         // step size (smaller = more stable)
// Growth params re-tuned for our kernel normalization. Original Lenia
// MU=0.15/SIGMA=0.014 only converges for a very specific kernel shape and
// orbium seed. Wider band lets blobs survive + grow with our setup.
var MU = 0.35;
var SIGMA = 0.07;
var lastStep = 0;
var STEP_INTERVAL = 0.05;

function initLenia() {
  W = 0; H = 0;
  grid = null; next = null;
  lastStep = 0;
}

function buildKernel() {
  var size = 2 * R + 1;
  kernel = new Float32Array(size * size);
  kSum = 0;
  // Bell kernel: gaussian-of-gaussian-distance-from-radius
  // K(r) = exp(-((r/R - 0.5)^2) / 0.15^2) on r/R ∈ (0,1]
  for (var y = -R; y <= R; y++) {
    for (var x = -R; x <= R; x++) {
      var r = Math.sqrt(x * x + y * y) / R;
      if (r > 1.0 || r === 0) {
        kernel[(y + R) * size + (x + R)] = 0;
        continue;
      }
      var k = Math.exp(-Math.pow((r - 0.5) / 0.15, 2));
      kernel[(y + R) * size + (x + R)] = k;
      kSum += k;
    }
  }
}

function reset(W_, H_) {
  W = W_; H = H_;
  grid = new Float32Array(W * H);
  next = new Float32Array(W * H);
  buildKernel();
  // Seed with a few random patches
  for (var s = 0; s < 3; s++) {
    var sx = (Math.random() * W) | 0;
    var sy = (Math.random() * H) | 0;
    spawnBlob(sx, sy);
  }
}

function spawnBlob(cx, cy) {
  var sR = 6;
  for (var y = -sR; y <= sR; y++) {
    for (var x = -sR; x <= sR; x++) {
      var d = Math.sqrt(x * x + y * y);
      if (d > sR) continue;
      var px = cx + x, py = cy + y;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      var v = (1 - d / sR) * 0.9;
      grid[py * W + px] = Math.max(grid[py * W + px], v);
    }
  }
}

function step() {
  var size = 2 * R + 1;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var conv = 0;
      for (var ky = -R; ky <= R; ky++) {
        var yy = y + ky;
        if (yy < 0 || yy >= H) continue;
        for (var kx = -R; kx <= R; kx++) {
          var xx = x + kx;
          if (xx < 0 || xx >= W) continue;
          var w = kernel[(ky + R) * size + (kx + R)];
          if (w === 0) continue;
          conv += w * grid[yy * W + xx];
        }
      }
      conv /= kSum;
      // Gaussian growth: G(u) = 2 * exp(-((u-mu)/sigma)^2 / 2) - 1, in [-1, 1]
      var d = (conv - MU) / SIGMA;
      var growth = 2 * Math.exp(-d * d * 0.5) - 1;
      var v = grid[y * W + x] + DT * growth;
      if (v < 0) v = 0;
      if (v > 1) v = 1;
      next[y * W + x] = v;
    }
  }
  var tmp = grid; grid = next; next = tmp;
}

function renderLenia() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) reset(CW, CH);

  if (state.currentMode === 'lenia') {
    if (pointer.clicked) {
      pointer.clicked = false;
      spawnBlob(pointer.gx | 0, pointer.gy | 0);
    }
    if (pointer.down) spawnBlob(pointer.gx | 0, pointer.gy | 0);
  }

  if (state.time - lastStep > STEP_INTERVAL) {
    step();
    lastStep = state.time;
  }

  var glyphs = [' ', '·', '∘', '○', '●', '◉'];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = grid[y * W + x];
      if (v <= 0.05) continue;
      var gi = Math.min(5, (v * 6) | 0);
      // Hue swirls based on local value — pretty when creatures move
      var hue = (180 + v * 120 + x * 0.5 - y * 0.3) % 360;
      var lit = 25 + v * 50;
      drawCharHSL(glyphs[gi], x, y, hue | 0, 85, lit | 0);
    }
  }
}

registerMode('lenia', { init: initLenia, render: renderLenia });
