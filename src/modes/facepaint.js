import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Facepaint mode — paint/graffiti trails on face features
// Eyes, nose, mouth leave colored persistent trails that slowly fade
// Face outline drawn with bright neon characters, dark background

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

// Paint trail canvas — stores hue, saturation, lightness, alpha per cell
var paintGrid = null;    // Float32Array: [h, s, l, a] per cell = 4 floats per cell
var paintW = 0;
var paintH = 0;

// Face outline buffer
var outlineMask = null;
var outlineW = 0;
var outlineH = 0;

// Feature landmark indices
var LEFT_EYE_CENTER = [468];     // Left iris center
var RIGHT_EYE_CENTER = [473];    // Right iris center
var NOSE_TIP = [1];              // Nose tip
var UPPER_LIP_CENTER = [13];     // Upper lip center
var LOWER_LIP_CENTER = [14];     // Lower lip center
var LEFT_EYEBROW = [105, 66, 107]; // Left eyebrow arc
var RIGHT_EYEBROW = [334, 296, 336]; // Right eyebrow arc

var FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109, 10];

// Feature colors (hue values)
var EYE_HUE = 280;       // Purple/violet
var NOSE_HUE = 30;       // Orange
var MOUTH_HUE = 340;     // Pink/magenta
var EYEBROW_HUE = 160;   // Teal

// Trail persistence
var FADE_RATE = 0.985;    // Per frame multiplier (slow fade)
var PAINT_RADIUS = 1.8;   // Brush size
var PAINT_STRENGTH = 90;  // Initial lightness

function initFacepaint() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  paintGrid = null;
  outlineMask = null;

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
    detecting = false;
  }).catch(function() { detecting = false; });
}

function ensurePaintGrid(W, H) {
  if (!paintGrid || paintW !== W || paintH !== H) {
    paintGrid = new Float32Array(W * H * 4); // h, s, l, a per pixel
    paintW = W;
    paintH = H;
  }
}

function ensureOutlineMask(W, H) {
  if (!outlineMask || outlineW !== W || outlineH !== H) {
    outlineMask = new Uint8Array(W * H);
    outlineW = W;
    outlineH = H;
  }
}

function paintDot(gx, gy, hue, sat, light, W, H) {
  var r = PAINT_RADIUS;
  var minX = Math.max(0, Math.floor(gx - r));
  var maxX = Math.min(W - 1, Math.ceil(gx + r));
  var minY = Math.max(0, Math.floor(gy - r));
  var maxY = Math.min(H - 1, Math.ceil(gy + r));
  var r2 = r * r;

  for (var py = minY; py <= maxY; py++) {
    for (var px = minX; px <= maxX; px++) {
      var ddx = px - gx, ddy = py - gy;
      var dist2 = ddx * ddx + ddy * ddy;
      if (dist2 > r2) continue;

      var falloff = 1 - Math.sqrt(dist2) / r;
      var idx = (py * W + px) * 4;
      var existingAlpha = paintGrid[idx + 3];

      // Blend: new paint on top
      if (falloff * light > existingAlpha * paintGrid[idx + 2] * 0.01) {
        paintGrid[idx] = hue;
        paintGrid[idx + 1] = sat;
        paintGrid[idx + 2] = light * falloff;
        paintGrid[idx + 3] = Math.min(1, existingAlpha + falloff * 0.5);
      }
    }
  }
}

function paintFeature(landmarks, indices, hue, W, H) {
  for (var i = 0; i < indices.length; i++) {
    var li = indices[i];
    if (li >= landmarks.length) continue;
    var lm = landmarks[li];
    var gx = (1 - lm.x) * W;
    var gy = lm.y * H;
    paintDot(gx, gy, hue, 85, PAINT_STRENGTH, W, H);
  }
}

