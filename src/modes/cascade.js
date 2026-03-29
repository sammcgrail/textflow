import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var csParticles, csSpeed;
function initCascade() { csParticles = []; csSpeed = 1; }
function renderCascade() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!csParticles) initCascade();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'cascade') {
    pointer.clicked = false;
    for (var i = 0; i < 30; i++) {
      csParticles.push({ x: pointer.gx + (Math.random() - 0.5) * 6, y: pointer.gy, vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 3, ch: '#+*=@%$&'[(Math.random() * 8) | 0], hue: ((t * 50 + Math.random() * 40) % 360) | 0, life: 1, size: 0.5 + Math.random() });
    }
  } else if (pointer.down && state.currentMode === 'cascade') {
    csSpeed = 0.3 + (pointer.gx / W) * 3;
    if (Math.random() < 0.3) {
      for (var i = 0; i < 5; i++) csParticles.push({ x: pointer.gx + (Math.random() - 0.5) * 4, y: pointer.gy, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 2, ch: '*', hue: ((t * 50) % 360) | 0, life: 1, size: 0.5 });
    }
  }
  // Multiple sources
  for (var s = 0; s < 3; s++) {
    var sx = ((s + 0.5) / 3) * W + Math.sin(t * 0.5 + s * 2) * W * 0.1;
    if (Math.random() < 0.3 * csSpeed) {
      csParticles.push({ x: sx, y: 0, vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random() * 1.5, ch: '#+*=@%'[(Math.random() * 6) | 0], hue: ((s * 120 + t * 20) % 360) | 0, life: 1, size: 0.5 + Math.random() });
    }
  }
  // Ledges
  var ledges = [];
  for (var l = 0; l < 4; l++) {
    var ly = ((l + 1) / 5) * H;
    var lx1 = (Math.sin(l * 3 + 1) * 0.3 + 0.2) * W;
    var lx2 = lx1 + W * 0.2;
    ledges.push({ y: ly | 0, x1: lx1 | 0, x2: lx2 | 0 });
    for (var x = (lx1 | 0); x <= (lx2 | 0) && x < W; x++) {
      if (x >= 0 && (ly | 0) < H) drawCharHSL('=', x, ly | 0, 0, 0, 8);
    }
  }
  // Physics
  for (var i = csParticles.length - 1; i >= 0; i--) {
    var p = csParticles[i];
    p.vy += 0.1 * csSpeed;
    p.x += p.vx * 0.4 * csSpeed;
    p.y += p.vy * 0.4 * csSpeed;
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.6; }
    if (p.x >= W) { p.x = W - 1; p.vx = -Math.abs(p.vx) * 0.6; }
    for (var l = 0; l < ledges.length; l++) {
      var le = ledges[l];
      if (p.y >= le.y - 1 && p.y <= le.y + 1 && p.x >= le.x1 && p.x <= le.x2 && p.vy > 0) {
        p.vy = -Math.abs(p.vy) * 0.5; p.vx += (Math.random() - 0.5) * 1.5; p.y = le.y - 1;
      }
    }
    if (p.y >= H - 1) {
      p.y = H - 2; p.vy = -Math.abs(p.vy) * 0.4; p.life -= 0.15;
      if (p.life > 0.2 && Math.random() < 0.3) csParticles.push({ x: p.x, y: p.y, vx: p.vx + (Math.random() - 0.5) * 2, vy: -1 - Math.random() * 1.5, ch: '.', hue: p.hue, life: p.life * 0.4, size: 0.3 });
    }
    p.life -= 0.003;
    if (p.life <= 0) { csParticles.splice(i, 1); continue; }
    var px = p.x | 0, py = p.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL(p.ch, px, py, p.hue | 0, 70, (p.life * 40 * p.size) | 0);
      var tx = (p.x - p.vx * 0.3) | 0, ty = (p.y - p.vy * 0.3) | 0;
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) drawCharHSL('.', tx, ty, p.hue | 0, 40, (p.life * 12) | 0);
    }
  }
  if (csParticles.length > 600) csParticles.splice(0, csParticles.length - 600);
  for (var x = 0; x < W; x++) drawCharHSL('_', x, H - 1, 0, 0, 6);
}
registerMode('cascade', { init: initCascade, render: renderCascade });
