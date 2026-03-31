import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Webcam mode — live camera feed as ASCII with interactive filter effects
// Click cycles through filters, drag shifts RGB channels

var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;

var vidCanvas = null;
var vidCtx = null;

// Previous frame for motion detection
var prevFrame = null;
var motionGrid = null;

// Filter modes
var FILTERS = ['normal', 'edges', 'motion', 'thermal', 'matrix', 'posterize', 'rgbshift'];
var filterIdx = 0;

// RGB shift offsets (controlled by drag)
var shiftX = 0;
var shiftY = 0;

function initWebcam() {
  vidCanvas = document.createElement('canvas');
  vidCtx = vidCanvas.getContext('2d', { willReadFrequently: true });
  prevFrame = null;
  motionGrid = null;
  shiftX = 0;
  shiftY = 0;

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
    webcamEl.onloadeddata = function() {
      webcamReady = true;
    };
  }).catch(function(err) {
    webcamDenied = true;
  });
}

function renderWebcam() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Handle click — cycle filter
  if (pointer.clicked && state.currentMode === 'webcam') {
    pointer.clicked = false;
    filterIdx = (filterIdx + 1) % FILTERS.length;
  } else if (pointer.down && state.currentMode === 'webcam') {
    // Drag controls RGB shift
    shiftX = (pointer.gx / W - 0.5) * 6;
    shiftY = (pointer.gy / H - 0.5) * 4;
  }

  // Loading / denied
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

  // Sample webcam
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  // Mirror for selfie
  vidCtx.save();
  vidCtx.translate(W, 0);
  vidCtx.scale(-1, 1);
  vidCtx.drawImage(webcamEl, 0, 0, W, H);
  vidCtx.restore();

  var imgData = vidCtx.getImageData(0, 0, W, H).data;

  var filter = FILTERS[filterIdx];

  // Compute motion if needed
  if (filter === 'motion' || filter === 'edges') {
    if (!motionGrid || motionGrid.length !== W * H) {
      motionGrid = new Float32Array(W * H);
    }
  }

  // Edge detection: compute luminance differences
  var lumGrid = null;
  if (filter === 'edges' || filter === 'posterize') {
    lumGrid = new Float32Array(W * H);
    for (var i = 0; i < W * H; i++) {
      var pi = i * 4;
      lumGrid[i] = (0.299 * imgData[pi] + 0.587 * imgData[pi+1] + 0.114 * imgData[pi+2]) / 255;
    }
  }

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      var pi = idx * 4;
      var r = imgData[pi];
      var g = imgData[pi+1];
      var b = imgData[pi+2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      if (filter === 'normal') {
        renderNormal(x, y, r, g, b, lum, t);
      } else if (filter === 'edges') {
        renderEdges(x, y, W, H, lumGrid, t);
      } else if (filter === 'motion') {
        renderMotion(x, y, idx, r, g, b, lum, t);
      } else if (filter === 'thermal') {
        renderThermal(x, y, lum, t);
      } else if (filter === 'matrix') {
        renderMatrix(x, y, r, g, b, lum, t, W, H);
      } else if (filter === 'posterize') {
        renderPosterize(x, y, r, g, b, lum, lumGrid, W, H, t);
      } else if (filter === 'rgbshift') {
        renderRGBShift(x, y, W, H, imgData, t);
      }
    }
  }

  // Store current frame for motion detection
  if (filter === 'motion') {
    if (!prevFrame || prevFrame.length !== imgData.length) {
      prevFrame = new Uint8Array(imgData.length);
    }
    prevFrame.set(imgData);
  }

  // Show filter name
  var label = '[' + filter + ']';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 35);
  }
  var hint = 'click:filter drag:shift';
  var hx = 1;
  for (var hi = 0; hi < hint.length && hx + hi < W; hi++) {
    drawCharHSL(hint[hi], hx + hi, H - 1, 0, 0, 25);
  }
}

function renderNormal(x, y, r, g, b, lum, t) {
  if (lum < 0.03) return;
  var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
  var ch = RAMP_DENSE[ci];
  var alpha = Math.max(0.25, Math.min(1, lum * 1.4));
  drawChar(ch, x, y, r, g, b, alpha);
}

function renderEdges(x, y, W, H, lumGrid, t) {
  if (x === 0 || y === 0 || x >= W - 1 || y >= H - 1) return;
  var idx = y * W + x;
  // Sobel-ish edge detection
  var gx = -lumGrid[idx-1-W] + lumGrid[idx+1-W]
          -2*lumGrid[idx-1]  + 2*lumGrid[idx+1]
          -lumGrid[idx-1+W]  + lumGrid[idx+1+W];
  var gy = -lumGrid[idx-W-1] - 2*lumGrid[idx-W] - lumGrid[idx-W+1]
          +lumGrid[idx+W-1]  + 2*lumGrid[idx+W] + lumGrid[idx+W+1];
  var edge = Math.sqrt(gx * gx + gy * gy);
  if (edge < 0.08) return;

  edge = Math.min(1, edge * 2.5);

  // Direction-based character
  var angle = Math.atan2(gy, gx);
  var ch;
  if (angle < -2.35 || angle > 2.35) ch = '|';
  else if (angle < -0.78) ch = '/';
  else if (angle < 0.78) ch = '-';
  else ch = '\\';

  var hue = (t * 20 + x * 2 + y * 3) % 360;
  drawCharHSL(ch, x, y, hue, 70, 20 + edge * 50);
}

