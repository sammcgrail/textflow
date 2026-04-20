import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// BadApple — Touhou "Bad Apple!!" shadow-animation homage.
// Pure B&W silhouette of a dancing figure, parametric (not sprite).
// Click/tap = advance pose + invert flash. Drag = rotate. Hold = slow-mo.
// Triple-click = full-screen invert for 2s. Occasional twin-figure frame.
// ============================================================

var ba = null;

// 6 pose keyframes. Each pose defines arm/leg/body angles + offsets.
// Angles in radians; 0 = straight down from shoulder/hip. Negative = out/left.
// leftArm/rightArm/leftLeg/rightLeg lengths in grid cells.
var POSES = [
  // 0: standing neutral
  { lArm: 2.6, rArm: 2.6, lArmLen: 4.0, rArmLen: 4.0,
    lLeg: 3.05, rLeg: 3.23, lLegLen: 4.5, rLegLen: 4.5,
    torsoLean: 0, headTilt: 0, bodyY: 0 },
  // 1: arms up triumphant V
  { lArm: 5.5, rArm: 0.78, lArmLen: 4.2, rArmLen: 4.2,
    lLeg: 3.05, rLeg: 3.23, lLegLen: 4.5, rLegLen: 4.5,
    torsoLean: 0, headTilt: 0, bodyY: -0.2 },
  // 2: one arm out pointing (right arm horizontal)
  { lArm: 3.0, rArm: 1.57, lArmLen: 3.5, rArmLen: 5.0,
    lLeg: 3.05, rLeg: 3.23, lLegLen: 4.5, rLegLen: 4.5,
    torsoLean: 0.15, headTilt: 0.1, bodyY: 0 },
  // 3: spinning — arms horizontal both sides
  { lArm: 4.71, rArm: 1.57, lArmLen: 4.2, rArmLen: 4.2,
    lLeg: 3.14, rLeg: 3.14, lLegLen: 4.5, rLegLen: 4.5,
    torsoLean: 0, headTilt: 0, bodyY: 0 },
  // 4: one leg up dance kick (right leg horizontal-ish)
  { lArm: 2.4, rArm: 3.8, lArmLen: 4.0, rArmLen: 4.0,
    lLeg: 3.05, rLeg: 4.71, lLegLen: 4.5, rLegLen: 4.3,
    torsoLean: -0.2, headTilt: -0.1, bodyY: 0.2 },
  // 5: bowing forward
  { lArm: 2.2, rArm: 4.0, lArmLen: 4.0, rArmLen: 4.0,
    lLeg: 3.05, rLeg: 3.23, lLegLen: 4.5, rLegLen: 4.5,
    torsoLean: 0.6, headTilt: 0.5, bodyY: 0.4 }
];

var POSE_DUR = 2.5; // seconds per pose in auto-cycle

function initBadapple() {
  var W = state.COLS, H = state.ROWS;
  ba = {
    W: W, H: H,
    poseIdx: 0,
    nextPoseIdx: 1,
    poseT: 0,
    rotation: 0,       // extra rotation from drag
    dragStartGX: null,
    dragBaseRot: 0,
    flashT: 0,         // invert flash timer
    fullInvertT: 0,    // triple-click full invert timer
    clickTimes: [],    // rolling window for triple-click detection
    hairParticles: [],
    flashParticles: [],
    dust: [],
    twinT: 0,          // timer for twin-figure frame
    twinActive: false,
    twinDur: 0
  };
  // Seed dust particles
  var dustN = state.isMobile ? 18 : 32;
  for (var i = 0; i < dustN; i++) {
    ba.dust.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vy: -(0.2 + Math.random() * 0.4),
      vx: (Math.random() - 0.5) * 0.15,
      ch: Math.random() < 0.5 ? '.' : '`',
      bright: 8 + Math.random() * 12
    });
  }
  // Schedule first twin event
  ba.twinT = 8 + Math.random() * 10;
}

