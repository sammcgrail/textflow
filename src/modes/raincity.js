import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Rain City — cyberpunk rainy cityscape at night
// ============================================================

// Buildings
var buildings = [];
var windows = [];
var neonSigns = [];

// Rain
var raindrops = [];
var splashes = [];

// Flying vehicles
var flyers = [];

// Lightning
var lightningTimer = 0;
var lightningFlash = 0;
var clickLightning = 0;

// Parallax
var mouseX = 0.5;

// Fog
var fogLayer = [];

// Timing
var lastTime = 0;
var elapsed = 0;

// Event handlers
var _mouseMoveHandler = null;
var _clickHandler = null;

// Seeded random for deterministic building generation
var _seed = 12345;
function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed & 0x7fffffff) / 0x7fffffff;
}

// ============================================================
// Neon sign text options
// ============================================================
var neonTexts = [
  'BAR', 'HOTEL', '24H', 'CLUB', 'NEON', 'OPEN',
  'TAXI', 'EXIT', 'LIVE', 'JAZZ', 'EAT',
  '\u30CD\u30AA\u30F3', '\u30D0\u30FC', '\u30DB\u30C6\u30EB',
  '\u9152', '\u591C', '\u96E8',
  'CYBER', 'DATA', 'NOIR', 'TECH', 'VOID'
];

// ============================================================
// init — generate the city
// ============================================================
function init() {
  _seed = 12345;
  buildings = [];
  windows = [];
  neonSigns = [];
  raindrops = [];
  splashes = [];
  flyers = [];
  fogLayer = [];
  lightningTimer = 0;
  lightningFlash = 0;
  clickLightning = 0;
  mouseX = 0.5;
  lastTime = 0;
  elapsed = 0;

  generateCity();
  generateRain();
  generateFog();
  spawnFlyer();
}

// ============================================================
// generateCity — create buildings, windows, neon signs
// ============================================================
function generateCity() {
  var W = state.COLS;
  var H = state.ROWS;
  var groundY = H - 3; // leave 3 rows for reflections
  var minHeight = 8;
  var maxHeight = Math.floor(H * 0.65);

  buildings = [];
  windows = [];
  neonSigns = [];

  var x = 0;
  while (x < W) {
    var bWidth = 4 + Math.floor(seededRandom() * 8);
    if (x + bWidth > W) bWidth = W - x;
    if (bWidth < 2) break;

    var bHeight = minHeight + Math.floor(seededRandom() * (maxHeight - minHeight));
    var topY = groundY - bHeight;

    // Building shade — darker or lighter gray
    var shade = 8 + Math.floor(seededRandom() * 10);
    var bHue = 240 + Math.floor(seededRandom() * 20 - 10);

    buildings.push({
      x: x,
      y: topY,
      w: bWidth,
      h: bHeight,
      shade: shade,
      hue: bHue,
      groundY: groundY
    });

    // Windows on this building
    var winStartX = x + 1;
    var winEndX = x + bWidth - 1;
    var winStartY = topY + 2;
    var winEndY = groundY - 1;

    for (var wy = winStartY; wy < winEndY; wy += 2) {
      for (var wx = winStartX; wx < winEndX; wx += 2) {
        if (wx >= W) continue;
        var lit = seededRandom() > 0.4;
        var flickering = seededRandom() > 0.85;
        var warmth = seededRandom();
        // warm yellow/orange for lit windows
        var winHue = 30 + Math.floor(warmth * 30);
        var winSat = 60 + Math.floor(seededRandom() * 30);
        var winBright = lit ? (50 + Math.floor(seededRandom() * 30)) : 3;

        windows.push({
          x: wx,
          y: wy,
          lit: lit,
          flickering: flickering,
          hue: winHue,
          sat: winSat,
          bright: winBright,
          flickerSpeed: 2 + seededRandom() * 6,
          flickerOffset: seededRandom() * 6.28
        });
      }
    }

    // Neon sign on some buildings
    if (bWidth >= 5 && seededRandom() > 0.45) {
      var text = neonTexts[Math.floor(seededRandom() * neonTexts.length)];
      var signX = x + Math.floor((bWidth - text.length) / 2);
      if (signX < x) signX = x;
      var signY = topY + 1 + Math.floor(seededRandom() * Math.min(4, bHeight - 3));

      // Neon colors: pink, green, cyan, red, purple
      var neonHues = [330, 140, 180, 0, 280, 200, 50];
      var nHue = neonHues[Math.floor(seededRandom() * neonHues.length)];

      neonSigns.push({
        text: text,
        x: signX,
        y: signY,
        hue: nHue,
        flickerSpeed: 1 + seededRandom() * 4,
        flickerOffset: seededRandom() * 6.28,
        glitchChance: 0.003 + seededRandom() * 0.005,
        on: true
      });
    }

    // Gap between buildings
    var gap = Math.floor(seededRandom() * 2);
    x += bWidth + gap;
  }
}

