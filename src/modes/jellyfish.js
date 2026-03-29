import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var jfList;
function initJellyfish() {
  jfList = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 6; i++) {
    jfList.push({ x: Math.random() * W, y: Math.random() * H, size: 3 + Math.random() * 4, hue: (Math.random() * 360) | 0, phase: Math.random() * Math.PI * 2 });
  }
}
function renderJellyfish() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!jfList) initJellyfish();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'jellyfish') {
    pointer.clicked = false;
    jfList.push({ x: pointer.gx, y: pointer.gy, size: 3 + Math.random() * 4, hue: (Math.random() * 360) | 0, phase: t });
    if (jfList.length > 12) jfList.splice(0, 1);
  } else if (pointer.down && state.currentMode === 'jellyfish') {
    // Jellyfish drift toward pointer
    for (var i = 0; i < jfList.length; i++) {
      var j = jfList[i];
      j.x += (pointer.gx - j.x) * 0.01;
      j.y += (pointer.gy - j.y) * 0.01;
    }
  }
  // Water particles
  for (var i = 0; i < 40; i++) {
    var wx = (Math.sin(i * 3.7 + t * 0.3) * 0.5 + 0.5) * W;
    var wy = (Math.sin(i * 2.3 + t * 0.2 + i) * 0.5 + 0.5) * H;
    var px = wx | 0, py = wy | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 200, 30, 6);
  }
  for (var ji = 0; ji < jfList.length; ji++) {
    var j = jfList[ji];
    j.y -= 0.15 + Math.sin(t * 0.5 + j.phase) * 0.1;
    j.x += Math.sin(t * 0.3 + j.phase * 2) * 0.08;
    if (j.y < -j.size * 2) j.y = H + j.size;
    if (j.x < 0) j.x = W; if (j.x >= W) j.x = 0;
    var pulse = Math.sin(t * 2 + j.phase) * 0.3 + 0.7;
    var s = j.size * pulse;
    // Bell
    for (var a = -Math.PI; a < 0; a += 0.15) {
      var bx = (j.x + Math.cos(a) * s) | 0;
      var by = (j.y + Math.sin(a) * s * ar * 0.5) | 0;
      if (bx >= 0 && bx < W && by >= 0 && by < H) {
        drawCharHSL('(', bx, by, j.hue, 60, (20 + pulse * 20) | 0);
      }
    }
    // Fill bell
    for (var dy = (-s * ar * 0.5) | 0; dy <= 0; dy++) {
      var rowW = s * Math.cos(Math.asin(Math.min(1, Math.abs(dy) / (s * ar * 0.5 + 0.1))));
      for (var dx = -rowW; dx <= rowW; dx++) {
        var bx = (j.x + dx) | 0, by = (j.y + dy) | 0;
        if (bx >= 0 && bx < W && by >= 0 && by < H) {
          drawCharHSL('o', bx, by, j.hue, 40, (10 + pulse * 12) | 0);
        }
      }
    }
    // Tentacles
    for (var tn = 0; tn < 5; tn++) {
      var tx = j.x + (tn - 2) * s * 0.4;
      for (var ty = 0; ty < j.size * 2; ty++) {
        var wave = Math.sin(ty * 0.5 + t * 2 + tn + j.phase) * (ty * 0.15);
        var px = (tx + wave) | 0, py = (j.y + ty + 1) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          drawCharHSL(ty % 2 === 0 ? '|' : ':', px, py, (j.hue + ty * 10) % 360, 50, (15 - ty * 0.5) | 0);
        }
      }
    }
  }
}
registerMode('jellyfish', { init: initJellyfish, render: renderJellyfish });
