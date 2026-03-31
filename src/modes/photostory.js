import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Photostory mode — face-tracked interactive story
// Scene 0: photo booth, Scene 1: capture, Scenes 2-7: portrait adventures

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
var faceX = 0.5, faceY = 0.5, faceVisible = false;

// Scene state
var currentScene = 0;
var sceneStartTime = 0;
var sceneElapsed = 0;
var transitioning = false;
var transitionProgress = 0;
var transitionStart = 0;

// Portrait data — captured face as ASCII grid
var portrait = null; // array of rows, each row is array of {char, brightness, hue, sat}
var PORTRAIT_W = 20;
var PORTRAIT_H = 15;

// Capture state
var captureCountdown = 3;
var flashIntensity = 0;
var captureQuality = 0; // how centered the face was

// Scene durations in seconds
var SCENE_DURATIONS = [0, 0, 10, 10, 10, 10, 10, 10]; // 0=manual, 1=manual trigger

// Particles
var particles = [];
var MAX_PARTICLES = 200;

// Dissolve/rebuild data
var portraitParticles = [];

// Stats
var scenesViewed = 0;

var ASCII_RAMP = ' .:-=+*#%@';

// =========================================================
// Webcam & face tracking
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
  import(/* webpackIgnore: true */ CDN_URL).then(function(mod) {
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
      var lm = faces[0].landmarks;
      faceX = 1 - lm[1].x; // nose tip, mirrored
      faceY = lm[1].y;
      faceVisible = true;
    } else {
      faceVisible = false;
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

// =========================================================
// Capture portrait from webcam
// =========================================================
function capturePortrait() {
  var W = state.COLS, H = state.ROWS;
  if (!webcamReady || webcamEl.readyState < 2 || !faceVisible) return false;

  // Draw webcam to offscreen canvas at full res
  var capW = webcamEl.videoWidth || 640;
  var capH = webcamEl.videoHeight || 480;
  vidCanvas.width = capW;
  vidCanvas.height = capH;
  vidCtx.save();
  vidCtx.translate(capW, 0);
  vidCtx.scale(-1, 1);
  vidCtx.drawImage(webcamEl, 0, 0, capW, capH);
  vidCtx.restore();

  // Get face bounding box from landmarks
  var lm = faces[0].landmarks;
  var minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (var i = 0; i < lm.length; i++) {
    var mx = 1 - lm[i].x;
    var my = lm[i].y;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }

  // Add padding
  var padX = (maxX - minX) * 0.2;
  var padY = (maxY - minY) * 0.2;
  minX = Math.max(0, minX - padX);
  maxX = Math.min(1, maxX + padX);
  minY = Math.max(0, minY - padY);
  maxY = Math.min(1, maxY + padY);

  // Pixel coords
  var px1 = Math.floor(minX * capW);
  var py1 = Math.floor(minY * capH);
  var pw = Math.floor((maxX - minX) * capW);
  var ph = Math.floor((maxY - minY) * capH);

  if (pw < 10 || ph < 10) return false;

  // Scale face region to portrait grid
  var faceCanvas = document.createElement('canvas');
  faceCanvas.width = PORTRAIT_W;
  faceCanvas.height = PORTRAIT_H;
  var faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
  faceCtx.drawImage(vidCanvas, px1, py1, pw, ph, 0, 0, PORTRAIT_W, PORTRAIT_H);
  var imgData = faceCtx.getImageData(0, 0, PORTRAIT_W, PORTRAIT_H).data;

  portrait = [];
  for (var y = 0; y < PORTRAIT_H; y++) {
    var row = [];
    for (var x = 0; x < PORTRAIT_W; x++) {
      var pi = (y * PORTRAIT_W + x) * 4;
      var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
      var brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      var ci = Math.min(ASCII_RAMP.length - 1, Math.floor(brightness * ASCII_RAMP.length));
      // Compute hue from RGB
      var maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      var hue = 0, sat = 0, lit = (maxC + minC) / 510;
      if (maxC !== minC) {
        var d = maxC - minC;
        sat = lit > 0.5 ? d / (510 - maxC - minC) : d / (maxC + minC);
        if (maxC === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (maxC === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
      }
      row.push({ char: ASCII_RAMP[ci], brightness: brightness, hue: hue, sat: sat * 100, lit: lit * 100 });
    }
    portrait.push(row);
  }

  // Calculate capture quality (how centered the face was)
  var centerDist = Math.sqrt(Math.pow(faceX - 0.5, 2) + Math.pow(faceY - 0.5, 2));
  captureQuality = Math.max(0, 1 - centerDist * 3);

  return true;
}

// =========================================================
// Draw portrait at position
// =========================================================
function drawPortrait(ox, oy, scale, tintHue, tintAmt) {
  if (!portrait) return;
  for (var y = 0; y < PORTRAIT_H; y++) {
    for (var x = 0; x < PORTRAIT_W; x++) {
      var cell = portrait[y][x];
      if (cell.char === ' ') continue;
      for (var sy = 0; sy < scale; sy++) {
        for (var sx = 0; sx < scale; sx++) {
          var gx = ox + x * scale + sx;
          var gy = oy + y * scale + sy;
          if (gx < 0 || gx >= state.COLS || gy < 0 || gy >= state.ROWS) continue;
          var h = tintAmt > 0 ? cell.hue * (1 - tintAmt) + tintHue * tintAmt : cell.hue;
          var s = Math.max(20, cell.sat * (1 - tintAmt * 0.5) + 60 * tintAmt);
          var l = cell.lit * 0.8 + 15;
          drawCharHSL(cell.char, gx, gy, h, s, l);
        }
      }
    }
  }
}

// =========================================================
// Scene transition — shutter effect
// =========================================================
function startTransition() {
  transitioning = true;
  transitionStart = state.time;
  transitionProgress = 0;
}

function updateTransition() {
  if (!transitioning) return false;
  var elapsed = state.time - transitionStart;
  var duration = 1.2;
  transitionProgress = elapsed / duration;
  if (transitionProgress >= 1) {
    transitioning = false;
    transitionProgress = 0;
    return false;
  }
  return true;
}

function drawTransition() {
  if (!transitioning) return;
  var W = state.COLS, H = state.ROWS;
  var halfH = Math.floor(H / 2);

  // Shutter closes then opens
  var shutterClose = transitionProgress < 0.5;
  var p = shutterClose ? transitionProgress * 2 : (1 - (transitionProgress - 0.5) * 2);
  var shutterH = Math.floor(p * halfH);

  for (var y = 0; y < shutterH; y++) {
    for (var x = 0; x < W; x++) {
      drawCharHSL(' ', x, y, 0, 0, 2);
      drawCharHSL(' ', x, H - 1 - y, 0, 0, 2);
      // Draw shutter edge
      if (y === shutterH - 1) {
        var edgeChar = '=';
        drawCharHSL(edgeChar, x, y, 40, 70, 30);
        drawCharHSL(edgeChar, x, H - 1 - y, 40, 70, 30);
      }
    }
  }
}

function advanceScene() {
  currentScene++;
  if (currentScene > 7) currentScene = 7;
  sceneStartTime = state.time;
  scenesViewed++;
  startTransition();
  // Reset scene-specific state
  if (currentScene === 6) initDissolve();
  if (currentScene === 7) initRebuild();
}

// =========================================================
// Scene renderers
// =========================================================
function renderScene0_Approach() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Draw webcam ASCII background
  if (webcamReady && webcamEl.readyState >= 2) {
    vidCanvas.width = W;
    vidCanvas.height = H;
    vidCtx.save();
    vidCtx.translate(W, 0);
    vidCtx.scale(-1, 1);
    vidCtx.drawImage(webcamEl, 0, 0, W, H);
    vidCtx.restore();
    var imgData = vidCtx.getImageData(0, 0, W, H).data;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var pi = (y * W + x) * 4;
        var lum = (0.299 * imgData[pi] + 0.587 * imgData[pi + 1] + 0.114 * imgData[pi + 2]) / 255;
        if (lum < 0.03) continue;
        var ci = Math.min(ASCII_RAMP.length - 1, Math.floor(lum * ASCII_RAMP.length));
        drawCharHSL(ASCII_RAMP[ci], x, y, 220, 20, lum * 20 + 5);
      }
    }
  }

  // Draw glowing frame in center
  var frameW = PORTRAIT_W + 4;
  var frameH = PORTRAIT_H + 4;
  var fx = Math.floor((W - frameW) / 2);
  var fy = Math.floor((H - frameH) / 2);
  var pulse = Math.sin(t * 3) * 0.3 + 0.7;

  for (var x = fx; x < fx + frameW; x++) {
    drawCharHSL('-', x, fy, 40, 80, 30 + pulse * 20);
    drawCharHSL('-', x, fy + frameH - 1, 40, 80, 30 + pulse * 20);
  }
  for (var y = fy; y < fy + frameH; y++) {
    drawCharHSL('|', fx, y, 40, 80, 30 + pulse * 20);
    drawCharHSL('|', fx + frameW - 1, y, 40, 80, 30 + pulse * 20);
  }
  drawCharHSL('+', fx, fy, 40, 80, 50);
  drawCharHSL('+', fx + frameW - 1, fy, 40, 80, 50);
  drawCharHSL('+', fx, fy + frameH - 1, 40, 80, 50);
  drawCharHSL('+', fx + frameW - 1, fy + frameH - 1, 40, 80, 50);

  // Guide text
  var msg = 'STEP INTO THE LIGHT';
  var mx = Math.floor((W - msg.length) / 2);
  for (var i = 0; i < msg.length; i++) {
    var ch = msg[i];
    drawCharHSL(ch, mx + i, fy - 3, 40, 70, 40 + Math.sin(t * 2 + i * 0.3) * 15);
  }

  // Check if face is centered in frame
  if (faceVisible) {
    var faceCX = faceX * W;
    var faceCY = faceY * H;
    var frameCX = fx + frameW / 2;
    var frameCY = fy + frameH / 2;
    var dist = Math.sqrt(Math.pow(faceCX - frameCX, 2) + Math.pow(faceCY - frameCY, 2));

    if (dist < frameW * 0.4) {
      // Face is in frame — show ready indicator
      var ready = 'FACE DETECTED - HOLD STILL';
      var rx = Math.floor((W - ready.length) / 2);
      for (var ri = 0; ri < ready.length; ri++) {
        drawCharHSL(ready[ri], rx + ri, fy + frameH + 2, 120, 80, 50);
      }
      // Auto advance after 2 seconds of being centered
      if (sceneElapsed > 3) {
        advanceScene();
      }
    }
  } else {
    var lost = 'FACE LOST';
    var lx = Math.floor((W - lost.length) / 2);
    for (var li = 0; li < lost.length; li++) {
      drawCharHSL(lost[li], lx + li, fy + frameH + 2, 0, 80, 40);
    }
    sceneStartTime = state.time; // reset timer when face lost
  }
}

function renderScene1_Capture() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  // Countdown phase
  if (!portrait) {
    var countNum = Math.max(1, 4 - Math.floor(elapsed));

    if (elapsed < 3) {
      // Show countdown
      // Draw webcam background
      if (webcamReady && webcamEl.readyState >= 2) {
        vidCanvas.width = W;
        vidCanvas.height = H;
        vidCtx.save();
        vidCtx.translate(W, 0);
        vidCtx.scale(-1, 1);
        vidCtx.drawImage(webcamEl, 0, 0, W, H);
        vidCtx.restore();
        var imgData = vidCtx.getImageData(0, 0, W, H).data;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var pi = (y * W + x) * 4;
            var lum = (0.299 * imgData[pi] + 0.587 * imgData[pi+1] + 0.114 * imgData[pi+2]) / 255;
            if (lum < 0.03) continue;
            var ci = Math.min(ASCII_RAMP.length - 1, Math.floor(lum * ASCII_RAMP.length));
            drawCharHSL(ASCII_RAMP[ci], x, y, 40, 30, lum * 25 + 5);
          }
        }
      }

      var numStr = '' + countNum;
      var numX = Math.floor((W - numStr.length * 5) / 2);
      var numY = Math.floor(H / 2) - 2;
      // Big number
      for (var ni = 0; ni < numStr.length; ni++) {
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            drawCharHSL(numStr[ni], numX + ni * 5 + dx, numY + dy, 40, 90, 60);
          }
        }
      }

      if (!faceVisible) {
        sceneStartTime = state.time; // pause countdown
        var lost = 'FACE LOST';
        var lx = Math.floor((W - lost.length) / 2);
        for (var li = 0; li < lost.length; li++) {
          drawCharHSL(lost[li], lx + li, H - 5, 0, 80, 40);
        }
      }
    } else {
      // Capture!
      flashIntensity = 1.0;
      capturePortrait();
      if (!portrait) {
        // Failed — retry
        sceneStartTime = state.time;
      }
    }
  }

  // Flash effect
  if (flashIntensity > 0) {
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (Math.random() < flashIntensity) {
          drawCharHSL('#', x, y, 50, 10, 80 * flashIntensity);
        }
      }
    }
    flashIntensity -= 0.03;
  }

  // After capture — show portrait briefly then advance
  if (portrait && flashIntensity <= 0) {
    var px = Math.floor((W - PORTRAIT_W * 2) / 2);
    var py = Math.floor((H - PORTRAIT_H * 2) / 2);
    drawPortrait(px, py, 2, 40, 0.2);

    var captured = 'CAPTURED';
    var cx = Math.floor((W - captured.length) / 2);
    for (var ci2 = 0; ci2 < captured.length; ci2++) {
      drawCharHSL(captured[ci2], cx + ci2, py - 3, 120, 80, 55);
    }

    if (elapsed > 5) advanceScene();
  }
}

