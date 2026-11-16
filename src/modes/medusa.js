import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// medusa: a 3D point-cloud jellyfish projected onto the character grid with
// a per-cell z-buffer, ported from dwcminh.ascii's jellyfish.py reel.
//   bell      : bell_shape/bell_pose. A rounded dome (u down from the crown,
//               theta round it) painted with PETALS radial stripes and a
//               scalloped LAPPETS rim. squeeze(t) is a swim stroke: it starts
//               at the crown and reaches the rim RIM_LAG later; it pulls the
//               rim in (tuck) and stretches the dome taller, then the bell
//               relaxes past rest and flares wide before settling.
//   oral arms : arm(): four frilly twisted ribbons, trailing the squeeze by
//               ARM_LAG per unit down the arm, pale at the ribbon edges
//   tentacles : tentacle(): thin strands from the rim, trailing by TENT_LAG
//   carry     : every part is placed relative to where the body WAS at its
//               own lagged time, so arms and tentacles trail each stroke
//   colour    : every beat sends a wave from the crown to the tentacle tips;
//               the front is white-hot and behind it the next palette
//   glints    : a ring of sparkles leaves the rim after every stroke
//   intro     : scattered dots assemble into the bell, then the arms unfurl
//               and the tentacles drop
// Tap: pulse + colour wave + a burst of sparks. Drag: it swims after you.

var MODE = 'medusa';
var TAU = Math.PI * 2;

var BELL_R = 1.0, BELL_H = 1.2, CURL = 1.68, FLARE = 0.10;
var LAPPETS = 16, PETALS = 6;
var RIM_LAG = 0.20, ARM_LAG = 0.55, TENT_LAG = 0.30;
var RIM_R = BELL_R * Math.pow(Math.sin(CURL), 0.9) * (1 + FLARE);
var SPIN = 0.16;
var N_TENT = 14, N_STRAND = 2, TENT_SEG = 110, TENT_LEN = 3.1, TENT_DROP = 1.4;
var N_ARMS = 4, ARM_S = 72, ARM_W = 9, ARM_LEN = 2.15, ARM_WIDE = 0.36;
var NU = 70, NTH = 200;
var PERIOD = 2.3, WAVE_SPEED = 0.78;
var T_SWIM = 2.3, T_ARMS0 = 1.5, T_ARMS1 = 3.3, T_TENT0 = 1.9, T_TENT1 = 3.3;
var GLINT_LIFE = 1.9, N_GLINTS = 16;
var HDT = 1 / 40, HN = 160;   // pose history: 4 s at 40 Hz

var BELL_HI = '#%&8B$@0Q#%8B$&@';
var BELL_MID = 'xrtjz{}[]<>uoneavc=+?';
var BELL_LO = ':;1il!|;:i1';
var BELL_FAINT = ".:',`-";
var ARM_CH = 'abcdeghjklmnoprstuvwxyz0123456789$%&#@?{}[]<>=+*~^';

// inks: [bell, petal, inside, arms, tentacles]; cooler + louder than the reel
var I_BELL = 0, I_PETAL = 1, I_IN = 2, I_ARM = 3, I_TENT = 4;
var PALETTES = [
  [[30, 90, 255], [215, 235, 255], [120, 70, 255], [165, 105, 255], [130, 185, 255]],   // blue / white
  [[0, 215, 240], [255, 50, 200], [150, 60, 255], [255, 85, 215], [70, 225, 255]],      // cyan / pink / purple
  [[255, 40, 185], [255, 235, 40], [165, 50, 255], [20, 230, 255], [255, 110, 215]],    // magenta / yellow, cyan arms
  [[20, 235, 120], [230, 255, 50], [0, 185, 235], [255, 145, 20], [100, 255, 195]],     // green / lime, orange arms
  [[140, 60, 255], [40, 245, 255], [255, 50, 190], [120, 255, 120], [185, 135, 255]],   // violet / aqua
  [[0, 130, 255], [255, 95, 40], [0, 220, 220], [255, 230, 60], [110, 200, 255]],       // electric blue / tangerine
];

var K_NONE = 0, K_BELL = 1, K_RIM = 2, K_ARM = 3, K_ARME = 4, K_TENT = 5, K_BG = 6, K_SPARK = 7, K_DOT = 8;

var M = null;     // geometry tables + buffers (rebuilt on resize)
var S = null;     // simulation state (survives resize)

