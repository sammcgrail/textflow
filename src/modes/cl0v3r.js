import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// cl0v3r — party-dog ASCII portrait with falling confetti + ripple-on-drag.
// Loads /textflow/static/cl0v3r.jpg, samples into the char grid, and
// renders with a luminance-ramped ASCII character set. Color style
// cycles on click (mono / warm / rainbow).

var img = null;
var imgReady = false;
var offCanvas = null, offCtx = null;
var lumGrid = null;       // Float32Array of luminance per cell
var hueGrid = null;       // Float32Array of hue per cell (0..360)
var satGrid = null;       // Float32Array of saturation per cell (0..100)
var gridW = 0, gridH = 0;

var ASCII_RAMP = ' .:-=+*#%@';
var palette = 0;          // 0=natural hues, 1=warm candlelight, 2=rainbow, 3=mono high-contrast

// Confetti particles
var confetti = [];
var CONFETTI_MAX = 90;
var CONFETTI_CHARS = '*+oO.~';
var CONFETTI_HUES = [0, 35, 60, 120, 200, 260, 300];

// Ripple from pointer drag
var ripples = [];         // {x, y, t0, strength}
var lastPtX = 0, lastPtY = 0;
var wasDown = false;
var hintTimer = 0;

function ensureImg() {
  if (img) return;
  img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = '/textflow/static/cl0v3r.png';
  img.onload = function() { imgReady = true; };
}

function resampleImage() {
  if (!imgReady || !img) return;
  var W = state.COLS, H = state.ROWS;
  if (W < 2 || H < 2) return;
  if (W === gridW && H === gridH && lumGrid) return;

  gridW = W; gridH = H;
  if (!offCanvas) {
    offCanvas = document.createElement('canvas');
    offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
  }
  offCanvas.width = W;
  offCanvas.height = H;
  offCtx.clearRect(0, 0, W, H);

  // preserve aspect: fit image inside grid, letterbox the rest
  var imgAR = img.naturalWidth / img.naturalHeight;
  // char cells aren't square — glyphs are taller than wide so correct for that
  var cellAR = state.CHAR_W / state.CHAR_H;
  var gridAR = (W * cellAR) / H;

  var dw, dh, dx, dy;
  if (imgAR > gridAR) {
    // image wider — fit width
    dw = W;
    dh = (W * cellAR) / imgAR;
    dx = 0;
    dy = ((H - dh) / 2) | 0;
  } else {
    dh = H;
    dw = (H * imgAR) / cellAR;
    dx = ((W - dw) / 2) | 0;
    dy = 0;
  }
  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, W, H);
  offCtx.drawImage(img, dx, dy, dw, dh);

  var data = offCtx.getImageData(0, 0, W, H).data;
  lumGrid = new Float32Array(W * H);
  hueGrid = new Float32Array(W * H);
  satGrid = new Float32Array(W * H);

  for (var i = 0, p = 0; i < W * H; i++, p += 4) {
    var r = data[p], g = data[p+1], b = data[p+2];
    lumGrid[i] = (0.299*r + 0.587*g + 0.114*b) / 255;
    // convert RGB → HSL (hue + sat only)
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = d / max * 100;
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    hueGrid[i] = h;
    satGrid[i] = Math.min(100, s);
  }
}

function spawnConfetti() {
  if (confetti.length >= CONFETTI_MAX) return;
  var W = state.COLS;
  confetti.push({
    x: Math.random() * W,
    y: -1 - Math.random() * 4,
    vx: (Math.random() - 0.5) * 0.12,
    vy: 0.15 + Math.random() * 0.45,
    rot: Math.random() * 6.28,
    vrot: (Math.random() - 0.5) * 0.2,
    hue: CONFETTI_HUES[(Math.random() * CONFETTI_HUES.length) | 0],
    ch: CONFETTI_CHARS[(Math.random() * CONFETTI_CHARS.length) | 0],
  });
}

