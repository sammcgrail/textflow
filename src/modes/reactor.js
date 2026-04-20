import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Gray-Scott reaction-diffusion. u, v concentrations. Waves propagate + spiral.

var rxU = null, rxV = null, rxU2 = null, rxV2 = null;
var rxW = 0, rxH = 0;
var rxLastSeed = 0;

function rxInit() {
  rxW = state.COLS;
  rxH = state.ROWS;
  if (rxW < 4 || rxH < 4) return;
  var n = rxW * rxH;
  rxU = new Float32Array(n);
  rxV = new Float32Array(n);
  rxU2 = new Float32Array(n);
  rxV2 = new Float32Array(n);
  for (var i = 0; i < n; i++) { rxU[i] = 1.0; rxV[i] = 0.0; }
  // seed — a LOT of perturbations so activity is immediate
  var seeds = state.isMobile ? 90 : 200;
  for (var s = 0; s < seeds; s++) {
    var cx = (Math.random() * rxW) | 0;
    var cy = (Math.random() * rxH) | 0;
    var r = 2 + ((Math.random() * 3) | 0);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || x >= rxW || y < 0 || y >= rxH) continue;
        if (dx * dx + dy * dy > r * r) continue;
        rxV[y * rxW + x] = 0.5 + Math.random() * 0.25;
        rxU[y * rxW + x] = 0.4 + Math.random() * 0.2;
      }
    }
  }
  rxLastSeed = state.time;
  // pre-integrate so first rendered frame already shows worms (thumbnails + late-mount)
  for (var preI = 0; preI < 250; preI++) rxStep();
}

function rxStep() {
  var W = rxW, H = rxH;
  var DU = 0.16, DV = 0.08, F = 0.046, K = 0.065;
  for (var y = 0; y < H; y++) {
    var yN = (y - 1 + H) % H, yS = (y + 1) % H;
    var rowC = y * W, rowN = yN * W, rowS = yS * W;
    for (var x = 0; x < W; x++) {
      var xWp = (x - 1 + W) % W, xE = (x + 1) % W;
      var i = rowC + x;
      var u = rxU[i], v = rxV[i];
      var lu = rxU[rowC + xWp] + rxU[rowC + xE] + rxU[rowN + x] + rxU[rowS + x] - 4 * u;
      var lv = rxV[rowC + xWp] + rxV[rowC + xE] + rxV[rowN + x] + rxV[rowS + x] - 4 * v;
      var uvv = u * v * v;
      var nu = u + (DU * lu - uvv + F * (1 - u));
      var nv = v + (DV * lv + uvv - (F + K) * v);
      rxU2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
      rxV2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
    }
  }
  var t = rxU; rxU = rxU2; rxU2 = t;
  var t2 = rxV; rxV = rxV2; rxV2 = t2;
}

function rxSplash(cx, cy, radius, strength) {
  var r2 = radius * radius;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (x < 0 || x >= rxW || y < 0 || y >= rxH) continue;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - d2 / r2;
      var i = y * rxW + x;
      rxV[i] = Math.min(1.0, rxV[i] + strength * falloff);
      rxU[i] = Math.max(0.0, rxU[i] - strength * 0.5 * falloff);
    }
  }
}

function rxRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!rxU || rxW !== W || rxH !== H) rxInit();
  if (!rxU) return; // grid not ready

  // click → splash
  if (pointer.clicked && state.currentMode === 'reactor') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      rxSplash(gx, gy, 5, 0.85);
    }
  }
  if (pointer.down && state.currentMode === 'reactor') {
    var pgx = pointer.gx | 0, pgy = pointer.gy | 0;
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) rxSplash(pgx, pgy, 2, 0.6);
  }
  if ((state.time - rxLastSeed) > 10.0) {
    var extra = 4 + ((Math.random() * 3) | 0);
    for (var z = 0; z < extra; z++) rxSplash((Math.random() * W) | 0, (Math.random() * H) | 0, 3, 0.7);
    rxLastSeed = state.time;
  }

  // advance many steps per frame
  var STEPS = state.isMobile ? 6 : 12;
  for (var step = 0; step < STEPS; step++) rxStep();

  // render
  var hueBase = (state.time * 28) % 360;
  var CHARS = '.,-:;!*%@#';
  var CL = CHARS.length;
  for (var yy = 0; yy < H; yy++) {
    var rowC2 = yy * W;
    for (var xx = 0; xx < W; xx++) {
      var v2 = rxV[rowC2 + xx];
      var u2 = rxU[rowC2 + xx];
      var activity = v2 + (1 - u2) * 0.3;
      if (activity < 0.02) continue;
      var density = Math.min(1, v2 * 2.0 + (1 - u2) * 0.6);
      var ch = CHARS[Math.min(CL - 1, (density * CL) | 0)];
      var h = (hueBase + v2 * 220 + (1 - u2) * 60) % 360;
      var l = 40 + (density * 45) | 0;
      drawCharHSL(ch, xx, yy, h | 0, 94, l);
    }
  }
}

registerMode('reactor', { init: rxInit, render: rxRender });
