import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidScenesEl = document.createElement('video');
vidScenesEl.muted = true;
vidScenesEl.loop = true;
vidScenesEl.playsInline = true;
vidScenesEl.crossOrigin = 'anonymous';
vidScenesEl.style.display = 'none';
document.body.appendChild(vidScenesEl);

var vidScenesCanvas = document.createElement('canvas');
var vidScenesCtx = vidScenesCanvas.getContext('2d', { willReadFrequently: true });
var vidScenesReady = false;
var vidScenesPaused = false;

vidScenesEl.onloadeddata = function() { vidScenesReady = true; };

function initVidscenes() {
  vidScenesPaused = false;
  if (!vidScenesReady && !vidScenesEl.getAttribute('src')) {
    vidScenesEl.src = '/textflow/static/scenes.mp4';
    vidScenesEl.load();
  }
  vidScenesEl.currentTime = 0;
  vidScenesEl.play().catch(function(){});
}


function renderVidscenes() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidScenesReady) {
    drawFancyLoading('loading scenes');
    return;
  }

  if (vidScenesCanvas.width !== W || vidScenesCanvas.height !== H) {
    vidScenesCanvas.width = W;
    vidScenesCanvas.height = H;
  }

  vidScenesCtx.drawImage(vidScenesEl, 0, 0, W, H);
  var imgData = vidScenesCtx.getImageData(0, 0, W, H).data;

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

  if (vidScenesPaused) {
    state.ctx.fillStyle = 'rgba(255,255,255,0.25)';
    state.ctx.font = '9px "JetBrains Mono", monospace';
    state.ctx.textAlign = 'right';
    state.ctx.fillText('PAUSED', window.innerWidth - 10, state.NAV_H + 10);
    state.ctx.textAlign = 'left';
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  }
}


function attach_vidscenes() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidscenes') return;
    if (vidScenesEl.paused) {
      vidScenesEl.play().catch(function(){});
      vidScenesPaused = false;
    } else {
      vidScenesEl.pause();
      vidScenesPaused = true;
    }
  });

}

registerMode('vidscenes', {
  init: initVidscenes,
  render: renderVidscenes,
  attach: attach_vidscenes,
});
