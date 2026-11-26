import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { DATA } from './clownfish-data.js';

// clownfish: a procedural 3D clownfish
// (body profile, stripes, dorsal/anal/pelvic/pectoral fins, a fan tail, eyes) swims a round of
// marks with thrust and drag; an anemone of 50 arms x 14 spring-chain nodes sways in the surge
// and parts around the fish; a lazy camera follows, orbits round the anemone and zooms in and out
// with the fish's speed. Plankton flash in its wake, light shafts sway, a glint slides over its
// flank, a morsel sinks and gets eaten. The maths, constants and colours are the original's;
// the numpy dice (arm layout, motes, corals) are exported verbatim into clownfish-data.js.
// Dropped from the reel: the code panel and the handle. Added: tap drops food (the fish turns,
// bursts and eats it, as it does the reel's morsel), drag parts the arms like the fish does,
// pinch / wheel zoom on top of the automatic camera.

var MODE = 'clownfish';
var TAU = Math.PI * 2;
var CAM_D = 7.0;
var RAMP = '$QB%8&0#@oauenjzt[]{}<>rcvx+=1il!;:,';
var RAMP_C = codes(RAMP);
var FILL_G = codes('.::;;ioo08');
var ROCK_G = codes(' . .:.:;:=+');
var FISH = 1, FIN = 2, BACK = 4;
var C_PIPE = 124, C_DASH = 45, C_SL = 47, C_BS = 92;

function codes(s) {
  var a = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) === 32 ? 0 : s.charCodeAt(i);
  return a;
}
function rgb(r, g, b) { return [r / 255, g / 255, b / 255]; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return (3 - 2 * x) * x * x; }
function mod(x, m) { return ((x % m) + m) % m; }

var LX = -0.45, LY = 0.75, LZ = -0.48;
(function () { var l = Math.hypot(LX, LY, LZ); LX /= l; LY /= l; LZ /= l; })();
var HX = LX, HY = LY, HZ = LZ - 1;   // unit(LIGHT + (0,0,-1)): the glint
(function () { var l = Math.hypot(HX, HY, HZ); HX /= l; HY /= l; HZ /= l; })();

// ---- the fish ----------------------------------------------------------------------
var ORANGE = rgb(255, 122, 22), DEEP = rgb(238, 66, 18), FACE = rgb(255, 168, 52);
var WHITE = rgb(250, 248, 240), DARK = rgb(84, 62, 112), RIM = rgb(205, 222, 255);
var PROFILE_S = [0.0, 0.03, 0.08, 0.16, 0.30, 0.45, 0.60, 0.75, 0.88, 0.96, 1.0];
var PROFILE_H = [0.0, 0.075, 0.125, 0.175, 0.222, 0.238, 0.218, 0.165, 0.10, 0.078, 0.075];
var PROFILE_D = [2.5, 1.9375, 0.855769, 0.519805, 0.22514, -0.013333, -0.243333, -0.431905, -0.360714, -0.141667, -0.075]; // np.gradient(H, S)
var LOOP = 22.0, PECT_HZ = 29 / 22;            // what swim_round() settles on for this round
var W1 = 3 * TAU / LOOP, W2 = 4 * TAU / LOOP, W3 = 8 * TAU / LOOP;
var TAIL_ROOT = 0.53, SWIM_HZ = 0.95;
var SW = { effort: 1.0, turn: 0.0, phase: 0.0, hz: 0.95, t: 0.0, brake: 0.0 };

function interp(x, xs, ys) {
  var n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (var i = 1; i < n; i++) {
    if (x < xs[i]) { var f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * f; }
  }
  return ys[n - 1];
}
function halfH(s) { return interp(s, PROFILE_S, PROFILE_H); }
function halfW(s) { return halfH(s) * (0.58 - 0.22 * s); }

// the body bends sideways as a wave from head to tail; lag = how much earlier (a fin's trailing edge)
function sway(s, lag) {
  var beat = SW.phase - TAU * Math.min(SW.hz, 1.0) * lag;
  var wave = (0.014 + 0.105 * s * s) * Math.sin(beat - 3.4 * s);
  var d = s - 0.25;
  return SW.effort * wave + SW.turn * d * d * (d > 0 ? 1 : d < 0 ? -1 : 0);
}

function stripeKind(s, v) {
  var bulge = Math.exp(-(v / 0.55) * (v / 0.55));
  var k = 0, vv = v * v;
  var A = [0.215 + 0.035 * vv, 0.515 - 0.055 * bulge, 0.905];
  var B = [0.335 + 0.02 * vv, 0.655 - 0.02 * bulge, 0.985];
  for (var i = 0; i < 3; i++) {
    if (s > A[i] - 0.016 && s < B[i] + 0.016) k = 2;
    if (s > A[i] && s < B[i]) k = 1;
  }
  return k;
}

// [swimmer] it has a heading, a speed and an effort; it steers at the next mark of its round
//          x      y      z    effort  rest  near enough
var ROUND = [[-0.50, 0.42, 0.02, 0.55, 0.0, 0.30],
  [-1.30, 0.14, -0.38, 0.65, 0.0, 0.34],
  [-1.72, -0.28, -0.80, 0.60, 0.0, 0.30],
  [-1.30, -0.58, -1.08, 0.80, 0.0, 0.30],
  [-0.70, -0.50, -1.14, 2.10, 0.0, 0.30],
  [0.30, -0.42, -1.10, 1.15, 0.0, 0.34],
  [1.50, -0.10, -0.60, 0.95, 0.0, 0.34],
  [1.85, 0.35, 0.10, 0.60, 0.0, 0.30],
  [1.25, 0.66, 0.62, 0.75, 0.0, 0.34],
  [0.16, 0.05, 0.27, 0.65, 0.0, 0.16],
  [0.04, 0.01, 0.10, 0.55, 0.0, 0.15],
  [0.22, 0.00, 0.04, 0.55, 0.0, 0.15],
  [0.30, 0.04, 0.24, 0.55, 0.25, 0.15]];
var THRUST = 2.1, DRAG2 = 2.2, DRAG1 = 0.6;
var PREY_SEEN = 2, PREY_MARK = 4;
var PREY_FROM = [-0.02, -0.17, -1.14], PREY_DRIFT = [-0.020, -0.055, 0.0];
var PREY_PAUSE = 0.55, PREY_BITE = 0.12, MOUTH = 0.45;
var PREY_LOOK = 0.5, PREY_TURN = 2.6, PREY_WIDE = 0.36;
var PREY_INK = [1.0, 0.84, 0.42];
var MOTE_FADE = 1.6, MOTE_INK = [0.50, 0.92, 1.0];
var WAKE = 460, WAKE_RATE = 130.0, WAKE_LIFE = 2.6;
var GLOW_FADE = 0.7, GLOW_RUN = 13.0, GLOW_INK = [0.80, 1.0, 0.97];
var STEP = 1 / 60, WARM = 240;
var PIVOT = [0.05, -0.55, 0.40], ORBIT = 0.24, TILT = 0.22;
var START_X = 1.05;

function morsel(from, age, out) {
  out[0] = from[0] + PREY_DRIFT[0] * age + 0.035 * Math.sin(2.3 * age);
  out[1] = from[1] + PREY_DRIFT[1] * age;
  out[2] = from[2] + PREY_DRIFT[2] * age + 0.02 * Math.sin(1.7 * age + 1.0);
  if (from.length > 3 && out[1] < from[3]) out[1] = from[3];   // tapped food settles on what lies below
  return out;
}

// ---- the anemone -------------------------------------------------------------------
var ARMS = 50, NODES = 14;
var ARM_BEND = 2.2, ARM_STIFF = [0.20, 2.2, 0.012], ARM_LIFE = 0.34;
var MOUND = [1.10, 0.36, 0.80];
var TIP = rgb(186, 228, 236), STEM = rgb(112, 94, 160);
var ARM_R = 0.043;
var FISH_C = [0.08, 0.0, 0.0], FISH_R = [0.60, 0.30, 0.17];
var LAYOUT_WEED = [0.05, -1.02, 0.40];
var BEAMS = [-2.6, -1.35, -0.2, 0.95, 2.1, 3.2];
var FLOOR = -1.42;
var ROCKS = [[0.05, 0.42, 1.50, 0.44, 1.10, 0.5],
  [2.25, 0.80, 0.95, 0.80, 0.85, 1.0], [-3.3, 1.5, 0.8, 0.5, 0.7, 2.0], [1.2, 2.9, 1.4, 0.9, 0.8, 3.0],
  [-1.2, 3.3, 1.1, 0.65, 0.7, 4.0], [4.6, 1.9, 0.9, 0.6, 0.7, 5.0], [-4.9, 0.4, 0.7, 0.45, 0.6, 6.0]];
var CORALS = [[-2.25, FLOOR, 0.85, 0.34, rgb(236, 96, 132), 3], [-2.85, FLOOR, 0.45, 0.24, rgb(240, 150, 90), 8],
  [2.60, FLOOR + 0.72, 1.25, 0.27, rgb(80, 200, 200), 5], [1.0, FLOOR, 2.3, 0.30, rgb(180, 110, 220), 12],
  [-0.9, FLOOR + 0.5, 3.4, 0.30, rgb(236, 96, 132), 21], [4.3, FLOOR, 0.9, 0.25, rgb(240, 150, 90), 30]];
var SAND = rgb(168, 140, 98);

var G = null;   // geometry + buffers (rebuilt on resize)
var S = null;   // simulation (survives resize)
var P = { scale: 1, cenX: 0, cenY: 0, x0: 0, mid: 0, cs: 1, ss: 0, ct: 1, st: 0, ok: false };
var userZoom = 1, zoomIdle = 99, pinch0 = 0, pinchZ0 = 1, pinchUntil = 0, listening = false;

// --- world -> camera: the camera swings round the anemone and leans; results in _vx,_vy,_vz
var _vx = 0, _vy = 0, _vz = 0;
function view(x, y, z) {
  var dx = x - PIVOT[0], dy = y - PIVOT[1], dz = z - PIVOT[2];
  var x1 = P.cs * dx + P.ss * dz, z1 = -P.ss * dx + P.cs * dz;
  _vx = x1 + PIVOT[0];
  _vy = P.ct * dy - P.st * z1 + PIVOT[1];
  _vz = P.st * dy + P.ct * z1 + PIVOT[2];
}
// camera-space delta -> world delta (the inverse turn)
var _wx = 0, _wy = 0, _wz = 0;
function unview(dx, dy, dz) {
  var y1 = P.ct * dy + P.st * dz, z1 = -P.st * dy + P.ct * dz;
  _wx = P.cs * dx - P.ss * z1; _wy = y1; _wz = P.ss * dx + P.cs * z1;
}
var _sx = 0, _sy = 0, _sh = 0;
function project(vx, vy, vz) {
  _sh = P.scale * CAM_D / (CAM_D + vz);
  _sx = P.x0 + _sh * (vx - P.cenX);
  _sy = P.mid - _sh * (vy - P.cenY);
}

function lineGlyph(dx, dy) {
  dx /= G.cw; dy /= G.ch;
  var ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay > 2.0 * ax) return C_PIPE;
  if (ax > 2.0 * ay) return C_DASH;
  return dx * dy < 0 ? C_SL : C_BS;
}

