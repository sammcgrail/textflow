import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Snake Game — classic ASCII snake with polish
// ============================================================

var snake = [];
var direction = { x: 1, y: 0 };
var nextDirection = { x: 1, y: 0 };
var food = { x: 0, y: 0 };
var score = 0;
var highScore = 0;
var gameOver = false;
var paused = false;
var tickInterval = 150;
var lastTick = 0;
var foodEaten = 0;
var gameStarted = false;

// Play area bounds (inside walls)
var areaLeft = 1, areaTop = 2, areaRight = 0, areaBottom = 0;

// Particles
var particles = [];
var deathParticles = [];
var deathAnimTimer = 0;
var DEATH_ANIM_DURATION = 1.5;

// Food pulse
var foodPulseTime = 0;

// Touch
var touchStartX = 0, touchStartY = 0;

// Event handler refs for cleanup
var _keyHandler = null;
var _touchStartHandler = null;
var _touchEndHandler = null;

function initSnake() {
  try { highScore = parseInt(localStorage.getItem('snakegame_hi') || '0', 10) || 0; } catch(e) { highScore = 0; }
  resetGame();
}

function resetGame() {
  areaRight = state.COLS - 2;
  areaBottom = state.ROWS - 2;
  var cx = Math.floor((areaLeft + areaRight) / 2);
  var cy = Math.floor((areaTop + areaBottom) / 2);
  snake = [];
  for (var i = 4; i >= 0; i--) {
    snake.push({ x: cx - i, y: cy });
  }
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  foodEaten = 0;
  tickInterval = 150;
  gameOver = false;
  gameStarted = false;
  particles = [];
  deathParticles = [];
  deathAnimTimer = 0;
  lastTick = 0;
  spawnFood();
}

function spawnFood() {
  var tries = 0;
  while (tries < 500) {
    var fx = areaLeft + Math.floor(Math.random() * (areaRight - areaLeft + 1));
    var fy = areaTop + Math.floor(Math.random() * (areaBottom - areaTop + 1));
    var onSnake = false;
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === fx && snake[i].y === fy) { onSnake = true; break; }
    }
    if (!onSnake) { food = { x: fx, y: fy }; return; }
    tries++;
  }
  food = { x: areaLeft + 2, y: areaTop + 2 };
}

function spawnEatParticles(x, y) {
  var chars = ['*', '.', '+', 'o', '~'];
  for (var i = 0; i < 12; i++) {
    var angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
    var speed = 1.5 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 0.6 + Math.random() * 0.4,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: 30 + Math.random() * 30
    });
  }
}

function spawnDeathParticles() {
  var chars = ['#', '.', '~', '*', '+', 'x'];
  for (var i = 0; i < snake.length; i++) {
    var s = snake[i];
    for (var j = 0; j < 3; j++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 0.5 + Math.random() * 2;
      deathParticles.push({
        x: s.x, y: s.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.7,
        maxLife: 0.8 + Math.random() * 0.7,
        ch: chars[Math.floor(Math.random() * chars.length)],
        hue: 90 + Math.random() * 40
      });
    }
  }
}

function gameTick() {
  direction = { x: nextDirection.x, y: nextDirection.y };
  var head = snake[snake.length - 1];
  var nx = head.x + direction.x;
  var ny = head.y + direction.y;

  // Wall collision
  if (nx < areaLeft || nx > areaRight || ny < areaTop || ny > areaBottom) {
    gameOver = true;
    spawnDeathParticles();
    deathAnimTimer = DEATH_ANIM_DURATION;
    return;
  }

  // Self collision
  for (var i = 0; i < snake.length; i++) {
    if (snake[i].x === nx && snake[i].y === ny) {
      gameOver = true;
      spawnDeathParticles();
      deathAnimTimer = DEATH_ANIM_DURATION;
      return;
    }
  }

  snake.push({ x: nx, y: ny });

  // Eat food
  if (nx === food.x && ny === food.y) {
    score += 10;
    foodEaten++;
    spawnEatParticles(food.x, food.y);
    if (foodEaten % 5 === 0 && tickInterval > 60) {
      tickInterval -= 12;
    }
    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem('snakegame_hi', String(highScore)); } catch(e) {}
    }
    spawnFood();
  } else {
    snake.shift();
  }
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (var i = deathParticles.length - 1; i >= 0; i--) {
    var p = deathParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) deathParticles.splice(i, 1);
  }
  if (deathAnimTimer > 0) deathAnimTimer -= dt;
}

