import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var growBranches = [];
var growGrid;
var growHueGrid;
var MAX_GROW_BRANCHES = 2000;

function initGrow() {
  growBranches = [];
  var sz = state.COLS * state.ROWS;
  growGrid = new Float32Array(sz);
  growHueGrid = new Float32Array(sz);
}
// initGrow(); — called via registerMode
function plantTree(gx, gy) {
  var hue = (Math.random() * 120 + 80) | 0; // green-ish range
  growBranches.push({
    x: gx, y: gy, angle: -Math.PI / 2,
    len: 0, maxLen: 6 + Math.random() * 8,
    thickness: 3, depth: 0, maxDepth: 5 + Math.floor(Math.random() * 3),
    speed: 0.15 + Math.random() * 0.1, hue: hue, growing: true
  });
}


function renderGrow() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!growGrid || growGrid.length !== W * H) initGrow();

  // Slow decay
  for (var i = 0; i < growGrid.length; i++) growGrid[i] *= 0.999;

  // Grow branches
  var newBranches = [];
  for (var i = 0; i < growBranches.length; i++) {
    var b = growBranches[i];
    if (!b.growing) continue;

    b.len += b.speed;
    // Plot current position
    var tipX = b.x + Math.cos(b.angle) * b.len;
    var tipY = b.y + Math.sin(b.angle) * b.len;
    var gx = tipX | 0, gy = tipY | 0;

    // Draw trunk/branch thickness
    var thick = Math.max(1, b.thickness | 0);
    for (var dy = -thick; dy <= thick; dy++) {
      for (var dx = -thick; dx <= thick; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d <= thick) {
            var idx = ny * W + nx;
            growGrid[idx] = Math.min(growGrid[idx] + 0.3 * (1 - d / (thick + 1)), 1);
            growHueGrid[idx] = b.hue + b.depth * 20;
          }
        }
      }
    }

    if (b.len >= b.maxLen) {
      b.growing = false;
      // Fork into 2-3 branches
      if (b.depth < b.maxDepth && growBranches.length + newBranches.length < MAX_GROW_BRANCHES) {
        var numForks = 2 + (Math.random() < 0.3 ? 1 : 0);
        for (var f = 0; f < numForks; f++) {
          var spread = 0.3 + Math.random() * 0.5;
          var forkAngle = b.angle + (f - (numForks - 1) / 2) * spread;
          forkAngle += (Math.random() - 0.5) * 0.3; // jitter
          newBranches.push({
            x: tipX, y: tipY, angle: forkAngle,
            len: 0, maxLen: b.maxLen * (0.6 + Math.random() * 0.2),
            thickness: Math.max(0.5, b.thickness * 0.6),
            depth: b.depth + 1, maxDepth: b.maxDepth,
            speed: b.speed * 0.9, hue: b.hue, growing: true
          });
        }
      }
    }
  }
  for (var i = 0; i < newBranches.length; i++) growBranches.push(newBranches[i]);

  // Render
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var v = growGrid[idx];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = growHueGrid[idx] % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 15 + v * 50);
    }
  }
}


function attach_grow() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'grow') return;
    var g = screenToGrid(e.clientX, e.clientY);
    plantTree(g.gx, g.gy);
  });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'grow') return;
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    plantTree(g.gx, g.gy);
  }, { passive: false });

}

registerMode('grow', {
  init: initGrow,
  render: renderGrow,
  attach: attach_grow,
});
