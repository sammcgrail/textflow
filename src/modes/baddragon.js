import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// BadDragon — grumpy chaotic dragon w/ purple/pink/magenta palette.
// Click/tap rile it up. At max anger: screen shake + barrage +
// grumpy text flying across the screen.
// ============================================================

var bd = null;

var GRUMPY_TEXTS = [
  'BAD DRAGON!',
  'NAUGHTY!',
  'STAY BACK!',
  'HEH HEH',
  'ROAR!',
  'OUT!',
  'NO TOUCH',
  'GRRR',
  'SHOO',
  'BEGONE',
  'RUDE',
  'SPICY!',
  '>:(',
  '><',
  'HMPH'
];

function initBaddragon() {
  var W = state.COLS, H = state.ROWS;
  bd = {
    W: W, H: H,
    anger: 0, // 0..1
    dragonX: W * 0.5,
    dragonY: H * 0.55,
    headBob: 0,
    projectiles: [],
    texts: [],
    shake: 0,
    // Auto projectile idle timer
    autoT: 0,
    wings: 0,
    // eye jitter
    eyeJitter: 0
  };
}

function spawnProjectile(targetX, targetY) {
  var W = bd.W, H = bd.H;
  var types = ['fireball', 'gem', 'heart', 'bolt'];
  var t = types[(Math.random() * types.length) | 0];
  // Origin near dragon mouth
  var ox = bd.dragonX + (Math.random() - 0.5) * 2;
  var oy = bd.dragonY + (Math.random() - 0.5) * 1.5;
  // Direction biased toward target
  var dx = targetX - ox;
  var dy = targetY - oy;
  var d = Math.hypot(dx, dy);
  if (d < 0.01) d = 0.01;
  var baseAng = Math.atan2(dy, dx);
  var spread = 0.25 + bd.anger * 0.9; // wider with anger
  var ang = baseAng + (Math.random() - 0.5) * spread;
  var spd = 10 + Math.random() * 12 + bd.anger * 10;
  var hue, ch;
  if (t === 'fireball') { hue = 20 + Math.random() * 20; ch = '*'; }
  else if (t === 'gem') { hue = 180; ch = Math.random() < 0.5 ? '<' : '>'; }
  else if (t === 'heart') { hue = 320 + Math.random() * 20; ch = '@'; }
  else { hue = 270; ch = '/'; }
  bd.projectiles.push({
    x: ox, y: oy,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd - 1,
    type: t, hue: hue, ch: ch,
    life: 1.5 + Math.random() * 0.8,
    maxLife: 2.3,
    rot: Math.random() * 6.28,
    rotV: (Math.random() - 0.5) * 4
  });
}

function spawnText(targetX, targetY) {
  var W = bd.W, H = bd.H;
  var txt = GRUMPY_TEXTS[(Math.random() * GRUMPY_TEXTS.length) | 0];
  // fly from random edge to target
  var fromSide = (Math.random() * 4) | 0;
  var sx, sy;
  if (fromSide === 0) { sx = -txt.length; sy = Math.random() * H; }
  else if (fromSide === 1) { sx = W; sy = Math.random() * H; }
  else if (fromSide === 2) { sx = Math.random() * W; sy = -1; }
  else { sx = Math.random() * W; sy = H; }
  var dx = (W / 2 - sx), dy = (H / 2 - sy);
  var d = Math.hypot(dx, dy);
  var vx = (dx / d) * (6 + Math.random() * 6);
  var vy = (dy / d) * (6 + Math.random() * 6);
  bd.texts.push({
    text: txt,
    x: sx, y: sy,
    vx: vx, vy: vy,
    life: 1.3 + Math.random() * 0.6,
    maxLife: 1.9,
    hue: 300 + Math.random() * 60,
    scale: Math.random() < 0.3 ? 2 : 1
  });
}

