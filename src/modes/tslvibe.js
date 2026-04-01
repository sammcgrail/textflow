import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ASCII fluid simulation inspired by vibe-coded.com
var RAMP = ' .`-:;=+*#%@$';
var velX, velY, density, sz;

function I(x, y) { return y * sz + x; }

function initTslvibe() {
  sz = Math.max(state.COLS, state.ROWS) + 2;
  var n = sz * sz;
  velX = new Float32Array(n);
  velY = new Float32Array(n);
  density = new Float32Array(n);
}

function setBnd(b, x) {
  for (var i = 1; i < sz - 1; i++) {
    x[I(0, i)]      = b === 1 ? -x[I(1, i)] : x[I(1, i)];
    x[I(sz-1, i)]   = b === 1 ? -x[I(sz-2, i)] : x[I(sz-2, i)];
    x[I(i, 0)]      = b === 2 ? -x[I(i, 1)] : x[I(i, 1)];
    x[I(i, sz-1)]   = b === 2 ? -x[I(i, sz-2)] : x[I(i, sz-2)];
  }
}

function diffuse(b, x, x0, diff, dt) {
  var a = dt * diff * (sz - 2) * (sz - 2);
  for (var k = 0; k < 4; k++) {
    for (var j = 1; j < sz - 1; j++)
      for (var i = 1; i < sz - 1; i++)
        x[I(i, j)] = (x0[I(i, j)] + a * (x[I(i-1, j)] + x[I(i+1, j)] + x[I(i, j-1)] + x[I(i, j+1)])) / (1 + 4 * a);
    setBnd(b, x);
  }
}

function advect(b, d, d0, u, v, dt) {
  var dt0 = dt * (sz - 2);
  for (var j = 1; j < sz - 1; j++) {
    for (var i = 1; i < sz - 1; i++) {
      var x = i - dt0 * u[I(i, j)], y = j - dt0 * v[I(i, j)];
      if (x < 0.5) x = 0.5; if (x > sz - 1.5) x = sz - 1.5;
      if (y < 0.5) y = 0.5; if (y > sz - 1.5) y = sz - 1.5;
      var i0 = x | 0, j0 = y | 0, s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
      d[I(i, j)] = s0 * (t0 * d0[I(i0, j0)] + t1 * d0[I(i0, j0+1)]) + s1 * (t0 * d0[I(i0+1, j0)] + t1 * d0[I(i0+1, j0+1)]);
    }
  }
  setBnd(b, d);
}

function project(u, v) {
  var h = 1.0 / (sz - 2), div = new Float32Array(sz * sz), p = new Float32Array(sz * sz);
  for (var j = 1; j < sz - 1; j++)
    for (var i = 1; i < sz - 1; i++)
      div[I(i, j)] = -0.5 * h * (u[I(i+1, j)] - u[I(i-1, j)] + v[I(i, j+1)] - v[I(i, j-1)]);
  for (var k = 0; k < 4; k++) {
    for (var j2 = 1; j2 < sz - 1; j2++)
      for (var i2 = 1; i2 < sz - 1; i2++)
        p[I(i2, j2)] = (div[I(i2, j2)] + p[I(i2-1, j2)] + p[I(i2+1, j2)] + p[I(i2, j2-1)] + p[I(i2, j2+1)]) / 4;
  }
  for (var j3 = 1; j3 < sz - 1; j3++)
    for (var i3 = 1; i3 < sz - 1; i3++) {
      u[I(i3, j3)] -= 0.5 * (p[I(i3+1, j3)] - p[I(i3-1, j3)]) / h;
      v[I(i3, j3)] -= 0.5 * (p[I(i3, j3+1)] - p[I(i3, j3-1)]) / h;
    }
  setBnd(1, u); setBnd(2, v);
}

var prevPx = -1, prevPy = -1;

function renderTslvibe() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, dt = 0.15;
  if (!density || sz !== Math.max(W, H) + 2) initTslvibe();

  // Mouse interaction
  if (pointer.down || pointer.clicked) {
    var px = (pointer.gx | 0) + 1, py = (pointer.gy | 0) + 1;
    if (px > 0 && px < sz - 1 && py > 0 && py < sz - 1) {
      for (var dy = -2; dy <= 2; dy++)
        for (var dx = -2; dx <= 2; dx++) {
          var nx = px + dx, ny = py + dy;
          if (nx > 0 && nx < sz - 1 && ny > 0 && ny < sz - 1)
            density[I(nx, ny)] += 80;
        }
      if (prevPx >= 0) { velX[I(px, py)] += (px - prevPx) * 8; velY[I(px, py)] += (py - prevPy) * 8; }
      prevPx = px; prevPy = py;
    }
    pointer.clicked = false;
  } else { prevPx = -1; prevPy = -1; }

  // Ambient vortices
  if (Math.random() < 0.04) {
    var rx = 3 + (Math.random() * (sz - 6)) | 0, ry = 3 + (Math.random() * (sz - 6)) | 0;
    var angle = Math.random() * Math.PI * 2, force = 3 + Math.random() * 5;
    velX[I(rx, ry)] += Math.cos(angle) * force;
    velY[I(rx, ry)] += Math.sin(angle) * force;
    density[I(rx, ry)] += 30 + Math.random() * 50;
  }

  // Velocity step
  var tmpVX = new Float32Array(sz * sz), tmpVY = new Float32Array(sz * sz);
  diffuse(1, tmpVX, velX, 0.0001, dt); diffuse(2, tmpVY, velY, 0.0001, dt);
  project(tmpVX, tmpVY);
  advect(1, velX, tmpVX, tmpVX, tmpVY, dt); advect(2, velY, tmpVY, tmpVX, tmpVY, dt);
  project(velX, velY);

  // Density step
  var tmpD = new Float32Array(sz * sz);
  diffuse(0, tmpD, density, 0.0002, dt);
  advect(0, density, tmpD, velX, velY, dt);

  // Decay
  for (var i = 0; i < density.length; i++) { density[i] *= 0.985; if (density[i] < 0.01) density[i] = 0; }

  // Render ASCII
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var d = density[I(x + 1, y + 1)];
      if (d < 0.5) continue;
      var vx = velX[I(x + 1, y + 1)], vy = velY[I(x + 1, y + 1)];
      var speed = Math.sqrt(vx * vx + vy * vy);
      var ci = Math.min((d / 60 * RAMP.length) | 0, RAMP.length - 1);
      var hue = ((Math.atan2(vy, vx) * 180 / Math.PI) + 360 + state.time * 15) % 360;
      var sat = 60 + Math.min(speed * 10, 35);
      var lit = 20 + Math.min(d * 0.6, 55);
      drawCharHSL(RAMP[ci], x, y, hue, sat, lit);
    }
  }
}

registerMode('tslvibe', { init: initTslvibe, render: renderTslvibe });
