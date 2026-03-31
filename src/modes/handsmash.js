import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Hand Smash — wrecking ball repelled by hand, shatters text into debris
// Ball bounces with physics, hand pushes it away on contact
// Text cells shatter into particles when ball passes over them
// R3F overlay renders the glowing 3D ball

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

// Shared state for R3F overlay
export var smashState = {
  ballX: 0.5,
  ballY: 0.5,
  ballVX: 0.02,
  ballVY: -0.015,
  ballRadius: 0.08,
  ballGlow: 0.0,
  handVisible: false
};

// Ball physics (normalized 0-1 coords)
var BALL_GRAVITY = 0.0004;
var BALL_DAMPING = 0.998;
var BALL_RESTITUTION = 0.85;
var HAND_IMPULSE_STRENGTH = 0.06;

// Previous hand position for velocity tracking
var prevHandX = 0.5;
var prevHandY = 0.5;
var handVelX = 0;
var handVelY = 0;

// Text content
var TEXT_CONTENT = 'SHATTER DESTROY SMASH BREAK CRASH WRECK DEMOLISH OBLITERATE PULVERIZE ANNIHILATE ';
var textIdx = 0;

// Cell health grid
var cellHealth = null;
var cellW = 0;
var cellH = 0;

// Debris particles
var MAX_DEBRIS = 500;
var debris = [];
var debrisIdx = 0;

// Hand skeleton connections
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

function initHandsmash() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  smoothHands = [];
  cellHealth = null;
  debris = [];
  debrisIdx = 0;
  textIdx = 0;

  // Reset ball to center with small random velocity
  smashState.ballX = 0.5;
  smashState.ballY = 0.4;
  smashState.ballVX = 0.015 * (Math.random() > 0.5 ? 1 : -1);
  smashState.ballVY = -0.01;
  smashState.ballGlow = 0.0;
  smashState.handVisible = false;

  prevHandX = 0.5;
  prevHandY = 0.5;
  handVelX = 0;
  handVelY = 0;

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
    for (var li = 0; li < 21; li++) lmArr.push({ x: W * 0.5, y: H * 0.5 });
    smoothHands.push({ cx: W * 0.5, cy: H * 0.5, nx: 0.5, ny: 0.5, landmarks: lmArr });
  }

  for (var hi = 0; hi < hands.length; hi++) {
    var hand = hands[hi];
    var lm = hand.landmarks;
    if (!lm || lm.length < 21) continue;

    // Palm center in grid coords (mirrored X)
    var pcx = ((1 - lm[0].x) + (1 - lm[9].x)) * 0.5 * W;
    var pcy = (lm[0].y + lm[9].y) * 0.5 * H;

    // Palm center in normalized coords (mirrored X)
    var pnx = ((1 - lm[0].x) + (1 - lm[9].x)) * 0.5;
    var pny = (lm[0].y + lm[9].y) * 0.5;

    var sh = smoothHands[hi];
    sh.cx = sh.cx * 0.4 + pcx * 0.6;
    sh.cy = sh.cy * 0.4 + pcy * 0.6;
    sh.nx = sh.nx * 0.4 + pnx * 0.6;
    sh.ny = sh.ny * 0.4 + pny * 0.6;

    for (var li2 = 0; li2 < 21; li2++) {
      var tx = (1 - lm[li2].x) * W;
      var ty = lm[li2].y * H;
      sh.landmarks[li2].x = sh.landmarks[li2].x * 0.4 + tx * 0.6;
      sh.landmarks[li2].y = sh.landmarks[li2].y * 0.4 + ty * 0.6;
    }
  }
}

function updateBallPhysics() {
  var b = smashState;

  // Gravity
  b.ballVY += BALL_GRAVITY;

  // Damping
  b.ballVX *= BALL_DAMPING;
  b.ballVY *= BALL_DAMPING;

  // Move
  b.ballX += b.ballVX;
  b.ballY += b.ballVY;

  // Bounce off edges
  var r = b.ballRadius;
  if (b.ballX - r < 0) {
    b.ballX = r;
    b.ballVX = Math.abs(b.ballVX) * BALL_RESTITUTION;
  }
  if (b.ballX + r > 1) {
    b.ballX = 1 - r;
    b.ballVX = -Math.abs(b.ballVX) * BALL_RESTITUTION;
  }
  if (b.ballY - r < 0) {
    b.ballY = r;
    b.ballVY = Math.abs(b.ballVY) * BALL_RESTITUTION;
  }
  if (b.ballY + r > 1) {
    b.ballY = 1 - r;
    b.ballVY = -Math.abs(b.ballVY) * BALL_RESTITUTION;
  }

  // Glow decay
  b.ballGlow *= 0.95;
}

