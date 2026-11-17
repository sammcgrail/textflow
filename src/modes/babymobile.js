import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { Scene3D, MeshBuilder, matYaw, norm3, hash1, clamp01, TAU } from '../core/scene3d.js';

// babymobile: a 3D crib mobile for Martin (Sam 2026-11-16). A red-and-white ring turns
// slowly on a string; a crescent moon, three stars, a whale and a bear hang from it and
// sway a little. Bold, saturated colours on a dark night sky.
//
// Made for a baby's eyes, so everything changes slowly: no flashing, no strobing, no
// colour cycling, no brightness pulse on tap. Lighting is fixed; the only brightness
// change on a piece is the shading drifting as it turns.
//
// Tap a piece: a soft bounce on its string and one slow turn, then it settles.
// Swipe: spins the whole mobile; the momentum eases back to the slow default turn, and
// the pieces swing out a little while it spins fast.
//
// Geometry: one MeshBuilder mesh, one group per piece (so s3.hit() names the piece) plus
// the ring. Each piece has its own rigid matrix per frame (string pendulum + twist).

var MODE = 'babymobile';

// materials
var M_RING = 1, M_MOON = 2, M_WHALE = 3, M_BEAR = 4, M_STAR_R = 5, M_STAR_G = 6, M_STAR_P = 7, M_DARK = 8, M_CREAM = 9, M_WHITE = 10, M_BOW = 11;

var YELLOW = [255, 212, 0], BLUE = [24, 118, 255], ORANGE = [255, 128, 16], CREAM = [255, 226, 168];
var RED = [255, 36, 56], GREEN = [30, 214, 84], PINK = [255, 64, 190], WHITE = [244, 246, 255], INK = [16, 16, 30];

var RING_R = 0.62, RING_TUBE = 0.024;
var BASE_OMEGA = TAU / 42;      // default turn: one revolution every 42 s
var MAX_SPIN = 1.8;             // rad/s cap on a swipe
var SPIN_TAU = 2.6;             // s: swipe momentum eases back to the default turn
var DRAG_K = 0.0075;            // rad per CSS px of swipe
var G = 9.8;

// pieces round the ring: name, mesh builder, string length (m), material for picking
// (k: piece scale over the builder's units, so the pieces read big on a phone)
var PIECES = [
  { name: 'moon', L: 0.3, k: 2.1 },
  { name: 'starRed', L: 1.32, k: 2.1 },
  { name: 'whale', L: 0.78, k: 1.75 },
  { name: 'starGreen', L: 1.72, k: 2.1 },
  { name: 'bear', L: 0.42, k: 2.0 },
  { name: 'starPink', L: 1.08, k: 2.1 },
];

var s3 = null;
var MESH = null;    // built once
var S = null;       // simulation state
var L = null;       // per-size layout

