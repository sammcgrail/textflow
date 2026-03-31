import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Sunsmile mode — face-tracked weather visualization
// Smile = sunshine, frown = storm

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

// Smile detection
var rawSmileScore = 0;
var smileScore = 0; // smoothed 0-1
var prevSmileAbove = false; // for rainbow trigger
var showRainbow = false;
var rainbowTimer = 0;
var megaSunshine = false;
var megaTimer = 0;

// Weather particles
var raindrops = [];
var MAX_RAIN = 150;
var birds = [];
var MAX_BIRDS = 8;
var flowers = [];
var MAX_FLOWERS = 30;
var goldenParticles = [];
var MAX_GOLDEN = 50;
var lightningFlash = 0;
var lightningBolt = null;

// Landscape
var hills = []; // array of hill heights per column
var treeLeaves = [];
var treeX = 0;
var treeBase = 0;

// Cloud state
var clouds = [];
var MAX_CLOUDS = 6;

// =========================================================
// Webcam & face tracking
// =========================================================
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

function loadFacemeshLib() {
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

function detectFaces() {
  if (!detector || !webcamReady || detecting || webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    faces = result || [];
    if (faces.length > 0 && faces[0].landmarks && faces[0].landmarks.length >= 468) {
      updateSmile(faces[0].landmarks);
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateSmile(lm) {
  // Mouth corners: 61 (left), 291 (right)
  // Top lip: 13, Bottom lip: 14
  // Nose tip: 1
  var leftCorner = lm[61];
  var rightCorner = lm[291];
  var topLip = lm[13];
  var bottomLip = lm[14];
  var noseTip = lm[1];

  // Mouth width vs height ratio
  var mouthWidth = Math.sqrt(
    Math.pow(rightCorner.x - leftCorner.x, 2) +
    Math.pow(rightCorner.y - leftCorner.y, 2)
  );
  var mouthHeight = Math.sqrt(
    Math.pow(bottomLip.x - topLip.x, 2) +
    Math.pow(bottomLip.y - topLip.y, 2)
  );

  var widthHeightRatio = mouthHeight > 0.001 ? mouthWidth / mouthHeight : 5;
  // Higher ratio = wider mouth = more smile
  var ratioScore = Math.max(0, Math.min(1, (widthHeightRatio - 2) / 6));

  // Corner height relative to nose — corners higher = smile
  var avgCornerY = (leftCorner.y + rightCorner.y) / 2;
  var cornerHeight = noseTip.y - avgCornerY; // positive = corners above nose base
  var cornerScore = Math.max(0, Math.min(1, (cornerHeight + 0.02) / 0.06));

  // Combined score
  rawSmileScore = ratioScore * 0.6 + cornerScore * 0.4;

  // Smooth with lerp
  smileScore += (rawSmileScore - smileScore) * 0.12;
  smileScore = Math.max(0, Math.min(1, smileScore));

  // Rainbow trigger — crossing 0.5 going up
  var aboveNow = smileScore > 0.5;
  if (aboveNow && !prevSmileAbove) {
    showRainbow = true;
    rainbowTimer = 3.0;
  }
  prevSmileAbove = aboveNow;

  // Mega sunshine trigger
  if (smileScore > 0.9 && !megaSunshine) {
    megaSunshine = true;
    megaTimer = 2.0;
    // Spawn golden particles
    for (var gi = 0; gi < MAX_GOLDEN; gi++) {
      goldenParticles.push({
        x: state.COLS / 2 + (Math.random() - 0.5) * 10,
        y: state.ROWS / 4,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        char: '*+#@'[Math.floor(Math.random() * 4)]
      });
    }
  }
  if (smileScore < 0.85) megaSunshine = false;
}

// =========================================================
// Initialize landscape
// =========================================================
function initLandscape() {
  var W = state.COLS, H = state.ROWS;
  hills = [];
  var groundLine = Math.floor(H * 0.7);
  for (var x = 0; x < W; x++) {
    var h1 = Math.sin(x * 0.05) * 3;
    var h2 = Math.sin(x * 0.12 + 2) * 2;
    var h3 = Math.sin(x * 0.03 + 5) * 4;
    hills[x] = Math.floor(groundLine + h1 + h2 + h3);
  }

  // Tree position
  treeX = Math.floor(W / 2);
  treeBase = hills[treeX] - 1;

  // Initialize flowers
  flowers = [];
  for (var fi = 0; fi < MAX_FLOWERS; fi++) {
    var fx = Math.floor(Math.random() * W);
    flowers.push({
      x: fx,
      baseY: hills[Math.min(fx, W - 1)],
      height: 0,
      maxHeight: 2 + Math.floor(Math.random() * 3),
      char: '*@o'[Math.floor(Math.random() * 3)],
      hue: Math.random() * 60 + 330, // pinks, reds, yellows
      phase: Math.random() * Math.PI * 2
    });
  }

  // Initialize clouds
  clouds = [];
  for (var ci = 0; ci < MAX_CLOUDS; ci++) {
    clouds.push({
      x: Math.random() * W,
      y: 2 + Math.random() * 6,
      w: 6 + Math.floor(Math.random() * 10),
      speed: 0.3 + Math.random() * 0.5,
      opacity: 0
    });
  }

  // Initialize rain
  raindrops = [];
  for (var ri = 0; ri < MAX_RAIN; ri++) {
    raindrops.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.5 + Math.random() * 1,
      char: '|',
      active: false
    });
  }

  // Initialize birds
  birds = [];
  for (var bi = 0; bi < MAX_BIRDS; bi++) {
    birds.push({
      x: Math.random() * W,
      y: 3 + Math.random() * 8,
      speed: 0.5 + Math.random() * 1,
      phase: Math.random() * Math.PI * 2,
      active: false
    });
  }

  goldenParticles = [];
  treeLeaves = [];
}

// =========================================================
// Draw functions
// =========================================================
function drawSky() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var skyLine = Math.floor(H * 0.7);

  // Sky gradient based on smile
  for (var y = 0; y < skyLine; y++) {
    var yRatio = y / skyLine;
    for (var x = 0; x < W; x++) {
      var wave = Math.sin(x * 0.1 + t * 0.2 + y * 0.05) * 0.1;

      // Stormy: dark blue-gray. Sunny: bright cyan-blue
      var hue = 220 + smileScore * (-10) + wave * 10;
      var sat = 30 + smileScore * 40;
      var lit = 3 + smileScore * 8 + (1 - yRatio) * smileScore * 5;

      if (Math.random() > 0.7) {
        var ch = '.';
        drawCharHSL(ch, x, y, hue, sat, lit);
      }
    }
  }
}

function drawSun() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (smileScore < 0.5) return;

  var sunVis = (smileScore - 0.5) * 2; // 0-1 when smile 0.5-1.0
  var sunX = Math.floor(W * 0.75);
  var sunY = Math.floor(5 + (1 - sunVis) * 5);
  var sunR = 3 + Math.floor(sunVis * 2);

  // Sun body
  for (var dy = -sunR; dy <= sunR; dy++) {
    for (var dx = -sunR; dx <= sunR; dx++) {
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > sunR) continue;
      var gx = sunX + dx;
      var gy = sunY + dy;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
      var bright = (1 - dist / sunR) * sunVis;
      var ch = dist < sunR * 0.5 ? '@' : dist < sunR * 0.8 ? '#' : '*';
      drawCharHSL(ch, gx, gy, 45, 90, 40 + bright * 35);
    }
  }

  // Rays
  var numRays = 8;
  for (var ri = 0; ri < numRays; ri++) {
    var angle = (ri / numRays) * Math.PI * 2 + t * 0.5;
    var rayLen = sunR + 2 + Math.sin(t * 3 + ri) * 2;
    for (var d = sunR + 1; d < rayLen + sunR; d++) {
      var rx = Math.floor(sunX + Math.cos(angle) * d);
      var ry = Math.floor(sunY + Math.sin(angle) * d);
      if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
        var rayChar = d % 2 === 0 ? '-' : '~';
        drawCharHSL(rayChar, rx, ry, 50, 80, 30 + sunVis * 25);
      }
    }
  }
}