// ---- geometry tables ---------------------------------------------------------------
function buildTables() {
  var W = state.COLS, H = state.ROWS, n = W * H;
  var mob = state.isMobile || W * H < 9000;
  var g = {
    w: W, h: H, cw: state.CHAR_W, ch: state.CHAR_H,
    chars: new Uint8Array(n), r: new Float32Array(n), gg: new Float32Array(n), b: new Float32Array(n),
    owner: new Uint8Array(n), zbuf: new Float32Array(n), edge: new Int16Array(n), shaft: new Float32Array(n),
    best: new Float32Array(n), bj: new Uint8Array(n), box: new Float32Array(n), boy: new Float32Array(n),
    stamp: new Uint16Array(n), list: new Int32Array(n), mlit: new Float32Array(n),
  };
  g.PW = W * g.cw; g.PH = H * g.ch;
  // the reel frames a 1080 x 1908 px scene at scale 740; fit its middle to this screen
  // (a phone crops the reel's sides a little: the action is in the middle)
  g.k = Math.min(g.PW / 1080 * 1.2, g.PH / 1250);
  g.base = 740 * g.k;
  g.mid = g.PH * 0.5 - 60 * g.k;
  // body samples (the reel uses 280 x 120)
  var NS = mob ? 190 : 230, NT = mob ? 92 : 110;
  g.NS = NS; g.NT = NT;
  var nb = NS * NT;
  g.bS = new Float32Array(NS); g.bX = new Float32Array(nb); g.bY = new Float32Array(nb); g.bZ = new Float32Array(nb);
  g.bNx = new Float32Array(nb); g.bNy = new Float32Array(nb); g.bNz = new Float32Array(nb);
  g.bK = new Uint8Array(nb); g.bR = new Float32Array(nb); g.bG = new Float32Array(nb); g.bB = new Float32Array(nb);
  for (var i = 0; i < NS; i++) {
    var s = i / (NS - 1);
    g.bS[i] = s;
    var h = halfH(s), w = halfW(s), sl = interp(s, PROFILE_S, PROFILE_D);
    for (var j = 0; j < NT; j++) {
      var th = j / NT * TAU + (i & 1) * (0.5 * TAU / NT);
      var k = i * NT + j, v = Math.sin(th), c = Math.cos(th);
      g.bX[k] = s - 0.45; g.bY[k] = h * v; g.bZ[k] = w * c;
      var nx = -sl * w, ny = w * v, nz = h * c, nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) { nx = ny = nz = 0; } else { nx /= nl; ny /= nl; nz /= nl; }
      g.bNx[k] = nx; g.bNy[k] = ny; g.bNz[k] = nz;
      var kind = stripeKind(s, v);
      g.bK[k] = kind;
      var e = 0.5 * ease(v * 0.9), col;
      var br = ORANGE[0] * (1 - e) + DEEP[0] * e, bg = ORANGE[1] * (1 - e) + DEEP[1] * e, bb = ORANGE[2] * (1 - e) + DEEP[2] * e;
      if (s < 0.2) { br = br * 0.45 + FACE[0] * 0.55; bg = bg * 0.45 + FACE[1] * 0.55; bb = bb * 0.45 + FACE[2] * 0.55; }
      col = kind === 1 ? WHITE : kind === 2 ? DARK : [br, bg, bb];
      g.bR[k] = col[0]; g.bG[k] = col[1]; g.bB[k] = col[2];
    }
  }
  g.fq = mob ? 0.72 : 0.85;      // fin sample density, relative to the reel
  // rocks + the anemone's foot: static world points
  var pts = [];
  var RT = mob ? 28 : 40, RP = mob ? 72 : 100;
  g.rockSpan = [];
  for (var ri = 0; ri < ROCKS.length; ri++) {
    var R = ROCKS[ri], cx = R[0], cz = R[1], rx = R[2], ry = R[3], rz = R[4], seed = R[5];
    var far = clamp(1.0 - (cz + 1.0) / 6.0, 0.35, 1.0);
    g.rockSpan.push(pts.length / 7, cx, FLOOR + ry * 0.5, cz, Math.max(rx, ry, rz) * 1.25);
    for (var a = 0; a < RT; a++) {
      var tt = 0.02 + (1.57 - 0.02) * a / (RT - 1);
      for (var b = 0; b < RP; b++) {
        var ph = b / RP * TAU;
        var lump = 1 + 0.10 * Math.sin(5 * ph + seed) * Math.sin(3 * tt + seed) + 0.06 * Math.sin(11 * ph + 2 * seed);
        var nx2 = Math.sin(tt) * Math.cos(ph), ny2 = Math.cos(tt), nz2 = Math.sin(tt) * Math.sin(ph);
        var ux = nx2 / rx, uy = ny2 / ry, uz = nz2 / rz, ul = Math.hypot(ux, uy, uz);
        var lit = clamp((ux * LX + uy * LY + uz * LZ) / ul, 0, 1);
        var f = (0.20 + 0.50 * lit) * far;
        pts.push(cx + nx2 * lump * rx, FLOOR + ny2 * lump * ry, cz + nz2 * lump * rz,
          104 / 255 * f, 116 / 255 * f, 150 / 255 * f, 0.05 + 0.75 * Math.pow(lit, 1.5));
      }
    }
  }
  var FT = mob ? 30 : 36, FP = mob ? 96 : 112;
  g.rockSpan.push(pts.length / 7, LAYOUT_WEED[0], LAYOUT_WEED[1], LAYOUT_WEED[2], Math.max(MOUND[0], MOUND[1], MOUND[2]) * 1.3);
  for (a = 0; a < FT; a++) {
    tt = 0.02 + (1.57 - 0.02) * a / (FT - 1);
    for (b = 0; b < FP; b++) {
      ph = b / FP * TAU;
      nx2 = Math.sin(tt) * Math.cos(ph); ny2 = Math.cos(tt); nz2 = Math.sin(tt) * Math.sin(ph);
      ux = nx2 / MOUND[0]; uy = ny2 / MOUND[1]; uz = nz2 / MOUND[2]; ul = Math.hypot(ux, uy, uz);
      lit = clamp((ux * LX + uy * LY + uz * LZ) / ul, 0, 1);
      pts.push(LAYOUT_WEED[0] + nx2 * MOUND[0], LAYOUT_WEED[1] + ny2 * MOUND[1] - 0.06, LAYOUT_WEED[2] + nz2 * MOUND[2],
        STEM[0] * (0.14 + 0.30 * lit), STEM[1] * (0.14 + 0.30 * lit), STEM[2] * (0.14 + 0.30 * lit), 0.10 + 0.25 * lit);
    }
  }
  g.rockSpan.push(pts.length / 7);
  g.rock = new Float32Array(pts);
  g.nRock = pts.length / 7;
  // arm render scratch
  g.aLine = new Float32Array(ARMS * 34 * 3); g.aGlow = new Float32Array(ARMS * 34);
  g.fSx = new Float32Array(90); g.fSy = new Float32Array(90); g.fZ = new Float32Array(90); g.fRad = new Float32Array(90);
  g.fGlow = new Float32Array(90);
  g.order = new Int32Array(ARMS); g.mz = new Float32Array(ARMS);
  var uu = new Float32Array(34);
  g.thick34 = new Float32Array(34);
  for (i = 0; i < 34; i++) {
    uu[i] = i / 33;
    var cap = Math.sqrt(clamp(1 - Math.pow((uu[i] - 0.90) / 0.10, 2), 0, 1));
    g.thick34[i] = uu[i] > 0.90 ? (ARM_R + 0.006) * cap + 0.004 : ARM_R + 0.008 - 0.014 * uu[i] + 0.012 * Math.exp(-Math.pow((uu[i] - 0.86) / 0.08, 2));
  }
  g.thick90 = new Float32Array(90); g.u90 = new Float32Array(90); g.lo90 = new Uint8Array(90); g.w90 = new Float32Array(90);
  for (i = 0; i < 90; i++) {
    var fine = i * 33 / 89, lo = Math.min(Math.floor(fine), 32);
    g.lo90[i] = lo; g.w90[i] = fine - lo;
    g.thick90[i] = g.thick34[lo] * (1 - (fine - lo)) + g.thick34[lo + 1] * (fine - lo);
    g.u90[i] = fine / 33;
  }
  g.h34i = new Uint8Array(34); g.h34f = new Float32Array(34);
  for (i = 0; i < 34; i++) {
    var fn = i * (NODES - 1) / 33, i0 = Math.min(Math.max(Math.floor(fn), 0), NODES - 2);
    g.h34i[i] = i0; g.h34f[i] = fn - i0;
  }
  g.stampId = 0;
  return g;
}

// ---- simulation --------------------------------------------------------------------
function buildAnemone() {
  var A = {};
  var nN = ARMS * NODES;
  A.u = new Float32Array(NODES);
  for (var n = 0; n < NODES; n++) A.u[n] = n / (NODES - 1);
  A.rest = new Float64Array(nN * 3); A.x = new Float64Array(nN * 3); A.xo = new Float64Array(nN * 3);
  A.v = new Float64Array(nN * 3); A.off = new Float64Array(ARMS * (NODES - 1) * 3); A.link = new Float64Array(ARMS * (NODES - 1));
  A.side = new Float64Array(ARMS * 3); A.fore = new Float64Array(ARMS * 3); A.back = new Float64Array(ARMS);
  A.depth = new Float32Array(ARMS);
  A.stiff = new Float64Array(NODES - 1); A.drag = new Float64Array(NODES);
  A.glow = new Float32Array(nN); A.touched = new Uint8Array(nN);
  for (n = 0; n < NODES - 1; n++) A.stiff[n] = ARM_STIFF[0] * Math.pow(1 - A.u[n + 1], ARM_STIFF[1]) + ARM_STIFF[2];
  for (n = 0; n < NODES; n++) A.drag[n] = 1.2 + 4.2 * Math.pow(A.u[n], 1.2);
  for (var i = 0; i < ARMS; i++) {
    var lat = DATA.ARM_LAT[i], lon = DATA.ARM_LON[i], len = DATA.ARM_LEN[i];
    var nx = Math.sin(lat) * Math.cos(lon), ny = Math.cos(lat), nz = Math.sin(lat) * Math.sin(lon);
    var rx = LAYOUT_WEED[0] + nx * MOUND[0], ry = LAYOUT_WEED[1] + ny * MOUND[1], rz = LAYOUT_WEED[2] + nz * MOUND[2];
    var ax = nx * 1.05, ay = ny * 0.7 + 0.42, az = nz;
    if (ay < 0.30) ay = 0.30;
    var al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
    var sx = ay, sy = -ax, sz = 0, sl = Math.hypot(sx, sy) || 1e-9; sx /= sl; sy /= sl;   // cross(aim, z)
    var fx = ay * sz - az * sy, fy = az * sx - ax * sz, fz = ax * sy - ay * sx;            // cross(aim, side)
    A.side[i * 3] = sx; A.side[i * 3 + 1] = sy; A.side[i * 3 + 2] = sz;
    A.fore[i * 3] = fx; A.fore[i * 3 + 1] = fy; A.fore[i * 3 + 2] = fz;
    var c0 = DATA.ARM_CURL[i * 2], c1 = DATA.ARM_CURL[i * 2 + 1];
    var bx = sx * c0 + fx * c1, by = sy * c0 + fy * c1, bz = sz * c0 + fz * c1;
    for (n = 0; n < NODES; n++) {
      var u = A.u[n], q = u * u - 0.55 * u * u * u, k = (i * NODES + n) * 3;
      A.rest[k] = rx + len * (ax * u + ARM_BEND * bx * q);
      A.rest[k + 1] = ry + len * (ay * u + ARM_BEND * by * q) + 0.20 * len * u * u;
      A.rest[k + 2] = rz + len * (az * u + ARM_BEND * bz * q);
    }
    for (n = 0; n < NODES - 1; n++) {
      var k0 = (i * NODES + n) * 3, o = (i * (NODES - 1) + n) * 3;
      A.off[o] = A.rest[k0 + 3] - A.rest[k0]; A.off[o + 1] = A.rest[k0 + 4] - A.rest[k0 + 1]; A.off[o + 2] = A.rest[k0 + 5] - A.rest[k0 + 2];
      A.link[i * (NODES - 1) + n] = Math.hypot(A.off[o], A.off[o + 1], A.off[o + 2]);
    }
    A.back[i] = (rz - LAYOUT_WEED[2] + MOUND[2]) / (2 * MOUND[2]);
    A.depth[i] = clamp(1.1 - 0.7 * A.back[i], 0.30, 1.0);
  }
  A.x.set(A.rest);
  var nm = DATA.MOTES.length / 3;
  A.nm = nm; A.lit = new Float32Array(nm); A.moff = new Float64Array(nm * 3);
  A.wake = new Float64Array(WAKE * 3); A.born = new Float64Array(WAKE).fill(-99); A.owed = 0;
  return A;
}

