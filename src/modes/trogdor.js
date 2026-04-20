import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Trogdor — the Burninator
// Homage to Homestar Runner. S-shaped dragon, peasants, cottages,
// knights, archer arrows, burnination meter.
// ============================================================

var trog = null;

function makeCottage(x, y) {
  return {
    x: x, y: y, w: 6, h: 3,
    burnt: 0, // 0 = healthy, 1 = burnt
    burning: 0
  };
}

function makePeasant(x, y) {
  return {
    x: x, y: y,
    dx: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.08),
    dy: 0,
    phase: Math.random() * 6.28,
    alive: true
  };
}

function makeKnight(x, y, color) {
  return {
    x: x, y: y,
    dx: (Math.random() < 0.5 ? -1 : 1) * 0.16,
    dy: 0,
    color: color, // 'R' or 'B'
    turnTimer: 1 + Math.random() * 3
  };
}

function makeArrow(x, y, vx, vy) {
  return { x: x, y: y, vx: vx, vy: vy, life: 3 };
}

function makeArcher(edge) {
  // edge: 'left' or 'right'
  return {
    edge: edge,
    y: 4 + Math.random() * 4,
    cd: 1 + Math.random() * 2
  };
}

function initTrogdor() {
  var W = state.COLS, H = state.ROWS;
  var hi = 0;
  try { hi = parseInt(localStorage.getItem('trogdor_hi') || '0', 10) || 0; } catch (e) { hi = 0; }
  trog = {
    W: W, H: H,
    dragonX: W * 0.3,
    dragonY: H * 0.55,
    dragonVX: 0,
    dragonVY: 0,
    dragonFacing: 1, // 1 right, -1 left
    speed: 0.35,
    burnination: 0, // 0..100
    burninated: false,
    burninatedTimer: 0,
    breathing: false,
    fireParticles: [],
    peasants: [],
    cottages: [],
    knights: [],
    arrows: [],
    archers: [],
    stars: [],
    score: 0,
    highScore: hi,
    peasantsStomped: 0,
    cottagesBurnt: 0,
    gameOver: false,
    started: false,
    lives: 3,
    hitCooldown: 0,
    screenShake: 0,
    keys: { up: false, down: false, left: false, right: false, fire: false },
    // on-screen dpad state for mobile (grid coords computed each frame)
    dpadActive: null,
    lastTouchFrame: 0
  };

  // Seed background stars
  for (var i = 0; i < 24; i++) {
    trog.stars.push({
      x: Math.random() * W,
      y: Math.random() * (H * 0.55),
      ch: Math.random() < 0.5 ? '*' : '.',
      hue: 280 + Math.random() * 40,
      phase: Math.random() * 6.28
    });
  }

  // Seed cottages (avoid top sky area + bottom stomp zone)
  var cottageCount = state.isMobile ? 4 : 6;
  for (var c = 0; c < cottageCount; c++) {
    var cx = 6 + Math.floor(Math.random() * Math.max(1, W - 18));
    var cy = 8 + Math.floor(Math.random() * Math.max(1, H - 16));
    trog.cottages.push(makeCottage(cx, cy));
  }

  // Seed peasants on "ground"
  var peasantCount = state.isMobile ? 5 : 8;
  for (var p = 0; p < peasantCount; p++) {
    var px = 4 + Math.random() * (W - 8);
    var py = H - 3 - Math.random() * 2;
    trog.peasants.push(makePeasant(px, py));
  }

  // Seed knights
  var knightCount = state.isMobile ? 2 : 3;
  for (var k = 0; k < knightCount; k++) {
    var kx = 4 + Math.random() * (W - 8);
    var ky = H - 4 - Math.random() * 3;
    trog.knights.push(makeKnight(kx, ky, Math.random() < 0.5 ? 'R' : 'B'));
  }

  // Archers on edges
  trog.archers.push(makeArcher('left'));
  trog.archers.push(makeArcher('right'));
}

function resetGame() {
  var prevHi = trog ? trog.highScore : 0;
  initTrogdor();
  trog.highScore = prevHi;
}

function onHit() {
  if (!trog || trog.hitCooldown > 0) return;
  trog.lives--;
  trog.hitCooldown = 2;
  trog.screenShake = 8;
  if (trog.lives <= 0) {
    trog.gameOver = true;
    if (trog.score > trog.highScore) {
      trog.highScore = trog.score;
      try { localStorage.setItem('trogdor_hi', String(trog.highScore)); } catch (e) {}
    }
  }
}

