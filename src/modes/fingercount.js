import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Fingercount — handpose interactive story/game
// Hold up the correct number of fingers to advance through 8 scenes

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-handpose@0.3.0/dist/index.js';

var handposeLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var vidCanvas = null;
var vidCtx = null;

var hands = [];
var detecting = false;
var frameCount = 0;
var detectInterval = 3;

// Finger count state
var currentFingerCount = -1;
var handX = 0.5;

// Scene system
var currentScene = 0;
var holdTimer = 0;
var holdRequired = 1.5;
var lastRenderTime = 0;
var sceneTransition = 0;
var transitionCol = 0;

// Stats
var startTime = 0;
var sceneStartTime = 0;
var fastestScene = Infinity;
var sceneTimes = [];

// Scene definitions: [requiredFingers, title, subtitle]
var scenes = [
  [1, 'THE GATEWAY', 'Hold up 1 finger to begin'],
  [2, 'THE LOCKED DOOR', 'Show 2 fingers to unlock'],
  [3, 'THE STORM', 'Show 3 fingers to summon lightning'],
  [0, 'THE WALL', 'Make a fist to smash through'],
  [5, 'FALLING STARS', 'Open hand to catch the stars'],
  [4, 'THE PORTAL', 'Show 4 fingers to activate'],
  [1, 'THE CROSSROADS', 'Point to choose your path'],
  [-1, 'FINALE', 'Any gesture to celebrate']
];

// ASCII art
var doorFrames = [
  ['  ########  ','  #      #  ','  #      #  ','  #   o  #  ','  #      #  ','  #      #  ','  ########  '],
  ['  ###  ###  ','  #      #  ','  #      #  ','       o    ','  #      #  ','  #      #  ','  ###  ###  '],
  ['  ##    ##  ','  #      #  ','            ','            ','            ','  #      #  ','  ##    ##  ']
];

var wallArt = [
  '################',
  '##  ##  ##  ####',
  '################',
  '###  ####  #####',
  '################',
  '##  ####  ##  ##',
  '################'
];

// Particles for effects
var particles = [];
var maxParticles = 60;

function initFingercount() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  currentFingerCount = -1;
  currentScene = 0;
  holdTimer = 0;
  sceneTransition = 0;
  transitionCol = 0;
  startTime = 0;
  sceneStartTime = 0;
  fastestScene = Infinity;
  sceneTimes = [];
  particles = [];
  lastRenderTime = 0;

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
  loadHandposeLib();
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

function loadHandposeLib() {
  if (handposeLib) { initDetector(); return; }
  if (!navigator.gpu) {
    loadError = 'no WebGPU - hand tracking unavailable';
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
  if (!detector || !webcamReady || detecting) return;
  if (webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    hands = result || [];
    if (hands.length > 0) {
      var hand = hands[0];
      var lm = hand.landmarks || hand.keypoints;
      if (lm && Array.isArray(lm)) {
        currentFingerCount = countFingers(lm);
        handX = 1 - lm[0].x;
      }
    } else {
      currentFingerCount = -1;
    }
    detecting = false;
  }).catch(function() {
    detecting = false;
  });
}

function countFingers(lm) {
  var count = 0;
  // Index: tip(8) vs pip(6)
  if (lm[8].y < lm[6].y) count++;
  // Middle: tip(12) vs pip(10)
  if (lm[12].y < lm[10].y) count++;
  // Ring: tip(16) vs pip(14)
  if (lm[16].y < lm[14].y) count++;
  // Pinky: tip(20) vs pip(18)
  if (lm[20].y < lm[18].y) count++;
  // Thumb: x distance of tip(4) from wrist(0) vs thumb_ip(3) from wrist(0)
  var thumbTipDist = Math.abs(lm[4].x - lm[0].x);
  var thumbBaseDist = Math.abs(lm[3].x - lm[0].x);
  if (thumbTipDist > thumbBaseDist + 0.02) count++;
  return count;
}