function updateBaddragon() {
  var dt = 1 / 60;
  var W = bd.W, H = bd.H;
  var t = state.time;
  bd.headBob = Math.sin(t * 2) * 0.7 + bd.anger * Math.sin(t * 8) * 0.4;
  bd.wings += dt * (2 + bd.anger * 4);
  bd.autoT += dt;
  bd.eyeJitter = bd.anger > 0.5 ? Math.random() * 2 : 0;

  // Dragon slowly follows pointer on X axis so it doesn't lock in corner
  var targetDX, targetDY;
  if (pointer.gx || pointer.gy) {
    // Dragon hovers at pointer-opposite side (keeps it visible)
    targetDX = pointer.gx > W * 0.5 ? W * 0.3 : W * 0.7;
    targetDY = H * 0.45;
  } else {
    targetDX = W * 0.5; targetDY = H * 0.5;
  }
  bd.dragonX += (targetDX - bd.dragonX) * 0.03;
  bd.dragonY += (targetDY - bd.dragonY) * 0.03;

  // Pointer clicks = rile up
  if (pointer.clicked && state.currentMode === 'baddragon') {
    pointer.clicked = false;
    bd.anger = Math.min(1, bd.anger + 0.25);
    bd.shake = 6 + bd.anger * 10;
    // Burst projectiles
    var burstN = 6 + Math.floor(bd.anger * 14);
    var tx = pointer.gx, ty = pointer.gy;
    for (var i = 0; i < burstN; i++) spawnProjectile(tx, ty);
    spawnText(tx, ty);
    if (bd.anger > 0.7) {
      spawnText(tx, ty);
      spawnText(tx, ty);
    }
  }

  // Anger decay
  bd.anger = Math.max(0, bd.anger - dt * 0.22);
  bd.shake = Math.max(0, bd.shake - dt * 14);

  // Auto spit (keeps idle preview active)
  var spitRate = 0.3 + bd.anger * 3;
  if (Math.random() < spitRate * dt) {
    var tx = pointer.gx || (W - 5);
    var ty = pointer.gy || (H * 0.5);
    spawnProjectile(tx, ty);
  }

  // Update projectiles
  for (var i = bd.projectiles.length - 1; i >= 0; i--) {
    var p = bd.projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 6 * dt; // gravity
    p.vx *= 0.99;
    p.rot += p.rotV * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > H + 2 || p.x < -3 || p.x > W + 3) {
      bd.projectiles.splice(i, 1);
    }
  }
  var maxProj = state.isMobile ? 250 : 500;
  if (bd.projectiles.length > maxProj) bd.projectiles.splice(0, bd.projectiles.length - maxProj);

  // Update texts
  for (var i = bd.texts.length - 1; i >= 0; i--) {
    var tx2 = bd.texts[i];
    tx2.x += tx2.vx * dt;
    tx2.y += tx2.vy * dt;
    tx2.life -= dt;
    if (tx2.life <= 0) bd.texts.splice(i, 1);
  }
}

function renderBackground() {
  var W = bd.W, H = bd.H;
  var t = state.time;
  // Purple/pink gradient
  for (var y = 0; y < H; y++) {
    var ratio = y / H;
    var hue = 290 + Math.sin(t + y * 0.05) * 20;
    var lt = 6 + ratio * 12;
    if ((y * 11 + ((t * 4) | 0)) % 6 === 0) {
      drawCharHSL('.', ((y * 19 + ((t * 2) | 0)) % W), y, hue, 50, lt);
    }
  }
  // Sparkles at high anger
  if (bd.anger > 0.4) {
    var cnt = Math.floor(bd.anger * 30);
    for (var i = 0; i < cnt; i++) {
      var sx = (Math.random() * W) | 0;
      var sy = (Math.random() * H) | 0;
      var h = 300 + Math.random() * 60;
      drawCharHSL(Math.random() < 0.5 ? '*' : '+', sx, sy, h, 90, 45 + Math.random() * 25);
    }
  }
}