function spawnFireParticle(x, y, vx, vy) {
  trog.fireParticles.push({
    x: x, y: y, vx: vx, vy: vy,
    life: 0.5 + Math.random() * 0.4,
    maxLife: 0.9,
    hue: 10 + Math.random() * 35
  });
}

function breatheFire(dt) {
  if (!trog.burninated) return;
  // Spawn fire particles from dragon mouth area in facing direction
  var mx = trog.dragonX + trog.dragonFacing * 3;
  var my = trog.dragonY;
  for (var i = 0; i < 4; i++) {
    var speed = 10 + Math.random() * 8;
    var spread = (Math.random() - 0.5) * 1.2;
    spawnFireParticle(
      mx, my + (Math.random() - 0.5) * 0.6,
      trog.dragonFacing * speed + (Math.random() - 0.5) * 2,
      spread - 1.5
    );
  }
}

function updateFireParticles(dt) {
  var W = trog.W, H = trog.H;
  for (var i = trog.fireParticles.length - 1; i >= 0; i--) {
    var p = trog.fireParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 6 * dt; // slight gravity
    p.vx *= 0.96;
    p.life -= dt;
    if (p.life <= 0 || p.x < -2 || p.x > W + 2 || p.y < -2 || p.y > H + 2) {
      trog.fireParticles.splice(i, 1);
      continue;
    }
    // burn cottages on overlap
    for (var c = 0; c < trog.cottages.length; c++) {
      var co = trog.cottages[c];
      if (co.burnt >= 1) continue;
      if (p.x >= co.x && p.x < co.x + co.w && p.y >= co.y && p.y < co.y + co.h) {
        co.burning += dt * 0.8;
        if (co.burning >= 1 && co.burnt < 1) {
          co.burnt = 1;
          trog.cottagesBurnt++;
          trog.score += 500;
          // burst of particles
          for (var k = 0; k < 14; k++) {
            var ang = Math.random() * Math.PI * 2;
            spawnFireParticle(co.x + co.w / 2, co.y + co.h / 2,
              Math.cos(ang) * 8, Math.sin(ang) * 6 - 2);
          }
        }
      }
    }
    // burn peasants on overlap
    for (var pi = 0; pi < trog.peasants.length; pi++) {
      var pe = trog.peasants[pi];
      if (!pe.alive) continue;
      var d = Math.abs(p.x - pe.x) + Math.abs(p.y - pe.y) * 0.5;
      if (d < 1.3) {
        pe.alive = false;
        trog.score += 30;
      }
    }
  }
}

function updatePeasants(dt) {
  var W = trog.W, H = trog.H;
  // Respawn peasants occasionally so screen isn't empty
  var aliveCount = 0;
  for (var i = 0; i < trog.peasants.length; i++) if (trog.peasants[i].alive) aliveCount++;
  var desired = state.isMobile ? 5 : 8;
  if (aliveCount < desired && Math.random() < 0.04) {
    trog.peasants.push(makePeasant(
      2 + Math.random() * (W - 4),
      H - 3 - Math.random() * 2
    ));
  }
  // Clean dead older ones
  for (var i = trog.peasants.length - 1; i >= 0; i--) {
    if (!trog.peasants[i].alive && Math.random() < 0.02) trog.peasants.splice(i, 1);
  }

  for (var i = 0; i < trog.peasants.length; i++) {
    var pe = trog.peasants[i];
    if (!pe.alive) continue;
    pe.x += pe.dx * dt * 60;
    pe.phase += dt * 4;
    if (pe.x < 2 || pe.x > W - 2) pe.dx *= -1;

    // Check stomp
    var ddx = pe.x - trog.dragonX;
    var ddy = pe.y - trog.dragonY;
    if (Math.abs(ddx) < 2.4 && Math.abs(ddy) < 1.4) {
      pe.alive = false;
      trog.score += 50;
      trog.peasantsStomped++;
      // add to burnination meter
      if (!trog.burninated) {
        trog.burnination += 10;
        if (trog.burnination >= 100) {
          trog.burnination = 100;
          trog.burninated = true;
          trog.burninatedTimer = 8;
        }
      }
    }
  }
}

