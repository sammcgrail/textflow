// bdaywenk — HAPPY BIRTHDAY MCWENKER mode.
// Confetti particles, pulsing 5x7 bitmap banner, edge-launched firework
// bursts, cake w/ candles at the bottom. Commissioned by Sam for
// mcwenker's birthday (2026-04-18).
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Minimal 5x7 bitmap font — only the glyphs we need for
// "HAPPY BIRTHDAY MCWENKER" plus exclamation. Each entry is 7 rows of
// 5-bit ascii (' ' or '#') packed as strings.
var BDFONT = {
  'A': ['  #  ',' # # ','#   #','#####','#   #','#   #','#   #'],
  'B': ['#### ','#   #','#   #','#### ','#   #','#   #','#### '],
  'C': [' ####','#    ','#    ','#    ','#    ','#    ',' ####'],
  'D': ['#### ','#   #','#   #','#   #','#   #','#   #','#### '],
  'E': ['#####','#    ','#    ','#### ','#    ','#    ','#####'],
  'H': ['#   #','#   #','#   #','#####','#   #','#   #','#   #'],
  'I': [' ### ','  #  ','  #  ','  #  ','  #  ','  #  ',' ### '],
  'K': ['#   #','#  # ','# #  ','##   ','# #  ','#  # ','#   #'],
  'M': ['#   #','## ##','# # #','# # #','#   #','#   #','#   #'],
  'N': ['#   #','##  #','# # #','# # #','# # #','#  ##','#   #'],
  'P': ['#### ','#   #','#   #','#### ','#    ','#    ','#    '],
  'R': ['#### ','#   #','#   #','#### ','# #  ','#  # ','#   #'],
  'T': ['#####','  #  ','  #  ','  #  ','  #  ','  #  ','  #  '],
  'W': ['#   #','#   #','#   #','# # #','# # #','## ##','#   #'],
  'Y': ['#   #','#   #',' # # ','  #  ','  #  ','  #  ','  #  '],
  ' ': ['     ','     ','     ','     ','     ','     ','     ']
};
// Height / width of glyphs in cells. +1 for inter-letter spacing.
var GLYPH_W = 5, GLYPH_H = 7, LETTER_GAP = 1;

// Two-line banner. The shader-height dance means we want both lines
// visible at ~24 rows vertical, so 2 × 7 + spacing = ~16 rows — fits.
var BANNER_LINE1 = 'HAPPY BIRTHDAY';
var BANNER_LINE2 = 'MCWENKER';

// Confetti + fireworks + candle flicker state.
var bdWenkConf, bdWenkRockets, bdWenkParticles, bdWenkW, bdWenkH;
var bdWenkTimer, bdWenkCandleT;

function bdSpawnConfetti(W, H, n) {
  for (var i = 0; i < n; i++) {
    bdWenkConf.push({
      x: Math.random() * W,
      y: -Math.random() * 8,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      spin: (Math.random() - 0.5) * 6,
      rot: Math.random() * Math.PI * 2,
      hue: (Math.random() * 360) | 0,
      ch: '*+xo'[((Math.random() * 4) | 0)],
      life: 1
    });
  }
}

function bdLaunchRocket(x, W, H) {
  var launchVy = -(H * 0.4 + Math.random() * H * 0.3);
  bdWenkRockets.push({
    x: x,
    y: H - 1,
    vx: (Math.random() - 0.5) * 2.5,
    vy: launchVy,
    targetY: H * (0.15 + Math.random() * 0.2),
    hue: (Math.random() * 360) | 0
  });
}

function bdExplode(r) {
  var count = state.isMobile ? 28 : 48;
  var spread = Math.min(bdWenkW, bdWenkH) * 0.14;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = spread * (0.25 + Math.random() * 0.8);
    bdWenkParticles.push({
      x: r.x, y: r.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.012 + Math.random() * 0.02,
      hue: r.hue + (Math.random() - 0.5) * 40
    });
  }
}

