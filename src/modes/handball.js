// handball — Glowing balls fall with gravity, bounce off your tracked hand
// Text characters crack apart and fall as debris when hit by balls
// R3F overlay renders glowing spheres via R3FHandball.jsx

import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

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

var rawHands = [];

// Fingertip landmark indices + palm center
var FINGER_TIPS = [4, 8, 12, 16, 20];
var PALM_CENTER = 9;

// Hand skeleton connections for drawing
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

// Smoothed hand landmarks in normalized coords (0-1)
var smoothLandmarks = [];

// Previous hand positions for velocity calculation
var prevHandPoints = [];
var handVelocities = [];

// Text content to cycle through
var TEXT_CONTENT = 'BOUNCE VOLLEY SMASH RALLY SERVE ACE MATCH POINT GAME SET BREAK DEUCE ';

// Ball hues
var BALL_HUES = [0, 30, 60, 180, 240, 300];
var NUM_BALLS = 6;

// === Exported shared state for R3FHandball.jsx ===
export var ballState = {
  balls: [],
  handPoints: []
};

// === Text grid state ===
var textGrid = null;
var gridW = 0;
var gridH = 0;

// Each cell: { ch, fallOffset, fallSpeed, hitHue, hitFade, crackTimer }
function makeCell(ch) {
  return { ch: ch, fallOffset: 0, fallSpeed: 0, hitHue: 140, hitFade: 0, crackTimer: 0 };
}

function initTextGrid(W, H) {
  if (textGrid && gridW === W && gridH === H) return;
  gridW = W;
  gridH = H;
  textGrid = new Array(W * H);
  var ti = 0;
  for (var i = 0; i < W * H; i++) {
    textGrid[i] = makeCell(TEXT_CONTENT[ti % TEXT_CONTENT.length]);
    ti++;
  }
}

function initBalls() {
  ballState.balls = [];
  for (var i = 0; i < NUM_BALLS; i++) {
    ballState.balls.push({
      x: 0.1 + Math.random() * 0.8,
      y: Math.random() * 0.25,
      vx: (Math.random() - 0.5) * 0.002,
      vy: Math.random() * 0.001,
      radius: 0.03 + Math.random() * 0.02,
      hue: BALL_HUES[i],
      glow: 0.3
    });
  }
}

function respawnBall(ball) {
  ball.x = 0.1 + Math.random() * 0.8;
  ball.y = -0.05;
  ball.vx = (Math.random() - 0.5) * 0.003;
  ball.vy = 0.0005 + Math.random() * 0.001;
  ball.glow = 0.3;
}

// === Webcam + handpose setup (same pattern as handgravity.js) ===

function initHandball() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  rawHands = [];
  smoothLandmarks = [];
  prevHandPoints = [];
  handVelocities = [];
  textGrid = null;
  gridW = 0;
  gridH = 0;

  initBalls();

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
    rawHands = result || [];
    updateSmoothedLandmarks();
    detecting = false;
  }).catch(function() { detecting = false; });
}

function updateSmoothedLandmarks() {
  // Store previous for velocity
  prevHandPoints = [];
  for (var i = 0; i < ballState.handPoints.length; i++) {
    prevHandPoints.push({ x: ballState.handPoints[i].x, y: ballState.handPoints[i].y });
  }

  var newPoints = [];

  for (var hi = 0; hi < rawHands.length; hi++) {
    var hand = rawHands[hi];
    var lm = hand.landmarks;
    if (!lm || lm.length < 21) continue;

    // Ensure smoothLandmarks has entries for this hand
    while (smoothLandmarks.length <= hi) {
      var arr = [];
      for (var li = 0; li < 21; li++) arr.push({ x: 0.5, y: 0.5 });
      smoothLandmarks.push(arr);
    }

    var sh = smoothLandmarks[hi];
    for (var li = 0; li < 21; li++) {
      var tx = 1 - lm[li].x; // mirror X
      var ty = lm[li].y;
      sh[li].x = sh[li].x * 0.4 + tx * 0.6;
      sh[li].y = sh[li].y * 0.4 + ty * 0.6;
    }

    // Collect fingertip + palm points for collision
    for (var fi = 0; fi < FINGER_TIPS.length; fi++) {
      var idx = FINGER_TIPS[fi];
      newPoints.push({ x: sh[idx].x, y: sh[idx].y });
    }
    // Palm center
    newPoints.push({ x: sh[PALM_CENTER].x, y: sh[PALM_CENTER].y });
  }

  // Compute velocities
  handVelocities = [];
  for (var i = 0; i < newPoints.length; i++) {
    if (i < prevHandPoints.length) {
      handVelocities.push({
        vx: newPoints[i].x - prevHandPoints[i].x,
        vy: newPoints[i].y - prevHandPoints[i].y
      });
    } else {
      handVelocities.push({ vx: 0, vy: 0 });
    }
  }

  ballState.handPoints = newPoints;
}

