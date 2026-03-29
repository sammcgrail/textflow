import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Hand Laser — laser beams shoot from fingertips in finger direction
// Each finger has a different neon color
// Beams extend to screen edges, create impact sparks
// Close fingers = converging beams with bright focal point

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
var smoothHands = [];

// Fingertip + second-to-last joint pairs for direction
// tip, DIP (second-to-last joint)
var FINGER_PAIRS = [
  [4, 3],   // thumb: tip, IP
  [8, 7],   // index: tip, DIP
  [12, 11], // middle: tip, DIP
  [16, 15], // ring: tip, DIP
  [20, 19]  // pinky: tip, DIP
];

// Neon colors per finger (hue)
var FINGER_HUES = [0, 120, 200, 280, 50]; // red, green, blue, purple, yellow

// Hand skeleton connections (21 MediaPipe landmarks)
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

// Impact sparks
var MAX_SPARKS = 100;
var sparks = [];

function initHandlaser() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  smoothHands = [];
  sparks = [];

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

  while (smoothHands.length < hands.length) {
    var lmArr = [];
    for (var i = 0; i < 21; i++) lmArr.push({ x: 0, y: 0 });
    smoothHands.push({ landmarks: lmArr });
  }

  for (var hi = 0; hi < hands.length; hi++) {
    var hand = hands[hi];
    var lm = hand.landmarks;
    if (!lm || lm.length < 21) continue;

    var sh = smoothHands[hi];
    for (var i = 0; i < 21; i++) {
      var tx = (1 - lm[i].x) * W;
      var ty = lm[i].y * H;
      sh.landmarks[i].x = sh.landmarks[i].x * 0.4 + tx * 0.6;
      sh.landmarks[i].y = sh.landmarks[i].y * 0.4 + ty * 0.6;
    }
  }
}

function spawnSpark(x, y, hue) {
  var angle = Math.random() * 6.283;
  var speed = 0.5 + Math.random() * 2;
  sparks.push({
    x: x, y: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.2 + Math.random() * 0.3,
    age: 0,
    hue: hue
  });
  if (sparks.length > MAX_SPARKS) sparks.shift();
}

function updateSparks(dt) {
  var alive = [];
  for (var i = 0; i < sparks.length; i++) {
    var s = sparks[i];
    s.age += dt;
    if (s.age >= s.life) continue;
    s.x += s.vx * dt * 8;
    s.y += s.vy * dt * 8;
    alive.push(s);
  }
  sparks = alive;
}

