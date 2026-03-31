import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Fruiteat mode — eat floating 3D fruits with your face
// Uses @svenflow/micro-facemesh (WebGPU, 478 landmarks per face)

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

// Face data
var faces = [];
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// ASCII brightness ramp
var ASCII_RAMP = ' .:-=+*#%@';

// Flowing text
var bgText = 'CHOMP MUNCH GOBBLE FEAST DEVOUR NIBBLE SAVOR CRUNCH BITE GULP ';

// Fruit types
var FRUIT_NAMES = ['apple', 'orange', 'banana', 'grape', 'watermelon', 'strawberry'];
var FRUIT_HUES = [0, 30, 55, 280, 120, 350];
var FRUIT_CHARS = ['@', 'O', ')', 'o', 'W', '*'];

// Particles
var particles = [];

// Shared state for R3F overlay
export var fruitState = {
  fruits: [],
  faceCenter: { x: 0.5, y: 0.5 },
  faceRadius: 0.1,
  faceVisible: false,
  score: 0,
  mouthOpen: false
};

function spawnFruit(fromEdge) {
  var x, y;
  if (fromEdge) {
    var edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random(); y = -0.05; }
    else if (edge === 1) { x = Math.random(); y = 1.05; }
    else if (edge === 2) { x = -0.05; y = Math.random(); }
    else { x = 1.05; y = Math.random(); }
  } else {
    // Initial spawn — avoid center
    do {
      x = 0.1 + Math.random() * 0.8;
      y = 0.1 + Math.random() * 0.8;
    } while (Math.abs(x - 0.5) < 0.2 && Math.abs(y - 0.5) < 0.2);
  }
  return {
    x: x,
    y: y,
    vx: (Math.random() - 0.5) * 0.003,
    vy: (Math.random() - 0.5) * 0.003,
    type: Math.floor(Math.random() * 6),
    radius: 0.04 + Math.random() * 0.02,
    eaten: false,
    eatenTime: 0
  };
}

function initFruiteat() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  particles = [];
  fruitState.score = 0;
  fruitState.faceVisible = false;
  fruitState.fruits = [];

  // Spawn initial fruits
  for (var i = 0; i < 7; i++) {
    fruitState.fruits.push(spawnFruit(false));
  }

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
}

function startWebcam() {
  if (webcamReady) return;
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  }).then(function(stream) {
    webcamEl.srcObject = stream;
    webcamEl.play().catch(function(){});
    webcamEl.onloadeddata = function() {
      webcamReady = true;
    };
  }).catch(function(err) {
    webcamDenied = true;
    loadError = 'Camera denied: ' + err.message;
    loading = false;
  });
}

function loadFacemeshLib() {
  if (facemeshLib) {
    initDetector();
    return;
  }

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
  if (!facemeshLib || detector) {
    loading = false;
    return;
  }
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
  }).catch(function() {
    detecting = false;
  });
}

function updateFaceState() {
  if (faces.length === 0) {
    fruitState.faceVisible = false;
    return;
  }

  var face = faces[0];
  var lm = face.landmarks;
  if (!lm || lm.length < 468) {
    fruitState.faceVisible = false;
    return;
  }

  // Compute face center and radius from landmarks (mirror X for selfie)
  var minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (var i = 0; i < lm.length; i++) {
    var mx = 1 - lm[i].x; // mirror
    var my = lm[i].y;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }

  fruitState.faceCenter.x = (minX + maxX) / 2;
  fruitState.faceCenter.y = (minY + maxY) / 2;
  fruitState.faceRadius = Math.max(maxX - minX, maxY - minY) / 2;
  fruitState.faceVisible = true;

  // Mouth open detection — landmarks 13 (upper lip) and 14 (lower lip)
  if (lm.length > 14) {
    var upperLip = lm[13];
    var lowerLip = lm[14];
    var mouthDist = Math.abs(upperLip.y - lowerLip.y);
    fruitState.mouthOpen = mouthDist > 0.03;
  }
}

function spawnParticles(fruit) {
  var hue = FRUIT_HUES[fruit.type];
  var ch = FRUIT_CHARS[fruit.type];
  for (var i = 0; i < 18; i++) {
    var angle = (Math.PI * 2 / 18) * i + Math.random() * 0.3;
    var speed = 0.01 + Math.random() * 0.015;
    particles.push({
      x: fruit.x,
      y: fruit.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      hue: hue,
      ch: ch,
      life: 30
    });
  }
}

function updateFruits() {
  var now = state.time;
  for (var i = 0; i < fruitState.fruits.length; i++) {
    var fruit = fruitState.fruits[i];

    if (fruit.eaten) {
      // Respawn after 1 second
      if (now - fruit.eatenTime > 1) {
        var newFruit = spawnFruit(true);
        newFruit.type = fruit.type;
        fruitState.fruits[i] = newFruit;
      }
      continue;
    }

    // Move fruit
    fruit.x += fruit.vx;
    fruit.y += fruit.vy;

    // Bounce off edges
    if (fruit.x < 0.02 || fruit.x > 0.98) fruit.vx *= -1;
    if (fruit.y < 0.02 || fruit.y > 0.98) fruit.vy *= -1;

    // Clamp
    fruit.x = Math.max(0.02, Math.min(0.98, fruit.x));
    fruit.y = Math.max(0.02, Math.min(0.98, fruit.y));

    // Check collision with face
    if (fruitState.faceVisible) {
      var dx = fruit.x - fruitState.faceCenter.x;
      var dy = fruit.y - fruitState.faceCenter.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var eatRadius = fruitState.faceRadius * 0.6 + fruit.radius;

      if (dist < eatRadius) {
        fruit.eaten = true;
        fruit.eatenTime = now;
        fruitState.score++;
        spawnParticles(fruit);
      }
    }
  }
}

