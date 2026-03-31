import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ─── Device orientation / mouse fallback ───
var tiltX = 0, tiltY = 0;
var rawBeta = 0, rawGamma = 0;
var hasMotion = false;

function handleOrientation(e) {
  rawBeta = e.beta || 0;
  rawGamma = e.gamma || 0;
  hasMotion = true;
}

function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(s) {
      if (s === 'granted') window.addEventListener('deviceorientation', handleOrientation);
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
  }
}

var mouseX = 0.5, mouseY = 0.5;
function handleMouseMove(e) {
  mouseX = e.clientX / window.innerWidth;
  mouseY = e.clientY / window.innerHeight;
}

// ─── Touch / click for flippers ───
var leftFlipperActive = false, rightFlipperActive = false;
var touchStartHandler, touchEndHandler, mouseDownHandler, mouseUpHandler;

function activateFlipper(x) {
  if (x < window.innerWidth * 0.5) { leftFlipperActive = true; }
  else { rightFlipperActive = true; }
}
function deactivateFlipper(x) {
  if (x < window.innerWidth * 0.5) { leftFlipperActive = false; }
  else { rightFlipperActive = false; }
}

// ─── Game state ───
var pbBalls, pbBumpers, pbBonusTargets, pbScoreLanes;
var pbScore, pbBallsLeft, pbLaunched, pbGameOver;
var pbFlipperL, pbFlipperR;
var pbParticles, pbScorePopups, pbTrails;
var pbTiltLocked, pbTiltLockEnd;
var pbMultiballNext;
var pbW, pbH;
var pbLastTime;

// Table geometry helpers
function tableLeft() { return 1; }
function tableRight() { return pbW - 2; }
function tableTop() { return 3; }
function tableBottom() { return pbH - 2; }
function drainLeft() { return Math.floor(pbW * 0.35); }
function drainRight() { return Math.floor(pbW * 0.65); }

function makeBall(x, y, vx, vy) {
  return { x: x, y: y, vx: vx, vy: vy, alive: true };
}

function makeBumper(x, y, r, pts, ch) {
  return { x: x, y: y, r: r, pts: pts, ch: ch, flashTime: 0 };
}

function makeBonusTarget(x, y) {
  return { x: x, y: y, alive: true, respawnAt: 0 };
}

function makeScoreLane(y, x1, x2) {
  return { y: y, x1: x1, x2: x2, pts: 50 };
}

