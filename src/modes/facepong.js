import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Facepong — Atari-style pong where your face morphs into the paddle
// Uses @svenflow/micro-facemesh (WebGPU, 478 landmarks per face)

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.js';

var facemeshLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

// Face data
var faces = [];
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Flowing background text
var bgText = 'PONG FACE SMASH VOLLEY SERVE ACE RALLY MATCH GAME SET POINT ';

// Face silhouette landmark indices (jawline + forehead outline)
var FACE_OUTLINE = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Game state
var ball = { x: 0, y: 0, vx: 0, vy: 0 };
var playerScore = 0;
var cpuScore = 0;
var playerPaddleY = 0.5;
var cpuPaddleY = 0.5;
var cpuPaddleTarget = 0.5;
var paddleOutline = []; // face contour points mapped to grid
var gameOver = false;
var gameOverTimer = 0;
var rallyCount = 0;
var ballSpeed = 0;
var WIN_SCORE = 11;
var servePause = 0;

// Big ASCII digit patterns (5x5)
var DIGITS = [
  [' ### ','#   #','#   #','#   #',' ### '], // 0
  ['  #  ',' ##  ','  #  ','  #  ',' ### '], // 1
  [' ### ','    #',' ### ','#    ',' ### '], // 2
  [' ### ','    #',' ### ','    #',' ### '], // 3
  ['#   #','#   #',' ### ','    #','    #'], // 4
  [' ### ','#    ',' ### ','    #',' ### '], // 5
  [' ### ','#    ',' ### ','#   #',' ### '], // 6
  [' ### ','    #','   # ','  #  ','  #  '], // 7
  [' ### ','#   #',' ### ','#   #',' ### '], // 8
  [' ### ','#   #',' ### ','    #',' ### '], // 9
  [' # # ',' #   ',' # # ','   # ',' # # '], // 10 placeholder (not used — we show two digits)
];

function resetBall(direction) {
  ball.x = 0.5;
  ball.y = 0.3 + Math.random() * 0.4;
  var angle = (Math.random() * 0.8 - 0.4); // -0.4 to 0.4 radians from horizontal
  ballSpeed = 0.006;
  ball.vx = Math.cos(angle) * ballSpeed * direction;
  ball.vy = Math.sin(angle) * ballSpeed;
  rallyCount = 0;
  servePause = 1.0; // 1 second pause before ball moves
}

function initFacepong() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  faces = [];
  playerScore = 0;
  cpuScore = 0;
  playerPaddleY = 0.5;
  cpuPaddleY = 0.5;
  cpuPaddleTarget = 0.5;
  paddleOutline = [];
  gameOver = false;
  gameOverTimer = 0;

  resetBall(1);

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

function updateFaceData(W, H) {
  if (faces.length === 0) {
    // No face — use fallback paddle at last known position
    paddleOutline = [];
    return;
  }

  var face = faces[0];
  var lm = face.landmarks;
  if (!lm || lm.length < 468) {
    paddleOutline = [];
    return;
  }

  // Get face center Y (mirrored X for selfie)
  var minY = 1, maxY = 0;
  for (var i = 0; i < lm.length; i++) {
    var my = lm[i].y;
    if (my < minY) minY = my;
    if (my > maxY) maxY = my;
  }
  playerPaddleY = (minY + maxY) / 2;

  // Build face outline in grid coords for paddle shape
  // Map outline landmarks to relative positions from face center
  var faceCenterY = playerPaddleY;
  var faceHeight = maxY - minY;

  paddleOutline = [];
  for (var oi = 0; oi < FACE_OUTLINE.length; oi++) {
    var idx = FACE_OUTLINE[oi];
    if (idx >= lm.length) continue;
    var ly = lm[idx].y;
    var lx = 1 - lm[idx].x; // mirror X
    // Store relative Y offset from center and the X spread
    paddleOutline.push({
      relY: (ly - faceCenterY) / (faceHeight > 0 ? faceHeight : 0.2),
      x: lx
    });
  }

  // Sort by relY for rendering
  paddleOutline.sort(function(a, b) { return a.relY - b.relY; });
}

