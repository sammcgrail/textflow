import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// fractseed — an interactive fractal garden. Tap anywhere to PLANT a fractal
// that unfurls its recursive structure over ~1.5s with a bright glowing growth
// front, then settles and slowly fades. Each tap cycles the species: a
// branching tree, a Koch snowflake, a dragon curve, a Sierpinski arrowhead,
// a logarithmic spiral with flourishes, and a 6-fold recursive star. DRAG to
// scatter a trail of little fractals AND to set a wind that bends the trees'
// growth. Leave it alone and it keeps seeding itself. Everything is hue-cycled
// and breathes with a gentle sway.

var TYPES = ['tree', 'star', 'spiral', 'koch', 'dragon', 'sierpinski'];
var MAX_INSTANCES = 7;
var GROW_DUR = 1.5;     // seconds to fully unfurl
var LIFE = 11.0;        // seconds before fully faded out
var FADE_FRAC = 0.78;   // hold full brightness until this fraction of LIFE
var SWAY_AMP = 0.6;     // gentle horizontal breathing, cols
var LINE = ['-', '\\', '|', '/']; // ASCII only — MSDF atlas lacks box-drawing glyphs

var insts = null;
var fsW = 0, fsH = 0, AR = 0.5;
var typeIdx = 0;
var wind = 0;           // current bending force (cols, baked into new trees)
var lastGx = 0, lastDown = false;
var dragTimer = 0, idleTimer = 0, hintT = 0;

// ---------- geometry helpers (isotropic local coords; AR applied at draw) ----------

function centerSegs(segs) {
  var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (s.x1 < minx) minx = s.x1; if (s.x2 < minx) minx = s.x2;
    if (s.y1 < miny) miny = s.y1; if (s.y2 < miny) miny = s.y2;
    if (s.x1 > maxx) maxx = s.x1; if (s.x2 > maxx) maxx = s.x2;
    if (s.y1 > maxy) maxy = s.y1; if (s.y2 > maxy) maxy = s.y2;
  }
  var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  for (var j = 0; j < segs.length; j++) {
    segs[j].x1 -= cx; segs[j].y1 -= cy; segs[j].x2 -= cx; segs[j].y2 -= cy;
  }
}

function genTree(segs, x, y, ang, len, depth, maxDepth, w) {
  if (depth > maxDepth || len < 0.7) return;
  var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
  segs.push({ x1: x, y1: y, x2: nx, y2: ny, o: depth / maxDepth, d: depth });
  var spread = 0.42 + 0.12 * Math.sin(depth * 1.3);
  var nlen = len * 0.74;
  var bend = w * (depth + 1) * 0.04;
  genTree(segs, nx, ny, ang - spread + bend, nlen, depth + 1, maxDepth, w);
  genTree(segs, nx, ny, ang + spread + bend, nlen, depth + 1, maxDepth, w);
  if (depth < 3) genTree(segs, nx, ny, ang + bend, nlen * 0.92, depth + 1, maxDepth, w);
}

function genStarArm(segs, x, y, ang, len, depth, maxDepth) {
  if (depth > maxDepth || len < 0.6) return;
  var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
  segs.push({ x1: x, y1: y, x2: nx, y2: ny, o: depth / maxDepth, d: depth });
  var sp = 0.5;
  genStarArm(segs, nx, ny, ang - sp, len * 0.6, depth + 1, maxDepth);
  genStarArm(segs, nx, ny, ang + sp, len * 0.6, depth + 1, maxDepth);
}

function genSpiral(segs, turns, baseR) {
  var step = 0.30, tmax = turns * Math.PI * 2;
  var px = baseR, py = 0, first = true, idx = 0;
  for (var t = 0; t <= tmax; t += step) {
    var r = baseR * Math.exp(0.16 * t);
    var x = Math.cos(t) * r, y = Math.sin(t) * r;
    if (!first) {
      segs.push({ x1: px, y1: py, x2: x, y2: y, o: t / tmax, d: (t / step) | 0 });
      if (idx % 3 === 0) {
        var ba = Math.atan2(y - py, x - px), bl = r * 0.55;
        segs.push({ x1: x, y1: y, x2: x + Math.cos(ba + 1.5) * bl, y2: y + Math.sin(ba + 1.5) * bl, o: t / tmax, d: 9 });
      }
    }
    px = x; py = y; first = false; idx++;
  }
}

function kochEdge(pts, ax, ay, bx, by, depth) {
  if (depth === 0) { pts.push([bx, by]); return; }
  var dx = (bx - ax) / 3, dy = (by - ay) / 3;
  var x1 = ax + dx, y1 = ay + dy, x2 = ax + 2 * dx, y2 = ay + 2 * dy;
  var ang = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 3;
  var plen = Math.hypot(x2 - x1, y2 - y1);
  var px = x1 + Math.cos(ang) * plen, py = y1 + Math.sin(ang) * plen;
  kochEdge(pts, ax, ay, x1, y1, depth - 1);
  kochEdge(pts, x1, y1, px, py, depth - 1);
  kochEdge(pts, px, py, x2, y2, depth - 1);
  kochEdge(pts, x2, y2, bx, by, depth - 1);
}

