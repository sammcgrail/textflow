import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Starvester (textflow) — homage to @syphono4's Starvester. ASCII-grid
// incremental: central star drains as drones shuttle resources from
// asteroid belts to a slowly-completing Dyson swarm.
//
// Click to deploy a drone (max 50). Each drone repeatedly:
//   1. fly from construction ring → an asteroid in the belt
//   2. mine for ~1.2s
//   3. fly back to construction ring with cargo
//   4. deposit into the least-complete sector
//
// Sphere has 24 sectors. As they fill, the star dims (energy drained).
// Once 100% complete: prestige flash, reset with a permanent counter
// that ticks tier ↑ each completion.

var sv = {
  drones: [],          // {phase, x, y, target, mined, hue}
  sectors: null,       // Float32Array[24], 0..1 fill
  resources: 0,
  prestige: 0,
  starHueShift: 0,
  prestigeFlash: 0,    // timer for win-screen flash
  spawnCooldown: 0,
};

var SECTOR_COUNT = 24;
var MAX_DRONES = 50;

function initStarvester() {
  sv.drones = [];
  sv.sectors = new Float32Array(SECTOR_COUNT);
  sv.resources = 0;
  sv.prestige = 0;
  sv.starHueShift = 0;
  sv.prestigeFlash = 0;
  sv.spawnCooldown = 0;
  // Auto-spawn 5 drones — but flag them for first-frame placement
  // since state.COLS isn't reliable yet at init time.
  for (var i = 0; i < 5; i++) spawnDrone();
}

function spawnDrone() {
  if (sv.drones.length >= MAX_DRONES) return;
  // Defer x/y placement to first tick (when state.COLS/ROWS are reliable).
  sv.drones.push({
    phase: 'outbound',
    x: -1, y: -1,        // sentinel — placed on first tick
    targetSector: Math.floor(Math.random() * 8),
    mined: 0,
    timer: 0,
    hue: 180 + Math.floor(Math.random() * 60),
    needsPlacement: true,
  });
}

function pickIncompleteSector() {
  var min = 1.1, idx = 0;
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (sv.sectors[i] < min) { min = sv.sectors[i]; idx = i; }
  }
  return idx;
}

function tickDrone(d, dt, cx, cy, asteroidR, sphereR, charAspect) {
  if (d.needsPlacement) {
    var ang = Math.random() * Math.PI * 2;
    d.x = cx + Math.cos(ang) * sphereR;
    d.y = cy + Math.sin(ang) * sphereR * charAspect;
    d.needsPlacement = false;
  }
  if (d.phase === 'outbound') {
    // Fly from construction ring (sphereR) toward an asteroid (asteroidR).
    var ang = (d.targetSector / 8) * Math.PI * 2;
    var tx = cx + Math.cos(ang) * asteroidR;
    var ty = cy + Math.sin(ang) * asteroidR * charAspect;
    var dx = tx - d.x;
    var dy = ty - d.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var speed = 14 * dt; // chars/sec
    if (dist < speed) {
      d.x = tx; d.y = ty;
      d.phase = 'mining'; d.timer = 0;
    } else {
      d.x += dx / dist * speed;
      d.y += dy / dist * speed;
    }
  } else if (d.phase === 'mining') {
    d.timer += dt;
    if (d.timer > 1.2) {
      d.mined = 1;
      d.phase = 'inbound';
    }
  } else if (d.phase === 'inbound') {
    // Fly back to a sphere sector (deposit).
    var depositSector = pickIncompleteSector();
    var ang = (depositSector / SECTOR_COUNT) * Math.PI * 2;
    var tx = cx + Math.cos(ang) * sphereR;
    var ty = cy + Math.sin(ang) * sphereR * charAspect;
    var dx = tx - d.x;
    var dy = ty - d.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var speed = 12 * dt;
    if (dist < speed) {
      d.x = tx; d.y = ty;
      // Deposit.
      sv.sectors[depositSector] = Math.min(1.0, sv.sectors[depositSector] + 0.04);
      sv.resources += 1 + sv.prestige;
      d.mined = 0;
      d.targetSector = Math.floor(Math.random() * 8);
      d.phase = 'outbound';
    } else {
      d.x += dx / dist * speed;
      d.y += dy / dist * speed;
    }
  }
}

