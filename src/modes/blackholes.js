import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Black Holes — multi-body gravitational ASCII simulation
// ============================================================

var NUM_HOLES = 3;
var MAX_PARTICLES = 600;
var SPAWN_RATE = 4;           // particles per frame
var EVENT_HORIZON = 2.5;      // absorption radius
var ACCRETION_RADIUS = 8;     // bright ring zone
var G_CONSTANT = 80;          // gravitational strength
var SOFTENING = 1.5;          // prevents infinite forces
var HOLE_MASS = 1.0;
var MOUSE_MASS = 0.4;
var ORBIT_SPEED = 0.12;

var holes = [];
var particles = [];
var flashes = [];
var mouseWell = null;
var mouseTimer = 0;
var frameTime = 0;
var lastTime = 0;

// vortex chars by distance ring
var vortexRings = ['@', '#', '%', '*', '.'];
var nebulaChars = ['.', ',', '`', '\'', '~'];

// event handler refs
var _clickHandler = null;
var _touchHandler = null;

function initHoles() {
  holes = [];
  particles = [];
  flashes = [];
  mouseWell = null;
  mouseTimer = 0;
  lastTime = 0;
  frameTime = 0;

  var cx = state.COLS / 2;
  var cy = state.ROWS / 2;
  var orbitR = Math.min(cx, cy) * 0.35;

  for (var i = 0; i < NUM_HOLES; i++) {
    var angle = (Math.PI * 2 * i) / NUM_HOLES;
    holes.push({
      x: cx + Math.cos(angle) * orbitR,
      y: cy + Math.sin(angle) * orbitR,
      angle: angle,
      orbitR: orbitR,
      mass: HOLE_MASS,
      spin: 0,
      hue: i === 0 ? 270 : i === 1 ? 200 : 330
    });
  }

  // seed initial particles
  for (var i = 0; i < MAX_PARTICLES; i++) {
    spawnParticle();
  }
}

function spawnParticle() {
  if (particles.length >= MAX_PARTICLES) return;

  var W = state.COLS;
  var H = state.ROWS;
  var edge = Math.floor(Math.random() * 4);
  var px, py, vx, vy;
  var speed = 0.2 + Math.random() * 0.6;

  if (edge === 0) {        // top
    px = Math.random() * W;
    py = 0;
    vx = (Math.random() - 0.5) * speed;
    vy = Math.random() * speed;
  } else if (edge === 1) { // bottom
    px = Math.random() * W;
    py = H - 1;
    vx = (Math.random() - 0.5) * speed;
    vy = -Math.random() * speed;
  } else if (edge === 2) { // left
    px = 0;
    py = Math.random() * H;
    vx = Math.random() * speed;
    vy = (Math.random() - 0.5) * speed;
  } else {                 // right
    px = W - 1;
    py = Math.random() * H;
    vx = -Math.random() * speed;
    vy = (Math.random() - 0.5) * speed;
  }

  var starChars = ['.', '+', '*', 'o', ':', ';'];
  particles.push({
    x: px,
    y: py,
    vx: vx,
    vy: vy,
    ch: starChars[Math.floor(Math.random() * starChars.length)],
    life: 1.0,
    trail: []
  });
}

function spawnFlash(x, y, hue) {
  var chars = ['*', '#', '@', '+', 'O', '!'];
  for (var i = 0; i < 8; i++) {
    var angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
    var speed = 1.0 + Math.random() * 2.5;
    flashes.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.4 + Math.random() * 0.3,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: hue + Math.random() * 40 - 20
    });
  }
}

function updateHoles(dt) {
  var cx = state.COLS / 2;
  var cy = state.ROWS / 2;

  // 3-body: each hole perturbs the others
  for (var i = 0; i < holes.length; i++) {
    var h = holes[i];
    h.angle += ORBIT_SPEED * dt;
    h.spin += dt * 3;

    // base orbit position
    var baseX = cx + Math.cos(h.angle) * h.orbitR;
    var baseY = cy + Math.sin(h.angle) * h.orbitR;

    // perturbation from other holes
    var pertX = 0, pertY = 0;
    for (var j = 0; j < holes.length; j++) {
      if (j === i) continue;
      var oh = holes[j];
      var dx = oh.x - h.x;
      var dy = oh.y - h.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + SOFTENING;
      var force = 2.0 / (dist * dist);
      pertX += dx * force * 0.3;
      pertY += dy * force * 0.3;
    }

    h.x = baseX + Math.sin(frameTime * 0.7 + i * 2) * 2 + pertX;
    h.y = baseY + Math.cos(frameTime * 0.5 + i * 1.5) * 1.5 + pertY;
  }
}

