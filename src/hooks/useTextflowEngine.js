// Bridge hook — thin React wrapper around the framework-agnostic engine.
// Initializes the engine on canvas refs, starts the loop, and exposes
// mode switching + FPS to React without re-rendering at 60fps.

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  initEngine,
  startLoop,
  switchMode as engineSwitchMode,
  onFpsUpdate,
  isReady,
  getModeFromPath,
} from '../core/engine.js';
import { onPopState } from '../core/router.js';

/**
 * useTextflowEngine — connects React to the imperative textflow engine.
 *
 * @param {React.RefObject<HTMLCanvasElement>} canvasRef
 * @param {React.RefObject<HTMLCanvasElement>} glowRef
 * @returns {{ switchMode, fps, ready, currentMode }}
 */
export function useTextflowEngine(canvasRef, glowRef) {
  const [ready, setReady] = useState(false);
  const [currentMode, setCurrentMode] = useState('lava');
  const initializedRef = useRef(false);
  const fpsRef = useRef(null);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!canvasRef.current) return;
    initializedRef.current = true;

    // Prevent default context menu and text selection
    const onContextMenu = (e) => e.preventDefault();
    const onSelectStart = (e) => e.preventDefault();
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('selectstart', onSelectStart);

    // Initialize engine
    initEngine(canvasRef.current, glowRef.current);

    // Update FPS via DOM ref instead of setState (avoids re-rendering 182 buttons)
    onFpsUpdate((fps) => {
      if (fpsRef.current) fpsRef.current.textContent = fps + ' fps';
    });

    const cleanupRef = { current: null };

    // Wait for engine ready, then start
    isReady().then(() => {
      const startMode = getModeFromPath();
      // Start the render loop immediately for responsiveness
      const stop = startLoop();
      cleanupRef.current = stop;
      // Switch mode — await lazy-load before updating React state
      // to avoid race condition with R3FGem.jsx's lazy() import
      const result = engineSwitchMode(startMode);
      if (result && result.then) {
        result.then(function() {
          setCurrentMode(startMode);
          setReady(true);
        });
      } else {
        setCurrentMode(startMode);
        setReady(true);
      }

      // Handle browser back/forward button — switch to the mode in history
      // Return the promise so router.js can reset isPopstateNavigation after async load
      onPopState(function(mode) {
        var r = engineSwitchMode(mode);
        if (r && r.then) {
          return r.then(function() { setCurrentMode(mode); });
        } else {
          setCurrentMode(mode);
        }
      });
    });

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('selectstart', onSelectStart);
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = useCallback((mode) => {
    // engineSwitchMode may need to lazy-load a mode group first
    var result = engineSwitchMode(mode);
    if (result && result.then) {
      result.then(function() { setCurrentMode(mode); });
    } else {
      setCurrentMode(mode);
    }
  }, []);

  return { switchMode, fpsRef, ready, currentMode };
}
