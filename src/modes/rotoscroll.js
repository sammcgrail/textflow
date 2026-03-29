import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Rotating scroll — text wrapping around a rotating cylinder
var scrollText = 'ROTOSCROLL * TEXTFLOW * ASCII DEMOSCENE * ROTATING CYLINDER TEXT EFFECT * GREETINGS TO ALL CODERS * ';

function renderRotoscroll() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var cx = W / 2, cy = H / 2;

  // Cylinder parameters
  var cylinderR = W * 0.35;
  var textRows = 12;
  var scrollSpeed = t * 2;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - cx;
      var dy = y - cy;

      // Map to cylinder: x maps to angle around cylinder
      var angle = dx / cylinderR;
      if (Math.abs(angle) > Math.PI * 0.48) continue; // only front face visible

      // Foreshortening — cos gives depth
      var depth = Math.cos(angle);
      if (depth < 0.05) continue;

      // Which text row?
      var rowF = (dy / H + 0.5) * textRows;
      var row = Math.floor(rowF);
      if (row < 0 || row >= textRows) continue;
      var rowFrac = rowF - row;

      // Text position: scrolls at different speeds per row
      var direction = (row & 1) ? 1 : -1;
      var speed = 0.5 + row * 0.15;
      var textPos = scrollSpeed * speed * direction + angle * 10;
      var charIdx = Math.floor(textPos);
      charIdx = ((charIdx % scrollText.length) + scrollText.length) % scrollText.length;
      var ch = scrollText[charIdx];

      if (ch === ' ') continue;

      // Brightness based on depth (facing angle)
      var bright = depth;
      // Row edge fade
      var edgeFade = 1 - Math.pow(Math.abs(rowFrac - 0.5) * 2, 4);
      bright *= edgeFade;

      if (bright < 0.05) continue;
      bright = Math.min(1, bright);

      var hue = (row * 35 + t * 20) % 360;
      drawCharHSL(ch, x, y, hue, 50 + bright * 40, 10 + bright * 55);
    }
  }
}

registerMode('rotoscroll', { init: undefined, render: renderRotoscroll });
