import { RAMP_FIRE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var fwRockets, fwParticles, fwW, fwH, fwTimer;
function initFirework() {
  fwW = state.COLS; fwH = state.ROWS;
  fwRockets = [];
  fwParticles = [];
  fwTimer = 0;
  // Initial burst — 3 rockets mid-flight
  for (var i = 0; i < 3; i++) {
    var x = fwW * 0.2 + Math.random() * fwW * 0.6;
    fwRockets.push({ x: x, y: fwH * 0.3 + Math.random() * fwH * 0.3, vx: (Math.random() - 0.5) * 2, vy: -(fwH * 0.1 + Math.random() * fwH * 0.1), targetY: fwH * 0.15, hue: (Math.random() * 360) | 0 });
  }
  // Plus 2 already-exploded bursts
  for (var i = 0; i < 2; i++) {
    var fakeR = { x: fwW * 0.25 + Math.random() * fwW * 0.5, y: fwH * 0.2 + Math.random() * fwH * 0.25, hue: (Math.random() * 360) | 0 };
    fwExplode(fakeR);
  }
}
// initFirework(); — called via registerMode
function fwLaunch(x) {
  // Scale velocity to grid size so rockets peak at ~20-35% from top
  var launchVy = -(fwH * 0.4 + Math.random() * fwH * 0.3);
  fwRockets.push({ x: x, y: fwH - 1, vx: (Math.random() - 0.5) * 2, vy: launchVy, targetY: fwH * (0.15 + Math.random() * 0.2), hue: (Math.random() * 360) | 0 });
}

function fwExplode(r) {
  var count = state.isMobile ? 40 : 70;
  // Scale particle spread to grid size
  var spread = Math.min(fwW, fwH) * 0.15;
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = spread * (0.2 + Math.random() * 0.8);
    fwParticles.push({
      x: r.x, y: r.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.01 + Math.random() * 0.02,
      hue: r.hue + (Math.random() - 0.5) * 30
    });
  }
}

function renderFirework() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (fwW !== W || fwH !== H) initFirework();
  fwTimer += 0.016;
  if (fwTimer > 0.8 + Math.random() * 1.2) {
    fwLaunch(W * 0.2 + Math.random() * W * 0.6);
    fwTimer = 0;
  }
  if (pointer.clicked && state.currentMode === 'firework') {
    pointer.clicked = false;
    fwLaunch(pointer.gx);
  }
  // Update rockets
  for (var i = fwRockets.length - 1; i >= 0; i--) {
    var r = fwRockets[i];
    r.x += r.vx * 0.016 * 15;
    r.y += r.vy * 0.016 * 15;
    r.vy += fwH * 0.15 * 0.016;
    if (r.y <= r.targetY || r.vy > 0) { fwExplode(r); fwRockets.splice(i, 1); continue; }
    var ix = r.x | 0, iy = r.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) drawChar('|', ix, iy, 255, 255, 200, 1);
  }
  // Update particles
  for (var i = fwParticles.length - 1; i >= 0; i--) {
    var p = fwParticles[i];
    p.x += p.vx * 0.016 * 10;
    p.y += p.vy * 0.016 * 10;
    p.vy += 6 * 0.016;
    p.vx *= 0.99;
    p.life -= p.decay;
    if (p.life <= 0) { fwParticles.splice(i, 1); continue; }
    var ix = p.x | 0, iy = p.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var ri = Math.min(RAMP_FIRE.length - 1, (p.life * RAMP_FIRE.length) | 0);
    drawCharHSL(RAMP_FIRE[ri], ix, iy, ((p.hue + 360) % 360) | 0, 90, (20 + p.life * 50) | 0);
  }
}

registerMode('firework', {
  init: initFirework,
  render: renderFirework,
});
