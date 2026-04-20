import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// ============================================================
// FireBreath — cinematic dragon head, breathes fire at pointer.
// Hold = continuous stream. Tap = short puff.
// ============================================================

var fb = null;

function initFirebreath() {
  var W = state.COLS, H = state.ROWS;
  fb = {
    W: W, H: H,
    // Dragon head position (lower-left of screen)
    headX: Math.max(6, W * 0.14),
    headY: Math.floor(H * 0.55),
    particles: [],
    embers: [],
    shortPuffTimer: 0,
    smoke: [],
    // Cave wisps for background
    wisps: [],
    eyeBlink: 0,
    // Pointer may be outside mode when just loaded; auto-aim target
    autoAimT: 0
  };
  for (var i = 0; i < 18; i++) {
    fb.wisps.push({
      x: Math.random() * W,
      y: Math.random() * H,
      phase: Math.random() * 6.28,
      sp: 0.15 + Math.random() * 0.3
    });
  }
}

function spawnFire(power) {
  // power = 0..1.2
  var head = { x: fb.headX + 3.5, y: fb.headY - 0.5 };
  // Aim: if pointer.gx/gy sensible, use it. Else auto.
  var aimX, aimY;
  if (pointer.down && state.currentMode === 'firebreath') {
    aimX = pointer.gx;
    aimY = pointer.gy;
  } else {
    aimX = pointer.gx || (fb.W * 0.8);
    aimY = pointer.gy || fb.headY;
  }
  var dx = aimX - head.x;
  var dy = aimY - head.y;
  var dist = Math.hypot(dx, dy);
  if (dist < 0.01) dist = 0.01;
  var dirX = dx / dist, dirY = dy / dist;
  var coneHalfAngle = 0.35;
  var count = Math.floor(6 + power * 8);
  for (var i = 0; i < count; i++) {
    var ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * coneHalfAngle * 2;
    var spd = 14 + Math.random() * 14 * power;
    var px = head.x + dirX * 1.5;
    var py = head.y + dirY * 0.8;
    fb.particles.push({
      x: px, y: py,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1.0,
      size: 0.6 + Math.random() * 0.8,
      stage: 0 // 0 core, increases over life
    });
  }
  // Embers
  if (Math.random() < 0.6) {
    fb.embers.push({
      x: head.x + dirX * 1.5 + (Math.random() - 0.5),
      y: head.y + dirY * 0.8,
      vx: Math.cos(Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.4) * (6 + Math.random() * 8),
      vy: Math.sin(Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.4) * (4 + Math.random() * 6) - 3,
      life: 1.0 + Math.random() * 0.8,
      maxLife: 1.8
    });
  }
  // Smoke trail
  if (Math.random() < 0.4) {
    fb.smoke.push({
      x: head.x + dirX * 1.2,
      y: head.y + dirY * 0.7,
      vx: dirX * 2 + (Math.random() - 0.5) * 2,
      vy: dirY * 2 - 1 + (Math.random() - 0.5),
      life: 2 + Math.random() * 1,
      maxLife: 3
    });
  }
}

