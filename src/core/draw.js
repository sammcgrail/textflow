import { state } from './state.js';
import { RAMP_DENSE } from './ramps.js';

// Color cache — avoid string allocation and fillStyle assignment when color unchanged
// Key optimization: only call ctx.fillStyle = when color actually changes
var _lastR = -1, _lastG = -1, _lastB = -1, _lastA = -1;
var _lastColorStr = '';
var _lastH = -1, _lastS = -1, _lastL = -1;
var _lastHSLStr = '';
var _fontSet = 0;

export function clearCanvas() {
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.ctx.fillStyle = '#0a0a0f';
  state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
  // Only re-set font if size changed (avoids expensive font parsing per frame)
  if (_fontSet !== state.FONT_SIZE) {
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
    state.ctx.textBaseline = 'top';
    _fontSet = state.FONT_SIZE;
  }
  state.ctx.shadowColor = 'transparent';
  state.ctx.shadowBlur = 0;
  // Reset color cache
  _lastR = -1; _lastG = -1; _lastB = -1; _lastA = -1;
  _lastH = -1; _lastS = -1; _lastL = -1;
}

export function drawChar(ch, x, y, r, g, b, a) {
  if (ch === ' ') return;
  // Quantize alpha to steps of 0.05 to reduce unique color strings
  var ai = ((a * 20 + 0.5) | 0);
  if (r !== _lastR || g !== _lastG || b !== _lastB || ai !== _lastA) {
    _lastR = r; _lastG = g; _lastB = b; _lastA = ai;
    _lastColorStr = 'rgba(' + r + ',' + g + ',' + b + ',' + (ai * 0.05).toFixed(2) + ')';
    state.ctx.fillStyle = _lastColorStr;
  }
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}

export function drawCharHSL(ch, x, y, h, s, l) {
  if (ch === ' ') return;
  // Quantize: hue steps of 2, sat/light steps of 2 — reduces unique fillStyle strings
  var hi = (h | 0) & ~1, si = (s | 0) & ~1, li = (l | 0) & ~1;
  if (hi !== _lastH || si !== _lastS || li !== _lastL) {
    _lastH = hi; _lastS = si; _lastL = li;
    _lastHSLStr = 'hsl(' + hi + ',' + si + '%,' + li + '%)';
    state.ctx.fillStyle = _lastHSLStr;
  }
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}
