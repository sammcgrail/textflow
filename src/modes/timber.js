import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// timber: a lumberjack fells a big tree in a forest clearing at golden hour.
// Everything is procedural 3D drawn to the character grid with a z-buffer: the man is an
// articulated figure of capsules (buffalo-check shirt, jeans, blaze-orange beanie, beard)
// with a real swing cycle (wind-up over the right shoulder, strike, the axe sticks and
// recoils, pull-out); the tree is a bark-textured point cloud whose felling notch deepens
// with each hit; its branches are spring chains carrying leaf clumps that shudder on every
// strike and lag behind as it falls. Grass blades bend on springs, chips fly and settle,
// leaves drift, dust motes glint in god rays from a low sun behind the canopy, and a
// camera orbits low, pushes in on each impact and dollies round as the tree goes down.
// Tap / click: he swings (the tree falls after enough hits). Drag: orbit the camera and
// blow wind through the canopy. Tap the fallen trunk or stump: a new tree grows.
// Wheel / pinch: zoom. Left alone it chops by itself.

var MODE = 'timber';
var TAU = Math.PI * 2;
var RAMP = '$QB%8&0#@oauenjzt[]{}<>rcvx+=1il!;:,';
var C_PIPE = 124, C_DASH = 45, C_SL = 47, C_BS = 92;

function codes(s) {
  var a = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) === 32 ? 0 : s.charCodeAt(i);
  return a;
}
var RAMP_C = codes(RAMP);
var GROUND_G = codes(".,`'.,;.");
var LITTER_G = codes("~,'v");
var CHIP_G = codes("'`,.=-~");
var LEAF_G = codes("~-/\\*,");
var DUST_G = codes("@0Oo:.");
var CANOPY_G = codes("%&8@*o");

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return (3 - 2 * x) * x * x; }
function mix(a, b, f) { return a + (b - a) * f; }
function hash01(a, b) { var v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }
function rng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var LUM_LUT = new Uint8Array(1025);
for (var li0 = 0; li0 <= 1024; li0++) {
  var lq = (Math.pow(1 - li0 / 1024, 1.2) * 35) | 0;
  LUM_LUT[li0] = RAMP_C[lq < 0 ? 0 : lq > 35 ? 35 : lq];
}

// ---- light: a low sun behind the canopy, to the left ---------------------------------
var LX = -0.60, LY = 0.50, LZ = 0.62;
(function () { var l = Math.hypot(LX, LY, LZ); LX /= l; LY /= l; LZ /= l; })();
var LXZ2 = LX * LX + LZ * LZ;
var SUN = [1.0, 0.72, 0.40], AMB = [0.62, 0.62, 0.86], RIMC = [1.0, 0.80, 0.46];

// ---- the tree ------------------------------------------------------------------------
var TH = 5.3, HC = 0.78, HW = 0.21, NHITS = 7;
var AX = -0.8, AZ = 0.6, BX = 0.6, BZ = 0.8;     // a: the notch side (toward the man); b: across
function rad(y) { return 0.36 * (1 - 0.55 * y / TH) + 0.17 * Math.exp(-y / 0.22); }
var RC = rad(HC), HA = -RC * 0.92;                 // the hinge: the uncut wood on the far side
var NPX = AX * RC, NPY = HC, NPZ = AZ * RC;        // where the axe bites
var ALAND = 1.47;
var NBR = 11, NN = 6;
var CANOPY_Y = 4.2;
var BARK = [0.44, 0.26, 0.15], BARK_D = [0.16, 0.09, 0.06], WOOD = [1.0, 0.84, 0.56];
var LEAFC = [[0.13, 0.42, 0.12], [0.36, 0.66, 0.14], [0.95, 0.70, 0.12], [0.92, 0.38, 0.10]];

// ---- the man -------------------------------------------------------------------------
var MX = -1.43, MZ = 0.20, FWX = 1, FWZ = 0, RTX = 0, RTZ = 1;
var LH = 0.82;
var SHIRT = [0.92, 0.08, 0.10], SHIRT_M = [0.48, 0.04, 0.07], SHIRT_D = [0.10, 0.02, 0.05];
var JEANS = [0.16, 0.34, 0.86], SKIN = [0.98, 0.64, 0.42], BEARD = [0.60, 0.24, 0.07];
var HAT = [1.0, 0.46, 0.0], HAT_D = [0.80, 0.30, 0.0], BOOT = [0.42, 0.22, 0.09], GLOVE = [0.85, 0.58, 0.26];
var HAIR = [0.40, 0.16, 0.06], BELT = [0.22, 0.12, 0.05], HANDLE = [0.95, 0.74, 0.42], AXEH = [0.90, 0.12, 0.09], BIT = [0.92, 0.96, 1.0];
var M_SHIRT = 1, M_JEANS = 2, M_SKIN = 3, M_BOOT = 4, M_GLOVE = 5, M_ARM = 6, M_TORSO = 7;

// owners
var O_BG = 1, O_GROUND = 2, O_GRASS = 3, O_TREE = 4, O_LEAF = 5, O_MAN = 6, O_AXE = 7, O_FX = 8;

var G = null, S = null;
var userZoom = 1, pinch0 = 0, pinchZ0 = 1, pinchUntil = 0, listening = false;

// ---- camera -------------------------------------------------------------------------
var CX = 0, CY = 1, CZ = 6, FX = 0, FY = 0, FZ = -1, RX = 1, RY = 0, RZ = 0, UX = 0, UY = 1, UZ = 0;
var FPX = 600, OX = 0, OY = 0;
var _sx = 0, _sy = 0, _vz = 0, _sh = 0, _ok = false;
function project(x, y, z) {
  var dx = x - CX, dy = y - CY, dz = z - CZ;
  var vz = dx * FX + dy * FY + dz * FZ;
  if (vz < 0.15) { _ok = false; return; }
  _ok = true;
  var s = FPX / vz;
  _sx = OX + (dx * RX + dy * RY + dz * RZ) * s;
  _sy = OY - (dx * UX + dy * UY + dz * UZ) * s;
  _vz = vz; _sh = s;
}
function setCamera(tx, ty, tz, yaw, pitch, d) {
  var cp = Math.cos(pitch);
  CX = tx + d * Math.sin(yaw) * cp; CY = ty + d * Math.sin(pitch); CZ = tz + d * Math.cos(yaw) * cp;
  if (CY < 0.22) CY = 0.22;
  FX = tx - CX; FY = ty - CY; FZ = tz - CZ;
  var l = Math.hypot(FX, FY, FZ); FX /= l; FY /= l; FZ /= l;
  RX = -FZ; RY = 0; RZ = FX;                         // cross(f, up)
  l = Math.hypot(RX, RZ) || 1; RX /= l; RZ /= l;
  UX = RY * FZ - RZ * FY; UY = RZ * FX - RX * FZ; UZ = RX * FY - RY * FX;
}

function lineGlyph(dx, dy) {
  dx /= G.cw; dy /= G.ch;
  var ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay > 2.0 * ax) return C_PIPE;
  if (ax > 2.0 * ay) return C_DASH;
  return dx * dy < 0 ? C_SL : C_BS;
}
function plot(sx, sy, vz, code, r, gg, b, own) {
  var g = G, c = Math.floor(sx / g.cw), rr = Math.floor(sy / g.ch);
  if (c < 0 || c >= g.w || rr < 0 || rr >= g.h) return;
  var id = rr * g.w + c;
  if (vz < g.zbuf[id]) {
    g.chars[id] = code; g.r[id] = r; g.gg[id] = gg; g.b[id] = b; g.owner[id] = own; g.zbuf[id] = vz;
  }
}

// ---- tables (rebuilt on resize) -------------------------------------------------------
function buildTables() {
  var W = state.COLS, H = state.ROWS, n = W * H;
  var mob = state.isMobile || n < 14000;
  var g = {
    w: W, h: H, cw: state.CHAR_W, ch: state.CHAR_H, mob: mob,
    chars: new Uint8Array(n), r: new Float32Array(n), gg: new Float32Array(n), b: new Float32Array(n),
    owner: new Uint8Array(n), zbuf: new Float32Array(n), shaft: new Float32Array(n),
  };
  g.PW = W * g.cw; g.PH = H * g.ch;
  var R = rng(3), i, j, k;
  // trunk: a tapering, flared cylinder, staggered rings, bark furrows
  var NA = mob ? 84 : 104, NY = mob ? 170 : 210, nt = NA * NY;
  g.nt = nt;
  g.tX = new Float32Array(nt); g.tY = new Float32Array(nt); g.tZ = new Float32Array(nt);
  g.tNX = new Float32Array(nt); g.tNY = new Float32Array(nt); g.tNZ = new Float32Array(nt);
  g.tPA = new Float32Array(nt); g.tBark = new Float32Array(nt); g.tH = new Float32Array(nt);
  for (i = 0; i < NY; i++) {
    var y = TH * Math.pow(i / (NY - 1), 1.08);
    var rr = rad(y), dr = (rad(y + 0.01) - rr) / 0.01;
    for (j = 0; j < NA; j++) {
      k = i * NA + j;
      var th = (j + (i & 1) * 0.5) / NA * TAU;
      var ca = Math.cos(th), sb = Math.sin(th);
      var furrow = 0.5 + 0.5 * Math.sin(th * 13 + 2.4 * Math.sin(y * 1.9 + th * 3.0) + 0.6 * Math.sin(y * 7.0));
      var bump = 1 + 0.035 * (furrow - 0.5);
      var pa = ca * rr * bump, pb = sb * rr * bump;
      g.tX[k] = pa * AX + pb * BX; g.tZ[k] = pa * AZ + pb * BZ; g.tY[k] = y; g.tPA[k] = pa;
      var na = ca, nb = sb, ny = -dr, nl = Math.hypot(na, nb, ny);
      na /= nl; nb /= nl; ny /= nl;
      g.tNX[k] = na * AX + nb * BX; g.tNZ[k] = na * AZ + nb * BZ; g.tNY[k] = ny;
      g.tBark[k] = furrow; g.tH[k] = hash01(i * 0.731, j * 1.37);
    }
  }
  // the notch faces and the cut faces: a polar sample of the cross-section at HC
  var NR = mob ? 14 : 18, NQ = mob ? 44 : 60, nd = NR * NQ;
  g.nd = nd; g.dPA = new Float32Array(nd); g.dPB = new Float32Array(nd); g.dH = new Float32Array(nd);
  for (i = 0; i < NR; i++) {
    var rho = Math.sqrt((i + 0.5) / NR) * RC;
    for (j = 0; j < NQ; j++) {
      k = i * NQ + j;
      var ph = (j + (i & 1) * 0.5) / NQ * TAU;
      g.dPA[k] = Math.cos(ph) * rho; g.dPB[k] = Math.sin(ph) * rho; g.dH[k] = hash01(i * 3.1, j * 0.77);
    }
  }
  // capsule tables: limbs and torso (t, cos, sin, ring index around)
  g.cylS = cylTable(12, 16); g.cylL = cylTable(20, 30);
  g.sph = fib(70); g.head = fib(mob ? 260 : 340);
  // background forest: a ring of trunks round the clearing
  var NBG = 22;
  g.nbg = NBG; g.bgX = new Float32Array(NBG); g.bgZ = new Float32Array(NBG); g.bgR = new Float32Array(NBG);
  g.bgT = new Float32Array(NBG); g.bgOrd = new Int32Array(NBG); g.bgD = new Float32Array(NBG);
  for (i = 0; i < NBG; i++) {
    var an = i / NBG * TAU + R() * 0.15, dist = 8.5 + R() * 9;
    g.bgX[i] = Math.cos(an) * dist + 1; g.bgZ[i] = Math.sin(an) * dist; g.bgR[i] = 0.22 + R() * 0.32; g.bgT[i] = R();
  }
  // grass
  var NG = mob ? 260 : 440;
  g.ng = NG; g.gX = new Float32Array(NG); g.gZ = new Float32Array(NG); g.gHt = new Float32Array(NG); g.gPh = new Float32Array(NG);
  for (i = 0; i < NG; i++) {
    var gx, gz, ok = false;
    for (var tries = 0; tries < 20 && !ok; tries++) {
      var ra = 0.45 + Math.pow(R(), 0.8) * 5.2, aa = R() * TAU;
      gx = Math.cos(aa) * ra + 0.3; gz = Math.sin(aa) * ra * 0.9 + 0.6;
      ok = Math.hypot(gx, gz) > 0.5;
    }
    g.gX[i] = gx; g.gZ[i] = gz; g.gHt[i] = 0.08 + R() * 0.16; g.gPh[i] = R() * TAU;
  }
  // ambient motes
  var NM = mob ? 110 : 170;
  g.nm = NM; g.mX = new Float32Array(NM); g.mY = new Float32Array(NM); g.mZ = new Float32Array(NM); g.mP = new Float32Array(NM);
  for (i = 0; i < NM; i++) { g.mX[i] = -4 + R() * 8; g.mY[i] = 0.2 + R() * 4.5; g.mZ[i] = -3.5 + R() * 6; g.mP[i] = R() * 100; }
  return g;
}
function cylTable(nr, na) {
  var n = nr * na, T = { n: n, na: na, t: new Float32Array(n), c: new Float32Array(n), s: new Float32Array(n), j: new Uint8Array(n) };
  for (var i = 0; i < nr; i++) for (var j = 0; j < na; j++) {
    var k = i * na + j, a = (j + (i & 1) * 0.5) / na * TAU;
    T.t[k] = i / (nr - 1); T.c[k] = Math.cos(a); T.s[k] = Math.sin(a); T.j[k] = j;
  }
  return T;
}
function fib(n) {
  var T = { n: n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n) };
  for (var i = 0; i < n; i++) {
    var y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
    T.x[i] = Math.cos(a) * r; T.y[i] = y; T.z[i] = Math.sin(a) * r;
  }
  return T;
}