function renderScene2_MirrorHall() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  // Hall of mirrors — multiple copies of portrait at different scales, positions, mirrored
  var numCopies = 7;
  for (var ci2 = 0; ci2 < numCopies; ci2++) {
    var angle = (ci2 / numCopies) * Math.PI * 2 + t * 0.3;
    var radius = 8 + ci2 * 4 + Math.sin(t * 0.5 + ci2) * 3;
    var cx = Math.floor(W / 2 + Math.cos(angle) * radius - PORTRAIT_W / 2);
    var cy = Math.floor(H / 2 + Math.sin(angle) * radius * 0.5 - PORTRAIT_H / 2);
    var tintHue = (ci2 * 50 + t * 20) % 360;
    drawPortrait(cx, cy, 1, tintHue, 0.4);
  }

  // Center copy, larger
  var mainX = Math.floor((W - PORTRAIT_W * 2) / 2);
  var mainY = Math.floor((H - PORTRAIT_H * 2) / 2);
  drawPortrait(mainX, mainY, 2, 40, 0.1);

  // Flipped copy on each side
  if (portrait) {
    // Draw mirrored version manually
    for (var y = 0; y < PORTRAIT_H; y++) {
      for (var x = 0; x < PORTRAIT_W; x++) {
        var cell = portrait[y][PORTRAIT_W - 1 - x]; // flipped
        if (cell.char === ' ') continue;
        var lx = mainX - PORTRAIT_W - 4 + x;
        var rx2 = mainX + PORTRAIT_W * 2 + 4 + x;
        var gy = mainY + y + Math.floor(PORTRAIT_H / 2);
        if (lx >= 0 && lx < W) drawCharHSL(cell.char, lx, gy, 280, 50, cell.lit * 0.6 + 10);
        if (rx2 >= 0 && rx2 < W) drawCharHSL(cell.char, rx2, gy, 280, 50, cell.lit * 0.6 + 10);
      }
    }
  }

  // Title
  var title = 'MIRROR HALL';
  var tx = Math.floor((W - title.length) / 2);
  for (var ti = 0; ti < title.length; ti++) {
    drawCharHSL(title[ti], tx + ti, 2, 280, 70, 40 + Math.sin(t * 3 + ti * 0.5) * 15);
  }

  if (elapsed > 10) advanceScene();
}

