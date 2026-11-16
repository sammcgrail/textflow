import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';

// medusa: a 3D point-cloud jellyfish projected onto the character grid with
// a per-cell z-buffer, after dwcminh.ascii's "ASCII Jellyfish" reel.
//   bell      : a scalloped dome shell sampled in (u down the dome, theta round
//               it), lit from the upper left, glyph density by brightness, the
//               silhouette re-stroked with / \ | _ - from the mask gradient
//   oral arms : four twisting ribbons of random text, edged with | / \
//   tentacles : fourteen 4-strand ribbons drawn with slash glyphs picked from
//               the projected stroke angle, waves lagging behind each pulse
//   colour    : every beat sends a wave from the crown to the tentacle tips;
//               the wave front is white-hot and behind it the animal wears the
//               next palette (every second beat, and on every tap)
// Tap: pulse + colour wave + a burst of sparks. Drag: it swims after you.

var MODE = 'medusa';
var TAU = Math.PI * 2;

var N_TENT = 14, N_STRAND = 4, TENT_SEG = 96;
var N_ARMS = 4, ARM_S = 64, ARM_W = 9;
var NU = 64, NTH = 196;
var BELL_H = 0.92, A1 = 1.48;
var LAPPETS = 16;
var BEAT_EVERY = 3.3, WAVE_SPEED = 0.62;

var BELL_HI = '#%&8B$@0Q#%8B$&@';
var BELL_MID = 'xrtjz{}[]<>uoneavc=+?';
var BELL_LO = ':;1il!|;:i1';
var BELL_FAINT = ".:',`-";
var ARM_CH = 'abcdeghjklmnoprstuvwxyz0123456789$%&#@?{}[]<>=+*~^';

// [bell, oral arms, tentacles]
var PALETTES = [
  [[40, 220, 255], [255, 60, 200], [90, 200, 255]],    // electric cyan, hot pink core
  [[170, 90, 255], [255, 80, 230], [150, 120, 255]],    // bright violet
  [[30, 255, 210], [255, 110, 150], [60, 235, 255]],    // aqua, coral core
  [[60, 140, 255], [255, 70, 255], [110, 170, 255]],    // electric blue, magenta
  [[255, 70, 190], [255, 210, 90], [255, 110, 220]],    // hot pink, gold core
  [[150, 255, 90], [255, 160, 40], [90, 255, 200]],     // lime, amber core
];

