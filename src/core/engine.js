// ============================================================
// engine.js — Framework-agnostic textflow engine.
// Shared initialization, loop, and mode switching logic used by
// both entry.js (legacy esbuild IIFE) and useTextflowEngine (React).
// ============================================================

import { state } from './state.js';
import { resize } from './canvas.js';
import { initPointer, pointer } from './pointer.js';
import { initGlow, applyGlow } from './glow.js';
import { initWebGL, beginFrame, flushFrame } from './webgl-renderer.js';
import { loadMsdfAtlas } from './atlas.js';
import { getMode, getRenderers } from './registry.js';
import { getModeFromPath, getRandomMode, updateURL } from './router.js';

// Eagerly load core modes only; other groups are lazy-loaded on demand.
// The legacy esbuild path (entry.js) imports ../modes/index.js directly.
import '../modes/groups/core.js';
import { ensureModeLoaded } from '../modes/modeGroups.js';

// --- Private loop state ---
var lastTime = 0;
var fpsFrames = 0;
var fpsLast = 0;
var fpsDisplay = 0;
var rafId = null;
var fpsCallback = null;
var modeChangeCallback = null;
var readyResolve = null;
var readyPromise = new Promise(function(resolve) { readyResolve = resolve; });
var attachedModes = {}; // Track which modes have had attach() called
var engineInitialized = false;

// --- Public API ---

/**
 * Initialize the engine — sets up WebGL/Canvas2D, pointer, glow, font loading.
 * @param {HTMLCanvasElement} canvas — main render canvas
 * @param {HTMLCanvasElement} [glowCanvas] — glow overlay canvas (optional)
 */
export function initEngine(canvas, glowCanvas) {
  state.canvas = canvas;
  state.dpr = window.devicePixelRatio || 1;
  state.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (window.innerWidth < 768);

  // Try WebGL 2 first, fall back to Canvas 2D
  var webglOK = initWebGL();
  if (!webglOK) {
    console.log('WebGL 2 not available, using Canvas 2D fallback');
    state.ctx = state.canvas.getContext('2d', { alpha: false, desynchronized: true });
    state.useWebGL = false;
  } else {
    console.log('WebGL 2 renderer active');
    // Keep a 2D context reference for font/text measurement
    var measureCanvas = document.createElement('canvas');
    state.ctx = measureCanvas.getContext('2d');
  }

  // Hide glow canvas when using WebGL (bloom shader handles it)
  if (state.useWebGL && glowCanvas) {
    glowCanvas.style.display = 'none';
  }

  // Initialize subsystems
  resize();
  initPointer();
  initGlow();

  // Attach all currently registered mode event listeners
  var renderers = getRenderers();
  for (var modeName in renderers) {
    var mode = getMode(modeName);
    if (mode && mode.attach) {
      mode.attach();
      attachedModes[modeName] = true;
    }
  }
  engineInitialized = true;

  // Resize handler
  window.addEventListener('resize', handleResize);

  // Wait for font + MSDF atlas, then mark ready
  Promise.all([
    document.fonts.ready,
    state.useWebGL ? loadMsdfAtlas() : Promise.resolve(),
  ]).then(function() {
    resize();
    readyResolve();
  });
}

function handleResize() {
  resize();
  var mode = getMode(state.currentMode);
  if (mode && mode.init) mode.init();
}

/**
 * Start the rAF loop. Returns a stop function.
 */
export function startLoop() {
  lastTime = 0;
  fpsFrames = 0;
  fpsLast = 0;

  function loop(ts) {
    if (!ts) { rafId = requestAnimationFrame(loop); return; }
    if (!lastTime) lastTime = ts;
    var dt = (ts - lastTime) / 1000;
    if (dt > 0.1) dt = 0.016;
    lastTime = ts;
    state.time += dt;

    if (state.useWebGL) beginFrame();

    var renderers = getRenderers();
    if (renderers[state.currentMode]) {
      renderers[state.currentMode]();
    }

    if (state.useWebGL) {
      flushFrame();
    } else {
      applyGlow();
    }

    // FPS tracking
    fpsFrames++;
    var now = performance.now();
    if (now - fpsLast > 500) {
      fpsDisplay = Math.round(fpsFrames / ((now - fpsLast) / 1000));
      fpsFrames = 0;
      fpsLast = now;
      if (fpsCallback) fpsCallback(fpsDisplay);
    }

    rafId = requestAnimationFrame(loop);
  }

  loop();

  return function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    window.removeEventListener('resize', handleResize);
  };
}

/**
 * Perform the actual mode switch (synchronous portion).
 */
function doSwitch(mode) {
  // Cleanup previous mode (e.g. dispose three.js resources)
  var prev = getMode(state.currentMode);
  if (prev && prev.cleanup) prev.cleanup();
  // Hide any mode overlay canvases from previous mode
  var overlays = document.querySelectorAll('[data-mode-overlay]');
  for (var i = 0; i < overlays.length; i++) {
    overlays[i].style.display = 'none';
  }
  state.currentMode = mode;
  state.time = 0;
  pointer.clicked = false;
  pointer.down = false;
  updateURL(mode);
  if (modeChangeCallback) modeChangeCallback(mode);
  var m = getMode(mode);
  if (m && m.init) m.init();
}

/**
 * Attach event listeners for any newly registered modes (after lazy loading).
 */
function attachNewModes() {
  if (!engineInitialized) return;
  var renderers = getRenderers();
  for (var modeName in renderers) {
    if (!attachedModes[modeName]) {
      var mode = getMode(modeName);
      if (mode && mode.attach) mode.attach();
      attachedModes[modeName] = true;
    }
  }
}

/**
 * Switch to a different mode — loads the mode group if needed, then switches.
 * Returns a Promise that resolves after the switch is complete.
 */
export function switchMode(mode) {
  // If mode is already registered, switch synchronously
  var m = getMode(mode);
  if (m) {
    doSwitch(mode);
    return Promise.resolve();
  }
  // Otherwise, lazy-load the group first
  return ensureModeLoaded(mode).then(function() {
    attachNewModes();
    doSwitch(mode);
  });
}

/**
 * Register an FPS update callback — called every ~500ms with the current FPS number.
 */
export function onFpsUpdate(callback) {
  fpsCallback = callback;
}

/**
 * Register a mode-change callback — called with the new mode name after each switch.
 */
export function onModeChange(callback) {
  modeChangeCallback = callback;
}

/**
 * Returns the current mode name.
 */
export function getCurrentMode() {
  return state.currentMode;
}

/**
 * Returns a Promise that resolves when the engine is fully initialized
 * (fonts loaded, MSDF atlas loaded if WebGL).
 */
export function isReady() {
  return readyPromise;
}

// Re-export utilities that callers need
export { getModeFromPath, getRandomMode };
export { getRenderers };
