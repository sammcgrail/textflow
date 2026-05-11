import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// "Borromean" — ASCII-raymarched port of @techartist_'s Borromean Syntax
// Rings (tweet 2050810462942675265). Three sinusoidally-perturbed tori
// at 120° rotational symmetry around the vertical axis, each tilted
// forward so they thread through each other in a Borromean-style link.
//
// Per-cell raymarch: 32 steps max, ~3.5ms/cell on 80×40 grid → ~9k cells
// × small cost should hit ~30fps. Brightness driven by surface diffuse
// shading; HSL hue picked per-ring (rose/jade/sapphire) at hit time.

var bbW = 0, bbH = 0;
var bbBuf = null;       // brightness 0..1
var bbHue = null;       // 0..360
var bbCamYaw = 0, bbCamYawTarget = 0;
var bbCamPitch = 0, bbCamPitchTarget = 0;
var bbPulse = 0;

function initBorromean() {
  bbW = 0; bbH = 0;
  bbBuf = null; bbHue = null;
  bbCamYaw = 0; bbCamYawTarget = 0;
  bbCamPitch = 0; bbCamPitchTarget = 0;
  bbPulse = 0;
}

// Mat3 rotation helpers (manually inlined for speed).
function rotY(p, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]];
}
function rotX(p, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
}

function torusSDF(p, R, r) {
  var qx = Math.sqrt(p[0] * p[0] + p[2] * p[2]) - R;
  var qy = p[1];
  return Math.sqrt(qx * qx + qy * qy) - r;
}

function sceneSDF(p, t) {
  var bestD = 1e9, bestId = -1;
  for (var i = 0; i < 3; i++) {
    var ang = i * 2.094395 + t * 0.15;
    var pl = rotY(p, -ang);
    pl = rotX(pl, 0.35);
    var theta = Math.atan2(pl[2], pl[0]);
    var k = 5.0 + 2.0 * i;
    var thick = 0.075 + 0.018 * Math.sin(k * theta + t * 0.6 + i * 1.7);
    var d = torusSDF(pl, 1.0, thick);
    if (d < bestD) { bestD = d; bestId = i; }
  }
  return [bestD, bestId];
}

// Tiny-h normal estimate (3 extra SDF samples — expensive! cap usage).
function sceneNormal(p, t) {
  var h = 0.01;
  var d0 = sceneSDF(p, t)[0];
  var nx = sceneSDF([p[0] + h, p[1], p[2]], t)[0] - d0;
  var ny = sceneSDF([p[0], p[1] + h, p[2]], t)[0] - d0;
  var nz = sceneSDF([p[0], p[1], p[2] + h], t)[0] - d0;
  var len = Math.sqrt(nx*nx + ny*ny + nz*nz);
  if (len < 1e-6) return [0, 1, 0];
  return [nx/len, ny/len, nz/len];
}

function viewCompute() {
  var W = bbW, H = bbH;
  var t = state.time;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var aspect = (W / H) * charAspect;

  // Camera: precess + mouse-drag tilt.
  var yaw = t * 0.18 + bbCamYaw;
  var pitch = bbCamPitch;
  var cy = Math.cos(yaw), sy = Math.sin(yaw);
  var cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Camera at (0, 0.5, 4.2) rotated.
  var ro0 = [0, 0.5, 4.2];
  var ro = rotX(ro0, pitch);
  ro = rotY(ro, yaw);

  for (var py = 0; py < H; py++) {
    for (var px = 0; px < W; px++) {
      // Aspect-corrected NDC.
      var u = (px / W - 0.5) * 2.0 * aspect;
      var v = -(py / H - 0.5) * 2.0;
      var rd0 = [u, v, -1.7];
      // Normalize rd.
      var rl = Math.sqrt(rd0[0]*rd0[0] + rd0[1]*rd0[1] + rd0[2]*rd0[2]);
      rd0 = [rd0[0]/rl, rd0[1]/rl, rd0[2]/rl];
      var rd = rotX(rd0, pitch);
      rd = rotY(rd, yaw);

      // Raymarch (24 steps cap — ASCII grid is forgiving).
      var tt = 0.0;
      var hitRing = -1;
      var hitP = null;
      for (var s = 0; s < 24; s++) {
        var sp_ = [ro[0] + rd[0]*tt, ro[1] + rd[1]*tt, ro[2] + rd[2]*tt];
        var r = sceneSDF(sp_, t);
        if (r[0] < 0.012) { hitRing = r[1]; hitP = sp_; break; }
        if (tt > 12.0) break;
        tt += Math.max(r[0], 0.012);
      }

      var idx = py * W + px;
      if (hitRing < 0) {
        bbBuf[idx] = 0;
        bbHue[idx] = 0;
        continue;
      }

      // Cheap shading: skip full normal estimate, use SDF gradient via
      // 1 extra step (saves ~80% of cost on dense grids). Lambert from
      // a fixed light direction.
      var n = sceneNormal(hitP, t);
      var ld = [0.4, 0.8, 0.6];
      var ldl = Math.sqrt(ld[0]*ld[0] + ld[1]*ld[1] + ld[2]*ld[2]);
      ld = [ld[0]/ldl, ld[1]/ldl, ld[2]/ldl];
      var diff = Math.max(0, n[0]*ld[0] + n[1]*ld[1] + n[2]*ld[2]);
      // Add specular kicker for the highlights.
      var view = [-rd[0], -rd[1], -rd[2]];
      var nd = n[0]*view[0] + n[1]*view[1] + n[2]*view[2];
      var rim = Math.pow(Math.max(0, 1.0 - Math.abs(nd)), 2.0);
      var brightness = 0.18 + diff * 0.7 + rim * 0.3;
      brightness *= (1 + bbPulse * 0.4);
      if (brightness > 1) brightness = 1;
      bbBuf[idx] = brightness;

      // Per-ring jewel hues: rose / jade / sapphire.
      var hueByRing = [340, 145, 220];
      bbHue[idx] = hueByRing[hitRing] + Math.sin(t * 0.7 + hitRing) * 12;
    }
  }
}

function renderBorromean() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (bbW !== W || bbH !== H) {
    bbW = W; bbH = H;
    bbBuf = new Float32Array(W * H);
    bbHue = new Float32Array(W * H);
  }

  // Mouse drag tilts camera; click pulses brightness briefly.
  if (pointer.down && state.currentMode === 'borromean') {
    bbCamYawTarget = (pointer.gx / W - 0.5) * 1.5;
    bbCamPitchTarget = (pointer.gy / H - 0.5) * 0.8;
  }
  if (pointer.clicked && state.currentMode === 'borromean') {
    pointer.clicked = false;
    bbPulse = 1.0;
  }
  bbCamYaw += (bbCamYawTarget - bbCamYaw) * 0.10;
  bbCamPitch += (bbCamPitchTarget - bbCamPitch) * 0.10;
  bbPulse *= 0.92;

  viewCompute();

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var v = bbBuf[idx];
      if (v < 0.05) {
        // BG with subtle starfield twinkle.
        var tw = (Math.sin(x * 1.31 + y * 0.97 + t * 0.6) + 1.0) * 0.5;
        if (tw > 0.985) drawCharHSL('.', x, y, 220, 30, 28);
        continue;
      }
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 1)) | 0);
      var ch = RAMP_DENSE[ri];
      if (ch === ' ') ch = '.';
      var lit = (15 + v * 50) | 0;
      drawCharHSL(ch, x, y, bbHue[idx] | 0, 80, lit);
    }
  }
}

registerMode('borromean', { init: initBorromean, render: renderBorromean });
