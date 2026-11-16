import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// xmastree: a port of an ASCII artist's "art.py" Christmas-tree reel. A 3D
// point-cloud scene, spun about the vertical axis, projected with perspective
// onto the character grid with a per-cell z-buffer. Three layers, as in the
// original: cv.solid (shaded points, glyph by brightness), cv.glow (additive
// light, depth-tested so bulbs behind the tree disappear), cv.marks (literal
// glyphs). Each @layer reads grown("name") so the scene assembles in stages:
//   ground -> tree (white swirl climbs it, tip flashes) -> ornaments pop one by
//   one -> bulb string switches on from the bottom -> star -> hearts -> gifts
//   rise out of the snow -> snow -> "run": the bulbs chase.
// Tap the tree: hang an ornament there. Tap anywhere else: replay the build.
// Drag: wind that blows the snow.

var MODE = 'xmastree';
var TAU = Math.PI * 2;
var RAMP = ' .:-=+*#%@';
var GRAMP = ' .:+*#@';

var RED = [255, 40, 70], GOLD = [255, 196, 40], SILVER = [205, 228, 255];
var WARM = [255, 186, 80], GREEN = [50, 255, 120], BLUE = [60, 130, 255];
var WHITE = [255, 255, 255], PINK = [255, 80, 190], WOOD = [235, 120, 40];
var SNOW = [225, 245, 255], CYAN = [40, 230, 255], VIOLET = [175, 95, 255];

// build schedule (seconds of build time): the reel's WHERE[...] line marks
var STAGE = {
  ground: [0, 0.4], tree: [0.3, 2.8], deco: [2.8, 4.6], bulbs: [4.4, 6.0],
  star: [5.8, 6.8], hearts: [6.6, 7.6], gifts: [7.4, 9.0], snow: [8.8, 10.4],
  run: [10.2, 11.0],
};
var BUILD_END = 11.0;

var K_SKY = 1, K_TREE = 2, K_GIFT = 3, K_GROUND = 4, K_DECO = 5;

