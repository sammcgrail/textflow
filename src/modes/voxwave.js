import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// voxwave — a speech-formant-style waveform that morphs between five
// "vowel" spectra (A, E, I, O, U). Each vowel is a sum of 3 weighted
// sines at formant frequencies. Click to advance to the next vowel;
// drag left/right changes the base pitch; auto-morphs every 3.5s.
// The resulting waveform is drawn as a densely sampled oscilloscope
// trace with a soft mirrored reflection, colored by local amplitude.

// Formant frequency ratios inspired by real vowel spectra (F1, F2, F3
// as fractions of a master rate). Not physically accurate — chosen for
// distinct-looking waveforms.
var VOWELS = [
  { name: 'A', f: [1.0, 2.7, 5.1], a: [1.0, 0.55, 0.32] },
  { name: 'E', f: [0.6, 4.0, 5.6], a: [1.0, 0.45, 0.38] },
  { name: 'I', f: [0.5, 4.5, 6.2], a: [0.9, 0.55, 0.45] },
  { name: 'O', f: [0.8, 1.9, 3.8], a: [1.0, 0.55, 0.30] },
  { name: 'U', f: [0.7, 1.4, 3.3], a: [1.0, 0.45, 0.25] }
];

var vwCur = 0;
var vwPrev = 4;
var vwMorph = 1;
var vwLastSwitch = 0;
var vwPitch = 1.0;
var vwClickFade = 0;

function initVoxwave() {
  vwCur = 0;
  vwPrev = 0;
  vwMorph = 1;
  vwLastSwitch = state.time;
  vwPitch = 1.0;
  vwClickFade = 0;
}

function sampleWave(x01, vowel, pitch, t) {
  var y = 0;
  for (var k = 0; k < 3; k++) {
    var f = vowel.f[k] * pitch;
    var a = vowel.a[k];
    y += Math.sin(x01 * Math.PI * 2 * f * 4 + t * (1.6 + k * 0.4)) * a;
  }
  return y / 2.3; // approx normalize
}

function renderVoxwave() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (vwLastSwitch === 0) initVoxwave();
  var t = state.time;

  // auto-advance every 3.5s; click also advances
  var shouldSwitch = false;
  if (pointer.clicked && state.currentMode === 'voxwave') {
    pointer.clicked = false;
    shouldSwitch = true;
    vwClickFade = 1.0;
  } else if ((t - vwLastSwitch) > 3.5) {
    shouldSwitch = true;
  }
  if (shouldSwitch) {
    vwPrev = vwCur;
    vwCur = (vwCur + 1) % VOWELS.length;
    vwLastSwitch = t;
    vwMorph = 0;
  }
  if (vwMorph < 1) vwMorph = Math.min(1, vwMorph + 0.018);
  if (vwClickFade > 0) vwClickFade = Math.max(0, vwClickFade - 0.02);

  // drag shifts pitch between 0.5x and 2x
  if (pointer.down && state.currentMode === 'voxwave') {
    var target = 0.5 + (pointer.gx / W) * 1.5;
    vwPitch = vwPitch * 0.85 + target * 0.15;
  } else {
    // breathing pitch modulation
    vwPitch = vwPitch * 0.98 + (1.0 + Math.sin(t * 0.7) * 0.12) * 0.02;
  }

  var cy = H * 0.5;
  var amp = H * 0.35;
  var vA = VOWELS[vwPrev];
  var vB = VOWELS[vwCur];

  // trace the waveform densely — several samples per column for smooth curves
  var prevY = null;
  for (var x = 0; x < W; x++) {
    var x01 = x / (W - 1);
    var yA = sampleWave(x01, vA, vwPitch, t);
    var yB = sampleWave(x01, vB, vwPitch, t);
    // smooth morph between previous and current vowel
    var mEase = vwMorph * vwMorph * (3 - 2 * vwMorph);
    var y = yA * (1 - mEase) + yB * mEase;
    var gy = cy + y * amp;
    var gyi = gy | 0;
    // trace connector line between columns so slope isn't broken
    var p0 = prevY === null ? gyi : prevY;
    var p1 = gyi;
    var lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    for (var yy = lo; yy <= hi; yy++) {
      if (yy < 0 || yy >= H) continue;
      var dFromCenter = Math.abs(yy - cy) / (H * 0.5);
      // hue: shift by x position + morph progress
      var hue = ((x / W) * 180 + t * 40 + vwCur * 50) % 360;
      var bright = 50 + (1 - dFromCenter) * 30 + vwClickFade * 20;
      var ch = Math.abs(y) > 0.7 ? '#' : Math.abs(y) > 0.4 ? '*' : Math.abs(y) > 0.15 ? '~' : '-';
      drawCharHSL(ch, x, yy, hue | 0, 85, bright | 0);
    }
    // faint reflection below the wave
    var refY = cy + (cy - gy) * 0.55 + cy * 0.35;
    var refYi = refY | 0;
    if (refYi >= 0 && refYi < H && refYi !== gyi) {
      drawCharHSL('.', x, refYi, (((x / W) * 180 + t * 40 + vwCur * 50 + 180) | 0) % 360, 60, 22);
    }
    prevY = gyi;
  }

  // centerline tick marks — gives the scope a grounded feel
  for (var tx = 0; tx < W; tx += 6) {
    if ((tx / 6) % 2 === 0) drawCharHSL('·', tx, cy | 0, 200, 10, 22);
  }

  // vowel label — bottom-right, clear of the mobile nav overlay
  var label = vB.name;
  drawCharHSL('[', W - 4, H - 2, 60, 80, 60);
  drawCharHSL(label, W - 3, H - 2, 60, 100, 70);
  drawCharHSL(']', W - 2, H - 2, 60, 80, 60);
}

registerMode('voxwave', { init: initVoxwave, render: renderVoxwave });
