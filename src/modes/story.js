import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Story mode — interactive webcam face adventure with 7 scenes
// Pure ASCII, no R3F overlay. Dark, psychedelic descent.

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.js';

var facemeshLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var vidCanvas = null;
var vidCtx = null;

var faces = [];
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Face state
var faceX = 0.5, faceY = 0.5, faceR = 0.1, faceVisible = false;

// Scene state
var currentScene = 0;
var sceneStartTime = 0;
var sceneElapsed = 0;
var transitioning = false;
var transitionStart = 0;
var transitionCols = null; // per-column flip progress

// Game stats
var gatesPassed = 0;
var depth = 0;

// Scene-specific state
var portalX = 0, portalY = 0, portalOverlapTime = 0;
var gauntletHoles = [], gauntletIdx = 0, gauntletOverlap = 0;
var shrinkStructures = [];
var mazeGrid = null, mazeW = 0, mazeH = 0, mazeCurX = 0, mazeCurY = 0;
var mazeVisited = null, mazeGenDone = false, mazeStack = [];
var descentBands = [], descentSurvived = 0;

// Particles
var particles = [];
var MAX_PARTICLES = 150;

// ASCII ramps
var ASCII_RAMP = ' .:-=+*#%@';
var WALL_CHARS = '#%@$&';
var BONE_CHARS = '|{}()[]';
var SPIRAL_CHARS = '@#%*+=~:;.';

// Creepy text fragments
var FRAGMENTS = ['NO ESCAPE', 'DEEPER', 'YOUR FACE IS THE KEY', 'DESCEND',
  'ENTER', 'NO RETURN', 'CONSUME', 'DISSOLVE', 'FORGET', 'BECOME'];

// Scene durations in seconds
var SCENE_DURATIONS = [8, 15, 12, 20, 10, 12, 10];

// =========================================================
// Webcam & face tracking (same pattern as fruiteat.js)
// =========================================================
function startWebcam() {
  if (webcamReady && webcamEl && webcamEl.srcObject && webcamEl.srcObject.active) return;
  webcamReady = false;
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  }).then(function(stream) {
    webcamEl.srcObject = stream;
    webcamEl.play().catch(function(){});
    webcamEl.onloadeddata = function() { webcamReady = true; };
  }).catch(function(err) {
    webcamDenied = true;
    loadError = 'Camera denied: ' + err.message;
    loading = false;
  });
}

function loadFacemeshLib() {
  if (facemeshLib) { initDetector(); return; }
  if (!navigator.gpu) {
    loadError = 'no WebGPU — face tracking unavailable';
    loading = false;
    return;
  }
  import(/* webpackIgnore: true */ CDN_URL).then(function(mod) {
    facemeshLib = mod.createFacemesh || (mod.default && mod.default.createFacemesh) || mod;
    if (typeof facemeshLib === 'object' && facemeshLib.createFacemesh) {
      facemeshLib = facemeshLib.createFacemesh;
    }
    initDetector();
  }).catch(function(err) {
    loadError = 'Failed to load facemesh: ' + err.message;
    loading = false;
  });
}

function initDetector() {
  if (!facemeshLib || detector) { loading = false; return; }
  facemeshLib({ maxFaces: 1 }).then(function(fm) {
    detector = fm;
    loading = false;
  }).catch(function(err) {
    loadError = 'Facemesh init failed: ' + err.message;
    loading = false;
  });
}

