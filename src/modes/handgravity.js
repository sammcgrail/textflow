import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Hand Gravity Well — hands act as gravity sources
// Floating ASCII particles orbit around hand positions
// Particles absorbed when too close (flash + respawn)
// Multiple hands = multiple wells with particle transfer
// Trails show orbital paths

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-handpose@0.3.0/dist/index.js';

var handposeLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loading = true;

var detecting = false;
var DETECT_INTERVAL_MS = 50;
var detectionLoopStarted = false;

var hands = [];
var smoothHands = [];

// Gravity particles
var MAX_PARTICLES = 250;
var particles = [];
var particlesInited = false;

// Trail buffer
var trailGrid = null;
var trailW = 0;
var trailH = 0;

// Flash effects for absorbed particles
var MAX_FLASHES = 30;
var flashes = [];

// Particle characters
var ORBIT_CHARS = '.:-=+*#%@$&';

// Hand skeleton connections (21 MediaPipe landmarks)
var HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

function initHandgravity() {
  loading = true;
  loadError = null;
  webcamDenied = false;
  hands = [];
  smoothHands = [];
  particles = [];
  particlesInited = false;
  trailGrid = null;
  flashes = [];

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

function startDetectionLoop() {
  if (detectionLoopStarted) return;
  detectionLoopStarted = true;
  function loop() {
    if (!detector || !webcamReady) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    if (detecting) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    if (webcamEl.readyState < 2) {
      setTimeout(loop, DETECT_INTERVAL_MS);
      return;
    }
    detecting = true;
    detector.detect(webcamEl).then(function(result) {
      hands = result || [];
      updateSmoothedHands();
      detecting = false;
      setTimeout(loop, DETECT_INTERVAL_MS);
    }).catch(function() {
      detecting = false;
      setTimeout(loop, DETECT_INTERVAL_MS);
    });
  }
  setTimeout(loop, 0);
}

function updateSmoothedHands() {
  var W = state.COLS, H = state.ROWS;

  while (smoothHands.length < hands.length) {
    var lmArr = [];
    for (var li = 0; li < 21; li++) lmArr.push({ x: W * 0.5, y: H * 0.5 });
    smoothHands.push({ cx: W * 0.5, cy: H * 0.5, landmarks: lmArr });
  }

  for (var hi = 0; hi < hands.length; hi++) {
    var hand = hands[hi];
    var lm = hand.landmarks;
    if (!lm || lm.length < 21) continue;

    // Palm center: average of wrist(0) and middle MCP(9)
    var pcx = ((1 - lm[0].x) + (1 - lm[9].x)) * 0.5 * W;
    var pcy = (lm[0].y + lm[9].y) * 0.5 * H;

    var sh = smoothHands[hi];
    sh.cx = sh.cx * 0.4 + pcx * 0.6;
    sh.cy = sh.cy * 0.4 + pcy * 0.6;

    // Store full landmarks for skeleton overlay
    for (var li = 0; li < 21; li++) {
      var tx = (1 - lm[li].x) * W;
      var ty = lm[li].y * H;
      sh.landmarks[li].x = sh.landmarks[li].x * 0.4 + tx * 0.6;
      sh.landmarks[li].y = sh.landmarks[li].y * 0.4 + ty * 0.6;
    }
  }
}

function initParticles(W, H) {
  particles = [];
  for (var i = 0; i < MAX_PARTICLES; i++) {
    particles.push(spawnParticle(W, H));
  }
  particlesInited = true;
}

function spawnParticle(W, H) {
  var angle = Math.random() * 6.283;
  var speed = 0.3 + Math.random() * 1.5;
  return {
    x: Math.random() * W,
    y: Math.random() * H,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue: Math.random() * 360,
    mass: 0.5 + Math.random() * 1.5,
    ch: ORBIT_CHARS[Math.floor(Math.random() * ORBIT_CHARS.length)]
  };
}

function respawnParticle(p, W, H) {
  // Respawn at edges
  var side = Math.floor(Math.random() * 4);
  if (side === 0) { p.x = 0; p.y = Math.random() * H; }
  else if (side === 1) { p.x = W - 1; p.y = Math.random() * H; }
  else if (side === 2) { p.x = Math.random() * W; p.y = 0; }
  else { p.x = Math.random() * W; p.y = H - 1; }
  var angle = Math.random() * 6.283;
  var speed = 0.3 + Math.random() * 1.5;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.hue = Math.random() * 360;
  p.ch = ORBIT_CHARS[Math.floor(Math.random() * ORBIT_CHARS.length)];
}

function updateGravity(dt) {
  var W = state.COLS, H = state.ROWS;
  var numWells = Math.min(hands.length, smoothHands.length);
  var GRAVITY_STRENGTH = 80;
  var ABSORB_RADIUS = 2.5;
  var MAX_SPEED = 8;

  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var totalFx = 0, totalFy = 0;

    for (var wi = 0; wi < numWells; wi++) {
      var well = smoothHands[wi];
      var dx = well.cx - p.x;
      var dy = well.cy - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ABSORB_RADIUS) {
        // Absorbed — flash and respawn
        flashes.push({
          x: Math.round(p.x), y: Math.round(p.y),
          life: 0.3, age: 0, hue: p.hue
        });
        if (flashes.length > MAX_FLASHES) flashes.shift();
        respawnParticle(p, W, H);
        break;
      }

      if (dist < 1) dist = 1;

      // Gravitational force: F = G * m / r^2, capped
      var force = GRAVITY_STRENGTH * p.mass / (dist * dist);
      force = Math.min(force, 10);
      totalFx += (dx / dist) * force;
      totalFy += (dy / dist) * force;
    }

    // Apply force
    p.vx += totalFx * dt;
    p.vy += totalFy * dt;

    // Speed limit
    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > MAX_SPEED) {
      p.vx = (p.vx / speed) * MAX_SPEED;
      p.vy = (p.vy / speed) * MAX_SPEED;
    }

    // Gentle drag
    p.vx *= 0.998;
    p.vy *= 0.998;

    // Move
    p.x += p.vx * dt * 10;
    p.y += p.vy * dt * 10;

    // Wrap around screen
    if (p.x < -2) p.x = W + 1;
    if (p.x > W + 2) p.x = -1;
    if (p.y < -2) p.y = H + 1;
    if (p.y > H + 2) p.y = -1;
  }
}

