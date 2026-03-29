import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Hand Fire — fire/flames emit from fingertips
// Particles spawn at fingertips and rise with fire colors
// Fist = fireball intensification. Palm glows warm.

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-handpose@0.3.0/dist/index.js';

var handposeLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var detectInterval = 3;
var frameCount = 0;
var detecting = false;

var hands = [];

// Fire particles
var MAX_PARTICLES = 600;
var particles = [];

// Smoothed hand data
var smoothHands = []; // array of { landmarks: [{x,y}...], fist: 0-1 }

// Fingertip indices
var TIPS = [4, 8, 12, 16, 20];

// Hand skeleton connections (21 MediaPipe landmarks)
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

// Fire color ramp: hue from red(0) -> orange(25) -> yellow(50)
// Lightness increases as particles age (bright at base, dim at top)

function initHandfire() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  particles = [];
  smoothHands = [];

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
    loadError = 'Camera denied: ' + err.message;
    loading = false;
  });
}

function loadLib() {
  if (handposeLib) { initDetector(); return; }
  if (!navigator.gpu) {
    loadError = 'no WebGPU — hand tracking unavailable';
    loading = false;
    return;
  }
  import(/* webpackIgnore: true */ CDN_URL).then(function(mod) {
    handposeLib = mod.createHandpose || (mod.default && mod.default.createHandpose) || mod;
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
  if (!handposeLib || detector) { loading = false; return; }
  handposeLib().then(function(hp) {
    detector = hp;
    loading = false;
  }).catch(function(err) {
    loadError = 'Handpose init failed: ' + err.message;
    loading = false;
  });
}

function detectHands() {
  if (!detector || !webcamReady || detecting || webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    hands = result || [];
    updateSmoothedHands();
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateSmoothedHands() {
  var W = state.COLS, H = state.ROWS;

  // Rebuild smoothed hands array to match detected count
  while (smoothHands.length < hands.length) {
    var lmArr = [];
    for (var i = 0; i < 21; i++) lmArr.push({ x: 0, y: 0 });
    smoothHands.push({ landmarks: lmArr, fist: 0 });
  }

  for (var hi = 0; hi < hands.length; hi++) {
    var hand = hands[hi];
    var lm = hand.landmarks;
    if (!lm || lm.length < 21) continue;

    var sh = smoothHands[hi];
    for (var i = 0; i < 21; i++) {
      var tx = (1 - lm[i].x) * W;
      var ty = lm[i].y * H;
      sh.landmarks[i].x = sh.landmarks[i].x * 0.5 + tx * 0.5;
      sh.landmarks[i].y = sh.landmarks[i].y * 0.5 + ty * 0.5;
    }

    // Detect fist: average distance from fingertips to wrist
    var wrist = sh.landmarks[0];
    var totalDist = 0;
    for (var ti = 0; ti < TIPS.length; ti++) {
      var tip = sh.landmarks[TIPS[ti]];
      var dx = tip.x - wrist.x;
      var dy = tip.y - wrist.y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    var avgDist = totalDist / TIPS.length;
    // Normalize — small distance = fist
    var maxSpread = Math.max(W, H) * 0.25;
    var fistness = Math.max(0, Math.min(1, 1 - avgDist / maxSpread));
    sh.fist = sh.fist * 0.7 + fistness * 0.3;
  }
}

function spawnFireParticles() {
  for (var hi = 0; hi < hands.length && hi < smoothHands.length; hi++) {
    var sh = smoothHands[hi];
    var isFist = sh.fist > 0.5;
    var spawnRate = isFist ? 8 : 3;

    if (isFist) {
      // Fireball from palm center
      var palmX = (sh.landmarks[0].x + sh.landmarks[9].x) * 0.5;
      var palmY = (sh.landmarks[0].y + sh.landmarks[9].y) * 0.5;
      for (var i = 0; i < spawnRate * 2; i++) {
        particles.push({
          x: palmX + (Math.random() - 0.5) * 4,
          y: palmY + (Math.random() - 0.5) * 3,
          vx: (Math.random() - 0.5) * 3,
          vy: -1 - Math.random() * 4,
          life: 0.5 + Math.random() * 1.0,
          age: 0,
          size: 0.8 + Math.random() * 0.5
        });
      }
    }

    // Fingertip flames
    for (var ti = 0; ti < TIPS.length; ti++) {
      var tip = sh.landmarks[TIPS[ti]];
      for (var s = 0; s < spawnRate; s++) {
        particles.push({
          x: tip.x + (Math.random() - 0.5) * 1.5,
          y: tip.y + (Math.random() - 0.5) * 1,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -0.8 - Math.random() * 2.5,
          life: 0.3 + Math.random() * 0.8,
          age: 0,
          size: 0.4 + Math.random() * 0.4
        });
      }
    }
  }

  // Cap particles
  while (particles.length > MAX_PARTICLES) {
    particles.shift();
  }
}

function updateParticles(dt) {
  var alive = [];
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    p.age += dt;
    if (p.age >= p.life) continue;
    // Heat rise + turbulence
    p.vy -= 1.5 * dt; // upward acceleration
    p.vx += (Math.random() - 0.5) * 2 * dt; // flicker
    p.x += p.vx * dt * 10;
    p.y += p.vy * dt * 10;
    alive.push(p);
  }
  particles = alive;
}

function renderHandfire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = 0.016;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handfire...';
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
  if (frameCount % detectInterval === 0 && detector) detectHands();

  // Spawn and update particles
  if (smoothHands.length > 0 && hands.length > 0) {
    spawnFireParticles();
  }
  updateParticles(dt);

  // Render palm glow
  for (var hi = 0; hi < hands.length && hi < smoothHands.length; hi++) {
    var sh = smoothHands[hi];
    var palmX = (sh.landmarks[0].x + sh.landmarks[9].x) * 0.5;
    var palmY = (sh.landmarks[0].y + sh.landmarks[9].y) * 0.5;

    // Warm glow around palm
    var glowR = 4 + sh.fist * 4;
    for (var gy = Math.max(0, Math.floor(palmY - glowR)); gy < Math.min(H, Math.ceil(palmY + glowR)); gy++) {
      for (var gx = Math.max(0, Math.floor(palmX - glowR)); gx < Math.min(W, Math.ceil(palmX + glowR)); gx++) {
        var ddx = gx - palmX;
        var ddy = gy - palmY;
        var dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < glowR) {
          var fade = 1 - dist / glowR;
          fade = fade * fade;
          var glowHue = 20 + sh.fist * 10;
          var glowBright = 5 + fade * 20 * (1 + sh.fist);
          var glowCh = RAMP_DENSE[Math.min(RAMP_DENSE.length - 1, Math.floor(fade * 4))];
          if (glowCh !== ' ') {
            drawCharHSL(glowCh, gx, gy, glowHue, 80, glowBright);
          }
        }
      }
    }
  }

  // Render fire particles
  var FIRE_CHARS = '.:-=+*#%@';
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;

    var ageFrac = p.age / p.life;
    var invAge = 1 - ageFrac;

    // Fire color: red at base -> orange -> yellow -> white at tip (dying)
    var hue = ageFrac * 50; // 0 (red) -> 50 (yellow)
    var sat = 100 - ageFrac * 40;
    var bright = 25 + invAge * 50;

    // Character: dense at base, sparse as fading
    var ci = Math.min(FIRE_CHARS.length - 1, Math.floor(invAge * FIRE_CHARS.length));
    var ch = FIRE_CHARS[ci];

    drawCharHSL(ch, px, py, hue, sat, bright);
  }

  // Render fingertip indicators (bright dots)
  for (var hi2 = 0; hi2 < hands.length && hi2 < smoothHands.length; hi2++) {
    var sh2 = smoothHands[hi2];
    for (var ti = 0; ti < TIPS.length; ti++) {
      var tip = sh2.landmarks[TIPS[ti]];
      var tx = Math.round(tip.x);
      var ty = Math.round(tip.y);
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        drawCharHSL('*', tx, ty, 40, 100, 65);
      }
    }
  }

  // Draw hand skeleton overlay
  for (var hi3 = 0; hi3 < hands.length && hi3 < smoothHands.length; hi3++) {
    var sh3 = smoothHands[hi3];

    // Skeleton lines — warm orange
    for (var ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
      var a = sh3.landmarks[HAND_CONNECTIONS[ci][0]];
      var b = sh3.landmarks[HAND_CONNECTIONS[ci][1]];
      var ldx = b.x - a.x, ldy = b.y - a.y;
      var llen = Math.sqrt(ldx * ldx + ldy * ldy);
      var lsteps = Math.max(1, Math.ceil(llen * 1.5));
      for (var ls = 0; ls <= lsteps; ls++) {
        var lt = ls / lsteps;
        var lx2 = Math.round(a.x + ldx * lt);
        var ly2 = Math.round(a.y + ldy * lt);
        if (lx2 < 0 || lx2 >= W || ly2 < 0 || ly2 >= H) continue;
        var absLdx = Math.abs(ldx), absLdy = Math.abs(ldy);
        var lch;
        if (absLdx > absLdy * 2) lch = '-';
        else if (absLdy > absLdx * 2) lch = '|';
        else if (ldx * ldy > 0) lch = '\\';
        else lch = '/';
        drawCharHSL(lch, lx2, ly2, 25, 80, 45);
      }
    }

    // Joint nodes — bright yellow-orange
    for (var ji = 0; ji < 21; ji++) {
      var jx = Math.round(sh3.landmarks[ji].x);
      var jy = Math.round(sh3.landmarks[ji].y);
      if (jx >= 0 && jx < W && jy >= 0 && jy < H) {
        drawCharHSL('@', jx, jy, 40, 100, 60);
      }
      // Slightly larger — mark adjacent cells
      for (var jdy = -1; jdy <= 1; jdy += 2) {
        for (var jdx = -1; jdx <= 1; jdx += 2) {
          var njx = jx + jdx, njy = jy + jdy;
          if (njx >= 0 && njx < W && njy >= 0 && njy < H) {
            drawCharHSL('#', njx, njy, 30, 90, 50);
          }
        }
      }
    }
  }

  // Label
  var label = '[handfire]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 20, 60, 30);
  }
}

registerMode('handfire', { init: initHandfire, render: renderHandfire });