// ---------------------------------------------------------------- helpers
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function gauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(TAU * rng()); }
// pop-in with a little overshoot ("하나씩 톡톡 생겨요")
function ease(x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  var c1 = 1.70158, c3 = c1 + 1, u = x - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
// tree radius at height y (-0.86 .. 1.0), gently tiered
function silhouette(y) {
  var h = clamp((y + 0.86) / 1.86, 0, 1);
  var f = (h * 6) % 1;
  return Math.max(0, 0.97 * (1 - h) * (0.84 + 0.16 * (1 - f)));
}

// ---------------------------------------------------------------- geometry (once)
var G = null;
function buildGeometry() {
  var rng = mulberry(20261225);
  var g = {};
  // TREE: surface point cloud with outward normals, greens + snow dust
  var NT = 8000;
  g.nt = NT;
  g.tx = new Float32Array(NT); g.ty = new Float32Array(NT); g.tz = new Float32Array(NT);
  g.nx = new Float32Array(NT); g.ny = new Float32Array(NT); g.nz = new Float32Array(NT);
  g.cr = new Float32Array(NT); g.cg = new Float32Array(NT); g.cb = new Float32Array(NT);
  g.dust = new Uint8Array(NT);
  var greens = [GREEN, [30, 225, 90], [130, 255, 70], [0, 255, 175], [70, 255, 40]];
  for (var i = 0; i < NT; i++) {
    var h = 1 - Math.sqrt(rng());
    var y = -0.86 + 1.86 * h;
    var a = rng() * TAU;
    var r = silhouette(y) * (0.86 + 0.14 * Math.sqrt(rng()));
    g.tx[i] = r * Math.sin(a); g.ty[i] = y; g.tz[i] = r * Math.cos(a);
    var nx = Math.sin(a) + 0.3 * gauss(rng), ny = 0.55 + 0.3 * gauss(rng), nz = Math.cos(a) + 0.3 * gauss(rng);
    var nl = Math.hypot(nx, ny, nz); g.nx[i] = nx / nl; g.ny[i] = ny / nl; g.nz[i] = nz / nl;
    var c, k;
    if (rng() < 0.07) { c = SNOW; k = 0.9; g.dust[i] = 1; }      // TREE_C[DUST] = SNOW * .9
    else { c = greens[(rng() * greens.length) | 0]; k = 0.55 + 0.35 * rng(); }
    g.cr[i] = c[0] * k; g.cg[i] = c[1] * k; g.cb[i] = c[2] * k;
  }
  // TRUNK = np.c_[.11 sin(i), uniform(-1, -.8), .11 cos(i)]
  g.trunk = [];
  for (i = 0; i < 900; i++) g.trunk.push([0.11 * Math.sin(i), -1 + 0.2 * rng(), 0.11 * Math.cos(i)]);
  // SWIRL = sort(random(180))
  g.swirl = []; for (i = 0; i < 180; i++) g.swirl.push(rng()); g.swirl.sort();
  // 3. ornaments: K = 34 balls on a sunflower spiral, RED / GOLD / SILVER
  var K = 34; g.balls = [];
  for (i = 0; i < K; i++) {
    var oy = -0.78 + (0.85 + 0.78) * i / (K - 1), oa = i * 2.39996;
    var or = silhouette(oy) * 1.02 + 0.04;
    g.balls.push({ p: [or * Math.sin(oa), oy, or * Math.cos(oa)], c: [RED, GOLD, SILVER][i % 3] });
  }
  // DOT: 60 unit vectors (sphere sample)
  g.dot = [];
  for (i = 0; i < 70; i++) {
    var dx = gauss(rng), dy = gauss(rng), dz = gauss(rng), dl = Math.hypot(dx, dy, dz);
    g.dot.push([dx / dl, dy / dl, dz / dl]);
  }
  // 4. bulb string: NB = 170, 5.5 turns
  var NB = 170; g.bulbs = [];
  for (i = 0; i < NB; i++) {
    var s = i / (NB - 1), ly = -0.82 + 1.72 * s, la = s * TAU * 5.5;
    var lr = silhouette(ly) * 1.03 + 0.03;
    g.bulbs.push({ s: s, p: [lr * Math.sin(la), ly, lr * Math.cos(la)], c: [WARM, RED, GOLD, GREEN][i % 4] });
  }
  // 5. star: 10 tips, filled by triangle sampling
  var tips = [];
  for (i = 0; i < 10; i++) {
    var ang = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 === 0 ? 0.26 : 0.11;
    tips.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
  }
  g.star = [];
  for (i = 0; i < 1800; i++) {
    var u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    var tri = (rng() * 10) | 0, A = tips[tri], B = tips[(tri + 1) % 10];
    var sx = A[0] * u + B[0] * v, sy = A[1] * u + B[1] * v;
    g.star.push([sx, sy, Math.hypot(sx, sy) / 0.26]);
  }
  // 6. hearts: five, on the surface
  var HY = [-0.55, -0.2, 0.12, 0.45, 0.72], HA = [0.4, 2.6, 4.6, 1.5, 3.6];
  g.hearts = [];
  for (i = 0; i < 5; i++) {
    var hr = silhouette(HY[i]) * 1.04 + 0.06;
    g.hearts.push([hr * Math.sin(HA[i]), HY[i], hr * Math.cos(HA[i])]);
  }
  // 7. gifts (a, dist, w, h, d, c1, c2)
  var GIFTS = [
    [0.75, 1.12, 0.34, 0.26, 0.3, WHITE, PINK],
    [-0.4, 1.08, 0.44, 0.32, 0.38, RED, GOLD],
    [1.75, 1.0, 0.3, 0.22, 0.3, GREEN, RED],
    [2.8, 1.1, 0.48, 0.36, 0.4, GOLD, RED],
    [-1.7, 1.05, 0.36, 0.42, 0.32, BLUE, WHITE],
    [-2.6, 0.98, 0.28, 0.2, 0.28, RED, WHITE],
  ];
  var NRM = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  g.box = [];
  for (var b = 0; b < GIFTS.length; b++) {
    var G6 = GIFTS[b], w = G6[2], hh = G6[3], d = G6[4];
    var pts = [];
    for (i = 0; i < 900; i++) {
      var f = (rng() * 5) | 0, p = rng() - 0.5, q = rng() - 0.5, loc;
      if (f === 0) loc = [p * w, hh, q * d];
      else if (f === 1) loc = [w / 2, (p + 0.5) * hh, q * d];
      else if (f === 2) loc = [-w / 2, (p + 0.5) * hh, q * d];
      else if (f === 3) loc = [p * w, (q + 0.5) * hh, d / 2];
      else loc = [p * w, (q + 0.5) * hh, -d / 2];
      var rib = Math.abs(loc[0]) < 0.03 || Math.abs(loc[2]) < 0.03;
      pts.push([loc[0], loc[1], loc[2], NRM[f], rib ? G6[6] : G6[5]]);
    }
    // two ribbon loops on top
    for (i = 0; i < 120; i++) {
      var kk = i / 120 * TAU, sg = Math.sign(Math.sin(kk)) || 1;
      pts.push([0.07 * Math.cos(kk) * sg + 0.06 * sg, hh + 0.05 + 0.04 * Math.sin(2 * kk), 0, NRM[0],
        [Math.min(255, G6[6][0] * 1.1), Math.min(255, G6[6][1] * 1.1), Math.min(255, G6[6][2] * 1.1)]]);
    }
    g.box.push({ a: G6[0], dist: G6[1], pts: pts });
  }
  // ground: a snowy disc
  g.ground = [];
  for (i = 0; i < 4200; i++) {
    var gr = 2.0 * Math.sqrt(rng()), ga = rng() * TAU;
    var nx2 = 0.35 * gauss(rng), nz2 = 0.35 * gauss(rng);
    g.ground.push([gr * Math.sin(ga), -1 + 0.015 * gauss(rng), gr * Math.cos(ga), nx2, nz2, 0.16 + 0.24 * rng(), rng() < 0.12]);
  }
  // 8. snow: NS = 420
  var NS = 420; g.ns = NS;
  g.sx = []; g.sz = []; g.sph = []; g.ssp = [];
  for (i = 0; i < NS; i++) {
    g.sx.push(-2.6 + 5.2 * rng()); g.sz.push(-2 + 4.6 * rng());
    g.sph.push(rng() * 3); g.ssp.push(0.18 + 0.14 * rng());
  }
  return g;
}

// ---------------------------------------------------------------- per-layout buffers
var M = null;   // grid buffers + layout
var S = null;   // simulation state

function buildLayout() {
  var W = state.COLS, H = state.ROWS, n = W * H;
  var m = {
    w: W, h: H, cw: state.CHAR_W, ch: state.CHAR_H,
    zb: new Float32Array(n), kind: new Uint8Array(n), pid: new Int32Array(n),
    sr: new Float32Array(n), sg: new Float32Array(n), sb: new Float32Array(n),
    gr: new Float32Array(n), gg: new Float32Array(n), gb: new Float32Array(n),
    mk: new Uint16Array(n), mr: new Uint8Array(n), mg: new Uint8Array(n), mb: new Uint8Array(n),
  };
  var pw = W * m.cw, ph = H * m.ch;
  m.pw = pw; m.ph = ph;
  m.SC = Math.min(0.245 * ph, pw / 2.05);
  m.OX = pw * 0.5;
  m.OY = 0.2 * ph + 1.62 * m.SC;
  m.snowW = Math.max(2.6, pw / (2 * m.SC) * 0.9);
  var portrait = ph > pw;
  var mr = 0.11 * Math.min(pw, ph * 0.6);
  m.bodies = portrait ? [
    { x: 0.2 * pw, y: 0.1 * ph, r: mr, kind: 'moon' },
    { x: 0.83 * pw, y: 0.13 * ph, r: mr * 0.78, kind: 'blue' },
    { x: 0.09 * pw, y: 0.43 * ph, r: mr * 0.36, kind: 'violet' },
  ] : [
    { x: 0.2 * pw, y: 0.2 * ph, r: mr, kind: 'moon' },
    { x: 0.8 * pw, y: 0.22 * ph, r: mr * 0.8, kind: 'blue' },
    { x: 0.1 * pw, y: 0.56 * ph, r: mr * 0.4, kind: 'violet' },
  ];
  // background star field
  var rng = mulberry(W * 131 + H);
  m.bg = new Uint16Array(n); m.bgc = new Uint8Array(n); m.bgp = new Float32Array(n);
  var chars = '..,:+*'.split('');
  for (var i = 0; i < n; i++) {
    if (rng() < 0.045) {
      m.bg[i] = chars[(rng() * chars.length) | 0].charCodeAt(0);
      m.bgc[i] = (rng() * 5) | 0; m.bgp[i] = rng() * TAU;
    }
  }
  // moon craters
  m.craters = [];
  for (i = 0; i < 7; i++) m.craters.push([rng() * 1.4 - 0.7, rng() * 1.4 - 0.7, 0.12 + 0.18 * rng()]);
  // glow / mark queues
  m.gq = new Float32Array(9000 * 7); m.gn = 0;
  m.mq = [];
  return m;
}

function initXmas() {
  var want = state.isMobile ? 0.75 : 0.62;
  if (state.FONT_SCALE !== want) { state.FONT_SCALE = want; resize(); }
  if (!G) G = buildGeometry();
  M = buildLayout();
  if (!S) {
    S = { lastT: state.time, t: 0, tb: 0, wind: 0, wx: 0, extra: [], lastGx: -1, lastGy: -1,
      dragging: false, hintT: 0, nextCol: 0, sparks: [] };
  }
}

function cleanupXmas() {
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  M = null; S = null;
}

// ---------------------------------------------------------------- 3D pipeline
var CA = 1, SA = 0;                        // spin
var TILT = 0.16, CT = Math.cos(TILT), ST = Math.sin(TILT);
var CAMD = 10;
var LX = -0.5, LY = 0.62, LZ = 0.62;
(function () { var l = Math.hypot(LX, LY, LZ); LX /= l; LY /= l; LZ /= l; })();
var PX = 0, PY = 0, PZ = 0;
var RX = 0, RZ = 0;

function spin(x, z) { RX = x * CA + z * SA; RZ = -x * SA + z * CA; }
function lambert(nx, ny, nz) { var d = nx * LX + ny * LY + nz * LZ; return d > 0 ? d : 0; }

// camera-space point (y up, z toward viewer) -> screen pixels + depth
function project(x, y, z) {
  var y1 = y * CT - z * ST, z1 = y * ST + z * CT;
  var p = CAMD / (CAMD - z1);
  PX = M.OX + M.SC * x * p;
  PY = M.OY - M.SC * y1 * p;
  PZ = z1;
}

function putSolid(x, y, z, r, g, b, kind, id) {
  project(x, y, z);
  var cx = (PX / M.cw) | 0, cy = (PY / M.ch) | 0;
  if (PX < 0 || PY < 0 || cx >= M.w || cy >= M.h) return;
  var i = cy * M.w + cx;
  if (PZ <= M.zb[i]) return;
  M.zb[i] = PZ; M.kind[i] = kind; M.pid[i] = id;
  M.sr[i] = r; M.sg[i] = g; M.sb[i] = b;
}

function putGlow(x, y, z, r, g, b, halo) {
  if (M.gn >= 9000) return;
  var o = M.gn * 7;
  M.gq[o] = x; M.gq[o + 1] = y; M.gq[o + 2] = z;
  M.gq[o + 3] = r; M.gq[o + 4] = g; M.gq[o + 5] = b; M.gq[o + 6] = halo;
  M.gn++;
}

function addGlowCell(cx, cy, z, r, g, b) {
  if (cx < 0 || cy < 0 || cx >= M.w || cy >= M.h) return;
  var i = cy * M.w + cx;
  if (M.zb[i] > z + 0.04) return;           // something solid in front
  M.gr[i] += r; M.gg[i] += g; M.gb[i] += b;
}

function resolveGlow() {
  var q = M.gq;
  for (var k = 0; k < M.gn; k++) {
    var o = k * 7;
    project(q[o], q[o + 1], q[o + 2]);
    if (PX < -M.cw || PY < -M.ch) continue;
    var cx = Math.floor(PX / M.cw), cy = Math.floor(PY / M.ch);
    // dimmer at the back of the scene
    var dim = 0.55 + 0.45 * clamp((PZ + 1.1) / 2.2, 0, 1);
    var r = q[o + 3] * dim, g = q[o + 4] * dim, b = q[o + 5] * dim, z = PZ;
    addGlowCell(cx, cy, z, r, g, b);
    var h = q[o + 6];
    if (h > 0) {
      addGlowCell(cx - 1, cy, z, r * h, g * h, b * h);
      addGlowCell(cx + 1, cy, z, r * h, g * h, b * h);
      addGlowCell(cx, cy - 1, z, r * h * 0.6, g * h * 0.6, b * h * 0.6);
      addGlowCell(cx, cy + 1, z, r * h * 0.6, g * h * 0.6, b * h * 0.6);
    }
  }
}

function putMark(x, y, z, str, col) { M.mq.push([x, y, z, str, col]); }

function resolveMarks() {
  for (var k = 0; k < M.mq.length; k++) {
    var e = M.mq[k];
    project(e[0], e[1], e[2]);
    var cx = Math.floor(PX / M.cw), cy = Math.floor(PY / M.ch);
    if (cy < 0 || cy >= M.h) continue;
    for (var j = 0; j < e[3].length; j++) {
      var x = cx + j;
      if (x < 0 || x >= M.w) continue;
      var i = cy * M.w + x;
      if (M.zb[i] > PZ + 0.05) continue;
      M.mk[i] = e[3].charCodeAt(j);
      M.mr[i] = Math.min(255, e[4][0]); M.mg[i] = Math.min(255, e[4][1]); M.mb[i] = Math.min(255, e[4][2]);
    }
  }
}

// ---------------------------------------------------------------- stages
function grown(name) {
  var st = STAGE[name];
  return clamp((S.tb - st[0]) / (st[1] - st[0]), 0, 1);
}

function layerSky(t) {
  var bodies = M.bodies;
  for (var b = 0; b < bodies.length; b++) {
    var B = bodies[b];
    var x0 = Math.max(0, ((B.x - B.r) / M.cw) | 0), x1 = Math.min(M.w - 1, ((B.x + B.r) / M.cw) | 0);
    var y0 = Math.max(0, ((B.y - B.r) / M.ch) | 0), y1 = Math.min(M.h - 1, ((B.y + B.r) / M.ch) | 0);
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var dx = ((cx + 0.5) * M.cw - B.x) / B.r, dy = ((cy + 0.5) * M.ch - B.y) / B.r;
        var d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        var nz = Math.sqrt(1 - d2);
        var lam = 0.12 + 0.95 * lambert(dx, -dy, nz);
        var col;
        if (B.kind === 'moon') {
          var cr = 1;
          for (var c = 0; c < M.craters.length; c++) {
            var C = M.craters[c], ex = dx - C[0], ey = dy - C[1];
            if (ex * ex + ey * ey < C[2] * C[2]) cr = 0.55;
          }
          col = [255 * lam * cr, 246 * lam * cr, 205 * lam * cr];
        } else if (B.kind === 'blue') {
          // banded, slowly turning
          var lat = dy * 7 + Math.sin(dx * 3 + t * 0.3) * 0.6;
          var band = 0.75 + 0.25 * Math.sin(lat);
          col = [BLUE[0] * lam * band, BLUE[1] * lam * band + 40 * lam * (1 - band), BLUE[2] * lam];
        } else {
          col = [VIOLET[0] * lam, VIOLET[1] * lam, VIOLET[2] * lam];
        }
        var i = cy * M.w + cx;
        if (M.zb[i] < -50) { M.zb[i] = -50; M.kind[i] = K_SKY; M.sr[i] = col[0]; M.sg[i] = col[1]; M.sb[i] = col[2]; }
      }
    }
    // halo ring
    if (B.kind !== 'moon') continue;
  }
}

