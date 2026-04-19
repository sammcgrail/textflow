// vegas — the "Welcome to Fabulous Las Vegas Nevada" sign, rendered from
// an actual high-def video converted to ASCII in real time.
import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vegasEl = document.createElement('video');
vegasEl.muted = true;
vegasEl.loop = true;
vegasEl.playsInline = true;
vegasEl.crossOrigin = 'anonymous';
vegasEl.style.display = 'none';
document.body.appendChild(vegasEl);

var vegasCanvas = document.createElement('canvas');
var vegasCtx = vegasCanvas.getContext('2d', { willReadFrequently: true });
var vegasReady = false;
var vegasPaused = false;

vegasEl.onloadeddata = function () { vegasReady = true; };

function initVegas() {
  vegasPaused = false;
  if (!vegasReady && !vegasEl.getAttribute('src') && !vegasEl.querySelector('source')) {
    // Use <source> fallbacks: WebM/VP9 first (Firefox-friendly, no proprietary codec),
    // MP4/H264 fallback for browsers that prefer it.
    var webm = document.createElement('source');
    webm.src = '/textflow/static/vegas.webm';
    webm.type = 'video/webm';
    var mp4 = document.createElement('source');
    mp4.src = '/textflow/static/vegas.mp4';
    mp4.type = 'video/mp4';
    vegasEl.appendChild(webm);
    vegasEl.appendChild(mp4);
    vegasEl.load();
  }
  vegasEl.currentTime = 0;
  vegasEl.play().catch(function () {});
}

function renderVegas() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Check readyState directly — more reliable than event flag for cross-codec fallback
  if (!vegasReady && vegasEl.readyState >= 2) vegasReady = true;
  if (!vegasReady || vegasEl.readyState < 2) {
    drawFancyLoading('loading vegas');
    return;
  }

  if (vegasCanvas.width !== W || vegasCanvas.height !== H) {
    vegasCanvas.width = W;
    vegasCanvas.height = H;
  }

  // Draw video into the off-screen canvas sized to the ASCII grid
  vegasCtx.drawImage(vegasEl, 0, 0, W, H);
  var imgData = vegasCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.04) continue;

      // Pump saturation so the neon colors punch
      var maxC = Math.max(r, g, b);
      var boost = maxC > 0 ? 255 / maxC : 1;
      var br = Math.min(255, r * boost * 0.75 + r * 0.25);
      var bg = Math.min(255, g * boost * 0.75 + g * 0.25);
      var bb = Math.min(255, b * boost * 0.75 + b * 0.25);

      // Pick glyph density from brightness
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      var alpha = Math.max(0.3, Math.min(1, lum * 1.6));
      drawChar(ch, x, y, br | 0, bg | 0, bb | 0, alpha);
    }
  }

  if (vegasPaused) {
    drawString('PAUSED', window.innerWidth, state.NAV_H + 10, 255, 255, 255, 0.25, 'right');
  }
}

function attach_vegas() {
  state.canvas.addEventListener('click', function () {
    if (state.currentMode !== 'vegas') return;
    if (vegasEl.paused) {
      vegasEl.play().catch(function () {});
      vegasPaused = false;
    } else {
      vegasEl.pause();
      vegasPaused = true;
    }
  });
}

registerMode('vegas', {
  init: initVegas,
  render: renderVegas,
  attach: attach_vegas,
});
