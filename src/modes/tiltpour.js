import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Tiltpour — tilt to pour ASCII water into containers

var tiltX = 0, tiltY = 0;
var smoothTiltX = 0, smoothTiltY = 0;
var hasMotion = false;
var motionPermission = 'unknown';
var showPrompt = true;
var promptTapped = false;
var mouseX = 0.5, mouseY = 0.5, mouseActive = false;

var onDeviceOrientation = null;
var onMouseMove = null;
var onClick = null;

// Water particles
var waterParticles = [];
var MAX_WATER = 200;
var waterChars = ['~', '~', String.fromCharCode(8776), String.fromCharCode(183)]; // ~, ≈, ·

// Containers
var containers = []; // {x, y, width, height, capacity, fill, flashTimer}
var NUM_CONTAINERS = 3;

// Steam particles
var steamParticles = [];
var MAX_STEAM = 40;

// Splash particles
var splashParticles = [];

// Scoring
var score = 0;
var combo = 1;
var lastFillTime = 0;
var COMBO_WINDOW = 3.0;

// Reservoir
var reservoirY = 2;
var spawnRate = 0;
var spawnAccum = 0;

var lastTime = 0;
var initialized = false;

function initTiltpour() {
  tiltX = 0; tiltY = 0;
  smoothTiltX = 0; smoothTiltY = 0;
  hasMotion = false;
  motionPermission = 'unknown';
  showPrompt = true;
  promptTapped = false;
  mouseActive = false;
  lastTime = 0;
  initialized = false;
  waterParticles = [];
  steamParticles = [];
  splashParticles = [];
  containers = [];
  score = 0;
  combo = 1;
  lastFillTime = 0;
  spawnAccum = 0;

  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      motionPermission = 'needs_tap';
      showPrompt = true;
    } else {
      motionPermission = 'trying';
      showPrompt = false;
      setupOrientation();
    }
  } else {
    motionPermission = 'unavailable';
    showPrompt = false;
  }

  onMouseMove = function(e) {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
    if (!hasMotion) {
      mouseActive = true;
      tiltX = (mouseX - 0.5) * 2;
      tiltY = (mouseY - 0.5) * 2;
    }
  };
  window.addEventListener('mousemove', onMouseMove);

  onClick = function() {
    if (motionPermission === 'needs_tap' && !promptTapped) {
      promptTapped = true;
      DeviceOrientationEvent.requestPermission().then(function(perm) {
        if (perm === 'granted') {
          motionPermission = 'granted';
          showPrompt = false;
          setupOrientation();
        } else {
          motionPermission = 'denied';
          showPrompt = false;
        }
      }).catch(function() {
        motionPermission = 'denied';
        showPrompt = false;
      });
    }
  };
  window.addEventListener('click', onClick);
  window.addEventListener('touchstart', onClick);
}

function setupOrientation() {
  onDeviceOrientation = function(e) {
    if (e.gamma !== null && e.beta !== null) {
      hasMotion = true;
      motionPermission = 'granted';
      showPrompt = false;
      tiltX = Math.max(-1, Math.min(1, (e.gamma || 0) / 45));
      tiltY = Math.max(-1, Math.min(1, ((e.beta || 0) - 30) / 45));
    }
  };
  window.addEventListener('deviceorientation', onDeviceOrientation);
  setTimeout(function() {
    if (!hasMotion && motionPermission === 'trying') {
      motionPermission = 'unavailable';
    }
  }, 1000);
}

function buildContainers() {
  containers = [];
  var W = state.COLS;
  var H = state.ROWS;
  var groundY = H - 1;
  var sizes = [
    { w: 6, h: 6, cap: 15 },
    { w: 8, h: 8, cap: 25 },
    { w: 5, h: 5, cap: 10 }
  ];
  var totalW = 0;
  for (var si = 0; si < sizes.length; si++) totalW += sizes[si].w + 2;
  var startX = Math.floor((W - totalW) / 2);
  var cx = startX;

  for (var ci = 0; ci < NUM_CONTAINERS; ci++) {
    var s = sizes[ci];
    containers.push({
      x: cx,
      y: groundY - s.h,
      width: s.w,
      height: s.h,
      capacity: s.cap,
      fill: 0,
      flashTimer: 0
    });
    cx += s.w + 3;
  }
}

