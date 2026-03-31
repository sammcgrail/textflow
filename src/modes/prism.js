import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var prismPoints, beamParticles, prismW, prismH;

function initPrism() {
  prismW = state.COLS; prismH = state.ROWS;
  prismPoints = [{ x: prismW * 0.5, y: prismH * 0.5 }];
  beamParticles = [];
  for (var i = 0; i < 200; i++) {
    spawnBeam(prismPoints[0], Math.random() * Math.PI * 2);
  }
}

function spawnBeam(prism, angle) {
  var speed = 0.3 + Math.random() * 0.5;
  beamParticles.push({
    x: prism.x, y: prism.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue: (angle / (Math.PI * 2) * 360 + 360) % 360,
    life: 1,
    decay: 0.005 + Math.random() * 0.008
  });
}

function renderPrism() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (prismW !== W || prismH !== H) initPrism();
  var t = state.time * 0.001;

  if (pointer.clicked && state.currentMode === 'prism') {
    pointer.clicked = false;
    prismPoints.push({ x: pointer.gx, y: pointer.gy });
    for (var i = 0; i < 80; i++) {
      spawnBeam(prismPoints[prismPoints.length - 1], Math.random() * Math.PI * 2);
    }
  }

  // Continuously emit beams from all prisms
  for (var p = 0; p < prismPoints.length; p++) {
    var pr = prismPoints[p];
    var rotAngle = t * 0.5 + p * 1.5;
    for (var i = 0; i < 8; i++) {
      var angle = rotAngle + (i / 8) * Math.PI * 2;
      spawnBeam(pr, angle);
    }
  }

  var beamChars = ['|', '/', '\\', '-'];
  for (var i = beamParticles.length - 1; i >= 0; i--) {
    var bp = beamParticles[i];

    // Drag bends beams toward pointer
    if (pointer.down && state.currentMode === 'prism') {
      var dx = pointer.gx - bp.x;
      var dy = pointer.gy - bp.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      if (dist < 20) {
        var force = 0.02 / (dist * 0.3 + 1);
        bp.vx += dx * force;
        bp.vy += dy * force;
      }
    }

    bp.x += bp.vx;
    bp.y += bp.vy;
    bp.life -= bp.decay;

    if (bp.life <= 0 || bp.x < 0 || bp.x >= W || bp.y < 0 || bp.y >= H) {
      beamParticles.splice(i, 1);
      continue;
    }

    var ix = bp.x | 0, iy = bp.y | 0;
    var angle = Math.atan2(bp.vy, bp.vx);
    var ci = ((angle / Math.PI * 4 + 8) | 0) % 4;
    var ch = beamChars[ci];
    var hue = (bp.hue + t * 30) % 360;
    var light = (40 + bp.life * 30) | 0;
    drawCharHSL(ch, ix, iy, hue | 0, 95, light);
  }

  // Draw prism bodies (bright rotating hue)
  for (var p = 0; p < prismPoints.length; p++) {
    var pr = prismPoints[p];
    var px = pr.x | 0, py = pr.y | 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var rx = px + dx, ry = py + dy;
        if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
          var hue2 = (t * 60 + p * 90) % 360;
          drawCharHSL('#', rx, ry, hue2 | 0, 90, 70);
        }
      }
    }
  }

  if (beamParticles.length > 2000) {
    beamParticles.splice(0, beamParticles.length - 2000);
  }
}

registerMode('prism', {
  init: initPrism,
  render: renderPrism,
});