// ============================================================
// generateRain — fill screen with raindrops
// ============================================================
function generateRain() {
  var W = state.COLS;
  var H = state.ROWS;
  var count = Math.floor(W * H * 0.04);

  raindrops = [];
  for (var i = 0; i < count; i++) {
    raindrops.push(makeRaindrop(W, H, true));
  }
}

function makeRaindrop(W, H, randomY) {
  var speed = 8 + Math.random() * 18;
  var chars = ['|', '/', '.', ',', '\'', ':'];
  var ch = chars[Math.floor(Math.random() * chars.length)];
  // heavier rain chars fall faster
  if (ch === '|' || ch === '/') speed = 14 + Math.random() * 14;

  return {
    x: Math.random() * (W + 10) - 5,
    y: randomY ? Math.random() * H : -1 - Math.random() * 8,
    speed: speed,
    drift: -0.3 - Math.random() * 0.8, // slight leftward diagonal
    ch: ch,
    hue: 190 + Math.floor(Math.random() * 30),
    sat: 40 + Math.floor(Math.random() * 30),
    bright: 20 + Math.floor(Math.random() * 25)
  };
}

// ============================================================
// generateFog — mid-height mist layer
// ============================================================
function generateFog() {
  var W = state.COLS;
  var H = state.ROWS;
  var fogY = Math.floor(H * 0.35);
  var fogHeight = Math.floor(H * 0.12);

  fogLayer = [];
  for (var y = fogY; y < fogY + fogHeight && y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (Math.random() > 0.4) {
        var distFromCenter = Math.abs(y - (fogY + fogHeight / 2)) / (fogHeight / 2);
        fogLayer.push({
          x: x,
          y: y,
          bright: 8 + Math.floor((1 - distFromCenter) * 10),
          driftOffset: Math.random() * 6.28
        });
      }
    }
  }
}

// ============================================================
// spawnFlyer — flying car/drone
// ============================================================
function spawnFlyer() {
  var H = state.ROWS;
  var W = state.COLS;
  var direction = Math.random() > 0.5 ? 1 : -1;
  var startX = direction === 1 ? -5 : W + 5;
  var skyY = 2 + Math.floor(Math.random() * Math.floor(H * 0.25));

  // Colors: red, white, blue tail lights
  var flyerHues = [0, 30, 200, 50, 330];
  var hue = flyerHues[Math.floor(Math.random() * flyerHues.length)];

  flyers.push({
    x: startX,
    y: skyY,
    speed: 3 + Math.random() * 8,
    direction: direction,
    hue: hue,
    trail: [],
    trailLen: 3 + Math.floor(Math.random() * 5),
    alive: true
  });
}

// ============================================================
// spawnSplash — rain hitting surface
// ============================================================
function spawnSplash(x, y) {
  var chars = ['v', '*', '.', '~'];
  splashes.push({
    x: Math.round(x),
    y: y,
    life: 0.15 + Math.random() * 0.2,
    maxLife: 0.15 + Math.random() * 0.2,
    ch: chars[Math.floor(Math.random() * chars.length)],
    hue: 190 + Math.floor(Math.random() * 30),
    bright: 30 + Math.floor(Math.random() * 20)
  });
}

// ============================================================
// getBuildingTopAt — find building top y at given x
// ============================================================
function getBuildingTopAt(x) {
  for (var i = 0; i < buildings.length; i++) {
    var b = buildings[i];
    if (x >= b.x && x < b.x + b.w) {
      return b.y;
    }
  }
  return -1;
}

