import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var objects = [];
var tiltX = 0, tiltY = 0;
var rawBeta = 0, rawGamma = 0;
var hasMotion = false;
var mouseX = 0.5, mouseY = 0.5;
var frameCount = 0;
var stars = [];
var maxObjects = 100;
var gravityStrength = 0.12;
var quakeTimer = 0;

function handleOrientation(e) {
  rawBeta = e.beta || 0;
  rawGamma = e.gamma || 0;
  hasMotion = true;
}

function requestMotionPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then(function(s) {
      if (s === 'granted') window.addEventListener('deviceorientation', handleOrientation);
    });
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
  }
}

function handleMouseMove(e) {
  mouseX = e.clientX / window.innerWidth;
  mouseY = e.clientY / window.innerHeight;
}

function handleClick() {
  var count = 5 + Math.floor(Math.random() * 6);
  for (var i = 0; i < count; i++) {
    spawnObject();
  }
}

var objectTypes = [
  { ch: '#', mass: 2.0 },
  { ch: 'O', mass: 1.5 },
  { ch: '^', mass: 1.0 },
  { ch: '*', mass: 0.8 },
  { ch: '<', mass: 1.2 },
  { ch: '>', mass: 1.2 },
  { ch: '@', mass: 2.5 },
  { ch: '%', mass: 1.8 }
];

function spawnObject() {
  if (objects.length >= maxObjects) return;
  var t = objectTypes[Math.floor(Math.random() * objectTypes.length)];
  objects.push({
    x: 2 + Math.random() * (state.COLS - 4),
    y: 1 + Math.random() * (state.ROWS * 0.3),
    vx: (Math.random() - 0.5) * 0.5,
    vy: 0,
    ch: t.ch,
    mass: t.mass,
    hue: Math.floor(Math.random() * 360),
    bounce: 0.5 + Math.random() * 0.2,
    alive: true,
    fadeAlpha: 1.0
  });
}

function initTiltGravity() {
  objects = [];
  stars = [];
  frameCount = 0;
  tiltX = 0;
  tiltY = 0;
  rawBeta = 0;
  rawGamma = 0;
  hasMotion = false;
  mouseX = 0.5;
  mouseY = 0.5;
  quakeTimer = 0;

  // Generate star field
  for (var i = 0; i < 40; i++) {
    stars.push({
      x: Math.floor(Math.random() * state.COLS),
      y: Math.floor(Math.random() * state.ROWS),
      ch: '.',
      twinkle: Math.random() * Math.PI * 2
    });
  }

  // Initial objects
  for (var j = 0; j < 15; j++) {
    spawnObject();
  }

  requestMotionPermission();
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('click', handleClick);
  window.addEventListener('touchstart', handleClick);
}

