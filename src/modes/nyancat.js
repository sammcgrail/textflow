import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Nyan Cat — pixel cat flying through space with rainbow trail
// ============================================================

// Cat sprite in a grid. Terminal cells are ~2x tall-to-wide,
// so we "stretch" by using 2 grid rows per sprite pixel row.
// Pop-tart body is a rectangle of pink/red, cat head sticks out
// front with grey + pink cheeks + whiskers + `=` mouth.

// Cat sprite rows (7 tall × 12 wide pixels). Each character:
//   . = transparent
//   p = pink body (hot pink)
//   r = red body dots
//   s = strawberry sprinkle (light pink)
//   K = black outline
//   G = grey cat fur
//   C = pink cheek
//   W = white (eye highlight)
//   E = black eye
// Row 0 is top.
var CAT_SPRITE = [
  '....KKKKKK..',
  '...KGGGGGGK.',
  '..KGEWGGEWGK',
  'KpppGGGCGCGK',
  'KpsppppGGGGK',
  'KpppsppppppK',
  '.KKKKKKKKKK.'
];

// Rainbow trail colors — classic nyan cat 6-band palette
var RAINBOW = [
  [255, 70, 70],    // red
  [255, 160, 50],   // orange
  [255, 240, 60],   // yellow
  [70, 230, 80],    // green
  [70, 140, 255],   // blue
  [200, 80, 255]    // purple
];

// Star field — three parallax layers (distant/mid/near)
var stars = [];
var NUM_DISTANT = 60;
var NUM_MID = 28;
var NUM_NEAR = 12;

// Cat state
var catY = 0;       // current smoothed grid Y (center of head)
var catTargetY = 0; // target Y (mouse or idle center)
var catBob = 0;     // local bobbing offset
var lastPointerActive = 0; // time of last pointer movement

function initNyanCat() {
  stars = [];
  // Distant stars — small, dim, slow
  for (var i = 0; i < NUM_DISTANT; i++) {
    stars.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      speed: 0.15 + Math.random() * 0.1,
      layer: 0,
      ch: Math.random() < 0.5 ? '.' : '\u00b7', // . or ·
      bright: 0.3 + Math.random() * 0.2,
      twinkle: Math.random() * Math.PI * 2
    });
  }
  // Mid stars — medium
  for (var j = 0; j < NUM_MID; j++) {
    stars.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      speed: 0.4 + Math.random() * 0.2,
      layer: 1,
      ch: Math.random() < 0.5 ? '+' : '*',
      bright: 0.55 + Math.random() * 0.2,
      twinkle: Math.random() * Math.PI * 2
    });
  }
  // Near stars — bright, fast
  for (var k = 0; k < NUM_NEAR; k++) {
    stars.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      speed: 0.85 + Math.random() * 0.3,
      layer: 2,
      ch: '*',
      bright: 0.85 + Math.random() * 0.15,
      twinkle: Math.random() * Math.PI * 2
    });
  }
  catY = state.ROWS / 2;
  catTargetY = state.ROWS / 2;
  catBob = 0;
  lastPointerActive = -999;
}

