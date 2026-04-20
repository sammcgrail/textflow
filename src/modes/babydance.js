// babydance — 90s Dancing Baby ASCII cha-cha
// The iconic 3D-rendered baby from Ally McBeal era, in choppy low-framerate glory.
// 4 keyframes cycling at ~150ms each = 6.7fps for that authentic early-3D feel.
// Click speeds up to rave tempo for ~2s.

import { clearCanvas, drawChar } from '../core/draw.js';
import { screenToGrid } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Flesh tones — warm peach for baby skin, deeper for shading, white for diaper
var SKIN_LIGHT = [255, 210, 180];
var SKIN_MID   = [230, 170, 140];
var SKIN_DARK  = [180, 120, 100];
var DIAPER     = [250, 245, 235];
var EYE        = [30, 30, 40];
var HAIR       = [140, 90, 60];
var SHADOW     = [30, 25, 20];

// --- Keyframe definitions ---
// Each entry: [x, y, ch, rgbTag]
// rgbTag: 'L'=skin light, 'M'=skin mid, 'D'=skin dark, 'W'=diaper, 'E'=eye, 'H'=hair
// Coordinates are local to an anchor (cx, cy) — baby torso center.
//
// Baby anatomy layout (relative, head centered at y=-7):
//   rows -9..-4  : head (round, ~7 wide)
//   rows -3..-2  : neck
//   rows -1..+2  : torso (wider than tall)
//   rows  3..+4  : diaper triangle
//   rows  5..+8  : legs (splayed per pose)
//   arms exit torso around rows -1..+1 (angle varies per pose)

function makeKeyframe(spec) {
  // spec is an array of [x, y, ch, tag] tuples
  return spec;
}

