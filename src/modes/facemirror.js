import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';
import { pointer } from '../core/pointer.js';

// Facemirror mode — kaleidoscope face
// Face detected via facemesh, then mirrored/kaleidoscoped
// Click cycles: left→right mirror, right→left, 4-way, 8-way
// Outside face area is dim ambient text

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

// Face bounding box (in grid coords)
var faceBox = null; // { x, y, w, h, cx, cy }

// Mirror modes
var MIRROR_MODES = ['left→right', 'right→left', '4-way', '8-way'];
var mirrorIdx = 0;

// Face region pixel data cache
var faceRegion = null; // { data, w, h, ox, oy } — cropped face area from webcam

var FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

// Face mask for inside/outside detection
var faceMask = null;
var faceMaskW = 0;
var faceMaskH = 0;

function initFacemirror() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  faceBox = null;
  faceRegion = null;
  faceMask = null;
  mirrorIdx = 0;

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
    updateFaceBox();
    updateMask();
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateFaceBox() {
  var W = state.COLS, H = state.ROWS;
  if (faces.length === 0) { faceBox = null; return; }

  var lm = faces[0].landmarks;
  if (!lm || lm.length < 468) { faceBox = null; return; }

  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;
  var sumX = 0, sumY = 0;

  for (var i = 0; i < FACE_OVAL.length; i++) {
    var li = FACE_OVAL[i];
    if (li >= lm.length) continue;
    var gx = (1 - lm[li].x) * W;
    var gy = lm[li].y * H;
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gy < minY) minY = gy;
    if (gy > maxY) maxY = gy;
    sumX += gx;
    sumY += gy;
  }

  var count = FACE_OVAL.length;
  faceBox = {
    x: Math.max(0, Math.floor(minX) - 1),
    y: Math.max(0, Math.floor(minY) - 1),
    w: Math.min(W, Math.ceil(maxX - minX) + 3),
    h: Math.min(H, Math.ceil(maxY - minY) + 3),
    cx: sumX / count,
    cy: sumY / count
  };
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

