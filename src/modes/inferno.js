import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var infPillars, infParticles, infW, infH, infHeat;

function initInferno() {
  infW = state.COLS; infH = state.ROWS;
  infPillars = [];
  infParticles = [];
  infHeat = new Float32Array(infW * infH);
  // Create initial pillars spread across bottom
  var numPillars = 5 + Math.floor(Math.random() * 3);
  for (var i = 0; i < numPillars; i++) {
    infPillars.push({
      x: (infW / (numPillars + 1)) * (i + 1),
      baseHeight: infH * 0.4 + Math.random() * infH * 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
      width: 2 + Math.random() * 2
    });
  }
}

function spawnFlameParticle(x, y, vx, vy) {
  infParticles.push({
    x: x, y: y,
    vx: vx || (Math.random() - 0.5) * 0.6,
    vy: vy || -(0.3 + Math.random() * 0.8),
    life: 0.6 + Math.random() * 0.4,
    decay: 0.008 + Math.random() * 0.015,
    hue: Math.random() * 35
  });
}

function renderInferno() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (infW !== W || infH !== H) initInferno();
  var t = state.time * 0.001;

  // Click creates a new pillar
  if (pointer.clicked && state.currentMode === 'inferno') {
    pointer.clicked = false;
    infPillars.push({
      x: pointer.gx,
      baseHeight: H * 0.3 + Math.random() * H * 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5,
      width: 2 + Math.random() * 2
    });
  }

  // Decay heat grid
  for (var j = 0; j < infW * infH; j++) {
    infHeat[j] *= 0.9;
  }

  var fireChars = ['#', '@', '%', '*', '+', '=', '~', '.', ','];

  // Generate particles from each pillar
  for (var p = 0; p < infPillars.length; p++) {
    var pil = infPillars[p];
    var sway = Math.sin(t * pil.speed + pil.phase) * 3;
    var heightPulse = pil.baseHeight + Math.sin(t * pil.speed * 1.5 + pil.phase) * H * 0.1;
    var pillarTop = H - heightPulse;

    // Emit dense fire particles along the pillar
    for (var i = 0; i < 15; i++) {
      var py = H - 1 - Math.random() * heightPulse;
      var px = pil.x + sway * ((H - py) / heightPulse) + (Math.random() - 0.5) * pil.width * 2;
      spawnFlameParticle(px, py, (Math.random() - 0.5) * 0.4 + sway * 0.02, -(0.2 + Math.random() * 0.6));
    }

    // Bright base embers
    for (var i = 0; i < 5; i++) {
      var bx = pil.x + (Math.random() - 0.5) * pil.width * 3;
      spawnFlameParticle(bx, H - 1 - Math.random() * 3, (Math.random() - 0.5) * 0.3, -(0.5 + Math.random() * 0.5));
    }

    // Stamp heat on pillar core
    for (var y = (pillarTop | 0); y < H; y++) {
      for (var dx = -2; dx <= 2; dx++) {
        var hx = (pil.x + sway * ((H - y) / heightPulse) + dx) | 0;
        if (hx >= 0 && hx < W && y >= 0 && y < H) {
          var intensity = 1 - Math.abs(dx) * 0.25;
          infHeat[y * W + hx] = Math.max(infHeat[y * W + hx], intensity * (1 - (y - pillarTop) / heightPulse * 0.3));
        }
      }
    }
  }

  // Drag attracts flames
  if (pointer.down && state.currentMode === 'inferno') {
    for (var i = 0; i < 8; i++) {
      spawnFlameParticle(
        pointer.gx + (Math.random() - 0.5) * 4,
        pointer.gy + (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 0.5,
        -(0.3 + Math.random() * 0.5)
      );
    }
    // Pull nearby particles toward pointer
    for (var i = 0; i < infParticles.length; i++) {
      var fp = infParticles[i];
      var dx = pointer.gx - fp.x, dy = pointer.gy - fp.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (dist < 15) {
        fp.vx += (dx / dist) * 0.05;
        fp.vy += (dy / dist) * 0.05;
      }
    }
  }

  // Update particles
  for (var i = infParticles.length - 1; i >= 0; i--) {
    var fp = infParticles[i];
    fp.x += fp.vx;
    fp.y += fp.vy;
    fp.vy -= 0.008; // rise
    fp.vx *= 0.98;
    fp.life -= fp.decay;
    if (fp.life <= 0 || fp.y < 0 || fp.y >= H) {
      infParticles.splice(i, 1);
      continue;
    }
    var ix = fp.x | 0, iy = fp.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      infHeat[iy * W + ix] = Math.max(infHeat[iy * W + ix], fp.life * 0.5);
    }
  }

  // Render heat grid + particles together
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var h = infHeat[y * W + x];
      if (h < 0.03) continue;
      // Shimmer effect near pillars
      var shimmer = Math.sin(t * 8 + x * 0.5 + y * 0.3) * 0.1;
      h = Math.min(1, h + shimmer);
      if (h < 0.03) continue;
      var ci = ((1 - h) * fireChars.length) | 0;
      ci = Math.min(ci, fireChars.length - 1);
      // Orange/red palette: hot = low hue (0-15), cool = higher (20-35)
      var hue = (h * 15 + (1 - h) * 35) | 0;
      var light = (45 + h * 20) | 0;
      var sat = (85 + h * 15) | 0;
      drawCharHSL(fireChars[ci], x, y, hue, sat, light);
    }
  }

  // Draw bright particle cores on top
  for (var i = 0; i < infParticles.length; i++) {
    var fp = infParticles[i];
    var ix = fp.x | 0, iy = fp.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var ci = ((1 - fp.life) * 5) | 0;
      ci = Math.min(ci, fireChars.length - 1);
      var hue = (fp.hue + (1 - fp.life) * 15) | 0;
      var light = (50 + fp.life * 15) | 0;
      drawCharHSL(fireChars[ci], ix, iy, hue, 100, light);
    }
  }

  // Cap
  if (infParticles.length > 2500) infParticles.splice(0, infParticles.length - 2500);
  if (infPillars.length > 15) infPillars.splice(0, infPillars.length - 15);
}

registerMode('inferno', {
  init: initInferno,
  render: renderInferno,
});
