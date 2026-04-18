// clawsparty — pixel-art party scene inspired by ulant's "claws party" GIF
// (ulant kitsune-penguin, barnacle crab, tanuki-seb, calne spectre, disco ball,
// confetti, checkerboard floor). Commissioned by sam 2026-04-18 for a recursive
// pixelification loop: ulant pixel-animation → seb textflow → ulant pixelifies
// the textflow → seb textflows that → ... 3 cycles for max "deep fry".
//
// Each character = one pixel cell. Palette chosen to survive aggressive
// quantization: solid primaries on a dark bg, no mid-tones that would collapse.
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var cpConf, cpTimer, cpW, cpH, cpFlashT;

// Sprite legend:
//   space = transparent, . = transparent
//   P purple (hood)   K black        W white
//   O orange (tail)   w white-tip
//   R crab-red        e eye (black)  c claw-orange
//   T tan (tanuki)    t brown        K black accent
//   V violet-glow     S spectre-gray G glitch-cyan
//   # disco tile (rotating hue)   - disco rim (gold)
//   Y yellow (floor)  B blue (floor)

var PENGUIN = [
  '.PPP.',
  'PPPPP',
  'PKWKP',
  '.KWK.',
  '.WWW.',
  '.KKK.',
];

// Kitsune-fox tail fanned out to the right of penguin
var TAIL = [
  '...O',
  '..Ow',
  '.OOw',
  'OOw.',
];

var CRAB = [
  'c  c',
  'cReRc',
  '.RRR.',
  '.RRR.',
  '.K.K.',
];

var TANUKI = [
  '.tt.',
  'tTTt',
  'TeTe',
  '.TT.',
  '.KK.',
];

var SPECTRE = [
  '.S.S.',
  'SVVVS',
  '.GGG.',
  'S.S.S',
  '..S..',
];

var DISCO = [
  '.---.',
  '-###-',
  '#####',
  '#####',
  '-###-',
  '.---.',
];

// Floor checkerboard tile (2 rows tall)
// alternates Y/B every cell, shifted per row
function drawFloor(t) {
  var floorTop = cpH - 4;
  for (var y = floorTop; y < cpH; y++) {
    var rowOffset = (y - floorTop);
    for (var x = 0; x < cpW; x++) {
      var cell = ((x >> 1) + rowOffset) & 1;
      var hue = cell ? 210 : 30; // blue vs orange
      var light = cell ? 48 : 55;
      // subtle pulse with beat
      var beat = 0.92 + 0.08 * Math.sin(t * 4 + x * 0.1);
      drawCharHSL('#', x, y, hue, 75, (light * beat) | 0);
    }
  }
}

// Return HSL for a given sprite-legend char at time t, facet index f
function slotColor(ch, t, f) {
  switch (ch) {
    case 'P': return [285, 70, 55]; // purple hood
    case 'K': return [0, 0, 8];     // black
    case 'W': return [0, 0, 95];    // white
    case 'O': return [28, 92, 58];  // orange (fox)
    case 'w': return [45, 60, 92];  // cream tail-tip
    case 'c': return [18, 90, 56];  // crab claw
    case 'R': return [0, 85, 52];   // crab red
    case 'e': return [0, 0, 8];     // eye
    case 'T': return [28, 55, 42];  // tanuki body
    case 't': return [24, 45, 26];  // tanuki dark
    case 'V': return [285, 90, 68]; // violet glow
    case 'S': return [250, 20, 55]; // spectre gray-blue
    case 'G': return [170, 85, 55]; // glitch cyan
    case '#': return [((t * 80 + f * 40) | 0) % 360, 85, 60]; // disco rotating hue
    case '-': return [45, 80, 62];  // disco gold rim
    default: return [0, 0, 45];
  }
}

function drawSprite(sprite, sx, sy, t, cellGlyph) {
  var f = 0;
  for (var r = 0; r < sprite.length; r++) {
    var row = sprite[r];
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === ' ' || ch === '.') continue;
      var x = sx + c, y = sy + r;
      if (x < 0 || x >= cpW || y < 0 || y >= cpH) continue;
      var hsl = slotColor(ch, t, f++);
      drawCharHSL(cellGlyph || '#', x, y, hsl[0], hsl[1], hsl[2]);
    }
  }
}

function cpSpawnConfetti(W, H, n) {
  for (var i = 0; i < n; i++) {
    cpConf.push({
      x: Math.random() * W,
      y: -Math.random() * 6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2.2 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 5,
      hue: (Math.random() * 360) | 0,
      life: 1
    });
  }
}

