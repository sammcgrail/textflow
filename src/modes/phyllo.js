import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// phyllo — phyllotaxis, and the cliff either side of the golden angle.
//
// Seeds at angle n*θ, radius √n. At θ = 137.508° (the golden angle) they pack
// with no gaps and no seams, which is why sunflowers use it. Move θ by a TENTH
// OF A DEGREE and the packing collapses into visible spiral arms — and the
// NUMBER of arms jumps between consecutive Fibonacci numbers as you sweep.
//
// That cliff is the entire mode. A static sunflower is a picture; being able to
// slide θ across the golden angle and watch 21 arms become 34 is a thing you
// can feel. So the pointer's X axis IS θ, mapped to a narrow window around
// 137.5° rather than the full circle — the interesting range is about a degree
// wide, and giving it the whole screen makes the mode feel like it does nothing.
//
// The parastichy count is not simulated, it is COUNTED: seeds are binned by
// angle and the dominant spatial frequency of the resulting histogram is the
// number of arms. It prints, so you can watch it snap 13 → 21 → 34.
//
// DRAG left/right for θ. Vertical drag changes seed count. Tap freezes the
// bloom so you can look at one packing.

var pW = 0, pH = 0;
var pTheta = 137.508;
var pCount = 900;
var pFrozen = false;
var pArms = 0;
var pBins = null;

var GOLD = 137.50776405;

function initPhyllo() {
  pW = state.COLS; pH = state.ROWS;
  pBins = new Float32Array(180);
}

/* Parastichy count, done properly. The first version binned seed ANGLES and
   took the dominant frequency of the histogram — which is a reasonable-sounding
   method that returns 53 at the golden angle, and 53 is not a Fibonacci number,
   so it was simply wrong. The real definition is about INDEX distance: seeds
   that sit next to each other along a visible arm are exactly k apart in
   generation order, and k is what you are trying to find. So take the k that
   minimises the mean gap between seed i and seed i+k. That falls out as
   Fibonacci at the golden angle because that is what the golden angle IS. */
function countArms(xs, ys, n) {
  if (n < 40) return 0;
  var best = 0, bestD = 1e9;
  for (var k = 3; k <= 89; k++) {
    var acc = 0, cnt = 0;
    for (var i = (n >> 2); i + k < n; i += 3) {
      var dx = xs[i + k] - xs[i], dy = (ys[i + k] - ys[i]) * 2;
      acc += Math.sqrt(dx * dx + dy * dy); cnt++;
    }
    if (!cnt) continue;
    var d = acc / cnt;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

var xsBuf = null, ysBuf = null;

function renderPhyllo() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pBins || pW !== W || pH !== H) { pW = W; pH = H; initPhyllo(); }

  if (state.currentMode === 'phyllo') {
    if (pointer.clicked) { pointer.clicked = false; pFrozen = !pFrozen; }
    if (pointer.down) {
      // A ONE-DEGREE WINDOW across the whole width. The full circle would make
      // the golden angle a single unreachable pixel and the mode would read as
      // broken rather than sensitive.
      var u = Math.max(0, Math.min(1, pointer.gx / Math.max(1, W - 1)));
      pTheta = GOLD - 0.5 + u * 1.0;
      var v = Math.max(0, Math.min(1, pointer.gy / Math.max(1, H - 1)));
      pCount = (250 + (1 - v) * 1600) | 0;
    }
  }

  var t = pFrozen ? 0 : state.time * 0.0004;
  var cx = W * 0.5, cy = H * 0.5;
  var n = pCount;
  if (!xsBuf || xsBuf.length < n) { xsBuf = new Float32Array(n + 64); ysBuf = new Float32Array(n + 64); }

  // scale so the bloom fills the shorter axis; y is halved because terminal
  // cells are about twice as tall as they are wide
  var rmax = Math.min(cx, cy / 0.5) * 0.94;   // y is squashed by 0.5, so the
                                             // vertical budget is 2x the half-height
  var k = rmax / Math.sqrt(n);
  var th = pTheta * Math.PI / 180;

  var drawn = 0;
  for (var i = 0; i < n; i++) {
    var a = i * th + t;
    var r = k * Math.sqrt(i);
    var x = cx + Math.cos(a) * r;
    var y = cy + Math.sin(a) * r * 0.5;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    xsBuf[drawn] = x; ysBuf[drawn] = y; drawn++;

    // HUE BY ARM. Ring colour draws rings, which is what the first version did
    // while its comment claimed the arms would emerge — they cannot, a radial
    // gradient has no angular structure at all. Seeds in one parastichy are k
    // apart in index, so i % k IS the arm, and colouring by it paints exactly
    // the spirals your eye is trying to find. It also makes the jump visible:
    // when the count snaps 34 -> 55 the whole colour scheme reorganises.
    var ringT = r / rmax;
    var arms = pArms > 2 ? pArms : 34;
    var hue = ((i % arms) / arms * 320 + 20) % 360;
    var seedAge = 1 - ringT;
    var light = 30 + seedAge * 46;
    var sat = 62 + ringT * 30;

    // newest seeds at the centre are the brightest and densest glyph
    var ch = ringT < 0.18 ? '@' : ringT < 0.4 ? '*' : ringT < 0.7 ? '+' : ringT < 0.88 ? ':' : '.';
    drawCharHSL(ch, x | 0, y | 0, hue, sat, light);
  }

  if (!pFrozen || pArms === 0) pArms = countArms(xsBuf, ysBuf, drawn);

  var off = (pTheta - GOLD);
  var label = 'θ ' + pTheta.toFixed(3) + '°  ' + (Math.abs(off) < 0.0005 ? 'GOLDEN' : (off > 0 ? '+' : '') + off.toFixed(3))
    + '   ' + pArms + ' arms   ' + n + ' seeds' + (pFrozen ? '   [frozen]' : '');
  for (var c = 0; c < label.length && c < W; c++) {
    drawCharHSL(label[c], c + 1, 1, Math.abs(off) < 0.0005 ? 48 : 210, Math.abs(off) < 0.0005 ? 90 : 30, 78);
  }
}

registerMode('phyllo', { init: initPhyllo, render: renderPhyllo });
