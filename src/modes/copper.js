import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var copperMsg = '  TEXTFLOW  --  ASCII EXPERIMENTS  --  SEBLAND.COM  --  ';

// Copper interaction: click adds a bar pinned to cursor Y
var copperExtraBars = [];
function renderCopper() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var numBars = 7;
  var barHues = [0, 30, 60, 180, 210, 280, 330];
  var scrollX = state.time * 12;

  if (pointer.clicked && state.currentMode === 'copper') {
    pointer.clicked = false;
    if (copperExtraBars.length > 5) copperExtraBars.shift();
    copperExtraBars.push({ y: pointer.gy, hue: (Math.random() * 360) | 0, born: state.time });
  }

  for (var y = 0; y < H; y++) {
    // Sum bar contributions
    var totalV = 0;
    var bestHue = 0, bestV = 0;

    // Extra click-spawned bars
    for (var eb = 0; eb < copperExtraBars.length; eb++) {
      var ebar = copperExtraBars[eb];
      var eAge = state.time - ebar.born;
      if (eAge > 20) { copperExtraBars.splice(eb, 1); eb--; continue; }
      var eFade = Math.max(0, 1 - eAge / 20);
      var eDist = Math.abs(y - (ebar.y + Math.sin(state.time * 0.8 + eb) * 3));
      if (eDist < 3) {
        var ev = (1 - eDist / 3) * eFade;
        totalV += ev;
        if (ev > bestV) { bestV = ev; bestHue = ebar.hue; }
      }
    }

    for (var b = 0; b < numBars; b++) {
      var barY = H * 0.5 + Math.sin(state.time * (0.5 + b * 0.15) + b * 1.2) * H * 0.35;
      var dist = Math.abs(y - barY);
      var halfH = 2.5 + Math.sin(state.time * 0.3 + b) * 0.5;
      if (dist > halfH) continue;
      var v = 1 - (dist / halfH);
      v = v * v;
      totalV += v;
      if (v > bestV) { bestV = v; bestHue = barHues[b]; }
    }

    if (totalV < 0.05) continue;
    totalV = Math.min(totalV, 1);

    for (var x = 0; x < W; x++) {
      var ci = ((x + scrollX) | 0) % copperMsg.length;
      if (ci < 0) ci += copperMsg.length;
      var ch = copperMsg[ci];
      if (ch === ' ') continue;

      var lit = 30 + totalV * 55;
      if (totalV > 0.8) lit = 50 + totalV * 45; // hot overlap
      drawCharHSL(ch, x, y, bestHue, 70 + totalV * 30, lit);
    }
  }
}

registerMode('copper', {
  init: undefined,
  render: renderCopper,
});
