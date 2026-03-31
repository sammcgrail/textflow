import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Neon Race — top-down ASCII neon car racing game
// ============================================================

// --- Game state ---
var playerX = 0;
var speed = 0;
var baseSpeed = 8;
var maxSpeed = 28;
var score = 0;
var highScore = 0;
var lives = 3;
var gameOver = false;
var gameStarted = false;
var roadScroll = 0;
var lastTime = 0;
var enemies = [];
var powerups = [];
var particles = [];
var trails = [];
var explosionParts = [];
var explosionTimer = 0;
var shieldTimer = 0;
var boostTimer = 0;
var invincibleTimer = 0;
var roadCurvePhase = 0;
var lastSpawnDist = 0;
var lastPowerupDist = 0;
var distanceTraveled = 0;
var flashTimer = 0;

// Road dimensions (computed on init)
var roadLeft = 0;
var roadRight = 0;
var roadWidth = 0;
var laneCount = 4;

// Player car shape (3 wide, 3 tall)
var CAR_W = 3;
var CAR_H = 3;

// Enemy car shapes
var ENEMY_SHAPES = [
  [' V ', '|#|', ' ^ '],
  [' A ', '[X]', ' V '],
  [' o ', '{=}', ' o '],
  [' * ', '<O>', ' * '],
];

// --- Pointer tracking ---
var ptrX = -1;
var ptrDown = false;
var _ptrMoveHandler = null;
var _ptrDownHandler = null;
var _ptrUpHandler = null;
var _touchMoveHandler = null;
var _touchStartHandler = null;
var _touchEndHandler = null;
var _clickHandler = null;

function initRace() {
  try {
    highScore = parseInt(localStorage.getItem('neonrace_hi') || '0', 10) || 0;
  } catch (e) {
    highScore = 0;
  }
  computeRoad();
  resetGame();
}

function computeRoad() {
  roadWidth = Math.min(Math.floor(state.COLS * 0.6), 40);
  if (roadWidth < 16) roadWidth = 16;
  roadLeft = Math.floor((state.COLS - roadWidth) / 2);
  roadRight = roadLeft + roadWidth - 1;
}

function resetGame() {
  computeRoad();
  playerX = Math.floor((roadLeft + roadRight) / 2);
  speed = baseSpeed;
  score = 0;
  lives = 3;
  gameOver = false;
  enemies = [];
  powerups = [];
  particles = [];
  trails = [];
  explosionParts = [];
  explosionTimer = 0;
  shieldTimer = 0;
  boostTimer = 0;
  invincibleTimer = 0;
  roadScroll = 0;
  roadCurvePhase = 0;
  lastSpawnDist = 0;
  lastPowerupDist = 0;
  distanceTraveled = 0;
  flashTimer = 0;
  lastTime = 0;
}

function getRoadOffset(y) {
  var amplitude = Math.min(roadWidth * 0.15, 6);
  return Math.sin(roadCurvePhase + y * 0.08) * amplitude;
}

function spawnEnemy() {
  var laneWidth = Math.floor(roadWidth / laneCount);
  var lane = Math.floor(Math.random() * laneCount);
  var offset = getRoadOffset(0);
  var ex = roadLeft + Math.floor(laneWidth * (lane + 0.5)) + Math.round(offset);
  var shapeIdx = Math.floor(Math.random() * ENEMY_SHAPES.length);
  var hues = [320, 280, 180, 160, 200, 60];
  var hue = hues[Math.floor(Math.random() * hues.length)];
  enemies.push({
    x: ex,
    y: -3,
    shape: shapeIdx,
    hue: hue,
    speed: 0.3 + Math.random() * 0.4,
  });
}

function spawnPowerup() {
  var laneWidth = Math.floor(roadWidth / laneCount);
  var lane = Math.floor(Math.random() * laneCount);
  var offset = getRoadOffset(0);
  var px = roadLeft + Math.floor(laneWidth * (lane + 0.5)) + Math.round(offset);
  var type = Math.random() < 0.5 ? 'boost' : 'shield';
  powerups.push({
    x: px,
    y: -1,
    type: type,
  });
}

