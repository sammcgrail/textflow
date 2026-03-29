import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var c2Grid, c2Pulses, c2Nodes;
function initCircuit2() {
  var W = state.COLS, H = state.ROWS;
  c2Grid = new Uint8Array(W * H);
  c2Pulses = [];
  c2Nodes = [];
  // Place component nodes on a loose grid
  var spacing = 8;
  for (var gy = spacing; gy < H - spacing; gy += spacing + (Math.random() * 4 | 0)) {
    for (var gx = spacing; gx < W - spacing; gx += spacing + (Math.random() * 6 | 0)) {
      var nx = gx + ((Math.random() - 0.5) * 4) | 0;
      var ny = gy + ((Math.random() - 0.5) * 2) | 0;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        c2Nodes.push({ x: nx, y: ny, type: (Math.random() * 4) | 0 });
        c2Grid[ny * W + nx] = 2;
      }
    }
  }
  // Connect nodes with orthogonal traces
  for (var i = 0; i < c2Nodes.length; i++) {
    var a = c2Nodes[i];
    // Find 1-3 nearest nodes to connect to
    var dists = [];
    for (var j = 0; j < c2Nodes.length; j++) {
      if (i === j) continue;
      var dx = Math.abs(a.x - c2Nodes[j].x), dy = Math.abs(a.y - c2Nodes[j].y);
      dists.push({ idx: j, d: dx + dy });
    }
    dists.sort(function(a, b) { return a.d - b.d; });
    var conns = Math.min(2, dists.length);
    for (var c = 0; c < conns; c++) {
      var b = c2Nodes[dists[c].idx];
      // L-shaped trace: horizontal then vertical
      var x = a.x, y = a.y;
      var dir = Math.random() < 0.5;
      if (dir) {
        while (x !== b.x) { x += x < b.x ? 1 : -1; if (x >= 0 && x < W && y >= 0 && y < H && c2Grid[y * W + x] === 0) c2Grid[y * W + x] = 1; }
        while (y !== b.y) { y += y < b.y ? 1 : -1; if (x >= 0 && x < W && y >= 0 && y < H && c2Grid[y * W + x] === 0) c2Grid[y * W + x] = 1; }
      } else {
        while (y !== b.y) { y += y < b.y ? 1 : -1; if (x >= 0 && x < W && y >= 0 && y < H && c2Grid[y * W + x] === 0) c2Grid[y * W + x] = 1; }
        while (x !== b.x) { x += x < b.x ? 1 : -1; if (x >= 0 && x < W && y >= 0 && y < H && c2Grid[y * W + x] === 0) c2Grid[y * W + x] = 1; }
      }
    }
  }
}
function renderCircuit2() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!c2Grid || c2Grid.length !== W * H) initCircuit2();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'circuit2') {
    pointer.clicked = false;
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    // Fire pulses from nearest node
    var best = -1, bestD = 999;
    for (var i = 0; i < c2Nodes.length; i++) {
      var dx = c2Nodes[i].x - gx, dy = c2Nodes[i].y - gy;
      var d = Math.abs(dx) + Math.abs(dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      c2Pulses.push({ x: c2Nodes[best].x, y: c2Nodes[best].y, dir: (Math.random() * 4) | 0, life: 80, hue: (Math.random() * 360) | 0 });
    }
  } else if (pointer.down && state.currentMode === 'circuit2') {
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) c2Grid[gy * W + gx] = 1;
  }
  // Auto-spawn pulses
  if (Math.random() < 0.08 && c2Nodes.length > 0) {
    var idx = (Math.random() * c2Nodes.length) | 0;
    c2Pulses.push({ x: c2Nodes[idx].x, y: c2Nodes[idx].y, dir: (Math.random() * 4) | 0, life: 60, hue: ((t * 40 + Math.random() * 60) % 360) | 0 });
  }
  // Move pulses
  var dirs = [[1,0],[0,1],[-1,0],[0,-1]];
  for (var i = c2Pulses.length - 1; i >= 0; i--) {
    var p = c2Pulses[i];
    p.life--;
    if (p.life <= 0) { c2Pulses.splice(i, 1); continue; }
    var d = dirs[p.dir];
    var nx = p.x + d[0], ny = p.y + d[1];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H && c2Grid[ny * W + nx] > 0) {
      p.x = nx; p.y = ny;
    } else {
      var found = false;
      for (var di = 0; di < 4; di++) {
        var dd = dirs[di]; nx = p.x + dd[0]; ny = p.y + dd[1];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && c2Grid[ny * W + nx] > 0 && di !== (p.dir + 2) % 4) {
          p.dir = di; p.x = nx; p.y = ny; found = true; break;
        }
      }
      if (!found) p.life = 0;
    }
  }
  if (c2Pulses.length > 60) c2Pulses.splice(0, c2Pulses.length - 60);
  // Draw grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = c2Grid[y * W + x];
      if (v === 1) {
        // Check neighbors for direction
        var h = (x > 0 && c2Grid[y * W + x - 1] > 0) || (x < W - 1 && c2Grid[y * W + x + 1] > 0);
        var vv = (y > 0 && c2Grid[(y - 1) * W + x] > 0) || (y < H - 1 && c2Grid[(y + 1) * W + x] > 0);
        var ch = h && vv ? '+' : h ? '-' : '|';
        drawCharHSL(ch, x, y, 120, 40, 7);
      } else if (v === 2) {
        drawCharHSL('O', x, y, 120, 60, 14);
      }
    }
  }
  // Component details around nodes
  for (var i = 0; i < c2Nodes.length; i++) {
    var n = c2Nodes[i];
    var ch = ['[]', 'IC', '<>', '//'][n.type];
    if (n.x + 1 < W && n.y >= 0 && n.y < H) drawCharHSL(ch[1], n.x + 1, n.y, 120, 50, 12);
    if (n.x - 1 >= 0 && n.y >= 0 && n.y < H) drawCharHSL(ch[0], n.x - 1, n.y, 120, 50, 12);
  }
  // Draw pulses on top
  for (var i = 0; i < c2Pulses.length; i++) {
    var p = c2Pulses[i];
    if (p.x >= 0 && p.x < W && p.y >= 0 && p.y < H) {
      drawCharHSL('*', p.x, p.y, p.hue, 80, 45);
      // Trail
      var d = dirs[(p.dir + 2) % 4];
      for (var tr = 1; tr <= 3; tr++) {
        var tx = p.x + d[0] * tr, ty = p.y + d[1] * tr;
        if (tx >= 0 && tx < W && ty >= 0 && ty < H && c2Grid[ty * W + tx] > 0) drawCharHSL('.', tx, ty, p.hue, 60, (20 - tr * 5) | 0);
      }
    }
  }
}
registerMode('circuit2', { init: initCircuit2, render: renderCircuit2 });