// POSE 1 — LEFT_STEP : left hip out, right arm up, head tilted left
var POSE_LEFT_STEP = makeKeyframe([
  // Hair tuft on top
  [-1, -9, ',', 'H'], [0, -9, '~', 'H'], [1, -9, ',', 'H'],
  // Head — round and plump, 7 wide, tilted left slightly
  [-3, -8, '.', 'L'], [-2, -8, '-', 'L'], [-1, -8, '_', 'L'], [0, -8, '_', 'L'], [1, -8, '_', 'L'], [2, -8, '-', 'L'], [3, -8, '.', 'L'],
  [-4, -7, '(', 'L'], [-3, -7, 'o', 'L'], [-2, -7, 'O', 'L'], [-1, -7, 'O', 'L'], [0, -7, 'O', 'L'], [1, -7, 'O', 'L'], [2, -7, 'O', 'L'], [3, -7, 'o', 'L'], [4, -7, ')', 'L'],
  [-4, -6, '(', 'L'], [-3, -6, 'O', 'L'], [-2, -6, 'o', 'E'], [-1, -6, 'O', 'L'], [0, -6, '_', 'M'], [1, -6, 'O', 'L'], [2, -6, 'o', 'E'], [3, -6, 'O', 'L'], [4, -6, ')', 'L'],
  [-4, -5, '(', 'L'], [-3, -5, 'O', 'L'], [-2, -5, 'O', 'L'], [-1, -5, 'O', 'L'], [0, -5, 'o', 'M'], [1, -5, 'O', 'L'], [2, -5, 'O', 'L'], [3, -5, 'O', 'L'], [4, -5, ')', 'L'],
  [-3, -4, '\\', 'L'], [-2, -4, '_', 'L'], [-1, -4, 'v', 'M'], [0, -4, '_', 'L'], [1, -4, 'v', 'M'], [2, -4, '_', 'L'], [3, -4, '/', 'L'],
  // Neck
  [-1, -3, '|', 'M'], [0, -3, '|', 'M'], [1, -3, '|', 'M'],
  // Right arm UP (baby's right = viewer's left side), left arm DOWN-OUT
  [-5, -3, '/', 'M'],
  [-6, -4, 'o', 'L'], [-5, -4, '/', 'M'],
  [-7, -5, '(', 'L'], [-6, -5, 'O', 'L'],
  // Left arm swings DOWN-LEFT (right side of screen)
  [4, -2, '\\', 'M'], [5, -2, 'o', 'L'],
  [5, -1, '\\', 'M'], [6, -1, 'O', 'L'],
  [6, 0, ')', 'L'],
  // Torso — wide & chubby, 9 cols
  [-4, -2, '(', 'L'], [-3, -2, 'O', 'L'], [-2, -2, 'O', 'L'], [-1, -2, 'O', 'L'], [0, -2, 'O', 'L'], [1, -2, 'O', 'L'], [2, -2, 'O', 'L'], [3, -2, 'O', 'L'],
  [-4, -1, '(', 'L'], [-3, -1, 'O', 'M'], [-2, -1, 'O', 'L'], [-1, -1, 'O', 'L'], [0, -1, '.', 'D'], [1, -1, 'O', 'L'], [2, -1, 'O', 'L'], [3, -1, 'O', 'M'], [4, -1, ')', 'L'],
  [-4, 0, '(', 'L'], [-3, 0, 'O', 'L'], [-2, 0, 'O', 'L'], [-1, 0, 'O', 'L'], [0, 0, 'O', 'L'], [1, 0, 'O', 'L'], [2, 0, 'O', 'L'], [3, 0, 'O', 'L'], [4, 0, ')', 'L'],
  [-3, 1, '\\', 'L'], [-2, 1, '_', 'L'], [-1, 1, '_', 'M'], [0, 1, 'O', 'M'], [1, 1, '_', 'M'], [2, 1, '_', 'L'], [3, 1, '/', 'L'],
  // Diaper triangle
  [-3, 2, '/', 'W'], [-2, 2, '#', 'W'], [-1, 2, '#', 'W'], [0, 2, '#', 'W'], [1, 2, '#', 'W'], [2, 2, '#', 'W'], [3, 2, '\\', 'W'],
  [-2, 3, '\\', 'W'], [-1, 3, '#', 'W'], [0, 3, '#', 'W'], [1, 3, '#', 'W'], [2, 3, '/', 'W'],
  [-1, 4, '\\', 'W'], [0, 4, 'V', 'W'], [1, 4, '/', 'W'],
  // LEFT leg kicks OUT to viewer's left (baby's right leg), right leg planted
  [-4, 5, '/', 'L'], [-3, 5, 'O', 'L'],
  [-5, 6, '(', 'L'], [-4, 6, 'O', 'M'],
  [-6, 7, 'O', 'L'], [-5, 7, ')', 'L'],
  [-7, 8, '=', 'D'], [-6, 8, '=', 'D'],
  // Right leg (viewer's right) planted
  [1, 5, 'O', 'L'], [2, 5, 'O', 'L'],
  [1, 6, 'O', 'L'], [2, 6, 'O', 'M'],
  [1, 7, 'O', 'L'], [2, 7, ')', 'L'],
  [0, 8, '=', 'D'], [1, 8, '=', 'D'], [2, 8, '=', 'D'],
]);

