import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Poly-field — a swarm of radiating emitters lays down concentric waves.
// Each cell renders the amplitude-weighted hue blend of the N loudest
// emitters at that cell. Emitters drift on lissajous orbits autonomously,
// so the moire interference pattern morphs forever. Click re-seeds.
// Drag pulls the nearest emitter under the pointer.

var pfEmitters = null;
var pfW = 0, pfH = 0;
var pfFlashT = -10;

function pfSeed() {
  var N = state.isMobile ? 7 : 11;
  pfEmitters = new Array(N);
  for (var i = 0; i < N; i++) {
    pfEmitters[i] = {
      // center of lissajous orbit
      cx: pfW * (0.2 + Math.random() * 0.6),
      cy: pfH * (0.2 + Math.random() * 0.6),
      // orbit amplitudes + frequencies
      ax: pfW * (0.06 + Math.random() * 0.18),
      ay: pfH * (0.06 + Math.random() * 0.18),
      fx: 0.1 + Math.random() * 0.35,
      fy: 0.1 + Math.random() * 0.35,
      phx: Math.random() * Math.PI * 2,
      phy: Math.random() * Math.PI * 2,
      // wave emission
      k: 0.25 + Math.random() * 0.35,         // wavenumber
      omega: 1.2 + Math.random() * 2.2,       // temporal freq
      phase: Math.random() * Math.PI * 2,
      hue: (i * 360 / N + Math.random() * 25) % 360,
      // for drag
      drag: false
    };
    // live position cache
    pfEmitters[i].x = pfEmitters[i].cx;
    pfEmitters[i].y = pfEmitters[i].cy;
  }
}

function pfInit() {
  pfW = state.COLS;
  pfH = state.ROWS;
  pfSeed();
  pfFlashT = -10;
}

function pfRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!pfEmitters || pfW !== W || pfH !== H) pfInit();
  var t = state.time;

  // click → re-seed with flash
  if (pointer.clicked && state.currentMode === 'polyfield') {
    pointer.clicked = false;
    pfSeed();
    pfFlashT = t;
  }

  // drag → find nearest emitter, move its orbit center toward pointer
  if (pointer.down && state.currentMode === 'polyfield') {
    var pgx = pointer.gx, pgy = pointer.gy;
    var bestI = -1, bestD = 1e9;
    for (var ei = 0; ei < pfEmitters.length; ei++) {
      var em = pfEmitters[ei];
      var ddx = em.x - pgx, ddy = em.y - pgy;
      var dd = ddx * ddx + ddy * ddy;
      if (dd < bestD) { bestD = dd; bestI = ei; }
    }
    if (bestI >= 0) {
      var picked = pfEmitters[bestI];
      picked.cx += (pgx - picked.x) * 0.25;
      picked.cy += (pgy - picked.y) * 0.25;
    }
  }

  // update emitter live positions on lissajous orbits
  for (var n = 0; n < pfEmitters.length; n++) {
    var e = pfEmitters[n];
    e.x = e.cx + e.ax * Math.sin(t * e.fx + e.phx);
    e.y = e.cy + e.ay * Math.sin(t * e.fy + e.phy);
  }

  var flashStr = Math.max(0, 1 - (t - pfFlashT) / 1.4);

  // for each grid cell, find top-2 loudest emitters and blend their hues
  // amplitude ∝ cos(k*r - ω*t + φ) / (1 + r/R)
  var hueDrift = (t * 12) % 360;
  var N = pfEmitters.length;
  var CHARS = '.,:-~=+*x#%@';
  var CL = CHARS.length;
  // stride on mobile to keep frame rate
  var step = state.isMobile ? 1 : 1;
  for (var y = 0; y < H; y += step) {
    for (var x = 0; x < W; x += step) {
      var bestA = -1, bestH = 0, secA = -1, secH = 0, total = 0;
      for (var m = 0; m < N; m++) {
        var em2 = pfEmitters[m];
        var dx = x - em2.x, dy = y - em2.y;
        var r = Math.sqrt(dx * dx + dy * dy);
        var wave = Math.cos(em2.k * r - em2.omega * t + em2.phase);
        var falloff = 1.0 / (1 + r * 0.05);
        var a = wave * falloff;
        var aabs = Math.abs(a);
        total += aabs;
        if (aabs > bestA) {
          secA = bestA; secH = bestH;
          bestA = aabs; bestH = em2.hue;
        } else if (aabs > secA) {
          secA = aabs; secH = em2.hue;
        }
      }
      if (bestA <= 0) continue;
      // amplitude → brightness + char density
      var amp = Math.min(1, bestA * 3.0 + flashStr * 0.5);
      if (amp < 0.08) continue;
      // hue blend: top emitter dominates, second fills
      var wA = bestA, wB = Math.max(0, secA);
      var sumW = wA + wB + 0.0001;
      // circular hue average — shortest arc
      var h1 = bestH, h2 = secH;
      var dH = ((h2 - h1 + 540) % 360) - 180;
      var hue = (h1 + dH * (wB / sumW) + hueDrift + flashStr * 90) % 360;
      if (hue < 0) hue += 360;
      var light = 40 + (amp * 48) | 0;
      var ch = CHARS[Math.min(CL - 1, (amp * CL) | 0)];
      drawCharHSL(ch, x, y, hue | 0, 94, light);
    }
  }

  // draw emitter cores on top
  for (var n2 = 0; n2 < N; n2++) {
    var e2 = pfEmitters[n2];
    var gx = e2.x | 0, gy = e2.y | 0;
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    drawCharHSL('O', gx, gy, e2.hue | 0, 95, 72);
  }
}

registerMode('polyfield', { init: pfInit, render: pfRender });
