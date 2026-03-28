import { state } from './state.js';

export var pointer = { down: false, x: 0, y: 0, gx: 0, gy: 0, clicked: false };

export function screenToGrid(clientX, clientY) {
  return {
    gx: clientX / state.CHAR_W,
    gy: (clientY - state.NAV_H) / state.CHAR_H
  };
}

export function initPointer() {
  var canvas = state.canvas;

  canvas.addEventListener('mousedown', function(e) {
    pointer.down = true; pointer.clicked = true;
    var g = screenToGrid(e.clientX, e.clientY);
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  });
  canvas.addEventListener('mousemove', function(e) {
    var g = screenToGrid(e.clientX, e.clientY);
    pointer.x = e.clientX; pointer.y = e.clientY;
    pointer.gx = g.gx; pointer.gy = g.gy;
  });
  canvas.addEventListener('mouseup', function() { pointer.down = false; });
  canvas.addEventListener('mouseleave', function() { pointer.down = false; });
  canvas.addEventListener('touchstart', function(e) {
    e.preventDefault();
    pointer.down = true; pointer.clicked = true;
    var t = e.touches[0];
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
  canvas.addEventListener('touchend', function() { pointer.down = false; });
  canvas.addEventListener('touchcancel', function() { pointer.down = false; });
}
