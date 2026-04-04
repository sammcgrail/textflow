import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var rlRunes, rlW, rlH;
var rlGlyphs = '+-|*.:;=#<>^~{}[]()';
function initRunelore() {
  rlW = state.COLS; rlH = state.ROWS;
  rlRunes = [];
  for (var i = 0; i < 12; i++) {
    rlRunes.push(makeRune(Math.random() * rlW, Math.random() * rlH));
  }
}
function makeRune(cx, cy) {
  var segs = [];
  var n = 4 + (Math.random() * 6) | 0;
  for (var i = 0; i < n; i++) {
    var angle = Math.random() * Math.PI * 2;
    var len = 2 + Math.random() * 5;
    segs.push({angle: angle, len: len, type: (Math.random() * 3) | 0});
  }
  return {
    cx: cx, cy: cy, segs: segs, phase: Math.random() * 6.28,
    size: 0.6 + Math.random() * 0.8, rot: Math.random() * 6.28
  };
}
function renderRunelore() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var ar = state.CHAR_W / state.CHAR_H;
  if (!rlRunes || rlW !== W || rlH !== H) initRunelore();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'runelore') {
    pointer.clicked = false;
    rlRunes.push(makeRune(pointer.gx, pointer.gy));
    if (rlRunes.length > 30) rlRunes.shift();
  } else if (pointer.down && state.currentMode === 'runelore') {
    var gx = pointer.gx, gy = pointer.gy;
    for (var i = 0; i < rlRunes.length; i++) {
      var r = rlRunes[i];
      var dx = r.cx - gx, dy = r.cy - gy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) {
        r.rot += 0.05;
        r.size = Math.max(0.3, r.size + (Math.random() - 0.5) * 0.05);
      }
    }
  }
  // Draw background subtle pattern
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = Math.sin(x * 0.3 + t * 0.2) * Math.sin(y * 0.3 + t * 0.15);
      if (v > 0.7) {
        drawCharHSL('.', x, y, 230, 30, 12);
      }
    }
  }
  // Draw runes
  for (var i = 0; i < rlRunes.length; i++) {
    var r = rlRunes[i];
    var pulse = 0.8 + Math.sin(t * 1.5 + r.phase) * 0.2;
    var sz = r.size * pulse;
    // Draw center dot
    var cx = (r.cx) | 0, cy = (r.cy) | 0;
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
      drawCharHSL('@', cx, cy, 45, 80, 45);
    }
    // Draw segments
    for (var s = 0; s < r.segs.length; s++) {
      var seg = r.segs[s];
      var angle = seg.angle + r.rot + Math.sin(t * 0.5 + s) * 0.2;
      var steps = (seg.len * sz) | 0;
      for (var j = 1; j <= steps; j++) {
        var px = (r.cx + Math.cos(angle) * j / ar * sz) | 0;
        var py = (r.cy + Math.sin(angle) * j * sz) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          var ch = seg.type === 0 ? '-' : seg.type === 1 ? '|' : '+';
          var hue = 230 + Math.sin(t + j * 0.3) * 20;
          var lit = (20 + pulse * 25) | 0;
          drawCharHSL(ch, px, py, hue | 0, 60, lit);
        }
      }
      // Endpoint glyph
      var ex = (r.cx + Math.cos(angle) * steps / ar * sz) | 0;
      var ey = (r.cy + Math.sin(angle) * steps * sz) | 0;
      if (ex >= 0 && ex < W && ey >= 0 && ey < H) {
        drawCharHSL(rlGlyphs[s % rlGlyphs.length], ex, ey, 45, 70, (30 + pulse * 20) | 0);
      }
    }
    // Circle outline
    var rad = 3 * sz;
    for (var a = 0; a < 24; a++) {
      var ang = a / 24 * Math.PI * 2 + t * 0.3;
      var px = (r.cx + Math.cos(ang) * rad / ar) | 0;
      var py = (r.cy + Math.sin(ang) * rad) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        drawCharHSL('.', px, py, 230, 50, (18 + pulse * 15) | 0);
      }
    }
  }
}
registerMode('runelore', { init: initRunelore, render: renderRunelore });