function updateKnights(dt) {
  var W = trog.W, H = trog.H;
  for (var i = 0; i < trog.knights.length; i++) {
    var k = trog.knights[i];
    k.x += k.dx * dt * 60;
    k.turnTimer -= dt;
    if (k.turnTimer <= 0 || k.x < 2 || k.x > W - 2) {
      k.dx *= -1;
      k.turnTimer = 1 + Math.random() * 3;
    }
    // Collide with dragon
    var ddx = k.x - trog.dragonX;
    var ddy = k.y - trog.dragonY;
    if (Math.abs(ddx) < 2.2 && Math.abs(ddy) < 1.2) {
      if (trog.burninated) {
        // Burninate the knight instead
        k.x = 2 + Math.random() * (W - 4);
        k.y = H - 4 - Math.random() * 3;
        trog.score += 100;
      } else {
        onHit();
      }
    }
  }
}

function updateArchers(dt) {
  var W = trog.W, H = trog.H;
  for (var i = 0; i < trog.archers.length; i++) {
    var a = trog.archers[i];
    a.cd -= dt;
    if (a.cd <= 0) {
      var sx = a.edge === 'left' ? 1 : W - 2;
      var dir = a.edge === 'left' ? 1 : -1;
      trog.arrows.push(makeArrow(sx, a.y, dir * 12, (Math.random() - 0.5) * 2));
      a.cd = 2 + Math.random() * 2.5;
    }
  }
}

function updateArrows(dt) {
  var W = trog.W, H = trog.H;
  for (var i = trog.arrows.length - 1; i >= 0; i--) {
    var ar = trog.arrows[i];
    ar.x += ar.vx * dt;
    ar.y += ar.vy * dt;
    ar.life -= dt;
    if (ar.life <= 0 || ar.x < -2 || ar.x > W + 2 || ar.y < 0 || ar.y > H) {
      trog.arrows.splice(i, 1);
      continue;
    }
    var ddx = ar.x - trog.dragonX;
    var ddy = ar.y - trog.dragonY;
    if (Math.abs(ddx) < 1.5 && Math.abs(ddy) < 1) {
      onHit();
      trog.arrows.splice(i, 1);
    }
  }
}

function updateDragon(dt) {
  var W = trog.W, H = trog.H;
  var vx = 0, vy = 0;
  if (trog.keys.up) vy -= 1;
  if (trog.keys.down) vy += 1;
  if (trog.keys.left) vx -= 1;
  if (trog.keys.right) vx += 1;
  // Normalize
  var mag = Math.hypot(vx, vy);
  if (mag > 0) { vx /= mag; vy /= mag; trog.dragonFacing = vx >= 0 ? 1 : -1; }

  var sp = 16 * dt;
  trog.dragonX += vx * sp;
  trog.dragonY += vy * sp * 0.7;

  // clamp
  if (trog.dragonX < 3) trog.dragonX = 3;
  if (trog.dragonX > W - 4) trog.dragonX = W - 4;
  if (trog.dragonY < 2) trog.dragonY = 2;
  if (trog.dragonY > H - 2) trog.dragonY = H - 2;

  if (trog.burninated) {
    trog.burninatedTimer -= dt;
    if (trog.burninatedTimer <= 0) {
      trog.burninated = false;
      trog.burnination = 0;
    }
  }

  if (trog.keys.fire) breatheFire(dt);
  if (trog.hitCooldown > 0) trog.hitCooldown -= dt;
  if (trog.screenShake > 0) trog.screenShake = Math.max(0, trog.screenShake - dt * 20);
}

function renderBackground() {
  var W = trog.W, H = trog.H;
  var t = state.time;
  // Sky gradient
  var groundY = H - 2;
  for (var y = 0; y < groundY; y++) {
    var ratio = y / groundY;
    // Purple sky -> orange horizon
    var hue = 270 - ratio * 40;
    var sat = 45;
    var lt = 8 + ratio * 14;
    if ((y + ((y * 7) | 0)) % 3 === 0) {
      drawCharHSL('.', ((y * 11) % W), y, hue, sat, lt);
    }
  }
  // Stars
  for (var i = 0; i < trog.stars.length; i++) {
    var s = trog.stars[i];
    var tw = 35 + Math.sin(t * 2 + s.phase) * 20;
    drawCharHSL(s.ch, s.x | 0, s.y | 0, s.hue, 70, Math.max(20, tw));
  }
  // Mountains silhouette
  for (var x = 0; x < W; x++) {
    var mh = 3 + Math.sin(x * 0.25) * 2 + Math.sin(x * 0.7) * 1;
    var my = (groundY - 3 - mh) | 0;
    if (my > 0 && my < H) {
      drawCharHSL('#', x, my, 280, 30, 12);
      drawCharHSL('*', x, my + 1, 280, 30, 10);
    }
  }
  // Ground
  for (var x = 0; x < W; x++) {
    drawCharHSL('_', x, groundY, 30, 55, 22);
    drawCharHSL('.', x, groundY + 1, 30, 40, 12);
  }
}

