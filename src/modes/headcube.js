import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Headcube — 3D text cube with off-axis projection from face tracking
// Move your head to shift the perspective, like looking through a window

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.js';

var facemeshLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Face position (normalized, smoothed)
var faceX = 0.5;  // 0=left, 1=right
var faceY = 0.5;  // 0=top, 1=bottom
var faceZ = 0.5;  // depth (closer face = lower value)
var targetFaceX = 0.5;
var targetFaceY = 0.5;
var targetFaceZ = 0.5;
var faceDetected = false;

// Cube geometry — 8 vertices of a unit cube centered at origin
var CUBE_VERTS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1]
];

// 12 edges
var CUBE_EDGES = [
  [0,1],[1,2],[2,3],[3,0],  // back face
  [4,5],[5,6],[6,7],[7,4],  // front face
  [0,4],[1,5],[2,6],[3,7]   // connecting edges
];

// 6 faces (for filling)
var CUBE_FACES = [
  [0,1,2,3], // back
  [4,5,6,7], // front
  [0,1,5,4], // bottom
  [2,3,7,6], // top
  [0,3,7,4], // left
  [1,2,6,5]  // right
];

// Text labels for cube faces
var FACE_LABELS = ['BACK', 'FRONT', 'BOTTOM', 'TOP', 'LEFT', 'RIGHT'];
var FACE_HUES = [0, 180, 30, 210, 90, 300]; // different color per face

function initHeadcube() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faceDetected = false;
  faceX = 0.5; faceY = 0.5; faceZ = 0.5;
  targetFaceX = 0.5; targetFaceY = 0.5; targetFaceZ = 0.5;

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
  facemeshLib({ maxFaces: 1 }).then(function(fm) {
    detector = fm;
    loading = false;
  }).catch(function(err) {
    loadError = 'Init failed: ' + err.message;
    loading = false;
  });
}

