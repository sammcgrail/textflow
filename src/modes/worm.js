import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { simplex2 } from '../core/noise.js';
import { state } from '../core/state.js';

var worms = [];
var wormGrid;
var wormTrail;
var MAX_WORMS = 30;

function initWorm() {
  worms = [];
  var sz = state.COLS * state.ROWS;
  wormGrid = new Uint8Array(sz);
  wormTrail = new Float32Array(sz);
  // Fill grid with characters
  for (var i = 0; i < sz; i++) wormGrid[i] = 1;
}
// initWorm(); — called via registerMode

function spawnWorm(gx, gy) {
  if (worms.length >= MAX_WORMS) worms.shift();
  var angle = Math.random() * Math.PI * 2;
  var segments = [];
  for (var i = 0; i < 8; i++) {
    segments.push({ x: gx - Math.cos(angle) * i, y: gy - Math.sin(angle) * i });
  }
  worms.push({
    segments: segments,
    angle: angle,
    speed: 0.3 + Math.random() * 0.3,
    turnRate: 0.1 + Math.random() * 0.15,
    hue: (Math.random() * 360) | 0,
    life: 15 + Math.random() * 20,
    born: state.time
  });
}

function renderWorm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!wormGrid || wormGrid.length !== W * H) initWorm();

  // Decay trail glow
  for (var i = 0; i < wormTrail.length; i++) wormTrail[i] *= 0.97;

  // Update worms
  var i = worms.length;
  while (i--) {
    var w = worms[i];
    var age = state.time - w.born;
    if (age > w.life) { worms.splice(i, 1); continue; }

    // Steer — random wandering with bias toward uneaten areas
    w.angle += (Math.random() - 0.5) * w.turnRate * 2;

    // Look ahead and prefer uneaten cells
    var bestAngle = w.angle;
    var bestFood = 0;
    for (var a = -3; a <= 3; a++) {
      var testAngle = w.angle + a * 0.3;
      var lookX = (w.segments[0].x + Math.cos(testAngle) * 3) | 0;
      var lookY = (w.segments[0].y + Math.sin(testAngle) * 3) | 0;
      if (lookX >= 0 && lookX < W && lookY >= 0 && lookY < H) {
        var food = wormGrid[lookY * W + lookX];
        if (food > bestFood) { bestFood = food; bestAngle = testAngle; }
      }
    }
    w.angle = w.angle * 0.7 + bestAngle * 0.3;

    // Move head
    var head = w.segments[0];
    var newX = head.x + Math.cos(w.angle) * w.speed;
    var newY = head.y + Math.sin(w.angle) * w.speed;

    // Wrap
    if (newX < 0) newX += W; if (newX >= W) newX -= W;
    if (newY < 0) newY += H; if (newY >= H) newY -= H;

    // Shift segments
    for (var s = w.segments.length - 1; s > 0; s--) {
      w.segments[s].x = w.segments[s - 1].x;
      w.segments[s].y = w.segments[s - 1].y;
    }
    w.segments[0] = { x: newX, y: newY };

    // Eat grid and leave trail
    var gx = newX | 0, gy = newY | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      wormGrid[gy * W + gx] = 0;
      wormTrail[gy * W + gx] = 1;
    }

    // Draw worm body
    for (var s = 0; s < w.segments.length; s++) {
      var seg = w.segments[s];
      var sgx = seg.x | 0, sgy = seg.y | 0;
      if (sgx >= 0 && sgx < W && sgy >= 0 && sgy < H) {
        var brightness = 1 - s / w.segments.length;
        var ch = s === 0 ? '@' : (s < 3 ? '#' : '*');
        var fade = Math.max(0, 1 - age / w.life);
        drawCharHSL(ch, sgx, sgy, w.hue, 70 + brightness * 30, 30 + brightness * 50 * fade);
      }
    }
  }

  // Render grid (uneaten chars)
  var gridChars = '.:;=+*#';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      if (wormGrid[idx] === 0) {
        // Show trail glow
        var tv = wormTrail[idx];
        if (tv > 0.05) {
          var ri = Math.min(RAMP_SOFT.length - 1, (tv * RAMP_SOFT.length) | 0);
          drawCharHSL(RAMP_SOFT[ri], x, y, 100, 50, 10 + tv * 20);
        }
        continue;
      }
      var n = simplex2(x * 0.06 + state.time * 0.05, y * 0.08) * 0.5 + 0.5;
      if (n < 0.15) continue;
      var ci = Math.min(gridChars.length - 1, (n * gridChars.length) | 0);
      drawCharHSL(gridChars[ci], x, y, (120 + n * 40) % 360, 40 + n * 30, 10 + n * 25);
    }
  }

  // Slowly regrow eaten cells
  if (worms.length === 0) {
    for (var r = 0; r < 10; r++) {
      var rx = Math.floor(Math.random() * W);
      var ry = Math.floor(Math.random() * H);
      wormGrid[ry * W + rx] = 1;
    }
  }
}


function attach_worm() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'worm') return;
    var g = screenToGrid(e.clientX, e.clientY);
    spawnWorm(g.gx, g.gy);
  });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'worm') return;
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    spawnWorm(g.gx, g.gy);
  }, { passive: false });

}

registerMode('worm', {
  init: initWorm,
  render: renderWorm,
  attach: attach_worm,
});