function drawClouds() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  for (var ci = 0; ci < clouds.length; ci++) {
    var cloud = clouds[ci];

    // Target opacity based on smile (more clouds when frowning)
    var targetOp = smileScore < 0.4 ? 0.8 + (0.4 - smileScore) * 0.5 : Math.max(0, 0.4 - smileScore * 0.5);
    cloud.opacity += (targetOp - cloud.opacity) * 0.02;

    if (cloud.opacity < 0.05) continue;

    // Move clouds
    cloud.x += cloud.speed * 0.1 * (1 - smileScore * 0.5);
    if (cloud.x > W + cloud.w) cloud.x = -cloud.w;

    // Draw cloud
    var cw = cloud.w;
    var ch2 = Math.max(2, Math.floor(cw * 0.4));
    for (var dy = 0; dy < ch2; dy++) {
      var rowW = cw - Math.abs(dy - ch2 / 2) * 2;
      var rowStart = Math.floor(cloud.x - rowW / 2);
      for (var dx = 0; dx < rowW; dx++) {
        var gx = rowStart + dx;
        if (gx < 0 || gx >= W) continue;
        var gy = Math.floor(cloud.y + dy);
        if (gy < 0 || gy >= H) continue;
        // Dark when stormy, lighter when clearing
        var cloudLit = 8 + smileScore * 15;
        var cloudChar = '#%@*'[Math.floor(Math.random() * 4)];
        drawCharHSL(cloudChar, gx, gy, 220, 10 + (1 - smileScore) * 30, cloudLit * cloud.opacity);
      }
    }
  }
}

