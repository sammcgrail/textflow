import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Faceglitch mode — intense RGB channel splitting, glitch explosions,
// scanline corruption, data moshing, and dark ambient background
// Glitch intensity ramps with face movement velocity

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

// Previous frame buffer for data moshing
var prevFrameData = null;
var moshMask = null; // which pixels are frozen
var moshTimer = 0;
var moshActive = false;
var moshDuration = 0;

// Explosion particles
var MAX_PARTICLES = 200;
var particles = [];

// Face center in grid coords
var faceCX = 0;
var faceCY = 0;

// Scanline corruption
var scanlines = [];
var scanlineTimer = 0;

// Background data rain columns
var rainColumns = [];
var MAX_RAIN_COLS = 30;

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
  prevFrameData = null;
  moshMask = null;
  moshTimer = 0;
  moshActive = false;
  particles = [];
  scanlines = [];
  scanlineTimer = 0;
  rainColumns = [];
  faceCX = 0;
  faceCY = 0;

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
  var W = state.COLS, H = state.ROWS;
  if (faces.length === 0) {
    faceVelocity *= 0.9;
    prevFaceCenter = null;
    return;
  }

  var lm = faces[0].landmarks;
  if (!lm || lm.length < 468) return;

  var cx = (1 - lm[1].x);
  var cy = lm[1].y;
  faceCX = cx * W;
  faceCY = cy * H;

  if (prevFaceCenter) {
    var dx = cx - prevFaceCenter.x;
    var dy = cy - prevFaceCenter.y;
    var speed = Math.sqrt(dx * dx + dy * dy);
    faceVelocity = faceVelocity * 0.5 + speed * 0.5;
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

// --- Explosion particles ---
function spawnExplosion(cx, cy, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * 6.283;
    var speed = 1 + Math.random() * 4;
    var ch = String.fromCharCode(33 + Math.floor(Math.random() * 94));
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 1.0,
      age: 0,
      ch: ch,
      hue: Math.random() * 360
    });
    if (particles.length > MAX_PARTICLES) particles.shift();
  }
}

function updateParticles(dt) {
  var alive = [];
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    p.age += dt;
    if (p.age >= p.life) continue;
    p.x += p.vx * dt * 15;
    p.y += p.vy * dt * 15;
    p.vx *= 0.97;
    p.vy *= 0.97;
    alive.push(p);
  }
  particles = alive;
}

function renderParticles(W, H) {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    var fade = 1 - p.age / p.life;
    var bright = 30 + fade * 50;
    drawCharHSL(p.ch, px, py, p.hue, 90, bright);
  }
}

// --- Scanline corruption ---
function updateScanlines(H, intensity) {
  scanlineTimer += 0.016;
  if (scanlineTimer > 0.05 + (1 - intensity) * 0.3) {
    scanlineTimer = 0;
    scanlines = [];
    var numLines = Math.floor(intensity * 12) + 1;
    for (var i = 0; i < numLines; i++) {
      scanlines.push({
        y: Math.floor(Math.random() * H),
        shift: Math.floor((Math.random() - 0.5) * 15 * (1 + intensity * 4)),
        height: 1 + Math.floor(Math.random() * 3),
        invert: Math.random() < 0.3,
        static_noise: Math.random() < 0.4
      });
    }
  }
}

function getScanlineShift(y) {
  for (var i = 0; i < scanlines.length; i++) {
    var sl = scanlines[i];
    if (y >= sl.y && y < sl.y + sl.height) return sl;
  }
  return null;
}

