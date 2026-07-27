import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// foil — holographic trading-card foil, lit properly.
//
// An embossed sheet under a moving light. Three things happen at once:
//
//   GLARE   a screen-space band, gaussian across the light axis, that sweeps
//           bodily over the sheet as the light moves. This is the thing that
//           makes it read as metal — a specular exponent alone cannot do it,
//           because it is a function of the relief's derivative and the relief
//           is high-frequency, so it comes out as speckle, not a stripe.
//   HUE     diffraction. Dominated by a SMOOTH screen-space term so colour
//           bands are broad; the relief only bends them. Using the normalised
//           grating direction here was the original bug: a unit vector spins a
//           full 360 degrees around every local extremum, so hue wrapped twice
//           per ridge and the whole sheet came out as per-cell confetti.
//   FLAKES  sparse glitter with randomised normals, flaring when they line up.
//
// TILT YOUR PHONE — real device orientation. On desktop the pointer is the
// tilt. Tap cycles the emboss. Press and drag buffs it and it flares harder.

var RAMP = ' .:-=+*%@#';

var flW = 0, flH = 0;
var flHeight = null;                 // relief
var flNx = null, flNy = null, flNz = null;   // surface normal
var flDhx = null, flDhy = null;      // RAW relief gradient (not normalised)
var flU = null, flV = null;          // screen-space coords, kept for the glare
var flUmax = 1, flVmax = 1;
var flFlake = null, flFx = null, flFy = null;

var flPat = 0;
var flLx = 0.35, flLy = -0.25;
var flTx = 0, flTy = 0;
var flHasMotion = false;
var flBeta = 0, flGamma = 0;
var flBuff = 0;
var flPhase = 0;

var PATTERNS = ['starburst', 'guilloche', 'hex facets', 'ripple'];

function flOrientation(e) {
  if (e.beta === null && e.gamma === null) return;
  flBeta = e.beta || 0;
  flGamma = e.gamma || 0;
  flHasMotion = true;
}

function flAttach() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function (s) {
      if (s === 'granted') window.addEventListener('deviceorientation', flOrientation);
    }).catch(function () {});
  } else if (typeof window !== 'undefined') {
    window.addEventListener('deviceorientation', flOrientation);
  }
}

function flCleanup() {
  window.removeEventListener('deviceorientation', flOrientation);
  flHasMotion = false;
}

function flRelief(u, v, p) {
  var r = Math.sqrt(u * u + v * v);
  var a = Math.atan2(v, u);
  // Brushed substrate. Every emboss below is radial, so without this the sheet
  // goes FLAT at the top and bottom of a tall phone screen — no gradient means
  // no shading across a third of the display.
  var sub = Math.sin(u * 4.3 + v * 2.0) * 0.30 + Math.sin(u * 2.1 - v * 5.1) * 0.24;
  if (p === 0) {
    // starburst: fewer, harder arms that die off fast, leaving the outer sheet
    // to the brush and the glare instead of a fan of near-flat noise
    return sub + Math.sin(9 * a) * Math.exp(-r * 0.9) * 1.25 + Math.sin(r * 5.5) * 0.3;
  }
  if (p === 1) {
    // guilloche: the interlocking rosette engraved on banknotes
    return sub + Math.sin(7 * a + 3.2 * r) * 0.55 + Math.sin(4 * a - 5.5 * r) * 0.4
         + Math.sin(r * 8) * 0.16;
  }
  if (p === 2) {
    // hex facets: nearest-centre distance on a hex lattice
    var s = 2.6;
    var q = u * s, w = v * s;
    var best = 9;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var cyc = Math.round(w / 0.866) + dy;
        var cxc = Math.round(q - (cyc & 1 ? 0.5 : 0)) + dx;
        var px = cxc + (cyc & 1 ? 0.5 : 0), py = cyc * 0.866;
        var d = Math.hypot(q - px, w - py);
        if (d < best) best = d;
      }
    }
    return sub * 0.25 + (0.55 - best) * 1.7;
  }
  // ripple: concentric rings, off-centre so it is not perfectly radial
  var r2 = Math.sqrt((u - 0.16) * (u - 0.16) + v * v);
  return sub + Math.sin(r2 * 7.5) * 0.66 + Math.sin(a * 3 + r2 * 2.5) * 0.2;
}