function layerGround() {
  var g = grown('ground');
  if (g <= 0) return;
  var gp = G.ground;
  for (var i = 0; i < gp.length; i++) {
    var p = gp[i];
    spin(p[0], p[2]);
    var lam = 0.45 + 0.55 * lambert(p[3], 1, p[4]);
    var k = p[5] * lam * g;
    var c = p[6] ? CYAN : SNOW;
    putSolid(RX, p[1], RZ, c[0] * k, c[1] * k, c[2] * k, K_GROUND, -1);
  }
}

function layerTree(t) {
  var g = grown('tree');
  var top = -1 + 2.1 * g;                  // grown this far
  var nt = G.nt;
  for (var i = 0; i < nt; i++) {
    var y = G.ty[i];
    if (y >= top) continue;
    spin(G.tx[i], G.tz[i]);
    var nx = G.nx[i] * CA + G.nz[i] * SA, nz = -G.nx[i] * SA + G.nz[i] * CA;
    var sh = (0.4 + 0.6 * lambert(nx, G.ny[i], nz)) * 1.25;
    var r = G.cr[i] * sh, gg = G.cg[i] * sh, b = G.cb[i] * sh;
    if (G.dust[i]) { var tw = 0.75 + 0.45 * Math.sin(t * 3 + i); r *= tw; gg *= tw; b *= tw; }
    var tip = clamp(1 - (top - y) / 0.1, 0, 1);   // freshly grown -> white
    if (tip > 0) {
      r = r * (1 - tip) + 280 * tip; gg = gg * (1 - tip) + 280 * tip; b = b * (1 - tip) + 280 * tip;
    }
    putSolid(RX, y, RZ, r, gg, b, K_TREE, i);
  }
  if (g > 0) {
    var tr = G.trunk;
    for (i = 0; i < tr.length; i++) {
      spin(tr[i][0], tr[i][2]);
      var l = 0.5 + 0.5 * lambert(RX / 0.11, 0, RZ / 0.11);
      putSolid(RX, tr[i][1], RZ, WOOD[0] * l, WOOD[1] * l, WOOD[2] * l, K_TREE, -1);
    }
  }
  // white swirl climbs while the tree grows, fading at the tip
  if (g > 0 && g < 1) {
    var fade = Math.min(1, (1 - g) / 0.1);
    for (var arm = 0; arm < 2; arm++) {
      for (var j = 0; j < G.swirl.length; j++) {
        var k = G.swirl[j];
        var yy = top + 0.06 - 0.32 * k;
        if (yy <= -0.97) continue;
        var rr = silhouette(clamp(yy, -0.86, 1.0)) * 1.05 + 0.06;
        for (var tail = 0; tail <= 0.24; tail += 0.12) {
          var a = yy * 15 - t * 9 + arm * Math.PI + tail;
          var bb = (0.2 + 0.8 * Math.pow(1 - k, 1.3)) * (1 - tail * 2.5) * fade;
          spin(rr * Math.sin(a), rr * Math.cos(a));
          putGlow(RX, yy, RZ, 255 * bb, 255 * bb, 255 * bb, 0);
        }
      }
    }
  }
  // tip flash when it reaches the top
  var over = S.tb - STAGE.tree[1];
  if (over >= 0 && over < 0.5) {
    var f = 1 - over / 0.5;
    var rays = [[1, 0, 0.5], [-1, 0, 0.5], [0, 1, 0.5], [0, -1, 0.5], [0.7, 0.7, 0.25], [-0.7, 0.7, 0.25], [0.7, -0.7, 0.25], [-0.7, -0.7, 0.25]];
    for (var q = 0; q < rays.length; q++) {
      for (var s = 0; s < 30; s++) {
        var u = s / 29;
        var w = 255 * f * (1 - u);
        putGlow(rays[q][0] * u * rays[q][2] * f, 1.08 + rays[q][1] * u * rays[q][2] * f, 0.1, w, w, w, 0);
      }
    }
    putGlow(0, 1.08, 0.1, 1020 * f, 1020 * f, 1020 * f, 0.5);
  }
}