function renderScene3_Wanted() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  // Western-style WANTED poster
  var posterW = Math.min(40, W - 6);
  var posterH = Math.min(30, H - 4);
  var px = Math.floor((W - posterW) / 2);
  var py = Math.floor((H - posterH) / 2);

  // Poster background (warm tan)
  for (var y = py; y < py + posterH; y++) {
    for (var x = px; x < px + posterW; x++) {
      var noise = Math.sin(x * 3.7 + y * 2.1) * 0.1 + 0.9;
      drawCharHSL('.', x, y, 35, 40, 12 * noise);
    }
  }

  // Border — double line
  for (var x = px; x < px + posterW; x++) {
    drawCharHSL('=', x, py, 30, 60, 35);
    drawCharHSL('=', x, py + 1, 30, 60, 30);
    drawCharHSL('=', x, py + posterH - 1, 30, 60, 35);
    drawCharHSL('=', x, py + posterH - 2, 30, 60, 30);
  }
  for (var y = py; y < py + posterH; y++) {
    drawCharHSL('|', px, y, 30, 60, 35);
    drawCharHSL('|', px + 1, y, 30, 60, 30);
    drawCharHSL('|', px + posterW - 1, y, 30, 60, 35);
    drawCharHSL('|', px + posterW - 2, y, 30, 60, 30);
  }

  // WANTED text
  var wanted = 'W A N T E D';
  var wx = Math.floor((W - wanted.length) / 2);
  for (var wi = 0; wi < wanted.length; wi++) {
    drawCharHSL(wanted[wi], wx + wi, py + 3, 0, 80, 45 + Math.sin(t * 2 + wi) * 10);
  }

  // Portrait in center of poster
  var ppx = Math.floor((W - PORTRAIT_W) / 2);
  var ppy = py + 6;
  drawPortrait(ppx, ppy, 1, 30, 0.5);

  // Bounty text
  var bounty = '0,000 REWARD';
  var bx = Math.floor((W - bounty.length) / 2);
  for (var bi = 0; bi < bounty.length; bi++) {
    drawCharHSL(bounty[bi], bx + bi, ppy + PORTRAIT_H + 2, 45, 90, 50);
  }

  var crime = 'CRIMES AGAINST ASCII';
  var crx = Math.floor((W - crime.length) / 2);
  for (var cri = 0; cri < crime.length; cri++) {
    drawCharHSL(crime[cri], crx + cri, ppy + PORTRAIT_H + 4, 30, 50, 35);
  }

  // Tumbleweeds
  for (var tw = 0; tw < 3; tw++) {
    var twx = ((t * 8 + tw * 40) % (W + 20)) - 10;
    var twy = H - 3 - tw;
    var twChar = tw % 2 === 0 ? '@' : '*';
    var rot = Math.floor(t * 5 + tw * 3) % 4;
    if (rot === 1) twChar = '#';
    if (rot === 2) twChar = '%';
    var ix = Math.floor(twx);
    if (ix >= 0 && ix < W) {
      drawCharHSL(twChar, ix, twy, 35, 40, 25);
    }
  }

  if (elapsed > 10) advanceScene();
}

