import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// pachinko — balls drop through a triangular grid of pegs, bouncing
// unpredictably until they land in slots at the bottom. A Galton-board
// style statistical sculpture: leave it running and watch the bell curve
// build itself. Click anywhere above the pegfield to drop a ball; drag
// to continuously rain balls. Pegs flash when hit. Slots fill with
// rainbow bars according to how many balls landed there.

var pkBalls = null;         // { x, y, vx, vy, hue, age }
var pkPegs = null;          // { x, y, hit } — fixed grid
var pkSlots = null;         // per-column accumulator: { count, lastHit, lastHue }
var pkW = 0, pkH = 0;
var pkTopY = 0;             // pegs start at this y
var pkBotY = 0;             // pegs end at this y; below = slots
var pkSpawnTimer = 0;
var pkMaxBalls = 60;
var pkGravity = 0.115;
var pkAirDrag = 0.997;

function initPachinko() {
  pkW = state.COLS;
  pkH = state.ROWS;
  pkBalls = [];
  pkPegs = [];
  // Peg zone is the middle ~62% of the canvas, rows 3..H-8
  pkTopY = Math.max(4, (pkH * 0.18) | 0);
  pkBotY = Math.max(pkTopY + 6, (pkH * 0.80) | 0);
  var charAR = 0.5;  // chars ~2x taller than wide — use for horizontal spacing
  // triangular peg grid: every other row offset by half a column
  var rowSpacing = 2;       // y rows between peg rows
  var colSpacing = 4;       // x cols between pegs
  for (var py = pkTopY; py <= pkBotY; py += rowSpacing) {
    var rowIdx = ((py - pkTopY) / rowSpacing) | 0;
    var offset = (rowIdx & 1) ? colSpacing * 0.5 : 0;
    // leave a 3-col margin on each side
    for (var px = 3 + offset; px < pkW - 3; px += colSpacing) {
      pkPegs.push({ x: px, y: py, hit: 0 });
    }
  }
  // Slots — one per column (to match slot resolution), accumulator below pegs
  pkSlots = [];
  for (var sx = 0; sx < pkW; sx++) {
    pkSlots.push({ count: 0, lastHit: 0, lastHue: 0 });
  }
  pkSpawnTimer = 0.25;
  // Seed a few balls so the field isn't empty on load
  for (var i = 0; i < 8; i++) {
    spawnBall(3 + Math.random() * (pkW - 6), -1 - i * 0.8);
  }
}

function spawnBall(x, y) {
  if (pkBalls.length >= pkMaxBalls) pkBalls.shift();
  pkBalls.push({
    x: x,
    y: y,
    vx: (Math.random() - 0.5) * 0.12,
    vy: 0,
    hue: (x / pkW) * 360,        // rainbow based on drop X
    age: 0,
  });
}