// POSE 2 — MID_LEFT : transition toward center, both arms mid-swing
var POSE_MID_LEFT = makeKeyframe([
  // Hair
  [-1, -9, '~', 'H'], [0, -9, '~', 'H'], [1, -9, ',', 'H'],
  // Head
  [-3, -8, '.', 'L'], [-2, -8, '-', 'L'], [-1, -8, '_', 'L'], [0, -8, '_', 'L'], [1, -8, '_', 'L'], [2, -8, '-', 'L'], [3, -8, '.', 'L'],
  [-4, -7, '(', 'L'], [-3, -7, 'O', 'L'], [-2, -7, 'O', 'L'], [-1, -7, 'O', 'L'], [0, -7, 'O', 'L'], [1, -7, 'O', 'L'], [2, -7, 'O', 'L'], [3, -7, 'O', 'L'], [4, -7, ')', 'L'],
  [-4, -6, '(', 'L'], [-3, -6, 'O', 'L'], [-2, -6, 'o', 'E'], [-1, -6, 'O', 'L'], [0, -6, '_', 'M'], [1, -6, 'O', 'L'], [2, -6, 'o', 'E'], [3, -6, 'O', 'L'], [4, -6, ')', 'L'],
  [-4, -5, '(', 'L'], [-3, -5, 'O', 'L'], [-2, -5, 'O', 'L'], [-1, -5, 'O', 'L'], [0, -5, 'O', 'M'], [1, -5, 'O', 'L'], [2, -5, 'O', 'L'], [3, -5, 'O', 'L'], [4, -5, ')', 'L'],
  [-3, -4, '\\', 'L'], [-2, -4, '_', 'L'], [-1, -4, 'v', 'M'], [0, -4, '_', 'L'], [1, -4, 'v', 'M'], [2, -4, '_', 'L'], [3, -4, '/', 'L'],
  // Neck
  [-1, -3, '|', 'M'], [0, -3, '|', 'M'], [1, -3, '|', 'M'],
  // Both arms out horizontally
  [-6, -2, 'o', 'L'], [-5, -2, '=', 'M'],
  [6, -2, '=', 'M'], [7, -2, 'o', 'L'],
  // Torso
  [-4, -2, '(', 'L'], [-3, -2, 'O', 'L'], [-2, -2, 'O', 'L'], [-1, -2, 'O', 'L'], [0, -2, 'O', 'L'], [1, -2, 'O', 'L'], [2, -2, 'O', 'L'], [3, -2, 'O', 'L'],
  [-4, -1, '(', 'L'], [-3, -1, 'O', 'M'], [-2, -1, 'O', 'L'], [-1, -1, 'O', 'L'], [0, -1, '.', 'D'], [1, -1, 'O', 'L'], [2, -1, 'O', 'L'], [3, -1, 'O', 'M'], [4, -1, ')', 'L'],
  [-4, 0, '(', 'L'], [-3, 0, 'O', 'L'], [-2, 0, 'O', 'L'], [-1, 0, 'O', 'L'], [0, 0, 'O', 'L'], [1, 0, 'O', 'L'], [2, 0, 'O', 'L'], [3, 0, 'O', 'L'], [4, 0, ')', 'L'],
  [-3, 1, '\\', 'L'], [-2, 1, '_', 'L'], [-1, 1, '_', 'M'], [0, 1, 'O', 'M'], [1, 1, '_', 'M'], [2, 1, '_', 'L'], [3, 1, '/', 'L'],
  // Diaper
  [-3, 2, '/', 'W'], [-2, 2, '#', 'W'], [-1, 2, '#', 'W'], [0, 2, '#', 'W'], [1, 2, '#', 'W'], [2, 2, '#', 'W'], [3, 2, '\\', 'W'],
  [-2, 3, '\\', 'W'], [-1, 3, '#', 'W'], [0, 3, '#', 'W'], [1, 3, '#', 'W'], [2, 3, '/', 'W'],
  [-1, 4, '\\', 'W'], [0, 4, 'V', 'W'], [1, 4, '/', 'W'],
  // Both legs together — mid-transition (slight crouch)
  [-2, 5, 'O', 'L'], [-1, 5, 'O', 'L'],
  [-2, 6, 'O', 'M'], [-1, 6, 'O', 'L'],
  [-2, 7, 'O', 'L'], [-1, 7, 'O', 'L'],
  [-3, 8, '=', 'D'], [-2, 8, '=', 'D'], [-1, 8, '=', 'D'],
  [1, 5, 'O', 'L'], [2, 5, 'O', 'L'],
  [1, 6, 'O', 'L'], [2, 6, 'O', 'M'],
  [1, 7, 'O', 'L'], [2, 7, 'O', 'L'],
  [1, 8, '=', 'D'], [2, 8, '=', 'D'], [3, 8, '=', 'D'],
]);

