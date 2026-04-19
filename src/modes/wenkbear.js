// wenkbear — WENK fighting a BEAR. Commissioned by Sam for mcwenker's
// birthday cycle 2026-04-19. Two sprites face off on a grass line, cycle
// idle → windup → strike → recoil with impact POW/WHAM/BONK/BOP text
// that strobes on hit. Night sky w/ star drizzle above, silhouette trees
// on the horizon. Tap to force an immediate strike.
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ── Sprites. Blank space = transparent. Color is applied per sprite
// rather than per-char to keep rendering cheap.

// Wenk: small stick figure with boxing gloves. Idle / windup / punch.
var WENK_IDLE = [
  '  _  ',
  ' (o) ',
  '=|=|=',
  '  |  ',
  ' / \\ '
];
var WENK_WIND = [   // coiled — knees bent, gloves back
  '  _  ',
  ' (o) ',
  '<=|= ',
  '  |  ',
  ' / \\ '
];
var WENK_PUNCH = [  // jab forward — one arm extended
  '  _  ',
  ' (o) ',
  ' =|==>',
  '  |  ',
  ' / | '
];
var WENK_HIT = [    // X eyes, stumble back
  '  _  ',
  ' (x) ',
  ' /|\\ ',
  '  |  ',
  ' /\\ '
];

// Bear: bulkier, claws up. Idle / growl / swipe.
var BEAR_IDLE = [
  '    .---.   ',
  '   / o o \\  ',
  '  (   v   ) ',
  '  /=======\\ ',
  ' (  \\   /  )',
  '    \\___/   '
];
var BEAR_GROWL = [  // open mouth, claws flexed
  '    .---.   ',
  '   / @ @ \\  ',
  '  ( G R R ) ',
  '  /=======\\ ',
  ' Y  | | |  Y',
  '    \\___/   '
];
var BEAR_SWIPE = [  // right paw swung forward (toward wenk on its left)
  '    .---.   ',
  '   / @ @ \\  ',
  '  (  \\_/  )=<-',
  '  /=======\\ ',
  ' (  | | |  )',
  '    \\___/   '
];
var BEAR_HIT = [    // recoiled
  '    .---.   ',
  '   / x x \\  ',
  '  (   *   ) ',
  '  /=======\\ ',
  ' (  /|\\   ) ',
  '    \\_/     '
];

// Trees for the horizon silhouette.
var TREE = [
  '   *   ',
  '  ***  ',
  ' ***** ',
  '*******',
  '   |   '
];

// Smaller shrub
var SHRUB = [
  ' *** ',
  '*****',
  '  |  '
];

var IMPACT_WORDS = ['POW!', 'WHAM!', 'BONK!', 'BOP!', 'SMACK!', 'KRAK!', 'BOOM!'];

var wbState = {
  w: 0, h: 0,
  phase: 'idle',       // idle | wenk_wind | wenk_strike | bear_roar | bear_strike | recoil
  phaseT: 0,
  nextAction: 1.2,     // seconds until phase advances
  whoStrikes: 'wenk',  // alternates
  impactWord: '',
  impactT: 0,
  stars: [],
  shake: 0,
  treePositions: []
};

function randItem(arr) { return arr[(Math.random() * arr.length) | 0]; }

function initWenkbear() {
  wbState.w = state.COLS;
  wbState.h = state.ROWS;
  wbState.phase = 'idle';
  wbState.phaseT = 0;
  wbState.nextAction = 1.0 + Math.random() * 0.8;
  wbState.whoStrikes = Math.random() < 0.5 ? 'wenk' : 'bear';
  wbState.impactWord = '';
  wbState.impactT = 0;
  wbState.shake = 0;

  // sparse starfield
  wbState.stars = [];
  for (var i = 0; i < 60; i++) {
    wbState.stars.push({
      x: Math.random() * wbState.w,
      y: Math.random() * (wbState.h * 0.45),
      blink: Math.random() * Math.PI * 2
    });
  }

  // fixed tree positions — half trees, half shrubs
  wbState.treePositions = [];
  var W = wbState.w;
  var count = Math.max(4, (W / 22) | 0);
  for (var j = 0; j < count; j++) {
    wbState.treePositions.push({
      x: ((j / count) * W + (Math.random() - 0.5) * 6) | 0,
      type: Math.random() < 0.55 ? 'tree' : 'shrub'
    });
  }
}

