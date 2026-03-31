import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Asteroids — ASCII space shooter (mouse-controlled)
// Ship at bottom, shoot upward, asteroids fall from top
// ============================================================

var ship = { x: 0, alive: true, invincTimer: 0 };
var bullets = [];
var asteroids = [];
var particles = [];
var score = 0;
var highScore = 0;
var lives = 3;
var gameOver = false;
var gameStarted = false;
var fireTimer = 0;
var spawnTimer = 0;
var difficultyTimer = 0;
var spawnInterval = 1.2;
var asteroidSpeedBase = 0.4;
var combo = 0;
var comboTimer = 0;
var shakeTimer = 0;
var shakeIntensity = 0;
var stars = [];
var lastTime = 0;
var respawnTimer = 0;

// Mouse state
var mouseX = 0.5;
var mouseDown = false;

// Event refs
var _mouseMove = null, _mouseDownH = null, _mouseUpH = null;
var _touchStart = null, _touchMove = null, _touchEnd = null;
var _keyHandler = null;

// Asteroid shapes - clusters of ASCII chars
var LARGE_SHAPES = [
  [' @## ', '#O###', '##@##', '#O###', ' @## '],
  [' ### ', '#@O##', '#####', '##O@#', ' ### '],
  ['  #@ ', ' ####', '#O###', '####O', ' @#  ']
];
var MED_SHAPES = [
  [' ##', '#O#', ' ##'],
  ['##', 'O#', '##'],
  [' # ', '#O#', ' # ']
];
var SMALL_CHARS = ['@', '#', 'O', '*'];

// Ship ASCII art (3 rows)
var SHIP_ART = [
  '  ^  ',
  ' /A\\ ',
  '/===\\'
];

function initGame() {
  try { highScore = parseInt(localStorage.getItem('asteroids_hi') || '0', 10) || 0; } catch(e) { highScore = 0; }
  initStars();
  resetGame();
}

function initStars() {
  stars = [];
  for (var i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * 200,
      y: Math.random() * 60,
      speed: 0.1 + Math.random() * 0.3,
      ch: Math.random() < 0.3 ? '+' : '.',
      bright: 5 + Math.random() * 12
    });
  }
}

function resetGame() {
  var W = state.COLS;
  ship = { x: Math.floor(W / 2), alive: true, invincTimer: 0 };
  bullets = [];
  asteroids = [];
  particles = [];
  score = 0;
  lives = 3;
  gameOver = false;
  gameStarted = false;
  fireTimer = 0;
  spawnTimer = 0;
  difficultyTimer = 0;
  spawnInterval = 1.2;
  asteroidSpeedBase = 0.4;
  combo = 0;
  comboTimer = 0;
  shakeTimer = 0;
  shakeIntensity = 0;
  respawnTimer = 0;
  lastTime = performance.now();
}

function spawnAsteroid() {
  var W = state.COLS;
  var size = Math.random();
  var ast;
  var speed = asteroidSpeedBase + Math.random() * 0.3;
  var drift = (Math.random() - 0.5) * 0.3;

  if (size < 0.3) {
    var shape = LARGE_SHAPES[Math.floor(Math.random() * LARGE_SHAPES.length)];
    ast = {
      x: 2 + Math.random() * (W - 6),
      y: -4,
      vx: drift,
      vy: speed,
      size: 'large',
      hp: 3,
      shape: shape,
      radius: 2.5,
      rotation: Math.random() * 4
    };
  } else if (size < 0.7) {
    var shape = MED_SHAPES[Math.floor(Math.random() * MED_SHAPES.length)];
    ast = {
      x: 1 + Math.random() * (W - 4),
      y: -2,
      vx: drift * 1.3,
      vy: speed * 1.2,
      size: 'medium',
      hp: 2,
      shape: shape,
      radius: 1.5,
      rotation: Math.random() * 4
    };
  } else {
    ast = {
      x: Math.random() * W,
      y: -1,
      vx: drift * 1.5,
      vy: speed * 1.5,
      size: 'small',
      hp: 1,
      shape: null,
      radius: 0.8,
      ch: SMALL_CHARS[Math.floor(Math.random() * SMALL_CHARS.length)],
      rotation: 0
    };
  }

  asteroids.push(ast);
}