function spawnExplosion(x, y) {
  var chars = ['*', '#', '.', '~', '+', 'x', '@', '%'];
  for (var i = 0; i < 25; i++) {
    var angle = (Math.PI * 2 * i) / 25 + Math.random() * 0.5;
    var spd = 1.5 + Math.random() * 5;
    explosionParts.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd * 0.6,
      life: 0.5 + Math.random() * 0.8,
      maxLife: 0.5 + Math.random() * 0.8,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: Math.random() < 0.5 ? 30 + Math.random() * 30 : Math.random() * 20,
    });
  }
}

function spawnTrail(x, y, hue) {
  trails.push({
    x: x,
    y: y,
    life: 0.3 + Math.random() * 0.2,
    maxLife: 0.3 + Math.random() * 0.2,
    hue: hue,
    ch: '|',
  });
}

function spawnPickupParticles(x, y, hue) {
  var chars = ['+', '*', '.', 'o'];
  for (var i = 0; i < 10; i++) {
    var angle = (Math.PI * 2 * i) / 10;
    var spd = 1 + Math.random() * 3;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd * 0.5,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.4 + Math.random() * 0.3,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: hue,
    });
  }
}

function updateGame(dt) {
  if (!gameStarted || gameOver) return;
  if (explosionTimer > 0) {
    explosionTimer -= dt;
    return;
  }

  // Speed increase over time
  speed = baseSpeed + distanceTraveled * 0.005;
  if (speed > maxSpeed) speed = maxSpeed;
  var effectiveSpeed = boostTimer > 0 ? speed * 1.8 : speed;

  // Road scroll
  var scrollAmount = effectiveSpeed * dt;
  roadScroll += scrollAmount;
  distanceTraveled += scrollAmount;
  roadCurvePhase += dt * 0.3;

  // Score
  score = Math.floor(distanceTraveled * 10);

  // Player horizontal movement via mouse/touch
  if (ptrX >= 0) {
    var targetX = Math.floor(ptrX / state.CHAR_W);
    var offset = Math.round(getRoadOffset(state.ROWS - 4));
    var minX = roadLeft + 2 + Math.round(offset);
    var maxX = roadRight - 2 + Math.round(offset);
    if (targetX < minX) targetX = minX;
    if (targetX > maxX) targetX = maxX;
    var diff = targetX - playerX;
    if (Math.abs(diff) > 0) {
      var moveSpeed = 40 * dt;
      if (Math.abs(diff) < moveSpeed) {
        playerX = targetX;
      } else {
        playerX += diff > 0 ? Math.ceil(moveSpeed) : -Math.ceil(moveSpeed);
      }
    }
  }

  // Timers
  if (invincibleTimer > 0) invincibleTimer -= dt;
  if (shieldTimer > 0) shieldTimer -= dt;
  if (boostTimer > 0) boostTimer -= dt;
  if (flashTimer > 0) flashTimer -= dt;

  // Spawn enemies
  var spawnInterval = Math.max(3, 8 - distanceTraveled * 0.003);
  if (distanceTraveled - lastSpawnDist > spawnInterval) {
    var count = 1 + Math.floor(distanceTraveled / 200);
    if (count > 3) count = 3;
    for (var s = 0; s < count; s++) {
      spawnEnemy();
    }
    lastSpawnDist = distanceTraveled;
  }

  // Spawn powerups
  var powerupInterval = 20 + Math.random() * 15;
  if (distanceTraveled - lastPowerupDist > powerupInterval) {
    spawnPowerup();
    lastPowerupDist = distanceTraveled;
  }

  // Update enemies
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    e.y += effectiveSpeed * (1 - e.speed) * dt;
    if (Math.random() < 0.3) {
      spawnTrail(e.x, e.y + 1, e.hue);
    }
    if (e.y > state.ROWS + 3) {
      enemies.splice(i, 1);
      continue;
    }
    // Collision with player
    var py = state.ROWS - 4;
    if (invincibleTimer <= 0 && Math.abs(e.x - playerX) < 2 && Math.abs(e.y - py) < 2) {
      if (shieldTimer > 0) {
        shieldTimer = 0;
        spawnExplosion(e.x, e.y);
        enemies.splice(i, 1);
        flashTimer = 0.2;
      } else {
        lives--;
        spawnExplosion(playerX, py);
        invincibleTimer = 2.0;
        flashTimer = 0.5;
        enemies.splice(i, 1);
        if (lives <= 0) {
          gameOver = true;
          explosionTimer = 1.5;
          if (score > highScore) {
            highScore = score;
            try {
              localStorage.setItem('neonrace_hi', String(highScore));
            } catch (e2) {}
          }
        }
      }
    }
  }

  // Update powerups
  for (var i = powerups.length - 1; i >= 0; i--) {
    var p = powerups[i];
    p.y += effectiveSpeed * dt;
    if (p.y > state.ROWS + 2) {
      powerups.splice(i, 1);
      continue;
    }
    var py = state.ROWS - 4;
    if (Math.abs(p.x - playerX) < 2 && Math.abs(p.y - py) < 2) {
      if (p.type === 'boost') {
        boostTimer = 3.0;
        spawnPickupParticles(p.x, p.y, 55);
      } else {
        shieldTimer = 5.0;
        spawnPickupParticles(p.x, p.y, 180);
      }
      powerups.splice(i, 1);
    }
  }

  // Player trail
  var py = state.ROWS - 4;
  if (Math.random() < 0.5) {
    spawnTrail(playerX - 1, py + 2, boostTimer > 0 ? 55 : 190);
    spawnTrail(playerX + 1, py + 2, boostTimer > 0 ? 55 : 190);
  }
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (var i = trails.length - 1; i >= 0; i--) {
    var tr = trails[i];
    tr.life -= dt;
    if (tr.life <= 0) trails.splice(i, 1);
  }
  for (var i = explosionParts.length - 1; i >= 0; i--) {
    var ep = explosionParts[i];
    ep.x += ep.vx * dt;
    ep.y += ep.vy * dt;
    ep.vx *= 0.94;
    ep.vy *= 0.94;
    ep.life -= dt;
    if (ep.life <= 0) explosionParts.splice(i, 1);
  }
}