function renderCottages() {
  for (var i = 0; i < trog.cottages.length; i++) {
    var co = trog.cottages[i];
    if (co.burnt >= 1) {
      // Charred ruins
      for (var y = 0; y < co.h; y++) {
        for (var x = 0; x < co.w; x++) {
          drawCharHSL('#', co.x + x, co.y + y, 0, 20, 15);
        }
      }
      continue;
    }
    // Roof (thatched /\ pattern)
    var roofHue = co.burning > 0 ? 20 : 35;
    var roofL = co.burning > 0 ? (40 + Math.random() * 20) : 42;
    drawCharHSL('/', co.x, co.y, roofHue, 70, roofL);
    for (var x = 1; x < co.w - 1; x++) {
      drawCharHSL('^', co.x + x, co.y, roofHue, 70, roofL - 5);
    }
    drawCharHSL('\\', co.x + co.w - 1, co.y, roofHue, 70, roofL);
    // Walls
    for (var y = 1; y < co.h; y++) {
      drawCharHSL('|', co.x, co.y + y, 25, 40, 35);
      for (var x = 1; x < co.w - 1; x++) {
        var chr = (x === Math.floor(co.w / 2) && y === co.h - 1) ? 'D' : '=';
        drawCharHSL(chr, co.x + x, co.y + y, 25, 40, 30);
      }
      drawCharHSL('|', co.x + co.w - 1, co.y + y, 25, 40, 35);
    }
    // Burning flames on top
    if (co.burning > 0) {
      var b = Math.min(co.burning, 1);
      for (var fi = 0; fi < 3; fi++) {
        var fx = co.x + 1 + ((fi * 7 + ((state.time * 3) | 0)) % Math.max(1, co.w - 2));
        drawCharHSL(Math.random() < 0.5 ? '*' : '^', fx, co.y - 1, 15 + Math.random() * 20, 100, 50 + b * 25);
      }
    }
  }
}

function renderPeasants() {
  var t = state.time;
  for (var i = 0; i < trog.peasants.length; i++) {
    var pe = trog.peasants[i];
    if (!pe.alive) continue;
    var bob = Math.sin(pe.phase + t * 5) * 0.3;
    var y = (pe.y + bob) | 0;
    // red dot with hat
    drawCharHSL('o', pe.x | 0, y, 0, 85, 55);
    drawCharHSL('i', pe.x | 0, y - 1, 40, 60, 45);
  }
}

function renderKnights() {
  for (var i = 0; i < trog.knights.length; i++) {
    var k = trog.knights[i];
    var hue = k.color === 'R' ? 0 : 220;
    drawCharHSL('K', k.x | 0, k.y | 0, hue, 90, 55);
    drawCharHSL('A', k.x | 0, (k.y - 1) | 0, hue, 60, 45); // helmet
  }
}

function renderArrows() {
  for (var i = 0; i < trog.arrows.length; i++) {
    var ar = trog.arrows[i];
    var ch = ar.vx > 0 ? '>' : '<';
    drawCharHSL(ch, ar.x | 0, ar.y | 0, 60, 90, 60);
    drawCharHSL(ch, (ar.x - Math.sign(ar.vx)) | 0, ar.y | 0, 60, 70, 40);
  }
}

function renderArchers() {
  for (var i = 0; i < trog.archers.length; i++) {
    var a = trog.archers[i];
    var x = a.edge === 'left' ? 0 : trog.W - 1;
    drawCharHSL('S', x, a.y | 0, 300, 70, 45); // Siamese
    drawCharHSL('}', x, (a.y - 1) | 0, 40, 60, 40);
  }
}