function drawText(text, startCol, row, hue, sat, light, alpha) {
  for (var i = 0; i < text.length; i++) {
    if (startCol + i >= 0 && startCol + i < state.COLS && row >= 0 && row < state.ROWS) {
      drawCharHSL(text[i], startCol + i, row, hue, sat, light, alpha);
    }
  }
}

function drawCenteredText(text, row, hue, sat, light, alpha) {
  var col = Math.floor((state.COLS - text.length) / 2);
  drawText(text, col, row, hue, sat, light, alpha);
}

function drawBigNumber(num, centerCol, centerRow, hue) {
  var digits = {
    0: ['#####','#   #','#   #','#   #','#####'],
    1: ['  #  ','  #  ','  #  ','  #  ','  #  '],
    2: ['#####','    #','#####','#    ','#####'],
    3: ['#####','    #','#####','    #','#####'],
    4: ['#   #','#   #','#####','    #','    #'],
    5: ['#####','#    ','#####','    #','#####']
  };
  var d = digits[num];
  if (!d) return;
  var sx = centerCol - 2;
  var sy = centerRow - 2;
  for (var r = 0; r < 5; r++) {
    for (var c = 0; c < 5; c++) {
      if (d[r][c] === '#') {
        var ch = '0123456789ABCDEF'[(num * 3 + r + c) % 16];
        drawCharHSL(ch, sx + c, sy + r, hue, 80, 55, 1.0);
      }
    }
  }
}

function spawnParticle(x, y, vx, vy, ch, hue) {
  if (particles.length >= maxParticles) particles.shift();
  particles.push({ x: x, y: y, vx: vx, vy: vy, ch: ch, hue: hue, life: 1.0 });
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 0.5;
    if (p.life <= 0 || p.x < 0 || p.x >= state.COLS || p.y < 0 || p.y >= state.ROWS) {
      particles.splice(i, 1);
    }
  }
}

function renderParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var col = Math.round(p.x);
    var row = Math.round(p.y);
    if (col >= 0 && col < state.COLS && row >= 0 && row < state.ROWS) {
      drawCharHSL(p.ch, col, row, p.hue, 70, 30 + p.life * 30, p.life);
    }
  }
}

// Scene-specific effects
function renderDoorEffect(W, H, t, progress) {
  var frameIdx = progress < 0.3 ? 0 : (progress < 0.7 ? 1 : 2);
  var frame = doorFrames[frameIdx];
  var startRow = Math.floor(H / 2) - 3;
  var startCol = Math.floor((W - 12) / 2);
  for (var r = 0; r < frame.length; r++) {
    for (var c = 0; c < frame[r].length; c++) {
      var ch = frame[r][c];
      if (ch !== ' ') {
        var hue = 270 + Math.sin(t * 2 + r * 0.5) * 20;
        drawCharHSL(ch, startCol + c, startRow + r, hue, 60, 35 + progress * 20, 1.0);
      }
    }
  }
}

function renderLightningEffect(W, H, t, progress) {
  for (var bolt = 0; bolt < 3; bolt++) {
    var bx = Math.floor(W * (0.2 + bolt * 0.3));
    var intensity = Math.sin(t * 8 + bolt * 2) * 0.5 + 0.5;
    if (intensity > 0.3) {
      var by = 2;
      for (var seg = 0; seg < H - 4; seg++) {
        bx += Math.floor(Math.random() * 3) - 1;
        if (bx < 0) bx = 0;
        if (bx >= W) bx = W - 1;
        by++;
        var boltChars = '|/\\-+*';
        var lch = boltChars[Math.floor(Math.random() * boltChars.length)];
        drawCharHSL(lch, bx, by, 240 + Math.random() * 40, 90, 50 + intensity * 30, intensity);
      }
    }
  }
  if (Math.random() < 0.05 * progress) {
    for (var fx = 0; fx < W; fx++) {
      for (var fy = 0; fy < H; fy++) {
        if (Math.random() < 0.02) {
          drawCharHSL('*', fx, fy, 200, 30, 70, 0.3);
        }
      }
    }
  }
}