// ============================================================
// update — advance simulation
// ============================================================
function update(dt) {
  var W = state.COLS;
  var H = state.ROWS;
  var groundY = H - 3;

  elapsed += dt;

  // Update rain
  for (var i = raindrops.length - 1; i >= 0; i--) {
    var r = raindrops[i];
    r.y += r.speed * dt;
    r.x += r.drift * dt;

    var rx = Math.round(r.x);
    var ry = Math.round(r.y);

    // Check if rain hits a building top or ground
    var bTop = getBuildingTopAt(rx);
    var hitY = (bTop >= 0 && bTop <= groundY) ? bTop : groundY;

    if (ry >= hitY) {
      // Splash
      if (Math.random() > 0.6) {
        spawnSplash(r.x, hitY);
      }
      // Reset raindrop
      raindrops[i] = makeRaindrop(W, H, false);
    }

    // Off screen sideways
    if (r.x < -5 || r.x > W + 5) {
      raindrops[i] = makeRaindrop(W, H, false);
    }
  }

  // Update splashes
  for (var i = splashes.length - 1; i >= 0; i--) {
    splashes[i].life -= dt;
    if (splashes[i].life <= 0) {
      splashes.splice(i, 1);
    }
  }

  // Update flyers
  for (var i = flyers.length - 1; i >= 0; i--) {
    var f = flyers[i];
    f.x += f.speed * f.direction * dt;

    // Store trail
    f.trail.push({ x: f.x, y: f.y });
    if (f.trail.length > f.trailLen) {
      f.trail.shift();
    }

    // Off screen — remove and spawn new
    if ((f.direction === 1 && f.x > W + 10) || (f.direction === -1 && f.x < -10)) {
      flyers.splice(i, 1);
    }
  }

  // Spawn flyers periodically
  if (flyers.length < 3 && Math.random() < 0.008) {
    spawnFlyer();
  }

  // Random lightning
  if (lightningTimer <= 0 && Math.random() < 0.0008) {
    lightningFlash = 0.15 + Math.random() * 0.1;
    lightningTimer = 5 + Math.random() * 15;
  }
  if (lightningTimer > 0) lightningTimer -= dt;

  // Decay lightning flash
  if (lightningFlash > 0) {
    lightningFlash -= dt * 3;
    if (lightningFlash < 0) lightningFlash = 0;
  }

  // Decay click lightning
  if (clickLightning > 0) {
    clickLightning -= dt * 3;
    if (clickLightning < 0) clickLightning = 0;
  }

  // Flicker neon signs
  for (var i = 0; i < neonSigns.length; i++) {
    var n = neonSigns[i];
    // Occasional glitch off
    if (n.on && Math.random() < n.glitchChance) {
      n.on = false;
    } else if (!n.on && Math.random() < 0.05) {
      n.on = true;
    }
  }

  // Flicker windows
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    if (w.flickering && Math.random() < 0.005) {
      w.lit = !w.lit;
      w.bright = w.lit ? (50 + Math.floor(Math.random() * 30)) : 3;
    }
  }
}