function drawBall(p, c, s, kind) {
  // a shaded sphere of radius s with a specular glint
  var D = G.dot;
  for (var j = 0; j < D.length; j++) {
    var d = D[j];
    spin(p[0] + d[0] * s, p[2] + d[2] * s);
    var px = RX, pz = RZ;
    var nx = d[0] * CA + d[2] * SA, nz = -d[0] * SA + d[2] * CA;
    var lam = lambert(nx, d[1], nz);
    var sh = 0.3 + 0.75 * lam;
    // reflect the light about the normal, compare with the view axis
    var rz = 2 * (nx * LX + d[1] * LY + nz * LZ) * nz - LZ;
    var spec = Math.pow(clamp(rz, 0, 1), 12);
    putSolid(px, p[1] + d[1] * s, pz, c[0] * sh + 255 * spec, c[1] * sh + 255 * spec, c[2] * sh + 255 * spec, kind, -1);
  }
}

function layerOrnaments() {
  var K = G.balls.length;
  var g = grown('deco') * K;
  for (var k = 0; k < K; k++) {
    var s = ease(g - k) * 0.08;
    if (s <= 0) continue;
    drawBall(G.balls[k].p, G.balls[k].c, s, K_DECO);
  }
  // hand-hung ornaments
  for (var e = 0; e < S.extra.length; e++) {
    var o = S.extra[e];
    var se = ease((S.t - o.born) * 2.2) * 0.1;
    if (se > 0) drawBall(o.p, o.c, se, K_DECO);
  }
}

