import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var vsSeeds = [];
var vsBolts = [];
var VS_NUM = 15;

function initVorostorm() {
  vsSeeds = [];
  vsBolts = [];
  for (var i = 0; i < VS_NUM; i++) {
    vsSeeds.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      hue: 220 + Math.random() * 60, // blue to purple range
      pulse: Math.random() * Math.PI * 2
    });
  }
}

function makeLightningBolt(x1, y1, x2, y2) {
  var segs = [];
  var dx = x2 - x1, dy = y2 - y1;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var steps = Math.max(5, (dist * 0.8) | 0);
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var jitter = (1 - Math.abs(t - 0.5) * 2) * 3;
    var nx = x1 + dx * t + (Math.random() - 0.5) * jitter;
    var ny = y1 + dy * t + (Math.random() - 0.5) * jitter;
    segs.push({ x: nx | 0, y: ny | 0 });
  }
  return segs;
}

function spawnBolts(count) {
  var t = state.time;
  for (var b = 0; b < count; b++) {
    var i = (Math.random() * vsSeeds.length) | 0;
    var j, bestDist = 1e9;
    // Find nearest neighbor
    for (var k = 0; k < vsSeeds.length; k++) {
      if (k === i) continue;
      var dx = vsSeeds[k].x - vsSeeds[i].x;
      var dy = vsSeeds[k].y - vsSeeds[i].y;
      var d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; j = k; }
    }
    if (j !== undefined) {
      vsBolts.push({
        segs: makeLightningBolt(vsSeeds[i].x, vsSeeds[i].y, vsSeeds[j].x, vsSeeds[j].y),
        birth: t,
        hue: 190 + Math.random() * 40
      });
    }
  }
}

function renderVorostorm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'vorostorm') {
    pointer.clicked = false;
    spawnBolts(8); // Massive multi-bolt discharge
  }

  // Move seeds
  for (var i = 0; i < vsSeeds.length; i++) {
    var s = vsSeeds[i];
    s.x += s.vx + Math.sin(t * 0.3 + i * 1.2) * 0.1;
    s.y += s.vy + Math.cos(t * 0.25 + i * 0.8) * 0.08;
    if (s.x < 0 || s.x >= W) s.vx *= -1;
    if (s.y < 0 || s.y >= H) s.vy *= -1;
    s.x = Math.max(0, Math.min(W - 1, s.x));
    s.y = Math.max(0, Math.min(H - 1, s.y));
    s.pulse += 0.05;
  }

  // Random bolt chance
  if (Math.random() < 0.05) {
    spawnBolts(1);
  }

  // Draw voronoi cells
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
      var isEdge = edge < 1.5;
      var v = isEdge ? 1 : Math.max(0, 1 - (edge - 1.5) / 8.5);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var seed = vsSeeds[ci];
      var pulseV = Math.sin(seed.pulse) * 0.15 + 0.85;
      var hue = seed.hue;
      var sat = isEdge ? 70 : 85 + v * 15;
      var lit = (isEdge ? 50 : 35 + v * 25) * pulseV;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, sat | 0, Math.max(30, lit) | 0);
    }
  }

  // Draw bolts
  for (var i = vsBolts.length - 1; i >= 0; i--) {
    var bolt = vsBolts[i];
    var age = t - bolt.birth;
    if (age > 0.8) { vsBolts.splice(i, 1); continue; }
    var bright = Math.max(0, 1 - age * 1.3);
    for (var j = 0; j < bolt.segs.length; j++) {
      var seg = bolt.segs[j];
      if (seg.x >= 0 && seg.x < W && seg.y >= 0 && seg.y < H) {
        var ch = bright > 0.6 ? '#' : bright > 0.3 ? '*' : '+';
        drawCharHSL(ch, seg.x, seg.y, bolt.hue | 0, 80, (50 + bright * 20) | 0);
        // Glow
        if (bright > 0.3) {
          if (seg.x > 0) drawCharHSL('.', seg.x - 1, seg.y, bolt.hue | 0, 60, (35 + bright * 15) | 0);
          if (seg.x < W - 1) drawCharHSL('.', seg.x + 1, seg.y, bolt.hue | 0, 60, (35 + bright * 15) | 0);
        }
      }
    }
  }
  if (vsBolts.length > 12) vsBolts.splice(0, vsBolts.length - 12);

  // Draw seed centers as bright nodes
  for (var i = 0; i < vsSeeds.length; i++) {
    var s = vsSeeds[i];
    var sx = s.x | 0, sy = s.y | 0;
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      var glow = Math.sin(s.pulse) * 8;
      drawCharHSL('@', sx, sy, s.hue | 0, 95, (55 + glow) | 0);
    }
  }
}

registerMode('vorostorm', { init: initVorostorm, render: renderVorostorm });