// ---- simulation ---------------------------------------------------------------------
function buildCanopy(s) {
  var R = rng(11), nN = NBR * NN, i, n;
  s.bRest = new Float64Array(nN * 3); s.bX = new Float64Array(nN * 3); s.bXo = new Float64Array(nN * 3);
  s.bV = new Float64Array(nN * 3); s.bOff = new Float64Array(nN * 3); s.bLen = new Float64Array(nN);
  s.bRad = new Float32Array(nN); s.bStiff = new Float64Array(NN); s.bDrag = new Float64Array(NN);
  for (n = 0; n < NN; n++) { var u = n / (NN - 1); s.bStiff[n] = 0.16 * Math.pow(1 - u, 2.0) + 0.018; s.bDrag[n] = 1.4 + 3.4 * u; }
  for (i = 0; i < NBR; i++) {
    var rx, ry, rz, dx, dy, dz, len, r0;
    if (i === NBR - 1) { rx = 0; ry = TH - 0.15; rz = 0; dx = 0.06; dy = 1; dz = 0.04; len = 1.5; r0 = 0.13; }
    else {
      var f = i / (NBR - 2);
      var yb = 2.35 + f * 2.6 + R() * 0.2, az = i * 2.39996 + R() * 0.5, el = 0.40 + 0.42 * f + R() * 0.15;
      len = 2.05 - 0.85 * f + R() * 0.35; r0 = 0.12 - 0.05 * f;
      var rr = rad(yb) * 0.7;
      rx = Math.cos(az) * rr; ry = yb; rz = Math.sin(az) * rr;
      dx = Math.cos(az) * Math.cos(el); dy = Math.sin(el); dz = Math.sin(az) * Math.cos(el);
    }
    for (n = 0; n < NN; n++) {
      var uu = n / (NN - 1), k = (i * NN + n) * 3;
      s.bRest[k] = rx + dx * len * uu;
      s.bRest[k + 1] = ry + dy * len * uu + len * (0.16 * uu - 0.30 * uu * uu) * (1 - dy);
      s.bRest[k + 2] = rz + dz * len * uu;
      s.bRad[i * NN + n] = r0 * (1 - 0.8 * uu) + 0.015;
    }
    for (n = 1; n < NN; n++) {
      k = (i * NN + n) * 3;
      s.bOff[k] = s.bRest[k] - s.bRest[k - 3]; s.bOff[k + 1] = s.bRest[k + 1] - s.bRest[k - 2]; s.bOff[k + 2] = s.bRest[k + 2] - s.bRest[k - 1];
      s.bLen[i * NN + n] = Math.hypot(s.bOff[k], s.bOff[k + 1], s.bOff[k + 2]);
    }
  }
  s.bX.set(s.bRest); s.bXo.set(s.bRest);
  // leaf clumps on the outer nodes: a solid, scalloped sphere each, drawn per cell
  var cl = [];
  for (i = 0; i < NBR; i++) for (n = (i === NBR - 1 ? 1 : 2); n < NN; n++) cl.push(i * NN + n);
  var nc = cl.length;
  s.nc = nc; s.cNode = new Uint16Array(nc); s.cRad = new Float32Array(nc); s.cPal = new Uint8Array(nc);
  s.cGX = new Float32Array(nc); s.cGY = new Float32Array(nc); s.cGZ = new Float32Array(nc);
  for (var c = 0; c < nc; c++) {
    var node = cl[c], kk = node * 3, uN = (node % NN) / (NN - 1);
    s.cNode[c] = node; s.cRad[c] = 0.46 + 0.28 * uN + 0.12 * R();
    var pick = R();
    s.cPal[c] = pick < 0.38 ? 0 : pick < 0.72 ? 1 : pick < 0.88 ? 2 : 3;
    var gx = s.bRest[kk], gy = s.bRest[kk + 1] - CANOPY_Y, gz = s.bRest[kk + 2], gl = Math.hypot(gx, gy, gz) || 1;
    s.cGX[c] = gx / gl; s.cGY[c] = gy / gl; s.cGZ[c] = gz / gl;
  }
  s.cOrd = new Int32Array(nc); s.cD = new Float32Array(nc);
}

var NP = 900;
var K_CHIP = 1, K_LEAF = 2, K_DUST = 3, K_SPARK = 4;
function newSim() {
  var s = {
    t: 0, acc: 0, lastT: state.time,
    tree: 'stand', tt: 0, hits: 0, depth: 0, depthT: 0, alpha: 0, omega: 0, alphaAcc: 0, wob: 0, wobV: 0, gs: 1, dis: 0,
    landed: false,
    sw: 0, swT: 0, swHit: false, queued: 0, auto: 0, lastInput: -99, struck: false,
    psi: 0.4, cock: 0.15, tw: 0, shift: 0, crouch: 0.02, slide: 0.35, look: 0,
    windX: 0, windZ: 0, push: 0, shake: 0,
    camTX: -0.55, camTY: 2.0, camTZ: 0.05, camYaw: 0, camPitch: -0.2, camD: 6.2, primed: false,
    userYaw: 0, userPitch: 0, dragIdle: 99, lastPX: 0, lastPY: 0, dragging: false,
    pX: new Float32Array(NP), pY: new Float32Array(NP), pZ: new Float32Array(NP),
    pVX: new Float32Array(NP), pVY: new Float32Array(NP), pVZ: new Float32Array(NP),
    pAge: new Float32Array(NP), pLife: new Float32Array(NP), pK: new Uint8Array(NP), pS: new Float32Array(NP),
    pR: new Float32Array(NP), pG: new Float32Array(NP), pB: new Float32Array(NP), pRest: new Uint8Array(NP), pNext: 0,
    gBX: null, gBZ: null, gVX: null, gVZ: null, chops: 0,
  };
  buildCanopy(s);
  return s;
}
function ensureGrass() {
  if (S.gBX && S.gBX.length === G.ng) return;
  S.gBX = new Float32Array(G.ng); S.gBZ = new Float32Array(G.ng); S.gVX = new Float32Array(G.ng); S.gVZ = new Float32Array(G.ng);
}

function spawn(kind, x, y, z, vx, vy, vz, life, r, g, b) {
  var s = S, i = s.pNext;
  s.pNext = (i + 1) % NP;
  s.pK[i] = kind; s.pX[i] = x; s.pY[i] = y; s.pZ[i] = z; s.pVX[i] = vx; s.pVY[i] = vy; s.pVZ[i] = vz;
  s.pAge[i] = 0; s.pLife[i] = life; s.pS[i] = Math.random() * 100; s.pR[i] = r; s.pG[i] = g; s.pB[i] = b; s.pRest[i] = 0;
  return i;
}
function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random()); }

// tree local -> world. Upper parts (above the cut) turn about the hinge as the tree falls.
var GS = 1, CA = 1, SA = 0, HAg = HA, HCg = HC;
var _tx = 0, _ty = 0, _tz = 0;
function txf(lx, ly, lz, upper) {
  lx *= GS; ly *= GS; lz *= GS;
  if (upper && SA !== 0) {
    var pa = lx * AX + lz * AZ, pb = lx * BX + lz * BZ;
    var da = pa - HAg, dy = ly - HCg;
    pa = da * CA - dy * SA + HAg; ly = da * SA + dy * CA + HCg;
    lx = pa * AX + pb * BX; lz = pa * AZ + pb * BZ;
  }
  _tx = lx; _ty = ly; _tz = lz;
}
function tnrm(nx, ny, nz, upper) {
  if (upper && SA !== 0) {
    var pa = nx * AX + nz * AZ, pb = nx * BX + nz * BZ;
    var na = pa * CA - ny * SA; ny = pa * SA + ny * CA;
    nx = na * AX + pb * BX; nz = na * AZ + pb * BZ;
  }
  _tx = nx; _ty = ny; _tz = nz;
}
// world vector -> tree-local (for wind and the felling's pseudo-force)
function untilt(vx, vz, out) {
  var pa = vx * AX + vz * AZ, pb = vx * BX + vz * BZ;
  var na = pa * CA, ny = -pa * SA;
  out[0] = na * AX + pb * BX; out[1] = ny; out[2] = na * AZ + pb * BZ;
}
var _w3 = [0, 0, 0];

function canopyStep(dt) {
  var s = S, x = s.bX, v = s.bV, i, n, k;
  s.bXo.set(x);
  var t = s.t;
  untilt(s.windX, s.windZ, _w3);
  var acc = s.alphaAcc;
  for (i = 0; i < NBR; i++) {
    for (n = 1; n < NN; n++) {
      k = (i * NN + n) * 3;
      var X = x[k], Y = x[k + 1], Z = x[k + 2];
      var br = 0.22 * Math.sin(0.9 * t + 0.6 * X + 0.4 * i) + 0.12 * Math.sin(2.3 * t + 1.7 * Z + i);
      var fx = br + _w3[0] * 1.4, fy = 0.05 * Math.sin(1.3 * t + i) + _w3[1] * 1.4, fz = 0.6 * br + _w3[2] * 1.4;
      // the felling: in the tree's turning frame the crown is pushed back against the turn
      var da = (X * AX + Z * AZ) - HA, dy = Y - HC;
      var ka = acc * 0.22;
      fx += ka * dy * AX; fz += ka * dy * AZ; fy += -ka * da;
      var dr = s.bDrag[n] * dt;
      v[k] += dr * (fx - v[k]); v[k + 1] += dr * (fy - v[k + 1]); v[k + 2] += dr * (fz - v[k + 2]);
      x[k] += v[k] * dt; x[k + 1] += v[k + 1] * dt; x[k + 2] += v[k + 2] * dt;
    }
  }
  for (var pass = 0; pass < 2; pass++) {
    for (i = 0; i < NBR; i++) {
      var base = i * NN;
      k = base * 3;
      x[k] = s.bRest[k]; x[k + 1] = s.bRest[k + 1]; x[k + 2] = s.bRest[k + 2];
      for (n = 1; n < NN; n++) {
        k = (base + n) * 3;
        var st = s.bStiff[n];
        x[k] += st * (x[k - 3] + s.bOff[k] - x[k]);
        x[k + 1] += st * (x[k - 2] + s.bOff[k + 1] - x[k + 1]);
        x[k + 2] += st * (x[k - 1] + s.bOff[k + 2] - x[k + 2]);
      }
      for (n = 1; n < NN; n++) {
        k = (base + n) * 3;
        var ux = x[k] - x[k - 3], uy = x[k + 1] - x[k - 2], uz = x[k + 2] - x[k - 1];
        var ul = Math.max(Math.sqrt(ux * ux + uy * uy + uz * uz), 1e-9), L = s.bLen[base + n] / ul;
        x[k] = x[k - 3] + ux * L; x[k + 1] = x[k - 2] + uy * L; x[k + 2] = x[k - 1] + uz * L;
      }
    }
  }
  var nN = NBR * NN;
  for (i = 0; i < nN; i++) {
    k = i * 3;
    if (i % NN === 0) { v[k] = v[k + 1] = v[k + 2] = 0; continue; }
    var vx = (x[k] - s.bXo[k]) / dt * 0.985, vy = (x[k + 1] - s.bXo[k + 1]) / dt * 0.985, vz = (x[k + 2] - s.bXo[k + 2]) / dt * 0.985;
    var fast = Math.sqrt(vx * vx + vy * vy + vz * vz), lim = Math.min(1, 4.0 / Math.max(fast, 1e-6));
    v[k] = vx * lim; v[k + 1] = vy * lim; v[k + 2] = vz * lim;
  }
}
function shudder(amp) {
  var s = S, nN = NBR * NN;
  for (var i = 0; i < nN; i++) {
    if (i % NN === 0) continue;
    var k = i * 3, u = (i % NN) / (NN - 1);
    s.bV[k] += gauss() * amp * u; s.bV[k + 1] += gauss() * amp * 0.5 * u; s.bV[k + 2] += gauss() * amp * u;
  }
}

