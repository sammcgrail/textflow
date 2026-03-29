import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var csBlocks, csSpeed;
function initCascade() { csBlocks = []; csSpeed = 1; }
function renderCascade() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!csBlocks) initCascade();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'cascade') {
    pointer.clicked = false;
    // Spawn cascade from click point
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    for (var i = 0; i < 10; i++) {
      csBlocks.push({ x: gx + (Math.random() - 0.5) * 4, y: gy, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2, ch: '#+*=@'[(Math.random() * 5) | 0], hue: (Math.random() * 360) | 0, life: 1 });
    }
  } else if (pointer.down && state.currentMode === 'cascade') {
    csSpeed = 0.3 + (pointer.gx / W) * 3;
  }
  // Auto-spawn from top
  var step = (t * 8 * csSpeed) | 0;
  var prevStep = ((t - 0.016) * 8 * csSpeed) | 0;
  if (step > prevStep) {
    var sx = (Math.sin(t * 0.7) * 0.4 + 0.5) * W;
    csBlocks.push({ x: sx, y: 0, vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random(), ch: '#+*=@%$'[(Math.random() * 7) | 0], hue: (t * 40 + Math.random() * 60) % 360, life: 1 });
  }
  // Physics
  for (var i = csBlocks.length - 1; i >= 0; i--) {
    var b = csBlocks[i];
    b.vy += 0.08 * csSpeed;
    b.x += b.vx * 0.3 * csSpeed;
    b.y += b.vy * 0.3 * csSpeed;
    // Bounce off walls
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * 0.7; }
    if (b.x >= W) { b.x = W - 1; b.vx = -Math.abs(b.vx) * 0.7; }
    // Bounce off floor
    if (b.y >= H - 1) {
      b.y = H - 2; b.vy = -Math.abs(b.vy) * 0.5;
      b.life -= 0.1;
      // Spawn smaller pieces
      if (b.life > 0.3 && Math.random() < 0.4) {
        csBlocks.push({ x: b.x, y: b.y, vx: b.vx + (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 2, ch: '.', hue: b.hue, life: b.life * 0.5 });
      }
    }
    if (b.life <= 0) { csBlocks.splice(i, 1); continue; }
    var px = b.x | 0, py = b.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL(b.ch, px, py, b.hue | 0, 70, (b.life * 45) | 0);
    }
  }
  if (csBlocks.length > 500) csBlocks.splice(0, csBlocks.length - 500);
  // Floor
  for (var x = 0; x < W; x++) drawCharHSL('_', x, H - 1, 0, 0, 6);
}
registerMode('cascade', { init: initCascade, render: renderCascade });