// === Ball physics ===

function updateBalls() {
  var GRAVITY = 0.0003;
  var DAMPING = 0.999;
  var RESTITUTION = 0.9;
  var HAND_RADIUS = 0.04;

  for (var i = 0; i < ballState.balls.length; i++) {
    var ball = ballState.balls[i];

    // Gravity
    ball.vy += GRAVITY;

    // Damping
    ball.vx *= DAMPING;
    ball.vy *= DAMPING;

    // Move
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Bounce off walls
    if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.vx = Math.abs(ball.vx) * RESTITUTION;
    }
    if (ball.x + ball.radius > 1) {
      ball.x = 1 - ball.radius;
      ball.vx = -Math.abs(ball.vx) * RESTITUTION;
    }
    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.vy = Math.abs(ball.vy) * RESTITUTION;
    }

    // Respawn if below screen
    if (ball.y > 1.1) {
      respawnBall(ball);
    }

    // Glow decay
    ball.glow *= 0.96;
    if (ball.glow < 0.1) ball.glow = 0.1;

    // Hand collision
    for (var hi = 0; hi < ballState.handPoints.length; hi++) {
      var hp = ballState.handPoints[hi];
      var dx = ball.x - hp.x;
      var dy = ball.y - hp.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < HAND_RADIUS + ball.radius && dist > 0.001) {
        // Reflect velocity away from hand point
        var nx = dx / dist;
        var ny = dy / dist;
        var dotVN = ball.vx * nx + ball.vy * ny;

        if (dotVN < 0) {
          // Only reflect if moving toward the hand
          ball.vx -= 2 * dotVN * nx;
          ball.vy -= 2 * dotVN * ny;

          // Apply restitution
          ball.vx *= RESTITUTION;
          ball.vy *= RESTITUTION;

          // Add hand velocity as impulse
          if (hi < handVelocities.length) {
            ball.vx += handVelocities[hi].vx * 0.5;
            ball.vy += handVelocities[hi].vy * 0.5;
          }

          // Push ball out of collision
          var overlap = (HAND_RADIUS + ball.radius) - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;
        }

        // Glow on hit
        ball.glow = 1.0;
      }
    }
  }
}

// === Text cracking ===

function crackTextAtBall(ball, W, H) {
  var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (speed < 0.003) return; // too slow to crack

  // Convert ball position to grid coords
  var gx = Math.round(ball.x * W);
  var gy = Math.round(ball.y * H);

  // Crack radius proportional to speed
  var crackR = Math.max(1, Math.floor(speed * 300));
  crackR = Math.min(crackR, 5);

  for (var dy = -crackR; dy <= crackR; dy++) {
    for (var dx = -crackR; dx <= crackR; dx++) {
      var cx = gx + dx;
      var cy = gy + dy;
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
      if (dx * dx + dy * dy > crackR * crackR) continue;

      var idx = cy * W + cx;
      var cell = textGrid[idx];
      if (cell.fallOffset <= 0) {
        cell.fallOffset = 0.01; // start falling
        cell.fallSpeed = 0;
        cell.crackTimer = 3; // flash white for 3 frames
        cell.hitHue = ball.hue;
        cell.hitFade = 1.0;
      }
    }
  }
}

function updateTextGrid(W, H) {
  var ti = Math.floor(state.time * 5) % TEXT_CONTENT.length;

  for (var i = 0; i < W * H; i++) {
    var cell = textGrid[i];

    if (cell.crackTimer > 0) {
      cell.crackTimer--;
    }

    if (cell.fallOffset > 0) {
      cell.fallSpeed += 0.15;
      cell.fallOffset += cell.fallSpeed;

      // Fallen off screen — reset
      if (cell.fallOffset > H) {
        cell.fallOffset = 0;
        cell.fallSpeed = 0;
        cell.crackTimer = 0;
        cell.ch = TEXT_CONTENT[ti % TEXT_CONTENT.length];
        ti++;
        cell.hitFade = 0;
      }
    }

    // Fade hit color back to default
    if (cell.hitFade > 0) {
      cell.hitFade *= 0.995;
      if (cell.hitFade < 0.01) cell.hitFade = 0;
    }
  }
}

// === Rendering ===

