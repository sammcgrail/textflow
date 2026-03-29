import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidEl = document.createElement('video');
vidEl.muted = true;
vidEl.loop = true;
vidEl.playsInline = true;
vidEl.crossOrigin = 'anonymous';
vidEl.style.display = 'none';
document.body.appendChild(vidEl);

var vidCanvas = document.createElement('canvas');
var vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });
var vidLoaded = false;
var vidPlaying = false;
var vidPaused = false;

function initVidascii() {
  vidPaused = false;
  if (vidLoaded && vidEl.paused) {
    vidEl.play().catch(function(){});
  }
}

// Drop handler for video files


// Click to pause/play

function renderVidascii() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidLoaded) {
    drawFancyLoading('drop video here');
    return;
  }

  // Sample video frame
  var vw = vidEl.videoWidth || 1;
  var vh = vidEl.videoHeight || 1;

  // Size offscreen state.canvas to match grid
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  vidCtx.drawImage(vidEl, 0, 0, W, H);
  var imgData = vidCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      // Perceived brightness
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.02) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      // Use actual video color
      var alpha = Math.max(0.2, Math.min(1, lum * 1.3));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  // Paused indicator
  if (vidPaused) {
    drawString('PAUSED', window.innerWidth, state.NAV_H + 10, 255, 255, 255, 0.25, 'right');
  }
}


function attach_vidascii() {
  state.canvas.addEventListener('dragover', function(e) {
    if (state.currentMode === 'vidascii') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  state.canvas.addEventListener('drop', function(e) {
    if (state.currentMode !== 'vidascii') return;
    e.preventDefault();
    var file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('video/')) return;
    var url = URL.createObjectURL(file);
    vidEl.src = url;
    vidEl.onloadeddata = function() {
      vidLoaded = true;
      vidPaused = false;
      vidEl.play().catch(function(){});
      vidPlaying = true;
    };
  });

  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidascii' || !vidLoaded) return;
    if (vidEl.paused) {
      vidEl.play().catch(function(){});
      vidPaused = false;
    } else {
      vidEl.pause();
      vidPaused = true;
    }
  });

}

registerMode('vidascii', {
  init: initVidascii,
  render: renderVidascii,
  attach: attach_vidascii,
});
