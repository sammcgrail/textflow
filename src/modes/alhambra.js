// alhambra — Moorish wallpaper-group tessellation (azulejo jewel tones).
// Folds each cell into a fundamental domain (p4m/8-fold mirror symmetry) and
// fills it with a star-and-petal motif, with a slow hue drift + an Escher
// "Metamorphosis" wave travelling across x that morphs the palette/motif.
import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var HUES = [180, 220, 45, 15]; // teal, lapis, gold, terracotta

function initAlhambra() {}

function renderAlhambra() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  var active = pointer.down && state.currentMode === 'alhambra';
  // pointer scales the tile size — drag to zoom the tiling
  var T = active ? 6 + (pointer.gy / Math.max(1, H)) * 16 : 11;
  var spin = active ? (pointer.gx / Math.max(1, W) - 0.5) * 3 : 0;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // position within tile, normalised to -0.5..0.5
      var u = (((x % T) + T) % T) / T - 0.5;
      var v = (((y % T) + T) % T) / T - 0.5;
      // p4m mirror folds: into one quadrant, then across the diagonal => 8-fold
      u = Math.abs(u); v = Math.abs(v);
      if (v > u) { var tmp = u; u = v; v = tmp; }

      var r = Math.sqrt(u * u + v * v);
      var a = Math.atan2(v, u) + spin;
      var star = Math.cos(a * 8) * 0.5 + 0.5;           // 8-point star
      var ring = Math.sin(r * 26 - t * 1.2) * 0.5 + 0.5; // interlacing strapwork
      var motif = star * 0.6 + ring * 0.4;

      // metamorphosis wave: morphs motif phase across the field
      var meta = Math.sin((x / W) * 6.2832 - t * 0.5) * 0.5 + 0.5;
      var val = motif * (0.55 + 0.45 * meta);
      if (val < 0.12) continue;

      var hi = (((Math.floor(star * 2 + meta * 2)) % 4) + 4) % 4;
      var hue = (HUES[hi] + t * 8) % 360;
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      drawCharHSL(RAMP_DENSE[ri], x, y, hue | 0, 72, (12 + val * 56) | 0);
    }
  }
}

registerMode('alhambra', { init: initAlhambra, render: renderAlhambra });
