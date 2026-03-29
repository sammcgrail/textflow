import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var conStars, conW, conH;
function initConstellations() {
  conW = state.COLS; conH = state.ROWS;
  conStars = [];
  for (var i = 0; i < 80; i++) {
    conStars.push({ x: Math.random() * conW, y: Math.random() * conH, bright: 0.3 + Math.random() * 0.7, twinkle: Math.random() * 6.28 });
  }
}
function renderConstellations() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!conStars || conW !== W || conH !== H) initConstellations();
  var t = state.time;
  // Draw connections between nearby stars
  for (var i = 0; i < conStars.length; i++) {
    for (var j = i + 1; j < conStars.length; j++) {
      var dx = conStars[i].x - conStars[j].x, dy = conStars[i].y - conStars[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 15) continue;
      // Draw line
      var steps = (d * 1.5) | 0;
      for (var s = 1; s < steps; s++) {
        var frac = s / steps;
        var lx = (conStars[i].x + (conStars[j].x - conStars[i].x) * frac) | 0;
        var ly = (conStars[i].y + (conStars[j].y - conStars[i].y) * frac) | 0;
        if (lx >= 0 && lx < W && ly >= 0 && ly < H) {
          drawCharHSL('-', lx, ly, 220, 30, 12);
        }
      }
    }
  }
  // Highlight nearest star to pointer
  var nearIdx = -1, nearDist = 999;
  if (pointer.gx >= 0 && pointer.gy >= 0) {
    for (var i = 0; i < conStars.length; i++) {
      var dx = conStars[i].x - pointer.gx, dy = conStars[i].y - pointer.gy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearDist) { nearDist = d; nearIdx = i; }
    }
  }
  // Draw stars
  for (var i = 0; i < conStars.length; i++) {
    var s = conStars[i];
    var ix = s.x | 0, iy = s.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var twinkle = Math.sin(t * 2 + s.twinkle) * 0.2 + 0.8;
    var b = s.bright * twinkle;
    var hue = i === nearIdx ? 60 : 220;
    var light = i === nearIdx ? 60 : (15 + b * 40) | 0;
    var ch = b > 0.8 ? '*' : b > 0.5 ? '+' : '.';
    drawCharHSL(ch, ix, iy, hue, i === nearIdx ? 80 : 20, light);
  }
  // Background dim stars
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 3) {
      var hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      if ((hash - (hash | 0)) > 0.97) drawCharHSL('.', x, y, 0, 0, 8);
    }
  }
}
registerMode('constellations', { init: initConstellations, render: renderConstellations });
