import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var nnNodes, nnPulses, nnEdges;
function initNeuron() {
  nnNodes = []; nnPulses = []; nnEdges = [];
  var W = state.COLS, H = state.ROWS;
  var count = Math.min(25, Math.max(12, ((W * H) / 200) | 0));
  for (var i = 0; i < count; i++) {
    nnNodes.push({ x: (Math.random() * (W - 4) + 2) | 0, y: (Math.random() * (H - 4) + 2) | 0 });
  }
  for (var i = 0; i < nnNodes.length; i++) {
    var conns = 0;
    for (var j = 0; j < nnNodes.length; j++) {
      if (i === j) continue;
      var dx = nnNodes[i].x - nnNodes[j].x, dy = nnNodes[i].y - nnNodes[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < Math.max(W, H) * 0.35 && conns < 4) { nnEdges.push({ from: i, to: j }); conns++; }
    }
  }
}
function renderNeuron() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!nnNodes || !nnEdges) initNeuron();
  var t = state.time;
  if (pointer.clicked && state.currentMode === 'neuron') {
    pointer.clicked = false;
    var best = -1, bestD = 999;
    for (var i = 0; i < nnNodes.length; i++) {
      var dx = nnNodes[i].x - pointer.gx, dy = nnNodes[i].y - pointer.gy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) for (var e = 0; e < nnEdges.length; e++) {
      if (nnEdges[e].from === best) nnPulses.push({ edge: e, t: 0, hue: 60, bright: 1 });
    }
  } else if (pointer.down && state.currentMode === 'neuron') {
    for (var i = 0; i < nnNodes.length; i++) {
      var dx = nnNodes[i].x - pointer.gx, dy = nnNodes[i].y - pointer.gy;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 6 && Math.random() < 0.06) {
        for (var e = 0; e < nnEdges.length; e++) {
          if (nnEdges[e].from === i) nnPulses.push({ edge: e, t: 0, hue: 30, bright: 0.8 });
        }
      }
    }
  }
  if (Math.random() < 0.04) {
    var idx = (Math.random() * nnNodes.length) | 0;
    for (var e = 0; e < nnEdges.length; e++) {
      if (nnEdges[e].from === idx) nnPulses.push({ edge: e, t: 0, hue: 200 + Math.random() * 100, bright: 0.7 });
    }
  }
  // Draw edges
  for (var e = 0; e < nnEdges.length; e++) {
    var a = nnNodes[nnEdges[e].from], b = nnNodes[nnEdges[e].to];
    var dx = b.x - a.x, dy = b.y - a.y;
    var steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) continue;
    for (var s = 0; s <= steps; s++) {
      var frac = s / steps;
      var px = (a.x + dx * frac) | 0, py = (a.y + dy * frac) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var ch = Math.abs(dx) > Math.abs(dy) ? '-' : '|';
        if (Math.abs(dx) > 2 && Math.abs(dy) > 2) ch = (dx > 0) === (dy > 0) ? '\\' : '/';
        drawCharHSL(ch, px, py, 200, 25, 6);
      }
    }
  }
  // Pulses
  for (var i = nnPulses.length - 1; i >= 0; i--) {
    var p = nnPulses[i];
    p.t += 0.04;
    if (p.t > 1) {
      var targetNode = nnEdges[p.edge].to;
      if (Math.random() < 0.5) {
        for (var e = 0; e < nnEdges.length; e++) {
          if (nnEdges[e].from === targetNode && nnEdges[e].to !== nnEdges[p.edge].from) nnPulses.push({ edge: e, t: 0, hue: (p.hue + 40) % 360, bright: p.bright * 0.7 });
        }
      }
      nnPulses.splice(i, 1); continue;
    }
    var a = nnNodes[nnEdges[p.edge].from], b = nnNodes[nnEdges[p.edge].to];
    var px = (a.x + (b.x - a.x) * p.t) | 0, py = (a.y + (b.y - a.y) * p.t) | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      drawCharHSL('*', px, py, p.hue | 0, 80, (p.bright * 50) | 0);
      for (var tr = 1; tr <= 3; tr++) {
        var tt = p.t - tr * 0.05;
        if (tt >= 0) {
          var tx = (a.x + (b.x - a.x) * tt) | 0, ty = (a.y + (b.y - a.y) * tt) | 0;
          if (tx >= 0 && tx < W && ty >= 0 && ty < H) drawCharHSL('.', tx, ty, p.hue | 0, 60, (p.bright * 20 / (tr + 1)) | 0);
        }
      }
    }
  }
  if (nnPulses.length > 200) nnPulses.splice(0, nnPulses.length - 200);
  // Nodes on top
  for (var i = 0; i < nnNodes.length; i++) {
    var n = nnNodes[i];
    if (n.x >= 0 && n.x < W && n.y >= 0 && n.y < H) {
      drawCharHSL('O', n.x, n.y, 180, 60, 25);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        var gx = n.x + dx, gy = n.y + dy;
        if (gx >= 0 && gx < W && gy >= 0 && gy < H) drawCharHSL('o', gx, gy, 200, 40, 10);
      }
    }
  }
}
registerMode('neuron', { init: initNeuron, render: renderNeuron });
