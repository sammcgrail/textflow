import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// carousel: a 3D point-cloud merry-go-round that assembles itself in layers,
// in the same solid / glow / marks style as xmastree. Points are rotated about
// the vertical axis, tilted toward the camera, projected with perspective and
// z-buffered per character cell; light sources are additive glow that hides
// behind solid geometry and dims toward the back.
//   platform spreads out from the centre -> mirrored column rises -> golden
//   barber poles shoot up -> striped canopy sweeps round -> scalloped valance
//   -> eight horses pop onto their poles -> rim bulbs switch on -> pennant ->
//   "run": it spins up, the horses gallop up and down, the bulbs chase and
//   fireworks go off.
// Drag sideways: push the carousel round (it coasts back to cruising speed).
// Drag up/down: tilt the camera. Tap the sky: a firework there. Tap a horse:
// it spins up fast (then coasts back) with a sparkle burst. Tap the rest of
// the ride: a shower of coloured bulbs and stars falls from the canopy edge.

var MODE = 'carousel';
var TAU = Math.PI * 2;
var RAMP = ' .:-=+*#%@';
var GRAMP = ' .:+*#@';

var PINK = [255, 50, 170], WHITE = [255, 255, 255], CYAN = [40, 225, 255];
var GOLD = [255, 200, 40], VIOLET = [170, 80, 255], LIME = [150, 255, 60];
var ORANGE = [255, 130, 30], RED = [255, 40, 70], BLUE = [60, 120, 255];
var MINT = [40, 255, 190];

var STAGE = {
  platform: [0, 1.4], column: [1.2, 2.2], poles: [2.0, 3.2], canopy: [3.0, 4.6],
  valance: [4.4, 5.0], horses: [4.8, 7.2], bulbs: [7.0, 8.2], flag: [8.0, 8.6],
  run: [8.4, 9.4],
};
var BUILD_END = 9.4;

var K_SKY = 1, K_RIDE = 2, K_HORSE = 3;

