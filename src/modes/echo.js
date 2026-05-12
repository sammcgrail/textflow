import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// echo — interactive sonar/ripple mode.
//
// Tap   → drop one ping (an expanding ASCII ring).
// Drag  → continuous wake of pings along your path.
// Idle  → a slow ambient ping every 6s so the canvas isn't dead-quiet.
//
// Each ring is drawn as the locus of cells within a ±BAND grid-cell band
// of the current radius. Color hue rotates per-ping (each tap = a new
// color, golden-angle hopping for distinct hues), the glyph escalates with
// brightness (─ brightest down to . dimmest), and ring brightness fades on
// an exponential decay.
//
// Two extras that pay for themselves:
//   • Edge reflection: when a ring's radius exceeds the distance to a
//     viewport edge, a half-amp mirrored echo spawns once per edge.
//   • Constructive interference: brightness is additive across rings so
//     cells where two rings cross light up brighter (─) than either alone.

var rings = [];
var nextHue = 0;
var lastDragT = 0;
var lastAmbientT = 0;
var buf = null, hueBuf = null, hueWeight = null, bufW = 0, bufH = 0;

var RING_SPEED = 22;        // grid cells / second
var RING_LIFE  = 6.0;       // seconds before a ring is culled
var DRAG_INTERVAL = 0.12;   // seconds between drag-spawned pings
var AMBIENT_INTERVAL = 6.0;
var BAND = 1.3;             // ± grid cells from radius that counts as "on ring"

var GLYPHS = ['─', '=', '·', '.'];

function initEcho() {
  rings = [];
  nextHue = (Math.random() * 360) | 0;
  lastDragT = 0;
  lastAmbientT = 0;
  buf = null; hueBuf = null; hueWeight = null; bufW = 0; bufH = 0;
}

function spawnRing(cx, cy, opts) {
  opts = opts || {};
  rings.push({
    cx: cx,
    cy: cy,
    t0: state.time,
    hue: (opts.hue !== undefined) ? opts.hue : nextHue,
    amp: opts.amp || 1.0,
    reflected: !!opts.reflected,
    edgeFlags: 0
  });
  if (opts.hue === undefined) {
    nextHue = (nextHue + 47) % 360;
  }
  if (rings.length > 60) rings.shift();
}

function tryEdgeReflect(ring, W, H, radius) {
  var edges = [
    { mask: 1, hit: radius > ring.cx,           mx: -ring.cx,            my: ring.cy },
    { mask: 2, hit: radius > (W - ring.cx),     mx: 2 * W - ring.cx,     my: ring.cy },
    { mask: 4, hit: radius > ring.cy,           mx: ring.cx,             my: -ring.cy },
    { mask: 8, hit: radius > (H - ring.cy),     mx: ring.cx,             my: 2 * H - ring.cy }
  ];
  for (var i = 0; i < 4; i++) {
    var e = edges[i];
    if (e.hit && !(ring.edgeFlags & e.mask)) {
      ring.edgeFlags |= e.mask;
      rings.push({
        cx: e.mx, cy: e.my,
        t0: ring.t0,
        hue: ring.hue,
        amp: ring.amp * 0.45,
        reflected: true,
        edgeFlags: 15
      });
    }
  }
}

function renderEcho() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // --- input handling ---
  if (state.currentMode === 'echo') {
    if (pointer.clicked) {
      pointer.clicked = false;
      spawnRing(pointer.gx, pointer.gy, { amp: 1.0 });
    }
    if (pointer.down) {
      if (t - lastDragT > DRAG_INTERVAL) {
        spawnRing(pointer.gx, pointer.gy, { amp: 0.7 });
        lastDragT = t;
      }
    }
    if (t - lastAmbientT > AMBIENT_INTERVAL) {
      var cx = W * (0.2 + Math.random() * 0.6);
      var cy = H * (0.2 + Math.random() * 0.6);
      spawnRing(cx, cy, { amp: 0.5 });
      lastAmbientT = t;
    }
  }

  // --- (re)allocate buffers on resize ---
  if (bufW !== W || bufH !== H) {
    buf = new Float32Array(W * H);
    hueBuf = new Float32Array(W * H);
    hueWeight = new Float32Array(W * H);
    bufW = W; bufH = H;
  } else {
    buf.fill(0); hueBuf.fill(0); hueWeight.fill(0);
  }

  // --- accumulate per-cell brightness from all rings ---
  for (var ri = rings.length - 1; ri >= 0; ri--) {
    var ring = rings[ri];
    var age = t - ring.t0;
    if (age > RING_LIFE) { rings.splice(ri, 1); continue; }

    var radius = age * RING_SPEED;
    // Slower exponential decay (halves every ~2s)
    var decay = ring.amp * Math.exp(-age * 0.35);
    if (decay < 0.025) continue;

    if (!ring.reflected) tryEdgeReflect(ring, W, H, radius);

    var rOuter = radius + BAND;
    var rInner = radius - BAND;
    if (rInner < 0) rInner = 0;
    var rOuter2 = rOuter * rOuter;
    var rInner2 = rInner * rInner;
    var minY = Math.max(0, Math.ceil(ring.cy - rOuter));
    var maxY = Math.min(H - 1, Math.floor(ring.cy + rOuter));

    for (var y = minY; y <= maxY; y++) {
      var dy = y - ring.cy;
      var dy2 = dy * dy;
      if (dy2 > rOuter2) continue;
      var maxDx = Math.sqrt(rOuter2 - dy2);
      var minDx = (dy2 < rInner2) ? Math.sqrt(rInner2 - dy2) : 0;

      for (var side = 0; side < 2; side++) {
        var xa, xb;
        if (side === 0) { xa = ring.cx - maxDx; xb = ring.cx - minDx; }
        else            { xa = ring.cx + minDx; xb = ring.cx + maxDx; }
        var xStart = Math.max(0, Math.ceil(xa));
        var xEnd   = Math.min(W - 1, Math.floor(xb));
        for (var x = xStart; x <= xEnd; x++) {
          var dx = x - ring.cx;
          var d = Math.sqrt(dx * dx + dy2);
          var off = Math.abs(d - radius);
          if (off > BAND) continue;
          // Cosine-shaped feather: smooth, not linear ramps
          var feather = 0.5 + 0.5 * Math.cos((off / BAND) * Math.PI);
          var v = decay * feather;
          var idx = y * W + x;
          buf[idx] += v;
          hueBuf[idx] += ring.hue * v;
          hueWeight[idx] += v;
        }
      }
    }
  }

  // --- render ---
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      var i = y2 * W + x2;
      var v2 = buf[i];
      if (v2 <= 0.05) continue;
      var glyphIdx;
      if (v2 >= 0.9)      glyphIdx = 0; // ─ (interference or fresh-tap center)
      else if (v2 >= 0.45) glyphIdx = 1; // =
      else if (v2 >= 0.20) glyphIdx = 2; // ·
      else                 glyphIdx = 3; // .
      var ch = GLYPHS[glyphIdx];
      var avgHue = (hueWeight[i] > 0 ? (hueBuf[i] / hueWeight[i]) : 200) | 0;
      var clamped = v2 > 1 ? 1 : v2;
      var lit = 25 + (clamped * 50) | 0;
      drawCharHSL(ch, x2, y2, avgHue, 90, lit);
    }
  }
}

registerMode('echo', { init: initEcho, render: renderEcho });