function detectFaces() {
  if (!detector || !webcamReady || detecting) return;
  if (webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    faces = result || [];
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateFaceState() {
  if (faces.length === 0) { faceVisible = false; return; }
  var face = faces[0];
  var lm = face.landmarks;
  if (!lm || lm.length < 468) { faceVisible = false; return; }
  var minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (var i = 0; i < lm.length; i++) {
    var mx = 1 - lm[i].x;
    var my = lm[i].y;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }
  faceX = (minX + maxX) / 2;
  faceY = (minY + maxY) / 2;
  faceR = Math.max(maxX - minX, maxY - minY) / 2;
  faceVisible = true;
}

// =========================================================
// Particles
// =========================================================
function spawnParticle(x, y, hue, ch) {
  if (particles.length >= MAX_PARTICLES) return;
  var angle = Math.random() * Math.PI * 2;
  var speed = 0.005 + Math.random() * 0.015;
  particles.push({
    x: x, y: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue: hue, ch: ch, life: 25 + Math.random() * 20
  });
}

function spawnBurst(x, y, hue, count) {
  for (var i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    var ch = SPIRAL_CHARS[Math.floor(Math.random() * SPIRAL_CHARS.length)];
    spawnParticle(x, y, hue + Math.random() * 60, ch);
  }
}

function updateParticles() {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.0002;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function renderParticles(W, H) {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.floor(p.x * W);
    var py = Math.floor(p.y * H);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    var alpha = p.life / 45;
    drawCharHSL(p.ch, px, py, p.hue, 80, 20 + alpha * 40);
  }
}

// =========================================================
// Scene transitions
// =========================================================
function startTransition() {
  transitioning = true;
  transitionStart = state.time;
  var W = state.COLS;
  transitionCols = new Float32Array(W);
  for (var i = 0; i < W; i++) {
    transitionCols[i] = Math.random() * 0.8; // random delay per column
  }
}

function renderTransition(W, H) {
  var elapsed = state.time - transitionStart;
  var done = true;
  for (var x = 0; x < W; x++) {
    var colProgress = (elapsed - transitionCols[x]) / 0.3;
    if (colProgress < 1) { done = false; continue; }
    // Glitch scanline
    for (var y = 0; y < H; y++) {
      var glitchChar = SPIRAL_CHARS[Math.floor(Math.random() * SPIRAL_CHARS.length)];
      var hue = (280 + Math.random() * 60) % 360;
      drawCharHSL(glitchChar, x, y, hue, 60, 10 + Math.random() * 20);
    }
  }
  if (done && elapsed > 1.0) {
    transitioning = false;
    advanceScene();
  }
}

function advanceScene() {
  currentScene = (currentScene + 1) % 7;
  sceneStartTime = state.time;
  depth++;
  initCurrentScene();
}

// =========================================================
// Scene initialization
// =========================================================
function initCurrentScene() {
  particles = [];
  switch (currentScene) {
    case 0: initPortal(); break;
    case 1: initGauntlet(); break;
    case 2: initShrink(); break;
    case 3: initMaze(); break;
    case 4: break; // kaleidoscope needs no init
    case 5: initDescent(); break;
    case 6: break; // finale needs no init
  }
}

function initPortal() {
  portalX = 0.2 + Math.random() * 0.6;
  portalY = 0.2 + Math.random() * 0.6;
  portalOverlapTime = 0;
}

function initGauntlet() {
  gauntletIdx = 0;
  gauntletOverlap = 0;
  gauntletHoles = [];
  for (var i = 0; i < 3; i++) {
    gauntletHoles.push({
      x: 0.2 + Math.random() * 0.6,
      y: 0.2 + Math.random() * 0.6,
      radius: 0.12 - i * 0.025
    });
  }
}

function initShrink() {
  shrinkStructures = [];
  for (var i = 0; i < 12; i++) {
    shrinkStructures.push({
      x: Math.random(),
      y: Math.random(),
      w: 0.05 + Math.random() * 0.12,
      h: 0.15 + Math.random() * 0.4,
      char: BONE_CHARS[Math.floor(Math.random() * BONE_CHARS.length)]
    });
  }
}

function initMaze() {
  mazeW = 15;
  mazeH = 10;
  mazeGrid = new Uint8Array(mazeW * mazeH);
  mazeCurX = 1;
  mazeCurY = 1;
  mazeGrid[mazeCurY * mazeW + mazeCurX] = 1;
  mazeStack = [{ x: 1, y: 1 }];
  mazeGenDone = false;
  mazeVisited = new Uint8Array(mazeW * mazeH);
  // Generate entire maze immediately
  while (mazeStack.length > 0) {
    var cur = mazeStack[mazeStack.length - 1];
    var dirs = [{ dx: 0, dy: -2 }, { dx: 2, dy: 0 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }];
    var nbrs = [];
    for (var d = 0; d < dirs.length; d++) {
      var nx = cur.x + dirs[d].dx, ny = cur.y + dirs[d].dy;
      if (nx > 0 && nx < mazeW - 1 && ny > 0 && ny < mazeH - 1 && mazeGrid[ny * mazeW + nx] === 0) {
        nbrs.push({ x: nx, y: ny, wx: cur.x + dirs[d].dx / 2, wy: cur.y + dirs[d].dy / 2 });
      }
    }
    if (nbrs.length > 0) {
      var pick = nbrs[Math.floor(Math.random() * nbrs.length)];
      mazeGrid[pick.wy * mazeW + pick.wx] = 1;
      mazeGrid[pick.y * mazeW + pick.x] = 1;
      mazeStack.push({ x: pick.x, y: pick.y });
    } else {
      mazeStack.pop();
    }
  }
  mazeGenDone = true;
  mazeCurX = 1;
  mazeCurY = 1;
  mazeVisited[mazeCurY * mazeW + mazeCurX] = 1;
}

function initDescent() {
  descentBands = [];
  descentSurvived = 0;
  for (var i = 0; i < 6; i++) {
    descentBands.push({
      y: 0.2 + i * 0.15,
      gapX: 0.1 + Math.random() * 0.6,
      gapW: 0.15 + Math.random() * 0.1,
      speed: 0.03 + Math.random() * 0.02
    });
  }
}

// =========================================================
// Webcam-to-ASCII rendering helper
// =========================================================
function getWebcamData(W, H) {
  if (!webcamReady || webcamEl.readyState < 2) return null;
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }
  vidCtx.save();
  vidCtx.translate(W, 0);
  vidCtx.scale(-1, 1);
  vidCtx.drawImage(webcamEl, 0, 0, W, H);
  vidCtx.restore();
  return vidCtx.getImageData(0, 0, W, H).data;
}

function drawFaceASCII(imgData, W, H, cx, cy, radius, hueOffset, saturation, lightMult) {
  if (!imgData) return;
  var gx = Math.floor(cx * W), gy = Math.floor(cy * H);
  var gr = Math.floor(radius * Math.max(W, H));
  var x0 = Math.max(0, gx - gr), x1 = Math.min(W - 1, gx + gr);
  var y0 = Math.max(0, gy - gr), y1 = Math.min(H - 1, gy + gr);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var dx = x - gx, dy = y - gy;
      if (dx * dx + dy * dy > gr * gr) continue;
      var pi = (y * W + x) * 4;
      var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
      var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var rampIdx = Math.floor(brightness * (ASCII_RAMP.length - 1));
      var ch = ASCII_RAMP[rampIdx];
      if (ch === ' ') continue;
      var hue = (hueOffset + brightness * 40) % 360;
      drawCharHSL(ch, x, y, hue, saturation, brightness * 50 * lightMult);
    }
  }
}

