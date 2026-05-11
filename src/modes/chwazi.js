import { clearCanvas, drawCharHSL, drawChar } from '../core/draw.js';
import { screenToGrid } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Chwazi-style multi-touch chooser, ASCII-rendered.
// Each finger gets a colored expanding ring of glyphs. Once everyone's
// been still and finger-count is stable for ~1.8s, pick one at random;
// winner's ring grows + flashes, losers shrink + fade. Lift all fingers
// to reset. Mouse fallback for desktop testing (one "touch" only).
//
// Inspired by joelzwarrington/chwazi — same UX as the iOS/Android app
// originally built by ivanseidel.

// ── multi-touch tracking ───────────────────────────────────────────
// Map<touchId, { x, y, gx, gy, hue, age, addedAt }>
var touches = new Map();
var nextHueIdx = 0;
var ROUND_HUES = [0, 45, 130, 200, 270, 320, 20, 90, 170, 240];

// Round state: 'collecting' (still picking up fingers) | 'committed'
// (winner picked, animating result) | 'idle' (no fingers, ready).
var phase = 'idle';
var winnerId = null;
var stableSince = 0;
var winnerAnnouncedAt = 0;

// Click fallback for desktop — emulate a single "finger" via mouse.
var mouseTouchId = '__mouse__';
var mouseDown = false;

function initChwazi() {
  // Reset state but DON'T touch listeners — those are attached once.
  touches.clear();
  phase = 'idle';
  winnerId = null;
  stableSince = 0;
  winnerAnnouncedAt = 0;
  nextHueIdx = 0;
  mouseDown = false;
}

function pickHue() {
  var h = ROUND_HUES[nextHueIdx % ROUND_HUES.length];
  nextHueIdx += 1;
  return h;
}

function addTouch(id, clientX, clientY) {
  if (touches.has(id)) return;
  var g = screenToGrid(clientX, clientY);
  touches.set(id, {
    x: clientX, y: clientY,
    gx: g.gx, gy: g.gy,
    hue: pickHue(),
    age: 0,
    addedAt: state.time
  });
  // Adding/removing fingers resets the stable-count clock.
  stableSince = state.time;
  // Adding a finger after a winner was picked → start a new round.
  if (phase === 'committed') {
    phase = 'collecting';
    winnerId = null;
    winnerAnnouncedAt = 0;
  } else if (phase === 'idle') {
    phase = 'collecting';
  }
}

function moveTouch(id, clientX, clientY) {
  var t = touches.get(id);
  if (!t) return;
  var g = screenToGrid(clientX, clientY);
  t.x = clientX; t.y = clientY;
  t.gx = g.gx; t.gy = g.gy;
}

function removeTouch(id) {
  if (!touches.has(id)) return;
  touches.delete(id);
  stableSince = state.time;
  if (touches.size === 0) {
    phase = 'idle';
    winnerId = null;
    nextHueIdx = 0;
  }
}

// ── attach / lifecycle ─────────────────────────────────────────────
// Listeners are wired ONCE at module load. They only act when mode is
// active so they don't leak side effects into other modes.
function isActive() { return state.currentMode === 'chwazi'; }

function attachChwazi() {
  var canvas = state.canvas || document.body;

  canvas.addEventListener('touchstart', function(e) {
    if (!isActive()) return;
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      addTouch(t.identifier, t.clientX, t.clientY);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    if (!isActive()) return;
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      moveTouch(t.identifier, t.clientX, t.clientY);
    }
  }, { passive: false });

  function endHandler(e) {
    if (!isActive()) return;
    for (var i = 0; i < e.changedTouches.length; i++) {
      removeTouch(e.changedTouches[i].identifier);
    }
  }
  canvas.addEventListener('touchend', endHandler);
  canvas.addEventListener('touchcancel', endHandler);

  // Mouse fallback for desktop testing.
  canvas.addEventListener('mousedown', function(e) {
    if (!isActive()) return;
    mouseDown = true;
    addTouch(mouseTouchId, e.clientX, e.clientY);
  });
  canvas.addEventListener('mousemove', function(e) {
    if (!isActive()) return;
    if (mouseDown) moveTouch(mouseTouchId, e.clientX, e.clientY);
  });
  canvas.addEventListener('mouseup', function() {
    if (!isActive()) return;
    mouseDown = false;
    removeTouch(mouseTouchId);
  });
  canvas.addEventListener('mouseleave', function() {
    if (!isActive()) return;
    mouseDown = false;
    removeTouch(mouseTouchId);
  });
}

// ── render ─────────────────────────────────────────────────────────
var STABILITY_MS = 1800; // ms of stable count before winner picks
var GROW_MS      = 1200; // ms post-pick before result reads as "settled"