function updateGame(dt) {
  if (gameOver) {
    gameOverTimer += dt;
    if (gameOverTimer > 4) {
      // Reset game
      playerScore = 0;
      cpuScore = 0;
      gameOver = false;
      gameOverTimer = 0;
      resetBall(1);
    }
    return;
  }

  // Serve pause
  if (servePause > 0) {
    servePause -= dt;
    return;
  }

  // Move ball (sub-step to prevent pass-through at high speed)
  var steps = Math.max(1, Math.ceil(Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy) / 0.008));
  var svx = ball.vx / steps;
  var svy = ball.vy / steps;
  for (var step = 0; step < steps; step++) {
    ball.x += svx;
    ball.y += svy;
  }

  // Bounce off top/bottom walls
  if (ball.y <= 0.02) {
    ball.y = 0.02;
    ball.vy = Math.abs(ball.vy);
  }
  if (ball.y >= 0.98) {
    ball.y = 0.98;
    ball.vy = -Math.abs(ball.vy);
  }

  // Paddle dimensions in normalized coords
  var paddleHalfH = 0.10; // half-height of paddle (forgiving)
  var playerPaddleX = 0.08; // left paddle X position
  var cpuPaddleX = 0.92;   // right paddle X position
  var paddleThick = 0.035;  // paddle thickness (wider collision zone)

  // Ball vs player paddle (left) — wider check to prevent pass-through at speed
  if (ball.vx < 0 && ball.x <= playerPaddleX + paddleThick && ball.x >= playerPaddleX - 0.03) {
    var relHit = (ball.y - playerPaddleY) / paddleHalfH;
    if (Math.abs(relHit) <= 1.0) {
      ball.x = playerPaddleX + paddleThick;
      ball.vx = Math.abs(ball.vx);
      // Angle based on where it hit the paddle
      var angle = relHit * 0.7; // max ~40 degrees
      rallyCount++;
      ballSpeed = Math.min(0.015, 0.006 + rallyCount * 0.0005);
      var speed = ballSpeed;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.sin(angle) * speed;
    }
  }

  // Ball vs CPU paddle (right)
  if (ball.vx > 0 && ball.x >= cpuPaddleX - paddleThick && ball.x <= cpuPaddleX + 0.03) {
    var relHit2 = (ball.y - cpuPaddleY) / paddleHalfH;
    if (Math.abs(relHit2) <= 1.0) {
      ball.x = cpuPaddleX - paddleThick;
      ball.vx = -Math.abs(ball.vx);
      var angle2 = relHit2 * 0.7;
      rallyCount++;
      ballSpeed = Math.min(0.015, 0.006 + rallyCount * 0.0005);
      var speed2 = ballSpeed;
      ball.vx = -Math.cos(angle2) * speed2;
      ball.vy = Math.sin(angle2) * speed2;
    }
  }

  // Scoring
  if (ball.x < 0) {
    cpuScore++;
    if (cpuScore >= WIN_SCORE) {
      gameOver = true;
      gameOverTimer = 0;
    } else {
      resetBall(1);
    }
  }
  if (ball.x > 1) {
    playerScore++;
    if (playerScore >= WIN_SCORE) {
      gameOver = true;
      gameOverTimer = 0;
    } else {
      resetBall(-1);
    }
  }

  // CPU AI — track ball with delay and error
  if (ball.vx > 0) {
    // Ball coming toward CPU — track it
    cpuPaddleTarget = ball.y + (Math.random() - 0.5) * 0.03;
  } else {
    // Ball going away — drift toward center
    cpuPaddleTarget = 0.5 + (Math.random() - 0.5) * 0.1;
  }

  // CPU movement speed — 70% of ball speed, gets better as player scores more
  var cpuSpeedMult = 0.7 + playerScore * 0.02;
  var cpuMoveSpeed = ballSpeed * cpuSpeedMult * 0.8;
  var cpuDiff = cpuPaddleTarget - cpuPaddleY;
  if (Math.abs(cpuDiff) > cpuMoveSpeed) {
    cpuPaddleY += cpuMoveSpeed * (cpuDiff > 0 ? 1 : -1);
  } else {
    cpuPaddleY = cpuPaddleTarget;
  }
  cpuPaddleY = Math.max(0.1, Math.min(0.9, cpuPaddleY));
}

function drawDigit(digit, startCol, startRow, W, H, hue, sat, lit) {
  if (digit < 0 || digit > 9) return;
  var pattern = DIGITS[digit];
  for (var row = 0; row < pattern.length; row++) {
    var line = pattern[row];
    for (var col = 0; col < line.length; col++) {
      var ch = line[col];
      if (ch !== ' ') {
        var gc = startCol + col;
        var gr = startRow + row;
        if (gc >= 0 && gc < W && gr >= 0 && gr < H) {
          drawCharHSL(ch, gc, gr, hue, sat, lit);
        }
      }
    }
  }
}