function initTiltpinball() {
  pbW = state.COLS;
  pbH = state.ROWS;
  pbScore = 0;
  pbBallsLeft = 3;
  pbLaunched = false;
  pbGameOver = false;
  pbTiltLocked = false;
  pbTiltLockEnd = 0;
  pbMultiballNext = 2000;
  pbLastTime = performance.now();
  pbParticles = [];
  pbScorePopups = [];
  pbTrails = [];
  leftFlipperActive = false;
  rightFlipperActive = false;
  hasMotion = false;
  tiltX = 0;
  tiltY = 0;

  // Flipper positions
  var flipBaseY = tableBottom() - 1;
  var flipLen = Math.max(3, Math.floor(pbW * 0.12));
  pbFlipperL = { x: drainLeft() - flipLen, y: flipBaseY, len: flipLen, side: -1, angle: 0 };
  pbFlipperR = { x: drainRight() + 1, y: flipBaseY, len: flipLen, side: 1, angle: 0 };

  // Bumpers in upper half
  pbBumpers = [];
  var midX = pbW * 0.5;
  var zoneTop = tableTop() + 3;
  var zoneBot = Math.floor(pbH * 0.55);
  // central triangle of bumpers
  pbBumpers.push(makeBumper(midX, zoneTop + 3, 1.8, 100, 'O'));
  pbBumpers.push(makeBumper(midX - pbW * 0.15, zoneTop + 8, 1.8, 100, 'O'));
  pbBumpers.push(makeBumper(midX + pbW * 0.15, zoneTop + 8, 1.8, 100, 'O'));
  // extra bumpers
  pbBumpers.push(makeBumper(midX, zoneTop + 13, 1.5, 100, 'O'));
  pbBumpers.push(makeBumper(midX - pbW * 0.25, zoneTop + 5, 1.3, 100, 'O'));
  pbBumpers.push(makeBumper(midX + pbW * 0.25, zoneTop + 5, 1.3, 100, 'O'));
  // small bumpers near flippers
  pbBumpers.push(makeBumper(midX - pbW * 0.3, zoneBot + 2, 1.0, 100, 'o'));
  pbBumpers.push(makeBumper(midX + pbW * 0.3, zoneBot + 2, 1.0, 100, 'o'));

  // Score lanes (horizontal bands)
  pbScoreLanes = [];
  var laneY1 = Math.floor(zoneTop + (zoneBot - zoneTop) * 0.4);
  var laneY2 = Math.floor(zoneTop + (zoneBot - zoneTop) * 0.7);
  pbScoreLanes.push(makeScoreLane(laneY1, Math.floor(midX - pbW * 0.2), Math.floor(midX - pbW * 0.05)));
  pbScoreLanes.push(makeScoreLane(laneY1, Math.floor(midX + pbW * 0.05), Math.floor(midX + pbW * 0.2)));
  pbScoreLanes.push(makeScoreLane(laneY2, Math.floor(midX - pbW * 0.15), Math.floor(midX + pbW * 0.15)));

  // Bonus targets
  pbBonusTargets = [];
  pbBonusTargets.push(makeBonusTarget(Math.floor(midX - pbW * 0.1), zoneTop + 1));
  pbBonusTargets.push(makeBonusTarget(Math.floor(midX + pbW * 0.1), zoneTop + 1));
  pbBonusTargets.push(makeBonusTarget(Math.floor(midX), zoneBot - 2));
  pbBonusTargets.push(makeBonusTarget(Math.floor(midX - pbW * 0.2), zoneBot - 5));
  pbBonusTargets.push(makeBonusTarget(Math.floor(midX + pbW * 0.2), zoneBot - 5));

  // Ball: start at launch position
  pbBalls = [makeBall(pbW - 3, tableBottom() - 2, 0, 0)];

  // Event listeners
  requestMotionPermission();
  window.addEventListener('mousemove', handleMouseMove);

  touchStartHandler = function(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      activateFlipper(e.changedTouches[i].clientX);
    }
    if (!pbLaunched && !pbGameOver) { launchBall(); }
  };
  touchEndHandler = function(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      deactivateFlipper(e.changedTouches[i].clientX);
    }
  };
  mouseDownHandler = function(e) {
    activateFlipper(e.clientX);
    if (!pbLaunched && !pbGameOver) { launchBall(); }
  };
  mouseUpHandler = function(e) {
    deactivateFlipper(e.clientX);
  };

  window.addEventListener('touchstart', touchStartHandler);
  window.addEventListener('touchend', touchEndHandler);
  window.addEventListener('mousedown', mouseDownHandler);
  window.addEventListener('mouseup', mouseUpHandler);
}

function launchBall() {
  if (pbGameOver) {
    // restart
    initTiltpinball();
    return;
  }
  if (!pbLaunched) {
    pbLaunched = true;
    // give the first ball launch velocity
    for (var i = 0; i < pbBalls.length; i++) {
      if (!pbBalls[i].alive) continue;
      if (Math.abs(pbBalls[i].vy) < 0.1) {
        pbBalls[i].vy = -(pbH * 0.04 + Math.random() * pbH * 0.01);
        pbBalls[i].vx = (Math.random() - 0.5) * 2;
      }
    }
  }
}