function updateOutline(W, H) {
  outlineMask.fill(0);

  for (var fi = 0; fi < faces.length; fi++) {
    var lm = faces[fi].landmarks;
    if (!lm || lm.length < 468) continue;

    // Draw face oval as outline only
    for (var i = 0; i < FACE_OVAL.length - 1; i++) {
      var a = FACE_OVAL[i];
      var b = FACE_OVAL[i + 1];
      if (a >= lm.length || b >= lm.length) continue;

      var ax = (1 - lm[a].x) * W, ay = lm[a].y * H;
      var bx = (1 - lm[b].x) * W, by = lm[b].y * H;

      // Bresenham-ish line
      var steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      steps = Math.max(1, Math.ceil(steps));
      for (var s = 0; s <= steps; s++) {
        var frac = s / steps;
        var px = Math.round(ax + (bx - ax) * frac);
        var py = Math.round(ay + (by - ay) * frac);
        if (px >= 0 && px < W && py >= 0 && py < H) {
          outlineMask[py * W + px] = 1;
        }
      }
    }
  }
}

function renderFacepaint() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facepaint...';
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

  ensurePaintGrid(W, H);
  ensureOutlineMask(W, H);

  // Fade existing paint trails
  for (var fi = 0; fi < W * H; fi++) {
    var ai = fi * 4 + 3;
    paintGrid[ai] *= FADE_RATE;
    paintGrid[fi * 4 + 2] *= FADE_RATE; // Fade lightness too
    if (paintGrid[ai] < 0.01) {
      paintGrid[ai] = 0;
      paintGrid[fi * 4 + 2] = 0;
    }
  }

  // Paint new dots from current face landmarks
  for (var faceIdx = 0; faceIdx < faces.length; faceIdx++) {
    var lm = faces[faceIdx].landmarks;
    if (!lm || lm.length < 468) continue;

    // Eyes — purple trails
    paintFeature(lm, LEFT_EYE_CENTER, EYE_HUE + Math.sin(t * 2) * 20, W, H);
    paintFeature(lm, RIGHT_EYE_CENTER, EYE_HUE - Math.sin(t * 2) * 20, W, H);

    // Nose — orange trail
    paintFeature(lm, NOSE_TIP, NOSE_HUE + Math.sin(t * 1.5) * 15, W, H);

    // Mouth — pink trails
    paintFeature(lm, UPPER_LIP_CENTER, MOUTH_HUE, W, H);
    paintFeature(lm, LOWER_LIP_CENTER, MOUTH_HUE + 20, W, H);

    // Eyebrows — teal
    paintFeature(lm, LEFT_EYEBROW, EYEBROW_HUE, W, H);
    paintFeature(lm, RIGHT_EYEBROW, EYEBROW_HUE + 15, W, H);
  }

  // Update face outline
  if (faces.length > 0) {
    updateOutline(W, H);
  }

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;

      // Face outline — bright neon
      if (outlineMask[idx] === 1) {
        var outHue = (t * 30 + x * 4 + y * 3) % 360;
        drawCharHSL('|', x, y, outHue, 90, 60);
        continue;
      }

      // Paint trail
      var pi = idx * 4;
      var pH = paintGrid[pi];
      var pS = paintGrid[pi + 1];
      var pL = paintGrid[pi + 2];
      var pA = paintGrid[pi + 3];

      if (pA > 0.02 && pL > 1) {
        // Choose character based on paint intensity
        var intensity = pL / PAINT_STRENGTH;
        var ci = Math.min(RAMP_DENSE.length - 1, (intensity * RAMP_DENSE.length) | 0);
        var ch = RAMP_DENSE[ci];
        if (ch === ' ') ch = '.';

        // Add time-based hue shimmer
        var shimmer = Math.sin(t * 3 + x * 0.2 + y * 0.15) * 10;
        drawCharHSL(ch, x, y, (pH + shimmer + 360) % 360, Math.min(95, pS), Math.min(70, pL));
        continue;
      }

      // Dark background — very subtle ambient
      var bgChance = Math.sin(t * 0.3 + x * 0.12 + y * 0.09);
      if (bgChance > 0.85) {
        var bgCh = '.';
        drawCharHSL(bgCh, x, y, (t * 10 + x + y) % 360, 20, 4);
      }
    }
  }

  // Label
  var label = '[facepaint]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('facepaint', { init: initFacepaint, render: renderFacepaint });