function grassStep(dt) {
  var s = S, g = G, t = s.t;
  ensureGrass();
  for (var i = 0; i < g.ng; i++) {
    var wx = 0.05 * Math.sin(1.7 * t + g.gX[i] * 1.3 + g.gPh[i]) + clamp(s.windX, -1.5, 1.5) * 0.12;
    var wz = 0.03 * Math.sin(1.3 * t + g.gZ[i] * 1.1) + clamp(s.windZ, -1.5, 1.5) * 0.12;
    var bx = s.gBX[i], bz = s.gBZ[i];
    s.gVX[i] += (40 * (wx - bx) - 3.2 * s.gVX[i]) * dt; s.gVZ[i] += (40 * (wz - bz) - 3.2 * s.gVZ[i]) * dt;
    s.gBX[i] = bx + s.gVX[i] * dt; s.gBZ[i] = bz + s.gVZ[i] * dt;
  }
}
function grassKick(cx, cz, amp, reach) {
  var g = G;
  ensureGrass();
  for (var i = 0; i < g.ng; i++) {
    var dx = g.gX[i] - cx, dz = g.gZ[i] - cz, d = Math.hypot(dx, dz) + 1e-3;
    var f = amp * Math.exp(-d / reach);
    S.gVX[i] += dx / d * f; S.gVZ[i] += dz / d * f;
  }
}

// ---- the swing ----------------------------------------------------------------------
var T_W = 0.42, T_H = 0.07, T_S = 0.12, T_I = 0.2, T_P = 0.32, T_WH = 0.22;
var PSI0 = 0.4, PSI_TOP = 2.05;
function treeHittable() { return (S.tree === 'stand' || (S.tree === 'grow' && S.gs > 0.92)) && S.hits < NHITS; }
function startSwing() {
  if (S.sw) { if (S.queued < 2) S.queued++; return; }
  S.sw = 1; S.swT = 0; S.struck = false; S.swHit = false;
}
function swingStep(dt) {
  var s = S;
  var rest = s.tree === 'fall' || s.tree === 'down' || s.tree === 'creak';
  if (!s.sw) {
    // between swings: ready stance, or watching the tree go
    var b = 0.02 * Math.sin(s.t * 1.6);
    var tp = rest ? -0.55 : PSI0, tc = rest ? 0.25 : 0.15;
    var k = 1 - Math.exp(-dt / 0.18);
    s.psi += (tp - s.psi) * k; s.cock += (tc - s.cock) * k; s.tw += ((rest ? -0.1 : 0) - s.tw) * k;
    s.shift += ((rest ? -0.06 : 0) - s.shift) * k; s.crouch += (0.02 + b - s.crouch) * k; s.slide += ((rest ? 0.62 : 0.35) - s.slide) * k;
    s.look += ((rest ? 1 : 0) - s.look) * (1 - Math.exp(-dt / 0.5));
    if (s.queued > 0) { s.queued--; startSwing(); }
    return;
  }
  s.look += (0 - s.look) * (1 - Math.exp(-dt / 0.2));
  s.swT += dt;
  var t = s.swT, u;
  if (t < T_W) {
    u = ease(t / T_W);
    s.psi = mix(PSI0, PSI_TOP, u); s.cock = mix(0.15, 0.85, u); s.tw = mix(0, 0.55, u);
    s.shift = mix(0, -0.09, u); s.crouch = mix(0.02, -0.01, u); s.slide = mix(0.35, 0.58, u);
  } else if (t < T_W + T_H) {
    s.psi = PSI_TOP + 0.04 * Math.sin((t - T_W) / T_H * Math.PI);
  } else if (t < T_W + T_H + T_S) {
    if (!s.struck) { s.struck = true; s.swHit = treeHittable(); }
    u = (t - T_W - T_H) / T_S;
    var end = s.swHit ? 0 : -0.55;
    s.psi = mix(PSI_TOP, end, u * u); s.cock = 0.85 * (1 - Math.pow(u, 1.8)); s.tw = mix(0.55, -0.22, ease(u));
    s.shift = mix(-0.09, 0.12, ease(u)); s.crouch = mix(-0.01, 0.09, u); s.slide = mix(0.58, 0.07, ease(u));
  } else if (s.swHit && t < T_W + T_H + T_S + T_I) {
    if (s.sw === 1) { s.sw = 2; impact(); }
    var q = t - T_W - T_H - T_S;
    s.psi = 0.05 * Math.sin(q * 46) * Math.exp(-q * 14); s.cock = 0;
  } else if (!s.swHit && t < T_W + T_H + T_S + T_WH) {
    var q2 = (t - T_W - T_H - T_S) / T_WH;
    s.psi = mix(-0.55, -1.0, ease(q2)); s.cock = -0.1 * q2; s.tw = mix(-0.22, -0.4, q2);
  } else {
    var t0 = T_W + T_H + T_S + (s.swHit ? T_I : T_WH);
    u = ease((t - t0) / T_P);
    var from = s.swHit ? 0 : -1.0;
    s.psi = mix(from, PSI0, u); s.cock = mix(0, 0.15, u); s.tw = mix(s.swHit ? -0.22 : -0.4, 0, u);
    s.shift = mix(0.12, 0, u); s.crouch = mix(0.09, 0.02, u); s.slide = mix(0.07, 0.35, u);
    if (t >= t0 + T_P) { s.sw = 0; s.chops++; }
  }
}
function impact() {
  var s = S;
  s.hits++;
  s.depthT = Math.min(s.hits / NHITS, 1);
  s.push = 1; s.shake = Math.max(s.shake, 0.55);
  s.wobV += 0.5 + 0.12 * s.hits;
  shudder(1.1 + 0.22 * s.hits);
  grassKick(NPX, NPZ, 0.6, 0.8);
  // chips: out of the notch toward the man and the camera, spinning
  var nch = G.mob ? 16 : 24;
  for (var i = 0; i < nch; i++) {
    var sp = 1.6 + Math.random() * 2.6;
    var ox = AX * 0.9 - 0.25 + gauss() * 0.45, oz = AZ * 0.9 + gauss() * 0.45, oy = 0.45 + Math.random() * 0.9;
    var l = Math.hypot(ox, oy, oz);
    var c = 0.85 + 0.3 * Math.random();
    spawn(K_CHIP, NPX + gauss() * 0.03, NPY + gauss() * 0.05, NPZ + gauss() * 0.03, ox / l * sp, oy / l * sp, oz / l * sp, 14 + Math.random() * 8,
      WOOD[0] * c, WOOD[1] * c, WOOD[2] * c);
  }
  // a few leaves let go
  shedLeaves(G.mob ? 7 : 11, 1);
  if (s.hits >= NHITS) { s.tree = 'creak'; s.tt = 0; }
}
function shedLeaves(n, spd) {
  var s = S;
  for (var i = 0; i < n; i++) {
    var ci = (Math.random() * s.nc) | 0, k = s.cNode[ci] * 3, rr = s.cRad[ci];
    txf(s.bX[k] + gauss() * rr * 0.5, s.bX[k + 1] + gauss() * rr * 0.4, s.bX[k + 2] + gauss() * rr * 0.5, true);
    var pc = LEAFC[Math.random() < 0.5 ? s.cPal[ci] : 2 + (Math.random() * 2 | 0)], j = 1.1 + 0.3 * Math.random();
    spawn(K_LEAF, _tx, _ty, _tz, gauss() * 0.4 * spd, -0.2 + gauss() * 0.3 * spd, gauss() * 0.4 * spd, 7 + Math.random() * 6, pc[0] * j, pc[1] * j, pc[2] * j);
  }
}

function treeStep(dt) {
  var s = S;
  s.tt += dt;
  // the notch opens toward its target depth in a snap
  s.depth += (s.depthT - s.depth) * (1 - Math.exp(-dt / 0.05));
  // the trunk shivers on its root after each hit
  s.wobV += (-90 * s.wob - 7 * s.wobV) * dt; s.wob += s.wobV * dt;
  var prevOmega = s.omega;
  if (s.tree === 'creak') {
    var c = clamp(s.tt / 0.9, 0, 1);
    s.alpha = 0.04 * ease(c) + 0.006 * Math.sin(s.tt * 55) * (1 - c);
    s.shake = Math.max(s.shake, 0.12);
    if (s.tt > 0.9) { s.tree = 'fall'; s.tt = 0; s.omega = 0.08; }
  } else if (s.tree === 'fall') {
    s.omega += 3.3 * Math.sin(s.alpha + 0.05) * dt;
    s.alpha += s.omega * dt;
    if (Math.random() < 0.25) shedLeaves(1, 0.6);
    if (s.alpha >= ALAND) {
      s.alpha = ALAND;
      if (!s.landed) land();
      if (s.omega > 0.5) s.omega = -0.2 * s.omega;
      else { s.omega = 0; s.tree = 'down'; s.tt = 0; }
    }
  } else if (s.tree === 'down') {
    if (s.tt > 6.5 && state.time - s.lastInput > 2.5) { s.tree = 'dissolve'; s.tt = 0; }
  } else if (s.tree === 'dissolve') {
    s.dis = clamp(s.tt / 1.3, 0, 1);
    if (Math.random() < 0.9) {
      var a = Math.random() * 4.6;
      var fx = -AX, fz = -AZ;
      spawn(K_SPARK, HA * AX + fx * (a + 0.4) + gauss() * 0.4, HC * 0.5 + Math.random() * 0.8, HA * AZ + fz * (a + 0.4) + gauss() * 0.4,
        gauss() * 0.1, 0.5 + Math.random() * 0.6, gauss() * 0.1, 1.6, 1.0, 0.82, 0.4);
    }
    if (s.tt > 1.3) regrow();
  } else if (s.tree === 'grow') {
    var u = clamp(s.tt / 2.1, 0, 1);
    s.gs = 1 - Math.exp(-4.5 * u) * Math.cos(7 * u);
    if (u >= 1) { s.gs = 1; s.tree = 'stand'; }
  }
  if (s.tree !== 'fall') s.alphaAcc *= 0.9;
  else s.alphaAcc = (s.omega - prevOmega) / dt;
}
function land() {
  var s = S;
  s.landed = true; s.shake = 1.6; s.push = 0.4;
  s.alphaAcc = -60;
  shudder(4.5);
  var fx = -AX, fz = -AZ, i, n = G.mob ? 120 : 190;
  grassKick(HA * AX + fx * 3, HA * AZ + fz * 3, 3.2, 2.2);
  for (i = 0; i < n; i++) {
    var a = 0.6 + Math.random() * 5.6, side = gauss() * 0.5;
    var x = HA * AX + fx * a + BX * side, z = HA * AZ + fz * a + BZ * side;
    var sp = 0.6 + Math.random() * 1.8, an = Math.random() * TAU;
    var c = 0.75 + 0.3 * Math.random();
    spawn(K_DUST, x, 0.05 + Math.random() * 0.3, z, Math.cos(an) * sp, 0.6 + Math.random() * 1.4, Math.sin(an) * sp, 1.6 + Math.random() * 1.8,
      0.82 * c, 0.66 * c, 0.44 * c);
  }
  shedLeaves(G.mob ? 70 : 120, 2.4);
  // the chips on the ground jump
  for (i = 0; i < NP; i++) if (S.pK[i] === K_CHIP && S.pRest[i]) { S.pRest[i] = 0; S.pVY[i] = 1 + Math.random() * 1.5; }
}
function regrow() {
  var s = S;
  s.tree = 'grow'; s.tt = 0; s.gs = 0; s.dis = 0; s.hits = 0; s.depth = 0; s.depthT = 0; s.alpha = 0; s.omega = 0; s.landed = false;
  s.wob = 0; s.wobV = 0; s.alphaAcc = 0;
  s.bX.set(s.bRest); s.bV.fill(0);
  for (var i = 0; i < NP; i++) if (s.pK[i] === K_CHIP && s.pRest[i]) s.pLife[i] = Math.min(s.pLife[i], s.pAge[i] + 1.0);
  for (i = 0; i < 40; i++) spawn(K_SPARK, gauss() * 0.3, 0.05, gauss() * 0.3, gauss() * 0.3, 0.8 + Math.random(), gauss() * 0.3, 1.4, 0.7, 1.0, 0.4);
}