function renderWallSmashEffect(W, H, t, progress) {
  var startRow = Math.floor(H / 2) - 3;
  var startCol = Math.floor((W - 16) / 2);
  for (var r = 0; r < wallArt.length; r++) {
    for (var c = 0; c < wallArt[r].length; c++) {
      var ch = wallArt[r][c];
      if (ch !== ' ') {
        var crumble = Math.random() < progress * 0.8;
        if (crumble) {
          if (Math.random() < 0.3) {
            spawnParticle(startCol + c, startRow + r, (Math.random() - 0.5) * 4, Math.random() * 3, ch, 0);
          }
        } else {
          var shake = progress > 0.3 ? (Math.random() - 0.5) * progress * 2 : 0;
          drawCharHSL(ch, startCol + c + Math.round(shake), startRow + r, 0, 50, 30, 1.0);
        }
      }
    }
  }
}

function renderStarsEffect(W, H, t, progress) {
  var starChars = '*+.oO';
  for (var s = 0; s < 15; s++) {
    var sx = Math.floor((Math.sin(t * 0.7 + s * 1.3) * 0.4 + 0.5) * W);
    var sy = Math.floor(((t * 0.3 + s * 0.15) % 1.0) * H);
    var sch = starChars[s % starChars.length];
    var shue = 40 + s * 20;
    drawCharHSL(sch, sx, sy, shue, 80, 50, 0.8);
    for (var tr = 1; tr < 4; tr++) {
      if (sy - tr >= 0) {
        drawCharHSL('.', sx, sy - tr, shue, 60, 30, 0.4 / tr);
      }
    }
  }
  if (progress > 0.2) {
    var catchY = Math.floor(H * 0.7);
    for (var cx = 0; cx < W; cx++) {
      if (Math.random() < 0.1 * progress) {
        drawCharHSL('~', cx, catchY, 50, 70, 40, 0.5);
      }
    }
  }
}

function renderPortalEffect(W, H, t, progress) {
  var cx = Math.floor(W / 2);
  var cy = Math.floor(H / 2);
  var radius = 3 + progress * 8;
  var portalChars = '@#%&*+=~';
  for (var angle = 0; angle < 360; angle += 8) {
    var rad = angle * Math.PI / 180;
    var rOscillate = radius + Math.sin(t * 3 + angle * 0.05) * 1.5;
    var px = Math.round(cx + Math.cos(rad + t * 2) * rOscillate * 0.6);
    var py = Math.round(cy + Math.sin(rad + t * 2) * rOscillate * 0.3);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var pch = portalChars[Math.floor((angle + t * 100) / 8) % portalChars.length];
      drawCharHSL(pch, px, py, 270 + angle * 0.3, 80, 40 + progress * 20, 0.8);
    }
  }
  if (progress > 0.5) {
    for (var ir = 0; ir < radius * 0.5; ir++) {
      var ia = t * 5 + ir * 40;
      var ix = Math.round(cx + Math.cos(ia) * ir * 0.4);
      var iy = Math.round(cy + Math.sin(ia) * ir * 0.2);
      if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
        drawCharHSL('*', ix, iy, 280, 90, 60, 0.6);
      }
    }
  }
}

