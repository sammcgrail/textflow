import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var langGrid, langAnts, langW, langH, langRule;
function initLangton() {
  langW = state.COLS; langH = state.ROWS;
  langGrid = new Uint8Array(langW * langH);
  langRule = [1, 0, 1, 1]; // RLLR
  // Start with 3 ants for faster visual development
  langAnts = [
    {x: Math.floor(langW / 2), y: Math.floor(langH / 2), dir: 0},
    {x: Math.floor(langW * 0.3), y: Math.floor(langH * 0.4), dir: 1},
    {x: Math.floor(langW * 0.7), y: Math.floor(langH * 0.6), dir: 2}
  ];
  // Pre-simulate 5000 steps so it's not blank on load
  var numStates = langRule.length;
  for (var s = 0; s < 5000; s++) {
    for (var a = 0; a < langAnts.length; a++) {
      var ant = langAnts[a];
      if (ant.x < 0 || ant.x >= langW || ant.y < 0 || ant.y >= langH) continue;
      var idx = ant.y * langW + ant.x;
      var st = langGrid[idx];
      if (langRule[st]) ant.dir = (ant.dir + 1) & 3;
      else ant.dir = (ant.dir + 3) & 3;
      langGrid[idx] = (st + 1) % numStates;
      if (ant.dir === 0) ant.y--;
      else if (ant.dir === 1) ant.x++;
      else if (ant.dir === 2) ant.y++;
      else ant.x--;
      if (ant.x < 0) ant.x = langW - 1;
      if (ant.x >= langW) ant.x = 0;
      if (ant.y < 0) ant.y = langH - 1;
      if (ant.y >= langH) ant.y = 0;
    }
  }
}
// initLangton(); — called via registerMode
function renderLangton() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (langW !== W || langH !== H) initLangton();
  // Click adds ants
  if (pointer.clicked && state.currentMode === 'langton') {
    pointer.clicked = false;
    var ax = Math.floor(pointer.gx), ay = Math.floor(pointer.gy);
    if (ax >= 0 && ax < W && ay >= 0 && ay < H) {
      langAnts.push({x: ax, y: ay, dir: (Math.random() * 4) | 0});
    }
  }
  // Steps per frame — hold to speed up
  var stepsPerFrame = pointer.down && state.currentMode === 'langton' ? 200 : 50;
  var numStates = langRule.length;
  for (var s = 0; s < stepsPerFrame; s++) {
    for (var a = 0; a < langAnts.length; a++) {
      var ant = langAnts[a];
      if (ant.x < 0 || ant.x >= W || ant.y < 0 || ant.y >= H) continue;
      var idx = ant.y * W + ant.x;
      var st = langGrid[idx];
      // Turn: 1 = right, 0 = left
      if (langRule[st]) {
        ant.dir = (ant.dir + 1) & 3;
      } else {
        ant.dir = (ant.dir + 3) & 3;
      }
      // Cycle state
      langGrid[idx] = (st + 1) % numStates;
      // Move
      if (ant.dir === 0) ant.y--;
      else if (ant.dir === 1) ant.x++;
      else if (ant.dir === 2) ant.y++;
      else ant.x--;
      // Wrap
      if (ant.x < 0) ant.x = W - 1;
      if (ant.x >= W) ant.x = 0;
      if (ant.y < 0) ant.y = H - 1;
      if (ant.y >= H) ant.y = 0;
    }
  }
  // Draw grid
  var hues = [0, 200, 60, 300];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var val = langGrid[y * W + x];
      if (val === 0) continue;
      var bright = 0.3 + val / numStates * 0.7;
      var ri = Math.min(RAMP_DENSE.length - 1, (bright * RAMP_DENSE.length) | 0);
      drawCharHSL(RAMP_DENSE[ri], x, y, hues[val % hues.length], 70, (15 + bright * 40) | 0);
    }
  }
  // Draw ants
  for (var a = 0; a < langAnts.length; a++) {
    var ant = langAnts[a];
    drawChar('@', ant.x, ant.y, 255, 255, 255, 1);
  }
}

registerMode('langton', {
  init: initLangton,
  render: renderLangton,
});
