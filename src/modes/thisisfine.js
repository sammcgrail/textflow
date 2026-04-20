// thisisfine — the "This Is Fine" meme in ASCII.
// Layers (back-to-front): room walls + floor, animated fire, dog+table+mug, speech bubble.
// The dog sits calmly at center-right while the room burns. Contrast is the joke.

import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Fire layer — cellular-automata style heat buffer (same family
// as the stock fire mode, simplified + tinted for the lower 2/3).
// ============================================================
var fineFire;     // Float32 heat buffer, [W * (H+2)]
var fineFireW = 0, fineFireH = 0;

// Fire color ramp — 16 stops from cold ember up to white-hot.
var FINE_FIRE_COLORS = [
  [18, 4, 0],     [40, 8, 0],     [80, 15, 2],    [130, 25, 5],
  [180, 40, 5],   [210, 65, 10],  [235, 95, 15],  [250, 130, 25],
  [255, 160, 35], [255, 185, 55], [255, 210, 80], [255, 230, 120],
  [255, 245, 170],[255, 250, 210],[255, 253, 235],[255, 255, 250]
];

// Flame chars — ordered roughly by visual density. Early chars render low/sparse embers,
// later chars are tall licking flames at the tips.
var FINE_FIRE_CHARS = [' ', '.', "'", '`', '.', ',', ':', '^', 'v', '*', '\\', '/', '|', 'x', '#', '@'];

function initFineFire() {
  fineFireW = state.COLS;
  fineFireH = state.ROWS + 2;
  fineFire = new Float32Array(fineFireW * fineFireH);
}

// ============================================================
// Scene layout — all positions are grid cells.
// Dog is anchored bottom-right of its bounding box, table below it.
// We compute anchors each frame because COLS/ROWS can change on resize.
// ============================================================
function sceneLayout() {
  var W = state.COLS, H = state.ROWS;
  // Fire occupies lower 2/3; floor line sits right at that boundary.
  var floorY = Math.round(H * 0.62);
  // Dog anchored to right of center — center-right as spec'd.
  var dogCX = Math.round(W * 0.58);
  // Dog's head baseline sits ~8 rows above floor (table at floor-3, dog above table).
  var dogHeadY = floorY - 10;
  return {
    W: W, H: H,
    floorY: floorY,
    dogCX: dogCX,
    dogHeadY: dogHeadY,
  };
}

// ============================================================
// Dog / table / mug sprite — stored as lines of chars. Chars that
// are ' ' are transparent; everything else is drawn over the fire.
// Pose: porkpie hat, small eyes, cheeky smile, one paw on a mug.
// Coordinates are relative to (dogCX, dogHeadY) — (0,0) is the center-top
// of the hat.
// Each entry: [x_offset, y_offset, char]
// ============================================================

// -- Hat (porkpie), drawn above the head ---------------------
var HAT = [
  [-3, -2, '_'], [-2, -2, '_'], [-1, -2, '_'], [ 0, -2, '_'], [ 1, -2, '_'], [ 2, -2, '_'],
  [-4, -1, '/'], [ 3, -1, '\\'],
  [-5,  0, '_'], [-4,  0, '_'], [-3,  0, '_'], [-2,  0, '_'], [-1,  0, '_'], [ 0,  0, '_'], [ 1,  0, '_'], [ 2,  0, '_'], [ 3,  0, '_'], [ 4,  0, '_'],
];

// -- Head (two states: eyes-open default, eyes-closed on blink) --
// Head silhouette baseline row is y=1..4
var HEAD_OPEN = [
  [-4,  1, '/'],                                                                  [ 3,  1, '\\'],
  [-4,  2, '|'], [-3, 2, ' '], [-2, 2, '.'], [-1, 2, ' '], [0, 2, '.'], [1, 2, ' '], [2, 2, ' '], [3, 2, '|'],
  [-4,  3, '|'], [-3, 3, ' '], [-2, 3, ' '], [-1, 3, ' '], [0, 3, ' '], [1, 3, 'o'], [2, 3, ' '], [3, 3, '|'],
  [-4,  4, '\\'],[-3, 4, '_'], [-2, 4, '_'], [-1, 4, '_'], [0, 4, '_'], [1, 4, '_'], [2, 4, '_'], [3, 4, '/'],
];

var HEAD_CLOSED = [
  [-4,  1, '/'],                                                                  [ 3,  1, '\\'],
  [-4,  2, '|'], [-3, 2, ' '], [-2, 2, '-'], [-1, 2, ' '], [0, 2, '-'], [1, 2, ' '], [2, 2, ' '], [3, 2, '|'],
  [-4,  3, '|'], [-3, 3, ' '], [-2, 3, ' '], [-1, 3, ' '], [0, 3, ' '], [1, 3, '_'], [2, 3, ' '], [3, 3, '|'],
  [-4,  4, '\\'],[-3, 4, '_'], [-2, 4, '_'], [-1, 4, '_'], [0, 4, '_'], [1, 4, '_'], [2, 4, '_'], [3, 4, '/'],
];

// Ears (little triangles on top of head, outside the hat)
var EARS = [
  [-5,  0, '/'],
  [ 4,  0, '\\'],
];

// Body (neck + torso + paw on mug). Torso starts at y=5.
var BODY = [
  [-3,  5, '('], [-2, 5, ' '], [-1, 5, ' '], [0, 5, ' '], [1, 5, ' '], [2, 5, ')'],
  [-4,  6, '('],                                                                  [ 3, 6, ')'],
  [-4,  7, '|'],                                                                  [ 3, 7, '|'],
  [-4,  8, '\\'], [-3, 8, '_'], [-2, 8, '_'], [-1, 8, '_'], [0, 8, '_'], [1, 8, '_'], [2, 8, '_'], [3, 8, '/'],
];

// Arm/paw reaching down-right toward the mug. Paw is the little `~` curl.
var PAW = [
  [ 3,  6, ')'],
  [ 4,  7, '\\'],
  [ 5,  8, '~'],
];

// Mug sits on the table, to the right of the dog.
var MUG = [
  [ 5,  7, '.'], [ 6, 7, '_'], [ 7, 7, '.'],
  [ 5,  8, '|'], [ 6, 8, 'U'], [ 7, 8, '|'], [ 8, 8, ')'],
  [ 5,  9, '\\'],[ 6, 9, '_'], [ 7, 9, '/'],
];

// Table — a long horizontal strip at floorY-2, floorY-1 under dog+mug.
// We draw this procedurally (variable width), not as a sprite.
function drawTable(layout, r, g, b) {
  var yTop = layout.floorY - 1;
  var x0 = layout.dogCX - 8;
  var x1 = layout.dogCX + 10;
  if (x0 < 0) x0 = 0;
  if (x1 >= layout.W) x1 = layout.W - 1;
  // Table top
  for (var x = x0; x <= x1; x++) {
    drawChar('_', x, yTop, r, g, b, 0.85);
  }
  // Table legs (two verticals)
  var legL = x0 + 2;
  var legR = x1 - 2;
  for (var y = yTop + 1; y < layout.floorY; y++) {
    drawChar('|', legL, y, r, g, b, 0.75);
    drawChar('|', legR, y, r, g, b, 0.75);
  }
}

// ============================================================
// Draw a sprite-list anchored at (cx, cy). Skip transparent cells.
// ============================================================
function drawSprite(sprite, cx, cy, r, g, b, a) {
  for (var i = 0; i < sprite.length; i++) {
    var cell = sprite[i];
    var ch = cell[2];
    if (ch === ' ') continue;
    var x = cx + cell[0];
    var y = cy + cell[1];
    if (x < 0 || x >= state.COLS || y < 0 || y >= state.ROWS) continue;
    drawChar(ch, x, y, r, g, b, a);
  }
}

// ============================================================
// Coffee steam — 3 wisps of `~ ( ) . '` rising above the mug.
// Animated by state.time so it drifts left-right as it rises.
// ============================================================
function drawSteam(layout) {
  var t = state.time;
  var mugTopX = layout.dogCX + 6;      // center of mug in grid
  var mugTopY = layout.floorY - 3;     // just above mug rim
  var steamChars = ['.', "'", '(', ')', '~'];
  // Three staggered wisps at different phases
  for (var w = 0; w < 3; w++) {
    var phase = t * 1.2 + w * 1.7;
    for (var s = 0; s < 5; s++) {
      var rise = s + (phase % 1);
      // Wavy horizontal offset: wider at top
      var wobble = Math.sin(phase + rise * 0.9 + w) * (0.6 + rise * 0.3);
      var sx = Math.round(mugTopX + wobble);
      var sy = Math.round(mugTopY - rise);
      if (sy < 0 || sy >= state.ROWS) continue;
      if (sx < 0 || sx >= state.COLS) continue;
      var ci = (s + w) % steamChars.length;
      // Fade out as it rises
      var alpha = Math.max(0, 0.55 - rise * 0.1);
      drawChar(steamChars[ci], sx, sy, 210, 210, 220, alpha);
    }
  }
}

// ============================================================
// Speech bubble — fades in over first 3s, then gentle pulse.
// Shape:
//    _______________
//   ( This is fine. )
//    ---------------
//          \
//           \
// Anchored to upper-left of the dog's head.
// ============================================================
var TEXT = 'This is fine.';

function drawBubble(layout) {
  var t = state.time;
  // Fade in over 3s
  var fadeIn = Math.min(1, t / 3);
  // Gentle 0.08 breathing pulse after fade-in
  var pulse = fadeIn * (0.92 + 0.08 * Math.sin(t * 1.8));
  if (fadeIn <= 0.02) return;

  var inner = TEXT.length;                  // 13 chars
  var width = inner + 4;                    // borders + padding
  // Anchor upper-left corner of bubble (left of dog, higher than hat)
  var bx = layout.dogCX - 14;
  var by = layout.dogHeadY - 6;
  if (bx < 1) bx = 1;

  var r = 235, g = 235, b = 245;

  // Top border (underscores)
  for (var i = 1; i < width - 1; i++) {
    drawChar('_', bx + i, by, r, g, b, pulse);
  }
  // Body row: ( text  )
  drawChar('(', bx, by + 1, r, g, b, pulse);
  var textStartX = bx + 2;
  drawString(TEXT, textStartX * state.CHAR_W, state.NAV_H + (by + 1) * state.CHAR_H,
             r, g, b, pulse);
  drawChar(')', bx + width - 1, by + 1, r, g, b, pulse);

  // Bottom border (dashes)
  for (var j = 1; j < width - 1; j++) {
    drawChar('-', bx + j, by + 2, r, g, b, pulse * 0.85);
  }

  // Tail pointing toward the dog
  drawChar('\\', bx + width - 3, by + 3, r, g, b, pulse * 0.8);
  drawChar('\\', bx + width - 2, by + 4, r, g, b, pulse * 0.7);
}

// ============================================================
// Room: floor line, left/right wall hints. Dull brown.
// Drawn BEFORE the fire so flames overlap.
// ============================================================
function drawRoom(layout) {
  var W = layout.W, H = layout.H, floorY = layout.floorY;
  var wr = 120, wg = 95, wb = 70;       // dull brown
  var lr = 80, lg = 75, lb = 72;        // grey (back wall)

  // Back wall — a few horizontal board lines above the floor
  for (var y = 2; y < floorY; y += 4) {
    for (var x = 0; x < W; x += 8) {
      drawChar('-', x, y, lr, lg, lb, 0.18);
    }
  }

  // Floor line
  for (var x2 = 0; x2 < W; x2++) {
    drawChar('_', x2, floorY, wr, wg, wb, 0.7);
  }
  // Second floor row (floorboards texture)
  for (var x3 = 0; x3 < W; x3 += 3) {
    if (x3 + 1 < W) drawChar('.', x3, floorY + 1, wr, wg, wb, 0.35);
  }

  // Wall corners — tiny vertical hints at left + right edges
  for (var y2 = 2; y2 < floorY; y2++) {
    if ((y2 % 3) === 0) {
      drawChar('|', 0, y2, lr, lg, lb, 0.25);
      drawChar('|', W - 1, y2, lr, lg, lb, 0.25);
    }
  }
}

// ============================================================
// Fire simulation step + render. Restricted to the lower 2/3.
// We seed a hot row at the bottom and propagate upward each frame.
// ============================================================
function stepFire() {
  var W = fineFireW, H = fineFireH;

  // Seed bottom row — random hot embers
  for (var x = 0; x < W; x++) {
    fineFire[(H - 1) * W + x] = Math.random() > 0.35 ? 0.85 + Math.random() * 0.15 : 0.3 + Math.random() * 0.3;
  }

  // Propagate upward (classic 3-neighbour average + decay)
  for (var y = 0; y < H - 1; y++) {
    for (var xx = 0; xx < W; xx++) {
      var y1 = y + 1;
      var y2 = Math.min(H - 1, y + 2);
      var xl = xx > 0 ? xx - 1 : 0;
      var xr = xx < W - 1 ? xx + 1 : W - 1;
      var v = (fineFire[y1 * W + xx] + fineFire[y1 * W + xl] + fineFire[y1 * W + xr] + fineFire[y2 * W + xx]) * 0.25;
      // Decay: calibrated so flames reach roughly the floor line naturally.
      v = v * (0.965 - Math.random() * 0.025) - 0.006;
      fineFire[y * W + xx] = v > 0 ? v : 0;
    }
  }
}

function renderFire(layout) {
  var W = fineFireW;
  // Only draw cells in the lower 2/3 — above floorY - 10 we fade out rapidly
  // so the top of the screen stays mostly clear for the bubble.
  var topLimit = Math.max(0, layout.floorY - 18);

  for (var y = topLimit; y < state.ROWS; y++) {
    for (var x = 0; x < W; x++) {
      var v = fineFire[y * W + x];
      if (v < 0.08) continue;
      // Fade intensity near the top boundary so flames taper.
      var fadeTop = 1;
      if (y < layout.floorY - 14) {
        fadeTop = (y - topLimit) / Math.max(1, (layout.floorY - 14 - topLimit));
        if (fadeTop < 0) fadeTop = 0;
      }
      var intensity = v * fadeTop;
      if (intensity < 0.08) continue;

      var ci = Math.min(FINE_FIRE_COLORS.length - 1, (intensity * FINE_FIRE_COLORS.length) | 0);
      var col = FINE_FIRE_COLORS[ci];
      var ri = Math.min(FINE_FIRE_CHARS.length - 1, (intensity * FINE_FIRE_CHARS.length) | 0);
      drawChar(FINE_FIRE_CHARS[ri], x, y, col[0], col[1], col[2], 0.35 + intensity * 0.65);
    }
  }
}

// ============================================================
// Blink state — close eyes every ~3-5s, for ~2 frames.
// Uses state.time + a simple hash-style jitter per blink window.
// ============================================================
function isBlinking() {
  var t = state.time;
  // Cycle length: 4s nominal, jittered by sin
  var cycle = 4 + Math.sin(t * 0.37) * 1.2;
  var phase = t % cycle;
  // Closed for the first ~0.12s of each cycle
  return phase < 0.12;
}

// ============================================================
// Main render — composite all layers.
// ============================================================
function renderThisIsFine() {
  clearCanvas();

  // Reinit fire buffer on resize
  if (!fineFire || fineFireW !== state.COLS || fineFireH !== state.ROWS + 2) {
    initFineFire();
  }

  var layout = sceneLayout();

  // Layer 1: room
  drawRoom(layout);

  // Layer 2: fire (step + render)
  stepFire();
  renderFire(layout);

  // Layer 3: table (behind dog but on top of fire so mug sits on it)
  drawTable(layout, 130, 90, 55);

  // Layer 4: dog — hat, head, ears, body, paw, mug
  // Warm tan dog color
  var dogR = 215, dogG = 170, dogB = 115;
  // Hat: dark brown
  drawSprite(HAT, layout.dogCX, layout.dogHeadY, 70, 45, 30, 1.0);
  // Ears + head
  drawSprite(EARS, layout.dogCX, layout.dogHeadY, dogR, dogG, dogB, 1.0);
  var head = isBlinking() ? HEAD_CLOSED : HEAD_OPEN;
  drawSprite(head, layout.dogCX, layout.dogHeadY, dogR, dogG, dogB, 1.0);
  // Body + paw
  drawSprite(BODY, layout.dogCX, layout.dogHeadY, dogR, dogG, dogB, 1.0);
  drawSprite(PAW, layout.dogCX, layout.dogHeadY, dogR, dogG, dogB, 1.0);
  // Mug — white porcelain
  drawSprite(MUG, layout.dogCX, layout.dogHeadY, 235, 230, 225, 1.0);

  // Layer 5: steam
  drawSteam(layout);

  // Layer 6: speech bubble (on top of everything)
  drawBubble(layout);
}

registerMode('thisisfine', {
  init: initFineFire,
  render: renderThisIsFine,
});
