import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var snDebris, snShockwave, snW, snH, snPhase, snCx, snCy, snTimer;

function initSupernova() {
  snW = state.COLS; snH = state.ROWS;
  snCx = snW * 0.5; snCy = snH * 0.5;
  snDebris = [];
  snShockwave = [];
  snPhase = 0; // 0=building, 1=exploding, 2=collapsing
  snTimer = 0;
  // Start with a star
  for (var i = 0; i < 60; i++) {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * 3;
    snDebris.push({
      x: snCx + Math.cos(angle) * r,
      y: snCy + Math.sin(angle) * r,
      vx: 0, vy: 0,
      life: 0.8 + Math.random() * 0.2,
      decay: 0,
      hue: 40 + Math.random() * 20,
      size: 0.8 + Math.random() * 0.2
    });
  }
}

function triggerExplosion(cx, cy) {
  // Shockwave ring particles
  for (var i = 0; i < 120; i++) {
    var angle = (i / 120) * Math.PI * 2 + Math.random() * 0.1;
    var speed = 0.8 + Math.random() * 0.6;
    snShockwave.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.008 + Math.random() * 0.005,
      hue: 200 + Math.random() * 60
    });
  }
  // Debris flying outward
  for (var i = 0; i < 200; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.3 + Math.random() * 1.2;
    snDebris.push({
      x: cx + (Math.random() - 0.5) * 4,
      y: cy + (Math.random() - 0.5) * 3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.7 + Math.random() * 0.3,
      decay: 0.003 + Math.random() * 0.005,
      hue: Math.random() * 360,
      size: 0.3 + Math.random() * 0.7
    });
  }
}

function renderSupernova() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (snW !== W || snH !== H) initSupernova();
  var t = state.time * 0.001;

  // Click triggers immediate explosion
  if (pointer.clicked && state.currentMode === 'supernova') {
    pointer.clicked = false;
    triggerExplosion(pointer.gx, pointer.gy);
  }

  snTimer += 0.016;

  // Auto-cycle: build -> explode -> collapse -> rebuild
  if (snPhase === 0) {
    // Building: particles converge to center, star grows
    for (var i = 0; i < 3; i++) {
      var angle = Math.random() * Math.PI * 2;
      var r = 1 + Math.random() * 2;
      snDebris.push({
        x: snCx + Math.cos(angle) * r,
        y: snCy + Math.sin(angle) * r,
        vx: 0, vy: 0,
        life: 0.9 + Math.random() * 0.1,
        decay: 0,
        hue: 30 + Math.random() * 30,
        size: 0.8 + Math.random() * 0.2
      });
    }
    if (snTimer > 3) { snPhase = 1; snTimer = 0; }
  } else if (snPhase === 1) {
    // Explode!
    triggerExplosion(snCx, snCy);
    snPhase = 2;
    snTimer = 0;
  } else if (snPhase === 2) {
    // Collapsing: debris slowly pulled back to center
    for (var i = 0; i < snDebris.length; i++) {
      var d = snDebris[i];
      var dx = snCx - d.x, dy = snCy - d.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      d.vx += (dx / dist) * 0.005;
      d.vy += (dy / dist) * 0.005;
    }
    if (snTimer > 5) { snPhase = 0; snTimer = 0; }
  }

  // Drag pulls debris toward pointer
  if (pointer.down && state.currentMode === 'supernova') {
    for (var i = 0; i < snDebris.length; i++) {
      var d = snDebris[i];
      var dx = pointer.gx - d.x, dy = pointer.gy - d.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (dist < 30) {
        d.vx += (dx / dist) * 0.06;
        d.vy += (dy / dist) * 0.06;
      }
    }
    for (var i = 0; i < snShockwave.length; i++) {
      var s = snShockwave[i];
      var dx = pointer.gx - s.x, dy = pointer.gy - s.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (dist < 25) {
        s.vx += (dx / dist) * 0.04;
        s.vy += (dy / dist) * 0.04;
      }
    }
  }

  // Update shockwave
  var shockChars = ['O', 'o', '.', '~', '-'];
  for (var i = snShockwave.length - 1; i >= 0; i--) {
    var s = snShockwave[i];
    s.x += s.vx;
    s.y += s.vy;
    s.life -= s.decay;
    if (s.life <= 0 || s.x < -2 || s.x >= W + 2 || s.y < -2 || s.y >= H + 2) {
      snShockwave.splice(i, 1);
      continue;
    }
    var ix = s.x | 0, iy = s.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var ci = ((1 - s.life) * shockChars.length) | 0;
      ci = Math.min(ci, shockChars.length - 1);
      var hue = (s.hue + (1 - s.life) * 40) | 0;
      var light = (45 + s.life * 25) | 0;
      drawCharHSL(shockChars[ci], ix, iy, hue % 360, 90, light);
    }
  }

  // Update debris
  var debrisChars = ['#', '@', '%', '*', '+', '=', '.'];
  for (var i = snDebris.length - 1; i >= 0; i--) {
    var d = snDebris[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vx *= 0.995;
    d.vy *= 0.995;
    d.life -= d.decay;
    if (d.life <= 0) { snDebris.splice(i, 1); continue; }

    // Wrap
    if (d.x < 0) d.x += W;
    if (d.x >= W) d.x -= W;
    if (d.y < 0) d.y += H;
    if (d.y >= H) d.y -= H;

    var ix = d.x | 0, iy = d.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      // Distance from center determines color
      var dx = d.x - snCx, dy = d.y - snCy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var ci = ((1 - d.size) * debrisChars.length) | 0;
      ci = Math.min(ci, debrisChars.length - 1);
      var hue, light;
      if (dist < 3) {
        // White-hot center
        hue = 40;
        light = 75;
      } else if (dist < 8) {
        hue = (40 + dist * 15) | 0;
        light = (60 + d.life * 10) | 0;
      } else {
        hue = (d.hue + 200) % 360;
        light = (40 + d.life * 20) | 0;
      }
      drawCharHSL(debrisChars[ci], ix, iy, hue % 360, dist < 5 ? 30 : 90, light);
    }
  }

  // Draw bright center star (always present)
  var starPulse = Math.sin(t * 5) * 0.2 + 0.8;
  var starSize = snPhase === 0 ? 2 : (snPhase === 2 ? 1 : 0);
  for (var dy = -starSize; dy <= starSize; dy++) {
    for (var dx = -starSize; dx <= starSize; dx++) {
      var sx = (snCx | 0) + dx, sy = (snCy | 0) + dy;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        var sd = Math.abs(dx) + Math.abs(dy);
        if (sd <= starSize) {
          var sl = (70 + starPulse * 10 - sd * 10) | 0;
          drawCharHSL('*', sx, sy, 40, 30, Math.min(sl, 80));
        }
      }
    }
  }

  // Cap
  if (snDebris.length > 1500) snDebris.splice(0, snDebris.length - 1500);
  if (snShockwave.length > 500) snShockwave.splice(0, snShockwave.length - 500);
}

registerMode('supernova', {
  init: initSupernova,
  render: renderSupernova,
});
