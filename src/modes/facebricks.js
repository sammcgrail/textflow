import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Facebricks — breakout/brick-breaker with webcam face tracking
// Face = paddle, bounce ball to destroy bricks

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

// Background text
var bgText = 'BREAK SMASH CRUSH SHATTER DEMOLISH BLAST BOOM CRACK DESTROY ';

// Game constants
var BRICK_ROWS = 6;
var BRICK_COLS = 10;
var ROW_HUES = [0, 30, 55, 140, 185, 230]; // red, orange, yellow, green, cyan, blue

// Shared state for R3F overlay
export var brickState = {
  bricks: [],
  ball: { x: 0.5, y: 0.85, vx: 0, vy: 0, radius: 0.012, launched: false },
  debris: [],
  score: 0,
  lives: 3,
  paddleX: 0.5,
  paddleWidth: 0.12,
  paddleY: 0.88,
  faceVisible: false,
  gameOver: false,
  won: false,
  level: 1,
  webcamVideo: null,
  faceBounds: { minX: 0.3, maxX: 0.7, minY: 0.3, maxY: 0.7 }
};

var ballSpeed = 0.006;
var lastPaddleX = 0.5;
var gameStarted = false;

function initBricks() {
  brickState.bricks = [];
  var bw = 1.0 / BRICK_COLS;
  var bh = 0.04;
  var topOffset = 0.05;
  for (var r = 0; r < BRICK_ROWS; r++) {
    for (var c = 0; c < BRICK_COLS; c++) {
      brickState.bricks.push({
        x: c * bw + bw * 0.05,
        y: topOffset + r * (bh + 0.01),
        width: bw * 0.9,
        height: bh,
        hue: ROW_HUES[r],
        alive: true,
        row: r,
        col: c
      });
    }
  }
}

function resetBall() {
  brickState.ball.x = brickState.paddleX;
  brickState.ball.y = brickState.paddleY - 0.03;
  brickState.ball.vx = 0;
  brickState.ball.vy = 0;
  brickState.ball.launched = false;
}

function launchBall() {
  if (brickState.ball.launched) return;
  var angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
  var speed = ballSpeed + (brickState.level - 1) * 0.001;
  brickState.ball.vx = Math.cos(angle) * speed;
  brickState.ball.vy = Math.sin(angle) * speed;
  brickState.ball.launched = true;
}

function initFacebricks() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  brickState.score = 0;
  brickState.lives = 3;
  brickState.faceVisible = false;
  brickState.gameOver = false;
  brickState.won = false;
  brickState.level = 1;
  brickState.debris = [];
  ballSpeed = 0.006;
  gameStarted = false;

  initBricks();
  resetBall();

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
      brickState.webcamVideo = webcamEl;
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
    brickState.faceVisible = false;
    return;
  }

  var face = faces[0];
  var lm = face.landmarks;
  if (!lm || lm.length < 468) {
    brickState.faceVisible = false;
    return;
  }

  // Compute face bounds (mirror X for selfie)
  var minX = 1, maxX = 0;
  for (var i = 0; i < lm.length; i++) {
    var mx = 1 - lm[i].x;
    if (mx < minX) minX = mx;
    if (mx > maxX) maxX = mx;
  }

  var faceWidth = maxX - minX;
  var faceCenterX = (minX + maxX) / 2;

  brickState.paddleX = faceCenterX;
  brickState.paddleWidth = Math.max(0.08, Math.min(0.2, faceWidth * 1.2));
  brickState.faceVisible = true;

  // Store face bounds for R3F face-paddle texture mapping
  var minY = 1, maxY = 0;
  for (var fi = 0; fi < lm.length; fi++) {
    var fy = lm[fi].y;
    if (fy < minY) minY = fy;
    if (fy > maxY) maxY = fy;
  }
  brickState.faceBounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };

  // Auto-launch ball on first face detection
  if (!gameStarted && !brickState.ball.launched) {
    gameStarted = true;
    // Small delay before launch
    lastPaddleX = faceCenterX;
  }

  // Launch ball when face moves enough
  if (gameStarted && !brickState.ball.launched && !brickState.gameOver) {
    var dx = Math.abs(faceCenterX - lastPaddleX);
    if (dx > 0.02) {
      launchBall();
    }
  }
}