function hash(n) {
  var s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

function buildTables() {
  var W = state.COLS, H = state.ROWS, n = W * H;
  var m = {
    w: W, h: H, cw: state.CHAR_W, ch: state.CHAR_H,
    zbuf: new Float32Array(n), kind: new Uint8Array(n), lum: new Float32Array(n),
    way: new Float32Array(n), ink: new Uint8Array(n), dep: new Float32Array(n),
    gch: new Uint16Array(n), edge: new Uint8Array(n),
  };
  // bell_shape(u, th): the part of the bell that never changes
  var nb = NU * NTH;
  m.bWide = new Float32Array(nb); m.bTall = new Float32Array(nb);
  m.bTh = new Float32Array(nb); m.bPet = new Uint8Array(nb);
  m.bSeed = new Float32Array(nb); m.bSx = new Float32Array(nb); m.bSy = new Float32Array(nb);
  m.uU = new Float32Array(NU); m.uFlare = new Float32Array(NU); m.uTuck = new Float32Array(NU);
  m.uSa = new Float32Array(NU); m.uCa = new Float32Array(NU);
  var cC = Math.cos(CURL);
  var pw = W * m.cw, ph = H * m.ch;
  for (var i = 0; i < NU; i++) {
    var u = i / (NU - 1), a = u * CURL;
    m.uU[i] = u; m.uFlare[i] = FLARE * Math.pow(u, 8); m.uTuck[i] = 0.34 * Math.pow(u, 1.6);
    m.uSa[i] = Math.sin(a); m.uCa[i] = Math.cos(a);
    var wide0 = BELL_R * Math.pow(Math.sin(a), 0.9);
    var tall = BELL_H * (Math.cos(a) - cC) / (1 - cC);
    // the petals: wedges from just under the crown, fading out above the rim band
    var pLo = 0.07, pHi = 0.84;
    for (var j = 0; j < NTH; j++) {
      var k = i * NTH + j;
      var th = (j + (i & 1) * 0.5) / NTH * TAU;   // stagger rings so samples don't stack in columns
      m.bTh[k] = th;
      m.bWide[k] = wide0 * (1 + 0.06 * Math.pow(u, 6) * Math.cos(LAPPETS * th));
      m.bTall[k] = tall;
      var pc = Math.cos(PETALS * th + 0.12 * u);   // radial wedges, a slight swirl down the dome
      var inPetal = pc > -0.05 && u > pLo && u < pHi;
      if (u <= pLo) inPetal = true;                // a pale cap on the crown, as in the reel
      m.bPet[k] = inPetal ? 1 : 0;
      m.bSeed[k] = hash(k * 1.7 + 3.1);
      m.bSx[k] = hash(k * 0.37 + 11.3) * pw;
      m.bSy[k] = hash(k * 0.91 + 5.7) * ph * 0.75;
    }
  }
  // tentacle constants
  m.tTh = new Float32Array(N_TENT); m.tPh = new Float32Array(N_TENT); m.tT0 = new Float32Array(N_TENT);
  for (var t = 0; t < N_TENT; t++) {
    m.tTh[t] = (t + 0.5) / N_TENT * TAU + (hash(t + 9) - 0.5) * 0.2;
    m.tPh[t] = hash(t * 7.7 + 2) * TAU;
    // TENT_T0: they drop one after another, in a shuffled order round the rim
    m.tT0[t] = T_TENT0 + (T_TENT1 - T_TENT0) * ((t * 5) % N_TENT) / (N_TENT - 1);
  }
  m.prevX = new Float32Array(Math.max(N_STRAND, ARM_W));
  m.prevY = new Float32Array(Math.max(N_STRAND, ARM_W));
  // layout: crown at about -1.15R (stretched), tentacle tips at about +3.2R
  var frac = state.isMobile || pw < 700 ? 0.80 : 0.86;
  m.R = Math.min(frac * ph / 4.8, 0.33 * pw);
  m.homeX = pw * 0.5;
  m.homeY = (ph - 4.8 * m.R) * 0.5 + 1.55 * m.R;
  m.strandGap = 1.0 * m.cw / m.R;
  // background
  var ns = Math.round(W * H / 26);
  m.stars = [];
  for (var s = 0; s < ns; s++) {
    m.stars.push({ x: Math.random() * W, y: Math.random() * H, v: 0.15 + Math.random() * 0.5,
      c: Math.random() < 0.22 ? '+' : '.', p: Math.random() * TAU, a: 0.18 + Math.random() * 0.3 });
  }
  m.minis = [];
  for (var q = 0; q < 3; q++) {
    m.minis.push({
      x: q === 1 ? W * 0.86 : W * (0.06 + 0.06 * q),
      y: q === 2 ? H * 0.82 : H * (0.25 + 0.4 * Math.random()),
      vy: -(0.25 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.3,
      ph: Math.random() * TAU,
      col: [[90, 150, 255], [255, 90, 190], [150, 100, 255]][q % 3],
    });
  }
  return m;
}

function initMedusa() {
  if (state.FONT_SCALE !== (state.isMobile ? 0.86 : 0.8)) {
    state.FONT_SCALE = state.isMobile ? 0.86 : 0.8;
    resize();
  }
  M = buildTables();
  if (!S || state.time < 0.05) {
    S = {
      lastT: state.time, t: 0,
      x: M.homeX, y: M.homeY, vx: 0, vy: 0, svx: 0, roll: 0,
      beats: [-99, -99, -99], nBeats: 0, nextBeat: T_SWIM,
      pal: 0, wave: null, colours: 0,
      sparks: [], nSparks: 0, swimT: -99, rings: [],
      hx: new Float32Array(HN), hy: new Float32Array(HN), hr: new Float32Array(HN),
      hHead: 0, hCount: 0, hT: 0,
    };
  } else {
    S.x = Math.min(Math.max(S.x, 0), M.w * M.cw);
    S.y = Math.min(Math.max(S.y, 0), M.h * M.ch);
    S.hCount = 0;
  }
}

function cleanupMedusa() {
  if (state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
  M = null; S = null;
}

// one stroke, by time since the beat: a quick contraction (the bell narrows
// and stretches), then a damped recoil that swings past rest (negative =
// the bell relaxes wide and flat) before settling
function stroke(a) {
  if (a <= 0) return 0;
  if (a < 0.36) { var k = a / 0.36; return k * k * (3 - 2 * k); }
  var r = a - 0.36;
  if (r > 3.2) return 0;
  return Math.exp(-1.5 * r) * Math.cos(4.3 * r);
}
function squeeze(td) {
  var b = S.beats, v = 0;
  for (var i = 0; i < 3; i++) v += stroke(td - b[i]);
  return v < -0.6 ? -0.6 : v > 1.15 ? 1.15 : v;
}

function beat(changeColour) {
  S.beats[0] = S.beats[1]; S.beats[1] = S.beats[2]; S.beats[2] = S.t;
  S.nBeats++;
  if (S.wave) S.pal = S.wave.nw;
  var nw = changeColour ? (S.pal + 1) % PALETTES.length : S.pal;
  if (changeColour) S.colours++;
  S.wave = { t0: S.t, old: S.pal, nw: nw, change: changeColour };
  S.rings.push({ t0: S.t + 0.30, seed: S.nBeats * 13.7 });
  if (S.rings.length > 4) S.rings.shift();
}

function spawnSparks(cx, cy, n, speed, col) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, sp = speed * (0.35 + 0.65 * Math.random());
    S.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5,
      life: 0, max: 1.2 + Math.random() * 1.1, col: col });
  }
  S.nSparks += n;
  if (S.sparks.length > 400) S.sparks.splice(0, S.sparks.length - 400);
}