function drawSprite(sprite, x, y, hue, sat, light, shakeX) {
  var W = wbState.w, H = wbState.h;
  for (var r = 0; r < sprite.length; r++) {
    var row = sprite[r];
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === ' ') continue;
      var gx = x + c + shakeX;
      var gy = y + r;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      drawCharHSL(ch, gx, gy, hue, sat, light);
    }
  }
}

function drawNameTag(name, cx, y, hue) {
  var W = wbState.w;
  var start = cx - ((name.length / 2) | 0);
  for (var i = 0; i < name.length; i++) {
    var gx = start + i;
    if (gx < 0 || gx >= W) continue;
    drawCharHSL(name[i], gx, y, hue, 85, 68);
  }
}

function drawImpactText(word, cx, cy, t) {
  var W = wbState.w, H = wbState.h;
  if (!word) return;
  var strobe = (Math.sin(t * 40) + 1) * 0.5;
  var hue = (strobe * 60 + 20) | 0;      // amber → red strobe
  var light = 55 + (strobe * 35) | 0;
  var start = cx - ((word.length / 2) | 0);
  // rattle horizontally
  var wobble = ((Math.sin(t * 25) * 1.5) | 0);
  for (var i = 0; i < word.length; i++) {
    var gx = start + i + wobble;
    if (gx < 0 || gx >= W || cy < 0 || cy >= H) continue;
    drawCharHSL(word[i], gx, cy, hue, 95, light);
    // starburst lines on either side of the word
    if (i === 0) drawCharHSL('*', gx - 2, cy, 50, 90, 80);
    if (i === word.length - 1) drawCharHSL('*', gx + 2, cy, 50, 90, 80);
  }
}

function advancePhase(dt) {
  wbState.phaseT += dt;
  if (wbState.phaseT < wbState.nextAction) return;
  wbState.phaseT = 0;

  switch (wbState.phase) {
    case 'idle':
      wbState.phase = wbState.whoStrikes === 'wenk' ? 'wenk_wind' : 'bear_roar';
      wbState.nextAction = 0.45;
      break;
    case 'wenk_wind':
      wbState.phase = 'wenk_strike';
      wbState.nextAction = 0.25;
      break;
    case 'wenk_strike':
      wbState.phase = 'recoil';
      wbState.nextAction = 0.55;
      wbState.impactWord = randItem(IMPACT_WORDS);
      wbState.impactT = 0;
      wbState.shake = 1.0;
      wbState.whoStrikes = 'bear';
      break;
    case 'bear_roar':
      wbState.phase = 'bear_strike';
      wbState.nextAction = 0.3;
      break;
    case 'bear_strike':
      wbState.phase = 'recoil';
      wbState.nextAction = 0.55;
      wbState.impactWord = randItem(IMPACT_WORDS);
      wbState.impactT = 0;
      wbState.shake = 1.2;
      wbState.whoStrikes = 'wenk';
      break;
    case 'recoil':
      wbState.phase = 'idle';
      wbState.nextAction = 0.6 + Math.random() * 0.6;
      wbState.impactWord = '';
      break;
  }
}