function newSim() {
  var s = {
    t: 0, acc: 0, lastT: state.time,
    p: [ROUND[0][0], ROUND[0][1], ROUND[0][2]], a: Math.PI + 0.5, th: 0, v: 0, e: 0, phi: 0, k: 1, rest: 0,
    circling: 0, food: -1, stare: 0, spot: -99, huntId: -1, huntT: 0,
    foods: [], nextId: 1, bites: [], eaten: 0,
    prev: [0, 0, 0], aPrev: Math.PI + 0.5, vPrev: 0, spin: 0, slowing: 0, speed: 0, hz: 0.7,
    camX: 0, camY: 0, camZ: 0, lead: 0, zoomA: 1.34, wideF: 1, primed: false,
    yaw: 0, pitch: 0, place: [0, 0, 0], earlier: [0, 0, 0],
    finger: null,
  };
  s.prev[0] = s.p[0]; s.prev[1] = s.p[1]; s.prev[2] = s.p[2];
  s.A = buildAnemone();
  return s;
}

var _m = [0, 0, 0], _m2 = [0, 0, 0];
function roundFood() { return S.food >= 0 ? morsel(PREY_FROM, S.food, _m) : null; }

// one tick of the swimmer (swim_round's loop body, live)
function swimStep() {
  var nR = ROUND.length;
  var uf = S.foods.length ? S.foods[0] : null;
  if (uf && S.rest > 0) { S.rest = 0; S.k = (S.k + 1) % nR; }
  var mark = S.rest > 0 ? ROUND[(S.k + 1) % nR] : ROUND[S.k];
  var roundHunt = S.k === PREY_MARK && S.food >= 0 && S.rest <= 0;
  if (S.food >= 0) S.food += STEP;
  for (var i = 0; i < S.foods.length; i++) S.foods[i].age += STEP;
  var hunting = !!uf || roundHunt, target;
  if (uf) {
    target = morsel(uf.from, uf.age, _m2);
    if (S.huntId !== uf.id) { S.huntId = uf.id; S.stare = PREY_PAUSE; S.spot = S.t; S.huntT = 0; }
    S.huntT += STEP;
  } else if (roundHunt) target = morsel(PREY_FROM, S.food, _m2);
  var tx, ty, tz;
  if (hunting) { tx = target[0]; ty = target[1]; tz = target[2]; } else { tx = mark[0]; ty = mark[1]; tz = mark[2]; }
  var p = S.p, a = S.a, th = S.th;
  var toX = tx - p[0], toY = ty - p[1], toZ = tz - p[2];
  var dist = Math.hypot(toX, toY, toZ);
  var dx = Math.cos(a) * Math.cos(th), dy = Math.sin(th), dz = Math.sin(a) * Math.cos(th);
  var want;
  if (S.rest > 0) {
    S.rest -= STEP;
    want = 0.0;
    if (S.rest <= 0) S.k = (S.k + 1) % nR;
  } else {
    want = uf ? 2.1 * clamp((dist - 0.2) / 0.6, 0.1, 1) : mark[3] * (mark[4] > 0 ? clamp(dist / 0.35, 0.5, 1) : 1);   // tapped food: a burst, easing off close in so it does not overshoot
    if (hunting && S.stare > 0) { S.stare -= STEP; want = 0.05; }
    var ahead = toX * Math.cos(a) + toZ * Math.sin(a);
    S.circling = dist < 3 * mark[5] ? S.circling + STEP : 0.0;
    var caught;
    if (hunting) {
      var mx = p[0] + MOUTH * dx - tx, my = p[1] + MOUTH * dy - ty, mz = p[2] + MOUTH * dz - tz;
      var bite = PREY_BITE + (uf ? 0.06 * Math.max(S.huntT - 6, 0) : 0);   // a fish that circles its food at last gets it
      caught = Math.hypot(mx, my, mz) < bite;
      if (uf && !caught) {
        // tapped food can land right beside it: the head swallows it as it swings through
        var al = clamp(toX * dx + toY * dy + toZ * dz, 0, MOUTH);
        caught = dist < 0.12 || al > 0.12 && Math.hypot(toX - al * dx, toY - al * dy, toZ - al * dz) < 0.1;
      }
    } else caught = dist < mark[5];
    if (uf) {
      if (caught) {
        S.bites.push({ at: [tx, ty, tz], t0: S.t });
        S.foods.shift(); S.huntId = -1; S.circling = 0; S.eaten++;
      }
    } else if (caught || (mark[4] > 0 && dist < 2.5 * mark[5] && ahead < 0) || S.circling > 1.4) {
      S.circling = 0.0;
      if (hunting) { S.bites.push({ at: [tx, ty, tz], t0: S.t }); S.food = -1.0; S.eaten++; }
      else if (S.k === PREY_SEEN - 1) S.food = 0.0;
      S.rest = mark[4];
      if (S.rest <= 0) {
        S.k = (S.k + 1) % nR;
        if (S.k === PREY_MARK && S.food >= 0) { S.stare = PREY_PAUSE; S.spot = S.t; }
        else S.stare = 0;
      }
    }
  }
  // steer: swing the heading round, tip the nose along the path
  var swing = mod(Math.atan2(toZ, toX) - a + Math.PI, TAU) - Math.PI;
  var eager = S.rest > 0 ? 0.35 : 0.5 + 2.4 * S.e;
  if (S.stare > 0) eager = Math.max(eager, 2.2);
  else if (uf) eager = Math.max(eager, 1.8);
  var cw = Math.max(Math.cos(swing), 0);
  want *= 0.40 + 0.60 * cw * cw;
  S.a = a + clamp(swing * eager, -1.9, 1.9) * STEP;
  var pitchMax = uf ? 0.95 : 0.6;   // it will climb or dive steeply for food
  S.th = th + (0.8 * Math.asin(clamp(toY / Math.max(dist, 1e-6), -pitchMax, pitchMax)) * (S.rest > 0 ? 0.25 : 1) - th) * 0.7 * eager * STEP;
  S.e += (want - S.e) * (want < S.e ? 2.2 : 1.1 + 2.2 * Math.max(want - 1.2, 0)) * STEP;
  S.hz = 0.70 + 1.05 * S.e;
  S.phi += TAU * S.hz * STEP;
  var sp = Math.sin(S.phi - 0.9);
  var push = THRUST * S.e * (0.30 + 0.70 * sp * sp);
  S.v += (push - DRAG2 * S.v * Math.abs(S.v) - DRAG1 * S.v) * STEP;
  S.prev[0] = p[0]; S.prev[1] = p[1]; S.prev[2] = p[2];
  dx = Math.cos(S.a) * Math.cos(S.th); dy = Math.sin(S.th); dz = Math.sin(S.a) * Math.cos(S.th);
  p[0] += S.v * STEP * dx; p[1] += S.v * STEP * dy; p[2] += S.v * STEP * dz;
  // the rates the renderer reads (np.gradient of the round in the original)
  var spin = (S.a - S.aPrev) / STEP, slow = Math.max(-(S.v - S.vPrev) / STEP, 0);
  S.spin += (spin - S.spin) * 0.25; S.slowing += (slow - S.slowing) * 0.25;
  S.aPrev = S.a; S.vPrev = S.v;
  S.speed = Math.hypot(p[0] - S.prev[0], p[1] - S.prev[1], p[2] - S.prev[2]) / STEP;
  // tapped food that nobody eats goes out
  for (i = S.foods.length - 1; i >= 0; i--) if (S.foods[i].age > 40) S.foods.splice(i, 1);
  // [camera] a lazy follow; it steps back and turns to hold the morsel too
  var fAge = uf ? uf.age : S.food, gx = 0, gy = 0, gz = 0;
  if (hunting || fAge >= 0) {
    var fp = uf ? morsel(uf.from, uf.age, _m) : morsel(PREY_FROM, S.food, _m);
    var eo = ease((fAge - PREY_LOOK) / PREY_TURN);
    gx = (fp[0] - p[0]) * eo; gy = (fp[1] - p[1]) * eo; gz = (fp[2] - p[2]) * eo;
  }
  var wide = 1 - PREY_WIDE * clamp(Math.hypot(gx, gy, gz) / 1.2, 0, 1);
  var zt = 1.34 - 0.52 * clamp(S.v / 0.75, 0, 1) - 0.22 * clamp((S.v - 0.58) / 0.28, 0, 1);
  var lc = Math.cos(S.a);
  if (!S.primed) {
    S.camX = p[0] + 0.5 * gx; S.camY = p[1] + 0.5 * gy; S.camZ = p[2] + 0.5 * gz; S.lead = lc; S.zoomA = zt; S.wideF = wide; S.primed = true;
  }
  S.camX += (p[0] + 0.5 * gx - S.camX) * STEP / 0.55;
  S.camY += (p[1] + 0.5 * gy - S.camY) * STEP / 0.8;
  S.camZ += (p[2] + 0.5 * gz - S.camZ) * STEP / 0.9;
  S.lead += (lc - S.lead) * STEP / 0.9;
  S.zoomA += (zt - S.zoomA) * STEP / 1.0;
  S.wideF += (wide - S.wideF) * STEP / 0.25;
  // fish_pose: the head answers the tail
  var wag = 0.05 * (0.4 + S.e) * Math.sin(S.phi + 0.8);
  S.earlier[0] = S.place[0]; S.earlier[1] = S.place[1]; S.earlier[2] = S.place[2];
  S.place[0] = p[0]; S.place[1] = p[1]; S.place[2] = p[2];
  S.yaw = Math.PI - S.a + wag; S.pitch = -S.th;
}