function handleHandCollision() {
  var numHands = Math.min(hands.length, smoothHands.length);
  smashState.handVisible = numHands > 0;

  if (numHands === 0) return;

  for (var hi = 0; hi < numHands; hi++) {
    var sh = smoothHands[hi];
    var dx = smashState.ballX - sh.nx;
    var dy = smashState.ballY - sh.ny;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < smashState.ballRadius + 0.05) {
      // Track hand velocity
      handVelX = sh.nx - prevHandX;
      handVelY = sh.ny - prevHandY;

      // Push ball away from hand
      var nx = dist > 0.001 ? dx / dist : 0;
      var ny = dist > 0.001 ? dy / dist : 1;

      // Force = hand velocity + separation impulse
      var handSpeed = Math.sqrt(handVelX * handVelX + handVelY * handVelY);
      var impulse = HAND_IMPULSE_STRENGTH + handSpeed * 2.0;

      smashState.ballVX += nx * impulse;
      smashState.ballVY += ny * impulse;

      // Cap speed
      var speed = Math.sqrt(smashState.ballVX * smashState.ballVX + smashState.ballVY * smashState.ballVY);
      if (speed > 0.08) {
        smashState.ballVX = (smashState.ballVX / speed) * 0.08;
        smashState.ballVY = (smashState.ballVY / speed) * 0.08;
      }

      // Separate ball from hand
      smashState.ballX = sh.nx + nx * (smashState.ballRadius + 0.06);
      smashState.ballY = sh.ny + ny * (smashState.ballRadius + 0.06);

      // Glow on hit
      smashState.ballGlow = 1.0;
    }

    prevHandX = sh.nx;
    prevHandY = sh.ny;
  }
}

function spawnDebris(gx, gy, ch, hue) {
  var d;
  if (debris.length < MAX_DEBRIS) {
    d = { x: 0, y: 0, vx: 0, vy: 0, ch: ' ', hue: 0, alpha: 1, life: 1 };
    debris.push(d);
  } else {
    d = debris[debrisIdx % MAX_DEBRIS];
    debrisIdx++;
  }

  var angle = Math.random() * 6.283;
  var speed = 1.0 + Math.random() * 3.0;
  // Bias velocity away from ball center
  var bGridX = smashState.ballX * state.COLS;
  var bGridY = smashState.ballY * state.ROWS;
  var awayX = gx - bGridX;
  var awayY = gy - bGridY;
  var awayLen = Math.sqrt(awayX * awayX + awayY * awayY);
  if (awayLen > 0.01) {
    awayX /= awayLen;
    awayY /= awayLen;
  }

  d.x = gx;
  d.y = gy;
  d.vx = Math.cos(angle) * speed * 0.5 + awayX * speed;
  d.vy = Math.sin(angle) * speed * 0.5 + awayY * speed - 1.5;
  d.ch = ch;
  d.hue = hue;
  d.alpha = 1.0;
  d.life = 1.0;
}

function updateDebris() {
  for (var i = 0; i < debris.length; i++) {
    var d = debris[i];
    if (d.life <= 0) continue;

    d.vy += 0.15; // gravity on debris
    d.x += d.vx * 0.3;
    d.y += d.vy * 0.3;
    d.vx *= 0.97;
    d.vy *= 0.97;
    d.life -= 0.012;
    d.alpha = Math.max(0, d.life);
  }
}

