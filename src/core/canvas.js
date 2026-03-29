import { state } from './state.js';
import { resizeWebGL } from './webgl-renderer.js';

export function resize() {
  var w = window.innerWidth;
  var h = window.innerHeight;
  state.canvas.width = w * state.dpr;
  state.canvas.height = h * state.dpr;
  state.canvas.style.width = w + 'px';
  state.canvas.style.height = h + 'px';

  // Font metrics — use a temporary 2D canvas for measurement
  state.FONT_SIZE = Math.max(10, Math.min(16, w / 70));
  var measureCtx = state.ctx || document.createElement('canvas').getContext('2d');
  measureCtx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  measureCtx.textBaseline = 'top';
  state.CHAR_W = measureCtx.measureText('M').width;
  state.CHAR_H = state.FONT_SIZE * 1.25;

  state.COLS = Math.floor(w / state.CHAR_W);
  state.ROWS = Math.floor((h - state.NAV_H) / state.CHAR_H);

  if (state.useWebGL) {
    resizeWebGL();
  } else if (state.ctx) {
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
    state.ctx.textBaseline = 'top';
  }
}
