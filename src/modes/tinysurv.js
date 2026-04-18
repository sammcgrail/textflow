import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// tinysurv — a tiny auto-battler in the Vampire Survivors spirit.
// Hero 'ᐊ' (tiny dragon) drifts toward the pointer (or wanders in a slow orbit when
// idle). Enemies spawn from the edges and converge on the hero; an
// auto-cannon fires the nearest-enemy-seeking projectiles. Kills drop
// XP orbs that home in on the hero. Level up → more projectiles per
// shot + faster fire rate. Built to POP: pre-seeded swarm so the very
// first frame already looks like a battlefield.

var hero = null;
var enemies = null;
var bullets = null;
var orbs = null;
var sparks = null;
var score = 0;
var level = 1;
var xp = 0;
var xpNext = 6;
var fireTimer = 0;
var spawnTimer = 0;
var lastTime = 0;
var deathFlash = 0;
var tsW = 0, tsH = 0;

var ENEMY_CHARS = ['Λ', 'V', 'Ψ', 'Ω', 'M', 'W', 'X', 'Y', '†', '∆'];

function spawnEnemy(W, H, forceEdge) {
  var edge = forceEdge !== undefined ? forceEdge : (Math.random() * 4) | 0;
  var x, y;
  if (edge === 0) { x = Math.random() * W; y = -1; }
  else if (edge === 1) { x = W + 1; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H + 1; }
  else { x = -1; y = Math.random() * H; }
  enemies.push({
    x: x, y: y,
    vx: 0, vy: 0,
    ch: ENEMY_CHARS[(Math.random() * ENEMY_CHARS.length) | 0],
    hp: 1 + ((Math.random() * (level * 0.4 + 0.5)) | 0),
    hue: 340 + Math.random() * 40,
    wiggle: Math.random() * Math.PI * 2
  });
}

function spawnOrb(x, y) {
  orbs.push({
    x: x, y: y,
    vx: (Math.random() - 0.5) * 1.5,
    vy: (Math.random() - 0.5) * 1.5 - 0.5,
    life: 8,
    hue: 160 + Math.random() * 30
  });
}

function spawnSpark(x, y, count, hue) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = 0.4 + Math.random() * 1.8;
    sparks.push({
      x: x, y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.4,
      maxLife: 0.75,
      ch: '*.+•'[(Math.random() * 4) | 0],
      hue: hue + Math.random() * 30 - 15
    });
  }
}

function initTinysurv() {
  tsW = state.COLS;
  tsH = state.ROWS;
  hero = { x: tsW * 0.5, y: tsH * 0.5, hp: 3, invinc: 0 };
  enemies = [];
  bullets = [];
  orbs = [];
  sparks = [];
  score = 0;
  level = 1;
  xp = 0;
  xpNext = 6;
  fireTimer = 0;
  spawnTimer = 0;
  lastTime = performance.now();
  deathFlash = 0;
  // pre-seed a swarm so first frame looks POPPING
  for (var i = 0; i < 18; i++) spawnEnemy(tsW, tsH, i % 4);
  // pre-seed some projectiles mid-flight
  for (var j = 0; j < 3; j++) {
    var a = Math.random() * Math.PI * 2;
    bullets.push({
      x: hero.x + Math.cos(a) * 4,
      y: hero.y + Math.sin(a) * 4,
      vx: Math.cos(a) * 1.2,
      vy: Math.sin(a) * 1.2,
      life: 2.0,
      hue: 55
    });
  }
  // pre-seed some XP orbs floating in
  for (var k = 0; k < 4; k++) {
    spawnOrb(hero.x + (Math.random() - 0.5) * 20, hero.y + (Math.random() - 0.5) * 8);
  }
}

function fireBullet(W, H) {
  // aim at nearest enemy
  var best = null, bd = 1e9;
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var dx = e.x - hero.x, dy = e.y - hero.y;
    var d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  var baseAngle;
  if (best) {
    baseAngle = Math.atan2(best.y - hero.y, best.x - hero.x);
  } else {
    baseAngle = state.time * 2;
  }
  // multi-shot at higher levels: 1 shot at lvl 1-2, 2 at 3-4, 3 at 5+
  var shots = 1 + Math.min(2, ((level - 1) / 2) | 0);
  var spread = shots > 1 ? 0.35 : 0;
  for (var s = 0; s < shots; s++) {
    var off = (s - (shots - 1) / 2) * spread;
    var a = baseAngle + off;
    bullets.push({
      x: hero.x,
      y: hero.y,
      vx: Math.cos(a) * 1.1,
      vy: Math.sin(a) * 1.1,
      life: 2.2,
      hue: 55 + s * 10
    });
  }
}

