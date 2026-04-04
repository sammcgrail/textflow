import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var sf3Stars, sf3W, sf3H, sf3Dir;

function initStarfield3d() {
  sf3W = state.COLS; sf3H = state.ROWS;
  sf3Dir = 1; // 1 = zooming out (away from center), -1 = zooming in
  sf3Stars = [];
  var count = state.isMobile ? 300 : 600;
  for (var i = 0; i < count; i++) {
    sf3Stars.push(makeStar3d(Math.random() * 30 + 0.5));
  }
}

function makeStar3d(z) {
  return {
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: z !== undefined ? z : 30 + Math.random() * 10,
    prevSx: 0, prevSy: 0,
    speed: 0.5 + Math.random() * 1.5,
    hue: Math.random() < 0.7 ? 220 : (Math.random() < 0.5 ? 40 : 0), // blue, gold, or white
    sat: 10 + Math.random() * 40
  };
}

function renderStarfield3d() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (sf3W !== W || sf3H !== H) initStarfield3d();
  var t = state.time * 0.001;
  var cx = W * 0.5, cy = H * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'starfield3d') {
    pointer.clicked = false;
    sf3Dir *= -1; // reverse zoom direction
  }

  // Drag shifts the vanishing point slightly
  var vcx = cx, vcy = cy;
  if (pointer.down && state.currentMode === 'starfield3d') {
    vcx += (pointer.gx - cx) * 0.3;
    vcy += (pointer.gy - cy) * 0.3;
  }

  // Subtle background grid for depth
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - vcx, dy = y - vcy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      // Radial gradient - very dim blue at edges
      var radial = dist / (Math.max(W, H) * 0.5);
      if (radial < 1) {
        var bgLight = 8 + (1 - radial) * 5;
        drawCharHSL('.', x, y, 240, 30, bgLight);
      }
    }
  }

  var maxCount = state.isMobile ? 300 : 600;

  // Update and draw stars
  for (var i = sf3Stars.length - 1; i >= 0; i--) {
    var s = sf3Stars[i];

    s.z -= sf3Dir * s.speed * 0.3;

    // Project to screen
    var fov = 60;
    var scale = fov / (s.z + 0.1);
    var sx = vcx + s.x * scale * W * 0.5;
    var sy = vcy + s.y * scale * H * 0.5 * aspect;

    var ix = sx | 0, iy = sy | 0;

    if (s.z < 0.3 || s.z > 40 || ix < -2 || ix >= W + 2 || iy < -2 || iy >= H + 2) {
      // Reset star
      sf3Stars[i] = makeStar3d(sf3Dir > 0 ? 30 + Math.random() * 10 : 0.5 + Math.random());
      continue;
    }

    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var nearness = 1 - Math.min(s.z / 30, 1); // 0=far, 1=near
      var light = 25 + nearness * 50;
      var sat = s.sat * (0.5 + nearness * 0.5);

      // Character size by depth
      var ch;
      if (nearness > 0.8) ch = '@';
      else if (nearness > 0.6) ch = '#';
      else if (nearness > 0.4) ch = '*';
      else if (nearness > 0.2) ch = '+';
      else ch = '.';

      drawCharHSL(ch, ix, iy, s.hue, sat, Math.min(light, 80));

      // Streak effect for fast/near stars
      if (nearness > 0.5) {
        var streakLen = (nearness * 3) | 0;
        var ddx = ix - vcx, ddy = iy - vcy;
        var ddd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.1;
        var ndx = ddx / ddd, ndy = ddy / ddd;
        for (var j = 1; j <= streakLen; j++) {
          var tx = (ix - ndx * j * sf3Dir) | 0;
          var ty = (iy - ndy * j * sf3Dir) | 0;
          if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
            var sl = light - j * 12;
            if (sl > 15) {
              drawCharHSL('-', tx, ty, s.hue, sat * 0.5, sl);
            }
          }
        }
      }
    }
  }

  // Maintain star count
  while (sf3Stars.length < maxCount) {
    sf3Stars.push(makeStar3d(sf3Dir > 0 ? 30 + Math.random() * 10 : 0.5 + Math.random()));
  }
}

registerMode('starfield3d', {
  init: initStarfield3d,
  render: renderStarfield3d,
});