// POSE 3 — RIGHT_STEP : mirror of LEFT_STEP, right hip out
var POSE_RIGHT_STEP = makeKeyframe([
  // Hair
  [-1, -9, ',', 'H'], [0, -9, '~', 'H'], [1, -9, ',', 'H'],
  // Head — tilted right
  [-3, -8, '.', 'L'], [-2, -8, '-', 'L'], [-1, -8, '_', 'L'], [0, -8, '_', 'L'], [1, -8, '_', 'L'], [2, -8, '-', 'L'], [3, -8, '.', 'L'],
  [-4, -7, '(', 'L'], [-3, -7, 'o', 'L'], [-2, -7, 'O', 'L'], [-1, -7, 'O', 'L'], [0, -7, 'O', 'L'], [1, -7, 'O', 'L'], [2, -7, 'O', 'L'], [3, -7, 'o', 'L'], [4, -7, ')', 'L'],
  [-4, -6, '(', 'L'], [-3, -6, 'O', 'L'], [-2, -6, 'o', 'E'], [-1, -6, 'O', 'L'], [0, -6, '_', 'M'], [1, -6, 'O', 'L'], [2, -6, 'o', 'E'], [3, -6, 'O', 'L'], [4, -6, ')', 'L'],
  [-4, -5, '(', 'L'], [-3, -5, 'O', 'L'], [-2, -5, 'O', 'L'], [-1, -5, 'O', 'L'], [0, -5, 'o', 'M'], [1, -5, 'O', 'L'], [2, -5, 'O', 'L'], [3, -5, 'O', 'L'], [4, -5, ')', 'L'],
  [-3, -4, '\\', 'L'], [-2, -4, '_', 'L'], [-1, -4, 'v', 'M'], [0, -4, '_', 'L'], [1, -4, 'v', 'M'], [2, -4, '_', 'L'], [3, -4, '/', 'L'],
  // Neck
  [-1, -3, '|', 'M'], [0, -3, '|', 'M'], [1, -3, '|', 'M'],
  // LEFT arm UP (viewer's right), right arm down-left
  [5, -3, '\\', 'M'],
  [5, -4, '\\', 'M'], [6, -4, 'o', 'L'],
  [6, -5, 'O', 'L'], [7, -5, ')', 'L'],
  // Right arm swings DOWN-right (viewer's left)
  [-5, -2, '/', 'M'], [-6, -2, 'o', 'L'],
  [-6, -1, '/', 'M'], [-7, -1, 'O', 'L'],
  [-7, 0, '(', 'L'],
  // Torso
  [-4, -2, '(', 'L'], [-3, -2, 'O', 'L'], [-2, -2, 'O', 'L'], [-1, -2, 'O', 'L'], [0, -2, 'O', 'L'], [1, -2, 'O', 'L'], [2, -2, 'O', 'L'], [3, -2, 'O', 'L'],
  [-4, -1, '(', 'L'], [-3, -1, 'O', 'M'], [-2, -1, 'O', 'L'], [-1, -1, 'O', 'L'], [0, -1, '.', 'D'], [1, -1, 'O', 'L'], [2, -1, 'O', 'L'], [3, -1, 'O', 'M'], [4, -1, ')', 'L'],
  [-4, 0, '(', 'L'], [-3, 0, 'O', 'L'], [-2, 0, 'O', 'L'], [-1, 0, 'O', 'L'], [0, 0, 'O', 'L'], [1, 0, 'O', 'L'], [2, 0, 'O', 'L'], [3, 0, 'O', 'L'], [4, 0, ')', 'L'],
  [-3, 1, '\\', 'L'], [-2, 1, '_', 'L'], [-1, 1, '_', 'M'], [0, 1, 'O', 'M'], [1, 1, '_', 'M'], [2, 1, '_', 'L'], [3, 1, '/', 'L'],
  // Diaper
  [-3, 2, '/', 'W'], [-2, 2, '#', 'W'], [-1, 2, '#', 'W'], [0, 2, '#', 'W'], [1, 2, '#', 'W'], [2, 2, '#', 'W'], [3, 2, '\\', 'W'],
  [-2, 3, '\\', 'W'], [-1, 3, '#', 'W'], [0, 3, '#', 'W'], [1, 3, '#', 'W'], [2, 3, '/', 'W'],
  [-1, 4, '\\', 'W'], [0, 4, 'V', 'W'], [1, 4, '/', 'W'],
  // LEFT leg planted (viewer's left), RIGHT leg kicks out (viewer's right)
  [-2, 5, 'O', 'L'], [-1, 5, 'O', 'L'],
  [-2, 6, 'O', 'M'], [-1, 6, 'O', 'L'],
  [-2, 7, 'O', 'L'], [-1, 7, 'O', 'L'],
  [-3, 8, '=', 'D'], [-2, 8, '=', 'D'], [-1, 8, '=', 'D'],
  // Right leg kicks out to viewer's right
  [2, 5, 'O', 'L'], [3, 5, '\\', 'L'],
  [3, 6, 'O', 'M'], [4, 6, ')', 'L'],
  [4, 7, 'O', 'L'], [5, 7, '(', 'L'],
  [5, 8, '=', 'D'], [6, 8, '=', 'D'],
]);

