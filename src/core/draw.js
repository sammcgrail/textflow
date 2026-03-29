import { state } from './state.js';
import { addChar } from './webgl-renderer.js';

// ============================================================
// Canvas 2D fallback state
// ============================================================
var _lastR = -1, _lastG = -1, _lastB = -1, _lastA = -1;
var _lastColorStr = '';
var _lastH = -1, _lastS = -1, _lastL = -1;
var _lastHSLStr = '';
var _fontSet = 0;

// ============================================================
// clearCanvas — called at start of every mode's render()
// ============================================================
export function clearCanvas() {
  if (state.useWebGL) {
    // WebGL: beginFrame() already cleared the FBO. No-op here.
    return;
  }
  // Canvas 2D fallback
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.ctx.fillStyle = '#0a0a0f';
  state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
  if (_fontSet !== state.FONT_SIZE) {
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
    state.ctx.textBaseline = 'top';
    _fontSet = state.FONT_SIZE;
  }
  state.ctx.shadowColor = 'transparent';
  state.ctx.shadowBlur = 0;
  _lastR = -1; _lastG = -1; _lastB = -1; _lastA = -1;
  _lastH = -1; _lastS = -1; _lastL = -1;
}

// ============================================================
// drawChar — RGBA color
// ============================================================
export function drawChar(ch, x, y, r, g, b, a) {
  if (ch === ' ') return;

  if (state.useWebGL) {
    addChar(ch.charCodeAt(0), x, y, r / 255, g / 255, b / 255, a);
    return;
  }

  // Canvas 2D fallback
  var ai = ((a * 20 + 0.5) | 0);
  if (r !== _lastR || g !== _lastG || b !== _lastB || ai !== _lastA) {
    _lastR = r; _lastG = g; _lastB = b; _lastA = ai;
    _lastColorStr = 'rgba(' + r + ',' + g + ',' + b + ',' + (ai * 0.05).toFixed(2) + ')';
    state.ctx.fillStyle = _lastColorStr;
  }
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}

// ============================================================
// drawCharHSL — HSL color
// ============================================================
export function drawCharHSL(ch, x, y, h, s, l) {
  if (ch === ' ') return;

  if (state.useWebGL) {
    var rgb = hsl2rgb(h, s, l);
    addChar(ch.charCodeAt(0), x, y, rgb[0], rgb[1], rgb[2], 1.0);
    return;
  }

  // Canvas 2D fallback
  var hi = (h | 0) & ~1, si = (s | 0) & ~1, li = (l | 0) & ~1;
  if (hi !== _lastH || si !== _lastS || li !== _lastL) {
    _lastH = hi; _lastS = si; _lastL = li;
    _lastHSLStr = 'hsl(' + hi + ',' + si + '%,' + li + '%)';
    state.ctx.fillStyle = _lastHSLStr;
  }
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}

// ============================================================
// drawString — render a string using drawChar (WebGL-compatible)
// ============================================================
export function drawString(str, pixelX, pixelY, r, g, b, a, align) {
  // Convert pixel position to grid position
  var gx = pixelX / state.CHAR_W;
  var gy = (pixelY - state.NAV_H) / state.CHAR_H;
  // Support right-alignment: shift gx left by string length
  if (align === 'right') gx -= str.length;
  // Snap to integer grid to avoid fractional glyph positions
  gx = Math.round(gx);
  gy = Math.round(gy);
  for (var i = 0; i < str.length; i++) {
    drawChar(str[i], gx + i, gy, r, g, b, a);
  }
}

// ============================================================
// HSL to RGB (returns normalized 0-1 values)
// ============================================================
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = l - c / 2;
  var r, g, b;

  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  return [r + m, g + m, b + m];
}
