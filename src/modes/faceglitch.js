import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Faceglitch mode — face area gets intense RGB channel splitting and data corruption
// Glitch intensity increases with face movement speed
// Occasional full-screen glitch bursts

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
var faceMask = null;
var faceMaskW = 0;
var faceMaskH = 0;

var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Face velocity tracking
var prevFaceCenter = null;
var faceVelocity = 0;
var glitchIntensity = 0;

// Full-screen glitch burst
var burstTimer = 0;
var burstActive = false;
var burstDuration = 0;

// Face silhouette
var FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

function initFaceglitch() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  faceMask = null;
  prevFaceCenter = null;
  faceVelocity = 0;
  glitchIntensity = 0;
  burstTimer = 0;
  burstActive = false;

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
  loadLib();
}

function startWebcam() {
  if (webcamReady) return;
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

function loadLib() {
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
    loadError = 'Load failed: ' + err.message;
    loading = false;
  });
}

function initDetector() {
  if (!facemeshLib || detector) { loading = false; return; }
  facemeshLib({ maxFaces: 2 }).then(function(fm) {
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
    updateMask();
    updateVelocity();
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateVelocity() {
  if (faces.length === 0) {
    faceVelocity *= 0.9;
    prevFaceCenter = null;
    return;
  }

  var lm = faces[0].landmarks;
  if (!lm || lm.length < 468) return;

  // Nose tip as face center (landmark 1)
  var cx = (1 - lm[1].x);
  var cy = lm[1].y;

  if (prevFaceCenter) {
    var dx = cx - prevFaceCenter.x;
    var dy = cy - prevFaceCenter.y;
    var speed = Math.sqrt(dx * dx + dy * dy);
    faceVelocity = faceVelocity * 0.6 + speed * 0.4;
  }

  prevFaceCenter = { x: cx, y: cy };
}

function updateMask() {
  var W = state.COLS, H = state.ROWS;
  if (!faceMask || faceMaskW !== W || faceMaskH !== H) {
    faceMask = new Uint8Array(W * H);
    faceMaskW = W;
    faceMaskH = H;
  }
  faceMask.fill(0);

  for (var fi = 0; fi < faces.length; fi++) {
    var lm = faces[fi].landmarks;
    if (!lm || lm.length < 468) continue;

    var pts = [];
    for (var i = 0; i < lm.length; i++) {
      pts.push({ x: (1 - lm[i].x) * W, y: lm[i].y * H });
    }

    fillPoly(pts, FACE_OVAL, 1);
  }
}

function fillPoly(pts, indices, val) {
  var W = faceMaskW, H = faceMaskH;
  var polyPts = [];
  for (var i = 0; i < indices.length; i++) {
    if (indices[i] < pts.length) polyPts.push(pts[indices[i]]);
  }
  if (polyPts.length < 3) return;

  var minY = H, maxY = 0;
  for (var i = 0; i < polyPts.length; i++) {
    if (polyPts[i].y < minY) minY = polyPts[i].y;
    if (polyPts[i].y > maxY) maxY = polyPts[i].y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));

  for (var y = minY; y <= maxY; y++) {
    var nodes = [];
    var n = polyPts.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      if ((polyPts[i].y <= y && polyPts[j].y > y) || (polyPts[j].y <= y && polyPts[i].y > y)) {
        var x = polyPts[i].x + (y - polyPts[i].y) / (polyPts[j].y - polyPts[i].y) * (polyPts[j].x - polyPts[i].x);
        nodes.push(x);
      }
    }
    nodes.sort(function(a, b) { return a - b; });
    for (var k = 0; k < nodes.length - 1; k += 2) {
      var sx = Math.max(0, Math.floor(nodes[k]));
      var ex = Math.min(W - 1, Math.ceil(nodes[k + 1]));
      for (var x2 = sx; x2 <= ex; x2++) {
        faceMask[y * W + x2] = val;
      }
    }
  }
}

function renderFaceglitch() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading faceglitch...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, my, (t * 60 + i * 15) % 360, 60, 40);
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

  if (!faceMask || faceMaskW !== W || faceMaskH !== H) {
    faceMask = new Uint8Array(W * H);
    faceMaskW = W;
    faceMaskH = H;
  }

  // Update glitch intensity based on face velocity
  var targetGlitch = Math.min(1, faceVelocity * 15);
  glitchIntensity = glitchIntensity * 0.85 + targetGlitch * 0.15;

  // Random burst trigger
  burstTimer += 0.016;
  if (!burstActive && Math.random() < 0.005 + glitchIntensity * 0.02) {
    burstActive = true;
    burstDuration = 0.1 + Math.random() * 0.25;
    burstTimer = 0;
  }
  if (burstActive && burstTimer > burstDuration) {
    burstActive = false;
  }

  var hasMask = faceMask && faceMaskW === W && faceMaskH === H;

  // RGB channel split offsets — scale with glitch intensity
  var baseShift = 1 + glitchIntensity * 6;
  var rOffX = Math.round(Math.sin(t * 3.7) * baseShift);
  var rOffY = Math.round(Math.cos(t * 2.3) * baseShift * 0.3);
  var bOffX = Math.round(Math.cos(t * 4.1) * baseShift);
  var bOffY = Math.round(Math.sin(t * 1.9) * baseShift * 0.3);

  // Corruption line params
  var corruptLines = [];
  var numCorruptLines = Math.floor(glitchIntensity * 8) + (burstActive ? 12 : 0);
  for (var cl = 0; cl < numCorruptLines; cl++) {
    corruptLines.push({
      y: Math.floor(Math.random() * H),
      shift: Math.floor((Math.random() - 0.5) * 10 * (1 + glitchIntensity * 3)),
      corrupt: Math.random() < 0.4
    });
  }

  var corruptMap = {};
  for (var ci2 = 0; ci2 < corruptLines.length; ci2++) {
    corruptMap[corruptLines[ci2].y] = corruptLines[ci2];
  }

  for (var y = 0; y < H; y++) {
    var lineCorrupt = corruptMap[y] || null;

    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var inFace = hasMask && faceMask[idx] === 1;

      if (inFace && imgData) {
        // FACE AREA — RGB channel splitting
        var srcX = x;
        if (lineCorrupt) srcX = Math.max(0, Math.min(W - 1, x + lineCorrupt.shift));

        // Sample R from offset position
        var rxSrc = Math.max(0, Math.min(W - 1, srcX + rOffX));
        var rySrc = Math.max(0, Math.min(H - 1, y + rOffY));
        var rpi = (rySrc * W + rxSrc) * 4;
        var rVal = imgData[rpi];

        // Sample G from center
        var gpi = (y * W + srcX) * 4;
        var gVal = imgData[gpi + 1];

        // Sample B from opposite offset
        var bxSrc = Math.max(0, Math.min(W - 1, srcX + bOffX));
        var bySrc = Math.max(0, Math.min(H - 1, y + bOffY));
        var bpi = (bySrc * W + bxSrc) * 4;
        var bVal = imgData[bpi + 2];

        var lum = (0.299 * rVal + 0.587 * gVal + 0.114 * bVal) / 255;
        if (lum < 0.02 && !lineCorrupt) continue;

        var ch;
        var cr = rVal, cg = gVal, cb = bVal;

        // Data corruption on face
        if (lineCorrupt && lineCorrupt.corrupt && Math.random() < 0.5) {
          ch = String.fromCharCode(33 + Math.floor(Math.random() * 94));
          // Intense color for corrupted chars
          if (Math.random() < 0.33) { cr = 255; cg = 0; cb = 0; }
          else if (Math.random() < 0.5) { cr = 0; cg = 255; cb = 0; }
          else { cr = 0; cg = 0; cb = 255; }
        } else {
          var ci3 = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
          ch = RAMP_DENSE[ci3];
        }

        // Glitch-driven color intensity boost
        var boost = 1 + glitchIntensity * 0.8;
        cr = Math.min(255, (cr * boost) | 0);
        cg = Math.min(255, (cg * boost) | 0);
        cb = Math.min(255, (cb * boost) | 0);

        var alpha = Math.max(0.4, Math.min(1, lum * 1.5 + glitchIntensity * 0.3));
        drawChar(ch, x, y, cr, cg, cb, alpha);

      } else {
        // OUTSIDE FACE — calm dark ambient text
        if (burstActive) {
          // Full-screen burst — intense glitch everywhere
          if (Math.random() < 0.3) {
            var burstCh = String.fromCharCode(33 + Math.floor(Math.random() * 94));
            var burstHue = (Math.random() * 360) | 0;
            drawCharHSL(burstCh, x, y, burstHue, 90, 15 + Math.random() * 35);
            continue;
          }
        }

        // Quiet background
        var bgWave = Math.sin(t * 0.5 + x * 0.08 + y * 0.06);
        var bgBright = 3 + bgWave * 2;

        if (bgBright < 2) continue;

        // Subtle matrix-like falling chars
        var fallSpeed = 1.5 + (x * 7 + 13) % 3;
        var fallPos = ((t * fallSpeed + x * 2.3) % H);
        var distFromFall = Math.abs(y - fallPos);
        if (distFromFall > H / 2) distFromFall = H - distFromFall;

        if (distFromFall < 3) {
          var fallCh = String.fromCharCode(33 + ((x * 17 + y * 31 + Math.floor(t * 6)) % 94));
          drawCharHSL(fallCh, x, y, 180, 30, 8 + (3 - distFromFall) * 4);
        } else if (Math.random() < 0.02) {
          drawCharHSL('.', x, y, 200, 20, 5);
        }
      }
    }
  }

  // Label
  var label = '[faceglitch]';
  var lx2 = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx2 + li, H - 1, 0, 0, 30);
  }
}

registerMode('faceglitch', { init: initFaceglitch, render: renderFaceglitch });