// =========================================================
// Helper: draw centered text
// =========================================================
function drawText(text, cx, cy, W, H, hue, sat, lit) {
  var sx = Math.floor(cx * W - text.length / 2);
  var sy = Math.floor(cy * H);
  for (var i = 0; i < text.length; i++) {
    if (sx + i >= 0 && sx + i < W && sy >= 0 && sy < H) {
      drawCharHSL(text[i], sx + i, sy, hue, sat, lit);
    }
  }
}

// =========================================================
// Scene 0: PORTAL
// =========================================================
function renderPortal(W, H, t, dt) {
  // Swirling spiral text
  var spiralSpeed = t * 0.8;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * 2;
      var ny = (y / H - 0.5) * 2;
      var angle = Math.atan2(ny, nx);
      var dist = Math.sqrt(nx * nx + ny * ny);
      var spiral = Math.sin(angle * 5 + dist * 8 - spiralSpeed * 4) * 0.5 + 0.5;
      if (spiral > 0.35) {
        var ci = Math.floor((angle * 3 + dist * 10 + t * 2) * 2) % SPIRAL_CHARS.length;
        if (ci < 0) ci += SPIRAL_CHARS.length;
        var ch = SPIRAL_CHARS[ci];
        var hue = (270 + t * 30 + dist * 40) % 360; // purple to magenta
        var lit = 10 + spiral * 25;
        drawCharHSL(ch, x, y, hue, 70, lit);
      }
    }
  }

  // Portal ring (cyan)
  var prx = Math.floor(portalX * W), pry = Math.floor(portalY * H);
  var portalRadius = Math.floor(Math.min(W, H) * 0.08);
  for (var a = 0; a < 60; a++) {
    var ang = (a / 60) * Math.PI * 2;
    var pulse = 1 + Math.sin(t * 6) * 0.1;
    var rx = Math.floor(prx + Math.cos(ang) * portalRadius * pulse);
    var ry = Math.floor(pry + Math.sin(ang) * portalRadius * 0.5 * pulse);
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
      var lit2 = 40 + Math.sin(t * 8 + a * 0.3) * 15;
      drawCharHSL('O', rx, ry, 180, 90, lit2);
    }
  }

  // Text fragments
  var fragIdx = Math.floor(t * 0.7) % 3;
  var frag = ['ENTER', 'DESCEND', 'NO RETURN'][fragIdx];
  var fragAlpha = Math.sin(t * 3) * 0.5 + 0.5;
  drawText(frag, 0.5, 0.15, W, H, 300, 60, 15 + fragAlpha * 25);

  // Check face overlap with portal
  if (faceVisible) {
    var fdx = faceX - portalX, fdy = faceY - portalY;
    var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
    if (fdist < 0.12) {
      portalOverlapTime += dt;
      // Flash portal brighter
      for (var fa = 0; fa < 40; fa++) {
        var fang = (fa / 40) * Math.PI * 2;
        var frx = Math.floor(prx + Math.cos(fang) * portalRadius * 1.2);
        var fry = Math.floor(pry + Math.sin(fang) * portalRadius * 0.6);
        if (frx >= 0 && frx < W && fry >= 0 && fry < H) {
          drawCharHSL('*', frx, fry, 180, 100, 60);
        }
      }
      if (portalOverlapTime > 0.5) {
        spawnBurst(portalX, portalY, 180, 40);
        startTransition();
      }
    } else {
      portalOverlapTime = Math.max(0, portalOverlapTime - dt * 2);
    }
  }

  // Auto-advance if too long
  if (sceneElapsed > SCENE_DURATIONS[0] + 5) startTransition();
}