function addScore(pts, x, y) {
  pbScore += pts;
  pbScorePopups.push({ x: x, y: y, text: '+' + pts, life: 1.0 });
  // Multiball check
  if (pbScore >= pbMultiballNext) {
    pbMultiballNext += 2000;
    var midX = pbW * 0.5;
    pbBalls.push(makeBall(midX, tableTop() + 5, (Math.random() - 0.5) * 3, 2));
  }
}

function spawnParticles(x, y, hue, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.5 + Math.random() * 2;
    pbParticles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.6 + Math.random() * 0.4,
      hue: hue,
      ch: '.+*'[Math.floor(Math.random() * 3)]
    });
  }
}

function updatePhysics(dt) {
  var now = performance.now();

  // Tilt calculation
  if (hasMotion) {
    tiltX = rawGamma / 45; // -1 to 1
    tiltY = rawBeta / 45;
  } else {
    tiltX = (mouseX - 0.5) * 2;
    tiltY = 0;
  }
  tiltX = Math.max(-1, Math.min(1, tiltX));

  // Tilt warning
  if (Math.abs(tiltX) > 0.85 && !pbTiltLocked) {
    pbTiltLocked = true;
    pbTiltLockEnd = now + 2000;
    spawnParticles(pbW * 0.5, pbH * 0.5, 0, 8);
  }
  if (pbTiltLocked && now > pbTiltLockEnd) {
    pbTiltLocked = false;
  }

  var effectiveTilt = pbTiltLocked ? 0 : tiltX;

  // Flipper animation
  var flipTarget = leftFlipperActive ? 1 : 0;
  pbFlipperL.angle += (flipTarget - pbFlipperL.angle) * 0.3;
  flipTarget = rightFlipperActive ? 1 : 0;
  pbFlipperR.angle += (flipTarget - pbFlipperR.angle) * 0.3;

  // Respawn bonus targets
  for (var t = 0; t < pbBonusTargets.length; t++) {
    if (!pbBonusTargets[t].alive && pbBonusTargets[t].respawnAt > 0 && now > pbBonusTargets[t].respawnAt) {
      pbBonusTargets[t].alive = true;
    }
  }

  // Gravity and tilt forces
  var gravity = pbH * 0.012;
  var tiltForce = pbW * 0.008 * effectiveTilt;

  var aliveBalls = 0;
  for (var bi = 0; bi < pbBalls.length; bi++) {
    var b = pbBalls[bi];
    if (!b.alive) continue;

    // Trail
    pbTrails.push({ x: b.x, y: b.y, life: 0.5 });

    // Apply forces
    b.vy += gravity * dt;
    b.vx += tiltForce * dt;

    // Damping
    b.vx *= 0.998;
    b.vy *= 0.998;

    // Move
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Wall collisions
    if (b.x < tableLeft() + 0.5) { b.x = tableLeft() + 0.5; b.vx = Math.abs(b.vx) * 0.8; }
    if (b.x > tableRight() - 0.5) { b.x = tableRight() - 0.5; b.vx = -Math.abs(b.vx) * 0.8; }
    if (b.y < tableTop() + 0.5) { b.y = tableTop() + 0.5; b.vy = Math.abs(b.vy) * 0.8; }

    // Bumper collisions
    for (var ci = 0; ci < pbBumpers.length; ci++) {
      var bmp = pbBumpers[ci];
      var dx = b.x - bmp.x;
      var dy = b.y - bmp.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bmp.r + 0.5) {
        // Bounce
        var nx = dx / (dist || 0.01);
        var ny = dy / (dist || 0.01);
        var dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx;
        b.vy -= 2 * dot * ny;
        b.vx *= 0.8;
        b.vy *= 0.8;
        // Add kick
        var kick = 3.0;
        b.vx += nx * kick;
        b.vy += ny * kick;
        // Push out of bumper
        b.x = bmp.x + nx * (bmp.r + 0.6);
        b.y = bmp.y + ny * (bmp.r + 0.6);
        // Score and effects
        bmp.flashTime = now;
        addScore(bmp.pts, bmp.x, bmp.y);
        spawnParticles(bmp.x, bmp.y, 30, 5);
      }
    }

    // Score lane collisions
    for (var si = 0; si < pbScoreLanes.length; si++) {
      var lane = pbScoreLanes[si];
      if (Math.abs(b.y - lane.y) < 0.8 && b.x >= lane.x1 && b.x <= lane.x2) {
        addScore(lane.pts, b.x, lane.y);
        // Small bounce
        b.vy *= -0.3;
        b.y = lane.y - 1;
      }
    }

    // Bonus target collisions
    for (var ti = 0; ti < pbBonusTargets.length; ti++) {
      var tgt = pbBonusTargets[ti];
      if (!tgt.alive) continue;
      var tdx = b.x - tgt.x;
      var tdy = b.y - tgt.y;
      if (Math.abs(tdx) < 1.2 && Math.abs(tdy) < 0.8) {
        tgt.alive = false;
        tgt.respawnAt = now + 10000;
        addScore(500, tgt.x, tgt.y);
        spawnParticles(tgt.x, tgt.y, 60, 10);
      }
    }

    // Flipper collision
    collideWithFlipper(b, pbFlipperL, -1);
    collideWithFlipper(b, pbFlipperR, 1);

    // Drain check — gap between flippers at bottom
    if (b.y > tableBottom()) {
      var inDrain = (b.x > drainLeft() && b.x < drainRight());
      if (inDrain) {
        // Ball lost
        b.alive = false;
        spawnParticles(b.x, b.y, 0, 12);
      } else {
        // Bounce off bottom wall (outside drain)
        b.y = tableBottom() - 0.5;
        b.vy = -Math.abs(b.vy) * 0.8;
      }
    }

    if (b.alive) aliveBalls++;
  }

  // Remove dead balls
  if (aliveBalls === 0 && pbLaunched) {
    pbBallsLeft--;
    if (pbBallsLeft <= 0) {
      pbGameOver = true;
    } else {
      // Respawn ball
      pbBalls = [makeBall(pbW - 3, tableBottom() - 2, 0, 0)];
      pbLaunched = false;
    }
  }

  // Update particles
  for (var pi = pbParticles.length - 1; pi >= 0; pi--) {
    var p = pbParticles[pi];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 1.5;
    if (p.life <= 0) pbParticles.splice(pi, 1);
  }

  // Update score popups
  for (var si2 = pbScorePopups.length - 1; si2 >= 0; si2--) {
    var sp = pbScorePopups[si2];
    sp.y -= dt * 2;
    sp.life -= dt * 1.2;
    if (sp.life <= 0) pbScorePopups.splice(si2, 1);
  }

  // Update trails
  for (var tri = pbTrails.length - 1; tri >= 0; tri--) {
    pbTrails[tri].life -= dt * 2;
    if (pbTrails[tri].life <= 0) pbTrails.splice(tri, 1);
  }
}

