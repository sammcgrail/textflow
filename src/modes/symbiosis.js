import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Symbiosis — a living ASCII ecosystem simulation
// Lotka-Volterra dynamics with plants, herbivores, predators
// ============================================================

// Creature arrays
var plants = [];
var herbivores = [];
var predators = [];
var deathParticles = [];

// Population history for graph
var popHistory = [];
var POP_HISTORY_MAX = 200;

// Simulation timing
var lastSimTick = 0;
var SIM_INTERVAL = 120; // ms between sim steps
var dayTime = 0; // 0..1 cycle for day/night

// Grid for spatial lookups
var grid = null;
var gridW = 0;
var gridH = 0;

// Config
var MAX_PLANTS = 600;
var MAX_HERBIVORES = 120;
var MAX_PREDATORS = 40;
var PLANT_GROWTH_RATE = 0.03;
var SEED_SPREAD_CHANCE = 0.008;
var GRAPH_HEIGHT = 6;

// Mouse interaction
var _clickHandler = null;
var _mouseX = -1;
var _mouseY = -1;

// ============================================================
// Grid helpers for spatial lookups
// ============================================================

function initGrid() {
  gridW = state.COLS;
  gridH = state.ROWS;
  grid = new Array(gridW * gridH);
  rebuildGrid();
}

function rebuildGrid() {
  for (var i = 0; i < gridW * gridH; i++) {
    grid[i] = null;
  }
  for (var i = 0; i < plants.length; i++) {
    var p = plants[i];
    var idx = p.y * gridW + p.x;
    if (idx >= 0 && idx < gridW * gridH) grid[idx] = { type: 'plant', idx: i };
  }
}

function gridGet(x, y) {
  if (x < 0 || x >= gridW || y < 0 || y >= gridH) return null;
  return grid[y * gridW + x];
}

// ============================================================
// Spawn helpers
// ============================================================

function spawnPlant(x, y) {
  if (plants.length >= MAX_PLANTS) return;
  if (x < 0 || x >= state.COLS || y < GRAPH_HEIGHT + 1 || y >= state.ROWS) return;
  // Don't stack plants
  for (var i = 0; i < plants.length; i++) {
    if (plants[i].x === x && plants[i].y === y) return;
  }
  var chars = ['*', '.', ',', ';', '\'', '"'];
  plants.push({
    x: x,
    y: y,
    energy: 0.3 + Math.random() * 0.4,
    ch: chars[Math.floor(Math.random() * chars.length)],
    age: 0
  });
}

function spawnHerbivore(x, y) {
  if (herbivores.length >= MAX_HERBIVORES) return;
  herbivores.push({
    x: x,
    y: y,
    energy: 0.6 + Math.random() * 0.3,
    dir: Math.floor(Math.random() * 4),
    wanderTimer: 0,
    age: 0
  });
}

function spawnPredator(x, y) {
  if (predators.length >= MAX_PREDATORS) return;
  predators.push({
    x: x,
    y: y,
    energy: 0.7 + Math.random() * 0.3,
    dir: Math.floor(Math.random() * 4),
    wanderTimer: 0,
    age: 0
  });
}

function spawnDeathParticle(x, y, hue) {
  var chars = ['~', '.', '*', '+', 'x'];
  for (var i = 0; i < 4; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 0.5 + Math.random() * 1.5;
    deathParticles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.4 + Math.random() * 0.4,
      ch: chars[Math.floor(Math.random() * chars.length)],
      hue: hue + Math.random() * 30 - 15
    });
  }
}

// ============================================================
// Direction helpers
// ============================================================

var DX = [0, 1, 0, -1];
var DY = [-1, 0, 1, 0];

function clampX(x) { return Math.max(0, Math.min(state.COLS - 1, x)); }
function clampY(y) { return Math.max(GRAPH_HEIGHT + 1, Math.min(state.ROWS - 1, y)); }

