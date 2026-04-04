import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var wvSources, wvW, wvH;
function initWavelet() {
  wvW = state.COLS; wvH = state.ROWS;
  wvSources = [
    {x: wvW * 0.3, y: wvH * 0.4, freq: 0.15, phase: 0},
    {x: wvW * 0.7, y: wvH * 0.3, freq: 0.2, phase: 1.5},
    {x: wvW * 0.5, y: wvH * 0.7, freq: 0.12, phase: 3.0},
    {x: wvW * 0.2, y: wvH * 0.8, freq: 0.18, phase: 4.5}
  ];
}
function renderWavelet() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!wvSources || wvW !== W || wvH !== H) initWavelet();
  var ar = state.CHAR_W / state.CHAR_H;
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'wavelet') {
    pointer.clicked = false;
    var gx = pointer.gx, gy = pointer.gy;
    wvSources.push({x: gx, y: gy, freq: 0.1 + Math.random() * 0.15, phase: t * 2});
  } else if (pointer.down && state.currentMode === 'wavelet') {
    var gx = pointer.gx, gy = pointer.gy;
    var best = -1, bestD = 9999;
    for (var i = 0; i < wvSources.length; i++) {
      var dx = wvSources[i].x - gx, dy = wvSources[i].y - gy;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { wvSources[best].x = gx; wvSources[best].y = gy; }
  }
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      for (var i = 0; i < wvSources.length; i++) {
        var s = wvSources[i];
        var dx = (x - s.x) * ar, dy = y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        sum += Math.sin(dist * s.freq * 6.28 - t * 2 + s.phase);
      }
      var norm = (sum / wvSources.length + 1) * 0.5;
      var ri = (norm * (RAMP_DENSE.length - 1)) | 0;
      if (ri < 1) continue;
      var hue = ((norm * 360 + t * 30) % 360) | 0;
      var lit = (12 + norm * 40) | 0;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 75, lit);
    }
  }
}
registerMode('wavelet', { init: initWavelet, render: renderWavelet });