// =========================================================
// Scene 1: THE GAUNTLET
// =========================================================
function renderGauntlet(W, H, t, dt) {
  var imgData = getWebcamData(W, H);

  if (gauntletIdx >= 3) { startTransition(); return; }
  var hole = gauntletHoles[gauntletIdx];
  var holeGX = Math.floor(hole.x * W), holeGY = Math.floor(hole.y * H);
  var holeGR = Math.floor(hole.radius * Math.min(W, H));

  // Dense fleshy wall
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - holeGX, dy = y - holeGY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < holeGR) {
        // Inside hole — render face ASCII
        if (faceVisible && imgData) {
          // Map face region into hole
          var fu = (dx / holeGR) * 0.5 + 0.5;
          var fv = (dy / holeGR) * 0.5 + 0.5;
          var srcX = Math.floor(faceX * W + (fu - 0.5) * faceR * W * 2);
          var srcY = Math.floor(faceY * H + (fv - 0.5) * faceR * H * 2);
          if (srcX >= 0 && srcX < W && srcY >= 0 && srcY < H) {
            var pi = (srcY * W + srcX) * 4;
            var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
            var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            var rampIdx = Math.floor(brightness * (ASCII_RAMP.length - 1));
            var ch = ASCII_RAMP[rampIdx];
            if (ch !== ' ') {
              drawCharHSL(ch, x, y, 150 + brightness * 60, 50, 20 + brightness * 40);
            }
          }
        }
      } else if (dist < holeGR + 2) {
        // Pulsing border
        var borderHue = 120 + Math.sin(t * 4 + dist * 0.5) * 40;
        var borderLit = 35 + Math.sin(t * 6) * 15;
        drawCharHSL('O', x, y, borderHue, 80, borderLit);
      } else {
        // Wall
        var wallHash = (x * 7 + y * 13 + Math.floor(t * 2)) % WALL_CHARS.length;
        var wallHue = 0 + Math.sin(y * 0.1 + t * 0.5) * 15; // dark red/orange
        var wallLit = 8 + Math.sin(x * 0.2 + y * 0.15 + t) * 4;
        drawCharHSL(WALL_CHARS[wallHash], x, y, wallHue, 60, wallLit);
      }
    }
  }

  // Check face overlap with hole center
  if (faceVisible) {
    var odx = faceX - hole.x, ody = faceY - hole.y;
    var odist = Math.sqrt(odx * odx + ody * ody);
    if (odist < hole.radius * 0.5) {
      gauntletOverlap += dt;
      if (gauntletOverlap > 0.5) {
        // Shatter effect
        spawnBurst(hole.x, hole.y, 0, 30);
        gatesPassed++;
        gauntletIdx++;
        gauntletOverlap = 0;
      }
    } else {
      gauntletOverlap = Math.max(0, gauntletOverlap - dt);
    }
  }

  // Gate counter
  var gateText = 'GATE ' + (gauntletIdx + 1) + '/3';
  drawText(gateText, 0.5, 0.05, W, H, 120, 70, 40);

  if (sceneElapsed > SCENE_DURATIONS[1] + 3) startTransition();
}