function commitWinnerIfReady() {
  if (phase !== 'collecting') return;
  if (touches.size < 2) return; // need 2+ fingers to make sense
  var sinceStable = (state.time - stableSince) * 1000;
  if (sinceStable < STABILITY_MS) return;
  // Pick uniformly at random among current touches.
  var ids = Array.from(touches.keys());
  winnerId = ids[Math.floor(Math.random() * ids.length)];
  phase = 'committed';
  winnerAnnouncedAt = state.time;
}

function renderRing(t, id, isWinner, postPickT) {
  var W = state.COLS, H = state.ROWS;
  // Ring radius ramps up over ~600ms while collecting, then settles.
  var ageMs = (state.time - t.addedAt) * 1000;
  var growT = Math.min(1, ageMs / 600);
  var baseR = 3 + growT * 6; // 3..9 chars

  if (isWinner && postPickT > 0) {
    // Winner: pulse the ring (oscillate radius) — feels alive vs flying off-screen.
    var k = Math.min(1.0, postPickT / 1000);
    var pulse = Math.sin(state.time * 8.0) * 1.5;
    baseR = 9 + k * 4 + pulse;
  } else if (winnerId !== null && !isWinner) {
    // Losers shrink + fade.
    var k = Math.min(1.0, postPickT / 500 * 1000);
    baseR = Math.max(0, 9 - k * 9);
  }

  if (baseR < 1) return;

  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var hue = t.hue;
  var lit = isWinner ? 65 : (winnerId !== null ? 25 : 50);

  // Plot a ring of glyphs at angles around (gx, gy).
  var samples = Math.max(20, Math.floor(baseR * 4));
  for (var i = 0; i < samples; i++) {
    var theta = (i / samples) * Math.PI * 2;
    var dx = Math.cos(theta) * baseR;
    var dy = Math.sin(theta) * baseR / charAspect;
    var x = Math.round(t.gx + dx);
    var y = Math.round(t.gy + dy);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    drawCharHSL('●', x, y, hue, 92, lit | 0);
  }

  // Inner pip at finger center.
  var cx = Math.round(t.gx);
  var cy = Math.round(t.gy);
  if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
    drawCharHSL(isWinner ? '★' : '◆', cx, cy, hue, 100, isWinner ? 75 : 55);
  }
}

// ── winner celebration FX — LOCALIZED around finger press ────────
// Sam's call: keep it tight to the initial finger position. Bright
// shine + glitchy textflow chars in a contained ~14-char halo. No
// screen-wide effects, no centered text — the finger IS the moment.
var WINNER_GLYPHS = ['*', '+', '✦', '✧', '◆', '◇', '○', '●', '★', '☆', '·', '°'];
var GLITCH_GLYPHS = ['/', '\\', '|', '-', '+', 'x', 'X', '#', '$', '%', '&', '?', '!', '~', '=', '<', '>', '^', '*', '◢', '◣', '◤', '◥', '▓', '▒', '░'];

