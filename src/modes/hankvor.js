import { clearCanvas, drawCharHSL, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// hankvor — "do i look like i know what a jpeg is" voronoi textflow.
// Hank Hill source image is sampled through drifting voronoi seeds.
// Each seed moves on a sin/cos lissajous; every grid cell takes the
// color of the nearest seed's sampled pixel. Result: the meme
// dissolves and reforms as seeds drift, structurally readable at
// rest, crystallized-chaos when drifting fast. Click adds seeds.

var img = null;
var imgReady = false;
var offCanvas = null, offCtx = null;
var imgBuf = null;   // Uint8ClampedArray of RGB at imgRes
var imgW = 0, imgH = 0;
var IMG_RES = 192;   // sample resolution of source (kept small — only used for seed color lookup)

var NUM_SEEDS = 120;
var seeds = [];
var hintTimer = 0;

function ensureImg() {
  if (img) return;
  img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = '/textflow/static/hank.png';
  img.onload = function () { imgReady = true; };
}

function resampleImage() {
  if (!imgReady || !img || imgBuf) return;
  if (!offCanvas) {
    offCanvas = document.createElement('canvas');
    offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
  }
  imgW = IMG_RES;
  imgH = IMG_RES;
  offCanvas.width = imgW;
  offCanvas.height = imgH;
  offCtx.clearRect(0, 0, imgW, imgH);
  offCtx.drawImage(img, 0, 0, imgW, imgH);
  var d = offCtx.getImageData(0, 0, imgW, imgH).data;
  imgBuf = new Uint8ClampedArray(imgW * imgH * 3);
  for (var i = 0, p = 0; i < imgW * imgH; i++, p += 4) {
    imgBuf[i*3]   = d[p];
    imgBuf[i*3+1] = d[p+1];
    imgBuf[i*3+2] = d[p+2];
  }
}

function sampleImg(fx, fy) {
  // fx, fy in [0,1]
  if (!imgBuf) return [128, 128, 128];
  var x = (fx * (imgW - 1)) | 0;
  var y = (fy * (imgH - 1)) | 0;
  if (x < 0) x = 0; else if (x >= imgW) x = imgW - 1;
  if (y < 0) y = 0; else if (y >= imgH) y = imgH - 1;
  var i = (y * imgW + x) * 3;
  return [imgBuf[i], imgBuf[i+1], imgBuf[i+2]];
}

function initHankvor() {
  seeds = [];
  for (var i = 0; i < NUM_SEEDS; i++) {
    var fx = Math.random();
    var fy = Math.random();
    seeds.push({
      fx: fx,            // normalized 0..1 position (stable anchor)
      fy: fy,
      px: 0, py: 0,      // current pixel-grid position (recomputed per frame)
      phase: Math.random() * 6.28,
      amp: 0.015 + Math.random() * 0.04,  // how much it wanders from anchor
      speed: 0.3 + Math.random() * 0.7,
    });
  }
  imgBuf = null;         // force re-sample next time mode activates
  hintTimer = 0;
}

// ASCII ramp keyed by luminance — crispens letters on darker cells,
// solid fills on brighter. Gives the textflow its char-grid feel while
// the voronoi gives its structural feel.
var RAMP = '  ..::--==++**##%%@@';

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function renderHankvor() {
  clearCanvas();
  ensureImg();
  resampleImage();

  var W = state.COLS, H = state.ROWS;
  if (!imgBuf) {
    var msg = 'loading hank...';
    for (var i2 = 0; i2 < msg.length; i2++) {
      drawCharHSL(msg[i2], ((W - msg.length) / 2 | 0) + i2, (H / 2) | 0, 30, 60, 60);
    }
    return;
  }

  var t = state.time;

  // click adds seeds at pointer position
  if (pointer.clicked && state.currentMode === 'hankvor') {
    pointer.clicked = false;
    var fx0 = pointer.gx / W;
    var fy0 = pointer.gy / H;
    seeds.push({
      fx: Math.max(0, Math.min(1, fx0)),
      fy: Math.max(0, Math.min(1, fy0)),
      px: 0, py: 0,
      phase: Math.random() * 6.28,
      amp: 0.01 + Math.random() * 0.03,
      speed: 0.5 + Math.random() * 0.8,
    });
    if (seeds.length > 260) seeds.shift();
  }

  // drag nudges seeds toward pointer — light magnetic effect
  var dragActive = pointer.down && state.currentMode === 'hankvor';
  var pfx = dragActive ? pointer.gx / W : 0;
  var pfy = dragActive ? pointer.gy / H : 0;

  // update seeds — drift around anchor via sin/cos
  for (var i = 0; i < seeds.length; i++) {
    var s = seeds[i];
    var tx = s.fx + Math.sin(t * s.speed * 0.6 + s.phase) * s.amp;
    var ty = s.fy + Math.cos(t * s.speed * 0.5 + s.phase * 1.3) * s.amp;
    if (dragActive) {
      var dfx = pfx - s.fx, dfy = pfy - s.fy;
      var dd = dfx*dfx + dfy*dfy;
      if (dd < 0.05) {
        // pull closer anchors more
        var k = (1 - dd / 0.05) * 0.006;
        s.fx += dfx * k;
        s.fy += dfy * k;
      }
    }
    s.px = tx * W;
    s.py = ty * H;
  }

  // render grid — for each cell, find nearest 2 seeds (for edge accent),
  // color from seed's sampled image pixel, brightness by RGB luminance → char ramp
  var cellAR = state.CHAR_W / state.CHAR_H;  // glyph aspect — cells are typically taller than wide
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var d1 = 1e9, d2 = 1e9, ci = 0;
      var pxCorr = x * cellAR;
      for (var j = 0; j < seeds.length; j++) {
        var dx = pxCorr - seeds[j].px * cellAR;
        var dy = y - seeds[j].py;
        var dd2 = dx*dx + dy*dy;
        if (dd2 < d1) { d2 = d1; d1 = dd2; ci = j; }
        else if (dd2 < d2) { d2 = dd2; }
      }
      var s2 = seeds[ci];
      var rgb = sampleImg(s2.fx, s2.fy);
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var L = lum(r, g, b) / 255;

      // edge highlight — pixels near the voronoi cell boundary get a dark/light pop
      var edge = Math.sqrt(d2) - Math.sqrt(d1);
      var edgeK = edge < 0.7 ? 1 : 0;
      if (edgeK) {
        // cell border — darken to ink the lead
        r = (r * 0.25) | 0; g = (g * 0.25) | 0; b = (b * 0.25) | 0;
        drawChar('#', x, y, r, g, b, 255);
        continue;
      }

      // char ramp by brightness
      var ri = (L * (RAMP.length - 1)) | 0;
      if (ri < 0) ri = 0; else if (ri >= RAMP.length) ri = RAMP.length - 1;
      var ch = RAMP[ri];
      drawChar(ch, x, y, r, g, b, 255);
    }
  }

  // hint overlay first ~3 seconds of mode activation
  if (hintTimer < 3) {
    hintTimer += 1/60;
    var alpha = 220 - Math.min(220, (hintTimer / 3) * 220);
    var hint = 'click = add seed · drag = tug';
    for (var hi = 0; hi < hint.length; hi++) {
      drawChar(hint[hi], 1 + hi, H - 2, 255, 240, 180, alpha);
    }
  }
}

registerMode('hankvor', {
  init: initHankvor,
  render: renderHankvor,
});
