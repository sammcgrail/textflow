import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { pointer } from '../core/pointer.js';

// Camhalftone mode — webcam rendered as halftone dot pattern
// Like a newspaper photo with alternating offset rows
// Click to cycle color schemes: green, amber, cyan, white

var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;

var vidCanvas = null;
var vidCtx = null;

// Color schemes: [hue, saturation] or null for white
var SCHEMES = [
  { name: 'green',  h: 120, s: 80 },
  { name: 'amber',  h: 38,  s: 85 },
  { name: 'cyan',   h: 185, s: 75 },
  { name: 'white',  h: 0,   s: 0  }
];
var schemeIdx = 0;

// Halftone character sets ordered by "size" (visual weight)
var HALFTONE_RAMP = ' .·:;oO0@#';
var DOT_RAMP = ' .,:;+oO08@#';

function initCamhalftone() {
  schemeIdx = 0;

  vidCanvas = document.createElement('canvas');
  vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });

  if (!webcamEl) {
    webcamEl = document.createElement('video');
    webcamEl.muted = true;
    webcamEl.playsInline = true;
    webcamEl.setAttribute('autoplay', '');
    webcamEl.style.display = 'none';
    document.body.appendChild(webcamEl);
  }

  startWebcam();
}

function startWebcam() {
  if (webcamReady && webcamEl && webcamEl.srcObject && webcamEl.srcObject.active) return;
  webcamReady = false;
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  }).then(function(stream) {
    webcamEl.srcObject = stream;
    webcamEl.play().catch(function(){});
    webcamEl.onloadeddata = function() { webcamReady = true; };
  }).catch(function(err) {
    webcamDenied = true;
  });
}

function renderCamhalftone() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Handle click — cycle color scheme
  if (pointer.clicked && state.currentMode === 'camhalftone') {
    pointer.clicked = false;
    schemeIdx = (schemeIdx + 1) % SCHEMES.length;
  }

  if (!webcamReady) {
    var msg = webcamDenied ? 'camera access denied' : 'waiting for camera...';
    var mx = Math.floor((W - msg.length) / 2);
    var my = Math.floor(H / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, my, (t * 60 + i * 15) % 360, 60, 40);
    }
    return;
  }

  if (webcamEl.readyState < 2) return;

  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  // Mirror webcam
  vidCtx.save();
  vidCtx.translate(W, 0);
  vidCtx.scale(-1, 1);
  vidCtx.drawImage(webcamEl, 0, 0, W, H);
  vidCtx.restore();

  var imgData = vidCtx.getImageData(0, 0, W, H).data;
  var scheme = SCHEMES[schemeIdx];

  // Halftone grid cell size
  var cellSize = 2;

  for (var cy = 0; cy < H; cy += cellSize) {
    for (var cx = 0; cx < W; cx += cellSize) {
      // Offset every other row for halftone pattern
      var rowOffset = ((cy / cellSize) | 0) % 2 === 1 ? Math.floor(cellSize / 2) : 0;
      var sampleX = Math.min(W - 1, cx + rowOffset);
      var sampleY = Math.min(H - 1, cy);

      // Average luminance in cell
      var totalLum = 0;
      var count = 0;
      for (var dy = 0; dy < cellSize && cy + dy < H; dy++) {
        for (var dx = 0; dx < cellSize && cx + dx < W; dx++) {
          var si = ((cy + dy) * W + (cx + dx)) * 4;
          var rl = imgData[si];
          var gl = imgData[si + 1];
          var bl = imgData[si + 2];
          totalLum += (0.299 * rl + 0.587 * gl + 0.114 * bl) / 255;
          count++;
        }
      }
      var lum = totalLum / count;

      // Map luminance to halftone dot character
      var rampIdx = Math.min(DOT_RAMP.length - 1, (lum * DOT_RAMP.length) | 0);
      var ch = DOT_RAMP[rampIdx];
      if (ch === ' ') continue;

      // Render the "dot" at center of cell
      var dotX = Math.min(W - 1, cx + rowOffset);
      var dotY = cy;

      // Brightness based on luminance
      var bright = 10 + lum * 60;

      // Apply dithering — slight brightness variation for texture
      var dither = Math.sin(cx * 7.3 + cy * 11.1) * 3;
      bright += dither;

      if (scheme.s === 0) {
        // White scheme — pure grayscale
        drawCharHSL(ch, dotX, dotY, 0, 0, Math.min(75, bright));
      } else {
        // Colored scheme — slight hue variation based on luminance
        var hueShift = (lum - 0.5) * 15;
        drawCharHSL(ch, dotX, dotY, scheme.h + hueShift, scheme.s, Math.min(70, bright));
      }

      // Fill cell with smaller dots for density
      for (var dy2 = 0; dy2 < cellSize && cy + dy2 < H; dy2++) {
        for (var dx2 = 0; dx2 < cellSize && cx + dx2 < W; dx2++) {
          var fx = cx + dx2;
          var fy = cy + dy2;
          if (fx === dotX && fy === dotY) continue;

          // Secondary dots — dimmer, smaller characters
          var si2 = (fy * W + fx) * 4;
          var rl2 = imgData[si2];
          var gl2 = imgData[si2 + 1];
          var bl2 = imgData[si2 + 2];
          var lum2 = (0.299 * rl2 + 0.587 * gl2 + 0.114 * bl2) / 255;

          if (lum2 < 0.08) continue;

          var secIdx = Math.min(HALFTONE_RAMP.length - 1, (lum2 * HALFTONE_RAMP.length * 0.7) | 0);
          var secCh = HALFTONE_RAMP[secIdx];
          if (secCh === ' ') continue;

          var secBright = 6 + lum2 * 35;
          if (scheme.s === 0) {
            drawCharHSL(secCh, fx, fy, 0, 0, Math.min(50, secBright));
          } else {
            drawCharHSL(secCh, fx, fy, scheme.h, scheme.s - 15, Math.min(45, secBright));
          }
        }
      }
    }
  }

  // Scanline overlay — subtle horizontal lines
  for (var sy = 0; sy < H; sy += 3) {
    for (var sx = 0; sx < W; sx++) {
      var scanAlpha = 0.04 + Math.sin(t * 0.5 + sy * 0.3) * 0.02;
      if (scanAlpha > 0) {
        drawCharHSL('-', sx, sy, scheme.h, 20, 5);
      }
    }
  }

  // Label
  var label = '[halftone: ' + scheme.name + ']';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
  var hint = 'click:scheme';
  for (var hi = 0; hi < hint.length; hi++) {
    drawCharHSL(hint[hi], 1 + hi, H - 1, 0, 0, 25);
  }
}

registerMode('camhalftone', { init: initCamhalftone, render: renderCamhalftone });
