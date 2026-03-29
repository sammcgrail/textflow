import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var c2Grid, c2Pulses;
function initCircuit2() {
  var W = state.COLS, H = state.ROWS;
  c2Grid = new Uint8Array(W * H);
  c2Pulses = [];
  // Generate PCB-like traces
  for (var i = 0; i < 30; i++) {
    var x = (Math.random() * W) | 0, y = (Math.random() * H) | 0;
    var dir = (Math.random() * 4) | 0; // 0=right,1=down,2=left,3=up
    var len = 5 + (Math.random() * 20) | 0;
    for (var j = 0; j < len; j++) {
      if (x >= 0 && x < W && y >= 0 && y < H) c2Grid[y * W + x] = 1;
      if (dir === 0) x++; else if (dir === 1) y++; else if (dir === 2) x--; else y--;
      if (Math.random() < 0.15) dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
    }
    // Component at end
    if (x >= 0 && x < W && y >= 0 && y < H) c2Grid[y * W + x] = 2;
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
    if (gx >= 0 && gx < W && gy >= 0 && gy < H && c2Grid[gy * W + gx] > 0) {
      c2Pulses.push({ x: gx, y: gy, dir: (Math.random() * 4) | 0, life: 60, hue: (Math.random() * 360) | 0 });
    }
  } else if (pointer.down && state.currentMode === 'circuit2') {
    // Draw new traces
    var gx = pointer.gx | 0, gy = pointer.gy | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) c2Grid[gy * W + gx] = 1;
  }
  // Auto-spawn pulses
  if (Math.random() < 0.05) {
    for (var attempt = 0; attempt < 10; attempt++) {
      var rx = (Math.random() * W) | 0, ry = (Math.random() * H) | 0;
      if (rx < W && ry < H && c2Grid[ry * W + rx] > 0) {
        c2Pulses.push({ x: rx, y: ry, dir: (Math.random() * 4) | 0, life: 40, hue: (t * 30 + Math.random() * 60) % 360 });
        break;
      }
    }
  }
  // Move pulses along traces
  for (var i = c2Pulses.length - 1; i >= 0; i--) {
    var p = c2Pulses[i];
    p.life--;
    if (p.life <= 0) { c2Pulses.splice(i, 1); continue; }
    var dirs = [[1,0],[0,1],[-1,0],[0,-1]];
    var d = dirs[p.dir];
    var nx = p.x + d[0], ny = p.y + d[1];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H && c2Grid[ny * W + nx] > 0) {
      p.x = nx; p.y = ny;
    } else {
      // Try other directions
      var found = false;
      for (var di = 0; di < 4; di++) {
        var dd = dirs[di];
        nx = p.x + dd[0]; ny = p.y + dd[1];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && c2Grid[ny * W + nx] > 0 && di !== (p.dir + 2) % 4) {
          p.dir = di; p.x = nx; p.y = ny; found = true; break;
        }
      }
      if (!found) p.life = 0;
    }
  }
  if (c2Pulses.length > 50) c2Pulses.splice(0, c2Pulses.length - 50);
  // Draw grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = c2Grid[y * W + x];
      if (v === 1) drawCharHSL('-', x, y, 120, 40, 6);
      else if (v === 2) drawCharHSL('O', x, y, 120, 50, 10);
    }
  }
  // Draw pulses (on top)
  for (var i = 0; i < c2Pulses.length; i++) {
    var p = c2Pulses[i];
    if (p.x >= 0 && p.x < W && p.y >= 0 && p.y < H) {
      drawCharHSL('*', p.x, p.y, p.hue, 80, 45);
    }
  }
}
registerMode('circuit2', { init: initCircuit2, render: renderCircuit2 });
