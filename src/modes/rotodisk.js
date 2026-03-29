import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Spinning disk — vinyl/hard disk platter with data tracks
function renderRotodisk() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  // Disk wobble (3D tilt illusion)
  var tiltX = Math.sin(t * 0.4) * 0.3;
  var tiltY = Math.cos(t * 0.6) * 0.15;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = (x - cx) / (W * 0.45);
      var dy = (y - cy) / (H * 0.45) * 1.8;

      // Apply tilt
      var tz = dx * Math.sin(tiltX) + dy * Math.sin(tiltY);
      dx = dx * Math.cos(tiltX);
      dy = dy * Math.cos(tiltY);

      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1.0 || r < 0.05) continue; // disk boundary

      var a = Math.atan2(dy, dx);

      // Spinning — faster at outer edges
      var spin = t * 3 + r * 2;
      var spinA = a + spin;

      // Data tracks — concentric rings with binary-ish patterns
      var track = Math.floor(r * 20);
      var trackFrac = (r * 20) - track;
      var trackGap = Math.abs(trackFrac - 0.5) < 0.4 ? 1 : 0;

      // "Data" on track — pseudo-random based on track and angle
      var sectors = 8 + track * 3;
      var sector = Math.floor(spinA * sectors / (2 * Math.PI));
      var sectorFrac = (spinA * sectors / (2 * Math.PI)) - sector;
      var bit = ((sector * 7 + track * 13) & 15) > 7 ? 1 : 0;

      var val = trackGap * (bit * 0.6 + 0.2);

      // Head position — bright radial line
      var headAngle = t * 1.5;
      var headDiff = Math.abs(Math.sin((a - headAngle) * 0.5));
      if (headDiff < 0.02) val = Math.max(val, 0.9);

      // Specular highlight on disk surface
      var specAngle = a - t * 0.3;
      var spec = Math.pow(Math.max(0, Math.cos(specAngle)), 20);
      val += spec * 0.3 * (1 - r * 0.5);

      // Center label
      if (r < 0.15) {
        val = 0.4 + Math.sin(a * 3 + t) * 0.1;
      }

      // 3D lighting from tilt
      val *= 0.7 + tz * 0.5 + 0.3;

      if (val < 0.03) continue;
      val = Math.min(1, Math.max(0, val));
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = r < 0.15 ? (40 + t * 10) % 360 : (200 + track * 8 + val * 30) % 360;
      var sat = r < 0.15 ? 40 : 30 + val * 40;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, sat, 8 + val * 50);
    }
  }
}

registerMode('rotodisk', { init: undefined, render: renderRotodisk });
