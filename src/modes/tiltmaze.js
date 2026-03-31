import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Tiltmaze — tilt your phone to roll a ball through a procedurally generated maze

var tiltX = 0, tiltY = 0;
var smoothTiltX = 0, smoothTiltY = 0;
var hasMotion = false;
var motionPermission = 'unknown';
var showPrompt = true;
var promptTapped = false;
var mouseX = 0.5, mouseY = 0.5, mouseActive = false;

var onDeviceOrientation = null;
var onMouseMove = null;
var onClick = null;

var maze = []; // 2D grid: 0=path, 1=wall
var mazeW = 0, mazeH = 0;
var offsetX = 0, offsetY = 0; // offset to center maze on screen

var ballX = 0, ballY = 0;
var ballVX = 0, ballVY = 0;
var goalX = 0, goalY = 0;

var trail = []; // {x, y, age}
var MAX_TRAIL = 40;

var level = 1;
var startTime = 0;
var lastTime = 0;
var initialized = false;

// Celebration
var celebrating = false;
var celebrationTime = 0;
var particles = [];

function initTiltmaze() {
  tiltX = 0; tiltY = 0;
  smoothTiltX = 0; smoothTiltY = 0;
  hasMotion = false;
  motionPermission = 'unknown';
  showPrompt = true;
  promptTapped = false;
  mouseActive = false;
  lastTime = 0;
  initialized = false;
  level = 1;
  celebrating = false;
  trail = [];
  particles = [];

  if (typeof DeviceOrientationEvent !== 'undefined') {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      motionPermission = 'needs_tap';
      showPrompt = true;
    } else {
      motionPermission = 'trying';
      showPrompt = false;
      setupOrientation();
    }
  } else {
    motionPermission = 'unavailable';
    showPrompt = false;
  }

  onMouseMove = function(e) {
    mouseX = e.clientX / window.innerWidth;
    mouseY = e.clientY / window.innerHeight;
    if (!hasMotion) {
      mouseActive = true;
      tiltX = (mouseX - 0.5) * 2;
      tiltY = (mouseY - 0.5) * 2;
    }
  };
  window.addEventListener('mousemove', onMouseMove);

  onClick = function() {
    if (motionPermission === 'needs_tap' && !promptTapped) {
      promptTapped = true;
      DeviceOrientationEvent.requestPermission().then(function(perm) {
        if (perm === 'granted') {
          motionPermission = 'granted';
          showPrompt = false;
          setupOrientation();
        } else {
          motionPermission = 'denied';
          showPrompt = false;
        }
      }).catch(function() {
        motionPermission = 'denied';
        showPrompt = false;
      });
    }
  };
  window.addEventListener('click', onClick);
  window.addEventListener('touchstart', onClick);
}

function setupOrientation() {
  onDeviceOrientation = function(e) {
    if (e.gamma !== null && e.beta !== null) {
      hasMotion = true;
      motionPermission = 'granted';
      showPrompt = false;
      tiltX = Math.max(-1, Math.min(1, (e.gamma || 0) / 45));
      tiltY = Math.max(-1, Math.min(1, ((e.beta || 0) - 30) / 45));
    }
  };
  window.addEventListener('deviceorientation', onDeviceOrientation);
  setTimeout(function() {
    if (!hasMotion && motionPermission === 'trying') {
      motionPermission = 'unavailable';
    }
  }, 1000);
}

