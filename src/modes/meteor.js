import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// meteor — the New England fireball (May 30 2026) as textflow.
// Bolide-green fireballs streak + airburst; each burst releases a
// sourced fact that flows across the grid. tap/drag to launch.
// Facts honor the guardrails: "broke apart" not "exploded",
// breakup shown as a REGION, size labeled (AMS estimate).
// ============================================================

// Guardrail-compliant fact strings (the textflow content)
var FACTS = [
  'MAY 30 2026  ·  2:06 PM EDT',
  'DAYTIME BOLIDE  ·  ~75,000 MPH',
  'BROKE APART ~40 MI UP',
  'OVER THE MASS / N.H. BORDER — A REGION',
  '~3 FT METEOROID  (AMS ESTIMATE)',
  'ENERGY  26 →  ~300 TONS TNT',
  'SEEN  DELAWARE → MONTREAL',
  'NOT AN EARTHQUAKE — SEISMOGRAPHS FLAT',
  'NASA: NATURAL OBJECT, NOT DEBRIS',
  'LIKELY BURNED UP — ANY SURVIVOR → OCEAN'
];

var mtMeteors, mtSparks, mtRings, mtFlows, mtSpawn, mtFactIdx;

function initMeteor() {
  mtMeteors = [];
  mtSparks = [];
  mtRings = [];
  mtFlows = [];
  mtSpawn = 0.4;
  mtFactIdx = 0;
}

function launchMeteor(tx, ty) {
  var W = state.COLS, H = state.ROWS;
  // enter from upper-left or upper-right, streak toward (tx,ty)
  var fromLeft = Math.random() < 0.5;
  var sx = fromLeft ? -4 : W + 4;
  var sy = -3 + Math.random() * (H * 0.18);
  var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
  var spd = 0.55 + Math.random() * 0.25;
  var fact = FACTS[mtFactIdx % FACTS.length];
  mtFactIdx++;
  mtMeteors.push({
    x: sx, y: sy, vx: dx / d * spd, vy: dy / d * spd,
    trail: [], burstAt: { x: tx, y: ty }, age: 0, fact: fact
  });
}

function airburst(x, y, fact) {
  // shockwave ring
  mtRings.push({ x: x, y: y, r: 0.5, maxr: 9 + Math.random() * 5, age: 0, life: 1.1 });
  // radial sparks
  var n = 26;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 6.283 + Math.random() * 0.3;
    var sp = 0.25 + Math.random() * 0.6;
    mtSparks.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7,
      age: 0, life: 0.7 + Math.random() * 0.7, hot: Math.random() < 0.5
    });
  }
  // release the fact as a flowing string
  if (fact) {
    mtFlows.push({
      text: fact, x: x - fact.length / 2, y: y,
      vx: (Math.random() - 0.5) * 0.12, vy: -0.10 - Math.random() * 0.06,
      age: 0, life: 5.5
    });
  }
}