function renderDragon() {
  var t = state.time;
  var x = bd.dragonX | 0;
  var y = (bd.dragonY + bd.headBob) | 0;
  var pulse = Math.sin(t * 3) * 0.5 + 0.5;
  var hue = 290 + bd.anger * 40 + pulse * 20;
  if (hue > 360) hue -= 360;
  var sat = 80 + bd.anger * 20;
  var lt = 45 + pulse * 10 + bd.anger * 10;

  // Wings (flap)
  var wing = Math.sin(bd.wings) * 1.5;
  var wingChars = ['w', 'W', 'w'];
  for (var wi = -2; wi <= 2; wi++) {
    if (wi === 0) continue;
    var wx = x + wi * 2;
    var wy = (y - 2 + Math.abs(wi) * 0.5 + wing) | 0;
    if (wx >= 0 && wx < bd.W && wy >= 0 && wy < bd.H) {
      drawCharHSL('v', wx, wy, hue, sat, lt - 5);
      drawCharHSL('V', wx, wy - 1, hue, sat - 10, lt - 10);
    }
  }

  // Body center (round)
  for (var dx = -2; dx <= 2; dx++) {
    for (var dy = 0; dy <= 2; dy++) {
      if (Math.abs(dx) + dy < 4) {
        var sx = x + dx, sy = y + dy;
        if (sx >= 0 && sx < bd.W && sy >= 0 && sy < bd.H) {
          var ch = (dx === 0 && dy === 1) ? '#' : '@';
          drawCharHSL(ch, sx, sy, hue, sat, lt - 5 + Math.abs(dx) * 2);
        }
      }
    }
  }

  // Head
  drawCharHSL('#', x, y - 1, hue, sat, lt + 5);
  drawCharHSL('(', x - 1, y - 1, hue, sat, lt);
  drawCharHSL(')', x + 1, y - 1, hue, sat, lt);
  // Horns
  drawCharHSL('^', x - 1, y - 2, hue, sat, lt + 10);
  drawCharHSL('^', x + 1, y - 2, hue, sat, lt + 10);
  // Eyes (angry slits)
  var ejx = bd.eyeJitter ? (Math.random() - 0.5) * bd.eyeJitter : 0;
  drawCharHSL('>', (x - 1 + ejx) | 0, y - 1, 0, 100, 60 + bd.anger * 25);
  drawCharHSL('<', (x + 1 - ejx) | 0, y - 1, 0, 100, 60 + bd.anger * 25);
  // Eyebrow (angry)
  if (bd.anger > 0.3) {
    drawCharHSL('~', x - 1, y - 2, 0, 100, 60);
    drawCharHSL('~', x + 1, y - 2, 0, 100, 60);
  }
  // Mouth
  var mouthCh = bd.anger > 0.5 ? 'W' : (bd.anger > 0.2 ? 'w' : '_');
  drawCharHSL(mouthCh, x, y, 0, 90, 55);
  // Tail
  var tailX = x - 3;
  var tailY = y + 2;
  drawCharHSL('~', tailX, tailY, hue, sat, lt - 10);
  drawCharHSL(',', tailX - 1, tailY + 1, hue, sat, lt - 15);
  // Smoke wisps from nostrils when angry
  if (bd.anger > 0.2) {
    for (var si = 0; si < 3; si++) {
      var sy = y + (si - 1);
      drawCharHSL(si % 2 === 0 ? '~' : '.', x + 2 + si, sy, 0 + Math.random() * 20, 60, 40 + Math.random() * 20);
    }
  }
}

function renderProjectiles() {
  for (var i = 0; i < bd.projectiles.length; i++) {
    var p = bd.projectiles[i];
    var x = p.x | 0, y = p.y | 0;
    if (x < 0 || x >= bd.W || y < 0 || y >= bd.H) continue;
    var a = p.life / p.maxLife;
    var lt = 40 + a * 40;
    var ch = p.ch;
    if (p.type === 'heart') {
      // pulse with sin
      lt = 50 + Math.sin(state.time * 8 + i) * 15;
      ch = (Math.sin(p.rot) > 0) ? '@' : '&';
    } else if (p.type === 'bolt') {
      ch = (Math.sin(p.rot) > 0) ? '/' : '\\';
    }
    drawCharHSL(ch, x, y, p.hue, 95, lt);
    // Trail
    var tx = (p.x - p.vx * 0.02) | 0, ty = (p.y - p.vy * 0.02) | 0;
    if (tx >= 0 && tx < bd.W && ty >= 0 && ty < bd.H && (tx !== x || ty !== y)) {
      drawCharHSL('.', tx, ty, p.hue, 80, 25);
    }
  }
}