function renderWenkbear() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (wbState.w !== W || wbState.h !== H) initWenkbear();
  var t = state.time;
  var dt = 1 / 60;

  // Tap forces an impact
  if (pointer.clicked && state.currentMode === 'wenkbear') {
    pointer.clicked = false;
    wbState.phase = 'recoil';
    wbState.impactWord = randItem(IMPACT_WORDS);
    wbState.impactT = 0;
    wbState.shake = 1.5;
    wbState.phaseT = 0;
    wbState.nextAction = 0.5;
  }

  advancePhase(dt);

  // Decaying shake (camera rattle)
  wbState.shake *= 0.88;
  var shake = wbState.shake > 0.05
    ? (Math.sin(t * 60) * wbState.shake * 1.3) | 0
    : 0;

  // ── Sky + stars
  for (var i = 0; i < wbState.stars.length; i++) {
    var s = wbState.stars[i];
    var b = Math.sin(t * 1.5 + s.blink);
    if (b < -0.2) continue;   // "off" — blink
    var ix = (s.x + shake * 0.3) | 0;
    var iy = s.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var starCh = b > 0.5 ? '*' : '.';
    var light = 40 + (b * 35) | 0;
    drawCharHSL(starCh, ix, iy, 220, 60, light);
  }

  // ── Moon
  var moonX = (W * 0.82) | 0, moonY = (H * 0.18) | 0;
  var moonChars = ['(', ')'];
  for (var mc = 0; mc < 2; mc++) {
    drawCharHSL(moonChars[mc], moonX + mc, moonY, 55, 35, 78);
  }
  drawCharHSL('o', moonX - 1, moonY, 55, 25, 70);

  // ── Ground line + trees
  var groundY = (H * 0.88) | 0;
  var horizonY = groundY - 2;
  // Horizon silhouette trees
  for (var ti = 0; ti < wbState.treePositions.length; ti++) {
    var tp = wbState.treePositions[ti];
    var sprite = tp.type === 'tree' ? TREE : SHRUB;
    var sy = groundY - sprite.length + 1;
    var sx = tp.x - ((sprite[0].length / 2) | 0);
    // Trees rendered cold green, tall trees peek higher
    for (var sr = 0; sr < sprite.length; sr++) {
      var row = sprite[sr];
      for (var sc = 0; sc < row.length; sc++) {
        var ch = row[sc];
        if (ch === ' ') continue;
        var gx = sx + sc;
        var gy = sy + sr;
        if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
        if (gy >= groundY) continue; // trunk peeks above ground only
        var hue = ch === '|' ? 30 : 135;
        drawCharHSL(ch, gx, gy, hue, 50, 30);
      }
    }
  }

  // Grass line
  for (var gx2 = 0; gx2 < W; gx2++) {
    var grassCh = ((gx2 + (t * 3) | 0) % 3 === 0) ? 'w' : '_';
    drawCharHSL(grassCh, gx2, groundY, 110, 55, 32);
  }

  // ── Fighter positions (standing on grass)
  // Wenk on left, bear on right — bear is bigger so push center
  var wenkW = WENK_IDLE[0].length;
  var bearW = BEAR_IDLE[0].length;
  var wenkH = WENK_IDLE.length;
  var bearH = BEAR_IDLE.length;

  // Base X positions scale with canvas width
  var wenkX = (W * 0.18) | 0;
  var bearX = (W * 0.82 - bearW) | 0;
  // Feet aligned to groundY - 1 (so sprite bottom row sits one above grass)
  var wenkY = groundY - wenkH;
  var bearY = groundY - bearH;

  // ── Advance/recoil offset per phase
  var wenkSprite = WENK_IDLE;
  var bearSprite = BEAR_IDLE;
  var wenkDx = 0, bearDx = 0;

  switch (wbState.phase) {
    case 'idle':
      // gentle bob
      break;
    case 'wenk_wind':
      wenkSprite = WENK_WIND;
      wenkDx = -1;
      break;
    case 'wenk_strike':
      wenkSprite = WENK_PUNCH;
      wenkDx = 3;
      break;
    case 'bear_roar':
      bearSprite = BEAR_GROWL;
      bearDx = 1;
      break;
    case 'bear_strike':
      bearSprite = BEAR_SWIPE;
      bearDx = -3;
      break;
    case 'recoil':
      if (wbState.whoStrikes === 'bear') {
        // wenk was just hit (whoStrikes got flipped after strike)
        wenkSprite = WENK_HIT;
        wenkDx = -2;
      } else {
        bearSprite = BEAR_HIT;
        bearDx = 2;
      }
      break;
  }

  // Gentle idle bob — tiny vertical offset
  var bob = wbState.phase === 'idle' ? ((Math.sin(t * 3) > 0) ? 0 : -1) : 0;

  // Draw wenk (warm pink/magenta)
  drawSprite(wenkSprite, wenkX + wenkDx, wenkY + bob, 320, 70, 62, shake);
  // Draw bear (brown)
  drawSprite(bearSprite, bearX + bearDx, bearY, 22, 70, 48, -shake);

  // Name tags
  drawNameTag('WENK', wenkX + 2, wenkY - 1, 320);
  drawNameTag('BEAR', bearX + 5, bearY - 1, 22);

  // ── Impact word in the center between them
  if (wbState.impactWord) {
    wbState.impactT += dt;
    if (wbState.impactT < 0.5) {
      var midX = ((wenkX + wenkW + bearX) / 2) | 0;
      var midY = ((wenkY + bearY) / 2 + 1) | 0;
      drawImpactText(wbState.impactWord, midX, midY, t);
    }
  }

  // ── Title banner at top — short, non-pulsing
  var title = 'WENK  vs  BEAR';
  var tx = ((W - title.length) / 2) | 0;
  for (var ci = 0; ci < title.length; ci++) {
    var ch = title[ci];
    if (ch === ' ') continue;
    var hue = (t * 40 + ci * 18) % 360;
    drawCharHSL(ch, tx + ci, 1, hue | 0, 90, 65);
  }
}

registerMode('wenkbear', {
  init: initWenkbear,
  render: renderWenkbear,
});