function updateParticles(dt) {
  var W = state.COLS;
  var H = state.ROWS;

  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    var absorbed = false;

    // gravitational attraction to each black hole
    for (var j = 0; j < holes.length; j++) {
      var h = holes[j];
      var dx = h.x - p.x;
      var dy = h.y - p.y;
      var distSq = dx * dx + dy * dy + SOFTENING * SOFTENING;
      var dist = Math.sqrt(distSq);
      var force = G_CONSTANT * h.mass / distSq;

      // cap force to prevent extreme acceleration
      if (force > 15) force = 15;

      p.vx += (dx / dist) * force * dt;
      p.vy += (dy / dist) * force * dt;

      // absorption check
      if (dist < EVENT_HORIZON) {
        spawnFlash(p.x, p.y, h.hue);
        absorbed = true;
        break;
      }
    }

    // mouse gravity well
    if (mouseWell && mouseTimer > 0) {
      var mdx = mouseWell.x - p.x;
      var mdy = mouseWell.y - p.y;
      var mdistSq = mdx * mdx + mdy * mdy + SOFTENING * SOFTENING;
      var mdist = Math.sqrt(mdistSq);
      var mforce = G_CONSTANT * MOUSE_MASS / mdistSq;
      if (mforce > 8) mforce = 8;
      p.vx += (mdx / mdist) * mforce * dt;
      p.vy += (mdy / mdist) * mforce * dt;
    }

    if (absorbed) {
      particles.splice(i, 1);
      continue;
    }

    // velocity damping (very slight, keeps things stable)
    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > 12) {
      p.vx = (p.vx / speed) * 12;
      p.vy = (p.vy / speed) * 12;
    }

    // save trail position
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 7) p.trail.shift();

    // update position
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // remove if far out of bounds
    if (p.x < -20 || p.x > W + 20 || p.y < -15 || p.y > H + 15) {
      particles.splice(i, 1);
    }
  }
}

function updateFlashes(dt) {
  for (var i = flashes.length - 1; i >= 0; i--) {
    var f = flashes[i];
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vx *= 0.92;
    f.vy *= 0.92;
    f.life -= dt;
    if (f.life <= 0) flashes.splice(i, 1);
  }
}

function distToNearestHole(x, y) {
  var minDist = 99999;
  var nearIdx = 0;
  for (var i = 0; i < holes.length; i++) {
    var dx = holes[i].x - x;
    var dy = holes[i].y - y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < minDist) {
      minDist = d;
      nearIdx = i;
    }
  }
  return { dist: minDist, idx: nearIdx };
}