var PY0 = -0.95;         // platform top
var PR = 1.3;            // platform radius
var CY0 = 0.62;          // canopy rim height
var CR = 1.48;           // canopy rim radius
var APEX = 1.42;         // canopy apex
var POLE_R = 0.95;
var NH = 4;              // horses / poles
var HS = 1.9;           // horse scale

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
function ease(x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  var c1 = 1.70158, c3 = c1 + 1, u = x - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

// ---------------------------------------------------------------- geometry
var G = null;

// point record: [x, y, z, nx, ny, nz, r, g, b, tag]
function ellipsoid(out, rng, n, cx, cy, cz, a, b, c, col, tag) {
  for (var i = 0; i < n; i++) {
    var x = gauss(rng), y = gauss(rng), z = gauss(rng), l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    var nx = x / a, ny = y / b, nz = z / c, nl = Math.hypot(nx, ny, nz);
    out.push([cx + x * a, cy + y * b, cz + z * c, nx / nl, ny / nl, nz / nl, col[0], col[1], col[2], tag]);
  }
}
function rod(out, rng, n, x0, y0, z0, x1, y1, z1, rad, col, tag) {
  for (var i = 0; i < n; i++) {
    var u = rng(), a = rng() * TAU;
    var nx = Math.cos(a), nz = Math.sin(a);
    out.push([x0 + (x1 - x0) * u + nx * rad, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u + nz * rad, nx, 0, nz,
      col[0], col[1], col[2], tag]);
  }
}

// chain of spheres along a segment (neck, head, legs, tail)
function limb(out, rng, n, x0, y0, x1, y1, r0, r1, col) {
  for (var i = 0; i < n; i++) {
    var u = rng(), r = r0 + (r1 - r0) * u;
    var x = gauss(rng), y = gauss(rng), z = gauss(rng), l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    out.push([x0 + (x1 - x0) * u + x * r, y0 + (y1 - y0) * u + y * r, z * r, x, y, z, col[0], col[1], col[2], 0]);
  }
}

function buildHorse(rng, body, mane) {
  // side-profile carousel horse; local x = nose direction, y up, z outward;
  // origin = the pole through the saddle
  var P = [];
  ellipsoid(P, rng, 650, 0, 0, 0, 0.2, 0.085, 0.07, body, 0);            // barrel
  ellipsoid(P, rng, 200, 0.12, 0.015, 0, 0.09, 0.085, 0.068, body, 0);   // chest
  ellipsoid(P, rng, 200, -0.13, 0.01, 0, 0.09, 0.088, 0.07, body, 0);    // rump
  limb(P, rng, 260, 0.15, 0.05, 0.23, 0.21, 0.058, 0.042, body);         // neck, up and forward
  limb(P, rng, 200, 0.23, 0.22, 0.34, 0.15, 0.045, 0.028, body);         // head, muzzle down
  limb(P, rng, 24, 0.215, 0.25, 0.205, 0.3, 0.012, 0.006, body);         // ear
  limb(P, rng, 24, 0.235, 0.25, 0.235, 0.3, 0.012, 0.006, body);         // ear
  // front legs prancing (one bent at the knee), back legs planted
  limb(P, rng, 70, 0.13, -0.05, 0.22, -0.12, 0.024, 0.018, body);
  limb(P, rng, 60, 0.22, -0.12, 0.2, -0.21, 0.018, 0.014, body);
  limb(P, rng, 90, 0.11, -0.05, 0.15, -0.27, 0.022, 0.015, body);
  limb(P, rng, 90, -0.13, -0.05, -0.17, -0.27, 0.026, 0.015, body);
  limb(P, rng, 90, -0.1, -0.05, -0.09, -0.27, 0.026, 0.015, body);
  // gold hooves
  limb(P, rng, 14, 0.19, -0.21, 0.21, -0.22, 0.016, 0.016, GOLD);
  limb(P, rng, 14, 0.15, -0.27, 0.17, -0.28, 0.016, 0.016, GOLD);
  limb(P, rng, 14, -0.17, -0.27, -0.15, -0.28, 0.016, 0.016, GOLD);
  limb(P, rng, 14, -0.09, -0.27, -0.07, -0.28, 0.016, 0.016, GOLD);
  // mane along the top of the neck, tail streaming back
  limb(P, rng, 140, 0.13, 0.12, 0.22, 0.27, 0.028, 0.02, mane);
  limb(P, rng, 140, -0.2, 0.04, -0.31, -0.12, 0.03, 0.012, mane);
  // red saddle with a gold blanket edge
  ellipsoid(P, rng, 90, 0.0, 0.08, 0, 0.075, 0.022, 0.075, RED, 0);
  ellipsoid(P, rng, 60, 0.0, 0.055, 0, 0.09, 0.012, 0.074, GOLD, 0);
  return P;
}

function buildGeometry() {
  var rng = mulberry(31415);
  var g = {};
  var i, a, r, u;
  // platform: top disc with radial rays + striped rim side
  g.platform = [];
  for (i = 0; i < 3600; i++) {
    r = PR * Math.sqrt(rng()); a = rng() * TAU;
    var seg = Math.floor((a / TAU) * 16);
    var ring = Math.floor(r / PR * 5);
    var col = (seg + ring) % 2 ? [40, 200, 255] : [80, 90, 255];
    if (r > PR * 0.93) col = GOLD;
    var k = 0.3 + 0.14 * rng();
    g.platform.push([r * Math.cos(a), PY0, r * Math.sin(a), 0, 1, 0, col[0] * k, col[1] * k, col[2] * k, r / PR]);
  }
  for (i = 0; i < 1300; i++) {
    a = rng() * TAU; u = rng();
    var st = Math.floor((a / TAU) * 32) % 2;
    var c2 = st ? GOLD : RED;
    g.platform.push([PR * Math.cos(a), PY0 - 0.14 * u, PR * Math.sin(a), Math.cos(a), 0, Math.sin(a), c2[0], c2[1], c2[2], 1.01]);
  }
  // centre column: mirrored panels (bright cyan/white checker)
  g.column = [];
  for (i = 0; i < 900; i++) {
    a = rng() * TAU; u = rng();
    var y = PY0 + (CY0 - PY0) * u;
    var chk = (Math.floor(a / TAU * 10) + Math.floor(u * 9)) % 2;
    var c3 = chk ? CYAN : [235, 250, 255];
    g.column.push([0.15 * Math.cos(a), y, 0.15 * Math.sin(a), Math.cos(a), 0, Math.sin(a), c3[0], c3[1], c3[2], u]);
  }
  // poles: golden barber-striped rods
  g.poles = [];
  for (var h = 0; h < NH; h++) {
    var pa = h / NH * TAU, pts = [];
    for (i = 0; i < 170; i++) {
      u = rng(); a = rng() * TAU;
      var yy = PY0 + (CY0 - PY0) * u;
      var stripe = Math.floor((a / TAU) * 2 + u * 9) % 2;
      var c4 = stripe ? GOLD : [255, 240, 150];
      pts.push([POLE_R * Math.cos(pa) + 0.028 * Math.cos(a), yy, POLE_R * Math.sin(pa) + 0.028 * Math.sin(a),
        Math.cos(a), 0, Math.sin(a), c4[0], c4[1], c4[2], u]);
    }
    g.poles.push(pts);
  }
  // canopy: striped cone, 16 segments; colour stripes alternate with white
  var stripes = [PINK, CYAN, GOLD, VIOLET, MINT, ORANGE, BLUE, LIME];
  g.canopy = [];
  var slope = (APEX - CY0) / CR;
  for (i = 0; i < 6500; i++) {
    u = Math.sqrt(rng());                    // more points toward the rim
    a = rng() * TAU;
    r = CR * u;
    var sg = Math.floor(a / TAU * 16);
    var c5 = sg % 2 ? WHITE : RED;
    var nl = Math.hypot(slope, 1);
    g.canopy.push([r * Math.cos(a), APEX - (APEX - CY0) * u, r * Math.sin(a),
      slope * Math.cos(a) / nl, 1 / nl, slope * Math.sin(a) / nl, c5[0], c5[1], c5[2], a]);
  }
  // valance: scalloped skirt hanging from the rim
  g.valance = [];
  for (i = 0; i < 1500; i++) {
    a = rng() * TAU;
    var sc = Math.abs(Math.sin(a * 16));       // 32 scallops
    var drop = 0.07 + 0.08 * sc;
    u = rng();
    var c6 = Math.floor(a / TAU * 32) % 2 ? GOLD : PINK;
    g.valance.push([CR * Math.cos(a), CY0 - drop * u, CR * Math.sin(a), Math.cos(a), 0, Math.sin(a),
      c6[0], c6[1], c6[2], a]);
  }
  // horses
  var bodies = [WHITE, PINK, CYAN, GOLD];
  var manes = [GOLD, GOLD, PINK, RED];
  g.horses = [];
  for (h = 0; h < NH; h++) g.horses.push(buildHorse(rng, bodies[h], manes[h]));
  // bulbs: rim (48), canopy rib lines (8 x 9), platform edge (40)
  g.bulbs = [];
  var bc = [GOLD, PINK, CYAN, WHITE];
  for (i = 0; i < 24; i++) {
    a = i / 24 * TAU;
    g.bulbs.push({ p: [CR * 1.01 * Math.cos(a), CY0 + 0.005, CR * 1.01 * Math.sin(a)], a: a, c: bc[i % 4], ring: 0, i: i });
  }
  for (var l = 0; l < 0; l++) {
    a = (l * 2 + 1) / 16 * TAU;
    for (i = 1; i <= 9; i++) {
      u = i / 10;
      g.bulbs.push({ p: [CR * u * 1.02 * Math.cos(a), APEX - (APEX - CY0) * u + 0.02, CR * u * 1.02 * Math.sin(a)], a: a,
        c: i % 2 ? GOLD : WHITE, ring: 1, i: i });
    }
  }
  for (i = 0; i < 16; i++) {
    a = i / 16 * TAU;
    g.bulbs.push({ p: [PR * 1.01 * Math.cos(a), PY0 - 0.07, PR * 1.01 * Math.sin(a)], a: a, c: bc[(i + 2) % 4], ring: 2, i: i });
  }
  return g;
}

// ---------------------------------------------------------------- layout
var M = null, S = null;

function buildLayout() {
  var W = state.COLS, H = state.ROWS, n = W * H;
  var m = {
    w: W, h: H, cw: state.CHAR_W, ch: state.CHAR_H,
    zb: new Float32Array(n), kind: new Uint8Array(n),
    sr: new Float32Array(n), sg: new Float32Array(n), sb: new Float32Array(n),
    gr: new Float32Array(n), gg: new Float32Array(n), gb: new Float32Array(n),
    mk: new Uint16Array(n), mr: new Uint8Array(n), mg: new Uint8Array(n), mb: new Uint8Array(n),
  };
  var pw = W * m.cw, ph = H * m.ch;
  m.pw = pw; m.ph = ph;
  m.SC = Math.min(0.25 * ph, pw / 3.15);
  m.OX = pw * 0.5;
  m.OY = ph * 0.55;
  var rng = mulberry(W * 77 + H);
  m.bg = new Uint16Array(n); m.bgc = new Uint8Array(n); m.bgp = new Float32Array(n);
  var chars = '..,:+*'.split('');
  for (var i = 0; i < n; i++) {
    if (rng() < 0.04) {
      m.bg[i] = chars[(rng() * chars.length) | 0].charCodeAt(0);
      m.bgc[i] = (rng() * 5) | 0; m.bgp[i] = rng() * TAU;
    }
  }
  m.gq = new Float32Array(12000 * 7); m.gn = 0;
  return m;
}

function initCarousel() {
  var want = state.isMobile ? 0.62 : 0.6;
  if (state.FONT_SCALE !== want) { state.FONT_SCALE = want; resize(); }
  if (!G) G = buildGeometry();
  M = buildLayout();
  if (!S) {
    S = { lastT: state.time, t: 0, tb: 0, ang: 0, omega: 0.3, push: 0, tilt: 0.13,
      dragging: false, lastGx: 0, lastGy: 0, hintT: 0, fw: [], nextFw: 1.5, bits: [] };
  }
}

function cleanupCarousel() {
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  M = null; S = null;
}

// ---------------------------------------------------------------- 3D pipeline
var CA = 1, SA = 0, CT = 1, ST = 0;
var CAMD = 9;
var LX = -0.45, LY = 0.65, LZ = 0.6;
(function () { var l = Math.hypot(LX, LY, LZ); LX /= l; LY /= l; LZ /= l; })();
var PX = 0, PY = 0, PZ = 0, RX = 0, RZ = 0;

function spin(x, z) { RX = x * CA + z * SA; RZ = -x * SA + z * CA; }
function lambert(nx, ny, nz) { var d = nx * LX + ny * LY + nz * LZ; return d > 0 ? d : 0; }
function project(x, y, z) {
  var y1 = y * CT - z * ST, z1 = y * ST + z * CT;
  var p = CAMD / (CAMD - z1);
  PX = M.OX + M.SC * x * p;
  PY = M.OY - M.SC * y1 * p;
  PZ = z1;
}
function putSolid(x, y, z, r, g, b, kind) {
  project(x, y, z);
  var cx = (PX / M.cw) | 0, cy = (PY / M.ch) | 0;
  if (PX < 0 || PY < 0 || cx >= M.w || cy >= M.h) return;
  var i = cy * M.w + cx;
  if (PZ <= M.zb[i]) return;
  // depth fog: the far side of the ride drops to sparse glyphs so the near
  // horses and poles read against it
  var f = 0.22 + 0.78 * smooth((PZ + 1.1) / 2.2);
  M.zb[i] = PZ; M.kind[i] = kind;
  M.sr[i] = r * f; M.sg[i] = g * f; M.sb[i] = b * f;
}
function putGlow(x, y, z, r, g, b, halo) {
  if (M.gn >= 12000) return;
  var o = M.gn * 7, q = M.gq;
  q[o] = x; q[o + 1] = y; q[o + 2] = z; q[o + 3] = r; q[o + 4] = g; q[o + 5] = b; q[o + 6] = halo;
  M.gn++;
}
function addGlowCell(cx, cy, z, r, g, b) {
  if (cx < 0 || cy < 0 || cx >= M.w || cy >= M.h) return;
  var i = cy * M.w + cx;
  if (M.zb[i] > z + 0.04) return;
  M.gr[i] += r; M.gg[i] += g; M.gb[i] += b;
}
function resolveGlow() {
  var q = M.gq;
  for (var k = 0; k < M.gn; k++) {
    var o = k * 7;
    project(q[o], q[o + 1], q[o + 2]);
    var cx = Math.floor(PX / M.cw), cy = Math.floor(PY / M.ch);
    var dim = 0.5 + 0.5 * clamp((PZ + 1.4) / 2.8, 0, 1);
    var r = q[o + 3] * dim, g = q[o + 4] * dim, b = q[o + 5] * dim, z = PZ, h = q[o + 6];
    addGlowCell(cx, cy, z, r, g, b);
    if (h > 0) {
      addGlowCell(cx - 1, cy, z, r * h, g * h, b * h);
      addGlowCell(cx + 1, cy, z, r * h, g * h, b * h);
      addGlowCell(cx, cy - 1, z, r * h * 0.6, g * h * 0.6, b * h * 0.6);
      addGlowCell(cx, cy + 1, z, r * h * 0.6, g * h * 0.6, b * h * 0.6);
    }
  }
}
// camera-space (untilted) -> model coords for the tilt, for sky effects
function skyGlow(x, y1, z1, r, g, b, h) {
  putGlow(x, y1 * CT + z1 * ST, -y1 * ST + z1 * CT, r, g, b, h);
}

function grown(name) {
  var st = STAGE[name];
  return clamp((S.tb - st[0]) / (st[1] - st[0]), 0, 1);
}

// solid point with a rotated normal, lit
function litPoint(p, x, y, z, amb, gain, tip) {
  spin(x, z);
  var px = RX, pz = RZ;
  spin(p[3], p[5]);
  var sh = (amb + (1 - amb) * lambert(RX, p[4], RZ)) * gain;
  var r = p[6] * sh, g = p[7] * sh, b = p[8] * sh;
  if (tip > 0) { r = r * (1 - tip) + 300 * tip; g = g * (1 - tip) + 300 * tip; b = b * (1 - tip) + 300 * tip; }
  putSolid(px, y, pz, r, g, b, K_RIDE);
}

// ---------------------------------------------------------------- layers
function layerPlatform() {
  var g = grown('platform');
  if (g <= 0) return;
  var P = G.platform, front = g * 1.25;
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (p[9] > front) continue;                  // spreads out from the centre
    var tip = clamp(1 - (front - p[9]) / 0.12, 0, 1) * (g < 1 ? 1 : 0);
    litPoint(p, p[0], p[1], p[2], 0.45, 1.0, tip);
  }
}