function genKoch(segs, size, depth) {
  var R = size, pts = [];
  var verts = [];
  for (var k = 0; k < 3; k++) {
    var a = -Math.PI / 2 + k * (Math.PI * 2 / 3);
    verts.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  pts.push([verts[0][0], verts[0][1]]);
  for (var e = 0; e < 3; e++) {
    var A = verts[e], B = verts[(e + 1) % 3];
    kochEdge(pts, A[0], A[1], B[0], B[1], depth);
  }
  var n = pts.length;
  for (var i = 1; i < n; i++) {
    segs.push({ x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1], o: i / n, d: (i * 6 / n) | 0 });
  }
}

function turtle(segs, str, len, turnDeg) {
  var x = 0, y = 0, ang = 0, turn = turnDeg * Math.PI / 180;
  var total = 0, k;
  for (k = 0; k < str.length; k++) if (str[k] === 'F' || str[k] === 'A' || str[k] === 'B') total++;
  var drawn = 0;
  for (k = 0; k < str.length; k++) {
    var c = str[k];
    if (c === '+') ang += turn;
    else if (c === '-') ang -= turn;
    else { // F, A, B all draw forward
      var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      drawn++;
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, o: drawn / total, d: (drawn * 8 / total) | 0 });
      x = nx; y = ny;
    }
  }
}

function genDragon(segs, depth, len) {
  // dragon curve turn sequence via the classic bit trick
  var str = 'F';
  var x = 0, y = 0, ang = 0;
  var steps = 1 << depth;
  segs.push({ x1: 0, y1: 0, x2: len, y2: 0, o: 0, d: 0 });
  x = len;
  for (var n = 1; n < steps; n++) {
    var t = ((((n & -n) << 1) & n) !== 0) ? 1 : -1;
    ang += t * Math.PI / 2;
    var nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    segs.push({ x1: x, y1: y, x2: nx, y2: ny, o: n / steps, d: (n * 8 / steps) | 0 });
    x = nx; y = ny;
  }
}

function expandLsys(axiom, rules, iters) {
  var s = axiom;
  for (var i = 0; i < iters; i++) {
    var out = '';
    for (var j = 0; j < s.length; j++) out += (rules[s[j]] || s[j]);
    s = out;
  }
  return s;
}

// ---------- instance creation ----------

function makeInstance(type, gx, gy, t) {
  var unit = Math.min(fsW, fsH);
  var segs = [];
  var sz = 0.8 + Math.random() * 0.5;
  if (type === 'tree') {
    var up = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    genTree(segs, 0, 0, up, unit * 0.11 * sz, 0, 8, wind);
    // tree base sits at the tap point, grows upward — no centering
  } else if (type === 'star') {
    var arms = 6;
    for (var k = 0; k < arms; k++) genStarArm(segs, 0, 0, k / arms * Math.PI * 2 + Math.random() * 0.4, unit * 0.085 * sz, 0, 5);
  } else if (type === 'spiral') {
    genSpiral(segs, 3.2, unit * 0.012 * sz);
    centerSegs(segs);
  } else if (type === 'koch') {
    genKoch(segs, unit * 0.26 * sz, 3);
  } else if (type === 'dragon') {
    genDragon(segs, 9, unit * 0.026 * sz);
    centerSegs(segs);
  } else { // sierpinski arrowhead
    var s = expandLsys('A', { 'A': 'B-A-B', 'B': 'A+B+A' }, 5);
    turtle(segs, s, unit * 0.03 * sz, 60);
    centerSegs(segs);
  }
  return {
    type: type, x: gx, y: gy, born: t, segs: segs,
    hue: Math.random() * 360, life: LIFE * (0.7 + Math.random() * 0.6),
  };
}

function spawn(type, gx, gy) {
  if (insts.length >= MAX_INSTANCES) insts.shift();
  insts.push(makeInstance(type, gx, gy, state.time));
}

function initFractseed() {
  fsW = state.COLS; fsH = state.ROWS;
  AR = state.CHAR_W / state.CHAR_H || 0.5;
  insts = [];
  typeIdx = 0; wind = 0; dragTimer = 0; idleTimer = 0; hintT = 3.2;
  lastDown = false;
  // seed a few so it's alive on load
  spawn('tree', fsW * 0.5, fsH * 0.92);
  spawn('star', fsW * 0.26, fsH * 0.4);
  spawn('koch', fsW * 0.74, fsH * 0.45);
}

// ---------- render ----------

function easeOut(p) { return 1 - (1 - p) * (1 - p) * (1 - p); }