function renderPachinko() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pkBalls || pkW !== W || pkH !== H) initPachinko();

  var t = state.time;
  var dt = 1 / 60;

  // Click — drop a ball at pointer X
  if (pointer.clicked && state.currentMode === 'pachinko') {
    pointer.clicked = false;
    var dx = Math.max(2, Math.min(W - 2, pointer.gx));
    spawnBall(dx, 0);
  }
  // Drag — rain balls at pointer
  else if (pointer.down && state.currentMode === 'pachinko') {
    if (Math.random() < 0.35) {
      var ddx = Math.max(2, Math.min(W - 2, pointer.gx));
      spawnBall(ddx + (Math.random() - 0.5) * 0.8, 0);
    }
  }

  // Auto-spawn every ~0.6s from a weighted-random X (center-biased)
  pkSpawnTimer -= dt;
  if (pkSpawnTimer <= 0) {
    pkSpawnTimer = 0.5 + Math.random() * 0.4;
    // Triangle-distributed drop to favor center without being strict
    var r = (Math.random() + Math.random() + Math.random()) / 3;  // ~gaussian 0..1
    spawnBall(3 + r * (W - 6), 0);
  }

  // Peg hit decay
  for (var pi = 0; pi < pkPegs.length; pi++) {
    if (pkPegs[pi].hit > 0) pkPegs[pi].hit -= dt * 3.5;
  }

  // Ball physics + collision
  for (var bi = pkBalls.length - 1; bi >= 0; bi--) {
    var b = pkBalls[bi];
    b.age += dt;
    b.vy += pkGravity;
    b.vx *= pkAirDrag;
    b.x += b.vx;
    b.y += b.vy;
    // Wall bounce
    if (b.x < 0.5) { b.x = 0.5; b.vx = Math.abs(b.vx) * 0.55; }
    if (b.x > W - 1.5) { b.x = W - 1.5; b.vx = -Math.abs(b.vx) * 0.55; }

    // Peg collision — check nearby pegs only (broad cut by y-range)
    for (var pj = 0; pj < pkPegs.length; pj++) {
      var pg = pkPegs[pj];
      // broad-phase: skip pegs far in y
      var ddy = (b.y - pg.y);
      if (ddy < -1.5 || ddy > 1.5) continue;
      var ddxp = b.x - pg.x;
      // account for character aspect ratio: ~2x taller than wide →
      // ddy in "display" = ddy * 2 actually, but we want ball to see
      // pegs as round. Use a radius in row-units where 1 row ≈ 2 cols.
      var ddxNorm = ddxp * 0.5;
      var dist2 = ddxNorm * ddxNorm + ddy * ddy;
      var hitR = 0.85;
      if (dist2 < hitR * hitR) {
        var d = Math.sqrt(dist2) || 0.001;
        // Push ball out along the collision normal, reflect velocity
        var nx = ddxNorm / d, ny = ddy / d;
        // expand back to col units on x
        var pushX = nx * 2.0;
        // reposition slightly outside peg
        b.x = pg.x + pushX * hitR;
        b.y = pg.y + ny * hitR;
        // reflect
        var vn = b.vx * nx * 0.5 + b.vy * ny;
        if (vn < 0) {
          var restitution = 0.55;
          b.vx -= 2 * vn * nx * 2.0 * restitution;
          b.vy -= 2 * vn * ny * restitution;
          // add some randomness so runs diverge (this is what makes it Galton-like)
          b.vx += (Math.random() - 0.5) * 0.32;
        }
        pg.hit = 1.0;  // peg flash
      }
    }

    // Slot collection (anything that falls below last peg row)
    if (b.y > pkBotY + 1.5) {
      var slotIdx = Math.min(W - 1, Math.max(0, (b.x + 0.5) | 0));
      pkSlots[slotIdx].count += 1;
      pkSlots[slotIdx].lastHit = 1.0;
      pkSlots[slotIdx].lastHue = b.hue;
      pkBalls.splice(bi, 1);
      continue;
    }
    // Safety: anything off the bottom or ancient, remove
    if (b.y > H + 2 || b.age > 12) pkBalls.splice(bi, 1);
  }

  // Slot hit decay
  for (var sli = 0; sli < pkSlots.length; sli++) {
    if (pkSlots[sli].lastHit > 0) pkSlots[sli].lastHit -= dt * 2.0;
  }

  // Periodic slot drain so counts don't pin forever — age out ~1/30s
  if ((t * 60 | 0) % 180 === 0) {
    for (var sld = 0; sld < pkSlots.length; sld++) {
      if (pkSlots[sld].count > 0) pkSlots[sld].count = (pkSlots[sld].count * 0.92) | 0;
    }
  }

  // ---- RENDER ----

  // Slot distribution → bar heights. Normalize so tallest = slotArea height
  var slotAreaTop = pkBotY + 2;
  var slotAreaH = Math.max(3, H - slotAreaTop - 1);
  var maxCount = 1;
  for (var mi = 0; mi < pkSlots.length; mi++) {
    if (pkSlots[mi].count > maxCount) maxCount = pkSlots[mi].count;
  }

  // Draw slot bars (from bottom up)
  for (var cx = 0; cx < W; cx++) {
    var slot = pkSlots[cx];
    if (slot.count <= 0) continue;
    var barHeight = Math.min(slotAreaH, ((slot.count / maxCount) * slotAreaH) | 0);
    if (barHeight < 1) barHeight = 1;
    var hue = (cx / W) * 360;
    var baseL = 35;
    var flash = Math.max(0, slot.lastHit) * 25;
    for (var by = 0; by < barHeight; by++) {
      var drawY = H - 2 - by;
      if (drawY < slotAreaTop) break;
      var ch = (by === barHeight - 1) ? '▀' : '█';
      var l = baseL + flash + by * 2;
      if (l > 70) l = 70;
      drawCharHSL(ch, cx, drawY, hue | 0, 70, l | 0);
    }
  }

  // Draw pegs
  for (var pk = 0; pk < pkPegs.length; pk++) {
    var peg = pkPegs[pk];
    var xi = peg.x | 0;
    if (xi < 0 || xi >= W) continue;
    var hitA = Math.max(0, peg.hit);
    var pegCh = hitA > 0.5 ? '◉' : (hitA > 0.1 ? '●' : 'o');
    var pegL = 20 + hitA * 45;
    var pegS = 20 + hitA * 70;
    drawCharHSL(pegCh, xi, peg.y, 190, pegS | 0, pegL | 0);
  }

  // Draw balls (after pegs so balls draw on top)
  for (var bk = 0; bk < pkBalls.length; bk++) {
    var bb = pkBalls[bk];
    var bxi = bb.x | 0;
    var byi = bb.y | 0;
    if (bxi < 0 || bxi >= W || byi < 0 || byi >= H) continue;
    var speed = Math.min(1, Math.hypot(bb.vx, bb.vy) * 0.4);
    var ball_ch = speed > 0.6 ? '●' : (speed > 0.3 ? '◉' : '◎');
    drawCharHSL(ball_ch, bxi, byi, bb.hue | 0, 85, 55 + speed * 15);
    // faint trail in previous row
    if (byi - 1 >= 0) {
      drawCharHSL('·', bxi, byi - 1, bb.hue | 0, 60, 35);
    }
  }

  // Divider line under pegs — shows where balls become "landed"
  for (var dx = 0; dx < W; dx++) {
    var ch = (dx % 2 === 0) ? '─' : ' ';
    if (ch !== ' ') drawCharHSL(ch, dx, slotAreaTop - 1, 200, 10, 22);
  }

  // Label
  var lbl = 'pachinko';
  for (var li = 0; li < lbl.length; li++) {
    drawCharHSL(lbl[li], W - lbl.length - 1 + li, 1, 40, 80, 55);
  }
}

registerMode('pachinko', { init: initPachinko, render: renderPachinko });
