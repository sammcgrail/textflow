import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var hwCars, hwW, hwH;
function initHighway() {
  hwW = state.COLS; hwH = state.ROWS;
  hwCars = [];
  for (var lane = 0; lane < 6; lane++) {
    var y = ((hwH / 2) - 3 + lane) | 0;
    var dir = lane < 3 ? 1 : -1;
    var speed = 0.3 + Math.random() * 0.5;
    for (var i = 0; i < 5 + (Math.random() * 5 | 0); i++) {
      hwCars.push({ x: Math.random() * hwW, y: y, speed: speed * dir, len: 2 + (Math.random() * 3 | 0), hue: (Math.random() * 360) | 0 });
    }
  }
}
function renderHighway() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!hwCars || hwW !== W || hwH !== H) initHighway();
  var roadTop = (H / 2 - 4) | 0, roadBot = (H / 2 + 4) | 0;
  // Road surface
  for (var y = roadTop; y < roadBot; y++) {
    for (var x = 0; x < W; x++) {
      drawCharHSL('.', x, y, 0, 0, 6);
    }
  }
  // Center line
  var midY = (H / 2) | 0;
  for (var x = 0; x < W; x++) {
    if (((x + (state.time * 10 | 0)) % 6) < 3) drawCharHSL('-', x, midY, 60, 80, 35);
  }
  // Edge lines
  for (var x = 0; x < W; x++) {
    drawCharHSL('=', x, roadTop, 0, 0, 30);
    drawCharHSL('=', x, roadBot - 1, 0, 0, 30);
  }
  // Move and draw cars
  for (var i = 0; i < hwCars.length; i++) {
    var c = hwCars[i];
    c.x += c.speed;
    if (c.x > W + 5) c.x = -c.len - 2;
    if (c.x < -c.len - 5) c.x = W + 2;
    for (var j = 0; j < c.len; j++) {
      var px = (c.x + j * (c.speed > 0 ? 1 : -1)) | 0;
      if (px >= 0 && px < W) {
        var ch = j === 0 || j === c.len - 1 ? '[' : '#';
        drawCharHSL(ch, px, c.y, c.hue, 60, 40);
      }
    }
    // Tail lights
    var tailX = (c.x - (c.speed > 0 ? 1 : -c.len)) | 0;
    if (tailX >= 0 && tailX < W) drawCharHSL('*', tailX, c.y, 0, 90, 45);
  }
  // Scenery (trees alongside road)
  for (var x = 0; x < W; x += 5) {
    var hash = Math.sin(x * 127.1) * 43758.5453;
    var treeH = 2 + ((hash - (hash | 0)) * 3) | 0;
    if (roadTop - treeH - 1 > 0) {
      for (var ty = 0; ty < treeH; ty++) drawCharHSL(ty === 0 ? '^' : '|', x, roadTop - treeH + ty - 1, 120, 50, 20);
    }
    if (roadBot + treeH < H) {
      for (var ty = 0; ty < treeH; ty++) drawCharHSL(ty === 0 ? '^' : '|', x, roadBot + ty + 1, 120, 50, 20);
    }
  }
}
registerMode('highway', { init: initHighway, render: renderHighway });
