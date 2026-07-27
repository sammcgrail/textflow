import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// penrose — a real aperiodic Penrose P3 tiling, built by deflation.
//
// Two rhombi, thin (36 degrees) and thick (72), tiled so the pattern NEVER
// repeats: no translation maps it onto itself, yet every finite patch recurs
// infinitely often elsewhere. Built the honest way, by repeatedly subdividing
// Robinson triangles with the golden ratio — the same substitution Penrose
// used, so every vertex here is exact rather than decorative.
//
// Third of the tiling set: alhambra is the 17 periodic wallpaper groups,
// circlelimit is hyperbolic, this one is the aperiodic case.
//
// Drag to steer through it. Tap to change subdivision depth. Left alone it
// turns and breathes so the five-fold symmetry keeps re-forming.

var PHI = (1 + Math.sqrt(5)) / 2;

var pnTris = null;      // {t, ax,ay, bx,by, cx,cy, dx,dy}  d = diagonal-opposite apex
var pnDepth = 0;
var pnRot = 0;
var pnCx = 0, pnCy = 0;     // world-space centre we look at
var pnW = 0, pnH = 0;
var pnDragX = 0, pnDragY = 0, pnWasDown = false;
var pnFill = null;          // per-cell triangle type, -1 empty
var pnEdge = null;          // per-cell edge flag

function pnSubdivide(tris) {
  var out = [];
  for (var i = 0; i < tris.length; i++) {
    var T = tris[i];
    var ax = T[1], ay = T[2], bx = T[3], by = T[4], cx = T[5], cy = T[6];
    if (T[0] === 0) {
      // thin: one new point along A->B
      var px = ax + (bx - ax) / PHI, py = ay + (by - ay) / PHI;
      out.push([0, cx, cy, px, py, bx, by]);
      out.push([1, px, py, cx, cy, ax, ay]);
    } else {
      // thick: two new points, off B
      var qx = bx + (ax - bx) / PHI, qy = by + (ay - by) / PHI;
      var rx = bx + (cx - bx) / PHI, ry = by + (cy - by) / PHI;
      out.push([1, rx, ry, cx, cy, ax, ay]);
      out.push([1, qx, qy, rx, ry, bx, by]);
      out.push([0, rx, ry, qx, qy, ax, ay]);
    }
  }
  return out;
}

function pnBuild(depth) {
  // opening wheel: ten thin triangles round the origin (a "sun" vertex)
  var tris = [];
  for (var i = 0; i < 10; i++) {
    var b1 = (2 * i - 1) * Math.PI / 10;
    var c1 = (2 * i + 1) * Math.PI / 10;
    var bx = Math.cos(b1), by = Math.sin(b1);
    var cx = Math.cos(c1), cy = Math.sin(c1);
    if (i % 2 === 0) { var tx = bx, ty = by; bx = cx; by = cy; cx = tx; cy = ty; }
    tris.push([0, 0, 0, bx, by, cx, cy]);
  }
  for (var d = 0; d < depth; d++) tris = pnSubdivide(tris);

  // Find each triangle's apex: the vertex whose two edges are equal length.
  // The opposite edge is the rhombus DIAGONAL, not a tile edge — it gets drawn
  // dim, so what reads on screen is rhombi and not half-rhombi.
  pnTris = [];
  for (var k = 0; k < tris.length; k++) {
    var t = tris[k];
    var vx = [t[1], t[3], t[5]], vy = [t[2], t[4], t[6]];
    var best = 0, bestD = Infinity;
    for (var v = 0; v < 3; v++) {
      var p = (v + 1) % 3, q = (v + 2) % 3;
      var l1 = Math.hypot(vx[p] - vx[v], vy[p] - vy[v]);
      var l2 = Math.hypot(vx[q] - vx[v], vy[q] - vy[v]);
      var diff = Math.abs(l1 - l2);
      if (diff < bestD) { bestD = diff; best = v; }
    }
    var a = best, b = (best + 1) % 3, c = (best + 2) % 3;
    pnTris.push({
      t: t[0],
      ax: vx[a], ay: vy[a],     // apex
      bx: vx[b], by: vy[b],     // b,c are the diagonal ends
      cx: vx[c], cy: vy[c],
    });
  }
}

function initPenrose() {
  pnW = state.COLS;
  pnH = state.ROWS;
  // chunky tiles read as rhombi; dense ones collapse into texture
  pnDepth = state.isMobile ? 3 : 4;
  pnBuild(pnDepth);
  pnRot = 0;
  pnCx = 0; pnCy = 0;
  pnWasDown = false;
  pnFill = new Int16Array(state.COLS * state.ROWS);
  pnEdge = new Uint8Array(state.COLS * state.ROWS);
}

