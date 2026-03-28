import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var mtxStreams, mtxW, mtxH;
var MTX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=';
function initMatrix() {
  mtxW = state.COLS; mtxH = state.ROWS;
  mtxStreams = [];
  // Dense initial coverage — ~85% of columns get a stream, spread across full height
  for (var x = 0; x < mtxW; x++) {
    if (Math.random() < 0.85) {
      mtxStreams.push({
        x: x,
        y: Math.random() * mtxH * 1.5 - mtxH * 0.5,
        speed: 4 + Math.random() * 14,
        len: 6 + (Math.random() * 25) | 0,
        chars: []
      });
      var st = mtxStreams[mtxStreams.length - 1];
      for (var j = 0; j < st.len; j++) st.chars.push(MTX_CHARS[(Math.random() * MTX_CHARS.length) | 0]);
    }
  }
}
// initMatrix(); — called via registerMode
function renderMatrix() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (mtxW !== W || mtxH !== H) initMatrix();
  var px = pointer.down && state.currentMode === 'matrix' ? pointer.gx : -100;
  var py = pointer.down && state.currentMode === 'matrix' ? pointer.gy : -100;
  for (var i = 0; i < mtxStreams.length; i++) {
    var s = mtxStreams[i];
    s.y += s.speed * 0.016;
    if (s.y - s.len > H) {
      s.y = -s.len;
      s.x = (Math.random() * W) | 0;
      s.speed = 4 + Math.random() * 14;
      s.len = 6 + (Math.random() * 25) | 0;
      s.chars = [];
      for (var ci = 0; ci < s.len; ci++) s.chars.push(MTX_CHARS[(Math.random() * MTX_CHARS.length) | 0]);
    }
    // Spawn new streams to keep density high
    if (mtxStreams.length < W * 0.8 && Math.random() < 0.02) {
      mtxStreams.push({ x: (Math.random() * W) | 0, y: -5, speed: 4 + Math.random() * 14, len: 6 + (Math.random() * 25) | 0, chars: [] });
      var ns = mtxStreams[mtxStreams.length - 1];
      for (var ci = 0; ci < ns.len; ci++) ns.chars.push(MTX_CHARS[(Math.random() * MTX_CHARS.length) | 0]);
    }
    // Pointer repel
    var dx = s.x - px, dy = (s.y - s.len * 0.5) - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 8) {
      s.x += (dx / (dist + 0.1)) * 0.5;
    }
    // Randomize one char per frame
    var ri = (Math.random() * s.len) | 0;
    s.chars[ri] = MTX_CHARS[(Math.random() * MTX_CHARS.length) | 0];
    for (var j = 0; j < s.len; j++) {
      var cy = (s.y - j) | 0;
      if (cy < 0 || cy >= H) continue;
      var sx = s.x | 0;
      if (sx < 0 || sx >= W) continue;
      if (j === 0) {
        drawChar(s.chars[j], sx, cy, 220, 255, 220, 1);
      } else {
        var fade = 1 - j / s.len;
        drawChar(s.chars[j], sx, cy, 0, (100 + fade * 155) | 0, 0, fade);
      }
    }
  }
}

registerMode('matrix', {
  init: initMatrix,
  render: renderMatrix,
});