// =========================================================
// Scene 2: SHRINK
// =========================================================
function renderShrink(W, H, t, dt) {
  var imgData = getWebcamData(W, H);

  // Giant skeletal structures
  for (var si = 0; si < shrinkStructures.length; si++) {
    var s = shrinkStructures[si];
    var sx0 = Math.floor(s.x * W), sy0 = Math.floor(s.y * H);
    var sw = Math.floor(s.w * W), sh = Math.floor(s.h * H);
    for (var y = sy0; y < sy0 + sh && y < H; y++) {
      for (var x = sx0; x < sx0 + sw && x < W; x++) {
        if (x < 0 || y < 0) continue;
        var edge = (x === sx0 || x === sx0 + sw - 1 || y === sy0 || y === sy0 + sh - 1);
        if (edge || Math.random() < 0.15) {
          var boneHue = 30 + Math.sin(t * 0.3 + si) * 10;
          var boneLit = 15 + Math.sin(t + x * 0.1) * 5;
          drawCharHSL(s.char, x, y, boneHue, 20, boneLit);
        }
      }
    }
  }

  // Tiny face avatar (8x6)
  if (faceVisible && imgData) {
    var avW = 8, avH = 6;
    // Amplified movement
    var avCX = Math.floor(faceX * W * 1.5 - W * 0.25);
    var avCY = Math.floor(faceY * H * 1.5 - H * 0.25);
    avCX = Math.max(0, Math.min(W - avW, avCX));
    avCY = Math.max(0, Math.min(H - avH, avCY));

    // Check collision with structures
    var collided = false;
    for (var ci = 0; ci < shrinkStructures.length; ci++) {
      var cs = shrinkStructures[ci];
      var csx = cs.x * W, csy = cs.y * H, csw = cs.w * W, csh = cs.h * H;
      if (avCX + avW > csx && avCX < csx + csw && avCY + avH > csy && avCY < csy + csh) {
        collided = true;
        break;
      }
    }

    if (collided) {
      // Flash screen
      for (var fy = 0; fy < H; fy += 3) {
        for (var fx = 0; fx < W; fx += 2) {
          drawCharHSL('X', fx, fy, 0, 100, 50 * Math.random());
        }
      }
    }

    // Draw mini face
    for (var ay = 0; ay < avH; ay++) {
      for (var ax = 0; ax < avW; ax++) {
        var srcFX = Math.floor(faceX * W + (ax / avW - 0.5) * faceR * W);
        var srcFY = Math.floor(faceY * H + (ay / avH - 0.5) * faceR * H);
        if (srcFX >= 0 && srcFX < W && srcFY >= 0 && srcFY < H) {
          var fpi = (srcFY * W + srcFX) * 4;
          var br = (0.299 * imgData[fpi] + 0.587 * imgData[fpi + 1] + 0.114 * imgData[fpi + 2]) / 255;
          var ri = Math.floor(br * (ASCII_RAMP.length - 1));
          var fch = ASCII_RAMP[ri];
          if (fch !== ' ') {
            drawCharHSL(fch, avCX + ax, avCY + ay, 200, 70, 20 + br * 50);
          }
        }
      }
    }

    // Check if reached right edge
    if (avCX + avW >= W - 2) {
      startTransition();
    }
  }

  drawText('NAVIGATE RIGHT', 0.5, 0.05, W, H, 200, 50, 25);
  if (sceneElapsed > SCENE_DURATIONS[2] + 3) startTransition();
}

