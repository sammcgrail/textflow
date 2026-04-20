import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// ============================================================
// BadApple — Touhou "Bad Apple!!" shadow-animation, ASCII edition.
// Samples luminance from the music video into VA_RAMP characters.
// Click/tap drops a red @ apple that falls, bounces on walls/floor.
// Max 30 apples. Double-click to pause/play.
// ============================================================

var videoEl = document.createElement('video');
videoEl.muted = true;
videoEl.loop = true;
videoEl.playsInline = true;
videoEl.crossOrigin = 'anonymous';
videoEl.style.display = 'none';
document.body.appendChild(videoEl);

var sampleCanvas = document.createElement('canvas');
var sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
var videoReady = false;
var videoPaused = false;

videoEl.onloadeddata = function() { videoReady = true; };

// Apple physics
var apples = [];        // { x, y, vx, vy, life }
var APPLE_MAX = 30;
var GRAVITY = 18;       // grid-cells/sec^2
var BOUNCE_FLOOR = -0.55;
var BOUNCE_WALL  = -0.7;

var lastTime = 0;

function initBadapple() {
  videoPaused = false;
  apples = [];
  if (!videoReady && !videoEl.getAttribute('src')) {
    videoEl.src = '/textflow/static/bad-apple.mp4';
    videoEl.load();
  }
  videoEl.currentTime = 0;
  videoEl.play().catch(function(){});
  lastTime = 0;
}

function spawnApple(gx, gy) {
  if (apples.length >= APPLE_MAX) apples.shift();
  apples.push({
    x: gx,
    y: gy,
    vx: (Math.random() - 0.5) * 8,
    vy: -2 - Math.random() * 3,
    life: 0,
  });
}

function updateApples(dt) {
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < apples.length; i++) {
    var a = apples[i];
    a.vy += GRAVITY * dt;
    a.x  += a.vx * dt;
    a.y  += a.vy * dt;
    a.life += dt;

    if (a.x < 0.5) { a.x = 0.5; a.vx *= BOUNCE_WALL; }
    if (a.x > W - 1.5) { a.x = W - 1.5; a.vx *= BOUNCE_WALL; }

    if (a.y > H - 1.5) {
      a.y = H - 1.5;
      a.vy *= BOUNCE_FLOOR;
      a.vx *= 0.85;       // floor friction
      if (Math.abs(a.vy) < 0.6) a.vy = 0;
    }
  }
}

function renderBadapple() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  var now = performance.now();
  var dt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
  if (dt > 0.1) dt = 0.016;
  lastTime = now;

  if (!videoReady) {
    drawFancyLoading('loading bad apple');
    return;
  }

  if (sampleCanvas.width !== W || sampleCanvas.height !== H) {
    sampleCanvas.width = W;
    sampleCanvas.height = H;
  }

  sampleCtx.drawImage(videoEl, 0, 0, W, H);
  var imgData = sampleCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.04) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      var ch = VA_RAMP[ri];
      var alpha = Math.max(0.25, Math.min(1, lum * 1.15));
      // faint warm off-white — B&W PV reads as parchment
      drawChar(ch, x, y, 240, 232, 218, alpha);
    }
  }

  if (pointer.clicked && state.currentMode === 'badapple') {
    spawnApple(pointer.gx, pointer.gy);
  }

  updateApples(dt);

  // Apples: red @ fruit + green ' stem
  for (var k = 0; k < apples.length; k++) {
    var a2 = apples[k];
    var ix = Math.round(a2.x);
    var iy = Math.round(a2.y);
    if (iy - 1 >= 0 && ix >= 0 && ix < W) {
      drawChar("'", ix, iy - 1, 80, 150, 60, 0.9);
    }
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
      drawChar('@', ix, iy, 230, 40, 40, 1.0);
    }
  }

  if (videoPaused) {
    drawChar('|', 2, 1, 255, 255, 255, 0.7);
    drawChar('|', 4, 1, 255, 255, 255, 0.7);
  }
}

function attachBadapple() {
  var lastClick = 0;
  state.canvas.addEventListener('click', function() {
    if (state.currentMode !== 'badapple') return;
    var now = performance.now();
    if (now - lastClick < 300) {
      if (videoEl.paused) {
        videoEl.play().catch(function(){});
        videoPaused = false;
      } else {
        videoEl.pause();
        videoPaused = true;
      }
    }
    lastClick = now;
  });
}

registerMode('badapple', {
  init: initBadapple,
  render: renderBadapple,
  attach: attachBadapple,
});
