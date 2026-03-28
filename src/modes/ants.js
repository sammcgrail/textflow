import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var antsArr, antFood, antNest, antWalls, antPheroFood, antPheroHome, antW, antH;
function initAnts() {
  antW = state.COLS; antH = state.ROWS;
  var sz = antW * antH;
  antPheroFood = new Float32Array(sz);
  antPheroHome = new Float32Array(sz);
  antWalls = new Uint8Array(sz);
  // Nest at center-left
  antNest = {x: (antW * 0.2) | 0, y: (antH * 0.5) | 0};
  // Food sources
  antFood = [];
  antFood.push({x: (antW * 0.8) | 0, y: (antH * 0.3) | 0, amount: 500});
  antFood.push({x: (antW * 0.7) | 0, y: (antH * 0.7) | 0, amount: 500});
  antFood.push({x: (antW * 0.5) | 0, y: (antH * 0.2) | 0, amount: 500});
  var numAnts = state.isMobile ? 200 : 300;
  antsArr = [];
  for (var i = 0; i < numAnts; i++) {
    antsArr.push({
      x: antNest.x + (Math.random() - 0.5) * 4,
      y: antNest.y + (Math.random() - 0.5) * 4,
      angle: Math.random() * Math.PI * 2,
      hasFood: false
    });
  }
}
// initAnts(); — called via registerMode
function renderAnts() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (antW !== W || antH !== H) initAnts();
  // Click places food
  if (pointer.clicked && state.currentMode === 'ants') {
    pointer.clicked = false;
    antFood.push({x: Math.floor(pointer.gx), y: Math.floor(pointer.gy), amount: 300});
  }
  // Drag draws walls
  if (pointer.down && !pointer.clicked && state.currentMode === 'ants') {
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) antWalls[gy * W + gx] = 1;
  }
  // Pheromone evaporation + diffusion
  var nextF = new Float32Array(W * H);
  var nextH = new Float32Array(W * H);
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      if (antWalls[idx]) continue;
      var sf = 0, sh = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var ni = idx + dy * W + dx;
          sf += antPheroFood[ni];
          sh += antPheroHome[ni];
        }
      }
      nextF[idx] = sf / 9 * 0.97;
      nextH[idx] = sh / 9 * 0.97;
    }
  }
  antPheroFood = nextF;
  antPheroHome = nextH;
  // Update ants
  var sensorDist = 2, sensorAngle = 0.5;
  for (var i = 0; i < antsArr.length; i++) {
    var a = antsArr[i];
    var phero = a.hasFood ? antPheroHome : antPheroFood;
    // Sense 3 directions
    var fl = 0, fc = 0, fr = 0;
    var lx = (a.x + Math.cos(a.angle - sensorAngle) * sensorDist) | 0;
    var ly = (a.y + Math.sin(a.angle - sensorAngle) * sensorDist) | 0;
    if (lx >= 0 && lx < W && ly >= 0 && ly < H) fl = phero[ly * W + lx];
    var cx2 = (a.x + Math.cos(a.angle) * sensorDist) | 0;
    var cy2 = (a.y + Math.sin(a.angle) * sensorDist) | 0;
    if (cx2 >= 0 && cx2 < W && cy2 >= 0 && cy2 < H) fc = phero[cy2 * W + cx2];
    var rx = (a.x + Math.cos(a.angle + sensorAngle) * sensorDist) | 0;
    var ry = (a.y + Math.sin(a.angle + sensorAngle) * sensorDist) | 0;
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) fr = phero[ry * W + rx];
    // Turn toward strongest
    if (fc >= fl && fc >= fr) a.angle += (Math.random() - 0.5) * 0.2;
    else if (fl > fr) a.angle -= 0.3;
    else a.angle += 0.3;
    a.angle += (Math.random() - 0.5) * 0.3;
    // Move
    var nx = a.x + Math.cos(a.angle) * 0.8;
    var ny = a.y + Math.sin(a.angle) * 0.8;
    var nxi = nx | 0, nyi = ny | 0;
    if (nxi < 0 || nxi >= W || nyi < 0 || nyi >= H || antWalls[nyi * W + nxi]) {
      a.angle += Math.PI * (0.5 + Math.random());
    } else {
      a.x = nx; a.y = ny;
    }
    // Deposit pheromone
    var ix = a.x | 0, iy = a.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      if (a.hasFood) {
        antPheroFood[iy * W + ix] = Math.min(1, antPheroFood[iy * W + ix] + 0.1);
      } else {
        antPheroHome[iy * W + ix] = Math.min(1, antPheroHome[iy * W + ix] + 0.05);
      }
    }
    // Check food pickup
    if (!a.hasFood) {
      for (var f = 0; f < antFood.length; f++) {
        var fd = antFood[f];
        if (fd.amount <= 0) continue;
        var dx = a.x - fd.x, dy = a.y - fd.y;
        if (dx * dx + dy * dy < 4) {
          a.hasFood = true;
          fd.amount--;
          a.angle += Math.PI;
          break;
        }
      }
    }
    // Check nest delivery
    if (a.hasFood) {
      var dx = a.x - antNest.x, dy = a.y - antNest.y;
      if (dx * dx + dy * dy < 4) {
        a.hasFood = false;
        a.angle += Math.PI;
      }
    }
  }
  // Draw pheromones
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      if (antWalls[idx]) { drawChar('#', x, y, 80, 60, 40, 0.6); continue; }
      var vf = antPheroFood[idx], vh = antPheroHome[idx];
      var v = Math.max(vf, vh);
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0);
      if (vf > vh) {
        drawChar(RAMP_SOFT[ri], x, y, 50, (100 + vf * 155) | 0, 50, Math.min(1, v * 3));
      } else {
        drawChar(RAMP_SOFT[ri], x, y, 50, 80, (100 + vh * 155) | 0, Math.min(1, v * 3));
      }
    }
  }
  // Draw food sources
  for (var f = 0; f < antFood.length; f++) {
    var fd = antFood[f];
    if (fd.amount <= 0) continue;
    drawChar('F', fd.x, fd.y, 255, 200, 50, 1);
  }
  // Draw nest
  drawChar('N', antNest.x, antNest.y, 200, 100, 255, 1);
  // Draw ants
  for (var i = 0; i < antsArr.length; i++) {
    var a = antsArr[i];
    var ix = a.x | 0, iy = a.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      if (a.hasFood) {
        drawChar('o', ix, iy, 255, 200, 50, 0.9);
      } else {
        drawChar('.', ix, iy, 200, 150, 100, 0.7);
      }
    }
  }
}

registerMode('ants', {
  init: initAnts,
  render: renderAnts,
});