// =========================================================
// Scene 3: MAZE
// =========================================================
function renderMazeScene(W, H, t, dt) {
  if (!mazeGrid) { startTransition(); return; }

  var cellW = Math.floor(W / mazeW);
  var cellH = Math.floor(H / mazeH);
  if (cellW < 2) cellW = 2;
  if (cellH < 2) cellH = 2;

  // Target position from face
  var targetMX = 1, targetMY = 1;
  if (faceVisible) {
    targetMX = Math.floor(faceX * mazeW);
    targetMY = Math.floor(faceY * mazeH);
    targetMX = Math.max(0, Math.min(mazeW - 1, targetMX));
    targetMY = Math.max(0, Math.min(mazeH - 1, targetMY));
  }

  // Move cursor toward target along valid paths
  var stepTimer = Math.floor(t * 8);
  if (stepTimer % 2 === 0) {
    var bestDist = 999;
    var bestX = mazeCurX, bestY = mazeCurY;
    var dirs = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
    for (var d = 0; d < 4; d++) {
      var nnx = mazeCurX + dirs[d].dx, nny = mazeCurY + dirs[d].dy;
      if (nnx >= 0 && nnx < mazeW && nny >= 0 && nny < mazeH && mazeGrid[nny * mazeW + nnx] === 1) {
        var ddist = Math.abs(nnx - targetMX) + Math.abs(nny - targetMY);
        if (ddist < bestDist) {
          bestDist = ddist;
          bestX = nnx;
          bestY = nny;
        }
      }
    }
    mazeCurX = bestX;
    mazeCurY = bestY;
    mazeVisited[mazeCurY * mazeW + mazeCurX] = 1;
  }

  // Draw maze
  for (var my = 0; my < mazeH; my++) {
    for (var mx = 0; mx < mazeW; mx++) {
      var val = mazeGrid[my * mazeW + mx];
      var bx = mx * cellW, by = my * cellH;

      for (var cy = 0; cy < cellH && by + cy < H; cy++) {
        for (var cx = 0; cx < cellW && bx + cx < W; cx++) {
          if (val === 0) {
            // Wall — neon cycling
            var wallHue = (t * 40 + mx * 15 + my * 15) % 360;
            drawCharHSL('#', bx + cx, by + cy, wallHue, 80, 20);
          } else {
            // Path
            if (mazeVisited[my * mazeW + mx]) {
              // Visited trail — dim glow
              drawCharHSL('.', bx + cx, by + cy, 60, 50, 12);
            } else {
              drawCharHSL(' ', bx + cx, by + cy, 0, 0, 2);
            }
          }
        }
      }
    }
  }

  // Draw cursor
  var curBX = mazeCurX * cellW, curBY = mazeCurY * cellH;
  for (var ccy = 0; ccy < cellH && curBY + ccy < H; ccy++) {
    for (var ccx = 0; ccx < cellW && curBX + ccx < W; ccx++) {
      var curHue = (t * 120) % 360;
      drawCharHSL('@', curBX + ccx, curBY + ccy, curHue, 100, 50);
    }
  }

  // Draw exit marker (bottom-right open cell)
  var exitX = mazeW - 2, exitY = mazeH - 2;
  var exBX = exitX * cellW, exBY = exitY * cellH;
  for (var ecy = 0; ecy < cellH && exBY + ecy < H; ecy++) {
    for (var ecx = 0; ecx < cellW && exBX + ecx < W; ecx++) {
      var exLit = 30 + Math.sin(t * 5) * 15;
      drawCharHSL('E', exBX + ecx, exBY + ecy, 120, 90, exLit);
    }
  }

  // Check if cursor reached exit
  if (mazeCurX === exitX && mazeCurY === exitY) {
    spawnBurst(0.9, 0.9, 120, 30);
    startTransition();
  }

  drawText('FIND THE EXIT', 0.5, 0.02, W, H, 120, 60, 30);
  if (sceneElapsed > SCENE_DURATIONS[3] + 5) startTransition();
}

// =========================================================
// Scene 4: KALEIDOSCOPE
// =========================================================
function renderKaleidoscope(W, H, t) {
  var imgData = getWebcamData(W, H);
  if (!imgData) {
    drawText('SHOW YOUR FACE', 0.5, 0.5, W, H, 300, 80, 40);
    if (sceneElapsed > SCENE_DURATIONS[4]) startTransition();
    return;
  }

  var midX = Math.floor(W / 2), midY = Math.floor(H / 2);

  for (var y = 0; y < midY; y++) {
    for (var x = 0; x < midX; x++) {
      // Sample from face region
      var srcX = Math.floor(faceX * W + (x / midX - 0.5) * faceR * W * 2);
      var srcY = Math.floor(faceY * H + (y / midY - 0.5) * faceR * H * 2);
      srcX = Math.max(0, Math.min(W - 1, srcX));
      srcY = Math.max(0, Math.min(H - 1, srcY));

      var pi = (srcY * W + srcX) * 4;
      var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
      var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var rampIdx = Math.floor(brightness * (ASCII_RAMP.length - 1));
      var ch = ASCII_RAMP[rampIdx];
      if (ch === ' ') continue;

      var hue = (t * 80 + x * 3 + y * 3) % 360;
      var lit = 15 + brightness * 50;

      // 4-way mirror
      drawCharHSL(ch, x, y, hue, 100, lit);
      drawCharHSL(ch, W - 1 - x, y, (hue + 90) % 360, 100, lit);
      drawCharHSL(ch, x, H - 1 - y, (hue + 180) % 360, 100, lit);
      drawCharHSL(ch, W - 1 - x, H - 1 - y, (hue + 270) % 360, 100, lit);
    }
  }

  drawText('BEAUTIFUL', 0.5, 0.05, W, H, (t * 60) % 360, 100, 50);
  if (sceneElapsed > SCENE_DURATIONS[4]) startTransition();
}