// POSE 4 — MID_RIGHT : mirror of MID_LEFT transition
var POSE_MID_RIGHT = makeKeyframe([
  // Hair
  [-1, -9, ',', 'H'], [0, -9, '~', 'H'], [1, -9, '~', 'H'],
  // Head
  [-3, -8, '.', 'L'], [-2, -8, '-', 'L'], [-1, -8, '_', 'L'], [0, -8, '_', 'L'], [1, -8, '_', 'L'], [2, -8, '-', 'L'], [3, -8, '.', 'L'],
  [-4, -7, '(', 'L'], [-3, -7, 'O', 'L'], [-2, -7, 'O', 'L'], [-1, -7, 'O', 'L'], [0, -7, 'O', 'L'], [1, -7, 'O', 'L'], [2, -7, 'O', 'L'], [3, -7, 'O', 'L'], [4, -7, ')', 'L'],
  [-4, -6, '(', 'L'], [-3, -6, 'O', 'L'], [-2, -6, 'o', 'E'], [-1, -6, 'O', 'L'], [0, -6, '_', 'M'], [1, -6, 'O', 'L'], [2, -6, 'o', 'E'], [3, -6, 'O', 'L'], [4, -6, ')', 'L'],
  [-4, -5, '(', 'L'], [-3, -5, 'O', 'L'], [-2, -5, 'O', 'L'], [-1, -5, 'O', 'L'], [0, -5, 'O', 'M'], [1, -5, 'O', 'L'], [2, -5, 'O', 'L'], [3, -5, 'O', 'L'], [4, -5, ')', 'L'],
  [-3, -4, '\\', 'L'], [-2, -4, '_', 'L'], [-1, -4, 'v', 'M'], [0, -4, '_', 'L'], [1, -4, 'v', 'M'], [2, -4, '_', 'L'], [3, -4, '/', 'L'],
  // Neck
  [-1, -3, '|', 'M'], [0, -3, '|', 'M'], [1, -3, '|', 'M'],
  // Both arms horizontal (mirror)
  [-7, -2, 'o', 'L'], [-6, -2, '=', 'M'],
  [5, -2, '=', 'M'], [6, -2, 'o', 'L'],
  // Torso
  [-4, -2, '(', 'L'], [-3, -2, 'O', 'L'], [-2, -2, 'O', 'L'], [-1, -2, 'O', 'L'], [0, -2, 'O', 'L'], [1, -2, 'O', 'L'], [2, -2, 'O', 'L'], [3, -2, 'O', 'L'],
  [-4, -1, '(', 'L'], [-3, -1, 'O', 'M'], [-2, -1, 'O', 'L'], [-1, -1, 'O', 'L'], [0, -1, '.', 'D'], [1, -1, 'O', 'L'], [2, -1, 'O', 'L'], [3, -1, 'O', 'M'], [4, -1, ')', 'L'],
  [-4, 0, '(', 'L'], [-3, 0, 'O', 'L'], [-2, 0, 'O', 'L'], [-1, 0, 'O', 'L'], [0, 0, 'O', 'L'], [1, 0, 'O', 'L'], [2, 0, 'O', 'L'], [3, 0, 'O', 'L'], [4, 0, ')', 'L'],
  [-3, 1, '\\', 'L'], [-2, 1, '_', 'L'], [-1, 1, '_', 'M'], [0, 1, 'O', 'M'], [1, 1, '_', 'M'], [2, 1, '_', 'L'], [3, 1, '/', 'L'],
  // Diaper
  [-3, 2, '/', 'W'], [-2, 2, '#', 'W'], [-1, 2, '#', 'W'], [0, 2, '#', 'W'], [1, 2, '#', 'W'], [2, 2, '#', 'W'], [3, 2, '\\', 'W'],
  [-2, 3, '\\', 'W'], [-1, 3, '#', 'W'], [0, 3, '#', 'W'], [1, 3, '#', 'W'], [2, 3, '/', 'W'],
  [-1, 4, '\\', 'W'], [0, 4, 'V', 'W'], [1, 4, '/', 'W'],
  // Legs together (mirror of MID_LEFT)
  [-2, 5, 'O', 'L'], [-1, 5, 'O', 'L'],
  [-2, 6, 'O', 'M'], [-1, 6, 'O', 'L'],
  [-2, 7, 'O', 'L'], [-1, 7, 'O', 'L'],
  [-3, 8, '=', 'D'], [-2, 8, '=', 'D'], [-1, 8, '=', 'D'],
  [1, 5, 'O', 'L'], [2, 5, 'O', 'L'],
  [1, 6, 'O', 'L'], [2, 6, 'O', 'M'],
  [1, 7, 'O', 'L'], [2, 7, 'O', 'L'],
  [1, 8, '=', 'D'], [2, 8, '=', 'D'], [3, 8, '=', 'D'],
]);

