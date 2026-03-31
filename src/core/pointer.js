import { state } from './state.js';

export var pointer = { down: false, x: 0, y: 0, gx: 0, gy: 0, clicked: false };

var startX = 0;
var startY = 0;
var CLICK_THRESHOLD = 10; // pixels — movement beyond this = drag, not click

export function screenToGrid(clientX, clientY) {
  return {
    gx: clientX / state.CHAR_W,
    gy: (clientY - state.NAV_H) / state.CHAR_H
  };
}

export function initPointer() {
  var canvas = state.canvas;

  canvas.addEventListener('mousedown', function(e) {
    pointer.down = true;
    startX = e.clientX; startY = e.clientY;
    var g = screenToGrid(e.clientX, e.clientY);
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  });
  canvas.addEventListener('mousemove', function(e) {
    var g = screenToGrid(e.clientX, e.clientY);
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  });
  canvas.addEventListener('mouseup', function(e) {
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) < CLICK_THRESHOLD) {
      pointer.clicked = true;
    }
    pointer.down = false;
  });
  canvas.addEventListener('mouseleave', function() { pointer.down = false; });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    pointer.down = true;
    var t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    var g = screenToGrid(t.clientX, t.clientY);
    pointer.x = t.clientX; pointer.y = t.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  }, { passive: false });
  canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var t = e.touches[0];
    var g = screenToGrid(t.clientX, t.clientY);
    pointer.x = t.clientX; pointer.y = t.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  }, { passive: false });
  canvas.addEventListener('touchend', function(e) {
    var dx = pointer.x - startX;
    var dy = pointer.y - startY;
    if (Math.sqrt(dx * dx + dy * dy) < CLICK_THRESHOLD) {
      pointer.clicked = true;
    }
    pointer.down = false;
  });
  canvas.addEventListener('touchcancel', function() { pointer.down = false; });
}