function advancePose() {
  ba.poseIdx = ba.nextPoseIdx;
  ba.nextPoseIdx = (ba.poseIdx + 1) % POSES.length;
  ba.poseT = 0;
}

function spawnFlashParticles(cx, cy) {
  var n = 30;
  for (var i = 0; i < n; i++) {
    var ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    var spd = 10 + Math.random() * 14;
    ba.flashParticles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd * 0.6 - 2,
      life: 0.8 + Math.random() * 0.4,
      maxLife: 1.2,
      ch: Math.random() < 0.5 ? '*' : '+'
    });
  }
}

function spawnHairParticle(hx, hy, dirRad) {
  ba.hairParticles.push({
    x: hx, y: hy,
    vx: Math.cos(dirRad) * (2 + Math.random() * 2),
    vy: Math.sin(dirRad) * (2 + Math.random() * 2) - 0.5,
    life: 0.6 + Math.random() * 0.5,
    maxLife: 1.1,
    ch: Math.random() < 0.4 ? '*' : (Math.random() < 0.5 ? '.' : '`')
  });
}

// Lerp between two pose objects
function lerpPose(a, b, t) {
  function angLerp(x, y, tt) {
    // shortest-path angle lerp
    var d = y - x;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return x + d * tt;
  }
  return {
    lArm: angLerp(a.lArm, b.lArm, t),
    rArm: angLerp(a.rArm, b.rArm, t),
    lArmLen: a.lArmLen + (b.lArmLen - a.lArmLen) * t,
    rArmLen: a.rArmLen + (b.rArmLen - a.rArmLen) * t,
    lLeg: angLerp(a.lLeg, b.lLeg, t),
    rLeg: angLerp(a.rLeg, b.rLeg, t),
    lLegLen: a.lLegLen + (b.lLegLen - a.lLegLen) * t,
    rLegLen: a.rLegLen + (b.rLegLen - a.rLegLen) * t,
    torsoLean: a.torsoLean + (b.torsoLean - a.torsoLean) * t,
    headTilt: a.headTilt + (b.headTilt - a.headTilt) * t,
    bodyY: a.bodyY + (b.bodyY - a.bodyY) * t
  };
}

