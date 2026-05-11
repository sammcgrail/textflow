import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Pine marten dance club — sam's request 2026-05-05.
// Tiny ASCII marten silhouette with a bright yellow-orange throat patch
// (the species marker), bopping to a sinusoidal beat across a flashing
// disco floor. Multiple frames cycle for the dance loop.

// Each frame = array of [dx, dy, char, hue, sat, lit] tuples drawn
// relative to the marten's anchor (gx, gy). Hue 30 = brown body,
// hue 50 = orange/yellow throat patch, hue 0 = sat=0 means white.
//
// Layout reference (anchor at body center):
//   dx negative = left, dy negative = up.

// Pose 1 — standing tall, paws up
var POSE_STAND = [
  // ears
  [-2, -2, '^', 30, 50, 35], [-1, -2, ' ', 0, 0, 0], [0, -2, '^', 30, 50, 35],
  // face
  [-2, -1, '/', 30, 50, 40], [-1, -1, '•', 0, 0, 80], [0, -1, '_', 30, 50, 40], [1, -1, '•', 0, 0, 80], [2, -1, '\\', 30, 50, 40],
  // throat (orange patch — the marten signature)
  [-1,  0, 'V', 50, 95, 60], [0,  0, ')', 50, 95, 60],
  // body
  [-2,  1, '/', 30, 60, 45], [-1,  1, '=', 30, 60, 45], [0,  1, '=', 30, 60, 45], [1,  1, '=', 30, 60, 45], [2,  1, '\\', 30, 60, 45],
  // legs
  [-2,  2, '|', 30, 60, 40], [2, 2, '|', 30, 60, 40],
  // tail (bushy)
  [3,  1, '~', 30, 50, 50], [4,  0, '~', 30, 50, 55], [5, -1, '~', 30, 50, 60],
];

// Pose 2 — hopping mid-air, body curled
var POSE_HOP = [
  // ears
  [-2, -3, '^', 30, 50, 35], [0, -3, '^', 30, 50, 35],
  // face
  [-2, -2, '(', 30, 50, 40], [-1, -2, '◕', 0, 0, 80], [0, -2, '‿', 30, 50, 50], [1, -2, '◕', 0, 0, 80], [2, -2, ')', 30, 50, 40],
  // throat
  [-1, -1, 'V', 50, 95, 65], [0, -1, ')', 50, 95, 65],
  // body curled
  [-2, 0, '(', 30, 60, 50], [-1, 0, '~', 30, 60, 50], [0, 0, '~', 30, 60, 50], [1, 0, '~', 30, 60, 50], [2, 0, ')', 30, 60, 50],
  // legs tucked
  [-1, 1, 'u', 30, 60, 40], [1, 1, 'u', 30, 60, 40],
  // tail flicked
  [3, 0, '~', 30, 50, 55], [4, 1, '~', 30, 50, 60], [5, 2, '~', 30, 50, 65],
];

// Pose 3 — boogie-side-step, body leaning
var POSE_GROOVE_L = [
  [-3, -2, '^', 30, 50, 35], [-1, -2, '^', 30, 50, 35],
  [-3, -1, '/', 30, 50, 40], [-2, -1, '•', 0, 0, 80], [-1, -1, '_', 30, 50, 40], [0, -1, '•', 0, 0, 80], [1, -1, '\\', 30, 50, 40],
  [-2, 0, 'V', 50, 95, 60], [-1, 0, ')', 50, 95, 60],
  [-3, 1, '/', 30, 60, 45], [-2, 1, '=', 30, 60, 45], [-1, 1, '=', 30, 60, 45], [0, 1, '=', 30, 60, 45], [1, 1, '\\', 30, 60, 45],
  [-3, 2, '/', 30, 60, 40], [1, 2, '\\', 30, 60, 40],
  [2, 1, '~', 30, 50, 50], [3, 1, '~', 30, 50, 55], [4, 0, '~', 30, 50, 60],
];

// Pose 4 — boogie-side-step, mirrored
var POSE_GROOVE_R = [
  [-1, -2, '^', 30, 50, 35], [1, -2, '^', 30, 50, 35],
  [-1, -1, '/', 30, 50, 40], [0, -1, '•', 0, 0, 80], [1, -1, '_', 30, 50, 40], [2, -1, '•', 0, 0, 80], [3, -1, '\\', 30, 50, 40],
  [0, 0, 'V', 50, 95, 60], [1, 0, ')', 50, 95, 60],
  [-1, 1, '/', 30, 60, 45], [0, 1, '=', 30, 60, 45], [1, 1, '=', 30, 60, 45], [2, 1, '=', 30, 60, 45], [3, 1, '\\', 30, 60, 45],
  [-1, 2, '\\', 30, 60, 40], [3, 2, '/', 30, 60, 40],
  [4, 1, '~', 30, 50, 50], [5, 0, '~', 30, 50, 55], [6, -1, '~', 30, 50, 60],
];