function drawRain() {
  var W = state.COLS, H = state.ROWS;

  // Active rain count based on smile
  var activeCount = smileScore < 0.4 ? Math.floor((0.4 - smileScore) / 0.4 * MAX_RAIN) : 0;

  for (var ri = 0; ri < raindrops.length; ri++) {
    var drop = raindrops[ri];
    drop.active = ri < activeCount;

    if (!drop.active) continue;

    drop.y += drop.speed;
    drop.x += (Math.random() - 0.5) * 0.3;

    var groundY = drop.x >= 0 && drop.x < W ? hills[Math.floor(drop.x)] : H;
    if (drop.y >= groundY) {
      drop.y = -1;
      drop.x = Math.random() * W;
    }

    var gx = Math.floor(drop.x);
    var gy = Math.floor(drop.y);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      var rainHue = 210 + Math.random() * 20;
      drawCharHSL(drop.char, gx, gy, rainHue, 50, 25 + Math.random() * 15);
    }
  }
}

function drawLightning() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Lightning when smile < 0.2
  if (smileScore < 0.2 && Math.random() < 0.01) {
    lightningFlash = 0.8;
    // Generate bolt
    lightningBolt = [];
    var bx = Math.floor(Math.random() * W);
    var by = 1;
    while (by < Math.floor(H * 0.6)) {
      lightningBolt.push({ x: bx, y: by });
      by += 1 + Math.floor(Math.random() * 2);
      bx += Math.floor(Math.random() * 5) - 2;
      bx = Math.max(0, Math.min(W - 1, bx));
      // Branch
      if (Math.random() < 0.2) {
        var branchX = bx;
        var branchY = by;
        for (var bi = 0; bi < 4; bi++) {
          branchX += Math.floor(Math.random() * 3) - 1;
          branchY += 1;
          if (branchX >= 0 && branchX < W && branchY < H) {
            lightningBolt.push({ x: branchX, y: branchY });
          }
        }
      }
    }
  }

  if (lightningFlash > 0) {
    // Flash overlay
    if (lightningFlash > 0.5) {
      for (var y = 0; y < Math.floor(H * 0.3); y++) {
        for (var x = 0; x < W; x++) {
          if (Math.random() < lightningFlash * 0.3) {
            drawCharHSL('.', x, y, 260, 20, lightningFlash * 15);
          }
        }
      }
    }
    // Draw bolt
    if (lightningBolt) {
      for (var li = 0; li < lightningBolt.length; li++) {
        var lp = lightningBolt[li];
        drawCharHSL('#', lp.x, lp.y, 270, 80, 50 + lightningFlash * 30);
      }
    }
    lightningFlash -= 0.05;
  }
}

function drawLandscape() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Ground
  for (var x = 0; x < W; x++) {
    var groundY = hills[x];
    for (var y = groundY; y < H; y++) {
      var depth = y - groundY;
      var grassChar = depth === 0 ? (smileScore > 0.5 ? 'w' : '_') : '.';
      var hue = 100 + smileScore * 30; // brown when sad, green when happy
      var sat = 20 + smileScore * 50;
      var lit = 8 + smileScore * 8 - depth * 2;
      if (lit > 2) {
        drawCharHSL(grassChar, x, y, hue, sat, Math.max(3, lit));
      }
    }
  }
}

