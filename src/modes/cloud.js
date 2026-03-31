import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Cloud mode — dreamy floating ASCII clouds with webcam face
// ============================================================

var FACE_CDN = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.min.js';

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

// Face center (normalized 0-1)
var faceCenterX = 0.5;
var faceCenterY = 0.5;
var faceDetected = false;
var faceScale = 1.0;

// Webcam pixel data
var webcamPixels = null;
var webcamW = 0;
var webcamH = 0;

// Clouds
var clouds = [];
var MAX_CLOUDS = 12;
var faceCloudIndex = 0;

// Stars
var stars = [];
var MAX_STARS = 80;

// Brightness ramp for ASCII face rendering
var BRIGHTNESS_CHARS = ' .:-=+*%&#@$W';

// Cloud texture characters
var CLOUD_CHARS_LIGHT = [' ', ' ', '.', '~', '.'];
var CLOUD_CHARS_MED = ['~', 'o', '~', '.', ' '];
var CLOUD_CHARS_DENSE = ['@', '#', '%', '&', '*'];

// Bob animation
var bobPhase = 0;

// =========================================================
// Webcam & face tracking
// =========================================================
function startWebcam() {
  if (webcamReady && webcamEl && webcamEl.srcObject && webcamEl.srcObject.active) return;
  webcamReady = false;
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: 320, height: 240 }
  }).then(function(stream) {
    webcamEl.srcObject = stream;
    webcamEl.play().catch(function(){});
    webcamEl.onloadeddata = function() { webcamReady = true; };
  }).catch(function(err) {
    webcamDenied = true;
    loadError = 'Camera denied';
    loading = false;
  });
}

function loadFacemeshLib() {
  if (facemeshLib) { initDetector(); return; }
  if (!navigator.gpu) {
    loadError = 'no WebGPU';
    loading = false;
    return;
  }
  import(/* webpackIgnore: true */ FACE_CDN).then(function(mod) {
    facemeshLib = mod.createFacemesh || (mod.default && mod.default.createFacemesh) || mod;
    if (typeof facemeshLib === 'object' && facemeshLib.createFacemesh) {
      facemeshLib = facemeshLib.createFacemesh;
    }
    initDetector();
  }).catch(function(err) {
    loadError = 'Load failed: ' + err.message;
    loading = false;
  });
}

function initDetector() {
  if (!facemeshLib || detector) { loading = false; return; }
  facemeshLib({ maxFaces: 1 }).then(function(fm) {
    detector = fm;
    loading = false;
  }).catch(function(err) {
    loadError = 'Init failed: ' + err.message;
    loading = false;
  });
}

