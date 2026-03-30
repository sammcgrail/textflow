// ============================================================
// TEXTFLOW — Entry Point (legacy esbuild IIFE build)
// Uses the shared engine module for initialization and loop.
// ============================================================

import { state } from './core/state.js';
import {
  initEngine,
  startLoop,
  switchMode,
  isReady,
  getModeFromPath,
  getRandomMode,
} from './core/engine.js';
import { scrollNavToMode } from './core/loop.js';

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('selectstart', function(e) { e.preventDefault(); });

// Initialize engine with DOM elements
var canvas = document.getElementById('c');
var glowCanvas = document.getElementById('glow');
initEngine(canvas, glowCanvas);

// Legacy path: wire up nav buttons from static HTML
state.buttons = document.querySelectorAll('nav button');

// Button click handlers
state.buttons.forEach(function(b) {
  b.addEventListener('click', function() { switchMode(b.dataset.mode); scrollNavToMode(b.dataset.mode); });
});

// Logo click -> random mode
document.getElementById('logo-btn').addEventListener('click', function() {
  var mode = getRandomMode();
  switchMode(mode);
  scrollNavToMode(mode);
});

// Mouse wheel horizontal scrolling on nav bar (desktop)
var navBtnsEl = document.querySelector('.nav-buttons');
navBtnsEl.addEventListener('wheel', function(e) {
  e.preventDefault();
  navBtnsEl.scrollLeft += e.deltaY || e.deltaX;
}, { passive: false });

// Wait for engine ready, then start
isReady().then(function() {
  var startMode = getModeFromPath();
  switchMode(startMode);
  scrollNavToMode(startMode, true);
  var nav = document.querySelector('nav');
  nav.style.visibility = 'visible';
  nav.style.opacity = '1';
  startLoop();
});
