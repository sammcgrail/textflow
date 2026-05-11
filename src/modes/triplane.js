import { clearCanvas, drawCharHSL, drawChar, drawString } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// triplane — side-scrolling dogfight textflow.
// Player plane (>) hangs on the left third of the screen, pitches up/down,
// fires MG bullets (·) at enemy planes (<) streaming in from the right.
// WASD/arrows for keyboard, swipe-up/down for pitch + tap for fire on mobile.
// Style: clouds (~) drift on parallax layers, hills (▴▲) scroll underneath.

var player = null;
var enemies = null;
var bullets = null;
var clouds = null;
var hills = null;
var sparks = null;
var score = 0;
var highScore = 0;
var lives = 3;
var gameOver = false;
var gameStarted = false;
var spawnTimer = 0;
var flashTimer = 0;
var fireCooldown = 0;
var lastTime = 0;
var tW = 0, tH = 0;
var scrollX = 0;

// Input state
var keys = null;
var touchStartY = 0;
var touchActive = false;
var pitchInput = 0; // -1 up, 0 none, +1 down

// Event handler refs
var _keyDownHandler = null;
var _keyUpHandler = null;
var _touchStartHandler = null;
var _touchMoveHandler = null;
var _touchEndHandler = null;

function initTriplane() {
  try { highScore = parseInt(localStorage.getItem('triplane_hi') || '0', 10) || 0; } catch (e) { highScore = 0; }
  resetTriplane();
}

function resetTriplane() {
  tW = state.COLS;
  tH = state.ROWS;
  player = {
    x: tW * 0.25,
    y: tH * 0.5,
    vy: 0,
    angle: 0
  };
  enemies = [];
  bullets = [];
  sparks = [];
  score = 0;
  lives = 3;
  gameOver = false;
  gameStarted = false;
  spawnTimer = 0;
  flashTimer = 0;
  fireCooldown = 0;
  scrollX = 0;
  keys = {};

  // Pre-seed clouds + hills so the world feels alive from frame 1
  clouds = [];
  for (var i = 0; i < 12; i++) {
    clouds.push({ x: Math.random() * tW, y: 2 + Math.random() * (tH * 0.4), w: 2 + ((Math.random() * 4) | 0), vx: -0.08 - Math.random() * 0.05 });
  }
  hills = [];
  for (var j = 0; j < 10; j++) {
    hills.push({ x: Math.random() * tW, h: 2 + ((Math.random() * 4) | 0), vx: -0.25 - Math.random() * 0.1 });
  }

  // Pre-seed one enemy so the fight starts immediately
  spawnEnemy();
}

function spawnEnemy() {
  enemies.push({
    x: tW + 2,
    y: 3 + Math.random() * (tH - 8),
    vx: -0.18 - Math.random() * 0.08,
    vy: (Math.random() - 0.5) * 0.08,
    hp: 1,
    wobble: Math.random() * Math.PI * 2,
    hue: 0 + Math.random() * 40
  });
}

function spawnSparks(x, y, n, hue) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 0.3 + Math.random() * 1.2;
    sparks.push({
      x: x, y: y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
      ch: '*·•+'[(Math.random() * 4) | 0],
      hue: hue + Math.random() * 30 - 15
    });
  }
}

function firePlayerMG() {
  if (fireCooldown > 0 || gameOver) return;
  bullets.push({ x: player.x + 2, y: player.y, vx: 1.2, vy: Math.sin(player.angle) * 0.3, life: 1.0 });
  fireCooldown = 0.18;
  spawnSparks(player.x + 2, player.y, 2, 50);
}

