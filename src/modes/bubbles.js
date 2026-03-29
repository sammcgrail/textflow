import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bubList, bubW, bubH;
function initBubbles() {
  bubW = state.COLS; bubH = state.ROWS;
  bubList = [];
  for (var i = 0; i < 60; i++) spawnBubble();
}
function spawnBubble() {
  bubList.push({
    x: Math.random() * bubW,
    y: bubH + Math.random() * 5,
    r: 1 + Math.random() * 3,
    speed: 0.3 + Math.random() * 0.8,
    wobble: Math.random() * Math.PI * 2,
    hue: 180 + Math.random() * 60
  });
}
function renderBubbles() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!bubList || bubW !== W || bubH !== H) initBubbles();
  if (pointer.clicked && state.currentMode === 'bubbles') {
    pointer.clicked = false;
    for (var s = 0; s < 5; s++) {
      var nb = { x: pointer.gx + (Math.random()-0.5)*4, y: pointer.gy, r: 1+Math.random()*2, speed: 0.5+Math.random()*0.5, wobble: Math.random()*6.28, hue: 180+Math.random()*60 };
      bubList.push(nb);
    }
  }
  for (var i = bubList.length - 1; i >= 0; i--) {
    var b = bubList[i];
    b.y -= b.speed;
    b.x += Math.sin(b.wobble + state.time * 2) * 0.15;
    if (b.y < -b.r) { bubList.splice(i, 1); spawnBubble(); continue; }
    var r = b.r;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r * 2; dx <= r * 2; dx++) {
        var px = (b.x + dx) | 0, py = (b.y + dy) | 0;
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        var d = Math.sqrt(dx * dx / 4 + dy * dy);
        if (d > r) continue;
        var edge = Math.abs(d - r) < 0.8;
        var ch = edge ? 'o' : (d < r * 0.3 ? '.' : ' ');
        if (ch === ' ') continue;
        drawCharHSL(ch, px, py, b.hue | 0, 60, (25 + (1 - d/r) * 30) | 0);
      }
    }
  }
}
registerMode('bubbles', { init: initBubbles, render: renderBubbles });
