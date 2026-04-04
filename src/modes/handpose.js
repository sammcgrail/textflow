import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Handpose mode — webcam hand tracking with text flowing around your hand
// Uses @svenflow/micro-handpose (WebGPU-powered, 21 landmarks per hand)

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-handpose@0.3.0/dist/index.js';

var handposeLib = null;    // createHandpose function
var detector = null;       // handpose instance
var webcamEl = null;       // video element
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var vidCanvas = null;
var vidCtx = null;

// Hand data — updated each detection frame
var hands = [];           // raw hand results
var handMask = null;      // Uint8Array grid — 1 = hand area
var handMaskW = 0;
var handMaskH = 0;

// Detection loop (decoupled from render via setTimeout)
var detecting = false;
var DETECT_INTERVAL_MS = 50; // ~20fps detection
var detectionLoopStarted = false;

// Flowing text
var loremText = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'Sphinx of black quartz judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'Crazy Frederick bought many very exquisite opal jewels. ' +
  'We promptly judged antique ivory buckles for the next prize. ' +
  'The five boxing wizards jump quickly. ';

// 21 MediaPipe hand landmark indices
// 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],       // thumb
  [0,5],[5,6],[6,7],[7,8],       // index
  [0,9],[9,10],[10,11],[11,12],  // middle
  [0,13],[13,14],[14,15],[15,16],// ring
  [0,17],[17,18],[18,19],[19,20],// pinky
  [5,9],[9,13],[13,17]           // palm cross
];

// Convex hull of hand for filling
var HAND_OUTLINE = [0, 1, 2, 3, 4, 8, 12, 16, 20, 19, 18, 17, 0];

function initHandpose() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  handMask = null;

  // Create offscreen canvas for video sampling
  vidCanvas = document.createElement('canvas');
  vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });

  // Start webcam
  if (!webcamEl) {
    webcamEl = document.createElement('video');
    webcamEl.muted = true;
    webcamEl.playsInline = true;
    webcamEl.setAttribute('autoplay', '');
    webcamEl.style.display = 'none';
    document.body.appendChild(webcamEl);
  }

  startWebcam();
  loadHandposeLib();
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

function loadHandposeLib() {
  if (handposeLib) {
    initDetector();
    return;
  }

  // Check WebGPU support
  if (!navigator.gpu) {
    // Fallback — no WebGPU, still show webcam ASCII but no hand detection
    loadError = 'no WebGPU — hand tracking unavailable';
    loading = false;
    return;
  }

  import(/* webpackIgnore: true */ CDN_URL).then(function(mod) {
    handposeLib = mod.createHandpose || mod.default?.createHandpose || mod;
    if (typeof handposeLib === 'object' && handposeLib.createHandpose) {
      handposeLib = handposeLib.createHandpose;
    }
    initDetector();
  }).catch(function(err) {
    loadError = 'Failed to load handpose: ' + err.message;
    loading = false;
  });
}

function initDetector() {
  if (!handposeLib || detector) {
    loading = false;
    return;
  }
  handposeLib().then(function(hp) {
    detector = hp;
    loading = false;
  }).catch(function(err) {
    loadError = 'Handpose init failed: ' + err.message;
    loading = false;
  });
}

function startDetectionLoop() {
  if (detectionLoopStarted) return;
  detectionLoopStarted = true;
  function loop() {
    if (!detector || !webcamReady) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    if (detecting) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    if (webcamEl.readyState < 2) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    detecting = true;
    detector.detect(webcamEl).then(function(result) {
      hands = result || [];
      updateHandMask();
      detecting = false;
      setTimeout(loop, DETECT_INTERVAL_MS);
    }).catch(function() {
      detecting = false;
      setTimeout(loop, DETECT_INTERVAL_MS);
    });
  }
  setTimeout(loop, 0);
}

