import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// ============================================================
// Dancing Baby — the 90s "Oogachaka" 3D-rendered baby that
// went around every corporate email inbox in 1996. Sourced
// from Internet Archive's OogachakaBaby collection.
// Click to pause/play.
// ============================================================

var videoEl = document.createElement('video');
videoEl.muted = true;
videoEl.loop = true;
videoEl.playsInline = true;
videoEl.crossOrigin = 'anonymous';
videoEl.style.display = 'none';
document.body.appendChild(videoEl);

var sampleCanvas = document.createElement('canvas');
var sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
var videoReady = false;
var videoPaused = false;

videoEl.onloadeddata = function() { videoReady = true; };

function initBabydance() {
  videoPaused = false;
  if (!videoReady && !videoEl.getAttribute('src')) {
    videoEl.src = '/textflow/static/babydance.mp4';
    videoEl.load();
  }
  videoEl.currentTime = 0;
  videoEl.play().catch(function(){});
}

function renderBabydance() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!videoReady) {
    drawFancyLoading('loading dancing baby');
    return;
  }

  if (sampleCanvas.width !== W || sampleCanvas.height !== H) {
    sampleCanvas.width = W;
    sampleCanvas.height = H;
  }

  sampleCtx.drawImage(videoEl, 0, 0, W, H);
  var imgData = sampleCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Source renders on near-black so most of the frame is background.
      // Skip deep-black pixels entirely to keep the baby silhouetted.
      if (lum < 0.08) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      // Warm-tint baby — bias the sampled grey flesh-tone toward peach so
      // it reads as a baby and not a clay statue.
      var tr = Math.min(255, r + 30);
      var tg = Math.min(255, g + 8);
      var tb = Math.max(0, b - 10);
      var alpha = Math.max(0.3, Math.min(1, lum * 1.3));
      drawChar(ch, x, y, tr, tg, tb, alpha);
    }
  }

  if (videoPaused) {
    drawChar('|', 2, 1, 255, 255, 255, 0.7);
    drawChar('|', 4, 1, 255, 255, 255, 0.7);
  }
}

function attachBabydance() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'babydance') return;
    if (videoEl.paused) {
      videoEl.play().catch(function(){});
      videoPaused = false;
    } else {
      videoEl.pause();
      videoPaused = true;
    }
  });
}

registerMode('babydance', {
  init: initBabydance,
  render: renderBabydance,
  attach: attachBabydance,
});
