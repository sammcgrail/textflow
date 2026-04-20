import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// ============================================================
// Nyan Cat — the canonical 8-bit cat-pop-tart looping through
// space with the rainbow trail. Sampled from the original gif
// and mapped into VA_RAMP characters preserving color.
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

function initNyancat() {
  videoPaused = false;
  if (!videoReady && !videoEl.getAttribute('src')) {
    videoEl.src = '/textflow/static/nyancat.mp4';
    videoEl.load();
  }
  videoEl.currentTime = 0;
  videoEl.play().catch(function(){});
}

function renderNyancat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!videoReady) {
    drawFancyLoading('loading nyan cat');
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
      // The nyan gif has a near-black starfield background; lift the
      // threshold a touch so the dimmest stars still sample in.
      if (lum < 0.06) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      // Nyan's palette is saturated (pop-tart pink, rainbow bands) — pass
      // raw RGB through so the ramp chars inherit the video's color.
      var alpha = Math.max(0.3, Math.min(1, lum * 1.25));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  if (videoPaused) {
    drawChar('|', 2, 1, 255, 255, 255, 0.7);
    drawChar('|', 4, 1, 255, 255, 255, 0.7);
  }
}

function attachNyancat() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'nyancat') return;
    if (videoEl.paused) {
      videoEl.play().catch(function(){});
      videoPaused = false;
    } else {
      videoEl.pause();
      videoPaused = true;
    }
  });
}

registerMode('nyancat', {
  init: initNyancat,
  render: renderNyancat,
  attach: attachNyancat,
});
