import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Facemesh mode — webcam face tracking with text flowing around your face
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
var faceMask = null;      // Uint8Array grid — 1 = face area, 2 = feature (eyes/mouth)
var faceMaskW = 0;
var faceMaskH = 0;

// Detection throttle
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Flowing text
var loremText = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'Sphinx of black quartz judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'Crazy Frederick bought many very exquisite opal jewels. ' +
  'We promptly judged antique ivory buckles for the next prize. ' +
  'The five boxing wizards jump quickly. ';

// Face feature landmark indices (MediaPipe FaceMesh V2)
// Eyes
var LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
var RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

// Lips
var UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
var LOWER_LIP = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

// Face silhouette (outer boundary)
var FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

// Iris
var LEFT_IRIS = [468, 469, 470, 471, 472];
var RIGHT_IRIS = [473, 474, 475, 476, 477];

function initFacemesh() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  faceMask = null;

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
  if (webcamReady && webcamEl && webcamEl.srcObject && webcamEl.srcObject.active) return;
  webcamReady = false;
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
  facemeshLib({ maxFaces: 2 }).then(function(fm) {
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
    updateFaceMask();
    detecting = false;
  }).catch(function() {
    detecting = false;
  });
}

function updateFaceMask() {
  var W = state.COLS, H = state.ROWS;
  if (!faceMask || faceMaskW !== W || faceMaskH !== H) {
    faceMask = new Uint8Array(W * H);
    faceMaskW = W;
    faceMaskH = H;
  }
  faceMask.fill(0);

  for (var fi = 0; fi < faces.length; fi++) {
    var face = faces[fi];
    var lm = face.landmarks;
    if (!lm || lm.length < 468) continue;

    // Convert landmarks to grid coords (mirror x for selfie)
    var pts = [];
    for (var i = 0; i < lm.length; i++) {
      pts.push({ x: (1 - lm[i].x) * W, y: lm[i].y * H });
    }

    // Fill face oval polygon
    fillIndexedPolygon(pts, FACE_OVAL);

    // Mark eye areas as feature (type 2)
    fillIndexedPolygonType(pts, LEFT_EYE, 2);
    fillIndexedPolygonType(pts, RIGHT_EYE, 2);

    // Mark mouth
    fillIndexedPolygonType(pts, UPPER_LIP, 2);
    fillIndexedPolygonType(pts, LOWER_LIP, 2);

    // Mark iris
    for (var ii = 0; ii < LEFT_IRIS.length; ii++) {
      if (LEFT_IRIS[ii] < pts.length) fillCircle(pts[LEFT_IRIS[ii]].x, pts[LEFT_IRIS[ii]].y, 1.2, 2);
    }
    for (var ri = 0; ri < RIGHT_IRIS.length; ri++) {
      if (RIGHT_IRIS[ri] < pts.length) fillCircle(pts[RIGHT_IRIS[ri]].x, pts[RIGHT_IRIS[ri]].y, 1.2, 2);
    }
  }
}

function fillIndexedPolygon(pts, indices) {
  var polyPts = [];
  for (var i = 0; i < indices.length; i++) {
    if (indices[i] < pts.length) polyPts.push(pts[indices[i]]);
  }
  if (polyPts.length > 2) fillPolygon(polyPts, 1);
}

function fillIndexedPolygonType(pts, indices, type) {
  var polyPts = [];
  for (var i = 0; i < indices.length; i++) {
    if (indices[i] < pts.length) polyPts.push(pts[indices[i]]);
  }
  if (polyPts.length > 2) fillPolygon(polyPts, type);
}

function fillCircle(cx, cy, r, type) {
  var W = faceMaskW, H = faceMaskH;
  var r2 = r * r;
  var minX = Math.max(0, Math.floor(cx - r));
  var maxX = Math.min(W - 1, Math.ceil(cx + r));
  var minY = Math.max(0, Math.floor(cy - r));
  var maxY = Math.min(H - 1, Math.ceil(cy + r));
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      var ddx = x - cx, ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= r2) {
        faceMask[y * W + x] = type;
      }
    }
  }
}

