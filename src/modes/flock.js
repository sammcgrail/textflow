import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// 3D Starling Murmuration — boids with perspective projection over dusk landscape

var boids = [];
var NUM_BOIDS = 600;
var trailGrid;
var lastW = 0, lastH = 0;

// Camera
var camAngle = 0;
var camPitch = 0.3;

// Flock attractor — drifts to create shape morphing
var attrX = 0, attrY = 0, attrZ = 0;
var attrTargX = 0, attrTargY = 0, attrTargZ = 0;
var attrTimer = 0;

// Interaction
var scatterTime = 0; // when > 0, birds scatter from pointer
var lastClickX = 0, lastClickY = 0;

// Landscape — tree positions (generated once)
var trees = null;
var TREE_COUNT = 0;

function generateTrees(W, H) {
  TREE_COUNT = state.isMobile ? 8 : 14;
  trees = [];
  for (var i = 0; i < TREE_COUNT; i++) {
    var tx = Math.floor(Math.random() * W);
    var height = 4 + Math.floor(Math.random() * 6);
    var width = 2 + Math.floor(Math.random() * 3);
    trees.push({ x: tx, h: height, w: width });
  }
}

function initFlock() {
  var W = state.COLS, H = state.ROWS;
  lastW = W; lastH = H;
  NUM_BOIDS = state.isMobile ? 350 : 600;

  var spread = Math.min(W, H) * 0.3;
  boids = [];
  for (var i = 0; i < NUM_BOIDS; i++) {
    boids.push({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread * 0.6, // keep flock in upper half
      z: (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      vz: (Math.random() - 0.5) * 1.5
    });
  }

  trailGrid = new Float32Array(W * H);
  attrX = 0; attrY = -spread * 0.2; attrZ = 0;
  attrTargX = 0; attrTargY = -spread * 0.2; attrTargZ = 0;
  attrTimer = 0;
  camAngle = 0;
  scatterTime = 0;
  generateTrees(W, H);
}

function renderFlock() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!trailGrid || lastW !== W || lastH !== H) initFlock();

  // Decay trails
  for (var i = 0; i < trailGrid.length; i++) trailGrid[i] *= 0.85;

  // Camera orbit
  camAngle += 0.006;
  camPitch = 0.2 + Math.sin(t * 0.12) * 0.1;

  var cosA = Math.cos(camAngle), sinA = Math.sin(camAngle);
  var cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);

  // Drifting attractor — keeps flock in upper portion of screen
  attrTimer -= 1 / 60;
  if (attrTimer <= 0) {
    var range = Math.min(W, H) * 0.25;
    attrTargX = (Math.random() - 0.5) * range;
    attrTargY = (Math.random() - 0.5) * range * 0.5 - range * 0.15;
    attrTargZ = (Math.random() - 0.5) * range;
    attrTimer = 3 + Math.random() * 4;
  }
  attrX += (attrTargX - attrX) * 0.02;
  attrY += (attrTargY - attrY) * 0.02;
  attrZ += (attrTargZ - attrZ) * 0.02;

  // Scatter decay
  if (scatterTime > 0) scatterTime -= 1 / 60;

  // Spatial hashing
  var cellSize = 6;
  var hashMap = {};
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];
    var key = ((b.x / cellSize) | 0) + ',' + ((b.y / cellSize) | 0) + ',' + ((b.z / cellSize) | 0);
    if (!hashMap[key]) hashMap[key] = [];
    hashMap[key].push(i);
  }

  // Click interaction — scatter or attract
  if (pointer.clicked && state.currentMode === 'flock') {
    pointer.clicked = false;
    scatterTime = 1.5; // scatter for 1.5 seconds
    lastClickX = (pointer.gx - W / 2) * 0.8;
    lastClickY = (pointer.gy - H / 2) * 0.8;
    addRippleEffect(pointer.gx, pointer.gy);
  }

  // Update boids
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];

    var sx = 0, sy = 0, sz = 0;
    var ax = 0, ay = 0, az = 0;
    var cx2 = 0, cy2 = 0, cz2 = 0;
    var sc = 0, ac = 0, cc = 0;

    var bcx = (b.x / cellSize) | 0;
    var bcy = (b.y / cellSize) | 0;
    var bcz = (b.z / cellSize) | 0;

    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dz = -1; dz <= 1; dz++) {
          var cell = hashMap[(bcx + dx) + ',' + (bcy + dy) + ',' + (bcz + dz)];
          if (!cell) continue;
          for (var ci = 0; ci < cell.length; ci++) {
            var j = cell[ci];
            if (i === j) continue;
            var o = boids[j];
            var ddx = o.x - b.x, ddy = o.y - b.y, ddz = o.z - b.z;
            var d2 = ddx * ddx + ddy * ddy + ddz * ddz;

            if (d2 < 4 && d2 > 0) { sx -= ddx / d2; sy -= ddy / d2; sz -= ddz / d2; sc++; }
            if (d2 < 36) { ax += o.vx; ay += o.vy; az += o.vz; ac++; }
            if (d2 < 100) { cx2 += ddx; cy2 += ddy; cz2 += ddz; cc++; }
          }
        }
      }
    }

    if (sc > 0) { b.vx += sx * 0.12; b.vy += sy * 0.12; b.vz += sz * 0.12; }
    if (ac > 0) { b.vx += (ax / ac - b.vx) * 0.04; b.vy += (ay / ac - b.vy) * 0.04; b.vz += (az / ac - b.vz) * 0.04; }
    if (cc > 0) { b.vx += (cx2 / cc) * 0.004; b.vy += (cy2 / cc) * 0.004; b.vz += (cz2 / cc) * 0.004; }

    // Attract toward drifting attractor
    var adx = attrX - b.x, ady = attrY - b.y, adz = attrZ - b.z;
    var ad = Math.sqrt(adx * adx + ady * ady + adz * adz) + 1;
    b.vx += adx / ad * 0.08;
    b.vy += ady / ad * 0.08;
    b.vz += adz / ad * 0.08;

    // Drag interaction — attract toward pointer while held
    if (pointer.down && !pointer.clicked && state.currentMode === 'flock') {
      var pgx = (pointer.gx - W / 2) * 0.8;
      var pgy = (pointer.gy - H / 2) * 0.8;
      var pdx = pgx - b.x, pdy = pgy - b.y;
      var pd = Math.sqrt(pdx * pdx + pdy * pdy) + 1;
      b.vx += pdx / pd * 0.25;
      b.vy += pdy / pd * 0.25;
    }

    // Click scatter — explode away from click point
    if (scatterTime > 0) {
      var sdx = b.x - lastClickX, sdy = b.y - lastClickY;
      var sd = Math.sqrt(sdx * sdx + sdy * sdy) + 1;
      var scatterForce = scatterTime * 0.6;
      if (sd < 20) {
        b.vx += sdx / sd * scatterForce * 2;
        b.vy += sdy / sd * scatterForce * 2;
        b.vz += ((Math.random() - 0.5) * scatterForce);
      }
    }

    // Speed limits
    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    var maxSpd = scatterTime > 0 ? 3.5 : 2.0;
    var minSpd = 0.5;
    if (spd > maxSpd) { var s = maxSpd / spd; b.vx *= s; b.vy *= s; b.vz *= s; }
    if (spd < minSpd && spd > 0.01) { var s2 = minSpd / spd; b.vx *= s2; b.vy *= s2; b.vz *= s2; }

    b.x += b.vx; b.y += b.vy; b.z += b.vz;

    // Soft boundary
    var boundary = Math.min(W, H) * 0.45;
    var dist = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
    if (dist > boundary) {
      var pull = (dist - boundary) * 0.01;
      b.vx -= b.x / dist * pull;
      b.vy -= b.y / dist * pull;
      b.vz -= b.z / dist * pull;
    }
  }

  // === RENDER BACKGROUND: dusk sky gradient ===
  var horizonY = Math.floor(H * 0.72);
  for (var y = 0; y < H; y++) {
    var skyT = y / horizonY; // 0 at top, 1 at horizon
    if (skyT > 1) skyT = 1;
    for (var x = 0; x < W; x++) {
      // Sky gradient
      if (y < horizonY) {
        var hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        var frac = hash - (hash | 0);
        // Sparse twinkling stars at top, denser atmosphere near horizon
        var starThresh = y < horizonY * 0.3 ? 0.985 : 0.995;
        if (frac > starThresh) {
          var skyHue = 220 + skyT * 40; // dark blue to warm orange near horizon
          var skyBright = 4 + skyT * 6 + Math.sin(t * 3 + x * 0.5) * 1.5;
          drawCharHSL('.', x, y, skyHue, 20, skyBright);
        }
      }
    }
  }

  // === RENDER LANDSCAPE: ground + trees ===
  // Ground line
  for (var x = 0; x < W; x++) {
    if (x % 2 === 0) {
      var groundHue = 30 + Math.sin(x * 0.3) * 15;
      drawCharHSL('_', x, horizonY, groundHue, 25, 12);
    }
    // Marsh/reeds below horizon
    for (var gy = horizonY + 1; gy < H; gy++) {
      var gHash = Math.sin(x * 73.1 + gy * 197.3) * 43758.5453;
      var gFrac = gHash - (gHash | 0);
      if (gFrac > 0.88) {
        var gBright = 6 + (H - gy) * 0.5;
        var gHue = 80 + Math.sin(x * 0.2 + t * 0.5) * 30;
        var ch = gFrac > 0.95 ? '|' : gFrac > 0.92 ? ';' : '.';
        drawCharHSL(ch, x, gy, gHue, 20, gBright);
      }
    }
  }

  // Trees — silhouettes along the horizon
  if (trees) {
    for (var ti = 0; ti < trees.length; ti++) {
      var tree = trees[ti];
      var trunk = tree.x;
      // Trunk
      for (var ty = 0; ty < tree.h; ty++) {
        var treeY = horizonY - ty;
        if (treeY >= 0 && treeY < H) {
          drawCharHSL('|', trunk, treeY, 120, 15, 6);
        }
      }
      // Canopy — wider at top
      var canopyStart = Math.floor(tree.h * 0.4);
      for (var ty = canopyStart; ty < tree.h + 2; ty++) {
        var treeY = horizonY - ty;
        if (treeY < 0 || treeY >= H) continue;
        var canopyW = tree.w + Math.floor((ty - canopyStart) * 0.5);
        for (var cx3 = -canopyW; cx3 <= canopyW; cx3++) {
          var lx = trunk + cx3;
          if (lx < 0 || lx >= W) continue;
          var leafHash = Math.sin(lx * 41.3 + treeY * 67.1 + ti * 13) * 43758.5453;
          if ((leafHash - (leafHash | 0)) > 0.3) {
            var leafCh = (leafHash - (leafHash | 0)) > 0.7 ? '%' : '#';
            var leafHue = 100 + Math.sin(lx * 0.5 + t * 0.3) * 30;
            var leafBright = 7 + Math.sin(t * 0.8 + lx + treeY) * 2;
            drawCharHSL(leafCh, lx, treeY, leafHue, 25, leafBright);
          }
        }
      }
    }
  }

  // === PROJECT AND RENDER BIRDS ===
  var centerX = W / 2;
  var centerY = H * 0.35; // birds centered in upper portion
  var fov = Math.min(W, H) * 1.2;
  var charAspect = state.CHAR_W / state.CHAR_H;

  var projected = [];
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];
    var rx = b.x * cosA - b.z * sinA;
    var rz = b.x * sinA + b.z * cosA;
    var ry = b.y;
    var ry2 = ry * cosP - rz * sinP;
    var rz2 = ry * sinP + rz * cosP;

    var depth = rz2 + fov;
    if (depth < 1) continue;

    var scale = fov / depth;
    projected.push({
      sx: centerX + rx * scale,
      sy: centerY + ry2 * scale * charAspect,
      depth: depth,
      idx: i
    });
  }

  projected.sort(function(a, b2) { return b2.depth - a.depth; });

  // Bird characters — dark silhouettes (like real murmurations against sky)
  for (var pi = 0; pi < projected.length; pi++) {
    var p = projected[pi];
    var gx = p.sx | 0;
    var gy = p.sy | 0;
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

    var depthNorm = Math.max(0, Math.min(1, (p.depth - fov * 0.3) / (fov * 1.4)));

    // Birds are DARK silhouettes against the sky — brighter = closer
    var bright = 25 + (1 - depthNorm) * 50;
    var sat = 15 + (1 - depthNorm) * 25;

    // Close birds: warm (sunset lit), far birds: cool silhouette
    var hue = depthNorm < 0.5 ? 30 + depthNorm * 40 : 220 + depthNorm * 30;

    // Pick bird character based on velocity
    var bi = boids[p.idx];
    var angle = Math.atan2(bi.vy, bi.vx);
    var ch;
    var absAngle = Math.abs(angle);
    if (absAngle < 0.4) ch = '>';
    else if (absAngle > 2.7) ch = '<';
    else if (angle < 0) ch = '^';
    else ch = 'v';

    // Close birds use denser chars
    if (depthNorm < 0.3) {
      ch = depthNorm < 0.15 ? 'W' : 'w';
      bright += 10;
    }

    // Trail deposit
    var tidx = gy * W + gx;
    trailGrid[tidx] = Math.min(trailGrid[tidx] + 0.4, 1);

    drawCharHSL(ch, gx, gy, hue, sat, bright);
  }

  // Render trails (wispy aftermath in sky)
  for (var y = 0; y < horizonY; y++) {
    for (var x = 0; x < W; x++) {
      var v = trailGrid[y * W + x];
      if (v < 0.04) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 4)) | 0);
      if (ri < 1) continue;
      var th = 220 + v * 50;
      var ts = 15 + v * 20;
      var tb = 5 + v * 12;
      drawCharHSL(RAMP_DENSE[ri], x, y, th, ts, tb);
    }
  }

  // Scatter ripple effect
  if (scatterTime > 0) {
    var ripRadius = (1.5 - scatterTime) * 20;
    var ripAlpha = scatterTime / 1.5;
    for (var ra = 0; ra < 40; ra++) {
      var rang = ra * Math.PI * 2 / 40;
      var rpx = Math.round(pointer.gx + Math.cos(rang) * ripRadius) | 0;
      var rpy = Math.round(pointer.gy + Math.sin(rang) * ripRadius * 0.5) | 0;
      if (rpx >= 0 && rpx < W && rpy >= 0 && rpy < H) {
        drawCharHSL('*', rpx, rpy, 40, 60, 30 + ripAlpha * 40);
      }
    }
  }
}

// Ripple effect storage
function addRippleEffect(gx, gy) {
  // Visual feedback handled in render via scatterTime
}

registerMode('flock', {
  init: initFlock,
  render: renderFlock,
});