function distSq(ax, ay, bx, by) {
  var dx = ax - bx;
  var dy = ay - by;
  return dx * dx + dy * dy;
}

// ============================================================
// Simulation step
// ============================================================

function simStep() {
  var W = state.COLS;
  var H = state.ROWS;
  var simArea = H - GRAPH_HEIGHT - 1;

  // Day/night cycle — full cycle every ~60 seconds at 120ms ticks
  dayTime = (dayTime + 0.002) % 1.0;
  var daylight = 0.5 + 0.5 * Math.sin(dayTime * Math.PI * 2); // 0=night, 1=day

  // --- Plants grow and spread ---
  var growthMul = 0.5 + daylight * 1.0; // plants grow faster in daytime
  if (plants.length < MAX_PLANTS * 0.8) {
    // Spontaneous growth from ground
    var groundGrowths = Math.floor(PLANT_GROWTH_RATE * growthMul * 10);
    for (var g = 0; g < groundGrowths; g++) {
      var gx = Math.floor(Math.random() * W);
      // Prefer bottom half (ground level)
      var gy = GRAPH_HEIGHT + 1 + Math.floor(simArea * (0.5 + Math.random() * 0.5));
      gy = clampY(gy);
      spawnPlant(gx, gy);
    }
  }

  // Existing plants spread seeds
  for (var i = 0; i < plants.length; i++) {
    var p = plants[i];
    p.age += 1;
    p.energy = Math.min(1.0, p.energy + 0.005 * growthMul);

    if (Math.random() < SEED_SPREAD_CHANCE * growthMul && p.energy > 0.6) {
      var sx = p.x + Math.floor(Math.random() * 5) - 2;
      var sy = p.y + Math.floor(Math.random() * 5) - 2;
      spawnPlant(clampX(sx), clampY(sy));
    }

    // Mature plants upgrade their character
    if (p.age > 30 && p.ch === '.') p.ch = ',';
    if (p.age > 60 && (p.ch === ',' || p.ch === ';')) p.ch = '*';
  }

  // Rebuild grid after plant changes
  rebuildGrid();

  // --- Herbivores ---
  for (var i = herbivores.length - 1; i >= 0; i--) {
    var h = herbivores[i];
    h.age += 1;
    h.energy -= 0.012;

    // Find nearest plant within vision range
    var bestPlant = -1;
    var bestDist = 100;
    for (var j = 0; j < plants.length; j++) {
      var d = distSq(h.x, h.y, plants[j].x, plants[j].y);
      if (d < bestDist) {
        bestDist = d;
        bestPlant = j;
      }
    }

    // Move toward plant or wander
    if (bestPlant >= 0 && bestDist <= 64) {
      var target = plants[bestPlant];
      var ddx = target.x - h.x;
      var ddy = target.y - h.y;
      if (Math.abs(ddx) > Math.abs(ddy)) {
        h.x += ddx > 0 ? 1 : -1;
      } else {
        h.y += ddy > 0 ? 1 : -1;
      }
    } else {
      // Random wander
      h.wanderTimer -= 1;
      if (h.wanderTimer <= 0) {
        h.dir = Math.floor(Math.random() * 4);
        h.wanderTimer = 3 + Math.floor(Math.random() * 5);
      }
      h.x += DX[h.dir];
      h.y += DY[h.dir];
    }

    h.x = clampX(h.x);
    h.y = clampY(h.y);

    // Eat plants at current position
    for (var j = plants.length - 1; j >= 0; j--) {
      if (plants[j].x === h.x && plants[j].y === h.y) {
        h.energy = Math.min(1.0, h.energy + 0.25 + plants[j].energy * 0.15);
        plants.splice(j, 1);
        break;
      }
    }

    // Reproduce when well-fed
    if (h.energy > 0.85 && herbivores.length < MAX_HERBIVORES && Math.random() < 0.06) {
      h.energy *= 0.5;
      spawnHerbivore(
        clampX(h.x + Math.floor(Math.random() * 3) - 1),
        clampY(h.y + Math.floor(Math.random() * 3) - 1)
      );
    }

    // Death from starvation
    if (h.energy <= 0) {
      spawnDeathParticle(h.x, h.y, 50); // yellow-ish death
      herbivores.splice(i, 1);
    }
  }

  // --- Predators ---
  for (var i = predators.length - 1; i >= 0; i--) {
    var pr = predators[i];
    pr.age += 1;
    pr.energy -= 0.018;

    // Hunt nearest herbivore within vision
    var bestPrey = -1;
    var bestPreyDist = 200;
    for (var j = 0; j < herbivores.length; j++) {
      var d = distSq(pr.x, pr.y, herbivores[j].x, herbivores[j].y);
      if (d < bestPreyDist) {
        bestPreyDist = d;
        bestPrey = j;
      }
    }

    if (bestPrey >= 0 && bestPreyDist <= 144) {
      var prey = herbivores[bestPrey];
      var ddx = prey.x - pr.x;
      var ddy = prey.y - pr.y;
      // Predators move slightly faster — can move diagonally sometimes
      if (Math.abs(ddx) >= Math.abs(ddy)) {
        pr.x += ddx > 0 ? 1 : -1;
        if (Math.random() < 0.3 && ddy !== 0) pr.y += ddy > 0 ? 1 : -1;
      } else {
        pr.y += ddy > 0 ? 1 : -1;
        if (Math.random() < 0.3 && ddx !== 0) pr.x += ddx > 0 ? 1 : -1;
      }
    } else {
      pr.wanderTimer -= 1;
      if (pr.wanderTimer <= 0) {
        pr.dir = Math.floor(Math.random() * 4);
        pr.wanderTimer = 2 + Math.floor(Math.random() * 4);
      }
      pr.x += DX[pr.dir];
      pr.y += DY[pr.dir];
    }

    pr.x = clampX(pr.x);
    pr.y = clampY(pr.y);

    // Catch herbivores at same position
    for (var j = herbivores.length - 1; j >= 0; j--) {
      if (herbivores[j].x === pr.x && herbivores[j].y === pr.y) {
        pr.energy = Math.min(1.0, pr.energy + 0.4);
        spawnDeathParticle(herbivores[j].x, herbivores[j].y, 50);
        herbivores.splice(j, 1);
        break;
      }
    }

    // Reproduce
    if (pr.energy > 0.9 && predators.length < MAX_PREDATORS && Math.random() < 0.04) {
      pr.energy *= 0.5;
      spawnPredator(
        clampX(pr.x + Math.floor(Math.random() * 3) - 1),
        clampY(pr.y + Math.floor(Math.random() * 3) - 1)
      );
    }

    // Death
    if (pr.energy <= 0) {
      spawnDeathParticle(pr.x, pr.y, 0); // red death
      predators.splice(i, 1);
    }
  }

  // Record population snapshot
  popHistory.push({
    plants: plants.length,
    herbivores: herbivores.length,
    predators: predators.length
  });
  if (popHistory.length > POP_HISTORY_MAX) {
    popHistory.shift();
  }

  // Auto-balance: if herbivores go extinct, respawn a few
  if (herbivores.length === 0 && plants.length > 50) {
    for (var r = 0; r < 4; r++) {
      spawnHerbivore(
        Math.floor(Math.random() * W),
        clampY(GRAPH_HEIGHT + 1 + Math.floor(Math.random() * simArea))
      );
    }
  }

  // Auto-balance: if predators go extinct and herbivores are abundant
  if (predators.length === 0 && herbivores.length > 15) {
    for (var r = 0; r < 2; r++) {
      spawnPredator(
        Math.floor(Math.random() * W),
        clampY(GRAPH_HEIGHT + 1 + Math.floor(Math.random() * simArea))
      );
    }
  }
}