function particlesStep(dt) {
  var s = S;
  for (var i = 0; i < NP; i++) {
    var k = s.pK[i];
    if (!k) continue;
    s.pAge[i] += dt;
    if (s.pAge[i] >= s.pLife[i]) { s.pK[i] = 0; continue; }
    if (s.pRest[i]) continue;
    var vx = s.pVX[i], vy = s.pVY[i], vz = s.pVZ[i];
    if (k === K_CHIP) {
      vy -= 9.0 * dt;
    } else if (k === K_LEAF) {
      var ph = s.pAge[i] * 2.6 + s.pS[i];
      vx += (Math.sin(ph) * 1.2 + s.windX * 0.9 - vx) * 2.2 * dt;
      vz += (Math.cos(ph * 0.7) * 0.7 + s.windZ * 0.9 - vz) * 2.2 * dt;
      vy += (-0.45 + 0.25 * Math.cos(ph * 2) - vy) * 2.5 * dt;
    } else if (k === K_DUST) {
      var d = Math.exp(-dt * 2.2);
      vx *= d; vz *= d; vy = vy * d + 0.05 * dt;
    } else if (k === K_SPARK) {
      vy *= Math.exp(-dt * 0.8);
    }
    var x = s.pX[i] + vx * dt, y = s.pY[i] + vy * dt, z = s.pZ[i] + vz * dt;
    if (y < 0.02 && (k === K_CHIP || k === K_LEAF)) {
      y = 0.02;
      if (k === K_CHIP && vy < -1.2) { vy = -vy * 0.28; vx *= 0.5; vz *= 0.5; }
      else { vx = vz = vy = 0; s.pRest[i] = 1; if (k === K_LEAF) s.pLife[i] = Math.min(s.pLife[i], s.pAge[i] + 6); }
    }
    s.pX[i] = x; s.pY[i] = y; s.pZ[i] = z; s.pVX[i] = vx; s.pVY[i] = vy; s.pVZ[i] = vz;
  }
  // ambient leaf fall from the standing crown
  if ((s.tree === 'stand' || s.tree === 'grow') && Math.random() < 0.05) shedLeaves(1, 0.4);
}

var STEP = 1 / 60;
function simStep() {
  var s = S;
  s.t += STEP;
  // drag wind and the ambient breeze both die away
  var wd = Math.exp(-STEP / 0.9);
  s.windX *= wd; s.windZ *= wd;
  swingStep(STEP);
  treeStep(STEP);
  canopyStep(STEP);
  grassStep(STEP);
  particlesStep(STEP);
  s.push *= Math.exp(-STEP / 0.35); s.shake *= Math.exp(-STEP / 0.25);
  // idle auto-chop so it is never still
  if (state.time - s.lastInput > 3.5) {
    s.auto += STEP;
    if (!s.sw && s.queued === 0 && s.auto > 0.55 && (s.tree === 'stand' || (s.tree === 'grow' && s.gs > 0.95))) { s.auto = 0; startSwing(); }
  } else s.auto = 0;
}

