import { state } from './state.js';
import { getRenderers, getMode } from './registry.js';
import { applyGlow } from './glow.js';
import { updateURL } from './router.js';

var lastTime = 0;
var fpsFrames = 0;
var fpsLast = 0;
var fpsDisplay = 0;
var fpsEl = null;

export function initLoop() {
  fpsEl = document.getElementById('fps');
}

function drawFPS() {
  fpsFrames++;
  var now = performance.now();
  if (now - fpsLast > 500) {
    fpsDisplay = Math.round(fpsFrames / ((now - fpsLast) / 1000));
    fpsFrames = 0;
    fpsLast = now;
    fpsEl.textContent = fpsDisplay + ' fps';
  }
}

export function loop(ts) {
  if (!ts) { requestAnimationFrame(loop); return; }
  if (!lastTime) lastTime = ts;
  var dt = (ts - lastTime) / 1000;
  if (dt > 0.1) dt = 0.016;
  lastTime = ts;
  state.time += dt;
  var renderers = getRenderers();
  renderers[state.currentMode]();
  applyGlow();
  drawFPS();
  requestAnimationFrame(loop);
}

export function switchMode(mode) {
  state.currentMode = mode;
  state.time = 0;
  updateURL(mode);
  state.buttons.forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode); });
  var m = getMode(mode);
  if (m && m.init) m.init();
}

export function scrollNavToMode(mode, instant) {
  var container = document.querySelector('.nav-buttons');
  var btn = container.querySelector('button[data-mode="' + mode + '"]');
  if (!btn) return;
  var cRect = container.getBoundingClientRect();
  var bRect = btn.getBoundingClientRect();
  // Check visibility with margin so buttons aren't cramped against edges
  var margin = 8;
  if (bRect.left >= cRect.left + margin && bRect.right <= cRect.right - margin) return;
  // Off left side or random mode → place button near left with padding
  if (bRect.left < cRect.left + margin) {
    container.scrollTo({ left: Math.max(0, btn.offsetLeft - 12), behavior: instant ? 'instant' : 'smooth' });
  } else {
    // Off right side → scroll just enough to show it on the right with padding
    container.scrollTo({ left: btn.offsetLeft + btn.offsetWidth - container.clientWidth + 12, behavior: instant ? 'instant' : 'smooth' });
  }
}