function initClawsparty() {
  cpW = state.COLS;
  cpH = state.ROWS;
  cpConf = [];
  cpTimer = 0;
  cpFlashT = 0;
  cpSpawnConfetti(cpW, cpH, 60);
}

function renderClawsparty() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (cpW !== W || cpH !== H) initClawsparty();
  var t = state.time;
  var dt = 1 / 60;

  // ── confetti
  if (cpConf.length < (state.isMobile ? 60 : 110)) cpSpawnConfetti(W, H, 3);
  for (var i = cpConf.length - 1; i >= 0; i--) {
    var c = cpConf[i];
    c.x += c.vx * dt * 6;
    c.y += c.vy * dt * 6;
    c.vy += 3 * dt; // gravity
    c.rot += c.spin * dt;
    c.x += Math.sin(t * 0.7 + c.y * 0.15) * 0.12;
    if (c.y > H - 5 || c.x < -2 || c.x > W + 2) { cpConf.splice(i, 1); continue; }
    var ix = c.x | 0, iy = c.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var phase = (c.rot + c.x * 0.2) % (Math.PI * 2);
    var ch = phase > 0.8 ? (phase > 2.0 ? 'o' : 'x') : (phase > -0.8 ? '*' : '+');
    drawCharHSL(ch, ix, iy, c.hue, 90, 62);
  }

  // ── disco ball (top center), bobs + spins
  var ballX = ((W / 2) - 2) | 0;
  var ballY = Math.max(1, ((H * 0.10) | 0) + (Math.sin(t * 2) * 1) | 0);
  drawSprite(DISCO, ballX, ballY, t, '#');

  // occasional strobe: bright flash every 1.5s
  cpFlashT += dt;
  if (cpFlashT > 1.5) {
    cpFlashT = 0;
  }
  var flashAmp = Math.max(0, 1 - cpFlashT * 2);

  // ── calne spectre (floats behind penguin, semi-transparent)
  // render FIRST so penguin occludes
  var spectreX = ((W / 2) - 2) | 0;
  var spectreY = ((H * 0.35) | 0) + ((Math.sin(t * 1.3) * 2) | 0);
  drawSprite(SPECTRE, spectreX, spectreY, t, '%');

  // ── penguin (ulant, center), bobs up/down
  var penW = PENGUIN[0].length;
  var penH = PENGUIN.length;
  var penX = ((W - penW) / 2) | 0;
  var penBob = (Math.sin(t * 3.5) * 0.7) | 0;
  var penY = ((H * 0.52) | 0) + penBob;
  drawSprite(PENGUIN, penX, penY, t, '#');
  // fox tail — sways slightly
  var tailSway = (Math.sin(t * 4) * 0.6) | 0;
  drawSprite(TAIL, penX + penW, penY + 1 + tailSway, t, '#');

  // ── crab (barnacle, left), claws wave open/closed
  var crabX = ((W * 0.15) | 0);
  var crabY = ((H * 0.60) | 0) + ((Math.sin(t * 4.1) * 0.5) | 0);
  // alternate claw sprite with the wave
  var clawUp = Math.sin(t * 5) > 0;
  var CRAB_POSED = clawUp
    ? CRAB
    : [
      '.cRc.',
      'cReRc',
      '.RRR.',
      '.RRR.',
      '.K.K.',
    ];
  drawSprite(CRAB_POSED, crabX, crabY, t, '#');

  // ── tanuki (seb, right), bobs
  var tanX = ((W * 0.80) | 0);
  var tanY = ((H * 0.60) | 0) + ((Math.sin(t * 3.8 + 1) * 0.6) | 0);
  drawSprite(TANUKI, tanX, tanY, t, '#');

  // ── floor (2-row checkerboard, beat pulse)
  drawFloor(t);

  // ── pointer tap: drop confetti burst at pointer
  if (pointer.clicked && state.currentMode === 'clawsparty') {
    pointer.clicked = false;
    for (var k = 0; k < 30; k++) {
      cpConf.push({
        x: pointer.gx + (Math.random() - 0.5) * 4,
        y: pointer.gy,
        vx: (Math.random() - 0.5) * 8,
        vy: -2 - Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 8,
        hue: (Math.random() * 360) | 0,
        life: 1
      });
    }
  }
}

registerMode('clawsparty', {
  init: initClawsparty,
  render: renderClawsparty,
});