// ---- the man's pose -----------------------------------------------------------------
var J = new Float64Array(24 * 3);
var JP = 0, JC = 1, JN = 2, JH = 3, JSL = 4, JEL = 5, JHL = 6, JSR = 7, JER = 8, JHR = 9;
var JIL = 10, JKL = 11, JAL = 12, JTL = 13, JIR = 14, JKR = 15, JAR = 16, JTR = 17, JKNOB = 18, JAXE = 19, JBIT = 20, JPOLL = 21;
function sj(i, x, y, z) { J[i * 3] = x; J[i * 3 + 1] = y; J[i * 3 + 2] = z; }
// two-bone IK: root a, target b, lengths l1 l2, pole p -> joint index out
function ik(a, b, l1, l2, px, py, pz, out) {
  var ax = J[a * 3], ay = J[a * 3 + 1], az = J[a * 3 + 2];
  var dx = J[b * 3] - ax, dy = J[b * 3 + 1] - ay, dz = J[b * 3 + 2] - az;
  var d = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= d; dy /= d; dz /= d;
  var dd = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  var ca = (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), h = l1 * Math.sqrt(Math.max(0, 1 - ca * ca));
  var pd = px * dx + py * dy + pz * dz;
  px -= dx * pd; py -= dy * pd; pz -= dz * pd;
  var pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  sj(out, ax + dx * l1 * ca + px * h, ay + dy * l1 * ca + py * h, az + dz * l1 * ca + pz * h);
}
var HEADF = [1, 0, 0], AXN = [0, 0, 1];
function poseMan() {
  var s = S, tw = s.tw, ct = Math.cos(tw), st = Math.sin(tw);
  var wind = clamp(s.psi / PSI_TOP, 0, 1);
  // pelvis, spine, head
  var px = MX + FWX * s.shift, pz = MZ + FWZ * s.shift, py = 0.9 - s.crouch;
  sj(JP, px, py, pz);
  var lean = 0.05 + 0.55 * s.crouch + 0.25 * s.shift - 0.06 * wind - 0.08 * s.look;
  var cx = px + FWX * lean, cy = py + 0.46, cz = pz + FWZ * lean;
  sj(JC, cx, cy, cz);
  sj(JN, cx + FWX * 0.02, cy + 0.12, cz + FWZ * 0.02);
  sj(JH, cx + FWX * 0.05, cy + 0.27, cz + FWZ * 0.05);
  // twisted shoulders
  var rtx = RTX * ct - FWX * st, rtz = RTZ * ct - FWZ * st;
  sj(JSL, cx - rtx * 0.23, cy + 0.07, cz - rtz * 0.23);
  sj(JSR, cx + rtx * 0.23, cy + 0.07, cz + rtz * 0.23);
  var t2 = tw * 0.35, rhx = RTX * Math.cos(t2) - FWX * Math.sin(t2), rhz = RTZ * Math.cos(t2) - FWZ * Math.sin(t2);
  sj(JIL, px - rhx * 0.11, py - 0.02, pz - rhz * 0.11);
  sj(JIR, px + rhx * 0.11, py - 0.02, pz + rhz * 0.11);
  // feet planted: left forward, right back and turned out
  sj(JAL, MX + FWX * 0.32 - RTX * 0.17, 0.08, MZ + FWZ * 0.32 - RTZ * 0.17);
  sj(JAR, MX - FWX * 0.27 + RTX * 0.20, 0.08, MZ - FWZ * 0.27 + RTZ * 0.20);
  sj(JTL, J[JAL * 3] + FWX * 0.17, 0.04, J[JAL * 3 + 2] + FWZ * 0.17 - 0.02);
  sj(JTR, J[JAR * 3] + FWX * 0.14 + RTX * 0.09, 0.04, J[JAR * 3 + 2] + FWZ * 0.14 + RTZ * 0.09);
  ik(JIL, JAL, 0.46, 0.44, FWX, 0.0, FWZ - 0.2, JKL);
  ik(JIR, JAR, 0.46, 0.44, FWX + RTX * 0.3, 0.0, FWZ + RTZ * 0.3, JKR);
  // the axe: the hands ride a circle round the chest; the handle cocks back in the wind-up
  var nx = NPX - cx, ny = NPY - cy, nz = NPZ - cz, nd = Math.hypot(nx, ny, nz);
  var u1x = nx / nd, u1y = ny / nd, u1z = nz / nd;
  var wx = RTX * 0.66 - FWX * 0.2, wy = 0.62, wz = RTZ * 0.66 - FWZ * 0.2;
  var wd = wx * u1x + wy * u1y + wz * u1z;
  wx -= u1x * wd; wy -= u1y * wd; wz -= u1z * wd;
  var wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
  var rh = Math.max(0.3, nd - LH - 0.05) - 0.12 * wind;
  var cp = Math.cos(s.psi), sp = Math.sin(s.psi), ph = s.psi + s.cock, ch = Math.cos(ph), sh = Math.sin(ph);
  var hx = cx + rh * (cp * u1x + sp * wx), hy = cy + rh * (cp * u1y + sp * wy), hz = cz + rh * (cp * u1z + sp * wz);
  var dx = ch * u1x + sh * wx, dy = ch * u1y + sh * wy, dz = ch * u1z + sh * wz;
  sj(JHL, hx, hy, hz);
  sj(JHR, hx + dx * LH * s.slide, hy + dy * LH * s.slide, hz + dz * LH * s.slide);
  sj(JKNOB, hx - dx * 0.05, hy - dy * 0.05, hz - dz * 0.05);
  var ahx = hx + dx * LH, ahy = hy + dy * LH, ahz = hz + dz * LH;
  sj(JAXE, ahx, ahy, ahz);
  // the blade leads the swing; the poll trails
  var bx = sh * u1x - ch * wx, by = sh * u1y - ch * wy, bz = sh * u1z - ch * wz;
  sj(JBIT, ahx + bx * 0.15, ahy + by * 0.15, ahz + bz * 0.15);
  sj(JPOLL, ahx - bx * 0.06, ahy - by * 0.06, ahz - bz * 0.06);
  AXN[0] = u1y * wz - u1z * wy; AXN[1] = u1z * wx - u1x * wz; AXN[2] = u1x * wy - u1y * wx;
  ik(JSL, JHL, 0.30, 0.29, -rtx * 0.5, -0.8, -rtz * 0.5, JEL);
  ik(JSR, JHR, 0.30, 0.29, rtx * 0.6, -0.7, rtz * 0.6, JER);
  // the head looks at the notch, or up at the falling crown
  var lx = NPX, ly = NPY, lz = NPZ;
  if (s.look > 0.01) {
    txf(0, TH * 0.8, 0, true);
    lx = mix(lx, _tx, s.look); ly = mix(ly, _ty, s.look); lz = mix(lz, _tz, s.look);
  }
  var fx = lx - J[JH * 3], fy = ly - J[JH * 3 + 1], fz = lz - J[JH * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  fy = clamp(fy, -0.45, 0.6);
  fl = Math.hypot(fx, fy, fz); HEADF[0] = fx / fl; HEADF[1] = fy / fl; HEADF[2] = fz / fl;
}

// ---- shading ------------------------------------------------------------------------
var _cr = 0, _cg = 0, _cb = 0, _cl = 0;
var AMBK = 0.7;
function shade(nx, ny, nz, br, bg, bb, lum0, lumK, rimK) {
  var nl = nx * LX + ny * LY + nz * LZ, diff = nl > 0 ? nl : 0;
  var ndv = -(nx * FX + ny * FY + nz * FZ); if (ndv < 0) ndv = 0;
  var e = 1 - ndv, rim = e * e * (0.15 + 0.85 * clamp(nl + 0.45, 0, 1)) * rimK;
  var sky = 0.75 + 0.25 * ny;
  _cr = br * (AMB[0] * AMBK * sky + SUN[0] * diff * 1.5) + RIMC[0] * rim;
  _cg = bg * (AMB[1] * AMBK * sky + SUN[1] * diff * 1.5) + RIMC[1] * rim;
  _cb = bb * (AMB[2] * AMBK * sky + SUN[2] * diff * 1.5) + RIMC[2] * rim;
  var l = lum0 + lumK * diff + 0.45 * rim;
  _cl = l < 0 ? 0 : l > 1 ? 1 : l;
}

// ---- drawing: background ------------------------------------------------------------
var _haze = { x: 0, y: 0, on: false };
function sky(t) {
  // near-black, warming toward the sun's side; a canopy band of dark leaves across the top
  var g = G, W = g.w, H = g.h, cw = g.cw, ch = g.ch;
  var sx0 = 0, sy0 = 0;
  var sdx = LX * RX + LY * RY + LZ * RZ, sdy = LX * UX + LY * UY + LZ * UZ, sdz = LX * FX + LY * FY + LZ * FZ;
  _haze.on = sdz > -0.2;
  sx0 = OX + sdx / Math.max(sdz, 0.25) * FPX; sy0 = OY - sdy / Math.max(sdz, 0.25) * FPX;
  _haze.x = sx0; _haze.y = sy0;
  var hr = 0.55 * Math.max(g.PW, g.PH);
  var yaw = Math.atan2(CX - S.camTX, CZ - S.camTZ);
  var band = Math.floor(H * 0.34);
  for (var r = 0; r < H; r++) {
    var py = (r + 0.5) * ch;
    for (var c = 0; c < W; c++) {
      var id = r * W + c, px = (c + 0.5) * cw;
      var hz = 0;
      if (_haze.on) { var ddx = (px - sx0) / hr, ddy = (py - sy0) / hr; hz = Math.exp(-(ddx * ddx + ddy * ddy)) * clamp(sdz + 0.2, 0, 1); }
      // the overhead canopy of the far forest: value noise that drifts with the camera's turn
      if (r < band) {
        var u = c * cw / FPX * 9 - yaw * 9, v = r * 0.16;
        var n0 = vnoise(u, v + 0.07 * Math.sin(0.3 * t)) * 0.65 + vnoise(u * 2.3 + 5, v * 2.1) * 0.35;
        var dens = n0 - (r / band) * 0.55 - 0.18;
        if (dens > 0) {
          var hh = hash01(c, r);
          var gi = (hh * CANOPY_G.length) | 0;
          g.chars[id] = CANOPY_G[gi];
          var dk = 0.05 + 0.10 * dens + 0.5 * hz;
          var sp = hh > 0.93 ? 0.6 * hz + 0.12 : 0;
          g.r[id] = dk * 0.55 + sp; g.gg[id] = dk * 0.9 + sp * 0.7; g.b[id] = dk * 0.35 + sp * 0.2;
          g.owner[id] = O_BG; g.zbuf[id] = 1e6;
          continue;
        }
      }
      if (hz > 0.08 && hash01(c * 1.3, r * 0.7) > 0.72) {
        g.chars[id] = hz > 0.5 ? 58 : 46;
        g.r[id] = 0.55 * hz; g.gg[id] = 0.34 * hz; g.b[id] = 0.12 * hz;
        g.owner[id] = O_BG; g.zbuf[id] = 1e6;
      }
    }
  }
}
function vnoise(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  var a = hash01(xi, yi), b = hash01(xi + 1, yi), c = hash01(xi, yi + 1), d = hash01(xi + 1, yi + 1);
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function forest() {
  // far trunks: dark columns with a hot rim on the sun's side
  var g = G, n = g.nbg, i, j, ord = g.bgOrd;
  for (i = 0; i < n; i++) {
    var dx = g.bgX[i] - CX, dz = g.bgZ[i] - CZ;
    g.bgD[i] = dx * FX + dz * FZ; ord[i] = i;
  }
  for (i = 1; i < n; i++) { var o = ord[i]; j = i - 1; while (j >= 0 && g.bgD[ord[j]] < g.bgD[o]) { ord[j + 1] = ord[j]; j--; } ord[j + 1] = o; }
  var sunSide = LX * RX + LZ * RZ;   // < 0: the sun is to the left of the screen
  var W = g.w, H = g.h;
  for (var oi = 0; oi < n; oi++) {
    i = ord[oi];
    if (g.bgD[i] < 1.0) continue;
    project(g.bgX[i], 0, g.bgZ[i]);
    if (!_ok) continue;
    var bx = _sx, by = _sy, vz = _vz, half = g.bgR[i] * _sh;
    project(g.bgX[i], 14, g.bgZ[i]);
    var ty = _ok ? _sy : -1e4;
    var c0 = Math.max(0, Math.floor((bx - half) / g.cw)), c1 = Math.min(W - 1, Math.floor((bx + half) / g.cw));
    var r0 = Math.max(0, Math.floor(ty / g.ch)), r1 = Math.min(H - 1, Math.floor(by / g.ch));
    if (c1 < c0 || r1 < r0) continue;
    var far = clamp(1.25 - vz / 18, 0.25, 1);
    for (var c = c0; c <= c1; c++) {
      var q = ((c + 0.5) * g.cw - bx) / Math.max(half, 1e-3);
      if (q < -1 || q > 1) q = q < 0 ? -0.99 : 0.99;
      var lit = clamp(q * Math.sign(sunSide || -1), 0, 1);
      var rimq = Math.pow(lit, 6);
      var code = rimq > 0.5 ? C_PIPE : 0;
      for (var r = r0; r <= r1; r++) {
        var id = r * W + c;
        if (!(vz < g.zbuf[id])) continue;
        var fy = 1 - (r * g.ch - ty) / Math.max(by - ty, 1);
        var glow = rimq * (0.35 + 0.65 * clamp(1.2 - fy, 0, 1));
        var dk = (0.045 + 0.04 * (1 - Math.abs(q))) * far;
        g.chars[id] = code || (((r * 7 + c * 3) % 5) < 2 ? 35 : 58);
        g.r[id] = dk * 1.0 + glow * 0.95 * far; g.gg[id] = dk * 0.7 + glow * 0.55 * far; g.b[id] = dk * 0.55 + glow * 0.2 * far;
        g.owner[id] = O_BG; g.zbuf[id] = vz;
      }
    }
  }
}

// is a ground point in shadow? the standing trunk, its crown (dappled), the man
var SHK = 1;
function shadowAt(x, z, t) {
  var s = 0;
  if (SHK > 0.01) {
    var tt = -(x * LX + z * LZ) / LXZ2;
    if (tt > 0) {
      var y = tt * LY, dx = x + tt * LX, dz = z + tt * LZ, d2 = dx * dx + dz * dz;
      if (y < TH * GS) { var rr = rad(y / GS) * GS; if (d2 < rr * rr) s = 1; }
    }
    // the crown: distance from its centre to the sun ray
    var ccy = CANOPY_Y * GS, qx = -x, qy = ccy, qz = -z, pj = qx * LX + qy * LY + qz * LZ;
    if (pj > 0) {
      var dist2 = qx * qx + qy * qy + qz * qz - pj * pj, cr = 2.2 * GS;
      if (dist2 < cr * cr) {
        var dap = vnoise(x * 2.2 + 0.4 * Math.sin(t * 0.8), z * 2.2 + 0.3 * Math.cos(t * 0.6));
        var e = 1 - dist2 / (cr * cr);
        if (dap < 0.35 + 0.5 * e) s = Math.max(s, 0.85);
      }
    }
    s *= SHK;
  }
  // the man: a fat vertical capsule
  var tm = -((x - MX) * LX + (z - MZ) * LZ) / LXZ2;
  if (tm > 0 && tm * LY < 1.8) {
    var mx = x + tm * LX - MX, mz = z + tm * LZ - MZ;
    var w = tm * LY > 1.45 ? 0.13 : 0.2;
    if (mx * mx + mz * mz < w * w) s = 1;
  }
  return s;
}

function ground(t) {
  var g = G, W = g.w, H = g.h, cw = g.cw, ch = g.ch;
  for (var r = 0; r < H; r++) {
    var b = -((r + 0.5) * ch - OY) / FPX;
    var dy = FY + UY * b;
    if (dy > -0.004) continue;
    var tr = -CY / dy;
    if (tr > 60) continue;
    for (var c = 0; c < W; c++) {
      var a = ((c + 0.5) * cw - OX) / FPX;
      var dx = FX + RX * a + UX * b, dz = FZ + RZ * a + UZ * b;
      var t0 = -CY / dy, x = CX + t0 * dx, z = CZ + t0 * dz;
      var id = r * W + c;
      if (!(t0 < g.zbuf[id])) continue;
      var h = hash01(Math.floor(x * 8), Math.floor(z * 8));
      var far = clamp(1.15 - t0 / 26, 0, 1);
      var thr = 0.42 + 0.3 * (1 - far);
      if (h < thr) continue;
      var sh = shadowAt(x, z, t);
      var lit = 1 - sh;
      var litter = hash01(Math.floor(x * 5) + 31, Math.floor(z * 5)) > 0.86;
      var code;
      if (litter) code = LITTER_G[(h * 37 | 0) % LITTER_G.length];
      else code = GROUND_G[(h * 53 | 0) % GROUND_G.length];
      var m = far * (0.5 + 0.5 * h);
      var cr, cg, cb;
      if (litter) { cr = 0.30 + 0.55 * lit; cg = 0.12 + 0.28 * lit; cb = 0.05 + 0.06 * lit; }
      else { cr = 0.06 + 0.62 * lit; cg = 0.13 + 0.46 * lit; cb = 0.08 + 0.12 * lit; }
      g.chars[id] = code; g.r[id] = cr * m; g.gg[id] = cg * m; g.b[id] = cb * m;
      g.owner[id] = O_GROUND; g.zbuf[id] = t0;
    }
  }
}

function stroke3(x0, y0, z0, x1, y1, z1, r, gg, b, own, z0bias) {
  project(x0, y0, z0); if (!_ok) return;
  var ax = _sx, ay = _sy, az = _vz;
  project(x1, y1, z1); if (!_ok) return;
  var bx = _sx, by = _sy, bz = _vz;
  var g = G, n = Math.floor(Math.max(Math.abs(bx - ax) / g.cw, Math.abs(by - ay) / g.ch) * 1.5) + 2;
  if (n > 400) return;
  var code = lineGlyph(bx - ax, by - ay);
  for (var i = 0; i < n; i++) {
    var f = i / (n - 1);
    plot(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f - z0bias, code, r, gg, b, own);
  }
}

function grass(t) {
  var g = G, s = S;
  ensureGrass();
  for (var i = 0; i < g.ng; i++) {
    var x = g.gX[i], z = g.gZ[i], h = g.gHt[i];
    var dx = x - CX, dz = z - CZ;
    if (dx * FX + dz * FZ < 0.5) continue;
    var sh = shadowAt(x, z, t), lit = 1 - sh;
    var bx = s.gBX[i] + 0.05 * Math.sin(g.gPh[i]), bz = s.gBZ[i] + 0.05 * Math.cos(g.gPh[i] * 1.3);
    var mx = x + bx * 0.35, my = h * 0.55, mz = z + bz * 0.35;
    stroke3(x, 0.0, z, mx, my, mz, 0.05 + 0.20 * lit, 0.20 + 0.36 * lit, 0.07 + 0.05 * lit, O_GRASS, 0);
    stroke3(mx, my, mz, x + bx, h, z + bz, 0.08 + 0.42 * lit, 0.24 + 0.40 * lit, 0.05 + 0.06 * lit, O_GRASS, 0);
  }
}

// ---- drawing: the tree --------------------------------------------------------------
function drawTrunk() {
  var g = G, s = S, n = g.nt, D = s.depth * 1.72 * RC, dis = s.dis;
  var cut = RC - D, hw = HW;
  var cxp = CX, cyp = CY, czp = CZ;
  for (var k = 0; k < n; k++) {
    if (dis > 0 && g.tH[k] < dis) continue;
    var y = g.tY[k];
    var dyc = y - HC;
    if (D > 0.002 && dyc > -hw && dyc < hw) {
      var dl = D * (1 - Math.abs(dyc) / hw);
      if (g.tPA[k] > RC - dl) continue;
    }
    var up = y > HC;
    tnrm(g.tNX[k], g.tNY[k], g.tNZ[k], up);
    var nx = _tx, ny = _ty, nz = _tz;
    txf(g.tX[k], y, g.tZ[k], up);
    if ((cxp - _tx) * nx + (cyp - _ty) * ny + (czp - _tz) * nz < 0) continue;
    var wx = _tx, wy = _ty, wz = _tz;
    project(wx, wy, wz);
    if (!_ok) continue;
    var bk = g.tBark[k], f = bk * bk;
    var br = mix(BARK_D[0], BARK[0], f), bg = mix(BARK_D[1], BARK[1], f), bb = mix(BARK_D[2], BARK[2], f);
    // the trunk darkens into the shade of the crown above
    var occ = clamp(1.25 - y / 4.5, 0.45, 1);
    shade(nx, ny, nz, br * occ, bg * occ, bb * occ, 0.30 + 0.25 * f, 0.5, 0.9 * occ);
    plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_TREE);
  }
  // the notch faces, and the flat cut faces once the tree has parted
  var nd = g.nd, kk = D > 0.002 ? hw / D : 0, kl = Math.hypot(kk, 1);
  var parted = s.alpha > 0.02 || s.tree === 'down';
  for (var i = 0; i < nd; i++) {
    if (dis > 0 && g.dH[i] < dis) continue;
    var pa = g.dPA[i], pb = g.dPB[i];
    var lx = pa * AX + pb * BX, lz = pa * AZ + pb * BZ;
    var col = 0.85 + 0.15 * g.dH[i];
    var ring = 0.5 + 0.5 * Math.sin(Math.hypot(pa, pb) * 70);
    var wr = WOOD[0] * col * (0.86 + 0.14 * ring), wg = WOOD[1] * col * (0.86 + 0.14 * ring), wb = WOOD[2] * col * (0.8 + 0.2 * ring);
    if (pa > cut && D > 0.002) {
      var din = pa - cut, oy = hw * din / D;
      // upper face (faces down and out), lower face (faces up and out)
      for (var face = 0; face < 2; face++) {
        var upper = face === 0;
        var ny0 = upper ? -1 : 1, na = kk;
        var nX = (na * AX) / kl, nY = ny0 / kl, nZ = (na * AZ) / kl;
        tnrm(nX, nY, nZ, upper);
        var fnx = _tx, fny = _ty, fnz = _tz;
        txf(lx, HC + (upper ? oy : -oy), lz, upper);
        project(_tx, _ty, _tz); if (!_ok) continue;
        shade(fnx, fny, fnz, wr, wg, wb, 0.62, 0.38, 0.3);
        plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_TREE);
      }
    } else if (parted) {
      for (var f2 = 0; f2 < 2; f2++) {
        var up2 = f2 === 0;
        tnrm(0, up2 ? -1 : 1, 0, up2);
        var qx = _tx, qy = _ty, qz = _tz;
        txf(lx, HC, lz, up2);
        if ((CX - _tx) * qx + (CY - _ty) * qy + (CZ - _tz) * qz < 0) continue;
        project(_tx, _ty, _tz); if (!_ok) continue;
        shade(qx, qy, qz, wr * 0.9, wg * 0.85, wb * 0.8, 0.55, 0.35, 0.3);
        plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_TREE);
      }
    }
  }
}

