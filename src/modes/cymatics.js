import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Chladni-plate cymatics — sand particles jostle on a vibrating plate and
// settle onto nodal curves where |z(x,y)| = 0. Click to advance to a new
// (n,m) vibration mode; auto-cycles every 5 seconds.

var cymParts = null;
var cymW, cymH;
var cymModes = [
  [3, 4], [2, 5], [4, 5], [3, 6], [1, 4], [2, 7],
  [5, 7], [4, 7], [6, 7], [3, 5], [1, 2], [2, 3]
];
var cymCur = 0;
var cymLastSwitch = 0;
var cymScatter = 0;

function chladni(x, y, n, m, W, H) {
  var nx = n * Math.PI * x / W;
  var my = m * Math.PI * y / H;
  var mx = m * Math.PI * x / W;
  var ny = n * Math.PI * y / H;
  return Math.cos(nx) * Math.cos(my) - Math.cos(mx) * Math.cos(ny);
}

function initCymatics() {
  cymW = state.COLS;
  cymH = state.ROWS;
  var N = state.isMobile ? 650 : 1400;
  cymParts = new Array(N);
  for (var i = 0; i < N; i++) {
    cymParts[i] = {
      x: Math.random() * cymW,
      y: Math.random() * cymH,
      vx: 0,
      vy: 0,
      h: (i / N * 360 + Math.random() * 40) % 360
    };
  }
  cymCur = 0;
  cymLastSwitch = state.time;
  cymScatter = 1.5;
}

function renderCymatics() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cymParts || cymW !== W || cymH !== H) initCymatics();

  // advance mode on click, or every 4.5s (tighter cadence, smoother transition)
  var shouldSwitch = false;
  if (pointer.clicked && state.currentMode === 'cymatics') {
    pointer.clicked = false;
    shouldSwitch = true;
  } else if ((state.time - cymLastSwitch) > 4.5) {
    shouldSwitch = true;
  }
  if (shouldSwitch) {
    cymCur = (cymCur + 1) % cymModes.length;
    cymLastSwitch = state.time;
    cymScatter = 1.6;
  }

  // slower scatter decay = smoother transition (~2.2s to settle vs ~1.3s before)
  if (cymScatter > 0) cymScatter = Math.max(0, cymScatter - 0.012);

  var mode = cymModes[cymCur];
  var n = mode[0], m = mode[1];
  var kickBase = 0.22 + cymScatter * 1.2;
  var driftStrength = 1.6;
  var damping = 0.72;
  var hueShift = (state.time * 18) % 360;
  var eps = 0.6;

  for (var i = 0; i < cymParts.length; i++) {
    var p = cymParts[i];
    var z = chladni(p.x, p.y, n, m, W, H);
    var amp = Math.abs(z); // 0..2
    // random kick (bigger where plate is vibrating more)
    var kick = amp * kickBase + cymScatter * 0.4;
    var a = Math.random() * Math.PI * 2;
    p.vx += Math.cos(a) * kick;
    p.vy += Math.sin(a) * kick;
    // deterministic drift: numerically estimate grad|z|, step down the gradient
    // (particles migrate from antinodes toward nodal lines)
    var ampPx = Math.abs(chladni(p.x + eps, p.y, n, m, W, H));
    var ampNx = Math.abs(chladni(p.x - eps, p.y, n, m, W, H));
    var ampPy = Math.abs(chladni(p.x, p.y + eps, n, m, W, H));
    var ampNy = Math.abs(chladni(p.x, p.y - eps, n, m, W, H));
    p.vx -= (ampPx - ampNx) * driftStrength;
    p.vy -= (ampPy - ampNy) * driftStrength;
    // damp
    p.vx *= damping;
    p.vy *= damping;
    // integrate
    p.x += p.vx;
    p.y += p.vy;
    // soft reflect at boundaries (keeps particles on the plate)
    if (p.x < 0) { p.x = 0; p.vx = -p.vx * 0.4; }
    if (p.x >= W) { p.x = W - 0.001; p.vx = -p.vx * 0.4; }
    if (p.y < 0) { p.y = 0; p.vy = -p.vy * 0.4; }
    if (p.y >= H) { p.y = H - 0.001; p.vy = -p.vy * 0.4; }
    // render
    var gx = p.x | 0, gy = p.y | 0;
    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    // particles on nodal lines (low amp, low speed) glow brightest
    var calm = 1 - Math.min(1, amp * 0.5 + speed * 0.3);
    var light = 42 + (calm * 40) | 0;
    var ch = calm > 0.78 ? '@' : calm > 0.6 ? '#' : calm > 0.4 ? '*' : speed > 1.0 ? '+' : '.';
    drawCharHSL(ch, gx, gy, (p.h + hueShift) | 0, 92, light);
  }
}

registerMode('cymatics', { init: initCymatics, render: renderCymatics });
