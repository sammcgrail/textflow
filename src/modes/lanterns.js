import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Sky-lantern festival — warm paper lanterns rise from the bottom of a
// starlit night and drift on a slow wind, flickering as they climb until
// they fade into the dark. Click to release a small flight of lanterns at
// the pointer; hold and drag to pour them into the sky.

var lanCap = 0;
var lanterns = null;
var stars = null;
var lanW = 0, lanH = 0;
var lastAuto = 0;
var lastDrag = 0;

function spawnLantern(x, y) {
  if (lanterns.length >= lanCap) lanterns.shift(); // recycle oldest
  var pink = Math.random() < 0.08;
  lanterns.push({
    x: x,
    y: y,
    vy: -(0.045 + Math.random() * 0.05),          // rise speed
    swayP: Math.random() * Math.PI * 2,            // sway phase
    swayS: 0.6 + Math.random() * 0.7,              // sway speed
    swayA: 0.25 + Math.random() * 0.45,            // sway amplitude
    hue: pink ? 345 + Math.random() * 12 : 24 + Math.random() * 22,
    seed: Math.random() * 1000,
    born: state.time
  });
}

function initLanterns() {
  lanW = state.COLS;
  lanH = state.ROWS;
  lanCap = state.isMobile ? 55 : 120;
  lanterns = [];
  lastAuto = 0;
  lastDrag = 0;

  // fixed star field with twinkle phases
  var nStars = state.isMobile ? 60 : 110;
  stars = new Array(nStars);
  for (var i = 0; i < nStars; i++) {
    stars[i] = {
      x: (Math.random() * lanW) | 0,
      y: (Math.random() * lanH * 0.92) | 0,
      p: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 1.1,
      big: Math.random() < 0.18
    };
  }

  // pre-seed the sky so it opens mid-festival
  var pre = state.isMobile ? 14 : 30;
  for (var k = 0; k < pre; k++) {
    spawnLantern(Math.random() * lanW, lanH * (0.15 + Math.random() * 0.85));
  }
}

function renderLanterns() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!lanterns || lanW !== W || lanH !== H) initLanterns();
  var t = state.time;

  // --- stars (dim, twinkling) ---
  for (var i = 0; i < stars.length; i++) {
    var st = stars[i];
    var tw = 0.5 + 0.5 * Math.sin(t * st.s + st.p);
    var l = 10 + tw * (st.big ? 22 : 12);
    drawCharHSL(st.big ? '+' : '.', st.x, st.y, 220, 30, l | 0);
  }

  // --- releases ---
  // steady festival release from the bottom
  if (t - lastAuto > 0.55) {
    lastAuto = t;
    spawnLantern(2 + Math.random() * (W - 4), H + 1.5);
  }
  // click: a small flight of lanterns at the pointer
  if (pointer.clicked && state.currentMode === 'lanterns') {
    pointer.clicked = false;
    var burst = 4 + (Math.random() * 3) | 0;
    for (var b = 0; b < burst; b++) {
      spawnLantern(pointer.gx + (Math.random() - 0.5) * 8, pointer.gy + (Math.random() - 0.5) * 3);
    }
  }
  // drag: pour lanterns
  if (pointer.down && state.currentMode === 'lanterns' && t - lastDrag > 0.12) {
    lastDrag = t;
    spawnLantern(pointer.gx + (Math.random() - 0.5) * 3, pointer.gy + (Math.random() - 0.5) * 2);
  }

  // --- lanterns ---
  var wind = Math.sin(t * 0.13) * 0.045 + Math.sin(t * 0.041 + 1.7) * 0.03;
  for (var j = lanterns.length - 1; j >= 0; j--) {
    var p = lanterns[j];

    // motion: rise + global wind + individual sway
    p.swayP += p.swayS * 0.016;
    p.x += wind + Math.cos(p.swayP) * p.swayA * 0.05;
    p.y += p.vy;

    // wrap horizontally, retire at the top
    if (p.x < -2) p.x += W + 4;
    if (p.x > W + 2) p.x -= W + 4;
    if (p.y < -3) { lanterns.splice(j, 1); continue; }

    var gx = p.x | 0, gy = p.y | 0;
    var hue = p.hue;

    // altitude 1 (bottom) -> 0 (top): lanterns shrink and dim with height
    var alt = Math.max(0, Math.min(1, p.y / H));
    // candle flicker
    var fl = 0.72 + 0.28 * Math.sin(t * 9 + p.seed) * Math.sin(t * 6.3 + p.seed * 2.1);
    // fade everything out in the top 18% of the sky
    var fade = Math.min(1, alt / 0.18);

    if (alt > 0.55) {
      // near: full lantern — flame, glowing body, paper sides, open mouth, halo
      var bodyL = (40 + 24 * fl) * fade;
      var flameL = (62 + 26 * fl) * fade;
      drawCharHSL('@', gx, gy, hue + 14, 100, flameL | 0);          // flame core
      drawCharHSL('8', gx, gy + 1, hue, 92, bodyL | 0);             // glowing body
      drawCharHSL('(', gx - 1, gy + 1, hue, 80, (bodyL * 0.62) | 0);
      drawCharHSL(')', gx + 1, gy + 1, hue, 80, (bodyL * 0.62) | 0);
      drawCharHSL('v', gx, gy + 2, hue, 70, (bodyL * 0.4) | 0);     // mouth
      // soft halo
      var haloL = (bodyL * 0.22) | 0;
      drawCharHSL('.', gx - 1, gy, hue, 60, haloL);
      drawCharHSL('.', gx + 1, gy, hue, 60, haloL);
    } else if (alt > 0.3) {
      // mid: smaller — flame dot over body
      var l2 = (34 + 22 * fl) * fade;
      drawCharHSL('*', gx, gy, hue + 10, 96, (l2 + 14) | 0);
      drawCharHSL('o', gx, gy + 1, hue, 88, l2 | 0);
    } else if (alt > 0.12) {
      // far: a warm mote
      drawCharHSL('o', gx, gy, hue, 90, ((26 + 16 * fl) * fade) | 0);
    } else {
      // distant spark about to vanish
      drawCharHSL('.', gx, gy, hue, 85, ((16 + 12 * fl) * fade) | 0);
    }
  }
}

registerMode('lanterns', { init: initLanterns, render: renderLanterns });