function renderWinnerFX(t, postPickMs) {
  var W = state.COLS, H = state.ROWS;
  var charAspect = (state.CHAR_W || 6) / (state.CHAR_H || 12.5);
  var hue = t.hue;
  var nowS = state.time;

  // Mobile-first scale: derive radii from grid size so the shine
  // stays proportional. mobile portrait textflow ~ 40w × 90h, so
  // min(W,H) ~ 40 → S ~ 1.0. desktop 200w × 80h → S ~ 2.0.
  var S = Math.min(W, H) / 40;
  if (S < 0.7) S = 0.7;
  if (S > 2.2) S = 2.2;

  var seed = (nowS * 30) | 0;
  function pr() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed & 0xffff) / 0xffff; }

  // 1. Multi-ring SHINE — 3 concentric rings, scale-aware radii.
  var ringRs = [2.0 * S, 3.5 * S, 5.5 * S];
  var ringLits = [78, 62, 48];
  for (var ri = 0; ri < ringRs.length; ri++) {
    var rr = ringRs[ri] + Math.sin(nowS * 6 + ri) * 0.3 * S;
    var lit = ringLits[ri];
    var samples = Math.max(20, Math.floor(rr * 7));
    for (var i = 0; i < samples; i++) {
      var theta = (i / samples) * Math.PI * 2 + ri * 0.3 + nowS * 0.5;
      var dx = Math.cos(theta) * rr;
      var dy = Math.sin(theta) * rr / charAspect;
      var x = Math.round(t.gx + dx);
      var y = Math.round(t.gy + dy);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      drawCharHSL('●', x, y, hue, 95, lit);
    }
  }

  // 2. Tight starburst rays — short radial lines, scale-aware length.
  var rayCount = 12;
  var rayLen = Math.max(4, Math.floor(8 * S));
  for (var r = 0; r < rayCount; r++) {
    var theta = (r / rayCount) * Math.PI * 2 + nowS * 0.6;
    for (var d = 1; d < rayLen; d++) {
      var dx = Math.cos(theta) * d;
      var dy = Math.sin(theta) * d / charAspect;
      var x = Math.round(t.gx + dx);
      var y = Math.round(t.gy + dy);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      var lit2 = Math.max(20, 80 - (d / S) * 8);
      var hh = (hue + d * 4 + Math.sin(nowS * 3) * 12 + 360) % 360;
      drawCharHSL('+', x, y, hh, 95, lit2 | 0);
    }
  }

  // 3. Glitch sparks within the halo — count + radius scale with S.
  var sparkN = Math.floor(50 * S);
  var sparkRadMax = 11 * S;
  for (var c = 0; c < sparkN; c++) {
    var rho = Math.pow(pr(), 0.6);
    var rad = 1.5 + rho * sparkRadMax;
    var ang = pr() * Math.PI * 2;
    var dx = Math.cos(ang) * rad;
    var dy = Math.sin(ang) * rad / charAspect;
    var x = Math.round(t.gx + dx);
    var y = Math.round(t.gy + dy);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    var glyph = GLITCH_GLYPHS[(pr() * GLITCH_GLYPHS.length) | 0];
    var hh = (hue + (pr() - 0.5) * 80 + 360) % 360;
    var lit3 = (40 + pr() * 50) | 0;
    drawCharHSL(glyph, x, y, hh | 0, 90, lit3);
  }

  // 4. Halo ring of WINNER_GLYPHS — twinkly stars at radius 7*S.
  var haloN = 30;
  var haloR = 7 * S + Math.sin(nowS * 7) * 0.4 * S;
  for (var h = 0; h < haloN; h++) {
    if (pr() > 0.6) continue;
    var ang = (h / haloN) * Math.PI * 2;
    var dx = Math.cos(ang) * haloR;
    var dy = Math.sin(ang) * haloR / charAspect;
    var x = Math.round(t.gx + dx);
    var y = Math.round(t.gy + dy);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    var glyph = WINNER_GLYPHS[(pr() * WINNER_GLYPHS.length) | 0];
    drawCharHSL(glyph, x, y, hue, 100, 75);
  }

  // 5. Bright pulsing center.
  var cx = Math.round(t.gx);
  var cy = Math.round(t.gy);
  if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
    var pulse = (Math.sin(nowS * 12) + 1) * 0.5;
    var burstChars = ['✦', '✧', '★', '☆', '◉'];
    var burstChar = burstChars[((nowS * 8) | 0) % burstChars.length];
    drawCharHSL(burstChar, cx, cy, hue, 100, (75 + pulse * 20) | 0);
  }
}

function renderHud() {
  var W = state.COLS, H = state.ROWS;
  if (phase === 'idle') {
    var msg = 'press fingers to play';
    var x = ((W - msg.length) / 2) | 0;
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], x + i, (H * 0.5) | 0, 200, 30, 50);
    }
    return;
  }
  if (phase === 'collecting' && touches.size >= 2) {
    var sinceStable = (state.time - stableSince) * 1000;
    var remaining = Math.max(0, STABILITY_MS - sinceStable);
    var s = (remaining / 1000).toFixed(1);
    var label = 'picking in ' + s + 's';
    var x = ((W - label.length) / 2) | 0;
    for (var i = 0; i < label.length; i++) {
      drawCharHSL(label[i], x + i, H - 2, 280, 60, 55);
    }
  } else if (phase === 'collecting' && touches.size === 1) {
    var msg2 = 'add another finger';
    var x = ((W - msg2.length) / 2) | 0;
    for (var i = 0; i < msg2.length; i++) {
      drawCharHSL(msg2[i], x + i, H - 2, 30, 60, 50);
    }
  } else if (phase === 'committed') {
    var msg3 = 'winner — lift all to reset';
    var x = ((W - msg3.length) / 2) | 0;
    for (var i = 0; i < msg3.length; i++) {
      drawCharHSL(msg3[i], x + i, H - 2, 50, 90, 65);
    }
  }
}

function renderChwazi() {
  clearCanvas();
  commitWinnerIfReady();

  var postPickT = phase === 'committed'
    ? (state.time - winnerAnnouncedAt) * 1000
    : 0;

  // Iterate touches and render rings.
  touches.forEach(function(t, id) {
    var isWinner = (id === winnerId);
    renderRing(t, id, isWinner, postPickT);
  });

  // Winner FX: localized shine + glitchy sparkle around the winner finger.
  if (phase === 'committed' && winnerId !== null) {
    var winT = touches.get(winnerId);
    if (winT) renderWinnerFX(winT, postPickT);
  }

  renderHud();
}

registerMode('chwazi', {
  init: initChwazi,
  render: renderChwazi,
  attach: attachChwazi
});
