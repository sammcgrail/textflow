import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Rhythm — ASCII rhythm game (Guitar Hero / DDR style)
// ============================================================

// Lane config
var NUM_LANES = 4;
var LANE_CHARS = ['\u266A', '\u266B', '\u2588', '\u2593'];
var LANE_HUES = [180, 300, 60, 120]; // cyan, magenta, yellow, green
var LANE_NAMES = ['D', 'F', 'J', 'K'];

// Game state
var notes = [];
var score = 0;
var highScore = 0;
var combo = 0;
var maxCombo = 0;
var multiplier = 1;
var gameStarted = false;
var gameOver = false;

// Timing
var bpm = 120;
var beatInterval = 0;
var lastBeatTime = 0;
var songTime = 0;
var beatsElapsed = 0;

// Note spawning patterns
var patternIndex = 0;
var patterns = [
  [1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1],
  [1, 0, 1, 0], [0, 1, 0, 1], [1, 1, 0, 0], [0, 0, 1, 1],
  [1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 1, 0], [0, 1, 1, 1],
  [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 1], [0, 0, 0, 0],
  [1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0],
  [1, 1, 0, 0], [0, 0, 1, 1], [1, 0, 0, 1], [0, 1, 1, 0],
];

// Hit feedback
var feedbacks = [];
var hitFlashes = [];
var particles = [];

// Layout
var laneWidth = 0;
var laneStartX = 0;
var hitZoneY = 0;
var noteSpeed = 0;

// Event handler refs
var _keyHandler = null;
var _mouseHandler = null;
var _touchHandler = null;

// Frame timing
var lastFrameTime = 0;

function initRhythm() {
  try { highScore = parseInt(localStorage.getItem('rhythm_hi') || '0', 10) || 0; } catch(e) { highScore = 0; }
  resetGame();
}

function resetGame() {
  notes = [];
  score = 0;
  combo = 0;
  maxCombo = 0;
  multiplier = 1;
  gameStarted = false;
  gameOver = false;
  bpm = 120;
  beatInterval = 60 / bpm;
  lastBeatTime = 0;
  songTime = 0;
  beatsElapsed = 0;
  patternIndex = 0;
  feedbacks = [];
  hitFlashes = [];
  particles = [];
  lastFrameTime = 0;
}

function getLaneCenter(lane, W) {
  var playWidth = Math.min(W - 4, 60);
  laneWidth = Math.floor(playWidth / NUM_LANES);
  laneStartX = Math.floor((W - laneWidth * NUM_LANES) / 2);
  return laneStartX + Math.floor(laneWidth / 2) + lane * laneWidth;
}

function getLaneFromX(x, W) {
  var playWidth = Math.min(W - 4, 60);
  laneWidth = Math.floor(playWidth / NUM_LANES);
  laneStartX = Math.floor((W - laneWidth * NUM_LANES) / 2);
  var rel = x - laneStartX;
  if (rel < 0) return 0;
  var lane = Math.floor(rel / laneWidth);
  if (lane >= NUM_LANES) return NUM_LANES - 1;
  return lane;
}

function spawnNotes() {
  var pattern = patterns[patternIndex % patterns.length];
  patternIndex++;
  for (var i = 0; i < NUM_LANES; i++) {
    if (pattern[i]) {
      notes.push({
        lane: i,
        y: -1,
        speed: noteSpeed,
        active: true,
        char: LANE_CHARS[i]
      });
    }
  }
}