function renderFacemirror() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Handle click — cycle mirror mode
  if (pointer.clicked && state.currentMode === 'facemirror') {
    pointer.clicked = false;
    mirrorIdx = (mirrorIdx + 1) % MIRROR_MODES.length;
  }

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facemirror...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, my, (t * 60 + i * 15) % 360, 60, 40);
    }
    return;
  }

  if (loadError || webcamDenied) {
    var errMsg = loadError || 'camera denied';
    var ex2 = Math.floor((W - errMsg.length) / 2);
    for (var ei = 0; ei < errMsg.length; ei++) {
      drawCharHSL(errMsg[ei], ex2 + ei, Math.floor(H / 2), 0, 70, 40);
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

  var hasMask = faceMask && faceMaskW === W && faceMaskH === H;
  var mode = MIRROR_MODES[mirrorIdx];
  var hasFace = faceBox !== null;
  var fcx = hasFace ? faceBox.cx : W / 2;
  var fcy = hasFace ? faceBox.cy : H / 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var inFace = hasMask && faceMask[idx] === 1;

      if (inFace && imgData && hasFace) {
        // FACE AREA — apply kaleidoscope/mirror

        // Position relative to face center
        var relX = x - fcx;
        var relY = y - fcy;
        var srcX = x;
        var srcY = y;

        if (mode === 'left\u2192right') {
          // Mirror left half to right
          if (relX > 0) {
            srcX = Math.round(fcx - relX);
          }
        } else if (mode === 'right\u2192left') {
          // Mirror right half to left
          if (relX < 0) {
            srcX = Math.round(fcx - relX);
          }
        } else if (mode === '4-way') {
          // 4-way symmetry: mirror both axes
          srcX = Math.round(fcx + Math.abs(relX) * (relX >= 0 ? 1 : 1));
          srcY = Math.round(fcy + Math.abs(relY) * (relY >= 0 ? 1 : 1));
          // Use absolute values mapped to one quadrant
          srcX = Math.round(fcx - Math.abs(relX));
          srcY = Math.round(fcy - Math.abs(relY));
        } else if (mode === '8-way') {
          // 8-way: mirror both axes + diagonals
          var ax = Math.abs(relX);
          var ay = Math.abs(relY);
          // Fold along diagonal
          if (ay > ax) {
            var tmp = ax;
            ax = ay;
            ay = tmp;
          }
          srcX = Math.round(fcx - ax);
          srcY = Math.round(fcy - ay);
        }

        srcX = Math.max(0, Math.min(W - 1, srcX));
        srcY = Math.max(0, Math.min(H - 1, srcY));

        var srcIdx = srcY * W + srcX;
        var pi = srcIdx * 4;
        var r = imgData[pi];
        var g = imgData[pi + 1];
        var b = imgData[pi + 2];
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        if (lum < 0.02) continue;

        var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
        var ch = RAMP_DENSE[ci];

        // Edge detection for face boundary glow
        var isEdge = false;
        if (x > 0 && faceMask[idx - 1] === 0) isEdge = true;
        else if (x < W - 1 && faceMask[idx + 1] === 0) isEdge = true;
        else if (y > 0 && faceMask[idx - W] === 0) isEdge = true;
        else if (y < H - 1 && faceMask[idx + W] === 0) isEdge = true;

        if (isEdge) {
          // Neon outline
          var edgeHue = (t * 45 + x * 3 + y * 2) % 360;
          drawCharHSL('|', x, y, edgeHue, 85, 55);
          continue;
        }

        // Symmetry line highlight
        var onMirrorLine = false;
        if ((mode === 'left\u2192right' || mode === 'right\u2192left') && Math.abs(relX) < 0.8) {
          onMirrorLine = true;
        }
        if ((mode === '4-way' || mode === '8-way') && (Math.abs(relX) < 0.8 || Math.abs(relY) < 0.8)) {
          onMirrorLine = true;
        }
        if (mode === '8-way' && Math.abs(Math.abs(relX) - Math.abs(relY)) < 1) {
          onMirrorLine = true;
        }

        if (onMirrorLine) {
          // Bright mirror axis line
          var lineHue = (t * 60 + y * 5) % 360;
          drawCharHSL(ch, x, y, lineHue, 80, 40 + lum * 30);
        } else {
          // Normal mirrored face pixel
          var alpha = Math.max(0.4, Math.min(1, lum * 1.6));
          drawChar(ch, x, y, r, g, b, alpha);
        }

      } else {
        // OUTSIDE FACE — dim ambient text
        var ambientWave = Math.sin(t * 0.4 + x * 0.1 + y * 0.08) * 0.5 + 0.5;
        if (ambientWave < 0.6) continue;

        // Slow-cycling ambient characters
        var charCode = ((x * 13 + y * 29 + Math.floor(t * 1.5)) % 94) + 33;
        var ambCh = String.fromCharCode(charCode);

        var ambHue = (t * 8 + x * 0.5 + y * 0.3) % 360;
        var ambBright = 3 + ambientWave * 6;

        // Glow near face
        if (hasMask && hasFace) {
          var distToFace = 99;
          for (var dd = 1; dd <= 5; dd++) {
            var found = false;
            for (var ddy = -dd; ddy <= dd && !found; ddy++) {
              var ny = y + ddy;
              if (ny < 0 || ny >= H) continue;
              for (var ddx = -dd; ddx <= dd && !found; ddx++) {
                if (Math.abs(ddx) !== dd && Math.abs(ddy) !== dd) continue;
                var nx = x + ddx;
                if (nx >= 0 && nx < W && faceMask[ny * W + nx]) {
                  distToFace = dd;
                  found = true;
                }
              }
            }
            if (found) break;
          }
          if (distToFace <= 5) {
            ambBright += (6 - distToFace) * 4;
          }
        }

        drawCharHSL(ambCh, x, y, ambHue, 25, Math.min(25, ambBright));
      }
    }
  }

  // Label
  var label = '[mirror: ' + mode + ']';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
  var hint = 'click:mode';
  for (var hi = 0; hi < hint.length; hi++) {
    drawCharHSL(hint[hi], 1 + hi, H - 1, 0, 0, 25);
  }
}

registerMode('facemirror', { init: initFacemirror, render: renderFacemirror });