function collideWithFlipper(ball, flipper, side) {
  // Flipper is a line segment from (flipper.x, flipper.y) extending outward
  // When active, angle goes up; when inactive, angle goes down
  var restAngle = side < 0 ? 0.4 : -0.4; // slight V shape at rest
  var activeAngle = side < 0 ? -0.6 : 0.6; // flipped up
  var ang = restAngle + (activeAngle - restAngle) * flipper.angle;

  var ex = flipper.x + Math.cos(ang) * flipper.len * side;
  var ey = flipper.y + Math.sin(ang) * flipper.len;

  // Point-to-segment distance
  var segDx = ex - flipper.x;
  var segDy = ey - flipper.y;
  var segLen2 = segDx * segDx + segDy * segDy;
  if (segLen2 < 0.01) return;

  var t = ((ball.x - flipper.x) * segDx + (ball.y - flipper.y) * segDy) / segLen2;
  t = Math.max(0, Math.min(1, t));

  var closestX = flipper.x + t * segDx;
  var closestY = flipper.y + t * segDy;
  var dx = ball.x - closestX;
  var dy = ball.y - closestY;
  var dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1.0) {
    // Bounce ball off flipper
    var nx = dx / (dist || 0.01);
    var ny = dy / (dist || 0.01);
    // Ensure we bounce upward
    if (ny > 0) ny = -ny;
    var dot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
    ball.vx *= 0.8;
    ball.vy *= 0.8;
    // Extra kick if flipper is active
    if (flipper.angle > 0.5) {
      ball.vy -= 5;
      ball.vx += side * 2;
    }
    // Push out
    ball.x = closestX + nx * 1.1;
    ball.y = closestY + ny * 1.1;
  }
}