function tryHit(lane) {
  if (!gameStarted || gameOver) return;
  var H = state.ROWS;
  hitZoneY = H - 4;
  var bestNote = null;
  var bestDist = 999;

  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    if (!n.active || n.lane !== lane) continue;
    var dist = Math.abs(n.y - hitZoneY);
    if (dist < bestDist) {
      bestDist = dist;
      bestNote = n;
    }
  }

  if (bestNote && bestDist <= 3) {
    bestNote.active = false;
    var rating, rh, rs, rl;
    if (bestDist <= 0.5) {
      rating = 'PERFECT';
      rh = 60; rs = 100; rl = 80;
      score += 100 * multiplier;
    } else if (bestDist <= 1.5) {
      rating = 'GREAT';
      rh = 120; rs = 90; rl = 70;
      score += 75 * multiplier;
    } else if (bestDist <= 2.5) {
      rating = 'GOOD';
      rh = 180; rs = 60; rl = 50;
      score += 50 * multiplier;
    } else {
      rating = 'OK';
      rh = 200; rs = 40; rl = 40;
      score += 25 * multiplier;
    }
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    multiplier = 1 + Math.floor(combo / 10);
    if (multiplier > 8) multiplier = 8;

    feedbacks.push({ lane: lane, text: rating, time: 0.8, h: rh, s: rs, l: rl });
    hitFlashes.push({ lane: lane, time: 0.3 });
    spawnHitParticles(lane, bestDist <= 0.5);

    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem('rhythm_hi', String(highScore)); } catch(e) {}
    }
  } else {
    combo = 0;
    multiplier = 1;
    feedbacks.push({ lane: lane, text: 'MISS', time: 0.6, h: 0, s: 100, l: 65 });
  }
}

function spawnHitParticles(lane, isPerfect) {
  var W = state.COLS, H = state.ROWS;
  var cx = getLaneCenter(lane, W);
  var cy = H - 4;
  var count = isPerfect ? 16 : 8;
  var chars = ['*', '+', '.', 'o', '~', '\u2605'];
  for (var i = 0; i < count; i++) {
    var angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    var speed = 1.5 + Math.random() * 4;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6 - 1.5,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 0.5 + Math.random() * 0.5,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: LANE_HUES[lane] + Math.random() * 30 - 15
    });
  }
}

function drawText(str, x, y, h, s, l) {
  for (var i = 0; i < str.length; i++) {
    if (str[i] !== ' ') {
      drawCharHSL(str[i], x + i, y, h, s, l);
    }
  }
}

function drawTextCentered(str, y, h, s, l) {
  var x = Math.floor((state.COLS - str.length) / 2);
  drawText(str, x, y, h, s, l);
}

