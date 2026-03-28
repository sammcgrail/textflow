import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var galaxyStars, galaxyTrail, galaxyW, galaxyH;
function initGalaxy() {
  galaxyW = state.COLS; galaxyH = state.ROWS;
  galaxyTrail = new Float32Array(galaxyW * galaxyH);
  var numStars = state.isMobile ? 1200 : 2000;
  galaxyStars = [];
  for (var i = 0; i < numStars; i++) {
    var arm = (Math.random() * 4) | 0;
    var dist = Math.random() * Math.random() * 0.45 + 0.02;
    var angle = arm * Math.PI * 0.5 + dist * 6 + (Math.random() - 0.5) * 0.5;
    galaxyStars.push({
      dist: dist,
      angle: angle,
      speed: 0.3 / (dist + 0.1),
      bright: 0.3 + Math.random() * 0.7,
      hue: (Math.random() - 0.5) * 40
    });
  }
}
// initGalaxy(); — called via registerMode
function renderGalaxy() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (galaxyW !== W || galaxyH !== H) initGalaxy();
  var cx = W * 0.5, cy = H * 0.5;
  // Decay trail
  for (var i = 0; i < galaxyTrail.length; i++) galaxyTrail[i] *= 0.93;
  // Pointer gravitational perturber
  var px = pointer.down && state.currentMode === 'galaxy' ? pointer.gx : -999;
  var py = pointer.down && state.currentMode === 'galaxy' ? pointer.gy : -999;
  for (var i = 0; i < galaxyStars.length; i++) {
    var s = galaxyStars[i];
    s.angle += s.speed * 0.016;
    var r = s.dist * Math.min(W, H) * 0.9;
    var sx = (cx + Math.cos(s.angle) * r) | 0;
    var sy = (cy + Math.sin(s.angle) * r * 0.5) | 0;
    // Pointer perturbation
    if (px > -900) {
      var ddx = sx - px, ddy = sy - py;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd < 15 && dd > 0.5) {
        s.angle += 0.02 / (dd * 0.3 + 0.1);
      }
    }
    if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
      galaxyTrail[sy * W + sx] = Math.min(1, galaxyTrail[sy * W + sx] + s.bright * 0.2);
    }
  }
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = galaxyTrail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      var dx = x - cx, dy = y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var hue = (240 + dist * 3 + state.time * 10) % 360;
      drawCharHSL(ch, x, y, hue | 0, 50 + (v * 30) | 0, (10 + v * 50) | 0);
    }
  }
  // Center glow
  drawChar('*', cx | 0, cy | 0, 255, 255, 200, 1);
}

registerMode('galaxy', {
  init: initGalaxy,
  render: renderGalaxy,
});
