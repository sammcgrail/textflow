import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Camdepth mode — ASCII Pixelate Zoom
// Center shows high-res ASCII, rings outward show progressively pixelated versions
// Click to shift the high-res focus area
// Creates tilt-shift / zoom blur aesthetic

var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;

var vidCanvas = null;
var vidCtx = null;

// Focus point (normalized 0-1)
var focusX = 0.5;
var focusY = 0.5;
var targetFocusX = 0.5;
var targetFocusY = 0.5;

// Block size ramps for each ring
var BLOCK_SIZES = [1, 2, 4, 8, 16];

// Characters for different resolution levels — fine to bold
var FINE_RAMP = ' .`-:;=+*#%@$';
var BOLD_CHARS = '#@$%&WMB';

function initCamdepth() {
  vidCanvas = document.createElement('canvas');
  vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });
  focusX = 0.5;
  focusY = 0.5;
  targetFocusX = 0.5;
  targetFocusY = 0.5;

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

function renderCamdepth() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Handle click — move focus point
  if (pointer.clicked && state.currentMode === 'camdepth') {
    pointer.clicked = false;
    targetFocusX = pointer.gx / W;
    targetFocusY = pointer.gy / H;
  }

  // Smooth interpolation toward target
  focusX += (targetFocusX - focusX) * 0.08;
  focusY += (targetFocusY - focusY) * 0.08;

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

  // Compute focus center in grid coords
  var fcx = focusX * W;
  var fcy = focusY * H;

  // Maximum distance from focus to any corner
  var maxDist = Math.sqrt(W * W + H * H) * 0.5;

  // Ring radii (fraction of maxDist)
  var ringRadii = [0.12, 0.25, 0.42, 0.65, 1.0];

  // Pre-compute block level for each cell
  // Level 0 = 1x1 (full res), Level 4 = 16x16 (max pixelate)
  var levelGrid = new Uint8Array(W * H);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = x - fcx;
      var dy = (y - fcy) * 1.8; // stretch Y since chars are taller
      var dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      var level = 4;
      for (var r = 0; r < ringRadii.length; r++) {
        if (dist < ringRadii[r]) {
          level = r;
          break;
        }
      }
      levelGrid[y * W + x] = level;
    }
  }

  // Track which block origins we've already drawn (to avoid overdraw)
  var drawn = new Uint8Array(W * H);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (drawn[y * W + x]) continue;

      var level = levelGrid[y * W + x];
      var blockSize = BLOCK_SIZES[level];

      // Snap to block grid
      var bx = Math.floor(x / blockSize) * blockSize;
      var by = Math.floor(y / blockSize) * blockSize;

      if (bx !== x || by !== y) {
        // Not the origin of this block — skip (will be filled by origin)
        continue;
      }

      // Average color over block
      var totalR = 0, totalG = 0, totalB = 0, count = 0;
      for (var sy = by; sy < by + blockSize && sy < H; sy++) {
        for (var sx = bx; sx < bx + blockSize && sx < W; sx++) {
          var pi = (sy * W + sx) * 4;
          totalR += imgData[pi];
          totalG += imgData[pi + 1];
          totalB += imgData[pi + 2];
          count++;
          drawn[sy * W + sx] = 1;
        }
      }

      var avgR = totalR / count;
      var avgG = totalG / count;
      var avgB = totalB / count;
      var lum = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;

      if (lum < 0.02) continue;

      // Choose character based on level and luminance
      var ch;
      if (level === 0) {
        // Full res — fine detail characters
        var ci = Math.min(FINE_RAMP.length - 1, (lum * FINE_RAMP.length) | 0);
        ch = FINE_RAMP[ci];
      } else if (level === 1) {
        var ci2 = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
        ch = RAMP_DENSE[ci2];
      } else {
        // Blocky levels — use bold heavy characters
        var bi = Math.min(BOLD_CHARS.length - 1, (lum * BOLD_CHARS.length) | 0);
        ch = BOLD_CHARS[bi];
      }

      if (ch === ' ') continue;

      // Color: inner ring = true color, outer = shift toward monochrome blue
      var monoBlend = level / 4.0;
      var monoLum = lum * 200;
      var outR = avgR * (1 - monoBlend * 0.6) + monoLum * 0.3 * monoBlend;
      var outG = avgG * (1 - monoBlend * 0.5) + monoLum * 0.4 * monoBlend;
      var outB = avgB * (1 - monoBlend * 0.2) + monoLum * 0.8 * monoBlend;

      // Brightness boost for inner, dim for outer
      var brightMult = 1.0 + (1 - monoBlend) * 0.4 - monoBlend * 0.2;
      outR = Math.min(255, (outR * brightMult) | 0);
      outG = Math.min(255, (outG * brightMult) | 0);
      outB = Math.min(255, (outB * brightMult) | 0);

      var alpha = Math.max(0.2, Math.min(1.0, lum * 1.4 + (1 - monoBlend) * 0.2));

      // Fill the block with the same character
      for (var fy = by; fy < by + blockSize && fy < H; fy++) {
        for (var fx = bx; fx < bx + blockSize && fx < W; fx++) {
          drawChar(ch, fx, fy, outR, outG, outB, alpha);
        }
      }
    }
  }

  // Draw focus ring indicator (subtle)
  var ringR = ringRadii[0] * maxDist;
  for (var angle = 0; angle < 6.28; angle += 0.08) {
    var rx = Math.round(fcx + Math.cos(angle) * ringR);
    var ry = Math.round(fcy + Math.sin(angle) * ringR / 1.8);
    if (rx >= 0 && rx < W && ry >= 0 && ry < H) {
      var ringHue = (t * 40 + angle * 30) % 360;
      drawCharHSL('.', rx, ry, ringHue, 60, 35);
    }
  }

  // Label
  var label = '[pixelate zoom]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
  var hint = 'click:focus';
  for (var hi = 0; hi < hint.length; hi++) {
    drawCharHSL(hint[hi], 1 + hi, H - 1, 0, 0, 25);
  }
}

registerMode('camdepth', { init: initCamdepth, render: renderCamdepth });