function layerColumn(t) {
  var g = grown('column');
  if (g <= 0) return;
  var P = G.column;
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (p[9] > g) continue;
    var tip = g < 1 ? clamp(1 - (g - p[9]) / 0.1, 0, 1) : 0;
    // mirror panels flash as they face the light
    spin(p[3], p[5]);
    var face = Math.pow(lambert(RX, 0, RZ), 6);
    var gain = 0.9 + 1.5 * face * (0.6 + 0.4 * Math.sin(t * 6 + i));
    litPoint(p, p[0], p[1], p[2], 0.4, gain, tip);
  }
}

function horseLift(h) {
  // gallop: alternate horses up/down as the carousel turns
  return 0.11 * Math.sin(S.ang * 3 + h * Math.PI) * grown('run');
}

function layerPoles() {
  var g = grown('poles') * NH;
  for (var h = 0; h < NH; h++) {
    var s = clamp(g - h * 0.6, 0, 1);
    if (s <= 0) continue;
    var P = G.poles[h];
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      if (p[9] > s) continue;
      litPoint(p, p[0], p[1], p[2], 0.4, 0.9, s < 1 ? clamp(1 - (s - p[9]) / 0.12, 0, 1) : 0);
    }
  }
}

function layerCanopy() {
  var g = grown('canopy');
  if (g > 0) {
    var sweep = g * TAU, P = G.canopy;
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      var a = p[9];
      if (a > sweep) continue;                   // unfurls round the circle
      var tip = g < 1 ? clamp(1 - (sweep - a) / 0.5, 0, 1) : 0;
      litPoint(p, p[0], p[1], p[2], 0.45, 0.95, tip);
    }
  }
  var v = grown('valance');
  if (v > 0) {
    var V = G.valance;
    for (var j = 0; j < V.length; j++) {
      var q = V[j];
      var dy = (q[1] - CY0) * ease(v);
      litPoint(q, q[0], CY0 + dy, q[2], 0.45, 1.1, 0);
    }
  }
}

