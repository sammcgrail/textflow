import { clearCanvas, drawChar } from '../core/draw.js';
import { drawFancyLoading } from '../core/loading.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// hyperglow — a bright, hyper-saturated video-to-ASCII engine. Bright bursts
// on black are the source, but the treatment is the star: colors are
// pushed hard, moving regions smear into glowing trails (a decaying energy
// buffer), and luminance edges "ignite" into hot dense glyphs so the form
// pops. Tap anywhere to fire an expanding shockwave of light that ignites
// the characters as it passes; hold/drag to drag a spotlight that supercharges
// the glow wherever your finger is.

var VID_SRC = '/textflow/static/fireworks.mp4';

var SAT        = 1.95;   // saturation push around per-pixel luma
var VIDEO_GAIN = 1.34;   // base brightness multiplier
var BLOOM_GAIN = 0.75;   // how strongly the energy buffer adds glow
var TRAIL_DECAY = 0.82;  // energy persistence per frame (higher = longer trails)
var MOTION_GAIN = 1.6;   // motion -> energy feed
var EDGE_THRESH = 0.24;  // luminance-delta that counts as an "edge" to ignite
var RING_SPEED = 40;     // shockwave expansion, cols/sec
var BURST_LIFE = 1.7;    // shockwave lifetime, seconds
var MAX_BURSTS = 6;
var DENSE = '@#%▓█'; // hot glyphs for ignited edges / peaks

var vEl = document.createElement('video');
vEl.muted = true; vEl.loop = true; vEl.playsInline = true;
vEl.crossOrigin = 'anonymous'; vEl.style.display = 'none';
document.body.appendChild(vEl);

var vCanvas = document.createElement('canvas');
var vCtx = vCanvas.getContext('2d', { willReadFrequently: true });
var ready = false;
vEl.onloadeddata = function () { ready = true; };

var energy = null, lum = null, prev = null;
var gW = 0, gH = 0;
var bursts = [];
var hintT = 0;
var AR = 0.5;

function initHyperglow() {
  if (!ready && !vEl.getAttribute('src')) {
    vEl.src = VID_SRC;
    vEl.load();
  }
  try { vEl.currentTime = 0; } catch (e) {}
  vEl.play().catch(function () {});
  bursts = [];
  hintT = 3.0;
  AR = state.CHAR_W / state.CHAR_H || 0.5;
}

function ensureBuffers(W, H) {
  if (energy && gW === W && gH === H) return;
  gW = W; gH = H;
  energy = new Float32Array(W * H);
  lum = new Float32Array(W * H);
  prev = new Float32Array(W * H);
  bursts = [];
  if (vCanvas.width !== W || vCanvas.height !== H) {
    vCanvas.width = W; vCanvas.height = H;
  }
}

function spawnBurst(gx, gy) {
  if (bursts.length >= MAX_BURSTS) bursts.shift();
  bursts.push({ x: gx, y: gy, age: 0 });
}

function injectBursts(W, H, dt) {
  for (var bi = bursts.length - 1; bi >= 0; bi--) {
    var b = bursts[bi];
    b.age += dt;
    var R = b.age * RING_SPEED;
    var amp = (1 - b.age / BURST_LIFE) * 1.9;
    if (amp <= 0) { bursts.splice(bi, 1); continue; }
    var sigma = 2.6, s2 = 2 * sigma * sigma;
    var yr = (R + 4) * AR;
    var y0 = Math.max(0, (b.y - yr) | 0), y1 = Math.min(H - 1, (b.y + yr) | 0);
    var x0 = Math.max(0, (b.x - R - 4) | 0), x1 = Math.min(W - 1, (b.x + R + 4) | 0);
    for (var y = y0; y <= y1; y++) {
      var dyr = (y - b.y) / AR;
      for (var x = x0; x <= x1; x++) {
        var dxr = x - b.x;
        var d = Math.sqrt(dxr * dxr + dyr * dyr);
        var dr = d - R;
        var add = amp * Math.exp(-(dr * dr) / s2);
        if (add > 0.01) energy[y * W + x] += add;
      }
    }
  }
}

function injectSpotlight(W, H, gx, gy) {
  var rad = 7;
  var yr = rad * AR;
  var y0 = Math.max(0, (gy - yr) | 0), y1 = Math.min(H - 1, (gy + yr) | 0);
  var x0 = Math.max(0, (gx - rad) | 0), x1 = Math.min(W - 1, (gx + rad) | 0);
  for (var y = y0; y <= y1; y++) {
    var dyr = (y - gy) / AR;
    for (var x = x0; x <= x1; x++) {
      var dxr = x - gx;
      var d = Math.sqrt(dxr * dxr + dyr * dyr) / rad;
      if (d < 1) energy[y * W + x] += (1 - d) * (1 - d) * 0.9;
    }
  }
}

