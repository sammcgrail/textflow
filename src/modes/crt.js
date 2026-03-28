import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var crtProgram = 0;
var crtBurnIn;
var CRT_PROGRAMS = 5;

function initCRT() {
  crtProgram = 0;
  crtBurnIn = new Float32Array(state.COLS * state.ROWS);
}
// initCRT(); — called via registerMode
function renderCRT() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!crtBurnIn || crtBurnIn.length !== W * H) initCRT();

  if (pointer.clicked && state.currentMode === 'crt') {
    pointer.clicked = false;
    crtProgram = (crtProgram + 1) % CRT_PROGRAMS;
  }

  // Burn-in decay
  for (var i = 0; i < crtBurnIn.length; i++) crtBurnIn[i] *= 0.992;

  for (var y = 0; y < H; y++) {
    // CRT barrel distortion
    var ny = (y / H - 0.5) * 2;
    var distortY = ny * (1 + ny * ny * 0.08);
    var srcY = (distortY * 0.5 + 0.5) * H;

    // Scanline darkening
    var scanline = (y % 2 === 0) ? 1.0 : 0.7;
    // Vignette
    var vy = 1 - Math.abs(ny) * 0.3;

    for (var x = 0; x < W; x++) {
      var nx = (x / W - 0.5) * 2;
      var distortX = nx * (1 + nx * nx * 0.05);
      var srcX = (distortX * 0.5 + 0.5) * W;

      var vx = 1 - Math.abs(nx) * 0.2;
      var vignette = vx * vy;
      if (vignette < 0.1) continue;

      var sx = srcX | 0, sy = srcY | 0;
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;

      var v = 0;
      // Different "programs"
      if (crtProgram === 0) {
        // Bouncing logo
        var lx = W / 2 + Math.sin(state.time * 0.7) * W * 0.3;
        var ly = H / 2 + Math.cos(state.time * 0.5) * H * 0.3;
        var msg = 'TEXTFLOW';
        var dx = sx - lx, dy = sy - ly;
        if (Math.abs(dy) < 2 && Math.abs(dx) < msg.length * 0.6) {
          var ci = ((dx / 0.6 + msg.length / 2) | 0);
          if (ci >= 0 && ci < msg.length) {
            var ch = msg[ci];
            v = 1;
            drawChar(ch, x, y, 0, (255 * vignette * scanline) | 0, 0, v * vignette);
            crtBurnIn[y * W + x] = Math.min(1, crtBurnIn[y * W + x] + 0.05);
            continue;
          }
        }
      } else if (crtProgram === 1) {
        // Color bars
        var barIdx = (sx / (W / 7)) | 0;
        var barColors = [[255,255,255],[255,255,0],[0,255,255],[0,255,0],[255,0,255],[255,0,0],[0,0,255]];
        var c = barColors[Math.min(6, barIdx)];
        v = 0.8;
        drawChar('#', x, y, (c[0]*vignette*scanline)|0, (c[1]*vignette*scanline)|0, (c[2]*vignette*scanline)|0, v * vignette);
        continue;
      } else if (crtProgram === 2) {
        // Sine test pattern
        v = Math.sin(sx * 0.3 + state.time) * 0.5 + 0.5;
        v *= Math.sin(sy * 0.2 - state.time * 0.7) * 0.5 + 0.5;
      } else if (crtProgram === 3) {
        // Grid pattern
        v = ((sx % 10 < 1) || (sy % 8 < 1)) ? 0.8 : 0.05;
      } else {
        // Noise channel
        v = ((sx * 31 + sy * 17 + (state.time * 10 | 0)) % 97) / 97;
        if (v < 0.5) v = 0;
      }

      v *= scanline * vignette;
      if (v < 0.05) {
        // Show burn-in
        var bi = crtBurnIn[y * W + x];
        if (bi > 0.02) drawChar('.', x, y, 0, (bi * 40) | 0, 0, bi * 0.3);
        continue;
      }

      crtBurnIn[y * W + x] = Math.min(1, crtBurnIn[y * W + x] + v * 0.01);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      // Green phosphor
      drawChar(RAMP_DENSE[ri], x, y, 0, (v * 255) | 0, (v * 60) | 0, 0.3 + v * 0.7);
    }
  }
}

registerMode('crt', {
  init: initCRT,
  render: renderCRT,
});