// one tick of the anemone (Anemone.step)
function reefStep(t) {
  var A = S.A, x = A.x, v = A.v, u = A.u;
  var pl = S.place, ea = S.earlier;
  var fvx = (pl[0] - ea[0]) / STEP, fvy = (pl[1] - ea[1]) / STEP, fvz = (pl[2] - ea[2]) / STEP;
  var nN = ARMS * NODES, i, n, k;
  A.xo.set(x);
  var touched = A.touched; touched.fill(0);
  for (i = 0; i < ARMS; i++) {
    var b0 = DATA.ARM_BEAT[i * 2] * TAU / LOOP * t + DATA.ARM_PHASE[i * 2];
    var b1 = DATA.ARM_BEAT[i * 2 + 1] * TAU / LOOP * t + DATA.ARM_PHASE[i * 2 + 1];
    var sx = A.side[i * 3], sy = A.side[i * 3 + 1], sz = A.side[i * 3 + 2];
    var fx = A.fore[i * 3], fy = A.fore[i * 3 + 1], fz = A.fore[i * 3 + 2];
    for (n = 1; n < NODES; n++) {
      k = (i * NODES + n) * 3;
      var X = x[k], Y = x[k + 1], Z = x[k + 2];
      var c1 = W1 * t - 1.3 * X;
      var flx = 0.62 * Math.sin(c1) + 0.16 * Math.sin(W3 * t + 2.0 * Z);
      var fly = 0.10 * Math.cos(c1);
      var flz = 0.08 * Math.cos(W2 * t + 3.0 * X);
      var ddx = X - pl[0], ddy = Y - pl[1], ddz = Z - pl[2];
      var near = Math.exp(-(ddx * ddx + ddy * ddy + ddz * ddz) / 0.10) * 0.9;
      flx += near * fvx; fly += near * fvy; flz += near * fvz;
      var s0 = Math.sin(b0 - 5.0 * u[n]), s1 = 0.7 * Math.sin(b1 - 5.0 * u[n]), life = ARM_LIFE * Math.pow(u[n], 0.7);
      flx += life * (s0 * sx + s1 * fx); fly += life * (s0 * sy + s1 * fy); flz += life * (s0 * sz + s1 * fz);
      var dr = A.drag[n] * STEP;
      v[k] += dr * (flx - v[k]); v[k + 1] += dr * (fly - v[k + 1]); v[k + 2] += dr * (flz - v[k + 2]);
      x[k] += v[k] * STEP; x[k + 1] += v[k + 1] * STEP; x[k + 2] += v[k + 2] * STEP;
    }
  }
  // the fish as an egg in its own frame
  var cy = Math.cos(S.yaw), sy2 = Math.sin(S.yaw), cr = Math.cos(S.pitch), sr = Math.sin(S.pitch);
  var ex = FISH_R[0] + ARM_R, ey = FISH_R[1] + ARM_R, ez = FISH_R[2] + ARM_R;
  var fg = S.finger && P.ok ? S.finger : null;
  for (var pass = 0; pass < 2; pass++) {
    for (i = 0; i < ARMS; i++) {
      var base = i * NODES;
      for (n = 1; n < NODES; n++) {
        k = (base + n) * 3;
        var o = (i * (NODES - 1) + n - 1) * 3, st = A.stiff[n - 1];
        x[k] += st * (x[k - 3] + A.off[o] - x[k]);
        x[k + 1] += st * (x[k - 2] + A.off[o + 1] - x[k + 1]);
        x[k + 2] += st * (x[k - 1] + A.off[o + 2] - x[k + 2]);
      }
      for (n = 1; n < NODES; n++) {
        k = (base + n) * 3;
        var lx = x[k] - pl[0], ly = x[k + 1] - pl[1], lz = x[k + 2] - pl[2];
        // rot_y(-yaw) then rot_z(-roll)
        var x1 = cy * lx - sy2 * lz, z1 = sy2 * lx + cy * lz;
        var x2 = cr * x1 + sr * ly, y2 = -sr * x1 + cr * ly;
        var qx = (x2 - FISH_C[0]) / ex, qy = (y2 - FISH_C[1]) / ey, qz = (z1 - FISH_C[2]) / ez;
        var d = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (d < 1) {
          touched[base + n] = 1;
          var dd = Math.max(d, 1e-6);
          var ox = qx / dd * ex + FISH_C[0], oy = qy / dd * ey + FISH_C[1], oz = qz / dd * ez + FISH_C[2];
          // rot_z(roll) then rot_y(yaw), + place
          var x3 = cr * ox - sr * oy, y3 = sr * ox + cr * oy;
          var wx = cy * x3 + sy2 * oz + pl[0], wz = -sy2 * x3 + cy * oz + pl[2];
          x[k] += 0.5 * (wx - x[k]); x[k + 1] += 0.5 * (y3 + pl[1] - x[k + 1]); x[k + 2] += 0.5 * (wz - x[k + 2]);
        }
        if (fg) {
          // a finger is the same soft shove, applied where the arm sits on the screen
          view(x[k], x[k + 1], x[k + 2]); project(_vx, _vy, _vz);
          var fdx = _sx - fg.x, fdy = _sy - fg.y, fd = Math.hypot(fdx, fdy), fr = fg.r;
          if (fd < fr) {
            touched[base + n] = 1;
            if (fd < 1e-3) { fdx = 1; fdy = 0; fd = 1; }
            var pushp = 0.5 * (fr - fd) / _sh;
            unview(pushp * fdx / fd, -pushp * fdy / fd, 0);
            x[k] += _wx; x[k + 1] += _wy; x[k + 2] += _wz;
          }
        }
      }
      k = base * 3;
      x[k] = A.rest[k]; x[k + 1] = A.rest[k + 1]; x[k + 2] = A.rest[k + 2];
      for (n = 1; n < NODES; n++) {
        k = (base + n) * 3;
        var ux = x[k] - x[k - 3], uy = x[k + 1] - x[k - 2], uz = x[k + 2] - x[k - 1];
        var ul = Math.max(Math.sqrt(ux * ux + uy * uy + uz * uz), 1e-9), L = A.link[i * (NODES - 1) + n - 1] / ul;
        x[k] = x[k - 3] + ux * L; x[k + 1] = x[k - 2] + uy * L; x[k + 2] = x[k - 1] + uz * L;
      }
    }
  }
  for (i = 0; i < nN; i++) {
    k = i * 3;
    if (i % NODES === 0) { v[k] = v[k + 1] = v[k + 2] = 0; continue; }
    var vx = (x[k] - A.xo[k]) / STEP * 0.985, vy = (x[k + 1] - A.xo[k + 1]) / STEP * 0.985, vz = (x[k + 2] - A.xo[k + 2]) / STEP * 0.985;
    var fast = Math.sqrt(vx * vx + vy * vy + vz * vz), lim = Math.min(1.0, 1.1 / Math.max(fast, 1e-6));
    v[k] = vx * lim; v[k + 1] = vy * lim; v[k + 2] = vz * lim;
  }
  // [touch] a touched arm lights up where it was touched; the light runs to the tip and fades
  var fsp = Math.hypot(pl[0] - ea[0], pl[1] - ea[1], pl[2] - ea[2]) / STEP;
  var rushK = clamp((fsp - 0.55) * 3.0, 0, 1);
  var gl = A.glow, dec = Math.exp(-STEP / GLOW_FADE);
  for (i = 0; i < ARMS; i++) {
    var bse = i * NODES, prevOld = gl[bse] * dec;
    gl[bse] = prevOld;
    for (n = 1; n < NODES; n++) {
      var cur = gl[bse + n] * dec;
      gl[bse + n] = cur + GLOW_RUN * STEP * (prevOld - cur);
      prevOld = cur;
    }
    for (n = 0; n < NODES; n++) {
      k = (bse + n) * 3;
      var gx = x[k] - pl[0], gy = x[k + 1] - pl[1], gz = x[k + 2] - pl[2];
      var rush = 0.8 * rushK * Math.exp(-(gx * gx + gy * gy + gz * gz) / 0.16);
      var lift = touched[bse + n] ? 1 : rush;
      if (lift > gl[bse + n]) gl[bse + n] = lift;
    }
  }
  // [plankton] motes flash as the fish rushes by and get dragged along a moment
  var M = DATA.MOTES, lit = A.lit, mo = A.moff, mfade = Math.exp(-STEP / MOTE_FADE), ofade = Math.exp(-STEP / 2.2);
  var fk = clamp((fsp - 0.42) * 2.4, 0, 1);
  var mvx = pl[0] - ea[0], mvy = pl[1] - ea[1], mvz = pl[2] - ea[2];
  for (i = 0; i < A.nm; i++) {
    k = i * 3;
    var qx2 = M[k] + mo[k] - pl[0], qy2 = M[k + 1] + mo[k + 1] - pl[1], qz2 = M[k + 2] + mo[k + 2] - pl[2];
    var gap = qx2 * qx2 + qy2 * qy2 + qz2 * qz2;
    var fl = clamp(fk * Math.exp(-gap / 0.22) + 0.35 * Math.exp(-gap / 0.03), 0, 1);
    var l2 = lit[i] * mfade;
    lit[i] = l2 > fl ? l2 : fl;
    var drag = 0.55 * Math.exp(-gap / 0.10);
    mo[k] = mo[k] * ofade + drag * mvx; mo[k + 1] = mo[k + 1] * ofade + drag * mvy; mo[k + 2] = mo[k + 2] * ofade + drag * mvz;
  }
  // sparks shed behind the tail in a sprint
  A.owed += WAKE_RATE * clamp((fsp - 0.50) / 0.30, 0, 1) * STEP;
  var hl = Math.max(Math.hypot(mvx, mvy, mvz), 1e-9);
  while (A.owed >= 1) {
    A.owed -= 1;
    var w = (Math.random() * WAKE) | 0, back = 0.30 + 0.55 * Math.random();
    A.wake[w * 3] = pl[0] - mvx / hl * back + 0.07 * gauss();
    A.wake[w * 3 + 1] = pl[1] - mvy / hl * back + 0.20 * gauss();
    A.wake[w * 3 + 2] = pl[2] - mvz / hl * back + 0.16 * gauss();
    A.born[w] = t;
  }
  for (i = 0; i < WAKE; i++) A.wake[i * 3 + 1] += 0.04 * STEP;
}
function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random()); }

function simStep() {
  swimStep();
  S.t += STEP;
  reefStep(S.t);
}

function warm() {
  // swim until the fish is on its way home, above the anemone (where the reel's loop starts),
  // then let the arms settle into the surge for WARM steps
  var px = S.p[0];
  for (var i = 0; i < 60 * 120; i++) {
    swimStep(); S.t += STEP;
    if ((S.k === 8 || S.k === 9) && px > START_X && S.p[0] <= START_X && Math.cos(S.a) < 0 && S.p[1] > 0.2) break;
    px = S.p[0];
  }
  for (i = 0; i < WARM; i++) simStep();
}

// ---- drawing -----------------------------------------------------------------------
var PL = [0, 0, 0], PC = 1, PS = 0, YC = 1, YS = 0;
var reachT = new Float64Array(76), bodyEnd = 0;
function remapX(x) {
  if (x > TAIL_ROOT) return bodyEnd + x - TAIL_ROOT;
  var f = (x + 0.45) / 0.02;
  if (f <= 0) return -0.45;
  if (f >= 75) return reachT[75] - 0.45;
  var i = f | 0, w = f - i;
  return reachT[i] * (1 - w) + reachT[i + 1] * w - 0.45;
}
// local fish point -> world -> camera -> cell; results in _cx,_cy (px), _vz
var _px = 0, _py = 0, _pz = 0;
function pose(lx, ly, lz) {
  var X = remapX(lx);
  var x1 = PC * X - PS * ly, y1 = PS * X + PC * ly;
  _px = YC * x1 + YS * lz + PL[0]; _py = y1 + PL[1]; _pz = -YS * x1 + YC * lz + PL[2];
}