function layerHorses() {
  var g = grown('horses') * NH;
  for (var h = 0; h < NH; h++) {
    var s = ease(g - h);
    if (s <= 0) continue;
    var pa = h / NH * TAU;
    var cx = POLE_R * Math.cos(pa), cz = POLE_R * Math.sin(pa);
    var cy = -0.3 + horseLift(h);
    // horse faces along the direction of travel (tangent)
    var tx = Math.sin(pa), tz = -Math.cos(pa);   // local x: nose along the direction of travel
    var ox = Math.cos(pa), oz = Math.sin(pa);    // local z (outward)
    var P = G.horses[h];
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      var lx = p[0] * s * HS, ly = p[1] * s * HS, lz = p[2] * s * HS;
      var x = cx + lx * tx + lz * ox, z = cz + lx * tz + lz * oz, y = cy + ly;
      var nx = p[3] * tx + p[5] * ox, nz = p[3] * tz + p[5] * oz;
      spin(x, z);
      var px = RX, pz = RZ;
      spin(nx, nz);
      var lam = lambert(RX, p[4], RZ);
      var sh = 0.6 + 0.7 * lam;
      // glossy paint
      var rz = 2 * (RX * LX + p[4] * LY + RZ * LZ) * RZ - LZ;
      var sp = 230 * Math.pow(clamp(rz, 0, 1), 14);
      putSolid(px, y, pz, p[6] * sh + sp, p[7] * sh + sp, p[8] * sh + sp, K_HORSE);
    }
  }
}