function renderTinysurv() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!hero || tsW !== W || tsH !== H) initTinysurv();

  var now = performance.now();
  var dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  var t = state.time;

  // hero follows pointer if active, else slow idle orbit around center
  if (pointer.down && state.currentMode === 'tinysurv') {
    var tx = pointer.gx;
    var ty = pointer.gy;
    hero.x += (tx - hero.x) * 0.18;
    hero.y += (ty - hero.y) * 0.18;
  } else {
    var ox = W * 0.5 + Math.cos(t * 0.35) * (W * 0.22);
    var oy = H * 0.5 + Math.sin(t * 0.5) * (H * 0.2);
    hero.x += (ox - hero.x) * 0.04;
    hero.y += (oy - hero.y) * 0.04;
  }
  hero.x = Math.max(1, Math.min(W - 2, hero.x));
  hero.y = Math.max(1, Math.min(H - 2, hero.y));
  if (hero.invinc > 0) hero.invinc -= dt;

  // fire rate scales with level: 0.42s at lvl 1 down to ~0.16s at lvl 6+
  fireTimer -= dt;
  var fireRate = Math.max(0.16, 0.42 - (level - 1) * 0.045);
  if (fireTimer <= 0) {
    fireTimer = fireRate;
    fireBullet(W, H);
  }

  // spawn enemies — cadence tightens with level
  spawnTimer -= dt;
  var spawnRate = Math.max(0.25, 1.0 - level * 0.08);
  if (spawnTimer <= 0) {
    spawnTimer = spawnRate;
    spawnEnemy(W, H);
    if (level >= 3 && Math.random() < 0.5) spawnEnemy(W, H);
  }
  // cap swarm size to avoid runaway
  if (enemies.length > 60) spawnTimer = spawnRate;

  // update enemies — pursue hero
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    var dx = hero.x - e.x, dy = hero.y - e.y;
    var d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    var spd = 0.22 + level * 0.02;
    e.vx = (dx / d) * spd + Math.cos(e.wiggle) * 0.15;
    e.vy = (dy / d) * spd + Math.sin(e.wiggle) * 0.15;
    e.wiggle += dt * 3;
    e.x += e.vx;
    e.y += e.vy;
    // contact with hero
    if (hero.invinc <= 0 && Math.abs(e.x - hero.x) < 1.0 && Math.abs(e.y - hero.y) < 0.8) {
      hero.hp--;
      hero.invinc = 1.2;
      deathFlash = 1.0;
      spawnSpark(hero.x, hero.y, 14, 0);
      enemies.splice(i, 1);
      continue;
    }
  }

  // update bullets — hit detection
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life -= dt;
    if (b.life <= 0 || b.x < -2 || b.x > W + 2 || b.y < -2 || b.y > H + 2) {
      bullets.splice(i, 1);
      continue;
    }
    // check enemy hit
    for (var j = enemies.length - 1; j >= 0; j--) {
      var e = enemies[j];
      if (Math.abs(b.x - e.x) < 0.9 && Math.abs(b.y - e.y) < 0.7) {
        e.hp--;
        spawnSpark(b.x, b.y, 4, 55);
        bullets.splice(i, 1);
        if (e.hp <= 0) {
          spawnSpark(e.x, e.y, 10, e.hue);
          spawnOrb(e.x, e.y);
          enemies.splice(j, 1);
          score += 10 * level;
        }
        break;
      }
    }
  }

  // update XP orbs — drift, then home in when close
  for (var i = orbs.length - 1; i >= 0; i--) {
    var o = orbs[i];
    var dx = hero.x - o.x, dy = hero.y - o.y;
    var d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    var pull = Math.min(0.35, 3 / d);
    o.vx = o.vx * 0.9 + (dx / d) * pull;
    o.vy = o.vy * 0.9 + (dy / d) * pull;
    o.x += o.vx;
    o.y += o.vy;
    o.life -= dt;
    if (d < 1.2 || o.life <= 0) {
      if (d < 1.2) {
        xp++;
        score += 2;
        if (xp >= xpNext) {
          xp = 0;
          level++;
          xpNext = 6 + level * 3;
          spawnSpark(hero.x, hero.y, 24, 55);
        }
      }
      orbs.splice(i, 1);
    }
  }

  // update sparks
  for (var i = sparks.length - 1; i >= 0; i--) {
    var p = sparks[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.life -= dt;
    if (p.life <= 0) sparks.splice(i, 1);
  }

  // death + respawn
  if (hero.hp <= 0) {
    spawnSpark(hero.x, hero.y, 30, 0);
    hero.hp = 3;
    hero.invinc = 2.0;
    level = Math.max(1, level - 1);
    xp = 0;
    enemies = enemies.slice(0, 4);
  }

  // decay flash
  if (deathFlash > 0) deathFlash = Math.max(0, deathFlash - dt * 1.2);

  // ---- RENDER ----

  // subtle radial backdrop — dark near hero glow
  // (the glow layer provides the real bloom; backdrop just hints at radius)
  var auraR = 6 + level * 0.6;
  for (var ang = 0; ang < 16; ang++) {
    var a = (ang / 16) * Math.PI * 2 + t * 0.8;
    var rx = (hero.x + Math.cos(a) * auraR) | 0;
    var ry = (hero.y + Math.sin(a) * auraR * 0.5) | 0;
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
      drawCharHSL('·', rx, ry, 55, 60, 18);
    }
  }

  // XP orbs — cyan/green, pulse
  for (var i = 0; i < orbs.length; i++) {
    var o = orbs[i];
    var ox = o.x | 0, oy = o.y | 0;
    if (ox < 0 || ox >= W || oy < 0 || oy >= H) continue;
    var pulse = 55 + Math.sin(t * 6 + i) * 15;
    drawCharHSL('o', ox, oy, o.hue | 0, 90, pulse);
  }

  // enemies — red/magenta, flash when damaged
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    var ex = e.x | 0, ey = e.y | 0;
    if (ex < 0 || ex >= W || ey < 0 || ey >= H) continue;
    var br = 55 + Math.sin(t * 4 + e.wiggle) * 8;
    drawCharHSL(e.ch, ex, ey, e.hue | 0, 85, br);
  }

  // bullets — yellow trail
  for (var i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    var bx = b.x | 0, by = b.y | 0;
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      drawCharHSL('*', bx, by, b.hue | 0, 95, 75);
    }
    // thin trail behind
    var tx = (b.x - b.vx * 1.2) | 0, ty = (b.y - b.vy * 1.2) | 0;
    if (tx >= 0 && tx < W && ty >= 0 && ty < H && (tx !== bx || ty !== by)) {
      drawCharHSL('.', tx, ty, b.hue | 0, 80, 45);
    }
  }

  // sparks
  for (var i = 0; i < sparks.length; i++) {
    var p = sparks[i];
    var sx = p.x | 0, sy = p.y | 0;
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
    var alpha = p.life / p.maxLife;
    drawCharHSL(p.ch, sx, sy, p.hue | 0, 85, 30 + alpha * 50);
  }

  // hero — green '@' with invincibility blink
  var hx = hero.x | 0, hy = hero.y | 0;
  var heroShow = hero.invinc <= 0 || (Math.sin(hero.invinc * 18) > 0);
  if (heroShow && hx >= 0 && hx < W && hy >= 0 && hy < H) {
    var heroHue = deathFlash > 0 ? 0 : 130;
    drawCharHSL('ᐊ', hx, hy, heroHue, 95, 75);
  }

  // HUD — bottom row, clear of the mobile nav overlay at top
  var hy = H - 2;
  var scoreStr = 'SCORE ' + score;
  for (var i = 0; i < scoreStr.length; i++) {
    drawCharHSL(scoreStr[i], 1 + i, hy, 55, 80, 70);
  }
  var lvlStr = 'LV' + level;
  for (var i = 0; i < lvlStr.length; i++) {
    drawCharHSL(lvlStr[i], 1 + i + scoreStr.length + 2, hy, 200, 80, 65);
  }
  // xp bar
  var barW = 10;
  var filled = (xp / xpNext) * barW;
  var barX = 1 + scoreStr.length + 2 + lvlStr.length + 1;
  for (var i = 0; i < barW; i++) {
    var isF = i < filled;
    drawCharHSL(isF ? '=' : '-', barX + i, hy, 200, isF ? 90 : 30, isF ? 60 : 25);
  }
  // hp as hearts
  for (var i = 0; i < 3; i++) {
    var hpChar = i < hero.hp ? '♥' : '·';
    drawCharHSL(hpChar, W - 4 + i, hy, 0, i < hero.hp ? 90 : 20, i < hero.hp ? 65 : 25);
  }
}

registerMode('tinysurv', { init: initTinysurv, render: renderTinysurv });
