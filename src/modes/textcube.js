import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Textcube — opaque 3D ASCII cube floating in a field of flowing text
// Drag to rotate. Cube occludes text behind it. Face shading via density ramp.

// Cube geometry
var CUBE_VERTS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1,  1], [1, -1,  1], [1, 1,  1], [-1, 1,  1]
];

var CUBE_EDGES = [
  [0,1],[1,2],[2,3],[3,0],
  [4,5],[5,6],[6,7],[7,4],
  [0,4],[1,5],[2,6],[3,7]
];

var CUBE_FACES = [
  [0,1,2,3], // back  (z=-1)
  [4,5,6,7], // front (z=+1)
  [0,1,5,4], // bottom (y=-1)
  [2,3,7,6], // top    (y=+1)
  [0,3,7,4], // left   (x=-1)
  [1,2,6,5]  // right  (x=+1)
];

// Face normals (before rotation)
var FACE_NORMALS = [
  [0, 0, -1], // back
  [0, 0,  1], // front
  [0, -1, 0], // bottom
  [0,  1, 0], // top
  [-1, 0, 0], // left
  [ 1, 0, 0]  // right
];

var FACE_HUES = [200, 180, 30, 60, 120, 300];

// Density ramp for face shading (dark to bright)
var SHADE_RAMP = ' .:-=+*#%@';

// Flowing text
var loremText = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'Sphinx of black quartz judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'Crazy Frederick bought many very exquisite opal jewels. ' +
  'We promptly judged antique ivory buckles for the next prize. ' +
  'The five boxing wizards jump quickly. ' +
  'Amazingly few discotheques provide jukeboxes. ' +
  'Jackdaws love my big sphinx of quartz. ';

// Rotation state
var rotX = 0.4;
var rotY = 0.6;
var rotVX = 0;
var rotVY = 0;
var dragging = false;
var lastDragX = 0;
var lastDragY = 0;
var autoRotate = true;

// Zbuffer for cube occlusion
var zbuf = null;
var cubeFaceBuf = null; // which face covers each cell (-1 = none)
var cubeBrightBuf = null;
var cubeHueBuf = null;

function initTextcube() {
  rotX = 0.4;
  rotY = 0.6;
  rotVX = 0;
  rotVY = 0;
  dragging = false;
  autoRotate = true;
  zbuf = null;
  cubeFaceBuf = null;
}

// Mouse/touch handlers
function onPointerDown(e) {
  dragging = true;
  autoRotate = false;
  var coords = getPointerCoords(e);
  lastDragX = coords.x;
  lastDragY = coords.y;
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging) return;
  var coords = getPointerCoords(e);
  var dx = coords.x - lastDragX;
  var dy = coords.y - lastDragY;
  rotY += dx * 0.008;
  rotX += dy * 0.008;
  rotVY = dx * 0.003;
  rotVX = dy * 0.003;
  lastDragX = coords.x;
  lastDragY = coords.y;
  e.preventDefault();
}

function onPointerUp() {
  dragging = false;
}

function getPointerCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function attachTextcube() {
  var c = state.canvas;
  c.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  c.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
}

