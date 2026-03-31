import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { pointer } from '../core/pointer.js';

// ============================================================
// Synthwave — 80s retrowave ASCII visualizer
// ============================================================

var BPM = 120;
var BEAT_HZ = BPM / 60;

// Stars
var stars = [];
var MAX_STARS = 80;

// Neon particles (click burst)
var neonParticles = [];

// Grid scroll offset
var gridScroll = 0;

// Parallax offset from mouse
var parallaxX = 0;

// Previous click state for edge detection
var wasClicked = false;

// Title text
var TITLE = 'SYNTHWAVE';

// Mountain/city silhouette heights (generated once)
var cityHeights = [];
var cityGenCols = 0;

// Palm tree definitions
var palmTrees = [];

function initSynthwave() {
  stars = [];
  neonParticles = [];
  gridScroll = 0;
  parallaxX = 0;
  wasClicked = false;
  cityHeights = [];
  cityGenCols = 0;
  palmTrees = [];
  generateCity();
  generateStars();
  generatePalms();
}

function generateStars() {
  stars = [];
  var W = state.COLS;
  var H = state.ROWS;
  var skyBottom = Math.floor(H * 0.45);
  for (var i = 0; i < MAX_STARS; i++) {
    stars.push({
      x: Math.floor(Math.random() * W),
      y: Math.floor(Math.random() * skyBottom),
      twinkleSpeed: 0.5 + Math.random() * 3,
      twinklePhase: Math.random() * Math.PI * 2,
      ch: Math.random() > 0.7 ? '+' : (Math.random() > 0.5 ? '*' : '.')
    });
  }
}

function generateCity() {
  var W = state.COLS;
  cityGenCols = W;
  cityHeights = [];
  for (var x = 0; x < W; x++) {
    var h = 0;
    var nx = x / W;
    // Cluster buildings toward center
    var centerDist = Math.abs(nx - 0.5) * 2;
    if (centerDist < 0.7) {
      // City zone
      if (Math.random() > 0.3) {
        h = 2 + Math.floor(Math.random() * 6);
        // Occasional tall tower
        if (Math.random() > 0.85) h += 3 + Math.floor(Math.random() * 4);
      }
    } else {
      // Outskirts — shorter, sparser
      if (Math.random() > 0.6) {
        h = 1 + Math.floor(Math.random() * 3);
      }
    }
    cityHeights.push(h);
  }
}

function generatePalms() {
  palmTrees = [];
  var W = state.COLS;
  var H = state.ROWS;
  var horizonY = Math.floor(H * 0.45);
  // Left palm
  if (W > 30) {
    palmTrees.push({
      trunkX: 3 + Math.floor(Math.random() * 4),
      baseY: horizonY + 4,
      height: 6 + Math.floor(Math.random() * 3),
      lean: 1
    });
  }
  // Right palm
  if (W > 30) {
    palmTrees.push({
      trunkX: W - 4 - Math.floor(Math.random() * 4),
      baseY: horizonY + 4,
      height: 6 + Math.floor(Math.random() * 3),
      lean: -1
    });
  }
  // Extra palms on wider screens
  if (W > 60) {
    palmTrees.push({
      trunkX: 8 + Math.floor(Math.random() * 5),
      baseY: horizonY + 6,
      height: 5 + Math.floor(Math.random() * 2),
      lean: 1
    });
    palmTrees.push({
      trunkX: W - 9 - Math.floor(Math.random() * 5),
      baseY: horizonY + 6,
      height: 5 + Math.floor(Math.random() * 2),
      lean: -1
    });
  }
}

function spawnNeonBurst(gx, gy) {
  var chars = ['*', '.', '+', 'o', '~', '#'];
  var hues = [300, 320, 180, 190, 30, 50]; // magenta, cyan, orange
  for (var i = 0; i < 18; i++) {
    var angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    var speed = 2 + Math.random() * 4;
    neonParticles.push({
      x: gx,
      y: gy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6,
      life: 0.8 + Math.random() * 0.6,
      maxLife: 0.8 + Math.random() * 0.6,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: hues[Math.floor(Math.random() * hues.length)]
    });
  }
}

function updateParticles(dt) {
  for (var i = neonParticles.length - 1; i >= 0; i--) {
    var p = neonParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) neonParticles.splice(i, 1);
  }
}