function detectFaces() {
  if (!detector || !webcamReady || detecting || webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    faces = result || [];
    if (faces.length > 0 && faces[0].landmarks && faces[0].landmarks.length >= 468) {
      updateFacePosition(faces[0].landmarks);
      faceDetected = true;
    } else {
      faceDetected = false;
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateFacePosition(lm) {
  // Center of face — average of key landmarks
  // Nose tip (1), forehead (10), chin (152), left cheek (234), right cheek (454)
  var sumX = 0, sumY = 0;
  var keyPoints = [1, 10, 152, 234, 454];
  for (var i = 0; i < keyPoints.length; i++) {
    sumX += lm[keyPoints[i]].x;
    sumY += lm[keyPoints[i]].y;
  }
  var targetX = sumX / keyPoints.length;
  var targetY = sumY / keyPoints.length;

  // Smooth with lerp
  faceCenterX += (targetX - faceCenterX) * 0.15;
  faceCenterY += (targetY - faceCenterY) * 0.15;

  // Estimate face scale from distance between cheeks
  var cheekDist = Math.sqrt(
    Math.pow(lm[454].x - lm[234].x, 2) +
    Math.pow(lm[454].y - lm[234].y, 2)
  );
  var targetScale = cheekDist * 3.5;
  faceScale += (targetScale - faceScale) * 0.1;
}

function sampleWebcam() {
  if (!webcamReady || webcamEl.readyState < 2) return;

  var vw = webcamEl.videoWidth || 320;
  var vh = webcamEl.videoHeight || 240;

  if (vidCanvas.width !== vw) vidCanvas.width = vw;
  if (vidCanvas.height !== vh) vidCanvas.height = vh;

  vidCtx.drawImage(webcamEl, 0, 0, vw, vh);
  var imgData = vidCtx.getImageData(0, 0, vw, vh);
  webcamPixels = imgData.data;
  webcamW = vw;
  webcamH = vh;
}

function getWebcamBrightness(nx, ny) {
  // nx, ny normalized 0-1
  if (!webcamPixels) return 0;
  // Mirror horizontally for selfie view
  var px = Math.floor((1 - nx) * webcamW);
  var py = Math.floor(ny * webcamH);
  px = Math.max(0, Math.min(webcamW - 1, px));
  py = Math.max(0, Math.min(webcamH - 1, py));
  var idx = (py * webcamW + px) * 4;
  var r = webcamPixels[idx];
  var g = webcamPixels[idx + 1];
  var b = webcamPixels[idx + 2];
  // Perceptual luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// =========================================================
// Cloud generation
// =========================================================
function createCloud(index, W, H) {
  var isFaceCloud = (index === faceCloudIndex);
  var baseW = isFaceCloud ? 28 + Math.floor(Math.random() * 8) : 8 + Math.floor(Math.random() * 14);
  var baseH = isFaceCloud ? 14 + Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 5);

  return {
    x: isFaceCloud ? W * 0.4 : Math.random() * (W + 20) - 10,
    y: isFaceCloud ? H * 0.35 : 3 + Math.random() * (H * 0.55),
    w: baseW,
    h: baseH,
    speed: isFaceCloud ? 0.08 : 0.15 + Math.random() * 0.35,
    isFaceCloud: isFaceCloud,
    phase: Math.random() * Math.PI * 2,
    density: 0.5 + Math.random() * 0.5,
    yOffset: 0,
    bumps: []
  };
}

function generateCloudBumps(cloud) {
  cloud.bumps = [];
  var rows = cloud.h;
  for (var r = 0; r < rows; r++) {
    var rowRatio = r / Math.max(1, rows - 1);
    // Parabolic shape — wider in middle
    var midDist = Math.abs(rowRatio - 0.4);
    var baseWidth = cloud.w * (1 - midDist * 1.8);
    baseWidth = Math.max(2, baseWidth);
    // Add organic irregularity
    var wobble = Math.sin(r * 1.7 + cloud.phase) * 2 + Math.cos(r * 2.3) * 1.5;
    cloud.bumps.push(Math.floor(baseWidth + wobble));
  }
}

function initClouds() {
  var W = state.COLS, H = state.ROWS;
  clouds = [];
  faceCloudIndex = 0;
  for (var i = 0; i < MAX_CLOUDS; i++) {
    var c = createCloud(i, W, H);
    generateCloudBumps(c);
    clouds.push(c);
  }
}

function initStars() {
  var W = state.COLS, H = state.ROWS;
  stars = [];
  var skyLimit = Math.floor(H * 0.45);
  for (var i = 0; i < MAX_STARS; i++) {
    stars.push({
      x: Math.floor(Math.random() * W),
      y: Math.floor(Math.random() * skyLimit),
      twinkleSpeed: 1.5 + Math.random() * 3,
      twinklePhase: Math.random() * Math.PI * 2,
      char: '.+*'[Math.floor(Math.random() * 3)],
      baseBright: 15 + Math.random() * 20
    });
  }
}

// =========================================================
// Drawing functions
// =========================================================
function drawSkyGradient() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  for (var y = 0; y < H; y++) {
    var yRatio = y / H;

    // Deep blue at top, transitioning to light blue, then pink/peach at bottom
    var hue, sat, lit;
    if (yRatio < 0.4) {
      // Deep blue to medium blue
      hue = 230 + yRatio * 20;
      sat = 60 + (1 - yRatio) * 20;
      lit = 3 + yRatio * 6;
    } else if (yRatio < 0.7) {
      // Medium blue to lavender
      var blend = (yRatio - 0.4) / 0.3;
      hue = 240 - blend * 30;
      sat = 50 - blend * 15;
      lit = 5 + blend * 6;
    } else {
      // Lavender to warm pink/peach (sunset)
      var blend2 = (yRatio - 0.7) / 0.3;
      hue = 300 - blend2 * 50;
      sat = 35 + blend2 * 20;
      lit = 8 + blend2 * 8;
    }

    for (var x = 0; x < W; x++) {
      // Subtle animated texture
      var wave = Math.sin(x * 0.04 + t * 0.1 + y * 0.03) * 0.5;
      var noise = Math.sin(x * 0.13 + y * 0.17 + t * 0.05) * 0.3;

      if (Math.random() < 0.12 + yRatio * 0.05) {
        var ch = (Math.random() < 0.5) ? '.' : ' ';
        if (yRatio > 0.8 && Math.random() < 0.1) ch = '~';
        drawCharHSL(ch, x, y, hue + wave * 10, sat + noise * 5, lit + wave * 2);
      }
    }
  }
}

function drawStars() {
  var t = state.time;
  var W = state.COLS, H = state.ROWS;

  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    if (s.x >= W || s.y >= H) continue;

    var twinkle = Math.sin(t * s.twinkleSpeed + s.twinklePhase);
    var brightness = s.baseBright + twinkle * 12;

    if (brightness > 10) {
      var hue = 45 + Math.sin(i * 0.7) * 20; // warm white to cool white
      drawCharHSL(s.char, s.x, s.y, hue, 15, brightness);
    }
  }
}

function drawCloudShape(cloud, skipFaceArea) {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = Math.floor(cloud.x);
  var cy = Math.floor(cloud.y + cloud.yOffset);

  for (var r = 0; r < cloud.h; r++) {
    var rowW = cloud.bumps[r] || 4;
    var halfW = Math.floor(rowW / 2);
    var rowY = cy + r;
    if (rowY < 0 || rowY >= H) continue;

    for (var dx = -halfW; dx <= halfW; dx++) {
      var gx = cx + dx;
      if (gx < 0 || gx >= W) continue;

      // Edge softness — fade at edges
      var edgeDist = Math.abs(dx) / Math.max(1, halfW);
      var vertDist = Math.abs(r - cloud.h * 0.4) / Math.max(1, cloud.h * 0.6);
      var totalDist = Math.max(edgeDist, vertDist);

      if (totalDist > 0.95 && Math.random() < 0.5) continue;

      // Skip the face area on face cloud (face renders on top)
      if (skipFaceArea && cloud.isFaceCloud) {
        var faceAreaCX = cx;
        var faceAreaCY = cy + Math.floor(cloud.h * 0.4);
        var faceAreaW = Math.floor(cloud.w * 0.5);
        var faceAreaH = Math.floor(cloud.h * 0.7);
        if (Math.abs(gx - faceAreaCX) < faceAreaW / 2 && Math.abs(rowY - faceAreaCY) < faceAreaH / 2) {
          continue;
        }
      }

      // Cloud texture character
      var ch;
      var texNoise = Math.sin(gx * 0.3 + rowY * 0.5 + t * 0.2 + cloud.phase);
      if (totalDist > 0.7) {
        ch = CLOUD_CHARS_LIGHT[Math.floor(Math.abs(texNoise) * CLOUD_CHARS_LIGHT.length)];
      } else if (totalDist > 0.4) {
        ch = CLOUD_CHARS_MED[Math.floor(Math.abs(texNoise) * CLOUD_CHARS_MED.length)];
      } else {
        var denseIdx = Math.floor(Math.abs(texNoise) * CLOUD_CHARS_DENSE.length);
        ch = CLOUD_CHARS_DENSE[denseIdx];
      }

      // Cloud coloring — soft white/light gray with slight blue tint
      var cloudHue = 220 + Math.sin(gx * 0.1 + rowY * 0.1) * 15;
      var cloudSat = 8 + totalDist * 6;
      var cloudLit = 55 - totalDist * 25 + Math.sin(t * 0.3 + cloud.phase) * 3;

      // Underside shadow — slightly darker and more purple
      if (r > cloud.h * 0.6) {
        var shadowBlend = (r - cloud.h * 0.6) / (cloud.h * 0.4);
        cloudHue = 260;
        cloudSat += shadowBlend * 10;
        cloudLit -= shadowBlend * 12;
      }

      drawCharHSL(ch, gx, rowY, cloudHue, cloudSat, Math.max(8, cloudLit * cloud.density));
    }
  }
}

function drawFaceOnCloud(cloud) {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!webcamPixels || !faceDetected) return;

  var cx = Math.floor(cloud.x);
  var cy = Math.floor(cloud.y + cloud.yOffset);

  // Face area on the cloud
  var faceW = Math.floor(cloud.w * 0.55);
  var faceH = Math.floor(cloud.h * 0.75);
  var facePosX = cx;
  var facePosY = cy + Math.floor(cloud.h * 0.35);

  // Map webcam face region to cloud face area
  var faceRegionW = faceScale;
  var faceRegionH = faceScale * 1.3; // Taller than wide for face proportions
  var faceRegionX = faceCenterX - faceRegionW * 0.5;
  var faceRegionY = faceCenterY - faceRegionH * 0.5;

  for (var dy = -Math.floor(faceH / 2); dy < Math.floor(faceH / 2); dy++) {
    for (var dx = -Math.floor(faceW / 2); dx < Math.floor(faceW / 2); dx++) {
      var gx = facePosX + dx;
      var gy = facePosY + dy;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

      // Normalized position within face area
      var nx = (dx + faceW / 2) / faceW;
      var ny = (dy + faceH / 2) / faceH;

      // Map to webcam coordinates
      var wx = faceRegionX + nx * faceRegionW;
      var wy = faceRegionY + ny * faceRegionH;

      // Elliptical mask for face shape
      var ellipseX = (nx - 0.5) * 2;
      var ellipseY = (ny - 0.5) * 2;
      var ellipseDist = ellipseX * ellipseX + ellipseY * ellipseY * 0.85;
      if (ellipseDist > 1.0) continue;

      // Edge feathering
      var feather = 1.0;
      if (ellipseDist > 0.7) {
        feather = 1.0 - (ellipseDist - 0.7) / 0.3;
      }

      var brightness = getWebcamBrightness(wx, wy);

      // Skip very dark areas (background) for transparency
      if (brightness < 0.08 && feather < 0.5) continue;

      // Map brightness to character
      var charIdx = Math.floor(brightness * (BRIGHTNESS_CHARS.length - 1));
      charIdx = Math.max(0, Math.min(BRIGHTNESS_CHARS.length - 1, charIdx));
      var ch = BRIGHTNESS_CHARS[charIdx];

      if (ch === ' ' && feather < 0.6) continue;

      // Warm skin tones — map brightness to hue/sat
      var faceHue = 25 + brightness * 15; // warm orangey
      var faceSat = 25 + (1 - brightness) * 20;
      var faceLit = 15 + brightness * 40;

      // Feather blending with cloud
      faceLit = faceLit * feather + 35 * (1 - feather);
      faceSat = faceSat * feather + 5 * (1 - feather);

      // At the feathered edges, blend toward cloud chars
      if (feather < 0.4 && Math.random() < (0.4 - feather)) {
        ch = '~.o'[Math.floor(Math.random() * 3)];
        faceHue = 220;
        faceSat = 8;
        faceLit = 45;
      }

      drawCharHSL(ch, gx, gy, faceHue, faceSat, faceLit);
    }
  }
}