function layerBulbs(t) {
  var on = grown('bulbs'), fin = grown('run');
  if (on <= 0) return;
  var B = G.bulbs;
  for (var i = 0; i < B.length; i++) {
    var b = B[i];
    if (b.a > on * TAU + 0.01) continue;         // switch on in a sweep
    var tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.3);
    var ph = b.ring === 1 ? b.i * 3 : b.i;
    var ch = (((ph - t * 24) % 12) + 12) % 12;
    var chase = Math.exp(-ch / 2) * fin;
    var k = (tw + 1.4 * chase) * (b.ring === 1 ? 0.8 : 1.05) * (1 + S.flash * 1.5);
    spin(b.p[0], b.p[2]);
    putGlow(RX, b.p[1], RZ, b.c[0] * k * 1.3, b.c[1] * k * 1.3, b.c[2] * k * 1.3, b.ring === 1 ? 0.15 : 0.35 + 0.3 * chase);
  }
}

function layerFlag(t) {
  var s = ease(grown('flag'));
  if (s <= 0) return;
  // finial ball + waving pennant on a short mast
  for (var i = 0; i < 40; i++) {
    var u = i / 39;
    spin(0, 0);
    putSolid(0, APEX + 0.3 * u * s, 0, 255, 220, 120, K_RIDE);
  }
  for (var j = 0; j < 220; j++) {
    var fu = (j % 22) / 21, fv = Math.floor(j / 22) / 9;
    var len = 0.32 * s;
    var lx = fu * len, ly = APEX + 0.3 * s - 0.11 * s * fv * (1 - fu * 0.8) - 0.005;
    var lz = 0.05 * Math.sin(fu * 5 - t * 7) * fu;
    // the pennant streams against the turn
    spin(lx, lz);
    var c = fv < 0.5 ? PINK : GOLD;
    putSolid(RX, ly, RZ, c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, K_RIDE);
  }
  spin(0, 0);
  putGlow(0, APEX + 0.31 * s, 0, 400, 330, 150, 0.4);
}

