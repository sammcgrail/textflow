import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// cyclical — Cyclic Cellular Automaton (Greenberg-Hastings family).
//
// Each cell holds a state 0..N-1. A cell at state k advances to (k+1) mod N
// iff at least one Moore-neighbor is already at (k+1) mod N. Started from
// random noise, this single rule self-organizes into rotating spiral waves
// — a classic example of pattern formation from local rules.
//
// Tap drops a high-amplitude perturbation seed (a small disk in one state)
// that punches a fresh spiral nucleus into the lattice; drag paints a streak.

var N_STATES = 12;
var THRESHOLD = 1;     // # of neighbors needed at state k+1 to advance
var W = 0, H = 0;
var grid = null, next = null;
var lastStep = 0;
var STEP_INTERVAL = 0.08;  // seconds between CA ticks
var GLYPHS = ['·', '∘', '○', '●', '◍', '◉'];

function initCyclical() {
  W = 0; H = 0;
  grid = null; next = null;
  lastStep = 0;
}

function reset(W_, H_) {
  W = W_; H = H_;
  grid = new Uint8Array(W * H);
  next = new Uint8Array(W * H);
  for (var i = 0; i < W * H; i++) {
    grid[i] = (Math.random() * N_STATES) | 0;
  }
}

function paintSeed(gx, gy, st) {
  var R = 3;
  var cx = gx | 0, cy = gy | 0;
  for (var y = -R; y <= R; y++) {
    for (var x = -R; x <= R; x++) {
      if (x * x + y * y > R * R) continue;
      var px = cx + x, py = cy + y;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      grid[py * W + px] = st;
    }
  }
}

function step() {
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var s = grid[y * W + x];
      var target = (s + 1) % N_STATES;
      var hits = 0;
      // 8-neighbor Moore
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          if (grid[ny * W + nx] === target) { hits++; if (hits >= THRESHOLD) break; }
        }
        if (hits >= THRESHOLD) break;
      }
      next[y * W + x] = hits >= THRESHOLD ? target : s;
    }
  }
  var tmp = grid; grid = next; next = tmp;
}

function renderCyclical() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) reset(CW, CH);

  if (state.currentMode === 'cyclical') {
    if (pointer.clicked) {
      pointer.clicked = false;
      paintSeed(pointer.gx, pointer.gy, (Math.random() * N_STATES) | 0);
    }
    if (pointer.down) {
      paintSeed(pointer.gx, pointer.gy, (Math.random() * N_STATES) | 0);
    }
  }

  if (state.time - lastStep > STEP_INTERVAL) {
    step();
    lastStep = state.time;
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var s = grid[y * W + x];
      var hue = (s / N_STATES) * 360;
      var sat = 88;
      var lit = 30 + (s / N_STATES) * 35;
      var ch = GLYPHS[s % GLYPHS.length];
      drawCharHSL(ch, x, y, hue | 0, sat, lit | 0);
    }
  }
}

registerMode('cyclical', { init: initCyclical, render: renderCyclical });
