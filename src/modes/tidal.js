import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var tdFoam;
function initTidal() { tdFoam = []; }
function renderTidal() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!tdFoam) initTidal();
  var t = state.time;
  var shoreY = (H * 0.6) | 0;
  var tideX = 0;
  if (pointer.clicked && state.currentMode === 'tidal') {
    pointer.clicked = false;
    // Big wave
    for (var i = 0; i < 30; i++) tdFoam.push({ x: Math.random() * W, y: shoreY + (Math.random() - 0.5) * 4, life: 1, hue: 200 });
  } else if (pointer.down && state.currentMode === 'tidal') {
    tideX = (pointer.gx / W - 0.5) * 10;
  }
  // Sky gradient
  for (var y = 0; y < shoreY - 3; y++) {
    var skyV = y / (shoreY - 3);
    for (var x = 0; x < W; x++) {
      var n = Math.sin(x * 0.1 + y * 0.2 + t * 0.05) * 0.1;
      if (skyV + n > 0.7) drawCharHSL('.', x, y, 210, 20, 3);
    }
  }
  // Ocean
  var wavePhase = t * 0.8 + tideX;
  for (var y = 0; y < shoreY; y++) {
    var depth = (shoreY - y) / shoreY;
    for (var x = 0; x < W; x++) {
      var wave = Math.sin(x * 0.05 - wavePhase + y * 0.1) * 2 + Math.sin(x * 0.12 + wavePhase * 0.7) * 1;
      if (y > shoreY - 5 + wave) {
        var bright = 5 + depth * 10 + Math.sin(x * 0.1 + t * 0.5) * 3;
        drawCharHSL(bright > 10 ? '~' : '.', x, y, 210, 40, bright | 0);
      }
    }
  }
  // Waves crashing on shore
  for (var w = 0; w < 3; w++) {
    var waveY = shoreY + Math.sin(t * 0.5 + w * 2) * 3 + w * 2;
    for (var x = 0; x < W; x++) {
      var wx = Math.sin(x * 0.08 - t * 1.5 + w) * 1.5;
      var py = (waveY + wx) | 0;
      if (py >= 0 && py < H) {
        var foam = Math.sin(x * 0.2 + t * 3 + w * 5) * 0.5 + 0.5;
        if (foam > 0.3) drawCharHSL(foam > 0.6 ? '~' : '.', x, py, 200, 50, (10 + foam * 25) | 0);
      }
    }
  }
  // Beach/sand
  for (var y = shoreY; y < H; y++) {
    var wetness = Math.max(0, 1 - (y - shoreY) * 0.15 - Math.sin(t * 0.3) * 0.3);
    for (var x = 0; x < W; x++) {
      var n = Math.sin(x * 0.3 + y * 0.4) * 0.2 + 0.5;
      var hue = wetness > 0.3 ? 35 : 45;
      var bright = 4 + n * 8 + wetness * 5;
      drawCharHSL(n > 0.5 ? ':' : '.', x, y, hue, 30 + wetness * 20, bright | 0);
    }
  }
  // Foam particles
  if (Math.random() < 0.1) tdFoam.push({ x: Math.random() * W, y: shoreY + Math.sin(t * 0.5) * 2, life: 1 });
  for (var i = tdFoam.length - 1; i >= 0; i--) {
    var f = tdFoam[i];
    f.x += Math.sin(t * 2 + f.x * 0.1) * 0.2;
    f.y += 0.05;
    f.life -= 0.01;
    if (f.life <= 0) { tdFoam.splice(i, 1); continue; }
    var px = f.x | 0, py = f.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('o', px, py, 200, 30, (f.life * 20) | 0);
  }
  if (tdFoam.length > 100) tdFoam.splice(0, tdFoam.length - 100);
}
registerMode('tidal', { init: initTidal, render: renderTidal });