// ---- splat helpers ------------------------------------------------------
var CW = 0, CH = 0, GW = 0, GH = 0;
var pX = 0, pY = 0, pZ = 0;
var cosP = 1, sinP = 0, cosR = 1, sinR = 0, cosY = 1, sinY = 0, OX = 0, OY = 0, SC = 1;
var PERSP = 0.2;

// carry(): pose the body as it was at time td (pose history, 40 Hz)
function carry(back) {
  var f = back / HDT;
  if (f < 0) f = 0;
  var maxB = S.hCount - 1;
  if (maxB < 1) { OX = S.x; OY = S.y; cosR = Math.cos(S.roll); sinR = Math.sin(S.roll); return; }
  if (f > maxB - 1) f = maxB - 1;
  var i0 = f | 0, fr = f - i0;
  var a = (S.hHead - i0 + HN) % HN, b = (S.hHead - i0 - 1 + HN) % HN;
  OX = S.hx[a] + (S.hx[b] - S.hx[a]) * fr;
  OY = S.hy[a] + (S.hy[b] - S.hy[a]) * fr;
  var rl = S.hr[a] + (S.hr[b] - S.hr[a]) * fr;
  cosR = Math.cos(rl); sinR = Math.sin(rl);
}

// model (R units, y down, z toward viewer) -> screen px in pX,pY and depth pZ
function project(x0, y, z0) {
  var x = x0 * cosY + z0 * sinY, z = z0 * cosY - x0 * sinY;   // camera yaw
  var y1 = y * cosP - z * sinP;
  var z1 = y * sinP + z * cosP;
  var x2 = x * cosR - y1 * sinR;
  var y2 = x * sinR + y1 * cosR;
  var persp = 1 / (1 - PERSP * z1);
  pX = OX + SC * x2 * persp;
  pY = OY + SC * y2 * persp;
  pZ = z1;
}

function put(px, py, z, kind, lum, way, ink, code) {
  var cx = (px / CW) | 0, cy = (py / CH) | 0;
  if (px < 0 || py < 0 || cx >= GW || cy >= GH) return;
  var idx = cy * GW + cx;
  if (z <= M.zbuf[idx]) return;
  M.zbuf[idx] = z; M.kind[idx] = kind; M.lum[idx] = lum; M.way[idx] = way;
  M.ink[idx] = ink; M.gch[idx] = code;
  var d = (z + 1.2) / 2.4; M.dep[idx] = d < 0 ? 0 : d > 1 ? 1 : d;
}

function strokeChar(dx, dy, flat) {
  var ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
  if (ax < 0.42 * ay) return 124;          // |
  if (ay < (flat ? 0.3 : 0.16) * ax) return flat || 45;  // rim '_', strands '-'
  return (dx * dy > 0) ? 92 : 47;          // \ or /
}

var LX = -0.7, LY = -0.6, LZ = 0.5;
(function () { var l = Math.hypot(LX, LY, LZ); LX /= l; LY /= l; LZ /= l; })();

