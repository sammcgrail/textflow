import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Mitosis — Gray-Scott tuned for self-replicating spots.
// F=0.0367, K=0.0649 — the "mitosis" regime. Spots grow, pinch, divide.
// Looks like a petri dish of splitting cells.

var miU = null, miV = null, miU2 = null, miV2 = null;
var miW = 0, miH = 0;
var miLastSeed = 0;

function miInit() {
  miW = state.COLS;
  miH = state.ROWS;
  if (miW < 4 || miH < 4) return;
  var n = miW * miH;
  miU = new Float32Array(n);
  miV = new Float32Array(n);
  miU2 = new Float32Array(n);
  miV2 = new Float32Array(n);
  for (var i = 0; i < n; i++) { miU[i] = 1.0; miV[i] = 0.0; }
  // fewer, larger seeds so spots have room to divide
  var seeds = state.isMobile ? 40 : 90;
  for (var s = 0; s < seeds; s++) {
    var cx = (Math.random() * miW) | 0;
    var cy = (Math.random() * miH) | 0;
    var r = 2 + ((Math.random() * 2) | 0);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var x = cx + dx, y = cy + dy;
        if (x < 0 || x >= miW || y < 0 || y >= miH) continue;
        if (dx * dx + dy * dy > r * r) continue;
        miV[y * miW + x] = 0.55 + Math.random() * 0.25;
        miU[y * miW + x] = 0.35 + Math.random() * 0.2;
      }
    }
  }
  miLastSeed = state.time;
  // pre-integrate so first rendered frame already shows dividing spots
  for (var preI = 0; preI < 350; preI++) miStep();
}

function miStep() {
  var W = miW, H = miH;
  var DU = 0.16, DV = 0.08, F = 0.0367, K = 0.0649;
  for (var y = 0; y < H; y++) {
    var yN = (y - 1 + H) % H, yS = (y + 1) % H;
    var rowC = y * W, rowN = yN * W, rowS = yS * W;
    for (var x = 0; x < W; x++) {
      var xWp = (x - 1 + W) % W, xE = (x + 1) % W;
      var i = rowC + x;
      var u = miU[i], v = miV[i];
      var lu = miU[rowC + xWp] + miU[rowC + xE] + miU[rowN + x] + miU[rowS + x] - 4 * u;
      var lv = miV[rowC + xWp] + miV[rowC + xE] + miV[rowN + x] + miV[rowS + x] - 4 * v;
      var uvv = u * v * v;
      var nu = u + (DU * lu - uvv + F * (1 - u));
      var nv = v + (DV * lv + uvv - (F + K) * v);
      miU2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
      miV2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
    }
  }
  var t = miU; miU = miU2; miU2 = t;
  var t2 = miV; miV = miV2; miV2 = t2;
}

function miSplash(cx, cy, radius, strength) {
  var r2 = radius * radius;
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var x = (cx + dx) | 0, y = (cy + dy) | 0;
      if (x < 0 || x >= miW || y < 0 || y >= miH) continue;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - d2 / r2;
      var i = y * miW + x;
      miV[i] = Math.min(1.0, miV[i] + strength * falloff);
      miU[i] = Math.max(0.0, miU[i] - strength * 0.5 * falloff);
    }
  }
}

function miRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!miU || miW !== W || miH !== H) miInit();
  if (!miU) return;

  if (pointer.clicked && state.currentMode === 'mitosis') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) miSplash(gx, gy, 4, 0.9);
  }
  if (pointer.down && state.currentMode === 'mitosis') {
    var pgx = pointer.gx | 0, pgy = pointer.gy | 0;
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) miSplash(pgx, pgy, 2, 0.55);
  }
  if ((state.time - miLastSeed) > 15.0) {
    var extra = 3 + ((Math.random() * 2) | 0);
    for (var z = 0; z < extra; z++) miSplash((Math.random() * W) | 0, (Math.random() * H) | 0, 2, 0.75);
    miLastSeed = state.time;
  }

  var STEPS = state.isMobile ? 8 : 16;
  for (var step = 0; step < STEPS; step++) miStep();

  var hueBase = (state.time * 18) % 360;
  var CHARS = 'o0O@*+:.';
  var CL = CHARS.length;
  for (var yy = 0; yy < H; yy++) {
    var rowC2 = yy * W;
    for (var xx = 0; xx < W; xx++) {
      var v2 = miV[rowC2 + xx];
      var u2 = miU[rowC2 + xx];
      var activity = v2 + (1 - u2) * 0.3;
      if (activity < 0.04) continue;
      var density = Math.min(1, v2 * 1.8 + (1 - u2) * 0.5);
      // invert char map so dense spots use 'o' and edges use '.'
      var ch = CHARS[Math.min(CL - 1, ((1 - density) * CL) | 0)];
      // green-yellow palette: hue 80-160 range
      var h = (80 + hueBase + v2 * 80 + (1 - u2) * 40) % 360;
      var l = 45 + (density * 45) | 0;
      drawCharHSL(ch, xx, yy, h | 0, 94, l);
    }
  }
}

registerMode('mitosis', { init: miInit, render: miRender });