function plot(sx, sy, vz, code, r, gg, b, kind) {
  var g = G, c = Math.floor(sx / g.cw), rr = Math.floor(sy / g.ch);
  if (c < 0 || c >= g.w || rr < 0 || rr >= g.h) return;
  var id = rr * g.w + c;
  if (vz < g.zbuf[id]) {
    g.chars[id] = code; g.r[id] = r; g.gg[id] = gg; g.b[id] = b; g.owner[id] = kind; g.zbuf[id] = vz;
  }
}
// pose then camera, as one matrix per frame: v = M * (remapX(x), y, z) + T
var M00 = 1, M01 = 0, M02 = 0, M10 = 0, M11 = 1, M12 = 0, M20 = 0, M21 = 0, M22 = 1, T0 = 0, T1 = 0, T2 = 0;
var V02 = 0, V12 = 0, V22 = 1;
function setXform() {
  // RP = rot_y(yaw) . rot_z(pitch); RV = rot_x(tilt) . rot_y(swing)
  var p00 = YC * PC, p01 = -YC * PS, p02 = YS, p10 = PS, p11 = PC, p12 = 0, p20 = -YS * PC, p21 = YS * PS, p22 = YC;
  var v00 = P.cs, v01 = 0, v02 = P.ss, v10 = P.st * P.ss, v11 = P.ct, v12 = -P.st * P.cs, v20 = -P.ct * P.ss, v21 = P.st, v22 = P.ct * P.cs;
  M00 = v00 * p00 + v01 * p10 + v02 * p20; M01 = v00 * p01 + v01 * p11 + v02 * p21; M02 = v00 * p02 + v01 * p12 + v02 * p22;
  M10 = v10 * p00 + v11 * p10 + v12 * p20; M11 = v10 * p01 + v11 * p11 + v12 * p21; M12 = v10 * p02 + v11 * p12 + v12 * p22;
  M20 = v20 * p00 + v21 * p10 + v22 * p20; M21 = v20 * p01 + v21 * p11 + v22 * p21; M22 = v20 * p02 + v21 * p12 + v22 * p22;
  view(PL[0], PL[1], PL[2]); T0 = _vx; T1 = _vy; T2 = _vz;
  V02 = v02; V12 = v12; V22 = v22;
}
var LUM_LUT = new Uint8Array(1025);
for (var li0 = 0; li0 <= 1024; li0++) { var lq = ((Math.pow(1 - li0 / 1024, 1.3) * 35) | 0); LUM_LUT[li0] = RAMP_C[lq < 0 ? 0 : lq > 35 ? 35 : lq]; }
function fishPointX(X, ly, lz, r, gg, b, lum, kind, dz) {
  var vx = M00 * X + M01 * ly + M02 * lz + T0 + V02 * dz;
  var vy = M10 * X + M11 * ly + M12 * lz + T1 + V12 * dz;
  var vz = M20 * X + M21 * ly + M22 * lz + T2 + V22 * dz;
  var sh = P.scale * CAM_D / (CAM_D + vz);
  plot(P.x0 + sh * (vx - P.cenX), P.mid - sh * (vy - P.cenY), vz, LUM_LUT[(lum * 1024) | 0], r, gg, b, kind);
}
function fishPoint(lx, ly, lz, r, gg, b, lum, kind, dz) { fishPointX(remapX(lx), ly, lz, r, gg, b, lum, kind, dz); }
var FIN_COL = [ORANGE[0] * 0.94 + FACE[0] * 0.06, ORANGE[1] * 0.94 + FACE[1] * 0.06, ORANGE[2] * 0.94 + FACE[2] * 0.06];
// a fin sample: p and q (p + a short step along the ray) in the fish's own frame; drawn with | - / \
function finPoint(px, py, pz, qx, qy, qz, b, margin, rim) {
  var X = remapX(px), dX = remapX(qx) - X, dY = qy - py, dZ = qz - pz;
  var vx = M00 * X + M01 * py + M02 * pz + T0, vy = M10 * X + M11 * py + M12 * pz + T1, vz = M20 * X + M21 * py + M22 * pz + T2;
  var sh = P.scale * CAM_D / (CAM_D + vz);
  // the ray's direction on the screen (q is 0.03 away: perspective across it is negligible)
  var ddx = M00 * dX + M01 * dY + M02 * dZ, ddy = M10 * dX + M11 * dY + M12 * dZ;
  var col = b > rim ? RIM : b > margin ? DARK : FIN_COL;
  plot(P.x0 + sh * (vx - P.cenX), P.mid - sh * (vy - P.cenY), vz, lineGlyph(ddx, -ddy), col[0] * 0.92, col[1] * 0.92, col[2] * 0.92, FIN);
}

function drawFish(t) {
  var g = G;
  PL[0] = S.place[0]; PL[1] = S.place[1]; PL[2] = S.place[2];
  PC = Math.cos(S.pitch); PS = Math.sin(S.pitch); YC = Math.cos(S.yaw); YS = Math.sin(S.yaw);
  setXform();
  SW.effort = Math.min(0.5 + 1.25 * S.e, 2.0); SW.turn = clamp(0.11 * S.spin, -0.2, 0.2);
  SW.phase = S.phi; SW.hz = S.hz; SW.t = t; SW.brake = clamp(1.6 * S.slowing, 0, 0.7);
  // a bent spine is no longer than a straight one: walk the wave, give each point its real length
  var i, j, k;
  var sw76 = drawFish.sw || (drawFish.sw = new Float64Array(76));
  for (i = 0; i < 76; i++) sw76[i] = sway(i * 0.02, 0);
  reachT[0] = 0;
  for (i = 1; i < 76; i++) {
    var slope = i === 75 ? (sw76[75] - sw76[74]) / 0.02 : (sw76[i + 1] - sw76[i - 1]) / 0.04;
    reachT[i] = reachT[i - 1] + 0.02 / Math.sqrt(1 + slope * slope);
  }
  var f98 = 0.98 / 0.02, i98 = f98 | 0;
  bodyEnd = reachT[i98] * (1 - (f98 - i98)) + reachT[i98 + 1] * (f98 - i98) - 0.45;

  // [glint] when the fish turns its face to us, a highlight slides over its flank
  var facing = ease((-(YS * PC) - 0.35) / 0.45);
  var shineK = 0.25 + 0.75 * facing;
  // [body]
  var NS = g.NS, NT = g.NT;
  var swS = drawFish.swS && drawFish.swS.length === NS ? drawFish.swS : (drawFish.swS = new Float64Array(NS));
  for (i = 0; i < NS; i++) swS[i] = sway(g.bS[i], 0);
  for (i = 0; i < NS; i++) {
    var zs = swS[i], Xr = remapX(g.bS[i] - 0.45);
    for (j = 0; j < NT; j++) {
      k = i * NT + j;
      var nx = g.bNx[k], ny = g.bNy[k], nz = g.bNz[k];
      var nx1 = PC * nx - PS * ny, ny1 = PS * nx + PC * ny;
      var wx = YC * nx1 + YS * nz, wz = -YS * nx1 + YC * nz;
      var dl = wx * LX + ny1 * LY + wz * LZ, lit = dl < 0 ? 0 : dl > 1 ? 1 : dl;
      var dh = wx * HX + ny1 * HY + wz * HZ;
      var shine = 0;
      if (dh > 0.3) { var d2 = dh > 1 ? 1 : dh * dh, d4 = d2 * d2, d8 = d4 * d4; shine = d8 * d4 * d2 * shineK; }
      var kind = g.bK[k], lum, f;
      if (kind === 2) { lum = 0.42; f = 1.0; } else if (kind === 1) { lum = 0.86 + 0.14 * lit; f = 0.82 + 0.18 * lit; } else { lum = 0.66 + 0.3 * lit; f = 0.42 + 0.58 * lit; }
      var add = kind === 2 ? 0 : 0.75 * shine;
      lum = Math.min(lum + 0.3 * shine, 1);
      var r = Math.min(g.bR[k] * f + add, 1), gg = Math.min(g.bG[k] * f + add, 1), b = Math.min(g.bB[k] * f + add, 1);
      fishPointX(Xr, g.bY[k], g.bZ[k] + zs, r, gg, b, lum, FISH, 0);
    }
  }
  drawFins(t);
  // [eyes]
  for (var side = -1; side <= 1; side += 2) {
    for (var ui = 0; ui < 9; ui++) {
      var u = ui / 8, rr = 0.041 * u;
      for (var ki = 0; ki < 28; ki++) {
        var kk = ki / 27 * TAU;
        var s = 0.115 + rr * Math.cos(kk), y = 0.05 + rr * Math.sin(kk);
        var hy = y / halfH(s);
        var z = side * (halfW(s) * Math.sqrt(clamp(1 - hy * hy, 0.05, 1)) + 0.03);
        var col = u < 0.6 ? EYE_IN : EYE_RING;
        if (u > 0.15 && u < 0.42 && Math.abs(kk - 2.2) < 0.45) col = EYE_HI;
        fishPoint(s - 0.45, y, z + sway(s, 0), col[0], col[1], col[2], u < 0.6 ? 0.62 : 0.72, FISH, -0.004);
      }
    }
  }
}
var EYE_IN = rgb(58, 34, 30), EYE_RING = rgb(255, 190, 96), EYE_HI = rgb(235, 225, 215);

var tailTurn = new Float64Array(64), tailFar = new Float64Array(64), tailSide = new Float64Array(64), tailVals = new Float64Array(64);
function drawFins(t) {
  var q = G.fq, ia, ib, a, b, NA, NB, s, reach, px, py, pz, ox, oy, oz, ol;
  // dorsal: a spiny front lobe and a soft rear lobe
  var LOBES = [[0.25, 0.57, 0.15, 0.45], [0.53, 0.88, 0.125, 0.85]];
  for (var li = 0; li < 2; li++) {
    var s0 = LOBES[li][0], s1 = LOBES[li][1], tall = LOBES[li][2], lean = LOBES[li][3];
    NA = Math.round(110 * q); NB = Math.round(30 * q);
    for (ia = 0; ia < NA; ia++) {
      a = ia / (NA - 1);
      s = s0 + (s1 - s0) * a;
      reach = tall * Math.pow(Math.sin(Math.PI * Math.pow(a, 0.8)), 0.8);
      var rootY = halfH(s) * 0.93;
      ox = lean * reach; oy = reach; ol = Math.hypot(ox, oy) || 1e-9;
      for (ib = 0; ib < NB; ib++) {
        b = ib / (NB - 1);
        px = s - 0.45 + ox * b; py = rootY + oy * b;
        pz = sway(px + 0.45, 0.16 * b) + 0.05 * Math.pow(b, 1.5) * Math.sin(TAU * 1.1 * t - 8 * a - 3 * (s0 > 0.4 ? 1 : 0));
        finPoint(px, py, pz, px + ox / ol * 0.03, py + oy / ol * 0.03, pz, b, 0.84, 0.96);
      }
    }
  }
  // anal fin, under the rear half
  NA = Math.round(80 * q); NB = Math.round(26 * q);
  for (ia = 0; ia < NA; ia++) {
    a = ia / (NA - 1);
    s = 0.62 + 0.25 * a;
    reach = 0.135 * Math.pow(Math.sin(Math.PI * clamp(a * 0.9 + 0.1, 0, 1)), 0.6);
    ox = 0.7 * reach; oy = -reach; ol = Math.hypot(ox, oy) || 1e-9;
    var ry = -halfH(s) * 0.93;
    for (ib = 0; ib < NB; ib++) {
      b = ib / (NB - 1);
      px = s - 0.45 + ox * b; py = ry + oy * b;
      pz = sway(px + 0.45, 0.18 * b) + 0.045 * Math.pow(b, 1.5) * Math.sin(TAU * 1.1 * t - 7 * a + 1.0);
      finPoint(px, py, pz, px + ox / ol * 0.03, py + oy / ol * 0.03, pz, b, 0.72, 0.93);
    }
  }
  // pelvic fins, a pair under the chest
  for (var side = -1; side <= 1; side += 2) {
    NA = Math.round(46 * q); NB = Math.round(26 * q);
    for (ia = 0; ia < NA; ia++) {
      a = ia / (NA - 1);
      s = 0.37 + 0.09 * a;
      reach = 0.17 * (0.55 + 0.45 * Math.pow(Math.sin(Math.PI * a), 0.7));
      ox = 0.55 * reach; oy = -reach; oz = side * 0.25 * reach; ol = Math.hypot(ox, oy, oz) || 1e-9;
      var py0 = -halfH(s) * 0.9;
      for (ib = 0; ib < NB; ib++) {
        b = ib / (NB - 1);
        px = s - 0.45 + ox * b + 0.05 * b * b * Math.sin(TAU * 0.8 * t + 1.5 + side);
        py = py0 + oy * b;
        pz = side * 0.04 + oz * b + sway(s, 0.2 * b) + 0.04 * b * b * Math.sin(TAU * 0.8 * t + side + 2 * a);
        finPoint(px, py, pz, px + ox / ol * 0.03, py + oy / ol * 0.03, pz + oz / ol * 0.03, b, 0.78, 2.0);
      }
    }
  }
  // [tail] a rounded fan; a blade of fixed length that bends with the wave
  NA = Math.round(110 * q); NB = Math.round(46 * q);
  var stepB = 1 / (NB - 1);
  for (ib = 0; ib < NB; ib++) { var ob = ib * stepB; tailVals[ib] = sway(0.98 + 0.31 * ob, 0.12 * ob); }
  for (ib = 0; ib < NB; ib++) {
    var gr;
    if (ib === 0) gr = (tailVals[1] - tailVals[0]) / (0.31 * stepB);
    else if (ib === NB - 1) gr = (tailVals[ib] - tailVals[ib - 1]) / (0.31 * stepB);
    else gr = (tailVals[ib + 1] - tailVals[ib - 1]) / (0.62 * stepB);
    tailTurn[ib] = clamp(Math.atan(gr * (1 + 0.3 * ib * stepB)), -0.95, 0.95);
  }
  tailFar[0] = 0; tailSide[0] = 0;
  for (ib = 1; ib < NB; ib++) { tailFar[ib] = tailFar[ib - 1] + Math.cos(tailTurn[ib]) * stepB; tailSide[ib] = tailSide[ib - 1] + Math.sin(tailTurn[ib]) * stepB; }
  var sw98 = sway(0.98, 0);
  for (ia = 0; ia < NA; ia++) {
    a = -1 + 2 * ia / (NA - 1);
    var phi = 0.95 * a, span = 0.31 * (1 - 0.13 * a * a), cph = Math.cos(phi), sph = Math.sin(phi);
    for (ib = 0; ib < NB; ib++) {
      b = ib * stepB;
      var r = b * span;
      px = TAIL_ROOT + span * cph * tailFar[ib];
      py = 0.075 * a * (1 - b) + r * sph;
      pz = sw98 + span * tailSide[ib] + 0.03 * b * b * Math.sin(TAU * SWIM_HZ * t - 4.2 + 2.5 * Math.abs(a));
      finPoint(px, py, pz, px + cph * 0.03, py + sph * 0.03, pz, b, 0.76, 0.94);
    }
  }
  // [pectorals] beat like oars; sides a third of a stroke apart
  var tucked = Math.min(SW.effort - 0.55, 1.0);
  for (side = -1; side <= 1; side += 2) {
    NA = Math.round(70 * q); NB = Math.round(36 * q);
    var hx = 0.375 - 0.45, hy = -0.07, hz = side * halfW(0.375) * 0.9;
    for (ia = 0; ia < NA; ia++) {
      a = -1 + 2 * ia / (NA - 1);
      var ph2 = 0.8 * a, cp = Math.cos(ph2), sp = Math.sin(ph2);
      for (ib = 0; ib < NB; ib++) {
        b = ib / (NB - 1);
        var beat = TAU * PECT_HZ * t + (side > 0 ? 0.0 : 2.2) - 2.1 * b - 0.5 * Math.abs(a);
        var stroke = Math.sin(beat) + 0.25 * Math.sin(2 * beat + 0.6);
        var open = 0.72 - 0.20 * tucked + 0.55 * SW.brake + (0.48 - 0.14 * tucked) * stroke;
        var co = Math.cos(open), so = Math.sin(open);
        // axis = back*cos(open) + outw*sin(open); ray = axis*cos(phi) + up*sin(phi)
        var rx = 0.72 * co * cp + 0.69 * sp, ry2 = -0.69 * co * cp + 0.72 * sp, rz = side * so * cp;
        var rr = b * 0.21 * (1 - 0.12 * a * a), cup = 0.07 * b * b * Math.cos(beat);
        px = hx + rx * rr; py = hy + ry2 * rr; pz = hz + rz * rr - side * cup;
        finPoint(px, py, pz, px + rx * 0.03, py + ry2 * 0.03, pz + rz * 0.03, b, 0.74, 0.93);
      }
    }
  }
}

