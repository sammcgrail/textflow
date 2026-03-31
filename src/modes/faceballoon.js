import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Faceballoon — hot air balloon with face smushed on it, floating through sunsets

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.js';

var facemeshLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var faces = [];
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Shared state for R3F overlay
export var balloonState = {
  webcamVideo: null,
  faceBounds: null,
  faceVisible: false,
  faceX: 0.5,
  faceY: 0.5,
  time: 0
};

// Clouds data
var clouds = [];
var MAX_CLOUDS = 12;

// Birds data
var birds = [];
var MAX_BIRDS = 8;

// Wind lines
var windLines = [];
var MAX_WIND = 6;

// Scroll offset for parallax
var scrollOffset = 0;

function initClouds() {
  clouds = [];
  for (var i = 0; i < MAX_CLOUDS; i++) {
    clouds.push({
      x: Math.random(),
      y: 0.05 + Math.random() * 0.45,
      width: 4 + Math.floor(Math.random() * 10),
      speed: 0.0002 + Math.random() * 0.0004,
      chars: Math.random() > 0.5 ? '~~==~~' : '=~~=~='
    });
  }
}

function initBirds() {
  birds = [];
  for (var i = 0; i < MAX_BIRDS; i++) {
    birds.push({
      x: Math.random(),
      y: 0.1 + Math.random() * 0.35,
      speed: 0.001 + Math.random() * 0.002,
      flap: Math.random() * Math.PI * 2,
      dir: Math.random() > 0.5 ? 1 : -1
    });
  }
}

function initWindLines() {
  windLines = [];
  for (var i = 0; i < MAX_WIND; i++) {
    windLines.push({
      x: Math.random(),
      y: 0.15 + Math.random() * 0.5,
      len: 2 + Math.floor(Math.random() * 4),
      speed: 0.001 + Math.random() * 0.002,
      life: 60 + Math.floor(Math.random() * 120),
      maxLife: 180
    });
  }
}

function initFaceballoon() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  balloonState.faceVisible = false;
  balloonState.faceBounds = null;
  balloonState.faceX = 0.5;
  balloonState.faceY = 0.5;
  balloonState.time = 0;
  scrollOffset = 0;

  initClouds();
  initBirds();
  initWindLines();

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
      balloonState.webcamVideo = webcamEl;
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
  facemeshLib({ maxFaces: 1 }).then(function(fm) {
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
    detecting = false;
  }).catch(function() {
    detecting = false;
  });
}

function updateFaceState() {
  if (faces.length === 0) {
    balloonState.faceVisible = false;
    return;
  }

  var face = faces[0];
  var lm = face.landmarks;
  if (!lm || lm.length < 468) {
    balloonState.faceVisible = false;
    return;
  }

  var minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (var i = 0; i < lm.length; i++) {
    var mx = 1 - lm[i].x;
    var my = lm[i].y;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }

  balloonState.faceVisible = true;
  balloonState.faceBounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  balloonState.faceX = (minX + maxX) / 2;
  balloonState.faceY = (minY + maxY) / 2;
}