function drawTree() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Trunk
  var trunkH = 6;
  for (var ty = 0; ty < trunkH; ty++) {
    drawCharHSL('|', treeX, treeBase - ty, 25, 40, 18);
    if (ty > 2) {
      drawCharHSL('|', treeX - 1, treeBase - ty, 25, 40, 14);
      drawCharHSL('|', treeX + 1, treeBase - ty, 25, 40, 14);
    }
  }

  // Branches and leaves
  var canopyTop = treeBase - trunkH;
  var canopyR = 5 + Math.floor(smileScore * 3);

  for (var dy = -canopyR; dy <= 1; dy++) {
    var rowW = canopyR - Math.abs(dy) + Math.floor(smileScore * 2);
    for (var dx = -rowW; dx <= rowW; dx++) {
      var gx = treeX + dx;
      var gy = canopyTop + dy;
      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

      if (smileScore > 0.4) {
        // Leafy
        var leafChar = '@#%*'[Math.floor(Math.abs(Math.sin(dx * 3 + dy * 5 + t * 0.5)) * 4)];
        var leafHue = 100 + Math.sin(dx * 0.5 + dy * 0.3) * 30;
        var leafLit = 15 + smileScore * 20 + Math.sin(t * 2 + dx + dy) * 5;
        drawCharHSL(leafChar, gx, gy, leafHue, 50 + smileScore * 30, leafLit);
      } else {
        // Bare branches
        if (Math.abs(dx) < 2 || Math.random() < 0.3) {
          var branchChar = dx === 0 ? '|' : (dx > 0 ? '/' : '\\');
          drawCharHSL(branchChar, gx, gy, 25, 30, 12);
        }
      }
    }
  }
}

function drawFlowers() {
  var t = state.time;
  var W = state.COLS, H = state.ROWS;

  for (var fi = 0; fi < flowers.length; fi++) {
    var f = flowers[fi];

    // Grow when smiling, shrink when not
    var targetH = smileScore > 0.5 ? f.maxHeight : 0;
    f.height += (targetH - f.height) * 0.05;

    if (f.height < 0.5) continue;

    var h = Math.floor(f.height);
    // Stem
    for (var sy = 0; sy < h; sy++) {
      var stemY = f.baseY - 1 - sy;
      if (stemY >= 0 && stemY < H && f.x >= 0 && f.x < W) {
        drawCharHSL('|', f.x, stemY, 120, 50, 20);
      }
    }
    // Flower head
    var headY = f.baseY - 1 - h;
    if (headY >= 0 && headY < H && f.x >= 0 && f.x < W) {
      var sway = Math.sin(t * 2 + f.phase) * 0.5;
      var hx = f.x + Math.round(sway);
      if (hx >= 0 && hx < W) {
        drawCharHSL(f.char, hx, headY, f.hue % 360, 70, 40 + Math.sin(t * 3 + fi) * 10);
      }
    }
  }
}

function drawBirds() {
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  var activeCount = smileScore > 0.6 ? Math.floor((smileScore - 0.6) / 0.4 * MAX_BIRDS) : 0;

  for (var bi = 0; bi < birds.length; bi++) {
    var bird = birds[bi];
    bird.active = bi < activeCount;
    if (!bird.active) continue;

    bird.x += bird.speed * 0.3;
    bird.y += Math.sin(t * 3 + bird.phase) * 0.1;

    if (bird.x > W + 5) {
      bird.x = -5;
      bird.y = 3 + Math.random() * 8;
    }

    var gx = Math.floor(bird.x);
    var gy = Math.floor(bird.y);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      var wingChar = Math.sin(t * 8 + bird.phase) > 0 ? 'v' : '^';
      drawCharHSL(wingChar, gx, gy, 30, 40, 35);
    }
  }
}

