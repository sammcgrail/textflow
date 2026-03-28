import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var treeTrunks, treeW, treeH, treeBuf;
function initTree() {
  treeW = state.COLS; treeH = state.ROWS;
  treeTrunks = [];
  treeBuf = new Float32Array(treeW * treeH * 3); // r,g,b packed
  // Plant initial trees
  var count = Math.max(1, Math.min(3, (treeW / 30) | 0));
  for (var i = 0; i < count; i++) {
    treeTrunks.push({ x: treeW * (i + 0.5) / count, y: treeH - 1 });
  }
}
// initTree(); — called via registerMode
function treeDrawBranch(x, y, angle, len, depth, hue) {
  if (depth <= 0 || len < 1) return;
  var wind = Math.sin(state.time * 1.5 + x * 0.1) * 0.1 * depth;
  if (pointer.down && state.currentMode === 'tree') {
    wind += (pointer.gx - treeW * 0.5) / treeW * 0.3 * depth;
  }
  var ex = x + Math.cos(angle + wind) * len;
  var ey = y + Math.sin(angle + wind) * len;
  // Draw line (Bresenham-lite)
  var steps = (len * 1.5) | 0;
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    var px = (x + (ex - x) * t) | 0;
    var py = (y + (ey - y) * t) | 0;
    if (px >= 0 && px < treeW && py >= 0 && py < treeH) {
      var idx = (py * treeW + px) * 3;
      if (depth > 3) {
        treeBuf[idx] = 0.4; treeBuf[idx + 1] = 0.25; treeBuf[idx + 2] = 0.1;
      } else {
        treeBuf[idx] = 0.2; treeBuf[idx + 1] = 0.6 + Math.sin(hue) * 0.2; treeBuf[idx + 2] = 0.15;
      }
    }
  }
  // Leaves at tips
  if (depth <= 2) {
    var lx = ex | 0, ly = ey | 0;
    if (lx >= 0 && lx < treeW && ly >= 0 && ly < treeH) {
      var idx = (ly * treeW + lx) * 3;
      treeBuf[idx] = 0.1; treeBuf[idx + 1] = 0.8; treeBuf[idx + 2] = 0.2;
    }
  }
  var spread = 0.4 + Math.sin(state.time * 0.3) * 0.05;
  treeDrawBranch(ex, ey, angle - spread, len * 0.72, depth - 1, hue + 0.3);
  treeDrawBranch(ex, ey, angle + spread, len * 0.72, depth - 1, hue - 0.3);
  if (depth > 4 && Math.random() < 0.3) {
    treeDrawBranch(ex, ey, angle + (Math.random() - 0.5) * 0.8, len * 0.5, depth - 2, hue);
  }
}

function renderTree() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (treeW !== W || treeH !== H) initTree();
  // Add tree on click
  if (pointer.clicked && state.currentMode === 'tree') {
    pointer.clicked = false;
    treeTrunks.push({ x: pointer.gx, y: H - 1 });
  }
  // Clear buffer
  for (var i = 0; i < treeBuf.length; i++) treeBuf[i] = 0;
  // Draw all trees
  for (var t = 0; t < treeTrunks.length; t++) {
    var tr = treeTrunks[t];
    treeDrawBranch(tr.x, tr.y, -Math.PI * 0.5, Math.min(H * 0.2, 12), 7, t * 2);
  }
  // Render buffer
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 3;
      var r = treeBuf[idx], g = treeBuf[idx + 1], b = treeBuf[idx + 2];
      if (r < 0.02 && g < 0.02 && b < 0.02) continue;
      var v = Math.max(r, g, b);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      drawChar(RAMP_DENSE[ri], x, y, (r * 255) | 0, (g * 255) | 0, (b * 255) | 0, v);
    }
  }
}

registerMode('tree', {
  init: initTree,
  render: renderTree,
});