function drawText(text, x, y, hue, sat, light) {
  for (var i = 0; i < text.length; i++) {
    if (text[i] !== ' ') {
      drawCharHSL(text[i], x + i, y, hue, sat, light);
    }
  }
}

function drawCenteredText(text, y, hue, sat, light) {
  var x = Math.floor((state.COLS - text.length) / 2);
  drawText(text, x, y, hue, sat, light);
}

function renderRace() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  // dt
  var now = performance.now();
  var dt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
  if (dt > 0.1) dt = 0.016;
  lastTime = now;

  updateGame(dt);
  updateParticles(dt);

  // --- Background: dark terrain with dim dots ---
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var offset = Math.round(getRoadOffset(y));
      var rl = roadLeft + offset;
      var rr = roadRight + offset;

      if (x < rl - 1 || x > rr + 1) {
        if ((x + y + Math.floor(roadScroll)) % 7 === 0) {
          drawCharHSL('.', x, y, 120, 20, 6);
        }
      }
    }
  }

  // --- Road surface and markings ---
  for (var y = 0; y < H; y++) {
    var offset = Math.round(getRoadOffset(y));
    var rl = roadLeft + offset;
    var rr = roadRight + offset;

    // Subtle road texture
    for (var x = rl; x <= rr; x++) {
      if (x >= 0 && x < W) {
        if ((x + y + Math.floor(roadScroll * 2)) % 11 === 0) {
          drawCharHSL('.', x, y, 240, 5, 5);
        }
      }
    }

    // Neon curbs
    if (rl - 1 >= 0 && rl - 1 < W) {
      var curbPulse = Math.sin(t * 4 + y * 0.3) * 0.3 + 0.7;
      var curbChar = ((y + Math.floor(roadScroll * 3)) % 2 === 0) ? '|' : ':';
      drawCharHSL(curbChar, rl - 1, y, 320, 90, 30 + curbPulse * 25);
    }
    if (rr + 1 >= 0 && rr + 1 < W) {
      var curbPulse = Math.sin(t * 4 + y * 0.3 + 1) * 0.3 + 0.7;
      var curbChar = ((y + Math.floor(roadScroll * 3)) % 2 === 0) ? '|' : ':';
      drawCharHSL(curbChar, rr + 1, y, 320, 90, 30 + curbPulse * 25);
    }

    // Edge lines (bright neon purple)
    if (rl >= 0 && rl < W) {
      var edgeBright = 35 + Math.sin(t * 3 + y * 0.2) * 15;
      drawCharHSL('|', rl, y, 280, 80, edgeBright);
    }
    if (rr >= 0 && rr < W) {
      var edgeBright = 35 + Math.sin(t * 3 + y * 0.2 + 2) * 15;
      drawCharHSL('|', rr, y, 280, 80, edgeBright);
    }

    // Lane dividers (dashed cyan, scrolling)
    var laneW = Math.floor(roadWidth / laneCount);
    for (var lane = 1; lane < laneCount; lane++) {
      var lx = rl + Math.floor(laneW * lane);
      if (lx >= 0 && lx < W) {
        var scrollY = (y + Math.floor(roadScroll * 3)) % 4;
        if (scrollY < 2) {
          var lanePulse = Math.sin(t * 2 + lane) * 0.3 + 0.7;
          drawCharHSL(':', lx, y, 180, 60, 15 + lanePulse * 15);
        }
      }
    }
  }

  // --- Trails ---
  for (var i = 0; i < trails.length; i++) {
    var tr = trails[i];
    var tx = Math.round(tr.x);
    var ty = Math.round(tr.y);
    if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
      var alpha = tr.life / tr.maxLife;
      drawCharHSL(tr.ch, tx, ty, tr.hue, 70, 10 + alpha * 25);
    }
  }

  // --- Powerups ---
  for (var i = 0; i < powerups.length; i++) {
    var p = powerups[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var pulse = Math.sin(t * 6) * 0.3 + 0.7;
      if (p.type === 'boost') {
        drawCharHSL('>', px - 1, py, 55, 90, 40 + pulse * 20);
        drawCharHSL('!', px, py, 55, 95, 50 + pulse * 25);
        drawCharHSL('<', px + 1, py, 55, 90, 40 + pulse * 20);
      } else {
        drawCharHSL('[', px - 1, py, 180, 90, 35 + pulse * 20);
        drawCharHSL('+', px, py, 180, 95, 45 + pulse * 25);
        drawCharHSL(']', px + 1, py, 180, 90, 35 + pulse * 20);
      }
    }
  }

  // --- Enemy cars ---
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var ex = Math.round(e.x);
    var ey = Math.round(e.y);
    var shape = ENEMY_SHAPES[e.shape];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        var ch = shape[row][col];
        if (ch !== ' ') {
          var cx = ex - 1 + col;
          var cy = ey - 1 + row;
          if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
            var glow = Math.sin(t * 5 + i) * 0.2 + 0.8;
            drawCharHSL(ch, cx, cy, e.hue, 85, 35 + glow * 25);
          }
        }
      }
    }
  }

  // --- Player car ---
  if (!gameOver || explosionTimer > 0) {
    var py = H - 4;
    var visible = true;
    if (invincibleTimer > 0) {
      visible = Math.floor(invincibleTimer * 10) % 2 === 0;
    }
    if (visible && explosionTimer <= 0) {
      var carHue = boostTimer > 0 ? 55 : (shieldTimer > 0 ? 180 : 190);
      var carBright = 50 + Math.sin(t * 4) * 10;
      // Top row
      drawCharHSL('/', playerX - 1, py - 1, carHue, 90, carBright);
      drawCharHSL('^', playerX, py - 1, carHue, 95, carBright + 15);
      drawCharHSL('\\', playerX + 1, py - 1, carHue, 90, carBright);
      // Middle row
      drawCharHSL('[', playerX - 1, py, carHue, 85, carBright + 5);
      drawCharHSL('#', playerX, py, carHue, 95, carBright + 20);
      drawCharHSL(']', playerX + 1, py, carHue, 85, carBright + 5);
      // Bottom row
      drawCharHSL('\\', playerX - 1, py + 1, carHue, 80, carBright - 5);
      drawCharHSL('=', playerX, py + 1, carHue, 85, carBright);
      drawCharHSL('/', playerX + 1, py + 1, carHue, 80, carBright - 5);

      // Shield visual
      if (shieldTimer > 0) {
        var sp = Math.sin(t * 8) * 0.3 + 0.7;
        drawCharHSL('(', playerX - 2, py, 180, 80, 25 + sp * 20);
        drawCharHSL(')', playerX + 2, py, 180, 80, 25 + sp * 20);
        drawCharHSL('-', playerX - 1, py - 2, 180, 80, 20 + sp * 15);
        drawCharHSL('-', playerX, py - 2, 180, 80, 20 + sp * 15);
        drawCharHSL('-', playerX + 1, py - 2, 180, 80, 20 + sp * 15);
      }

      // Boost exhaust
      if (boostTimer > 0) {
        var bp = Math.sin(t * 12) * 0.3 + 0.7;
        drawCharHSL('~', playerX - 1, py + 2, 35, 95, 40 + bp * 30);
        drawCharHSL('*', playerX, py + 2, 25, 95, 50 + bp * 30);
        drawCharHSL('~', playerX + 1, py + 2, 35, 95, 40 + bp * 30);
      }
    }
  }

  // --- Explosion particles ---
  for (var i = 0; i < explosionParts.length; i++) {
    var ep = explosionParts[i];
    var epx = Math.round(ep.x);
    var epy = Math.round(ep.y);
    if (epx >= 0 && epx < W && epy >= 0 && epy < H) {
      var alpha = ep.life / ep.maxLife;
      drawCharHSL(ep.ch, epx, epy, ep.hue, 90, 20 + alpha * 55);
    }
  }

  // --- Pickup particles ---
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var ppx = Math.round(p.x);
    var ppy = Math.round(p.y);
    if (ppx >= 0 && ppx < W && ppy >= 0 && ppy < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, ppx, ppy, p.hue, 85, 20 + alpha * 50);
    }
  }

  // --- Flash on damage ---
  if (flashTimer > 0) {
    var flashBright = 8 + (flashTimer / 0.5) * 12;
    for (var fy = 0; fy < H; fy += 3) {
      for (var fx = 0; fx < W; fx += 5) {
        drawCharHSL('.', fx, fy, 0, 80, flashBright);
      }
    }
  }

  // --- HUD ---
  var scoreStr = 'SCORE ' + score;
  drawText(scoreStr, 1, 2, 55, 80, 55);

  var hiStr = 'HI ' + highScore;
  drawText(hiStr, W - hiStr.length - 1, 2, 320, 60, 45);

  // Lives as hearts
  for (var li = 0; li < lives; li++) {
    drawCharHSL('<', Math.floor(W / 2) - 4 + li * 3, 2, 0, 90, 55);
    drawCharHSL('3', Math.floor(W / 2) - 3 + li * 3, 2, 0, 90, 55);
  }

  // Speed bar
  var speedBar = 'SPD:';
  var barLen = Math.floor(((speed - baseSpeed) / (maxSpeed - baseSpeed)) * 10);
  for (var si = 0; si < barLen; si++) speedBar += '=';
  drawText(speedBar, 1, 3, 180, 70, 40);

  // Active powerup indicators
  if (shieldTimer > 0) {
    drawText('[SHIELD]', W - 10, 3, 180, 90, 50 + Math.sin(t * 4) * 15);
  }
  if (boostTimer > 0) {
    drawText('>BOOST<', W - 10, 3, 55, 90, 50 + Math.sin(t * 6) * 15);
  }

  // --- Start screen ---
  if (!gameStarted && !gameOver) {
    var cy = Math.floor(H / 2);

    var title = 'N E O N  R A C E';
    var tx = Math.floor((W - title.length) / 2);
    for (var ti = 0; ti < title.length; ti++) {
      if (title[ti] !== ' ') {
        var hue = (320 + ti * 12 + t * 60) % 360;
        var bright = 50 + Math.sin(t * 3 + ti * 0.5) * 20;
        drawCharHSL(title[ti], tx + ti, cy - 4, hue, 90, bright);
      }
    }

    var deco = '-=-=-=-=-=-=-=-=-=-';
    drawCenteredText(deco, cy - 2, 280, 60, 25 + Math.sin(t * 2) * 10);
    drawCenteredText('MOUSE TO STEER', cy, 180, 70, 40);
    drawCenteredText('CLICK TO START', cy + 2, 320, 80, 40 + Math.sin(t * 3) * 15);
    drawCenteredText(deco, cy + 4, 280, 60, 25 + Math.sin(t * 2 + 1) * 10);
    drawCenteredText('>!< = SPEED BOOST', cy + 6, 55, 70, 35);
    drawCenteredText('[+] = SHIELD', cy + 7, 180, 70, 35);
  }

  // --- Game over screen ---
  if (gameOver && explosionTimer <= 0) {
    var cy = Math.floor(H / 2);

    var goText = 'G A M E  O V E R';
    var gx = Math.floor((W - goText.length) / 2);
    for (var gi = 0; gi < goText.length; gi++) {
      if (goText[gi] !== ' ') {
        var hue = (Math.sin(t * 2 + gi * 0.4) * 30 + 360) % 360;
        var bright = 45 + Math.sin(t * 4) * 15;
        drawCharHSL(goText[gi], gx + gi, cy - 3, hue, 90, bright);
      }
    }

    drawCenteredText('SCORE: ' + score, cy - 1, 55, 80, 55);
    drawCenteredText('BEST:  ' + highScore, cy, 320, 70, 50);
    drawCenteredText('CLICK TO RACE AGAIN', cy + 3, 180, 80, 35 + Math.sin(t * 3) * 15);
  }
}

