import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var fbW, fbH, fbEmbers, fbPulse;

function initFireball() {
  fbW = state.COLS; fbH = state.ROWS;
  fbPulse = 0;
  fbEmbers = [];
  var count = state.isMobile ? 80 : 200;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * Math.max(fbW, fbH) * 0.5;
    fbEmbers.push({
      x: fbW * 0.5 + Math.cos(angle) * r,
      y: fbH * 0.5 + Math.sin(angle) * r,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -Math.random() * 0.5,
      life: Math.random(),
      hue: 15 + Math.random() * 25
    });
  }
}

function renderFireball() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (fbW !== W || fbH !== H) initFireball();
  var t = state.time * 0.001;
  var cx = W * 0.5, cy = H * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'fireball') {
    pointer.clicked = false;
  }

  // Auto-pulse: grows and contracts
  fbPulse += 0.016;
  var pulseSize = 0.4 + Math.sin(fbPulse * 1.2) * 0.2 + Math.sin(fbPulse * 0.7) * 0.1;

  // Drag attraction point
  var attractX = cx, attractY = cy;
  if (pointer.down && state.currentMode === 'fireball') {
    attractX = pointer.gx;
    attractY = pointer.gy;
  }

  // Fireball radius in grid units
  var maxR = Math.min(W, H) * pulseSize;

  // Draw fireball - fill entire screen with gradient
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - attractX, dy = (y - attractY) * (1 / aspect);
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Turbulent offset for organic fire look
      var turb1 = Math.sin(x * 0.3 + t * 3) * Math.cos(y * 0.4 + t * 2) * 3;
      var turb2 = Math.sin((x + y) * 0.2 + t * 2.5) * 2;
      var turbDist = dist + turb1 + turb2;

      var norm = turbDist / maxR; // 0 at center, 1 at edge

      if (norm < 1.5) {
        var hue, sat, light;
        if (norm < 0.2) {
          // White-hot core
          hue = 45;
          sat = 15 + norm * 100;
          light = 75 - norm * 20;
        } else if (norm < 0.5) {
          // Bright yellow
          hue = 45 - (norm - 0.2) * 50;
          sat = 90;
          light = 55 + (0.5 - norm) * 30;
        } else if (norm < 0.8) {
          // Orange
          hue = 25 - (norm - 0.5) * 30;
          sat = 95;
          light = 40 + (0.8 - norm) * 30;
        } else if (norm < 1.0) {
          // Red outer edge
          hue = 5;
          sat = 90;
          light = 25 + (1.0 - norm) * 30;
        } else {
          // Faint glow beyond edge
          hue = 0;
          sat = 80;
          light = 12 + (1.5 - norm) * 15;
        }

        // Flicker
        var flicker = Math.sin(x * 5 + y * 7 + t * 8) * 0.1;
        light += flicker * 10;

        var ci = ((1 - Math.min(norm, 1)) * (RAMP_DENSE.length - 2) + 1) | 0;
        ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));

        drawCharHSL(RAMP_DENSE[ci], x, y, Math.max(hue, 0), Math.min(sat, 100), Math.max(Math.min(light, 78), 10));
      } else {
        // Background: occasional ember
        if (Math.random() < 0.005) {
          drawCharHSL('.', x, y, 20, 80, 25);
        }
      }
    }
  }

  // Flying embers/sparks
  for (var i = fbEmbers.length - 1; i >= 0; i--) {
    var e = fbEmbers[i];
    // Float upward with random drift
    e.x += e.vx + Math.sin(t * 3 + i) * 0.1;
    e.y += e.vy - 0.05;
    e.life -= 0.003;

    if (e.life <= 0 || e.y < -2 || e.y >= H + 2) {
      // Respawn near fireball surface
      var angle = Math.random() * Math.PI * 2;
      var r = maxR * (0.8 + Math.random() * 0.4);
      e.x = attractX + Math.cos(angle) * r;
      e.y = attractY + Math.sin(angle) * r * aspect;
      e.vx = (Math.random() - 0.5) * 0.8;
      e.vy = -(0.3 + Math.random() * 0.8);
      e.life = 0.5 + Math.random() * 0.5;
      e.hue = 15 + Math.random() * 30;
      continue;
    }

    // Wrap horizontally
    if (e.x < 0) e.x += W;
    if (e.x >= W) e.x -= W;

    var ix = e.x | 0, iy = e.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var el = 35 + e.life * 35;
      var ch = e.life > 0.6 ? '*' : (e.life > 0.3 ? '+' : '.');
      drawCharHSL(ch, ix, iy, e.hue, 90, Math.min(el, 70));
    }
  }

  // Cap embers
  var maxEmbers = state.isMobile ? 150 : 400;
  if (fbEmbers.length > maxEmbers) fbEmbers.splice(0, fbEmbers.length - maxEmbers);
}

registerMode('fireball', {
  init: initFireball,
  render: renderFireball,
});
