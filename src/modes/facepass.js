import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Facepass mode — webcam passthrough in face area with glitchy ASCII overlay
// Uses @svenflow/micro-facemesh for face detection

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

// Glitch state
var glitchLines = [];    // { y, offset, length, time }
var glitchTimer = 0;

// Face silhouette
var FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

// Eyes and mouth for extra detail
var LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
var RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
var LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

function initFacepass() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  faceMask = null;
  glitchLines = [];
  glitchTimer = 0;

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
    detecting = false;
  }).catch(function() { detecting = false; });
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

    // Fill face oval (value 1 = face passthrough)
    fillPoly(pts, FACE_OVAL, 1);

    // Mark eyes (value 2)
    fillPoly(pts, LEFT_EYE, 2);
    fillPoly(pts, RIGHT_EYE, 2);

    // Mark mouth (value 3)
    fillPoly(pts, LIPS_OUTER, 3);
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
      for (var x = sx; x <= ex; x++) {
        faceMask[y * W + x] = val;
      }
    }
  }
}

function updateGlitch(t, W, H) {
  glitchTimer += 0.016;
  // Spawn new glitch lines periodically
  if (Math.random() < 0.15) {
    glitchLines.push({
      y: Math.floor(Math.random() * H),
      offset: Math.floor((Math.random() - 0.5) * 8),
      length: 3 + Math.floor(Math.random() * 15),
      time: t,
      type: Math.random() < 0.5 ? 'shift' : 'corrupt'
    });
  }
  // Remove old glitches
  for (var i = glitchLines.length - 1; i >= 0; i--) {
    if (t - glitchLines[i].time > 0.3) {
      glitchLines.splice(i, 1);
    }
  }
}

function renderFacepass() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facepass...';
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
    drawCharHSL(errMsg[0], ex, Math.floor(H/2), 0, 70, 40);
    for (var ei = 0; ei < errMsg.length; ei++) {
      drawCharHSL(errMsg[ei], ex + ei, Math.floor(H/2), 0, 70, 40);
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

  updateGlitch(t, W, H);

  // Build glitch lookup for this frame
  var glitchMap = {};
  for (var gi = 0; gi < glitchLines.length; gi++) {
    var gl = glitchLines[gi];
    glitchMap[gl.y] = gl;
  }

  var hasMask = faceMask && faceMaskW === W && faceMaskH === H;

  for (var y = 0; y < H; y++) {
    var glitch = glitchMap[y] || null;

    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var maskVal = hasMask ? faceMask[idx] : 0;

      // Apply glitch offset
      var srcX = x;
      if (glitch && x >= 0 && x < glitch.length + 5) {
        if (glitch.type === 'shift') {
          srcX = x + glitch.offset;
        }
      }
      srcX = Math.max(0, Math.min(W - 1, srcX));
      var srcIdx = y * W + srcX;

      if (maskVal > 0 && imgData) {
        // FACE AREA — webcam passthrough as ASCII
        var pi = srcIdx * 4;
        var r = imgData[pi];
        var g = imgData[pi+1];
        var b = imgData[pi+2];
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Edge of face
        var isEdge = false;
        if (x > 0 && faceMask[idx - 1] === 0) isEdge = true;
        else if (x < W - 1 && faceMask[idx + 1] === 0) isEdge = true;
        else if (y > 0 && faceMask[idx - W] === 0) isEdge = true;
        else if (y < H - 1 && faceMask[idx + W] === 0) isEdge = true;

        if (isEdge) {
          // Glowing face outline
          drawCharHSL('|', x, y, (t * 50 + x * 3) % 360, 80, 55);
          continue;
        }

        // Glitchy text overlay on face
        var glitchChance = 0;
        if (glitch && glitch.type === 'corrupt') {
          glitchChance = 0.4;
        }

        if (Math.random() < glitchChance) {
          // Corrupted character
          var gc = String.fromCharCode(33 + Math.floor(Math.random() * 94));
          var gh = (t * 100 + Math.random() * 360) % 360;
          drawCharHSL(gc, x, y, gh, 90, 55);
          continue;
        }

        if (lum < 0.03) continue;

        var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
        var ch = RAMP_DENSE[ci];

        if (maskVal === 2) {
          // Eyes — brighter, cooler
          drawChar(ch, x, y, Math.min(255, r + 40), Math.min(255, g + 60), Math.min(255, b + 80), Math.min(1, lum * 1.6));
        } else if (maskVal === 3) {
          // Mouth — warmer tint
          drawChar(ch, x, y, Math.min(255, r + 50), g, Math.max(0, b - 20), Math.min(1, lum * 1.4));
        } else {
          // General face — natural webcam color
          var alpha = Math.max(0.3, Math.min(1, lum * 1.5));
          drawChar(ch, x, y, r, g, b, alpha);
        }

      } else {
        // OUTSIDE FACE — dark ambient text
        var ambientHue = (t * 8 + y * 1.5 + x * 0.5) % 360;
        var ambientChar = ((x * 7 + y * 13 + Math.floor(t * 2)) % 94) + 33;
        var ach = String.fromCharCode(ambientChar);

        // Dim flowing characters
        var ambientBright = 8 + 4 * Math.sin(t * 0.5 + x * 0.3 + y * 0.2);

        // Near face: slightly brighter
        if (hasMask) {
          for (var dd = 1; dd <= 3; dd++) {
            var found = false;
            for (var ddy = -dd; ddy <= dd && !found; ddy++) {
              var ny = y + ddy;
              if (ny < 0 || ny >= H) continue;
              for (var ddx = -dd; ddx <= dd && !found; ddx++) {
                if (Math.abs(ddx) !== dd && Math.abs(ddy) !== dd) continue;
                var nx = x + ddx;
                if (nx >= 0 && nx < W && faceMask[ny * W + nx]) {
                  ambientBright += (4 - dd) * 6;
                  found = true;
                }
              }
            }
            if (found) break;
          }
        }

        // Glitch on ambient too
        if (glitch && glitch.type === 'corrupt' && Math.random() < 0.2) {
          ambientBright += 20;
          ambientHue = (ambientHue + 180) % 360;
        }

        drawCharHSL(ach, x, y, ambientHue, 30, Math.min(30, ambientBright));
      }
    }
  }
}

registerMode('facepass', { init: initFacepass, render: renderFacepass });