function renderHandlaser() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = 0.016;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handlaser...';
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
  updateSparks(dt);

  // Collect all beam endpoints for convergence detection
  var allTips = [];

  // Draw laser beams
  var BEAM_CHARS = '=-~+*|/\\';

  for (var hi = 0; hi < hands.length && hi < smoothHands.length; hi++) {
    var sh = smoothHands[hi];

    for (var fi = 0; fi < FINGER_PAIRS.length; fi++) {
      var tipIdx = FINGER_PAIRS[fi][0];
      var dipIdx = FINGER_PAIRS[fi][1];
      var tip = sh.landmarks[tipIdx];
      var dip = sh.landmarks[dipIdx];

      // Direction from DIP to tip
      var dirX = tip.x - dip.x;
      var dirY = tip.y - dip.y;
      var dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen < 0.5) continue;
      dirX /= dirLen;
      dirY /= dirLen;

      var hue = FINGER_HUES[fi];
      allTips.push({ x: tip.x, y: tip.y, hue: hue });

      // Trace beam from tip to screen edge
      var bx = tip.x;
      var by = tip.y;
      var step = 0;
      var maxSteps = W + H;

      while (step < maxSteps) {
        bx += dirX * 0.5;
        by += dirY * 0.5;
        step++;

        var ix = Math.round(bx);
        var iy = Math.round(by);

        if (ix < 0 || ix >= W || iy < 0 || iy >= H) {
          // Hit edge — spawn sparks
          var edgeX = Math.max(0, Math.min(W - 1, ix));
          var edgeY = Math.max(0, Math.min(H - 1, iy));
          if (Math.random() < 0.3) {
            spawnSpark(edgeX, edgeY, hue);
          }
          break;
        }

        // Beam character based on direction
        var ch;
        var absX = Math.abs(dirX);
        var absY = Math.abs(dirY);
        if (absX > absY * 2) ch = '-';
        else if (absY > absX * 2) ch = '|';
        else if (dirX * dirY > 0) ch = '\\';
        else ch = '/';

        // Flickering brightness
        var dist = step * 0.5;
        var flicker = Math.sin(t * 15 + dist * 0.3 + fi * 2) * 0.15;
        var bright = 45 + flicker * 30;
        var sat = 90;

        // Core brightness (brighter near tip)
        if (dist < 3) {
          bright = 65;
          sat = 100;
          ch = '*';
        }

        // Beam width — glow adjacent cells dimmer
        drawCharHSL(ch, ix, iy, hue, sat, bright);

        // Side glow
        if (Math.random() < 0.3) {
          var sideX = ix + (absX > absY ? 0 : (Math.random() < 0.5 ? 1 : -1));
          var sideY = iy + (absX > absY ? (Math.random() < 0.5 ? 1 : -1) : 0);
          if (sideX >= 0 && sideX < W && sideY >= 0 && sideY < H) {
            drawCharHSL('.', sideX, sideY, hue, 60, bright * 0.4);
          }
        }
      }
    }
  }

  // Check for finger convergence — bright focal point
  if (allTips.length >= 2) {
    // Find average position of tips that are close together
    for (var a = 0; a < allTips.length; a++) {
      for (var b = a + 1; b < allTips.length; b++) {
        var dx = allTips[a].x - allTips[b].x;
        var dy = allTips[a].y - allTips[b].y;
        var dist2 = Math.sqrt(dx * dx + dy * dy);
        if (dist2 < 5) {
          // Convergence point
          var cx = Math.round((allTips[a].x + allTips[b].x) * 0.5);
          var cy = Math.round((allTips[a].y + allTips[b].y) * 0.5);
          var convergeBright = 70 - dist2 * 8;
          // Bright flash at convergence
          for (var gy = -2; gy <= 2; gy++) {
            for (var gx = -2; gx <= 2; gx++) {
              var fx = cx + gx;
              var fy = cy + gy;
              if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
                var gd = Math.sqrt(gx * gx + gy * gy);
                if (gd < 2.5) {
                  var gfade = 1 - gd / 2.5;
                  var focalHue = (allTips[a].hue + allTips[b].hue) * 0.5;
                  drawCharHSL('*', fx, fy, focalHue, 60, convergeBright * gfade);
                }
              }
            }
          }
        }
      }
    }
  }

  // Render sparks
  for (var si = 0; si < sparks.length; si++) {
    var sp = sparks[si];
    var sx = Math.round(sp.x);
    var sy = Math.round(sp.y);
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
    var fade = 1 - sp.age / sp.life;
    drawCharHSL('*', sx, sy, sp.hue, 80, 20 + fade * 50);
  }

  // Render fingertip dots
  for (var hi2 = 0; hi2 < hands.length && hi2 < smoothHands.length; hi2++) {
    var sh2 = smoothHands[hi2];
    for (var fi2 = 0; fi2 < FINGER_PAIRS.length; fi2++) {
      var tip2 = sh2.landmarks[FINGER_PAIRS[fi2][0]];
      var tx2 = Math.round(tip2.x);
      var ty2 = Math.round(tip2.y);
      if (tx2 >= 0 && tx2 < W && ty2 >= 0 && ty2 < H) {
        drawCharHSL('@', tx2, ty2, FINGER_HUES[fi2], 100, 65);
      }
    }
  }

  // Draw hand skeleton overlay — neon cyan/magenta
  for (var hi3 = 0; hi3 < hands.length && hi3 < smoothHands.length; hi3++) {
    var sh3 = smoothHands[hi3];

    // Skeleton lines — neon cyan
    for (var ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
      var ca = sh3.landmarks[HAND_CONNECTIONS[ci][0]];
      var cb = sh3.landmarks[HAND_CONNECTIONS[ci][1]];
      var ldx = cb.x - ca.x, ldy = cb.y - ca.y;
      var llen = Math.sqrt(ldx * ldx + ldy * ldy);
      var lsteps = Math.max(1, Math.ceil(llen * 1.5));
      for (var ls = 0; ls <= lsteps; ls++) {
        var lt = ls / lsteps;
        var lx2 = Math.round(ca.x + ldx * lt);
        var ly2 = Math.round(ca.y + ldy * lt);
        if (lx2 < 0 || lx2 >= W || ly2 < 0 || ly2 >= H) continue;
        var absLdx = Math.abs(ldx), absLdy = Math.abs(ldy);
        var lch;
        if (absLdx > absLdy * 2) lch = '-';
        else if (absLdy > absLdx * 2) lch = '|';
        else if (ldx * ldy > 0) lch = '\\';
        else lch = '/';
        drawCharHSL(lch, lx2, ly2, 180, 100, 50);
      }
    }

    // Joint nodes — bright neon magenta
    for (var ji = 0; ji < 21; ji++) {
      var jx = Math.round(sh3.landmarks[ji].x);
      var jy = Math.round(sh3.landmarks[ji].y);
      if (jx >= 0 && jx < W && jy >= 0 && jy < H) {
        drawCharHSL('@', jx, jy, 300, 100, 65);
      }
      for (var jdy = -1; jdy <= 1; jdy += 2) {
        for (var jdx = -1; jdx <= 1; jdx += 2) {
          var njx = jx + jdx, njy = jy + jdy;
          if (njx >= 0 && njx < W && njy >= 0 && njy < H) {
            drawCharHSL('#', njx, njy, 290, 90, 55);
          }
        }
      }
    }
  }

  // Label
  var label = '[handlaser]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 200, 60, 30);
  }
}

registerMode('handlaser', { init: initHandlaser, render: renderHandlaser });
