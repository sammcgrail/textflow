import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// 3D Starling Murmuration — boids with perspective projection

var boids = [];
var NUM_BOIDS = 600;
var trailGrid;
var lastW = 0, lastH = 0;

// Camera orbits slowly
var camAngle = 0;
var camPitch = 0.3;

// Flock attractor — drifts around to create shape morphing
var attrX = 0, attrY = 0, attrZ = 0;
var attrTargX = 0, attrTargY = 0, attrTargZ = 0;
var attrTimer = 0;

function initFlock() {
  var W = state.COLS, H = state.ROWS;
  lastW = W; lastH = H;
  NUM_BOIDS = state.isMobile ? 350 : 600;

  // Spawn spread (in world units)
  var spread = Math.min(W, H) * 0.3;
  boids = [];
  for (var i = 0; i < NUM_BOIDS; i++) {
    boids.push({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
      z: (Math.random() - 0.5) * spread,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      vz: (Math.random() - 0.5) * 1.5
    });
  }

  trailGrid = new Float32Array(W * H);
  attrX = 0; attrY = 0; attrZ = 0;
  attrTargX = 0; attrTargY = 0; attrTargZ = 0;
  attrTimer = 0;
  camAngle = 0;
}

function renderFlock() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!trailGrid || lastW !== W || lastH !== H) initFlock();

  // Decay trails
  for (var i = 0; i < trailGrid.length; i++) trailGrid[i] *= 0.88;

  // Camera orbit
  camAngle += 0.008;
  camPitch = 0.25 + Math.sin(t * 0.15) * 0.15;

  var cosA = Math.cos(camAngle), sinA = Math.sin(camAngle);
  var cosP = Math.cos(camPitch), sinP = Math.sin(camPitch);

  // Drifting attractor — creates shape morphing
  attrTimer -= 1 / 60;
  if (attrTimer <= 0) {
    var range = Math.min(W, H) * 0.25;
    attrTargX = (Math.random() - 0.5) * range;
    attrTargY = (Math.random() - 0.5) * range;
    attrTargZ = (Math.random() - 0.5) * range;
    attrTimer = 3 + Math.random() * 4;
  }
  attrX += (attrTargX - attrX) * 0.02;
  attrY += (attrTargY - attrY) * 0.02;
  attrZ += (attrTargZ - attrZ) * 0.02;

  // Spatial hashing for neighbor lookup
  var cellSize = 6;
  var hashMap = {};
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];
    var cx = (b.x / cellSize) | 0;
    var cy = (b.y / cellSize) | 0;
    var cz = (b.z / cellSize) | 0;
    var key = cx + ',' + cy + ',' + cz;
    if (!hashMap[key]) hashMap[key] = [];
    hashMap[key].push(i);
  }

  // Update boids
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];

    var sx = 0, sy = 0, sz = 0; // separation
    var ax = 0, ay = 0, az = 0; // alignment
    var cx2 = 0, cy2 = 0, cz2 = 0; // cohesion
    var sc = 0, ac = 0, cc = 0;

    // Check neighbors in adjacent cells
    var bcx = (b.x / cellSize) | 0;
    var bcy = (b.y / cellSize) | 0;
    var bcz = (b.z / cellSize) | 0;

    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        for (var dz = -1; dz <= 1; dz++) {
          var nkey = (bcx + dx) + ',' + (bcy + dy) + ',' + (bcz + dz);
          var cell = hashMap[nkey];
          if (!cell) continue;
          for (var ci = 0; ci < cell.length; ci++) {
            var j = cell[ci];
            if (i === j) continue;
            var o = boids[j];
            var ddx = o.x - b.x, ddy = o.y - b.y, ddz = o.z - b.z;
            var d2 = ddx * ddx + ddy * ddy + ddz * ddz;

            if (d2 < 4 && d2 > 0) {
              // Separation
              sx -= ddx / d2; sy -= ddy / d2; sz -= ddz / d2; sc++;
            }
            if (d2 < 36) {
              // Alignment
              ax += o.vx; ay += o.vy; az += o.vz; ac++;
            }
            if (d2 < 100) {
              // Cohesion
              cx2 += ddx; cy2 += ddy; cz2 += ddz; cc++;
            }
          }
        }
      }
    }

    // Apply forces
    if (sc > 0) { b.vx += sx * 0.12; b.vy += sy * 0.12; b.vz += sz * 0.12; }
    if (ac > 0) { b.vx += (ax / ac - b.vx) * 0.04; b.vy += (ay / ac - b.vy) * 0.04; b.vz += (az / ac - b.vz) * 0.04; }
    if (cc > 0) { b.vx += (cx2 / cc) * 0.004; b.vy += (cy2 / cc) * 0.004; b.vz += (cz2 / cc) * 0.004; }

    // Attract toward drifting attractor
    var adx = attrX - b.x, ady = attrY - b.y, adz = attrZ - b.z;
    var ad = Math.sqrt(adx * adx + ady * ady + adz * adz) + 1;
    b.vx += adx / ad * 0.08;
    b.vy += ady / ad * 0.08;
    b.vz += adz / ad * 0.08;

    // Pointer interaction — attract flock
    if (pointer.down && state.currentMode === 'flock') {
      // Project pointer to world space (approximate)
      var pgx = (pointer.gx - W / 2) * 0.8;
      var pgy = (pointer.gy - H / 2) * 0.8;
      var pdx = pgx - b.x, pdy = pgy - b.y;
      var pd = Math.sqrt(pdx * pdx + pdy * pdy) + 1;
      b.vx += pdx / pd * 0.2;
      b.vy += pdy / pd * 0.2;
    }

    // Speed limits
    var spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    var maxSpd = 2.0;
    var minSpd = 0.5;
    if (spd > maxSpd) { var s = maxSpd / spd; b.vx *= s; b.vy *= s; b.vz *= s; }
    if (spd < minSpd && spd > 0.01) { var s2 = minSpd / spd; b.vx *= s2; b.vy *= s2; b.vz *= s2; }

    b.x += b.vx;
    b.y += b.vy;
    b.z += b.vz;

    // Soft boundary — steer back if too far from origin
    var boundary = Math.min(W, H) * 0.45;
    var dist = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
    if (dist > boundary) {
      var pull = (dist - boundary) * 0.01;
      b.vx -= b.x / dist * pull;
      b.vy -= b.y / dist * pull;
      b.vz -= b.z / dist * pull;
    }
  }

  // Project and render
  var cx3 = W / 2;
  var cy3 = H / 2;
  var fov = Math.min(W, H) * 1.2;
  var charAspect = state.CHAR_W / state.CHAR_H;

  // Sort by depth for proper layering (back to front)
  var projected = [];
  for (var i = 0; i < boids.length; i++) {
    var b = boids[i];

    // Rotate around Y axis (camera orbit)
    var rx = b.x * cosA - b.z * sinA;
    var rz = b.x * sinA + b.z * cosA;
    var ry = b.y;

    // Rotate around X axis (pitch)
    var ry2 = ry * cosP - rz * sinP;
    var rz2 = ry * sinP + rz * cosP;

    // Perspective projection
    var depth = rz2 + fov;
    if (depth < 1) continue;

    var scale = fov / depth;
    var sx2 = cx3 + rx * scale;
    var sy2 = cy3 + ry2 * scale * charAspect;

    projected.push({ sx: sx2, sy: sy2, depth: depth, idx: i });
  }

  // Sort back to front
  projected.sort(function(a, b2) { return b2.depth - a.depth; });

  // Render birds
  var birdChars = 'vV^<>~wWmM';
  for (var pi = 0; pi < projected.length; pi++) {
    var p = projected[pi];
    var gx = p.sx | 0;
    var gy = p.sy | 0;

    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

    // Depth-based appearance
    var depthNorm = Math.max(0, Math.min(1, (p.depth - fov * 0.3) / (fov * 1.4)));
    var bright = 15 + (1 - depthNorm) * 55;
    var size = 1 - depthNorm * 0.6;

    // Hue: warm sunset tones, cooler when far
    var hue = 220 + depthNorm * 60; // deep blue to indigo
    var sat = 30 + (1 - depthNorm) * 40;

    // Pick character based on velocity direction
    var bi = boids[p.idx];
    var angle = Math.atan2(bi.vy, bi.vx);
    var chi = ((angle / Math.PI + 1) * birdChars.length / 2) | 0;
    chi = Math.max(0, Math.min(birdChars.length - 1, chi));
    var ch = birdChars[chi];

    // Close birds are denser characters
    if (size > 0.7) ch = RAMP_DENSE[Math.min(RAMP_DENSE.length - 1, ((1 - depthNorm) * 6 + 4) | 0)];

    // Trail deposit
    var ti = gy * W + gx;
    trailGrid[ti] = Math.min(trailGrid[ti] + 0.35, 1);

    drawCharHSL(ch, gx, gy, hue, sat, bright);
  }

  // Render trails (wispy aftermath)
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = trailGrid[y * W + x];
      if (v < 0.03) continue;
      // Only render trail if no bird is directly here (avoid overdraw)
      var ri = Math.min(RAMP_DENSE.length - 1, (v * (RAMP_DENSE.length - 3)) | 0);
      if (ri < 1) continue;
      var th = 240 + v * 40;
      var ts = 20 + v * 30;
      var tb = 8 + v * 18;
      drawCharHSL(RAMP_DENSE[ri], x, y, th, ts, tb);
    }
  }

  // Dusk sky gradient — very subtle background dots
  for (var y = 0; y < H; y++) {
    var skyBright = 3 + (1 - y / H) * 4;
    var skyHue = 240 + (1 - y / H) * 30; // deep blue to purple at top
    for (var x = 0; x < W; x++) {
      if (trailGrid[y * W + x] > 0.03) continue;
      // Sparse stars/dots
      var hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      if ((hash - (hash | 0)) > 0.985) {
        drawCharHSL('.', x, y, skyHue, 15, skyBright + Math.sin(t * 2 + x + y) * 2);
      }
    }
  }
}

registerMode('flock', {
  init: initFlock,
  render: renderFlock,
});
