// silencebrand — warped SILENCE,BRAND crab loop rendered as ASCII.
// Click/tap drops a vertical laser beam from the top of the screen toward the
// pointer location. On impact the laser burns a brief radial flash and leaves
// a fading red trail. Inspired by the meme, possessed by psychedelia.
//
// Asset: /textflow/static/silencebrand.mp4 (originally a GIF barnacle authored;
// transcoded to h264/yuv420p for a ~65× size reduction — 6MB GIF → 93KB MP4).
// drawImage samples the current video frame each render tick.

import { clearCanvas, drawChar, drawString } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { pointer } from '../core/pointer.js';
import { VA_RAMP } from '../core/ramps.js';

// ── background video ───────────────────────────────────────────────────────
var sbEl = document.createElement('video');
sbEl.muted = true;
sbEl.loop = true;
sbEl.playsInline = true;
sbEl.crossOrigin = 'anonymous';
sbEl.style.display = 'none';
document.body.appendChild(sbEl);

var sbCanvas = document.createElement('canvas');
var sbCtx = sbCanvas.getContext('2d', { willReadFrequently: true });
var sbReady = false;

sbEl.onloadeddata = function() { sbReady = true; };

// ── lasers ─────────────────────────────────────────────────────────────────
// Each laser drops a bright head from top to targetY, leaves a fading trail.
// After impact at targetY, a short radial flash at impact point, then gone.
//
// shape: { col, headY, targetY, speed, color[3], trail[], impactAge, maxImpactAge }
//   - impactAge = -1  → still dropping (headY < targetY)
//   - impactAge >= 0  → in flash phase, counts up to maxImpactAge then removed
var lasers = [];

// hot palette — red-dominant with orange/gold accents for variety
var LASER_PALETTE = [
  [255,  20,  20],  // pure red
  [255,  80,  40],  // red-orange
  [255, 180,  40],  // gold
  [255,  40, 120],  // magenta-red
  [255, 240, 120],  // hot yellow
];

// trail length in grid cells — longer = more afterglow, more draw calls per laser
var LASER_TRAIL = 8;
// radial flash extent at impact (cells)
var IMPACT_RADIUS = 5;
// how many frames the impact flash persists
var IMPACT_LIFE = 16;

function spawnLaser(gx, gy) {
  if (gy < 0) gy = 0;
  lasers.push({
    col: gx,
    headY: -2,                      // start slightly above screen for smooth entry
    targetY: gy,
    speed: 1.6 + Math.random() * 1.2,
    color: LASER_PALETTE[(Math.random() * LASER_PALETTE.length) | 0],
    trail: [],
    impactAge: -1,
  });
}

function updateLasers() {
  for (var i = lasers.length - 1; i >= 0; i--) {
    var l = lasers[i];
    if (l.impactAge < 0) {
      // dropping phase
      l.trail.push(l.headY);
      if (l.trail.length > LASER_TRAIL) l.trail.shift();
      l.headY += l.speed;
      if (l.headY >= l.targetY) {
        l.headY = l.targetY;
        l.impactAge = 0;
      }
    } else {
      l.impactAge++;
      // let the trail fade naturally during impact phase
      if (l.trail.length) l.trail.shift();
      if (l.impactAge >= IMPACT_LIFE) {
        lasers.splice(i, 1);
      }
    }
  }
}

function drawLasers() {
  for (var i = 0; i < lasers.length; i++) {
    var l = lasers[i];
    var r = l.color[0], g = l.color[1], b = l.color[2];

    // trail (oldest → newest = dim → bright)
    var n = l.trail.length;
    for (var t = 0; t < n; t++) {
      var y = l.trail[t];
      var ageRatio = (t + 1) / n;
      var alpha = ageRatio * 0.85;
      var ch = ageRatio > 0.7 ? '|' : (ageRatio > 0.35 ? ':' : '.');
      drawChar(ch, l.col, y | 0, r, g, b, alpha);
    }

    if (l.impactAge < 0) {
      // laser head — brightest char, slight white bloom
      drawChar('|', l.col, l.headY | 0, 255, 255, 255, 1);
    } else {
      // impact flash — radial burst centred on (col, targetY), 8 directions.
      // expands outward with age, fades alpha as it ages.
      var a = l.impactAge / IMPACT_LIFE;         // 0..1
      var radius = 1 + a * IMPACT_RADIUS;
      var alpha = Math.max(0, 1 - a);
      var dirs = [
        [ 1, 0], [-1, 0], [ 0, 1], [ 0,-1],
        [ 1, 1], [-1,-1], [ 1,-1], [-1, 1],
      ];
      for (var d = 0; d < dirs.length; d++) {
        var rx = l.col     + (dirs[d][0] * radius) | 0;
        var ry = l.targetY + (dirs[d][1] * radius) | 0;
        var ch = (d < 4) ? '=' : '*';
        drawChar(ch, rx, ry, r, g, b, alpha);
      }
      // center pop
      drawChar('X', l.col, l.targetY, 255, 255, 255, alpha);
    }
  }
}

// ── lifecycle ──────────────────────────────────────────────────────────────
function initSilencebrand() {
  // lazy-load the video on first entry
  if (!sbReady && !sbEl.getAttribute('src')) {
    sbEl.src = '/textflow/static/silencebrand.mp4';
    sbEl.load();
  }
  sbEl.currentTime = 0;
  sbEl.play().catch(function(){});
  // fresh slate — old lasers don't carry between mode visits
  lasers.length = 0;
}

function renderSilencebrand() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!sbReady) {
    drawFancyLoading('warping crab');
    return;
  }

  // sample the gif's current animation frame → ascii grid
  if (sbCanvas.width !== W || sbCanvas.height !== H) {
    sbCanvas.width = W;
    sbCanvas.height = H;
  }
  try {
    sbCtx.drawImage(sbEl, 0, 0, W, H);
  } catch (e) {
    // video not fully ready yet on some browsers first tick — skip this frame
    drawFancyLoading('warping crab');
    return;
  }
  var imgData = sbCtx.getImageData(0, 0, W, H).data;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.03) continue;
      var ri = Math.min(VA_RAMP.length - 1, (lum * VA_RAMP.length) | 0);
      drawChar(VA_RAMP[ri], x, y, r, g, b, 1);
    }
  }

  // consume the click flag → spawn a laser at pointer grid coords
  if (pointer.clicked && state.currentMode === 'silencebrand') {
    pointer.clicked = false;
    var gx = Math.floor(pointer.gx);
    var gy = Math.floor(pointer.gy);
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) {
      spawnLaser(gx, gy);
    }
  }

  updateLasers();
  drawLasers();

  // SILENCE,BRAND tag in bottom-right, dim, doesn't fight the meme text
  drawString('SILENCE, BRAND', W - 1, H - 2, 255, 255, 255, 0.35, 'right');
}

// attach kept trivial — pointer.js handles all the click/touch plumbing;
// we just read pointer.clicked in render and consume it.
function attach_silencebrand() {}

registerMode('silencebrand', {
  init:   initSilencebrand,
  render: renderSilencebrand,
  attach: attach_silencebrand,
});