// --- Data moshing ---
function updateMosh(intensity) {
  moshTimer += 0.016;
  if (!moshActive && Math.random() < 0.01 + intensity * 0.04) {
    moshActive = true;
    moshDuration = 0.1 + Math.random() * 0.4;
    moshTimer = 0;
    // Create random freeze mask
    var W = state.COLS, H = state.ROWS;
    if (!moshMask || moshMask.length !== W * H) {
      moshMask = new Uint8Array(W * H);
    }
    moshMask.fill(0);
    // Freeze random rectangular blocks of the face
    var numBlocks = 2 + Math.floor(Math.random() * 5);
    for (var b = 0; b < numBlocks; b++) {
      var bx = Math.floor(Math.random() * W);
      var by = Math.floor(Math.random() * H);
      var bw = 3 + Math.floor(Math.random() * 12);
      var bh = 2 + Math.floor(Math.random() * 8);
      for (var y = by; y < by + bh && y < H; y++) {
        for (var x = bx; x < bx + bw && x < W; x++) {
          moshMask[y * W + x] = 1;
        }
      }
    }
  }
  if (moshActive && moshTimer > moshDuration) {
    moshActive = false;
  }
}

// --- Background rain ---
function updateRain(W, H, t) {
  // Occasionally spawn new rain columns
  if (rainColumns.length < MAX_RAIN_COLS && Math.random() < 0.03) {
    rainColumns.push({
      x: Math.floor(Math.random() * W),
      y: 0,
      speed: 0.5 + Math.random() * 2,
      length: 3 + Math.floor(Math.random() * 10),
      hue: 160 + Math.random() * 60
    });
  }
  // Update
  var alive = [];
  for (var i = 0; i < rainColumns.length; i++) {
    var col = rainColumns[i];
    col.y += col.speed;
    if (col.y - col.length < H) {
      alive.push(col);
    }
  }
  rainColumns = alive;
}

function renderRain(W, H, t) {
  for (var i = 0; i < rainColumns.length; i++) {
    var col = rainColumns[i];
    for (var j = 0; j < col.length; j++) {
      var ry = Math.floor(col.y) - j;
      if (ry < 0 || ry >= H) continue;
      var fade = 1 - j / col.length;
      var ch = String.fromCharCode(33 + ((col.x * 13 + ry * 7 + Math.floor(t * 8)) % 94));
      drawCharHSL(ch, col.x, ry, col.hue, 50, 5 + fade * 15);
    }
  }
}