function updateParticles(dt) {
  var W = fb.W, H = fb.H;
  for (var i = fb.particles.length - 1; i >= 0; i--) {
    var p = fb.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.vy -= 1.5 * dt; // slight upward buoyancy
    p.life -= dt;
    if (p.life <= 0 || p.x < -2 || p.x > W + 2 || p.y < -2 || p.y > H + 2) {
      fb.particles.splice(i, 1);
    }
  }
  for (var i = fb.embers.length - 1; i >= 0; i--) {
    var e = fb.embers[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx *= 0.97;
    e.vy += 4 * dt; // gravity
    e.life -= dt;
    if (e.life <= 0 || e.x < 0 || e.x > W || e.y > H) {
      fb.embers.splice(i, 1);
    }
  }
  for (var i = fb.smoke.length - 1; i >= 0; i--) {
    var sm = fb.smoke[i];
    sm.x += sm.vx * dt;
    sm.y += sm.vy * dt;
    sm.vx *= 0.95;
    sm.vy -= 1.8 * dt; // smoke rises
    sm.life -= dt;
    if (sm.life <= 0 || sm.x < -2 || sm.x > W + 2 || sm.y < -2) {
      fb.smoke.splice(i, 1);
    }
  }
  // Cap
  var maxP = state.isMobile ? 400 : 800;
  if (fb.particles.length > maxP) fb.particles.splice(0, fb.particles.length - maxP);
  if (fb.embers.length > 120) fb.embers.splice(0, fb.embers.length - 120);
  if (fb.smoke.length > 120) fb.smoke.splice(0, fb.smoke.length - 120);
}

function renderBackground() {
  var W = fb.W, H = fb.H;
  var t = state.time;
  // Dark cave gradient
  for (var y = 0; y < H; y++) {
    var ratio = y / H;
    var lt = 6 + Math.sin(t * 0.5 + y * 0.1) * 2 + ratio * 4;
    if ((y * 5 + ((t * 2) | 0)) % 4 === 0) {
      drawCharHSL('.', ((y * 17) % W), y, 250, 15, lt);
    }
  }
  // Cave wall silhouette top/bottom
  for (var x = 0; x < W; x++) {
    var topH = 2 + Math.floor(Math.sin(x * 0.2 + t * 0.2) * 1.5 + Math.sin(x * 0.55) * 1);
    for (var yy = 0; yy < topH; yy++) {
      drawCharHSL('#', x, yy, 250, 10, 8 - yy);
    }
    var botH = 2 + Math.floor(Math.cos(x * 0.25) * 1.5 + Math.sin(x * 0.6 + 1) * 1);
    for (var yy = 0; yy < botH; yy++) {
      drawCharHSL('%', x, H - 1 - yy, 250, 10, 8 - yy);
    }
  }
  // Smoke wisps
  for (var i = 0; i < fb.wisps.length; i++) {
    var wi = fb.wisps[i];
    wi.x -= wi.sp;
    if (wi.x < -1) wi.x = W + Math.random() * 4;
    var yp = wi.y + Math.sin(t + wi.phase) * 1.5;
    var lt = 18 + Math.sin(t * 2 + wi.phase) * 8;
    drawCharHSL('~', wi.x | 0, yp | 0, 250, 8, lt);
  }
}

function renderDragonHead() {
  var t = state.time;
  var hx = Math.floor(fb.headX);
  var hy = Math.floor(fb.headY);
  var eyeGlow = Math.max(40, 60 + Math.sin(t * 2) * 15);
  if (fb.eyeBlink > 0) { eyeGlow = 20; fb.eyeBlink -= 1 / 60; }
  if (Math.random() < 0.005) fb.eyeBlink = 0.1;

  // Silhouette: dragon head facing right (toward pointer typically right-side of canvas)
  // Layout rows:
  //  -4: horns spike
  //  -3: horn base
  //  -2: head top
  //  -1: eye row
  //   0: mouth/snout centerline
  //  +1: jaw / chin
  //  +2: neck base
  var rowCh = {};
  // top head
  drawCharHSL(')', hx + 2, hy - 3, 0, 40, 20);
  drawCharHSL('^', hx + 1, hy - 3, 0, 60, 30);
  drawCharHSL('^', hx - 1, hy - 3, 0, 60, 30);
  drawCharHSL(')', hx, hy - 3, 0, 40, 20);
  drawCharHSL('_', hx + 3, hy - 2, 0, 40, 20);
  drawCharHSL('/', hx + 2, hy - 2, 10, 40, 25);
  drawCharHSL('#', hx + 1, hy - 2, 10, 40, 25);
  drawCharHSL('#', hx, hy - 2, 10, 40, 25);
  drawCharHSL('\\', hx - 1, hy - 2, 10, 40, 20);
  drawCharHSL('_', hx - 2, hy - 2, 0, 40, 18);
  // eye row
  drawCharHSL('|', hx + 3, hy - 1, 10, 40, 25);
  drawCharHSL('O', hx + 2, hy - 1, 15, 100, eyeGlow);
  drawCharHSL('#', hx + 1, hy - 1, 10, 40, 25);
  drawCharHSL('#', hx, hy - 1, 10, 40, 22);
  drawCharHSL('#', hx - 1, hy - 1, 10, 40, 22);
  drawCharHSL('|', hx - 2, hy - 1, 0, 40, 20);
  // mouth row (snout)
  drawCharHSL('>', hx + 4, hy, 10, 50, 28);
  drawCharHSL('=', hx + 3, hy, 10, 50, 28);
  drawCharHSL('#', hx + 2, hy, 10, 40, 22);
  drawCharHSL('#', hx + 1, hy, 10, 40, 20);
  drawCharHSL('#', hx, hy, 10, 40, 20);
  drawCharHSL('|', hx - 2, hy, 0, 40, 18);
  // jaw
  drawCharHSL('>', hx + 4, hy + 1, 10, 50, 25);
  drawCharHSL('v', hx + 3, hy + 1, 10, 50, 22);
  drawCharHSL('#', hx + 2, hy + 1, 10, 40, 20);
  drawCharHSL('#', hx + 1, hy + 1, 10, 40, 20);
  drawCharHSL('\\', hx, hy + 1, 10, 40, 18);
  drawCharHSL('_', hx - 1, hy + 1, 0, 40, 15);
  // neck
  drawCharHSL('/', hx + 1, hy + 2, 10, 40, 20);
  drawCharHSL('#', hx, hy + 2, 10, 40, 18);
  drawCharHSL('#', hx - 1, hy + 2, 10, 40, 16);
  drawCharHSL('\\', hx - 2, hy + 2, 10, 40, 15);
}

function renderFire() {
  for (var i = 0; i < fb.particles.length; i++) {
    var p = fb.particles[i];
    var a = p.life / p.maxLife; // 1 fresh -> 0 dead
    var x = p.x | 0, y = p.y | 0;
    if (x < 0 || x >= fb.W || y < 0 || y >= fb.H) continue;
    var ch;
    var hue, sat, lt;
    if (a > 0.82) {
      // White hot
      hue = 48; sat = 30; lt = 80; ch = '@';
    } else if (a > 0.6) {
      hue = 48; sat = 90; lt = 65; ch = '#';
    } else if (a > 0.35) {
      hue = 20 + (0.6 - a) * 30; sat = 100; lt = 55; ch = '*';
    } else if (a > 0.18) {
      hue = 0; sat = 95; lt = 45; ch = '+';
    } else {
      hue = 0; sat = 60; lt = 25; ch = '.';
    }
    drawCharHSL(ch, x, y, hue, sat, lt);
  }
}

function renderEmbers() {
  for (var i = 0; i < fb.embers.length; i++) {
    var e = fb.embers[i];
    var x = e.x | 0, y = e.y | 0;
    if (x < 0 || x >= fb.W || y < 0 || y >= fb.H) continue;
    var a = e.life / e.maxLife;
    var ch = a > 0.6 ? '*' : (a > 0.3 ? '+' : '.');
    drawCharHSL(ch, x, y, 25 + Math.random() * 15, 95, 35 + a * 45);
  }
}

function renderSmoke() {
  for (var i = 0; i < fb.smoke.length; i++) {
    var s = fb.smoke[i];
    var x = s.x | 0, y = s.y | 0;
    if (x < 0 || x >= fb.W || y < 0 || y >= fb.H) continue;
    var a = s.life / s.maxLife;
    var ch = a > 0.5 ? '%' : (a > 0.25 ? '*' : '.');
    drawCharHSL(ch, x, y, 20, 10, 20 + a * 20);
  }
}

function renderInstructions() {
  var t = state.time;
  if (t > 6 || fb.particles.length > 20) return;
  var W = fb.W, H = fb.H;
  var line = state.isMobile ? 'HOLD TO BREATHE  TAP TO PUFF' : 'HOLD CLICK TO BREATHE  CLICK TO PUFF';
  var sx = Math.floor(W / 2 - line.length / 2);
  var sy = 2;
  for (var c = 0; c < line.length; c++) {
    if (line[c] === ' ') continue;
    var bright = 40 + Math.sin(t * 2 + c * 0.2) * 10;
    drawCharHSL(line[c], sx + c, sy, 25, 70, bright);
  }
}

function renderFirebreath() {
  clearCanvas();
  if (!fb || fb.W !== state.COLS || fb.H !== state.ROWS) initFirebreath();
  var dt = 1 / 60;
  fb.autoAimT += dt;

  // Click = short puff
  if (pointer.clicked && state.currentMode === 'firebreath') {
    pointer.clicked = false;
    fb.shortPuffTimer = 0.25;
  }
  // Continuous while down
  if (pointer.down && state.currentMode === 'firebreath') {
    spawnFire(1.0);
  } else if (fb.shortPuffTimer > 0) {
    spawnFire(0.6);
    fb.shortPuffTimer -= dt;
  } else {
    // Auto-breath demo occasionally so preview isn't dead
    if ((Math.sin(fb.autoAimT * 0.9) > 0.7) && Math.random() < 0.35) {
      spawnFire(0.7);
    }
  }

  updateParticles(dt);

  renderBackground();
  renderSmoke();
  renderDragonHead();
  renderEmbers();
  renderFire();
  renderInstructions();
}

registerMode('firebreath', {
  init: initFirebreath,
  render: renderFirebreath
});
