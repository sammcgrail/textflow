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
  // Only scroll if button is not already visible in the container
  var cRect = container.getBoundingClientRect();
  var bRect = btn.getBoundingClientRect();
  if (bRect.left >= cRect.left && bRect.right <= cRect.right) return; // already visible
  // Scroll just enough to bring button into view with some padding
  var pad = 40;
  if (bRect.left < cRect.left) {
    container.scrollTo({ left: btn.offsetLeft - pad, behavior: instant ? 'instant' : 'smooth' });
  } else {
    container.scrollTo({ left: btn.offsetLeft + btn.offsetWidth - container.clientWidth + pad, behavior: instant ? 'instant' : 'smooth' });
  }
}