function updateFlashes(dt) {
  var alive = [];
  for (var i = 0; i < flashes.length; i++) {
    var f = flashes[i];
    f.age += dt;
    if (f.age < f.life) alive.push(f);
  }
  flashes = alive;
}

function renderHandgravity() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = 0.016;

  if (loading || (!webcamReady && !webcamDenied)) {
    var msg = 'loading handgravity...';
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

  startDetectionLoop();

  if (!particlesInited) initParticles(W, H);

  // Initialize trail grid
  if (!trailGrid || trailW !== W || trailH !== H) {
    trailGrid = new Float32Array(W * H * 2); // [hue, brightness] pairs
    trailW = W;
    trailH = H;
  }

  // Fade trails
  for (var ti = 0; ti < trailGrid.length; ti += 2) {
    trailGrid[ti + 1] *= 0.92; // fade brightness
  }

  // Update physics
  updateGravity(dt);
  updateFlashes(dt);

  // Stamp particle trails
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var tidx = (py * W + px) * 2;
      trailGrid[tidx] = p.hue;
      trailGrid[tidx + 1] = Math.min(30, trailGrid[tidx + 1] + 8);
    }
  }

  // Render trails
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var tidx2 = (y * W + x) * 2;
      var tBright = trailGrid[tidx2 + 1];
      if (tBright > 1) {
        var tHue = trailGrid[tidx2];
        drawCharHSL('.', x, y, tHue, 50, tBright);
      }
    }
  }

  // Render gravity well indicators
  var numWells = Math.min(hands.length, smoothHands.length);
  for (var wi = 0; wi < numWells; wi++) {
    var well = smoothHands[wi];
    var wcx = Math.round(well.cx);
    var wcy = Math.round(well.cy);

    // Pulsing ring around well
    var ringR = 3 + Math.sin(t * 3 + wi * 2) * 1;
    for (var angle = 0; angle < 6.283; angle += 0.15) {
      var rx = Math.round(well.cx + Math.cos(angle) * ringR);
      var ry = Math.round(well.cy + Math.sin(angle) * ringR);
      if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
        var ringHue = (t * 50 + angle * 30 + wi * 120) % 360;
        drawCharHSL('o', rx, ry, ringHue, 70, 30);
      }
    }

    // Center dot
    if (wcx >= 0 && wcx < W && wcy >= 0 && wcy < H) {
      drawCharHSL('@', wcx, wcy, (t * 60 + wi * 120) % 360, 90, 55);
    }
  }

  // Render particles
  for (var i2 = 0; i2 < particles.length; i2++) {
    var p2 = particles[i2];
    var px2 = Math.round(p2.x);
    var py2 = Math.round(p2.y);
    if (px2 < 0 || px2 >= W || py2 < 0 || py2 >= H) continue;

    // Speed-based brightness and character
    var speed = Math.sqrt(p2.vx * p2.vx + p2.vy * p2.vy);
    var speedFrac = Math.min(1, speed / 6);
    var ci = Math.min(ORBIT_CHARS.length - 1, Math.floor(speedFrac * ORBIT_CHARS.length));

    var bright = 15 + speedFrac * 45;
    var sat = 60 + speedFrac * 30;

    // Hue shifts slightly with speed
    var drawHue = (p2.hue + speed * 10) % 360;

    drawCharHSL(p2.ch, px2, py2, drawHue, sat, bright);
  }

  // Render absorption flashes
  for (var fi = 0; fi < flashes.length; fi++) {
    var f = flashes[fi];
    var fade = 1 - f.age / f.life;
    var fBright = 40 + fade * 40;
    // Expanding ring
    var fRadius = (1 - fade) * 3;
    for (var fa = 0; fa < 6.283; fa += 0.5) {
      var fx = Math.round(f.x + Math.cos(fa) * fRadius);
      var fy = Math.round(f.y + Math.sin(fa) * fRadius);
      if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
        drawCharHSL('*', fx, fy, f.hue, 90, fBright);
      }
    }
    // Center flash
    if (f.x >= 0 && f.x < W && f.y >= 0 && f.y < H) {
      drawCharHSL('#', f.x, f.y, f.hue, 100, fBright + 10);
    }
  }

  // Draw hand skeleton overlay — purple/violet theme
  for (var hi3 = 0; hi3 < numWells; hi3++) {
    var sh3 = smoothHands[hi3];
    if (!sh3.landmarks) continue;

    // Skeleton lines — deep purple
    for (var ci = 0; ci < HAND_CONNECTIONS.length; ci++) {
      var ca = sh3.landmarks[HAND_CONNECTIONS[ci][0]];
      var cb = sh3.landmarks[HAND_CONNECTIONS[ci][1]];
      var ldx = cb.x - ca.x, ldy = cb.y - ca.y;
      var llen = Math.sqrt(ldx * ldx + ldy * ldy);
      var lsteps = Math.max(1, Math.ceil(llen * 1.5));
      for (var ls = 0; ls <= lsteps; ls++) {
        var lt2 = ls / lsteps;
        var lx2 = Math.round(ca.x + ldx * lt2);
        var ly2 = Math.round(ca.y + ldy * lt2);
        if (lx2 < 0 || lx2 >= W || ly2 < 0 || ly2 >= H) continue;
        var absLdx = Math.abs(ldx), absLdy = Math.abs(ldy);
        var lch;
        if (absLdx > absLdy * 2) lch = '-';
        else if (absLdy > absLdx * 2) lch = '|';
        else if (ldx * ldy > 0) lch = '\\';
        else lch = '/';
        drawCharHSL(lch, lx2, ly2, 270, 80, 50);
      }
    }

    // Joint nodes — bright violet/magenta
    for (var ji = 0; ji < 21; ji++) {
      var jx = Math.round(sh3.landmarks[ji].x);
      var jy = Math.round(sh3.landmarks[ji].y);
      if (jx >= 0 && jx < W && jy >= 0 && jy < H) {
        drawCharHSL('@', jx, jy, 285, 100, 65);
      }
      for (var jdy = -1; jdy <= 1; jdy += 2) {
        for (var jdx = -1; jdx <= 1; jdx += 2) {
          var njx = jx + jdx, njy = jy + jdy;
          if (njx >= 0 && njx < W && njy >= 0 && njy < H) {
            drawCharHSL('#', njx, njy, 260, 85, 55);
          }
        }
      }
    }
  }

  // If no hands detected, show hint
  if (numWells === 0) {
    var hint = 'show your hands';
    var hx = Math.floor((W - hint.length) / 2);
    var hy = Math.floor(H / 2);
    for (var hi2 = 0; hi2 < hint.length; hi2++) {
      drawCharHSL(hint[hi2], hx + hi2, hy, (t * 30 + hi2 * 10) % 360, 50, 25);
    }
  }

  // Label
  var label = '[handgravity]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 260, 60, 30);
  }
}

registerMode('handgravity', { init: initHandgravity, render: renderHandgravity });