function spawnWater(dt) {
  // Spawn water from reservoir when tilted
  var tiltMag = Math.abs(smoothTiltX);
  if (tiltMag < 0.08) return; // deadzone

  spawnRate = tiltMag * 30; // particles per second
  spawnAccum += spawnRate * dt;

  while (spawnAccum >= 1 && waterParticles.length < MAX_WATER) {
    spawnAccum -= 1;
    var W = state.COLS;
    var spawnX = W / 2 + smoothTiltX * (W / 3);
    spawnX += (Math.random() - 0.5) * 3;
    waterParticles.push({
      x: spawnX,
      y: reservoirY + Math.random() * 2,
      vx: smoothTiltX * 8 + (Math.random() - 0.5) * 2,
      vy: 1 + Math.random() * 2,
      ch: waterChars[Math.floor(Math.random() * waterChars.length)],
      hue: 190 + Math.random() * 30,
      life: 1.0
    });
  }
}

function updateWater(dt) {
  var W = state.COLS;
  var H = state.ROWS;
  var groundY = H - 1;
  var gravity = 15;
  var tiltForce = smoothTiltX * 12;

  for (var i = waterParticles.length - 1; i >= 0; i--) {
    var p = waterParticles[i];
    p.vx += tiltForce * dt;
    p.vy += gravity * dt;
    p.vx *= 0.98;

    // Cap velocity
    if (p.vx > 20) p.vx = 20;
    if (p.vx < -20) p.vx = -20;
    if (p.vy > 25) p.vy = 25;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Bounce off side walls
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.5; }
    if (p.x >= W) { p.x = W - 0.1; p.vx = -Math.abs(p.vx) * 0.5; }

    var removed = false;

    // Check container collision
    for (var ci = 0; ci < containers.length; ci++) {
      var c = containers[ci];
      var px = Math.round(p.x);
      var py = Math.round(p.y);

      // Inside container opening (above container, within width)
      if (px >= c.x && px < c.x + c.width && py >= c.y - 1 && py <= c.y + c.height) {
        if (c.fill < c.capacity) {
          c.fill += 0.5;
          // Splash effect
          spawnSplash(p.x, c.y, c.hue || 200);
          waterParticles.splice(i, 1);
          removed = true;

          // Check if full
          if (c.fill >= c.capacity) {
            c.flashTimer = 1.5;
            var now = state.time;
            if (now - lastFillTime < COMBO_WINDOW) {
              combo++;
            } else {
              combo = 1;
            }
            lastFillTime = now;
            score += 10 * combo;
            // Spawn steam burst
            for (var si = 0; si < 8; si++) {
              steamParticles.push({
                x: c.x + Math.random() * c.width,
                y: c.y,
                vx: (Math.random() - 0.5) * 2,
                vy: -(1 + Math.random() * 2),
                life: 1.0,
                ch: '.'
              });
            }
            // Delayed empty
            c.fill = 0;
          }
          break;
        }
      }
    }

    if (!removed) {
      // Hit ground — splash and evaporate
      if (p.y >= groundY) {
        spawnSplash(p.x, groundY - 1, 200);
        p.life -= 0.3;
        p.vy = -Math.abs(p.vy) * 0.2;
        p.y = groundY - 0.1;
      }

      // Remove dead particles
      if (p.life <= 0 || p.y > H + 2) {
        waterParticles.splice(i, 1);
      } else {
        p.life -= dt * 0.05; // slow evaporation
      }
    }
  }
}

function spawnSplash(x, y, hue) {
  if (splashParticles.length > 60) return;
  for (var si = 0; si < 3; si++) {
    splashParticles.push({
      x: x + (Math.random() - 0.5) * 2,
      y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: -(2 + Math.random() * 4),
      life: 0.6,
      hue: hue,
      ch: String.fromCharCode(183) // ·
    });
  }
}