// ============================================================
// render — draw everything
// ============================================================
function render() {
  clearCanvas();

  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var groundY = H - 3;

  // Delta time
  var now = performance.now() / 1000;
  var dt = lastTime === 0 ? (1 / 60) : Math.min(now - lastTime, 0.1);
  lastTime = now;

  // Update simulation
  update(dt);

  // Lightning brightness boost
  var flashBoost = Math.max(lightningFlash, clickLightning);

  // Parallax offset based on mouse
  var parallaxShift = (mouseX - 0.5) * 4;

  // ----------------------------------------------------------
  // Sky — dark blue/purple gradient
  // ----------------------------------------------------------
  var skyEndY = groundY;
  for (var y = 0; y < skyEndY; y++) {
    for (var x = 0; x < W; x++) {
      // Check if building occupies this cell — skip sky draw there
      var inBuilding = false;
      for (var b = 0; b < buildings.length; b++) {
        var bld = buildings[b];
        var bx = Math.round(bld.x + parallaxShift * 0.1);
        if (x >= bx && x < bx + bld.w && y >= bld.y) {
          inBuilding = true;
          break;
        }
      }
      if (inBuilding) continue;

      // Sparse sky dots for atmosphere
      var skyHash = (x * 7919 + y * 104729) % 97;
      if (skyHash < 4) {
        var skyHue = 240 + (y / skyEndY) * 30;
        var skyBright = 3 + flashBoost * 40;
        drawCharHSL('.', x, y, skyHue, 30, skyBright);
      }

      // Stars (only top portion)
      if (y < Math.floor(H * 0.2) && skyHash === 1) {
        var twinkle = Math.sin(t * 2 + x * 0.3 + y * 0.7) * 0.5 + 0.5;
        var starBright = 15 + twinkle * 20 + flashBoost * 50;
        drawCharHSL('.', x, y, 50, 10, starBright);
      }
    }
  }

  // ----------------------------------------------------------
  // Buildings — block chars, back to front layers
  // ----------------------------------------------------------
  var blockChars = ['\u2588', '\u2593', '\u2592', '\u2591'];
  for (var b = 0; b < buildings.length; b++) {
    var bld = buildings[b];
    var bx = Math.round(bld.x + parallaxShift * 0.15);

    for (var by = bld.y; by < bld.groundY; by++) {
      for (var bxx = bx; bxx < bx + bld.w; bxx++) {
        if (bxx < 0 || bxx >= W) continue;

        // Edge vs interior
        var isEdge = (bxx === bx || bxx === bx + bld.w - 1 || by === bld.y);
        var ch;
        if (by === bld.y) {
          ch = blockChars[0]; // solid top
        } else if (isEdge) {
          ch = blockChars[1];
        } else {
          ch = blockChars[2 + ((bxx + by) % 2)];
        }

        var heightRatio = (by - bld.y) / bld.h;
        var bBright = bld.shade + heightRatio * 6 + flashBoost * 35;
        drawCharHSL(ch, bxx, by, bld.hue, 15, bBright);
      }
    }

    // Rooftop details — antenna or ledge
    if (bld.w >= 4) {
      var antennaX = bx + Math.floor(bld.w / 2);
      if (antennaX >= 0 && antennaX < W && bld.y - 1 >= 0) {
        drawCharHSL('|', antennaX, bld.y - 1, 0, 0, 12 + flashBoost * 30);
        if (bld.y - 2 >= 0) {
          // Blinking red light on antenna
          var blinkOn = Math.sin(t * 3 + b * 1.7) > 0.3;
          if (blinkOn) {
            drawCharHSL('*', antennaX, bld.y - 2, 0, 90, 50 + flashBoost * 30);
          }
        }
      }
    }
  }

  // ----------------------------------------------------------
  // Windows
  // ----------------------------------------------------------
  for (var i = 0; i < windows.length; i++) {
    var w = windows[i];
    var wx = Math.round(w.x + parallaxShift * 0.15);
    if (wx < 0 || wx >= W || w.y < 0 || w.y >= H) continue;

    var bright = w.bright;
    if (w.flickering && w.lit) {
      var flicker = Math.sin(t * w.flickerSpeed + w.flickerOffset);
      bright = w.bright + flicker * 12;
    }
    bright += flashBoost * 25;

    if (w.lit) {
      drawCharHSL('\u2588', wx, w.y, w.hue, w.sat, bright);
    } else {
      drawCharHSL('\u2591', wx, w.y, 240, 10, 4 + flashBoost * 20);
    }
  }

  // ----------------------------------------------------------
  // Neon signs
  // ----------------------------------------------------------
  for (var i = 0; i < neonSigns.length; i++) {
    var n = neonSigns[i];
    if (!n.on) {
      // Draw dim/off sign occasionally
      if (Math.random() > 0.7) {
        for (var c = 0; c < n.text.length; c++) {
          var nx = Math.round(n.x + c + parallaxShift * 0.15);
          if (nx >= 0 && nx < W) {
            drawCharHSL(n.text[c], nx, n.y, n.hue, 20, 5);
          }
        }
      }
      continue;
    }

    // Glow intensity oscillation
    var glow = Math.sin(t * n.flickerSpeed + n.flickerOffset) * 0.3 + 0.7;
    var nBright = 55 + glow * 40 + flashBoost * 15;
    var nSat = 80 + glow * 15;

    for (var c = 0; c < n.text.length; c++) {
      var nx = Math.round(n.x + c + parallaxShift * 0.15);
      if (nx < 0 || nx >= W) continue;

      drawCharHSL(n.text[c], nx, n.y, n.hue, nSat, nBright);

      // Glow halo above/below
      if (n.y - 1 >= 0 && glow > 0.4) {
        drawCharHSL('\u2591', nx, n.y - 1, n.hue, 50, 12 + glow * 12);
      }
      if (n.y + 1 < H) {
        drawCharHSL('\u2591', nx, n.y + 1, n.hue, 50, 10 + glow * 10);
      }
      // Side glow
      if (nx - 1 >= 0 && glow > 0.5) {
        drawCharHSL('\u2591', nx - 1, n.y, n.hue, 35, 8 + glow * 8);
      }
      if (nx + 1 < W && glow > 0.5) {
        drawCharHSL('\u2591', nx + 1, n.y, n.hue, 35, 8 + glow * 8);
      }
    }
  }

  // ----------------------------------------------------------
  // Fog / mist layer
  // ----------------------------------------------------------
  for (var i = 0; i < fogLayer.length; i++) {
    var f = fogLayer[i];
    var fx = Math.round(f.x + parallaxShift * 0.05 + Math.sin(t * 0.3 + f.driftOffset) * 1.5);
    if (fx < 0 || fx >= W) continue;

    var fogAlpha = (Math.sin(t * 0.5 + f.driftOffset) * 0.5 + 0.5) * f.bright;
    drawCharHSL('\u2591', fx, f.y, 220, 10, fogAlpha + flashBoost * 10);
  }

  // ----------------------------------------------------------
  // Rain
  // ----------------------------------------------------------
  for (var i = 0; i < raindrops.length; i++) {
    var r = raindrops[i];
    var rx = Math.round(r.x + parallaxShift * 0.02);
    var ry = Math.round(r.y);
    if (rx < 0 || rx >= W || ry < 0 || ry >= H) continue;

    var rBright = r.bright + flashBoost * 40;
    drawCharHSL(r.ch, rx, ry, r.hue, r.sat, rBright);
  }

  // ----------------------------------------------------------
  // Splashes
  // ----------------------------------------------------------
  for (var i = 0; i < splashes.length; i++) {
    var s = splashes[i];
    if (s.x < 0 || s.x >= W || s.y < 0 || s.y >= H) continue;

    var alpha = s.life / s.maxLife;
    var sBright = s.bright * alpha + flashBoost * 20;
    drawCharHSL(s.ch, s.x, s.y, s.hue, 50, sBright);
  }

  // ----------------------------------------------------------
  // Flying vehicles
  // ----------------------------------------------------------
  for (var i = 0; i < flyers.length; i++) {
    var f = flyers[i];
    var fx = Math.round(f.x + parallaxShift * 0.3);
    var fy = f.y;

    // Draw trail
    for (var j = 0; j < f.trail.length; j++) {
      var tx = Math.round(f.trail[j].x + parallaxShift * 0.3);
      var ty = f.trail[j].y;
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        var trailAlpha = (j + 1) / f.trail.length;
        var tBright = 10 + trailAlpha * 15;
        drawCharHSL('-', tx, ty, f.hue, 50, tBright);
      }
    }

    // Draw vehicle body
    if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
      drawCharHSL('*', fx, fy, f.hue, 80, 55 + flashBoost * 20);

      // Blinking nav light
      var navBlink = Math.sin(t * 8 + i * 2) > 0;
      if (navBlink && fx + f.direction >= 0 && fx + f.direction < W) {
        drawCharHSL('.', fx + f.direction, fy, 0, 90, 45);
      }
    }
  }

  // ----------------------------------------------------------
  // Ground line — wet pavement
  // ----------------------------------------------------------
  for (var x = 0; x < W; x++) {
    var wetChar = (x % 3 === 0) ? '\u2593' : '\u2592';
    var wetHue = 220;
    var wetBright = 6 + Math.sin(t * 0.7 + x * 0.5) * 2 + flashBoost * 25;
    drawCharHSL(wetChar, x, groundY, wetHue, 20, wetBright);
  }

  // ----------------------------------------------------------
  // Reflections on wet ground (rows below groundY)
  // ----------------------------------------------------------
  var reflRows = H - groundY - 1;
  for (var ry = 1; ry <= reflRows; ry++) {
    var drawY = groundY + ry;
    if (drawY >= H) break;

    for (var x = 0; x < W; x++) {
      // Mirror y position into the city
      var mirrorY = groundY - ry;
      if (mirrorY < 0) continue;

      // Find if a lit window exists at mirrorY
      var foundWindow = false;
      for (var wi = 0; wi < windows.length; wi++) {
        var ww = windows[wi];
        var wwx = Math.round(ww.x + parallaxShift * 0.15);
        if (wwx === x && ww.y === mirrorY && ww.lit) {
          // Draw reflection — dimmer, distorted
          var distortion = Math.sin(t * 2 + x * 0.8) * 0.4;
          var refBright = ww.bright * 0.4 + distortion * 6 + flashBoost * 12;
          if (refBright > 3) {
            var refChar = (Math.random() > 0.7) ? '\u2591' : '.';
            drawCharHSL(refChar, x, drawY, ww.hue, ww.sat * 0.6, refBright);
          }
          foundWindow = true;
          break;
        }
      }

      // Reflect neon signs
      if (!foundWindow) {
        for (var ni = 0; ni < neonSigns.length; ni++) {
          var nn = neonSigns[ni];
          if (!nn.on) continue;
          var nnY = nn.y;
          if (nnY !== mirrorY) continue;

          for (var c = 0; c < nn.text.length; c++) {
            var nnx = Math.round(nn.x + c + parallaxShift * 0.15);
            if (nnx === x) {
              var refGlow = Math.sin(t * nn.flickerSpeed + nn.flickerOffset) * 0.3 + 0.7;
              var refBright2 = 15 + refGlow * 15 + flashBoost * 10;
              var refDistort = Math.sin(t * 1.5 + x * 1.2);
              if (refDistort > -0.3) {
                drawCharHSL('\u2591', x, drawY, nn.hue, 55, refBright2 * 0.65);
              }
              foundWindow = true;
              break;
            }
          }
          if (foundWindow) break;
        }
      }

      // Base wet ground reflection (dim blue)
      if (!foundWindow && Math.random() > 0.85) {
        var wetRef = 2 + Math.sin(t * 0.4 + x * 0.3) * 1.5 + flashBoost * 15;
        if (wetRef > 1) {
          drawCharHSL('.', x, drawY, 220, 15, wetRef);
        }
      }
    }
  }

  // ----------------------------------------------------------
  // Lightning full-screen flash overlay
  // ----------------------------------------------------------
  if (flashBoost > 0.05) {
    var flashBright = flashBoost * 12;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        // Very sparse overlay to simulate brightening without overwriting
        var flashHash = (x * 3571 + y * 8713 + Math.floor(t * 100)) % 47;
        if (flashHash < 3) {
          drawCharHSL('\u2591', x, y, 220, 5, flashBright);
        }
      }
    }
  }
}

// ============================================================
// attach — event listeners
// ============================================================
function attach() {
  cleanup();

  _mouseMoveHandler = function(e) {
    if (state.currentMode !== 'raincity') return;
    var rect = state.canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseX = Math.max(0, Math.min(1, mouseX));
  };
  window.addEventListener('mousemove', _mouseMoveHandler);

  _clickHandler = function(e) {
    if (state.currentMode !== 'raincity') return;
    // Trigger lightning
    clickLightning = 0.3 + Math.random() * 0.15;
  };
  state.canvas.addEventListener('click', _clickHandler);
}

// ============================================================
// cleanup — remove event listeners
// ============================================================
function cleanup() {
  if (_mouseMoveHandler) {
    window.removeEventListener('mousemove', _mouseMoveHandler);
    _mouseMoveHandler = null;
  }
  if (_clickHandler && state.canvas) {
    state.canvas.removeEventListener('click', _clickHandler);
    _clickHandler = null;
  }
}

registerMode('raincity', { init: init, render: render, attach: attach, cleanup: cleanup });
