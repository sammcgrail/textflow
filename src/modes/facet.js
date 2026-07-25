import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// facet — a living kaleidoscope of hard-edged crystal shards.
//
// Discrete regular-polygon shards (exact SDFs: crisp edges, chromatic-fringe
// refraction lines, glinting corners, per-face light sectors) tumble inside
// ONE mirror wedge; the wedge is folded S ways around the centre, so every
// shard exists 2S times and bounces off the mirror seams like real glass in
// a kaleidoscope tube.
//
// touch:  drag  = stir the shards (every mirror image responds at once)
//         swirl = circular drag twists the whole scope with momentum
//         tap   = drop a new shard there + a refraction ring
//         tap centre = cycle the symmetry count (6 -> 8 -> 10 -> 4)

var FT_SYMS = [6, 8, 10, 4];
// jewel palette: ruby, amber, emerald, aqua, sapphire, amethyst, magenta, citrine
var FT_HUES = [350, 40, 140, 185, 215, 280, 320, 60];

var ftShards, ftRings;
var ftW = -1, ftH = -1;
var ftSymIdx = 0, ftSegs = 8;
var ftRot = 0, ftRotVel = 0.05;
var ftLastT = 0, ftLastPA = 0, ftHadDown = false, ftNextChime = 0;

function ftAR() {
  return state.CHAR_H > 0 ? state.CHAR_W / state.CHAR_H : 0.55;
}

function ftSpawn(sr, sa, srV, hue) {
  var ar = ftAR();
  var rCore = Math.min(state.COLS * ar, state.ROWS) * 0.5;
  var k = 3 + ((Math.random() * 3) | 0); // triangles, squares, pentagons
  var rad = rCore * (state.isMobile ? 0.13 + Math.random() * 0.13 : 0.09 + Math.random() * 0.11);
  rad = Math.max(1.2, Math.min(10, rad));
  ftShards.push({
    sr: sr, sa: sa, srV: srV, saV: (Math.random() - 0.5) * 0.12,
    rad: rad, k: k, apo: Math.cos(Math.PI / k), pseg: (Math.PI * 2) / k,
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.5),
    hue: ((hue % 360) + 360) % 360,
    edgeW: Math.max(0.35, rad * 0.10),
    sxc: 0, syc: 0, bb: 0
  });
}

function initFacet() {
  ftW = state.COLS; ftH = state.ROWS;
  ftShards = []; ftRings = [];
  ftSegs = state.isMobile ? 6 : 8;
  ftSymIdx = FT_SYMS.indexOf(ftSegs); if (ftSymIdx < 0) ftSymIdx = 0;
  ftRot = 0; ftRotVel = 0.05;
  ftLastT = state.time; ftHadDown = false;
  ftNextChime = state.time + 5;
  var ar = ftAR();
  var rCore = Math.min(ftW * ar, ftH) * 0.5;
  var half = Math.PI / ftSegs;
  var n = state.isMobile ? 3 : 4;
  for (var i = 0; i < n; i++) {
    var sr = 1.5 + ((i + 0.5) / n) * Math.max(1, rCore * 0.95 - 1.5);
    var sa = 0.04 + ((i + Math.random() * 0.6) / n) * Math.max(0.02, half - 0.08);
    ftSpawn(sr, sa, 0, FT_HUES[i % FT_HUES.length] + (Math.random() - 0.5) * 24);
  }
}