// =========================================================
// Scene 5: THE DESCENT
// =========================================================
function renderDescent(W, H, t, dt) {
  // Scrolling background
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var scrollY = (y + t * 15) % H;
      var noise = Math.sin(x * 0.3 + scrollY * 0.2 + t * 2) * 0.5 + 0.5;
      if (noise > 0.65) {
        var bgHue = 260 + Math.sin(t + y * 0.05) * 20;
        drawCharHSL('.', x, y, bgHue, 40, 6 + noise * 8);
      }
    }
  }

  // Obstacle bands sweeping upward
  for (var bi = 0; bi < descentBands.length; bi++) {
    var band = descentBands[bi];
    band.y -= band.speed * dt;
    if (band.y < -0.05) {
      band.y = 1.05;
      band.gapX = 0.1 + Math.random() * 0.6;
      band.gapW = 0.12 + Math.random() * 0.1;
      descentSurvived++;
    }

    var bandGY = Math.floor(band.y * H);
    var bandH = 2;
    for (var by = bandGY; by < bandGY + bandH && by < H; by++) {
      if (by < 0) continue;
      for (var bx = 0; bx < W; bx++) {
        var normX = bx / W;
        if (normX > band.gapX && normX < band.gapX + band.gapW) continue; // gap
        drawCharHSL('=', bx, by, 0, 70, 30);
      }
    }
  }

  // Player position (face X controls horizontal)
  if (faceVisible) {
    var playerX = Math.floor(faceX * W);
    var playerY = Math.floor(H * 0.8);
    playerX = Math.max(1, Math.min(W - 2, playerX));

    // Draw player
    drawCharHSL('V', playerX, playerY, 180, 100, 55);
    drawCharHSL('|', playerX, playerY + 1, 180, 80, 45);

    // Check collision with bands
    for (var cbi = 0; cbi < descentBands.length; cbi++) {
      var cb = descentBands[cbi];
      var cbGY = Math.floor(cb.y * H);
      if (Math.abs(cbGY - playerY) < 2) {
        var pnx = playerX / W;
        if (pnx < cb.gapX || pnx > cb.gapX + cb.gapW) {
          // Hit! Flash
          for (var hy = 0; hy < 3; hy++) {
            for (var hx = playerX - 2; hx <= playerX + 2; hx++) {
              if (hx >= 0 && hx < W && playerY + hy < H) {
                drawCharHSL('X', hx, playerY + hy, 0, 100, 60);
              }
            }
          }
        }
      }
    }
  }

  drawText('SURVIVE', 0.5, 0.03, W, H, 0, 60, 30);
  if (sceneElapsed > SCENE_DURATIONS[5]) startTransition();
}

// =========================================================
// Scene 6: FINALE
// =========================================================
function renderFinale(W, H, t) {
  var imgData = getWebcamData(W, H);

  // Face fills entire screen
  if (imgData && faceVisible) {
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        // Map entire screen to face region
        var srcX = Math.floor(faceX * W + (x / W - 0.5) * faceR * W * 3);
        var srcY = Math.floor(faceY * H + (y / H - 0.5) * faceR * H * 3);
        srcX = Math.max(0, Math.min(W - 1, srcX));
        srcY = Math.max(0, Math.min(H - 1, srcY));

        var pi = (srcY * W + srcX) * 4;
        var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
        var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        var rampIdx = Math.floor(brightness * (ASCII_RAMP.length - 1));
        var ch = ASCII_RAMP[rampIdx];
        if (ch === ' ') continue;

        // Rainbow edge glow
        var edgeDist = Math.min(x, W - x, y, H - y);
        var edgeGlow = edgeDist < 5;
        var hue, sat, lit;
        if (edgeGlow) {
          hue = (t * 100 + x * 5 + y * 5) % 360;
          sat = 100;
          lit = 40 + brightness * 30;
        } else {
          hue = (30 + brightness * 30) % 360;
          sat = 40;
          lit = 20 + brightness * 50;
        }
        drawCharHSL(ch, x, y, hue, sat, lit);
      }
    }
  } else {
    // No face — abstract pattern
    for (var ay = 0; ay < H; ay++) {
      for (var ax = 0; ax < W; ax++) {
        var wave = Math.sin(ax * 0.1 + t * 3) * Math.cos(ay * 0.1 + t * 2);
        if (Math.abs(wave) > 0.3) {
          var wHue = (t * 60 + ax * 3 + ay * 3) % 360;
          drawCharHSL('*', ax, ay, wHue, 80, 15 + Math.abs(wave) * 25);
        }
      }
    }
  }

  // Stats overlay
  var depthStr = 'DEPTH: ' + depth;
  var gatesStr = 'GATES PASSED: ' + gatesPassed;
  drawText(depthStr, 0.5, 0.4, W, H, 60, 80, 55);
  drawText(gatesStr, 0.5, 0.5, W, H, 120, 80, 55);
  drawText('YOUR FACE IS THE KEY', 0.5, 0.65, W, H, 300, 70, 40);

  // Glitch reboot effect near end
  if (sceneElapsed > SCENE_DURATIONS[6] - 2) {
    var glitchIntensity = (sceneElapsed - (SCENE_DURATIONS[6] - 2)) / 2;
    var glitchCount = Math.floor(glitchIntensity * 20);
    for (var gi = 0; gi < glitchCount; gi++) {
      var gy = Math.floor(Math.random() * H);
      for (var gx = 0; gx < W; gx++) {
        if (Math.random() < glitchIntensity * 0.3) {
          var gch = String.fromCharCode(33 + Math.floor(Math.random() * 93));
          drawCharHSL(gch, gx, gy, Math.random() * 360, 100, 50);
        }
      }
    }
  }

  if (sceneElapsed > SCENE_DURATIONS[6]) startTransition();
}

