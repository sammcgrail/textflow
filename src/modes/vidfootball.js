import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidFootballEl = document.createElement('video');
vidFootballEl.muted = true;
vidFootballEl.loop = true;
vidFootballEl.playsInline = true;
vidFootballEl.crossOrigin = 'anonymous';
vidFootballEl.style.display = 'none';
document.body.appendChild(vidFootballEl);

var vidFootballCanvas = document.createElement('canvas');
var vidFootballCtx = vidFootballCanvas.getContext('2d', { willReadFrequently: true });
var vidFootballReady = false;
var vidFootballPaused = false;

vidFootballEl.onloadeddata = function() { vidFootballReady = true; };

function initVidfootball() {
  vidFootballPaused = false;
  if (!vidFootballReady && !vidFootballEl.getAttribute('src')) {
    vidFootballEl.src = '/textflow/static/football.mp4';
    vidFootballEl.load();
  }
  vidFootballEl.currentTime = 0;
  vidFootballEl.play().catch(function(){});
}


function renderVidfootball() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidFootballReady) {
    drawFancyLoading('loading football');
    return;
  }

  if (vidFootballCanvas.width !== W || vidFootballCanvas.height !== H) {
    vidFootballCanvas.width = W;
    vidFootballCanvas.height = H;
  }

  vidFootballCtx.drawImage(vidFootballEl, 0, 0, W, H);
  var imgData = vidFootballCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.02) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      var alpha = Math.max(0.2, Math.min(1, lum * 1.3));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  if (vidFootballPaused) {
    state.ctx.fillStyle = 'rgba(255,255,255,0.25)';
    state.ctx.font = '9px "JetBrains Mono", monospace';
    state.ctx.textAlign = 'right';
    state.ctx.fillText('PAUSED', window.innerWidth - 10, state.NAV_H + 10);
    state.ctx.textAlign = 'left';
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  }
}


function attach_vidfootball() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidfootball') return;
    if (vidFootballEl.paused) {
      vidFootballEl.play().catch(function(){});
      vidFootballPaused = false;
    } else {
      vidFootballEl.pause();
      vidFootballPaused = true;
    }
  });

}

registerMode('vidfootball', {
  init: initVidfootball,
  render: renderVidfootball,
  attach: attach_vidfootball,
});
