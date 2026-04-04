import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Types: 0=empty, 1=sand, 2=water, 3=stone
var scGrid, scW, scH, scStep, scMaterial;
function initSandcastle() {
  scW = state.COLS; scH = state.ROWS;
  scGrid = new Uint8Array(scW * scH);
  scStep = 0; scMaterial = 1;
  // Pre-seed some sand and stone
  for (var x = 0; x < scW; x++) {
    for (var y = scH - 4; y < scH; y++) {
      if (Math.random() < 0.5) scGrid[y * scW + x] = 1;
    }
  }
  // Stone platform
  for (var x = (scW * 0.3) | 0; x < (scW * 0.7) | 0; x++) {
    var y = (scH * 0.6) | 0;
    scGrid[y * scW + x] = 3;
  }
  // Some water
  for (var i = 0; i < 40; i++) {
    var x = (Math.random() * scW) | 0, y = (Math.random() * (scH * 0.5)) | 0;
    scGrid[y * scW + x] = 2;
  }
}
function renderSandcastle() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!scGrid || scW !== W || scH !== H) initSandcastle();
  if (pointer.clicked && state.currentMode === 'sandcastle') {
    pointer.clicked = false;
    scMaterial = (scMaterial % 3) + 1;
  } else if (pointer.down && state.currentMode === 'sandcastle') {
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H && scGrid[py * W + px] === 0) {
        scGrid[py * W + px] = scMaterial;
      }
    }
  }
  var curStep = (state.time * 30) | 0;
  while (scStep < curStep) {
    scStep++;
    // Process from bottom to top for falling
    for (var y = H - 2; y >= 0; y--) {
      for (var x = 0; x < W; x++) {
        var idx = y * W + x;
        var v = scGrid[idx];
        if (v === 0 || v === 3) continue;
        var below = (y + 1) * W + x;
        if (v === 1) { // sand
          if (scGrid[below] === 0) {
            scGrid[below] = 1; scGrid[idx] = 0;
          } else if (scGrid[below] === 2) {
            scGrid[below] = 1; scGrid[idx] = 2; // swap with water
          } else {
            var side = Math.random() < 0.5 ? -1 : 1;
            var sx = x + side;
            if (sx >= 0 && sx < W && y + 1 < H && scGrid[(y+1)*W+sx] === 0) {
              scGrid[(y+1)*W+sx] = 1; scGrid[idx] = 0;
            }
          }
        } else if (v === 2) { // water
          if (scGrid[below] === 0) {
            scGrid[below] = 2; scGrid[idx] = 0;
          } else {
            var side = Math.random() < 0.5 ? -1 : 1;
            var sx = x + side;
            if (sx >= 0 && sx < W) {
              if (y + 1 < H && scGrid[(y+1)*W+sx] === 0) {
                scGrid[(y+1)*W+sx] = 2; scGrid[idx] = 0;
              } else if (scGrid[y*W+sx] === 0) {
                scGrid[y*W+sx] = 2; scGrid[idx] = 0;
              }
            }
          }
        }
      }
    }
  }
  var chars = [' ', '.', '~', '#'];
  var hues = [0, 42, 210, 0];
  var sats = [0, 70, 70, 0];
  var lits = [0, 42, 38, 30];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = scGrid[y * W + x];
      if (v === 0) continue;
      drawCharHSL(chars[v], x, y, hues[v], sats[v], lits[v]);
    }
  }
  // Draw material indicator top-left
  var matNames = ['', 'sand', 'water', 'stone'];
  var label = matNames[scMaterial];
  for (var i = 0; i < label.length; i++) {
    drawCharHSL(label[i], i + 1, 1, hues[scMaterial], sats[scMaterial], 50);
  }
}
registerMode('sandcastle', { init: initSandcastle, render: renderSandcastle });