function renderDragon() {
  var t = state.time;
  var x = trog.dragonX | 0;
  var y = trog.dragonY | 0;
  var f = trog.dragonFacing;
  var burnt = trog.burninated;
  var blink = trog.hitCooldown > 0 && Math.floor(t * 12) % 2 === 0;
  var pulse = Math.sin(t * 8) * 0.5 + 0.5;

  var bodyHue = burnt ? (10 + pulse * 30) : 18;
  var bodySat = burnt ? 100 : 85;
  var bodyL = burnt ? (55 + pulse * 20) : 45;
  if (blink) bodyL = 25;

  // S-shape + tail: draw 5 body segments forming a subtle S along x
  // Layout: tail — body — neck — head — arm
  // At facing=1 (right):
  //   .__          <-- spikes
  //  {_S_>
  //   /Y
  // We'll place chars:
  var tailX = x - 3 * f;
  var bodyX = x - 2 * f;
  var midX = x - 1 * f;
  var headX = x;
  var mouthX = x + 1 * f;

  // Tail curl
  drawCharHSL('~', tailX, y, bodyHue, bodySat, bodyL - 10);
  drawCharHSL(',', tailX, y + 1, bodyHue, bodySat, bodyL - 15);
  // Body segments (S undulation)
  drawCharHSL('S', bodyX, y, bodyHue, bodySat, bodyL);
  drawCharHSL('s', midX, y, bodyHue, bodySat, bodyL);
  // Spikes on back
  drawCharHSL('^', bodyX, y - 1, bodyHue, bodySat, bodyL + 10);
  drawCharHSL('^', midX, y - 1, bodyHue, bodySat, bodyL + 10);
  // Head
  var headCh = f > 0 ? '>' : '<';
  drawCharHSL(headCh, headX, y, bodyHue, bodySat, bodyL + 12);
  // Eye
  drawCharHSL('o', headX, y - 1, 50, 90, burnt ? 70 : 55);
  // Mouth (when breathing, show open)
  if (trog.keys.fire && burnt) {
    drawCharHSL('~', mouthX, y, 10, 100, 65);
  }
  // THE BEEFY ARM (Trogdor signature)
  var armX = x - 1 * f; // one back from head, sticking down
  drawCharHSL('/', armX, y + 1, bodyHue, bodySat, bodyL);
  drawCharHSL('T', armX + f, y + 1, bodyHue, bodySat, bodyL);

  // Burnination aura
  if (burnt) {
    for (var ax = -3; ax <= 3; ax++) {
      for (var ay = -2; ay <= 1; ay++) {
        if (Math.random() < 0.12) {
          var px = x + ax, py = y + ay;
          if (px >= 0 && px < trog.W && py >= 0 && py < trog.H) {
            drawCharHSL(Math.random() < 0.5 ? '*' : '.', px, py,
              10 + Math.random() * 30, 100, 40 + Math.random() * 25);
          }
        }
      }
    }
  }
}

function renderFireParticles() {
  for (var i = 0; i < trog.fireParticles.length; i++) {
    var p = trog.fireParticles[i];
    if (p.x < 0 || p.x >= trog.W || p.y < 0 || p.y >= trog.H) continue;
    var a = p.life / p.maxLife;
    var ch = a > 0.65 ? '@' : a > 0.35 ? '*' : '.';
    drawCharHSL(ch, p.x | 0, p.y | 0, p.hue, 100, 30 + a * 45);
  }
}

