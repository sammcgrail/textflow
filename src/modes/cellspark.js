import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var csGrid, csSparks, csW, csH, csCellW, csCellH, csGridW, csGridH;

function initCellspark() {
  csW = state.COLS; csH = state.ROWS;
  csCellW = 4; csCellH = 3;
  csGridW = Math.ceil(csW / csCellW);
  csGridH = Math.ceil(csH / csCellH);
  csGrid = new Float32Array(csGridW * csGridH); // charge 0-1
  csSparks = [];
  // Random initial charges
  for (var i = 0; i < csGrid.length; i++) {
    csGrid[i] = Math.random() * 0.3;
  }
}

function fireCell(gx, gy) {
  if (gx < 0 || gx >= csGridW || gy < 0 || gy >= csGridH) return;
  var idx = gy * csGridW + gx;
  csGrid[idx] = 1.0;
  // Send sparks to neighbors
  var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  var hues = [180, 300, 60, 0]; // cyan, magenta, yellow, white-ish
  for (var d = 0; d < dirs.length; d++) {
    var nx = gx + dirs[d][0], ny = gy + dirs[d][1];
    if (nx < 0 || nx >= csGridW || ny < 0 || ny >= csGridH) continue;
    csSparks.push({
      fromX: gx * csCellW + csCellW * 0.5,
      fromY: gy * csCellH + csCellH * 0.5,
      toX: nx * csCellW + csCellW * 0.5,
      toY: ny * csCellH + csCellH * 0.5,
      progress: 0,
      targetGx: nx,
      targetGy: ny,
      hue: hues[d]
    });
  }
}

function renderCellspark() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (csW !== W || csH !== H) initCellspark();

  if (pointer.clicked && state.currentMode === 'cellspark') {
    pointer.clicked = false;
    var gx = (pointer.gx / csCellW) | 0;
    var gy = (pointer.gy / csCellH) | 0;
    fireCell(gx, gy);
  }

  // Random firing
  if (Math.random() < 0.08) {
    var rx = (Math.random() * csGridW) | 0;
    var ry = (Math.random() * csGridH) | 0;
    fireCell(rx, ry);
  }

  // Charge cells slowly
  for (var i = 0; i < csGrid.length; i++) {
    csGrid[i] += 0.003;
    if (csGrid[i] > 1) csGrid[i] = 1;
  }

  // Update sparks
  var maxSparks = state.isMobile ? 60 : 200;
  for (var i = csSparks.length - 1; i >= 0; i--) {
    var sp = csSparks[i];
    sp.progress += 0.12;
    if (sp.progress >= 1) {
      // Arrived — charge neighbor, maybe trigger chain
      var tidx = sp.targetGy * csGridW + sp.targetGx;
      csGrid[tidx] += 0.3;
      if (csGrid[tidx] >= 0.9) {
        fireCell(sp.targetGx, sp.targetGy);
        csGrid[tidx] = 0;
      }
      csSparks.splice(i, 1);
      continue;
    }
  }
  if (csSparks.length > maxSparks) csSparks.splice(0, csSparks.length - maxSparks);

  // Draw cells
  var electricHues = [180, 300, 60, 50]; // cyan, magenta, yellow, orange
  for (var gy = 0; gy < csGridH; gy++) {
    for (var gx = 0; gx < csGridW; gx++) {
      var charge = csGrid[gy * csGridW + gx];
      if (charge < 0.05) continue;
      var baseHue = electricHues[((gx + gy) * 7) % electricHues.length];
      var hue = (baseHue + charge * 30 + t * 15) % 360;
      var sat = 90 + charge * 10;
      var lit = 35 + charge * 35;
      // Draw cell interior
      for (var dy = 0; dy < csCellH; dy++) {
        for (var dx = 0; dx < csCellW; dx++) {
          var px = gx * csCellW + dx;
          var py = gy * csCellH + dy;
          if (px >= W || py >= H) continue;
          var isEdge = dx === 0 || dy === 0;
          var ch = charge > 0.7 ? '@' : charge > 0.4 ? '#' : charge > 0.2 ? '*' : '.';
          var cellLit = isEdge ? lit * 0.6 : lit;
          drawCharHSL(ch, px, py, hue | 0, sat | 0, Math.max(30, cellLit) | 0);
        }
      }
    }
  }

  // Draw traveling sparks
  for (var i = 0; i < csSparks.length; i++) {
    var sp = csSparks[i];
    var px = (sp.fromX + (sp.toX - sp.fromX) * sp.progress) | 0;
    var py = (sp.fromY + (sp.toY - sp.fromY) * sp.progress) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('@', px, py, sp.hue, 95, 65);
      // Trail
      var tx = (sp.fromX + (sp.toX - sp.fromX) * Math.max(0, sp.progress - 0.2)) | 0;
      var ty = (sp.fromY + (sp.toY - sp.fromY) * Math.max(0, sp.progress - 0.2)) | 0;
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        drawCharHSL('*', tx, ty, sp.hue, 85, 50);
      }
    }
  }

  // Decay fired cells
  for (var i = 0; i < csGrid.length; i++) {
    if (csGrid[i] > 0.9) csGrid[i] *= 0.95;
  }
}

registerMode('cellspark', { init: initCellspark, render: renderCellspark });
