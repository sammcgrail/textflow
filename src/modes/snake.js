import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var snakeBody = [];
var snakeAngle = 0;
var snakeTrailGrid;
var snakeTarget = null;

function initSnake() {
  snakeBody = [{ x: state.COLS / 2, y: state.ROWS / 2 }];
  snakeAngle = -Math.PI / 2;
  snakeTrailGrid = new Float32Array(state.COLS * state.ROWS);
  snakeTarget = null;
}
// initSnake(); — called via registerMode
function renderSnake() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!snakeTrailGrid || snakeTrailGrid.length !== W * H) initSnake();

  // Click sets target direction
  if (pointer.clicked && state.currentMode === 'snake') {
    pointer.clicked = false;
    snakeTarget = { x: pointer.gx, y: pointer.gy };
  }
  if (pointer.down && state.currentMode === 'snake') {
    snakeTarget = { x: pointer.gx, y: pointer.gy };
  }

  // Steer toward target
  if (snakeTarget) {
    var head = snakeBody[0];
    var targetAngle = Math.atan2(snakeTarget.y - head.y, snakeTarget.x - head.x);
    var diff = targetAngle - snakeAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    snakeAngle += diff * 0.08;
  }

  // Move head
  var speed = 0.4;
  var newHead = {
    x: snakeBody[0].x + Math.cos(snakeAngle) * speed,
    y: snakeBody[0].y + Math.sin(snakeAngle) * speed
  };
  // Wrap
  if (newHead.x < 0) newHead.x += W; if (newHead.x >= W) newHead.x -= W;
  if (newHead.y < 0) newHead.y += H; if (newHead.y >= H) newHead.y -= H;

  snakeBody.unshift(newHead);
  if (snakeBody.length > 200) snakeBody.pop();

  // Trail decay
  for (var i = 0; i < snakeTrailGrid.length; i++) snakeTrailGrid[i] *= 0.995;

  // Draw snake and trail
  for (var s = 0; s < snakeBody.length; s++) {
    var seg = snakeBody[s];
    var gx = seg.x | 0, gy = seg.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      snakeTrailGrid[gy * W + gx] = Math.min(1, snakeTrailGrid[gy * W + gx] + 0.3);
    }
  }

  // Render trail
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = snakeTrailGrid[y * W + x];
      if (v < 0.02) continue;
      var ri = Math.min(RAMP_DENSE.length - 1, (v * RAMP_DENSE.length) | 0);
      var hue = (120 + v * 40 + state.time * 15) % 360;
      drawCharHSL(RAMP_DENSE[ri], x, y, hue, 60 + v * 40, 15 + v * 55);
    }
  }

  // Draw snake body brighter
  for (var s = 0; s < snakeBody.length; s++) {
    var seg = snakeBody[s];
    var gx = seg.x | 0, gy = seg.y | 0;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      var bright = 1 - s / snakeBody.length;
      var ch = s === 0 ? '@' : (s < 5 ? '#' : '*');
      drawCharHSL(ch, gx, gy, (140 + bright * 30) % 360, 80, 30 + bright * 50);
    }
  }
}

registerMode('snake', {
  init: initSnake,
  render: renderSnake,
});
