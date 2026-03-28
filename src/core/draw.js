import { state } from './state.js';
import { RAMP_DENSE } from './ramps.js';

// Color cache to avoid string allocation per fillText call
var _lastR = -1, _lastG = -1, _lastB = -1, _lastA = -1;
var _lastColorStr = '';
var _lastH = -1, _lastS = -1, _lastL = -1;
var _lastHSLStr = '';

export function clearCanvas() {
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  state.ctx.fillStyle = '#0a0a0f';
  state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);
  state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  state.ctx.textBaseline = 'top';
  state.ctx.shadowColor = 'transparent';
  state.ctx.shadowBlur = 0;
  // Reset color cache
  _lastR = -1; _lastG = -1; _lastB = -1; _lastA = -1;
  _lastH = -1; _lastS = -1; _lastL = -1;
}

export function drawChar(ch, x, y, r, g, b, a) {
  if (ch === ' ') return;
  var ai = (a * 100 + 0.5) | 0;
  if (r !== _lastR || g !== _lastG || b !== _lastB || ai !== _lastA) {
    _lastR = r; _lastG = g; _lastB = b; _lastA = ai;
    _lastColorStr = 'rgba(' + r + ',' + g + ',' + b + ',' + (ai * 0.01).toFixed(2) + ')';
  }
  state.ctx.fillStyle = _lastColorStr;
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}

export function drawCharHSL(ch, x, y, h, s, l) {
  if (ch === ' ') return;
  var hi = h | 0, si = s | 0, li = l | 0;
  if (hi !== _lastH || si !== _lastS || li !== _lastL) {
    _lastH = hi; _lastS = si; _lastL = li;
    _lastHSLStr = 'hsl(' + hi + ',' + si + '%,' + li + '%)';
  }
  state.ctx.fillStyle = _lastHSLStr;
  state.ctx.fillText(ch, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
}
