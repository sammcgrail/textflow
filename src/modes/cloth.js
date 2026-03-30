import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var clothPts, clothW, clothH, clothCols, clothRows, clothSpacing;
function initCloth() {
  var spacing = 2.5;
  clothCols = Math.min(30, ((state.COLS - 4) / spacing) | 0);
  clothRows = Math.min(18, ((state.ROWS - 4) / spacing) | 0);
  if (clothCols < 4) clothCols = 4;
  if (clothRows < 4) clothRows = 4;
  clothW = state.COLS; clothH = state.ROWS;
  clothPts = [];
  clothSpacing = spacing;
  var offX = (state.COLS - clothCols * spacing) * 0.5;
  var offY = 3;
  for (var r = 0; r < clothRows; r++) {
    for (var c = 0; c < clothCols; c++) {
      clothPts.push({
        x: offX + c * spacing, y: offY + r * spacing,
        ox: offX + c * spacing, oy: offY + r * spacing,
        px: offX + c * spacing, py: offY + r * spacing,
        pinned: r === 0 && c % 3 === 0
      });
    }
  }
}
// initCloth(); — called via registerMode
function renderCloth() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (clothW !== W || clothH !== H) initCloth();
  // Gravity + pointer wind
  var grav = 0.08;
  var windX = 0, windY = 0;
  if (pointer.down && state.currentMode === 'cloth') {
    windX = (pointer.gx - W * 0.5) * 0.003;
    windY = (pointer.gy - H * 0.5) * 0.003;
  }
  // Verlet integration
  for (var i = 0; i < clothPts.length; i++) {
    var p = clothPts[i];
    if (p.pinned) continue;
    var vx = (p.x - p.px) * 0.99 + windX;
    var vy = (p.y - p.py) * 0.99 + grav + windY;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy;
    // Bounds
    if (p.y > H - 1) { p.y = H - 1; p.py = p.y; }
    if (p.x < 0) { p.x = 0; p.px = p.x; }
    if (p.x > W - 1) { p.x = W - 1; p.px = p.x; }
  }
  // Spring constraints (3 iterations)
  var restX = clothSpacing, restY = clothSpacing;
  for (var iter = 0; iter < 3; iter++) {
    for (var r = 0; r < clothRows; r++) {
      for (var c = 0; c < clothCols; c++) {
        var idx = r * clothCols + c;
        var p = clothPts[idx];
        // Right neighbor
        if (c < clothCols - 1) {
          var q = clothPts[idx + 1];
          var dx = q.x - p.x, dy = q.y - p.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0) {
            var diff = (d - restX) / d * 0.5;
            if (!p.pinned) { p.x += dx * diff; p.y += dy * diff; }
            if (!q.pinned) { q.x -= dx * diff; q.y -= dy * diff; }
          }
        }
        // Bottom neighbor
        if (r < clothRows - 1) {
          var q = clothPts[idx + clothCols];
          var dx = q.x - p.x, dy = q.y - p.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0) {
            var diff = (d - restY) / d * 0.5;
            if (!p.pinned) { p.x += dx * diff; p.y += dy * diff; }
            if (!q.pinned) { q.x -= dx * diff; q.y -= dy * diff; }
          }
        }
      }
    }
  }
  // Draw
  for (var r = 0; r < clothRows; r++) {
    for (var c = 0; c < clothCols; c++) {
      var idx = r * clothCols + c;
      var p = clothPts[idx];
      var sx = p.x | 0, sy = p.y | 0;
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      // Strain coloring
      var strain = Math.sqrt((p.x - p.ox) * (p.x - p.ox) + (p.y - p.oy) * (p.y - p.oy));
      var v = Math.min(1, strain * 0.15);
      var ch = p.pinned ? '=' : (v > 0.5 ? '#' : (v > 0.2 ? '+' : '.'));
      var hue = (200 - v * 200) | 0;
      if (hue < 0) hue += 360;
      drawCharHSL(ch, sx, sy, hue, 70, (20 + v * 35) | 0);
    }
  }
}

registerMode('cloth', {
  init: initCloth,
  render: renderCloth,
});