function spawnDebris(brick) {
  var count = 4 + Math.floor(Math.random() * 3);
  for (var i = 0; i < count; i++) {
    if (brickState.debris.length >= 80) {
      // Remove oldest
      brickState.debris.shift();
    }
    brickState.debris.push({
      x: brick.x + brick.width * Math.random(),
      y: brick.y + brick.height * Math.random(),
      vx: (Math.random() - 0.5) * 0.008,
      vy: Math.random() * 0.005 + 0.002,
      hue: brick.hue,
      life: 40 + Math.floor(Math.random() * 20)
    });
  }
}

function updateBall() {
  var ball = brickState.ball;

  if (!ball.launched) {
    // Stick to paddle
    ball.x = brickState.paddleX;
    ball.y = brickState.paddleY - 0.03;
    return;
  }

  // Move ball
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Wall collisions
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
  }
  if (ball.x + ball.radius > 1) {
    ball.x = 1 - ball.radius;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
  }

  // Paddle collision
  var pw = brickState.paddleWidth / 2;
  var px = brickState.paddleX;
  var py = brickState.paddleY;
  if (ball.vy > 0 &&
      ball.y + ball.radius >= py - 0.015 &&
      ball.y + ball.radius <= py + 0.02 &&
      ball.x >= px - pw && ball.x <= px + pw) {
    ball.vy = -Math.abs(ball.vy);
    // Angle based on where ball hits paddle
    var hitPos = (ball.x - (px - pw)) / (pw * 2); // 0 to 1
    var angle = -Math.PI * 0.15 - hitPos * Math.PI * 0.7; // -15deg to -165deg
    var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
  }

  // Brick collisions
  var bricks = brickState.bricks;
  for (var i = 0; i < bricks.length; i++) {
    var b = bricks[i];
    if (!b.alive) continue;

    // AABB collision
    if (ball.x + ball.radius > b.x &&
        ball.x - ball.radius < b.x + b.width &&
        ball.y + ball.radius > b.y &&
        ball.y - ball.radius < b.y + b.height) {
      b.alive = false;
      brickState.score += 10;
      spawnDebris(b);

      // Determine reflection direction
      var overlapLeft = (ball.x + ball.radius) - b.x;
      var overlapRight = (b.x + b.width) - (ball.x - ball.radius);
      var overlapTop = (ball.y + ball.radius) - b.y;
      var overlapBottom = (b.y + b.height) - (ball.y - ball.radius);
      var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.vx = -ball.vx;
      } else {
        ball.vy = -ball.vy;
      }

      // Speed up slightly
      var currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      var newSpeed = currentSpeed * 1.005;
      var ratio = newSpeed / currentSpeed;
      ball.vx *= ratio;
      ball.vy *= ratio;

      break; // One collision per frame
    }
  }

  // Ball fell below paddle — lose life
  if (ball.y > 1.05) {
    brickState.lives--;
    if (brickState.lives <= 0) {
      brickState.gameOver = true;
    } else {
      resetBall();
    }
  }

  // Win check
  var allDead = true;
  for (var j = 0; j < bricks.length; j++) {
    if (bricks[j].alive) { allDead = false; break; }
  }
  if (allDead) {
    brickState.won = true;
    brickState.level++;
    ballSpeed += 0.001;
    initBricks();
    resetBall();
    // Brief won state — auto-continues
    setTimeout(function() { brickState.won = false; }, 1500);
  }
}

