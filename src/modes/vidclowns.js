import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidClownsEl = document.createElement('video');
vidClownsEl.muted = true;
vidClownsEl.loop = true;
vidClownsEl.playsInline = true;
vidClownsEl.crossOrigin = 'anonymous';
vidClownsEl.style.display = 'none';
document.body.appendChild(vidClownsEl);

var vidClownsCanvas = document.createElement('canvas');
var vidClownsCtx = vidClownsCanvas.getContext('2d', { willReadFrequently: true });
var vidClownsReady = false;
var vidClownsPaused = false;

vidClownsEl.onloadeddata = function() { vidClownsReady = true; };

function initVidclowns() {
  vidClownsPaused = false;
  if (!vidClownsReady && !vidClownsEl.getAttribute('src')) {
    vidClownsEl.src = '/textflow/static/clowns.mp4';
    vidClownsEl.load();
  }
  vidClownsEl.currentTime = 0;
  vidClownsEl.play().catch(function(){});
}


function renderVidclowns() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidClownsReady) {
    drawFancyLoading('loading clowns');
    return;
  }

  if (vidClownsCanvas.width !== W || vidClownsCanvas.height !== H) {
    vidClownsCanvas.width = W;
    vidClownsCanvas.height = H;
  }

  vidClownsCtx.drawImage(vidClownsEl, 0, 0, W, H);
  var imgData = vidClownsCtx.getImageData(0, 0, W, H).data;

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

  if (vidClownsPaused) {
    drawString('PAUSED', window.innerWidth, state.NAV_H + 10, 255, 255, 255, 0.25, 'right');
  }
}


function attach_vidclowns() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidclowns') return;
    if (vidClownsEl.paused) {
      vidClownsEl.play().catch(function(){});
      vidClownsPaused = false;
    } else {
      vidClownsEl.pause();
      vidClownsPaused = true;
    }
  });

}

registerMode('vidclowns', {
  init: initVidclowns,
  render: renderVidclowns,
  attach: attach_vidclowns,
});
