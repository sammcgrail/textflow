import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// pebbin — tidal beach + settling pebble cairns. Stones fall from
// the sky (or land where you click) and stack on the sand. Every
// few seconds a wave rolls in from alternating sides and gently
// redistributes the lowest row. Stacks that get too top-heavy tumble.
// Color palette: slate greys, seagreen, occasional quartz sparkle.

var pebbins = null;       // { x, y, vy, ch, hue, sat, light, settled }
var waves = null;         // { x, y, vx, life }
var splashes = null;      // { x, y, vx, vy, life, ch, hue }
var dropTimer = 0;
var waveTimer = 0;
var waveDir = 1;
var pbW = 0, pbH = 0;
var sandLine = 0;

// per-column top-y tracker: where the next pebble stacks
var stackHeight = null;

var PEBBLE_CHARS = ['●', 'o', 'O', '◯', '·', '•', '@', '°'];

function colForX(x) {
  return Math.max(0, Math.min(pbW - 1, x | 0));
}

function resetStack() {
  stackHeight = new Array(pbW);
  for (var i = 0; i < pbW; i++) stackHeight[i] = sandLine;
}

function spawnPebble(tx, big) {
  // Fall from top or arrive from where clicked (dropped from top)
  var hue = [210, 150, 35, 200, 45][(Math.random() * 5) | 0]; // slate/green/tan/steel/quartz
  var sat = 25 + Math.random() * 35;
  var light = 45 + Math.random() * 20;
  var chIdx = big ? (Math.random() * 3) | 0 : 2 + ((Math.random() * 6) | 0);
  pebbins.push({
    x: tx,
    y: -1,
    vy: 0,
    ch: PEBBLE_CHARS[chIdx],
    hue: hue,
    sat: sat,
    light: light,
    settled: false,
    sparkle: Math.random() < 0.08  // 8% chance of quartz
  });
}

function initPebbin() {
  pbW = state.COLS;
  pbH = state.ROWS;
  sandLine = pbH - 2;
  pebbins = [];
  waves = [];
  splashes = [];
  resetStack();
  dropTimer = 0;
  waveTimer = 2;
  waveDir = 1;
  // pre-seed cairns — clusters of 3-6 pebbles stacked on the same column
  var cairnCount = Math.max(6, (pbW / 14) | 0);
  for (var c = 0; c < cairnCount; c++) {
    var cx = ((Math.random() * (pbW - 4)) | 0) + 2;
    var stackH = 3 + ((Math.random() * 4) | 0);
    for (var s = 0; s < stackH; s++) {
      var stackY = stackHeight[cx];
      pebbins.push({
        x: cx,
        y: stackY,
        vy: 0,
        ch: PEBBLE_CHARS[((Math.random() * PEBBLE_CHARS.length) | 0)],
        hue: [210, 150, 35, 200, 45, 180][(Math.random() * 6) | 0],
        sat: 40 + Math.random() * 40,
        light: 50 + Math.random() * 25,
        settled: true,
        sparkle: Math.random() < 0.12
      });
      stackHeight[cx] = stackY - 1;
    }
  }
  // plus scattered singletons along the beach line
  for (var i = 0; i < 70; i++) {
    var tx = (Math.random() * pbW) | 0;
    var stackY = stackHeight[tx];
    pebbins.push({
      x: tx,
      y: stackY,
      vy: 0,
      ch: PEBBLE_CHARS[((Math.random() * PEBBLE_CHARS.length) | 0)],
      hue: [210, 150, 35, 200, 45, 180][(Math.random() * 6) | 0],
      sat: 40 + Math.random() * 40,
      light: 50 + Math.random() * 25,
      settled: true,
      sparkle: Math.random() < 0.12
    });
    stackHeight[tx] = stackY - 1;
  }
  // pre-seed a couple in-flight
  for (var j = 0; j < 3; j++) {
    spawnPebble(((Math.random() * pbW) | 0), false);
    pebbins[pebbins.length - 1].y = Math.random() * (sandLine - 4);
    pebbins[pebbins.length - 1].vy = 0.4 + Math.random() * 0.4;
  }
}