// Distance from point (px,py) to line segment (ax,ay)-(bx,by). Returns dist in GRID units
// accounting for char aspect ratio (chars are ~2x tall as wide).
function segDist(px, py, ax, ay, bx, by) {
  // Convert to square-aspect coords (double x-distances to match y)
  var pxs = px * 0.5;
  var axs = ax * 0.5, bxs = bx * 0.5;
  var dx = bxs - axs, dy = by - ay;
  var len2 = dx * dx + dy * dy;
  var t = 0;
  if (len2 > 0.0001) {
    t = ((pxs - axs) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
  }
  var cx = axs + dx * t;
  var cy = ay + dy * t;
  var ddx = pxs - cx, ddy = py - cy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}

// Distance to ellipse centered at (ex,ey) with radii (rx,ry). Negative inside.
// rx in x-cells (grid), ry in y-cells.
function ellipseDist(px, py, ex, ey, rx, ry) {
  var dx = (px - ex) / rx;
  var dy = (py - ey) / ry;
  var d = Math.sqrt(dx * dx + dy * dy);
  return (d - 1) * Math.min(rx * 0.5, ry);
}

// Build figure primitives for a given pose + center.
// Returns array of {type, coords...} used by rasterizer.
function buildFigure(pose, cx, cy, rotation, scale) {
  scale = scale || 1;
  var s = scale;
  // Head ellipse
  var headRx = 3 * s;
  var headRy = 2 * s;
  var headOffY = -7 * s + pose.bodyY * s;
  // Apply rotation around center (cx,cy)
  function rot(ox, oy) {
    // ox in x-cells, oy in y-cells. Account for char aspect.
    var ar = 0.5; // x grid-unit ≈ 0.5 of y grid-unit visually
    var pxs = ox * ar;
    var c = Math.cos(rotation), sn = Math.sin(rotation);
    var rxs = pxs * c - oy * sn;
    var ry = pxs * sn + oy * c;
    return { x: cx + rxs / ar, y: cy + ry };
  }
  var headP = rot(0, headOffY);
  // Torso: capsule from shoulder point to hip point
  var shoulderOffY = -4 * s + pose.bodyY * s;
  var hipOffY = 2 * s + pose.bodyY * s;
  // Torso lean offset shifts top of torso sideways
  var leanX = Math.sin(pose.torsoLean) * 2 * s;
  var shoulderP = rot(leanX, shoulderOffY);
  var hipP = rot(0, hipOffY);
  // Arms: from shoulder, direction = pose.lArm/rArm, length = lArmLen
  function endPoint(startX, startY, ang, len) {
    // ang: 0 = up, π = down (so sin(ang) for y)? We'll use standard math:
    // 0 = +x (right), π/2 = +y (down). x = len*cos(ang), y = len*sin(ang).
    // In grid, we want y-length to match x-length visually; since chars are
    // ~2x tall as wide, a "unit length" of `len` in character cells means
    // dx = len*cos*2, dy = len*sin. That's handled by aspect in the rotator.
    var ox = len * Math.cos(ang) * 2; // 2 compensates for char aspect
    var oy = len * Math.sin(ang);
    // Apply global rotation too
    var ar = 0.5;
    var pxs = ox * ar;
    var c = Math.cos(rotation), sn = Math.sin(rotation);
    var rxs = pxs * c - oy * sn;
    var ry = pxs * sn + oy * c;
    return { x: startX + rxs / ar, y: startY + ry };
  }
  var lArmEnd = endPoint(shoulderP.x - 1.5 * s, shoulderP.y, pose.lArm, pose.lArmLen * s);
  var rArmEnd = endPoint(shoulderP.x + 1.5 * s, shoulderP.y, pose.rArm, pose.rArmLen * s);
  var lLegEnd = endPoint(hipP.x - 1 * s, hipP.y, pose.lLeg, pose.lLegLen * s);
  var rLegEnd = endPoint(hipP.x + 1 * s, hipP.y, pose.rLeg, pose.rLegLen * s);

  return {
    head: { x: headP.x, y: headP.y, rx: headRx, ry: headRy },
    torsoTop: { x: shoulderP.x, y: shoulderP.y },
    torsoBot: { x: hipP.x, y: hipP.y },
    lArmStart: { x: shoulderP.x - 1.5 * s, y: shoulderP.y },
    lArmEnd: lArmEnd,
    rArmStart: { x: shoulderP.x + 1.5 * s, y: shoulderP.y },
    rArmEnd: rArmEnd,
    lLegStart: { x: hipP.x - 1 * s, y: hipP.y },
    lLegEnd: lLegEnd,
    rLegStart: { x: hipP.x + 1 * s, y: hipP.y },
    rLegEnd: rLegEnd,
    headTop: rot(0, headOffY - headRy)
  };
}

function updateBadapple() {
  var dt = 1 / 60;
  var W = ba.W, H = ba.H;

  // Input handling — triple click detection uses pointer.clicked before we consume it.
  if (pointer.clicked && state.currentMode === 'badapple') {
    pointer.clicked = false;
    // Track click timestamps
    ba.clickTimes.push(state.time);
    // Prune old (>1s)
    while (ba.clickTimes.length > 0 && state.time - ba.clickTimes[0] > 1.0) {
      ba.clickTimes.shift();
    }
    // Advance pose + flash
    advancePose();
    ba.flashT = 0.4;
    var cxp = W * 0.5;
    var cyp = H * 0.55;
    spawnFlashParticles(cxp, cyp);
    // Triple click check
    if (ba.clickTimes.length >= 3) {
      ba.fullInvertT = 2.0;
      ba.clickTimes.length = 0;
    }
  } else if (pointer.down && state.currentMode === 'badapple') {
    // Drag = rotate around center
    if (ba.dragStartGX === null) {
      ba.dragStartGX = pointer.gx;
      ba.dragBaseRot = ba.rotation;
    }
    var dGX = pointer.gx - ba.dragStartGX;
    // Full screen swipe = roughly 2*PI rotation
    ba.rotation = ba.dragBaseRot + (dGX / W) * Math.PI * 2;
  } else {
    ba.dragStartGX = null;
  }

  // Hold = slow-mo time dilation
  var timeScale = pointer.down ? 0.3 : 1.0;

  // Auto pose cycle (only when not dragging)
  if (!pointer.down) {
    ba.poseT += dt * timeScale;
    if (ba.poseT >= POSE_DUR) {
      advancePose();
    }
  } else {
    // While holding, still interpolate slightly for "slo-mo" feel
    ba.poseT += dt * timeScale;
    if (ba.poseT >= POSE_DUR) advancePose();
  }

  // Idle rotation drift (very subtle, only when not dragging)
  if (ba.dragStartGX === null) {
    // No auto-drift — rotation stays where user left it
  }

  // Flash decay
  if (ba.flashT > 0) ba.flashT -= dt;
  if (ba.fullInvertT > 0) ba.fullInvertT -= dt;

  // Twin figure scheduling
  if (!ba.twinActive) {
    ba.twinT -= dt;
    if (ba.twinT <= 0) {
      ba.twinActive = true;
      ba.twinDur = 2.5;
    }
  } else {
    ba.twinDur -= dt;
    if (ba.twinDur <= 0) {
      ba.twinActive = false;
      ba.twinT = 12 + Math.random() * 15;
    }
  }

  // Hair particle spawn (from head, backward relative to rotation)
  var t = state.time;
  var headDir = -Math.PI / 2 - ba.rotation; // up + rotation offset
  var sinPulse = Math.sin(t * 3);
  if (Math.random() < 0.25 + Math.abs(sinPulse) * 0.2) {
    var hpx = W * 0.5 + (Math.random() - 0.5) * 3;
    var hpy = H * 0.55 - 7 + (Math.random() - 0.5) * 2;
    // Emit roughly opposite to rotation direction
    var dir = headDir + Math.PI + (Math.random() - 0.5) * 0.8;
    spawnHairParticle(hpx, hpy, dir);
  }

  // Update hair particles
  for (var i = ba.hairParticles.length - 1; i >= 0; i--) {
    var p = ba.hairParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 2 * dt; // slight gravity
    p.life -= dt;
    if (p.life <= 0) ba.hairParticles.splice(i, 1);
  }
  var maxHair = state.isMobile ? 40 : 80;
  if (ba.hairParticles.length > maxHair) {
    ba.hairParticles.splice(0, ba.hairParticles.length - maxHair);
  }

  // Update flash particles
  for (var i = ba.flashParticles.length - 1; i >= 0; i--) {
    var p = ba.flashParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 4 * dt;
    p.life -= dt;
    if (p.life <= 0) ba.flashParticles.splice(i, 1);
  }

  // Update dust (loop top/bottom, drift sideways)
  for (var i = 0; i < ba.dust.length; i++) {
    var d = ba.dust[i];
    d.y += d.vy * dt * 3;
    d.x += d.vx * dt * 3;
    if (d.y < -1) {
      d.y = H + 1;
      d.x = Math.random() * W;
    }
    if (d.x < 0) d.x = W - 1;
    if (d.x > W) d.x = 0;
  }
}

function pointInFigure(fig, x, y) {
  // Returns distance in grid-units (negative-ish or small = inside/close).
  // We measure min distance to any primitive.
  // Head: ellipse
  var eDist = ellipseDist(x, y, fig.head.x, fig.head.y, fig.head.rx, fig.head.ry);
  // Torso: thick segment (radius ~2)
  var torsoD = segDist(x, y, fig.torsoTop.x, fig.torsoTop.y, fig.torsoBot.x, fig.torsoBot.y);
  // Arms: thinner segments (radius ~1.2)
  var lArmD = segDist(x, y, fig.lArmStart.x, fig.lArmStart.y, fig.lArmEnd.x, fig.lArmEnd.y);
  var rArmD = segDist(x, y, fig.rArmStart.x, fig.rArmStart.y, fig.rArmEnd.x, fig.rArmEnd.y);
  // Legs: radius ~1.3
  var lLegD = segDist(x, y, fig.lLegStart.x, fig.lLegStart.y, fig.lLegEnd.x, fig.lLegEnd.y);
  var rLegD = segDist(x, y, fig.rLegStart.x, fig.rLegStart.y, fig.rLegEnd.x, fig.rLegEnd.y);
  // Combine — return the minimum "fill" metric.
  // Each primitive has its own radius; we return a "score": 0 = on-edge, <0 = inside, >0 = outside.
  // Use min of: ellipseDist (already distance to edge), segDist - radius.
  var scores = [
    eDist,
    torsoD - 2.0,
    lArmD - 1.1,
    rArmD - 1.1,
    lLegD - 1.3,
    rLegD - 1.3
  ];
  var m = scores[0];
  for (var i = 1; i < scores.length; i++) if (scores[i] < m) m = scores[i];
  return m;
}

function renderFigure(fig, bright, flashInvert) {
  var W = ba.W, H = ba.H;
  // Compute tight bbox from all primitive endpoints.
  var pts = [
    fig.head.x - fig.head.rx, fig.head.y - fig.head.ry,
    fig.head.x + fig.head.rx, fig.head.y + fig.head.ry,
    fig.torsoTop.x, fig.torsoTop.y, fig.torsoBot.x, fig.torsoBot.y,
    fig.lArmEnd.x, fig.lArmEnd.y, fig.rArmEnd.x, fig.rArmEnd.y,
    fig.lLegEnd.x, fig.lLegEnd.y, fig.rLegEnd.x, fig.rLegEnd.y
  ];
  var minX = pts[0], maxX = pts[0], minY = pts[1], maxY = pts[1];
  for (var i = 2; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  var xMin = Math.max(0, Math.floor(minX - 3));
  var xMax = Math.min(W - 1, Math.ceil(maxX + 3));
  var yMin = Math.max(0, Math.floor(minY - 2));
  var yMax = Math.min(H - 1, Math.ceil(maxY + 2));

  var darkFill = flashInvert ? 8 : bright;
  var edgeLight = flashInvert ? 30 : Math.max(40, bright - 25);

  for (var y = yMin; y <= yMax; y++) {
    for (var x = xMin; x <= xMax; x++) {
      var d = pointInFigure(fig, x, y);
      if (d <= 0) {
        drawCharHSL('#', x, y, 0, 0, darkFill);
      } else if (d <= 1.0) {
        drawCharHSL(d < 0.5 ? '*' : '+', x, y, 0, 0, edgeLight);
      }
    }
  }
}

function renderBackground(invert) {
  var W = ba.W, H = ba.H;
  if (invert) {
    // Sparse fill (every other cell in a checkerboard) to suggest white
    // bg without obliterating the figure and wrecking FPS on mobile.
    var stride = state.isMobile ? 2 : 1;
    for (var y = 0; y < H; y += stride) {
      for (var x = (y & 1); x < W; x += 2) {
        drawCharHSL('#', x, y, 0, 0, 88);
      }
    }
  }
  // Dust
  for (var i = 0; i < ba.dust.length; i++) {
    var d = ba.dust[i];
    if (d.x >= 0 && d.x < W && d.y >= 0 && d.y < H) {
      var l = invert ? (88 - d.bright) : d.bright;
      drawCharHSL(d.ch, d.x | 0, d.y | 0, 0, 0, l);
    }
  }
}

function renderHairParticles(invert) {
  var W = ba.W, H = ba.H;
  for (var i = 0; i < ba.hairParticles.length; i++) {
    var p = ba.hairParticles[i];
    if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
    var a = p.life / p.maxLife;
    var l = invert ? (15 + (1 - a) * 20) : (25 + a * 45);
    drawCharHSL(p.ch, p.x | 0, p.y | 0, 0, 0, l);
  }
}

function renderFlashParticles(invert) {
  var W = ba.W, H = ba.H;
  for (var i = 0; i < ba.flashParticles.length; i++) {
    var p = ba.flashParticles[i];
    if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
    var a = p.life / p.maxLife;
    var l = invert ? (30 - a * 20) : (55 + a * 30);
    drawCharHSL(p.ch, p.x | 0, p.y | 0, 0, 0, l);
  }
}

function renderPrompt() {
  var t = state.time;
  if (t > 5) return;
  var W = ba.W, H = ba.H;
  var line = state.isMobile ? 'TAP = POSE  DRAG = SPIN  HOLD = SLOMO' : 'CLICK = POSE  DRAG = SPIN  HOLD = SLOMO';
  var sx = Math.floor(W / 2 - line.length / 2);
  var sy = H - 2;
  for (var c = 0; c < line.length; c++) {
    if (line[c] === ' ') continue;
    var bright = 30 + Math.sin(t * 2 + c * 0.15) * 8;
    drawCharHSL(line[c], sx + c, sy, 0, 0, bright);
  }
}

function renderBadapple() {
  clearCanvas();
  if (!ba || ba.W !== state.COLS || ba.H !== state.ROWS) initBadapple();

  updateBadapple();

  var W = ba.W, H = ba.H;
  var t = state.time;

  // Determine current pose blend
  var tRaw = ba.poseT / POSE_DUR;
  if (tRaw > 1) tRaw = 1;
  // Smoothstep
  var tt = tRaw * tRaw * (3 - 2 * tRaw);
  var pose = lerpPose(POSES[ba.poseIdx], POSES[ba.nextPoseIdx], tt);

  // Global invert states
  var flashActive = ba.flashT > 0;
  var fullInvert = ba.fullInvertT > 0;
  var invert = flashActive || fullInvert;

  // Background (invert draws white fill)
  renderBackground(invert);

  // Build + render figure
  var cx = W * 0.5;
  var cy = H * 0.55;
  var breathe = Math.sin(t * 1.8) * 0.3;
  cy += breathe;

  // Main figure — scale up on mobile for visibility
  var scale = state.isMobile ? 1.4 : 1.2;
  var fig = buildFigure(pose, cx, cy, ba.rotation, scale);
  var bright = 86;
  renderFigure(fig, bright, invert);

  // Twin figure event — second figure mirrored + offset
  if (ba.twinActive) {
    var twinAlpha = 1;
    // Fade in/out over edges of 2.5s window
    if (ba.twinDur > 2.2) twinAlpha = (2.5 - ba.twinDur) / 0.3;
    else if (ba.twinDur < 0.3) twinAlpha = ba.twinDur / 0.3;
    if (twinAlpha < 0) twinAlpha = 0;
    if (twinAlpha > 1) twinAlpha = 1;

    // Offset horizontally, mirror by reversing x-components of arm/leg angles
    var mirrorPose = {
      lArm: Math.PI - pose.rArm,
      rArm: Math.PI - pose.lArm,
      lArmLen: pose.rArmLen,
      rArmLen: pose.lArmLen,
      lLeg: Math.PI - pose.rLeg,
      rLeg: Math.PI - pose.lLeg,
      lLegLen: pose.rLegLen,
      rLegLen: pose.lLegLen,
      torsoLean: -pose.torsoLean,
      headTilt: -pose.headTilt,
      bodyY: pose.bodyY
    };
    var twinOffset = Math.min(16, W * 0.22);
    var twinCx = cx + twinOffset;
    var twinFig = buildFigure(mirrorPose, twinCx, cy, -ba.rotation, scale * 0.85);
    if (twinAlpha > 0.3) {
      renderFigure(twinFig, Math.floor(bright * twinAlpha), invert);
    }
  }

  // Particles over everything
  renderHairParticles(invert);
  renderFlashParticles(invert);

  renderPrompt();
}

registerMode('badapple', {
  init: initBadapple,
  render: renderBadapple
});