function renderFaceglitch() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = 0.016;

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

  // Update glitch intensity — ramp up with velocity, decay when still
  var targetGlitch = Math.min(1, faceVelocity * 18);
  glitchIntensity = glitchIntensity * 0.82 + targetGlitch * 0.18;

  // Trigger explosion on high velocity
  if (faceVelocity > 0.02 && Math.random() < faceVelocity * 5) {
    spawnExplosion(faceCX, faceCY, Math.floor(5 + glitchIntensity * 20));
  }

  updateParticles(dt);
  updateScanlines(H, glitchIntensity);
  updateMosh(glitchIntensity);
  updateRain(W, H, t);

  var hasMask = faceMask && faceMaskW === W && faceMaskH === H;

  // RGB channel split offsets — pulsing and velocity-reactive
  var baseShift = 1 + glitchIntensity * 8;
  var pulseShift = Math.sin(t * 5) * 2 * glitchIntensity;
  var rOffX = Math.round(-(baseShift + pulseShift));
  var bOffX = Math.round(baseShift + pulseShift);
  var rOffY = Math.round(Math.sin(t * 3.1) * glitchIntensity * 2);
  var bOffY = Math.round(Math.cos(t * 2.7) * glitchIntensity * 2);

  // Interference bands
  var bandPhase = t * 1.5;
  var bandFreq = 0.06 + glitchIntensity * 0.04;

  // Render background first — dark with rain and interference
  renderRain(W, H, t);

  // Background interference bands
  for (var y = 0; y < H; y++) {
    var bandVal = Math.sin((y + bandPhase * 10) * bandFreq * Math.PI);
    if (bandVal > 0.92) {
      for (var x = 0; x < W; x++) {
        if (Math.random() < 0.15) {
          drawCharHSL('-', x, y, 200, 20, 4 + Math.random() * 6);
        }
      }
    }
  }

  if (!imgData) return;

  // Main rendering loop — face with RGB splitting, background ambient
  for (var y = 0; y < H; y++) {
    var sl = getScanlineShift(y);

    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var inFace = hasMask && faceMask[idx] === 1;

      if (inFace) {
        var srcX = x;
        var scanShift = 0;
        if (sl) {
          scanShift = sl.shift;
          srcX = Math.max(0, Math.min(W - 1, x + scanShift));
        }

        // Data moshing — show previous frame for frozen areas
        if (moshActive && moshMask && moshMask[idx] && prevFrameData) {
          var mpi = idx * 4;
          var mr = prevFrameData[mpi];
          var mg = prevFrameData[mpi + 1];
          var mb = prevFrameData[mpi + 2];
          var mlum = (0.299 * mr + 0.587 * mg + 0.114 * mb) / 255;
          if (mlum > 0.03) {
            var mci = Math.min(RAMP_DENSE.length - 1, (mlum * RAMP_DENSE.length) | 0);
            // Tint frozen areas with a green/purple hue
            var mhue = (t * 20 + x * 3) % 360;
            drawCharHSL(RAMP_DENSE[mci], x, y, mhue, 70, 15 + mlum * 40);
          }
          continue;
        }

        // RED channel — shifted left
        var rxSrc = Math.max(0, Math.min(W - 1, srcX + rOffX));
        var rySrc = Math.max(0, Math.min(H - 1, y + rOffY));
        var rpi = (rySrc * W + rxSrc) * 4;
        var rVal = imgData[rpi];

        // GREEN channel — center
        var gpi = (y * W + srcX) * 4;
        var gVal = imgData[gpi + 1];

        // BLUE channel — shifted right
        var bxSrc = Math.max(0, Math.min(W - 1, srcX + bOffX));
        var bySrc = Math.max(0, Math.min(H - 1, y + bOffY));
        var bpi = (bySrc * W + bxSrc) * 4;
        var bVal = imgData[bpi + 2];

        var lum = (0.299 * rVal + 0.587 * gVal + 0.114 * bVal) / 255;

        // Scanline corruption effects
        var ch;
        var cr = rVal, cg = gVal, cb = bVal;

        if (sl && sl.static_noise && Math.random() < 0.6) {
          // Static noise on scanline
          ch = String.fromCharCode(33 + Math.floor(Math.random() * 94));
          var noiseVal = Math.random() * 255;
          cr = noiseVal;
          cg = noiseVal;
          cb = noiseVal;
        } else if (sl && sl.invert) {
          // Color inversion on scanline
          cr = 255 - rVal;
          cg = 255 - gVal;
          cb = 255 - bVal;
          lum = (0.299 * cr + 0.587 * cg + 0.114 * cb) / 255;
          var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
          ch = RAMP_DENSE[ci];
        } else {
          if (lum < 0.02 && !sl) continue;
          var ci2 = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
          ch = RAMP_DENSE[ci2];
        }

        if (ch === ' ') continue;

        // Glitch intensity boost on colors
        var boost = 1 + glitchIntensity * 1.2;
        cr = Math.min(255, (cr * boost) | 0);
        cg = Math.min(255, (cg * boost) | 0);
        cb = Math.min(255, (cb * boost) | 0);

        var alpha = Math.max(0.4, Math.min(1, lum * 1.5 + glitchIntensity * 0.4));
        drawChar(ch, x, y, cr, cg, cb, alpha);

      } else {
        // Outside face — sparse ambient
        if (Math.random() < 0.005 + glitchIntensity * 0.01) {
          var nch = String.fromCharCode(33 + Math.floor(Math.random() * 94));
          drawCharHSL(nch, x, y, 200 + Math.random() * 40, 30, 3 + Math.random() * 5);
        }
      }
    }
  }

  // Render explosion particles on top
  renderParticles(W, H);

  // Store frame for data moshing
  if (imgData) {
    if (!prevFrameData || prevFrameData.length !== imgData.length) {
      prevFrameData = new Uint8Array(imgData.length);
    }
    prevFrameData.set(imgData);
  }

  // Label
  var label = '[faceglitch]';
  var lx2 = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx2 + li, H - 1, 0, 0, 30);
  }
}

registerMode('faceglitch', { init: initFaceglitch, render: renderFaceglitch });