function renderHUD() {
  var W = trog.W, H = trog.H;
  var t = state.time;
  // Top bar
  var scoreStr = 'SCORE ' + trog.score + '  HI ' + trog.highScore;
  for (var i = 0; i < scoreStr.length; i++) {
    drawCharHSL(scoreStr[i], 2 + i, 0, 45, 90, 65);
  }
  var lifeStr = 'LIVES:';
  for (var i = 0; i < lifeStr.length; i++) {
    drawCharHSL(lifeStr[i], W - 14 + i, 0, 0, 70, 55);
  }
  for (var l = 0; l < 3; l++) {
    var active = l < trog.lives;
    drawCharHSL(active ? '@' : '.', W - 7 + l * 2, 0, 0, active ? 100 : 20, active ? 60 : 20);
  }
  // Burnination meter
  var meterY = 1;
  var meterW = Math.min(30, W - 6);
  var meterX = Math.floor((W - meterW) / 2);
  var labelStr = 'BURNINATION';
  for (var i = 0; i < labelStr.length; i++) {
    var hue = trog.burninated ? (10 + Math.sin(t * 8 + i) * 20) : 30;
    drawCharHSL(labelStr[i], meterX + i, meterY, hue, 90, 60);
  }
  var filled = Math.floor((trog.burnination / 100) * meterW);
  for (var i = 0; i < meterW; i++) {
    var on = i < filled;
    var hue = on ? (10 + i * 2) : 220;
    var sat = on ? 100 : 30;
    var lt = on ? (50 + Math.sin(t * 6 + i) * 15) : 15;
    var ch = on ? '#' : '-';
    drawCharHSL(ch, meterX + i, meterY + 1, hue, sat, lt);
  }
  // Counter
  var stomped = 'P:' + trog.peasantsStomped;
  for (var i = 0; i < stomped.length; i++) {
    drawCharHSL(stomped[i], 2 + i, 2, 0, 70, 50);
  }
  var burnt = 'C:' + trog.cottagesBurnt;
  for (var i = 0; i < burnt.length; i++) {
    drawCharHSL(burnt[i], W - 10 + i, 2, 20, 90, 55);
  }
}

function renderDpad() {
  // Mobile on-screen dpad. Draw four arrow pads + FIRE button at bottom.
  if (!state.isMobile) return;
  var W = trog.W, H = trog.H;
  var padSize = 3;
  var cx = 4;
  var cy = H - 4;
  // Draw cross
  function drawPad(px, py, ch, active) {
    var hue = active ? 45 : 200;
    var sat = active ? 90 : 40;
    var lt = active ? 65 : 35;
    drawCharHSL('[', px - 1, py, hue, sat, lt);
    drawCharHSL(ch, px, py, hue, sat, lt + 10);
    drawCharHSL(']', px + 1, py, hue, sat, lt);
  }
  drawPad(cx, cy - 1, '^', trog.keys.up);
  drawPad(cx, cy + 1, 'v', trog.keys.down);
  drawPad(cx - 3, cy, '<', trog.keys.left);
  drawPad(cx + 3, cy, '>', trog.keys.right);
  // FIRE button
  var fx = W - 8;
  var fy = H - 4;
  var fActive = trog.keys.fire;
  var fHue = trog.burninated ? 10 : 0;
  var fSat = trog.burninated ? 100 : 40;
  var fLt = fActive ? 70 : (trog.burninated ? 55 : 30);
  var fireStr = '[FIRE]';
  for (var i = 0; i < fireStr.length; i++) {
    drawCharHSL(fireStr[i], fx + i, fy, fHue, fSat, fLt);
  }
}

function handleDpadInput() {
  // When touch/pointer is down, check against dpad hit boxes and update keys
  if (!state.isMobile) return;
  // Reset dpad-driven keys each frame (keyboard layer separately held via key events)
  // For mobile, only dpad drives — so just overwrite.
  trog.keys.up = false;
  trog.keys.down = false;
  trog.keys.left = false;
  trog.keys.right = false;
  trog.keys.fire = false;

  if (!pointer.down) return;

  var W = trog.W, H = trog.H;
  var gx = pointer.gx, gy = pointer.gy;
  var cx = 4, cy = H - 4;
  // Dpad buttons (hit radius 2)
  if (Math.abs(gx - cx) <= 2 && Math.abs(gy - (cy - 1)) <= 1) trog.keys.up = true;
  if (Math.abs(gx - cx) <= 2 && Math.abs(gy - (cy + 1)) <= 1) trog.keys.down = true;
  if (Math.abs(gx - (cx - 3)) <= 2 && Math.abs(gy - cy) <= 1) trog.keys.left = true;
  if (Math.abs(gx - (cx + 3)) <= 2 && Math.abs(gy - cy) <= 1) trog.keys.right = true;
  // Fire button
  var fx = W - 8, fy = H - 4;
  if (gx >= fx - 1 && gx <= fx + 6 && Math.abs(gy - fy) <= 1) trog.keys.fire = true;
}

