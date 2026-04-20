import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// DragonFlow — Chinese dragon (long serpentine body, festival colors)
// Follows pointer. Long-press speeds up. Click spawns firework ember bursts.
// ============================================================

var df = null;

function initDragonflow() {
  var W = state.COLS, H = state.ROWS;
  var segCount = state.isMobile ? 32 : 52;
  var segs = [];
  var cx = W * 0.5, cy = H * 0.5;
  for (var i = 0; i < segCount; i++) {
    segs.push({ x: cx - i * 1.0, y: cy, a: 0 });
  }
  df = {
    W: W, H: H,
    segs: segs,
    segCount: segCount,
    targetX: cx + 6, targetY: cy,
    fierceness: 0, // 0..1 builds up while holding
    embers: [],
    banners: [],
    lanterns: [],
    whiskerOffset: 0,
    lastClickT: -999,
    autoOrbitT: 0
  };
  // Seed lanterns in background
  for (var l = 0; l < 10; l++) {
    df.lanterns.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.7,
      phase: Math.random() * 6.28,
      hue: 0 + Math.random() * 30
    });
  }
}

function spawnFirework(gx, gy, dir) {
  var count = 24 + Math.floor(Math.random() * 10);
  for (var i = 0; i < count; i++) {
    var ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    var spd = 4 + Math.random() * 7;
    var biasX = Math.cos(dir), biasY = Math.sin(dir);
    df.embers.push({
      x: gx, y: gy,
      vx: Math.cos(ang) * spd + biasX * 4,
      vy: Math.sin(ang) * spd + biasY * 4 - 1,
      life: 0.7 + Math.random() * 0.7,
      maxLife: 1.4,
      hue: [0, 30, 45, 340, 15][(i + (Math.random() * 5) | 0) % 5],
      ch: ['*', '+', '.', 'o', '#'][(i + (Math.random() * 5) | 0) % 5]
    });
  }
}

