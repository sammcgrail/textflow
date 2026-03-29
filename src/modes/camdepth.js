import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Camdepth mode — fake depth/displacement map from webcam
// Brighter areas appear "closer" with larger brighter characters
// Darker areas recede with tiny dim dots
// Horizontal scanlines shift based on brightness for parallax effect

var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;

var vidCanvas = null;
var vidCtx = null;

// Depth ramps — from far (dim/small) to near (bright/large)
var FAR_CHARS = ' .·:';
var NEAR_CHARS = '+=*#%@$&W';
var FULL_DEPTH_RAMP = ' .·:-=+*#%@$&';

function initCamdepth() {
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
  if (webcamReady) return;
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

  // Pre-compute luminance grid
  var lumGrid = new Float32Array(W * H);
  for (var i = 0; i < W * H; i++) {
    var pi = i * 4;
    lumGrid[i] = (0.299 * imgData[pi] + 0.587 * imgData[pi + 1] + 0.114 * imgData[pi + 2]) / 255;
  }

  // Scanline phase — slowly scrolling scanlines
  var scanPhase = t * 2.0;
  var scanFreq = 0.35;

  for (var y = 0; y < H; y++) {
    // Scanline intensity — creates horizontal bands
    var scanVal = Math.sin((y + scanPhase) * scanFreq * Math.PI) * 0.5 + 0.5;
    var isScanline = scanVal > 0.85;

    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var lum = lumGrid[idx];

      // Horizontal displacement based on luminance
      // Bright pixels shift right, dark pixels shift left (parallax)
      var displacement = (lum - 0.5) * 5;
      var dispX = x + Math.round(displacement + Math.sin(t * 0.8 + y * 0.1) * 0.5);
      dispX = Math.max(0, Math.min(W - 1, dispX));

      // Sample from displaced position
      var srcIdx = y * W + dispX;
      var srcLum = lumGrid[srcIdx];
      var srcPi = srcIdx * 4;
      var r = imgData[srcPi];
      var g = imgData[srcPi + 1];
      var b = imgData[srcPi + 2];

      // Depth character selection
      var depthIdx = Math.min(FULL_DEPTH_RAMP.length - 1, (srcLum * FULL_DEPTH_RAMP.length) | 0);
      var ch = FULL_DEPTH_RAMP[depthIdx];
      if (ch === ' ' && !isScanline) continue;

      // Depth coloring — near (bright) = warm, far (dark) = cool
      var depthHue, depthSat, depthBright;

      if (srcLum > 0.6) {
        // Near — warm orange/white, big bright chars
        depthHue = 25 + (1 - srcLum) * 30;
        depthSat = 40 - srcLum * 30;
        depthBright = 30 + srcLum * 45;
      } else if (srcLum > 0.3) {
        // Mid — teal/blue-green
        depthHue = 180 + (0.5 - srcLum) * 60;
        depthSat = 50 + srcLum * 20;
        depthBright = 12 + srcLum * 35;
      } else {
        // Far — deep blue/purple, tiny dim dots
        depthHue = 250 + srcLum * 40;
        depthSat = 60;
        depthBright = 4 + srcLum * 25;
      }

      // Scanline highlight
      if (isScanline) {
        // Bright scanline that shifts with depth
        var scanChar = '-';
        var scanBright = 8 + srcLum * 20;
        var scanHue = (depthHue + 180) % 360;
        drawCharHSL(scanChar, x, y, scanHue, 30, scanBright);
        continue;
      }

      // Edge enhancement — depth discontinuities glow
      if (x > 0 && x < W - 1) {
        var depthDiff = Math.abs(lumGrid[idx - 1] - lumGrid[idx + 1]);
        if (depthDiff > 0.15) {
          depthBright += depthDiff * 40;
          depthSat += 15;
          ch = '|';
        }
      }
      if (y > 0 && y < H - 1) {
        var depthDiffV = Math.abs(lumGrid[idx - W] - lumGrid[idx + W]);
        if (depthDiffV > 0.15) {
          depthBright += depthDiffV * 35;
        }
      }

      // Subtle noise for texture
      var noise = Math.sin(x * 13.7 + y * 17.3 + t * 2) * 2;
      depthBright += noise;

      drawCharHSL(ch, x, y, depthHue, Math.min(90, depthSat), Math.min(75, depthBright));
    }
  }

  // Depth scale indicator on left edge
  for (var dy = 0; dy < H; dy++) {
    var depthFrac = dy / H;
    var scaleChar = FULL_DEPTH_RAMP[Math.min(FULL_DEPTH_RAMP.length - 1, ((1 - depthFrac) * FULL_DEPTH_RAMP.length) | 0)];
    if (scaleChar !== ' ') {
      drawCharHSL(scaleChar, 0, dy, 200, 30, 15);
    }
  }

  // Label
  var label = '[depth map]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('camdepth', { init: initCamdepth, render: renderCamdepth });