function drawRainbow() {
  var W = state.COLS, H = state.ROWS;

  if (!showRainbow || rainbowTimer <= 0) {
    showRainbow = false;
    return;
  }

  rainbowTimer -= 0.016;
  var alpha = Math.min(1, rainbowTimer);

  var cx = Math.floor(W / 2);
  var cy = Math.floor(H * 0.65);
  var rainbowColors = [0, 30, 55, 120, 210, 260, 300]; // ROYGBIV hues

  for (var ci = 0; ci < rainbowColors.length; ci++) {
    var r = 15 + ci * 2;
    for (var angle = 0; angle < Math.PI; angle += 0.05) {
      var rx = Math.floor(cx + Math.cos(angle) * r);
      var ry = Math.floor(cy - Math.sin(angle) * r * 0.5);
      if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
        drawCharHSL('~', rx, ry, rainbowColors[ci], 80, 35 * alpha);
      }
    }
  }
}

function drawMegaSunshine() {
  var W = state.COLS, H = state.ROWS;

  if (megaTimer <= 0) {
    goldenParticles = [];
    return;
  }
  megaTimer -= 0.016;

  for (var gi = goldenParticles.length - 1; gi >= 0; gi--) {
    var gp = goldenParticles[gi];
    gp.x += gp.vx * 0.3;
    gp.y += gp.vy * 0.3;
    gp.vy += 0.02; // gravity
    gp.life -= 0.008;

    if (gp.life <= 0) {
      goldenParticles.splice(gi, 1);
      continue;
    }

    var gx = Math.floor(gp.x);
    var gy = Math.floor(gp.y);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      drawCharHSL(gp.char, gx, gy, 45, 90, 40 + gp.life * 30);
    }
  }

  // MEGA SUNSHINE text
  if (megaTimer > 1) {
    var msg = 'MEGA SUNSHINE!';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 4);
    for (var mi = 0; mi < msg.length; mi++) {
      drawCharHSL(msg[mi], mx + mi, my, 45, 90, 55 + Math.sin(state.time * 8 + mi) * 15);
    }
  }
}

function drawFaceIndicator() {
  var W = state.COLS, H = state.ROWS;

  // Small emoji-like indicator in top-left corner
  var ix = 1, iy = 1;

  // Face outline
  drawCharHSL('(', ix, iy, 45, 40, 30);
  drawCharHSL(')', ix + 4, iy, 45, 40, 30);

  // Eyes
  drawCharHSL('o', ix + 1, iy, 200, 50, 35);
  drawCharHSL('o', ix + 3, iy, 200, 50, 35);

  // Mouth based on smile
  var mouthChar;
  if (smileScore > 0.6) mouthChar = 'D';
  else if (smileScore > 0.3) mouthChar = ')';
  else mouthChar = '(';

  drawCharHSL(mouthChar, ix + 2, iy + 1, smileScore > 0.5 ? 120 : 0, 60, 35);

  // Score bar
  var barLen = 10;
  var filled = Math.floor(smileScore * barLen);
  for (var bi = 0; bi < barLen; bi++) {
    var barChar = bi < filled ? '#' : '-';
    var barHue = bi < filled ? 120 * (bi / barLen) : 0;
    drawCharHSL(barChar, ix + 6 + bi, iy, barHue + 30, 60, bi < filled ? 35 : 10);
  }
}

// =========================================================
// Init & main render
// =========================================================
function initSunsmile() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  smileScore = 0.5;
  rawSmileScore = 0.5;
  prevSmileAbove = false;
  showRainbow = false;
  megaSunshine = false;
  megaTimer = 0;
  lightningFlash = 0;
  lightningBolt = null;
  goldenParticles = [];

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

  // Defer landscape init until we have COLS/ROWS
  hills = [];
}

function renderSunsmile() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading sunsmile...';
    var mx = Math.floor((W - msg.length) / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, Math.floor(H / 2), (t * 60 + i * 15) % 360, 60, 40);
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

  // Init landscape on first render with valid dimensions
  if (hills.length === 0 || hills.length !== W) {
    initLandscape();
  }

  frameCount++;
  if (frameCount % detectInterval === 0 && detector) detectFaces();

  // Render layers back to front
  drawSky();
  drawSun();
  drawClouds();
  drawRainbow();
  drawLightning();
  drawRain();
  drawLandscape();
  drawTree();
  drawFlowers();
  drawBirds();
  drawMegaSunshine();
  drawFaceIndicator();

  // Label
  var label = '[sunsmile]';
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], W - label.length - 1 + li, H - 1, 0, 0, 20);
  }
}

registerMode('sunsmile', { init: initSunsmile, render: renderSunsmile });