function layerLights(t) {
  var on = grown('bulbs'), fin = grown('run');
  var B = G.bulbs, NB = B.length;
  for (var i = 0; i < NB; i++) {
    if (!(B[i].s < on)) continue;          // switch on from the bottom
    var tw = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7);
    var ch = (((i - t * 40) % 24) + 24) % 24;
    var chase = Math.exp(-ch / 3) * fin;
    var b = (tw + 1.2 * chase) * 1.1;
    var p = B[i].p, c = B[i].c;
    spin(p[0], p[2]);
    putGlow(RX, p[1], RZ, c[0] * b, c[1] * b, c[2] * b, 0.3 + 0.2 * chase);
    for (var dx = -0.025; dx <= 0.026; dx += 0.05) {
      putGlow(RX + dx, p[1], RZ, c[0] * b * 0.35, c[1] * b * 0.35, c[2] * b * 0.35, 0);
    }
  }
}

function layerStar(t) {
  var s = ease(grown('star') * 1.4);
  if (s <= 0) return;
  // the star faces the camera but wobbles about its axis
  var w = 0.7 + 0.3 * Math.cos(t * 0.9);   // slow spin wobble, always face-on
  var st = G.star;
  for (var i = 0; i < st.length; i++) {
    var e = st[i];
    var k = 1.25 - 0.5 * e[2];
    putSolid(e[0] * s * w, 1.17 + e[1] * s, 0.05, GOLD[0] * k, GOLD[1] * k, GOLD[2] * k, K_DECO, -1);
  }
  var fl = 0.6 + 0.4 * Math.pow(Math.sin(t * 5), 2);
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]];
  for (var d = 0; d < dirs.length; d++) {
    var dx = dirs[d][0], dy = dirs[d][1];
    var L = (dx * dy === 0 ? 0.42 : 0.26) * s * fl;
    for (var q = 0; q < 30; q++) {
      var kk = q / 29;
      putGlow(dx * kk * L, 1.17 + dy * kk * L / 2, 0.1, WARM[0] * (1 - kk), WARM[1] * (1 - kk), WARM[2] * (1 - kk), 0);
    }
  }
}

