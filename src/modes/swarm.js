import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var swAgents, swTrail, swW, swH, swGroups;

function initSwarm() {
  swW = state.COLS; swH = state.ROWS;
  swTrail = new Float32Array(swW * swH * 3); // r,g,b-ish: stores hue, sat, life
  swAgents = [];
  swGroups = [
    { hue: 0, cx: swW * 0.25, cy: swH * 0.25 },
    { hue: 90, cx: swW * 0.75, cy: swH * 0.25 },
    { hue: 200, cx: swW * 0.5, cy: swH * 0.75 },
    { hue: 300, cx: swW * 0.25, cy: swH * 0.75 }
  ];
  for (var g = 0; g < swGroups.length; g++) {
    var grp = swGroups[g];
    for (var i = 0; i < 80; i++) {
      swAgents.push({
        x: grp.cx + (Math.random() - 0.5) * 20,
        y: grp.cy + (Math.random() - 0.5) * 15,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        group: g,
        hue: grp.hue + (Math.random() - 0.5) * 20
      });
    }
  }
}

function renderSwarm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (swW !== W || swH !== H) initSwarm();
  var t = state.time * 0.001;

  // Click spawns burst of 30 particles
  if (pointer.clicked && state.currentMode === 'swarm') {
    pointer.clicked = false;
    var g = (Math.random() * swGroups.length) | 0;
    for (var i = 0; i < 30; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 0.5 + Math.random() * 1.5;
      swAgents.push({
        x: pointer.gx, y: pointer.gy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        group: g,
        hue: swGroups[g].hue + (Math.random() - 0.5) * 20
      });
    }
  }

  // Decay trail
  for (var j = 0; j < swW * swH; j++) {
    var idx = j * 3;
    swTrail[idx + 2] *= 0.93; // life/brightness decay
  }

  // Moving group centers (flowing ribbon targets)
  for (var g = 0; g < swGroups.length; g++) {
    var grp = swGroups[g];
    grp.cx = W * 0.5 + Math.sin(t * 0.7 + g * 1.5) * W * 0.35;
    grp.cy = H * 0.5 + Math.cos(t * 0.5 + g * 2.1) * H * 0.35;
  }

  // Update agents
  for (var i = swAgents.length - 1; i >= 0; i--) {
    var a = swAgents[i];
    var grp = swGroups[a.group];

    // Steer toward group center
    var dx = grp.cx - a.x;
    var dy = grp.cy - a.y;
    var dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
    a.vx += (dx / dist) * 0.08;
    a.vy += (dy / dist) * 0.08;

    // Separation from nearby same-group agents (check a few random neighbors)
    for (var j = 0; j < 3; j++) {
      var ni = (Math.random() * swAgents.length) | 0;
      var n = swAgents[ni];
      if (n.group !== a.group) continue;
      var sdx = a.x - n.x, sdy = a.y - n.y;
      var sd = sdx * sdx + sdy * sdy;
      if (sd < 4 && sd > 0.01) {
        a.vx += sdx * 0.1;
        a.vy += sdy * 0.1;
      }
    }

    // Drag acts as attractor
    if (pointer.down && state.currentMode === 'swarm') {
      var pdx = pointer.gx - a.x;
      var pdy = pointer.gy - a.y;
      var pdist = Math.sqrt(pdx * pdx + pdy * pdy) + 0.1;
      if (pdist < 25) {
        a.vx += (pdx / pdist) * 0.15;
        a.vy += (pdy / pdist) * 0.15;
      }
    }

    // Limit speed
    var spd = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
    if (spd > 2) { a.vx = (a.vx / spd) * 2; a.vy = (a.vy / spd) * 2; }

    a.x += a.vx;
    a.y += a.vy;
    a.vx *= 0.97;
    a.vy *= 0.97;

    // Wrap around edges
    if (a.x < 0) a.x += W;
    if (a.x >= W) a.x -= W;
    if (a.y < 0) a.y += H;
    if (a.y >= H) a.y -= H;

    // Stamp trail
    var ix = a.x | 0, iy = a.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var tidx = (iy * W + ix) * 3;
      swTrail[tidx] = a.hue;
      swTrail[tidx + 1] = 95;
      swTrail[tidx + 2] = Math.min(1, swTrail[tidx + 2] + 0.4);
    }
  }

  // Render trail and agents
  var trailChars = ['.', ':', '+', '*', '#', '@'];
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var tidx = (y * W + x) * 3;
      var life = swTrail[tidx + 2];
      if (life < 0.03) continue;
      var ci = (life * trailChars.length) | 0;
      ci = Math.min(ci, trailChars.length - 1);
      var hue = (swTrail[tidx] + t * 10) % 360;
      var light = (40 + life * 25) | 0;
      drawCharHSL(trailChars[ci], x, y, hue | 0, (swTrail[tidx + 1]) | 0, light);
    }
  }

  // Draw agents as bright dots on top
  for (var i = 0; i < swAgents.length; i++) {
    var a = swAgents[i];
    var ix = a.x | 0, iy = a.y | 0;
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      var hue = (a.hue + t * 15) % 360;
      drawCharHSL('@', ix, iy, hue | 0, 100, 65);
    }
  }

  // Cap agents
  if (swAgents.length > 600) swAgents.splice(0, swAgents.length - 600);
}

registerMode('swarm', {
  init: initSwarm,
  render: renderSwarm,
});
