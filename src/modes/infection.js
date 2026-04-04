import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// States: 0=empty, 1=healthy, 2=infected, 3=sick, 4=dead, 5=immune
var infGrid, infW, infH, infStep, infRespawnTimer;
function initInfection() {
  infW = state.COLS; infH = state.ROWS;
  infGrid = new Uint8Array(infW * infH);
  infStep = 0; infRespawnTimer = 0;
  // Fill with healthy cells
  for (var i = 0; i < infW * infH; i++) {
    infGrid[i] = Math.random() < 0.6 ? 1 : 0;
  }
  // Seed a few infections
  for (var c = 0; c < 3; c++) {
    var cx = (Math.random() * infW) | 0, cy = (Math.random() * infH) | 0;
    if (cx >= 0 && cx < infW && cy >= 0 && cy < infH) infGrid[cy * infW + cx] = 2;
  }
}
function renderInfection() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!infGrid || infW !== W || infH !== H) initInfection();
  if (pointer.clicked && state.currentMode === 'infection') {
    pointer.clicked = false;
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H && infGrid[py * W + px] === 1) {
        infGrid[py * W + px] = 2;
      }
    }
  } else if (pointer.down && state.currentMode === 'infection') {
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) infGrid[py * W + px] = 5;
    }
  }
  var curStep = (state.time * 12) | 0;
  while (infStep < curStep) {
    infStep++;
    var alive = 0;
    for (var i = 0; i < W * H; i++) {
      var s = infGrid[i];
      if (s === 1 || s === 2 || s === 5) alive++;
    }
    if (alive < 5) { infRespawnTimer++; if (infRespawnTimer > 30) initInfection(); }
    else infRespawnTimer = 0;
    for (var i = 0; i < 60; i++) {
      var rx = (Math.random() * W) | 0, ry = (Math.random() * H) | 0;
      var idx = ry * W + rx;
      var s = infGrid[idx];
      if (s === 2) {
        // Infected spreads
        var dx = ((Math.random() * 3) | 0) - 1, dy2 = ((Math.random() * 3) | 0) - 1;
        var nx = rx + dx, ny = ry + dy2;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          var ni = ny * W + nx;
          if (infGrid[ni] === 1 && Math.random() < 0.4) infGrid[ni] = 2;
        }
        if (Math.random() < 0.08) infGrid[idx] = 3; // become sick
      } else if (s === 3) {
        if (Math.random() < 0.05) infGrid[idx] = 4; // die
        else if (Math.random() < 0.03) infGrid[idx] = 5; // recover immune
      }
    }
  }
  var chars = [' ', 'o', '*', '#', '.', '+'];
  var hues = [0, 120, 50, 0, 0, 210];
  var sats = [0, 70, 80, 60, 10, 70];
  var lits = [0, 35, 45, 30, 18, 40];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = infGrid[y * W + x];
      if (v === 0) continue;
      drawCharHSL(chars[v], x, y, hues[v], sats[v], lits[v]);
    }
  }
}
registerMode('infection', { init: initInfection, render: renderInfection });