var POSES = [POSE_STAND, POSE_GROOVE_L, POSE_HOP, POSE_GROOVE_R];

function initMarten() { /* state-free, nothing to clear */ }

function drawMarten(gx, gy, frameIdx, hueShift) {
  var pose = POSES[frameIdx % POSES.length];
  var W = state.COLS, H = state.ROWS;
  for (var i = 0; i < pose.length; i++) {
    var p = pose[i];
    var x = Math.round(gx + p[0]);
    var y = Math.round(gy + p[1]);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (p[2] === ' ') continue;
    var hue = (p[3] + hueShift) % 360;
    drawCharHSL(p[2], x, y, hue, p[4], p[5]);
  }
}

function renderMarten() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // BPM-locked beat phase. ~120 BPM = 2 beats/sec → period 0.5s.
  var BPM = 120;
  var beat = t * BPM / 60;
  var beatPhase = beat - Math.floor(beat); // 0..1 each beat
  var frameIdx = Math.floor(beat) % POSES.length;

  // ── disco floor: sparse pulsing dots, perf-conscious ─────────────
  // Only plot every-other-cell on the checkerboard, with a beat pulse.
  // pulse drops off fast post-beat so dim cells are mostly empty.
  var pulse = Math.exp(-beatPhase * 4);
  var stride = pulse > 0.6 ? 1 : 2;
  for (var y = 0; y < H; y += stride) {
    for (var x = (y & 1); x < W; x += 2) {
      var cell = ((x + Math.floor(beat)) ^ (y >> 1)) & 1;
      if (!cell && pulse < 0.4) continue;
      var lit = cell ? (10 + pulse * 18) : (6 + pulse * 10);
      var hue = ((y * 8 + t * 60) | 0) % 360;
      drawCharHSL('·', x, y, hue, 80, lit | 0);
    }
  }

  // ── disco beams: 4 sweeping rays from corners (deterministic) ────
  // Use one stochastic frame-seeded RNG so the rays still feel "alive".
  var seed = (t * 30) | 0;
  function pr() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed & 0xffff) / 0xffff; }
  var spotPhase = t * 1.6;
  for (var sp = 0; sp < 4; sp++) {
    var corners = [[0, 0], [W-1, 0], [0, H-1], [W-1, H-1]];
    var corner = corners[sp];
    var aim = sp * Math.PI / 2 + spotPhase;
    var aimX = Math.cos(aim);
    var aimY = Math.sin(aim);
    // Single thin ray per corner — much cheaper.
    for (var d = 2; d < 25; d += 2) {
      var px = Math.round(corner[0] + aimX * d);
      var py = Math.round(corner[1] + aimY * d * 0.5);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      if (pr() > 0.5) continue;
      var hue = (sp * 90 + t * 80) | 0;
      var lit = Math.max(15, 55 - d * 1.5);
      drawCharHSL('░', px, py, hue % 360, 90, lit | 0);
    }
  }

  // ── marten itself: bobs side-to-side and up-down with the beat ──
  var anchorX = W / 2 + Math.sin(beat * Math.PI) * (W * 0.18);
  var anchorY = H / 2 + Math.abs(Math.sin(beat * Math.PI * 2)) * -2; // bob up
  // hue shift cycles too — disco lighting on the marten itself
  var martenHueShift = (Math.sin(t * 1.2) * 25) | 0;
  drawMarten(anchorX | 0, anchorY | 0, frameIdx, martenHueShift);

  // ── speech bubble cycle: random hype words ───────────────────────
  var hypeWords = ['martin out!', 'mustelid moves!', 'paws up!', 'throat-patch flex!', 'forest dancer!', 'critter goes hard!'];
  var wordIdx = Math.floor(t / 2) % hypeWords.length;
  var word = hypeWords[wordIdx];
  // Words flicker in for 0.4s of each 2s cycle.
  var wordPhase = (t / 2) - Math.floor(t / 2);
  if (wordPhase < 0.4) {
    var wx = ((W - word.length) / 2) | 0;
    var wy = 2;
    for (var wi = 0; wi < word.length; wi++) {
      var lit = (50 + Math.sin(wi * 0.4 + t * 8) * 25) | 0;
      drawCharHSL(word[wi], wx + wi, wy, (50 + wi * 8) % 360, 90, lit);
    }
  }
}

registerMode('marten', { init: initMarten, render: renderMarten });
