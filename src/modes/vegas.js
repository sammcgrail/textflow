// vegas — the "Welcome to Fabulous Las Vegas Nevada" sign.
// Starburst topper w/ big star + chase-light border + neon text banners.
// Diamond-shape lightbulbs blinking around the edge like the real sign.
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// 5x7 bitmap font — uppercase letters needed for the sign copy
var VFONT = {
  'A': ['  #  ',' # # ','#   #','#####','#   #','#   #','#   #'],
  'B': ['#### ','#   #','#   #','#### ','#   #','#   #','#### '],
  'C': [' ####','#    ','#    ','#    ','#    ','#    ',' ####'],
  'D': ['#### ','#   #','#   #','#   #','#   #','#   #','#### '],
  'E': ['#####','#    ','#    ','#### ','#    ','#    ','#####'],
  'F': ['#####','#    ','#    ','#### ','#    ','#    ','#    '],
  'G': [' ####','#    ','#    ','#  ##','#   #','#   #',' ####'],
  'H': ['#   #','#   #','#   #','#####','#   #','#   #','#   #'],
  'I': [' ### ','  #  ','  #  ','  #  ','  #  ','  #  ',' ### '],
  'L': ['#    ','#    ','#    ','#    ','#    ','#    ','#####'],
  'M': ['#   #','## ##','# # #','# # #','#   #','#   #','#   #'],
  'N': ['#   #','##  #','# # #','# # #','# # #','#  ##','#   #'],
  'O': [' ### ','#   #','#   #','#   #','#   #','#   #',' ### '],
  'R': ['#### ','#   #','#   #','#### ','# #  ','#  # ','#   #'],
  'S': [' ####','#    ','#    ',' ### ','    #','    #','#### '],
  'T': ['#####','  #  ','  #  ','  #  ','  #  ','  #  ','  #  '],
  'U': ['#   #','#   #','#   #','#   #','#   #','#   #',' ### '],
  'V': ['#   #','#   #','#   #','#   #','#   #',' # # ','  #  '],
  'W': ['#   #','#   #','#   #','# # #','# # #','## ##','#   #'],
  'Y': ['#   #','#   #',' # # ','  #  ','  #  ','  #  ','  #  '],
  ' ': ['     ','     ','     ','     ','     ','     ','     ']
};

var GW = 5, GH = 7, LGAP = 1;

// 3x5 smaller font for lowercase-ish tagline "TO FABULOUS"
var SFONT = {
  'A': [' # ','# #','###','# #','# #'],
  'B': ['## ','# #','## ','# #','## '],
  'F': ['###','#  ','## ','#  ','#  '],
  'L': ['#  ','#  ','#  ','#  ','###'],
  'O': [' # ','# #','# #','# #',' # '],
  'S': [' ##','#  ',' # ','  #','## '],
  'T': ['###',' # ',' # ',' # ',' # '],
  'U': ['# #','# #','# #','# #',' # '],
  ' ': ['   ','   ','   ','   ','   ']
};
var SW = 3, SH = 5, SGAP = 1;

var vState = { w: 0, h: 0, borderPhase: 0 };

function initVegas() {
  vState.w = state.COLS;
  vState.h = state.ROWS;
  vState.borderPhase = 0;
}

