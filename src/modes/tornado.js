import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var torParts, torCount, torW, torH;
function initTornado() {
  torW = state.COLS; torH = state.ROWS;
  torCount = state.isMobile ? 300 : 500;
  torParts = [];
  for (var i = 0; i < torCount; i++) {
    torParts.push({
      angle: Math.random() * Math.PI * 2,
      r: 2 + Math.random() * 15,
      y: Math.random() * torH,
      speed: 1 + Math.random() * 3,
      rise: 1 + Math.random() * 4
    });
  }
}
// initTornado(); — called via registerMode
function renderTornado() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (torW !== W || torH !== H) initTornado();
  var cx = W * 0.5, cy = H;
  if (pointer.down && state.currentMode === 'tornado') {
    cx = pointer.gx;
  }
  var debris = '~-=+*:;,.';
  for (var i = 0; i < torCount; i++) {
    var p = torParts[i];
    p.angle += p.speed * 0.05;
    p.y -= p.rise * 0.016 * 8;
    if (p.y < 0) { p.y = H; p.r = 2 + Math.random() * 15; }
    // Radius shrinks as height increases
    var heightPct = 1 - p.y / H;
    var radius = p.r * (0.3 + heightPct * 0.7);
    var px = cx + Math.cos(p.angle) * radius;
    var py = p.y;
    var ix = px | 0, iy = py | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var ch = debris[(i % debris.length)];
    var bright = (40 + heightPct * 60) | 0;
    drawCharHSL(ch, ix, iy, 30, 30, bright);
  }
}

registerMode('tornado', {
  init: initTornado,
  render: renderTornado,
});