function renderCrossroadsEffect(W, H, t, progress) {
  var cx = Math.floor(W / 2);
  for (var ly = Math.floor(H * 0.3); ly < Math.floor(H * 0.8); ly++) {
    var lx = cx - 10 - Math.floor((ly - H * 0.3) * 0.5);
    if (lx >= 0 && lx < W) {
      drawCharHSL('/', lx, ly, 240, 60, 35, 0.7);
      if (lx + 1 < W) drawCharHSL('/', lx + 1, ly, 240, 60, 35, 0.7);
    }
  }
  for (var ry = Math.floor(H * 0.3); ry < Math.floor(H * 0.8); ry++) {
    var rx = cx + 10 + Math.floor((ry - H * 0.3) * 0.5);
    if (rx >= 0 && rx < W) {
      drawCharHSL('\\', rx, ry, 0, 60, 35, 0.7);
      if (rx - 1 >= 0) drawCharHSL('\\', rx - 1, ry, 0, 60, 35, 0.7);
    }
  }
  var choiceX = handX < 0.5 ? cx - 15 : cx + 15;
  var arrow = handX < 0.5 ? '<---' : '--->';
  var arrowHue = handX < 0.5 ? 240 : 0;
  drawText(arrow, choiceX - 2, Math.floor(H * 0.5), arrowHue, 80, 55 + Math.sin(t * 4) * 10, 1.0);
  drawCenteredText(handX < 0.5 ? 'LEFT' : 'RIGHT', Math.floor(H * 0.5) + 2, arrowHue, 70, 45, 1.0);
}

function renderFinaleEffect(W, H, t, progress) {
  var fireworkChars = '*+.oO#@';
  for (var fw = 0; fw < 8; fw++) {
    var fwx = Math.floor((Math.sin(t * 0.5 + fw * 0.8) * 0.3 + 0.5) * W);
    var fwy = Math.floor((Math.cos(t * 0.3 + fw * 1.1) * 0.3 + 0.3) * H);
    var burstPhase = (t * 2 + fw) % 3;
    if (burstPhase < 1.5) {
      var burstR = burstPhase * 5;
      for (var ba = 0; ba < 12; ba++) {
        var brad = ba * Math.PI * 2 / 12;
        var bpx = Math.round(fwx + Math.cos(brad) * burstR * 0.6);
        var bpy = Math.round(fwy + Math.sin(brad) * burstR * 0.3);
        if (bpx >= 0 && bpx < W && bpy >= 0 && bpy < H) {
          var fch = fireworkChars[Math.floor(Math.random() * fireworkChars.length)];
          drawCharHSL(fch, bpx, bpy, (fw * 45 + ba * 30) % 360, 90, 55, 1.0 - burstPhase / 3);
        }
      }
    }
  }
}