function renderSnake() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var now = performance.now();

  // Update tick
  if (!gameOver && gameStarted) {
    if (now - lastTick >= tickInterval) {
      gameTick();
      lastTick = now;
    }
  }

  // dt for particles
  var dt = 1 / 60;
  updateParticles(dt);
  foodPulseTime += dt;

  // Background pattern (dim dots)
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if ((x + y) % 4 === 0) {
        drawCharHSL('.', x, y, 240, 10, 8);
      }
    }
  }

  // Walls — box-drawing chars
  var wallHue = 220;
  var wallSat = 40;
  var wallBright = 25;
  // Top and bottom
  for (var x = 0; x < W; x++) {
    if (x === 0) {
      drawCharHSL('+', x, areaTop - 1, wallHue, wallSat, wallBright);
      drawCharHSL('+', x, areaBottom + 1, wallHue, wallSat, wallBright);
    } else if (x === W - 1) {
      drawCharHSL('+', x, areaTop - 1, wallHue, wallSat, wallBright);
      drawCharHSL('+', x, areaBottom + 1, wallHue, wallSat, wallBright);
    } else {
      drawCharHSL('-', x, areaTop - 1, wallHue, wallSat, wallBright);
      drawCharHSL('-', x, areaBottom + 1, wallHue, wallSat, wallBright);
    }
  }
  // Left and right
  for (var y = areaTop; y <= areaBottom; y++) {
    drawCharHSL('|', 0, y, wallHue, wallSat, wallBright);
    drawCharHSL('|', W - 1, y, wallHue, wallSat, wallBright);
  }

  // Score display
  var scoreStr = 'SCORE: ' + score + '  HI: ' + highScore;
  for (var i = 0; i < scoreStr.length; i++) {
    drawCharHSL(scoreStr[i], 2 + i, 2, 60, 60, 70);
  }

  // Speed display
  var speedStr = 'SPEED: ' + (11 - Math.floor(tickInterval / 15));
  for (var i = 0; i < speedStr.length; i++) {
    drawCharHSL(speedStr[i], W - speedStr.length - 2 + i, 2, 180, 40, 50);
  }

  if (!gameOver || deathAnimTimer > 0) {
    // Food (pulsing red/gold)
    if (!gameOver) {
      var pulse = Math.sin(foodPulseTime * 4) * 0.5 + 0.5;
      var foodHue = 0 + pulse * 45; // red to gold
      var foodBright = 50 + pulse * 25;
      drawCharHSL('*', food.x, food.y, foodHue, 90, foodBright);
      // Glow around food
      var glowChars = ['.', '.', '.', '.'];
      var glowDirs = [[-1,0],[1,0],[0,-1],[0,1]];
      for (var g = 0; g < 4; g++) {
        var gx = food.x + glowDirs[g][0];
        var gy = food.y + glowDirs[g][1];
        if (gx >= areaLeft && gx <= areaRight && gy >= areaTop && gy <= areaBottom) {
          drawCharHSL(glowChars[g], gx, gy, foodHue, 60, 20 + pulse * 10);
        }
      }
    }

    // Snake body (during death animation, show dissolving)
    if (!gameOver) {
      for (var i = 0; i < snake.length; i++) {
        var s = snake[i];
        var isHead = (i === snake.length - 1);
        var ratio = i / Math.max(1, snake.length - 1); // 0=tail, 1=head
        var snakeHue = 120; // green
        var snakeSat = 70 + ratio * 20;
        var snakeBright = 25 + ratio * 40;
        var ch = isHead ? '@' : '#';
        drawCharHSL(ch, s.x, s.y, snakeHue, snakeSat, snakeBright);
      }
    }
  }

  // Death particles
  for (var i = 0; i < deathParticles.length; i++) {
    var p = deathParticles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, px, py, p.hue, 60, 20 + alpha * 40);
    }
  }

  // Eat particles
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, px, py, p.hue, 80, 30 + alpha * 45);
    }
  }

  // Game over screen
  if (gameOver && deathAnimTimer <= 0) {
    var lines = [
      'GAME OVER',
      '',
      'SCORE: ' + score,
      'HIGH SCORE: ' + highScore,
      '',
      'TAP OR PRESS ANY KEY'
    ];
    var startY = Math.floor(H / 2 - lines.length / 2);
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var sx = Math.floor(W / 2 - line.length / 2);
      for (var c = 0; c < line.length; c++) {
        if (line[c] !== ' ') {
          var hue = l === 0 ? 0 : (l === 2 || l === 3) ? 60 : 200;
          var bright = l === 0 ? (50 + Math.sin(t * 3) * 15) : 55;
          drawCharHSL(line[c], sx + c, startY + l, hue, 60, bright);
        }
      }
    }
  }

  // Start screen
  if (!gameStarted && !gameOver) {
    var lines = [
      'SNAKE',
      '',
      'ARROWS / WASD / SWIPE',
      '',
      'TAP OR PRESS TO START'
    ];
    var startY = Math.floor(H / 2 - lines.length / 2) - 3;
    for (var l = 0; l < lines.length; l++) {
      var line = lines[l];
      var sx = Math.floor(W / 2 - line.length / 2);
      for (var c = 0; c < line.length; c++) {
        if (line[c] !== ' ') {
          var hue = l === 0 ? 120 : 180;
          var bright = l === 0 ? (50 + Math.sin(t * 2) * 15) : 45;
          drawCharHSL(line[c], sx + c, startY + l, hue, 70, bright);
        }
      }
    }
  }
}