function renderMedusa() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!M || !S || M.w !== W || M.h !== H || M.cw !== state.CHAR_W) initMedusa();
  W = M.w; H = M.h;

  var now = state.time;
  if (now < S.lastT) { S.lastT = now; }
  var dt = now - S.lastT; S.lastT = now;
  if (dt > 0.05) dt = 0.05;
  S.t += dt;
  var t = S.t, R = M.R;
  // stroke phase for the screenshot harness (seconds since the last beat)
  if (typeof window !== 'undefined') { window.__medusaPhase = S.nBeats ? t - S.beats[2] : -1; window.__medusaBeats = S.nBeats; }

  // ---- input -------------------------------------------------------------
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    beat(true);
    S.nextBeat = t + PERIOD;
    var pal = PALETTES[S.wave.nw];
    spawnSparks(pointer.gx, pointer.gy, 46, 16, pal[I_PETAL]);
    spawnSparks(pointer.gx, pointer.gy, 14, 9, pal[I_ARM]);
  } else if (pointer.down && state.currentMode === MODE) {
    // swim toward the finger: bell follows, strokes come faster
    var tx = pointer.gx * M.cw, ty = pointer.gy * M.ch + 0.45 * R;
    S.vx += (tx - S.x) * 2.6 * dt;
    S.vy += (ty - S.y) * 2.6 * dt;
    S.swimT = t;
    if (S.nextBeat - t > 1.2) S.nextBeat = t + 0.15;
  }

  // ---- beats + colour waves -------------------------------------------------
  if (t >= S.nextBeat) {
    beat(S.nBeats > 0);           // the first stroke is a white flash, then a new palette every beat
    S.nextBeat = t + (t - S.swimT < 0.5 ? 1.3 : PERIOD);
  }
  var wf = -9, wOld = S.pal, wNew = S.pal, bandAmp = 0.85;
  if (S.wave) {
    wf = (t - S.wave.t0) * WAVE_SPEED - 0.05;
    wOld = S.wave.old; wNew = S.wave.nw;
    bandAmp = S.wave.change ? 0.85 : 1.0;
    if (wf > 1.5) { S.pal = S.wave.nw; S.wave = null; wf = -9; wOld = wNew = S.pal; }
  }

  // ---- body motion ----------------------------------------------------------
  var homeX = M.homeX + Math.sin(t * 0.13) * 0.08 * W * M.cw;
  var homeY = M.homeY + Math.sin(t * 0.21) * 0.04 * H * M.ch;
  var spring = t - S.swimT < 1.5 ? 0.05 : 0.55;
  S.vx += (homeX - S.x) * spring * dt;
  S.vy += (homeY - S.y) * spring * dt + 0.22 * R * dt;  // slow sink between strokes
  // the power stroke: thrust while the bell is contracting
  var ab = t - S.beats[2];
  if (ab > 0.04 && ab < 0.55) S.vy -= 1.9 * R * Math.sin(Math.PI * (ab - 0.04) / 0.51) * dt;
  var damp = Math.exp(-1.7 * dt);
  S.vx *= damp; S.vy *= damp;
  S.x += S.vx * dt; S.y += S.vy * dt;
  var pw = W * M.cw, ph = H * M.ch;
  if (S.x < 0.15 * pw) { S.x = 0.15 * pw; S.vx *= -0.3; }
  if (S.x > 0.85 * pw) { S.x = 0.85 * pw; S.vx *= -0.3; }
  if (S.y < 1.5 * R + 4) { S.y = 1.5 * R + 4; S.vy *= -0.3; }
  if (S.y > ph - 0.6 * R) { S.y = ph - 0.6 * R; S.vy *= -0.3; }
  var kS = 1 - Math.exp(-2.2 * dt);
  S.svx += (S.vx - S.svx) * kS;
  var rollT = Math.max(-0.45, Math.min(0.45, S.svx / R * 0.35)) + 0.05 * Math.sin(t * 0.37);
  S.roll += (rollT - S.roll) * kS;
  // record the pose history that carry() reads
  if (S.hCount === 0) { S.hT = t; S.hx[0] = S.x; S.hy[0] = S.y; S.hr[0] = S.roll; S.hHead = 0; S.hCount = 1; }
  while (S.hT + HDT <= t) {
    S.hT += HDT;
    S.hHead = (S.hHead + 1) % HN;
    S.hx[S.hHead] = S.x; S.hy[S.hHead] = S.y; S.hr[S.hHead] = S.roll;
    if (S.hCount < HN) S.hCount++;
  }
  var hFrac = (t - S.hT) / HDT;   // the newest history slot is this far behind now

  // camera a little above, with a slow yaw swing so the depth reads
  var pitch = -0.2 + 0.06 * Math.sin(t * 0.29);
  cosP = Math.cos(pitch); sinP = Math.sin(pitch);
  var yaw = 0.55 * Math.sin(t * 0.21);
  cosY = Math.cos(yaw); sinY = Math.sin(yaw);
  SC = R;
  CW = M.cw; CH = M.ch; GW = W; GH = H;

  var zb = M.zbuf, kind = M.kind;
  zb.fill(-1e9); kind.fill(0);

  var i, j, k;
  var build = smooth((t - 0.1) / 2.1);   // intro: 0 scattered .. 1 assembled

  // ---- bell -----------------------------------------------------------------
  OX = S.x; OY = S.y; cosR = Math.cos(S.roll); sinR = Math.sin(S.roll);
  var co = Math.cos(SPIN * t), si = Math.sin(SPIN * t);
  var gl = BELL_LO.length, gm = BELL_MID.length, gh = BELL_HI.length, gf = BELL_FAINT.length;
  for (i = 0; i < NU; i++) {
    var base = i * NTH;
    var u = M.uU[i];
    // bell_pose: the squeeze starts at the crown and reaches the rim RIM_LAG later
    var c = squeeze(t - RIM_LAG * u);
    var flare = M.uFlare[i], tuck = M.uTuck[i];
    var rs = 1 + flare - tuck * c;
    var tallS = 1 + 0.15 * c;
    var sa = M.uSa[i] * (1 - 0.5 * tuck * c), ca = M.uCa[i];
    var isRim = i >= NU - 2;
    var way = 0.3 * u;
    for (j = 0; j < NTH; j++) {
      k = base + j;
      var th0 = M.bTh[k];
      var c0 = Math.cos(th0), s0 = Math.sin(th0);
      var ct = c0 * co - s0 * si, st = s0 * co + c0 * si;
      var r = M.bWide[k] * rs;
      var y = -M.bTall[k] * tallS;
      project(r * ct, y, r * st);
      var seed = M.bSeed[k];
      // intro: dots fly in from where they were scattered
      if (build < 1) {
        var q = smooth((t - 0.15 - 1.3 * seed) / 0.85);
        if (q < 1) {
          if (q < 0.8 && (k % 23) !== 0) continue;
          var dx = M.bSx[k], dy = M.bSy[k];
          var sxp = dx + (pX - dx) * q, syp = dy + (pY - dy) * q;
          put(sxp, syp, pZ - 3 + q, K_DOT, 0.35 + 0.6 * q, way, I_PETAL, q < 0.5 ? 46 : 58);
          continue;
        }
      }
      // normal (model) -> view
      var nxm = sa * ct, ny = -ca, nzm = sa * st;
      var nx = nxm * cosY + nzm * sinY, nz = nzm * cosY - nxm * sinY;
      var ny1 = ny * cosP - nz * sinP, nz1 = ny * sinP + nz * cosP;
      var nx2 = nx * cosR - ny1 * sinR, ny2 = nx * sinR + ny1 * cosR;
      var lum, code, ink;
      if (nz1 >= 0) {
        var dif = nx2 * LX + ny2 * LY + nz1 * LZ;
        lum = 0.28 + 0.7 * (dif > 0 ? dif : 0) + 0.1 * nz1;
        if (M.bPet[k]) { ink = I_PETAL; lum += 0.1; } else ink = I_BELL;
      } else {
        // the inside of the far wall, seen through the opening
        var dif2 = -(nx2 * LX + ny2 * LY + nz1 * LZ);
        lum = 0.22 + 0.4 * (dif2 > 0 ? dif2 : 0);
        ink = I_IN;
      }
      lum *= 0.9 + 0.25 * (c > 0 ? c : 0) * u;
      if (isRim) {
        var th2 = th0 + 0.08;
        var c2 = Math.cos(th2) * co - Math.sin(th2) * si, s2 = Math.sin(th2) * co + Math.cos(th2) * si;
        var sx = pX, sy = pY, sz = pZ;
        project(r * c2, y, r * s2);
        code = strokeChar((pX - sx) / CW, (pY - sy) / CH, 95);
        put(sx, sy, sz + 0.02, K_RIM, Math.max(lum, 0.55), way, I_PETAL, code);
        continue;
      }
      var flick = (seed * 97 + Math.floor(t * 0.7 + seed * 5)) | 0;
      if (lum > 0.66) code = BELL_HI.charCodeAt(flick % gh);
      else if (lum > 0.46) code = BELL_MID.charCodeAt(flick % gm);
      else if (lum > 0.3) code = BELL_LO.charCodeAt(flick % gl);
      else code = BELL_FAINT.charCodeAt(flick % gf);
      put(pX, pY, pZ, K_BELL, lum, way, ink, code);
    }
  }

  // ---- oral arms: arm(k, s, w, t, g) ------------------------------------------
  var g = smooth((t - T_ARMS0) / (T_ARMS1 - T_ARMS0));
  var prevX = M.prevX, prevY = M.prevY;
  if (g > 0.01) {
    for (var a = 0; a < N_ARMS; a++) {
      for (i = 0; i < ARM_S; i++) {
        var s = i / (ARM_S - 1);
        var back = RIM_LAG + ARM_LAG * s * g;
        var td = t - back;
        carry(back - hFrac * HDT);
        var ca2 = squeeze(td);
        var thA = a * TAU / N_ARMS + 0.4 + SPIN * td + 1.5 * s * g + 0.30 * Math.sin(0.9 * t - 2.5 * s + a);
        var out = (0.04 + 0.12 * Math.sin(Math.PI * Math.pow(s, 0.8))) * (1 - 0.45 * ca2);
        var ay = -0.12 + ARM_LEN * g * s * (1 + 0.10 * ca2);
        var twist = thA + 1.2 + 2.6 * s;
        var wide = ARM_WIDE * (0.35 + 0.65 * g) * Math.pow(clamp01(1 - s), 0.55) * smooth((s + 0.04) / 0.25);
        var cw2 = Math.cos(twist), sw2 = Math.sin(twist);
        var cx0 = out * Math.cos(thA), cz0 = out * Math.sin(thA);
        var armWay = 0.3 + 0.45 * s;
        var fade = 1 - 0.55 * s * s;
        for (j = 0; j < ARM_W; j++) {
          var w = j / (ARM_W - 1) * 2 - 1;
          var aw = w < 0 ? -w : w;
          var frill = 0.05 * Math.pow(aw, 1.5) * Math.sin(13 * s - 3.2 * t + 2.6 * w + 2 * a);
          var xx = cx0 + wide * w * cw2 - frill * sw2;
          var zz = cz0 + wide * w * sw2 + frill * cw2;
          var yy = ay - 0.025 * aw * Math.sin(9 * s - 2 * t + a);
          project(xx, yy, zz);
          var edge = aw > 0.95;
          var al = (0.55 + 0.4 * (1 - aw)) * fade;
          if (i > 0) {
            if (edge) {
              put(pX, pY, pZ + 0.06, K_ARME, al * 0.95, armWay, I_ARM, strokeChar((pX - prevX[j]) / CW, (pY - prevY[j]) / CH));
            } else {
              var sd = (a * 7919 + i * 131 + j * 31) | 0;
              var fl = (sd + Math.floor(t * 1.3 + hash(sd) * 7) * 13) | 0;
              put(pX, pY, pZ + 0.05, K_ARM, al, armWay, I_ARM, ARM_CH.charCodeAt(fl % ARM_CH.length));
            }
          }
          prevX[j] = pX; prevY[j] = pY;
        }
      }
    }
  }

  // ---- tentacles: tentacle(s, t, g) -------------------------------------------
  var gap = M.strandGap;
  for (var tn = 0; tn < N_TENT; tn++) {
    var gT = clamp01((t - M.tT0[tn]) / TENT_DROP);
    gT = 1 - (1 - gT) * (1 - gT);           // dropped(): falls fast, then eases
    if (gT < 0.01) continue;
    var tph = M.tPh[tn];
    for (i = 0; i < TENT_SEG; i++) {
      var s2 = i / (TENT_SEG - 1);
      var reach = TENT_LEN * gT * s2;
      var backT = RIM_LAG + TENT_LAG * reach;
      var tdT = t - backT;
      carry(backT - hFrac * HDT);
      var cT = squeeze(tdT);
      var thT = M.tTh[tn] + SPIN * tdT + 0.55 * s2 * Math.sin(0.8 * t - 2.6 * reach + tph);
      var rT = 0.97 * RIM_R * (1 - 0.34 * cT) * (1 - 0.30 * smooth(1.1 * reach));
      rT += 0.13 * Math.pow(s2, 0.7) * Math.sin(1.7 * t - 6.5 * reach / TENT_LEN * 2 + 3 * tph);
      var yT = reach * (1 + 0.08 * cT) + 0.02 * s2 * Math.sin(2.3 * t - 7 * reach + tph);
      var bx = rT * Math.cos(thT), bz = rT * Math.sin(thT);
      var tf = s2 > 0.7 ? 1 - smooth((s2 - 0.7) / 0.3) * 0.85 : 1;
      var tWay = 0.3 + 0.62 * s2;
      var taper = 1 - 0.6 * s2;
      for (j = 0; j < N_STRAND; j++) {
        var off = (j - (N_STRAND - 1) / 2) * gap * taper;
        var wob = 0.2 * gap * Math.sin(5 * s2 - 1.9 * t + j * 1.7 + tph);
        project(bx - off * Math.sin(thT) + wob, yT, bz + off * Math.cos(thT));
        if (i > 0) {
          put(pX, pY, pZ, K_TENT, 0.75 * tf, tWay, I_TENT, strokeChar((pX - prevX[j]) / CW, (pY - prevY[j]) / CH));
        }
        prevX[j] = pX; prevY[j] = pY;
      }
    }
  }

  // ---- bell silhouette strokes ------------------------------------------------
  var edgeA = M.edge; edgeA.fill(0);
  for (var yy2 = 1; yy2 < H - 1; yy2++) {
    var row = yy2 * W;
    for (var xx2 = 1; xx2 < W - 1; xx2++) {
      var id = row + xx2;
      if (kind[id] !== K_BELL) continue;
      var L = kind[id - 1], Rr = kind[id + 1], U = kind[id - W], D = kind[id + W];
      var eL = L !== K_BELL && L !== K_RIM, eR = Rr !== K_BELL && Rr !== K_RIM;
      var eU = U !== K_BELL && U !== K_RIM, eD = D !== K_BELL && D !== K_RIM;
      if (!(eL || eR || eU || eD)) continue;
      var UL = kind[id - W - 1], UR = kind[id - W + 1], DL = kind[id + W - 1], DR = kind[id + W + 1];
      var eUL = UL !== K_BELL && UL !== K_RIM, eUR = UR !== K_BELL && UR !== K_RIM;
      var eDL = DL !== K_BELL && DL !== K_RIM, eDR = DR !== K_BELL && DR !== K_RIM;
      var gx = (eR ? 2 : 0) - (eL ? 2 : 0) + (eUR ? 1 : 0) + (eDR ? 1 : 0) - (eUL ? 1 : 0) - (eDL ? 1 : 0);
      var gy = (eD ? 2 : 0) - (eU ? 2 : 0) + (eDL ? 1 : 0) + (eDR ? 1 : 0) - (eUL ? 1 : 0) - (eUR ? 1 : 0);
      var agx = gx < 0 ? -gx : gx, agy = gy < 0 ? -gy : gy;
      var ec;
      if (agx === 0 && agy === 0) continue;
      if (agx > 2.2 * agy) ec = 124;
      else if (agy > 2.2 * agx) ec = gy < 0 ? 45 : 95;
      else ec = (gx * gy > 0) ? 47 : 92;
      edgeA[id] = 1;
      M.gch[id] = ec;
    }
  }
  for (var e = 0; e < W * H; e++) {
    if (edgeA[e]) { kind[e] = K_RIM; if (M.lum[e] < 0.55) M.lum[e] = 0.55; }
  }

  // ---- glints: a ring of sparkles leaves the rim after each stroke --------------
  var rings = S.rings;
  for (var rn = 0; rn < rings.length; rn++) {
    var rg = rings[rn], age = t - rg.t0;
    if (age < 0 || age >= GLINT_LIFE) continue;
    carry(t - rg.t0 - hFrac * HDT);
    var rr0 = 0.9 * RIM_R + 1.15 * (1 - Math.exp(-1.5 * age));
    var fadeG = Math.pow(1 - age / GLINT_LIFE, 0.6);
    var gyd = 0.10 * age + 0.05 * age * age;
    for (var gn = 0; gn < N_GLINTS; gn++) {
      var g0 = hash(rg.seed + gn * 3.1), g1 = hash(rg.seed + gn * 7.3 + 1);
      var ang = (g0 + gn) * TAU / N_GLINTS;
      project(rr0 * Math.cos(ang), gyd, rr0 * Math.sin(ang));
      var tw = Math.sin(t * (5 + 6 * g1) + g0 * 50);
      tw = tw < 0 ? 0 : tw;
      var gb = fadeG * (0.35 + 0.65 * tw);
      if (gb < 0.12) continue;
      var gcx = (pX / CW) | 0, gcy = (pY / CH) | 0;
      if (gcx < 0 || gcy < 0 || gcx >= W || gcy >= H) continue;
      var gid = gcy * W + gcx;
      if (kind[gid] && kind[gid] !== K_BG && pZ < zb[gid]) continue;
      kind[gid] = K_SPARK; M.gch[gid] = gb > 0.7 ? 42 : gb > 0.4 ? 43 : 46;
      M.lum[gid] = gb; M.dep[gid] = 1; M.way[gid] = 0;
    }
  }

  // ---- background (only into empty cells) ------------------------------------
  var stars = M.stars;
  for (i = 0; i < stars.length; i++) {
    var st2 = stars[i];
    st2.y -= st2.v * 0.35 * dt; st2.x += Math.sin(t * 0.2 + st2.p) * 0.08 * dt;
    if (st2.y < 0) { st2.y += H; st2.x = Math.random() * W; }
    var sxi = st2.x | 0, syi = st2.y | 0;
    if (sxi < 0 || sxi >= W || syi >= H) continue;
    var sid = syi * W + sxi;
    if (kind[sid]) continue;
    kind[sid] = K_BG; M.gch[sid] = st2.c.charCodeAt(0);
    M.lum[sid] = st2.a * (0.7 + 0.3 * Math.sin(t * 1.3 + st2.p * 3));
    M.ink[sid] = 9;
  }
  var minis = M.minis;
  for (i = 0; i < minis.length; i++) {
    var mj = minis[i];
    var mpulse = 0.5 + 0.5 * Math.sin(t * 1.4 + mj.ph);
    mj.y += mj.vy * (0.5 + mpulse) * dt; mj.x += mj.vx * dt;
    if (mj.y < -8) { mj.y = H + 2; mj.x = Math.random() < 0.5 ? W * (0.04 + 0.1 * Math.random()) : W * (0.84 + 0.1 * Math.random()); }
    if (mj.x < -6 || mj.x > W + 6) mj.vx = -mj.vx;
    var lines = mpulse > 0.5
      ? [" .-\"\"-. ", "( ~~~~ )", " ) ( ) (", "( ) ( ) ", " ) ( ) ("]
      : ["  .--.  ", " (~~~~) ", "  )( )( ", "  ( )(  ", "  )( )( "];
    var flip = ((t * 2 + mj.ph) | 0) & 1;
    for (var ly = 0; ly < lines.length; ly++) {
      var ln = lines[ly];
      var my = (mj.y | 0) + ly;
      if (my < 0 || my >= H) continue;
      for (var lx = 0; lx < ln.length; lx++) {
        var chm = ln.charCodeAt(lx);
        if (chm === 32) continue;
        if (ly >= 2 && flip) chm = chm === 40 ? 41 : chm === 41 ? 40 : chm;
        var mx = (mj.x | 0) + lx - 4;
        if (mx < 0 || mx >= W) continue;
        var mid = my * W + mx;
        if (kind[mid] && kind[mid] !== K_BG) continue;
        kind[mid] = K_BG; M.gch[mid] = chm; M.lum[mid] = 0.36 - ly * 0.03; M.ink[mid] = 10 + i;
      }
    }
  }

  // ---- tap sparks ------------------------------------------------------------
  var sp = S.sparks, alive = 0;
  for (i = 0; i < sp.length; i++) {
    var p = sp[i];
    p.life += dt;
    if (p.life >= p.max) continue;
    var dr = Math.exp(-2.2 * dt);
    p.vx *= dr; p.vy = p.vy * dr + 1.2 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    sp[alive++] = p;
    var pxi = p.x | 0, pyi = p.y | 0;
    if (pxi < 0 || pyi < 0 || pxi >= W || pyi >= H) continue;
    var pid = pyi * W + pxi, f = p.life / p.max;
    kind[pid] = K_SPARK;
    M.gch[pid] = f < 0.25 ? 42 : f < 0.6 ? 43 : 46;
    M.lum[pid] = 1 - f;
    M.dep[pid] = 1; M.way[pid] = 0;
  }
  sp.length = alive;

  // ---- composite: lit(way, inks, lum) -------------------------------------------
  var po = PALETTES[wOld], pn = PALETTES[wNew];
  var hudRow = H - 2;
  var chars = 0;
  var spc = PALETTES[S.wave ? wNew : S.pal][I_PETAL];
  for (var yc = 0; yc < H; yc++) {
    for (var xc = 0; xc < W; xc++) {
      var ci = yc * W + xc;
      var kd = kind[ci];
      if (!kd) continue;
      if (yc >= hudRow && xc < 60 && kd === K_BG) continue;
      var code2 = M.gch[ci];
      var lm = M.lum[ci];
      var rr, gg, bb, al2;
      if (kd === K_BG) {
        var ik = M.ink[ci];
        if (ik === 9) { rr = 125; gg = 150; bb = 210; }
        else { var mc = minis[ik - 10].col; rr = mc[0]; gg = mc[1]; bb = mc[2]; }
        drawChar(String.fromCharCode(code2), xc, yc, rr, gg, bb, lm);
        continue;
      }
      if (kd === K_SPARK) {
        var wh = Math.sqrt(lm) * 0.8;
        drawChar(String.fromCharCode(code2), xc, yc,
          (spc[0] + (255 - spc[0]) * wh) | 0, (spc[1] + (255 - spc[1]) * wh) | 0, (spc[2] + (255 - spc[2]) * wh) | 0,
          0.55 + 0.45 * lm);
        chars++;
        continue;
      }
      var inkI = M.ink[ci];
      var o = po[inkI], n2 = pn[inkI];
      var wy = M.way[ci];
      var on = 0, band = 0;
      if (wf > -5) {
        on = smooth((wf - wy) / 0.2 + 0.5);
        var bd = (wf - wy) / 0.09;
        band = bandAmp * Math.exp(-bd * bd);
      }
      rr = o[0] + (n2[0] - o[0]) * on;
      gg = o[1] + (n2[1] - o[1]) * on;
      bb = o[2] + (n2[2] - o[2]) * on;
      if (kd === K_RIM || kd === K_ARME) {  // pale edges: PALE(ink, 0.45)
        rr += (255 - rr) * 0.45; gg += (255 - gg) * 0.45; bb += (255 - bb) * 0.45;
      } else if (kd === K_DOT) {
        rr += (255 - rr) * 0.3; gg += (255 - gg) * 0.3; bb += (255 - bb) * 0.3;
      }
      // brightness scales the ink but never greys it out
      var lit = 0.7 + 0.5 * lm;
      rr *= lit; gg *= lit; bb *= lit;
      if (lm > 0.8 && kd === K_BELL) {
        var spw = (lm - 0.8) * 1.2;
        rr += (255 - rr) * spw; gg += (255 - gg) * spw; bb += (255 - bb) * spw;
      }
      var fog = 0.45 + 0.55 * M.dep[ci];
      rr *= fog; gg *= fog; bb *= fog;
      if (band > 0.01) {
        rr += (255 - rr) * band; gg += (255 - gg) * band; bb += (255 - bb) * band;
      }
      al2 = (0.62 + 0.35 * lm) * (0.7 + 0.3 * M.dep[ci]) + band * 0.55;
      if (al2 > 1) al2 = 1;
      if (rr > 255) rr = 255; if (gg > 255) gg = 255; if (bb > 255) bb = 255;
      drawChar(String.fromCharCode(code2), xc, yc, rr | 0, gg | 0, bb | 0, al2);
      chars++;
    }
  }

  // ---- HUD -------------------------------------------------------------------
  var hud1 = 'beats ' + S.nBeats + '   tentacles ' + N_TENT + '   colours ' + S.colours + '   sparks ' + S.nSparks;
  var hud2 = 'chars ' + chars.toLocaleString('en-US');
  if (W >= hud1.length + hud2.length + 6) { hud1 = hud1 + '   ' + hud2; hud2 = ''; }
  var rows = hud2 ? [hud1, hud2] : [hud1];
  for (var hr = 0; hr < rows.length; hr++) {
    var txt = rows[hr], yh = H - rows.length + hr;
    for (var hx = 0; hx < txt.length && hx + 1 < W; hx++) {
      if (txt.charCodeAt(hx) !== 32) drawChar(txt[hx], hx + 1, yh, 120, 130, 150, 0.7);
    }
  }
}

registerMode(MODE, { init: initMedusa, render: renderMedusa, cleanup: cleanupMedusa });