function drawScore(score, centerCol, startRow, W, H, hue) {
  if (score < 10) {
    drawDigit(score, centerCol - 2, startRow, W, H, hue, 70, 55);
  } else {
    var tens = Math.floor(score / 10);
    var ones = score % 10;
    drawDigit(tens, centerCol - 5, startRow, W, H, hue, 70, 55);
    drawDigit(ones, centerCol + 1, startRow, W, H, hue, 70, 55);
  }
}

function renderFacepong() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading facepong...';
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

  // Update face data
  updateFaceData(W, H);

  // Update game logic
  var dt = 1 / 60; // approximate
  updateGame(dt);

  // Build a set of game element cells for overlay
  // We'll render background first, then overlay game elements

  // Create game mask — 0 = background, 1 = game element
  // For performance, we just track which cells are game elements during render

  // --- Background flowing text ---
  var ci = Math.floor(t * 2) % bgText.length;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var bgCh = bgText[ci % bgText.length];
      ci++;
      if (bgCh === ' ') continue;
      var bgHue = (200 + Math.sin(t * 0.3 + y * 0.1) * 30) % 360;
      var bgLit = 10 + Math.sin(t * 0.2 + x * 0.04 + y * 0.06) * 4;
      drawCharHSL(bgCh, x, y, bgHue, 30, Math.max(5, bgLit));
    }
  }

  // --- Center line (dotted) ---
  var centerCol = Math.floor(W / 2);
  for (var cy = 0; cy < H; cy++) {
    if (cy % 3 !== 0) continue; // dotted pattern
    drawCharHSL(':', centerCol, cy, 0, 0, 30);
  }

  // --- Top/bottom walls ---
  for (var wx = 0; wx < W; wx++) {
    drawCharHSL('=', wx, 0, 0, 0, 35);
    drawCharHSL('=', wx, H - 1, 0, 0, 35);
  }

  // --- Score display ---
  var scoreRow = 2;
  var leftScoreCol = Math.floor(W * 0.25);
  var rightScoreCol = Math.floor(W * 0.75);

  drawScore(playerScore, leftScoreCol, scoreRow, W, H, 30);
  drawScore(cpuScore, rightScoreCol, scoreRow, W, H, 200);

  // Labels
  var playerLabel = 'PLAYER';
  var cpuLabel = 'CPU';
  var plx = leftScoreCol - Math.floor(playerLabel.length / 2);
  var clx = rightScoreCol - Math.floor(cpuLabel.length / 2);
  for (var li = 0; li < playerLabel.length; li++) {
    if (plx + li >= 0 && plx + li < W) {
      drawCharHSL(playerLabel[li], plx + li, scoreRow + 6, 30, 50, 40);
    }
  }
  for (var cli = 0; cli < cpuLabel.length; cli++) {
    if (clx + cli >= 0 && clx + cli < W) {
      drawCharHSL(cpuLabel[cli], clx + cli, scoreRow + 6, 200, 50, 40);
    }
  }

  // --- Player paddle (face-shaped) ---
  var paddleCol = Math.floor(W * 0.08); // left side ~column 6-8
  var paddleCenterRow = Math.floor(playerPaddleY * H);
  var paddleHalfRows = 6; // ~12 rows tall

  if (paddleOutline.length > 0) {
    // Face-shaped paddle — use outline points
    // Group outline points by row and find min/max X for each
    var rowBuckets = {};
    for (var pi = 0; pi < paddleOutline.length; pi++) {
      var pt = paddleOutline[pi];
      var row = paddleCenterRow + Math.round(pt.relY * paddleHalfRows * 2);
      if (row < 1 || row >= H - 1) continue;
      if (!rowBuckets[row]) rowBuckets[row] = [];
      rowBuckets[row].push(pt.x);
    }

    // Render face paddle
    var paddleChars = '(){}[]|/\\<>';
    for (var rowKey in rowBuckets) {
      var r = parseInt(rowKey);
      var xs = rowBuckets[r];
      var minX = 1, maxX = 0;
      for (var xi = 0; xi < xs.length; xi++) {
        if (xs[xi] < minX) minX = xs[xi];
        if (xs[xi] > maxX) maxX = xs[xi];
      }
      // Map face width to paddle width (2-4 cols)
      var faceWidth = maxX - minX;
      var paddleWidth = Math.max(2, Math.min(5, Math.round(faceWidth * W * 0.15)));

      for (var pc = 0; pc < paddleWidth; pc++) {
        var col = paddleCol - Math.floor(paddleWidth / 2) + pc;
        if (col < 0 || col >= W) continue;
        var pch = paddleChars[(r + pc) % paddleChars.length];
        var dist = Math.abs(r - paddleCenterRow) / paddleHalfRows;
        var pHue = 30;
        var pSat = 60 + (1 - dist) * 20;
        var pLit = 55 + (1 - dist) * 20;
        drawCharHSL(pch, col, r, pHue, pSat, pLit);
      }
    }
  } else {
    // Fallback — simple rectangular paddle
    for (var pr = -paddleHalfRows; pr <= paddleHalfRows; pr++) {
      var row = paddleCenterRow + pr;
      if (row < 1 || row >= H - 1) continue;
      for (var pc2 = 0; pc2 < 3; pc2++) {
        var col2 = paddleCol - 1 + pc2;
        if (col2 < 0 || col2 >= W) continue;
        var ch2 = pc2 === 0 ? '[' : (pc2 === 2 ? ']' : '#');
        drawCharHSL(ch2, col2, row, 30, 70, 60);
      }
    }
  }

  // --- CPU paddle (simple rectangle, cyan) ---
  var cpuCol = Math.floor(W * 0.92);
  var cpuCenterRow = Math.floor(cpuPaddleY * H);
  for (var cr = -paddleHalfRows; cr <= paddleHalfRows; cr++) {
    var crow = cpuCenterRow + cr;
    if (crow < 1 || crow >= H - 1) continue;
    for (var cc = 0; cc < 3; cc++) {
      var ccol = cpuCol - 1 + cc;
      if (ccol < 0 || ccol >= W) continue;
      var cch = cc === 0 ? '[' : (cc === 2 ? ']' : '#');
      var cdist = Math.abs(cr) / paddleHalfRows;
      drawCharHSL(cch, ccol, crow, 190, 70, 45 + (1 - cdist) * 25);
    }
  }

  // --- Ball ---
  if (!gameOver && servePause <= 0) {
    var bCol = Math.floor(ball.x * W);
    var bRow = Math.floor(ball.y * H);
    if (bCol >= 0 && bCol < W && bRow >= 0 && bRow < H) {
      // Ball with glow
      drawCharHSL('O', bCol, bRow, 55, 90, 75);
      // Small glow around ball
      var glowChars = '.+*';
      for (var gd = -1; gd <= 1; gd++) {
        for (var ge = -1; ge <= 1; ge++) {
          if (gd === 0 && ge === 0) continue;
          var gx = bCol + ge;
          var gy = bRow + gd;
          if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
            drawCharHSL('.', gx, gy, 50, 60, 40);
          }
        }
      }
    }
  } else if (servePause > 0) {
    // Show ball at center, blinking
    var bCol2 = Math.floor(ball.x * W);
    var bRow2 = Math.floor(ball.y * H);
    if (bCol2 >= 0 && bCol2 < W && bRow2 >= 0 && bRow2 < H) {
      if (Math.floor(t * 4) % 2 === 0) {
        drawCharHSL('O', bCol2, bRow2, 55, 90, 65);
      }
    }
  }

  // --- Game over text ---
  if (gameOver) {
    var winner = playerScore >= WIN_SCORE ? 'YOU WIN!' : 'CPU WINS!';
    var winHue = playerScore >= WIN_SCORE ? 120 : 0;
    var wmx = Math.floor((W - winner.length) / 2);
    var wmy = Math.floor(H / 2);
    for (var wi = 0; wi < winner.length; wi++) {
      if (wmx + wi >= 0 && wmx + wi < W) {
        drawCharHSL(winner[wi], wmx + wi, wmy, winHue, 80, 55 + Math.sin(t * 5 + wi) * 15);
      }
    }
    var restart = 'restarting...';
    var rmx = Math.floor((W - restart.length) / 2);
    for (var ri = 0; ri < restart.length; ri++) {
      if (rmx + ri >= 0 && rmx + ri < W) {
        drawCharHSL(restart[ri], rmx + ri, wmy + 2, 0, 0, 35);
      }
    }
  }
}

registerMode('facepong', { init: initFacepong, render: renderFacepong });