function stepTriplane(dt) {
  if (gameOver || !gameStarted) return;

  // Player pitch — combine keyboard + touch pitch inputs
  var pitch = 0;
  if (keys.ArrowUp || keys.w || keys.W) pitch -= 1;
  if (keys.ArrowDown || keys.s || keys.S) pitch += 1;
  pitch += pitchInput;
  player.angle += (pitch * 0.12 - player.angle * 0.08) * dt * 8;
  player.angle = Math.max(-1.0, Math.min(1.0, player.angle));
  player.vy = player.angle * 0.7;
  player.y += player.vy * dt * 20;
  // Clamp to playfield
  if (player.y < 1.5) { player.y = 1.5; player.angle = Math.max(player.angle, 0); }
  if (player.y > tH - 3) { player.y = tH - 3; player.angle = Math.min(player.angle, 0); }

  // Throttle (A/D just wiggles x slightly for juice — constant forward is the spirit)
  var throttleUp = (keys.ArrowRight || keys.d || keys.D) ? 1 : 0;
  var throttleDown = (keys.ArrowLeft || keys.a || keys.A) ? 1 : 0;
  player.x += (throttleUp - throttleDown) * dt * 6;
  if (player.x < 4) player.x = 4;
  if (player.x > tW * 0.5) player.x = tW * 0.5;

  // Scrolling parallax world
  scrollX += dt * 10;
  fireCooldown = Math.max(0, fireCooldown - dt);
  flashTimer = Math.max(0, flashTimer - dt);

  // Spawn enemies — rate scales with score
  spawnTimer -= dt;
  var spawnRate = Math.max(0.8, 3.0 - score * 0.08);
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = spawnRate;
  }

  // Update clouds (parallax)
  for (var ci = 0; ci < clouds.length; ci++) {
    clouds[ci].x += clouds[ci].vx * dt * 30;
    if (clouds[ci].x < -clouds[ci].w - 2) { clouds[ci].x = tW + 2; clouds[ci].y = 2 + Math.random() * (tH * 0.4); }
  }
  // Update hills (faster parallax)
  for (var hi = 0; hi < hills.length; hi++) {
    hills[hi].x += hills[hi].vx * dt * 30;
    if (hills[hi].x < -4) { hills[hi].x = tW + 2; hills[hi].h = 2 + ((Math.random() * 4) | 0); }
  }

  // Update bullets
  for (var bi = bullets.length - 1; bi >= 0; bi--) {
    var b = bullets[bi];
    b.x += b.vx * dt * 40;
    b.y += b.vy * dt * 20;
    b.life -= dt;
    if (b.x > tW + 2 || b.life <= 0) { bullets.splice(bi, 1); continue; }
    // Bullet vs enemy
    for (var ei = enemies.length - 1; ei >= 0; ei--) {
      var en = enemies[ei];
      var dx = b.x - en.x, dy = b.y - en.y;
      if (dx * dx + dy * dy < 1.8) {
        spawnSparks(en.x, en.y, 12, en.hue);
        enemies.splice(ei, 1);
        bullets.splice(bi, 1);
        score += 1;
        if (score > highScore) {
          highScore = score;
          try { localStorage.setItem('triplane_hi', String(highScore)); } catch (e) { /* ignore */ }
        }
        break;
      }
    }
  }

  // Update enemies
  for (var eei = enemies.length - 1; eei >= 0; eei--) {
    var enem = enemies[eei];
    enem.wobble += dt * 2;
    enem.x += enem.vx * dt * 40;
    enem.y += enem.vy * dt * 20 + Math.sin(enem.wobble) * 0.04;
    if (enem.x < -2) { enemies.splice(eei, 1); continue; }
    // Enemy vs player
    var pdx = enem.x - player.x, pdy = enem.y - player.y;
    if (pdx * pdx + pdy * pdy < 2.5) {
      spawnSparks(player.x, player.y, 20, 20);
      enemies.splice(eei, 1);
      lives -= 1;
      flashTimer = 0.4;
      if (lives <= 0) gameOver = true;
    }
  }

  // Update sparks
  for (var si = sparks.length - 1; si >= 0; si--) {
    var s = sparks[si];
    s.x += s.vx * dt * 20;
    s.y += s.vy * dt * 20;
    s.vy += dt * 1.5; // gravity for sparks
    s.life -= dt;
    if (s.life <= 0) sparks.splice(si, 1);
  }
}

