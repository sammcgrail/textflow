import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var drops = [];
var MAX_DROPS = 180;

function initRain() {
  drops = [];
  for (var i = 0; i < MAX_DROPS; i++) {
    var d = {
      x: Math.floor(Math.random() * state.COLS),
      y: Math.random() * state.ROWS * 2 - state.ROWS,
      speed: 0.3 + Math.random() * 0.8,
      len: 4 + Math.floor(Math.random() * 12),
      chars: []
    };
    for (var j = 0; j < d.len; j++) {
      d.chars.push('!@#$%^&*()_+-=[]{}|;:<>?/~0123456789abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 62)));
    }
    drops.push(d);
  }
}
// initRain(); — called via registerMode
// Rain interaction: click to attract drops toward cursor
var rainAttractX = -1, rainAttractY = -1;

function renderRain() {
  clearCanvas();

  // Click attracts drops
  if (pointer.down && state.currentMode === 'rain') {
    rainAttractX = pointer.gx; rainAttractY = pointer.gy;
  }

  var bright = new Float32Array(state.COLS * state.ROWS);
  var charGrid = new Array(state.COLS * state.ROWS);

  for (var i = 0; i < drops.length; i++) {
    var d = drops[i];
    d.y += d.speed;

    // Attract toward click point
    if (rainAttractX >= 0) {
      var dx = rainAttractX - d.x;
      var dist = Math.abs(dx);
      if (dist < 20) d.x += dx * 0.03;
    }

    if (d.y - d.len > state.ROWS) {
      d.y = -d.len;
      d.x = Math.floor(Math.random() * state.COLS);
      d.speed = 0.3 + Math.random() * 0.8;
    }
    if (Math.random() < 0.08) {
      d.chars[Math.floor(Math.random() * d.len)] = '!@#$%^&*()_+-=[]{}|;:<>?/~0123456789abcdefghijklmnopqrstuvwxyz'.charAt(Math.floor(Math.random() * 62));
    }
    for (var j = 0; j < d.len; j++) {
      var ty = (d.y - j) | 0;
      if (ty >= 0 && ty < state.ROWS && d.x >= 0 && d.x < state.COLS) {
        var fade = 1 - j / d.len;
        var idx = ty * state.COLS + (d.x | 0);
        if (idx >= 0 && idx < state.COLS * state.ROWS && fade > bright[idx]) {
          charGrid[idx] = d.chars[j];
          bright[idx] = fade;
        }
      }
    }
  }

  // Fade attraction
  if (!pointer.down) rainAttractX = -1;

  for (var y = 0; y < state.ROWS; y++) {
    for (var x = 0; x < state.COLS; x++) {
      var idx = y * state.COLS + x;
      var b = bright[idx];
      if (b < 0.01) continue;
      var ch = charGrid[idx];
      if (b > 0.95) {
        drawChar(ch, x, y, 180, 255, 200, 1);
      } else {
        var g = (80 + b * 175) | 0;
        drawChar(ch, x, y, 0, g, (g * 0.4) | 0, 0.2 + b * 0.8);
      }
    }
  }
}

registerMode('rain', {
  init: initRain,
  render: renderRain,
});