var K_NONE = 0, K_BELL = 1, K_RIM = 2, K_ARM = 3, K_ARME = 4, K_TENT = 5, K_BG = 6, K_SPARK = 7;

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
  // bell parameter table
  var nb = NU * NTH;
  m.bWide = new Float32Array(nb); m.bTall = new Float32Array(nb);
  m.bU = new Float32Array(nb); m.bTh = new Float32Array(nb);
  m.bSa = new Float32Array(nb); m.bCa = new Float32Array(nb); m.bSeed = new Float32Array(nb);
  var sA1 = Math.pow(Math.sin(A1), 0.9), cA1 = Math.cos(A1);
  for (var i = 0; i < NU; i++) {
    var u = i / (NU - 1), a = u * A1;
    var wide = Math.pow(Math.sin(a), 0.9) / sA1;
    var tall = BELL_H * (Math.cos(a) - cA1) / (1 - cA1);
    for (var j = 0; j < NTH; j++) {
      var k = i * NTH + j;
      // stagger alternate rings so the samples don't line up in columns
      var th = (j + (i & 1) * 0.5) / NTH * TAU;
      m.bU[k] = u; m.bTh[k] = th; m.bWide[k] = wide; m.bTall[k] = tall;
      m.bSa[k] = Math.sin(a); m.bCa[k] = Math.cos(a);
      m.bSeed[k] = hash(k * 1.7 + 3.1);
    }
  }
  // tentacle constants
  m.tTh = new Float32Array(N_TENT); m.tLen = new Float32Array(N_TENT); m.tPh = new Float32Array(N_TENT);
  for (var t = 0; t < N_TENT; t++) {
    m.tTh[t] = (t + 0.5) / N_TENT * TAU + (hash(t + 9) - 0.5) * 0.25;
    m.tLen[t] = 3.0 + 0.9 * hash(t * 3.3 + 1);
    m.tPh[t] = hash(t * 7.7 + 2) * TAU;
  }
  // projected scratch for stroke direction (one row of previous positions)
  m.prevX = new Float32Array(Math.max(N_STRAND, ARM_W));
  m.prevY = new Float32Array(Math.max(N_STRAND, ARM_W));
  // layout: animal spans -0.92R (crown) .. ~+3.35R (tentacle tips)
  var pw = W * m.cw, ph = H * m.ch;
  var frac = state.isMobile || pw < 700 ? 0.74 : 0.84;
  m.R = Math.min(frac * ph / 4.8, 0.36 * pw);
  m.homeX = pw * 0.5;
  m.homeY = (ph - 4.8 * m.R) * 0.5 + 0.95 * m.R;
  m.strandGap = 1.05 * m.cw / m.R;  // ~1 column between strands, in R units
  // background
  var ns = Math.round(W * H / 26);
  m.stars = [];
  for (var s = 0; s < ns; s++) {
    m.stars.push({ x: Math.random() * W, y: Math.random() * H, v: 0.15 + Math.random() * 0.5,
      c: Math.random() < 0.22 ? '+' : '.', p: Math.random() * TAU, a: 0.18 + Math.random() * 0.3 });
  }
  m.minis = [];
  var nm = 3;
  for (var q = 0; q < nm; q++) {
    m.minis.push({
      x: q === 1 ? W * 0.86 : W * (0.06 + 0.06 * q),
      y: q === 2 ? H * 0.82 : H * (0.25 + 0.4 * Math.random()),
      vy: -(0.25 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.3,
      ph: Math.random() * TAU,
      col: [[120, 150, 230], [230, 120, 150], [150, 120, 230]][q % 3],
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
      x: M.homeX, y: M.homeY, vx: 0, vy: 0, svx: 0, svy: 0, roll: 0,
      beats: [-99, -99, -99], nBeats: 0, nextBeat: 0.7,
      pal: 0, wave: null, colours: 0,
      sparks: [], nSparks: 0, swimT: -99,
    };
  } else {
    S.x = Math.min(Math.max(S.x, 0), M.w * M.cw);
    S.y = Math.min(Math.max(S.y, 0), M.h * M.ch);
  }
}

function cleanupMedusa() {
  if (state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
  M = null; S = null;
}

function pulseShape(p) {
  if (p < 0) return 0;
  if (p < 0.3) { var k = p / 0.3; return k * k * (3 - 2 * k); }
  return Math.exp(-(p - 0.3) * 2.3);
}
function squeeze(td) {
  var b = S.beats, v = 0;
  for (var i = 0; i < 3; i++) { var q = pulseShape(td - b[i]); if (q > v) v = q; }
  return v;
}

function beat(changeColour) {
  S.beats[0] = S.beats[1]; S.beats[1] = S.beats[2]; S.beats[2] = S.t;
  S.nBeats++;
  S.vy -= 0.55 * M.R;  // the stroke pushes it up
  if (S.wave) S.pal = S.wave.nw;
  var nw = changeColour ? (S.pal + 1) % PALETTES.length : S.pal;
  if (changeColour) S.colours++;
  S.wave = { t0: S.t, old: S.pal, nw: nw };
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
var cosP = 1, sinP = 0, cosR = 1, sinR = 0, OX = 0, OY = 0, SC = 1;

// model (R units, y down, z toward viewer) -> screen px in pX,pY and depth pZ
function project(x, y, z) {
  var y1 = y * cosP - z * sinP;
  var z1 = y * sinP + z * cosP;
  var x2 = x * cosR - y1 * sinR;
  var y2 = x * sinR + y1 * cosR;
  var persp = 1 / (1 - 0.1 * z1);
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

var LX = -0.75, LY = -0.5, LZ = 0.45;
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

  // ---- input -------------------------------------------------------------
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    beat(true);
    S.nextBeat = t + BEAT_EVERY;
    var pal = PALETTES[S.wave.nw];
    spawnSparks(pointer.gx, pointer.gy, 46, 16, pal[0]);
    spawnSparks(pointer.gx, pointer.gy, 14, 9, pal[1]);
  } else if (pointer.down && state.currentMode === MODE) {
    // swim toward the finger: bell centre follows, beats come faster
    var tx = pointer.gx * M.cw, ty = pointer.gy * M.ch + 0.45 * R;
    S.vx += (tx - S.x) * 2.6 * dt;
    S.vy += (ty - S.y) * 2.6 * dt;
    S.swimT = t;
    if (S.nextBeat - t > 1.3) S.nextBeat = t + 0.15;
  }

  // ---- beats + colour waves -------------------------------------------------
  if (t >= S.nextBeat) {
    beat(S.nBeats > 0 && S.nBeats % 2 === 1);
    S.nextBeat = t + (t - S.swimT < 0.5 ? 1.25 : BEAT_EVERY);
    // rim glints
    var gp = PALETTES[S.wave.nw][0];
    for (var gi = 0; gi < 3; gi++) {
      var ga = Math.random() * TAU;
      spawnSparks((S.x + Math.cos(ga) * R * 0.9) / M.cw, (S.y + Math.sin(ga) * R * 0.15) / M.ch, 2, 5, gp);
    }
  }
  var wf = -9, wOld = S.pal, wNew = S.pal;
  if (S.wave) {
    wf = (t - S.wave.t0) * WAVE_SPEED - 0.05;
    wOld = S.wave.old; wNew = S.wave.nw;
    if (wf > 1.6) { S.pal = S.wave.nw; S.wave = null; wf = -9; wOld = wNew = S.pal; }
  }

  // ---- body motion ----------------------------------------------------------
  var homeX = M.homeX + Math.sin(t * 0.13) * 0.1 * W * M.cw;
  var homeY = M.homeY + Math.sin(t * 0.21) * 0.05 * H * M.ch;
  var spring = t - S.swimT < 1.5 ? 0.05 : 0.55;
  S.vx += (homeX - S.x) * spring * dt;
  S.vy += (homeY - S.y) * spring * dt + 0.16 * R * dt;  // slow sink between strokes
  var damp = Math.exp(-1.6 * dt);
  S.vx *= damp; S.vy *= damp;
  S.x += S.vx * dt; S.y += S.vy * dt;
  var pw = W * M.cw, ph = H * M.ch;
  if (S.x < 0.15 * pw) { S.x = 0.15 * pw; S.vx *= -0.3; }
  if (S.x > 0.85 * pw) { S.x = 0.85 * pw; S.vx *= -0.3; }
  if (S.y < 0.95 * R + 4) { S.y = 0.95 * R + 4; S.vy *= -0.3; }
  if (S.y > ph - 0.6 * R) { S.y = ph - 0.6 * R; S.vy *= -0.3; }
  var kS = 1 - Math.exp(-2.2 * dt);
  S.svx += (S.vx - S.svx) * kS; S.svy += (S.vy - S.svy) * kS;
  var rollT = Math.max(-0.45, Math.min(0.45, S.svx / R * 0.35)) + 0.06 * Math.sin(t * 0.37);
  S.roll += (rollT - S.roll) * kS;

  var pitch = -0.30 + 0.07 * Math.sin(t * 0.29);
  cosP = Math.cos(pitch); sinP = Math.sin(pitch);
  cosR = Math.cos(S.roll); sinR = Math.sin(S.roll);
  OX = S.x; OY = S.y; SC = R;
  CW = M.cw; CH = M.ch; GW = W; GH = H;

  var zb = M.zbuf, kind = M.kind;
  zb.fill(-1e9); kind.fill(0);

  var spin = 0.16 * t;
  var unfurl = smooth((t - 0.2) / 2.4);
  var RIM_LAG = 0.12;
  var trailX = -S.svx / R * 0.32, trailY = -S.svy / R * 0.2;
  var i, j, k;

  // ---- bell -----------------------------------------------------------------
  var cosSpin = Math.cos(spin), sinSpin = Math.sin(spin);
  var cRim = squeeze(t - RIM_LAG);
  for (i = 0; i < NU; i++) {
    var base = i * NTH;
    var u = M.bU[base];
    var c = squeeze(t - RIM_LAG * u);
    var tuck = 0.3 * Math.pow(u, 1.6) * c;
    var flare = 0.07 * Math.pow(u, 8);
    var tallScale = 1 + 0.12 * c;
    var sa = M.bSa[base], ca = M.bCa[base];
    var gl = BELL_LO.length, gm = BELL_MID.length, gh = BELL_HI.length, gf = BELL_FAINT.length;
    var isRim = i >= NU - 2;
    var way = 0.25 * u;
    for (j = 0; j < NTH; j++) {
      k = base + j;
      var th0 = M.bTh[k];
      var lap = 1 + 0.06 * Math.pow(u, 6) * Math.cos(LAPPETS * th0);
      var th = th0 + spin;
      var ct = Math.cos(th), st = Math.sin(th);
      var r = M.bWide[k] * (1 + flare - tuck) * lap;
      var x = r * ct, z = r * st, y = -M.bTall[k] * tallScale;
      project(x, y, z);
      // normal (model) -> view: rotate the same way
      var nx = sa * ct, ny = -ca, nz = sa * st;
      var ny1 = ny * cosP - nz * sinP, nz1 = ny * sinP + nz * cosP;
      var nx2 = nx * cosR - ny1 * sinR, ny2 = nx * sinR + ny1 * cosR;
      var lum, code;
      var seed = M.bSeed[k];
      if (nz1 >= 0) {
        var dif = nx2 * LX + ny2 * LY + nz1 * LZ;
        lum = 0.2 + 0.75 * (dif > 0 ? dif : 0) + 0.08 * nz1;
      } else {
        // inner surface of the far side, seen through the open bell
        var dif2 = -(nx2 * LX + ny2 * LY + nz1 * LZ);
        lum = 0.08 + 0.3 * (dif2 > 0 ? dif2 : 0);
      }
      lum *= 0.85 + 0.3 * c * u;
      if (isRim) {
        // rim stroke: direction from the neighbouring sample round the rim
        var th2 = th + 0.08;
        var r2 = M.bWide[k] * (1 + flare - tuck);
        var sx = pX, sy = pY, sz = pZ;
        project(r2 * Math.cos(th2), y, r2 * Math.sin(th2));
        code = strokeChar((pX - sx) / CW, (pY - sy) / CH, 95);
        put(sx, sy, sz + 0.02, K_RIM, Math.max(lum, 0.45), way, 0, code);
        continue;
      }
      var flick = (seed * 97 + Math.floor(t * 0.7 + seed * 5)) | 0;
      if (lum > 0.68) code = BELL_HI.charCodeAt(flick % gh);
      else if (lum > 0.46) code = BELL_MID.charCodeAt(flick % gm);
      else if (lum > 0.26) code = BELL_LO.charCodeAt(flick % gl);
      else code = BELL_FAINT.charCodeAt(flick % gf);
      put(pX, pY, pZ, K_BELL, lum, way, 0, code);
    }
  }

  // ---- oral arms ----------------------------------------------------------
  var armLen = 2.2 * unfurl;
  var prevX = M.prevX, prevY = M.prevY;
  if (armLen > 0.02) {
    for (var a = 0; a < N_ARMS; a++) {
      for (i = 0; i < ARM_S; i++) {
        var s = i / (ARM_S - 1);
        var td = t - RIM_LAG - 0.55 * s;
        var ca2 = squeeze(td);
        var thA = a * TAU / N_ARMS + 0.4 + spin + 1.4 * s + 0.3 * Math.sin(0.9 * t - 2.5 * s + a);
        var out = (0.05 + 0.13 * Math.sin(Math.PI * Math.pow(s, 0.8))) * (1 - 0.45 * ca2);
        var ay = -0.28 + armLen * s * (1 + 0.1 * ca2);
        var wide = 0.24 * (0.4 + 0.6 * Math.pow(1 - s, 0.55)) + 0.04;
        var twist = thA + Math.PI / 2 + 0.9 * Math.sin(1.8 * s - 0.6 * t + a * 1.3);
        var cw2 = Math.cos(twist), sw2 = Math.sin(twist);
        var frill = 0.035 * Math.sin(11 * s - 2.6 * t + a);
        var trail = Math.pow(s, 1.5);
        var cx0 = out * Math.cos(thA) + trailX * trail, cz0 = out * Math.sin(thA);
        var armWay = 0.25 + 0.5 * s;
        var fade = 1 - 0.65 * s * s;
        for (j = 0; j < ARM_W; j++) {
          var w = j / (ARM_W - 1) * 2 - 1;
          var xx = cx0 + wide * w * cw2 - frill * sw2;
          var zz = cz0 + wide * w * sw2 + frill * cw2;
          var yy = ay + trailY * trail + 0.02 * Math.abs(w) * Math.sin(9 * s - 2 * t + a);
          project(xx, yy, zz);
          var edge = j === 0 || j === ARM_W - 1;
          var al = (0.55 + 0.35 * (1 - Math.abs(w))) * fade;
          if (i > 0) {
            if (edge) {
              put(pX, pY, pZ + 0.76, K_ARME, al * 0.9, armWay, 1, strokeChar((pX - prevX[j]) / CW, (pY - prevY[j]) / CH));
            } else {
              var sd = (a * 7919 + i * 131 + j * 31) | 0;
              var fl = (sd + Math.floor(t * 1.3 + hash(sd) * 7) * 13) | 0;
              put(pX, pY, pZ + 0.75, K_ARM, al, armWay, 1, ARM_CH.charCodeAt(fl % ARM_CH.length));
            }
          }
          prevX[j] = pX; prevY[j] = pY;
        }
      }
    }
  }

  // ---- tentacles ------------------------------------------------------------
  var gap = M.strandGap;
  for (var tn = 0; tn < N_TENT; tn++) {
    var tlen = M.tLen[tn] * unfurl, tph = M.tPh[tn];
    if (tlen < 0.03) break;
    for (i = 0; i < TENT_SEG; i++) {
      var s2 = i / (TENT_SEG - 1);
      var reach = tlen * s2;
      var tdT = t - RIM_LAG - 0.42 * reach;
      var cT = squeeze(tdT);
      var thT = M.tTh[tn] + spin + 0.5 * s2 * Math.sin(0.8 * t - 2.4 * reach + tph);
      var rT = 0.97 * (1 - 0.3 * cT * (1 - 0.6 * s2)) * (1 - 0.22 * smooth(reach / 2.0) + 0.3 * smooth((reach - 1.6) / 1.8));
      rT += 0.12 * Math.pow(s2, 0.7) * Math.sin(1.7 * t - 6.0 * reach / 2.8 * 2.2 + 3 * tph);
      var yT = 0.02 + reach * (1 + 0.07 * cT);
      var trT = Math.pow(s2, 1.5);
      var bx = rT * Math.cos(thT) + trailX * trT + 0.07 * Math.pow(s2, 1.3) * Math.sin(1.25 * t - 4 * s2 + tph);
      var bz = rT * Math.sin(thT);
      var by = yT + trailY * trT;
      var taper = 1 - 0.55 * s2;
      var tf = s2 > 0.72 ? 1 - smooth((s2 - 0.72) / 0.28) * 0.9 : 1;
      var tWay = 0.25 + 0.75 * s2;
      for (j = 0; j < N_STRAND; j++) {
        var off = (j - (N_STRAND - 1) / 2) * gap * taper;
        // strands wander a little against each other so the ribbon braids
        var wob = 0.25 * gap * Math.sin(5 * s2 - 1.9 * t + j * 1.7 + tph);
        project(bx + off + wob, by, bz);
        if (i > 0) {
          var dl = (0.5 + 0.35 * (j === 1 || j === 2 ? 1 : 0.6)) * tf;
          put(pX, pY, pZ, K_TENT, dl, tWay, 2, strokeChar((pX - prevX[j]) / CW, (pY - prevY[j]) / CH));
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
      // outward normal from the empty neighbours
      var gx = (eR ? 2 : 0) - (eL ? 2 : 0) + (eUR ? 1 : 0) + (eDR ? 1 : 0) - (eUL ? 1 : 0) - (eDL ? 1 : 0);
      var gy = (eD ? 2 : 0) - (eU ? 2 : 0) + (eDL ? 1 : 0) + (eDR ? 1 : 0) - (eUL ? 1 : 0) - (eUR ? 1 : 0);
      var agx = gx < 0 ? -gx : gx, agy = gy < 0 ? -gy : gy;
      var ec;
      if (agx === 0 && agy === 0) continue;
      if (agx > 2.2 * agy) ec = 124;                       // side wall |
      else if (agy > 2.2 * agx) ec = gy < 0 ? 45 : 95;     // crown - / underside _
      else ec = (gx * gy > 0) ? 47 : 92;                   // up-left & down-right: '/'
      edgeA[id] = 1;
      M.gch[id] = ec;
    }
  }
  for (var e = 0; e < W * H; e++) {
    if (edgeA[e]) { kind[e] = K_RIM; if (M.lum[e] < 0.5) M.lum[e] = 0.5; }
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
        kind[mid] = K_BG; M.gch[mid] = chm; M.lum[mid] = 0.32 - ly * 0.03; M.ink[mid] = 10 + i;
      }
    }
  }

  // ---- sparks ------------------------------------------------------------
  var sp = S.sparks, alive = 0;
  for (i = 0; i < sp.length; i++) {
    var p = sp[i];
    p.life += dt;
    if (p.life >= p.max) continue;
    var dr = Math.exp(-2.2 * dt);
    p.vx *= dr; p.vy = p.vy * dr + 1.2 * dt;  // slow sink
    p.x += p.vx * dt; p.y += p.vy * dt;
    sp[alive++] = p;
    var pxi = p.x | 0, pyi = p.y | 0;
    if (pxi < 0 || pyi < 0 || pxi >= W || pyi >= H) continue;
    var pid = pyi * W + pxi, f = p.life / p.max;
    kind[pid] = K_SPARK;
    M.gch[pid] = f < 0.25 ? 42 : f < 0.6 ? 43 : 46;  // * + .
    M.lum[pid] = 1 - f;
    M.dep[pid] = 1; M.way[pid] = 0;
    M.ink[pid] = 20 + (i % 8);
  }
  sp.length = alive;

  // ---- composite -------------------------------------------------------------
  var po = PALETTES[wOld], pn = PALETTES[wNew];
  var hudRow = H - 2;
  var chars = 0;
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
        if (ik === 9) { rr = 125; gg = 145; bb = 195; }
        else { var mc = minis[ik - 10].col; rr = mc[0]; gg = mc[1]; bb = mc[2]; }
        drawChar(String.fromCharCode(code2), xc, yc, rr, gg, bb, lm);
        continue;
      }
      if (kd === K_SPARK) {
        var sc = PALETTES[S.wave ? wNew : S.pal][1];
        var wh = Math.sqrt(lm);
        drawChar(String.fromCharCode(code2), xc, yc,
          (sc[0] + (255 - sc[0]) * wh) | 0, (sc[1] + (255 - sc[1]) * wh) | 0, (sc[2] + (255 - sc[2]) * wh) | 0,
          0.6 + 0.4 * lm);
        chars++;
        continue;
      }
      var inkI = M.ink[ci];
      var o = po[inkI], n2 = pn[inkI];
      var wy = M.way[ci];
      var on = 0, band = 0;
      if (wf > -5) {
        on = smooth((wf - wy) / 0.18 + 0.5);
        var bd = (wf - wy) / 0.13;
        band = Math.exp(-bd * bd);
      }
      rr = o[0] + (n2[0] - o[0]) * on;
      gg = o[1] + (n2[1] - o[1]) * on;
      bb = o[2] + (n2[2] - o[2]) * on;
      if (kd === K_RIM || kd === K_ARME) {  // pale edges
        rr += (235 - rr) * 0.35; gg += (240 - gg) * 0.35; bb += (255 - bb) * 0.35;
      }
      var lit = 0.78 + 0.45 * lm;
      rr *= lit; gg *= lit; bb *= lit;
      if (lm > 0.6) {  // specular: the lit front goes icy white
        var spw = (lm - 0.6) * 1.1;
        rr += (255 - rr) * spw; gg += (255 - gg) * spw; bb += (255 - bb) * spw;
      }
      // depth: far layers keep their hue, just a little darker (no grey mud)
      var fog = 1 - (1 - M.dep[ci]) * 0.35;
      rr *= fog; gg *= fog; bb *= fog;
      if (band > 0.01) {
        var bw = band * 0.95;
        rr += (255 - rr) * bw; gg += (255 - gg) * bw; bb += (255 - bb) * bw;
      }
      al2 = 0.78 + 0.35 * lm + band * 0.5;
      if (al2 > 1) al2 = 1;
      al2 *= 0.85 + 0.15 * M.dep[ci];
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