function renderBlackholes() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  // compute dt
  var now = performance.now() / 1000;
  var dt = lastTime > 0 ? now - lastTime : 1 / 60;
  if (dt > 0.1) dt = 0.1;
  lastTime = now;
  frameTime += dt;

  // update simulation
  updateHoles(dt);
  updateParticles(dt);
  updateFlashes(dt);

  // mouse well decay
  if (mouseTimer > 0) {
    mouseTimer -= dt;
    if (mouseTimer <= 0) mouseWell = null;
  }

  // spawn new particles
  for (var s = 0; s < SPAWN_RATE; s++) {
    if (particles.length < MAX_PARTICLES) spawnParticle();
  }

  // --- RENDER ---

  // background: subtle nebula
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nx = x / W;
      var ny = y / H;
      var n1 = Math.sin(nx * 6.28 + t * 0.05) * Math.cos(ny * 4.71 + t * 0.03);
      var n2 = Math.sin((nx + ny) * 3.14 + t * 0.07) * 0.5;
      var nebula = (n1 + n2) * 0.5 + 0.5;

      if (nebula > 0.45) {
        var ni = Math.floor((nebula - 0.45) * 10);
        if (ni >= nebulaChars.length) ni = nebulaChars.length - 1;
        if (ni < 0) ni = 0;
        var nebHue = 240 + nebula * 80;
        var nebL = 6 + nebula * 12;
        drawCharHSL(nebulaChars[ni], x, y, nebHue, 40, nebL);
      }
    }
  }

  // gravitational lensing: warp zone near black holes
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var nearest = distToNearestHole(x, y);
      var d = nearest.dist;

      // lensing distortion chars in the mid-range
      if (d > EVENT_HORIZON && d < ACCRETION_RADIUS * 1.8) {
        var lensIntensity = 1.0 - (d - EVENT_HORIZON) / (ACCRETION_RADIUS * 1.8 - EVENT_HORIZON);
        if (Math.random() < lensIntensity * 0.25) {
          var lensChars = ['~', '-', '=', '|', '/', '\\'];
          var lc = lensChars[Math.floor(Math.random() * lensChars.length)];
          var lensHue = holes[nearest.idx].hue;
          drawCharHSL(lc, x, y, lensHue, 35, 15 + lensIntensity * 25);
        }
      }
    }
  }

  // particle trails (dim)
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    for (var ti = 0; ti < p.trail.length; ti++) {
      var tr = p.trail[ti];
      var tx = Math.round(tr.x);
      var ty = Math.round(tr.y);
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        var trAlpha = (ti + 1) / (p.trail.length + 1);
        drawCharHSL('.', tx, ty, 220, 30, 10 + trAlpha * 18);
      }
    }
  }

  // particles
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;

    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var nearest = distToNearestHole(p.x, p.y);
    var d = nearest.dist;

    // color based on velocity and distance to hole
    var pHue, pSat, pLight;

    if (d < ACCRETION_RADIUS) {
      // accretion disk: hot white/yellow/orange
      var accretionT = 1.0 - d / ACCRETION_RADIUS;
      pHue = 40 - accretionT * 30; // yellow to orange
      pSat = 80 + accretionT * 20;
      pLight = 40 + accretionT * 45 + speed * 3;

      // brighten chars near the ring
      var ringDist = Math.abs(d - ACCRETION_RADIUS * 0.6);
      if (ringDist < 2) {
        pLight += (2 - ringDist) * 15;
        pSat = 90;
      }
    } else {
      // far away: cool blue shifting to white with speed
      pHue = 220 - speed * 15;
      pSat = 60 - speed * 8;
      pLight = 25 + speed * 12;
      if (pHue < 180) pHue = 180;
      if (pSat < 15) pSat = 15;
    }

    if (pLight > 95) pLight = 95;

    // char changes near black holes
    var ch = p.ch;
    if (d < EVENT_HORIZON * 2) {
      var distortChars = ['#', '%', '&', '!', '@'];
      ch = distortChars[Math.floor(Math.random() * distortChars.length)];
    } else if (d < ACCRETION_RADIUS) {
      var hotChars = ['*', '+', 'o', 'O', '#'];
      ch = hotChars[Math.floor(Math.random() * hotChars.length)];
    }

    drawCharHSL(ch, px, py, pHue, pSat, pLight);
  }

  // black holes: spinning vortexes
  for (var hi = 0; hi < holes.length; hi++) {
    var h = holes[hi];
    var hx = Math.round(h.x);
    var hy = Math.round(h.y);

    // draw vortex rings
    for (var ring = 0; ring < vortexRings.length; ring++) {
      var radius = ring * 0.8 + 0.5;
      var numChars = Math.max(4, Math.floor(radius * 6));
      var ringAngle = h.spin + ring * 0.5;

      for (var ci = 0; ci < numChars; ci++) {
        var a = ringAngle + (Math.PI * 2 * ci) / numChars;
        var rx = hx + Math.cos(a) * radius;
        var ry = hy + Math.sin(a) * radius * 0.6; // aspect ratio correction

        var rix = Math.round(rx);
        var riy = Math.round(ry);
        if (rix < 0 || rix >= W || riy < 0 || riy >= H) continue;

        var ringT = ring / vortexRings.length;
        var vHue = h.hue + ringT * 30;
        var vSat = 70 - ring * 10;
        var vLight;
        if (ring === 0) {
          // core: pulsing bright
          vLight = 70 + Math.sin(frameTime * 5 + hi) * 15;
        } else {
          vLight = 55 - ring * 8;
        }

        drawCharHSL(vortexRings[ring], rix, riy, vHue, vSat, vLight);
      }
    }

    // singularity core
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
      var corePulse = 75 + Math.sin(frameTime * 8 + hi * 2.1) * 20;
      drawCharHSL('@', hx, hy, h.hue, 90, corePulse);
    }

    // accretion disk ring (bright orbiting band)
    var diskParticles = Math.floor(ACCRETION_RADIUS * 4);
    for (var di = 0; di < diskParticles; di++) {
      var da = h.spin * 0.7 + (Math.PI * 2 * di) / diskParticles;
      var dr = ACCRETION_RADIUS * 0.5 + Math.sin(da * 3 + frameTime) * 1.5;
      var dxx = h.x + Math.cos(da) * dr;
      var dyy = h.y + Math.sin(da) * dr * 0.5;
      var dix = Math.round(dxx);
      var diy = Math.round(dyy);

      if (dix >= 0 && dix < W && diy >= 0 && diy < H) {
        var diskChars = ['=', '-', '~', '*'];
        var dch = diskChars[di % diskChars.length];
        var dHue = h.hue + 40 + Math.sin(da + frameTime) * 20;
        var dLight = 45 + Math.sin(da * 2 + frameTime * 3) * 25;
        drawCharHSL(dch, dix, diy, dHue, 70, dLight);
      }
    }
  }

  // absorption flashes
  for (var i = 0; i < flashes.length; i++) {
    var f = flashes[i];
    var fx = Math.round(f.x);
    var fy = Math.round(f.y);
    if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
      var alpha = f.life / f.maxLife;
      drawCharHSL(f.ch, fx, fy, f.hue, 90, 50 + alpha * 45);
    }
  }

  // mouse well indicator
  if (mouseWell && mouseTimer > 0) {
    var mx = Math.round(mouseWell.x);
    var my = Math.round(mouseWell.y);
    var mAlpha = mouseTimer / 3.0;
    if (mAlpha > 1) mAlpha = 1;

    // pulsing rings around mouse click — multiple layers
    for (var ring = 0; ring < 3; ring++) {
      var mRad = 1.5 + ring * 1.2 + Math.sin(frameTime * 6 + ring) * 0.5;
      var mSteps = 8 + ring * 4;
      for (var mi = 0; mi < mSteps; mi++) {
        var ma = (Math.PI * 2 * mi) / mSteps + frameTime * (3 - ring * 0.5);
        var mrx = Math.round(mouseWell.x + Math.cos(ma) * mRad);
        var mry = Math.round(mouseWell.y + Math.sin(ma) * mRad * 0.6);
        if (mrx >= 0 && mrx < W && mry >= 0 && mry < H) {
          var ringBright = (50 - ring * 12) + mAlpha * 35 + Math.sin(frameTime * 8 + mi) * 8;
          drawCharHSL('+', mrx, mry, 50 + ring * 15, 85, ringBright);
        }
      }
    }
    if (mx >= 0 && mx < W && my >= 0 && my < H) {
      var coreBright = 65 + mAlpha * 30 + Math.sin(frameTime * 10) * 10;
      drawCharHSL('@', mx, my, 50, 95, coreBright);
    }
  }

  // HUD: particle count and hole info
  var info = 'STARS: ' + particles.length;
  for (var i = 0; i < info.length; i++) {
    drawCharHSL(info[i], 1 + i, 0, 200, 40, 35);
  }

  var clickInfo = 'CLICK TO CREATE GRAVITY WELL';
  var cix = W - clickInfo.length - 1;
  for (var i = 0; i < clickInfo.length; i++) {
    var cHue = 180 + Math.sin(t * 0.5 + i * 0.2) * 30;
    drawCharHSL(clickInfo[i], cix + i, H - 1, cHue, 30, 20 + Math.sin(t + i * 0.3) * 5);
  }
}

