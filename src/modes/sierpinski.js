import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var spPoints, spVertices, spRotation;

function initSierpinski() {
  spPoints = [];
  spRotation = 0;
  setupVertices();
}

function setupVertices() {
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  var cx = W * 0.5, cy = H * 0.5;
  var r = Math.min(W * 0.45, H * 0.45);
  spVertices = [];
  for (var i = 0; i < 3; i++) {
    var a = spRotation + i * Math.PI * 2 / 3 - Math.PI * 0.5;
    spVertices.push({
      x: cx + Math.cos(a) * r * (1 / ar),
      y: cy + Math.sin(a) * r
    });
  }
}

function renderSierpinski() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (pointer.clicked && state.currentMode === 'sierpinski') {
    pointer.clicked = false;
    spPoints = [];
    spRotation += Math.PI / 6;
    setupVertices();
  }

  // Add points each frame using chaos game
  var addCount = state.isMobile ? 50 : 120;
  var px = spPoints.length > 0 ? spPoints[spPoints.length - 1].x : W * 0.5;
  var py = spPoints.length > 0 ? spPoints[spPoints.length - 1].y : H * 0.5;
  for (var i = 0; i < addCount; i++) {
    var vi = (Math.random() * 3) | 0;
    px = (px + spVertices[vi].x) * 0.5;
    py = (py + spVertices[vi].y) * 0.5;
    spPoints.push({ x: px | 0, y: py | 0, v: vi });
  }

  // Cap total points
  var maxPts = state.isMobile ? 8000 : 25000;
  if (spPoints.length > maxPts) spPoints.splice(0, spPoints.length - maxPts);

  // Build density grid
  var grid = new Uint8Array(W * H);
  var gridV = new Uint8Array(W * H); // which vertex
  for (var i = 0; i < spPoints.length; i++) {
    var p = spPoints[i];
    if (p.x >= 0 && p.x < W && p.y >= 0 && p.y < H) {
      var idx = p.y * W + p.x;
      if (grid[idx] < 255) grid[idx]++;
      gridV[idx] = p.v;
    }
  }

  // Draw
  var t = state.time;
  var vertexHues = [0, 120, 240]; // RGB-ish neon
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var density = grid[idx];
      if (density === 0) continue;
      var v = Math.min(1, density / 8);
      var hue = (vertexHues[gridV[idx]] + t * 30) % 360;
      var sat = 92 + v * 8;
      var lit = 55 + v * 15;
      var ch = density > 6 ? '@' : density > 3 ? '#' : density > 1 ? '*' : '.';
      drawCharHSL(ch, x, y, hue | 0, sat | 0, lit | 0);
    }
  }

  // Draw vertices as bright markers
  for (var i = 0; i < 3; i++) {
    var vx = spVertices[i].x | 0, vy = spVertices[i].y | 0;
    if (vx >= 0 && vx < W && vy >= 0 && vy < H) {
      drawCharHSL('@', vx, vy, (vertexHues[i] + t * 30) % 360 | 0, 100, 70);
    }
  }
}

registerMode('sierpinski', { init: initSierpinski, render: renderSierpinski });
