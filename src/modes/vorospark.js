import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var vsSeeds = [];
var vsSparks = [];
var VS_NUM = 20;

function initVorospark() {
  vsSeeds = [];
  vsSparks = [];
  for (var i = 0; i < VS_NUM; i++) {
    vsSeeds.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      hue: (i * 137.508) % 360
    });
  }
}

function spawnSparks(cx, cy, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.5 + Math.random() * 2;
    vsSparks.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.8 + Math.random() * 0.6,
      hue: 40 + Math.random() * 30
    });
  }
}

function renderVorospark() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (pointer.clicked && state.currentMode === 'vorospark') {
    pointer.clicked = false;
    spawnSparks(pointer.gx, pointer.gy, 30);
  }

  // Move seeds
  for (var i = 0; i < vsSeeds.length; i++) {
    var s = vsSeeds[i];
    s.x += s.vx + Math.sin(t * 0.4 + i) * 0.08;
    s.y += s.vy + Math.cos(t * 0.3 + i * 1.3) * 0.06;
    if (s.x < 0 || s.x >= W) s.vx *= -1;
    if (s.y < 0 || s.y >= H) s.vy *= -1;
    s.x = Math.max(0, Math.min(W - 1, s.x));
    s.y = Math.max(0, Math.min(H - 1, s.y));
  }

  // Spawn edge sparks occasionally
  if (Math.random() < 0.15) {
    var si = (Math.random() * vsSeeds.length) | 0;
    var sj = (si + 1 + ((Math.random() * (vsSeeds.length - 1)) | 0)) % vsSeeds.length;
    var mx = (vsSeeds[si].x + vsSeeds[sj].x) * 0.5;
    var my = (vsSeeds[si].y + vsSeeds[sj].y) * 0.5;
    spawnSparks(mx, my, 3);
  }

  // Draw voronoi cells
  var ar = state.CHAR_W / state.CHAR_H;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var d1 = 1e9, d2 = 1e9, ci = 0;
      var px = x * ar;
      for (var i = 0; i < vsSeeds.length; i++) {
        var dx = px - vsSeeds[i].x * ar;
        var dy = y - vsSeeds[i].y;
        var d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; ci = i; }
        else if (d < d2) { d2 = d; }
      }
      var edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge > 10) continue;
      var isEdge = edge < 1.2;
      var v = isEdge ? 1 : Math.max(0, 1 - (edge - 1.2) / 8.8);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = vsSeeds[ci].hue;
      var sat = isEdge ? 50 : 85 + v * 15;
      var lit = isEdge ? 60 + Math.sin(t * 5 + x * 0.3) * 10 : 50 + v * 20;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, sat | 0, lit | 0);
    }
  }

  // Update and draw sparks
  var maxSparks = state.isMobile ? 100 : 300;
  for (var i = vsSparks.length - 1; i >= 0; i--) {
    var sp = vsSparks[i];
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.life -= 0.03;
    sp.vx *= 0.97;
    sp.vy *= 0.97;
    if (sp.life <= 0 || sp.x < 0 || sp.x >= W || sp.y < 0 || sp.y >= H) {
      vsSparks.splice(i, 1);
      continue;
    }
    var bright = sp.life;
    var ch = bright > 0.6 ? '@' : bright > 0.3 ? '*' : '.';
    drawCharHSL(ch, sp.x | 0, sp.y | 0, sp.hue | 0, 90, (45 + bright * 25) | 0);
  }
  if (vsSparks.length > maxSparks) vsSparks.splice(0, vsSparks.length - maxSparks);
}

registerMode('vorospark', { init: initVorospark, render: renderVorospark });
