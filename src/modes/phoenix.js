import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var phParticles, phSparks, phTrail, phW, phH, phY, phPhase, phBurstTimer;

function initPhoenix() {
  phW = state.COLS; phH = state.ROWS;
  phParticles = [];
  phSparks = [];
  phTrail = new Float32Array(phW * phH);
  phY = phH * 0.8;
  phPhase = 0;
  phBurstTimer = 0;
  // Seed initial fire particles
  for (var i = 0; i < 150; i++) {
    spawnFireParticle(phW * 0.5 + (Math.random() - 0.5) * 10, phY + (Math.random() - 0.5) * 5);
  }
}

function spawnFireParticle(x, y) {
  phParticles.push({
    x: x, y: y,
    vx: (Math.random() - 0.5) * 0.8,
    vy: -(0.3 + Math.random() * 0.6),
    life: 0.6 + Math.random() * 0.4,
    decay: 0.008 + Math.random() * 0.012,
    hue: Math.random() * 40
  });
}

function spawnSpark(x, y) {
  var angle = Math.random() * Math.PI * 2;
  var speed = 0.5 + Math.random() * 1.5;
  phSparks.push({
    x: x, y: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.5 + Math.random() * 0.5,
    decay: 0.015 + Math.random() * 0.02,
    hue: Math.random() * 40
  });
}

function renderPhoenix() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (phW !== W || phH !== H) initPhoenix();
  var t = state.time * 0.001;

  // Click creates burst of sparks
  if (pointer.clicked && state.currentMode === 'phoenix') {
    pointer.clicked = false;
    for (var i = 0; i < 50; i++) {
      spawnSpark(pointer.gx, pointer.gy);
    }
  }

  // Drag creates fire trail
  if (pointer.down && state.currentMode === 'phoenix') {
    for (var i = 0; i < 5; i++) {
      spawnFireParticle(pointer.gx + (Math.random() - 0.5) * 3, pointer.gy + (Math.random() - 0.5) * 3);
    }
  }

  // Phoenix rises
  phPhase += 0.02;
  phY -= 0.15;

  // Burst at top and reform
  if (phY < H * 0.05) {
    for (var i = 0; i < 100; i++) {
      spawnSpark(W * 0.5, H * 0.1);
    }
    phY = H * 0.85;
    phPhase = 0;
  }

  // Phoenix body center
  var cx = W * 0.5;
  var cy = phY;
  var wingSpread = 8 + Math.sin(phPhase * 3) * 4;
  var wingFlap = Math.sin(phPhase * 4) * 3;

  // Emit particles along phoenix shape (body + wings)
  for (var i = 0; i < 12; i++) {
    // Body
    spawnFireParticle(cx + (Math.random() - 0.5) * 3, cy + (Math.random() - 0.5) * 2);
    // Left wing
    var wx = cx - wingSpread * (0.3 + Math.random() * 0.7);
    var wy = cy + wingFlap * Math.random() - 1;
    spawnFireParticle(wx, wy);
    // Right wing
    spawnFireParticle(cx + wingSpread * (0.3 + Math.random() * 0.7), wy);
    // Tail
    spawnFireParticle(cx + (Math.random() - 0.5) * 2, cy + 2 + Math.random() * 4);
  }

  // Trailing sparks
  if (Math.random() < 0.3) {
    spawnSpark(cx + (Math.random() - 0.5) * 6, cy + 3 + Math.random() * 3);
  }

  // Decay trail grid
  for (var j = 0; j < phTrail.length; j++) {
    phTrail[j] *= 0.92;
  }

  // Update fire particles
  var fireChars = ['#', '@', '%', '*', '+', '=', '~', '.'];
  for (var i = phParticles.length - 1; i >= 0; i--) {
    var p = phParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.01; // rise
    p.life -= p.decay;
    if (p.life <= 0 || p.y < 0 || p.y >= H) {
      phParticles.splice(i, 1);
      continue;
    }
    var ix = p.x | 0, iy = p.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      phTrail[iy * W + ix] = Math.max(phTrail[iy * W + ix], p.life);
      var ci = ((1 - p.life) * fireChars.length) | 0;
      ci = Math.min(ci, fireChars.length - 1);
      var hue = (p.hue + (1 - p.life) * 20) | 0;
      var light = (50 + p.life * 20) | 0;
      drawCharHSL(fireChars[ci], ix, iy, hue, 95, light);
    }
  }

  // Update sparks
  for (var i = phSparks.length - 1; i >= 0; i--) {
    var s = phSparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.02; // gravity
    s.vx *= 0.98;
    s.life -= s.decay;
    if (s.life <= 0 || s.x < 0 || s.x >= W || s.y < 0 || s.y >= H) {
      phSparks.splice(i, 1);
      continue;
    }
    var ix = s.x | 0, iy = s.y | 0;
    var hue = (s.hue + 10) | 0;
    var light = (45 + s.life * 25) | 0;
    drawCharHSL('*', ix, iy, hue, 100, light);
  }

  // Render trail
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = phTrail[y * W + x];
      if (v > 0.05) {
        var hue = (20 + (1 - v) * 20) | 0;
        var light = (40 + v * 15) | 0;
        drawCharHSL('.', x, y, hue, 85, light);
      }
    }
  }

  // Cap particles
  if (phParticles.length > 1500) phParticles.splice(0, phParticles.length - 1500);
  if (phSparks.length > 500) phSparks.splice(0, phSparks.length - 500);
}

registerMode('phoenix', {
  init: initPhoenix,
  render: renderPhoenix,
});