function renderScene4_Gallery() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  // Gallery walls
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var wallNoise = Math.sin(x * 0.5 + y * 0.3) * 0.1;
      drawCharHSL('.', x, y, 240, 15, 5 + wallNoise * 3);
    }
  }

  // Floor
  for (var x = 0; x < W; x++) {
    var floorY = H - 3;
    for (var fy = floorY; fy < H; fy++) {
      var floorChar = (x + fy) % 2 === 0 ? '#' : '.';
      drawCharHSL(floorChar, x, fy, 30, 20, 8);
    }
  }

  // Main portrait with ornate frame and spotlight
  var mainX = Math.floor((W - PORTRAIT_W * 2) / 2);
  var mainY = Math.floor(H / 3) - PORTRAIT_H;

  // Spotlight effect
  for (var sy = 0; sy < H; sy++) {
    for (var sx = mainX - 5; sx < mainX + PORTRAIT_W * 2 + 5; sx++) {
      if (sx < 0 || sx >= W) continue;
      var distX = Math.abs(sx - (mainX + PORTRAIT_W)) / (PORTRAIT_W + 5);
      var distY = Math.abs(sy - mainY) / H;
      var spotBright = Math.max(0, 1 - Math.sqrt(distX * distX + distY * distY) * 1.5);
      if (spotBright > 0.05) {
        drawCharHSL('.', sx, sy, 45, 30, spotBright * 12);
      }
    }
  }

  // Ornate frame
  var fw = PORTRAIT_W * 2 + 4;
  var fh = PORTRAIT_H * 2 + 4;
  var ffx = mainX - 2;
  var ffy = mainY - 2;
  for (var x = ffx; x < ffx + fw; x++) {
    drawCharHSL('#', x, ffy, 45, 80, 40);
    drawCharHSL('#', x, ffy + fh - 1, 45, 80, 40);
  }
  for (var y = ffy; y < ffy + fh; y++) {
    drawCharHSL('#', ffx, y, 45, 80, 40);
    drawCharHSL('#', ffx + fw - 1, y, 45, 80, 40);
  }

  drawPortrait(mainX, mainY, 2, 40, 0.15);

  // Side paintings — abstract ASCII art
  var sideW = 8;
  var sideH = 6;
  // Left painting
  for (var y = 0; y < sideH; y++) {
    for (var x = 0; x < sideW; x++) {
      var ch = String.fromCharCode(33 + ((x * 7 + y * 13 + Math.floor(t * 0.5)) % 60));
      var hue = (x * 30 + y * 45 + t * 10) % 360;
      drawCharHSL(ch, 3 + x, mainY + y, hue, 60, 30);
    }
  }
  // Right painting
  for (var y = 0; y < sideH; y++) {
    for (var x = 0; x < sideW; x++) {
      var ch2 = String.fromCharCode(33 + ((x * 11 + y * 7 + Math.floor(t * 0.3)) % 60));
      var hue2 = (x * 50 + y * 20 + t * 15 + 180) % 360;
      drawCharHSL(ch2, W - 11 + x, mainY + y, hue2, 60, 30);
    }
  }

  // Plaque
  var plaque = 'UNTITLED SELFIE';
  var plx = Math.floor((W - plaque.length) / 2);
  for (var pli = 0; pli < plaque.length; pli++) {
    drawCharHSL(plaque[pli], plx + pli, mainY + PORTRAIT_H * 2 + 3, 45, 60, 35);
  }

  if (elapsed > 10) advanceScene();
}

