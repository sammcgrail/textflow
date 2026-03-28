import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var vidNeonEl = document.createElement('video');
vidNeonEl.muted = true;
vidNeonEl.loop = true;
vidNeonEl.playsInline = true;
vidNeonEl.crossOrigin = 'anonymous';
vidNeonEl.style.display = 'none';
document.body.appendChild(vidNeonEl);

var vidNeonCanvas = document.createElement('canvas');
var vidNeonCtx = vidNeonCanvas.getContext('2d', { willReadFrequently: true });
var vidNeonReady = false;
var vidNeonPaused = false;

vidNeonEl.onloadeddata = function() { vidNeonReady = true; };

function initVidneon() {
  vidNeonPaused = false;
  if (!vidNeonReady && !vidNeonEl.getAttribute('src')) {
    vidNeonEl.src = '/textflow/static/neon.mp4';
    vidNeonEl.load();
  }
  vidNeonEl.currentTime = 0;
  vidNeonEl.play().catch(function(){});
}


function renderVidneon() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!vidNeonReady) {
    drawFancyLoading('loading neon');
    return;
  }

  if (vidNeonCanvas.width !== W || vidNeonCanvas.height !== H) {
    vidNeonCanvas.width = W;
    vidNeonCanvas.height = H;
  }

  vidNeonCtx.drawImage(vidNeonEl, 0, 0, W, H);
  var imgData = vidNeonCtx.getImageData(0, 0, W, H).data;

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
      // Boost saturation for neon pop
      var maxC = Math.max(r, g, b);
      var boost = maxC > 0 ? 255 / maxC : 1;
      var br = Math.min(255, r * boost * 0.7 + r * 0.3);
      var bg = Math.min(255, g * boost * 0.7 + g * 0.3);
      var bb = Math.min(255, b * boost * 0.7 + b * 0.3);
      var alpha = Math.max(0.25, Math.min(1, lum * 1.5));
      drawChar(ch, x, y, br | 0, bg | 0, bb | 0, alpha);
    }
  }

  if (vidNeonPaused) {
    state.ctx.fillStyle = 'rgba(255,255,255,0.25)';
    state.ctx.font = '9px "JetBrains Mono", monospace';
    state.ctx.textAlign = 'right';
    state.ctx.fillText('PAUSED', window.innerWidth - 10, state.NAV_H + 10);
    state.ctx.textAlign = 'left';
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  }
}


function attach_vidneon() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidneon') return;
    if (vidNeonEl.paused) {
      vidNeonEl.play().catch(function(){});
      vidNeonPaused = false;
    } else {
      vidNeonEl.pause();
      vidNeonPaused = true;
    }
  });

}

registerMode('vidneon', {
  init: initVidneon,
  render: renderVidneon,
  attach: attach_vidneon,
});