function renderPebbin() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pebbins || pbW !== W || pbH !== H) initPebbin();

  var t = state.time;
  var dt = 1 / 60;

  // Click drop
  if (pointer.clicked && state.currentMode === 'pebbin') {
    pointer.clicked = false;
    spawnPebble(colForX(pointer.gx), true);
  }
  // Drag = sustained drop at pointer
  if (pointer.down && state.currentMode === 'pebbin') {
    if (Math.random() < 0.25) spawnPebble(colForX(pointer.gx), Math.random() < 0.5);
  }

  // Auto-drop
  dropTimer -= dt;
  if (dropTimer <= 0) {
    dropTimer = 0.6 + Math.random() * 0.5;
    spawnPebble(((Math.random() * W) | 0), Math.random() < 0.3);
  }

  // Wave trigger
  waveTimer -= dt;
  if (waveTimer <= 0) {
    waveTimer = 4.5 + Math.random() * 2.5;
    waveDir = -waveDir;
    for (var i = 0; i < 8; i++) {
      waves.push({
        x: waveDir > 0 ? -3 : W + 3,
        y: sandLine + 0.5 + (Math.random() - 0.5) * 0.8,
        vx: waveDir * (0.9 + Math.random() * 0.4),
        life: 1.4 + Math.random() * 0.4
      });
    }
  }

  // Update pebbles (falling ones)
  for (var i = 0; i < pebbins.length; i++) {
    var p = pebbins[i];
    if (p.settled) continue;
    p.vy += 0.035; // gravity
    p.y += p.vy;
    var col = colForX(p.x);
    var floorY = stackHeight[col];
    if (p.y >= floorY) {
      p.y = floorY;
      p.settled = true;
      stackHeight[col] = floorY - 1;
      // splash particles
      for (var k = 0; k < 4; k++) {
        var ang = -Math.random() * Math.PI;
        var sp = 0.3 + Math.random() * 0.8;
        splashes.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.3 + Math.random() * 0.25,
          ch: Math.random() < 0.5 ? '.' : '·',
          hue: p.hue
        });
      }
      // occasional tumble: if stack too tall + narrow, shed top pebble sideways
      var stackH = sandLine - floorY;
      if (stackH > 5 && Math.random() < 0.3) {
        // look at neighboring columns for a lower spot
        var leftN = col > 0 ? stackHeight[col - 1] : floorY;
        var rightN = col < W - 1 ? stackHeight[col + 1] : floorY;
        if (leftN > floorY + 1 || rightN > floorY + 1) {
          var dir = leftN > rightN ? -1 : 1;
          p.settled = false;
          p.x = col + dir;
          p.y = floorY;
          p.vy = 0;
          stackHeight[col] = floorY + 1; // restore the slot
        }
      }
    }
  }

  // Update waves — push lowest-layer pebbles sideways gently
  for (var i = waves.length - 1; i >= 0; i--) {
    var w = waves[i];
    w.x += w.vx;
    w.life -= dt;
    // Nudge pebbles on the beach line when wave crosses
    if (w.life > 0) {
      for (var j = 0; j < pebbins.length; j++) {
        var p = pebbins[j];
        if (!p.settled) continue;
        if (p.y < sandLine - 1) continue; // only touch lowest row
        if (Math.abs(p.x - w.x) < 1.2) {
          // kick the pebble's column height up briefly + hue shift toward wet
          if (Math.random() < 0.15) {
            p.light = Math.min(80, p.light + 2);
          }
        }
      }
    }
    if (w.life <= 0 || w.x < -5 || w.x > W + 5) waves.splice(i, 1);
  }

  // Update splashes
  for (var i = splashes.length - 1; i >= 0; i--) {
    var s = splashes[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.05;
    s.life -= dt;
    if (s.life <= 0) splashes.splice(i, 1);
  }

  // ---- RENDER ----

  // sky gradient backdrop: faint horizon glow near sandLine
  for (var y = 0; y < sandLine; y++) {
    var skyFade = 1 - (y / sandLine);
    if (Math.random() < 0.004 + skyFade * 0.01) {
      var sx = (Math.random() * W) | 0;
      drawCharHSL('·', sx, y, 210 + Math.random() * 20, 25, 15 + skyFade * 8);
    }
  }
  // occasional distant gulls
  var gullY = ((Math.sin(t * 0.3) * 4 + 3) | 0) + 2;
  var gullX = ((t * 6) % (W + 10)) - 5;
  var gxi = gullX | 0;
  if (gxi >= 0 && gxi < W && gullY >= 0 && gullY < H) {
    drawCharHSL('v', gxi, gullY, 220, 10, 50);
  }

  // sand line
  for (var x = 0; x < W; x++) {
    var sandCh = ((x + t * 0.3) | 0) % 4 === 0 ? '~' : '-';
    drawCharHSL(sandCh, x, sandLine + 1, 40, 35, 35);
  }

  // waves — render as flowing '~' strokes
  for (var i = 0; i < waves.length; i++) {
    var w = waves[i];
    var wx = w.x | 0, wy = w.y | 0;
    if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
      var alpha = Math.min(1, w.life / 1.4);
      drawCharHSL('~', wx, wy, 200, 60, 40 + alpha * 25);
      // trailing foam
      if (wx - (waveDir > 0 ? 1 : -1) >= 0 && wx - (waveDir > 0 ? 1 : -1) < W) {
        drawCharHSL('.', wx - (waveDir > 0 ? 1 : -1), wy, 200, 30, 30 + alpha * 20);
      }
    }
  }

  // pebbles — the star of the show
  for (var i = 0; i < pebbins.length; i++) {
    var p = pebbins[i];
    var px = p.x | 0, py = p.y | 0;
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    var lt = p.light;
    if (p.sparkle && p.settled) {
      lt = p.light + Math.sin(t * 3 + p.x * 2.3 + p.y) * 12;
    }
    drawCharHSL(p.ch, px, py, p.hue | 0, p.sat | 0, lt | 0);
  }

  // splashes
  for (var i = 0; i < splashes.length; i++) {
    var s = splashes[i];
    var sx = s.x | 0, sy = s.y | 0;
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
    drawCharHSL(s.ch, sx, sy, s.hue | 0, 30, 45);
  }

  // small label — bottom-right so nav bar doesn't overlap it on mobile
  var label = 'pebbin';
  for (var i = 0; i < label.length; i++) {
    drawCharHSL(label[i], W - label.length - 1 + i, H - 2, 200, 30, 45);
  }
}

registerMode('pebbin', { init: initPebbin, render: renderPebbin });
