import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// ============================================================
// This Is Fine — KC Green's cartoon dog sitting at a table
// with a coffee cup while the room is engulfed in flames.
// Sampled from the original animated gif. Click to pause/play.
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

function initThisisfine() {
  videoPaused = false;
  if (!videoReady && !videoEl.getAttribute('src')) {
    videoEl.src = '/textflow/static/thisisfine.mp4';
    videoEl.load();
  }
  videoEl.currentTime = 0;
  videoEl.play().catch(function(){});
}

function renderThisisfine() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!videoReady) {
    drawFancyLoading('loading this is fine');
    return;
  }

  if (sampleCanvas.width !== W || sampleCanvas.height !== H) {
    sampleCanvas.width = W;
    sampleCanvas.height = H;
  }

  sampleCtx.drawImage(videoEl, 0, 0, W, H);
  var imgData = sampleCtx.getImageData(0, 0, W, H).data;

  // Cartoon source has bright flat fill — raise the luminance floor so
  // we don't paint the white speech-bubble pixels as noisy dim chars.
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.05) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      var alpha = Math.max(0.35, Math.min(1, lum * 1.2));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  if (videoPaused) {
    drawChar('|', 2, 1, 255, 255, 255, 0.7);
    drawChar('|', 4, 1, 255, 255, 255, 0.7);
  }
}

function attachThisisfine() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'thisisfine') return;
    if (videoEl.paused) {
      videoEl.play().catch(function(){});
      videoPaused = false;
    } else {
      videoEl.pause();
      videoPaused = true;
    }
  });
}

registerMode('thisisfine', {
  init: initThisisfine,
  render: renderThisisfine,
  attach: attachThisisfine,
});
