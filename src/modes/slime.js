import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var slimeAgents, slimeTrail, slimeW, slimeH;
function initSlime() {
  slimeW = state.COLS; slimeH = state.ROWS;
  slimeTrail = new Float32Array(slimeW * slimeH);
  var numAgents = state.isMobile ? 5000 : 8000;
  slimeAgents = [];
  var cx = slimeW * 0.5, cy = slimeH * 0.5;
  for (var i = 0; i < numAgents; i++) {
    var ang = Math.random() * Math.PI * 2;
    var r = Math.random() * Math.min(slimeW, slimeH) * 0.3;
    slimeAgents.push({
      x: cx + Math.cos(ang) * r,
      y: cy + Math.sin(ang) * r,
      angle: Math.random() * Math.PI * 2
    });
  }
}
// initSlime(); — called via registerMode
function renderSlime() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (slimeW !== W || slimeH !== H) initSlime();
  var sensorDist = 3, sensorAngle = 0.5, turnSpeed = 0.4, moveSpeed = 0.8;
  // Pointer deposits attractant
  if (pointer.down && state.currentMode === 'slime') {
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var nx = gx + dx, ny = gy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          slimeTrail[ny * W + nx] = Math.min(1, slimeTrail[ny * W + nx] + 0.5);
        }
      }
    }
  }
  // Update agents
  for (var i = 0; i < slimeAgents.length; i++) {
    var a = slimeAgents[i];
    // Sense at 3 angles
    var fl = 0, fc = 0, fr = 0;
    var slx = (a.x + Math.cos(a.angle - sensorAngle) * sensorDist) | 0;
    var sly = (a.y + Math.sin(a.angle - sensorAngle) * sensorDist) | 0;
    if (slx >= 0 && slx < W && sly >= 0 && sly < H) fl = slimeTrail[sly * W + slx];
    var scx = (a.x + Math.cos(a.angle) * sensorDist) | 0;
    var scy = (a.y + Math.sin(a.angle) * sensorDist) | 0;
    if (scx >= 0 && scx < W && scy >= 0 && scy < H) fc = slimeTrail[scy * W + scx];
    var srx = (a.x + Math.cos(a.angle + sensorAngle) * sensorDist) | 0;
    var sry = (a.y + Math.sin(a.angle + sensorAngle) * sensorDist) | 0;
    if (srx >= 0 && srx < W && sry >= 0 && sry < H) fr = slimeTrail[sry * W + srx];
    // Turn
    if (fc > fl && fc > fr) { /* go straight */ }
    else if (fl > fr) a.angle -= turnSpeed * (0.5 + Math.random() * 0.5);
    else if (fr > fl) a.angle += turnSpeed * (0.5 + Math.random() * 0.5);
    else a.angle += (Math.random() - 0.5) * turnSpeed;
    // Move
    a.x += Math.cos(a.angle) * moveSpeed;
    a.y += Math.sin(a.angle) * moveSpeed;
    // Wrap
    if (a.x < 0) { a.x = W - 1; a.angle = Math.random() * Math.PI * 2; }
    if (a.x >= W) { a.x = 0; a.angle = Math.random() * Math.PI * 2; }
    if (a.y < 0) { a.y = H - 1; a.angle = Math.random() * Math.PI * 2; }
    if (a.y >= H) { a.y = 0; a.angle = Math.random() * Math.PI * 2; }
    // Deposit
    var ix = a.x | 0, iy = a.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      slimeTrail[iy * W + ix] = Math.min(1, slimeTrail[iy * W + ix] + 0.05);
    }
  }
  // 3x3 diffusion + decay
  var next = new Float32Array(W * H);
  for (var y = 1; y < H - 1; y++) {
    for (var x = 1; x < W - 1; x++) {
      var idx = y * W + x;
      var sum = 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          sum += slimeTrail[idx + dy * W + dx];
        }
      }
      next[idx] = sum / 9 * 0.95;
    }
  }
  slimeTrail = next;
  // Draw
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = slimeTrail[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ri];
      drawCharHSL(ch, x, y, (80 + v * 60) | 0, 80, (10 + v * 50) | 0);
    }
  }
}

registerMode('slime', {
  init: initSlime,
  render: renderSlime,
});