function spawnExplosion(x, y, count, hueBase, hueRange) {
  var chars = ['*', '.', '+', '#', 'x', '~', 'o', '@'];
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 0.5 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.5,
      life: 0.3 + Math.random() * 0.5,
      maxLife: 0.3 + Math.random() * 0.5,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: hueBase + Math.random() * hueRange
    });
  }
}

function spawnDebris(x, y, count) {
  var chars = ['#', '@', 'O', '%', '&'];
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 0.3 + Math.random() * 1.5;
    particles.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.8,
      maxLife: 0.5 + Math.random() * 0.8,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: 25 + Math.random() * 20
    });
  }
}

function spawnBulletTrail(x, y) {
  if (Math.random() < 0.3) {
    particles.push({
      x: x + (Math.random() - 0.5) * 0.5,
      y: y + 0.5,
      vx: (Math.random() - 0.5) * 0.2,
      vy: 0.3,
      life: 0.15 + Math.random() * 0.1,
      maxLife: 0.25,
      ch: '.',
      hue: 50
    });
  }
}

function hitAsteroid(ast, idx, bx, by) {
  ast.hp--;
  spawnExplosion(bx, by, 4, 15, 30);

  if (ast.hp <= 0) {
    asteroids.splice(idx, 1);

    var points;
    if (ast.size === 'large') {
      points = 25;
      spawnExplosion(ast.x, ast.y, 18, 10, 40);
      shakeTimer = 0.15;
      shakeIntensity = 2;
      var pieces = 2 + Math.floor(Math.random() * 2);
      for (var i = 0; i < pieces; i++) {
        var a = Math.random() * Math.PI * 2;
        var shape = MED_SHAPES[Math.floor(Math.random() * MED_SHAPES.length)];
        asteroids.push({
          x: ast.x + Math.cos(a) * 2,
          y: ast.y + Math.sin(a) * 1,
          vx: Math.cos(a) * 0.5 + ast.vx,
          vy: ast.vy * 0.8 + Math.random() * 0.2,
          size: 'medium',
          hp: 2,
          shape: shape,
          radius: 1.5,
          rotation: Math.random() * 4
        });
      }
    } else if (ast.size === 'medium') {
      points = 50;
      spawnExplosion(ast.x, ast.y, 12, 15, 35);
      shakeTimer = 0.1;
      shakeIntensity = 1;
      for (var i = 0; i < 2; i++) {
        var a = Math.random() * Math.PI * 2;
        asteroids.push({
          x: ast.x + Math.cos(a),
          y: ast.y,
          vx: Math.cos(a) * 0.6 + ast.vx,
          vy: ast.vy * 0.9 + Math.random() * 0.3,
          size: 'small',
          hp: 1,
          shape: null,
          radius: 0.8,
          ch: SMALL_CHARS[Math.floor(Math.random() * SMALL_CHARS.length)],
          rotation: 0
        });
      }
    } else {
      points = 100;
      spawnExplosion(ast.x, ast.y, 6, 20, 30);
    }

    combo++;
    comboTimer = 2.0;
    var multiplier = Math.min(combo, 10);
    score += points * multiplier;

    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem('asteroids_hi', String(highScore)); } catch(e) {}
    }
  } else {
    spawnDebris(bx, by, 3);
  }
}