// =========================================================
// "FACE LOST" overlay
// =========================================================
function renderFaceLost(W, H, t) {
  var msg = 'FACE LOST';
  var blink = Math.sin(t * 5) > 0;
  if (blink) {
    drawText(msg, 0.5, 0.5, W, H, 0, 80, 40);
  }
  var sub = 'show your face to continue';
  drawText(sub, 0.5, 0.55, W, H, 0, 40, 20);
}

// =========================================================
// Main init & render
// =========================================================
function initStory() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  particles = [];
  currentScene = 0;
  sceneStartTime = 0;
  depth = 0;
  gatesPassed = 0;
  transitioning = false;

  vidCanvas = document.createElement('canvas');
  vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });

  if (!webcamEl) {
    webcamEl = document.createElement('video');
    webcamEl.muted = true;
    webcamEl.playsInline = true;
    webcamEl.setAttribute('autoplay', '');
    webcamEl.style.display = 'none';
    document.body.appendChild(webcamEl);
  }

  startWebcam();
  loadFacemeshLib();
  initCurrentScene();
}

var lastTime = 0;

function renderStory() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = t - lastTime;
  if (dt > 0.1) dt = 0.016; // clamp
  lastTime = t;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'initializing story mode...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      var hue = (t * 60 + i * 15) % 360;
      drawCharHSL(msg[i], mx + i, my, hue, 60, 40);
    }
    return;
  }

  // Error state
  if (loadError || webcamDenied) {
    var errMsg = loadError || 'camera access denied';
    var ex = Math.floor((W - errMsg.length) / 2);
    var ey = Math.floor(H / 2);
    for (var ei = 0; ei < errMsg.length && ex + ei < W; ei++) {
      drawCharHSL(errMsg[ei], ex + ei, ey, 0, 70, 40);
    }
    return;
  }

  // Face detection
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }
  updateFaceState();

  // Scene elapsed (paused when face lost, except kaleidoscope/finale)
  if (sceneStartTime === 0) sceneStartTime = t;
  var pauseOnFaceLoss = currentScene !== 4 && currentScene !== 6;
  if (faceVisible || !pauseOnFaceLoss) {
    sceneElapsed = t - sceneStartTime;
  } else {
    // Shift start time to pause
    sceneStartTime = t - sceneElapsed;
  }

  // Transition overlay
  if (transitioning) {
    renderTransition(W, H);
    updateParticles();
    renderParticles(W, H);
    return;
  }

  // Render current scene
  switch (currentScene) {
    case 0: renderPortal(W, H, t, dt); break;
    case 1: renderGauntlet(W, H, t, dt); break;
    case 2: renderShrink(W, H, t, dt); break;
    case 3: renderMazeScene(W, H, t, dt); break;
    case 4: renderKaleidoscope(W, H, t); break;
    case 5: renderDescent(W, H, t, dt); break;
    case 6: renderFinale(W, H, t); break;
  }

  // Face lost overlay (for interactive scenes)
  if (!faceVisible && pauseOnFaceLoss) {
    renderFaceLost(W, H, t);
  }

  // Update & render particles
  updateParticles();
  renderParticles(W, H);

  // Scene label (bottom)
  var sceneNames = ['PORTAL', 'THE GAUNTLET', 'SHRINK', 'MAZE', 'KALEIDOSCOPE', 'THE DESCENT', 'FINALE'];
  var label = sceneNames[currentScene];
  drawText(label, 0.5, 0.95, W, H, 280, 50, 20);

  // Creepy fragment (random, subtle)
  if (Math.sin(t * 1.7) > 0.8) {
    var frag = FRAGMENTS[Math.floor(t * 0.5) % FRAGMENTS.length];
    var fragX = 0.1 + Math.sin(t * 0.3) * 0.3;
    var fragY = 0.1 + Math.cos(t * 0.4) * 0.3;
    drawText(frag, fragX, fragY, W, H, 300, 40, 12 + Math.sin(t * 3) * 5);
  }
}

registerMode('story', { init: initStory, render: renderStory });