function updateClouds() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  bobPhase += 0.02;

  for (var i = 0; i < clouds.length; i++) {
    var cloud = clouds[i];

    // Wind drift — right to left
    cloud.x -= cloud.speed;

    // Wrap around
    if (cloud.x + cloud.w / 2 < -5) {
      cloud.x = W + cloud.w / 2 + Math.random() * 20;
      cloud.y = 3 + Math.random() * (H * 0.55);
      if (!cloud.isFaceCloud) {
        cloud.w = 8 + Math.floor(Math.random() * 14);
        cloud.h = 4 + Math.floor(Math.random() * 5);
        cloud.speed = 0.15 + Math.random() * 0.35;
        cloud.density = 0.5 + Math.random() * 0.5;
        generateCloudBumps(cloud);
      }
    }

    // Face cloud special behavior
    if (cloud.isFaceCloud) {
      // Keep face cloud roughly centered, drifting slowly
      var targetX = W * 0.45 + Math.sin(t * 0.1) * 5;
      var targetY = H * 0.28 + Math.sin(t * 0.07) * 3;
      cloud.x += (targetX - cloud.x) * 0.01;
      cloud.y += (targetY - cloud.y) * 0.01;

      // Gentle bob when face detected
      if (faceDetected) {
        cloud.yOffset = Math.sin(bobPhase) * 1.2;
      } else {
        cloud.yOffset *= 0.95;
      }
    } else {
      // Ambient clouds — gentle vertical sway
      cloud.yOffset = Math.sin(t * 0.3 + cloud.phase) * 0.8;
    }
  }
}

