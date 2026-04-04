import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var vtxParticles, vtxW, vtxH, vtxCx, vtxCy;

function initVortex() {
  vtxW = state.COLS; vtxH = state.ROWS;
  vtxCx = vtxW * 0.5; vtxCy = vtxH * 0.5;
  vtxParticles = [];
  var count = state.isMobile ? 400 : 800;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * Math.max(vtxW, vtxH) * 0.6;
    vtxParticles.push({
      x: vtxCx + Math.cos(angle) * r,
      y: vtxCy + Math.sin(angle) * r * (state.CHAR_W / state.CHAR_H),
      angle: angle,
      radius: r,
      speed: 0.3 + Math.random() * 0.7,
      hue: (angle / (Math.PI * 2)) * 360,
      depth: Math.random()
    });
  }
}

function renderVortex() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (vtxW !== W || vtxH !== H) initVortex();
  var t = state.time * 0.001;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'vortex') {
    pointer.clicked = false;
  }

  // Drag moves vortex center
  if (pointer.down && state.currentMode === 'vortex') {
    vtxCx += (pointer.gx - vtxCx) * 0.05;
    vtxCy += (pointer.gy - vtxCy) * 0.05;
  }

  // Background spiral pattern - fill entire grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - vtxCx, dy = (y - vtxCy) / aspect;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      var angle = Math.atan2(dy, dx);
      var spiral = Math.sin(angle * 3 - dist * 0.3 + t * 2) * 0.5 + 0.5;
      var ci = (spiral * 3 + 1) | 0;
      ci = Math.max(1, Math.min(ci, 4));
      var hue = (angle / (Math.PI * 2) * 360 + 360 + dist * 5 + t * 50) % 360;
      var light = 10 + spiral * 15;
      drawCharHSL(RAMP_DENSE[ci], x, y, hue, 70, light);
    }
  }

  // Update and draw particles
  var maxCount = state.isMobile ? 400 : 800;
  for (var i = vtxParticles.length - 1; i >= 0; i--) {
    var p = vtxParticles[i];
    var dx = p.x - vtxCx, dy = (p.y - vtxCy) / aspect;
    var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

    // Spiral inward, faster near center
    var angSpeed = p.speed * (2 + 20 / (dist + 1));
    p.angle += angSpeed * 0.016;
    p.radius -= 0.15 * p.speed;

    if (p.radius < 0.5) {
      // Respawn at edge
      p.angle = Math.random() * Math.PI * 2;
      p.radius = Math.max(W, H) * 0.5 + Math.random() * 10;
    }

    p.x = vtxCx + Math.cos(p.angle) * p.radius;
    p.y = vtxCy + Math.sin(p.angle) * p.radius * aspect;

    var ix = p.x | 0, iy = p.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var nearCenter = 1 - Math.min(p.radius / (Math.max(W, H) * 0.4), 1);
      var hue = (p.angle / (Math.PI * 2) * 360 + 360 + t * 30) % 360;
      var sat = 85 + nearCenter * 15;
      var light;

      if (nearCenter > 0.85) {
        // White-hot core
        light = 70 + nearCenter * 15;
        sat = 20;
        hue = 40;
      } else {
        light = 40 + nearCenter * 25;
      }

      var ci2 = (nearCenter * (RAMP_DENSE.length - 2) + 1) | 0;
      ci2 = Math.max(1, Math.min(ci2, RAMP_DENSE.length - 1));
      drawCharHSL(RAMP_DENSE[ci2], ix, iy, hue, sat, Math.min(light, 80));
    }
  }

  // Auto-spawn from edges
  while (vtxParticles.length < maxCount) {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.max(W, H) * 0.5 + Math.random() * 5;
    vtxParticles.push({
      x: vtxCx + Math.cos(angle) * r,
      y: vtxCy + Math.sin(angle) * r * aspect,
      angle: angle,
      radius: r,
      speed: 0.3 + Math.random() * 0.7,
      hue: 0,
      depth: Math.random()
    });
  }

  // Bright center
  var cr = 2;
  for (var dy = -cr; dy <= cr; dy++) {
    for (var dx = -cr; dx <= cr; dx++) {
      var cx = (vtxCx | 0) + dx, cy = (vtxCy | 0) + dy;
      if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
        var dd = Math.abs(dx) + Math.abs(dy);
        if (dd <= cr) {
          var sl = 75 - dd * 10;
          drawCharHSL('@', cx, cy, 40, 15, sl);
        }
      }
    }
  }

  if (vtxParticles.length > maxCount + 100) vtxParticles.splice(0, vtxParticles.length - maxCount);
}

registerMode('vortex', {
  init: initVortex,
  render: renderVortex,
});
