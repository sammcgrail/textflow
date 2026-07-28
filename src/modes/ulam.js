import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ulam — the Ulam spiral. Integers wound outward from the centre, primes lit.
//
// Stanisław Ulam drew this on a napkin during a dull lecture in 1963 and found
// that the primes do not scatter: they fall on DIAGONAL lines. Nobody has fully
// explained why. That is the whole subject, and it is one of the few things in
// this collection where a grid of characters is the NATIVE representation
// rather than a lossy approximation of one — every cell is exactly one integer.
//
// The interaction is the point. Drag left/right to change the number the spiral
// STARTS from. Most offsets give a faint diagonal haze; a few give long
// unbroken runs, and the famous one is 41 — Euler's polynomial n^2+n+41 is
// prime for n = 0..39, so starting there lays forty consecutive primes along a
// single diagonal. The readout counts the longest run live, so the jump is a
// number you watch move rather than a claim in a comment.
//
// Two rendering choices worth knowing:
//   - Each spiral cell is TWO columns wide, because terminal cells are about
//     twice as tall as they are wide. Without that the 45-degree diagonals that
//     are the entire phenomenon render at about 63 degrees and stop reading as
//     diagonals at all.
//   - Composites are not blank. They are tinted by their SMALLEST PRIME FACTOR,
//     which lays down the multiples-of-2/3/5 lattice as a quiet texture and
//     gives the primes something to sit on top of. Blank composites leave the
//     primes floating in void and the diagonals are actually harder to see.
//
// TAP freezes the current offset so you can look at one spiral.

var uW = 0, uH = 0;              // character grid
var gW = 0, gH = 0;              // spiral grid (half the columns)
var uStart = 41;
var uFrozen = false;
var uSpf = null;                 // smallest prime factor per index
var uSieveTop = 0;
var uCell = null;                // grid -> integer
var uBest = 0, uBestCells = null;
var uDirty = true;

/* Smallest-prime-factor sieve. Gives primality (spf[n] === n) and the tint for
   composites in one table. */
function buildSieve(top) {
  var spf = new Int32Array(top + 1);
  for (var i = 2; i <= top; i++) {
    if (spf[i] === 0) {
      for (var j = i; j <= top; j += i) if (spf[j] === 0) spf[j] = i;
    }
  }
  uSpf = spf;
  uSieveTop = top;
}

/* Walk the square spiral, filling cell -> integer. Right 1, up 1, left 2,
   down 2, right 3, up 3 ... which is the standard construction. */
function buildSpiral() {
  gW = Math.max(3, (uW / 2) | 0);
  gH = Math.max(3, uH);
  uCell = new Int32Array(gW * gH).fill(-1);
  var cx = (gW / 2) | 0, cy = (gH / 2) | 0;
  var x = cx, y = cy, n = uStart;
  var dx = 1, dy = 0, leg = 1, placed = 0;
  var total = gW * gH;
  if (x >= 0 && y >= 0 && x < gW && y < gH) { uCell[y * gW + x] = n; placed++; }
  n++;
  var guard = 0;
  while (placed < total && guard++ < total * 6) {
    for (var rep = 0; rep < 2; rep++) {
      for (var s = 0; s < leg; s++) {
        x += dx; y += dy;
        if (x >= 0 && y >= 0 && x < gW && y < gH && uCell[y * gW + x] === -1) {
          uCell[y * gW + x] = n; placed++;
        }
        n++;
      }
      var t = dx; dx = -dy; dy = t;    // turn left
    }
    leg++;
  }
  var top = uStart + total * 4 + 16;
  if (!uSpf || uSieveTop < top) buildSieve(top);
  findBestRun();
  uDirty = false;
}

var isPrime = function (n) { return n >= 2 && n <= uSieveTop && uSpf[n] === n; };

/* Longest unbroken run of primes along any diagonal. This is the number the
   interaction is FOR — it is what moves when you land on 41, and printing it
   is the difference between a claim and a measurement. */
