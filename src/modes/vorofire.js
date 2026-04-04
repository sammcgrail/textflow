import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var vfSeeds = [];
var vfSparks = [];
var VF_NUM = 15;

function initVorofire() {
  vfSeeds = [];
  vfSparks = [];
  for (var i = 0; i < VF_NUM; i++) {
    vfSeeds.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      hue: 10 + Math.random() * 40
    });
  }
}

function renderVorofire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'vorofire') {
    pointer.clicked = false;
    // Fire burst
    vfSeeds.push({
      x: pointer.gx, y: pointer.gy,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      hue: 15 + Math.random() * 35
    });
    if (vfSeeds.length > 30) vfSeeds.shift();
    for (var i = 0; i < 20; i++) {
      var angle = Math.random() * Math.PI * 2;
      vfSparks.push({
        x: pointer.gx, y: pointer.gy,
        vx: Math.cos(angle) * (0.5 + Math.random() * 1.5),
        vy: -Math.random() * 1.5 - 0.5,
        life: 0.6 + Math.random() * 0.8,
        hue: 20 + Math.random() * 40
      });
    }
  }

  // Move seeds
  for (var i = 0; i < vfSeeds.length; i++) {
    var s = vfSeeds[i];
    s.x += s.vx + Math.sin(t * 0.5 + i * 1.1) * 0.06;
    s.y += s.vy + Math.cos(t * 0.4 + i * 0.9) * 0.05;
    if (s.x < 0 || s.x >= W) s.vx *= -1;
    if (s.y < 0 || s.y >= H) s.vy *= -1;
    s.x = Math.max(0, Math.min(W - 1, s.x));
    s.y = Math.max(0, Math.min(H - 1, s.y));
  }

  // Spawn rising sparks from edges
  if (Math.random() < 0.3) {
    var si = (Math.random() * vfSeeds.length) | 0;
    var sj = (si + 1 + ((Math.random() * (vfSeeds.length - 1)) | 0)) % vfSeeds.length;
    var mx = (vfSeeds[si].x + vfSeeds[sj].x) * 0.5;
    var my = (vfSeeds[si].y + vfSeeds[sj].y) * 0.5;
    vfSparks.push({
      x: mx + (Math.random() - 0.5) * 3,
      y: my,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.3 - Math.random() * 0.8,
      life: 0.4 + Math.random() * 0.5,
      hue: 15 + Math.random() * 40
    });
  }

  // Draw voronoi cells with fire colors
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var d1 = 1e9, d2 = 1e9, ci = 0;
      var px = x * ar;
      for (var i = 0; i < vfSeeds.length; i++) {
        var dx = px - vfSeeds[i].x * ar;
        var dy = y - vfSeeds[i].y;
        var d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; ci = i; }
        else if (d < d2) { d2 = d; }
      }
      var edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge > 10) continue;
      var isEdge = edge < 1.5;
      var v = isEdge ? 1 : Math.max(0, 1 - (edge - 1.5) / 8.5);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var flicker = Math.sin(t * 8 + x * 0.4 + y * 0.3) * 5;
      var hue = vfSeeds[ci].hue + (isEdge ? 10 : 0);
      var sat = isEdge ? 95 : 85 + v * 15;
      var lit = isEdge ? 55 + flicker : 45 + v * 25 + flicker;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, sat | 0, Math.max(30, lit) | 0);
    }
  }

  // Update and draw sparks
  var maxSparks = state.isMobile ? 80 : 250;
  for (var i = vfSparks.length - 1; i >= 0; i--) {
    var sp = vfSparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= 0.025;
    sp.vx *= 0.98;
    if (sp.life <= 0 || sp.x < 0 || sp.x >= W || sp.y < 0 || sp.y >= H) {
      vfSparks.splice(i, 1);
      continue;
    }
    var bright = sp.life;
    var ch = bright > 0.5 ? '@' : bright > 0.3 ? '*' : '.';
    var hue = sp.hue + (1 - bright) * 20;
    drawCharHSL(ch, sp.x | 0, sp.y | 0, hue | 0, 95, (50 + bright * 20) | 0);
  }
  if (vfSparks.length > maxSparks) vfSparks.splice(0, vfSparks.length - maxSparks);
}

registerMode('vorofire', { init: initVorofire, render: renderVorofire });