function pnLine(x0, y0, x1, y1, W, H) {
  // integer line into the edge buffer
  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  var err = dx + dy, guard = 0;
  for (;;) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) pnEdge[y0 * W + x0] = 1;
    if (x0 === x1 && y0 === y1) break;
    if (++guard > 4096) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function renderPenrose() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pnTris || pnW !== W || pnH !== H) initPenrose();

  var ar = state.CHAR_W / state.CHAR_H;
  if (!(ar > 0.05)) ar = 0.5;

  // ---- input ----
  if (pointer.clicked && state.currentMode === 'penrose') {
    pointer.clicked = false;
    pnDepth = pnDepth >= (state.isMobile ? 4 : 5) ? 3 : pnDepth + 1;
    pnBuild(pnDepth);
  } else if (pointer.down && state.currentMode === 'penrose') {
    if (pnWasDown) {
      // drag steers: horizontal spins, vertical pans through the tiling
      pnRot += (pointer.gx - pnDragX) * 0.006;
      pnCy += (pointer.gy - pnDragY) * 0.012;
    }
    pnDragX = pointer.gx; pnDragY = pointer.gy;
    pnWasDown = true;
  } else {
    pnWasDown = false;
    pnRot += 0.0016;
  }

  var S = (Math.min(H, W * ar) * 0.5) * (1.02 + 0.16 * Math.sin(state.time * 0.19));
  var cs = Math.cos(pnRot), sn = Math.sin(pnRot);
  var ocx = W * 0.5, ocy = H * 0.5;

  pnFill.fill(-1);
  pnEdge.fill(0);

  for (var i = 0; i < pnTris.length; i++) {
    var T = pnTris[i];
    // world -> screen (X widened by 1/ar so a world unit is square on screen)
    var wax = T.ax - pnCx, way = T.ay - pnCy;
    var wbx = T.bx - pnCx, wby = T.by - pnCy;
    var wcx = T.cx - pnCx, wcy = T.cy - pnCy;
    var sax = ocx + (wax * cs - way * sn) * S / ar, say = ocy + (wax * sn + way * cs) * S;
    var sbx = ocx + (wbx * cs - wby * sn) * S / ar, sby = ocy + (wbx * sn + wby * cs) * S;
    var scx = ocx + (wcx * cs - wcy * sn) * S / ar, scy = ocy + (wcx * sn + wcy * cs) * S;

    var minx = Math.floor(Math.min(sax, sbx, scx)), maxx = Math.ceil(Math.max(sax, sbx, scx));
    var miny = Math.floor(Math.min(say, sby, scy)), maxy = Math.ceil(Math.max(say, sby, scy));
    if (maxx < 0 || minx >= W || maxy < 0 || miny >= H) continue;
    if (minx < 0) minx = 0; if (maxx > W - 1) maxx = W - 1;
    if (miny < 0) miny = 0; if (maxy > H - 1) maxy = H - 1;

    var d1x = sbx - sax, d1y = sby - say;
    var d2x = scx - sax, d2y = scy - say;
    var den = d1x * d2y - d2x * d1y;
    if (Math.abs(den) < 1e-9) continue;
    var inv = 1 / den;

    for (var y = miny; y <= maxy; y++) {
      for (var x = minx; x <= maxx; x++) {
        var px = x + 0.5 - sax, py = y + 0.5 - say;
        var u = (px * d2y - d2x * py) * inv;
        var v = (d1x * py - px * d1y) * inv;
        if (u >= 0 && v >= 0 && u + v <= 1) pnFill[y * W + x] = T.t;
      }
    }

    // tile edges are apex->b and apex->c; b->c is the internal diagonal
    pnLine(Math.round(sax), Math.round(say), Math.round(sbx), Math.round(sby), W, H);
    pnLine(Math.round(sax), Math.round(say), Math.round(scx), Math.round(scy), W, H);
  }

  // ---- draw ----
  for (var yy = 0; yy < H; yy++) {
    for (var xx = 0; xx < W; xx++) {
      var idx = yy * W + xx;
      var f = pnFill[idx];
      if (f < 0) continue;
      var e = pnEdge[idx];
      // radial shade so the five-fold centre reads as a source
      var rx = (xx - ocx) * ar / S, ry = (yy - ocy) / S;
      var rr = Math.sqrt(rx * rx + ry * ry);
      var shade = 1 / (1 + rr * 0.8);
      if (e) {
        // edges outline the tiles; kept dim so the FILL is what you read
        drawCharHSL('.', xx, yy, 45, 22, 46 - 10 * rr);
      } else if (f === 1) {
        drawCharHSL('#', xx, yy, 272, 62, 30 + 30 * shade);
      } else {
        drawCharHSL('=', xx, yy, 176, 58, 26 + 22 * shade);
      }
    }
  }

  var lbl = 'depth ' + pnDepth + '  ' + pnTris.length + ' rhomb-halves';
  for (var c = 0; c < lbl.length && c + 1 < W; c++) {
    drawCharHSL(lbl[c], 1 + c, H - 1, 45, 12, 84);
  }
}

registerMode('penrose', { init: initPenrose, render: renderPenrose });