function fillPolygon(pts, type) {
  var W = faceMaskW, H = faceMaskH;
  var minY = H, maxY = 0;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));

  for (var y = minY; y <= maxY; y++) {
    var nodes = [];
    var n = pts.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      if ((pts[i].y <= y && pts[j].y > y) || (pts[j].y <= y && pts[i].y > y)) {
        var x = pts[i].x + (y - pts[i].y) / (pts[j].y - pts[i].y) * (pts[j].x - pts[i].x);
        nodes.push(x);
      }
    }
    nodes.sort(function(a, b) { return a - b; });
    for (var k = 0; k < nodes.length - 1; k += 2) {
      var startX = Math.max(0, Math.floor(nodes[k]));
      var endX = Math.min(W - 1, Math.ceil(nodes[k + 1]));
      for (var x = startX; x <= endX; x++) {
        faceMask[y * W + x] = type;
      }
    }
  }
}

function renderFacemesh() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facemesh...';
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
    renderFlowingText(W, H, t, null);
    return;
  }

  // Detect faces
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }

  // Sample webcam
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

  renderFlowingText(W, H, t, imgData);
}

function renderFlowingText(W, H, t, imgData) {
  var speed = 1.2;
  var ci = Math.floor(t * speed * 4) % loremText.length;
  var hasMask = faceMask && faceMaskW === W && faceMaskH === H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var maskVal = hasMask ? faceMask[idx] : 0;

      if (maskVal === 1) {
        // Face area (not feature): check if edge
        var isEdge = false;
        if (x > 0 && faceMask[idx - 1] === 0) isEdge = true;
        else if (x < W - 1 && faceMask[idx + 1] === 0) isEdge = true;
        else if (y > 0 && faceMask[idx - W] === 0) isEdge = true;
        else if (y < H - 1 && faceMask[idx + W] === 0) isEdge = true;

        if (isEdge) {
          // Face silhouette edge — glowing outline
          var edgeHue = (t * 40 + x * 3 + y * 2) % 360;
          drawCharHSL('|', x, y, edgeHue, 70, 50);
        }
        // Inside face: empty (text wraps around)
        continue;
      }

      if (maskVal === 2) {
        // Feature area (eyes, mouth, iris) — special characters
        var featureHue = (t * 50 + x * 5 + y * 4) % 360;
        // Determine which feature based on position
        var featureCh = '*';
        // Eyes get 'o', mouth gets '~'
        // Simple heuristic: upper half = eyes, lower = mouth
        var faceCenterY = H * 0.5;
        if (y < faceCenterY) {
          featureCh = 'o'; // eyes
        } else {
          featureCh = '~'; // mouth
        }
        drawCharHSL(featureCh, x, y, featureHue, 80, 55);
        continue;
      }

      // Outside face: flowing text
      var ch = loremText[ci % loremText.length];
      ci++;

      if (ch === ' ') continue;

      // Color
      if (imgData) {
        var pi = idx * 4;
        var r = imgData[pi];
        var g = imgData[pi + 1];
        var b = imgData[pi + 2];
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        var baseHue = (t * 15 + y * 2.5 + x * 0.5) % 360;
        var sat = 45 + lum * 35;
        var bright = 12 + lum * 30;

        // Glow near face edge
        if (hasMask) {
          var distToFace = distanceToMask(x, y, W, H, 5);
          if (distToFace < 5) {
            var glow = 1 - distToFace / 5;
            bright += glow * 30;
            sat += glow * 15;
          }
        }

        drawCharHSL(ch, x, y, baseHue, Math.min(90, sat), Math.min(60, bright));
      } else {
        var hue = (t * 20 + y * 2.5 + x * 0.8) % 360;
        var s = 45;
        var l = 22;

        if (hasMask) {
          var dtf = distanceToMask(x, y, W, H, 5);
          if (dtf < 5) {
            var g2 = 1 - dtf / 5;
            l += g2 * 30;
            s += g2 * 20;
          }
        }

        drawCharHSL(ch, x, y, hue, Math.min(90, s), Math.min(60, l));
      }
    }
  }
}

function distanceToMask(x, y, W, H, maxDist) {
  if (!faceMask) return maxDist;
  for (var d = 1; d <= maxDist; d++) {
    for (var dy = -d; dy <= d; dy++) {
      var ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (var dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        var nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        if (faceMask[ny * W + nx]) return d;
      }
    }
  }
  return maxDist;
}

registerMode('facemesh', { init: initFacemesh, render: renderFacemesh });