function launchFirework(x, y1, z1) {
  var cols = [PINK, CYAN, GOLD, LIME, VIOLET, ORANGE, WHITE];
  var c = cols[(Math.random() * cols.length) | 0], c2 = cols[(Math.random() * cols.length) | 0];
  var n = 70;
  for (var i = 0; i < n; i++) {
    var dx = gauss(Math.random), dy = gauss(Math.random), dz = gauss(Math.random), l = Math.hypot(dx, dy, dz) || 1;
    var v = 0.55 + 0.25 * Math.random();
    S.fw.push({ x: x, y: y1, z: z1, vx: dx / l * v, vy: dy / l * v, vz: dz / l * v, life: 1.4 + Math.random() * 0.6,
      max: 2, c: i % 3 ? c : c2 });
  }
}

function layerFireworks(t, dt) {
  var fin = grown('run');
  if (fin >= 1) {
    S.nextFw -= dt;
    if (S.nextFw <= 0) {
      S.nextFw = 1.6 + Math.random() * 1.8;
      launchFirework((Math.random() - 0.5) * 2.6, 1.6 + Math.random() * 0.8, -1.5 - Math.random());
    }
  }
  for (var i = S.fw.length - 1; i >= 0; i--) {
    var p = S.fw[i];
    p.life -= dt;
    if (p.life <= 0) { S.fw.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 0.45 * dt; p.vx *= 0.985; p.vy *= 0.985; p.vz *= 0.985;
    var b = Math.min(1, p.life / p.max * 1.6);
    var k = b * 1.3 * (0.75 + 0.25 * Math.sin(t * 30 + i));
    skyGlow(p.x, p.y, p.z, p.c[0] * k, p.c[1] * k, p.c[2] * k, b > 0.6 ? 0.2 : 0);
  }
}

// sparkle bursts and falling bulbs from taps on the ride
function layerBits(dt) {
  for (var i = S.bits.length - 1; i >= 0; i--) {
    var p = S.bits[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.life -= dt;
    if (p.life <= 0) { S.bits.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy -= p.g * dt;
    var b = Math.min(1, p.life / p.max * 1.8);
    skyGlow(p.x, p.y, p.z, p.c[0] * b * 1.4, p.c[1] * b * 1.4, p.c[2] * b * 1.4, 0.25);
  }
}

// ---------------------------------------------------------------- compose
function compose(t) {
  var W = M.w, H = M.h;
  var bgCols = [WHITE, GOLD, CYAN, PINK, VIOLET];
  for (var cy = 0; cy < H; cy++) {
    for (var cx = 0; cx < W; cx++) {
      var i = cy * W + cx;
      var gr = M.gr[i], gg = M.gg[i], gb = M.gb[i];
      var gi = Math.max(gr, gg, gb) / 255;
      var r, g, b, chI;
      if (M.zb[i] > -1e8) {
        var lum = Math.max(M.sr[i], M.sg[i], M.sb[i]) / 255;
        var wgl = gi > 0.05 ? clamp(gi / (gi + lum * 0.6 + 0.01), 0, 1) : 0;
        var sk = 1 - wgl * 0.85, gk = 0.4 + 1.2 * wgl;
        r = M.sr[i] * sk + gr * gk; g = M.sg[i] * sk + gg * gk; b = M.sb[i] * sk + gb * gk;
        var L = Math.max(lum, gi * 0.9);
        chI = Math.min(RAMP.length - 1, Math.max(1, Math.round(clamp(L, 0, 1) * (RAMP.length - 1))));
        r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
        var mx = Math.max(r, g, b, 1);
        var k = (0.55 + 0.45 * clamp(L, 0, 1)) * 255 / mx;
        drawChar(RAMP[chI], cx, cy, Math.min(255, r * k) | 0, Math.min(255, g * k) | 0, Math.min(255, b * k) | 0, 1);
      } else if (gi > 0.06) {
        chI = Math.min(GRAMP.length - 1, Math.max(1, Math.round(clamp(gi, 0, 1) * (GRAMP.length - 1))));
        var kg = 255 / Math.max(gr, gg, gb);
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
    var cx = Math.floor(pointer.gx), cy = Math.floor(pointer.gy), hit = false, horse = false;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= M.w || y >= M.h) continue;
        var kd = M.kind[y * M.w + x];
        if (kd === K_HORSE) horse = true;
        if (kd === K_RIDE || kd === K_HORSE) hit = true;
      }
    }
    if (hit) {
      var bz = horse ? 1.3 : 0.4, bp = CAMD / (CAMD - bz);
      var bx = (pointer.gx * M.cw - M.OX) / (M.SC * bp);
      var by = -(pointer.gy * M.ch - M.OY) / (M.SC * bp);
      var cols = [PINK, CYAN, GOLD, LIME, VIOLET, ORANGE, WHITE, RED, MINT];
      if (horse) {
        // spin up hard; the cruise easing in render brings it back down
        var dir = S.omega < 0 ? -1 : 1;
        S.omega = dir * Math.min(6.5, Math.abs(S.omega) + 4.5);
        S.push = 0;
        for (var i = 0; i < 28; i++) {
          var an = Math.random() * TAU, v = 0.3 + Math.random() * 0.6;
          S.bits.push({ x: bx, y: by, z: bz, vx: Math.cos(an) * v, vy: Math.sin(an) * v + 0.2, g: 1.2,
            c: cols[(Math.random() * cols.length) | 0], life: 0.6 + Math.random() * 0.5, max: 1.1 });
        }
      } else {
        // shower of bulbs and stars from the canopy rim, around the tap
        for (var j = 0; j < 36; j++) {
          var sx = clamp(bx + (Math.random() - 0.5) * 1.4, -CR * 0.95, CR * 0.95);
          var zr = Math.sqrt(CR * CR - sx * sx);
          S.bits.push({ x: sx, y: CY0 * CT - zr * ST, z: CY0 * ST + zr * CT, vx: (Math.random() - 0.5) * 0.3,
            vy: -Math.random() * 0.3, g: 2.4, c: cols[(Math.random() * cols.length) | 0],
            life: 1.2 + Math.random() * 0.9 - Math.random() * 0.0, max: 1.5, delay: Math.random() * 0.5 });
        }
      }
    } else {
      // firework in the sky at the tap, a little behind the carousel
      var z1 = -1.5, p = CAMD / (CAMD - z1);
      var wx = (pointer.gx * M.cw - M.OX) / (M.SC * p);
      var wy = -(pointer.gy * M.ch - M.OY) / (M.SC * p);
      launchFirework(wx, wy, z1);
      S.flash = 1;
    }
  }
  if (pointer.down) {
    if (S.dragging && dt > 0) {
      var ddx = (pointer.gx - S.lastGx) * M.cw / M.SC;
      var ddy = (pointer.gy - S.lastGy) * M.ch / M.SC;
      S.push = clamp(-ddx / dt * 0.9, -9, 9);
      S.tilt = clamp(S.tilt + ddy * 0.5, 0.05, 0.75);
      if (Math.abs(ddx) + Math.abs(ddy) > 0.01) S.hintT = 99;
    }
    S.dragging = true; S.lastGx = pointer.gx; S.lastGy = pointer.gy;
  } else {
    S.dragging = false;
  }
}

// ---------------------------------------------------------------- render
function renderCarousel() {
  clearCanvas();
  if (!M || !S || M.w !== state.COLS || M.h !== state.ROWS || M.cw !== state.CHAR_W) initCarousel();
  var now = state.time;
  if (now < S.lastT) S.lastT = now;
  var dt = Math.min(0.1, now - S.lastT); S.lastT = now;
  S.t += dt; S.tb += dt; S.hintT += dt;
  S.flash = Math.max(0, (S.flash || 0) - dt * 2.5);
  var t = S.t;

  handleInput(dt);

  // cruise speed ramps up at "run"; a drag pushes it, then it coasts back
  var cruise = 0.28 + 0.62 * smooth(grown('run'));
  if (S.dragging) S.omega += (S.push - S.omega) * Math.min(1, dt * 8);
  else S.omega += (cruise - S.omega) * Math.min(1, dt * 0.7);
  S.ang += S.omega * dt;
  CA = Math.cos(S.ang); SA = Math.sin(S.ang);
  CT = Math.cos(S.tilt); ST = Math.sin(S.tilt);

  M.zb.fill(-1e9); M.kind.fill(0); M.gr.fill(0); M.gg.fill(0); M.gb.fill(0);
  M.gn = 0;

  layerPlatform();
  layerColumn(t);
  layerPoles();
  layerCanopy();
  layerHorses();
  layerFlag(t);
  layerBulbs(t);
  layerFireworks(t, dt);
  layerBits(dt);
  resolveGlow();
  compose(t);

  var deg = (((S.ang * 180 / Math.PI) % 360) + 360) % 360;
  var rpm = Math.abs(S.omega) * 60 / TAU;
  var built = Math.round(clamp(S.tb / BUILD_END, 0, 1) * 100);
  drawText('turn ' + deg.toFixed(1) + 'deg  rpm ' + rpm.toFixed(1) + '  built ' + built + '%', 1, M.h - 1, CYAN, 0.9);
  if (S.hintT < 9) {
    var hint = state.isMobile ? 'drag: spin+tilt  tap sky: firework  tap horse: spin  tap ride: shower'
      : 'drag: spin + tilt · click sky: firework · click horse: spin · click ride: shower';
    if (hint.length > M.w - 2) hint = 'drag: spin · tap sky/ride';
    drawText(hint, Math.max(1, ((M.w - hint.length) / 2) | 0), M.h - 2, PINK, 0.85);
  }
}

registerMode(MODE, { init: initCarousel, render: renderCarousel, cleanup: cleanupCarousel });