function layerHearts(t) {
  var g = grown('hearts') * 5, fin = grown('run');
  for (var k = 0; k < 5; k++) {
    if (!(g > k)) continue;
    var beat = 0.7 + 0.3 * Math.pow(Math.sin(t * 4 + k), 2) + 0.3 * fin;
    var p = G.hearts[k];
    spin(p[0], p[2]);
    var m = Math.min(1.25, beat);
    putMark(RX, p[1], RZ, '<3', [PINK[0] * m, PINK[1] * m, PINK[2] * m]);
    putGlow(RX, p[1] + 0.03, RZ + 0.02, PINK[0] * 0.5 * beat, PINK[1] * 0.5 * beat, PINK[2] * 0.5 * beat, 0.4);
  }
}

function layerGifts() {
  var g = grown('gifts') * G.box.length;
  for (var k = 0; k < G.box.length; k++) {
    var s = ease(g - k);                   // rise out of the snow
    if (s <= 0) continue;
    var bx = G.box[k], c = Math.cos(bx.a), sn = Math.sin(bx.a);
    var ox = bx.dist * Math.sin(bx.a), oz = bx.dist * Math.cos(bx.a);
    for (var i = 0; i < bx.pts.length; i++) {
      var e = bx.pts[i];
      var x = e[0] * c + e[2] * sn + ox, y = e[1] * s - 1, z = -e[0] * sn + e[2] * c + oz;
      var n = e[3];
      var nx = n[0] * c + n[2] * sn, nz = -n[0] * sn + n[2] * c;
      spin(x, z);
      var px = RX, pz = RZ;
      var nnx = nx * CA + nz * SA, nnz = -nx * SA + nz * CA;
      var sh = 0.35 + 0.65 * lambert(nnx, n[1], nnz);
      putSolid(px, y, pz, e[4][0] * sh * 1.15, e[4][1] * sh * 1.15, e[4][2] * sh * 1.15, K_GIFT, -1);
    }
  }
}

