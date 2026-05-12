import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// fractalvid — Julia-set fractal whose per-cell COLOR is sampled from a live
// video frame, glyph determined by escape-time iteration count. The Julia
// constant `c` drifts on a Lissajous so the fractal continuously morphs;
// drag pans the view, tap re-randomizes c. Each frame we sample the video
// at low res into a hidden canvas, then read RGB per ASCII cell.
//
// Sam's brief: "a crazy one with a video background that has fractals on it".

// Note: textflow is served from the project root on textflow.sebland.com
// subdomain, with /static/ as the asset path. Don't prefix with /textflow/.
var VIDEOS = [
  'static/lava-flow.mp4',
  'static/ink.mp4',
  'static/neon.mp4',
  'static/aurora-vid.mp4',
];

var video = null;
var sampleCanvas = null;
var sampleCtx = null;
var videoIndex = 0;
var W = 0, H = 0;
var panX = 0, panY = 0;
var panTargetX = 0, panTargetY = 0;
var zoom = 1.4;
var cReal = -0.7269, cImag = 0.1889;   // start near a classic "rabbit" julia
var cTargetReal = -0.7269, cTargetImag = 0.1889;
var lastClickT = 0;

var GLYPHS = ['·', '∘', '○', '◌', '◍', '◉', '●', '◎', '◐', '◑', '◒', '◓'];

function initFractalVid() {
  W = 0; H = 0;
  panX = 0; panY = 0; panTargetX = 0; panTargetY = 0;
  zoom = 1.4;
  cReal = -0.7269; cImag = 0.1889;
  cTargetReal = cReal; cTargetImag = cImag;
  // Tear down any previous video instance
  if (video) {
    try { video.pause(); video.src = ''; video.remove(); } catch(e) {}
  }
  video = document.createElement('video');
  video.muted = true; video.loop = true; video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  // hidden but in the DOM so the browser actually fetches/decodes
  video.style.position = 'fixed';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  document.body.appendChild(video);
  video.src = VIDEOS[videoIndex];
  video.load();
  video.play().catch(function() { /* autoplay may need user gesture; render still works */ });
  if (!sampleCanvas) {
    sampleCanvas = document.createElement('canvas');
    sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  }
}

function cycleVideo() {
  videoIndex = (videoIndex + 1) % VIDEOS.length;
  try {
    video.src = VIDEOS[videoIndex];
    video.play().catch(function() {});
  } catch(e) {}
}

function juliaIters(zr, zi, cr, ci, maxIter) {
  for (var k = 0; k < maxIter; k++) {
    var zr2 = zr * zr;
    var zi2 = zi * zi;
    if (zr2 + zi2 > 4) return k;
    var newZi = 2 * zr * zi + ci;
    zr = zr2 - zi2 + cr;
    zi = newZi;
  }
  return maxIter;
}

