import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// chasm — volumetric first-person flythrough of an endless neon slot-cavern.
//
// Dual-surface voxel-space raycaster (Comanche-style, but with a ceiling):
// each screen column marches a ray forward through view-depth, sampling a
// procedural floor and ceiling heightfield. Two y-buffers per column give
// true hidden-surface occlusion (near rock hides far rock, bends hide what's
// behind them); a full per-cell z-buffer occludes sprites (gates, pulses,
// motes) against the terrain. Perspective divide + character-aspect-corrected
// vertical scale, so geometry is round, not squashed.
//
// Interaction:
//   hold + drag horizontally — steer yaw; the camera banks into the turn
//   hold + drag vertically   — set altitude between floor and ceiling
//   release                  — autopilot re-centers on the canyon path
//   tap                      — speed boost + a light pulse ring that races
//                              ahead down the canyon into the vanishing point

var chZbuf = null, chCells = 0;
var chCamX = 0, chCamZ = 0, chCamH = 5, chYaw = 0;
var chBank = 0, chHorizOff = 0, chLastT = -1;
var chBoost = 0, chFlash = 0;
var chGates = null, chMotes = null, chPulses = null;
var chSprites = [];
var chTArr = new Float32Array(100);
var chFogArr = new Float32Array(100);

// frame-scope shared vars (set at top of render, used by helpers)
var chW = 0, chH = 0, chFc = 1, chFv = 1, chHor = 0;
var chSinY = 0, chCosY = 1, chCamHd = 0, chFogK = 0.034, chFar = 95;

// ---------------------------------------------------------------
// Procedural canyon definition (world units; +z = down the canyon)
// ---------------------------------------------------------------
function chCenter(z) {
  return 6.2 * Math.sin(z * 0.041) + 3.1 * Math.sin(z * 0.113 + 1.7) + 1.2 * Math.sin(z * 0.257 + 4.1);
}
function chHalfW(z) {
  var w = 3.8 + 1.5 * Math.sin(z * 0.067 + 0.9) + 0.7 * Math.sin(z * 0.031 + 2.2);
  return w < 2.2 ? 2.2 : w;
}
function chFloorB(z) {
  return 1.1 * Math.sin(z * 0.083) + 0.55 * Math.sin(z * 0.19 + 2.0);
}
function chCeilB(z) {
  return 9.5 + 1.3 * Math.sin(z * 0.047 + 2.6) + 0.6 * Math.sin(z * 0.148 + 0.7);
}
function chSS(a, b, x) {
  var t = (x - a) / (b - a);
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return t * t * (3 - 2 * t);
}