function renderRhythm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var now = performance.now() / 1000;
  var dt = lastFrameTime > 0 ? Math.min(now - lastFrameTime, 0.05) : 1 / 60;
  lastFrameTime = now;

  hitZoneY = H - 4;
  noteSpeed = 8 + beatsElapsed * 0.02;

  // Compute layout
  var playWidth = Math.min(W - 4, 60);
  laneWidth = Math.floor(playWidth / NUM_LANES);
  laneStartX = Math.floor((W - laneWidth * NUM_LANES) / 2);
  var rightEdge = laneStartX + laneWidth * NUM_LANES;

  // Beat pulse
  var beatPhase = songTime / beatInterval;
  var pulse = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 4);

  // ---- Background ----
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (x >= laneStartX && x < rightEdge) {
        var laneIdx = Math.floor((x - laneStartX) / laneWidth);
        var laneEdge = laneStartX + laneIdx * laneWidth;
        if (x === laneEdge && y > 1 && y < H - 1) {
          drawCharHSL('\u2502', x, y, 240, 40, 15 + pulse * 8);
        } else if ((y + Math.floor(t * 2)) % 4 === 0 && y > 1 && y < H - 2) {
          drawCharHSL('\u00B7', x, y, 240, 10, 5 + pulse * 3);
        }
      } else {
        if ((x + y) % 6 === 0 && y > 1) {
          var sideHue = (t * 20 + y * 8) % 360;
          drawCharHSL('.', x, y, sideHue, 20, 4 + pulse * 2);
        }
      }
    }
  }

  // Right lane border
  if (rightEdge < W) {
    for (var y = 2; y < H - 1; y++) {
      drawCharHSL('\u2502', rightEdge, y, 240, 20, 8 + pulse * 4);
    }
  }

  // ---- Side equalizer bars ----
  if (gameStarted && !gameOver) {
    for (var i = 0; i < Math.min(8, H - 6); i++) {
      var barY = H - 5 - i;
      var barLen = Math.floor(Math.sin(t * 3 + i * 0.7) * 2 + 2 + pulse * 3);
      barLen = Math.min(barLen, laneStartX - 2);
      for (var b = 0; b < barLen && b >= 0; b++) {
        var bx = laneStartX - 2 - b;
        if (bx >= 0) {
          var bHue = (i * 40 + t * 60) % 360;
          drawCharHSL('\u2588', bx, barY, bHue, 70, 20 + pulse * 15);
        }
      }
      for (var b = 0; b < barLen && b >= 0; b++) {
        var bx = rightEdge + 1 + b;
        if (bx < W) {
          var bHue2 = (i * 40 + t * 60 + 180) % 360;
          drawCharHSL('\u2588', bx, barY, bHue2, 70, 20 + pulse * 15);
        }
      }
    }
  }

  // ---- Game logic update ----
  if (gameStarted && !gameOver) {
    songTime += dt;

    // Increase BPM over time
    bpm = 120 + Math.floor(songTime / 15) * 10;
    if (bpm > 200) bpm = 200;
    beatInterval = 60 / bpm;

    // Spawn notes on beat
    if (songTime - lastBeatTime >= beatInterval) {
      lastBeatTime += beatInterval;
      beatsElapsed++;
      if (beatsElapsed % 2 === 0 || beatsElapsed > 30) {
        spawnNotes();
      }
    }

    // Update notes
    for (var i = notes.length - 1; i >= 0; i--) {
      var n = notes[i];
      n.y += noteSpeed * dt;
      if (n.active && n.y > hitZoneY + 3) {
        n.active = false;
        combo = 0;
        multiplier = 1;
        feedbacks.push({ lane: n.lane, text: 'MISS', time: 0.6, h: 0, s: 100, l: 65 });
      }
      if (n.y > H + 2) {
        notes.splice(i, 1);
      }
    }

    // Game ends after 90 seconds
    if (songTime > 90) {
      gameOver = true;
      if (score > highScore) {
        highScore = score;
        try { localStorage.setItem('rhythm_hi', String(highScore)); } catch(e) {}
      }
    }
  }

  // ---- Update feedbacks ----
  for (var i = feedbacks.length - 1; i >= 0; i--) {
    feedbacks[i].time -= dt;
    if (feedbacks[i].time <= 0) feedbacks.splice(i, 1);
  }
  for (var i = hitFlashes.length - 1; i >= 0; i--) {
    hitFlashes[i].time -= dt;
    if (hitFlashes[i].time <= 0) hitFlashes.splice(i, 1);
  }

  // ---- Update particles ----
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 3 * dt;
    p.vx *= 0.97;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // ---- Draw hit zone ----
  for (var lane = 0; lane < NUM_LANES; lane++) {
    var cx = getLaneCenter(lane, W);
    var lx = laneStartX + lane * laneWidth;

    var isFlashing = false;
    for (var f = 0; f < hitFlashes.length; f++) {
      if (hitFlashes[f].lane === lane) { isFlashing = true; break; }
    }

    var zoneHue = LANE_HUES[lane];
    var zoneBright = isFlashing ? 85 : 50;
    var zoneSat = isFlashing ? 100 : 80;

    // Target bracket (thick, bright)
    for (var dx = 0; dx < laneWidth; dx++) {
      var tx = lx + dx;
      // Upper border
      drawCharHSL('\u2550', tx, hitZoneY - 1, zoneHue, zoneSat, zoneBright * 0.6);
      // Main target line
      if (dx === 0) {
        drawCharHSL('[', tx, hitZoneY, zoneHue, zoneSat, zoneBright);
      } else if (dx === laneWidth - 1) {
        drawCharHSL(']', tx, hitZoneY, zoneHue, zoneSat, zoneBright);
      } else {
        drawCharHSL('\u2550', tx, hitZoneY, zoneHue, zoneSat, zoneBright);
      }
      // Lower border
      drawCharHSL('\u2550', tx, hitZoneY + 1, zoneHue, zoneSat, zoneBright * 0.6);
    }

    // Lane key label (bigger, brighter)
    drawCharHSL(LANE_NAMES[lane], cx, hitZoneY + 2, zoneHue, 80, 55 + pulse * 15);
  }

  // ---- Draw notes ----
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    if (!n.active) continue;
    var ny = Math.round(n.y);
    if (ny < 2 || ny >= H - 1) continue;
    var cx = getLaneCenter(n.lane, W);
    var lx = laneStartX + n.lane * laneWidth;
    var hue = LANE_HUES[n.lane];

    // Trail above note (longer, brighter)
    for (var trail = 1; trail <= 3; trail++) {
      var ty = ny - trail;
      if (ty >= 2) {
        drawCharHSL('\u2593', cx, ty, hue, 70, 25 - trail * 5);
        if (cx - 1 >= lx) drawCharHSL('\u2591', cx - 1, ty, hue, 50, 18 - trail * 4);
        if (cx + 1 < lx + laneWidth) drawCharHSL('\u2591', cx + 1, ty, hue, 50, 18 - trail * 4);
      }
    }

    // Main note character — big and bright
    drawCharHSL('\u2588', cx, ny, hue, 100, 70 + Math.sin(t * 8) * 10);

    // Wide note body (fill lane width)
    if (cx - 1 >= lx) drawCharHSL('\u2588', cx - 1, ny, hue, 90, 60);
    if (cx + 1 < lx + laneWidth) drawCharHSL('\u2588', cx + 1, ny, hue, 90, 60);
    if (cx - 2 >= lx) drawCharHSL('\u2593', cx - 2, ny, hue, 70, 45);
    if (cx + 2 < lx + laneWidth) drawCharHSL('\u2593', cx + 2, ny, hue, 70, 45);
  }

  // ---- Draw particles ----
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, px, py, p.hue, 80, 20 + alpha * 50);
    }
  }

  // ---- Draw feedbacks ----
  for (var i = 0; i < feedbacks.length; i++) {
    var fb = feedbacks[i];
    var cx = getLaneCenter(fb.lane, W);
    var fy = hitZoneY - 2 - Math.floor((0.8 - fb.time) * 3);
    var fadeL = fb.l * Math.min(1, fb.time / 0.3);
    var str = fb.text;
    var sx = cx - Math.floor(str.length / 2);
    drawText(str, sx, fy, fb.h, fb.s, fadeL);
  }

  // ---- HUD ----
  var scoreStr = 'SCORE ' + score;
  drawText(scoreStr, 1, 0, 60, 70, 60);

  var hiStr = 'HI ' + highScore;
  drawText(hiStr, W - hiStr.length - 1, 0, 30, 50, 45);

  if (combo > 1) {
    var comboStr = combo + 'x COMBO';
    var comboHue = (combo * 15) % 360;
    drawTextCentered(comboStr, 1, comboHue, 80, 50 + Math.sin(t * 6) * 10);
  }

  if (multiplier > 1) {
    var multStr = 'x' + multiplier;
    drawText(multStr, 1, 1, 300, 80, 55 + Math.sin(t * 4) * 10);
  }

  var bpmStr = bpm + ' BPM';
  drawText(bpmStr, W - bpmStr.length - 1, 1, 200, 40, 30);

  if (gameStarted && !gameOver) {
    var timeLeft = Math.max(0, Math.ceil(90 - songTime));
    var timeStr = String(timeLeft) + 's';
    drawText(timeStr, Math.floor(W / 2) - 1, 0, timeLeft < 10 ? 0 : 120, 60, 50);
  }

  // ---- Start screen ----
  if (!gameStarted && !gameOver) {
    var cy = Math.floor(H / 2) - 5;
    drawTextCentered('R H Y T H M', cy, 300, 80, 55 + Math.sin(t * 2) * 15);
    drawTextCentered('\u266A \u266B \u266A \u266B \u266A', cy + 2, 180, 70, 45);
    drawTextCentered('TAP / CLICK TO HIT', cy + 4, 200, 50, 40);
    drawTextCentered('KEYS: D  F  J  K', cy + 6, 120, 50, 40);
    drawTextCentered('PRESS ANY KEY TO START', cy + 8, 60, 60, 35 + Math.sin(t * 3) * 10);

    for (var lane = 0; lane < NUM_LANES; lane++) {
      var previewY = cy + 11 + Math.floor(Math.sin(t * 2 + lane * 1.5) * 2);
      var cx2 = getLaneCenter(lane, W);
      drawCharHSL(LANE_CHARS[lane], cx2, previewY, LANE_HUES[lane], 80, 50);
    }
  }

  // ---- Game over screen ----
  if (gameOver) {
    var cy = Math.floor(H / 2) - 4;
    drawTextCentered('SONG COMPLETE!', cy, 60, 80, 55 + Math.sin(t * 3) * 10);
    drawTextCentered('SCORE: ' + score, cy + 2, 60, 70, 55);
    drawTextCentered('HIGH SCORE: ' + highScore, cy + 3, 30, 60, 50);
    drawTextCentered('MAX COMBO: ' + maxCombo, cy + 4, 300, 60, 50);

    // Letter grade
    var grade = 'F';
    var gradeHue = 0;
    var maxPossible = beatsElapsed * 100;
    var ratio = maxPossible > 0 ? score / maxPossible : 0;
    if (ratio > 0.9) { grade = 'S'; gradeHue = 300; }
    else if (ratio > 0.8) { grade = 'A'; gradeHue = 120; }
    else if (ratio > 0.65) { grade = 'B'; gradeHue = 180; }
    else if (ratio > 0.5) { grade = 'C'; gradeHue = 60; }
    else if (ratio > 0.3) { grade = 'D'; gradeHue = 30; }
    drawTextCentered('GRADE: ' + grade, cy + 6, gradeHue, 90, 60 + Math.sin(t * 4) * 10);
    drawTextCentered('TAP TO PLAY AGAIN', cy + 8, 200, 50, 35 + Math.sin(t * 3) * 8);
  }
}