function updateParticles() {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.0003; // slight gravity
    p.life--;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function renderFruiteat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading fruiteat...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      var hue = (t * 60 + i * 15) % 360;
      drawCharHSL(msg[i], mx + i, my, hue, 60, 40);
    }
    var dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    for (var d = 0; d < dots.length; d++) {
      drawCharHSL('.', mx + msg.length + d, my, 0, 0, 30);
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

  // Detect faces
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }

  // Update face state
  updateFaceState();

  // Update fruits and particles
  updateFruits();
  updateParticles();

  // Sample webcam into canvas
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  var hasVideo = webcamReady && webcamEl.readyState >= 2;
  var imgData = null;

  if (hasVideo) {
    vidCtx.save();
    vidCtx.translate(W, 0);
    vidCtx.scale(-1, 1);
    vidCtx.drawImage(webcamEl, 0, 0, W, H);
    vidCtx.restore();
    imgData = vidCtx.getImageData(0, 0, W, H).data;
  }

  // Precompute fruit grid positions and radii
  var fruitGridData = [];
  for (var fi = 0; fi < fruitState.fruits.length; fi++) {
    var fr = fruitState.fruits[fi];
    if (fr.eaten) continue;
    fruitGridData.push({
      gx: fr.x * W,
      gy: fr.y * H,
      gr: (fr.radius + 0.02) * Math.max(W, H) // padding
    });
  }

  // Face bounding box in grid coords
  var faceGX = fruitState.faceCenter.x * W;
  var faceGY = fruitState.faceCenter.y * H;
  var faceGR = fruitState.faceRadius * Math.max(W, H);

  // Render
  var ci = Math.floor(t * 2) % bgText.length;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Check if inside face region
      if (fruitState.faceVisible) {
        var fdx = x - faceGX;
        var fdy = y - faceGY;
        var fdist = Math.sqrt(fdx * fdx + fdy * fdy);

        if (fdist < faceGR * 0.85) {
          // Inside face — render ASCII from webcam brightness
          if (imgData) {
            var pi = (y * W + x) * 4;
            var r = imgData[pi];
            var g = imgData[pi + 1];
            var b = imgData[pi + 2];
            var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            var rampIdx = Math.floor(brightness * (ASCII_RAMP.length - 1));
            var ch = ASCII_RAMP[rampIdx];
            if (ch !== ' ') {
              var fhue = (30 + brightness * 40) % 360; // warm skin tones
              drawCharHSL(ch, x, y, fhue, 50 + brightness * 30, 25 + brightness * 35);
            }
          }
          continue;
        }
      }

      // Check if inside any fruit region (skip for text wrapping)
      var inFruit = false;
      for (var fj = 0; fj < fruitGridData.length; fj++) {
        var frd = fruitGridData[fj];
        var frdx = x - frd.gx;
        var frdy = y - frd.gy;
        if (frdx * frdx + frdy * frdy < frd.gr * frd.gr) {
          inFruit = true;
          break;
        }
      }
      if (inFruit) continue;

      // Background text
      var bgCh = bgText[ci % bgText.length];
      ci++;
      if (bgCh === ' ') continue;

      var bgHue = (180 + Math.sin(t * 0.5 + y * 0.1) * 20) % 360;
      var bgLit = 18 + Math.sin(t * 0.3 + x * 0.05 + y * 0.08) * 6;

      // Glow near face
      if (fruitState.faceVisible) {
        var gdx = x - faceGX;
        var gdy = y - faceGY;
        var gDist = Math.sqrt(gdx * gdx + gdy * gdy);
        var glowZone = faceGR * 1.3;
        if (gDist < glowZone) {
          var glow = 1 - gDist / glowZone;
          bgLit += glow * 20;
        }
      }

      drawCharHSL(bgCh, x, y, bgHue, 50, Math.min(50, bgLit));
    }
  }

  // Render particles
  for (var pi2 = 0; pi2 < particles.length; pi2++) {
    var part = particles[pi2];
    var pgx = Math.floor(part.x * W);
    var pgy = Math.floor(part.y * H);
    if (pgx < 0 || pgx >= W || pgy < 0 || pgy >= H) continue;
    var alpha = part.life / 30;
    drawCharHSL(part.ch, pgx, pgy, part.hue, 80, 30 + alpha * 40);
  }

  // Score display — top right
  var scoreStr = 'SCORE: ' + fruitState.score;
  var sx = W - scoreStr.length - 2;
  for (var si = 0; si < scoreStr.length; si++) {
    drawCharHSL(scoreStr[si], sx + si, 1, 60, 80, 55);
  }
}

registerMode('fruiteat', { init: initFruiteat, render: renderFruiteat });
