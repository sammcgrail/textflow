import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var whW, whH, whShape, whParticles;

function initWormhole() {
  whW = state.COLS; whH = state.ROWS;
  whShape = 1.0; // 1=circle, changes on click
  whParticles = [];
  var count = state.isMobile ? 60 : 150;
  for (var i = 0; i < count; i++) {
    whParticles.push({
      angle: Math.random() * Math.PI * 2,
      z: Math.random() * 30,
      speed: 3 + Math.random() * 8,
      hue: Math.random() * 360
    });
  }
}

function renderWormhole() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (whW !== W || whH !== H) initWormhole();
  var t = state.time * 0.001;
  var cx = W * 0.5, cy = H * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'wormhole') {
    pointer.clicked = false;
    // Cycle tunnel shape
    whShape = whShape >= 3 ? 1 : whShape + 0.5;
  }

  // Drag shifts center
  var tcx = cx, tcy = cy;
  if (pointer.down && state.currentMode === 'wormhole') {
    tcx += (pointer.gx - cx) * 0.2;
    tcy += (pointer.gy - cy) * 0.2;
  }

  // Classic demoscene tunnel: for each screen pixel, compute tunnel coords
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - tcx) / (W * 0.4);
      var dy = (y - tcy) / (H * 0.4) / aspect;

      // Distance from center (tunnel radius)
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) dist = 0.01;

      // Tunnel mapping
      var tunnelZ = 1.0 / dist; // depth
      var tunnelAngle = Math.atan2(dy, dx);

      // Distort angle by shape parameter
      tunnelAngle += Math.sin(tunnelAngle * whShape) * 0.3;

      // Texture coordinates scrolling through tunnel
      var u = tunnelAngle / (Math.PI * 2);
      var v = tunnelZ + t * 2; // scrolling depth

      // Ring pattern
      var ring = Math.sin(v * 8) * 0.5 + 0.5;
      // Rotational pattern
      var rot = Math.sin(u * 12 + v * 2) * 0.5 + 0.5;

      var pattern = ring * 0.6 + rot * 0.4;

      // Color: each ring a different hue
      var hue = (v * 60 + t * 20) % 360;
      var sat = 85 + pattern * 15;

      // Brightness: brighter at center (closer walls), dimmer at edges
      var depthFade = Math.min(tunnelZ * 0.5, 1);
      var light = 15 + pattern * 35 * depthFade;

      // Bright ring edges
      if (ring > 0.8) {
        light += (ring - 0.8) * 80;
      }

      var ci = (pattern * depthFade * (RAMP_DENSE.length - 2) + 1) | 0;
      ci = Math.max(1, Math.min(ci, RAMP_DENSE.length - 1));

      drawCharHSL(RAMP_DENSE[ci], x, y, hue, Math.min(sat, 100), Math.min(light, 78));
    }
  }

  // Particles flying through the tunnel
  for (var i = 0; i < whParticles.length; i++) {
    var p = whParticles[i];
    p.z -= p.speed * 0.016;
    if (p.z < 0.3) {
      p.z = 25 + Math.random() * 10;
      p.angle = Math.random() * Math.PI * 2;
      p.hue = Math.random() * 360;
    }

    // Project particle
    var pScale = 5 / (p.z + 0.1);
    var tunnelR = 0.3 + Math.sin(p.angle * whShape) * 0.05;
    var px = tcx + Math.cos(p.angle + t * 0.5) * tunnelR * pScale * W * 0.4;
    var py = tcy + Math.sin(p.angle + t * 0.5) * tunnelR * pScale * H * 0.4 * aspect;

    var ix = px | 0, iy = py | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var nearness = 1 - Math.min(p.z / 20, 1);
      var pl = 50 + nearness * 30;
      drawCharHSL('*', ix, iy, p.hue, 80, Math.min(pl, 80));
    }
  }
}

registerMode('wormhole', {
  init: initWormhole,
  render: renderWormhole,
});
