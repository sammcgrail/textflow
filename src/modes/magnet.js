import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { screenToGrid } from '../core/pointer.js';
import { simplex2 } from '../core/noise.js';
import { state } from '../core/state.js';

var magnetField;
var magnetPointerX = -100, magnetPointerY = -100;
var magnetPointerActive = false;

function initMagnet() {
  magnetField = null;
  magnetPointerActive = false;
}
// initMagnet(); — called via registerMode


function renderMagnet() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var phrase = 'TEXTFLOW';
  var magnetRadius = 12;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Base: regular grid of repeating text
      var srcX = x, srcY = y;

      if (magnetPointerActive) {
        var dx = x - magnetPointerX, dy = y - magnetPointerY;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < magnetRadius && d > 0.1) {
          // Warp away from cursor (repel) or toward (attract based on distance)
          var force = (1 - d / magnetRadius);
          force = force * force * 8;
          srcX = x + dx / d * force;
          srcY = y + dy / d * force;
        }
      }

      // Sample from warped position
      var wx = ((srcX | 0) % W + W) % W;
      var wy = ((srcY | 0) % H + H) % H;

      // Generate base pattern (static noise field + text)
      var n = simplex2(wx * 0.08 + state.time * 0.1, wy * 0.06) * 0.5 + 0.5;
      n += Math.sin(wx * 0.15 + state.time * 0.3) * 0.2;

      if (n < 0.2) continue;
      n = Math.min(1, n);

      var ci = ((wx + (state.time * 3 | 0)) % phrase.length + phrase.length) % phrase.length;
      var ch = n > 0.5 ? phrase[ci] : RAMP_DENSE[Math.min(RAMP_DENSE.length - 1, (n * RAMP_DENSE.length) | 0)];

      var hue, sat, lit;
      if (magnetPointerActive) {
        var dx2 = x - magnetPointerX, dy2 = y - magnetPointerY;
        var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        var proximity = Math.max(0, 1 - d2 / magnetRadius);
        hue = (0 + proximity * 40 + state.time * 20) % 360;
        sat = 50 + proximity * 50;
        lit = 20 + n * 40 + proximity * 30;
      } else {
        hue = (n * 30 + state.time * 10) % 360;
        sat = 40 + n * 30;
        lit = 15 + n * 40;
      }
      drawCharHSL(ch, x, y, hue, sat, lit);
    }
  }
}


function attach_magnet() {
  state.canvas.addEventListener('mousemove', function(e) {
    if (state.currentMode !== 'magnet') return;
    var g = screenToGrid(e.clientX, e.clientY);
    magnetPointerX = g.gx; magnetPointerY = g.gy;
    magnetPointerActive = true;
  });

  state.canvas.addEventListener('mouseleave', function() { if (state.currentMode === 'magnet') magnetPointerActive = false; });

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'magnet') return;
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    magnetPointerX = g.gx; magnetPointerY = g.gy;
    magnetPointerActive = true;
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (state.currentMode !== 'magnet') return;
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    magnetPointerX = g.gx; magnetPointerY = g.gy;
  }, { passive: true });

  state.canvas.addEventListener('touchend', function() { if (state.currentMode === 'magnet') magnetPointerActive = false; });

}

registerMode('magnet', {
  init: initMagnet,
  render: renderMagnet,
  attach: attach_magnet,
});