function renderTiltpinball() {
  clearCanvas();
  var W = pbW, H = pbH;
  var now = performance.now();
  var dt = Math.min((now - pbLastTime) / 1000, 0.05);
  pbLastTime = now;

  if (!pbGameOver && pbLaunched) {
    updatePhysics(dt);
  } else if (!pbGameOver && !pbLaunched) {
    // Still update flipper animations etc
    var flipTarget = leftFlipperActive ? 1 : 0;
    pbFlipperL.angle += (flipTarget - pbFlipperL.angle) * 0.3;
    flipTarget = rightFlipperActive ? 1 : 0;
    pbFlipperR.angle += (flipTarget - pbFlipperR.angle) * 0.3;
  }

  // ─── Draw table borders ───
  for (var row = tableTop(); row <= tableBottom(); row++) {
    drawCharHSL(tableLeft() - 1, row, '|', 220, 40, 30, 0.8);
    drawCharHSL(tableRight() + 1, row, '|', 220, 40, 30, 0.8);
  }
  for (var col = tableLeft() - 1; col <= tableRight() + 1; col++) {
    drawCharHSL(col, tableTop() - 1, '-', 220, 40, 30, 0.8);
  }
  // Bottom border with drain gap
  for (var col2 = tableLeft() - 1; col2 <= tableRight() + 1; col2++) {
    if (col2 >= drainLeft() && col2 <= drainRight()) continue;
    drawCharHSL(col2, tableBottom() + 1, '-', 220, 40, 30, 0.8);
  }

  // ─── Draw score lanes ───
  for (var si = 0; si < pbScoreLanes.length; si++) {
    var lane = pbScoreLanes[si];
    for (var lx = lane.x1; lx <= lane.x2; lx++) {
      if (lx >= 0 && lx < W && lane.y >= 0 && lane.y < H) {
        drawCharHSL(lx, lane.y, '=', 180, 60, 40, 0.6);
      }
    }
  }

  // ─── Draw bumpers ───
  for (var ci = 0; ci < pbBumpers.length; ci++) {
    var bmp = pbBumpers[ci];
    var flash = (now - bmp.flashTime < 150) ? 1 : 0;
    var bHue = flash ? 60 : 30;
    var bLight = flash ? 70 : 50;
    var bSat = flash ? 100 : 80;
    var bx = Math.round(bmp.x);
    var by = Math.round(bmp.y);
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      drawCharHSL(bx, by, bmp.ch, bHue, bSat, bLight, 1.0);
      // Draw bumper ring
      var ringChars = ['(', ')'];
      if (bx - 1 >= 0) drawCharHSL(bx - 1, by, '(', bHue, bSat, bLight * 0.7, 0.8);
      if (bx + 1 < W) drawCharHSL(bx + 1, by, ')', bHue, bSat, bLight * 0.7, 0.8);
    }
  }

  // ─── Draw bonus targets ───
  for (var ti = 0; ti < pbBonusTargets.length; ti++) {
    var tgt = pbBonusTargets[ti];
    if (!tgt.alive) continue;
    var tx = Math.round(tgt.x);
    var ty = Math.round(tgt.y);
    if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
      var starPulse = Math.sin(now * 0.005 + ti) * 0.3 + 0.7;
      drawCharHSL(tx, ty, '*', 300, 90, 50 + starPulse * 20, starPulse);
    }
  }

  // ─── Draw flippers ───
  drawFlipper(pbFlipperL, -1, now);
  drawFlipper(pbFlipperR, 1, now);

  // ─── Draw trails ───
  for (var tri = 0; tri < pbTrails.length; tri++) {
    var tr = pbTrails[tri];
    var trx = Math.round(tr.x);
    var try2 = Math.round(tr.y);
    if (trx >= 0 && trx < W && try2 >= 0 && try2 < H) {
      drawCharHSL(trx, try2, '.', 0, 0, 80, tr.life * 0.6);
    }
  }

  // ─── Draw balls ───
  for (var bi = 0; bi < pbBalls.length; bi++) {
    var b = pbBalls[bi];
    if (!b.alive) continue;
    var bx2 = Math.round(b.x);
    var by2 = Math.round(b.y);
    if (bx2 >= 0 && bx2 < W && by2 >= 0 && by2 < H) {
      drawCharHSL(bx2, by2, '\u25CF', 0, 0, 95, 1.0);
    }
  }

  // ─── Draw particles ───
  for (var pi = 0; pi < pbParticles.length; pi++) {
    var p = pbParticles[pi];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL(px, py, p.ch, p.hue, 80, 60, p.life);
    }
  }

  // ─── Draw score popups ───
  for (var si2 = 0; si2 < pbScorePopups.length; si2++) {
    var sp = pbScorePopups[si2];
    var spx = Math.round(sp.x);
    var spy = Math.round(sp.y);
    if (spy >= 0 && spy < H) {
      var txt = sp.text;
      for (var ci2 = 0; ci2 < txt.length; ci2++) {
        var cx = spx - Math.floor(txt.length / 2) + ci2;
        if (cx >= 0 && cx < W) {
          drawCharHSL(cx, spy, txt[ci2], 50, 100, 70, sp.life);
        }
      }
    }
  }

  // ─── Draw score and ball count ───
  var scoreStr = 'SCORE: ' + pbScore;
  for (var i = 0; i < scoreStr.length; i++) {
    if (tableLeft() + i < W) {
      drawCharHSL(tableLeft() + i, 0, scoreStr[i], 50, 90, 70, 1.0);
    }
  }
  var ballStr = 'BALLS: ';
  for (var j = 0; j < pbBallsLeft; j++) { ballStr += '\u25CF '; }
  for (var k = 0; k < ballStr.length; k++) {
    var bsx = W - ballStr.length + k;
    if (bsx >= 0 && bsx < W) {
      drawCharHSL(bsx, 0, ballStr[k], 120, 70, 60, 1.0);
    }
  }

  // ─── Tilt indicator ───
  var tiltBarY = 1;
  var tiltCenter = Math.floor(W / 2);
  var tiltPos = Math.round(tiltX * (W * 0.3));
  drawCharHSL(tiltCenter, tiltBarY, '|', 200, 30, 40, 0.4);
  var indicatorX = tiltCenter + tiltPos;
  if (indicatorX >= 0 && indicatorX < W) {
    drawCharHSL(indicatorX, tiltBarY, '\u25C6', 200, 80, 60, 0.8);
  }

  // ─── Tilt warning ───
  if (pbTiltLocked) {
    var tiltMsg = 'T I L T !';
    var tmx = Math.floor(W / 2) - Math.floor(tiltMsg.length / 2);
    for (var tmi = 0; tmi < tiltMsg.length; tmi++) {
      if (tmx + tmi >= 0 && tmx + tmi < W) {
        var flashA = Math.sin(now * 0.01) * 0.3 + 0.7;
        drawCharHSL(tmx + tmi, Math.floor(H / 2), tiltMsg[tmi], 0, 100, 55, flashA);
      }
    }
  }

  // ─── Launch prompt ───
  if (!pbLaunched && !pbGameOver) {
    var launchMsg = 'TAP TO LAUNCH';
    var lmx = Math.floor(W / 2) - Math.floor(launchMsg.length / 2);
    var pulse = Math.sin(now * 0.004) * 0.3 + 0.7;
    for (var li = 0; li < launchMsg.length; li++) {
      if (lmx + li >= 0 && lmx + li < W) {
        drawCharHSL(lmx + li, Math.floor(H / 2), launchMsg[li], 120, 80, 60, pulse);
      }
    }
    // Draw ball at launch position
    var lb = pbBalls[0];
    if (lb) {
      var lbx = Math.round(lb.x);
      var lby = Math.round(lb.y);
      if (lbx >= 0 && lbx < W && lby >= 0 && lby < H) {
        drawCharHSL(lbx, lby, '\u25CF', 0, 0, 95, pulse);
      }
    }
  }

  // ─── Game over ───
  if (pbGameOver) {
    var goLines = ['G A M E   O V E R', 'FINAL SCORE: ' + pbScore, '', 'TAP TO RESTART'];
    var startY = Math.floor(H / 2) - 2;
    for (var gi = 0; gi < goLines.length; gi++) {
      var gline = goLines[gi];
      var gx = Math.floor(W / 2) - Math.floor(gline.length / 2);
      for (var gc = 0; gc < gline.length; gc++) {
        if (gx + gc >= 0 && gx + gc < W && startY + gi >= 0 && startY + gi < H) {
          var goHue = gi === 0 ? 0 : (gi === 1 ? 50 : 120);
          var goLight = gi === 0 ? 55 : 65;
          drawCharHSL(gx + gc, startY + gi, gline[gc], goHue, 90, goLight, 0.9);
        }
      }
    }
  }

  // ─── Ambient table decoration ───
  // Launch chute on right side
  var chuteX = tableRight();
  for (var cr = Math.floor(H * 0.6); cr <= tableBottom(); cr++) {
    drawCharHSL(chuteX - 1, cr, ':', 220, 30, 25, 0.4);
  }
}

