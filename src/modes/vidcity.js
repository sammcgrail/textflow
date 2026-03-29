import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

var el = document.createElement('video');
el.muted = true; el.loop = true; el.playsInline = true;
el.crossOrigin = 'anonymous'; el.style.display = 'none';
document.body.appendChild(el);
var vc = document.createElement('canvas');
var vctx = vc.getContext('2d', { willReadFrequently: true });
var ready = false, paused = false;
el.onloadeddata = function() { ready = true; };

function init() {
  paused = false;
  if (!ready && !el.getAttribute('src')) { el.src = '/textflow/static/citynight.mp4'; el.load(); }
  el.currentTime = 0; el.play().catch(function(){});
}
function render() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!ready) { drawFancyLoading('loading city'); return; }
  if (vc.width !== W || vc.height !== H) { vc.width = W; vc.height = H; }
  vctx.drawImage(el, 0, 0, W, H);
  var d = vctx.getImageData(0, 0, W, H).data;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4;
      var r = d[i], g = d[i+1], b = d[i+2];
      var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
      if (lum < 0.02) continue;
      var ri = Math.min(VA_RAMP.length-1, (lum * VA_RAMP.length) | 0);
      var maxC = Math.max(r, g, b);
      var boost = maxC > 0 ? 255 / maxC : 1;
      var br = Math.min(255, r * boost * 0.7 + r * 0.3);
      var bg = Math.min(255, g * boost * 0.7 + g * 0.3);
      var bb = Math.min(255, b * boost * 0.7 + b * 0.3);
      drawChar(VA_RAMP[ri], x, y, br|0, bg|0, bb|0, Math.max(0.2, Math.min(1, lum*1.5)));
    }
  }
  if (paused) { state.ctx.fillStyle='rgba(255,255,255,0.25)'; state.ctx.font='9px "JetBrains Mono",monospace'; state.ctx.textAlign='right'; state.ctx.fillText('PAUSED',window.innerWidth-10,state.NAV_H+10); state.ctx.textAlign='left'; state.ctx.font=state.FONT_SIZE+'px "JetBrains Mono",monospace'; }
}
function attach() {
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'vidcity') return;
    if (el.paused) { el.play().catch(function(){}); paused=false; } else { el.pause(); paused=true; }
  });
}
registerMode('vidcity', { init: init, render: render, attach: attach });