function renderTriplane() {
  clearCanvas();

  // Re-init on first real render OR on canvas resize. (state.COLS/ROWS
  // may be 0 at init time so we defer positional setup to first render.)
  if (!player || tW !== state.COLS || tH !== state.ROWS) {
    resetTriplane();
  }

  tW = state.COLS;
  tH = state.ROWS;

  var now = performance.now();
  var dt = lastTime > 0 ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
  lastTime = now;

  stepTriplane(dt);

  // Sky gradient — vary hue by row
  // (we don't fill bg — just draw clouds + hills over canvas clear)

  // Clouds (low-parallax, cyan-white)
  for (var ci = 0; ci < clouds.length; ci++) {
    var c = clouds[ci];
    for (var k = 0; k < c.w; k++) {
      drawCharHSL('~', (c.x + k) | 0, c.y | 0, 200, 20, 88);
    }
  }

  // Hills (darker green, bottom)
  for (var hi = 0; hi < hills.length; hi++) {
    var h = hills[hi];
    for (var y = 0; y < h.h; y++) {
      var ch = (y === h.h - 1) ? '▲' : '█';
      drawCharHSL(ch, h.x | 0, tH - 1 - y, 120 + y * 5, 40, 28 + y * 3);
    }
  }

  // Ground line
  for (var gx = 0; gx < tW; gx++) {
    drawCharHSL('_', gx, tH - 1, 90, 40, 25);
  }

  // Bullets
  for (var bi = 0; bi < bullets.length; bi++) {
    var b = bullets[bi];
    drawCharHSL('·', b.x | 0, b.y | 0, 55, 100, 70);
  }

  // Sparks
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var t = sp.life / sp.maxLife;
    drawCharHSL(sp.ch, sp.x | 0, sp.y | 0, sp.hue, 100, 40 + t * 40);
  }

  // Enemy planes — simple ASCII for max-compat across devices
  for (var eei = 0; eei < enemies.length; eei++) {
    var en = enemies[eei];
    var chx = en.vy < -0.02 ? '\\' : (en.vy > 0.02 ? '/' : '<');
    drawCharHSL(chx, en.x | 0, en.y | 0, en.hue, 80, 55);
  }

  // Player plane — pitch-indicator char (ASCII for compat)
  var pch = player.angle < -0.2 ? '/' : (player.angle > 0.2 ? '\\' : '>');
  var hitFlash = flashTimer > 0 && (((flashTimer * 20) | 0) % 2 === 0);
  if (hitFlash) {
    drawCharHSL(pch, player.x | 0, player.y | 0, 0, 100, 60);
  } else {
    drawCharHSL(pch, player.x | 0, player.y | 0, 40, 90, 70);
  }

  // HUD — score + lives
  var scoreStr = 'SCORE ' + score + '  HI ' + highScore;
  for (var hx = 0; hx < scoreStr.length; hx++) {
    drawCharHSL(scoreStr.charAt(hx), hx + 1, 0, 50, 60, 80);
  }
  var livesStr = '';
  for (var lx = 0; lx < lives; lx++) livesStr += '*';
  for (var lxi = 0; lxi < livesStr.length; lxi++) {
    drawCharHSL(livesStr.charAt(lxi), tW - 1 - livesStr.length + lxi, 0, 0, 80, 60);
  }

  // Instructions / title overlay
  if (!gameStarted && !gameOver) {
    var title = 'TRIPLANE';
    var startText = 'WASD / ARROWS to fly · SPACE / TAP to fire';
    var startText2 = state.isMobile ? 'swipe up/down to pitch, tap to fire' : 'press any key to start';
    var cx = ((tW - title.length) / 2) | 0;
    var cy = (tH / 2 - 3) | 0;
    for (var ti = 0; ti < title.length; ti++) {
      drawCharHSL(title.charAt(ti), cx + ti, cy, 50 + ti * 10, 100, 70);
    }
    var cx2 = ((tW - startText.length) / 2) | 0;
    for (var si2 = 0; si2 < startText.length; si2++) {
      drawCharHSL(startText.charAt(si2), cx2 + si2, cy + 2, 200, 30, 80);
    }
    var cx3 = ((tW - startText2.length) / 2) | 0;
    for (var si3 = 0; si3 < startText2.length; si3++) {
      drawCharHSL(startText2.charAt(si3), cx3 + si3, cy + 3, 200, 30, 65);
    }
  }

  if (gameOver) {
    var g1 = 'DOWNED';
    var g2 = 'score ' + score + (score >= highScore ? ' — NEW HI!' : '');
    var g3 = state.isMobile ? 'tap to fly again' : 'press any key to fly again';
    var gx1 = ((tW - g1.length) / 2) | 0;
    var gy1 = (tH / 2 - 1) | 0;
    for (var gi = 0; gi < g1.length; gi++) drawCharHSL(g1.charAt(gi), gx1 + gi, gy1, 0, 90, 60);
    var gx2 = ((tW - g2.length) / 2) | 0;
    for (var gi2 = 0; gi2 < g2.length; gi2++) drawCharHSL(g2.charAt(gi2), gx2 + gi2, gy1 + 1, 50, 80, 70);
    var gx3 = ((tW - g3.length) / 2) | 0;
    for (var gi3 = 0; gi3 < g3.length; gi3++) drawCharHSL(g3.charAt(gi3), gx3 + gi3, gy1 + 3, 200, 30, 65);
  }
}

