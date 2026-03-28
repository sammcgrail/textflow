import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var snowFlakes, snowCount, snowW, snowH, snowGround;
function initSnowfall() {
  snowW = state.COLS; snowH = state.ROWS;
  snowCount = state.isMobile ? 150 : 300;
  snowFlakes = [];
  snowGround = new Uint8Array(snowW);
  for (var i = 0; i < snowCount; i++) {
    snowFlakes.push({
      x: Math.random() * snowW,
      y: Math.random() * snowH,
      speed: 1 + Math.random() * 3,
      size: Math.random()
    });
  }
}
// initSnowfall(); — called via registerMode
function renderSnowfall() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (snowW !== W || snowH !== H) initSnowfall();
  var wind = Math.sin(state.time * 0.3) * 2;
  if (pointer.down && state.currentMode === 'snowfall') {
    wind += (pointer.gx - W * 0.5) * 0.1;
  }
  for (var i = 0; i < snowCount; i++) {
    var f = snowFlakes[i];
    f.y += f.speed * 0.016 * 30;
    f.x += (wind + Math.sin(state.time * 2 + i) * 0.5) * 0.016 * 15;
    if (f.x < 0) f.x += W;
    if (f.x >= W) f.x -= W;
    var gx = f.x | 0;
    if (gx >= 0 && gx < W && f.y >= H - 1 - snowGround[gx]) {
      if (snowGround[gx] < H * 0.3) snowGround[gx]++;
      f.y = -1;
      f.x = Math.random() * W;
      continue;
    }
    if (f.y >= H) { f.y = -1; f.x = Math.random() * W; continue; }
    var ix = f.x | 0, iy = f.y | 0;
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) continue;
    var ch = f.size < 0.3 ? '.' : (f.size < 0.6 ? '*' : '#');
    var b = (180 + f.size * 75) | 0;
    drawChar(ch, ix, iy, b, b, 255, 0.7 + f.size * 0.3);
  }
  // Draw ground
  for (var x = 0; x < W; x++) {
    for (var g = 0; g < snowGround[x]; g++) {
      var gy = H - 1 - g;
      if (gy < 0) break;
      var v = 1 - g / (H * 0.3);
      drawChar('#', x, gy, 200, 210, 230, v);
    }
  }
}

registerMode('snowfall', {
  init: initSnowfall,
  render: renderSnowfall,
});
