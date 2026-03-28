import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer, screenToGrid } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var blobs = [];
var NUM_BLOBS = 7;

function initBlobs() {
  blobs = [];
  lavaPointerDown = false;
  for (var i = 0; i < NUM_BLOBS; i++) {
    blobs.push({
      x: Math.random() * state.COLS,
      y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.5 + (i % 2 === 0 ? -0.15 : 0.15),
      r: 4 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2
    });
  }
}
// initBlobs(); — called via registerMode
var lavaColors = [
  [255,40,20], [255,100,40], [255,160,60], [255,200,100], [255,230,180]
];

// Interactive lava — click/touch to drop lava blobs
var lavaPointerDown = false;
var lavaPointerX = 0;
var lavaPointerY = 0;
var lavaPrevX = 0;
var lavaPrevY = 0;
var lavaSpawnTimer = 0;
var MAX_BLOBS = 80;

function spawnLavaBlob(gx, gy, dragVX, dragVY) {
  if (blobs.length >= MAX_BLOBS) {
    if (blobs.length > NUM_BLOBS) blobs.splice(NUM_BLOBS, 1);
  }
  var dvx = dragVX || 0, dvy = dragVY || 0;
  blobs.push({
    x: gx,
    y: gy,
    vx: dvx * 0.3 + (Math.random() - 0.5) * 0.4,
    vy: dvy * 0.3 + (Math.random() - 0.5) * 0.3 - 0.05,
    r: 2.5 + Math.random() * 3,
    phase: Math.random() * Math.PI * 2,
    spawned: state.time,
    life: 5 + Math.random() * 5
  });
}







function renderLava() {
  clearCanvas();

  // Continuous spawn while holding — drip effect
  if (lavaPointerDown) {
    lavaSpawnTimer += 1;
    if (lavaSpawnTimer % 3 === 0) {
      var jx = lavaPointerX + (Math.random() - 0.5) * 2;
      var jy = lavaPointerY + (Math.random() - 0.5) * 1.5;
      spawnLavaBlob(jx, jy, (Math.random() - 0.5) * 0.3, Math.random() * 0.2);
    }
  }

  // Update blobs — fade out spawned blobs over their lifetime
  var i = blobs.length;
  while (i--) {
    var b = blobs[i];
    b.x += b.vx + Math.sin(state.time * 0.4 + b.phase) * 0.15;
    b.y += b.vy + Math.cos(state.time * 0.3 + b.phase) * 0.1;
    b.r += Math.sin(state.time * 0.5 + b.phase) * 0.03;
    if (b.x < 2 || b.x > state.COLS - 2) { b.vx *= -0.9; b.x = Math.max(2, Math.min(state.COLS - 2, b.x)); }
    if (b.y < 2 || b.y > state.ROWS - 2) { b.vy *= -0.8; b.y = Math.max(2, Math.min(state.ROWS - 2, b.y)); }
    b.vx *= 0.995; b.vy *= 0.995;
    b.vy += Math.sin(state.time * 0.2 + b.phase * 2) * 0.008;
    // Spawned blobs fade out
    if (b.life !== undefined) {
      var age = state.time - b.spawned;
      if (age > b.life) { blobs.splice(i, 1); continue; }
      // Shrink radius as blob ages
      var lifeFrac = 1 - age / b.life;
      b.r = Math.max(0.5, b.r * (0.998 + lifeFrac * 0.002));
    }
  }

  for (var y = 0; y < state.ROWS; y++) {
    for (var x = 0; x < state.COLS; x++) {
      var sum = 0;
      var px = x * 0.55;
      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var dx = px - b.x * 0.55;
        var dy = y - b.y;
        var fade = 1;
        if (b.life !== undefined) {
          var age = state.time - b.spawned;
          fade = Math.max(0, 1 - age / b.life);
          if (fade < 0.01) continue;
        }
        sum += (b.r * b.r * fade) / (dx * dx + dy * dy + 0.1);
      }
      var t = sum * 0.15;
      if (t > 1) t = 1;
      if (t < 0.08) continue;
      var ci = Math.min(4, (t * 5) | 0);
      var c = lavaColors[ci];
      var ri = Math.min(RAMP_DENSE.length - 1, (t * RAMP_DENSE.length) | 0);
      drawChar(RAMP_DENSE[ri], x, y, c[0], c[1], c[2], 0.3 + t * 0.7);
    }
  }
}


function attach_lava() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'lava') return;
    lavaPointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    lavaPointerX = g.gx; lavaPointerY = g.gy;
    lavaPrevX = g.gx; lavaPrevY = g.gy;
    spawnLavaBlob(g.gx, g.gy, 0, 0);
    lavaSpawnTimer = 0;
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!lavaPointerDown || state.currentMode !== 'lava') return;
    var g = screenToGrid(e.clientX, e.clientY);
    // Interpolate between prev and current — spawn along the drag path
    var dx = g.gx - lavaPrevX, dy = g.gy - lavaPrevY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1.5) {
      var steps = Math.min(8, Math.ceil(dist / 1.5));
      for (var s = 0; s < steps; s++) {
        var t = s / steps;
        var ix = lavaPrevX + dx * t + (Math.random() - 0.5) * 1.5;
        var iy = lavaPrevY + dy * t + (Math.random() - 0.5) * 1;
        spawnLavaBlob(ix, iy, dx * 0.5, dy * 0.5);
      }
    }
    lavaPrevX = g.gx; lavaPrevY = g.gy;
    lavaPointerX = g.gx; lavaPointerY = g.gy;
  });

  state.canvas.addEventListener('mouseup', function() { lavaPointerDown = false; });

  state.canvas.addEventListener('mouseleave', function() { lavaPointerDown = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'lava') return;
    e.preventDefault();
    lavaPointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    lavaPointerX = g.gx; lavaPointerY = g.gy;
    lavaPrevX = g.gx; lavaPrevY = g.gy;
    spawnLavaBlob(g.gx, g.gy, 0, 0);
    lavaSpawnTimer = 0;
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!lavaPointerDown || state.currentMode !== 'lava') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    var dx = g.gx - lavaPrevX, dy = g.gy - lavaPrevY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1.5) {
      var steps = Math.min(8, Math.ceil(dist / 1.5));
      for (var s = 0; s < steps; s++) {
        var tt = s / steps;
        var ix = lavaPrevX + dx * tt + (Math.random() - 0.5) * 1.5;
        var iy = lavaPrevY + dy * tt + (Math.random() - 0.5) * 1;
        spawnLavaBlob(ix, iy, dx * 0.5, dy * 0.5);
      }
    }
    lavaPrevX = g.gx; lavaPrevY = g.gy;
    lavaPointerX = g.gx; lavaPointerY = g.gy;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { lavaPointerDown = false; });

  state.canvas.addEventListener('touchcancel', function() { lavaPointerDown = false; });

}

registerMode('lava', {
  init: initBlobs,
  render: renderLava,
  attach: attach_lava,
});