function renderFingercount() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  var dt = lastRenderTime > 0 ? t - lastRenderTime : 0.016;
  if (dt > 0.1) dt = 0.016;
  lastRenderTime = t;

  // Loading state
  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading fingercount...';
    drawCenteredText(msg, Math.floor(H / 2), (t * 60) % 360, 60, 40, 1.0);
    var dots = '.'.repeat(1 + (Math.floor(t * 2) % 3));
    drawText(dots, Math.floor((W + msg.length) / 2), Math.floor(H / 2), 0, 0, 30, 1.0);
    return;
  }

  // Error state
  if (loadError || webcamDenied) {
    drawCenteredText(loadError || 'camera access denied', Math.floor(H / 2), 0, 70, 40, 1.0);
    return;
  }

  if (startTime === 0) {
    startTime = t;
    sceneStartTime = t;
  }

  // Detect hands
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) {
    detectHands();
  }

  updateParticles(dt);

  // Scene transition wipe
  if (sceneTransition > 0) {
    transitionCol += dt * W * 2;
    if (transitionCol >= W) {
      sceneTransition = 0;
      transitionCol = 0;
    }
    for (var wy = 0; wy < H; wy++) {
      for (var wx = 0; wx < Math.min(Math.floor(transitionCol), W); wx++) {
        drawCharHSL('|', wx, wy, 270, 60, 20, 0.4);
      }
    }
    return;
  }

  var scene = scenes[currentScene];
  var requiredFingers = scene[0];
  var title = scene[1];
  var subtitle = scene[2];

  // Background ambiance
  for (var by = 0; by < H; by++) {
    for (var bx = 0; bx < W; bx++) {
      if (Math.random() < 0.003) {
        var bgHue = 270 + Math.sin(t + bx * 0.1) * 30;
        drawCharHSL('.', bx, by, bgHue, 30, 10, 0.3);
      }
    }
  }

  // Scene title
  drawCenteredText('[ ' + title + ' ]', 2, 270, 70, 45, 1.0);
  drawCenteredText('Scene ' + (currentScene + 1) + '/8', 1, 270, 40, 30, 0.6);
  drawCenteredText(subtitle, 4, 200, 50, 40, 0.8);

  // Hand status
  if (currentFingerCount === -1) {
    drawCenteredText('[ HAND LOST ]', Math.floor(H / 2) + 6, 0, 80, 50, 0.5 + Math.sin(t * 4) * 0.3);
    holdTimer = 0;
  } else {
    // Big finger count display
    drawBigNumber(currentFingerCount, Math.floor(W * 0.85), 6, currentFingerCount === requiredFingers || requiredFingers === -1 ? 120 : 0);

    var correct = requiredFingers === -1 || currentFingerCount === requiredFingers;
    if (correct) {
      holdTimer += dt;
      if (Math.random() < 0.3) {
        spawnParticle(Math.random() * W, Math.random() * 3 + 1, (Math.random() - 0.5) * 2, Math.random() * 2, '*', 120);
      }
    } else {
      holdTimer = Math.max(0, holdTimer - dt * 2);
    }

    // Progress bar
    var barW = 30;
    var barX = Math.floor((W - barW) / 2);
    var barY = H - 3;
    var fillW = Math.floor((holdTimer / holdRequired) * barW);
    drawCharHSL('[', barX - 1, barY, 270, 40, 35, 1.0);
    drawCharHSL(']', barX + barW, barY, 270, 40, 35, 1.0);
    for (var bi = 0; bi < barW; bi++) {
      if (bi < fillW) {
        drawCharHSL('#', barX + bi, barY, 120, 70, 45, 1.0);
      } else {
        drawCharHSL('-', barX + bi, barY, 270, 30, 20, 0.5);
      }
    }

    // Scene complete
    if (holdTimer >= holdRequired) {
      var sceneTime = t - sceneStartTime;
      sceneTimes.push(sceneTime);
      if (sceneTime < fastestScene) fastestScene = sceneTime;

      if (currentScene < scenes.length - 1) {
        currentScene++;
        holdTimer = 0;
        sceneTransition = 1;
        transitionCol = 0;
        sceneStartTime = t;
      } else {
        var totalTime = t - startTime;
        drawCenteredText('=== COMPLETE ===', Math.floor(H / 2) - 2, 120, 80, 55, 1.0);
        drawCenteredText('Total: ' + totalTime.toFixed(1) + 's', Math.floor(H / 2), 60, 60, 45, 1.0);
        drawCenteredText('Fastest scene: ' + fastestScene.toFixed(1) + 's', Math.floor(H / 2) + 1, 180, 60, 45, 1.0);
        drawCenteredText('Scenes: ' + sceneTimes.length + '/8', Math.floor(H / 2) + 2, 270, 60, 45, 1.0);
      }
    }
  }

  // Scene-specific effects
  var progress = Math.min(holdTimer / holdRequired, 1.0);
  if (currentScene === 1) renderDoorEffect(W, H, t, progress);
  else if (currentScene === 2) renderLightningEffect(W, H, t, progress);
  else if (currentScene === 3) renderWallSmashEffect(W, H, t, progress);
  else if (currentScene === 4) renderStarsEffect(W, H, t, progress);
  else if (currentScene === 5) renderPortalEffect(W, H, t, progress);
  else if (currentScene === 6) renderCrossroadsEffect(W, H, t, progress);
  else if (currentScene === 7) renderFinaleEffect(W, H, t, progress);

  renderParticles();

  // Elapsed timer
  if (startTime > 0) {
    var elapsed = (t - startTime).toFixed(0);
    drawText(elapsed + 's', 1, H - 1, 270, 30, 25, 0.5);
  }
}

registerMode('fingercount', { init: initFingercount, render: renderFingercount });
