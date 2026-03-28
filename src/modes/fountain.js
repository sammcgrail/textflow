import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var ftnParts, ftnCount, ftnW, ftnH, ftnBaseX;
function initFountain() {
  ftnW = state.COLS; ftnH = state.ROWS;
  ftnCount = state.isMobile ? 200 : 400;
  ftnBaseX = ftnW * 0.5;
  ftnParts = [];
  for (var i = 0; i < ftnCount; i++) ftnParts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
}
// initFountain(); — called via registerMode
function renderFountain() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (ftnW !== W || ftnH !== H) initFountain();
  if (pointer.down && state.currentMode === 'fountain') ftnBaseX = pointer.gx;
  var wind = Math.sin(state.time * 0.5) * 1.5;
  for (var i = 0; i < ftnCount; i++) {
    var p = ftnParts[i];
    if (p.life <= 0) {
      p.x = ftnBaseX + (Math.random() - 0.5) * 2;
      p.y = H - 1;
      p.vx = (Math.random() - 0.5) * 6 + wind;
      p.vy = -(10 + Math.random() * 10);
      p.life = 0.5 + Math.random() * 1.5;
    }
    p.x += p.vx * 0.016 * 8;
    p.y += p.vy * 0.016 * 8;
    p.vy += 8 * 0.016;
    p.vx += wind * 0.016;
    p.life -= 0.016;
    var ix = p.x | 0, iy = p.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var v = Math.min(1, speed / 15);
    var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
    var b = (100 + v * 155) | 0;
    drawChar(RAMP_DENSE[ri], ix, iy, b, b, 255, Math.min(1, p.life));
  }
}

registerMode('fountain', {
  init: initFountain,
  render: renderFountain,
});
