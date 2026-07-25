// circlelimit — a REAL hyperbolic {p,4} tessellation of the Poincaré disk
// (Escher's "Circle Limit" family — {6,4} by default, the scaffold of CL I).
// Every screen cell maps into the disk, is carried by a Möbius isometry
// (ambient drift, or a touch-pull while dragging) plus a slow rotation, then
// FOLDED into the fundamental triangle of the (2,p,4) triangle group by
// repeated reflection: cheap mirror reflections across the two radial walls
// of the π/p wedge, and circle inversion in the polygon-edge geodesic.
// Reflection parity + inversion count colour the tiles (Circle Limit III
// palette); the folded point's distance to the three mirrors draws near-white
// tile edges of constant HYPERBOLIC width, so tiles genuinely shrink toward
// the rim. Rendered at HIGH DETAIL: the mode dials the font size DOWN on
// entry so the grid roughly quadruples in cell count, then restores on exit.
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { resizeWebGL } from '../core/webgl-renderer.js';

var HUES = [140, 0, 50, 210]; // Circle Limit III: green, red, yellow, blue
var COSQ = Math.cos(Math.PI / 4); // q = 4: four p-gons meet at every vertex

var curP = 0;           // tiling order p — tap cycles it; 0 = not chosen yet
var mobX = 0, mobY = 0; // current Möbius translation (eased toward target)
var geo = null;         // cached fundamental-triangle geometry for curP

// Shrink the font => more COLS/ROWS => finer tessellation. scale<1 = denser.
function applyFineGrid(scale) {
  var w = window.innerWidth, h = window.innerHeight - 14; // INFO_BAR_H
  var base = Math.max(10, Math.min(16, w / 70));
  state.FONT_SIZE = Math.max(5, base * scale);
  var mc = state.ctx || document.createElement('canvas').getContext('2d');
  mc.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  mc.textBaseline = 'top';
  state.CHAR_W = mc.measureText('M').width || 1;
  // Integer row pitch: fractional CHAR_H makes canvas-2D rows overlap on a
  // beat frequency → bright horizontal banding. ceil matches the WebGL
  // atlas's own glyphH = ceil(size*1.25) behaviour at dpr 1.
  state.CHAR_H = Math.ceil(state.FONT_SIZE * 1.25);
  state.COLS = Math.max(1, Math.floor(w / state.CHAR_W));
  state.ROWS = Math.max(1, Math.floor((h - state.NAV_H) / state.CHAR_H));
  if (state.useWebGL) resizeWebGL();
}

// Fundamental triangle of the (2,p,q) group with q=4: angles π/p at the
// polygon centre (origin), π/2 at the edge midpoint M (on +x), π/q at the
// polygon vertex. Hyperbolic right-triangle identity gives the centre→edge
// distance: cosh(d) = cos(π/q)/sin(π/p)  (> 1 ⇔ hyperbolic ⇔ p ≥ 5 here).
// The edge geodesic is the circle through M ⊥ x-axis and ⊥ unit circle:
// centre (c0,0), radius rc, with c0² − rc² = 1.
function tilingGeometry(p) {
  var alpha = Math.PI / p;
  var sa = Math.sin(alpha), ca = Math.cos(alpha);
  var ch = COSQ / sa;
  var rM = Math.sqrt((ch - 1) / (ch + 1)); // tanh(d/2): Poincaré radius of M
  var c0 = (rM + 1 / rM) / 2;
  var rc = c0 - rM;
  return { p: p, sa: sa, ca: ca, c0: c0, rc: rc, rc2: rc * rc };
}

function initCirclelimit() {
  applyFineGrid(state.isMobile ? 0.6 : 0.5);
  mobX = 0; mobY = 0; // re-centre; the ambient drift eases back in
}

function cleanupCirclelimit() {
  resize(); // restore the default grid/font when leaving the mode
}