function updateGame(dt) {
  var W = state.COLS, H = state.ROWS;
  var shipY = H - 4;

  if (gameOver || !gameStarted) return;

  // Increase difficulty over time
  difficultyTimer += dt;
  if (difficultyTimer > 8) {
    difficultyTimer = 0;
    if (spawnInterval > 0.3) spawnInterval -= 0.05;
    asteroidSpeedBase += 0.02;
  }

  // Ship movement via mouse
  if (ship.alive) {
    var targetX = Math.floor(mouseX * W);
    targetX = Math.max(2, Math.min(W - 3, targetX));
    ship.x += (targetX - ship.x) * 0.2;

    if (ship.invincTimer > 0) ship.invincTimer -= dt;

    // Auto-fire + click rapid fire
    fireTimer -= dt;
    var fireRate = mouseDown ? 0.08 : 0.18;
    if (fireTimer <= 0) {
      fireTimer = fireRate;
      var sx = Math.round(ship.x);
      bullets.push({ x: sx, y: shipY - 1, vy: -1.5, vx: 0 });
      if (mouseDown && Math.random() < 0.3) {
        bullets.push({ x: sx - 1, y: shipY - 1, vy: -1.4, vx: -0.15 });
        bullets.push({ x: sx + 1, y: shipY - 1, vy: -1.4, vx: 0.15 });
      }
    }
  } else {
    // Respawn logic
    respawnTimer -= dt;
    if (respawnTimer <= 0 && lives > 0) {
      ship.alive = true;
      ship.invincTimer = 2.0;
      ship.x = Math.floor(W / 2);
    }
  }

  // Spawn asteroids
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = spawnInterval;
    spawnAsteroid();
    if (spawnInterval < 0.7 && Math.random() < 0.3) {
      spawnAsteroid();
    }
  }

  // Update bullets
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    b.y += b.vy;
    if (b.vx) b.x += b.vx;
    spawnBulletTrail(b.x, b.y);

    if (b.y < -1) { bullets.splice(i, 1); continue; }

    var hit = false;
    for (var j = asteroids.length - 1; j >= 0; j--) {
      var ast = asteroids[j];
      var dx = Math.abs(b.x - ast.x);
      var dy = Math.abs(b.y - ast.y);
      if (dx < ast.radius + 0.8 && dy < ast.radius + 0.5) {
        hitAsteroid(ast, j, b.x, b.y);
        hit = true;
        break;
      }
    }
    if (hit) { bullets.splice(i, 1); }
  }

  // Update asteroids
  for (var j = asteroids.length - 1; j >= 0; j--) {
    var ast = asteroids[j];
    ast.x += ast.vx;
    ast.y += ast.vy;
    ast.rotation += dt * 0.5;

    // Horizontal wrap
    if (ast.x < -3) ast.x += W + 6;
    if (ast.x > W + 3) ast.x -= W + 6;

    // Off bottom - remove
    if (ast.y > H + 5) {
      asteroids.splice(j, 1);
      continue;
    }

    // Ship collision
    if (ship.alive && ship.invincTimer <= 0) {
      var dx = Math.abs(ast.x - ship.x);
      var dy = Math.abs(ast.y - shipY);
      if (dx < ast.radius + 1.5 && dy < ast.radius + 1) {
        ship.alive = false;
        lives--;
        combo = 0;
        comboTimer = 0;
        spawnExplosion(ship.x, shipY, 25, 0, 40);
        shakeTimer = 0.3;
        shakeIntensity = 3;

        if (lives <= 0) {
          gameOver = true;
        } else {
          respawnTimer = 1.2;
        }
        break;
      }
    }
  }

  // Update particles
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Combo timer
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
  }

  // Screen shake decay
  if (shakeTimer > 0) shakeTimer -= dt;

  // Stars scroll
  for (var i = 0; i < stars.length; i++) {
    stars[i].y += stars[i].speed * dt * 60;
    if (stars[i].y > state.ROWS) {
      stars[i].y = 0;
      stars[i].x = Math.random() * state.COLS;
    }
  }
}

function drawText(text, x, y, hue, sat, bright) {
  for (var i = 0; i < text.length; i++) {
    if (text[i] !== ' ') {
      drawCharHSL(text[i], x + i, y, hue, sat, bright);
    }
  }
}

function drawCenteredText(text, y, hue, sat, bright) {
  var x = Math.floor(state.COLS / 2 - text.length / 2);
  drawText(text, x, y, hue, sat, bright);
}