function flBuild() {
  var W = state.COLS, H = state.ROWS;
  flW = W; flH = H;
  var n = W * H;
  flHeight = new Float32Array(n);
  flNx = new Float32Array(n); flNy = new Float32Array(n); flNz = new Float32Array(n);
  flDhx = new Float32Array(n); flDhy = new Float32Array(n);
  flU = new Float32Array(n); flV = new Float32Array(n);
  flFlake = new Float32Array(n); flFx = new Float32Array(n); flFy = new Float32Array(n);

  var ar = state.CHAR_W / state.CHAR_H;
  if (!(ar > 0.05)) ar = 0.5;
  // Normalise by the LONGER half-extent. Dividing by the shorter one let the
  // tall axis run out to r~4 on a phone, so every relief term cycled dozens of
  // times down the screen.
  var sc = 1.15 / Math.max(W * 0.5 * ar, H * 0.5);
  flUmax = Math.max(1e-3, W * 0.5 * ar * sc);
  flVmax = Math.max(1e-3, H * 0.5 * sc);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      var u = (x - W * 0.5) * ar * sc;
      var v = (y - H * 0.5) * sc;
      flU[i] = u; flV[i] = v;
      flHeight[i] = flRelief(u, v, flPat);
    }
  }

  for (var yy = 0; yy < H; yy++) {
    for (var xx = 0; xx < W; xx++) {
      var j = yy * W + xx;
      var xl = xx > 0 ? j - 1 : j, xr = xx < W - 1 ? j + 1 : j;
      var yu = yy > 0 ? j - W : j, yd = yy < H - 1 ? j + W : j;
      var dhx = (flHeight[xr] - flHeight[xl]) * 1.6;
      var dhy = (flHeight[yd] - flHeight[yu]) * 1.6;
      var nl = Math.sqrt(dhx * dhx + dhy * dhy + 1);
      flNx[j] = -dhx / nl; flNy[j] = -dhy / nl; flNz[j] = 1 / nl;
      flDhx[j] = dhx; flDhy[j] = dhy;
      if (((xx * 73856093) ^ (yy * 19349663) ^ (flPat * 83492791)) % 17 === 0) {
        var seed = ((xx * 12.9898 + yy * 78.233) * 43758.5453) % 1;
        if (seed < 0) seed += 1;
        var seed2 = ((xx * 39.3468 + yy * 11.135) * 24634.6345) % 1;
        if (seed2 < 0) seed2 += 1;
        flFlake[j] = 1;
        flFx[j] = (seed - 0.5) * 1.7;
        flFy[j] = (seed2 - 0.5) * 1.7;
      }
    }
  }
}

function initFoil() {
  flPat = 0;
  flBuild();
  flLx = 0.35; flLy = -0.25;
  flTx = 0.35; flTy = -0.25;
  flBuff = 0;
  flPhase = 0;
}

