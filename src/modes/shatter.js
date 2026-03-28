import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { simplex2 } from '../core/noise.js';
import { state } from '../core/state.js';

var shatterFrags = [];
var shatterGrid;
var shatterIntact = true;
var MAX_SHATTER_FRAGS = 800;

function initShatter() {
  shatterFrags = [];
  shatterIntact = true;
  var sz = state.COLS * state.ROWS;
  shatterGrid = new Uint8Array(sz);
  // Fill with pattern
  var chars = 'TEXTFLOW=+-*#@.:;';
  for (var i = 0; i < sz; i++) shatterGrid[i] = 1;
}
// initShatter(); — called via registerMode

function shatterAt(gx, gy) {
  var W = state.COLS, H = state.ROWS;
  var radius = 8 + Math.random() * 5;
  var chars = 'TEXTFLOW=+-*#@.:;';
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var nx = (gx + dx) | 0, ny = (gy + dy) | 0;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      var idx = ny * W + nx;
      if (shatterGrid[idx] === 0) continue;
      shatterGrid[idx] = 0;
      if (shatterFrags.length < MAX_SHATTER_FRAGS) {
        var angle = Math.atan2(dy, dx);
        var force = (1 - d / radius) * 2;
        shatterFrags.push({
          x: nx, y: ny,
          vx: Math.cos(angle) * force + (Math.random() - 0.5) * 0.5,
          vy: Math.sin(angle) * force + (Math.random() - 0.5) * 0.5,
          ch: chars[Math.floor(Math.random() * chars.length)],
          life: 5 + Math.random() * 8,
          born: state.time,
          hue: (Math.atan2(dy, dx) * 57.3 + 180) % 360
        });
      }
    }
  }
  shatterIntact = false;
}

function renderShatter() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!shatterGrid || shatterGrid.length !== W * H) initShatter();

  // Render intact grid
  var chars = 'TEXTFLOW';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (shatterGrid[y * W + x] === 0) continue;
      var ci = (x + y * 3 + (state.time * 2 | 0)) % chars.length;
      var v = simplex2(x * 0.05 + state.time * 0.08, y * 0.07) * 0.3 + 0.5;
      var hue = (v * 40 + 200 + state.time * 5) % 360;
      drawCharHSL(chars[ci], x, y, hue, 50, 20 + v * 25);
    }
  }

  // Render fragments
  var i = shatterFrags.length;
  while (i--) {
    var f = shatterFrags[i];
    var age = state.time - f.born;
    if (age > f.life) { shatterFrags.splice(i, 1); continue; }
    f.x += f.vx; f.y += f.vy;
    f.vy += 0.02; // gravity
    f.vx *= 0.99; f.vy *= 0.99;
    var fade = 1 - age / f.life;
    var gx = f.x | 0, gy = f.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      drawCharHSL(f.ch, gx, gy, f.hue, 70 + fade * 30, 30 + fade * 50);
    }
  }

  // Auto-heal slowly
  if (!shatterIntact && shatterFrags.length === 0) {
    for (var i = 0; i < 20; i++) {
      var rx = Math.floor(Math.random() * W);
      var ry = Math.floor(Math.random() * H);
      shatterGrid[ry * W + rx] = 1;
    }
  }
}


function attach_shatter() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'shatter') return;
    var g = screenToGrid(e.clientX, e.clientY);
    shatterAt(g.gx, g.gy);
  });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'shatter') return;
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    shatterAt(g.gx, g.gy);
  }, { passive: false });

}

registerMode('shatter', {
  init: initShatter,
  render: renderShatter,
  attach: attach_shatter,
});
