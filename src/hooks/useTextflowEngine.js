// Bridge hook — connects React to the imperative textflow WebGL 2 renderer.
// Initializes the engine on a canvas element, runs the animation loop,
// and exposes mode switching + FPS to React.

import { useRef, useEffect, useCallback, useState } from 'react';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { initPointer } from '../core/pointer.js';
import { initGlow } from '../core/glow.js';
import { initWebGL } from '../core/webgl-renderer.js';
import { loadMsdfAtlas } from '../core/atlas.js';
import { getMode, getRenderers } from '../core/registry.js';
import { beginFrame, flushFrame } from '../core/webgl-renderer.js';
import { applyGlow } from '../core/glow.js';
import { pointer } from '../core/pointer.js';
import { updateURL } from '../core/router.js';

// Import all modes so they self-register
import '../modes/lava.js';
import '../modes/rain.js';
import '../modes/wave.js';
import '../modes/fire.js';
import '../modes/plasma.js';
import '../modes/life.js';
import '../modes/warp.js';
import '../modes/swirl.js';
import '../modes/rift.js';
import '../modes/voronoi.js';
import '../modes/bolt.js';
import '../modes/moire.js';
import '../modes/fold.js';
import '../modes/copper.js';
import '../modes/glitch.js';
import '../modes/flock.js';
import '../modes/roto.js';
import '../modes/erosion.js';
import '../modes/gravity.js';
import '../modes/paint.js';
import '../modes/ripple.js';
import '../modes/sand.js';
import '../modes/orbit.js';
import '../modes/grow.js';
import '../modes/magnet.js';
import '../modes/shatter.js';
import '../modes/pulse.js';
import '../modes/worm.js';
import '../modes/snake.js';
import '../modes/bloom.js';
import '../modes/fluid.js';
import '../modes/spiral.js';
import '../modes/cipher.js';
import '../modes/aurora.js';
import '../modes/pendulum.js';
import '../modes/diffuse.js';
import '../modes/crystal.js';
import '../modes/tvstatic.js';
import '../modes/crt.js';
import '../modes/vhs.js';
import '../modes/terminal.js';
import '../modes/oscilloscope.js';
import '../modes/dial.js';
import '../modes/propfont.js';
import '../modes/brightmatch.js';
import '../modes/smoothfluid.js';
import '../modes/vidascii.js';
import '../modes/vidcow.js';
import '../modes/vidscenes.js';
import '../modes/vidfootball.js';
import '../modes/vidclowns.js';
import '../modes/vidneon.js';
import '../modes/terrain.js';
import '../modes/tunnel.js';
import '../modes/noise.js';
import '../modes/interference.js';
import '../modes/automata.js';
import '../modes/maze.js';
import '../modes/langton.js';
import '../modes/wave2d.js';
import '../modes/heat.js';
import '../modes/lorenz.js';
import '../modes/galaxy.js';
import '../modes/cloth.js';
import '../modes/dla.js';
import '../modes/slime.js';
import '../modes/reaction.js';
import '../modes/nbody.js';
import '../modes/ants.js';
import '../modes/strange.js';
import '../modes/mandel.js';
import '../modes/storm.js';
import '../modes/starfield.js';
import '../modes/matrix.js';
import '../modes/snowfall.js';
import '../modes/firework.js';
import '../modes/kaleidoscope.js';
import '../modes/radar.js';
import '../modes/fountain.js';
import '../modes/coral.js';
import '../modes/smoke.js';
import '../modes/tornado.js';
import '../modes/dna.js';
import '../modes/circuit.js';
import '../modes/rain3d.js';
import '../modes/boids.js';
import '../modes/waves3d.js';
import '../modes/tree.js';
import '../modes/chem.js';
import '../modes/typewriter.js';
import '../modes/conway3.js';
import '../modes/wfc.js';
import '../modes/metaball.js';
import '../modes/heartbeat.js';
import '../modes/bubbles.js';
import '../modes/waterfall.js';
import '../modes/pixelsort.js';
import '../modes/pendwave.js';
import '../modes/hexlife.js';
import '../modes/bacteria.js';
import '../modes/harmonograph.js';
import '../modes/topography.js';
import '../modes/lissajous.js';
import '../modes/embers.js';
import '../modes/eclipse.js';
import '../modes/caustics.js';
import '../modes/constellations.js';
import '../modes/dissolve.js';
import '../modes/tetris.js';
import '../modes/highway.js';
import '../modes/cityscape.js';
import '../modes/ocean.js';
import '../modes/piano.js';
import '../modes/clock.js';
import '../modes/blackhole.js';
import '../modes/fireflies.js';
import '../modes/vinyl.js';
import '../modes/jellyfish.js';
import '../modes/campfire.js';
import '../modes/roots.js';
import '../modes/lightning.js';
import '../modes/fern.js';
import '../modes/waveform.js';
import '../modes/neuron.js';
import '../modes/hourglass.js';
import '../modes/volcano.js';
import '../modes/sonar.js';
import '../modes/drops.js';
import '../modes/tiles.js';
import '../modes/mushroom.js';
import '../modes/cascade.js';
import '../modes/northern.js';
import '../modes/tidal.js';
import '../modes/comet.js';
import '../modes/circuit2.js';
import '../modes/vidjellyfish.js';
import '../modes/vidlava.js';
import '../modes/vidcity.js';
import '../modes/vidocean.js';
import '../modes/vidfireworks.js';
import '../modes/rotozoomer.js';
import '../modes/rotowarp.js';
import '../modes/rotogrid.js';
import '../modes/rotoprism.js';
import '../modes/rotospiral.js';
import '../modes/rototunnel.js';
import '../modes/rotoplasma.js';
import '../modes/rotoflower.js';
import '../modes/rotocube.js';
import '../modes/rotoscroll.js';
import '../modes/rotodisk.js';
import '../modes/vidgears.js';
import '../modes/vidink.js';
import '../modes/vidaurora.js';
import '../modes/vidgyro.js';
import '../modes/vidstars.js';
import '../modes/cat.js';
import '../modes/buttons.js';
import '../modes/handpose.js';
import '../modes/facemesh.js';
import '../modes/webcam.js';
import '../modes/facepass.js';
import '../modes/headcube.js';
import '../modes/camtrail.js';
import '../modes/camhalftone.js';
import '../modes/camdepth.js';
import '../modes/faceglitch.js';
import '../modes/handfire.js';
import '../modes/handlaser.js';
import '../modes/handgravity.js';
import '../modes/facepaint.js';
import '../modes/facemirror.js';
import '../modes/threeterrain.js';
import '../modes/threetunnel.js';
import '../modes/threeparticles.js';
import '../modes/threeshapes.js';
import '../modes/threefacecube.js';
import '../modes/textcube.js';