function renderSynthwave() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var dt = 1 / 60;

  // Regenerate city if screen resized
  if (cityGenCols !== W) {
    generateCity();
    generateStars();
    generatePalms();
  }

  // Beat pulse (sine wave at 120 BPM)
  var beat = Math.sin(t * BEAT_HZ * Math.PI * 2);
  var beatPulse = beat * 0.5 + 0.5; // 0..1
  var beatHard = Math.max(0, beat); // 0..1 only positive half

  // Parallax from mouse X
  var targetParallax = (pointer.gx / W - 0.5) * 6;
  parallaxX += (targetParallax - parallaxX) * 0.05;

  // Click detection
  if (pointer.clicked && !wasClicked) {
    spawnNeonBurst(pointer.gx, pointer.gy);
  }
  wasClicked = pointer.clicked;
  pointer.clicked = false;

  // Update particles
  updateParticles(dt);

  // Grid scroll
  gridScroll += dt * 3;

  // === Layout ===
  var horizonY = Math.floor(H * 0.45);
  var sunCenterX = Math.floor(W / 2);
  var sunCenterY = horizonY - 1;
  var sunRadius = Math.min(8, Math.floor(W * 0.08));

  // ============================================
  // 1. SKY — purple gradient
  // ============================================
  for (var y = 0; y < horizonY; y++) {
    var skyRatio = y / horizonY; // 0=top, 1=horizon
    var skyHue = 260 - skyRatio * 30; // deep purple to blue-purple
    var skyLum = 3 + skyRatio * 6;
    // CRT scan line effect
    var scanDim = (y % 3 === 0) ? 0.7 : 1.0;
    for (var x = 0; x < W; x++) {
      if ((x + y * 3) % 7 === 0) {
        drawCharHSL('.', x, y, skyHue, 30, skyLum * scanDim);
      }
    }
  }

  // ============================================
  // 2. STARS — twinkling
  // ============================================
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var twinkle = Math.sin(t * s.twinkleSpeed + s.twinklePhase) * 0.5 + 0.5;
    if (twinkle > 0.1) {
      var starLum = 35 + twinkle * 50;
      var starHue = 200 + Math.sin(s.twinklePhase) * 40;
      var sx = s.x + Math.round(parallaxX * 0.3);
      if (sx >= 0 && sx < W) {
        drawCharHSL(s.ch, sx, s.y, starHue, 20, starLum);
      }
    }
  }

  // ============================================
  // 3. SUN — half circle with stripe lines
  // ============================================
  for (var sy = -sunRadius; sy <= 1; sy++) {
    var drawY = sunCenterY + sy;
    if (drawY < 0 || drawY >= H) continue;
    // Circle width at this row
    var rowDist = Math.abs(sy) / sunRadius;
    var halfWidth = Math.floor(sunRadius * Math.sqrt(1 - rowDist * rowDist));

    // Stripe gap — classic retrowave horizontal lines through sun
    var isStripe = (sy % 2 === 0 && sy < 0);

    for (var dx = -halfWidth; dx <= halfWidth; dx++) {
      var drawX = sunCenterX + dx + Math.round(parallaxX * 0.2);
      if (drawX < 0 || drawX >= W) continue;

      // Sun gradient: top=yellow, bottom=orange/red
      var sunGrad = (sy + sunRadius) / (sunRadius * 2);
      var sunHue = 50 - sunGrad * 40; // yellow(50) to orange(10)
      var sunLum = 55 + beatPulse * 10 - sunGrad * 15;

      if (isStripe) {
        // Dark stripe through sun
        drawCharHSL(' ', drawX, drawY, 0, 0, 0);
      } else {
        // Sun body — use block chars for solidity
        var sunCh = (Math.abs(dx) === halfWidth) ? '|' : '=';
        drawCharHSL(sunCh, drawX, drawY, sunHue, 90, sunLum);
      }
    }
  }

  // Sun top glow
  for (var dx = -sunRadius - 2; dx <= sunRadius + 2; dx++) {
    var gx = sunCenterX + dx + Math.round(parallaxX * 0.2);
    var gy = sunCenterY - sunRadius - 1;
    if (gx >= 0 && gx < W && gy >= 0) {
      var glowDist = Math.abs(dx) / (sunRadius + 2);
      if (glowDist < 1) {
        drawCharHSL('~', gx, gy, 40, 80, 30 + (1 - glowDist) * 20 + beatPulse * 8);
      }
    }
  }

  // ============================================
  // 4. CITY SILHOUETTE on horizon
  // ============================================
  for (var x = 0; x < W; x++) {
    var ch = cityHeights[x] || 0;
    if (ch === 0) continue;
    var cx = x + Math.round(parallaxX * 0.4);
    if (cx < 0 || cx >= W) continue;
    for (var dy = 0; dy < ch; dy++) {
      var cy = horizonY - dy - 1;
      if (cy < 0 || cy >= H) continue;
      // Building chars — darker at base, lighter at top
      var bRatio = dy / ch;
      var bCh = (dy === ch - 1) ? '_' : (bRatio > 0.6 ? '|' : '#');
      // Occasional window lights
      if (bCh === '#' && Math.sin(x * 7.3 + dy * 3.1) > 0.4) {
        // Lit window with halo
        var winHue = 40 + Math.sin(x * 2.1 + t) * 20;
        var winBright = 40 + beatPulse * 8;
        drawCharHSL(bCh, cx, cy, winHue, 65, winBright);
        // Halo glow around lit windows
        if (cx - 1 >= 0) drawCharHSL('.', cx - 1, cy, winHue, 30, winBright * 0.35);
        if (cx + 1 < W) drawCharHSL('.', cx + 1, cy, winHue, 30, winBright * 0.35);
      } else {
        drawCharHSL(bCh, cx, cy, 270, 15, 8 + bRatio * 6);
      }
    }
  }

  // ============================================
  // 5. HORIZON LINE
  // ============================================
  for (var x = 0; x < W; x++) {
    var hGlow = Math.sin(x * 0.15 + t * 2) * 0.3 + 0.7;
    drawCharHSL('=', x, horizonY, 300, 85, 35 + hGlow * 20 + beatPulse * 15);
  }

  // ============================================
  // 6. PERSPECTIVE GRID FLOOR
  // ============================================
  var gridRows = H - horizonY - 1;
  for (var gy = 1; gy <= gridRows; gy++) {
    var drawY = horizonY + gy;
    if (drawY >= H) break;

    // Perspective: rows closer to horizon are more compressed
    var depthRatio = gy / gridRows; // 0=horizon, 1=bottom
    var perspScale = depthRatio * depthRatio; // quadratic for perspective

    // Horizontal grid lines — spaced by perspective
    var isHLine = false;
    var gridSpacing = 3 + (1 - perspScale) * 8;
    var scrolledY = gy + gridScroll * (1 + depthRatio * 4);
    if (Math.floor(scrolledY) % Math.max(1, Math.floor(gridSpacing)) === 0) {
      isHLine = true;
    }

    // Grid line brightness pulsing with beat
    var gridLum = 25 + beatPulse * 18 + depthRatio * 15;
    var gridHue = 310; // hot pink/magenta

    for (var x = 0; x < W; x++) {
      // Vertical grid lines — converge toward center at horizon
      var centerOff = x - W / 2 + parallaxX * depthRatio * 2;
      var vLineSpacing = 4 + (1 - perspScale) * 12;
      var isVLine = Math.abs(centerOff % vLineSpacing) < 0.8;

      if (isHLine && isVLine) {
        drawCharHSL('+', x, drawY, gridHue, 80, gridLum + 8);
      } else if (isHLine) {
        drawCharHSL('-', x, drawY, gridHue, 70, gridLum);
      } else if (isVLine) {
        drawCharHSL('|', x, drawY, gridHue, 70, gridLum - 3);
      } else if (gy % 2 === 0 && x % 6 === 0) {
        // Sparse dots for depth
        drawCharHSL('.', x, drawY, gridHue, 30, 6 + depthRatio * 4);
      }
    }
  }

  // ============================================
  // 7. PALM TREES
  // ============================================
  for (var pi = 0; pi < palmTrees.length; pi++) {
    var palm = palmTrees[pi];
    var px = palm.trunkX + Math.round(parallaxX * 0.6);
    if (px < 0 || px >= W) continue;

    // Trunk
    for (var ty = 0; ty < palm.height; ty++) {
      var trunkY = palm.baseY - ty;
      if (trunkY < 0 || trunkY >= H) continue;
      var trunkX = px + Math.round(ty * palm.lean * 0.15);
      if (trunkX < 0 || trunkX >= W) continue;
      drawCharHSL('|', trunkX, trunkY, 100, 20, 10 + ty * 2);
    }

    // Fronds (top of tree)
    var topY = palm.baseY - palm.height;
    var topX = px + Math.round(palm.height * palm.lean * 0.15);
    var frondChars = [
      { dx: 0, dy: -1, ch: '^' },
      { dx: -1, dy: -1, ch: '/' },
      { dx: 1, dy: -1, ch: '\\' },
      { dx: -2, dy: 0, ch: '~' },
      { dx: 2, dy: 0, ch: '~' },
      { dx: -3, dy: 0, ch: '/' },
      { dx: 3, dy: 0, ch: '\\' },
      { dx: -3, dy: 1, ch: '/' },
      { dx: 3, dy: 1, ch: '\\' },
      { dx: -4, dy: 1, ch: '_' },
      { dx: 4, dy: 1, ch: '_' },
      { dx: 0, dy: 0, ch: '#' },
      { dx: -1, dy: 0, ch: '{' },
      { dx: 1, dy: 0, ch: '}' }
    ];
    // Gentle sway
    var sway = Math.sin(t * 0.8 + pi * 2) * 0.5;
    for (var fi = 0; fi < frondChars.length; fi++) {
      var f = frondChars[fi];
      var fx = topX + f.dx + Math.round(sway);
      var fy = topY + f.dy;
      if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
        drawCharHSL(f.ch, fx, fy, 140, 35, 12 + beatPulse * 4);
      }
    }
  }

  // ============================================
  // 8. CRT SCAN LINES (subtle vertical)
  // ============================================
  for (var x = 0; x < W; x++) {
    if (x % 4 === 0) {
      for (var y = 0; y < H; y++) {
        if (y % 5 === 0) {
          drawCharHSL('|', x, y, 280, 5, 3);
        }
      }
    }
  }

  // ============================================
  // 9. TITLE TEXT — "SYNTHWAVE" chrome cycling
  // ============================================
  var titleY = Math.max(2, sunCenterY - sunRadius - 4);
  var titleX = Math.floor(W / 2 - TITLE.length / 2) + Math.round(parallaxX * 0.15);
  for (var i = 0; i < TITLE.length; i++) {
    var cx = titleX + i;
    if (cx < 0 || cx >= W) continue;
    // Metallic color cycling — chrome effect
    var chromeHue = (t * 60 + i * 35) % 360;
    var chromeLum = 65 + Math.sin(t * 3 + i * 0.8) * 18 + beatHard * 15;
    var chromeSat = 70 + Math.sin(t * 2 + i * 0.5) * 20;
    drawCharHSL(TITLE[i], cx, titleY, chromeHue, chromeSat, chromeLum);

    // Glow halo above title
    if (titleY - 1 >= 0) {
      drawCharHSL('.', cx, titleY - 1, chromeHue, chromeSat * 0.4, chromeLum * 0.3);
    }

    // Reflection below (dimmer)
    if (titleY + 1 < horizonY) {
      drawCharHSL(TITLE[i], cx, titleY + 1, chromeHue, chromeSat * 0.5, chromeLum * 0.4);
    }
  }

  // Title underline glow
  var ulY = titleY + 2;
  if (ulY < horizonY) {
    for (var i = -2; i < TITLE.length + 2; i++) {
      var ux = titleX + i;
      if (ux >= 0 && ux < W) {
        var ulHue = (t * 80 + i * 25) % 360;
        drawCharHSL('-', ux, ulY, ulHue, 70, 25 + beatPulse * 15);
      }
    }
  }

  // ============================================
  // 10. NEON PARTICLES
  // ============================================
  for (var i = 0; i < neonParticles.length; i++) {
    var p = neonParticles[i];
    var npx = Math.round(p.x);
    var npy = Math.round(p.y);
    if (npx >= 0 && npx < W && npy >= 0 && npy < H) {
      var alpha = p.life / p.maxLife;
      drawCharHSL(p.ch, npx, npy, p.hue, 95, 40 + alpha * 55);
    }
  }

  // ============================================
  // 11. SIDE GLOW BARS — neon accent strips
  // ============================================
  var glowChars = ['|', '|', ':', '|'];
  for (var y = horizonY; y < H; y++) {
    var barPulse = Math.sin(t * BEAT_HZ * Math.PI + y * 0.3) * 0.5 + 0.5;
    // Left glow bar
    if (barPulse > 0.6) {
      drawCharHSL(glowChars[y % 4], 0, y, 180, 85, 20 + barPulse * 30);
    }
    // Right glow bar
    if (barPulse > 0.6) {
      drawCharHSL(glowChars[y % 4], W - 1, y, 180, 85, 20 + barPulse * 30);
    }
  }
}

function attachSynthwave() {
  // No special event listeners needed — we use pointer from core
}

function cleanupSynthwave() {
  stars = [];
  neonParticles = [];
  palmTrees = [];
  cityHeights = [];
}

registerMode('synthwave', { init: initSynthwave, render: renderSynthwave, attach: attachSynthwave, cleanup: cleanupSynthwave });