function renderFoil() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!flHeight || flW !== W || flH !== H) flBuild();

  if (pointer.clicked && state.currentMode === 'foil') {
    pointer.clicked = false;
    flPat = (flPat + 1) % PATTERNS.length;
    flBuild();
    flBuff = 1.6;
  } else if (pointer.down && state.currentMode === 'foil') {
    flTx = (pointer.gx / Math.max(1, W - 1)) * 2 - 1;
    flTy = (pointer.gy / Math.max(1, H - 1)) * 2 - 1;
    flBuff = Math.min(2.4, flBuff + 0.12);
  } else if (flHasMotion) {
    flTx = Math.max(-1, Math.min(1, flGamma / 42));
    flTy = Math.max(-1, Math.min(1, (flBeta - 38) / 42));
    flBuff *= 0.94;
  } else {
    // idle rock, wide enough that the glare band actually crosses the sheet
    var idleX = Math.sin(state.time * 0.75) * 0.95;
    var idleY = Math.sin(state.time * 0.52 + 1.1) * 0.8;
    if (!state.isMobile) {
      // desktop hover steers without needing a button held
      var pxn = (pointer.gx / Math.max(1, W - 1)) * 2 - 1;
      var pyn = (pointer.gy / Math.max(1, H - 1)) * 2 - 1;
      flTx = pxn * 0.65 + idleX * 0.35;
      flTy = pyn * 0.65 + idleY * 0.35;
    } else {
      flTx = idleX; flTy = idleY;
    }
    flBuff *= 0.94;
  }
  flLx += (flTx - flLx) * 0.14;
  flLy += (flTy - flLy) * 0.14;
  flPhase += 0.012;

  var lz = 0.85;
  var ll = Math.sqrt(flLx * flLx + flLy * flLy + lz * lz);
  var Lx = flLx / ll, Ly = flLy / ll, Lz = lz / ll;

  // --- the glare band, in SCREEN space ---
  var lmag = Math.sqrt(flLx * flLx + flLy * flLy);
  var ax = lmag > 1e-3 ? flLx / lmag : 0;
  var ay = lmag > 1e-3 ? flLy / lmag : -1;
  var ext = Math.abs(ax) * flUmax + Math.abs(ay) * flVmax;
  if (ext < 1e-3) ext = 1e-3;
  var bandC = -Math.min(lmag, 1) * 0.8;
  var bandW = 0.34 / (1 + flBuff * 0.45);
  var bandGain = 1.05 * (1 + flBuff * 0.7);
  var satGain = 104 * (1 + flBuff * 0.45);

  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      var i2 = y2 * W + x2;
      var uu = flU[i2], vv = flV[i2];

      var dif = flNx[i2] * Lx + flNy[i2] * Ly + flNz[i2] * Lz;
      if (dif < 0) dif = 0;
      var nd2 = dif * dif, nd4 = nd2 * nd2;

      var sPos = (uu * ax + vv * ay) / ext;
      var t = (sPos - bandC) / bandW;
      var band = Math.exp(-t * t) * (0.5 + 0.5 * nd4);

      // smooth screen-space term dominates; relief only bends the bands
      var hue = ((2.4 * (uu * Lx + vv * Ly)
                + 0.55 * (flDhx[i2] * Lx + flDhy[i2] * Ly)
                + 0.42 * flHeight[i2] + flPhase) % 1 + 1) % 1;

      if (flFlake[i2]) {
        var fnx = flNx[i2] + flFx[i2], fny = flNy[i2] + flFy[i2];
        var fl2 = Math.sqrt(fnx * fnx + fny * fny + 1);
        var fd = (fnx * Lx + fny * Ly + Lz) / fl2;
        if (fd > 0.88) {
          var pop = ((fd - 0.88) / 0.12)
                  * (0.6 + 0.4 * Math.sin(flPhase * 9 + flFx[i2] * 31));
          if (pop > 0) {
            drawCharHSL('*', x2, y2, hue * 360, 18, Math.min(98, 62 + 36 * pop));
            continue;
          }
        }
      }

      // 0.06 left most of the sheet on ramp index 0 (a space) — the foil came
      // out as sparse dots on black instead of a continuous surface.
      var bright = 0.19 + 0.52 * dif + bandGain * band;
      if (bright > 1) bright = 1;
      if (bright < 0) bright = 0;

      var lit = 4 + 92 * bright;
      if (lit > 97) lit = 97;
      var sat = 96 - satGain * band;
      if (sat < 0) sat = 0;

      var ci = (bright * (RAMP.length - 1)) | 0;
      var ch = RAMP[ci];
      if (ch === ' ') continue;
      drawCharHSL(ch, x2, y2, hue * 360, sat, lit);
    }
  }

  var lbl = PATTERNS[flPat] + (flHasMotion ? '   tilt' : '   drag');
  // a space draws nothing, so it does NOT erase the glyph already in the cell —
  // lay down a near-black block first or the label sits on top of the foil
  for (var c = 0; c < lbl.length + 2 && c < W; c++) drawCharHSL('#', c, H - 1, 0, 0, 3);
  for (var c2 = 0; c2 < lbl.length && c2 + 1 < W; c2++) {
    drawCharHSL(lbl[c2], 1 + c2, H - 1, 45, 8, 96);
  }
}

registerMode('foil', {
  init: initFoil, render: renderFoil, attach: flAttach, cleanup: flCleanup,
});
