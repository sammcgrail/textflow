// ============================================================
// TEXTFLOW — Entry Point
// Canvas-based ASCII text renderer. Zero DOM manipulation per frame.
// ============================================================

import { state } from './core/state.js';
import { resize } from './core/canvas.js';
import { initPointer } from './core/pointer.js';
import { initGlow } from './core/glow.js';
import { initLoop, loop, switchMode, scrollNavToMode } from './core/loop.js';
import { getModeFromPath, getRandomMode } from './core/router.js';
import { getMode, getRenderers } from './core/registry.js';

// Import all modes — each self-registers via registerMode()
import './modes/lava.js';
import './modes/rain.js';
import './modes/wave.js';
import './modes/fire.js';
import './modes/plasma.js';
import './modes/life.js';
import './modes/warp.js';
import './modes/swirl.js';
import './modes/rift.js';
import './modes/voronoi.js';
import './modes/bolt.js';
import './modes/moire.js';
import './modes/fold.js';
import './modes/copper.js';
import './modes/glitch.js';
import './modes/flock.js';
import './modes/roto.js';
import './modes/erosion.js';
import './modes/gravity.js';
import './modes/paint.js';
import './modes/ripple.js';
import './modes/sand.js';
import './modes/orbit.js';
import './modes/grow.js';
import './modes/magnet.js';
import './modes/shatter.js';
import './modes/pulse.js';
import './modes/worm.js';
import './modes/snake.js';
import './modes/bloom.js';
import './modes/fluid.js';
import './modes/spiral.js';
import './modes/cipher.js';
import './modes/aurora.js';
import './modes/pendulum.js';
import './modes/diffuse.js';
import './modes/crystal.js';
import './modes/tvstatic.js';
import './modes/crt.js';
import './modes/vhs.js';
import './modes/terminal.js';
import './modes/oscilloscope.js';
import './modes/dial.js';
import './modes/propfont.js';
import './modes/brightmatch.js';
import './modes/smoothfluid.js';
import './modes/vidascii.js';
import './modes/vidcow.js';
import './modes/vidscenes.js';
import './modes/vidfootball.js';
import './modes/vidclowns.js';
import './modes/vidneon.js';
import './modes/terrain.js';
import './modes/tunnel.js';
import './modes/noise.js';
import './modes/interference.js';
import './modes/automata.js';
import './modes/maze.js';
import './modes/langton.js';
import './modes/wave2d.js';
import './modes/heat.js';
import './modes/lorenz.js';
import './modes/galaxy.js';
import './modes/cloth.js';
import './modes/dla.js';
import './modes/slime.js';
import './modes/reaction.js';
import './modes/nbody.js';
import './modes/ants.js';
import './modes/strange.js';
import './modes/mandel.js';
import './modes/storm.js';
import './modes/starfield.js';
import './modes/matrix.js';
import './modes/snowfall.js';
import './modes/firework.js';
import './modes/kaleidoscope.js';
import './modes/radar.js';
import './modes/fountain.js';
import './modes/coral.js';
import './modes/smoke.js';
import './modes/tornado.js';
import './modes/dna.js';
import './modes/circuit.js';
import './modes/rain3d.js';
import './modes/boids.js';
import './modes/waves3d.js';
import './modes/tree.js';
import './modes/chem.js';
import './modes/typewriter.js';
import './modes/conway3.js';
import './modes/wfc.js';
import './modes/metaball.js';
import './modes/heartbeat.js';
import './modes/bubbles.js';
import './modes/waterfall.js';
import './modes/pixelsort.js';
import './modes/pendwave.js';
import './modes/hexlife.js';
import './modes/bacteria.js';
import './modes/harmonograph.js';
import './modes/topography.js';
import './modes/lissajous.js';
import './modes/embers.js';
import './modes/eclipse.js';
import './modes/caustics.js';
import './modes/constellations.js';
import './modes/dissolve.js';
import './modes/tetris.js';
import './modes/highway.js';
import './modes/cityscape.js';
import './modes/ocean.js';
import './modes/piano.js';
import './modes/clock.js';
import './modes/blackhole.js';
import './modes/fireflies.js';
import './modes/vinyl.js';
import './modes/jellyfish.js';
import './modes/campfire.js';
import './modes/roots.js';
import './modes/lightning.js';
import './modes/fern.js';
import './modes/waveform.js';
import './modes/neuron.js';
import './modes/hourglass.js';
import './modes/volcano.js';
import './modes/sonar.js';
import './modes/drops.js';
import './modes/tiles.js';
import './modes/mushroom.js';
import './modes/cascade.js';
import './modes/northern.js';
import './modes/tidal.js';
import './modes/comet.js';
import './modes/circuit2.js';
import './modes/vidjellyfish.js';
import './modes/vidlava.js';
import './modes/vidcity.js';
import './modes/vidocean.js';
import './modes/vidfireworks.js';

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('selectstart', function(e) { e.preventDefault(); });

// Initialize state
state.canvas = document.getElementById('c');
state.ctx = state.canvas.getContext('2d', { alpha: false, desynchronized: true });
state.buttons = document.querySelectorAll('nav button');
state.dpr = window.devicePixelRatio || 1;
state.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (window.innerWidth < 768);

// Initialize subsystems
resize();
initPointer();
initGlow();
initLoop();

// Attach all mode event listeners
var renderers = getRenderers();
for (var modeName in renderers) {
  var mode = getMode(modeName);
  if (mode && mode.attach) mode.attach();
}

// Resize handler
window.addEventListener('resize', function() {
  resize();
  var mode = getMode(state.currentMode);
  if (mode && mode.init) mode.init();
});

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

// Wait for font to load before starting
document.fonts.ready.then(function() {
  resize();
  var startMode = getModeFromPath();
  if (startMode !== 'lava') switchMode(startMode);
  scrollNavToMode(startMode, true);
  // Reveal nav after scroll is positioned
  var nav = document.querySelector('nav');
  nav.style.visibility = 'visible';
  nav.style.opacity = '1';
  loop();
});