function initBdaywenk() {
  bdWenkW = state.COLS;
  bdWenkH = state.ROWS;
  bdWenkConf = [];
  bdWenkRockets = [];
  bdWenkParticles = [];
  bdWenkTimer = 0;
  bdWenkCandleT = 0;
  // initial burst of confetti so it doesn't look empty on load
  bdSpawnConfetti(bdWenkW, bdWenkH, 60);
  // 2 pre-exploded fireworks so stars are already in the air
  for (var i = 0; i < 2; i++) {
    bdExplode({
      x: bdWenkW * 0.25 + Math.random() * bdWenkW * 0.5,
      y: bdWenkH * 0.2 + Math.random() * bdWenkH * 0.25,
      hue: (Math.random() * 360) | 0
    });
  }
}

function renderBannerLine(text, centerY, t, hueBase) {
  var W = bdWenkW;
  var cellsPerLetter = GLYPH_W + LETTER_GAP;
  var lineCellWidth = text.length * cellsPerLetter - LETTER_GAP;
  // Auto-shrink for narrow screens: if we don't fit at 1:1, skip glyphs
  // on their chars and fall back to inline text.
  if (lineCellWidth > W - 2) {
    // Small-screen fallback — render the line as plain chars.
    var fx = ((W - text.length) / 2) | 0;
    for (var c = 0; c < text.length; c++) {
      var hue = (hueBase + c * 12) % 360;
      var pulse = 0.85 + 0.15 * Math.sin(t * 4 + c * 0.3);
      drawCharHSL(text[c], fx + c, centerY, hue, 85, (55 * pulse) | 0);
    }
    return;
  }

  var startX = ((W - lineCellWidth) / 2) | 0;
  for (var ci = 0; ci < text.length; ci++) {
    var ch = text[ci];
    var glyph = BDFONT[ch] || BDFONT[' '];
    var letterX = startX + ci * cellsPerLetter;
    // Per-letter rainbow hue + pulse
    var hue = (hueBase + ci * 18) % 360;
    var pulseAmt = 0.82 + 0.18 * Math.sin(t * 3 + ci * 0.35);
    for (var ry = 0; ry < GLYPH_H; ry++) {
      var row = glyph[ry];
      for (var rx = 0; rx < GLYPH_W; rx++) {
        if (row[rx] !== '#') continue;
        var gx = letterX + rx;
        var gy = centerY + ry - (GLYPH_H >> 1);
        if (gx < 0 || gx >= W || gy < 0 || gy >= bdWenkH) continue;
        // Inner glyph shade oscillates between block / star so it shimmers
        var shimmer = Math.sin(t * 6 + (gx + gy) * 0.4);
        var gch = shimmer > 0.4 ? '#' : (shimmer > -0.3 ? '%' : '@');
        var light = (40 + 32 * pulseAmt) | 0;
        drawCharHSL(gch, gx, gy, hue, 85, light);
      }
    }
  }
}

function drawCake(t) {
  var W = bdWenkW, H = bdWenkH;
  // Cake sits on the bottom 5 rows; skip if terminal is too short
  if (H < 22) return;
  var cakeW = 19; // total width of cake + candles
  var cx = ((W - cakeW) / 2) | 0;
  var cy = H - 5;
  var cakeRows = [
    '   i   i   i   i   ',  // candles
    '   |   |   |   |   ',
    '-------------------',  // top
    '|  *  *  *  *  *  |',  // frosting
    '|=================|'   // bottom
  ];
  for (var r = 0; r < cakeRows.length; r++) {
    var row = cakeRows[r];
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === ' ') continue;
      var gx = cx + c;
      var gy = cy + r;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      // candle flicker: 'i' chars glow warm, flicker amplitude
      if (ch === 'i') {
        var flicker = 0.6 + 0.4 * Math.sin(t * 18 + c * 1.7);
        var hue = 25 + Math.sin(t * 12 + c) * 15; // amber
        drawCharHSL('*', gx, gy, hue | 0, 90, (55 * flicker) | 0);
      } else if (ch === '|') {
        // candle stem
        drawCharHSL('|', gx, gy, 340, 40, 75);
      } else if (ch === '*') {
        // frosting dot — rainbow
        var hue2 = ((t * 40) + c * 30) % 360;
        drawCharHSL('*', gx, gy, hue2 | 0, 80, 65);
      } else if (ch === '=') {
        drawCharHSL('=', gx, gy, 28, 60, 45);
      } else {
        drawCharHSL(ch, gx, gy, 300, 50, 65);
      }
    }
  }
}