function drawRocks() {
  var g = G, R = g.rock, sp = g.rockSpan;
  for (var ri = 0; ri + 5 < sp.length; ri += 5) {
    view(sp[ri + 1], sp[ri + 2], sp[ri + 3]); project(_vx, _vy, _vz);
    var rad = sp[ri + 4] * _sh;
    if (_vz < -CAM_D + 0.5 || _sx + rad < 0 || _sx - rad > g.PW || _sy + rad < 0 || _sy - rad > g.PH) continue;
    drawRockRange(sp[ri], sp[ri + 5]);
  }
}
function drawRockRange(i0, i1) {
  var g = G, R = g.rock;
  for (var i = i0; i < i1; i++) {
    var k = i * 7;
    view(R[k], R[k + 1], R[k + 2]); project(_vx, _vy, _vz);
    var lum = R[k + 6], gi = (lum * 11) | 0;
    plot(_sx, _sy, _vz, ROCK_G[gi > 10 ? 10 : gi], R[k + 3], R[k + 4], R[k + 5], BACK);
  }
}

function outline(t) {
  // where the fish's flank meets water, draw the edge in its own tone; a soft, broken line
  var g = G, W = g.w, H = g.h, o = g.owner, seed = Math.floor(t * 3);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var id = y * W + x;
      if (o[id] !== FISH) continue;
      var up = y === 0 || o[id - W] !== FISH, dn = y === H - 1 || o[id + W] !== FISH;
      var lf = x === 0 || o[id - 1] !== FISH, rt = x === W - 1 || o[id + 1] !== FISH;
      var e = -1;
      if (up) e = C_DASH;
      if (dn) e = 95;
      if (lf) e = 40;
      if (lf && up) e = C_SL;
      if (lf && dn) e = C_BS;
      if (rt && up) e = C_BS;
      if (rt && dn) e = C_SL;
      if (e < 0) continue;
      if ((y > 0 && o[id - W] === FIN) || (y < H - 1 && o[id + W] === FIN) || (x > 0 && o[id - 1] === FIN) || (x < W - 1 && o[id + 1] === FIN)) continue;
      var hsh = Math.sin(id * 12.9898 + seed * 78.233) * 43758.5453;
      if (hsh - Math.floor(hsh) <= 0.12) continue;
      g.chars[id] = e;
      g.r[id] = g.r[id] * 0.78 + 0.1; g.gg[id] = g.gg[id] * 0.78 + 0.1; g.b[id] = g.b[id] * 0.78 + 0.1;
    }
  }
}

var _c0 = [0, 0, 0];
function drawArms() {
  var g = G, A = S.A, x = A.x, line = g.aLine, glow = g.aGlow, W = g.w, H = g.h, cw = g.cw, ch = g.ch;
  var i, j, n, k, c0 = _c0;
  // a smooth (Hermite) curve through the nodes, 34 points per arm, in camera space
  for (i = 0; i < ARMS; i++) {
    var mz = 0;
    for (j = 0; j < 34; j++) {
      var i0 = g.h34i[j], f = g.h34f[j];
      var im = i0 > 0 ? i0 - 1 : 0, i2 = i0 + 2 < NODES ? i0 + 2 : NODES - 1;
      var f2 = f * f, f3 = f2 * f;
      var h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
      var b0 = (i * NODES) * 3, out = (i * 34 + j) * 3;
      for (var c = 0; c < 3; c++) {
        var p0 = x[b0 + i0 * 3 + c], p1 = x[b0 + (i0 + 1) * 3 + c];
        var m0 = (x[b0 + (i0 + 1) * 3 + c] - x[b0 + im * 3 + c]) / 2, m1 = (x[b0 + i2 * 3 + c] - x[b0 + i0 * 3 + c]) / 2;
        c0[c] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
      }
      view(c0[0], c0[1], c0[2]);
      line[out] = _vx; line[out + 1] = _vy; line[out + 2] = _vz;
      mz += _vz;
      glow[i * 34 + j] = A.glow[i * NODES + i0] * (1 - f) + A.glow[i * NODES + i0 + 1] * f;
    }
    g.mz[i] = mz; g.order[i] = i;
  }
  var ord = Array.prototype.slice.call(g.order).sort(function (p, q) { return g.mz[q] - g.mz[p]; });
  var sx = g.fSx, sy = g.fSy, fz = g.fZ, rad = g.fRad, fgl = g.fGlow, best = g.best, bj = g.bj, list = g.list;
  var stampArr = g.stamp, zb = g.zbuf;
  for (var oi = 0; oi < ARMS; oi++) {
    i = ord[oi];
    for (j = 0; j < 90; j++) {
      var lo = g.lo90[j], w = g.w90[j], a0 = (i * 34 + lo) * 3, a1 = a0 + 3;
      var vx = line[a0] * (1 - w) + line[a1] * w, vy = line[a0 + 1] * (1 - w) + line[a1 + 1] * w, vz = line[a0 + 2] * (1 - w) + line[a1 + 2] * w;
      project(vx, vy, vz);
      sx[j] = _sx; sy[j] = _sy; fz[j] = vz; rad[j] = g.thick90[j] * _sh;
      fgl[j] = glow[i * 34 + lo] * (1 - w) + glow[i * 34 + lo + 1] * w;
    }
    g.stampId = (g.stampId + 1) & 0xffff;
    if (g.stampId === 0) { stampArr.fill(0); g.stampId = 1; }
    var sid = g.stampId, nl = 0;
    for (j = 0; j < 90; j++) {
      var R = rad[j];
      if (R <= 0) continue;
      var cA = Math.max(Math.floor((sx[j] - R) / cw), 0), cB = Math.min(Math.floor((sx[j] + R) / cw), W - 1);
      var rA = Math.max(Math.floor((sy[j] - R) / ch), 0), rB = Math.min(Math.floor((sy[j] + R) / ch), H - 1);
      for (var ry = rA; ry <= rB; ry++) {
        var oy = (ry + 0.5) * ch - sy[j];
        for (var cx = cA; cx <= cB; cx++) {
          var ox = (cx + 0.5) * cw - sx[j];
          var d = Math.sqrt(ox * ox + oy * oy) / R;
          if (d >= 1) continue;
          var id = ry * W + cx;
          if (stampArr[id] !== sid) { stampArr[id] = sid; best[id] = d; bj[id] = j; g.box[id] = ox; g.boy[id] = oy; list[nl++] = id; }
          else if (d < best[id]) { best[id] = d; bj[id] = j; g.box[id] = ox; g.boy[id] = oy; }
        }
      }
    }
    var depth = A.depth[i];
    for (var li = 0; li < nl; li++) {
      id = list[li];
      j = bj[id];
      var z = fz[j];
      if (!(z < zb[id])) continue;
      d = best[id];
      var u = g.u90[j], tip = ease((u - 0.30) / 0.62);
      var tr = (STEM[0] * (1 - tip) + TIP[0] * tip) * depth, tg = (STEM[1] * (1 - tip) + TIP[1] * tip) * depth, tb = (STEM[2] * (1 - tip) + TIP[2] * tip) * depth;
      ox = g.box[id]; oy = g.boy[id];
      var lit = clamp(0.5 - 0.5 * (ox * 0.8 + oy * 0.6) / Math.max(rad[j], g.k), 0, 1);
      var rim = d > 0.70;
      var shine = fgl[j] * (0.55 + 0.45 * depth) * (0.25 + 0.75 * tip);
      var code, m, gk;
      if (rim) {
        code = lineGlyph(-oy, ox);
        m = (0.50 + 0.38 * lit + 0.22 * tip) * (Math.sin(j * 0.9 + i * 2.1) > -0.86 ? 1.0 : 0.45);
        gk = 0.62;
      } else {
        var value = 0.14 + 0.24 * lit + 0.42 * tip * tip + 0.25 * shine;
        var fi = (value * 1.25 * 10) | 0;
        code = FILL_G[fi < 0 ? 0 : fi > 9 ? 9 : fi];
        m = 0.16 + 0.26 * lit + 0.5 * tip * tip;
        gk = 0.34;
      }
      g.chars[id] = code;
      g.r[id] = Math.min(tr * m + GLOW_INK[0] * shine * gk, 1);
      g.gg[id] = Math.min(tg * m + GLOW_INK[1] * shine * gk, 1);
      g.b[id] = Math.min(tb * m + GLOW_INK[2] * shine * gk, 1);
      g.owner[id] = 3;
      zb[id] = z;
    }
  }
}

