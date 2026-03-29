// Shared mutable state — all modules import this same object
export const state = {
  canvas: null,
  ctx: null,
  currentMode: 'lava',
  COLS: 0,
  ROWS: 0,
  time: 0,
  CHAR_W: 0,
  CHAR_H: 0,
  FONT_SIZE: 0,
  NAV_H: 32,
  dpr: 1,
  isMobile: false,
  buttons: null,
  gl: null,
  useWebGL: false,
};