function drawFlipper(flipper, side, now) {
  var restAngle = side < 0 ? 0.4 : -0.4;
  var activeAngle = side < 0 ? -0.6 : 0.6;
  var ang = restAngle + (activeAngle - restAngle) * flipper.angle;

  var ex = flipper.x + Math.cos(ang) * flipper.len * side;
  var ey = flipper.y + Math.sin(ang) * flipper.len;

  // Bresenham-ish line draw
  var steps = Math.ceil(flipper.len * 1.5);
  var active = flipper.angle > 0.3;
  var hue = active ? 120 : 150;
  var light = active ? 60 : 40;

  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var px = Math.round(flipper.x + (ex - flipper.x) * t);
    var py = Math.round(flipper.y + (ey - flipper.y) * t);
    if (px >= 0 && px < pbW && py >= 0 && py < pbH) {
      var ch = side < 0 ? '/' : '\\';
      if (i === 0 || i === steps) ch = 'o';
      drawCharHSL(px, py, ch, hue, 80, light, 0.9);
    }
  }
}

function cleanupTiltpinball() {
  window.removeEventListener('deviceorientation', handleOrientation);
  window.removeEventListener('mousemove', handleMouseMove);
  if (touchStartHandler) window.removeEventListener('touchstart', touchStartHandler);
  if (touchEndHandler) window.removeEventListener('touchend', touchEndHandler);
  if (mouseDownHandler) window.removeEventListener('mousedown', mouseDownHandler);
  if (mouseUpHandler) window.removeEventListener('mouseup', mouseUpHandler);
  hasMotion = false;
  pbBalls = [];
  pbBumpers = [];
  pbBonusTargets = [];
  pbScoreLanes = [];
  pbParticles = [];
  pbScorePopups = [];
  pbTrails = [];
}

registerMode('tiltpinball', { init: initTiltpinball, render: renderTiltpinball, cleanup: cleanupTiltpinball });
