import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var r3dDrops, r3dCount, r3dW, r3dH, r3dSplashes;
function initRain3d() {
  r3dW = state.COLS; r3dH = state.ROWS;
  r3dCount = state.isMobile ? 200 : 500;
  r3dDrops = [];
  r3dSplashes = [];
  // 3 depth layers of rain covering full screen width
  for (var i = 0; i < r3dCount; i++) {
    var layer = (Math.random() * 3) | 0; // 0=far, 1=mid, 2=near
    r3dDrops.push({
      x: Math.random() * r3dW,
      y: Math.random() * r3dH,
      speed: [6, 12, 22][layer] + Math.random() * 4,
      layer: layer,
      windX: -0.5 - layer * 0.3,
      len: [1, 2, 3][layer]
    });
  }
}
// initRain3d(); — called via registerMode
function renderRain3d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (r3dW !== W || r3dH !== H) initRain3d();
  // Draw ground puddles at bottom 15%
  var groundY = (H * 0.85) | 0;
  for (var gy = groundY; gy < H; gy++) {
    for (var gx = 0; gx < W; gx++) {
      var wave = Math.sin(gx * 0.3 + state.time * 2 + gy * 0.5) * 0.15;
      var ch = Math.random() < 0.15 ? '~' : (((gx + gy) & 1) === 0 ? '.' : ' ');
      drawChar(ch, gx, gy, 20, 25, (50 + wave * 40) | 0, 0.15 + wave);
    }
  }
  // Decay and draw splashes
  for (var i = r3dSplashes.length - 1; i >= 0; i--) {
    var sp = r3dSplashes[i];
    sp.age += 0.016;
    if (sp.age > 0.5) { r3dSplashes.splice(i, 1); continue; }
    var alpha = 1 - sp.age / 0.5;
    var rad = sp.age * 5;
    // Expanding ring
    for (var a = 0; a < 6; a++) {
      var ang = a * Math.PI / 3;
      var rx = (sp.x + Math.cos(ang) * rad) | 0;
      var ry = (sp.y + Math.sin(ang) * rad * 0.3) | 0;
      if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
        drawChar('·', rx, ry, 140, 170, 255, alpha * 0.7);
      }
    }
    // Center splash
    if (sp.age < 0.15) {
      var sx = sp.x | 0, sy = sp.y | 0;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) drawChar('*', sx, sy, 200, 220, 255, alpha);
    }
  }
  // Pointer interaction — umbrella effect, repels rain
  var umbX = -100, umbY = -100;
  if (pointer.down && state.currentMode === 'rain3d') {
    umbX = pointer.gx; umbY = pointer.gy;
    // Draw umbrella hint
    var ux = umbX | 0, uy = umbY | 0;
    for (var dx = -4; dx <= 4; dx++) {
      var px = ux + dx;
      if (px >= 0 && px < W && uy >= 0 && uy < H) {
        drawChar('_', px, uy, 200, 200, 255, 0.4);
      }
    }
  }
  if (pointer.clicked && state.currentMode === 'rain3d') {
    pointer.clicked = false;
    // Lightning flash — brief bright column
    var lx = (pointer.gx | 0);
    for (var ly = 0; ly < H; ly++) {
      if (lx >= 0 && lx < W) drawChar('|', lx, ly, 255, 255, 255, 0.8 * Math.random());
    }
    // Burst of splashes around click
    for (var bi = 0; bi < 8; bi++) {
      r3dSplashes.push({ x: pointer.gx + (Math.random() - 0.5) * 10, y: pointer.gy + (Math.random() - 0.5) * 3, age: 0 });
    }
  }
  // Update and draw rain — by layer (far first, near last for overlap)
  for (var layer = 0; layer < 3; layer++) {
    var chars = [':', '|', '|'][layer];
    var alphaBase = [0.15, 0.35, 0.7][layer];
    var r = [60, 100, 160][layer];
    var g = [70, 120, 180][layer];
    var b = [120, 180, 255][layer];
    for (var i = 0; i < r3dDrops.length; i++) {
      var d = r3dDrops[i];
      if (d.layer !== layer) continue;
      d.y += d.speed * 0.016;
      d.x += d.windX * 0.016;
      // Umbrella repel
      var udx = d.x - umbX, udy = d.y - umbY;
      if (udx * udx + udy * udy < 25) {
        d.x += udx * 0.4;
        d.y -= 0.5;
      }
      if (d.y > groundY) {
        // Splash on ground
        if (r3dSplashes.length < 60) r3dSplashes.push({ x: d.x, y: groundY, age: 0 });
        d.y = -d.len;
        d.x = Math.random() * W;
      }
      if (d.x < -2) d.x = W + 1;
      var ix = d.x | 0;
      if (ix < 0 || ix >= W) continue;
      for (var s = 0; s < d.len; s++) {
        var sy = (d.y - s) | 0;
        if (sy >= 0 && sy < H) {
          drawChar(chars, ix, sy, r, g, b, alphaBase * (1 - s * 0.25));
        }
      }
    }
  }
}

registerMode('rain3d', {
  init: initRain3d,
  render: renderRain3d,
});