function renderFacet() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!ftShards || ftW !== W || ftH !== H) initFacet();
  var t = state.time;
  var dt = t - ftLastT; ftLastT = t;
  if (!(dt > 0.001)) dt = 0.016;
  if (dt > 0.05) dt = 0.05;

  var ar = ftAR();
  var cx = W * 0.5, cy = H * 0.5;
  var minDim = Math.min(W * ar, H);
  var rCore = minDim * 0.5;               // the kaleidoscope disc
  var maxR = Math.sqrt(cx * ar * cx * ar + cy * cy);
  var rMax = Math.max(3, rCore * 1.25);   // shards stay inside the disc
  var S = ftSegs;
  var seg = (Math.PI * 2) / S;
  var half = seg * 0.5;
  var inMode = state.currentMode === 'facet';

  // ---- fold the pointer into the wedge ----
  var pdx = (pointer.gx - cx) * ar, pdy = pointer.gy - cy;
  var pr = Math.sqrt(pdx * pdx + pdy * pdy);
  var pa = Math.atan2(pdy, pdx);
  var paf = (pa - ftRot) % seg; if (paf < 0) paf += seg;
  if (paf > half) paf = seg - paf;
  var wpx = Math.cos(paf) * pr, wpy = Math.sin(paf) * pr;

  // ---- tap: centre cycles symmetry, elsewhere drops a shard + ring ----
  if (inMode && pointer.clicked) {
    pointer.clicked = false;
    if (pr < Math.max(3, minDim * 0.14)) {
      ftSymIdx = (ftSymIdx + 1) % FT_SYMS.length;
      if (state.isMobile && FT_SYMS[ftSymIdx] > 8) ftSymIdx = (ftSymIdx + 1) % FT_SYMS.length;
      ftSegs = FT_SYMS[ftSymIdx];
      S = ftSegs; seg = (Math.PI * 2) / S; half = seg * 0.5;
      for (var ci = 0; ci < ftShards.length; ci++) {
        var cs = ftShards[ci];
        cs.sa = cs.sa % seg; if (cs.sa < 0) cs.sa += seg;
        if (cs.sa > half) cs.sa = seg - cs.sa;
      }
      ftRings.push({ r0: 0.5, t0: t, soft: false });
      ftRings.push({ r0: 3.5, t0: t, soft: false });
    } else {
      ftSpawn(Math.max(2, Math.min(pr, rMax - 1)),
        Math.min(Math.max(paf, 0.04), Math.max(0.05, half - 0.04)),
        6, FT_HUES[(Math.random() * FT_HUES.length) | 0] + (Math.random() - 0.5) * 30);
      var cap = state.isMobile ? 6 : 8;
      while (ftShards.length > cap) ftShards.shift();
      ftRings.push({ r0: pr, t0: t, soft: false });
    }
  }

  // ---- drag: twist the scope with momentum + stir shards in the wedge ----
  if (inMode && pointer.down) {
    if (ftHadDown) {
      var dA = pa - ftLastPA;
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      var tv = dA / dt;
      if (tv > 5) tv = 5; if (tv < -5) tv = -5;
      ftRotVel += (tv - ftRotVel) * 0.35;
    }
    ftHadDown = true; ftLastPA = pa;
    var stirR = Math.max(4, rCore * 0.55);
    for (var si = 0; si < ftShards.length; si++) {
      var st = ftShards[si];
      var sx0 = Math.cos(st.sa) * st.sr, sy0 = Math.sin(st.sa) * st.sr;
      var ddx = sx0 - wpx, ddy = sy0 - wpy;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd < stirR && dd > 0.001) {
        var imp = (1 - dd / stirR) * 11 * dt;
        var ux = ddx / dd, uy = ddy / dd;
        st.srV += (ux * Math.cos(st.sa) + uy * Math.sin(st.sa)) * imp;
        st.saV += (uy * Math.cos(st.sa) - ux * Math.sin(st.sa)) * imp / Math.max(st.sr, 1.5);
      }
    }
  } else {
    ftHadDown = false;
    ftRotVel += (0.05 - ftRotVel) * Math.min(1, dt * 1.4);
  }
  ftRot += ftRotVel * dt;

  // ---- idle chime: a shard gets nudged, a soft ring marks it ----
  if (t > ftNextChime) {
    ftNextChime = t + 6 + Math.random() * 5;
    if (ftShards.length) {
      var chs = ftShards[(Math.random() * ftShards.length) | 0];
      chs.srV += (Math.random() < 0.5 ? -1 : 1) * 3;
      ftRings.push({ r0: chs.sr, t0: t, soft: true });
    }
  }

  // ---- shard physics: tumble, breathe, bounce off mirrors ----
  var lo = Math.min(0.03, half * 0.2), hi = half - lo;
  for (var i = 0; i < ftShards.length; i++) {
    var s = ftShards[i];
    s.rot += s.rotV * dt;
    s.sr += s.srV * dt + Math.sin(t * 0.4 + i * 1.7) * 0.35 * dt;
    s.sa += s.saV * dt + Math.sin(t * 0.3 + i * 2.3) * 0.05 * dt;
    s.srV *= Math.exp(-dt * 2.0);
    s.saV *= Math.exp(-dt * 0.8);
    if (s.sr < 2) { s.sr = 2; s.srV = Math.abs(s.srV); }
    if (s.sr > rMax) { s.sr = rMax; s.srV = -Math.abs(s.srV); }
    if (hi <= lo) s.sa = half * 0.5;
    else {
      if (s.sa < lo) { s.sa = lo; s.saV = Math.abs(s.saV); }
      if (s.sa > hi) { s.sa = hi; s.saV = -Math.abs(s.saV); }
    }
    s.sxc = Math.cos(s.sa) * s.sr;
    s.syc = Math.sin(s.sa) * s.sr;
    s.bb = s.rad + s.edgeW + 0.6;
  }

  // ---- refraction rings ----
  var rspeed = Math.max(8, rCore * 1.6);
  for (var ri = ftRings.length - 1; ri >= 0; ri--) {
    var rg = ftRings[ri];
    rg.r = rg.r0 + (t - rg.t0) * rspeed;
    rg.f = 1 - (t - rg.t0) / 0.9;
    if (rg.f <= 0 || rg.r - 2 > maxR) ftRings.splice(ri, 1);
  }
  var nRings = ftRings.length;

  var LX = Math.cos(t * 0.6), LY = Math.sin(t * 0.6); // sweeping light
  var bgThresh = state.isMobile ? 1.25 : 1.0;
  var nsh = ftShards.length;

  // ---- per-cell render: fold, test shards, colour ----
  for (var y = 0; y < H; y++) {
    var dy = y - cy;
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) * ar;
      var r = Math.sqrt(dx * dx + dy * dy);
      var a = Math.atan2(dy, dx);
      var af = (a - ftRot) % seg; if (af < 0) af += seg;
      if (af > half) af = seg - af;
      var wx = Math.cos(af) * r, wy = Math.sin(af) * r;
      var vig = (rCore * 1.9 - r) / (rCore * 0.85); // 1 inside the disc, 0 far out
      if (vig > 1) vig = 1; else if (vig < 0) vig = 0;

      var inside = 0, hueX = 0, hueY = 0, sheen = 0;
      var bestE = 1e9, eW = 1, eHue = 0, eSide = 1, eCorn = 0;

      for (var j = 0; j < nsh; j++) {
        var sh = ftShards[j];
        var ax = wx - sh.sxc; if (ax > sh.bb || ax < -sh.bb) continue;
        var ay = wy - sh.syc; if (ay > sh.bb || ay < -sh.bb) continue;
        var la = Math.atan2(ay, ax) - sh.rot;
        var lf = la % sh.pseg; if (lf < 0) lf += sh.pseg;
        lf -= sh.pseg * 0.5; // fold to nearest face: [-pseg/2, pseg/2]
        var lr = Math.sqrt(ax * ax + ay * ay);
        var sdf = lr * Math.cos(lf) - sh.rad * sh.apo; // exact k-gon SDF
        if (sdf < 0) {
          inside++;
          var hr = sh.hue * 0.017453293;
          hueX += Math.cos(hr); hueY += Math.sin(hr);
          // each face of the gem catches the light differently as it tumbles
          var face = Math.round(la / sh.pseg);
          sheen += Math.sin(face * 2.1 + t * 1.2 + sh.hue * 0.05) * 0.5 + 0.5;
        }
        var ed = sdf < 0 ? -sdf : sdf;
        if (ed < sh.edgeW && ed < bestE) {
          bestE = ed; eW = sh.edgeW; eHue = sh.hue;
          eSide = sdf >= 0 ? 1 : -1;
          eCorn = (lf < 0 ? -lf : lf) / (sh.pseg * 0.5); // 1 at vertices
        }
      }

      if (bestE < 1e8) {
        // refraction line: near-white edge, chromatic fringe, corner glints
        var eb = 1 - bestE / eW;
        var cf = eCorn * eCorn;
        var el = (58 + eb * 24 + cf * 14) * (0.45 + 0.55 * vig); if (el > 96) el = 96;
        var ehue = eHue + eSide * 42 + cf * 24 + Math.sin(t * 2 + r) * 8;
        drawCharHSL(eb > 0.55 ? '@' : '#', x, y,
          ((ehue % 360) + 360) % 360, 34 + cf * 20, el);
      } else if (inside > 0) {
        // glass body: jewel hue, per-face sheen, brighter where panes overlap
        var hue = Math.atan2(hueY, hueX) * 57.29578;
        var shn = sheen / inside;
        var gloss = r > 0.5 ? (LX * wx + LY * wy) / r : 0;
        var l = (38 + shn * 22 + gloss * 7 + (inside > 1 ? 15 : 0)) * (0.35 + 0.65 * vig);
        if (l > 88) l = 88;
        var ci2 = 4 + (((l - 26) * 0.12) | 0);
        if (ci2 < 4) ci2 = 4; if (ci2 > 11) ci2 = 11;
        drawCharHSL(RAMP_DENSE[ci2], x, y,
          ((hue % 360) + 360) % 360, inside > 1 ? 80 : 96, l);
      } else {
        // faint silver mirror seams so the symmetry skeleton reads
        var seamD = r * (af < half - af ? af : half - af);
        if (seamD < 0.5 && r > 2.5) {
          var sl = (15 + Math.sin(t * 1.5 + r * 0.7) * 5) * (0.4 + 0.6 * vig);
          if (sl > 3.5) drawCharHSL('`', x, y, 210, 14, sl);
        } else {
          // dim spectral wash between shards
          var v = Math.sin(r * 0.5 - t * 1.5 + af * 5) +
                  Math.sin(af * S * 2 + t * 0.6 + r * 0.15) * 0.6;
          if (v > bgThresh) {
            var wl = (7 + (v - bgThresh) * 9) * vig;
            if (wl > 3.5) drawCharHSL(v > bgThresh + 0.35 ? ':' : '.', x, y,
              (((a * 57.29578 + t * 14 + r * 4) % 360) + 360) % 360, 65, wl);
          }
        }
      }

      // expanding refraction rings flash over everything
      if (nRings) {
        for (var q = 0; q < nRings; q++) {
          var rq = ftRings[q];
          var drr = r - rq.r; if (drr < 0) drr = -drr;
          if (drr < 1.5) {
            var g = rq.f * (1 - drr / 1.5) * (rq.soft ? 0.45 : 1);
            if (g > 0.08) {
              drawCharHSL(g > 0.5 ? '@' : '*', x, y,
                (((a * 57.29578 + r * 6) % 360) + 360) % 360, 38, 40 + g * 55);
            }
          }
        }
      }
    }
  }

  // ---- while held: the finger exists 2S times — sparkle every image ----
  if (inMode && pointer.down) {
    var paf2 = (pa - ftRot) % seg; if (paf2 < 0) paf2 += seg;
    if (paf2 > half) paf2 = seg - paf2;
    for (var k = 0; k < S; k++) {
      for (var m2 = 0; m2 < 2; m2++) {
        var A = ftRot + k * seg + (m2 === 0 ? paf2 : seg - paf2);
        var sxp = (cx + (Math.cos(A) * pr) / ar) | 0;
        var syp = (cy + Math.sin(A) * pr) | 0;
        if (sxp < 0 || sxp >= W || syp < 0 || syp >= H) continue;
        var armH = (t * 60 + k * 47) % 360;
        drawCharHSL('+', sxp, syp, 50, 25, 70 + Math.sin(t * 6 + k) * 15);
        if (sxp > 0) drawCharHSL('-', sxp - 1, syp, armH, 85, 42);
        if (sxp < W - 1) drawCharHSL('-', sxp + 1, syp, armH, 85, 42);
        if (syp > 0) drawCharHSL('`', sxp, syp - 1, armH, 85, 38);
        if (syp < H - 1) drawCharHSL('.', sxp, syp + 1, armH, 85, 38);
      }
    }
  }
}

registerMode('facet', {
  init: initFacet,
  render: renderFacet,
});
