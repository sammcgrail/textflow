import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var bmPalette = [];
var bmReady = false;
var bmDens, bmTempDens;
var BM_CHARSET = ' .`\'-,:;_~"^!|/\\(){}[]<>+=*#%@$&0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function initBMPalette() {
  if (bmReady) return;
  var measCanvas = document.createElement('canvas');
  var measSize = Math.ceil(state.FONT_SIZE * 1.5);
  measCanvas.width = measCanvas.height = measSize;
  var measCtx = measCanvas.getContext('2d', { willReadFrequently: true });
  var fontStr = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
  bmPalette = [];
  for (var ci = 0; ci < BM_CHARSET.length; ci++) {
    var ch = BM_CHARSET[ci];
    if (ch === ' ') continue;
    measCtx.clearRect(0, 0, measSize, measSize);
    measCtx.font = fontStr;
    measCtx.fillStyle = '#fff';
    measCtx.textBaseline = 'middle';
    measCtx.fillText(ch, 0, measSize / 2);
    var imgData = measCtx.getImageData(0, 0, measSize, measSize).data;
    var sum = 0;
    for (var pi = 3; pi < imgData.length; pi += 4) sum += imgData[pi];
    var brightness = sum / (255 * measSize * measSize);
    bmPalette.push({ char: ch, brightness: brightness });
  }
  var maxB = 0;
  for (var i = 0; i < bmPalette.length; i++) if (bmPalette[i].brightness > maxB) maxB = bmPalette[i].brightness;
  if (maxB > 0) for (var i = 0; i < bmPalette.length; i++) bmPalette[i].brightness /= maxB;
  bmPalette.sort(function(a, b) { return a.brightness - b.brightness; });
  bmReady = true;
}

function bmFindBest(targetB) {
  var lo = 0, hi = bmPalette.length - 1;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (bmPalette[mid].brightness < targetB) lo = mid + 1;
    else hi = mid;
  }
  var best = bmPalette[lo], bestScore = 999;
  for (var i = Math.max(0, lo - 5); i < Math.min(bmPalette.length, lo + 5); i++) {
    var score = Math.abs(bmPalette[i].brightness - targetB);
    if (score < bestScore) { bestScore = score; best = bmPalette[i]; }
  }
  return best;
}

var bmBlobs = [];
function initBrightmatch() {
  initBMPalette();
  var sz = state.COLS * state.ROWS;
  bmDens = new Float32Array(sz);
  bmTempDens = new Float32Array(sz);
  bmBlobs = [];
  // Spawn metaballs
  for (var i = 0; i < 8; i++) {
    bmBlobs.push({
      x: Math.random() * state.COLS, y: Math.random() * state.ROWS,
      vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 1.5,
      r: 5 + Math.random() * 8
    });
  }
}
// initBrightmatch(); — called via registerMode
function renderBrightmatch() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!bmDens || bmDens.length !== sz) initBrightmatch();
  if (!bmReady || bmPalette.length === 0) return;

  // Click spawns a new blob
  if (pointer.clicked && state.currentMode === 'brightmatch') {
    pointer.clicked = false;
    bmBlobs.push({
      x: pointer.gx, y: pointer.gy,
      vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2,
      r: 4 + Math.random() * 6
    });
    if (bmBlobs.length > 20) bmBlobs.shift();
    pointer.clicked = false;
  }

  // Drag attracts blobs
  if (pointer.down && state.currentMode === 'brightmatch') {
    for (var bi = 0; bi < bmBlobs.length; bi++) {
      var b = bmBlobs[bi];
      var dx = pointer.gx - b.x, dy = pointer.gy - b.y;
      var dist = Math.sqrt(dx * dx + dy * dy) + 1;
      b.vx += dx / dist * 0.3;
      b.vy += dy / dist * 0.3;
    }
  }

  // Update blobs
  for (var bi = 0; bi < bmBlobs.length; bi++) {
    var b = bmBlobs[bi];
    b.x += b.vx * 0.03;
    b.y += b.vy * 0.03;
    // Bounce
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
    if (b.x >= W) { b.x = W - 1; b.vx = -Math.abs(b.vx); }
    if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
    if (b.y >= H) { b.y = H - 1; b.vy = -Math.abs(b.vy); }
    // Damping
    b.vx *= 0.999;
    b.vy *= 0.999;
  }

  // Compute metaball field
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sum = 0;
      for (var bi = 0; bi < bmBlobs.length; bi++) {
        var b = bmBlobs[bi];
        var dx = x - b.x, dy = y - b.y;
        var d2 = dx * dx + dy * dy + 0.1;
        sum += (b.r * b.r) / d2;
      }
      bmDens[y * W + x] = Math.min(1, sum * 0.15);
    }
  }

  // Render using brightness-matched characters
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = bmDens[y * W + x];
      if (v < 0.015) continue;
      var m = bmFindBest(Math.min(1, v));
      // Color based on density — warm tones
      var hue = 30 - v * 30;
      var sat = 60 + v * 30;
      var lit = 10 + v * 55;
      drawCharHSL(m.char, x, y, hue, sat, lit);
    }
  }
}

// ============================================================

registerMode('brightmatch', {
  init: initBrightmatch,
  render: renderBrightmatch,
});
