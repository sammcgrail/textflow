import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Brusse — Brusselator reaction-diffusion. Turing patterns that drift slowly.
// Tuned for gentle movement, NOT strobing. Muted purple-magenta palette.

var brU = null, brV = null, brU2 = null, brV2 = null;
var brW = 0, brH = 0;
var brLastSeed = 0;

function brInit() {
  brW = state.COLS;
  brH = state.ROWS;
  if (brW < 4 || brH < 4) return;
  var n = brW * brH;
  brU = new Float32Array(n);
  brV = new Float32Array(n);
  brU2 = new Float32Array(n);
  brV2 = new Float32Array(n);
  // equilibrium: u ~ A, v ~ B/A
  for (var i = 0; i < n; i++) {
    brU[i] = 1.0 + (Math.random() - 0.5) * 0.2;
    brV[i] = 3.0 + (Math.random() - 0.5) * 0.2;
  }
  var seeds = state.isMobile ? 40 : 80;
  for (var s = 0; s < seeds; s++) {
    var cx = (Math.random() * brW) | 0;
    var cy = (Math.random() * brH) | 0;
    var r = 2 + ((Math.random() * 2) | 0);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || x >= brW || y < 0 || y >= brH) continue;
        if (dx * dx + dy * dy > r * r) continue;
        brU[y * brW + x] = 1.6 + Math.random() * 0.4;
        brV[y * brW + x] = 2.2 + Math.random() * 0.4;
      }
    }
  }
  brLastSeed = state.time;
  // pre-integrate to settle the pattern before first render
  for (var preI = 0; preI < 200; preI++) brStep();
}

function brStep() {
  var W = brW, H = brH;
  // Turing-regime params: asymmetric diffusion drives stripes without oscillation
  var DU = 0.3, DV = 1.6, A = 1.0, B = 2.8, dt = 0.04; // lowered B below Hopf threshold + slower dt
  for (var y = 0; y < H; y++) {
    var yN = (y - 1 + H) % H, yS = (y + 1) % H;
    var rowC = y * W, rowN = yN * W, rowS = yS * W;
    for (var x = 0; x < W; x++) {
      var xWp = (x - 1 + W) % W, xE = (x + 1) % W;
      var i = rowC + x;
      var u = brU[i], v = brV[i];
      var lu = brU[rowC + xWp] + brU[rowC + xE] + brU[rowN + x] + brU[rowS + x] - 4 * u;
      var lv = brV[rowC + xWp] + brV[rowC + xE] + brV[rowN + x] + brV[rowS + x] - 4 * v;
      var u2v = u * u * v;
      var nu = u + dt * (DU * lu + A - (B + 1) * u + u2v);
      var nv = v + dt * (DV * lv + B * u - u2v);
      brU2[i] = nu < 0 ? 0 : nu > 4 ? 4 : nu;
      brV2[i] = nv < 0 ? 0 : nv > 6 ? 6 : nv;
    }
  }
  var t = brU; brU = brU2; brU2 = t;
  var t2 = brV; brV = brV2; brV2 = t2;
}

function brSplash(cx, cy, radius, strength) {
  var r2 = radius * radius;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (x < 0 || x >= brW || y < 0 || y >= brH) continue;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - d2 / r2;
      var i = y * brW + x;
      brU[i] = Math.min(4.0, brU[i] + strength * 1.2 * falloff);
      brV[i] = Math.max(0.0, brV[i] - strength * 0.6 * falloff);
    }
  }
}

function brRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!brU || brW !== W || brH !== H) brInit();
  if (!brU) return;

  if (pointer.clicked && state.currentMode === 'brusse') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) brSplash(gx, gy, 5, 0.9);
  }
  if (pointer.down && state.currentMode === 'brusse') {
    var pgx = pointer.gx | 0, pgy = pointer.gy | 0;
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) brSplash(pgx, pgy, 2, 0.5);
  }
  if ((state.time - brLastSeed) > 20.0) {
    var extra = 3;
    for (var z = 0; z < extra; z++) brSplash((Math.random() * W) | 0, (Math.random() * H) | 0, 3, 0.6);
    brLastSeed = state.time;
  }

  // slower sim: fewer steps per frame so visible change is gradual, not flickery
  var STEPS = state.isMobile ? 3 : 6;
  for (var step = 0; step < STEPS; step++) brStep();

  // remove global pulse — no more strobing brightness
  var hueBase = (state.time * 8) % 360; // slow hue drift
  var CHARS = '.,:-=+*#@';
  var CL = CHARS.length;
  for (var yy = 0; yy < H; yy++) {
    var rowC2 = yy * W;
    for (var xx = 0; xx < W; xx++) {
      var u2 = brU[rowC2 + xx];
      var v2 = brV[rowC2 + xx];
      // normalize and clamp gently
      var du = (u2 - 1) / 2; // 0-centered
      var act = Math.abs(du);
      if (act < 0.08) continue; // skip anywhere near equilibrium → no background flicker
      var density = Math.min(1, act * 0.8);
      var ch = CHARS[Math.min(CL - 1, (density * CL) | 0)];
      // stable magenta palette: 260-320 with slow drift
      var h = (280 + hueBase * 0.3 + du * 40 + 720) % 360;
      var l = 45 + (density * 32) | 0; // narrower lightness range, no pulse
      drawCharHSL(ch, xx, yy, h | 0, 75, l); // lower saturation (75 vs 92) — softer
    }
  }
}

registerMode('brusse', { init: brInit, render: brRender });