function findBestRun() {
  var best = 0, bestCells = null;
  var dirs = [[1, 1], [1, -1]];
  for (var d = 0; d < 2; d++) {
    var ddx = dirs[d][0], ddy = dirs[d][1];
    for (var y = 0; y < gH; y++) {
      for (var x = 0; x < gW; x++) {
        // only start a run where the previous cell is not prime, so each run is
        // counted once from its head
        var px = x - ddx, py = y - ddy;
        if (px >= 0 && py >= 0 && px < gW && py < gH && isPrime(uCell[py * gW + px])) continue;
        var run = [], ix = x, iy = y;
        while (ix >= 0 && iy >= 0 && ix < gW && iy < gH && isPrime(uCell[iy * gW + ix])) {
          run.push(iy * gW + ix);
          ix += ddx; iy += ddy;
        }
        if (run.length > best) { best = run.length; bestCells = run; }
      }
    }
  }
  uBest = best;
  uBestCells = new Set(bestCells || []);
}

function initUlam() {
  uW = state.COLS; uH = state.ROWS;
  uDirty = true;
}

function renderUlam() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!uCell || uW !== W || uH !== H) { uW = W; uH = H; initUlam(); }

  if (state.currentMode === 'ulam') {
    if (pointer.clicked) { pointer.clicked = false; uFrozen = !uFrozen; }
    if (pointer.down && !uFrozen) {
      var u = Math.max(0, Math.min(1, pointer.gx / Math.max(1, W - 1)));
      // 1 .. 400 across the width. Wide enough to sweep past 41 and the other
      // strong offsets, narrow enough that a fingertip can land on one.
      var next = 1 + Math.round(u * 399);
      if (next !== uStart) { uStart = next; uDirty = true; }
    }
  }
  if (uDirty) buildSpiral();

  var t = state.time * 0.001;

  // Build the label from segments and drop whole segments that will not fit,
  // rather than letting the draw loop slice one mid-word. At 390px the grid is
  // about 48 columns and the full string is 80, so the naive version rendered
  // "... n^2+n+41   drag" and read like a truncation bug.
  var label = 'start ' + uStart + (W >= 72 ? '   longest diagonal run ' : '   run ') + uBest;
  var extras = [uStart === 41 ? "<- Euler's n^2+n+41" : '', uFrozen ? '[frozen]' : 'drag to move the start'];
  for (var e = 0; e < extras.length; e++) {
    if (extras[e] && label.length + 3 + extras[e].length <= W - 1) label += '   ' + extras[e];
  }
  // Reserve the label's footprint. drawCharHSL(' ') paints NOTHING — a space does
  // not erase what is under it — so without this the spiral's '#' and '*' show
  // through every gap in the text and it reads as "longest##diagonal run 38*".
  var labelEnd = label.length + 1;

  for (var y = 0; y < gH; y++) {
    for (var x = 0; x < gW; x++) {
      var i = y * gW + x;
      var n = uCell[i];
      if (n < 0) continue;
      var col = x * 2;
      if (col + 1 >= W || y >= H) continue;
      if (y === 0 && col <= labelEnd) continue;

      var prime = isPrime(n);
      var ch, hue, sat, light;

      if (prime) {
        var inBest = uBestCells.has(i);
        if (inBest) {
          // the longest diagonal, breathing so it is findable at a glance
          var pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + (x + y) * 0.35);
          ch = '#';
          hue = 48; sat = 96; light = 60 + pulse * 28;
        } else {
          ch = '*';
          hue = 196; sat = 78; light = 66;
        }
      } else if (n < 2) {
        continue;
      } else {
        // tinted by smallest prime factor: 2s one colour, 3s another, and so on.
        var f = uSpf[n];
        ch = f === 2 ? '.' : f === 3 ? ':' : f === 5 ? '-' : f === 7 ? '=' : '+';
        hue = (f * 47) % 360;
        sat = 26; light = f === 2 ? 15 : 19;
      }
      drawCharHSL(ch, col, y, hue, sat, light);
      if (prime) drawCharHSL(ch === '#' ? '#' : '*', col + 1, y, hue, sat, light * 0.72);
    }
  }

  for (var c = 0; c < label.length && c < W; c++) {
    drawCharHSL(label[c], c + 1, 0, uStart === 41 ? 48 : 200, uStart === 41 ? 92 : 24, 80);
  }
}

registerMode('ulam', { init: initUlam, render: renderUlam });