function renderBdaywenk() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (bdWenkW !== W || bdWenkH !== H) initBdaywenk();
  var t = state.time;
  var dt = 1 / 60;

  // Confetti refill
  if (bdWenkConf.length < (state.isMobile ? 50 : 100)) {
    bdSpawnConfetti(W, H, 3);
  }

  // Rocket cadence — 1-2s between launches
  bdWenkTimer += dt;
  if (bdWenkTimer > 0.9 + Math.random() * 1.3) {
    bdLaunchRocket(W * 0.15 + Math.random() * W * 0.7, W, H);
    bdWenkTimer = 0;
  }

  // Pointer tap = launch rocket at pointer x
  if (pointer.clicked && state.currentMode === 'bdaywenk') {
    pointer.clicked = false;
    bdLaunchRocket(pointer.gx, W, H);
    // also spray extra confetti
    bdSpawnConfetti(W, H, 30);
  }

  // ── confetti render + physics
  for (var i = bdWenkConf.length - 1; i >= 0; i--) {
    var c = bdWenkConf[i];
    c.x += c.vx * dt * 6;
    c.y += c.vy * dt * 6;
    c.vy += 3 * dt; // gravity
    c.rot += c.spin * dt;
    // wind gust — slight sinusoidal x drift
    c.x += Math.sin(t * 0.7 + c.y * 0.15) * 0.15;
    if (c.y > H + 1 || c.x < -2 || c.x > W + 2) { bdWenkConf.splice(i, 1); continue; }
    var ix = c.x | 0, iy = c.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    // rotate char selection by rot so it "twirls"
    var phase = (c.rot + c.x * 0.2) % (Math.PI * 2);
    var spinCh = phase > 0.8 ? (phase > 2.0 ? 'o' : 'x') : (phase > -0.8 ? '*' : '+');
    drawCharHSL(spinCh, ix, iy, c.hue, 85, 58);
  }

  // ── firework rockets
  for (var i = bdWenkRockets.length - 1; i >= 0; i--) {
    var r = bdWenkRockets[i];
    r.x += r.vx * dt * 15;
    r.y += r.vy * dt * 15;
    r.vy += H * 0.15 * dt;
    if (r.y <= r.targetY || r.vy > 0) { bdExplode(r); bdWenkRockets.splice(i, 1); continue; }
    var rix = r.x | 0, riy = r.y | 0;
    if (rix >= 0 && rix < W && riy >= 0 && riy < H) {
      drawCharHSL('|', rix, riy, r.hue, 95, 70);
    }
  }

  // ── firework particles
  for (var i = bdWenkParticles.length - 1; i >= 0; i--) {
    var p = bdWenkParticles[i];
    p.x += p.vx * dt * 10;
    p.y += p.vy * dt * 10;
    p.vy += 6 * dt;
    p.vx *= 0.99;
    p.life -= p.decay;
    if (p.life <= 0) { bdWenkParticles.splice(i, 1); continue; }
    var pix = p.x | 0, piy = p.y | 0;
    if (pix < 0 || pix >= W || piy < 0 || piy >= H) continue;
    var pch = p.life > 0.7 ? '*' : (p.life > 0.35 ? '+' : '.');
    var light = (30 + 55 * p.life) | 0;
    drawCharHSL(pch, pix, piy, ((p.hue % 360) + 360) % 360, 90, light);
  }

  // ── banner — two lines pulsing, rainbow marquee
  var bannerY1 = Math.max(4, (H * 0.30) | 0);
  var bannerY2 = bannerY1 + GLYPH_H + 2;
  var hueBase1 = (t * 30) % 360;
  var hueBase2 = (t * 40 + 60) % 360;
  renderBannerLine(BANNER_LINE1, bannerY1, t, hueBase1);
  renderBannerLine(BANNER_LINE2, bannerY2, t, hueBase2);

  // ── cake
  drawCake(t);
}

registerMode('bdaywenk', {
  init: initBdaywenk,
  render: renderBdaywenk,
});