function drawStringBig(text, centerY, t, hueBase) {
  var W = vState.w;
  var cellsPerLetter = GW + LGAP;
  var lineW = text.length * cellsPerLetter - LGAP;
  if (lineW > W - 2) {
    // fallback: single-char line
    var fx = ((W - text.length) / 2) | 0;
    for (var c = 0; c < text.length; c++) {
      var hue = (hueBase + c * 15) % 360;
      drawCharHSL(text[c], fx + c, centerY, hue | 0, 95, 70);
    }
    return;
  }
  var startX = ((W - lineW) / 2) | 0;
  for (var ci = 0; ci < text.length; ci++) {
    var glyph = VFONT[text[ci]] || VFONT[' '];
    var letterX = startX + ci * cellsPerLetter;
    var hue = (hueBase + ci * 10) % 360;
    var pulse = 0.85 + 0.15 * Math.sin(t * 4 + ci * 0.25);
    for (var ry = 0; ry < GH; ry++) {
      var row = glyph[ry];
      for (var rx = 0; rx < GW; rx++) {
        if (row[rx] !== '#') continue;
        var gx = letterX + rx;
        var gy = centerY + ry - (GH >> 1);
        if (gx < 0 || gx >= W || gy < 0 || gy >= vState.h) continue;
        drawCharHSL('#', gx, gy, hue | 0, 95, (48 + 32 * pulse) | 0);
      }
    }
  }
}

function drawStringSmall(text, centerY, t, hueBase) {
  var W = vState.w;
  var cellsPerLetter = SW + SGAP;
  var lineW = text.length * cellsPerLetter - SGAP;
  if (lineW > W - 2) return;
  var startX = ((W - lineW) / 2) | 0;
  for (var ci = 0; ci < text.length; ci++) {
    var glyph = SFONT[text[ci]] || SFONT[' '];
    var letterX = startX + ci * cellsPerLetter;
    var hue = (hueBase + ci * 8) % 360;
    var pulse = 0.9 + 0.1 * Math.sin(t * 5 + ci * 0.3);
    for (var ry = 0; ry < SH; ry++) {
      var row = glyph[ry];
      for (var rx = 0; rx < SW; rx++) {
        if (row[rx] !== '#') continue;
        var gx = letterX + rx;
        var gy = centerY + ry - (SH >> 1);
        if (gx < 0 || gx >= W || gy < 0 || gy >= vState.h) continue;
        drawCharHSL('#', gx, gy, hue | 0, 95, (55 + 25 * pulse) | 0);
      }
    }
  }
}

function drawStarTop(t) {
  var W = vState.w, H = vState.h;
  // 9-row starburst at the top — radiating lines from a central point
  var cx = W >> 1;
  var cy = 3;
  var star = [
    '    *    ',
    '  \\ | /  ',
    '   \\|/   ',
    '* --+-- *',
    '   /|\\   ',
    '  / | \\  ',
    '    *    '
  ];
  for (var r = 0; r < star.length; r++) {
    var row = star[r];
    for (var c = 0; c < row.length; c++) {
      var ch = row[c];
      if (ch === ' ') continue;
      var gx = cx + c - ((row.length / 2) | 0);
      var gy = cy + r;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      // flashing bulb hue cycles
      var hue = (t * 120 + (gx + gy) * 20) % 360;
      var sparkle = Math.sin(t * 10 + (gx + gy) * 0.9);
      var light = ch === '*' ? (55 + sparkle * 25) : (45 + sparkle * 20);
      drawCharHSL(ch === '+' ? '*' : ch, gx, gy, hue | 0, 90, light | 0);
    }
  }
}

function drawDiamondLightBorder(t) {
  var W = vState.w, H = vState.h;
  // Diamond-ish outline around the whole sign area (inset 1 cell).
  var top = 11, bot = H - 3;
  if (bot <= top) return;
  var left = 4, right = W - 5;
  if (right <= left + 8) return;

  // Chase: light every other cell, advancing with time
  var phase = (t * 10) | 0;
  // Top + bottom horizontals
  for (var x = left; x <= right; x++) {
    for (var who = 0; who < 2; who++) {
      var y = who === 0 ? top : bot;
      var on = ((x + phase) & 1) === 0;
      if (!on) continue;
      var hue = (t * 180 + x * 12) % 360;
      var ch = on ? 'o' : '.';
      drawCharHSL(ch, x, y, hue | 0, 90, 65);
    }
  }
  // Left + right verticals
  for (var yy = top + 1; yy < bot; yy++) {
    for (var who2 = 0; who2 < 2; who2++) {
      var xx = who2 === 0 ? left : right;
      var on2 = ((yy + phase) & 1) === 0;
      if (!on2) continue;
      var hue2 = (t * 180 + yy * 12) % 360;
      drawCharHSL('o', xx, yy, hue2 | 0, 90, 65);
    }
  }
}