function drawBranches() {
  var g = G, s = S, x = s.bX, cw = g.cw, ch = g.ch, W = g.w, H = g.h;
  if (s.dis > 0.6) return;
  for (var i = 0; i < NBR; i++) {
    for (var n = 0; n < NN - 1; n++) {
      var k0 = (i * NN + n) * 3, k1 = k0 + 3;
      txf(x[k0], x[k0 + 1], x[k0 + 2], true);
      project(_tx, _ty, _tz); if (!_ok) continue;
      var ax = _sx, ay = _sy, az = _vz, ash = _sh;
      txf(x[k1], x[k1 + 1], x[k1 + 2], true);
      project(_tx, _ty, _tz); if (!_ok) continue;
      var bx = _sx, by = _sy, bz = _vz;
      var r0 = s.bRad[i * NN + n] * GS * ash, r1 = s.bRad[i * NN + n + 1] * GS * ash;
      var code = lineGlyph(bx - ax, by - ay);
      var steps = Math.floor(Math.max(Math.abs(bx - ax) / cw, Math.abs(by - ay) / ch) * 1.5) + 2;
      if (steps > 300) continue;
      var lit = 0.5 + 0.5 * clamp(-(bx - ax) * 0.0 + 0.4, 0, 1);
      for (var j = 0; j < steps; j++) {
        var f = j / (steps - 1);
        var sx = ax + (bx - ax) * f, sy = ay + (by - ay) * f, sz = az + (bz - az) * f, rr = r0 + (r1 - r0) * f;
        var c0 = Math.floor((sx - rr) / cw), c1 = Math.floor((sx + rr) / cw);
        var rA = Math.floor((sy - rr) / ch), rB = Math.floor((sy + rr) / ch);
        if (c1 - c0 > 8) { c0 = Math.floor(sx / cw) - 4; c1 = c0 + 8; }
        if (rB - rA > 5) { rA = Math.floor(sy / ch) - 2; rB = rA + 5; }
        for (var rr2 = rA; rr2 <= rB; rr2++) {
          if (rr2 < 0 || rr2 >= H) continue;
          for (var cc = c0; cc <= c1; cc++) {
            if (cc < 0 || cc >= W) continue;
            var id = rr2 * W + cc;
            if (!(sz < g.zbuf[id])) continue;
            var edge = c1 > c0 ? (cc === c0 ? -1 : cc === c1 ? 1 : 0) : 0;
            var sunL = edge !== 0 && edge * (LX * RX + LZ * RZ) > 0 ? 1 : 0;
            g.chars[id] = c1 - c0 >= 2 && !edge ? 37 : code;
            var m = 0.55 + 0.25 * lit;
            g.r[id] = BARK[0] * m + 0.6 * sunL; g.gg[id] = BARK[1] * m + 0.38 * sunL; g.b[id] = BARK[2] * m + 0.12 * sunL;
            g.owner[id] = O_TREE; g.zbuf[id] = sz;
          }
        }
      }
    }
  }
}

var LEAF_R = codes('&%@8#*oa;:,.');
function drawLeaves() {
  // each clump: a sphere ray-cast per cell, with a scalloped edge and holes the light comes through
  var s = S, g = G, x = s.bX, nc = s.nc, dis = s.dis, W = g.w, H = g.h, cw = g.cw, ch = g.ch, i;
  var nLR = LEAF_R.length - 1;
  for (var c = 0; c < nc; c++) {
    if (dis > 0 && hash01(c, 7.7) < dis) continue;
    var k = s.cNode[c] * 3;
    txf(x[k], x[k + 1], x[k + 2], true);
    project(_tx, _ty, _tz); if (!_ok) continue;
    var sx = _sx, sy = _sy, vz = _vz, rw = s.cRad[c] * GS, R = rw * _sh, Ry = R * 0.82;
    if (R < 0.5) continue;
    tnrm(s.cGX[c], s.cGY[c], s.cGZ[c], true);
    var gx = _tx, gy = _ty, gz = _tz;
    var c0 = Math.max(0, Math.floor((sx - R) / cw)), c1 = Math.min(W - 1, Math.floor((sx + R) / cw));
    var r0 = Math.max(0, Math.floor((sy - Ry) / ch)), r1 = Math.min(H - 1, Math.floor((sy + Ry) / ch));
    var pal = LEAFC[s.cPal[c]], alt = LEAFC[(s.cPal[c] + 1) & 3];
    for (var r = r0; r <= r1; r++) {
      var qy = ((r + 0.5) * ch - sy) / Ry;
      for (var cc = c0; cc <= c1; cc++) {
        var qx = ((cc + 0.5) * cw - sx) / R, d2 = qx * qx + qy * qy;
        if (d2 >= 1) continue;
        // a leafy, ragged rim: a lobe per sector, plus holes
        var lob = 0.80 + 0.2 * Math.sin(Math.atan2(qy, qx) * 7 + c * 1.7 + 0.5 * Math.sin(s.t * 1.3 + c));
        if (d2 > lob * lob) continue;
        var hq = hash01(Math.floor(qx * 5 + c * 3.1), Math.floor(qy * 5 + c * 1.7));
        if (hq < 0.2 && d2 > 0.1) continue;
        var qz = Math.sqrt(1 - d2), z = vz - qz * rw;
        var id = r * W + cc;
        if (!(z < g.zbuf[id])) continue;
        var nx = qx * RX - qy * UX - qz * FX, ny = qx * RY - qy * UY - qz * FY, nz = qx * RZ - qy * UZ - qz * FZ;
        nx = nx * 0.6 + gx * 0.4; ny = ny * 0.6 + gy * 0.4; nz = nz * 0.6 + gz * 0.4;
        var nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        var hc = hash01(cc * 0.37 + c, r * 0.91);
        var col = hc > 0.78 ? alt : pal;
        var fine = 0.8 + 0.4 * hq;
        shade(nx, ny, nz, col[0] * fine, col[1] * fine, col[2] * fine, 0.06, 0.9, 1.0);
        var li = (clamp(_cl + (hq - 0.5) * 0.35, 0, 1) * nLR + 0.5) | 0;
        g.chars[id] = LEAF_R[nLR - li]; g.r[id] = _cr; g.gg[id] = _cg; g.b[id] = _cb;
        g.owner[id] = O_LEAF; g.zbuf[id] = z;
      }
    }
  }
}