function layerSnow(t, dt) {
  var n = Math.floor(grown('snow') * G.ns);
  if (n === 0) return;
  for (var k = 0; k < n; k++) {
    var y = 2.0 - ((G.sph[k] + t * G.ssp[k]) % 3.0);
    var z = G.sz[k];
    var par = 0.6 + 0.4 * clamp((z + 2) / 4.6, 0, 1);     // nearer flakes drift more
    var sw = M.snowW;
    var x = G.sx[k] * sw / 2.6 + 0.06 * Math.sin(t * 1.3 + k) + S.wx * par;
    x = ((x + sw) % (2 * sw) + 2 * sw) % (2 * sw) - sw;
    if (k % 60 === 7) {
      putMark(x, y, z, '<3', PINK);
      continue;
    }
    var near = clamp((z + 2) / 4.6, 0, 1);
    var big = k % 5 === 0;
    // parallax: near flakes are bigger glyphs, far ones dots; strong wind streaks them
    var ch = Math.abs(S.wind) > 1.4 && near > 0.4 ? '-' : near > 0.8 && big ? '*' : near > 0.65 || big ? '+' : near > 0.3 ? '.' : '\u00B7';
    var col = near > 0.5 || big ? WHITE : [150, 215, 255];
    putMark(x, y, z, ch, col);
    if (big) putGlow(x, y, z, 120, 140, 160, 0);
  }
}

function layerSparks(dt) {
  for (var i = S.sparks.length - 1; i >= 0; i--) {
    var p = S.sparks[i];
    p.life -= dt;
    if (p.life <= 0) { S.sparks.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 1.5 * dt;
    var b = p.life / p.max;
    putGlow(p.x, p.y, p.z, p.c[0] * b * 1.4, p.c[1] * b * 1.4, p.c[2] * b * 1.4, 0);
  }
}

// ---------------------------------------------------------------- compose
function compose(t) {
  var W = M.w, H = M.h;
  var bgCols = [WHITE, GOLD, CYAN, PINK, VIOLET];
  for (var cy = 0; cy < H; cy++) {
    for (var cx = 0; cx < W; cx++) {
      var i = cy * W + cx;
      if (M.mk[i]) {
        drawChar(String.fromCharCode(M.mk[i]), cx, cy, M.mr[i], M.mg[i], M.mb[i], 1);
        continue;
      }
      var gr = M.gr[i], gg = M.gg[i], gb = M.gb[i];
      var gi = Math.max(gr, gg, gb) / 255;
      var r, g, b, lum, chI;
      if (M.zb[i] > -1e8) {
        lum = Math.max(M.sr[i], M.sg[i], M.sb[i]) / 255;
        // a bright light on a surface takes over the cell's colour
        var wgl = gi > 0.05 ? clamp(gi / (gi + lum * 0.6 + 0.01), 0, 1) : 0;
        var sk = 1 - wgl * 0.85, gk = 0.4 + 1.2 * wgl;
        r = M.sr[i] * sk + gr * gk; g = M.sg[i] * sk + gg * gk; b = M.sb[i] * sk + gb * gk;
        var L = Math.max(lum, gi * 0.9);
        chI = Math.min(RAMP.length - 1, Math.max(1, Math.round(clamp(L, 0, 1) * (RAMP.length - 1))));
        var ch = RAMP[chI];
        r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
        var mx = Math.max(r, g, b, 1);
        var k = (0.55 + 0.45 * clamp(L, 0, 1)) * 255 / mx;
        drawChar(ch, cx, cy, Math.min(255, r * k) | 0, Math.min(255, g * k) | 0, Math.min(255, b * k) | 0, 1);
      } else if (gi > 0.06) {
        chI = Math.min(GRAMP.length - 1, Math.max(1, Math.round(clamp(gi, 0, 1) * (GRAMP.length - 1))));
        var mg = Math.max(gr, gg, gb);
        var kg = 255 / mg;
        drawChar(GRAMP[chI], cx, cy, Math.min(255, gr * kg) | 0, Math.min(255, gg * kg) | 0, Math.min(255, gb * kg) | 0,
          clamp(0.45 + gi, 0.45, 1));
      } else if (M.bg[i]) {
        var c = bgCols[M.bgc[i]];
        var a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.1 + M.bgp[i]));
        drawChar(String.fromCharCode(M.bg[i]), cx, cy, c[0], c[1], c[2], a);
      }
    }
  }
}