function updateConfetti(dt) {
  var H = state.ROWS;
  var W = state.COLS;
  // spawn
  if (Math.random() < Math.min(1, dt * 30)) spawnConfetti();
  for (var i = confetti.length - 1; i >= 0; i--) {
    var p = confetti[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.rot += p.vrot * dt * 60;
    // wobble
    p.x += Math.sin(p.rot) * 0.05;
    if (p.y > H + 2 || p.x < -2 || p.x > W + 2) {
      confetti.splice(i, 1);
    }
  }
}

function drawConfetti() {
  for (var i = 0; i < confetti.length; i++) {
    var p = confetti[i];
    var x = p.x | 0, y = p.y | 0;
    if (x < 0 || x >= state.COLS || y < 0 || y >= state.ROWS) continue;
    drawCharHSL(p.ch, x, y, p.hue, 85, 62);
  }
}

function updateRipples() {
  var now = state.time;
  for (var i = ripples.length - 1; i >= 0; i--) {
    if (now - ripples[i].t0 > 1.2) ripples.splice(i, 1);
  }
}

function sampleCharAt(sx, sy, ni) {
  var x = sx | 0, y = sy | 0;
  if (x < 0 || y < 0 || x >= gridW || y >= gridH) return 0;
  var idx = y * gridW + x;
  return lumGrid[idx];
}

function renderCl0v3r() {
  clearCanvas();
  ensureImg();
  resampleImage();

  var W = state.COLS, H = state.ROWS;
  if (!lumGrid) {
    // loading indicator
    var msg = 'loading cl0v3r...';
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], ((W-msg.length)/2|0) + i, (H/2)|0, 40, 60, 60);
    }
    return;
  }

  var t = state.time;

  // pointer handling
  if (pointer.clicked && state.currentMode === 'cl0v3r') {
    pointer.clicked = false;
    palette = (palette + 1) % 4;
  }
  if (pointer.down && state.currentMode === 'cl0v3r') {
    if (!wasDown) { wasDown = true; lastPtX = pointer.gx; lastPtY = pointer.gy; }
    // drag distance → new ripple every ~0.05s
    if (ripples.length === 0 || t - ripples[ripples.length-1].t0 > 0.08) {
      ripples.push({ x: pointer.gx, y: pointer.gy, t0: t, strength: 1.0 });
    }
    lastPtX = pointer.gx; lastPtY = pointer.gy;
  } else {
    wasDown = false;
  }
  updateRipples();

  // global time-based shimmer
  var shimmerPhase = t * 1.2;

  // --- main image render ---
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // compute ripple-offset sample coords
      var sx = x, sy = y;
      for (var ri = 0; ri < ripples.length; ri++) {
        var r = ripples[ri];
        var age = t - r.t0;
        if (age < 0 || age > 1.2) continue;
        var dx = x - r.x, dy = y - r.y;
        var d = Math.sqrt(dx*dx + dy*dy);
        // expanding ring
        var ringR = age * 25;
        var dist = d - ringR;
        var strength = r.strength * Math.exp(-age * 1.8) * Math.exp(-dist*dist*0.06);
        if (strength > 0.01) {
          var nx = d > 0.01 ? dx / d : 0;
          var ny = d > 0.01 ? dy / d : 0;
          sx += nx * strength * 3;
          sy += ny * strength * 3;
        }
      }

      // add tiny wavy shimmer so static looks alive
      sx += Math.sin(y * 0.3 + shimmerPhase) * 0.25;
      sy += Math.cos(x * 0.3 + shimmerPhase * 0.7) * 0.15;

      var lum = sampleCharAt(sx, sy, y * W + x);
      // portrait-style: bright areas (cream background) stay empty,
      // dark areas (dog silhouette) render dense. flip the ramp mapping.
      var density = 1 - lum;
      if (density <= 0.12) continue;

      // pick char from ramp by inverse luminance
      var ri2 = (density * (ASCII_RAMP.length - 1)) | 0;
      if (ri2 < 0) ri2 = 0; else if (ri2 >= ASCII_RAMP.length) ri2 = ASCII_RAMP.length - 1;
      var ch = ASCII_RAMP[ri2];
      if (ch === ' ') continue;

      // look up src hue from base grid (pre-ripple, stable coloring)
      var baseI = y * W + x;
      var srcH = hueGrid[baseI];
      var srcS = satGrid[baseI];
      var hue, sat, light;

      if (palette === 0) {
        // natural hues with gentle cycling — dark pixels get colored bright text
        hue = (srcH + t * 8) % 360;
        sat = Math.min(100, srcS * 0.7 + 20);
        light = 28 + density * 45;
      } else if (palette === 1) {
        // warm candlelight
        hue = (20 + density * 40 + Math.sin(t + x*0.1)*6) % 360;
        sat = 85;
        light = 20 + density * 60;
      } else if (palette === 2) {
        // rainbow spiral from center
        var cx = W/2, cy = H/2;
        var ang = Math.atan2(y - cy, x - cx);
        var rad = Math.sqrt((x-cx)*(x-cx) + (y-cy)*(y-cy));
        hue = ((ang * 180 / Math.PI) + rad * 4 + t * 30 + 360) % 360;
        sat = 80;
        light = 30 + density * 45;
      } else {
        // mono high-contrast chrome
        hue = 190;
        sat = 10;
        light = (density * 75 + 15) | 0;
      }

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }

  // --- confetti ---
  var dt = 1/60;
  updateConfetti(dt);
  drawConfetti();

  // --- hint ---
  hintTimer += dt;
  if (hintTimer < 4.5) {
    var hint = 'tap for palette · drag to ripple';
    var hintLight = (28 + Math.sin(t * 3) * 10) | 0;
    for (var hi = 0; hi < hint.length; hi++) {
      var hx = ((W - hint.length) / 2 | 0) + hi;
      var hy = H - 2;
      if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
        drawCharHSL(hint[hi], hx, hy, 50, 30, hintLight);
      }
    }
  }

  // --- palette label ---
  var labels = ['NATURAL', 'CANDLE', 'RAINBOW', 'CHROME'];
  var lbl = 'cl0v3r [' + labels[palette] + ']';
  for (var li = 0; li < lbl.length; li++) {
    drawCharHSL(lbl[li], 2 + li, 1, palette * 70, 60, 55);
  }
}

function initCl0v3r() {
  ensureImg();
  // reset grids so they re-sample at new size if we came from a different mode
  lumGrid = null;
  gridW = 0; gridH = 0;
  confetti.length = 0;
  ripples.length = 0;
  hintTimer = 0;
}

registerMode('cl0v3r', { init: initCl0v3r, render: renderCl0v3r });
