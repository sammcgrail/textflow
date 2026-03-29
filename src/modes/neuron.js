import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var nnNodes, nnPulses;
function initNeuron() {
  nnNodes = []; nnPulses = [];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < 30; i++) {
    nnNodes.push({ x: (Math.random() * W) | 0, y: (Math.random() * H) | 0, connections: [] });
  }
  // Connect nearby nodes
  for (var i = 0; i < nnNodes.length; i++) {
    for (var j = i + 1; j < nnNodes.length; j++) {
      var dx = nnNodes[i].x - nnNodes[j].x, dy = nnNodes[i].y - nnNodes[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < Math.max(W, H) * 0.3) {
        nnNodes[i].connections.push(j);
        nnNodes[j].connections.push(i);
      }
    }
    // Limit connections
    if (nnNodes[i].connections.length > 5) nnNodes[i].connections.length = 5;
  }
}
function renderNeuron() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!nnNodes) initNeuron();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'neuron') {
    pointer.clicked = false;
    // Fire nearest neuron
    var best = -1, bestD = 999;
    for (var i = 0; i < nnNodes.length; i++) {
      var dx = nnNodes[i].x - pointer.gx, dy = nnNodes[i].y - pointer.gy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      for (var c = 0; c < nnNodes[best].connections.length; c++) {
        nnPulses.push({ from: best, to: nnNodes[best].connections[c], t: 0, hue: 180 });
      }
    }
  } else if (pointer.down && state.currentMode === 'neuron') {
    // Continuous firing near pointer
    for (var i = 0; i < nnNodes.length; i++) {
      var dx = nnNodes[i].x - pointer.gx, dy = nnNodes[i].y - pointer.gy;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 5 && Math.random() < 0.05) {
        for (var c = 0; c < nnNodes[i].connections.length; c++) {
          nnPulses.push({ from: i, to: nnNodes[i].connections[c], t: 0, hue: 50 });
        }
      }
    }
  }
  // Random firing
  if (Math.random() < 0.03) {
    var idx = (Math.random() * nnNodes.length) | 0;
    for (var c = 0; c < nnNodes[idx].connections.length; c++) {
      nnPulses.push({ from: idx, to: nnNodes[idx].connections[c], t: 0, hue: 280 });
    }
  }
  // Draw connections
  for (var i = 0; i < nnNodes.length; i++) {
    var n = nnNodes[i];
    for (var c = 0; c < n.connections.length; c++) {
      var j = n.connections[c];
      if (j <= i) continue;
      var m = nnNodes[j];
      var steps = Math.max(Math.abs(m.x - n.x), Math.abs(m.y - n.y));
      for (var s = 0; s <= steps; s += 2) {
        var frac = s / (steps || 1);
        var px = (n.x + (m.x - n.x) * frac) | 0;
        var py = (n.y + (m.y - n.y) * frac) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) drawCharHSL('.', px, py, 200, 20, 5);
      }
    }
  }
  // Update and draw pulses
  for (var i = nnPulses.length - 1; i >= 0; i--) {
    var p = nnPulses[i];
    p.t += 0.03;
    if (p.t > 1) {
      // Cascade
      var target = nnNodes[p.to];
      if (Math.random() < 0.3) {
        for (var c = 0; c < target.connections.length; c++) {
          if (target.connections[c] !== p.from) nnPulses.push({ from: p.to, to: target.connections[c], t: 0, hue: (p.hue + 30) % 360 });
        }
      }
      nnPulses.splice(i, 1); continue;
    }
    var a = nnNodes[p.from], b = nnNodes[p.to];
    var px = (a.x + (b.x - a.x) * p.t) | 0;
    var py = (a.y + (b.y - a.y) * p.t) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('*', px, py, p.hue, 80, 45);
    }
  }
  if (nnPulses.length > 300) nnPulses.splice(0, nnPulses.length - 300);
  // Draw nodes
  for (var i = 0; i < nnNodes.length; i++) {
    var n = nnNodes[i];
    if (n.x >= 0 && n.x < W && n.y >= 0 && n.y < H) drawCharHSL('O', n.x, n.y, 200, 60, 20);
  }
}
registerMode('neuron', { init: initNeuron, render: renderNeuron });