function renderGame() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var shipY = H - 4;

  // Delta time
  var now = performance.now();
  var dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  updateGame(dt);

  // Screen shake offset
  var shakeX = 0, shakeY = 0;
  if (shakeTimer > 0) {
    shakeX = Math.round((Math.random() - 0.5) * shakeIntensity);
    shakeY = Math.round((Math.random() - 0.5) * shakeIntensity * 0.5);
  }

  // Starfield background
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var sx = Math.floor(s.x) + shakeX;
    var sy = Math.floor(s.y) + shakeY;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      var twinkle = s.bright + Math.sin(t * 2 + i * 1.7) * 3;
      drawCharHSL(s.ch, sx, sy, 220, 10, Math.max(3, twinkle));
    }
  }

  // Asteroids
  for (var j = 0; j < asteroids.length; j++) {
    var ast = asteroids[j];
    var ax = Math.round(ast.x) + shakeX;
    var ay = Math.round(ast.y) + shakeY;

    if (ast.shape) {
      var shape = ast.shape;
      var hw = Math.floor(shape[0].length / 2);
      var hh = Math.floor(shape.length / 2);
      for (var r = 0; r < shape.length; r++) {
        for (var c = 0; c < shape[r].length; c++) {
          var ch = shape[r][c];
          if (ch === ' ') continue;
          var px = ax - hw + c;
          var py = ay - hh + r;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            var astHue, astSat, astBright;
            if (ch === 'O') {
              astHue = 30; astSat = 40; astBright = 45;
            } else if (ch === '@') {
              astHue = 20; astSat = 30; astBright = 50;
            } else {
              astHue = 0; astSat = 0; astBright = 40 + Math.random() * 8;
            }
            // Flash when damaged
            if (ast.hp < (ast.size === 'large' ? 3 : 2)) {
              astBright += Math.sin(t * 12) * 10;
            }
            drawCharHSL(ch, px, py, astHue, astSat, astBright);
          }
        }
      }
    } else {
      // Small asteroid
      if (ax >= 0 && ax < W && ay >= 0 && ay < H) {
        var pulse = Math.sin(t * 6 + j * 2) * 5;
        drawCharHSL(ast.ch, ax, ay, 30, 25, 45 + pulse);
      }
    }
  }

  // Bullets
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    var bx = Math.round(b.x) + shakeX;
    var by = Math.round(b.y) + shakeY;
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      drawCharHSL('|', bx, by, 55, 90, 75);
      if (by - 1 >= 0) {
        drawCharHSL('.', bx, by - 1, 55, 70, 40);
      }
    }
  }

  // Ship
  if (ship.alive) {
    var show = true;
    if (ship.invincTimer > 0) {
      show = Math.sin(ship.invincTimer * 15) > 0;
    }
    if (show) {
      var sx = Math.round(ship.x) + shakeX;
      for (var r = 0; r < SHIP_ART.length; r++) {
        var row = SHIP_ART[r];
        var startX = sx - Math.floor(row.length / 2);
        for (var c = 0; c < row.length; c++) {
          var ch = row[c];
          if (ch === ' ') continue;
          var px = startX + c;
          var py = shipY + r + shakeY;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            var shipHue = 190;
            var shipSat = 80;
            var shipBright = 65;
            if (ch === '^') { shipBright = 80; }
            else if (ch === 'A') { shipHue = 200; shipBright = 70; }
            else if (ch === '=') { shipHue = 185; shipBright = 55; }
            else if (ch === '/' || ch === '\\') { shipHue = 195; shipBright = 60; }
            drawCharHSL(ch, px, py, shipHue, shipSat, shipBright);
          }
        }
      }
      // Engine flame
      var flameChars = ['^', 'W', 'w', '.'];
      var flameY = shipY + 3 + shakeY;
      if (flameY >= 0 && flameY < H) {
        var fch = flameChars[Math.floor(t * 12) % flameChars.length];
        if (sx >= 0 && sx < W) {
          drawCharHSL(fch, sx, flameY, 25 + Math.random() * 20, 90, 55 + Math.random() * 20);
        }
        if (sx - 1 >= 0 && sx - 1 < W && Math.random() < 0.5) {
          drawCharHSL('.', sx - 1, flameY, 15, 80, 35);
        }
        if (sx + 1 >= 0 && sx + 1 < W && Math.random() < 0.5) {
          drawCharHSL('.', sx + 1, flameY, 15, 80, 35);
        }
      }
    }
  }

  // Particles
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x) + shakeX;
    var py = Math.round(p.y) + shakeY;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, px, py, p.hue, 80, 15 + alpha * 55);
    }
  }

  // HUD
  var scoreStr = 'SCORE ' + score;
  drawText(scoreStr, 1, 2, 55, 70, 65);

  var hiStr = 'HI ' + highScore;
  drawText(hiStr, Math.floor(W / 2 - hiStr.length / 2), 2, 55, 40, 45);

  // Lives display
  var livesStr = 'x' + lives;
  var livesX = W - livesStr.length - 1 - lives * 2;
  for (var i = 0; i < lives; i++) {
    drawCharHSL('^', livesX + i * 2, 2, 190, 80, 65);
  }
  drawText(livesStr, W - livesStr.length - 1, 2, 190, 60, 55);

  // Combo indicator
  if (combo > 1 && comboTimer > 0) {
    var comboStr = combo + 'x COMBO!';
    var comboAlpha = Math.min(1, comboTimer);
    var comboBright = 45 + Math.sin(t * 8) * 15;
    drawCenteredText(comboStr, 2, 30, 90, comboBright * comboAlpha);
  }

  // Difficulty wave indicator
  var diffLevel = Math.floor((1.2 - spawnInterval) / 0.05) + 1;
  if (diffLevel > 1 && gameStarted && !gameOver) {
    var diffStr = 'WAVE ' + diffLevel;
    drawText(diffStr, W - diffStr.length - 1, 1, 280, 40, 30);
  }

  // Game over screen
  if (gameOver) {
    var cy = Math.floor(H / 2);

    // Border box
    var boxW = 24;
    var boxH = 9;
    var boxX = Math.floor(W / 2 - boxW / 2);
    var boxY = cy - 4;
    for (var r = 0; r < boxH; r++) {
      for (var c = 0; c < boxW; c++) {
        var px = boxX + c;
        var py = boxY + r;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          if (r === 0 || r === boxH - 1) {
            drawCharHSL('-', px, py, 0, 60, 25);
          } else if (c === 0 || c === boxW - 1) {
            drawCharHSL('|', px, py, 0, 60, 25);
          }
        }
      }
    }

    var goBright = 50 + Math.sin(t * 3) * 15;
    drawCenteredText('GAME OVER', cy - 3, 0, 70, goBright);
    drawCenteredText('SCORE: ' + score, cy - 1, 55, 70, 60);
    drawCenteredText('HIGH: ' + highScore, cy, 55, 50, 50);
    if (score >= highScore && score > 0) {
      drawCenteredText('NEW HIGH SCORE!', cy + 1, 50, 90, 50 + Math.sin(t * 5) * 15);
    }
    drawCenteredText('CLICK TO RESTART', cy + 3, 200, 50, 35 + Math.sin(t * 2) * 10);
  }

  // Start screen
  if (!gameStarted && !gameOver) {
    var cy = Math.floor(H / 2);

    // Title with color wave
    var title = 'A S T E R O I D S';
    var tx = Math.floor(W / 2 - title.length / 2);
    for (var i = 0; i < title.length; i++) {
      if (title[i] === ' ') continue;
      var letterHue = 190 + Math.sin(t * 2 + i * 0.5) * 30;
      var letterBright = 55 + Math.sin(t * 3 + i * 0.3) * 15;
      drawCharHSL(title[i], tx + i, cy - 4, letterHue, 80, letterBright);
    }

    drawCenteredText('MOUSE TO MOVE', cy - 1, 0, 0, 40);
    drawCenteredText('CLICK FOR RAPID FIRE', cy, 0, 0, 40);
    drawCenteredText('DESTROY THE ASTEROIDS!', cy + 2, 30, 50, 40);

    if (highScore > 0) {
      drawCenteredText('HIGH SCORE: ' + highScore, cy + 4, 55, 50, 35);
    }

    var startBright = 40 + Math.sin(t * 2.5) * 12;
    drawCenteredText('CLICK TO START', cy + 6, 190, 60, startBright);

    // Decorative floating asteroids
    var demoAsts = [
      { x: Math.floor(W * 0.15), y: cy - 2, ch: '@' },
      { x: Math.floor(W * 0.85), y: cy - 1, ch: '#' },
      { x: Math.floor(W * 0.2), y: cy + 3, ch: 'O' },
      { x: Math.floor(W * 0.8), y: cy + 2, ch: '*' }
    ];
    for (var i = 0; i < demoAsts.length; i++) {
      var d = demoAsts[i];
      var bob = Math.sin(t * 1.5 + i * 1.2) * 1;
      var dy = Math.round(d.y + bob);
      if (d.x >= 0 && d.x < W && dy >= 0 && dy < H) {
        drawCharHSL(d.ch, d.x, dy, 25, 30, 35 + Math.sin(t + i) * 8);
      }
    }
  }
}

