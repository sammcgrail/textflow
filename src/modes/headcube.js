import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Headcube — floating 3D ASCII cube with head-coupled parallax
// Move your head to peek around the cube — off-axis projection

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
var faceX = 0.5;
var faceY = 0.5;
var faceZ = 0.5;
var targetFaceX = 0.5;
var targetFaceY = 0.5;
var targetFaceZ = 0.5;
var faceDetected = false;

// Cube geometry — 8 vertices centered at origin
var CUBE_VERTS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1]
];

// 12 edges
var CUBE_EDGES = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7]
];

// 6 faces
var CUBE_FACES = [
  [0,1,2,3], // back
  [4,5,6,7], // front
  [0,1,5,4], // bottom
  [2,3,7,6], // top
  [0,3,7,4], // left
  [1,2,6,5]  // right
];

var FACE_LABELS = ['BACK', 'FRONT', 'BOTTOM', 'TOP', 'LEFT', 'RIGHT'];
var FACE_HUES = [200, 180, 30, 60, 120, 300];

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
        var leftEye = lm[33];
        var rightEye = lm[263];
        var eyeCenterX = (leftEye.x + rightEye.x) / 2;
        var eyeCenterY = (leftEye.y + rightEye.y) / 2;
        targetFaceX = 1 - eyeCenterX;
        targetFaceY = eyeCenterY;
        var eyeDist = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) +
          Math.pow(rightEye.y - leftEye.y, 2)
        );
        targetFaceZ = Math.max(0, Math.min(1, (eyeDist - 0.05) / 0.15));
      }
    } else {
      faceDetected = false;
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

// 3D rotation helpers
function rotateY(v, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rotateX(v, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

// Off-axis perspective: viewer looks at cube floating in front of them
function projectOffAxis(v, eyeX, eyeY, eyeZ, W, H) {
  // Eye offset from center — amplified for strong parallax
  var ex = (eyeX - 0.5) * 8;
  var ey = (eyeY - 0.5) * -6;
  // Viewer distance from screen plane
  var viewDist = 5 + eyeZ * 3;

  // Cube sits at z=0, viewer is at z=-viewDist looking toward +z
  // Project vertex onto screen plane (z = -screenDist)
  var screenDist = 2;
  var vx = v[0] - ex;
  var vy = v[1] - ey;
  var vz = v[2] + viewDist; // shift so viewer is at origin

  if (vz <= 0.1) return null;

  var scale = viewDist / vz;
  var sx = ex + vx * scale;
  var sy = ey + vy * scale;

  // Map to grid coords with generous scaling
  var gx = W / 2 + sx * W * 0.12;
  var gy = H / 2 + sy * H * 0.18;

  return { x: gx, y: gy, z: v[2], depth: vz };
}

function drawLine3D(x0, y0, x1, y1, W, H, hue, sat, bright) {
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(1, Math.ceil(len * 1.5));
  var angle = Math.atan2(dy, dx);
  var ch;
  if (Math.abs(angle) < 0.4 || Math.abs(angle) > 2.74) ch = '=';
  else if (Math.abs(angle - 1.57) < 0.4 || Math.abs(angle + 1.57) < 0.4) ch = '|';
  else if ((angle > 0 && angle < 1.57) || (angle < -1.57)) ch = '/';
  else ch = '\\';

  for (var s = 0; s <= steps; s++) {
    var frac = s / steps;
    var px = Math.round(x0 + dx * frac);
    var py = Math.round(y0 + dy * frac);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    drawCharHSL(ch, px, py, hue, sat, bright);
  }
}

// Fill a projected quad with characters
function fillFace(projected, faceVerts, W, H, hue, sat, bright, label) {
  var pts = [];
  for (var i = 0; i < faceVerts.length; i++) {
    var p = projected[faceVerts[i]];
    if (!p) return;
    pts.push(p);
  }

  // Compute face normal (cross product in screen space)
  var nx = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
           (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
  if (nx < 0) return; // back-facing

  // Scanline fill
  var minY = H, maxY = 0;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));

  // Face center for label placement
  var cx = 0, cy = 0;
  for (var i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
  cx /= pts.length; cy /= pts.length;

  var n = pts.length;
  for (var y = minY; y <= maxY; y++) {
    var nodes = [];
    for (var i = 0, j = n - 1; i < n; j = i++) {
      if ((pts[i].y <= y && pts[j].y > y) || (pts[j].y <= y && pts[i].y > y)) {
        var ix = pts[i].x + (y - pts[i].y) / (pts[j].y - pts[i].y) * (pts[j].x - pts[i].x);
        nodes.push(ix);
      }
    }
    nodes.sort(function(a, b) { return a - b; });
    for (var k = 0; k < nodes.length - 1; k += 2) {
      var sx = Math.max(0, Math.ceil(nodes[k]));
      var ex = Math.min(W - 1, Math.floor(nodes[k + 1]));
      for (var x = sx; x <= ex; x++) {
        // Check if this pixel is where the label should go
        var isLabel = false;
        if (label && Math.round(cy) === y) {
          var lx = Math.round(cx - label.length / 2);
          var li = x - lx;
          if (li >= 0 && li < label.length) {
            drawCharHSL(label[li], x, y, hue, 80, Math.min(70, bright + 20));
            isLabel = true;
          }
        }
        if (!isLabel) {
          // Fill with dim texture character
          var tc = ((x * 3 + y * 7) % 4);
          var fillCh = tc === 0 ? '.' : tc === 1 ? ':' : tc === 2 ? '.' : ' ';
          if (fillCh !== ' ') {
            drawCharHSL(fillCh, x, y, hue, sat, Math.max(8, bright - 15));
          }
        }
      }
    }
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
    var emx = Math.floor((W - errMsg.length) / 2);
    for (var ei = 0; ei < errMsg.length; ei++) {
      drawCharHSL(errMsg[ei], emx + ei, Math.floor(H/2), 0, 70, 40);
    }
  }

  // Detect face
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) detectFace();

  // Smooth face position
  var smooth = 0.1;
  faceX += (targetFaceX - faceX) * smooth;
  faceY += (targetFaceY - faceY) * smooth;
  faceZ += (targetFaceZ - faceZ) * smooth;

  // Hold steady when no face
  if (!faceDetected) {
    targetFaceX = 0.5;
    targetFaceY = 0.5;
    targetFaceZ = 0.5;
  }

  var ar = state.CHAR_W / state.CHAR_H;

  // Static background — sparse dim grid for depth reference
  for (var by = 0; by < H; by++) {
    for (var bx = 0; bx < W; bx++) {
      // Very sparse dots — only at grid intersections
      if (bx % 8 === 0 && by % 6 === 0) {
        drawCharHSL('.', bx, by, 220, 10, 6);
      }
    }
  }

  // Slight initial rotation so you see 3 faces (isometric-ish angle)
  var baseRotY = 0.6;
  var baseRotX = 0.4;

  // Transform vertices
  var projected = [];
  for (var vi = 0; vi < CUBE_VERTS.length; vi++) {
    var v = CUBE_VERTS[vi].slice();

    // Scale cube bigger
    v[0] *= 2.5;
    v[1] *= 2.5;
    v[2] *= 2.5;

    // Base rotation so cube is angled
    v = rotateY(v, baseRotY);
    v = rotateX(v, baseRotX);

    // Aspect ratio correction
    v[1] *= ar;

    var p = projectOffAxis(v, faceX, faceY, faceZ, W, H);
    projected.push(p);
  }

  // Sort faces by average depth (far first for painter's algorithm)
  var faceOrder = [];
  for (var fi = 0; fi < CUBE_FACES.length; fi++) {
    var face = CUBE_FACES[fi];
    var avgD = 0;
    var valid = true;
    for (var fvi = 0; fvi < face.length; fvi++) {
      if (!projected[face[fvi]]) { valid = false; break; }
      avgD += projected[face[fvi]].depth;
    }
    if (!valid) continue;
    avgD /= face.length;
    faceOrder.push({ idx: fi, depth: avgD });
  }
  faceOrder.sort(function(a, b) { return b.depth - a.depth; });

  // Draw filled faces (back to front)
  for (var foi = 0; foi < faceOrder.length; foi++) {
    var fi = faceOrder[foi].idx;
    var depth = faceOrder[foi].depth;
    var depthFade = Math.max(0.3, 1 - (depth - 3) / 10);
    var hue = FACE_HUES[fi];
    var bright = Math.round(12 + depthFade * 25);
    fillFace(projected, CUBE_FACES[fi], W, H, hue, 50, bright, FACE_LABELS[fi]);
  }

  // Draw edges (depth-sorted)
  var edgeDepths = [];
  for (var ei = 0; ei < CUBE_EDGES.length; ei++) {
    var e = CUBE_EDGES[ei];
    var p0 = projected[e[0]];
    var p1 = projected[e[1]];
    if (!p0 || !p1) continue;
    edgeDepths.push({ p0: p0, p1: p1, depth: (p0.depth + p1.depth) / 2 });
  }
  edgeDepths.sort(function(a, b) { return b.depth - a.depth; });

  for (var di = 0; di < edgeDepths.length; di++) {
    var ed = edgeDepths[di];
    var depthFade = Math.max(0.3, 1 - (ed.depth - 3) / 10);
    var hue = (200 + di * 15) % 360;
    var bright = Math.round(30 + depthFade * 40);
    drawLine3D(ed.p0.x, ed.p0.y, ed.p1.x, ed.p1.y, W, H, hue, 60, bright);
  }

  // Draw vertices as bright nodes
  for (var pi = 0; pi < projected.length; pi++) {
    var p = projected[pi];
    if (!p) continue;
    var vx = Math.round(p.x);
    var vy = Math.round(p.y);
    if (vx < 0 || vx >= W || vy < 0 || vy >= H) continue;
    var vDepth = Math.max(0.4, 1 - (p.depth - 3) / 10);
    var vBright = Math.round(50 + vDepth * 30);
    drawCharHSL('#', vx, vy, 200, 70, vBright);
    if (vx > 0) drawCharHSL('+', vx - 1, vy, 200, 50, Math.round(vBright * 0.6));
    if (vx < W - 1) drawCharHSL('+', vx + 1, vy, 200, 50, Math.round(vBright * 0.6));
  }

  // Drop shadow on ground (projected below cube)
  var shadowY = H * 0.75;
  for (var si = 0; si < projected.length; si++) {
    var p = projected[si];
    if (!p) continue;
    var sx = Math.round(p.x + (p.x - W/2) * 0.2);
    var sy = Math.round(shadowY + (p.x - W/2) * 0.05);
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      drawCharHSL('.', sx, sy, 220, 10, 8);
    }
  }

  // Status
  var status = faceDetected ? '[tracking]' : '[no face]';
  var stx = W - status.length - 1;
  for (var si = 0; si < status.length; si++) {
    drawCharHSL(status[si], stx + si, H - 1, faceDetected ? 120 : 0, 50, 20);
  }
}

registerMode('headcube', { init: initHeadcube, render: renderHeadcube });