// hsl (h 0-360, s/l 0-1) -> rgb 0-255. Computed ONCE per segment (not per cell)
// so the hot inner loop only does drawChar — this is the perf-critical path.
function hslRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = l - c / 2, r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [((r + m) * 255) | 0, ((g + m) * 255) | 0, ((b + m) * 255) | 0];
}

function drawSeg(x1, y1, x2, y2, r, g, b, a, front) {
  var dx = x2 - x1, dy = y2 - y1;
  var steps = (Math.max(Math.abs(dx), Math.abs(dy)) | 0) + 1;
  var ang = Math.atan2(dy, dx);
  var oct = Math.abs(Math.round(ang * 4 / Math.PI)) % 4;
  var ch = front ? '*' : LINE[oct];
  for (var j = 0; j <= steps; j++) {
    var f = j / steps;
    var xi = Math.round(x1 + dx * f);
    var yi = Math.round(y1 + dy * f);
    if (xi >= 0 && xi < fsW && yi >= 0 && yi < fsH) drawChar(ch, xi, yi, r, g, b, a);
  }
}

function renderFractseed() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!insts || fsW !== W || fsH !== H) initFractseed();
  AR = state.CHAR_W / state.CHAR_H || 0.5;
  var t = state.time, dt = 1 / 60;
  var mine = state.currentMode === 'fractseed';

  // ---- interaction ----
  if (mine && pointer.clicked) {
    pointer.clicked = false;
    spawn(TYPES[typeIdx], pointer.gx, pointer.gy);
    typeIdx = (typeIdx + 1) % TYPES.length;
    idleTimer = 0; hintT = 0;
  }
  if (mine && pointer.down) {
    var dgx = pointer.gx - lastGx;
    if (lastDown) wind = wind * 0.7 + dgx * 0.3;   // drag direction -> wind
    dragTimer -= dt;
    if (dragTimer <= 0) {
      dragTimer = 0.16;
      spawn(TYPES[(typeIdx + 3) % TYPES.length], pointer.gx + (Math.random() - 0.5) * 2, pointer.gy + (Math.random() - 0.5) * 2);
    }
    idleTimer = 0; hintT = 0;
  } else {
    wind *= 0.94;
  }
  lastGx = pointer.gx; lastDown = mine && pointer.down;

  // idle auto-seed
  idleTimer += dt;
  if (idleTimer > 2.6) {
    idleTimer = 0;
    spawn(TYPES[(Math.random() * TYPES.length) | 0], (0.15 + Math.random() * 0.7) * W, (0.2 + Math.random() * 0.65) * H);
  }

  // ---- draw instances ----
  for (var ii = insts.length - 1; ii >= 0; ii--) {
    var inst = insts[ii];
    var age = t - inst.born;
    if (age >= inst.life) { insts.splice(ii, 1); continue; }
    var p = easeOut(Math.min(1, age / GROW_DUR));   // growth progress
    var lifeFrac = age / inst.life;
    var fade = lifeFrac < FADE_FRAC ? 1 : (1 - (lifeFrac - FADE_FRAC) / (1 - FADE_FRAC));

    var sway = Math.sin(t * 0.8 + inst.x * 0.07) * SWAY_AMP;
    var segs = inst.segs;
    for (var si = 0; si < segs.length; si++) {
      var s = segs[si];
      if (s.o > p) continue;                          // not yet grown
      var isFront = (age < GROW_DUR) && (p - s.o) < 0.07;
      // local -> grid: apply aspect to y, add origin, sway grows with height
      var swA = sway * (1 - s.o) * 0.5 + sway * s.o;
      var x1 = inst.x + s.x1 + swA, y1 = inst.y + s.y1 * AR;
      var x2 = inst.x + s.x2 + swA, y2 = inst.y + s.y2 * AR;
      var hue = (inst.hue + s.d * 14 + s.o * 50 + t * 26) % 360;
      var lL = isFront ? 0.9 : (0.50 + s.d * 0.02);
      if (lL > 0.92) lL = 0.92;
      var a = isFront ? Math.min(1, fade + 0.2) : fade * 0.92;
      if (a < 0.04) continue;
      var rgb = hslRgb(hue, 0.82, lL);
      drawSeg(x1, y1, x2, y2, rgb[0], rgb[1], rgb[2], a, isFront);
    }
  }

  // fading hint
  if (hintT > 0) {
    hintT -= dt;
    var hint = 'tap = plant fractal  ·  drag = wind + scatter';
    var hx = ((W - hint.length) / 2) | 0;
    var hl = Math.min(48, hintT * 16) | 0;
    for (var hi = 0; hi < hint.length; hi++) drawCharHSL(hint[hi], hx + hi, H - 2, 200, 30, hl);
  }
}

registerMode('fractseed', { init: initFractseed, render: renderFractseed });