function renderCirclelimit() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  if (W < 4 || H < 4) return; // degenerate grid — nothing sensible to draw
  var cx = W / 2, cy = H / 2;
  var ar = state.CHAR_H / state.CHAR_W; // ~2 — square up the disk
  var rad = Math.min(W, H * ar) * 0.48;
  if (rad < 2) return;

  var mine = state.currentMode === 'circlelimit';
  var isMob = state.isMobile;
  var pMin = 5, pMax = isMob ? 7 : 9; // lower orders on mobile: chunkier tiles
  if (!curP) curP = isMob ? 5 : 6;
  if (curP > pMax) curP = pMax;

  // Tap: step the tiling order p (the {p,4} symmetry). Deliberate + sticky.
  if (pointer.clicked && mine) {
    pointer.clicked = false; // consume — never let the flag leak
    curP = curP >= pMax ? pMin : curP + 1;
  }
  if (!geo || geo.p !== curP) geo = tilingGeometry(curP);
  var sa = geo.sa, ca = geo.ca, c0 = geo.c0, rcr = geo.rc, rc2 = geo.rc2;

  // Möbius target: while dragging, pull the touched region toward the centre
  // (the disk translates hyperbolically under the finger); released, wander
  // on a slow ambient orbit. Isometries only — the tessellation stays exact.
  var tx, ty;
  if (pointer.down && mine) {
    tx = (pointer.gx - cx) / rad;
    ty = (pointer.gy - cy) * ar / rad;
    var tm = Math.sqrt(tx * tx + ty * ty);
    if (tm > 0.6) { tx *= 0.6 / tm; ty *= 0.6 / tm; }
  } else {
    tx = 0.16 * Math.cos(t * 0.19);
    ty = 0.16 * Math.sin(t * 0.127);
  }
  mobX += (tx - mobX) * 0.055;
  mobY += (ty - mobY) * 0.055;

  var th = t * 0.05, cth = Math.cos(th), sth = Math.sin(th);
  var maxIt = isMob ? 16 : 26; // fold-depth cap: rim cells stop converging

  for (var y = 0; y < H; y++) {
    var dy = (y - cy) * ar;
    for (var x = 0; x < W; x++) {
      var dx = x - cx;
      var zx = dx / rad, zy = dy / rad;
      var r2 = zx * zx + zy * zy;
      if (r2 >= 1) continue;
      var rr = Math.sqrt(r2);

      // Möbius translation w = (z + a)/(1 + ā·z)  (disk → disk)
      var nx = zx + mobX, ny = zy + mobY;
      var dre = 1 + mobX * zx + mobY * zy, dim = mobX * zy - mobY * zx;
      var dd = dre * dre + dim * dim;
      var wxx = (nx * dre + ny * dim) / dd;
      var wyy = (ny * dre - nx * dim) / dd;
      // slow rigid rotation of the whole tiling
      zx = wxx * cth - wyy * sth;
      zy = wxx * sth + wyy * cth;

      // Fold into the fundamental triangle, counting reflections.
      var refl = 0, inv = 0, q2 = 0, ux = 0;
      for (var it = 0; it < maxIt; it++) {
        // dihedral walls of the wedge [0, π/p] — plain mirror reflections
        var k = 0;
        while (k++ < 12) {
          if (zy < 0) { zy = -zy; refl++; continue; }
          var s = zx * sa - zy * ca; // signed dist to the π/p wall (≥0 inside)
          if (s < 0) { zx -= 2 * s * sa; zy += 2 * s * ca; refl++; continue; }
          break;
        }
        // polygon-edge geodesic: invert if beyond the edge (inside circle C)
        ux = zx - c0;
        q2 = ux * ux + zy * zy;
        if (q2 < rc2) {
          var f = rc2 / q2;
          zx = c0 + ux * f;
          zy = zy * f;
          refl++; inv++;
        } else break; // inside wedge AND outside C ⇒ fundamental domain
      }

      // Distances to the three mirrors in the FOLDED frame — every tile maps
      // isometrically onto this one triangle, so a fixed threshold here draws
      // edges of constant hyperbolic width that thin toward the rim on screen.
      ux = zx - c0;
      var dCirc = Math.sqrt(ux * ux + zy * zy) - rcr; // polygon edge
      if (dCirc < 0) dCirc = 0;
      var dWall = zx * sa - zy * ca;                  // π/p spoke
      if (dWall < 0) dWall = 0;
      var dAxis = zy;                                 // x-axis spoke
      var dmin = dCirc < dWall ? dCirc : dWall;
      if (dAxis < dmin) dmin = dAxis;

      // 4-colouring: parity flips across EVERY mirror, inversion count adds a
      // second bit ⇒ adjacent tiles always land on different palette entries.
      var idx = (refl & 1) + ((inv & 1) << 1);
      // Palette stays pinned to the Circle Limit III identity — motion comes
      // from the rotation/Möbius isometries, not from cycling the hues.
      var hue = (HUES[idx] + inv * 5) % 360;

      // Edges dissolve with tile generation (sub-cell tiles would otherwise
      // turn to white confetti), and the rim fades so the infinite-detail
      // fringe reads as fine grain instead of noise.
      var eScale = 1 / (1 + inv * 0.7);
      var fade = rr < 0.85 ? 1 : 1 - ((rr - 0.85) / 0.15) * 0.38;

      // Block glyphs (atlas-supported) so tiles read as solid mosaic fills,
      // not sparse ASCII scatter — the tessellation must be legible per-cell.
      var ch, ss, ll;
      if (dCirc < 0.032 * eScale) {        // p-gon edges: the Escher lines
        ch = '█'; ss = 20; ll = 88;
      } else if (dmin < 0.022 * eScale) {  // triangle spokes: soft white
        ch = '▓'; ss = 35; ll = 76;
      } else {                             // tile interior: bright, edge-shaded
        var g = dmin / 0.13;
        if (g > 1) g = 1;
        ll = 55 + 22 * g + 3 * Math.sin(t * 1.3 + inv * 1.7);
        ss = 80;
        ch = '█';
      }
      if (fade < 0.8) ch = '░';            // the infinite fringe: fine grain
      ll *= fade;
      drawCharHSL(ch, x, y, hue | 0, ss, ll | 0);
    }
  }
}

registerMode('circlelimit', {
  init: initCirclelimit,
  render: renderCirclelimit,
  cleanup: cleanupCirclelimit,
});
