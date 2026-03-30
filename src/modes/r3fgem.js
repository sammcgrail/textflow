// r3fgem — R3F-rendered crystalline gem with flowing ASCII background
// This mode demonstrates React Three Fiber integration.
// The 3D gem is rendered by R3FGem.jsx (React component mounted in App.jsx).
// This file handles the ASCII background text that flows around the gem silhouette.

import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Text to flow around the gem
var gemText = 'CRYSTAL LATTICE REFRACTION PRISM FACET BRILLIANCE CLARITY CUT CARAT ' +
  'DIAMOND SAPPHIRE EMERALD RUBY TOPAZ AMETHYST OPAL QUARTZ OBSIDIAN JADE ' +
  'LUMINESCENCE IRIDESCENT CHROMATIC SPECTRAL DIFFRACTION WAVELENGTH PHOTON ' +
  'SYMMETRY HEXAGONAL TETRAGONAL ORTHORHOMBIC MONOCLINIC TRIGONAL CUBIC ';

var overlayEl = null;

function initR3fgem() {
  // The R3F Canvas overlay is managed by App.jsx
  // We just need to find it and read its pixels for masking
  overlayEl = document.querySelector('[data-mode-overlay="r3fgem"]');
}

function renderR3fgem() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  // Try to read overlay canvas for masking (R3F renders there)
  var r3fCanvas = null;
  if (overlayEl) {
    r3fCanvas = overlayEl.querySelector('canvas');
  }

  // Build mask from R3F canvas if available
  var mask = null;
  if (r3fCanvas && r3fCanvas.width > 0) {
    var mCtx;
    try {
      mCtx = r3fCanvas.getContext('webgl2') || r3fCanvas.getContext('webgl');
    } catch(e) {}

    if (mCtx) {
      // Read pixels from WebGL canvas
      var rW = r3fCanvas.width;
      var rH = r3fCanvas.height;
      var pixels = new Uint8Array(rW * rH * 4);
      mCtx.readPixels(0, 0, rW, rH, mCtx.RGBA, mCtx.UNSIGNED_BYTE, pixels);

      mask = new Uint8Array(W * H);
      var cellW = rW / W;
      var cellH = rH / H;

      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          // Sample center of each cell (WebGL coords are flipped Y)
          var sx = Math.floor((x + 0.5) * cellW);
          var sy = Math.floor((H - 1 - y + 0.5) * cellH); // flip Y
          if (sx >= rW) sx = rW - 1;
          if (sy >= rH) sy = rH - 1;
          var pi = (sy * rW + sx) * 4;
          // Check alpha — any non-zero means gem is here
          if (pixels[pi + 3] > 10) {
            mask[y * W + x] = 1;
          }
        }
      }

      // Dilate mask by 1 cell
      var raw = new Uint8Array(mask);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          if (raw[y * W + x]) continue;
          if ((x > 0 && raw[y * W + x - 1]) ||
              (x < W - 1 && raw[y * W + x + 1]) ||
              (y > 0 && raw[(y - 1) * W + x]) ||
              (y < H - 1 && raw[(y + 1) * W + x])) {
            mask[y * W + x] = 1;
          }
        }
      }
    }
  }

  // Render flowing text
  var textIdx = 0;
  var textOffset = Math.floor(t * 2.5);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Skip masked cells (gem is rendered there by R3F)
      if (mask && mask[y * W + x]) continue;

      // Check proximity to gem for glow effect
      var nearGem = 0;
      if (mask) {
        var bd = 2;
        for (var dy = -bd; dy <= bd; dy++) {
          for (var dx = -bd; dx <= bd; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && mask[ny * W + nx]) {
              var dist = Math.sqrt(dx * dx + dy * dy);
              nearGem = Math.max(nearGem, 1 - dist / (bd + 1));
            }
          }
        }
      }

      // Skip very close cells (tight buffer)
      if (nearGem > 0.6) continue;

      var ci = (textOffset + textIdx) % gemText.length;
      textIdx++;
      var ch = gemText[ci];

      if (ch === ' ') {
        if (nearGem > 0.2) {
          var gh = (t * 50 + x * 4 + y * 3) % 360;
          drawCharHSL('.', x, y, gh, 60, 12 + nearGem * 25);
        }
        continue;
      }

      // Color: crystal blue-purple palette with distance-based brightness
      var hue = (200 + Math.sin(x * 0.15 + y * 0.1 + t * 0.8) * 40 + t * 15) % 360;
      var sat = 65 + Math.sin(x * 0.3 - t) * 20;
      var light = 25 + Math.sin(x * 0.2 + y * 0.15 + t * 1.2) * 15;

      // Near-gem glow boost
      if (nearGem > 0) {
        light += nearGem * 30;
        sat += nearGem * 15;
      }

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }
}

registerMode('r3fgem', {
  init: initR3fgem,
  render: renderR3fgem,
});
