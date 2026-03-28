import { clearCanvas, drawChar } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var sandGrid, sandColorGrid;
var sandPointerDown = false;
var sandPointerX = 0, sandPointerY = 0;
var SAND_EMPTY = 0, SAND_GRAIN = 1, SAND_WALL = 2;
var sandColors = [
  [220,180,100], [200,160,80], [240,200,120], [180,140,60], [210,170,90]
];

function initSand() {
  var sz = state.COLS * state.ROWS;
  sandGrid = new Uint8Array(sz);
  sandColorGrid = new Uint8Array(sz);
  sandPointerDown = false;
  // Add some walls for interest
  for (var i = 0; i < 4; i++) {
    var wx = Math.floor(state.COLS * 0.2 + Math.random() * state.COLS * 0.6);
    var wy = Math.floor(state.ROWS * 0.4 + Math.random() * state.ROWS * 0.3);
    var wl = 8 + Math.floor(Math.random() * 15);
    var angle = Math.random() * Math.PI;
    for (var j = 0; j < wl; j++) {
      var px = (wx + j * Math.cos(angle)) | 0;
      var py = (wy + j * Math.sin(angle)) | 0;
      if (px >= 0 && px < state.COLS && py >= 0 && py < state.ROWS) {
        sandGrid[py * state.COLS + px] = SAND_WALL;
      }
    }
  }
}
// initSand(); — called via registerMode


function renderSand() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!sandGrid || sandGrid.length !== W * H) initSand();

  // Spawn sand at pointer
  if (sandPointerDown) {
    for (var s = 0; s < 3; s++) {
      var sx = ((sandPointerX + (Math.random() - 0.5) * 4) | 0);
      var sy = ((sandPointerY + (Math.random() - 0.5) * 2) | 0);
      if (sx >= 0 && sx < W && sy >= 0 && sy < H && sandGrid[sy * W + sx] === SAND_EMPTY) {
        sandGrid[sy * W + sx] = SAND_GRAIN;
        sandColorGrid[sy * W + sx] = Math.floor(Math.random() * sandColors.length);
      }
    }
  }

  // Physics — bottom-up scan
  for (var y = H - 2; y >= 0; y--) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      if (sandGrid[idx] !== SAND_GRAIN) continue;
      var below = (y + 1) * W + x;
      if (sandGrid[below] === SAND_EMPTY) {
        sandGrid[below] = SAND_GRAIN;
        sandColorGrid[below] = sandColorGrid[idx];
        sandGrid[idx] = SAND_EMPTY;
      } else {
        // Try diagonal
        var dir = Math.random() < 0.5 ? -1 : 1;
        var nx = x + dir;
        if (nx >= 0 && nx < W && sandGrid[(y + 1) * W + nx] === SAND_EMPTY) {
          sandGrid[(y + 1) * W + nx] = SAND_GRAIN;
          sandColorGrid[(y + 1) * W + nx] = sandColorGrid[idx];
          sandGrid[idx] = SAND_EMPTY;
        } else {
          nx = x - dir;
          if (nx >= 0 && nx < W && sandGrid[(y + 1) * W + nx] === SAND_EMPTY) {
            sandGrid[(y + 1) * W + nx] = SAND_GRAIN;
            sandColorGrid[(y + 1) * W + nx] = sandColorGrid[idx];
            sandGrid[idx] = SAND_EMPTY;
          }
        }
      }
    }
  }

  // Render
  var sandChars = '.:;=+*#@';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      if (sandGrid[idx] === SAND_WALL) {
        drawChar('#', x, y, 80, 80, 100, 0.6);
      } else if (sandGrid[idx] === SAND_GRAIN) {
        var ci = sandColorGrid[idx];
        var c = sandColors[ci];
        // Height-based brightness — grains near bottom are more packed
        var depth = y / H;
        var ch = sandChars[Math.min(sandChars.length - 1, ((0.5 + depth * 0.5) * sandChars.length) | 0)];
        drawChar(ch, x, y, c[0], c[1], c[2], 0.5 + depth * 0.5);
      }
    }
  }
}


function attach_sand() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'sand') return;
    sandPointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    sandPointerX = g.gx; sandPointerY = g.gy;
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!sandPointerDown || state.currentMode !== 'sand') return;
    var g = screenToGrid(e.clientX, e.clientY);
    sandPointerX = g.gx; sandPointerY = g.gy;
  });

  state.canvas.addEventListener('mouseup', function() { if (state.currentMode === 'sand') sandPointerDown = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'sand') return;
    e.preventDefault();
    sandPointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    sandPointerX = g.gx; sandPointerY = g.gy;
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!sandPointerDown || state.currentMode !== 'sand') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    sandPointerX = g.gx; sandPointerY = g.gy;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'sand') sandPointerDown = false; });

}

registerMode('sand', {
  init: initSand,
  render: renderSand,
  attach: attach_sand,
});
