import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ftSeed, ftFrame, ftBuf, ftW, ftH;

function initFractree() {
  ftSeed = Math.random() * 10000;
  ftFrame = 0;
  ftW = state.COLS;
  ftH = state.ROWS;
  ftBuf = [];
}

function seededRandom(s) {
  var x = Math.sin(s) * 43758.5453;
  return x - Math.floor(x);
}

function buildBranches(x, y, angle, len, depth, maxDepth, seed) {
  if (depth <= 0 || len < 0.8) return;
  var ar = state.CHAR_W / state.CHAR_H;
  var ex = x + Math.cos(angle) * len;
  var ey = y + Math.sin(angle) * len * ar;
  var steps = (len * 1.5) | 0;
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    var px = (x + (ex - x) * t) | 0;
    var py = (y + (ey - y) * t) | 0;
    if (px >= 0 && px < ftW && py >= 0 && py < ftH) {
      var depthRatio = 1 - depth / maxDepth;
      var hue, sat, lit, ch;
      if (depth > maxDepth * 0.6) {
        hue = 25; sat = 50; lit = 30 + depthRatio * 10;
        ch = depth > maxDepth * 0.8 ? '#' : '|';
      } else if (depth > maxDepth * 0.3) {
        hue = 80 + depthRatio * 40; sat = 80; lit = 40 + depthRatio * 15;
        ch = depth > maxDepth * 0.5 ? '*' : '+';
      } else {
        var leafHues = [350, 30, 50, 320, 15];
        hue = leafHues[(seed * depth * 7.3) % leafHues.length | 0];
        sat = 90; lit = 50 + depthRatio * 15;
        ch = '@';
      }
      ftBuf.push({ x: px, y: py, hue: hue, sat: sat, lit: lit, ch: ch, depth: depth });
    }
  }
  var spread = 0.35 + seededRandom(seed + depth * 3.7) * 0.25;
  var shrink = 0.65 + seededRandom(seed + depth * 2.1) * 0.1;
  buildBranches(ex, ey, angle - spread, len * shrink, depth - 1, maxDepth, seed + 1.1);
  buildBranches(ex, ey, angle + spread, len * shrink, depth - 1, maxDepth, seed + 2.3);
  if (depth > 3 && seededRandom(seed + depth * 5.5) < 0.35) {
    var extraAngle = angle + (seededRandom(seed + depth * 8.1) - 0.5) * 0.6;
    buildBranches(ex, ey, extraAngle, len * 0.5, depth - 2, maxDepth, seed + 4.7);
  }
}

function renderFractree() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (ftW !== W || ftH !== H) { ftW = W; ftH = H; ftFrame = 0; }

  if (pointer.clicked && state.currentMode === 'fractree') {
    pointer.clicked = false;
    ftSeed = Math.random() * 10000;
    ftFrame = 0;
  }

  ftFrame++;
  ftBuf = [];
  var maxDepth = state.isMobile ? 8 : 10;
  var trunkLen = Math.min(H * 0.18, 14);
  buildBranches(W * 0.5, H - 2, -Math.PI * 0.5, trunkLen, maxDepth, maxDepth, ftSeed);

  // Animate: only draw up to ftFrame-based count
  var showCount = Math.min(ftBuf.length, ftFrame * 20);
  for (var i = 0; i < showCount; i++) {
    var p = ftBuf[i];
    var flicker = Math.sin(state.time * 3 + p.x * 0.5 + p.y * 0.7) * 5;
    drawCharHSL(p.ch, p.x, p.y, p.hue | 0, p.sat | 0, (p.lit + flicker) | 0);
  }

  // Ground
  for (var x = 0; x < W; x++) {
    drawCharHSL('_', x, H - 1, 25, 40, 20);
  }
}

registerMode('fractree', { init: initFractree, render: renderFractree });