function checkPrestige() {
  var done = true;
  for (var i = 0; i < SECTOR_COUNT; i++) {
    if (sv.sectors[i] < 0.999) { done = false; break; }
  }
  if (done) {
    sv.prestige += 1;
    sv.prestigeFlash = 1.5;
    for (var i = 0; i < SECTOR_COUNT; i++) sv.sectors[i] = 0;
    // bonus drone on prestige
    if (sv.drones.length < MAX_DRONES) spawnDrone();
  }
}

function renderStarvester() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = state.dt || 0.016;
  if (dt > 0.05) dt = 0.05;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);

  var cx = W / 2;
  var cy = H / 2;
  // Aspect math: chars are ~2× taller than wide (charAspect ~0.48), so
  // dy = R*sin(theta)*charAspect makes a screen-space circle round.
  // Fitting constraint: R ≤ min(W/2, H/(2*charAspect)).
  var fitR = Math.min(W * 0.5, H * 0.5 / charAspect);
  var sphereR = Math.max(4, fitR * 0.30);
  var asteroidR = Math.max(9, fitR * 0.85);

  // Click handling: spawn drone (with brief cooldown so a held click
  // doesn't max it instantly).
  sv.spawnCooldown -= dt;
  if (pointer.clicked && state.currentMode === 'starvester') {
    pointer.clicked = false;
    if (sv.spawnCooldown <= 0) {
      spawnDrone();
      sv.spawnCooldown = 0.08;
    }
  }
  if (pointer.down && state.currentMode === 'starvester') {
    if (sv.spawnCooldown <= 0) {
      spawnDrone();
      sv.spawnCooldown = 0.15;
    }
  }

  if (sv.prestigeFlash > 0) sv.prestigeFlash -= dt;

  // ── tick drones ─────────────────────────────────────────────────
  for (var i = 0; i < sv.drones.length; i++) {
    tickDrone(sv.drones[i], dt, cx, cy, asteroidR, sphereR, charAspect);
  }
  checkPrestige();

  // ── render asteroid belt (8 clusters at fixed angles) ───────────
  for (var ai = 0; ai < 8; ai++) {
    var ang = (ai / 8) * Math.PI * 2;
    var bx = cx + Math.cos(ang) * asteroidR;
    var by = cy + Math.sin(ang) * asteroidR * charAspect;
    var clusterChars = ['*', '·', '·', '+', '·'];
    for (var c = 0; c < clusterChars.length; c++) {
      var ox = (c % 3) - 1;
      var oy = ((c / 3) | 0) - 1;
      var x = Math.round(bx + ox);
      var y = Math.round(by + oy);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var lit = 30 + ((Math.sin(t * 1.2 + ai + c) + 1) * 12);
      drawCharHSL(clusterChars[c], x, y, 30, 30, lit | 0);
    }
  }

  // ── render Dyson sphere construction ring ───────────────────────
  for (var s = 0; s < SECTOR_COUNT; s++) {
    var ang = (s / SECTOR_COUNT) * Math.PI * 2;
    var fill = sv.sectors[s];
    var x = Math.round(cx + Math.cos(ang) * sphereR);
    var y = Math.round(cy + Math.sin(ang) * sphereR * charAspect);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (fill < 0.001) {
      // Use plain ASCII 'o' so it always renders + bright so it reads.
      drawCharHSL('o', x, y, 220, 70, 55);
      continue;
    }
    var glyphs = ['o', '*', '#', '@'];
    var idx = Math.min(glyphs.length - 1, Math.floor(fill * glyphs.length));
    var hue = (200 + fill * 80 + sv.prestige * 30) % 360;
    var lit = (60 + fill * 30) | 0;
    drawCharHSL(glyphs[idx], x, y, hue, 95, lit);
  }

  // ── render the central star (drains as sphere fills) ───────────
  var totalFill = 0;
  for (var i = 0; i < SECTOR_COUNT; i++) totalFill += sv.sectors[i];
  totalFill /= SECTOR_COUNT;
  // Star: brightness drops as fill goes up; pulses always.
  var pulse = Math.sin(t * 4) * 0.15 + 0.85;
  var starLit = (75 - totalFill * 45) * pulse;
  var starHue = 50 + sv.starHueShift + sv.prestige * 20;
  // 5-char star burst pattern
  var pattern = [
    [0, 0, '●'], [-1, 0, '─'], [1, 0, '─'], [0, -1, '│'], [0, 1, '│'],
    [-1, -1, '╲'], [1, 1, '╲'], [-1, 1, '╱'], [1, -1, '╱'],
  ];
  for (var i = 0; i < pattern.length; i++) {
    var x = Math.round(cx + pattern[i][0]);
    var y = Math.round(cy + pattern[i][1]);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    drawCharHSL(pattern[i][2], x, y, starHue % 360, 95, starLit | 0);
  }

  // ── render drones — plain ASCII so they always render bright ────
  for (var i = 0; i < sv.drones.length; i++) {
    var d = sv.drones[i];
    if (d.needsPlacement) continue;
    var x = Math.round(d.x);
    var y = Math.round(d.y);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    var glyph = d.phase === 'mining' ? '*' : (d.mined ? '+' : '!');
    var lit = d.phase === 'mining' ? 80 : 75;
    drawCharHSL(glyph, x, y, d.hue, 100, lit);
  }

  // ── HUD ─────────────────────────────────────────────────────────
  var hud = 'resources: ' + sv.resources.toLocaleString() + '   drones: ' + sv.drones.length + '/' + MAX_DRONES + '   tier: ' + sv.prestige;
  for (var i = 0; i < hud.length && i < W; i++) {
    drawCharHSL(hud[i], 1 + i, 0, 200, 20, 70);
  }
  var bar = '';
  var fillWidth = Math.min(W - 4, 40);
  var filled = (totalFill * fillWidth) | 0;
  for (var i = 0; i < fillWidth; i++) {
    var ch = i < filled ? '█' : '░';
    var hue = i < filled ? (200 + i * 6) : 220;
    var lit = i < filled ? 60 : 25;
    drawCharHSL(ch, 1 + i, 1, hue % 360, 80, lit);
  }
  // pct label
  var pct = Math.floor(totalFill * 100) + '% sphere';
  for (var i = 0; i < pct.length; i++) {
    drawCharHSL(pct[i], 2 + fillWidth + i, 1, 50, 80, 65);
  }

  // ── prestige flash ──────────────────────────────────────────────
  if (sv.prestigeFlash > 0) {
    var alpha = Math.min(1, sv.prestigeFlash / 1.5);
    var msg = 'TIER ' + sv.prestige + ' UNLOCKED';
    var x0 = ((W - msg.length) / 2) | 0;
    var y0 = (H * 0.3) | 0;
    for (var i = 0; i < msg.length; i++) {
      var hue = (50 + i * 12 + t * 60) % 360;
      drawCharHSL(msg[i], x0 + i, y0, hue, 100, (50 + alpha * 40) | 0);
    }
    // burst rings around star
    for (var r = 1; r < 12; r++) {
      var ringAge = (1.5 - sv.prestigeFlash) * 1000 - r * 60;
      if (ringAge < 0) continue;
      var fadeR = Math.max(0, 50 - r * 4);
      var samples = Math.max(20, r * 5);
      for (var s = 0; s < samples; s++) {
        var ang = (s / samples) * Math.PI * 2;
        var px = Math.round(cx + Math.cos(ang) * r);
        var py = Math.round(cy + Math.sin(ang) * r * charAspect);
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        if (Math.random() > 0.5) continue;
        drawCharHSL('+', px, py, (50 + r * 15 + t * 80) % 360, 90, fadeR | 0);
      }
    }
  }
}

registerMode('starvester', { init: initStarvester, render: renderStarvester });