function renderScene5_Glitch() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  if (!portrait) return;

  var scale = 2;
  var px = Math.floor((W - PORTRAIT_W * scale) / 2);
  var py = Math.floor((H - PORTRAIT_H * scale) / 2);
  var glitchIntensity = Math.min(1, elapsed / 8);

  for (var y = 0; y < PORTRAIT_H; y++) {
    for (var x = 0; x < PORTRAIT_W; x++) {
      var cell = portrait[y][x];
      if (cell.char === ' ') continue;

      // Scanline effect
      var scanline = Math.sin(y * 3 + t * 5) > 0.7 - glitchIntensity * 0.5;

      // Pixel sort — shift x based on brightness
      var sortOffset = scanline ? Math.floor(cell.brightness * 5 * glitchIntensity) : 0;

      // Chromatic aberration
      var chromOffset = Math.floor(glitchIntensity * 3 * Math.sin(t * 7 + y));

      for (var sy = 0; sy < scale; sy++) {
        for (var sx = 0; sx < scale; sx++) {
          var gx = px + (x + sortOffset) * scale + sx;
          var gy = py + y * scale + sy;
          if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

          // Red channel shifted
          drawCharHSL(cell.char, gx + chromOffset, gy, 0, 80, cell.lit * 0.5 + 10);
          // Cyan channel shifted other way
          drawCharHSL(cell.char, gx - chromOffset, gy, 180, 80, cell.lit * 0.3 + 5);
          // Main
          var glitchHue = cell.hue + Math.random() * glitchIntensity * 180;
          drawCharHSL(cell.char, gx, gy, glitchHue, cell.sat, cell.lit * 0.7 + 10);
        }
      }
    }
  }

  // Random glitch blocks
  if (glitchIntensity > 0.3) {
    var numBlocks = Math.floor(glitchIntensity * 8);
    for (var bi = 0; bi < numBlocks; bi++) {
      var bx = Math.floor(Math.sin(t * 13 + bi * 7) * W * 0.5 + W * 0.5);
      var by = Math.floor(Math.cos(t * 11 + bi * 5) * H * 0.3 + H * 0.5);
      var bw = Math.floor(Math.random() * 10 + 3);
      for (var gx = bx; gx < bx + bw && gx < W; gx++) {
        if (gx < 0) continue;
        var gc = String.fromCharCode(33 + Math.floor(Math.random() * 90));
        drawCharHSL(gc, gx, by, Math.random() * 360, 90, 40);
      }
    }
  }

  // Title
  var title = 'G L I T C H';
  var tx = Math.floor((W - title.length) / 2);
  var ty = 2;
  for (var ti = 0; ti < title.length; ti++) {
    var glitchX = tx + ti + (Math.random() < glitchIntensity * 0.3 ? Math.floor(Math.random() * 3 - 1) : 0);
    drawCharHSL(title[ti], glitchX, ty, Math.random() * 360, 90, 50);
  }

  if (elapsed > 10) advanceScene();
}