function renderHandball() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handball...';
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
  if (frameCount % detectInterval === 0 && detector) detectHands();

  // Initialize text grid
  initTextGrid(W, H);

  // Update ball physics
  updateBalls();

  // Ball vs text collision
  for (var bi = 0; bi < ballState.balls.length; bi++) {
    crackTextAtBall(ballState.balls[bi], W, H);
  }

  // Update falling text
  updateTextGrid(W, H);

  // === Draw text grid ===
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var cell = textGrid[idx];

      // Compute render Y with fall offset
      var renderY = y + Math.floor(cell.fallOffset);
      if (renderY >= H || renderY < 0) continue;

      var ch = cell.ch;
      if (ch === ' ') continue;

      var hue, sat, light;

      if (cell.crackTimer > 0) {
        // Flash white when cracking
        hue = 0;
        sat = 0;
        light = 90;
      } else if (cell.hitFade > 0) {
        // Blend between hit hue and default teal
        hue = cell.hitHue * cell.hitFade + 140 * (1 - cell.hitFade);
        sat = 70;
        light = 30 + cell.hitFade * 20;
      } else {
        // Default green/teal
        hue = 140;
        sat = 50;
        light = 30;
      }

      // Subtle animation
      if (cell.fallOffset > 0) {
        // Falling cells get slightly brighter
        light = Math.min(60, light + 10);
      }

      drawCharHSL(ch, x, renderY, hue | 0, sat | 0, light | 0);
    }
  }

  // === Draw hand skeleton ===
  var numHands = Math.min(rawHands.length, smoothLandmarks.length);
  for (var hi = 0; hi < numHands; hi++) {
    var sh = smoothLandmarks[hi];
    if (!sh) continue;

    // Draw skeleton lines
    for (var ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
      var a = sh[HAND_CONNECTIONS[ci][0]];
      var b = sh[HAND_CONNECTIONS[ci][1]];
      var ax = a.x * W;
      var ay = a.y * H;
      var bx = b.x * W;
      var by = b.y * H;
      var ldx = bx - ax;
      var ldy = by - ay;
      var llen = Math.sqrt(ldx * ldx + ldy * ldy);
      var lsteps = Math.max(1, Math.ceil(llen * 1.5));

      for (var ls = 0; ls <= lsteps; ls++) {
        var lt = ls / lsteps;
        var lx = Math.round(ax + ldx * lt);
        var ly = Math.round(ay + ldy * lt);
        if (lx < 0 || lx >= W || ly < 0 || ly >= H) continue;

        var absLdx = Math.abs(ldx);
        var absLdy = Math.abs(ldy);
        var lch;
        if (absLdx > absLdy * 2) lch = '-';
        else if (absLdy > absLdx * 2) lch = '|';
        else if (ldx * ldy > 0) lch = '\\';
        else lch = '/';

        drawCharHSL(lch, lx, ly, 50, 100, 85);
      }
    }

    // Draw joint nodes — bright and visible
    for (var ji = 0; ji < 21; ji++) {
      var jx = Math.round(sh[ji].x * W);
      var jy = Math.round(sh[ji].y * H);
      if (jx >= 0 && jx < W && jy >= 0 && jy < H) {
        var isTip = (ji === 4 || ji === 8 || ji === 12 || ji === 16 || ji === 20);
        if (isTip) {
          drawCharHSL('@', jx, jy, 40, 100, 90);
          // Glow around fingertips
          for (var gd = -1; gd <= 1; gd++) {
            for (var ge = -1; ge <= 1; ge++) {
              if (gd === 0 && ge === 0) continue;
              var ggx = jx + gd, ggy = jy + ge;
              if (ggx >= 0 && ggx < W && ggy >= 0 && ggy < H) {
                drawCharHSL('.', ggx, ggy, 50, 80, 40);
              }
            }
          }
        } else {
          drawCharHSL('O', jx, jy, 50, 100, 80);
        }
      }
    }
  }

  // === Draw ball positions as ASCII fallback (visible even without R3F) ===
  for (var bi2 = 0; bi2 < ballState.balls.length; bi2++) {
    var ball = ballState.balls[bi2];
    var bx2 = Math.round(ball.x * W);
    var by2 = Math.round(ball.y * H);
    if (bx2 >= 0 && bx2 < W && by2 >= 0 && by2 < H) {
      var bLight = 40 + ball.glow * 40;
      drawCharHSL('O', bx2, by2, ball.hue, 90, bLight | 0);
    }
  }

  // No hands hint
  if (numHands === 0) {
    var hint = 'show your hands';
    var hx = Math.floor((W - hint.length) / 2);
    var hy = Math.floor(H / 2) - 2;
    for (var hi2 = 0; hi2 < hint.length; hi2++) {
      drawCharHSL(hint[hi2], hx + hi2, hy, (t * 30 + hi2 * 10) % 360, 50, 25);
    }
  }

  // Label
  var label = '[handball]';
  var lx2 = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx2 + li, H - 1, 30, 60, 30);
  }
}

registerMode('handball', { init: initHandball, render: renderHandball });