// ---- drawing: the man ---------------------------------------------------------------
var _mr = 0, _mg = 0, _mb = 0;
function matColor(mat, t, j, na, len) {
  var c;
  if (mat === M_SHIRT || mat === M_TORSO || mat === M_ARM) {
    if (mat === M_ARM && t > 0.55) c = SKIN;       // rolled sleeves
    else if (mat === M_TORSO && t < 0.1) c = BELT;
    else {
      var a = Math.floor(t * len * 9) & 1, b = Math.floor(j * 6 / na) & 1;
      c = a && b ? SHIRT_D : (a || b) ? SHIRT_M : SHIRT;
    }
  } else if (mat === M_JEANS) c = JEANS;
  else if (mat === M_SKIN) c = SKIN;
  else if (mat === M_BOOT) c = BOOT;
  else c = GLOVE;
  _mr = c[0]; _mg = c[1]; _mb = c[2];
}
function capsule(a, b, ra, rb, mat, T, capA, capB) {
  var ax = J[a * 3], ay = J[a * 3 + 1], az = J[a * 3 + 2];
  var dx = J[b * 3] - ax, dy = J[b * 3 + 1] - ay, dz = J[b * 3 + 2] - az;
  var len = Math.hypot(dx, dy, dz) || 1e-6, ux = dx / len, uy = dy / len, uz = dz / len;
  // a basis round the axis
  var hx = 0, hy = 1, hz = 0;
  if (Math.abs(uy) > 0.9) { hx = 1; hy = 0; }
  var p1x = uy * hz - uz * hy, p1y = uz * hx - ux * hz, p1z = ux * hy - uy * hx, pl = Math.hypot(p1x, p1y, p1z);
  p1x /= pl; p1y /= pl; p1z /= pl;
  var p2x = uy * p1z - uz * p1y, p2y = uz * p1x - ux * p1z, p2z = ux * p1y - uy * p1x;
  var n = T.n, na = T.na;
  for (var k = 0; k < n; k++) {
    var t = T.t[k], c = T.c[k], s = T.s[k];
    var nx = c * p1x + s * p2x, ny = c * p1y + s * p2y, nz = c * p1z + s * p2z;
    var rr = ra + (rb - ra) * t;
    var px = ax + dx * t + nx * rr, py = ay + dy * t + ny * rr, pz = az + dz * t + nz * rr;
    if ((CX - px) * nx + (CY - py) * ny + (CZ - pz) * nz < 0) continue;
    project(px, py, pz); if (!_ok) continue;
    matColor(mat, t, T.j[k], na, len);
    shade(nx, ny, nz, _mr, _mg, _mb, 0.64, 0.34, 0.4);
    plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_MAN);
  }
  var P = G.sph;
  if (capA || capB) for (k = 0; k < P.n; k++) {
    var qx = P.x[k], qy = P.y[k], qz = P.z[k], dd = qx * ux + qy * uy + qz * uz;
    var atB = dd > 0;
    if (atB ? !capB : !capA) continue;
    var r2 = atB ? rb : ra, ox = atB ? ax + dx : ax, oy = atB ? ay + dy : ay, oz = atB ? az + dz : az;
    var px2 = ox + qx * r2, py2 = oy + qy * r2, pz2 = oz + qz * r2;
    if ((CX - px2) * qx + (CY - py2) * qy + (CZ - pz2) * qz < 0) continue;
    project(px2, py2, pz2); if (!_ok) continue;
    matColor(mat === M_ARM ? M_SKIN : mat, atB ? 1 : 0, 0, 1, len);
    shade(qx, qy, qz, _mr, _mg, _mb, 0.64, 0.34, 0.4);
    plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_MAN);
  }
}
function sphere(j, rad0, mat) {
  var P = G.sph, cx = J[j * 3], cy = J[j * 3 + 1], cz = J[j * 3 + 2];
  for (var k = 0; k < P.n; k++) {
    var qx = P.x[k], qy = P.y[k], qz = P.z[k];
    var px = cx + qx * rad0, py = cy + qy * rad0, pz = cz + qz * rad0;
    if ((CX - px) * qx + (CY - py) * qy + (CZ - pz) * qz < 0) continue;
    project(px, py, pz); if (!_ok) continue;
    matColor(mat, 0, 0, 1, 1);
    shade(qx, qy, qz, _mr, _mg, _mb, 0.64, 0.34, 0.4);
    plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_MAN);
  }
}
function head() {
  // a beanie, a big beard, a face turned to whatever he is looking at
  var P = G.head, hx = J[JH * 3], hy = J[JH * 3 + 1], hz = J[JH * 3 + 2], R = 0.135;
  var fx = HEADF[0], fy = HEADF[1], fz = HEADF[2];
  var upx = -fx * fy, upy = 1 - fy * fy, upz = -fz * fy, ul = Math.hypot(upx, upy, upz) || 1;
  upx /= ul; upy /= ul; upz /= ul;
  for (var k = 0; k < P.n; k++) {
    var qx = P.x[k], qy = P.y[k], qz = P.z[k];
    var dUp = qx * upx + qy * upy + qz * upz, dF = qx * fx + qy * fy + qz * fz;
    var r = R, c;
    if (dUp > 0.28) { c = dUp < 0.42 ? HAT_D : HAT; r = R * 1.07; }
    else if (dF > 0.15 && dUp < -0.08) { c = BEARD; r = R * (1.0 + 0.22 * clamp(-dUp, 0, 1) * dF); }
    else if (dF > 0.1) c = SKIN;
    else if (dUp < -0.2) c = BEARD;
    else c = HAIR;
    var px = hx + qx * r, py = hy + qy * r - (c === BEARD ? 0.02 * clamp(-dUp, 0, 1) : 0), pz = hz + qz * r;
    if ((CX - px) * qx + (CY - py) * qy + (CZ - pz) * qz < 0) continue;
    project(px, py, pz); if (!_ok) continue;
    shade(qx, qy, qz, c[0], c[1], c[2], 0.66, 0.34, 0.4);
    plot(_sx, _sy, _vz, LUM_LUT[(_cl * 1024) | 0], _cr, _cg, _cb, O_MAN);
  }
  // the beanie's pom-pom
  var tx = hx + upx * R * 1.12, ty = hy + upy * R * 1.12, tz = hz + upz * R * 1.12;
  project(tx, ty, tz);
  if (_ok) plot(_sx, _sy, _vz - 0.05, 64, 1.0, 0.62, 0.15, O_MAN);
}
function drawAxe(t) {
  var s = S;
  // the handle: two strokes of hickory, then a red head with a bright bit
  var kx = J[JKNOB * 3], ky = J[JKNOB * 3 + 1], kz = J[JKNOB * 3 + 2];
  var ax = J[JAXE * 3], ay = J[JAXE * 3 + 1], az = J[JAXE * 3 + 2];
  var hl = clamp(-((ax - kx) * LX + (ay - ky) * LY + (az - kz) * LZ), 0, 1);
  stroke3(kx, ky, kz, ax, ay, az, HANDLE[0], HANDLE[1] * (0.85 + 0.15 * hl), HANDLE[2], O_AXE, 0.02);
  var bx = J[JBIT * 3], by = J[JBIT * 3 + 1], bz = J[JBIT * 3 + 2], ox = J[JPOLL * 3], oy = J[JPOLL * 3 + 1], oz = J[JPOLL * 3 + 2];
  var hdx = (ax - kx) / LH, hdy = (ay - ky) / LH, hdz = (az - kz) / LH;
  var n = AXN, glint = clamp(Math.abs(n[0] * LX + n[1] * LY + n[2] * LZ), 0, 1);
  for (var i = 0; i <= 10; i++) {
    var f = i / 10;
    var px = ox + (bx - ox) * f, py = oy + (by - oy) * f, pz = oz + (bz - oz) * f;
    var hh = 0.035 + 0.06 * f * f;                      // the blade flares toward the bit
    for (var j = -2; j <= 2; j++) {
      var e = j / 2 * hh;
      project(px + hdx * e, py + hdy * e, pz + hdz * e); if (!_ok) continue;
      var bit = f > 0.78;
      var col = bit ? BIT : AXEH, m = bit ? 0.75 + 0.5 * glint : 0.6 + 0.5 * glint;
      plot(_sx, _sy, _vz - 0.03, bit ? 35 : 64, Math.min(col[0] * m, 1), Math.min(col[1] * m, 1), Math.min(col[2] * m, 1), O_AXE);
    }
  }
  // a smear of steel behind the head when it is fast
  if (s.sw === 1 && s.swT > T_W + T_H && s.swT < T_W + T_H + T_S + 0.02) {
    var u = clamp((s.swT - T_W - T_H) / T_S, 0, 1);
    var cx = J[JC * 3], cy = J[JC * 3 + 1], cz = J[JC * 3 + 2];
    var rx = bx - cx, ry = by - cy, rz = bz - cz;
    // the arc it came along: rotate the bit back about the swing plane's normal
    for (var g2 = 1; g2 <= 7; g2++) {
      var back = g2 * 0.16 * (0.4 + u), cb = Math.cos(back), sb = Math.sin(back);
      var dot = rx * n[0] + ry * n[1] + rz * n[2];
      var crx = n[1] * rz - n[2] * ry, cry = n[2] * rx - n[0] * rz, crz = n[0] * ry - n[1] * rx;
      var qx = rx * cb + crx * sb + n[0] * dot * (1 - cb), qy = ry * cb + cry * sb + n[1] * dot * (1 - cb), qz = rz * cb + crz * sb + n[2] * dot * (1 - cb);
      project(cx + qx, cy + qy, cz + qz); if (!_ok) continue;
      var fade = (1 - g2 / 8) * 0.9;
      plot(_sx, _sy, _vz + 0.05, g2 < 3 ? 61 : 126, 0.85 * fade, 0.92 * fade, 1.0 * fade, O_FX);
    }
  }
}
function drawMan(t) {
  var g = G;
  // legs
  capsule(JIL, JKL, 0.10, 0.088, M_JEANS, g.cylS, true, true);
  capsule(JKL, JAL, 0.082, 0.07, M_JEANS, g.cylS, false, true);
  capsule(JIR, JKR, 0.10, 0.088, M_JEANS, g.cylS, true, true);
  capsule(JKR, JAR, 0.082, 0.07, M_JEANS, g.cylS, false, true);
  capsule(JAL, JTL, 0.075, 0.066, M_BOOT, g.cylS, true, true);
  capsule(JAR, JTR, 0.075, 0.066, M_BOOT, g.cylS, true, true);
  capsule(JIL, JIR, 0.135, 0.135, M_JEANS, g.cylS, true, true);
  // torso, shoulders, neck, head
  capsule(JP, JC, 0.18, 0.21, M_TORSO, g.cylL, false, false);
  capsule(JSL, JSR, 0.12, 0.12, M_SHIRT, g.cylS, true, true);
  capsule(JC, JN, 0.07, 0.065, M_SKIN, g.cylS, false, false);
  head();
  // arms and gloves
  capsule(JSL, JEL, 0.08, 0.07, M_SHIRT, g.cylS, false, true);
  capsule(JEL, JHL, 0.066, 0.056, M_ARM, g.cylS, false, false);
  capsule(JSR, JER, 0.08, 0.07, M_SHIRT, g.cylS, false, true);
  capsule(JER, JHR, 0.066, 0.056, M_ARM, g.cylS, false, false);
  sphere(JHL, 0.062, M_GLOVE);
  sphere(JHR, 0.062, M_GLOVE);
  drawAxe(t);
}
function outline() {
  // the man's silhouette gets its own edge, lit on the sun's side
  var g = G, W = g.w, H = g.h, o = g.owner;
  var sunLeft = (LX * RX + LZ * RZ) < 0;
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var id = y * W + x;
      if (o[id] !== O_MAN) continue;
      var up = o[id - W] !== O_MAN && o[id - W] !== O_AXE, dn = o[id + W] !== O_MAN && o[id + W] !== O_AXE;
      var lf = o[id - 1] !== O_MAN && o[id - 1] !== O_AXE, rt = o[id + 1] !== O_MAN && o[id + 1] !== O_AXE;
      if (!(up || dn || lf || rt)) continue;
      var e = up ? C_DASH : dn ? 95 : lf ? 40 : 41;
      if (lf && up) e = C_SL; else if (rt && up) e = C_BS; else if (lf && dn) e = C_BS; else if (rt && dn) e = C_SL;
      var sunEdge = sunLeft ? (lf || up) : (rt || up);
      if (sunEdge) { g.r[id] = Math.min(g.r[id] * 0.6 + 0.85, 1); g.gg[id] = Math.min(g.gg[id] * 0.6 + 0.58, 1); g.b[id] = Math.min(g.b[id] * 0.6 + 0.22, 1); }
    }
  }
}

// ---- particles, motes, rays -----------------------------------------------------------
function drawParticles(t) {
  var s = S, g = G;
  for (var i = 0; i < NP; i++) {
    var k = s.pK[i];
    if (!k) continue;
    project(s.pX[i], s.pY[i], s.pZ[i]); if (!_ok) continue;
    var age = s.pAge[i], life = s.pLife[i], fade = clamp((life - age) / 1.2, 0, 1), code, m = 1;
    var sid = Math.floor(_sy / g.ch) * g.w + Math.floor(_sx / g.cw);
    var beam = sid >= 0 && sid < g.w * g.h ? g.shaft[sid] : 0;
    if (k === K_CHIP) {
      code = s.pRest[i] ? (s.pS[i] > 50 ? 44 : 46) : CHIP_G[((age * 18 + s.pS[i]) | 0) % CHIP_G.length];
      m = s.pRest[i] ? 0.55 : 1.15;
    } else if (k === K_LEAF) {
      code = s.pRest[i] ? 44 : LEAF_G[((age * 4 + s.pS[i]) | 0) % LEAF_G.length];
      m = 0.9 + 0.6 * beam;
    } else if (k === K_DUST) {
      var u = age / life;
      code = DUST_G[Math.min(DUST_G.length - 1, (u * DUST_G.length) | 0)];
      m = (0.55 + 0.9 * beam) * (1 - u * 0.6);
    } else {
      code = (age * 10 | 0) & 1 ? 42 : 43;
      m = 1.2;
    }
    m *= fade;
    plot(_sx, _sy, _vz - 0.02, code, Math.min(s.pR[i] * m, 1), Math.min(s.pG[i] * m, 1), Math.min(s.pB[i] * m, 1), O_FX);
  }
  // dust motes and pollen: specks that glint where a sunbeam crosses them
  var W = g.w, H = g.h;
  for (i = 0; i < g.nm; i++) {
    var ph = g.mP[i];
    var x = g.mX[i] + 0.25 * Math.sin(0.21 * t + ph) + 0.08 * s.windX, y = g.mY[i] + 0.15 * Math.sin(0.33 * t + ph * 1.7), z = g.mZ[i] + 0.2 * Math.cos(0.17 * t + ph);
    project(x, y, z); if (!_ok) continue;
    var c = Math.floor(_sx / g.cw), r = Math.floor(_sy / g.ch);
    if (c < 0 || c >= W || r < 0 || r >= H) continue;
    var id = r * W + c;
    if (!(_vz < g.zbuf[id])) continue;
    var L = g.shaft[id], tw = 0.5 + 0.5 * Math.sin(t * (1.3 + (ph % 1.7)) + ph);
    var b = (0.12 + 1.1 * L) * (0.5 + 0.5 * tw);
    if (b < 0.1) continue;
    g.chars[id] = b > 0.75 ? 42 : b > 0.4 ? 43 : 46;
    g.r[id] = Math.min(1.0 * b, 1); g.gg[id] = Math.min(0.82 * b, 1); g.b[id] = Math.min(0.45 * b, 1);
    g.owner[id] = O_FX; g.zbuf[id] = _vz;
  }
}

