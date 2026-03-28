import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { state } from '../core/state.js';

var paintGrid, paintHueGrid;
var paintPointerDown = false;
var paintLastX = -1, paintLastY = -1;
var paintHue = 0;

function initPaint() {
  var sz = state.COLS * state.ROWS;
  paintGrid = new Float32Array(sz);
  paintHueGrid = new Float32Array(sz);
  paintPointerDown = false;
  paintLastX = -1; paintLastY = -1;
  paintHue = 0;
}
// initPaint(); — called via registerMode
function paintStroke(gx, gy, radius) {
  var W = state.COLS, H = state.ROWS;
  var r = radius || 2;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      var nx = (gx + dx) | 0, ny = (gy + dy) | 0;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      var strength = (1 - d / r) * 0.4;
      var idx = ny * W + nx;
      paintGrid[idx] = Math.min(paintGrid[idx] + strength, 1);
      paintHueGrid[idx] = paintHue;
    }
  }
}



function renderPaint() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!paintGrid || paintGrid.length !== W * H) initPaint();

  // Slow decay for trailing effect
  for (var i = 0; i < paintGrid.length; i++) paintGrid[i] *= 0.998;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var v = paintGrid[idx];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = paintHueGrid[idx];
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70 + v * 30, 20 + v * 55);
    }
  }

  // Ambient shimmer on painted areas
  if (!paintPointerDown) {
    for (var i = 0; i < 5; i++) {
      var rx = Math.floor(Math.random() * W);
      var ry = Math.floor(Math.random() * H);
      var idx = ry * W + rx;
      if (paintGrid[idx] > 0.3) {
        paintGrid[idx] = Math.min(paintGrid[idx] + 0.1, 1);
      }
    }
  }
}


function attach_paint() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'paint') return;
    paintPointerDown = true;
    var g = screenToGrid(e.clientX, e.clientY);
    paintLastX = g.gx; paintLastY = g.gy;
    paintStroke(g.gx, g.gy, 2);
  });

  state.canvas.addEventListener('mousemove', function(e) {
    if (!paintPointerDown || state.currentMode !== 'paint') return;
    var g = screenToGrid(e.clientX, e.clientY);
    // Interpolate between last and current for smooth strokes
    var dx = g.gx - paintLastX, dy = g.gy - paintLastY;
    var steps = Math.max(1, Math.sqrt(dx * dx + dy * dy) | 0);
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      paintStroke(paintLastX + dx * t, paintLastY + dy * t, 2);
    }
    paintLastX = g.gx; paintLastY = g.gy;
    paintHue = (paintHue + 0.8) % 360;
  });

  state.canvas.addEventListener('mouseup', function() { if (state.currentMode === 'paint') { paintPointerDown = false; paintLastX = -1; } });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'paint') return;
    e.preventDefault();
    paintPointerDown = true;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    paintLastX = g.gx; paintLastY = g.gy;
    paintStroke(g.gx, g.gy, 2);
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (!paintPointerDown || state.currentMode !== 'paint') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    var dx = g.gx - paintLastX, dy = g.gy - paintLastY;
    var steps = Math.max(1, Math.sqrt(dx * dx + dy * dy) | 0);
    for (var s = 0; s <= steps; s++) {
      var tt = s / steps;
      paintStroke(paintLastX + dx * tt, paintLastY + dy * tt, 2);
    }
    paintLastX = g.gx; paintLastY = g.gy;
    paintHue = (paintHue + 0.8) % 360;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'paint') { paintPointerDown = false; paintLastX = -1; } });

}

registerMode('paint', {
  init: initPaint,
  render: renderPaint,
  attach: attach_paint,
});