function renderMeteor() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  if (!mtMeteors) initMeteor();

  // ── starfield (twinkle) ──────────────────────────────
  for (var i = 0; i < 130; i++) {
    var sx = (Math.sin(i * 13.7) * 0.5 + 0.5) * W;
    var sy = (Math.sin(i * 7.3 + 3) * 0.5 + 0.5) * H;
    var px = sx | 0, py = sy | 0;
    var tw = Math.sin(t * 0.7 + i * 1.3) * 0.5 + 0.5;
    if (px >= 0 && px < W && py >= 0 && py < H)
      drawCharHSL(tw > 0.75 ? '+' : '.', px, py, 150, 10, (4 + tw * 7) | 0);
  }

  // ── interaction ──────────────────────────────────────
  if (pointer.clicked && state.currentMode === 'meteor') {
    pointer.clicked = false;
    launchMeteor(pointer.gx, pointer.gy);
  } else if (pointer.down && state.currentMode === 'meteor') {
    for (var i = 0; i < mtMeteors.length; i++) {
      var m = mtMeteors[i];
      var ddx = pointer.gx - m.x, ddy = pointer.gy - m.y;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy) + 1;
      m.vx += ddx / dd * 0.05; m.vy += ddy / dd * 0.05;
    }
  }

  // ── auto-spawn ───────────────────────────────────────
  mtSpawn -= 0.016;
  if (mtSpawn <= 0 && mtMeteors.length < 2) {
    mtSpawn = 2.6 + Math.random() * 1.8;
    launchMeteor(W * (0.32 + Math.random() * 0.36), H * (0.45 + Math.random() * 0.2));
  }

  // ── meteors ──────────────────────────────────────────
  for (var i = mtMeteors.length - 1; i >= 0; i--) {
    var m = mtMeteors[i];
    m.age += 0.016;
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 40) m.trail.shift();
    m.x += m.vx; m.y += m.vy;
    // reached burst point?
    var bdx = m.x - m.burstAt.x, bdy = m.y - m.burstAt.y;
    if ((bdx * m.vx + bdy * m.vy) >= 0 || m.x < -8 || m.x > W + 8 || m.y > H + 8) {
      airburst(m.x, m.y, m.fact);
      mtMeteors.splice(i, 1);
      continue;
    }
    // trail — long, fading, bolide-green into white
    for (var j = 0; j < m.trail.length; j++) {
      var tr = m.trail[j];
      var frac = j / m.trail.length;
      var px = tr.x | 0, py = tr.y | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var bright = frac * frac * 55;
        var ch = frac > 0.85 ? '@' : frac > 0.6 ? '*' : frac > 0.35 ? ':' : frac > 0.15 ? '-' : '.';
        // hotter (whiter) toward the head: drop saturation as frac→1
        var sat = 75 - frac * 45;
        drawCharHSL(ch, px, py, 150, sat | 0, bright | 0);
      }
    }
    // coma glow around head
    var hx = m.x | 0, hy = m.y | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -2; dx <= 2; dx++) {
      var gx = hx + dx, gy = hy + dy;
      var dist = Math.sqrt(dx * dx + dy * dy * 3);
      if (gx >= 0 && gx < W && gy >= 0 && gy < H && dist < 2.5) {
        var b = (1 - dist / 2.5) * 50;
        drawCharHSL(dist < 1 ? '#' : '*', gx, gy, 150, 35, b | 0);
      }
    }
    // white-hot head
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) drawCharHSL('@', hx, hy, 150, 18, 80);
  }

  // ── shockwave rings ──────────────────────────────────
  for (var i = mtRings.length - 1; i >= 0; i--) {
    var rg = mtRings[i];
    rg.age += 0.016; rg.r += 0.45;
    var a = 1 - rg.age / rg.life;
    if (a <= 0 || rg.r > rg.maxr) { mtRings.splice(i, 1); continue; }
    var steps = Math.max(12, (rg.r * 4) | 0);
    for (var s = 0; s < steps; s++) {
      var ang = (s / steps) * 6.283;
      var px = (rg.x + Math.cos(ang) * rg.r) | 0;
      var py = (rg.y + Math.sin(ang) * rg.r * 0.6) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H)
        drawCharHSL(a > 0.6 ? 'o' : '.', px, py, 150, 60, (a * 45) | 0);
    }
  }

  // ── sparks ───────────────────────────────────────────
  for (var i = mtSparks.length - 1; i >= 0; i--) {
    var sp = mtSparks[i];
    sp.age += 0.016;
    sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.02; sp.vx *= 0.985;
    var a = 1 - sp.age / sp.life;
    if (a <= 0) { mtSparks.splice(i, 1); continue; }
    var px = sp.x | 0, py = sp.y | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      var hue = sp.hot ? 45 : 150;          // hot sparks orange, others green
      var satv = sp.hot ? 85 : 70;
      drawCharHSL(a > 0.5 ? '*' : '.', px, py, hue, satv, (a * 55) | 0);
    }
  }

  // ── flowing facts ────────────────────────────────────
  for (var i = mtFlows.length - 1; i >= 0; i--) {
    var fl = mtFlows[i];
    fl.age += 0.016;
    fl.x += fl.vx; fl.y += fl.vy;
    var a = 1 - fl.age / fl.life;
    if (a <= 0) { mtFlows.splice(i, 1); continue; }
    // ease-in the first 0.4s
    var ramp = Math.min(1, fl.age / 0.4);
    var bright = (a * ramp * 60) | 0;
    var baseX = fl.x | 0, row = fl.y | 0;
    for (var c = 0; c < fl.text.length; c++) {
      var ch = fl.text[c];
      if (ch === ' ') continue;
      var px = baseX + c;
      if (px >= 0 && px < W && row >= 0 && row < H) {
        // subtle shimmer along the string
        var shim = Math.sin(t * 3 + c * 0.5) * 6;
        drawCharHSL(ch, px, row, 150, 55, Math.max(0, bright + shim) | 0);
      }
    }
  }
  if (mtFlows.length > 6) mtFlows.splice(0, mtFlows.length - 6);
  if (mtSparks.length > 400) mtSparks.splice(0, mtSparks.length - 400);
}

registerMode('meteor', { init: initMeteor, render: renderMeteor });
