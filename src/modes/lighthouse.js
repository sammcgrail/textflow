import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Lighthouse — a night coastline after Lord Kelvin's proposal that every
// lighthouse should flash its own Morse letter so a ship could tell one
// light from another. Each light on the headland keys a distinct letter
// (dot = 1 unit, dash = 3, 1-unit gaps inside the letter, 7 between
// repeats) while its rotating beam sweeps the sea, lighting the swell it
// passes over. Fog banks drift in and soak up the light; ships cross.
// Tap a lighthouse to give it a new letter; tap the sea to send a ship.

var MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..'
};
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
var UNIT = 0.24; // seconds per Morse unit
var BEAMCH = ['-', '/', '\\', '|', '*'];

var S = null; // scene
var lastT = 0;

function rnd(seed) { // deterministic hash 0..1
  var s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function schedule(letter) {
  var code = MORSE[letter], seq = [], t = 0;
  for (var i = 0; i < code.length; i++) {
    var d = code[i] === '.' ? 1 : 3;
    seq.push({ s: t, e: t + d });
    t += d + 1;
  }
  return { seq: seq, total: t - 1 + 7 };
}

function setLetter(L, letter, now) {
  L.letter = letter;
  L.code = MORSE[letter];
  L.sched = schedule(letter);
  L.off = -now; // start the new letter from its first element right away
  L.changed = now;
}

// lamp level 0..1 with a quick rise and a short afterglow, plus the
// index of the element currently being keyed (-1 in a gap)
function lampLevel(L, t) {
  var m = ((t + L.off) / UNIT) % L.sched.total;
  if (m < 0) m += L.sched.total;
  var lv = 0, idx = -1, seq = L.sched.seq;
  for (var i = 0; i < seq.length; i++) {
    var el = seq[i];
    if (m >= el.s && m < el.e) { idx = i; lv = Math.min(1, (m - el.s) / 0.12); break; }
    if (m >= el.e && m < el.e + 0.45) lv = Math.max(lv, 1 - (m - el.e) / 0.45);
  }
  return { lv: lv, idx: idx };
}

function wrapPi(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

function initLighthouse() {
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_H > 0 ? state.CHAR_W / state.CHAR_H : 0.5;
  var coastY = Math.round(H * 0.47);
  var horizonY = coastY - Math.max(3, Math.round(H * 0.1));
  var fy = H * 0.55, fx = fy / ar, camH = 1;
  var Z0 = fy * camH / (coastY - horizonY);
  var n = W >= 150 ? 5 : W >= 100 ? 4 : 3;
  var initial = n === 3 ? 'KLV' : n === 4 ? 'KLVN' : 'KELVN';
  var seed = 7.3;

  // headland positions
  var lights = [];
  for (var i = 0; i < n; i++) {
    var lx = Math.round(W * (i + 0.5) / n + (rnd(seed + i) - 0.5) * W / n * 0.25);
    lights.push({ lx: lx });
  }

  // land profile: low jagged coast with a cliff headland under each light
  var top = new Int16Array(W), farTop = new Int16Array(W);
  var peakH = Math.max(7, Math.round(H * 0.15));
  var pw = Math.max(4, W / n * 0.2);
  for (var x = 0; x < W; x++) {
    var h = 1.6 + 1.4 * Math.sin(x * 0.11 + 1.7) + 0.9 * Math.sin(x * 0.29 + 0.4);
    for (var j = 0; j < n; j++) {
      var d = Math.abs(x - lights[j].lx) / pw;
      // flat-topped headland with a steep seaward drop
      h += peakH * Math.exp(-Math.pow(d, 3.2)) * (0.85 + 0.3 * rnd(seed + j * 3.1));
    }
    h += (rnd(x * 1.37 + 2) - 0.5) * 1.6;
    if (h < 0.6) h = 0.6;
    top[x] = Math.round(coastY - h);
    farTop[x] = Math.round(horizonY - 1.5 - 2.2 * (0.5 + 0.5 * Math.sin(x * 0.06 + 2.2)) - 1.2 * Math.sin(x * 0.17));
  }
  // flatten the summit under each tower so the sprite sits on rock
  for (var k = 0; k < n; k++) {
    var L = lights[k];
    var t0 = 9999;
    for (var dx = -2; dx <= 2; dx++) { var xx = L.lx + dx; if (xx >= 0 && xx < W) t0 = Math.min(t0, top[xx]); }
    t0 = Math.max(t0, 7);
    t0 = Math.min(t0, coastY - 4);
    for (var dx2 = -2; dx2 <= 2; dx2++) { var x2 = L.lx + dx2; if (x2 >= 0 && x2 < W) top[x2] = t0; }
    L.top = t0;
    L.ly = t0 - 5;               // lantern row
    L.X = (L.lx - W / 2) * Z0 / fx;
    L.Z = Z0 * 0.98;
    L.Hl = camH + (horizonY - L.ly) * Z0 / fy;
    L.P = 7 + k * 0.8;             // rotation period (s)
    L.dir = k % 2 ? -1 : 1;
    L.camAng = Math.atan2(-L.X, L.Z);
    // stagger the sweeps so a beam swings past the viewer every second or so
    L.ph = L.camAng - L.dir * (3.4 + k * 1.15) * Math.PI * 2 / L.P;
    setLetter(L, initial[k], 0);
    L.off = rnd(seed + k * 4.4) * 4;
    L.changed = -10;
  }

  // stars
  var starMap = new Float32Array(W * H);
  var nStars = Math.round(W * coastY * 0.045);
  for (var s = 0; s < nStars; s++) {
    var sx = (rnd(s * 3.3 + 1) * W) | 0, sy = (Math.pow(rnd(s * 5.1 + 2), 1.4) * (coastY - 1)) | 0;
    starMap[sy * W + sx] = 0.2 + rnd(s * 7.7) * 0.8;
  }

  var fog = [];
  var nf = W > 120 ? 4 : 3;
  for (var f = 0; f < nf; f++) {
    fog.push({
      x: rnd(f * 2.9 + 5) * W,
      y: coastY - 1 + rnd(f * 6.1 + 1) * (H - coastY) * 0.55,
      rx: W * (0.14 + rnd(f * 1.3) * 0.12),
      ry: 1.6 + rnd(f * 8.2) * 2.2,
      v: (0.6 + rnd(f * 3.7) * 0.9) * (f % 2 ? -1 : 1),
      a: 0.55 + rnd(f * 4.9) * 0.4
    });
  }

  S = {
    w: W, h: H, ar: ar, coastY: coastY, horizonY: horizonY, fx: fx, fy: fy, camH: camH, Z0: Z0,
    lights: lights, top: top, farTop: farTop, starMap: starMap, fog: fog,
    air: new Float32Array(W * H), airDir: new Uint8Array(W * H), sea: new Float32Array(W * H),
    fogBuf: new Float32Array(W * H), occ: new Uint8Array(W * H),
    ships: [], nextShip: 1.5
  };
  spawnShip(Math.round(coastY + (H - coastY) * 0.42), 1, W * 0.18);
  lastT = 0;
}

function spawnShip(row, dir, x) {
  if (S.ships.length >= 4) S.ships.shift();
  S.ships.push({ x: x !== undefined ? x : (dir > 0 ? -8 : S.w + 1), y: row, dir: dir, v: 1.6 + Math.random() * 1.2 });
}

// splat a soft ellipse into the air-light buffer (max blend)
var splatDir = 0;
function splat(cx, cy, rw, rh, val) {
  var W = S.w, air = S.air;
  var x0 = Math.max(0, Math.floor(cx - rw)), x1 = Math.min(W - 1, Math.ceil(cx + rw));
  var y0 = Math.max(0, Math.floor(cy - rh)), y1 = Math.min(S.coastY, Math.ceil(cy + rh));
  for (var y = y0; y <= y1; y++) {
    var dy = (y - cy) / rh;
    for (var x = x0; x <= x1; x++) {
      var dx = (x - cx) / rw;
      var d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      var v = val * (1 - d2);
      var i = y * W + x;
      if (v > air[i]) { air[i] = v; S.airDir[i] = splatDir; }
    }
  }
}

function mix(a, b, k) { return a + (b - a) * k; }

function renderLighthouse() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!S || S.w !== W || S.h !== H) initLighthouse();
  var t = state.time;
  var dt = t - lastT; if (dt < 0 || dt > 0.1) dt = 0.016; lastT = t;
  var coastY = S.coastY, horizonY = S.horizonY, fx = S.fx, fy = S.fy, camH = S.camH;
  var lights = S.lights, top = S.top, air = S.air, sea = S.sea, fogBuf = S.fogBuf, occ = S.occ;
  var n = lights.length, i, x, y, k, L;

  // ---- input ----
  if (pointer.clicked && state.currentMode === 'lighthouse') {
    pointer.clicked = false;
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy), hit = false;
    for (k = 0; k < n; k++) {
      L = lights[k];
      if (Math.abs(gx - L.lx) <= 3 && gy >= L.ly - 3 && gy <= L.top + 3) {
        var used = {}, pool = [];
        for (var u = 0; u < n; u++) used[lights[u].letter] = 1;
        for (var c = 0; c < LETTERS.length; c++) if (!used[LETTERS[c]]) pool.push(LETTERS[c]);
        setLetter(L, pool[(Math.random() * pool.length) | 0], t);
        hit = true;
        break;
      }
    }
    if (!hit && gy > coastY + 1 && gy < H - 1) spawnShip(Math.max(gy, coastY + 4), gx < W / 2 ? 1 : -1);
  }

  // ---- per-light state ----
  for (k = 0; k < n; k++) {
    L = lights[k];
    var st = lampLevel(L, t);
    L.lv = st.lv; L.idx = st.idx;
    L.phi = L.ph + L.dir * t * Math.PI * 2 / L.P;
    L.face = Math.max(0, Math.cos(wrapPi(L.phi - L.camAng)));
    L.beam = 0.07 + 0.93 * L.lv; // occulting light keeps a faint ember
  }

  // ---- fog field ----
  var fog = S.fog, fy0 = Math.max(0, coastY - 7);
  for (var f = 0; f < fog.length; f++) {
    var fb = fog[f];
    fb.x += fb.v * dt;
    if (fb.v > 0 && fb.x - fb.rx * 2 > W) fb.x = -fb.rx * 2;
    if (fb.v < 0 && fb.x + fb.rx * 2 < 0) fb.x = W + fb.rx * 2;
  }
  fogBuf.fill(0, 0, fy0 * W);
  for (y = fy0; y < H; y++) {
    for (x = 0; x < W; x++) {
      var fv = 0;
      for (f = 0; f < fog.length; f++) {
        fb = fog[f];
        var ddx = (x - fb.x) / fb.rx, ddy = (y - fb.y) / fb.ry;
        var e = ddx * ddx + ddy * ddy;
        if (e < 6) fv += fb.a * Math.exp(-e) * (0.75 + 0.25 * Math.sin(x * 0.35 + y * 1.3 + t * 0.7 + f));
      }
      fogBuf[y * W + x] = fv > 1 ? 1 : fv;
    }
  }

  // ---- air beams (above horizon) ----
  air.fill(0);
  for (k = 0; k < n; k++) {
    L = lights[k];
    var sp = Math.sin(L.phi), cp = Math.cos(L.phi);
    var tMax = S.Z0 * 4.5;
    var NS = state.isMobile ? 110 : 170;
    var psx = L.lx, psy = L.ly;
    for (var s = 1; s <= NS; s++) {
      var tt = tMax * Math.pow(s / NS, 1.7);
      var Px = L.X + tt * sp, Pz = L.Z - tt * cp, Py = L.Hl - tt * 0.035;
      if (Pz < 2.2 || Py < camH) break;
      var bw = 0.07 + tt * 0.11;
      var sx = W / 2 + fx * Px / Pz, sy = horizonY - fy * (Py - camH) / Pz;
      var rw = Math.min(11, Math.max(0.7, fx * bw / Pz)), rh = Math.min(6, Math.max(0.85, fy * bw / Pz));
      var ddx2 = (sx - psx) * S.ar, ddy2 = sy - psy;
      if (ddx2 * ddx2 + ddy2 * ddy2 > 0.01) {
        var sl = Math.abs(ddy2) / (Math.abs(ddx2) + 1e-6);
        splatDir = sl < 0.4 ? 0 : sl > 2.5 ? 3 : (ddx2 * ddy2 < 0 ? 1 : 2);
        psx = sx; psy = sy;
      }
      if (sx < -rw || sx > W + rw || sy < -rh || sy > coastY + rh) continue;
      splat(sx, sy, rw, rh, L.beam * Math.exp(-tt / (S.Z0 * 3)));
    }
    // lantern halo, bigger when the beam faces us
    splatDir = 4;
    var hr = 1.6 + L.lv * (1.2 + 3.5 * Math.pow(L.face, 6));
    splat(L.lx, L.ly, hr, hr * S.ar * 1.3, L.lv * (0.35 + 0.5 * L.face));
  }

  // ---- sea light ----
  for (y = coastY + 1; y < H; y++) {
    var Z = fy * camH / (y - horizonY);
    for (x = 0; x < W; x++) {
      var X = (x - W / 2) * Z / fx, lt = 0;
      for (k = 0; k < n; k++) {
        L = lights[k];
        var dx = X - L.X, dz = L.Z - Z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        var diff = wrapPi(Math.atan2(dx, dz) - L.phi);
        var aw = 0.11 + 1.1 / (dist + 2);
        var q = diff / aw;
        if (q < 3 && q > -3) lt += L.beam * Math.exp(-q * q) * Math.exp(-dist / (S.Z0 * 1.6)) * 1.3;
        // shimmering reflection column straight below the lamp
        var rx = (x - L.lx) / (0.7 + 0.12 * (y - coastY));
        if (rx < 3 && rx > -3) {
          var sh = 0.5 + 0.5 * Math.sin(y * 2.1 - t * 5 + x * 0.7);
          lt += L.lv * (0.5 + 0.5 * L.face) * Math.exp(-rx * rx) * Math.exp(-(y - coastY) / 10) * sh;
        }
      }
      sea[y * W + x] = lt;
    }
  }

  // ---- occupancy: sprites, labels, ships, hint ----
  occ.fill(0);
  for (k = 0; k < n; k++) {
    L = lights[k];
    for (y = L.ly - 1; y <= L.top - 1; y++) for (x = L.lx - 2; x <= L.lx + 2; x++) if (x >= 0 && x < W && y >= 0) occ[y * W + x] = 1;
    var lw = L.code.length * 2 - 1;
    for (x = L.lx - (lw >> 1) - 1; x <= L.lx + (lw >> 1) + 1; x++) {
      if (x < 0 || x >= W) continue;
      if (L.top + 1 < coastY) occ[(L.top + 1) * W + x] = 1;
      if (L.top + 2 < coastY) occ[(L.top + 2) * W + x] = 1;
    }
  }
  var ships = S.ships;
  S.nextShip -= dt;
  if (S.nextShip <= 0) {
    S.nextShip = 9 + Math.random() * 8;
    if (ships.length < 2) spawnShip(Math.round(coastY + 4 + Math.random() * (H - coastY - 8)), Math.random() < 0.5 ? 1 : -1);
  }
  for (var si = ships.length - 1; si >= 0; si--) {
    var sh2 = ships[si];
    sh2.x += sh2.dir * sh2.v * dt;
    if (sh2.x < -12 || sh2.x > W + 12) { ships.splice(si, 1); continue; }
    var bx = Math.round(sh2.x);
    for (y = sh2.y - 2; y <= sh2.y; y++) for (x = bx - 1; x <= bx + 7; x++) if (x >= 0 && x < W && y < H) occ[y * W + x] = 1;
  }
  var hint = 'tap a light to change its letter';
  var hy = H - 1, hx = Math.max(0, ((W - hint.length) / 2) | 0);
  for (x = hx; x < hx + hint.length && x < W; x++) occ[hy * W + x] = 1;

  // ---- main pass ----
  var farTop = S.farTop, starMap = S.starMap;
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (occ[i]) continue;
      var fg = fogBuf[i];
      if (y < top[x]) {
        // sky
        var a = air[i] * (1 - 0.35 * fg);
        var star = starMap[i];
        if (a > 0.1) {
          var dch = BEAMCH[S.airDir[i]];
          var ch;
          if (dch === '*') ch = a > 0.6 ? '*' : a > 0.38 ? '+' : a > 0.22 ? '\u00b7' : '.';
          else {
            ch = a > 0.62 ? dch : a > 0.4 ? ':' : a > 0.22 ? '\u00b7' : '.';
            if (a > 0.85 && dch === '-') ch = '=';
          }
          var kk = Math.min(1, a * 1.1);
          drawChar(ch, x, y, mix(60, 255, kk) | 0, mix(50, 196, kk) | 0, mix(40, 110, kk) | 0, Math.min(1, 0.35 + a));
        } else if (y >= farTop[x] && y < coastY) {
          if (y === farTop[x]) drawChar(farTop[x - 1] > y ? '/' : farTop[x + 1] > y ? '\\' : '_', x, y, 40, 48, 70, 1);
          else if (rnd(x * 2.3 + y * 7.9) < 0.22) drawChar('.', x, y, 30, 36, 54, 1);
        } else if (star > 0) {
          var tw = 0.55 + 0.45 * Math.sin(t * (1.3 + star * 2) + x * 7.1 + y * 3.3);
          var b = star * tw;
          var sc = b > 0.75 ? '*' : b > 0.45 ? '+' : b > 0.25 ? '\u00b7' : '.';
          drawChar(sc, x, y, (150 + 80 * b) | 0, (165 + 70 * b) | 0, 225, 0.35 + 0.65 * b);
        } else if (fg > 0.4) {
          drawChar('-', x, y, 70, 82, 100, fg * 0.6);
        }
      } else if (y < coastY) {
        // land: dark rock, rim-lit by starlight and the lamps
        var spill = 0;
        for (k = 0; k < n; k++) {
          L = lights[k];
          var dd = Math.abs(x - L.lx) + Math.abs(y - L.ly) * 1.6;
          spill += L.lv * Math.exp(-dd / 5) * 0.8;
        }
        var lc;
        if (y === top[x]) {
          var lft = x > 0 ? top[x - 1] : top[x], rgt = x < W - 1 ? top[x + 1] : top[x];
          lc = lft > top[x] ? '/' : rgt > top[x] ? '\\' : (rnd(x) > 0.5 ? '^' : '_');
        } else {
          var hsh = rnd(x * 17.3 + y * 5.1);
          lc = y === top[x] + 1 ? (hsh > 0.5 ? ':' : '.') : hsh > 0.92 ? '#' : hsh > 0.8 ? '%' : hsh > 0.62 ? ':' : hsh > 0.45 ? '.' : ' ';
        }
        var rim = y === top[x] ? 1 : y === top[x] + 1 ? 0.5 : 0.12;
        var r0 = 22 + 60 * rim, g0 = 26 + 66 * rim, b0 = 40 + 84 * rim;
        var sk = Math.min(1, spill);
        var r1 = mix(r0, 220, sk * 0.7), g1 = mix(g0, 150, sk * 0.7), b1 = mix(b0, 70, sk * 0.7);
        if (fg > 0.05) { r1 = mix(r1, 80, fg * 0.5); g1 = mix(g1, 92, fg * 0.5); b1 = mix(b1, 110, fg * 0.5); }
        drawChar(lc, x, y, r1 | 0, g1 | 0, b1 | 0, 1);
      } else if (y === coastY) {
        // surf line
        var sv = Math.sin(x * 0.9 + t * 2.3) + Math.sin(x * 0.37 - t * 1.4);
        var lsurf = sea[Math.min(H - 1, y + 1) * W + x];
        var fc = sv > 0.9 ? '~' : sv > -0.2 ? '-' : sv > -1 ? '.' : ',';
        var fk = Math.min(1, lsurf);
        drawChar(fc, x, y, mix(120, 255, fk) | 0, mix(140, 205, fk) | 0, mix(170, 130, fk) | 0, 0.55 + 0.25 * (sv + 2) / 4 + fk * 0.2);
      } else {
        // sea
        var Zs = fy * camH / (y - horizonY);
        var Xs = (x - W / 2) * Zs / fx;
        var near = (y - coastY) / (H - coastY); // 0 far .. 1 near
        var swell = Math.sin(Xs * 4.2 + Zs * 6.5 - t * 1.1) * 0.5 +
          Math.sin(Xs * 1.9 - Zs * 3.6 + t * 0.7 + 1.3) * 0.32 +
          Math.sin(Xs * 9.5 + Zs * 12 - t * 2.1) * 0.18 * (1 - near * 0.5);
        var nv = (swell + 1.08) / 2.16; // 0..1
        var lit = sea[i] * (1 - 0.65 * fg);
        var sch;
        var rip = 0.5 + 0.5 * Math.sin(x * (0.55 + 0.4 * (1 - near)) - t * 1.6 + y * 2.3 + swell * 2.5);
        var wv = nv * 0.65 + rip * 0.35;
        if (wv > 0.78) sch = lit > 0.5 && nv > 0.85 ? '*' : '~';
        else if (wv > 0.6) sch = rip > 0.6 ? '~' : '-';
        else if (wv > 0.45) sch = '-';
        else if (wv > 0.3) sch = rip > 0.5 ? '.' : ',';
        else sch = lit > 0.2 ? '.' : ' ';
        var catchK = Math.min(1, lit * (0.6 + 0.8 * nv));
        var rb = 16 + 36 * nv, gb = 46 + 80 * nv, bb = 105 + 115 * nv;
        var rr = mix(rb, 255, catchK), gg = mix(gb, 188, catchK), bl = mix(bb, 92, catchK);
        if (fg > 0.25 && rnd(x * 3.7 + y * 11.3 + Math.floor(t * 1.5 + x * 0.05)) < fg * 0.9) {
          // fog bank sitting on the water; glows where a beam crosses it
          var fl = Math.min(1, sea[i] * 0.9);
          var fh = rnd(x * 5.3 + y * 2.9);
          sch = fg > 0.65 ? (fh > 0.5 ? '-' : ':') : fh > 0.5 ? '\u00b7' : '.';
          rr = mix(70, 240, fl); gg = mix(84, 180, fl); bl = mix(104, 112, fl);
          drawChar(sch, x, y, rr | 0, gg | 0, bl | 0, 0.4 + fg * 0.5 + fl * 0.25);
          continue;
        }
        drawChar(sch, x, y, rr | 0, gg | 0, bl | 0, Math.min(1, 0.45 + 0.4 * nv + catchK * 0.4 + near * 0.15));
      }
    }
  }

  // ---- lighthouses ----
  for (k = 0; k < n; k++) {
    L = lights[k];
    var cx = L.lx, ly = L.ly;
    var lfog = fogBuf[ly * W + cx] || 0;
    var on = L.lv * (1 - 0.5 * lfog);
    var lampCh = on > 0.6 ? '@' : on > 0.25 ? 'O' : 'o';
    var towerLit = 0.25 + 0.5 * on;
    put('/', cx - 1, ly - 1, 70, 76, 96);
    put('^', cx, ly - 1, 120, 110, 100);
    put('\\', cx + 1, ly - 1, 70, 76, 96);
    put('[', cx - 1, ly, 90, 90, 110);
    put(']', cx + 1, ly, 90, 90, 110);
    drawChar(lampCh, cx, ly, mix(110, 255, on) | 0, mix(90, 236, on) | 0, mix(60, 180, on) | 0, 1);
    put('-', cx - 2, ly + 1, 80, 84, 100); put('=', cx - 1, ly + 1, 110, 110, 125);
    put('=', cx, ly + 1, 110, 110, 125); put('=', cx + 1, ly + 1, 110, 110, 125); put('-', cx + 2, ly + 1, 80, 84, 100);
    for (var ty = ly + 2; ty <= L.top - 2; ty++) {
      var red = (ty - ly) % 2 === 0;
      var tr = red ? 190 : 210, tg = red ? 60 : 210, tb = red ? 55 : 215;
      var tk = towerLit * (ty === ly + 2 ? 1 : 0.8);
      put('|', cx - 1, ty, (tr * tk) | 0, (tg * tk) | 0, (tb * tk) | 0);
      put(red ? '#' : '|', cx, ty, (tr * tk) | 0, (tg * tk) | 0, (tb * tk) | 0);
      put('|', cx + 1, ty, (tr * tk) | 0, (tg * tk) | 0, (tb * tk) | 0);
    }
    put('/', cx - 2, L.top - 1, 90, 92, 110); put('_', cx - 1, L.top - 1, 90, 92, 110);
    put('_', cx, L.top - 1, 90, 92, 110); put('_', cx + 1, L.top - 1, 90, 92, 110); put('\\', cx + 2, L.top - 1, 90, 92, 110);

    // label: the letter, and its Morse with the keyed element lit
    var fresh = Math.max(0, 1 - (t - L.changed) / 1.5);
    if (L.top + 1 < coastY) {
      var lb = 0.55 + 0.45 * Math.max(on, fresh);
      drawChar(L.letter, cx, L.top + 1, (255 * lb) | 0, (200 * lb) | 0, (110 * lb) | 0, 1);
    }
    if (L.top + 2 < coastY) {
      var lw2 = L.code.length * 2 - 1, mx = cx - (lw2 >> 1);
      for (var m = 0; m < L.code.length; m++) {
        var act = m === L.idx;
        var mc = L.code[m] === '.' ? '\u00b7' : '-';
        if (act) drawChar(mc, mx + m * 2, L.top + 2, 255, 215, 130, 1);
        else drawChar(mc, mx + m * 2, L.top + 2, 150, 120, 85, 0.75);
      }
    }
  }

  // ---- ships ----
  for (si = 0; si < ships.length; si++) {
    var sp2 = ships[si], sx0 = Math.round(sp2.x), sy0 = sp2.y;
    var slt = Math.min(1, sea[Math.min(H - 1, sy0) * W + Math.max(0, Math.min(W - 1, sx0 + 3))] || 0);
    var hr2 = mix(70, 240, slt) | 0, hg = mix(78, 170, slt) | 0, hb = mix(100, 90, slt) | 0;
    var right = sp2.dir > 0;
    var rows = right ? ['  |\\   ', '__|_\\__', '\\_o_o_/'] : ['   /|  ', '__/_|__', '\\_o_o_/'];
    for (var r = 0; r < 3; r++) {
      var row = rows[r], yy = sy0 - 2 + r;
      if (yy <= coastY || yy >= H) continue;
      for (var cc = 0; cc < row.length; cc++) {
        var chh = row[cc];
        if (chh === ' ') continue;
        if (chh === 'o') put('o', sx0 + cc, yy, 255, 210, 120);
        else put(chh, sx0 + cc, yy, hr2, hg, hb);
      }
    }
    // running light and wake
    var blink = Math.sin(t * 4 + si) > 0;
    if (blink) put('.', right ? sx0 + 6 : sx0, sy0 - 1, right ? 90 : 230, right ? 230 : 70, right ? 120 : 70);
    var wk = right ? sx0 - 1 : sx0 + 7;
    put('~', wk, sy0, 150, 175, 200);
  }

  // ---- hint ----
  for (var hc = 0; hc < hint.length && hx + hc < W; hc++) {
    if (hint[hc] !== ' ') drawChar(hint[hc], hx + hc, hy, 110, 120, 150, 0.6);
  }

  function put(ch, px, py, r, g, b) {
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    drawChar(ch, px, py, r, g, b, 1);
  }
}

registerMode('lighthouse', { init: initLighthouse, render: renderLighthouse });
