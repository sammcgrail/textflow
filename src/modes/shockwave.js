import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var swWaves, swSparks, swW, swH, swAutoTimer;

function initShockwave() {
  swW = state.COLS; swH = state.ROWS;
  swWaves = [];
  swSparks = [];
  swAutoTimer = 0;
  // Pre-seed with a few waves so it looks good immediately
  for (var i = 0; i < 3; i++) {
    swWaves.push({
      x: Math.random() * swW,
      y: Math.random() * swH,
      radius: Math.random() * 15,
      speed: 12 + Math.random() * 8,
      life: 0.6 + Math.random() * 0.4,
      hue: Math.random() * 360
    });
  }
  // Pre-seed sparks
  var sparkCount = state.isMobile ? 100 : 250;
  for (var i = 0; i < sparkCount; i++) {
    swSparks.push({
      x: Math.random() * swW,
      y: Math.random() * swH,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: Math.random(),
      hue: Math.random() * 360
    });
  }
}

function spawnWave(x, y) {
  swWaves.push({
    x: x, y: y,
    radius: 0,
    speed: 12 + Math.random() * 8,
    life: 1,
    hue: 170 + Math.random() * 40 // cyan-ish
  });
  // Spawn sparks at epicenter
  for (var i = 0; i < 30; i++) {
    var angle = Math.random() * Math.PI * 2;
    var spd = 0.5 + Math.random() * 2;
    swSparks.push({
      x: x, y: y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 0.5 + Math.random() * 0.5,
      hue: 20 + Math.random() * 40 // orange
    });
  }
}

function renderShockwave() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (swW !== W || swH !== H) initShockwave();
  var t = state.time * 0.001;

  if (pointer.clicked && state.currentMode === 'shockwave') {
    pointer.clicked = false;
    spawnWave(pointer.gx, pointer.gy);
  }

  // Drag spawns small waves
  if (pointer.down && state.currentMode === 'shockwave') {
    if (Math.random() < 0.1) {
      spawnWave(pointer.gx + (Math.random() - 0.5) * 5, pointer.gy + (Math.random() - 0.5) * 5);
    }
  }

  // Auto-trigger waves
  swAutoTimer += 0.016;
  if (swAutoTimer > 2 + Math.random() * 1.5) {
    swAutoTimer = 0;
    spawnWave(Math.random() * W, Math.random() * H);
  }

  // Render: compute interference for every cell
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var totalIntensity = 0;
      var bestHue = 200;
      var bestWeight = 0;

      for (var w = 0; w < swWaves.length; w++) {
        var wave = swWaves[w];
        var dx = x - wave.x, dy = y - wave.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var ringDist = Math.abs(dist - wave.radius);

        // Sharp ring with falloff
        var ringWidth = 3 + (1 - wave.life) * 5;
        if (ringDist < ringWidth) {
          var intensity = (1 - ringDist / ringWidth) * wave.life;

          // Leading edge is bright cyan/white, trailing is red/orange
          var edgeHue;
          if (dist < wave.radius) {
            edgeHue = 10 + (wave.radius - dist) * 3; // red/orange trailing
          } else {
            edgeHue = wave.hue; // cyan leading
          }

          totalIntensity += intensity;
          if (intensity > bestWeight) {
            bestWeight = intensity;
            bestHue = edgeHue;
          }
        }

        // Inner glow
        if (dist < wave.radius * 0.8) {
          var innerGlow = (1 - dist / (wave.radius * 0.8 + 0.1)) * wave.life * 0.2;
          totalIntensity += innerGlow;
        }
      }

      if (totalIntensity > 0.02) {
        totalIntensity = Math.min(totalIntensity, 1);
        var sat = 85 + totalIntensity * 15;
        var light = 20 + totalIntensity * 50;
        var ci = (totalIntensity * (RAMP_DENSE.length - 2) + 1) | 0;
        ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));
        drawCharHSL(RAMP_DENSE[ci], x, y, bestHue % 360, sat, Math.min(light, 75));
      } else {
        // Background sparkle
        var sparkle = Math.sin(x * 7.3 + y * 11.1 + t * 2) * 0.5 + 0.5;
        if (sparkle > 0.92) {
          drawCharHSL('.', x, y, 200, 40, 20 + sparkle * 10);
        }
      }
    }
  }

  // Update waves
  for (var i = swWaves.length - 1; i >= 0; i--) {
    var w = swWaves[i];
    w.radius += w.speed * 0.016;
    w.life -= 0.005;
    if (w.life <= 0 || w.radius > Math.max(W, H)) {
      swWaves.splice(i, 1);
    }
  }

  // Update and draw sparks
  for (var i = swSparks.length - 1; i >= 0; i--) {
    var s = swSparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.98;
    s.vy *= 0.98;
    s.life -= 0.008;

    if (s.life <= 0) {
      swSparks.splice(i, 1);
      continue;
    }

    // Wrap
    if (s.x < 0) s.x += W;
    if (s.x >= W) s.x -= W;
    if (s.y < 0) s.y += H;
    if (s.y >= H) s.y -= H;

    var ix = s.x | 0, iy = s.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var sl = 40 + s.life * 30;
      drawCharHSL('*', ix, iy, s.hue, 90, sl);
    }
  }

  // Cap
  if (swWaves.length > 20) swWaves.splice(0, swWaves.length - 20);
  if (swSparks.length > 800) swSparks.splice(0, swSparks.length - 800);
}

registerMode('shockwave', {
  init: initShockwave,
  render: renderShockwave,
});