// ============================================================
// Render loop
// ============================================================
function renderNyanCat() {
  clearCanvas();

  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // ------- 1. Star field (bottom-most layer) -------
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    s.x -= s.speed;
    if (s.x < -1) {
      s.x = W + Math.random() * 4;
      s.y = Math.random() * H;
    }
    // Twinkle: vary brightness with time
    var tw = Math.sin(t * 2 + s.twinkle) * 0.2 + 0.8;
    var b = s.bright * tw;
    // Layer tints — distant = bluish, mid = white, near = warm white
    var r, g, bl;
    if (s.layer === 0) { r = 120; g = 140; bl = 180; }
    else if (s.layer === 1) { r = 200; g = 210; bl = 230; }
    else { r = 255; g = 250; bl = 220; }
    drawChar(s.ch, s.x | 0, s.y | 0, r, g, bl, Math.min(1, b));
  }

  // ------- 2. Determine cat target Y -------
  // Track pointer activity: if pointer recently moved, follow cursor Y;
  // otherwise idle at vertical center.
  var pointerActive = pointer.down || (pointer.gx > 0 && pointer.gx < W && pointer.gy > 0 && pointer.gy < H);
  if (pointerActive) {
    // Check if pointer is within canvas and not at default (0,0)
    catTargetY = Math.max(4, Math.min(H - 5, pointer.gy));
    lastPointerActive = t;
  } else {
    // Idle after 1.2s of no activity
    if (t - lastPointerActive > 1.2) {
      catTargetY = H / 2;
    }
  }
  // Smooth lerp toward target
  catY += (catTargetY - catY) * 0.08;
  // Bob up/down ~2 rows
  catBob = Math.sin(t * 3.2) * 1.6;
  var cy = catY + catBob; // actual center row for cat

  // ------- 3. Cat horizontal position (fixed in left-center) -------
  // Cat sprite is 12 cols wide, place its left edge at ~30% of width
  // so there's room for the rainbow trail behind it.
  var catX = Math.max(6, Math.floor(W * 0.35));
  var catSpriteTopY = Math.round(cy - 3); // sprite is 7 rows, center offset = 3

  // ------- 4. Rainbow trail (between star field and cat) -------
  // Trail stretches from the left edge of the sprite backward to x=0.
  // 6 colors, each band ~1 row tall (stretched 2× for terminal aspect).
  // Wobble: each column's trail has a sine-wave Y offset based on time+x.
  var trailStartX = catX - 1;   // right edge of trail (just left of cat)
  var trailEndX = -1;           // left edge (off-screen)
  // Trail color hue shift — cycles the palette subtly over time
  var hueShift = (t * 0.6) | 0;

  // Vertical center of trail aligned with cat body (body is rows 3-5 of sprite)
  var trailCenterY = catSpriteTopY + 4; // middle of pop-tart body

  // The trail has 6 colored stripes, each 1 row tall, stacked vertically.
  // Use `=` or `_` chars with dense fill. Stripes are 6 rows total
  // (so 3 rows above and 3 below trail center).
  for (var tx = trailStartX; tx > trailEndX; tx--) {
    // Distance-from-cat drives alpha fade and wobble intensity
    var dist = trailStartX - tx;
    var fade = 1 - dist / (trailStartX + 2);
    if (fade < 0.08) continue;

    // Wobble: sine-wave offset based on x + time
    // The trail ripples like a flag in space.
    var wobble = Math.sin(dist * 0.55 - t * 6) * 0.8;
    var wobbleOffset = Math.round(wobble);

    // Rough-step the trail into visible "chunks" — slight jitter so
    // it looks hand-animated (the classic GIF has a stepped look).
    var step = (dist + (t * 6 | 0)) % 2;

    for (var bandIdx = 0; bandIdx < 6; bandIdx++) {
      var bandY = trailCenterY - 3 + bandIdx + wobbleOffset;
      if (bandY < 0 || bandY >= H) continue;

      var colorIdx = (bandIdx + hueShift) % 6;
      var col = RAINBOW[colorIdx];

      // Character choice — use block-ish chars for density
      var ch;
      if (step === 0) {
        ch = bandIdx === 0 || bandIdx === 5 ? '-' : '=';
      } else {
        ch = bandIdx === 0 || bandIdx === 5 ? '_' : '=';
      }

      // Slight vertical brightness curve — middle bands punchier
      var bandBoost = bandIdx === 2 || bandIdx === 3 ? 1.0 : 0.9;
      drawChar(ch, tx, bandY, col[0], col[1], col[2], Math.min(1, fade * bandBoost));
    }

    // Sparkle stars trailing behind (occasional)
    if (dist > 4 && (((tx * 7 + (t * 8 | 0)) % 17) === 0)) {
      var sparkY = trailCenterY + ((tx + (t | 0)) % 9) - 4;
      if (sparkY >= 0 && sparkY < H) {
        drawChar('*', tx, sparkY, 255, 255, 255, fade * 0.9);
      }
    }
  }

  // ------- 5. Cat sprite (top-most layer) -------
  // Leg animation — 2-frame cycle (wiggles as it "flies")
  var legFrame = ((t * 6) | 0) % 2;

  for (var sy = 0; sy < CAT_SPRITE.length; sy++) {
    var row = CAT_SPRITE[sy];
    var gy = catSpriteTopY + sy;
    if (gy < 0 || gy >= H) continue;

    for (var sx = 0; sx < row.length; sx++) {
      var gx = catX + sx;
      if (gx < 0 || gx >= W) continue;
      var px = row[sx];
      if (px === '.') continue;

      var ch = '#';
      var r, g, b;

      if (px === 'K') { r = 0; g = 0; b = 0; ch = '#'; }
      else if (px === 'G') { r = 180; g = 180; b = 180; ch = '#'; }
      else if (px === 'C') { r = 255; g = 140; b = 180; ch = '#'; }
      else if (px === 'W') { r = 255; g = 255; b = 255; ch = '#'; }
      else if (px === 'E') { r = 0; g = 0; b = 0; ch = '#'; }
      else if (px === 'p') { r = 255; g = 170; b = 200; ch = '#'; }
      else if (px === 'r') { r = 255; g = 90; b = 140; ch = '#'; }
      else if (px === 's') { r = 255; g = 220; b = 230; ch = '#'; }
      else { r = 200; g = 200; b = 200; ch = '#'; }

      drawChar(ch, gx, gy, r, g, b, 1.0);
    }
  }

  // Mouth — `=` on the cat face (row 3, between eyes)
  var mouthY = catSpriteTopY + 3;
  if (mouthY >= 0 && mouthY < H) {
    drawChar('=', catX + 7, mouthY, 30, 30, 30, 1.0);
  }

  // Whiskers — two tiny dashes each side of the face
  var whiskerY = catSpriteTopY + 3;
  if (whiskerY >= 0 && whiskerY < H) {
    if (catX + 11 < W) drawChar('-', catX + 11, whiskerY, 0, 0, 0, 0.9);
    if (catX + 11 < W && whiskerY + 1 < H) drawChar('-', catX + 11, whiskerY + 1, 0, 0, 0, 0.7);
  }

  // Paws / legs — two small black dashes wiggling under the body
  var pawY = catSpriteTopY + 7;
  if (pawY >= 0 && pawY < H) {
    var pawOffset = legFrame === 0 ? 0 : 1;
    drawChar('\'', catX + 2 + pawOffset, pawY, 0, 0, 0, 1.0);
    drawChar('\'', catX + 5, pawY, 0, 0, 0, 1.0);
    drawChar('\'', catX + 8 - pawOffset, pawY, 0, 0, 0, 1.0);
  }
}

registerMode('nyancat', {
  init: initNyanCat,
  render: renderNyanCat,
});
