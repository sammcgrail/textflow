import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var qsW, qsH, qsJetParts, qsDiskParts, qsBgStars, qsBurst;

function initQuasar() {
  qsW = state.COLS; qsH = state.ROWS;
  var cx = qsW * 0.5, cy = qsH * 0.5;
  qsBurst = 0;
  qsJetParts = [];
  qsDiskParts = [];
  qsBgStars = [];

  // Pre-seed jet particles
  var jetCount = state.isMobile ? 80 : 200;
  for (var i = 0; i < jetCount; i++) {
    var dir = Math.random() < 0.5 ? -1 : 1; // up or down jet
    qsJetParts.push({
      x: cx + (Math.random() - 0.5) * 3,
      y: cy + dir * Math.random() * qsH * 0.45,
      vx: (Math.random() - 0.5) * 0.3,
      vy: dir * (2 + Math.random() * 4),
      life: Math.random(),
      hue: 200 + Math.random() * 40
    });
  }

  // Pre-seed accretion disk
  var diskCount = state.isMobile ? 60 : 150;
  for (var i = 0; i < diskCount; i++) {
    var angle = Math.random() * Math.PI * 2;
    var r = 3 + Math.random() * 15;
    qsDiskParts.push({
      angle: angle,
      radius: r,
      speed: 1.5 + Math.random() * 2 + 10 / (r + 1),
      hue: 20 + Math.random() * 40,
      life: 0.6 + Math.random() * 0.4
    });
  }

  // Background stars
  var starCount = state.isMobile ? 80 : 200;
  for (var i = 0; i < starCount; i++) {
    qsBgStars.push({
      x: Math.random() * qsW,
      y: Math.random() * qsH,
      brightness: 15 + Math.random() * 20,
      twinkle: Math.random() * Math.PI * 2
    });
  }
}

function renderQuasar() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (qsW !== W || qsH !== H) initQuasar();
  var t = state.time * 0.001;
  var cx = W * 0.5, cy = H * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'quasar') {
    pointer.clicked = false;
    qsBurst = 1.0; // trigger extra-bright burst
  }

  // Drag pulls jet direction
  if (pointer.down && state.currentMode === 'quasar') {
    for (var i = 0; i < qsJetParts.length; i++) {
      var p = qsJetParts[i];
      var dx = pointer.gx - p.x;
      p.vx += dx * 0.002;
    }
  }

  // Background stars
  for (var i = 0; i < qsBgStars.length; i++) {
    var s = qsBgStars[i];
    s.twinkle += 0.03;
    var tw = Math.sin(s.twinkle) * 0.3 + 0.7;
    var ix = s.x | 0, iy = s.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      drawCharHSL('.', ix, iy, 220, 20, s.brightness * tw);
    }
  }

  // Auto-pulse jet intensity
  var jetPulse = Math.sin(t * 1.5) * 0.3 + 0.7;
  var burstBoost = qsBurst > 0 ? qsBurst * 2 : 0;

  // Accretion disk - horizontal ellipse around center
  for (var i = 0; i < qsDiskParts.length; i++) {
    var d = qsDiskParts[i];
    d.angle += d.speed * 0.016;
    var px = cx + Math.cos(d.angle) * d.radius;
    var py = cy + Math.sin(d.angle) * d.radius * 0.2 * aspect; // squished vertically

    var ix = px | 0, iy = py | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var nearCenter = 1 - Math.min(d.radius / 15, 1);
      var hue = d.hue + nearCenter * 20;
      var light = 35 + nearCenter * 30 + d.life * 10;
      var sat = 80 + nearCenter * 20;
      var ch = nearCenter > 0.6 ? '#' : (nearCenter > 0.3 ? '*' : '+');
      drawCharHSL(ch, ix, iy, hue, Math.min(sat, 100), Math.min(light, 75));
    }
  }

  // Jet particles - up and down from center
  for (var i = qsJetParts.length - 1; i >= 0; i--) {
    var p = qsJetParts[i];
    p.x += p.vx;
    p.y += p.vy * (jetPulse + burstBoost) * 0.016 * 8;
    p.vx *= 0.98;
    p.life -= 0.004;

    if (p.life <= 0 || p.y < -2 || p.y >= H + 2) {
      // Respawn
      var dir = Math.random() < 0.5 ? -1 : 1;
      p.x = cx + (Math.random() - 0.5) * 2;
      p.y = cy;
      p.vx = (Math.random() - 0.5) * 0.2;
      p.vy = dir * (2 + Math.random() * 4);
      p.life = 0.8 + Math.random() * 0.2;
      p.hue = 200 + Math.random() * 40;
      continue;
    }

    var ix = p.x | 0, iy = p.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var distFromCenter = Math.abs(p.y - cy);
      var nearCore = 1 - Math.min(distFromCenter / (H * 0.4), 1);
      var hue, light, sat;
      if (nearCore > 0.7) {
        hue = 200; sat = 30; light = 65 + nearCore * 15;
      } else {
        hue = p.hue + (1 - nearCore) * 20;
        sat = 80;
        light = 40 + p.life * 20 + nearCore * 10;
      }
      var ch = nearCore > 0.5 ? '#' : (nearCore > 0.2 ? '|' : ':');
      drawCharHSL(ch, ix, iy, hue, sat, Math.min(light, 78));
    }
  }

  // Bright central core
  var coreR = 3;
  for (var dy = -coreR; dy <= coreR; dy++) {
    for (var dx = -coreR; dx <= coreR; dx++) {
      var sx = (cx | 0) + dx, sy = (cy | 0) + dy;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd <= coreR) {
          var cl = 70 + (1 - dd / coreR) * 15;
          drawCharHSL('@', sx, sy, 40, 20, Math.min(cl, 85));
        }
      }
    }
  }

  // Decay burst
  if (qsBurst > 0) qsBurst -= 0.02;
  if (qsBurst < 0) qsBurst = 0;
}

registerMode('quasar', {
  init: initQuasar,
  render: renderQuasar,
});
