import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var tiltX = 0;
var rawGamma = 0;
var hasMotion = false;
var mouseX = 0.5;
var frameCount = 0;

// Game state
var ballPos = 0; // position along platform (-1 to 1, 0 = center)
var ballVel = 0;
var score = 0;
var highScore = 0;
var lives = 5;
var level = 1;
var gameOver = false;
var fellTimer = 0;
var levelUpTimer = 0;
var platformWidth = 0.6;
var ballSpeed = 1.0;

// Wind
var windForce = 0;
var windTimer = 0;
var windParticles = [];

// Mountains (parallax)
var mountains = [];

function handleOrientation(e) {
  rawGamma = e.gamma || 0;
  hasMotion = true;
}

function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(s) {
      if (s === 'granted') window.addEventListener('deviceorientation', handleOrientation);
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
  }
}

function handleMouseMove(e) {
  mouseX = e.clientX / window.innerWidth;
}

function handleTap() {
  if (gameOver) {
    resetGame();
  }
}

function resetGame() {
  ballPos = 0;
  ballVel = 0;
  score = 0;
  lives = 5;
  level = 1;
  gameOver = false;
  fellTimer = 0;
  levelUpTimer = 0;
  platformWidth = 0.6;
  ballSpeed = 1.0;
  windForce = 0;
  windTimer = 0;
  windParticles = [];
}

function respawnBall() {
  ballPos = 0;
  ballVel = 0;
  fellTimer = 30;
}

function generateMountains() {
  mountains = [];
  var W = state.COLS;
  // Back layer
  for (var x = 0; x < W; x++) {
    var h = 4 + Math.sin(x * 0.08) * 3 + Math.sin(x * 0.15) * 2;
    mountains.push({ x: x, h: Math.floor(h), layer: 0 });
  }
  // Front layer
  for (var x = 0; x < W; x++) {
    var h = 2 + Math.sin(x * 0.12 + 1) * 2 + Math.sin(x * 0.2 + 3) * 1.5;
    mountains.push({ x: x, h: Math.floor(h), layer: 1 });
  }
}

function initTiltBalance() {
  frameCount = 0;
  tiltX = 0;
  rawGamma = 0;
  hasMotion = false;
  mouseX = 0.5;
  resetGame();
  generateMountains();

  requestMotionPermission();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('click', handleTap);
  window.addEventListener('touchstart', handleTap);
}

