import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Rotating wireframe cube with ASCII edges
var cubeVerts = [
  [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
  [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]
];
var cubeEdges = [
  [0,1],[1,2],[2,3],[3,0], // back
  [4,5],[5,6],[6,7],[7,4], // front
  [0,4],[1,5],[2,6],[3,7]  // connecting
];

function project(v, W, H, t) {
  // Rotate around Y
  var cy = Math.cos(t * 0.7), sy = Math.sin(t * 0.7);
  var x1 = v[0] * cy - v[2] * sy;
  var z1 = v[0] * sy + v[2] * cy;
  var y1 = v[1];
  // Rotate around X
  var cx = Math.cos(t * 0.5), sx = Math.sin(t * 0.5);
  var y2 = y1 * cx - z1 * sx;
  var z2 = y1 * sx + z1 * cx;
  // Rotate around Z
  var cz = Math.cos(t * 0.3), sz = Math.sin(t * 0.3);
  var x3 = x1 * cz - y2 * sz;
  var y3 = x1 * sz + y2 * cz;

  var fov = 3;
  var depth = z2 + fov;
  if (depth < 0.1) depth = 0.1;
  var scale = W * 0.2;
  return {
    x: W / 2 + x3 * scale / depth,
    y: H / 2 + y3 * scale / depth * 0.6,
    z: z2
  };
}

function renderRotocube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Clear buffer for Z-like brightness
  var buf = new Float32Array(W * H);
  var hbuf = new Float32Array(W * H);

  // Draw edges using Bresenham-ish line drawing
  for (var e = 0; e < cubeEdges.length; e++) {
    var p0 = project(cubeVerts[cubeEdges[e][0]], W, H, t);
    var p1 = project(cubeVerts[cubeEdges[e][1]], W, H, t);

    var steps = Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) * 2;
    steps = Math.max(steps, 1);
    for (var s = 0; s <= steps; s++) {
      var frac = s / steps;
      var px = Math.round(p0.x + (p1.x - p0.x) * frac);
      var py = Math.round(p0.y + (p1.y - p0.y) * frac);
      var pz = p0.z + (p1.z - p0.z) * frac;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var idx = py * W + px;
        var bright = 0.5 + (1 - pz) * 0.25;
        if (bright > buf[idx]) {
          buf[idx] = bright;
          hbuf[idx] = e * 30 + t * 50;
        }
      }
    }

    // Draw vertex dots bigger
    var verts = [p0, p1];
    for (var vi = 0; vi < 2; vi++) {
      var vx = Math.round(verts[vi].x);
      var vy = Math.round(verts[vi].y);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var nx = vx + dx, ny = vy + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            var nidx = ny * W + nx;
            buf[nidx] = Math.max(buf[nidx], 1.0);
            hbuf[nidx] = e * 30 + t * 50;
          }
        }
      }
    }
  }

  // Render buffer
  var chars = ' .:-=+*#%@';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = buf[y * W + x];
      if (v < 0.05) continue;
      v = Math.min(1, v);
      var ci = Math.min(chars.length - 1, (v * chars.length) | 0);
      var hue = (hbuf[y * W + x]) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(chars[ci], x, y, hue, 60, 15 + v * 55);
    }
  }
}

registerMode('rotocube', { init: undefined, render: renderRotocube });