function renderFaceballoon() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  balloonState.time = t;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'inflating balloon...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      var hue = (30 + i * 8) % 360;
      drawCharHSL(msg[i], mx + i, my, hue, 70, 50);
    }
    var dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    for (var d = 0; d < dots.length; d++) {
      drawCharHSL('.', mx + msg.length + d, my, 30, 60, 40);
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
    return;
  }

  // Detect faces
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }
  updateFaceState();

  // Scroll offset for parallax movement
  scrollOffset += 0.0005;

  // === SUNSET SKY ===
  // Sky occupies top ~65% of screen
  var skyEnd = Math.floor(H * 0.65);
  var sunX = Math.floor(W * 0.82);
  var sunY = Math.floor(H * 0.22);
  var sunRadius = 4;

  for (var y = 0; y < skyEnd; y++) {
    var yRatio = y / skyEnd;
    // Sunset gradient: deep purple at top -> orange/pink in middle -> warm gold near horizon
    var skyHue, skySat, skyLit;
    if (yRatio < 0.25) {
      // Deep purple/dark blue at top
      skyHue = 270 - yRatio * 80;
      skySat = 50 + yRatio * 30;
      skyLit = 8 + yRatio * 12;
    } else if (yRatio < 0.55) {
      // Pink/magenta transition
      var pRatio = (yRatio - 0.25) / 0.3;
      skyHue = 330 - pRatio * 20;
      skySat = 60 + pRatio * 20;
      skyLit = 15 + pRatio * 20;
    } else if (yRatio < 0.8) {
      // Orange/warm zone
      var oRatio = (yRatio - 0.55) / 0.25;
      skyHue = 30 - oRatio * 10;
      skySat = 70 + oRatio * 15;
      skyLit = 30 + oRatio * 15;
    } else {
      // Golden horizon
      var gRatio = (yRatio - 0.8) / 0.2;
      skyHue = 40 - gRatio * 10;
      skySat = 80;
      skyLit = 40 + gRatio * 10;
    }

    for (var x = 0; x < W; x++) {
      // Sun glow effect
      var dxs = x - sunX;
      var dys = (y - sunY) * 1.8;
      var distSun = Math.sqrt(dxs * dxs + dys * dys);

      if (distSun < sunRadius) {
        // Sun body
        var sunLit = 70 + (1 - distSun / sunRadius) * 25;
        drawCharHSL('O', x, y, 45, 90, sunLit);
      } else if (distSun < sunRadius + 6) {
        // Sun rays
        var rayIntensity = 1 - (distSun - sunRadius) / 6;
        var rayChar = rayIntensity > 0.5 ? '*' : '.';
        var wave = Math.sin(t * 0.5 + distSun * 0.4) * 0.3;
        drawCharHSL(rayChar, x, y, 40, 70, skyLit + rayIntensity * 25 + wave * 5);
      } else {
        // Sky fill — subtle shimmer
        var shimmer = Math.sin(t * 0.15 + x * 0.07 + y * 0.11) * 3;
        var skyChars = ' .  . ';
        var sci = Math.abs(Math.floor(x * 0.3 + y * 0.7 + t * 0.1)) % skyChars.length;
        var ch = skyChars[sci];
        if (ch !== ' ') {
          drawCharHSL(ch, x, y, skyHue, skySat, skyLit + shimmer - 5);
        }
      }
    }
  }

  // === CLOUDS ===
  for (var ci = 0; ci < clouds.length; ci++) {
    var cloud = clouds[ci];
    cloud.x += cloud.speed;
    if (cloud.x > 1.2) cloud.x = -0.15;

    var cx = Math.floor(cloud.x * W);
    var cy = Math.floor(cloud.y * H);
    var cStr = cloud.chars;

    for (var cci = 0; cci < cloud.width && cci < cStr.length; cci++) {
      var ccx = cx + cci;
      if (ccx >= 0 && ccx < W && cy >= 0 && cy < skyEnd) {
        var cChar = cStr[cci % cStr.length];
        var cLit = 55 + Math.sin(t * 0.3 + cci * 0.5) * 10;
        drawCharHSL(cChar, ccx, cy, 30, 20, cLit);
      }
    }
    // Cloud second row for thickness
    for (var cr2 = 1; cr2 < cloud.width - 1 && cr2 < cStr.length - 1; cr2++) {
      var crx = cx + cr2;
      if (crx >= 0 && crx < W && cy + 1 >= 0 && cy + 1 < skyEnd) {
        drawCharHSL('~', crx, cy + 1, 30, 15, 50);
      }
    }
  }

  // === BIRDS ===
  for (var bi = 0; bi < birds.length; bi++) {
    var bird = birds[bi];
    bird.x += bird.speed * bird.dir;
    bird.flap += 0.08;
    if (bird.x > 1.1) { bird.x = -0.05; bird.y = 0.1 + Math.random() * 0.3; }
    if (bird.x < -0.1) { bird.x = 1.05; bird.y = 0.1 + Math.random() * 0.3; }

    var bx = Math.floor(bird.x * W);
    var by = Math.floor(bird.y * H);
    if (bx >= 0 && bx < W && by >= 0 && by < skyEnd) {
      var birdChar = Math.sin(bird.flap) > 0 ? 'v' : '^';
      drawCharHSL(birdChar, bx, by, 0, 0, 25);
      // Wing tips
      if (bx - 1 >= 0) drawCharHSL(birdChar === 'v' ? '\\' : '/', bx - 1, by, 0, 0, 20);
      if (bx + 1 < W) drawCharHSL(birdChar === 'v' ? '/' : '\\', bx + 1, by, 0, 0, 20);
    }
  }

  // === WIND LINES ===
  for (var wi = 0; wi < windLines.length; wi++) {
    var wl = windLines[wi];
    wl.x += wl.speed;
    wl.life--;
    if (wl.life <= 0 || wl.x > 1.1) {
      windLines[wi] = {
        x: -0.05,
        y: 0.15 + Math.random() * 0.5,
        len: 2 + Math.floor(Math.random() * 4),
        speed: 0.001 + Math.random() * 0.002,
        life: 60 + Math.floor(Math.random() * 120),
        maxLife: 180
      };
      continue;
    }
    var wx = Math.floor(wl.x * W);
    var wy = Math.floor(wl.y * H);
    var wAlpha = Math.min(1, wl.life / 30);
    for (var wli = 0; wli < wl.len; wli++) {
      var wxx = wx + wli;
      if (wxx >= 0 && wxx < W && wy >= 0 && wy < skyEnd) {
        drawCharHSL('-', wxx, wy, 30, 20, 20 + wAlpha * 15);
      }
    }
  }

  // === ROLLING HILLS / MOUNTAINS ===
  // Layer 1: far mountains (darker)
  for (var hx = 0; hx < W; hx++) {
    var hillH1 = Math.sin((hx + scrollOffset * 100) * 0.04) * 4 +
                 Math.sin((hx + scrollOffset * 80) * 0.08) * 2 +
                 Math.sin((hx + scrollOffset * 60) * 0.02) * 3;
    var hillTop1 = skyEnd - 2 + Math.floor(hillH1);

    for (var hy = hillTop1; hy < H; hy++) {
      if (hy < 0 || hy >= H || hx < 0 || hx >= W) continue;
      var hillDepth = (hy - hillTop1) / (H - hillTop1);
      var hillHue = 260 - hillDepth * 30;
      var hillLit = 8 + hillDepth * 3;
      var hillChar = hy === hillTop1 ? '^' : (hillDepth < 0.3 ? '.' : ' ');
      if (hillChar !== ' ') {
        drawCharHSL(hillChar, hx, hy, hillHue, 40, hillLit);
      }
    }
  }

  // Layer 2: near hills (slightly brighter silhouette)
  for (var hx2 = 0; hx2 < W; hx2++) {
    var hillH2 = Math.sin((hx2 + scrollOffset * 200) * 0.05 + 1.5) * 3 +
                 Math.sin((hx2 + scrollOffset * 150) * 0.1 + 0.8) * 2;
    var hillTop2 = skyEnd + 2 + Math.floor(hillH2);

    for (var hy2 = hillTop2; hy2 < H; hy2++) {
      if (hy2 < 0 || hy2 >= H || hx2 < 0 || hx2 >= W) continue;
      var hd2 = (hy2 - hillTop2) / (H - hillTop2);
      var hHue2 = 130 - hd2 * 50;
      var hLit2 = 5 + hd2 * 4;
      var hChar2 = hy2 === hillTop2 ? '~' : '.';
      drawCharHSL(hChar2, hx2, hy2, hHue2, 30, hLit2);
    }
  }

  // Ground fill at very bottom
  for (var gy = Math.floor(H * 0.85); gy < H; gy++) {
    for (var gx = 0; gx < W; gx++) {
      var gd = (gy - H * 0.85) / (H * 0.15);
      var grassChars = '.,;:';
      var gci = Math.abs(Math.floor(gx * 0.4 + gy * 0.6 + t * 0.05)) % grassChars.length;
      drawCharHSL(grassChars[gci], gx, gy, 100 + gd * 20, 25, 4 + gd * 3);
    }
  }
}

registerMode('faceballoon', { init: initFaceballoon, render: renderFaceballoon });
