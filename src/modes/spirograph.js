import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var sgSpiros, sgGrid, sgW, sgH;

function randomSpiro() {
  var neonHues = [320, 180, 100, 25, 280, 60, 200, 350];
  return {
    R: 5 + Math.random() * 15,
    r: 2 + Math.random() * 8,
    d: 1 + Math.random() * 10,
    hue: neonHues[(Math.random() * neonHues.length) | 0],
    phase: Math.random() * Math.PI * 2,
    speed: 0.3 + Math.random() * 0.5
  };
}

function initSpirograph() {
  sgW = state.COLS; sgH = state.ROWS;
  sgGrid = new Float32Array(sgW * sgH * 2); // hue, brightness packed
  sgSpiros = [];
  var count = state.isMobile ? 3 : 5;
  for (var i = 0; i < count; i++) {
    sgSpiros.push(randomSpiro());
  }
}

function renderSpirograph() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var ar = state.CHAR_W / state.CHAR_H;

  if (sgW !== W || sgH !== H) {
    sgW = W; sgH = H;
    sgGrid = new Float32Array(W * H * 2);
  }

  if (pointer.clicked && state.currentMode === 'spirograph') {
    pointer.clicked = false;
    sgGrid = new Float32Array(W * H * 2);
    sgSpiros = [];
    var count = state.isMobile ? 3 : 5;
    for (var i = 0; i < count; i++) {
      sgSpiros.push(randomSpiro());
    }
  }

  // Fade existing trails slightly
  for (var i = 0; i < sgGrid.length; i += 2) {
    if (sgGrid[i + 1] > 0) sgGrid[i + 1] *= 0.998;
  }

  var cx = W * 0.5, cy = H * 0.5;
  var scale = Math.min(W * 0.03, H * 0.06);

  // Draw new points for each spirograph
  var stepsPerFrame = state.isMobile ? 30 : 60;
  for (var s = 0; s < sgSpiros.length; s++) {
    var sp = sgSpiros[s];
    var R = sp.R, r = sp.r, d = sp.d;
    var diff = R - r;
    for (var i = 0; i < stepsPerFrame; i++) {
      var angle = t * sp.speed + sp.phase + i * 0.02;
      var px = (cx + (diff * Math.cos(angle) + d * Math.cos(diff / r * angle)) * scale / ar) | 0;
      var py = (cy + (diff * Math.sin(angle) - d * Math.sin(diff / r * angle)) * scale) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var idx = (py * W + px) * 2;
        sgGrid[idx] = sp.hue;
        sgGrid[idx + 1] = 1;
      }
    }
  }

  // Render grid
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = (y * W + x) * 2;
      var bright = sgGrid[idx + 1];
      if (bright < 0.05) continue;
      var hue = sgGrid[idx];
      var v = bright;
      var ch = v > 0.8 ? '@' : v > 0.5 ? '#' : v > 0.3 ? '*' : '.';
      var sat = 90 + v * 10;
      var lit = 45 + v * 25;
      drawCharHSL(ch, x, y, (hue + t * 10) % 360 | 0, sat | 0, lit | 0);
    }
  }
}

registerMode('spirograph', { init: initSpirograph, render: renderSpirograph });
