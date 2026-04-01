import { clearCanvas } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// WebGPU fluid simulation — direct embed from vibe-coded.com
var container = null;
var loaded = false;
var loadingEl = null;

function attachTslvibe() {
  if (container) return;

  // Hide textflow canvas
  if (state.canvas) state.canvas.style.display = 'none';

  // Create container
  container = document.createElement('div');
  container.id = 'app';
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999;';
  document.body.appendChild(container);

  // Loading indicator
  loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#d6ffdf;font-family:monospace;font-size:14px;text-align:center;z-index:1001;';
  loadingEl.innerHTML = '<div style="font-size:20px;margin-bottom:12px;animation:pulse 1.5s infinite">loading WebGPU fluid sim...</div><div style="font-size:11px;color:#4a6a4f">requires WebGPU (Chrome/Edge)</div>';
  document.body.appendChild(loadingEl);

  // Inject CSS
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/textflow/static/tslvibe/assets/index-CSzF2bjd.css';
  link.id = 'tslvibe-css';
  document.head.appendChild(link);

  // Lazy load the JS module
  var script = document.createElement('script');
  script.type = 'module';
  script.src = '/textflow/static/tslvibe/assets/index-Cr3dskwt.js';
  script.id = 'tslvibe-js';
  script.onload = function() {
    loaded = true;
    if (loadingEl) { loadingEl.remove(); loadingEl = null; }
  };
  document.head.appendChild(script);
}

function cleanupTslvibe() {
  // Remove vibe-coded elements
  if (container) { container.remove(); container = null; }
  if (loadingEl) { loadingEl.remove(); loadingEl = null; }
  var css = document.getElementById('tslvibe-css');
  if (css) css.remove();
  var js = document.getElementById('tslvibe-js');
  if (js) js.remove();
  // Remove any canvases the app created
  var canvases = document.querySelectorAll('canvas');
  canvases.forEach(function(c) {
    if (c !== state.canvas) c.remove();
  });
  // Remove tweakpane if present
  var tp = document.querySelector('.tp-dfwv');
  if (tp) tp.remove();
  // Show textflow canvas again
  if (state.canvas) state.canvas.style.display = '';
  loaded = false;
}

function renderTslvibe() {
  // No-op — the vibe-coded app handles its own rendering
}

registerMode('tslvibe', {
  init: function() {},
  render: renderTslvibe,
  attach: attachTslvibe,
  cleanup: cleanupTslvibe
});