function screenToGrid(clientX, clientY) {
  var canvas = state.canvas;
  if (!canvas) return { x: 0, y: 0 };
  var rect = canvas.getBoundingClientRect();
  var sx = (clientX - rect.left) / rect.width;
  var sy = (clientY - rect.top) / rect.height;
  return {
    x: sx * state.COLS,
    y: sy * state.ROWS
  };
}

function handleClick(clientX, clientY) {
  if (state.currentMode !== 'blackholes') return;
  var pos = screenToGrid(clientX, clientY);
  mouseWell = { x: pos.x, y: pos.y };
  mouseTimer = 3.0; // lasts 3 seconds
}

function attachBlackholes() {
  cleanupBlackholes();

  _clickHandler = function(e) {
    handleClick(e.clientX, e.clientY);
  };
  state.canvas.addEventListener('click', _clickHandler);

  _touchHandler = function(e) {
    if (e.touches.length > 0) {
      handleClick(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  state.canvas.addEventListener('touchstart', _touchHandler, { passive: true });
}

function cleanupBlackholes() {
  if (_clickHandler && state.canvas) {
    state.canvas.removeEventListener('click', _clickHandler);
    _clickHandler = null;
  }
  if (_touchHandler && state.canvas) {
    state.canvas.removeEventListener('touchstart', _touchHandler);
    _touchHandler = null;
  }
}

registerMode('blackholes', {
  init: initHoles,
  render: renderBlackholes,
  attach: attachBlackholes,
  cleanup: cleanupBlackholes
});