var BEAMS = [0.06, 0.27, 0.46, 0.68, 0.9];
function computeShafts(t) {
  var g = G, W = g.w, H = g.h, cw = g.cw, ch = g.ch, lit = g.shaft;
  lit.fill(0);
  var sdx = LX * RX + LY * RY + LZ * RZ, sdy = LX * UX + LY * UY + LZ * UZ;
  var slope = clamp(-sdx / Math.max(sdy, 0.2), -0.85, 0.85);
  G.slope = slope;
  var yaw = Math.atan2(CX - S.camTX, CZ - S.camTZ);
  var k = g.PW / 1000;
  for (var bi = 0; bi < BEAMS.length; bi++) {
    var foot = g.PW * BEAMS[bi] - slope * g.PH * 0.35 + 0.35 * g.PW * Math.sin(yaw * 1.3 + bi) + 22 * k * Math.sin(0.23 * t + 1.7 * bi);
    var wide = (26 + 22 * (0.5 + 0.5 * Math.sin(0.31 * t + 2.3 * bi))) * Math.max(k, 0.5);
    var amp = 0.55 + 0.45 * Math.sin(0.4 * t + 1.1 * bi);
    for (var r = 0; r < H; r++) {
      var cy = (r + 0.5) * ch, lean = foot + slope * cy;
      var cA = Math.max(Math.floor((lean - 3 * wide) / cw), 0), cB = Math.min(Math.ceil((lean + 3 * wide) / cw), W - 1);
      var fall = clamp(1.25 - cy / g.PH, 0.25, 1);
      for (var c = cA; c <= cB; c++) {
        var q = ((c + 0.5) * cw - lean) / wide;
        lit[r * W + c] += amp * fall * Math.exp(-q * q);
      }
    }
  }
}
function applyShafts() {
  var g = G, W = g.w, H = g.h, lit = g.shaft;
  var code = Math.abs(g.slope) < 0.25 ? C_PIPE : g.slope > 0 ? C_BS : C_SL;
  for (var r = 0; r < H; r++) {
    for (var c = 0; c < W; c++) {
      var id = r * W + c, L = lit[id];
      if (L < 0.04) continue;
      if (g.chars[id] === 0 || g.owner[id] === O_BG) {
        if (g.chars[id] === 0 && L > 0.4 && (r * 3 + c) % 7 === 0) {
          g.chars[id] = code; g.r[id] = 0.42 * L; g.gg[id] = 0.30 * L; g.b[id] = 0.12 * L;
        } else if (g.chars[id] !== 0) { var m0 = 1 + 1.2 * L; g.r[id] = Math.min(g.r[id] * m0 + 0.08 * L, 1); g.gg[id] = Math.min(g.gg[id] * m0 + 0.05 * L, 1); g.b[id] = Math.min(g.b[id] * m0, 1); }
        continue;
      }
      var m = 1 + 0.55 * L;
      g.r[id] = Math.min(g.r[id] * m + 0.05 * L, 1); g.gg[id] = Math.min(g.gg[id] * m + 0.03 * L, 1); g.b[id] = Math.min(g.b[id] * m, 1);
    }
  }
}

// ---- input --------------------------------------------------------------------------
function onWheel(e) {
  if (state.currentMode !== MODE) return;
  e.preventDefault();
  userZoom = clamp(userZoom * Math.exp(-e.deltaY * 0.0012), 0.6, 2.2);
  if (S) S.lastInput = state.time;
}
function onTouchStart(e) {
  if (state.currentMode !== MODE || e.touches.length < 2) return;
  pinch0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  pinchZ0 = userZoom; pinchUntil = state.time + 0.5;
}
function onTouchMove(e) {
  if (state.currentMode !== MODE || e.touches.length < 2 || pinch0 <= 0) return;
  var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  userZoom = clamp(pinchZ0 * d / pinch0, 0.6, 2.2);
  pinchUntil = state.time + 0.5;
  if (S) S.lastInput = state.time;
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
function tapAt(px, py) {
  var s = S, g = G;
  s.lastInput = state.time;
  var c = Math.floor(px / g.cw), r = Math.floor(py / g.ch);
  if (s.tree === 'down') {
    // the fallen trunk or the stump: a new tree
    var hit = false;
    for (var dy = -2; dy <= 2 && !hit; dy++) for (var dx = -3; dx <= 3 && !hit; dx++) {
      var cc = c + dx, rr = r + dy;
      if (cc < 0 || cc >= g.w || rr < 0 || rr >= g.h) continue;
      var o = g.owner[rr * g.w + cc];
      if (o === O_TREE || o === O_LEAF) hit = true;
    }
    if (hit) { s.tree = 'dissolve'; s.tt = 0; return; }
  }
  if (s.tree === 'dissolve') return;
  startSwing();
}

// ---- lifecycle ----------------------------------------------------------------------
var FONT_K = 0.62, WEIGHT = 0.08, GAIN = 1.3;
function initTimber() {
  state.GLYPH_WEIGHT = WEIGHT;
  var fk = state.isMobile ? FONT_K : 0.52;
  if (state.FONT_SCALE !== fk) { state.FONT_SCALE = fk; resize(); }
  G = buildTables();
  if (!S) S = newSim();
  ensureGrass();
  S.lastT = state.time;
  listen(true);
  // test hook (screenshot harness): what the scene is doing, and a way to fast-forward
  window.__timber = function (cmd) {
    if (cmd === 'hits' && S) { S.hits = NHITS - 1; S.depth = S.depthT = (NHITS - 1) / NHITS; }
    return S && { tree: S.tree, hits: S.hits, alpha: +S.alpha.toFixed(3), swing: S.sw, chops: S.chops, yaw: +S.camYaw.toFixed(2), userYaw: +S.userYaw.toFixed(2), cols: G && G.w, rows: G && G.h };
  };
}
function cleanupTimber() {
  state.GLYPH_WEIGHT = 0;
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  listen(false);
  G = null; S = null; userZoom = 1;
}

function text(s, x, y, r, gg, b, a) {
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c !== 32 && x + i >= 0 && x + i < G.w) drawChar(s[i], x + i, y, r, gg, b, a);
  }
}
var CH = [];
for (var ci = 0; ci < 128; ci++) CH[ci] = String.fromCharCode(ci);

function camera(dt) {
  var s = S, g = G;
  var asp = g.PW / g.PH, port = clamp((1.05 - asp) / 0.5, 0, 1);
  var spanW = 2.15, spanH = mix(5.0, 7.0, port), d0 = 4.6;
  var f0 = Math.min(g.PW / spanW, g.PH / spanH) * d0;
  // the shot this moment wants
  var tx = -0.72, ty = mix(1.45, 2.0, port), tz = 0.15;
  var yaw = -0.22 + 0.2 * Math.sin(0.11 * s.t), pitch = -0.2, d = d0, tau = 0.9;
  var fall = s.tree === 'fall' || s.tree === 'down' || s.tree === 'creak';
  if (s.tree === 'creak') { ty += 0.5; d *= 0.92; pitch = -0.3; tau = 0.6; }
  if (fall) {
    var e = s.tree === 'creak' ? 0.15 : ease(s.alpha / ALAND);
    var fx = -AX, fz = -AZ;
    var yawF = port > 0.5 ? -0.78 : 0.62;
    var dF = port > 0.5 ? 9.2 : Math.max(d0 * 1.25, 9.0 * f0 / g.PW);
    tx = mix(tx, HA * AX + fx * 2.2, e); tz = mix(tz, HA * AZ + fz * 2.2, e); ty = mix(ty, port > 0.5 ? 1.9 : 1.3, e);
    yaw = mix(yaw, yawF + 0.08 * Math.sin(0.2 * s.t), ease(s.tree === 'creak' ? s.tt / 0.9 * 0.3 : 0.3 + 0.7 * e));
    d = mix(d, dF, e); pitch = mix(-0.3, -0.12, e);
    tau = 0.45;
    if (s.tree === 'down') tau = 1.4;
  }
  if (!s.primed) { s.camTX = tx; s.camTY = ty; s.camTZ = tz; s.camYaw = yaw; s.camPitch = pitch; s.camD = d; s.primed = true; }
  var k = 1 - Math.exp(-dt / tau);
  s.camTX += (tx - s.camTX) * k; s.camTY += (ty - s.camTY) * k; s.camTZ += (tz - s.camTZ) * k;
  s.camYaw += (yaw - s.camYaw) * k; s.camPitch += (pitch - s.camPitch) * k; s.camD += (d - s.camD) * k;
  // user orbit eases back after a while
  s.dragIdle += dt;
  if (s.dragIdle > 6) { var kb = 1 - Math.exp(-dt / 2.5); s.userYaw -= s.userYaw * kb; s.userPitch -= s.userPitch * kb; }
  var dd = s.camD * (1 - 0.07 * s.push) / userZoom;
  var sh = s.shake * s.shake;
  var jx = sh * 0.05 * Math.sin(s.t * 57), jy = sh * 0.06 * Math.sin(s.t * 71 + 1);
  setCamera(s.camTX + jx, s.camTY + jy, s.camTZ, s.camYaw + s.userYaw + 0.02 * s.push, clamp(s.camPitch + s.userPitch, -0.55, 0.75), dd);
  FPX = f0; OX = g.PW / 2; OY = g.PH / 2;
}

function renderTimber() {
  clearCanvas();
  if (!G || !S || G.w !== state.COLS || G.h !== state.ROWS || G.cw !== state.CHAR_W) initTimber();
  var g = G, s = S, W = g.w, H = g.h, n = W * H, i;

  // input: tap = swing (or a new tree on the fallen one); drag = orbit + wind
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    s.dragging = false;
    if (state.time > pinchUntil) tapAt(pointer.x, pointer.y - state.NAV_H);
  } else if (pointer.down && state.currentMode === MODE && pinch0 <= 0 && state.time > pinchUntil) {
    if (!s.dragging) { s.dragging = true; s.lastPX = pointer.x; s.lastPY = pointer.y; }
    var ddx = pointer.x - s.lastPX, ddy = pointer.y - s.lastPY;
    s.lastPX = pointer.x; s.lastPY = pointer.y;
    if (ddx !== 0 || ddy !== 0) {
      s.userYaw = clamp(s.userYaw - ddx / g.PW * 3.2, -2.6, 2.6);
      s.userPitch = clamp(s.userPitch + ddy / g.PH * 1.6, -0.35, 0.9);
      // and the drag blows through the canopy, across the screen
      var wv = ddx / Math.max(g.PW, 1) * 60;
      s.windX = clamp(s.windX + RX * wv, -3, 3); s.windZ = clamp(s.windZ + RZ * wv, -3, 3);
      s.dragIdle = 0; s.lastInput = state.time;
    }
  }
  if (!pointer.down) s.dragging = false;

  // fixed 60 Hz clock
  var now = state.time;
  if (now < s.lastT) s.lastT = now;
  var dt = Math.min(now - s.lastT, 0.1); s.lastT = now;
  s.acc += dt;
  var steps = 0;
  while (s.acc >= STEP && steps < 4) { simStep(); s.acc -= STEP; steps++; }
  if (s.acc > STEP) s.acc = 0;
  var t = s.t;

  camera(dt);
  GS = Math.max(s.gs, 0.001); HAg = HA * GS; HCg = HC * GS;
  var ang = s.alpha + s.wob * 0.3;
  CA = Math.cos(ang); SA = Math.sin(ang);
  if (Math.abs(ang) < 1e-5) SA = 0;
  SHK = clamp(1 - s.alpha / 0.5, 0, 1) * (1 - s.dis) * clamp(s.gs, 0, 1);
  poseMan();

  g.chars.fill(0); g.owner.fill(0); g.zbuf.fill(1e9);
  computeShafts(t);
  sky(t);
  forest();
  ground(t);
  grass(t);
  AMBK = 0.45; drawTrunk();
  drawBranches();
  AMBK = 0.28; drawLeaves();
  AMBK = 0.8; drawMan(t);
  outline();
  drawParticles(t);
  applyShafts();

  // paint
  var ccs = g.chars;
  for (i = 0; i < n; i++) {
    var c = ccs[i];
    if (!c) continue;
    var rr = g.r[i], gq = g.gg[i], bq = g.b[i], mx = rr > gq ? (rr > bq ? rr : bq) : (gq > bq ? gq : bq);
    var gain = mx * GAIN > 1 ? 1 / mx : GAIN;
    drawChar(CH[c], i % W, (i / W) | 0, (rr * gain * 255) | 0, (gq * gain * 255) | 0, (bq * gain * 255) | 0, 1);
  }
  // HUD
  var head1 = s.tree === 'fall' || s.tree === 'creak' ? 'TIMBER!' : s.tree === 'down' ? 'down. tap the trunk for a new tree' :
    s.tree === 'grow' || s.tree === 'dissolve' ? 'a new tree' : 'chops ' + s.hits + '/' + NHITS;
  var hot = s.tree === 'fall' || s.tree === 'creak';
  text(head1, 2, 1, hot ? 255 : 220, hot ? 200 : 170, hot ? 80 : 110, 0.95);
  var hint = state.isMobile ? 'tap: swing   drag: orbit + wind' : 'click: swing   drag: orbit + wind   scroll: zoom';
  if (W >= head1.length + hint.length + 8) text(hint, W - hint.length - 2, 1, 130, 120, 100, 0.85);
  else text(hint, 2, 2, 120, 110, 92, 0.8);
}

registerMode(MODE, { init: initTimber, render: renderTimber, cleanup: cleanupTimber });