function renderTiltBalance() {
  clearCanvas();
  frameCount++;

  var W = state.COLS;
  var H = state.ROWS;

  // Compute tilt
  var targetX;
  if (hasMotion) {
    targetX = rawGamma / 40.0;
    if (targetX > 1) targetX = 1;
    if (targetX < -1) targetX = -1;
  } else {
    targetX = (mouseX - 0.5) * 2;
  }
  tiltX = tiltX * 0.82 + targetX * 0.18;

  // --- Sky gradient ---
  for (var y = 0; y < H; y++) {
    var skyHue = 230 + y * 0.5;
    var skyLight = 8 + (y / H) * 6;
    if (y % 3 === 0) {
      for (var x = 0; x < W; x += 8 + Math.floor(Math.sin(x + y) * 3)) {
        drawCharHSL(x, y, '.', skyHue, 15, skyLight, 0.15);
      }
    }
  }

  // --- Mountains with parallax ---
  var baseY = H - 1;
  for (var i = 0; i < mountains.length; i++) {
    var m = mountains[i];
    var parallax = m.layer === 0 ? tiltX * 2 : tiltX * 5;
    var mx = Math.round(m.x + parallax) % W;
    if (mx < 0) mx += W;
    var mHue = m.layer === 0 ? 270 : 280;
    var mLight = m.layer === 0 ? 15 : 20;
    var mChar = m.layer === 0 ? '.' : '^';
    for (var dy = 0; dy < m.h; dy++) {
      var my = baseY - 6 - dy;
      if (my >= 0 && my < H && mx >= 0 && mx < W) {
        drawCharHSL(mx, my, mChar, mHue, 30, mLight, 0.5 + m.layer * 0.2);
      }
    }
  }

  if (!gameOver) {
    if (fellTimer > 0) {
      fellTimer--;
    } else {
      // Score increases
      score++;

      // Center bonus
      if (Math.abs(ballPos) < 0.2) {
        score++;
      }

      // Level check
      if (score > 0 && score % 500 === 0) {
        level++;
        levelUpTimer = 40;
        platformWidth = Math.max(0.25, platformWidth - 0.04);
        ballSpeed = Math.min(2.5, ballSpeed + 0.15);
      }
    }

    // Wind
    windTimer--;
    if (windTimer <= 0) {
      windForce = (Math.random() - 0.5) * 0.008 * level;
      windTimer = 60 + Math.floor(Math.random() * 120);
      // Spawn wind particles
      if (Math.abs(windForce) > 0.002) {
        for (var wp = 0; wp < 5; wp++) {
          windParticles.push({
            x: windForce > 0 ? 0 : W - 1,
            y: Math.floor(Math.random() * H),
            life: 30 + Math.floor(Math.random() * 20)
          });
        }
      }
    }

    // Physics
    if (fellTimer <= 0) {
      var gravity = tiltX * 0.006 * ballSpeed;
      ballVel += gravity + windForce;
      ballVel *= 0.985;
      ballPos += ballVel;
    }

    // Check if ball fell off
    if (Math.abs(ballPos) > 1.0 && fellTimer <= 0) {
      lives--;
      if (lives <= 0) {
        gameOver = true;
        if (score > highScore) highScore = score;
      } else {
        respawnBall();
      }
    }
  }

  // --- Draw platform ---
  var platY = Math.floor(H * 0.6);
  var platHalfW = Math.floor(W * platformWidth * 0.5);
  var platCenterX = Math.floor(W / 2);

  for (var px = -platHalfW; px <= platHalfW; px++) {
    var screenX = platCenterX + px;
    // Tilt offset: left/right end goes up/down
    var tiltOffset = Math.round((px / platHalfW) * tiltX * 3);
    var screenY = platY + tiltOffset;
    if (screenX >= 0 && screenX < W && screenY >= 0 && screenY < H) {
      var platHue = 25;
      var platLight = 45 + Math.sin(px * 0.3 + frameCount * 0.02) * 5;
      var platChar = (px % 3 === 0) ? '=' : '-';
      drawCharHSL(screenX, screenY, platChar, platHue, 70, platLight, 0.95);
    }
  }

  // --- Draw ball ---
  if (!gameOver && fellTimer <= 0) {
    var ballScreenX = platCenterX + Math.round(ballPos * platHalfW);
    var ballTiltOffset = Math.round(ballPos * tiltX * 3);
    var ballScreenY = platY + ballTiltOffset - 1;

    // Trail
    for (var t = 1; t <= 3; t++) {
      var trailX = ballScreenX - Math.round(ballVel * t * 8);
      if (trailX >= 0 && trailX < W && ballScreenY >= 0 && ballScreenY < H) {
        drawCharHSL(trailX, ballScreenY, '.', 50, 70, 50, 0.3 / t);
      }
    }

    // Ball
    if (ballScreenX >= 0 && ballScreenX < W && ballScreenY >= 0 && ballScreenY < H) {
      var ballHue = 50;
      var ballLight = 60;
      // Golden glow in center
      if (Math.abs(ballPos) < 0.2) {
        ballHue = 45;
        ballLight = 70 + Math.sin(frameCount * 0.1) * 10;
        // Glow
        if (ballScreenX > 0) drawCharHSL(ballScreenX - 1, ballScreenY, '*', 45, 60, 45, 0.3);
        if (ballScreenX < W - 1) drawCharHSL(ballScreenX + 1, ballScreenY, '*', 45, 60, 45, 0.3);
      }
      drawCharHSL(ballScreenX, ballScreenY, 'O', ballHue, 80, ballLight, 1.0);
    }
  }

  // --- Wind particles ---
  var aliveWind = [];
  for (var i = 0; i < windParticles.length; i++) {
    var wp = windParticles[i];
    wp.x += windForce > 0 ? 1.5 : -1.5;
    wp.life--;
    if (wp.life > 0 && wp.x >= 0 && wp.x < W) {
      var wpx = Math.round(wp.x);
      if (wpx >= 0 && wpx < W) {
        drawCharHSL(wpx, wp.y, '~', 200, 30, 50, wp.life / 40);
      }
      aliveWind.push(wp);
    }
  }
  windParticles = aliveWind;

  // --- HUD ---
  // Score
  var scoreStr = 'Score:' + score;
  for (var c = 0; c < scoreStr.length; c++) {
    drawCharHSL(1 + c, 0, scoreStr[c], 40, 60, 60, 0.9);
  }

  // Lives
  for (var l = 0; l < lives; l++) {
    drawCharHSL(W - 2 - l * 2, 0, 'o', 0, 80, 55, 0.9);
  }

  // Level
  var lvlStr = 'Lv' + level;
  for (var c = 0; c < lvlStr.length; c++) {
    drawCharHSL(Math.floor(W / 2 - 1) + c, 0, lvlStr[c], 280, 50, 55, 0.8);
  }

  // Fell message
  if (fellTimer > 0) {
    var fellStr = 'FELL!';
    var fx = Math.floor(W / 2 - 2);
    var fy = Math.floor(H / 2);
    for (var c = 0; c < fellStr.length; c++) {
      drawCharHSL(fx + c, fy, fellStr[c], 0, 90, 55, fellTimer / 30);
    }
  }

  // Level up message
  if (levelUpTimer > 0) {
    levelUpTimer--;
    var luStr = 'LEVEL UP!';
    var lx = Math.floor(W / 2 - 4);
    var ly = Math.floor(H / 2 - 2);
    for (var c = 0; c < luStr.length; c++) {
      drawCharHSL(lx + c, ly, luStr[c], 120, 80, 55 + Math.sin(frameCount * 0.2) * 15, levelUpTimer / 40);
    }
  }

  // Game over
  if (gameOver) {
    var goLines = ['GAME OVER', 'Score: ' + score, 'Best: ' + highScore, '', 'Tap to restart'];
    var goY = Math.floor(H / 2 - 2);
    for (var line = 0; line < goLines.length; line++) {
      var goStr = goLines[line];
      var gx = Math.floor(W / 2 - goStr.length / 2);
      for (var c = 0; c < goStr.length; c++) {
        var goHue = line === 0 ? 0 : 40;
        var goSat = line === 0 ? 80 : 50;
        drawCharHSL(gx + c, goY + line, goStr[c], goHue, goSat, 55, 0.9);
      }
    }
  }
}

function cleanupTiltBalance() {
  window.removeEventListener('deviceorientation', handleOrientation);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('click', handleTap);
  window.removeEventListener('touchstart', handleTap);
  windParticles = [];
  mountains = [];
}

registerMode('tiltbalance', {
  init: initTiltBalance,
  render: renderTiltBalance,
  cleanup: cleanupTiltBalance
});
