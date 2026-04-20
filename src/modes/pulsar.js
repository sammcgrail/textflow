import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Pulsar — Barkley excitable medium. Slower pace so spirals breathe.
// Interactions: click = ignite a new rotating front; hold = continuous excitation;
// each interaction emits a visible ring pulse so the feedback is obvious.

var puU = null, puV = null, puU2 = null, puV2 = null;
var puW = 0, puH = 0;
var puLastSeed = 0;
var puPulses = null; // visible ring pulses triggered by interaction

function puInit() {
  puW = state.COLS;
  puH = state.ROWS;
  if (puW < 4 || puH < 4) return;
  var n = puW * puH;
  puU = new Float32Array(n);
  puV = new Float32Array(n);
  puU2 = new Float32Array(n);
  puV2 = new Float32Array(n);
  puPulses = [];
  // seed: create 3-4 asymmetric fronts for spirals
  var fronts = state.isMobile ? 3 : 4;
  for (var f = 0; f < fronts; f++) {
    var cx = (Math.random() * puW) | 0;
    var cy = (Math.random() * puH) | 0;
    var dir = Math.random() * Math.PI * 2;
    var cosD = Math.cos(dir), sinD = Math.sin(dir);
    for (var y = 0; y < puH; y++) {
      for (var x = 0; x < puW; x++) {
        var dx = x - cx, dy = y - cy;
        var along = dx * cosD + dy * sinD;
        var perp = -dx * sinD + dy * cosD;
        if (along > 0 && along < 6 && Math.abs(perp) < 20) {
          puU[y * puW + x] = Math.max(puU[y * puW + x], 1.0);
        }
        if (along < 0 && along > -4 && Math.abs(perp) < 20) {
          puV[y * puW + x] = Math.max(puV[y * puW + x], 0.5);
        }
      }
    }
  }
  for (var s = 0; s < 40; s++) {
    var sx = (Math.random() * puW) | 0;
    var sy = (Math.random() * puH) | 0;
    puU[sy * puW + sx] = 0.7;
  }
  puLastSeed = state.time;
}

function puStep() {
  var W = puW, H = puH;
  var D = 0.8;
  var a = 0.75, b = 0.04, eps = 0.025;
  var dt = 0.08; // was 0.12 — slower pace
  for (var y = 0; y < H; y++) {
    var yN = (y - 1 + H) % H, yS = (y + 1) % H;
    var rowC = y * W, rowN = yN * W, rowS = yS * W;
    for (var x = 0; x < W; x++) {
      var xW = (x - 1 + W) % W, xE = (x + 1) % W;
      var i = rowC + x;
      var u = puU[i], v = puV[i];
      var lu = puU[rowC + xW] + puU[rowC + xE] + puU[rowN + x] + puU[rowS + x] - 4 * u;
      var thresh = (v + b) / a;
      var ru = D * lu + (1 / eps) * u * (1 - u) * (u - thresh);
      var rv = u - v;
      var nu = u + dt * ru;
      var nv = v + dt * rv;
      puU2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
      puV2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
    }
  }
  var t = puU; puU = puU2; puU2 = t;
  var t2 = puV; puV = puV2; puV2 = t2;
}

// Ignite — directional front (spiral seed) at pointer
function puIgnite(cx, cy, strength, angle) {
  var cosD = Math.cos(angle), sinD = Math.sin(angle);
  var R = 10;
  for (var dy = -R; dy <= R; dy++) {
    for (var dx = -R; dx <= R; dx++) {
      var x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (x < 0 || x >= puW || y < 0 || y >= puH) continue;
      var along = dx * cosD + dy * sinD;
      var perp = -dx * sinD + dy * cosD;
      if (Math.abs(perp) > R) continue;
      var i = y * puW + x;
      if (along > 0 && along < 5) puU[i] = Math.min(1, puU[i] + strength);
      else if (along < 0 && along > -4) puV[i] = Math.min(1, puV[i] + strength * 0.6);
    }
  }
}

function puSplash(cx, cy, radius, strength) {
  var r2 = radius * radius;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (x < 0 || x >= puW || y < 0 || y >= puH) continue;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - d2 / r2;
      var i = y * puW + x;
      puU[i] = Math.min(1.0, puU[i] + strength * falloff);
    }
  }
}

function puRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!puU || puW !== W || puH !== H) puInit();
  if (!puU) return;
  var t = state.time;

  if (pointer.clicked && state.currentMode === 'pulsar') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      puIgnite(gx, gy, 1.0, Math.random() * Math.PI * 2);
      puPulses.push({ x: gx, y: gy, t0: t, hue: 30 + Math.random() * 40 });
    }
  }
  if (pointer.down && state.currentMode === 'pulsar') {
    var pgx = pointer.gx | 0, pgy = pointer.gy | 0;
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) {
      puSplash(pgx, pgy, 3, 0.4);
      if (Math.random() < 0.12) {
        puPulses.push({ x: pgx, y: pgy, t0: t, hue: 20 + Math.random() * 30 });
      }
    }
  }
  if ((state.time - puLastSeed) > 18.0) {
    var cx = (Math.random() * W) | 0;
    var cy = (Math.random() * H) | 0;
    puSplash(cx, cy, 4, 0.8);
    puLastSeed = state.time;
  }

  var STEPS = state.isMobile ? 3 : 5; // slower — was 10
  for (var step = 0; step < STEPS; step++) puStep();

  var hueBase = (state.time * 14) % 360;
  var CHARS = '.,:-=*+%#@';
  var CL = CHARS.length;
  for (var yy = 0; yy < H; yy++) {
    var rowC2 = yy * W;
    for (var xx = 0; xx < W; xx++) {
      var u2 = puU[rowC2 + xx];
      var v2 = puV[rowC2 + xx];
      var act = u2 + v2 * 0.4;
      if (act < 0.06) continue;
      var density = Math.min(1, u2 * 1.1 + v2 * 0.6);
      var ch = CHARS[Math.min(CL - 1, (density * CL) | 0)];
      var h = (hueBase + u2 * 60 - v2 * 20 + 360) % 360;
      var l = 42 + (density * 48) | 0;
      drawCharHSL(ch, xx, yy, h | 0, 92, l);
    }
  }

  // interaction pulse rings — visible feedback
  for (var pp = 0; pp < puPulses.length; pp++) {
    var pulse = puPulses[pp];
    var age = t - pulse.t0;
    if (age > 1.2) { puPulses.splice(pp, 1); pp--; continue; }
    var r = age * 28;
    var light = Math.max(40, 90 - age * 50) | 0;
    var steps = Math.max(24, r * 2.0) | 0;
    for (var rs = 0; rs < steps; rs++) {
      var ang = (rs / steps) * Math.PI * 2;
      var rx = (pulse.x + Math.cos(ang) * r) | 0;
      var ry = (pulse.y + Math.sin(ang) * r) | 0;
      if (rx < 0 || rx >= W || ry < 0 || ry >= H) continue;
      drawCharHSL(age < 0.4 ? '@' : age < 0.8 ? '*' : '+', rx, ry, pulse.hue | 0, 95, light);
    }
  }
}

registerMode('pulsar', { init: puInit, render: puRender });