function updateDebris() {
  for (var i = brickState.debris.length - 1; i >= 0; i--) {
    var d = brickState.debris[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 0.0003; // gravity
    d.life--;
    if (d.life <= 0) {
      brickState.debris.splice(i, 1);
    }
  }
}

function renderFacebricks() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facebricks...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      var hue = (t * 60 + i * 15) % 360;
      drawCharHSL(msg[i], mx + i, my, hue, 60, 40);
    }
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
    return;
  }

  // Detect faces
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectFaces();
  }

  // Update game state
  updateFaceState();
  if (!brickState.gameOver) {
    updateBall();
  }
  updateDebris();

  // Build brick occupancy set for text wrapping
  var brickOccupied = new Uint8Array(W * H);
  var bricks = brickState.bricks;
  for (var bi = 0; bi < bricks.length; bi++) {
    var br = bricks[bi];
    if (!br.alive) continue;
    var bx1 = Math.floor(br.x * W);
    var bx2 = Math.ceil((br.x + br.width) * W);
    var by1 = Math.floor(br.y * H);
    var by2 = Math.ceil((br.y + br.height) * H);
    for (var by = by1; by < by2 && by < H; by++) {
      for (var bx = bx1; bx < bx2 && bx < W; bx++) {
        if (bx >= 0) brickOccupied[by * W + bx] = 1;
      }
    }
  }

  // Paddle grid region
  var paddleLeft = Math.floor((brickState.paddleX - brickState.paddleWidth / 2) * W);
  var paddleRight = Math.ceil((brickState.paddleX + brickState.paddleWidth / 2) * W);
  var paddleRow = Math.floor(brickState.paddleY * H);

  // Ball grid position
  var ballGX = Math.floor(brickState.ball.x * W);
  var ballGY = Math.floor(brickState.ball.y * H);
  var ballGR = Math.ceil(brickState.ball.radius * Math.max(W, H));

  // Render background text
  var ci = Math.floor(t * 2) % bgText.length;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Skip brick areas
      if (brickOccupied[y * W + x]) continue;

      // Skip paddle area
      if (y >= paddleRow - 1 && y <= paddleRow + 1 && x >= paddleLeft && x <= paddleRight) continue;

      // Skip ball area
      var bdx = x - ballGX, bdy = y - ballGY;
      if (bdx * bdx + bdy * bdy <= (ballGR + 1) * (ballGR + 1)) continue;

      var ch = bgText[ci % bgText.length];
      ci++;
      if (ch === ' ') continue;

      var bgHue = (200 + Math.sin(t * 0.3 + y * 0.1) * 30) % 360;
      var bgLit = 12 + Math.sin(t * 0.2 + x * 0.04 + y * 0.06) * 4;
      drawCharHSL(ch, x, y, bgHue, 40, bgLit);
    }
  }

  // Render bricks as ASCII
  for (var ri = 0; ri < bricks.length; ri++) {
    var brick = bricks[ri];
    if (!brick.alive) continue;
    var x1 = Math.floor(brick.x * W);
    var x2 = Math.ceil((brick.x + brick.width) * W);
    var y1 = Math.floor(brick.y * H);
    var y2 = Math.ceil((brick.y + brick.height) * H);
    for (var ry = y1; ry < y2 && ry < H; ry++) {
      for (var rx = x1; rx < x2 && rx < W; rx++) {
        if (rx < 0) continue;
        var isEdge = (ry === y1 || ry === y2 - 1 || rx === x1 || rx === x2 - 1);
        var bChar = isEdge ? '#' : '=';
        var bLit = isEdge ? 50 : 40;
        var bSat = isEdge ? 80 : 60;
        drawCharHSL(bChar, rx, ry, brick.hue, bSat, bLit);
      }
    }
  }

  // Render paddle shadow (subtle — R3F renders the face cuboid paddle)
  for (var px = paddleLeft; px <= paddleRight && px < W; px++) {
    if (px < 0) continue;
    drawCharHSL('.', px, paddleRow, 50, 30, 15);
  }

  // Render ball
  if (ballGX >= 0 && ballGX < W && ballGY >= 0 && ballGY < H) {
    drawCharHSL('O', ballGX, ballGY, 60, 100, 70);
    // Glow around ball
    var glowChars = ['.', '*', '.', '*'];
    var gOffsets = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var gi = 0; gi < gOffsets.length; gi++) {
      var gx = ballGX + gOffsets[gi][0];
      var gy = ballGY + gOffsets[gi][1];
      if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
        drawCharHSL(glowChars[gi], gx, gy, 55, 80, 45);
      }
    }
  }

  // Render debris
  for (var di = 0; di < brickState.debris.length; di++) {
    var db = brickState.debris[di];
    var dgx = Math.floor(db.x * W);
    var dgy = Math.floor(db.y * H);
    if (dgx >= 0 && dgx < W && dgy >= 0 && dgy < H) {
      var alpha = db.life / 50;
      drawCharHSL('*', dgx, dgy, db.hue, 70, 20 + alpha * 40);
    }
  }

  // Score display — top right
  var scoreStr = 'SCORE: ' + brickState.score;
  var sx = W - scoreStr.length - 2;
  for (var si = 0; si < scoreStr.length; si++) {
    drawCharHSL(scoreStr[si], sx + si, 1, 60, 80, 55);
  }

  // Lives display — top left
  var livesStr = 'LIVES: ';
  for (var li = 0; li < brickState.lives; li++) {
    livesStr += '<3 ';
  }
  for (var lci = 0; lci < livesStr.length; lci++) {
    drawCharHSL(livesStr[lci], 2 + lci, 1, 0, 80, 55);
  }

  // Level display
  var levelStr = 'LVL ' + brickState.level;
  var lx = Math.floor((W - levelStr.length) / 2);
  for (var lvi = 0; lvi < levelStr.length; lvi++) {
    drawCharHSL(levelStr[lvi], lx + lvi, 1, 180, 70, 50);
  }

  // Game over overlay
  if (brickState.gameOver) {
    var goMsg = 'GAME OVER';
    var goMsg2 = 'SCORE: ' + brickState.score;
    var goMsg3 = 'move face to restart';
    var goX = Math.floor((W - goMsg.length) / 2);
    var goY = Math.floor(H / 2) - 1;
    for (var goi = 0; goi < goMsg.length; goi++) {
      drawCharHSL(goMsg[goi], goX + goi, goY, (t * 40 + goi * 20) % 360, 90, 55);
    }
    var goX2 = Math.floor((W - goMsg2.length) / 2);
    for (var go2i = 0; go2i < goMsg2.length; go2i++) {
      drawCharHSL(goMsg2[go2i], goX2 + go2i, goY + 2, 60, 80, 50);
    }
    var goX3 = Math.floor((W - goMsg3.length) / 2);
    for (var go3i = 0; go3i < goMsg3.length; go3i++) {
      drawCharHSL(goMsg3[go3i], goX3 + go3i, goY + 4, 0, 0, 35);
    }

    // Auto-restart on face movement
    if (brickState.faceVisible) {
      brickState.gameOver = false;
      brickState.score = 0;
      brickState.lives = 3;
      brickState.level = 1;
      ballSpeed = 0.006;
      initBricks();
      resetBall();
    }
  }

  // Win flash
  if (brickState.won) {
    var winMsg = 'LEVEL ' + (brickState.level - 1) + ' COMPLETE!';
    var winX = Math.floor((W - winMsg.length) / 2);
    var winY = Math.floor(H / 2);
    for (var wi = 0; wi < winMsg.length; wi++) {
      drawCharHSL(winMsg[wi], winX + wi, winY, (t * 80 + wi * 30) % 360, 100, 60);
    }
  }
}

registerMode('facebricks', { init: initFacebricks, render: renderFacebricks });
