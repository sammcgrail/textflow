import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// chladni — sand-on-vibrating-plate Chladni patterns.
//
// Imagine a metal plate vibrating at mode (m,n). The transverse displacement
// is z(x,y) = sin(mπx/W) · sin(nπy/H). Sand sprinkled on the plate is shaken
// off the antinodes and migrates to the nodal LINES where z = 0. Different
// (m,n) integer pairs produce different star/grid/mandala patterns —
// emergent geometry from a single sin·sin product.
//
// Particles random-walk biased toward |z|=0. Drag horizontally changes m,
// drag vertically changes n. Tap to randomize all particle positions
// (re-sprinkle the sand).

var W = 0, H = 0;
var N_PARTICLES = 900;
var px = null, py = null;
var m = 4, n = 3;
var lastM = -1, lastN = -1;

function initChladni() {
  W = 0; H = 0;
  m = 4; n = 3; lastM = -1; lastN = -1;
  px = null; py = null;
}

function reset(W_, H_) {
  W = W_; H = H_;
  px = new Float32Array(N_PARTICLES);
  py = new Float32Array(N_PARTICLES);
  for (var i = 0; i < N_PARTICLES; i++) {
    px[i] = Math.random() * W;
    py[i] = Math.random() * H;
  }
}

function disp(x, y) {
  // Normalized to [0,1] then phase scaled by integer mode numbers
  var u = x / W, v = y / H;
  return Math.sin(m * Math.PI * u) * Math.sin(n * Math.PI * v);
}

function renderChladni() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) reset(CW, CH);

  if (state.currentMode === 'chladni') {
    if (pointer.clicked) {
      pointer.clicked = false;
      // re-sprinkle sand
      for (var i = 0; i < N_PARTICLES; i++) {
        px[i] = Math.random() * W;
        py[i] = Math.random() * H;
      }
    }
    if (pointer.down) {
      // map x,y of pointer to mode numbers (1..8 horizontally, 1..8 vertically)
      m = Math.max(1, Math.min(9, ((pointer.gx / W) * 8 + 1) | 0));
      n = Math.max(1, Math.min(9, ((pointer.gy / H) * 8 + 1) | 0));
    }
  }

  // Mode change → re-sprinkle so particles don't get stuck
  if (m !== lastM || n !== lastN) {
    lastM = m; lastN = n;
    // partial re-sprinkle so the transition is visible, not instant
    for (var j = 0; j < N_PARTICLES; j += 3) {
      px[j] = Math.random() * W;
      py[j] = Math.random() * H;
    }
  }

  // Update particles: move down |displacement| gradient, plus Brownian noise
  var step = 0.5;
  for (var k = 0; k < N_PARTICLES; k++) {
    var x = px[k], y = py[k];
    // numerical gradient of |sin(mπu)sin(nπv)|^2 for steepest-descent push to nodal line
    var z = disp(x, y);
    var zx = disp(x + 0.5, y) - disp(x - 0.5, y);
    var zy = disp(x, y + 0.5) - disp(x, y - 0.5);
    // direction: minus sign of z * gradient → step toward z=0
    var sign = z > 0 ? 1 : -1;
    var gxg = -sign * zx;
    var gyg = -sign * zy;
    var len = Math.sqrt(gxg * gxg + gyg * gyg) + 1e-6;
    x += (gxg / len) * step + (Math.random() - 0.5) * 0.6;
    y += (gyg / len) * step + (Math.random() - 0.5) * 0.6;
    // wrap
    if (x < 0) x = 0; if (x >= W) x = W - 0.01;
    if (y < 0) y = 0; if (y >= H) y = H - 0.01;
    px[k] = x; py[k] = y;
  }

  // Render: count particles per cell, draw glyph by density
  // (small buffer reuses each frame)
  var buf = new Uint16Array(W * H);
  for (var p = 0; p < N_PARTICLES; p++) {
    var ix = px[p] | 0, iy = py[p] | 0;
    buf[iy * W + ix] += 1;
  }
  var glyphs = [' ', '·', '∘', '○', '●'];
  // hue derived from current mode numbers so each (m,n) has a distinct color
  var hue = ((m * 53 + n * 89) % 360);
  for (var yy = 0; yy < H; yy++) {
    for (var xx = 0; xx < W; xx++) {
      var c = buf[yy * W + xx];
      if (c === 0) continue;
      var gi = c >= 4 ? 4 : c;
      var lit = 30 + gi * 12;
      drawCharHSL(glyphs[gi], xx, yy, hue, 85, lit);
    }
  }

  // small mode indicator top-left
  // (drawn as labels via drawCharHSL one char at a time)
  var label = 'm=' + m + ' n=' + n;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], li, 0, hue, 80, 70);
  }
}

registerMode('chladni', { init: initChladni, render: renderChladni });