function drawText(str, x, y, c, a) {
  for (var j = 0; j < str.length; j++) {
    if (x + j >= 0 && x + j < M.w) drawChar(str[j], x + j, y, c[0], c[1], c[2], a);
  }
}

// ---------------------------------------------------------------- input
function handleInput(dt) {
  if (state.currentMode !== MODE) return;
  if (pointer.clicked) {
    pointer.clicked = false;
    S.hintT = 99;
    var cx = Math.floor(pointer.gx), cy = Math.floor(pointer.gy);
    var hit = -1;
    for (var r = 0; r <= 1 && hit < 0; r++) {
      for (var dy = -r; dy <= r && hit < 0; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          var x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= M.w || y >= M.h) continue;
          var i = y * M.w + x;
          if ((M.kind[i] === K_TREE || M.kind[i] === K_DECO) && M.zb[i] > -1e8) {
            if (M.kind[i] === K_TREE && M.pid[i] >= 0) { hit = M.pid[i]; break; }
            if (hit < 0) hit = -2;
          }
        }
      }
    }
    if (hit === -1) {
      // replay the build
      S.tb = 0; S.extra = []; S.sparks = [];
    } else {
      var id = hit >= 0 ? hit : (Math.random() * G.nt) | 0;
      var tx = G.tx[id], ty = G.ty[id], tz = G.tz[id];
      var rr = Math.hypot(tx, tz) || 1, out = silhouette(ty) * 1.03 + 0.05;
      var p = [tx / rr * out, ty, tz / rr * out];
      var cols = [RED, GOLD, SILVER, PINK, CYAN, VIOLET];
      var col = cols[S.nextCol++ % cols.length];
      S.extra.push({ p: p, c: col, born: S.t });
      if (S.extra.length > 40) S.extra.shift();
      spin(p[0], p[2]);
      for (var s = 0; s < 18; s++) {
        var a = Math.random() * TAU, v = 0.3 + Math.random() * 0.5;
        S.sparks.push({ x: RX, y: p[1], z: RZ, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.3, vz: 0.2,
          c: col, life: 0.6 + Math.random() * 0.4, max: 1 });
      }
    }
  }
  // drag: wind
  var target = 0;
  if (pointer.down) {
    if (S.dragging) {
      var ddx = (pointer.gx - S.lastGx) * M.cw / M.SC;
      if (dt > 0) target = clamp(ddx / dt * 0.9, -5, 5);
      S.windHold = target;
    }
    S.dragging = true; S.lastGx = pointer.gx; S.lastGy = pointer.gy;
    if (Math.abs(S.windHold || 0) > 0.05) S.hintT = 99;
    target = S.windHold || 0;
  } else {
    S.dragging = false; S.windHold = 0;
  }
  S.wind += (target - S.wind) * Math.min(1, dt * (pointer.down ? 6 : 1.2));
  S.wx += S.wind * dt;
}

// ---------------------------------------------------------------- render
function renderXmas() {
  clearCanvas();
  if (!M || !S || M.w !== state.COLS || M.h !== state.ROWS || M.cw !== state.CHAR_W) initXmas();
  var now = state.time;
  if (now < S.lastT) S.lastT = now;
  var dt = Math.min(0.1, now - S.lastT); S.lastT = now;
  S.t += dt; S.tb += dt; S.hintT += dt;
  var t = S.t;

  handleInput(dt);

  var A = t * 0.45;
  CA = Math.cos(A); SA = Math.sin(A);

  var n = M.w * M.h;
  M.zb.fill(-1e9); M.kind.fill(0); M.gr.fill(0); M.gg.fill(0); M.gb.fill(0); M.mk.fill(0);
  M.gn = 0; M.mq.length = 0;

  layerSky(t);
  layerGround();
  layerTree(t);
  layerOrnaments();
  layerLights(t);
  layerStar(t);
  layerHearts(t);
  layerGifts();
  layerSnow(t, dt);
  layerSparks(dt);
  resolveGlow();
  resolveMarks();
  compose(t);

  // status line, as in the reel's terminal
  var deg = ((A * 180 / Math.PI) % 360).toFixed(1);
  var built = Math.round(clamp(S.tb / BUILD_END, 0, 1) * 100);
  drawText('spin ' + deg + 'deg  built ' + built + '%', 1, M.h - 1, CYAN, 0.9);
  if (S.hintT < 9) {
    var hint = state.isMobile ? 'tap tree: ornament  tap sky: rebuild  drag: wind'
      : 'click tree: hang ornament · click sky: rebuild · drag: wind';
    if (hint.length > M.w - 2) hint = 'tap tree/sky · drag: wind';
    drawText(hint, Math.max(1, ((M.w - hint.length) / 2) | 0), M.h - 2, PINK, 0.85);
  }
  void n;
}

registerMode(MODE, { init: initXmas, render: renderXmas, cleanup: cleanupXmas });