function updateEmbers(dt) {
  var W = df.W, H = df.H;
  for (var i = df.embers.length - 1; i >= 0; i--) {
    var e = df.embers[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += 6 * dt; // gravity
    e.vx *= 0.97;
    e.life -= dt;
    if (e.life <= 0 || e.y > H + 2) { df.embers.splice(i, 1); continue; }
  }
  // cap
  var max = state.isMobile ? 300 : 600;
  if (df.embers.length > max) df.embers.splice(0, df.embers.length - max);
}

function updateDragonflow() {
  var dt = 1 / 60;
  var W = df.W, H = df.H;
  var t = state.time;
  df.whiskerOffset += dt * 3;
  df.autoOrbitT += dt;

  // Determine target
  var targetX, targetY;
  if (pointer.down && state.currentMode === 'dragonflow') {
    targetX = pointer.gx;
    targetY = pointer.gy;
    df.fierceness = Math.min(1, df.fierceness + dt * 0.6);
  } else {
    // auto orbit
    var aot = df.autoOrbitT;
    var r = Math.min(W, H) * 0.32;
    targetX = W * 0.5 + Math.cos(aot * 0.6) * r;
    targetY = H * 0.5 + Math.sin(aot * 0.9) * r * 0.55;
    df.fierceness *= 0.985;
  }

  df.targetX = targetX;
  df.targetY = targetY;

  // Head follows target with easing
  var head = df.segs[0];
  var dx = targetX - head.x;
  var dy = targetY - head.y;
  var dist = Math.hypot(dx, dy);
  var ease = 0.08 + df.fierceness * 0.12;
  head.x += dx * ease;
  head.y += dy * ease;
  head.a = Math.atan2(dy, dx);

  // Body chain with sine undulation
  var segSpacing = 0.95;
  for (var i = 1; i < df.segs.length; i++) {
    var prev = df.segs[i - 1];
    var s = df.segs[i];
    var sdx = s.x - prev.x;
    var sdy = s.y - prev.y;
    var sdist = Math.hypot(sdx, sdy);
    if (sdist < 0.001) sdist = 0.001;
    // Pull to maintain spacing
    var pull = (sdist - segSpacing) / sdist;
    s.x -= sdx * pull;
    s.y -= sdy * pull;
    // Sine displacement perpendicular to spine
    var nx = -sdy / sdist, ny = sdx / sdist;
    var amp = 0.5 + df.fierceness * 0.5;
    var phase = i * 0.35 - t * (2 + df.fierceness * 3);
    s.x += nx * Math.sin(phase) * amp * 0.2;
    s.y += ny * Math.sin(phase) * amp * 0.2;
  }

  // Cool fierceness slowly without click
  if (!pointer.down) df.fierceness = Math.max(0, df.fierceness - dt * 0.25);

  // Clicks = firework burst
  if (pointer.clicked && state.currentMode === 'dragonflow') {
    pointer.clicked = false;
    var h2 = df.segs[0];
    spawnFirework(h2.x, h2.y, h2.a);
    // random boost
    df.fierceness = Math.min(1, df.fierceness + 0.35);
    df.lastClickT = t;
  }

  updateEmbers(dt);
}

function renderBackground() {
  var W = df.W, H = df.H;
  var t = state.time;
  // Red festival gradient
  for (var y = 0; y < H; y++) {
    var ratio = y / H;
    if ((y * 7 + (t * 5 | 0)) % 5 === 0) {
      var hue = 350 + ratio * 20;
      var lt = 8 + ratio * 10;
      drawCharHSL('.', ((y * 13 + ((t * 3) | 0)) % W), y, hue, 60, lt);
    }
  }
  // Lanterns
  for (var i = 0; i < df.lanterns.length; i++) {
    var la = df.lanterns[i];
    var sway = Math.sin(t * 1.2 + la.phase) * 0.5;
    var glow = 45 + Math.sin(t * 3 + la.phase) * 8;
    var lx = (la.x + sway) | 0;
    var ly = la.y | 0;
    if (lx >= 0 && lx < W && ly >= 0 && ly < H) {
      drawCharHSL('(', lx - 1, ly, la.hue, 90, glow);
      drawCharHSL('O', lx, ly, 40, 100, glow + 10);
      drawCharHSL(')', lx + 1, ly, la.hue, 90, glow);
      drawCharHSL('|', lx, ly - 1, 30, 50, 30);
    }
  }
}

function renderDragon() {
  var t = state.time;
  var f = df.fierceness;
  var segs = df.segs;
  var bodyChars = ['#', '%', '&', '@', '$'];

  // Banners/silk trail off tail (last 5 segs)
  // Body loop tail->head so head is on top
  for (var i = segs.length - 1; i >= 0; i--) {
    var s = segs[i];
    var sx = s.x | 0, sy = s.y | 0;
    if (sx < 0 || sx >= df.W || sy < 0 || sy >= df.H) continue;
    var isHead = (i === 0);
    var alongBody = i / segs.length;
    // Variable saturation pulses along body
    var pulse = Math.sin(t * 3 - i * 0.3) * 0.5 + 0.5;
    var hue = (45 - alongBody * 20 + pulse * 10); // gold->red->amber
    if (hue < 0) hue += 360;
    var sat = 90 + f * 10;
    var lt = 40 + pulse * 20 + (1 - alongBody) * 10 + f * 10;
    var ch = isHead ? 'D' : bodyChars[i % bodyChars.length];
    drawCharHSL(ch, sx, sy, hue, Math.min(sat, 100), Math.min(lt, 75));
    // Scales on sides
    if (!isHead && i % 2 === 0) {
      var ang = Math.atan2(segs[i - 1].y - s.y, segs[i - 1].x - s.x);
      var nx = -Math.sin(ang), ny = Math.cos(ang);
      var sx1 = (s.x + nx * 0.7) | 0, sy1 = (s.y + ny * 0.7) | 0;
      var sx2 = (s.x - nx * 0.7) | 0, sy2 = (s.y - ny * 0.7) | 0;
      if (sx1 >= 0 && sx1 < df.W && sy1 >= 0 && sy1 < df.H)
        drawCharHSL('*', sx1, sy1, hue, sat, lt - 15);
      if (sx2 >= 0 && sx2 < df.W && sy2 >= 0 && sy2 < df.H)
        drawCharHSL('*', sx2, sy2, hue, sat, lt - 15);
    }
  }

  // Head decorations: horns + eyes + whiskers
  var head = segs[0];
  var hx = head.x | 0, hy = head.y | 0;
  // Eye
  drawCharHSL('o', hx, hy - 1, 55, 100, 70 + f * 15);
  drawCharHSL('^', hx - 1, hy - 1, 45, 90, 55);
  drawCharHSL('^', hx + 1, hy - 1, 45, 90, 55);
  // Mouth (open when fierce)
  if (f > 0.4) {
    var mdir = head.a;
    var mx = hx + Math.cos(mdir) * 1.5;
    var my = hy + Math.sin(mdir) * 1.5;
    drawCharHSL('W', mx | 0, my | 0, 10, 100, 60);
  }
  // Whiskers trailing behind head
  var whiskerLen = 6;
  for (var w = 0; w < 2; w++) {
    var side = w === 0 ? 1 : -1;
    for (var j = 1; j <= whiskerLen; j++) {
      var ang = head.a + Math.PI + side * (0.3 + Math.sin(df.whiskerOffset + j * 0.5 + w) * 0.25);
      var wx = head.x + Math.cos(ang) * j * 0.9;
      var wy = head.y + Math.sin(ang) * j * 0.9 + Math.sin(df.whiskerOffset + j * 0.8) * 0.4;
      if (wx | 0 >= 0 && (wx | 0) < df.W && (wy | 0) >= 0 && (wy | 0) < df.H) {
        var ch = j > whiskerLen - 2 ? '~' : (j > 2 ? '-' : '~');
        drawCharHSL(ch, wx | 0, wy | 0, 40, 80, 55 - j * 2);
      }
    }
    // Silk banner ending each whisker
    var bang = head.a + Math.PI + side * 0.35;
    var bx = head.x + Math.cos(bang) * whiskerLen;
    var by = head.y + Math.sin(bang) * whiskerLen;
    if ((bx | 0) >= 0 && (bx | 0) < df.W && (by | 0) >= 0 && (by | 0) < df.H) {
      drawCharHSL('/', bx | 0, by | 0, 0, 100, 55);
      drawCharHSL('\\', ((bx + 1) | 0), (by | 0) + 1, 0, 100, 50);
    }
  }
}

function renderEmbers() {
  for (var i = 0; i < df.embers.length; i++) {
    var e = df.embers[i];
    if (e.x < 0 || e.x >= df.W || e.y < 0 || e.y >= df.H) continue;
    var a = e.life / e.maxLife;
    drawCharHSL(e.ch, e.x | 0, e.y | 0, e.hue, 95, 30 + a * 50);
  }
}

function renderPrompt() {
  var t = state.time;
  if (t - df.lastClickT < 2) return;
  if (df.fierceness > 0.1) return;
  var W = df.W, H = df.H;
  var lines = ['DRAG = LEAD THE DRAGON', 'HOLD = RILE UP', 'CLICK = FIREWORKS'];
  var startY = H - 5;
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    var sx = Math.floor(W / 2 - line.length / 2);
    for (var c = 0; c < line.length; c++) {
      if (line[c] === ' ') continue;
      var bright = 40 + Math.sin(t * 1.5 + c * 0.2) * 10;
      drawCharHSL(line[c], sx + c, startY + l, 45, 70, bright);
    }
  }
}

function renderDragonflow() {
  clearCanvas();
  if (!df || df.W !== state.COLS || df.H !== state.ROWS) initDragonflow();
  updateDragonflow();
  renderBackground();
  renderDragon();
  renderEmbers();
  renderPrompt();
}

registerMode('dragonflow', {
  init: initDragonflow,
  render: renderDragonflow
});