function generateMaze(cellsW, cellsH) {
  // DFS maze generation. Maze grid is (2*cellsW+1) x (2*cellsH+1)
  mazeW = 2 * cellsW + 1;
  mazeH = 2 * cellsH + 1;
  maze = [];
  for (var y = 0; y < mazeH; y++) {
    maze[y] = [];
    for (var x = 0; x < mazeW; x++) {
      maze[y][x] = 1; // all walls
    }
  }

  // Carve paths using DFS
  var visited = [];
  for (var vy = 0; vy < cellsH; vy++) {
    visited[vy] = [];
    for (var vx = 0; vx < cellsW; vx++) {
      visited[vy][vx] = false;
    }
  }

  var stack = [];
  var sx = 0, sy = 0;
  visited[sy][sx] = true;
  maze[sy * 2 + 1][sx * 2 + 1] = 0;
  stack.push({ x: sx, y: sy });

  var dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ];

  while (stack.length > 0) {
    var cur = stack[stack.length - 1];
    // Find unvisited neighbors
    var neighbors = [];
    for (var d = 0; d < 4; d++) {
      var nx = cur.x + dirs[d].dx;
      var ny = cur.y + dirs[d].dy;
      if (nx >= 0 && nx < cellsW && ny >= 0 && ny < cellsH && !visited[ny][nx]) {
        neighbors.push({ x: nx, y: ny, d: d });
      }
    }
    if (neighbors.length > 0) {
      var chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
      visited[chosen.y][chosen.x] = true;
      // Remove wall between cur and chosen
      var wallX = cur.x * 2 + 1 + dirs[chosen.d].dx;
      var wallY = cur.y * 2 + 1 + dirs[chosen.d].dy;
      maze[wallY][wallX] = 0;
      maze[chosen.y * 2 + 1][chosen.x * 2 + 1] = 0;
      stack.push({ x: chosen.x, y: chosen.y });
    } else {
      stack.pop();
    }
  }

  // Center maze on screen
  offsetX = Math.floor((state.COLS - mazeW) / 2);
  offsetY = Math.floor((state.ROWS - mazeH) / 2);
  if (offsetX < 0) offsetX = 0;
  if (offsetY < 2) offsetY = 2; // leave room for HUD

  // Start = top-left cell, goal = bottom-right cell
  ballX = 1;
  ballY = 1;
  ballVX = 0;
  ballVY = 0;
  goalX = (cellsW - 1) * 2 + 1;
  goalY = (cellsH - 1) * 2 + 1;
  trail = [];
}

function buildMazeForLevel() {
  var W = state.COLS;
  var H = state.ROWS - 4; // leave HUD room
  // Cells fit: (W-1)/2 x (H-1)/2, scale with level
  var baseCX = Math.floor((W - 2) / 2);
  var baseCY = Math.floor((H - 2) / 2);
  // Clamp and scale with level
  var cellsW = Math.min(baseCX, 5 + level * 2);
  var cellsH = Math.min(baseCY, 4 + level);
  if (cellsW < 3) cellsW = 3;
  if (cellsH < 3) cellsH = 3;
  generateMaze(cellsW, cellsH);
  startTime = state.time;
  celebrating = false;
  particles = [];
}

function isWall(gx, gy) {
  var ix = Math.round(gx);
  var iy = Math.round(gy);
  if (ix < 0 || ix >= mazeW || iy < 0 || iy >= mazeH) return true;
  return maze[iy][ix] === 1;
}

