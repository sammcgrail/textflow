import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var PROP_FAMILY = 'Georgia, Palatino, "Times New Roman", serif';
var PROP_WEIGHTS = [300, 500, 800];
var PROP_STYLES = ['normal', 'italic'];
var PROP_CHARSET = ' .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyz0123456789';
var propPalette = [];
var propReady = false;
var propDens, propTempDens;
var propEmitters = [
  { cx: 0.3, cy: 0.35, orbitR: 0.12, freq: 0.25, phase: 0, strength: 0.2 },
  { cx: 0.7, cy: 0.4, orbitR: 0.1, freq: 0.3, phase: 2.0, strength: 0.16 },
  { cx: 0.5, cy: 0.65, orbitR: 0.14, freq: 0.2, phase: 4.0, strength: 0.22 }
];

function initPropPalette() {
  if (propReady) return;
  var measCanvas = document.createElement('canvas');
  measCanvas.width = measCanvas.height = 28;
  var measCtx = measCanvas.getContext('2d', { willReadFrequently: true });
  propPalette = [];
  for (var si = 0; si < PROP_STYLES.length; si++) {
    var style = PROP_STYLES[si];
    for (var wi = 0; wi < PROP_WEIGHTS.length; wi++) {
      var weight = PROP_WEIGHTS[wi];
      var fontStr = (style === 'italic' ? 'italic ' : '') + weight + ' ' + state.FONT_SIZE + 'px ' + PROP_FAMILY;
      for (var ci = 0; ci < PROP_CHARSET.length; ci++) {
        var ch = PROP_CHARSET[ci];
        if (ch === ' ') continue;
        // Measure width
        measCtx.font = fontStr;
        var w = measCtx.measureText(ch).width;
        if (w <= 0) continue;
        // Measure brightness
        measCtx.clearRect(0, 0, 28, 28);
        measCtx.fillStyle = '#fff';
        measCtx.textBaseline = 'middle';
        measCtx.fillText(ch, 1, 14);
        var imgData = measCtx.getImageData(0, 0, 28, 28).data;
        var sum = 0;
        for (var pi = 3; pi < imgData.length; pi += 4) sum += imgData[pi];
        var brightness = sum / (255 * 784);
        propPalette.push({ char: ch, weight: weight, style: style, font: fontStr, width: w, brightness: brightness });
      }
    }
  }
  // Normalize brightness
  var maxB = 0;
  for (var i = 0; i < propPalette.length; i++) if (propPalette[i].brightness > maxB) maxB = propPalette[i].brightness;
  if (maxB > 0) for (var i = 0; i < propPalette.length; i++) propPalette[i].brightness /= maxB;
  propPalette.sort(function(a, b) { return a.brightness - b.brightness; });
  propReady = true;
}

function propFindBest(targetB) {
  var lo = 0, hi = propPalette.length - 1;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (propPalette[mid].brightness < targetB) lo = mid + 1;
    else hi = mid;
  }
  var best = propPalette[lo], bestScore = 999;
  for (var i = Math.max(0, lo - 12); i < Math.min(propPalette.length, lo + 12); i++) {
    var score = Math.abs(propPalette[i].brightness - targetB);
    if (score < bestScore) { bestScore = score; best = propPalette[i]; }
  }
  return best;
}

function initPropfont() {
  initPropPalette();
  var sz = state.COLS * state.ROWS;
  propDens = new Float32Array(sz);
  propTempDens = new Float32Array(sz);
}
// initPropfont(); — called via registerMode
function renderPropfont() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!propDens || propDens.length !== sz) initPropfont();
  if (!propReady || propPalette.length === 0) return;

  var t = state.time;
  var aspect = state.CHAR_W / state.CHAR_H;
  var aspect2 = aspect * aspect;

  // Click injects density
  if (pointer.down && state.currentMode === 'propfont') {
    var fx = pointer.gx | 0, fy = pointer.gy | 0;
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var nx = fx + dx, ny = fy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          var dist = Math.sqrt(dx * dx + dy * dy);
          var s = Math.max(0, 1 - dist / 5);
          propDens[ny * W + nx] = Math.min(1, propDens[ny * W + nx] + s * 0.25);
        }
      }
    }
  }

  // Velocity field + advection
  for (var r = 0; r < H; r++) {
    for (var c = 0; c < W; c++) {
      var nx = c / W, ny = r / H;
      var vx = Math.sin(ny * 6.28 + t * 0.3) * 2 + Math.cos((nx + ny) * 12 + t * 0.5) * 0.7;
      var vy = (Math.cos(nx * 5 + t * 0.4) * 1.5 + Math.sin((nx - ny) * 10 + t * 0.4) * 0.8) * aspect;
      var sx = Math.max(0, Math.min(W - 1.001, c - vx));
      var sy = Math.max(0, Math.min(H - 1.001, r - vy));
      var x0 = sx | 0, y0 = sy | 0;
      var x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
      var ffx = sx - x0, ffy = sy - y0;
      propTempDens[r * W + c] = propDens[y0 * W + x0] * (1 - ffx) * (1 - ffy) +
        propDens[y0 * W + x1] * ffx * (1 - ffy) +
        propDens[y1 * W + x0] * (1 - ffx) * ffy +
        propDens[y1 * W + x1] * ffx * ffy;
    }
  }
  var swap = propDens; propDens = propTempDens; propTempDens = swap;

  // Emitters
  for (var ei = 0; ei < propEmitters.length; ei++) {
    var e = propEmitters[ei];
    var ex = (e.cx + Math.cos(t * e.freq + e.phase) * e.orbitR) * W;
    var ey = (e.cy + Math.sin(t * e.freq * 0.7 + e.phase) * e.orbitR * 0.8) * H;
    var ec = ex | 0, er = ey | 0;
    for (var dr = -4; dr <= 4; dr++) {
      for (var dc = -4; dc <= 4; dc++) {
        var rr = er + dr, cc = ec + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
          var dist = Math.sqrt(dr * dr + dc * dc);
          var s = Math.max(0, 1 - dist / 5);
          propDens[rr * W + cc] = Math.min(1, propDens[rr * W + cc] + s * e.strength);
        }
      }
    }
  }

  // Decay
  for (var i = 0; i < sz; i++) propDens[i] *= 0.985;

  // Render using proportional font palette
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var b = propDens[y * W + x];
      if (b < 0.02) continue;
      b = Math.min(1, b);
      var m = propFindBest(b);
      // Set the specific proportional font for this character
      state.ctx.font = m.font;
      var hue = (220 + b * 60 + state.time * 15) % 360;
      var alpha = Math.max(0.15, Math.min(1, b * 1.5));
      state.ctx.fillStyle = 'hsla(' + (hue | 0) + ',50%,' + (20 + b * 45 | 0) + '%,' + alpha.toFixed(2) + ')';
      state.ctx.fillText(m.char, x * state.CHAR_W, state.NAV_H + y * state.CHAR_H);
    }
  }
  // Restore monospace font for other modes
  state.ctx.font = state.FONT_SIZE + 'px "JetBrains Mono", monospace';
}

registerMode('propfont', {
  init: initPropfont,
  render: renderPropfont,
});
