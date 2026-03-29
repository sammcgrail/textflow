import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Camtrail mode — webcam ASCII with heavy motion trails
// Moving objects leave colorful ghost trails like light painting
// Rainbow hue based on motion direction

var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;

var vidCanvas = null;
var vidCtx = null;

// Trail buffer — stores brightest luminance seen per pixel over N frames
var TRAIL_LENGTH = 18;
var trailBuf = null;    // Array of Float32Array (luminance per frame)
var trailHue = null;    // Float32Array — accumulated hue per pixel from motion direction
var trailSat = null;    // Float32Array — saturation (higher = more motion)
var prevLum = null;     // Previous frame luminance for motion direction calc
var prevFrame = null;   // Previous frame RGB for motion detection
var trailIdx = 0;       // Ring buffer index

function initCamtrail() {
  trailBuf = null;
  trailHue = null;
  trailSat = null;
  prevLum = null;
  prevFrame = null;
  trailIdx = 0;

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

function renderCamtrail() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var total = W * H;

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

  // Resize buffers
  if (!trailBuf || trailBuf[0].length !== total) {
    trailBuf = [];
    for (var f = 0; f < TRAIL_LENGTH; f++) {
      trailBuf.push(new Float32Array(total));
    }
    trailHue = new Float32Array(total);
    trailSat = new Float32Array(total);
    prevLum = new Float32Array(total);
    prevFrame = null;
    trailIdx = 0;
  }

  // Sample webcam
  if (vidCanvas.width !== W || vidCanvas.height !== H) {
    vidCanvas.width = W;
    vidCanvas.height = H;
  }

  vidCtx.save();
  vidCtx.translate(W, 0);
  vidCtx.scale(-1, 1);
  vidCtx.drawImage(webcamEl, 0, 0, W, H);
  vidCtx.restore();

  var imgData = vidCtx.getImageData(0, 0, W, H).data;

  // Compute current frame luminance and store in trail ring buffer
  var curLum = trailBuf[trailIdx % TRAIL_LENGTH];

  for (var i = 0; i < total; i++) {
    var pi = i * 4;
    var r = imgData[pi];
    var g = imgData[pi + 1];
    var b = imgData[pi + 2];
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    curLum[i] = lum;

    // Compute motion direction for hue
    if (prevFrame) {
      var dr = r - prevFrame[pi];
      var dg = g - prevFrame[pi + 1];
      var db = b - prevFrame[pi + 2];
      var motion = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
      var motionNorm = motion / (3 * 255);

      if (motionNorm > 0.03) {
        // Motion direction: use spatial gradient
        var px = i % W;
        var py = (i / W) | 0;
        var dx = 0, dy = 0;

        if (px > 0 && px < W - 1) {
          var li = prevLum[i - 1];
          var ri2 = prevLum[i + 1];
          dx = ri2 - li;
        }
        if (py > 0 && py < H - 1) {
          var ti2 = prevLum[i - W];
          var bi2 = prevLum[i + W];
          dy = bi2 - ti2;
        }

        var dirHue = ((Math.atan2(dy, dx) / Math.PI) * 180 + 360) % 360;
        // Blend hue toward motion direction
        trailHue[i] = trailHue[i] * 0.7 + dirHue * 0.3;
        trailSat[i] = Math.min(100, trailSat[i] + motionNorm * 200);
      } else {
        trailSat[i] *= 0.92; // Decay saturation when still
      }
    }
  }

  // Save current frame for next comparison
  if (!prevFrame || prevFrame.length !== imgData.length) {
    prevFrame = new Uint8Array(imgData.length);
  }
  prevFrame.set(imgData);
  prevLum.set(curLum);

  trailIdx++;

  // Render: for each pixel, find max luminance across trail frames
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;

      // Max luminance across trail
      var maxLum = 0;
      var sumLum = 0;
      for (var f = 0; f < TRAIL_LENGTH; f++) {
        var fl = trailBuf[f][idx];
        if (fl > maxLum) maxLum = fl;
        sumLum += fl;
      }
      var avgLum = sumLum / TRAIL_LENGTH;

      // Current frame luminance
      var nowLum = curLum[idx];

      // Blend: favor max for trails, current for sharp detail
      var blended = maxLum * 0.6 + nowLum * 0.4;

      if (blended < 0.03) continue;

      var ci = Math.min(RAMP_DENSE.length - 1, (blended * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ci];

      // Trail pixels (where max > current significantly) get rainbow hue
      var trailAmount = maxLum - nowLum;
      var sat = trailSat[idx];
      var hue = trailHue[idx];

      if (trailAmount > 0.05 && sat > 10) {
        // Ghost trail — rainbow colored
        var bright = 15 + blended * 55;
        var satFinal = Math.min(90, sat);
        drawCharHSL(ch, x, y, hue, satFinal, bright);
      } else {
        // Current position — slightly tinted with trail color
        var pi2 = idx * 4;
        var cr = imgData[pi2];
        var cg = imgData[pi2 + 1];
        var cb = imgData[pi2 + 2];
        var alpha = Math.max(0.3, Math.min(1, blended * 1.5));
        drawChar(ch, x, y, cr, cg, cb, alpha);
      }
    }
  }

  // Label
  var label = '[motion trail]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('camtrail', { init: initCamtrail, render: renderCamtrail });
