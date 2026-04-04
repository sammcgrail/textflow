import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var afAnts, afFood, afWalls, afPher, afW, afH, afStep;
function initAntfarm() {
  afW = state.COLS; afH = state.ROWS;
  afPher = new Float32Array(afW * afH * 2); // 2 colonies
  afWalls = new Uint8Array(afW * afH);
  afFood = new Uint8Array(afW * afH);
  afAnts = []; afStep = 0;
  // Nest positions
  var nests = [{x: (afW * 0.2) | 0, y: (afH * 0.5) | 0}, {x: (afW * 0.8) | 0, y: (afH * 0.5) | 0}];
  for (var c = 0; c < 2; c++) {
    for (var i = 0; i < 30; i++) {
      afAnts.push({
        x: nests[c].x + ((Math.random() - 0.5) * 4) | 0,
        y: nests[c].y + ((Math.random() - 0.5) * 4) | 0,
        dir: Math.random() * Math.PI * 2,
        colony: c, hasFood: false,
        nx: nests[c].x, ny: nests[c].y
      });
    }
  }
  // Scatter food
  for (var i = 0; i < 8; i++) {
    var fx = (Math.random() * afW) | 0, fy = (Math.random() * afH) | 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var px = fx + dx, py = fy + dy;
      if (px >= 0 && px < afW && py >= 0 && py < afH) afFood[py * afW + px] = 1;
    }
  }
}
function renderAntfarm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!afAnts || afW !== W || afH !== H) initAntfarm();
  if (pointer.clicked && state.currentMode === 'antfarm') {
    pointer.clicked = false;
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) afFood[py * W + px] = 1;
    }
  } else if (pointer.down && state.currentMode === 'antfarm') {
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) afWalls[py * W + px] = 1;
    }
  }
  var curStep = (state.time * 15) | 0;
  while (afStep < curStep) {
    afStep++;
    // Decay pheromones
    for (var i = 0; i < W * H * 2; i++) afPher[i] *= 0.995;
    // Move ants
    for (var i = 0; i < afAnts.length; i++) {
      var a = afAnts[i];
      // Leave pheromone
      var idx = ((a.y | 0) * W + (a.x | 0));
      if (idx >= 0 && idx < W * H) {
        afPher[a.colony * W * H + idx] = Math.min(1, afPher[a.colony * W * H + idx] + 0.1);
      }
      if (a.hasFood) {
        // Head to nest
        var dx = a.nx - a.x, dy = a.ny - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        a.dir = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
        if (d < 2) { a.hasFood = false; }
      } else {
        // Look for food, wander with pheromone bias
        a.dir += (Math.random() - 0.5) * 0.8;
        var fx = (a.x + Math.cos(a.dir) * 2) | 0;
        var fy = (a.y + Math.sin(a.dir) * 2) | 0;
        if (fx >= 0 && fx < W && fy >= 0 && fy < H && afFood[fy * W + fx]) {
          afFood[fy * W + fx] = 0;
          a.hasFood = true;
        }
      }
      var nx = a.x + Math.cos(a.dir) * 0.5;
      var ny = a.y + Math.sin(a.dir) * 0.5;
      var ni = ((ny | 0) * W + (nx | 0));
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && ni >= 0 && ni < W * H && !afWalls[ni]) {
        a.x = nx; a.y = ny;
      } else {
        a.dir += Math.PI * 0.5 + Math.random();
      }
    }
  }
  // Draw pheromones
  var colHues = [30, 180];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      for (var c = 0; c < 2; c++) {
        var v = afPher[c * W * H + idx];
        if (v > 0.02) {
          var ri = (v * (RAMP_DENSE.length - 1)) | 0;
          drawCharHSL(RAMP_DENSE[ri], x, y, colHues[c], 50, (10 + v * 25) | 0);
        }
      }
    }
  }
  // Draw food
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (afFood[y * W + x]) drawCharHSL('*', x, y, 100, 70, 40);
    }
  }
  // Draw walls
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (afWalls[y * W + x]) drawCharHSL('#', x, y, 30, 20, 25);
    }
  }
  // Draw ants
  for (var i = 0; i < afAnts.length; i++) {
    var a = afAnts[i];
    var ax = (a.x) | 0, ay = (a.y) | 0;
    if (ax >= 0 && ax < W && ay >= 0 && ay < H) {
      var ch = a.hasFood ? '%' : '@';
      drawCharHSL(ch, ax, ay, colHues[a.colony], 70, 50);
    }
  }
}
registerMode('antfarm', { init: initAntfarm, render: renderAntfarm });