// 3D rotation
function rotateY(v, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rotateX(v, a) {
  var c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function rotateNormal(n, rx, ry) {
  // Apply same rotations to face normals
  var v = n.slice();
  // Rotate Y
  var cy = Math.cos(ry), sy = Math.sin(ry);
  var x1 = v[0] * cy + v[2] * sy;
  var z1 = -v[0] * sy + v[2] * cy;
  v[0] = x1; v[2] = z1;
  // Rotate X
  var cx = Math.cos(rx), sx = Math.sin(rx);
  var y1 = v[1] * cx - v[2] * sx;
  var z2 = v[1] * sx + v[2] * cx;
  v[1] = y1; v[2] = z2;
  return v;
}

function project(v, W, H) {
  var fov = 4;
  var dist = 6;
  var z = v[2] + dist;
  if (z < 0.1) return null;
  var scale = fov / z;
  var ar = state.CHAR_W / state.CHAR_H;
  return {
    x: W / 2 + v[0] * scale * W * 0.1,
    y: H / 2 + v[1] * scale * H * 0.15 * ar,
    depth: z
  };
}

function renderTextcube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var totalCells = W * H;

  // Update rotation
  if (!dragging) {
    if (autoRotate) {
      rotY += 0.008;
      rotX += 0.003;
    } else {
      // Momentum
      rotY += rotVY;
      rotX += rotVX;
      rotVY *= 0.97;
      rotVX *= 0.97;
      // Resume auto-rotate when momentum dies
      if (Math.abs(rotVY) < 0.0001 && Math.abs(rotVX) < 0.0001) {
        autoRotate = true;
      }
    }
  }

  // Allocate buffers
  if (!cubeFaceBuf || cubeFaceBuf.length !== totalCells) {
    cubeFaceBuf = new Int8Array(totalCells);
    cubeBrightBuf = new Float32Array(totalCells);
    cubeHueBuf = new Float32Array(totalCells);
  }
  cubeFaceBuf.fill(-1);

  // Transform vertices
  var projected = [];
  var cubeScale = 2.0;
  for (var vi = 0; vi < CUBE_VERTS.length; vi++) {
    var v = [
      CUBE_VERTS[vi][0] * cubeScale,
      CUBE_VERTS[vi][1] * cubeScale,
      CUBE_VERTS[vi][2] * cubeScale
    ];
    v = rotateY(v, rotY);
    v = rotateX(v, rotX);
    projected.push(project(v, W, H));
  }

  // Light direction (from upper-right-front)
  var lightDir = [0.4, -0.5, 0.7];
  var lightLen = Math.sqrt(lightDir[0]*lightDir[0] + lightDir[1]*lightDir[1] + lightDir[2]*lightDir[2]);
  lightDir[0] /= lightLen; lightDir[1] /= lightLen; lightDir[2] /= lightLen;

  // Sort faces by depth (painter's algorithm — far first)
  var faceOrder = [];
  for (var fi = 0; fi < CUBE_FACES.length; fi++) {
    var face = CUBE_FACES[fi];
    var avgD = 0;
    var valid = true;
    for (var fvi = 0; fvi < face.length; fvi++) {
      if (!projected[face[fvi]]) { valid = false; break; }
      avgD += projected[face[fvi]].depth;
    }
    if (!valid) continue;
    avgD /= face.length;

    // Check if front-facing
    var pts = [];
    for (var pi = 0; pi < face.length; pi++) pts.push(projected[face[pi]]);
    var nx = (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
             (pts[1].y - pts[0].y) * (pts[2].x - pts[0].x);
    if (nx < 0) continue; // back-facing, skip

    // Compute lighting
    var rn = rotateNormal(FACE_NORMALS[fi], rotX, rotY);
    var dot = rn[0] * lightDir[0] + rn[1] * lightDir[1] + rn[2] * lightDir[2];
    var brightness = Math.max(0.15, Math.min(1, (dot + 1) * 0.5));

    faceOrder.push({ idx: fi, depth: avgD, brightness: brightness });
  }
  faceOrder.sort(function(a, b) { return b.depth - a.depth; });

  // Rasterize faces into the buffer (far to near, near overwrites far)
  for (var foi = 0; foi < faceOrder.length; foi++) {
    var fo = faceOrder[foi];
    var face = CUBE_FACES[fo.idx];
    var pts = [];
    for (var pi = 0; pi < face.length; pi++) pts.push(projected[face[pi]]);

    // Scanline fill
    var minY = H, maxY = 0;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(H - 1, Math.ceil(maxY));

    var n = pts.length;
    for (var y = minY; y <= maxY; y++) {
      var nodes = [];
      for (var i = 0, j = n - 1; i < n; j = i++) {
        if ((pts[i].y <= y && pts[j].y > y) || (pts[j].y <= y && pts[i].y > y)) {
          var ix = pts[i].x + (y - pts[i].y) / (pts[j].y - pts[i].y) * (pts[j].x - pts[i].x);
          nodes.push(ix);
        }
      }
      nodes.sort(function(a, b) { return a - b; });
      for (var k = 0; k < nodes.length - 1; k += 2) {
        var sx = Math.max(0, Math.ceil(nodes[k]));
        var ex = Math.min(W - 1, Math.floor(nodes[k + 1]));
        for (var x = sx; x <= ex; x++) {
          var idx = y * W + x;
          cubeFaceBuf[idx] = fo.idx;
          cubeBrightBuf[idx] = fo.brightness;
          cubeHueBuf[idx] = FACE_HUES[fo.idx];
        }
      }
    }
  }

  // Step 1: Render flowing text background, skipping cube cells
  var speed = 1.2;
  var textOffset = Math.floor(t * speed * 5);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;

      if (cubeFaceBuf[idx] >= 0) {
        // Cube cell — render face shading
        var bright = cubeBrightBuf[idx];
        var hue = cubeHueBuf[idx];
        var rampIdx = Math.min(SHADE_RAMP.length - 1, Math.floor(bright * (SHADE_RAMP.length - 1)));
        var ch = SHADE_RAMP[rampIdx];
        if (ch !== ' ') {
          var lum = 15 + bright * 45;
          drawCharHSL(ch, x, y, hue, 50, lum);
        }
      } else {
        // Flowing text background
        var ci = (textOffset + y * W + x) % loremText.length;
        if (ci < 0) ci += loremText.length;
        var ch2 = loremText[ci];
        if (ch2 === ' ') continue;

        // Subtle colored text — scrolling rainbow
        var hue2 = (t * 15 + y * 2 + x * 0.5) % 360;
        var sat2 = 40 + Math.sin(t * 0.5 + y * 0.1) * 15;
        var lum2 = 12 + Math.sin(t * 0.8 + x * 0.15 + y * 0.1) * 5;
        drawCharHSL(ch2, x, y, hue2, sat2, lum2);
      }
    }
  }

  // Step 2: Draw edges on top with bright line chars
  for (var ei = 0; ei < CUBE_EDGES.length; ei++) {
    var e = CUBE_EDGES[ei];
    var p0 = projected[e[0]];
    var p1 = projected[e[1]];
    if (!p0 || !p1) continue;

    // Only draw edge if at least one adjacent face is front-facing
    var edgeVisible = false;
    for (var foi2 = 0; foi2 < faceOrder.length; foi2++) {
      var face = CUBE_FACES[faceOrder[foi2].idx];
      if ((face.indexOf(e[0]) >= 0) && (face.indexOf(e[1]) >= 0)) {
        edgeVisible = true;
        break;
      }
    }
    if (!edgeVisible) continue;

    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(len * 1.5));
    var angle = Math.atan2(dy, dx);
    var ech;
    if (Math.abs(angle) < 0.4 || Math.abs(angle) > 2.74) ech = '=';
    else if (Math.abs(angle - 1.57) < 0.4 || Math.abs(angle + 1.57) < 0.4) ech = '|';
    else if ((angle > 0 && angle < 1.57) || (angle < -1.57)) ech = '/';
    else ech = '\\';

    for (var s = 0; s <= steps; s++) {
      var frac = s / steps;
      var px = Math.round(p0.x + dx * frac);
      var py = Math.round(p0.y + dy * frac);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      var edgeHue = (t * 30 + s * 2) % 360;
      drawCharHSL(ech, px, py, edgeHue, 70, 60);
    }
  }

  // Step 3: Draw vertices as bright nodes
  for (var vi2 = 0; vi2 < projected.length; vi2++) {
    var p = projected[vi2];
    if (!p) continue;
    var vx = Math.round(p.x);
    var vy = Math.round(p.y);
    if (vx < 0 || vx >= W || vy < 0 || vy >= H) continue;
    // Only draw if vertex is on a visible face
    var vertVisible = false;
    for (var foi3 = 0; foi3 < faceOrder.length; foi3++) {
      if (CUBE_FACES[faceOrder[foi3].idx].indexOf(vi2) >= 0) {
        vertVisible = true;
        break;
      }
    }
    if (!vertVisible) continue;
    drawCharHSL('#', vx, vy, 50, 80, 70);
    if (vx > 0) drawCharHSL('+', vx - 1, vy, 50, 60, 55);
    if (vx < W - 1) drawCharHSL('+', vx + 1, vy, 50, 60, 55);
  }

  // Label
  var label = '[textcube] drag to rotate';
  var lx = Math.floor((W - label.length) / 2);
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 200, 40, 22);
  }
}

registerMode('textcube', { init: initTextcube, render: renderTextcube, attach: attachTextcube });
