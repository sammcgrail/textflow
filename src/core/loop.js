import { state } from './state.js';
import { getRenderers, getMode } from './registry.js';
import { applyGlow } from './glow.js';
import { updateURL } from './router.js';
import { beginFrame, flushFrame } from './webgl-renderer.js';
import { pointer } from './pointer.js';

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

  if (state.useWebGL) {
    beginFrame();
  }

  var renderers = getRenderers();
  renderers[state.currentMode]();

  if (state.useWebGL) {
    flushFrame(); // single draw call + bloom
  } else {
    applyGlow(); // Canvas 2D CSS blur fallback
  }

  drawFPS();
  requestAnimationFrame(loop);
}

export function switchMode(mode) {
  // Hide any mode overlay canvases from previous mode (e.g. textcube's three.js canvas)
  var overlays = document.querySelectorAll('[data-mode-overlay]');
  for (var i = 0; i < overlays.length; i++) {
    overlays[i].style.display = 'none';
  }
  state.currentMode = mode;
  state.time = 0;
  // Clear stale pointer state so clicks don't bleed between modes
  pointer.clicked = false;
  pointer.down = false;
  updateURL(mode);
  state.buttons.forEach(function(b) { b.classList.toggle('active', b.dataset.mode === mode); });
  var m = getMode(mode);
  if (m && m.init) m.init();
}

export function scrollNavToMode(mode, instant) {
  var container = document.querySelector('.nav-buttons');
  var btn = container.querySelector('button[data-mode="' + mode + '"]');
  if (!btn) return;
  var containerWidth = container.clientWidth;
  var btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
  var scrollTarget = btnCenter - containerWidth / 2;
  scrollTarget = Math.max(0, Math.min(scrollTarget, container.scrollWidth - containerWidth));
  container.scrollTo({ left: scrollTarget, behavior: instant ? 'instant' : 'smooth' });
}