function cleanupTriplane() {
  if (_keyDownHandler) { window.removeEventListener('keydown', _keyDownHandler); _keyDownHandler = null; }
  if (_keyUpHandler) { window.removeEventListener('keyup', _keyUpHandler); _keyUpHandler = null; }
  if (_touchStartHandler && state.canvas) { state.canvas.removeEventListener('touchstart', _touchStartHandler); _touchStartHandler = null; }
  if (_touchMoveHandler && state.canvas) { state.canvas.removeEventListener('touchmove', _touchMoveHandler); _touchMoveHandler = null; }
  if (_touchEndHandler && state.canvas) { state.canvas.removeEventListener('touchend', _touchEndHandler); _touchEndHandler = null; }
}

function attachTriplane() {
  cleanupTriplane();

  _keyDownHandler = function(e) {
    if (state.currentMode !== 'triplane') return;
    if (gameOver) { resetTriplane(); gameStarted = true; e.preventDefault(); return; }
    if (!gameStarted) { gameStarted = true; lastTime = 0; }
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'f' || e.key === 'F') { firePlayerMG(); e.preventDefault(); }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 's', 'a', 'd', 'W', 'S', 'A', 'D'].indexOf(e.key) !== -1) e.preventDefault();
  };
  window.addEventListener('keydown', _keyDownHandler);

  _keyUpHandler = function(e) {
    if (state.currentMode !== 'triplane') return;
    keys[e.key] = false;
  };
  window.addEventListener('keyup', _keyUpHandler);

  _touchStartHandler = function(e) {
    if (state.currentMode !== 'triplane') return;
    if (gameOver) { resetTriplane(); gameStarted = true; lastTime = 0; return; }
    if (e.touches.length > 0) {
      touchStartY = e.touches[0].clientY;
      touchActive = true;
      // DO NOT start the game here — wait for touchend so title stays up
      // until the user actually commits to a tap/swipe.
    }
  };
  state.canvas.addEventListener('touchstart', _touchStartHandler, { passive: true });

  _touchMoveHandler = function(e) {
    if (state.currentMode !== 'triplane' || !touchActive) return;
    var dy = e.touches[0].clientY - touchStartY;
    // Swipe distance ≥ ~30px in either direction drives continuous pitch
    if (Math.abs(dy) > 30) {
      pitchInput = dy > 0 ? 1 : -1;
    } else {
      pitchInput = 0;
    }
  };
  state.canvas.addEventListener('touchmove', _touchMoveHandler, { passive: true });

  _touchEndHandler = function(e) {
    if (state.currentMode !== 'triplane') return;
    var wasActive = touchActive;
    touchActive = false;
    pitchInput = 0;
    // First touch starts the game
    if (!gameStarted) {
      gameStarted = true;
      lastTime = 0;
      return;
    }
    // Quick tap (minimal movement) = fire
    if (wasActive && e.changedTouches.length > 0) {
      var dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dy) < 15) firePlayerMG();
    }
  };
  state.canvas.addEventListener('touchend', _touchEndHandler, { passive: true });
}

registerMode('triplane', { init: initTriplane, render: renderTriplane, attach: attachTriplane, cleanup: cleanupTriplane });
