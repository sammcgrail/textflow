import React, { useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { MODES } from './modes-list.js';
import { useTextflowEngine } from './hooks/useTextflowEngine.js';

// R3F overlay components — lazy loaded, only in Vite build
const R3FGem = lazy(() => import('./components/R3FGem.jsx'));

export default function App() {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);
  const navButtonsRef = useRef(null);

  const { switchMode, fpsRef, ready, currentMode } = useTextflowEngine(canvasRef, glowRef);

  // Handle logo click — random mode
  const handleLogoClick = useCallback(() => {
    const filtered = MODES.filter((m) => m.id !== 'vidascii');
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    switchMode(random.id);
  }, [switchMode]);

  // Handle mode button click
  const handleModeClick = useCallback((modeId) => {
    switchMode(modeId);
    // Blur the button so spacebar doesn't re-trigger it
    if (document.activeElement) document.activeElement.blur();
    // Scroll nav to mode
    if (navButtonsRef.current) {
      const btn = navButtonsRef.current.querySelector(`button[data-mode="${modeId}"]`);
      if (btn) {
        const containerWidth = navButtonsRef.current.clientWidth;
        const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
        let scrollTarget = btnCenter - containerWidth / 2;
        scrollTarget = Math.max(0, Math.min(scrollTarget, navButtonsRef.current.scrollWidth - containerWidth));
        navButtonsRef.current.scrollTo({ left: scrollTarget, behavior: 'smooth' });
      }
    }
  }, [switchMode]);

  // Scroll nav to active mode on ready
  useEffect(() => {
    if (ready && navButtonsRef.current) {
      const btn = navButtonsRef.current.querySelector(`button[data-mode="${currentMode}"]`);
      if (btn) {
        const containerWidth = navButtonsRef.current.clientWidth;
        const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
        let scrollTarget = btnCenter - containerWidth / 2;
        scrollTarget = Math.max(0, Math.min(scrollTarget, navButtonsRef.current.scrollWidth - containerWidth));
        navButtonsRef.current.scrollTo({ left: scrollTarget, behavior: 'instant' });
      }
    }
  }, [ready, currentMode]);

  // Prevent spacebar from activating focused buttons or scrolling
  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Mouse wheel horizontal scrolling on nav bar
  useEffect(() => {
    const el = navButtonsRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <>
      <nav style={ready ? { visibility: 'visible', opacity: 1 } : { visibility: 'hidden' }}>
        <span className="logo" onClick={handleLogoClick} style={{ cursor: 'pointer' }}>
          textflow
        </span>
        <div className="nav-buttons" ref={navButtonsRef}>
          {MODES.map((m) => (
            <button
              key={m.id}
              data-mode={m.id}
              className={currentMode === m.id ? 'active' : ''}
              onClick={() => handleModeClick(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </nav>

      <canvas id="c" ref={canvasRef} />
      <canvas id="glow" ref={glowRef} />

      {/* R3F overlay — only renders when r3fgem mode is active */}
      <Suspense fallback={null}>
        <R3FGem visible={currentMode === 'r3fgem'} />
      </Suspense>

      <div id="info-bar">
        <span id="fps" ref={fpsRef}>0 fps</span>
        <span id="version">v5.0.0</span>
      </div>
    </>
  );
}
