import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

var cosW, cosH, cosStars, cosNovas;

function initCosmos() {
  cosW = state.COLS; cosH = state.ROWS;
  cosNovas = [];
  cosStars = [];
  var cx = cosW * 0.5, cy = cosH * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  // Generate spiral galaxy structure
  var arms = 3;
  var count = state.isMobile ? 800 : 2000;
  for (var i = 0; i < count; i++) {
    // Spiral arm placement
    var armIndex = i % arms;
    var armOffset = (armIndex / arms) * Math.PI * 2;

    var r = Math.random() * Math.max(cosW, cosH) * 0.45;
    var spiralAngle = armOffset + r * 0.08 + (Math.random() - 0.5) * 0.6;

    // Add some scatter from the arm
    var scatter = Math.random() * 3 * (1 + r * 0.02);

    var x = cx + Math.cos(spiralAngle) * r + (Math.random() - 0.5) * scatter;
    var y = cy + Math.sin(spiralAngle) * r * aspect + (Math.random() - 0.5) * scatter * aspect;

    var depth = Math.random(); // 0=background, 1=foreground

    cosStars.push({
      baseAngle: spiralAngle,
      radius: r,
      scatter: scatter,
      x: x, y: y,
      depth: depth,
      hue: r < 8 ? 40 + Math.random() * 20 : // warm core
           (armIndex === 0 ? 200 + Math.random() * 40 : // blue arm
            armIndex === 1 ? 270 + Math.random() * 30 : // purple arm
            150 + Math.random() * 40), // cyan arm
      twinkle: Math.random() * Math.PI * 2
    });
  }

  // Extra dense core
  for (var i = 0; i < (state.isMobile ? 100 : 300); i++) {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.random() * 6;
    cosStars.push({
      baseAngle: angle,
      radius: r,
      scatter: 0,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r * aspect,
      depth: 0.7 + Math.random() * 0.3,
      hue: 35 + Math.random() * 25,
      twinkle: Math.random() * Math.PI * 2
    });
  }
}

function renderCosmos() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (cosW !== W || cosH !== H) initCosmos();
  var t = state.time * 0.001;
  var cx = W * 0.5, cy = H * 0.5;
  var aspect = state.CHAR_W / state.CHAR_H;

  if (pointer.clicked && state.currentMode === 'cosmos') {
    pointer.clicked = false;
    cosNovas.push({ x: pointer.gx, y: pointer.gy, t: 0 });
  }

  // Drag spawns small novas
  if (pointer.down && state.currentMode === 'cosmos') {
    if (Math.random() < 0.05) {
      cosNovas.push({ x: pointer.gx + (Math.random() - 0.5) * 3, y: pointer.gy + (Math.random() - 0.5) * 3, t: 0 });
    }
  }

  // Slow galaxy rotation
  var rotation = t * 0.03;

  // Background gas clouds - fill screen
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) / (W * 0.4);
      var dy = (y - cy) / (H * 0.4) / aspect;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var angle = Math.atan2(dy, dx) + rotation;

      // Spiral gas pattern
      var spiral = Math.sin(angle * 3 - dist * 4 + t * 0.3) * 0.5 + 0.5;
      var gas = spiral * Math.exp(-dist * 0.8) * 0.4;

      if (gas > 0.03) {
        var hue = (angle / (Math.PI * 2) * 120 + 200 + t * 5) % 360;
        var light = 8 + gas * 25;
        var ci = (gas * 4 + 1) | 0;
        ci = Math.max(1, Math.min(ci, 4));
        drawCharHSL(RAMP_DENSE[ci], x, y, hue, 60, light);
      }
    }
  }

  // Draw stars with rotation
  for (var i = 0; i < cosStars.length; i++) {
    var s = cosStars[i];

    // Rotate star position around center
    var rotAngle = s.baseAngle + rotation;
    var rx = cx + Math.cos(rotAngle) * s.radius + (Math.random() < 0.01 ? (Math.random() - 0.5) * 0.5 : 0);
    var ry = cy + Math.sin(rotAngle) * s.radius * aspect;

    // Add original scatter back
    rx += Math.cos(rotAngle + 1.57) * s.scatter * 0.3;
    ry += Math.sin(rotAngle + 1.57) * s.scatter * 0.3 * aspect;

    var ix = rx | 0, iy = ry | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;

    s.twinkle += 0.015 + s.depth * 0.01;
    var tw = Math.sin(s.twinkle) * 0.2 + 0.8;

    var depth = s.depth;
    var light = (20 + depth * 35 + tw * 10) * (s.radius < 8 ? 1.3 : 1);
    var sat = 60 + depth * 30;

    // Foreground vs background chars
    var ch;
    if (depth > 0.8) ch = '#';
    else if (depth > 0.6) ch = '*';
    else if (depth > 0.3) ch = '+';
    else ch = '.';

    drawCharHSL(ch, ix, iy, s.hue % 360, Math.min(sat, 95), Math.min(light, 75));
  }

  // Supernova bursts
  for (var i = cosNovas.length - 1; i >= 0; i--) {
    var n = cosNovas[i];
    n.t += 0.016;
    var nr = n.t * 20;
    var nlife = 1 - n.t / 2;

    if (nlife <= 0) {
      cosNovas.splice(i, 1);
      continue;
    }

    // Draw nova ring
    var steps = (nr * 6) | 0;
    steps = Math.max(steps, 12);
    for (var j = 0; j < steps; j++) {
      var a = (j / steps) * Math.PI * 2;
      var nx = n.x + Math.cos(a) * nr;
      var ny = n.y + Math.sin(a) * nr * aspect;
      var nix = nx | 0, niy = ny | 0;
      if (nix >= 0 && nix < W && niy >= 0 && niy < H) {
        var nl = 50 + nlife * 30;
        drawCharHSL('O', nix, niy, 40, 30 + nlife * 40, Math.min(nl, 80));
      }
    }

    // Central flash
    if (n.t < 0.5) {
      var fr = 2;
      for (var dy = -fr; dy <= fr; dy++) {
        for (var dx = -fr; dx <= fr; dx++) {
          var fx = (n.x | 0) + dx, fy = (n.y | 0) + dy;
          if (fx >= 0 && fx < W && fy >= 0 && fy < H) {
            var fd = Math.abs(dx) + Math.abs(dy);
            if (fd <= fr) {
              var fl = 70 + (1 - n.t / 0.5) * 15;
              drawCharHSL('@', fx, fy, 40, 15, Math.min(fl, 85));
            }
          }
        }
      }
    }
  }

  // Bright galaxy core
  var coreR = 2;
  for (var dy = -coreR; dy <= coreR; dy++) {
    for (var dx = -coreR; dx <= coreR; dx++) {
      var sx = (cx | 0) + dx, sy = (cy | 0) + dy;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        var dd = Math.abs(dx) + Math.abs(dy);
        if (dd <= coreR) {
          var cl = 72 - dd * 8;
          drawCharHSL('@', sx, sy, 40, 20, Math.min(cl, 80));
        }
      }
    }
  }

  if (cosNovas.length > 10) cosNovas.splice(0, cosNovas.length - 10);
}

registerMode('cosmos', {
  init: initCosmos,
  render: renderCosmos,
});