function water(t, slideX, slideY) {
  var g = G, W = g.w, H = g.h, D = DATA.DOT, M = DATA.MOTE, i;
  for (i = 0; i < D.length / 3; i++) {
    var d0 = D[i * 3], d1 = D[i * 3 + 1], d2 = D[i * 3 + 2];
    var r = Math.floor(mod(d1 * H + 0.18 * t * (0.5 + d2) + slideY * 0.3, H));
    var c = Math.floor(mod(d0 * W + 0.25 * Math.sin(0.4 * t + d2 * 9) - slideX * 0.3, W));
    var id = r * W + c, f = 0.5 + 0.5 * d2;
    g.chars[id] = 46; g.r[id] = 64 / 255 * f; g.gg[id] = 84 / 255 * f; g.b[id] = 112 / 255 * f;
  }
  for (i = 0; i < M.length / 4; i++) {
    var m0 = M[i * 4], m1 = M[i * 4 + 1], m2 = M[i * 4 + 2], m3 = M[i * 4 + 3];
    r = Math.floor(mod(m1 * H - 0.3 * t * (0.4 + m2) + slideY * 0.55, H));
    c = Math.floor(mod(m0 * W + 0.8 * Math.sin(0.5 * t + m3 * 20) - slideX * 0.55, W));
    var tw = Math.sin(t * (1.0 + 2.0 * m2) + m3 * 40);
    id = r * W + c; f = 0.5 + 0.5 * clamp(tw + 0.4, 0, 1);
    g.chars[id] = tw > 0.7 ? 42 : 43; g.r[id] = 70 / 255 * f; g.gg[id] = 118 / 255 * f; g.b[id] = 160 / 255 * f;
  }
}

function hash01(a, b) { var v = Math.abs(Math.sin(a * 127.1 + b * 311.7) * 43758.5453); return v - Math.floor(v); }

function sand(t, camX) {
  var g = G, W = g.w, H = g.h;
  var span = Math.ceil(34 * Math.max(1, g.PW / g.k / 1080));
  var ox = Math.trunc(camX / 0.13);
  for (var ix = -span + ox; ix <= span + ox; ix++) {
    for (var iz = -12; iz < 42; iz++) {
      var h = hash01(ix, iz);
      var x = ix * 0.13 + 0.09 * hash01(iz, ix), z = iz * 0.13 + 0.09 * h;
      var ripple = Math.sin(x * 4.2 + 1.6 * Math.sin(z * 2.1)) > 0.72;
      if (!(h > 0.52 || (ripple && hash01(ix + 7, iz) > 0.35))) continue;
      var y = FLOOR + 0.03 * Math.sin(x * 1.7 + z);
      view(x, y, z); project(_vx, _vy, _vz);
      var c = Math.floor(_sx / g.cw), r = Math.floor(_sy / g.ch);
      if (c < 0 || c >= W || r < 0 || r >= H) continue;
      var fade = clamp(1.0 - (z + 1.5) / 6.5, 0.15, 1.0);
      var net = Math.sin(x * 5.0 + 1.3 * Math.sin(z * 3.0 + W3 * t)) * Math.sin(z * 4.0 - W2 * t + x);
      var nn = net > 0 ? net : 0;
      fade *= 1 + 1.1 * nn * nn;
      var id = r * W + c, f = (ripple ? 0.56 : 0.36) * fade;
      g.chars[id] = ripple ? 126 : 46;
      g.r[id] = Math.min(SAND[0] * f, 1); g.gg[id] = Math.min(SAND[1] * f, 1); g.b[id] = Math.min(SAND[2] * f, 1);
    }
  }
}

function strokeLine(x0, y0, x1, y1, col) {
  var g = G, n = Math.floor(Math.max(Math.abs(x1 - x0) / g.cw, Math.abs(y1 - y0) / g.ch) * 1.6) + 2;
  var code = lineGlyph(x1 - x0, y1 - y0);
  for (var i = 0; i < n; i++) {
    var f = i / (n - 1);
    var c = Math.floor((x0 + (x1 - x0) * f) / g.cw), r = Math.floor((y0 + (y1 - y0) * f) / g.ch);
    if (c < 0 || c >= g.w || r < 0 || r >= g.h) continue;
    var id = r * g.w + c;
    g.chars[id] = code; g.r[id] = col[0]; g.gg[id] = col[1]; g.b[id] = col[2]; g.owner[id] = BACK;
  }
}

function corals(t) {
  var g = G, col = [0, 0, 0];
  for (var ci = 0; ci < CORALS.length; ci++) {
    var C = CORALS[ci];
    view(C[0], C[1], C[2]); project(_vx, _vy, _vz);
    if (!(_sx > -300 * g.k && _sx < g.PW + 300 * g.k)) continue;
    var bx = _sx, by = _sy, size = C[3] * _sh, seed = C[5];
    var tone = clamp(0.75 - 0.12 * C[2], 0.3, 0.7);
    var swayK = 0.06 * Math.sin(W1 * t + 0.7 * seed);
    var D = DATA.CORALS[seed], tw = D.tw, bu = D.bu;
    for (var i = 0; i < tw.length; i += 5) {
      var x0 = tw[i], y0 = tw[i + 1], x1 = tw[i + 2], y1 = tw[i + 3], lv = tw[i + 4];
      var m = tone * (0.55 + 0.1 * (5 - lv));
      col[0] = C[4][0] * m; col[1] = C[4][1] * m; col[2] = C[4][2] * m;
      strokeLine(bx + size * (x0 + swayK * Math.pow(Math.max(y0, 0), 1.5)), by - size * y0,
        bx + size * (x1 + swayK * Math.pow(Math.max(y1, 0), 1.5)), by - size * y1, col);
    }
    for (i = 0; i < bu.length; i += 3) {
      var c = Math.floor((bx + size * (bu[i] + swayK * Math.pow(Math.max(bu[i + 1], 0), 1.5))) / g.cw);
      var r = Math.floor((by - size * bu[i + 1]) / g.ch);
      if (c < 0 || c >= g.w || r < 0 || r >= g.h) continue;
      var id = r * g.w + c;
      g.chars[id] = bu[i + 2] ? 111 : 42;
      g.r[id] = Math.min(C[4][0] * tone * 1.5, 1); g.gg[id] = Math.min(C[4][1] * tone * 1.5, 1); g.b[id] = Math.min(C[4][2] * tone * 1.5, 1);
      g.owner[id] = BACK;
    }
  }
}

function drawMotes(t) {
  // plankton: a dim speck that becomes a + and then a * as it lights up
  var g = G, A = S.A, M = DATA.MOTES, W = g.w, H = g.h, ml = g.mlit, zb = g.zbuf;
  ml.fill(-1);
  var hot = drawMotes.hot || (drawMotes.hot = []);
  hot.length = 0;
  function put(x, y, z, lit) {
    view(x, y, z); project(_vx, _vy, _vz);
    var c = Math.floor(_sx / g.cw), r = Math.floor(_sy / g.ch);
    if (c < 0 || c >= W || r < 0 || r >= H) return;
    var id = r * W + c;
    if (zb[id] < 99 || lit <= ml[id]) return;
    ml[id] = lit;
    g.chars[id] = lit > 0.55 ? 42 : lit > 0.18 ? 43 : 46;
    var hw = 0.5 * clamp(lit - 0.5, 0, 1), f = 0.16 + 0.84 * lit;
    g.r[id] = Math.min(MOTE_INK[0] * f + hw, 1); g.gg[id] = Math.min(MOTE_INK[1] * f + hw, 1); g.b[id] = Math.min(MOTE_INK[2] * f + hw, 1);
    if (lit > 0.6) hot.push(id);
  }
  var w2 = W2 * t;
  for (var i = 0; i < A.nm; i++) {
    var k = i * 3;
    put(M[k] + A.moff[k] + 0.03 * Math.sin(w2 + M[k + 2] * 9.0),
      M[k + 1] + A.moff[k + 1] + 0.03 * Math.sin(w2 + M[k + 1] * 9.0),
      M[k + 2] + A.moff[k + 2] + 0.03 * Math.sin(w2 + M[k] * 9.0), A.lit[i]);
  }
  var na = 0;
  for (i = 0; i < WAKE; i++) {
    var age = (S.t - A.born[i]) / WAKE_LIFE;
    if (age < 0 || age >= 1) continue;
    put(A.wake[i * 3], A.wake[i * 3 + 1], A.wake[i * 3 + 2], Math.pow(1 - age, 1.4) * (0.75 + 0.25 * Math.sin(40 * age + na)));
    na++;
  }
  // the brightest throw a short ray to each side
  for (i = 0; i < hot.length; i++) {
    var id = hot[i], lit = ml[id], cc = id % W;
    for (var dc = -1; dc <= 1; dc += 2) {
      if (cc + dc < 0 || cc + dc >= W) continue;
      var j = id + dc;
      if (g.chars[j] !== 0) continue;
      g.chars[j] = C_DASH;
      g.r[j] = MOTE_INK[0] * 0.5 * lit; g.gg[j] = MOTE_INK[1] * 0.5 * lit; g.b[j] = MOTE_INK[2] * 0.5 * lit;
    }
  }
}

function shafts(t, camx) {
  // slanted beams of sunlight stand in the water and sway; whatever is inside one is brighter
  var g = G, W = g.w, H = g.h, cw = g.cw, ch = g.ch, lit = g.shaft;
  lit.fill(0);
  for (var k = 0; k < BEAMS.length; k++) {
    var foot = g.PW / 2 + 0.85 * P.scale * (BEAMS[k] + 0.22 * Math.sin(W1 * t + 1.7 * k) - camx);
    var wide = (60 + 22 * Math.sin(W2 * t + 2.3 * k)) * g.k;
    var amp = 0.65 + 0.35 * Math.sin(W3 * t + 1.1 * k);
    for (var r = 0; r < H; r++) {
      var cy = (r + 0.5) * ch, lean = foot - 0.30 * (cy - P.mid);
      var cA = Math.max(Math.floor((lean - 3 * wide) / cw), 0), cB = Math.min(Math.ceil((lean + 3 * wide) / cw), W - 1);
      for (var c = cA; c <= cB; c++) {
        var q = ((c + 0.5) * cw - lean) / wide;
        lit[r * W + c] += amp * Math.exp(-q * q);
      }
    }
  }
  for (r = 0; r < H; r++) {
    var dim = clamp(1.15 - 0.55 * (r + 0.5) / H, 0.3, 1);
    for (c = 0; c < W; c++) {
      var id = r * W + c, L = lit[id] * dim;
      if (g.chars[id] === 0) {
        if (L > 0.30 && (r * 2 + c) % 5 === 0) {
          g.chars[id] = C_SL; g.r[id] = 46 / 255 * L; g.gg[id] = 84 / 255 * L; g.b[id] = 108 / 255 * L;
        }
        continue;
      }
      var m = 1 + 0.42 * L;
      g.r[id] = Math.min(g.r[id] * m, 1); g.gg[id] = Math.min(g.gg[id] * m, 1); g.b[id] = Math.min(g.b[id] * m, 1);
    }
  }
}