// ============================================================
// Init
// ============================================================

function init() {
  plants = [];
  herbivores = [];
  predators = [];
  deathParticles = [];
  popHistory = [];
  dayTime = 0.25; // start at dawn
  lastSimTick = 0;

  var W = state.COLS;
  var H = state.ROWS;
  var simArea = H - GRAPH_HEIGHT - 1;

  // Seed initial plants
  for (var i = 0; i < 120; i++) {
    var px = Math.floor(Math.random() * W);
    var py = GRAPH_HEIGHT + 1 + Math.floor(simArea * (0.3 + Math.random() * 0.7));
    spawnPlant(px, clampY(py));
  }

  // Seed herbivores
  for (var i = 0; i < 20; i++) {
    spawnHerbivore(
      Math.floor(Math.random() * W),
      clampY(GRAPH_HEIGHT + 1 + Math.floor(Math.random() * simArea))
    );
  }

  // Seed predators
  for (var i = 0; i < 5; i++) {
    spawnPredator(
      Math.floor(Math.random() * W),
      clampY(GRAPH_HEIGHT + 1 + Math.floor(Math.random() * simArea))
    );
  }

  initGrid();
}

// ============================================================
// Render
// ============================================================

function render() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var now = performance.now();

  // Run simulation steps
  if (now - lastSimTick >= SIM_INTERVAL) {
    simStep();
    lastSimTick = now;
  }

  // Update death particles
  var dt = 1 / 60;
  for (var i = deathParticles.length - 1; i >= 0; i--) {
    var dp = deathParticles[i];
    dp.x += dp.vx * dt;
    dp.y += dp.vy * dt;
    dp.vx *= 0.92;
    dp.vy *= 0.92;
    dp.life -= dt;
    if (dp.life <= 0) deathParticles.splice(i, 1);
  }

  // Day/night background color
  var daylight = 0.5 + 0.5 * Math.sin(dayTime * Math.PI * 2);
  var bgBright = 3 + daylight * 5; // 3 at night, 8 at day
  var bgHue = daylight > 0.4 ? 220 : 240; // bluer at night

  // Background — dynamic shimmer ground texture
  for (var y = GRAPH_HEIGHT + 1; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var groundDepth = (y - GRAPH_HEIGHT) / (H - GRAPH_HEIGHT);
      var shimmer = Math.sin(t * 0.8 + x * 0.4 + y * 0.6) * 0.5 + 0.5;
      if ((x + y * 3) % 5 === 0 || shimmer > 0.85) {
        var shimBright = bgBright + groundDepth * 3 + shimmer * 4;
        drawCharHSL('.', x, y, bgHue + shimmer * 20, 20 + shimmer * 10, shimBright);
      }
    }
  }

  // --- Population graph at top ---
  drawPopGraph(W, t);

  // --- Draw separator line ---
  for (var x = 0; x < W; x++) {
    drawCharHSL('-', x, GRAPH_HEIGHT, 220, 20, 15);
  }

  // --- Day/night indicator ---
  var dayStr = daylight > 0.6 ? 'DAY' : daylight > 0.3 ? 'DUSK' : 'NIGHT';
  var dayHue = daylight > 0.6 ? 45 : daylight > 0.3 ? 25 : 230;
  var dayBr = daylight > 0.6 ? 55 : daylight > 0.3 ? 40 : 30;
  for (var c = 0; c < dayStr.length; c++) {
    drawCharHSL(dayStr[c], W - dayStr.length - 1 + c, GRAPH_HEIGHT, dayHue, 50, dayBr);
  }

  // --- Draw plants ---
  for (var i = 0; i < plants.length; i++) {
    var p = plants[i];
    var energyRatio = p.energy;
    // Green hue, brighter when more energy, slight variation
    var hue = 100 + energyRatio * 30; // 100 (yellow-green) to 130 (green)
    var sat = 50 + energyRatio * 50;
    var bright = 35 + energyRatio * 35 + daylight * 15;
    // Sway animation contributes more to brightness
    var sway = Math.sin(t * 1.5 + p.x * 0.3 + p.y * 0.7) * 0.3;
    bright += sway * 12;
    // Pulsing when plant population is extreme
    if (plants.length > MAX_PLANTS * 0.7) {
      bright += Math.sin(t * 2 + i * 0.1) * 8;
    }
    drawCharHSL(p.ch, p.x, p.y, hue, sat, Math.min(85, bright));
  }

  // --- Draw herbivores ---
  var herbChars = ['o', 'O', 'o', 'c'];
  for (var i = 0; i < herbivores.length; i++) {
    var h = herbivores[i];
    var energyRatio = h.energy;
    // Yellow to warm orange based on energy
    var hue = 40 + energyRatio * 20; // 40 (orange) to 60 (yellow)
    var sat = 60 + energyRatio * 30;
    var bright = 45 + energyRatio * 35;
    var chIdx = energyRatio > 0.7 ? 1 : energyRatio > 0.4 ? 0 : 3;
    // Pulsing when hungry
    if (energyRatio < 0.3) {
      bright += Math.sin(t * 6) * 12;
    }
    // Pulsing when herbivore population is extreme
    if (herbivores.length > MAX_HERBIVORES * 0.7) {
      bright += Math.sin(t * 3 + i * 0.2) * 8;
    }
    drawCharHSL(herbChars[chIdx], h.x, h.y, hue, sat, Math.max(20, bright));
  }

  // --- Draw predators ---
  var predChars = ['#', 'X', '@', 'W'];
  for (var i = 0; i < predators.length; i++) {
    var pr = predators[i];
    var energyRatio = pr.energy;
    // Red spectrum, more intense when well-fed
    var hue = energyRatio > 0.5 ? 0 : 15; // deep red to orange-red
    var sat = 65 + energyRatio * 30;
    var bright = 45 + energyRatio * 40;
    var chIdx = energyRatio > 0.8 ? 2 : energyRatio > 0.5 ? 0 : energyRatio > 0.3 ? 1 : 3;
    // Predators have a menacing flicker
    bright += Math.sin(t * 4 + pr.x) * 8;
    // Pulsing when predator population is extreme
    if (predators.length > MAX_PREDATORS * 0.7 || predators.length < 3) {
      bright += Math.sin(t * 5 + i * 0.3) * 10;
    }
    drawCharHSL(predChars[chIdx], pr.x, pr.y, hue, sat, Math.max(20, bright));
  }

  // --- Draw death particles ---
  for (var i = 0; i < deathParticles.length; i++) {
    var dp = deathParticles[i];
    var px = Math.round(dp.x);
    var py = Math.round(dp.y);
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var alpha = dp.life / dp.maxLife;
      drawCharHSL(dp.ch, px, py, dp.hue, 60, 35 + alpha * 45);
    }
  }

  // --- Stats bar at bottom ---
  var statsStr = 'P:' + plants.length + ' H:' + herbivores.length + ' X:' + predators.length;
  var statsX = 1;
  for (var c = 0; c < statsStr.length; c++) {
    var ch = statsStr[c];
    var sHue = 0;
    if (c < 2 + String(plants.length).length) sHue = 120;
    else if (c < 2 + String(plants.length).length + 3 + String(herbivores.length).length) sHue = 50;
    else sHue = 0;
    drawCharHSL(ch, statsX + c, H - 1, sHue, 40, 40);
  }

  // Click hint
  var hint = 'CLICK TO SEED PLANTS';
  var hintX = W - hint.length - 1;
  for (var c = 0; c < hint.length; c++) {
    drawCharHSL(hint[c], hintX + c, H - 1, 120, 20, 20 + Math.sin(t * 2) * 5);
  }
}