function renderFractalVid() {
  clearCanvas();
  var CW = state.COLS, CH = state.ROWS;
  if (W !== CW || H !== CH) {
    W = CW; H = CH;
    sampleCanvas.width = W;
    sampleCanvas.height = H;
  }
  var t = state.time;

  // --- inputs ---
  if (state.currentMode === 'fractalvid') {
    if (pointer.clicked) {
      pointer.clicked = false;
      if (t - lastClickT < 0.6) {
        // double-tap-ish → cycle video
        cycleVideo();
      } else {
        // single tap → kick the julia c to a new random nearby point
        cTargetReal = -0.4 + (Math.random() - 0.5) * 1.6;
        cTargetImag = (Math.random() - 0.5) * 0.8;
      }
      lastClickT = t;
    }
    if (pointer.down) {
      // pan the view based on pointer offset from center
      panTargetX = (pointer.gx / W - 0.5) * 2.0;
      panTargetY = (pointer.gy / H - 0.5) * 2.0;
    } else {
      // gentle drift back to center
      panTargetX *= 0.98;
      panTargetY *= 0.98;
    }
  }
  // slow lissajous on c so the fractal continuously morphs
  cTargetReal += 0.0015 * Math.cos(t * 0.31);
  cTargetImag += 0.0015 * Math.sin(t * 0.27);
  cReal += (cTargetReal - cReal) * 0.05;
  cImag += (cTargetImag - cImag) * 0.05;
  panX += (panTargetX - panX) * 0.08;
  panY += (panTargetY - panY) * 0.08;

  // --- sample the video into a per-cell pixel grid ---
  var pixels = null;
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    var vw = video.videoWidth, vh = video.videoHeight;
    // Aspect-fit to the ASCII grid (cell-aspect-corrected: cells are ~tall)
    var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
    var gridAspect = (W * charAspect) / H;
    var videoAspect = vw / vh;
    var sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAspect > gridAspect) {
      sw = vh * gridAspect; sx = (vw - sw) / 2;
    } else {
      sh = vw / gridAspect; sy = (vh - sh) / 2;
    }
    sampleCtx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
    try {
      pixels = sampleCtx.getImageData(0, 0, W, H).data;
    } catch(e) {
      pixels = null;
    }
  }

  // --- render fractal + sampled color ---
  var charAspect2 = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var maxIter = 38;
  // Map cell coords to complex plane. View width ~ 3.0/zoom; aspect-corrected.
  var halfW = 1.5 / zoom;
  var halfH = halfW * (H / (W * charAspect2));
  for (var y = 0; y < H; y++) {
    var zi0 = ((y / (H - 1)) * 2 - 1) * halfH + panY;
    for (var x = 0; x < W; x++) {
      var zr0 = ((x / (W - 1)) * 2 - 1) * halfW + panX;
      var iters = juliaIters(zr0, zi0, cReal, cImag, maxIter);
      if (iters === maxIter) continue; // inside set → skip (transparent → video shows)

      var i = (y * W + x) * 4;
      var r = pixels ? pixels[i]     : 80;
      var g = pixels ? pixels[i + 1] : 120;
      var b = pixels ? pixels[i + 2] : 200;

      // glyph density follows iteration count
      var gi = Math.min(GLYPHS.length - 1, (iters / maxIter * GLYPHS.length) | 0);
      var ch = GLYPHS[gi];

      // hue from video color (rgb-to-hue, simple); shifted by iter for variation
      var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      var hue = 0;
      if (mx !== mn) {
        var d = mx - mn;
        if (mx === r)      hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (mx === g) hue = ((b - r) / d + 2) * 60;
        else               hue = ((r - g) / d + 4) * 60;
      }
      hue = (hue + iters * 9) % 360;
      // brightness from video luminance + iteration depth (deeper iter = darker)
      var lum = (mx + mn) * 0.5 / 255;  // 0..1
      var lit = 20 + lum * 50 - (iters / maxIter) * 25;
      if (lit < 18) lit = 18;
      drawCharHSL(ch, x, y, hue | 0, 88, lit | 0);
    }
  }

  // --- inside-set cells: render the video pixel directly (so the "void" shows the video) ---
  if (pixels) {
    for (var y2 = 0; y2 < H; y2++) {
      var zi02 = ((y2 / (H - 1)) * 2 - 1) * halfH + panY;
      for (var x2 = 0; x2 < W; x2++) {
        var zr02 = ((x2 / (W - 1)) * 2 - 1) * halfW + panX;
        var it2 = juliaIters(zr02, zi02, cReal, cImag, maxIter);
        if (it2 !== maxIter) continue;
        var ii = (y2 * W + x2) * 4;
        var r2 = pixels[ii], g2 = pixels[ii+1], b2 = pixels[ii+2];
        var v2 = (r2 + g2 + b2) / (3 * 255);
        if (v2 < 0.1) continue;
        var glyph = v2 > 0.7 ? '█' : v2 > 0.45 ? '▓' : v2 > 0.25 ? '▒' : '░';
        var mx2 = r2 > g2 ? (r2 > b2 ? r2 : b2) : (g2 > b2 ? g2 : b2);
        var mn2 = r2 < g2 ? (r2 < b2 ? r2 : b2) : (g2 < b2 ? g2 : b2);
        var hue2 = 0;
        if (mx2 !== mn2) {
          var d2 = mx2 - mn2;
          if (mx2 === r2)      hue2 = ((g2 - b2) / d2 + (g2 < b2 ? 6 : 0)) * 60;
          else if (mx2 === g2) hue2 = ((b2 - r2) / d2 + 2) * 60;
          else                 hue2 = ((r2 - g2) / d2 + 4) * 60;
        }
        var lit2 = 35 + v2 * 35;
        drawCharHSL(glyph, x2, y2, hue2 | 0, 78, lit2 | 0);
      }
    }
  }
}

registerMode('fractalvid', { init: initFractalVid, render: renderFractalVid });
