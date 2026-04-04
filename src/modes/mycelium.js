import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var myGrid, myNodes, myNutrients, myW, myH, myStep;
function initMycelium() {
  myW = state.COLS; myH = state.ROWS;
  myGrid = new Float32Array(myW * myH);
  myNutrients = new Float32Array(myW * myH);
  myNodes = []; myStep = 0;
  // Fill with base nutrients
  for (var i = 0; i < myW * myH; i++) myNutrients[i] = 0.3 + Math.random() * 0.2;
  // Seed colonies
  for (var c = 0; c < 4; c++) {
    var nx = (Math.random() * myW) | 0, ny = (Math.random() * myH) | 0;
    myNodes.push({x: nx, y: ny, energy: 1, hue: 270 + c * 30});
    myGrid[ny * myW + nx] = 1;
  }
  // Pre-grow some filaments
  for (var s = 0; s < 200; s++) growStep();
}
function growStep() {
  var W = myW, H = myH;
  for (var i = myNodes.length - 1; i >= 0; i--) {
    var n = myNodes[i];
    if (n.energy < 0.05) continue;
    // Try to branch
    var branches = n.energy > 0.5 ? 2 : 1;
    for (var b = 0; b < branches; b++) {
      var dir = Math.random() * Math.PI * 2;
      var nx = (n.x + Math.cos(dir) * 1.5) | 0;
      var ny = (n.y + Math.sin(dir) * 1.5) | 0;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      var idx = ny * W + nx;
      var nutri = myNutrients[idx];
      if (myGrid[idx] < 0.5 && nutri > 0.1) {
        myGrid[idx] = 0.8;
        myNutrients[idx] *= 0.5;
        if (Math.random() < 0.3) {
          myNodes.push({x: nx, y: ny, energy: n.energy * 0.6 + nutri * 0.3, hue: n.hue});
        }
        n.energy *= 0.8;
      } else if (myGrid[idx] > 0.5) {
        // Connected — pulse
        myGrid[idx] = Math.min(1, myGrid[idx] + 0.2);
      }
    }
    n.energy *= 0.995;
  }
  // Limit nodes
  if (myNodes.length > 300) myNodes.splice(0, myNodes.length - 300);
  // Decay grid slightly
  for (var i = 0; i < W * H; i++) myGrid[i] *= 0.998;
}
function renderMycelium() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!myGrid || myW !== W || myH !== H) initMycelium();
  if (pointer.clicked && state.currentMode === 'mycelium') {
    pointer.clicked = false;
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      myNodes.push({x: gx, y: gy, energy: 1, hue: 270 + (Math.random() * 60) | 0});
      myGrid[gy * W + gx] = 1;
    }
  } else if (pointer.down && state.currentMode === 'mycelium') {
    var gx = (pointer.gx) | 0, gy = (pointer.gy) | 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var px = gx + dx, py = gy + dy;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        myNutrients[py * W + px] = Math.min(1, myNutrients[py * W + px] + 0.3);
      }
    }
  }
  var curStep = (state.time * 10) | 0;
  while (myStep < curStep) { myStep++; growStep(); }
  var t = state.time;
  var filChars = '.:;=+*#';
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = myGrid[y * W + x];
      if (v < 0.02) continue;
      var ci = (v * (filChars.length - 1)) | 0;
      // Bioluminescent purple/cyan
      var pulse = Math.sin(t * 2 + x * 0.1 + y * 0.1) * 0.3 + 0.7;
      var hue = 270 + Math.sin(x * 0.05 + y * 0.05) * 40;
      var lit = (10 + v * pulse * 40) | 0;
      if (lit > 55) lit = 55;
      drawCharHSL(filChars[ci], x, y, ((hue + 360) % 360) | 0, 65, lit);
    }
  }
  // Draw nodes as bright spots
  for (var i = 0; i < myNodes.length; i++) {
    var n = myNodes[i];
    if (n.energy < 0.1) continue;
    if (n.x >= 0 && n.x < W && n.y >= 0 && n.y < H) {
      drawCharHSL('@', n.x, n.y, (n.hue % 360) | 0, 70, (30 + n.energy * 25) | 0);
    }
  }
}
registerMode('mycelium', { init: initMycelium, render: renderMycelium });