function renderTexts() {
  for (var i = 0; i < bd.texts.length; i++) {
    var tx = bd.texts[i];
    var a = tx.life / tx.maxLife;
    var y = tx.y | 0;
    var baseX = tx.x | 0;
    for (var c = 0; c < tx.text.length; c++) {
      var px = baseX + c * (tx.scale || 1);
      if (px < 0 || px >= bd.W || y < 0 || y >= bd.H) continue;
      if (tx.text[c] === ' ') continue;
      var bright = 55 + a * 25;
      drawCharHSL(tx.text[c], px, y, tx.hue, 100, bright);
      if (tx.scale === 2 && y + 1 < bd.H) {
        drawCharHSL(tx.text[c], px, y + 1, tx.hue, 80, bright - 15);
      }
    }
  }
}

function renderAngerMeter() {
  var W = bd.W, H = bd.H;
  var t = state.time;
  // Label
  var lbl = 'ANGER';
  for (var i = 0; i < lbl.length; i++) {
    var hue = bd.anger > 0.7 ? (0 + Math.sin(t * 10 + i) * 20) : 300;
    drawCharHSL(lbl[i], 2 + i, 0, hue, 90, 60);
  }
  // Bar
  var barW = Math.min(24, W - 10);
  var filled = Math.floor(bd.anger * barW);
  for (var i = 0; i < barW; i++) {
    var on = i < filled;
    var hue = on ? (300 - i * 4) : 280;
    if (hue < 0) hue += 360;
    var lt = on ? (55 + Math.sin(t * 6 + i) * 15) : 15;
    drawCharHSL(on ? '#' : '-', 8 + i, 0, hue, on ? 100 : 30, lt);
  }
  // Max anger banner
  if (bd.anger > 0.9) {
    var banner = 'MAX ANGER';
    var sx = Math.floor(W / 2 - banner.length / 2);
    for (var i = 0; i < banner.length; i++) {
      drawCharHSL(banner[i], sx + i, 0,
        (Math.sin(t * 15 + i) * 40 + 310 + 360) % 360,
        100, 60 + Math.sin(t * 20 + i) * 15);
    }
  }
}

function renderPrompt() {
  var t = state.time;
  if (t > 5 || bd.anger > 0.1) return;
  var W = bd.W, H = bd.H;
  var line = state.isMobile ? 'TAP TO RILE  DRAG = THREAT' : 'CLICK TO RILE  MOVE = THREAT';
  var sx = Math.floor(W / 2 - line.length / 2);
  var sy = H - 2;
  for (var c = 0; c < line.length; c++) {
    if (line[c] === ' ') continue;
    var bright = 40 + Math.sin(t * 2 + c * 0.2) * 10;
    drawCharHSL(line[c], sx + c, sy, 320, 80, bright);
  }
}

function renderBaddragon() {
  clearCanvas();
  if (!bd || bd.W !== state.COLS || bd.H !== state.ROWS) initBaddragon();

  // Screen shake by tweaking positions (cheap fake shake via offset flag)
  // We'll implement shake by offsetting dragon position and projectile positions
  var shakeOffX = 0, shakeOffY = 0;
  if (bd.shake > 0) {
    shakeOffX = (Math.random() - 0.5) * bd.shake * 0.25;
    shakeOffY = (Math.random() - 0.5) * bd.shake * 0.25;
  }

  updateBaddragon();

  if (shakeOffX || shakeOffY) {
    bd.dragonX += shakeOffX;
    bd.dragonY += shakeOffY;
  }

  renderBackground();
  renderProjectiles();
  renderDragon();
  renderTexts();
  renderAngerMeter();
  renderPrompt();

  // Undo shake so it doesn't accumulate
  if (shakeOffX || shakeOffY) {
    bd.dragonX -= shakeOffX;
    bd.dragonY -= shakeOffY;
  }
}

registerMode('baddragon', {
  init: initBaddragon,
  render: renderBaddragon
});