// ============================================================
// Population graph
// ============================================================

function drawPopGraph(W, t) {
  if (popHistory.length < 2) return;

  // Find max for scaling
  var maxPop = 1;
  for (var i = 0; i < popHistory.length; i++) {
    var snap = popHistory[i];
    if (snap.plants > maxPop) maxPop = snap.plants;
    if (snap.herbivores > maxPop) maxPop = snap.herbivores;
    if (snap.predators > maxPop) maxPop = snap.predators;
  }

  // Scale predators separately so they're visible
  var maxPred = 1;
  for (var i = 0; i < popHistory.length; i++) {
    if (popHistory[i].predators > maxPred) maxPred = popHistory[i].predators;
  }

  // Title
  var title = 'ECOSYSTEM';
  var titleX = Math.floor(W / 2 - title.length / 2);
  for (var c = 0; c < title.length; c++) {
    drawCharHSL(title[c], titleX + c, 0, 180, 40, 45 + Math.sin(t + c * 0.3) * 10);
  }

  // Draw graph lines — map history to columns
  var graphW = Math.min(W - 4, popHistory.length);
  var startIdx = popHistory.length - graphW;
  var graphX0 = Math.floor((W - graphW) / 2);

  for (var col = 0; col < graphW; col++) {
    var snap = popHistory[startIdx + col];

    // Plant bar (green)
    var plantH = Math.round((snap.plants / maxPop) * (GRAPH_HEIGHT - 2));
    for (var row = 0; row < plantH; row++) {
      var gy = GRAPH_HEIGHT - 1 - row;
      if (gy > 0) {
        drawCharHSL('|', graphX0 + col, gy, 120, 60, 25 + row * 4);
      }
    }

    // Herbivore line (yellow) — draw as a dot at the right height
    var herbH = Math.round((snap.herbivores / maxPop) * (GRAPH_HEIGHT - 2));
    if (herbH > 0) {
      var hy = GRAPH_HEIGHT - 1 - herbH;
      if (hy > 0 && hy < GRAPH_HEIGHT) {
        drawCharHSL('-', graphX0 + col, hy, 50, 70, 50);
      }
    }

    // Predator line (red) — scaled to their own max for visibility
    var predH = Math.round((snap.predators / Math.max(maxPred, 1)) * (GRAPH_HEIGHT - 2));
    if (predH > 0) {
      var py = GRAPH_HEIGHT - 1 - predH;
      if (py > 0 && py < GRAPH_HEIGHT) {
        drawCharHSL('*', graphX0 + col, py, 0, 70, 50);
      }
    }
  }

  // Legend
  drawCharHSL('P', 1, 0, 120, 60, 40);
  drawCharHSL('H', 3, 0, 50, 70, 40);
  drawCharHSL('X', 5, 0, 0, 70, 40);
}