function initDissolve() {
  if (!portrait) return;
  portraitParticles = [];
  var scale = 2;
  var px = Math.floor((state.COLS - PORTRAIT_W * scale) / 2);
  var py = Math.floor((state.ROWS - PORTRAIT_H * scale) / 2);

  for (var y = 0; y < PORTRAIT_H; y++) {
    for (var x = 0; x < PORTRAIT_W; x++) {
      var cell = portrait[y][x];
      if (cell.char === ' ') continue;
      portraitParticles.push({
        char: cell.char,
        homeX: px + x * scale, homeY: py + y * scale,
        x: px + x * scale, y: py + y * scale,
        vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 0.5,
        hue: cell.hue, sat: cell.sat, lit: cell.lit,
        delay: Math.random() * 5, // staggered dissolve
        dissolved: false
      });
    }
  }
}

function renderScene6_Dissolve() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  var title = 'DISSOLVE';
  var tx = Math.floor((W - title.length) / 2);
  for (var ti = 0; ti < title.length; ti++) {
    var alpha = Math.max(0, 1 - elapsed / 8);
    drawCharHSL(title[ti], tx + ti, 2, 280, 60, 30 * alpha);
  }

  for (var pi = 0; pi < portraitParticles.length; pi++) {
    var p = portraitParticles[pi];
    if (elapsed > p.delay && !p.dissolved) {
      p.dissolved = true;
    }
    if (p.dissolved) {
      p.x += p.vx * 0.15;
      p.y += p.vy * 0.15;
      p.vy += 0.005; // slight gravity
      p.vx += (Math.random() - 0.5) * 0.1; // drift
    }

    var gx = Math.floor(p.x);
    var gy = Math.floor(p.y);
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

    var fadeOut = p.dissolved ? Math.max(0, 1 - (elapsed - p.delay) / 5) : 1;
    drawCharHSL(p.char, gx, gy, p.hue, p.sat * fadeOut, p.lit * fadeOut * 0.8 + 5);
  }

  if (elapsed > 10) advanceScene();
}