function cleanupSnake() {
  if (_keyHandler) { window.removeEventListener('keydown', _keyHandler); _keyHandler = null; }
  if (_touchStartHandler && state.canvas) { state.canvas.removeEventListener('touchstart', _touchStartHandler); _touchStartHandler = null; }
  if (_touchEndHandler && state.canvas) { state.canvas.removeEventListener('touchend', _touchEndHandler); _touchEndHandler = null; }
}

function attachSnake() {
  cleanupSnake();

  _keyHandler = function(e) {
    if (state.currentMode !== 'snakegame') return;

    if (gameOver && deathAnimTimer <= 0) {
      resetGame();
      gameStarted = true;
      lastTick = performance.now();
      return;
    }
    if (!gameStarted) {
      gameStarted = true;
      lastTick = performance.now();
    }

    var key = e.key;
    if ((key === 'ArrowUp' || key === 'w' || key === 'W') && direction.y !== 1) {
      nextDirection = { x: 0, y: -1 }; e.preventDefault();
    } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && direction.y !== -1) {
      nextDirection = { x: 0, y: 1 }; e.preventDefault();
    } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && direction.x !== 1) {
      nextDirection = { x: -1, y: 0 }; e.preventDefault();
    } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && direction.x !== -1) {
      nextDirection = { x: 1, y: 0 }; e.preventDefault();
    }
  };
  window.addEventListener('keydown', _keyHandler);

  _touchStartHandler = function(e) {
    if (state.currentMode !== 'snakegame') return;
    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  };
  state.canvas.addEventListener('touchstart', _touchStartHandler, { passive: true });

  _touchEndHandler = function(e) {
    if (state.currentMode !== 'snakegame') return;

    if (gameOver && deathAnimTimer <= 0) {
      resetGame();
      gameStarted = true;
      lastTick = performance.now();
      return;
    }
    if (!gameStarted) {
      gameStarted = true;
      lastTick = performance.now();
      return;
    }

    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var dx = endX - touchStartX;
    var dy = endY - touchStartY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);
    if (absDx < 15 && absDy < 15) return; // too small, ignore

    if (absDx > absDy) {
      // horizontal swipe
      if (dx > 0 && direction.x !== -1) nextDirection = { x: 1, y: 0 };
      else if (dx < 0 && direction.x !== 1) nextDirection = { x: -1, y: 0 };
    } else {
      // vertical swipe
      if (dy > 0 && direction.y !== -1) nextDirection = { x: 0, y: 1 };
      else if (dy < 0 && direction.y !== 1) nextDirection = { x: 0, y: -1 };
    }
  };
  state.canvas.addEventListener('touchend', _touchEndHandler, { passive: true });
}

registerMode('snakegame', { init: initSnake, render: renderSnake, attach: attachSnake, cleanup: cleanupSnake });