function attachRhythm() {
  cleanupRhythm();

  _keyHandler = function(e) {
    if (state.currentMode !== 'rhythm') return;

    if (gameOver) {
      resetGame();
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }
    if (!gameStarted) {
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }

    var key = e.key.toLowerCase();
    if (key === 'd' || key === 'arrowleft') { tryHit(0); e.preventDefault(); }
    else if (key === 'f' || key === 'arrowdown') { tryHit(1); e.preventDefault(); }
    else if (key === 'j' || key === 'arrowup') { tryHit(2); e.preventDefault(); }
    else if (key === 'k' || key === 'arrowright') { tryHit(3); e.preventDefault(); }
  };
  window.addEventListener('keydown', _keyHandler);

  _mouseHandler = function(e) {
    if (state.currentMode !== 'rhythm') return;
    if (gameOver) {
      resetGame();
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }
    if (!gameStarted) {
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }

    var rect = state.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var charW = rect.width / state.COLS;
    var col = Math.floor(mx / charW);
    var lane = getLaneFromX(col, state.COLS);
    tryHit(lane);
  };
  state.canvas.addEventListener('mousedown', _mouseHandler);

  _touchHandler = function(e) {
    if (state.currentMode !== 'rhythm') return;
    e.preventDefault();

    if (gameOver) {
      resetGame();
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }
    if (!gameStarted) {
      gameStarted = true;
      lastFrameTime = performance.now() / 1000;
      return;
    }

    var rect = state.canvas.getBoundingClientRect();
    var charW = rect.width / state.COLS;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var touch = e.changedTouches[i];
      var mx = touch.clientX - rect.left;
      var col = Math.floor(mx / charW);
      var lane = getLaneFromX(col, state.COLS);
      tryHit(lane);
    }
  };
  state.canvas.addEventListener('touchstart', _touchHandler, { passive: false });
}

function cleanupRhythm() {
  if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  if (_mouseHandler && state.canvas) { state.canvas.removeEventListener('mousedown', _mouseHandler); _mouseHandler = null; }
  if (_touchHandler && state.canvas) { state.canvas.removeEventListener('touchstart', _touchHandler); _touchHandler = null; }
}

registerMode('rhythm', { init: initRhythm, render: renderRhythm, attach: attachRhythm, cleanup: cleanupRhythm });