function renderHyperglow() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  if (!ready) { drawFancyLoading('charging hyperglow'); return; }
  ensureBuffers(W, H);
  AR = state.CHAR_W / state.CHAR_H || 0.5;

  var dt = 1 / 60;
  vCtx.drawImage(vEl, 0, 0, W, H);
  var data = vCtx.getImageData(0, 0, W, H).data;

  // --- pass 1: luma + energy feed from video + motion ---
  var i, ln;
  for (i = 0; i < W * H; i++) {
    var pi = i * 4;
    ln = (0.299 * data[pi] + 0.587 * data[pi + 1] + 0.114 * data[pi + 2]) / 255;
    lum[i] = ln;
    var mo = Math.abs(ln - prev[i]); prev[i] = ln;
    var e = energy[i] * TRAIL_DECAY + ln * 0.12 + mo * MOTION_GAIN;
    if (e > 2.4) e = 2.4;
    energy[i] = e;
  }

  // --- injections from interaction ---
  injectBursts(W, H, dt);

  // --- pass 2: draw ---
  var rampLen = VA_RAMP.length;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      i = y * W + x;
      var pix = i * 4;
      ln = lum[i];
      var e2 = energy[i];

      var rn = data[pix] / 255, gn = data[pix + 1] / 255, bn = data[pix + 2] / 255;
      // saturation push around luma
      var sr = ln + (rn - ln) * SAT;
      var sg = ln + (gn - ln) * SAT;
      var sb = ln + (bn - ln) * SAT;

      // edges (Sobel-lite): luma delta vs left + up
      var edge = 0;
      if (x > 0) edge += Math.abs(ln - lum[i - 1]);
      if (y > 0) edge += Math.abs(ln - lum[i - W]);

      var bright = ln * VIDEO_GAIN + e2 * BLOOM_GAIN + edge * 1.4;
      if (bright < 0.05) continue;

      var gain = VIDEO_GAIN + e2 * BLOOM_GAIN;
      var R = sr * gain, G = sg * gain, B = sb * gain;

      var ch;
      if (edge > EDGE_THRESH) {
        // ignite the edge: brighter, denser glyph — keep the neon hue, only
        // a touch toward white so color survives instead of blowing out.
        var hot = Math.min(1, (edge - EDGE_THRESH) * 2.2 + e2 * 0.25);
        R *= 1 + 0.5 * hot; G *= 1 + 0.5 * hot; B *= 1 + 0.5 * hot;
        R += (1 - R) * 0.16 * hot; G += (1 - G) * 0.16 * hot; B += (1 - B) * 0.16 * hot;
        ch = DENSE[Math.min(DENSE.length - 1, (hot * DENSE.length) | 0)];
        bright += 0.3 * hot;
      } else {
        var ci = (bright * rampLen) | 0;
        if (ci >= rampLen) ci = rampLen - 1;
        ch = VA_RAMP[ci];
      }

      var Ri = R * 255, Gi = G * 255, Bi = B * 255;
      if (Ri > 255) Ri = 255; if (Gi > 255) Gi = 255; if (Bi > 255) Bi = 255;
      if (Ri < 0) Ri = 0; if (Gi < 0) Gi = 0; if (Bi < 0) Bi = 0;

      var alpha = 0.34 + bright * 0.8;
      if (alpha > 1) alpha = 1;
      drawChar(ch, x, y, Ri | 0, Gi | 0, Bi | 0, alpha);
    }
  }

  // fading on-screen hint
  if (hintT > 0) {
    hintT -= dt;
    var ha = Math.min(0.5, hintT * 0.3);
    var hint = 'tap = shockwave  ·  drag = spotlight';
    var hx = ((W - hint.length) / 2) | 0;
    for (var hi = 0; hi < hint.length; hi++) {
      drawChar(hint[hi], hx + hi, H - 2, 255, 255, 255, ha);
    }
  }
}

// poll pointer in attach (mirror to a global the render reads), and spawn
// bursts on tap. Using attach keeps listeners bound to the live canvas.
function attachHyperglow() {
  var c = state.canvas;
  c.addEventListener('pointerdown', function (e) {
    if (state.currentMode !== 'hyperglow') return;
    var gx = e.clientX / state.CHAR_W;
    var gy = (e.clientY - state.NAV_H) / state.CHAR_H;
    spawnBurst(gx, gy);
  });
  function spot(e) {
    if (state.currentMode !== 'hyperglow') return;
    if (e.buttons === 0 && e.type === 'pointermove') return;
    var t = (e.touches && e.touches[0]) || e;
    var gx = t.clientX / state.CHAR_W;
    var gy = (t.clientY - state.NAV_H) / state.CHAR_H;
    if (energy && gx >= 0 && gx < gW && gy >= 0 && gy < gH) injectSpotlight(gW, gH, gx, gy);
  }
  c.addEventListener('pointermove', spot);
}

registerMode('hyperglow', {
  init: initHyperglow,
  render: renderHyperglow,
  attach: attachHyperglow,
});