function renderTiltGravity() {
  clearCanvas();
  frameCount++;

  // Compute tilt from device or mouse
  var targetX, targetY;
  if (hasMotion) {
    targetX = rawGamma / 45.0;
    targetY = rawBeta / 45.0;
    // Clamp
    if (targetX > 1) targetX = 1;
    if (targetX < -1) targetX = -1;
    if (targetY > 1) targetY = 1;
    if (targetY < -1) targetY = -1;
  } else {
    targetX = (mouseX - 0.5) * 2;
    targetY = (mouseY - 0.5) * 2;
  }

  // Smooth
  tiltX = tiltX * 0.85 + targetX * 0.15;
  tiltY = tiltY * 0.85 + targetY * 0.15;

  // Earthquake detection
  var tiltMag = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  if (tiltMag > 0.85) {
    quakeTimer = 20;
  }
  if (quakeTimer > 0) quakeTimer--;

  // Auto-spawn
  if (frameCount % 30 === 0) {
    spawnObject();
  }

  // Physics
  var W = state.COLS;
  var H = state.ROWS;
  var gx = tiltX * gravityStrength;
  var gy = tiltY * gravityStrength + 0.08; // base downward gravity

  if (quakeTimer > 0) {
    gx += (Math.random() - 0.5) * 0.6;
    gy += (Math.random() - 0.5) * 0.6;
  }

  for (var i = 0; i < objects.length; i++) {
    var o = objects[i];
    if (!o.alive) continue;

    o.vx += gx / o.mass;
    o.vy += gy / o.mass;

    // Damping
    o.vx *= 0.995;
    o.vy *= 0.995;

    o.x += o.vx;
    o.y += o.vy;

    // Wall collisions
    if (o.x < 1) { o.x = 1; o.vx = -o.vx * o.bounce; }
    if (o.x > W - 2) { o.x = W - 2; o.vx = -o.vx * o.bounce; }
    if (o.y < 1) { o.y = 1; o.vy = -o.vy * o.bounce; }
    if (o.y > H - 2) { o.y = H - 2; o.vy = -o.vy * o.bounce; }
  }

  // Simple collision between objects
  for (var i = 0; i < objects.length; i++) {
    var a = objects[i];
    if (!a.alive) continue;
    for (var j = i + 1; j < objects.length; j++) {
      var b = objects[j];
      if (!b.alive) continue;
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      if (Math.abs(dx) < 1.2 && Math.abs(dy) < 1.0) {
        // Swap velocities weighted by mass
        var totalMass = a.mass + b.mass;
        var nvx_a = (a.vx * (a.mass - b.mass) + 2 * b.mass * b.vx) / totalMass;
        var nvx_b = (b.vx * (b.mass - a.mass) + 2 * a.mass * a.vx) / totalMass;
        var nvy_a = (a.vy * (a.mass - b.mass) + 2 * b.mass * b.vy) / totalMass;
        var nvy_b = (b.vy * (b.mass - a.mass) + 2 * a.mass * a.vy) / totalMass;
        a.vx = nvx_a * 0.8;
        a.vy = nvy_a * 0.8;
        b.vx = nvx_b * 0.8;
        b.vy = nvy_b * 0.8;
        // Separate
        if (Math.abs(dx) < 1.2) {
          var push = (1.2 - Math.abs(dx)) * 0.5;
          a.x += dx > 0 ? push : -push;
          b.x += dx > 0 ? -push : push;
        }
      }
    }
  }

  // Dissolve bottom pile: if too many objects near bottom
  var bottomCount = 0;
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].alive && objects[i].y > H - 4) bottomCount++;
  }
  if (bottomCount > maxObjects * 0.5) {
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].alive && objects[i].y > H - 3) {
        objects[i].fadeAlpha -= 0.05;
        if (objects[i].fadeAlpha <= 0) objects[i].alive = false;
      }
    }
  }

  // Remove dead objects
  var alive = [];
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].alive) alive.push(objects[i]);
  }
  objects = alive;

  // Draw star field
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var twink = 0.2 + 0.3 * Math.sin(frameCount * 0.03 + s.twinkle);
    drawCharHSL(s.x, s.y, s.ch, 220, 20, 40, twink);
  }

  // Draw ground line
  for (var x = 0; x < W; x++) {
    drawCharHSL(x, H - 1, '_', 0, 0, 25, 0.8);
  }
  // Draw walls
  for (var y = 0; y < H; y++) {
    drawCharHSL(0, y, '|', 0, 0, 20, 0.5);
    drawCharHSL(W - 1, y, '|', 0, 0, 20, 0.5);
  }

  // Draw objects
  for (var i = 0; i < objects.length; i++) {
    var o = objects[i];
    var col = Math.round(o.x);
    var row = Math.round(o.y);
    if (col >= 0 && col < W && row >= 0 && row < H) {
      var light = 55 + Math.sin(frameCount * 0.05 + i) * 10;
      drawCharHSL(col, row, o.ch, o.hue, 80, light, o.fadeAlpha);
    }
  }

  // Tilt indicator (top-right)
  var indX = W - 8;
  var indY = 1;
  drawCharHSL(indX + 3, indY, '+', 0, 0, 50, 0.6);
  var dotX = indX + 3 + Math.round(tiltX * 3);
  var dotY = indY + Math.round(tiltY * 2);
  if (dotX >= 0 && dotX < W && dotY >= 0 && dotY < H) {
    drawCharHSL(dotX, dotY, 'o', 120, 80, 60, 1.0);
  }

  // Object count (top-left)
  var countStr = objects.length + '';
  for (var c = 0; c < countStr.length; c++) {
    drawCharHSL(1 + c, 0, countStr[c], 60, 60, 60, 0.8);
  }

  // Quake indicator
  if (quakeTimer > 0) {
    var quakeStr = 'QUAKE';
    var qx = Math.floor(W / 2 - 2);
    for (var c = 0; c < quakeStr.length; c++) {
      drawCharHSL(qx + c, 1, quakeStr[c], 0, 90, 55 + Math.random() * 20, 1.0);
    }
  }
}

function cleanupTiltGravity() {
  window.removeEventListener('deviceorientation', handleOrientation);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('click', handleClick);
  window.removeEventListener('touchstart', handleClick);
  objects = [];
  stars = [];
}

registerMode('tiltgravity', {
  init: initTiltGravity,
  render: renderTiltGravity,
  cleanup: cleanupTiltGravity
});
