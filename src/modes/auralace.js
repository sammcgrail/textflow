import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Aurora-lace — curl-noise advected particles + twinkling stars + comets.
// Interactions:
//   click         = radial shockwave + color flash
//   double-click  = supernova (all particles recolor + huge ring)
//   hold          = orbital vortex (attraction + tangential swirl)
//   drag          = brush — drag velocity carries particles along, hue picks up
//   release       = fling nearby particles along drag direction
// Autonomous: 3 lissajous emitters roam and spawn particles, so idle still feels alive.

var alParts = null, alStars = null, alComets = null, alEmitters = null;
var alW = 0, alH = 0;
var alShockT = -10, alShockX = 0, alShockY = 0, alShockHue = 200, alShockBig = false;
var alPrevGx = 0, alPrevGy = 0, alPrevDown = false;
var alDragVx = 0, alDragVy = 0;
var alLastClickT = -10;
var alHoldT = 0;
var alBrushHue = 160;

// cheap 2D value noise
function alHash(x, y) {
  var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function alSmooth(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var a = alHash(xi, yi), b = alHash(xi + 1, yi);
  var c = alHash(xi, yi + 1), d = alHash(xi + 1, yi + 1);
  var ux = xf * xf * (3 - 2 * xf), uy = yf * yf * (3 - 2 * yf);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
// curl of a 2D scalar potential → incompressible flow
function alCurl(x, y, t, eps) {
  var p_dy_p = alSmooth(x, y + eps + t) +
               0.5 * alSmooth(x * 2.1 + 7 + t * 0.3, (y + eps) * 2.1) +
               0.25 * alSmooth(x * 4.0, (y + eps) * 4.0 - t * 0.7);
  var p_dy_n = alSmooth(x, y - eps + t) +
               0.5 * alSmooth(x * 2.1 + 7 + t * 0.3, (y - eps) * 2.1) +
               0.25 * alSmooth(x * 4.0, (y - eps) * 4.0 - t * 0.7);
  var p_dx_p = alSmooth(x + eps, y + t) +
               0.5 * alSmooth((x + eps) * 2.1 + 7 + t * 0.3, y * 2.1) +
               0.25 * alSmooth((x + eps) * 4.0, y * 4.0 - t * 0.7);
  var p_dx_n = alSmooth(x - eps, y + t) +
               0.5 * alSmooth((x - eps) * 2.1 + 7 + t * 0.3, y * 2.1) +
               0.25 * alSmooth((x - eps) * 4.0, y * 4.0 - t * 0.7);
  return {
    vx:  (p_dy_p - p_dy_n) / (2 * eps),
    vy: -(p_dx_p - p_dx_n) / (2 * eps)
  };
}

var AL_HUES = [140, 170, 200, 240, 280, 320, 30];

function alPickHue() {
  return AL_HUES[(Math.random() * AL_HUES.length) | 0] + (Math.random() * 18 - 9);
}

function alInit() {
  alW = state.COLS;
  alH = state.ROWS;
  var N = state.isMobile ? 900 : 2200;
  alParts = new Array(N);
  for (var i = 0; i < N; i++) {
    alParts[i] = {
      x: Math.random() * alW,
      y: Math.random() * alH,
      vx: 0, vy: 0,
      life: Math.random() * 80 + 30,
      h: alPickHue()
    };
  }
  // twinkling stars
  var Ns = state.isMobile ? 90 : 210;
  alStars = new Array(Ns);
  for (var j = 0; j < Ns; j++) {
    alStars[j] = {
      x: (Math.random() * alW) | 0,
      y: (Math.random() * alH) | 0,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.4 ? 55 : (Math.random() < 0.5 ? 200 : 320)
    };
  }
  alComets = [];
  // 3 autonomous emitters on lissajous orbits — idle aurora keeps moving
  alEmitters = [
    { ax: 0.5 + Math.random() * 0.3, ay: 0.6 + Math.random() * 0.3,
      kx: 0.31, ky: 0.47, phx: 0.0, phy: 1.3, hue: 180, rate: 3 },
    { ax: 0.4 + Math.random() * 0.4, ay: 0.5 + Math.random() * 0.4,
      kx: 0.23, ky: 0.37, phx: 2.1, phy: 0.5, hue: 280, rate: 3 },
    { ax: 0.5 + Math.random() * 0.3, ay: 0.4 + Math.random() * 0.3,
      kx: 0.19, ky: 0.29, phx: 4.2, phy: 3.9, hue: 60,  rate: 3 }
  ];
  alShockT = -10;
  alPrevDown = false;
  alHoldT = 0;
}

// helper — respawn a random particle at pos with given velocity/hue
function alSpawnAt(cx, cy, vx, vy, hue, jitter, life) {
  var p = alParts[(Math.random() * alParts.length) | 0];
  p.x = cx + (Math.random() - 0.5) * jitter;
  p.y = cy + (Math.random() - 0.5) * jitter;
  p.vx = vx + (Math.random() - 0.5) * 0.3;
  p.vy = vy + (Math.random() - 0.5) * 0.3;
  p.life = life + Math.random() * 30;
  p.h = hue + (Math.random() * 20 - 10);
}

function alRender() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!alParts || alW !== W || alH !== H) alInit();
  var t = state.time;

  // ─── pointer bookkeeping ─────────────────────────
  var px = pointer.gx, py = pointer.gy;
  var rawDx = px - alPrevGx, rawDy = py - alPrevGy;
  // smooth drag velocity (EMA)
  alDragVx = alDragVx * 0.6 + rawDx * 0.4;
  alDragVy = alDragVy * 0.6 + rawDy * 0.4;
  var dragSpeed = Math.sqrt(alDragVx * alDragVx + alDragVy * alDragVy);

  var mine = state.currentMode === 'auralace';

  // drag-brush hue cycles while holding → painterly feel
  if (mine && pointer.down) {
    alHoldT += 1;
    alBrushHue = (alBrushHue + 0.6 + dragSpeed * 0.2) % 360;
  } else {
    alHoldT = 0;
  }

  // click → shockwave (double-tap = supernova)
  if (pointer.clicked && mine) {
    pointer.clicked = false;
    var isDouble = (t - alLastClickT) < 0.45;
    alShockT = t;
    alShockX = px;
    alShockY = py;
    alShockHue = alBrushHue;
    alShockBig = isDouble;
    alLastClickT = t;
    // supernova recolors many particles
    if (isDouble) {
      for (var rc = 0; rc < (alParts.length * 0.4) | 0; rc++) {
        alParts[(Math.random() * alParts.length) | 0].h = alShockHue + (Math.random() * 40 - 20);
      }
    }
  }

  // release → fling nearby particles along last drag direction
  if (mine && alPrevDown && !pointer.down && dragSpeed > 0.2) {
    var flingRadius = 12;
    var fr2 = flingRadius * flingRadius;
    var kick = Math.min(3, dragSpeed * 2.0);
    for (var fi = 0; fi < alParts.length; fi++) {
      var fp = alParts[fi];
      var fdx = fp.x - px, fdy = fp.y - py;
      var fd2 = fdx * fdx + fdy * fdy;
      if (fd2 > fr2) continue;
      var fFall = 1 - Math.sqrt(fd2) / flingRadius;
      fp.vx += (alDragVx / (dragSpeed + 0.001)) * kick * fFall;
      fp.vy += (alDragVy / (dragSpeed + 0.001)) * kick * fFall;
    }
  }

  // hold = orbital vortex: attraction + tangential swirl on nearby particles
  if (mine && pointer.down) {
    var vR = 14;
    var vR2 = vR * vR;
    var strength = Math.min(1, alHoldT / 20); // ramps up over ~20 frames
    for (var vi = 0; vi < alParts.length; vi++) {
      var vp = alParts[vi];
      var vdx = vp.x - px, vdy = vp.y - py;
      var vd2 = vdx * vdx + vdy * vdy;
      if (vd2 > vR2) continue;
      var vd = Math.sqrt(vd2) + 0.001;
      var falloff = 1 - vd / vR;
      // radial inward
      var ax = -(vdx / vd) * 0.35 * falloff * strength;
      var ay = -(vdy / vd) * 0.35 * falloff * strength;
      // tangential (perpendicular) for swirl
      ax += -(vdy / vd) * 0.55 * falloff * strength;
      ay +=  (vdx / vd) * 0.55 * falloff * strength;
      vp.vx += ax;
      vp.vy += ay;
      // particles in vortex pick up brush hue gradually
      vp.h = vp.h * 0.9 + alBrushHue * 0.1;
    }
  }

  // drag = brush: impart drag-velocity to particles in a streak under pointer
  if (mine && pointer.down && dragSpeed > 0.15) {
    var bCount = Math.min(10, 2 + (dragSpeed * 3) | 0);
    for (var kb = 0; kb < bCount; kb++) {
      alSpawnAt(px, py, alDragVx * 0.7, alDragVy * 0.7,
                alBrushHue, 3.5, 60);
    }
  }

  // autonomous emitters — keep the scene alive even when idle
  for (var e = 0; e < alEmitters.length; e++) {
    var em = alEmitters[e];
    var ex = alW * (0.5 + 0.35 * Math.sin(t * em.kx + em.phx));
    var ey = alH * (0.5 + 0.35 * Math.sin(t * em.ky + em.phy));
    em.hue = (em.hue + 0.4) % 360;
    for (var er = 0; er < em.rate; er++) {
      alSpawnAt(ex, ey,
                Math.cos(t * 0.4 + e) * 0.3,
                Math.sin(t * 0.4 + e) * 0.3,
                em.hue, 4, 60);
    }
  }

  // comets
  if (Math.random() < 0.012 && alComets.length < 3) {
    var fromLeft = Math.random() < 0.5;
    alComets.push({
      x: fromLeft ? -4 : W + 4,
      y: Math.random() * H * 0.7,
      vx: (fromLeft ? 1 : -1) * (0.6 + Math.random() * 0.8),
      vy: (Math.random() - 0.5) * 0.3,
      age: 0,
      hue: (Math.random() * 360) | 0
    });
  }

  // ─── rendering ───────────────────────────────────

  // stars twinkle
  for (var s = 0; s < alStars.length; s++) {
    var st = alStars[s];
    var tw = 0.5 + 0.5 * Math.sin(t * 2.2 + st.phase);
    var stL = 35 + (tw * 45) | 0;
    drawCharHSL(tw > 0.85 ? '+' : '.', st.x, st.y, st.hue, 70, stL);
  }

  // comets trail
  for (var c = 0; c < alComets.length; c++) {
    var cm = alComets[c];
    cm.x += cm.vx; cm.y += cm.vy; cm.age++;
    for (var tr = 0; tr < 12; tr++) {
      var tx = (cm.x - cm.vx * tr * 0.9) | 0;
      var ty = (cm.y - cm.vy * tr * 0.9) | 0;
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      var fade = 85 - tr * 6;
      if (fade < 30) continue;
      drawCharHSL(tr < 2 ? '*' : tr < 6 ? '~' : '.', tx, ty, cm.hue, 90, fade);
    }
    if (cm.x < -8 || cm.x > W + 8) { alComets.splice(c, 1); c--; }
  }

  // shockwave ring (color flash)
  var shockAge = t - alShockT;
  var shockMax = alShockBig ? 3.4 : 2.2;
  var shockRate = alShockBig ? 36 : 24;
  var shockR = shockAge * shockRate;
  var shockActive = shockAge > 0 && shockAge < shockMax;
  if (shockActive) {
    // draw visible annulus of chars
    var ringLight = Math.max(40, 90 - (shockAge / shockMax) * 60) | 0;
    var ringChars = '*+~.';
    var steps = Math.max(24, shockR * 2.2) | 0;
    for (var rs = 0; rs < steps; rs++) {
      var ang = (rs / steps) * Math.PI * 2;
      var rrx = (alShockX + Math.cos(ang) * shockR) | 0;
      var rry = (alShockY + Math.sin(ang) * shockR) | 0;
      if (rrx < 0 || rrx >= W || rry < 0 || rry >= H) continue;
      var rCh = ringChars[(shockAge * 12 + rs) % ringChars.length | 0];
      drawCharHSL(rCh, rrx, rry, (alShockHue + shockAge * 40) % 360, 94, ringLight);
    }
  }

  // main particles: curl-noise advected
  var scale = 0.08;
  var hueDrift = (t * 24) % 360;
  for (var i = 0; i < alParts.length; i++) {
    var pt = alParts[i];
    var flow = alCurl(pt.x * scale, pt.y * scale, t * 0.18, 0.35);
    pt.vx = pt.vx * 0.84 + flow.vx * 0.6;
    pt.vy = pt.vy * 0.84 + flow.vy * 0.6;

    // shockwave kick
    if (shockActive) {
      var sdx = pt.x - alShockX, sdy = pt.y - alShockY;
      var sd = Math.sqrt(sdx * sdx + sdy * sdy) + 0.001;
      var ringDist = Math.abs(sd - shockR);
      var ringWidth = alShockBig ? 6.0 : 4.0;
      if (ringDist < ringWidth) {
        var push = (ringWidth - ringDist) * (alShockBig ? 1.2 : 0.9);
        pt.vx += (sdx / sd) * push;
        pt.vy += (sdy / sd) * push;
        // hue flash
        pt.h = pt.h * 0.7 + alShockHue * 0.3;
      }
    }

    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;
    if (pt.life <= 0 || pt.x < -2 || pt.x >= W + 2 || pt.y < -2 || pt.y >= H + 2) {
      pt.x = Math.random() * W;
      pt.y = Math.random() * H;
      pt.vx = 0; pt.vy = 0;
      pt.life = 30 + Math.random() * 80;
      pt.h = alPickHue();
      continue;
    }
    var gx = pt.x | 0, gy = pt.y | 0;
    if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;
    var spd = Math.sqrt(pt.vx * pt.vx + pt.vy * pt.vy);
    var bright = Math.min(1, spd * 0.9 + 0.25);
    var ch = bright > 0.8 ? '@' : bright > 0.55 ? '*' : bright > 0.35 ? '+' : '.';
    var light = 45 + (bright * 40) | 0;
    drawCharHSL(ch, gx, gy, (((pt.h + hueDrift) | 0) + 360) % 360, 92, light);
  }

  // pointer aura — always visible while holding
  if (mine && pointer.down) {
    var auraPulse = 0.5 + 0.5 * Math.sin(t * 6);
    var auraR = 3 + auraPulse * 1.5;
    // inner cross
    var pgx = px | 0, pgy = py | 0;
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) {
      drawCharHSL('@', pgx, pgy, alBrushHue | 0, 95, 78);
    }
    // outer ring
    var auraSteps = 18;
    for (var aa = 0; aa < auraSteps; aa++) {
      var aang = (aa / auraSteps) * Math.PI * 2 + t * 2;
      var arx = (px + Math.cos(aang) * auraR) | 0;
      var ary = (py + Math.sin(aang) * auraR) | 0;
      if (arx < 0 || arx >= W || ary < 0 || ary >= H) continue;
      drawCharHSL(auraPulse > 0.5 ? '*' : '+', arx, ary,
                  ((alBrushHue + 30) | 0) % 360, 90, 55 + ((auraPulse * 20) | 0));
    }
  }

  // ─── remember pointer for next frame ──
  alPrevGx = px;
  alPrevGy = py;
  alPrevDown = pointer.down;
}

registerMode('auralace', { init: alInit, render: alRender });