function updateHandMask() {
  var W = state.COLS, H = state.ROWS;
  if (!handMask || handMaskW !== W || handMaskH !== H) {
    handMask = new Uint8Array(W * H);
    handMaskW = W;
    handMaskH = H;
  }
  // Clear mask
  handMask.fill(0);

  for (var hi = 0; hi < hands.length; hi++) {
    var hand = hands[hi];
    var lm = hand.landmarks || hand.keypoints;
    if (!lm) continue;

    // Convert landmarks to grid coords
    // landmarks are normalized 0-1 (x,y)
    var pts = [];
    if (Array.isArray(lm)) {
      for (var i = 0; i < lm.length; i++) {
        var p = lm[i];
        // Mirror x for selfie view
        pts.push({ x: (1 - p.x) * W, y: p.y * H });
      }
    } else {
      // Named keypoints object
      var keys = ['wrist', 'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
        'index_mcp', 'index_pip', 'index_dip', 'index_tip',
        'middle_mcp', 'middle_pip', 'middle_dip', 'middle_tip',
        'ring_mcp', 'ring_pip', 'ring_dip', 'ring_tip',
        'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip'];
      for (var k = 0; k < keys.length; k++) {
        var kp = lm[keys[k]];
        if (kp) pts.push({ x: (1 - kp.x) * W, y: kp.y * H });
        else pts.push({ x: 0, y: 0 });
      }
    }

    if (pts.length < 21) continue;

    // Fill hand shape first (value 1)
    // Draw thick lines along hand connections
    for (var c = 0; c < HAND_CONNECTIONS.length; c++) {
      var a = pts[HAND_CONNECTIONS[c][0]];
      var b = pts[HAND_CONNECTIONS[c][1]];
      drawThickLine(a.x, a.y, b.x, b.y, 2.5);
    }

    // Fill circles at each landmark
    for (var li = 0; li < pts.length; li++) {
      fillCircle(pts[li].x, pts[li].y, 2.0);
    }

    // Fill palm area
    var palmPts = [];
    for (var oi = 0; oi < HAND_OUTLINE.length; oi++) {
      palmPts.push(pts[HAND_OUTLINE[oi]]);
    }
    fillPolygon(palmPts);

    // Fill finger segments thicker
    fillFingerSegments(pts);

    // Now overlay skeleton lines (value 2) and joint nodes (value 3)
    for (var sc = 0; sc < HAND_CONNECTIONS.length; sc++) {
      var sa = pts[HAND_CONNECTIONS[sc][0]];
      var sb = pts[HAND_CONNECTIONS[sc][1]];
      drawSkeletonLine(sa.x, sa.y, sb.x, sb.y);
    }
    for (var ji = 0; ji < pts.length; ji++) {
      markJoint(pts[ji].x, pts[ji].y);
    }
  }
}

function drawSkeletonLine(x0, y0, x1, y1) {
  var W = handMaskW;
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(1, Math.ceil(len * 1.5));
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    var cx = Math.round(x0 + dx * t);
    var cy = Math.round(y0 + dy * t);
    if (cx >= 0 && cx < handMaskW && cy >= 0 && cy < handMaskH) {
      handMask[cy * W + cx] = 2;
    }
  }
}

function markJoint(cx, cy) {
  var W = handMaskW, H = handMaskH;
  var ix = Math.round(cx), iy = Math.round(cy);
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var nx = ix + dx, ny = iy + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        handMask[ny * W + nx] = 3;
      }
    }
  }
}

function fillFingerSegments(pts) {
  // Each finger: fill between adjacent joints with radius proportional to joint
  var fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
  for (var f = 0; f < fingers.length; f++) {
    var finger = fingers[f];
    for (var j = 0; j < finger.length - 1; j++) {
      var a = pts[finger[j]];
      var b = pts[finger[j+1]];
      var r = 2.0 - j * 0.3;
      if (r < 1) r = 1;
      drawThickLine(a.x, a.y, b.x, b.y, r);
    }
  }
}

function drawThickLine(x0, y0, x1, y1, radius) {
  var W = handMaskW;
  var dx = x1 - x0, dy = y1 - y0;
  var len = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(1, Math.ceil(len));
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    var cx = x0 + dx * t;
    var cy = y0 + dy * t;
    fillCircle(cx, cy, radius);
  }
}

function fillCircle(cx, cy, r) {
  var W = handMaskW, H = handMaskH;
  var r2 = r * r;
  var minX = Math.max(0, Math.floor(cx - r));
  var maxX = Math.min(W - 1, Math.ceil(cx + r));
  var minY = Math.max(0, Math.floor(cy - r));
  var maxY = Math.min(H - 1, Math.ceil(cy + r));
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      var ddx = x - cx, ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= r2) {
        handMask[y * W + x] = 1;
      }
    }
  }
}

function fillPolygon(pts) {
  var W = handMaskW, H = handMaskH;
  // Find bounding box
  var minY = H, maxY = 0;
  for (var i = 0; i < pts.length; i++) {
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));

  // Scanline fill
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
        handMask[y * W + x] = 1;
      }
    }
  }
}