// ============================================================
// Attach — mouse/click events
// ============================================================

function attach() {
  cleanup();

  _clickHandler = function(e) {
    if (state.currentMode !== 'symbiosis') return;

    var rect = state.canvas.getBoundingClientRect();
    var scaleX = state.canvas.width / (state.dpr * rect.width);
    var scaleY = state.canvas.height / (state.dpr * rect.height);
    var cx = (e.clientX - rect.left) * scaleX;
    var cy = (e.clientY - rect.top) * scaleY;
    var col = Math.floor(cx / state.CELL_W);
    var row = Math.floor(cy / state.CELL_H);

    // Burst of plants at click position
    for (var i = 0; i < 15; i++) {
      var px = col + Math.floor(Math.random() * 7) - 3;
      var py = row + Math.floor(Math.random() * 7) - 3;
      spawnPlant(clampX(px), clampY(py));
    }
  };
  state.canvas.addEventListener('click', _clickHandler);
}

// ============================================================
// Cleanup
// ============================================================

function cleanup() {
  if (_clickHandler && state.canvas) {
    state.canvas.removeEventListener('click', _clickHandler);
    _clickHandler = null;
  }
}

// ============================================================
// Register
// ============================================================

registerMode('symbiosis', { init: init, render: render, attach: attach, cleanup: cleanup });