function cleanupRace() {
  if (_ptrMoveHandler) {
    window.removeEventListener('mousemove', _ptrMoveHandler);
    _ptrMoveHandler = null;
  }
  if (_ptrDownHandler) {
    window.removeEventListener('mousedown', _ptrDownHandler);
    _ptrDownHandler = null;
  }
  if (_ptrUpHandler) {
    window.removeEventListener('mouseup', _ptrUpHandler);
    _ptrUpHandler = null;
  }
  if (_touchMoveHandler && state.canvas) {
    state.canvas.removeEventListener('touchmove', _touchMoveHandler);
    _touchMoveHandler = null;
  }
  if (_touchStartHandler && state.canvas) {
    state.canvas.removeEventListener('touchstart', _touchStartHandler);
    _touchStartHandler = null;
  }
  if (_touchEndHandler && state.canvas) {
    state.canvas.removeEventListener('touchend', _touchEndHandler);
    _touchEndHandler = null;
  }
  if (_clickHandler) {
    window.removeEventListener('click', _clickHandler);
    _clickHandler = null;
  }
}

function attachRace() {
  cleanupRace();

  _ptrMoveHandler = function (e) {
    if (state.currentMode !== 'neonrace') return;
    var rect = state.canvas.getBoundingClientRect();
    ptrX = (e.clientX - rect.left) * (state.canvas.width / rect.width / (state.dpr || 1));
  };
  window.addEventListener('mousemove', _ptrMoveHandler);

  _ptrDownHandler = function (e) {
    if (state.currentMode !== 'neonrace') return;
    ptrDown = true;
    var rect = state.canvas.getBoundingClientRect();
    ptrX = (e.clientX - rect.left) * (state.canvas.width / rect.width / (state.dpr || 1));
  };
  window.addEventListener('mousedown', _ptrDownHandler);

  _ptrUpHandler = function () {
    if (state.currentMode !== 'neonrace') return;
    ptrDown = false;
  };
  window.addEventListener('mouseup', _ptrUpHandler);

  _clickHandler = function () {
    if (state.currentMode !== 'neonrace') return;
    if (gameOver && explosionTimer <= 0) {
      resetGame();
      gameStarted = true;
      lastTime = performance.now();
    } else if (!gameStarted) {
      gameStarted = true;
      lastTime = performance.now();
    }
  };
  window.addEventListener('click', _clickHandler);

  _touchStartHandler = function (e) {
    if (state.currentMode !== 'neonrace') return;
    if (e.touches.length > 0) {
      var rect = state.canvas.getBoundingClientRect();
      ptrX = (e.touches[0].clientX - rect.left) * (state.canvas.width / rect.width / (state.dpr || 1));
      ptrDown = true;
    }
  };
  state.canvas.addEventListener('touchstart', _touchStartHandler, { passive: true });

  _touchMoveHandler = function (e) {
    if (state.currentMode !== 'neonrace') return;
    if (e.touches.length > 0) {
      var rect = state.canvas.getBoundingClientRect();
      ptrX = (e.touches[0].clientX - rect.left) * (state.canvas.width / rect.width / (state.dpr || 1));
    }
  };
  state.canvas.addEventListener('touchmove', _touchMoveHandler, { passive: true });

  _touchEndHandler = function (e) {
    if (state.currentMode !== 'neonrace') return;
    ptrDown = false;
    if (gameOver && explosionTimer <= 0) {
      resetGame();
      gameStarted = true;
      lastTime = performance.now();
    } else if (!gameStarted) {
      gameStarted = true;
      lastTime = performance.now();
    }
  };
  state.canvas.addEventListener('touchend', _touchEndHandler, { passive: true });
}

registerMode('neonrace', { init: initRace, render: renderRace, attach: attachRace, cleanup: cleanupRace });