/**
 * useTextflowEngine — initializes the imperative WebGL 2 renderer on a canvas,
 * runs the rAF loop, and returns controls for React.
 *
 * @param {React.RefObject<HTMLCanvasElement>} canvasRef
 * @param {React.RefObject<HTMLCanvasElement>} glowRef
 * @returns {{ switchMode, fps, ready, currentMode }}
 */
export function useTextflowEngine(canvasRef, glowRef) {
  const [fps, setFps] = useState(0);
  const [ready, setReady] = useState(false);
  const [currentMode, setCurrentMode] = useState('lava');
  const initializedRef = useRef(false);
  const rafRef = useRef(null);

  // Internal loop state (not React state to avoid re-renders at 60fps)
  const loopState = useRef({
    lastTime: 0,
    fpsFrames: 0,
    fpsLast: 0,
  });

  useEffect(() => {
    if (initializedRef.current) return;
    if (!canvasRef.current) return;
    initializedRef.current = true;

    // Prevent default context menu and text selection
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());

    // Initialize state
    state.canvas = canvasRef.current;
    state.dpr = window.devicePixelRatio || 1;
    state.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (window.innerWidth < 768);

    // Try WebGL 2
    const webglOK = initWebGL();
    if (!webglOK) {
      console.log('WebGL 2 not available, using Canvas 2D fallback');
      state.ctx = state.canvas.getContext('2d', { alpha: false, desynchronized: true });
      state.useWebGL = false;
    } else {
      console.log('WebGL 2 renderer active');
      const measureCanvas = document.createElement('canvas');
      state.ctx = measureCanvas.getContext('2d');
    }

    // Hide glow canvas when using WebGL
    if (state.useWebGL && glowRef.current) {
      glowRef.current.style.display = 'none';
    }

    // Initialize subsystems
    resize();
    initPointer();
    initGlow();

    // Attach all mode event listeners
    const renderers = getRenderers();
    for (const modeName in renderers) {
      const mode = getMode(modeName);
      if (mode && mode.attach) mode.attach();
    }

    // Resize handler
    const handleResize = () => {
      resize();
      const mode = getMode(state.currentMode);
      if (mode && mode.init) mode.init();
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    function loop(ts) {
      if (!ts) { rafRef.current = requestAnimationFrame(loop); return; }
      const ls = loopState.current;
      if (!ls.lastTime) ls.lastTime = ts;
      let dt = (ts - ls.lastTime) / 1000;
      if (dt > 0.1) dt = 0.016;
      ls.lastTime = ts;
      state.time += dt;

      if (state.useWebGL) beginFrame();

      const renderers = getRenderers();
      if (renderers[state.currentMode]) {
        renderers[state.currentMode]();
      }

      if (state.useWebGL) {
        flushFrame();
      } else {
        applyGlow();
      }

      // FPS tracking
      ls.fpsFrames++;
      const now = performance.now();
      if (now - ls.fpsLast > 500) {
        const currentFps = Math.round(ls.fpsFrames / ((now - ls.fpsLast) / 1000));
        ls.fpsFrames = 0;
        ls.fpsLast = now;
        setFps(currentFps);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    // Wait for font + MSDF atlas, then start
    Promise.all([
      document.fonts.ready,
      state.useWebGL ? loadMsdfAtlas() : Promise.resolve(),
    ]).then(() => {
      resize();

      // Determine start mode from URL
      const renderers = getRenderers();
      const path = window.location.pathname.replace(/\/+$/, '');
      const parts = path.split('/');
      const last = parts[parts.length - 1];
      let startMode = (last && renderers[last]) ? last : 'lava';

      // Switch to start mode
      internalSwitchMode(startMode);
      setReady(true);
      loop();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function internalSwitchMode(mode) {
    // Hide any mode overlay canvases from previous mode
    const overlays = document.querySelectorAll('[data-mode-overlay]');
    for (let i = 0; i < overlays.length; i++) {
      overlays[i].style.display = 'none';
    }
    state.currentMode = mode;
    state.time = 0;
    pointer.clicked = false;
    pointer.down = false;
    updateURL(mode);
    const m = getMode(mode);
    if (m && m.init) m.init();
    setCurrentMode(mode);
  }

  const switchMode = useCallback((mode) => {
    internalSwitchMode(mode);
  }, []);

  return { switchMode, fps, ready, currentMode };
}