var BODY8 = [[-1, 0, 56, 1.0], [1, 0, 56, 1.0], [-2, 0, -1, 0.7], [2, 0, -2, 0.7], [0, -1, 111, 0.8], [0, 1, 111, 0.6]];
var RAYS8 = [[-1, -1, C_BS, 1.0], [1, -1, C_SL, 1.0], [-1, 1, C_SL, 1.0], [1, 1, C_BS, 1.0], [0, -2, C_PIPE, 0.9], [0, 2, C_PIPE, 0.9], [-3, 0, C_DASH, 0.9], [3, 0, C_DASH, 0.9]];
function putCell(c, r, vz, code, k) {
  var g = G;
  if (c < 0 || c >= g.w || r < 0 || r >= g.h) return;
  var id = r * g.w + c;
  if (!(g.zbuf[id] > vz - 0.05)) return;
  g.chars[id] = code;
  g.r[id] = clamp(PREY_INK[0] * k[0] + k[1], 0, 1); g.gg[id] = clamp(PREY_INK[1] * k[0] + k[1], 0, 1); g.b[id] = clamp(PREY_INK[2] * k[0] + k[1], 0, 1);
}
var _kk = [0, 0];
function drawMorsel(pos, age, t, glint) {
  // the morsel: one bright warm letter with a whisker that flicks
  var g = G;
  view(pos[0], pos[1], pos[2]); project(_vx, _vy, _vz);
  var c = Math.floor(_sx / g.cw), r = Math.floor(_sy / g.ch), vz = _vz;
  var tone = clamp(age / 0.8, 0, 1) * (0.85 + 0.15 * Math.sin(9.0 * t));
  _kk[0] = 1.3 * tone; _kk[1] = 0; putCell(c, r, vz, 64, _kk);
  var flick = Math.floor(t * 5) % 2;
  for (var i = 0; i < BODY8.length; i++) {
    var B = BODY8[i], code = B[2] === -1 ? (flick ? 45 : 126) : B[2] === -2 ? (flick ? 126 : 45) : B[2];
    _kk[0] = B[3] * tone * (1 + glint); _kk[1] = 0.5 * glint;
    putCell(c + B[0], r + B[1], vz, code, _kk);
  }
  if (glint > 0) {
    for (i = 0; i < RAYS8.length; i++) {
      var Rr = RAYS8[i];
      _kk[0] = Rr[3] * glint; _kk[1] = 0.5 * glint;
      putCell(c + Rr[0], r + Rr[1], vz, Rr[2], _kk);
    }
  }
}
function drawPrey(t) {
  var hunted = S.foods.length ? S.foods[0].id : S.k === PREY_MARK && S.food >= 0 ? 0 : -1;
  var seen = S.t - S.spot, glint = seen >= 0 ? clamp(1 - seen / 0.6, 0, 1) : 0;
  if (S.food >= 0) drawMorsel(morsel(PREY_FROM, S.food, _m), S.food, t, hunted === 0 ? glint : 0);
  for (var i = 0; i < S.foods.length; i++) {
    var f = S.foods[i];
    var fade = f.age > 36 ? clamp((40 - f.age) / 4, 0, 1) : 1;
    drawMorsel(morsel(f.from, f.age, _m), Math.min(f.age + 0.4, 0.8) * fade, t, hunted === f.id ? glint : 0);
  }
  // when it is eaten, a few crumbs scatter and go out
  for (i = S.bites.length - 1; i >= 0; i--) {
    var B = S.bites[i], since = S.t - B.t0;
    if (since >= 0.7) { S.bites.splice(i, 1); continue; }
    for (var k = 0; k < 6; k++) {
      var wx = Math.cos(2.4 * k), wy = Math.sin(2.4 * k) - 0.3, wz = 0.4 * Math.sin(1.3 * k), sc = 0.16 * Math.pow(since, 0.6);
      view(B.at[0] + wx * sc, B.at[1] + wy * sc, B.at[2] + wz * sc); project(_vx, _vy, _vz);
      _kk[0] = 0.9 * (1 - since / 0.7); _kk[1] = 0;
      putCell(Math.floor(_sx / G.cw), Math.floor(_sy / G.ch), _vz, 46, _kk);
    }
  }
}

// ---- input -------------------------------------------------------------------------
function onWheel(e) {
  if (state.currentMode !== MODE) return;
  e.preventDefault();
  userZoom = clamp(userZoom * Math.exp(-e.deltaY * 0.0012), 0.55, 2.4);
  zoomIdle = 0;
}
function onTouchStart(e) {
  if (state.currentMode !== MODE || e.touches.length < 2) return;
  pinch0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  pinchZ0 = userZoom; pinchUntil = state.time + 0.5;
}
function onTouchMove(e) {
  if (state.currentMode !== MODE || e.touches.length < 2 || pinch0 <= 0) return;
  var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  userZoom = clamp(pinchZ0 * d / pinch0, 0.55, 2.4);
  zoomIdle = 0; pinchUntil = state.time + 0.5;
}
function onTouchEnd(e) {
  if (e.touches.length < 2) { if (pinch0 > 0) pinchUntil = state.time + 0.5; pinch0 = 0; }
}
function listen(on) {
  var cv = state.canvas;
  if (!cv || on === listening) return;
  var f = on ? 'addEventListener' : 'removeEventListener';
  cv[f]('wheel', onWheel, on ? { passive: false } : undefined);
  cv[f]('touchstart', onTouchStart, on ? { passive: true } : undefined);
  cv[f]('touchmove', onTouchMove, on ? { passive: true } : undefined);
  cv[f]('touchend', onTouchEnd);
  listening = on;
}

function dropFood(gx, gy) {
  // the tap, back through the camera, at the depth of the fish
  if (!P.ok || S.foods.length >= 4) return;
  view(S.place[0], S.place[1], S.place[2]);
  var vz = clamp(_vz, -1.4, 0.9);
  var sh = P.scale * CAM_D / (CAM_D + vz);
  var vx = P.cenX + (gx - P.x0) / sh, vy = P.cenY - (gy - P.mid) / sh;
  unview(vx - PIVOT[0], vy - PIVOT[1], vz - PIVOT[2]);
  var wx = clamp(_wx + PIVOT[0], -3.2, 3.4), wy = clamp(_wy + PIVOT[1], FLOOR + 0.12, 1.4), wz = clamp(_wz + PIVOT[2], -1.8, 1.3);
  // it sinks until it lies on the sand, or on the anemone's mound
  var mx = (wx - LAYOUT_WEED[0]) / MOUND[0], mz = (wz - LAYOUT_WEED[2]) / MOUND[2], m2 = mx * mx + mz * mz;
  var floorY = m2 < 1 ? LAYOUT_WEED[1] + MOUND[1] * Math.sqrt(1 - m2) + 0.05 : FLOOR + 0.08;
  if (wy < floorY) wy = floorY;
  S.foods.push({ id: S.nextId++, from: [wx, wy, wz, floorY], age: 0 });
}

// ---- mode lifecycle ----------------------------------------------------------------
var FONT_K = 0.62, WEIGHT = 0.1, GAIN = 1.35;
function initClownfish() {
  state.GLYPH_WEIGHT = WEIGHT;
  if (state.FONT_SCALE !== FONT_K) { state.FONT_SCALE = FONT_K; resize(); }
  G = buildTables();
  if (!S) { S = newSim(); warm(); }
  S.lastT = state.time;
  P.ok = false;
  listen(true);
  // test hook: what the fish is doing (screenshot harness)
  window.__clownfish = function () {
    var fs = S ? S.foods.map(function (f) { var m = morsel(f.from, f.age, [0, 0, 0]); view(m[0], m[1], m[2]); project(_vx, _vy, _vz); return { w: m.map(function (v) { return +v.toFixed(2); }), sx: Math.round(_sx), sy: Math.round(_sy + state.NAV_H), age: +f.age.toFixed(2) }; }) : [];
    var gs = 0; if (S) for (var q = 0; q < S.A.glow.length; q++) gs += S.A.glow[q];
    return S && { t: S.t, k: S.k, foods: fs, glow: +gs.toFixed(2), finger: !!S.finger, eaten: S.eaten, place: S.place.slice(), speed: S.speed, zoom: S.zoomA * S.wideF * userZoom, cols: G && G.w, rows: G && G.h };
  };
}
function cleanupClownfish() {
  state.GLYPH_WEIGHT = 0;
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  listen(false);
  G = null; S = null; userZoom = 1; P.ok = false;
}

function text(s, x, y, r, gg, b, a) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c !== 32 && x + i >= 0 && x + i < G.w) drawChar(s[i], x + i, y, r, gg, b, a);
  }
}

var FINGER = { x: 0, y: 0, r: 0 };
var CH = [];
for (var ci = 0; ci < 128; ci++) CH[ci] = String.fromCharCode(ci);

function renderClownfish() {
  clearCanvas();
  if (!G || !S || G.w !== state.COLS || G.h !== state.ROWS || G.cw !== state.CHAR_W) initClownfish();
  var g = G, W = g.w, H = g.h, n = W * H, i;

  // input
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    if (state.time > pinchUntil) dropFood(pointer.x, pointer.y - state.NAV_H);
  } else if (pointer.down && state.currentMode === MODE && pinch0 <= 0 && state.time > pinchUntil) {
    S.finger = FINGER; FINGER.x = pointer.x; FINGER.y = pointer.y - state.NAV_H; FINGER.r = 0.16 * P.scale;
  }
  if (!pointer.down) S.finger = null;

  // fixed 60 Hz clock for the swimmer and the anemone
  var now = state.time;
  if (now < S.lastT) S.lastT = now;
  var dt = Math.min(now - S.lastT, 0.1); S.lastT = now;
  S.acc += dt;
  var steps = 0;
  while (S.acc >= STEP && steps < 4) { simStep(); S.acc -= STEP; steps++; }
  if (S.acc > STEP) S.acc = 0;
  zoomIdle += dt;
  if (zoomIdle > 8) userZoom += (1 - userZoom) * Math.min(dt * 0.25, 1);
  var t = S.t;

  // [camera] it keeps the fish near the middle, a moment late, leaves room ahead of the nose,
  // and leans in when the fish slows down; [orbit] it swings round the anemone and leans
  var camX = S.camX, camY = 0.62 * S.camY - 0.10, lead = 0.11 * S.lead;
  var zoom = S.zoomA * S.wideF * userZoom;
  var swing = ORBIT * (camX - PIVOT[0]), tilt = -TILT * (camY - 0.15);
  P.cs = Math.cos(swing); P.ss = Math.sin(swing); P.ct = Math.cos(tilt); P.st = Math.sin(tilt);
  view(camX + lead, camY, S.camZ);
  P.cenX = _vx; P.cenY = _vy;
  view(camX, camY, S.camZ);
  var nearZ = _vz;
  P.scale = g.base * zoom * Math.pow((CAM_D + nearZ) / CAM_D, 0.85);
  P.x0 = g.PW / 2; P.mid = g.mid;
  P.ok = true;

  g.chars.fill(0); g.owner.fill(0); g.zbuf.fill(99);
  water(t, camX * P.scale / g.cw, camY * P.scale / g.ch);
  sand(t, camX);
  corals(t);
  drawRocks();
  drawFish(t);
  outline(t);
  drawArms();
  drawMotes(t);
  shafts(t, camX + lead + 1.6 * swing);
  drawPrey(t);

  // paint
  var chars = 0, ccs = g.chars;
  for (i = 0; i < n; i++) {
    var c = ccs[i];
    if (!c) continue;
    chars++;
    // the reel's paint() adds a near and a far bloom on top of the letters; textflow's bloom is
    // lighter, so lift every colour by up to GAIN without letting its hue clip
    var rr = g.r[i], gq = g.gg[i], bq = g.b[i], mx = rr > gq ? (rr > bq ? rr : bq) : (gq > bq ? gq : bq);
    var gain = mx * GAIN > 1 ? 1 / mx : GAIN;
    drawChar(CH[c], i % W, (i / W) | 0, (rr * gain * 255) | 0, (gq * gain * 255) | 0, (bq * gain * 255) | 0, 1);
  }
  // HUD: the reel's note line
  var note = 'tail ' + S.hz.toFixed(1) + ' Hz   speed ' + S.speed.toFixed(2) + '   chars ' + chars;
  text(note, 2, 1, 120, 132, 150, 0.9);
  var hint = state.isMobile ? 'tap: feed   drag: part the arms   pinch: zoom' : 'click: feed   drag: part the arms   scroll: zoom';
  if (W >= note.length + hint.length + 8) text(hint, W - hint.length - 2, 1, 120, 132, 150, 0.9);
  else text(hint, 2, 2, 100, 112, 130, 0.85);
}

registerMode(MODE, { init: initClownfish, render: renderClownfish, cleanup: cleanupClownfish });