function drawPoleLegs() {
  var W = vState.w, H = vState.h;
  // Two wooden sign poles reaching from bottom of sign to bottom of screen
  var leftPoleX = ((W * 0.32) | 0);
  var rightPoleX = ((W * 0.68) | 0);
  var startY = H - 2;
  var endY = H - 1;
  for (var y = startY; y <= endY; y++) {
    if (leftPoleX >= 0 && leftPoleX < W) drawCharHSL('|', leftPoleX, y, 28, 55, 45);
    if (rightPoleX >= 0 && rightPoleX < W) drawCharHSL('|', rightPoleX, y, 28, 55, 45);
  }
}

function drawConfettiCoinBurst(t) {
  var W = vState.w, H = vState.h;
  // Little $ and * sparks drifting around the sign (casino vibes)
  var count = 30;
  for (var i = 0; i < count; i++) {
    // seed-based pseudo-positions, drift with time
    var phase = (t * 0.3 + i * 1.37);
    var px = ((Math.sin(phase + i) * 0.45 + 0.5) * W) | 0;
    var py = (((Math.cos(phase * 1.3 + i * 0.7) * 0.35 + 0.5) * H)) | 0;
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    // Don't cover the sign body (rough mask: rows 11..H-3 and middle cols)
    if (py > 11 && py < H - 3 && px > 6 && px < W - 6) continue;
    var ch = (i & 3) === 0 ? '$' : ((i & 3) === 1 ? '*' : ((i & 3) === 2 ? '.' : '+'));
    var hue = (t * 80 + i * 37) % 360;
    var blink = Math.sin(t * 6 + i * 1.1);
    if (blink < -0.3) continue;
    drawCharHSL(ch, px, py, hue | 0, 90, (40 + blink * 25) | 0);
  }
}

function renderVegas() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (vState.w !== W || vState.h !== H) initVegas();
  var t = state.time;

  // Black night sky background (clear already does this)

  // Starburst at top
  drawStarTop(t);

  // Diamond light-bulb border
  drawDiamondLightBorder(t);

  // Text banners: WELCOME / TO FABULOUS / LAS VEGAS / NEVADA
  // Stack inside border. Border top=11, bot=H-3. Glyphs are 7-row (big)
  // and 5-row (small). Use 2-row visual gaps between lines.
  var line1Y, line2Y, line3Y, line4Y, showSmall = true;
  if (H >= 48) {
    // Comfortable spacing: 2-row gaps, last glyph row 43 vs bot H-3
    line1Y = 16; line2Y = 24; line3Y = 32; line4Y = 40;
  } else if (H >= 44) {
    // Tighter: 1-row gaps
    line1Y = 15; line2Y = 22; line3Y = 29; line4Y = 36;
  } else {
    // Very tight: drop small tagline, keep 3 big lines only
    showSmall = false;
    line1Y = 15; line2Y = -1; line3Y = 23; line4Y = 31;
  }
  drawStringBig('WELCOME', line1Y, t, (t * 30) % 360);
  if (showSmall) drawStringSmall('TO FABULOUS', line2Y, t, 45); // amber tagline
  drawStringBig('LAS VEGAS', line3Y, t, (t * 45 + 120) % 360);
  drawStringBig('NEVADA', line4Y, t, (t * 30 + 240) % 360);

  // Sign poles
  drawPoleLegs();

  // Confetti $ coins drifting
  drawConfettiCoinBurst(t);
}

registerMode('vegas', {
  init: initVegas,
  render: renderVegas,
});
