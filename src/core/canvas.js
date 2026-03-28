import { state } from './state.js';

export function resize() {
  var w = window.innerWidth;
  var h = window.innerHeight;
  state.canvas.width = w * state.dpr;
  state.canvas.height = h * state.dpr;
  state.canvas.style.width = w + 'px';
  state.canvas.style.height = h + 'px';
  state.ctx.scale(state.dpr, state.dpr);

  state.FONT_SIZE = Math.max(10, Math.min(16, w / 70));
  state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  state.CHAR_W = state.ctx.measureText('M').width;
  state.CHAR_H = state.FONT_SIZE * 1.25;

  state.COLS = Math.floor(w / state.CHAR_W);
  state.ROWS = Math.floor((h - state.NAV_H) / state.CHAR_H);

}
