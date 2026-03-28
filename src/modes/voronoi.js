import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var voronoiSeeds = [];
var NUM_VORONOI = 18;

function initVoronoi() {
  voronoiSeeds = [];
  for (var i = 0; i < NUM_VORONOI; i++) {
    voronoiSeeds.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      hue: (i * 137.508) % 360
    });
  }
}
// initVoronoi(); — called via registerMode
function renderVoronoi() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Click to add new seed points
  if (pointer.clicked && state.currentMode === 'voronoi') {
    pointer.clicked = false;
    voronoiSeeds.push({
      x: pointer.gx, y: pointer.gy,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      hue: (Math.random() * 360) | 0
    });
    if (voronoiSeeds.length > 40) voronoiSeeds.shift();
  }

  // Move seeds
  for (var i = 0; i < voronoiSeeds.length; i++) {
    var s = voronoiSeeds[i];
    s.x += s.vx + Math.sin(state.time * 0.3 + i) * 0.1;
    s.y += s.vy + Math.cos(state.time * 0.4 + i * 1.5) * 0.08;
    if (s.x < 0 || s.x >= W) s.vx *= -1;
    if (s.y < 0 || s.y >= H) s.vy *= -1;
    s.x = Math.max(0, Math.min(W - 1, s.x));
    s.y = Math.max(0, Math.min(H - 1, s.y));
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var d1 = 1e9, d2 = 1e9, ci = 0;
      var px = x * 0.55; // aspect correction
      for (var i = 0; i < voronoiSeeds.length; i++) {
        var dx = px - voronoiSeeds[i].x * 0.55;
        var dy = y - voronoiSeeds[i].y;
        var d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; ci = i; }
        else if (d < d2) { d2 = d; }
      }
      var edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (edge > 8) continue;
      var v = edge < 1.5 ? 1 : Math.max(0, 1 - (edge - 1.5) / 6.5);
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = voronoiSeeds[ci].hue;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 20 + v * 55);
    }
  }
}

registerMode('voronoi', {
  init: initVoronoi,
  render: renderVoronoi,
});