function cleanupAsteroids() {
  if (_mouseMove) { window.removeEventListener('mousemove', _mouseMove); _mouseMove = null; }
  if (_mouseDownH) { window.removeEventListener('mousedown', _mouseDownH); _mouseDownH = null; }
  if (_mouseUpH) { window.removeEventListener('mouseup', _mouseUpH); _mouseUpH = null; }
  if (_touchStart && state.canvas) { state.canvas.removeEventListener('touchstart', _touchStart); _touchStart = null; }
  if (_touchMove && state.canvas) { state.canvas.removeEventListener('touchmove', _touchMove); _touchMove = null; }
  if (_touchEnd && state.canvas) { state.canvas.removeEventListener('touchend', _touchEnd); _touchEnd = null; }
  if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  mouseDown = false;
}

function attachAsteroids() {
  cleanupAsteroids();

  _mouseMove = function(e) {
    if (state.currentMode !== 'asteroids') return;
    mouseX = e.clientX / window.innerWidth;
  };
  window.addEventListener('mousemove', _mouseMove);

  _mouseDownH = function(e) {
    if (state.currentMode !== 'asteroids') return;
    mouseDown = true;
    mouseX = e.clientX / window.innerWidth;

    if (gameOver) { resetGame(); gameStarted = true; lastTime = performance.now(); return; }
    if (!gameStarted) { gameStarted = true; lastTime = performance.now(); return; }
  };
  window.addEventListener('mousedown', _mouseDownH);

  _mouseUpH = function(e) {
    if (state.currentMode !== 'asteroids') return;
    mouseDown = false;
  };
  window.addEventListener('mouseup', _mouseUpH);

  // Touch support
  _touchStart = function(e) {
    if (state.currentMode !== 'asteroids') return;
    e.preventDefault();
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX / window.innerWidth;
      mouseDown = true;
    }
    if (gameOver) { resetGame(); gameStarted = true; lastTime = performance.now(); return; }
    if (!gameStarted) { gameStarted = true; lastTime = performance.now(); return; }
  };
  state.canvas.addEventListener('touchstart', _touchStart, { passive: false });

  _touchMove = function(e) {
    if (state.currentMode !== 'asteroids') return;
    e.preventDefault();
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX / window.innerWidth;
    }
  };
  state.canvas.addEventListener('touchmove', _touchMove, { passive: false });

  _touchEnd = function(e) {
    if (state.currentMode !== 'asteroids') return;
    mouseDown = false;
  };
  state.canvas.addEventListener('touchend', _touchEnd, { passive: false });

  _keyHandler = function(e) {
    if (state.currentMode !== 'asteroids') return;
    if (gameOver) { resetGame(); gameStarted = true; lastTime = performance.now(); return; }
    if (!gameStarted) { gameStarted = true; lastTime = performance.now(); return; }
  };
  window.addEventListener('keydown', _keyHandler);
}

registerMode('asteroids', { init: initGame, render: renderGame, attach: attachAsteroids, cleanup: cleanupAsteroids });