// ---------------------------------------------------------------------------
// 3x4 affine helpers (same layout as scene3d: rotation rows 0..8, translation 9..11)
// ---------------------------------------------------------------------------
function mul34(a, b, o) {   // o = a * b (apply b first)
  var r0 = a[0] * b[0] + a[1] * b[3] + a[2] * b[6], r1 = a[0] * b[1] + a[1] * b[4] + a[2] * b[7], r2 = a[0] * b[2] + a[1] * b[5] + a[2] * b[8];
  var r3 = a[3] * b[0] + a[4] * b[3] + a[5] * b[6], r4 = a[3] * b[1] + a[4] * b[4] + a[5] * b[7], r5 = a[3] * b[2] + a[4] * b[5] + a[5] * b[8];
  var r6 = a[6] * b[0] + a[7] * b[3] + a[8] * b[6], r7 = a[6] * b[1] + a[7] * b[4] + a[8] * b[7], r8 = a[6] * b[2] + a[7] * b[5] + a[8] * b[8];
  var t0 = a[0] * b[9] + a[1] * b[10] + a[2] * b[11] + a[9];
  var t1 = a[3] * b[9] + a[4] * b[10] + a[5] * b[11] + a[10];
  var t2 = a[6] * b[9] + a[7] * b[10] + a[8] * b[11] + a[11];
  o[0] = r0; o[1] = r1; o[2] = r2; o[3] = r3; o[4] = r4; o[5] = r5; o[6] = r6; o[7] = r7; o[8] = r8; o[9] = t0; o[10] = t1; o[11] = t2;
  return o;
}
function setT(m, x, y, z) { m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = 1; m[5] = 0; m[6] = 0; m[7] = 0; m[8] = 1; m[9] = x; m[10] = y; m[11] = z; return m; }
// rotation by ang about a unit axis through the origin
function setRot(m, ax, ay, az, ang) {
  var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  m[0] = t * ax * ax + c; m[1] = t * ax * ay - s * az; m[2] = t * ax * az + s * ay;
  m[3] = t * ax * ay + s * az; m[4] = t * ay * ay + c; m[5] = t * ay * az - s * ax;
  m[6] = t * ax * az - s * ay; m[7] = t * ay * az + s * ax; m[8] = t * az * az + c;
  m[9] = 0; m[10] = 0; m[11] = 0;
  return m;
}
function apply(m, x, y, z, out) {
  out[0] = m[0] * x + m[1] * y + m[2] * z + m[9];
  out[1] = m[3] * x + m[4] * y + m[5] * z + m[10];
  out[2] = m[6] * x + m[7] * y + m[8] * z + m[11];
  return out;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------
function shade(c, k) { return [c[0] * k | 0, c[1] * k | 0, c[2] * k | 0]; }

// puffy five-pointed star: a star-shaped cross-section swept front-to-back like a pillow
function star(mb, group, col, mat, R, r, T) {
  var NP = 5, SUB = 6, nu = NP * 2 * SUB;
  var prof = function (phi) {   // radius of the star outline at angle phi (point up)
    var a = ((phi - Math.PI / 2) / (TAU / NP)) % 1; if (a < 0) a += 1;
    var f = Math.abs(a - 0.5) * 2;    // 1 at a point, 0 between points
    return r + (R - r) * Math.pow(f, 1.6);
  };
  mb.grid(function (u, v, out) {
    var phi = u * TAU, s = Math.sin(v * Math.PI), rr = prof(phi) * Math.pow(s, 0.55);
    out[0] = rr * Math.cos(phi); out[1] = rr * Math.sin(phi); out[2] = T * Math.cos(v * Math.PI);
  }, nu, 10, { wrapU: true, closed: true, col: col, mat: mat, group: group });
}

function moon(mb, group) {
  var pts = [], rad = [], n = 22, a0 = 0.32 * Math.PI, a1 = 1.68 * Math.PI, RC = 0.125;
  for (var i = 0; i <= n; i++) {
    var f = i / n, a = a0 + (a1 - a0) * f;
    pts.push([RC * Math.cos(a) - 0.02, RC * Math.sin(a), 0]);
    rad.push(0.008 + 0.058 * Math.pow(Math.sin(f * Math.PI), 0.9));
  }
  mb.tube(pts, rad, { segs: 14, col: YELLOW, mat: M_MOON, group: group, sx: 0.62, cap: 0.6 });
  // sleepy closed eye on the inner curve, on both faces
  for (var sgn = -1; sgn <= 1; sgn += 2) {
    mb.ellipsoid([-0.13, 0.015, sgn * 0.037], [0.022, 0.008, 0.008], null, { col: INK, mat: M_DARK, group: group, nu: 8, nv: 6 });
  }
}

function whale(mb, group) {
  var belly = function (u, v, out) {
    var w = v < 0.38 ? 1 : v < 0.46 ? (0.46 - v) / 0.08 : 0;
    out[0] = BLUE[0] + (WHITE[0] - BLUE[0]) * w; out[1] = BLUE[1] + (WHITE[1] - BLUE[1]) * w; out[2] = BLUE[2] + (WHITE[2] - BLUE[2]) * w;
  };
  mb.ellipsoid([0.0, 0, 0], [0.175, 0.105, 0.1], null, { col: belly, mat: M_WHALE, group: group, nu: 26, nv: 16 });
  // tail stock rising to the flukes
  mb.tube([[-0.13, 0.0, 0], [-0.2, 0.03, 0], [-0.25, 0.07, 0]], [0.065, 0.04, 0.022], { segs: 12, col: BLUE, mat: M_WHALE, group: group, cap: 0.5 });
  // flukes, a V seen from the side
  var c = Math.cos(0.7), s = Math.sin(0.7);
  mb.ellipsoid([-0.28, 0.1, 0.0], [0.065, 0.02, 0.035], [[c, s, 0], [-s, c, 0], [0, 0, 1]], { col: BLUE, mat: M_WHALE, group: group, nu: 14, nv: 8 });
  mb.ellipsoid([-0.29, 0.04, 0.0], [0.06, 0.02, 0.035], [[c, -s, 0], [s, c, 0], [0, 0, 1]], { col: BLUE, mat: M_WHALE, group: group, nu: 14, nv: 8 });
  // flippers and eyes, both sides
  for (var sgn = -1; sgn <= 1; sgn += 2) {
    mb.ellipsoid([0.03, -0.06, sgn * 0.085], [0.045, 0.016, 0.03], [[0.9, -0.43, 0], [0.43, 0.9, 0], [0, 0, 1]], { col: BLUE, mat: M_WHALE, group: group, nu: 12, nv: 8 });
    mb.ellipsoid([0.1, 0.015, sgn * 0.078], [0.02, 0.022, 0.016], null, { col: INK, mat: M_DARK, group: group, nu: 10, nv: 8 });
  }
  // a little spout on top, white
  mb.tube([[0.07, 0.1, 0], [0.075, 0.15, 0]], [0.012, 0.02], { segs: 8, col: WHITE, mat: M_WHITE, group: group });
  mb.ellipsoid([0.05, 0.165, 0], [0.025, 0.014, 0.018], null, { col: WHITE, mat: M_WHITE, group: group, nu: 10, nv: 6 });
  mb.ellipsoid([0.1, 0.165, 0], [0.025, 0.014, 0.018], null, { col: WHITE, mat: M_WHITE, group: group, nu: 10, nv: 6 });
}

function bear(mb, group) {
  var o = function (col, mat) { return { col: col, mat: mat, group: group, nu: 14, nv: 10 }; };
  mb.ellipsoid([0, 0.1, 0], [0.085, 0.08, 0.078], null, { col: ORANGE, mat: M_BEAR, group: group, nu: 20, nv: 14 });
  mb.ellipsoid([-0.064, 0.165, -0.005], [0.03, 0.03, 0.022], null, o(ORANGE, M_BEAR));
  mb.ellipsoid([0.064, 0.165, -0.005], [0.03, 0.03, 0.022], null, o(ORANGE, M_BEAR));
  mb.ellipsoid([-0.064, 0.165, 0.012], [0.016, 0.016, 0.012], null, o(CREAM, M_CREAM));
  mb.ellipsoid([0.064, 0.165, 0.012], [0.016, 0.016, 0.012], null, o(CREAM, M_CREAM));
  mb.ellipsoid([0, 0.075, 0.065], [0.042, 0.032, 0.028], null, o(CREAM, M_CREAM));
  mb.ellipsoid([0, 0.09, 0.092], [0.016, 0.012, 0.01], null, o(INK, M_DARK));
  mb.ellipsoid([-0.032, 0.125, 0.066], [0.012, 0.013, 0.01], null, o(INK, M_DARK));
  mb.ellipsoid([0.032, 0.125, 0.066], [0.012, 0.013, 0.01], null, o(INK, M_DARK));
  // body, belly, arms, legs
  mb.ellipsoid([0, -0.055, 0], [0.085, 0.1, 0.072], null, { col: ORANGE, mat: M_BEAR, group: group, nu: 20, nv: 14 });
  mb.ellipsoid([0, -0.06, 0.042], [0.055, 0.065, 0.036], null, o(CREAM, M_CREAM));
  mb.ellipsoid([-0.088, -0.03, 0.015], [0.028, 0.06, 0.03], [[0.94, 0.34, 0], [-0.34, 0.94, 0], [0, 0, 1]], o(ORANGE, M_BEAR));
  mb.ellipsoid([0.088, -0.03, 0.015], [0.028, 0.06, 0.03], [[0.94, -0.34, 0], [0.34, 0.94, 0], [0, 0, 1]], o(ORANGE, M_BEAR));
  mb.ellipsoid([-0.05, -0.15, 0.03], [0.034, 0.034, 0.045], null, o(ORANGE, M_BEAR));
  mb.ellipsoid([0.05, -0.15, 0.03], [0.034, 0.034, 0.045], null, o(ORANGE, M_BEAR));
  // red bow tie
  mb.ellipsoid([-0.024, 0.02, 0.068], [0.022, 0.014, 0.01], null, o(RED, M_BOW));
  mb.ellipsoid([0.024, 0.02, 0.068], [0.022, 0.014, 0.01], null, o(RED, M_BOW));
}

function ring(mb) {
  var g = 'ring';
  var stripes = function (u, v, out) {   // red and white bands round the ring
    var k = Math.floor(u * 24) & 1, c = k ? RED : WHITE;
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  mb.grid(function (u, v, out) {
    var a = u * TAU, b = v * TAU, rr = RING_R + RING_TUBE * Math.cos(b);
    out[0] = rr * Math.cos(a); out[1] = RING_TUBE * Math.sin(b); out[2] = rr * Math.sin(a);
  }, 96, 8, { wrapU: true, closed: true, twoSided: true, col: stripes, mat: M_RING, group: g });
  // hub and three spokes up to it
  var HUB_Y = 0.2;
  mb.ellipsoid([0, HUB_Y, 0], [0.045, 0.04, 0.045], null, { col: RED, mat: M_BOW, group: g, nu: 14, nv: 10 });
  for (var i = 0; i < 3; i++) {
    var a = TAU * (i / 3 + 1 / 12);
    mb.tube([[0, HUB_Y, 0], [RING_R * Math.cos(a) * 0.98, 0.006, RING_R * Math.sin(a) * 0.98]], [0.011, 0.011], { segs: 6, col: WHITE, mat: M_RING, group: g, cap: 0 });
  }
  return HUB_Y;
}

function buildMesh() {
  var mb = new MeshBuilder();
  var hubY = ring(mb);
  var ranges = [];
  for (var i = 0; i < PIECES.length; i++) {
    var p = PIECES[i], v0 = mb.P.length / 3;
    if (p.name === 'moon') moon(mb, p.name);
    else if (p.name === 'whale') whale(mb, p.name);
    else if (p.name === 'bear') bear(mb, p.name);
    else if (p.name === 'starRed') star(mb, p.name, RED, M_STAR_R, 0.115, 0.052, 0.04);
    else if (p.name === 'starGreen') star(mb, p.name, GREEN, M_STAR_G, 0.1, 0.046, 0.036);
    else star(mb, p.name, PINK, M_STAR_P, 0.105, 0.048, 0.038);
    ranges.push([v0, mb.P.length / 3]);
    for (var vv = v0 * 3; vv < mb.P.length; vv++) mb.P[vv] *= p.k;   // uniform: normals unchanged
  }
  var mesh = mb.build();
  mesh.hubY = hubY;
  // string attaches at the top of each piece; its centre is the pick / bounce reference
  for (i = 0; i < PIECES.length; i++) {
    var top = -1e9, bot = 1e9, cx = 0, cy = 0, n = 0;
    for (var v = ranges[i][0]; v < ranges[i][1]; v++) {
      var y = mesh.pos[v * 3 + 1];
      if (y > top) top = y; if (y < bot) bot = y;
      cx += mesh.pos[v * 3]; n++;
    }
    PIECES[i].top = top; PIECES[i].bot = bot; PIECES[i].cy = (top + bot) / 2;
    // attach above the centre of mass in x so the piece hangs level
    PIECES[i].ax = cx / n;
    PIECES[i].gid = mesh.groups[PIECES[i].name];
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// init / layout
// ---------------------------------------------------------------------------
function layout() {
  var W = state.COLS, H = state.ROWS, wpx = W * state.CHAR_W, hpx = H * state.CHAR_H;
  var portrait = hpx > wpx * 1.1, fov = 0.6;
  var fpx = 0.5 * hpx / Math.tan(fov / 2);
  // fit the ring plus the pieces swinging out (~1.75 m) across, ~1.25 m tall
  var scale = Math.min(wpx / (portrait ? 1.75 : 2.1), hpx * 0.92 / (portrait ? 2.7 : 2.5));
  return { w: W, h: H, fov: fov, dist: fpx / scale, portrait: portrait, shiftY: portrait ? -0.02 : 0 };
}

function setupScene() {
  s3 = new Scene3D();
  var mat = function (id, col, extra) {
    s3.material(id, Object.assign({ kd: 1.0, ks: 0.12, shin: 10, rim: 0.25, amb: 2.0, dark: shade(col, 0.45), glowAt: 2, glow: 0,
      expo: 2.0, gamma: 1.0, minLum: 0.02, ramp: ' .:-=+*%#@' }, extra || {}));
  };
  mat(M_RING, [200, 200, 215]);
  mat(M_MOON, YELLOW, { emit: 0.12, glowAt: 0.9, glow: 0.25 });   // steady soft glow, no pulse
  mat(M_WHALE, BLUE);
  mat(M_BEAR, ORANGE);
  mat(M_STAR_R, RED);
  mat(M_STAR_G, GREEN);
  mat(M_STAR_P, PINK);
  mat(M_CREAM, CREAM);
  mat(M_WHITE, WHITE);
  mat(M_BOW, RED);
  mat(M_DARK, INK, { kd: 0.2, ks: 0, rim: 0, amb: 0.4, dark: [8, 8, 16], minLum: 0.5, ramp: ' @' });
  s3.light.dir = norm3([-0.35, 0.6, 0.75]);
  s3.light.amb = 0.32;
  s3.light.fill = 0.25; s3.light.fillDir = norm3([0.7, 0.1, 0.4]);
  s3.light.rimCol = [0.35, 0.4, 0.6];
  s3.grain = 0;                 // no per-cell noise: a still piece reads perfectly still
  s3.edge = { dist: 0.03, dark: 0.18, sil: 0.12 };
  s3.bloom = 0.45;
  s3.glowFill = 0;
}

function initBaby() {
  var want = state.isMobile ? 0.62 : 0.7;
  if (state.FONT_SCALE !== want) { state.FONT_SCALE = want; resize(); }
  if (!s3) setupScene();
  if (!MESH) MESH = buildMesh();
  L = layout();
  // a sparse, still sky
  L.stars = [];
  for (var i = 0; i < 120; i++) {
    var az = hash1(i * 3.1) * TAU, el = -0.25 + hash1(i * 7.7 + 1) * 1.2;
    L.stars.push({ d: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], b: 0.12 + 0.28 * hash1(i * 5.3 + 2),
      c: hash1(i * 9.1) > 0.8 ? 43 : 46, p: hash1(i * 2.9) * TAU });
  }
  if (!S || state.time < 0.05) {
    S = {
      lastT: state.time, t: 0, A: 0.35, omega: BASE_OMEGA, spinV: 0, accel: 0,
      dragging: false, wasDown: false, downX: 0, downY: 0, lastPX: 0, dragVel: 0, lastDragT: 0,
      taps: 0, lastHit: '', nudges: 0,
      P: PIECES.map(function (p, i) {
        return { dx: 0, dz: 0, vx: 0, vz: 0, by: 0, vy: 0, tw: 0, twv: 0, twTarget: 0, ph: hash1(i * 4.7) * TAU, sx: -1, sy: -1 };
      }),
    };
  }
}
function cleanupBaby() {
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  S = null; L = null;
}

// ---------------------------------------------------------------------------
// simulation
// ---------------------------------------------------------------------------
function stepPieces(dt) {
  var t = S.t, w = S.omega;
  // the faster it spins, the further the pieces swing out (conical pendulum), and they
  // lag a little when the ring speeds up or slows down
  for (var i = 0; i < PIECES.length; i++) {
    var p = PIECES[i], q = S.P[i];
    var theta = TAU * i / PIECES.length;
    var ox = Math.cos(theta), oz = Math.sin(theta);           // outward, ring-local
    var tx = -oz, tz = ox;                                     // tangent (direction of travel)
    var Lk = p.L + 0.12;
    var out = Math.atan(w * w * RING_R / G), lag = clamp01(Math.abs(S.accel) / 6) * Math.sign(S.accel) * 0.12;
    var gx = ox * out + tx * lag, gz = oz * out + tz * lag;
    // damped spring towards that target; slow natural period so the sway looks soft
    var w0 = Math.sqrt(G / Lk) * 0.55, zeta = 0.08;
    q.vx += (-(w0 * w0) * (q.dx - gx) - 2 * zeta * w0 * q.vx) * dt;
    q.vz += (-(w0 * w0) * (q.dz - gz) - 2 * zeta * w0 * q.vz) * dt;
    q.dx += q.vx * dt; q.dz += q.vz * dt;
    // tap bounce: a soft spring on the string length
    var wb = TAU / 1.05, zb = 0.2;
    q.vy += (-(wb * wb) * q.by - 2 * zb * wb * q.vy) * dt;
    q.by += q.vy * dt;
    // tap spin: critically damped towards the next whole turn
    var ws = 1.5;
    q.twv += (ws * ws * (q.twTarget - q.tw) - 2 * ws * q.twv) * dt;
    q.tw += q.twv * dt;
  }
}

var _A = new Float32Array(12), _T = new Float32Array(12), _R = new Float32Array(12), _M = new Float32Array(12), _N = new Float32Array(12);
var GM = [];
var _hang = [0, 0, 0], _top = [0, 0, 0], _c = [0, 0, 0], _pr = [0, 0, 0];

function pieceMatrix(i, out) {
  var p = PIECES[i], q = S.P[i], t = S.t;
  var theta = TAU * i / PIECES.length;
  var hx = RING_R * Math.cos(theta), hz = RING_R * Math.sin(theta);
  // gentle idle sway on top of the simulated swing
  var sw = 0.045, sx = q.dx + sw * Math.sin(t * 0.55 + q.ph) * Math.cos(q.ph), sz = q.dz + sw * Math.sin(t * 0.43 + q.ph * 1.7) * Math.sin(q.ph + 0.6);
  var ang = Math.hypot(sx, sz);
  // twist: face between outwards and the viewer (the blend never passes through zero, so
  // the facing turns smoothly all the way round), drift slowly to either side, plus any tap spin
  var phi = theta - S.A, fx = 0.3 * Math.cos(phi), fz = 0.3 * Math.sin(phi) + 0.7;
  var tw = Math.atan2(fx, fz) - S.A + 0.45 * Math.sin(t * 0.19 + q.ph * 2) + q.tw;
  // world = Arm * T(hang) * Swing * T(0, -L - bounce, 0) * Ry(tw) * T(-ax, -top, 0)
  setT(_M, -p.ax, -p.top, 0);
  matYaw(_R, tw, 0, 0, 0); mul34(_R, _M, _N);
  setT(_T, 0, -(p.L + q.by), 0); mul34(_T, _N, _M);
  if (ang > 1e-5) { setRot(_R, -sz / ang, 0, sx / ang, ang); mul34(_R, _M, _N); } else _N.set(_M);
  setT(_T, hx, 0, hz); mul34(_T, _N, _M);
  return mul34(_A, _M, out);
}

function tapPiece(i, dir) {
  var q = S.P[i];
  q.vy -= 0.34;                                 // drop a little on the string, then bob back
  q.twTarget = Math.round(q.twTarget / TAU) * TAU + dir * TAU;   // one slow whole turn
  q.vx += (hash1(S.taps * 1.7) - 0.5) * 0.12; q.vz += (hash1(S.taps * 2.3 + 1) - 0.5) * 0.12;
  S.taps++; S.lastHit = PIECES[i].name;
}

// piece under the tap: the depth buffer first (3x3 around the cell), then the nearest
// projected piece centre within a finger's reach
function pickPiece(ix, iy) {
  var best = -1;
  for (var r = 0; r <= 2 && best < 0; r++) {
    for (var dy = -r; dy <= r && best < 0; dy++) for (var dx = -r * 2; dx <= r * 2 && best < 0; dx++) {
      var g = s3.hit(ix + dx, iy + dy);
      if (g < 0) continue;
      for (var k = 0; k < PIECES.length; k++) if (PIECES[k].gid === g) { best = k; break; }
    }
  }
  if (best >= 0) return best;
  var bd = 1e9, reach = 26 / state.CHAR_W;   // ~26 CSS px
  for (k = 0; k < PIECES.length; k++) {
    var q = S.P[k]; if (q.sx < 0) continue;
    var d = Math.hypot((q.sx - ix) / q.rc, (q.sy - iy) / q.rr);
    if (d < bd) { bd = d; best = k; }
  }
  if (best >= 0) {
    var qb = S.P[best], dc = Math.hypot((qb.sx - ix) * state.CHAR_W, (qb.sy - iy) * state.CHAR_H);
    if (dc > qb.rc * state.CHAR_W + reach * state.CHAR_W) best = -1;
  }
  return best;
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
function renderBaby() {
  clearCanvas();
  if (!S || !L || L.w !== state.COLS || L.h !== state.ROWS) initBaby();
  var now = state.time, dt = now - S.lastT; S.lastT = now;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  S.t += dt;
  var t = S.t, W = state.COLS, H = state.ROWS;

  // ---- input: tap a piece, swipe to spin --------------------------------------------------
  var tapped = false, prevOmega = S.omega;
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    tapped = !S.dragging;
  } else if (pointer.down && state.currentMode === MODE) {
    if (!S.wasDown) { S.downX = pointer.x; S.downY = pointer.y; S.lastPX = pointer.x; S.dragVel = 0; S.dragging = false; }
    if (Math.hypot(pointer.x - S.downX, pointer.y - S.downY) > 10) S.dragging = true;
    if (S.dragging && dt > 0) {
      var dA = (pointer.x - S.lastPX) * DRAG_K;
      S.A += dA;
      var v = dA / dt; if (v > MAX_SPIN) v = MAX_SPIN; else if (v < -MAX_SPIN) v = -MAX_SPIN;
      S.dragVel += (v - S.dragVel) * (1 - Math.exp(-dt / 0.08));   // ~80 ms smoothing
      S.omega = S.dragVel;
    }
    S.lastPX = pointer.x;
  }
  if (!pointer.down && S.wasDown && S.dragging) {
    // let go: keep the swipe's speed, then ease back to the slow default turn
    S.spinV = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, S.dragVel)) - BASE_OMEGA;
  }
  if (!pointer.down) S.dragging = false;
  S.wasDown = pointer.down;
  if (!S.dragging) {
    S.spinV *= Math.exp(-dt / SPIN_TAU);
    S.omega = BASE_OMEGA + S.spinV;
    S.A += S.omega * dt;
  }
  if (S.A > TAU) S.A -= TAU; else if (S.A < -TAU) S.A += TAU;
  var acc = dt > 0 ? (S.omega - prevOmega) / dt : 0;
  S.accel += (acc - S.accel) * (1 - Math.exp(-dt / 0.25));

  stepPieces(dt);

  // ---- camera: a little above the ring, looking down at it -----------------------------
  var cam = {
    target: [0, -1.02, 0], dist: L.dist, fov: L.fov,
    yaw: 0.05 * Math.sin(t * 0.07), pitch: L.portrait ? 0.16 : 0.12,
    shiftX: 0, shiftY: L.shiftY,
  };
  s3.begin(cam);

  // ---- matrices --------------------------------------------------------------------------
  matYaw(_A, S.A, 0, 0, 0);
  var names = MESH.groupNames;
  for (var g = 0; g < names.length; g++) GM[g] = GM[g] || new Float32Array(12);
  GM[MESH.groups.ring].set(_A);
  for (var i = 0; i < PIECES.length; i++) pieceMatrix(i, GM[PIECES[i].gid]);
  s3.drawMesh(MESH, { groupMat: GM });

  // projected piece centres (picking fallback + the test hook)
  for (i = 0; i < PIECES.length; i++) {
    var p = PIECES[i], q = S.P[i], m = GM[p.gid];
    apply(m, p.ax, p.cy, 0, _c);
    if (s3.project(_c[0], _c[1], _c[2], _pr)) {
      q.sx = _pr[0]; q.sy = _pr[1];
      var half = (p.top - p.bot) * 0.5;
      q.rc = Math.max(1, half * s3.fpx * _pr[2] / s3.cw); q.rr = Math.max(1, half * s3.fpx * _pr[2] / s3.chh);
    } else q.sx = -1;
  }

  if (tapped) {
    var hitI = pickPiece(Math.floor(pointer.gx), Math.floor(pointer.gy));
    if (hitI >= 0) tapPiece(hitI, pointer.gx < S.P[hitI].sx ? -1 : 1);
    else {   // tap on the sky: every piece gets a small, soft nudge
      for (i = 0; i < PIECES.length; i++) { S.P[i].vx += 0.05 * Math.cos(i * 2.1); S.P[i].vz += 0.05 * Math.sin(i * 2.1); }
      S.nudges++; S.lastHit = 'sky';
    }
  }
  s3.shade();

  // ---- strings ------------------------------------------------------------------------------
  var sc = [210, 214, 232];
  for (i = 0; i < PIECES.length; i++) {
    p = PIECES[i]; m = GM[p.gid];
    var theta = TAU * i / PIECES.length;
    apply(_A, RING_R * Math.cos(theta), -RING_TUBE, RING_R * Math.sin(theta), _hang);
    apply(m, p.ax, p.top, 0, _top);
    s3.lineWorld(_hang[0], _hang[1], _hang[2], _top[0], _top[1], _top[2], sc[0], sc[1], sc[2], 0.75, 0, 124);
  }
  // the mobile hangs from a string above the hub
  s3.lineWorld(0, MESH.hubY + 0.04, 0, 0, 3, 0, sc[0], sc[1], sc[2], 0.7, 0, 124);

  // ---- sky: still, dim stars (a very slow, shallow drift in brightness) -----------------------
  for (i = 0; i < L.stars.length; i++) {
    var st = L.stars[i];
    if (!s3.projectDir(st.d[0], st.d[1], st.d[2], _pr)) continue;
    var a = st.b * (0.85 + 0.15 * Math.sin(t * 0.25 + st.p));
    s3.bg(_pr[0], _pr[1], st.c, 170, 190, 255, a);
  }

  // ---- hint, fading in and out slowly -----------------------------------------------------------
  if (t < 9) {
    var hint = W < 60 ? 'tap a friend  -  swipe to spin' : 'tap the moon, a star, the whale or the bear  -  swipe to spin the mobile';
    var ha = clamp01((t - 0.8) / 1.5) * clamp01((9 - t) / 2) * 0.7;
    var hx0 = Math.max(0, ((W - hint.length) / 2) | 0);
    for (var hx = 0; hx < hint.length && hx0 + hx < W; hx++) {
      var hc = hint.charCodeAt(hx);
      if (hc !== 32) s3.mark(hx0 + hx, H - 2, hc, 190, 196, 220, ha, 0, 0);
    }
  }
  s3.present();

  if (typeof window !== 'undefined') {
    window.__babymobile = {
      A: S.A, omega: S.omega, spinV: S.spinV, dragging: S.dragging, taps: S.taps, nudges: S.nudges, lastHit: S.lastHit,
      pieces: PIECES.map(function (pp, k) {
        var qq = S.P[k];
        return { name: pp.name, x: qq.sx * state.CHAR_W, y: qq.sy * state.CHAR_H + state.NAV_H, by: qq.by, tw: qq.tw, twTarget: qq.twTarget };
      }),
    };
  }
}

registerMode(MODE, { init: initBaby, render: renderBaby, cleanup: cleanupBaby });