// =========================================================
// Foreground wisps
// =========================================================
function drawForegroundWisps() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // A few wispy streaks drifting across the foreground
  for (var w = 0; w < 5; w++) {
    var wx = ((t * (0.4 + w * 0.15) + w * 37) % (W + 30)) - 15;
    var wy = H * 0.5 + Math.sin(t * 0.2 + w * 2) * (H * 0.3);
    var wLen = 5 + Math.floor(Math.sin(w * 3.7) * 3);

    for (var dx = 0; dx < wLen; dx++) {
      var gx = Math.floor(wx + dx);
      var gy = Math.floor(wy + Math.sin(dx * 0.5 + t * 0.3) * 0.8);
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

      var ch = '~.  .'[dx % 5];
      if (ch !== ' ') {
        drawCharHSL(ch, gx, gy, 230, 10, 25 + Math.sin(t + dx) * 5);
      }
    }
  }
}

// =========================================================
// Main render
// =========================================================
function renderCloud() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading cloud mode...';
    var mx = Math.floor((W - msg.length) / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, Math.floor(H / 2), (t * 60 + i * 15) % 360, 60, 40);
    }
    return;
  }

  if (loadError || webcamDenied) {
    var errMsg = loadError || 'camera denied';
    var ex = Math.floor((W - errMsg.length) / 2);
    for (var ei = 0; ei < errMsg.length; ei++) {
      drawCharHSL(errMsg[ei], ex + ei, Math.floor(H / 2), 0, 70, 40);
    }
    return;
  }

  // Initialize on first valid render
  if (clouds.length === 0) {
    initClouds();
    initStars();
  }

  frameCount++;

  // Sample webcam every frame for smooth face rendering
  sampleWebcam();

  // Detect faces every N frames
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }

  // Update cloud positions
  updateClouds();

  // Layer 1: Sky gradient
  drawSkyGradient();

  // Layer 2: Stars (behind clouds)
  drawStars();

  // Layer 3: Background clouds (behind face cloud)
  for (var i = 0; i < clouds.length; i++) {
    if (!clouds[i].isFaceCloud) {
      drawCloudShape(clouds[i], false);
    }
  }

  // Layer 4: Face cloud — cloud shape first, then face on top
  for (var i = 0; i < clouds.length; i++) {
    if (clouds[i].isFaceCloud) {
      drawCloudShape(clouds[i], true);
      drawFaceOnCloud(clouds[i]);
    }
  }

  // Layer 5: Foreground wisps
  drawForegroundWisps();

  // Label
  var label = '[cloud]';
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], W - label.length - 1 + li, H - 1, 220, 15, 20);
  }
}

// =========================================================
// Init, attach, cleanup
// =========================================================
function init() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  faceDetected = false;
  faceCenterX = 0.5;
  faceCenterY = 0.5;
  faceScale = 1.0;
  webcamPixels = null;
  clouds = [];
  stars = [];
  frameCount = 0;
  bobPhase = 0;

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

function attach() {
  // No keyboard/touch events needed for this mode
}

function cleanup() {
  // Stop webcam stream
  if (webcamEl && webcamEl.srcObject) {
    var tracks = webcamEl.srcObject.getTracks();
    for (var i = 0; i < tracks.length; i++) {
      tracks[i].stop();
    }
    webcamEl.srcObject = null;
  }
  if (webcamEl && webcamEl.parentNode) {
    webcamEl.parentNode.removeChild(webcamEl);
  }
  webcamEl = null;
  webcamReady = false;

  // Clear detector
  detector = null;
  facemeshLib = null;

  // Clear state
  vidCanvas = null;
  vidCtx = null;
  webcamPixels = null;
  clouds = [];
  stars = [];
  faces = [];
  faceDetected = false;
  loading = true;
  loadError = null;
  webcamDenied = false;
}

registerMode('cloud', { init: init, render: renderCloud, attach: attach, cleanup: cleanup });
