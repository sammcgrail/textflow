import { RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var stormBolts, stormFlash, stormCloud, stormGlow, stormW, stormH, stormTimer;
function initStorm() {
  stormW = state.COLS; stormH = state.ROWS;
  stormBolts = [];
  stormFlash = 0;
  stormCloud = new Float32Array(stormW);
  stormGlow = new Float32Array(stormW * stormH);
  stormTimer = 0;
  // Init cloud layer
  for (var x = 0; x < stormW; x++) {
    stormCloud[x] = 0.3 + Math.random() * 0.7;
  }
}
// initStorm(); — called via registerMode
function stormGenBolt(startX, startY) {
  var points = [{x: startX, y: startY}];
  var x = startX, y = startY;
  var branches = [];
  while (y < stormH - 1) {
    y += 1 + Math.random() * 0.5;
    x += (Math.random() - 0.5) * 3;
    points.push({x: x | 0, y: y | 0});
    // Branch randomly
    if (Math.random() < 0.15 && branches.length < 4) {
      var bx = x, by = y;
      var branchPts = [{x: bx | 0, y: by | 0}];
      for (var b = 0; b < 5 + Math.random() * 8; b++) {
        by += 1 + Math.random() * 0.5;
        bx += (Math.random() - 0.5) * 4;
        branchPts.push({x: bx | 0, y: by | 0});
      }
      branches.push(branchPts);
    }
  }
  return {points: points, branches: branches, age: 0, maxAge: 0.4 + Math.random() * 0.3};
}

function renderStorm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (stormW !== W || stormH !== H) initStorm();
  stormTimer += 0.016;
  // Decay glow
  for (var i = 0; i < stormGlow.length; i++) stormGlow[i] *= 0.85;
  // Spawn bolts periodically or on click
  if (Math.random() < 0.06 || (pointer.clicked && state.currentMode === 'storm')) {
    var sx = pointer.down && state.currentMode === 'storm' ? pointer.gx : Math.random() * W;
    stormBolts.push(stormGenBolt(sx | 0, 3));
    stormFlash = 1;
  }
  // Update cloud noise
  for (var x = 0; x < W; x++) {
    stormCloud[x] = 0.3 + Math.sin(x * 0.1 + state.time * 0.5) * 0.2 + Math.sin(x * 0.23 + state.time * 0.3) * 0.15;
  }
  // Draw clouds (top rows)
  var cloudRows = Math.min(5, H);
  for (var y = 0; y < cloudRows; y++) {
    for (var x = 0; x < W; x++) {
      var v = stormCloud[x] * (1 - y / cloudRows);
      if (v < 0.02) continue;
      var ch = RAMP_SOFT[Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length) | 0)];
      var flash = stormFlash * 0.5;
      var bright = (30 + v * 40 + flash * 50) | 0;
      drawCharHSL(ch, x, y, 230, 30, bright);
    }
  }
  // Update and draw bolts
  for (var b = stormBolts.length - 1; b >= 0; b--) {
    var bolt = stormBolts[b];
    bolt.age += 0.016;
    if (bolt.age > bolt.maxAge) { stormBolts.splice(b, 1); continue; }
    var fade = 1 - bolt.age / bolt.maxAge;
    // Draw main bolt
    for (var p = 0; p < bolt.points.length; p++) {
      var pt = bolt.points[p];
      if (pt.x >= 0 && pt.x < W && pt.y >= 0 && pt.y < H) {
        stormGlow[pt.y * W + pt.x] = Math.min(1, stormGlow[pt.y * W + pt.x] + fade);
        var ch = bolt.age < 0.05 ? '#' : (fade > 0.5 ? '|' : ':');
        drawChar(ch, pt.x, pt.y, (200 + fade * 55) | 0, (200 + fade * 55) | 0, 255, fade);
      }
    }
    // Draw branches
    for (var br = 0; br < bolt.branches.length; br++) {
      var branch = bolt.branches[br];
      for (var p = 0; p < branch.length; p++) {
        var pt = branch[p];
        if (pt.x >= 0 && pt.x < W && pt.y >= 0 && pt.y < H) {
          stormGlow[pt.y * W + pt.x] = Math.min(1, stormGlow[pt.y * W + pt.x] + fade * 0.5);
          drawChar(':', pt.x, pt.y, 150, 180, 255, fade * 0.7);
        }
      }
    }
  }
  // Draw afterglow
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = stormGlow[y * W + x];
      if (v < 0.05) continue;
      var ri = Math.min(RAMP_SOFT.length - 1, (v * RAMP_SOFT.length * 0.5) | 0);
      drawChar(RAMP_SOFT[ri], x, y, 100, 120, (180 + v * 75) | 0, v * 0.4);
    }
  }
  // Flash decay
  stormFlash *= 0.85;
}

registerMode('storm', {
  init: initStorm,
  render: renderStorm,
});