function renderMotion(x, y, idx, r, g, b, lum, t) {
  var motion = 0;
  if (prevFrame) {
    var pi = idx * 4;
    var dr = Math.abs(r - prevFrame[pi]);
    var dg = Math.abs(g - prevFrame[pi+1]);
    var db = Math.abs(b - prevFrame[pi+2]);
    motion = (dr + dg + db) / (3 * 255);
  }

  // Blend: dim base + bright motion
  if (motion > 0.03) {
    var intensity = Math.min(1, motion * 4);
    var ci = Math.min(RAMP_DENSE.length - 1, (intensity * RAMP_DENSE.length) | 0);
    var ch = RAMP_DENSE[ci];
    var hue = (t * 30 + motion * 500) % 360;
    drawCharHSL(ch, x, y, hue, 80, 20 + intensity * 50);
  } else if (lum > 0.05) {
    // Dim ghost of static areas
    drawCharHSL('.', x, y, 0, 0, 8 + lum * 10);
  }
}

function renderThermal(x, y, lum, t) {
  if (lum < 0.02) return;
  // Thermal colormap: dark blue → blue → green → yellow → red → white
  var hue, sat, bright;
  if (lum < 0.25) {
    hue = 240; sat = 80; bright = 10 + lum * 80;
  } else if (lum < 0.5) {
    hue = 240 - (lum - 0.25) * 4 * 120; sat = 90; bright = 30 + lum * 40;
  } else if (lum < 0.75) {
    hue = 120 - (lum - 0.5) * 4 * 80; sat = 95; bright = 35 + lum * 35;
  } else {
    hue = 40 - (lum - 0.75) * 4 * 40; sat = 100; bright = 40 + lum * 35;
  }

  var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
  var ch = RAMP_DENSE[ci];
  drawCharHSL(ch, x, y, (hue + 360) % 360, Math.min(100, sat), Math.min(75, bright));
}

function renderMatrix(x, y, r, g, b, lum, t, W, H) {
  if (lum < 0.04) return;
  // Matrix rain effect — green tinted, characters rain down
  var rainSpeed = 3 + (x * 7 + 13) % 5;
  var rainOffset = ((t * rainSpeed + x * 3.7) % H);
  var distFromRain = Math.abs(y - rainOffset);
  if (distFromRain > H / 2) distFromRain = H - distFromRain;

  var rainGlow = Math.max(0, 1 - distFromRain / 8);

  // Use random-ish characters based on position and time
  var charCode = ((x * 17 + y * 31 + Math.floor(t * 4)) % 94) + 33;
  var ch = String.fromCharCode(charCode);

  var green = lum * 180 + rainGlow * 75;
  var alpha = Math.max(0.15, lum * 0.8 + rainGlow * 0.5);
  drawChar(ch, x, y, 0, Math.min(255, green | 0), 0, Math.min(1, alpha));
}

function renderPosterize(x, y, r, g, b, lum, lumGrid, W, H, t) {
  // Quantize to 4 levels
  var level = Math.floor(lum * 4);
  if (level < 1) return;

  var chars = [' ', '.', '#', '@'];
  var ch = chars[Math.min(3, level)];

  // Bold color bands
  var hue;
  if (level === 1) hue = 220;      // blue shadows
  else if (level === 2) hue = 30;  // warm mids
  else hue = 50;                   // bright highlights

  var sat = 70;
  var bright = 15 + level * 15;

  drawCharHSL(ch, x, y, (hue + t * 5) % 360, sat, bright);
}

function renderRGBShift(x, y, W, H, imgData, t) {
  // Sample R, G, B from offset positions
  var sx = shiftX + Math.sin(t * 0.5) * 1.5;
  var sy = shiftY + Math.cos(t * 0.7) * 1;

  var rx = Math.max(0, Math.min(W-1, Math.round(x + sx)));
  var ry = Math.max(0, Math.min(H-1, Math.round(y + sy)));
  var gx2 = x;
  var gy2 = y;
  var bx = Math.max(0, Math.min(W-1, Math.round(x - sx)));
  var by = Math.max(0, Math.min(H-1, Math.round(y - sy)));

  var rpi = (ry * W + rx) * 4;
  var gpi = (gy2 * W + gx2) * 4;
  var bpi = (by * W + bx) * 4;

  var r = imgData[rpi];
  var g = imgData[gpi + 1];
  var b = imgData[bpi + 2];

  var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.03) return;

  var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
  var ch = RAMP_DENSE[ci];
  var alpha = Math.max(0.2, Math.min(1, lum * 1.3));
  drawChar(ch, x, y, r, g, b, alpha);
}

registerMode('webcam', { init: initWebcam, render: renderWebcam });
