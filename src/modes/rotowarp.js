import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Multiple rotating warp centers that distort space
var warpCenters = [];

function initRotowarp() {
  warpCenters = [];
  for (var i = 0; i < 4; i++) {
    warpCenters.push({
      phase: i * Math.PI * 0.5,
      speed: 0.3 + i * 0.15,
      radius: 0.15 + i * 0.05
    });
  }
}

function renderRotowarp() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var fx = (x - cx) / W;
      var fy = (y - cy) / H * 1.8;

      // Apply warp from each center
      var wx = fx, wy = fy;
      for (var i = 0; i < warpCenters.length; i++) {
        var wc = warpCenters[i];
        var wcx = Math.cos(t * wc.speed + wc.phase) * 0.3;
        var wcy = Math.sin(t * wc.speed * 1.3 + wc.phase) * 0.3;
        var ddx = wx - wcx, ddy = wy - wcy;
        var d = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
        var angle = Math.atan2(ddy, ddx) + wc.radius / d;
        wx = wcx + Math.cos(angle) * d;
        wy = wcy + Math.sin(angle) * d;
      }

      // Sample warped texture — concentric rings
      var rd = Math.sqrt(wx * wx + wy * wy);
      var ra = Math.atan2(wy, wx);
      var val = Math.sin(rd * 20 - t * 2) * 0.5 + 0.5;
      val *= Math.sin(ra * 6 + t) * 0.3 + 0.7;

      // Vignette
      var vd = Math.sqrt(fx * fx + fy * fy);
      val *= Math.max(0, 1 - vd * 1.5);

      if (val < 0.05) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (val * RAMP_DENSE.length) | 0);
      var hue = (ra * 57.3 + t * 30 + rd * 200) % 360;
      if (hue < 0) hue += 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 70, 15 + val * 50);
    }
  }
}

registerMode('rotowarp', { init: initRotowarp, render: renderRotowarp });