function renderHandsmash() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handsmash...';
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

  // Init cell health grid
  if (!cellHealth || cellW !== W || cellH !== H) {
    cellHealth = new Float32Array(W * H);
    for (var ci = 0; ci < cellHealth.length; ci++) cellHealth[ci] = 1.0;
    cellW = W;
    cellH = H;
    textIdx = 0;
  }

  // Update ball physics
  updateBallPhysics();
  handleHandCollision();

  // Ball position in grid coords
  var bx = smashState.ballX * W;
  var by = smashState.ballY * H;
  var br = smashState.ballRadius * Math.max(W, H);

  // Regenerate cell health
  for (var ri = 0; ri < cellHealth.length; ri++) {
    if (cellHealth[ri] < 1.0) {
      cellHealth[ri] += 0.003;
      if (cellHealth[ri] > 1.0) cellHealth[ri] = 1.0;
    }
  }

  // Smash cells near ball
  for (var sy = Math.max(0, Math.floor(by - br - 1)); sy < Math.min(H, Math.ceil(by + br + 1)); sy++) {
    for (var sx = Math.max(0, Math.floor(bx - br - 1)); sx < Math.min(W, Math.ceil(bx + br + 1)); sx++) {
      var ddx = sx - bx;
      var ddy = sy - by;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd < br) {
        var idx = sy * W + sx;
        if (cellHealth[idx] > 0.3) {
          // Get the character that would be at this cell
          var tci = (sy * W + sx) % TEXT_CONTENT.length;
          var ch = TEXT_CONTENT[tci];
          var cellHue = 180 + ((sx + sy * 3) % 40);
          spawnDebris(sx, sy, ch, cellHue);
          cellHealth[idx] = 0;
        }
      }
    }
  }

  // Update debris
  updateDebris();

  // Render text grid
  for (var ty = 0; ty < H - 1; ty++) {
    for (var tx = 0; tx < W; tx++) {
      var hidx = ty * W + tx;
      var health = cellHealth[hidx];
      if (health <= 0.3) continue;

      var tci2 = (ty * W + tx) % TEXT_CONTENT.length;
      var ch2 = TEXT_CONTENT[tci2];

      var baseHue = 180 + ((tx + ty * 3) % 40);
      var baseSat = 60 + Math.sin(t * 0.5 + tx * 0.1 + ty * 0.15) * 15;
      var baseLit = 15 + health * 15 + Math.sin(t * 0.8 + tx * 0.2) * 5;

      // Dim cells that are regenerating
      if (health < 0.7) {
        baseLit *= health;
        baseSat *= health;
      }

      drawCharHSL(ch2, tx, ty, baseHue, baseSat, baseLit);
    }
  }

  // Draw ball aura in ASCII (soft glow dots around ball)
  var auraRadius = br + 2;
  for (var aa = 0; aa < 6.283; aa += 0.2) {
    for (var ar = br * 0.5; ar < auraRadius; ar += 1.2) {
      var ax = Math.round(bx + Math.cos(aa) * ar);
      var ay = Math.round(by + Math.sin(aa) * ar);
      if (ax < 0 || ax >= W || ay < 0 || ay >= H) continue;
      var aFade = 1 - (ar - br * 0.5) / (auraRadius - br * 0.5);
      var aHue = (20 + smashState.ballGlow * 20) % 360;
      var aLit = 8 + aFade * 20 + smashState.ballGlow * 15;
      drawCharHSL('.', ax, ay, aHue, 80, aLit);
    }
  }

  // Render debris particles
  for (var di = 0; di < debris.length; di++) {
    var d = debris[di];
    if (d.life <= 0) continue;
    var dpx = Math.round(d.x);
    var dpy = Math.round(d.y);
    if (dpx < 0 || dpx >= W || dpy < 0 || dpy >= H) continue;

    // Hue transitions from text blue to ball orange as it fades
    var dHue = d.hue + (1 - d.life) * (20 - d.hue);
    var dSat = 60 + d.alpha * 30;
    var dLit = 10 + d.alpha * 40;
    drawCharHSL(d.ch, dpx, dpy, dHue, dSat, dLit);
  }

  // Draw hand skeleton
  var numHands = Math.min(hands.length, smoothHands.length);
  for (var hi = 0; hi < numHands; hi++) {
    var sh = smoothHands[hi];
    if (!sh.landmarks) continue;

    // Skeleton bones
    for (var ci2 = 0; ci2 < HAND_CONNECTIONS.length; ci2++) {
      var ca = sh.landmarks[HAND_CONNECTIONS[ci2][0]];
      var cb = sh.landmarks[HAND_CONNECTIONS[ci2][1]];
      var ldx = cb.x - ca.x, ldy = cb.y - ca.y;
      var llen = Math.sqrt(ldx * ldx + ldy * ldy);
      var lsteps = Math.max(1, Math.ceil(llen * 1.5));
      for (var ls = 0; ls <= lsteps; ls++) {
        var lt = ls / lsteps;
        var lx = Math.round(ca.x + ldx * lt);
        var ly = Math.round(ca.y + ldy * lt);
        if (lx < 0 || lx >= W || ly < 0 || ly >= H) continue;
        drawCharHSL('-', lx, ly, 40, 50, 35);
      }
    }

    // Joint nodes
    for (var ji = 0; ji < 21; ji++) {
      var jx = Math.round(sh.landmarks[ji].x);
      var jy = Math.round(sh.landmarks[ji].y);
      if (jx >= 0 && jx < W && jy >= 0 && jy < H) {
        drawCharHSL('o', jx, jy, 30, 80, 50);
      }
    }
  }

  // Hint if no hands
  if (numHands === 0) {
    var hint = 'show your hand to smash';
    var hx = Math.floor((W - hint.length) / 2);
    var hy = Math.floor(H / 2);
    for (var hi2 = 0; hi2 < hint.length; hi2++) {
      drawCharHSL(hint[hi2], hx + hi2, hy, (t * 30 + hi2 * 10) % 360, 50, 25);
    }
  }

  // Bottom label
  var label = '[handsmash] move hand to repel the wrecking ball';
  var lx2 = Math.floor((W - label.length) / 2);
  if (lx2 < 0) lx2 = 0;
  for (var li = 0; li < label.length && lx2 + li < W; li++) {
    drawCharHSL(label[li], lx2 + li, H - 1, 20, 60, 30);
  }
}

registerMode('handsmash', { init: initHandsmash, render: renderHandsmash });