function renderTiltmaze() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var dt = lastTime > 0 ? t - lastTime : 0.016;
  if (dt > 0.1) dt = 0.016;
  lastTime = t;

  smoothTiltX += (tiltX - smoothTiltX) * 0.08;
  smoothTiltY += (tiltY - smoothTiltY) * 0.08;

  if (!initialized && W > 0 && H > 0) {
    buildMazeForLevel();
    initialized = true;
  }

  // Permission prompt
  if (showPrompt && motionPermission === 'needs_tap') {
    var msg1 = '[ TAP TO ENABLE MOTION ]';
    var msg2 = 'tilt to navigate the maze';
    drawCentered(msg1, Math.floor(H / 2) - 1, 200, 60, 50 + Math.sin(t * 3) * 10, 1.0);
    drawCentered(msg2, Math.floor(H / 2) + 1, 200, 40, 35, 0.7);
    return;
  }

  if (!initialized) return;

  // --- Ball physics ---
  if (!celebrating) {
    var gravity = 12 + level * 1.5;
    var friction = 0.92;
    ballVX += smoothTiltX * gravity * dt;
    ballVY += smoothTiltY * gravity * dt;
    ballVX *= friction;
    ballVY *= friction;

    // Cap velocity
    var maxV = 6;
    if (ballVX > maxV) ballVX = maxV;
    if (ballVX < -maxV) ballVX = -maxV;
    if (ballVY > maxV) ballVY = maxV;
    if (ballVY < -maxV) ballVY = -maxV;

    // Move with collision
    var newX = ballX + ballVX * dt;
    var newY = ballY + ballVY * dt;

    // X collision
    if (!isWall(newX, ballY)) {
      ballX = newX;
    } else {
      ballVX = -ballVX * 0.3; // bounce
    }
    // Y collision
    if (!isWall(ballX, newY)) {
      ballY = newY;
    } else {
      ballVY = -ballVY * 0.3;
    }

    // Clamp inside maze
    if (ballX < 0.5) ballX = 0.5;
    if (ballY < 0.5) ballY = 0.5;
    if (ballX > mazeW - 1.5) ballX = mazeW - 1.5;
    if (ballY > mazeH - 1.5) ballY = mazeH - 1.5;

    // Trail
    trail.push({ x: ballX, y: ballY, age: 0 });
    if (trail.length > MAX_TRAIL) trail.shift();

    // Check goal
    if (Math.abs(ballX - goalX) < 0.8 && Math.abs(ballY - goalY) < 0.8) {
      celebrating = true;
      celebrationTime = t;
      // Spawn celebration particles
      particles = [];
      for (var pi = 0; pi < 30; pi++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 2 + Math.random() * 5;
        particles.push({
          x: goalX, y: goalY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          hue: Math.random() * 360,
          life: 1.0,
          ch: '*+.o'[Math.floor(Math.random() * 4)]
        });
      }
    }
  }

  // --- Render maze ---
  for (var my = 0; my < mazeH; my++) {
    for (var mx = 0; mx < mazeW; mx++) {
      var sx = mx + offsetX;
      var sy = my + offsetY;
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      if (maze[my][mx] === 1) {
        // Wall
        var wallHue = 240 + Math.sin(mx * 0.3 + my * 0.3) * 30;
        var wallLight = 18 + Math.sin(t * 0.5 + mx + my) * 3;
        drawCharHSL('#', sx, sy, wallHue, 50, wallLight, 0.8);
      }
    }
  }

  // Start marker
  var ssx = 1 + offsetX;
  var ssy = 1 + offsetY;
  if (ssx >= 0 && ssx < W && ssy >= 0 && ssy < H) {
    drawCharHSL('S', ssx, ssy, 120, 70, 35, 0.6);
  }

  // Goal marker (pulsing gold)
  var gsx = goalX + offsetX;
  var gsy = goalY + offsetY;
  if (gsx >= 0 && gsx < W && gsy >= 0 && gsy < H) {
    var goalPulse = 40 + Math.sin(t * 4) * 15;
    drawCharHSL('*', gsx, gsy, 45, 90, goalPulse, 1.0);
  }

  // Trail
  for (var ti = 0; ti < trail.length; ti++) {
    var tr = trail[ti];
    tr.age += dt;
    var trAlpha = Math.max(0, 0.5 - tr.age * 0.3);
    if (trAlpha <= 0) continue;
    var trsx = Math.round(tr.x) + offsetX;
    var trsy = Math.round(tr.y) + offsetY;
    if (trsx >= 0 && trsx < W && trsy >= 0 && trsy < H) {
      drawCharHSL('.', trsx, trsy, 180, 50, 25, trAlpha);
    }
  }

  // Ball
  if (!celebrating) {
    var bsx = Math.round(ballX) + offsetX;
    var bsy = Math.round(ballY) + offsetY;
    if (bsx >= 0 && bsx < W && bsy >= 0 && bsy < H) {
      drawCharHSL('@', bsx, bsy, 120, 80, 55, 1.0);
    }
  }

  // Celebration particles
  if (celebrating) {
    var allDead = true;
    for (var ci = 0; ci < particles.length; ci++) {
      var cp = particles[ci];
      cp.x += cp.vx * dt;
      cp.y += cp.vy * dt;
      cp.vy += 3 * dt; // gravity on particles
      cp.life -= dt * 0.6;
      if (cp.life > 0) {
        allDead = false;
        var cpx = Math.round(cp.x) + offsetX;
        var cpy = Math.round(cp.y) + offsetY;
        if (cpx >= 0 && cpx < W && cpy >= 0 && cpy < H) {
          drawCharHSL(cp.ch, cpx, cpy, cp.hue, 80, 50, cp.life);
        }
      }
    }

    // "LEVEL COMPLETE" text
    var lvlMsg = 'LEVEL ' + level + ' COMPLETE!';
    drawCentered(lvlMsg, Math.floor(H / 2), 45, 90, 50 + Math.sin(t * 5) * 10, 1.0);

    if (allDead || t - celebrationTime > 2.5) {
      level++;
      buildMazeForLevel();
    }
  }

  // HUD: level, timer, tilt indicator
  var elapsed = celebrating ? (celebrationTime - startTime) : (t - startTime);
  var timeStr = 'TIME: ' + elapsed.toFixed(1) + 's';
  var lvlStr = 'LVL ' + level;
  drawTextAt(lvlStr, 1, 0, 45, 70, 40, 0.9);
  drawTextAt(timeStr, W - timeStr.length - 1, 0, 0, 0, 35, 0.7);

  // Tilt arrow indicator
  var arrowChars = ['^', '>', 'v', '<'];
  var arrowAngle = Math.atan2(smoothTiltY, smoothTiltX);
  var arrowIdx = Math.round(((arrowAngle + Math.PI) / (Math.PI * 2)) * 4) % 4;
  // Map: 0=left, 1=up, 2=right, 3=down -> remap
  var arrowMap = [3, 0, 1, 2]; // left, up, right, down
  var tiltMag = Math.sqrt(smoothTiltX * smoothTiltX + smoothTiltY * smoothTiltY);
  if (tiltMag > 0.1) {
    var arrowCh = arrowChars[arrowMap[arrowIdx]];
    var arrowHue = tiltMag > 0.5 ? 0 : 120;
    drawCharHSL(arrowCh, Math.floor(W / 2), 0, arrowHue, 70, 45, 0.8);
  }

  var source = hasMotion ? 'GYRO' : (mouseActive ? 'MOUSE' : 'IDLE');
  var sourceHue = hasMotion ? 120 : (mouseActive ? 60 : 0);
  drawTextAt(source, Math.floor(W / 2) - 3, 1, sourceHue, 50, 25, 0.5);
}

function drawCentered(text, row, hue, sat, light, alpha) {
  var col = Math.floor((state.COLS - text.length) / 2);
  drawTextAt(text, col, row, hue, sat, light, alpha);
}

function drawTextAt(text, startCol, row, hue, sat, light, alpha) {
  for (var i = 0; i < text.length; i++) {
    if (startCol + i >= 0 && startCol + i < state.COLS && row >= 0 && row < state.ROWS) {
      drawCharHSL(text[i], startCol + i, row, hue, sat, light, alpha);
    }
  }
}

function cleanupTiltmaze() {
  if (onDeviceOrientation) {
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    onDeviceOrientation = null;
  }
  if (onMouseMove) {
    window.removeEventListener('mousemove', onMouseMove);
    onMouseMove = null;
  }
  if (onClick) {
    window.removeEventListener('click', onClick);
    window.removeEventListener('touchstart', onClick);
    onClick = null;
  }
  maze = [];
  trail = [];
  particles = [];
  initialized = false;
}

registerMode('tiltmaze', { init: initTiltmaze, render: renderTiltmaze, cleanup: cleanupTiltmaze });
