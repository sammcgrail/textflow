import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Tilttext — accelerometer/gyroscope text visualization
// Text and particles flow based on device tilt. Mouse fallback on desktop.

var tiltX = 0; // -1 to 1 (left-right)
var tiltY = 0; // -1 to 1 (front-back)
var smoothTiltX = 0;
var smoothTiltY = 0;
var hasMotion = false;
var motionPermission = 'unknown'; // unknown, granted, denied, unavailable
var showPrompt = true;
var promptTapped = false;

// Particles
var NUM_PARTICLES = 200;
var particlePool = [];

// Liquid pool
var liquidLevel = [];
var liquidVelocity = [];
var LIQUID_ROWS = 5;

// Mouse fallback
var mouseX = 0.5;
var mouseY = 0.5;
var mouseActive = false;

// Text characters pool
var charPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()[]{}|;:,.<>?/~`+-=_';
var symbolPool = '*+~=#@%&.:;^';

var lastTime = 0;
var initialized = false;

// Event handlers (stored for cleanup)
var onDeviceOrientation = null;
var onMouseMove = null;
var onClick = null;

function initTilttext() {
  tiltX = 0;
  tiltY = 0;
  smoothTiltX = 0;
  smoothTiltY = 0;
  hasMotion = false;
  motionPermission = 'unknown';
  showPrompt = true;
  promptTapped = false;
  mouseActive = false;
  lastTime = 0;
  initialized = false;
  particlePool = [];
  liquidLevel = [];
  liquidVelocity = [];

  // Check for DeviceOrientation support
  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS 13+ — need permission
      motionPermission = 'needs_tap';
      showPrompt = true;
    } else {
      // Android/desktop — try directly
      motionPermission = 'trying';
      showPrompt = false;
      setupOrientationListener();
    }
  } else {
    motionPermission = 'unavailable';
    showPrompt = false;
  }

  // Mouse fallback
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

  // Click handler for iOS permission
  onClick = function() {
    if (motionPermission === 'needs_tap' && !promptTapped) {
      promptTapped = true;
      DeviceOrientationEvent.requestPermission().then(function(perm) {
        if (perm === 'granted') {
          motionPermission = 'granted';
          showPrompt = false;
          setupOrientationListener();
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

function setupOrientationListener() {
  onDeviceOrientation = function(e) {
    if (e.gamma !== null && e.beta !== null) {
      hasMotion = true;
      motionPermission = 'granted';
      showPrompt = false;
      // gamma: -90 to 90 (left-right tilt)
      // beta: -180 to 180 (front-back tilt)
      tiltX = Math.max(-1, Math.min(1, (e.gamma || 0) / 45));
      tiltY = Math.max(-1, Math.min(1, ((e.beta || 0) - 30) / 45)); // offset by 30 for natural holding angle
    }
  };
  window.addEventListener('deviceorientation', onDeviceOrientation);

  // If no events after 1s, fall back to mouse
  setTimeout(function() {
    if (!hasMotion && motionPermission === 'trying') {
      motionPermission = 'unavailable';
    }
  }, 1000);
}

function initParticles() {
  particlePool = [];
  var W = state.COLS;
  var H = state.ROWS;
  for (var i = 0; i < NUM_PARTICLES; i++) {
    particlePool.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      ch: charPool[Math.floor(Math.random() * charPool.length)],
      hue: Math.random() * 360,
      mass: 0.5 + Math.random() * 1.5,
      bounce: 0.4 + Math.random() * 0.4
    });
  }
  // Init liquid
  liquidLevel = [];
  liquidVelocity = [];
  for (var lx = 0; lx < W; lx++) {
    liquidLevel.push(0);
    liquidVelocity.push(0);
  }
  initialized = true;
}

function updatePhysics(dt) {
  var W = state.COLS;
  var H = state.ROWS;
  var gravityX = smoothTiltX * 40;
  var gravityY = smoothTiltY * 20 + 10; // always some downward pull

  for (var i = 0; i < particlePool.length; i++) {
    var p = particlePool[i];

    // Apply gravity based on tilt
    p.vx += gravityX * dt / p.mass;
    p.vy += gravityY * dt / p.mass;

    // Damping
    p.vx *= 0.995;
    p.vy *= 0.995;

    // Cap velocity
    var maxV = 30;
    if (p.vx > maxV) p.vx = maxV;
    if (p.vx < -maxV) p.vx = -maxV;
    if (p.vy > maxV) p.vy = maxV;
    if (p.vy < -maxV) p.vy = -maxV;

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // "Splash" detection — hard tilt into wall
    var splashed = false;

    // Bounce off walls
    if (p.x < 0) {
      p.x = 0;
      p.vx = Math.abs(p.vx) * p.bounce;
      splashed = Math.abs(smoothTiltX) > 0.6;
    } else if (p.x >= W) {
      p.x = W - 0.1;
      p.vx = -Math.abs(p.vx) * p.bounce;
      splashed = Math.abs(smoothTiltX) > 0.6;
    }

    if (p.y < 0) {
      p.y = 0;
      p.vy = Math.abs(p.vy) * p.bounce;
      splashed = Math.abs(smoothTiltY) > 0.6;
    } else if (p.y >= H - LIQUID_ROWS) {
      p.y = H - LIQUID_ROWS - 0.1;
      p.vy = -Math.abs(p.vy) * p.bounce;
      // Transfer energy to liquid
      var lIdx = Math.floor(p.x);
      if (lIdx >= 0 && lIdx < W) {
        liquidVelocity[lIdx] += p.vy * 0.1;
      }
    }

    // Splash effect — scatter character on wall impact
    if (splashed) {
      p.ch = symbolPool[Math.floor(Math.random() * symbolPool.length)];
      p.hue = (p.hue + 60) % 360;
    }
  }

  // Update liquid simulation
  var tension = 0.03;
  var damping = 0.97;
  var spread = 0.15;
  // Apply tilt to liquid
  for (var lx = 0; lx < W; lx++) {
    // Gravity-like tilt push
    liquidVelocity[lx] += smoothTiltX * 0.5 * dt;
    liquidVelocity[lx] *= damping;
  }
  // Spring tension between neighbors
  for (var pass = 0; pass < 3; pass++) {
    for (var lx2 = 1; lx2 < W - 1; lx2++) {
      var diff = liquidLevel[lx2 - 1] - liquidLevel[lx2];
      liquidVelocity[lx2] += diff * spread;
      diff = liquidLevel[lx2 + 1] - liquidLevel[lx2];
      liquidVelocity[lx2] += diff * spread;
    }
  }
  for (var lx3 = 0; lx3 < W; lx3++) {
    liquidLevel[lx3] += liquidVelocity[lx3];
    // Pull toward equilibrium
    liquidLevel[lx3] *= 0.98;
    // Tilt shifts equilibrium
    var equilibrium = smoothTiltX * (lx3 / W - 0.5) * 3;
    liquidLevel[lx3] += (equilibrium - liquidLevel[lx3]) * 0.02;
  }
}

function renderTilttext() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  var dt = lastTime > 0 ? t - lastTime : 0.016;
  if (dt > 0.1) dt = 0.016;
  lastTime = t;

  // Smooth tilt interpolation
  smoothTiltX += (tiltX - smoothTiltX) * 0.08;
  smoothTiltY += (tiltY - smoothTiltY) * 0.08;

  // Init particles if needed (wait for COLS/ROWS)
  if (!initialized && W > 0 && H > 0) {
    initParticles();
  }

  // Permission prompt
  if (showPrompt && motionPermission === 'needs_tap') {
    var msg1 = '[ TAP TO ENABLE MOTION ]';
    var msg2 = 'accelerometer access required';
    drawCentered(msg1, Math.floor(H / 2) - 1, 200, 60, 50 + Math.sin(t * 3) * 10, 1.0);
    drawCentered(msg2, Math.floor(H / 2) + 1, 200, 40, 35, 0.7);
    // Still render some ambient particles
    renderAmbientDust(W, H, t);
    return;
  }

  // Background color shift based on tilt
  // Level = cool blues, tilted = warm oranges
  var tiltMag = Math.sqrt(smoothTiltX * smoothTiltX + smoothTiltY * smoothTiltY);
  var bgBaseHue = 220 - tiltMag * 180; // 220 (blue) -> 40 (orange)
  if (bgBaseHue < 0) bgBaseHue += 360;

  // Subtle background grid
  for (var gy = 0; gy < H - LIQUID_ROWS; gy++) {
    for (var gx = 0; gx < W; gx++) {
      if (Math.random() < 0.004) {
        drawCharHSL('.', gx, gy, bgBaseHue, 20, 8, 0.2);
      }
    }
  }

  // Update physics
  if (initialized) {
    updatePhysics(dt);
  }

  // Render particles
  for (var i = 0; i < particlePool.length; i++) {
    var p = particlePool[i];
    var col = Math.round(p.x);
    var row = Math.round(p.y);
    if (col >= 0 && col < W && row >= 0 && row < H - LIQUID_ROWS) {
      // Speed-based brightness
      var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      var brightness = 25 + Math.min(speed * 3, 35);
      var sat = 50 + Math.min(speed * 5, 40);

      // Hue shifts with movement
      p.hue = (p.hue + speed * dt * 2) % 360;

      // Blend particle hue with background tilt hue
      var finalHue = (p.hue * 0.7 + bgBaseHue * 0.3) % 360;

      drawCharHSL(p.ch, col, row, finalHue, sat, brightness, 0.9);

      // Motion trail for fast particles
      if (speed > 8) {
        var trailX = Math.round(p.x - p.vx * dt * 2);
        var trailY = Math.round(p.y - p.vy * dt * 2);
        if (trailX >= 0 && trailX < W && trailY >= 0 && trailY < H - LIQUID_ROWS) {
          drawCharHSL('.', trailX, trailY, finalHue, 30, 15, 0.3);
        }
      }
    }
  }

  // Render liquid pool at bottom
  renderLiquid(W, H, t, bgBaseHue);

  // Tilt indicator in top-right corner
  renderTiltIndicator(W, H, t);

  // Source label
  var source = hasMotion ? 'GYRO' : (mouseActive ? 'MOUSE' : 'IDLE');
  var sourceHue = hasMotion ? 120 : (mouseActive ? 60 : 0);
  drawTextAt(source, W - source.length - 1, 0, sourceHue, 50, 30, 0.5);
}

function renderLiquid(W, H, t, baseHue) {
  var liquidBaseY = H - LIQUID_ROWS;
  var liquidChars = '~=-.';

  for (var lx = 0; lx < W; lx++) {
    var level = liquidLevel[lx] || 0;
    var surfaceY = liquidBaseY - Math.round(level * 2);
    if (surfaceY < liquidBaseY - LIQUID_ROWS) surfaceY = liquidBaseY - LIQUID_ROWS;
    if (surfaceY > liquidBaseY) surfaceY = liquidBaseY;

    // Surface character
    var surfCh = level > 0.3 ? '~' : (level > 0.1 ? '-' : '.');
    if (surfaceY >= 0 && surfaceY < H) {
      var surfHue = (baseHue + 180) % 360;
      drawCharHSL(surfCh, lx, surfaceY, surfHue, 60, 40, 0.8);
    }

    // Fill below surface
    for (var ly = surfaceY + 1; ly < H; ly++) {
      var depth = ly - surfaceY;
      var liqHue = (baseHue + 160 + depth * 10) % 360;
      var liqBright = 30 - depth * 4;
      if (liqBright < 8) liqBright = 8;
      var liqCh = liquidChars[Math.min(depth - 1, liquidChars.length - 1)];
      var wave = Math.sin(t * 2 + lx * 0.3 + depth) * 0.3;
      drawCharHSL(liqCh, lx, ly, liqHue, 50, liqBright + wave * 5, 0.6);
    }
  }
}

function renderTiltIndicator(W, H, t) {
  // Mini compass/level in top-left corner
  var cx = 4;
  var cy = 2;
  var radius = 2;

  // Draw ring
  var ringChars = '.';
  for (var a = 0; a < 8; a++) {
    var rad = a * Math.PI / 4;
    var rx = Math.round(cx + Math.cos(rad) * radius);
    var ry = Math.round(cy + Math.sin(rad) * radius * 0.5);
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
      drawCharHSL(ringChars, rx, ry, 0, 0, 30, 0.5);
    }
  }

  // Draw tilt dot
  var dotX = Math.round(cx + smoothTiltX * radius);
  var dotY = Math.round(cy + smoothTiltY * radius * 0.5);
  if (dotX >= 0 && dotX < W && dotY >= 0 && dotY < H) {
    var tiltMag = Math.sqrt(smoothTiltX * smoothTiltX + smoothTiltY * smoothTiltY);
    var dotHue = tiltMag > 0.5 ? 0 : 120;
    drawCharHSL('O', dotX, dotY, dotHue, 80, 55, 1.0);
  }

  // Angle readout
  var angleX = Math.round(smoothTiltX * 45);
  var angleY = Math.round(smoothTiltY * 45);
  var angleStr = angleX + ',' + angleY;
  drawTextAt(angleStr, 1, 4, 0, 0, 30, 0.5);
}

function renderAmbientDust(W, H, t) {
  for (var i = 0; i < 30; i++) {
    var dx = Math.floor((Math.sin(t * 0.3 + i * 0.7) * 0.4 + 0.5) * W);
    var dy = Math.floor((Math.cos(t * 0.2 + i * 1.1) * 0.4 + 0.5) * H);
    if (dx >= 0 && dx < W && dy >= 0 && dy < H) {
      drawCharHSL('.', dx, dy, 200, 30, 20, 0.3 + Math.sin(t + i) * 0.15);
    }
  }
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

function cleanupTilttext() {
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
  particlePool = [];
  initialized = false;
}

registerMode('tilttext', { init: initTilttext, render: renderTilttext, cleanup: cleanupTilttext });