function initRebuild() {
  // Reset particles to scattered positions, they will lerp back home
  for (var pi = 0; pi < portraitParticles.length; pi++) {
    var p = portraitParticles[pi];
    // Scatter them randomly
    p.x = Math.random() * state.COLS;
    p.y = Math.random() * state.ROWS;
    p.delay = Math.random() * 4;
    p.dissolved = false;
  }
}

function renderScene7_Rebuild() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var elapsed = sceneElapsed;

  for (var pi = 0; pi < portraitParticles.length; pi++) {
    var p = portraitParticles[pi];
    var prog = Math.max(0, Math.min(1, (elapsed - p.delay) / 4));
    // Ease in-out
    prog = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;

    var drawX = p.x + (p.homeX - p.x) * prog;
    var drawY = p.y + (p.homeY - p.y) * prog;

    var gx = Math.floor(drawX);
    var gy = Math.floor(drawY);
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

    var glowHue = prog < 1 ? (p.hue + (1 - prog) * 120) % 360 : p.hue;
    var glowLit = p.lit * prog * 0.8 + 10 + (1 - prog) * 20;
    drawCharHSL(p.char, gx, gy, glowHue, p.sat, glowLit);

    // Trail
    if (prog < 0.9) {
      var trailX = Math.floor(drawX - (p.homeX - p.x) * 0.05);
      var trailY = Math.floor(drawY - (p.homeY - p.y) * 0.05);
      if (trailX >= 0 && trailX < W && trailY >= 0 && trailY < H) {
        drawCharHSL('.', trailX, trailY, glowHue, 40, 10);
      }
    }
  }

  // Stats overlay when rebuild complete
  if (elapsed > 6) {
    var statsY = H - 8;
    var stats = [
      'CAPTURE QUALITY: ' + Math.floor(captureQuality * 100) + '%',
      'SCENES VIEWED: ' + scenesViewed,
      'PORTRAIT SIZE: ' + PORTRAIT_W + 'x' + PORTRAIT_H
    ];
    for (var si = 0; si < stats.length; si++) {
      var sx = Math.floor((W - stats[si].length) / 2);
      for (var sci = 0; sci < stats[si].length; sci++) {
        drawCharHSL(stats[si][sci], sx + sci, statsY + si * 2, 45, 60, 35);
      }
    }
  }
}