function detectFace() {
  if (!detector || !webcamReady || detecting || webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    if (result && result.length > 0) {
      var face = result[0];
      var lm = face.landmarks;
      if (lm && lm.length > 6) {
        faceDetected = true;

        // Get nose tip (index 1) and eye centers for position
        var nose = lm[1];
        var leftEye = lm[33];
        var rightEye = lm[263];

        // Face center (average of eyes)
        var eyeCenterX = (leftEye.x + rightEye.x) / 2;
        var eyeCenterY = (leftEye.y + rightEye.y) / 2;

        // Mirror X for selfie
        targetFaceX = 1 - eyeCenterX;
        targetFaceY = eyeCenterY;

        // Estimate depth from eye distance (wider = closer)
        var eyeDist = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) +
          Math.pow(rightEye.y - leftEye.y, 2)
        );
        // Typical eye distance ~0.08-0.15 normalized
        targetFaceZ = Math.max(0, Math.min(1, (eyeDist - 0.05) / 0.15));
      }
    } else {
      faceDetected = false;
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

// 3D math helpers
function rotateY(v, angle) {
  var c = Math.cos(angle), s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotateX(v, angle) {
  var c = Math.cos(angle), s = Math.sin(angle);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function rotateZ(v, angle) {
  var c = Math.cos(angle), s = Math.sin(angle);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

// Off-axis perspective projection
function projectOffAxis(v, eyeX, eyeY, eyeZ, W, H) {
  // Eye position in world space (shifted based on face tracking)
  var ex = (eyeX - 0.5) * 4;
  var ey = (eyeY - 0.5) * -3;
  var ez = 3 + eyeZ * 2; // distance from screen

  // Vector from eye to vertex
  var dx = v[0] - ex;
  var dy = v[1] - ey;
  var dz = v[2] - (-ez); // screen is at z=0, eye behind it

  if (dz <= 0.01) return null; // behind camera

  // Project onto screen plane (z=0)
  var scale = ez / dz;
  var sx = ex + dx * scale;
  var sy = ey + dy * scale;

  // Map to grid
  var gx = W / 2 + sx * W * 0.18;
  var gy = H / 2 + sy * H * 0.25;

  return { x: gx, y: gy, z: v[2], depth: dz };
}

function drawLine3D(x0, y0, x1, y1, W, H, hue, sat, bright, t) {
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(1, Math.ceil(len * 1.2));

  for (var s = 0; s <= steps; s++) {
    var frac = s / steps;
    var px = Math.round(x0 + dx * frac);
    var py = Math.round(y0 + dy * frac);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;

    // Pick character based on line direction
    var angle = Math.atan2(dy, dx);
    var ch;
    if (Math.abs(angle) < 0.4 || Math.abs(angle) > 2.74) ch = '-';
    else if (Math.abs(angle - 1.57) < 0.4 || Math.abs(angle + 1.57) < 0.4) ch = '|';
    else if (angle > 0) ch = '/';
    else ch = '\\';

    var h = (hue + frac * 30 + t * 15) % 360;
    drawCharHSL(ch, px, py, h, sat, bright);
  }
}

function renderHeadcube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading headcube...';
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
      drawCharHSL(errMsg[ei], ex + ei, Math.floor(H/2), 0, 70, 40);
    }
    // Still render cube with default position
  }

  // Detect face
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) detectFace();

  // Smooth face position
  var smooth = 0.12;
  faceX += (targetFaceX - faceX) * smooth;
  faceY += (targetFaceY - faceY) * smooth;
  faceZ += (targetFaceZ - faceZ) * smooth;

  // If no face, hold steady at center
  if (!faceDetected) {
    targetFaceX = 0.5;
    targetFaceY = 0.5;
    targetFaceZ = 0.5;
  }

  // No auto-rotation — cube orientation is purely driven by head position
  var rotY = 0;
  var rotX = 0;

  // Character aspect ratio correction
  var ar = state.CHAR_W / state.CHAR_H;

  // Transform and project all vertices
  var projected = [];
  for (var vi = 0; vi < CUBE_VERTS.length; vi++) {
    var v = CUBE_VERTS[vi].slice();

    // Scale cube
    v[0] *= 1.8;
    v[1] *= 1.8;
    v[2] *= 1.8;

    // Rotate
    v = rotateY(v, rotY);
    v = rotateX(v, rotX);

    // Correct for character aspect ratio
    v[1] *= ar;

    // Off-axis projection
    var p = projectOffAxis(v, faceX, faceY, faceZ, W, H);
    projected.push(p);
  }

  // Draw background grid (subtle depth grid)
  for (var gy = 0; gy < H; gy += 4) {
    for (var gx = 0; gx < W; gx += 6) {
      var gridHue = (t * 5 + gx * 0.5 + gy * 0.3) % 360;
      drawCharHSL('.', gx, gy, gridHue, 20, 8);
    }
  }

  // Sort edges by average depth for back-to-front rendering
  var edgeDepths = [];
  for (var ei = 0; ei < CUBE_EDGES.length; ei++) {
    var e = CUBE_EDGES[ei];
    var p0 = projected[e[0]];
    var p1 = projected[e[1]];
    if (!p0 || !p1) continue;
    var avgDepth = (p0.depth + p1.depth) / 2;
    edgeDepths.push({ idx: ei, depth: avgDepth, p0: p0, p1: p1 });
  }
  edgeDepths.sort(function(a, b) { return b.depth - a.depth; });

  // Draw edges back to front
  for (var di = 0; di < edgeDepths.length; di++) {
    var ed = edgeDepths[di];
    var depthFade = Math.max(0.3, 1 - (ed.depth - 2) / 8);
    var hue = (di * 30 + t * 20) % 360;
    var bright = Math.round(20 + depthFade * 40);
    drawLine3D(ed.p0.x, ed.p0.y, ed.p1.x, ed.p1.y, W, H, hue, 70, bright, t);
  }

  // Draw vertices as bright nodes
  for (var pi = 0; pi < projected.length; pi++) {
    var p = projected[pi];
    if (!p) continue;
    var vx = Math.round(p.x);
    var vy = Math.round(p.y);
    if (vx < 0 || vx >= W || vy < 0 || vy >= H) continue;
    var vDepth = Math.max(0.4, 1 - (p.depth - 2) / 8);
    var vHue = (pi * 45 + t * 30) % 360;
    drawCharHSL('@', vx, vy, vHue, 80, Math.round(40 + vDepth * 35));
    // Draw neighboring chars for bigger node
    if (vx > 0) drawCharHSL('+', vx - 1, vy, vHue, 60, Math.round(25 + vDepth * 20));
    if (vx < W - 1) drawCharHSL('+', vx + 1, vy, vHue, 60, Math.round(25 + vDepth * 20));
  }

  // Draw face labels on each face (text positioned at face center)
  for (var fi = 0; fi < CUBE_FACES.length; fi++) {
    var face = CUBE_FACES[fi];
    var cx = 0, cy = 0, cz = 0, count = 0;
    var allVisible = true;
    for (var fvi = 0; fvi < face.length; fvi++) {
      var fp = projected[face[fvi]];
      if (!fp) { allVisible = false; break; }
      cx += fp.x; cy += fp.y; cz += fp.depth; count++;
    }
    if (!allVisible || count === 0) continue;
    cx /= count; cy /= count; cz /= count;

    // Compute face normal to check if facing camera
    var v0 = projected[face[0]], v1 = projected[face[1]], v2 = projected[face[2]];
    var nx = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    if (nx < 0) continue; // back-facing, skip label

    var label = FACE_LABELS[fi];
    var lx = Math.round(cx - label.length / 2);
    var ly = Math.round(cy);
    var faceDepthFade = Math.max(0.3, 1 - (cz - 2) / 8);

    for (var li = 0; li < label.length; li++) {
      var charX = lx + li;
      if (charX < 0 || charX >= W || ly < 0 || ly >= H) continue;
      var lhue = FACE_HUES[fi];
      drawCharHSL(label[li], charX, ly, (lhue + t * 10) % 360, 75,
        Math.round(30 + faceDepthFade * 35));
    }
  }

  // Status indicator
  var status = faceDetected ? '[tracking]' : '[no face]';
  var sx = W - status.length - 1;
  for (var si = 0; si < status.length; si++) {
    drawCharHSL(status[si], sx + si, H - 1, faceDetected ? 120 : 0, 50, 25);
  }
}

registerMode('headcube', { init: initHeadcube, render: renderHeadcube });
