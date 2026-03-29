import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidCowEl = document.createElement('video');
vidCowEl.muted = true;
vidCowEl.loop = true;
vidCowEl.playsInline = true;
vidCowEl.crossOrigin = 'anonymous';
vidCowEl.style.display = 'none';
document.body.appendChild(vidCowEl);

var vidCowCanvas = document.createElement('canvas');
var vidCowCtx = vidCowCanvas.getContext('2d', { willReadFrequently: true });
var vidCowReady = false;
var vidCowPaused = false;

vidCowEl.onloadeddata = function() { vidCowReady = true; };

function initVidcow() {
  vidCowPaused = false;
  if (!vidCowReady && !vidCowEl.getAttribute('src')) {
    vidCowEl.src = '/textflow/static/strawberry-cow.mp4';
    vidCowEl.load();
  }
  vidCowEl.currentTime = 0;
  vidCowEl.play().catch(function(){});
}

// Click to pause/play

function renderVidcow() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidCowReady) {
    drawFancyLoading('loading strawberry cow');
    return;
  }

  if (vidCowCanvas.width !== W || vidCowCanvas.height !== H) {
    vidCowCanvas.width = W;
    vidCowCanvas.height = H;
  }

  vidCowCtx.drawImage(vidCowEl, 0, 0, W, H);
  var imgData = vidCowCtx.getImageData(0, 0, W, H).data;

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

  if (vidCowPaused) {
    drawString('PAUSED', window.innerWidth - 60, state.NAV_H + 10, 255, 255, 255, 0.25);
  }
}


function attach_vidcow() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidcow') return;
    if (vidCowEl.paused) {
      vidCowEl.play().catch(function(){});
      vidCowPaused = false;
    } else {
      vidCowEl.pause();
      vidCowPaused = true;
    }
  });

}

registerMode('vidcow', {
  init: initVidcow,
  render: renderVidcow,
  attach: attach_vidcow,
});