// =========================================================
// Init & main render
// =========================================================
function initPhotostory() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  portrait = null;
  currentScene = 0;
  sceneStartTime = state.time;
  transitioning = false;
  flashIntensity = 0;
  scenesViewed = 0;
  portraitParticles = [];
  captureQuality = 0;

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

function renderPhotostory() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  sceneElapsed = t - sceneStartTime;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading photostory...';
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

  frameCount++;
  if (frameCount % detectInterval === 0 && detector) detectFaces();

  // Render current scene
  switch (currentScene) {
    case 0: renderScene0_Approach(); break;
    case 1: renderScene1_Capture(); break;
    case 2: renderScene2_MirrorHall(); break;
    case 3: renderScene3_Wanted(); break;
    case 4: renderScene4_Gallery(); break;
    case 5: renderScene5_Glitch(); break;
    case 6: renderScene6_Dissolve(); break;
    case 7: renderScene7_Rebuild(); break;
  }

  // Draw transition overlay
  if (updateTransition()) {
    drawTransition();
  }

  // Scene indicator
  var sceneLabel = 'SCENE ' + currentScene + '/7';
  for (var sli = 0; sli < sceneLabel.length; sli++) {
    drawCharHSL(sceneLabel[sli], W - sceneLabel.length - 1 + sli, H - 1, 0, 0, 20);
  }
}

registerMode('photostory', { init: initPhotostory, render: renderPhotostory });