// Sequence: LEFT_STEP → MID_LEFT → RIGHT_STEP → MID_RIGHT → (repeat)
var KEYFRAMES = [POSE_LEFT_STEP, POSE_MID_LEFT, POSE_RIGHT_STEP, POSE_MID_RIGHT];

// Head bob offsets per frame — subtle vertical bounce for beat
var HEAD_BOB = [0, -1, 0, -1];
// Horizontal sway per frame — baby shifts side to side
var BODY_SWAY = [-1, 0, 1, 0];

var FRAME_MS_NORMAL = 150;   // 6.7 fps classic dancing baby feel
var FRAME_MS_RAVE   = 55;    // rave tempo on click
var RAVE_DURATION_MS = 2000;

// Background noise dots — precomputed so they don't flicker too wildly
var BG_DOTS = [];

// Click speedup state
var raveUntil = 0;

// Ground shadow width pulses with the beat
var groundShadowTimer = 0;

function tagToColor(tag) {
  if (tag === 'L') return SKIN_LIGHT;
  if (tag === 'M') return SKIN_MID;
  if (tag === 'D') return SKIN_DARK;
  if (tag === 'W') return DIAPER;
  if (tag === 'E') return EYE;
  if (tag === 'H') return HAIR;
  return SKIN_LIGHT;
}

function initBabydance() {
  BG_DOTS = [];
  raveUntil = 0;
  groundShadowTimer = 0;
  // Precompute sparse background dots — 90s-web sparse noise
  var W = state.COLS || 80, H = state.ROWS || 40;
  var count = Math.max(40, (W * H * 0.012) | 0);
  for (var i = 0; i < count; i++) {
    BG_DOTS.push({
      x: Math.random() * W,
      y: Math.random() * H,
      phase: Math.random() * Math.PI * 2,
      ch: Math.random() < 0.7 ? '.' : (Math.random() < 0.5 ? ':' : '`')
    });
  }
}