function renderHandpose() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handpose...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      var hue = (t * 60 + i * 15) % 360;
      drawCharHSL(msg[i], mx + i, my, hue, 60, 40);
    }
    // Animated dots
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
    // Still render flowing text without mask
    renderFlowingText(W, H, t, null);
    return;
  }

  // Start detection loop (no-op after first call)
  startDetectionLoop();

  // Sample webcam to get color data
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  var hasVideo = webcamReady && webcamEl.readyState >= 2;
  var imgData = null;

  if (hasVideo) {
    // Mirror the video (selfie mode)
    vidCtx.save();
    vidCtx.translate(W, 0);
    vidCtx.scale(-1, 1);
    vidCtx.drawImage(webcamEl, 0, 0, W, H);
    vidCtx.restore();
    imgData = vidCtx.getImageData(0, 0, W, H).data;
  }

  // Ensure mask exists
  if (!handMask || handMaskW !== W || handMaskH !== H) {
    handMask = new Uint8Array(W * H);
    handMaskW = W;
    handMaskH = H;
  }

  // Render: webcam as dim ASCII background, text flows around hand
  renderFlowingText(W, H, t, imgData);
}

function renderFlowingText(W, H, t, imgData) {
  var speed = 1.5;
  var ci = Math.floor(t * speed * 4) % loremText.length;
  var hasMask = handMask && handMaskW === W && handMaskH === H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var isHand = hasMask && handMask[idx];

      if (isHand) {
        var maskVal = handMask[idx];

        if (maskVal === 3) {
          // Joint node — bright dot
          var jointHue = (t * 60 + x * 5 + y * 3) % 360;
          drawCharHSL('@', x, y, jointHue, 90, 60);
          continue;
        }

        if (maskVal === 2) {
          // Skeleton line — thin connecting line
          var lineHue = (t * 40 + x * 3 + y * 2) % 360;
          drawCharHSL('-', x, y, lineHue, 70, 45);
          continue;
        }

        // Hand fill area (maskVal === 1): check edge
        var isEdge = false;
        if (x > 0 && !handMask[idx - 1]) isEdge = true;
        else if (x < W - 1 && !handMask[idx + 1]) isEdge = true;
        else if (y > 0 && !handMask[idx - W]) isEdge = true;
        else if (y < H - 1 && !handMask[idx + W]) isEdge = true;

        if (isEdge) {
          var edgeHue = (t * 30 + x * 2 + y * 3) % 360;
          drawCharHSL('|', x, y, edgeHue, 80, 55);
        }
        continue;
      }

      // Outside hand: flowing text
      var ch = loremText[ci % loremText.length];
      ci++;

      if (ch === ' ') {
        // Skip spaces but still advance index
        continue;
      }

      // Color based on webcam data if available
      if (imgData) {
        var pi = idx * 4;
        var r = imgData[pi];
        var g = imgData[pi + 1];
        var b = imgData[pi + 2];
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Blend webcam color with flowing hue
        var baseHue = (t * 20 + y * 3 + x * 0.5) % 360;
        var sat = 50 + lum * 30;
        var bright = 15 + lum * 35;

        // Near hand: brighter text
        if (hasMask) {
          var distToHand = distanceToMask(x, y, W, H, 6);
          if (distToHand < 6) {
            var glow = 1 - distToHand / 6;
            bright += glow * 25;
            sat += glow * 20;
          }
        }

        drawCharHSL(ch, x, y, baseHue, Math.min(90, sat), Math.min(60, bright));
      } else {
        // No webcam: pure color flow
        var hue = (t * 25 + y * 2.5 + x * 0.8) % 360;
        var s = 50;
        var l = 25;

        if (hasMask) {
          var dth = distanceToMask(x, y, W, H, 6);
          if (dth < 6) {
            var g2 = 1 - dth / 6;
            l += g2 * 30;
            s += g2 * 20;
          }
        }

        drawCharHSL(ch, x, y, hue, Math.min(90, s), Math.min(65, l));
      }
    }
  }
}

function distanceToMask(x, y, W, H, maxDist) {
  if (!handMask) return maxDist;
  // Quick search for nearest hand pixel
  for (var d = 1; d <= maxDist; d++) {
    for (var dy = -d; dy <= d; dy++) {
      var ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (var dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue; // only check perimeter
        var nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        if (handMask[ny * W + nx]) return d;
      }
    }
  }
  return maxDist;
}

registerMode('handpose', { init: initHandpose, render: renderHandpose });