// sample output (module scratch — no per-sample allocation)
var chFl = 0, chCl = 0, chU = 0, chS = 0;
function chSample(wx, wz) {
  var c = chCenter(wz);
  var hw = chHalfW(wz);
  chU = (wx - c) / hw;
  var au = chU < 0 ? -chU : chU;
  if (au > 1.15) { // deep inside rock — always solid, skip fine detail
    chS = 1; chFl = 99; chCl = -99;
    return;
  }
  chS = chSS(0.62, 1.15, au);
  var s2 = chS * chS;
  var n = 0.6 * Math.sin(wx * 1.27 + wz * 0.63) + 0.38 * Math.sin(wx * 2.63 - wz * 1.41 + 1.0);
  chFl = chFloorB(wz) + s2 * 15 + n * (0.22 + chS * 1.1);
  var stal = 1.35 * Math.sin(wx * 0.83 + wz * 0.29 + 5.0) + 1.05 * Math.sin(wx * 1.93 - wz * 0.61 + 1.3) - 1.55;
  if (stal < 0) stal = 0;
  var n2 = 0.5 * Math.sin(wx * 1.53 - wz * 0.77 + 3.3) + 0.3 * Math.sin(wx * 3.1 + wz * 1.9);
  chCl = chCeilB(wz) - s2 * 15 - n2 * (0.2 + chS * 0.9) - stal * 2.6;
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function initChasm() {
  chCamZ = 0;
  chCamX = chCenter(0);
  chCamH = (chFloorB(0) + chCeilB(0)) * 0.5;
  chYaw = Math.atan2(chCenter(6) - chCenter(0), 6);
  chBank = 0; chHorizOff = 0; chBoost = 0; chFlash = 0;
  chLastT = -1;
  chPulses = [];
  chGates = [];
  for (var i = 0; i < 4; i++) chGates.push({ z: 30 + i * 34 });
  var nm = state.isMobile ? 24 : 56;
  chMotes = [];
  for (var j = 0; j < nm; j++) chMotes.push({ x: 0, y: 0, z: -1e9, ph: Math.random() * 6.283 });
}

// ---------------------------------------------------------------
// Sprite projection (uses frame-scope vars; returns via scratch)
// ---------------------------------------------------------------
var chPsx = 0, chPsy = 0, chPzc = 0;
function chProject(wx, wy, wz) {
  var ddx = wx - chCamX, ddz = wz - chCamZ;
  var zc = ddx * chSinY + ddz * chCosY;
  if (zc < 0.5 || zc > chFar) return false;
  var xc = ddx * chCosY - ddz * chSinY;
  var sxi = Math.round(chW * 0.5 + chFc * xc / zc);
  if (sxi < 0 || sxi >= chW) return false;
  var horC = chHor - chBank * ((sxi - chW * 0.5) / (chW * 0.5));
  var syi = Math.round(horC - (wy - chCamHd) * chFv / zc);
  if (syi < 0 || syi >= chH) return false;
  chPsx = sxi; chPsy = syi; chPzc = zc;
  return true;
}
function chAddSprite(ch, h, s, l) {
  chSprites.push({ zc: chPzc, x: chPsx, y: chPsy, c: ch, h: h, s: s, l: l });
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function renderChasm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (W < 4 || H < 4) return;
  if (!chGates) initChasm();

  // lazy (re-)allocation on grid resize — camera state survives rotation
  if (chCells !== W * H) {
    chCells = W * H;
    chZbuf = new Float32Array(chCells);
  }

  var T = state.time;
  var dtF = T - chLastT;
  if (!(dtF > 0) || dtF > 0.25) dtF = 0.016;
  chLastT = T;

  var mob = state.isMobile;
  var FAR = mob ? 80 : 95;
  var STEPS = mob ? 84 : 92;
  var GROW = mob ? 1.03 : 1.024;
  var fogK = 3.2 / FAR;
  chFar = FAR; chFogK = fogK; chW = W; chH = H;

  // per-frame step tables: view depth + fog per march step (shared by columns)
  var tv = 0.9, dtv = 0.32, nSteps = 0;
  for (var st = 0; st < STEPS; st++) {
    tv += dtv; dtv *= GROW;
    if (tv > FAR) break;
    chTArr[st] = tv;
    var fg = 1 - tv / FAR;
    fg = fg * Math.sqrt(fg);
    var nf = (tv - 0.7) / 2.2;
    if (nf < 0.3) nf = 0.3; else if (nf > 1) nf = 1;
    chFogArr[st] = fg * nf;
    nSteps++;
  }

  // perspective: focal length in columns; vertical scale corrected for the
  // ~2:1 character cell aspect so circles are circles and walls aren't squashed
  var AR = (state.CHAR_H > 0 ? state.CHAR_W / state.CHAR_H : 0.5);
  var fc = W * 0.357;
  var fcv = (H * 0.44) / AR;
  if (fcv > fc) fc = fcv;          // portrait: cap vertical FOV instead
  var fv = fc * AR;
  chFc = fc; chFv = fv;

  // ---------------- interaction ----------------
  var held = false, stickX = 0, heightFrac = 0.5;
  if (pointer.clicked && state.currentMode === 'chasm') {
    pointer.clicked = false;
    chBoost = 1;
    chFlash += 0.35;
    chPulses.push({ z: chCamZ + 1.5, r: 1.1, age: 0 });
    if (chPulses.length > 4) chPulses.shift();
  } else if (pointer.down && state.currentMode === 'chasm') {
    held = true;
    stickX = (pointer.gx / W - 0.5) * 2;
    if (stickX > 1) stickX = 1; else if (stickX < -1) stickX = -1;
    if (stickX > -0.06 && stickX < 0.06) stickX = 0;
    var gyn = pointer.gy / H;
    if (gyn < 0) gyn = 0; else if (gyn > 1) gyn = 1;
    heightFrac = 1 - gyn;                      // top of screen = fly high
  }

  // ---------------- camera update ----------------
  var desired = Math.atan2(chCenter(chCamZ + 9) - chCamX, 9);
  if (held) {
    chYaw += stickX * 1.5 * dtF;
  } else {
    var dy0 = desired - chYaw;
    chYaw += dy0 * Math.min(1, dtF * 1.7);
  }
  // soft-clamp heading around the canyon tangent; always keep flying forward
  var tangent = Math.atan2(chCenter(chCamZ + 6) - chCenter(chCamZ), 6);
  if (chYaw > tangent + 0.62) chYaw = tangent + 0.62;
  if (chYaw < tangent - 0.62) chYaw = tangent - 0.62;
  if (chYaw > 1.35) chYaw = 1.35; else if (chYaw < -1.35) chYaw = -1.35;

  var bankT = (held ? stickX : Math.max(-0.8, Math.min(0.8, (desired - chYaw) * 1.4))) * H * 0.09;
  chBank += (bankT - chBank) * Math.min(1, dtF * 5);

  chBoost *= Math.exp(-dtF * 1.1);
  chFlash *= Math.exp(-dtF * 2.8);
  var spd = 9.5 + chBoost * 15;

  chCamX += Math.sin(chYaw) * spd * dtF;
  chCamZ += Math.cos(chYaw) * spd * dtF;

  // keep the camera inside the cavern
  var cc = chCenter(chCamZ), hw = chHalfW(chCamZ);
  if (chCamX < cc - hw + 1.35) chCamX = cc - hw + 1.35;
  if (chCamX > cc + hw - 1.35) chCamX = cc + hw - 1.35;
  chSample(chCamX, chCamZ);
  var flC = chFl, clC = chCl;
  var tH = flC + 1.2 + (clC - flC - 2.4) * heightFrac;
  chCamH += (tH - chCamH) * Math.min(1, dtF * 2.4);
  if (chCamH < flC + 1.0) chCamH = flC + 1.0;
  if (chCamH > clC - 1.0) chCamH = clC - 1.0;

  chHorizOff += ((tH - chCamH) * 1.6 - chHorizOff) * Math.min(1, dtF * 3);
  if (chHorizOff > 3) chHorizOff = 3; else if (chHorizOff < -3) chHorizOff = -3;
  var horizon = H * 0.5 + chHorizOff + Math.sin(T * 1.7) * 0.3;
  var camHd = chCamH + Math.sin(T * 1.3) * 0.12;   // gentle flight bob
  chHor = horizon; chCamHd = camHd;
  chSinY = Math.sin(chYaw); chCosY = Math.cos(chYaw);

  var baseHue = (chCamZ * 0.7 + T * 3) % 360;
  var flashL = chFlash * 16;
  var halfW2 = W * 0.5;

  chZbuf.fill(FAR + 5);

  // ---------------- terrain: per-column dual-surface raymarch ----------------
  var RL = RAMP_DENSE.length - 1;
  for (var sx = 0; sx < W; sx++) {
    var ang = Math.atan((sx + 0.5 - halfW2) / fc);
    var rayA = chYaw + ang;
    var dirx = Math.sin(rayA), dirz = Math.cos(rayA);
    var invCos = 1 / Math.cos(ang);
    var horC = horizon - chBank * ((sx - halfW2) / halfW2);
    var fTop = H;     // rows >= fTop are painted floor
    var cBot = -1;    // rows <= cBot are painted ceiling

    for (var stp = 0; stp < nSteps; stp++) {
      if (cBot + 1 >= fTop) break;   // column fully occluded

      var t = chTArr[stp];
      var fog = chFogArr[stp];
      var d = t * invCos;
      var wx = chCamX + dirx * d;
      var wz = chCamZ + dirz * d;
      chSample(wx, wz);
      var flH = chFl, clH = chCl, su = chU, ss = chS;
      var wallShade = 1 - ss * 0.45;           // lit floors, dimmer wall faces
      var wallHue = ss * 40 + t * 1.1;         // material + aerial hue shift
      var r, wy, bandF, band, frac, stripe, tex, br, ci, ch, hue, sat, lig;

      if (flH >= clH - 0.05) {
        // solid rock — wall face fills the remaining gap, column done
        for (r = cBot + 1; r < fTop; r++) {
          wy = camHd + (horC - r) * t / fv;
          bandF = wy * 1.35;
          band = Math.floor(bandF);
          frac = bandF - band;
          stripe = 0.5 + 0.5 * Math.sin(wz * 0.5 - T * 6.5 + band * 0.9);
          tex = 0.5 + 0.5 * Math.sin(wz * 2.1 + band * 3.1 + wx * 0.7);
          br = fog * (0.62 + 0.24 * stripe + 0.14 * tex) * 0.8;
          ci = (br * (RL + 0.99)) | 0; if (ci > RL) ci = RL;
          if (ci > 0) {
            hue = baseHue + band * 9 + 24 + t * 1.1;
            sat = 62 + fog * 33;
            lig = 7 + br * 58;
            ch = RAMP_DENSE[ci];
            if (frac < 0.16) { ch = '='; lig += 9; }
            lig += flashL; if (lig > 72) lig = 72;
            drawCharHSL(ch, sx, r, hue, sat, lig);
          }
          chZbuf[r * W + sx] = t;
        }
        cBot = fTop;
        break;
      }

      // ---- floor surface ----
      var syF = horC - (flH - camHd) * fv / t;
      var rF = Math.ceil(syF);
      if (rF < fTop) {
        var lo = rF;
        if (lo < cBot + 1) lo = cBot + 1;
        if (lo < 0) lo = 0;
        var river = (ss < 0.22) && (su > -0.45 && su < 0.45);
        for (r = lo; r < fTop; r++) {
          wy = camHd + (horC - r) * t / fv;
          bandF = wy * 1.35;
          band = Math.floor(bandF);
          frac = bandF - band;
          if (river) {
            var fl2 = wz * 1.7 + T * 4 + su * 2;
            var frr = fl2 - Math.floor(fl2);
            ch = frr < 0.55 ? '~' : '-';
            hue = baseHue + 168;
            sat = 92;
            lig = (38 + 32 * (0.5 + 0.5 * Math.sin(wz * 0.9 - T * 9))) * fog + flashL;
            if (lig > 72) lig = 72;
            if (lig > 3) drawCharHSL(ch, sx, r, hue, sat, lig);
          } else {
            stripe = 0.5 + 0.5 * Math.sin(wz * 0.5 - T * 6.5 + band * 0.9);
            tex = 0.5 + 0.5 * Math.sin(wz * 2.1 + band * 3.1 + wx * 0.7);
            br = fog * (0.62 + 0.24 * stripe + 0.14 * tex) * wallShade;
            ci = (br * (RL + 0.99)) | 0; if (ci > RL) ci = RL;
            if (ci > 0) {
              hue = baseHue + band * 9 + wallHue;
              sat = 62 + fog * 33;
              lig = 7 + br * 58;
              ch = RAMP_DENSE[ci];
              if (frac < 0.16) { ch = '='; lig += 9; }
              lig += flashL; if (lig > 72) lig = 72;
              drawCharHSL(ch, sx, r, hue, sat, lig);
            }
          }
          chZbuf[r * W + sx] = t;
        }
        fTop = lo;
      }

      // ---- ceiling surface ----
      var syC = horC - (clH - camHd) * fv / t;
      var rC = Math.floor(syC);
      if (rC > cBot) {
        var hi = rC;
        if (hi > fTop - 1) hi = fTop - 1;
        if (hi > H - 1) hi = H - 1;
        for (r = cBot + 1; r <= hi; r++) {
          wy = camHd + (horC - r) * t / fv;
          bandF = wy * 1.35;
          band = Math.floor(bandF);
          frac = bandF - band;
          stripe = 0.5 + 0.5 * Math.sin(wz * 0.55 - T * 6.5 + band * 0.9);
          tex = 0.5 + 0.5 * Math.sin(wz * 2.3 + band * 3.1 + wx * 0.8);
          br = fog * (0.58 + 0.24 * stripe + 0.14 * tex) * wallShade * 0.85;
          ci = (br * (RL + 0.99)) | 0; if (ci > RL) ci = RL;
          if (ci > 0) {
            hue = baseHue + 40 + band * 9 + wallHue;
            sat = 58 + fog * 33;
            lig = 6 + br * 54;
            ch = RAMP_DENSE[ci];
            if (frac < 0.14) { ch = '='; lig += 8; }
            lig += flashL; if (lig > 70) lig = 70;
            drawCharHSL(ch, sx, r, hue, sat, lig);
          }
          chZbuf[r * W + sx] = t;
        }
        cBot = hi;
      }
    }

    // void between the buffers: faint glow at the vanishing point
    for (r = cBot + 1; r < fTop; r++) {
      var dv = r - horC; if (dv < 0) dv = -dv;
      var gl = 11 - dv * 1.4;
      if (gl > 1) drawCharHSL('.', sx, r, baseHue + 80, 70, gl + flashL * 0.3);
    }
  }

  // ---------------- sprites (z-tested against terrain) ----------------
  chSprites.length = 0;
  var i, g, th, m, px, py, fs;

  // gates — rings on the canyon path you fly through
  var maxGz = 0;
  for (i = 0; i < chGates.length; i++) if (chGates[i].z > maxGz) maxGz = chGates[i].z;
  var ringPts = mob ? 30 : 48;
  for (i = 0; i < chGates.length; i++) {
    g = chGates[i];
    if (g.z < chCamZ + 0.6) {           // flew through it
      chFlash = 1;
      chBoost += 0.4; if (chBoost > 1.4) chBoost = 1.4;
      maxGz += 34;
      g.z = maxGz;
    }
    var gx = chCenter(g.z);
    var gy = (chFloorB(g.z) + chCeilB(g.z)) * 0.5;
    var gR = 2.5 + 0.15 * Math.sin(T * 2 + g.z);
    for (m = 0; m < ringPts; m++) {
      th = (m / ringPts) * 6.283 + T * 0.35;
      px = gx + Math.cos(th) * gR;
      py = gy + Math.sin(th) * gR;
      if (chProject(px, py, g.z)) {
        fs = 1 - chPzc / FAR; if (fs < 0) fs = 0; fs = fs * Math.sqrt(fs);
        chAddSprite(m % 5 === 0 ? '@' : 'O',
          baseHue + 210 + 14 * Math.sin(th * 2 + T * 3), 55,
          Math.min(76, 36 + 44 * fs + 10 * (0.5 + 0.5 * Math.sin(T * 5 + th * 4)) + flashL));
      }
      if (chProject(gx + Math.cos(th) * gR * 0.84, gy + Math.sin(th) * gR * 0.84, g.z)) {
        fs = 1 - chPzc / FAR; if (fs < 0) fs = 0; fs = fs * Math.sqrt(fs);
        chAddSprite('*', baseHue + 200, 70, Math.min(70, 26 + 38 * fs + flashL));
      }
    }
    for (m = 0; m < 4; m++) {           // center sparkle
      th = m * 1.571 + T * 1.8;
      if (chProject(gx + Math.cos(th) * gR * 0.3, gy + Math.sin(th) * gR * 0.3, g.z)) {
        fs = 1 - chPzc / FAR; if (fs < 0) fs = 0; fs = fs * Math.sqrt(fs);
        chAddSprite('+', baseHue + 210, 45, Math.min(70, 22 + 42 * fs));
      }
    }
  }

  // tap pulses — rings racing ahead into the depth
  var pPts = mob ? 22 : 34;
  for (i = chPulses.length - 1; i >= 0; i--) {
    var pu = chPulses[i];
    pu.z += 26 * dtF;
    pu.r += 1.3 * dtF;
    pu.age += dtF;
    if (pu.age > 3 || pu.z > chCamZ + FAR) { chPulses.splice(i, 1); continue; }
    var pcx = chCenter(pu.z);
    var pcy = (chFloorB(pu.z) + chCeilB(pu.z)) * 0.5;
    var fade = 1 - pu.age / 3;
    for (m = 0; m < pPts; m++) {
      th = (m / pPts) * 6.283 + pu.age * 2;
      if (chProject(pcx + Math.cos(th) * pu.r, pcy + Math.sin(th) * pu.r, pu.z)) {
        chAddSprite('*', baseHue + 30 + pu.age * 40, 85, Math.min(72, (18 + 52 * fade) + flashL));
      }
    }
  }

  // motes — drifting light dust for near-field parallax
  for (i = 0; i < chMotes.length; i++) {
    var mo = chMotes[i];
    if (mo.z < chCamZ + 0.4 || mo.z > chCamZ + FAR * 0.75) {
      mo.z = chCamZ + 3 + Math.random() * FAR * 0.6;
      var mc = chCenter(mo.z), mw = chHalfW(mo.z);
      mo.x = mc + (Math.random() * 2 - 1) * mw * 0.55;
      mo.y = chFloorB(mo.z) + 1.2 + Math.random() * (chCeilB(mo.z) - chFloorB(mo.z) - 2.4);
    }
    mo.y += Math.sin(T * 0.9 + mo.ph) * dtF * 0.4;
    mo.x += Math.cos(T * 0.7 + mo.ph * 1.7) * dtF * 0.3;
    if (chProject(mo.x, mo.y, mo.z)) {
      fs = 1 - chPzc / FAR; if (fs < 0) fs = 0; fs = fs * Math.sqrt(fs);
      chAddSprite(chPzc < 6 ? '+' : '.', baseHue + 60, 25,
        Math.min(68, (30 + 26 * (0.5 + 0.5 * Math.sin(T * 4 + mo.ph * 3))) * (0.3 + 0.7 * fs)));
    }
  }

  // far-to-near, occluded by rock via the z-buffer
  chSprites.sort(function (a, b) { return b.zc - a.zc; });
  for (i = 0; i < chSprites.length; i++) {
    var sp = chSprites[i];
    if (chZbuf[sp.y * W + sp.x] > sp.zc - 0.7) {
      drawCharHSL(sp.c, sp.x, sp.y, sp.h, sp.s, sp.l);
    }
  }
}

registerMode('chasm', { init: initChasm, render: renderChasm });