function updateSteamAndSplash(dt) {
  // Steam
  for (var i = steamParticles.length - 1; i >= 0; i--) {
    var s = steamParticles[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx += (Math.random() - 0.5) * 2 * dt;
    s.life -= dt * 0.5;
    if (s.life <= 0) {
      steamParticles.splice(i, 1);
    }
  }
  // Limit steam
  while (steamParticles.length > MAX_STEAM) steamParticles.shift();

  // Splash
  for (var j = splashParticles.length - 1; j >= 0; j--) {
    var sp = splashParticles[j];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 15 * dt; // gravity
    sp.life -= dt * 1.5;
    if (sp.life <= 0) {
      splashParticles.splice(j, 1);
    }
  }
}

function renderTiltpour() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var dt = lastTime > 0 ? t - lastTime : 0.016;
  if (dt > 0.1) dt = 0.016;
  lastTime = t;

  smoothTiltX += (tiltX - smoothTiltX) * 0.08;
  smoothTiltY += (tiltY - smoothTiltY) * 0.08;

  if (!initialized && W > 0 && H > 0) {
    buildContainers();
    initialized = true;
  }

  // Permission prompt
  if (showPrompt && motionPermission === 'needs_tap') {
    var msg1 = '[ TAP TO ENABLE MOTION ]';
    var msg2 = 'tilt to pour water';
    drawCentered(msg1, Math.floor(H / 2) - 1, 200, 60, 50 + Math.sin(t * 3) * 10, 1.0);
    drawCentered(msg2, Math.floor(H / 2) + 1, 200, 40, 35, 0.7);
    return;
  }

  if (!initialized) return;

  // Update
  spawnWater(dt);
  updateWater(dt);
  updateSteamAndSplash(dt);

  // Flash timers
  for (var fi = 0; fi < containers.length; fi++) {
    if (containers[fi].flashTimer > 0) {
      containers[fi].flashTimer -= dt;
    }
  }

  // --- Render reservoir/spout ---
  var spoutX = Math.floor(W / 2);
  var spoutStr = '===WATER===';
  var spoutStart = spoutX - Math.floor(spoutStr.length / 2);
  for (var ri = 0; ri < spoutStr.length; ri++) {
    var rx = spoutStart + ri;
    if (rx >= 0 && rx < W) {
      drawCharHSL(spoutStr[ri], rx, 1, 200, 60, 35, 0.7);
    }
  }
  // Pour stream indicator
  if (Math.abs(smoothTiltX) > 0.08) {
    var pourX = Math.floor(W / 2 + smoothTiltX * (W / 3));
    var pourCh = smoothTiltX > 0 ? '\\' : '/';
    for (var py = 2; py < 4; py++) {
      if (pourX >= 0 && pourX < W) {
        drawCharHSL(pourCh, pourX, py, 200, 50, 40, 0.6);
      }
      pourX += smoothTiltX > 0 ? 1 : -1;
    }
  }

  // --- Render containers ---
  for (var ci = 0; ci < containers.length; ci++) {
    var c = containers[ci];
    var flashing = c.flashTimer > 0;
    var containerHue = flashing ? 45 : 35;
    var containerLight = flashing ? (40 + Math.sin(t * 15) * 15) : 30;
    var containerSat = flashing ? 90 : 60;

    // Left wall
    for (var cy = c.y; cy < c.y + c.height; cy++) {
      if (c.x - 1 >= 0 && cy >= 0 && cy < H) {
        drawCharHSL('|', c.x - 1, cy, containerHue, containerSat, containerLight, 0.9);
      }
    }
    // Right wall
    for (var cy2 = c.y; cy2 < c.y + c.height; cy2++) {
      if (c.x + c.width >= 0 && c.x + c.width < W && cy2 >= 0 && cy2 < H) {
        drawCharHSL('|', c.x + c.width, cy2, containerHue, containerSat, containerLight, 0.9);
      }
    }
    // Bottom
    for (var bx = c.x; bx < c.x + c.width; bx++) {
      var by = c.y + c.height;
      if (bx >= 0 && bx < W && by >= 0 && by < H) {
        drawCharHSL('=', bx, by, containerHue, containerSat, containerLight, 0.9);
      }
    }

    // Fill level (water inside container)
    var fillRatio = c.fill / c.capacity;
    var fillRows = Math.floor(fillRatio * c.height);
    for (var fy = 0; fy < fillRows; fy++) {
      var frow = c.y + c.height - 1 - fy;
      for (var fx = c.x; fx < c.x + c.width; fx++) {
        if (fx >= 0 && fx < W && frow >= 0 && frow < H) {
          var waveOff = Math.sin(t * 3 + fx * 0.5) * 0.3;
          var fhue = 195 + fy * 3;
          var fbright = 30 + fy * 2 + waveOff * 5;
          var fch = fy === fillRows - 1 ? '~' : String.fromCharCode(8776); // top=~, rest=≈
          drawCharHSL(fch, fx, frow, fhue, 60, fbright, 0.8);
        }
      }
    }

    // Capacity label under container
    var capStr = Math.floor(c.fill) + '/' + c.capacity;
    var capX = c.x + Math.floor((c.width - capStr.length) / 2);
    var capY = c.y + c.height + 1;
    if (capY < H) {
      drawTextAt(capStr, capX, capY, 0, 0, 30, 0.6);
    }
  }

  // --- Render water particles ---
  for (var wi = 0; wi < waterParticles.length; wi++) {
    var wp = waterParticles[wi];
    var wx = Math.round(wp.x);
    var wy = Math.round(wp.y);
    if (wx >= 0 && wx < W && wy >= 0 && wy < H) {
      var walpha = Math.min(wp.life, 0.9);
      drawCharHSL(wp.ch, wx, wy, wp.hue, 60, 40, walpha);
    }
  }

  // --- Render splash ---
  for (var spi = 0; spi < splashParticles.length; spi++) {
    var sp = splashParticles[spi];
    var spx = Math.round(sp.x);
    var spy = Math.round(sp.y);
    if (spx >= 0 && spx < W && spy >= 0 && spy < H) {
      drawCharHSL(sp.ch, spx, spy, sp.hue, 50, 50, sp.life);
    }
  }

  // --- Render steam ---
  for (var sti = 0; sti < steamParticles.length; sti++) {
    var st = steamParticles[sti];
    var stx = Math.round(st.x);
    var sty = Math.round(st.y);
    if (stx >= 0 && stx < W && sty >= 0 && sty < H) {
      drawCharHSL(st.ch, stx, sty, 0, 0, 50, st.life * 0.5);
    }
  }

  // --- Ground ---
  for (var gx = 0; gx < W; gx++) {
    drawCharHSL('_', gx, H - 1, 30, 30, 15, 0.4);
  }

  // --- HUD ---
  var scoreStr = 'SCORE: ' + score;
  var comboStr = combo > 1 ? ('COMBO x' + combo) : '';
  drawTextAt(scoreStr, 1, 0, 45, 70, 40, 0.9);
  if (comboStr) {
    drawTextAt(comboStr, W - comboStr.length - 1, 0, 0, 80, 50, 0.9);
  }

  var source = hasMotion ? 'GYRO' : (mouseActive ? 'MOUSE' : 'IDLE');
  var sourceHue = hasMotion ? 120 : (mouseActive ? 60 : 0);
  drawTextAt(source, Math.floor(W / 2) - 2, 0, sourceHue, 50, 25, 0.5);
}

function drawCentered(text, row, hue, sat, light, alpha) {
  var col = Math.floor((state.COLS - text.length) / 2);
  drawTextAt(text, col, row, hue, sat, light, alpha);
}

function drawTextAt(text, startCol, row, hue, sat, light, alpha) {
  for (var i = 0; i < text.length; i++) {
    if (startCol + i >= 0 && startCol + i < state.COLS && row >= 0 && row < state.ROWS) {
      drawCharHSL(text[i], startCol + i, row, hue, sat, light, alpha);
    }
  }
}

function cleanupTiltpour() {
  if (onDeviceOrientation) {
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    onDeviceOrientation = null;
  }
  if (onMouseMove) {
    window.removeEventListener('mousemove', onMouseMove);
    onMouseMove = null;
  }
  if (onClick) {
    window.removeEventListener('click', onClick);
    window.removeEventListener('touchstart', onClick);
    onClick = null;
  }
  waterParticles = [];
  steamParticles = [];
  splashParticles = [];
  containers = [];
  initialized = false;
}

registerMode('tiltpour', { init: initTiltpour, render: renderTiltpour, cleanup: cleanupTiltpour });