function renderBabydance() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!W || !H) return;

  // Resize bg dots if the grid changed significantly
  var expected = Math.max(40, (W * H * 0.012) | 0);
  if (Math.abs(BG_DOTS.length - expected) > 20) initBabydance();

  var now = performance.now();
  var isRaving = now < raveUntil;
  var frameMs = isRaving ? FRAME_MS_RAVE : FRAME_MS_NORMAL;
  var period = frameMs * KEYFRAMES.length;
  var frameIdx = ((now % period) / frameMs) | 0;
  if (frameIdx >= KEYFRAMES.length) frameIdx = KEYFRAMES.length - 1;

  // --- Background: sparse CRT-ish noise dots ---
  var t = now * 0.001;
  for (var i = 0; i < BG_DOTS.length; i++) {
    var d = BG_DOTS[i];
    var tw = Math.sin(t * 1.5 + d.phase) * 0.5 + 0.5;
    if (tw < 0.3) continue;
    var alpha = 0.08 + tw * 0.18;
    drawChar(d.ch, d.x | 0, d.y | 0, 120, 140, 150, alpha);
  }

  // --- Scanline-esque horizontal bands for 90s CRT feel ---
  for (var sy = 0; sy < H; sy += 4) {
    for (var sx = 0; sx < W; sx += 8) {
      var sxw = (sx + ((t * 2 + sy * 0.3) | 0) * 2) % W;
      drawChar('.', sxw | 0, sy, 80, 90, 110, 0.05);
    }
  }

  // --- Baby position: centered, with horizontal sway ---
  var frame = KEYFRAMES[frameIdx];
  var sway = BODY_SWAY[frameIdx];
  var headBob = HEAD_BOB[frameIdx];
  var cx = (W / 2) | 0;
  var cy = ((H / 2) + 1) | 0;  // slightly below center so legs have room
  // When raving, add a tiny extra jitter so it looks frenzied
  if (isRaving) {
    sway += (Math.random() < 0.5 ? -1 : 1);
  }
  cx += sway;

  // --- Ground shadow (ellipse under baby) ---
  // Pulses with beat — wider on step frames, narrower on mid frames
  var groundY = cy + 9;
  var shadowBase = (frameIdx === 0 || frameIdx === 2) ? 8 : 6;
  if (isRaving) shadowBase += 1;
  if (groundY >= 0 && groundY < H) {
    for (var dx = -shadowBase; dx <= shadowBase; dx++) {
      var gx = cx + dx;
      if (gx < 0 || gx >= W) continue;
      var r = Math.abs(dx) / shadowBase;
      var alpha = (1 - r) * 0.35;
      if (alpha < 0.05) continue;
      var ch = Math.abs(dx) < 3 ? '_' : (Math.abs(dx) < 6 ? '.' : '`');
      drawChar(ch, gx, groundY, SHADOW[0], SHADOW[1], SHADOW[2], alpha);
    }
  }

  // --- Draw the baby ---
  for (var j = 0; j < frame.length; j++) {
    var cell = frame[j];
    var lx = cell[0], ly = cell[1], ch = cell[2], tag = cell[3];
    // Head parts (y <= -3) also get the head-bob offset
    var yOff = (ly <= -3) ? headBob : 0;
    var gx = cx + lx;
    var gy = cy + ly + yOff;
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    var color = tagToColor(tag);
    // Extra saturation when raving
    var alpha = isRaving ? 1.0 : 0.95;
    drawChar(ch, gx, gy, color[0], color[1], color[2], alpha);
  }

  // --- Rave mode text burst ---
  if (isRaving) {
    var remaining = raveUntil - now;
    var fadeA = Math.min(1, remaining / 500);
    var label = 'CHA CHA!';
    var labelX = cx - (label.length / 2) | 0;
    var labelY = cy - 12;
    if (labelY >= 0 && labelY < H) {
      for (var k = 0; k < label.length; k++) {
        var c = label.charAt(k);
        if (c === ' ') continue;
        // Rainbow per-char hue
        var hue = (k * 45 + now * 0.2) % 360;
        // Simple hue->rgb
        var rgb = hueToRgb(hue);
        var gxl = labelX + k;
        if (gxl >= 0 && gxl < W) {
          drawChar(c, gxl, labelY, rgb[0], rgb[1], rgb[2], fadeA);
        }
      }
    }
  }
}

// Quick hue-to-rgb for the rave label
function hueToRgb(h) {
  h = ((h % 360) + 360) % 360;
  var c = 1;
  var x = 1 - Math.abs((h / 60) % 2 - 1);
  var r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [(r * 255) | 0, (g * 255) | 0, (b * 255) | 0];
}

function attach_babydance() {
  state.canvas.addEventListener('mousedown', function(e) {
    if (state.currentMode !== 'babydance') return;
    raveUntil = performance.now() + RAVE_DURATION_MS;
  });
  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'babydance') return;
    e.preventDefault();
    raveUntil = performance.now() + RAVE_DURATION_MS;
  }, { passive: false });
}

registerMode('babydance', {
  init: initBabydance,
  render: renderBabydance,
  attach: attach_babydance,
});