function renderGameOver() {
  if (!trog.gameOver) return;
  var W = trog.W, H = trog.H;
  var t = state.time;
  var lines = [
    'BURNINATE FOREVERMORE',
    '',
    'FINAL SCORE: ' + trog.score,
    'PEASANTS STOMPED: ' + trog.peasantsStomped,
    'COTTAGES BURNINATED: ' + trog.cottagesBurnt,
    '',
    'TAP OR PRESS ANY KEY TO RESTART'
  ];
  var startY = Math.floor(H / 2 - lines.length / 2);
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    var sx = Math.floor(W / 2 - line.length / 2);
    for (var c = 0; c < line.length; c++) {
      if (line[c] === ' ') continue;
      var hue = l === 0 ? (10 + Math.sin(t * 4 + c * 0.3) * 20) : 45;
      var bright = l === 0 ? (55 + Math.sin(t * 3) * 15) : 55;
      drawCharHSL(line[c], sx + c, startY + l, hue, 90, bright);
    }
  }
}

function renderStart() {
  if (trog.started) return;
  var W = trog.W, H = trog.H;
  var t = state.time;
  var lines = [
    'TROGDOR',
    'THE BURNINATOR',
    '',
    'ARROWS/WASD = MOVE    SPACE = FIRE',
    'TAP/CLICK OR PRESS TO BEGIN'
  ];
  var startY = Math.floor(H / 2 - lines.length / 2) - 4;
  for (var l = 0; l < lines.length; l++) {
    var line = lines[l];
    var sx = Math.floor(W / 2 - line.length / 2);
    for (var c = 0; c < line.length; c++) {
      if (line[c] === ' ') continue;
      var hue = l < 2 ? (10 + Math.sin(t * 2 + c * 0.3) * 25) : 45;
      var bright = l < 2 ? (55 + Math.sin(t * 2) * 15) : 55;
      drawCharHSL(line[c], sx + c, startY + l, hue, 90, bright);
    }
  }
}

function renderTrogdor() {
  clearCanvas();
  if (!trog || trog.W !== state.COLS || trog.H !== state.ROWS) initTrogdor();
  var dt = 1 / 60;

  // Handle interactions
  if (pointer.clicked && state.currentMode === 'trogdor') {
    pointer.clicked = false;
    if (trog.gameOver) { resetGame(); return; }
    if (!trog.started) { trog.started = true; }
  }

  // Mobile: dpad input BEFORE gameplay updates
  if (state.isMobile && trog.started && !trog.gameOver) {
    handleDpadInput();
  }

  if (trog.started && !trog.gameOver) {
    updateDragon(dt);
    updatePeasants(dt);
    updateKnights(dt);
    updateArchers(dt);
    updateArrows(dt);
    updateFireParticles(dt);
  }

  // Render layers
  renderBackground();
  renderCottages();
  renderPeasants();
  renderKnights();
  renderArrows();
  renderArchers();
  renderDragon();
  renderFireParticles();
  renderHUD();
  renderDpad();
  renderStart();
  renderGameOver();
}

// ============================================================
// Keyboard handlers (attach/cleanup pattern from snakegame.js)
// ============================================================
var _keyDown = null;
var _keyUp = null;

function attachTrogdor() {
  cleanupTrogdor();
  _keyDown = function(e) {
    if (state.currentMode !== 'trogdor') return;
    if (!trog) return;
    if (trog.gameOver) { resetGame(); return; }
    if (!trog.started) trog.started = true;
    var k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { trog.keys.up = true; e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { trog.keys.down = true; e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { trog.keys.left = true; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { trog.keys.right = true; e.preventDefault(); }
    else if (k === ' ' || k === 'Spacebar') { trog.keys.fire = true; e.preventDefault(); }
  };
  _keyUp = function(e) {
    if (state.currentMode !== 'trogdor') return;
    if (!trog) return;
    var k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') trog.keys.up = false;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') trog.keys.down = false;
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') trog.keys.left = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') trog.keys.right = false;
    else if (k === ' ' || k === 'Spacebar') trog.keys.fire = false;
  };
  window.addEventListener('keydown', _keyDown);
  window.addEventListener('keyup', _keyUp);
}

function cleanupTrogdor() {
  if (_keyDown) { window.removeEventListener('keydown', _keyDown); _keyDown = null; }
  if (_keyUp) { window.removeEventListener('keyup', _keyUp); _keyUp = null; }
}

registerMode('trogdor', {
  init: initTrogdor,
  render: renderTrogdor,
  attach: attachTrogdor,
  cleanup: cleanupTrogdor
});
